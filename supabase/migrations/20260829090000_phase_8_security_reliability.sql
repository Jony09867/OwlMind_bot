-- Phase 8: authenticated Telegram identity, least-privilege RLS, and RPC hardening.
-- UI and product behavior are intentionally unchanged.

create schema if not exists private;
revoke all on schema private from public, anon;
grant usage on schema private to authenticated;

create or replace function private.current_telegram_user_id()
returns text
language sql
stable
security invoker
set search_path = ''
as $$
  select nullif((select auth.jwt()) -> 'app_metadata' ->> 'telegram_user_id', '');
$$;

create or replace function private.assert_current_telegram_user(p_user_id text)
returns void
language plpgsql
stable
security invoker
set search_path = ''
as $$
declare
  v_user_id text := (select private.current_telegram_user_id());
begin
  if v_user_id is null or p_user_id is distinct from v_user_id then
    raise exception 'Authenticated Telegram user does not match request'
      using errcode = '42501';
  end if;
end;
$$;

create or replace function private.is_room_member(p_room_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.room_participants rp
    where rp.room_id = p_room_id
      and rp.user_id = (select private.current_telegram_user_id())
  );
$$;

create or replace function private.is_room_owner(p_room_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.rooms r
    where r.id = p_room_id
      and r.owner_id = (select private.current_telegram_user_id())
  );
$$;

create or replace function private.can_view_room(p_room_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.rooms r
    where r.id = p_room_id
      and (
        not r.is_private
        or r.owner_id = (select private.current_telegram_user_id())
        or exists (
          select 1 from public.room_participants rp
          where rp.room_id = r.id
            and rp.user_id = (select private.current_telegram_user_id())
        )
        or exists (
          select 1 from public.room_invites ri
          where ri.room_id = r.id
            and ri.invitee_id = (select private.current_telegram_user_id())
            and ri.status = 'pending'
        )
      )
  );
$$;

create or replace function private.is_friend_race_member(p_race_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.friend_race_members frm
    where frm.race_id = p_race_id
      and frm.user_id = (select private.current_telegram_user_id())
  );
$$;

create or replace function private.is_room_member_path(p_room_id text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.room_participants rp
    where rp.room_id::text = p_room_id
      and rp.user_id = (select private.current_telegram_user_id())
  );
$$;

create or replace function private.is_room_owner_path(p_room_id text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.rooms r
    where r.id::text = p_room_id
      and r.owner_id = (select private.current_telegram_user_id())
  );
$$;

revoke execute on all functions in schema private from public, anon;
grant execute on function private.current_telegram_user_id() to authenticated;
grant execute on function private.assert_current_telegram_user(text) to authenticated;
grant execute on function private.is_room_member(uuid) to authenticated;
grant execute on function private.is_room_owner(uuid) to authenticated;
grant execute on function private.can_view_room(uuid) to authenticated;
grant execute on function private.is_friend_race_member(uuid) to authenticated;
grant execute on function private.is_room_member_path(text) to authenticated;
grant execute on function private.is_room_owner_path(text) to authenticated;

alter table public.users add column if not exists auth_user_id uuid;
create unique index if not exists users_auth_user_id_key
  on public.users(auth_user_id)
  where auth_user_id is not null;

-- Keep privileged implementations outside the exposed API schema. Public wrappers
-- validate the signed Telegram identity before calling them.
alter function public.record_focus_session(
  text, text, text, text, text, integer, timestamptz, timestamptz,
  integer, integer, text, text, text, boolean, integer
) set schema private;
alter function private.record_focus_session(
  text, text, text, text, text, integer, timestamptz, timestamptz,
  integer, integer, text, text, text, boolean, integer
) rename to record_focus_session_core;

alter function public.sync_user_study_stats_max(text, bigint, integer, integer) set schema private;
alter function private.sync_user_study_stats_max(text, bigint, integer, integer)
  rename to sync_user_study_stats_max_core;

alter function public.get_user_focus_sessions(text) set schema private;
alter function private.get_user_focus_sessions(text) rename to get_user_focus_sessions_core;

alter function public.sync_user_gamification_state(
  text, bigint, integer, integer, integer, integer, date, integer, date, date, integer
) set schema private;
alter function private.sync_user_gamification_state(
  text, bigint, integer, integer, integer, integer, date, integer, date, date, integer
) rename to sync_user_gamification_state_core;

alter function public.record_room_focus_session(text, uuid, text, text, text, text, text, integer)
  set schema private;
alter function private.record_room_focus_session(text, uuid, text, text, text, text, text, integer)
  rename to record_room_focus_session_core;

alter function public.get_competitive_rankings(text, text, integer, integer) set schema private;
alter function private.get_competitive_rankings(text, text, integer, integer)
  rename to get_competitive_rankings_core;

alter function public.get_friend_race_state(text) set schema private;
alter function private.get_friend_race_state(text) rename to get_friend_race_state_core;

create or replace function public.get_friend_race_state(p_user_id text)
returns jsonb
language plpgsql
stable
security invoker
set search_path = ''
as $$
begin
  perform private.assert_current_telegram_user(p_user_id);
  return private.get_friend_race_state_core(p_user_id);
end;
$$;

alter function public.create_friend_race(text, text, text) set schema private;
alter function private.create_friend_race(text, text, text) rename to create_friend_race_core;

alter function public.join_friend_race(text, text, text, text) set schema private;
alter function private.join_friend_race(text, text, text, text) rename to join_friend_race_core;

revoke execute on function private.record_focus_session_core(
  text, text, text, text, text, integer, timestamptz, timestamptz,
  integer, integer, text, text, text, boolean, integer
) from public, anon;
revoke execute on function private.sync_user_study_stats_max_core(text, bigint, integer, integer) from public, anon;
revoke execute on function private.get_user_focus_sessions_core(text) from public, anon;
revoke execute on function private.sync_user_gamification_state_core(
  text, bigint, integer, integer, integer, integer, date, integer, date, date, integer
) from public, anon;
revoke execute on function private.record_room_focus_session_core(text, uuid, text, text, text, text, text, integer)
  from public, anon;
revoke execute on function private.get_competitive_rankings_core(text, text, integer, integer) from public, anon;
revoke execute on function private.get_friend_race_state_core(text) from public, anon;
revoke execute on function private.create_friend_race_core(text, text, text) from public, anon;
revoke execute on function private.join_friend_race_core(text, text, text, text) from public, anon;

grant execute on function private.record_focus_session_core(
  text, text, text, text, text, integer, timestamptz, timestamptz,
  integer, integer, text, text, text, boolean, integer
) to authenticated;
grant execute on function private.sync_user_study_stats_max_core(text, bigint, integer, integer) to authenticated;
grant execute on function private.get_user_focus_sessions_core(text) to authenticated;
grant execute on function private.sync_user_gamification_state_core(
  text, bigint, integer, integer, integer, integer, date, integer, date, date, integer
) to authenticated;
grant execute on function private.record_room_focus_session_core(text, uuid, text, text, text, text, text, integer)
  to authenticated;
grant execute on function private.get_competitive_rankings_core(text, text, integer, integer) to authenticated;
grant execute on function private.get_friend_race_state_core(text) to authenticated;
grant execute on function private.create_friend_race_core(text, text, text) to authenticated;
grant execute on function private.join_friend_race_core(text, text, text, text) to authenticated;

create or replace function public.record_focus_session(
  p_session_id text,
  p_user_id text,
  p_focus_type text,
  p_subject text,
  p_category text,
  p_duration_sec integer,
  p_started_at timestamptz,
  p_ended_at timestamptz,
  p_pomodoro_count integer,
  p_xp_earned integer,
  p_room_id text,
  p_schedule_block_id text,
  p_schedule_block_title text,
  p_count_toward_totals boolean default true,
  p_level integer default 1
)
returns boolean
language plpgsql
security invoker
set search_path = ''
as $$
begin
  perform private.assert_current_telegram_user(p_user_id);
  return private.record_focus_session_core(
    p_session_id, p_user_id, p_focus_type, p_subject, p_category,
    p_duration_sec, p_started_at, p_ended_at, p_pomodoro_count,
    p_xp_earned, p_room_id, p_schedule_block_id, p_schedule_block_title,
    p_count_toward_totals, p_level
  );
end;
$$;

create or replace function public.sync_user_study_stats_max(
  p_user_id text, p_study_time bigint, p_total_sessions integer, p_level integer
)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
begin
  perform private.assert_current_telegram_user(p_user_id);
  perform private.sync_user_study_stats_max_core(p_user_id, p_study_time, p_total_sessions, p_level);
end;
$$;

create or replace function public.get_user_focus_sessions(p_user_id text)
returns table (
  session_id text,
  user_id text,
  focus_type text,
  subject text,
  category text,
  duration_sec integer,
  started_at timestamptz,
  ended_at timestamptz,
  pomodoro_count integer,
  xp_earned integer,
  room_id text,
  schedule_block_id text,
  schedule_block_title text
)
language plpgsql
stable
security invoker
set search_path = ''
as $$
begin
  perform private.assert_current_telegram_user(p_user_id);
  return query select * from private.get_user_focus_sessions_core(p_user_id);
end;
$$;

create or replace function public.sync_user_gamification_state(
  p_user_id text,
  p_xp bigint,
  p_coins integer,
  p_total_tasks_done integer,
  p_current_streak integer,
  p_longest_streak integer,
  p_last_study_date date,
  p_streak_freezes integer,
  p_last_daily_goal_reward_date date,
  p_last_streak_reward_date date,
  p_level integer
)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
begin
  perform private.assert_current_telegram_user(p_user_id);
  perform private.sync_user_gamification_state_core(
    p_user_id, p_xp, p_coins, p_total_tasks_done, p_current_streak,
    p_longest_streak, p_last_study_date, p_streak_freezes,
    p_last_daily_goal_reward_date, p_last_streak_reward_date, p_level
  );
end;
$$;

create or replace function public.record_room_focus_session(
  p_session_id text,
  p_room_id uuid,
  p_user_id text,
  p_user_name text,
  p_user_avatar text,
  p_subject text,
  p_focus_type text,
  p_duration_sec integer
)
returns boolean
language plpgsql
security invoker
set search_path = ''
as $$
begin
  perform private.assert_current_telegram_user(p_user_id);
  return private.record_room_focus_session_core(
    p_session_id, p_room_id, p_user_id, p_user_name, p_user_avatar,
    p_subject, p_focus_type, p_duration_sec
  );
end;
$$;

create or replace function public.get_competitive_rankings(
  p_scope text,
  p_user_id text,
  p_top_limit integer default 10,
  p_neighbor_radius integer default 2
)
returns jsonb
language plpgsql
stable
security invoker
set search_path = ''
as $$
begin
  perform private.assert_current_telegram_user(p_user_id);
  return private.get_competitive_rankings_core(p_scope, p_user_id, p_top_limit, p_neighbor_radius);
end;
$$;

create or replace function public.create_friend_race(
  p_user_id text, p_user_name text, p_user_avatar text
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
begin
  perform private.assert_current_telegram_user(p_user_id);
  return private.create_friend_race_core(p_user_id, p_user_name, p_user_avatar);
end;
$$;

create or replace function public.join_friend_race(
  p_race_code text, p_user_id text, p_user_name text, p_user_avatar text
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
begin
  perform private.assert_current_telegram_user(p_user_id);
  return private.join_friend_race_core(p_race_code, p_user_id, p_user_name, p_user_avatar);
end;
$$;

alter function public.get_ranking_period_bounds(text, timestamptz, boolean) security invoker;
alter function public.get_ranking_period_bounds(text, timestamptz, boolean) set search_path = '';

create or replace function public.get_room_unread_counts(p_user_id text)
returns table(room_id uuid, unread_count bigint)
language plpgsql
stable
security invoker
set search_path = ''
as $$
begin
  perform private.assert_current_telegram_user(p_user_id);
  return query
    select rp.room_id, count(rm.id)::bigint
    from public.room_participants rp
    left join public.room_messages rm
      on rm.room_id = rp.room_id
     and rm.created_at > rp.last_read_at
     and rm.user_id <> p_user_id
     and rm.message_kind = 'chat'
    where rp.user_id = p_user_id
    group by rp.room_id;
end;
$$;

revoke execute on function public.record_focus_session(
  text, text, text, text, text, integer, timestamptz, timestamptz,
  integer, integer, text, text, text, boolean, integer
) from public, anon;
revoke execute on function public.sync_user_study_stats_max(text, bigint, integer, integer) from public, anon;
revoke execute on function public.get_user_focus_sessions(text) from public, anon;
revoke execute on function public.sync_user_gamification_state(
  text, bigint, integer, integer, integer, integer, date, integer, date, date, integer
) from public, anon;
revoke execute on function public.record_room_focus_session(text, uuid, text, text, text, text, text, integer)
  from public, anon;
revoke execute on function public.get_competitive_rankings(text, text, integer, integer) from public, anon;
revoke execute on function public.get_friend_race_state(text) from public, anon;
revoke execute on function public.create_friend_race(text, text, text) from public, anon;
revoke execute on function public.join_friend_race(text, text, text, text) from public, anon;
revoke execute on function public.get_room_unread_counts(text) from public, anon;
revoke execute on function public.get_ranking_period_bounds(text, timestamptz, boolean) from public, anon;

grant execute on function public.record_focus_session(
  text, text, text, text, text, integer, timestamptz, timestamptz,
  integer, integer, text, text, text, boolean, integer
) to authenticated;
grant execute on function public.sync_user_study_stats_max(text, bigint, integer, integer) to authenticated;
grant execute on function public.get_user_focus_sessions(text) to authenticated;
grant execute on function public.sync_user_gamification_state(
  text, bigint, integer, integer, integer, integer, date, integer, date, date, integer
) to authenticated;
grant execute on function public.record_room_focus_session(text, uuid, text, text, text, text, text, integer)
  to authenticated;
grant execute on function public.get_competitive_rankings(text, text, integer, integer) to authenticated;
grant execute on function public.get_friend_race_state(text) to authenticated;
grant execute on function public.create_friend_race(text, text, text) to authenticated;
grant execute on function public.join_friend_race(text, text, text, text) to authenticated;
grant execute on function public.get_room_unread_counts(text) to authenticated;
grant execute on function public.get_ranking_period_bounds(text, timestamptz, boolean) to authenticated;

-- Trigger-only functions must not be callable through RPC.
alter function public.enforce_room_member_limit() set schema private;
alter function public.normalize_room_member_limit() set schema private;
alter function public.increment_room_totals(uuid, integer, integer) set schema private;
revoke execute on function private.enforce_room_member_limit() from public, anon, authenticated;
revoke execute on function private.normalize_room_member_limit() from public, anon, authenticated;
revoke execute on function private.increment_room_totals(uuid, integer, integer) from public, anon, authenticated;

-- Serialize room joins so concurrent requests cannot exceed member_limit.
create or replace function private.enforce_room_member_limit()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_limit integer;
  v_count integer;
begin
  perform pg_advisory_xact_lock(hashtextextended(new.room_id::text, 0));
  select r.member_limit into v_limit from public.rooms r where r.id = new.room_id;
  if v_limit is null then raise exception 'Room not found'; end if;
  select count(*) into v_count from public.room_participants rp where rp.room_id = new.room_id;
  if v_count >= v_limit then raise exception 'Room is full'; end if;
  return new;
end;
$$;
revoke execute on function private.enforce_room_member_limit() from public, anon, authenticated;

-- Serialize friend-race joins before the core function counts members.
create or replace function private.join_friend_race_guard()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_count integer;
begin
  perform pg_advisory_xact_lock(hashtextextended(new.race_id::text, 0));
  select count(*) into v_count
  from public.friend_race_members frm
  where frm.race_id = new.race_id;
  if v_count >= 30 then raise exception 'This friend race is full'; end if;
  return new;
end;
$$;
revoke execute on function private.join_friend_race_guard() from public, anon, authenticated;
drop trigger if exists friend_race_member_limit_guard on public.friend_race_members;
create trigger friend_race_member_limit_guard
before insert on public.friend_race_members
for each row execute function private.join_friend_race_guard();

create or replace function private.protect_room_participant_identity()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor text := (select private.current_telegram_user_id());
begin
  if new.room_id is distinct from old.room_id or new.user_id is distinct from old.user_id then
    raise exception 'Room membership identity cannot be changed' using errcode = '42501';
  end if;
  if new.role is distinct from old.role and not exists (
    select 1 from public.rooms r where r.id = old.room_id and r.owner_id = v_actor
  ) then
    raise exception 'Only the room owner can change roles' using errcode = '42501';
  end if;
  if old.role = 'owner' and new.role <> 'owner' then
    raise exception 'The owner membership role cannot be changed' using errcode = '42501';
  end if;
  return new;
end;
$$;
revoke execute on function private.protect_room_participant_identity() from public, anon, authenticated;
drop trigger if exists protect_room_participant_identity on public.room_participants;
create trigger protect_room_participant_identity
before update on public.room_participants
for each row execute function private.protect_room_participant_identity();

-- Replace permissive legacy policies.
drop policy if exists "users are readable" on public.users;
drop policy if exists "users can be synced" on public.users;
drop policy if exists "users can be updated" on public.users;
drop policy if exists "rooms are readable" on public.rooms;
drop policy if exists "rooms can be created" on public.rooms;
drop policy if exists "rooms can be updated" on public.rooms;
drop policy if exists "rooms can be deleted" on public.rooms;
drop policy if exists "participants are readable" on public.room_participants;
drop policy if exists "participants can be created" on public.room_participants;
drop policy if exists "participants can be updated" on public.room_participants;
drop policy if exists "participants can be deleted" on public.room_participants;
drop policy if exists "room invites are readable" on public.room_invites;
drop policy if exists "room invites can be created" on public.room_invites;
drop policy if exists "room invites can be updated" on public.room_invites;
drop policy if exists "messages are readable" on public.room_messages;
drop policy if exists "messages can be created" on public.room_messages;
drop policy if exists "room files are readable" on public.room_files;
drop policy if exists "room files can be created" on public.room_files;

create policy users_select_self on public.users
for select to authenticated
using (id = (select private.current_telegram_user_id()));

create policy users_update_self on public.users
for update to authenticated
using (id = (select private.current_telegram_user_id()))
with check (id = (select private.current_telegram_user_id()));

create policy rooms_select_visible on public.rooms
for select to authenticated
using ((select private.can_view_room(id)));

create policy rooms_insert_owner on public.rooms
for insert to authenticated
with check (
  owner_id = (select private.current_telegram_user_id())
  and total_study_sec = 0
  and total_sessions = 0
  and member_limit between 2 and 10
);

create policy rooms_update_owner on public.rooms
for update to authenticated
using (owner_id = (select private.current_telegram_user_id()))
with check (owner_id = (select private.current_telegram_user_id()));

create policy rooms_delete_owner on public.rooms
for delete to authenticated
using (owner_id = (select private.current_telegram_user_id()));

create policy participants_select_visible on public.room_participants
for select to authenticated
using ((select private.can_view_room(room_id)));

create policy participants_insert_self on public.room_participants
for insert to authenticated
with check (
  user_id = (select private.current_telegram_user_id())
  and elapsed_sec = 0
  and (
    role = 'member'
    or (role = 'owner' and (select private.is_room_owner(room_id)))
  )
  and (select private.can_view_room(room_id))
);

create policy participants_update_self_or_owner on public.room_participants
for update to authenticated
using (
  user_id = (select private.current_telegram_user_id())
  or (select private.is_room_owner(room_id))
)
with check (
  user_id = (select private.current_telegram_user_id())
  or (select private.is_room_owner(room_id))
);

create policy participants_delete_self_or_owner on public.room_participants
for delete to authenticated
using (
  user_id = (select private.current_telegram_user_id())
  or (select private.is_room_owner(room_id))
);

create policy room_invites_select_related on public.room_invites
for select to authenticated
using (
  inviter_id = (select private.current_telegram_user_id())
  or invitee_id = (select private.current_telegram_user_id())
  or (select private.is_room_owner(room_id))
);

create policy room_invites_insert_member on public.room_invites
for insert to authenticated
with check (
  inviter_id = (select private.current_telegram_user_id())
  and invitee_id <> (select private.current_telegram_user_id())
  and (select private.is_room_member(room_id))
);

create policy room_invites_update_invitee on public.room_invites
for update to authenticated
using (invitee_id = (select private.current_telegram_user_id()))
with check (invitee_id = (select private.current_telegram_user_id()));

create policy room_messages_select_member on public.room_messages
for select to authenticated
using ((select private.is_room_member(room_id)));

create policy room_messages_insert_member on public.room_messages
for insert to authenticated
with check (
  user_id = (select private.current_telegram_user_id())
  and (select private.is_room_member(room_id))
  and message_kind = 'chat'
  and focus_session_id is null
  and length(body) between 1 and 4000
);

create policy room_files_select_member on public.room_files
for select to authenticated
using ((select private.is_room_member(room_id)));

create policy room_files_insert_member on public.room_files
for insert to authenticated
with check (
  user_id = (select private.current_telegram_user_id())
  and (select private.is_room_member(room_id))
  and file_size between 0 and 15728640
);

create policy room_focus_sessions_select_self on public.room_focus_sessions
for select to authenticated
using (user_id = (select private.current_telegram_user_id()));

create policy focus_sessions_select_self on public.focus_sessions
for select to authenticated
using (user_id = (select private.current_telegram_user_id()));

create policy friend_races_select_members on public.friend_races
for select to authenticated
using (owner_id = (select private.current_telegram_user_id()) or (select private.is_friend_race_member(id)));

create policy friend_race_members_select_members on public.friend_race_members
for select to authenticated
using (user_id = (select private.current_telegram_user_id()) or (select private.is_friend_race_member(race_id)));

-- Data API privileges: no anonymous table access; authenticated gets only what the UI needs.
revoke all on table public.users, public.rooms, public.room_participants,
  public.room_invites, public.room_messages, public.room_files,
  public.room_focus_sessions, public.focus_sessions,
  public.friend_races, public.friend_race_members from anon;

revoke all on table public.users, public.rooms, public.room_participants,
  public.room_invites, public.room_messages, public.room_files,
  public.room_focus_sessions, public.focus_sessions,
  public.friend_races, public.friend_race_members from authenticated;

grant select on public.users to authenticated;
grant update(first_name, username, photo_url, updated_at) on public.users to authenticated;
grant select, insert, delete on public.rooms to authenticated;
grant update(name, description, subject, is_private, member_limit) on public.rooms to authenticated;
grant select, insert, update, delete on public.room_participants to authenticated;
grant select, insert on public.room_messages to authenticated;
grant select, insert on public.room_files to authenticated;
grant select, insert, update(status, accepted_at) on public.room_invites to authenticated;
grant select on public.room_focus_sessions, public.focus_sessions,
  public.friend_races, public.friend_race_members to authenticated;

-- Private room files: signed URLs replace public URLs in the client.
update storage.buckets set public = false where id = 'room-files';
drop policy if exists "room files storage readable" on storage.objects;
drop policy if exists "room files storage uploadable" on storage.objects;
drop policy if exists "room files storage deletable" on storage.objects;

create policy room_files_storage_select_member on storage.objects
for select to authenticated
using (
  bucket_id = 'room-files'
  and (select private.is_room_member_path((storage.foldername(name))[1]))
);

create policy room_files_storage_insert_member on storage.objects
for insert to authenticated
with check (
  bucket_id = 'room-files'
  and (select private.is_room_member_path((storage.foldername(name))[1]))
);

create policy room_files_storage_delete_uploader_or_owner on storage.objects
for delete to authenticated
using (
  bucket_id = 'room-files'
  and (
    owner_id = (select auth.uid()::text)
    or (select private.is_room_owner_path((storage.foldername(name))[1]))
  )
);

-- Advisor-reported missing foreign-key indexes and duplicate indexes.
create index if not exists room_focus_sessions_room_id_idx
  on public.room_focus_sessions(room_id);
create index if not exists rooms_owner_id_idx
  on public.rooms(owner_id);
drop index if exists public.room_messages_room_recent_idx;
drop index if exists public.room_participants_user_recent_idx;

-- New public functions are closed by default; grant explicitly in later migrations.
alter default privileges in schema public revoke execute on functions from public, anon, authenticated;
