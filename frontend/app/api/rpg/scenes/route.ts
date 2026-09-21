import { NextRequest, NextResponse } from "next/server";

import { getAuth } from "@/lib/supabaseServer";
import { allScenes, getNpc } from "@/lib/rpg/scenes";
import { isDue } from "@/lib/rpg/words";
import type { SceneListItem } from "@/lib/rpg/types";

// Per-user progress: never prerender.
export const dynamic = "force-dynamic";

/**
 * The chapter map: every scene with its lock state, best score and a
 * "recommended" flag for the scene holding the most words that are due for
 * review. Scenes unlock in order — the previous one must be completed.
 */
export async function GET(req: NextRequest) {
  try {
    const { supabase, user } = await getAuth(req);
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const [{ data: progressRows }, { data: wordRows }] = await Promise.all([
      supabase
        .from("rpg_scene_progress")
        .select("scene_id, best_score, attempts, completed_at")
        .eq("user_id", user.id),
      supabase.from("rpg_words").select("word, next_review_at").eq("user_id", user.id),
    ]);

    const progress = new Map(
      (progressRows || []).map((r: any) => [r.scene_id, r])
    );
    const dueWords = new Set(
      (wordRows || [])
        .filter((r: any) => isDue({ next_review_at: r.next_review_at }))
        .map((r: any) => String(r.word).toLowerCase())
    );

    const scenes = allScenes();
    const items: SceneListItem[] = scenes.map((scene, index) => {
      const npc = getNpc(scene.npc_id);
      const own = progress.get(scene.id);
      const previous = index > 0 ? progress.get(scenes[index - 1].id) : null;

      return {
        id: scene.id,
        order: scene.order,
        title_uz: scene.title_uz,
        intro_uz: scene.intro_uz,
        image: scene.image,
        npc_name: npc?.name || "",
        npc_role_uz: npc?.role_uz || "",
        // First scene is always open; the rest need the previous one finished.
        locked: index > 0 && !previous?.completed_at,
        completed: !!own?.completed_at,
        best_score: own?.best_score ?? 0,
        attempts: own?.attempts ?? 0,
        recommended: false,
        due_words: scene.target_words.filter((w) => dueWords.has(w.word.toLowerCase())).length,
      };
    });

    // Recommend the unlocked scene carrying the most due words; if nothing is
    // due yet, point at the first scene the player has not finished.
    const unlocked = items.filter((i) => !i.locked);
    const withDue = unlocked.filter((i) => i.due_words > 0);
    const target = withDue.length
      ? withDue.reduce((best, i) => (i.due_words > best.due_words ? i : best))
      : unlocked.find((i) => !i.completed);
    if (target) target.recommended = true;

    return NextResponse.json({ scenes: items });
  } catch (error) {
    console.error("rpg/scenes error:", error);
    return NextResponse.json(
      { error: "Sahnalarni yuklab bo'lmadi. Keyinroq urinib ko'ring." },
      { status: 500 }
    );
  }
}
