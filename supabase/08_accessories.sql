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
