// Spawns the Synapsis MCP server over stdio and exercises every tool, like an MCP host would.
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

const client = new Client({ name: "synapsis-test", version: "0.0.1" });
await client.connect(new StdioClientTransport({ command: "npx", args: ["tsx", "mcp/synapsis.ts"], env: { ...process.env, SYNAPSIS_URL: process.env.SYNAPSIS_URL ?? "http://localhost:3000" } as Record<string, string> }));
const show = (r: any) => (r.content?.[0]?.text ?? JSON.stringify(r)).slice(0, Number(process.env.SHOW ?? 900));
console.log("TOOLS:", (await client.listTools()).tools.map((t) => t.name).join(", "));
console.log("\n== wallet_status\n" + show(await client.callTool({ name: "wallet_status", arguments: {} })));
const search = await client.callTool({ name: "search_knowledge", arguments: { query: "EU AI Act general-purpose AI obligations" } });
console.log("\n== search_knowledge\n" + show(search));
const id = /id: (\w+)/.exec((search as any).content[0].text)?.[1];
console.log("\n== get_listing\n" + show(await client.callTool({ name: "get_listing", arguments: { id } })));
const bought = await client.callTool({ name: "buy_knowledge", arguments: { id, max_price_usd: 0.05 } });
console.log("\n== buy_knowledge\n" + show(bought));
const tx = /transaction: "(\w+)"/.exec((bought as any).content[0].text)?.[1];
console.log("\n== rate_knowledge\n" + show(await client.callTool({ name: "rate_knowledge", arguments: { id, transaction: tx, rating: 4, comment: "Covered the GPAI obligations clearly; light on enforcement detail." } })));
console.log("\n== rate_knowledge (unpaid tx refused)\n" + show(await client.callTool({ name: "rate_knowledge", arguments: { id, transaction: "1".repeat(88), rating: 5 } })));
console.log("\n== buy_knowledge (price cap refusal)\n" + show(await client.callTool({ name: "buy_knowledge", arguments: { id, max_price_usd: 0.001 } })));
if (process.env.TEST_SELL) {
  const md = "# MCP smoke test: Synapsis protocol notes\n\nShort summary written by an MCP agent to prove sell_knowledge works end to end.\n\n## Key facts\n- Files are hashed with sha256 at listing time.\n- Buyers pay per copy over x402 in devnet USDC.\n- Payments go straight to the seller's wallet.\n\n## How it works\nAn agent calls sell_knowledge with Markdown; Synapsis writes the preview with Gemini and lists it.\n";
  console.log("\n== sell_knowledge\n" + show(await client.callTool({ name: "sell_knowledge", arguments: { markdown: md, price_usd: 0.01, seller_name: "mcp-smoke-test" } })));
}
await client.close();
