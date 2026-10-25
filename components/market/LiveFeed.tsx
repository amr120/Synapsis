"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";

type Event = {
  id: string;
  at: string;
  type: "search" | "list" | "buy" | "rate" | "vine-pass" | "vine-fail" | "suppressed";
  actor: string;
  subject: string;
  detail: string;
  listingId?: string;
  transaction?: string | null;
};

const VERB: Record<Event["type"], string> = {
  search: "search",
  list: "list",
  buy: "buy",
  rate: "rate",
  "vine-pass": "pass",
  "vine-fail": "fail",
  suppressed: "suppress",
};

const POLL_MS = 2000;
const SHOWN = 12;

/** Wallets become short agent handles (agent_3v5); names stay as they are. */
const handle = (actor: string) => (/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(actor) ? `agent_${actor.slice(0, 3).toLowerCase()}` : actor);
const clock = (iso: string) => new Date(iso).toLocaleTimeString("en-GB", { hour12: false });

/** Live market activity: what agents are searching, buying, rating and what the verifier decided. */
export function LiveFeed() {
  const [events, setEvents] = useState<Event[]>([]);
  const [fresh, setFresh] = useState<Set<string>>(new Set());
  const [online, setOnline] = useState(true);
  const seen = useRef<Set<string> | null>(null);

  useEffect(() => {
    let stop = false;
    async function poll() {
      try {
        const res = await fetch(`/api/activity?limit=${SHOWN * 2}`, { cache: "no-store" });
        const { events: next } = (await res.json()) as { events: Event[] };
        if (stop) return;
        // First load fills the feed quietly; later polls highlight what's new.
        if (seen.current) {
          const added = next.filter((e) => !seen.current!.has(e.id)).map((e) => e.id);
          if (added.length) setFresh(new Set(added));
        }
        seen.current = new Set(next.map((e) => e.id));
        setEvents(next);
        setOnline(true);
      } catch {
        if (!stop) setOnline(false);
      }
    }
    poll();
    const t = setInterval(poll, POLL_MS);
    return () => {
      stop = true;
      clearInterval(t);
    };
  }, []);

  const recent = events.filter((e) => Date.now() - Date.parse(e.at) < 10 * 60_000).length;

  return (
    <section className="live" aria-label="Live market activity">
      <div className="live-head">
        <span className={`live-dot${online ? "" : " live-dot--off"}`} />
        <b>Live activity</b>
        <span className="muted small">{online ? `${recent} events in the last 10 min` : "reconnecting…"}</span>
      </div>
      {events.length === 0 ? (
        <div className="live-empty">Waiting for agents…</div>
      ) : (
        <ol className="live-log" aria-live="polite">
          {events.slice(0, SHOWN).map((e) => (
            <li key={e.id} className={`ev ev--${e.type}${fresh.has(e.id) ? " ev--new" : ""}`}>
              <time>{clock(e.at)}</time>
              <span className="ev-actor" title={e.actor}>{handle(e.actor)}</span>
              <span className="ev-verb">{VERB[e.type]}</span>
              <span className="ev-subject">
                {e.listingId ? <Link href={`/listing/${e.listingId}`}>&ldquo;{e.subject}&rdquo;</Link> : <>&ldquo;{e.subject}&rdquo;</>}
              </span>
              <span className="ev-detail">
                {e.transaction ? (
                  <a href={`https://explorer.solana.com/tx/${e.transaction}?cluster=devnet`} target="_blank" rel="noopener noreferrer" title="View on Solana Explorer">{e.detail}</a>
                ) : (
                  e.detail
                )}
              </span>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}
