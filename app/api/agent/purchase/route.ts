import { NextResponse } from "next/server";
import { buyListing } from "@/lib/market/buyer";
import { getListing } from "@/lib/market/store";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

// POST /api/agent/purchase { listingId }: the server-side agent buys one listing over x402.
export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as { listingId?: unknown } | null;
  const listing = typeof body?.listingId === "string" ? await getListing(body.listingId) : null;
  if (!listing) return NextResponse.json({ error: "Unknown listingId." }, { status: 404 });
  try {
    return NextResponse.json(await buyListing(listing));
  } catch (err) {
    console.error("[purchase] failed:", err);
    return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 });
  }
}
