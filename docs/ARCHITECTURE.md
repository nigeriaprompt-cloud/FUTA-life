# Architecture

> **BACKEND CHANGED:** the project now runs on **Vercel + Supabase** (see `SUPABASE.md`). Where this page says PHP / MySQL / REST route / Node `ws` server, read Postgres table / SQL function (RPC) / Supabase Realtime. The rules and intent below still apply; names of PHP files and routes are historical.


## 1. The big picture

```
 Browser (player)
 ├─ Site pages (existing PHP site: shops, products, profile, login)
 └─ /world  ──►  Map (three.js)  +  Game layer (ES modules)  +  Phone UI (DOM overlay)
        │ HTTPS (REST, JSON)                      │ WSS (realtime)
        ▼                                         ▼
 PHP backend (source of truth)  ◄── signed token ── Realtime server (Node.js + ws)
 users · shops · products · orders                  presence · movement · chat fan-out
 wallet/ledger · payments · world data              (writes ONLY chat tables)
        │
      MySQL (+ file storage for images)
```

**Why a separate realtime server:** normal PHP hosting cannot keep thousands of open WebSocket connections. A small Node.js process
can. It needs a host where you can run a long-lived process (a small VPS, or a Node-capable host). If the current host is shared
hosting only, see §9.

**Ownership rule (important):** PHP owns everything involving money, ownership, accounts, orders, admin and world data. The realtime
server owns only live state (who is where) and chat delivery. The realtime server never changes balances, inventory or orders.

## 2. Repository layout (add to the existing site; adapt names to its conventions)

```
/world/                     page that hosts the map (PHP template)
/public/world/
  map/futa-map.html         the map exactly as delivered (do not reformat)
  game/                     ES modules, one folder per feature
    bridge.js               wraps window.FUTA (events/methods)
    time/                   time of day (suncalc), lighting presets
    net/                    websocket client, interpolation, labels
    players/                avatar builder, wardrobe rendering
    npc/                    npc engine, schedules, uniforms
    interiors/              loader + one file per template (lazy-loaded)
    phone/                  phone shell + one folder per app
    activities/             activity handlers by building type
  assets/reference/         students.html, campus.html (reference only)
/api/v1/                    PHP endpoints (see API.md)
/src/                       PHP classes: Auth, Wallet, Payments, World, Shops, Chat, Items…
/realtime/                  Node server (server.js, rooms.js, auth.js, protocol.md)
/config/
  npc/*.json                NPC roles, uniforms, schedules (data, not code)
  interiors/*.json          per-template settings
  world_seed.json           the original world data (seed for the snapshot)
/migrations/                numbered SQL files, additive only
/docs/                      these documents
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
- A single self-contained file using three.js r128. Buildings are instanced meshes with a custom facade shader; compounds, sites
  (fenced hostels, banks, zoo, farm, pitch, petrol stations, car parks) and NPC-free props are built **lazily** when the camera is near
  and disposed when far. Keep that pattern for everything you add.
- Camera: `S` (current state: x, z, d=distance, yaw, pit), `G` (goal for smooth moves), `place()`. Existing click behaviour:
  faculty buildings fly into their grounds; main buildings (`entry:"interior"`) fly to the door and call `FUTA_INTERIOR.enter(building)`.
- The map already contains its own admin editor (create/edit buildings, roads, areas, props; draft → publish via `flushSoon()`). In Phase 0 find out where it saves today and reroute that save to the `/admin/world/*` endpoints later (Phase 9); until then leave it working as it is.
- Do not edit its internals except to add the bridge (§5). If something must change inside, make the smallest patch and note it in the CHANGELOG.

## 5. The `window.FUTA` bridge (Phase 0)
The only supported way for game code to talk to the map.

Events (`FUTA.on(name, fn)`): `ready`, `buildingClick(building)`, `enterBuilding(building)`, `leaveBuilding`, `groundClick({x,z})`, `frame(dt)`,
`cameraChange`, `worldReloaded`.
Phase 4 adds `FUTA.getSlots(buildingId)` → seat/bench/door/gate positions of a compound or site for NPC placement.
Methods: `FUTA.getBuildings()`, `getBuilding(id)`, `worldToScreen(x,z,y)`, `groundAt(x,z)`, `addToScene(object3d)`, `removeFromScene(o)`,
`setLighting({sunDir, sunColor, ambient, sky, fog, lampsOn})`, `flyTo({x,z,d,yaw,pit})`, `getScene()`, `getCamera()`, `registerInterior(template, loaderFn)`.
Everything the game layer draws goes through `addToScene` and is owned (and disposed) by the game layer.

## 6. Realtime design
- **Auth:** PHP `POST /api/v1/realtime/token` returns a signed token (HMAC, 60 s lifetime: user id, username, avatar hash, roles). The Node server verifies it on connect.
- **Rooms:** `zone:<cellX>:<cellZ>` (outdoor, 100 m cells; a client subscribes to its cell and the 8 neighbours — this is the interest management) and `interior:<buildingId>:<n>` (max 40 players per instance, overflow opens instance n+1).
- **Movement:** client sends its position about 5 times a second (`move`), the server clamps speed and bounds, rebroadcasts to the room, clients interpolate (render ~150 ms behind). Click-to-move is client-side pathing (outdoors: straight line with simple obstacle avoidance against building footprints; indoors: a grid per template). The server validates, never paths.
- **Chat:** message → server validates length/rate/mute → broadcast to room → persisted to `chat_messages` (the only table the Node server writes).
- **Limits:** 40 chat messages/min, 5 messages/s burst 5, 500 chars. Disconnect on abuse.
- **Scale target v1:** 300 concurrent players on one small VPS. Beyond that: shard by region. Protocol is in `/realtime/protocol.md` and `API.md` §10.
- **Reconnect:** exponential backoff; on reconnect, re-auth with a fresh token and re-join rooms.

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

## 9. Hosting notes
- Existing PHP site stays where it is. Run the Node realtime service on a VPS (or any Node host), put it behind HTTPS (`wss://realtime.yoursite.com`) with nginx or Caddy, keep it alive with `pm2` or systemd.
- If only shared PHP hosting is available: a managed realtime service (e.g. Ably or Pusher) can carry chat/presence; **live movement** for many players through such services gets costly, so prefer the VPS.
- Backups: nightly MySQL dump + uploaded images. Keep the Paystack webhook endpoint reachable and logged.

## 10. Security checklist
Token-based realtime auth; CSRF on all POST/PUT/DELETE; prepared statements; per-endpoint role checks; upload validation and image
re-encoding; escape all user text; rate limits (login, chat, orders, payments); audit log for admin actions and money movements;
no secrets in client; HTTPS everywhere; privacy: players choose whether their profile and location are visible; minors: no
direct-message access from strangers by default (friends only) until the owner decides otherwise.

## 11. What is intentionally NOT decided yet
Native mobile app, voice chat, drivable cars (cars are owned/parked/shown first), user-generated buildings, multiple campuses. Do not add them.
