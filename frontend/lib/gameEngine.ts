// Pure helpers shared by the client game UI and the server finish/stats
// routes so XP <-> level math is always consistent everywhere.
// The curve itself lives in lib/leveling.ts (100-level engine, tiers,
// per-game difficulty) — re-exported here for existing imports.

export {
  levelFromXp,
  xpForLevel,
  levelProgress,
  type LevelProgress,
} from "./leveling";

// XP awarded for one correct answer: base + combo bonus + speed bonus.
export function calcAnswerXp(combo: number, timeLeftRatio: number): number {
  const base = 10;
  const comboBonus = Math.min(combo, 10) * 2;
  const speedBonus = Math.round(Math.max(0, timeLeftRatio) * 6);
  return base + comboBonus + speedBonus;
}

// Tailwind classes for the small B2/C1/C2 difficulty badges shown on word
// cards across the mini-games, colour-coded from easiest to hardest.
export function difficultyColor(difficulty: string): string {
  switch (difficulty) {
    case "C2":
      return "border-accent-red/40 bg-accent-red/15 text-accent-red";
    case "C1":
      return "border-accent-yellow/40 bg-accent-yellow/15 text-accent-yellow";
    default:
      return "border-accent-green/40 bg-accent-green/15 text-accent-green";
  }
}
