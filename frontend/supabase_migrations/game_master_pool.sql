-- Shared "master pool" of high-level vocabulary, idioms, and strong grammar
-- sentences, extracted once (by an admin build job) directly from the real
-- Reading/Listening test bank in public/mocks. All 3 Word Games draw random
-- items from this shared pool — nothing here is user-specific.

create table if not exists game_master_items (
  id uuid primary key default gen_random_uuid(),
  word text not null,
  type text not null default 'word', -- 'word' | 'idiom'
  translation text,
  phonetic text,
  definition text,
  examples jsonb not null default '[]',
  difficulty text not null default 'B2', -- B2 | C1 | C2
  source text, -- e.g. "R12", "L5"
  created_at timestamptz not null default now()
);

alter table game_master_items enable row level security;

create policy "anyone can read master items" on game_master_items
  for select using (true);

create policy "admins can insert master items" on game_master_items
  for insert with check (
    exists (select 1 from profiles p where p.id = auth.uid() and p.is_admin)
  );

create index if not exists game_master_items_source_idx on game_master_items (source);

create table if not exists game_master_sentences (
  id uuid primary key default gen_random_uuid(),
  sentence text not null,
  translation text,
  structure_note text,
  difficulty text not null default 'B2',
  source text,
  created_at timestamptz not null default now()
);

alter table game_master_sentences enable row level security;

create policy "anyone can read master sentences" on game_master_sentences
  for select using (true);

create policy "admins can insert master sentences" on game_master_sentences
  for insert with check (
    exists (select 1 from profiles p where p.id = auth.uid() and p.is_admin)
  );

create index if not exists game_master_sentences_source_idx on game_master_sentences (source);
