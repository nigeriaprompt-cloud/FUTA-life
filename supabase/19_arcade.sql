-- 19_arcade.sql — the phone app "Arcade": Campus Dash (one-tap endless runner). Run AFTER 01, 03 (jail) and 13. Safe to re-run.
-- HOW PLAYERS EARN: arcade_start() opens a run (the SERVER clock starts), arcade_finish(run, score) closes it and pays money into the POCKET (ledger kind 'arcade').
-- A phone game can always be faked, so the server never trusts the score alone:
--   * a run is paid once, only to its owner, only after at least 8 seconds on the server clock;
--   * the best possible score grows with elapsed time (the game gives at most 10 points per second + 5 per coin, so cap = 18 per second + 20); more is clamped to that;
--   * pay = score / 10 * ₦ per 10 points (default ₦10)  — a 60 second run is about ₦60-90;  per-day cap (default ₦3,000) and at most 60 paid runs a day;
--   * runs must be 5 seconds apart, one open run at a time, nothing while in jail.
-- Change numbers without code:  insert into public.app_config(key,value) values ('arcade.per10','20') on conflict (key) do update set value = excluded.value;
--   keys: arcade.per10 (10) · arcade.daily_cap (3000) · arcade.daily_runs (60) · arcade.min_secs (8) · arcade.gap (5)
create table if not exists public.arcade_runs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  game text not null default 'dash',
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  score int, paid bigint not null default 0
);
create index if not exists arcade_runs_user_idx on public.arcade_runs (user_id, started_at desc);
alter table public.arcade_runs enable row level security;       -- no policy: only the functions below touch it
create table if not exists public.arcade_best (
  user_id uuid not null references auth.users(id) on delete cascade,
  game text not null default 'dash',
  best int not null default 0, plays int not null default 0, updated_at timestamptz not null default now(),
  primary key (user_id, game)
);
create index if not exists arcade_best_top_idx on public.arcade_best (game, best desc);
alter table public.arcade_best enable row level security;       -- read through arcade_board() only

create or replace function private.arc_cfg(p_key text, p_default bigint) returns bigint language sql stable as $$
  select coalesce((select (value #>> '{}')::bigint from public.app_config where key = 'arcade.' || p_key), p_default) $$;

create or replace function private.arc_today(u uuid) returns bigint language sql stable set search_path = '' as $$
  select coalesce(sum(paid), 0)::bigint from public.arcade_runs where user_id = u and finished_at >= private.lagos_day_start() $$;

create or replace function public.arcade_status() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare u uuid := private.require_user(); cap bigint := private.arc_cfg('daily_cap', 3000); earned bigint := private.arc_today(u); b int; p int;
begin
  select best, plays into b, p from public.arcade_best where user_id = u and game = 'dash';
  return jsonb_build_object('cap', cap, 'earned', earned, 'left', greatest(cap - earned, 0), 'per10', private.arc_cfg('per10', 10),
    'best', coalesce(b, 0), 'plays', coalesce(p, 0), 'pocket', coalesce((select pocket from public.wallets where id = u), 0));
end $$;

create or replace function public.arcade_start(p_game text default 'dash') returns jsonb
language plpgsql security definer set search_path = '' as $$
declare u uuid := private.require_user(); rid uuid; last_at timestamptz; done boolean;
begin
  if p_game <> 'dash' then raise exception 'bad_game'; end if;
  select q.onboarded into done from public.private_profiles q where q.id = u;
  if not coalesce(done, false) then raise exception 'finish_sign_up'; end if;
  if private.jail_secs(u) > 0 then raise exception 'in_jail'; end if;
  perform 1 from public.wallets where id = u for update;            -- one start at a time per player
  select max(started_at) into last_at from public.arcade_runs where user_id = u;
  if last_at is not null and last_at > now() - make_interval(secs => private.arc_cfg('gap', 5)) then raise exception 'slow_down'; end if;
  update public.arcade_runs set finished_at = now(), score = 0 where user_id = u and finished_at is null;   -- an abandoned run pays nothing
  insert into public.arcade_runs (user_id, game) values (u, p_game) returning id into rid;
  return jsonb_build_object('run', rid) || public.arcade_status();
end $$;

create or replace function public.arcade_finish(p_run uuid, p_score int) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  u uuid := private.require_user(); r public.arcade_runs%rowtype; secs numeric; maxs int; sc int; per10 bigint := private.arc_cfg('per10', 10);
  cap bigint := private.arc_cfg('daily_cap', 3000); earned bigint; pay bigint := 0; nruns int; b int;
begin
  perform 1 from public.wallets where id = u for update;
  select * into r from public.arcade_runs where id = p_run and user_id = u;
  if not found then raise exception 'not_found'; end if;
  if r.finished_at is not null then raise exception 'already_paid'; end if;
  secs := extract(epoch from (now() - r.started_at));
  maxs := floor(secs * 18)::int + 20;
  sc := least(greatest(coalesce(p_score, 0), 0), maxs);
  earned := private.arc_today(u);
  select count(*) into nruns from public.arcade_runs where user_id = u and finished_at >= private.lagos_day_start() and paid > 0;
  if secs >= private.arc_cfg('min_secs', 8) and nruns < private.arc_cfg('daily_runs', 60) then
    pay := least((sc / 10) * per10, greatest(cap - earned, 0));
  end if;
  update public.arcade_runs set finished_at = now(), score = sc, paid = pay where id = r.id;
  if pay > 0 then perform private.ledger_move(u, 'arcade', pay, 0, 'run:' || r.id); end if;
  insert into public.arcade_best (user_id, game, best, plays) values (u, r.game, sc, 1)
    on conflict (user_id, game) do update set best = greatest(public.arcade_best.best, excluded.best), plays = public.arcade_best.plays + 1, updated_at = now()
    returning best into b;
  return jsonb_build_object('score', sc, 'paid', pay, 'best', b, 'new_best', sc >= b and sc > 0, 'clamped', sc < coalesce(p_score, 0)) || public.arcade_status();
end $$;

-- top 10 (same age group as you, blocked players hidden) + your own best
create or replace function public.arcade_board(p_game text default 'dash') returns table (username text, best int, me boolean)
language plpgsql stable security definer set search_path = '' as $$
declare u uuid := private.require_user();
begin
  return query
    select p.username::text, b.best, (b.user_id = u)
      from public.arcade_best b join public.profiles p on p.id = b.user_id
     where b.game = p_game and b.best > 0 and private.same_age_group(u, b.user_id) and (b.user_id = u or not public.is_blocked_between(u, b.user_id))
     order by b.best desc, b.updated_at limit 10;
end $$;

create or replace function private.arcade_cleanup() returns void language sql as $$
  delete from public.arcade_runs where started_at < now() - interval '30 days' $$;

revoke all on public.arcade_runs, public.arcade_best from public, anon, authenticated;
revoke execute on function public.arcade_status(), public.arcade_start(text), public.arcade_finish(uuid, int), public.arcade_board(text) from public, anon;
grant execute on function public.arcade_status(), public.arcade_start(text), public.arcade_finish(uuid, int), public.arcade_board(text) to authenticated;
