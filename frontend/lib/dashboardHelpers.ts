import type { DashboardOverview, Profile, Skill, StudyPlan } from "./types";

const SKILL_GOALS: Record<Skill, string> = {
  listening: "Complete a Listening practice test",
  reading: "Complete a Reading practice test",
  writing: "Practice Writing Task 2",
  speaking: "Record a Speaking Part 2 response",
};

const SKILL_LABELS: Record<Skill, string> = {
  listening: "Listening",
  reading: "Reading",
  writing: "Writing",
  speaking: "Speaking",
};

function profileBand(profile: Profile | null, skill: Skill): number | null {
  if (!profile) return null;
  const map: Record<Skill, number | null | undefined> = {
    listening: profile.listening_band,
    reading: profile.reading_band,
    writing: profile.writing_band,
    speaking: profile.speaking_band,
  };
  return map[skill] ?? null;
}

/** Skills sorted by priority: untested first, then lowest band. */
export function getWeakestSkills(
  overview: DashboardOverview | null,
  profile: Profile | null,
  limit = 2
): Skill[] {
  const skills: Skill[] = ["listening", "reading", "writing", "speaking"];

  const ranked = skills
    .map((skill) => {
      const attempts = overview?.stats?.[skill]?.attempts ?? 0;
      const score =
        overview?.stats?.[skill]?.current ??
        profileBand(profile, skill);
      return { skill, attempts, score };
    })
    .sort((a, b) => {
      if (a.attempts === 0 && b.attempts > 0) return -1;
      if (b.attempts === 0 && a.attempts > 0) return 1;
      if (a.score === null && b.score !== null) return -1;
      if (b.score === null && a.score !== null) return 1;
      return (a.score ?? 99) - (b.score ?? 99);
    });

  return ranked.slice(0, limit).map((r) => r.skill);
}

export function getTodaysGoal(
  overview: DashboardOverview | null,
  studyPlan: StudyPlan | null,
  profile: Profile | null
): string {
  const focusSkill = studyPlan?.focus_skills?.[0];
  if (focusSkill) {
    const key = focusSkill.toLowerCase() as Skill;
    if (SKILL_GOALS[key]) return SKILL_GOALS[key];
    return `Focus on ${focusSkill}`;
  }

  const weakest = getWeakestSkills(overview, profile, 1)[0];
  return SKILL_GOALS[weakest];
}

export function getFocusAreasText(
  overview: DashboardOverview | null,
  studyPlan: StudyPlan | null,
  profile: Profile | null,
  recommendation?: string | null
): string {
  if (recommendation?.trim()) return recommendation.trim();

  const focus = studyPlan?.focus_skills?.slice(0, 2);
  if (focus?.length) {
    return `${focus.join(" and ")} — your study plan focus areas. Keep practicing these skills today.`;
  }

  const weakest = getWeakestSkills(overview, profile, 2);
  if (weakest.length === 0) {
    return "Complete a mock test to identify your personalized focus areas.";
  }
  if (weakest.length === 1) {
    return `${SKILL_LABELS[weakest[0]]} needs the most practice — start there today.`;
  }
  return `${SKILL_LABELS[weakest[0]]} and ${SKILL_LABELS[weakest[1]]} need the most practice based on your results.`;
}
