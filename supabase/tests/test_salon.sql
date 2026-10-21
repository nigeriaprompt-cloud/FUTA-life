-- LOCAL TEST for 09_salon.sql (+ the hair guard in save_avatar). Run by run.sh after 09_salon.sql. Throwaway Postgres only.
create or replace function pg_temp.as_user(u uuid) returns void language plpgsql as $$
begin perform set_config('request.jwt.claim.sub', coalesce(u::text, ''), true); execute 'set local role authenticated'; end $$;
create or replace function pg_temp.as_anon() returns void language plpgsql as $$
begin perform set_config('request.jwt.claim.sub', '', true); execute 'set local role anon'; end $$;
create or replace function pg_temp.ok(c boolean, msg text) returns void language plpgsql as $$
begin if c is not true then raise exception 'FAIL: %', msg; end if; raise notice 'ok  - %', msg; end $$;
-- expects the statement to raise an error containing `frag`
create or replace function pg_temp.fails(stmt text, frag text, msg text) returns void language plpgsql as $$
begin
  begin execute stmt; exception when others then
    if sqlerrm like '%' || frag || '%' then raise notice 'ok  - % (%)', msg, sqlerrm; return; end if;
    raise exception 'FAIL: % — wrong error: %', msg, sqlerrm;
  end;
  raise exception 'FAIL: % — no error raised', msg;
end $$;

do $$
declare e uuid := '00000000-0000-0000-0000-0000000000e1'; f uuid := '00000000-0000-0000-0000-0000000000e2'; r jsonb; p0 bigint; p1 bigint; before_hash text;
begin
  insert into auth.users (id, email) values (e, 'e@x.com'), (f, 'f@x.com');

  -- ---- while creating the character, hair is free and unrestricted (onboarding)
  perform pg_temp.as_user(f); perform public.set_profile('newbie_f', date '2000-01-01');
  r := public.save_avatar('{"body":{"frame":"m"},"hair":{"style":"fade","color":2},"beard":"none"}');
  r := public.save_avatar('{"body":{"frame":"m"},"hair":{"style":"buzz","color":3},"beard":"full"}');
  perform pg_temp.ok(r #>> '{hair,style}' = 'buzz' and r ->> 'beard' = 'full', 'before onboarding: hair/beard change freely, no charge');
  reset role;

  -- ---- a finished player (onboarded, starter money)
  perform pg_temp.as_user(e); perform public.set_profile('salon_e', date '1999-01-01');
  perform public.save_avatar('{"body":{"frame":"m"},"hair":{"style":"fade","color":1},"beard":"none"}');
  perform public.save_life('hustler');
  perform public.enter_building('wema_bank_1', 'bank'); perform public.atm_withdraw(5000);
  perform pg_temp.ok((public.get_stats() #>> '{wallet,pocket}')::bigint >= 3000, 'player has enough pocket money for a haircut');

  -- ---- after onboarding, save_avatar can no longer change hair/beard for free, but outfits still save
  perform pg_temp.fails($q$select public.save_avatar('{"body":{"frame":"m"},"hair":{"style":"afro","color":1},"beard":"none"}')$q$, 'hair_requires_salon', 'hair change through save_avatar refused after onboarding');
  perform pg_temp.fails($q$select public.save_avatar('{"body":{"frame":"m"},"hair":{"style":"fade","color":1},"beard":"full"}')$q$, 'hair_requires_salon', 'beard change through save_avatar refused after onboarding');
  r := public.save_avatar('{"body":{"frame":"m"},"hair":{"style":"fade","color":1},"beard":"none","wear":{"top":{"id":"tee","c":4}}}');
  perform pg_temp.ok(r #>> '{wear,top,c}' = '4', 'outfit change (same hair) still saves for free');

  -- ---- salon: must be standing in a salon
  perform pg_temp.fails($q$select public.save_hair('{"hair":{"style":"afro","color":2},"beard":"none"}')$q$, 'wrong_place', 'hair cannot be changed outside a salon');
  perform public.enter_building('glam_salon_1', 'salon');
  perform pg_temp.fails($q$select public.save_hair('{"hair":{"style":"fade","color":1},"beard":"none"}')$q$, 'nothing_changed', 'same hair: refused, not charged');
  p0 := (public.get_stats() #>> '{wallet,pocket}')::bigint; before_hash := (select avatar_hash from public.profiles where id = e);
  r := public.save_hair('{"hair":{"style":"afro","color":2},"beard":"full","body":{"frame":"f"},"skin":0}');
  p1 := (public.get_stats() #>> '{wallet,pocket}')::bigint;
  perform pg_temp.ok(p0 - p1 = 3000, 'haircut takes exactly 3000 from the pocket (ledger)');
  perform pg_temp.ok(r #>> '{look,hair,style}' = 'afro' and (r #>> '{look,hair,color}')::int = 2 and r #>> '{look,beard}' = 'full', 'new hair and beard saved');
  perform pg_temp.ok(r #>> '{look,body,frame}' = 'm' and r #>> '{look,wear,top,c}' = '4', 'only hair/beard taken from the request: body, skin and clothes kept');
  perform pg_temp.ok((select avatar_hash from public.profiles where id = e) <> before_hash and (select avatar_hash from public.profiles where id = e) = md5((select avatar_json::text from public.profiles where id = e)), 'avatar_hash updated so other players refresh');
  perform pg_temp.ok((select count(*) from public.ledger where user_id = e and kind = 'activity' and ref = 'get_hair') = 1, 'one ledger row for the haircut');
  perform pg_temp.fails($q$select public.save_hair('{"hair":{"style":"twists","color":3},"beard":"none"}')$q$, 'cooldown', 'second haircut straight away: cooldown, not charged');
  perform pg_temp.ok((public.get_stats() #>> '{wallet,pocket}')::bigint = p1, 'cooldown did not charge');
  reset role;

  -- ---- broke player: refused and nothing saved
  update public.wallets set pocket = 100 where id = e; delete from public.activity_cooldowns where user_id = e;
  perform pg_temp.as_user(e);
  perform pg_temp.fails($q$select public.save_hair('{"hair":{"style":"twists","color":3},"beard":"none"}')$q$, 'insufficient_funds', 'not enough money: refused');
  perform pg_temp.ok((select avatar_json #>> '{hair,style}' from public.profiles where id = e) = 'afro', 'failed payment left the old hair in place (atomic)');
  reset role;

  -- ---- not callable by anonymous users
  perform pg_temp.as_anon();
  perform pg_temp.fails($q$select public.save_hair('{}'::jsonb)$q$, 'permission denied', 'anon cannot call save_hair');
  reset role;
  raise notice 'salon tests done';
end $$;
