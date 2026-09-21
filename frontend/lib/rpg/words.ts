// Spaced repetition for the words a scene teaches.
//
// Stage drives the review interval; strength is the visible "how well do I know
// this" bar. Decay is deliberately NOT stored — it is computed on read, so a
// player who disappears for a month does not need a cron job to have their
// words look stale.

import { RPG_RULES } from "./config";
import type { WordOutcome } from "./types";

export interface WordRow {
  word: string;
  uz: string | null;
  stage: number;
  strength: number;
  next_review_at: string;
  seen_count: number;
  lapses: number;
}

const INTERVALS = RPG_RULES.reviewIntervalDays;

function clampStage(n: number): number {
  return Math.max(0, Math.min(INTERVALS.length - 1, Math.round(n)));
}

function clampStrength(n: number): number {
  return Math.max(0, Math.min(100, Math.round(n)));
}

export function nextReviewAt(stage: number, from = new Date()): string {
  const days = INTERVALS[clampStage(stage)] ?? 0;
  return new Date(from.getTime() + days * 86_400_000).toISOString();
}

/** A brand-new word the player has just met. */
export function newWordRow(word: string, uz: string): WordRow {
  return {
    word,
    uz,
    stage: 0,
    strength: 20,
    next_review_at: nextReviewAt(0),
    seen_count: 1,
    lapses: 0,
  };
}

/**
 * Apply one scene's outcome to a word.
 *
 *   used correctly, no hint -> stage +1, strength +15
 *   only recognized        -> stage unchanged, strength +5
 *   used wrongly           -> stage -2, strength -15, lapse
 */
export function applyOutcome(row: WordRow, outcome: WordOutcome, now = new Date()): WordRow {
  let { stage, strength, lapses } = row;

  if (outcome === "used_correctly") {
    stage = clampStage(stage + 1);
    strength = clampStrength(strength + 15);
  } else if (outcome === "recognized") {
    strength = clampStrength(strength + 5);
  } else {
    stage = clampStage(Math.max(0, stage - 2));
    strength = clampStrength(strength - 15);
    lapses += 1;
  }

  return {
    ...row,
    stage,
    strength,
    lapses,
    seen_count: row.seen_count + 1,
    next_review_at: nextReviewAt(stage, now),
  };
}

/**
 * Strength as the player should see it: the stored value minus 5 per day the
 * word is overdue. Never mutates the row.
 */
export function displayedStrength(row: Pick<WordRow, "strength" | "next_review_at">, now = Date.now()): number {
  const due = new Date(row.next_review_at).getTime();
  if (!Number.isFinite(due) || now <= due) return clampStrength(row.strength);
  const overdueDays = Math.floor((now - due) / 86_400_000);
  return clampStrength(row.strength - overdueDays * RPG_RULES.decayPerOverdueDay);
}

export function isDue(row: Pick<WordRow, "next_review_at">, now = Date.now()): boolean {
  const due = new Date(row.next_review_at).getTime();
  return !Number.isFinite(due) || due <= now;
}

/**
 * Decide each target word's outcome from what actually happened in the scene.
 *
 * `usedCorrectly` / `usedWrongly` come from the model's per-turn report, but
 * only for words it actually introduced, and "correctly" is downgraded to
 * "recognized" when the player leaned on help — that is the difference between
 * producing a word and merely recognising it.
 */
export function outcomesForScene(
  targetWords: string[],
  introduced: Set<string>,
  usedCorrectly: Set<string>,
  usedWrongly: Set<string>,
  usedHelp: boolean
): Record<string, WordOutcome> {
  const out: Record<string, WordOutcome> = {};
  for (const raw of targetWords) {
    const word = raw.toLowerCase();
    if (!introduced.has(word)) continue; // never shown -> not learned, skip
    if (usedWrongly.has(word)) {
      out[word] = "used_wrongly";
    } else if (usedCorrectly.has(word)) {
      out[word] = usedHelp ? "recognized" : "used_correctly";
    } else {
      out[word] = "recognized";
    }
  }
  return out;
}
