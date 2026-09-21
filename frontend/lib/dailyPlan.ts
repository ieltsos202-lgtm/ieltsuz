import type { DashboardOverview, Profile, Skill, StudyPlan } from "./types";

// Everything the dashboard shows about "today" is derived deterministically
// from the study plan + the calendar date, so the same user always sees the
// same schedule for a given day without needing extra DB tables.

export type PlanSkill = Skill | "vocabulary" | "mock";

export interface DailyBlock {
  id: string;
  start: string;
  end: string;
  minutes: number;
  skill: PlanSkill;
  title: string;
  desc: string;
  href: string;
}

export interface HomeworkTask {
  id: string;
  title: string;
  desc: string;
  href: string;
  minutes: number;
}

export interface StudyPrefs {
  start_hour: number; // 0-23, when the learner begins studying
  done: Record<string, string[]>; // ISO date -> completed block/task ids
}

export const DEFAULT_PREFS: StudyPrefs = { start_hour: 19, done: {} };

export const SKILL_UZ: Record<PlanSkill, string> = {
  listening: "Listening",
  reading: "Reading",
  writing: "Writing",
  speaking: "Speaking",
  vocabulary: "So'z boyligi",
  mock: "Mock test",
};

const TASK_META: Record<
  PlanSkill,
  { title: string; desc: string; href: string; minutes: number }
> = {
  listening: {
    title: "Listening mashqi",
    desc: "Cambridge audiodan 1 bo'lim — javoblarni tekshirib, xatolarni yozib qo'ying",
    href: "/listening",
    minutes: 40,
  },
  reading: {
    title: "Reading mashqi",
    desc: "1 ta passage — vaqtni 20 daqiqaga belgilab o'qing",
    href: "/reading",
    minutes: 40,
  },
  writing: {
    title: "Writing mashqi",
    desc: "1 ta Task yozib, AI imtihonchidan baho oling",
    href: "/writing",
    minutes: 45,
  },
  speaking: {
    title: "Speaking mashqi",
    desc: "AI imtihonchi bilan Part 1 va 2 ni gaplashib chiqing",
    href: "/speaking",
    minutes: 30,
  },
  vocabulary: {
    title: "So'z yodlash",
    desc: "20 ta yangi so'z + kechagi so'zlarni takrorlash",
    href: "/vocabulary",
    minutes: 25,
  },
  mock: {
    title: "To'liq Mock Test",
    desc: "4 bo'lim ketma-ket — haqiqiy imtihon sharoitida",
    href: "/mock-test",
    minutes: 165,
  },
};

// Weekly rotation: every skill gets touched at least twice a week and the
// full mock lands on Saturday when learners have the most free time.
const WEEK_TEMPLATE: Record<number, PlanSkill[]> = {
  0: ["reading", "vocabulary"], // Yakshanba
  1: ["listening", "writing"], // Dushanba
  2: ["reading", "speaking"], // Seshanba
  3: ["writing", "vocabulary"], // Chorshanba
  4: ["listening", "speaking"], // Payshanba
  5: ["reading", "writing"], // Juma
  6: ["mock"], // Shanba
};

export const WEEKDAY_UZ = [
  "Yakshanba",
  "Dushanba",
  "Seshanba",
  "Chorshanba",
  "Payshanba",
  "Juma",
  "Shanba",
];

export const MONTH_UZ = [
  "yanvar",
  "fevral",
  "mart",
  "aprel",
  "may",
  "iyun",
  "iyul",
  "avgust",
  "sentabr",
  "oktabr",
  "noyabr",
  "dekabr",
];

/** "21-sentabr, 2026" — optionally prefixed with the weekday name. */
export function formatDateUz(date: Date, withWeekday = false): string {
  const base = `${date.getDate()}-${MONTH_UZ[date.getMonth()]}, ${date.getFullYear()}`;
  return withWeekday ? `${WEEKDAY_UZ[date.getDay()]}, ${base}` : base;
}

export function toISODate(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
    d.getDate()
  ).padStart(2, "0")}`;
}

function clockLabel(totalMinutes: number): string {
  const h = Math.floor(totalMinutes / 60) % 24;
  const m = totalMinutes % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

/** Skills ordered weakest-first, used to bias the plan toward problem areas. */
export function weakestSkills(
  overview: DashboardOverview | null,
  profile: Profile | null
): Skill[] {
  const skills: Skill[] = ["listening", "reading", "writing", "speaking"];
  const scoreOf = (s: Skill): number => {
    const live = overview?.stats?.[s]?.current;
    if (typeof live === "number") return live;
    const onboard = profile?.[`${s}_band` as keyof Profile];
    if (typeof onboard === "number") return onboard;
    return 0; // never practised -> treat as weakest
  };
  return [...skills].sort((a, b) => scoreOf(a) - scoreOf(b));
}

/**
 * Builds the concrete timetable for one day: real clock times, ordered, sized
 * to the learner's daily study budget.
 */
export function buildDailySchedule(
  plan: StudyPlan | null,
  prefs: StudyPrefs,
  weak: Skill[],
  date: Date
): DailyBlock[] {
  const iso = toISODate(date);
  const dow = date.getDay();
  const mocksPerWeek = plan?.mocks_per_week ?? 2;

  let skills = [...(WEEK_TEMPLATE[dow] ?? ["reading", "writing"])];

  // A third weekly mock replaces the Wednesday session.
  if (mocksPerWeek >= 3 && dow === 3) skills = ["mock"];

  // Always give the weakest skill a slot so the plan targets real gaps.
  const weakest = weak[0];
  if (weakest && !skills.includes("mock") && !skills.includes(weakest)) {
    skills[skills.length - 1] = weakest;
  }

  // Stretch or trim the day to match the study budget.
  const budget = Math.round((plan?.daily_study_hours ?? 2) * 60);
  if (!skills.includes("mock")) {
    let planned = skills.reduce((sum, s) => sum + TASK_META[s].minutes, 0);
    const pool = weak.filter((s) => !skills.includes(s));
    while (planned + 25 <= budget && pool.length) {
      const extra = pool.shift()!;
      skills.push(extra);
      planned += TASK_META[extra].minutes;
    }
    if (!skills.includes("vocabulary") && planned + 25 <= budget) {
      skills.push("vocabulary");
      planned += TASK_META.vocabulary.minutes;
    }
  }

  let cursor = Math.min(Math.max(prefs.start_hour, 0), 23) * 60;
  return skills.map((skill, i) => {
    const meta = TASK_META[skill];
    const start = cursor;
    cursor += meta.minutes;
    const block: DailyBlock = {
      id: `${iso}-${skill}-${i}`,
      start: clockLabel(start),
      end: clockLabel(cursor),
      minutes: meta.minutes,
      skill,
      title: meta.title,
      desc: meta.desc,
      href: meta.href,
    };
    cursor += 10; // short break between sessions
    return block;
  });
}

/**
 * Homework = deliverables the learner must hand in (graded by AI), separate
 * from the practice timetable above.
 */
export function buildHomework(
  plan: StudyPlan | null,
  weak: Skill[],
  date: Date
): HomeworkTask[] {
  const iso = toISODate(date);
  const dow = date.getDay();
  const target = (plan?.target_band ?? 6.5).toFixed(1);
  const focus = weak[0] ?? "writing";

  const tasks: HomeworkTask[] = [
    {
      id: `${iso}-hw-essay`,
      title: dow % 2 === 0 ? "Writing Task 2 — esse yozing" : "Writing Task 1 — grafik tasvirlang",
      desc:
        dow % 2 === 0
          ? "250 so'zdan kam bo'lmasin. Yozib bo'lgach AI imtihonchiga yuboring va bahoni ko'ring."
          : "150 so'z. Asosiy o'zgarishlarni va taqqoslashni albatta yozing.",
      href: "/writing",
      minutes: 40,
    },
    {
      id: `${iso}-hw-words`,
      title: "20 ta yangi so'z yodlang",
      desc: `Band ${target} uchun kerakli akademik so'zlar. Har birini o'z gapingizda ishlatib ko'ring.`,
      href: "/vocabulary",
      minutes: 25,
    },
    {
      id: `${iso}-hw-focus`,
      title: `${SKILL_UZ[focus]} bo'yicha qo'shimcha mashq`,
      desc: "Bu sizning eng past bo'limingiz — bugun unga alohida vaqt ajratdik.",
      href: TASK_META[focus].href,
      minutes: 30,
    },
  ];

  if (dow === 6) {
    return [
      {
        id: `${iso}-hw-mock`,
        title: "To'liq Mock Test topshiring",
        desc: "4 bo'lim ketma-ket, tanaffussiz. Natijani tahlil qilib, xatolar ro'yxatini yozing.",
        href: "/mock-test",
        minutes: 165,
      },
      tasks[1],
    ];
  }

  return tasks;
}

export function isDone(prefs: StudyPrefs, iso: string, id: string): boolean {
  return (prefs.done?.[iso] ?? []).includes(id);
}

/** Consecutive days (ending today) with at least one completed item. */
export function currentStreak(prefs: StudyPrefs, today: Date): number {
  let streak = 0;
  const cursor = new Date(today);
  for (let i = 0; i < 365; i++) {
    const iso = toISODate(cursor);
    if ((prefs.done?.[iso] ?? []).length > 0) {
      streak++;
    } else if (i > 0) {
      break;
    }
    cursor.setDate(cursor.getDate() - 1);
  }
  return streak;
}
