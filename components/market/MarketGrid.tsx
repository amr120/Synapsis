"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { Led } from "@/components/ui";
import type { SellerTier } from "@/lib/market/sellers";
import { SellerBadge } from "./SellerBadge";

export interface MarketCard {
  id: string;
  title: string;
  abstract: string;
  tags: string[];
  answers: string[];
  priceUsd: number;
  bytes: number;
  sales: number;
  sha256: string;
  createdAt: string;
  trust: number;
  ratings: { count: number; average: number | null };
  vine: { score: number; compliance: string } | null;
  isNew: boolean;
  seller: { name: string; tier: SellerTier; reliability: number } | null;
  sellerName: string;
}

// Seller agents are specialists, so their name gives each file a browsable category.
const CATEGORY: Record<string, string> = {
  "atlas-bio-research": "Life sciences",
  "meridian-policy-desk": "Policy & law",
  "ledger-labs": "AI & crypto",
  "helios-energy-analyst": "Energy & climate",
  "synapsis-research-agent": "Engineering",
};
const categoryOf = (c: MarketCard) => CATEGORY[c.sellerName] ?? "Other";

const SORTS = {
  trust: { label: "Most trusted", fn: (a: MarketCard, b: MarketCard) => b.trust - a.trust },
  newest: { label: "Newest", fn: (a: MarketCard, b: MarketCard) => b.createdAt.localeCompare(a.createdAt) },
  sales: { label: "Best selling", fn: (a: MarketCard, b: MarketCard) => b.sales - a.sales || b.trust - a.trust },
  rating: { label: "Top rated", fn: (a: MarketCard, b: MarketCard) => (b.ratings.average ?? 0) - (a.ratings.average ?? 0) || b.ratings.count - a.ratings.count },
  price: { label: "Lowest price", fn: (a: MarketCard, b: MarketCard) => a.priceUsd - b.priceUsd || b.trust - a.trust },
} as const;
type SortKey = keyof typeof SORTS;

const PAGE = 12;

/** The browsable market: free-text search, category chips, sort and "show more" paging. */
export function MarketGrid({ cards }: { cards: MarketCard[] }) {
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("All");
  const [sort, setSort] = useState<SortKey>("trust");
  const [shown, setShown] = useState(PAGE);

  const categories = useMemo(() => {
    const counts = new Map<string, number>();
    for (const c of cards) counts.set(categoryOf(c), (counts.get(categoryOf(c)) ?? 0) + 1);
    return [["All", cards.length] as const, ...[...counts.entries()].sort((a, b) => b[1] - a[1])];
  }, [cards]);

  const results = useMemo(() => {
    const terms = query.toLowerCase().split(/\s+/).filter(Boolean);
    return cards
      .filter((c) => category === "All" || categoryOf(c) === category)
      .filter((c) => {
        if (terms.length === 0) return true;
        const hay = `${c.title} ${c.abstract} ${c.tags.join(" ")} ${c.answers.join(" ")} ${c.sellerName}`.toLowerCase();
        return terms.every((t) => hay.includes(t));
      })
      .sort(SORTS[sort].fn);
  }, [cards, query, category, sort]);

  const reset = () => setShown(PAGE);

  return (
    <div className="stack">
      <div className="market-tools">
        <input
          type="search"
          placeholder={`Search ${cards.length} knowledge files…`}
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            reset();
          }}
          aria-label="Search knowledge files"
        />
        <select
          value={sort}
          onChange={(e) => {
            setSort(e.target.value as SortKey);
            reset();
          }}
          aria-label="Sort"
        >
          {(Object.keys(SORTS) as SortKey[]).map((k) => <option key={k} value={k}>{SORTS[k].label}</option>)}
        </select>
      </div>
      <div className="chips" role="tablist" aria-label="Categories">
        {categories.map(([name, n]) => (
          <button
            key={name}
            role="tab"
            aria-selected={category === name}
            className={`chip${category === name ? " chip--on" : ""}`}
            onClick={() => {
              setCategory(name);
              reset();
            }}
          >
            {name} <span>{n}</span>
          </button>
        ))}
      </div>

      {results.length === 0 ? (
        <div className="empty">No files match. Try fewer words, or ask the buyer agent above.</div>
      ) : (
        <div className="keys">
          {results.slice(0, shown).map((l) => (
            <Link key={l.id} href={`/listing/${l.id}`} className="key listing">
              <Led tone={l.vine?.compliance === "pass" ? "ok" : "signal"} />
              <b>{l.title}</b>
              <div className="row">
                <span className="tag tag--signal" title="Trust score (0-100): the market's overall verdict, combining the quality check, buyer reviews, sales, the seller's record, sourcing and price. Decides the ranking.">Trust {Math.round(l.trust * 100)}</span>
                {l.ratings.count > 0 ? <span className="tag tag--ok" title="Reviews from paying buyers only (Verified Ratings)">★ {l.ratings.average} · {l.ratings.count} {l.ratings.count === 1 ? "buyer" : "buyers"}</span> : null}
                {l.vine ? <span className="tag tag--ok" title={`Independent quality check (Vine): ${l.vine.score}/100, safety ${l.vine.compliance}.`}>{l.vine.compliance === "pass" ? "✓ Checked" : "✗ Failed check"}</span> : null}
                {l.isNew ? <span className="tag tag--warn">New</span> : null}
              </div>
              <p>{l.abstract}</p>
              {l.seller && <span className="small muted">by <strong>{l.seller.name}</strong> · <SellerBadge tier={l.seller.tier} reliability={l.seller.reliability} /></span>}
              <div className="listing-foot">
                <span>${l.priceUsd} USDC</span>
                <span>{(l.bytes / 1024).toFixed(1)} KB</span>
                <span>{l.sales} sold</span>
                <span title={l.sha256}>#{l.sha256.slice(0, 8)}</span>
              </div>
            </Link>
          ))}
        </div>
      )}

      <div className="row market-more">
        <span className="small muted">Showing {Math.min(shown, results.length)} of {results.length}</span>
        {shown < results.length && <button className="btn btn--secondary btn-small" onClick={() => setShown((s) => s + PAGE)}>Show {Math.min(PAGE, results.length - shown)} more</button>}
      </div>
    </div>
  );
}
