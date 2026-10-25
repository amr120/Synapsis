import "server-only";
import { isAddress } from "@solana/kit";
import { generateWithGemini } from "../ai/gemini";
import { getPayToAddress } from "../payments/config";
import { createListing, getSellerProfile, saveSellerProfile, type Listing, type Source } from "./store";
import { describeCapabilities, enrichAndReview } from "./vine";

// The seller agent: researches a topic with Gemini (grounded in Google Search when available),
// writes a sourced Markdown knowledge file, describes it, and lists it for sale.

const RESEARCH_SYSTEM =
  "You are a Synapsis research agent. Write a dense, well-structured Markdown knowledge file that another AI agent " +
  "would pay for: concrete facts, figures, dates, names, mechanisms and trade-offs, not generic prose. " +
  "Structure: '# Title', a 2-3 sentence summary, '## Key facts' (bullets), 3-5 topical '##' sections, " +
  "'## Open questions'. Cite sources inline as [n] where possible. 600-1000 words.";

const DESCRIBE_SCHEMA = {
  type: "object",
  properties: {
    title: { type: "string", description: "Specific title, max 80 characters" },
    abstract: { type: "string", description: "2-3 sentence free preview: what a buyer learns, without giving the content away" },
    topic: { type: "string", description: "Broad topic area, 1-3 words" },
    tags: { type: "array", items: { type: "string" }, description: "3-6 lowercase search tags" },
  },
  required: ["title", "abstract", "topic", "tags"],
};

export interface PublishInput {
  markdown: string;
  priceUsd?: number;
  sellerName?: string;
  sellerWallet?: string;
  sellerBio?: string;
  sources?: Source[];
}

export const defaultPriceUsd = () => Number(process.env.MARKET_DEFAULT_PRICE_USD || "0.02");

/** Lists a Markdown file: Gemini writes the public metadata, the server hashes the content. */
export async function publishMarkdown(input: PublishInput): Promise<Listing> {
  const markdown = input.markdown.trim();
  if (markdown.length < 200) throw new Error("A knowledge file needs at least 200 characters of Markdown.");
  const priceUsd = input.priceUsd ?? defaultPriceUsd();
  if (!(priceUsd > 0 && priceUsd <= 1)) throw new Error("priceUsd must be between 0 and 1 (devnet USDC).");
  const sellerWallet = input.sellerWallet?.trim() || getPayToAddress();
  if (!isAddress(sellerWallet)) throw new Error("sellerWallet is not a Solana address.");

  const response = await generateWithGemini({
    contents: `Describe this knowledge file for a marketplace listing.\n\n${markdown.slice(0, 12_000)}`,
    config: { responseMimeType: "application/json", responseJsonSchema: DESCRIBE_SCHEMA },
  });
  const meta = JSON.parse(response.text ?? "{}") as { title: string; abstract: string; topic: string; tags: string[] };

  const capabilities = await describeCapabilities(markdown, input.sources?.length ?? 0).catch((err) => {
    console.warn("[seller] capability extraction failed:", String(err).slice(0, 120));
    return undefined;
  });
  const listing = await createListing(
    {
      capabilities,
      status: "active",
      title: meta.title,
      abstract: meta.abstract,
      topic: meta.topic,
      tags: (meta.tags ?? []).map((t) => t.toLowerCase()).slice(0, 6),
      priceUsd,
      sellerName: input.sellerName?.trim() || "synapsis-research-agent",
      sellerWallet,
      sources: input.sources ?? [],
    },
    markdown,
  );
  // First listing from this wallet creates the seller agent's public profile.
  if (!(await getSellerProfile(sellerWallet))) {
    await saveSellerProfile({ wallet: sellerWallet, name: listing.sellerName, bio: input.sellerBio?.trim().slice(0, 300) ?? "", specialties: [meta.topic], createdAt: listing.createdAt });
  }
  // Vine review runs in the background: the listing is live (marked "New") until it lands.
  void enrichAndReview(listing.id).catch((err) => console.warn("[vine] review failed:", String(err).slice(0, 160)));
  return listing;
}

/** Deep-researches a topic and returns the Markdown plus the web sources it was grounded in. */
export async function researchTopic(topic: string): Promise<{ markdown: string; sources: Source[] }> {
  const prompt = `Research this topic and write the knowledge file: ${topic}`;
  let response;
  // Search grounding has no free-tier quota on most keys, so it's opt-in (MARKET_SEARCH_GROUNDING=1).
  if (process.env.MARKET_SEARCH_GROUNDING === "1") {
    try {
      response = await generateWithGemini({ contents: prompt, config: { systemInstruction: RESEARCH_SYSTEM, tools: [{ googleSearch: {} }] } });
    } catch (err) {
      console.warn("[seller] grounded research failed, retrying without search:", String(err).slice(0, 160));
    }
  }
  response ??= await generateWithGemini({ contents: prompt, config: { systemInstruction: RESEARCH_SYSTEM } });
  const chunks = response.candidates?.[0]?.groundingMetadata?.groundingChunks ?? [];
  const seen = new Set<string>();
  const sources: Source[] = [];
  for (const c of chunks) {
    const url = c.web?.uri;
    if (url && !seen.has(url)) {
      seen.add(url);
      sources.push({ title: c.web?.title || url, url });
    }
  }
  let markdown = (response.text ?? "").trim();
  if (sources.length > 0 && !/^## Sources/m.test(markdown)) {
    markdown += `\n\n## Sources\n${sources.map((s, i) => `${i + 1}. [${s.title}](${s.url})`).join("\n")}\n`;
  }
  return { markdown, sources };
}

/** The whole seller flow: research → write → describe → list. */
export async function researchAndList(topic: string, opts: Omit<PublishInput, "markdown" | "sources"> = {}): Promise<Listing> {
  const { markdown, sources } = await researchTopic(topic);
  return publishMarkdown({ ...opts, markdown, sources });
}
