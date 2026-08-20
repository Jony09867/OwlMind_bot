-- OwlMind Telegram Mini App schema.
-- Run this once in Supabase SQL Editor before using the live database.

create table if not exists public.users (
  id text primary key,
  first_name text not null default 'Telegram User',
  username text,
  photo_url text,
  study_time bigint not null default 0,
  total_sessions integer not null default 0,
  level integer not null default 1,
  updated_at timestamptz not null default now()
);

create table if not exists public.rooms (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(trim(name)) between 1 and 80),
  room_code text not null unique check (room_code ~ '^[A-Z0-9]{6}$'),
  owner_id text not null references public.users(id) on delete cascade,
  owner_name text not null default 'Telegram User',
  is_private boolean not null default false,
  subject text not null default 'Study',
  total_study_sec bigint not null default 0,
  total_sessions integer not null default 0,
  created_at timestamptz not null default now()
);

create table if not exists public.room_participants (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references public.rooms(id) on delete cascade,
  user_id text not null references public.users(id) on delete cascade,
  user_name text not null default 'Telegram User',
  user_avatar text not null default '🦉',
  subject text not null default 'Study',
  elapsed_sec bigint not null default 0,
  is_online boolean not null default false,
  joined_at timestamptz not null default now(),
  unique (room_id, user_id)
);

create table if not exists public.room_messages (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references public.rooms(id) on delete cascade,
  user_id text not null,
  user_name text not null default 'Telegram User',
  user_avatar text not null default '🦉',
  body text not null check (char_length(trim(body)) between 1 and 2000),
  created_at timestamptz not null default now()
);

create table if not exists public.room_files (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references public.rooms(id) on delete cascade,
  user_id text not null,
  user_name text not null default 'Telegram User',
  user_avatar text not null default '🦉',
  file_name text not null,
  file_url text not null,
  file_type text not null default 'file',
  file_size bigint not null default 0,
  created_at timestamptz not null default now()
);

create or replace function public.increment_room_totals(
  p_room_id uuid,
  p_study_sec integer,
  p_sessions integer
)
returns void
language sql
security invoker
as $$
  update public.rooms
  set total_study_sec = total_study_sec + greatest(coalesce(p_study_sec, 0), 0),
      total_sessions = total_sessions + greatest(coalesce(p_sessions, 0), 0)
  where id = p_room_id;
$$;

create index if not exists users_study_time_idx on public.users(study_time desc);
create index if not exists rooms_study_time_idx on public.rooms(total_study_sec desc);
create index if not exists room_participants_room_id_idx on public.room_participants(room_id);

alter table public.users enable row level security;
alter table public.rooms enable row level security;
alter table public.room_participants enable row level security;
alter table public.room_messages enable row level security;
alter table public.room_files enable row level security;

drop policy if exists "users are readable" on public.users;
create policy "users are readable" on public.users for select using (true);
drop policy if exists "users can be synced" on public.users;
create policy "users can be synced" on public.users for insert with check (true);
drop policy if exists "users can be updated" on public.users;
create policy "users can be updated" on public.users for update using (true) with check (true);

drop policy if exists "rooms are readable" on public.rooms;
create policy "rooms are readable" on public.rooms for select using (true);
drop policy if exists "rooms can be created" on public.rooms;
create policy "rooms can be created" on public.rooms for insert with check (true);
drop policy if exists "rooms can be updated" on public.rooms;
create policy "rooms can be updated" on public.rooms for update using (true) with check (true);
drop policy if exists "rooms can be deleted" on public.rooms;
create policy "rooms can be deleted" on public.rooms for delete using (true);

drop policy if exists "participants are readable" on public.room_participants;
create policy "participants are readable" on public.room_participants for select using (true);
drop policy if exists "participants can be created" on public.room_participants;
create policy "participants can be created" on public.room_participants for insert with check (true);
drop policy if exists "participants can be updated" on public.room_participants;
create policy "participants can be updated" on public.room_participants for update using (true) with check (true);
drop policy if exists "participants can be deleted" on public.room_participants;
create policy "participants can be deleted" on public.room_participants for delete using (true);

drop policy if exists "messages are readable" on public.room_messages;
create policy "messages are readable" on public.room_messages for select using (true);
drop policy if exists "messages can be created" on public.room_messages;
create policy "messages can be created" on public.room_messages for insert with check (true);

drop policy if exists "files are readable" on public.room_files;
create policy "files are readable" on public.room_files for select using (true);
drop policy if exists "files can be created" on public.room_files;
create policy "files can be created" on public.room_files for insert with check (true);