// Creates devnet wallets for a few independent buyer agents and funds each with 0.5 devnet USDC from
// the agent wallet (x402's facilitator pays network fees, so buyers need no SOL).
// Keys go to .data/buyer-wallets.json (git-ignored). Run: npx tsx scripts/seed-buyers.ts
import { generateKeyPairSync } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { createKeyPairSignerFromBytes, getBase58Decoder, getBase58Encoder } from "@solana/kit";
import { payUsdc } from "../lib/payments/transfer";

process.loadEnvFile(".env.local");
const FILE = ".data/buyer-wallets.json";
const NAMES = ["climate-scout", "policy-analyst", "biotech-agent", "dev-copilot"];
const b58 = getBase58Decoder();
const wallets: Record<string, { address: string; secret: string; funded?: string }> = existsSync(FILE) ? JSON.parse(readFileSync(FILE, "utf8")) : {};
for (const name of NAMES) {
  if (wallets[name]) continue;
  const jwk = generateKeyPairSync("ed25519").privateKey.export({ format: "jwk" });
  const seed = Buffer.from(jwk.d!, "base64url");
  const pub = Buffer.from(jwk.x!, "base64url");
  wallets[name] = { address: b58.decode(pub), secret: b58.decode(new Uint8Array([...seed, ...pub])) };
}
mkdirSync(".data", { recursive: true });
writeFileSync(FILE, JSON.stringify(wallets, null, 2));

const agent = await createKeyPairSignerFromBytes(new Uint8Array(getBase58Encoder().encode(process.env.AGENT_PRIVATE_KEY!.trim())));
for (const name of NAMES) {
  const w = wallets[name];
  if (!w.funded) {
    for (let attempt = 1; ; attempt++) {
      try {
        w.funded = (await payUsdc(agent, { to: w.address, amountUsdc: 0.5, memo: `synapsis:buyer-setup:${name}` })).signature;
        break;
      } catch (err) {
        // The public devnet RPC rate-limits (429): back off and retry.
        if (attempt >= 5 || !/429|Too Many/i.test(String(err))) throw err;
        await new Promise((r) => setTimeout(r, 4000 * attempt));
      }
    }
    writeFileSync(FILE, JSON.stringify(wallets, null, 2));
  }
  await new Promise((r) => setTimeout(r, 1500));
  console.log(`${name.padEnd(15)} agent_${w.address.slice(0, 3).toLowerCase()}  ${w.address}  funded 0.5 USDC`);
}
