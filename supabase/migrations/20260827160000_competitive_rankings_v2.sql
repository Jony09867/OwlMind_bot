drop function if exists public.get_period_rankings(timestamptz, timestamptz);

create or replace function public.get_ranking_period_bounds(
  p_scope text,
  p_reference timestamptz default now(),
  p_previous boolean default false
)
returns table (
  period_start timestamptz,
  period_end timestamptz
)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_tz constant text := 'Asia/Tashkent';
  v_local timestamp;
  v_start_local timestamp;
  v_end_local timestamp;
begin
  if p_scope not in ('daily', 'weekly', 'monthly', 'seasonal') then
    return;
  end if;

  v_local := p_reference at time zone v_tz;

  if p_scope = 'daily' then
    v_start_local := date_trunc('day', v_local);
    v_end_local := v_start_local + interval '1 day';
    if p_previous then
      v_end_local := v_start_local;
      v_start_local := v_start_local - interval '1 day';
    end if;
  elsif p_scope = 'weekly' then
    v_start_local := date_trunc('week', v_local);
    v_end_local := v_start_local + interval '1 week';
    if p_previous then
      v_end_local := v_start_local;
      v_start_local := v_start_local - interval '1 week';
    end if;
  elsif p_scope = 'monthly' then
    v_start_local := date_trunc('month', v_local);
    v_end_local := v_start_local + interval '1 month';
    if p_previous then
      v_end_local := v_start_local;
      v_start_local := v_start_local - interval '1 month';
    end if;
  else
    v_start_local := date_trunc('quarter', v_local);
    v_end_local := v_start_local + interval '3 months';
    if p_previous then
      v_end_local := v_start_local;
      v_start_local := v_start_local - interval '3 months';
    end if;
  end if;

  period_start := v_start_local at time zone v_tz;
  period_end := v_end_local at time zone v_tz;
  return next;
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
security definer
set search_path = public
as $$
declare
  v_scope text := lower(trim(coalesce(p_scope, '')));
  v_top_limit integer := greatest(3, least(coalesce(p_top_limit, 10), 100));
  v_radius integer := greatest(0, least(coalesce(p_neighbor_radius, 2), 10));
  v_start timestamptz;
  v_end timestamptz;
  v_prev_start timestamptz;
  v_prev_end timestamptz;
  v_participants integer := 0;
  v_user_rank integer;
  v_user_study bigint := 0;
  v_user_sessions integer := 0;
  v_gap bigint;
  v_leader_study bigint := 0;
  v_rows jsonb := '[]'::jsonb;
  v_previous_winner jsonb;
begin
  if v_scope not in ('daily', 'weekly', 'monthly', 'seasonal', 'global') then
    raise exception 'Unsupported ranking scope: %', v_scope;
  end if;

  if v_scope <> 'global' then
    select period_start, period_end
      into v_start, v_end
    from public.get_ranking_period_bounds(v_scope, now(), false);

    select period_start, period_end
      into v_prev_start, v_prev_end
    from public.get_ranking_period_bounds(v_scope, now(), true);
  end if;

  with aggregated as (
    select
      fs.user_id,
      sum(fs.duration_sec)::bigint as study_sec,
      count(*)::integer as sessions,
      max(fs.ended_at) as last_session_at
    from public.focus_sessions fs
    where fs.duration_sec >= 300
      and (
        v_scope = 'global'
        or (fs.started_at >= v_start and fs.started_at < v_end)
      )
    group by fs.user_id
  ),
  ranked as (
    select
      a.*,
      dense_rank() over (order by a.study_sec desc)::integer as rank
    from aggregated a
  ),
  me as (
    select rank, study_sec, sessions
    from ranked
    where user_id = p_user_id
    limit 1
  ),
  selected as (
    select r.*
    from ranked r
    where r.rank <= v_top_limit
       or exists (
         select 1
         from me
         where r.rank between greatest(me.rank - v_radius, 1) and me.rank + v_radius
       )
  ),
  enriched as (
    select
      s.rank,
      s.user_id,
      coalesce(nullif(u.first_name, ''), nullif(u.username, ''), 'Learner') as user_name,
      u.photo_url,
      s.study_sec,
      s.sessions,
      greatest(coalesce(u.level, 1), 1) as level,
      (s.user_id = p_user_id) as is_you,
      s.last_session_at
    from selected s
    left join public.users u on u.id = s.user_id
    order by s.rank asc, s.study_sec desc, s.sessions desc, s.last_session_at asc, s.user_id asc
  )
  select
    (select count(*) from aggregated),
    (select rank from me),
    coalesce((select study_sec from me), 0),
    coalesce((select sessions from me), 0),
    coalesce((select max(study_sec) from aggregated), 0),
    coalesce(
      (
        select jsonb_agg(
          jsonb_build_object(
            'rank', e.rank,
            'user_id', e.user_id,
            'user_name', e.user_name,
            'photo_url', e.photo_url,
            'study_sec', e.study_sec,
            'sessions', e.sessions,
            'level', e.level,
            'is_you', e.is_you
          )
          order by e.rank asc, e.study_sec desc, e.sessions desc, e.last_session_at asc, e.user_id asc
        )
        from enriched e
      ),
      '[]'::jsonb
    )
  into
    v_participants,
    v_user_rank,
    v_user_study,
    v_user_sessions,
    v_leader_study,
    v_rows;

  if v_user_rank is not null and v_user_rank > 1 then
    with aggregated as (
      select
        fs.user_id,
        sum(fs.duration_sec)::bigint as study_sec
      from public.focus_sessions fs
      where fs.duration_sec >= 300
        and (
          v_scope = 'global'
          or (fs.started_at >= v_start and fs.started_at < v_end)
        )
      group by fs.user_id
    )
    select min(a.study_sec - v_user_study)
      into v_gap
    from aggregated a
    where a.study_sec > v_user_study;
  else
    v_gap := 0;
  end if;

  if v_scope <> 'global' then
    with previous_aggregated as (
      select
        fs.user_id,
        sum(fs.duration_sec)::bigint as study_sec,
        count(*)::integer as sessions,
        max(fs.ended_at) as last_session_at
      from public.focus_sessions fs
      where fs.duration_sec >= 300
        and fs.started_at >= v_prev_start
        and fs.started_at < v_prev_end
      group by fs.user_id
    ),
    previous_winner as (
      select
        pa.user_id,
        pa.study_sec,
        pa.sessions,
        coalesce(nullif(u.first_name, ''), nullif(u.username, ''), 'Learner') as user_name,
        u.photo_url
      from previous_aggregated pa
      left join public.users u on u.id = pa.user_id
      order by pa.study_sec desc, pa.sessions desc, pa.last_session_at asc, pa.user_id asc
      limit 1
    )
    select jsonb_build_object(
      'user_id', pw.user_id,
      'user_name', pw.user_name,
      'photo_url', pw.photo_url,
      'study_sec', pw.study_sec,
      'sessions', pw.sessions,
      'period_start', v_prev_start,
      'period_end', v_prev_end
    )
    into v_previous_winner
    from previous_winner pw;
  end if;

  return jsonb_build_object(
    'scope', v_scope,
    'period_start', v_start,
    'period_end', v_end,
    'participant_count', v_participants,
    'user_rank', v_user_rank,
    'user_study_sec', v_user_study,
    'user_sessions', v_user_sessions,
    'gap_to_next_sec', coalesce(v_gap, 0),
    'leader_study_sec', v_leader_study,
    'entries', v_rows,
    'previous_winner', v_previous_winner,
    'minimum_session_sec', 300,
    'ranking_timezone', 'Asia/Tashkent'
  );
end;
$$;

grant execute on function public.get_ranking_period_bounds(text, timestamptz, boolean) to anon, authenticated;
grant execute on function public.get_competitive_rankings(text, text, integer, integer) to anon, authenticated;
