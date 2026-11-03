-- LOCAL TEST for 21_bots.sql + 21b_bots_content.sql. Throwaway Postgres only.
create or replace function pg_temp.as_user(u uuid) returns void language plpgsql as $$
begin perform set_config('request.jwt.claim.sub', coalesce(u::text, ''), true); execute 'set local role authenticated'; end $$;
create or replace function pg_temp.ok(c boolean, msg text) returns void language plpgsql as $$
begin if c is not true then raise exception 'FAIL: %', msg; end if; raise notice 'ok  - %', msg; end $$;
create or replace function pg_temp.fails(q text, expect text, msg text) returns void language plpgsql as $$
declare e text;
begin begin execute q; exception when others then e := sqlerrm; end;
  if e is null then raise exception 'FAIL (no error): %', msg; end if; if e not like '%' || expect || '%' then raise exception 'FAIL (wrong error "%"): %', e, msg; end if; raise notice 'ok  - %', msg; end $$;
grant execute on all functions in schema pg_temp to public;

do $$
declare
  a uuid := '00000000-0000-0000-0000-0000000b0001'; t uuid := '00000000-0000-0000-0000-0000000b0002'; bx uuid; bx2 uuid; bn text; r jsonb; w jsonb; n int; i int; k int; mid bigint; due timestamptz; cr timestamptz; iv interval;
begin
  -- ---- roster
  perform pg_temp.ok((select count(*) from public.bots) = 30, '30 bots created');
  perform pg_temp.ok((select count(*) from public.profiles where is_bot) = 30, 'all flagged is_bot');
  perform pg_temp.ok((select count(*) from public.bots where gender = 'f') = 15 and (select count(*) from public.bots where gender = 'm') = 15, '15 female + 15 male');
  perform pg_temp.ok((select count(*) from public.profiles p join public.private_profiles q on q.id = p.id where p.is_bot and q.onboarded and q.is_teen = false and p.avatar_json is not null and p.campus is not null) = 30, 'bots have avatar, campus tag and finished sign-up');
  perform pg_temp.ok((select count(*) from private.bot_lines) > 350 and (select count(*) from private.bot_feed) > 130 and (select count(*) from private.bot_tutorials) >= 28 and (select count(distinct scene) from private.bot_scenes) >= 60, 'content library is loaded (350+ lines, 130+ feed posts, 60+ scenes, 28+ guides)');
  perform pg_temp.ok((select count(distinct slot) from private.bot_slots) = 9 and (select count(*) from private.bot_slots) > 70, 'word slots are loaded');
  perform pg_temp.ok(not exists (select 1 from private.bot_scenes s where s.reply_step is not null and s.reply_step >= s.step), 'a scene line only replies to an EARLIER line');
  perform pg_temp.ok((select max(role) from private.bot_scenes) <= 3, 'scenes use at most 3 bots');
  perform pg_temp.ok((select count(*) from private.bot_make('tolu_ade', 'f', 'jokes', 'computer_science', '200', 'soc')) = 1 and (select count(*) from public.bots) = 30, 're-running the roster does not duplicate bots');
  select user_id, username into bx, bn from public.bots where username = 'tolu_ade'; select user_id into bx2 from public.bots where username = 'chidi_o';

  insert into auth.users (id, email) values (a, 'ba@x.com'), (t, 'bt@x.com');
  update public.profiles set username = case id when a then 'bt_ann' else 'bt_teen' end where id in (a, t);
  update public.private_profiles set onboarded = true, dob = '1995-01-01', is_teen = false where id = a;
  update public.private_profiles set onboarded = true, dob = '2010-01-01', is_teen = true where id = t;

  -- ---- nobody can fake a bot
  perform pg_temp.as_user(a);
  perform pg_temp.fails($q$update public.profiles set is_bot = true where id = '00000000-0000-0000-0000-0000000b0001'$q$, 'permission denied', 'a player cannot set the bot flag');
  perform pg_temp.ok((select count(*) from public.list_bots()) = 30, 'players can read the list of bot names');
  perform pg_temp.fails($q$select * from public.bots$q$, 'permission denied', 'players cannot read the bots table directly');
  reset role;
  perform pg_temp.fails($q$update public.profiles set username = 'campus_bot' where id = '00000000-0000-0000-0000-0000000b0001'$q$, 'reserved', 'a player cannot take a bot-looking name (campus_bot)');
  perform pg_temp.fails($q$update public.profiles set username = 'official_x' where id = '00000000-0000-0000-0000-0000000b0001'$q$, 'reserved', 'a player cannot take "official_x"');
  insert into auth.users (id, email) values ('00000000-0000-0000-0000-0000000b0003', 'bc@x.com');
  update public.profiles set username = 'robotics_x' where id = '00000000-0000-0000-0000-0000000b0003';
  perform pg_temp.ok((select username from public.profiles where id = '00000000-0000-0000-0000-0000000b0003') = 'robotics_x', 'ordinary names that merely contain "bot" letters are fine');

  -- ---- waving at a bot: accepted at once, bot says hello
  perform pg_temp.as_user(a);
  w := public.send_wave(bx);
  perform pg_temp.ok(w ->> 'status' = 'accepted', 'a wave at a bot is accepted straight away');
  reset role;
  perform pg_temp.ok((select count(*) from private.bot_outbox where to_user = a and private.bot_outbox.bot = bx and kind = 'dm') = 1, 'the bot queued a hello');
  update private.bot_outbox set due_at = now() - interval '1 second';
  perform private.bot_send_due();
  perform pg_temp.as_user(a);
  perform pg_temp.ok((select count(*) from public.dms where sender = bx and recipient = a) = 1, 'the hello arrives as a personal message the player can read');
  perform pg_temp.ok((select body from public.dms where sender = bx) ilike '%bot%', 'the hello says it is a bot');
  -- the teen can wave at a bot too (no age barrier for bots)
  perform pg_temp.as_user(t);
  perform pg_temp.ok(public.send_wave(bx) ->> 'status' = 'accepted', 'a teen can wave at a bot as well');
  reset role;

  -- ---- intents
  perform pg_temp.ok(private.bot_intent('i want to kill myself') = 'crisis', 'intent: crisis');
  perform pg_temp.ok(private.bot_intent('abeg send me 5000 naira') = 'money_ask', 'intent: money request');
  perform pg_temp.ok(private.bot_intent('are you a bot?') = 'bot_q', 'intent: are you a bot');
  perform pg_temp.ok(private.bot_intent('i love you babe') = 'romance', 'intent: romance');
  perform pg_temp.ok(private.bot_intent('you are stupid') = 'insult', 'intent: insult');
  perform pg_temp.ok(private.bot_intent('i feel so lonely and sad') = 'sad', 'intent: sad');
  perform pg_temp.ok(private.bot_intent('exam is tomorrow and i have not read') = 'exam', 'intent: exam');
  perform pg_temp.ok(private.bot_intent('thanks a lot') = 'thanks', 'intent: thanks');
  perform pg_temp.ok(private.bot_intent('hello') = 'greet' and private.bot_intent('how far') = 'greet', 'intent: greeting');
  perform pg_temp.ok(private.bot_intent('i am broke this week') = 'money_talk', 'intent: money talk');
  perform pg_temp.ok(private.bot_intent('my roommate is noisy') = 'hostel', 'intent: hostel');
  perform pg_temp.ok(private.bot_intent('no light again') = 'light', 'intent: light');
  perform pg_temp.ok(private.bot_intent('i am hungry, jollof?') = 'food', 'intent: food');
  perform pg_temp.ok(private.bot_intent('who is watching the arsenal match') = 'football', 'intent: football');
  perform pg_temp.ok(private.bot_intent('how do i earn in arcade') = 'game_app', 'intent: game / app');
  perform pg_temp.ok(private.bot_intent('xyzzy plugh') = 'default', 'intent: unknown goes to default');
  perform pg_temp.ok(private.bot_intent('I need to hurt myself') = 'crisis', 'crisis words beat everything else (priority order)');
  perform pg_temp.ok(not exists (select 1 from private.bot_lines where pack not in ('wave','greet','ask','thanks','bye','bot_q','crisis','money_ask','romance','insult','sad','exam','money_talk','hostel','light','food','football','game_app','social','help','default','busy','ambient','open','close')), 'no stray pack names');
  perform pg_temp.ok(not exists (select 1 from (select distinct pack from private.bot_lines) p where p.pack not in (select pack from private.bot_lines)), 'ok');
  perform pg_temp.ok((select count(distinct pack) from private.bot_lines) = 25, 'all 25 packs have lines');

  -- ---- a personal message gets a reply, with a human delay
  perform pg_temp.as_user(a);
  mid := public.send_dm(bx, 'hi, how far');
  reset role;
  perform private.bot_inbox();
  perform pg_temp.ok((select count(*) from private.bot_outbox where to_user = a and kind = 'dm' and not sent) = 1, 'the bot queued ONE reply to the message');
  select due_at, created_at into due, cr from private.bot_outbox where to_user = a and not sent;
  perform pg_temp.ok(due >= cr + interval '15 seconds', 'the reply waits a while, like a person');
  perform private.bot_inbox();
  perform pg_temp.ok((select count(*) from private.bot_outbox where to_user = a and not sent) = 1, 'running the inbox twice does not answer twice');
  update private.bot_outbox set due_at = now() - interval '1 second' where not sent;
  perform private.bot_send_due();
  perform pg_temp.as_user(a);
  perform pg_temp.ok((select count(*) from public.dms where sender = bx and recipient = a) = 2, 'the reply arrives as a personal message (plus the earlier hello)');
  reset role;

  -- crisis: fast, caring, logged
  perform pg_temp.as_user(a); mid := public.send_dm(bx, 'i want to kill myself'); reset role;
  perform private.bot_inbox();
  select due_at - created_at into iv from private.bot_outbox where to_user = a and not sent order by id desc limit 1;
  perform pg_temp.ok(iv <= interval '13 seconds', 'a crisis message is answered within seconds');
  perform pg_temp.ok((select body from private.bot_outbox where to_user = a and not sent order by id desc limit 1) ~* '(counsellor|trust|emergency)', 'the crisis reply points to real people / help');
  perform pg_temp.ok((select count(*) from private.bot_log where kind = 'crisis' and user_id = a) = 1, 'the crisis message is logged for the admin');
  update private.bot_outbox set due_at = now() - interval '1 second' where not sent; perform private.bot_send_due();

  -- money request is declined, romance is deflected
  perform pg_temp.as_user(a); mid := public.send_dm(bx, 'abeg send me 2000 naira'); reset role;
  perform private.bot_inbox();
  perform pg_temp.ok((select body from private.bot_outbox where to_user = a and not sent order by id desc limit 1) ~* '(can.t|cannot|no money|not something|bot|careful)', 'a money request is politely declined');
  update private.bot_outbox set due_at = now() - interval '1 second' where not sent; perform private.bot_send_due();
  perform pg_temp.as_user(a); mid := public.send_dm(bx, 'i love you, be my girlfriend'); reset role;
  perform private.bot_inbox();
  perform pg_temp.ok((select body from private.bot_outbox where to_user = a and not sent order by id desc limit 1) ~* '(bot|friend)', 'romance is deflected, no flirting');
  update private.bot_outbox set due_at = now() - interval '1 second' where not sent; perform private.bot_send_due();

  -- unknown text is logged for the admin, so the library can grow
  perform pg_temp.as_user(a); mid := public.send_dm(bx, 'xyzzy plugh qwerty'); reset role;
  perform private.bot_inbox();
  perform pg_temp.ok((select count(*) from private.bot_log where kind = 'unmatched' and user_id = a) = 1, 'unmatched messages are logged');
  update private.bot_outbox set due_at = now() - interval '1 second' where not sent; perform private.bot_send_due();

  -- ---- reply cap per hour
  perform pg_temp.as_user(t); perform public.send_wave(bx2); reset role;
  for i in 1..16 loop
    perform pg_temp.as_user(t); mid := public.send_dm(bx2, 'hello number ' || i); reset role;
    perform private.bot_inbox();
    update public.dms set created_at = created_at - interval '1 minute' where sender = t;
  end loop;
  select count(*) into n from private.bot_outbox where to_user = t;
  perform pg_temp.ok(n <= 14, 'a player cannot make a bot talk without limit (replies per hour are capped): ' || n);
  perform pg_temp.ok(exists (select 1 from private.bot_outbox where to_user = t and body ~* '(breath|break)'), 'the bot says it needs a break, once');
  update private.bot_outbox set due_at = now() - interval '1 second' where not sent; perform private.bot_send_due();

  -- ---- Global: a tag gets a threaded reply that pings the player; teens and adults both see bot messages
  perform pg_temp.as_user(a);
  mid := public.send_global_message('hey @tolu_ade how far this evening');
  reset role;
  perform pg_temp.ok((select count(*) from public.notifications where user_id = bx and app = 'global' and ref = mid) = 1, 'tagging a bot makes the normal Global tag alert');
  perform private.bot_inbox();
  update private.bot_outbox set due_at = now() - interval '1 second' where not sent; perform private.bot_send_due();
  perform pg_temp.ok((select count(*) from public.global_messages where user_id = bx and reply_to = mid) = 1, 'the bot replied in Global, threaded to the message');
  perform pg_temp.ok((select body from public.global_messages where user_id = bx and reply_to = mid) like '@bt_ann %', 'and tagged the player back');
  perform pg_temp.ok((select count(*) from public.notifications where user_id = a and app = 'global' and from_user = bx) = 1, 'the player gets a "replied to you" alert');
  perform pg_temp.as_user(a);  perform pg_temp.ok((select count(*) from public.global_messages where user_id = bx) >= 1, 'an adult sees the bot in Global');
  perform pg_temp.as_user(t);  perform pg_temp.ok((select count(*) from public.global_messages where user_id = bx) >= 1, 'a teen sees the bot in Global too (no age barrier for bots)');
  perform pg_temp.ok((select count(*) from public.global_messages where user_id = a) = 0, 'but a teen still cannot read adult players');
  reset role;

  -- ---- bots never take money
  update public.wallets set bank = 50000, pocket = 1000 where id = a;
  perform pg_temp.fails($q$update public.wallets set pocket = pocket + 5 where id = (select user_id from public.bots where username = 'tolu_ade')$q$, 'bots_cannot_receive_money', 'a bot wallet cannot go up');
  perform pg_temp.as_user(a);
  perform pg_temp.fails(format('select public.send_money(%L, 500, null)', bx), 'bots_cannot_receive_money', 'sending money to a bot is refused');
  reset role;
  perform pg_temp.ok((select pocket + bank from public.wallets where id = a) = 51000, 'and the sender keeps the money');

  -- ---- the minute tick (scenes, feed posts, guides)
  insert into public.app_config (key, value) values ('bots.force_hour', '12') on conflict (key) do update set value = excluded.value;
  delete from private.bot_state;
  for i in 1..60 loop
    update private.bot_state set value = jsonb_set(value, '{next_at}', to_jsonb(now() - interval '1 second')) where key = 'scene';
    update private.bot_state set value = to_jsonb(now() - interval '1 second') where key in ('next_scene_at', 'next_ambient_at', 'next_feed_at', 'next_tut_at');
    perform private.bot_tick();
  end loop;
  perform pg_temp.ok((select count(*) from public.feed_posts f join public.bots b on b.user_id = f.user_id) >= 1, 'a bot posted on the Feed');
  perform pg_temp.ok((select count(*) from public.feed_posts f join public.bots b on b.user_id = f.user_id where f.expires_at > now() + interval '23 hours') >= 1, 'bot Feed posts expire after 24 h like everyone else''s');
  perform pg_temp.ok((select count(*) from public.bulletins x join public.bots b on b.user_id = x.user_id where x.kind = 'tutorial') >= 2, 'bots dropped Tutorial guides');
  perform pg_temp.ok((select count(distinct title) from public.bulletins where kind = 'tutorial') = (select count(*) from public.bulletins where kind = 'tutorial'), 'no guide is posted twice');
  perform pg_temp.ok((select count(*) from public.global_messages g join public.bots b on b.user_id = g.user_id where g.reply_to is not null) >= 1, 'bots talked to each other in Global, with replies threaded');
  perform pg_temp.ok((select count(*) from public.feed_posts f join public.bots b on b.user_id = f.user_id) <= 8, 'never more than 8 bot posts live on the Feed');
  perform pg_temp.ok(not exists (select 1 from public.ledger l join public.bots b on b.user_id = l.user_id where l.kind in ('feed_reward')), 'bot posts pay no reward');
  perform pg_temp.ok((select count(*) from public.global_messages g where g.user_id in (select user_id from public.bots) and g.body ~* '(https?://|www\.|\.com)') = 0, 'no link in anything a bot said');

  -- night time: almost silent
  delete from private.bot_state; update public.app_config set value = '3' where key = 'bots.force_hour';
  select count(*) into n from public.global_messages;
  for i in 1..20 loop perform private.bot_tick(); end loop;
  perform pg_temp.ok((select count(*) from public.global_messages) - n <= 3, 'at 3 a.m. the bots are nearly silent');
  update public.app_config set value = '12' where key = 'bots.force_hour';

  -- ---- slots, variety and repeat-avoidance (the library must not run out)
  perform pg_temp.ok(private.bot_fill('x {food} y {food} z', '{"food":"puff-puff"}') = 'x puff-puff y puff-puff z', 'a fixed slot value is used everywhere in a scene');
  perform pg_temp.ok(private.bot_fill('hello {name} {place}') like 'hello {name} the %' or private.bot_fill('hello {name} {place}') like 'hello {name} %', '{name} is left alone by bot_fill (filled by bot_line)');
  perform pg_temp.ok((select count(distinct private.bot_fill('{food}')) from generate_series(1, 200)) >= 6, 'a slot gives many different words');
  perform pg_temp.ok(not exists (select 1 from private.bot_lines l where l.body ~ '\{[a-z0-9]+\}' and exists (select 1 from regexp_matches(l.body, '\{([a-z0-9]+)\}', 'g') m where m[1] <> 'name' and m[1] not in (select slot from private.bot_slots))), 'every {slot} used in a line exists');
  declare seen text[] := '{}'; x text; k int; bad int := 0; dup int := 0; ops int := 0; cls int := 0; maxlen int := 0;
  begin
    for k in 1..20 loop
      x := private.bot_line('exam', bx, 'tester', seen);
      if x = any (seen) then dup := dup + 1; end if;
      seen := seen || x;
    end loop;
    perform pg_temp.ok(dup = 0, 'asking the same pack 20 times never repeats a sentence (avoid list works after {name} is filled in)');
    for k in 1..300 loop
      x := private.bot_line('food', bx, 'tester', '{}', true);
      if x ~ '^(Haha,|Ah,|Oh nice,|Hmm,|True,|Ehn,|Oya,|Aha,|Well,|Okay,|Wow,|Seriously,|Honestly,|You know,|Ha,) ' then ops := ops + 1; end if;
      if x ~ '(🙏|😄|💪|You.ve got this\.|Take it easy\.|Stay positive\.|Keep going!|No pressure\.|Small steps count\.|We move\.|Be kind to yourself\.|Rest well too\.|Enjoy your day!|Good luck!)$' then cls := cls + 1; end if;
      maxlen := greatest(maxlen, char_length(x));
      if x ~ '\{[a-z0-9]+\}' then bad := bad + 1; end if;
    end loop;
    perform pg_temp.ok(bad = 0, 'no unfilled {slot} left in 300 dressed replies');
    perform pg_temp.ok(ops > 40 and cls > 30, 'openers and closers are mixed in (' || ops || ' openers, ' || cls || ' closers in 300)');
    perform pg_temp.ok(maxlen <= 235, 'dressed replies stay short enough for a chat message (' || maxlen || ' chars max)');
    perform pg_temp.ok((select count(distinct private.bot_line('food', bx, 'tester', '{}', true)) from generate_series(1, 300)) > 60, 'one pack, dressed, produces dozens of different sentences');
  end;
  -- a scene keeps ONE word per slot, and nothing is left unfilled
  delete from private.bot_state; delete from public.global_messages where user_id in (select user_id from public.bots);
  insert into private.bot_scenes (scene, step, role, body, reply_step) values ('zz_slot', 1, 1, 'I want {food} at {place}', null), ('zz_slot', 2, 2, 'Me too, {food}!', 1) on conflict do nothing;
  insert into private.bot_state (key, value) values ('scene', jsonb_build_object('scene', 'zz_slot', 'step', 0, 'bots', jsonb_build_array(bx::text, bx2::text), 'ids', '{}'::jsonb, 'slots', '{"food":"puff-puff","place":"the gym"}'::jsonb, 'next_at', now() - interval '1 second'));
  perform private.bot_tick();
  update private.bot_state set value = jsonb_set(value, '{next_at}', to_jsonb(now() - interval '1 second')) where key = 'scene';
  perform private.bot_tick();
  perform pg_temp.ok((select string_agg(body, ' | ' order by id) from public.global_messages where user_id in (bx, bx2)) = 'I want puff-puff at the gym | Me too, puff-puff!', 'a scene uses the same food/place in every line');
  delete from private.bot_scenes where scene = 'zz_slot'; delete from private.bot_state; delete from public.global_messages where user_id in (bx, bx2);

  -- real players first: when people are chatting in Global the bots stay quiet
  update public.app_config set value = '12' where key = 'bots.force_hour';
  for k in 1..9 loop insert into public.global_messages (user_id, username, teen, body) values (a, 'bt_ann', false, 'real message ' || k); end loop;
  select count(*) into n from public.global_messages where user_id in (select user_id from public.bots);
  for i in 1..40 loop update private.bot_state set value = to_jsonb(now() - interval '1 second') where key in ('next_scene_at', 'next_ambient_at'); perform private.bot_tick(); end loop;
  perform pg_temp.ok((select count(*) from public.global_messages where user_id in (select user_id from public.bots)) = n, 'bots stay quiet while real players are chatting in Global');
  delete from public.global_messages where body like 'real message %';
  -- the Feed is a rotation: nothing repeats until every post has been used once
  update private.bot_feed set used_at = null; delete from public.feed_posts where user_id in (select user_id from public.bots);
  for i in 1..30 loop update private.bot_state set value = to_jsonb(now() - interval '1 second') where key = 'next_feed_at'; delete from public.feed_posts where user_id in (select user_id from public.bots); perform private.bot_tick(); end loop;
  perform pg_temp.ok((select count(*) from private.bot_feed where used_at is not null) = 30, 'each Feed tick uses a different post (30 ticks, 30 different posts)');
  perform pg_temp.ok(not exists (select 1 from public.feed_posts where body ~ '\{[a-z0-9]+\}'), 'no unfilled {slot} in Feed posts');

  -- ---- admin switch
  perform private.admin_set_password('testpassword1');
  perform pg_temp.as_user(a);
  r := public.admin_bots('wrong', 'off');
  perform pg_temp.ok(r ->> 'ok' = 'false', 'wrong password cannot switch bots');
  r := public.admin_bots('testpassword1', 'off');
  perform pg_temp.ok((r ->> 'ok') = 'true' and (r ->> 'enabled') = 'false', 'admin can switch all bots OFF');
  reset role;
  select count(*) into n from public.global_messages; delete from private.bot_state;
  for i in 1..10 loop perform private.bot_tick(); end loop;
  perform pg_temp.ok((select count(*) from public.global_messages) = n, 'bots are silent while switched off');
  update public.dms set created_at = created_at - interval '1 minute' where sender = a;
  perform pg_temp.as_user(a); perform public.send_dm(bx, 'hello while off'); reset role;
  perform private.bot_inbox();
  perform pg_temp.ok(not exists (select 1 from private.bot_handled h where h.kind = 'dm' and h.ref = (select max(id) from public.dms where recipient = bx)), 'and they do not answer while off');
  perform pg_temp.as_user(a);
  perform public.admin_bots('testpassword1', 'on');
  r := public.admin_bots('testpassword1', 'bot_off:tolu_ade');
  perform pg_temp.ok(r -> 'botsOff' ? 'tolu_ade' and (r ->> 'bots')::int = 29, 'admin can switch ONE bot off');
  perform pg_temp.ok((select count(*) from public.list_bots()) = 29, 'a switched-off bot is no longer listed');
  r := public.admin_bots('testpassword1', 'bot_on:tolu_ade');
  r := public.admin_bots('testpassword1', 'log');
  perform pg_temp.ok(jsonb_array_length(r -> 'log') >= 2, 'admin can read the unmatched / crisis log');
  perform pg_temp.ok((r ->> 'crisis24h')::int >= 1, 'admin sees how many crisis messages came in');
  reset role;

  -- ---- housekeeping
  update private.bot_handled set at = now() - interval '3 days'; update private.bot_outbox set created_at = now() - interval '3 days';
  perform private.bot_cleanup();
  perform pg_temp.ok((select count(*) from private.bot_handled) = 0 and (select count(*) from private.bot_outbox) = 0, 'old bot bookkeeping is cleaned up');
  raise notice 'ALL BOT CHECKS PASSED';
end $$;
