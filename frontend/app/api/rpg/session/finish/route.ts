import { NextRequest, NextResponse } from "next/server";

import { getAuth } from "@/lib/supabaseServer";
import { BADGES, type BadgeId } from "@/lib/rpg/config";
import { getNpc, getScene, nextSceneId } from "@/lib/rpg/scenes";
import {
  limitsFor,
  loadIsPro,
  loadRpgProfile,
  loadSession,
  localDay,
  saveNpcMemory,
} from "@/lib/rpg/db";
import { clampLevel, decideLevel, sceneScore, xpForScene } from "@/lib/rpg/levels";
import { applyOutcome, newWordRow, outcomesForScene, type WordRow } from "@/lib/rpg/words";
import { extractFacts } from "@/lib/rpg/ai";
import type { FinishResponse, ObjectiveView, SessionState } from "@/lib/rpg/types";

export const dynamic = "force-dynamic";

/**
 * Close a scene and settle everything it earned: score, XP, spaced-repetition
 * updates, streak, the next difficulty level, NPC memory and badges.
 *
 * Idempotent: a second call on a finished session returns the stored result
 * instead of paying out twice.
 */
export async function POST(req: NextRequest) {
  try {
    const { supabase, user } = await getAuth(req);
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const body = await req.json().catch(() => ({}));
    const session = await loadSession(supabase, user.id, body?.session_id);
    if (!session) return NextResponse.json({ error: "Sessiya topilmadi." }, { status: 404 });

    const scene = getScene(session.scene_id);
    const npc = scene ? getNpc(scene.npc_id) : null;
    if (!scene || !npc) return NextResponse.json({ error: "Sahna topilmadi." }, { status: 404 });

    const state = (session.state_json || {}) as SessionState;
    const completed = new Set(
      Array.isArray(state.completed_objectives) ? state.completed_objectives : []
    );

    if (session.status === "finished") {
      // Already settled — hand back a read-only view, pay nothing again.
      const profile = await loadRpgProfile(supabase, user.id);
      return NextResponse.json(storedResult(scene, completed, state, profile));
    }

    // ------------------------------------------------------------- scoring ----
    const score = sceneScore(state, scene, session.hints_used);
    const optional = scene.objectives.filter((o) => !o.required);
    const allOptionalDone = optional.length > 0 && optional.every((o) => completed.has(o.id));
    const xpGained = xpForScene(score, allOptionalDone, session.hints_used);
    const requiredDone = scene.objectives.filter((o) => o.required).every((o) => completed.has(o.id));

    // Mark the session finished FIRST: if anything below fails, the player
    // cannot replay the same session to farm XP.
    const { error: closeError } = await supabase
      .from("rpg_sessions")
      .update({ status: "finished", finished_at: new Date().toISOString() })
      .eq("id", session.id)
      .eq("user_id", user.id)
      .eq("status", "active");
    if (closeError) throw closeError;

    // ------------------------------------------------------ spaced repetition ----
    const outcomes = outcomesForScene(
      scene.target_words.map((w) => w.word),
      new Set((state.words_introduced || []).map((w) => w.toLowerCase())),
      new Set(
        Object.entries(state.word_outcomes || {})
          .filter(([, v]) => v === "used_correctly")
          .map(([k]) => k)
      ),
      new Set(
        Object.entries(state.word_outcomes || {})
          .filter(([, v]) => v === "used_wrongly")
          .map(([k]) => k)
      ),
      session.hints_used > 0
    );

    const words = Object.keys(outcomes);
    const { data: existingRows } = words.length
      ? await supabase
          .from("rpg_words")
          .select("word, uz, stage, strength, next_review_at, seen_count, lapses, first_scene_id")
          .eq("user_id", user.id)
          .in("word", words)
      : { data: [] as any[] };

    const existing = new Map((existingRows || []).map((r: any) => [String(r.word).toLowerCase(), r]));
    const now = new Date();
    const upserts: any[] = [];
    const learned: FinishResponse["new_words"] = [];

    for (const [word, outcome] of Object.entries(outcomes)) {
      const target = scene.target_words.find((t) => t.word.toLowerCase() === word);
      const prior = existing.get(word) as (WordRow & { first_scene_id?: string }) | undefined;
      const base: WordRow = prior || newWordRow(word, target?.uz || "");
      const updated = applyOutcome(base, outcome, now);

      upserts.push({
        user_id: user.id,
        word,
        uz: base.uz || target?.uz || null,
        stage: updated.stage,
        strength: updated.strength,
        next_review_at: updated.next_review_at,
        seen_count: updated.seen_count,
        lapses: updated.lapses,
        // Every row must carry the SAME keys: PostgREST rejects a bulk upsert
        // whose objects have different shapes, and an omitted key here would
        // also overwrite the original scene on a word the player already had.
        first_scene_id: prior?.first_scene_id ?? scene.id,
        updated_at: now.toISOString(),
      });

      if (!existing.has(word)) {
        learned.push({
          word,
          uz: target?.uz || "",
          stage: updated.stage,
          strength: updated.strength,
        });
      }
    }

    if (upserts.length) {
      await supabase.from("rpg_words").upsert(upserts, { onConflict: "user_id,word" });
    }

    // ------------------------------------------------- profile, streak, level ----
    const [profile, isPro] = await Promise.all([
      loadRpgProfile(supabase, user.id),
      loadIsPro(supabase, user.id),
    ]);
    const limits = limitsFor(isPro);

    const day = localDay(body?.day);
    // A scene finished on a new local day continues the streak; a gap resets it.
    const streak = nextStreak(profile.streak, profile.last_played_date, day);

    const decision = decideLevel(
      clampLevel(profile.level, limits.maxLevel),
      profile.recent_scores,
      score,
      limits.maxLevel
    );

    const { count: wordCount } = await supabase
      .from("rpg_words")
      .select("word", { count: "exact", head: true })
      .eq("user_id", user.id);

    const newBadges = await awardBadges(
      supabase,
      user.id,
      profile.badges,
      { streak, wordCount: wordCount ?? 0, sceneCompleted: requiredDone, sceneId: scene.id }
    );

    await supabase
      .from("rpg_profile")
      .update({
        xp: profile.xp + xpGained,
        streak,
        last_played_date: day,
        level: decision.level,
        recent_scores: decision.recent,
        badges: [...profile.badges, ...newBadges],
        updated_at: now.toISOString(),
      })
      .eq("user_id", user.id);

    // ------------------------------------------------------------- progress ----
    const { data: prevProgress } = await supabase
      .from("rpg_scene_progress")
      .select("best_score, completed_at")
      .eq("user_id", user.id)
      .eq("scene_id", scene.id)
      .maybeSingle();

    await supabase.from("rpg_scene_progress").upsert(
      {
        user_id: user.id,
        scene_id: scene.id,
        best_score: Math.max((prevProgress as any)?.best_score ?? 0, score),
        // Only a genuinely completed scene unlocks the next one.
        completed_at: requiredDone
          ? (prevProgress as any)?.completed_at || now.toISOString()
          : (prevProgress as any)?.completed_at ?? null,
        updated_at: now.toISOString(),
      },
      { onConflict: "user_id,scene_id" }
    );

    // ----------------------------------------------------------- npc memory ----
    // Best-effort and non-blocking for correctness: if fact extraction fails,
    // the player still gets their result screen.
    if (requiredDone) {
      try {
        const transcript = (state.transcript || [])
          .map((t) => `${t.role === "npc" ? npc.name : "Player"}: ${t.text}`)
          .join("\n");
        const facts = await extractFacts(transcript, npc.name);
        await saveNpcMemory(supabase, user.id, npc.id, facts, score >= 70 ? 10 : 4);
      } catch (err) {
        console.error("rpg npc memory failed:", String((err as any)?.message || err).slice(0, 120));
      }
    }

    const response: FinishResponse = {
      scene_score: score,
      xp_gained: xpGained,
      total_xp: profile.xp + xpGained,
      objectives: objectiveViews(scene, completed),
      new_words: learned,
      errors: Array.isArray(state.errors) ? state.errors.slice(0, 8) : [],
      streak,
      level: decision.level,
      level_changed: decision.changed,
      level_message_uz: decision.message_uz,
      new_badges: newBadges.map((b) => BADGES[b as BadgeId] || b),
      next_scene_id: requiredDone ? nextSceneId(scene.id) : null,
    };

    return NextResponse.json(response);
  } catch (error) {
    console.error("rpg/session/finish error:", error);
    return NextResponse.json(
      { error: "Natijani hisoblab bo'lmadi. Keyinroq urinib ko'ring." },
      { status: 500 }
    );
  }
}

/** Consecutive-day check on the player's OWN calendar dates. */
function nextStreak(current: number, lastDay: string | null, today: string): number {
  if (!lastDay) return 1;
  if (lastDay === today) return Math.max(1, current); // already counted today
  const yesterday = new Date(Date.parse(`${today}T00:00:00Z`) - 86_400_000)
    .toISOString()
    .slice(0, 10);
  return lastDay === yesterday ? current + 1 : 1;
}

async function awardBadges(
  supabase: any,
  userId: string,
  owned: string[],
  ctx: { streak: number; wordCount: number; sceneCompleted: boolean; sceneId: string }
): Promise<BadgeId[]> {
  const have = new Set(owned);
  const earned: BadgeId[] = [];

  if (ctx.sceneCompleted && !have.has("first_scene")) earned.push("first_scene");
  if (ctx.streak >= 3 && !have.has("streak_3")) earned.push("streak_3");
  if (ctx.wordCount >= 20 && !have.has("words_20")) earned.push("words_20");

  // Chapter 1 is complete when the final scene is the one just finished.
  if (ctx.sceneCompleted && !have.has("chapter_1") && !nextSceneId(ctx.sceneId)) {
    earned.push("chapter_1");
  }

  return earned;
}

function objectiveViews(
  scene: NonNullable<ReturnType<typeof getScene>>,
  done: Set<string>
): ObjectiveView[] {
  return scene.objectives.map((o) => ({
    id: o.id,
    title_uz: o.title_uz,
    required: o.required,
    done: done.has(o.id),
  }));
}

/** Read-only replay of an already-settled session. */
function storedResult(
  scene: NonNullable<ReturnType<typeof getScene>>,
  completed: Set<string>,
  state: SessionState,
  profile: { xp: number; streak: number; level: number }
): FinishResponse {
  const requiredDone = scene.objectives.filter((o) => o.required).every((o) => completed.has(o.id));
  return {
    scene_score: 0,
    xp_gained: 0,
    total_xp: profile.xp,
    objectives: objectiveViews(scene, completed),
    new_words: [],
    errors: Array.isArray(state.errors) ? state.errors.slice(0, 8) : [],
    streak: profile.streak,
    level: clampLevel(profile.level),
    level_changed: 0,
    level_message_uz: null,
    new_badges: [],
    next_scene_id: requiredDone ? nextSceneId(scene.id) : null,
  };
}
