-- Adds pronunciation (IPA) + multiple example sentences to vocabulary.
-- Safe to run multiple times. Run this in the Supabase SQL editor.
ALTER TABLE vocabulary ADD COLUMN IF NOT EXISTS phonetic TEXT;
ALTER TABLE vocabulary ADD COLUMN IF NOT EXISTS examples JSONB;

-- Prevent duplicate words per user (in-place "add to vocabulary" relies on this).
CREATE UNIQUE INDEX IF NOT EXISTS vocabulary_user_word_unique
  ON vocabulary (user_id, lower(word));
