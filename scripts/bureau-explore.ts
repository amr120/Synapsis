import { address, createSolanaRpc, getAddressEncoder, getProgramDerivedAddress, getAddressDecoder } from "@solana/kit";
const RPC = process.env.BUREAU_RPC || "https://api.devnet.solana.com";
const rpc = createSolanaRpc(RPC);
const PROGRAM = address("H2wWqEUUbQ3LJGWLAYyLK8vop4zxeX69r1cXeNpY4XXk");
const MINT = address("AwPoLn4inVqixYn9Uab2JonLBqdKZDC6poXHtjWcBnG3");
const CID = "T-60eea396";
const WALLET = address("3v5MGNspmSAgU3duUho1DHGoo4Sd7BZYxTVY5UQWuQy5");
const enc = new TextEncoder();
const dec = getAddressDecoder();
const pda = async (...seeds: string[]) => (await getProgramDerivedAddress({ programAddress: PROGRAM, seeds: seeds.map((s) => enc.encode(s)) }))[0];
const acct = async (a: string) => (await rpc.getAccountInfo(address(a), { encoding: "base64" }).send()).value;
const claim = await pda("claim", CID.toLowerCase());
const holdings = await pda("holdings", CID);
const deed = await pda("deed", CID);
for (const [n, a] of [["claim", claim], ["holdings", holdings], ["deed", deed]] as const) {
  const v = await acct(a);
  const b = v ? Buffer.from(v.data[0], "base64") : null;
  console.log(n, a, v ? `len=${b!.length} owner=${v.owner}` : "MISSING");
  if (n === "claim" && b) console.log("  nonce", b.readBigUInt64LE(41).toString(), "clearance", dec.decode(b.subarray(49, 81)));
  if (n === "holdings" && b) console.log("  registrar", dec.decode(b.subarray(8, 40)));
}
const mint = await acct(MINT);
console.log("mint owner (token program)", mint?.owner);
console.log("SOL", (await rpc.getBalance(WALLET).send()).value);
const toks = await rpc.getTokenAccountsByOwner(WALLET, { mint: MINT }, { encoding: "jsonParsed" }).send();
for (const t of toks.value) console.log("CRED acct", t.pubkey, JSON.stringify((t.account.data as any).parsed.info.tokenAmount));
const sigs = await rpc.getSignaturesForAddress(PROGRAM, { limit: 40 }).send();
console.log("program sigs", sigs.length);
let shown = 0;
for (const s of sigs) {
  if (s.err || shown >= 2) continue;
  const tx: any = await rpc.getTransaction(s.signature, { encoding: "json", maxSupportedTransactionVersion: 0 }).send();
  const keys = tx.transaction.message.accountKeys;
  const logs: string[] = tx.meta.logMessages ?? [];
  if (!logs.some((l) => /mint_code|MintCode/i.test(l))) continue;
  shown++;
  console.log("--- tx", s.signature);
  console.log(logs.filter((l) => /Instruction|Program log/.test(l)).slice(0, 8).join("\n"));
  for (const ix of tx.transaction.message.instructions) {
    console.log("ix program", keys[ix.programIdIndex], "accounts", ix.accounts.map((i: number) => keys[i]).join(", "), "data", ix.data.slice(0, 20));
  }
  console.log("signer", keys[0]);
}
