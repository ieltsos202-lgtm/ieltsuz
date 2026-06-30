-- Run this SQL in your Supabase SQL Editor (SQL Editor > New query > Run)
-- This creates the evaluation_jobs table for background AI processing.

create table if not exists evaluation_jobs (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references auth.users(id) on delete cascade,
  type text not null check (type in ('writing','speaking','listening','reading')),
  status text not null default 'pending' check (status in ('pending','processing','completed','failed')),
  payload jsonb not null default '{}',
  result jsonb,
  error text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- Indexes for fast lookups
 create index if not exists idx_evaluation_jobs_user_status on evaluation_jobs(user_id, status);
 create index if not exists idx_evaluation_jobs_status_created on evaluation_jobs(status, created_at);

-- Enable RLS
alter table evaluation_jobs enable row level security;

 create policy "Users can view their own jobs"
   on evaluation_jobs for select
   using (auth.uid() = user_id);

 create policy "Users can create their own jobs"
   on evaluation_jobs for insert
   with check (auth.uid() = user_id);

 create policy "Users can update their own jobs"
   on evaluation_jobs for update
   using (auth.uid() = user_id);
