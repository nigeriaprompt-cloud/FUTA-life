-- ==========================================================================
-- 14_transfers.sql — SEND MONEY to a friend (from the Chat app) + persistent phone notifications.
-- Run AFTER 01_schema.sql and 10_chat_social.sql. Safe to re-run.  Local test: supabase/tests/run.sh (runs tests/test_transfers.sql).
--
-- HOW IT WORKS
--   send_money(to, amount, note)   BANK -> BANK. Only between friends (both waved: the same rule as DMs), same age group, not blocked.
--                                  It moves coins with private.ledger_move() (kinds transfer_out / transfer_in), writes a row in
--                                  public.transfers, drops a "money" message into the DM thread (so it shows in the chat) and a row in
--                                  public.notifications (so the phone can alert even if the receiver was offline).
--   Safety rules (all server-side; change them without code, see "LIMITS" below):
--     * friends only, never yourself, never while in jail, never to/from an unfinished sign-up
--     * min / max per transfer, max transfers and max total SENT per day, max total RECEIVED per day (stops many alt accounts feeding one player)
--     * the note goes through the same word filter as chat (teens: no links / phone numbers)
--     * every move is in the append-only ledger and in public.transfers (admins can audit in the SQL editor)
--   Notifications: list_notifications / mark_notifications_read. The phone listens to INSERTs on public.notifications (realtime).
--
-- LIMITS (defaults; change with:  insert into public.app_config(key,value) values ('transfer.max_per_day','3000000') on conflict (key) do update set value = excluded.value;)
--   transfer.min = 100            transfer.max = 500000          transfer.max_count_day = 10
--   transfer.max_per_day = 2000000 (sent per rolling 24 h)        transfer.max_receive_day = 5000000 (received per rolling 24 h)
-- ==========================================================================

create or replace function private.xfer_cfg(p_key text, p_default bigint) returns bigint language sql stable as $$
  select coalesce((select (value #>> '{}')::bigint from public.app_config where key = 'transfer.' || p_key), p_default) $$;

-- ------------------------------------------------------------------ tables
alter table public.dms add column if not exists kind text not null default 'text';          -- 'text' | 'money'
alter table public.dms add column if not exists amount bigint;                              -- only for kind = 'money'

create table if not exists public.transfers (
  id bigserial primary key,
  from_user uuid not null references auth.users(id) on delete cascade,
  to_user uuid not null references auth.users(id) on delete cascade,
  amount bigint not null check (amount > 0),
  note text,
  created_at timestamptz not null default now()
);
create index if not exists transfers_from_idx on public.transfers (from_user, created_at desc);
create index if not exists transfers_to_idx on public.transfers (to_user, created_at desc);
alter table public.transfers enable row level security;
drop policy if exists transfers_read on public.transfers;
create policy transfers_read on public.transfers for select to authenticated using (from_user = auth.uid() or to_user = auth.uid());

create table if not exists public.notifications (
  id bigserial primary key,
  user_id uuid not null references auth.users(id) on delete cascade,      -- who gets the alert
  kind text not null check (kind in ('money', 'info')),
  from_user uuid references auth.users(id) on delete set null,
  title text not null, body text,
  amount bigint,
  read_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists notifications_user_idx on public.notifications (user_id, id desc);
alter table public.notifications enable row level security;
drop policy if exists notif_read on public.notifications;
create policy notif_read on public.notifications for select to authenticated using (user_id = auth.uid());

-- ------------------------------------------------------------------ send money
create or replace function public.send_money(p_to uuid, p_amount bigint, p_note text default null) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  u uuid := private.require_user(); teen boolean; me_name text; to_name text; note text; txt text;
  mn bigint := private.xfer_cfg('min', 100); mx bigint := private.xfer_cfg('max', 500000);
  cnt_max bigint := private.xfer_cfg('max_count_day', 10); sent_max bigint := private.xfer_cfg('max_per_day', 2000000); recv_max bigint := private.xfer_cfg('max_receive_day', 5000000);
  sent_n int; sent_sum bigint; recv_sum bigint; bank_now bigint; tid bigint; nbank bigint;
begin
  if p_amount is null or p_amount < mn then raise exception 'bad_amount'; end if;
  if p_amount > mx then raise exception 'over_limit'; end if;
  if p_to is null or p_to = u then raise exception 'not_allowed'; end if;
  if private.jail_secs(u) > 0 then raise exception 'in_jail'; end if;
  if not private.dm_allowed(u, p_to) then raise exception 'wave_first'; end if;               -- friends only (also blocks, and teen/adult mixing)
  select p.username, q.is_teen into me_name, teen from public.profiles p join public.private_profiles q on q.id = p.id where p.id = u;
  select username into to_name from public.profiles where id = p_to;
  if me_name is null or to_name is null then raise exception 'finish_sign_up'; end if;
  if p_note is not null and btrim(p_note) <> '' then
    note := private.chat_clean(left(btrim(p_note), 40), teen);
    if note is null then raise exception 'message_not_allowed'; end if;
  end if;

  -- lock both wallets in a fixed order (no deadlock when two friends pay each other at once), then check the limits on a stable view
  perform 1 from public.wallets where id in (u, p_to) order by id for update;
  if (select count(*) from public.wallets where id in (u, p_to)) < 2 then raise exception 'no_wallet'; end if;
  select count(*), coalesce(sum(amount), 0) into sent_n, sent_sum from public.transfers where from_user = u and created_at > now() - interval '1 day';
  if sent_n >= cnt_max then raise exception 'daily_limit'; end if;
  if sent_sum + p_amount > sent_max then raise exception 'daily_limit'; end if;
  select coalesce(sum(amount), 0) into recv_sum from public.transfers where to_user = p_to and created_at > now() - interval '1 day';
  if recv_sum + p_amount > recv_max then raise exception 'receiver_limit'; end if;
  select bank into bank_now from public.wallets where id = u;
  if bank_now < p_amount then raise exception 'insufficient_funds'; end if;

  insert into public.transfers (from_user, to_user, amount, note) values (u, p_to, p_amount, note) returning id into tid;
  perform private.ledger_move(u, 'transfer_out', 0, -p_amount, 'to:' || p_to);
  perform private.ledger_move(p_to, 'transfer_in', 0, p_amount, 'from:' || u);
  txt := '💸 Sent ₦' || to_char(p_amount, 'FM999,999,999,990') || case when note is not null then ' — ' || note else '' end;
  insert into public.dms (sender, recipient, body, kind, amount) values (u, p_to, txt, 'money', p_amount);      -- shows in the chat thread for both
  insert into public.notifications (user_id, kind, from_user, title, body, amount)
    values (p_to, 'money', u, me_name || ' sent you ₦' || to_char(p_amount, 'FM999,999,999,990'), note, p_amount);  -- phone alert
  select bank into nbank from public.wallets where id = u;
  return jsonb_build_object('id', tid, 'amount', p_amount, 'bank', nbank);
end $$;

-- limits + balance, so the phone can show "you can still send ₦…" without guessing
create or replace function public.get_transfer_info() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare u uuid := private.require_user(); sent_sum bigint; sent_n int;
begin
  select coalesce(sum(amount), 0), count(*) into sent_sum, sent_n from public.transfers where from_user = u and created_at > now() - interval '1 day';
  return jsonb_build_object('min', private.xfer_cfg('min', 100), 'max', private.xfer_cfg('max', 500000),
    'leftToday', greatest(0, private.xfer_cfg('max_per_day', 2000000) - sent_sum), 'countLeft', greatest(0, private.xfer_cfg('max_count_day', 10) - sent_n),
    'bank', coalesce((select bank from public.wallets where id = u), 0));
end $$;

-- ------------------------------------------------------------------ notifications
create or replace function public.list_notifications(p_limit int default 30) returns setof public.notifications
language sql stable security definer set search_path = '' as $$
  select * from public.notifications where user_id = auth.uid() order by id desc limit least(greatest(coalesce(p_limit, 30), 1), 50) $$;

create or replace function public.mark_notifications_read() returns void
language sql security definer set search_path = '' as $$
  update public.notifications set read_at = now() where user_id = auth.uid() and read_at is null $$;

-- housekeeping: read alerts go after 7 days, everything after 30
create or replace function private.cleanup() returns void language sql as $$
  delete from public.room_messages where created_at < now() - interval '2 days';
  delete from public.seat_claims where expires_at < now();
  delete from public.group_messages where created_at < now() - interval '14 days';
  delete from public.group_members where status = 'declined' and created_at < now() - interval '7 days';
  delete from public.notifications where created_at < now() - interval '30 days' or (read_at is not null and read_at < now() - interval '7 days');
$$;

-- ------------------------------------------------------------------ grants + realtime
revoke all on public.transfers, public.notifications from anon, authenticated;
revoke all on sequence public.transfers_id_seq, public.notifications_id_seq from anon, authenticated;
revoke execute on function public.send_money(uuid, bigint, text), public.get_transfer_info(), public.list_notifications(int), public.mark_notifications_read() from public, anon;
grant select on public.transfers, public.notifications to authenticated;
grant execute on function public.send_money(uuid, bigint, text), public.get_transfer_info(),
  public.list_notifications(int), public.mark_notifications_read() to authenticated;

do $$ begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    begin alter publication supabase_realtime add table public.notifications; exception when duplicate_object then null; end;
  end if;
end $$;
