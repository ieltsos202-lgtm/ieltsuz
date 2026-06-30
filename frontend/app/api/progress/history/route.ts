import { NextRequest, NextResponse } from "next/server";
import { getAuth } from "@/lib/supabaseServer";

type Skill = "listening" | "reading" | "writing" | "speaking";
const SKILLS: Skill[] = ["listening", "reading", "writing", "speaking"];
const TABLE: Record<Skill, string> = {
  listening: "listening_results",
  reading: "reading_results",
  writing: "writing_results",
  speaking: "speaking_results",
};

function emptyHistory() {
  const series = Object.fromEntries(SKILLS.map((s) => [s, []]));
  const best = Object.fromEntries(SKILLS.map((s) => [s, null]));
  return { series, best, activity: {} as Record<string, number> };
}

// Returns ProgressHistory { series, best, activity } (see lib/types.ts).
export async function GET(req: NextRequest) {
  try {
    const { supabase, user } = await getAuth(req);
    if (!user) return NextResponse.json(emptyHistory());

    const uid = user.id;

    const results = await Promise.all(
      SKILLS.map((s) =>
        supabase
          .from(TABLE[s])
          .select("band_score, created_at, test_source")
          .eq("user_id", uid)
          .order("created_at", { ascending: true })
      )
    );

    const series: Record<string, { date: string; band: number }[]> = {};
    const best: Record<string, { band: number; test_source: string | null; date: string } | null> = {};
    const activity: Record<string, number> = {};

    SKILLS.forEach((skill, i) => {
      const rows = results[i].data || [];
      series[skill] = rows
        .filter((r) => typeof r.band_score === "number")
        .map((r) => ({ date: String(r.created_at).slice(0, 10), band: r.band_score }));

      let top: { band: number; test_source: string | null; date: string } | null = null;
      for (const r of rows) {
        if (typeof r.band_score !== "number") continue;
        if (!top || r.band_score > top.band) {
          top = { band: r.band_score, test_source: r.test_source ?? null, date: String(r.created_at).slice(0, 10) };
        }
        const day = String(r.created_at).slice(0, 10);
        if (day) activity[day] = (activity[day] || 0) + 1;
      }
      best[skill] = top;
    });

    return NextResponse.json({ series, best, activity });
  } catch {
    return NextResponse.json(emptyHistory());
  }
}
