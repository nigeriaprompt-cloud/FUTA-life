-- 18_bulletins.sql — data for the two phone apps "NEPA" (power updates) and "Tutorial" (how-to guides). Anyone signed in can post.
-- Run in the Supabase SQL Editor AFTER 01_schema.sql and 05_feed.sql (it uses private.lagos_day_start from 05), and again after re-running 01 (01 revokes all grants).
-- Safe to re-run. ONE table serves both apps (kind = 'nepa' | 'tutorial'). No money is involved: nobody is paid for posting.
-- Rules (all decided HERE, never in the browser):
--   NEPA      status (on / off / low / maint / news) + a place (2–40 characters) + an optional note (10–200 characters, ≥ 2 words). Gone after 12 h.
--             10 posts per player per Africa/Lagos day, ≥ 60 s apart; the same status + place by the same player is refused for 30 minutes.
--   TUTORIAL  a title (5–60 characters, ≥ 2 words), one of 6 categories and a guide (40–1200 characters, ≥ 8 words, line breaks allowed). Stays until the author removes it.
--             3 per player per Lagos day, ≥ 300 s apart; a title that is already live cannot be used again.
--   Both      signed-in players who finished sign-up only · no links, no phone numbers, no banned words · "Helpful" / "I see this too" = one vote per player,
--             never on your own post · Report: 3 different players hide a post automatically (admin reviews the reports) · Block hides both ways.
--   "Remove" by the author hides the post but keeps the row, so removing and re-posting cannot beat the daily limit.
-- Change a number without code:  insert into public.app_config(key,value) values ('bulletin.nepa_daily','20') on conflict (key) do update set value = excluded.value;
--   keys: bulletin.nepa_daily (10) · nepa_gap (60) · nepa_hours (12) · tut_daily (3) · tut_gap (300) · report_hide (3)
-- The status list and the category list are fixed here AND in public/world/game/phone/apps/bulletin-core.js — change both together.
-- Housekeeping (optional, pg_cron):  select cron.schedule('bulletin-cleanup', '17 * * * *', 'select private.bulletin_cleanup()');

create table if not exists public.bulletins (
  id bigserial primary key,
  kind text not null check (kind in ('nepa', 'tutorial')),
  user_id uuid not null references auth.users(id) on delete cascade,
  username text not null,
  status text, place text,                 -- NEPA
  category text, title text,               -- Tutorial
  body text not null default '',           -- NEPA: the optional note · Tutorial: the guide
  body_hash text not null,
  helpful int not null default 0,
  hidden boolean not null default false,   -- removed by the author or hidden by reports
  created_at timestamptz not null default now(),
  expires_at timestamptz                   -- null = never (tutorials)
);
create index if not exists bulletins_kind_idx on public.bulletins (kind, id desc);
create index if not exists bulletins_top_idx on public.bulletins (kind, helpful desc, id desc);
create index if not exists bulletins_user_idx on public.bulletins (user_id, kind, created_at desc);
create index if not exists bulletins_hash_idx on public.bulletins (body_hash);
alter table public.bulletins enable row level security;

create table if not exists public.bulletin_votes (
  bulletin_id bigint not null references public.bulletins(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  primary key (bulletin_id, user_id)
);
alter table public.bulletin_votes enable row level security;

create table if not exists public.bulletin_reports (
  bulletin_id bigint not null references public.bulletins(id) on delete cascade,
  reporter uuid not null references auth.users(id) on delete cascade,
  reason text not null, created_at timestamptz not null default now(),
  primary key (bulletin_id, reporter)
);
alter table public.bulletin_reports enable row level security;      -- no policy: only the functions below touch it

-- ------------------------------------------------------------------ helpers
create or replace function private.bul_cfg(p_key text, p_default bigint) returns bigint language sql stable as $$
  select coalesce((select (value #>> '{}')::bigint from public.app_config where key = 'bulletin.' || p_key), p_default) $$;

create or replace function private.bul_statuses() returns text[] language sql immutable as $$ select array['on', 'off', 'low', 'maint', 'news'] $$;
create or replace function private.bul_cats() returns text[] language sql immutable as $$ select array['Study', 'Tech', 'Money', 'Campus life', 'Skills', 'Health'] $$;

-- true if the text has a link, a Nigerian phone number or a banned word
create or replace function private.bul_bad(t text) returns boolean language plpgsql stable as $$
declare w text;
begin
  if t ~* '(https?://|www\.|\.(com|ng|net|org|me|ly|io|co)\y)' or t ~ '(\+?234|0)[789][01]\d[\s-]?\d{3}[\s-]?\d{4}' then return true; end if;
  for w in select word from public.banned_words loop
    if t ~* ('\m' || regexp_replace(w, '([^a-z0-9 ])', '\\\1', 'g') || '\M') then return true; end if;
  end loop;
  return false;
end $$;

-- cleaned text, or null if it is not allowed.  p_lines = keep line breaks (tutorial guide)
create or replace function private.bul_clean(p_text text, p_min int, p_max int, p_words int, p_lines boolean) returns text language plpgsql stable as $$
declare t text := coalesce(p_text, '');
begin
  t := replace(t, E'\r', '');
  t := regexp_replace(t, '[ \t]+', ' ', 'g');
  if p_lines then
    t := regexp_replace(t, ' ?\n ?', E'\n', 'g');
    t := regexp_replace(t, '\n{3,}', E'\n\n', 'g');
  else
    t := regexp_replace(t, '\s+', ' ', 'g');
  end if;
  t := btrim(t, E' \n');
  if char_length(t) < p_min or char_length(t) > p_max then return null; end if;
  if array_length(regexp_split_to_array(t, '\s+'), 1) < p_words then return null; end if;
  if (select count(distinct c) from regexp_split_to_table(lower(t), '') as c) < 5 then return null; end if;   -- "aaaaaaaa" spam
  if private.bul_bad(t) then return null; end if;
  return t;
end $$;

-- a NEPA place: plain letters / digits / a few signs, 2–40 characters, no links
create or replace function private.bul_place(p_place text) returns text language plpgsql stable as $$
declare t text := btrim(regexp_replace(coalesce(p_place, ''), '\s+', ' ', 'g'));
begin
  if t !~ '^[A-Za-z0-9 .,''&/()-]{2,40}$' then return null; end if;
  if private.bul_bad(t) then return null; end if;
  return t;
end $$;

create or replace function private.bul_left(u uuid, p_kind text) returns int language sql stable set search_path = '' as $$
  select greatest((case when p_kind = 'nepa' then private.bul_cfg('nepa_daily', 10) else private.bul_cfg('tut_daily', 3) end)::int
    - (select count(*) from public.bulletins where user_id = u and kind = p_kind and created_at >= private.lagos_day_start())::int, 0) $$;

-- who may post right now? returns the player's username, or raises finish_sign_up / daily_limit / slow_down
create or replace function private.bul_gate(u uuid, p_kind text) returns text language plpgsql set search_path = '' as $$
declare name text; done boolean; gap int; last_at timestamptz;
begin
  select p.username, q.onboarded into name, done from public.profiles p join public.private_profiles q on q.id = p.id where p.id = u;
  if name is null or not coalesce(done, false) then raise exception 'finish_sign_up'; end if;
  perform 1 from public.wallets where id = u for update;          -- one post at a time per player, so parallel taps cannot beat the daily limit
  if private.bul_left(u, p_kind) <= 0 then raise exception 'daily_limit'; end if;
  gap := (case when p_kind = 'nepa' then private.bul_cfg('nepa_gap', 60) else private.bul_cfg('tut_gap', 300) end)::int;
  select max(created_at) into last_at from public.bulletins where user_id = u and kind = p_kind;
  if gap > 0 and last_at is not null and last_at > now() - make_interval(secs => gap) then raise exception 'slow_down'; end if;
  return name;
end $$;

create or replace function private.bulletin_cleanup() returns void language sql as $$
  delete from public.bulletins where kind = 'nepa' and expires_at < now() - interval '2 days' $$;

-- ------------------------------------------------------------------ RPCs
create or replace function public.get_bulletin_status(p_kind text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare u uuid := private.require_user();
begin
  if coalesce(p_kind, '') not in ('nepa', 'tutorial') then raise exception 'bad_kind'; end if;
  return jsonb_build_object('daily_limit', (case when p_kind = 'nepa' then private.bul_cfg('nepa_daily', 10) else private.bul_cfg('tut_daily', 3) end),
    'posts_left', private.bul_left(u, p_kind), 'hours', private.bul_cfg('nepa_hours', 12),
    'statuses', to_jsonb(private.bul_statuses()), 'categories', to_jsonb(private.bul_cats()));
end $$;

create or replace function public.post_nepa(p_status text, p_place text, p_note text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare u uuid := private.require_user(); name text; place text; note text; h text; nid bigint;
begin
  if p_status is null or p_status <> all (private.bul_statuses()) then raise exception 'bad_status'; end if;
  place := private.bul_place(p_place);
  if place is null then raise exception 'bad_place'; end if;
  note := btrim(coalesce(p_note, ''));
  if note <> '' then
    note := private.bul_clean(note, 10, 200, 2, false);
    if note is null then raise exception 'post_not_allowed'; end if;
  end if;
  name := private.bul_gate(u, 'nepa');
  h := md5(lower('nepa|' || p_status || '|' || place));
  if exists (select 1 from public.bulletins where kind = 'nepa' and user_id = u and body_hash = h and created_at > now() - interval '30 minutes') then raise exception 'duplicate_post'; end if;
  insert into public.bulletins (kind, user_id, username, status, place, body, body_hash, expires_at)
    values ('nepa', u, name, p_status, place, note, h, now() + make_interval(hours => private.bul_cfg('nepa_hours', 12)::int)) returning id into nid;
  return jsonb_build_object('id', nid, 'posts_left', private.bul_left(u, 'nepa'));
end $$;

create or replace function public.post_tutorial(p_title text, p_category text, p_body text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare u uuid := private.require_user(); name text; ttl text; txt text; h text; nid bigint;
begin
  if p_category is null or p_category <> all (private.bul_cats()) then raise exception 'bad_category'; end if;
  ttl := private.bul_clean(p_title, 5, 60, 2, false);
  txt := private.bul_clean(p_body, 40, 1200, 8, true);
  if ttl is null or txt is null then raise exception 'post_not_allowed'; end if;
  name := private.bul_gate(u, 'tutorial');
  h := md5(lower(ttl));
  if exists (select 1 from public.bulletins where kind = 'tutorial' and body_hash = h and not hidden) then raise exception 'duplicate_post'; end if;
  insert into public.bulletins (kind, user_id, username, category, title, body, body_hash)
    values ('tutorial', u, name, p_category, ttl, txt, h) returning id into nid;
  return jsonb_build_object('id', nid, 'posts_left', private.bul_left(u, 'tutorial'));
end $$;

-- "Helpful" (tutorial) / "I see this too" (NEPA): tap again to take it back
create or replace function public.vote_bulletin(p_id bigint) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare u uuid := private.require_user(); b public.bulletins; n int; voted boolean;
begin
  select * into b from public.bulletins where id = p_id and not hidden and (expires_at is null or expires_at > now());
  if not found then raise exception 'not_found'; end if;
  if b.user_id = u then raise exception 'own_post'; end if;
  if public.is_blocked_between(u, b.user_id) then raise exception 'not_allowed'; end if;
  if exists (select 1 from public.bulletin_votes where bulletin_id = p_id and user_id = u) then
    delete from public.bulletin_votes where bulletin_id = p_id and user_id = u; voted := false;
  else
    insert into public.bulletin_votes (bulletin_id, user_id) values (p_id, u); voted := true;
  end if;
  update public.bulletins set helpful = (select count(*) from public.bulletin_votes where bulletin_id = p_id) where id = p_id returning helpful into n;
  return jsonb_build_object('helpful', n, 'voted', voted);
end $$;

create or replace function public.report_bulletin(p_id bigint, p_reason text) returns void
language plpgsql security definer set search_path = '' as $$
declare u uuid := private.require_user(); b public.bulletins; n int;
begin
  if coalesce(p_reason, '') not in ('spam', 'inappropriate', 'harassment', 'other') then raise exception 'bad_reason'; end if;
  select * into b from public.bulletins where id = p_id and not hidden;
  if not found then raise exception 'not_found'; end if;
  if b.user_id = u then raise exception 'own_post'; end if;
  select count(*) into n from public.reports where reporter = u and created_at > now() - interval '1 day';
  if n >= 20 then raise exception 'slow_down'; end if;
  if exists (select 1 from public.bulletin_reports where bulletin_id = p_id and reporter = u) then raise exception 'already_reported'; end if;
  insert into public.bulletin_reports (bulletin_id, reporter, reason) values (p_id, u, p_reason);
  insert into public.reports (reporter, target, reason, context) values (u, b.user_id, p_reason, 'bulletin:' || p_id);   -- the admin sees it with the other reports
  if (select count(*) from public.bulletin_reports where bulletin_id = p_id) >= private.bul_cfg('report_hide', 3) then
    update public.bulletins set hidden = true where id = p_id;
  end if;
end $$;

-- the author removes their own post (it is hidden, the row stays so the daily limit cannot be beaten)
create or replace function public.delete_bulletin(p_id bigint) returns void
language plpgsql security definer set search_path = '' as $$
declare u uuid := private.require_user();
begin
  update public.bulletins set hidden = true where id = p_id and user_id = u and not hidden;
  if not found then raise exception 'not_found'; end if;
end $$;

-- ------------------------------------------------------------------ who can see what (reads only; every write is a function above)
drop policy if exists bulletin_read on public.bulletins;
create policy bulletin_read on public.bulletins for select to authenticated
  using (not hidden and (expires_at is null or expires_at > now()) and not public.is_blocked_between(auth.uid(), user_id));
drop policy if exists bulletin_vote_read on public.bulletin_votes;
create policy bulletin_vote_read on public.bulletin_votes for select to authenticated using (user_id = auth.uid());   -- you only see your own votes
revoke all on public.bulletins, public.bulletin_votes, public.bulletin_reports from anon, authenticated;
grant select on public.bulletins, public.bulletin_votes to authenticated;
revoke execute on function public.get_bulletin_status(text), public.post_nepa(text, text, text), public.post_tutorial(text, text, text),
  public.vote_bulletin(bigint), public.report_bulletin(bigint, text), public.delete_bulletin(bigint) from public, anon;
grant execute on function public.get_bulletin_status(text), public.post_nepa(text, text, text), public.post_tutorial(text, text, text),
  public.vote_bulletin(bigint), public.report_bulletin(bigint, text), public.delete_bulletin(bigint) to authenticated;
-- No realtime on purpose (saves Supabase usage): the apps refresh when opened or when the player taps ↻.
