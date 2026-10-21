# Send money, quick replies and alerts (Chat app)

**Files:** `supabase/14_transfers.sql` (+ `tests/test_transfers.sql`), `public/world/game/phone/apps/chat.js`, `phone.js` (`FutaPhone.alert`), `phone.css`.
Run `14_transfers.sql` in the Supabase SQL Editor (or paste `ALL_IN_ONE.sql` again). Safe to re-run. Needs `01` and `10_chat_social.sql` first.

## What players see
- **Quick replies:** small tappable chips above the message box. They suggest an answer to the last message (greeting, question, thanks, goodbye, laugh, money received) or an opener when the chat is empty. Tapping one sends it through the normal send RPC, so the word filter and rate limits still apply. They hide while the player types.
- **Send money:** open a friend's chat → **₦ Send money** → amount (or ₦1,000 / 5,000 / 10,000 / 50,000) + optional note → Review → Send it. Money goes **bank → bank**. A gold bubble shows in the chat for both players.
- **Alerts:** the receiver gets a pop-down banner on the phone (even when the phone is hidden; tapping it opens that chat), a badge on the Chat icon and the phone button, and a short vibration. Recent alerts are listed at the top of Chat → Friends and marked read there. Alerts are kept 30 days (read ones 7).

## Safety rules (all enforced by the server in `send_money`)
Friends only (both waved) · same age group (teens never pay adults) · not blocked · not yourself · not while in jail · bank must cover the amount · note passes the chat word filter (teens: no links or phone numbers) · every move is in `public.ledger` (`transfer_out` / `transfer_in`) and `public.transfers`.

## Limits (change without code)
| key in `app_config` | default | meaning |
|---|---|---|
| `transfer.min` | 100 | smallest transfer |
| `transfer.max` | 500000 | largest single transfer |
| `transfer.max_count_day` | 10 | transfers one player can send per rolling 24 h |
| `transfer.max_per_day` | 2000000 | total one player can send per 24 h |
| `transfer.max_receive_day` | 5000000 | total one player can receive per 24 h (stops many accounts feeding one) |

`insert into public.app_config(key,value) values ('transfer.max','1000000') on conflict (key) do update set value = excluded.value;`

## Why these limits
The game pays money for posting, jobs and the vault, so free transfers between accounts are the classic way to farm with fake accounts. Friends-only + daily caps + the receive cap keep that small. If you ever see abuse, look at `select * from public.transfers order by id desc;` in the SQL editor.

## Tests
`supabase/tests/run.sh` (SQL, 38 checks) · `node tools/test/chat-phone.js` (phone logic with a fake Supabase) · `node tools/test/money-chat-demo.js [dir]` (real phone in demo mode, screenshots).
