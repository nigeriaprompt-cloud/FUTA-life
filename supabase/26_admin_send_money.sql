-- ============================================================================
-- 26_admin_send_money.sql — the ADMIN can send money to ONE player or to ALL players.   Page: /admin (card "Send money")   Doc: docs/ADMIN_SEND_MONEY.md
-- Run AFTER 14_transfers.sql, 17_admin_metrics.sql and 18_celebrations.sql (it uses private.admin_gate from 18). Safe to re-run.
--
-- Rules (the SERVER decides; the browser is never trusted):
--   * Same protection as the rest of /admin: the player must be signed in AND give the admin password (checked by private.admin_gate: 5 wrong tries in 15 min = locked).
--   * The money is created by the admin (it is not taken from anyone). It goes into the receiver's BANK (like feed rewards), so players withdraw it at an ATM.
--   * Every move goes through private.ledger_move-style ledger rows (kind 'admin_grant', ref 'admin:<grant id>') and one row in public.admin_grants (the audit trail).
--   * Receivers get the same phone alert as a money transfer ("FUTAlife sent you ₦…", with the optional note), shown even while the phone is hidden.
--   * ONE player: by username. ALL players: every player who finished sign-up (has a username and a wallet). The admin page first asks for the player count
--     (admin_money_preview) and sends it back as p_expected; if the count changed in between, nothing is sent (count_changed). Two "all" sends cannot happen
--     within 60 seconds (slow_down), so a double tap cannot pay everybody twice.
--   * Whole naira only (bigint). Safety ceilings, change without code:
--       insert into public.app_config(key,value) values ('admin_money.max_single','20000000') on conflict (key) do update set value = excluded.value;
--       keys: admin_money.max_single (10,000,000 per player, one-player send) · admin_money.max_all (1,000,000 per player, all-players send)
-- ============================================================================

create table if not exists public.admin_grants (
  id bigserial primary key,
  admin_id uuid references auth.users(id) on delete set null,
  scope text not null check (scope in ('player', 'all')),
  to_user uuid references auth.users(id) on delete set null,      -- null when scope = 'all'
  to_name text,                                                   -- username at the time (scope = 'player')
  amount bigint not null check (amount > 0),                      -- per player
  recipients int not null default 0 check (recipients >= 0),
  total bigint not null default 0 check (total >= 0),             -- amount x recipients
  note text,
  created_at timestamptz not null default now()
);
create index if not exists admin_grants_idx on public.admin_grants (id desc);
alter table public.admin_grants enable row level security;        -- no policy: players cannot read it; only the functions below touch it
revoke all on public.admin_grants from anon, authenticated;
revoke all on sequence public.admin_grants_id_seq from anon, authenticated;

create or replace function private.admin_money_cfg(p_key text, p_default bigint) returns bigint language sql stable as $$
  select coalesce((select (value #>> '{}')::bigint from public.app_config where key = 'admin_money.' || p_key), p_default) $$;
revoke all on function private.admin_money_cfg(text, bigint) from public, anon, authenticated;

create or replace function private.admin_money_note(p_note text) returns text language sql immutable as $$
  select nullif(btrim(regexp_replace(coalesce(p_note, ''), '[[:cntrl:]]', '', 'g')), '') $$;
revoke all on function private.admin_money_note(text) from public, anon, authenticated;

-- ------------------------------------------------------------------ how many players would get it (and the ceilings), so the page can show "send ₦X to N players"
create or replace function public.admin_money_preview(p_password text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare u uuid := auth.uid(); err text;
begin
  if u is null then raise exception 'auth_required'; end if;
  err := private.admin_gate(u, p_password);
  if err is not null then return jsonb_build_object('ok', false, 'error', err); end if;
  return jsonb_build_object('ok', true,
    'players', (select count(*) from public.profiles p join public.wallets w on w.id = p.id where p.username is not null),
    'maxSingle', private.admin_money_cfg('max_single', 10000000), 'maxAll', private.admin_money_cfg('max_all', 1000000));
end $$;

-- ------------------------------------------------------------------ send to ONE player (by username)
create or replace function public.admin_send_money(p_password text, p_username text, p_amount bigint, p_note text default null) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare u uuid := auth.uid(); err text; n text; tgt uuid; tname text; nt text; gid bigint; nbank bigint;
begin
  if u is null then raise exception 'auth_required'; end if;
  err := private.admin_gate(u, p_password);
  if err is not null then return jsonb_build_object('ok', false, 'error', err); end if;
  if p_amount is null or p_amount < 1 then return jsonb_build_object('ok', false, 'error', 'bad_amount'); end if;
  if p_amount > private.admin_money_cfg('max_single', 10000000) then return jsonb_build_object('ok', false, 'error', 'too_much'); end if;
  nt := private.admin_money_note(p_note);
  if length(coalesce(nt, '')) > 80 then return jsonb_build_object('ok', false, 'error', 'too_long'); end if;
  n := lower(ltrim(btrim(coalesce(p_username, '')), '@'));
  select p.id, p.username into tgt, tname from public.profiles p join public.wallets w on w.id = p.id where p.username = n;
  if tgt is null then return jsonb_build_object('ok', false, 'error', 'player_not_found'); end if;

  insert into public.admin_grants (admin_id, scope, to_user, to_name, amount, recipients, total, note)
    values (u, 'player', tgt, tname, p_amount, 1, p_amount, nt) returning id into gid;
  perform private.ledger_move(tgt, 'admin_grant', 0, p_amount, 'admin:' || gid);
  insert into public.notifications (user_id, kind, from_user, title, body, amount)
    values (tgt, 'money', null, 'FUTAlife sent you ₦' || to_char(p_amount, 'FM999,999,999,990'), nt, p_amount);
  select bank into nbank from public.wallets where id = tgt;
  return jsonb_build_object('ok', true, 'id', gid, 'to', tname, 'amount', p_amount, 'bank', nbank);
end $$;

-- ------------------------------------------------------------------ send to ALL players (everyone who finished sign-up)
create or replace function public.admin_send_money_all(p_password text, p_amount bigint, p_expected int, p_note text default null) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare u uuid := auth.uid(); err text; nt text; cnt int; done int; gid bigint; ttl text;
begin
  if u is null then raise exception 'auth_required'; end if;
  err := private.admin_gate(u, p_password);
  if err is not null then return jsonb_build_object('ok', false, 'error', err); end if;
  if p_amount is null or p_amount < 1 then return jsonb_build_object('ok', false, 'error', 'bad_amount'); end if;
  if p_amount > private.admin_money_cfg('max_all', 1000000) then return jsonb_build_object('ok', false, 'error', 'too_much'); end if;
  nt := private.admin_money_note(p_note);
  if length(coalesce(nt, '')) > 80 then return jsonb_build_object('ok', false, 'error', 'too_long'); end if;
  if exists (select 1 from public.admin_grants where scope = 'all' and created_at > now() - interval '60 seconds') then return jsonb_build_object('ok', false, 'error', 'slow_down'); end if;
  select count(*) into cnt from public.profiles p join public.wallets w on w.id = p.id where p.username is not null;
  if cnt = 0 then return jsonb_build_object('ok', false, 'error', 'no_players'); end if;
  if p_expected is distinct from cnt then return jsonb_build_object('ok', false, 'error', 'count_changed', 'players', cnt); end if;

  insert into public.admin_grants (admin_id, scope, amount, recipients, total, note) values (u, 'all', p_amount, cnt, p_amount * cnt, nt) returning id into gid;
  ttl := 'FUTAlife sent you ₦' || to_char(p_amount, 'FM999,999,999,990');
  with upd as (
    update public.wallets w set bank = w.bank + p_amount from public.profiles p where p.id = w.id and p.username is not null returning w.id
  ), led as (
    insert into public.ledger (user_id, kind, d_pocket, d_bank, ref) select id, 'admin_grant', 0, p_amount, 'admin:' || gid from upd returning user_id
  ), nt_ins as (
    insert into public.notifications (user_id, kind, from_user, title, body, amount) select user_id, 'money', null, ttl, nt, p_amount from led returning 1
  ) select count(*) into done from nt_ins;
  update public.admin_grants set recipients = done, total = p_amount * done where id = gid;
  return jsonb_build_object('ok', true, 'id', gid, 'players', done, 'amount', p_amount, 'total', p_amount * done);
end $$;

-- ------------------------------------------------------------------ the last 15 sends, for the admin page
create or replace function public.admin_money_history(p_password text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare u uuid := auth.uid(); err text;
begin
  if u is null then raise exception 'auth_required'; end if;
  err := private.admin_gate(u, p_password);
  if err is not null then return jsonb_build_object('ok', false, 'error', err); end if;
  return jsonb_build_object('ok', true, 'rows', coalesce((select jsonb_agg(jsonb_build_object('id', id, 'scope', scope, 'to', to_name, 'amount', amount,
      'recipients', recipients, 'total', total, 'note', note, 'at', created_at) order by id desc)
    from (select * from public.admin_grants order by id desc limit 15) g), '[]'::jsonb));
end $$;

revoke execute on function public.admin_money_preview(text), public.admin_send_money(text, text, bigint, text),
  public.admin_send_money_all(text, bigint, int, text), public.admin_money_history(text) from public, anon;
grant execute on function public.admin_money_preview(text), public.admin_send_money(text, text, bigint, text),
  public.admin_send_money_all(text, bigint, int, text), public.admin_money_history(text) to authenticated;
