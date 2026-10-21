-- 20_forum.sql — the "Gamers" phone app: a forum for popular mobile games. Boards: dls (Dream League Soccer), efootball (eFootball), other. Run AFTER 18_bulletins.sql (it reuses its text cleaner) and 05. Safe to re-run.
-- Rules (decided HERE, never in the browser):
--   * signed-in players who finished sign-up only; teens and adults never see each other's topics; blocked players hidden both ways;
--   * topic: board + tag (talk / tips / squad / match = "looking for a match" / news) + title (5-80 characters, >= 2 words) + text (10-800 characters);
--     5 topics per player per Lagos day, 120 s apart;   reply: 2-500 characters, 12 per 5 minutes;
--   * no links, no phone numbers, no banned words (same cleaner as NEPA/Tutorial);
--   * Report: 3 different players hide a topic or reply automatically; "Remove" by the author hides it (the row stays, so the daily limit cannot be beaten).
-- Change numbers without code:  insert into public.app_config(key,value) values ('forum.topics_daily','10') on conflict (key) do update set value = excluded.value;
--   keys: forum.topics_daily (5) · topic_gap (120) · replies_5min (12) · report_hide (3)
create table if not exists public.forum_topics (
  id bigserial primary key,
  board text not null check (board in ('dls', 'efootball', 'other')),
  tag text not null check (tag in ('talk', 'tips', 'squad', 'match', 'news')),
  user_id uuid not null references auth.users(id) on delete cascade,
  username text not null, teen boolean not null default false,
  title text not null, body text not null,
  replies int not null default 0, hidden boolean not null default false,
  created_at timestamptz not null default now(), last_at timestamptz not null default now()
);
create index if not exists forum_topics_idx on public.forum_topics (board, teen, last_at desc);
create index if not exists forum_topics_user_idx on public.forum_topics (user_id, created_at desc);
create table if not exists public.forum_posts (
  id bigserial primary key,
  topic_id bigint not null references public.forum_topics(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  username text not null, teen boolean not null default false,
  body text not null, hidden boolean not null default false, created_at timestamptz not null default now()
);
create index if not exists forum_posts_idx on public.forum_posts (topic_id, id);
create index if not exists forum_posts_user_idx on public.forum_posts (user_id, created_at desc);
create table if not exists public.forum_reports (
  kind text not null check (kind in ('topic', 'post')), ref bigint not null, user_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(), primary key (kind, ref, user_id)
);
alter table public.forum_reports enable row level security;      -- no policy: only the functions touch it
alter table public.forum_topics enable row level security;
alter table public.forum_posts enable row level security;
drop policy if exists forum_topics_read on public.forum_topics;
create policy forum_topics_read on public.forum_topics for select to authenticated
  using (not hidden and teen is not distinct from (select q.is_teen from public.private_profiles q where q.id = auth.uid()) and not public.is_blocked_between(auth.uid(), user_id));
drop policy if exists forum_posts_read on public.forum_posts;
create policy forum_posts_read on public.forum_posts for select to authenticated
  using (not hidden and teen is not distinct from (select q.is_teen from public.private_profiles q where q.id = auth.uid()) and not public.is_blocked_between(auth.uid(), user_id));

create or replace function private.frm_cfg(p_key text, p_default bigint) returns bigint language sql stable as $$
  select coalesce((select (value #>> '{}')::bigint from public.app_config where key = 'forum.' || p_key), p_default) $$;

create or replace function private.frm_who(u uuid) returns record language plpgsql stable set search_path = '' as $$
declare name text; done boolean; teen boolean; r record;
begin
  select p.username, q.onboarded, q.is_teen into name, done, teen from public.profiles p join public.private_profiles q on q.id = p.id where p.id = u;
  if name is null or not coalesce(done, false) then raise exception 'finish_sign_up'; end if;
  select name as username, coalesce(teen, false) as teen into r; return r;
end $$;

create or replace function public.forum_new_topic(p_board text, p_tag text, p_title text, p_body text) returns bigint
language plpgsql security definer set search_path = '' as $$
declare u uuid := private.require_user(); w record; t text; b text; nid bigint; last_at timestamptz; n int;
begin
  if p_board not in ('dls', 'efootball', 'other') then raise exception 'bad_board'; end if;
  if p_tag not in ('talk', 'tips', 'squad', 'match', 'news') then raise exception 'bad_tag'; end if;
  select * into w from private.frm_who(u) as (username text, teen boolean);
  perform 1 from public.wallets where id = u for update;
  select count(*), max(created_at) into n, last_at from public.forum_topics where user_id = u and created_at >= private.lagos_day_start();
  if n >= private.frm_cfg('topics_daily', 5) then raise exception 'daily_limit'; end if;
  select max(created_at) into last_at from public.forum_topics where user_id = u;
  if last_at is not null and last_at > now() - make_interval(secs => private.frm_cfg('topic_gap', 120)) then raise exception 'slow_down'; end if;
  t := private.bul_clean(p_title, 5, 80, 2, false); b := private.bul_clean(p_body, 10, 800, 2, true);
  if t is null or b is null then raise exception 'message_not_allowed'; end if;
  insert into public.forum_topics (board, tag, user_id, username, teen, title, body) values (p_board, p_tag, u, w.username, w.teen, t, b) returning id into nid;
  return nid;
end $$;

create or replace function public.forum_reply(p_topic bigint, p_body text) returns bigint
language plpgsql security definer set search_path = '' as $$
declare u uuid := private.require_user(); w record; b text; nid bigint; tt public.forum_topics%rowtype; n int;
begin
  select * into w from private.frm_who(u) as (username text, teen boolean);
  select * into tt from public.forum_topics where id = p_topic and not hidden and teen = w.teen and not public.is_blocked_between(u, user_id);
  if not found then raise exception 'not_found'; end if;
  select count(*) into n from public.forum_posts where user_id = u and created_at > now() - interval '5 minutes';
  if n >= private.frm_cfg('replies_5min', 12) then raise exception 'slow_down'; end if;
  b := private.bul_clean(p_body, 2, 500, 1, false);
  if b is null then raise exception 'message_not_allowed'; end if;
  insert into public.forum_posts (topic_id, user_id, username, teen, body) values (p_topic, u, w.username, w.teen, b) returning id into nid;
  update public.forum_topics set replies = replies + 1, last_at = now() where id = p_topic;
  return nid;
end $$;

create or replace function public.forum_report(p_kind text, p_id bigint) returns void
language plpgsql security definer set search_path = '' as $$
declare u uuid := private.require_user(); n int; owner uuid;
begin
  if p_kind not in ('topic', 'post') then raise exception 'bad_kind'; end if;
  if p_kind = 'topic' then select user_id into owner from public.forum_topics where id = p_id; else select user_id into owner from public.forum_posts where id = p_id; end if;
  if owner is null then raise exception 'not_found'; end if;
  if owner = u then raise exception 'not_allowed'; end if;
  insert into public.forum_reports (kind, ref, user_id) values (p_kind, p_id, u) on conflict do nothing;
  select count(*) into n from public.forum_reports where kind = p_kind and ref = p_id;
  if n >= private.frm_cfg('report_hide', 3) then
    if p_kind = 'topic' then update public.forum_topics set hidden = true where id = p_id; else update public.forum_posts set hidden = true where id = p_id; end if;
  end if;
end $$;

create or replace function public.forum_delete(p_kind text, p_id bigint) returns void
language plpgsql security definer set search_path = '' as $$
declare u uuid := private.require_user();
begin
  if p_kind = 'topic' then update public.forum_topics set hidden = true where id = p_id and user_id = u;
  elsif p_kind = 'post' then update public.forum_posts set hidden = true where id = p_id and user_id = u;
  else raise exception 'bad_kind'; end if;
end $$;

create or replace function public.forum_limits() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare u uuid := private.require_user(); n int;
begin
  select count(*) into n from public.forum_topics where user_id = u and created_at >= private.lagos_day_start();
  return jsonb_build_object('topics_left', greatest(private.frm_cfg('topics_daily', 5) - n, 0));
end $$;

revoke all on public.forum_topics, public.forum_posts, public.forum_reports from public, anon;
grant select on public.forum_topics, public.forum_posts to authenticated;
revoke execute on function public.forum_new_topic(text, text, text, text), public.forum_reply(bigint, text), public.forum_report(text, bigint), public.forum_delete(text, bigint), public.forum_limits() from public, anon;
grant execute on function public.forum_new_topic(text, text, text, text), public.forum_reply(bigint, text), public.forum_report(text, bigint), public.forum_delete(text, bigint), public.forum_limits() to authenticated;
do $$ begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    begin alter publication supabase_realtime add table public.forum_posts; exception when duplicate_object then null; end;
  end if;
end $$;
