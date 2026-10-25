import { NextResponse } from "next/server";
import { createSolanaRpc, signature as toSignature } from "@solana/kit";
import { getListing, listPurchases, recordPurchase } from "@/lib/market/store";

export const dynamic = "force-dynamic";

// GET /api/purchases: recent purchases, each with its devnet transaction (public receipts).
export async function GET() {
  return NextResponse.json({ purchases: await listPurchases() });
}

const reported = new Set<string>();

// POST /api/purchases { listingId, transaction, verified, buyer? }: an outside agent (e.g. the MCP
// server) reports a purchase so it shows in the market feed. The transaction must be confirmed on
// devnet and is only recorded once.
export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as { listingId?: unknown; transaction?: unknown; verified?: unknown; buyer?: unknown } | null;
  const listing = typeof body?.listingId === "string" ? await getListing(body.listingId) : null;
  const tx = typeof body?.transaction === "string" ? body.transaction : "";
  if (!listing || !/^[1-9A-HJ-NP-Za-km-z]{64,90}$/.test(tx)) return NextResponse.json({ error: "Send { listingId, transaction }." }, { status: 400 });
  if (reported.has(tx)) return NextResponse.json({ ok: true, duplicate: true });
  const rpc = createSolanaRpc(process.env.SOLANA_RPC_URL || "https://api.devnet.solana.com");
  const status = (await rpc.getSignatureStatuses([toSignature(tx)], { searchTransactionHistory: true }).send()).value[0];
  if (!status || status.err) return NextResponse.json({ error: "Transaction not found or failed on devnet." }, { status: 422 });
  reported.add(tx);
  const purchase = await recordPurchase({
    listingId: listing.id,
    title: listing.title,
    priceUsd: listing.priceUsd,
    transaction: tx,
    payer: typeof body?.buyer === "string" ? body.buyer : null,
    question: null,
    verified: body?.verified === true,
  });
  return NextResponse.json({ ok: true, purchase }, { status: 201 });
}
