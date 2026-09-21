import { NextRequest, NextResponse } from "next/server";

import { getAuth } from "@/lib/supabaseServer";
import { rateLimit } from "@/lib/rateLimit";
import { getScene } from "@/lib/rpg/scenes";
import { loadSession } from "@/lib/rpg/db";
import { clampLevel, hintsAllowed } from "@/lib/rpg/levels";
import type { SessionState } from "@/lib/rpg/types";

export const dynamic = "force-dynamic";

/**
 * A hint: the opening of a sentence that would move the scene forward, plus the
 * Uzbek meaning. Built from the scene's own data rather than an AI call, so it
 * is instant, free and can never wander off-script.
 *
 * Every hint costs score, which is why hints_used is counted server-side.
 */
export async function POST(req: NextRequest) {
  try {
    const { supabase, user } = await getAuth(req);
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    if (rateLimit(`rpg-hint:${user.id}`, 40, 10 * 60_000)) {
      return NextResponse.json({ error: "Juda ko'p so'rov." }, { status: 429 });
    }

    const body = await req.json().catch(() => ({}));
    const session = await loadSession(supabase, user.id, body?.session_id);
    if (!session) return NextResponse.json({ error: "Sessiya topilmadi." }, { status: 404 });
    if (session.status !== "active") {
      return NextResponse.json({ error: "Bu sahna tugagan." }, { status: 409 });
    }

    const scene = getScene(session.scene_id);
    if (!scene) return NextResponse.json({ error: "Sahna topilmadi." }, { status: 404 });

    const level = clampLevel(session.level);
    if (!hintsAllowed(level)) {
      return NextResponse.json(
        { error: "Bu darajada yordam berilmaydi — o'zingiz urinib ko'ring." },
        { status: 403 }
      );
    }

    const state = (session.state_json || {}) as SessionState;
    const done = new Set(Array.isArray(state.completed_objectives) ? state.completed_objectives : []);

    // Aim the hint at the next thing that actually needs doing: required goals
    // first, then optional ones.
    const next =
      scene.objectives.find((o) => o.required && !done.has(o.id)) ||
      scene.objectives.find((o) => !done.has(o.id));

    if (!next) {
      return NextResponse.json({
        hint: "Hammasi bajarildi — suhbatni chiroyli yakunlang.",
        starter: "Thank you, that's everything.",
        charged: false,
      });
    }

    // The first keyword is the most natural one to build a sentence around.
    const keyword = next.requires_keywords_any[0];
    const starter = starterFor(next.id, keyword);

    const hintsUsed = session.hints_used + 1;
    const { error } = await supabase
      .from("rpg_sessions")
      .update({ hints_used: hintsUsed })
      .eq("id", session.id)
      .eq("user_id", user.id);
    if (error) throw error;

    return NextResponse.json({
      hint: `${next.title_uz} — shu gapdan boshlab ko'ring:`,
      starter,
      objective_id: next.id,
      hints_used: hintsUsed,
      charged: true,
    });
  } catch (error) {
    console.error("rpg/session/hint error:", error);
    return NextResponse.json({ error: "Yordam berib bo'lmadi." }, { status: 500 });
  }
}

/**
 * A natural sentence opening for a goal. Generic by design: it nudges the
 * player into the right structure without writing their answer for them.
 */
function starterFor(objectiveId: string, keyword: string): string {
  if (/ask|price|wifi|breakfast|location/.test(objectiveId)) {
    return `Could you tell me ${keyword.includes("how much") ? "how much it is" : `about the ${keyword}`}...`;
  }
  if (/pay/.test(objectiveId)) return "Can I pay by...";
  if (/introduce|name/.test(objectiveId)) return "My name is...";
  if (/purpose/.test(objectiveId)) return "I'm here as a...";
  if (/duration/.test(objectiveId)) return "I'm staying for...";
  if (/address|staying/.test(objectiveId)) return "I'm staying at...";
  if (/hobby/.test(objectiveId)) return "In my free time I like...";
  if (/meeting/.test(objectiveId)) return "Would you like to...";
  if (/order/.test(objectiveId)) return `I'd like a ${keyword}, please...`;
  return `I would like to ask about the ${keyword}...`;
}
