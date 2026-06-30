import { NextRequest, NextResponse } from "next/server";
import { getAuth } from "@/lib/supabaseServer";
import { buildStudyPlan } from "@/lib/studyPlan";

// Returns a complete StudyPlan (see lib/types.ts). If the user saved a plan
// with all required fields we reuse it; otherwise we compute one from their
// profile so the dashboard always receives a valid shape.
export async function GET(req: NextRequest) {
  try {
    const { supabase, user } = await getAuth(req);
    if (!user) {
      return NextResponse.json(buildStudyPlan("B1", 6.5));
    }

    const { data } = await supabase
      .from("profiles")
      .select("current_level, target_band, study_plan")
      .eq("id", user.id)
      .maybeSingle();

    const saved = data?.study_plan;
    if (saved && typeof saved === "object" && Array.isArray(saved.focus_skills)) {
      return NextResponse.json(saved);
    }

    return NextResponse.json(
      buildStudyPlan(data?.current_level, data?.target_band)
    );
  } catch {
    return NextResponse.json(buildStudyPlan("B1", 6.5));
  }
}
