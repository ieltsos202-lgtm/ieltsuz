import { NextRequest, NextResponse } from "next/server";
import { parseJSONFromText, generateWithFallback, LIVE_MODEL_CHAIN } from "@/lib/gemini";
import { getAuth } from "@/lib/supabaseServer";
import { loadSpeakingMemory, saveSpeakingMemory } from "@/lib/speakingMemory";

const MODEL = process.env.PARTNER_MODEL || "gemini-3.6-flash";
const MODELS = [MODEL, ...LIVE_MODEL_CHAIN.filter((m) => m !== MODEL)];

interface Turn {
  role: "user" | "partner";
  text: string;
}

/**
 * Called when a live session ends. Consolidates the conversation into the
 * learner's long-term memory (portrait, level, weak points, topics).
 */
export async function POST(req: NextRequest) {
  try {
    const { supabase, user } = await getAuth(req);
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const body = await req.json().catch(() => ({}));
    const turns: Turn[] = Array.isArray(body?.turns) ? body.turns.slice(-60) : [];
    const userTurns = turns.filter((t) => t.role === "user" && t.text?.trim());
    const memory = await loadSpeakingMemory(supabase, user.id);

    // Remember how this session opened so the next greeting is different.
    const firstPartner = turns.find((t) => t.role === "partner" && t.text?.trim())?.text?.trim();
    const recentGreetings = memory.recent_greetings.slice();
    if (
      firstPartner &&
      !recentGreetings.some((g) => g.trim().toLowerCase() === firstPartner.toLowerCase())
    ) {
      recentGreetings.push(firstPartner.slice(0, 300));
    }
    const greetingUpdate = { recent_greetings: recentGreetings.slice(-8) };

    if (userTurns.length === 0) {
      await saveSpeakingMemory(supabase, user.id, {
        sessions: memory.sessions + 1,
        last_session_at: new Date().toISOString(),
        ...greetingUpdate,
      });
      return NextResponse.json({ ok: true });
    }

    const transcript = turns
      .map((t) => `${t.role === "user" ? "Learner" : "Mentor"}: ${t.text}`)
      .join("\n");

    const prompt = `You maintain the long-term memory of an AI English mentor about ONE learner (an IELTS student from Uzbekistan). Merge the previous memory with today's conversation.

PREVIOUS MEMORY:
- Portrait: ${memory.summary || "(none)"}
- Level estimate: ${memory.level_estimate || "(unknown)"}
- Facts: ${memory.facts.join("; ") || "(none)"}
- Weak points: ${memory.weak_points.join("; ") || "(none)"}
- Topics: ${memory.topics.join(", ") || "(none)"}

TODAY'S CONVERSATION:
${transcript}

Return ONLY JSON:
{
  "summary": "2-4 sentences: who they are, personality, motivation, how they speak English, what to push next time",
  "level_estimate": "IELTS band range like '5.5-6.0'",
  "facts": ["up to 20 short personal facts (merged, deduped, most useful first)"],
  "weak_points": ["up to 15 recurring mistake patterns, most frequent first, format 'wrong -> right' or short description"],
  "topics": ["up to 15 topics already discussed (merged)"]
}`;

    // Best-effort: on total failure the existing memory is kept untouched
    // rather than overwritten with blanks (see the ?? fallbacks below).
    let parsed: any = {};
    try {
      const raw = await generateWithFallback([{ text: prompt }], {
        models: MODELS,
        config: {
          maxOutputTokens: 900,
          temperature: 0.4,
          thinkingConfig: { thinkingBudget: 0 },
        },
        validate: (t) => {
          parseJSONFromText(t);
        },
      });
      parsed = parseJSONFromText(raw);
    } catch (e) {
      console.warn("Speaking memory consolidation failed:", e);
      parsed = {};
    }

    const list = (v: unknown, max: number) =>
      Array.isArray(v)
        ? v.filter((x) => typeof x === "string" && x.trim()).map((x) => String(x).slice(0, 140)).slice(0, max)
        : undefined;

    await saveSpeakingMemory(supabase, user.id, {
      summary: typeof parsed.summary === "string" ? parsed.summary.slice(0, 800) : memory.summary,
      level_estimate:
        typeof parsed.level_estimate === "string" ? parsed.level_estimate.slice(0, 20) : memory.level_estimate,
      facts: list(parsed.facts, 20) ?? memory.facts,
      weak_points: list(parsed.weak_points, 15) ?? memory.weak_points,
      topics: list(parsed.topics, 15) ?? memory.topics,
      sessions: memory.sessions + 1,
      last_session_at: new Date().toISOString(),
      ...greetingUpdate,
    });

    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error("memory update error:", e);
    return NextResponse.json({ error: "Memory update failed" }, { status: 500 });
  }
}
