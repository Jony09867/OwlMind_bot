-- Global ranking data. This table is intentionally independent from study rooms.
create table if not exists public.global_leaderboard (
  user_id text primary key,
  user_name text not null default 'Anonymous learner',
  user_avatar text not null default '🦉',
  total_study_sec bigint not null default 0,
  total_sessions integer not null default 0,
  level integer not null default 1,
  updated_at timestamptz not null default now()
);

alter table public.global_leaderboard enable row level security;

-- The Mini App identifies users with Telegram IDs and does not use Supabase Auth.
-- Keep reads public so users can compete globally. Writes are restricted to the
-- app's anon-key policy; production deployments should replace this with a
-- server-side Telegram initData validation flow.
drop policy if exists "global leaderboard is readable" on public.global_leaderboard;
create policy "global leaderboard is readable"
  on public.global_leaderboard for select
  using (true);

drop policy if exists "global leaderboard can be synced" on public.global_leaderboard;
create policy "global leaderboard can be synced"
  on public.global_leaderboard for insert
  with check (true);

drop policy if exists "global leaderboard can be updated" on public.global_leaderboard;
create policy "global leaderboard can be updated"
  on public.global_leaderboard for update
  using (true)
  with check (true);