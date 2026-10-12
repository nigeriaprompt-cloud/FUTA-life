# Architecture

## 1. The big picture

```
 Browser (player)
 ├─ Landing page + sign-up/creator (static pages under public/)
 └─ /world  ──►  Map (three.js r128)  +  Game layer (plain scripts, window.FUTA bridge)
         │ HTTPS (REST, JSON)                      │ WSS (realtime)
         ▼                                         ▼
  Node API on Vercel (api/index.js)  ◄─ signed JWT ──  Supabase Realtime (broadcast + presence)
  accounts · sessions · looks · rate limits            presence · movement fan-out
         │                                             (chat follows the same channels, Phase 2)
         ▼
  Supabase Postgres (RLS locked; service-role key only)
```

**Why serverless + Supabase (Phase 0 decision):** the PHP backend was dropped (kept in `legacy/php/` for reference; see docs/DEPLOY.md).
Vercel runs one readable Node function (`api/index.js`) for every `/api/v1/*` route and serves the static front end; Supabase Postgres is
the source of truth and Supabase Realtime carries live state — no long-lived process of our own to run.

**Ownership rule (important):** the API owns everything involving money, ownership, accounts, orders, admin and world data. Realtime
carries only live state (who is where) and later chat delivery. Nothing in the browser is trusted: prices, balances, roles, ages and
payment success are decided on the server.

## 2. Repository layout (as built in Phase 0; later phases add folders)

```
public/index.html                landing page
public/world/
  futa-map-modern.html           the map exactly as delivered (ONE tail patch: game-layer script tags, §4)
  game/
    avatar/                      avatar builder (avatar-*.js), avatar-options.json (single source of truth), lab.html
    onboarding/                  sign-up + creator (config.js, api.js, signup.html, …)
    net/
      bridge.js                  the window.FUTA bridge (§5)
      realtime.js                live players via Supabase Realtime (zone broadcast + presence)
  vendor/three.min.js            three.js r128 (the map itself loads r128 from CDN)
api/index.js                     the whole v1 API in one readable file (API.md §0)
lib/                             server helpers: config, http, password, session, db (+supabase/memory adapters), normalize, google
supabase/schema.sql              world_users, world_sessions, rate_limits + RLS + realtime policies (paste into Supabase SQL editor)
tools/                           generators + tests (tools/test/api-node.mjs)
legacy/php/                      the old PHP API, kept for reference only (not served)
docs/                            these documents
(planned, later phases)
config/                          world_seed.json, npc/*.json, interiors/*.json
public/world/game/               time/, players/, npc/, interiors/, phone/, activities/
```

## 3. Data-driven world
Everything on the map is data: buildings, roads, areas (campus, sports, market…), props (trees, gates, cars), regions. The map already
reads one JSON object (`window.PTW_DATA`: `regions, buildings, roads, areas, props, sellers, people`). Keep that exact shape.
- Phase 0: `GET /api/v1/world/snapshot` returns it from `config/world_seed.json`.
- Phase 9: the same endpoint returns the *published* version from the database (`DATA_MODEL.md` §2); admins get drafts.
- Building fields the map already understands: `name, type, lod, footprint, structure{floors,height,roofType}, style, color, roofColor,
  emoji, short, state, interiorEnabled, variant (0–4), entry ("interior"|"compound"), compound, solar, site`.
- New fields added by this project (always optional, ignored by old code): `linkId` (→ `building_links`), `interiorTemplate`,
  `interiorConfig` (JSON), `npcRoles` (override), `forSale` (houses).

## 4. The map (what exists, what to respect)
- A single self-contained file (`public/world/futa-map-modern.html`, served at `/world/` via a `vercel.json` rewrite) using three.js r128.
  Buildings are instanced meshes with a custom facade shader; compounds, sites
  (fenced hostels, banks, zoo, farm, pitch, petrol stations, car parks) and NPC-free props are built **lazily** when the camera is near
  and disposed when far. Keep that pattern for everything you add.
- Camera: `S` (current state: x, z, d=distance, yaw, pit), `G` (goal for smooth moves), `place()`. Existing click behaviour:
  faculty buildings fly into their grounds; main buildings (`entry:"interior"`) fly to the door and call `FUTA_INTERIOR.enter(building)`.
- The map already contains its own admin editor (create/edit buildings, roads, areas, props; draft → publish via `flushSoon()`). In a later phase, reroute that save to the `/admin/world/*` endpoints (Phase 9); until then leave it working as it is.
- Do not edit its internals except to add the bridge (§5). If something must change inside, make the smallest patch and note it in the CHANGELOG.
  **Phase 0 did exactly one such patch:** seven `<script src="game/…">` tags at the very end of the file (avatar builder, `bridge.js`,
  `realtime.js`). Nothing else in the file was touched.

## 5. The `window.FUTA` bridge (Phase 0)
The only supported way for game code to talk to the map.

Events (`FUTA.on(name, fn)`): `ready`, `buildingClick(building)`, `enterBuilding(building)`, `leaveBuilding`, `groundClick({x,z})`, `frame(dt)`,
`cameraChange`, `worldReloaded`.
Phase 4 adds `FUTA.getSlots(buildingId)` → seat/bench/door/gate positions of a compound or site for NPC placement.
Methods: `FUTA.getBuildings()`, `getBuilding(id)`, `worldToScreen(x,z,y)`, `groundAt(x,z)`, `addToScene(object3d)`, `removeFromScene(o)`,
`setLighting({sunDir, sunColor, ambient, sky, fog, lampsOn})`, `flyTo({x,z,d,yaw,pit})`, `getScene()`, `getCamera()`, `registerInterior(template, loaderFn)`.
Everything the game layer draws goes through `addToScene` and is owned (and disposed) by the game layer.

Phase 0 additions (implemented in `game/net/bridge.js`, used only by `game/net/realtime.js`): `FUTA.isReady` (bool — set once the world
data is applied), `FUTA.getCameraState()` → `{x,z,d,yaw,pit}` (mirror of the map's `S`), and the bridge emits one `cameraChange` right
after `ready` so consumers learn the starting position immediately. `groundAt(x,z)` returns `0` (flat campus) until real elevation data
exists. `buildingClick` fires for `kind==="building"` selections; `groundClick` fires on a tap that selects nothing. `enterBuilding` /
`leaveBuilding` start firing only once something calls `FUTA.registerInterior` (Phase 3) — until then the map shows its own
"isn't built yet" note.

## 6. Realtime design (Phase 0 built: movement + presence; chat next)
- **Transport:** Supabase Realtime (broadcast + presence channels) — no separate ws server to run. Auth = a server-signed Supabase JWT
  (`POST /api/v1/realtime/token`; 1 h lifetime; signed with the project's JWT secret; `role:"authenticated"`; carries `username` and
  `avatar_hash` in `user_metadata`).
- **Rooms:** `zone:<cellX>:<cellZ>` (outdoor, 100 m cells; a client subscribes to its cell + 8 neighbours = interest management).
  Channels are *private*: the RLS policies in `supabase/schema.sql` admit only connections carrying our JWT — the anon key alone cannot
  read or write. `interior:<buildingId>:<n>` (max 40/instance) follows in Phase 3.
- **Movement:** the client broadcasts its camera-focus position ~5×/s (`move` on its own cell channel); others interpolate, rendering
  ~150 ms behind. v1 is cosmetic: no server-side speed clamp yet — the clamp lands with chat. Incoming payloads are validated
  (username regex, clamped coordinates) but movement is never trusted beyond cosmetics.
- **Avatars:** presence carries `{username,x,z}` (re-announced at most every 2 s / 4 m so late joiners can place a standing player);
  clients fetch looks from `GET /players/{username}/avatar` and cache by `avatar_hash`.
- **Reconnect:** supabase-js reconnects the socket; the client re-handshakes with a fresh token every 45 min and on the browser `online`
  event, with exponential backoff (capped 60 s) while the API is unreachable.
- **Scale target v1:** 300 concurrent players. Beyond that: shard by region (cells already partition naturally).
- **Chat (Phase 2):** same channels (`say` broadcast) + the API persists to `chat_messages` (the only table the realtime path writes).
  Limits: 40 chat messages/min, 5 messages/s burst 5, 500 chars. Disconnect on abuse. Full message protocol in `API.md` §10.

## 7. NPCs without network cost
NPCs are simulated on every client from the same inputs (NPC id + Lagos time + world data), so everyone sees the same NPCs in the same
places and **no NPC traffic is sent**. Details in `GAME_DESIGN.md` §2. Only NPC *interactions* that matter for commerce (e.g. "order from the
waiter") go to PHP.

## 8. Performance budgets (requirements)
| Item | Budget |
|---|---|
| First paint of map after login | < 4 s on a mid-range phone on 4G (map file is cached; snapshot is gzip + ETag) |
| Draw calls near a compound | ≤ 120; total triangles ≤ 1.2 M |
| Active NPCs | ≤ 40 outdoors in view, ≤ 25 in an interior; zero when camera is far |
| Remote players rendered | ≤ 60 full avatars, extra shown as simple low-poly or just labels |
| Interiors in memory | 1 (dispose geometry/materials/textures on exit) |
| Avatar | one shared skeleton/body, clothes as merged meshes or texture layers; instanced low-LOD at distance |
| Net | ≤ 10 KB/s down per client typical; positions as 16-bit quantised numbers |
| Frame rate | 30 fps minimum on a mid-range phone, 60 on desktop |
Use a quality setting (low/medium/high) that scales shadows, NPC caps and draw distance; default by device.

## 9. Hosting (Phase 0: Vercel + Supabase; step-by-step in docs/DEPLOY.md)
- **Static + API:** one Vercel project serves `public/` and runs `api/index.js` for every `/api/v1/*` request (rewrites in `vercel.json`).
  Environment variables live in Vercel only — never in JS: `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_ANON_KEY`,
  `SUPABASE_JWT_SECRET`, `SESSION_SECRET`, `GOOGLE_CLIENT_ID`.
- **Database:** Supabase Postgres; schema + RLS + realtime policies in `supabase/schema.sql`. Only the server ever holds the service-role
  key; every app table is RLS-locked with no policies, so the anon key sees nothing.
- **Realtime:** Supabase Realtime channels (§6) — no VPS, pm2 or nginx to run.
- **Backups:** Supabase point-in-time recovery on paid plans; uploaded images (later phases) go to Supabase Storage.
- The client protocol is not Vercel-specific: if we ever leave, a plain Node host serving `public/` + `api/index.js` behind HTTPS and any
  broadcast service with JWT-based auth still works.

## 10. Security checklist
Token-based realtime auth; CSRF on all POST/PUT/DELETE; prepared statements; per-endpoint role checks; upload validation and image
re-encoding; escape all user text; rate limits (login, chat, orders, payments); audit log for admin actions and money movements;
no secrets in client; HTTPS everywhere; privacy: players choose whether their profile and location are visible; minors: no
direct-message access from strangers by default (friends only) until the owner decides otherwise.

## 11. What is intentionally NOT decided yet
Native mobile app, voice chat, drivable cars (cars are owned/parked/shown first), user-generated buildings, multiple campuses. Do not add them.
