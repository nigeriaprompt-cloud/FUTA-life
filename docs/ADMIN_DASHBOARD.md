# Admin metrics dashboard

Page: `/admin` (`public/admin/index.html`, one file, no build). Numbers: `public.admin_metrics(p_password)` in `supabase/17_admin_metrics.sql`.

## How it is protected
- The password is **not** in any browser file. Only a bcrypt hash is stored in `private.admin_secret` (not exposed by the API, RLS on, no grants).
- The visitor must also be **signed in** to the game. The server checks the password; 5 wrong tries in 15 minutes lock that account out for the rest of the 15 minutes.
- The result is totals only: no emails, names, messages or single-player balances.
- The page keeps the password only in memory (never saved, gone on reload or Lock) and refreshes every 30 s while the tab is visible.

## Change the password
In the Supabase SQL editor: `select private.admin_set_password('your new password');` (min 8 characters). Re-running the file never overwrites it.

## What it shows
Players (total, new today/week, under-18), online now, active 24 h, cash in pockets, money in banks, chat volume, new players per day (14 d), money moves per hour (24 h), busiest buildings, vault state and 24 h robbery results, players in jail, open reports by reason, money activity by ledger kind.

## Responsive
Tiles and cards use CSS grid auto-fit (1 column on phones, up to 7 tiles on desktop); charts are SVG that scale; light/dark follow the device. Test: `node tools/test/admin-dash.js` (phone 375, tablet 820, desktop 1366: no sideways scroll, no console errors). Demo mode (no Supabase keys) shows sample numbers with a banner.

## Celebrations
The same page has a Celebrations card (switch convocation, matriculation and other festive decorations on or off). See `docs/CELEBRATIONS.md`; needs `18_celebrations.sql`.

## Setup
Run `17_admin_metrics.sql` (and `18_celebrations.sql`) after 01–16 (or paste `ALL_IN_ONE.sql`), sign in to the game, open `/admin`.
