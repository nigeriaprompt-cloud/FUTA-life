-- 23_neighbours.sql — NEIGHBOURS: every player is put at random into a small chat group of up to 8 people (same age band), plus message replies.
-- Run AFTER 10_chat_social.sql, 15_receipts.sql and 16_unread.sql. Safe to re-run.
--
--   • A neighbour group is an ordinary chat group (chat_groups.kind = 'neighbour'), so messages, ticks, unread badges and realtime all keep working.
--   • ensure_neighbours()  — the phone calls it once after sign-in. Returns the player's neighbour group (creating the assignment the first time).
--       New player → a RANDOM neighbour group of their own age band that still has room; if none has room, a new group is started.
--       Teens and adults never share a group (is_teen band), exactly like normal groups. Players who signed up before this file existed are
--       placed the first time their phone calls it.
--   • Neighbour groups cannot be invited into, left, or have members removed (that would defeat the random mix).
--   • send_group_message(group, body, client, reply_to) — same as before plus an optional reply to an earlier message of the same group.

alter table public.chat_groups add column if not exists kind text not null default 'friends';
alter table public.group_messages add column if not exists reply_to bigint references public.group_messages(id) on delete set null;

-- ------------------------------------------------------------------ assignment
create or replace function public.ensure_neighbours() returns jsonb
language plpgsql security definer set search_path = '' as $$
declare u uuid := private.require_user(); teen boolean; gid bigint; cap constant int := 8;
begin
  select q.is_teen into teen from public.private_profiles q join public.profiles p on p.id = q.id where q.id = u and p.username is not null;
  if teen is null then raise exception 'finish_sign_up'; end if;

  select m.group_id into gid from public.group_members m join public.chat_groups c on c.id = m.group_id
   where m.user_id = u and m.status = 'member' and c.kind = 'neighbour' limit 1;

  if gid is null then
    perform pg_advisory_xact_lock(723100);                      -- one assignment at a time, so two sign-ups can never overfill a group
    select c.id into gid from public.chat_groups c
     where c.kind = 'neighbour' and c.is_teen = teen
       and (select count(*) from public.group_members m where m.group_id = c.id and m.status = 'member') < cap
     order by random() limit 1;
    if gid is null then
      insert into public.chat_groups (name, owner, is_teen, kind) values ('Neighbours', u, teen, 'neighbour') returning id into gid;
      update public.chat_groups set name = 'Neighbours ' || gid where id = gid;
    end if;
    insert into public.group_members (group_id, user_id, status, role) values (gid, u, 'member', 'member')
      on conflict (group_id, user_id) do update set status = 'member';
  end if;

  return jsonb_build_object('id', gid,
    'name', (select name from public.chat_groups where id = gid),
    'members', (select count(*) from public.group_members where group_id = gid and status = 'member'));
end $$;

-- nobody can be invited into a neighbour group
create or replace function private.no_neighbour_invites() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.status = 'invited' and exists (select 1 from public.chat_groups c where c.id = new.group_id and c.kind = 'neighbour') then raise exception 'not_allowed'; end if;
  return new;
end $$;
drop trigger if exists group_members_no_neighbour_invites on public.group_members;
create trigger group_members_no_neighbour_invites before insert or update of status on public.group_members
  for each row execute function private.no_neighbour_invites();

-- leaving / removing: same bodies as 10_chat_social.sql, plus "not for neighbour groups"
create or replace function public.leave_group(p_group bigint) returns void
language plpgsql security definer set search_path = '' as $$
declare u uuid := private.require_user(); heir uuid;
begin
  if exists (select 1 from public.chat_groups where id = p_group and kind = 'neighbour') then raise exception 'not_allowed'; end if;
  delete from public.group_members where group_id = p_group and user_id = u;
  if not exists (select 1 from public.group_members where group_id = p_group and status = 'member') then
    delete from public.chat_groups where id = p_group; return;
  end if;
  if (select owner from public.chat_groups where id = p_group) = u then
    select user_id into heir from public.group_members where group_id = p_group and status = 'member' order by created_at, user_id limit 1;
    update public.chat_groups set owner = heir where id = p_group;
    update public.group_members set role = 'owner' where group_id = p_group and user_id = heir;
  end if;
end $$;

create or replace function public.remove_group_member(p_group bigint, p_user uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare u uuid := private.require_user();
begin
  if p_user = u then raise exception 'not_allowed'; end if;
  if exists (select 1 from public.chat_groups where id = p_group and kind = 'neighbour') then raise exception 'not_allowed'; end if;
  if not exists (select 1 from public.chat_groups where id = p_group and owner = u) then raise exception 'not_allowed'; end if;
  delete from public.group_members where group_id = p_group and user_id = p_user;
end $$;

-- ------------------------------------------------------------------ replies
drop function if exists public.send_group_message(bigint, text, uuid);
create or replace function public.send_group_message(p_group bigint, p_body text, p_client uuid default null, p_reply_to bigint default null) returns bigint
language plpgsql security definer set search_path = '' as $$
declare u uuid := private.require_user(); name text; teen boolean; txt text; recent int; nid bigint; rt bigint := null;
begin
  if p_client is not null then
    select id into nid from public.group_messages where user_id = u and client_id = p_client and group_id = p_group;
    if found then return nid; end if;
  end if;
  if not public.is_group_member(p_group) then raise exception 'not_member'; end if;
  select p.username, q.is_teen into name, teen from public.profiles p join public.private_profiles q on q.id = p.id where p.id = u;
  if name is null then raise exception 'finish_sign_up'; end if;
  select count(*) into recent from public.group_messages where user_id = u and created_at > now() - interval '10 seconds';
  if recent >= 5 then raise exception 'slow_down'; end if;
  txt := private.chat_clean(p_body, teen);
  if txt is null then raise exception 'message_not_allowed'; end if;
  if p_reply_to is not null then select id into rt from public.group_messages where id = p_reply_to and group_id = p_group; end if;   -- a reply must point at a message of THIS group
  insert into public.group_messages (group_id, user_id, username, body, client_id, reply_to) values (p_group, u, name, txt, p_client, rt)
    on conflict (user_id, client_id) where client_id is not null do nothing returning id into nid;
  if nid is null then select id into nid from public.group_messages where user_id = u and client_id = p_client; end if;
  return nid;
end $$;

revoke execute on function public.send_group_message(bigint, text, uuid, bigint), public.ensure_neighbours() from public, anon;
grant  execute on function public.send_group_message(bigint, text, uuid, bigint), public.ensure_neighbours() to authenticated;
