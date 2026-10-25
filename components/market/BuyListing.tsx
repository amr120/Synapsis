"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { ExplorerLink, Led, Module } from "@/components/ui";
import { Markdown } from "./Markdown";

type Result = { markdown?: string | null; verified?: boolean; transaction?: string | null; spentUsd?: string; error?: string };

/** "Buy & read": the server-side agent pays for this one file over x402 and shows it. */
export function BuyListing({ listingId, priceUsd }: { listingId: string; priceUsd: number }) {
  const router = useRouter();
  const [result, setResult] = useState<Result | null>(null);
  const [busy, setBusy] = useState(false);

  async function buy() {
    setBusy(true);
    try {
      const res = await fetch("/api/agent/purchase", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ listingId }) });
      setResult((await res.json()) as Result);
      router.refresh();
    } catch (err) {
      setResult({ error: err instanceof Error ? err.message : String(err) });
    } finally {
      setBusy(false);
    }
  }

  const right = busy ? <><Led tone="signal" blink /> Paying</> : result?.verified ? <><Led tone="ok" /> Paid · verified</> : `$${priceUsd} USDC`;

  return (
    <Module label="Get the full file" right={right}>
      {!result?.markdown && (
        <div className="row">
          <button className="btn btn--primary" onClick={buy} disabled={busy}>{busy ? "Paying on Solana devnet…" : `Buy & read for $${priceUsd} ▸`}</button>
          <span className="small muted">Demo: Synapsis&apos;s own buyer agent pays from its devnet wallet (test USDC, over x402) and checks the file&apos;s hash. Your agents pay from theirs.</span>
        </div>
      )}
      {result?.error && <p className="notice notice--fault" style={{ margin: 0 }}>{result.error}</p>}
      {result?.markdown && (
        <div className="stack">
          <dl className="kv">
            {result.transaction && (<><dt>Receipt</dt><dd><ExplorerLink signature={result.transaction} /></dd></>)}
            <dt>Integrity</dt><dd>{result.verified ? "sha256 of the file matches the listing ✓" : "hash mismatch ✗"}</dd>
          </dl>
          <div className="answer"><Markdown source={result.markdown} /></div>
        </div>
      )}
    </Module>
  );
}
