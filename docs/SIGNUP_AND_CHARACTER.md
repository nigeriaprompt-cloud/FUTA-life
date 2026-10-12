# Sign-up and character creation

**Status:** working prototype in `public/world/game/onboarding/` (runs in "demo mode" with no server) + PHP API in `api/`.
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
  config.php       DSN, Google client id (env vars), age limits, reserved usernames
  v1/index.php     the router (all endpoints in one readable file)
  src/AvatarValidator.php   cleans every look before saving (mirror of FutaAvatar.look.normalize)
  src/GoogleVerifier.php    verifies the Google ID token on the server
  sql/schema.sql   world_users table (see DATA_MODEL.md §1 for how to map onto the existing users table)
```

## 3. Go-live checklist (do in this order)
1. **Existing users table.** Read the site's users/login code (Phase 0 `EXISTING_SYSTEM.md`). Decide: reuse the site's `users` (preferred — add columns/tables from `DATA_MODEL.md` §1) or keep `world_users` linked by `user_id`. Replace the `world_users` queries in `api/v1/index.php` accordingly. **Do not create a second login system** if the site already has one; if the site already logs people in, `/world` should skip screens 1–2.
2. **Google.** Create a Web OAuth client in Google Cloud Console, add the site's domain under *Authorized JavaScript origins*, put the client ID in `config.js` (`googleClientId`) and in the env var `FUTA_GOOGLE_CLIENT_ID`. Set `demo:false`. *The Google path has not been tested against real Google yet — test it with a real account before launch.*
3. **Email verification.** Registration currently logs the user in immediately (`needsVerify:false`). Add a 6-digit code email using the site's mailer, then flip the flag. Until then, do not give verified-only perks.
4. **CSRF + cookies.** Add the site's CSRF token to every POST (`api.js` `http()` is the single place). Session cookie is HttpOnly + SameSite=Lax; set `secure` on HTTPS (already automatic).
5. **Rate limits.** `rateLimit()` is per-session only. Add per-IP limits on `/auth/*` (web server or table).
6. **Password reset** (not built). Reuse the site's existing flow if it has one.
7. **Avatar hash for realtime.** After `POST /me/avatar`, store `md5(json)` and put it in the realtime token (`ARCHITECTURE.md` §Auth) so other players fetch/build the look once and cache it.

## 4. Safety rules built into sign-up (keep them)
- DOB is required; the server computes age. `<13` rejected (403). `<18` → `is_teen=1` (see `STYLE_AND_SOCIAL.md` §2 for what Teen Mode restricts).
- Usernames: lower-case `[a-z0-9_]{3,20}`, reserved list in `api/config.php`. They are shown above heads, so moderation can rename.
- Players can **never** save NPC-only items (uniforms, hi-vis, lab coat, peaked cap): `AvatarValidator::clean($look, false)` drops them. Only server-made NPC looks pass `true`. Never expose that flag to a request.
- Looks are stored as clean JSON, never as free text. Nothing the player types is rendered as HTML.

## 5. How to add a choice to the creator (the typical Cline task)
1. Add it to `public/world/game/avatar/avatar-options.json` (e.g. a new hairstyle id under `hair.styles`).
2. Run `python3 tools/build-options.py` (regenerates `avatar-options.js`).
3. Teach the builder how to draw it (`avatar-wear.js`, the `switch` for that slot). The creator UI and the PHP validator pick it up automatically — they read the same JSON.
4. Check it with the lab page: `avatar/lab.html?mode=one&look={…}` and the speed numbers (see `AVATAR_SPEC.md` §6).
