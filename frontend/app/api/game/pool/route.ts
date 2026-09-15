import { NextRequest, NextResponse } from "next/server";
import { getAuth } from "@/lib/supabaseServer";
import { getAllItems, getAllSentences } from "@/lib/gameStaticData";
import { pickAdaptiveItems } from "@/lib/gameAdaptive";
import { levelFromXp } from "@/lib/gameEngine";

// Per-user and auth-header dependent: never prerender.
export const dynamic = "force-dynamic";

// Returns an adaptive, non-repetitive slice of the hand-curated static
// master pool (extracted directly from the real Reading & Listening test
// bank) for any of the Word Games to consume. Instead of pure random
// shuffling, this prioritises words the player hasn't learned yet, mixes in
// a smaller review slice of already-known words for spaced repetition, and
// biases difficulty (B2/C1/C2) towards the player's current game level.
export async function GET(req: NextRequest) {
  try {
    const { supabase, user } = await getAuth(req);
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const url = new URL(req.url);
    const itemLimit = Math.min(60, Math.max(1, Number(url.searchParams.get("items")) || 30));
    const sentenceLimit = Math.min(30, Math.max(0, Number(url.searchParams.get("sentences")) || 0));

    const [{ data: vocabRows }, { data: statsRow }] = await Promise.all([
      supabase.from("vocabulary").select("word").eq("user_id", user.id),
      supabase.from("user_game_stats").select("xp").eq("user_id", user.id).maybeSingle(),
    ]);

    const knownWords = new Set((vocabRows ?? []).map((r: { word: string }) => r.word.trim().toLowerCase()));
    const level = levelFromXp(statsRow?.xp ?? 0);

    const items = pickAdaptiveItems(getAllItems(), { level, knownWords, limit: itemLimit });
    const sentences = sentenceLimit > 0 ? shuffle(getAllSentences()).slice(0, sentenceLimit) : [];

    return NextResponse.json({ items, sentences });
  } catch (error: any) {
    console.error("Game pool fetch error:", error);
    return NextResponse.json({ error: "Failed to load pool" }, { status: 500 });
  }
}

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}
