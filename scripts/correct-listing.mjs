// Publishes a corrected version of a knowledge pack in place: replaces its Markdown, recomputes the
// sha256, size and structure, optionally patches listing metadata, and writes the local store
// atomically so the running server picks it up. Re-run the quality check afterwards:
//   node scripts/correct-listing.mjs <listingId> <corrected.md> [metadata-patch.json]
//   curl -X POST localhost:3000/api/listings/<listingId>/verify
import { createHash } from "node:crypto";
import { readFileSync, renameSync, writeFileSync } from "node:fs";

const [id, mdPath, patchPath] = process.argv.slice(2);
if (!id || !mdPath) throw new Error("usage: node scripts/correct-listing.mjs <listingId> <corrected.md> [patch.json]");
const FILE = ".data/market.json";
const data = JSON.parse(readFileSync(FILE, "utf8"));
const key = `market:listing:${id}`;
if (!data.values[key]) throw new Error(`No listing ${id}`);

const markdown = readFileSync(mdPath, "utf8").trim() + "\n";
const listing = JSON.parse(data.values[key]);
const before = listing.sha256;
const outline = [...markdown.matchAll(/^#{1,3}\s+(.+)$/gm)].map((m) => m[1].trim()).slice(0, 20);
const wordCount = markdown.split(/\s+/).filter(Boolean).length;
const citationCount = new Set(markdown.match(/\[\d+\]/g) ?? []).size + (markdown.match(/\]\(https?:\/\//g) ?? []).length + (listing.sources?.length ?? 0);

const patch = patchPath ? JSON.parse(readFileSync(patchPath, "utf8")) : {};
const updated = {
  ...listing,
  ...patch.listing,
  sha256: createHash("sha256").update(markdown, "utf8").digest("hex"),
  bytes: Buffer.byteLength(markdown, "utf8"),
  capabilities: { ...listing.capabilities, ...patch.capabilities, outline, wordCount, citationCount },
  correctedAt: new Date().toISOString(),
};
data.values[key] = JSON.stringify(updated);
data.values[`market:content:${id}`] = markdown;

const tmp = `${FILE}.tmp`;
writeFileSync(tmp, JSON.stringify(data));
renameSync(tmp, FILE);
console.log(`${id}: sha256 ${before.slice(0, 12)}… → ${updated.sha256.slice(0, 12)}…, ${wordCount} words, ${citationCount} citations`);
