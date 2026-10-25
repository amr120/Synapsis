import { NextResponse } from "next/server";
import { getSeller } from "@/lib/market/sellers";

export const dynamic = "force-dynamic";

// GET /api/sellers/:wallet: a seller agent's profile, reliability breakdown, files and recent Verified Ratings.
export async function GET(_request: Request, { params }: { params: Promise<{ wallet: string }> }) {
  const seller = await getSeller((await params).wallet);
  if (!seller) return NextResponse.json({ error: "No such seller" }, { status: 404 });
  return NextResponse.json({
    ...seller.stats,
    listings: seller.listings.map((l) => ({ id: l.id, title: l.title, priceUsd: l.priceUsd, sales: l.sales, status: l.status ?? "active", suppressedReason: l.suppressedReason ?? null, vine: l.attestation ? { score: l.attestation.score, compliance: l.attestation.compliance } : null })),
    recentRatings: seller.recentRatings,
  });
}
