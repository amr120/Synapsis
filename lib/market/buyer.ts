import "server-only";
import { askGemini, generateWithGemini } from "../ai/gemini";
import { buy } from "../paidapi/buyer";
import { getSpendingTracker } from "../paidapi/buyer";
import { buyBox, rankListings, rateListing, WEIGHTS } from "./ranking";
import { recordPurchase, sha256, type Listing } from "./store";

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

const RATE_SCHEMA = {
  type: "object",
  properties: { rating: { type: "integer", description: "1-5" }, comment: { type: "string" } },
  required: ["rating", "comment"],
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
  buyBox?: string | null;
  overrodeBuyBox?: boolean;
  rating?: number;
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

  const ranked = await rankListings(question);
  const box = buyBox(ranked);
  const candidates = ranked.slice(0, 6);
  run.candidates = candidates.map(({ listing: { id, title, priceUsd } }) => ({ id, title, priceUsd }));
  log("search", `${ranked.length} listing${ranked.length === 1 ? "" : "s"} matched "${question}", ranked on ${Object.keys(WEIGHTS).length} signals`);
  if (candidates.length === 0) {
    run.reason = "No listing matches the question.";
    return run;
  }
  run.buyBox = box ? box.winner.listing.id : null;
  log("buy box", box ? `Default pick "${box.winner.listing.title}" (trust ${box.winner.trust}). ${box.reason}` : "No Buy Box: no strongly relevant, compliant file");

  const menu = candidates.map((r) => ({
    id: r.listing.id,
    title: r.listing.title,
    abstract: r.listing.abstract,
    answers: r.listing.capabilities?.answers ?? [],
    priceUsd: r.listing.priceUsd,
    trust: r.trust,
    verifiedRating: r.ratings,
    vineScore: r.listing.attestation?.score ?? null,
    buyBox: r.listing.id === run.buyBox,
  }));
  const choice = await generateWithGemini({
    contents: `Question: ${question}\n\nRanked listings (free previews with trust signals):\n${JSON.stringify(menu, null, 1)}\n\nDefault to the Buy Box listing. Override it only if another listing clearly answers the question better, and return null if none will answer it.`,
    config: { responseMimeType: "application/json", responseJsonSchema: CHOOSE_SCHEMA },
  });
  const picked = JSON.parse(choice.text ?? "{}") as { listingId: string | null; reason: string };
  run.reason = picked.reason ?? "";
  const listing = candidates.find((r) => r.listing.id === picked.listingId)?.listing ?? null;
  if (!listing) {
    log("evaluate", `No listing worth buying: ${run.reason}`);
    return run;
  }
  run.overrodeBuyBox = run.buyBox !== null && listing.id !== run.buyBox;
  log("evaluate", `${run.overrodeBuyBox ? "Overrode the Buy Box, chose" : run.buyBox === listing.id ? "Took the Buy Box" : "Chose"} "${listing.title}" at $${listing.priceUsd}: ${run.reason}`);
  run.chosen = listing;

  const result = await buyWithRetry(`${internalOrigin()}/api/listings/${listing.id}/content`);
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

  // Verified Rating: the agent rates what it paid for, bound to the purchase transaction.
  if (run.answer && run.transaction) {
    try {
      const judged = await generateWithGemini({
        contents: `Question: ${question}\n\nAnswer produced from the purchased file:\n${run.answer}\n\nRate 1-5 how well the purchased file answered the question, with a one-sentence comment.`,
        config: { responseMimeType: "application/json", responseJsonSchema: RATE_SCHEMA },
      });
      const r = JSON.parse(judged.text ?? "{}") as { rating: number; comment: string };
      const rating = await rateListing({ listingId: listing.id, transaction: run.transaction, rating: Math.max(1, Math.min(5, Math.round(r.rating))), comment: r.comment, rater: run.payer });
      run.rating = rating.rating;
      log("rate", `Verified Rating ${rating.rating}★: ${rating.comment}`);
    } catch (err) {
      log("rate", `Could not rate: ${err instanceof Error ? err.message : String(err)}`);
    }
  }
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
  const result = await buyWithRetry(`${internalOrigin()}/api/listings/${listing.id}/content`);
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

/** The paywall answers 5xx when the facilitator is briefly unreachable (nothing is charged): retry. */
async function buyWithRetry(url: string) {
  let result = await buy(url);
  for (let attempt = 1; result.status >= 500 && attempt <= 2; attempt++) {
    await new Promise((r) => setTimeout(r, 2000 * attempt));
    result = await buy(url);
  }
  return result;
}

export function buyerSpending() {
  return getSpendingTracker().snapshot();
}
