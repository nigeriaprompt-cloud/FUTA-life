-- LOCAL TEST for 05_feed.sql. Run by run.sh after test.sql. Throwaway Postgres only.
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
  a uuid := '00000000-0000-0000-0000-0000000000f1'; b uuid := '00000000-0000-0000-0000-0000000000f2'; n uuid := '00000000-0000-0000-0000-0000000000f3';   -- n = not finished sign-up
  r jsonb; i int; first_id bigint;
begin
  insert into auth.users (id, email) values (a, 'fa@x.com'), (b, 'fb@x.com'), (n, 'fn@x.com');
  update public.profiles set username = 'feed_' || right(id::text, 2) where id in (a, b, n);
  update public.private_profiles set onboarded = true, dob = '2000-01-01' where id in (a, b);
  insert into public.app_config (key, value) values ('feed.gap_seconds', '0'::jsonb) on conflict (key) do update set value = excluded.value;

  -- access
  perform pg_temp.as_anon();
  perform pg_temp.fails($q$select public.post_to_feed('hello there my friends', 'sunset')$q$, 'permission denied', 'anon cannot post');
  perform pg_temp.fails($q$select * from public.feed_posts$q$, 'permission denied', 'anon cannot read the feed');
  reset role;
  perform pg_temp.as_user(n);
  perform pg_temp.fails($q$select public.post_to_feed('hello there my friends', 'sunset')$q$, 'finish_sign_up', 'must finish sign-up before posting');
  reset role;

  -- posting + reward goes to the BANK (not pocket)
  perform pg_temp.as_user(a);
  perform pg_temp.fails($q$insert into public.feed_posts (user_id, username, body, bg, body_hash) values (auth.uid(), 'x', 'y', 'sunset', 'z')$q$, 'permission denied', 'no direct insert');
  perform pg_temp.fails($q$select public.post_to_feed('hello there my friends', 'neon')$q$, 'bad_background', 'unknown background refused');
  perform pg_temp.fails($q$select public.post_to_feed('too short', 'sunset')$q$, 'post_not_allowed', 'too short refused');
  perform pg_temp.fails($q$select public.post_to_feed(repeat('word ', 80), 'sunset')$q$, 'post_not_allowed', 'too long refused');
  perform pg_temp.fails($q$select public.post_to_feed('visit www.scam.com for money now', 'sunset')$q$, 'post_not_allowed', 'links refused');
  perform pg_temp.fails($q$select public.post_to_feed('call me on 08031234567 right now', 'sunset')$q$, 'post_not_allowed', 'phone numbers refused');
  perform pg_temp.fails($q$select public.post_to_feed('aaaaaaaaaaaaaaaaaaaaaaaa bbbb cccc', 'sunset')$q$, 'post_not_allowed', 'repeated characters refused');
  r := public.post_to_feed('First light over Akure campus today', 'sunset');
  first_id := (r->>'id')::bigint;
  perform pg_temp.ok((r->>'reward')::bigint = 500 and (r->>'posts_left')::int = 6, 'first post pays 500, 6 left');
  perform pg_temp.ok((select bank from public.wallets where id = a) = 500 and (select pocket from public.wallets where id = a) = 0, '500 landed in the BANK, pocket untouched');
  perform pg_temp.ok((select count(*) from public.ledger where user_id = a and kind = 'feed_reward' and d_bank = 500 and d_pocket = 0) = 1, 'ledger row feed_reward written');
  perform pg_temp.fails($q$select public.post_to_feed('first light over akure campus today', 'ocean')$q$, 'duplicate_post', 'same text twice refused (case-insensitive)');
  for i in 2..7 loop perform public.post_to_feed('Post number ' || i || ' from the feed test user', 'ocean'); end loop;
  perform pg_temp.fails($q$select public.post_to_feed('The eighth post should never be accepted', 'ocean')$q$, 'daily_limit', '8th post in a day refused');
  perform pg_temp.ok((public.get_feed_status()->>'bank')::bigint = 3500 and (public.get_feed_status()->>'posts_left')::int = 0, 'bank 3500 after 7 posts, 0 left');
  perform pg_temp.ok((select sum(d_pocket + d_bank) from public.ledger where user_id = a) = (select pocket + bank from public.wallets where id = a), 'ledger still sums to wallet');
  reset role;

  -- gap between posts
  insert into public.app_config (key, value) values ('feed.gap_seconds', '30'::jsonb) on conflict (key) do update set value = excluded.value;
  perform pg_temp.as_user(b);
  perform public.post_to_feed('Bee writes the very first one', 'forest');
  perform pg_temp.fails($q$select public.post_to_feed('Bee tries another one too quickly', 'forest')$q$, 'slow_down', '30 s gap enforced');
  reset role;
  insert into public.app_config (key, value) values ('feed.gap_seconds', '0'::jsonb) on conflict (key) do update set value = excluded.value;
  perform pg_temp.as_user(b);
  perform public.post_to_feed('Bee second post a little later on', 'forest');

  -- reading the feed
  perform pg_temp.ok((select count(*) from public.feed_posts) = 9, 'b sees all 9 live posts');
  reset role;
  update public.feed_posts set expires_at = now() - interval '1 minute' where id = first_id;
  perform pg_temp.as_user(b);
  perform pg_temp.ok((select count(*) from public.feed_posts) = 8, 'expired post disappears from the feed');
  perform public.block_user(a);
  perform pg_temp.ok((select count(*) from public.feed_posts where user_id = a) = 0, 'blocked player''s posts are hidden');
  perform public.unblock_user(a);
  reset role;

  -- cleanup
  update public.feed_posts set expires_at = now() - interval '2 hours' where id = first_id;
  perform private.feed_cleanup();
  perform pg_temp.ok(not exists (select 1 from public.feed_posts where id = first_id), 'cleanup removes posts expired > 1 h ago');
  raise notice 'ALL FEED TESTS PASSED';
end $$;
