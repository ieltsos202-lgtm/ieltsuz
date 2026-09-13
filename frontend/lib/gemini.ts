import { GoogleGenerativeAI, GenerationConfig } from "@google/generative-ai";

const API_KEY = process.env.GEMINI_API_KEY || "";

const genAI = new GoogleGenerativeAI(API_KEY);

// Low temperature => consistent, reproducible IELTS band scoring.
// JSON response mode => no markdown fences, far fewer parse failures.
const JSON_CONFIG: GenerationConfig = {
  temperature: 0.2,
  topP: 0.9,
  maxOutputTokens: 8192,
  responseMimeType: "application/json",
};

export function getModel(
  modelName = "gemini-2.5-flash",
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

/**
 * Generate plain text with retries + model fallback.
 * Handles transient 503/429 by trying multiple models with exponential backoff.
 */
export async function generateText(
  prompt: string,
  options?: { primary?: string; fallback?: string; maxRetries?: number; jsonMode?: boolean }
): Promise<string> {
  const { primary = "gemini-2.5-flash", fallback = "gemini-2.0-flash", maxRetries = 2, jsonMode = false } = options || {};
  const models = [primary, fallback].filter(Boolean);

  for (const modelName of models) {
    const model = getModel(modelName, jsonMode);
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        const result = await model.generateContent(prompt);
        const text = result.response.text();
        if (text && text.trim()) return text.trim();
      } catch (err: any) {
        const status = err?.status || 0;
        // 503 = service unavailable, 429 = rate limit — retry with longer backoff
        const isRetryable = status === 503 || status === 429 || !status;
        if (!isRetryable || attempt === maxRetries) {
          // Last attempt for this model failed — try next model
          break;
        }
        // Exponential backoff: 1s, 3s, 7s
        await new Promise((r) => setTimeout(r, 1000 * (Math.pow(2, attempt) - 0.5)));
      }
    }
  }

  throw new Error("AI javob bera olmadi. Iltimos, keyinroq qayta urinib ko'ring.");
}

/**
 * Generate a JSON result with retries + model fallback.
 * Uses JSON response mode for reliability.
 */
export async function generateJSON(
  prompt: string,
  modelName = "gemini-2.5-flash",
  retries = 2
): Promise<any> {
  const text = await generateText(prompt, { primary: modelName, fallback: "gemini-2.0-flash", maxRetries: retries, jsonMode: true });
  return parseJSONFromText(text);
}
