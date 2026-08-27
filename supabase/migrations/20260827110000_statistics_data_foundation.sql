create table if not exists public.focus_sessions (
  user_id text not null,
  session_id text not null,
  focus_type text not null,
  subject text not null default 'Study',
  category text not null default 'study',
  duration_sec integer not null,
  started_at timestamptz not null,
  ended_at timestamptz not null,
  pomodoro_count integer not null default 0,
  xp_earned integer not null default 0,
  room_id text,
  schedule_block_id text,
  schedule_block_title text,
  created_at timestamptz not null default now(),
  primary key (user_id, session_id),
  constraint focus_sessions_focus_type_check check (focus_type in ('pomodoro', 'stopwatch', 'deep')),
  constraint focus_sessions_duration_check check (duration_sec > 0),
  constraint focus_sessions_pomodoro_count_check check (pomodoro_count >= 0),
  constraint focus_sessions_xp_earned_check check (xp_earned >= 0),
  constraint focus_sessions_time_check check (ended_at >= started_at)
);

create index if not exists focus_sessions_user_started_idx
  on public.focus_sessions(user_id, started_at desc);

alter table public.focus_sessions enable row level security;

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
security definer
set search_path = public
as $$
declare
  v_inserted text;
  v_duration integer := greatest(coalesce(p_duration_sec, 0), 0);
  v_level integer := greatest(coalesce(p_level, 1), 1);
begin
  if p_session_id is null or trim(p_session_id) = ''
     or p_user_id is null or trim(p_user_id) = ''
     or p_focus_type not in ('pomodoro', 'stopwatch', 'deep')
     or v_duration <= 0
     or p_started_at is null
     or p_ended_at is null
     or p_ended_at < p_started_at then
    return false;
  end if;

  insert into public.focus_sessions (
    user_id,
    session_id,
    focus_type,
    subject,
    category,
    duration_sec,
    started_at,
    ended_at,
    pomodoro_count,
    xp_earned,
    room_id,
    schedule_block_id,
    schedule_block_title
  ) values (
    p_user_id,
    p_session_id,
    p_focus_type,
    coalesce(nullif(trim(p_subject), ''), 'Study'),
    coalesce(nullif(trim(p_category), ''), 'study'),
    v_duration,
    p_started_at,
    p_ended_at,
    greatest(coalesce(p_pomodoro_count, 0), 0),
    greatest(coalesce(p_xp_earned, 0), 0),
    nullif(trim(p_room_id), ''),
    nullif(trim(p_schedule_block_id), ''),
    nullif(trim(p_schedule_block_title), '')
  )
  on conflict (user_id, session_id) do nothing
  returning session_id into v_inserted;

  if v_inserted is null then
    return false;
  end if;

  if coalesce(p_count_toward_totals, true) then
    insert into public.users (id, study_time, total_sessions, level, updated_at)
    values (p_user_id, v_duration, 1, v_level, now())
    on conflict (id) do update
    set study_time = public.users.study_time + v_duration,
        total_sessions = public.users.total_sessions + 1,
        level = greatest(public.users.level, v_level),
        updated_at = now();
  end if;

  return true;
end;
$$;

create or replace function public.sync_user_study_stats_max(
  p_user_id text,
  p_study_time bigint,
  p_total_sessions integer,
  p_level integer
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_user_id is null or trim(p_user_id) = '' then
    return;
  end if;

  insert into public.users (id, study_time, total_sessions, level, updated_at)
  values (
    p_user_id,
    greatest(coalesce(p_study_time, 0), 0),
    greatest(coalesce(p_total_sessions, 0), 0),
    greatest(coalesce(p_level, 1), 1),
    now()
  )
  on conflict (id) do update
  set study_time = greatest(public.users.study_time, excluded.study_time),
      total_sessions = greatest(public.users.total_sessions, excluded.total_sessions),
      level = greatest(public.users.level, excluded.level),
      updated_at = now();
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
language sql
stable
security definer
set search_path = public
as $$
  select
    fs.session_id,
    fs.user_id,
    fs.focus_type,
    fs.subject,
    fs.category,
    fs.duration_sec,
    fs.started_at,
    fs.ended_at,
    fs.pomodoro_count,
    fs.xp_earned,
    fs.room_id,
    fs.schedule_block_id,
    fs.schedule_block_title
  from public.focus_sessions fs
  where fs.user_id = p_user_id
  order by fs.started_at asc;
$$;

grant execute on function public.record_focus_session(
  text, text, text, text, text, integer, timestamptz, timestamptz,
  integer, integer, text, text, text, boolean, integer
) to anon, authenticated;

grant execute on function public.sync_user_study_stats_max(
  text, bigint, integer, integer
) to anon, authenticated;

grant execute on function public.get_user_focus_sessions(text) to anon, authenticated;
