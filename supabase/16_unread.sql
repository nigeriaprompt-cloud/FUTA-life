-- 16_unread.sql — unread message counts for the Chat app (per friend, per group, and the app badge).  Run AFTER 10, 14 and 15. Safe to re-run.
-- What it adds
--   * group_members.last_read_id : the last group message each member has seen (their "read cursor"). Existing members start fully read.
--   * get_unread()               : ONE call returns everything the phone needs for the badges: { dms:{<friend id>:n}, groups:{<group id>:n}, invites:n, alerts:n }.
--   * mark_group_read(group)     : "I opened this group" - moves my cursor to the newest message.
-- Direct messages already track "seen" (dms.read_at, from 15_receipts.sql), so their count is simply the unseen ones. Money messages are NOT counted
--   here: the money alert (notifications) already counts them once. Blocked players never count. Counts are exact; the phone shows 99+ above 99.

do $$ begin
  if not exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'group_members' and column_name = 'last_read_id') then
    alter table public.group_members add column last_read_id bigint not null default 0;
    update public.group_members gm set last_read_id = coalesce((select max(m.id) from public.group_messages m where m.group_id = gm.group_id), 0);   -- one-time: nobody starts with a flood
  end if;
end $$;

-- a player who JOINS a group starts at "now" (they do not see the old history as unread)
create or replace function private.gm_cursor() returns trigger language plpgsql as $$
begin
  if new.status = 'member' and (tg_op = 'INSERT' or old.status is distinct from 'member') then
    new.last_read_id := coalesce((select max(m.id) from public.group_messages m where m.group_id = new.group_id), 0);
  end if;
  return new;
end $$;
drop trigger if exists group_members_cursor on public.group_members;
create trigger group_members_cursor before insert or update of status on public.group_members for each row execute function private.gm_cursor();

create index if not exists dms_unread_idx on public.dms (recipient, sender) where read_at is null;

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
  select count(*) into al from public.notifications where user_id = u and read_at is null;
  return jsonb_build_object('dms', d, 'groups', gr, 'invites', inv, 'alerts', al);
end $$;

create or replace function public.mark_group_read(p_group bigint) returns void
language plpgsql security definer set search_path = '' as $$
declare u uuid := private.require_user();
begin
  update public.group_members gm
     set last_read_id = greatest(gm.last_read_id, coalesce((select max(m.id) from public.group_messages m where m.group_id = p_group), 0))
   where gm.group_id = p_group and gm.user_id = u and gm.status = 'member';
end $$;

revoke execute on function public.get_unread(), public.mark_group_read(bigint) from public, anon;
grant execute on function public.get_unread(), public.mark_group_read(bigint) to authenticated;
