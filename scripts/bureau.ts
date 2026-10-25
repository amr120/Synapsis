// AI Race on-chain bonus challenges (Operation, Minesweeper) on Solana devnet, signed by the team wallet.
//   npx tsx scripts/bureau.ts operation      -> exact clearance fee + memo (Found it, Exact, Verified)
//   npx tsx scripts/bureau.ts minesweeper    -> mint_code, read the code, present it (Minted, Presented, Fast hands)
import { createHash } from "node:crypto";
import {
  AccountRole,
  address,
  appendTransactionMessageInstructions,
  createKeyPairSignerFromBytes,
  createSolanaRpc,
  createTransactionMessage,
  getAddressDecoder,
  getBase58Encoder,
  getBase64EncodedWireTransaction,
  getProgramDerivedAddress,
  getSignatureFromTransaction,
  type Instruction,
  pipe,
  setTransactionMessageFeePayerSigner,
  setTransactionMessageLifetimeUsingBlockhash,
  signTransactionMessageWithSigners,
} from "@solana/kit";
import { getTransferCheckedInstruction } from "@solana-program/token";

process.loadEnvFile(".env.local");

const rpc = createSolanaRpc(process.env.BUREAU_RPC || "https://api.devnet.solana.com");
const PROGRAM = address("H2wWqEUUbQ3LJGWLAYyLK8vop4zxeX69r1cXeNpY4XXk");
const MINT = address("AwPoLn4inVqixYn9Uab2JonLBqdKZDC6poXHtjWcBnG3");
const PRESENTATION = address("HdMsqBdAW8mbrhJzHztqr1XVP1km3fXWHm7u8DpJeD9e");
const MEMO = address("MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr");
const SYSVAR_IX = address("Sysvar1nstructions1111111111111111111111111");
const SYSTEM = address("11111111111111111111111111111111");
const SALT = "830797a34fd3";
const CID = "T-60eea396";
const CRED_DECIMALS = 6;

const enc = new TextEncoder();
const sha = (...parts: Uint8Array[]) => createHash("sha256").update(Buffer.concat(parts.map((p) => Buffer.from(p)))).digest();
const pda = async (...seeds: string[]) => (await getProgramDerivedAddress({ programAddress: PROGRAM, seeds: seeds.map((s) => enc.encode(s)) }))[0];
const memoIx = (text: string): Instruction => ({ programAddress: MEMO, accounts: [], data: enc.encode(text) });

const signer = await createKeyPairSignerFromBytes(new Uint8Array(getBase58Encoder().encode(process.env.AGENT_PRIVATE_KEY!.trim())));
const [ourCred] = (await rpc.getTokenAccountsByOwner(signer.address, { mint: MINT }, { encoding: "base64" }).send()).value.map((v) => v.pubkey);
console.log("team wallet", signer.address, "CRED account", ourCred);

const credTransfer = (to: string, amount: bigint) =>
  getTransferCheckedInstruction({ source: address(ourCred), mint: MINT, destination: address(to), authority: signer, amount, decimals: CRED_DECIMALS });

async function build(instructions: Instruction[]) {
  const { value: blockhash } = await rpc.getLatestBlockhash({ commitment: "confirmed" }).send();
  const msg = pipe(
    createTransactionMessage({ version: 0 }),
    (m) => setTransactionMessageFeePayerSigner(signer, m),
    (m) => setTransactionMessageLifetimeUsingBlockhash(blockhash, m),
    (m) => appendTransactionMessageInstructions(instructions, m),
  );
  return signTransactionMessageWithSigners(msg);
}

async function simulate(instructions: Instruction[]) {
  const tx = await build(instructions);
  const r = await rpc.simulateTransaction(getBase64EncodedWireTransaction(tx), { encoding: "base64", replaceRecentBlockhash: true }).send();
  return r.value;
}

async function send(instructions: Instruction[], label: string): Promise<string> {
  const tx = await build(instructions);
  const sig = getSignatureFromTransaction(tx);
  await rpc.sendTransaction(getBase64EncodedWireTransaction(tx), { encoding: "base64", preflightCommitment: "confirmed" }).send();
  for (let i = 0; i < 60; i++) {
    const s = (await rpc.getSignatureStatuses([sig]).send()).value[0];
    if (s?.err) throw new Error(`${label} failed on chain: ${JSON.stringify(s.err)}`);
    if (s?.confirmationStatus === "confirmed" || s?.confirmationStatus === "finalized") {
      console.log(`${label}: ${sig}`);
      return sig;
    }
    await new Promise((r) => setTimeout(r, 1000));
  }
  throw new Error(`${label} not confirmed in time (${sig})`);
}

async function operation() {
  const claim = await pda("claim", CID.toLowerCase());
  const data = Buffer.from((await rpc.getAccountInfo(claim, { encoding: "base64" }).send()).value!.data[0], "base64");
  const nonceBytes = data.subarray(41, 49);
  const nonce = data.readBigUInt64LE(41);
  const clearance = getAddressDecoder().decode(data.subarray(49, 81));
  const fee = 1000n + (nonce % 9000n);
  const memo = sha(enc.encode(CID), nonceBytes).toString("hex").slice(0, 16);
  console.log({ claim, nonce: nonce.toString(), clearance, fee: fee.toString(), memo });
  await send([credTransfer(clearance, fee), memoIx(memo)], "operation (exact fee + memo)");
}

function mintCodeIx(holdings: string, deed: string, memoHash: Buffer, order: "hd" | "dh"): Instruction {
  const disc = sha(enc.encode("global:mint_code")).subarray(0, 8);
  const id = Buffer.from(CID, "utf8");
  const len = Buffer.alloc(4);
  len.writeUInt32LE(id.length);
  const [a, b] = order === "hd" ? [holdings, deed] : [deed, holdings];
  return {
    programAddress: PROGRAM,
    accounts: [
      { address: signer.address, role: AccountRole.WRITABLE_SIGNER, signer } as never,
      { address: address(a), role: AccountRole.WRITABLE },
      { address: address(b), role: AccountRole.WRITABLE },
      { address: SYSVAR_IX, role: AccountRole.READONLY },
      { address: SYSTEM, role: AccountRole.READONLY },
      { address: signer.address, role: AccountRole.READONLY }, // registrar key (first remaining account)
    ],
    data: Buffer.concat([disc, len, id, memoHash]),
  };
}

async function minesweeper() {
  const holdings = await pda("holdings", CID);
  const deed = await pda("deed", CID);
  const h = Buffer.from((await rpc.getAccountInfo(holdings, { encoding: "base64" }).send()).value!.data[0], "base64");
  const registrar = getAddressDecoder().decode(h.subarray(8, 40));
  if (registrar !== signer.address) throw new Error(`registrar ${registrar} is not our wallet; script assumes it is`);
  const memoHash = sha(enc.encode(CID), enc.encode(SALT));
  const memoHex = memoHash.toString("hex");

  let order: "hd" | "dh" = "hd";
  const simHd = await simulate([mintCodeIx(holdings, deed, memoHash, "hd"), memoIx(memoHex)]);
  if (simHd.err) {
    console.log("order holdings,deed failed:", JSON.stringify(simHd.err), (simHd.logs ?? []).slice(-3));
    const simDh = await simulate([mintCodeIx(holdings, deed, memoHash, "dh"), memoIx(memoHex)]);
    if (simDh.err) throw new Error(`mint_code simulation failed both orders: ${JSON.stringify(simDh.err)} ${(simDh.logs ?? []).slice(-4).join(" | ")}`);
    order = "dh";
  }
  console.log("mint_code account order:", order);

  await send([mintCodeIx(holdings, deed, memoHash, order), memoIx(memoHex)], "mint_code");
  const d = Buffer.from((await rpc.getAccountInfo(deed, { encoding: "base64", commitment: "confirmed" }).send()).value!.data[0], "base64");
  // Anchor account: 8-byte discriminator, operative (u32 len + string), clearance_code (8 bytes), issued_slot (u64), presented (bool)
  let o = 8;
  const opLen = d.readUInt32LE(o);
  o += 4;
  const operative = d.subarray(o, o + opLen).toString("utf8");
  o += opLen;
  const codeBytes = d.subarray(o, o + 8);
  o += 8;
  const issuedSlot = d.readBigUInt64LE(o);
  const printable = codeBytes.every((c) => c >= 0x20 && c < 0x7f);
  const code = printable ? codeBytes.toString("utf8") : codeBytes.toString("hex");
  console.log({ operative, codeHex: codeBytes.toString("hex"), code, issuedSlot: issuedSlot.toString() });

  await send([credTransfer(PRESENTATION, 1n), memoIx(`${CID}:${code}`)], "present code");
  const slot = await rpc.getSlot({ commitment: "confirmed" }).send();
  console.log(`presented ~${slot - issuedSlot} slots after minting`);
}

const mode = process.argv[2];
if (mode === "operation") await operation();
else if (mode === "minesweeper") await minesweeper();
else console.log("usage: tsx scripts/bureau.ts operation|minesweeper");
