import { NextRequest, NextResponse } from "next/server";

import { getAuth } from "@/lib/supabaseServer";
import { displayedStrength, isDue } from "@/lib/rpg/words";
import type { WordCard } from "@/lib/rpg/types";

export const dynamic = "force-dynamic";

/**
 * The player's word collection. Strength is returned WITH decay applied, so the
 * bar the player sees reflects how long it has been since they last practised
 * — the stored value stays clean.
 */
export async function GET(req: NextRequest) {
  try {
    const { supabase, user } = await getAuth(req);
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { data, error } = await supabase
      .from("rpg_words")
      .select("word, uz, stage, strength, next_review_at, seen_count, lapses")
      .eq("user_id", user.id)
      .order("next_review_at", { ascending: true })
      .limit(500);
    if (error) throw error;

    const now = Date.now();
    const cards: WordCard[] = (data || []).map((r: any) => ({
      word: r.word,
      uz: r.uz ?? null,
      stage: r.stage ?? 0,
      strength: displayedStrength(r, now),
      due: isDue(r, now),
      seen_count: r.seen_count ?? 0,
      lapses: r.lapses ?? 0,
    }));

    return NextResponse.json({
      words: cards,
      summary: {
        total: cards.length,
        // The three filters the UI offers: yangi / o'rganilmoqda / mustahkam.
        new: cards.filter((c) => c.stage === 0).length,
        learning: cards.filter((c) => c.stage >= 1 && c.stage <= 3).length,
        strong: cards.filter((c) => c.stage >= 4).length,
        due: cards.filter((c) => c.due).length,
      },
    });
  } catch (error) {
    console.error("rpg/words error:", error);
    return NextResponse.json({ error: "So'zlarni yuklab bo'lmadi." }, { status: 500 });
  }
}
