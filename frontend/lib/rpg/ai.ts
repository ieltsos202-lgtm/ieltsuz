// The one place that talks to the model for the RPG.
//
// Everything here is about containment: a bounded token budget, a hard timeout,
// one retry, and a scripted fallback so a bad generation degrades into a
// slightly generic NPC line instead of a broken scene.

import { generateWithFallback, parseJSONFromText, LIVE_MODEL_CHAIN } from "@/lib/gemini";
import { RPG_AI } from "./config";
import { AiContractError, parseAiTurn } from "./validate";
import type { AiTurn, RpgLevel } from "./types";

/** Cheapest model first, then the shared chain as a safety net. */
function models(): string[] {
  return Array.from(new Set([RPG_AI.model, ...LIVE_MODEL_CHAIN]));
}

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("RPG AI timeout")), ms);
    promise.then(
      (v) => {
        clearTimeout(timer);
        resolve(v);
      },
      (e) => {
        clearTimeout(timer);
        reject(e);
      }
    );
  });
}

export interface AiTurnResult {
  turn: AiTurn | null;
  /** Why it failed, for the log. Never shown to the player. */
  error?: string;
}

/**
 * Ask the model for one NPC turn. Validates the response against the strict
 * contract; a malformed answer is retried ONCE, then reported as a failure so
 * the caller can use the scene's scripted fallback.
 */
export async function generateNpcTurn(prompt: string, level: RpgLevel): Promise<AiTurnResult> {
  let lastError = "";

  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const text = await withTimeout(
        generateWithFallback([{ text: prompt }], {
          models: models(),
          config: {
            temperature: RPG_AI.temperature,
            maxOutputTokens: RPG_AI.maxOutputTokens,
            responseMimeType: "application/json",
          },
          // Reject unparseable/contract-breaking output inside the fallback
          // loop too, so a different model gets a chance before we give up.
          validate: (t) => {
            parseAiTurn(parseJSONFromText(t), level);
          },
        }),
        RPG_AI.timeoutMs
      );

      return { turn: parseAiTurn(parseJSONFromText(text), level) };
    } catch (err) {
      lastError = err instanceof AiContractError ? `contract: ${err.message}` : String((err as any)?.message || err);
      // Log the class of failure only — never the prompt or the player's text.
      console.error(`rpg ai attempt ${attempt + 1} failed:`, lastError.slice(0, 200));
    }
  }

  return { turn: null, error: lastError };
}

/**
 * Extract up to 3 memorable facts about the player at the end of a scene.
 * Best-effort: a failure here costs nothing, so it never blocks the result
 * screen and never throws.
 */
export async function extractFacts(transcript: string, npcName: string): Promise<string[]> {
  try {
    const text = await withTimeout(
      generateWithFallback(
        [
          {
            text: `You are ${npcName}. Read this role-play transcript and list up to 3 short, harmless things worth remembering about the player for next time (their name, a hobby, what they ordered, where they are staying in general terms).

RULES
- Each fact max 60 characters, written in English, third person ("Likes football").
- NEVER include phone numbers, street addresses, emails, passwords or card numbers. Skip any such detail entirely.
- If there is nothing worth remembering, return an empty array.
- Return ONLY JSON: {"facts": ["...", "..."]}

TRANSCRIPT:
${transcript.slice(0, 4000)}`,
          },
        ],
        {
          models: models(),
          config: { temperature: 0.3, maxOutputTokens: 200, responseMimeType: "application/json" },
        }
      ),
      RPG_AI.timeoutMs
    );

    const parsed = parseJSONFromText(text);
    return Array.isArray(parsed?.facts) ? parsed.facts.slice(0, 3) : [];
  } catch {
    return [];
  }
}
