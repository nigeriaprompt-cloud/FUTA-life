# Handoff — auth fix + phone overlay (2026-10-17)

For merging with work done in another Claude account. Files touched, so conflicts are easy to spot:

**Auth (edited)** — `public/world/game/onboarding/`: `config.js` (demo:'auto'), `api.js` (google prompt, signOut, consumeAuthRedirect, resendConfirm, resetPassword, onAuth, friendlier errors), `onboarding.js` (back-button fix, Sign out, Google button busy/error, forgot/resend, redirect-if-onboarded, URL error toast, multi-tab sign-out), `signup.html` (+Sign out button), `onboarding.css` (+small styles).
**Auth (new)** — `supabase/04_auth_backfill.sql`.
**Phone (all new)** — `public/world/game/phone/` (`phone.js`, `phone.css`, `README.md`, `apps/manifest.js`, `apps/{shop,chat,settings,property,cars,clothes,accessories}.js`).
**Map (one line)** — `public/world/index.html`: added `<script src="game/phone/phone.js" defer></script>` just before `</body>`. Nothing else inside the map changed.
**Docs** — `CHANGELOG.md`, `SETUP_VERCEL_SUPABASE.md`, this file.

## Behaviour
- Demo mode while `supabaseUrl`/`supabaseAnonKey` are empty; real Supabase once both are filled. Google needs the provider switched on in Supabase and the Redirect URLs listed in `SETUP_VERCEL_SUPABASE.md` §A6.
- Log out: phone → Settings → Log out (also the "Sign out" pill on the sign-up screens). Clears the Supabase session, returns to the sign-up page.
- Phone: round button bottom-right calls it out; ⌄ button, swipe down on the status bar, home bar or Esc puts it away. Remembers open/closed. Scales from one CSS variable; on ≤560 px wide screens it is centred.
- Clothes is a real app now (`apps/clothes.js`); Property, Cars and Accessories have real apps too. Anything still on `apps/shop.js` is a placeholder (`apps/shop.js` → "LISTINGS HOOK"). Prices, ownership, payments must be server-side (`PAYMENTS.md`). Chat uses existing `room_messages` / `dms` tables + `send_room_message` / `send_dm` RPCs (room `campus_lobby`).

## Not tested (be honest)
Real Google OAuth and a real Supabase project were NOT available in the build sandbox. Verified in a headless browser: demo flow, real-mode boot with fake keys (error paths, URL clean-up), phone at 1366×800 and 390×780, log out. Test Google + email sign-up on the deployed site before announcing.
