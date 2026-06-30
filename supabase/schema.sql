-- ============================================================
-- IELTS OS — Supabase Database Schema (PART 1)
-- Run this entire file in the Supabase SQL Editor.
-- ============================================================

-- 1. Profiles --------------------------------------------------
CREATE TABLE IF NOT EXISTS profiles (
  id UUID REFERENCES auth.users PRIMARY KEY,
  full_name TEXT NOT NULL,
  email TEXT NOT NULL,
  target_band DECIMAL(2,1) DEFAULT 6.0,
  exam_date DATE,
  avatar_url TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Auto-create a profile when a new auth user signs up
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (id, full_name, email, target_band, exam_date, promo_code)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'full_name', split_part(NEW.email, '@', 1)),
    NEW.email,
    COALESCE((NEW.raw_user_meta_data->>'target_band')::DECIMAL, 6.0),
    (NEW.raw_user_meta_data->>'exam_date')::DATE,
    'IELTS-' || LEFT(REPLACE(NEW.id::text, '-', ''), 12)
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- 2. Cambridge test catalog -----------------------------------
CREATE TABLE IF NOT EXISTS cambridge_tests (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  book_number INTEGER NOT NULL,
  test_number INTEGER NOT NULL,
  test_name TEXT NOT NULL,
  listening_pdf_path TEXT,
  reading_pdf_path TEXT,
  writing_pdf_path TEXT,
  audio_section1_path TEXT,
  audio_section2_path TEXT,
  audio_section3_path TEXT,
  audio_section4_path TEXT,
  answer_key JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(book_number, test_number)
);

-- 3. Vocabulary ------------------------------------------------
CREATE TABLE IF NOT EXISTS vocabulary (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
  word TEXT NOT NULL,
  definition TEXT,
  translation TEXT,
  phonetic TEXT,
  example TEXT,
  examples JSONB,
  source TEXT,
  source_test TEXT,
  mastered BOOLEAN DEFAULT FALSE,
  review_count INTEGER DEFAULT 0,
  next_review TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 4. Writing results ------------------------------------------
CREATE TABLE IF NOT EXISTS writing_results (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
  task_type TEXT NOT NULL,
  test_source TEXT,
  question TEXT NOT NULL,
  essay_text TEXT NOT NULL,
  word_count INTEGER,
  band_score DECIMAL(2,1),
  task_achievement DECIMAL(2,1),
  coherence_cohesion DECIMAL(2,1),
  lexical_resource DECIMAL(2,1),
  grammatical_range DECIMAL(2,1),
  feedback TEXT,
  strengths JSONB,
  improvements JSONB,
  sentence_corrections JSONB,
  model_answer TEXT,
  new_vocabulary JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 5. Speaking results -----------------------------------------
CREATE TABLE IF NOT EXISTS speaking_results (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
  part INTEGER NOT NULL,
  test_source TEXT,
  question TEXT NOT NULL,
  transcribed_text TEXT,
  audio_url TEXT,
  band_score DECIMAL(2,1),
  fluency_coherence DECIMAL(2,1),
  lexical_resource DECIMAL(2,1),
  grammatical_range DECIMAL(2,1),
  pronunciation DECIMAL(2,1),
  what_user_said_analysis TEXT,
  what_should_have_said TEXT,
  model_answer TEXT,
  grammar_errors JSONB,
  vocabulary_suggestions JSONB,
  pronunciation_tips JSONB,
  feedback TEXT,
  details JSONB,           -- full-test per-part breakdowns, transcriptions, etc.
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_speaking_results_user_part ON speaking_results(user_id, part, created_at DESC);

-- 6. Listening results ----------------------------------------
CREATE TABLE IF NOT EXISTS listening_results (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
  test_source TEXT NOT NULL,
  cambridge_book INTEGER,
  cambridge_test INTEGER,
  section INTEGER NOT NULL,
  total_questions INTEGER DEFAULT 40,
  correct_count INTEGER,
  band_score DECIMAL(2,1),
  user_answers JSONB,
  correct_answers JSONB,
  wrong_analysis JSONB,
  weak_areas TEXT[],
  feedback TEXT,
  improvement_tips JSONB,
  time_taken_seconds INTEGER,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 7. Reading results ------------------------------------------
CREATE TABLE IF NOT EXISTS reading_results (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
  test_source TEXT NOT NULL,
  cambridge_book INTEGER,
  cambridge_test INTEGER,
  passage_number INTEGER,
  total_questions INTEGER DEFAULT 40,
  correct_count INTEGER,
  band_score DECIMAL(2,1),
  user_answers JSONB,
  correct_answers JSONB,
  wrong_analysis JSONB,
  highlighted_words JSONB,
  strategy_tips JSONB,
  feedback TEXT,
  time_taken_seconds INTEGER,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 8. Mock test results ----------------------------------------
CREATE TABLE IF NOT EXISTS mock_test_results (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
  test_source TEXT NOT NULL,
  cambridge_book INTEGER,
  cambridge_test INTEGER,
  listening_band DECIMAL(2,1),
  reading_band DECIMAL(2,1),
  writing_band DECIMAL(2,1),
  speaking_band DECIMAL(2,1),
  overall_band DECIMAL(2,1),
  listening_result_id UUID REFERENCES listening_results(id),
  reading_result_id UUID REFERENCES reading_results(id),
  writing_result_id UUID REFERENCES writing_results(id),
  speaking_result_id UUID REFERENCES speaking_results(id),
  duration_minutes INTEGER,
  overall_feedback TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 9. Weekly progress ------------------------------------------
CREATE TABLE IF NOT EXISTS weekly_progress (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
  week_start DATE NOT NULL,
  listening_avg DECIMAL(2,1),
  reading_avg DECIMAL(2,1),
  writing_avg DECIMAL(2,1),
  speaking_avg DECIMAL(2,1),
  overall_avg DECIMAL(2,1),
  tests_completed INTEGER DEFAULT 0,
  UNIQUE(user_id, week_start)
);

-- 10. Row Level Security --------------------------------------
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE vocabulary ENABLE ROW LEVEL SECURITY;
ALTER TABLE writing_results ENABLE ROW LEVEL SECURITY;
ALTER TABLE speaking_results ENABLE ROW LEVEL SECURITY;
ALTER TABLE listening_results ENABLE ROW LEVEL SECURITY;
ALTER TABLE reading_results ENABLE ROW LEVEL SECURITY;
ALTER TABLE mock_test_results ENABLE ROW LEVEL SECURITY;
ALTER TABLE weekly_progress ENABLE ROW LEVEL SECURITY;
ALTER TABLE cambridge_tests ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users see own profile" ON profiles;
CREATE POLICY "Users see own profile" ON profiles FOR ALL USING (auth.uid() = id);

DROP POLICY IF EXISTS "Users see own vocabulary" ON vocabulary;
CREATE POLICY "Users see own vocabulary" ON vocabulary FOR ALL USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users see own writing" ON writing_results;
CREATE POLICY "Users see own writing" ON writing_results FOR ALL USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users see own speaking" ON speaking_results;
CREATE POLICY "Users see own speaking" ON speaking_results FOR ALL USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users see own listening" ON listening_results;
CREATE POLICY "Users see own listening" ON listening_results FOR ALL USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users see own reading" ON reading_results;
CREATE POLICY "Users see own reading" ON reading_results FOR ALL USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users see own mock" ON mock_test_results;
CREATE POLICY "Users see own mock" ON mock_test_results FOR ALL USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users see own progress" ON weekly_progress;
CREATE POLICY "Users see own progress" ON weekly_progress FOR ALL USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Everyone sees cambridge tests" ON cambridge_tests;
CREATE POLICY "Everyone sees cambridge tests" ON cambridge_tests FOR SELECT USING (true);

-- 11. Payments (Payme/Click code-based verification) ----------
CREATE TABLE IF NOT EXISTS payments (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
  payment_code TEXT UNIQUE,
  screenshot_url TEXT,
  amount INTEGER,
  status TEXT DEFAULT 'pending',
  payment_method TEXT,
  screenshot_hash TEXT UNIQUE,
  verified_at TIMESTAMPTZ,
  rejection_reason TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Ensure payment_code column exists on existing tables
ALTER TABLE payments ADD COLUMN IF NOT EXISTS payment_code TEXT UNIQUE;

-- Ensure speaking_results.details exists (full-test per-part breakdowns)
ALTER TABLE speaking_results ADD COLUMN IF NOT EXISTS details JSONB;

-- 12. Subscription ---------------------------------------------
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS is_pro BOOLEAN DEFAULT FALSE;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS pro_expires_at TIMESTAMPTZ;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS free_writing_count INTEGER DEFAULT 0;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS free_speaking_count INTEGER DEFAULT 0;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS free_mock_count INTEGER DEFAULT 0;

ALTER TABLE payments ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users own payments" ON payments;
CREATE POLICY "Users own payments" ON payments FOR ALL USING (auth.uid() = user_id);

-- 11b. AI Teacher coaching analysis cache ----------------------
CREATE TABLE IF NOT EXISTS coach_analyses (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES profiles(id) ON DELETE CASCADE UNIQUE,
  signature TEXT,
  analysis JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE coach_analyses ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users own coach analyses" ON coach_analyses;
CREATE POLICY "Users own coach analyses" ON coach_analyses FOR ALL USING (auth.uid() = user_id);

-- 11c. AI Teacher chat history --------------------------------
CREATE TABLE IF NOT EXISTS coach_messages (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('user', 'assistant')),
  content TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_coach_messages_user ON coach_messages(user_id, created_at);

ALTER TABLE coach_messages ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users own coach messages" ON coach_messages;
CREATE POLICY "Users own coach messages" ON coach_messages FOR ALL USING (auth.uid() = user_id);

-- 13. Columns used by the Next.js API routes -------------------
-- Onboarding / study plan (used by /api/auth/me, /api/study-plan/*)
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS current_level TEXT;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS onboarding_completed BOOLEAN DEFAULT FALSE;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS study_plan JSONB;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS ielts_experience TEXT;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS listening_band DECIMAL(2,1);
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS reading_band DECIMAL(2,1);
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS writing_band DECIMAL(2,1);
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS speaking_band DECIMAL(2,1);

-- Trial limits (3 free evaluations per skill for new users)
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS trial_listening_remaining INTEGER DEFAULT 3;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS trial_reading_remaining INTEGER DEFAULT 3;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS trial_speaking_remaining INTEGER DEFAULT 3;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS trial_writing_remaining INTEGER DEFAULT 3;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS trial_mock_remaining INTEGER DEFAULT 3;

-- Referral system
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS promo_code TEXT UNIQUE;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS referred_by TEXT;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS bonus_mock_remaining INTEGER DEFAULT 0;

-- Auto-generate promo code from user id prefix (unique & deterministic)
CREATE OR REPLACE FUNCTION public.generate_promo_code()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.promo_code IS NULL THEN
    NEW.promo_code := 'IELTS-' || LEFT(REPLACE(NEW.id::text, '-', ''), 12);
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS set_promo_code ON profiles;
CREATE TRIGGER set_promo_code
BEFORE INSERT ON profiles
FOR EACH ROW
WHEN (pg_trigger_depth() = 0)
EXECUTE FUNCTION public.generate_promo_code();

-- Backfill promo codes for existing users that don't have one
UPDATE public.profiles
SET promo_code = 'IELTS-' || LEFT(REPLACE(id::text, '-', ''), 12)
WHERE promo_code IS NULL;

-- Referral application function (SECURITY DEFINER bypasses RLS)
CREATE OR REPLACE FUNCTION public.apply_referral(new_user_id UUID, promo TEXT)
RETURNS JSON AS $$
DECLARE
  referrer_record RECORD;
  already_referred TEXT;
BEGIN
  promo := TRIM(promo);

  SELECT id, bonus_mock_remaining INTO referrer_record
  FROM public.profiles
  WHERE promo_code = promo;

  IF referrer_record IS NULL THEN
    RETURN json_build_object('success', false, 'error', 'Invalid promo code');
  END IF;

  IF referrer_record.id = new_user_id THEN
    RETURN json_build_object('success', false, 'error', 'You cannot use your own promo code');
  END IF;

  SELECT referred_by INTO already_referred
  FROM public.profiles
  WHERE id = new_user_id;

  IF already_referred IS NOT NULL THEN
    RETURN json_build_object('success', false, 'error', 'You have already used a referral code');
  END IF;

  -- Reward the referrer (promo code owner) with +1 attempt for every skill
  -- plus +1 mock test.
  UPDATE public.profiles
  SET trial_listening_remaining = COALESCE(trial_listening_remaining, 0) + 1,
      trial_reading_remaining   = COALESCE(trial_reading_remaining, 0) + 1,
      trial_speaking_remaining  = COALESCE(trial_speaking_remaining, 0) + 1,
      trial_writing_remaining   = COALESCE(trial_writing_remaining, 0) + 1,
      bonus_mock_remaining      = COALESCE(bonus_mock_remaining, 0) + 1
  WHERE id = referrer_record.id;

  UPDATE public.profiles
  SET referred_by = promo
  WHERE id = new_user_id;

  INSERT INTO public.notifications (user_id, title, message, type)
  VALUES (
    referrer_record.id,
    '🎉 Referral Bonus Earned!',
    'A friend used your promo code. You earned +1 Listening, Reading, Speaking, Writing and Mock test attempt!',
    'referral'
  );

  RETURN json_build_object(
    'success', true,
    'bonus_mock_granted', 1,
    'bonus_listening_granted', 1,
    'bonus_reading_granted', 1,
    'bonus_speaking_granted', 1,
    'bonus_writing_granted', 1
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Notifications table
CREATE TABLE IF NOT EXISTS public.notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  message TEXT NOT NULL,
  type TEXT NOT NULL DEFAULT 'info',  -- info, success, referral
  read BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users see own notifications" ON notifications;
CREATE POLICY "Users see own notifications" ON notifications FOR ALL USING (auth.uid() = user_id);

-- Mock test reference id (used by /api/mock-test/evaluate)
ALTER TABLE mock_test_results ADD COLUMN IF NOT EXISTS mock_test_id TEXT;
