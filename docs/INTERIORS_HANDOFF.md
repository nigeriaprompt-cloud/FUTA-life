# Interiors — handoff to Cline (state on 2026-10-17)

**Owner's requirements:** every clickable building (all 366 on the map) has an interior chosen by building type; interiors are beautiful; NPCs fit the type; **ATM only in banks**; **security NPC in every administrative and academic building and bank**; many clickable objects per type (hostel: bunk, wardrobe, reading table, gas cooker + pot, fridge…); the main map changes with Nigeria time (morning / golden hour / night).

## 1. What is DONE
| Piece | Where | Status |
|---|---|---|
| Day/night on the main map (Lagos time, sky dome, window glow, lamps, clock chip) | `public/world/index.html` + `game/interior/clock.js` (`FutaClock`) | Works; checked at 7:00, 12:00, 17:48, 21:00. Preview any hour with `?t=18.5` |
| Furniture library (~90 pieces) | `game/interiors/furniture.js` | Done |
| 3D kit (merged geometry, baked shading, few draw calls) | `game/interiors/kit.js` | Done |
| Room builder (floor/walls/windows/door/lights/NPC stations) | `game/interiors/rooms.js` | Done |
| Camera stage (cut-away walls, orbit/zoom, sky from clock) | `game/interiors/stage.js` | Done |
| Template system + `classify(building)` → template id (all 11 map types, name rules) | `game/interiors/templates.js` | Done |
| Interaction mapping furniture → activities, filtered by venue | `game/interiors/acts.js` | Done |
| Layout checker (overlaps, reachability, ATM-only-in-bank, security rule) | `game/interiors/check.js` | Done |
| Dev preview page | `game/interiors/preview.html?tpl=hostel&t=15` | Done |
| Templates: hostel, house | `tpl_res.js` | Built, checker errors (see §3) |
| Template: bank (ATMs, security, brand colours) | `tpl_bank.js` | Built, checker errors |
| Templates: pharmacy, provisions, supermarket, bookshop, phone_shop, print_shop, cyber_cafe, bakery, restaurant(+variants), salon, petrol_shop, carwash | `tpl_commerce.js` | Built, mostly checker errors |
| Templates: health_centre, clinic, church, mosque, gym, sports_room(+variants), workshop(+variants), visitor_centre | `tpl_care.js` | Built, checker errors |
| 40 activities (sleep, study, cook, eat, workout, pray, atm…) with energy/hunger/mood/knowledge effects, venue rules, cooldowns | `game/interior/activities.json` → generated `activities.js` + `supabase/03_activities.sql` (`do_activity` RPC) | Server side done; 92 SQL checks passed (incl. "ATM works only inside a bank") |
| Extra NPC roles (teller, pharmacist, cleric, pastor, cook, stylist, trainer) and poses (cook, eat, type, pray, lift, sleep, browse, mirror, watch) | `game/avatar/avatar-npc.js`, `avatar-rig.js` | Done |
| Click-to-walk pathfinding, seat claims, ATM panel | `game/live/interact.js`, `live.js` | Done (tested earlier) |

Screenshots of finished rooms: `docs/interior-shots/`. Latest checker run for all templates: `docs/interiors-report-2026-10-17.json` (re-run with the command in §6).

## 2. What is NOT done (in this order)
1. ~~`tpl_edu.js` is missing~~ **DONE 2026-10-17: all 11 templates exist and pass the checker.** (Original note:) Needed template ids (already referenced by `classify`): `library`, `lecture_theatre` (variant `rooms`), `auditorium`, `computer_lab`, `lab`, `faculty`, `admin_office`, `primary_school`, `student_union`, `museum`, `business_centre`. **Each of the first eight MUST have `security:true` and a `D.SEC(...)` NPC with `hours:'always'`.** Copy the style of `tpl_res.js` / `tpl_bank.js`; load it in `preview.html` (already referenced there) and in the game page.
2. **Fix layout checker errors** in the 21 existing templates. Most are "seat walled in" for `sofa`/`chair`/`dining` and "overlap" between small pieces (plant/lamp/dispenser vs shelves). Likely two causes: (a) the checker's walled-in test is too strict for sofas/seats against furniture — check `check.js` first and decide whether the checker or the layouts are wrong; (b) real overlaps: nudge pieces. Goal: `node tools/test/interiors-shot.js outdir all 15` prints **all templates clean**.
3. **The walking game scene (`game/interiors/engine.js` + `public/world/interior.html`)** — not written. It must: read the building (id, name, type) from the URL; `FutaTemplates.make(building)`; `FutaStage.create`; spawn the player avatar (`FutaAvatar.create(me.avatar, {lod:0})`) at `built.spawn`; click handling → `FutaInteract.create({live, player})` with `built.blockers/seats` (see `live/interact.js` header and `live/live-demo.html` STEP 1–4 for the wiring); click furniture with an `inter` id → walk to its use-spot → play the activity pose for `secs` → call RPC `do_activity(id)` (server decides effects) → show result toast + stats HUD (energy/hunger/mood/cash); `wardrobe` opens the creator overlay (`onboarding/creator.js`) and saves with `save_avatar`; `atm` opens the ATM panel (`FutaInteract.openAtm`) — **only exists in bank rooms**; click NPC → short speech bubble by role; NPCs from `built.spec.npcs` using `FutaAvatar.npc.create(role, seed)`, hours from the Lagos clock (`FutaClock`), behaviours post/sit/patrol/sweep/teach/wander (see `templates.js` header); join live room `int_<buildingId>_1` so real players appear (`live/live.js`, `remotes.js`); Exit door/button → `/world/`. Keep NPC caps (≤25 indoors) and dispose everything on exit.
4. **Map hook:** in `public/world/index.html` the map already calls `window.FUTA_INTERIOR.enter(building)` for every building (info-panel "Enter building" button, and automatically for main buildings). Define it (small inline script or `game/interiors/enter.js`) to navigate to `interior.html?id=<building.id>&n=<name>&t=<type>`. Do not otherwise edit the 800 KB map file.
5. **Docs/tests:** add `docs/INTERIORS.md` (how to add a template/furniture/activity), a headless test that opens every building from `game/interior/../../buildings` list through `classify` and asserts: ATM only in `bank`; security in admin/academic/bank; every template builds with zero checker errors. A list of the 366 buildings can be extracted from line 72 of `public/world/index.html` (`window.PTW_DATA.buildings`).
6. **Cleanup:** `game/interior/{kit,props,templates}.js` are an older abandoned attempt; nothing in `game/interiors/` uses them (only `interior/clock.js` and `interior/activities.js` are used). Delete the three after confirming with grep.
7. **Apply SQL:** run `supabase/03_activities.sql` after `01_schema.sql` on the real Supabase project.

## 3. Rules Cline must keep (owner's)
- ATM only in `bank`. Security NPC in admin/academic/bank (checker enforces; keep it that way).
- Server decides every effect/cost (`do_activity`); the browser only displays. Add activities in `interior/activities.json`, run `python3 tools/build-options.py`, re-run `03_activities.sql`.
- Interiors load lazily on their own page; never add them to the map file. No build tools. Phone performance: merged geometry, ≤25 NPCs, dispose on exit.
- No child NPCs (primary school: teacher/staff only).

## 4. Building → template examples (from `classify`)
Banks (Wema, First Bank, UBA) → `bank` · Albert Ilemobade Library → `library` · LT1/LT2/ETF/1000-capacity → `lecture_theatre` · Great Hall/auditoria → `auditorium` · SET/SEET/SOC/SLS/SAAT/School of… → `faculty` · Senate/Alumni/PTA/Step-B/CCE Office → `admin_office` · ICT/Computer Resource Centre → `computer_lab` · University Health Centre → `health_centre` · 82 hostels → `hostel` · 97 houses → `house` · mosques → `mosque` · churches/chapel → `church` · shops/pharmacies/salons/restaurants → their commerce templates. Same building id always gives the same layout (seeded).

## 5. Known honest limits
Interiors have only been rendered in a software-GPU headless browser, never on a real phone; Supabase not yet tested live; the walking scene does not exist yet, so none of the interiors can be entered in the game until step 3–4 are done.

## 6. Commands
```
PW_CORE=/opt/node22/lib/node_modules/playwright CHROME=/path/to/chromium node tools/test/interiors-shot.js outdir all 15     # all templates, hour 15 (also try 18.5 and 21)
open public/world/game/interiors/preview.html?tpl=bank&t=18.5     # via any static server (cd public && python3 -m http.server 8000)
sh supabase/tests/run.sh -h localhost -d scratch_db               # SQL tests (throwaway DB only)
```

## 7. Prompts to paste into Cline (one per task, in order)
1. "Read .clinerules, docs/INTERIORS_HANDOFF.md and docs/SUPABASE.md. Create public/world/game/interiors/tpl_edu.js with the 11 templates listed in §2.1, matching tpl_res.js/tpl_bank.js style. Security NPC (hours always) in the first eight. Verify with tools/test/interiors-shot.js and look at the PNGs."
2. "Make `tools/test/interiors-shot.js all 15` report zero errors by fixing check.js (if too strict) or the template layouts. Report which you changed."
3. "Build public/world/game/interiors/engine.js and public/world/interior.html per §2.3, wiring live/interact.js, live.js, remotes.js, activities (do_activity RPC), wardrobe→creator, NPCs with Lagos-time schedules. Test in a headless browser for hostel, bank, library."
4. "Add the FUTA_INTERIOR.enter hook per §2.4 and test: click a hostel on the map → Enter → interior loads → Exit returns to map."
5. "Do §2.5–2.7 (docs, all-366-buildings test, cleanup, SQL)."

## Progress log
- 2026-10-17: **library** template done in `tpl_edu.js` (security guard hours:always + patrol, librarian, students, cleaner; clickable shelves, tables, PCs, printer, notice board, water dispenser). Fixed a rooms.js bug (black gaps in wood floors). Remaining checker messages for library are the shared "seat walled in / unreachable seat" ones, which appear in every template → fix `check.js` in step 2. 
- 2026-10-17: **all 11 education/admin templates done and checker-clean** (library, lecture_theatre, auditorium, computer_lab, lab, faculty, admin_office, primary_school, student_union, museum, business_centre). Security NPC (hours:always) in the first eight.
- **Next (in order):** (a) build the walking engine `game/interiors/engine.js` + `public/world/interior.html` + the `FUTA_INTERIOR.enter` hook, so interiors can actually be entered; (b) fix checker errors in the 21 older templates (hostel, bank, pharmacy, provisions, bookshop, phone_shop, print_shop, cyber_cafe, bakery, restaurant, salon, petrol_shop, carwash, health_centre, clinic, church, mosque, gym, sports_room, workshop, visitor_centre) — mostly use-spots inside furniture, overlaps, NPCs standing in furniture: nudge positions or pass `{spot:[x,z,face]}`; (c) all-366 building test; (d) delete obsolete `game/interior/{kit,props,templates}.js`.
- 2026-10-17 (later): **walking scene DONE**: `game/interiors/engine.js`, `public/world/interior.html`, map hook `game/interiors/hook.js` (+ `entryOf` in `world/index.html` now lets every building be entered). Verified headless: map → Enter → interior (bank), walking, sitting, using furniture (server rules incl. cooldowns), ATM panel (bank only), sleeping on a bunk, NPC schedules + patrol, talk bubbles. `tools/test/interiors-all366.js`: **all 366 buildings get a template; ATM only in banks; security rule OK**. Obsolete `game/interior/{kit,props,templates}.js` deleted. Docs: `docs/INTERIORS.md`. Bank/bar activities fixed (no drinks/TV in banks); `03_activities.sql` regenerated — **re-run it on Supabase**.
- **Still open:** (1) 21 older templates still have checker errors (another account is on it); (2) wardrobe needs `window.FUTA_OPEN_CREATOR(returnUrl)` from the sign-in/phone-app work; (3) run `supabase/01..03` on the real project and test live rooms with two phones; (4) real-phone performance test (only software-GPU headless done); (5) polish: camera cut-away when the player sleeps on a lower bunk.
- 2026-10-17 (merge): merged the other account's **auth + phone** zip (onboarding/*, phone/, 04_auth_backfill.sql, docs). Phone overlay now also loads in `interior.html`. **Wardrobe now works**: engine goes to `signup.html?stay&edit=look&r=<interior url>`; `onboarding.js` opens the outfit editor and returns to the building after saving (return url must start with `/`). So open item (2) above is DONE. Regression run after merge: all-366 rules OK, map→interior OK, ATM/sleep/patrol OK.

- 2026-10-17 (layout pass): fixed all 21 failing templates; all 33 templates + every variant pass `check.js` (258 builds, 6 seeds each). Engine: `rooms.js relocateSpots()` moves a walled-in use-spot to the nearest free reachable spot facing the piece (`p.spot` keeps the same {x,z,face} shape); `templates.js snapNpcs()` snaps NPC `at` spots that fall inside furniture; a variant builder may set `C.npcs` to replace the default NPC list (sports_room grandstand/tabletennis). Layout changes: church 4 pew rows at 1.7 m pitch + 3 choir chairs; fast-food 4 booths; amala 2 long tables; cyber cafe desk row from x 2.4, counter 2.3 wide, sofa moved; salon counter 1.6 wide at (6.2,4.2), TV on front wall x 5.2 (salon chairs/basins unchanged); print shop counter 3.8 wide; grandstand tiers 2 m pitch. Rule: with 0.25 m cells and 0.2 m inflation an aisle needs ~0.9 m clear to leave a walkable cell. Run `node tools/test/interiors-headless.js` before and after any template change. Screenshots not re-taken.

- 2026-10-18: Bank vault door + jail cell added (`tpl_vault.js`, `vault-*.js`, `jail.js`). See `docs/VAULT.md`.
