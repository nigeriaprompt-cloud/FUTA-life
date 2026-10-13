# Backend: Supabase (replaces the PHP/MySQL/Node plan)

**Stack:** static front end (plain JS, three.js r128, no build) on **Vercel** → **Supabase** (Postgres + Auth + Realtime). No server of our own.
Where older docs (`ARCHITECTURE`, `API`, `DATA_MODEL`, `PAYMENTS`, `ROADMAP`) say *PHP*, *MySQL*, *REST route* or *Node `ws` realtime server*, read: **Postgres table / SQL function (RPC) / Supabase Realtime channel**. Business rules in those docs still apply.

## 1. Files
```
supabase/01_schema.sql          tables, RLS, RPC functions, realtime publication   (run in SQL Editor)
supabase/02_avatar_options.sql  GENERATED from avatar-options.json by tools/build-options.py (run after 01, and after any options change)
supabase/tests/                 local SQL tests (stub.sql fakes auth; run.sh; test.sql) — never run on the live project
public/world/game/onboarding/   sign-up + creator; api.js talks to Supabase (demo:true = no server)
public/world/game/live/         live.js (network) remotes.js (draw other players) interact.js (click chair/ATM) ui.js (chat, profile card)
                                mock-sb.js + live-demo.html (dev page with fake players, no Supabase needed)
vercel.json                     serve /public, no build, security + cache headers, "/" → sign-up
```

## 2. Security model (read before changing SQL)
- The browser has only the **anon key**. Tables have RLS on; clients may only `select` (policies) and call the RPCs that are `grant`ed. There are **no insert/update/delete policies** — every write is a `security definer` function with `set search_path = ''`.
- Internal helpers live in schema `private` (not exposed by the API). A new public function must be added to the `grant execute` list at the bottom of `01_schema.sql`; default is **no access**.
- **Money:** integer coins in `wallets(pocket, bank)`; only `private.ledger_move()` changes them and writes `ledger`. `check (>= 0)` blocks overdraft. Amounts for rewards live in SQL, never in the client.
- **Avatars:** `save_avatar` runs `validate_avatar(look, false)`; NPC-only items (`restricted` in options JSON) are dropped. `tools/test/parity.js` proves SQL and `FutaAvatar.look.normalize` agree.
- **Age:** date of birth is set once; under 13 refused; under 18 = `is_teen` → no waves/DMs with adults, no links or phone numbers in chat.
- **Chat:** `send_room_message` / `send_dm` rate-limit (5 per 10 s), length-limit 240, filter (`banned_words` table — **fill it**), wave-first (`dm_allowed`), block hides both ways (RLS uses `is_blocked_between`).
- Admin tools are not built yet. When they are: add `is_admin` to a private table, check it inside definer functions; never trust a client-sent role.

## 3. RPC reference (all callable only when signed in, except `username_available`)
| RPC | Does |
|---|---|
| `username_available(p_name)` | `{available, reason}` (anon allowed) |
| `get_me()` | profile + private fields + wallet |
| `set_profile(p_username, p_dob)` | username (lower-cased) + DOB once, sets teen flag |
| `save_avatar(p_look)` | validate + store look + hash, returns the cleaned look |
| `save_life(p_start)` | story start; grants starter money once; marks onboarded |
| `set_privacy(p_accept_waves)` | allow/deny incoming waves |
| `get_wallet()`, `atm_withdraw(n)`, `atm_deposit(n)`, `atm_claim_daily()` | game money (never real money) |
| `claim_seat(room, seat)`, `release_seat()`, `list_seats(room)` | one seat per player, 5 min lease (client renews every 2 min) |
| `send_room_message(room, body)` | room chat |
| `send_wave(to)`, `respond_wave(id, accept)`, `send_dm(to, body)` | wave-first DMs |
| `block_user`, `unblock_user`, `report_user(target, reason, context)` | safety |
Errors are plain codes (`insufficient_funds`, `wave_first`, `slow_down`, `under_age`…); `onboarding/api.js` `FRIENDLY` maps them to words.

## 4. Realtime design
- Channel per room, name `futa:<room>`, **private** (needs a signed-in user): outdoors `zone_<cx>_<cz>` (160 m cells with 12 m hysteresis), interiors `int_<buildingId>_<n>` (cap 20 per instance — create `_2` when full; the lobby logic is not built yet).
- presence = who is here (`{hash, seat}`), broadcast `pos` = `{i,x,y,z,r,a}` ≤ 4/s and only while moving (+1/s heartbeat), `postgres_changes` = chat + seat changes.
- A player's name and outfit are read from `profiles` by id — never from the packet. Receivers ignore packets from ids that are not in presence, and non-finite numbers.
- Render cap 30 nearest peers (`FUTA_LIVE.maxPeersRendered`), interpolation delay 150 ms.
- Capacity maths: each position message is delivered to every other player in the room, so load ≈ movers × 4 × (room size − 1) per second. Free plan limit is 100 msgs/s → keep rooms ≤ ~12 active movers on free; Pro (500/s) ≈ 30. Lower `posHz` to 3 if needed.
- **Known limits (honest):** (1) presence keys are chosen by the client, so a hacked client could claim another player's id and show *their* name/outfit — it cannot post chat or spend money as them. Fix later with a signed relay (Edge Function / own server) if abuse appears. (2) Room chat via `postgres_changes` is simple but heavier than broadcast; fine up to a few hundred messages/min. (3) Supabase has no Africa region — expect roughly 150–250 ms round trip from Nigeria; **not measured yet**, test from a Nigerian phone on MTN/Airtel/Glo.

## 5. What is wired and what is not yet
Done and tested: sign-up (email/Google via Supabase), profile, validated character, starter money, ATM, seats, chat, waves/DMs/block/report SQL; live client + remote avatars + name labels + click-to-walk/sit + ATM panel (tested in `live-demo.html` with a fake backend; SQL tested on a real Postgres).
**Not done:** (a) the map in `public/world/index.html` is the clickable overview — there is no walkable player or interior scene yet, so live players cannot appear *in the real campus* until the interior/walking scene (Roadmap Phase 3–4) is built; `live-demo.html` is the wiring example (STEP 1–4). (b) never tested against a real Supabase project, real Google OAuth, or real phones. (c) email templates, password reset UI, admin UI, Paystack, shops.

## 6. How to add things
- New clothes/hair: edit `avatar-options.json` → `python3 tools/build-options.py` → re-run `02_avatar_options.sql` in Supabase → run `node tools/test/parity.js`.
- New game-money action: a new `security definer` function that calls `private.ledger_move`; grant it; add a SQL test in `supabase/tests/test.sql`.
- Change a rule: change the SQL **and** its test in the same task.

## 7. Tests
```
sh supabase/tests/run.sh -h localhost -d scratch_db        # throwaway Postgres only (it drops schemas public/private/auth!)
node tools/test/parity.js -h localhost -d scratch_db        # after run.sh
node tools/test/live.test.js                                # live.js + interact.js with a fake Supabase
node tools/test/live-e2e.js outdir                          # headless browser on live-demo.html (needs playwright + chromium)
node tools/test/flow.js outdir                              # phone-size sign-up flow in demo mode
```
