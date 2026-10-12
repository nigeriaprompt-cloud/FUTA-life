# Data model (MySQL 8 / MariaDB 10.4+, InnoDB, utf8mb4)

**First, inspect the existing database.** The site already has users, shops, products and orders in some form. Map every table below to an
existing one where possible (add columns instead of new tables). Migrations are numbered SQL files in `/migrations`, additive only, with
a rollback note. Names below are the target; adapt prefixes to the site.

Conventions: `id BIGINT UNSIGNED AUTO_INCREMENT`, `created_at/updated_at TIMESTAMP`, money in `BIGINT` (**kobo** for NGN, whole numbers for COIN),
soft-delete with `deleted_at` where users could lose data. Foreign keys with `ON DELETE` chosen deliberately (never cascade money tables).

## 1. Accounts and profiles
**Phase 0 tables (as deployed — `supabase/schema.sql`):** `world_users(id, email, password_hash NULL, google_sub NULL, username, dob, is_teen, avatar_json, life_start, created_at)`, plus `world_sessions` (server-side sessions) and `rate_limits` (per-IP counters via the `rate_limit_hit` SQL function). All three are RLS-locked (no policies = service-role only).
Mapping rule for later phases: when the old site's `users` table is merged in, do NOT add a parallel login. Add `world_players(user_id PK → users.id, username UNIQUE, dob, is_teen, avatar_json, avatar_hash, life_start, cash, energy, mood, …)` and `auth_identities(id, user_id, provider['password'|'google'], provider_user_id, UNIQUE(provider,provider_user_id))`, and point `api/index.js` at them.
`avatar_json` = the cleaned look, schema v1 (`docs/AVATAR_SPEC.md` §1). The realtime JWT carries `avatar_hash = sha1(avatar_json).slice(0,16)` so clients cache built geometry.

- `users` — existing. Needs a unique `username` (3–20 chars, letters/digits/underscore). If missing, add it with a one-time "choose your username" step.
- `player_profiles(user_id PK, display_name, bio, avatar_json, last_zone, last_x, last_z, privacy_flags, created_at)`
  `avatar_json` example: `{"body":"m2","skin":3,"hair":{"style":"plaits_03","color":"#1b1b1b"},"slots":{"top":"item_81","bottom":"item_12","shoes":"item_40","bag":"item_77","head":null}}`
- `friendships(user_id, friend_id, status[pending|accepted|blocked], created_at)`
- `blocks(user_id, blocked_id)`; `reports(id, reporter_id, target_type, target_id, reason, status, handled_by)`
- `admin_roles(user_id, role[superadmin|world_editor|shop_moderator|support|finance])`

## 2. World data and admin (structure now, UI in Phase 9)
```sql
CREATE TABLE world_objects (
  id VARCHAR(64) PRIMARY KEY,                 -- keep the map's ids, e.g. building_mv0q4b8317
  region_id VARCHAR(32) NOT NULL,
  kind ENUM('building','road','area','prop') NOT NULL,
  type VARCHAR(32) NOT NULL,                  -- institution, hostel, shop, main, campus, tree_mango, gate…
  name VARCHAR(160) NULL,                     -- real-world name; never auto-generated
  geometry JSON NOT NULL,                     -- footprint / points / boundary / pos
  props JSON NOT NULL,                        -- everything else the map understands
  state ENUM('draft','published','archived') NOT NULL DEFAULT 'draft',
  version INT NOT NULL DEFAULT 1,
  updated_by BIGINT UNSIGNED NULL, updated_at TIMESTAMP,
  KEY (region_id, kind, state)
);
CREATE TABLE world_versions (      -- one row per publish: immutable snapshot for fast serving + rollback
  id INT AUTO_INCREMENT PRIMARY KEY, label VARCHAR(120), snapshot_json LONGTEXT NOT NULL,
  etag CHAR(40) NOT NULL, published_by BIGINT UNSIGNED, published_at TIMESTAMP, is_live TINYINT(1) DEFAULT 0
);
CREATE TABLE world_audit (id BIGINT AUTO_INCREMENT PRIMARY KEY, user_id BIGINT UNSIGNED, action VARCHAR(40), object_id VARCHAR(64),
  before_json JSON NULL, after_json JSON NULL, created_at TIMESTAMP);
```
Permissions: `world_editor` and `superadmin` may create/edit/publish/rollback. Everyone else read-only. Every write is audited.
Players only ever download the live snapshot (cached, ETag).

## 3. Building ↔ real business
```sql
CREATE TABLE building_links (
  building_id VARCHAR(64) PRIMARY KEY,        -- world_objects.id
  shop_id BIGINT UNSIGNED NULL,               -- existing shops table
  owner_user_id BIGINT UNSIGNED NULL,
  kind ENUM('shop','restaurant','service','bank','hostel','other') NOT NULL,
  whatsapp VARCHAR(20) NULL,                  -- E.164 digits only, e.g. 2348012345678
  hours_json JSON NULL, status ENUM('pending','verified','suspended') NOT NULL DEFAULT 'pending',
  verified_by BIGINT UNSIGNED NULL, verified_at TIMESTAMP NULL
);
```
Only `verified` links show ordering UI to players. Admin creates/changes links (role: `shop_moderator` or higher).

## 4. Shops, products, orders (reuse existing tables; these are the required fields)
- `shops(id, owner_user_id, name, slug, description, logo_url, whatsapp, status)`
- `products(id, shop_id, title, description, price_kobo, currency='NGN', stock NULL, status, category)`; `product_images(product_id, url, sort)`
- `orders(id, code UNIQUE, buyer_id, shop_id, total_kobo, status[pending|contacted|paid|fulfilled|cancelled|refunded], channel[whatsapp|site], building_id NULL, note, created_at)`
- `order_items(order_id, product_id, title_snapshot, price_kobo_snapshot, qty)`
Snapshots because prices change. `code` is short and human (e.g. `FW-8K2Q`), included in the WhatsApp message.

## 5. Virtual items, inventory, properties
- `items(id, kind[top|bottom|dress|shoes|hair|bag|accessory|car|house], slot, name, description, price_coins, asset_key, rarity, active, sort)`
  `asset_key` points at a model/texture key understood by the client (`outfit_ankara_01`, `hair_plaits_03`, `car_sedan_blue`).
- `inventory(user_id, item_id, acquired_at, source[purchase|gift|reward], PRIMARY KEY(user_id,item_id))`
- `properties(id, world_object_id, plot_name, price_coins, owner_user_id NULL, bought_at NULL)` — houses/plots the admin marks for sale; one owner each.
- `garage(user_id, item_id, nickname, color_override NULL)` — owned cars (display on profile; later drivable).

## 6. Money
```sql
CREATE TABLE wallet_ledger (        -- append-only; never UPDATE or DELETE rows
  id BIGINT AUTO_INCREMENT PRIMARY KEY, user_id BIGINT UNSIGNED NOT NULL,
  currency ENUM('COIN','NGN') NOT NULL, amount BIGINT NOT NULL,           -- signed
  type VARCHAR(32) NOT NULL,                                              -- topup, purchase, refund, contribution, payout, adjustment
  ref_type VARCHAR(32), ref_id VARCHAR(64), balance_after BIGINT NOT NULL,
  created_at TIMESTAMP, KEY (user_id, currency, id)
);
CREATE TABLE payments (
  id BIGINT AUTO_INCREMENT PRIMARY KEY, reference VARCHAR(64) UNIQUE NOT NULL,
  user_id BIGINT UNSIGNED NOT NULL, purpose ENUM('coin_topup','order','contribution') NOT NULL, purpose_ref VARCHAR(64),
  amount_kobo BIGINT NOT NULL, provider ENUM('paystack','manual') NOT NULL,
  status ENUM('initiated','pending_review','succeeded','failed','refunded','expired') NOT NULL,
  provider_payload JSON NULL, proof_url VARCHAR(255) NULL, reviewed_by BIGINT UNSIGNED NULL, reviewed_at TIMESTAMP NULL,
  created_at TIMESTAMP, updated_at TIMESTAMP
);
CREATE TABLE settings (`key` VARCHAR(64) PRIMARY KEY, value JSON NOT NULL, updated_by BIGINT UNSIGNED, updated_at TIMESTAMP);
-- settings keys: payment_mode ("paystack"|"manual"|"both"), coin_rate_kobo_per_coin, manual_bank_details, crowdfund_enabled, fees…
```
Balance = latest `balance_after`; computed inside a transaction with `SELECT … FOR UPDATE` on the user's last ledger row (or a `wallet_balances` table kept in sync inside the same transaction).

## 7. Contributions (crowdfunding) — **DEFERRED, do not create these tables yet**
- `crowdfunds(id, creator_id, target_type[product|item], target_id, title, note, goal_kobo, raised_kobo, deadline, status[open|funded|completed|expired|cancelled], created_at)`
- `contributions(id, crowdfund_id, user_id, payment_id, amount_kobo, status[pending|confirmed|refunded], created_at)`

## 8. Chat and social
- `chat_rooms(id, type[building|zone|dm|group|global], ref VARCHAR(64), created_at)`; `chat_members(room_id, user_id, role, muted_until)`
- `chat_messages(id, room_id, user_id, body VARCHAR(500), created_at, deleted_at, KEY(room_id,id))` — written by the realtime server; retained N days (setting).
- `groups(id, name, owner_id, avatar, privacy)` ↔ a `chat_rooms` row of type `group`.

## 9. Activities
- `activities(key, building_type, label, description, cooldown_s, reward_json)` (e.g. `attend_lecture`, `read_in_library`) — seed rows only; behaviour in code.
- `activity_log(user_id, activity_key, building_id, started_at, completed_at)`

## 11. Style & Social (Phase 3 and 7B)
- `waves(from_user, to_user, created_at, PRIMARY KEY(from_user,to_user))` — a chat room opens when both rows exist (or friends/squad).
- `message_requests(id, from_user, to_user, first_message, status[pending|accepted|ignored], created_at)`
- `privacy_settings(user_id PK, dm_from[friends|mutual_wave|anyone_over_18], show_online, show_location_to[none|friends], profile_visibility[public|friends], bubble_radius_m, gifts_from[friends|anyone], filter_level)`
- `moderation_actions(id, target_user, action[mute|suspend|ban], reason, duration_s, by_user, created_at)`; reports gain `context_json` (last 20 messages).
- `style_posts(id, user_id, image_url, caption, outfit_json, created_at, status)`, `post_likes(post_id,user_id)`, `post_comments(id,post_id,user_id,body,created_at)`, `saved_outfits(user_id, slot, outfit_json)`
- `squads(id, name, badge, owner_id, hangout_property_id NULL)`, `squad_members(squad_id,user_id,role)`
- `events(id, host_id, squad_id NULL, type, title, building_id, starts_at, capacity, aso_ebi_item_id NULL, status)`, `event_rsvps(event_id,user_id)`
- `referrals(code, inviter_id, joined_user_id NULL, joined_at NULL, day7_active TINYINT, reward_granted TINYINT)`
- `gifts(id, from_user, to_user, item_id, created_at)` (items only; never coins)
- `quests(key, label, rule_json, reward_json)`, `quest_progress(user_id, quest_key, progress, completed_at)`
- `user_dob` stored as date in `player_profiles` (for the age rules); never shown publicly.

## 10. Config in files, not DB (design-time data)
`/config/npc/roles.json`, `/config/npc/schedules.json`, `/config/npc/uniforms.json`, `/config/interiors/<template>.json`. Admin-editable later;
until then they are versioned in git.
