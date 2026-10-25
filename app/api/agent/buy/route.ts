import { NextResponse } from "next/server";
import { runBuyer } from "@/lib/market/buyer";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

// POST /api/agent/buy { question }: the buyer agent searches, pays over x402, verifies and answers.
// It only ever buys from this market (the URL is built server-side), within its spending limits.
export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as { question?: unknown } | null;
  const question = typeof body?.question === "string" ? body.question.trim() : "";
  if (!question) return NextResponse.json({ error: "Send { question } as JSON." }, { status: 400 });
  try {
    return NextResponse.json(await runBuyer(question.slice(0, 500)));
  } catch (err) {
    console.error("[buyer] failed:", err);
    return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 });
  }
}
