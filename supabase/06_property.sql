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
