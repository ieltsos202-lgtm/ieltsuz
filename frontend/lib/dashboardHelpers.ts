import type { DashboardOverview, Profile, Skill, StudyPlan } from "./types";

const SKILL_GOALS: Record<Skill, string> = {
  listening: "Listening mashqini bajarish",
  reading: "Reading mashqini bajarish",
  writing: "Writing Task 2 yozish",
  speaking: "Speaking Part 2 javobini yozib olish",
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
    return `${focusSkill} bo'limiga e'tibor bering`;
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
    return `${focus.join(" va ")} — rejangizdagi asosiy yo'nalishlar. Bugun shularga vaqt ajrating.`;
  }

  const weakest = getWeakestSkills(overview, profile, 2);
  if (weakest.length === 0) {
    return "Mock test topshirsangiz, qaysi bo'limga ko'proq e'tibor kerakligini aniq aytamiz.";
  }
  if (weakest.length === 1) {
    return `${SKILL_LABELS[weakest[0]]} eng ko'p mashq talab qiladi — bugun shundan boshlang.`;
  }
  return `Natijalaringizga ko'ra ${SKILL_LABELS[weakest[0]]} va ${SKILL_LABELS[weakest[1]]} eng ko'p mashq talab qiladi.`;
}
