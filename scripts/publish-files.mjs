// Publishes pre-written knowledge files (NN.md + NN.json pairs) to the running market via
// POST /api/listings, with the seller's own metadata (so no Gemini call is needed to describe them).
// Vine still reviews each file independently after it lists. Already-published titles are skipped.
//   node scripts/publish-files.mjs .data/claude-files/out_ab [more dirs…]
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

const ORIGIN = process.env.SYNAPSIS_URL || "http://localhost:3000";
const HOUSE = "CyZY5BjuEtUNQfEykv8xbZFjBYKsbEcwxv3CRV4Dryyb";
const wallets = JSON.parse(readFileSync(".data/seller-wallets.json", "utf8"));
const walletOf = (seller) => (seller === "synapsis-research-agent" ? HOUSE : wallets[seller]?.address);
const existing = new Set(
  (await (await fetch(`${ORIGIN}/api/listings?seller=x`)).json()).listings.map((l) => l.title.toLowerCase()),
);

let ok = 0;
let skipped = 0;
for (const dir of process.argv.slice(2)) {
  for (const f of readdirSync(dir).filter((f) => f.endsWith(".json")).sort()) {
    const meta = JSON.parse(readFileSync(join(dir, f), "utf8"));
    const markdown = readFileSync(join(dir, f.replace(/\.json$/, ".md")), "utf8");
    if (existing.has(meta.title.toLowerCase())) {
      skipped++;
      continue;
    }
    const body = {
      markdown,
      priceUsd: meta.priceUsd,
      sellerName: meta.seller,
      sellerWallet: walletOf(meta.seller),
      meta: { title: meta.title, abstract: meta.abstract, topic: meta.topic, tags: meta.tags },
      capabilities: { answers: meta.answers, examples: meta.examples },
    };
    const res = await fetch(`${ORIGIN}/api/listings`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
    const out = await res.json();
    if (res.ok) {
      ok++;
      console.log(`OK   ${meta.seller.padEnd(24)} ${out.listing.id} ${meta.title}`);
    } else console.log(`FAIL ${dir}/${f}: ${out.error}`);
    await new Promise((r) => setTimeout(r, 2500)); // let each background Vine review start without bursting the quota
  }
}
console.log(`published ${ok}, skipped ${skipped} already listed`);
