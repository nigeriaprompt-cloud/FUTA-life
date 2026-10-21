-- 11_account.sql — change username (phone Settings). Run in the Supabase SQL Editor AFTER 01_schema.sql. Safe to re-run.
-- Why a trigger: set_profile() (sign-up) can already rename a player. The rule "one rename per N days" lives in a trigger on profiles.username,
--   so EVERY path (change_username below, set_profile, any future RPC) obeys it, and re-running 01_schema.sql cannot remove it.
-- Rules:
--   • First name (sign-up, still not onboarded) is free and unlimited. After sign-up: one change per `account.username_cooldown_days` (default 30).
--   • Same format as sign-up: 3–20 lower-case letters, digits or _, not reserved, not taken (public.username_available).
--   • Every change is written to username_history (moderators can trace who used which name). Old chat lines / posts keep the name they were written with.
--   • Run by the SQL editor / moderator (no signed-in user) the cooldown is skipped, so you can still rename someone by hand.
-- Change the cooldown without code: insert into public.app_config(key,value) values ('account.username_cooldown_days','30') on conflict (key) do update set value = excluded.value;

create table if not exists public.username_history (
  id bigserial primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  old_name text not null,
  new_name text not null,
  changed_at timestamptz not null default now()
);
create index if not exists username_history_user_idx on public.username_history (user_id, changed_at desc);
alter table public.username_history enable row level security;          -- no client policy on purpose: only the server and you read it
revoke all on public.username_history from anon, authenticated;

create or replace function private.acct_cfg(p_key text, p_default bigint) returns bigint language sql stable as $$
  select coalesce((select (value #>> '{}')::bigint from public.app_config where key = 'account.' || p_key), p_default) $$;

-- the single place the rename rule is enforced
create or replace function private.username_guard() returns trigger
language plpgsql security definer set search_path = '' as $$
declare done boolean; last_at timestamptz; days int := private.acct_cfg('username_cooldown_days', 30);
begin
  select coalesce(onboarded, false) into done from public.private_profiles where id = new.id;
  if not coalesce(done, false) then return new; end if;                     -- still creating the character: free
  if auth.uid() is not null then                                            -- a signed-in player (not the SQL editor)
    select max(changed_at) into last_at from public.username_history where user_id = new.id;
    if last_at is not null and last_at + make_interval(days => days) > now() then
      raise exception 'username_cooldown:%', to_char((last_at + make_interval(days => days)) at time zone 'UTC', 'YYYY-MM-DD');
    end if;
  end if;
  insert into public.username_history (user_id, old_name, new_name) values (new.id, old.username, new.username);
  return new;
end $$;
drop trigger if exists username_guard on public.profiles;
create trigger username_guard before update of username on public.profiles
  for each row when (old.username is not null and new.username is distinct from old.username)
  execute function private.username_guard();

create or replace function public.get_username_status() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare u uuid := private.require_user(); days int := private.acct_cfg('username_cooldown_days', 30); last_at timestamptz; nxt timestamptz; name text;
begin
  select username into name from public.profiles where id = u;
  select max(changed_at) into last_at from public.username_history where user_id = u;
  nxt := case when last_at is null then null else last_at + make_interval(days => days) end;
  return jsonb_build_object('username', name, 'can_change', nxt is null or nxt <= now(), 'next_change_at', case when nxt > now() then nxt end, 'cooldown_days', days);
end $$;

create or replace function public.change_username(p_name text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare u uuid := private.require_user(); n text := lower(btrim(coalesce(p_name, ''))); cur text; done boolean; chk jsonb;
begin
  select p.username, coalesce(q.onboarded, false) into cur, done from public.profiles p join public.private_profiles q on q.id = p.id where p.id = u;
  if cur is null or not done then raise exception 'finish_sign_up'; end if;  -- before the character is finished, sign-up sets the name
  if n = cur then raise exception 'same_name'; end if;
  chk := public.username_available(n);
  if (chk ->> 'available')::boolean is not true then raise exception '%', chk ->> 'reason'; end if;
  begin
    update public.profiles set username = n where id = u;                  -- the trigger applies the cooldown and writes the history
  exception when unique_violation then raise exception 'That name is taken.'; end;
  return public.get_me();
end $$;

revoke execute on function public.get_username_status(), public.change_username(text) from public, anon;
grant execute on function public.get_username_status(), public.change_username(text) to authenticated;
