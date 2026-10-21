-- 04_auth_backfill.sql — run ONCE in the Supabase SQL Editor (safe to re-run).
-- Why: the on_auth_user_created trigger (01_schema.sql) only creates a player's rows for accounts made AFTER it existed.
-- Accounts created earlier (e.g. while you were testing Google / email sign-up before running 01) have no profile row, so get_me() returns null
-- and the app behaves as if sign-in failed. This fills in the missing rows. It never changes existing data.
insert into public.profiles (id)          select u.id from auth.users u on conflict do nothing;
insert into public.private_profiles (id)  select u.id from auth.users u on conflict do nothing;
insert into public.wallets (id)           select u.id from auth.users u on conflict do nothing;
insert into public.player_stats (id)      select u.id from auth.users u on conflict do nothing;
