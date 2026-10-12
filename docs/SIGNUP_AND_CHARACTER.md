# Sign-up and character creation

**Status:** working prototype in `public/world/game/onboarding/` (client) + Node API on Vercel (`api/index.js` + `lib/`, Supabase Postgres — `docs/DEPLOY.md`). Demo mode still works with `demo:true` for UI-only previews.
**Cline's job (Phase 0B):** connect it to the real site, real database and real Google client ID. Do not redesign the screens.

## 1. The player's journey (6 screens)
| # | Screen (`S.<name>` in `onboarding.js`) | What happens | Saved by |
|---|---|---|---|
| 1 | `welcome` | Tagline + "Create my character" / "I already have an account". The 3D engine starts downloading quietly in the background. | – |
| 2 | `account` | **Continue with Google** or **email + password** (tabs: Create account / Sign in). | `POST /auth/google`, `/auth/register`, `/auth/login` |
| 3 | `profile` | Username (live availability check) + date of birth. Under 13 = blocked. 13–17 = **Teen Mode** (`is_teen=1`). | `GET /username/check`, `POST /me/profile` |
| 4 | `look` | Character studio: 3D preview you can rotate + tabs Body, Face, Hair, Makeup, Clothes, Extras. Random button. Draft is kept in `localStorage` so a refresh loses nothing. | `POST /me/avatar` |
| 5 | `life` | "How does your story start?" — 3 starts from `life-start.json`. | `POST /me/life` |
| 6 | `final` | Shows the finished character waving; **Enter FUTA World** → `FUTA_CONFIG.afterUrl`. | – |

Resume rule (`route()` in `onboarding.js`): after login the player lands on the first unfinished screen (no username → profile, no avatar → look, no life → life, else final).

## 2. Files (all small, all plain JS/CSS, no build step)
```
public/world/game/onboarding/
  signup.html      page shell (loads only CSS + 3 small scripts)
  config.js        THE ONLY FILE YOU EDIT FOR SETTINGS: demo on/off, apiBase, googleClientId, afterUrl, ages, brand
  api.js           one function per endpoint; demo:true answers from localStorage so the flow works offline
  onboarding.js    the screens + routing + lazy loading of the 3D engine
  creator.js       the character studio widget (FutaCreator.mount) — data-driven from avatar-options.json
  creator.css / onboarding.css   styles; colours are CSS variables at the top of onboarding.css
  life-start.json  the 3 story starts (edit text/cash/stats here)
api/
  index.js         the router (all endpoints in one readable file) — the single Vercel function
  lib/             config.js (env + rules), session.js (HMAC cookie + CSRF), db.js (+supabase/memory adapters),
                   normalize.js (look cleaner, mirrors FutaAvatar.look.normalize), google.js, password.js (scrypt)
supabase/schema.sql  world_users + world_sessions + rate_limits (RLS locked; see DATA_MODEL.md §1)
```

## 3. Go-live checklist (do in this order)
1. **Users table.** Sign-in now runs on `world_users` in Supabase (`supabase/schema.sql`). If the old PHP site has real accounts to keep, migrate them into `world_users` as a one-off script (hashes: `password_hash` format is documented in `lib/password.js`). **Do not create a second login system**; `/world` skips screens 1–2 for signed-in players.
2. **Google.** Create a Web OAuth client in Google Cloud Console, add the site's domain under *Authorized JavaScript origins*, put the client ID in `onboarding/config.js` (`googleClientId`) and in the Vercel env var `GOOGLE_CLIENT_ID` (server-side; both must match). `demo:false` is already set. *The Google path has not been tested against real Google yet — test it with a real account before launch.*
3. **Email verification.** Registration currently logs the user in immediately (`needsVerify:false`). Add a 6-digit code email (see the TODO in `api/index.js`), then flip the flag. Until then, do not give verified-only perks.
4. **CSRF + cookies — done.** `api/index.js` enforces double-submit CSRF on every POST (`X-CSRF-Token` = `futa_csrf` cookie) and `api.js` sends it. Session cookie is HttpOnly + SameSite=Lax + Secure on HTTPS; sessions are database rows (`world_sessions`), so logout revokes server-side.
5. **Rate limits — done** for auth: 8/min per IP on `/auth/*` via the `rate_limits` table (SQL function `rate_limit_hit`). Add more buckets as new endpoints arrive.
6. **Password reset** (not built). Add it to `api/index.js` before launch if the site has no mail flow yet.
7. **Avatar hash for realtime — done.** The realtime JWT's `user_metadata.avatar_hash` is `sha1(avatar_json).slice(0,16)`; clients fetch the look once from `GET /players/{username}/avatar`.

## 4. Safety rules built into sign-up (keep them)
- DOB is required; the server computes age. `<13` rejected (403). `<18` → `is_teen=1` (see `STYLE_AND_SOCIAL.md` §2 for what Teen Mode restricts).
- Usernames: lower-case `[a-z0-9_]{3,20}`, reserved list in `lib/config.js`. They are shown above heads, so moderation can rename.
- Players can **never** save NPC-only items (uniforms, hi-vis, lab coat, peaked cap): `lib/normalize.js` `clean(look, false)` (mirrors `FutaAvatar.look.normalize`) drops them. Only server-made NPC looks pass `true`. Never expose that flag to a request.
- Looks are stored as clean JSON, never as free text. Nothing the player types is rendered as HTML.

## 5. How to add a choice to the creator (the typical Cline task)
1. Add it to `public/world/game/avatar/avatar-options.json` (e.g. a new hairstyle id under `hair.styles`).
2. Run `python3 tools/build-options.py` (regenerates `avatar-options.js`).
3. Teach the builder how to draw it (`avatar-wear.js`, the `switch` for that slot). The creator UI and the PHP validator pick it up automatically — they read the same JSON.
4. Check it with the lab page: `avatar/lab.html?mode=one&look={…}` and the speed numbers (see `AVATAR_SPEC.md` §6).
