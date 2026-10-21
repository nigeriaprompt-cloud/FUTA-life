-- LOCAL TEST for 11_campus.sql ("Where do you belong?"). Run by run.sh after test_chat.sql. Throwaway Postgres only.
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
  a uuid := '00000000-0000-0000-0000-0000000000ca'; r jsonb;
begin
  insert into auth.users (id, email) values (a, 'campus@x.com');
  update public.profiles set username = 'cam_' || right(id::text, 2) where id = a;

  perform pg_temp.as_anon();
  perform pg_temp.fails($q$select public.set_campus('student', 'seet', null, '300')$q$, 'permission denied', 'anon cannot set a campus');

  perform pg_temp.as_user(a);
  r := public.set_campus('student', 'seet', 'mechanical_engineering', '300');
  perform pg_temp.ok(r -> 'campus' ->> 'status' = 'student' and r -> 'campus' ->> 'school' = 'seet' and r -> 'campus' ->> 'dept' = 'mechanical_engineering' and r -> 'campus' ->> 'level' = '300', 'a student saves school, department and level (and get_me returns it)');
  perform pg_temp.fails($q$select public.set_campus('wizard', 'seet', null, null)$q$, 'bad_status', 'an unknown status is rejected');
  perform pg_temp.fails($q$select public.set_campus('student', null, null, '300')$q$, 'school_required', 'a student must choose a school');
  perform pg_temp.fails($q$select public.set_campus('student', 'hogwarts', null, '300')$q$, 'bad_school', 'an unknown school is rejected');
  perform pg_temp.fails($q$select public.set_campus('student', 'seet', 'cyber_security', '300')$q$, 'bad_dept', 'a department from another school is rejected');
  perform pg_temp.fails($q$select public.set_campus('student', 'seet', null, null)$q$, 'extra_required', 'a student must give a level');
  perform pg_temp.fails($q$select public.set_campus('student', 'seet', null, '900')$q$, 'bad_extra', 'a made-up level is rejected');
  perform pg_temp.fails($q$select public.set_campus('graduate', 'soc', null, '2010')$q$, 'bad_extra', 'a graduate year outside 2024-2026 is rejected');
  perform pg_temp.fails($q$select public.set_campus('student', 'seet', null, '<b>3</b>')$q$, 'bad_extra', 'typed text is never stored');

  r := public.set_campus('corper', 'soc', 'cyber_security', '2026');
  perform pg_temp.ok((r -> 'campus' ->> 'year')::int = 2026 and r -> 'campus' ->> 'status' = 'corper' and not (r -> 'campus' ? 'level'), 'a corper saves a service year and the old level is gone');
  r := public.set_campus('alumni', 'saat', null, '1999');
  perform pg_temp.ok((r -> 'campus' ->> 'year')::int = 1999, 'an alumnus can pick an older year');
  r := public.set_campus('aspirant', null, null, 'utme');
  perform pg_temp.ok(r -> 'campus' ->> 'exam' = 'utme' and not (r -> 'campus' ? 'school'), 'an aspirant may skip the school');
  r := public.set_campus('akure', 'seet', null, 'alagbaka');
  perform pg_temp.ok(not (r -> 'campus' ? 'school') and r -> 'campus' ->> 'area' = 'alagbaka', 'an Akure resident never gets a school, only an area');
  r := public.set_campus('outsider', null, null, null);
  perform pg_temp.ok(r -> 'campus' = '{"status":"outsider"}'::jsonb, 'an outsider is just a status');
end $$;
