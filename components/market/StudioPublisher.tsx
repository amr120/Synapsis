"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Led, Module } from "@/components/ui";

type Created = { listing?: { id: string; title: string; priceUsd: number }; error?: string };

/** "Your publishing agent": the seller asks its research agent to write and list a new pack under its own wallet. */
export function StudioPublisher({ sellerName, sellerWallet }: { sellerName: string; sellerWallet: string }) {
  const router = useRouter();
  const [topic, setTopic] = useState("");
  const [price, setPrice] = useState("0.02");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<Created | null>(null);

  async function publish() {
    setBusy(true);
    setResult(null);
    try {
      const res = await fetch("/api/agent/sell", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ topic, priceUsd: Number(price), sellerName, sellerWallet }),
      });
      setResult((await res.json()) as Created);
      router.refresh();
    } catch (err) {
      setResult({ error: err instanceof Error ? err.message : String(err) });
    } finally {
      setBusy(false);
    }
  }

  const right = busy ? <><Led tone="signal" blink /> Researching</> : <><Led tone="ok" /> Connected</>;

  return (
    <Module label="Your publishing agent" right={right}>
      <p className="small muted" style={{ margin: 0 }}>
        Give your research agent a topic. It writes a sourced knowledge pack, lists it under {sellerName}, and every sale pays this wallet.
        An independent quality check (Vine) reviews it right after.
      </p>
      <form className="row" onSubmit={(e) => { e.preventDefault(); publish(); }}>
        <input style={{ flex: "1 1 320px" }} placeholder="Topic to research, e.g. UK quantum computing strategy" value={topic} onChange={(e) => setTopic(e.target.value)} />
        <input style={{ width: 110 }} inputMode="decimal" aria-label="Price in USDC" value={price} onChange={(e) => setPrice(e.target.value)} />
        <button className="btn btn--primary" type="submit" disabled={busy || !topic.trim()}>{busy ? "Researching (≈30-60s)…" : "Publish new pack"}</button>
      </form>
      {result?.listing && (
        <p className="notice notice--ok" style={{ margin: 0 }}>
          Published <Link href={`/listing/${result.listing.id}`}>{result.listing.title}</Link> at {result.listing.priceUsd.toFixed(2)} USDC.
        </p>
      )}
      {result?.error && <p className="notice notice--fault" style={{ margin: 0 }}>{result.error}</p>}
    </Module>
  );
}
