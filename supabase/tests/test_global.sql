-- LOCAL TEST for 18_global_chat.sql. Throwaway Postgres only.
create or replace function pg_temp.as_user(u uuid) returns void language plpgsql as $$
begin perform set_config('request.jwt.claim.sub', coalesce(u::text, ''), true); execute 'set local role authenticated'; end $$;
create or replace function pg_temp.ok(c boolean, msg text) returns void language plpgsql as $$
begin if c is not true then raise exception 'FAIL: %', msg; end if; raise notice 'ok  - %', msg; end $$;
grant execute on all functions in schema pg_temp to public;

do $$
declare
  a uuid := '00000000-0000-0000-0000-0000000000f8'; b uuid := '00000000-0000-0000-0000-0000000000f9'; c uuid := '00000000-0000-0000-0000-0000000000fa';
  t uuid := '00000000-0000-0000-0000-0000000000fb'; m1 bigint; m2 bigint; m3 bigint; n int; ok boolean;
begin
  insert into auth.users (id, email) values (a, 'ga@x.com'), (b, 'gb@x.com'), (c, 'gc@x.com'), (t, 'gt@x.com');
  update public.profiles set username = case id when a then 'gl_ann' when b then 'gl_ben' when c then 'gl_cy' else 'gl_teen' end where id in (a, b, c, t);
  update public.private_profiles set onboarded = true, dob = '1990-01-01', is_teen = false where id in (a, b, c);
  update public.private_profiles set onboarded = true, dob = '2010-01-01', is_teen = true where id = t;

  perform pg_temp.as_user(a);
  m1 := public.send_global_message('hello everyone');
  perform pg_temp.ok(m1 is not null, 'anyone can post to Global');
  perform pg_temp.as_user(b);
  perform pg_temp.ok((select count(*) from public.global_messages) = 1, 'other adults read it');
  m2 := public.send_global_message('hi @gl_ann and @GL_CY and @nobody and @gl_teen', m1);
  reset role;
  perform pg_temp.ok((select mentions from public.global_messages where id = m2) = array['gl_ann','gl_cy'], 'only real, same-age players are tagged (case-insensitive)');
  perform pg_temp.ok((select count(*) from public.notifications where app = 'global' and ref = m2 and user_id = a) = 1, 'tagged AND replied-to player gets ONE alert');
  perform pg_temp.ok((select count(*) from public.notifications where app = 'global' and user_id = t) = 0, 'a teen is never tagged by an adult');
  perform pg_temp.ok((select reply_name from public.global_messages where id = m2) = 'gl_ann', 'reply keeps a quote of the original');

  perform pg_temp.as_user(a);
  perform pg_temp.ok(public.get_global_unread() = 1, 'badge counts my tag');
  perform pg_temp.ok((public.get_unread() ->> 'alerts')::int = 0, 'Chat app alerts ignore Global tags');
  perform pg_temp.ok((select count(*) from public.list_notifications()) = 0, 'bank alert list ignores Global tags');
  perform public.mark_global_read();
  perform pg_temp.ok(public.get_global_unread() = 0, 'opening Global clears the badge');

  -- age separation
  perform pg_temp.as_user(t);
  perform pg_temp.ok((select count(*) from public.global_messages) = 0, 'teens cannot read adult Global');
  m3 := public.send_global_message('teen here');
  perform pg_temp.as_user(a);
  perform pg_temp.ok((select count(*) from public.global_messages where id = m3) = 0, 'adults cannot read teen Global');
  ok := false; begin perform public.send_global_message('x', m3); exception when others then ok := sqlerrm like '%message_gone%'; end;
  perform pg_temp.ok(ok, 'cannot reply across age groups');

  -- blocks hide messages
  reset role; insert into public.blocks (blocker, blocked) values (a, b);
  perform pg_temp.as_user(a);
  perform pg_temp.ok((select count(*) from public.global_messages where user_id = b) = 0, 'blocked players are hidden');
  reset role; delete from public.blocks;

  -- filter + rate limit
  perform pg_temp.as_user(t); perform pg_temp.ok(true, '-');
  ok := false; begin perform public.send_global_message('call me 08012345678'); exception when others then ok := sqlerrm like '%message_not_allowed%'; end;
  perform pg_temp.ok(ok, 'teens cannot share phone numbers');
  reset role; delete from public.global_messages; perform pg_temp.as_user(c);
  perform public.send_global_message('1'); perform public.send_global_message('2'); perform public.send_global_message('3'); perform public.send_global_message('4'); perform public.send_global_message('5');
  ok := false; begin perform public.send_global_message('6'); exception when others then ok := sqlerrm like '%slow_down%'; end;
  perform pg_temp.ok(ok, 'rate limited to 5 per 10 seconds');
  -- cannot write the table directly
  ok := false; begin insert into public.global_messages (user_id, username, body) values (c, 'gl_cy', 'direct'); exception when others then ok := true; end;
  perform pg_temp.ok(ok, 'no direct inserts');
  reset role;
end $$;
