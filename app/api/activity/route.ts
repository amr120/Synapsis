import { NextResponse } from "next/server";
import { listEvents, listListings, listPurchases, listRatings, logEvent, type ActivityEvent } from "@/lib/market/store";

export const dynamic = "force-dynamic";

let backfilled = false;

/** First run only: rebuild the feed from what already happened (listings, Vine verdicts, purchases, ratings). */
async function backfill() {
  if (backfilled) return;
  backfilled = true;
  if ((await listEvents(1)).length > 0) return;
  const [listings, purchases] = await Promise.all([listListings(500, { includeSuppressed: true }), listPurchases(1000)]);
  const ratings = (await Promise.all(listings.map((l) => listRatings(l.id)))).flat();
  const title = new Map(listings.map((l) => [l.id, l.title]));
  const past: Omit<ActivityEvent, "id">[] = [
    ...listings.map((l) => ({ at: l.createdAt, type: "list" as const, actor: l.sellerName, subject: l.title, detail: `$${l.priceUsd}`, listingId: l.id })),
    ...listings.filter((l) => l.attestation).map((l) => ({ at: l.attestation!.attestedAt, type: l.attestation!.compliance === "pass" ? ("vine-pass" as const) : ("vine-fail" as const), actor: l.attestation!.verifier, subject: l.title, detail: `${l.attestation!.score}/100`, listingId: l.id, transaction: l.attestation!.transaction })),
    ...purchases.map((p) => ({ at: p.createdAt, type: "buy" as const, actor: p.payer ?? "agent", subject: p.title, detail: `$${p.priceUsd}${p.verified ? " ✓" : " ✗"}`, listingId: p.listingId, transaction: p.transaction })),
    ...ratings.map((r) => ({ at: r.createdAt, type: "rate" as const, actor: r.rater ?? "agent", subject: title.get(r.listingId) ?? r.listingId, detail: `★ ${r.rating}`, listingId: r.listingId, transaction: r.transaction })),
  ].sort((a, b) => a.at.localeCompare(b.at));
  for (const e of past) await logEvent(e);
}

// GET /api/activity?limit=30: the live feed of what agents are doing, newest first.
export async function GET(request: Request) {
  await backfill();
  const limit = Math.min(100, Number(new URL(request.url).searchParams.get("limit")) || 30);
  return NextResponse.json({ events: await listEvents(limit) }, { headers: { "cache-control": "no-store" } });
}
