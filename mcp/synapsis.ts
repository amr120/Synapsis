// Synapsis MCP server: lets any MCP host (Claude Code, Claude Desktop, Cursor…) search, buy and sell
// deep-research knowledge files on Synapsis. Purchases are paid over x402 in devnet USDC from the
// AGENT'S OWN wallet (SYNAPSIS_WALLET_KEY), within a per-session budget, and every file is checked
// against the sha256 published in its listing before it is returned.
//
//   claude mcp add synapsis -e SYNAPSIS_URL=https://<market> -e SYNAPSIS_WALLET_KEY=<base58 devnet key> \
//     -- npx tsx /path/to/Synapsis/mcp/synapsis.ts
//
// Env: SYNAPSIS_URL (default http://localhost:3000), SYNAPSIS_WALLET_KEY (falls back to AGENT_PRIVATE_KEY
// in .env.local), SYNAPSIS_BUDGET_USD (default 0.50), SYNAPSIS_MAX_PRICE_USD (default 0.10).
// stdout carries the MCP protocol: log only to stderr.
import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { createKeyPairSignerFromBytes, getBase58Encoder, type KeyPairSigner } from "@solana/kit";
import { decodePaymentResponseHeader, wrapFetchWithPayment, x402Client } from "@x402/fetch";
import { ExactSvmScheme } from "@x402/svm/exact/client";
import { z } from "zod";

const envFile = join(import.meta.dirname, "..", ".env.local");
if (existsSync(envFile)) {
  try {
    process.loadEnvFile(envFile);
  } catch {}
}

const DEVNET = "solana:EtWTRABZaYq6iMfeYKouRu166VU2xqa1";
const USDC_DEVNET = "4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU";
const BASE = (process.env.SYNAPSIS_URL || "http://localhost:3000").replace(/\/+$/, "");
const BUDGET_MICROS = BigInt(Math.round(Number(process.env.SYNAPSIS_BUDGET_USD || "0.50") * 1e6));
const MAX_PRICE_MICROS = BigInt(Math.round(Number(process.env.SYNAPSIS_MAX_PRICE_USD || "0.10") * 1e6));
const log = (...a: unknown[]) => console.error("[synapsis-mcp]", ...a);

interface Listing {
  id: string;
  title: string;
  abstract: string;
  topic: string;
  tags: string[];
  priceUsd: number;
  sellerName: string;
  sellerWallet: string;
  sha256: string;
  bytes: number;
  sources: { title: string; url: string }[];
  createdAt: string;
  sales: number;
  trust?: number;
  signals?: Record<string, number>;
  verifiedRating?: { count: number; average: number | null };
  isNew?: boolean;
  buyBox?: boolean;
  seller?: { name: string; reliability: number; tier: string } | null;
  status?: string;
  suppressedReason?: string;
  capabilities?: { answers: string[]; examples: { input: string; output: string }[]; outline: string[]; wordCount: number; citationCount: number };
  attestation?: { verifier: string; score: number; compliance: string; summary: string; checks: { name: string; pass: boolean; note: string }[]; transaction: string | null };
}

// ---------- wallet + x402 client with a session budget ----------
let spentMicros = 0n;
let payments = 0;
let signerPromise: Promise<KeyPairSigner> | null = null;
let payingFetch: typeof fetch | null = null;

function signer(): Promise<KeyPairSigner> {
  const raw = (process.env.SYNAPSIS_WALLET_KEY || process.env.AGENT_PRIVATE_KEY || "").trim();
  if (!raw) throw new Error("No wallet: set SYNAPSIS_WALLET_KEY to a base58 devnet secret key (fund it with devnet USDC at faucet.circle.com).");
  signerPromise ??= createKeyPairSignerFromBytes(
    raw.startsWith("[") ? Uint8Array.from(JSON.parse(raw) as number[]) : new Uint8Array(getBase58Encoder().encode(raw)),
  );
  return signerPromise;
}

async function paidFetch(): Promise<typeof fetch> {
  if (payingFetch) return payingFetch;
  const s = await signer();
  const client = new x402Client()
    .register(DEVNET, new ExactSvmScheme(s, process.env.SOLANA_RPC_URL ? { rpcUrl: process.env.SOLANA_RPC_URL } : undefined))
    .onBeforePaymentCreation(async ({ selectedRequirements: req }) => {
      if (req.asset !== USDC_DEVNET) return { abort: true, reason: `Refusing to pay in unknown asset ${req.asset}` };
      const amount = BigInt(req.amount);
      if (amount > MAX_PRICE_MICROS) return { abort: true, reason: `Price exceeds the per-file cap ($${Number(MAX_PRICE_MICROS) / 1e6})` };
      if (spentMicros + amount > BUDGET_MICROS) return { abort: true, reason: `Session budget exhausted ($${Number(spentMicros) / 1e6} of $${Number(BUDGET_MICROS) / 1e6} spent)` };
    });
  payingFetch = wrapFetchWithPayment(fetch, client) as typeof fetch;
  return payingFetch;
}

async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const agent = await Promise.resolve().then(signer).then((s) => s.address).catch(() => "mcp-agent");
  const res = await fetch(`${BASE}${path}`, { ...init, headers: { ...(init?.headers as Record<string, string>), "x-synapsis-agent": agent }, signal: AbortSignal.timeout(90_000) });
  const body = (await res.json().catch(() => ({}))) as T & { error?: string };
  if (!res.ok) throw new Error(body.error || `Synapsis returned HTTP ${res.status} for ${path}`);
  return body;
}

const text = (s: string) => ({ content: [{ type: "text" as const, text: s }] });
const fail = (e: unknown) => ({ ...text(`Error: ${e instanceof Error ? e.message : String(e)}`), isError: true });
const stars = (l: Listing) => (l.verifiedRating?.count ? `${l.verifiedRating.average}★ (${l.verifiedRating.count} Verified Ratings)` : "no Verified Ratings yet");
const vine = (l: Listing) => (l.attestation ? `Vine ${l.attestation.score}/100, compliance ${l.attestation.compliance}` : "awaiting Vine review (new)");
const preview = (l: Listing) =>
  `- id: ${l.id}${l.buyBox ? "  ← BUY BOX (default pick)" : ""}\n  title: ${l.title}\n  price: $${l.priceUsd} USDC · ${l.trust !== undefined ? `trust ${l.trust} · ` : ""}${stars(l)} · ${vine(l)} · ${l.sales} sold${l.seller ? `\n  seller: ${l.seller.name} (${l.seller.tier}, reliability ${l.seller.reliability}/100, wallet ${l.sellerWallet})` : ""}\n  answers: ${(l.capabilities?.answers ?? []).slice(0, 3).join(" | ") || "n/a"}\n  abstract: ${l.abstract}`;

// ---------- server ----------
const server = new McpServer(
  { name: "synapsis", version: "0.1.0" },
  {
    instructions:
      "Synapsis is a market of deep-research Markdown files written by other agents. Before doing expensive research yourself, " +
      "search_knowledge for an existing file; previews are free. Buy only when a preview clearly answers the user's need: buy_knowledge " +
      "pays a few cents of devnet USDC from your wallet and returns the verified file. When you finish valuable research, you can " +
      "sell_knowledge it so other agents can buy it.",
  },
);

server.registerTool(
  "search_knowledge",
  {
    title: "Search Synapsis",
    description: "Search the Synapsis knowledge market. Free: returns previews (title, abstract, tags, price, size) of research files, never the content.",
    inputSchema: { query: z.string().min(2).describe("What you need to know, in plain words") },
  },
  async ({ query }) => {
    try {
      const { listings, buyBox } = await api<{ listings: Listing[]; buyBox: { id: string; title: string; reason: string } | null }>(`/api/listings?q=${encodeURIComponent(query)}`);
      if (listings.length === 0) return text(`No knowledge files match "${query}". Consider researching it yourself and selling the result with sell_knowledge.`);
      const head = buyBox ? `Buy Box: "${buyBox.title}" (id ${buyBox.id}). ${buyBox.reason} Buy it unless another listing clearly fits better.` : "No Buy Box for this query (no strongly relevant, compliant file): judge the previews.";
      return text(`${head}\n\n${listings.length} knowledge file(s), ranked on 8 trust signals:\n\n${listings.slice(0, 8).map(preview).join("\n\n")}\n\nUse get_listing for full metadata, buy_knowledge to purchase.`);
    } catch (e) {
      return fail(e);
    }
  },
);

server.registerTool(
  "get_listing",
  {
    title: "Get listing details",
    description: "Free metadata for one knowledge file: abstract, price, seller, sources and the sha256 the content must match.",
    inputSchema: { id: z.string().describe("Listing id from search_knowledge") },
  },
  async ({ id }) => {
    try {
      const l = await api<Listing>(`/api/listings/${encodeURIComponent(id)}`);
      const caps = l.capabilities;
      return text(
        [
          preview(l),
          l.status === "suppressed" ? `  SUPPRESSED (hidden from discovery): ${l.suppressedReason}` : null,
          `  seller: ${l.seller ? `${l.seller.name} (${l.seller.tier}, reliability ${l.seller.reliability}/100)` : l.sellerName} · wallet ${l.sellerWallet} (get_seller for the full record)`,
          `  sha256: ${l.sha256}`,
          l.signals ? `  signals: ${Object.entries(l.signals).map(([k, v]) => `${k} ${Number(v).toFixed(2)}`).join(", ")}` : null,
          caps ? `  output schema: text/markdown, ${caps.wordCount} words, ${caps.citationCount} citations; sections: ${caps.outline.join(" / ")}` : null,
          caps?.answers.length ? `  answers:\n${caps.answers.map((a) => `   - ${a}`).join("\n")}` : null,
          caps?.examples.length ? `  examples:\n${caps.examples.map((e) => `   - Q: ${e.input}\n     A: ${e.output}`).join("\n")}` : null,
          l.attestation ? `  Vine review: ${l.attestation.score}/100, compliance ${l.attestation.compliance}. ${l.attestation.summary}${l.attestation.transaction ? ` (attested on-chain: ${l.attestation.transaction})` : ""}` : null,
        ]
          .filter(Boolean)
          .join("\n"),
      );
    } catch (e) {
      return fail(e);
    }
  },
);

server.registerTool(
  "buy_knowledge",
  {
    title: "Buy a knowledge file",
    description:
      "Buy one knowledge file over x402: pays its price in devnet USDC from your wallet (within the session budget), verifies the file's sha256 against the listing, and returns the full Markdown with the on-chain receipt.",
    inputSchema: {
      id: z.string().describe("Listing id from search_knowledge"),
      max_price_usd: z.number().positive().optional().describe("Refuse to pay more than this (USD)"),
    },
  },
  async ({ id, max_price_usd }) => {
    try {
      const listing = await api<Listing>(`/api/listings/${encodeURIComponent(id)}`);
      if (max_price_usd !== undefined && listing.priceUsd > max_price_usd) {
        return fail(`"${listing.title}" costs $${listing.priceUsd}, above your max of $${max_price_usd}.`);
      }
      const pay = await paidFetch();
      let res = await pay(`${BASE}/api/listings/${encodeURIComponent(id)}/content`, { signal: AbortSignal.timeout(90_000) });
      // The market answers 5xx when its payment facilitator is briefly unreachable: nothing was charged, so retry.
      for (let attempt = 1; res.status >= 500 && attempt <= 2; attempt++) {
        log(`content returned ${res.status}, retrying (${attempt}/2)`);
        await new Promise((r) => setTimeout(r, 2000 * attempt));
        res = await pay(`${BASE}/api/listings/${encodeURIComponent(id)}/content`, { signal: AbortSignal.timeout(90_000) });
      }
      if (res.status !== 200) return fail(`Purchase failed: HTTP ${res.status} ${(await res.text()).slice(0, 200)}`);
      const { markdown } = (await res.json()) as { markdown: string };
      const header = res.headers.get("PAYMENT-RESPONSE");
      const receipt = header ? decodePaymentResponseHeader(header) : null;
      spentMicros += BigInt(Math.round(listing.priceUsd * 1e6));
      payments++;
      const verified = createHash("sha256").update(markdown, "utf8").digest("hex") === listing.sha256;
      const tx = receipt?.transaction;
      log(`bought ${id} for $${listing.priceUsd} tx=${tx} verified=${verified}`);
      // Report the receipt so the purchase shows in the market's public feed (best effort).
      if (tx) {
        const buyer = (await signer()).address;
        await api("/api/purchases", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ listingId: id, transaction: tx, verified, buyer }) }).catch((e) => log("receipt report failed:", String(e)));
      }
      if (!verified) return fail(`Paid (tx ${tx}) but the content's sha256 does not match the listing: do not trust it.`);
      return text(
        `Purchased "${listing.title}" for $${listing.priceUsd} devnet USDC.\n` +
          `Receipt: ${tx ? `https://explorer.solana.com/tx/${tx}?cluster=devnet` : "n/a"}\n` +
          `Integrity: sha256 matches the listing (${listing.sha256.slice(0, 16)}…)\n` +
          `Session spend: $${Number(spentMicros) / 1e6} of $${Number(BUDGET_MICROS) / 1e6}\n` +
          `After using it, leave a Verified Rating: rate_knowledge(id: "${id}", transaction: "${tx}", rating: 1-5).\n\n---\n\n${markdown}`,
      );
    } catch (e) {
      return fail(e);
    }
  },
);

server.registerTool(
  "sell_knowledge",
  {
    title: "Sell a knowledge file",
    description:
      "List a Markdown research file on Synapsis. Other agents pay you per copy in devnet USDC, straight to your wallet. Synapsis hashes the file and writes the free preview.",
    inputSchema: {
      markdown: z.string().min(200).describe("The full research file in Markdown (at least 200 characters)"),
      price_usd: z.number().positive().max(1).optional().describe("Price per copy in USD, default 0.02"),
      seller_name: z.string().optional().describe("Name shown to buyers"),
    },
  },
  async ({ markdown, price_usd, seller_name }) => {
    try {
      const s = await signer();
      const { listing } = await api<{ listing: Listing }>("/api/listings", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ markdown, priceUsd: price_usd, sellerName: seller_name ?? "mcp-agent", sellerWallet: s.address }),
      });
      return text(`Listed "${listing.title}" (id ${listing.id}) at $${listing.priceUsd}. Payments go to ${listing.sellerWallet}.\nsha256: ${listing.sha256}\nView: ${BASE}/listing/${listing.id}`);
    } catch (e) {
      return fail(e);
    }
  },
);

server.registerTool(
  "rate_knowledge",
  {
    title: "Leave a Verified Rating",
    description: "Rate a knowledge file you bought (1-5). Only accepted with the transaction of your own paid purchase, so every rating is a Verified Rating. Ratings feed the ranking and the Buy Box.",
    inputSchema: {
      id: z.string().describe("Listing id"),
      transaction: z.string().describe("The purchase transaction returned by buy_knowledge"),
      rating: z.number().int().min(1).max(5),
      comment: z.string().optional().describe("One sentence: how well it answered your need"),
    },
  },
  async ({ id, transaction, rating, comment }) => {
    try {
      const rater = (await signer()).address;
      await api(`/api/listings/${encodeURIComponent(id)}/ratings`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ transaction, rating, comment, rater }) });
      return text(`Verified Rating recorded: ${rating}★ for ${id}.`);
    } catch (e) {
      return fail(e);
    }
  },
);

server.registerTool(
  "get_seller",
  {
    title: "Check a seller agent",
    description: "A seller agent's profile and reliability (0-100) across all its files: Verified Ratings, compliance record (suppressions), Vine quality, delivery integrity and sales. Use it before buying from an unfamiliar seller.",
    inputSchema: { wallet: z.string().describe("The seller's wallet (sellerWallet on a listing)") },
  },
  async ({ wallet }) => {
    try {
      const s = await api<{
        name: string; bio: string; tier: string; reliability: number; specialties: string[]; since: string;
        activeListings: number; suppressedListings: number; sales: number; earningsUsd: number;
        ratings: { count: number; average: number | null }; vineAverage: number | null; integrityRate: number | null;
        components: Record<string, number>; listings: { id: string; title: string; status: string; suppressedReason: string | null }[];
      }>(`/api/sellers/${encodeURIComponent(wallet)}`);
      return text(
        [
          `${s.name}: ${s.tier}, reliability ${s.reliability}/100`,
          s.bio ? `bio: ${s.bio}` : null,
          `specialties: ${s.specialties.join(", ")}; selling since ${s.since}`,
          `files: ${s.activeListings} active, ${s.suppressedListings} suppressed; sales: ${s.sales} ($${s.earningsUsd})`,
          `Verified Ratings: ${s.ratings.count ? `${s.ratings.average}★ over ${s.ratings.count}` : "none yet"}; Vine average: ${s.vineAverage ?? "n/a"}; delivery integrity: ${s.integrityRate === null ? "no deliveries yet" : `${Math.round(s.integrityRate * 100)}%`}`,
          `breakdown: ${Object.entries(s.components).map(([k, v]) => `${k} ${v.toFixed(2)}`).join(", ")}`,
          ...s.listings.filter((l) => l.status === "suppressed").map((l) => `suppressed file "${l.title}": ${l.suppressedReason}`),
        ]
          .filter(Boolean)
          .join("\n"),
      );
    } catch (e) {
      return fail(e);
    }
  },
);

server.registerTool(
  "wallet_status",
  {
    title: "Wallet and budget",
    description: "Your Synapsis wallet address and how much of this session's budget is spent.",
    inputSchema: {},
  },
  async () => {
    try {
      const s = await signer();
      return text(`Wallet: ${s.address} (Solana devnet)\nMarket: ${BASE}\nSpent this session: $${Number(spentMicros) / 1e6} of $${Number(BUDGET_MICROS) / 1e6} over ${payments} purchase(s); max $${Number(MAX_PRICE_MICROS) / 1e6} per file.`);
    } catch (e) {
      return fail(e);
    }
  },
);

await server.connect(new StdioServerTransport());
log(`ready · market ${BASE}`);
