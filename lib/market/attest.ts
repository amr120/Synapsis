import "server-only";
import {
  appendTransactionMessageInstructions,
  createSolanaRpc,
  createTransactionMessage,
  getBase64EncodedWireTransaction,
  getSignatureFromTransaction,
  getUtf8Encoder,
  pipe,
  setTransactionMessageFeePayerSigner,
  setTransactionMessageLifetimeUsingBlockhash,
  signTransactionMessageWithSigners,
} from "@solana/kit";
import { loadAgentSigner } from "../payments/client";
import { MEMO_PROGRAM_ADDRESS } from "../payments/transfer";

/**
 * Anchors a short memo on Solana devnet, signed by the Synapsis verifier wallet, and returns the
 * signature once confirmed (or null if devnet didn't confirm in time: attestations still count
 * off-chain, the anchor is a bonus).
 */
export async function anchorMemo(memo: string, timeoutMs = 30_000): Promise<string | null> {
  try {
    const signer = await loadAgentSigner();
    const rpc = createSolanaRpc(process.env.SOLANA_RPC_URL || "https://api.devnet.solana.com");
    const { value: blockhash } = await rpc.getLatestBlockhash({ commitment: "confirmed" }).send();
    const tx = await signTransactionMessageWithSigners(
      pipe(
        createTransactionMessage({ version: 0 }),
        (m) => setTransactionMessageFeePayerSigner(signer, m),
        (m) => setTransactionMessageLifetimeUsingBlockhash(blockhash, m),
        (m) => appendTransactionMessageInstructions([{ programAddress: MEMO_PROGRAM_ADDRESS, accounts: [], data: new Uint8Array(getUtf8Encoder().encode(memo)) }], m),
      ),
    );
    const sig = getSignatureFromTransaction(tx);
    await rpc.sendTransaction(getBase64EncodedWireTransaction(tx), { encoding: "base64", preflightCommitment: "confirmed" }).send();
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      const s = (await rpc.getSignatureStatuses([sig]).send()).value[0];
      if (s?.err) return null;
      if (s?.confirmationStatus === "confirmed" || s?.confirmationStatus === "finalized") return sig;
      await new Promise((r) => setTimeout(r, 1000));
    }
    return null;
  } catch (err) {
    console.warn("[attest] memo anchor failed:", String(err).slice(0, 160));
    return null;
  }
}
