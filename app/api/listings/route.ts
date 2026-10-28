import { NextResponse } from "next/server";
import { rankedResponse } from "@/lib/market/present";
import { rankListings } from "@/lib/market/ranking";
import { logEvent } from "@/lib/market/store";
import { recordSearch } from "@/lib/market/demand";
import { publishMarkdown } from "@/lib/market/seller";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

// GET /api/listings?q=…[&seller=<wallet>]  ranked free previews plus the query's Buy Box pick.
// Suppressed listings are hidden from discovery, except from their owner's own `seller` view.
export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  const q = params.get("q")?.trim() || undefined;
  const seller = params.get("seller")?.trim() || undefined;
  const ranked = await rankListings(q, { seller });
  if (q) {
    const actor = request.headers.get("x-synapsis-agent")?.slice(0, 64) || "agent";
    await logEvent({ type: "search", actor, subject: q.slice(0, 80), detail: `${ranked.length} hit${ranked.length === 1 ? "" : "s"}` });
    // Searches nothing answers well become demand the autopilot can research (not a seller's view of its own files).
    if (!seller) await recordSearch(q, actor, ranked.map((r) => r.listing));
  }
  return NextResponse.json(rankedResponse(ranked));
}

// POST /api/listings { markdown, priceUsd?, sellerName?, sellerWallet? }  any agent can list a file.
export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as { markdown?: unknown; priceUsd?: unknown; sellerName?: unknown; sellerWallet?: unknown; sellerBio?: unknown; meta?: { title?: unknown; abstract?: unknown; topic?: unknown; tags?: unknown }; capabilities?: { answers?: unknown; examples?: unknown } } | null;
  if (!body || typeof body.markdown !== "string") return NextResponse.json({ error: "Send { markdown } as JSON." }, { status: 400 });
  try {
    const listing = await publishMarkdown({
      markdown: body.markdown,
      priceUsd: typeof body.priceUsd === "number" ? body.priceUsd : undefined,
      sellerName: typeof body.sellerName === "string" ? body.sellerName : undefined,
      sellerWallet: typeof body.sellerWallet === "string" ? body.sellerWallet : undefined,
      sellerBio: typeof body.sellerBio === "string" ? body.sellerBio : undefined,
      meta:
        body.meta && typeof body.meta.title === "string" && typeof body.meta.abstract === "string" && typeof body.meta.topic === "string" && Array.isArray(body.meta.tags)
          ? { title: body.meta.title.slice(0, 120), abstract: body.meta.abstract.slice(0, 600), topic: body.meta.topic.slice(0, 60), tags: (body.meta.tags as unknown[]).filter((t): t is string => typeof t === "string").slice(0, 6) }
          : undefined,
      capabilities:
        body.capabilities && Array.isArray(body.capabilities.answers) && Array.isArray(body.capabilities.examples)
          ? {
              answers: (body.capabilities.answers as unknown[]).filter((a): a is string => typeof a === "string"),
              examples: (body.capabilities.examples as { input?: unknown; output?: unknown }[]).filter((e) => typeof e?.input === "string" && typeof e?.output === "string") as { input: string; output: string }[],
            }
          : undefined,
    });
    return NextResponse.json({ listing }, { status: 201 });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 400 });
  }
}
