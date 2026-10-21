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
