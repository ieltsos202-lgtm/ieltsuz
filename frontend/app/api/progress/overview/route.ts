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

function emptyOverview() {
  const stats = Object.fromEntries(
    SKILLS.map((s) => [s, { current: null, attempts: 0 }])
  );
  return { stats, recent_activity: [] as unknown[] };
}

// Returns DashboardOverview { stats, recent_activity } (see lib/types.ts).
export async function GET(req: NextRequest) {
  try {
    const { supabase, user } = await getAuth(req);
    if (!user) return NextResponse.json(emptyOverview());

    const uid = user.id;

    const results = await Promise.all(
      SKILLS.map((s) =>
        supabase
          .from(TABLE[s])
          .select("band_score, created_at")
          .eq("user_id", uid)
          .order("created_at", { ascending: false })
      )
    );

    const stats: Record<string, { current: number | null; attempts: number }> = {};
    const recent: { skill: Skill; band_score: number | null; created_at: string | null }[] = [];

    SKILLS.forEach((skill, i) => {
      const rows = results[i].data || [];
      stats[skill] = {
        current: rows.length ? rows[0].band_score ?? null : null,
        attempts: rows.length,
      };
      for (const r of rows.slice(0, 3)) {
        recent.push({ skill, band_score: r.band_score ?? null, created_at: r.created_at ?? null });
      }
    });

    recent.sort((a, b) =>
      String(b.created_at || "").localeCompare(String(a.created_at || ""))
    );

    return NextResponse.json({ stats, recent_activity: recent.slice(0, 8) });
  } catch {
    return NextResponse.json(emptyOverview());
  }
}
