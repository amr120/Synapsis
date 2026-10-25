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

export async function listListings(limit = 100): Promise<Listing[]> {
  const ids = await store().range(LISTINGS, limit);
  const listings = await Promise.all(ids.map(getListing));
  return listings.filter((l): l is Listing => l !== null);
}

/** Keyword search over title, abstract, topic and tags. Returns the best matches first. */
export async function searchListings(query: string, limit = 8): Promise<Listing[]> {
  const all = await listListings();
  const terms = query.toLowerCase().split(/\W+/).filter((t) => t.length > 2);
  if (terms.length === 0) return all.slice(0, limit);
  const score = (l: Listing) => {
    const title = l.title.toLowerCase();
    const body = `${l.abstract} ${l.topic} ${l.tags.join(" ")}`.toLowerCase();
    return terms.reduce((s, t) => s + (title.includes(t) ? 3 : 0) + (body.includes(t) ? 1 : 0), 0);
  };
  return all
    .map((l) => ({ l, s: score(l) }))
    .filter((x) => x.s > 0)
    .sort((a, b) => b.s - a.s)
    .slice(0, limit)
    .map((x) => x.l);
}

export async function recordPurchase(p: Omit<Purchase, "id" | "createdAt">): Promise<Purchase> {
  const purchase: Purchase = { ...p, id: newId(), createdAt: new Date().toISOString() };
  await store().push(PURCHASES, JSON.stringify(purchase));
  const listing = await getListing(p.listingId);
  if (listing) await store().set(listingKey(listing.id), JSON.stringify({ ...listing, sales: listing.sales + 1 }));
  return purchase;
}

export async function listPurchases(limit = 20): Promise<Purchase[]> {
  return (await store().range(PURCHASES, limit)).map((s) => JSON.parse(s) as Purchase);
}
