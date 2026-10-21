# Celebrations (convocation, matriculation, …)

The admin can switch **festive decorations** ON and OFF for the whole game: on the **3D campus map** and on **every player's phone**.

## For the admin (2 minutes)
1. Open `/admin`, sign in to the game, enter the admin password (same one as the metrics dashboard).
2. In the **Celebrations** card pick the occasion: **Convocation 🎓, Matriculation 📜, Independence Day 🇳🇬, Christmas & New Year 🎄, Campus Celebration 🎉** (use the last one for Founders' Day, sports week, etc.).
3. Edit the **title** (max 60 letters) and **message** (max 160) if you like. The preview strip shows how the banner will look.
4. Choose **Run for**: until you turn it off, 6 hours, 1 day, 3 days, 7 days, or a date and time. It switches itself OFF when the time is up.
5. Press **Turn ON**. Players see it within a minute (no refresh needed). Press **Turn OFF** to remove it. While it is on, the button says **Update celebration**.

## What players see
**Map:** bunting (strings of coloured pennants) around the rooflines of the main landmarks, tall flags, bobbing balloon clusters, soft golden light pillars you can see from far away, a warm glow on the ground around the landmarks, gentle confetti wherever the camera looks, a glass ribbon with the title, message and countdown (players can hide it), and one confetti burst the first time they see it each session.
**Phone:** a swaying bunting garland, a soft glow with twinkling sparkles and drifting confetti on the home screen, a gold ribbon card with the title, message and "Ends in 2d 3h", a small gold star on the round phone button, and one friendly toast per day.
Colours change with the occasion (navy and gold for Convocation, emerald and gold for Matriculation, green and white for Independence, red/green/gold for Christmas, purple and gold for a party).
Players who set "reduce motion" on their device get still decorations (no drifting or bursting). On slow phones the map animates less often automatically.

## How it works (for developers)
- Server: `supabase/18_celebrations.sql`. One row (`public.celebration`, no grants). `get_celebration()` is readable by everyone and already applies the start/end clock. `admin_set_celebration(password, event, on, title, message, starts, ends)` re-checks the **same password and the same 5-tries lock-out** as `admin_metrics` (through `private.admin_gate`). Titles/messages are trimmed, stripped of control characters and length-checked; clients show them with `textContent` only.
- Client core: `public/world/game/celebrate/celebrate.js` (themes, state, `FutaCelebrate.onChange(fn)`; polls every 30 s and when the tab becomes visible). In demo mode the state lives in `localStorage['futa.celebration']`, so the admin page in one tab drives the map in another.
- Map: `celebrate-map.js` adds ONE `THREE.Group` named `celebration` to the campus group and removes it when OFF. It reads `window.FUTA_MAPCTX` (set in `public/world/index.html`). `FUTA_MAPCTX.fly(x, z, d, pit)` moves the camera (handy for tests).
- Phone: `celebrate-phone.js`, loaded by `phone/phone.js`; everything lives inside the phone's Shadow DOM.
- Admin: `public/admin/index.html` (Celebrations card).
- Add an occasion: add it to `THEMES` in `celebrate.js` and to the `check (event in (...))` list and the two `in (...)` lists in `18_celebrations.sql`, then re-run `tools/build-all-sql.sh`.
- Remove it completely: turn it OFF (nothing is drawn), or delete the `<script>` tags in `world/index.html` and the load line in `phone.js`.

## Test
`supabase/tests/test_celebrations.sql` (in `run.sh`). In a browser: open `/admin` and `/world/` in the same browser (demo mode), turn it ON in the admin, watch the map and the phone change; turn it OFF and watch them clear.
