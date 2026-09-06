// Pure helpers shared by the client game UI and the server finish/stats
// routes so XP <-> level math is always consistent everywhere.

export function levelFromXp(xp: number): number {
  return Math.floor(Math.sqrt(Math.max(0, xp) / 50)) + 1;
}

export function xpForLevel(level: number): number {
  return 50 * (level - 1) ** 2;
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
