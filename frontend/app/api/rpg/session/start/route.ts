import { NextRequest, NextResponse } from "next/server";

import { getAuth } from "@/lib/supabaseServer";
import { rateLimit } from "@/lib/rateLimit";
import { getNpc, getScene, prerequisiteOf } from "@/lib/rpg/scenes";
import {
  bumpUsage,
  emptyState,
  limitReached,
  limitsFor,
  loadIsPro,
  loadRpgProfile,
  localDay,
} from "@/lib/rpg/db";
import { clampLevel, inputModeFor, showsTranslation } from "@/lib/rpg/levels";
import type { ObjectiveView } from "@/lib/rpg/types";

export const dynamic = "force-dynamic";

/**
 * Open a scene. Checks the daily allowance, creates the session row and
 * returns the NPC's scripted opening line — so starting a scene costs no AI
 * call at all and the first screen is instant.
 */
export async function POST(req: NextRequest) {
  try {
    const { supabase, user } = await getAuth(req);
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    if (rateLimit(`rpg-start:${user.id}`, 20, 10 * 60_000)) {
      return NextResponse.json(
        { error: "Juda ko'p urinish. Bir ozdan keyin qayta boshlang." },
        { status: 429 }
      );
    }

    const body = await req.json().catch(() => ({}));
    const scene = getScene(String(body?.scene_id || ""));
    if (!scene) return NextResponse.json({ error: "Sahna topilmadi." }, { status: 404 });

    const npc = getNpc(scene.npc_id);
    if (!npc) return NextResponse.json({ error: "Sahna sozlanmagan." }, { status: 500 });

    const day = localDay(body?.day);
    const [profile, isPro] = await Promise.all([
      loadRpgProfile(supabase, user.id),
      loadIsPro(supabase, user.id),
    ]);
    const limits = limitsFor(isPro);

    // Scenes unlock in order — you cannot jump to the park before the airport.
    const prerequisite = prerequisiteOf(scene.id);
    if (prerequisite) {
      const { data: prev } = await supabase
        .from("rpg_scene_progress")
        .select("completed_at")
        .eq("user_id", user.id)
        .eq("scene_id", prerequisite)
        .maybeSingle();
      if (!(prev as any)?.completed_at) {
        return NextResponse.json(
          { error: "Bu sahna hali ochilmagan — avvalgisini tugatib keling." },
          { status: 403 }
        );
      }
    }

    // Reuse an already-open session for this scene instead of burning another
    // day-allowance slot when the player reloads the page mid-conversation.
    const { data: open } = await supabase
      .from("rpg_sessions")
      .select("id, level, state_json, turn_count, hints_used")
      .eq("user_id", user.id)
      .eq("scene_id", scene.id)
      .eq("status", "active")
      .order("started_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    const level = clampLevel(profile.level, limits.maxLevel);

    if (open) {
      const state = (open as any).state_json || emptyState(scene.id, scene.npc_id, level, profile.hero_name || "");
      return NextResponse.json({
        session_id: (open as any).id,
        resumed: true,
        level: (open as any).level,
        input_mode: inputModeFor((open as any).level),
        show_translation: showsTranslation((open as any).level),
        scene: sceneView(scene),
        objectives: objectiveViews(scene, state.completed_objectives || []),
        transcript: state.transcript || [],
        turn: (open as any).turn_count || 0,
        max_turns: scene.max_turns,
        npc: { id: npc.id, name: npc.name, role_uz: npc.role_uz, avatar: npc.avatar },
      });
    }

    // Count the scene BEFORE doing any work, atomically, so two tabs cannot
    // both spend the last free slot.
    const usage = await bumpUsage(supabase, day, 0, 1);
    if (usage && usage.scenes_started > limits.scenesPerDay) {
      // Give the slot back — the scene never started.
      await bumpUsage(supabase, day, 0, -1).catch(() => null);
      return limitReached("scenes");
    }

    const state = emptyState(scene.id, scene.npc_id, level, profile.hero_name || "");
    state.transcript.push({ role: "npc", text: scene.opening_line, emotion: "neutral" });

    const { data: created, error } = await supabase
      .from("rpg_sessions")
      .insert({
        user_id: user.id,
        scene_id: scene.id,
        level,
        state_json: state,
        turn_count: 0,
        hints_used: 0,
        status: "active",
      })
      .select("id")
      .single();

    if (error || !created) {
      await bumpUsage(supabase, day, 0, -1).catch(() => null);
      throw error || new Error("session insert failed");
    }

    await supabase
      .from("rpg_scene_progress")
      .upsert(
        {
          user_id: user.id,
          scene_id: scene.id,
          attempts: ((await attemptsSoFar(supabase, user.id, scene.id)) ?? 0) + 1,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "user_id,scene_id" }
      );

    return NextResponse.json({
      session_id: (created as any).id,
      resumed: false,
      level,
      input_mode: inputModeFor(level),
      show_translation: showsTranslation(level),
      scene: sceneView(scene),
      objectives: objectiveViews(scene, []),
      transcript: state.transcript,
      turn: 0,
      max_turns: scene.max_turns,
      npc: { id: npc.id, name: npc.name, role_uz: npc.role_uz, avatar: npc.avatar },
    });
  } catch (error) {
    console.error("rpg/session/start error:", error);
    return NextResponse.json(
      { error: "Sahnani boshlab bo'lmadi. Keyinroq urinib ko'ring." },
      { status: 500 }
    );
  }
}

async function attemptsSoFar(supabase: any, userId: string, sceneId: string): Promise<number> {
  const { data } = await supabase
    .from("rpg_scene_progress")
    .select("attempts")
    .eq("user_id", userId)
    .eq("scene_id", sceneId)
    .maybeSingle();
  return data?.attempts ?? 0;
}

function sceneView(scene: ReturnType<typeof getScene>) {
  if (!scene) return null;
  return {
    id: scene.id,
    title_uz: scene.title_uz,
    intro_uz: scene.intro_uz,
    image: scene.image,
  };
}

function objectiveViews(
  scene: NonNullable<ReturnType<typeof getScene>>,
  done: string[]
): ObjectiveView[] {
  const set = new Set(done);
  return scene.objectives.map((o) => ({
    id: o.id,
    title_uz: o.title_uz,
    required: o.required,
    done: set.has(o.id),
  }));
}
