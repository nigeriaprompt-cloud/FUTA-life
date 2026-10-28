-- 22_building_counts.sql — REAL number of players inside each building, for the map labels and the Campus search.
-- Run AFTER 01_schema.sql and 21_online.sql. Safe to re-run.
-- COUNTS ONLY: it returns { "<buildingId>": n } for buildings with at least one player. No names, no user ids.
--   • "inside" = the player pinged online in the last 3 minutes (online_pings) AND player_stats.building is set (enter_building) and not cleared (leave_building).
--   • A player who closes the tab without pressing Leave drops out of the count after 3 minutes.
-- Buildings nobody is in are simply absent, so the map shows nothing for them.

-- entering a building counts as "online right now" immediately (otherwise the first ping can be up to a minute late)
create or replace function private.touch_on_enter() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.online_pings as o (user_id, at) values (new.id, now())
  on conflict (user_id) do update set at = now();
  return new;
end $$;

drop trigger if exists player_stats_touch_on_enter on public.player_stats;
create trigger player_stats_touch_on_enter
  after update of building on public.player_stats
  for each row when (new.building is not null)
  execute function private.touch_on_enter();

create or replace function public.building_counts() returns jsonb
language sql stable security definer set search_path = '' as $$
  select coalesce(jsonb_object_agg(building, n), '{}'::jsonb)
  from (
    select s.building, count(*)::int as n
    from public.online_pings o
    join public.player_stats s on s.id = o.user_id
    where o.at > now() - interval '3 minutes' and s.building is not null
    group by s.building
  ) t
$$;

revoke execute on function public.building_counts() from public;
grant  execute on function public.building_counts() to anon, authenticated;
