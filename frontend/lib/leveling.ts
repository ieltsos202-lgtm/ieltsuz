/**
 * Shared leveling engine for all Word Games — 100 levels, data-driven.
 *
 *   XP curve:   level N needs  xpForLevel(N) cumulative XP  (≈ 60·N^1.35)
 *   Tiers:      named bands (Beginner → Expert) mapped to CEFR vocabulary
 *   Difficulty: per-game config functions level → {timer, boardSize, ...}
 *
 * Everything a game needs comes from `difficultyFor(game, level)` — no
 * hardcoded constants inside game components, so future games plug into the
 * same engine.
 */

export const MAX_LEVEL = 100;

// ---------- XP curve ----------

export function levelFromXp(xp: number): number {
  const x = Math.max(0, xp);
  // Invert xpForLevel: xp = 60·(L-1)^1.35  →  L = (xp/60)^(1/1.35) + 1
  return Math.min(MAX_LEVEL, Math.floor(Math.pow(x / 60, 1 / 1.35)) + 1);
}

export function xpForLevel(level: number): number {
  return Math.round(60 * Math.pow(Math.max(0, level - 1), 1.35));
}

export interface LevelProgress {
  level: number;
  xpIntoLevel: number;
  xpNeeded: number;
  percent: number;
}

export function levelProgress(xp: number): LevelProgress {
  const level = levelFromXp(xp);
  const floor = xpForLevel(level);
  const nextFloor = xpForLevel(level + 1);
  const xpIntoLevel = Math.max(0, xp - floor);
  const xpNeeded = Math.max(1, nextFloor - floor);
  return {
    level,
    xpIntoLevel,
    xpNeeded,
    percent: Math.min(100, Math.round((xpIntoLevel / xpNeeded) * 100)),
  };
}

// ---------- Tiers ----------

export interface Tier {
  id: string;
  name: string;
  cefr: string;
  minLevel: number;
  maxLevel: number;
  /** Tailwind gradient classes for the tier badge / celebration. */
  gradient: string;
}

export const TIERS: Tier[] = [
  { id: "beginner", name: "Beginner", cefr: "A2–B1", minLevel: 1, maxLevel: 10, gradient: "from-accent-green to-accent" },
  { id: "elementary", name: "Elementary", cefr: "B1", minLevel: 11, maxLevel: 25, gradient: "from-accent to-accent-purple" },
  { id: "intermediate", name: "Intermediate", cefr: "B1–B2", minLevel: 26, maxLevel: 45, gradient: "from-accent-purple to-accent-red" },
  { id: "upper", name: "Upper-Intermediate", cefr: "B2", minLevel: 46, maxLevel: 70, gradient: "from-accent-yellow to-accent-red" },
  { id: "advanced", name: "Advanced", cefr: "C1", minLevel: 71, maxLevel: 90, gradient: "from-accent-red to-accent-purple" },
  { id: "expert", name: "Expert", cefr: "C1–C2", minLevel: 91, maxLevel: 100, gradient: "from-accent-yellow via-accent-red to-accent-purple" },
];

export function tierForLevel(level: number): Tier {
  return TIERS.find((t) => level >= t.minLevel && level <= t.maxLevel) ?? TIERS[0];
}

/** True when moving oldLevel → newLevel crosses into a different tier. */
export function crossedTier(oldLevel: number, newLevel: number): boolean {
  return tierForLevel(oldLevel).id !== tierForLevel(newLevel).id;
}

/** Vocabulary difficulty mix for a level — weights for B2/C1/C2 sampling. */
export function vocabWeightsForLevel(level: number): Record<"B2" | "C1" | "C2", number> {
  const t = tierForLevel(level).id;
  switch (t) {
    case "beginner":
      return { B2: 6, C1: 2, C2: 0.5 };
    case "elementary":
      return { B2: 5, C1: 3, C2: 1 };
    case "intermediate":
      return { B2: 3, C1: 4, C2: 2 };
    case "upper":
      return { B2: 2, C1: 4, C2: 3 };
    case "advanced":
      return { B2: 1, C1: 3, C2: 5 };
    default: // expert
      return { B2: 0.5, C1: 2, C2: 6 };
  }
}

// ---------- Per-game difficulty config ----------

export type GameId = "speed-match" | "memory-match" | "word-drop";

export interface SpeedMatchDifficulty {
  /** seconds per question */
  timerSeconds: number;
  /** questions per round */
  questions: number;
  /** distractor pool prefers same difficulty tier as the answer */
  trickyDistractors: boolean;
}

export interface MemoryMatchDifficulty {
  /** pairs per board */
  pairsPerBoard: number;
  boards: number;
  /** seconds per board */
  roundSeconds: number;
  /** seconds all cards stay face-up at round start (0 = no preview) */
  previewSeconds: number;
}

export interface WordDropDifficulty {
  /** base seconds for a word to reach the catch zone */
  fallSeconds: number;
  /** minimum fall time at max combo */
  minFallSeconds: number;
  /** fall-time reduction per combo step */
  fallStep: number;
  questions: number;
  trickyDistractors: boolean;
}

export type GameDifficulty =
  | ({ game: "speed-match" } & SpeedMatchDifficulty)
  | ({ game: "memory-match" } & MemoryMatchDifficulty)
  | ({ game: "word-drop" } & WordDropDifficulty);

/** Smooth 0→1 ramp inside the current tier (used to interpolate difficulty). */
function tierRamp(level: number): number {
  const t = tierForLevel(level);
  const span = Math.max(1, t.maxLevel - t.minLevel);
  return Math.min(1, Math.max(0, (level - t.minLevel) / span));
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

export function speedMatchDifficulty(level: number): SpeedMatchDifficulty {
  const t = tierForLevel(level).id;
  const r = tierRamp(level);
  // Base per tier, then a smooth intra-tier ramp shaves the timer further.
  const base =
    t === "beginner" ? 9 :
    t === "elementary" ? 8 :
    t === "intermediate" ? 7 :
    t === "upper" ? 6 :
    t === "advanced" ? 5.5 : 5;
  return {
    timerSeconds: Math.max(3.5, Math.round((base - r * 1.2) * 10) / 10),
    questions: t === "beginner" ? 12 : t === "expert" ? 18 : 15,
    trickyDistractors: level >= 26,
  };
}

export function memoryMatchDifficulty(level: number): MemoryMatchDifficulty {
  const t = tierForLevel(level).id;
  const r = tierRamp(level);
  const pairs =
    t === "beginner" ? 5 :
    t === "elementary" ? 6 :
    t === "intermediate" ? 7 :
    t === "upper" ? 8 :
    t === "advanced" ? 9 : 10;
  const baseTime =
    t === "beginner" ? 50 :
    t === "elementary" ? 46 :
    t === "intermediate" ? 42 :
    t === "upper" ? 38 :
    t === "advanced" ? 34 : 30;
  return {
    pairsPerBoard: pairs,
    boards: 3,
    roundSeconds: Math.max(20, Math.round(baseTime - r * 4)),
    // Beginners get a face-up preview; it shrinks to nothing by level ~45.
    previewSeconds: level <= 10 ? 3 : level <= 25 ? 2 : level <= 45 ? 1 : 0,
  };
}

export function wordDropDifficulty(level: number): WordDropDifficulty {
  const t = tierForLevel(level).id;
  const r = tierRamp(level);
  const base =
    t === "beginner" ? 7 :
    t === "elementary" ? 6.2 :
    t === "intermediate" ? 5.4 :
    t === "upper" ? 4.8 :
    t === "advanced" ? 4.2 : 3.8;
  return {
    fallSeconds: Math.max(2.6, Math.round((base - r * 0.8) * 10) / 10),
    minFallSeconds: t === "expert" ? 1.6 : t === "advanced" ? 1.8 : 2.2,
    fallStep: t === "beginner" ? 0.25 : 0.35,
    questions: t === "beginner" ? 14 : 16,
    trickyDistractors: level >= 26,
  };
}

export function difficultyFor(game: GameId, level: number): GameDifficulty {
  switch (game) {
    case "speed-match":
      return { game, ...speedMatchDifficulty(level) };
    case "memory-match":
      return { game, ...memoryMatchDifficulty(level) };
    default:
      return { game, ...wordDropDifficulty(level) };
  }
}
