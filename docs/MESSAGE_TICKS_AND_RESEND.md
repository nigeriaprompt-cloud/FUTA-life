# Message ticks and resend (Chat app)

**Files:** `supabase/15_receipts.sql` (+ `tests/test_receipts.sql`), `public/world/game/phone/apps/chat.js`, `phone.js` (`vis` event), `phone.css`.
Run `15_receipts.sql` in the Supabase SQL Editor after `01`, `10` and `14` (or paste `ALL_IN_ONE.sql` again). Safe to re-run.
**Run it BEFORE deploying the new front end**: the phone now sends a client id with every message, and the old SQL functions don't accept it.

## What players see (direct messages)
| Icon | Meaning |
|---|---|
| clock | sending |
| ✓ | sent: the server has it |
| ✓✓ grey | delivered: the other player's phone received it |
| ✓✓ light blue | seen: they opened the chat |
| red ! + "Not sent · Tap to retry" | no network; tap the message to resend |

Rooms (Campus / Building) and groups show clock → ✓ only (no read receipts in public chats).
Each of your messages also shows its time.

## How delivered / seen work
The RECEIVER's phone reports it: `mark_dms_delivered()` (on login and whenever a DM arrives, even when the Chat app is closed) and `mark_dms_read(peer)` (when the chat with that player is open **and** the phone is visible and the browser tab is in front). The sender's phone gets the change through realtime (UPDATE on `dms`). Only the receiver can change these, only through the two RPCs, only for messages sent to them. Messages from before this update count as seen.

## How resend works
- The phone makes one **client id** (uuid) per message and sends it as `p_client`. The server keeps a unique index on (sender, client id), so the same message can **never post twice**: if the first try did arrive, the retry simply returns the original id.
- Network errors (no internet, timeout, "Failed to fetch") keep the message in the **outbox** (memory + localStorage, per player, up to 30 messages, 24 hours). It turns red; tapping it resends. It is also retried automatically when the connection comes back (`online` event) and every 25 seconds while something is waiting.
- Closing the phone, leaving the chat or reloading does not lose it: the red message reappears in its conversation.
- If the **server refuses** a message (word filter, slow down, not friends…), it is not retried: the bubble disappears and the text goes back in the box so the player can edit it.

## Also fixed
- `chat.js` now tells the phone when you go back to the home screen, so the Chat badge counts new messages again after you leave Chat (before, it stopped counting once Chat had been opened once).
- "That message can't be sent" is now shown for `message_not_allowed` (it used to show the wrong "isn't allowed for this player" text).

## Tests
`supabase/tests/run.sh` (SQL) · `node tools/test/chat-phone.js` (phone logic, fake Supabase; `SHOT_DIR=dir` saves pictures) · `node tools/test/money-chat-demo.js [dir]` (real phone, demo mode).
