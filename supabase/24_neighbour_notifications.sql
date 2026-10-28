-- 24_neighbour_notifications.sql — NEIGHBOUR MESSAGE NOTIFICATIONS
-- Run AFTER 10_chat_social.sql, 14_transfers.sql, 16_unread.sql, 23_neighbours.sql. Safe to re-run.
--
-- When a player posts a message in their neighbour group, every other member gets
-- a notification (public.notifications kind = 'neighbour') so they can read it and
-- quick-reply from the phone without opening the Neighbours app.
--
-- The trigger lives on group_messages so ANY insert path (send_group_message RPC,
-- demo inserts, future importers) creates notifications. It only fires for
-- neighbour groups (kind = 'neighbour') and skips the sender themselves.

-- allow neighbour as a notification kind
alter table public.notifications
  drop constraint if exists notifications_kind_check;
alter table public.notifications
  add constraint notifications_kind_check
  check (kind in ('money', 'info', 'neighbour'));

-- one notification row per recipient per neighbour message
create or replace function public.notify_neighbour_message() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  gid bigint := new.group_id;
  rid uuid;
begin
  -- only neighbour groups
  if not exists (select 1 from public.chat_groups c where c.id = gid and c.kind = 'neighbour') then
    return new;
  end if;

  for rid in
    select m.user_id
    from public.group_members m
    where m.group_id = gid
      and m.status = 'member'
      and m.user_id <> new.user_id
  loop
    insert into public.notifications (user_id, kind, from_user, title, body)
    values (rid, 'neighbour', new.user_id,
      (select username from public.profiles where id = new.user_id),
      left(new.body, 200));
  end loop;

  return new;
end $$;

drop trigger if exists neighbour_message_notify on public.group_messages;
create trigger neighbour_message_notify
  after insert on public.group_messages
  for each row
  execute function public.notify_neighbour_message();

-- the phone can list + mark neighbour notifications read via the existing
-- list_notifications / mark_notifications_read RPCs (no new RPC needed)
revoke all on function public.notify_neighbour_message() from public, anon;
grant select on public.notifications to authenticated;

do $$ begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    begin alter publication supabase_realtime add table public.notifications; exception when duplicate_object then null; end;
  end if;
end $$;