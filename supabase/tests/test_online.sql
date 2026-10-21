-- LOCAL TEST for 21_online.sql. Run by run.sh after the other test files. Throwaway Postgres only.
create or replace function pg_temp.as_user(u uuid) returns void language plpgsql as $$
begin perform set_config('request.jwt.claim.sub', coalesce(u::text, ''), true); execute 'set local role authenticated'; end $$;
create or replace function pg_temp.as_anon() returns void language plpgsql as $$
begin perform set_config('request.jwt.claim.sub', '', true); execute 'set local role anon'; end $$;
create or replace function pg_temp.ok(c boolean, msg text) returns void language plpgsql as $$
begin if c is not true then raise exception 'FAIL: %', msg; end if; raise notice 'ok  - %', msg; end $$;
create or replace function pg_temp.fails(stmt text, frag text, msg text) returns void language plpgsql as $$
begin
  begin execute stmt; exception when others then
    if sqlerrm like '%' || frag || '%' then raise notice 'ok  - % (%)', msg, sqlerrm; return; end if;
    raise exception 'FAIL: % — wrong error: %', msg, sqlerrm;
  end;
  raise exception 'FAIL: % — no error raised', msg;
end $$;
grant execute on all functions in schema pg_temp to public;

do $$
declare
  a uuid := '00000000-0000-0000-0000-0000000000c1'; b uuid := '00000000-0000-0000-0000-0000000000c2'; c uuid := '00000000-0000-0000-0000-0000000000c3'; r jsonb; t1 timestamptz;
begin
  insert into auth.users (id, email) values (a, 'on1@x.com'), (b, 'on2@x.com'), (c, 'on3@x.com');

  -- nobody has pinged yet
  perform pg_temp.as_anon();
  r := public.online_now(); perform pg_temp.ok((r->>'players')::int = 0 and (r->>'inside')::int = 0 and r->'busiest' = '[]'::jsonb, 'guest can read counts, all zero at the start');
  perform pg_temp.fails($q$select public.touch_online()$q$, 'permission denied', 'a guest cannot ping');
  perform pg_temp.fails($q$select * from public.online_pings$q$, 'permission denied', 'a guest cannot read the ping table');
  reset role;

  perform pg_temp.as_user(a); perform public.touch_online();
  perform pg_temp.fails($q$select * from public.online_pings$q$, 'permission denied', 'a signed-in player cannot read the ping table either');
  perform pg_temp.fails($q$insert into public.online_pings (user_id) values (auth.uid())$q$, 'permission denied', 'a player cannot write the ping table directly');
  reset role;
  select at into t1 from public.online_pings where user_id = a;
  perform pg_temp.as_user(a); perform public.touch_online(); reset role;
  perform pg_temp.ok((select at from public.online_pings where user_id = a) = t1, 'a second ping within 40 s changes nothing (rate limit)');
  update public.online_pings set at = now() - interval '2 minutes' where user_id = a;
  perform pg_temp.as_user(a); perform public.touch_online(); reset role;
  perform pg_temp.ok((select at from public.online_pings where user_id = a) > now() - interval '5 seconds', 'a ping after 40 s refreshes the time');

  perform pg_temp.as_user(b); perform public.touch_online(); reset role;
  perform pg_temp.as_user(c); perform public.touch_online(); reset role;
  perform pg_temp.as_anon(); r := public.online_now(); reset role;
  perform pg_temp.ok((r->>'players')::int = 3 and (r->>'inside')::int = 0, 'three players online, none inside a building');

  -- inside buildings: two in the library, one in the bank; only the library (2+) is listed
  update public.player_stats set building = 'bld_library' where id in (a, b);
  update public.player_stats set building = 'bld_bank' where id = c;
  perform pg_temp.as_anon(); r := public.online_now(); reset role;
  perform pg_temp.ok((r->>'inside')::int = 3, 'three players inside buildings');
  perform pg_temp.ok(jsonb_array_length(r->'busiest') = 1 and r->'busiest'->0->>'b' = 'bld_library' and (r->'busiest'->0->>'n')::int = 2, 'busiest lists only buildings with 2+ players (the bank with 1 is hidden)');
  perform pg_temp.ok(r::text !~* 'on1@x|on2@x|on3@x|' || a::text, 'the answer contains no email or user id');

  -- old pings drop out after 3 minutes
  update public.online_pings set at = now() - interval '4 minutes' where user_id = b;
  perform pg_temp.as_anon(); r := public.online_now(); reset role;
  perform pg_temp.ok((r->>'players')::int = 2 and (r->>'inside')::int = 2 and r->'busiest' = '[]'::jsonb, 'a player who stopped pinging is no longer counted, and the library drops below 2');
  raise notice 'ALL ONLINE TESTS PASSED';
end $$;
