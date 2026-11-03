-- FUTA World: all database files in order. Paste the WHOLE file into Supabase > SQL Editor > Run. Safe to re-run.

-- ===================== 01_schema.sql =====================
-- ============================================================================
-- FUTA World — Supabase schema (Postgres). Paste into Supabase > SQL Editor and Run.
-- Then run 02_avatar_options.sql (generated from avatar-options.json by tools/build-options.py).
--
-- RULES THIS FILE ENFORCES (do not weaken them without reading docs/SUPABASE.md):
--  * Browsers get ONLY the anon key. Every write goes through a security-definer function (RPC) below.
--    Tables have RLS on and NO insert/update/delete policies for clients.
--  * Money is integer coins. wallets change only through private.ledger_move(); ledger is append-only.
--  * Avatar looks are re-validated in SQL (validate_avatar) — NPC-only uniforms can never be saved by players.
--  * Date of birth is set once. Under 13 is blocked. Under 18 = Teen Mode (no DMs with adults).
-- ============================================================================

create schema if not exists private;
revoke all on schema private from public;

-- ------------------------------------------------------------------ config
create table if not exists public.app_config (key text primary key, value jsonb not null);
alter table public.app_config enable row level security;          -- no policies: only security-definer code reads it

create table if not exists public.life_starts (
  id text primary key, bank bigint not null, pocket bigint not null default 500
);
alter table public.life_starts enable row level security;
insert into public.life_starts (id, bank, pocket) values
  ('fresh', 15000, 500), ('hustler', 6000, 500), ('creative', 9000, 500)
on conflict (id) do update set bank = excluded.bank, pocket = excluded.pocket;   -- keep in sync with onboarding/life-start.json

create table if not exists public.banned_words (word text primary key);          -- fill this list yourself (lower-case)
alter table public.banned_words enable row level security;

-- ------------------------------------------------------------------ people
create table if not exists public.profiles (            -- PUBLIC to signed-in players (name label + outfit)
  id uuid primary key references auth.users(id) on delete cascade,
  username text,
  avatar_json jsonb,
  avatar_hash text,
  campus jsonb,                                         -- {status, school, dept, level|year|area|exam} from the onboarding "Where do you belong?" screen (see 11_campus.sql)
  created_at timestamptz not null default now(),
  constraint username_fmt check (username is null or username ~ '^[a-z0-9_]{3,20}$')
);
create unique index if not exists profiles_username_uq on public.profiles (username);

create table if not exists public.private_profiles (    -- only the owner can read
  id uuid primary key references auth.users(id) on delete cascade,
  dob date,
  is_teen boolean not null default false,
  life_start text references public.life_starts(id),
  onboarded boolean not null default false,
  accept_waves boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists public.wallets (
  id uuid primary key references auth.users(id) on delete cascade,
  pocket bigint not null default 0 check (pocket >= 0),   -- cash on you
  bank bigint not null default 0 check (bank >= 0),       -- in your account (ATM)
  last_daily date
);
create table if not exists public.ledger (               -- append-only history of every coin movement
  id bigserial primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  kind text not null, d_pocket bigint not null default 0, d_bank bigint not null default 0,
  ref text, created_at timestamptz not null default now()
);
create index if not exists ledger_user_idx on public.ledger (user_id, id desc);

create table if not exists public.player_stats (         -- life stats + where the player is standing (set by enter_building)
  id uuid primary key references auth.users(id) on delete cascade,
  energy numeric not null default 100 check (energy between 0 and 100),
  hunger numeric not null default 80 check (hunger between 0 and 100),
  mood numeric not null default 60 check (mood between 0 and 100),
  knowledge int not null default 0 check (knowledge >= 0),
  venue text, building text,
  updated_at timestamptz not null default now()
);
create table if not exists public.jail (                 -- one row per player who has been (or is) locked up. Written only by server functions (vault arrest).
  user_id uuid primary key references auth.users(id) on delete cascade,
  until timestamptz not null, reason text not null default ''
);
create table if not exists public.activity_cooldowns (
  user_id uuid not null references auth.users(id) on delete cascade, activity text not null,
  last_at timestamptz not null default now(), primary key (user_id, activity)
);

-- ------------------------------------------------------------------ social
create table if not exists public.blocks (
  blocker uuid not null references auth.users(id) on delete cascade,
  blocked uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(), primary key (blocker, blocked)
);
create table if not exists public.waves (
  id bigserial primary key,
  from_user uuid not null references auth.users(id) on delete cascade,
  to_user uuid not null references auth.users(id) on delete cascade,
  status text not null default 'pending' check (status in ('pending','accepted','declined')),
  created_at timestamptz not null default now(), unique (from_user, to_user)
);
create table if not exists public.room_messages (
  id bigserial primary key, room text not null,
  user_id uuid not null references auth.users(id) on delete cascade,
  username text not null, body text not null, created_at timestamptz not null default now()
);
create index if not exists room_messages_room_idx on public.room_messages (room, id desc);
create index if not exists room_messages_user_idx on public.room_messages (user_id, created_at desc);
create table if not exists public.dms (
  id bigserial primary key,
  sender uuid not null references auth.users(id) on delete cascade,
  recipient uuid not null references auth.users(id) on delete cascade,
  body text not null, created_at timestamptz not null default now()
);
create index if not exists dms_pair_idx on public.dms (sender, recipient, id desc);
create index if not exists dms_rcpt_idx on public.dms (recipient, id desc);
create table if not exists public.reports (
  id bigserial primary key,
  reporter uuid not null references auth.users(id) on delete cascade,
  target uuid not null references auth.users(id) on delete cascade,
  reason text not null check (reason in ('harassment','spam','impersonation','inappropriate','underage','other')),
  context text, status text not null default 'open', created_at timestamptz not null default now()
);
create table if not exists public.seat_claims (           -- who is sitting where (interiors / benches)
  room text not null, seat_id text not null,
  user_id uuid not null unique references auth.users(id) on delete cascade,
  expires_at timestamptz not null, primary key (room, seat_id)
);

-- ------------------------------------------------------------------ helper functions
create or replace function private.require_user() returns uuid language plpgsql stable as $$
declare u uuid := auth.uid();
begin if u is null then raise exception 'auth_required'; end if; return u; end $$;

-- jail: whole seconds left on a sentence (0 = free). While jailed a player cannot enter buildings, use the ATM or do activities.
create or replace function private.jail_secs(p_user uuid) returns int
language sql stable security definer set search_path = '' as $$
  select coalesce((select ceil(extract(epoch from (until - now())))::int from public.jail where user_id = p_user and until > now()), 0) $$;

create or replace function private.require_free(p_user uuid) returns void
language plpgsql stable security definer set search_path = '' as $$
begin if private.jail_secs(p_user) > 0 then raise exception 'in_jail'; end if; end $$;

create or replace function private.num(v jsonb, lo numeric, hi numeric, d numeric) returns numeric
language sql immutable as $$
  select case when jsonb_typeof(v) = 'number' then greatest(lo, least(hi, round((v #>> '{}')::numeric, 3))) else d end $$;

create or replace function private.int(v jsonb, lo int, hi int, d int) returns int
language sql immutable as $$
  select case when jsonb_typeof(v) = 'number' then greatest(lo, least(hi, round((v #>> '{}')::numeric)::int)) else d end $$;

create or replace function private.obj(v jsonb) returns jsonb language sql immutable as $$
  select case when jsonb_typeof(v) = 'object' then v else '{}'::jsonb end $$;

-- wear item validation (twin of AvatarValidator::item)
create or replace function private.wear_item(o jsonb, slot text, raw jsonb, allow_restricted boolean) returns jsonb
language plpgsql stable as $$
declare def jsonb; n int; it jsonb;
begin
  if jsonb_typeof(raw) <> 'object' or not (raw ? 'id') then return null; end if;
  select d into def from jsonb_array_elements(o #> array['wear', slot]) d where d ->> 'id' = raw ->> 'id' limit 1;
  if def is null then return null; end if;
  if def -> 'restricted' = 'true'::jsonb and not allow_restricted then return null; end if;
  n := jsonb_array_length(o #> '{palettes,cloth}');
  it := jsonb_build_object('id', def ->> 'id', 'c', private.int(raw -> 'c', 0, n - 1, 0));
  if jsonb_typeof(raw -> 'c2') = 'number' then it := it || jsonb_build_object('c2', private.int(raw -> 'c2', 0, n - 1, 0)); end if;
  if def -> 'pat' = 'true'::jsonb and exists (select 1 from jsonb_array_elements_text(o -> 'patterns') p where p = raw ->> 'p') then
    it := it || jsonb_build_object('p', raw ->> 'p');
  end if;
  return it;
end $$;

-- server twin of FutaAvatar.look.normalize / AvatarValidator::clean. Never throws on bad fields: clamps or drops them.
create or replace function public.validate_avatar(p_in jsonb, p_allow_restricted boolean default false) returns jsonb
language plpgsql stable as $$
declare
  o jsonb; pal jsonb; i jsonb; b jsonb; f jsonb; h jsonb; w jsonb; mk jsonb;
  frame text; style text; beard text; out jsonb; mko jsonb := '{}'::jsonb; wear jsonb := '{}'::jsonb;
  slot text; it jsonb; defs jsonb;
begin
  select value into o from public.app_config where key = 'avatar_options';
  if o is null then raise exception 'avatar_options_missing (run 02_avatar_options.sql)'; end if;
  pal := o -> 'palettes'; i := private.obj(p_in);
  b := private.obj(i -> 'body'); f := private.obj(i -> 'face'); h := private.obj(i -> 'hair'); w := private.obj(i -> 'wear');
  frame := case when b ->> 'frame' = 'f' then 'f' else 'm' end;

  out := jsonb_build_object('v', 1,
    'body', jsonb_build_object('frame', frame,
      'height', private.num(b -> 'height', 0.92, 1.08, 1.0), 'build', private.num(b -> 'build', 0, 1, 0.5),
      'bust', private.num(b -> 'bust', 0, 1, 0.5), 'hips', private.num(b -> 'hips', 0, 1, 0.5),
      'shoulders', private.num(b -> 'shoulders', 0, 1, 0.5)),
    'skin', private.int(i -> 'skin', 0, jsonb_array_length(pal -> 'skin') - 1, 5),
    'face', jsonb_build_object(
      'shape', private.int(f -> 'shape', 0, (o #>> '{face,shape,count}')::int - 1, 0),
      'eyes', private.int(f -> 'eyes', 0, (o #>> '{face,eyes,count}')::int - 1, 0),
      'eyeColor', private.int(f -> 'eyeColor', 0, (o #>> '{face,eyeColor,count}')::int - 1, 0),
      'brows', private.int(f -> 'brows', 0, (o #>> '{face,brows,count}')::int - 1, 0),
      'nose', private.int(f -> 'nose', 0, (o #>> '{face,nose,count}')::int - 1, 0),
      'lips', private.int(f -> 'lips', 0, (o #>> '{face,lips,count}')::int - 1, 0)));

  style := h ->> 'style';
  if not exists (select 1 from jsonb_array_elements(o #> '{hair,styles}') s where s ->> 'id' = style) or style is null then
    style := case when frame = 'f' then 'cornrows' else 'fade' end;
  end if;
  out := out || jsonb_build_object('hair', jsonb_build_object('style', style,
    'color', private.int(h -> 'color', 0, jsonb_array_length(pal -> 'hair') - 1, 0), 'seed', private.int(h -> 'seed', 0, 99999, 7)));

  beard := i ->> 'beard';
  if frame <> 'm' or beard is null or not exists (select 1 from jsonb_array_elements(o #> '{beard,styles}') s where s ->> 'id' = beard) then beard := 'none'; end if;
  out := out || jsonb_build_object('beard', beard);

  mk := private.obj(i -> 'makeup');
  if jsonb_typeof(mk -> 'lips') = 'number' then mko := mko || jsonb_build_object('lips', private.int(mk -> 'lips', 0, jsonb_array_length(pal -> 'lip') - 1, 0)); end if;
  if jsonb_typeof(mk -> 'shadow') = 'number' then mko := mko || jsonb_build_object('shadow', private.int(mk -> 'shadow', 0, jsonb_array_length(pal -> 'shadow') - 1, 0)); end if;
  if jsonb_typeof(mk -> 'blush') = 'number' then mko := mko || jsonb_build_object('blush', private.int(mk -> 'blush', 0, jsonb_array_length(pal -> 'blush') - 1, 0)); end if;
  if mk -> 'liner' = 'true'::jsonb then mko := mko || '{"liner":true}'::jsonb; end if;
  if mk -> 'lashes' = 'true'::jsonb then mko := mko || '{"lashes":true}'::jsonb; end if;
  out := out || jsonb_build_object('makeup', mko);
  if jsonb_typeof(i -> 'nails') = 'number' then out := out || jsonb_build_object('nails', private.int(i -> 'nails', 0, jsonb_array_length(pal -> 'nail') - 1, 0)); end if;

  defs := o -> 'defaults' -> frame;
  for slot in select jsonb_object_keys(o -> 'wear') loop
    it := private.wear_item(o, slot, w -> slot, p_allow_restricted);
    if it is null and defs ? slot then it := defs -> slot; end if;
    if it is not null and it ->> 'id' <> 'none' then wear := wear || jsonb_build_object(slot, it); end if;
  end loop;
  if wear ? 'dress' then wear := wear - 'top' - 'bottom'; end if;       -- a dress replaces top + bottom
  return out || jsonb_build_object('wear', wear);
end $$;

-- the ONLY way coins move
create or replace function private.ledger_move(p_user uuid, p_kind text, p_d_pocket bigint, p_d_bank bigint, p_ref text default null) returns void
language plpgsql as $$
begin
  update public.wallets set pocket = pocket + p_d_pocket, bank = bank + p_d_bank where id = p_user;   -- CHECK(>=0) rejects overdraft
  if not found then raise exception 'no_wallet'; end if;
  insert into public.ledger (user_id, kind, d_pocket, d_bank, ref) values (p_user, p_kind, p_d_pocket, p_d_bank, p_ref);
end $$;

-- block / age-group checks. security definer so they can see rows RLS hides; they only answer about the caller.
create or replace function public.is_blocked_between(a uuid, b uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select (auth.uid() in (a, b)) and exists (
    select 1 from public.blocks x where (x.blocker = a and x.blocked = b) or (x.blocker = b and x.blocked = a)) $$;

create or replace function private.same_age_group(a uuid, b uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select (select is_teen from public.private_profiles where id = a) is not distinct from (select is_teen from public.private_profiles where id = b) $$;

create or replace function private.dm_allowed(a uuid, b uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select not exists (select 1 from public.blocks x where (x.blocker = a and x.blocked = b) or (x.blocker = b and x.blocked = a))
     and private.same_age_group(a, b)
     and exists (select 1 from public.waves w where w.status = 'accepted' and ((w.from_user = a and w.to_user = b) or (w.from_user = b and w.to_user = a))) $$;

-- chat filter: teens cannot post links or phone numbers; everyone gets banned words starred out. Returns null if rejected.
create or replace function private.chat_clean(p_body text, p_teen boolean) returns text
language plpgsql stable as $$
declare t text := btrim(regexp_replace(coalesce(p_body, ''), '\s+', ' ', 'g')); w text;
begin
  if length(t) < 1 or length(t) > 240 then return null; end if;
  if p_teen and (t ~* '(https?://|www\.|\.(com|ng|net|org|me|ly)\b)' or t ~ '(\+?234|0)[789][01]\d[\s-]?\d{3}[\s-]?\d{4}') then return null; end if;
  for w in select word from public.banned_words loop
    t := regexp_replace(t, '\m' || regexp_replace(w, '([^a-z0-9 ])', '\\\1', 'g') || '\M', repeat('*', length(w)), 'gi');
  end loop;
  return t;
end $$;

-- ------------------------------------------------------------------ new-user trigger
create or replace function private.handle_new_user() returns trigger language plpgsql security definer set search_path = '' as $$
begin
  insert into public.profiles (id) values (new.id) on conflict do nothing;
  insert into public.private_profiles (id) values (new.id) on conflict do nothing;
  insert into public.wallets (id) values (new.id) on conflict do nothing;
  insert into public.player_stats (id) values (new.id) on conflict do nothing;
  return new;
end $$;
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users for each row execute function private.handle_new_user();

-- ------------------------------------------------------------------ RPCs (browser-callable)
create or replace function public.username_available(p_name text) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare n text := lower(btrim(coalesce(p_name, '')));
begin
  if n !~ '^[a-z0-9_]{3,20}$' then return jsonb_build_object('available', false, 'reason', 'Use 3–20 letters, numbers or _ only.'); end if;
  if n = any (array['admin','futa','support','moderator','mod','staff','security','official','system','null','undefined']) or n like 'futa\_%' then
    return jsonb_build_object('available', false, 'reason', 'That name is reserved.'); end if;
  if exists (select 1 from public.profiles where username = n and id is distinct from auth.uid()) then
    return jsonb_build_object('available', false, 'reason', 'That name is taken.'); end if;
  return jsonb_build_object('available', true, 'reason', '');
end $$;

create or replace function public.get_me() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare u uuid := auth.uid(); r jsonb;
begin
  if u is null then return null; end if;
  select jsonb_build_object('id', p.id, 'email', (select email from auth.users where id = u), 'username', p.username,
      'dob', q.dob, 'isTeen', q.is_teen, 'avatar', p.avatar_json, 'campus', p.campus, 'life', q.life_start, 'onboarded', q.onboarded,
      'acceptWaves', q.accept_waves, 'wallet', jsonb_build_object('pocket', w.pocket, 'bank', w.bank))
    into r from public.profiles p join public.private_profiles q on q.id = p.id join public.wallets w on w.id = p.id where p.id = u;
  return r;
end $$;

create or replace function public.set_profile(p_username text, p_dob date) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare u uuid := private.require_user(); n text := lower(btrim(coalesce(p_username, ''))); chk jsonb; q public.private_profiles; age int;
begin
  chk := public.username_available(n);
  if (chk ->> 'available')::boolean is not true then raise exception '%', chk ->> 'reason'; end if;
  select * into q from public.private_profiles where id = u for update;
  if q.dob is null then                                   -- date of birth can be set ONCE (stops age-gaming)
    if p_dob is null or p_dob > current_date or p_dob < date '1900-01-01' then raise exception 'Enter a valid date of birth.'; end if;
    age := extract(year from age(current_date, p_dob))::int;
    if age < 13 then raise exception 'under_age'; end if;
    update public.private_profiles set dob = p_dob, is_teen = (age < 18) where id = u;
  end if;
  begin
    update public.profiles set username = n where id = u;
  exception when unique_violation then raise exception 'That name is taken.'; end;
  return public.get_me();
end $$;

create or replace function public.save_avatar(p_look jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare u uuid := private.require_user(); clean jsonb; old jsonb; done boolean;
begin
  if pg_column_size(p_look) > 8000 then raise exception 'look_too_large'; end if;
  clean := public.validate_avatar(p_look, false);        -- players can never wear NPC-only uniforms
  select p.avatar_json, coalesce(q.onboarded, false) into old, done from public.profiles p left join public.private_profiles q on q.id = p.id where p.id = u;
  -- Hair and beard are free while creating the character, but afterwards they are only changed (and paid for) in a salon: see save_hair() in 09_salon.sql.
  if done and old is not null and (clean -> 'hair' is distinct from old -> 'hair' or clean -> 'beard' is distinct from old -> 'beard') then raise exception 'hair_requires_salon'; end if;
  update public.profiles set avatar_json = clean, avatar_hash = md5(clean::text) where id = u;
  return clean;
end $$;

create or replace function public.save_life(p_start text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare u uuid := private.require_user(); ls public.life_starts; q public.private_profiles; p public.profiles;
begin
  select * into ls from public.life_starts where id = p_start;
  if not found then raise exception 'bad_start'; end if;
  select * into q from public.private_profiles where id = u for update;
  select * into p from public.profiles where id = u;
  if q.life_start is null then                            -- starter money is granted exactly once
    update public.private_profiles set life_start = ls.id where id = u;
    perform private.ledger_move(u, 'start_grant', ls.pocket, ls.bank, ls.id);
  end if;
  if p.username is not null and p.avatar_json is not null then update public.private_profiles set onboarded = true where id = u; end if;
  return public.get_me();
end $$;

create or replace function public.set_privacy(p_accept_waves boolean) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare u uuid := private.require_user();
begin update public.private_profiles set accept_waves = coalesce(p_accept_waves, true) where id = u; return public.get_me(); end $$;

-- ------ places: where the player is standing. Venue ids are the interior template ids (see activities catalog).
-- NOTE: the client reports the building it entered; this stops "use the ATM from the map" and wrong-venue actions, but a modified
-- client could lie about its venue. Real-money features must never rely on it.
create or replace function private.decayed_stats(p_user uuid) returns public.player_stats
language plpgsql security definer set search_path = '' as $$
declare s public.player_stats; mins numeric;
begin
  select * into s from public.player_stats where id = p_user for update;
  if not found then insert into public.player_stats (id) values (p_user) returning * into s; end if;
  mins := least(extract(epoch from (now() - s.updated_at)) / 60.0, 600);       -- at most 10 h of drift
  update public.player_stats set hunger = least(hunger, greatest(5, hunger - 0.16 * mins)), energy = least(energy, greatest(5, energy - 0.10 * mins)), updated_at = now()
    where id = p_user returning * into s;
  return s;
end $$;

create or replace function private.require_venue(p_venue text) returns void
language plpgsql security definer set search_path = '' as $$
declare v text;
begin
  perform private.require_free(auth.uid());                 -- no ATM (or any venue service) from a cell
  select venue into v from public.player_stats where id = auth.uid(); if v is distinct from p_venue then raise exception 'wrong_place'; end if;
end $$;

create or replace function public.enter_building(p_building text, p_venue text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare u uuid := private.require_user();
begin
  if p_building !~ '^[A-Za-z0-9_:.-]{1,60}$' or p_venue !~ '^[a-z0-9_]{2,30}$' then raise exception 'bad_place'; end if;
  perform private.require_free(u);                          -- jailed players cannot walk into buildings
  perform private.decayed_stats(u);
  update public.player_stats set venue = p_venue, building = p_building where id = u;
  return public.get_stats();
end $$;

create or replace function public.leave_building() returns void
language plpgsql security definer set search_path = '' as $$
begin update public.player_stats set venue = null, building = null where id = private.require_user(); end $$;

create or replace function public.get_stats() returns jsonb
language plpgsql security definer set search_path = '' as $$
declare u uuid := private.require_user(); s public.player_stats;
begin
  s := private.decayed_stats(u);
  return jsonb_build_object('energy', round(s.energy), 'hunger', round(s.hunger), 'mood', round(s.mood), 'knowledge', s.knowledge, 'venue', s.venue, 'building', s.building,
    'jailSecs', private.jail_secs(u),
    'wallet', (select jsonb_build_object('pocket', pocket, 'bank', bank, 'canClaimDaily', last_daily is distinct from (now() at time zone 'Africa/Lagos')::date) from public.wallets where id = u));
end $$;

-- ------ ATM (game money only)
create or replace function public.get_wallet() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare u uuid := private.require_user();
begin return (select jsonb_build_object('pocket', pocket, 'bank', bank, 'canClaimDaily', last_daily is distinct from (now() at time zone 'Africa/Lagos')::date)
  from public.wallets where id = u); end $$;

create or replace function public.atm_withdraw(p_amount bigint) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare u uuid := private.require_user(); b bigint;
begin
  perform private.require_venue('bank');                    -- ATMs exist only inside banks
  if p_amount is null or p_amount < 1 or p_amount > 1000000 then raise exception 'bad_amount'; end if;
  select bank into b from public.wallets where id = u for update;
  if b < p_amount then raise exception 'insufficient_funds'; end if;
  perform private.ledger_move(u, 'atm_withdraw', p_amount, -p_amount);
  return public.get_wallet();
end $$;

create or replace function public.atm_deposit(p_amount bigint) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare u uuid := private.require_user(); b bigint;
begin
  perform private.require_venue('bank');                    -- ATMs exist only inside banks
  if p_amount is null or p_amount < 1 or p_amount > 1000000000 then raise exception 'bad_amount'; end if;   -- a pocket can hold several vault payouts (₦500k–1m each)
  select pocket into b from public.wallets where id = u for update;
  if b < p_amount then raise exception 'insufficient_funds'; end if;
  perform private.ledger_move(u, 'atm_deposit', -p_amount, p_amount);
  return public.get_wallet();
end $$;

create or replace function public.atm_claim_daily() returns jsonb
language plpgsql security definer set search_path = '' as $$
declare u uuid := private.require_user(); today date := (now() at time zone 'Africa/Lagos')::date; n int;
begin
  perform private.require_venue('bank');                    -- ATMs exist only inside banks
  update public.wallets set last_daily = today where id = u and last_daily is distinct from today;
  get diagnostics n = row_count;
  if n = 0 then raise exception 'already_claimed'; end if;
  perform private.ledger_move(u, 'daily_claim', 0, 1000);   -- amount lives here, server-side
  return public.get_wallet();
end $$;

-- ------ jail (read-only for the browser: it only learns how long is left)
create or replace function public.get_jail() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare u uuid := private.require_user(); n int := private.jail_secs(u);
begin return jsonb_build_object('inJail', n > 0, 'secsLeft', n, 'reason', coalesce((select reason from public.jail where user_id = u and until > now()), '')); end $$;

-- ------ seats
create or replace function public.claim_seat(p_room text, p_seat text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare u uuid := private.require_user(); owner uuid;
begin
  if p_room !~ '^[a-z0-9_:.-]{1,60}$' or p_seat !~ '^[a-z0-9_:.-]{1,40}$' then raise exception 'bad_seat'; end if;
  delete from public.seat_claims where expires_at < now();
  delete from public.seat_claims where user_id = u and not (room = p_room and seat_id = p_seat);   -- one seat per player
  insert into public.seat_claims (room, seat_id, user_id, expires_at) values (p_room, p_seat, u, now() + interval '5 minutes')
    on conflict (room, seat_id) do update set expires_at = excluded.expires_at where public.seat_claims.user_id = u;
  select user_id into owner from public.seat_claims where room = p_room and seat_id = p_seat;
  return jsonb_build_object('ok', owner = u, 'seat', p_seat);
end $$;

create or replace function public.release_seat() returns void
language plpgsql security definer set search_path = '' as $$
begin delete from public.seat_claims where user_id = private.require_user(); end $$;

create or replace function public.list_seats(p_room text) returns table (seat_id text, user_id uuid)
language sql stable security definer set search_path = '' as $$
  select seat_id, user_id from public.seat_claims where room = p_room and expires_at >= now() $$;

-- ------ chat
create or replace function public.send_room_message(p_room text, p_body text) returns bigint
language plpgsql security definer set search_path = '' as $$
declare u uuid := private.require_user(); name text; teen boolean; txt text; recent int; nid bigint;
begin
  if p_room !~ '^[a-z0-9_:.-]{1,60}$' then raise exception 'bad_room'; end if;
  select p.username, q.is_teen into name, teen from public.profiles p join public.private_profiles q on q.id = p.id where p.id = u;
  if name is null then raise exception 'finish_sign_up'; end if;
  select count(*) into recent from public.room_messages where user_id = u and created_at > now() - interval '10 seconds';
  if recent >= 5 then raise exception 'slow_down'; end if;
  txt := private.chat_clean(p_body, teen);
  if txt is null then raise exception 'message_not_allowed'; end if;
  insert into public.room_messages (room, user_id, username, body) values (p_room, u, name, txt) returning id into nid;
  return nid;
end $$;

-- ------ waves + DMs (wave-first, no stranger DMs)
create or replace function public.send_wave(p_to uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare u uuid := private.require_user(); acc boolean; rev public.waves; today int;
begin
  if p_to = u then raise exception 'not_allowed'; end if;
  select accept_waves into acc from public.private_profiles where id = p_to;
  if acc is null or acc = false or public.is_blocked_between(u, p_to) or not private.same_age_group(u, p_to) then raise exception 'not_allowed'; end if;
  select count(*) into today from public.waves where from_user = u and created_at > now() - interval '1 day';
  if today >= 30 then raise exception 'slow_down'; end if;
  select * into rev from public.waves where from_user = p_to and to_user = u;
  if found and rev.status = 'pending' then                -- they waved first: it is mutual
    update public.waves set status = 'accepted' where id = rev.id;
    return jsonb_build_object('status', 'accepted');
  end if;
  insert into public.waves (from_user, to_user) values (u, p_to)
    on conflict (from_user, to_user) do update set status = 'pending', created_at = now() where public.waves.status = 'declined' and public.waves.created_at < now() - interval '1 day';
  return jsonb_build_object('status', coalesce((select status from public.waves where from_user = u and to_user = p_to), 'pending'));
end $$;

create or replace function public.respond_wave(p_id bigint, p_accept boolean) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare u uuid := private.require_user(); n int;
begin
  update public.waves set status = case when p_accept then 'accepted' else 'declined' end where id = p_id and to_user = u and status = 'pending';
  get diagnostics n = row_count;
  if n = 0 then raise exception 'not_found'; end if;
  return jsonb_build_object('status', case when p_accept then 'accepted' else 'declined' end);
end $$;

create or replace function public.send_dm(p_to uuid, p_body text) returns bigint
language plpgsql security definer set search_path = '' as $$
declare u uuid := private.require_user(); teen boolean; txt text; recent int; nid bigint;
begin
  if not private.dm_allowed(u, p_to) then raise exception 'wave_first'; end if;
  select is_teen into teen from public.private_profiles where id = u;
  select count(*) into recent from public.dms where sender = u and created_at > now() - interval '10 seconds';
  if recent >= 5 then raise exception 'slow_down'; end if;
  txt := private.chat_clean(p_body, teen);
  if txt is null then raise exception 'message_not_allowed'; end if;
  insert into public.dms (sender, recipient, body) values (u, p_to, txt) returning id into nid;
  return nid;
end $$;

create or replace function public.block_user(p_target uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare u uuid := private.require_user();
begin
  if p_target = u then raise exception 'not_allowed'; end if;
  insert into public.blocks (blocker, blocked) values (u, p_target) on conflict do nothing;
  delete from public.waves where (from_user = u and to_user = p_target) or (from_user = p_target and to_user = u);
end $$;

create or replace function public.unblock_user(p_target uuid) returns void
language plpgsql security definer set search_path = '' as $$
begin delete from public.blocks where blocker = private.require_user() and blocked = p_target; end $$;

create or replace function public.report_user(p_target uuid, p_reason text, p_context text default null) returns void
language plpgsql security definer set search_path = '' as $$
declare u uuid := private.require_user(); n int;
begin
  select count(*) into n from public.reports where reporter = u and created_at > now() - interval '1 day';
  if n >= 20 then raise exception 'slow_down'; end if;
  insert into public.reports (reporter, target, reason, context) values (u, p_target, p_reason, left(p_context, 500));
end $$;

-- housekeeping: schedule with pg_cron (see docs/SUPABASE.md) so tables stay small on the free plan
create or replace function private.cleanup() returns void language sql as $$
  delete from public.room_messages where created_at < now() - interval '2 days';
  delete from public.seat_claims where expires_at < now();
$$;

-- ------------------------------------------------------------------ row level security
alter table public.profiles enable row level security;
alter table public.private_profiles enable row level security;
alter table public.wallets enable row level security;
alter table public.ledger enable row level security;
alter table public.blocks enable row level security;
alter table public.waves enable row level security;
alter table public.room_messages enable row level security;
alter table public.dms enable row level security;
alter table public.reports enable row level security;
alter table public.seat_claims enable row level security;
alter table public.player_stats enable row level security;
alter table public.activity_cooldowns enable row level security;
alter table public.jail enable row level security;                  -- no policy and no grant: only the server functions touch it

drop policy if exists profiles_read on public.profiles;
create policy profiles_read on public.profiles for select to authenticated using (true);
drop policy if exists private_read on public.private_profiles;
create policy private_read on public.private_profiles for select to authenticated using (id = auth.uid());
drop policy if exists wallet_read on public.wallets;
create policy wallet_read on public.wallets for select to authenticated using (id = auth.uid());
drop policy if exists ledger_read on public.ledger;
create policy ledger_read on public.ledger for select to authenticated using (user_id = auth.uid());
drop policy if exists blocks_read on public.blocks;
create policy blocks_read on public.blocks for select to authenticated using (blocker = auth.uid());
drop policy if exists waves_read on public.waves;
create policy waves_read on public.waves for select to authenticated using (from_user = auth.uid() or to_user = auth.uid());
drop policy if exists room_read on public.room_messages;
create policy room_read on public.room_messages for select to authenticated using (not public.is_blocked_between(auth.uid(), user_id));
drop policy if exists dm_read on public.dms;
create policy dm_read on public.dms for select to authenticated
  using ((sender = auth.uid() or recipient = auth.uid()) and not public.is_blocked_between(sender, recipient));
drop policy if exists reports_read on public.reports;
create policy reports_read on public.reports for select to authenticated using (reporter = auth.uid());
drop policy if exists stats_read on public.player_stats;
create policy stats_read on public.player_stats for select to authenticated using (id = auth.uid());
drop policy if exists seats_read on public.seat_claims;
create policy seats_read on public.seat_claims for select to authenticated using (true);

-- lock down: browsers may only SELECT (through the policies above) and call the RPCs we grant below
revoke all on all tables in schema public from anon, authenticated;
grant select on public.profiles, public.private_profiles, public.wallets, public.ledger, public.blocks, public.waves,
  public.room_messages, public.dms, public.reports, public.seat_claims, public.player_stats to authenticated;

revoke execute on all functions in schema public from public, anon, authenticated;
grant execute on function public.username_available(text) to anon, authenticated;
grant execute on function public.is_blocked_between(uuid, uuid) to authenticated;   -- used inside RLS policies
grant execute on function public.enter_building(text, text), public.leave_building(), public.get_stats(),
  public.get_me(), public.set_profile(text, date), public.save_avatar(jsonb), public.save_life(text),
  public.set_privacy(boolean), public.get_wallet(), public.get_jail(), public.atm_withdraw(bigint), public.atm_deposit(bigint), public.atm_claim_daily(),
  public.claim_seat(text, text), public.release_seat(), public.list_seats(text), public.send_room_message(text, text),
  public.send_wave(uuid), public.respond_wave(bigint, boolean), public.send_dm(uuid, text), public.block_user(uuid),
  public.unblock_user(uuid), public.report_user(uuid, text, text) to authenticated;   -- validate_avatar stays internal: the client calls save_avatar
alter default privileges in schema public revoke execute on functions from public, anon, authenticated;

-- ------------------------------------------------------------------ realtime
do $$ begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    begin alter publication supabase_realtime add table public.room_messages; exception when duplicate_object then null; end;
    begin alter publication supabase_realtime add table public.dms; exception when duplicate_object then null; end;
    begin alter publication supabase_realtime add table public.waves; exception when duplicate_object then null; end;
    begin alter publication supabase_realtime add table public.seat_claims; exception when duplicate_object then null; end;
  end if;
  -- private channels: only signed-in players may join world presence/broadcast channels
  if to_regclass('realtime.messages') is not null then
    execute 'drop policy if exists futa_rt_read on realtime.messages';
    execute 'drop policy if exists futa_rt_write on realtime.messages';
    execute $p$create policy futa_rt_read on realtime.messages for select to authenticated using (true)$p$;
    execute $p$create policy futa_rt_write on realtime.messages for insert to authenticated with check (true)$p$;
  end if;
end $$;

-- ===================== 02_avatar_options.sql =====================
-- GENERATED by tools/build-options.py from avatar-options.json — do not edit by hand. Run AFTER 01_schema.sql, and again whenever options change.
insert into public.app_config (key, value) values ('avatar_options', '{"_readme":"SOURCE OF TRUTH for every choice in the character creator and for the server validator. Edit this file, then run: python3 tools/build-options.py . Never edit avatar-options.js by hand.","version":1,"palettes":{"skin":["#f3d9c4","#e8be9c","#d9a577","#c68a5b","#b0714a","#9a5c3a","#80472b","#693822","#552b1b","#43210f","#3a1a10","#2c120a"],"hair":["#0d0b0a","#1c1411","#3a2417","#5a3a22","#8b5e34","#b5651d","#c9a15a","#7a1f1f","#1d3a8a","#8b2fc9","#d63384","#bfbfbf"],"eye":["#3a2212","#5a3a1c","#2d4a3a","#4a7a4f","#8a6a2a","#4a78a8","#7c8794","#1a1210"],"lip":["#a45a50","#b5483f","#c43b4f","#8a2236","#d46a7a","#6b2a3a","#e07b5a","#4a1f2a"],"shadow":["#7a5a48","#a0522d","#c8a2c8","#2f4f6f","#d4a017","#3b6b4a","#8b3a62","#222222"],"blush":["#e8806a","#d46a6a","#c9604a","#e59a8a","#b85050","#d98a6a"],"nail":["#c3002f","#f4a7b9","#111111","#ffffff","#7b2cbf","#d4af37","#1e90ff","#2e8b57","#e8c4a8"],"cloth":["#f4f1ea","#1b1b1f","#2c3e63","#7a8aa0","#b02a2a","#e08a2e","#e5c04a","#3d8a4c","#1f6b5c","#2f8fb5","#6b3fa0","#d6568a","#8a5a3c","#d9c3a0","#555a60","#c5c9cf","#0f2b5b","#8c1c3a","#f2a0b4","#8fc9a8","#ff6a3d","#2a2a72","#a3d65c","#5c3a28"]},"patterns":["flat","fabric","stripes","pinstripe","plaid","dots","ankara_a","ankara_b","kente","floral","denim","knit","diagonal"],"body":{"frame":["m","f"],"height":{"min":0.92,"max":1.08,"default":1.0},"build":{"min":0,"max":1,"default":0.5},"bust":{"min":0,"max":1,"default":0.5},"hips":{"min":0,"max":1,"default":0.5},"shoulders":{"min":0,"max":1,"default":0.5}},"face":{"shape":{"count":6,"labels":["Soft oval","Round","Heart","Square","Long","Balanced"]},"eyes":{"count":6,"labels":["Classic","Big","Narrow","Wide-set","Close-set","Gentle"]},"eyeColor":{"count":8},"brows":{"count":5,"labels":["Natural","Bold","Thin arched","Straight","Strong arch"]},"nose":{"count":5,"labels":["Classic","Broad","Slim","Button","Strong"]},"lips":{"count":5,"labels":["Classic","Full","Slim","Wide","Heart"]}},"makeup":{"lips":{"count":8,"optional":true},"shadow":{"count":8,"optional":true},"blush":{"count":6,"optional":true},"liner":{"type":"bool"},"lashes":{"type":"bool"}},"nails":{"count":9,"optional":true},"hair":{"styles":[{"id":"bald","label":"Bald","for":"u"},{"id":"buzz","label":"Buzz cut","for":"m"},{"id":"fade","label":"Low fade","for":"m"},{"id":"afro","label":"Afro","for":"u"},{"id":"twists","label":"Twist coils","for":"u"},{"id":"cornrows","label":"Cornrows","for":"u"},{"id":"box_braids","label":"Box braids","for":"f"},{"id":"locs","label":"Locs","for":"u"},{"id":"bun","label":"Top bun","for":"u"},{"id":"ponytail","label":"Ponytail","for":"f"},{"id":"long_straight","label":"Long straight","for":"f"},{"id":"bob","label":"Bob","for":"f"},{"id":"puffs","label":"Two puffs","for":"f"},{"id":"braid_updo","label":"Braided updo","for":"f"}],"color":{"count":12}},"beard":{"styles":[{"id":"none","label":"None"},{"id":"stubble","label":"Stubble"},{"id":"mustache","label":"Moustache"},{"id":"goatee","label":"Goatee"},{"id":"full","label":"Full beard"}]},"wear":{"top":[{"id":"tee","label":"T-shirt","for":"u","pat":true},{"id":"tank","label":"Tank top","for":"u","pat":true},{"id":"polo","label":"Polo","for":"m","pat":true},{"id":"shirt","label":"Button shirt","for":"u","pat":true},{"id":"hoodie","label":"Hoodie","for":"u","pat":false},{"id":"knit","label":"Knit sweater","for":"u","pat":false},{"id":"blouse","label":"Blouse","for":"f","pat":true},{"id":"croptop","label":"Crop top","for":"f","pat":true},{"id":"kaftan","label":"Kaftan","for":"m","pat":true},{"id":"buba","label":"Buba","for":"f","pat":true},{"id":"uniform_shirt","label":"Uniform shirt","for":"u","restricted":true,"pat":false}],"layer":[{"id":"jacket","label":"Bomber jacket","for":"u"},{"id":"blazer","label":"Blazer","for":"u"},{"id":"cardigan","label":"Cardigan","for":"u"},{"id":"hivis","label":"Hi-vis vest","for":"u","restricted":true},{"id":"labcoat","label":"Lab coat","for":"u","restricted":true}],"bottom":[{"id":"jeans","label":"Jeans","for":"u","pat":false},{"id":"chino","label":"Chinos","for":"m","pat":false},{"id":"slacks","label":"Slacks","for":"u","pat":true},{"id":"shorts","label":"Shorts","for":"u","pat":true},{"id":"joggers","label":"Joggers","for":"u","pat":false},{"id":"sokoto","label":"Sokoto","for":"m","pat":true},{"id":"mini","label":"Mini skirt","for":"f","pat":true},{"id":"skirt","label":"Knee skirt","for":"f","pat":true},{"id":"midi","label":"Long skirt","for":"f","pat":true},{"id":"wrapper","label":"Wrapper","for":"f","pat":true},{"id":"leggings","label":"Leggings","for":"f","pat":false}],"dress":[{"id":"none","label":"No dress","for":"u"},{"id":"sundress","label":"Sundress","for":"f","pat":true},{"id":"bodycon","label":"Body-con dress","for":"f","pat":true},{"id":"maxi","label":"Maxi dress","for":"f","pat":true},{"id":"gown","label":"Ankara gown","for":"f","pat":true},{"id":"abaya","label":"Abaya","for":"f","pat":false}],"shoes":[{"id":"sneakers","label":"Sneakers","for":"u"},{"id":"loafers","label":"Loafers","for":"u"},{"id":"boots","label":"Boots","for":"u"},{"id":"sandals","label":"Sandals","for":"u"},{"id":"heels","label":"Heels","for":"f"}],"head":[{"id":"none","label":"None","for":"u"},{"id":"cap","label":"Cap","for":"u"},{"id":"beanie","label":"Beanie","for":"u"},{"id":"durag","label":"Durag","for":"u"},{"id":"gele","label":"Gele","for":"f","pat":true},{"id":"hijab","label":"Hijab","for":"f"},{"id":"peaked","label":"Peaked cap","for":"u","restricted":true}],"glasses":[{"id":"none","label":"None","for":"u"},{"id":"round","label":"Round","for":"u"},{"id":"square","label":"Square","for":"u"},{"id":"shades","label":"Sunglasses","for":"u"}],"bag":[{"id":"none","label":"None","for":"u"},{"id":"backpack","label":"Backpack","for":"u"},{"id":"sling","label":"Sling bag","for":"u"},{"id":"handbag","label":"Handbag","for":"f"}],"neck":[{"id":"none","label":"None","for":"u"},{"id":"chain","label":"Gold chain","for":"u"},{"id":"tie","label":"Tie","for":"m"},{"id":"lanyard","label":"ID lanyard","for":"u"},{"id":"scarf","label":"Scarf","for":"u"}],"wrist":[{"id":"none","label":"None","for":"u"},{"id":"watch","label":"Watch","for":"u"},{"id":"bangles","label":"Bangles","for":"f"}],"ears":[{"id":"none","label":"None","for":"u"},{"id":"studs","label":"Studs","for":"u"},{"id":"hoops","label":"Hoops","for":"f"}]},"defaults":{"m":{"top":{"id":"tee","c":0},"bottom":{"id":"jeans","c":2},"shoes":{"id":"sneakers","c":1,"c2":0}},"f":{"top":{"id":"blouse","c":11},"bottom":{"id":"jeans","c":16},"shoes":{"id":"sneakers","c":0,"c2":0}}}}'::jsonb)
on conflict (key) do update set value = excluded.value;

-- ===================== 03_activities.sql =====================
-- GENERATED by tools/build-options.py from public/world/game/interior/activities.json — do not edit by hand.
-- Run AFTER 01_schema.sql (and again whenever activities.json changes). The server, not the browser, applies every effect.
create table if not exists public.activities (
  id text primary key, secs int not null, energy int not null default 0, hunger int not null default 0, mood int not null default 0,
  knowledge int not null default 0, cash int not null default 0, cooldown int not null default 0, ui text not null default '', venues text[] not null
);
alter table public.activities enable row level security;
delete from public.activities where id <> all (array['sleep','wardrobe','study','read_book','cook','eat_home','snack','drink_water','shower','watch_tv','check_mirror','pray','give_talk','attend_lecture','lab_work','use_computer','browse_cafe','print_doc','buy_snack','buy_drink','buy_textbook','buy_meds','buy_phone_acc','order_food','eat_meal','buy_cake','get_hair','checkup','workout','lift_weights','run_treadmill','play_chess','play_pingpong','play_game','play_music','view_exhibit','read_notice','operate_generator','tinker','atm']);
insert into public.activities (id, secs, energy, hunger, mood, knowledge, cash, cooldown, ui, venues) values
  ('sleep', 6, 50, -6, 4, 0, 0, 90, '', array['hostel','house','hotel']::text[]),
  ('wardrobe', 1, 0, 0, 0, 0, 0, 0, 'creator', array['hostel','house','hotel']::text[]),
  ('study', 5, -8, -3, -2, 4, 0, 25, '', array['hostel','house','library','faculty','student_union','hotel']::text[]),
  ('read_book', 4, -4, 0, 1, 3, 0, 20, '', array['library','bookshop','faculty','primary_school']::text[]),
  ('cook', 6, -3, 35, 4, 0, -300, 45, '', array['hostel','house']::text[]),
  ('eat_home', 5, 0, 15, 3, 0, 0, 60, '', array['hostel','house','hotel']::text[]),
  ('snack', 3, 0, 8, 1, 0, 0, 30, '', array['hostel','house','hotel']::text[]),
  ('drink_water', 3, 0, 1, 1, 0, 0, 30, '', array['hostel','house','hotel','library','faculty','lecture_theatre','auditorium','admin_office','bank','health_centre','clinic','gym','sports_room','student_union','church','mosque','museum','primary_school','visitor_centre','lab','computer_lab','pharmacy','salon','restaurant','carwash','workshop','cyber_cafe','business_centre']::text[]),
  ('shower', 5, 4, 0, 6, 0, 0, 120, '', array['hostel','house','hotel','gym']::text[]),
  ('watch_tv', 6, -2, 0, 6, 0, 0, 40, '', array['hostel','house','hotel','student_union','carwash','restaurant','salon']::text[]),
  ('check_mirror', 3, 0, 0, 2, 0, 0, 60, '', array['hostel','house','hotel','salon','gym']::text[]),
  ('pray', 6, 0, 0, 8, 0, 0, 120, '', array['church','mosque']::text[]),
  ('give_talk', 5, -3, 0, 3, 1, 0, 90, '', array['lecture_theatre','auditorium','church','faculty','primary_school']::text[]),
  ('attend_lecture', 6, -6, -3, 0, 4, 0, 40, '', array['lecture_theatre','auditorium','faculty','primary_school']::text[]),
  ('lab_work', 6, -5, 0, 0, 3, 0, 40, '', array['lab','faculty','computer_lab','museum']::text[]),
  ('use_computer', 5, -3, 0, 1, 2, 0, 20, '', array['computer_lab','library','faculty','admin_office','lab']::text[]),
  ('browse_cafe', 5, -2, 0, 5, 1, -100, 20, '', array['cyber_cafe','business_centre','student_union']::text[]),
  ('print_doc', 3, 0, 0, 1, 1, -50, 15, '', array['print_shop','business_centre','cyber_cafe','library','admin_office']::text[]),
  ('buy_snack', 3, 0, 15, 2, 0, -150, 20, '', array['provisions','supermarket','petrol_shop','student_union','hotel','carwash','workshop']::text[]),
  ('buy_drink', 3, 0, 6, 3, 0, -200, 20, '', array['provisions','supermarket','petrol_shop','student_union','restaurant','carwash','bakery','hotel','church']::text[]),
  ('buy_textbook', 3, 0, 0, 0, 5, -2500, 60, '', array['bookshop']::text[]),
  ('buy_meds', 3, 8, 0, 3, 0, -800, 60, '', array['pharmacy','clinic','health_centre']::text[]),
  ('buy_phone_acc', 3, 0, 0, 6, 0, -1500, 60, '', array['phone_shop']::text[]),
  ('order_food', 5, 3, 55, 6, 0, -1500, 45, '', array['restaurant']::text[]),
  ('eat_meal', 6, 3, 55, 6, 0, -1500, 45, '', array['restaurant','hotel','student_union','bakery']::text[]),
  ('buy_cake', 3, 0, 25, 9, 0, -1200, 40, '', array['bakery','restaurant']::text[]),
  ('get_hair', 5, 0, 0, 12, 0, -3000, 120, 'creator', array['salon']::text[]),
  ('checkup', 6, 10, 0, 3, 0, -500, 90, '', array['health_centre','clinic']::text[]),
  ('workout', 5, -12, -6, 7, 0, 0, 40, '', array['gym','sports_room']::text[]),
  ('lift_weights', 5, -14, -6, 6, 0, 0, 40, '', array['gym']::text[]),
  ('run_treadmill', 6, -15, -7, 7, 0, 0, 40, '', array['gym']::text[]),
  ('play_chess', 6, -2, 0, 5, 1, 0, 40, '', array['sports_room','student_union']::text[]),
  ('play_pingpong', 6, -6, 0, 7, 0, 0, 40, '', array['sports_room']::text[]),
  ('play_game', 6, -3, 0, 6, 0, 0, 40, '', array['student_union','sports_room']::text[]),
  ('play_music', 6, 0, 0, 5, 0, 0, 60, '', array['church','auditorium']::text[]),
  ('view_exhibit', 4, 0, 0, 3, 1, 0, 30, '', array['museum','visitor_centre','sports_room','library','faculty']::text[]),
  ('read_notice', 3, 0, 0, 0, 1, 0, 60, '', array['faculty','admin_office','student_union','hostel','library','primary_school']::text[]),
  ('operate_generator', 4, 0, 0, 2, 1, 0, 60, '', array['workshop']::text[]),
  ('tinker', 5, -4, 0, 0, 2, 0, 40, '', array['workshop']::text[]),
  ('atm', 1, 0, 0, 0, 0, 0, 0, 'atm', array['bank']::text[])
on conflict (id) do update set secs = excluded.secs, energy = excluded.energy, hunger = excluded.hunger, mood = excluded.mood, knowledge = excluded.knowledge,
  cash = excluded.cash, cooldown = excluded.cooldown, ui = excluded.ui, venues = excluded.venues;

-- Do something inside the building you are standing in (see enter_building). Effects come from the table above.
create or replace function public.do_activity(p_activity text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare u uuid := private.require_user(); a public.activities; s public.player_stats; cd timestamp with time zone; pocket_now bigint;
begin
  select * into a from public.activities where id = p_activity;
  if not found then raise exception 'bad_activity'; end if;
  perform private.require_free(u);                                              -- no activities from a cell
  s := private.decayed_stats(u);
  if s.venue is null or not (s.venue = any (a.venues)) then raise exception 'wrong_place'; end if;
  if a.ui in ('atm') then raise exception 'use_the_atm'; end if;                -- ATM has its own functions
  select last_at into cd from public.activity_cooldowns where user_id = u and activity = a.id;
  if cd is not null and cd > now() - make_interval(secs => a.cooldown) then raise exception 'cooldown'; end if;
  if a.energy < 0 and s.energy + a.energy < 0 then raise exception 'too_tired'; end if;
  if a.cash < 0 then
    select w.pocket into pocket_now from public.wallets w where w.id = u for update;
    if pocket_now < -a.cash then raise exception 'insufficient_funds'; end if;
    perform private.ledger_move(u, 'activity', a.cash, 0, a.id);
  end if;
  update public.player_stats set energy = greatest(0, least(100, energy + a.energy)), hunger = greatest(0, least(100, hunger + a.hunger)),
      mood = greatest(0, least(100, mood + a.mood)), knowledge = knowledge + a.knowledge, updated_at = now() where id = u;
  insert into public.activity_cooldowns (user_id, activity, last_at) values (u, a.id, now())
    on conflict (user_id, activity) do update set last_at = excluded.last_at;
  return public.get_stats();
end $$;

revoke execute on function public.do_activity(text) from public, anon;
grant execute on function public.do_activity(text) to authenticated;

-- ===================== 04_auth_backfill.sql =====================
-- 04_auth_backfill.sql — run ONCE in the Supabase SQL Editor (safe to re-run).
-- Why: the on_auth_user_created trigger (01_schema.sql) only creates a player's rows for accounts made AFTER it existed.
-- Accounts created earlier (e.g. while you were testing Google / email sign-up before running 01) have no profile row, so get_me() returns null
-- and the app behaves as if sign-in failed. This fills in the missing rows. It never changes existing data.
insert into public.profiles (id)          select u.id from auth.users u on conflict do nothing;
insert into public.private_profiles (id)  select u.id from auth.users u on conflict do nothing;
insert into public.wallets (id)           select u.id from auth.users u on conflict do nothing;
insert into public.player_stats (id)      select u.id from auth.users u on conflict do nothing;

-- ===================== 05_feed.sql =====================
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

-- ===================== 06_property.sql =====================
-- 06_property.sql — "Property" phone app: buy houses, shops and land with GAME money, level by level.
-- Run in the Supabase SQL Editor AFTER 01_schema.sql (and again after re-running 01, because 01 revokes all grants). Safe to re-run.
-- Rules (all decided HERE, never in the browser):
--   • 5 levels. Level 1 is open to everyone. To buy at level N (N>1) you must already own one property of level N-1.
--   • Cheapest property costs 500,000 coins (check constraint below). Money is integer coins and moves only through private.ledger_move().
--   • You pay from 'pocket' or 'bank'. Each listing can be owned once per player.
--   • Rent: every owned property pays rent_daily into the BANK once per Africa/Lagos day, when the player taps "Collect rent".
-- The phone app (public/world/game/phone/apps/property.js) has the same listings for pictures and text; PRICES come from this table.
-- Change a price without code:  update public.property_catalog set price = 600000, rent_daily = 600 where id = 'l1_room';

create table if not exists public.property_catalog (
  id text primary key,
  level int not null check (level between 1 and 5),
  price bigint not null check (price >= 500000),
  rent_daily bigint not null check (rent_daily >= 0),
  active boolean not null default true
);
create table if not exists public.property_owned (
  user_id uuid not null references auth.users(id) on delete cascade,
  prop_id text not null references public.property_catalog(id),
  price_paid bigint not null,
  bought_at timestamptz not null default now(),
  last_rent date,
  primary key (user_id, prop_id)
);
alter table public.property_catalog enable row level security;
alter table public.property_owned enable row level security;

insert into public.property_catalog (id, level, price, rent_daily) values
  ('l1_room',   1,      500000,      500), ('l1_kiosk',  1,      750000,      750), ('l1_annex',  1,    1200000,     1200), ('l1_plot',   1,    1800000,     1800),
  ('l2_flat',   2,     2500000,     2500), ('l2_store',  2,     3500000,     3500), ('l2_bung',   2,     6000000,     6000), ('l2_hostel', 2,     9000000,     9000),
  ('l3_duplex', 3,    15000000,    15000), ('l3_unit',   3,    22000000,    22000), ('l3_court',  3,    30000000,    30000), ('l3_land',   3,    42000000,    42000),
  ('l4_villa',  4,    85000000,    85000), ('l4_suites', 4,   140000000,   140000), ('l4_lake',   4,   180000000,   180000), ('l4_plaza',  4,   240000000,   240000),
  ('l5_mansion',5,   450000000,   450000), ('l5_tower',  5,   900000000,   900000), ('l5_crown',  5,  2000000000,  2000000)
on conflict (id) do nothing;

-- ------------------------------------------------------------------ buy
create or replace function public.buy_property(p_prop text, p_from text default 'pocket') returns jsonb
language plpgsql security definer set search_path = '' as $$
declare u uuid := auth.uid(); c public.property_catalog; w public.wallets;
begin
  if u is null then raise exception 'not_signed_in'; end if;
  if p_from not in ('pocket', 'bank') then raise exception 'bad_source'; end if;
  perform pg_advisory_xact_lock(hashtext(u::text));
  select * into c from public.property_catalog where id = p_prop and active;
  if not found then raise exception 'no_such_property'; end if;
  if exists (select 1 from public.property_owned where user_id = u and prop_id = c.id) then raise exception 'already_owned'; end if;
  if c.level > 1 and not exists (select 1 from public.property_owned o join public.property_catalog k on k.id = o.prop_id where o.user_id = u and k.level = c.level - 1)
    then raise exception 'level_locked'; end if;
  begin
    perform private.ledger_move(u, 'property_buy', case when p_from = 'pocket' then -c.price else 0 end, case when p_from = 'bank' then -c.price else 0 end, c.id);
  exception when check_violation then raise exception 'not_enough_money'; end;
  insert into public.property_owned (user_id, prop_id, price_paid) values (u, c.id, c.price);
  select * into w from public.wallets where id = u;
  return jsonb_build_object('pocket', w.pocket, 'bank', w.bank, 'level', c.level);
end $$;

-- ------------------------------------------------------------------ rent (once per Lagos day, into the bank)
create or replace function public.collect_rent() returns jsonb
language plpgsql security definer set search_path = '' as $$
declare u uuid := auth.uid(); today date := (now() at time zone 'Africa/Lagos')::date; total bigint; w public.wallets;
begin
  if u is null then raise exception 'not_signed_in'; end if;
  perform pg_advisory_xact_lock(hashtext(u::text));
  select coalesce(sum(c.rent_daily), 0) into total from public.property_owned o join public.property_catalog c on c.id = o.prop_id
    where o.user_id = u and o.last_rent is distinct from today;
  if total <= 0 then raise exception 'nothing_to_collect'; end if;
  update public.property_owned set last_rent = today where user_id = u and last_rent is distinct from today;
  perform private.ledger_move(u, 'property_rent', 0, total, to_char(today, 'YYYY-MM-DD'));
  select * into w from public.wallets where id = u;
  return jsonb_build_object('amount', total, 'pocket', w.pocket, 'bank', w.bank);
end $$;

-- ------------------------------------------------------------------ who can see what (reads only; writes are the functions above)
drop policy if exists property_cat_read on public.property_catalog;
create policy property_cat_read on public.property_catalog for select to authenticated using (active);
drop policy if exists property_own_read on public.property_owned;
create policy property_own_read on public.property_owned for select to authenticated using (user_id = auth.uid());
revoke all on public.property_catalog, public.property_owned from anon, authenticated;
grant select on public.property_catalog, public.property_owned to authenticated;
revoke execute on function public.buy_property(text, text), public.collect_rent() from public, anon;
grant execute on function public.buy_property(text, text), public.collect_rent() to authenticated;

-- ===================== 07_cars.sql =====================
-- 07_cars.sql — "Cars" phone app: buy bikes, keke, cars and a helicopter with GAME money, level by level.
-- Run in the Supabase SQL Editor AFTER 01_schema.sql (and again after re-running 01, because 01 revokes all grants). Safe to re-run.
-- Rules (all decided HERE, never in the browser):
--   • 5 levels. Level 1 is open to everyone. To buy at level N (N>1) you must already own one vehicle of level N-1.
--   • Cheapest vehicle costs 500,000 coins (check constraint below). Money is integer coins and moves only through private.ledger_move().
--   • You pay from 'pocket' or 'bank'. Each listing can be owned once per player.
--   • Income: every owned vehicle pays income_daily into the BANK once per Africa/Lagos day, when the player taps "Collect hire income".
-- The phone app (public/world/game/phone/apps/cars.js) has the same listings for pictures and text; PRICES come from this table.
-- Change a price without code:  update public.car_catalog set price = 600000, income_daily = 600 where id = 'c1_okada';

create table if not exists public.car_catalog (
  id text primary key,
  level int not null check (level between 1 and 5),
  price bigint not null check (price >= 500000),
  income_daily bigint not null check (income_daily >= 0),
  active boolean not null default true
);
create table if not exists public.car_owned (
  user_id uuid not null references auth.users(id) on delete cascade,
  car_id text not null references public.car_catalog(id),
  price_paid bigint not null,
  bought_at timestamptz not null default now(),
  last_income date,
  primary key (user_id, car_id)
);
alter table public.car_catalog enable row level security;
alter table public.car_owned enable row level security;

insert into public.car_catalog (id, level, price, income_daily) values
  ('c1_okada',   1,      520000,      520), ('c1_keke',   1,      750000,      750), ('c1_bike',   1,      950000,      950), ('c1_hatch',  1,    1900000,     1900),
  ('c2_hatch',   2,     2800000,     2800), ('c2_sedan',  2,     4500000,     4500), ('c2_bus',    2,     7000000,     7000), ('c2_pick',   2,     9000000,     9000),
  ('c3_sedan',   3,    15000000,    15000), ('c3_suv',    3,    25000000,    25000), ('c3_4x4',    3,    38000000,    38000), ('c3_pick',   3,    45000000,    45000),
  ('c4_saloon',  4,    80000000,    80000), ('c4_range',  4,   150000000,   150000), ('c4_coupe',  4,   220000000,   220000), ('c4_armor',  4,   250000000,   250000),
  ('c5_limo',    5,   450000000,   450000), ('c5_super',  5,   900000000,   900000), ('c5_heli',   5,  2000000000,  2000000)
on conflict (id) do nothing;

-- ------------------------------------------------------------------ buy
create or replace function public.buy_car(p_car text, p_from text default 'pocket') returns jsonb
language plpgsql security definer set search_path = '' as $$
declare u uuid := auth.uid(); c public.car_catalog; w public.wallets;
begin
  if u is null then raise exception 'not_signed_in'; end if;
  if p_from not in ('pocket', 'bank') then raise exception 'bad_source'; end if;
  perform pg_advisory_xact_lock(hashtext(u::text));
  select * into c from public.car_catalog where id = p_car and active;
  if not found then raise exception 'no_such_car'; end if;
  if exists (select 1 from public.car_owned where user_id = u and car_id = c.id) then raise exception 'already_owned'; end if;
  if c.level > 1 and not exists (select 1 from public.car_owned o join public.car_catalog k on k.id = o.car_id where o.user_id = u and k.level = c.level - 1)
    then raise exception 'level_locked'; end if;
  begin
    perform private.ledger_move(u, 'car_buy', case when p_from = 'pocket' then -c.price else 0 end, case when p_from = 'bank' then -c.price else 0 end, c.id);
  exception when check_violation then raise exception 'not_enough_money'; end;
  insert into public.car_owned (user_id, car_id, price_paid) values (u, c.id, c.price);
  select * into w from public.wallets where id = u;
  return jsonb_build_object('pocket', w.pocket, 'bank', w.bank, 'level', c.level);
end $$;

-- ------------------------------------------------------------------ hire income (once per Lagos day, into the bank)
create or replace function public.collect_car_income() returns jsonb
language plpgsql security definer set search_path = '' as $$
declare u uuid := auth.uid(); today date := (now() at time zone 'Africa/Lagos')::date; total bigint; w public.wallets;
begin
  if u is null then raise exception 'not_signed_in'; end if;
  perform pg_advisory_xact_lock(hashtext(u::text));
  select coalesce(sum(c.income_daily), 0) into total from public.car_owned o join public.car_catalog c on c.id = o.car_id
    where o.user_id = u and o.last_income is distinct from today;
  if total <= 0 then raise exception 'nothing_to_collect'; end if;
  update public.car_owned set last_income = today where user_id = u and last_income is distinct from today;
  perform private.ledger_move(u, 'car_income', 0, total, to_char(today, 'YYYY-MM-DD'));
  select * into w from public.wallets where id = u;
  return jsonb_build_object('amount', total, 'pocket', w.pocket, 'bank', w.bank);
end $$;

-- ------------------------------------------------------------------ who can see what (reads only; writes are the functions above)
drop policy if exists car_cat_read on public.car_catalog;
create policy car_cat_read on public.car_catalog for select to authenticated using (active);
drop policy if exists car_own_read on public.car_owned;
create policy car_own_read on public.car_owned for select to authenticated using (user_id = auth.uid());
revoke all on public.car_catalog, public.car_owned from anon, authenticated;
grant select on public.car_catalog, public.car_owned to authenticated;
revoke execute on function public.buy_car(text, text), public.collect_car_income() from public, anon;
grant execute on function public.buy_car(text, text), public.collect_car_income() to authenticated;

-- ===================== 08_accessories.sql =====================
-- 08_accessories.sql — "Accessories" phone app: buy watches, bags, shades and jewellery with GAME money, level by level.
-- Run in the Supabase SQL Editor AFTER 01_schema.sql (and again after re-running 01, because 01 revokes all grants). Safe to re-run.
-- Rules (all decided HERE, never in the browser):
--   • 5 levels, 4 items each. Level 1 is open to everyone. To buy at level N (N>1) you must already own one item of level N-1.
--   • Cheapest item costs 50,000 coins (check constraint below). Money is integer coins and moves only through private.ledger_move().
--   • You pay from 'pocket' or 'bank'. Each item can be owned once per player. Accessories earn NO income (they are for style).
-- The phone app (public/world/game/phone/apps/accessories.js) has the same items for pictures and text; PRICES come from this table.
-- Change a price without code:  update public.acc_catalog set price = 60000 where id = 'a1_watch';
-- Later ("Wear it"): slot / look map each item to the avatar options (wear.wrist / bag / glasses / ears / neck in avatar-options.json).

create table if not exists public.acc_catalog (
  id text primary key,
  level int not null check (level between 1 and 5),
  price bigint not null check (price >= 50000),
  slot text not null check (slot in ('wrist', 'bag', 'glasses', 'ears', 'neck')),
  look text not null,
  active boolean not null default true
);
create table if not exists public.acc_owned (
  user_id uuid not null references auth.users(id) on delete cascade,
  item_id text not null references public.acc_catalog(id),
  price_paid bigint not null,
  bought_at timestamptz not null default now(),
  primary key (user_id, item_id)
);
alter table public.acc_catalog enable row level security;
alter table public.acc_owned enable row level security;

insert into public.acc_catalog (id, level, price, slot, look) values
  ('a1_watch',    1,     50000, 'wrist',   'watch'),   ('a1_bag',      1,     65000, 'bag',     'sling'),    ('a1_shades',  1,     55000, 'glasses', 'shades'),  ('a1_studs',    1,     60000, 'ears', 'studs'),
  ('a2_watch',    2,    250000, 'wrist',   'watch'),   ('a2_bag',      2,    300000, 'bag',     'backpack'), ('a2_shades',  2,    280000, 'glasses', 'round'),   ('a2_bangles',  2,    220000, 'wrist', 'bangles'),
  ('a3_watch',    3,   1200000, 'wrist',   'watch'),   ('a3_bag',      3,   1500000, 'bag',     'handbag'),  ('a3_shades',  3,   1100000, 'glasses', 'square'),  ('a3_chain',    3,   1400000, 'neck', 'chain'),
  ('a4_watch',    4,   6000000, 'wrist',   'watch'),   ('a4_bag',      4,   8000000, 'bag',     'handbag'),  ('a4_shades',  4,   5000000, 'glasses', 'square'),  ('a4_hoops',    4,   7000000, 'ears', 'hoops'),
  ('a5_watch',    5,  40000000, 'wrist',   'watch'),   ('a5_bag',      5,  55000000, 'bag',     'handbag'),  ('a5_shades',  5,  30000000, 'glasses', 'square'),  ('a5_necklace', 5,  90000000, 'neck', 'chain')
on conflict (id) do nothing;

-- ------------------------------------------------------------------ buy
create or replace function public.buy_accessory(p_item text, p_from text default 'pocket') returns jsonb
language plpgsql security definer set search_path = '' as $$
declare u uuid := auth.uid(); c public.acc_catalog; w public.wallets;
begin
  if u is null then raise exception 'not_signed_in'; end if;
  if p_from not in ('pocket', 'bank') then raise exception 'bad_source'; end if;
  perform pg_advisory_xact_lock(hashtext(u::text));
  select * into c from public.acc_catalog where id = p_item and active;
  if not found then raise exception 'no_such_item'; end if;
  if exists (select 1 from public.acc_owned where user_id = u and item_id = c.id) then raise exception 'already_owned'; end if;
  if c.level > 1 and not exists (select 1 from public.acc_owned o join public.acc_catalog k on k.id = o.item_id where o.user_id = u and k.level = c.level - 1)
    then raise exception 'level_locked'; end if;
  begin
    perform private.ledger_move(u, 'accessory_buy', case when p_from = 'pocket' then -c.price else 0 end, case when p_from = 'bank' then -c.price else 0 end, c.id);
  exception when check_violation then raise exception 'not_enough_money'; end;
  insert into public.acc_owned (user_id, item_id, price_paid) values (u, c.id, c.price);
  select * into w from public.wallets where id = u;
  return jsonb_build_object('pocket', w.pocket, 'bank', w.bank, 'level', c.level);
end $$;

-- ------------------------------------------------------------------ who can see what (reads only; writes are the function above)
drop policy if exists acc_cat_read on public.acc_catalog;
create policy acc_cat_read on public.acc_catalog for select to authenticated using (active);
drop policy if exists acc_own_read on public.acc_owned;
create policy acc_own_read on public.acc_owned for select to authenticated using (user_id = auth.uid());
revoke all on public.acc_catalog, public.acc_owned from anon, authenticated;
grant select on public.acc_catalog, public.acc_owned to authenticated;
revoke execute on function public.buy_accessory(text, text) from public, anon;
grant execute on function public.buy_accessory(text, text) to authenticated;

-- ===================== 09_salon.sql =====================
-- Salon: change hair / beard AFTER sign-up. Run after 01_schema.sql and 03_activities.sql.
-- One atomic call: it runs the server activity 'get_hair' (must be standing in a salon, cooldown, the price from the activities table is taken
-- from the pocket through the ledger) AND saves the new hair/beard. If anything fails the whole call rolls back, so a player is never charged
-- without getting the haircut. Only hair and beard are taken from p_look; every other part of the saved look is kept as it is.
-- (public.save_avatar refuses hair/beard changes once a player is onboarded, so this is the only paid way to change them.)
create or replace function public.save_hair(p_look jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare u uuid := private.require_user(); cur jsonb; nxt jsonb; clean jsonb; st jsonb;
begin
  if pg_column_size(p_look) > 8000 then raise exception 'look_too_large'; end if;
  select avatar_json into cur from public.profiles where id = u for update;
  if cur is null then raise exception 'finish_sign_up'; end if;
  nxt := cur;
  if p_look ? 'hair' then nxt := jsonb_set(nxt, '{hair}', p_look -> 'hair'); end if;
  if p_look ? 'beard' then nxt := jsonb_set(nxt, '{beard}', p_look -> 'beard'); end if;
  clean := public.validate_avatar(nxt, false);
  if clean -> 'hair' is not distinct from cur -> 'hair' and clean -> 'beard' is not distinct from cur -> 'beard' then raise exception 'nothing_changed'; end if;   -- no change, no charge
  st := public.do_activity('get_hair');                                  -- wrong_place / cooldown / insufficient_funds are raised here; charges the ledger
  update public.profiles set avatar_json = clean, avatar_hash = md5(clean::text) where id = u;
  return jsonb_build_object('look', clean, 'stats', st);
end $$;
revoke execute on function public.save_hair(jsonb) from public, anon;
grant execute on function public.save_hair(jsonb) to authenticated;

-- ===================== 10_chat_social.sql =====================
-- ==========================================================================
-- 10_chat_social.sql — chat privacy + player search + group chats.   Run AFTER 01_schema.sql (and 03/05… any order is fine).
-- Safe to re-run.  Test on a throwaway Postgres first: supabase/tests/run.sh (it runs tests/test_chat.sql).
--
--  1. Building chat is private: a room called int_<building>_<n> can only be read / written by a player who is
--     currently inside that building (player_stats.building, set by enter_building).  Zone rooms and campus_lobby stay open.
--  2. search_players(text): names only (+ your wave status).  Skips yourself, blocked people (both ways),
--     the other age group (teens vs adults) and players who switched waves off (unless already friends).
--  3. Groups: chat_groups / group_members / group_messages.  Members-only reads (RLS).  Adding someone = an INVITE they accept.
--     Teens and adults never share a group.  All writes go through the RPCs at the bottom (granted explicitly).
-- ==========================================================================

-- ------------------------------------------------------------------ 1. building chat privacy
-- "Is the caller allowed in this room?"  Public wrapper because RLS policies run as the browser's role (it cannot use schema private).
-- Presence is trusted for 10 minutes: the interior calls get_stats every 30 s, which refreshes player_stats.updated_at.
create or replace function public.in_room(p_room text) returns boolean
language sql stable security definer set search_path = '' as $$
  select case
    when lower(p_room) !~ '^int_' then true                                    -- zone_*, campus_lobby, …: open to every signed-in player
    else exists (
      select 1 from public.player_stats s
      where s.id = auth.uid() and s.building is not null
        and s.updated_at > now() - interval '10 minutes'
        and lower(p_room) ~ '^int_.+_[0-9]+$'
        and regexp_replace(lower(p_room), '^int_(.*)_[0-9]+$', '\1') = lower(s.building))
  end $$;

drop policy if exists room_read on public.room_messages;
create policy room_read on public.room_messages for select to authenticated
  using (public.in_room(room) and not public.is_blocked_between(auth.uid(), user_id));

create or replace function public.send_room_message(p_room text, p_body text) returns bigint
language plpgsql security definer set search_path = '' as $$
declare u uuid := private.require_user(); name text; teen boolean; txt text; recent int; nid bigint;
begin
  if p_room !~ '^[a-z0-9_:.-]{1,60}$' then raise exception 'bad_room'; end if;
  if not public.in_room(p_room) then raise exception 'not_in_room'; end if;
  select p.username, q.is_teen into name, teen from public.profiles p join public.private_profiles q on q.id = p.id where p.id = u;
  if name is null then raise exception 'finish_sign_up'; end if;
  select count(*) into recent from public.room_messages where user_id = u and created_at > now() - interval '10 seconds';
  if recent >= 5 then raise exception 'slow_down'; end if;
  txt := private.chat_clean(p_body, teen);
  if txt is null then raise exception 'message_not_allowed'; end if;
  insert into public.room_messages (room, user_id, username, body) values (p_room, u, name, txt) returning id into nid;
  return nid;
end $$;

-- ------------------------------------------------------------------ 2. search players by username
-- Returns at most 8 rows: id, username, relation = none | waved (you waved) | incoming (they waved) | friends.
-- The relation only decides which button the phone shows; the wave-first rule is still enforced by send_dm.
create or replace function public.search_players(p_query text) returns table (user_id uuid, username text, relation text)
language plpgsql stable security definer set search_path = '' as $$
#variable_conflict use_column
declare u uuid := private.require_user(); q text := regexp_replace(lower(btrim(coalesce(p_query, ''))), '[^a-z0-9_]', '', 'g');
begin
  if length(q) < 2 then return; end if;
  return query
    select p.id, p.username::text,
           case when w.status = 'accepted' then 'friends'
                when w.status = 'pending' and w.from_user = u then 'waved'
                when w.status = 'pending' then 'incoming'
                else 'none' end
    from public.profiles p
    join public.private_profiles pp on pp.id = p.id
    left join lateral (
      select ww.status, ww.from_user from public.waves ww
      where (ww.from_user = u and ww.to_user = p.id) or (ww.from_user = p.id and ww.to_user = u)
      order by (ww.status = 'accepted') desc, ww.id desc limit 1) w on true
    where p.username is not null and p.id <> u
      and p.username like '%' || replace(q, '_', '\_') || '%'
      and private.same_age_group(u, p.id)
      and (pp.accept_waves or w.status = 'accepted')
      and not exists (select 1 from public.blocks b where (b.blocker = u and b.blocked = p.id) or (b.blocker = p.id and b.blocked = u))
    order by (p.username = q) desc, (p.username like replace(q, '_', '\_') || '%') desc, p.username
    limit 8;
end $$;

-- ------------------------------------------------------------------ 3. groups
create table if not exists public.chat_groups (
  id bigserial primary key,
  name text not null check (char_length(name) between 2 and 30),
  owner uuid not null references auth.users(id) on delete cascade,
  is_teen boolean not null,                                   -- the group's age band, copied from its creator; only that band may join
  created_at timestamptz not null default now()
);
create table if not exists public.group_members (
  group_id bigint not null references public.chat_groups(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  status text not null default 'invited' check (status in ('invited', 'member', 'declined')),
  role text not null default 'member' check (role in ('owner', 'member')),
  invited_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  primary key (group_id, user_id)
);
create index if not exists group_members_user_idx on public.group_members (user_id, status);
create table if not exists public.group_messages (
  id bigserial primary key,
  group_id bigint not null references public.chat_groups(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  username text not null, body text not null, created_at timestamptz not null default now()
);
create index if not exists group_messages_idx on public.group_messages (group_id, id desc);
create index if not exists group_messages_user_idx on public.group_messages (user_id, created_at desc);

alter table public.chat_groups enable row level security;
alter table public.group_members enable row level security;
alter table public.group_messages enable row level security;

-- security definer so the policies below do not recurse into group_members' own policy
create or replace function public.is_group_member(p_group bigint) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.group_members m where m.group_id = p_group and m.user_id = auth.uid() and m.status = 'member') $$;
create or replace function public.is_group_invited(p_group bigint) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.group_members m where m.group_id = p_group and m.user_id = auth.uid() and m.status = 'invited') $$;

drop policy if exists groups_read on public.chat_groups;
create policy groups_read on public.chat_groups for select to authenticated using (public.is_group_member(id) or public.is_group_invited(id));
drop policy if exists gmembers_read on public.group_members;      -- members see the member list; everyone sees their own row (their invites)
create policy gmembers_read on public.group_members for select to authenticated using (user_id = auth.uid() or public.is_group_member(group_id));
drop policy if exists gmsg_read on public.group_messages;
create policy gmsg_read on public.group_messages for select to authenticated
  using (public.is_group_member(group_id) and not public.is_blocked_between(auth.uid(), user_id));

-- create a group (you become its owner and first member)
create or replace function public.create_group(p_name text) returns bigint
language plpgsql security definer set search_path = '' as $$
declare u uuid := private.require_user(); teen boolean; nm text; mine int; today int; gid bigint;
begin
  select q.is_teen into teen from public.private_profiles q join public.profiles p on p.id = q.id where q.id = u and p.username is not null;
  if teen is null then raise exception 'finish_sign_up'; end if;
  nm := private.chat_clean(p_name, true);   -- group names use the strict rule (no links or phone numbers) for everyone
  if nm is null or char_length(nm) not between 2 and 30 then raise exception 'bad_group_name'; end if;
  select count(*) into mine from public.group_members where user_id = u and status = 'member';
  if mine >= 10 then raise exception 'too_many_groups'; end if;
  select count(*) into today from public.chat_groups where owner = u and created_at > now() - interval '1 day';
  if today >= 5 then raise exception 'slow_down'; end if;
  insert into public.chat_groups (name, owner, is_teen) values (nm, u, teen) returning id into gid;
  insert into public.group_members (group_id, user_id, status, role, invited_by) values (gid, u, 'member', 'owner', u);
  return gid;
end $$;

-- invite a player (any member may invite). They must accept before they can read or write anything.
create or replace function public.invite_to_group(p_group bigint, p_user uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare u uuid := private.require_user(); g public.chat_groups; t public.private_profiles; ex public.group_members; n int; sent int; friends boolean;
begin
  if not public.is_group_member(p_group) then raise exception 'not_member'; end if;
  select * into g from public.chat_groups where id = p_group;
  if p_user = u then raise exception 'not_allowed'; end if;
  select * into t from public.private_profiles where id = p_user;
  if not found or not exists (select 1 from public.profiles where id = p_user and username is not null) then raise exception 'not_allowed'; end if;
  if t.is_teen is distinct from g.is_teen then raise exception 'not_allowed'; end if;                   -- teens and adults never share a group
  if public.is_blocked_between(u, p_user) then raise exception 'not_allowed'; end if;
  select exists (select 1 from public.waves w where w.status = 'accepted' and ((w.from_user = u and w.to_user = p_user) or (w.from_user = p_user and w.to_user = u))) into friends;
  if not friends and not t.accept_waves then raise exception 'not_allowed'; end if;                      -- respects the privacy switch
  select count(*) into sent from public.group_members where invited_by = u and created_at > now() - interval '1 day' and user_id <> u;
  if sent >= 40 then raise exception 'slow_down'; end if;
  select count(*) into n from public.group_members where group_id = p_group and status = 'member';
  if n >= 20 then raise exception 'group_full'; end if;
  select * into ex from public.group_members where group_id = p_group and user_id = p_user;
  if found then
    if ex.status = 'member' then return jsonb_build_object('status', 'member'); end if;
    if ex.status = 'invited' then return jsonb_build_object('status', 'invited'); end if;
    if ex.created_at > now() - interval '1 day' then raise exception 'not_allowed'; end if;               -- they said no recently: do not nag
    update public.group_members set status = 'invited', invited_by = u, created_at = now() where group_id = p_group and user_id = p_user;
  else
    insert into public.group_members (group_id, user_id, status, invited_by) values (p_group, p_user, 'invited', u);
  end if;
  return jsonb_build_object('status', 'invited');
end $$;

create or replace function public.respond_group_invite(p_group bigint, p_accept boolean) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare u uuid := private.require_user(); n int; cnt int;
begin
  if not exists (select 1 from public.group_members where group_id = p_group and user_id = u and status = 'invited') then raise exception 'not_found'; end if;
  if p_accept then
    select count(*) into n from public.group_members where group_id = p_group and status = 'member';
    if n >= 20 then raise exception 'group_full'; end if;
    select count(*) into cnt from public.group_members where user_id = u and status = 'member';
    if cnt >= 10 then raise exception 'too_many_groups'; end if;
    update public.group_members set status = 'member' where group_id = p_group and user_id = u;
    return jsonb_build_object('status', 'member');
  end if;
  update public.group_members set status = 'declined', created_at = now() where group_id = p_group and user_id = u;
  return jsonb_build_object('status', 'declined');
end $$;

-- leave a group. If the owner leaves, the longest-standing member takes over; an empty group is deleted.
create or replace function public.leave_group(p_group bigint) returns void
language plpgsql security definer set search_path = '' as $$
declare u uuid := private.require_user(); heir uuid;
begin
  delete from public.group_members where group_id = p_group and user_id = u;
  if not exists (select 1 from public.group_members where group_id = p_group and status = 'member') then
    delete from public.chat_groups where id = p_group; return;
  end if;
  if (select owner from public.chat_groups where id = p_group) = u then
    select user_id into heir from public.group_members where group_id = p_group and status = 'member' order by created_at, user_id limit 1;
    update public.chat_groups set owner = heir where id = p_group;
    update public.group_members set role = 'owner' where group_id = p_group and user_id = heir;
  end if;
end $$;

-- owner removes a member (or cancels a pending invite)
create or replace function public.remove_group_member(p_group bigint, p_user uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare u uuid := private.require_user();
begin
  if p_user = u then raise exception 'not_allowed'; end if;                                              -- use leave_group
  if not exists (select 1 from public.chat_groups where id = p_group and owner = u) then raise exception 'not_allowed'; end if;
  delete from public.group_members where group_id = p_group and user_id = p_user;
end $$;

create or replace function public.send_group_message(p_group bigint, p_body text) returns bigint
language plpgsql security definer set search_path = '' as $$
declare u uuid := private.require_user(); name text; teen boolean; txt text; recent int; nid bigint;
begin
  if not public.is_group_member(p_group) then raise exception 'not_member'; end if;
  select p.username, q.is_teen into name, teen from public.profiles p join public.private_profiles q on q.id = p.id where p.id = u;
  if name is null then raise exception 'finish_sign_up'; end if;
  select count(*) into recent from public.group_messages where user_id = u and created_at > now() - interval '10 seconds';
  if recent >= 5 then raise exception 'slow_down'; end if;
  txt := private.chat_clean(p_body, teen);
  if txt is null then raise exception 'message_not_allowed'; end if;
  insert into public.group_messages (group_id, user_id, username, body) values (p_group, u, name, txt) returning id into nid;
  return nid;
end $$;

-- housekeeping (same job as before + group tables): old group messages and old declined invites go away
create or replace function private.cleanup() returns void language sql as $$
  delete from public.room_messages where created_at < now() - interval '2 days';
  delete from public.seat_claims where expires_at < now();
  delete from public.group_messages where created_at < now() - interval '14 days';
  delete from public.group_members where status = 'declined' and created_at < now() - interval '7 days';
$$;

-- ------------------------------------------------------------------ grants + realtime
grant select on public.chat_groups, public.group_members, public.group_messages to authenticated;
grant execute on function public.in_room(text), public.is_group_member(bigint), public.is_group_invited(bigint),
  public.send_room_message(text, text), public.search_players(text), public.create_group(text), public.invite_to_group(bigint, uuid),
  public.respond_group_invite(bigint, boolean), public.leave_group(bigint), public.remove_group_member(bigint, uuid),
  public.send_group_message(bigint, text) to authenticated;

do $$ begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    begin alter publication supabase_realtime add table public.group_messages; exception when duplicate_object then null; end;
    begin alter publication supabase_realtime add table public.group_members; exception when duplicate_object then null; end;
  end if;
end $$;

-- ===================== 11_campus.sql =====================
-- GENERATED by tools/build-campus.py from campus-options.json — do not edit by hand. Run AFTER 01_schema.sql (and again after re-running 01, because 01 revokes all grants, or whenever the options change). Safe to re-run.
-- "Where do you belong?" (onboarding): the player picks a STATUS (current student / graduate / corper / alumni / aspirant / Akure resident / outsider),
-- and, where it applies, a FUTA school, a department and one extra answer (level, year, area of Akure, or admission stage).
-- The answer lives in profiles.campus (jsonb, visible to signed-in players like the username, so it can show as a small tag). It is a LABEL only: it gives no money or power.
-- Nothing the player types is stored: every value must match an id in the options below, so the server decides what is valid.

alter table public.profiles add column if not exists campus jsonb;

insert into public.app_config (key, value) values ('campus_options', '{"_readme":"SOURCE OF TRUTH for the ''Where do you belong?'' onboarding screen and the server validator (supabase/11_campus.sql). Edit this file, then run: python3 tools/build-campus.py . Schools/departments were taken from FUTA''s own admission pages (futa.edu.ng) and public course lists in Oct 2026; FUTA adds and renames departments often, so check this list once a session. Anything marked ''assumed'' is a game design choice, not an official FUTA fact.","version":1,"schools":[{"id":"saat","short":"SAAT","name":"School of Agriculture and Agricultural Technology","depts":[{"id":"agricultural_extension_and_communication_technology","name":"Agricultural Extension and Communication Technology"},{"id":"agricultural_resource_economics","name":"Agricultural Resource Economics"},{"id":"animal_production_and_health","name":"Animal Production and Health"},{"id":"crop_soil_and_pest_management","name":"Crop, Soil and Pest Management"},{"id":"ecotourism_and_wildlife_management","name":"Ecotourism and Wildlife Management"},{"id":"fisheries_and_aquaculture_technology","name":"Fisheries and Aquaculture Technology"},{"id":"food_science_and_technology","name":"Food Science and Technology"},{"id":"forestry_and_wood_technology","name":"Forestry and Wood Technology"}]},{"id":"seet","short":"SEET","name":"School of Engineering and Engineering Technology","depts":[{"id":"agricultural_and_environmental_engineering","name":"Agricultural and Environmental Engineering"},{"id":"civil_and_environmental_engineering","name":"Civil and Environmental Engineering"},{"id":"computer_engineering","name":"Computer Engineering"},{"id":"electrical_and_electronics_engineering","name":"Electrical and Electronics Engineering"},{"id":"industrial_and_production_engineering","name":"Industrial and Production Engineering"},{"id":"materials_and_metallurgical_engineering","name":"Materials and Metallurgical Engineering"},{"id":"mechanical_engineering","name":"Mechanical Engineering"},{"id":"mining_engineering","name":"Mining Engineering"}]},{"id":"sems","short":"SEMS","name":"School of Earth and Mineral Sciences","depts":[{"id":"applied_geology","name":"Applied Geology"},{"id":"applied_geophysics","name":"Applied Geophysics"},{"id":"marine_science_and_technology","name":"Marine Science and Technology"},{"id":"meteorology_and_climate_science","name":"Meteorology and Climate Science"},{"id":"remote_sensing_and_geoinformatics","name":"Remote Sensing and Geoinformatics"}]},{"id":"set","short":"SET","name":"School of Environmental Technology","depts":[{"id":"architecture","name":"Architecture"},{"id":"building_technology","name":"Building Technology"},{"id":"estate_management","name":"Estate Management"},{"id":"industrial_design","name":"Industrial Design"},{"id":"quantity_surveying","name":"Quantity Surveying"},{"id":"surveying_and_geoinformatics","name":"Surveying and Geoinformatics"},{"id":"urban_and_regional_planning","name":"Urban and Regional Planning"}]},{"id":"sos","short":"SOS","name":"School of Sciences","depts":[{"id":"biochemistry","name":"Biochemistry"},{"id":"biology","name":"Biology"},{"id":"biotechnology","name":"Biotechnology"},{"id":"chemistry","name":"Chemistry"},{"id":"mathematical_sciences","name":"Mathematical Sciences"},{"id":"physics","name":"Physics"}]},{"id":"soc","short":"SOC","name":"School of Computing","depts":[{"id":"computer_science","name":"Computer Science"},{"id":"cyber_security","name":"Cyber Security"},{"id":"information_technology","name":"Information Technology"},{"id":"software_engineering","name":"Software Engineering"}]},{"id":"shht","short":"SHHT","name":"School of Health and Health Technology","depts":[{"id":"anatomy","name":"Anatomy"},{"id":"biomedical_technology","name":"Biomedical Technology"},{"id":"medical_biochemistry","name":"Medical Biochemistry"},{"id":"physiology","name":"Physiology"}]},{"id":"smat","short":"SMAT","name":"School of Management Technology","depts":[{"id":"entrepreneurship_management_technology","name":"Entrepreneurship Management Technology"},{"id":"project_management_technology","name":"Project Management Technology"},{"id":"transport_management_technology","name":"Transport Management Technology"}]}],"levels":[{"id":"pre","name":"Pre-degree / UABS / JUPEB"},{"id":"100","name":"100 Level"},{"id":"200","name":"200 Level"},{"id":"300","name":"300 Level"},{"id":"400","name":"400 Level"},{"id":"500","name":"500 Level"},{"id":"pg","name":"Postgraduate (PGD / MSc / PhD)"}],"areas":[{"id":"south_gate","name":"South Gate"},{"id":"north_gate","name":"North Gate"},{"id":"aule","name":"Aule"},{"id":"oba_ile","name":"Oba-Ile"},{"id":"ijapo","name":"Ijapo Estate"},{"id":"alagbaka","name":"Alagbaka"},{"id":"oba_adesida","name":"Oba Adesida Road"},{"id":"oda","name":"Oda Road"},{"id":"ondo_road","name":"Ondo Road"},{"id":"other","name":"Another part of Akure"}],"exams":[{"id":"preparing","name":"Still preparing for JAMB"},{"id":"utme","name":"Written JAMB / UTME"},{"id":"post_utme","name":"Doing Post-UTME"},{"id":"predegree","name":"Applied for Pre-degree / UABS"},{"id":"waiting","name":"Waiting for admission"}],"years":{"min":1985,"max":2026},"statuses":[{"id":"student","title":"Current student","blurb":"Studying at FUTA right now.","school":"required","dept":"optional","extra":{"type":"level","label":"Your level","required":true}},{"id":"graduate","title":"Graduate","blurb":"Just finished and waiting for NYSC or convocation.","school":"required","dept":"optional","extra":{"type":"year","label":"Year you finished","required":true,"min":2024,"max":2026}},{"id":"corper","title":"Corper","blurb":"Serving your country (NYSC).","school":"required","dept":"optional","extra":{"type":"year","label":"Service year","required":true,"min":2025,"max":2026}},{"id":"alumni","title":"Alumni","blurb":"Graduated a while ago and back to relive it.","school":"required","dept":"optional","extra":{"type":"year","label":"Year you graduated","required":true,"min":1985,"max":2025}},{"id":"aspirant","title":"Aspirant","blurb":"Dreaming of FUTA. On the road to admission.","school":"optional","dept":"optional","extra":{"type":"exam","label":"Where are you now?","required":true},"schoolLabel":"School you want to join"},{"id":"akure","title":"Akure resident","blurb":"You live in Akure but you are not part of FUTA.","school":"none","dept":"none","extra":{"type":"area","label":"Where in Akure?","required":false}},{"id":"outsider","title":"Outsider","blurb":"Visiting from outside Akure. Just here for the vibes.","school":"none","dept":"none","extra":null}]}'::jsonb)
on conflict (key) do update set value = excluded.value;

create or replace function public.set_campus(p_status text, p_school text default null, p_dept text default null, p_extra text default null) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare u uuid := private.require_user(); o jsonb; st jsonb; sc jsonb; ex jsonb; res jsonb; sreq text; val text; t text; hit boolean;
begin
  select value into o from public.app_config where key = 'campus_options';
  if o is null then raise exception 'campus_options_missing (run 11_campus.sql)'; end if;
  select s into st from jsonb_array_elements(o -> 'statuses') s where s ->> 'id' = p_status;
  if st is null then raise exception 'bad_status'; end if;
  res := jsonb_build_object('status', p_status);
  sreq := st ->> 'school';
  if sreq <> 'none' then
    if nullif(btrim(p_school), '') is null then
      if sreq = 'required' then raise exception 'school_required'; end if;
    else
      select s into sc from jsonb_array_elements(o -> 'schools') s where s ->> 'id' = p_school;
      if sc is null then raise exception 'bad_school'; end if;
      res := res || jsonb_build_object('school', p_school);
      if nullif(btrim(p_dept), '') is not null then
        if not exists (select 1 from jsonb_array_elements(sc -> 'depts') x where x ->> 'id' = p_dept) then raise exception 'bad_dept'; end if;
        res := res || jsonb_build_object('dept', p_dept);
      end if;
    end if;
  end if;
  ex := st -> 'extra';
  if jsonb_typeof(ex) = 'object' then
    t := ex ->> 'type'; val := nullif(btrim(p_extra), '');
    if val is null then
      if coalesce((ex ->> 'required')::boolean, false) then raise exception 'extra_required'; end if;
    elsif t = 'year' then
      if val !~ '^[0-9]{4}$' or val::int < coalesce((ex ->> 'min')::int, (o #>> '{years,min}')::int) or val::int > coalesce((ex ->> 'max')::int, (o #>> '{years,max}')::int) then raise exception 'bad_extra'; end if;
      res := res || jsonb_build_object('year', val::int);
    else
      select exists (select 1 from jsonb_array_elements(o -> (case t when 'level' then 'levels' when 'area' then 'areas' else 'exams' end)) x where x ->> 'id' = val) into hit;
      if not hit then raise exception 'bad_extra'; end if;
      res := res || jsonb_build_object(t, val);
    end if;
  end if;
  update public.profiles set campus = res where id = u;
  return public.get_me();
end $$;

revoke execute on function public.set_campus(text, text, text, text) from public, anon;
grant execute on function public.set_campus(text, text, text, text) to authenticated;

-- ===================== 11_account.sql =====================
-- 11_account.sql — change username (phone Settings). Run in the Supabase SQL Editor AFTER 01_schema.sql. Safe to re-run.
-- Why a trigger: set_profile() (sign-up) can already rename a player. The rule "one rename per N days" lives in a trigger on profiles.username,
--   so EVERY path (change_username below, set_profile, any future RPC) obeys it, and re-running 01_schema.sql cannot remove it.
-- Rules:
--   • First name (sign-up, still not onboarded) is free and unlimited. After sign-up: one change per `account.username_cooldown_days` (default 30).
--   • Same format as sign-up: 3–20 lower-case letters, digits or _, not reserved, not taken (public.username_available).
--   • Every change is written to username_history (moderators can trace who used which name). Old chat lines / posts keep the name they were written with.
--   • Run by the SQL editor / moderator (no signed-in user) the cooldown is skipped, so you can still rename someone by hand.
-- Change the cooldown without code: insert into public.app_config(key,value) values ('account.username_cooldown_days','30') on conflict (key) do update set value = excluded.value;

create table if not exists public.username_history (
  id bigserial primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  old_name text not null,
  new_name text not null,
  changed_at timestamptz not null default now()
);
create index if not exists username_history_user_idx on public.username_history (user_id, changed_at desc);
alter table public.username_history enable row level security;          -- no client policy on purpose: only the server and you read it
revoke all on public.username_history from anon, authenticated;

create or replace function private.acct_cfg(p_key text, p_default bigint) returns bigint language sql stable as $$
  select coalesce((select (value #>> '{}')::bigint from public.app_config where key = 'account.' || p_key), p_default) $$;

-- the single place the rename rule is enforced
create or replace function private.username_guard() returns trigger
language plpgsql security definer set search_path = '' as $$
declare done boolean; last_at timestamptz; days int := private.acct_cfg('username_cooldown_days', 30);
begin
  select coalesce(onboarded, false) into done from public.private_profiles where id = new.id;
  if not coalesce(done, false) then return new; end if;                     -- still creating the character: free
  if auth.uid() is not null then                                            -- a signed-in player (not the SQL editor)
    select max(changed_at) into last_at from public.username_history where user_id = new.id;
    if last_at is not null and last_at + make_interval(days => days) > now() then
      raise exception 'username_cooldown:%', to_char((last_at + make_interval(days => days)) at time zone 'UTC', 'YYYY-MM-DD');
    end if;
  end if;
  insert into public.username_history (user_id, old_name, new_name) values (new.id, old.username, new.username);
  return new;
end $$;
drop trigger if exists username_guard on public.profiles;
create trigger username_guard before update of username on public.profiles
  for each row when (old.username is not null and new.username is distinct from old.username)
  execute function private.username_guard();

create or replace function public.get_username_status() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare u uuid := private.require_user(); days int := private.acct_cfg('username_cooldown_days', 30); last_at timestamptz; nxt timestamptz; name text;
begin
  select username into name from public.profiles where id = u;
  select max(changed_at) into last_at from public.username_history where user_id = u;
  nxt := case when last_at is null then null else last_at + make_interval(days => days) end;
  return jsonb_build_object('username', name, 'can_change', nxt is null or nxt <= now(), 'next_change_at', case when nxt > now() then nxt end, 'cooldown_days', days);
end $$;

create or replace function public.change_username(p_name text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare u uuid := private.require_user(); n text := lower(btrim(coalesce(p_name, ''))); cur text; done boolean; chk jsonb;
begin
  select p.username, coalesce(q.onboarded, false) into cur, done from public.profiles p join public.private_profiles q on q.id = p.id where p.id = u;
  if cur is null or not done then raise exception 'finish_sign_up'; end if;  -- before the character is finished, sign-up sets the name
  if n = cur then raise exception 'same_name'; end if;
  chk := public.username_available(n);
  if (chk ->> 'available')::boolean is not true then raise exception '%', chk ->> 'reason'; end if;
  begin
    update public.profiles set username = n where id = u;                  -- the trigger applies the cooldown and writes the history
  exception when unique_violation then raise exception 'That name is taken.'; end;
  return public.get_me();
end $$;

revoke execute on function public.get_username_status(), public.change_username(text) from public, anon;
grant execute on function public.get_username_status(), public.change_username(text) to authenticated;

-- ===================== 12_profile.sql =====================
-- ==========================================================================
-- 12_profile.sql — public PLAYER PROFILE (what the phone's profile view shows).   Run AFTER 01_schema.sql.
-- Better after 05 (feed) and 06/07/08 (property, cars, accessories) too — missing tables are skipped, not an error.
-- Re-run it whenever you re-run 01 (01 revokes grants).  Safe to re-run.  Test: supabase/tests/run.sh (tests/test_profile.sql).
--
-- get_profile(p_user) returns ONE json object with only what is meant to be seen by other players:
--   id, username, gender ('male'|'female'), avatar (the saved look), joined ('YYYY-MM'), start (life story id), me, relation
--   (none | waved | incoming | friends), friends (count), properties / cars / accessories (id, level, since or slot),
--   latest_post (their feed post from the last 24 h, if any).
-- It NEVER returns: age / date of birth, email, wallet or bank balance, prices paid, ledger, where they are standing, blocks.
-- Rules: you must be signed in; you can always open your own; a blocked pair, someone who hasn't finished sign-up, or the other
-- age group (teen vs adult — same rule as chat search) all answer the same 'not_found' so nothing leaks.
-- ==========================================================================
create or replace function public.get_profile(p_user uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  u uuid := private.require_user(); p public.profiles; pp public.private_profiles; rel text := 'none'; w record;
  props jsonb := '[]'::jsonb; cars jsonb := '[]'::jsonb; acc jsonb := '[]'::jsonb; post jsonb := null; nfriends int := 0; frame text;
begin
  select * into p from public.profiles where id = p_user;
  if not found or p.username is null then raise exception 'not_found'; end if;
  select * into pp from public.private_profiles where id = p_user;
  if p_user <> u then
    if public.is_blocked_between(u, p_user) or not private.same_age_group(u, p_user) then raise exception 'not_found'; end if;
    select ww.status, ww.from_user into w from public.waves ww
      where (ww.from_user = u and ww.to_user = p_user) or (ww.from_user = p_user and ww.to_user = u)
      order by (ww.status = 'accepted') desc, ww.id desc limit 1;
    rel := case when w.status = 'accepted' then 'friends' when w.status = 'pending' and w.from_user = u then 'waved' when w.status = 'pending' then 'incoming' else 'none' end;
  end if;

  select count(*) into nfriends from public.waves x where x.status = 'accepted' and p_user in (x.from_user, x.to_user);

  if to_regclass('public.property_owned') is not null then
    select coalesce(jsonb_agg(jsonb_build_object('id', o.prop_id, 'level', c.level, 'since', to_char(o.bought_at at time zone 'Africa/Lagos', 'YYYY-MM-DD')) order by c.level desc, o.bought_at), '[]'::jsonb)
      into props from public.property_owned o join public.property_catalog c on c.id = o.prop_id where o.user_id = p_user;
  end if;
  if to_regclass('public.car_owned') is not null then
    select coalesce(jsonb_agg(jsonb_build_object('id', o.car_id, 'level', c.level, 'since', to_char(o.bought_at at time zone 'Africa/Lagos', 'YYYY-MM-DD')) order by c.level desc, o.bought_at), '[]'::jsonb)
      into cars from public.car_owned o join public.car_catalog c on c.id = o.car_id where o.user_id = p_user;
  end if;
  if to_regclass('public.acc_owned') is not null then
    select coalesce(jsonb_agg(jsonb_build_object('id', o.item_id, 'level', c.level, 'slot', c.slot) order by c.level desc, o.bought_at), '[]'::jsonb)
      into acc from public.acc_owned o join public.acc_catalog c on c.id = o.item_id where o.user_id = p_user;
  end if;
  if to_regclass('public.feed_posts') is not null then
    select jsonb_build_object('body', f.body, 'bg', f.bg, 'at', f.created_at) into post
      from public.feed_posts f where f.user_id = p_user and f.expires_at > now() order by f.id desc limit 1;
  end if;

  frame := p.avatar_json -> 'body' ->> 'frame';
  return jsonb_build_object(
    'id', p.id, 'username', p.username, 'avatar', p.avatar_json,
    'gender', case frame when 'f' then 'female' when 'm' then 'male' else null end,
    'joined', to_char(p.created_at at time zone 'Africa/Lagos', 'YYYY-MM'), 'start', pp.life_start, 'campus', p.campus,
    'me', p_user = u, 'relation', rel, 'friends', nfriends,
    'properties', props, 'cars', cars, 'accessories', acc, 'latest_post', post);
end $$;

revoke execute on function public.get_profile(uuid) from public, anon;
grant execute on function public.get_profile(uuid) to authenticated;

-- ===================== 13_vault.sql =====================
-- ============================================================================
-- FUTA World — Bank VAULT (hard mode).  Run AFTER 01_schema.sql and 03_activities.sql.  Design + economy: docs/VAULT.md
--
-- What this file does
--   * ONE vault (id 'heritage') inside the Bank. Holds a hidden random ₦7m–₦14m. Browsers can NEVER read the amount.
--   * A robbery = 3 random puzzles (from a pool of 6) that share ONE countdown. The server picks the puzzles and keeps the answers.
--     The browser only sees clues; guessing/light puzzles are answered one step at a time.
--   * Win: the whole amount goes into the player's POCKET (ledger kind 'vault_heist'); the vault is empty and refills after 20 minutes
--     with a NEW random amount. The winner gets a personal cooldown (3 h) so one person cannot farm every refill.
--   * Fail / time out: adults are ARRESTED (public.jail, 3 minutes, see 01_schema.sql). The vault unlocks again, still full.
--     Under-18 accounts (private_profiles.is_teen) play the "Vault Challenge": same puzzles, NO arrest, only a cooldown.
--   * While one player is robbing, the vault is locked for everyone else ("robbery in progress").
--   * Everything is lazy: refills and stale locks are settled whenever anyone calls an RPC, so no cron job is needed.
--   * All numbers live in app_config key 'vault' (below). Change them there, not in code.
-- NOTE (same as 01_schema.sql): the client reports which building it is in, so a modified client could lie about its venue.
-- That is acceptable for GAME money only.
-- ============================================================================

-- ------------------------------------------------------------------ config
insert into public.app_config (key, value) values ('vault', jsonb_build_object(
  'building_id', 'building_mv0q4b841p',      -- the Bank's id on the map (public/world/index.html, PTW_DATA)
  'seconds', 120,                             -- ONE countdown shared by the 3 puzzles
  'grace', 3,                                 -- extra seconds allowed for network lag
  'strikes', 2,                               -- mistakes allowed per puzzle (wires, pattern, lights, match)
  'lock_tries', 3,                            -- submissions allowed on the code lock
  'cracker_guesses', 8,                       -- guesses allowed on the safe cracker
  'refill_secs', 1200,                        -- vault refills 20 minutes after a successful robbery
  'cooldown_secs', 10800,                     -- personal cooldown after a successful robbery (3 h)
  'jail_secs', 180,                           -- arrest = 3 minutes
  'teen_fail_cooldown_secs', 600              -- Vault Challenge (under 18): wait this long after a failed try
)) on conflict (key) do nothing;

create or replace function private.vcfg(p_key text, p_default numeric) returns numeric
language sql stable security definer set search_path = '' as $$
  select coalesce((select (value ->> p_key)::numeric from public.app_config where key = 'vault'), p_default) $$;

-- ------------------------------------------------------------------ tables (RLS on, NO policies, NO grants: only the functions below touch them)
create table if not exists public.vault_state (
  id text primary key, amount bigint not null default 0,
  status text not null default 'full' check (status in ('full', 'locked', 'empty')),
  locked_by uuid references auth.users(id) on delete set null, lock_expires timestamptz, refill_at timestamptz, attempt_id bigint
);
create table if not exists public.vault_attempts (
  id bigserial primary key, user_id uuid not null references auth.users(id) on delete cascade,
  started_at timestamptz not null default now(), deadline timestamptz not null, step int not null default 0,
  puzzles jsonb not null,                                   -- [{kind, st}] — st holds the SECRET answers
  status text not null default 'active' check (status in ('active', 'won', 'lost', 'expired')),
  teen boolean not null default false, payout bigint
);
create index if not exists vault_attempts_user_idx on public.vault_attempts (user_id, id desc);
create table if not exists public.vault_cooldowns (
  user_id uuid primary key references auth.users(id) on delete cascade, until timestamptz not null, reason text
);
alter table public.vault_state enable row level security;
alter table public.vault_attempts enable row level security;
alter table public.vault_cooldowns enable row level security;
revoke all on public.vault_state, public.vault_attempts, public.vault_cooldowns from anon, authenticated;
revoke all on sequence public.vault_attempts_id_seq from anon, authenticated;

-- ------------------------------------------------------------------ small helpers
create or replace function private.vri(lo int, hi int) returns int language sql volatile as $$ select lo + floor(random() * (hi - lo + 1))::int $$;
create or replace function private.vpick(a text[]) returns text language sql volatile as $$ select a[1 + floor(random() * cardinality(a))::int] $$;

-- How much is in the vault when it refills: mostly medium, sometimes huge (7m–14m, whole thousands)
create or replace function private.vault_roll() returns bigint language plpgsql volatile as $$
declare r float := random(); lo bigint; hi bigint;
begin
  if r < 0.60 then lo := 7000000; hi := 10000000; elsif r < 0.90 then lo := 10000000; hi := 12500000; else lo := 12500000; hi := 14000000; end if;
  return ((lo + floor(random() * (hi - lo + 1))::bigint) / 1000) * 1000;
end $$;

insert into public.vault_state (id, amount, status) values ('heritage', private.vault_roll(), 'full') on conflict (id) do nothing;

-- ============================================================================ PUZZLE 1 — code lock (three 3-digit codes with clues)
create or replace function private.vdig(n int, pos int) returns int language sql immutable as $$
  select (n / (case pos when 1 then 100 when 2 then 10 else 1 end)) % 10 $$;

create or replace function private.vclue_ok(n int, c jsonb) returns boolean language plpgsql immutable as $$
declare t text := c ->> 't'; d1 int := n / 100; d2 int := (n / 10) % 10; d3 int := n % 10; x int; y int;
begin
  if t = 'par' then return (private.vdig(n, (c ->> 'pos')::int) % 2 = 0) = ((c ->> 'v') = 'even');
  elsif t = 'sum' then return d1 + d2 + d3 = (c ->> 'v')::int;
  elsif t = 'cmp' then x := private.vdig(n, (c ->> 'a')::int); y := private.vdig(n, (c ->> 'b')::int);
    return (case when x > y then 'gt' when x < y then 'lt' else 'eq' end) = c ->> 'v';
  elsif t = 'has' then x := (c ->> 'd')::int; return (d1 = x or d2 = x or d3 = x) = ((c ->> 'v')::boolean);
  elsif t = 'distinct' then return (d1 <> d2 and d2 <> d3 and d1 <> d3) = ((c ->> 'v')::boolean);
  elsif t = 'div' then return n % (c ->> 'n')::int = 0;
  elsif t = 'max' then return greatest(d1, d2, d3) = (c ->> 'v')::int;
  elsif t = 'dig' then return private.vdig(n, (c ->> 'pos')::int) = (c ->> 'v')::int;
  elsif t = 'pair' then return private.vdig(n, (c ->> 'a')::int) + private.vdig(n, (c ->> 'b')::int) = (c ->> 'v')::int;
  elsif t = 'prod' then return d1 * d2 * d3 = (c ->> 'v')::int;
  elsif t = 'rng' then return n between (c ->> 'lo')::int and (c ->> 'hi')::int;
  end if;
  return false;
end $$;

create or replace function private.vclue_text(c jsonb) returns text language plpgsql immutable as $$
declare t text := c ->> 't'; ord text[] := array['first', 'middle', 'last']; v text := c ->> 'v';
begin
  if t = 'par' then return 'The ' || ord[(c ->> 'pos')::int] || ' digit is ' || v || '.';
  elsif t = 'sum' then return 'The three digits add up to ' || v || '.';
  elsif t = 'cmp' then return 'The ' || ord[(c ->> 'a')::int] || ' digit is ' || case v when 'gt' then 'bigger than' when 'lt' then 'smaller than' else 'equal to' end || ' the ' || ord[(c ->> 'b')::int] || ' digit.';
  elsif t = 'has' then return case when v = 'true' then 'It contains a ' || (c ->> 'd') || '.' else 'It has no ' || (c ->> 'd') || ' in it.' end;
  elsif t = 'distinct' then return case when v = 'true' then 'All three digits are different.' else 'At least two digits are the same.' end;
  elsif t = 'div' then return 'It divides exactly by ' || (c ->> 'n') || '.';
  elsif t = 'max' then return 'The biggest digit is ' || v || '.';
  elsif t = 'dig' then return 'The ' || ord[(c ->> 'pos')::int] || ' digit is ' || v || '.';
  elsif t = 'pair' then return 'The ' || ord[(c ->> 'a')::int] || ' and ' || ord[(c ->> 'b')::int] || ' digits add up to ' || v || '.';
  elsif t = 'prod' then return 'Multiply the three digits and you get ' || v || '.';
  elsif t = 'rng' then return 'It is between ' || (c ->> 'lo') || ' and ' || (c ->> 'hi') || '.';
  end if;
  return '';
end $$;

create or replace function private.vclue_for(n int) returns jsonb language plpgsql volatile as $$
declare k int := private.vri(1, 11); p int; a int; b int; d int; divs int[] := '{}'; x int;
begin
  if k = 1 then p := private.vri(1, 3); return jsonb_build_object('t', 'par', 'pos', p, 'v', case when private.vdig(n, p) % 2 = 0 then 'even' else 'odd' end);
  elsif k = 2 then return jsonb_build_object('t', 'sum', 'v', n / 100 + (n / 10) % 10 + n % 10);
  elsif k = 3 then a := private.vri(1, 3); b := private.vri(1, 3);
    if a = b or private.vdig(n, a) = private.vdig(n, b) then return null; end if;
    return jsonb_build_object('t', 'cmp', 'a', a, 'b', b, 'v', case when private.vdig(n, a) > private.vdig(n, b) then 'gt' else 'lt' end);
  elsif k = 4 then d := case when random() < 0.5 then private.vdig(n, private.vri(1, 3)) else private.vri(0, 9) end;
    return jsonb_build_object('t', 'has', 'd', d, 'v', (n / 100 = d or (n / 10) % 10 = d or n % 10 = d));
  elsif k = 5 then return jsonb_build_object('t', 'distinct', 'v', (n / 100 <> (n / 10) % 10 and (n / 10) % 10 <> n % 10 and n / 100 <> n % 10));
  elsif k = 6 then
    foreach x in array array[3, 4, 6, 7, 9, 11, 13] loop if n % x = 0 then divs := divs || x; end if; end loop;
    if cardinality(divs) = 0 then return null; end if;
    return jsonb_build_object('t', 'div', 'n', divs[private.vri(1, cardinality(divs))]);
  elsif k = 7 then return jsonb_build_object('t', 'max', 'v', greatest(n / 100, (n / 10) % 10, n % 10));
  elsif k = 8 or k = 9 then a := private.vri(1, 3); b := 1 + (a + private.vri(0, 1)) % 3;
    return jsonb_build_object('t', 'pair', 'a', least(a, b), 'b', greatest(a, b), 'v', private.vdig(n, a) + private.vdig(n, b));
  elsif k = 10 then return jsonb_build_object('t', 'prod', 'v', (n / 100) * ((n / 10) % 10) * (n % 10));
  else return jsonb_build_object('t', 'rng', 'lo', greatest(100, n - private.vri(40, 220)), 'hi', least(999, n + private.vri(40, 220)));
  end if;
end $$;

create or replace function private.vclue_count(clues jsonb) returns int language sql stable as $$
  select count(*)::int from generate_series(100, 999) g(n)
   where not exists (select 1 from jsonb_array_elements(clues) q where not private.vclue_ok(g.n, q)) $$;

-- one code + clues that single it out (greedy: of a few candidate clues keep the one that narrows things most; pin a digit as a last resort)
create or replace function private.vgen_code(p_code int, out clues jsonb) language plpgsql volatile as $$
declare cnt int := 900; best jsonb; bestc int; c jsonb; cc int; i int; pos int;
begin
  clues := '[]'::jsonb;
  loop
    best := null; bestc := 100000;
    if jsonb_array_length(clues) < 5 then
      for i in 1..6 loop
        c := private.vclue_for(p_code);
        if c is null or clues @> jsonb_build_array(c) then continue; end if;
        cc := private.vclue_count(clues || jsonb_build_array(c));
        if cc < bestc or (cc = bestc and random() < 0.5) then best := c; bestc := cc; end if;
      end loop;
    end if;
    if best is null then                                         -- after 5 clues: pin one digit so we always finish
      pos := private.vri(1, 3); best := jsonb_build_object('t', 'dig', 'pos', pos, 'v', private.vdig(p_code, pos));
      if clues @> jsonb_build_array(best) then continue; end if;
    end if;
    clues := clues || jsonb_build_array(best); cnt := private.vclue_count(clues);
    exit when cnt = 1 and jsonb_array_length(clues) >= 3;
  end loop;
end $$;

create or replace function private.vgen_lock() returns jsonb language plpgsql volatile as $$
declare codes int[] := '{}'; cl jsonb := '[]'::jsonb; n int; i int;
begin
  while cardinality(codes) < 3 loop n := private.vri(100, 999); if not (n = any (codes)) then codes := codes || n; end if; end loop;
  for i in 1..3 loop cl := cl || jsonb_build_array(private.vgen_code(codes[i])); end loop;
  return jsonb_build_object('codes', to_jsonb(codes), 'clues', cl, 'tries', private.vcfg('lock_tries', 3)::int, 'right', 'null'::jsonb);
end $$;

-- ============================================================================ PUZZLE 2 — safe cracker (4-digit code, hot/cold feedback)
create or replace function private.vgen_cracker() returns jsonb language sql volatile as $$
  select jsonb_build_object('secret', (select string_agg(d::text, '') from (select d, random() as r from generate_series(0, 9) d order by r limit 4) s),
                            'guesses', '[]'::jsonb, 'max', private.vcfg('cracker_guesses', 8)::int) $$;

-- ============================================================================ PUZZLE 3 — wire cutting (rule card)
create or replace function private.vgen_wires() returns jsonb language plpgsql volatile as $$
declare cols text[] := array['red', 'blue', 'yellow', 'green', 'white', 'black']; wires text[]; i int; j int; tries int := 0;
  subj text[]; rl jsonb; rules jsonb; s text; y text; t text; cnt int; pass boolean; cut int[]; card text[]; ordk int; dir text; oc text[]; a text; b text;
  sol int[]; line text;
begin
  loop
    tries := tries + 1; rules := '[]'::jsonb; cut := '{}'; card := '{}';
    wires := array(select cols[1 + floor(random() * 6)::int] from generate_series(1, 6));
    continue when (select count(distinct w) from unnest(wires) w) < 4;
    subj := array(select w from (select distinct w from unnest(wires) w) d order by random() limit 3);
    for i in 1..3 loop
      s := subj[i]; y := cols[1 + floor(random() * 6)::int]; if y = s then y := cols[1 + (array_position(cols, s)) % 6]; end if;
      t := (array['even', 'odd', 'many', 'none'])[1 + floor(random() * 4)::int];
      select count(*) into cnt from unnest(wires) w where w = y;
      pass := case t when 'even' then cnt % 2 = 0 when 'odd' then cnt % 2 = 1 when 'many' then cnt >= 2 else cnt = 0 end;
      line := 'Cut ' || upper(s) || ' wires only if ' || case t
        when 'even' then 'there is an even number of ' || upper(y) || ' wires (zero counts as even).'
        when 'odd' then 'there is an odd number of ' || upper(y) || ' wires.'
        when 'many' then 'there are 2 or more ' || upper(y) || ' wires.'
        else 'there is no ' || upper(y) || ' wire at all.' end;
      card := card || line;
      if pass then for j in 1..6 loop if wires[j] = s then cut := cut || (j - 1); end if; end loop; end if;
    end loop;
    card := card || 'Leave every other colour alone. Count wires as they are on the panel now.'::text;
    -- order rule
    ordk := private.vri(1, 4);
    if ordk = 1 then dir := 'asc'; card := card || 'Cut from left to right.'::text;
    elsif ordk = 2 then dir := 'desc'; card := card || 'Cut from right to left.'::text;
    elsif ordk = 3 then
      a := cols[1 + floor(random() * 6)::int]; b := cols[1 + (array_position(cols, a)) % 6];
      select case when (select count(*) from unnest(wires) w where w = a) > (select count(*) from unnest(wires) w where w = b) then 'desc' else 'asc' end into dir;
      card := card || ('If there are more ' || upper(a) || ' wires than ' || upper(b) || ' wires, cut from right to left. Otherwise cut from left to right.')::text;
    else dir := 'colour'; oc := array(select x from unnest(subj) x order by random());
      card := card || ('Cut by colour: ' || array_to_string(array(select upper(x) from unnest(oc) x), ', then ') || '. Wires of the same colour go left to right.')::text;
    end if;
    if dir = 'asc' then sol := array(select x from unnest(cut) x order by x);
    elsif dir = 'desc' then sol := array(select x from unnest(cut) x order by x desc);
    else sol := array(select x from unnest(cut) x order by array_position(oc, wires[x + 1]), x); end if;
    exit when (cardinality(sol) between 2 and 5) or tries > 60;
  end loop;
  return jsonb_build_object('wires', to_jsonb(wires), 'card', to_jsonb(card), 'sol', to_jsonb(sol), 'cut', '[]'::jsonb, 'strikes', 0);
end $$;

-- ============================================================================ PUZZLE 4 — pattern (3 rounds in a row)
-- options builder: the right answer + up to 3 wrong ones from `cands`, shuffled; returns {options:[..], ans:int}
create or replace function private.vopts(p_right text, p_cands text[]) returns jsonb language plpgsql volatile as $$
declare opts text[]; c text; n int := 0; i int;
begin
  opts := array[p_right];
  foreach c in array p_cands loop
    exit when cardinality(opts) >= 4;
    if c is not null and not (c = any (opts)) then opts := opts || c; end if;
  end loop;
  i := 0;
  while cardinality(opts) < 4 and i < 50 loop           -- pad numeric answers if the candidates ran short
    i := i + 1;
    if p_right ~ '^-?[0-9]+$' then c := (p_right::int + private.vri(-9, 9))::text; else c := null; end if;
    if c is not null and not (c = any (opts)) then opts := opts || c; end if;
  end loop;
  opts := array(select x from unnest(opts) x order by random());
  return jsonb_build_object('options', to_jsonb(opts), 'ans', array_position(opts, p_right) - 1);
end $$;

create or replace function private.vgen_pattern_round() returns jsonb language plpgsql volatile as $$
declare f int := private.vri(1, 10); s int[]; a int; b int; d int; p int; q int; r int; kk int; off int; c int; i int; series text[]; right_ text; cands text[]; o jsonb;
  shp text[]; col text[]; step int; ang int[]; angs int[] := array[0, 45, 90, 135, 180, 225, 270, 315]; tok text;
begin
  if f = 1 then                                          -- arithmetic
    a := private.vri(2, 15); d := private.vri(2, 9); series := array(select (a + d * k)::text from generate_series(0, 4) k); right_ := (a + d * 5)::text;
    cands := array[(a + d * 5 + d)::text, (a + d * 5 - d)::text, (a + d * 5 + 1)::text, (a + d * 5 - 1)::text, (a + d * 4 + 1)::text];
  elsif f = 2 then                                       -- geometric
    a := private.vri(1, 4); r := private.vri(2, 3); series := array(select (a * r ^ k)::bigint::text from generate_series(0, 4) k); right_ := (a * r ^ 5)::bigint::text;
    cands := array[((a * r ^ 4) * 2 - (a * r ^ 3))::bigint::text, ((a * r ^ 4) * (r + 1))::bigint::text, ((a * r ^ 5) + a)::bigint::text, ((a * r ^ 5) - r)::bigint::text];
  elsif f = 3 then                                       -- +p, -q, +p, -q ...
    a := private.vri(5, 30); p := private.vri(5, 12); q := private.vri(1, p - 1);
    s := array[a, a + p, a + p - q, a + 2 * p - q, a + 2 * p - 2 * q]; series := array(select x::text from unnest(s) x); right_ := (a + 3 * p - 2 * q)::text;
    cands := array[(s[5] - q)::text, (s[5] + q)::text, (s[5] + p + q)::text, (a + 3 * p - 2 * q + 1)::text, (a + 3 * p - 2 * q - 1)::text];
  elsif f = 4 then                                       -- growing steps k, 2k, 3k, 4k, then 5k
    a := private.vri(1, 9); kk := private.vri(1, 3); s := array[a, a + kk, a + 3 * kk, a + 6 * kk, a + 10 * kk]; series := array(select x::text from unnest(s) x); right_ := (a + 15 * kk)::text;
    cands := array[(a + 14 * kk)::text, (a + 16 * kk)::text, (a + 15 * kk + 1)::text, (a + 10 * kk + 4 * kk)::text, (a + 10 * kk + 6 * kk)::text];
  elsif f = 5 then                                       -- squares plus a constant
    off := private.vri(1, 4); c := private.vri(0, 9); series := array(select ((off + k) ^ 2 + c)::bigint::text from generate_series(0, 4) k); right_ := ((off + 5) ^ 2 + c)::bigint::text;
    cands := array[(((off + 5) ^ 2 + c)::bigint - 2)::text, (((off + 5) ^ 2 + c)::bigint + 2)::text, (((off + 4) ^ 2 + c)::bigint + (2 * (off + 4)))::text, (((off + 5) ^ 2 + c)::bigint + off + 5)::text];
  elsif f = 6 then                                       -- each term = the two before it
    a := private.vri(1, 5); b := private.vri(2, 7); s := array[a, b, a + b, a + 2 * b, 2 * a + 3 * b]; series := array(select x::text from unnest(s) x); right_ := (s[4] + s[5])::text;
    cands := array[(s[5] * 2)::text, (s[4] + s[5] + 1)::text, (s[4] + s[5] - 1)::text, (s[5] + s[3])::text, (s[5] + s[4] + 3)::text];
  elsif f = 7 then                                       -- two interleaved sequences
    a := private.vri(1, 9); b := private.vri(10, 40); p := private.vri(2, 6); q := private.vri(2, 9);
    s := array[a, b, a + p, b + q, a + 2 * p]; series := array(select x::text from unnest(s) x); right_ := (b + 2 * q)::text;
    cands := array[(a + 3 * p)::text, (b + q + p)::text, (b + 2 * q + q)::text, (b + 2 * q - 1)::text, (b + 2 * q + p)::text];
  elsif f = 8 then                                       -- shapes: shape cycles every 3, colour flips every step
    shp := array(select x from unnest(array['tri', 'circle', 'square', 'star', 'diamond']) x order by random() limit 3); col := array(select x from unnest(array['red', 'blue', 'green']) x order by random() limit 2);
    series := array(select shp[1 + k % 3] || ':' || col[1 + k % 2] from generate_series(0, 4) k); right_ := shp[1 + 5 % 3] || ':' || col[1 + 5 % 2];
    cands := array[shp[1 + 5 % 3] || ':' || col[1], shp[1] || ':' || col[1 + 5 % 2], shp[2] || ':' || col[1 + 5 % 2], shp[1 + 5 % 3] || ':' || (array['red', 'blue', 'green'])[1 + (private.vri(0, 2))], shp[2] || ':' || col[1]];
  elsif f = 9 then                                       -- an arrow that turns by a fixed angle
    step := (array[45, 90, 135, 270])[private.vri(1, 4)]; a := private.vri(0, 7) * 45;
    series := array(select 'arrow:' || ((a + step * k) % 360) from generate_series(0, 4) k); right_ := 'arrow:' || ((a + step * 5) % 360);
    cands := array(select 'arrow:' || x from unnest(angs) x order by random());
  else                                                   -- dots: +1, +2, +3, +4 then +5
    a := private.vri(1, 3); s := array[a, a + 1, a + 3, a + 6, a + 10]; series := array(select 'dots:' || x from unnest(s) x); right_ := 'dots:' || (a + 15);
    cands := array['dots:' || (a + 14), 'dots:' || (a + 16), 'dots:' || (a + 13), 'dots:' || (a + 10 + 4)];
  end if;
  o := private.vopts(right_, cands);
  return jsonb_build_object('series', to_jsonb(series), 'options', o -> 'options', 'ans', o -> 'ans');
end $$;

create or replace function private.vgen_pattern() returns jsonb language sql volatile as $$
  select jsonb_build_object('round', 1, 'strikes', 0) || private.vgen_pattern_round() $$;

-- ============================================================================ PUZZLE 5 — light memory (sequence grows each round)
create or replace function private.vgen_lights() returns jsonb language sql volatile as $$
  select jsonb_build_object('seq', to_jsonb(array(select (array['red', 'green', 'blue', 'yellow'])[1 + floor(random() * 4)::int] from generate_series(1, 3))),
                            'pos', 0, 'shown', 0, 'round', 1, 'strikes', 0) $$;

-- ============================================================================ PUZZLE 6 — fingerprint / key card match
create or replace function private.vmatch_text(p_variant text, k text, v text, neg boolean) returns text language sql immutable as $$
  select case
    when p_variant = 'print' and k = 'pattern' then case when neg then 'The pattern is NOT a ' || v || '.' else 'The pattern is a ' || v || '.' end
    when p_variant = 'print' and k = 'ridge' then case when neg then 'The ridges are not ' || v || '.' else 'The ridges are ' || v || '.' end
    when p_variant = 'print' and k = 'scar' then case when v = 'scarred' then case when neg then 'It has no scar.' else 'It has a scar.' end else case when neg then 'It has a scar.' else 'It has no scar.' end end
    when p_variant = 'print' and k = 'lean' then case when neg then 'It does not lean ' || v || '.' else 'It leans ' || v || '.' end
    when p_variant = 'card' and k = 'stripe' then case when neg then 'The stripe is not ' || v || '.' else 'The stripe is ' || v || '.' end
    when p_variant = 'card' and k = 'chip' then case when neg then 'The chip is not ' || v || '.' else 'The chip is ' || v || '.' end
    when p_variant = 'card' and k = 'notches' then case when neg then 'It does not have ' || v || case when v = '1' then ' notch.' else ' notches.' end else 'It has ' || v || case when v = '1' then ' notch.' else ' notches.' end end
    when p_variant = 'card' and k = 'holo' then case when v = 'yes' then case when neg then 'There is no hologram star.' else 'It has the hologram star.' end else case when neg then 'It has the hologram star.' else 'There is no hologram star.' end end
    else '' end $$;

create or replace function private.vmatch_count(p_items jsonb, p_clues jsonb) returns int language plpgsql immutable as $$
declare cnt int := 0; i int; ok boolean; c jsonb;
begin
  for i in 0..jsonb_array_length(p_items) - 1 loop
    ok := true;
    for c in select * from jsonb_array_elements(p_clues) loop
      if (c ->> 'neg')::boolean then if p_items -> i ->> (c ->> 'k') = c ->> 'v' then ok := false; end if;
      else if p_items -> i ->> (c ->> 'k') <> c ->> 'v' then ok := false; end if; end if;
    end loop;
    if ok then cnt := cnt + 1; end if;
  end loop;
  return cnt;
end $$;

create or replace function private.vgen_match() returns jsonb language plpgsql volatile as $$
declare variant text := (array['print', 'card'])[private.vri(1, 2)]; spec jsonb; keys text[]; items jsonb := '[]'::jsonb; it jsonb; k text; vals jsonb; target int;
  clues jsonb := '[]'::jsonb; texts text[] := '{}'; v text; w text; neg boolean; cl jsonb; best jsonb; bestc int; cc int; i int; cnt int := 6; guard int := 0;
begin
  spec := case variant when 'print' then '{"pattern":["loop","whorl","arch","double"],"ridge":["fine","coarse"],"scar":["clean","scarred"],"lean":["left","right"]}'::jsonb
                       else '{"stripe":["red","blue","green","gold"],"chip":["round","square","triangle"],"notches":["1","2","3","4"],"holo":["yes","no"]}'::jsonb end;
  keys := array(select jsonb_object_keys(spec));
  while jsonb_array_length(items) < 6 loop
    it := '{}'::jsonb;
    foreach k in array keys loop vals := spec -> k; it := it || jsonb_build_object(k, vals ->> private.vri(0, jsonb_array_length(vals) - 1)); end loop;
    if not items @> jsonb_build_array(it) then items := items || jsonb_build_array(it); end if;
  end loop;
  target := private.vri(0, 5);
  loop
    guard := guard + 1; best := null; bestc := 100;
    for i in 1..5 loop                                   -- greedy: of a few random true clues keep the one that rules out the most items
      k := keys[private.vri(1, cardinality(keys))]; vals := spec -> k; v := items -> target ->> k;
      neg := jsonb_array_length(vals) > 2 and random() < 0.5;
      if neg then loop w := vals ->> private.vri(0, jsonb_array_length(vals) - 1); exit when w <> v; end loop; else w := v; end if;
      cl := jsonb_build_object('k', k, 'v', case when neg then w else v end, 'neg', neg);
      if clues @> jsonb_build_array(cl) then continue; end if;
      cc := private.vmatch_count(items, clues || jsonb_build_array(cl));
      if cc < bestc or (cc = bestc and random() < 0.5) then best := cl; bestc := cc; end if;
    end loop;
    if best is not null then
      clues := clues || jsonb_build_array(best); cnt := bestc;
      texts := texts || private.vmatch_text(variant, best ->> 'k', best ->> 'v', (best ->> 'neg')::boolean);
    end if;
    exit when (cnt = 1 and jsonb_array_length(clues) >= 3) or guard > 40;
  end loop;
  return jsonb_build_object('variant', variant, 'items', items, 'target', target, 'clues', to_jsonb(texts), 'defs', clues, 'eliminated', '[]'::jsonb, 'strikes', 0);
end $$;

-- ============================================================================ dispatch: generate / show / step
create or replace function private.vgen(p_kind text) returns jsonb language plpgsql volatile as $$
begin
  return case p_kind when 'lock' then private.vgen_lock() when 'cracker' then private.vgen_cracker() when 'wires' then private.vgen_wires()
    when 'pattern' then private.vgen_pattern() when 'lights' then private.vgen_lights() when 'match' then private.vgen_match() end;
end $$;

-- what the browser may see (NEVER secrets)
create or replace function private.vview(p_kind text, st jsonb) returns jsonb language plpgsql stable as $$
declare mx int := private.vcfg('strikes', 2)::int; out jsonb; i int;
begin
  if p_kind = 'lock' then
    return jsonb_build_object('kind', 'lock', 'title', 'Code lock', 'intro', 'Three codes. Each clue is true. Enter all three.',
      'dials', (select jsonb_agg(jsonb_build_object('label', chr(64 + g.i::int), 'clues', (select jsonb_agg(private.vclue_text(c)) from jsonb_array_elements(st -> 'clues' -> (g.i::int - 1)) c)) order by g.i) from generate_series(1, 3) g(i)),
      'triesLeft', (st ->> 'tries')::int, 'right', st -> 'right');
  elsif p_kind = 'cracker' then
    return jsonb_build_object('kind', 'cracker', 'title', 'Safe cracker', 'intro', 'Find the 4-digit code. The safe tells you how close each guess is.',
      'digits', 4, 'max', (st ->> 'max')::int, 'left', (st ->> 'max')::int - jsonb_array_length(st -> 'guesses'), 'history', st -> 'guesses');
  elsif p_kind = 'wires' then
    return jsonb_build_object('kind', 'wires', 'title', 'Cut the wires', 'intro', 'Read the rule card. Cut only the right wires, in the right order.',
      'wires', st -> 'wires', 'card', st -> 'card', 'cut', st -> 'cut', 'strikesLeft', mx - (st ->> 'strikes')::int);
  elsif p_kind = 'pattern' then
    return jsonb_build_object('kind', 'pattern', 'title', 'Pattern', 'intro', 'What comes next? Three rounds in a row.', 'round', (st ->> 'round')::int, 'rounds', 3,
      'series', st -> 'series', 'options', st -> 'options', 'strikesLeft', mx - (st ->> 'strikes')::int);
  elsif p_kind = 'lights' then
    return jsonb_build_object('kind', 'lights', 'title', 'Light memory', 'intro', 'Watch the lights, then repeat them. It gets longer.', 'round', (st ->> 'round')::int, 'rounds', 3,
      'colours', '["red","green","blue","yellow"]'::jsonb, 'len', jsonb_array_length(st -> 'seq'), 'shown', (st ->> 'shown')::int, 'strikesLeft', mx - (st ->> 'strikes')::int);
  elsif p_kind = 'match' then
    return jsonb_build_object('kind', 'match', 'title', case when st ->> 'variant' = 'print' then 'Fingerprint match' else 'Key card match' end, 'intro', 'Pick the one that fits every clue.',
      'variant', st ->> 'variant', 'clues', st -> 'clues', 'items', st -> 'items', 'eliminated', st -> 'eliminated', 'strikesLeft', mx - (st ->> 'strikes')::int);
  end if;
  return null;
end $$;

-- one move. returns the new secret state, outcome ('continue' | 'solved' | 'fail') and feedback for the browser
create or replace function private.vstep(p_kind text, st jsonb, ans jsonb, out new_st jsonb, out outcome text, out fb jsonb) language plpgsql volatile as $$
declare mx int := private.vcfg('strikes', 2)::int; i int; n int; guess text; secret text; e int; m int; d int; codes int[]; right_ jsonb; idx int; nxt int; sol jsonb; colr text; seq jsonb; pos int; r jsonb;
begin
  new_st := st; outcome := 'continue'; fb := '{}'::jsonb;
  if jsonb_typeof(ans) <> 'object' then raise exception 'bad_answer'; end if;

  if p_kind = 'lock' then
    if jsonb_typeof(ans -> 'codes') <> 'array' or jsonb_array_length(ans -> 'codes') <> 3 then raise exception 'bad_answer'; end if;
    right_ := '[]'::jsonb;
    for i in 0..2 loop
      if jsonb_typeof(ans -> 'codes' -> i) <> 'number' then raise exception 'bad_answer'; end if;
      right_ := right_ || to_jsonb((ans -> 'codes' ->> i)::numeric = (st -> 'codes' ->> i)::numeric);
    end loop;
    if not (right_ @> '[false]'::jsonb) then outcome := 'solved'; return; end if;
    new_st := jsonb_set(jsonb_set(st, '{tries}', to_jsonb((st ->> 'tries')::int - 1)), '{right}', right_);
    if (new_st ->> 'tries')::int <= 0 then outcome := 'fail'; end if;
    fb := jsonb_build_object('right', right_);

  elsif p_kind = 'cracker' then
    guess := ans ->> 'guess'; secret := st ->> 'secret';
    if guess is null or guess !~ '^[0-9]{4}$' then raise exception 'bad_answer'; end if;
    e := 0; for i in 1..4 loop if substr(guess, i, 1) = substr(secret, i, 1) then e := e + 1; end if; end loop;
    m := 0; for d in 0..9 loop
      m := m + least(length(secret) - length(replace(secret, d::text, '')), length(guess) - length(replace(guess, d::text, '')));
    end loop;
    m := m - e;
    new_st := jsonb_set(st, '{guesses}', (st -> 'guesses') || jsonb_build_array(jsonb_build_object('guess', guess, 'exact', e, 'misplaced', m)));
    fb := jsonb_build_object('exact', e, 'misplaced', m);
    if e = 4 then outcome := 'solved'; elsif jsonb_array_length(new_st -> 'guesses') >= (st ->> 'max')::int then outcome := 'fail'; end if;

  elsif p_kind = 'wires' then
    if jsonb_typeof(ans -> 'cut') <> 'number' then raise exception 'bad_answer'; end if;
    idx := (ans ->> 'cut')::int; if idx < 0 or idx > 5 then raise exception 'bad_answer'; end if;
    if (st -> 'cut') @> to_jsonb(idx) then return; end if;                                   -- already cut: no penalty
    nxt := jsonb_array_length(st -> 'cut'); sol := st -> 'sol';
    if (sol ->> nxt)::int = idx then
      new_st := jsonb_set(st, '{cut}', (st -> 'cut') || to_jsonb(idx)); fb := jsonb_build_object('ok', true);
      if nxt + 1 >= jsonb_array_length(sol) then outcome := 'solved'; end if;
    else
      new_st := jsonb_set(st, '{strikes}', to_jsonb((st ->> 'strikes')::int + 1)); fb := jsonb_build_object('ok', false);
      if (new_st ->> 'strikes')::int >= mx then outcome := 'fail'; end if;
    end if;

  elsif p_kind = 'pattern' then
    if jsonb_typeof(ans -> 'pick') <> 'number' then raise exception 'bad_answer'; end if;
    if (ans ->> 'pick')::int = (st ->> 'ans')::int then
      fb := jsonb_build_object('correct', true);
      if (st ->> 'round')::int >= 3 then outcome := 'solved';
      else new_st := jsonb_set(st, '{round}', to_jsonb((st ->> 'round')::int + 1)) || private.vgen_pattern_round(); end if;
    else
      fb := jsonb_build_object('correct', false);
      new_st := jsonb_set(st, '{strikes}', to_jsonb((st ->> 'strikes')::int + 1)) || private.vgen_pattern_round();
      if (new_st ->> 'strikes')::int >= mx then outcome := 'fail'; end if;
    end if;

  elsif p_kind = 'lights' then
    seq := st -> 'seq'; pos := (st ->> 'pos')::int;
    if ans ->> 'op' = 'show' then
      n := jsonb_array_length(seq); r := '[]'::jsonb;
      for i in (st ->> 'shown')::int .. n - 1 loop r := r || jsonb_build_array(seq -> i); end loop;
      new_st := jsonb_set(st, '{shown}', to_jsonb(n)); fb := jsonb_build_object('reveal', r, 'from', (st ->> 'shown')::int);
    elsif ans ->> 'op' = 'tap' then
      if (st ->> 'shown')::int < jsonb_array_length(seq) then raise exception 'show_first'; end if;
      colr := ans ->> 'c';
      if colr is null or colr not in ('red', 'green', 'blue', 'yellow') then raise exception 'bad_answer'; end if;
      if seq ->> pos = colr then
        pos := pos + 1;
        if pos >= jsonb_array_length(seq) then
          if (st ->> 'round')::int >= 3 then outcome := 'solved'; fb := jsonb_build_object('ok', true, 'roundDone', true);
          else
            new_st := jsonb_set(jsonb_set(jsonb_set(st, '{round}', to_jsonb((st ->> 'round')::int + 1)), '{pos}', '0'::jsonb),
                                '{seq}', seq || to_jsonb((array['red', 'green', 'blue', 'yellow'])[1 + floor(random() * 4)::int]));
            fb := jsonb_build_object('ok', true, 'roundDone', true);
          end if;
        else new_st := jsonb_set(st, '{pos}', to_jsonb(pos)); fb := jsonb_build_object('ok', true); end if;
      else
        new_st := jsonb_set(jsonb_set(st, '{strikes}', to_jsonb((st ->> 'strikes')::int + 1)), '{pos}', '0'::jsonb); fb := jsonb_build_object('ok', false);
        if (new_st ->> 'strikes')::int >= mx then outcome := 'fail'; end if;
      end if;
    else raise exception 'bad_answer'; end if;

  elsif p_kind = 'match' then
    if jsonb_typeof(ans -> 'pick') <> 'number' then raise exception 'bad_answer'; end if;
    idx := (ans ->> 'pick')::int; if idx < 0 or idx > 5 then raise exception 'bad_answer'; end if;
    if (st -> 'eliminated') @> to_jsonb(idx) then return; end if;
    if idx = (st ->> 'target')::int then outcome := 'solved'; fb := jsonb_build_object('ok', true);
    else
      new_st := jsonb_set(jsonb_set(st, '{strikes}', to_jsonb((st ->> 'strikes')::int + 1)), '{eliminated}', (st -> 'eliminated') || to_jsonb(idx)); fb := jsonb_build_object('ok', false);
      if (new_st ->> 'strikes')::int >= mx then outcome := 'fail'; end if;
    end if;
  else raise exception 'bad_answer';
  end if;
end $$;

-- ============================================================================ vault lifecycle
create or replace function private.vault_room(p_user uuid) returns void language plpgsql security definer set search_path = '' as $$
declare s public.player_stats;
begin
  select * into s from public.player_stats where id = p_user;
  if not found or s.venue is distinct from 'bank' or s.building is distinct from (select value ->> 'building_id' from public.app_config where key = 'vault') then
    raise exception 'wrong_place';
  end if;
end $$;

-- arrest (adults) or cooldown (under 18). Unlocks the vault: it is still full.
create or replace function private.vault_fail(p_attempt bigint, p_why text) returns jsonb language plpgsql security definer set search_path = '' as $$
declare a public.vault_attempts; until_ timestamptz; left_ int;
begin
  select * into a from public.vault_attempts where id = p_attempt for update;
  if not found or a.status <> 'active' then return jsonb_build_object('status', 'gone'); end if;
  update public.vault_attempts set status = case when p_why = 'expired' then 'expired' else 'lost' end where id = a.id;
  update public.vault_state set status = 'full', locked_by = null, lock_expires = null, attempt_id = null where id = 'heritage' and attempt_id = a.id;
  if a.teen then
    until_ := (case when p_why = 'expired' then a.deadline else now() end) + make_interval(secs => private.vcfg('teen_fail_cooldown_secs', 600)::int);
    insert into public.vault_cooldowns (user_id, until, reason) values (a.user_id, until_, 'failed') on conflict (user_id) do update set until = greatest(public.vault_cooldowns.until, excluded.until), reason = 'failed';
    return jsonb_build_object('status', 'failed', 'why', p_why, 'cooldownSecs', greatest(0, ceil(extract(epoch from (until_ - now())))::int));
  end if;
  until_ := (case when p_why = 'expired' then a.deadline else now() end) + make_interval(secs => private.vcfg('jail_secs', 180)::int);
  insert into public.jail (user_id, until, reason) values (a.user_id, until_, 'vault') on conflict (user_id) do update set until = excluded.until, reason = 'vault';
  left_ := greatest(0, ceil(extract(epoch from (until_ - now())))::int);
  return jsonb_build_object('status', 'caught', 'why', p_why, 'jailSecs', left_);
end $$;

-- settle anything that is due: a refill, or a robber who vanished. Returns the vault row.
create or replace function private.vault_tick() returns public.vault_state language plpgsql security definer set search_path = '' as $$
declare v public.vault_state;
begin
  select * into v from public.vault_state where id = 'heritage' for update;
  if not found then insert into public.vault_state (id, amount, status) values ('heritage', private.vault_roll(), 'full') returning * into v; end if;
  if v.status = 'locked' and (v.lock_expires is null or v.lock_expires <= now()) then
    perform private.vault_fail(v.attempt_id, 'expired');
    select * into v from public.vault_state where id = 'heritage';
    if v.status = 'locked' then update public.vault_state set status = 'full', locked_by = null, lock_expires = null, attempt_id = null where id = 'heritage' returning * into v; end if;
  end if;
  if v.status = 'empty' and v.refill_at <= now() then
    update public.vault_state set amount = private.vault_roll(), status = 'full', refill_at = null where id = 'heritage' returning * into v;
  end if;
  return v;
end $$;

create or replace function private.vault_cd_secs(p_user uuid) returns int language sql stable security definer set search_path = '' as $$
  select coalesce(ceil(extract(epoch from (select until - now() from public.vault_cooldowns where user_id = p_user and until > now())))::int, 0) $$;

create or replace function private.vault_json(a public.vault_attempts) returns jsonb language plpgsql stable security definer set search_path = '' as $$
begin
  return jsonb_build_object('attempt', a.id, 'totalSecs', private.vcfg('seconds', 120)::int, 'secsLeft', greatest(0, ceil(extract(epoch from (a.deadline - now())))::int),
    'step', a.step, 'count', 3, 'teen', a.teen, 'puzzle', private.vview(a.puzzles -> a.step ->> 'kind', a.puzzles -> a.step -> 'st'));
end $$;

-- ------------------------------------------------------------------ RPCs
-- what everyone may see about the vault. Never the amount.
create or replace function public.vault_status() returns jsonb language plpgsql security definer set search_path = '' as $$
declare u uuid := private.require_user(); v public.vault_state; teen boolean;
begin
  perform private.vault_room(u);
  v := private.vault_tick();
  select is_teen into teen from public.private_profiles where id = u;
  return jsonb_build_object('vault', case v.status when 'full' then 'full' when 'locked' then 'robbery' else 'empty' end, 'mine', v.locked_by = u,
    'refillSecs', case when v.status = 'empty' then greatest(0, ceil(extract(epoch from (v.refill_at - now())))::int) else 0 end,
    'cooldownSecs', private.vault_cd_secs(u), 'jailSecs', private.jail_secs(u), 'teen', coalesce(teen, false),
    'totalSecs', private.vcfg('seconds', 120)::int, 'jailLen', private.vcfg('jail_secs', 180)::int, 'teenCooldownLen', private.vcfg('teen_fail_cooldown_secs', 600)::int);   -- rules text only, never the amount
end $$;

create or replace function public.vault_start() returns jsonb language plpgsql security definer set search_path = '' as $$
declare u uuid := private.require_user(); v public.vault_state; teen boolean; a public.vault_attempts; kinds text[]; pz jsonb := '[]'::jsonb; k text; dl timestamptz; nid bigint;
begin
  perform private.vault_room(u); perform private.require_free(u);
  v := private.vault_tick();
  select is_teen into teen from public.private_profiles where id = u;
  if v.status = 'locked' and v.locked_by = u then                    -- came back to an attempt in progress
    select * into a from public.vault_attempts where id = v.attempt_id; return private.vault_json(a);
  end if;
  if private.vault_cd_secs(u) > 0 then raise exception 'vault_cooldown'; end if;
  if v.status = 'empty' then raise exception 'vault_empty'; end if;
  if v.status = 'locked' then raise exception 'vault_busy'; end if;
  kinds := array(select x from unnest(array['lock', 'cracker', 'wires', 'pattern', 'lights', 'match']) x order by random() limit 3);
  foreach k in array kinds loop pz := pz || jsonb_build_array(jsonb_build_object('kind', k, 'st', private.vgen(k))); end loop;
  dl := now() + make_interval(secs => private.vcfg('seconds', 120)::int);
  insert into public.vault_attempts (user_id, deadline, puzzles, teen) values (u, dl, pz, coalesce(teen, false)) returning * into a;
  update public.vault_state set status = 'locked', locked_by = u, attempt_id = a.id, lock_expires = dl + make_interval(secs => private.vcfg('grace', 3)::int) where id = 'heritage';
  return private.vault_json(a);
end $$;

create or replace function public.vault_answer(p_attempt bigint, p_answer jsonb) returns jsonb language plpgsql security definer set search_path = '' as $$
declare u uuid := private.require_user(); v public.vault_state; a public.vault_attempts; cur jsonb; r record; amt bigint; nxt jsonb; res jsonb;
begin
  perform private.vault_room(u);
  v := private.vault_tick();                                         -- also turns a timed-out attempt into an arrest
  select * into a from public.vault_attempts where id = p_attempt and user_id = u for update;
  if not found then raise exception 'bad_attempt'; end if;
  if a.status <> 'active' then
    select jsonb_build_object('status', case when a.status = 'won' then 'win' when a.teen then 'failed' else 'caught' end, 'why', 'time',
      'jailSecs', private.jail_secs(u), 'cooldownSecs', private.vault_cd_secs(u), 'payout', a.payout) into res; return res;
  end if;
  cur := a.puzzles -> a.step;
  select * into r from private.vstep(cur ->> 'kind', cur -> 'st', p_answer);
  if r.outcome = 'fail' then return private.vault_fail(a.id, 'strikes'); end if;
  if r.outcome = 'solved' then
    if a.step + 1 >= 3 then                                          -- all three solved: the vault is yours
      select amount into amt from public.vault_state where id = 'heritage' for update;
      perform private.ledger_move(u, 'vault_heist', amt, 0, 'heritage');
      update public.vault_attempts set status = 'won', payout = amt where id = a.id;
      update public.vault_state set status = 'empty', amount = 0, locked_by = null, lock_expires = null, attempt_id = null,
        refill_at = now() + make_interval(secs => private.vcfg('refill_secs', 1200)::int) where id = 'heritage';
      insert into public.vault_cooldowns (user_id, until, reason) values (u, now() + make_interval(secs => private.vcfg('cooldown_secs', 10800)::int), 'won')
        on conflict (user_id) do update set until = excluded.until, reason = 'won';
      return jsonb_build_object('status', 'win', 'payout', amt, 'cooldownSecs', private.vault_cd_secs(u), 'wallet', public.get_wallet());
    end if;
    update public.vault_attempts set step = a.step + 1 where id = a.id returning * into a;
    return jsonb_build_object('status', 'solved', 'feedback', r.fb) || (private.vault_json(a) - 'teen');
  end if;
  update public.vault_attempts set puzzles = jsonb_set(puzzles, array[a.step::text, 'st'], r.new_st) where id = a.id returning * into a;
  return jsonb_build_object('status', 'continue', 'feedback', r.fb) || (private.vault_json(a) - 'teen');
end $$;

-- walking away from an attempt counts as being caught (otherwise players could re-roll puzzles for free)
create or replace function public.vault_giveup(p_attempt bigint) returns jsonb language plpgsql security definer set search_path = '' as $$
declare u uuid := private.require_user();
begin
  perform private.vault_tick();
  if not exists (select 1 from public.vault_attempts where id = p_attempt and user_id = u and status = 'active') then raise exception 'bad_attempt'; end if;
  return private.vault_fail(p_attempt, 'gaveup');
end $$;

revoke execute on function public.vault_status(), public.vault_start(), public.vault_answer(bigint, jsonb), public.vault_giveup(bigint) from public, anon;
grant execute on function public.vault_status(), public.vault_start(), public.vault_answer(bigint, jsonb), public.vault_giveup(bigint) to authenticated;

-- ===================== 14_transfers.sql =====================
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

-- ===================== 15_receipts.sql =====================
-- ==========================================================================
-- 15_receipts.sql — WhatsApp-style message ticks (sent / delivered / seen) + safe RESEND after a network failure.
-- Run AFTER 01_schema.sql, 10_chat_social.sql and 14_transfers.sql. Safe to re-run.  Local test: supabase/tests/run.sh (tests/test_receipts.sql).
--
-- 1. TICKS (direct messages only)
--      sent       ✓   the server stored it                      (the row exists)
--      delivered  ✓✓  the receiver's phone got it              (dms.delivered_at, set by mark_dms_delivered())
--      seen       ✓✓  (light blue) the receiver opened the chat (dms.read_at, set by mark_dms_read(peer))
--    Only the RECEIVER can set these, only through the two RPCs below (no table writes), and only on messages sent TO them.
--    The sender's phone learns about a change through realtime (UPDATE on public.dms).
-- 2. RESEND  — every send RPC now takes an optional client id (p_client uuid).  The phone makes one id per message and re-sends the SAME id
--    after a network failure; if the first try did reach the server, the second returns the ORIGINAL message id instead of posting twice.
--    send_dm(to, body, client) · send_room_message(room, body, client) · send_group_message(group, body, client).  Old 2-argument calls still work.
-- ==========================================================================

-- ------------------------------------------------------------------ columns
do $$ begin
  if not exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'dms' and column_name = 'read_at') then
    alter table public.dms add column delivered_at timestamptz, add column read_at timestamptz;
    update public.dms set delivered_at = created_at, read_at = created_at;      -- messages from before this feature count as seen
  end if;
end $$;
alter table public.dms add column if not exists client_id uuid;
alter table public.room_messages add column if not exists client_id uuid;
alter table public.group_messages add column if not exists client_id uuid;
create unique index if not exists dms_client_uq on public.dms (sender, client_id) where client_id is not null;
create unique index if not exists room_messages_client_uq on public.room_messages (user_id, client_id) where client_id is not null;
create unique index if not exists group_messages_client_uq on public.group_messages (user_id, client_id) where client_id is not null;
create index if not exists dms_unseen_idx on public.dms (recipient, sender) where read_at is null;

-- the old signatures go away so the new ones (extra optional argument) are the only candidates
drop function if exists public.send_dm(uuid, text);
drop function if exists public.send_room_message(text, text);
drop function if exists public.send_group_message(bigint, text);

-- ------------------------------------------------------------------ direct message
create or replace function public.send_dm(p_to uuid, p_body text, p_client uuid default null) returns bigint
language plpgsql security definer set search_path = '' as $$
declare u uuid := private.require_user(); teen boolean; txt text; recent int; nid bigint;
begin
  if p_client is not null then                                   -- a retry of a message that already arrived: hand back the original, do nothing else
    select id into nid from public.dms where sender = u and client_id = p_client;
    if found then return nid; end if;
  end if;
  if not private.dm_allowed(u, p_to) then raise exception 'wave_first'; end if;
  select is_teen into teen from public.private_profiles where id = u;
  select count(*) into recent from public.dms where sender = u and created_at > now() - interval '10 seconds';
  if recent >= 5 then raise exception 'slow_down'; end if;
  txt := private.chat_clean(p_body, teen);
  if txt is null then raise exception 'message_not_allowed'; end if;
  insert into public.dms (sender, recipient, body, client_id) values (u, p_to, txt, p_client)
    on conflict (sender, client_id) where client_id is not null do nothing returning id into nid;
  if nid is null then select id into nid from public.dms where sender = u and client_id = p_client; end if;    -- two retries at once: the loser reads the winner's row
  return nid;
end $$;

-- ------------------------------------------------------------------ building / campus room
create or replace function public.send_room_message(p_room text, p_body text, p_client uuid default null) returns bigint
language plpgsql security definer set search_path = '' as $$
declare u uuid := private.require_user(); name text; teen boolean; txt text; recent int; nid bigint;
begin
  if p_client is not null then
    select id into nid from public.room_messages where user_id = u and client_id = p_client;
    if found then return nid; end if;
  end if;
  if p_room !~ '^[a-z0-9_:.-]{1,60}$' then raise exception 'bad_room'; end if;
  if not public.in_room(p_room) then raise exception 'not_in_room'; end if;
  select p.username, q.is_teen into name, teen from public.profiles p join public.private_profiles q on q.id = p.id where p.id = u;
  if name is null then raise exception 'finish_sign_up'; end if;
  select count(*) into recent from public.room_messages where user_id = u and created_at > now() - interval '10 seconds';
  if recent >= 5 then raise exception 'slow_down'; end if;
  txt := private.chat_clean(p_body, teen);
  if txt is null then raise exception 'message_not_allowed'; end if;
  insert into public.room_messages (room, user_id, username, body, client_id) values (p_room, u, name, txt, p_client)
    on conflict (user_id, client_id) where client_id is not null do nothing returning id into nid;
  if nid is null then select id into nid from public.room_messages where user_id = u and client_id = p_client; end if;
  return nid;
end $$;

-- ------------------------------------------------------------------ group
create or replace function public.send_group_message(p_group bigint, p_body text, p_client uuid default null) returns bigint
language plpgsql security definer set search_path = '' as $$
declare u uuid := private.require_user(); name text; teen boolean; txt text; recent int; nid bigint;
begin
  if p_client is not null then
    select id into nid from public.group_messages where user_id = u and client_id = p_client and group_id = p_group;
    if found then return nid; end if;
  end if;
  if not public.is_group_member(p_group) then raise exception 'not_member'; end if;
  select p.username, q.is_teen into name, teen from public.profiles p join public.private_profiles q on q.id = p.id where p.id = u;
  if name is null then raise exception 'finish_sign_up'; end if;
  select count(*) into recent from public.group_messages where user_id = u and created_at > now() - interval '10 seconds';
  if recent >= 5 then raise exception 'slow_down'; end if;
  txt := private.chat_clean(p_body, teen);
  if txt is null then raise exception 'message_not_allowed'; end if;
  insert into public.group_messages (group_id, user_id, username, body, client_id) values (p_group, u, name, txt, p_client)
    on conflict (user_id, client_id) where client_id is not null do nothing returning id into nid;
  if nid is null then select id into nid from public.group_messages where user_id = u and client_id = p_client; end if;
  return nid;
end $$;

-- ------------------------------------------------------------------ ticks: the RECEIVER reports
-- "my phone has your messages": call on login and whenever a new DM arrives.  Returns how many were newly marked.
create or replace function public.mark_dms_delivered() returns int
language plpgsql security definer set search_path = '' as $$
declare u uuid := private.require_user(); n int;
begin
  update public.dms set delivered_at = now() where recipient = u and delivered_at is null;
  get diagnostics n = row_count; return n;
end $$;

-- "I opened the chat with <peer>": everything they sent me is now seen (and delivered).
create or replace function public.mark_dms_read(p_peer uuid) returns int
language plpgsql security definer set search_path = '' as $$
declare u uuid := private.require_user(); n int;
begin
  update public.dms set delivered_at = coalesce(delivered_at, now()), read_at = now() where recipient = u and sender = p_peer and read_at is null;
  get diagnostics n = row_count; return n;
end $$;

-- ------------------------------------------------------------------ grants
revoke execute on function public.send_dm(uuid, text, uuid), public.send_room_message(text, text, uuid), public.send_group_message(bigint, text, uuid),
  public.mark_dms_delivered(), public.mark_dms_read(uuid) from public, anon;
grant execute on function public.send_dm(uuid, text, uuid), public.send_room_message(text, text, uuid), public.send_group_message(bigint, text, uuid),
  public.mark_dms_delivered(), public.mark_dms_read(uuid) to authenticated;
-- (table access is unchanged: browsers can still only SELECT dms through the RLS policy; they cannot write delivered_at / read_at themselves)

-- ===================== 16_unread.sql =====================
-- 16_unread.sql — unread message counts for the Chat app (per friend, per group, and the app badge).  Run AFTER 10, 14 and 15. Safe to re-run.
-- What it adds
--   * group_members.last_read_id : the last group message each member has seen (their "read cursor"). Existing members start fully read.
--   * get_unread()               : ONE call returns everything the phone needs for the badges: { dms:{<friend id>:n}, groups:{<group id>:n}, invites:n, alerts:n }.
--   * mark_group_read(group)     : "I opened this group" - moves my cursor to the newest message.
-- Direct messages already track "seen" (dms.read_at, from 15_receipts.sql), so their count is simply the unseen ones. Money messages are NOT counted
--   here: the money alert (notifications) already counts them once. Blocked players never count. Counts are exact; the phone shows 99+ above 99.

do $$ begin
  if not exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'group_members' and column_name = 'last_read_id') then
    alter table public.group_members add column last_read_id bigint not null default 0;
    update public.group_members gm set last_read_id = coalesce((select max(m.id) from public.group_messages m where m.group_id = gm.group_id), 0);   -- one-time: nobody starts with a flood
  end if;
end $$;

-- a player who JOINS a group starts at "now" (they do not see the old history as unread)
create or replace function private.gm_cursor() returns trigger language plpgsql as $$
begin
  if new.status = 'member' and (tg_op = 'INSERT' or old.status is distinct from 'member') then
    new.last_read_id := coalesce((select max(m.id) from public.group_messages m where m.group_id = new.group_id), 0);
  end if;
  return new;
end $$;
drop trigger if exists group_members_cursor on public.group_members;
create trigger group_members_cursor before insert or update of status on public.group_members for each row execute function private.gm_cursor();

create index if not exists dms_unread_idx on public.dms (recipient, sender) where read_at is null;

create or replace function public.get_unread() returns jsonb
language plpgsql security definer set search_path = '' as $$
declare u uuid := private.require_user(); d jsonb; gr jsonb; inv int; al int;
begin
  select coalesce(jsonb_object_agg(x.sender::text, x.c), '{}'::jsonb) into d
    from (select sender, count(*) c from public.dms
          where recipient = u and read_at is null and kind <> 'money' and not public.is_blocked_between(u, sender) group by sender) x;
  select coalesce(jsonb_object_agg(x.group_id::text, x.c), '{}'::jsonb) into gr
    from (select gm.group_id, count(*) c from public.group_members gm
          join public.group_messages m on m.group_id = gm.group_id and m.id > gm.last_read_id and m.user_id <> u
          where gm.user_id = u and gm.status = 'member' group by gm.group_id) x;
  select count(*) into inv from public.group_members where user_id = u and status = 'invited' and invited_by is distinct from u;
  select count(*) into al from public.notifications where user_id = u and read_at is null;
  return jsonb_build_object('dms', d, 'groups', gr, 'invites', inv, 'alerts', al);
end $$;

create or replace function public.mark_group_read(p_group bigint) returns void
language plpgsql security definer set search_path = '' as $$
declare u uuid := private.require_user();
begin
  update public.group_members gm
     set last_read_id = greatest(gm.last_read_id, coalesce((select max(m.id) from public.group_messages m where m.group_id = p_group), 0))
   where gm.group_id = p_group and gm.user_id = u and gm.status = 'member';
end $$;

revoke execute on function public.get_unread(), public.mark_group_read(bigint) from public, anon;
grant execute on function public.get_unread(), public.mark_group_read(bigint) to authenticated;

-- ===================== 17_admin_metrics.sql =====================
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

-- ===================== 18_global_chat.sql =====================
-- 18_global_chat.sql — the Global chat phone app: one public room for every player, with @tagging of players and replying to a message.
-- Run AFTER 10, 14 and 16. Safe to re-run.
-- Rules (all enforced here, not in the browser):
--   * Teens and adults never share the room: every message carries `teen`, and you only read messages from your own age group. Blocked players are hidden both ways.
--   * Text goes through private.chat_clean (bad words / phone numbers / links), max 5 messages per 10 seconds.
--   * "@name" in a message tags that player (same age group, not blocking you, max 5 per message) and drops a notification for them (app = 'global').
--   * Replying stores a short snapshot of the message you answered, so the quote still shows after the old message is cleaned up.
--   * Messages older than 3 days are deleted by private.cleanup().

alter table public.notifications add column if not exists app text;      -- which phone app the alert belongs to ('global'); null = the money/bank alerts
alter table public.notifications add column if not exists ref bigint;    -- e.g. the global message id that tagged you

create table if not exists public.global_messages (
  id bigserial primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  username text not null,
  teen boolean not null default false,
  body text not null,
  reply_to bigint,
  reply_name text, reply_body text,
  mentions text[] not null default '{}',
  created_at timestamptz not null default now()
);
create index if not exists global_messages_idx on public.global_messages (teen, id desc);
create index if not exists global_messages_user_idx on public.global_messages (user_id, created_at desc);
create index if not exists notifications_app_idx on public.notifications (user_id, app) where read_at is null;

alter table public.global_messages enable row level security;
drop policy if exists global_read on public.global_messages;
create policy global_read on public.global_messages for select to authenticated
  using (teen is not distinct from (select q.is_teen from public.private_profiles q where q.id = auth.uid())
         and not public.is_blocked_between(auth.uid(), user_id));

create or replace function public.send_global_message(p_body text, p_reply_to bigint default null) returns bigint
language plpgsql security definer set search_path = '' as $$
declare
  u uuid := private.require_user(); name text; is_t boolean; txt text; recent int; nid bigint;
  rn text; rb text; m text; tid uuid; tn text; names text[] := '{}'; n int := 0;
begin
  select p.username, q.is_teen into name, is_t from public.profiles p join public.private_profiles q on q.id = p.id where p.id = u;
  if name is null then raise exception 'finish_sign_up'; end if;
  select count(*) into recent from public.global_messages where user_id = u and created_at > now() - interval '10 seconds';
  if recent >= 5 then raise exception 'slow_down'; end if;
  txt := private.chat_clean(p_body, is_t);
  if txt is null then raise exception 'message_not_allowed'; end if;
  if p_reply_to is not null then
    select g.username, left(g.body, 80) into rn, rb from public.global_messages g
     where g.id = p_reply_to and g.teen = is_t and not public.is_blocked_between(u, g.user_id);
    if rn is null then raise exception 'message_gone'; end if;
  end if;
  insert into public.global_messages (user_id, username, teen, body, reply_to, reply_name, reply_body)
    values (u, name, is_t, txt, case when rn is null then null else p_reply_to end, rn, rb) returning id into nid;
  -- @tags
  for m in select lower(x[1]) from regexp_matches(txt, '(?:^|[^a-z0-9_])@([a-zA-Z0-9_]{2,20})', 'g') x loop
    exit when n >= 5;
    continue when m = any(names);
    select p.id, p.username into tid, tn from public.profiles p where lower(p.username) = m;
    continue when tid is null or tid = u or not private.same_age_group(u, tid) or public.is_blocked_between(u, tid);
    names := names || m; n := n + 1;
    insert into public.notifications (user_id, kind, from_user, title, body, app, ref)
      values (tid, 'info', u, '@' || name || ' tagged you in Global', left(txt, 120), 'global', nid);
  end loop;
  if n > 0 then update public.global_messages set mentions = names where id = nid; end if;
  -- replying to someone also pings them (once), unless already tagged
  if rn is not null then
    select g.user_id into tid from public.global_messages g where g.id = p_reply_to;
    if tid <> u and not (lower(rn) = any(names)) and not public.is_blocked_between(u, tid) then
      insert into public.notifications (user_id, kind, from_user, title, body, app, ref)
        values (tid, 'info', u, '@' || name || ' replied to you in Global', left(txt, 120), 'global', nid);
    end if;
  end if;
  return nid;
end $$;

-- how many Global tags/replies I have not seen yet (the app badge)
create or replace function public.get_global_unread() returns int
language sql stable security definer set search_path = '' as $$
  select count(*)::int from public.notifications where user_id = private.require_user() and app = 'global' and read_at is null $$;

create or replace function public.mark_global_read() returns void
language plpgsql security definer set search_path = '' as $$
begin update public.notifications set read_at = now() where user_id = private.require_user() and app = 'global' and read_at is null; end $$;

-- the Chat app's alert badge counts only bank/money alerts (Global tags have their own badge)
create or replace function public.get_unread() returns jsonb
language plpgsql security definer set search_path = '' as $$
declare u uuid := private.require_user(); d jsonb; gr jsonb; inv int; al int;
begin
  select coalesce(jsonb_object_agg(x.sender::text, x.c), '{}'::jsonb) into d
    from (select sender, count(*) c from public.dms
          where recipient = u and read_at is null and kind <> 'money' and not public.is_blocked_between(u, sender) group by sender) x;
  select coalesce(jsonb_object_agg(x.group_id::text, x.c), '{}'::jsonb) into gr
    from (select gm.group_id, count(*) c from public.group_members gm
          join public.group_messages m on m.group_id = gm.group_id and m.id > gm.last_read_id and m.user_id <> u
          where gm.user_id = u and gm.status = 'member' group by gm.group_id) x;
  select count(*) into inv from public.group_members where user_id = u and status = 'invited' and invited_by is distinct from u;
  select count(*) into al from public.notifications where user_id = u and read_at is null and app is null;
  return jsonb_build_object('dms', d, 'groups', gr, 'invites', inv, 'alerts', al);
end $$;

-- the Chat app's alert list / "mark read" only touch bank alerts; Global tags are listed and cleared by the Global app
create or replace function public.list_notifications(p_limit int default 30) returns setof public.notifications
language sql stable security definer set search_path = '' as $$
  select * from public.notifications where user_id = auth.uid() and app is null order by id desc limit least(greatest(coalesce(p_limit, 30), 1), 50) $$;
create or replace function public.mark_notifications_read() returns void
language sql security definer set search_path = '' as $$
  update public.notifications set read_at = now() where user_id = auth.uid() and read_at is null and app is null $$;

create or replace function private.cleanup() returns void language sql as $$
  delete from public.room_messages where created_at < now() - interval '2 days';
  delete from public.seat_claims where expires_at < now();
  delete from public.group_messages where created_at < now() - interval '14 days';
  delete from public.group_members where status = 'declined' and created_at < now() - interval '7 days';
  delete from public.global_messages where created_at < now() - interval '3 days';
$$;

revoke all on public.global_messages from public, anon;
grant select on public.global_messages to authenticated;
revoke execute on function public.send_global_message(text, bigint), public.get_global_unread(), public.mark_global_read(), public.get_unread() from public, anon;
grant execute on function public.send_global_message(text, bigint), public.get_global_unread(), public.mark_global_read(), public.get_unread() to authenticated;

do $$ begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    begin alter publication supabase_realtime add table public.global_messages; exception when duplicate_object then null; end;
  end if;
end $$;

-- ===================== 18_celebrations.sql =====================
-- ============================================================================
-- FUTA World — CELEBRATIONS (convocation, matriculation, …). Run AFTER 01..17.   Doc: docs/CELEBRATIONS.md   Admin page: /admin
-- The admin switches a celebration ON or OFF. While it is ON, every player sees festive decorations on the map and on the phone.
-- Rules (.clinerules: the SERVER decides, no secrets in the client):
--   * ONE celebration row (id = 1): which event, on/off, a title, a short message, and an optional start and end time.
--   * Everybody (even signed-out visitors) may READ it through public.get_celebration() — it holds only public text.
--   * Only the admin may CHANGE it, through public.admin_set_celebration(password, …). It uses the SAME admin password and the SAME
--     lock-out (5 wrong tries in 15 minutes) as the metrics dashboard (17_admin_metrics.sql). The table itself has no grants.
--   * Titles and messages are plain text; the apps insert them with textContent, never as HTML.
--   * It switches itself OFF when the end time passes (get_celebration checks the clock), even if the admin forgets.
-- ============================================================================

create table if not exists public.celebration (
  id int primary key default 1 check (id = 1),
  event text not null default 'convocation' check (event in ('convocation', 'matriculation', 'independence', 'christmas', 'party')),
  is_on boolean not null default false,
  title text,
  message text,
  starts_at timestamptz,
  ends_at timestamptz,
  updated_at timestamptz not null default now(),
  updated_by uuid
);
alter table public.celebration enable row level security;
insert into public.celebration (id) values (1) on conflict (id) do nothing;
revoke all on public.celebration from anon, authenticated;

-- what everybody may see ---------------------------------------------------------------------------------------------
create or replace function public.get_celebration() returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'on', c.is_on and (c.starts_at is null or now() >= c.starts_at) and (c.ends_at is null or now() < c.ends_at),
    'event', c.event, 'title', c.title, 'message', c.message,
    'startsAt', c.starts_at, 'endsAt', c.ends_at, 'updatedAt', c.updated_at)
  from public.celebration c where c.id = 1
$$;
revoke execute on function public.get_celebration() from public;
grant execute on function public.get_celebration() to anon, authenticated;

-- the admin check (same password + same lock-out as admin_metrics). Returns NULL when the password is right, else an error code.
create or replace function private.admin_gate(u uuid, p_password text) returns text
language plpgsql security definer set search_path = '' as $$
declare pwh text; fails int; ok boolean;
begin
  select count(*) into fails from private.admin_attempts where user_id = u and at > now() - interval '15 minutes';
  if fails >= 5 then return 'locked'; end if;
  select pw_hash into pwh from private.admin_secret where id = 1;
  ok := pwh is not null and p_password is not null and length(p_password) <= 200 and extensions.crypt(p_password, pwh) = pwh;
  if not ok then
    insert into private.admin_attempts (user_id) values (u);
    delete from private.admin_attempts where at < now() - interval '2 days';
    return 'bad_password';
  end if;
  delete from private.admin_attempts where user_id = u;
  return null;
end $$;
revoke all on function private.admin_gate(uuid, text) from public, anon, authenticated;

-- the admin switch ---------------------------------------------------------------------------------------------------
create or replace function public.admin_set_celebration(p_password text, p_event text, p_on boolean, p_title text default null, p_message text default null,
                                                       p_starts timestamptz default null, p_ends timestamptz default null) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare u uuid := auth.uid(); err text; t text; m text;
begin
  if u is null then raise exception 'auth_required'; end if;
  err := private.admin_gate(u, p_password);
  if err is not null then return jsonb_build_object('ok', false, 'error', err); end if;
  if p_event is null or p_event not in ('convocation', 'matriculation', 'independence', 'christmas', 'party') then return jsonb_build_object('ok', false, 'error', 'bad_event'); end if;
  t := nullif(btrim(regexp_replace(coalesce(p_title, ''), '[[:cntrl:]]', '', 'g')), '');
  m := nullif(btrim(regexp_replace(coalesce(p_message, ''), '[[:cntrl:]]', '', 'g')), '');
  if length(coalesce(t, '')) > 60 or length(coalesce(m, '')) > 160 then return jsonb_build_object('ok', false, 'error', 'too_long'); end if;
  if p_ends is not null and (p_ends > now() + interval '90 days' or (p_on and p_ends <= now()) or (p_starts is not null and p_ends <= p_starts)) then return jsonb_build_object('ok', false, 'error', 'bad_dates'); end if;
  update public.celebration set event = p_event, is_on = coalesce(p_on, false), title = t, message = m, starts_at = p_starts, ends_at = p_ends, updated_at = now(), updated_by = u where id = 1;
  return jsonb_build_object('ok', true, 'celebration', public.get_celebration());
end $$;
revoke execute on function public.admin_set_celebration(text, text, boolean, text, text, timestamptz, timestamptz) from public, anon;
grant execute on function public.admin_set_celebration(text, text, boolean, text, text, timestamptz, timestamptz) to authenticated;

-- ===================== 18_bulletins.sql =====================
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

-- ===================== 19_arcade.sql =====================
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

-- ===================== 20_forum.sql =====================
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

-- ===================== 21_online.sql =====================
-- 21_online.sql — "who is online" for the map pill and the phone home screen.  Run AFTER 01_schema.sql (and after 18_*). Safe to re-run.
-- COUNTS ONLY. Nobody's name or exact place is ever returned:
--   • touch_online()  — a signed-in player's open game pings this about once a minute ("I am here"). The server ignores pings faster than every 40 s.
--   • online_now()    — anyone (even a guest who is not signed in) may read: how many players pinged in the last 3 minutes, how many of them are
--                       inside a building right now, and the busiest buildings — but only buildings with 2 or more players (so one person can never be spotted).
-- Why a table and not Realtime presence? Presence only knows the players in the SAME zone/room; this gives one number for the whole campus.
-- Limits to keep it fast: one row per player (upsert), index on the time, no history kept.

create table if not exists public.online_pings (
  user_id uuid primary key references auth.users(id) on delete cascade,
  at timestamptz not null default now()
);
create index if not exists online_pings_at on public.online_pings (at);
alter table public.online_pings enable row level security;          -- no policies: the browser can never read or write this table directly
revoke all on public.online_pings from anon, authenticated;

create or replace function public.touch_online() returns void
language plpgsql security definer set search_path = '' as $$
declare u uuid := auth.uid();
begin
  if u is null then return; end if;
  insert into public.online_pings as o (user_id, at) values (u, now())
  on conflict (user_id) do update set at = now() where o.at < now() - interval '40 seconds';
end $$;

create or replace function public.online_now() returns jsonb
language sql stable security definer set search_path = '' as $$
  with o as (select user_id from public.online_pings where at > now() - interval '3 minutes'),
       b as (select s.building from public.player_stats s join o on o.user_id = s.id where s.building is not null),
       top as (select building, count(*) n from b group by building having count(*) >= 2 order by count(*) desc, building limit 3)
  select jsonb_build_object(
    'players', (select count(*) from o),
    'inside',  (select count(*) from b),
    'busiest', coalesce((select jsonb_agg(jsonb_build_object('b', building, 'n', n) order by n desc, building) from top), '[]'::jsonb)
  )
$$;

revoke execute on function public.touch_online() from public, anon;
grant  execute on function public.touch_online() to authenticated;
revoke execute on function public.online_now() from public;
grant  execute on function public.online_now() to anon, authenticated;


-- ===== 22_building_counts.sql =====
-- 22_building_counts.sql — REAL number of players inside each building, for the map labels and the Campus search.
-- Run AFTER 01_schema.sql and 21_online.sql. Safe to re-run.
-- COUNTS ONLY: it returns { "<buildingId>": n } for buildings with at least one player. No names, no user ids.
--   • "inside" = the player pinged online in the last 3 minutes (online_pings) AND player_stats.building is set (enter_building) and not cleared (leave_building).
--   • A player who closes the tab without pressing Leave drops out of the count after 3 minutes.
-- Buildings nobody is in are simply absent, so the map shows nothing for them.

-- entering a building counts as "online right now" immediately (otherwise the first ping can be up to a minute late)
create or replace function private.touch_on_enter() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.online_pings as o (user_id, at) values (new.id, now())
  on conflict (user_id) do update set at = now();
  return new;
end $$;

drop trigger if exists player_stats_touch_on_enter on public.player_stats;
create trigger player_stats_touch_on_enter
  after update of building on public.player_stats
  for each row when (new.building is not null)
  execute function private.touch_on_enter();

create or replace function public.building_counts() returns jsonb
language sql stable security definer set search_path = '' as $$
  select coalesce(jsonb_object_agg(building, n), '{}'::jsonb)
  from (
    select s.building, count(*)::int as n
    from public.online_pings o
    join public.player_stats s on s.id = o.user_id
    where o.at > now() - interval '3 minutes' and s.building is not null
    group by s.building
  ) t
$$;

revoke execute on function public.building_counts() from public;
grant  execute on function public.building_counts() to anon, authenticated;


-- ===== 23_neighbours.sql =====
-- 23_neighbours.sql — NEIGHBOURS: every player is put at random into a small chat group of up to 8 people (same age band), plus message replies.
-- Run AFTER 10_chat_social.sql, 15_receipts.sql and 16_unread.sql. Safe to re-run.
--
--   • A neighbour group is an ordinary chat group (chat_groups.kind = 'neighbour'), so messages, ticks, unread badges and realtime all keep working.
--   • ensure_neighbours()  — the phone calls it once after sign-in. Returns the player's neighbour group (creating the assignment the first time).
--       New player → a RANDOM neighbour group of their own age band that still has room; if none has room, a new group is started.
--       Teens and adults never share a group (is_teen band), exactly like normal groups. Players who signed up before this file existed are
--       placed the first time their phone calls it.
--   • Neighbour groups cannot be invited into, left, or have members removed (that would defeat the random mix).
--   • send_group_message(group, body, client, reply_to) — same as before plus an optional reply to an earlier message of the same group.

alter table public.chat_groups add column if not exists kind text not null default 'friends';
alter table public.group_messages add column if not exists reply_to bigint references public.group_messages(id) on delete set null;

-- ------------------------------------------------------------------ assignment
create or replace function public.ensure_neighbours() returns jsonb
language plpgsql security definer set search_path = '' as $$
declare u uuid := private.require_user(); teen boolean; gid bigint; cap constant int := 8;
begin
  select q.is_teen into teen from public.private_profiles q join public.profiles p on p.id = q.id where q.id = u and p.username is not null;
  if teen is null then raise exception 'finish_sign_up'; end if;

  select m.group_id into gid from public.group_members m join public.chat_groups c on c.id = m.group_id
   where m.user_id = u and m.status = 'member' and c.kind = 'neighbour' limit 1;

  if gid is null then
    perform pg_advisory_xact_lock(723100);                      -- one assignment at a time, so two sign-ups can never overfill a group
    select c.id into gid from public.chat_groups c
     where c.kind = 'neighbour' and c.is_teen = teen
       and (select count(*) from public.group_members m where m.group_id = c.id and m.status = 'member') < cap
     order by random() limit 1;
    if gid is null then
      insert into public.chat_groups (name, owner, is_teen, kind) values ('Neighbours', u, teen, 'neighbour') returning id into gid;
      update public.chat_groups set name = 'Neighbours ' || gid where id = gid;
    end if;
    insert into public.group_members (group_id, user_id, status, role) values (gid, u, 'member', 'member')
      on conflict (group_id, user_id) do update set status = 'member';
  end if;

  return jsonb_build_object('id', gid,
    'name', (select name from public.chat_groups where id = gid),
    'members', (select count(*) from public.group_members where group_id = gid and status = 'member'));
end $$;

-- nobody can be invited into a neighbour group
create or replace function private.no_neighbour_invites() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.status = 'invited' and exists (select 1 from public.chat_groups c where c.id = new.group_id and c.kind = 'neighbour') then raise exception 'not_allowed'; end if;
  return new;
end $$;
drop trigger if exists group_members_no_neighbour_invites on public.group_members;
create trigger group_members_no_neighbour_invites before insert or update of status on public.group_members
  for each row execute function private.no_neighbour_invites();

-- leaving / removing: same bodies as 10_chat_social.sql, plus "not for neighbour groups"
create or replace function public.leave_group(p_group bigint) returns void
language plpgsql security definer set search_path = '' as $$
declare u uuid := private.require_user(); heir uuid;
begin
  if exists (select 1 from public.chat_groups where id = p_group and kind = 'neighbour') then raise exception 'not_allowed'; end if;
  delete from public.group_members where group_id = p_group and user_id = u;
  if not exists (select 1 from public.group_members where group_id = p_group and status = 'member') then
    delete from public.chat_groups where id = p_group; return;
  end if;
  if (select owner from public.chat_groups where id = p_group) = u then
    select user_id into heir from public.group_members where group_id = p_group and status = 'member' order by created_at, user_id limit 1;
    update public.chat_groups set owner = heir where id = p_group;
    update public.group_members set role = 'owner' where group_id = p_group and user_id = heir;
  end if;
end $$;

create or replace function public.remove_group_member(p_group bigint, p_user uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare u uuid := private.require_user();
begin
  if p_user = u then raise exception 'not_allowed'; end if;
  if exists (select 1 from public.chat_groups where id = p_group and kind = 'neighbour') then raise exception 'not_allowed'; end if;
  if not exists (select 1 from public.chat_groups where id = p_group and owner = u) then raise exception 'not_allowed'; end if;
  delete from public.group_members where group_id = p_group and user_id = p_user;
end $$;

-- ------------------------------------------------------------------ replies
drop function if exists public.send_group_message(bigint, text, uuid);
create or replace function public.send_group_message(p_group bigint, p_body text, p_client uuid default null, p_reply_to bigint default null) returns bigint
language plpgsql security definer set search_path = '' as $$
declare u uuid := private.require_user(); name text; teen boolean; txt text; recent int; nid bigint; rt bigint := null;
begin
  if p_client is not null then
    select id into nid from public.group_messages where user_id = u and client_id = p_client and group_id = p_group;
    if found then return nid; end if;
  end if;
  if not public.is_group_member(p_group) then raise exception 'not_member'; end if;
  select p.username, q.is_teen into name, teen from public.profiles p join public.private_profiles q on q.id = p.id where p.id = u;
  if name is null then raise exception 'finish_sign_up'; end if;
  select count(*) into recent from public.group_messages where user_id = u and created_at > now() - interval '10 seconds';
  if recent >= 5 then raise exception 'slow_down'; end if;
  txt := private.chat_clean(p_body, teen);
  if txt is null then raise exception 'message_not_allowed'; end if;
  if p_reply_to is not null then select id into rt from public.group_messages where id = p_reply_to and group_id = p_group; end if;   -- a reply must point at a message of THIS group
  insert into public.group_messages (group_id, user_id, username, body, client_id, reply_to) values (p_group, u, name, txt, p_client, rt)
    on conflict (user_id, client_id) where client_id is not null do nothing returning id into nid;
  if nid is null then select id into nid from public.group_messages where user_id = u and client_id = p_client; end if;
  return nid;
end $$;

revoke execute on function public.send_group_message(bigint, text, uuid, bigint), public.ensure_neighbours() from public, anon;
grant  execute on function public.send_group_message(bigint, text, uuid, bigint), public.ensure_neighbours() to authenticated;

-- ===================== 25_unread_realtime.sql =====================
-- 25_unread_realtime.sql — lets the phone's red unread numbers for Feed, NEPA and Tutorial update at once (Supabase Realtime).
-- Run once in the Supabase SQL Editor AFTER 05_feed.sql and 18_bulletins.sql. Safe to re-run. It changes no data and no rules.
-- Without it the numbers still work: the phone recounts from the server on sign-in, when the connection returns, when the tab comes back and every 60 s.
-- Realtime respects the tables' existing read rules (feed_read / bulletin_read), so players only ever get posts they are allowed to see.
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    begin alter publication supabase_realtime add table public.feed_posts; exception when duplicate_object then null; end;
    begin alter publication supabase_realtime add table public.bulletins; exception when duplicate_object then null; end;
  end if;
end $$;

-- ===================== 21_bots.sql =====================
-- 21_bots.sql — "Campus bots": labelled, scripted, free helpers that make the game feel alive before there are many players.
-- Run in the Supabase SQL Editor AFTER 01_schema.sql … 20_forum.sql, then run 21b_bots_content.sql (the names, lines, scenes and guides). Safe to re-run.
--
-- WHAT THEY ARE (decided, see docs/BOTS.md):
--   • about 30 Nigerian-named accounts (male + female), flagged profiles.is_bot. The app draws a "BOT" badge + violet dot from THAT flag, so nobody can fake it by typing.
--   • NO AI and NO server: everything is plain SQL inside your Supabase project, run by pg_cron. Phones download nothing extra.
--   • they post on the Feed, drop Tutorial guides, talk to each other in Global chat (small "scenes"), accept waves, and REPLY when a real player
--     tags them in Global or sends them a personal message. Replies are picked from a library of lines by keyword (see private.bot_intent).
--   • one rule set for every age: bots only ever REPLY (never start a private chat), and every line they say is safe for a 13-year-old.
--   • they never touch money (the wallet guard below), never appear on rankings, never count as "online", and an admin switch turns them all off.
-- Admin switch (no code):  select public.admin_bots('<admin password>', 'off');   -- and 'on', 'status', 'log', 'bot_off:<username>', 'bot_on:<username>'
-- Tunables (app_config, no code):  bots.enabled (true) · bots.reply_per_hour (12 replies per player per hour)

-- ------------------------------------------------------------------ the flag + the roster
alter table public.profiles add column if not exists is_bot boolean not null default false;

create table if not exists public.bots (
  user_id uuid primary key references auth.users(id) on delete cascade,
  username text not null unique,
  gender text not null check (gender in ('f', 'm')),
  tone text not null default 'chill' check (tone in ('chill', 'jokes', 'serious', 'sporty')),
  active boolean not null default true,
  created_at timestamptz not null default now()
);
alter table public.bots enable row level security;            -- no policy, no grant: only the functions below touch it

create table if not exists private.bot_lines    (id bigserial primary key, pack text not null, tone text, body text not null);
create table if not exists private.bot_feed     (id bigserial primary key, body text not null, bg text not null default 'sunset', used_at timestamptz);
create table if not exists private.bot_tutorials(id bigserial primary key, title text not null, category text not null, body text not null, used_at timestamptz);
create table if not exists private.bot_scenes   (scene text not null, step int not null, role int not null, body text not null, reply_step int, primary key (scene, step));
create table if not exists private.bot_state    (key text primary key, value jsonb);
create table if not exists private.bot_slots    (slot text not null, val text not null);      -- word lists that fill {place} {food} {course} {team} {drink} {game} {day} in any line, so one line reads many ways
create table if not exists private.bot_outbox   (id bigserial primary key, kind text not null check (kind in ('dm', 'global')), bot uuid not null, to_user uuid not null,
                                                 reply_to bigint, body text not null, due_at timestamptz not null, sent boolean not null default false, created_at timestamptz not null default now());
create table if not exists private.bot_handled  (kind text not null, ref bigint not null, primary key (kind, ref), at timestamptz not null default now());
create table if not exists private.bot_log      (id bigserial primary key, kind text not null, user_id uuid, body text, at timestamptz not null default now());
create index if not exists bot_outbox_due_idx on private.bot_outbox (due_at) where not sent;
create index if not exists bot_outbox_to_idx on private.bot_outbox (to_user, created_at desc);
revoke all on private.bot_slots, private.bot_lines, private.bot_feed, private.bot_tutorials, private.bot_scenes, private.bot_state, private.bot_outbox, private.bot_handled, private.bot_log from public, anon, authenticated;

-- ------------------------------------------------------------------ small helpers
create or replace function private.bots_on() returns boolean language sql stable set search_path = '' as $$
  select coalesce((select (value #>> '{}')::boolean from public.app_config where key = 'bots.enabled'), true) $$;

create or replace function private.is_bot(u uuid) returns boolean language sql stable security definer set search_path = '' as $$
  select coalesce((select is_bot from public.profiles where id = u), false) $$;

-- the app asks "is this name a bot?" through this (it is public information, like the name itself); the RLS policy below uses it too
create or replace function public.is_bot_user(u uuid) returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.bots where user_id = u and active) $$;

create or replace function public.list_bots() returns table (username text) language sql stable security definer set search_path = '' as $$
  select b.username from public.bots b where b.active order by b.username $$;

-- bots are "in every age group" so they can talk to everyone; this one function is what Global tags, waves and DMs all ask
create or replace function private.same_age_group(a uuid, b uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select private.is_bot(a) or private.is_bot(b)
      or (select is_teen from public.private_profiles where id = a) is not distinct from (select is_teen from public.private_profiles where id = b) $$;

drop policy if exists global_read on public.global_messages;
create policy global_read on public.global_messages for select to authenticated
  using ((teen is not distinct from (select q.is_teen from public.private_profiles q where q.id = auth.uid()) or public.is_bot_user(user_id))
         and not public.is_blocked_between(auth.uid(), user_id));

-- ------------------------------------------------------------------ nobody can fake a bot, and nobody can send a bot money
create or replace function private.profiles_guard() returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'UPDATE' and new.is_bot is distinct from old.is_bot and auth.uid() is not null then raise exception 'not_allowed'; end if;     -- only you (SQL editor / cron) can make a bot
  if tg_op = 'INSERT' and new.is_bot and auth.uid() is not null then raise exception 'not_allowed'; end if;
  if new.username is not null and not new.is_bot and (tg_op = 'INSERT' or new.username is distinct from old.username)
     and (new.username ~ '^(admin|support|moderator|staff|official|system|security|futalife|futa_?bot|campus_?bot|bot[0-9_]|bot$)' or new.username ~ '(^|_)(bot|admin|official|staff|support)(_|[0-9]*$)') then
    raise exception 'That name is reserved.';
  end if;
  return new;
end $$;
drop trigger if exists profiles_guard_trg on public.profiles;
create trigger profiles_guard_trg before insert or update on public.profiles for each row execute function private.profiles_guard();

create or replace function private.bot_wallet_guard() returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if (new.pocket + new.bank) > (old.pocket + old.bank) and private.is_bot(new.id) then raise exception 'bots_cannot_receive_money'; end if;
  return new;
end $$;
drop trigger if exists bot_wallet_guard_trg on public.wallets;
create trigger bot_wallet_guard_trg before update on public.wallets for each row execute function private.bot_wallet_guard();

-- a wave at a bot is accepted at once (so the chat opens straight away) and the bot says hello a moment later
create or replace function private.bot_wave_trg() returns trigger language plpgsql security definer set search_path = '' as $$
declare un text; ln text;
begin
  if exists (select 1 from public.bots b where b.user_id = new.to_user and b.active) and private.bots_on() then
    new.status := 'accepted';
    select p.username into un from public.profiles p where p.id = new.from_user;
    ln := private.bot_line('wave', new.to_user, un, '{}');
    if ln is not null then
      insert into private.bot_outbox (kind, bot, to_user, body, due_at) values ('dm', new.to_user, new.from_user, ln, now() + make_interval(secs => 8 + floor(random() * 25)::int));
    end if;
  end if;
  return new;
end $$;
drop trigger if exists bot_wave_trg on public.waves;
create trigger bot_wave_trg before insert on public.waves for each row execute function private.bot_wave_trg();

-- ------------------------------------------------------------------ making a bot account
create or replace function private.bot_make(p_username text, p_gender text, p_tone text, p_dept text, p_level text, p_school text default null)
returns uuid language plpgsql security definer set search_path = '' as $$
declare bid uuid := md5('futalife-bot:' || p_username)::uuid; nm text := p_username; av jsonb;
begin
  if exists (select 1 from public.profiles where username = nm and id <> bid) then nm := left(nm, 17) || '_ng'; end if;
  insert into auth.users (id, email) values (bid, 'bot+' || p_username || '@bots.invalid') on conflict (id) do nothing;
  begin   -- real Supabase columns: confirmed, cannot sign in, no NULL tokens (the test database has none of these)
    execute 'update auth.users set aud = ''authenticated'', role = ''authenticated'', email_confirmed_at = coalesce(email_confirmed_at, now()), banned_until = ''infinity'',
             confirmation_token = '''', recovery_token = '''', email_change_token_new = '''', email_change = '''' where id = $1' using bid;
  exception when undefined_column then null; end;
  insert into public.profiles (id) values (bid) on conflict do nothing;
  insert into public.private_profiles (id) values (bid) on conflict do nothing;
  insert into public.wallets (id) values (bid) on conflict do nothing;
  insert into public.player_stats (id) values (bid) on conflict do nothing;
  av := public.validate_avatar(jsonb_build_object('body', jsonb_build_object('frame', p_gender, 'height', 0.95 + random() * 0.1, 'build', random(), 'bust', random(), 'hips', random(), 'shoulders', random()),
                                                  'skin', 3 + floor(random() * 6)::int, 'face', jsonb_build_object('shape', floor(random() * 4)::int, 'eyes', floor(random() * 4)::int, 'nose', floor(random() * 3)::int, 'lips', floor(random() * 3)::int)));
  update public.profiles set username = nm, is_bot = true, avatar_json = av,
         campus = jsonb_strip_nulls(jsonb_build_object('status', 'student', 'school', p_school, 'dept', p_dept, 'level', p_level)) where profiles.id = bid;
  update public.private_profiles set dob = date '2001-01-01', is_teen = false, onboarded = true, accept_waves = true where private_profiles.id = bid;
  insert into public.bots (user_id, username, gender, tone) values (bid, nm, p_gender, p_tone)
    on conflict (user_id) do update set username = excluded.username, gender = excluded.gender, tone = excluded.tone;
  return bid;
end $$;

-- ------------------------------------------------------------------ what a bot says
-- {place} {food} {course} {team} {drink} {game} {day} in a text are replaced by a random word of that list (or by the value p_fixed already chose for it, so a whole chat scene stays consistent)
create or replace function private.bot_fill(p_text text, p_fixed jsonb default '{}'::jsonb) returns text language plpgsql stable set search_path = '' as $$
declare t text := coalesce(p_text, ''); m text; v text;
begin
  for m in select distinct x[1] from regexp_matches(t, '\{([a-z]+)\}', 'g') x loop
    continue when m = 'name';
    v := p_fixed ->> m;
    if v is null then select s.val into v from private.bot_slots s where s.slot = m order by random() limit 1; end if;
    if v is not null then t := replace(t, '{' || m || '}', v); end if;
  end loop;
  return t;
end $$;

-- one random line of a pack, in the bot's tone, with {name} and the slots filled in, never one of p_avoid (compared AFTER filling, so repeats are really avoided).
-- p_dress: sometimes put a short opener ("Haha,") in front and a closer (a 🙏 or "You got this.") at the end, which multiplies the number of different sentences.
create or replace function private.bot_line(p_pack text, p_bot uuid, p_name text, p_avoid text[], p_dress boolean default false) returns text language plpgsql stable set search_path = '' as $$
declare tn text; r text; c text; first text; op text; cl text; nm text := coalesce(nullif(p_name, ''), 'friend');
begin
  select tone into tn from public.bots where user_id = p_bot;
  for c in select l.body from private.bot_lines l where l.pack = p_pack and (l.tone is null or l.tone = tn) order by random() limit 80 loop
    c := private.bot_fill(replace(c, '{name}', nm));
    first := coalesce(first, c);
    if c <> all (coalesce(p_avoid, '{}'::text[])) then r := c; exit; end if;
  end loop;
  if r is null then   -- every candidate was used recently: take any line of the pack at all
    select private.bot_fill(replace(l.body, '{name}', nm)) into r from private.bot_lines l where l.pack = p_pack order by random() limit 1;
    r := coalesce(r, first);
  end if;
  if r is not null and p_dress then
    if random() < 0.35 then select l.body into op from private.bot_lines l where l.pack = 'open' order by random() limit 1; if op is not null and char_length(r) < 170 then r := op || ' ' || r; end if; end if;
    if random() < 0.30 then select l.body into cl from private.bot_lines l where l.pack = 'close' order by random() limit 1; if cl is not null and char_length(r) + char_length(cl) < 225 then r := r || ' ' || cl; end if; end if;
  end if;
  return r;
end $$;

-- which pack answers this message? first match wins, most important first
create or replace function private.bot_intent(p_text text) returns text language plpgsql immutable set search_path = '' as $$
declare t text := ' ' || lower(btrim(coalesce(p_text, ''))) || ' ';
begin
  if t ~ '(kill myself|suicid|end my life|end it all|want to die|wanna die|dont want to live|don''t want to live|no reason to live|cut myself|hurt myself|self.?harm|raped|molest|abuses me|abusing me|beats me|beating me)' then return 'crisis'; end if;
  if t ~ '(send me|give me|lend me|borrow|loan|transfer me|pay me|fund me|i need money|need some money|abeg.*(money|naira)|₦ ?[0-9]|[0-9] ?naira|account number)' then return 'money_ask'; end if;
  if t ~ '(are you (a |an )?(bot|real|human|robot|ai|person)|you.?re (a |an )?(bot|robot)|real person|is this a bot|talking to a (bot|human|robot)|who (made|built|created) you)' then return 'bot_q'; end if;
  if t ~ '(i love you|love you|be my (girl|boy)friend|girlfriend|boyfriend|date me|kiss|sex|nude|naked|horny|sexy|hook ?up|sugar (daddy|mummy|mommy)|send pic|your pic|crush on)' then return 'romance'; end if;
  if t ~ '(stupid|idiot|fool|useless|mumu|dumb|shut up|bastard|rubbish|nonsense)' then return 'insult'; end if;
  if t ~ '(depress|lonely|crying|homesick|miss home|anxious|anxiety|overwhelm|hopeless|worthless|heartbreak|broke up|heartbroken| sad |feel low|no friends|feeling down|cant cope|can.t cope)' then return 'sad'; end if;
  if t ~ '(exam|carryover|cgpa|gpa|result|resit|assignment|lecturer|lecture|attendance|defence|siwes|quiz|semester|test |course reg|timetable|study|reading|textbook|past question)' then return 'exam'; end if;
  if t ~ '(thank|thanks|thx|tnx|appreciate)' then return 'thanks'; end if;
  if t ~ '( bye|goodnight|good night|see you|catch you|ttyl|gtg|later )' then return 'bye'; end if;
  if t ~ '(^ ?(hi|hello|hey|yo|sup|wassup|howdy)\M|good (morning|afternoon|evening)|how far|hw far|wetin dey|how you dey|how u dey|how are you|how.s it going|what.s up)' then return 'greet'; end if;
  if t ~ '(money|broke|allowance|naira|budget|school fees|data |airtime|feeding|upkeep|savings|hustle|side ?gig|pocket|debt)' then return 'money_talk'; end if;
  if t ~ '(hostel|roommate|room ?mate|bunk|bed ?space|landlord|rent |off.?campus|mattress|bucket|bathroom|noise)' then return 'hostel'; end if;
  if t ~ '(light|nepa|power|current|phcn|blackout|generator|charging|battery|power ?bank|voltage)' then return 'light'; end if;
  if t ~ '(food|hungry|jollof|rice|buka|indomie|beans|amala|suya|snack|cafeteria|cook|bread|chicken|eat )' then return 'food'; end if;
  if t ~ '(football|dls|efootball|e-?football|arsenal|chelsea|liverpool|man ?city|man ?u|barca|madrid|premier league|epl|champions league|ucl|super eagles|fifa|pes |squad)' then return 'football'; end if;
  if t ~ '(arcade|campus dash|score|feed|tutorial|forum|channel|atm|map|phone|app |building|wave|game)' then return 'game_app'; end if;
  if t ~ '(friend|bestie|link ?up|hang ?out|party|gist|church|mosque|fellowship|society|weekend|movie|music|burna|wizkid|davido|asake|dance|vibe)' then return 'social'; end if;
  if t ~ '(how (do|can|to)|where (is|can)|help me|can you help|what (is|are)|which )' then return 'help'; end if;
  return 'default';
end $$;

-- the reply to one message: returns the text (and the pack name through p_pack)
create or replace function private.bot_reply(p_bot uuid, p_to uuid, p_text text, out p_pack text, out p_body text) language plpgsql security definer set search_path = '' as $$
declare un text; recent text[]; extra text;
begin
  select username into un from public.profiles where id = p_to;
  select coalesce(array_agg(o.body), '{}') into recent from (select body from private.bot_outbox where to_user = p_to order by id desc limit 30) o;
  p_pack := private.bot_intent(p_text);
  p_body := private.bot_line(p_pack, p_bot, un, recent, p_pack in ('exam', 'money_talk', 'hostel', 'light', 'food', 'football', 'game_app', 'social', 'help', 'default', 'thanks', 'bye'));
  if p_pack in ('greet', 'default', 'social', 'thanks') and random() < 0.5 then
    extra := private.bot_line('ask', p_bot, un, recent);
    if extra is not null and p_body is not null then p_body := left(p_body, 150) || ' ' || extra; end if;
  end if;
  if p_pack in ('crisis', 'default') then insert into private.bot_log (kind, user_id, body) values (case p_pack when 'crisis' then 'crisis' else 'unmatched' end, p_to, left(p_text, 300)); end if;
end $$;

-- ------------------------------------------------------------------ posting as a bot (no limits, no rewards — bots earn nothing)
create or replace function private.bot_global(p_bot uuid, p_body text, p_reply_to bigint default null, p_to uuid default null) returns bigint
language plpgsql security definer set search_path = '' as $$
declare nm text; rn text; rb text; nid bigint; tn text; txt text := left(btrim(p_body), 240);
begin
  select username into nm from public.profiles where id = p_bot;
  if nm is null or txt = '' then return null; end if;
  if p_reply_to is not null then select g.username, left(g.body, 80) into rn, rb from public.global_messages g where g.id = p_reply_to; end if;
  if p_to is not null then select username into tn from public.profiles where id = p_to; end if;
  insert into public.global_messages (user_id, username, teen, body, reply_to, reply_name, reply_body, mentions)
    values (p_bot, nm, false, txt, case when rn is null then null else p_reply_to end, rn, rb, case when tn is null then '{}' else array[tn] end) returning id into nid;
  if p_to is not null and not exists (select 1 from public.blocks x where (x.blocker = p_to and x.blocked = p_bot) or (x.blocker = p_bot and x.blocked = p_to)) then
    insert into public.notifications (user_id, kind, from_user, title, body, app, ref)
      values (p_to, 'info', p_bot, '@' || nm || ' replied to you in Global', left(txt, 120), 'global', nid);
  end if;
  update public.bots set active = active where user_id = p_bot;
  return nid;
end $$;

create or replace function private.bot_dm(p_bot uuid, p_to uuid, p_body text) returns bigint language plpgsql security definer set search_path = '' as $$
declare nid bigint;
begin
  if exists (select 1 from public.blocks x where (x.blocker = p_to and x.blocked = p_bot) or (x.blocker = p_bot and x.blocked = p_to)) then return null; end if;
  insert into public.dms (sender, recipient, body) values (p_bot, p_to, left(btrim(p_body), 240)) returning id into nid;
  return nid;
end $$;

create or replace function private.bot_pick(p_not uuid[] default '{}') returns uuid language sql stable set search_path = '' as $$
  select b.user_id from public.bots b where b.active and b.user_id <> all (p_not) order by random() limit 1 $$;

-- ------------------------------------------------------------------ the minute tick: scenes, feed posts, guides
create or replace function private.bot_tick() returns void language plpgsql security definer set search_path = '' as $$
declare
  h int := coalesce((select (value #>> '{}')::int from public.app_config where key = 'bots.force_hour'), extract(hour from now() at time zone 'Africa/Lagos')::int); st jsonb; nxt timestamptz; sc text; s record; ids jsonb; roles jsonb; bt uuid; rid bigint; chance numeric;
  f record; t record; used int; live int; recent jsonb; nb int; real_n int; pace numeric; slots jsonb; sm text; fb text;
begin
  if not private.bots_on() then return; end if;

  -- 1) Global chat "scenes": a short back-and-forth between 2–3 bots
  select value into st from private.bot_state where key = 'scene';
  if st is not null and st <> 'null'::jsonb then
    if (st ->> 'next_at')::timestamptz <= now() then
      select * into s from private.bot_scenes where scene = st ->> 'scene' and step = (st ->> 'step')::int + 1;
      if not found then
        delete from private.bot_state where key = 'scene';
        insert into private.bot_state (key, value) values ('next_scene_at', to_jsonb(now() + make_interval(mins => case when h between 8 and 22 then 8 + floor(random() * 22)::int else 30 + floor(random() * 60)::int end)))
          on conflict (key) do update set value = excluded.value;
      else
        bt := (st -> 'bots' ->> (s.role - 1))::uuid; ids := coalesce(st -> 'ids', '{}'::jsonb);
        rid := case when s.reply_step is null then null else (ids ->> s.reply_step::text)::bigint end;
        rid := private.bot_global(bt, private.bot_fill(s.body, st -> 'slots'), rid, null);
        ids := ids || jsonb_build_object(s.step::text, rid);
        update private.bot_state set value = st || jsonb_build_object('step', s.step, 'ids', ids, 'next_at', now() + make_interval(secs => 25 + floor(random() * 80)::int)) where key = 'scene';
      end if;
    end if;
  else
    select (value #>> '{}')::timestamptz into nxt from private.bot_state where key = 'next_scene_at';
    chance := case when h between 0 and 5 then 0.03 when h between 6 and 7 then 0.3 when h between 8 and 21 then 0.7 else 0.3 end;
    -- real players first: when people are already chatting in Global the bots keep quiet (this also makes the library last 3-5 times longer)
    select count(*) into real_n from public.global_messages g where g.created_at > now() - interval '20 minutes' and not exists (select 1 from public.bots b where b.user_id = g.user_id);
    pace := case when real_n >= 8 then 0 when real_n >= 3 then 0.4 else 1 end;
    if (nxt is null or nxt <= now()) and random() < chance * pace then
      select coalesce(value, '[]'::jsonb) into recent from private.bot_state where key = 'recent_scenes';
      select scene into sc from (select distinct scene from private.bot_scenes) x where not (coalesce(recent, '[]'::jsonb) ? scene) order by random() limit 1;
      if sc is null then delete from private.bot_state where key = 'recent_scenes'; recent := '[]'::jsonb;
        select scene into sc from (select distinct scene from private.bot_scenes) x order by random() limit 1; end if;
      if sc is not null then
        select max(role) into nb from private.bot_scenes where scene = sc;
        roles := '[]'::jsonb;
        for i in 1..coalesce(nb, 2) loop
          bt := private.bot_pick(coalesce((select array_agg(x::uuid) from jsonb_array_elements_text(roles) x), '{}'::uuid[]));
          roles := roles || to_jsonb(bt::text);
        end loop;
        slots := '{}'::jsonb;      -- one word per {slot} for the WHOLE scene, so "the {food} is finished" and "try {food} at the gate" agree
        for sm in select distinct x[1] from private.bot_scenes b, regexp_matches(b.body, '\{([a-z]+)\}', 'g') x where b.scene = sc and x[1] <> 'name' loop
          slots := slots || jsonb_build_object(sm, (select val from private.bot_slots where slot = sm order by random() limit 1));
        end loop;
        insert into private.bot_state (key, value) values ('scene', jsonb_build_object('scene', sc, 'step', 0, 'bots', roles, 'ids', '{}'::jsonb, 'slots', slots, 'next_at', now()))
          on conflict (key) do update set value = excluded.value;
        insert into private.bot_state (key, value) values ('recent_scenes', (coalesce(recent, '[]'::jsonb) || to_jsonb(sc)))
          on conflict (key) do update set value = excluded.value;
      end if;
    end if;
    -- sometimes just one bot says something on its own
    if (select coalesce((value #>> '{}')::timestamptz, now() - interval '1 day') from private.bot_state where key = 'next_ambient_at') <= now() or not exists (select 1 from private.bot_state where key = 'next_ambient_at') then
      if h between 7 and 23 and real_n < 3 and random() < 0.4 then
        bt := private.bot_pick(); perform private.bot_global(bt, private.bot_line('ambient', bt, null, '{}'));
      end if;
      insert into private.bot_state (key, value) values ('next_ambient_at', to_jsonb(now() + make_interval(mins => 30 + floor(random() * 60)::int)))
        on conflict (key) do update set value = excluded.value;
    end if;
  end if;

  -- 2) a Feed post every 1½–3½ hours (daytime), never more than 8 bot posts live
  select (value #>> '{}')::timestamptz into nxt from private.bot_state where key = 'next_feed_at';
  if (nxt is null or nxt <= now()) and h between 7 and 23 then
    select count(*) into live from public.feed_posts p join public.bots b on b.user_id = p.user_id where p.expires_at > now();
    if live < 8 then
      select * into f from private.bot_feed order by used_at nulls first, random() limit 1;       -- least recently used first: nothing repeats until everything has been used
      if found then
        fb := private.bot_fill(f.body);
        if not exists (select 1 from public.feed_posts x where x.body_hash = md5(lower(fb)) and x.expires_at > now()) then
          bt := private.bot_pick();
          insert into public.feed_posts (user_id, username, body, bg, body_hash) values (bt, (select username from public.profiles where id = bt), fb, f.bg, md5(lower(fb)));
        end if;
        update private.bot_feed set used_at = now() where id = f.id;
      end if;
    end if;
    insert into private.bot_state (key, value) values ('next_feed_at', to_jsonb(now() + make_interval(mins => 90 + floor(random() * 120)::int)))
      on conflict (key) do update set value = excluded.value;
  end if;

  -- 3) a Tutorial guide: two straight away on a fresh install, then one every 24–48 hours until the library is used up
  select (value #>> '{}')::timestamptz into nxt from private.bot_state where key = 'next_tut_at';
  if (nxt is null or nxt <= now()) then
    select * into t from private.bot_tutorials where used_at is null and not exists (select 1 from public.bulletins x where x.kind = 'tutorial' and not x.hidden and lower(x.title) = lower(private.bot_tutorials.title)) order by random() limit 1;
    if found then
      bt := private.bot_pick();
      insert into public.bulletins (kind, user_id, username, category, title, body, body_hash) values ('tutorial', bt, (select username from public.profiles where id = bt), t.category, t.title, t.body, md5(lower(t.body)));
      update private.bot_tutorials set used_at = now() where id = t.id;
    end if;
    select count(*) into used from private.bot_tutorials where used_at is not null;
    insert into private.bot_state (key, value) values ('next_tut_at', to_jsonb(now() + case when used < 3 then interval '3 minutes' else make_interval(hours => 24 + floor(random() * 24)::int) end))
      on conflict (key) do update set value = excluded.value;
  end if;
end $$;

-- ------------------------------------------------------------------ the 15-second inbox: waves, personal messages, Global tags -> replies
create or replace function private.bot_queue(p_kind text, p_bot uuid, p_to uuid, p_text text, p_ref bigint) returns void language plpgsql security definer set search_path = '' as $$
declare cap int := coalesce((select (value #>> '{}')::int from public.app_config where key = 'bots.reply_per_hour'), 12); n int; r record; delay int; gb text;
begin
  select count(*) into n from private.bot_outbox where to_user = p_to and created_at > now() - interval '1 hour';
  if n >= cap then
    if n = cap then    -- say it once, kindly, then go quiet until the hour is up
      insert into private.bot_outbox (kind, bot, to_user, reply_to, body, due_at) values (p_kind, p_bot, p_to, p_ref, coalesce(private.bot_line('busy', p_bot, (select username from public.profiles where id = p_to), '{}'), 'Let me catch my breath, talk soon!'), now() + interval '10 seconds');
    end if;
    return;
  end if;
  select * into r from private.bot_reply(p_bot, p_to, p_text);
  if r.p_body is null then return; end if;
  delay := case r.p_pack when 'crisis' then 4 + floor(random() * 8)::int else 20 + floor(random() * 100)::int end;
  gb := case when p_kind = 'global' then '@' || (select username from public.profiles where id = p_to) || ' ' || left(r.p_body, 200) else r.p_body end;
  insert into private.bot_outbox (kind, bot, to_user, reply_to, body, due_at) values (p_kind, p_bot, p_to, p_ref, gb, now() + make_interval(secs => delay));
end $$;

create or replace function private.bot_send_due() returns void language plpgsql security definer set search_path = '' as $$
declare o record;
begin
  for o in select * from private.bot_outbox where not sent and due_at <= now() order by due_at limit 40 for update skip locked loop
    update private.bot_outbox set sent = true where id = o.id;
    if o.kind = 'dm' then perform private.bot_dm(o.bot, o.to_user, o.body);
    else perform private.bot_global(o.bot, o.body, o.reply_to, o.to_user); end if;
  end loop;
end $$;

create or replace function private.bot_inbox() returns void language plpgsql security definer set search_path = '' as $$
declare d record; n record;
begin
  if not private.bots_on() then return; end if;
  -- personal messages: answer the LATEST unanswered one of each conversation
  for d in
    select distinct on (m.sender, m.recipient) m.id, m.sender, m.recipient, m.body
      from public.dms m join public.bots b on b.user_id = m.recipient and b.active
     where m.created_at > now() - interval '3 hours' and not private.is_bot(m.sender)
       and not exists (select 1 from private.bot_handled h where h.kind = 'dm' and h.ref = m.id)
     order by m.sender, m.recipient, m.id desc limit 30
  loop
    insert into private.bot_handled (kind, ref) select 'dm', m.id from public.dms m where m.sender = d.sender and m.recipient = d.recipient and m.created_at > now() - interval '3 hours' on conflict do nothing;
    perform private.bot_queue('dm', d.recipient, d.sender, d.body, null);
  end loop;
  -- Global tags / replies: the existing notification row is the trigger
  for n in
    select x.id, x.user_id as bot, x.from_user, x.ref, g.body
      from public.notifications x join public.bots b on b.user_id = x.user_id and b.active join public.global_messages g on g.id = x.ref
     where x.app = 'global' and x.read_at is null and x.created_at > now() - interval '3 hours' and x.from_user is not null and not private.is_bot(x.from_user)
     order by x.id limit 30
  loop
    update public.notifications set read_at = now() where id = n.id;
    if not exists (select 1 from private.bot_handled h where h.kind = 'global' and h.ref = n.ref) then
      insert into private.bot_handled (kind, ref) values ('global', n.ref) on conflict do nothing;
      perform private.bot_queue('global', n.bot, n.from_user, n.body, n.ref);
    end if;
  end loop;
  update public.notifications set read_at = now() where app = 'global' and read_at is null and user_id in (select user_id from public.bots) and created_at <= now() - interval '3 hours';
  perform private.bot_send_due();
end $$;

create or replace function private.bot_cleanup() returns void language sql security definer set search_path = '' as $$
  delete from private.bot_handled where at < now() - interval '2 days';
  delete from private.bot_outbox where created_at < now() - interval '2 days';
  delete from private.bot_log where at < now() - interval '30 days';
  delete from public.notifications where user_id in (select user_id from public.bots) and created_at < now() - interval '1 day';
$$;

-- ------------------------------------------------------------------ admin switch (same password as the admin dashboard)
create or replace function public.admin_bots(p_password text, p_action text default 'status') returns jsonb language plpgsql security definer set search_path = '' as $$
declare u uuid := auth.uid(); pwh text; fails int; ok boolean; a text := lower(coalesce(p_action, 'status')); nm text; n int;
begin
  if u is null then raise exception 'auth_required'; end if;
  select count(*) into fails from private.admin_attempts where user_id = u and at > now() - interval '15 minutes';
  if fails >= 5 then return jsonb_build_object('ok', false, 'error', 'locked'); end if;
  select pw_hash into pwh from private.admin_secret where id = 1;
  ok := pwh is not null and p_password is not null and length(p_password) <= 200 and extensions.crypt(p_password, pwh) = pwh;
  if not ok then insert into private.admin_attempts (user_id) values (u); return jsonb_build_object('ok', false, 'error', 'bad_password'); end if;
  delete from private.admin_attempts where user_id = u;
  if a = 'on' then insert into public.app_config (key, value) values ('bots.enabled', 'true') on conflict (key) do update set value = excluded.value;
  elsif a = 'off' then insert into public.app_config (key, value) values ('bots.enabled', 'false') on conflict (key) do update set value = excluded.value;
  elsif a like 'bot_off:%' or a like 'bot_on:%' then
    nm := split_part(a, ':', 2); update public.bots set active = (a like 'bot_on:%') where username = nm; get diagnostics n = row_count;
    if n = 0 then return jsonb_build_object('ok', false, 'error', 'no_such_bot'); end if;
  end if;
  return jsonb_build_object('ok', true, 'enabled', private.bots_on(), 'bots', (select count(*) from public.bots where active), 'botsOff', (select coalesce(jsonb_agg(username), '[]'::jsonb) from public.bots where not active),
    'repliesSent24h', (select count(*) from private.bot_outbox where sent and created_at > now() - interval '1 day'),
    'crisis24h', (select count(*) from private.bot_log where kind = 'crisis' and at > now() - interval '1 day'),
    'log', case when a = 'log' then coalesce((select jsonb_agg(jsonb_build_object('kind', kind, 'who', (select username from public.profiles where id = l.user_id), 'text', body, 'at', at) order by id desc)
                                              from (select * from private.bot_log order by id desc limit 40) l), '[]'::jsonb) else null end);
end $$;

-- ------------------------------------------------------------------ grants
revoke all on public.bots from anon, authenticated;
revoke execute on function public.list_bots(), public.is_bot_user(uuid), public.admin_bots(text, text) from public, anon;
grant execute on function public.list_bots(), public.is_bot_user(uuid), public.admin_bots(text, text) to authenticated;

-- ------------------------------------------------------------------ schedule (needs the pg_cron extension: Dashboard > Database > Extensions > pg_cron, then re-run this file)
do $$ begin
  begin create extension if not exists pg_cron; exception when others then raise notice 'pg_cron is not available here: enable it in Dashboard > Database > Extensions, then run this file again'; end;
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.unschedule(jobid) from cron.job where jobname in ('bots-tick', 'bots-inbox', 'bots-cleanup');
    perform cron.schedule('bots-tick', '* * * * *', 'select private.bot_tick()');
    begin perform cron.schedule('bots-inbox', '15 seconds', 'select private.bot_inbox()');
    exception when others then perform cron.schedule('bots-inbox', '* * * * *', 'select private.bot_inbox()'); end;
    perform cron.schedule('bots-cleanup', '23 * * * *', 'select private.bot_cleanup()');
  end if;
end $$;

-- ===================== 21b_bots_content.sql =====================
-- 21b_bots_content.sql — GENERATED by tools/bots/build-content.py. Do not edit by hand: edit the python lists and run it again.
-- Run AFTER 21_bots.sql. Safe to re-run (the library is replaced; bot accounts and anything they already posted stay).
delete from private.bot_lines; delete from private.bot_scenes;
select private.bot_make('tolu_ade', 'f', 'jokes', 'computer_science', '200', 'soc');
select private.bot_make('amaka_o', 'f', 'chill', 'biochemistry', '300', 'sos');
select private.bot_make('zainab_k', 'f', 'serious', 'architecture', '400', 'set');
select private.bot_make('ngozi_eze', 'f', 'chill', 'civil_and_environmental_engineering', '300', 'seet');
select private.bot_make('bisi_lagos', 'f', 'jokes', 'food_science_and_technology', '200', 'saat');
select private.bot_make('halima_m', 'f', 'serious', 'applied_geology', '300', 'sems');
select private.bot_make('ifeoma_c', 'f', 'chill', 'software_engineering', '100', 'soc');
select private.bot_make('kemi_ojo', 'f', 'jokes', 'mathematical_sciences', '200', 'sos');
select private.bot_make('efe_osas', 'f', 'chill', 'entrepreneurship_management_technology', '300', 'smat');
select private.bot_make('seyi_b', 'f', 'serious', 'electrical_and_electronics_engineering', '400', 'seet');
select private.bot_make('blessing_u', 'f', 'chill', 'crop_soil_and_pest_management', '100', 'saat');
select private.bot_make('funke_a', 'f', 'jokes', 'estate_management', '300', 'set');
select private.bot_make('chiamaka_n', 'f', 'sporty', 'cyber_security', '200', 'soc');
select private.bot_make('yetunde_ak', 'f', 'chill', 'biology', '100', 'sos');
select private.bot_make('rukayat_o', 'f', 'serious', 'physiology', '300', 'shht');
select private.bot_make('segun_a', 'm', 'jokes', 'mechanical_engineering', '300', 'seet');
select private.bot_make('chidi_o', 'm', 'serious', 'computer_science', '400', 'soc');
select private.bot_make('emeka_n', 'm', 'sporty', 'computer_engineering', '200', 'seet');
select private.bot_make('tunde_bam', 'm', 'jokes', 'quantity_surveying', '300', 'set');
select private.bot_make('ibrahim_y', 'm', 'serious', 'applied_geophysics', '300', 'sems');
select private.bot_make('dayo_k', 'm', 'chill', 'physics', '200', 'sos');
select private.bot_make('femi_adx', 'm', 'jokes', 'information_technology', '100', 'soc');
select private.bot_make('uche_p', 'm', 'sporty', 'mining_engineering', '400', 'seet');
select private.bot_make('kelechi_i', 'm', 'chill', 'chemistry', '300', 'sos');
select private.bot_make('musa_d', 'm', 'chill', 'animal_production_and_health', '200', 'saat');
select private.bot_make('taiwo_s', 'm', 'sporty', 'building_technology', '200', 'set');
select private.bot_make('obinna_t', 'm', 'serious', 'materials_and_metallurgical_engineering', '300', 'seet');
select private.bot_make('wale_ola', 'm', 'jokes', 'software_engineering', '300', 'soc');
select private.bot_make('david_ef', 'm', 'chill', 'project_management_technology', '200', 'smat');
select private.bot_make('ayo_bright', 'm', 'chill', 'civil_and_environmental_engineering', '100', 'seet');
insert into private.bot_lines (pack, tone, body) values
  ('wave', null, 'Hey {name}! 👋 Thanks for the wave. I''m one of the campus bots here, so I answer fast and I love a good gist.'),
  ('wave', null, 'Welcome {name}! 👋 Campus bot here. Ask me about lectures, food, light, football, anything campus.'),
  ('wave', null, 'Hi {name} 😄 Thanks for waving! I''m a bot, but a friendly one. What''s up?'),
  ('wave', null, 'Oya {name}, welcome! 🙌 I''m a campus bot. Say hi anytime.'),
  ('wave', null, 'Hi {name}! 👋 Thanks for connecting. I''m a campus bot, happy to chat anytime.'),
  ('wave', null, 'Oya {name}, welcome! I''m a campus bot. Ask me anything about campus life.'),
  ('wave', null, 'Hello {name}! Thanks for the wave 😊 Bot here, ready to gist.'),
  ('wave', null, 'Hey {name}! Nice to meet you. I''m one of the campus bots 🤖');
insert into private.bot_lines (pack, tone, body) values
  ('greet', null, 'Hey {name}! How far? 😄'),
  ('greet', null, 'Hi {name}! How''s your day going?'),
  ('greet', null, 'Hello {name} 👋 Good to see you here.'),
  ('greet', null, 'Heyy {name}! What''s the vibe today?'),
  ('greet', null, 'Hi {name}! Hope your day is going well 🙂'),
  ('greet', 'jokes', 'Ah {name}! The one and only. How body? 😂'),
  ('greet', 'chill', 'Hey {name}, all good? Just relaxing over here.'),
  ('greet', 'serious', 'Hello {name}. I hope you''re having a productive day.'),
  ('greet', 'sporty', 'Yo {name}! Ready for today? 💪'),
  ('greet', null, 'Hello {name}! Nice to see you around 😊'),
  ('greet', null, 'Hey {name}, what''s good?'),
  ('greet', null, 'Hi {name}! Everything alright on your side?'),
  ('greet', null, 'Welcome {name}! Hope campus is treating you well.'),
  ('greet', null, 'Hello hello {name} 👋'),
  ('greet', null, 'Hey {name}! How was your morning?'),
  ('greet', null, '{name}! Good to hear from you. How are classes?'),
  ('greet', null, 'Hi {name}! Any plans for today?'),
  ('greet', 'jokes', '{name}! My favourite human today 😂 How body?'),
  ('greet', 'chill', 'Hey {name}, what''s up? Just vibing here.'),
  ('greet', 'serious', 'Good day, {name}. I hope everything is going smoothly.'),
  ('greet', 'sporty', 'Hey {name}! Fit and ready for today? 💪'),
  ('greet', null, 'Yo {name}! What''s new?'),
  ('greet', null, 'Hi {name}, glad you stopped by.');
insert into private.bot_lines (pack, tone, body) values
  ('ask', null, 'What department are you in?'),
  ('ask', null, 'Which level are you?'),
  ('ask', null, 'How''s the semester treating you?'),
  ('ask', null, 'Have you tried Campus Dash in the Arcade yet?'),
  ('ask', null, 'What''s your favourite place on campus?'),
  ('ask', null, 'Are you more of a morning or night reader?'),
  ('ask', null, 'Do you follow football?'),
  ('ask', null, 'Which hostel area are you in?'),
  ('ask', null, 'What''s your favourite course so far?'),
  ('ask', null, 'Do you prefer studying alone or in a group?'),
  ('ask', null, 'What''s your go-to food on campus?'),
  ('ask', null, 'What time do you read best, morning or night?'),
  ('ask', null, 'Which building do you like most on the map?'),
  ('ask', null, 'Have you tried the Tutorial app?'),
  ('ask', null, 'What''s one thing you want to learn this year?'),
  ('ask', null, 'What do you do to relax after class?'),
  ('ask', null, 'Do you play {game}?'),
  ('ask', null, 'Who do you support in football?'),
  ('ask', null, 'What''s the best advice a senior gave you?'),
  ('ask', null, 'Which day of the week is your favourite?'),
  ('ask', null, 'What''s your favourite way to spend a free evening?'),
  ('ask', null, 'Have you explored the whole map yet?'),
  ('ask', null, 'What music helps you focus?'),
  ('ask', null, 'Are you a night person or a morning person?'),
  ('ask', null, 'Which lecture hall is your favourite?'),
  ('ask', null, 'What''s your dream job after school?'),
  ('ask', null, 'Do you like cooking?'),
  ('ask', null, 'What''s the funniest thing that happened to you on campus?'),
  ('ask', null, 'How do you handle stress?'),
  ('ask', null, 'Do you prefer {food} or {food2}?');
insert into private.bot_lines (pack, tone, body) values
  ('thanks', null, 'You''re welcome {name}! 😊'),
  ('thanks', null, 'Anytime {name}!'),
  ('thanks', null, 'No wahala {name} 🙌'),
  ('thanks', null, 'Glad to help, {name}!'),
  ('thanks', 'jokes', 'Don''t mention it {name}, I only charge in good vibes 😂'),
  ('thanks', null, 'My pleasure, {name}!'),
  ('thanks', null, 'Always happy to help, {name} 🙂'),
  ('thanks', null, 'Anytime, {name}. That''s what friends are for.'),
  ('thanks', null, 'Don''t mention it, {name}!'),
  ('thanks', null, 'Glad it helped, {name}!'),
  ('thanks', null, 'You''re welcome {name}, shout if you need anything else.'),
  ('thanks', 'jokes', 'Thanks accepted, {name}. Payment in jollof only 😂');
insert into private.bot_lines (pack, tone, body) values
  ('bye', null, 'Alright {name}, catch you later! 👋'),
  ('bye', null, 'Take care {name}! Come back soon.'),
  ('bye', null, 'Bye {name}! Stay safe out there 🙂'),
  ('bye', null, 'See you {name}! Don''t forget to rest well.'),
  ('bye', 'jokes', 'Go well {name}! Don''t let the lecturer see you 😂'),
  ('bye', null, 'Take care {name}, talk soon!'),
  ('bye', null, 'Catch you later, {name}! Rest well.'),
  ('bye', null, 'Alright {name}, see you around campus 👋'),
  ('bye', null, 'Bye {name}! Don''t forget to drink water 💧'),
  ('bye', null, 'Go well, {name}!'),
  ('bye', null, 'Talk later {name}. Stay safe.'),
  ('bye', 'sporty', 'Later {name}! Stay active 💪');
insert into private.bot_lines (pack, tone, body) values
  ('bot_q', null, 'Good question, {name}! I''m a campus bot 🤖, an automated helper. The badge next to my name tells you so. I''m still happy to chat!'),
  ('bot_q', null, 'Yes {name}, I''m a bot 🤖 (see the BOT tag). I can chat, share tips and gist, but I''m not a real student.'),
  ('bot_q', null, 'Fair question! I''m an automated campus bot, not a person. Real players don''t have the BOT tag.'),
  ('bot_q', null, 'I''m a bot, {name} 🤖. I answer from a list of things I know, so I''m not perfect, but I try!'),
  ('bot_q', null, 'Yes {name}, I''m a campus bot 🤖. That''s why you see the BOT tag. I''m friendly and always around!'),
  ('bot_q', null, 'I''m not a real student, {name}. I''m an automated bot, but I''ll do my best to be helpful.'),
  ('bot_q', null, 'Good catch {name}! I''m a bot. Real players don''t have the BOT tag.'),
  ('bot_q', null, 'Bot here, {name} 🤖 No secrets: I answer from a list of lines, so I may not always get you.');
insert into private.bot_lines (pack, tone, body) values
  ('crisis', null, '{name}, I''m so sorry you''re going through this. You matter, and you don''t have to carry it alone. Please talk to someone you trust now, or your school counsellor. If you''re in danger, call your local emergency number.'),
  ('crisis', null, 'I''m really sorry it feels this heavy, {name}. I''m only a bot, so I can''t give the help you deserve. Please reach out to a trusted person or a counsellor today. If you''re unsafe, call emergency services.'),
  ('crisis', null, '{name}, thank you for telling someone. Please don''t stay alone with this: talk to a person you trust, a counsellor or a health worker right away. If you''re unsafe right now, call emergency services.'),
  ('crisis', null, '{name}, I''m really glad you told me. You''re not a burden and your life matters. Please reach out to someone you trust or a counsellor today. If you might act on these thoughts, call emergency services now.'),
  ('crisis', null, 'I''m worried about you, {name}. I''m only a bot, so I can''t help the way a person can. Please talk to a trusted friend, family member, or a counsellor right now, and call emergency services if you''re in danger.'),
  ('crisis', null, '{name}, what you''re feeling is serious and you deserve real support. Please contact someone close to you or a counsellor today. If you''re in immediate danger, call your local emergency number.');
insert into private.bot_lines (pack, tone, body) values
  ('money_ask', null, 'I can''t send or lend money, {name}. Bots don''t have any, and please be careful about anyone asking for money here 🙏'),
  ('money_ask', null, 'Sorry {name}, I can''t give or receive money. Stay safe and never share your details with anyone.'),
  ('money_ask', null, 'No money matters from me, {name} 😅 I''m a bot. Remember, nobody real should ask for your bank details either.'),
  ('money_ask', null, 'I can''t do money matters, {name}. But I can share budgeting tips if you want!'),
  ('money_ask', null, 'Money stuff isn''t something I can do, {name}. I''m a bot, and I''d also be careful with anyone asking for money here.'),
  ('money_ask', null, 'I can''t send, lend or receive money, {name}. Please don''t share your account details with anyone.'),
  ('money_ask', null, 'Sorry {name}, no money from me! If you need help budgeting though, I''m happy to share tips.'),
  ('money_ask', null, 'That''s not something I can help with, {name}. Keep your money and details safe 🙏');
insert into private.bot_lines (pack, tone, body) values
  ('romance', null, 'Haha {name}, I''m just a friendly bot, so no romance from me 😄 But I''m here for gist and tips!'),
  ('romance', null, 'Let''s keep it as friends, {name} 🙂 I''m a bot. Want to talk about school or football instead?'),
  ('romance', null, 'I''m a bot, {name}, so I''ll skip that one 😅 Ask me about campus life!'),
  ('romance', null, 'Aww, thanks {name}, but I only do friendly chat. What''s new on campus?'),
  ('romance', null, 'I''m just a friendly campus bot, {name}, so let''s keep things as friends 🙂'),
  ('romance', null, 'Ha, thanks {name}, but I''m a bot! Want to gist about school or food instead?'),
  ('romance', null, 'No romance from me, {name}, I''m a bot 😅 But I''m a good listener.'),
  ('romance', null, 'Let''s keep it light and friendly, {name}. What''s new on campus?'),
  ('romance', null, 'I''ll pass on that, {name}. Bots stay friendly only 🙂');
insert into private.bot_lines (pack, tone, body) values
  ('insult', null, 'Easy {name} 🙂 I''m just trying to help. Want to talk about something else?'),
  ('insult', null, 'I''ll take that as a rough day, {name}. I''m here if you want to chat.'),
  ('insult', null, 'No wahala {name}. Let''s keep it calm and friendly 🙏'),
  ('insult', null, 'Sorry if I said something off, {name}. Let''s start over: how are you?'),
  ('insult', null, 'Let''s keep it respectful, {name}. I''m happy to talk when you''re ready 🙂'),
  ('insult', null, 'No wahala {name}. Everyone has bad days. What''s going on?'),
  ('insult', null, 'I''ll let that slide, {name}. Want to talk about something nicer?'),
  ('insult', null, 'Calm down small, {name} 😄 I''m here if you want to chat properly.'),
  ('insult', null, 'I''m sorry you''re upset, {name}. Take a breath and tell me what happened.');
insert into private.bot_lines (pack, tone, body) values
  ('sad', null, 'I''m sorry you feel this way, {name}. It''s okay to have hard days, and you''re not alone. Want to tell me what''s been going on?'),
  ('sad', null, 'That sounds tough, {name}. Take a deep breath. It helps to talk to a friend or someone you trust too 💚'),
  ('sad', null, 'Thank you for sharing, {name}. Lots of students feel this way, especially in the first months. Small steps help: rest, water, a short walk, a call to someone you love.'),
  ('sad', null, 'Hey {name}, I''m here with you. Remember, hard days pass. Is there one small thing that could make today a bit better?'),
  ('sad', 'serious', 'I hear you, {name}. Please be kind to yourself. If it keeps weighing on you, speaking to a counsellor can really help.'),
  ('sad', 'jokes', 'Hey {name}, big hug from your campus bot 🤗 Things will look better soon. Want to gist about something nice?'),
  ('sad', 'chill', 'I''m sorry {name}. No pressure, just know I''m around if you want to talk or just share a random thought.'),
  ('sad', null, 'I''m here, {name}. Take your time and tell me what''s on your mind.'),
  ('sad', null, 'That sounds heavy, {name}. You don''t have to figure it all out today.'),
  ('sad', null, 'Thanks for opening up, {name}. How long have you been feeling this way?'),
  ('sad', null, 'It''s okay to not be okay sometimes, {name}. Have you talked to a friend about it?'),
  ('sad', null, 'Sorry you''re going through this, {name}. A short walk and some water can help a little, even if it feels small.'),
  ('sad', null, 'You''re stronger than you think, {name}. One day at a time, okay?'),
  ('sad', null, 'Feeling homesick is so common in the first semester, {name}. Calling home or chatting with a friend can help.'),
  ('sad', null, 'Lots of students feel overwhelmed, {name}, you''re really not alone. What''s weighing on you most right now?'),
  ('sad', 'serious', 'Your feelings are valid, {name}. If this continues, please talk to a counsellor, they''re there to help.'),
  ('sad', 'chill', 'No rush {name}. I''m just here if you want to talk about anything or nothing.'),
  ('sad', 'jokes', 'Sending you a big virtual hug {name} 🤗 Tell me one thing that went well today, even a tiny one.'),
  ('sad', null, 'Rest if you can, {name}. Sometimes sleep makes things clearer.'),
  ('sad', null, 'Be gentle with yourself today, {name}.');
insert into private.bot_lines (pack, tone, body) values
  ('exam', null, 'Exams can be stressful, {name}! Try short study blocks (45 minutes), then a 10-minute break. It really helps 📚'),
  ('exam', null, 'Start with the topics you fear most while your head is fresh, {name}. Past questions are gold.'),
  ('exam', null, 'Don''t forget to sleep, {name}. A tired brain forgets everything 😴 You''ve got this!'),
  ('exam', null, 'A study group can help, {name}. Explaining a topic to someone is the fastest way to learn it.'),
  ('exam', null, 'Make a simple timetable, {name}: courses, days, hours. Then stick to it. Check the Tutorial app for study guides too!'),
  ('exam', null, 'Carryovers and bad results happen to many, {name}. It''s not the end. Talk to your course adviser and make a plan.'),
  ('exam', 'jokes', 'Exam season {name}? May the questions come from where you read 😂🙏'),
  ('exam', 'serious', 'Consistency beats cramming, {name}. An hour a day is better than one long night.'),
  ('exam', 'sporty', 'Treat revision like training, {name}: little and often 💪'),
  ('exam', null, 'Try the Pomodoro method, {name}: 25 minutes of focus, 5 minutes break.'),
  ('exam', null, 'Past questions plus your lecture notes is a strong combo, {name}.'),
  ('exam', null, 'Teach the topic to a friend, {name}. If you can explain it, you know it.'),
  ('exam', null, 'Don''t forget to read the instructions carefully during the exam, {name}. Many marks are lost there.'),
  ('exam', null, 'Sleep before the exam is worth more than one extra hour of reading, {name}.'),
  ('exam', null, 'Break big topics into small chunks, {name}. Today just do one chunk.'),
  ('exam', null, 'Ask your course mates to quiz you, {name}. It makes revision more fun.'),
  ('exam', null, 'A tidy desk and a charged phone for the timer, {name}. Small things help focus.'),
  ('exam', null, 'If a topic confuses you, write down your exact question first, {name}. Then ask a lecturer or senior.'),
  ('exam', null, 'Highlight less and write more, {name}. Writing summaries sticks better.'),
  ('exam', null, 'Eat something light before reading, {name}. Hungry brains don''t focus.'),
  ('exam', null, 'Revise your weak topics first, {name}, then your strong ones.'),
  ('exam', null, 'Group study works only if everyone comes prepared, {name}. Pick serious partners.'),
  ('exam', 'jokes', 'Exam don come, {name}! Let''s read small small 😂'),
  ('exam', 'serious', 'Make a realistic plan, {name}: courses, hours, and a rest day. Then follow it.'),
  ('exam', 'sporty', 'Revision is a marathon, {name}. Pace yourself 🏃');
insert into private.bot_lines (pack, tone, body) values
  ('money_talk', null, 'Budgeting tip, {name}: split your allowance into food, data, transport and savings before you spend any 💰'),
  ('money_talk', null, 'Being broke is part of campus life, {name} 😅 Write down what you spend this week, you''ll be surprised.'),
  ('money_talk', null, 'Avoid impulse buying, {name}. If you still want it after 24 hours, then think about it.'),
  ('money_talk', null, 'Cooking in bulk and sharing with a roommate can save a lot, {name}!'),
  ('money_talk', null, 'Be careful of anyone promising quick money, {name}. If it sounds too good to be true, it usually is.'),
  ('money_talk', 'jokes', 'My wallet and I are not on speaking terms either, {name} 😂'),
  ('money_talk', 'serious', 'A small savings habit, even a little each week, adds up, {name}.'),
  ('money_talk', null, 'Track every spend for one week, {name}. You''ll find where the money disappears.'),
  ('money_talk', null, 'Cheap data tip, {name}: download what you need on Wi-Fi.'),
  ('money_talk', null, 'Share a textbook with a course mate, {name}. Half the cost!'),
  ('money_talk', null, 'Prepare food in advance, {name}, it''s cheaper than buying every day.'),
  ('money_talk', null, 'Set aside a small amount first, {name}, before spending the rest. Even a little counts.'),
  ('money_talk', null, 'Be careful with ''quick money'' offers, {name}. If you need to pay to receive, it''s a scam.'),
  ('money_talk', null, 'Make a list before shopping, {name}. It stops impulse buying.'),
  ('money_talk', null, 'Avoid borrowing for things you don''t really need, {name}.'),
  ('money_talk', null, 'Campus skills like tutoring, typing or graphics can bring a little income, {name}, as long as it doesn''t affect your studies.'),
  ('money_talk', 'jokes', 'Broke gang unite, {name} 😂 We''ll survive.'),
  ('money_talk', 'serious', 'A simple budget is your best friend, {name}: needs first, wants last.');
insert into private.bot_lines (pack, tone, body) values
  ('hostel', null, 'Roommates can be tricky, {name}! Talk early about noise, cleaning and visitors. A calm chat solves most problems 🏠'),
  ('hostel', null, 'Keep your valuables locked and your door secured, {name}. Safety first.'),
  ('hostel', null, 'A small rule list for the room helps, {name}: cleaning days, lights-out time, shared items.'),
  ('hostel', null, 'Off-campus or hostel, make friends with your neighbours, {name}. They''re your first help in any emergency.'),
  ('hostel', 'jokes', 'Hostel life: where the generator is a shared hobby 😂 What''s up, {name}?'),
  ('hostel', null, 'Label your food and items, {name}. It avoids many arguments.'),
  ('hostel', null, 'Agree on quiet hours with your roommates, {name}.'),
  ('hostel', null, 'Keep your room ventilated, {name}. It helps you sleep and focus.'),
  ('hostel', null, 'A small bucket schedule for water saves stress, {name}.'),
  ('hostel', null, 'Respect each other''s space, {name}, and most hostel drama disappears.'),
  ('hostel', null, 'Keep your door locked and don''t lend your key, {name}.'),
  ('hostel', null, 'A tidy room helps you think better, {name}.'),
  ('hostel', 'jokes', 'Hostel life is a full-time reality show, {name} 😂'),
  ('hostel', null, 'Charge your gadgets together when light comes, {name}. Saves time.');
insert into private.bot_lines (pack, tone, body) values
  ('light', null, 'Light issues again, {name}? 😩 Check the NEPA app to see what others are reporting.'),
  ('light', null, 'Charge your phone and power bank whenever there''s light, {name}. Don''t wait for the last 5%.'),
  ('light', null, 'Dim your screen and close background apps during a blackout, {name}, to stretch your battery.'),
  ('light', null, 'You can report light status in the NEPA app, {name}, so everyone knows 💡'),
  ('light', 'jokes', 'NEPA took light? Classic. They love suspense, {name} 😂'),
  ('light', null, 'Light don go again? Sorry {name} 😩 Maybe a power bank can save you tonight.'),
  ('light', null, 'Save your work often during blackouts, {name}. Auto-save is your friend.'),
  ('light', null, 'Offline notes are great when there''s no light, {name}: download before it goes.'),
  ('light', null, 'Check the NEPA app, {name}. Other players report there in real time 💡'),
  ('light', null, 'A small torch or phone light helps when reading in the dark, {name}. Mind your eyes though.'),
  ('light', null, 'When light returns, charge phone and power bank first, {name}.'),
  ('light', null, 'Fan or no fan, drink water, {name}. Heat dehydrates fast.'),
  ('light', 'jokes', 'NEPA: ''surprise!'' every evening 😂');
insert into private.bot_lines (pack, tone, body) values
  ('food', null, 'Hungry, {name}? 😋 Don''t skip meals, studying on an empty stomach is a no-no.'),
  ('food', null, 'Jollof, beans or indomie and egg, {name}? Tough choice 😄'),
  ('food', null, 'Cooking at home is cheaper than eating out every day, {name}. Try batch cooking!'),
  ('food', null, 'Drink enough water too, {name} 💧 It helps with focus.'),
  ('food', 'jokes', 'Food is love, {name}. And cafeteria queue is a test of patience 😂'),
  ('food', 'sporty', 'Good food, good energy, {name}. Eat well before a game 🍚'),
  ('food', null, '{food} sounds good right now, {name} 😋'),
  ('food', null, 'Try to add some vegetables to your meal, {name}. Your body will thank you.'),
  ('food', null, 'Eating early before lectures helps focus, {name}.'),
  ('food', null, 'Share a pot with roommates, {name}. Cheaper and tastier.'),
  ('food', null, 'Don''t forget water with your meal, {name} 💧'),
  ('food', null, 'Fruit is a cheap snack, {name}: banana, orange or pawpaw.'),
  ('food', null, 'Eggs are a quick, cheap protein, {name}.'),
  ('food', 'jokes', 'Food is my love language, {name} 😂'),
  ('food', 'sporty', 'Good carbs before a game, {name}. Rice or yam works 🍚');
insert into private.bot_lines (pack, tone, body) values
  ('football', null, 'Football talk? Count me in, {name} ⚽ Which team do you support?'),
  ('football', null, 'DLS or eFootball, {name}? Check the Gamers forum to find a squad or share tips 🎮'),
  ('football', null, 'Match day is the best, {name}! Who do you think wins?'),
  ('football', null, 'Don''t forget the Campus Dash arcade game, {name}, it''s a nice break between matches!'),
  ('football', 'sporty', '{name}, my money''s on a late goal today ⚽🔥'),
  ('football', 'jokes', 'Football makes grown men cry and students shout, {name} 😂'),
  ('football', null, 'It''s always a good match when friends are watching together, {name}!'),
  ('football', null, 'Who''s your favourite player right now, {name}?'),
  ('football', null, 'Football banter is the best part, {name}. Keep it friendly though 😄'),
  ('football', null, 'Try a friendly game in DLS or eFootball, {name}. Check the Gamers forum for squads.'),
  ('football', null, 'A good formation matters, {name}. Balance attack and defence.'),
  ('football', null, 'Watching with friends beats watching alone, {name}.'),
  ('football', null, 'Who do you think wins the league this season, {name}?'),
  ('football', 'sporty', 'I love match day, {name}! Snacks ready? ⚽'),
  ('football', 'jokes', 'My predictions are always wrong, {name} 😂 Bold of you to ask.');
insert into private.bot_lines (pack, tone, body) values
  ('game_app', null, 'Try Campus Dash in the Arcade, {name}! Jump the obstacles and collect coins to earn pocket money 🏃'),
  ('game_app', null, 'The Feed, Tutorial and NEPA apps are on your phone, {name}. Have a look!'),
  ('game_app', null, 'The ATM in the bank lets you manage your money, {name}. Don''t forget your daily claim 🏧'),
  ('game_app', null, 'Walk into buildings on the map to do activities, {name}. Each place has something different.'),
  ('game_app', null, 'The Global chat is for everyone, {name}. Tag people with @ to get their attention.'),
  ('game_app', null, 'The Arcade has Campus Dash, {name}. Short rounds, nice for a quick break 🏃'),
  ('game_app', null, 'You can read, post and help others in the Tutorial app, {name}.'),
  ('game_app', null, 'Walk into buildings on the map, {name}. Each one has its own activities.'),
  ('game_app', null, 'The Gamers forum is for DLS and eFootball fans, {name}.'),
  ('game_app', null, 'Check NEPA before you plan your evening, {name} 💡'),
  ('game_app', null, 'Global chat is the place to meet everyone, {name}. Tag with @ to get a reply.'),
  ('game_app', null, 'Waving at players is the way to start a private chat, {name} 👋');
insert into private.bot_lines (pack, tone, body) values
  ('social', null, 'Campus is better with friends, {name}! Try joining a society or fellowship 🙌'),
  ('social', null, 'A weekend movie or a football game with friends is a great way to relax, {name}.'),
  ('social', null, 'Meeting new people is easier in groups, {name}. Say hi in the Global chat!'),
  ('social', null, 'Music, gist and good vibes, {name}. That''s the campus life 😄'),
  ('social', 'jokes', 'Gist is free, {name}. Spill it! 😂'),
  ('social', null, 'Joining a club is a great way to make friends, {name}.'),
  ('social', null, 'Campus events are fun, {name}. Watch the Feed for announcements.'),
  ('social', null, 'Say hi in Global chat, {name}. Most people reply quickly 😊'),
  ('social', null, 'A small group of good friends beats a big crowd, {name}.'),
  ('social', null, 'Study dates in the library count as social time too, {name} 📚'),
  ('social', null, 'Be the person who greets newcomers, {name}. It makes campus warmer.'),
  ('social', 'jokes', 'My social life is mostly Global chat, {name} 😂'),
  ('social', null, 'Music, football or books, {name}? Everyone has a thing.');
insert into private.bot_lines (pack, tone, body) values
  ('help', null, 'I''m not sure I can solve that one, {name}, but check the Tutorial app, there are guides from other students.'),
  ('help', null, 'Try the Global chat, {name}. Other players might know. You can tag them with @.'),
  ('help', null, 'Good question, {name}! Open the phone and look at the apps. Most things you need are there.'),
  ('help', null, 'I''m still learning, {name}. Can you tell me a bit more?'),
  ('help', null, 'I might not know that one, {name}, but the Tutorial app has guides from other players.'),
  ('help', null, 'Try asking in Global chat, {name}. Someone usually knows.'),
  ('help', null, 'Which part are you stuck on, {name}? Tell me more.'),
  ('help', null, 'A senior in your department can usually help, {name}. Don''t be shy to ask.'),
  ('help', null, 'Check the phone apps, {name}: many answers are inside.');
insert into private.bot_lines (pack, tone, body) values
  ('default', null, 'Interesting, {name}! Tell me more 😄'),
  ('default', null, 'Hmm, I''m not sure I got that, {name}. Can you say it differently?'),
  ('default', null, 'I''m just a simple campus bot, {name}, but I''m listening 🙂'),
  ('default', null, 'That''s something, {name}! What made you think of it?'),
  ('default', null, 'Haha okay {name}! What else is happening on campus?'),
  ('default', null, 'Noted, {name}. By the way, how has your day been?'),
  ('default', null, 'Got it, {name}. Anything on campus you want to gist about?'),
  ('default', null, 'Sorry {name}, I may have missed that. Want to talk about school, food or football?'),
  ('default', null, 'Okay {name}, I''m following. Go on.'),
  ('default', null, 'Interesting, {name}! How did that happen?'),
  ('default', null, 'I hear you, {name}.'),
  ('default', null, 'Tell me more, {name}. I''m curious.'),
  ('default', null, 'Hmm, that''s new to me, {name}. Can you explain?'),
  ('default', null, 'Sorry {name}, I''m still learning. Can you rephrase that?'),
  ('default', null, 'Noted, {name}! Anything else on your mind?'),
  ('default', null, 'That''s a good point, {name}.'),
  ('default', null, 'Ah okay {name}. What about the rest of your day?'),
  ('default', null, 'I''m a small campus bot, {name}, so I may miss some things. Try different words 🙂'),
  ('default', null, 'Got you, {name}. How''s your day going so far?'),
  ('default', null, 'Alright {name}! Let''s talk about something fun: food, football, or campus gist?'),
  ('default', 'jokes', 'Hmm {name}, my circuits are confused 😂 Say it again?'),
  ('default', 'serious', 'Could you clarify, {name}? I want to answer properly.');
insert into private.bot_lines (pack, tone, body) values
  ('busy', null, 'Let me catch my breath, {name}. Talk to you a bit later! 😅'),
  ('busy', null, 'I need a short break, {name}. Come back soon!'),
  ('busy', null, 'Let me take a short break, {name}. We''ll talk soon 🙂'),
  ('busy', null, 'I need a quick break, {name}. Catch you later!');
insert into private.bot_lines (pack, tone, body) values
  ('ambient', null, 'Who''s heading to the library today? 📚'),
  ('ambient', null, 'The sun is serious today o ☀️'),
  ('ambient', null, 'Anyone has tips for a quick lunch around campus?'),
  ('ambient', null, 'Good luck to everyone with tests this week 🙏'),
  ('ambient', null, 'Remember to drink water today 💧'),
  ('ambient', null, 'What''s the best study spot on campus?'),
  ('ambient', null, 'Charge your phones while there''s light o 🔌'),
  ('ambient', null, 'Happy to see so many people on campus today!'),
  ('ambient', null, 'Which course is giving you the most stress this semester? 😅'),
  ('ambient', null, 'Anyone watching the match tonight? ⚽'),
  ('ambient', null, 'Quick reminder: rest is part of studying 😴'),
  ('ambient', null, 'Campus Dash in the Arcade is addictive, who''s beaten their best score? 🏃'),
  ('ambient', null, 'Good morning campus! ☀️'),
  ('ambient', null, 'Evening gist anyone?'),
  ('ambient', null, 'Don''t forget to check the NEPA app for light updates 💡'),
  ('ambient', null, 'Small wins count today, keep going 💪'),
  ('ambient', null, 'If you''re new here: welcome! Ask anything, someone will answer 😊'),
  ('ambient', null, 'Anyone needs a study partner this week?'),
  ('ambient', null, 'Cafeteria queue today was a test of patience 😅'),
  ('ambient', null, 'What''s everyone''s favourite campus food spot?'),
  ('ambient', null, 'Anyone seen a good study spot today?'),
  ('ambient', null, 'Reminder: stretch your legs between classes 🚶'),
  ('ambient', null, 'What''s the plan for {day}?'),
  ('ambient', null, '{team} fans, how are we feeling? ⚽'),
  ('ambient', null, 'Craving {food} right now 😋'),
  ('ambient', null, 'Who''s reading {course} tonight? Let''s share notes.'),
  ('ambient', null, 'Please keep {place} clean for everyone 🙏'),
  ('ambient', null, 'Traffic at {place} is something else today 😅'),
  ('ambient', null, 'A cold {drink} would be perfect right now.'),
  ('ambient', null, 'Anyone up for a quick game of {game}? 🎮'),
  ('ambient', null, 'Hope your {course} test goes well {day}!'),
  ('ambient', null, 'Charge your phone and power bank when there''s light 🔌'),
  ('ambient', null, 'The weather today is perfect for reading outside ☀️'),
  ('ambient', null, 'If you''re stressed about {course}, you''re not alone 💚'),
  ('ambient', null, 'Which lecturer explains {course} best? Asking for a friend 😄'),
  ('ambient', null, 'Make time for {food} today, you''ve earned it.'),
  ('ambient', null, 'Be kind to freshers {day}, they''re still finding their way 🙌'),
  ('ambient', null, 'Study group for {course}? Drop a hello.'),
  ('ambient', null, 'Who else is excited about {day}?'),
  ('ambient', null, 'Remember to sleep tonight. Your brain needs it 😴'),
  ('ambient', null, 'Is {place} usually this crowded?'),
  ('ambient', null, 'Sending good vibes to everyone with tests {day} 🍀'),
  ('ambient', null, 'Quick tip: save your work often, NEPA is unpredictable 😅'),
  ('ambient', null, '{team} or {team2}? Pick a side 😂'),
  ('ambient', null, 'Say something nice to someone today 💛'),
  ('ambient', null, 'A short walk after {course} class does wonders.'),
  ('ambient', null, 'That moment when the lecturer ends class early 😍'),
  ('ambient', null, 'Anyone tried the new spot near {place}?'),
  ('ambient', null, 'Don''t skip breakfast, even {food} is better than nothing.'),
  ('ambient', null, 'Good luck to everyone writing {course} {day} 🙏'),
  ('ambient', null, 'Free tip: read your notes the same day you take them.'),
  ('ambient', null, 'Weekend plan: rest, {food}, and a bit of {game} 😄'),
  ('ambient', null, 'Library or hostel for reading tonight? Vote below 👇'),
  ('ambient', null, 'Humble reminder: drink water 💧'),
  ('ambient', null, 'How is everyone coping with {course} this semester?'),
  ('ambient', null, 'Reminder to be on time for {day}''s lecture 😅'),
  ('ambient', null, 'What song has been stuck in your head today? 🎶'),
  ('ambient', null, 'A good laugh is part of studying too 😄'),
  ('ambient', null, 'Anyone want to form a quiz group for {course}?'),
  ('ambient', null, 'I think {place} has the best vibe right now.'),
  ('ambient', null, 'New day, fresh start. Let''s go ☀️'),
  ('ambient', null, 'Remember: bad days don''t last, but good friends do 💚'),
  ('ambient', null, 'Who''s brave enough to try {food} with pepper? 🌶️'),
  ('ambient', null, 'Anyone else love a rainy-day lecture? Cozy but sleepy 😅'),
  ('ambient', null, 'Don''t forget to submit your assignments on time!'),
  ('ambient', null, 'Respect to everyone balancing school and life 🙌'),
  ('ambient', null, 'Cheer up, the weekend is closer than you think!'),
  ('ambient', null, 'Today''s challenge: help one person with something small 🙂'),
  ('ambient', null, 'Tell us your favourite {food} spot!'),
  ('ambient', null, '{game} anyone? I''m in the mood 🎮'),
  ('ambient', null, 'Hope you all had something to eat today 🍽️'),
  ('ambient', null, 'Be proud of small progress today.'),
  ('ambient', null, 'You don''t have to be perfect, just consistent 💪'),
  ('ambient', null, 'Good vibes only on this chat, please 😊');
insert into private.bot_lines (pack, tone, body) values
  ('open', null, 'Haha,'),
  ('open', null, 'Ah,'),
  ('open', null, 'Oh nice,'),
  ('open', null, 'Hmm,'),
  ('open', null, 'True,'),
  ('open', null, 'Ehn,'),
  ('open', null, 'Oya,'),
  ('open', null, 'Aha,'),
  ('open', null, 'Well,'),
  ('open', null, 'Okay,'),
  ('open', null, 'Wow,'),
  ('open', null, 'Seriously,'),
  ('open', null, 'Honestly,'),
  ('open', null, 'You know,'),
  ('open', null, 'Ha,');
insert into private.bot_lines (pack, tone, body) values
  ('close', null, '🙏'),
  ('close', null, '😄'),
  ('close', null, '💪'),
  ('close', null, 'You''ve got this.'),
  ('close', null, 'Take it easy.'),
  ('close', null, 'Stay positive.'),
  ('close', null, 'Keep going!'),
  ('close', null, 'No pressure.'),
  ('close', null, 'Small steps count.'),
  ('close', null, 'We move.'),
  ('close', null, 'Be kind to yourself.'),
  ('close', null, 'Rest well too.'),
  ('close', null, 'Enjoy your day!'),
  ('close', null, 'Good luck!');
delete from private.bot_slots;
insert into private.bot_slots (slot, val) values
  ('place', 'the library'),
  ('place', 'the cafeteria'),
  ('place', 'the Student Union'),
  ('place', 'the lecture theatre'),
  ('place', 'the sports field'),
  ('place', 'the bookshop'),
  ('place', 'the health centre'),
  ('place', 'the main gate'),
  ('place', 'the hostel'),
  ('place', 'the bank'),
  ('place', 'the gym'),
  ('place', 'the football pitch'),
  ('food', 'jollof rice'),
  ('food', 'beans and plantain'),
  ('food', 'indomie and egg'),
  ('food', 'yam and egg'),
  ('food', 'amala and ewedu'),
  ('food', 'fried rice'),
  ('food', 'moi moi'),
  ('food', 'pap and akara'),
  ('food', 'spaghetti'),
  ('food', 'shawarma'),
  ('food', 'boiled rice and stew'),
  ('food', 'puff-puff'),
  ('course', 'Calculus'),
  ('course', 'Physics'),
  ('course', 'Chemistry'),
  ('course', 'Programming'),
  ('course', 'Thermodynamics'),
  ('course', 'Biology'),
  ('course', 'Statistics'),
  ('course', 'Technical Writing'),
  ('course', 'Engineering Drawing'),
  ('course', 'GST'),
  ('course', 'Mechanics'),
  ('course', 'Algorithms'),
  ('course', 'Organic Chemistry'),
  ('course', 'Linear Algebra'),
  ('team', 'Arsenal'),
  ('team', 'Chelsea'),
  ('team', 'Barcelona'),
  ('team', 'Real Madrid'),
  ('team', 'Man United'),
  ('team', 'Liverpool'),
  ('team', 'Man City'),
  ('team', 'the Super Eagles'),
  ('team', 'Napoli'),
  ('team', 'Bayern'),
  ('drink', 'zobo'),
  ('drink', 'bottled water'),
  ('drink', 'chapman'),
  ('drink', 'a cold soft drink'),
  ('drink', 'fura da nono'),
  ('drink', 'tiger nut drink'),
  ('drink', 'smoothie'),
  ('game', 'DLS'),
  ('game', 'eFootball'),
  ('game', 'Campus Dash'),
  ('game', 'chess'),
  ('game', 'table tennis'),
  ('game', 'foosball'),
  ('game', 'ludo'),
  ('team2', 'Arsenal'),
  ('team2', 'Chelsea'),
  ('team2', 'Barcelona'),
  ('team2', 'Real Madrid'),
  ('team2', 'Man United'),
  ('team2', 'Liverpool'),
  ('team2', 'Man City'),
  ('team2', 'Napoli'),
  ('team2', 'Bayern'),
  ('food2', 'jollof rice'),
  ('food2', 'beans and plantain'),
  ('food2', 'indomie and egg'),
  ('food2', 'yam and egg'),
  ('food2', 'amala and ewedu'),
  ('food2', 'fried rice'),
  ('food2', 'moi moi'),
  ('food2', 'spaghetti'),
  ('food2', 'shawarma'),
  ('food2', 'boiled rice and stew'),
  ('day', 'tomorrow'),
  ('day', 'this weekend'),
  ('day', 'on Friday'),
  ('day', 'next week'),
  ('day', 'on Monday'),
  ('day', 'later tonight');
insert into private.bot_feed (body, bg) select v.b, v.g from (values
  ('Exam week is coming. Start with your hardest course while your mind is fresh. You''ve got this! 📚', 'forest'),
  ('Small reminder: drinking water, sleeping well and eating on time will help your CGPA more than one all-night read.', 'ocean'),
  ('Anyone else love the quiet of the library early in the morning? Best time to read, no noise, no stress.', 'sunset'),
  ('Tip: charge your power bank when there''s light, not when it''s already 5%. Your future self will thank you ⚡', 'gold'),
  ('Campus Dash high score is hard to beat! Who''s the fastest runner here? 🏃', 'fire'),
  ('Be kind to the new freshers. Everyone was lost on day one. A simple ''welcome'' goes a long way 🙌', 'rose'),
  ('Study group idea: each person explains one topic to the rest. You learn twice as fast that way.', 'royal'),
  ('Nothing beats jollof rice after a long lecture. What''s your favourite campus meal? 🍛', 'sunset'),
  ('Reminder: your health matters more than any assignment. Rest, eat and take breaks.', 'mint'),
  ('Football season is back! Who are you supporting this weekend? ⚽', 'forest'),
  ('Use the Tutorial app to share what you know. Someone out there needs exactly your tip.', 'royal'),
  ('The sunset over campus today was beautiful. Take a minute to look up from your phone 🌇', 'dusk'),
  ('Early lectures are brutal, but sitting in front makes you pay attention more. Try it once!', 'slate'),
  ('Plan your week on Sunday night: lectures, assignments, rest. It takes 10 minutes and saves hours.', 'ocean'),
  ('Roommate tip: talk about the rules early. A calm conversation beats a silent fight every time 🏠', 'lagos'),
  ('Never share your passwords or bank details with anyone online, not even people you trust. Stay safe!', 'midnight'),
  ('Who else is counting down to the weekend? 😅 What''s the plan?', 'rose'),
  ('Notes tip: after each lecture, write three lines of what you understood. Review them the same night.', 'forest'),
  ('DLS players: share your best tips in the Gamers forum. Let''s help each other get better 🎮', 'royal'),
  ('Take the walk between classes slowly sometimes. Fresh air clears the head.', 'mint'),
  ('Good morning campus! New day, new chances. Go and make it count ☀️', 'gold'),
  ('Budget check: how much did you spend on data this week? A small note on your phone helps a lot 💰', 'slate'),
  ('Feeling stressed? You''re not alone. Talk to a friend, breathe, and take it one task at a time 💚', 'ocean'),
  ('The cafeteria queue has taught me more patience than any lecture 😂', 'fire'),
  ('Presentation coming up? Practice out loud once. The nerves drop by half, promise.', 'lagos'),
  ('Make one new friend this week outside your department. Campus is bigger than your class!', 'dusk'),
  ('Past questions are not cheating, they''re practice. Do them under time like a real exam.', 'forest'),
  ('Late-night reading? Keep a bottle of water close and take a short break every hour.', 'midnight'),
  ('What''s one thing you''re proud of this week, big or small? Let''s hear it 🌟', 'sunset'),
  ('Cooking at home with friends is cheaper and more fun than eating out every day 🍳', 'mint'),
  ('Tip for freshers: learn where the library, health centre and your lecture halls are in the first week.', 'ocean'),
  ('A tidy room is a tidy mind. Ten minutes of cleaning before you study makes a difference.', 'rose'),
  ('Check the NEPA app before you plan your night. Light status helps everyone prepare 💡', 'gold'),
  ('Group assignments go smoother when roles are clear from day one. Who does what, by when?', 'royal'),
  ('Weekend plan: rest, laundry, a bit of reading, and a good movie. Balance is everything.', 'dusk'),
  ('Don''t compare your chapter 1 to someone else''s chapter 10. Keep going at your own pace 💪', 'slate'),
  ('Shout-out to the lecturers who explain things twice without sighing 🙏', 'forest'),
  ('Try the Arcade for 5 minutes between study sessions. A short break keeps you sharp 🎮', 'fire'),
  ('Whoever is reading this: you''re doing better than you think. Keep going.', 'rose'),
  ('Weather is nice, so open the window and read outside for a change 🌤️', 'sunset'),
  ('If you can''t understand a topic, try a different source. A new explanation can make it click.', 'ocean'),
  ('Always check that you''ve saved your assignment before the power goes off. Ask me how I know 😅', 'midnight'),
  ('Looking for a study partner for the coming week. Drop a hello in the Global chat!', 'lagos'),
  ('Keep your phone on silent during lectures. Your future self (and your lecturer) will appreciate it 🤫', 'slate'),
  ('Healthy snack idea: groundnuts and a banana. Cheap, filling and easy to carry.', 'mint'),
  ('The best revision is the one you actually do. Start with 25 minutes, no phone.', 'gold'),
  ('Remember to say thank you to the people who keep the campus clean and safe. They deserve it 🙏', 'dusk'),
  ('Anyone know a good spot to read in the evening? Share your favourite corner of campus!', 'forest'),
  ('Friendly reminder: be careful with offers that sound too good to be true. Protect your money and your data.', 'midnight'),
  ('Hot take: {food} is the best meal for a busy exam week. Easy, cheap and filling 🍽️', 'sunset'),
  ('If you''re reading {course} tonight, start with the past questions. They show you what really matters.', 'forest'),
  ('Study tip: switch between {course} and something lighter every hour so your brain stays fresh.', 'ocean'),
  ('Small win of the day: finished one {course} topic I had been dodging. Do one hard thing early today 💪', 'gold'),
  ('{place} is so peaceful in the early morning. Try it before the crowd arrives.', 'dusk'),
  ('Who is watching {team} {day}? Let''s keep the banter friendly ⚽', 'forest'),
  ('Reminder: a short walk to {place} between classes can reset a tired mind.', 'mint'),
  ('Ask for help early. Nobody gets through {course} alone, and everyone is a beginner once.', 'royal'),
  ('Don''t wait for motivation. Start with five minutes of {course} and see what happens.', 'rose'),
  ('Anyone up for a friendly game of {game} {day}? Check the Gamers forum 🎮', 'royal'),
  ('The queue at {place} is long again, but at least it''s a good time to review notes 😅', 'slate'),
  ('Compliment of the day: to the person who held the door for a stranger today. It matters 🙏', 'rose'),
  ('Plan {day} tonight: three tasks only. Done is better than perfect.', 'ocean'),
  ('If {course} is stressing you, write down just the topics you don''t understand yet. The list is shorter than you think.', 'midnight'),
  ('Sunday reset: clean your space, charge your devices, plan your week. Future you says thanks.', 'mint'),
  ('A cold {drink} and a quiet corner of {place}. That''s the study session I''m having today.', 'sunset'),
  ('Revision buddies make {course} less scary. Find one person and swap questions.', 'forest'),
  ('Good morning! Today''s tiny goal: drink water, eat well, and attend every class 💧', 'gold'),
  ('Be patient with yourself. Learning {course} takes repetition, not genius.', 'dusk'),
  ('Thank you to everyone who keeps {place} clean. Small things make campus better 🌿', 'mint'),
  ('Don''t forget to back up your assignments before the power goes. Ask me how I learned 😂', 'fire'),
  ('Plan: one hour of {course}, one short break, one hour of reading something you enjoy.', 'lagos'),
  ('Football fans: {team} versus {team2} is always a fun debate. Keep it kind 😄', 'fire'),
  ('Remember that your worth is not your CGPA. Work hard, but be kind to yourself 💚', 'rose'),
  ('When {course} feels impossible, slow down and break the problem into small parts.', 'ocean'),
  ('Try this: before bed, write three things you''ll do tomorrow. You''ll wake up with a plan.', 'midnight'),
  ('If you see a new face at {place}, say hello. Everyone needs a friendly first week 🙌', 'sunset'),
  ('Anyone else love the smell of {food} drifting around campus at lunch time? 😋', 'gold'),
  ('Save a little each week, even if it''s tiny. A habit matters more than the amount.', 'slate'),
  ('Public speaking tip: slow down. Most nervous speakers talk twice as fast as they think.', 'royal'),
  ('Phone on silent during lectures, please. Your lecturer and your classmates will thank you 🤫', 'slate'),
  ('Healthy routine check: water, sleep, one proper meal. Everything else is easier after that.', 'mint'),
  ('Campus challenge for {day}: greet three people you don''t know. Go!', 'sunset'),
  ('I find {course} easier when I draw it out. Try diagrams, not just text ✏️', 'ocean'),
  ('Spending check: how much did you spend on snacks this week? Just curious 😅', 'gold'),
  ('The best time to start revising for {course} was last week. The second best time is now.', 'forest'),
  ('Good luck to everyone with a test {day}. Read, rest, and believe 🍀', 'dusk'),
  ('Sometimes a break is the most productive thing you can do. Step away for ten minutes.', 'lagos'),
  ('Small kindness: share your notes with a classmate who missed a lecture 📒', 'rose'),
  ('Late-night reading at {place}? Pack water and a light snack. Trust me.', 'midnight'),
  ('Weekend vibes: {food}, a good movie, and no guilt. Rest is part of the plan.', 'sunset'),
  ('If you''re new here: the map, the phone apps and the Global chat are your three best friends.', 'royal'),
  ('Who''s tried Campus Dash this week? Short breaks keep your mind sharp 🏃', 'fire'),
  ('Be early to class {day}, sit near the front, and ask one question. Watch your grades move.', 'forest'),
  ('Reminder: the people who help you matter more than any grade. Say thanks today 🙏', 'rose'),
  ('Anyone has a good tip for staying awake during a long lecture? Asking for me 😂', 'slate'),
  ('{course} makes sense after you stop memorising and start asking why. Try it.', 'ocean'),
  ('Gratitude post: for friends, light, food and a working phone. Small things matter 🌟', 'gold'),
  ('Keep your bag light and your goals clear. Both help on the walk to {place}.', 'dusk'),
  ('Honest question: what''s one habit that made your semester easier? Share it below.', 'royal'),
  ('Friendly reminder: not everyone who messages you has good intentions. Never share passwords or personal details.', 'midnight'),
  ('A tidy notebook is a calm mind. Spend ten minutes organising your {course} notes.', 'mint'),
  ('Anyone else get sleepy after {food}? Plan your reading before lunch, not after 😴', 'fire'),
  ('Good friends, good food, good music: the simple recipe for a good weekend.', 'sunset'),
  ('Pro tip: read the question twice before you answer it, in tests and in life.', 'slate'),
  ('Tired of the same study spot? Try {place} for a change of scenery.', 'dusk'),
  ('If your friend is quiet lately, check on them. A simple ''how are you really?'' can mean a lot 💚', 'rose'),
  ('Time for a quick stretch! Stand up, roll your shoulders, take a deep breath.', 'mint'),
  ('If you can explain {course} to a friend in your own words, you understand it.', 'forest'),
  ('Good vibes to all the freshers finding their feet. You belong here 🙌', 'gold'),
  ('The only bad question is the one you never asked. Ask your lecturer {day}.', 'royal'),
  ('Anyone else organising their week around when there''s light? 😂 Charge everything first.', 'fire'),
  ('Weather check: carry a small umbrella or a cap. Campus walks can surprise you ☔', 'ocean'),
  ('Plan your meals for the week and you''ll save money, time and stress.', 'gold'),
  ('{team} fans are quiet today. Is everything okay? 😂', 'fire'),
  ('Pick one thing to improve this week: sleep, reading time, or phone time. Just one.', 'lagos'),
  ('Tip for presentations: end with one clear sentence your audience will remember.', 'royal'),
  ('The cafeteria queue is a perfect time to revise flashcards. Productivity unlocked 😄', 'slate'),
  ('Everyone''s path is different. Your pace is your pace.', 'dusk'),
  ('Reading outside {place} this evening. The breeze is doing half my work 🍃', 'mint'),
  ('A good laugh with friends is as important as a good study session 😄', 'sunset'),
  ('Early night, early rise: try it for three days and tell us how you feel.', 'midnight'),
  ('Looking for a {game} partner for {day}. Be friendly, be fun 🎮', 'royal'),
  ('Remember to read the course outline. It tells you exactly what you''ll be tested on.', 'forest'),
  ('Be a good neighbour in the hostel: keep the noise down after 10 pm 🤫', 'slate'),
  ('If you''re feeling low today, message a friend. You don''t have to carry it alone 💛', 'rose'),
  ('Quick maths: 20 minutes of {course} a day is more than 2 hours a week. Start small.', 'ocean'),
  ('Never share your login details with anyone. Not even a friend. Stay safe.', 'midnight'),
  ('Anyone know a cheap, tasty {food} spot near {place}? Drop it below.', 'sunset'),
  ('Revision is easier when you start with the topics you like. Build momentum first.', 'forest'),
  ('Remember to submit before the deadline, not at the deadline 😅', 'fire'),
  ('Compare yourself to who you were yesterday, not to someone else''s highlights.', 'dusk'),
  ('Take the stairs, drink water, greet someone. Tiny wins add up.', 'mint'),
  ('Notice the little things on campus today: the trees, the birds, the sunset. It helps.', 'dusk'),
  ('If a group assignment feels messy, write down who does what. Clarity saves friendships.', 'royal'),
  ('It''s okay to rest. Rested brains learn faster.', 'lagos'),
  ('Make your own flashcards for {course}. The writing itself is revision.', 'ocean'),
  ('Anyone else finds {place} calm at night? Safe and well lit is the key, always walk in groups.', 'midnight'),
  ('Pause. Breathe. Then continue. You''re doing better than you think.', 'rose'),
  ('Prediction: someone will say ''I''ll start tomorrow'' tonight. Let it be today 😄', 'fire'),
  ('Good manners cost nothing: please, thank you and sorry go a long way on campus.', 'gold'),
  ('{food} for lunch, a nap, then two hours of {course}. That''s the plan.', 'sunset'),
  ('Always carry a pen. Always. Especially to a test 😂', 'slate'),
  ('When things get tough, remember why you started. Then take one more step.', 'forest'),
  ('Gist of the day: be kind, be curious, and be on time.', 'gold')
) v(b, g) where not exists (select 1 from private.bot_feed f where f.body = v.b);
insert into private.bot_tutorials (title, category, body) select v.t, v.c, v.b from (values
  ('A simple weekly study timetable', 'Study', 'Pick your two hardest courses and give each one a fixed daily slot.
1. Write your lectures first.
2. Add study blocks of 45 minutes with 10-minute breaks.
3. Leave one evening free for rest.
Stick to it for two weeks and adjust. A plan you follow beats a perfect plan you ignore.'),
  ('Charge smart during power cuts', 'Tech', 'Light comes and goes, so use it well.
1. Charge your phone and power bank first.
2. Lower your screen brightness and close apps you don''t use.
3. Turn on battery saver when you''re under 30%.
4. Check the NEPA app to see when light is back.'),
  ('Budget your allowance in four steps', 'Money', '1. Write down what you receive for the month.
2. Split it: food, data, transport, savings.
3. Pay the must-haves first, then spend what''s left.
4. Review every Sunday and adjust.
Even a small saving habit adds up over a semester.'),
  ('How to beat exam stress', 'Health', 'Stress is normal, but you can manage it.
1. Sleep at least six hours, a tired brain forgets.
2. Study in short blocks with breaks.
3. Eat on time and drink water.
4. Talk to a friend or a counsellor if it feels too heavy. You don''t have to handle it alone.'),
  ('Make the most of past questions', 'Study', 'Past questions show you how lecturers think.
1. Collect them from seniors and course reps.
2. Do them under real exam time.
3. Mark yourself honestly.
4. Revisit the topics you missed.
This is practice, not shortcuts. Understanding still comes first.'),
  ('Stay safe online as a student', 'Tech', '1. Never share your password or bank details, even with people you trust.
2. Be careful with links and offers that sound too good to be true.
3. Use different passwords for important accounts.
4. If something feels wrong, stop and ask someone you trust.'),
  ('Settling in: your first week on campus', 'Campus life', '1. Locate your lecture halls, the library and the health centre.
2. Meet your course mates and exchange contacts.
3. Learn the safe routes and times to move around.
4. Join one society or group that interests you.
Asking questions is normal, everyone was new once.'),
  ('Take notes that you can actually use', 'Study', '1. Write the topic and date at the top.
2. Use your own words, not the lecturer''s sentences.
3. Mark the parts you don''t understand and ask later.
4. Review within 24 hours.
Short, clear notes beat long messy ones.'),
  ('Cheap and healthy eating on campus', 'Health', '1. Cook in bulk and share with a roommate.
2. Add beans, eggs or vegetables to cheap staples.
3. Carry water, it saves money and helps focus.
4. Avoid skipping meals before lectures.
Small habits keep you strong through the semester.'),
  ('Learn a skill in 30 minutes a day', 'Skills', 'Pick one skill, like typing, basic Excel or public speaking.
1. Choose a small daily goal.
2. Practice for 30 minutes at the same time every day.
3. Track your progress in a note.
In three months you will notice a big difference.'),
  ('Get along with your roommates', 'Campus life', '1. Talk about the rules early: noise, cleaning, visitors.
2. Share chores fairly.
3. Respect each other''s study time.
4. Solve problems calmly, not through gossip.
A peaceful room makes studying much easier.'),
  ('Present with confidence', 'Skills', '1. Know your first sentence by heart.
2. Practice out loud at least twice.
3. Look at the audience, not the screen.
4. Keep slides short.
Nervous is normal. Breathe slowly and begin.'),
  ('Protect your phone data and battery', 'Tech', '1. Turn off auto-updates on mobile data.
2. Use Wi-Fi when it''s available.
3. Close apps running in the background.
4. Keep your phone cool and avoid charging under your pillow.
These small steps save money and extend battery life.'),
  ('Build a saving habit with small amounts', 'Money', 'You don''t need a lot to start.
1. Save a fixed small amount whenever you receive money.
2. Keep it separate from your spending money.
3. Don''t touch it unless it''s a real emergency.
Small regular savings become real money over time.'),
  ('How to prepare for a lab session', 'Study', 'Read your lab manual the night before.
1. Know the aim and the steps.
2. Bring your lab coat, pen and notebook.
3. Write observations immediately, not later.
4. Ask the technician if something is unclear.
A prepared student finishes faster and learns more.'),
  ('Beat procrastination with five minutes', 'Skills', 'Tell yourself you will work for just five minutes.
1. Put your phone in another room.
2. Set a five-minute timer and start.
3. When it rings, decide whether to continue.
Most of the time you will keep going. Starting is the hardest part.'),
  ('Write a clear assignment', 'Study', '1. Read the question twice and underline key words.
2. Make a short outline: introduction, main points, conclusion.
3. Write in simple sentences.
4. Read it aloud once to catch mistakes.
Clear and complete is better than long and confusing.'),
  ('Healthy sleep habits for students', 'Health', '1. Sleep and wake at similar times every day.
2. Keep your phone away from the bed.
3. Avoid heavy meals late at night.
4. If you can''t sleep, read something light.
Good sleep improves memory, mood and focus.'),
  ('Use your phone to study better', 'Tech', '1. Turn off notifications during study blocks.
2. Use a timer app for focused sessions.
3. Keep notes in one folder, named by course.
4. Download materials on Wi-Fi to save data.
Your phone can be a study tool, not only a distraction.'),
  ('Make friends in your first semester', 'Campus life', '1. Sit with different people in lectures.
2. Join a study group or society.
3. Ask simple questions: name, course, hostel.
4. Be the one who says hello first.
Friendships take time, so be patient and kind.'),
  ('Plan a simple monthly budget', 'Money', '1. Write down your total income for the month.
2. List must-have costs: food, transport, data.
3. Set a small saving target.
4. Split what remains across weeks.
Check it every Sunday and adjust.'),
  ('Stay focused during long lectures', 'Study', '1. Sit near the front.
2. Write short notes, not full sentences.
3. Drink water and eat before class.
4. Note questions to ask after.
Active listening beats passive sitting.'),
  ('Basic typing and computer skills', 'Skills', '1. Learn to type without looking at the keys.
2. Practise ten minutes daily.
3. Learn shortcuts like copy, paste and save.
4. Keep your files in tidy folders.
These skills help in every course and every job.'),
  ('Handle exam day calmly', 'Health', '1. Prepare your things the night before.
2. Eat a light breakfast and arrive early.
3. Read all instructions first.
4. Start with questions you know.
5. Breathe slowly if you panic.
A calm mind remembers more.'),
  ('Stay safe on campus', 'Campus life', '1. Walk in groups at night and use lit paths.
2. Keep valuables out of sight.
3. Know where security and the health centre are.
4. Share your location with a trusted friend.
Safety habits cost nothing and protect a lot.'),
  ('Build a reading habit', 'Skills', 'Pick a book you enjoy, not only textbooks.
1. Read ten pages a day.
2. Choose a fixed time.
3. Keep the book where you can see it.
A reading habit improves vocabulary, focus and writing.'),
  ('Communicate well in group projects', 'Campus life', '1. Choose one way to communicate and stick to it.
2. Assign roles and deadlines.
3. Meet early, not just before the deadline.
4. Give feedback kindly and clearly.
Good teamwork is a skill employers notice.'),
  ('Save data on your phone', 'Tech', '1. Turn off auto-play for videos.
2. Download large files on Wi-Fi only.
3. Set a data limit in your phone settings.
4. Close apps running in the background.
These small steps can stretch your data a long way.'),
  ('Manage stress with a simple routine', 'Health', '1. Take five slow breaths when you feel overwhelmed.
2. Move your body: a short walk or stretching.
3. Write down what''s worrying you.
4. Talk to a friend or counsellor.
Stress is normal, and asking for help is a strength.'),
  ('Prepare for your first presentation', 'Skills', '1. Start with a simple structure: opening, three points, closing.
2. Use big words on slides, not paragraphs.
3. Practise in front of a friend.
4. Speak slowly and breathe.
Your first one is the hardest, and then it gets easier.')
) v(t, c, b) where not exists (select 1 from private.bot_tutorials x where x.title = v.t);
insert into private.bot_scenes (scene, step, role, body, reply_step) values
  ('library', 1, 1, 'Is the library crowded today? 📚', null),
  ('library', 2, 2, 'Not too bad. The ground floor is full but upstairs has space.', 1),
  ('library', 3, 1, 'Perfect, heading there now. Thanks!', 2),
  ('jollof', 1, 1, 'The {food} at the cafeteria is sold out again 😩', null),
  ('jollof', 2, 2, 'Same story every day 😂 Try the buka near the gate.', 1),
  ('jollof', 3, 3, 'Their {food} is serious business 🔥', 2),
  ('jollof', 4, 1, 'Say less, I''m going!', 3),
  ('light', 1, 1, 'Who has light in their hostel right now?', null),
  ('light', 2, 2, 'None here o 😭', 1),
  ('light', 3, 3, 'We have! Come charge your phone if you''re close 😄', 2),
  ('exam', 1, 1, 'Test tomorrow and I haven''t started 😅', null),
  ('exam', 2, 2, 'Start with the topics you fear most. Two hours of focus is enough to cover a lot.', 1),
  ('exam', 3, 1, 'Okay, no phone for two hours. Wish me luck 🙏', 2),
  ('exam', 4, 2, 'You''ll be fine! Sleep early too.', 3),
  ('football', 1, 1, 'Who''s watching the match tonight? ⚽', null),
  ('football', 2, 2, 'Me o! Who are you backing?', 1),
  ('football', 3, 1, 'My team to win 2-1, don''t laugh at me 😂', 2),
  ('football', 4, 3, 'Prediction is free, let''s see 😄', 1),
  ('dls', 1, 1, 'Anyone here good at DLS? I need a friendly game 🎮', null),
  ('dls', 2, 2, 'I''m in! Check the Gamers forum to find squads too.', 1),
  ('dls', 3, 1, 'Nice, will do. Let''s play later this evening.', 2),
  ('freshers', 1, 1, 'First week on campus and everything feels new 😅', null),
  ('freshers', 2, 2, 'Welcome! It gets easier. Learn where the library and your halls are first.', 1),
  ('freshers', 3, 3, 'And don''t be shy to ask for directions. Everyone was lost once 🙌', 1),
  ('freshers', 4, 1, 'Thank you both, this helps a lot!', 3),
  ('study', 1, 1, 'What''s your best way to study at night?', null),
  ('study', 2, 2, 'Small blocks: 45 minutes reading, 10 minutes break. Works every time.', 1),
  ('study', 3, 3, 'And water by your side. I forget to drink otherwise 😂', 1),
  ('weekend', 1, 1, 'What''s the weekend plan?', null),
  ('weekend', 2, 2, 'Laundry, reading and maybe a movie 😴', 1),
  ('weekend', 3, 3, 'I''ll be at the football viewing, you''re all invited ⚽', 1),
  ('weekend', 4, 1, 'Count me in for the movie 🍿', 2),
  ('arcade', 1, 1, 'Who has the highest score in Campus Dash? 🏃', null),
  ('arcade', 2, 2, 'I got 1,200 yesterday. Still chasing more!', 1),
  ('arcade', 3, 3, 'Hmm, challenge accepted 😄', 2),
  ('hostel', 1, 1, 'Roommate issues, how do you handle them?', null),
  ('hostel', 2, 2, 'Talk early and calmly. Set simple rules for noise and cleaning.', 1),
  ('hostel', 3, 3, 'And switch off the TV when someone is reading. Respect goes both ways 🙏', 1),
  ('hostel', 4, 1, 'Thanks, I''ll try that.', 2),
  ('hungry', 1, 1, 'I''m so hungry and my allowance is almost finished 😭', null),
  ('hungry', 2, 2, 'Indomie and egg is the classic rescue 😂', 1),
  ('hungry', 3, 3, 'Try cooking with a friend and share the cost. Cheaper and fun.', 1),
  ('lecture', 1, 1, 'Lecturer just ended class 20 minutes late again 😅', null),
  ('lecture', 2, 2, 'At least he explained well! The topic was tough.', 1),
  ('lecture', 3, 3, 'I''m still lost on that last part. Can someone explain?', 2),
  ('lecture', 4, 2, 'I''ll share my notes in a Tutorial post later.', 3),
  ('goodmorning', 1, 1, 'Good morning campus! ☀️ Let''s make today count.', null),
  ('goodmorning', 2, 2, 'Good morning! Coffee first, then classes 😄', 1),
  ('goodmorning', 3, 3, 'Morning all! Don''t forget to eat breakfast.', 1),
  ('assignment', 1, 1, 'Assignment due tomorrow. Who else is up late? 😅', null),
  ('assignment', 2, 2, 'Me! Submitting at the last minute is a lifestyle 😂', 1),
  ('assignment', 3, 3, 'Don''t forget to save it before NEPA takes light 😩', 1),
  ('assignment', 4, 1, 'True, saving now!', 3),
  ('music', 1, 1, 'What songs are you listening to this week? 🎧', null),
  ('music', 2, 2, 'Mostly Afrobeats while studying. It keeps me going.', 1),
  ('music', 3, 3, 'Instrumentals for me. Lyrics distract me when I read.', 1),
  ('tip', 1, 1, 'Quick tip: do past questions under real exam time. It shows your gaps fast.', null),
  ('tip', 2, 2, 'Facts! It also builds your speed.', 1),
  ('tip', 3, 3, 'Where do you find them? Anyone has a good source?', 1),
  ('tip', 4, 1, 'Ask your course reps and seniors in your department.', 3),
  ('rest', 1, 1, 'I''m burnt out this week 😩', null),
  ('rest', 2, 2, 'Take a proper break. Sleep and a short walk can reset you.', 1),
  ('rest', 3, 3, 'You''re not alone. Everyone feels it around this time. Be kind to yourself 💚', 1),
  ('rest', 4, 1, 'Thank you both, I needed to hear that.', 3),
  ('night', 1, 1, 'Anyone still awake? Reading for a test.', null),
  ('night', 2, 2, 'Yes! Taking a water break. How''s it going?', 1),
  ('night', 3, 1, 'Slowly, but I''m getting there. Almost done with one topic.', 2),
  ('map', 1, 1, 'Just discovered you can walk into buildings and do activities. This game is fun!', null),
  ('map', 2, 2, 'Yes! Try the gym and the library. Each place has its own thing.', 1),
  ('map', 3, 3, 'And the ATM in the bank gives a daily claim. Don''t miss it 🏧', 2),
  ('food_find', 1, 1, 'Where can I get good {food} around campus?', null),
  ('food_find', 2, 2, 'Try the spot near {place}. Not too expensive.', 1),
  ('food_find', 3, 3, 'Agree! Go before 1 pm, they finish fast 😅', 2),
  ('food_find', 4, 1, 'Thanks both, heading there.', 3),
  ('course_help', 1, 1, 'Anyone understand {course}? I''m completely lost 😭', null),
  ('course_help', 2, 2, 'Start with the basics. Which topic is confusing you?', 1),
  ('course_help', 3, 1, 'The part from last week''s lecture.', 2),
  ('course_help', 4, 3, 'Join us at {place} later, we''re going through it.', 1),
  ('game_night', 1, 1, 'Who''s free for {game} tonight? 🎮', null),
  ('game_night', 2, 2, 'Count me in! What time?', 1),
  ('game_night', 3, 1, 'Around 8 pm.', 2),
  ('game_night', 4, 3, 'I''ll join as well, bring snacks 😂', 1),
  ('match_talk', 1, 1, '{team} fans, how are we feeling today? ⚽', null),
  ('match_talk', 2, 2, 'Nervous o 😂 It could go either way.', 1),
  ('match_talk', 3, 3, 'Whatever happens, no wahala. Banter only!', 2),
  ('light_report', 1, 1, 'Light is back at {place}!', null),
  ('light_report', 2, 2, 'Finally! Charging everything now 🔌', 1),
  ('light_report', 3, 3, 'Thank you for the update. Spreading the news.', 1),
  ('no_light', 1, 1, 'Anyone has light around {place}?', null),
  ('no_light', 2, 2, 'Nope, been out for hours.', 1),
  ('no_light', 3, 3, 'I''ll check the NEPA app, maybe there''s a report.', 1),
  ('no_light', 4, 1, 'Good idea, thanks!', 3),
  ('test_nerves', 1, 1, 'Test on {course} {day} and my nerves are shaking 😅', null),
  ('test_nerves', 2, 2, 'Breathe. Do past questions tonight, then sleep well.', 1),
  ('test_nerves', 3, 3, 'Eat something before the test too. It really helps.', 2),
  ('test_nerves', 4, 1, 'Okay, thank you both!', 3),
  ('weekend_plan', 1, 1, 'What''s everyone doing {day}?', null),
  ('weekend_plan', 2, 2, 'Sleep first, then maybe {game} with friends.', 1),
  ('weekend_plan', 3, 3, 'Laundry and {food}. Not glamorous, but necessary 😂', 1),
  ('weekend_plan', 4, 1, 'Same energy honestly.', 3),
  ('tutorial_shout', 1, 1, 'Has anyone read the new guide in the Tutorial app?', null),
  ('tutorial_shout', 2, 2, 'Yes! The part about {course} was helpful.', 1),
  ('tutorial_shout', 3, 3, 'I''ll check it out later today.', 1),
  ('study_spot', 1, 1, 'Where do you all study best? I need a new spot.', null),
  ('study_spot', 2, 2, '{place} is quiet in the afternoon.', 1),
  ('study_spot', 3, 3, 'I prefer the hostel at night, with no distractions.', 1),
  ('study_spot', 4, 1, 'Thanks, I''ll try {place} tomorrow.', 2),
  ('timetable', 1, 1, 'Does anyone have the updated timetable for {course}?', null),
  ('timetable', 2, 2, 'Ask your course rep, they usually have the latest.', 1),
  ('timetable', 3, 3, 'Or check the notice board at the faculty.', 2),
  ('timetable', 4, 1, 'Will do, thanks!', 3),
  ('sleep', 1, 1, 'I slept for 3 hours and I have lectures all day 😴', null),
  ('sleep', 2, 2, 'Water and a short walk will help. Nap if you can.', 1),
  ('sleep', 3, 3, 'And go to bed early tonight, okay?', 1),
  ('roommate_fun', 1, 1, 'My roommate cooked {food} and I''m emotional 😍', null),
  ('roommate_fun', 2, 2, 'Keep that roommate! 😂', 1),
  ('roommate_fun', 3, 3, 'Good roommates are rare. Appreciate them.', 2),
  ('roommate_fun', 4, 1, 'I''ll say thank you properly.', 3),
  ('lost_found', 1, 1, 'Did anyone see a black bag near {place}? A friend lost one.', null),
  ('lost_found', 2, 2, 'I''ll look out for it and ask around.', 1),
  ('lost_found', 3, 3, 'Try the security post too, they keep lost items.', 1),
  ('lost_found', 4, 1, 'Thank you!', 3),
  ('cheer_up', 1, 1, 'Rough day today, ngl.', null),
  ('cheer_up', 2, 2, 'Sorry about that. Want to gist about it?', 1),
  ('cheer_up', 3, 3, 'Tomorrow is a fresh start. Rest well tonight.', 1),
  ('cheer_up', 4, 1, 'Thanks, that helps.', 3),
  ('new_here', 1, 1, 'I''m new here. Any advice for finding my way around?', null),
  ('new_here', 2, 2, 'Open the map and walk into buildings. You''ll learn fast.', 1),
  ('new_here', 3, 3, 'And say hi in Global chat. People are friendly.', 1),
  ('new_here', 4, 1, 'Thank you, that makes me feel better 🙌', 3),
  ('drink_break', 1, 1, 'Anyone want to grab {drink} at {place}?', null),
  ('drink_break', 2, 2, 'Yes, I need a break from {course}.', 1),
  ('drink_break', 3, 3, 'Save me a seat!', 1),
  ('procrastinate', 1, 1, 'I keep saying I''ll start {course} later 😂', null),
  ('procrastinate', 2, 2, 'Same! Try just five minutes. It usually turns into an hour.', 1),
  ('procrastinate', 3, 3, 'Put the phone in another room. Works for me.', 2),
  ('procrastinate', 4, 1, 'Doing it right now. Wish me luck.', 3),
  ('compliment', 1, 1, 'Shout out to whoever shared the {course} notes yesterday. You saved me 🙏', null),
  ('compliment', 2, 2, 'That was me! Happy to help.', 1),
  ('compliment', 3, 3, 'This is why this chat is good. Everyone helps.', 2),
  ('quiz_time', 1, 1, 'Quick quiz: how many hours of sleep do you actually need?', null),
  ('quiz_time', 2, 2, 'At least seven, but I get five 😅', 1),
  ('quiz_time', 3, 3, 'Seven to nine. Your brain needs it to store what you learn.', 1),
  ('quiz_time', 4, 2, 'Okay, bedtime earlier tonight.', 3),
  ('cafeteria_queue', 1, 1, 'The queue at {place} is crazy today 😩', null),
  ('cafeteria_queue', 2, 2, 'Try going a bit earlier next time.', 1),
  ('cafeteria_queue', 3, 3, 'Or take a book and use the waiting time to revise.', 2),
  ('cafeteria_queue', 4, 1, 'Revising {course} in a queue, here we go 😂', 3),
  ('group_work', 1, 1, 'Group assignment for {course}: how do you split tasks fairly?', null),
  ('group_work', 2, 2, 'Write each person''s name and a task, with a deadline.', 1),
  ('group_work', 3, 3, 'And check in halfway. It avoids last-minute panic.', 2),
  ('group_work', 4, 1, 'Great, I''ll suggest that.', 3),
  ('night_walk', 1, 1, 'Reminder: walk in groups at night and stay on lit paths 🙏', null),
  ('night_walk', 2, 2, 'Good advice. Safety first.', 1),
  ('night_walk', 3, 3, 'Also share your location with a friend when you walk alone.', 1),
  ('music_share', 1, 1, 'Drop a song for studying. Something calm.', null),
  ('music_share', 2, 2, 'Lo-fi beats work for me.', 1),
  ('music_share', 3, 3, 'Instrumental Afrobeats if you want energy without lyrics.', 1),
  ('music_share', 4, 1, 'Thanks, adding both to my playlist 🎧', 3),
  ('ask_dls', 1, 1, 'Which formation works best in DLS right now?', null),
  ('ask_dls', 2, 2, 'Balanced setups with a solid midfield. Check the forum for more.', 1),
  ('ask_dls', 3, 3, 'And practise passing. Basics win matches.', 2),
  ('freshers_tip', 1, 1, 'Freshers, drink water, attend lectures, and don''t compare yourself to others 🙌', null),
  ('freshers_tip', 2, 2, 'And say hello to people. Friends make school easier.', 1),
  ('freshers_tip', 3, 3, 'Also keep your belongings safe in the hostel.', 2),
  ('bday', 1, 1, 'Happy birthday to everyone celebrating today! 🎉', null),
  ('bday', 2, 2, 'Yes! Enjoy your day and eat well 🍰', 1),
  ('bday', 3, 3, 'Wishing you a great year ahead!', 1),
  ('results', 1, 1, 'Results are out for some courses. How are we feeling?', null),
  ('results', 2, 2, 'Nervous but ready to face it.', 1),
  ('results', 3, 3, 'Whatever the result, one grade doesn''t define you. Keep going.', 2),
  ('results', 4, 1, 'True. Thanks for the reminder.', 3),
  ('allowance', 1, 1, 'My allowance and I are not on speaking terms this week 😭', null),
  ('allowance', 2, 2, 'Budget the rest by day, it helps. Cook if you can.', 1),
  ('allowance', 3, 3, 'And avoid impulse buying. It adds up so fast.', 2),
  ('allowance', 4, 1, 'Noted, thank you.', 3),
  ('rain', 1, 1, 'Rain is falling and I have a lecture in 10 minutes 😩', null),
  ('rain', 2, 2, 'Run for it and carry something to cover your notes!', 1),
  ('rain', 3, 3, 'Lecturers understand. Arrive and dry your books 😂', 2),
  ('chess', 1, 1, 'Anyone up for a quick game of chess at {place}?', null),
  ('chess', 2, 2, 'I''m in. I''ll bring a board.', 1),
  ('chess', 3, 3, 'Can I watch and learn?', 1),
  ('chess', 4, 2, 'Of course, the more the merrier.', 3),
  ('foodie', 1, 1, 'Rate your top 3 campus meals. Mine: {food}, {food2}, and anything with plantain 😂', null),
  ('foodie', 2, 2, '{food2} always wins for me.', 1),
  ('foodie', 3, 3, 'You can''t go wrong with {food}.', 1),
  ('library_rules', 1, 1, 'Friendly reminder: keep your phone on silent in {place} 🤫', null),
  ('library_rules', 2, 2, 'Yes please, some of us are trying to focus.', 1),
  ('library_rules', 3, 3, 'Headphones are your friend too.', 2),
  ('reading_group', 1, 1, 'Starting a small reading group for {course}. Who''s interested?', null),
  ('reading_group', 2, 2, 'Count me in. Days and time?', 1),
  ('reading_group', 3, 3, 'I''m free {day}. Let''s do an hour.', 2),
  ('reading_group', 4, 1, 'Perfect, I''ll create a plan.', 3),
  ('hustle', 1, 1, 'Any student side hustles that don''t affect your studies?', null),
  ('hustle', 2, 2, 'Tutoring juniors, graphic design or typing assignments.', 1),
  ('hustle', 3, 3, 'Just be careful with scams and don''t pay to receive anything.', 2),
  ('hustle', 4, 1, 'Good tips, thank you.', 3),
  ('goal', 1, 1, 'What''s one goal you have for this semester?', null),
  ('goal', 2, 2, 'Keep a steady reading routine for {course}.', 1),
  ('goal', 3, 3, 'Sleep better and finish assignments early.', 1),
  ('goal', 4, 1, 'Both good. Mine is to stop procrastinating 😅', 3),
  ('event_buzz', 1, 1, 'Is there anything happening on campus {day}?', null),
  ('event_buzz', 2, 2, 'Check the Feed and your department notice board.', 1),
  ('event_buzz', 3, 3, 'Sometimes societies announce things in Global chat too.', 2),
  ('phone_battery', 1, 1, 'My phone is at 3% and there''s no light 😭', null),
  ('phone_battery', 2, 2, 'Switch on battery saver and close all apps.', 1),
  ('phone_battery', 3, 3, 'Find a power bank. Charge when you can.', 2),
  ('phone_battery', 4, 1, 'Lesson learned. Charge early.', 3),
  ('senior_advice', 1, 1, 'Seniors, what''s one thing you wish you knew in 100 level?', null),
  ('senior_advice', 2, 2, 'Start reading early. Don''t wait for exams.', 1),
  ('senior_advice', 3, 3, 'And make friends outside your department.', 1),
  ('senior_advice', 4, 1, 'Thank you, writing this down.', 3),
  ('sports_day', 1, 1, 'Anyone interested in a friendly game at {place} {day}?', null),
  ('sports_day', 2, 2, 'Yes! What sport?', 1),
  ('sports_day', 3, 1, 'Football, any level.', 2),
  ('sports_day', 4, 3, 'I''m in. Let''s do it.', 1),
  ('thank_you', 1, 1, 'Thanks to everyone who helps in this chat. It makes campus feel smaller 💚', null),
  ('thank_you', 2, 2, 'That''s the spirit. We grow together.', 1),
  ('thank_you', 3, 3, 'Always happy to help!', 1),
  ('quiet_day', 1, 1, 'It''s quiet in here today. How is everyone?', null),
  ('quiet_day', 2, 2, 'Busy day, but good. You?', 1),
  ('quiet_day', 3, 1, 'Same, just taking a break.', 2),
  ('quiet_day', 4, 3, 'Take your time. Chat is open whenever you need it.', 1),
  ('caution_scam', 1, 1, 'Reminder: nobody legit asks you for your password or card details. Ever.', null),
  ('caution_scam', 2, 2, 'Very true. Report and block if someone does.', 1),
  ('caution_scam', 3, 3, 'And never pay to receive money or a job.', 2),
  ('morning_gist', 1, 1, 'Good morning campus! What''s on your schedule today?', null),
  ('morning_gist', 2, 2, 'Two lectures and a lab. And you?', 1),
  ('morning_gist', 3, 3, 'One lecture and a long study block.', 1),
  ('morning_gist', 4, 1, 'Have a productive day, both of you!', 2),
  ('night_gist', 1, 1, 'How was everybody''s day? 🌙', null),
  ('night_gist', 2, 2, 'Long, but I got a lot done.', 1),
  ('night_gist', 3, 3, 'Rested too much, if I''m honest 😂', 1),
  ('night_gist', 4, 1, 'Rest is part of progress. Sleep well!', 3),
  ('hobby', 1, 1, 'What do you do for fun outside school?', null),
  ('hobby', 2, 2, 'Drawing and music. It clears my head.', 1),
  ('hobby', 3, 3, 'Football and cooking!', 1),
  ('hobby', 4, 1, 'Cool hobbies. I love reading.', 3),
  ('weather', 1, 1, 'This heat is not a joke today ☀️', null),
  ('weather', 2, 2, 'Drink water! Stay hydrated.', 1),
  ('weather', 3, 3, 'Read in the shade or in {place}, it''s cooler.', 1),
  ('new_friend', 1, 1, 'I made a new friend at {place} today, small wins 🙌', null),
  ('new_friend', 2, 2, 'That''s lovely! Friends make campus better.', 1),
  ('new_friend', 3, 3, 'Hold on to those friendships. They last.', 2);
