-- LOCAL TEST for 10_chat_social.sql. Run by run.sh after 10_chat_social.sql. Throwaway Postgres only.
create or replace function pg_temp.as_user(u uuid) returns void language plpgsql as $$
begin perform set_config('request.jwt.claim.sub', coalesce(u::text, ''), true); execute 'set local role authenticated'; end $$;
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
  a uuid := '00000000-0000-0000-0000-0000000000c1'; b uuid := '00000000-0000-0000-0000-0000000000c2'; c uuid := '00000000-0000-0000-0000-0000000000c3';
  t uuid := '00000000-0000-0000-0000-0000000000c4'; e uuid := '00000000-0000-0000-0000-0000000000c5';   -- t = teen, c = waves off
  gid bigint; tid bigint; r jsonb; n int;
begin
  insert into auth.users (id, email) values (a, 'ca@x.com'), (b, 'cb@x.com'), (c, 'cc@x.com'), (t, 'ct@x.com'), (e, 'ce@x.com');
  update public.profiles set username = 'chat_' || (case id when a then 'ada' when b then 'bob' when c then 'cy' when t then 'teen' else 'eve' end) where id in (a, b, c, t, e);
  update public.private_profiles set onboarded = true, dob = '2000-01-01' where id in (a, b, c, e);
  update public.private_profiles set onboarded = true, is_teen = true, dob = (current_date - interval '15 years')::date where id = t;
  update public.private_profiles set accept_waves = false where id = c;

  -- ---------------------------------------------------------------- 1. building chat is private
  perform pg_temp.as_user(a); perform public.enter_building('B12', 'library');
  perform pg_temp.ok(public.send_room_message('int_b12_1', 'hello library') > 0, 'A inside B12 can post in int_b12_1');
  perform pg_temp.ok(public.send_room_message('zone_0_0', 'hi outside') > 0, 'zone rooms stay open to everyone');
  reset role;
  perform pg_temp.as_user(b);
  perform pg_temp.ok((select count(*) from public.room_messages where room = 'int_b12_1') = 0, 'B outside cannot read the building room');
  perform pg_temp.fails($q$select public.send_room_message('int_b12_1', 'let me in')$q$, 'not_in_room', 'B outside cannot post in the building room');
  perform pg_temp.ok((select count(*) from public.room_messages where room = 'zone_0_0') >= 1, 'B can read the open zone room');
  perform public.enter_building('B99', 'gym');
  perform pg_temp.ok((select count(*) from public.room_messages where room = 'int_b12_1') = 0, 'B inside a different building still cannot read B12');
  perform pg_temp.fails($q$select public.send_room_message('int_b12_1', 'nope')$q$, 'not_in_room', 'B inside B99 cannot post to B12');
  perform public.enter_building('B12', 'library');
  perform pg_temp.ok((select count(*) from public.room_messages where room = 'int_b12_1') = 1, 'B reads the room once inside B12');
  perform pg_temp.ok(public.send_room_message('int_b12_1', 'hi ada') > 0, 'B can post once inside');
  reset role;
  perform pg_temp.as_user(a);
  perform pg_temp.ok((select count(*) from public.room_messages where room = 'int_b12_1') = 2, 'A sees both messages');
  perform public.leave_building();
  perform pg_temp.ok((select count(*) from public.room_messages where room = 'int_b12_1') = 0, 'after leaving, A can no longer read the room');
  reset role;
  perform pg_temp.as_user(b);
  perform pg_temp.fails($q$select public.send_room_message('int_b12_x', 'bad suffix')$q$, 'not_in_room', 'room name must end in _<number>');
  reset role;
  update public.player_stats set updated_at = now() - interval '30 minutes' where id = b;
  perform pg_temp.as_user(b);
  perform pg_temp.ok((select count(*) from public.room_messages where room = 'int_b12_1') = 0, 'stale presence (30 min) loses access');
  reset role;
  update public.player_stats set building = 'B', updated_at = now() where id = b;     -- prefix of another id must not match
  perform pg_temp.as_user(b);
  perform pg_temp.ok((select count(*) from public.room_messages where room = 'int_b12_1') = 0, 'building B does not match room int_b12_1');
  reset role;

  -- ---------------------------------------------------------------- 2. search players
  perform pg_temp.as_user(a);
  perform pg_temp.ok((select count(*) from public.search_players('chat_')) = 2, 'search finds bob and eve only (not me, not the teen, not waves-off cy)');
  perform pg_temp.ok((select count(*) from public.search_players('x')) = 0, 'one-letter search returns nothing');
  perform pg_temp.ok((select count(*) from public.search_players('CHAT_B%')) = 1, 'search is case-insensitive and ignores symbols');
  perform pg_temp.ok((select relation from public.search_players('chat_bob')) = 'none', 'stranger relation = none');
  perform public.send_wave(b);
  perform pg_temp.ok((select relation from public.search_players('chat_bob')) = 'waved', 'after I wave: waved');
  reset role; perform pg_temp.as_user(b);
  perform pg_temp.ok((select relation from public.search_players('chat_ada')) = 'incoming', 'they see my wave as incoming');
  perform public.respond_wave((select id from public.waves where from_user = a and to_user = b), true);
  perform pg_temp.ok((select relation from public.search_players('chat_ada')) = 'friends', 'after accept: friends');
  reset role; perform pg_temp.as_user(t);
  perform pg_temp.ok((select count(*) from public.search_players('chat_')) = 0, 'teen search never returns adults');
  reset role; perform pg_temp.as_user(e); perform public.block_user(a);
  perform pg_temp.ok((select count(*) from public.search_players('chat_ada')) = 0, 'blocker does not see the blocked player');
  reset role; perform pg_temp.as_user(a);
  perform pg_temp.ok((select count(*) from public.search_players('chat_eve')) = 0, 'blocked player does not see the blocker');
  reset role; perform pg_temp.as_user(e); perform public.unblock_user(a); reset role;
  raise notice 'building chat + search tests done';
end $$;

-- (groups are tested in a second block so a failure points at the right feature)
do $$
declare
  a uuid := '00000000-0000-0000-0000-0000000000c1'; b uuid := '00000000-0000-0000-0000-0000000000c2'; c uuid := '00000000-0000-0000-0000-0000000000c3';
  t uuid := '00000000-0000-0000-0000-0000000000c4'; e uuid := '00000000-0000-0000-0000-0000000000c5';
  gid bigint; tid bigint; r jsonb;
begin
  -- ---------------------------------------------------------------- 3. groups
  perform pg_temp.as_user(a);
  perform pg_temp.fails($q$select public.create_group('x')$q$, 'bad_group_name', 'one-letter group name refused');
  perform pg_temp.fails($q$select public.create_group('join www.scam.com')$q$, 'bad_group_name', 'link in group name refused');
  gid := public.create_group('Study Squad');
  perform pg_temp.ok(gid > 0 and (select count(*) from public.group_members where group_id = gid and status = 'member' and role = 'owner') = 1, 'A creates a group and is its owner');
  perform pg_temp.ok(public.send_group_message(gid, 'welcome') > 0, 'owner can post');
  reset role;

  perform pg_temp.as_user(e);
  perform pg_temp.ok((select count(*) from public.chat_groups) = 0, 'outsider cannot see the group');
  perform pg_temp.ok((select count(*) from public.group_messages) = 0, 'outsider cannot read group messages');
  perform pg_temp.fails(format('select public.send_group_message(%s, ''hi'')', gid), 'not_member', 'outsider cannot post');
  perform pg_temp.fails(format('select public.invite_to_group(%s, %L)', gid, b), 'not_member', 'outsider cannot invite');
  perform pg_temp.fails(format($q$insert into public.group_messages (group_id, user_id, username, body) values (%s, %L, 'x', 'y')$q$, gid, e), 'permission denied', 'cannot insert group messages directly');
  reset role;

  perform pg_temp.as_user(a);
  perform pg_temp.fails(format('select public.invite_to_group(%s, %L)', gid, t), 'not_allowed', 'cannot invite a teen to an adult group');
  perform pg_temp.fails(format('select public.invite_to_group(%s, %L)', gid, c), 'not_allowed', 'cannot invite someone who switched waves off');
  perform pg_temp.fails(format('select public.invite_to_group(%s, %L)', gid, a), 'not_allowed', 'cannot invite yourself');
  r := public.invite_to_group(gid, b);
  perform pg_temp.ok(r->>'status' = 'invited', 'A invites B (they are friends)');
  perform pg_temp.ok(public.invite_to_group(gid, b)->>'status' = 'invited', 'inviting twice is harmless');
  r := public.invite_to_group(gid, e);
  perform pg_temp.ok(r->>'status' = 'invited', 'A can invite a stranger: it is only an invite');
  reset role;

  perform pg_temp.as_user(b);
  perform pg_temp.ok((select count(*) from public.chat_groups) = 1, 'invited B can see the group name');
  perform pg_temp.ok((select count(*) from public.group_messages) = 0, 'invited B cannot read messages yet');
  perform pg_temp.fails(format('select public.send_group_message(%s, ''hi'')', gid), 'not_member', 'invited B cannot post yet');
  perform pg_temp.ok(public.respond_group_invite(gid, true)->>'status' = 'member', 'B accepts');
  perform pg_temp.ok((select count(*) from public.group_messages) = 1, 'B now reads the history');
  perform pg_temp.ok(public.send_group_message(gid, 'hi team') > 0, 'B posts');
  perform pg_temp.fails(format('select public.remove_group_member(%s, %L)', gid, a), 'not_allowed', 'a plain member cannot remove people');
  reset role;

  perform pg_temp.as_user(e);
  perform pg_temp.ok(public.respond_group_invite(gid, false)->>'status' = 'declined', 'E declines');
  perform pg_temp.ok((select count(*) from public.group_messages) = 0, 'decliner reads nothing');
  reset role;
  perform pg_temp.as_user(a);
  perform pg_temp.fails(format('select public.invite_to_group(%s, %L)', gid, e), 'not_allowed', 'cannot re-invite someone who just declined');
  perform pg_temp.ok((select count(*) from public.group_messages) = 2, 'A reads both messages');
  perform public.remove_group_member(gid, b);
  reset role;
  perform pg_temp.as_user(b);
  perform pg_temp.ok((select count(*) from public.group_messages) = 0 and (select count(*) from public.chat_groups) = 0, 'removed member loses all access');
  reset role;

  -- owner hand-over + empty group cleanup
  perform pg_temp.as_user(a); perform public.invite_to_group(gid, b); reset role;
  perform pg_temp.as_user(b); perform public.respond_group_invite(gid, true); reset role;
  perform pg_temp.as_user(a); perform public.leave_group(gid); reset role;
  perform pg_temp.as_user(b);
  perform pg_temp.ok((select owner from public.chat_groups where id = gid) = b, 'when the owner leaves, the other member becomes owner');
  perform public.leave_group(gid);
  reset role;
  perform pg_temp.ok((select count(*) from public.chat_groups where id = gid) = 0 and (select count(*) from public.group_messages where group_id = gid) = 0, 'last member leaving deletes the group and its messages');

  -- teen groups
  perform pg_temp.as_user(t);
  tid := public.create_group('Teen Crew');
  perform pg_temp.fails(format('select public.invite_to_group(%s, %L)', tid, a), 'not_allowed', 'cannot invite an adult to a teen group');
  reset role;

  -- blocks stop invites
  perform pg_temp.as_user(a); perform public.block_user(e);
  gid := public.create_group('Blocks Test');
  perform pg_temp.fails(format('select public.invite_to_group(%s, %L)', gid, e), 'not_allowed', 'cannot invite someone you blocked');
  perform public.unblock_user(e); reset role;
  raise notice 'ALL CHAT TESTS PASSED';
end $$;
