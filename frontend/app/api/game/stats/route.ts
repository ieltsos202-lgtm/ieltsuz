import { NextRequest, NextResponse } from "next/server";
import { getAuth } from "@/lib/supabaseServer";
import { levelProgress } from "@/lib/gameEngine";

export async function GET(req: NextRequest) {
  try {
    const { supabase, user } = await getAuth(req);
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { data } = await supabase
      .from("user_game_stats")
      .select("xp, games_played, best_combo, game_stats")
      .eq("user_id", user.id)
      .maybeSingle();

    const xp = data?.xp ?? 0;
    const progress = levelProgress(xp);
    return NextResponse.json({
      xp,
      level: progress.level,
      xp_into_level: progress.xpIntoLevel,
      xp_needed: progress.xpNeeded,
      percent: progress.percent,
      games_played: data?.games_played ?? 0,
      best_combo: data?.best_combo ?? 0,
      game_stats: data?.game_stats && typeof data.game_stats === "object" ? data.game_stats : {},
    });
  } catch (error: any) {
    return NextResponse.json({ error: "Failed to load stats" }, { status: 500 });
  }
}
