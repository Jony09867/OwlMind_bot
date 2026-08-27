drop function if exists public.sync_user_gamification_state(
  text, bigint, integer, integer, integer, integer, date, integer, date, date
);

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
security definer
set search_path = public
as $$
begin
  if p_user_id is null or trim(p_user_id) = '' then
    return;
  end if;

  insert into public.users (
    id,
    xp,
    coins,
    total_tasks_done,
    current_streak,
    longest_streak,
    last_study_date,
    streak_freezes,
    last_daily_goal_reward_date,
    last_streak_reward_date,
    level,
    gamification_updated_at,
    updated_at
  )
  values (
    p_user_id,
    greatest(coalesce(p_xp, 0), 0),
    greatest(coalesce(p_coins, 0), 0),
    greatest(coalesce(p_total_tasks_done, 0), 0),
    greatest(coalesce(p_current_streak, 0), 0),
    greatest(coalesce(p_longest_streak, 0), 0),
    p_last_study_date,
    greatest(coalesce(p_streak_freezes, 0), 0),
    p_last_daily_goal_reward_date,
    p_last_streak_reward_date,
    greatest(coalesce(p_level, 1), 1),
    now(),
    now()
  )
  on conflict (id) do update
  set xp = greatest(public.users.xp, excluded.xp),
      coins = greatest(public.users.coins, excluded.coins),
      total_tasks_done = greatest(public.users.total_tasks_done, excluded.total_tasks_done),
      longest_streak = greatest(public.users.longest_streak, excluded.longest_streak),
      level = greatest(public.users.level, excluded.level),
      current_streak = case
        when public.users.last_study_date is null and excluded.last_study_date is not null
          then excluded.current_streak
        when excluded.last_study_date is null
          then public.users.current_streak
        when excluded.last_study_date > public.users.last_study_date
          then excluded.current_streak
        when excluded.last_study_date = public.users.last_study_date
          then greatest(public.users.current_streak, excluded.current_streak)
        else public.users.current_streak
      end,
      streak_freezes = case
        when public.users.last_study_date is null and excluded.last_study_date is not null
          then excluded.streak_freezes
        when excluded.last_study_date is not null
             and (public.users.last_study_date is null or excluded.last_study_date > public.users.last_study_date)
          then excluded.streak_freezes
        else public.users.streak_freezes
      end,
      last_study_date = case
        when public.users.last_study_date is null then excluded.last_study_date
        when excluded.last_study_date is null then public.users.last_study_date
        else greatest(public.users.last_study_date, excluded.last_study_date)
      end,
      last_daily_goal_reward_date = case
        when public.users.last_daily_goal_reward_date is null then excluded.last_daily_goal_reward_date
        when excluded.last_daily_goal_reward_date is null then public.users.last_daily_goal_reward_date
        else greatest(public.users.last_daily_goal_reward_date, excluded.last_daily_goal_reward_date)
      end,
      last_streak_reward_date = case
        when public.users.last_streak_reward_date is null then excluded.last_streak_reward_date
        when excluded.last_streak_reward_date is null then public.users.last_streak_reward_date
        else greatest(public.users.last_streak_reward_date, excluded.last_streak_reward_date)
      end,
      gamification_updated_at = now(),
      updated_at = now();
end;
$$;

grant execute on function public.sync_user_gamification_state(
  text, bigint, integer, integer, integer, integer, date, integer, date, date, integer
) to anon, authenticated;
