// Copies the local market store (.data/market.json) into Upstash Redis, so a Vercel deployment
// serves the same listings, files, purchases, ratings, sellers and activity.
//   UPSTASH_REDIS_REST_URL=... UPSTASH_REDIS_REST_TOKEN=... node scripts/migrate-to-upstash.mjs
// (also reads KV_REST_API_URL / KV_REST_API_TOKEN, as set by Vercel's Upstash integration)
import { readFileSync } from "node:fs";

try {
  process.loadEnvFile(".env.local");
} catch {}
const url = (process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL || "").replace(/\/+$/, "");
const token = process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN || "";
if (!url || !token) throw new Error("Set UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN (or KV_REST_API_URL / KV_REST_API_TOKEN).");

const data = JSON.parse(readFileSync(".data/market.json", "utf8"));
async function pipeline(cmds) {
  const res = await fetch(`${url}/pipeline`, { method: "POST", headers: { authorization: `Bearer ${token}`, "content-type": "application/json" }, body: JSON.stringify(cmds) });
  if (!res.ok) throw new Error(`Upstash returned ${res.status}: ${await res.text()}`);
}

const values = Object.entries(data.values);
for (let i = 0; i < values.length; i += 50) await pipeline(values.slice(i, i + 50).map(([k, v]) => ["SET", k, v]));
// Local lists are stored newest-first; the app reads them with LRANGE 0..n, so keep the same order.
for (const [key, items] of Object.entries(data.lists)) {
  await pipeline([["DEL", key]]);
  for (let i = 0; i < items.length; i += 100) await pipeline([["RPUSH", key, ...items.slice(i, i + 100)]]);
}
console.log(`Migrated ${values.length} values and ${Object.keys(data.lists).length} lists (${Object.values(data.lists).reduce((t, l) => t + l.length, 0)} items) to Upstash.`);
