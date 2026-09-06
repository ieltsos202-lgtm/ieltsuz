import { NextRequest, NextResponse } from "next/server";
import { getAuth } from "@/lib/supabaseServer";
import { levelFromXp, levelProgress } from "@/lib/gameEngine";

interface LearnedWord {
  word: string;
  translation?: string | null;
  phonetic?: string | null;
  definition?: string | null;
  examples?: string[];
}

// Persists XP/combo gains from a finished Word Battle round and folds every
// word the player saw into their permanent vocabulary list (deduped).
export async function POST(req: NextRequest) {
  try {
    const { supabase, user } = await getAuth(req);
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const body = await req.json();
    const xpGained: number = Math.max(0, Math.round(Number(body.xpGained) || 0));
    const bestCombo: number = Math.max(0, Math.round(Number(body.bestCombo) || 0));
    const learnedWords: LearnedWord[] = Array.isArray(body.learnedWords) ? body.learnedWords : [];

    const { data: existingStats } = await supabase
      .from("user_game_stats")
      .select("xp, games_played, best_combo")
      .eq("user_id", user.id)
      .maybeSingle();

    const prevXp = existingStats?.xp ?? 0;
    const newXp = prevXp + xpGained;
    const prevLevel = levelFromXp(prevXp);
    const newLevel = levelFromXp(newXp);

    await supabase.from("user_game_stats").upsert(
      {
        user_id: user.id,
        xp: newXp,
        games_played: (existingStats?.games_played ?? 0) + 1,
        best_combo: Math.max(existingStats?.best_combo ?? 0, bestCombo),
        updated_at: new Date().toISOString(),
      },
      { onConflict: "user_id" }
    );

    // Fold learned words into the permanent vocabulary list, skipping
    // duplicates (case-insensitive match on word).
    for (const w of learnedWords.slice(0, 20)) {
      if (!w.word) continue;
      try {
        const { data: dup } = await supabase
          .from("vocabulary")
          .select("id")
          .eq("user_id", user.id)
          .ilike("word", w.word)
          .limit(1);
        if (dup && dup.length > 0) continue;

        await supabase.from("vocabulary").insert({
          user_id: user.id,
          word: w.word,
          definition: w.definition ?? null,
          translation: w.translation ?? null,
          phonetic: w.phonetic ?? null,
          example: w.examples?.[0] ?? null,
          examples: w.examples?.length ? w.examples : null,
          source: "word_battle",
        });
      } catch {
        /* best-effort — never fail the finish response over one word */
      }
    }

    const progress = levelProgress(newXp);
    return NextResponse.json({
      xp_gained: xpGained,
      leveled_up: newLevel > prevLevel,
      stats: {
        xp: newXp,
        level: progress.level,
        xp_into_level: progress.xpIntoLevel,
        xp_needed: progress.xpNeeded,
        percent: progress.percent,
        games_played: (existingStats?.games_played ?? 0) + 1,
        best_combo: Math.max(existingStats?.best_combo ?? 0, bestCombo),
      },
    });
  } catch (error: any) {
    console.error("Game finish error:", error);
    return NextResponse.json({ error: "Failed to save game result" }, { status: 500 });
  }
}
