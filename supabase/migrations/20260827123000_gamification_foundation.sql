alter table public.users
  add column if not exists xp bigint not null default 0,
  add column if not exists coins integer not null default 50,
  add column if not exists total_tasks_done integer not null default 0,
  add column if not exists current_streak integer not null default 0,
  add column if not exists longest_streak integer not null default 0,
  add column if not exists last_study_date date,
  add column if not exists streak_freezes integer not null default 2,
  add column if not exists last_daily_goal_reward_date date,
  add column if not exists last_streak_reward_date date,
  add column if not exists gamification_updated_at timestamptz not null default now();

alter table public.users
  drop constraint if exists users_xp_nonnegative;
alter table public.users
  add constraint users_xp_nonnegative check (xp >= 0);

alter table public.users
  drop constraint if exists users_coins_nonnegative;
alter table public.users
  add constraint users_coins_nonnegative check (coins >= 0);

alter table public.users
  drop constraint if exists users_tasks_done_nonnegative;
alter table public.users
  add constraint users_tasks_done_nonnegative check (total_tasks_done >= 0);

alter table public.users
  drop constraint if exists users_streaks_nonnegative;
alter table public.users
  add constraint users_streaks_nonnegative check (
    current_streak >= 0 and longest_streak >= 0 and streak_freezes >= 0
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
  p_last_streak_reward_date date
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
    now(),
    now()
  )
  on conflict (id) do update
  set xp = greatest(public.users.xp, excluded.xp),
      coins = greatest(public.users.coins, excluded.coins),
      total_tasks_done = greatest(public.users.total_tasks_done, excluded.total_tasks_done),
      longest_streak = greatest(public.users.longest_streak, excluded.longest_streak),
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
  text, bigint, integer, integer, integer, integer, date, integer, date, date
) to anon, authenticated;
