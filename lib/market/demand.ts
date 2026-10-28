import "server-only";
import { listAutopilotRuns, listDemandMisses, listListings, recordDemandMiss, type Listing } from "./store";

// Unmet demand: searches no listing answers well. Agents tell the market what to research next,
// and the autopilot (autopilot.ts) turns the most-asked gaps into new knowledge packs.

const STOPWORDS = new Set(
  "the and for with what how does are about from that this into have has why who when which their there your you can its was were will would should could tell need want find latest current between under over more most best 2025 2026 file files pack packs knowledge".split(" "),
);

/** Meaningful terms of a query, lowercased (words over 2 letters, no stopwords). */
export function termsOf(query: string): string[] {
  return [...new Set(query.toLowerCase().split(/\W+/).filter((t) => t.length > 2 && !STOPWORDS.has(t)))];
}

/** Groups rephrasings: "fusion nuclear" and "Nuclear fusion?" share a key. */
export const demandKey = (query: string) => termsOf(query).sort().join(" ");

/** Fraction of the query's terms a listing mentions anywhere in its public metadata (0-1). */
export function coverage(l: Listing, query: string): number {
  const terms = termsOf(query);
  if (terms.length === 0) return 1;
  const text = `${l.title} ${l.abstract} ${l.topic} ${l.tags.join(" ")} ${(l.capabilities?.answers ?? []).join(" ")} ${(l.capabilities?.outline ?? []).join(" ")}`.toLowerCase();
  const words = new Set(text.split(/\W+/));
  // Whole-word match, so "fusion" doesn't count as covered by "diffusion".
  return terms.filter((t) => words.has(t) || words.has(`${t}s`) || (t.endsWith("s") && words.has(t.slice(0, -1)))).length / terms.length;
}

/** Below this best-match coverage a search counts as unmet. */
export const UNMET_BELOW = 0.6;

/** Logs the search as demand when no active listing covers it well. Never throws. */
export async function recordSearch(query: string, actor: string, candidates: Listing[]): Promise<void> {
  const key = demandKey(query);
  if (!key || actor === AUTOPILOT_ACTOR) return;
  const best = Math.max(0, ...candidates.filter((l) => l.status !== "suppressed").map((l) => coverage(l, query)));
  if (best < UNMET_BELOW) await recordDemandMiss({ query: query.slice(0, 200), key, actor: actor.slice(0, 64), coverage: Math.round(best * 100) / 100 });
}

export const AUTOPILOT_ACTOR = "synapsis-autopilot";

export interface DemandGap {
  key: string;
  /** The most recent phrasing of the question. */
  query: string;
  searches: number;
  actors: number;
  bestCoverage: number;
  lastAt: string;
}

/** Open gaps, most-searched first: grouped misses that no listing (including new ones) covers yet and the autopilot hasn't handled. */
export async function unmetDemand(opts: { limit?: number } = {}): Promise<DemandGap[]> {
  const [misses, runs, listings] = await Promise.all([listDemandMisses(), listAutopilotRuns(), listListings(500)]);
  const handled = new Set(runs.filter((r) => r.outcome !== "failed").map((r) => r.key));
  const groups = new Map<string, { query: string; searches: number; actors: Set<string>; lastAt: string }>();
  for (const m of misses) {
    if (handled.has(m.key)) continue;
    const g = groups.get(m.key);
    if (g) {
      g.searches++;
      g.actors.add(m.actor);
    } else groups.set(m.key, { query: m.query, searches: 1, actors: new Set([m.actor]), lastAt: m.at }); // misses are newest-first
  }
  return [...groups.entries()]
    .map(([key, g]) => ({ key, query: g.query, searches: g.searches, actors: g.actors.size, lastAt: g.lastAt, bestCoverage: Math.max(0, ...listings.map((l) => coverage(l, g.query))) }))
    .filter((g) => g.bestCoverage < UNMET_BELOW) // a listing published since may already answer it
    .sort((a, b) => b.searches - a.searches || b.actors - a.actors || b.lastAt.localeCompare(a.lastAt))
    .slice(0, opts.limit ?? 50);
}
