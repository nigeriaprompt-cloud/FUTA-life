# Account settings in the phone — username, password, forgot password, log out

Built 2026-10-17. Phone app: `public/world/game/phone/apps/settings.js`. Server: `supabase/11_account.sql`. Browser API: `onboarding/api.js`.

## What the player sees (phone → Settings)
| Row | What happens |
|---|---|
| **Username** | Sheet with the current name. Typing is cleaned (lower-case, `a-z 0-9 _`, 3–20) and checked live ("✓ ada_lagos is available" / "That name is taken."). Save → toast, profile card updates. If they renamed recently: "You can change it again on 16 November 2026." |
| **Password** | Current password + new + again (8+ characters). Wrong current password is refused (Supabase checks it). Players who signed up with Google have no password yet: the sheet says **Set a password** and does not ask for a current one. |
| **Forgot password?** | Sheet shows the masked email (`a***@gmail.com`), **Send reset link** (button locks for 60 s). The link must be opened **in the same browser/device** (Supabase PKCE). |
| **Log out** | Already existed (Settings → Session → Log out → confirm). Unchanged. |

## The reset link (this was broken before)
Before: the email link took the player to the sign-up page signed in, and the page sent them on to the map. Nobody was asked for a new password.
Now: `API.resetPassword(email)` remembers "reset asked" on this device (`localStorage futa.recovery`, valid 1 h) and the link returns to `/world/game/onboarding/signup.html` (already in the Supabase **Redirect URLs**, SETUP §A6 — nothing new to add). On load `API.isRecovery()` sees the `?code=` + the flag and `onboarding.js` shows **Choose a new password** (`S.newpass`); saving calls `API.setPassword`, then continues to the map. A link opened on another device just shows a normal sign-in plus a hint to ask again.

## Username rules (server decides — `11_account.sql`)
- Same format/reserved/taken rules as sign-up (`username_available`).
- **One change per 30 days** after sign-up is finished. Change it: `insert into public.app_config(key,value) values ('account.username_cooldown_days','30') on conflict (key) do update set value = excluded.value;` (0 = no limit).
- Enforced by trigger `username_guard` on `profiles.username`, so `set_profile` and any future RPC obey it too, and re-running `01_schema.sql` cannot remove it.
- Every change is stored in `username_history` (no client access) so moderators can trace names. The SQL editor (no signed-in user) is not limited, so you can still rename someone by hand.
- **Old lines keep the old name:** past chat messages / feed posts store the name they were written with. Other players see the new name above the head after they next load the map (profiles are cached per session in `live.js`).

## Decisions I made (change if you disagree)
- 30-day cooldown (the docs were silent; keeps impersonation and harassment-by-renaming low).
- No banned-word check on usernames (sign-up does not have one either). If you want it, add it to `username_available` for both.
- A released name can be taken by anyone straight away (no "name hold").

## Set-up / merge
1. Run `supabase/11_account.sql` in the Supabase SQL Editor after `01_schema.sql`.
2. Supabase → Authentication → Email: make sure "Confirm email" and the recovery email template are on (default). Redirect URLs unchanged.
3. Files touched in the main project: `phone/apps/settings.js`, `onboarding/api.js` (one `resetPassword` replaced + new functions before `onAuth`), `onboarding/onboarding.js` (new `S.newpass` + 3 boot lines + one `STEP_OF` entry), `supabase/tests/run.sh` (one line), docs. New: `11_account.sql`, `test_account.sql`, `settings-account.js`, this file.

## Not tested (be honest)
Real Supabase (real reset emails, `updateUser`, `signInWithPassword`) and Postgres were not available in the build sandbox. Verified in a headless browser in demo mode (27 checks, `tools/test/settings-account.js`). The SQL tests (`tests/test_account.sql`, 21 checks) are written but not run. Before announcing: on the deployed site, request a reset email, open it on the same device, set a password, sign in with it; and rename a player twice to see the cooldown.
