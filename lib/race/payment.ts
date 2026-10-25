// The on-chain payment stage: the verifier sends a run_workflow task like
//   Pay 0.01 devnet USDC to <address> with the memo "agent-studio-…". Return { "signature": "…" } in output.data.
// We parse it deterministically (no model: the amount, address and memo must be exact), check the
// spending limits, send the devnet USDC transfer with the memo, and return the signature.
import { loadAgentSigner } from "../payments/client";
import { payUsdc, TransferError } from "../payments/transfer";
import { TaskError, type Task, type TaskOutput } from "./protocol";

export interface PaymentRequest {
  amountUsdc: number;
  to: string;
  memo: string;
}

const PAYMENT_RE = /pay\s+([0-9]*\.?[0-9]+)\s*(?:devnet\s+)?USDC\s+to\s+([1-9A-HJ-NP-Za-km-z]{32,44})\b[\s\S]*?memo\s*[:=]?\s*["'“”‘’]([^"'“”‘’]+)["'“”‘’]/i;

/** The payment the task asks for, or null when the task is some other workflow. */
export function parsePaymentRequest(input: Task["input"]): PaymentRequest | null {
  if (typeof input === "object" && input !== null) {
    const o = input as Record<string, unknown>;
    const to = o.to ?? o.payTo ?? o.address ?? o.recipient;
    const amount = Number(o.amountUsdc ?? o.amount);
    if (typeof to === "string" && typeof o.memo === "string" && amount > 0) return { amountUsdc: amount, to, memo: o.memo };
    return null;
  }
  const m = PAYMENT_RE.exec(String(input));
  return m ? { amountUsdc: Number(m[1]), to: m[2], memo: m[3] } : null;
}

export async function runPayment(task: Task, req: PaymentRequest): Promise<TaskOutput> {
  const maxSpend = task.limits?.maxSpendUsd;
  if (maxSpend !== undefined && req.amountUsdc > maxSpend + 1e-9) {
    throw new TaskError("limit_exceeded", `Paying ${req.amountUsdc} USDC would exceed maxSpendUsd (${maxSpend}).`);
  }
  const maxPayment = Number(process.env.MAX_PAYMENT_USD || "0.10");
  if (req.amountUsdc > maxPayment + 1e-9) {
    throw new TaskError("limit_exceeded", `Paying ${req.amountUsdc} USDC exceeds MAX_PAYMENT_USD (${maxPayment}).`);
  }
  try {
    const { signature } = await payUsdc(await loadAgentSigner(), req, { timeoutMs: 45_000 });
    console.log(`[race] paid ${req.amountUsdc} USDC to ${req.to} memo=${req.memo} sig=${signature}`);
    return { text: `Paid ${req.amountUsdc} devnet USDC to ${req.to} with memo "${req.memo}".`, data: { signature } };
  } catch (e) {
    if (e instanceof TransferError) throw new TaskError(/not confirmed in time/i.test(e.message) ? "upstream_timeout" : "internal", e.message);
    throw e;
  }
}
