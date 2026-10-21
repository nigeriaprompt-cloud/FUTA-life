-- LOCAL TEST for 20_forum.sql. Throwaway Postgres only.
-- LOCAL TEST for 18_global_chat.sql. Throwaway Postgres only.
create or replace function pg_temp.as_user(u uuid) returns void language plpgsql as $$
begin perform set_config('request.jwt.claim.sub', coalesce(u::text, ''), true); execute 'set local role authenticated'; end $$;
create or replace function pg_temp.ok(c boolean, msg text) returns void language plpgsql as $$
begin if c is not true then raise exception 'FAIL: %', msg; end if; raise notice 'ok  - %', msg; end $$;
grant execute on all functions in schema pg_temp to public;

do $$
declare
  a uuid := '00000000-0000-0000-0000-00000000fa01'; b uuid := '00000000-0000-0000-0000-00000000fa02'; c uuid := '00000000-0000-0000-0000-00000000fa03'; d uuid := '00000000-0000-0000-0000-00000000fa04'; t uuid := '00000000-0000-0000-0000-00000000fa05';
  tid bigint; pid bigint; ok boolean; n int;
begin
  insert into auth.users (id, email) values (a, 'fa@x.com'), (b, 'fb@x.com'), (c, 'fc@x.com'), (d, 'fd@x.com'), (t, 'ft@x.com');
  update public.private_profiles set onboarded = true, dob = '1990-01-01', is_teen = false where id in (a, b, c, d);
  update public.private_profiles set onboarded = true, dob = '2010-01-01', is_teen = true where id = t;
  update public.profiles set username = case id when a then 'fr_ann' when b then 'fr_ben' when c then 'fr_cy' when d then 'fr_dee' else 'fr_teen' end where id in (a, b, c, d, t);
  perform pg_temp.as_user(a);
  tid := public.forum_new_topic('dls', 'tips', 'Best formation for DLS', 'I use 4-3-3 with two fast wingers, it wins a lot');
  perform pg_temp.ok(tid is not null, 'a signed-in player opens a DLS topic');
  ok := false; begin perform public.forum_new_topic('dls', 'tips', 'Another topic here', 'second one right away please'); exception when others then ok := sqlerrm like '%slow_down%'; end;
  perform pg_temp.ok(ok, 'topics must be 2 minutes apart');
  ok := false; begin perform public.forum_new_topic('chess', 'talk', 'Chess time', 'who plays chess here'); exception when others then ok := sqlerrm like '%bad_board%'; end;
  perform pg_temp.ok(ok, 'unknown board refused');
  reset role; update public.forum_topics set created_at = created_at - interval '1 hour'; perform pg_temp.as_user(a);
  ok := false; begin perform public.forum_new_topic('efootball', 'match', 'Join my club', 'add me at http://spam.com now'); exception when others then ok := sqlerrm like '%message_not_allowed%'; end;
  perform pg_temp.ok(ok, 'links are refused');
  ok := false; begin perform public.forum_new_topic('efootball', 'match', 'call me', 'my number is 08012345678 ok'); exception when others then ok := sqlerrm like '%message_not_allowed%'; end;
  perform pg_temp.ok(ok, 'phone numbers are refused');

  perform pg_temp.as_user(b);
  perform pg_temp.ok((select count(*) from public.forum_topics where board = 'dls') = 1, 'other adults read it');
  pid := public.forum_reply(tid, 'Try 4-2-3-1 too, works for me');
  reset role; perform pg_temp.ok((select replies from public.forum_topics where id = tid) = 1, 'a reply bumps the reply count');
  perform pg_temp.as_user(t);
  perform pg_temp.ok((select count(*) from public.forum_topics) = 0, 'teens cannot read adult topics');
  ok := false; begin perform public.forum_reply(tid, 'hello adult topic'); exception when others then ok := sqlerrm like '%not_found%'; end;
  perform pg_temp.ok(ok, 'teens cannot reply to adult topics');
  perform public.forum_new_topic('efootball', 'squad', 'My teen squad', 'Looking for tips to build a squad');
  perform pg_temp.as_user(a); perform pg_temp.ok((select count(*) from public.forum_topics where username = 'fr_teen') = 0, 'adults cannot read teen topics');

  -- blocks
  reset role; insert into public.blocks (blocker, blocked) values (a, b); perform pg_temp.as_user(a);
  perform pg_temp.ok((select count(*) from public.forum_posts where user_id = b) = 0, 'blocked players are hidden');
  reset role; delete from public.blocks;

  -- reports: 3 different players hide a reply; cannot report your own
  perform pg_temp.as_user(a); ok := false; begin perform public.forum_report('topic', tid); exception when others then ok := sqlerrm like '%not_allowed%'; end; perform pg_temp.ok(ok, 'you cannot report your own post');
  perform pg_temp.as_user(a); perform public.forum_report('post', pid); perform pg_temp.as_user(c); perform public.forum_report('post', pid); perform pg_temp.as_user(c); perform public.forum_report('post', pid);
  reset role; perform pg_temp.ok(not (select hidden from public.forum_posts where id = pid), 'the same player reporting twice counts once');
  perform pg_temp.as_user(d); perform public.forum_report('post', pid); reset role;
  perform pg_temp.ok((select hidden from public.forum_posts where id = pid), '3 different reports hide the reply');

  -- author removes own topic; others cannot
  perform pg_temp.as_user(b); perform public.forum_delete('topic', tid); reset role; perform pg_temp.ok(not (select hidden from public.forum_topics where id = tid), 'someone else cannot remove my topic');
  perform pg_temp.as_user(a); perform public.forum_delete('topic', tid); reset role; perform pg_temp.ok((select hidden from public.forum_topics where id = tid), 'the author can remove their topic');
  -- direct writes blocked
  perform pg_temp.as_user(a); ok := false; begin insert into public.forum_topics (board, tag, user_id, username, title, body) values ('dls', 'talk', a, 'x', 'direct insert', 'direct insert body'); exception when others then ok := true; end;
  perform pg_temp.ok(ok, 'no direct inserts'); reset role;
end $$;
