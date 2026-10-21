-- LOCAL TEST: run after stub.sql, 01_schema.sql, 02_avatar_options.sql.   psql -v ON_ERROR_STOP=1 -f test.sql
-- Acts as real signed-in users (role authenticated) so RLS and grants are exercised for real.
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

grant execute on all functions in schema pg_temp to public;

do $$
declare
  a uuid := '00000000-0000-0000-0000-00000000000a'; b uuid := '00000000-0000-0000-0000-00000000000b';
  c uuid := '00000000-0000-0000-0000-00000000000c'; t uuid := '00000000-0000-0000-0000-0000000000d1';  -- t = a teen
  r jsonb; n int; x bigint;
begin
  insert into auth.users (id, email) values (a, 'a@x.com'), (b, 'b@x.com'), (c, 'c@x.com'), (t, 't@x.com');
  perform pg_temp.ok((select count(*) from public.wallets) = 4, 'trigger created profile + wallet for each new user');

  -- ---------------------------------------------------------------- sign-up
  perform pg_temp.as_anon();
  r := public.username_available('lagos_baddie');
  perform pg_temp.ok((r->>'available')::boolean, 'anon can check a free username');
  perform pg_temp.ok(not (public.username_available('admin')->>'available')::boolean, 'reserved name refused');
  perform pg_temp.ok(not (public.username_available('A')->>'available')::boolean, 'bad format refused');
  perform pg_temp.fails('select public.get_wallet()', 'permission denied', 'anon cannot call wallet RPC');
  perform pg_temp.fails('select * from public.profiles', 'permission denied', 'anon cannot read profiles');
  reset role;

  perform pg_temp.as_user(a);
  perform pg_temp.fails($q$select public.set_profile('kid', (current_date - interval '10 years')::date)$q$, 'under_age', 'under 13 blocked');
  r := public.set_profile('Lagos_Baddie', date '2002-05-05');
  perform pg_temp.ok(r->>'username' = 'lagos_baddie' and (r->>'isTeen')::boolean = false, 'profile saved, lower-cased, adult');
  r := public.set_profile('lagos_baddie2', date '2015-01-01');          -- trying to change dob later
  perform pg_temp.ok(r->>'dob' = '2002-05-05', 'date of birth cannot be changed once set');
  reset role;
  perform pg_temp.as_user(b);
  perform pg_temp.fails($q$select public.set_profile('lagos_baddie2', date '2000-01-01')$q$, 'taken', 'duplicate username refused');
  perform public.set_profile('bolu', date '2000-01-01');
  reset role;
  perform pg_temp.as_user(t);
  r := public.set_profile('teen_t', (current_date - interval '15 years')::date);
  perform pg_temp.ok((r->>'isTeen')::boolean, '15 year old gets Teen Mode');
  reset role;
  perform pg_temp.as_user(c); perform public.set_profile('chidi', date '1999-09-09'); reset role;

  -- ---------------------------------------------------------------- avatar
  perform pg_temp.as_user(a);
  r := public.save_avatar('{"body":{"frame":"f","height":9,"build":-3},"skin":99,"hair":{"style":"nonsense"},"wear":{"top":{"id":"uniform_shirt","c":1},"layer":{"id":"hivis","c":1},"head":{"id":"peaked","c":0},"shoes":{"id":"heels","c":300}}}');
  perform pg_temp.ok((r#>>'{body,height}')::numeric = 1.08 and (r#>>'{body,build}')::numeric = 0, 'numbers are clamped');
  perform pg_temp.ok((r->>'skin')::int = 11, 'skin index clamped to palette');
  perform pg_temp.ok(r#>>'{hair,style}' = 'cornrows', 'unknown hair falls back to frame default');
  perform pg_temp.ok(not (r->'wear' ? 'layer') and not (r->'wear' ? 'head'), 'NPC-only hi-vis and peaked cap are stripped');
  perform pg_temp.ok(r#>>'{wear,top,id}' = 'blouse', 'NPC-only uniform shirt replaced by the default top');
  perform pg_temp.ok((r#>>'{wear,shoes,c}')::int = 23, 'colour index clamped');
  perform pg_temp.ok(jsonb_typeof(r->'makeup') = 'object', 'makeup stays an object {}');
  perform pg_temp.ok((select avatar_hash from public.profiles where id = a) = md5(r::text), 'avatar_hash stored');
  perform pg_temp.fails($q$select public.save_avatar(jsonb_build_object('junk', repeat('x', 9000)))$q$, 'look_too_large', 'huge look refused');
  r := public.save_avatar('{"body":{"frame":"m"},"beard":"full","wear":{"dress":{"id":"gown","c":2},"top":{"id":"tee","c":1}}}');
  perform pg_temp.ok(r->>'beard' = 'full' and (r->'wear' ? 'dress') and not (r->'wear' ? 'top'), 'dress replaces top');
  r := public.save_avatar('{"body":{"frame":"f"},"beard":"full"}');
  perform pg_temp.ok(r->>'beard' = 'none', 'beard only for m frame');
  perform pg_temp.fails($q$select public.validate_avatar('{}'::jsonb)$q$, 'permission denied', 'validate_avatar is not callable from the browser');
  perform pg_temp.fails($q$update public.profiles set avatar_json = '{"hack":true}' where id = auth.uid()$q$, 'permission denied', 'direct profile update blocked');
  reset role;

  -- ---------------------------------------------------------------- life + money
  perform pg_temp.as_user(a);
  r := public.save_life('hustler');
  perform pg_temp.ok((r#>>'{wallet,bank}')::bigint = 6000 and (r#>>'{wallet,pocket}')::bigint = 500, 'starter money granted');
  perform pg_temp.ok((r->>'onboarded')::boolean, 'marked onboarded');
  r := public.save_life('fresh');
  perform pg_temp.ok((r#>>'{wallet,bank}')::bigint = 6000, 'starter money is only granted once');
  perform pg_temp.fails($q$select public.save_life('billionaire')$q$, 'bad_start', 'bad life start refused');
  perform pg_temp.fails($q$update public.wallets set bank = 99999999 where id = auth.uid()$q$, 'permission denied', 'cannot edit wallet directly');
  perform pg_temp.fails($q$insert into public.ledger (user_id, kind) values (auth.uid(), 'x')$q$, 'permission denied', 'cannot write ledger directly');
  perform pg_temp.fails('select public.atm_withdraw(100)', 'wrong_place', 'ATM refused when not inside a bank');
  perform public.enter_building('library_1', 'library');
  perform pg_temp.fails('select public.atm_withdraw(100)', 'wrong_place', 'ATM refused inside a library');
  perform pg_temp.fails('select public.atm_claim_daily()', 'wrong_place', 'daily claim refused outside a bank');
  perform public.enter_building('wema_bank_1', 'bank');
  r := public.atm_withdraw(1500);
  perform pg_temp.ok((r->>'pocket')::bigint = 2000 and (r->>'bank')::bigint = 4500, 'withdraw moves bank to pocket');
  perform pg_temp.fails('select public.atm_withdraw(999999)', 'insufficient_funds', 'cannot overdraw');
  perform pg_temp.fails('select public.atm_withdraw(-5)', 'bad_amount', 'negative amount refused');
  perform pg_temp.fails('select public.atm_deposit(50000)', 'insufficient_funds', 'cannot deposit more than pocket');
  r := public.atm_deposit(500);
  perform pg_temp.ok((r->>'pocket')::bigint = 1500 and (r->>'bank')::bigint = 5000, 'deposit moves pocket to bank');
  r := public.atm_claim_daily();
  perform pg_temp.ok((r->>'bank')::bigint = 6000 and not (r->>'canClaimDaily')::boolean, 'daily claim pays once');
  perform pg_temp.fails('select public.atm_claim_daily()', 'already_claimed', 'daily claim twice refused');
  perform pg_temp.ok((select count(*) from public.ledger) = 4, 'ledger shows my 4 entries (grant, withdraw, deposit, daily)');
  reset role;
  perform pg_temp.as_user(b);
  perform pg_temp.ok((select count(*) from public.ledger) = 0 and (select count(*) from public.wallets) = 1, 'RLS: B cannot see A''s ledger or wallet');
  reset role;
  perform pg_temp.ok((select sum(d_pocket + d_bank) from public.ledger where user_id = a) = (select pocket + bank from public.wallets where id = a), 'ledger sums to wallet');

  -- ---------------------------------------------------------------- activities (server-side effects)
  perform pg_temp.as_user(a);
  perform pg_temp.fails($q$select public.enter_building('x y', 'bank')$q$, 'bad_place', 'bad building id refused');
  perform pg_temp.fails($q$select public.do_activity('sleep')$q$, 'wrong_place', 'cannot sleep in a bank');
  perform pg_temp.fails($q$select public.do_activity('nonsense')$q$, 'bad_activity', 'unknown activity refused');
  perform pg_temp.fails($q$select public.do_activity('atm')$q$, 'use_the_atm', 'atm is not a normal activity');
  r := public.enter_building('jibowu_1', 'hostel');
  perform pg_temp.ok(r->>'venue' = 'hostel', 'entered a hostel');
  perform pg_temp.fails($q$select public.atm_withdraw(10)$q$, 'wrong_place', 'no ATM in a hostel');
  r := public.do_activity('study');
  perform pg_temp.ok((r->>'knowledge')::int = 4 and (r->>'energy')::int = 92, 'study: knowledge +4, energy -8');
  perform pg_temp.fails($q$select public.do_activity('study')$q$, 'cooldown', 'study has a cooldown');
  r := public.do_activity('cook');
  perform pg_temp.ok((r->>'hunger')::int = 100 and (r#>>'{wallet,pocket}')::bigint = 1200, 'cook: hunger up, ₦300 taken from pocket (1500 -> 1200)');
  r := public.do_activity('sleep');
  perform pg_temp.ok((r->>'energy')::int = 100, 'sleep restores energy (clamped at 100)');
  reset role;
  update public.wallets set pocket = 100 where id = a;
  update public.activity_cooldowns set last_at = now() - interval '1 day' where user_id = a;
  perform pg_temp.as_user(a);
  perform pg_temp.fails($q$select public.do_activity('cook')$q$, 'insufficient_funds', 'cannot cook with only ₦100');
  perform public.do_activity('wardrobe');
  perform public.leave_building();
  perform pg_temp.fails($q$select public.do_activity('wardrobe')$q$, 'wrong_place', 'no activity after leaving the building');
  perform pg_temp.fails($q$update public.player_stats set energy = 100, mood = 100 where id = auth.uid()$q$, 'permission denied', 'cannot edit own stats');
  reset role;
  update public.player_stats set energy = 3 where id = a;
  perform pg_temp.as_user(a); perform public.enter_building('gym_1', 'gym');
  perform pg_temp.fails($q$select public.do_activity('lift_weights')$q$, 'too_tired', 'too tired to lift weights');
  reset role;
  perform pg_temp.as_user(b);
  perform pg_temp.ok((public.get_stats()->>'energy')::int = 100, 'other players keep their own stats');
  reset role;

  -- ---------------------------------------------------------------- seats
  perform pg_temp.as_user(a);
  perform pg_temp.ok((public.claim_seat('lib_main', 'chair_3')->>'ok')::boolean, 'A sits on chair_3');
  reset role; perform pg_temp.as_user(b);
  perform pg_temp.ok(not (public.claim_seat('lib_main', 'chair_3')->>'ok')::boolean, 'B cannot take A''s chair');
  perform pg_temp.ok((public.claim_seat('lib_main', 'chair_4')->>'ok')::boolean, 'B takes chair_4');
  perform pg_temp.ok((public.claim_seat('lib_main', 'chair_5')->>'ok')::boolean and (select count(*) from public.list_seats('lib_main')) = 2, 'moving seats frees the old one (one seat per player)');
  perform pg_temp.fails($q$select public.claim_seat('Bad Room!', 'x')$q$, 'bad_seat', 'bad room name refused');
  reset role;
  update public.seat_claims set expires_at = now() - interval '1 minute' where user_id = a;
  perform pg_temp.as_user(c);
  perform pg_temp.ok((public.claim_seat('lib_main', 'chair_3')->>'ok')::boolean, 'expired claim can be taken');
  reset role;

  -- ---------------------------------------------------------------- chat
  perform pg_temp.as_user(a);
  x := public.send_room_message('zone_0_0', 'hello campus');
  perform pg_temp.ok(x > 0, 'room message sent');
  perform pg_temp.fails($q$select public.send_room_message('zone_0_0', '   ')$q$, 'message_not_allowed', 'empty message refused');
  for n in 1..4 loop perform public.send_room_message('zone_0_0', 'm' || n); end loop;
  perform pg_temp.fails($q$select public.send_room_message('zone_0_0', 'one too many')$q$, 'slow_down', 'rate limit after 5 in 10s');
  reset role;
  perform pg_temp.as_user(t);
  perform pg_temp.fails($q$select public.send_room_message('zone_0_0', 'follow me www.scam.com')$q$, 'message_not_allowed', 'teen cannot post links');
  perform pg_temp.fails($q$select public.send_room_message('zone_0_0', 'call 08031234567')$q$, 'message_not_allowed', 'teen cannot post phone numbers');
  perform public.send_room_message('zone_0_0', 'hi everyone');
  perform pg_temp.ok((select count(*) from public.room_messages where room = 'zone_0_0') = 6, 'players can read room messages');
  perform pg_temp.fails($q$insert into public.room_messages (room, user_id, username, body) values ('z', auth.uid(), 'x', 'y')$q$, 'permission denied', 'cannot insert chat directly');
  reset role;
  insert into public.banned_words values ('badword');
  perform pg_temp.as_user(b);
  perform public.send_room_message('zone_0_0', 'this is a Badword here');
  perform pg_temp.ok((select body from public.room_messages order by id desc limit 1) = 'this is a ******* here', 'banned words starred out');
  reset role;

  -- ---------------------------------------------------------------- waves, DMs, blocks
  perform pg_temp.as_user(b);
  perform pg_temp.fails($q$select public.send_dm('00000000-0000-0000-0000-00000000000a', 'hey')$q$, 'wave_first', 'stranger DM refused');
  r := public.send_wave('00000000-0000-0000-0000-00000000000a');
  perform pg_temp.ok(r->>'status' = 'pending', 'B waves at A');
  perform pg_temp.fails($q$select public.send_wave('00000000-0000-0000-0000-0000000000d1')$q$, 'not_allowed', 'adult cannot wave at a teen');
  reset role;
  perform pg_temp.as_user(t);
  perform pg_temp.fails($q$select public.send_wave('00000000-0000-0000-0000-00000000000a')$q$, 'not_allowed', 'teen cannot wave at an adult');
  reset role;
  perform pg_temp.as_user(a);
  perform pg_temp.ok((select count(*) from public.waves where to_user = a) = 1, 'A sees the incoming wave');
  perform public.respond_wave((select id from public.waves where to_user = a limit 1), true);
  x := public.send_dm('00000000-0000-0000-0000-00000000000b', 'hi bolu');
  perform pg_temp.ok(x > 0, 'after accept, A can DM B');
  reset role;
  perform pg_temp.as_user(c);
  perform pg_temp.ok((select count(*) from public.dms) = 0, 'RLS: C cannot read A-B DMs');
  reset role;
  perform pg_temp.as_user(b);
  perform pg_temp.ok((select count(*) from public.dms) = 1, 'B can read the DM');
  perform public.block_user('00000000-0000-0000-0000-00000000000a');
  perform pg_temp.ok((select count(*) from public.dms) = 0, 'block hides the DM from the blocker');
  perform pg_temp.fails($q$select public.send_dm('00000000-0000-0000-0000-00000000000a', 'x')$q$, 'wave_first', 'blocker cannot DM blocked user');
  perform pg_temp.ok((select count(*) from public.room_messages where user_id = '00000000-0000-0000-0000-00000000000a') = 0, 'blocked user''s room messages hidden');
  reset role;
  perform pg_temp.as_user(a);
  perform pg_temp.fails($q$select public.send_dm('00000000-0000-0000-0000-00000000000b', 'x')$q$, 'wave_first', 'blocked user cannot DM blocker');
  perform pg_temp.ok((select count(*) from public.dms) = 0, 'block hides both ways');
  perform pg_temp.fails($q$select public.send_wave('00000000-0000-0000-0000-00000000000b')$q$, 'not_allowed', 'blocked user cannot wave');
  reset role;
  perform pg_temp.as_user(b);
  perform public.unblock_user('00000000-0000-0000-0000-00000000000a');
  reset role;

  -- privacy switch + mutual wave
  perform pg_temp.as_user(c); perform public.set_privacy(false); reset role;
  perform pg_temp.as_user(b);
  perform pg_temp.fails($q$select public.send_wave('00000000-0000-0000-0000-00000000000c')$q$, 'not_allowed', 'waves off: cannot wave');
  reset role;
  perform pg_temp.as_user(a); perform public.send_wave('00000000-0000-0000-0000-00000000000b'); reset role;

  -- reports
  perform pg_temp.as_user(b);
  perform public.report_user('00000000-0000-0000-0000-00000000000a', 'spam', 'test');
  perform pg_temp.fails($q$select public.report_user('00000000-0000-0000-0000-00000000000a', 'bad-reason')$q$, 'check constraint', 'unknown report reason refused');
  perform pg_temp.ok((select count(*) from public.reports) = 1, 'reporter sees own report only');
  reset role;
  perform pg_temp.as_user(a);
  perform pg_temp.ok((select count(*) from public.reports) = 0, 'reported user cannot see reports about them');
  perform pg_temp.ok((select count(*) from public.private_profiles) = 1, 'private_profiles: only my own row');
  perform pg_temp.ok((select count(*) from public.profiles) = 4, 'profiles: everyone is visible (name + outfit)');
  reset role;
  raise notice 'ALL SQL TESTS PASSED';
end $$;
