-- Word Battle game system: AI-generated vocabulary/idiom packs per test,
-- plus persistent XP/level/combo stats per user.

create table if not exists game_word_packs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  skill text not null,
  items jsonb not null default '[]',
  fill_gap jsonb not null default '[]',
  idiom_riddles jsonb not null default '[]',
  created_at timestamptz not null default now()
);

alter table game_word_packs enable row level security;

create policy "own game word packs" on game_word_packs
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create index if not exists game_word_packs_user_created_idx
  on game_word_packs (user_id, created_at desc);

create table if not exists user_game_stats (
  user_id uuid primary key references auth.users(id) on delete cascade,
  xp integer not null default 0,
  games_played integer not null default 0,
  best_combo integer not null default 0,
  updated_at timestamptz not null default now()
);

alter table user_game_stats enable row level security;

create policy "own game stats" on user_game_stats
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
