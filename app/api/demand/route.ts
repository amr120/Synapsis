import { NextResponse } from "next/server";
import { autopilotConfig } from "@/lib/market/autopilot";
import { unmetDemand } from "@/lib/market/demand";
import { listAutopilotRuns } from "@/lib/market/store";

export const dynamic = "force-dynamic";

// GET /api/demand  public: what agents searched for and couldn't find, and what the autopilot did about it.
export async function GET() {
  const { enabled, minSearches, maxPerRun, dailyBudgetUsd } = autopilotConfig();
  const [gaps, runs] = await Promise.all([unmetDemand({ limit: 25 }), listAutopilotRuns(20)]);
  return NextResponse.json({ autopilot: { enabled, minSearches, maxPerRun, dailyBudgetUsd, schedule: "daily 06:00 UTC" }, gaps, recentRuns: runs });
}
