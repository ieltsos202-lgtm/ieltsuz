import { GoogleGenerativeAI, GenerationConfig, Part } from "@google/generative-ai";

const API_KEY = process.env.GEMINI_API_KEY || "";

const genAI = new GoogleGenerativeAI(API_KEY);

// Free-tier quota is counted per API key AND per model, so when one pair is
// exhausted another usually still works. All configured keys are tried in
// order; add spares as GEMINI_API_KEY_2, _3, ... (up to _10).
const API_KEYS = [
  API_KEY,
  ...Array.from({ length: 9 }, (_, i) => process.env[`GEMINI_API_KEY_${i + 2}`]),
].filter((k): k is string => !!k && k.trim().length > 0);

const clients = new Map<string, GoogleGenerativeAI>();
function clientFor(key: string) {
  let c = clients.get(key);
  if (!c) {
    c = new GoogleGenerativeAI(key);
    clients.set(key, c);
  }
  return c;
}

/** Models that share the audio-capable Flash family, cheapest-latency first.
 * NOTE: gemini-2.5/2.0 flash are blocked (404) for projects created after
 * deprecation — the 3.x family works on old AND new keys alike. */
export const LIVE_MODEL_CHAIN = [
  process.env.PARTNER_MODEL || "gemini-3.6-flash",
  "gemini-3.5-flash",
  "gemini-3.1-flash-lite",
  "gemini-flash-latest",
];

/** Every configured key, primary first. */
export function geminiKeys(): string[] {
  return API_KEYS.length ? API_KEYS : [API_KEY];
}

export function isExhausted(err: any): boolean {
  const msg = String(err?.message || err || "").toLowerCase();
  const status = err?.status || 0;
  return (
    status === 429 ||
    status === 503 ||
    status === 500 ||
    msg.includes("quota") ||
    msg.includes("429") ||
    msg.includes("rate limit") ||
    msg.includes("resource_exhausted") ||
    msg.includes("overloaded") ||
    msg.includes("503")
  );
}

export class QuotaError extends Error {}

/**
 * Generate content, walking the model chain and every configured API key when
 * a model/key pair is rate-limited or overloaded. Used by the live speaking
 * routes, where failing the request means the conversation dies mid-sentence.
 * Throws QuotaError only when every combination is exhausted.
 */
export async function generateWithFallback(
  parts: (string | Part)[],
  options?: {
    models?: string[];
    config?: Record<string, unknown>;
    jsonMode?: boolean;
    /**
     * Reject a syntactically valid but unusable response (e.g. JSON truncated
     * by the token cap). Throwing here retires this attempt and moves to the
     * next model, instead of handing the caller something it cannot parse.
     */
    validate?: (text: string) => void;
  }
): Promise<string> {
  const models = options?.models?.length ? options.models : LIVE_MODEL_CHAIN;
  const keys = API_KEYS.length ? API_KEYS : [API_KEY];
  let exhausted = false;
  let lastErr: any = null;

  const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

  for (const modelName of models) {
    for (const key of keys) {
      // One retry per pair: free-tier 429s are per-minute windows, so a short
      // wait often turns a hard failure into a success.
      for (let attempt = 0; attempt < 2; attempt++) {
        try {
          const model = clientFor(key).getGenerativeModel({
            model: modelName,
            generationConfig: {
              ...(options?.jsonMode === false ? {} : JSON_CONFIG),
              ...(options?.config || {}),
            } as GenerationConfig,
          });
          const res = await model.generateContent(parts as Part[]);
          const text = res.response.text();
          if (!text || !text.trim()) break; // empty response — next key/model
          // A validation throw lands in the catch below and is treated as a
          // non-quota error, i.e. worth trying a different model.
          options?.validate?.(text);
          return text;
        } catch (err) {
          lastErr = err;
          if (isExhausted(err)) {
            exhausted = true;
            if (attempt === 0) {
              await sleep(4000); // ride out the RPM window
              continue;
            }
            break; // still limited — next key, then next model
          }
          // A non-quota error (bad request, safety block) won't be fixed by
          // another key — try the next model instead.
          break;
        }
      }
      if (!exhausted) break;
    }
  }
  if (exhausted) throw new QuotaError(String(lastErr?.message || "All models rate-limited"));
  throw new Error(String(lastErr?.message || "Model returned no text"));
}

// Low temperature => consistent, reproducible IELTS band scoring.
// JSON response mode => no markdown fences, far fewer parse failures.
// The token cap is deliberately generous: a writing evaluation carries a full
// band-8 model answer plus bilingual feedback, and truncation surfaces as an
// unparseable response rather than an obvious limit. The cap costs nothing
// unless it is actually used.
const JSON_CONFIG: GenerationConfig = {
  temperature: 0.2,
  topP: 0.9,
  maxOutputTokens: 16384,
  responseMimeType: "application/json",
};

export function getModel(
  modelName = "gemini-3.6-flash",
  jsonMode = false,
  overrideConfig?: Record<string, unknown>
) {
  return genAI.getGenerativeModel({
    model: modelName,
    ...(jsonMode || overrideConfig
      ? { generationConfig: { ...(jsonMode ? JSON_CONFIG : {}), ...overrideConfig } as GenerationConfig }
      : {}),
  });
}

/**
 * Robustly extract a JSON object/array from a model response, even if the
 * model wrapped it in markdown fences or added stray prose.
 */
export function parseJSONFromText(text: string): any {
  if (!text) throw new Error("Empty model response");

  let cleaned = text
    .replace(/```json\n?/gi, "")
    .replace(/```\n?/g, "")
    .trim();

  try {
    return JSON.parse(cleaned);
  } catch {
    // Fallback: grab the outermost JSON object/array from the text.
    const firstObj = cleaned.indexOf("{");
    const firstArr = cleaned.indexOf("[");
    let start = -1;
    let openCh = "{";
    let closeCh = "}";
    if (firstObj === -1 && firstArr === -1) {
      throw new Error("No JSON found in model response");
    }
    if (firstArr !== -1 && (firstObj === -1 || firstArr < firstObj)) {
      start = firstArr;
      openCh = "[";
      closeCh = "]";
    } else {
      start = firstObj;
    }
    const end = cleaned.lastIndexOf(closeCh);
    if (start !== -1 && end !== -1 && end > start) {
      const slice = cleaned.slice(start, end + 1);
      return JSON.parse(slice);
    }
    throw new Error("Failed to parse JSON from model response");
  }
}

/** Requested models first, then the rest of the chain, de-duplicated. */
function modelChain(primary: string, fallback?: string): string[] {
  const wanted = [primary, fallback, ...LIVE_MODEL_CHAIN].filter(
    (m): m is string => !!m
  );
  return Array.from(new Set(wanted));
}

/** Turn an internal failure into something safe to show a user. */
function friendlyAiError(err: unknown): Error {
  if (err instanceof QuotaError) {
    return new QuotaError(
      "AI xizmati hozircha band (limit). Bir ozdan keyin qayta urinib ko'ring."
    );
  }
  return new Error("AI javob bera olmadi. Iltimos, keyinroq qayta urinib ko'ring.");
}

/**
 * Generate plain text, walking every model in the chain against every
 * configured API key with backoff. Previously this used only the primary key,
 * so the spare GEMINI_API_KEY_2..10 did nothing for most of the app and a
 * single exhausted key took the feature down.
 */
export async function generateText(
  prompt: string,
  options?: { primary?: string; fallback?: string; maxRetries?: number; jsonMode?: boolean }
): Promise<string> {
  const {
    primary = "gemini-3.6-flash",
    fallback = "gemini-3.5-flash",
    jsonMode = false,
  } = options || {};
  try {
    const text = await generateWithFallback([{ text: prompt }], {
      models: modelChain(primary, fallback),
      jsonMode,
    });
    return text.trim();
  } catch (err) {
    throw friendlyAiError(err);
  }
}

/**
 * Generate a JSON result across the full model/key chain. A response that
 * cannot be parsed (usually truncated output) is treated as a failed attempt
 * and retried on the next model rather than thrown at the caller.
 */
export async function generateJSON(
  prompt: string,
  modelName = "gemini-3.6-flash",
  retries = 2
): Promise<any> {
  try {
    const text = await generateWithFallback([{ text: prompt }], {
      models: modelChain(modelName, "gemini-3.5-flash"),
      validate: (t) => {
        parseJSONFromText(t);
      },
    });
    return parseJSONFromText(text);
  } catch (err) {
    throw friendlyAiError(err);
  }
}
