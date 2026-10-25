import "server-only";
import { askGemini, generateWithGemini } from "../ai/gemini";
import { buy } from "../paidapi/buyer";
import { getSpendingTracker } from "../paidapi/buyer";
import { listListings, recordPurchase, searchListings, sha256, type Listing } from "./store";

// The buyer agent: given a question, it searches Synapsis, judges the free abstracts, buys the
// best file over x402 (within its spending limits), checks the file's hash against the listing,
// and answers from the purchased knowledge with citations.

const CHOOSE_SCHEMA = {
  type: "object",
  properties: {
    listingId: { type: ["string", "null"], description: "id of the one listing worth buying, or null if none will answer the question" },
    reason: { type: "string", description: "one sentence: why this listing (or why none)" },
  },
  required: ["listingId", "reason"],
};

const ANSWER_SYSTEM =
  "You are a Synapsis buyer agent answering from a knowledge file you just purchased. Use only the file. " +
  "Answer directly first, then supporting points. Cite the file's section headings in brackets, e.g. [Key facts]. " +
  "If the file does not cover the question, say so plainly.";

export interface BuyerStep {
  step: string;
  detail: string;
}

export interface BuyerRun {
  question: string;
  steps: BuyerStep[];
  candidates: Pick<Listing, "id" | "title" | "priceUsd">[];
  chosen: Listing | null;
  reason: string;
  transaction: string | null;
  payer: string | null;
  verified: boolean;
  answer: string | null;
  spentUsd: string | null;
  error?: string;
}

/** Where this server reaches its own API. The tunnel or public URL isn't needed for a self-call. */
export function internalOrigin(): string {
  if (process.env.MARKET_ORIGIN) return process.env.MARKET_ORIGIN.replace(/\/+$/, "");
  if (process.env.VERCEL_URL) return `https://${process.env.VERCEL_URL}`;
  return `http://localhost:${process.env.PORT || 3000}`;
}

export async function runBuyer(question: string): Promise<BuyerRun> {
  const run: BuyerRun = { question, steps: [], candidates: [], chosen: null, reason: "", transaction: null, payer: null, verified: false, answer: null, spentUsd: null };
  const log = (step: string, detail: string) => run.steps.push({ step, detail });

  let candidates = await searchListings(question);
  if (candidates.length === 0) candidates = await listListings(15);
  run.candidates = candidates.map(({ id, title, priceUsd }) => ({ id, title, priceUsd }));
  log("search", `${candidates.length} listing${candidates.length === 1 ? "" : "s"} matched "${question}"`);
  if (candidates.length === 0) {
    run.reason = "The market has no listings yet.";
    return run;
  }

  const menu = candidates.map((l) => ({ id: l.id, title: l.title, abstract: l.abstract, tags: l.tags, priceUsd: l.priceUsd, sources: l.sources.length }));
  const choice = await generateWithGemini({
    contents: `Question: ${question}\n\nListings (free previews):\n${JSON.stringify(menu, null, 1)}\n\nPick the single listing most likely to answer the question, or null if none will. Prefer relevance, then more sources, then lower price.`,
    config: { responseMimeType: "application/json", responseJsonSchema: CHOOSE_SCHEMA },
  });
  const picked = JSON.parse(choice.text ?? "{}") as { listingId: string | null; reason: string };
  run.reason = picked.reason ?? "";
  const listing = candidates.find((l) => l.id === picked.listingId) ?? null;
  if (!listing) {
    log("evaluate", `No listing worth buying: ${run.reason}`);
    return run;
  }
  run.chosen = listing;
  log("evaluate", `Chose "${listing.title}" at $${listing.priceUsd}: ${run.reason}`);

  const result = await buy(`${internalOrigin()}/api/listings/${listing.id}/content`);
  run.spentUsd = result.spending.spentUsd;
  if (result.status !== 200) {
    run.error = result.paymentError ? `Payment rejected: ${result.paymentError}` : `Content request returned HTTP ${result.status}`;
    log("pay", run.error);
    return run;
  }
  run.transaction = result.receipt?.transaction ?? null;
  run.payer = result.receipt?.payer ?? null;
  log("pay", `Paid $${listing.priceUsd} devnet USDC over x402${run.transaction ? ` (tx ${run.transaction.slice(0, 10)}…)` : ""}`);

  const markdown = (result.data as { markdown?: string }).markdown ?? "";
  run.verified = sha256(markdown) === listing.sha256;
  log("verify", run.verified ? `sha256 matches the listing (${listing.sha256.slice(0, 12)}…)` : "sha256 does NOT match the listing: content was altered");

  if (run.verified) {
    run.answer = (await askGemini(`Question: ${question}\n\n--- Purchased knowledge file ---\n${markdown}`, { system: ANSWER_SYSTEM })).trim();
    log("answer", "Answered from the purchased file");
  }

  await recordPurchase({
    listingId: listing.id,
    title: listing.title,
    priceUsd: listing.priceUsd,
    transaction: run.transaction,
    payer: run.payer,
    question,
    verified: run.verified,
  });
  return run;
}

export interface ListingPurchase {
  listing: Listing;
  markdown: string | null;
  verified: boolean;
  transaction: string | null;
  spentUsd: string;
  error?: string;
}

/** Buys one specific listing (the "Buy & read" button): pay over x402, then verify the hash. */
export async function buyListing(listing: Listing): Promise<ListingPurchase> {
  const result = await buy(`${internalOrigin()}/api/listings/${listing.id}/content`);
  if (result.status !== 200) {
    const error = result.paymentError ? `Payment rejected: ${result.paymentError}` : `Content request returned HTTP ${result.status}`;
    return { listing, markdown: null, verified: false, transaction: null, spentUsd: result.spending.spentUsd, error };
  }
  const markdown = (result.data as { markdown?: string }).markdown ?? "";
  const verified = sha256(markdown) === listing.sha256;
  const transaction = result.receipt?.transaction ?? null;
  await recordPurchase({ listingId: listing.id, title: listing.title, priceUsd: listing.priceUsd, transaction, payer: result.receipt?.payer ?? null, question: null, verified });
  return { listing, markdown, verified, transaction, spentUsd: result.spending.spentUsd };
}

export function buyerSpending() {
  return getSpendingTracker().snapshot();
}
