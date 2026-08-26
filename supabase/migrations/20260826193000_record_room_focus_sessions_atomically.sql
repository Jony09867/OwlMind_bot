create table if not exists public.room_focus_sessions (
  session_id text primary key,
  room_id uuid not null references public.rooms(id) on delete cascade,
  user_id text not null,
  subject text not null default 'Study',
  focus_type text not null,
  duration_sec integer not null,
  created_at timestamptz not null default now(),
  constraint room_focus_sessions_focus_type_check check (focus_type in ('pomodoro', 'stopwatch', 'deep')),
  constraint room_focus_sessions_duration_check check (duration_sec > 0)
);

alter table public.room_focus_sessions enable row level security;

alter table public.room_messages
  add column if not exists message_kind text not null default 'chat',
  add column if not exists focus_session_id text;

alter table public.room_messages
  drop constraint if exists room_messages_message_kind_check;
alter table public.room_messages
  add constraint room_messages_message_kind_check
  check (message_kind in ('chat', 'focus_event'));

create unique index if not exists room_messages_focus_session_id_key
  on public.room_messages(focus_session_id)
  where focus_session_id is not null;

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
security definer
set search_path = public
as $$
declare
  v_inserted text;
  v_subject text := coalesce(nullif(trim(p_subject), ''), 'Study');
  v_user_name text := coalesce(nullif(trim(p_user_name), ''), 'Telegram User');
  v_user_avatar text := coalesce(nullif(trim(p_user_avatar), ''), '🦉');
  v_duration integer := greatest(coalesce(p_duration_sec, 0), 0);
  v_duration_label text;
begin
  if p_session_id is null or trim(p_session_id) = '' or p_room_id is null or p_user_id is null or trim(p_user_id) = '' then
    return false;
  end if;
  if v_duration <= 0 or p_focus_type not in ('pomodoro', 'stopwatch', 'deep') then
    return false;
  end if;
  if not exists (
    select 1 from public.room_participants
    where room_id = p_room_id and user_id = p_user_id
  ) then
    return false;
  end if;

  insert into public.room_focus_sessions(session_id, room_id, user_id, subject, focus_type, duration_sec)
  values (p_session_id, p_room_id, p_user_id, v_subject, p_focus_type, v_duration)
  on conflict (session_id) do nothing
  returning session_id into v_inserted;

  if v_inserted is null then
    return false;
  end if;

  update public.room_participants
  set elapsed_sec = elapsed_sec + v_duration,
      subject = v_subject,
      is_online = true,
      focus_status = 'idle',
      focus_type = null,
      focus_started_at = null,
      focus_elapsed_sec = 0
  where room_id = p_room_id and user_id = p_user_id;

  update public.rooms
  set total_study_sec = total_study_sec + v_duration,
      total_sessions = total_sessions + 1
  where id = p_room_id;

  if v_duration < 60 then
    v_duration_label := v_duration::text || 's';
  elsif v_duration < 3600 then
    v_duration_label := floor(v_duration / 60.0)::integer::text || 'm';
  else
    v_duration_label := floor(v_duration / 3600.0)::integer::text || 'h';
    if mod(v_duration, 3600) >= 60 then
      v_duration_label := v_duration_label || ' ' || floor(mod(v_duration, 3600) / 60.0)::integer::text || 'm';
    end if;
  end if;

  insert into public.room_messages(
    room_id, user_id, user_name, user_avatar, body, message_kind, focus_session_id
  ) values (
    p_room_id,
    'focus-event:' || p_user_id,
    'Focus',
    '✓',
    v_user_name || ' completed ' || v_duration_label || ' · ' || v_subject,
    'focus_event',
    p_session_id
  )
  on conflict do nothing;

  return true;
end;
$$;

grant execute on function public.record_room_focus_session(text, uuid, text, text, text, text, text, integer) to anon, authenticated;

create or replace function public.get_room_unread_counts(p_user_id text)
returns table(room_id uuid, unread_count bigint)
language sql
set search_path = public
as $$
  select rp.room_id,
         count(rm.id)::bigint as unread_count
  from public.room_participants rp
  left join public.room_messages rm
    on rm.room_id = rp.room_id
   and rm.created_at > rp.last_read_at
   and rm.user_id <> p_user_id
   and rm.message_kind = 'chat'
  where rp.user_id = p_user_id
  group by rp.room_id;
$$;
