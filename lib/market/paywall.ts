import "server-only";
import { NextResponse, type NextRequest } from "next/server";
import { withX402 } from "@x402/next";
import { getNetwork } from "../payments/config";
import { getResourceServer, resetResourceServer } from "../payments/server";
import { getContent, type Listing } from "./store";

// Each listing has its own price and seller wallet, so each gets its own x402 wrapper (cached).
// Payment is only settled when the handler answers < 400, so a missing file is never charged.

type Handler = (request: NextRequest) => Promise<NextResponse>;
const wrapped = new Map<string, Handler>();

/**
 * The paywalled handler for a listing. If the facilitator can't be reached (flaky networks), the
 * wrapper and facilitator client are dropped so the next request reconnects, and the caller gets a
 * retryable 503 instead of a cached failure.
 */
export function contentHandler(listing: Listing): Handler {
  return async (request) => {
    const key = `${listing.id}:${listing.priceUsd}:${listing.sellerWallet}`;
    try {
      return await wrappedHandler(listing, key)(request);
    } catch (err) {
      wrapped.clear();
      resetResourceServer();
      console.warn("[paywall] facilitator error, will reconnect:", String(err).slice(0, 160));
      return NextResponse.json({ error: "Payment facilitator unreachable, please retry", retryable: true }, { status: 503, headers: { "retry-after": "2" } });
    }
  };
}

function wrappedHandler(listing: Listing, key: string): Handler {
  let handler = wrapped.get(key);
  if (!handler) {
    handler = withX402(
      async (): Promise<NextResponse> => {
        const markdown = await getContent(listing.id);
        if (markdown === null) return NextResponse.json({ error: "Content not found" }, { status: 404 });
        return NextResponse.json(
          { id: listing.id, title: listing.title, sha256: listing.sha256, markdown },
          { headers: { "x-content-sha256": listing.sha256 } },
        );
      },
      {
        accepts: [{ scheme: "exact", price: `$${listing.priceUsd}`, network: getNetwork(), payTo: listing.sellerWallet }],
        description: `Synapsis knowledge file: ${listing.title}`,
        mimeType: "application/json",
      },
      getResourceServer(),
    );
    wrapped.set(key, handler);
  }
  return handler;
}
