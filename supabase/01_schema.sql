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
