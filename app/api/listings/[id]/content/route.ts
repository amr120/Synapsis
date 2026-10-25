import { NextResponse, type NextRequest } from "next/server";
import { contentHandler } from "@/lib/market/paywall";
import { getListing } from "@/lib/market/store";
import { PaymentsConfigError } from "@/lib/payments/config";

export const dynamic = "force-dynamic";

// GET /api/listings/:id/content: the Markdown itself, behind an x402 paywall (402 → pay → 200).
export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const listing = await getListing((await params).id);
  if (!listing) return NextResponse.json({ error: "No such listing" }, { status: 404 });
  try {
    return await contentHandler(listing)(request);
  } catch (err) {
    if (err instanceof PaymentsConfigError) return NextResponse.json({ error: err.message }, { status: 500 });
    throw err;
  }
}
