-- 05_feed.sql — "Feed" phone app: text-only posts on a coloured background, gone after 24 h, each post pays GAME money into the player's BANK.
-- Run in the Supabase SQL Editor AFTER 01_schema.sql (and again after re-running 01, because 01 revokes all grants). Safe to re-run.
-- The reward is in-game money: it goes to wallets.bank through private.ledger_move() (kind 'feed_reward'), exactly like the ATM daily claim.
-- The player sees it at an ATM inside a bank and withdraws it to pocket there. No real money is involved.
-- Rules (all decided HERE, never in the browser):
--   • 7 posts per player per Africa/Lagos calendar day, ≥ 30 s apart, 15–280 characters, ≥ 3 words, ≥ 5 different characters
--   • no links / phone numbers / banned words; the same text cannot be posted twice while it is live
--   • reward 500 coins per post, paid into the bank balance
-- Change a number without code: insert into public.app_config(key,value) values ('feed.reward','500') on conflict (key) do update set value = excluded.value;
--   keys: feed.reward (500) · feed.daily_limit (7) · feed.min_chars (15) · feed.max_chars (280) · feed.gap_seconds (30)
-- Background keys are fixed here AND in public/world/game/phone/apps/feed.js (BGS) — change both together.

create table if not exists public.feed_posts (
  id bigserial primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  username text not null,
  body text not null,
  bg text not null,
  body_hash text not null,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default now() + interval '24 hours'
);
create index if not exists feed_posts_user_idx on public.feed_posts (user_id, created_at desc);
create index if not exists feed_posts_hash_idx on public.feed_posts (body_hash);
alter table public.feed_posts enable row level security;

-- ------------------------------------------------------------------ helpers
create or replace function private.feed_cfg(p_key text, p_default bigint) returns bigint language sql stable as $$
  select coalesce((select (value #>> '{}')::bigint from public.app_config where key = 'feed.' || p_key), p_default) $$;

create or replace function private.feed_bgs() returns text[] language sql immutable as $$
  select array['sunset', 'ocean', 'forest', 'royal', 'rose', 'midnight', 'gold', 'mint', 'fire', 'lagos', 'dusk', 'slate'] $$;

-- returns the cleaned text, or null if it is not allowed
create or replace function private.feed_clean(p_body text) returns text language plpgsql stable as $$
declare t text := coalesce(p_body, ''); w text;
begin
  t := replace(t, E'\r', '');
  t := regexp_replace(t, '[ \t]+', ' ', 'g');
  t := regexp_replace(t, ' ?\n ?', E'\n', 'g');
  t := regexp_replace(t, '\n{3,}', E'\n\n', 'g');
  t := btrim(t, E' \n');
  if char_length(t) < private.feed_cfg('min_chars', 15) or char_length(t) > private.feed_cfg('max_chars', 280) then return null; end if;
  if array_length(regexp_split_to_array(t, '\s+'), 1) < 3 then return null; end if;
  if (select count(distinct c) from regexp_split_to_table(lower(t), '') as c) < 5 then return null; end if;   -- "aaaaaaaaaaaaaaaa" farming
  if t ~* '(https?://|www\.|\.(com|ng|net|org|me|ly|io|co)\y)' or t ~ '(\+?234|0)[789][01]\d[\s-]?\d{3}[\s-]?\d{4}' then return null; end if;
  for w in select word from public.banned_words loop
    if t ~* ('\m' || regexp_replace(w, '([^a-z0-9 ])', '\\\1', 'g') || '\M') then return null; end if;
  end loop;
  return t;
end $$;

create or replace function private.lagos_day_start() returns timestamptz language sql stable as $$
  select date_trunc('day', now() at time zone 'Africa/Lagos') at time zone 'Africa/Lagos' $$;

-- housekeeping: schedule with pg_cron every 30 min:  select cron.schedule('feed-cleanup', '*/30 * * * *', 'select private.feed_cleanup()');
create or replace function private.feed_cleanup() returns void language sql as $$
  delete from public.feed_posts where expires_at < now() - interval '1 hour' $$;

-- ------------------------------------------------------------------ RPCs
create or replace function public.get_feed_status() returns jsonb
language plpgsql security definer set search_path = '' as $$
declare u uuid := private.require_user(); lim int := private.feed_cfg('daily_limit', 7); used int; bnk bigint;
begin
  select count(*) into used from public.feed_posts where user_id = u and created_at >= private.lagos_day_start();
  select bank into bnk from public.wallets where id = u;
  return jsonb_build_object('daily_limit', lim, 'posts_left', greatest(lim - used, 0), 'reward', private.feed_cfg('reward', 500),
    'min_chars', private.feed_cfg('min_chars', 15), 'max_chars', private.feed_cfg('max_chars', 280), 'bank', coalesce(bnk, 0), 'backgrounds', to_jsonb(private.feed_bgs()));
end $$;

create or replace function public.post_to_feed(p_body text, p_bg text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare u uuid := private.require_user(); name text; done boolean; txt text; h text; lim int := private.feed_cfg('daily_limit', 7); used int; last_at timestamptz;
  gap int := private.feed_cfg('gap_seconds', 30); reward bigint := private.feed_cfg('reward', 500); nid bigint; bnk bigint;
begin
  if p_bg is null or p_bg <> all (private.feed_bgs()) then raise exception 'bad_background'; end if;
  select p.username, q.onboarded into name, done from public.profiles p join public.private_profiles q on q.id = p.id where p.id = u;
  if name is null or not coalesce(done, false) then raise exception 'finish_sign_up'; end if;
  perform 1 from public.wallets where id = u for update;          -- one post at a time per player, so parallel taps cannot beat the daily limit
  select count(*), max(created_at) into used, last_at from public.feed_posts where user_id = u and created_at >= private.lagos_day_start();
  if used >= lim then raise exception 'daily_limit'; end if;
  if gap > 0 and last_at is not null and last_at > now() - make_interval(secs => gap) then raise exception 'slow_down'; end if;
  txt := private.feed_clean(p_body);
  if txt is null then raise exception 'post_not_allowed'; end if;
  h := md5(lower(txt));
  if exists (select 1 from public.feed_posts where body_hash = h) then raise exception 'duplicate_post'; end if;
  insert into public.feed_posts (user_id, username, body, bg, body_hash) values (u, name, txt, p_bg, h) returning id into nid;
  if reward > 0 then perform private.ledger_move(u, 'feed_reward', 0, reward, 'post:' || nid); end if;   -- into the BANK, like atm_claim_daily
  select bank into bnk from public.wallets where id = u;
  return jsonb_build_object('id', nid, 'reward', reward, 'bank', bnk, 'posts_left', lim - used - 1);
end $$;

-- ------------------------------------------------------------------ who can see what (reads only; the write is the function above)
drop policy if exists feed_read on public.feed_posts;
create policy feed_read on public.feed_posts for select to authenticated using (expires_at > now() and not public.is_blocked_between(auth.uid(), user_id));
revoke all on public.feed_posts from anon, authenticated;
grant select on public.feed_posts to authenticated;
revoke execute on function public.get_feed_status(), public.post_to_feed(text, text) from public, anon;
grant execute on function public.get_feed_status(), public.post_to_feed(text, text) to authenticated;
-- No realtime on purpose: the feed refreshes when the player opens it or taps ↻ (saves Supabase usage).
