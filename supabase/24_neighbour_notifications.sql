-- 24_neighbour_notifications.sql — RETIRED: removes the old neighbour-notification trigger. Safe to run any time, safe to re-run.
--
-- The first version of this file wrote one public.notifications row per neighbour per message (kind = 'neighbour', app = null).
-- Those rows were counted as BANK alerts (get_unread / list_notifications only skip rows whose app is set), so the Chat badge went up twice
-- and the money-alert list filled with chat text. The phone no longer needs them: the heads-up with quick reply is drawn from the realtime
-- group_messages stream the phone already listens to (phone/apps/chat.js → nbHeadsUp, phone/phone.js → notify).
-- Nothing to run for NEW projects; run this once on a project that already ran the old version.

drop trigger if exists neighbour_message_notify on public.group_messages;
drop function if exists public.notify_neighbour_message();

delete from public.notifications where kind = 'neighbour';

alter table public.notifications drop constraint if exists notifications_kind_check;
alter table public.notifications add constraint notifications_kind_check check (kind in ('money', 'info'));
