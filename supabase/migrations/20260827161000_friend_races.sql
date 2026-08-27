create table if not exists public.friend_races (
  id uuid primary key default gen_random_uuid(),
  race_code text not null unique,
  owner_id text not null,
  owner_name text not null default 'Learner',
  period_start timestamptz not null,
  period_end timestamptz not null,
  created_at timestamptz not null default now()
);

create unique index if not exists friend_races_owner_period_idx
  on public.friend_races(owner_id, period_start);

create table if not exists public.friend_race_members (
  race_id uuid not null references public.friend_races(id) on delete cascade,
  user_id text not null,
  user_name text not null default 'Learner',
  user_avatar text not null default '🦉',
  period_start timestamptz not null,
  joined_at timestamptz not null default now(),
  primary key (race_id, user_id),
  unique (user_id, period_start)
);

create index if not exists friend_race_members_race_idx
  on public.friend_race_members(race_id, joined_at);

alter table public.friend_races enable row level security;
alter table public.friend_race_members enable row level security;

create or replace function public.get_friend_race_state(p_user_id text)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_week_start timestamptz;
  v_week_end timestamptz;
  v_race public.friend_races%rowtype;
  v_entries jsonb := '[]'::jsonb;
  v_user_rank integer;
  v_user_study bigint := 0;
  v_gap bigint := 0;
  v_member_count integer := 0;
  v_previous jsonb;
begin
  select period_start, period_end
    into v_week_start, v_week_end
  from public.get_ranking_period_bounds('weekly', now(), false);

  select fr.*
    into v_race
  from public.friend_race_members frm
  join public.friend_races fr on fr.id = frm.race_id
  where frm.user_id = p_user_id
    and frm.period_start = v_week_start
  limit 1;

  if v_race.id is not null then
    with member_totals as (
      select
        frm.user_id,
        frm.user_name,
        frm.user_avatar,
        frm.joined_at,
        coalesce(sum(fs.duration_sec) filter (
          where fs.duration_sec >= 300
            and fs.started_at >= v_race.period_start
            and fs.started_at < v_race.period_end
        ), 0)::bigint as study_sec,
        count(fs.session_id) filter (
          where fs.duration_sec >= 300
            and fs.started_at >= v_race.period_start
            and fs.started_at < v_race.period_end
        )::integer as sessions
      from public.friend_race_members frm
      left join public.focus_sessions fs on fs.user_id = frm.user_id
      where frm.race_id = v_race.id
      group by frm.user_id, frm.user_name, frm.user_avatar, frm.joined_at
    ),
    ranked as (
      select
        mt.*,
        case
          when mt.study_sec > 0 then dense_rank() over (
            order by case when mt.study_sec > 0 then mt.study_sec end desc nulls last
          )::integer
          else null
        end as rank
      from member_totals mt
    )
    select
      coalesce(
        jsonb_agg(
          jsonb_build_object(
            'rank', r.rank,
            'user_id', r.user_id,
            'user_name', r.user_name,
            'user_avatar', r.user_avatar,
            'study_sec', r.study_sec,
            'sessions', r.sessions,
            'is_you', r.user_id = p_user_id
          )
          order by r.rank asc nulls last, r.study_sec desc, r.sessions desc, r.joined_at asc
        ),
        '[]'::jsonb
      ),
      max(r.rank) filter (where r.user_id = p_user_id),
      max(r.study_sec) filter (where r.user_id = p_user_id),
      count(*)
    into v_entries, v_user_rank, v_user_study, v_member_count
    from ranked r;

    if v_user_rank is not null and v_user_rank > 1 then
      with member_totals as (
        select
          frm.user_id,
          coalesce(sum(fs.duration_sec) filter (
            where fs.duration_sec >= 300
              and fs.started_at >= v_race.period_start
              and fs.started_at < v_race.period_end
          ), 0)::bigint as study_sec
        from public.friend_race_members frm
        left join public.focus_sessions fs on fs.user_id = frm.user_id
        where frm.race_id = v_race.id
        group by frm.user_id
      )
      select coalesce(min(mt.study_sec - v_user_study), 0)
        into v_gap
      from member_totals mt
      where mt.study_sec > v_user_study;
    end if;
  end if;

  with previous_membership as (
    select fr.*
    from public.friend_race_members frm
    join public.friend_races fr on fr.id = frm.race_id
    where frm.user_id = p_user_id
      and fr.period_end <= now()
    order by fr.period_end desc
    limit 1
  ),
  previous_totals as (
    select
      frm.user_id,
      frm.user_name,
      frm.user_avatar,
      coalesce(sum(fs.duration_sec) filter (
        where fs.duration_sec >= 300
          and fs.started_at >= pr.period_start
          and fs.started_at < pr.period_end
      ), 0)::bigint as study_sec,
      count(fs.session_id) filter (
        where fs.duration_sec >= 300
          and fs.started_at >= pr.period_start
          and fs.started_at < pr.period_end
      )::integer as sessions,
      frm.joined_at,
      pr.id as race_id,
      pr.period_start,
      pr.period_end
    from previous_membership pr
    join public.friend_race_members frm on frm.race_id = pr.id
    left join public.focus_sessions fs on fs.user_id = frm.user_id
    group by frm.user_id, frm.user_name, frm.user_avatar, frm.joined_at, pr.id, pr.period_start, pr.period_end
  ),
  previous_winner as (
    select *
    from previous_totals
    where study_sec > 0
    order by study_sec desc, sessions desc, joined_at asc
    limit 1
  )
  select jsonb_build_object(
    'race_id', pw.race_id,
    'user_id', pw.user_id,
    'user_name', pw.user_name,
    'user_avatar', pw.user_avatar,
    'study_sec', pw.study_sec,
    'sessions', pw.sessions,
    'period_start', pw.period_start,
    'period_end', pw.period_end
  )
  into v_previous
  from previous_winner pw;

  return jsonb_build_object(
    'race', case
      when v_race.id is null then null
      else jsonb_build_object(
        'id', v_race.id,
        'race_code', v_race.race_code,
        'owner_id', v_race.owner_id,
        'owner_name', v_race.owner_name,
        'period_start', v_race.period_start,
        'period_end', v_race.period_end,
        'is_owner', v_race.owner_id = p_user_id,
        'member_count', v_member_count,
        'user_rank', v_user_rank,
        'user_study_sec', v_user_study,
        'gap_to_next_sec', v_gap,
        'entries', v_entries
      )
    end,
    'previous_winner', v_previous,
    'minimum_session_sec', 300,
    'ranking_timezone', 'Asia/Tashkent'
  );
end;
$$;

create or replace function public.create_friend_race(
  p_user_id text,
  p_user_name text,
  p_user_avatar text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_week_start timestamptz;
  v_week_end timestamptz;
  v_existing_race uuid;
  v_race_id uuid;
  v_code text;
  v_attempt integer := 0;
begin
  if p_user_id is null or trim(p_user_id) = '' then
    raise exception 'User is required';
  end if;

  select period_start, period_end
    into v_week_start, v_week_end
  from public.get_ranking_period_bounds('weekly', now(), false);

  select frm.race_id
    into v_existing_race
  from public.friend_race_members frm
  where frm.user_id = p_user_id
    and frm.period_start = v_week_start
  limit 1;

  if v_existing_race is not null then
    return public.get_friend_race_state(p_user_id);
  end if;

  loop
    v_attempt := v_attempt + 1;
    v_code := upper(substr(md5(gen_random_uuid()::text), 1, 8));
    exit when not exists (
      select 1 from public.friend_races where race_code = v_code
    );
    if v_attempt >= 10 then
      raise exception 'Could not create race code';
    end if;
  end loop;

  insert into public.friend_races (
    race_code,
    owner_id,
    owner_name,
    period_start,
    period_end
  )
  values (
    v_code,
    p_user_id,
    coalesce(nullif(trim(p_user_name), ''), 'Learner'),
    v_week_start,
    v_week_end
  )
  returning id into v_race_id;

  insert into public.friend_race_members (
    race_id,
    user_id,
    user_name,
    user_avatar,
    period_start
  )
  values (
    v_race_id,
    p_user_id,
    coalesce(nullif(trim(p_user_name), ''), 'Learner'),
    coalesce(nullif(trim(p_user_avatar), ''), '🦉'),
    v_week_start
  );

  return public.get_friend_race_state(p_user_id);
end;
$$;

create or replace function public.join_friend_race(
  p_race_code text,
  p_user_id text,
  p_user_name text,
  p_user_avatar text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_week_start timestamptz;
  v_race public.friend_races%rowtype;
  v_existing_race uuid;
  v_count integer;
begin
  if p_user_id is null or trim(p_user_id) = '' then
    raise exception 'User is required';
  end if;

  select period_start
    into v_week_start
  from public.get_ranking_period_bounds('weekly', now(), false);

  select fr.*
    into v_race
  from public.friend_races fr
  where upper(fr.race_code) = upper(trim(p_race_code))
    and fr.period_start = v_week_start
    and fr.period_end > now()
  limit 1;

  if v_race.id is null then
    raise exception 'This friend race is not active';
  end if;

  select frm.race_id
    into v_existing_race
  from public.friend_race_members frm
  where frm.user_id = p_user_id
    and frm.period_start = v_week_start
  limit 1;

  if v_existing_race is not null and v_existing_race <> v_race.id then
    raise exception 'You are already in another friend race this week';
  end if;

  if v_existing_race = v_race.id then
    return public.get_friend_race_state(p_user_id);
  end if;

  select count(*)
    into v_count
  from public.friend_race_members
  where race_id = v_race.id;

  if v_count >= 30 then
    raise exception 'This friend race is full';
  end if;

  insert into public.friend_race_members (
    race_id,
    user_id,
    user_name,
    user_avatar,
    period_start
  )
  values (
    v_race.id,
    p_user_id,
    coalesce(nullif(trim(p_user_name), ''), 'Learner'),
    coalesce(nullif(trim(p_user_avatar), ''), '🦉'),
    v_week_start
  );

  return public.get_friend_race_state(p_user_id);
end;
$$;

grant execute on function public.get_friend_race_state(text) to anon, authenticated;
grant execute on function public.create_friend_race(text, text, text) to anon, authenticated;
grant execute on function public.join_friend_race(text, text, text, text) to anon, authenticated;
