-- LOCAL TEST for 12_profile.sql. Run by run.sh after 12_profile.sql. Throwaway Postgres only.
create or replace function pg_temp.as_user(u uuid) returns void language plpgsql as $$
begin perform set_config('request.jwt.claim.sub', coalesce(u::text, ''), true); execute 'set local role authenticated'; end $$;
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
  a uuid := '00000000-0000-0000-0000-0000000000b1'; b uuid := '00000000-0000-0000-0000-0000000000b2'; t uuid := '00000000-0000-0000-0000-0000000000b3';
  x uuid := '00000000-0000-0000-0000-0000000000b4'; r jsonb; txt text;
begin
  insert into auth.users (id, email) values (a, 'pa@x.com'), (b, 'pb@x.com'), (t, 'pt@x.com'), (x, 'px@x.com');
  update public.profiles set username = case id when a then 'prof_ada' when b then 'prof_bob' when t then 'prof_teen' else null end,
    avatar_json = case id when a then '{"body":{"frame":"f"},"wear":{"top":{"id":"blouse","c":3}}}'::jsonb when b then '{"body":{"frame":"m"}}'::jsonb else '{"body":{"frame":"m"}}'::jsonb end where id in (a, b, t, x);
  update public.private_profiles set onboarded = true, dob = '1990-05-05', life_start = 'hustler' where id in (a, b);
  update public.private_profiles set onboarded = true, is_teen = true, dob = (current_date - interval '15 years')::date where id = t;
  insert into public.property_owned (user_id, prop_id, price_paid) values (b, 'l1_room', 500000), (b, 'l2_flat', 2500000);
  insert into public.car_owned (user_id, car_id, price_paid) select b, id, price from public.car_catalog where id = 'c1_okada';
  insert into public.acc_owned (user_id, item_id, price_paid) select b, id, price from public.acc_catalog where id = 'a1_watch';
  update public.wallets set pocket = 123456, bank = 654321 where id = b;

  perform pg_temp.as_user(a);
  r := public.get_profile(b);
  perform pg_temp.ok(r ->> 'username' = 'prof_bob' and r ->> 'gender' = 'male', 'A sees B: name + gender');
  perform pg_temp.ok(jsonb_array_length(r -> 'properties') = 2 and (r -> 'properties' -> 0 ->> 'level')::int = 2, 'properties listed, highest level first');
  perform pg_temp.ok(jsonb_array_length(r -> 'cars') = 1 and jsonb_array_length(r -> 'accessories') = 1, 'cars and accessories listed');
  perform pg_temp.ok(r ->> 'relation' = 'none' and (r ->> 'me')::boolean = false, 'relation none, me false');
  txt := r::text;
  perform pg_temp.ok(txt not like '%123456%' and txt not like '%654321%' and txt not like '%500000%' and txt not like '%dob%' and txt not like '%email%' and txt not like '%1990%', 'no money, prices, age or email in the profile');
  perform pg_temp.ok(public.get_profile(a) ->> 'gender' = 'female' and (public.get_profile(a) ->> 'me')::boolean, 'own profile works (female, me)');
  perform pg_temp.ok(public.get_profile(a) ->> 'start' = 'hustler', 'life start shown');
  perform pg_temp.as_user(a); perform public.set_campus('student', 'seet', 'mechanical_engineering', '300'); perform pg_temp.as_user(b);
  r := public.get_profile(a);
  perform pg_temp.ok(r #>> '{campus,status}' = 'student' and r #>> '{campus,school}' = 'seet' and r #>> '{campus,level}' = '300', 'school & status shown on the profile');
  perform pg_temp.ok(public.get_profile(b) -> 'campus' = 'null'::jsonb, 'no campus yet gives null');
  perform pg_temp.as_user(a);
  perform pg_temp.fails(format('select public.get_profile(%L)', t), 'not_found', 'adult cannot open a teen profile');
  perform pg_temp.fails(format('select public.get_profile(%L)', x), 'not_found', 'unfinished sign-up (no username) is not found');
  perform pg_temp.fails($q$select public.get_profile('00000000-0000-0000-0000-0000000000aa')$q$, 'not_found', 'unknown id is not found');
  perform public.send_wave(b); r := public.get_profile(b);
  perform pg_temp.ok(r ->> 'relation' = 'waved', 'relation waved after A waves');
  perform public.block_user(b);
  perform pg_temp.fails(format('select public.get_profile(%L)', b), 'not_found', 'blocked pair cannot see each other');
  reset role; perform pg_temp.as_user(b);
  perform pg_temp.fails(format('select public.get_profile(%L)', a), 'not_found', 'and the other way round');
  reset role; set local role anon;
  perform pg_temp.fails(format('select public.get_profile(%L)', a), 'permission denied', 'signed-out visitors cannot call it');
  reset role;
  raise notice 'ALL PROFILE CHECKS PASSED';
end $$;
