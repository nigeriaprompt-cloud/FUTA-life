-- LOCAL TEST for 18_celebrations.sql. Throwaway Postgres only. Run by run.sh after test_admin.sql.
create or replace function pg_temp.as_user(u uuid) returns void language plpgsql as $$
begin perform set_config('request.jwt.claim.sub', coalesce(u::text, ''), true); execute 'set local role authenticated'; end $$;
create or replace function pg_temp.as_anon() returns void language plpgsql as $$
begin perform set_config('request.jwt.claim.sub', '', true); execute 'set local role anon'; end $$;
create or replace function pg_temp.ok(c boolean, msg text) returns void language plpgsql as $$
begin if c is not true then raise exception 'FAIL: %', msg; end if; raise notice 'ok  - %', msg; end $$;
grant execute on all functions in schema pg_temp to public;

do $$
declare a uuid := '00000000-0000-0000-0000-0000000ce001'; r jsonb; i int; denied boolean;
begin
  insert into auth.users (id, email) values (a, 'cel@x.com');
  update public.profiles set username = 'cel_one' where id = a;
  perform private.admin_set_password('celebrate 2026');

  -- everybody (even signed out) can read, and it starts OFF
  perform pg_temp.as_anon(); r := public.get_celebration();
  perform pg_temp.ok((r ->> 'on')::boolean = false, 'signed-out visitors can read it, and it starts OFF');
  denied := false; begin perform public.admin_set_celebration('celebrate 2026', 'convocation', true); exception when others then denied := true; end;
  perform pg_temp.ok(denied, 'signed-out visitors cannot change it');
  denied := false; begin perform 1 from public.celebration; exception when others then denied := true; end;
  perform pg_temp.ok(denied, 'the table itself is not readable (only the function is)');

  -- a signed-in player without the password cannot switch it on
  perform pg_temp.as_user(a);
  r := public.admin_set_celebration('wrong', 'convocation', true);
  perform pg_temp.ok(r ->> 'error' = 'bad_password', 'wrong password is refused');
  perform pg_temp.ok((public.get_celebration() ->> 'on')::boolean = false, 'and nothing changed');

  -- the admin turns it on
  r := public.admin_set_celebration('celebrate 2026', 'convocation', true, '  Convocation 2026  ', 'Congratulations, graduates!', null, now() + interval '2 days');
  perform pg_temp.ok((r ->> 'ok')::boolean and (r -> 'celebration' ->> 'on')::boolean and r -> 'celebration' ->> 'title' = 'Convocation 2026', 'admin turns it ON; the title is trimmed');
  perform pg_temp.as_anon(); r := public.get_celebration();
  perform pg_temp.ok((r ->> 'on')::boolean and r ->> 'event' = 'convocation' and r ->> 'message' = 'Congratulations, graduates!', 'everyone now sees it ON');

  -- validation
  perform pg_temp.as_user(a);
  perform pg_temp.ok(public.admin_set_celebration('celebrate 2026', 'wizard', true) ->> 'error' = 'bad_event', 'an unknown occasion is refused');
  perform pg_temp.ok(public.admin_set_celebration('celebrate 2026', 'party', true, repeat('x', 61)) ->> 'error' = 'too_long', 'a 61-letter title is refused');
  perform pg_temp.ok(public.admin_set_celebration('celebrate 2026', 'party', true, null, repeat('x', 161)) ->> 'error' = 'too_long', 'a 161-letter message is refused');
  perform pg_temp.ok(public.admin_set_celebration('celebrate 2026', 'party', true, null, null, null, now() - interval '1 hour') ->> 'error' = 'bad_dates', 'turning ON with an end time in the past is refused');
  perform pg_temp.ok(public.admin_set_celebration('celebrate 2026', 'party', true, null, null, null, now() + interval '200 days') ->> 'error' = 'bad_dates', 'an end time more than 90 days away is refused');
  perform pg_temp.ok(public.admin_set_celebration('celebrate 2026', 'party', true, null, null, now() + interval '2 days', now() + interval '1 day') ->> 'error' = 'bad_dates', 'an end before the start is refused');
  r := public.admin_set_celebration('celebrate 2026', 'party', true, E'Fun\x01 time', null);
  perform pg_temp.ok(r -> 'celebration' ->> 'title' = 'Fun time' and r -> 'celebration' ->> 'message' is null, 'control characters are stripped; an empty message stays empty');

  -- it switches itself off when the end time passes, and waits for a start time
  reset role; update public.celebration set ends_at = now() - interval '1 minute' where id = 1;
  perform pg_temp.ok((public.get_celebration() ->> 'on')::boolean = false, 'it is OFF again once the end time has passed, even though is_on is still true');
  update public.celebration set ends_at = null, starts_at = now() + interval '1 hour' where id = 1;
  perform pg_temp.ok((public.get_celebration() ->> 'on')::boolean = false, 'a scheduled start in the future keeps it OFF for now');
  update public.celebration set starts_at = now() - interval '1 hour' where id = 1;
  perform pg_temp.ok((public.get_celebration() ->> 'on')::boolean, 'and it is ON once the start time arrives');

  -- turning off
  r := public.admin_set_celebration('celebrate 2026', 'party', false);
  perform pg_temp.ok((r ->> 'ok')::boolean and not (r -> 'celebration' ->> 'on')::boolean, 'admin turns it OFF');

  -- the shared lock-out: 5 wrong tries lock this player out of the switch too
  for i in 1..5 loop perform public.admin_set_celebration('nope', 'party', true); end loop;
  perform pg_temp.ok(public.admin_set_celebration('celebrate 2026', 'party', true) ->> 'error' = 'locked', 'after 5 wrong tries even the right password is locked out for 15 minutes');
end $$;
