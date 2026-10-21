-- ==========================================================================
-- 15_receipts.sql — WhatsApp-style message ticks (sent / delivered / seen) + safe RESEND after a network failure.
-- Run AFTER 01_schema.sql, 10_chat_social.sql and 14_transfers.sql. Safe to re-run.  Local test: supabase/tests/run.sh (tests/test_receipts.sql).
--
-- 1. TICKS (direct messages only)
--      sent       ✓   the server stored it                      (the row exists)
--      delivered  ✓✓  the receiver's phone got it              (dms.delivered_at, set by mark_dms_delivered())
--      seen       ✓✓  (light blue) the receiver opened the chat (dms.read_at, set by mark_dms_read(peer))
--    Only the RECEIVER can set these, only through the two RPCs below (no table writes), and only on messages sent TO them.
--    The sender's phone learns about a change through realtime (UPDATE on public.dms).
-- 2. RESEND  — every send RPC now takes an optional client id (p_client uuid).  The phone makes one id per message and re-sends the SAME id
--    after a network failure; if the first try did reach the server, the second returns the ORIGINAL message id instead of posting twice.
--    send_dm(to, body, client) · send_room_message(room, body, client) · send_group_message(group, body, client).  Old 2-argument calls still work.
-- ==========================================================================

-- ------------------------------------------------------------------ columns
do $$ begin
  if not exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'dms' and column_name = 'read_at') then
    alter table public.dms add column delivered_at timestamptz, add column read_at timestamptz;
    update public.dms set delivered_at = created_at, read_at = created_at;      -- messages from before this feature count as seen
  end if;
end $$;
alter table public.dms add column if not exists client_id uuid;
alter table public.room_messages add column if not exists client_id uuid;
alter table public.group_messages add column if not exists client_id uuid;
create unique index if not exists dms_client_uq on public.dms (sender, client_id) where client_id is not null;
create unique index if not exists room_messages_client_uq on public.room_messages (user_id, client_id) where client_id is not null;
create unique index if not exists group_messages_client_uq on public.group_messages (user_id, client_id) where client_id is not null;
create index if not exists dms_unseen_idx on public.dms (recipient, sender) where read_at is null;

-- the old signatures go away so the new ones (extra optional argument) are the only candidates
drop function if exists public.send_dm(uuid, text);
drop function if exists public.send_room_message(text, text);
drop function if exists public.send_group_message(bigint, text);

-- ------------------------------------------------------------------ direct message
create or replace function public.send_dm(p_to uuid, p_body text, p_client uuid default null) returns bigint
language plpgsql security definer set search_path = '' as $$
declare u uuid := private.require_user(); teen boolean; txt text; recent int; nid bigint;
begin
  if p_client is not null then                                   -- a retry of a message that already arrived: hand back the original, do nothing else
    select id into nid from public.dms where sender = u and client_id = p_client;
    if found then return nid; end if;
  end if;
  if not private.dm_allowed(u, p_to) then raise exception 'wave_first'; end if;
  select is_teen into teen from public.private_profiles where id = u;
  select count(*) into recent from public.dms where sender = u and created_at > now() - interval '10 seconds';
  if recent >= 5 then raise exception 'slow_down'; end if;
  txt := private.chat_clean(p_body, teen);
  if txt is null then raise exception 'message_not_allowed'; end if;
  insert into public.dms (sender, recipient, body, client_id) values (u, p_to, txt, p_client)
    on conflict (sender, client_id) where client_id is not null do nothing returning id into nid;
  if nid is null then select id into nid from public.dms where sender = u and client_id = p_client; end if;    -- two retries at once: the loser reads the winner's row
  return nid;
end $$;

-- ------------------------------------------------------------------ building / campus room
create or replace function public.send_room_message(p_room text, p_body text, p_client uuid default null) returns bigint
language plpgsql security definer set search_path = '' as $$
declare u uuid := private.require_user(); name text; teen boolean; txt text; recent int; nid bigint;
begin
  if p_client is not null then
    select id into nid from public.room_messages where user_id = u and client_id = p_client;
    if found then return nid; end if;
  end if;
  if p_room !~ '^[a-z0-9_:.-]{1,60}$' then raise exception 'bad_room'; end if;
  if not public.in_room(p_room) then raise exception 'not_in_room'; end if;
  select p.username, q.is_teen into name, teen from public.profiles p join public.private_profiles q on q.id = p.id where p.id = u;
  if name is null then raise exception 'finish_sign_up'; end if;
  select count(*) into recent from public.room_messages where user_id = u and created_at > now() - interval '10 seconds';
  if recent >= 5 then raise exception 'slow_down'; end if;
  txt := private.chat_clean(p_body, teen);
  if txt is null then raise exception 'message_not_allowed'; end if;
  insert into public.room_messages (room, user_id, username, body, client_id) values (p_room, u, name, txt, p_client)
    on conflict (user_id, client_id) where client_id is not null do nothing returning id into nid;
  if nid is null then select id into nid from public.room_messages where user_id = u and client_id = p_client; end if;
  return nid;
end $$;

-- ------------------------------------------------------------------ group
create or replace function public.send_group_message(p_group bigint, p_body text, p_client uuid default null) returns bigint
language plpgsql security definer set search_path = '' as $$
declare u uuid := private.require_user(); name text; teen boolean; txt text; recent int; nid bigint;
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
  insert into public.group_messages (group_id, user_id, username, body, client_id) values (p_group, u, name, txt, p_client)
    on conflict (user_id, client_id) where client_id is not null do nothing returning id into nid;
  if nid is null then select id into nid from public.group_messages where user_id = u and client_id = p_client; end if;
  return nid;
end $$;

-- ------------------------------------------------------------------ ticks: the RECEIVER reports
-- "my phone has your messages": call on login and whenever a new DM arrives.  Returns how many were newly marked.
create or replace function public.mark_dms_delivered() returns int
language plpgsql security definer set search_path = '' as $$
declare u uuid := private.require_user(); n int;
begin
  update public.dms set delivered_at = now() where recipient = u and delivered_at is null;
  get diagnostics n = row_count; return n;
end $$;

-- "I opened the chat with <peer>": everything they sent me is now seen (and delivered).
create or replace function public.mark_dms_read(p_peer uuid) returns int
language plpgsql security definer set search_path = '' as $$
declare u uuid := private.require_user(); n int;
begin
  update public.dms set delivered_at = coalesce(delivered_at, now()), read_at = now() where recipient = u and sender = p_peer and read_at is null;
  get diagnostics n = row_count; return n;
end $$;

-- ------------------------------------------------------------------ grants
revoke execute on function public.send_dm(uuid, text, uuid), public.send_room_message(text, text, uuid), public.send_group_message(bigint, text, uuid),
  public.mark_dms_delivered(), public.mark_dms_read(uuid) from public, anon;
grant execute on function public.send_dm(uuid, text, uuid), public.send_room_message(text, text, uuid), public.send_group_message(bigint, text, uuid),
  public.mark_dms_delivered(), public.mark_dms_read(uuid) to authenticated;
-- (table access is unchanged: browsers can still only SELECT dms through the RLS policy; they cannot write delivered_at / read_at themselves)
