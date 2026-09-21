// ALL tunable limits for the "New City" RPG live here, in one file, so the
// free/Pro balance can be changed without hunting through route handlers.

import type { RpgLevel } from "./types";

export const RPG_LIMITS = {
  free: {
    scenesPerDay: 2,
    aiTurnsPerDay: 40,
    maxLevel: 3 as RpgLevel,
  },
  pro: {
    // "Unlimited" in the product sense; the numbers are abuse ceilings.
    scenesPerDay: 100,
    aiTurnsPerDay: 400,
    maxLevel: 3 as RpgLevel, // raised to 5 in Phase 3 (voice + complications)
  },
} as const;

/** MVP ships levels 1-3; 4-5 need voice mode. */
export const MAX_LEVEL_MVP: RpgLevel = 3;

export const RPG_AI = {
  /** Cheapest model that holds the JSON contract; falls back down the chain. */
  model: process.env.RPG_MODEL || "gemini-3.1-flash-lite",
  /** One NPC turn is two short bilingual lines + a little metadata. */
  maxOutputTokens: 900,
  /** Only the tail of the conversation is sent, to keep prompts cheap. */
  historyTurns: 8,
  /** Hard stop so a hanging model call cannot hold the request open. */
  timeoutMs: 15_000,
  temperature: 0.8,
} as const;

export const RPG_RULES = {
  /** Player messages longer than this are trimmed. */
  maxPlayerMessage: 300,
  /** Per-user cap on /turn, independent of the daily AI budget. */
  turnRateLimit: { limit: 25, windowMs: 60_000 },
  /** Facts remembered per NPC, and their max length. */
  maxNpcFacts: 3,
  maxNpcFactChars: 80,
  /** Spaced-repetition intervals in days, indexed by stage. */
  reviewIntervalDays: [0, 1, 3, 7, 14, 30],
  /** Displayed strength lost per day once a word is overdue. */
  decayPerOverdueDay: 5,
  /** Scoring weights — must add up to 100. */
  score: { objectives: 60, accuracy: 30, noHints: 10 },
  /** XP bonus for clearing every optional objective. */
  optionalBonusXp: 20,
  /** XP lost per hint. */
  hintPenaltyXp: 3,
  /** Auto-difficulty thresholds on the average of the last 3 scenes. */
  levelUpAvg: 80,
  levelDownAvg: 50,
} as const;

export const BADGES = {
  first_scene: "Birinchi sahna",
  streak_3: "3 kunlik seriya",
  words_20: "20 so'z o'rganildi",
  chapter_1: "1-bob tugallandi",
} as const;

export type BadgeId = keyof typeof BADGES;
