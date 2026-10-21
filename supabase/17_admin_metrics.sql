-- ============================================================================
-- FUTA World — ADMIN METRICS dashboard (read-only numbers). Run AFTER 01..16.   Page: /admin   Doc: docs/ADMIN_DASHBOARD.md
--
-- Security (the rules in .clinerules: the SERVER decides, no secrets in the client):
--   * The dashboard password is NOT in any browser file. Only a bcrypt HASH of it lives here, in private.admin_secret
--     (the private schema is not exposed by the API, RLS is on, no grants).
--   * public.admin_metrics(p_password) checks the password on the server, needs a signed-in player, and returns ONLY totals
--     (no emails, no names, no messages, no balances of single people).
--   * 5 wrong passwords in 15 minutes locks that player out of the dashboard for the rest of the 15 minutes.
--   * To change the password: run   select private.admin_set_password('new password');   in the SQL editor (as the owner).
-- ============================================================================
create schema if not exists extensions;
create extension if not exists pgcrypto with schema extensions;

create table if not exists private.admin_secret (id int primary key default 1 check (id = 1), pw_hash text not null);
create table if not exists private.admin_attempts (id bigserial primary key, user_id uuid not null, at timestamptz not null default now());
create index if not exists admin_attempts_idx on private.admin_attempts (user_id, at desc);
alter table private.admin_secret enable row level security;
alter table private.admin_attempts enable row level security;
revoke all on private.admin_secret, private.admin_attempts from anon, authenticated;

create or replace function private.admin_set_password(p_pw text) returns void language plpgsql security definer set search_path = '' as $$
begin
  if p_pw is null or length(p_pw) < 8 then raise exception 'password_too_short'; end if;
  insert into private.admin_secret (id, pw_hash) values (1, extensions.crypt(p_pw, extensions.gen_salt('bf', 10)))
  on conflict (id) do update set pw_hash = excluded.pw_hash;
end $$;
revoke all on function private.admin_set_password(text) from public, anon, authenticated;

-- first install only: the hash of the password the owner chose (never overwritten on re-run)
insert into private.admin_secret (id, pw_hash) values (1, '$2a$10$Yn0sXNyXsTaDZLYUVnqJXuqFJs3vfc/.ftvOcNdqc02RcG4D7FT.u') on conflict (id) do nothing;

create or replace function public.admin_metrics(p_password text) returns jsonb language plpgsql security definer set search_path = '' as $$
declare u uuid := auth.uid(); pwh text; fails int; ok boolean; res jsonb;
begin
  if u is null then raise exception 'auth_required'; end if;
  select count(*) into fails from private.admin_attempts where user_id = u and at > now() - interval '15 minutes';
  if fails >= 5 then return jsonb_build_object('ok', false, 'error', 'locked'); end if;
  select pw_hash into pwh from private.admin_secret where id = 1;
  ok := pwh is not null and p_password is not null and length(p_password) <= 200 and extensions.crypt(p_password, pwh) = pwh;
  if not ok then
    insert into private.admin_attempts (user_id) values (u);
    delete from private.admin_attempts where at < now() - interval '2 days';
    return jsonb_build_object('ok', false, 'error', 'bad_password', 'triesLeft', greatest(0, 4 - fails));
  end if;
  delete from private.admin_attempts where user_id = u;

  select jsonb_build_object(
    'ok', true, 'at', now(),
    'players', (select jsonb_build_object(
        'total', count(*), 'new24h', count(*) filter (where created_at > now() - interval '1 day'),
        'new7d', count(*) filter (where created_at > now() - interval '7 days'))
      from public.profiles where username is not null),
    'teens', (select count(*) from public.private_profiles where is_teen),
    'online', (select jsonb_build_object(
        'now', count(*) filter (where updated_at > now() - interval '5 minutes'),
        'inBuildings', count(*) filter (where updated_at > now() - interval '10 minutes' and building is not null),
        'active24h', count(*) filter (where updated_at > now() - interval '1 day'))
      from public.player_stats),
    'busiest', coalesce((select jsonb_agg(jsonb_build_object('building', building, 'n', n) order by n desc)
      from (select building, count(*) n from public.player_stats where building is not null and updated_at > now() - interval '10 minutes'
            group by building order by n desc limit 5) b), '[]'::jsonb),
    'money', (select jsonb_build_object('pocket', coalesce(sum(pocket), 0), 'bank', coalesce(sum(bank), 0)) from public.wallets),
    'ledger24h', coalesce((select jsonb_agg(jsonb_build_object('kind', kind, 'n', n, 'net', net) order by n desc)
      from (select kind, count(*) n, sum(d_pocket + d_bank) net from public.ledger where created_at > now() - interval '1 day'
            group by kind order by count(*) desc limit 12) l), '[]'::jsonb),
    'vault', (select jsonb_build_object(
        'status', (select status from public.vault_state where id = 'heritage'),
        'amount', (select amount from public.vault_state where id = 'heritage'),
        'won24h', count(*) filter (where status = 'won'), 'lost24h', count(*) filter (where status in ('lost', 'expired')),
        'paid24h', coalesce(sum(payout) filter (where status = 'won'), 0),
        'inJail', (select count(*) from public.jail where "until" > now()))
      from public.vault_attempts where started_at > now() - interval '1 day'),
    'chat', jsonb_build_object(
        'room24h', (select count(*) from public.room_messages where created_at > now() - interval '1 day'),
        'dm24h', (select count(*) from public.dms where created_at > now() - interval '1 day'),
        'groups', (select count(*) from public.chat_groups)),
    'reports', coalesce((select jsonb_object_agg(reason, n) from (select reason, count(*) n from public.reports where status = 'open' group by reason) r), '{}'::jsonb),
    'signups14d', (select coalesce(jsonb_agg(c order by d), '[]'::jsonb) from (
        select g::date d, (select count(*) from public.profiles p where p.username is not null and p.created_at::date = g::date) c
        from generate_series(current_date - 13, current_date, interval '1 day') g) s),
    'hourly24h', (select coalesce(jsonb_agg(c order by h), '[]'::jsonb) from (
        select g h, (select count(*) from public.ledger l where l.created_at >= g and l.created_at < g + interval '1 hour') c
        from generate_series(date_trunc('hour', now()) - interval '23 hours', date_trunc('hour', now()), interval '1 hour') g) s)
  ) into res;
  return res;
end $$;
revoke all on function public.admin_metrics(text) from public, anon;
grant execute on function public.admin_metrics(text) to authenticated;
