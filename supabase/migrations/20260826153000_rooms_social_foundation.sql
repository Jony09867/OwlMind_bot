-- OwlMind Rooms — Social Study Foundation
-- Idempotent schema for rooms, memberships, invites, chat, files, unread counts,
-- member limits, realtime and the room study-time RPC.

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
  description text not null default '',
  room_code text not null unique check (room_code ~ '^[A-Z0-9]{6}$'),
  owner_id text not null references public.users(id) on delete cascade,
  owner_name text not null default 'Telegram User',
  is_private boolean not null default false,
  subject text not null default 'Study',
  member_limit integer not null default 50,
  total_study_sec bigint not null default 0,
  total_sessions integer not null default 0,
  created_at timestamptz not null default now()
);

alter table public.rooms add column if not exists description text not null default '';
alter table public.rooms add column if not exists member_limit integer not null default 50;
alter table public.rooms drop constraint if exists rooms_member_limit_check;
alter table public.rooms add constraint rooms_member_limit_check check (member_limit between 2 and 500);

create table if not exists public.room_participants (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references public.rooms(id) on delete cascade,
  user_id text not null references public.users(id) on delete cascade,
  user_name text not null default 'Telegram User',
  user_avatar text not null default '🦉',
  subject text not null default 'Study',
  role text not null default 'member',
  elapsed_sec bigint not null default 0,
  is_online boolean not null default false,
  joined_at timestamptz not null default now(),
  last_opened_at timestamptz not null default now(),
  last_read_at timestamptz not null default now(),
  unique (room_id, user_id)
);

alter table public.room_participants add column if not exists role text not null default 'member';
alter table public.room_participants add column if not exists last_opened_at timestamptz not null default now();
alter table public.room_participants add column if not exists last_read_at timestamptz not null default now();
alter table public.room_participants drop constraint if exists room_participants_role_check;
alter table public.room_participants add constraint room_participants_role_check check (role in ('owner', 'admin', 'member'));

create table if not exists public.room_invites (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references public.rooms(id) on delete cascade,
  inviter_id text not null,
  invitee_id text not null,
  status text not null default 'pending',
  accepted_at timestamptz,
  created_at timestamptz not null default now()
);

alter table public.room_invites add column if not exists status text not null default 'pending';
alter table public.room_invites add column if not exists accepted_at timestamptz;
alter table public.room_invites drop constraint if exists room_invites_status_check;
alter table public.room_invites add constraint room_invites_status_check check (status in ('pending', 'accepted', 'declined'));

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

create index if not exists users_study_time_idx on public.users(study_time desc);
create index if not exists rooms_study_time_idx on public.rooms(total_study_sec desc);
create index if not exists room_participants_room_id_idx on public.room_participants(room_id);
create index if not exists room_participants_user_opened_idx on public.room_participants(user_id, last_opened_at desc);
create index if not exists room_messages_room_created_idx on public.room_messages(room_id, created_at desc);
create index if not exists room_files_room_id_created_at_idx on public.room_files(room_id, created_at desc);
create index if not exists room_invites_invitee_status_idx on public.room_invites(invitee_id, status, created_at desc);
create unique index if not exists room_invites_one_pending_idx on public.room_invites(room_id, invitee_id) where status = 'pending';

create or replace function public.increment_room_totals(
  p_room_id uuid,
  p_study_sec integer,
  p_sessions integer
)
returns void
language sql
security invoker
set search_path = public
as $$
  update public.rooms
  set total_study_sec = total_study_sec + greatest(coalesce(p_study_sec, 0), 0),
      total_sessions = total_sessions + greatest(coalesce(p_sessions, 0), 0)
  where id = p_room_id;
$$;

grant execute on function public.increment_room_totals(uuid, integer, integer) to anon, authenticated;

create or replace function public.enforce_room_member_limit()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_limit integer;
  v_count integer;
begin
  select member_limit into v_limit from public.rooms where id = new.room_id;
  if v_limit is null then
    raise exception 'Room not found';
  end if;

  select count(*) into v_count from public.room_participants where room_id = new.room_id;
  if v_count >= v_limit then
    raise exception 'Room is full';
  end if;

  return new;
end;
$$;

drop trigger if exists enforce_room_member_limit_trigger on public.room_participants;
create trigger enforce_room_member_limit_trigger
before insert on public.room_participants
for each row execute function public.enforce_room_member_limit();

create or replace function public.get_room_unread_counts(p_user_id text)
returns table(room_id uuid, unread_count bigint)
language sql
security invoker
set search_path = public
as $$
  select rp.room_id,
         count(rm.id)::bigint as unread_count
  from public.room_participants rp
  left join public.room_messages rm
    on rm.room_id = rp.room_id
   and rm.created_at > rp.last_read_at
   and rm.user_id <> p_user_id
  where rp.user_id = p_user_id
  group by rp.room_id;
$$;

grant execute on function public.get_room_unread_counts(text) to anon, authenticated;

alter table public.users enable row level security;
alter table public.rooms enable row level security;
alter table public.room_participants enable row level security;
alter table public.room_invites enable row level security;
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

drop policy if exists "room invites are readable" on public.room_invites;
create policy "room invites are readable" on public.room_invites for select using (true);
drop policy if exists "room invites can be created" on public.room_invites;
create policy "room invites can be created" on public.room_invites for insert with check (true);
drop policy if exists "room invites can be updated" on public.room_invites;
create policy "room invites can be updated" on public.room_invites for update using (true) with check (true);

drop policy if exists "messages are readable" on public.room_messages;
create policy "messages are readable" on public.room_messages for select using (true);
drop policy if exists "messages can be created" on public.room_messages;
create policy "messages can be created" on public.room_messages for insert with check (true);

drop policy if exists "room files are readable" on public.room_files;
create policy "room files are readable" on public.room_files for select using (true);
drop policy if exists "room files can be created" on public.room_files;
create policy "room files can be created" on public.room_files for insert with check (true);

insert into storage.buckets (id, name, public, file_size_limit)
values ('room-files', 'room-files', true, 15728640)
on conflict (id) do update set public = excluded.public, file_size_limit = excluded.file_size_limit;

drop policy if exists "room files storage readable" on storage.objects;
create policy "room files storage readable" on storage.objects for select using (bucket_id = 'room-files');
drop policy if exists "room files storage uploadable" on storage.objects;
create policy "room files storage uploadable" on storage.objects for insert with check (bucket_id = 'room-files');
drop policy if exists "room files storage deletable" on storage.objects;
create policy "room files storage deletable" on storage.objects for delete using (bucket_id = 'room-files');

do $$
begin
  if not exists (select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='rooms') then
    alter publication supabase_realtime add table public.rooms;
  end if;
  if not exists (select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='room_participants') then
    alter publication supabase_realtime add table public.room_participants;
  end if;
  if not exists (select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='room_messages') then
    alter publication supabase_realtime add table public.room_messages;
  end if;
  if not exists (select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='room_invites') then
    alter publication supabase_realtime add table public.room_invites;
  end if;
  if not exists (select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='room_files') then
    alter publication supabase_realtime add table public.room_files;
  end if;
end $$;
