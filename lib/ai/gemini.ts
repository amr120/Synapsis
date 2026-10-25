import "server-only";
import { GoogleGenAI } from "@google/genai";

// `server-only` makes the build fail if a client component imports this file,
// so GEMINI_API_KEY can never end up in browser JavaScript.

const DEFAULT_MODEL = "gemini-flash-latest";

let client: GoogleGenAI | null = null;

function getClient(): GoogleGenAI {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new MissingGeminiKeyError();
  }
  client ??= new GoogleGenAI({ apiKey });
  return client;
}

export class MissingGeminiKeyError extends Error {
  constructor() {
    super("GEMINI_API_KEY is not set. Add it to .env.local and restart `npm run dev`.");
  }
}

export async function askGemini(prompt: string, options: { system?: string } = {}): Promise<string> {
  const response = await withRetry(() =>
    getClient().models.generateContent({
      model: process.env.GEMINI_MODEL || DEFAULT_MODEL,
      contents: prompt,
      config: options.system ? { systemInstruction: options.system } : undefined,
    }),
  );
  return response.text ?? "";
}

/** Retries network drops and 429/5xx from Gemini with a short backoff; other errors fail at once. */
async function withRetry<T>(call: () => Promise<T>, attempts = 3): Promise<T> {
  for (let i = 1; ; i++) {
    try {
      return await call();
    } catch (e) {
      const status = (e as { status?: number }).status;
      const transient = e instanceof TypeError || status === 429 || (status !== undefined && status >= 500);
      if (!transient || i >= attempts) throw e;
      await new Promise((r) => setTimeout(r, 400 * i));
    }
  }
}
