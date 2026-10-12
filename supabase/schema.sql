/* ==========================================================================
   FUTA World — Supabase (Postgres) schema. Replaces legacy/php/sql/schema.sql.
   How to apply: Supabase dashboard → SQL Editor → paste this whole file → Run.
   Safe to re-run: every statement below is idempotent.
   Row Level Security is ON with no read/write policies, so tables are
   invisible to the anon key; only the server (service-role key) touches them.
   ========================================================================== */

-- world_users — same columns as the old MySQL table (email nullable for google-only accounts).
create table if not exists world_users (
  id            bigint generated always as identity primary key,
  email         text unique,
  password_hash text,
  google_sub    text unique,
  username      text unique check (username is null or username ~ '^[a-z0-9_]{3,20}$'),
  dob           text,
  is_teen       smallint not null default 0,
  avatar_json   text,
  life_start    text,
  created_at    timestamptz not null default now()
);

-- world_sessions — server-side sessions; the HttpOnly cookie only holds a random id.
create table if not exists world_sessions (
  sid        text primary key,
  user_id    bigint not null references world_users (id) on delete cascade,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null
);
create index if not exists world_sessions_expires on world_sessions (expires_at);

-- rate_limits — replaces the per-PHP-session counters (serverless has no shared session memory).
create table if not exists rate_limits (
  key text not null,
  ts  timestamptz not null default now()
);
create index if not exists rate_limits_key_ts on rate_limits (key, ts);

-- Lock every app table: no policies = nobody reaches them through PostgREST.
alter table world_users    enable row level security;
alter table world_sessions enable row level security;
alter table rate_limits    enable row level security;

-- rate_limit_hit — atomic check-and-insert used only by the server (service role).
create or replace function rate_limit_hit (p_key text, p_max int, p_secs int)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
begin
  delete from rate_limits where ts < now() - make_interval(secs => p_secs);
  if (select count(*) from rate_limits
        where key = p_key and ts > now() - make_interval(secs => p_secs)) >= p_max then
    return false;
  end if;
  insert into rate_limits (key, ts) values (p_key, now());
  return true;
end;
$$;
revoke execute on function rate_limit_hit (text, int, int) from public, anon, authenticated;
grant  execute on function rate_limit_hit (text, int, int) to service_role;

-- Private realtime broadcast (zone:<x>:<z> movement channels).
-- realtime.messages already exists with RLS on; policies below let only
-- connections carrying OUR server-signed JWT (role "authenticated") read/write.
-- The anon key (role "anon") stays blocked.
drop policy if exists "zone broadcast read" on realtime.messages;
create policy "zone broadcast read" on realtime.messages
  for select to authenticated using (true);
drop policy if exists "zone broadcast write" on realtime.messages;
create policy "zone broadcast write" on realtime.messages
  for insert to authenticated with check (true);

-- Make sure the table is in the realtime publication (errors if already there).
do $$
begin
  alter publication supabase_realtime add table realtime.messages;
exception
  when duplicate_object then null;
  when undefined_object then null;
end $$;
