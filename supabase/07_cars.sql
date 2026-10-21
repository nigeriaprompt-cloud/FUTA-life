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
