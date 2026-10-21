# Arcade (Campus Dash) and Gamers forum

## Arcade — "Campus Dash"
A one-tap endless runner in the phone. Players choose the guy or the lady runner (saved on the device), tap / click / press Space to jump (hold = higher), dodge cones, generators, crates and danfo buses, and grab ₦ coins.

**Money (pocket):** every 10 points pays ₦10 (a 60 second run ≈ ₦60–90), up to ₦3,000 a day and 60 paid runs a day. Money goes to the POCKET (ledger kind `arcade`).

**Why it can't be farmed easily** (`supabase/19_arcade.sql`): `arcade_start()` starts a server clock; `arcade_finish()` pays once, only the owner, only after 8 seconds; the score is clamped to what the elapsed time allows (18 points per second + 20; the game itself gives 10 per second + 5 per coin); runs are 5 seconds apart; nothing in jail. A fake client therefore earns at most about the same as an honest player, and never more than the daily cap.

Signed-out visitors can play a **practice** run (no money) and are asked to sign in. A leaderboard shows the top 10 (same age group, blocked players hidden).

Tune without code: `insert into public.app_config(key,value) values ('arcade.per10','20') on conflict (key) do update set value = excluded.value;`  keys: `arcade.per10` (10) · `daily_cap` (3000) · `daily_runs` (60) · `min_secs` (8) · `gap` (5).

Files: `phone/apps/arcade.js` (app), `phone/apps/arcade-dash.js` (engine, loaded from the manifest).
**More games later:** add another engine file and a game id in `arcade_start` / `arcade_board`; keep "points per second" bounded so the server clamp still fits.

## Gamers forum
Boards: ⚽ DLS (Dream League Soccer), 🎮 eFootball, 🕹️ Other. Topics with a tag (Talk, Tips, Squad, Looking for a match, News), replies, report (3 players hide a post), remove your own. Teens and adults never see each other, blocked players are hidden, no links / phone numbers / bad words, 5 topics a day (2 minutes apart), 12 replies per 5 minutes. Rules are in `supabase/20_forum.sql` (needs `18_bulletins.sql` first: it reuses its text cleaner). Tune: `forum.topics_daily`, `forum.topic_gap`, `forum.replies_5min`, `forum.report_hide`.
Guests are asked to sign in when they open it. File: `phone/apps/forum.js`.

## Tests
`supabase/tests/test_arcade.sql`, `test_forum.sql` (via run.sh) and `tools/test/arcade-forum.js` (real phone, demo mode: engine rules, game flow, forum flow).
