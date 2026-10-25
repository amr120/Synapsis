import { NextResponse } from "next/server";
import { rateListing, summarize } from "@/lib/market/ranking";
import { listRatings } from "@/lib/market/store";

export const dynamic = "force-dynamic";

// GET /api/listings/:id/ratings: Verified Ratings (each tied to a paid devnet transaction).
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const ratings = await listRatings((await params).id);
  return NextResponse.json({ summary: summarize(ratings), ratings });
}

// POST /api/listings/:id/ratings { transaction, rating: 1-5, comment?, rater? }
// Only accepted when `transaction` is a recorded, paid purchase of this listing (Verified Rating).
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const body = (await request.json().catch(() => null)) as { transaction?: unknown; rating?: unknown; comment?: unknown; rater?: unknown } | null;
  if (typeof body?.transaction !== "string" || typeof body.rating !== "number") {
    return NextResponse.json({ error: "Send { transaction, rating } as JSON." }, { status: 400 });
  }
  try {
    const rating = await rateListing({
      listingId: (await params).id,
      transaction: body.transaction,
      rating: body.rating,
      comment: typeof body.comment === "string" ? body.comment : undefined,
      rater: typeof body.rater === "string" ? body.rater : undefined,
    });
    return NextResponse.json({ rating }, { status: 201 });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 403 });
  }
}
