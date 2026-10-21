-- ==========================================================================
-- 10_chat_social.sql — chat privacy + player search + group chats.   Run AFTER 01_schema.sql (and 03/05… any order is fine).
-- Safe to re-run.  Test on a throwaway Postgres first: supabase/tests/run.sh (it runs tests/test_chat.sql).
--
--  1. Building chat is private: a room called int_<building>_<n> can only be read / written by a player who is
--     currently inside that building (player_stats.building, set by enter_building).  Zone rooms and campus_lobby stay open.
--  2. search_players(text): names only (+ your wave status).  Skips yourself, blocked people (both ways),
--     the other age group (teens vs adults) and players who switched waves off (unless already friends).
--  3. Groups: chat_groups / group_members / group_messages.  Members-only reads (RLS).  Adding someone = an INVITE they accept.
--     Teens and adults never share a group.  All writes go through the RPCs at the bottom (granted explicitly).
-- ==========================================================================

-- ------------------------------------------------------------------ 1. building chat privacy
-- "Is the caller allowed in this room?"  Public wrapper because RLS policies run as the browser's role (it cannot use schema private).
-- Presence is trusted for 10 minutes: the interior calls get_stats every 30 s, which refreshes player_stats.updated_at.
create or replace function public.in_room(p_room text) returns boolean
language sql stable security definer set search_path = '' as $$
  select case
    when lower(p_room) !~ '^int_' then true                                    -- zone_*, campus_lobby, …: open to every signed-in player
    else exists (
      select 1 from public.player_stats s
      where s.id = auth.uid() and s.building is not null
        and s.updated_at > now() - interval '10 minutes'
        and lower(p_room) ~ '^int_.+_[0-9]+$'
        and regexp_replace(lower(p_room), '^int_(.*)_[0-9]+$', '\1') = lower(s.building))
  end $$;

drop policy if exists room_read on public.room_messages;
create policy room_read on public.room_messages for select to authenticated
  using (public.in_room(room) and not public.is_blocked_between(auth.uid(), user_id));

create or replace function public.send_room_message(p_room text, p_body text) returns bigint
language plpgsql security definer set search_path = '' as $$
declare u uuid := private.require_user(); name text; teen boolean; txt text; recent int; nid bigint;
begin
  if p_room !~ '^[a-z0-9_:.-]{1,60}$' then raise exception 'bad_room'; end if;
  if not public.in_room(p_room) then raise exception 'not_in_room'; end if;
  select p.username, q.is_teen into name, teen from public.profiles p join public.private_profiles q on q.id = p.id where p.id = u;
  if name is null then raise exception 'finish_sign_up'; end if;
  select count(*) into recent from public.room_messages where user_id = u and created_at > now() - interval '10 seconds';
  if recent >= 5 then raise exception 'slow_down'; end if;
  txt := private.chat_clean(p_body, teen);
  if txt is null then raise exception 'message_not_allowed'; end if;
  insert into public.room_messages (room, user_id, username, body) values (p_room, u, name, txt) returning id into nid;
  return nid;
end $$;

-- ------------------------------------------------------------------ 2. search players by username
-- Returns at most 8 rows: id, username, relation = none | waved (you waved) | incoming (they waved) | friends.
-- The relation only decides which button the phone shows; the wave-first rule is still enforced by send_dm.
create or replace function public.search_players(p_query text) returns table (user_id uuid, username text, relation text)
language plpgsql stable security definer set search_path = '' as $$
#variable_conflict use_column
declare u uuid := private.require_user(); q text := regexp_replace(lower(btrim(coalesce(p_query, ''))), '[^a-z0-9_]', '', 'g');
begin
  if length(q) < 2 then return; end if;
  return query
    select p.id, p.username::text,
           case when w.status = 'accepted' then 'friends'
                when w.status = 'pending' and w.from_user = u then 'waved'
                when w.status = 'pending' then 'incoming'
                else 'none' end
    from public.profiles p
    join public.private_profiles pp on pp.id = p.id
    left join lateral (
      select ww.status, ww.from_user from public.waves ww
      where (ww.from_user = u and ww.to_user = p.id) or (ww.from_user = p.id and ww.to_user = u)
      order by (ww.status = 'accepted') desc, ww.id desc limit 1) w on true
    where p.username is not null and p.id <> u
      and p.username like '%' || replace(q, '_', '\_') || '%'
      and private.same_age_group(u, p.id)
      and (pp.accept_waves or w.status = 'accepted')
      and not exists (select 1 from public.blocks b where (b.blocker = u and b.blocked = p.id) or (b.blocker = p.id and b.blocked = u))
    order by (p.username = q) desc, (p.username like replace(q, '_', '\_') || '%') desc, p.username
    limit 8;
end $$;

-- ------------------------------------------------------------------ 3. groups
create table if not exists public.chat_groups (
  id bigserial primary key,
  name text not null check (char_length(name) between 2 and 30),
  owner uuid not null references auth.users(id) on delete cascade,
  is_teen boolean not null,                                   -- the group's age band, copied from its creator; only that band may join
  created_at timestamptz not null default now()
);
create table if not exists public.group_members (
  group_id bigint not null references public.chat_groups(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  status text not null default 'invited' check (status in ('invited', 'member', 'declined')),
  role text not null default 'member' check (role in ('owner', 'member')),
  invited_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  primary key (group_id, user_id)
);
create index if not exists group_members_user_idx on public.group_members (user_id, status);
create table if not exists public.group_messages (
  id bigserial primary key,
  group_id bigint not null references public.chat_groups(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  username text not null, body text not null, created_at timestamptz not null default now()
);
create index if not exists group_messages_idx on public.group_messages (group_id, id desc);
create index if not exists group_messages_user_idx on public.group_messages (user_id, created_at desc);

alter table public.chat_groups enable row level security;
alter table public.group_members enable row level security;
alter table public.group_messages enable row level security;

-- security definer so the policies below do not recurse into group_members' own policy
create or replace function public.is_group_member(p_group bigint) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.group_members m where m.group_id = p_group and m.user_id = auth.uid() and m.status = 'member') $$;
create or replace function public.is_group_invited(p_group bigint) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.group_members m where m.group_id = p_group and m.user_id = auth.uid() and m.status = 'invited') $$;

drop policy if exists groups_read on public.chat_groups;
create policy groups_read on public.chat_groups for select to authenticated using (public.is_group_member(id) or public.is_group_invited(id));
drop policy if exists gmembers_read on public.group_members;      -- members see the member list; everyone sees their own row (their invites)
create policy gmembers_read on public.group_members for select to authenticated using (user_id = auth.uid() or public.is_group_member(group_id));
drop policy if exists gmsg_read on public.group_messages;
create policy gmsg_read on public.group_messages for select to authenticated
  using (public.is_group_member(group_id) and not public.is_blocked_between(auth.uid(), user_id));

-- create a group (you become its owner and first member)
create or replace function public.create_group(p_name text) returns bigint
language plpgsql security definer set search_path = '' as $$
declare u uuid := private.require_user(); teen boolean; nm text; mine int; today int; gid bigint;
begin
  select q.is_teen into teen from public.private_profiles q join public.profiles p on p.id = q.id where q.id = u and p.username is not null;
  if teen is null then raise exception 'finish_sign_up'; end if;
  nm := private.chat_clean(p_name, true);   -- group names use the strict rule (no links or phone numbers) for everyone
  if nm is null or char_length(nm) not between 2 and 30 then raise exception 'bad_group_name'; end if;
  select count(*) into mine from public.group_members where user_id = u and status = 'member';
  if mine >= 10 then raise exception 'too_many_groups'; end if;
  select count(*) into today from public.chat_groups where owner = u and created_at > now() - interval '1 day';
  if today >= 5 then raise exception 'slow_down'; end if;
  insert into public.chat_groups (name, owner, is_teen) values (nm, u, teen) returning id into gid;
  insert into public.group_members (group_id, user_id, status, role, invited_by) values (gid, u, 'member', 'owner', u);
  return gid;
end $$;

-- invite a player (any member may invite). They must accept before they can read or write anything.
create or replace function public.invite_to_group(p_group bigint, p_user uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare u uuid := private.require_user(); g public.chat_groups; t public.private_profiles; ex public.group_members; n int; sent int; friends boolean;
begin
  if not public.is_group_member(p_group) then raise exception 'not_member'; end if;
  select * into g from public.chat_groups where id = p_group;
  if p_user = u then raise exception 'not_allowed'; end if;
  select * into t from public.private_profiles where id = p_user;
  if not found or not exists (select 1 from public.profiles where id = p_user and username is not null) then raise exception 'not_allowed'; end if;
  if t.is_teen is distinct from g.is_teen then raise exception 'not_allowed'; end if;                   -- teens and adults never share a group
  if public.is_blocked_between(u, p_user) then raise exception 'not_allowed'; end if;
  select exists (select 1 from public.waves w where w.status = 'accepted' and ((w.from_user = u and w.to_user = p_user) or (w.from_user = p_user and w.to_user = u))) into friends;
  if not friends and not t.accept_waves then raise exception 'not_allowed'; end if;                      -- respects the privacy switch
  select count(*) into sent from public.group_members where invited_by = u and created_at > now() - interval '1 day' and user_id <> u;
  if sent >= 40 then raise exception 'slow_down'; end if;
  select count(*) into n from public.group_members where group_id = p_group and status = 'member';
  if n >= 20 then raise exception 'group_full'; end if;
  select * into ex from public.group_members where group_id = p_group and user_id = p_user;
  if found then
    if ex.status = 'member' then return jsonb_build_object('status', 'member'); end if;
    if ex.status = 'invited' then return jsonb_build_object('status', 'invited'); end if;
    if ex.created_at > now() - interval '1 day' then raise exception 'not_allowed'; end if;               -- they said no recently: do not nag
    update public.group_members set status = 'invited', invited_by = u, created_at = now() where group_id = p_group and user_id = p_user;
  else
    insert into public.group_members (group_id, user_id, status, invited_by) values (p_group, p_user, 'invited', u);
  end if;
  return jsonb_build_object('status', 'invited');
end $$;

create or replace function public.respond_group_invite(p_group bigint, p_accept boolean) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare u uuid := private.require_user(); n int; cnt int;
begin
  if not exists (select 1 from public.group_members where group_id = p_group and user_id = u and status = 'invited') then raise exception 'not_found'; end if;
  if p_accept then
    select count(*) into n from public.group_members where group_id = p_group and status = 'member';
    if n >= 20 then raise exception 'group_full'; end if;
    select count(*) into cnt from public.group_members where user_id = u and status = 'member';
    if cnt >= 10 then raise exception 'too_many_groups'; end if;
    update public.group_members set status = 'member' where group_id = p_group and user_id = u;
    return jsonb_build_object('status', 'member');
  end if;
  update public.group_members set status = 'declined', created_at = now() where group_id = p_group and user_id = u;
  return jsonb_build_object('status', 'declined');
end $$;

-- leave a group. If the owner leaves, the longest-standing member takes over; an empty group is deleted.
create or replace function public.leave_group(p_group bigint) returns void
language plpgsql security definer set search_path = '' as $$
declare u uuid := private.require_user(); heir uuid;
begin
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

-- owner removes a member (or cancels a pending invite)
create or replace function public.remove_group_member(p_group bigint, p_user uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare u uuid := private.require_user();
begin
  if p_user = u then raise exception 'not_allowed'; end if;                                              -- use leave_group
  if not exists (select 1 from public.chat_groups where id = p_group and owner = u) then raise exception 'not_allowed'; end if;
  delete from public.group_members where group_id = p_group and user_id = p_user;
end $$;

create or replace function public.send_group_message(p_group bigint, p_body text) returns bigint
language plpgsql security definer set search_path = '' as $$
declare u uuid := private.require_user(); name text; teen boolean; txt text; recent int; nid bigint;
begin
  if not public.is_group_member(p_group) then raise exception 'not_member'; end if;
  select p.username, q.is_teen into name, teen from public.profiles p join public.private_profiles q on q.id = p.id where p.id = u;
  if name is null then raise exception 'finish_sign_up'; end if;
  select count(*) into recent from public.group_messages where user_id = u and created_at > now() - interval '10 seconds';
  if recent >= 5 then raise exception 'slow_down'; end if;
  txt := private.chat_clean(p_body, teen);
  if txt is null then raise exception 'message_not_allowed'; end if;
  insert into public.group_messages (group_id, user_id, username, body) values (p_group, u, name, txt) returning id into nid;
  return nid;
end $$;

-- housekeeping (same job as before + group tables): old group messages and old declined invites go away
create or replace function private.cleanup() returns void language sql as $$
  delete from public.room_messages where created_at < now() - interval '2 days';
  delete from public.seat_claims where expires_at < now();
  delete from public.group_messages where created_at < now() - interval '14 days';
  delete from public.group_members where status = 'declined' and created_at < now() - interval '7 days';
$$;

-- ------------------------------------------------------------------ grants + realtime
grant select on public.chat_groups, public.group_members, public.group_messages to authenticated;
grant execute on function public.in_room(text), public.is_group_member(bigint), public.is_group_invited(bigint),
  public.send_room_message(text, text), public.search_players(text), public.create_group(text), public.invite_to_group(bigint, uuid),
  public.respond_group_invite(bigint, boolean), public.leave_group(bigint), public.remove_group_member(bigint, uuid),
  public.send_group_message(bigint, text) to authenticated;

do $$ begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    begin alter publication supabase_realtime add table public.group_messages; exception when duplicate_object then null; end;
    begin alter publication supabase_realtime add table public.group_members; exception when duplicate_object then null; end;
  end if;
end $$;
