import { NextResponse } from "next/server";
import { runAutopilot } from "@/lib/market/autopilot";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

// GET /api/autopilot[?dry=1]  one autopilot pass: research and list the most-searched unmet questions.
// Vercel Cron calls it daily with "Authorization: Bearer $CRON_SECRET"; nobody else can make it spend.
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized. The autopilot runs on Vercel Cron; see /api/demand for what it would research." }, { status: 401 });
  }
  const dryRun = new URL(request.url).searchParams.get("dry") === "1";
  return NextResponse.json(await runAutopilot({ dryRun }));
}
