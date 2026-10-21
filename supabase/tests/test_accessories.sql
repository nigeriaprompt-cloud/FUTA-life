-- LOCAL TEST for 08_accessories.sql. Run by run.sh after test_feed.sql. Throwaway Postgres only.
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
  a uuid := '00000000-0000-0000-0000-0000000000a1'; r jsonb;
begin
  insert into auth.users (id, email) values (a, 'acc@x.com');
  update public.profiles set username = 'acc_' || right(id::text, 2) where id = a;
  update public.private_profiles set onboarded = true, dob = '2000-01-01' where id = a;
  update public.wallets set pocket = 100000, bank = 2000000 where id = a;

  -- access
  perform pg_temp.as_anon();
  perform pg_temp.fails($q$select public.buy_accessory('a1_watch', 'pocket')$q$, 'permission denied', 'anon cannot buy');
  perform pg_temp.fails($q$select * from public.acc_catalog$q$, 'permission denied', 'anon cannot read the catalog');
  reset role;
  perform pg_temp.as_user(a);
  perform pg_temp.ok((select count(*) from public.acc_catalog) = 20, 'catalog has 20 items');
  perform pg_temp.fails($q$insert into public.acc_owned (user_id, item_id, price_paid) values (auth.uid(), 'a5_watch', 1)$q$, 'permission denied', 'no direct insert into acc_owned');
  perform pg_temp.fails($q$update public.acc_catalog set price = 50000 where id = 'a5_watch'$q$, 'permission denied', 'client cannot change prices');
  perform pg_temp.fails($q$select public.buy_accessory('nope', 'pocket')$q$, 'no_such_item', 'unknown item refused');
  perform pg_temp.fails($q$select public.buy_accessory('a1_watch', 'cash')$q$, 'bad_source', 'bad payment source refused');

  -- buying + level locks
  perform pg_temp.fails($q$select public.buy_accessory('a2_watch', 'bank')$q$, 'level_locked', 'level 2 locked until you own a level 1 piece');
  r := public.buy_accessory('a1_watch', 'pocket');
  perform pg_temp.ok((r->>'pocket')::bigint = 50000 and (r->>'bank')::bigint = 2000000, 'paid 50,000 from pocket, bank untouched');
  perform pg_temp.fails($q$select public.buy_accessory('a1_watch', 'pocket')$q$, 'already_owned', 'cannot buy the same item twice');
  perform pg_temp.fails($q$select public.buy_accessory('a1_bag', 'pocket')$q$, 'not_enough_money', 'pocket too low for 65,000');
  perform pg_temp.fails($q$select public.buy_accessory('a3_watch', 'bank')$q$, 'level_locked', 'level 3 still locked (own level 1 only)');
  r := public.buy_accessory('a2_watch', 'bank');
  perform pg_temp.ok((r->>'bank')::bigint = 1750000 and (r->>'level')::int = 2, 'level 2 unlocked, paid 250,000 from bank');
  perform pg_temp.ok((select count(*) from public.ledger where user_id = a and kind = 'accessory_buy') = 2, 'two ledger rows accessory_buy');
  perform pg_temp.ok((select sum(d_pocket + d_bank) from public.ledger where user_id = a and kind = 'accessory_buy') = -300000, 'ledger shows -300,000 spent');
  perform pg_temp.ok((select count(*) from public.acc_owned) = 2, 'only my own rows are visible');
  reset role;
  raise notice 'ALL ACCESSORIES TESTS PASSED';
end $$;
