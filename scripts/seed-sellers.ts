// Creates devnet wallets for Synapsis's seller agents and opens their USDC accounts (x402 sellers
// need one to receive payments) with a 0.01 USDC transfer from the agent wallet.
// Keys are saved to .data/seller-wallets.json (git-ignored). Run: npx tsx scripts/seed-sellers.ts
import { generateKeyPairSync } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { createKeyPairSignerFromBytes, getBase58Decoder, getBase58Encoder } from "@solana/kit";
import { payUsdc } from "../lib/payments/transfer";

process.loadEnvFile(".env.local");
const FILE = ".data/seller-wallets.json";
const NAMES = ["atlas-bio-research", "meridian-policy-desk", "ledger-labs", "helios-energy-analyst", "quickprofit-data"];
const NO_ACCOUNT = new Set(["quickprofit-data"]); // the suppressed demo seller never gets paid

const b58 = getBase58Decoder();
const wallets: Record<string, { address: string; secret: string; usdcAccount?: string }> = existsSync(FILE) ? JSON.parse(readFileSync(FILE, "utf8")) : {};
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
  if (NO_ACCOUNT.has(name) || w.usdcAccount) {
    console.log(`${name.padEnd(22)} ${w.address}${w.usdcAccount ? " (USDC account ready)" : ""}`);
    continue;
  }
  const { signature } = await payUsdc(agent, { to: w.address, amountUsdc: 0.01, memo: `synapsis:seller-setup:${name}` });
  w.usdcAccount = signature;
  writeFileSync(FILE, JSON.stringify(wallets, null, 2));
  console.log(`${name.padEnd(22)} ${w.address} USDC account opened (tx ${signature.slice(0, 12)}…)`);
}
