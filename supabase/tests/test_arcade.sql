-- LOCAL TEST for 19_arcade.sql. Throwaway Postgres only.
-- LOCAL TEST for 18_global_chat.sql. Throwaway Postgres only.
create or replace function pg_temp.as_user(u uuid) returns void language plpgsql as $$
begin perform set_config('request.jwt.claim.sub', coalesce(u::text, ''), true); execute 'set local role authenticated'; end $$;
create or replace function pg_temp.ok(c boolean, msg text) returns void language plpgsql as $$
begin if c is not true then raise exception 'FAIL: %', msg; end if; raise notice 'ok  - %', msg; end $$;
grant execute on all functions in schema pg_temp to public;

do $$
declare
  a uuid := '00000000-0000-0000-0000-00000000ac01'; b uuid := '00000000-0000-0000-0000-00000000ac02'; r jsonb; rid uuid; ok boolean;
begin
  insert into auth.users (id, email) values (a, 'aa@x.com'), (b, 'ab@x.com');
  update public.private_profiles set onboarded = true, dob = '1990-01-01', is_teen = false where id in (a, b);
  update public.profiles set username = case id when a then 'ar_ann' else 'ar_ben' end where id in (a, b);
  perform pg_temp.as_user(a);
  r := public.arcade_start(); rid := (r ->> 'run')::uuid;
  perform pg_temp.ok(rid is not null and (r ->> 'cap')::int = 3000, 'a run starts and shows the daily cap');
  ok := false; begin perform public.arcade_start(); exception when others then ok := sqlerrm like '%slow_down%'; end;
  perform pg_temp.ok(ok, 'runs must be 5 seconds apart');
  r := public.arcade_finish(rid, 500);
  perform pg_temp.ok((r ->> 'paid')::int = 0, 'finishing instantly pays nothing (needs 8 seconds on the server clock)');
  ok := false; begin perform public.arcade_finish(rid, 500); exception when others then ok := sqlerrm like '%already_paid%'; end;
  perform pg_temp.ok(ok, 'a run cannot be closed twice');

  reset role; update public.arcade_runs set started_at = started_at - interval '1 hour'; perform pg_temp.as_user(a);
  r := public.arcade_start(); rid := (r ->> 'run')::uuid;
  reset role; update public.arcade_runs set started_at = now() - interval '60 seconds' where id = rid; perform pg_temp.as_user(a);
  r := public.arcade_finish(rid, 540);
  perform pg_temp.ok((r ->> 'paid')::int = 540 and (r ->> 'best')::int = 540 and (r ->> 'new_best')::boolean, 'a real 60 s run of 540 points pays ₦540 and sets a best');
  reset role;
  perform pg_temp.ok((select pocket from public.wallets where id = a) = 540 and (select count(*) from public.ledger where user_id = a and kind = 'arcade') = 1, 'the money went to the POCKET with a ledger line');

  update public.arcade_runs set started_at = started_at - interval '1 hour'; perform pg_temp.as_user(a);
  r := public.arcade_start(); rid := (r ->> 'run')::uuid;
  reset role; update public.arcade_runs set started_at = now() - interval '20 seconds' where id = rid; perform pg_temp.as_user(a);
  r := public.arcade_finish(rid, 999999);
  perform pg_temp.ok((r ->> 'score')::int = 380 and (r ->> 'clamped')::boolean and (r ->> 'paid')::int = 380 and (r ->> 'best')::int = 540, 'an impossible score is clamped to what the elapsed time allows (20 s -> 380)');

  reset role; update public.arcade_runs set started_at = started_at - interval '1 hour'; perform pg_temp.as_user(a);
  rid := (public.arcade_start() ->> 'run')::uuid; perform pg_temp.as_user(b);
  ok := false; begin perform public.arcade_finish(rid, 10); exception when others then ok := sqlerrm like '%not_found%'; end;
  perform pg_temp.ok(ok, 'only the owner can close a run');

  -- daily cap: pretend 2,800 was already paid today, then a 540 run only pays the last 100 (after the 540+380 = 920 above -> set total 2,800)
  reset role; update public.arcade_runs set paid = 0 where user_id = a; update public.arcade_runs set paid = 2800 where id = (select id from public.arcade_runs where user_id = a and finished_at is not null limit 1);
  update public.arcade_runs set started_at = started_at - interval '1 hour'; perform pg_temp.as_user(a);
  r := public.arcade_start(); rid := (r ->> 'run')::uuid; perform pg_temp.ok((r ->> 'left')::int = 200, 'status: 200 left today');
  reset role; update public.arcade_runs set started_at = now() - interval '60 seconds' where id = rid; perform pg_temp.as_user(a);
  r := public.arcade_finish(rid, 540); perform pg_temp.ok((r ->> 'paid')::int = 200 and (r ->> 'left')::int = 0, 'the daily cap limits the payout (₦200 of ₦540)');
  reset role; update public.arcade_runs set started_at = started_at - interval '1 hour'; perform pg_temp.as_user(a);
  rid := (public.arcade_start() ->> 'run')::uuid; reset role; update public.arcade_runs set started_at = now() - interval '60 seconds' where id = rid; perform pg_temp.as_user(a);
  perform pg_temp.ok((public.arcade_finish(rid, 540) ->> 'paid')::int = 0, 'once the cap is reached a run pays nothing');

  -- leaderboard + no direct table access
  perform pg_temp.as_user(b); perform pg_temp.ok((select count(*) from public.arcade_board()) = 1 and (select username from public.arcade_board() limit 1) = 'ar_ann', 'the leaderboard lists best scores');
  ok := false; begin perform count(*) from public.arcade_runs; exception when others then ok := true; end; perform pg_temp.ok(ok, 'runs table is not readable from the app');
  -- jail
  reset role; update public.arcade_runs set started_at = started_at - interval '1 hour';
end $$;
