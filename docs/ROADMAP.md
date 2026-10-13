# Roadmap — FUTA World

The product: a live 3D map of FUTA (Akure) inside the existing PHP social commerce site. Players walk around, enter buildings, chat,
buy virtual items and real products, and see each other live. NPCs (security, students, cleaners, lecturers) make the campus feel alive.

**Work one phase at a time.** Each phase ends with a "Done when" test the owner can run. Do not skip ahead.

Assets you start with (put them in `/assets/reference/`):
- `futa-map-modern.html` — the working 3D map (buildings, gates, compounds, zoo, farm, pitch, car parks). See `ARCHITECTURE.md` §4.
- `students.html` — the original look reference. The production avatar/NPC builder is now `public/world/game/avatar/` (see `docs/AVATAR_SPEC.md`); keep this file only as a style reference.
- `campus.html` — reference for the original modern-campus look and tree shape.

---

## Phase 0C — Vercel + Supabase foundation (DONE in this package, needs real-project test)
Schema + RLS + RPCs, sign-up on Supabase, live client + demo. **Done when:** owner follows `SETUP_VERCEL_SUPABASE.md`, two phones sign up, and both appear in `profiles`. Next phase to start: the walkable interior scene that uses `live/` (see `SUPABASE.md` §5).

---

## Phase 0 — Discovery and foundation
**Goal:** the map runs inside the site, and the pieces every later phase needs exist.
- Read the existing site; write `docs/EXISTING_SYSTEM.md` (framework/folder layout, PHP version, DB tables for users/shops/products/orders, auth/session method, upload handling, hosting).
- Page `/world` (PHP) that serves the map and requires login (guests may view, read-only).
- `GET /api/v1/time` (server time, Africa/Lagos) and `GET /api/v1/world/snapshot` (the world JSON, initially read from a file; same shape as the map's embedded data).
- Find out how the map's built-in admin editor currently saves (look for `flushSoon`) and document it in `EXISTING_SYSTEM.md`; do not change it yet.
- Add the `window.FUTA` bridge to the map (events and methods listed in `ARCHITECTURE.md` §5). Do not restructure the map.
- Migrations folder + first migration (settings table, admin roles).
**Done when:** logged-in users open `/world`, the map loads from the snapshot API, and `FUTA.on("buildingClick", …)` fires in the console.

## Phase 0B — Sign-up and character (prototype already built — integrate it)
**Goal:** a new visitor can sign up with Google or email, pick a username and age, design their character and start their story.
- Read `docs/SIGNUP_AND_CHARACTER.md` and follow its **Go-live checklist** (map onto the existing users table, Google client ID, email verification, CSRF, rate limits).
- Files already exist in `public/world/game/onboarding/`, `public/world/game/avatar/` and `api/`. Wire them to the real database; do not redesign the screens or the avatar builder.
- Keep avatar data as `avatar_json` v1 validated by `AvatarValidator` (server) — see `docs/AVATAR_SPEC.md`.
**Done when:** on a phone-size browser a new user finishes Google sign-up and email sign-up, saves a look, refreshes mid-creator without losing it, and `/me` returns the saved avatar; a request that tries to save an NPC uniform is silently replaced; under-13 is refused and under-18 gets Teen Mode.

## Phase 1 — Time of day (Nigeria time)
**Goal:** morning, golden hour, and night follow real Lagos time.
- Use the server time from `/api/v1/time` (not the player's device clock). Sun position from the `suncalc` library for Akure (7.30°N, 5.14°E).
- Presets blend smoothly: dawn, morning, midday, golden hour, dusk, night. Street lamps and window glow turn on at dusk. See `GAME_DESIGN.md` §1.
- A hidden test control (`?tod=HH:MM` in the URL, admin only) to preview any time.
**Done when:** changing `?tod=` shows each preset; at the real current time the map matches the sky; lamps are lit at night.

## Phase 2 — Players live in the map
**Goal:** see other real players moving, with name labels.
- Realtime server (Node.js + `ws`) next to the PHP site; PHP issues a short-lived signed token; the server never talks to the browser without it.
- Player avatar (default look), click-to-move outdoors, other players interpolated, floating username label. Clicking a label opens a small menu (Profile, Chat, Add friend, Report, Block).
- Presence and zone rooms (`ARCHITECTURE.md` §6). Budget: 150 players visible per client at most, nearest first.
**Done when:** two browsers logged in as different users see each other walk, with correct usernames, and the menu opens.

## Phase 3 — Phone, chat, profiles
**Goal:** the in-game phone and messaging.
- Phone overlay (DOM, not 3D) with apps: Map (navigate/search buildings), Chat, Groups, Friends, Profile, Settings. Later phases add Shop, Orders, Wallet, Garage.
- Chat rooms: current building/zone room, direct messages, groups. Stored in MySQL; moderation basics (report, block, rate limit, word filter hook).
- Public profile page: username, avatar picture, bio, owned items (car/house/bags shown later), shop link.
- **Safety defaults are part of this phase:** `docs/STYLE_AND_SOCIAL.md` §2 items 1–8 and 11–13 (stranger DMs off, wave + message requests, personal bubble, consent for interactions, block-hides-both, privacy switches, 2-tap report, chat filter, age gate). Do not ship chat without them.
**Done when:** players in the same building chat in a room, DM each other, create a group, and open each other's profile; a stranger can only wave; a block makes both players invisible to each other.

## Phase 4 — NPCs outdoors
**Goal:** a living campus without needing players.
- NPC engine per `GAME_DESIGN.md` §2: deterministic schedules (every client computes the same positions from the Lagos clock; no per-NPC network traffic).
- Roles: security (gates, main buildings, facilities), cleaners, lecturers, students (walking, sitting in compounds). Uniforms per `GAME_DESIGN.md` §2.2.
- Spawn only near the camera; hard cap of active NPCs (§2.5).
**Done when:** guards stand at all three gates and main buildings; students walk and sit in compounds; counts drop to zero when zoomed far out; frame rate stays within budget.

## Phase 4B — Lagos life layer (stay-and-come-back loop)
**Goal:** the world feels like a living Lagos campus life, not just a map. Spec: `docs/LIFE_LAYER.md`.
- Stats (cash, energy, mood) + HUD, wake/sleep loop, 3 gigs through one shared gig runner, food/transport costs, events engine (NEPA outage first), daily reward.
**Done when:** a new player can do two gigs, eat, sleep, see an event banner and get tomorrow's reward, all persisted server-side.

## Phase 5 — Interiors v1
**Goal:** enter a building, see a real interior with people doing the right thing.
- Interior loader (lazy module, one interior in memory at a time), indoor click-to-move, door/transition animation, indoor chat room per building.
- Templates in v1: lecture theatre, library, administrative office, hostel. Others show a clean "coming soon" room. Details in `GAME_DESIGN.md` §3.
- NPCs inside (lecturer teaching, seated students, librarian, receptionist, security at the door) and player activities (§5).
- Hook already in the map: `FUTA_INTERIOR.enter(building)`.
**Done when:** clicking the Library enters it; a lecturer is teaching in a lecture theatre; other real players appear inside the same room; leaving returns to the outside spot.

## Phase 6 — Shops, products, orders, WhatsApp
**Goal:** real businesses on the map.
- Any user can open a shop and upload products (reuse the site's existing shop/product tables; extend only if missing).
- Admin can link a building to a shop/owner (`building_links`, with verification status). Linked buildings show a shop UI when entered/clicked.
- Buying creates an order, then redirects to WhatsApp with a prefilled message (`wa.me`) containing the order reference. Restaurants/shops get "Order here".
- Orders app on the phone for buyers and sellers.
**Done when:** a seller uploads a product, admin links it to a building, a buyer orders, WhatsApp opens with the right message, and both sides see the order.

## Phase 7 — Virtual store, wallet, payments
**Goal:** buy clothes, hair, bags, cars and houses; pay with Paystack or manual flow.
- Wallet with a ledger (coins and Naira), top-up flow, `PAYMENTS.md` in full (Paystack + manual + admin switch).
- Virtual catalog and inventory; wardrobe UI; hairdresser (hair styles/plaits); cars shown parked/owned and listed on the public profile; houses are purchasable plots/buildings the admin marks "for sale".
**Done when:** a player tops up (test mode), buys an outfit and a hairstyle and wears them; another player sees the new look; profile shows the owned car/house.

## Phase 7B — Style & Social (retention and growth)
**Goal:** give women (and everyone) their own reasons to stay: expression, friends, home, events, safe control. Spec: `docs/STYLE_AND_SOCIAL.md`.
- Order: (1) makeup/nails layers + photo mode + Lookbook/Style Feed + share card with referral link; (2) squads; (3) hangouts, events calendar, Girls' Lounge, aso-ebi events; (4) home decor, pets, rent; (5) mini-jobs, quests, collections, referral rewards, ambassador codes; (6) "Try it, then book it" for real stylists/tailors via shops.
- Rules: no looks-based ranking of people, no pay-to-message, no way to bypass safety defaults.
**Done when:** a player makes a look, takes and shares a photo, a friend joins from the link and both receive the referral item; a squad can host an event with RSVPs; a girls-lounge opt-in works with report/mute tools; a booking button opens WhatsApp for a real stylist.

## Phase 8 — Group contributions (crowdfunding) — **DEFERRED. Do not build until the owner says traffic is high enough.**
**Goal (later):** friends contribute toward something one person wants to buy.
- Create a contribution goal for a product or catalog item; share it; contributors pay (Paystack or manual); progress bar; deadline.
- Rules for success, failure and refunds exactly as in `PAYMENTS.md` §6. **Get legal review before going live.**
**Done when:** a goal reaches its target and the purchase completes; a goal that expires refunds every contributor and the ledger balances.

## Phase 9 — Interiors v2, admin world editor, hardening
- Remaining interior templates (clinic, bank, restaurant/shop, church/mosque, gym, senate hall…).
- Admin world editor UI over the endpoints that already exist: create/edit/name buildings, roads, areas, props; draft → publish → rollback; audit log (`DATA_MODEL.md` §2).
- Load testing, moderation tools, backups, monitoring.

---

## Prompt template for Cline (copy for each phase)
> Read `.clinerules`, `docs/ROADMAP.md` and `docs/ARCHITECTURE.md`. We are doing **Phase N — <title>** only.
> First inspect the existing code and tell me your plan in 10 lines or less. Then implement it step by step. Do not touch anything outside this phase.
> When finished, show me how to test each "Done when" item, and update the docs and CHANGELOG.
