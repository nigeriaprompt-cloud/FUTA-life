# Global chat, phone-first and guest mode

## Global chat (phone app "Global")
- One public room for everyone. Type `@` + letters to tag a player (suggestions pop up); tap a name to tag; tap ↩ to reply (a short quote is kept).
- Tagged / replied-to players get a pop-down alert and a badge on the Global icon (99+ cap). Opening Global clears it.
- Rules are in the database (`supabase/18_global_chat.sql`): teens and adults never see each other, blocked players hidden, word filter, 5 messages / 10 s, max 5 tags per message, messages deleted after 3 days.
- **Run `supabase/18_global_chat.sql` (or the new ALL_IN_ONE.sql) in Supabase.** It adds `notifications.app/ref`; the Chat app now ignores Global tags.
- Tests: `supabase/tests/test_global.sql` (via run.sh), `tools/test/global-phone.js`.

## Phone first
The phone opens on every page load (map and buildings). Players hide it with "Hide" to see the map; this is not remembered. Settings > "Show phone on start" turns auto-open off for good.

## Guest mode
- `/` now opens the map (`/world/`). Signed-out players can walk the map and enter buildings.
- Any real action shows "Sign in to continue" (Sign in or create account / Not now): activities, ATM, vault, wardrobe, salon, and the Property, Cars, Accessories, Clothes, Feed, NEPA, Tutorial, Gamers forum, Chat and Profile apps. Global shows an inline sign-in message.
- After signing in the player returns to the page they were on (`?next=`, same-site paths only).
- Developer API: `FutaPhone.requireLogin('do something')` (returns true if the user is a guest), `FutaPhone.isGuest()`, `FutaPhone.loginUrl()`. Test: `tools/test/guest-mode.js`.
