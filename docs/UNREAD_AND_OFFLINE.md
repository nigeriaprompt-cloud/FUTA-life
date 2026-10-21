# Unread counts, offline bar, install as app

## Unread counts (Chat app)
**Files:** `supabase/16_unread.sql` (+ `tests/test_unread.sql`), `phone/apps/chat.js`, `phone/phone.css`. Run `16_unread.sql` after 10, 14, 15 (or paste `ALL_IN_ONE.sql` again). Safe to re-run.
- **Where players see counts:** a number on each friend row, on each group row, on the Friends and Groups tabs, and on the Chat icon (home screen and the floating phone button). Anything above 99 shows **99+** (the real number is kept, only the label is capped). Friends and groups with unread messages move to the top.
- **How it is counted (server is the truth):** `get_unread()` returns `{ dms:{friendId:n}, groups:{groupId:n}, invites:n, alerts:n }` in one call. DMs use the existing `read_at`; groups use a read cursor `group_members.last_read_id` that moves when the player opens the group (`mark_group_read`). A new member starts at "now", existing members started fully read. Blocked players never count. Money messages are not counted as messages (the money alert counts them once).
- **Live:** realtime events raise the right row at once; opening a conversation clears only that one; a message that arrives in a chat you are looking at (phone open, tab in front) is not counted. The phone re-asks the server on login, when the connection returns, when the browser tab comes back to the front and when a group invite changes.
- Campus (not Building) and Global also count: the room has no read state on the server, so each phone remembers the last message it saw (localStorage futa.campus.seen.<id> / futa.global.seen.<id>). Chat icon + Campus tab pill; Global icon. Tests: tools/test/room-unread.js, tools/test/global-unread.js.
- Demo mode shows sample counts (3, 99+, 5) so the look can be checked.

## "You are offline" bar
`public/pwa.js` shows a slim red bar at the top when there is no working internet and a green "Back online" for a moment when it returns. It uses the browser's offline event plus a real check of `/ping.txt` every 15 s (Wi-Fi with no data counts as offline). `/ping.txt` is never cached (service worker skips it, `vercel.json` sends `no-store`). `window.FutaNet.online()` and the `futa-net` event are available to other scripts. If a page that was never opened before is requested while offline, the service worker shows `offline.html`; pages already opened open from the cache. Messages typed offline wait in the outbox and send by themselves.

## Install as an app
Already in place (another account): `manifest.webmanifest`, `sw.js`, `pwa.js`, icons in `public/brand/`. Android/desktop Chrome and Edge show the browser's install prompt (card on the sign-up page + Phone > Settings); iPhone uses Share > Add to Home Screen. Checked here: manifest valid, all icons load (including maskable), service worker active, standalone display.

## Tests
`supabase/tests/run.sh` (SQL, 394 checks) · `node tools/test/chat-unread.js` (counts, 99+, live updates, reconnect) · `node tools/test/unread-offline-shot.js outdir` (real phone in demo mode: badges, offline bar, installable basics, offline page; saves pictures).
