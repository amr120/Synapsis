import "server-only";
import { getSellerProfile, listListings, listPurchases, listRatings, type Listing, type Purchase, type Rating, type SellerProfile } from "./store";

// Seller reliability: the agent-market version of a seller rating. A seller is identified by the
// wallet it gets paid to, so its record can't be shed by renaming. The score aggregates evidence
// across all of the seller's files, including suppressed ones:
//   buyer satisfaction  0.35  Verified Ratings across all its files (Bayesian-smoothed)
//   compliance record   0.25  share of its files that passed Vine compliance and were never suppressed
//   Vine quality        0.20  average Vine score of its reviewed files
//   delivery integrity  0.10  share of paid deliveries whose sha256 matched the listing
//   track record        0.10  number of paid sales (log-scaled)

export const RELIABILITY_WEIGHTS = { satisfaction: 0.35, compliance: 0.25, quality: 0.2, integrity: 0.1, trackRecord: 0.1 } as const;
export type ReliabilityComponent = keyof typeof RELIABILITY_WEIGHTS;
export type SellerTier = "Top Rated Seller" | "Reliable" | "New seller" | "Caution";

export interface SellerStats {
  wallet: string;
  name: string;
  bio: string;
  specialties: string[];
  since: string;
  listings: number;
  activeListings: number;
  suppressedListings: number;
  sales: number;
  earningsUsd: number;
  ratings: { count: number; average: number | null };
  vineAverage: number | null;
  integrityRate: number | null;
  components: Record<ReliabilityComponent, number>;
  /** 0-100 */
  reliability: number;
  tier: SellerTier;
}

const clamp = (x: number) => Math.max(0, Math.min(1, x));

export function computeSeller(wallet: string, listings: Listing[], ratings: Rating[], purchases: Purchase[], profile: SellerProfile | null): SellerStats {
  const mine = listings.filter((l) => l.sellerWallet === wallet);
  const ids = new Set(mine.map((l) => l.id));
  const myRatings = ratings.filter((r) => ids.has(r.listingId));
  const myPurchases = purchases.filter((p) => ids.has(p.listingId));
  const reviewed = mine.filter((l) => l.attestation);
  const suppressed = mine.filter((l) => l.status === "suppressed");
  const clean = mine.filter((l) => l.status !== "suppressed" && l.attestation?.compliance !== "fail");
  const sales = mine.reduce((s, l) => s + l.sales, 0);

  const sum = myRatings.reduce((s, r) => s + r.rating, 0);
  const smoothed = (3.5 * 2 + sum) / (2 + myRatings.length);
  const vineAverage = reviewed.length ? Math.round(reviewed.reduce((s, l) => s + l.attestation!.score, 0) / reviewed.length) : null;
  const integrityRate = myPurchases.length ? myPurchases.filter((p) => p.verified).length / myPurchases.length : null;

  const components: Record<ReliabilityComponent, number> = {
    satisfaction: clamp((smoothed - 1) / 4),
    compliance: mine.length ? clean.length / mine.length : 0.7,
    quality: vineAverage === null ? 0.5 : vineAverage / 100,
    integrity: integrityRate ?? 1,
    trackRecord: clamp(Math.log1p(sales) / Math.log1p(50)),
  };
  const reliability = Math.round((Object.keys(RELIABILITY_WEIGHTS) as ReliabilityComponent[]).reduce((t, k) => t + RELIABILITY_WEIGHTS[k] * components[k], 0) * 100);

  // Tiers, like a marketplace seller badge: any compliance strike means Caution; too little evidence means New.
  let tier: SellerTier;
  if (suppressed.length > 0 || mine.some((l) => l.attestation?.compliance === "fail")) tier = "Caution";
  else if (myRatings.length < 3 && sales < 5) tier = "New seller";
  else if (reliability >= 80 && (myRatings.length ? sum / myRatings.length : 0) >= 4) tier = "Top Rated Seller";
  else if (reliability >= 65) tier = "Reliable";
  else tier = "Caution";

  const first = mine.map((l) => l.createdAt).sort()[0];
  return {
    wallet,
    name: profile?.name ?? mine[0]?.sellerName ?? "unknown seller",
    bio: profile?.bio ?? "",
    specialties: profile?.specialties ?? [...new Set(mine.map((l) => l.topic))].slice(0, 5),
    since: profile?.createdAt ?? first ?? new Date().toISOString(),
    listings: mine.length,
    activeListings: mine.length - suppressed.length,
    suppressedListings: suppressed.length,
    sales,
    earningsUsd: Math.round(mine.reduce((s, l) => s + l.sales * l.priceUsd, 0) * 100) / 100,
    ratings: { count: myRatings.length, average: myRatings.length ? Math.round((sum / myRatings.length) * 10) / 10 : null },
    vineAverage,
    integrityRate,
    components,
    reliability,
    tier,
  };
}

/** Every seller with at least one listing (suppressed included: a seller can't hide its record). */
export async function listSellers(): Promise<SellerStats[]> {
  const [listings, purchases] = await Promise.all([listListings(500, { includeSuppressed: true }), listPurchases(1000)]);
  const ratings = (await Promise.all(listings.map((l) => listRatings(l.id)))).flat();
  const wallets = [...new Set(listings.map((l) => l.sellerWallet))];
  const profiles = await Promise.all(wallets.map(getSellerProfile));
  return wallets.map((w, i) => computeSeller(w, listings, ratings, purchases, profiles[i])).sort((a, b) => b.reliability - a.reliability);
}

export async function getSeller(wallet: string): Promise<{ stats: SellerStats; listings: Listing[]; recentRatings: Rating[] } | null> {
  const [all, purchases, profile] = await Promise.all([listListings(500, { includeSuppressed: true }), listPurchases(1000), getSellerProfile(wallet)]);
  const mine = all.filter((l) => l.sellerWallet === wallet);
  if (mine.length === 0 && !profile) return null;
  const ratings = (await Promise.all(mine.map((l) => listRatings(l.id)))).flat().sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  return { stats: computeSeller(wallet, all, ratings, purchases, profile), listings: mine, recentRatings: ratings.slice(0, 10) };
}

/** Reliability (0-1) per seller wallet, for the ranking's seller signal. */
export async function reliabilityByWallet(): Promise<Map<string, SellerStats>> {
  return new Map((await listSellers()).map((s) => [s.wallet, s]));
}
