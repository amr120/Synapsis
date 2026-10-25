import "server-only";
import { createHash, randomBytes } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

// Synapsis storage: listings (public metadata), their Markdown (sold behind x402) and purchases.
// Uses Upstash Redis when configured (needed on Vercel/serverless), otherwise a JSON file in
// .data/ so local development keeps listings across restarts.

export interface Source {
  title: string;
  url: string;
}

/** Rich structured metadata: what agents need to decide (the agent equivalent of product photos). */
export interface Capabilities {
  /** Questions this file can answer (its capability signature). */
  answers: string[];
  /** Example input → output pairs drawn from the file. */
  examples: { input: string; output: string }[];
  /** Section outline: the output schema of the file. */
  outline: string[];
  format: "text/markdown";
  wordCount: number;
  /** Inline citation markers like [1] plus linked sources. */
  citationCount: number;
}

/** Vine review: a verifier agent assesses a new listing before organic ratings exist. */
export interface Attestation {
  verifier: string;
  /** 0-100 quality score. */
  score: number;
  compliance: "pass" | "fail";
  checks: { name: string; pass: boolean; note: string }[];
  summary: string;
  attestedAt: string;
  /** Devnet memo transaction anchoring this attestation to the file's sha256, if it landed. */
  transaction: string | null;
}

export interface Listing {
  id: string;
  title: string;
  abstract: string;
  topic: string;
  tags: string[];
  priceUsd: number;
  sellerName: string;
  sellerWallet: string;
  /** sha256 of the Markdown, published up front so buyers can verify what they paid for. */
  sha256: string;
  bytes: number;
  sources: Source[];
  createdAt: string;
  sales: number;
  capabilities?: Capabilities;
  attestation?: Attestation;
  /** Suppressed listings are hidden from discovery but still reachable by id (owner can see why). */
  status?: "active" | "suppressed";
  suppressedReason?: string;
}

/** Verified Rating: only a buyer with a recorded, paid purchase of this listing can rate it. */
export interface Rating {
  listingId: string;
  transaction: string;
  rating: number;
  comment: string;
  rater: string | null;
  createdAt: string;
}

export interface Purchase {
  id: string;
  listingId: string;
  title: string;
  priceUsd: number;
  transaction: string | null;
  payer: string | null;
  question: string | null;
  verified: boolean;
  createdAt: string;
}

const LISTINGS = "market:listings";
const PURCHASES = "market:purchases";
const listingKey = (id: string) => `market:listing:${id}`;
const contentKey = (id: string) => `market:content:${id}`;

interface Kv {
  get(key: string): Promise<string | null>;
  set(key: string, value: string): Promise<void>;
  push(listKey: string, value: string): Promise<void>;
  range(listKey: string, limit: number): Promise<string[]>;
}

function upstashKv(url: string, token: string): Kv {
  async function cmd(...args: unknown[]): Promise<unknown> {
    const res = await fetch(url, {
      method: "POST",
      headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
      body: JSON.stringify(args),
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) throw new Error(`Upstash Redis returned ${res.status}`);
    return ((await res.json()) as { result: unknown }).result;
  }
  return {
    get: async (key) => (await cmd("GET", key)) as string | null,
    set: async (key, value) => void (await cmd("SET", key, value)),
    push: async (listKey, value) => void (await cmd("LPUSH", listKey, value)),
    range: async (listKey, limit) => ((await cmd("LRANGE", listKey, 0, limit - 1)) as string[] | null) ?? [],
  };
}

function fileKv(): Kv {
  const dir = join(process.cwd(), ".data");
  const file = join(dir, "market.json");
  let data: { values: Record<string, string>; lists: Record<string, string[]> } | null = null;
  const load = () => {
    if (!data) {
      try {
        data = JSON.parse(readFileSync(file, "utf8"));
      } catch {
        data = { values: {}, lists: {} };
      }
    }
    return data!;
  };
  const save = () => {
    mkdirSync(dir, { recursive: true });
    writeFileSync(file, JSON.stringify(data));
  };
  return {
    get: async (key) => load().values[key] ?? null,
    set: async (key, value) => {
      load().values[key] = value;
      save();
    },
    push: async (listKey, value) => {
      const d = load();
      (d.lists[listKey] ??= []).unshift(value);
      save();
    },
    range: async (listKey, limit) => (load().lists[listKey] ?? []).slice(0, limit),
  };
}

let kv: Kv | null = null;
function store(): Kv {
  if (!kv) {
    const url = (process.env.UPSTASH_REDIS_REST_URL ?? process.env.KV_REST_API_URL ?? "").replace(/\/+$/, "");
    const token = process.env.UPSTASH_REDIS_REST_TOKEN ?? process.env.KV_REST_API_TOKEN ?? "";
    kv = url && token ? upstashKv(url, token) : fileKv();
  }
  return kv;
}

export const sha256 = (text: string) => createHash("sha256").update(text, "utf8").digest("hex");
const newId = () => randomBytes(5).toString("hex");

export async function createListing(input: Omit<Listing, "id" | "sha256" | "bytes" | "createdAt" | "sales">, markdown: string): Promise<Listing> {
  const listing: Listing = {
    ...input,
    id: newId(),
    sha256: sha256(markdown),
    bytes: Buffer.byteLength(markdown, "utf8"),
    createdAt: new Date().toISOString(),
    sales: 0,
  };
  await store().set(contentKey(listing.id), markdown);
  await store().set(listingKey(listing.id), JSON.stringify(listing));
  await store().push(LISTINGS, listing.id);
  return listing;
}

export async function getListing(id: string): Promise<Listing | null> {
  const raw = await store().get(listingKey(id));
  return raw ? (JSON.parse(raw) as Listing) : null;
}

export async function getContent(id: string): Promise<string | null> {
  return store().get(contentKey(id));
}

/** Listings in discovery. Suppressed ones are left out unless asked for (or owned by `seller`). */
export async function listListings(limit = 100, opts: { includeSuppressed?: boolean; seller?: string } = {}): Promise<Listing[]> {
  const ids = await store().range(LISTINGS, limit);
  const listings = (await Promise.all(ids.map(getListing))).filter((l): l is Listing => l !== null);
  return listings.filter((l) => l.status !== "suppressed" || opts.includeSuppressed || (opts.seller && l.sellerWallet === opts.seller));
}

/** Keyword relevance (0 = no match) over title, abstract, tags and the capability signature. */
export function relevance(l: Listing, query: string): number {
  const terms = query.toLowerCase().split(/\W+/).filter((t) => t.length > 2);
  if (terms.length === 0) return 1;
  const title = l.title.toLowerCase();
  const body = `${l.abstract} ${l.topic} ${l.tags.join(" ")} ${(l.capabilities?.answers ?? []).join(" ")} ${(l.capabilities?.outline ?? []).join(" ")}`.toLowerCase();
  return terms.reduce((s, t) => s + (title.includes(t) ? 3 : 0) + (body.includes(t) ? 1 : 0), 0);
}

/** Keyword search (discovery only). Ranking with trust signals lives in ranking.ts. */
export async function searchListings(query: string, limit = 8): Promise<Listing[]> {
  return (await listListings())
    .map((l) => ({ l, s: relevance(l, query) }))
    .filter((x) => x.s > 0)
    .sort((a, b) => b.s - a.s)
    .slice(0, limit)
    .map((x) => x.l);
}

export async function recordPurchase(p: Omit<Purchase, "id" | "createdAt">): Promise<Purchase> {
  const purchase: Purchase = { ...p, id: newId(), createdAt: new Date().toISOString() };
  await store().push(PURCHASES, JSON.stringify(purchase));
  await logEvent({ type: "buy", actor: p.payer ?? "agent", subject: p.title, detail: `$${p.priceUsd}${p.verified ? " ✓" : " ✗"}`, listingId: p.listingId, transaction: p.transaction });
  const listing = await getListing(p.listingId);
  if (listing) await store().set(listingKey(listing.id), JSON.stringify({ ...listing, sales: listing.sales + 1 }));
  return purchase;
}

export async function listPurchases(limit = 20): Promise<Purchase[]> {
  return (await store().range(PURCHASES, limit)).map((s) => JSON.parse(s) as Purchase);
}

/** All-time purchase count and volume (for the market's headline stats). */
export async function purchaseTotals(): Promise<{ count: number; volumeUsd: number; buyers: string[] }> {
  const all = await listPurchases(100_000);
  return {
    count: all.length,
    volumeUsd: Math.round(all.reduce((s, p) => s + p.priceUsd, 0) * 100) / 100,
    buyers: [...new Set(all.map((p) => p.payer).filter((p): p is string => !!p))],
  };
}

export async function updateListing(listing: Listing): Promise<void> {
  await store().set(listingKey(listing.id), JSON.stringify(listing));
}

/** One line of the live activity feed: something an agent (or the verifier) just did. */
export interface ActivityEvent {
  id: string;
  at: string;
  type: "search" | "list" | "buy" | "rate" | "vine-pass" | "vine-fail" | "suppressed";
  /** Who did it: a wallet address or an agent/seller name. */
  actor: string;
  /** What it was about: a listing title or a search query. */
  subject: string;
  /** Short result: "$0.02", "★ 5", "98/100", "3 hits". */
  detail: string;
  listingId?: string;
  transaction?: string | null;
}

const EVENTS = "market:events";

/** Records an activity event. Never throws: the feed must not break a purchase or a rating. */
export async function logEvent(e: Omit<ActivityEvent, "id" | "at"> & { at?: string }): Promise<void> {
  try {
    await store().push(EVENTS, JSON.stringify({ ...e, at: e.at ?? new Date().toISOString(), id: `${Date.now().toString(36)}${randomBytes(3).toString("hex")}` }));
  } catch (err) {
    console.warn("[activity] could not log event:", String(err).slice(0, 120));
  }
}

export async function listEvents(limit = 50): Promise<ActivityEvent[]> {
  return (await store().range(EVENTS, limit)).map((s) => JSON.parse(s) as ActivityEvent);
}

/** A seller agent's public profile, keyed by the wallet it is paid to. */
export interface SellerProfile {
  wallet: string;
  name: string;
  bio: string;
  specialties: string[];
  createdAt: string;
}

const sellerKey = (wallet: string) => `market:seller:${wallet}`;

export async function getSellerProfile(wallet: string): Promise<SellerProfile | null> {
  const raw = await store().get(sellerKey(wallet));
  return raw ? (JSON.parse(raw) as SellerProfile) : null;
}

export async function saveSellerProfile(p: SellerProfile): Promise<void> {
  await store().set(sellerKey(p.wallet), JSON.stringify(p));
}

const ratingsKey = (id: string) => `market:ratings:${id}`;

export async function listRatings(listingId: string, limit = 100): Promise<Rating[]> {
  return (await store().range(ratingsKey(listingId), limit)).map((s) => JSON.parse(s) as Rating);
}

export async function addRating(r: Omit<Rating, "createdAt">): Promise<Rating> {
  const rating: Rating = { ...r, createdAt: new Date().toISOString() };
  await store().push(ratingsKey(r.listingId), JSON.stringify(rating));
  return rating;
}
