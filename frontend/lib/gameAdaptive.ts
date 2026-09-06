// Adaptive, non-repetitive pool selection for the Word Games.
//
// Goal: instead of a pure random slice of the master pool every time (which
// quickly starts repeating the same words a player already knows), we:
//   1. Prioritise words the player hasn't learned yet ("new") over words
//      already saved in their personal vocabulary list ("review").
//   2. Mix in a smaller slice of already-known words for spaced-repetition
//      style reinforcement, so learned words don't vanish forever.
//   3. Bias difficulty (B2 / C1 / C2) towards the player's current game
//      level, so beginners see mostly B2 content and stronger players get
//      progressively more C1/C2 content.

import type { GameMasterItem } from "./types";

export type DifficultyTier = "beginner" | "intermediate" | "advanced";

export function tierForLevel(level: number): DifficultyTier {
  if (level <= 2) return "beginner";
  if (level <= 5) return "intermediate";
  return "advanced";
}

const DIFFICULTY_WEIGHTS: Record<DifficultyTier, Record<string, number>> = {
  beginner: { B2: 5, C1: 2, C2: 1 },
  intermediate: { B2: 3, C1: 3, C2: 2 },
  advanced: { B2: 1, C1: 3, C2: 4 },
};

function weightFor(difficulty: string, tier: DifficultyTier): number {
  return DIFFICULTY_WEIGHTS[tier][difficulty] ?? 2;
}

// Efficient weighted sampling without replacement (A-ES / "exponential jump"
// style): give every item a random score raised to 1/weight, then sort desc
// and take the top N. Higher-weight items are statistically more likely to
// float to the top while still allowing lower-weight items through.
function weightedSample<T>(items: T[], weightOf: (item: T) => number, count: number): T[] {
  const scored = items.map((item) => {
    const w = Math.max(0.01, weightOf(item));
    const score = Math.pow(Math.random(), 1 / w);
    return { item, score };
  });
  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, count).map((s) => s.item);
}

function plainShuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

interface PickOptions {
  level: number;
  /** lowercase, trimmed set of words the player already has in their vocabulary */
  knownWords: Set<string>;
  limit: number;
  /** fraction (0-1) of the final pool reserved for review of already-known words */
  reviewRatio?: number;
}

export function pickAdaptiveItems(allItems: GameMasterItem[], opts: PickOptions): GameMasterItem[] {
  const { level, knownWords, limit, reviewRatio = 0.25 } = opts;
  const tier = tierForLevel(level);

  const unseen: GameMasterItem[] = [];
  const seen: GameMasterItem[] = [];
  for (const item of allItems) {
    const key = item.word.trim().toLowerCase();
    if (knownWords.has(key)) seen.push(item);
    else unseen.push(item);
  }

  const reviewCount = Math.min(seen.length, Math.round(limit * reviewRatio));
  const newCount = limit - reviewCount;

  let picked: GameMasterItem[] = [];

  if (unseen.length > 0) {
    picked = picked.concat(weightedSample(unseen, (i) => weightFor(i.difficulty, tier), newCount));
  }
  // If there weren't enough unseen items to fill the "new" quota, top up from seen.
  const shortfall = newCount - picked.length;
  const reviewPool = plainShuffle(seen);
  const reviewPicked = reviewPool.slice(0, reviewCount + Math.max(0, shortfall));
  picked = picked.concat(reviewPicked);

  // Final shortfall (pool smaller than requested limit overall) — fill with
  // whatever is left over from either bucket, still respecting difficulty weight.
  if (picked.length < limit) {
    const usedIds = new Set(picked.map((p) => p.id));
    const leftovers = allItems.filter((i) => !usedIds.has(i.id));
    picked = picked.concat(weightedSample(leftovers, (i) => weightFor(i.difficulty, tier), limit - picked.length));
  }

  return plainShuffle(picked).slice(0, limit);
}
