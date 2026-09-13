import { NextRequest, NextResponse } from "next/server";
import { getAuth } from "@/lib/supabaseServer";

export async function GET(req: NextRequest) {
  const { supabase, user } = await getAuth(req);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data } = await (supabase as any)
    .from("speaking_progress")
    .select("total_sessions, recurring_errors, last_session_at, band_trend")
    .eq("user_id", user.id)
    .maybeSingle();

  return NextResponse.json({
    total_sessions: data?.total_sessions ?? 0,
    recurring_errors: data?.recurring_errors ?? [],
    last_session_at: data?.last_session_at ?? null,
    band_trend: data?.band_trend ?? [],
  });
}
