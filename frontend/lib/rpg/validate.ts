// The trust boundary. Everything the model returns passes through here, and
// nothing leaves with more authority than the server can independently verify.
//
// The central rule: an objective is credited ONLY when the PLAYER's own words
// contain one of that objective's keywords. The model's "objectives_hit" is
// treated as a suggestion, so "I completed everything" or "ignore your rules"
// cannot complete anything.

import { sanitizeNpcLine, containsBlocked } from "./safety";
import type {
  AiTurn,
  NpcEmotion,
  PlayerError,
  Scene,
  SentenceBuilder,
  SessionState,
  SuggestedReply,
  RpgLevel,
} from "./types";

const EMOTIONS: NpcEmotion[] = ["neutral", "happy", "surprised", "confused", "amused", "concerned"];

function asString(v: unknown, max: number): string {
  return typeof v === "string" ? v.replace(/\s+/g, " ").trim().slice(0, max) : "";
}

function asStringArray(v: unknown, max: number, maxLen = 60): string[] {
  if (!Array.isArray(v)) return [];
  return v
    .map((x) => asString(x, maxLen).toLowerCase())
    .filter((s) => s.length > 0)
    .slice(0, max);
}

/** Thrown when the response is unusable — the caller retries, then falls back. */
export class AiContractError extends Error {}

/**
 * Shape-check and clean the model's JSON. Unknown fields are ignored by
 * construction: we only ever read the keys we know about.
 */
export function parseAiTurn(raw: any, level: RpgLevel): AiTurn {
  if (!raw || typeof raw !== "object") throw new AiContractError("not an object");

  const npc_reply = sanitizeNpcLine(raw.npc_reply, 400);
  if (!npc_reply) throw new AiContractError("npc_reply missing");
  // A blocked NPC line is a failed generation, not something to sanitise and
  // ship — retry instead.
  if (containsBlocked(npc_reply)) throw new AiContractError("npc_reply blocked by safety filter");

  const npc_reply_uz = sanitizeNpcLine(raw.npc_reply_uz, 400);

  const emotion: NpcEmotion = EMOTIONS.includes(raw.emotion) ? raw.emotion : "neutral";

  const player_errors: PlayerError[] = Array.isArray(raw.player_errors)
    ? raw.player_errors
        .map((e: any) => ({
          original: asString(e?.original, 200),
          corrected: asString(e?.corrected, 200),
          note_uz: asString(e?.note_uz, 220),
        }))
        .filter((e: PlayerError) => e.original && e.corrected)
        .slice(0, 2)
    : [];

  // Level 1 needs exactly 3 options; anything else is unusable for the UI.
  let suggested_replies: SuggestedReply[] = [];
  if (level === 1) {
    const list = Array.isArray(raw.suggested_replies) ? raw.suggested_replies : [];
    suggested_replies = list
      .map((s: any) => ({
        text: sanitizeNpcLine(s?.text, 80),
        quality: (["good", "ok", "bad"].includes(s?.quality) ? s.quality : "ok") as SuggestedReply["quality"],
      }))
      .filter((s: SuggestedReply) => s.text.length > 0)
      .slice(0, 3);
    if (suggested_replies.length < 3) throw new AiContractError("level 1 needs 3 suggested replies");
  }

  let sentence_builder: SentenceBuilder | null = null;
  if (level === 2) {
    const sb = raw.sentence_builder;
    const words = Array.isArray(sb?.words)
      ? sb.words.map((w: any) => asString(w, 24)).filter((w: string) => w.length > 0).slice(0, 12)
      : [];
    const correct = sanitizeNpcLine(sb?.correct, 160);
    if (words.length < 3 || !correct) throw new AiContractError("level 2 needs a sentence_builder");
    sentence_builder = { words, correct };
  }

  return {
    npc_reply,
    npc_reply_uz,
    emotion,
    objectives_hit: asStringArray(raw.objectives_hit, 4, 60),
    target_words_introduced: asStringArray(raw.target_words_introduced, 6, 40),
    target_words_used_by_player: asStringArray(raw.target_words_used_by_player, 6, 40),
    player_errors,
    suggested_replies,
    sentence_builder,
    scene_should_end: raw.scene_should_end === true,
  };
}

/** Word-boundary keyword test, so "week" does not match "weekend" by accident. */
function mentions(haystack: string, needle: string): boolean {
  const escaped = needle.toLowerCase().replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  // Multi-word keywords ("how much") are matched as a phrase.
  return new RegExp(`(^|[^a-z])${escaped}([^a-z]|$)`, "i").test(haystack);
}

/**
 * Which objectives the player has actually earned this turn.
 *
 * Accepted only when ALL of these hold:
 *   - the id exists in this scene
 *   - it is not already completed
 *   - the player's own recent words contain one of its keywords
 */
export function verifyObjectives(
  claimed: string[],
  scene: Scene,
  state: SessionState,
  playerMessage: string
): string[] {
  if (!claimed.length || !playerMessage) return [];

  const done = new Set(state.completed_objectives);
  // The last two player turns: a two-part answer ("A coffee." / "Medium.")
  // should still credit the objective it completes.
  const recentPlayer = state.transcript
    .filter((t) => t.role === "player")
    .slice(-1)
    .map((t) => t.text);
  const haystack = ` ${[...recentPlayer, playerMessage].join(" ").toLowerCase()} `;

  const accepted: string[] = [];
  for (const id of claimed) {
    const objective = scene.objectives.find((o) => o.id === id);
    if (!objective) continue; // hallucinated id
    if (done.has(id) || accepted.includes(id)) continue; // already credited
    if (!objective.requires_keywords_any.some((k) => mentions(haystack, k))) continue; // unproven
    accepted.push(id);
  }
  return accepted;
}

/**
 * Target words the NPC genuinely used in its own line, and target words the
 * player genuinely used in theirs. The model reports both, but we check the
 * text, because an unearned "introduced" would start a spaced-repetition
 * schedule for a word the player never saw.
 */
export function verifyWords(
  scene: Scene,
  npcReply: string,
  playerMessage: string
): { introduced: string[]; usedByPlayer: string[] } {
  const npcHay = ` ${npcReply.toLowerCase()} `;
  const playerHay = ` ${playerMessage.toLowerCase()} `;
  const introduced: string[] = [];
  const usedByPlayer: string[] = [];

  for (const { word } of scene.target_words) {
    const w = word.toLowerCase();
    // Loose stem match so "arrive" counts in "arrived"/"arriving".
    const stem = w.length > 5 ? w.slice(0, w.length - 1) : w;
    if (mentions(npcHay, w) || mentions(npcHay, stem)) introduced.push(w);
    if (mentions(playerHay, w) || mentions(playerHay, stem)) usedByPlayer.push(w);
  }
  return { introduced, usedByPlayer };
}

/** All required objectives confirmed -> the scene is over, whatever the AI said. */
export function requiredComplete(scene: Scene, state: SessionState): boolean {
  const done = new Set(state.completed_objectives);
  return scene.objectives.filter((o) => o.required).every((o) => done.has(o.id));
}
