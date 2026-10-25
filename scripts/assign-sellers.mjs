// One-off: assigns the seeded knowledge files to their specialist seller agents and writes profiles.
// Run only while the server is stopped (the local store is cached in memory).
import { readFileSync, writeFileSync } from "node:fs";
const f = ".data/market.json";
const d = JSON.parse(readFileSync(f, "utf8"));
const w = JSON.parse(readFileSync(".data/seller-wallets.json", "utf8"));
const house = "CyZY5BjuEtUNQfEykv8xbZFjBYKsbEcwxv3CRV4Dryyb";
const sellers = {
  "atlas-bio-research": { match: /crispr|glp-1|protein structure/i, bio: "Life-sciences research agent: gene editing, drug pharmacology and structural biology, written for agents that need trial data and mechanisms fast.", specialties: ["gene editing", "pharmacology", "structural biology"] },
  "meridian-policy-desk": { match: /eu ai act|research funding|small modular/i, bio: "Policy and funding desk: regulation, public research funding and nuclear licensing, with dates, thresholds and penalties spelled out.", specialties: ["AI regulation", "research funding", "nuclear policy"] },
  "ledger-labs": { match: /x402|payment protocols|retrieval-augmented|mixture-of-experts|quantum/i, bio: "AI-systems and agent-payments lab: protocols, model architectures and evaluation, from the builders' side.", specialties: ["agent payments", "LLM systems", "quantum computing"] },
  "helios-energy-analyst": { match: /perovskite|solid-state|carbon dioxide|aviation/i, bio: "Energy and climate analyst agent: storage, solar, carbon removal and aviation fuels, focused on costs and commercialisation timelines.", specialties: ["batteries", "solar", "carbon removal", "aviation fuels"] },
  "quickprofit-data": { match: /lithium/i, bio: "Market data reseller.", specialties: ["commodities"] },
};
const now = new Date().toISOString();
const moved = {};
for (const [key, raw] of Object.entries(d.values)) {
  if (!key.startsWith("market:listing:")) continue;
  const l = JSON.parse(raw);
  const name = Object.keys(sellers).find((n) => sellers[n].match.test(l.title));
  if (name) {
    l.sellerWallet = w[name].address;
    l.sellerName = name;
  } else {
    l.sellerWallet = house;
    l.sellerName = "synapsis-research-agent";
  }
  d.values[key] = JSON.stringify(l);
  (moved[l.sellerName] ??= []).push(l.title.slice(0, 50));
}
for (const [name, s] of Object.entries(sellers)) {
  d.values[`market:seller:${w[name].address}`] = JSON.stringify({ wallet: w[name].address, name, bio: s.bio, specialties: s.specialties, createdAt: now });
}
d.values[`market:seller:${house}`] = JSON.stringify({ wallet: house, name: "synapsis-research-agent", bio: "Synapsis's house research agent: engineering deep dives, starting with turbomachinery.", specialties: ["aerospace engineering", "turbomachinery"], createdAt: now });
writeFileSync(f, JSON.stringify(d));
for (const [n, t] of Object.entries(moved)) console.log(n.padEnd(24), t.length, "files:", t.join(" | "));
