create or replace function public.get_period_rankings(
  p_start timestamptz,
  p_end timestamptz
)
returns table (
  user_id text,
  first_name text,
  username text,
  photo_url text,
  study_sec bigint,
  sessions integer,
  level integer
)
language sql
stable
security definer
set search_path = public
as $$
  select
    u.id as user_id,
    u.first_name,
    u.username,
    u.photo_url,
    coalesce(sum(fs.duration_sec), 0)::bigint as study_sec,
    count(fs.session_id)::integer as sessions,
    u.level
  from public.users u
  join public.focus_sessions fs
    on fs.user_id = u.id
   and fs.started_at >= p_start
   and fs.started_at < p_end
  where p_start is not null
    and p_end is not null
    and p_end > p_start
  group by u.id, u.first_name, u.username, u.photo_url, u.level
  order by study_sec desc, sessions desc, u.first_name asc;
$$;

grant execute on function public.get_period_rankings(timestamptz, timestamptz) to anon, authenticated;
