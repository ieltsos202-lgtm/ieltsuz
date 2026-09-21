-- "New City" story RPG — per-player state for the English-through-conversation
-- game. Run this in the Supabase SQL editor.
--
-- Design notes:
--  * The server owns every number in here. Nothing is ever written from a
--    value the AI or the browser claimed; see lib/rpg/validate.ts.
--  * RLS is "own rows only" on every table, so one user can never read or
--    mutate another user's session even if they guess a session id.
--  * Scene content itself is NOT in the database — it lives in
--    data/rpg/scenes/*.json so it can be edited and reviewed like code.

-- ---------------------------------------------------------------- profile ----
CREATE TABLE IF NOT EXISTS rpg_profile (
  user_id UUID PRIMARY KEY REFERENCES profiles(id) ON DELETE CASCADE,
  hero_name TEXT,
  level INTEGER NOT NULL DEFAULT 1 CHECK (level BETWEEN 1 AND 5),
  xp INTEGER NOT NULL DEFAULT 0 CHECK (xp >= 0),
  streak INTEGER NOT NULL DEFAULT 0 CHECK (streak >= 0),
  -- The player's OWN local date (YYYY-MM-DD), not a server timestamp: the
  -- streak must flip at the player's midnight, not at UTC midnight.
  last_played_date TEXT,
  -- Last few scene scores, newest last. The auto-difficulty rule needs the
  -- last 3, and keeping them here avoids a second query on every finish.
  recent_scores JSONB NOT NULL DEFAULT '[]',
  badges JSONB NOT NULL DEFAULT '[]',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE rpg_profile ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "own rpg profile" ON rpg_profile;
CREATE POLICY "own rpg profile" ON rpg_profile FOR ALL
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- ------------------------------------------------------------------ words ----
-- One row per (player, word). Spaced repetition state.
CREATE TABLE IF NOT EXISTS rpg_words (
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  word TEXT NOT NULL,
  uz TEXT,                                  -- Uzbek gloss shown on the card
  stage INTEGER NOT NULL DEFAULT 0 CHECK (stage BETWEEN 0 AND 5),
  strength INTEGER NOT NULL DEFAULT 20 CHECK (strength BETWEEN 0 AND 100),
  next_review_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  seen_count INTEGER NOT NULL DEFAULT 0,
  lapses INTEGER NOT NULL DEFAULT 0,
  first_scene_id TEXT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (user_id, word)
);

-- The "due words" query (review mode + recommended scenes) filters by user and
-- orders by due date, so index exactly that.
CREATE INDEX IF NOT EXISTS rpg_words_due_idx ON rpg_words (user_id, next_review_at);

ALTER TABLE rpg_words ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "own rpg words" ON rpg_words;
CREATE POLICY "own rpg words" ON rpg_words FOR ALL
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- --------------------------------------------------------- scene progress ----
CREATE TABLE IF NOT EXISTS rpg_scene_progress (
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  scene_id TEXT NOT NULL,
  best_score INTEGER NOT NULL DEFAULT 0 CHECK (best_score BETWEEN 0 AND 100),
  attempts INTEGER NOT NULL DEFAULT 0,
  completed_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (user_id, scene_id)
);

ALTER TABLE rpg_scene_progress ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "own rpg scene progress" ON rpg_scene_progress;
CREATE POLICY "own rpg scene progress" ON rpg_scene_progress FOR ALL
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- --------------------------------------------------------------- sessions ----
-- One row per attempt at a scene. state_json holds the authoritative game
-- state (transcript, completed objectives, per-word outcomes) — the browser
-- gets a rendered view of it, never the right to write it.
CREATE TABLE IF NOT EXISTS rpg_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  scene_id TEXT NOT NULL,
  level INTEGER NOT NULL CHECK (level BETWEEN 1 AND 5),
  state_json JSONB NOT NULL DEFAULT '{}',
  turn_count INTEGER NOT NULL DEFAULT 0,
  hints_used INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'finished', 'abandoned')),
  started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  finished_at TIMESTAMPTZ
);

-- Resuming / "do I already have an open session?" lookups.
CREATE INDEX IF NOT EXISTS rpg_sessions_user_status_idx
  ON rpg_sessions (user_id, status, started_at DESC);

ALTER TABLE rpg_sessions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "own rpg sessions" ON rpg_sessions;
CREATE POLICY "own rpg sessions" ON rpg_sessions FOR ALL
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- ------------------------------------------------------------- npc memory ----
-- Up to 3 short, sanitized facts per NPC + a relationship score, so a
-- character can greet a returning player by name.
CREATE TABLE IF NOT EXISTS rpg_npc_memory (
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  npc_id TEXT NOT NULL,
  memory_json JSONB NOT NULL DEFAULT '[]',
  relationship INTEGER NOT NULL DEFAULT 0 CHECK (relationship BETWEEN 0 AND 100),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (user_id, npc_id)
);

ALTER TABLE rpg_npc_memory ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "own rpg npc memory" ON rpg_npc_memory;
CREATE POLICY "own rpg npc memory" ON rpg_npc_memory FOR ALL
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- ------------------------------------------------------------------ usage ----
-- Daily counters for the free/Pro limits. `day` is the player's LOCAL date so
-- the allowance resets at their midnight.
CREATE TABLE IF NOT EXISTS rpg_usage (
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  day TEXT NOT NULL,
  ai_turns INTEGER NOT NULL DEFAULT 0,
  scenes_started INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (user_id, day)
);

ALTER TABLE rpg_usage ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "own rpg usage" ON rpg_usage;
CREATE POLICY "own rpg usage" ON rpg_usage FOR ALL
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- Atomic daily counter bump. Doing this as an RPC keeps the limit honest when
-- two tabs start a scene at the same instant: a read-then-write would let both
-- through on the last allowance.
CREATE OR REPLACE FUNCTION rpg_bump_usage(
  p_day TEXT,
  p_ai_turns INTEGER DEFAULT 0,
  p_scenes INTEGER DEFAULT 0
)
RETURNS TABLE (ai_turns INTEGER, scenes_started INTEGER)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Negative deltas are legitimate: the API charges a scene/turn BEFORE doing
  -- the work and refunds it if a limit check then rejects the request. So the
  -- RESULT is clamped at zero, not the input.
  INSERT INTO rpg_usage (user_id, day, ai_turns, scenes_started)
  VALUES (auth.uid(), p_day, GREATEST(p_ai_turns, 0), GREATEST(p_scenes, 0))
  ON CONFLICT (user_id, day) DO UPDATE
    SET ai_turns = GREATEST(rpg_usage.ai_turns + p_ai_turns, 0),
        scenes_started = GREATEST(rpg_usage.scenes_started + p_scenes, 0)
  RETURNING rpg_usage.ai_turns, rpg_usage.scenes_started
  INTO ai_turns, scenes_started;

  RETURN NEXT;
END;
$$;

REVOKE ALL ON FUNCTION rpg_bump_usage(TEXT, INTEGER, INTEGER) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION rpg_bump_usage(TEXT, INTEGER, INTEGER) TO authenticated;
