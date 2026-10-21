# Community: FUTAlife WhatsApp channel + "who is online"

Files: `public/world/game/community/community.js` · `supabase/21_online.sql` · tests `tools/test/community.js`, `supabase/tests/test_online.sql`.

## WhatsApp
- **Channel link** (set at the top of `community.js`, or `window.FUTA_COMMUNITY.whatsappChannel` before the script loads): `https://whatsapp.com/channel/0029Vb8ycAzEgGfKUalSm62w`.
- Shown in four places: map "online" card, phone home screen card, Settings → Community, and a "Need help?" link on the sign-up page (`game/onboarding/signup.html`, that link is typed in the HTML: change it there too if the channel changes).
- **A WhatsApp channel is one-way**: followers read your posts and react, they cannot message you. For real two-way contact set `whatsappChat` to your WhatsApp number (international format, digits only, e.g. `"2348012345678"`). A "Message us" button (a normal chat with you, `https://wa.me/<number>`) then appears next to the channel button everywhere. It stays hidden until you set it.
- Only `whatsapp.com`, `chat.whatsapp.com` and `wa.me` links are ever opened (`okUrl`). Links open in a new tab with `rel="noopener noreferrer"`.
- The green chat-bubble mark is our own drawing, not the WhatsApp logo.

## Online labels
- **Map:** a pill at the top right: an emerald "LIVE" end-cap with a pulsing dot + the count ("24 online"). Tap it for a card with an emerald hero and a big gold number (counts up once when opened), a split meter (inside buildings / out on campus), the busiest places ranked 1-3, and the WhatsApp button. Close with the ✕, Esc or a tap outside. The pill steps aside while the building zoom bar is on screen. Colours: emerald `#1e5a40`/`#0f3125`, gold `#c9a24a`/`#f0d78c`, ivory from the map's `--bg`; respects dark mode and reduced motion.
- **Phone:** the strip "● 24 players online · 7 inside buildings" sits just below the clock, above the profile card and the apps. The WhatsApp card sits BELOW all the apps (scroll down).
- **Numbers** come from `21_online.sql`: `touch_online()` (called about once a minute by a signed-in player's open game; the server ignores pings faster than 40 s) and `online_now()` (anyone, guests included, can read it). "Online" = pinged in the last 3 minutes. "Inside" = those players who are in a building now (`player_stats.building`).
- **Privacy:** counts only. No names, no player ids. The busiest list only shows buildings with **2 or more** players, so one person can never be spotted. There is no "hide my online status" switch yet (planned in `STYLE_AND_SOCIAL.md`); when it is built, `online_now()` must skip those players.
- **Honest numbers:** if the SQL is not installed or the network is down, the labels are hidden. Demo mode (no Supabase keys) shows "1 online" (you). Nothing is ever made up.
- Cost: one small write per player per minute, one cheap count every 30 s per open page. Table `online_pings` has one row per player.

## To install
1. Run `supabase/21_online.sql` (or the rebuilt `ALL_IN_ONE.sql`) in the Supabase SQL Editor.
2. Deploy `public/`. No other change.
3. The SQL tests could not be run where this was written (no Postgres): run `supabase/tests/run.sh` once.
