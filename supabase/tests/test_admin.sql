-- LOCAL TEST for 17_admin_metrics.sql. Throwaway Postgres only.
create or replace function pg_temp.as_user(u uuid) returns void language plpgsql as $$
begin perform set_config('request.jwt.claim.sub', coalesce(u::text, ''), true); execute 'set local role authenticated'; end $$;
create or replace function pg_temp.ok(c boolean, msg text) returns void language plpgsql as $$
begin if c is not true then raise exception 'FAIL: %', msg; end if; raise notice 'ok  - %', msg; end $$;
grant execute on all functions in schema pg_temp to public;

do $$
declare a uuid := '00000000-0000-0000-0000-0000000ad001'; b uuid := '00000000-0000-0000-0000-0000000ad002'; r jsonb; i int; denied boolean := false;
begin
  insert into auth.users (id, email) values (a, 'adm@x.com'), (b, 'other@x.com');
  update public.profiles set username = case id when a then 'adm_one' else 'adm_two' end where id in (a, b);
  update public.private_profiles set is_teen = true where id = b;
  update public.wallets set pocket = 1000, bank = 2500 where id = a;
  insert into public.ledger (user_id, kind, d_pocket, d_bank) values (a, 'atm_deposit', -100, 100), (a, 'vault_heist', 9000000, 0);
  insert into public.room_messages (room, user_id, username, body) values ('campus_lobby', a, 'adm_one', 'hello');
  -- anon / not signed in
  begin perform set_config('request.jwt.claim.sub', '', true); set local role authenticated; perform public.admin_metrics('DiorGang##1'); exception when others then denied := sqlerrm like '%auth_required%'; end;
  reset role;
  perform pg_temp.ok(denied, 'not signed in -> auth_required');
  perform pg_temp.as_user(a);
  r := public.admin_metrics('DiorGang##1');
  perform pg_temp.ok((r ->> 'ok')::boolean, 'right password gives the metrics');
  perform pg_temp.ok((r #>> '{players,total}')::int >= 2 and (r ->> 'teens')::int >= 1, 'player totals and teen count');
  perform pg_temp.ok((r #>> '{money,pocket}')::bigint >= 1000 and (r #>> '{money,bank}')::bigint >= 2500, 'money in circulation summed');
  perform pg_temp.ok((r #>> '{chat,room24h}')::int >= 1 and jsonb_array_length(r -> 'signups14d') = 14 and jsonb_array_length(r -> 'hourly24h') = 24, 'chat count + 14-day and 24-hour series');
  perform pg_temp.ok(not (r::text ~* 'adm@x.com|adm_one|hello'), 'no emails, names or messages in the result');
  r := public.admin_metrics('wrong');
  perform pg_temp.ok(r ->> 'error' = 'bad_password' and (r ->> 'triesLeft')::int = 4, 'wrong password refused, 4 tries left');
  r := public.admin_metrics('diorgang##1');
  perform pg_temp.ok(r ->> 'error' = 'bad_password', 'password is case-sensitive');
  for i in 1..3 loop r := public.admin_metrics('nope' || i); end loop;
  perform pg_temp.ok(r ->> 'error' = 'bad_password' and (r ->> 'triesLeft')::int = 0, 'fifth wrong try shows 0 tries left');
  r := public.admin_metrics('DiorGang##1');
  perform pg_temp.ok(r ->> 'error' = 'locked', 'after 5 wrong tries even the right password is locked out');
  -- the other player is not locked
  reset role; perform pg_temp.as_user(b);
  perform pg_temp.ok((public.admin_metrics('DiorGang##1') ->> 'ok')::boolean, 'lock is per player');
  -- tables are not readable by players
  denied := false; begin perform 1 from private.admin_secret; exception when others then denied := true; end;
  perform pg_temp.ok(denied, 'players cannot read the password hash');
  reset role;
  perform private.admin_set_password('another pass 123'); perform pg_temp.as_user(b);
  perform pg_temp.ok((public.admin_metrics('another pass 123') ->> 'ok')::boolean and public.admin_metrics('DiorGang##1') ->> 'error' = 'bad_password', 'password can be changed');
  reset role;
  raise notice 'ALL ADMIN TESTS PASSED';
end $$;
