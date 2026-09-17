-- Per-game progression stats for the 100-level system.
-- Stores { "<game-id>": { plays, best_score, best_streak } } per user.
alter table public.user_game_stats
  add column if not exists game_stats jsonb not null default '{}'::jsonb;
