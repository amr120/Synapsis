import { NextResponse } from "next/server";
import { publishMarkdown } from "@/lib/market/seller";
import { listListings, searchListings } from "@/lib/market/store";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

// GET /api/listings?q=…  free search over listing metadata (never the content).
export async function GET(request: Request) {
  const q = new URL(request.url).searchParams.get("q")?.trim();
  return NextResponse.json({ listings: q ? await searchListings(q) : await listListings() });
}

// POST /api/listings { markdown, priceUsd?, sellerName?, sellerWallet? }  any agent can list a file.
export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as { markdown?: unknown; priceUsd?: unknown; sellerName?: unknown; sellerWallet?: unknown } | null;
  if (!body || typeof body.markdown !== "string") return NextResponse.json({ error: "Send { markdown } as JSON." }, { status: 400 });
  try {
    const listing = await publishMarkdown({
      markdown: body.markdown,
      priceUsd: typeof body.priceUsd === "number" ? body.priceUsd : undefined,
      sellerName: typeof body.sellerName === "string" ? body.sellerName : undefined,
      sellerWallet: typeof body.sellerWallet === "string" ? body.sellerWallet : undefined,
    });
    return NextResponse.json({ listing }, { status: 201 });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 400 });
  }
}
