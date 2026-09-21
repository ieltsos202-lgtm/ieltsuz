import { NextRequest, NextResponse } from "next/server";

import { getAuth } from "@/lib/supabaseServer";
import { rateLimit } from "@/lib/rateLimit";
import { RPG_RULES } from "@/lib/rpg/config";
import { getNpc, getScene } from "@/lib/rpg/scenes";
import {
  bumpUsage,
  limitReached,
  limitsFor,
  loadIsPro,
  loadNpcMemory,
  loadSession,
  localDay,
} from "@/lib/rpg/db";
import { clampLevel, showsTranslation } from "@/lib/rpg/levels";
import { buildNpcPrompt, fallbackLine } from "@/lib/rpg/prompt";
import { containsBlocked, sanitizePlayerMessage } from "@/lib/rpg/safety";
import { generateNpcTurn } from "@/lib/rpg/ai";
import { requiredComplete, verifyObjectives, verifyWords } from "@/lib/rpg/validate";
import type { ObjectiveView, SessionState, TargetWord, TurnResponse } from "@/lib/rpg/types";

export const dynamic = "force-dynamic";

/**
 * One conversational turn.
 *
 * Order of operations matters: the player's message is sanitised and the daily
 * budget is charged BEFORE the model is called, and every claim the model makes
 * is verified against the player's actual words AFTER it returns.
 */
export async function POST(req: NextRequest) {
  try {
    const { supabase, user } = await getAuth(req);
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    // Independent of the daily budget: stops a script hammering the endpoint.
    if (rateLimit(`rpg-turn:${user.id}`, RPG_RULES.turnRateLimit.limit, RPG_RULES.turnRateLimit.windowMs)) {
      return NextResponse.json(
        { error: "Sekinroq! Bir daqiqadan keyin davom eting." },
        { status: 429 }
      );
    }

    const body = await req.json().catch(() => ({}));

    // RLS + the explicit user filter mean another user's session id is simply
    // not found here.
    const session = await loadSession(supabase, user.id, body?.session_id);
    if (!session) return NextResponse.json({ error: "Sessiya topilmadi." }, { status: 404 });
    if (session.status !== "active") {
      return NextResponse.json({ error: "Bu sahna allaqachon tugagan." }, { status: 409 });
    }

    const scene = getScene(session.scene_id);
    const npc = scene ? getNpc(scene.npc_id) : null;
    if (!scene || !npc) return NextResponse.json({ error: "Sahna topilmadi." }, { status: 404 });

    const state: SessionState = normalizeState(session.state_json, session);
    const level = clampLevel(session.level);

    // ------------------------------------------------ the player's message ----
    const playerMessage = resolvePlayerMessage(body, level);
    if (!playerMessage) {
      return NextResponse.json({ error: "Javob bo'sh — biror narsa yozing." }, { status: 400 });
    }
    if (containsBlocked(playerMessage)) {
      return NextResponse.json(
        { error: "Iltimos, muloyim so'zlardan foydalaning." },
        { status: 400 }
      );
    }

    // ------------------------------------------------------- turn budgeting ----
    if (session.turn_count >= scene.max_turns) {
      return NextResponse.json(
        { error: "Suhbat uchun berilgan navbatlar tugadi. Natijani ko'ring.", scene_over: true },
        { status: 409 }
      );
    }

    const day = localDay(body?.day);
    const isPro = await loadIsPro(supabase, user.id);
    const limits = limitsFor(isPro);
    const usage = await bumpUsage(supabase, day, 1, 0);
    if (usage && usage.ai_turns > limits.aiTurnsPerDay) {
      await bumpUsage(supabase, day, -1, 0).catch(() => null);
      return limitReached("turns");
    }

    // ------------------------------------------------------------ the model ----
    const [{ facts }, knownWords] = await Promise.all([
      loadNpcMemory(supabase, user.id, npc.id),
      loadKnownWords(supabase, user.id),
    ]);

    const prompt = buildNpcPrompt({
      scene,
      npc,
      level,
      heroName: state.hero_name,
      npcMemory: facts,
      knownWords,
      state,
      playerMessage,
    });

    const { turn: ai, error: aiError } = await generateNpcTurn(prompt, level);

    // ------------------------------------------------ record the player turn ----
    state.transcript.push({ role: "player", text: playerMessage });
    state.player_turns += 1;

    let npcText: string;
    let npcUz = "";
    let emotion: TurnResponse["emotion"] = "neutral";
    let newlyCompleted: string[] = [];
    const newWords: TargetWord[] = [];
    let usedFallback = false;

    if (ai) {
      npcText = ai.npc_reply;
      npcUz = ai.npc_reply_uz;
      emotion = ai.emotion;

      // An answer with no flagged mistake counts towards accuracy.
      if (!ai.player_errors.length) state.clean_answers += 1;
      for (const err of ai.player_errors) {
        if (state.errors.length < 12) state.errors.push(err);
      }

      // The model only SUGGESTS completions; the player's own words decide.
      newlyCompleted = verifyObjectives(ai.objectives_hit, scene, state, playerMessage);
      state.completed_objectives.push(...newlyCompleted);

      // Words are credited from the actual text, not from the model's claim.
      const { introduced, usedByPlayer } = verifyWords(scene, npcText, playerMessage);
      for (const word of introduced) {
        if (!state.words_introduced.includes(word)) {
          state.words_introduced.push(word);
          const target = scene.target_words.find((t) => t.word.toLowerCase() === word);
          if (target) newWords.push(target);
        }
      }
      // Anything the player produced that the model did NOT flag as an error is
      // treated as correct use; a flagged word is recorded as a mistake.
      const wrong = new Set(
        ai.player_errors
          .flatMap((e) => e.original.toLowerCase().split(/[^a-z']+/))
          .filter(Boolean)
      );
      for (const word of usedByPlayer) {
        const previous = state.word_outcomes[word];
        if (wrong.has(word)) {
          state.word_outcomes[word] = "used_wrongly";
        } else if (previous !== "used_wrongly") {
          state.word_outcomes[word] = "used_correctly";
        }
      }
    } else {
      // Two failed generations: keep the scene alive with a scripted line.
      usedFallback = true;
      state.ai_failures += 1;
      npcText = fallbackLine(scene, session.turn_count);
      npcUz = "";
      console.error("rpg turn fallback used:", (aiError || "unknown").slice(0, 120));
    }

    state.transcript.push({ role: "npc", text: npcText, uz: npcUz || undefined, emotion });
    // Keep the stored transcript bounded — the prompt only reads the tail
    // anyway, and the finish screen needs the mistakes, not every line.
    if (state.transcript.length > 60) state.transcript = state.transcript.slice(-60);

    const turnCount = session.turn_count + 1;

    // The server decides when the scene is over. `scene_should_end` is a hint.
    const sceneOver = requiredComplete(scene, state) || turnCount >= scene.max_turns;

    const { error: saveError } = await supabase
      .from("rpg_sessions")
      .update({ state_json: state, turn_count: turnCount })
      .eq("id", session.id)
      .eq("user_id", user.id);
    if (saveError) throw saveError;

    const response: TurnResponse = {
      npc_reply: npcText,
      npc_reply_uz: showsTranslation(level) ? npcUz || null : null,
      emotion,
      objectives: objectiveViews(scene, state.completed_objectives),
      newly_completed: newlyCompleted,
      new_words: newWords,
      suggested_replies: level === 1 && ai ? ai.suggested_replies : null,
      sentence_builder: level === 2 && ai ? ai.sentence_builder : null,
      turn: turnCount,
      max_turns: scene.max_turns,
      scene_over: sceneOver,
      fallback: usedFallback,
    };

    return NextResponse.json(response);
  } catch (error) {
    console.error("rpg/session/turn error:", error);
    return NextResponse.json(
      { error: "Javob olinmadi. Bir ozdan keyin qayta yuboring." },
      { status: 500 }
    );
  }
}

/**
 * Turn whatever the level-specific input sent into one plain sentence.
 * Levels 1 and 2 post structured input; level 3+ posts free text. All of it is
 * sanitised the same way, because all of it ends up in a prompt.
 */
function resolvePlayerMessage(body: any, level: number): string {
  if (level === 2 && Array.isArray(body?.tiles)) {
    const sentence = body.tiles
      .map((t: unknown) => (typeof t === "string" ? t : ""))
      .filter(Boolean)
      .slice(0, 14)
      .join(" ");
    return sanitizePlayerMessage(sentence, RPG_RULES.maxPlayerMessage);
  }
  // Level 1 sends the chosen option's text; trusting an index would mean
  // trusting the client to remember what the server offered.
  return sanitizePlayerMessage(body?.message, RPG_RULES.maxPlayerMessage);
}

/** A sample of words the player already knows, so the NPC stops re-teaching them. */
async function loadKnownWords(supabase: any, userId: string): Promise<string[]> {
  const { data } = await supabase
    .from("rpg_words")
    .select("word")
    .eq("user_id", userId)
    .gte("strength", 60)
    .limit(25);
  return (data || []).map((r: any) => String(r.word));
}

/** Defensive: an old or truncated state_json must not crash the turn. */
function normalizeState(raw: any, session: { scene_id: string; level: number }): SessionState {
  return {
    scene_id: raw?.scene_id || session.scene_id,
    npc_id: raw?.npc_id || "",
    level: clampLevel(raw?.level ?? session.level),
    hero_name: typeof raw?.hero_name === "string" ? raw.hero_name : "",
    transcript: Array.isArray(raw?.transcript) ? raw.transcript : [],
    completed_objectives: Array.isArray(raw?.completed_objectives) ? raw.completed_objectives : [],
    words_introduced: Array.isArray(raw?.words_introduced) ? raw.words_introduced : [],
    word_outcomes: raw?.word_outcomes && typeof raw.word_outcomes === "object" ? raw.word_outcomes : {},
    errors: Array.isArray(raw?.errors) ? raw.errors : [],
    clean_answers: Number(raw?.clean_answers) || 0,
    player_turns: Number(raw?.player_turns) || 0,
    ai_failures: Number(raw?.ai_failures) || 0,
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
