// Shared server-side data access for the RPG routes: profile, daily usage
// limits, sessions and NPC memory. Every query runs through the request-scoped
// Supabase client, so RLS ("own rows only") is the real authorisation layer and
// a guessed session id still cannot be read.

import type { SupabaseClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";

import { isProActive } from "@/lib/pro";
import { MAX_LEVEL_MVP, RPG_LIMITS, RPG_RULES } from "./config";
import { clampLevel } from "./levels";
import { sanitizeFact } from "./safety";
import type { RpgLevel, SessionState } from "./types";

export interface RpgProfileRow {
  user_id: string;
  hero_name: string | null;
  level: number;
  xp: number;
  streak: number;
  last_played_date: string | null;
  recent_scores: number[];
  badges: string[];
}

/** Read the RPG profile, creating the default row on first visit. */
export async function loadRpgProfile(
  supabase: SupabaseClient,
  userId: string
): Promise<RpgProfileRow> {
  const { data } = await supabase
    .from("rpg_profile")
    .select("user_id, hero_name, level, xp, streak, last_played_date, recent_scores, badges")
    .eq("user_id", userId)
    .maybeSingle();

  if (data) {
    return {
      ...(data as any),
      level: clampLevel((data as any).level),
      recent_scores: Array.isArray((data as any).recent_scores) ? (data as any).recent_scores : [],
      badges: Array.isArray((data as any).badges) ? (data as any).badges : [],
    };
  }

  const fresh = { user_id: userId, level: 1, xp: 0, streak: 0 };
  // Another tab may have inserted it a millisecond ago — upsert, don't fail.
  await supabase.from("rpg_profile").upsert(fresh, { onConflict: "user_id" });
  return {
    user_id: userId,
    hero_name: null,
    level: 1,
    xp: 0,
    streak: 0,
    last_played_date: null,
    recent_scores: [],
    badges: [],
  };
}

/** The player's Pro state, read from the existing profiles table. */
export async function loadIsPro(supabase: SupabaseClient, userId: string): Promise<boolean> {
  const { data } = await supabase
    .from("profiles")
    .select("is_pro, pro_expires_at")
    .eq("id", userId)
    .maybeSingle();
  return isProActive(data as any);
}

export function limitsFor(isPro: boolean) {
  const base = isPro ? RPG_LIMITS.pro : RPG_LIMITS.free;
  return {
    scenesPerDay: base.scenesPerDay,
    aiTurnsPerDay: base.aiTurnsPerDay,
    // Levels 4-5 need voice mode, which is Phase 3 — nobody gets them yet.
    maxLevel: Math.min(base.maxLevel, MAX_LEVEL_MVP) as RpgLevel,
  };
}

/**
 * The player's own calendar day, so the daily allowance and the streak both
 * reset at THEIR midnight. Falls back to Tashkent time when the client sends
 * nothing usable.
 */
export function localDay(raw: unknown): string {
  if (typeof raw === "string" && /^\d{4}-\d{2}-\d{2}$/.test(raw)) {
    const t = Date.parse(`${raw}T00:00:00Z`);
    // Reject dates far outside the plausible window (clock skew or tampering
    // trying to farm a fresh daily allowance).
    if (Number.isFinite(t) && Math.abs(t - Date.now()) < 3 * 86_400_000) return raw;
  }
  return new Date(Date.now() + 5 * 3600_000).toISOString().slice(0, 10);
}

export interface UsageRow {
  ai_turns: number;
  scenes_started: number;
}

export async function loadUsage(
  supabase: SupabaseClient,
  userId: string,
  day: string
): Promise<UsageRow> {
  const { data } = await supabase
    .from("rpg_usage")
    .select("ai_turns, scenes_started")
    .eq("user_id", userId)
    .eq("day", day)
    .maybeSingle();
  return {
    ai_turns: (data as any)?.ai_turns ?? 0,
    scenes_started: (data as any)?.scenes_started ?? 0,
  };
}

/**
 * Atomically add to today's counters and return the new totals. The RPC does
 * the increment inside the database, so two tabs starting a scene at the same
 * moment cannot both slip past the last allowance.
 */
export async function bumpUsage(
  supabase: SupabaseClient,
  day: string,
  aiTurns: number,
  scenes: number
): Promise<UsageRow | null> {
  const { data, error } = await supabase.rpc("rpg_bump_usage", {
    p_day: day,
    p_ai_turns: aiTurns,
    p_scenes: scenes,
  });
  if (error) return null;
  const row = Array.isArray(data) ? data[0] : data;
  return row ? { ai_turns: row.ai_turns ?? 0, scenes_started: row.scenes_started ?? 0 } : null;
}

/** Uzbek 402 for a free player who has run out of today's allowance. */
export function limitReached(kind: "scenes" | "turns"): NextResponse {
  const message =
    kind === "scenes"
      ? "Bugungi bepul sahnalar tugadi. Pro bilan cheksiz o'ynashingiz mumkin."
      : "Bugungi bepul suhbat limiti tugadi. Pro bilan davom eting.";
  return NextResponse.json({ error: message, limit: kind, upgrade: true }, { status: 402 });
}

// ------------------------------------------------------------- npc memory ----

export async function loadNpcMemory(
  supabase: SupabaseClient,
  userId: string,
  npcId: string
): Promise<{ facts: string[]; relationship: number }> {
  const { data } = await supabase
    .from("rpg_npc_memory")
    .select("memory_json, relationship")
    .eq("user_id", userId)
    .eq("npc_id", npcId)
    .maybeSingle();
  const facts = Array.isArray((data as any)?.memory_json) ? (data as any).memory_json : [];
  return {
    facts: facts.filter((f: unknown) => typeof f === "string").slice(0, RPG_RULES.maxNpcFacts),
    relationship: (data as any)?.relationship ?? 0,
  };
}

/**
 * Merge new facts into what this NPC remembers. Facts are sanitised and
 * length-capped here — anything that looks like personal data is dropped, even
 * though the prompt already forbids collecting it.
 */
export async function saveNpcMemory(
  supabase: SupabaseClient,
  userId: string,
  npcId: string,
  newFacts: unknown[],
  relationshipDelta: number
): Promise<void> {
  const existing = await loadNpcMemory(supabase, userId, npcId);
  const cleaned = newFacts
    .map((f) => sanitizeFact(f, RPG_RULES.maxNpcFactChars))
    .filter((f): f is string => !!f);

  // Newest facts win when the list is full.
  const merged: string[] = [];
  for (const fact of [...cleaned, ...existing.facts]) {
    if (merged.length >= RPG_RULES.maxNpcFacts) break;
    if (!merged.some((m) => m.toLowerCase() === fact.toLowerCase())) merged.push(fact);
  }

  await supabase.from("rpg_npc_memory").upsert(
    {
      user_id: userId,
      npc_id: npcId,
      memory_json: merged,
      relationship: Math.max(0, Math.min(100, existing.relationship + relationshipDelta)),
      updated_at: new Date().toISOString(),
    },
    { onConflict: "user_id,npc_id" }
  );
}

// ---------------------------------------------------------------- session ----

export interface SessionRow {
  id: string;
  user_id: string;
  scene_id: string;
  level: number;
  state_json: SessionState;
  turn_count: number;
  hints_used: number;
  status: string;
}

/**
 * Load a session the caller is allowed to touch. RLS already scopes the query,
 * and the explicit user_id filter makes the intent obvious at the call site.
 */
export async function loadSession(
  supabase: SupabaseClient,
  userId: string,
  sessionId: unknown
): Promise<SessionRow | null> {
  if (typeof sessionId !== "string" || !/^[0-9a-f-]{36}$/i.test(sessionId)) return null;
  const { data } = await supabase
    .from("rpg_sessions")
    .select("id, user_id, scene_id, level, state_json, turn_count, hints_used, status")
    .eq("id", sessionId)
    .eq("user_id", userId)
    .maybeSingle();
  if (!data) return null;
  return data as unknown as SessionRow;
}

export function emptyState(
  sceneId: string,
  npcId: string,
  level: RpgLevel,
  heroName: string
): SessionState {
  return {
    scene_id: sceneId,
    npc_id: npcId,
    level,
    hero_name: heroName,
    transcript: [],
    completed_objectives: [],
    words_introduced: [],
    word_outcomes: {},
    errors: [],
    clean_answers: 0,
    player_turns: 0,
    ai_failures: 0,
  };
}
