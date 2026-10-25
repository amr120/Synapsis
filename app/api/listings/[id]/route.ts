import { NextResponse } from "next/server";
import { signalsFor, summarize, trustOf } from "@/lib/market/ranking";
import { getSeller } from "@/lib/market/sellers";
import { getListing, listPurchases, listRatings } from "@/lib/market/store";

export const dynamic = "force-dynamic";

// GET /api/listings/:id: free metadata, trust signals, Vine attestation and Verified Ratings.
// Works for suppressed listings too (they're only hidden from discovery), with the reason.
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const listing = await getListing((await params).id);
  if (!listing) return NextResponse.json({ error: "No such listing" }, { status: 404 });
  const [ratings, purchases, seller] = await Promise.all([listRatings(listing.id), listPurchases(500), getSeller(listing.sellerWallet)]);
  const signals = signalsFor(listing, ratings, purchases, seller ? seller.stats.reliability / 100 : 0.5);
  const sellerSummary = seller ? { name: seller.stats.name, reliability: seller.stats.reliability, tier: seller.stats.tier, profile: `/api/sellers/${listing.sellerWallet}` } : null;
  return NextResponse.json({ ...listing, trust: trustOf(signals), signals, seller: sellerSummary, verifiedRating: summarize(ratings), recentRatings: ratings.slice(0, 10) });
}
