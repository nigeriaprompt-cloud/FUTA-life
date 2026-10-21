-- LOCAL TEST for 16_unread.sql. Throwaway Postgres only.
create or replace function pg_temp.as_user(u uuid) returns void language plpgsql as $$
begin perform set_config('request.jwt.claim.sub', coalesce(u::text, ''), true); execute 'set local role authenticated'; end $$;
create or replace function pg_temp.ok(c boolean, msg text) returns void language plpgsql as $$
begin if c is not true then raise exception 'FAIL: %', msg; end if; raise notice 'ok  - %', msg; end $$;
grant execute on all functions in schema pg_temp to public;

do $$
declare
  a uuid := '00000000-0000-0000-0000-0000000000e6'; b uuid := '00000000-0000-0000-0000-0000000000e7'; c uuid := '00000000-0000-0000-0000-0000000000e8';
  gid bigint; r jsonb;
begin
  insert into auth.users (id, email) values (a, 'ua@x.com'), (b, 'ub@x.com'), (c, 'uc@x.com');
  update public.profiles set username = case id when a then 'un_ann' when b then 'un_ben' else 'un_cy' end where id in (a, b, c);
  update public.private_profiles set onboarded = true, dob = '1990-01-01' where id in (a, b, c);
  -- direct messages from b and c to a (inserted directly: this test is about counting, not sending)
  insert into public.dms (sender, recipient, body) values (b, a, 'hi'), (b, a, 'there'), (c, a, 'yo');
  insert into public.dms (sender, recipient, body, kind, amount) values (c, a, 'money', 'money', 500);
  perform pg_temp.as_user(a);
  r := public.get_unread();
  perform pg_temp.ok((r #>> array['dms', b::text])::int = 2 and (r #>> array['dms', c::text])::int = 1, 'unread DMs counted per friend (money not counted)');
  perform public.mark_dms_read(b); r := public.get_unread();
  perform pg_temp.ok(r -> 'dms' -> b::text is null and (r #>> array['dms', c::text])::int = 1, 'opening a chat clears only that friend');
  reset role;
  -- blocked: a blocks c -> c no longer counts
  insert into public.blocks (blocker, blocked) values (a, c);
  perform pg_temp.as_user(a); r := public.get_unread();
  perform pg_temp.ok(r -> 'dms' -> c::text is null, 'blocked players never count');
  reset role; delete from public.blocks where blocker = a;
  -- groups
  perform pg_temp.as_user(a); gid := public.create_group('un group'); reset role;
  insert into public.group_members (group_id, user_id, status, role, invited_by) values (gid, b, 'invited', 'member', a);
  perform pg_temp.as_user(b); r := public.get_unread();
  perform pg_temp.ok((r ->> 'invites')::int = 1, 'a group invite counts');
  perform public.respond_group_invite(gid, true); reset role;
  insert into public.group_messages (group_id, user_id, username, body) values (gid, a, 'un_ann', 'm1'), (gid, a, 'un_ann', 'm2'), (gid, a, 'un_ann', 'm3');
  perform pg_temp.as_user(b); r := public.get_unread();
  perform pg_temp.ok((r #>> array['groups', gid::text])::int = 3 and (r ->> 'invites')::int = 0, 'unread group messages counted for a member');
  perform pg_temp.as_user(a); r := public.get_unread();
  perform pg_temp.ok(r -> 'groups' -> gid::text is null, 'my own group messages never count for me');
  perform pg_temp.as_user(b); perform public.mark_group_read(gid); r := public.get_unread();
  perform pg_temp.ok(r -> 'groups' -> gid::text is null, 'opening the group clears its count');
  reset role;
  insert into public.group_messages (group_id, user_id, username, body) values (gid, a, 'un_ann', 'm4');
  insert into public.group_members (group_id, user_id, status, role, invited_by) values (gid, c, 'invited', 'member', a);
  perform pg_temp.as_user(c); perform public.respond_group_invite(gid, true); r := public.get_unread();
  perform pg_temp.ok(r -> 'groups' -> gid::text is null, 'a new member does not see old history as unread');
exception when undefined_function then null;
end $$;
-- signed-out visitors cannot call it
do $$ begin
  perform set_config('request.jwt.claim.sub', '', true); set local role anon;
  begin perform public.get_unread(); raise exception 'FAIL: anon could call get_unread';
  exception when insufficient_privilege then raise notice 'ok  - signed-out visitors cannot call it'; end;
end $$;
reset role;
do $$ begin raise notice 'ALL UNREAD CHECKS PASSED'; end $$;
