-- Study Rooms schema used by the Telegram Mini App.
create table if not exists public.study_rooms (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(trim(name)) between 1 and 80),
  owner_id text not null,
  owner_name text not null default 'Anonymous learner',
  is_private boolean not null default false,
  subject text not null default 'Study',
  total_study_sec bigint not null default 0,
  total_sessions integer not null default 0,
  created_at timestamptz not null default now()
);

create table if not exists public.room_members (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references public.study_rooms(id) on delete cascade,
  user_id text not null,
  user_name text not null default 'Anonymous learner',
  user_avatar text not null default '🦉',
  subject text not null default 'Study',
  elapsed_sec bigint not null default 0,
  is_online boolean not null default false,
  joined_at timestamptz not null default now(),
  unique (room_id, user_id)
);

create table if not exists public.room_invites (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references public.study_rooms(id) on delete cascade,
  inviter_id text not null,
  invitee_id text not null,
  created_at timestamptz not null default now()
);

create table if not exists public.room_messages (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references public.study_rooms(id) on delete cascade,
  user_id text not null,
  user_name text not null default 'Anonymous learner',
  user_avatar text not null default '🦉',
  body text not null check (char_length(trim(body)) between 1 and 2000),
  created_at timestamptz not null default now()
);

create table if not exists public.room_files (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references public.study_rooms(id) on delete cascade,
  user_id text not null,
  user_name text not null default 'Anonymous learner',
  user_avatar text not null default '🦉',
  file_name text not null,
  file_url text not null,
  file_type text not null default 'file',
  file_size bigint not null default 0,
  created_at timestamptz not null default now()
);

create index if not exists study_rooms_total_study_sec_idx
  on public.study_rooms(total_study_sec desc);
create index if not exists room_members_room_id_idx
  on public.room_members(room_id);
create index if not exists room_messages_room_id_created_at_idx
  on public.room_messages(room_id, created_at);
create index if not exists room_files_room_id_created_at_idx
  on public.room_files(room_id, created_at);

create or replace function public.increment_room_totals(
  p_room_id uuid,
  p_study_sec integer,
  p_sessions integer
)
returns void
language sql
security invoker
as $$
  update public.study_rooms
  set total_study_sec = total_study_sec + greatest(coalesce(p_study_sec, 0), 0),
      total_sessions = total_sessions + greatest(coalesce(p_sessions, 0), 0)
  where id = p_room_id;
$$;

alter table public.study_rooms enable row level security;
alter table public.room_members enable row level security;
alter table public.room_invites enable row level security;
alter table public.room_messages enable row level security;
alter table public.room_files enable row level security;

drop policy if exists "study rooms are readable" on public.study_rooms;
create policy "study rooms are readable" on public.study_rooms for select using (true);
drop policy if exists "study rooms can be created" on public.study_rooms;
create policy "study rooms can be created" on public.study_rooms for insert with check (true);
drop policy if exists "study rooms can be updated" on public.study_rooms;
create policy "study rooms can be updated" on public.study_rooms for update using (true) with check (true);
drop policy if exists "study rooms can be deleted" on public.study_rooms;
create policy "study rooms can be deleted" on public.study_rooms for delete using (true);

drop policy if exists "room members are readable" on public.room_members;
create policy "room members are readable" on public.room_members for select using (true);
drop policy if exists "room members can be created" on public.room_members;
create policy "room members can be created" on public.room_members for insert with check (true);
drop policy if exists "room members can be updated" on public.room_members;
create policy "room members can be updated" on public.room_members for update using (true) with check (true);
drop policy if exists "room members can be deleted" on public.room_members;
create policy "room members can be deleted" on public.room_members for delete using (true);

drop policy if exists "room invites are readable" on public.room_invites;
create policy "room invites are readable" on public.room_invites for select using (true);
drop policy if exists "room invites can be created" on public.room_invites;
create policy "room invites can be created" on public.room_invites for insert with check (true);

drop policy if exists "room messages are readable" on public.room_messages;
create policy "room messages are readable" on public.room_messages for select using (true);
drop policy if exists "room messages can be created" on public.room_messages;
create policy "room messages can be created" on public.room_messages for insert with check (true);

drop policy if exists "room files are readable" on public.room_files;
create policy "room files are readable" on public.room_files for select using (true);
drop policy if exists "room files can be created" on public.room_files;
create policy "room files can be created" on public.room_files for insert with check (true);