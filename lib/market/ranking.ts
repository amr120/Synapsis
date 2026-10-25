import "server-only";
import { reliabilityByWallet, type SellerTier } from "./sellers";
import { logEvent, addRating, getListing, listListings, listPurchases, listRatings, relevance, updateListing, type Listing, type Purchase, type Rating } from "./store";

// Synapsis's take on Amazon's playbook, for agent buyers:
//  - Multi-signal ranking (A9): a composite trust score from seven signals, so no single number can be gamed.
//  - Buy Box: one default pick per query, which agents can override.
//  - Verified Rating: only a recorded, paid purchase (an on-chain x402 transaction) can rate a file.
//  - Suppression: flagged files leave discovery but stay reachable by id with the reason shown.

export const WEIGHTS = {
  satisfaction: 0.2, // Verified Ratings, Bayesian-smoothed
  attestation: 0.2, // Vine verifier score
  seller: 0.1, // the seller agent's reliability across all its files
  sourceDensity: 0.1, // citations per 1,000 words
  compliance: 0.1, // Vine compliance checks
  earnings: 0.1, // revenue earned so far (proof others paid for it)
  velocity: 0.1, // purchases in the last 24 hours
  price: 0.1, // cheaper is better, all else equal
} as const;

export type SignalName = keyof typeof WEIGHTS;

export interface RatingSummary {
  count: number;
  average: number | null;
}

export interface Ranked {
  listing: Listing;
  seller: { name: string; reliability: number; tier: SellerTier } | null;
  signals: Record<SignalName, number>;
  trust: number;
  relevance: number;
  rank: number;
  ratings: RatingSummary;
  isNew: boolean;
}

const clamp = (x: number) => Math.max(0, Math.min(1, x));
const DAY = 24 * 3600 * 1000;

export function summarize(ratings: Rating[]): RatingSummary {
  if (ratings.length === 0) return { count: 0, average: null };
  return { count: ratings.length, average: Math.round((ratings.reduce((s, r) => s + r.rating, 0) / ratings.length) * 10) / 10 };
}

export function signalsFor(l: Listing, ratings: Rating[], purchases: Purchase[], sellerReliability = 0.5): Record<SignalName, number> {
  const PRIOR_MEAN = 3.5;
  const PRIOR_WEIGHT = 2;
  const sum = ratings.reduce((s, r) => s + r.rating, 0);
  const smoothed = (PRIOR_MEAN * PRIOR_WEIGHT + sum) / (PRIOR_WEIGHT + ratings.length);
  const words = l.capabilities?.wordCount ?? Math.max(1, l.bytes / 6);
  const citations = l.capabilities?.citationCount ?? l.sources.length;
  const recent = purchases.filter((p) => p.listingId === l.id && Date.now() - Date.parse(p.createdAt) < DAY).length;
  return {
    satisfaction: clamp((smoothed - 1) / 4),
    attestation: l.attestation ? l.attestation.score / 100 : 0.5,
    seller: clamp(sellerReliability),
    sourceDensity: clamp((citations / Math.max(1, words)) * 1000 / 10),
    compliance: l.attestation ? (l.attestation.compliance === "pass" ? 1 : 0) : 0.7,
    earnings: clamp(Math.log1p(l.sales * l.priceUsd * 100) / Math.log1p(100)),
    velocity: clamp(recent / 5),
    price: clamp(1 - l.priceUsd / 0.1),
  };
}

export const trustOf = (s: Record<SignalName, number>) =>
  Math.round((Object.keys(WEIGHTS) as SignalName[]).reduce((t, k) => t + WEIGHTS[k] * s[k], 0) * 1000) / 1000;

/** Ranks discoverable listings for a query (or overall without one). Relevance gates, trust decides. */
export async function rankListings(query?: string, opts: { seller?: string } = {}): Promise<Ranked[]> {
  const [listings, purchases, sellers] = await Promise.all([listListings(200, { seller: opts.seller }), listPurchases(500), reliabilityByWallet()]);
  const rows = await Promise.all(
    listings.map(async (listing) => {
      const ratings = await listRatings(listing.id);
      const seller = sellers.get(listing.sellerWallet);
      const signals = signalsFor(listing, ratings, purchases, seller ? seller.reliability / 100 : 0.5);
      return { listing, seller: seller ? { name: seller.name, reliability: seller.reliability, tier: seller.tier } : null, signals, trust: trustOf(signals), relevance: query ? relevance(listing, query) : 1, ratings: summarize(ratings), isNew: !listing.attestation && ratings.length === 0 };
    }),
  );
  const matched = rows.filter((r) => r.relevance > 0);
  const maxRel = Math.max(1, ...matched.map((r) => r.relevance));
  return matched
    .map((r) => ({ ...r, relevance: r.relevance / maxRel, rank: Math.round((0.6 * (r.relevance / maxRel) + 0.4 * r.trust) * 1000) / 1000 }))
    .sort((a, b) => b.rank - a.rank);
}

/**
 * The Buy Box: one default listing for the query. Only strongly relevant, compliant, active files
 * compete; among them the highest trust wins. Agents can always buy another listing instead.
 */
export function buyBox(ranked: Ranked[]): { winner: Ranked; reason: string } | null {
  const eligible = ranked.filter((r) => r.relevance >= 0.6 && r.listing.status !== "suppressed" && r.listing.attestation?.compliance !== "fail");
  if (eligible.length === 0) return null;
  const winner = [...eligible].sort((a, b) => b.trust - a.trust || b.relevance - a.relevance)[0];
  const top = (Object.keys(WEIGHTS) as SignalName[]).sort((a, b) => WEIGHTS[b] * winner.signals[b] - WEIGHTS[a] * winner.signals[a]).slice(0, 2);
  return { winner, reason: `Highest trust (${winner.trust}) among ${eligible.length} relevant file(s); strongest signals: ${top.join(", ")}.` };
}

/** Verified Rating: bound to a paid purchase of this listing; one rating per transaction. */
export async function rateListing(input: { listingId: string; transaction: string; rating: number; comment?: string; rater?: string | null }): Promise<Rating> {
  const listing = await getListing(input.listingId);
  if (!listing) throw new Error("No such listing");
  if (!Number.isInteger(input.rating) || input.rating < 1 || input.rating > 5) throw new Error("rating must be an integer from 1 to 5");
  const purchase = (await listPurchases(1000)).find((p) => p.listingId === input.listingId && p.transaction === input.transaction);
  if (!purchase) throw new Error("No paid purchase of this listing with that transaction: only verified buyers can rate.");
  const existing = await listRatings(input.listingId);
  if (existing.some((r) => r.transaction === input.transaction)) throw new Error("This purchase has already been rated.");
  const rating = await addRating({ listingId: input.listingId, transaction: input.transaction, rating: input.rating, comment: (input.comment ?? "").slice(0, 500), rater: input.rater ?? purchase.payer });
  await logEvent({ type: "rate", actor: rating.rater ?? "agent", subject: listing.title, detail: `★ ${rating.rating}`, listingId: listing.id, transaction: rating.transaction });

  // Suppress files that verified buyers consistently rate poorly (hidden from discovery, not deleted).
  const s = summarize([rating, ...existing]);
  if (s.count >= 3 && (s.average ?? 5) < 2 && listing.status !== "suppressed") {
    await updateListing({ ...listing, status: "suppressed", suppressedReason: `Verified Rating average ${s.average}★ over ${s.count} purchases` });
    await logEvent({ type: "suppressed", actor: "synapsis", subject: listing.title, detail: `${s.average}★ avg`, listingId: listing.id });
  }
  return rating;
}
