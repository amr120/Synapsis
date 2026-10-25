import { NextResponse } from "next/server";
import { researchAndList } from "@/lib/market/seller";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

// POST /api/agent/sell { topic, priceUsd? }: the seller agent researches the topic and lists the file.
export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as { topic?: unknown; priceUsd?: unknown; sellerName?: unknown; sellerWallet?: unknown } | null;
  const topic = typeof body?.topic === "string" ? body.topic.trim() : "";
  if (!topic) return NextResponse.json({ error: "Send { topic } as JSON." }, { status: 400 });
  try {
    const listing = await researchAndList(topic.slice(0, 300), {
      priceUsd: typeof body?.priceUsd === "number" ? body.priceUsd : undefined,
      sellerName: typeof body?.sellerName === "string" ? body.sellerName : undefined,
      sellerWallet: typeof body?.sellerWallet === "string" ? body.sellerWallet : undefined,
    });
    return NextResponse.json({ listing }, { status: 201 });
  } catch (err) {
    console.error("[seller] failed:", err);
    return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 });
  }
}
