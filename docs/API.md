# API contract

REST over HTTPS, JSON in/out, under `/api/v1`. Authentication = the session cookie `futa_sid` (HttpOnly, SameSite=Lax; the cookie holds a
server-verified random id — sessions live in the database, so logout really revokes). Every POST/PUT/DELETE needs the CSRF header
`X-CSRF-Token` echoing the readable `futa_csrf` cookie; if your client is missing that cookie, call `GET /me` once first (any GET hands
one out). Use the site's existing router and style; these are the required routes and shapes.

Errors: HTTP status + `{"error":{"code":"insufficient_funds","message":"…"}}`. Success: `{"data":…}`. Lists: `{"data":[…],"next":"cursor|null"}`.
Money fields end in `_kobo` or `_coins`. Timestamps are ISO-8601 UTC. Role needed is in brackets; no bracket = any logged-in user.

## 0. Sign-up and account (built — `api/index.js` + `lib/`; client `onboarding/api.js`)
All responses are JSON `{ok:true,…}` or `{ok:false,error:"message"}` with a proper HTTP status. Cookie session (HttpOnly, SameSite=Lax,
server-side rows in `world_sessions`). CSRF: double submit — every POST must echo the `futa_csrf` cookie in `X-CSRF-Token`
(`api.js` does this automatically; do `GET /me` once if you have no cookie). Auth routes are rate-limited 8/min per IP.
- `POST /auth/register` `{email,password}` → `{needsVerify}`  (password ≥ 8; rate-limited)
- `POST /auth/login` `{email,password}` → `{user}`
- `POST /auth/google` `{credential}` → `{user}`  (server verifies the Google ID token: audience = our client id, issuer, expiry)
- `POST /auth/logout`  (revokes the session row server-side)
- `GET /me` → `{user|null}`; `user = {id,email,username,dob,teen,avatar,life}`
- `GET /username/check?u=name` → `{available,reason}`
- `POST /me/profile` `{username,dob}` → `{user}`  (<13 → 403; <18 sets teen)
- `POST /me/avatar` `{look}` → `{look}` (the **cleaned** look; client must use the returned one)
- `POST /me/life` `{start}` → `{life}`  (id must be in the allowed list)
Test script: `node tools/test/api-node.mjs` (runs the real handler with an in-memory DB; no Vercel/Supabase needed).

## 1. Time and world
- `GET /time` → `{ "now":"2026-10-10T18:12:03+01:00", "tz":"Africa/Lagos", "epoch_ms":… }` (public)
- `GET /world/snapshot?region=futa` → full world JSON, `ETag`, gzip (public). Admins with `?draft=1` get drafts **[world_editor]**.
- Admin world editing (endpoints exist from Phase 9 but are specified now so the data model fits):
  - `GET /admin/world/objects?kind=&state=&q=` **[world_editor]**
  - `POST /admin/world/objects` / `PUT /admin/world/objects/{id}` / `DELETE …` (soft: `state=archived`) **[world_editor]** — body `{kind,type,name,geometry,props}`
  - `POST /admin/world/publish` `{label}` → new `world_versions` row, sets live **[world_editor]**
  - `POST /admin/world/rollback/{versionId}` **[superadmin]**
  - Every call writes `world_audit`.

## 2. Realtime (built — Supabase Realtime, not a custom socket)
- `POST /realtime/token` (signed in) → `{ "token":"<JWT>", "url":"https://<project>.supabase.co", "anonKey":"…", "expires_in":3600 }`
  The JWT is HS256-signed with the project's JWT secret (`role:"authenticated"`, `sub`=user id, `user_metadata:{username,avatar_hash}`).
  503 when realtime env vars are missing. Clients join **private** broadcast+presence channels `zone:<cellX>:<cellZ>` (100 m cells;
  own cell + 8 neighbours) with `Authorization: Bearer <token>`; `move` broadcasts `{u,x,z}` ~5×/s. The `anonKey` is public by design —
  RLS policies on `realtime.messages` (see `supabase/schema.sql`) only admit connections carrying our JWT.

## 3. Players and profiles
- `GET /players/{username}/avatar` (public, **built**) → `{username, look}` — the cleaned look only (404 if none). Used by the world to
  draw remote players; privacy gating arrives with `STYLE_AND_SOCIAL.md` rules (Phase 7).
- `GET /me` → profile, avatar_json, balances, roles, unread counts
- `PUT /me/profile` `{display_name,bio,privacy_flags}`; `PUT /me/avatar` `{avatar_json}` (server validates every slot item is owned and fits its slot)
- `GET /players/{username}` → public profile: avatar, bio, shop, **owned cars and houses**, friend status (respects privacy flags)
- `POST /friends/{username}` request; `POST /friends/{username}/accept`; `DELETE /friends/{username}`
- `POST /blocks/{username}`; `POST /reports` `{target_type,target_id,reason}`

## 4. Chat (history; live delivery is over the realtime socket)
- `GET /chat/rooms` → my rooms; `GET /chat/rooms/{id}/messages?before=` (paged)
- `POST /chat/dm/{username}` → get-or-create DM room
- `POST /groups` `{name}`; `POST /groups/{id}/members` `{username}`; `DELETE /groups/{id}/members/{username}`

## 5. Buildings and businesses
- `GET /buildings/{id}` → name, type, link (shop, hours, status), interior template, activities available
- `GET /buildings/{id}/products?cursor=` (only if link is `verified`)
- `PUT /admin/building-links/{buildingId}` `{shop_id,owner_user_id,kind,whatsapp,hours_json,status}` **[shop_moderator]**
- `GET /admin/building-links?status=pending` **[shop_moderator]**

## 6. Shops, products, orders
- `POST /shops`, `PUT /shops/{id}`, `POST /shops/{id}/products`, `PUT /products/{id}`, `POST /products/{id}/images` (multipart; type/size validated, re-encoded)
- `POST /orders` `{shop_id,building_id?,items:[{product_id,qty}],note}` → `{order:{code,total_kobo}, "whatsapp_url":"https://wa.me/234…?text=…"}`
  Price comes from the DB, never from the request. The WhatsApp text contains order code, items, total, buyer username.
- `GET /orders?as=buyer|seller`, `GET /orders/{code}`, `PUT /orders/{code}/status` (seller or admin; allowed transitions only)

## 7. Virtual store and inventory
- `GET /store/items?kind=&slot=&cursor=` (public); `GET /me/inventory`; `GET /me/garage`
- `POST /store/purchase` `{item_id}` → debits coins in one DB transaction, adds to inventory; `insufficient_funds` / `already_owned`
- `GET /properties?for_sale=1`; `POST /properties/{id}/purchase`
- Admin items: `POST/PUT /admin/items` **[superadmin]**; marking a property for sale **[world_editor]**

## 8. Wallet and payments (see PAYMENTS.md)
- `GET /wallet` → balances + recent ledger
- `POST /payments/initiate` `{purpose,purpose_ref,amount_kobo}` → depending on `settings.payment_mode`:
  `{provider:"paystack", authorization_url, reference}` or `{provider:"manual", reference, bank_details, instructions}`
  (if mode is `both`, the request must include `provider`)
- `POST /payments/{reference}/proof` (manual) multipart image + note → status `pending_review`
- `POST /webhooks/paystack` — **no session**; verifies `x-paystack-signature` (HMAC-SHA512 of raw body with the secret key); idempotent by `reference`
- `GET /payments/verify/{reference}` — server asks Paystack, then settles (used on return from checkout, as a fallback)
- `GET /admin/payments?status=pending_review` **[finance]**; `POST /admin/payments/{reference}/approve|reject` **[finance]**
- `GET/PUT /admin/settings/payment_mode` **[superadmin]**

## 9. Contributions — **DEFERRED (not in the current build)**
- `POST /crowdfunds` `{target_type,target_id,title,goal_kobo,deadline}`; `GET /crowdfunds/{id}` (public if shared link); `POST /crowdfunds/{id}/contribute` `{amount_kobo}` → payment initiate flow
- `POST /crowdfunds/{id}/cancel` (creator, only before any contribution is confirmed, or admin)

## 9b. Style & Social
- `POST /waves/{username}`; `GET /waves/mine` (sent and matched); `GET /message-requests`, `POST /message-requests/{id}/accept|ignore`
- `GET/PUT /me/privacy` (the fields in `DATA_MODEL.md` §11) — server enforces them on every read of another player's data
- `POST /style/posts` (image upload + outfit), `GET /style/feed?cursor=&filter=`, `POST /style/posts/{id}/like`, `POST /style/posts/{id}/comments`
- `GET /style/best-dressed` (weekly winners), `POST /outfits/save` `{slot,outfit}`
- `POST /squads`, `POST /squads/{id}/invite`, `GET /squads/{id}`; `POST /events`, `GET /events?from=`, `POST /events/{id}/rsvp`
- `POST /referrals/code` (my code), `POST /referrals/redeem` `{code}` at sign-up; reward granted when the invited player reaches day 1 active (anti-abuse: one reward per device)
- `POST /gifts` `{to_username,item_id}` (blocked if recipient privacy disallows)
- Admin/moderator: `GET /admin/reports?status=open` **[support]**, `POST /admin/moderation` `{target_user,action,reason,duration_s}` **[support]**

## 10. Realtime socket protocol (Node server, JSON messages, `{"t":"type", …}`)
Client → server:
- `hello {token}` → server replies `welcome {id, username, room}`
- `move {x,z,y?,r,anim}` (≈5/s) · `enter {room}` / `leave` (building rooms) · `say {room,text}` · `emote {key}`
- `dm {to_username,text}` · `typing {room}`
Server → client:
- `snapshot {players:[…]}` on join; `join {id,username,avatar_hash,x,z}`; `leave {id}`; `pos {id,x,z,r,anim}` (batched ~5/s, 16-bit quantised)
- `msg {room,from,text,ts}`; `dm {from,text,ts}`; `system {text}`; `kick {reason}`
Avatars: the socket sends only `avatar_hash`; clients fetch the look from `GET /players/{username}/avatar` and cache it.
Server enforces: max speed (e.g. 7 m/s outdoors, 4 m/s indoors), world bounds, message length/rate, mutes, block lists.
