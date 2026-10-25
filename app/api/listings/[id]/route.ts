import { NextResponse } from "next/server";
import { signalsFor, summarize, trustOf } from "@/lib/market/ranking";
import { getListing, listPurchases, listRatings } from "@/lib/market/store";

export const dynamic = "force-dynamic";

// GET /api/listings/:id: free metadata, trust signals, Vine attestation and Verified Ratings.
// Works for suppressed listings too (they're only hidden from discovery), with the reason.
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const listing = await getListing((await params).id);
  if (!listing) return NextResponse.json({ error: "No such listing" }, { status: 404 });
  const [ratings, purchases] = await Promise.all([listRatings(listing.id), listPurchases(500)]);
  const signals = signalsFor(listing, ratings, purchases);
  return NextResponse.json({ ...listing, trust: trustOf(signals), signals, verifiedRating: summarize(ratings), recentRatings: ratings.slice(0, 10) });
}
