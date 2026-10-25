// The demo's "agent moment" without Claude Code: an agent with its own devnet wallet uses the
// Synapsis MCP server to search, check the seller, buy, verify, answer with citations and rate.
//   npx tsx scripts/demo-agent.ts ["question"]
import { readFileSync } from "node:fs";
import { GoogleGenAI } from "@google/genai";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

process.loadEnvFile(".env.local");
const question = process.argv[2] ?? "What does the EU AI Act require of general-purpose AI model providers?";
const wallets = JSON.parse(readFileSync(".data/buyer-wallets.json", "utf8")) as Record<string, { secret: string }>;
const gemini = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY! });
const model = process.env.GEMINI_MODEL || "gemini-3.5-flash-lite";
const text = (r: unknown) => ((r as { content?: { text?: string }[] }).content?.[0]?.text ?? "");
const step = (n: number, s: string) => console.log(`\n\x1b[1m${n}. ${s}\x1b[0m`);
const pause = (ms: number) => new Promise((r) => setTimeout(r, ms));

const c = new Client({ name: "policy-analyst", version: "1.0.0" });
await c.connect(new StdioClientTransport({ command: "npx", args: ["tsx", "mcp/synapsis.ts"], stderr: "ignore", env: { ...process.env, SYNAPSIS_WALLET_KEY: wallets["policy-analyst"].secret } as Record<string, string> }));
console.log(`Agent "policy-analyst" asks: ${question}`);

step(1, "search_knowledge: free previews");
const found = text(await c.callTool({ name: "search_knowledge", arguments: { query: question } }));
console.log(found.split("\n").slice(0, 7).join("\n"));
const id = /Buy Box: .*?\(id (\w+)\)/.exec(found)?.[1] ?? /id: (\w+)/.exec(found)?.[1];
const wallet = /wallet (\w{32,44})\)/.exec(found)?.[1];
await pause(1500);

if (wallet) {
  step(2, "get_seller: is the seller reliable?");
  console.log(text(await c.callTool({ name: "get_seller", arguments: { wallet } })).split("\n").slice(0, 4).join("\n"));
  await pause(1500);
}

step(3, "buy_knowledge: pay over x402 from its own wallet, verify sha256");
const bought = text(await c.callTool({ name: "buy_knowledge", arguments: { id, max_price_usd: 0.05 } }));
console.log(bought.split("\n").slice(0, 4).join("\n"));
const tx = /transaction: "(\w+)"/.exec(bought)?.[1];
const file = bought.split("\n---\n").slice(1).join("\n---\n");

step(4, "Answer from the purchased file, with citations");
const answer = await gemini.models.generateContent({
  model,
  contents: `Question: ${question}\n\nPurchased knowledge file:\n${file}\n\nAnswer in 4-6 bullet points using only the file. Cite section headings in brackets.`,
});
console.log(answer.text);

step(5, "rate_knowledge: a review backed by the payment");
const judged = await gemini.models.generateContent({
  model,
  contents: `Question: ${question}\n\nFile:\n${file.slice(0, 15000)}\n\nRate 1-5 how well the file answers the question, with a one-sentence comment.`,
  config: { responseMimeType: "application/json", responseJsonSchema: { type: "object", properties: { rating: { type: "integer" }, comment: { type: "string" } }, required: ["rating", "comment"] } },
});
const v = JSON.parse(judged.text ?? "{}") as { rating: number; comment: string };
console.log(text(await c.callTool({ name: "rate_knowledge", arguments: { id, transaction: tx, rating: Math.max(1, Math.min(5, v.rating)), comment: v.comment } })), "-", v.comment);
if (tx) console.log(`\nReceipt: https://explorer.solana.com/tx/${tx}?cluster=devnet`);
await c.close();
