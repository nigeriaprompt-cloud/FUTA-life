-- LOCAL TEST for 26_admin_send_money.sql. Throwaway Postgres only. Run by run.sh after test_celebrations.sql.
create or replace function pg_temp.as_user(u uuid) returns void language plpgsql as $$
begin perform set_config('request.jwt.claim.sub', coalesce(u::text, ''), true); execute 'set local role authenticated'; end $$;
create or replace function pg_temp.ok(c boolean, msg text) returns void language plpgsql as $$
begin if c is not true then raise exception 'FAIL: %', msg; end if; raise notice 'ok  - %', msg; end $$;
grant execute on all functions in schema pg_temp to public;

do $$
declare a uuid := '00000000-0000-0000-0000-00000ad0a001'; b uuid := '00000000-0000-0000-0000-00000ad0a002'; c uuid := '00000000-0000-0000-0000-00000ad0a003'; d uuid := '00000000-0000-0000-0000-00000ad0a004';
        r jsonb; denied boolean; bank_b bigint; bank_c bigint; bank_d bigint; before_total bigint; n_led int; n_not int; players int;
begin
  insert into auth.users (id, email) values (a, 'ama@x.com'), (b, 'bob@x.com'), (c, 'cat@x.com'), (d, 'unfinished@x.com');
  update public.profiles set username = case id when a then 'ama_adm' when b then 'bob_adm' when c then 'cat_adm' end where id in (a, b, c);   -- d has no username = has not finished sign-up
  update public.wallets set bank = 100 where id = b;
  perform private.admin_set_password('send money 2026');
  select coalesce(sum(bank), 0) into before_total from public.wallets;

  -- nobody signed in / not the admin
  denied := false; begin perform set_config('request.jwt.claim.sub', '', true); set local role authenticated; perform public.admin_send_money('send money 2026', 'bob_adm', 500); exception when others then denied := sqlerrm like '%auth_required%'; end; reset role;
  perform pg_temp.ok(denied, 'not signed in -> auth_required');
  denied := false; begin set local role anon; perform public.admin_send_money('send money 2026', 'bob_adm', 500); exception when others then denied := true; end; reset role;
  perform pg_temp.ok(denied, 'anon cannot call it at all');
  perform pg_temp.as_user(a);
  r := public.admin_send_money('wrong', 'bob_adm', 500);
  perform pg_temp.ok(r ->> 'error' = 'bad_password', 'wrong password refused');
  reset role; select bank into bank_b from public.wallets where id = b; perform pg_temp.ok(bank_b = 100, 'nothing was paid after a wrong password');
  perform pg_temp.as_user(a);
  r := public.admin_send_money_all('wrong', 500, 3); perform pg_temp.ok(r ->> 'error' = 'bad_password', 'wrong password refused for "all" too');
  r := public.admin_money_preview('wrong'); perform pg_temp.ok(r ->> 'error' = 'bad_password', 'wrong password refused for the preview');
  r := public.admin_money_history('wrong'); perform pg_temp.ok(r ->> 'error' = 'bad_password', 'wrong password refused for the history');
  denied := false; begin perform 1 from public.admin_grants; exception when others then denied := true; end;
  perform pg_temp.ok(denied, 'players cannot read the audit table');
  reset role; delete from private.admin_attempts;

  -- one player
  perform pg_temp.as_user(a);
  r := public.admin_send_money('send money 2026', '@Bob_Adm', 2500, '  Well done!  ');
  perform pg_temp.ok((r ->> 'ok')::boolean and r ->> 'to' = 'bob_adm' and (r ->> 'amount')::bigint = 2500 and (r ->> 'bank')::bigint = 2600, 'one player: username with @ and capitals works, bank 100 + 2500 = 2600');
  reset role;
  select count(*) into n_led from public.ledger where user_id = b and kind = 'admin_grant' and d_bank = 2500 and d_pocket = 0 and ref like 'admin:%';
  perform pg_temp.ok(n_led = 1, 'one ledger row (kind admin_grant, bank only)');
  select count(*) into n_not from public.notifications where user_id = b and kind = 'money' and from_user is null and amount = 2500 and title = 'FUTAlife sent you ₦2,500' and body = 'Well done!';
  perform pg_temp.ok(n_not = 1, 'the player gets a phone alert with the trimmed note');
  perform pg_temp.as_user(a);
  perform pg_temp.ok(public.admin_send_money('send money 2026', 'nobody_here', 100) ->> 'error' = 'player_not_found', 'unknown username refused');
  perform pg_temp.ok(public.admin_send_money('send money 2026', 'bob_adm', 0) ->> 'error' = 'bad_amount', 'zero refused');
  perform pg_temp.ok(public.admin_send_money('send money 2026', 'bob_adm', -5) ->> 'error' = 'bad_amount', 'negative refused');
  perform pg_temp.ok(public.admin_send_money('send money 2026', 'bob_adm', null) ->> 'error' = 'bad_amount', 'missing amount refused');
  perform pg_temp.ok(public.admin_send_money('send money 2026', 'bob_adm', 10000001) ->> 'error' = 'too_much', 'above the one-player ceiling refused');
  perform pg_temp.ok(public.admin_send_money('send money 2026', 'bob_adm', 100, repeat('x', 81)) ->> 'error' = 'too_long', 'note over 80 characters refused');
  perform pg_temp.ok(public.admin_send_money('send money 2026', 'unfinished@x.com', 100) ->> 'error' = 'player_not_found', 'a player who has not finished sign-up cannot be paid');
  reset role; select bank into bank_b from public.wallets where id = b; perform pg_temp.ok(bank_b = 2600, 'refusals paid nothing');

  -- all players
  select count(*) into players from public.profiles p join public.wallets w on w.id = p.id where p.username is not null;   -- counted as the owner: players cannot see each other's rows
  perform pg_temp.as_user(a);
  r := public.admin_money_preview('send money 2026');
  perform pg_temp.ok((r ->> 'ok')::boolean and (r ->> 'players')::int = players and players >= 3, 'preview counts the players who finished sign-up (' || players || ')');
  perform pg_temp.ok(public.admin_send_money_all('send money 2026', 1000, players + 1) ->> 'error' = 'count_changed', 'a changed player count stops the send');
  perform pg_temp.ok(public.admin_send_money_all('send money 2026', 1000001, players) ->> 'error' = 'too_much', 'above the all-players ceiling refused');
  perform pg_temp.ok(public.admin_send_money_all('send money 2026', 0, players) ->> 'error' = 'bad_amount', 'zero refused for all');
  reset role; select coalesce(sum(bank), 0) into bank_c from public.wallets; perform pg_temp.ok(bank_c = before_total + 2500, 'refusals paid nothing (all)');
  perform pg_temp.as_user(a);
  r := public.admin_send_money_all('send money 2026', 1000, players, 'Happy Founders Day');
  perform pg_temp.ok((r ->> 'ok')::boolean and (r ->> 'players')::int = players and (r ->> 'total')::bigint = 1000 * players, 'all: sent to ' || players || ' players, total 1000 x ' || players);
  reset role;
  select bank into bank_b from public.wallets where id = b; select bank into bank_c from public.wallets where id = c; select bank into bank_d from public.wallets where id = d;
  perform pg_temp.ok(bank_b = 3600 and bank_c = 1000, 'every finished player got ₦1,000 in the bank (bob 3600, cat 1000)');
  perform pg_temp.ok(bank_d = 0, 'the player without a username got nothing');
  select count(*) into n_led from public.ledger where kind = 'admin_grant' and ref like 'admin:%' and d_bank = 1000; perform pg_temp.ok(n_led = players, 'one ledger row per player');
  select count(*) into n_not from public.notifications where kind = 'money' and from_user is null and amount = 1000 and body = 'Happy Founders Day'; perform pg_temp.ok(n_not = players, 'one phone alert per player');
  perform pg_temp.ok((select sum(bank) from public.wallets) = before_total + 2500 + 1000 * players, 'money in banks went up by exactly what was sent');
  perform pg_temp.as_user(a);
  perform pg_temp.ok(public.admin_send_money_all('send money 2026', 1000, players) ->> 'error' = 'slow_down', 'a second "all" within 60 seconds is refused (double tap cannot pay twice)');
  r := public.admin_money_history('send money 2026');
  perform pg_temp.ok((r ->> 'ok')::boolean and jsonb_array_length(r -> 'rows') = 2 and r #>> '{rows,0,scope}' = 'all' and r #>> '{rows,1,to}' = 'bob_adm', 'history lists both sends, newest first');
  perform pg_temp.ok(not (r::text ~* 'ama@x.com|bob@x.com'), 'history shows no emails');
  reset role;

  -- the ceilings can be changed without code
  insert into public.app_config (key, value) values ('admin_money.max_single', '20000000') on conflict (key) do update set value = excluded.value;
  perform pg_temp.as_user(a); perform pg_temp.ok((public.admin_send_money('send money 2026', 'cat_adm', 15000000) ->> 'ok')::boolean, 'ceiling changed in app_config: ₦15,000,000 now allowed to one player');
  reset role;
  raise notice 'ALL ADMIN MONEY TESTS PASSED';
end $$;
