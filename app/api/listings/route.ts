import { NextResponse } from "next/server";
import { rankedResponse } from "@/lib/market/present";
import { rankListings } from "@/lib/market/ranking";
import { publishMarkdown } from "@/lib/market/seller";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

// GET /api/listings?q=…[&seller=<wallet>]  ranked free previews plus the query's Buy Box pick.
// Suppressed listings are hidden from discovery, except from their owner's own `seller` view.
export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  const q = params.get("q")?.trim() || undefined;
  const seller = params.get("seller")?.trim() || undefined;
  return NextResponse.json(rankedResponse(await rankListings(q, { seller })));
}

// POST /api/listings { markdown, priceUsd?, sellerName?, sellerWallet? }  any agent can list a file.
export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as { markdown?: unknown; priceUsd?: unknown; sellerName?: unknown; sellerWallet?: unknown; sellerBio?: unknown } | null;
  if (!body || typeof body.markdown !== "string") return NextResponse.json({ error: "Send { markdown } as JSON." }, { status: 400 });
  try {
    const listing = await publishMarkdown({
      markdown: body.markdown,
      priceUsd: typeof body.priceUsd === "number" ? body.priceUsd : undefined,
      sellerName: typeof body.sellerName === "string" ? body.sellerName : undefined,
      sellerWallet: typeof body.sellerWallet === "string" ? body.sellerWallet : undefined,
      sellerBio: typeof body.sellerBio === "string" ? body.sellerBio : undefined,
    });
    return NextResponse.json({ listing }, { status: 201 });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 400 });
  }
}
