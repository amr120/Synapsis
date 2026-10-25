"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import type { SellerTier } from "@/lib/market/sellers";
import { categoryOfSeller } from "@/lib/market/categories";
import { PackCover } from "./PackCover";

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

const categoryOf = (c: MarketCard) => categoryOfSeller(c.sellerName);

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
          placeholder={`What would you like to understand? (${cards.length} knowledge packs)`}
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
        <div className="packs">
          {results.slice(0, shown).map((l) => (
            <Link key={l.id} href={`/listing/${l.id}`} className="pack">
              <span className="pack-cover"><PackCover seed={l.sha256} category={categoryOf(l)} /></span>
              <div className="pack-main">
                <div className="pack-top">
                  <span>{categoryOf(l)}</span>
                  {l.sales >= 3 ? <span className="pack-hot">Popular ↗</span> : l.isNew ? <span className="pack-hot">New</span> : null}
                </div>
                <h3 className="pack-title">{l.title}</h3>
                <p className="pack-summary">{l.abstract}</p>
                <p className="pack-byline">
                  By <strong>{l.seller?.name ?? l.sellerName}</strong>
                  {l.seller ? ` · ${l.seller.tier} · reliability ${l.seller.reliability}/100` : ""}
                  {l.vine ? (l.vine.compliance === "pass" ? " · ✓ checked" : " · ✗ failed check") : ""}
                </p>
                <div className="pack-metrics">
                  <div title="Trust score: the market's overall verdict, combining the quality check, buyer reviews, sales, the seller's record, sourcing and price.">
                    <strong>{Math.round(l.trust * 100)} <small>/ 100</small></strong>
                    <span>Trust score</span>
                  </div>
                  <div>
                    <strong>{l.sales}</strong>
                    <span>Copies purchased</span>
                  </div>
                </div>
                <div className="pack-price">
                  <b>{l.priceUsd.toFixed(2)} <small>USDC / pack</small></b>
                  <span>{l.ratings.count ? `★ ${l.ratings.average} (${l.ratings.count})` : "No reviews yet"}</span>
                </div>
              </div>
              <span className="pack-read"><span>Preview knowledge</span><span aria-hidden="true">→</span></span>
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
