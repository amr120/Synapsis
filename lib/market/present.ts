import "server-only";
import { buyBox, type Ranked } from "./ranking";

/** The public JSON shape of a ranked listing: metadata plus its trust signals. */
export function rankedJson(r: Ranked, winnerId?: string) {
  return {
    ...r.listing,
    trust: r.trust,
    rank: r.rank,
    relevance: Math.round(r.relevance * 1000) / 1000,
    signals: Object.fromEntries(Object.entries(r.signals).map(([k, v]) => [k, Math.round(v * 1000) / 1000])),
    verifiedRating: r.ratings,
    isNew: r.isNew,
    buyBox: r.listing.id === winnerId,
  };
}

export function rankedResponse(ranked: Ranked[]) {
  const box = buyBox(ranked);
  return {
    buyBox: box ? { id: box.winner.listing.id, title: box.winner.listing.title, priceUsd: box.winner.listing.priceUsd, trust: box.winner.trust, reason: box.reason } : null,
    listings: ranked.map((r) => rankedJson(r, box?.winner.listing.id)),
  };
}
