import { NextRequest, NextResponse } from "next/server";
import { getAuth, checkAndDecrementTrial, trialDenied } from "@/lib/supabaseServer";

export async function POST(req: NextRequest) {
  try {
    const { supabase, user } = await getAuth(req);
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const trial = await checkAndDecrementTrial(req, "mock");
    if (!trial.ok) {
      const denied = trialDenied(trial);
      return NextResponse.json({ error: denied.error }, { status: denied.status });
    }

    const body = await req.json();
    await supabase.from("mock_test_results").insert({
      user_id: user.id,
      mock_test_id: body.mock_test_id,
      listening_band: body.listening_band,
      reading_band: body.reading_band,
      writing_band: body.writing_band,
      speaking_band: body.speaking_band,
      overall_band: body.overall_band,
    });

    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json({ error: "Failed to save" }, { status: 500 });
  }
}
