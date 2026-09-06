import { NextRequest, NextResponse } from "next/server";
import { getAuth } from "@/lib/supabaseServer";

export async function PATCH(req: NextRequest) {
  try {
    const { supabase, user } = await getAuth(req);
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const body = await req.json();
    const update: Record<string, any> = {};
    if (body.full_name !== undefined) update.full_name = body.full_name;
    if (body.email !== undefined) update.email = body.email;
    if (body.exam_date !== undefined) update.exam_date = body.exam_date;
    if (body.current_level !== undefined) update.current_level = body.current_level;
    if (body.target_band !== undefined) update.target_band = body.target_band;
    if (body.onboarding_completed !== undefined) update.onboarding_completed = body.onboarding_completed;
    if (body.ielts_experience !== undefined) update.ielts_experience = body.ielts_experience;
    if (body.listening_band !== undefined) update.listening_band = body.listening_band;
    if (body.reading_band !== undefined) update.reading_band = body.reading_band;
    if (body.writing_band !== undefined) update.writing_band = body.writing_band;
    if (body.speaking_band !== undefined) update.speaking_band = body.speaking_band;

    if (Object.keys(update).length === 0) {
      return NextResponse.json({ error: "No fields to update" }, { status: 400 });
    }

    const { error } = await supabase.from("profiles").update(update).eq("id", user.id);
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json({ error: "Failed to update profile" }, { status: 500 });
  }
}
