# Feed — text posts that vanish after 24 h, each post pays game money into the BANK

Phone app `Feed` (`public/world/game/phone/apps/feed.js`) + database `supabase/05_feed.sql`. Built 2026-10-17.

## 1. What players see
- **Feed** tab: classic cards (avatar, username, "18h 20m left", text on a coloured background, Report). Newest first, **infinite scroll** (12 per page, keyset paging by `id`, no realtime — refresh with ↻ in the title bar).
- **Write** tab: 12 backgrounds, live preview, character counter, "5 of 7 posts left today · Earn ₦500 each".
- **Earn** tab: in-game **bank balance** and the last 10 rewards. Players withdraw to pocket at an ATM inside a bank (existing `atm_withdraw`).
- No likes, no comments (keeps database/Claude usage low). Only extra action: **Report** (existing `report_user`, context `feed:<post id>`).

## 2. Money = game money, into the bank (not pocket, not real cash)
`post_to_feed` calls `private.ledger_move(user, 'feed_reward', 0, reward, 'post:<id>')`, the same way `atm_claim_daily` pays 1000 into the bank. So every reward is a `ledger` row and `wallets.bank` goes up. Integers only. No real-money payments, no Paystack, no payout requests.

## 3. Rules (all enforced in SQL — the browser only displays them)
| Rule | Value | Config key (`app_config`) |
|---|---|---|
| Posts per player per day (Africa/Lagos midnight) | 7 | `feed.daily_limit` |
| Gap between posts | 30 s | `feed.gap_seconds` |
| Length | 15–280 chars, ≥ 3 words, ≥ 5 different characters | `feed.min_chars`, `feed.max_chars` |
| Reward per post (coins into bank) | 500 | `feed.reward` |
| Life of a post | 24 h (`expires_at`); RLS hides it; `private.feed_cleanup()` deletes it 1 h later | — |
Also: no links or phone numbers, banned words refused, same text cannot be live twice, blocked players' posts hidden, sign-up must be finished.
Change a value: `insert into public.app_config(key,value) values ('feed.reward','500') on conflict (key) do update set value = excluded.value;`

## 4. RPCs (authenticated only)
`get_feed_status()` · `post_to_feed(body, bg)`. Reads: `feed_posts` (RLS), `ledger` (own rows) for the Earn history.
Error codes: `daily_limit`, `slow_down`, `post_not_allowed`, `duplicate_post`, `bad_background`, `finish_sign_up`.

## 5. Set-up (Supabase SQL Editor)
1. Run `05_feed.sql` after `01_schema.sql` (re-run it whenever you re-run 01).
2. Schedule cleanup (enable `pg_cron`): `select cron.schedule('feed-cleanup','*/30 * * * *','select private.feed_cleanup()');`

## 6. Watch out for
- **Economy inflation:** 7 × 500 = 3 500 coins per player per day from posting alone. Compare with what things cost in the game; lower `feed.reward` if money piles up.
- **Farming** (junk posts, many accounts) is limited by length/word/variety checks, the 30 s gap and the duplicate check. Fill `banned_words`. Consider an account-age rule if abuse appears.
- No image upload, by design.
- SQL tests (`tests/test_feed.sql`, 22 checks) were written but **not run in the build sandbox (no Postgres)**. Run `sh supabase/tests/run.sh …` on a throwaway Postgres first.

## 7. Tests
`node tools/test/feed-phone.js outdir` — headless browser, demo mode: paging, infinite scroll, posting, 7/day limit, Earn bank balance (passes). `supabase/tests/test_feed.sql` — run by `run.sh` (not yet run).
