import { NextResponse } from "next/server";
import { listSellers } from "@/lib/market/sellers";

export const dynamic = "force-dynamic";

// GET /api/sellers: every seller agent with its reliability score and tier, most reliable first.
export async function GET() {
  return NextResponse.json({ sellers: await listSellers() });
}
