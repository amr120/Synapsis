import "server-only";
import { GoogleGenAI, type GenerateContentParameters, type GenerateContentResponse } from "@google/genai";

// `server-only` makes the build fail if a client component imports this file,
// so GEMINI_API_KEY can never end up in browser JavaScript.

// Tried in order. GEMINI_MODEL (if set) goes first. The newest flash models are often overloaded,
// so the defaults are the ones that answer reliably on the free tier, with lighter fallbacks.
const FALLBACK_MODELS = ["gemini-3.5-flash", "gemini-3.5-flash-lite", "gemini-flash-lite-latest", "gemini-3.1-flash-lite"];
// Per-call limit, so one overloaded model can't hang a race attempt.
const CALL_TIMEOUT_MS = 20_000;

let client: GoogleGenAI | null = null;
let clientKey: string | undefined;

function getClient(): GoogleGenAI {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new MissingGeminiKeyError();
  }
  // Rebuild when the key changes (e.g. a rotated key picked up from .env.local without a restart).
  if (!client || clientKey !== apiKey) {
    client = new GoogleGenAI({ apiKey });
    clientKey = apiKey;
  }
  return client;
}

export class MissingGeminiKeyError extends Error {
  constructor() {
    super("GEMINI_API_KEY is not set. Add it to .env.local and restart `npm run dev`.");
  }
}

function models(prefer?: string): string[] {
  const preferred = process.env.GEMINI_MODEL?.trim();
  return [...new Set([...(prefer ? [prefer] : []), ...(preferred ? [preferred] : []), ...FALLBACK_MODELS])];
}

export async function askGemini(prompt: string, options: { system?: string } = {}): Promise<string> {
  const response = await generateWithGemini({
    contents: prompt,
    config: options.system ? { systemInstruction: options.system } : undefined,
  });
  return response.text ?? "";
}

/**
 * generateContent with failover: each model gets a timed attempt plus one retry on a transient
 * error (network drop, 429, 5xx, timeout); an unavailable model (404) is skipped straight away.
 */
export async function generateWithGemini(params: Omit<GenerateContentParameters, "model">, opts: { prefer?: string } = {}): Promise<GenerateContentResponse> {
  let lastError: unknown;
  for (const model of models(opts.prefer)) {
    for (let attempt = 1; attempt <= 2; attempt++) {
      try {
        return await getClient().models.generateContent({
          model,
          ...params,
          config: { ...params.config, httpOptions: { timeout: CALL_TIMEOUT_MS, ...params.config?.httpOptions } },
        });
      } catch (e) {
        lastError = e;
        const status = (e as { status?: number }).status;
        const transient = e instanceof TypeError || /abort|timed? ?out/i.test(String(e)) || status === 429 || (status !== undefined && status >= 500);
        console.warn(`[gemini] ${model} attempt ${attempt} failed${status ? ` (${status})` : ""}: ${String(e).slice(0, 120)}`);
        if (!transient) break; // e.g. 404 model unavailable: next model
        if (attempt === 1 && status !== 429) await new Promise((r) => setTimeout(r, 400));
        else break; // rate-limited or second failure: next model
      }
    }
  }
  throw lastError;
}
