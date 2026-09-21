// Adaptive difficulty: what each level means for the NPC, how a finished scene
// is scored, and when the player moves up or down.

import { MAX_LEVEL_MVP, RPG_RULES } from "./config";
import type { RpgLevel, SessionState, Scene } from "./types";

export function clampLevel(value: unknown, max: RpgLevel = MAX_LEVEL_MVP): RpgLevel {
  const n = Math.round(Number(value));
  if (!Number.isFinite(n)) return 1;
  return Math.min(max, Math.max(1, n)) as RpgLevel;
}

/** How the player is allowed to answer — decides which input the UI renders. */
export function inputModeFor(level: RpgLevel): "choices" | "tiles" | "text" | "voice" {
  if (level === 1) return "choices";
  if (level === 2) return "tiles";
  if (level <= 4) return "text";
  return "voice";
}

/** Whether the Uzbek translation of NPC lines is sent to the client. */
export function showsTranslation(level: RpgLevel): boolean {
  return level <= 2;
}

export function hintsAllowed(level: RpgLevel): boolean {
  return level <= 3;
}

/** The language constraint injected into the NPC system prompt. */
export function levelRules(level: RpgLevel): string {
  switch (level) {
    case 1:
      return "Maximum 2 sentences per turn, maximum 8 words per sentence. Present tense only. No idioms, no contractions beyond 'I'm' and 'it's'. Use the most common words only.";
    case 2:
      return "Maximum 2 sentences per turn, maximum 10 words per sentence. Simple past and present. Very common words, no idioms.";
    case 3:
      return "Maximum 3 sentences per turn, maximum 14 words per sentence. Normal everyday vocabulary. A few common contractions are fine. Avoid idioms.";
    case 4:
      return "Speak at natural speed with normal contractions and everyday phrasal verbs. Keep turns to 3 sentences.";
    default:
      return "Speak naturally like a real native: contractions, idioms, humour, occasional fast asides. Keep turns to 3 sentences.";
  }
}

/**
 * scene_score, 0-100:
 *   60% objectives completed (required ones carry the weight)
 *   30% answer accuracy (turns with no detected mistake)
 *   10% no hints used
 */
export function sceneScore(state: SessionState, scene: Scene, hintsUsed: number): number {
  const required = scene.objectives.filter((o) => o.required);
  const optional = scene.objectives.filter((o) => !o.required);
  const done = new Set(state.completed_objectives);

  const requiredDone = required.filter((o) => done.has(o.id)).length;
  const optionalDone = optional.filter((o) => done.has(o.id)).length;

  // Required objectives are the scene; optional ones can only top it up, and
  // only to the same 60-point ceiling.
  const requiredRatio = required.length ? requiredDone / required.length : 1;
  const optionalRatio = optional.length ? optionalDone / optional.length : 0;
  const objectiveRatio = Math.min(1, requiredRatio * 0.85 + optionalRatio * 0.15);

  const accuracyRatio = state.player_turns > 0 ? state.clean_answers / state.player_turns : 0;

  // Hints are forgiven in small numbers: one hint should not wipe the whole
  // 10 points on a 14-turn scene.
  const hintRatio = Math.max(0, 1 - hintsUsed / 3);

  const raw =
    objectiveRatio * RPG_RULES.score.objectives +
    accuracyRatio * RPG_RULES.score.accuracy +
    hintRatio * RPG_RULES.score.noHints;

  return Math.max(0, Math.min(100, Math.round(raw)));
}

export function xpForScene(score: number, allOptionalDone: boolean, hintsUsed: number): number {
  const bonus = allOptionalDone ? RPG_RULES.optionalBonusXp : 0;
  const penalty = hintsUsed * RPG_RULES.hintPenaltyXp;
  return Math.max(0, score + bonus - penalty);
}

export interface LevelDecision {
  level: RpgLevel;
  changed: 0 | 1 | -1;
  message_uz: string | null;
  /** Score history to persist (trimmed). */
  recent: number[];
}

/**
 * Auto difficulty, evaluated after each finished scene on the last 3 scores.
 * Applies to the NEXT scene, which is why the caller stores the result rather
 * than acting on it now.
 */
export function decideLevel(
  current: RpgLevel,
  previousScores: number[],
  newScore: number,
  maxLevel: RpgLevel = MAX_LEVEL_MVP
): LevelDecision {
  const recent = [...previousScores, newScore].slice(-3);

  if (recent.length < 3) {
    return { level: current, changed: 0, message_uz: null, recent };
  }

  const avg = recent.reduce((a, b) => a + b, 0) / recent.length;

  if (avg >= RPG_RULES.levelUpAvg && current < maxLevel) {
    const level = (current + 1) as RpgLevel;
    return {
      level,
      changed: 1,
      message_uz: `Zo'r ketyapsiz! Endi ${level}-darajaga o'tdingiz — savollar biroz qiyinlashadi.`,
      // A level change starts a fresh window, otherwise the same three scores
      // would keep triggering it.
      recent: [],
    };
  }

  if (avg <= RPG_RULES.levelDownAvg && current > 1) {
    const level = (current - 1) as RpgLevel;
    return {
      level,
      changed: -1,
      message_uz: `Hozircha ${level}-darajada mashq qilamiz — shoshilmaymiz, asta mustahkamlaymiz.`,
      recent: [],
    };
  }

  return { level: current, changed: 0, message_uz: null, recent };
}
