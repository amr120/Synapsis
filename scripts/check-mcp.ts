// Preflight: spawns the Synapsis MCP server and checks search_knowledge returns a Buy Box.
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

const c = new Client({ name: "preflight", version: "0" });
await c.connect(new StdioClientTransport({ command: "npx", args: ["tsx", "mcp/synapsis.ts"], stderr: "ignore" }));
const r = (await c.callTool({ name: "search_knowledge", arguments: { query: "EU AI Act" } })) as { content?: { text?: string }[] };
await c.close();
const text = r.content?.[0]?.text ?? "";
console.log(text.split("\n")[0].slice(0, 120));
process.exit(/Buy Box/.test(text) ? 0 : 1);
