-- ============================================================
-- ⚠️  DANGER: Wipes EVERY registered user and all of their data.
-- Run this ONCE before launching to the public, to clear out test
-- accounts created during development.
--
-- Run in: Supabase Dashboard → SQL Editor → New query → Run.
--
-- This does NOT touch shared/static content:
--   cambridge_tests, speaking_questions, writing_prompts,
--   content_mocks, game_master_items, game_master_sentences.
--
-- Everything else that references profiles(id) ON DELETE CASCADE
-- (vocabulary, writing_results, speaking_results, listening_results,
-- reading_results, mock_test_results, weekly_progress, payments,
-- coach_analyses, coach_messages, notifications, game_word_packs,
-- user_game_stats, evaluation_jobs) is deleted automatically the
-- moment its owning profile row is deleted — no need to list them.
-- ============================================================

begin;

-- 1. Delete every profile. Cascades to all the tables listed above.
delete from public.profiles;

-- 2. Delete the underlying Supabase Auth users too, so people can
--    re-register with the same email if they used a test account.
delete from auth.users;

commit;

-- Sanity check — both should return 0.
select
  (select count(*) from public.profiles) as remaining_profiles,
  (select count(*) from auth.users) as remaining_auth_users;
