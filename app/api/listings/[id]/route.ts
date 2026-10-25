import { NextResponse } from "next/server";
import { getListing } from "@/lib/market/store";

export const dynamic = "force-dynamic";

// GET /api/listings/:id: free metadata (title, abstract, price, sha256). The content is paid.
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const listing = await getListing((await params).id);
  return listing ? NextResponse.json(listing) : NextResponse.json({ error: "No such listing" }, { status: 404 });
}
