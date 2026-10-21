-- LOCAL TEST for 14_transfers.sql. Run by run.sh after 14_transfers.sql. Throwaway Postgres only.
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
  a uuid := '00000000-0000-0000-0000-00000000bb01'; b uuid := '00000000-0000-0000-0000-00000000bb02'; c uuid := '00000000-0000-0000-0000-00000000bb03';
  t uuid := '00000000-0000-0000-0000-00000000bb04'; t2 uuid := '00000000-0000-0000-0000-00000000bb05'; z uuid := '00000000-0000-0000-0000-00000000bb06';
  r jsonb; before bigint; after_ bigint; i int; nid bigint;
begin
  insert into auth.users (id, email) values (a, 'xa@x.com'), (b, 'xb@x.com'), (c, 'xc@x.com'), (t, 'xt@x.com'), (t2, 'xt2@x.com'), (z, 'xz@x.com');
  update public.profiles set username = 'xf_' || (case id when a then 'ada' when b then 'bob' when c then 'cy' when t then 'teen' when t2 then 'teentwo' else 'zed' end) where id in (a, b, c, t, t2, z);
  update public.profiles set username = null where id = z;
  update public.private_profiles set onboarded = true, dob = '2000-01-01' where id in (a, b, c);
  update public.private_profiles set onboarded = true, is_teen = true, dob = (current_date - interval '15 years')::date where id in (t, t2);
  update public.wallets set bank = 3000000, pocket = 0 where id = a;
  update public.wallets set bank = 100, pocket = 5 where id = b;
  update public.wallets set bank = 50000 where id in (t, t2);
  insert into public.waves (from_user, to_user, status) values (a, b, 'accepted'), (t, t2, 'accepted');       -- a+b friends, t+t2 friends; c is a stranger to a

  perform pg_temp.as_anon();
  perform pg_temp.fails($q$select public.send_money('00000000-0000-0000-0000-00000000bb02', 500)$q$, 'permission denied', 'signed-out visitors cannot send money');
  reset role;

  perform pg_temp.as_user(a);
  perform pg_temp.fails(format($q$select public.send_money(%L, 500)$q$, c), 'wave_first', 'cannot pay a stranger (friends only)');
  perform pg_temp.fails(format($q$select public.send_money(%L, 500)$q$, a), 'not_allowed', 'cannot pay yourself');
  perform pg_temp.fails(format($q$select public.send_money(%L, 50)$q$, b), 'bad_amount', 'below the minimum is refused');
  perform pg_temp.fails(format($q$select public.send_money(%L, -500)$q$, b), 'bad_amount', 'negative amount is refused');
  perform pg_temp.fails(format($q$select public.send_money(%L, null)$q$, b), 'bad_amount', 'null amount is refused');
  perform pg_temp.fails(format($q$select public.send_money(%L, 500001)$q$, b), 'over_limit', 'above the per-transfer maximum is refused');
  perform pg_temp.fails(format($q$select public.send_money(%L, 500, 'visit www.evil.com')$q$, t), 'wave_first', 'adult cannot pay a teen');
  reset role;

  -- a happy transfer, bank to bank
  perform pg_temp.as_user(a);
  r := public.send_money(b, 5000, 'for jollof 🍛');
  reset role;
  perform pg_temp.ok((r->>'amount')::bigint = 5000 and (r->>'bank')::bigint = 2995000, 'A sends ₦5,000: reply carries the new bank balance');
  perform pg_temp.ok((select bank from public.wallets where id = a) = 2995000 and (select bank from public.wallets where id = b) = 5100, 'A bank -5000, B bank +5000');
  perform pg_temp.ok((select pocket from public.wallets where id = b) = 5, 'pocket money is untouched');
  perform pg_temp.ok((select count(*) from public.ledger where kind = 'transfer_out' and user_id = a and d_bank = -5000) = 1 and (select count(*) from public.ledger where kind = 'transfer_in' and user_id = b and d_bank = 5000) = 1, 'ledger has both sides');
  perform pg_temp.ok((select count(*) from public.transfers where from_user = a and to_user = b and amount = 5000 and note = 'for jollof 🍛') = 1, 'transfer row with the note');
  perform pg_temp.ok((select count(*) from public.dms where sender = a and recipient = b and kind = 'money' and amount = 5000 and body like '💸 Sent ₦5,000%jollof%') = 1, 'a money message lands in the DM thread');

  perform pg_temp.as_user(b);
  perform pg_temp.ok((select count(*) from public.dms where kind = 'money') = 1, 'B sees the money message in chat (RLS)');
  perform pg_temp.ok((select count(*) from public.notifications) = 1 and (select title from public.notifications) = 'xf_ada sent you ₦5,000' and (select read_at from public.notifications) is null, 'B gets one unread phone alert with the sender name');
  perform pg_temp.ok((select count(*) from public.list_notifications()) = 1, 'list_notifications returns it');
  perform pg_temp.ok((select count(*) from public.transfers) = 1, 'B sees the transfer too');
  perform public.mark_notifications_read();
  perform pg_temp.ok((select read_at from public.notifications) is not null, 'mark_notifications_read marks it read');
  perform pg_temp.fails($q$insert into public.notifications (user_id, kind, title) values (auth.uid(), 'money', 'free money')$q$, 'permission denied', 'cannot forge a notification');
  perform pg_temp.fails($q$update public.wallets set bank = 99999999$q$, 'permission denied', 'cannot edit own wallet');
  perform pg_temp.fails($q$insert into public.dms (sender, recipient, body, kind, amount) values (auth.uid(), auth.uid(), 'x', 'money', 5)$q$, 'permission denied', 'cannot forge a money message');
  reset role;

  perform pg_temp.as_user(c);
  perform pg_temp.ok((select count(*) from public.transfers) = 0 and (select count(*) from public.notifications) = 0 and (select count(*) from public.dms) = 0, 'a stranger sees nothing');
  reset role;

  -- funds, jail, block, note filter
  perform pg_temp.as_user(b);
  perform pg_temp.fails(format($q$select public.send_money(%L, 6000)$q$, a), 'insufficient_funds', 'cannot send more than the bank holds');
  perform pg_temp.ok((select bank from public.wallets where id = b) = 5100, 'a refused transfer changes nothing');
  reset role;

  perform pg_temp.as_user(t);
  perform pg_temp.fails(format($q$select public.send_money(%L, 500, 'visit www.evil.com')$q$, t2), 'message_not_allowed', 'a teen cannot hide a link in the note');
  perform pg_temp.ok((public.send_money(t2, 500, 'lunch')->>'amount')::bigint = 500, 'teens can pay teens');
  perform pg_temp.fails(format($q$select public.send_money(%L, 500)$q$, a), 'wave_first', 'teen cannot pay an adult');
  reset role;

  perform pg_temp.as_user(a);
  perform pg_temp.ok((public.send_money(b, 500, 'call 08031234567')->>'amount')::bigint = 500, 'an adult note may contain a number (same rule as chat)');
  reset role;

  insert into public.jail (user_id, until) values (a, now() + interval '3 minutes') on conflict (user_id) do update set until = excluded.until;
  perform pg_temp.as_user(a);
  perform pg_temp.fails(format($q$select public.send_money(%L, 500)$q$, b), 'in_jail', 'a jailed player cannot send money');
  reset role;
  delete from public.jail where user_id = a;

  insert into public.blocks (blocker, blocked) values (b, a);
  perform pg_temp.as_user(a);
  perform pg_temp.fails(format($q$select public.send_money(%L, 500)$q$, b), 'wave_first', 'a blocked pair cannot move money');
  reset role;
  delete from public.blocks where blocker = b;

  -- limits: count per day, sum per day, receiver cap
  delete from public.transfers; update public.wallets set bank = 3000000 where id = a;
  perform pg_temp.as_user(a);
  for i in 1..10 loop perform public.send_money(b, 100); end loop;
  perform pg_temp.fails(format($q$select public.send_money(%L, 100)$q$, b), 'daily_limit', 'the 11th transfer in a day is refused');
  reset role;
  delete from public.transfers;
  perform pg_temp.as_user(a);
  for i in 1..4 loop perform public.send_money(b, 500000); end loop;
  perform pg_temp.fails(format($q$select public.send_money(%L, 500000)$q$, b), 'daily_limit', 'sending more than the daily total is refused');
  perform pg_temp.ok((public.get_transfer_info()->>'leftToday')::bigint = 0 and (public.get_transfer_info()->>'countLeft')::bigint = 6, 'get_transfer_info shows what is left today');
  reset role;
  insert into public.app_config (key, value) values ('transfer.max_per_day', '"9000000"'), ('transfer.max_receive_day', '"2100000"') on conflict (key) do update set value = excluded.value;
  perform pg_temp.as_user(a);
  perform pg_temp.fails(format($q$select public.send_money(%L, 500000)$q$, b), 'receiver_limit', 'a receiver over the daily total is refused');
  reset role;
  perform pg_temp.ok((select count(*) from public.transfers) = 4, 'refused transfers leave no rows');

  -- money is conserved
  perform pg_temp.ok((select coalesce(sum(d_bank), 0) from public.ledger where kind in ('transfer_out', 'transfer_in')) = 0, 'every coin sent was received (ledger nets to zero)');

  -- old alerts are cleaned
  update public.notifications set read_at = now() - interval '8 days';
  perform private.cleanup();
  perform pg_temp.ok((select count(*) from public.notifications) = 0, 'read alerts older than 7 days are cleaned up');

  raise notice 'ALL TRANSFER TESTS PASSED';
end $$;
