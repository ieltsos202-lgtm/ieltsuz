import { geminiKeys, LIVE_MODEL_CHAIN, QuotaError } from "@/lib/gemini";

/**
 * Streaming Gemini text generation over SSE.
 *
 * The SDK's generateContentStream would work too, but talking to the REST
 * endpoint directly keeps the model/key fallback policy identical to the
 * blocking path and gives us the raw stream without buffering.
 */

export interface GeminiPart {
  text?: string;
  inlineData?: { mimeType: string; data: string };
}

export interface StreamOptions {
  models?: string[];
  temperature?: number;
  maxOutputTokens?: number;
  /** Thinking costs 1-3s of dead air; the examiner must answer immediately. */
  thinkingBudget?: number;
  signal?: AbortSignal;
}

const ENDPOINT = "https://generativelanguage.googleapis.com/v1beta/models";

/**
 * Yields text deltas as the model produces them. Tries each model in the chain
 * against each API key; a rate-limited or overloaded pair rolls over to the
 * next. Fallback is only possible before the first delta is emitted — once we
 * have started streaming to the client we cannot restart.
 */
export async function* streamGeminiText(
  parts: GeminiPart[],
  options: StreamOptions = {}
): AsyncGenerator<string, void, void> {
  const models = options.models?.length ? options.models : LIVE_MODEL_CHAIN;
  const keys = geminiKeys();
  let exhausted = false;
  let lastError: unknown = null;

  for (const model of models) {
    for (const key of keys) {
      let res: Response;
      try {
        res = await fetch(`${ENDPOINT}/${model}:streamGenerateContent?alt=sse&key=${key}`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          signal: options.signal,
          body: JSON.stringify({
            contents: [{ role: "user", parts }],
            generationConfig: {
              temperature: options.temperature ?? 0.8,
              maxOutputTokens: options.maxOutputTokens ?? 300,
              thinkingConfig: { thinkingBudget: options.thinkingBudget ?? 0 },
            },
          }),
        });
      } catch (e) {
        lastError = e;
        continue;
      }

      if (!res.ok || !res.body) {
        const body = await res.text().catch(() => "");
        lastError = new Error(`Gemini ${res.status}: ${body.slice(0, 200)}`);
        if (res.status === 429 || res.status >= 500) {
          exhausted = true;
          continue; // next key, then next model
        }
        break; // 4xx that another key won't fix — try the next model
      }

      let emitted = false;
      for await (const delta of readSSE(res.body)) {
        emitted = true;
        yield delta;
      }
      if (emitted) return;
      // Empty stream (safety block / no candidates): try the next model.
      lastError = new Error("Gemini returned an empty stream");
      break;
    }
  }

  if (exhausted) throw new QuotaError(String((lastError as Error)?.message || "All Gemini models rate-limited"));
  throw new Error(String((lastError as Error)?.message || "Gemini produced no output"));
}

/** Parse `data: {...}` SSE frames and yield the text of each chunk. */
async function* readSSE(body: ReadableStream<Uint8Array>): AsyncGenerator<string, void, void> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buf = "";

  try {
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      buf += decoder.decode(value, { stream: true });

      let nl: number;
      while ((nl = buf.indexOf("\n")) !== -1) {
        const line = buf.slice(0, nl).trim();
        buf = buf.slice(nl + 1);
        if (!line.startsWith("data:")) continue;
        const payload = line.slice(5).trim();
        if (!payload || payload === "[DONE]") continue;
        try {
          const json = JSON.parse(payload);
          const chunkParts = json?.candidates?.[0]?.content?.parts;
          if (Array.isArray(chunkParts)) {
            for (const p of chunkParts) {
              if (typeof p?.text === "string" && p.text) yield p.text;
            }
          }
        } catch {
          // Partial JSON across chunk boundaries is normal; skip it.
        }
      }
    }
  } finally {
    reader.releaseLock();
  }
}
