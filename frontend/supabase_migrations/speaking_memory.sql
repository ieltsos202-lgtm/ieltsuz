-- AI Speaking Examiner long-term memory: what the examiner remembers about
-- each learner across sessions (facts, weak points, topics, level, greetings).
-- Run this in the Supabase SQL editor.

CREATE TABLE IF NOT EXISTS speaking_memory (
  user_id UUID REFERENCES profiles(id) ON DELETE CASCADE PRIMARY KEY,
  summary TEXT DEFAULT '',                -- 2-4 sentence portrait of the learner
  facts JSONB DEFAULT '[]',               -- ["studies at TUIT", "loves football", ...]
  weak_points JSONB DEFAULT '[]',         -- ["drops articles", "he go -> he goes", ...]
  topics JSONB DEFAULT '[]',              -- recent topics discussed
  level_estimate TEXT DEFAULT '',         -- e.g. "5.5-6.0"
  sessions INTEGER DEFAULT 0,
  recent_greetings JSONB DEFAULT '[]',    -- last greetings so we never repeat
  last_session_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE speaking_memory ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users see own speaking memory" ON speaking_memory;
CREATE POLICY "Users see own speaking memory" ON speaking_memory FOR ALL USING (auth.uid() = user_id);
