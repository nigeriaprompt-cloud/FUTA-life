-- 21_online.sql — "who is online" for the map pill and the phone home screen.  Run AFTER 01_schema.sql (and after 18_*). Safe to re-run.
-- COUNTS ONLY. Nobody's name or exact place is ever returned:
--   • touch_online()  — a signed-in player's open game pings this about once a minute ("I am here"). The server ignores pings faster than every 40 s.
--   • online_now()    — anyone (even a guest who is not signed in) may read: how many players pinged in the last 3 minutes, how many of them are
--                       inside a building right now, and the busiest buildings — but only buildings with 2 or more players (so one person can never be spotted).
-- Why a table and not Realtime presence? Presence only knows the players in the SAME zone/room; this gives one number for the whole campus.
-- Limits to keep it fast: one row per player (upsert), index on the time, no history kept.

create table if not exists public.online_pings (
  user_id uuid primary key references auth.users(id) on delete cascade,
  at timestamptz not null default now()
);
create index if not exists online_pings_at on public.online_pings (at);
alter table public.online_pings enable row level security;          -- no policies: the browser can never read or write this table directly
revoke all on public.online_pings from anon, authenticated;

create or replace function public.touch_online() returns void
language plpgsql security definer set search_path = '' as $$
declare u uuid := auth.uid();
begin
  if u is null then return; end if;
  insert into public.online_pings as o (user_id, at) values (u, now())
  on conflict (user_id) do update set at = now() where o.at < now() - interval '40 seconds';
end $$;

create or replace function public.online_now() returns jsonb
language sql stable security definer set search_path = '' as $$
  with o as (select user_id from public.online_pings where at > now() - interval '3 minutes'),
       b as (select s.building from public.player_stats s join o on o.user_id = s.id where s.building is not null),
       top as (select building, count(*) n from b group by building having count(*) >= 2 order by count(*) desc, building limit 3)
  select jsonb_build_object(
    'players', (select count(*) from o),
    'inside',  (select count(*) from b),
    'busiest', coalesce((select jsonb_agg(jsonb_build_object('b', building, 'n', n) order by n desc, building) from top), '[]'::jsonb)
  )
$$;

revoke execute on function public.touch_online() from public, anon;
grant  execute on function public.touch_online() to authenticated;
revoke execute on function public.online_now() from public;
grant  execute on function public.online_now() to anon, authenticated;
