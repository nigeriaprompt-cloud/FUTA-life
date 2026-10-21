-- LOCAL TEST for 15_receipts.sql (ticks + safe resend). Run by run.sh after 15_receipts.sql. Throwaway Postgres only.
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
  a uuid := '00000000-0000-0000-0000-00000000cc01'; b uuid := '00000000-0000-0000-0000-00000000cc02'; c uuid := '00000000-0000-0000-0000-00000000cc03';
  k1 uuid := 'aaaaaaaa-0000-4000-8000-000000000001'; k2 uuid := 'aaaaaaaa-0000-4000-8000-000000000002'; k3 uuid := 'aaaaaaaa-0000-4000-8000-000000000003'; k4 uuid := 'aaaaaaaa-0000-4000-8000-000000000004';
  id1 bigint; id2 bigint; gid bigint; n int; d1 timestamptz;
begin
  insert into auth.users (id, email) values (a, 'ra@x.com'), (b, 'rb@x.com'), (c, 'rc@x.com');
  update public.profiles set username = 'rc_' || (case id when a then 'ada' when b then 'bob' else 'cy' end) where id in (a, b, c);
  update public.private_profiles set onboarded = true, dob = '2000-01-01' where id in (a, b, c);
  insert into public.waves (from_user, to_user, status) values (a, b, 'accepted');

  -- access
  perform pg_temp.as_anon();
  perform pg_temp.fails($q$select public.mark_dms_delivered()$q$, 'permission denied', 'signed-out visitors cannot mark delivered');
  perform pg_temp.fails($q$select public.send_dm('00000000-0000-0000-0000-00000000cc02', 'hi', gen_random_uuid())$q$, 'permission denied', 'signed-out visitors cannot send');
  reset role;

  -- ---------------------------------------------------------- resend is idempotent
  perform pg_temp.as_user(a);
  id1 := public.send_dm(b, 'first try', k1);
  id2 := public.send_dm(b, 'first try', k1);
  perform pg_temp.ok(id1 = id2 and id1 > 0, 'resending a DM with the same client id returns the original id');
  perform pg_temp.ok((select count(*) from public.dms where client_id = k1) = 1, 'and posts it only once');
  perform pg_temp.ok(public.send_dm(b, 'a different text, same id', k1) = id1, 'a retry never creates a second row even if the text differs');
  perform pg_temp.ok(public.send_dm(b, 'no client id') > id1 and public.send_dm(b, 'no client id') > id1, 'old 2-argument calls still work (no id = always a new row)');
  reset role;
  perform pg_temp.ok((select count(*) from public.dms where body = 'no client id') = 2, 'calls without an id are not de-duplicated');

  -- a retry of a delivered message is accepted even after a block, but a NEW message is not
  insert into public.blocks (blocker, blocked) values (b, a);
  perform pg_temp.as_user(a);
  perform pg_temp.ok(public.send_dm(b, 'first try', k1) = id1, 'a retry of an already-stored message just returns it (even if blocked since)');
  perform pg_temp.fails(format($q$select public.send_dm(%L, 'new one', %L)$q$, b, k2), 'wave_first', 'but a new message to someone who blocked you is still refused');
  reset role;
  delete from public.blocks;

  -- rate limit does not punish a retry
  delete from public.dms where sender = a;
  perform pg_temp.as_user(a);
  for n in 1..5 loop perform public.send_dm(b, 'burst ' || n, ('bbbbbbbb-0000-4000-8000-00000000000' || n)::uuid); end loop;
  perform pg_temp.fails(format($q$select public.send_dm(%L, 'sixth', %L)$q$, b, k3), 'slow_down', 'a sixth new message in 10 s is slowed down');
  perform pg_temp.ok(public.send_dm(b, 'burst 3', 'bbbbbbbb-0000-4000-8000-000000000003') > 0, 'but retrying one of the five is fine');
  reset role;

  delete from public.dms;      -- (clears the 10-second rate window)
  -- same client id from two different players are different messages
  perform pg_temp.as_user(b);
  id2 := public.send_dm(a, 'from bob', k4);
  reset role;
  perform pg_temp.as_user(a); id1 := public.send_dm(b, 'from ada', k4); reset role;
  perform pg_temp.ok(id1 <> id2 and (select count(*) from public.dms where client_id = k4) = 2, 'the same client id from two players does not clash');

  -- room + group resend
  delete from public.dms;
  perform pg_temp.as_user(a); perform public.enter_building('B12', 'library');
  id1 := public.send_room_message('int_b12_1', 'hello room', k1); id2 := public.send_room_message('int_b12_1', 'hello room', k1);
  perform pg_temp.ok(id1 = id2 and (select count(*) from public.room_messages where client_id = k1) = 1, 'resending a room message posts once');
  perform pg_temp.fails($q$select public.send_room_message('int_b99_1', 'x', gen_random_uuid())$q$, 'not_in_room', 'a new room message is still checked for presence');
  gid := public.create_group('Ticks Club');
  id1 := public.send_group_message(gid, 'hello group', k1); id2 := public.send_group_message(gid, 'hello group', k1);
  perform pg_temp.ok(id1 = id2 and (select count(*) from public.group_messages where client_id = k1) = 1, 'resending a group message posts once');
  reset role;

  -- ---------------------------------------------------------- ticks
  delete from public.dms;
  perform pg_temp.as_user(a); id1 := public.send_dm(b, 'tick me', gen_random_uuid()); id2 := public.send_dm(b, 'tick me too', gen_random_uuid()); reset role;
  perform pg_temp.ok((select delivered_at is null and read_at is null from public.dms where id = id1), 'a new DM starts as sent: not delivered, not seen');

  perform pg_temp.as_user(a);
  perform pg_temp.ok(public.mark_dms_delivered() = 0, 'the sender cannot mark their own messages delivered');
  perform pg_temp.ok(public.mark_dms_read(b) = 0, 'the sender cannot mark messages to them as seen');
  perform pg_temp.fails($q$update public.dms set read_at = now()$q$, 'permission denied', 'nobody can set ticks with a plain UPDATE');
  reset role;
  perform pg_temp.ok((select count(*) from public.dms where delivered_at is not null or read_at is not null) = 0, 'nothing changed from the sender side');

  perform pg_temp.as_user(c);
  perform pg_temp.ok(public.mark_dms_delivered() = 0 and public.mark_dms_read(a) = 0, 'a third player cannot touch other people’s messages');
  reset role;

  perform pg_temp.as_user(b);
  perform pg_temp.ok(public.mark_dms_delivered() = 2, 'the receiver marks both delivered');
  perform pg_temp.ok(public.mark_dms_delivered() = 0, 'marking again changes nothing');
  reset role;
  perform pg_temp.ok((select count(*) from public.dms where delivered_at is not null and read_at is null) = 2, 'delivered but not yet seen (two grey ticks)');
  select delivered_at into d1 from public.dms where id = id1;

  perform pg_temp.as_user(b); perform pg_temp.ok(public.mark_dms_read(a) = 2, 'opening the chat marks both seen'); perform pg_temp.ok(public.mark_dms_read(a) = 0, 'seen is only set once'); reset role;
  perform pg_temp.ok((select count(*) from public.dms where read_at is not null) = 2 and (select delivered_at from public.dms where id = id1) = d1, 'seen (light blue ticks) and the delivered time is kept');

  -- seen without a separate delivered call still sets delivered
  perform pg_temp.as_user(a); id1 := public.send_dm(b, 'straight to seen', gen_random_uuid()); reset role;
  perform pg_temp.as_user(b); perform public.mark_dms_read(a); reset role;
  perform pg_temp.ok((select delivered_at is not null and read_at is not null from public.dms where id = id1), 'reading an undelivered message also marks it delivered');

  -- only the right pair is affected
  perform pg_temp.as_user(c); perform public.mark_dms_delivered(); reset role;
  insert into public.waves (from_user, to_user, status) values (c, b, 'accepted');
  perform pg_temp.as_user(c); id1 := public.send_dm(b, 'from cy', gen_random_uuid()); reset role;
  perform pg_temp.as_user(b); perform pg_temp.ok(public.mark_dms_read(a) = 0, 'reading Ada’s chat does not mark Cy’s message seen'); reset role;
  perform pg_temp.ok((select read_at is null from public.dms where id = id1), 'Cy’s message is still unseen');

  -- both people can still read their own messages (RLS unchanged); the sender sees the tick columns
  perform pg_temp.as_user(a); perform pg_temp.ok((select count(*) from public.dms where read_at is not null) >= 1, 'the sender can read read_at / delivered_at of their own messages'); reset role;
  perform pg_temp.as_user(c); perform pg_temp.ok((select count(*) from public.dms where sender = a) = 0, 'strangers still cannot read the thread'); reset role;

  raise notice 'ALL RECEIPT TESTS PASSED';
end $$;
