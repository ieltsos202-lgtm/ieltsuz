import type { StudyPlan } from "./types";

// Approximate IELTS band for each CEFR level used in onboarding.
export const LEVEL_BANDS: Record<string, number> = {
  A1: 2.5,
  A2: 3.5,
  B1: 4.5,
  B2: 5.5,
  C1: 6.5,
  C2: 7.5,
};

/**
 * Deterministically builds a complete StudyPlan object so the UI always
 * receives every field it renders (prevents undefined-access crashes).
 */
export function buildStudyPlan(
  currentLevel: string | number | null | undefined,
  targetBand: number | null | undefined
): StudyPlan {
  const currentBand =
    LEVEL_BANDS[String(currentLevel)] ??
    (typeof currentLevel === "number" ? currentLevel : 5.0);
  const target = Number(targetBand) || 6.5;
  const bandGap = Math.max(Math.round((target - currentBand) * 2) / 2, 0);

  const estimatedDays = Math.max(Math.round(bandGap * 56) + 14, 14);
  const dailyHours = bandGap >= 2 ? 3 : bandGap >= 1 ? 2 : 1;
  const mocksPerWeek = bandGap >= 2 ? 3 : 2;
  const readyDate = new Date(
    Date.now() + estimatedDays * 86400000
  ).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });

  return {
    current_level: String(currentLevel ?? "B1"),
    current_band_estimate: currentBand,
    target_band: target,
    band_gap: bandGap,
    estimated_days: estimatedDays,
    mocks_per_week: mocksPerWeek,
    daily_study_hours: dailyHours,
    estimated_readiness_date: readyDate,
    message: `You're starting at an estimated band ${currentBand.toFixed(
      1
    )} and aiming for band ${target.toFixed(
      1
    )}. With consistent daily practice, you can reach your goal in about ${Math.round(
      estimatedDays / 7
    )} weeks. Stay focused and trust the process!`,
    focus_skills: ["Writing", "Speaking"],
  };
}
