-- ============================================================
-- IELTS OS — Supabase Database Schema (PART 2: Admin & Content)
-- Run this entire file in the Supabase SQL Editor AFTER schema.sql.
-- ============================================================

-- 1. Admin flag on profiles -----------------------------------
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS is_admin BOOLEAN DEFAULT FALSE;

-- Helper: is the current authenticated user an admin?
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS BOOLEAN AS $$
  SELECT COALESCE(
    (SELECT is_admin FROM public.profiles WHERE id = auth.uid()),
    FALSE
  );
$$ LANGUAGE sql SECURITY DEFINER STABLE;

-- 2. Speaking questions ---------------------------------------
-- `data` holds the full question object so it maps 1:1 to the
-- existing speaking_questions.json structure:
--   Part 1: { topic, questions: [{question, model_answer}] }
--   Part 2: { topic, prompt, bullets: [], model_answer, part3_questions: [{question, model_answer}] }
CREATE TABLE IF NOT EXISTS speaking_questions (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  part INTEGER NOT NULL CHECK (part IN (1, 2, 3)),
  topic TEXT,
  data JSONB NOT NULL,
  order_index INTEGER DEFAULT 0,
  active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 3. Writing prompts ------------------------------------------
CREATE TABLE IF NOT EXISTS writing_prompts (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  task_type TEXT NOT NULL CHECK (task_type IN ('task1', 'task2')),
  prompt TEXT NOT NULL,
  order_index INTEGER DEFAULT 0,
  active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 4. Content mocks (Listening / Reading HTML mock tests) ------
-- The HTML file lives in the `mocks` Storage bucket; html_path is
-- the object path inside that bucket.
CREATE TABLE IF NOT EXISTS content_mocks (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  skill TEXT NOT NULL CHECK (skill IN ('listening', 'reading')),
  title TEXT NOT NULL,
  slug TEXT NOT NULL,
  html_path TEXT,
  order_index INTEGER DEFAULT 0,
  active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(skill, slug)
);

-- 5. Row Level Security ---------------------------------------
ALTER TABLE speaking_questions ENABLE ROW LEVEL SECURITY;
ALTER TABLE writing_prompts ENABLE ROW LEVEL SECURITY;
ALTER TABLE content_mocks ENABLE ROW LEVEL SECURITY;

-- Everyone (incl. anon) can read active content; the backend uses
-- the service-role key which bypasses RLS for writes anyway.
DROP POLICY IF EXISTS "Public reads speaking questions" ON speaking_questions;
CREATE POLICY "Public reads speaking questions" ON speaking_questions FOR SELECT USING (true);

DROP POLICY IF EXISTS "Admins manage speaking questions" ON speaking_questions;
CREATE POLICY "Admins manage speaking questions" ON speaking_questions
  FOR ALL USING (public.is_admin()) WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS "Public reads writing prompts" ON writing_prompts;
CREATE POLICY "Public reads writing prompts" ON writing_prompts FOR SELECT USING (true);

DROP POLICY IF EXISTS "Admins manage writing prompts" ON writing_prompts;
CREATE POLICY "Admins manage writing prompts" ON writing_prompts
  FOR ALL USING (public.is_admin()) WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS "Public reads content mocks" ON content_mocks;
CREATE POLICY "Public reads content mocks" ON content_mocks FOR SELECT USING (true);

DROP POLICY IF EXISTS "Admins manage content mocks" ON content_mocks;
CREATE POLICY "Admins manage content mocks" ON content_mocks
  FOR ALL USING (public.is_admin()) WITH CHECK (public.is_admin());

-- 6. Storage bucket for mock HTML files -----------------------
INSERT INTO storage.buckets (id, name, public)
VALUES ('mocks', 'mocks', true)
ON CONFLICT (id) DO NOTHING;

-- Public can read mock files; admins can write them.
DROP POLICY IF EXISTS "Public reads mock files" ON storage.objects;
CREATE POLICY "Public reads mock files" ON storage.objects
  FOR SELECT USING (bucket_id = 'mocks');

DROP POLICY IF EXISTS "Admins write mock files" ON storage.objects;
CREATE POLICY "Admins write mock files" ON storage.objects
  FOR INSERT WITH CHECK (bucket_id = 'mocks' AND public.is_admin());

DROP POLICY IF EXISTS "Admins update mock files" ON storage.objects;
CREATE POLICY "Admins update mock files" ON storage.objects
  FOR UPDATE USING (bucket_id = 'mocks' AND public.is_admin());

DROP POLICY IF EXISTS "Admins delete mock files" ON storage.objects;
CREATE POLICY "Admins delete mock files" ON storage.objects
  FOR DELETE USING (bucket_id = 'mocks' AND public.is_admin());

-- ============================================================
-- AFTER running this: make yourself an admin by running, e.g.
--   UPDATE profiles SET is_admin = TRUE WHERE email = 'you@example.com';
-- ============================================================
