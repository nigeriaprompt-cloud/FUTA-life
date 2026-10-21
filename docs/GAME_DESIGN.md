# Game design — rules the code must follow

All values below are defaults to put in `/config/*.json`, not hard-coded, so they can be tuned without code changes.

## 1. Time of day (Nigeria)
- Clock source: `GET /time` once at load (compute the offset from the device clock, refresh every 10 min). Timezone `Africa/Lagos` (UTC+1, no daylight saving). Never use the device's own time zone.
- Sun: `suncalc` for Akure (lat 7.30, lon 5.14). Do not hard-code sunrise/sunset times — they shift through the year.
- Presets, driven by sun events and blended over ~20 minutes (never a hard switch):

| Preset | When | Look |
|---|---|---|
| Dawn | sunrise − 40 min → sunrise + 30 min | cool pink-blue sky, low mist, lamps fading off |
| Morning | sunrise + 30 min → about 11:30 | clear, warm white light, long soft shadows |
| Midday | about 11:30 → golden hour start | bright, short shadows, slightly hazy (harmattan haze Dec–Feb optional) |
| Golden hour ("evening") | sunset − 70 min → sunset | low orange sun, long shadows, warm fog tint |
| Dusk | sunset → sunset + 35 min | orange-purple sky, lamps and window glow turn on gradually |
| Night | sunset + 35 min → dawn start | dark blue sky, moon and stars, lamps lit, lit windows, headlight glow on parked cars is optional |

- Use `FUTA.setLighting(...)` (sun direction/colour, ambient, sky, fog, `lampsOn`). Night must stay readable: ambient never below a floor value in config; labels and name tags get a subtle outline at night.
- Shadows follow the real sun direction in the day and the moon at night (softer, dimmer).
- NPC schedules also use this clock (§2).
- Admin/test only: `?tod=HH:MM` overrides the time.

## 2. NPCs

### 2.1 Roles and what they do
| Role | Where | Behaviour |
|---|---|---|
| **Security** | all 3 gates (2 at the main gate), entrance of every main academic building and major facility (Senate, Library, Great Hall, faculty buildings, Health Centre, SUB, hostels' gates, banks, petrol stations, zoo entrance, stadium) | Stands at post, sometimes checks the gate/door, short slow patrol of 10–15 m, waves at players who come close. Two shifts (06:00–18:00, 18:00–06:00) look identical; at night patrol the main road and use a torch (glow). |
| **Cleaner** | compounds, walkways, car parks; inside buildings (corridors, toilets) | Sweeping or mopping loops, empties bins; mostly 06:00–09:00 and 15:30–18:00; indoors during working hours. |
| **Lecturer** | lecture theatres, classrooms, labs, offices | In a lecture block: teaching (standing at the board, gesturing) in the lecture room of their faculty; between blocks: walking to the next venue or sitting in the office. Never outdoors at night. |
| **Student** (NPC) | compounds, walkways, lecture rooms, library, hostel areas, SUB, market, pitch | Walk in pairs/groups, sit on benches/chairs, queue at shops, read in the library, attend lectures. Many more than any other role. |
| **Staff** (v2) | offices, bank counters, clinic, restaurants | Receptionist, librarian, nurse, cashier, waiter. Waiter/cashier are the interaction point for real orders (§3). |

### 2.2 Uniforms (the player must recognise roles at a glance)
| Role | Uniform |
|---|---|
| Security | dark navy shirt and trousers, black peaked cap, reflective yellow vest at gates, black boots, radio on the shoulder, name tag "SECURITY" |
| Cleaner | sky-blue overall, orange safety vest, cap or headscarf, gloves, broom/mop prop |
| Lecturer | smart: shirt + tie or modest dress/blazer, lanyard; lab coat (white) in labs; marker/book prop |
| Student | white shirt/blouse, school-colour tie or sash (green/gold unless the owner decides otherwise), dark trousers/skirt, ID lanyard, backpack optional |
| Staff | role-specific (nurse scrubs, cashier vest, etc.) |
- **Players cannot wear role uniforms.** Items flagged `restricted` are NPC-only, so real players are never mistaken for NPCs. Default player look is casual.
- Visual starting point for bodies and proportions: `assets/reference/students.html`. Colours live in `/config/npc/uniforms.json`.
- NPC name tags are small, grey, role only ("Security", "Lecturer"), not clickable as players. Player name tags show the **username**, are clickable, and are drawn above NPC tags.

### 2.3 Placement rules
- Every building has `type`, optional `entry` ("interior" = main building, "compound" = faculty building) and optional `npcRoles` override. Defaults come from `/config/npc/roles.json`:
  main building → 2 security at the door, 1 cleaner, 4–8 students around the plaza, lecturers inside;
  faculty building → 1 security, 1 cleaner, 3–6 students in the compound, lecturers inside;
  hostel → 1 security at its gate, students outside in the evening, inside at night;
  bank/petrol/shop → 1 security (banks, petrol), customers (students/staff) queueing; zoo/stadium → 1–2 security, visitors.
- Compounds already contain seat positions (benches, chairs, tables) and spots; expose them through `FUTA.getSlots(buildingId)` (Phase 4 adds this to the bridge). NPCs sit on those slots and walk between them along the compound paths.

### 2.4 Schedules (Lagos time; weekday unless noted)
- Weekday teaching blocks: 08:00–10:00, 10:00–12:00, 12:00–14:00, 14:00–16:00, 16:00–18:00. Students and lecturers move between blocks (10-minute walking window). 12:00–14:00 has the heaviest outdoor/market/food presence.
- Weekends: no lectures; far fewer students outdoors, more at the pitch, market, hostels; security and cleaners unchanged.
- Evening 18:00–21:00: hostels, shops and food areas busy. After 22:00: only security, a few students, cleaners gone.
- Config format (`/config/npc/schedules.json`): list of `{role, daysOfWeek, from:"HH:MM", to:"HH:MM", activity:"teach|attend|sit|walk|sweep|guard|patrol|read|queue", where:"building-type|building-id|slot-kind"}`.

### 2.5 How NPCs are simulated (required approach)
- **Deterministic and client-side.** An NPC's state = `f(npcId, lagosMinuteOfDay, dayIndex, worldData)` using a seeded random generator (seed = hash(npcId + day + block)). All clients compute the same result; no NPC network traffic.
- Only NPCs inside the camera's interest area are created: **max 40 outdoors, max 25 in an interior, 0 when the camera is far**. They are created from a pool, reused, and disposed with their area.
- Rendering: one shared low-poly body, clothes as merged meshes/colour layers, instanced where identical; animations are a few shared clips (idle, walk, sit, talk, sweep, teach). Beyond ~120 m show as simple capsules or hide.
- A player can click an NPC: shows its role and a one-line line of dialogue (data in `/config/npc/lines.json`). Staff NPCs can open an order or info panel (§3).

## 3. Interiors

### 3.1 Loading
- Entering calls `FUTA_INTERIOR.enter(building)`. The loader downloads the template module only on first use, builds the room from `/config/interiors/<template>.json` plus the building's `interiorConfig`, and disposes everything on exit. One interior at a time.
- An interior is its own local space (not literally inside the exterior shell). Entrance spawn = the door; exit returns the player to the outside door position.
- Multiple floors: one floor at a time, switch via a lift/stairs menu. v1: ground floor only plus a "Floors" list for buildings with more.
- Rooms are built procedurally with the same box/part format as the map (merged meshes, shared materials). No external model files in v1.
- Named buildings keep their name: door sign, reception sign, building name on the phone map. The name always comes from the world data.
- Player lighting inside follows the same day/night clock (windows show the sky outside; at night interiors are lit).

### 3.2 Templates (v1 = first four)
| Template | Used by | Contents | NPCs | Player activities |
|---|---|---|---|---|
| `lecture_theatre` ★ | lecture theatres, ETF, SEET/SET/SOC/SLS/SAAT lecture halls | tiered seating, stage, board, projector screen, door at the back | lecturer teaching in blocks; 20–60 seated students; security at the door | sit and attend (timer reward), ask a question (emote) |
| `library` ★ | Albert Ilemobade Library | reception desk, shelves, reading tables, computer desks, quiet zone | librarian, readers | read at a table (study streak), borrow-info panel |
| `admin_office` ★ | Senate Buildings, registry, offices | reception, waiting seats, counter, meeting room, notice boards | receptionist, clerks, security | collect info, "ask the front desk" |
| `hostel` ★ | all hostels | corridor, rooms with doors, common room, reading area | students, cleaner, porter at the door | visit common room; (v2) rooms of owned houses |
| `clinic` | University Health Centre | reception, waiting area, consulting rooms, small ward, pharmacy counter | nurse, doctor, patients | check-in info panel |
| `bank` | Wema, First Bank | counter, queue ropes, ATM lobby, manager's office | cashiers, security, customers | none beyond browsing (no real banking) |
| `shop_restaurant` | shops, restaurants, malls, bookshop | counter, shelves/menu board, tables | owner/cashier/waiter | **browse products, order** (real, via the building link) |
| `worship` | Chapel, Mosques, Church | pews/prayer hall, pulpit/mihrab, choir area | congregation on scheduled services | attend (quiet mode, no chat spam) |
| `great_hall` | Great Hall, Hilltop Auditorium | stage, large seating, lights | event audience | attend events |
| `gym_sports` | Gymnasium | equipment, court | trainers, students | exercise emotes |

★ = Phase 5. Each template exposes: `walkGrid`, `spawnPoints`, `npcSlots` (by role), `interactionPoints`, `lightRig`.

### 3.3 Real businesses
If a building has a **verified** `building_link`, its interior (or exterior sign) shows the live products from the shop and an "Order" button
(`API.md` §6 → WhatsApp). Unlinked shops show generic decorative goods and no order button.

## 4. Avatar, clothes, hair
> **Implemented:** the full builder, options and NPC roles are specified in `docs/AVATAR_SPEC.md` and `docs/SIGNUP_AND_CHARACTER.md`. The bullets below are the original intent.
- One shared base body family (male/female, 5 skin tones, a few body sizes). Slots: `top, bottom, dress, shoes, hair, head (hat/cap/scarf), bag, accessory`. Equipment is stored as `avatar_json` (`DATA_MODEL.md` §1), validated on the server.
- Hair: salon in the world (a building linked to a salon item set, or the phone Wardrobe app). Styles to include from the start: low cut, fade, afro, twists, cornrows, braids, plaits, bun, locs, headwrap. Colours selectable; style price per item.
- Clothes: casual, native/Ankara patterns, sports, formal; cheap to build as colour/pattern layers on the shared body.
- Wardrobe app: try-on preview, buy, equip, save outfits (up to 5).
- Cars and houses are **items too**: owned cars are listed in the player's garage and shown on their public profile (name, model, colour). Cars are displayed parked (profile + an optional parked car at the player's own house); **driving is not in scope yet**. Houses are plots/buildings the admin marks `forSale`; the owner's name appears on a small sign at the house; visitors may see an outside view only (interior of houses is a later phase).

## 5. Phone (DOM overlay; bottom-sheet on mobile)
Apps (added by phase): **Map** (search buildings, "walk me there" = auto-walk with a path line, favourites), **Chat** (building room, DMs, groups), **Friends**, **Profile**, **Shop** (products near me / building's products), **Orders**, **Wallet** (balances, top-up, history), **Wardrobe**, **Garage**, **Contribute** (goals), **Settings** (quality, privacy, sound).
- The phone is always reachable (button), closed by tapping outside, and never covers the 3D view fully on a phone-size screen.
- Chat in a building: the current building/zone room is selected automatically when the player enters or walks into a new zone.

## 6. Player activities by building type (config: `activities` table + code handlers)
| Building type | Activities |
|---|---|
| lecture theatre / classroom | attend lecture (sit, 20 min timer, small reward), raise hand |
| library | read (study streak), quiet mode |
| office / senate | ask front desk, notice board |
| hostel | common room, wardrobe mirror (change clothes) |
| shop / restaurant | browse, order, chat with seller |
| bank | ATM lobby look-around (no money features) |
| clinic | info panel |
| worship | attend a service |
| stadium / pitch | sit in the stand, kick-about emote |
| zoo | animal info panels, photo spot |
| farm | farm info panels |
Rewards are small cosmetic things (badges, a few coins) and are rate-limited per day. No activity may create real-money value.

## 7. Safety and moderation
Username label only (never real names); report/block on every player menu; slow-mode and word-filter hooks in chat; room mute by admin;
no private location sharing; the default for strangers' DMs is off for accounts flagged as under 18 (if the site collects age).
