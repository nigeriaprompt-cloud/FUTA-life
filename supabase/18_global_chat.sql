-- 18_global_chat.sql — the Global chat phone app: one public room for every player, with @tagging of players and replying to a message.
-- Run AFTER 10, 14 and 16. Safe to re-run.
-- Rules (all enforced here, not in the browser):
--   * Teens and adults never share the room: every message carries `teen`, and you only read messages from your own age group. Blocked players are hidden both ways.
--   * Text goes through private.chat_clean (bad words / phone numbers / links), max 5 messages per 10 seconds.
--   * "@name" in a message tags that player (same age group, not blocking you, max 5 per message) and drops a notification for them (app = 'global').
--   * Replying stores a short snapshot of the message you answered, so the quote still shows after the old message is cleaned up.
--   * Messages older than 3 days are deleted by private.cleanup().

alter table public.notifications add column if not exists app text;      -- which phone app the alert belongs to ('global'); null = the money/bank alerts
alter table public.notifications add column if not exists ref bigint;    -- e.g. the global message id that tagged you

create table if not exists public.global_messages (
  id bigserial primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  username text not null,
  teen boolean not null default false,
  body text not null,
  reply_to bigint,
  reply_name text, reply_body text,
  mentions text[] not null default '{}',
  created_at timestamptz not null default now()
);
create index if not exists global_messages_idx on public.global_messages (teen, id desc);
create index if not exists global_messages_user_idx on public.global_messages (user_id, created_at desc);
create index if not exists notifications_app_idx on public.notifications (user_id, app) where read_at is null;

alter table public.global_messages enable row level security;
drop policy if exists global_read on public.global_messages;
create policy global_read on public.global_messages for select to authenticated
  using (teen is not distinct from (select q.is_teen from public.private_profiles q where q.id = auth.uid())
         and not public.is_blocked_between(auth.uid(), user_id));

create or replace function public.send_global_message(p_body text, p_reply_to bigint default null) returns bigint
language plpgsql security definer set search_path = '' as $$
declare
  u uuid := private.require_user(); name text; is_t boolean; txt text; recent int; nid bigint;
  rn text; rb text; m text; tid uuid; tn text; names text[] := '{}'; n int := 0;
begin
  select p.username, q.is_teen into name, is_t from public.profiles p join public.private_profiles q on q.id = p.id where p.id = u;
  if name is null then raise exception 'finish_sign_up'; end if;
  select count(*) into recent from public.global_messages where user_id = u and created_at > now() - interval '10 seconds';
  if recent >= 5 then raise exception 'slow_down'; end if;
  txt := private.chat_clean(p_body, is_t);
  if txt is null then raise exception 'message_not_allowed'; end if;
  if p_reply_to is not null then
    select g.username, left(g.body, 80) into rn, rb from public.global_messages g
     where g.id = p_reply_to and g.teen = is_t and not public.is_blocked_between(u, g.user_id);
    if rn is null then raise exception 'message_gone'; end if;
  end if;
  insert into public.global_messages (user_id, username, teen, body, reply_to, reply_name, reply_body)
    values (u, name, is_t, txt, case when rn is null then null else p_reply_to end, rn, rb) returning id into nid;
  -- @tags
  for m in select lower(x[1]) from regexp_matches(txt, '(?:^|[^a-z0-9_])@([a-zA-Z0-9_]{2,20})', 'g') x loop
    exit when n >= 5;
    continue when m = any(names);
    select p.id, p.username into tid, tn from public.profiles p where lower(p.username) = m;
    continue when tid is null or tid = u or not private.same_age_group(u, tid) or public.is_blocked_between(u, tid);
    names := names || m; n := n + 1;
    insert into public.notifications (user_id, kind, from_user, title, body, app, ref)
      values (tid, 'info', u, '@' || name || ' tagged you in Global', left(txt, 120), 'global', nid);
  end loop;
  if n > 0 then update public.global_messages set mentions = names where id = nid; end if;
  -- replying to someone also pings them (once), unless already tagged
  if rn is not null then
    select g.user_id into tid from public.global_messages g where g.id = p_reply_to;
    if tid <> u and not (lower(rn) = any(names)) and not public.is_blocked_between(u, tid) then
      insert into public.notifications (user_id, kind, from_user, title, body, app, ref)
        values (tid, 'info', u, '@' || name || ' replied to you in Global', left(txt, 120), 'global', nid);
    end if;
  end if;
  return nid;
end $$;

-- how many Global tags/replies I have not seen yet (the app badge)
create or replace function public.get_global_unread() returns int
language sql stable security definer set search_path = '' as $$
  select count(*)::int from public.notifications where user_id = private.require_user() and app = 'global' and read_at is null $$;

create or replace function public.mark_global_read() returns void
language plpgsql security definer set search_path = '' as $$
begin update public.notifications set read_at = now() where user_id = private.require_user() and app = 'global' and read_at is null; end $$;

-- the Chat app's alert badge counts only bank/money alerts (Global tags have their own badge)
create or replace function public.get_unread() returns jsonb
language plpgsql security definer set search_path = '' as $$
declare u uuid := private.require_user(); d jsonb; gr jsonb; inv int; al int;
begin
  select coalesce(jsonb_object_agg(x.sender::text, x.c), '{}'::jsonb) into d
    from (select sender, count(*) c from public.dms
          where recipient = u and read_at is null and kind <> 'money' and not public.is_blocked_between(u, sender) group by sender) x;
  select coalesce(jsonb_object_agg(x.group_id::text, x.c), '{}'::jsonb) into gr
    from (select gm.group_id, count(*) c from public.group_members gm
          join public.group_messages m on m.group_id = gm.group_id and m.id > gm.last_read_id and m.user_id <> u
          where gm.user_id = u and gm.status = 'member' group by gm.group_id) x;
  select count(*) into inv from public.group_members where user_id = u and status = 'invited' and invited_by is distinct from u;
  select count(*) into al from public.notifications where user_id = u and read_at is null and app is null;
  return jsonb_build_object('dms', d, 'groups', gr, 'invites', inv, 'alerts', al);
end $$;

-- the Chat app's alert list / "mark read" only touch bank alerts; Global tags are listed and cleared by the Global app
create or replace function public.list_notifications(p_limit int default 30) returns setof public.notifications
language sql stable security definer set search_path = '' as $$
  select * from public.notifications where user_id = auth.uid() and app is null order by id desc limit least(greatest(coalesce(p_limit, 30), 1), 50) $$;
create or replace function public.mark_notifications_read() returns void
language sql security definer set search_path = '' as $$
  update public.notifications set read_at = now() where user_id = auth.uid() and read_at is null and app is null $$;

create or replace function private.cleanup() returns void language sql as $$
  delete from public.room_messages where created_at < now() - interval '2 days';
  delete from public.seat_claims where expires_at < now();
  delete from public.group_messages where created_at < now() - interval '14 days';
  delete from public.group_members where status = 'declined' and created_at < now() - interval '7 days';
  delete from public.global_messages where created_at < now() - interval '3 days';
$$;

revoke all on public.global_messages from public, anon;
grant select on public.global_messages to authenticated;
revoke execute on function public.send_global_message(text, bigint), public.get_global_unread(), public.mark_global_read(), public.get_unread() from public, anon;
grant execute on function public.send_global_message(text, bigint), public.get_global_unread(), public.mark_global_read(), public.get_unread() to authenticated;

do $$ begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    begin alter publication supabase_realtime add table public.global_messages; exception when duplicate_object then null; end;
  end if;
end $$;
