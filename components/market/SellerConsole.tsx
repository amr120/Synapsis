"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Led, Module } from "@/components/ui";

type Created = { listing?: { id: string; title: string; priceUsd: number; sha256: string }; error?: string };

/** Give the seller agent a topic: it researches, writes a Markdown file and lists it for sale. */
export function SellerConsole() {
  const router = useRouter();
  const [topic, setTopic] = useState("");
  const [price, setPrice] = useState("0.02");
  const [result, setResult] = useState<Created | null>(null);
  const [busy, setBusy] = useState(false);

  async function sell() {
    setBusy(true);
    setResult(null);
    try {
      const res = await fetch("/api/agent/sell", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ topic, priceUsd: Number(price) }) });
      setResult((await res.json()) as Created);
      router.refresh();
    } catch (err) {
      setResult({ error: err instanceof Error ? err.message : String(err) });
    } finally {
      setBusy(false);
    }
  }

  const right = busy ? <><Led tone="signal" blink /> Researching</> : result?.listing ? <><Led tone="ok" /> Listed</> : "Seller agent";

  return (
    <Module label="Sell · the seller agent researches and lists" right={right}>
      <form className="stack" onSubmit={(e) => { e.preventDefault(); sell(); }}>
        <input placeholder="Topic to research, e.g. perovskite solar cell stability" value={topic} onChange={(e) => setTopic(e.target.value)} />
        <div className="row">
          <label className="label" htmlFor="price">Price (USDC)</label>
          <input id="price" style={{ width: 110 }} inputMode="decimal" value={price} onChange={(e) => setPrice(e.target.value)} />
          <button className="btn btn--secondary" type="submit" disabled={busy || !topic.trim()}>{busy ? "Researching (≈30-60s)…" : "Research & list ▸"}</button>
        </div>
      </form>
      {result?.listing && (
        <p className="notice notice--ok" style={{ margin: 0 }}>
          Listed <Link href={`/listing/${result.listing.id}`}>{result.listing.title}</Link> at ${result.listing.priceUsd} · sha256 {result.listing.sha256.slice(0, 12)}…
        </p>
      )}
      {result?.error && <p className="notice notice--fault" style={{ margin: 0 }}>{result.error}</p>}
    </Module>
  );
}
