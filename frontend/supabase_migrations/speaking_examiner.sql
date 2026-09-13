-- AI Speaking Examiner: persona naming + cross-session progress history.
-- Extends the EXISTING /speaking module (does not replace speaking_results).
-- Run this in the Supabase SQL editor.

-- 1. Examiner persona (one per user — the name they gave their AI examiner)
CREATE TABLE IF NOT EXISTS speaking_examiners (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES profiles(id) ON DELETE CASCADE UNIQUE NOT NULL,
  examiner_name TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. Aggregated speaking progress across sessions (fast read, updated after
-- every speaking_results insert in evaluate/route.ts and evaluate-full/route.ts)
CREATE TABLE IF NOT EXISTS speaking_progress (
  user_id UUID REFERENCES profiles(id) ON DELETE CASCADE PRIMARY KEY,
  total_sessions INTEGER DEFAULT 0,
  recurring_errors JSONB DEFAULT '[]',   -- [{ error, correction, count }, ...]
  last_session_at TIMESTAMPTZ,
  band_trend JSONB DEFAULT '[]'          -- [{ date, band_estimate }, ...]
);

ALTER TABLE speaking_examiners ENABLE ROW LEVEL SECURITY;
ALTER TABLE speaking_progress ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users see own speaking examiner" ON speaking_examiners;
CREATE POLICY "Users see own speaking examiner" ON speaking_examiners FOR ALL USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users see own speaking progress" ON speaking_progress;
CREATE POLICY "Users see own speaking progress" ON speaking_progress FOR ALL USING (auth.uid() = user_id);
