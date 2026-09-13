import type { SupabaseClient } from "@supabase/supabase-js";

export interface SpeakingMemory {
  summary: string;
  facts: string[];
  weak_points: string[];
  topics: string[];
  level_estimate: string;
  sessions: number;
  recent_greetings: string[];
  last_session_at: string | null;
}

export const EMPTY_MEMORY: SpeakingMemory = {
  summary: "",
  facts: [],
  weak_points: [],
  topics: [],
  level_estimate: "",
  sessions: 0,
  recent_greetings: [],
  last_session_at: null,
};

const arr = (v: unknown): string[] =>
  Array.isArray(v) ? v.filter((x) => typeof x === "string").slice(0, 40) : [];

export async function loadSpeakingMemory(
  supabase: SupabaseClient,
  userId: string
): Promise<SpeakingMemory> {
  try {
    const { data } = await (supabase as any)
      .from("speaking_memory")
      .select("*")
      .eq("user_id", userId)
      .maybeSingle();
    if (!data) return EMPTY_MEMORY;
    return {
      summary: typeof data.summary === "string" ? data.summary : "",
      facts: arr(data.facts),
      weak_points: arr(data.weak_points),
      topics: arr(data.topics),
      level_estimate: typeof data.level_estimate === "string" ? data.level_estimate : "",
      sessions: Number(data.sessions) || 0,
      recent_greetings: arr(data.recent_greetings),
      last_session_at: data.last_session_at ?? null,
    };
  } catch {
    return EMPTY_MEMORY;
  }
}

export async function saveSpeakingMemory(
  supabase: SupabaseClient,
  userId: string,
  memory: Partial<SpeakingMemory>
): Promise<void> {
  try {
    await (supabase as any)
      .from("speaking_memory")
      .upsert(
        { user_id: userId, ...memory, updated_at: new Date().toISOString() },
        { onConflict: "user_id" }
      );
  } catch (e) {
    console.error("speaking_memory save failed:", e);
  }
}

function uniqPush(list: string[], items: string[], max: number): string[] {
  const out = [...list];
  for (const it of items) {
    const t = it.trim();
    if (!t) continue;
    if (out.some((x) => x.toLowerCase() === t.toLowerCase())) continue;
    out.push(t);
  }
  return out.slice(-max);
}

/** Append small facts / weak points learned mid-conversation. */
export async function appendSpeakingMemory(
  supabase: SupabaseClient,
  userId: string,
  memory: SpeakingMemory,
  delta: { facts?: string[]; weak_points?: string[]; topics?: string[] }
): Promise<void> {
  const next = {
    facts: uniqPush(memory.facts, delta.facts || [], 30),
    weak_points: uniqPush(memory.weak_points, delta.weak_points || [], 25),
    topics: uniqPush(memory.topics, delta.topics || [], 20),
  };
  await saveSpeakingMemory(supabase, userId, next);
}

export function describeMemory(m: SpeakingMemory, userName: string): string {
  if (m.sessions === 0 && !m.summary && m.facts.length === 0) {
    return `This is your FIRST ever conversation with ${userName || "this learner"}. You know nothing about them yet — get to know them.`;
  }
  const days =
    m.last_session_at ? Math.round((Date.now() - new Date(m.last_session_at).getTime()) / 86400000) : null;
  return [
    `You have talked with ${userName || "this learner"} ${m.sessions} time(s) before.${
      days !== null ? ` Last session was ${days === 0 ? "today" : days + " day(s) ago"}.` : ""
    }`,
    m.summary ? `Portrait: ${m.summary}` : "",
    m.level_estimate ? `Estimated level: ${m.level_estimate}` : "",
    m.facts.length ? `Things you remember about them: ${m.facts.slice(-15).join("; ")}` : "",
    m.weak_points.length
      ? `Their recurring mistakes (attack these!): ${m.weak_points.slice(-12).join("; ")}`
      : "",
    m.topics.length ? `Topics already covered (pick something NEW): ${m.topics.slice(-10).join(", ")}` : "",
  ]
    .filter(Boolean)
    .join("\n");
}
