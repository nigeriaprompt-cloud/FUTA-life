-- LOCAL TEST for 18_bulletins.sql (NEPA + Tutorial apps). Run by run.sh after 18_bulletins.sql. Throwaway Postgres only.
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
  a uuid := '00000000-0000-0000-0000-00000000bc01'; b uuid := '00000000-0000-0000-0000-00000000bc02'; c uuid := '00000000-0000-0000-0000-00000000bc03';
  d uuid := '00000000-0000-0000-0000-00000000bc04'; n uuid := '00000000-0000-0000-0000-00000000bc05';   -- n = not finished sign-up
  r jsonb; i int; tid bigint; nid bigint; nid2 bigint;
begin
  insert into auth.users (id, email) values (a, 'ba@x.com'), (b, 'bb@x.com'), (c, 'bc@x.com'), (d, 'bd@x.com'), (n, 'bn@x.com');
  update public.profiles set username = 'bull_' || right(id::text, 2) where id in (a, b, c, d, n);
  update public.private_profiles set onboarded = true, dob = '2000-01-01' where id in (a, b, c, d);
  insert into public.app_config (key, value) values ('bulletin.nepa_gap', '0'::jsonb), ('bulletin.tut_gap', '0'::jsonb) on conflict (key) do update set value = excluded.value;

  -- ---- access
  perform pg_temp.as_anon();
  perform pg_temp.fails($q$select public.post_nepa('on', 'Obanla campus', '')$q$, 'permission denied', 'anon cannot post to NEPA');
  perform pg_temp.fails($q$select * from public.bulletins$q$, 'permission denied', 'anon cannot read the board');
  reset role;
  perform pg_temp.as_user(n);
  perform pg_temp.fails($q$select public.post_nepa('on', 'Obanla campus', '')$q$, 'finish_sign_up', 'must finish sign-up before posting');
  reset role;

  -- ---- NEPA: validation
  perform pg_temp.as_user(a);
  perform pg_temp.fails($q$insert into public.bulletins (kind, user_id, username, body, body_hash) values ('nepa', auth.uid(), 'x', 'y', 'z')$q$, 'permission denied', 'no direct insert');
  perform pg_temp.fails($q$select public.post_nepa('blue', 'Obanla campus', '')$q$, 'bad_status', 'unknown status refused');
  perform pg_temp.fails($q$select public.post_nepa('on', 'x', '')$q$, 'bad_place', 'one-letter place refused');
  perform pg_temp.fails($q$select public.post_nepa('on', 'www.scam.com', '')$q$, 'bad_place', 'link as place refused');
  perform pg_temp.fails($q$select public.post_nepa('on', 'Obanla <b>', '')$q$, 'bad_place', 'odd characters in place refused');
  perform pg_temp.fails($q$select public.post_nepa('on', 'Obanla campus', 'too short')$q$, 'post_not_allowed', 'note under 10 characters refused');
  perform pg_temp.fails($q$select public.post_nepa('on', 'Obanla campus', 'see www.scam.com for light news')$q$, 'post_not_allowed', 'link in note refused');
  perform pg_temp.fails($q$select public.post_nepa('on', 'Obanla campus', 'call me on 08031234567 for power')$q$, 'post_not_allowed', 'phone number in note refused');
  perform pg_temp.fails($q$select public.post_nepa('on', 'Obanla campus', repeat('word ', 60))$q$, 'post_not_allowed', 'note over 200 characters refused');

  -- ---- NEPA: posting, duplicates, daily limit
  r := public.post_nepa('on', 'Obanla campus', 'Light just came back at the library');
  nid := (r->>'id')::bigint;
  perform pg_temp.ok((r->>'posts_left')::int = 9, 'first update: 9 left');
  perform pg_temp.ok((select expires_at from public.bulletins where id = nid) between now() + interval '11 hours 59 minutes' and now() + interval '12 hours 1 minute', 'NEPA update expires after 12 hours');
  perform pg_temp.fails($q$select public.post_nepa('on', 'obanla campus', 'Same thing but again please')$q$, 'duplicate_post', 'same status + place twice refused (case-insensitive)');
  r := public.post_nepa('off', 'Obanla campus', '');
  nid2 := (r->>'id')::bigint;
  perform pg_temp.ok(true, 'different status for the same place is fine, note is optional');
  perform public.post_nepa('low', 'Postgraduate campus', '');
  for i in 4..10 loop perform public.post_nepa('news', 'Spot ' || i, ''); end loop;
  perform pg_temp.fails($q$select public.post_nepa('news', 'Spot 11', '')$q$, 'daily_limit', '11th update in a day refused');
  perform pg_temp.ok((public.get_bulletin_status('nepa')->>'posts_left')::int = 0 and (public.get_bulletin_status('tutorial')->>'posts_left')::int = 3, 'status: 0 NEPA left, 3 tutorials left');
  perform pg_temp.fails($q$select public.get_bulletin_status('other')$q$, 'bad_kind', 'unknown kind refused');

  -- ---- Tutorial: validation, posting, limits
  perform pg_temp.fails($q$select public.post_tutorial('How to save light at night', 'Cooking', repeat('plug off the extension box when you leave ', 3))$q$, 'bad_category', 'unknown category refused');
  perform pg_temp.fails($q$select public.post_tutorial('Hi', 'Tech', repeat('plug off the extension box when you leave ', 3))$q$, 'post_not_allowed', 'short title refused');
  perform pg_temp.fails($q$select public.post_tutorial('How to save light at night', 'Tech', 'too short to be a guide')$q$, 'post_not_allowed', 'short guide refused');
  perform pg_temp.fails($q$select public.post_tutorial('How to save light at night', 'Tech', repeat('visit www.scam.com now to learn more ', 3))$q$, 'post_not_allowed', 'link in guide refused');
  r := public.post_tutorial('How to save light at night', 'Tech', E'Step one: plug off the extension box.\nStep two: switch off the sockets when you leave the room.\nStep three: charge your phone in the daytime.');
  tid := (r->>'id')::bigint;
  perform pg_temp.ok((r->>'posts_left')::int = 2, 'first tutorial: 2 left');
  perform pg_temp.ok((select expires_at from public.bulletins where id = tid) is null, 'tutorials never expire');
  perform pg_temp.ok((select position(E'\n' in body) > 0 from public.bulletins where id = tid), 'line breaks are kept in the guide');
  perform public.post_tutorial('Study timetable that works', 'Study', repeat('block out two hours each day for the hardest course ', 2));
  perform public.post_tutorial('Budget a month with ease', 'Money', repeat('write down what comes in and what goes out every week ', 2));
  perform pg_temp.fails($q$select public.post_tutorial('Fourth guide of the day here', 'Skills', repeat('practice a little each day until it feels easy ', 3))$q$, 'daily_limit', '4th tutorial in a day refused');
  reset role;

  -- ---- Tutorial: duplicate title by someone else
  perform pg_temp.as_user(b);
  perform pg_temp.fails($q$select public.post_tutorial('how to save light at night', 'Tech', repeat('plug off the extension box when you leave ', 3))$q$, 'duplicate_post', 'a live title cannot be used twice');

  -- ---- reading
  perform pg_temp.ok((select count(*) from public.bulletins where kind = 'nepa') = 10 and (select count(*) from public.bulletins where kind = 'tutorial') = 3, 'b sees 10 NEPA updates and 3 tutorials');
  reset role;
  update public.bulletins set expires_at = now() - interval '1 minute' where id = nid;
  perform pg_temp.as_user(b);
  perform pg_temp.ok((select count(*) from public.bulletins where kind = 'nepa') = 9, 'an expired NEPA update disappears');
  perform public.block_user(a);
  perform pg_temp.ok((select count(*) from public.bulletins where user_id = a) = 0, 'a blocked player''s posts are hidden');
  perform public.unblock_user(a);
  perform pg_temp.ok((select count(*) from public.bulletins where user_id = a) > 0, 'unblocking brings them back');

  -- ---- votes ("I see this too" / "Helpful")
  r := public.vote_bulletin(tid);
  perform pg_temp.ok((r->>'helpful')::int = 1 and (r->>'voted')::boolean, 'b votes: 1');
  r := public.vote_bulletin(tid);
  perform pg_temp.ok((r->>'helpful')::int = 0 and not (r->>'voted')::boolean, 'tapping again takes the vote back');
  perform public.vote_bulletin(tid);
  perform pg_temp.ok((select count(*) from public.bulletin_votes) = 1, 'b sees only their own votes');
  perform pg_temp.fails(format($q$select public.vote_bulletin(%s)$q$, nid), 'not_found', 'cannot vote on an expired update');
  reset role;
  perform pg_temp.as_user(c);
  r := public.vote_bulletin(tid);
  perform pg_temp.ok((r->>'helpful')::int = 2, 'c votes: 2 in total');
  reset role;
  perform pg_temp.as_user(a);
  perform pg_temp.fails(format($q$select public.vote_bulletin(%s)$q$, tid), 'own_post', 'cannot vote on your own post');
  perform pg_temp.ok((select count(*) from public.bulletin_votes) = 0, 'a sees none of the other players'' votes');
  reset role;
  perform pg_temp.as_anon();
  perform pg_temp.fails(format($q$select public.vote_bulletin(%s)$q$, tid), 'permission denied', 'anon cannot vote');
  reset role;

  -- ---- NEPA gap between updates
  insert into public.app_config (key, value) values ('bulletin.nepa_gap', '60'::jsonb) on conflict (key) do update set value = excluded.value;
  perform pg_temp.as_user(b);
  perform public.post_nepa('on', 'Aule', 'Power is stable here now');
  perform pg_temp.fails($q$select public.post_nepa('off', 'Aule', 'Power just went off again')$q$, 'slow_down', '60 s gap enforced');
  reset role;
  insert into public.app_config (key, value) values ('bulletin.nepa_gap', '0'::jsonb) on conflict (key) do update set value = excluded.value;

  -- ---- reports: 3 different players hide a post
  perform pg_temp.as_user(b);
  perform pg_temp.fails(format($q$select public.report_bulletin(%s, 'rude')$q$, tid), 'bad_reason', 'unknown reason refused');
  perform public.report_bulletin(tid, 'spam');
  perform pg_temp.fails(format($q$select public.report_bulletin(%s, 'spam')$q$, tid), 'already_reported', 'one report per player per post');
  perform pg_temp.ok((select count(*) from public.bulletins where id = tid) = 1, 'one report does not hide it');
  reset role;
  perform pg_temp.as_user(c);
  perform public.report_bulletin(tid, 'inappropriate');
  reset role;
  perform pg_temp.as_user(a);
  perform pg_temp.fails(format($q$select public.report_bulletin(%s, 'spam')$q$, tid), 'own_post', 'cannot report your own post');
  reset role;
  perform pg_temp.as_user(d);
  perform public.report_bulletin(tid, 'spam');
  perform pg_temp.ok((select count(*) from public.bulletins where id = tid) = 0, 'the third report hides the post');
  reset role;
  perform pg_temp.ok((select count(*) from public.reports where context = 'bulletin:' || tid) = 3, 'the admin sees all 3 reports in public.reports');

  -- ---- author removes their own post
  perform pg_temp.as_user(b);
  perform pg_temp.fails(format($q$select public.delete_bulletin(%s)$q$, nid2), 'not_found', 'cannot remove someone else''s post');
  reset role;
  perform pg_temp.as_user(a);
  perform public.delete_bulletin(nid2);
  perform pg_temp.ok((select count(*) from public.bulletins where id = nid2) = 0, 'removed post disappears');
  perform pg_temp.fails(format($q$select public.delete_bulletin(%s)$q$, nid2), 'not_found', 'removing twice refused');
  perform pg_temp.ok((public.get_bulletin_status('nepa')->>'posts_left')::int = 0, 'removing does not give the daily posts back');
  reset role;

  -- ---- cleanup
  update public.bulletins set expires_at = now() - interval '3 days' where id = nid;
  perform private.bulletin_cleanup();
  perform pg_temp.ok(not exists (select 1 from public.bulletins where id = nid), 'cleanup removes NEPA updates expired > 2 days ago');
  raise notice 'ALL BULLETIN TESTS PASSED';
end $$;
