-- Additive rollout step for Telegram-backed Supabase Auth.
-- Apply this before deploying the authenticated client. It does not change
-- existing RLS policies, RPC permissions, storage visibility, or UI behavior.

alter table public.users add column if not exists auth_user_id uuid;

create unique index if not exists users_auth_user_id_key
  on public.users(auth_user_id)
  where auth_user_id is not null;
