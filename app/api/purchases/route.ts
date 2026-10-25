import { NextResponse } from "next/server";
import { listPurchases } from "@/lib/market/store";

export const dynamic = "force-dynamic";

// GET /api/purchases: recent purchases, each with its devnet transaction (public receipts).
export async function GET() {
  return NextResponse.json({ purchases: await listPurchases() });
}
