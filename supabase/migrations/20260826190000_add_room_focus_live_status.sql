alter table public.room_participants
  add column if not exists focus_status text not null default 'idle',
  add column if not exists focus_type text,
  add column if not exists focus_started_at timestamptz,
  add column if not exists focus_elapsed_sec bigint not null default 0;

alter table public.room_participants
  drop constraint if exists room_participants_focus_status_check;
alter table public.room_participants
  add constraint room_participants_focus_status_check
  check (focus_status in ('idle', 'focusing', 'paused'));

alter table public.room_participants
  drop constraint if exists room_participants_focus_type_check;
alter table public.room_participants
  add constraint room_participants_focus_type_check
  check (focus_type is null or focus_type in ('pomodoro', 'stopwatch', 'deep'));

alter table public.room_participants
  drop constraint if exists room_participants_focus_elapsed_sec_check;
alter table public.room_participants
  add constraint room_participants_focus_elapsed_sec_check
  check (focus_elapsed_sec >= 0);
