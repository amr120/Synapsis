import { NextResponse } from "next/server";
import { enrichAndReview } from "@/lib/market/vine";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

// POST /api/listings/:id/verify: run the Vine verifier now (structured metadata + review +
// on-chain attestation). New listings get this automatically; this re-runs it on demand.
export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const listing = await enrichAndReview((await params).id);
    return NextResponse.json({ id: listing.id, status: listing.status, suppressedReason: listing.suppressedReason ?? null, attestation: listing.attestation, capabilities: listing.capabilities });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 });
  }
}
