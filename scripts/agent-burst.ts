// A short burst of real market activity from independent buyer agents. Each agent connects to the
// Synapsis MCP server with ITS OWN devnet wallet, searches, takes the Buy Box, pays over x402, and
// leaves a Verified Rating that Gemini judges from how well the file answered its question.
//   npx tsx scripts/agent-burst.ts            (needs scripts/seed-buyers.ts to have run)
import { readFileSync } from "node:fs";
import { GoogleGenAI } from "@google/genai";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

process.loadEnvFile(".env.local");
const wallets = JSON.parse(readFileSync(".data/buyer-wallets.json", "utf8")) as Record<string, { address: string; secret: string }>;
const QUESTIONS: Record<string, string[]> = {
  "climate-scout": ["direct air capture cost per tonne versus enhanced weathering and biochar", "solid-state battery commercialisation timeline and bottlenecks"],
  "policy-analyst": ["EU AI Act systemic risk compute threshold for general-purpose AI", "how ARIA funding differs from UKRI research councils"],
  "biotech-agent": ["prime editing versus base editing clinical trial status", "AlphaFold 3 limitations and open-source alternatives"],
  "dev-copilot": ["x402 payments on Solana: who pays the network fee", "mixture-of-experts routing and load balancing"],
};
const gemini = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY! });
const pause = (ms: number) => new Promise((r) => setTimeout(r, ms));
const text = (r: unknown) => ((r as { content?: { text?: string }[] }).content?.[0]?.text ?? "");

async function judge(question: string, file: string): Promise<{ rating: number; comment: string } | null> {
  for (const model of ["gemini-3.5-flash-lite", "gemini-3.5-flash", "gemini-3.1-flash-lite"]) {
    try {
      const r = await gemini.models.generateContent({
        model,
        contents: `Question: ${question}\n\nPurchased knowledge file:\n${file.slice(0, 20000)}\n\nRate 1-5 how well this file answers the question. Be honest: 5 only if it answers directly with specifics. One-sentence comment.`,
        config: { responseMimeType: "application/json", responseJsonSchema: { type: "object", properties: { rating: { type: "integer" }, comment: { type: "string" } }, required: ["rating", "comment"] } },
      });
      const j = JSON.parse(r.text ?? "{}") as { rating: number; comment: string };
      return { rating: Math.max(1, Math.min(5, Math.round(j.rating))), comment: j.comment };
    } catch {
      await pause(1500);
    }
  }
  return null;
}

const clients: Record<string, Client> = {};
for (const name of Object.keys(QUESTIONS)) {
  const c = new Client({ name, version: "1.0.0" });
  await c.connect(new StdioClientTransport({ command: "npx", args: ["tsx", "mcp/synapsis.ts"], env: { ...process.env, SYNAPSIS_WALLET_KEY: wallets[name].secret, SYNAPSIS_BUDGET_USD: "0.30" } as Record<string, string> }));
  clients[name] = c;
}

// Round-robin so the feed shows different agents interleaving.
for (let round = 0; round < 2; round++) {
  for (const [name, qs] of Object.entries(QUESTIONS)) {
    const c = clients[name];
    const question = qs[round];
    const tag = `${name.padEnd(15)}`;
    const found = text(await c.callTool({ name: "search_knowledge", arguments: { query: question } }));
    const id = /Buy Box: .*?\(id (\w+)\)/.exec(found)?.[1] ?? /id: (\w+)/.exec(found)?.[1];
    if (!id) {
      console.log(`${tag} search "${question}" → no match`);
      continue;
    }
    await pause(2500);
    const bought = text(await c.callTool({ name: "buy_knowledge", arguments: { id, max_price_usd: 0.05 } }));
    const tx = /transaction: "(\w+)"/.exec(bought)?.[1];
    const title = /Purchased "([^"]+)"/.exec(bought)?.[1];
    if (!tx) {
      console.log(`${tag} buy ${id} failed: ${bought.slice(0, 120)}`);
      continue;
    }
    console.log(`${tag} bought "${title}" tx ${tx.slice(0, 10)}…`);
    const verdict = await judge(question, bought.split("\n---\n").slice(1).join("\n---\n"));
    if (verdict) {
      await pause(2000);
      const r = text(await c.callTool({ name: "rate_knowledge", arguments: { id, transaction: tx, rating: verdict.rating, comment: verdict.comment } }));
      console.log(`${tag} rated ${verdict.rating}★ (${r.startsWith("Verified") ? "recorded" : r.slice(0, 80)})`);
    }
    await pause(3000);
  }
}
for (const c of Object.values(clients)) await c.close();
