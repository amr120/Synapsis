"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { ExplorerLink, Led, Module } from "@/components/ui";
import { Markdown } from "./Markdown";

type Step = { step: string; detail: string };
type Run = {
  steps?: Step[];
  chosen?: { id: string; title: string; priceUsd: number } | null;
  reason?: string;
  transaction?: string | null;
  verified?: boolean;
  answer?: string | null;
  spentUsd?: string | null;
  error?: string;
};

const EXAMPLES = [
  "What causes rotating stall in an axial compressor, and how is it detected?",
  "What must general-purpose AI model providers do under the EU AI Act?",
  "Who pays the network fee in an x402 payment on Solana?",
];

/** Ask a question: the buyer agent searches, pays over x402, verifies the hash and answers. */
export function BuyerConsole() {
  const router = useRouter();
  const [question, setQuestion] = useState("");
  const [run, setRun] = useState<Run | null>(null);
  const [busy, setBusy] = useState(false);

  async function ask(q = question) {
    if (!q.trim()) return;
    setQuestion(q);
    setBusy(true);
    setRun(null);
    try {
      const res = await fetch("/api/agent/buy", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ question: q }) });
      setRun((await res.json()) as Run);
      router.refresh();
    } catch (err) {
      setRun({ error: err instanceof Error ? err.message : String(err) });
    } finally {
      setBusy(false);
    }
  }

  const right = busy ? <><Led tone="signal" blink /> Working</> : run?.verified ? <><Led tone="ok" /> Paid · verified</> : run ? <><Led tone={run.error ? "fault" : undefined} /> Done</> : "Buyer agent";

  return (
    <Module label="Ask · the buyer agent buys knowledge for you" right={right}>
      <form className="stack" onSubmit={(e) => { e.preventDefault(); ask(); }}>
        <textarea rows={2} placeholder="Ask a research question…" value={question} onChange={(e) => setQuestion(e.target.value)} />
        <div className="row">
          <button className="btn btn--primary" type="submit" disabled={busy || !question.trim()}>{busy ? "Searching, paying, reading…" : "Ask & buy ▸"}</button>
          {EXAMPLES.map((ex) => (
            <button key={ex} type="button" className="btn btn--secondary btn-small" disabled={busy} onClick={() => ask(ex)}>{ex.split(",")[0].slice(0, 42)}…</button>
          ))}
        </div>
      </form>

      {run && (
        <div className="stack" aria-live="polite">
          {run.steps && run.steps.length > 0 && (
            <ol className="trace">
              {run.steps.map((s, i) => (
                <li key={i}><span className="tag tag--signal">{s.step}</span><span>{s.detail}</span></li>
              ))}
            </ol>
          )}
          {run.chosen && (
            <dl className="kv">
              <dt>Bought</dt><dd><Link href={`/listing/${run.chosen.id}`}>{run.chosen.title}</Link> · ${run.chosen.priceUsd} USDC</dd>
              {run.transaction && (<><dt>Receipt</dt><dd><ExplorerLink signature={run.transaction} /></dd></>)}
              <dt>Integrity</dt><dd>{run.verified ? "sha256 matches the listing ✓" : "not verified"}</dd>
              {run.spentUsd && (<><dt>Agent spent</dt><dd>${run.spentUsd} this session</dd></>)}
            </dl>
          )}
          {!run.chosen && run.reason && <p className="notice" style={{ margin: 0 }}>No purchase: {run.reason}</p>}
          {run.error && <p className="notice notice--fault" style={{ margin: 0 }}>{run.error}</p>}
          {run.answer && <div className="answer"><Markdown source={run.answer} /></div>}
        </div>
      )}
    </Module>
  );
}
