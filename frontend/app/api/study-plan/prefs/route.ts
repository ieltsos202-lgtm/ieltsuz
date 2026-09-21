import { NextRequest, NextResponse } from "next/server";
import { getAuth } from "@/lib/supabaseServer";
import { DEFAULT_PREFS, type StudyPrefs } from "@/lib/dailyPlan";

// Study preferences (daily start time) and completed-task history live under
// the `study_prefs` key of the existing profiles.study_plan JSONB column, so
// no schema migration is required. We deliberately never write plan fields
// here, which keeps /api/study-plan/mine free to recompute the plan.

const MAX_DAYS = 60;

function sanitize(raw: unknown): StudyPrefs {
  const src = (raw ?? {}) as Partial<StudyPrefs>;
  const hour = Number(src.start_hour);
  const done: Record<string, string[]> = {};

  if (src.done && typeof src.done === "object") {
    const dates = Object.keys(src.done)
      .filter((d) => /^\d{4}-\d{2}-\d{2}$/.test(d))
      .sort()
      .slice(-MAX_DAYS);
    for (const d of dates) {
      const ids = (src.done as Record<string, unknown>)[d];
      if (Array.isArray(ids)) {
        done[d] = ids.filter((x): x is string => typeof x === "string").slice(0, 40);
      }
    }
  }

  return {
    start_hour: Number.isFinite(hour) && hour >= 0 && hour <= 23 ? Math.floor(hour) : DEFAULT_PREFS.start_hour,
    done,
  };
}

export async function GET(req: NextRequest) {
  try {
    const { supabase, user } = await getAuth(req);
    if (!user) return NextResponse.json(DEFAULT_PREFS);

    const { data } = await supabase
      .from("profiles")
      .select("study_plan")
      .eq("id", user.id)
      .maybeSingle();

    return NextResponse.json(sanitize((data?.study_plan as any)?.study_prefs));
  } catch {
    return NextResponse.json(DEFAULT_PREFS);
  }
}

export async function POST(req: NextRequest) {
  try {
    const { supabase, user } = await getAuth(req);
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const prefs = sanitize(await req.json());

    const { data } = await supabase
      .from("profiles")
      .select("study_plan")
      .eq("id", user.id)
      .maybeSingle();

    const existing =
      data?.study_plan && typeof data.study_plan === "object" ? data.study_plan : {};

    const { error } = await supabase
      .from("profiles")
      .update({ study_plan: { ...existing, study_prefs: prefs } })
      .eq("id", user.id);

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    return NextResponse.json(prefs);
  } catch {
    return NextResponse.json({ error: "Failed to save preferences" }, { status: 500 });
  }
}
