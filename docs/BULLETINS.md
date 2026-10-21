# NEPA and Tutorial apps (bulletins)

Two phone apps where **any signed-in player** can post, on one shared table.

| | NEPA (power updates) | Tutorial (how-to guides) |
|---|---|---|
| File | `public/world/game/phone/apps/nepa.js` | `.../apps/tutorial.js` |
| Style | **Classic**: newspaper notice board, cream paper, navy ink, serif, double rules, stamp labels. Logo: navy seal, milled gold edge, gold bolt | **Modern**: soft cards, gradient hero, coloured category pills, pill controls. Logo: open book + gold spark on a violet→blue tile |
| A post is | status (⚡ ON · 🔌 OFF · ⚠️ Low voltage · 🔧 Maintenance · 📰 News) + place (2–40 chars) + optional note (10–200 chars) | title (5–60) + category + guide (40–1200 chars, line breaks kept) |
| Lives | 12 hours | until the author removes it |
| Limits (per player, per Africa/Lagos day) | 10 posts, ≥ 60 s apart | 3 posts, ≥ 300 s apart |
| Reaction | "✓ I see this too" (crowd confirmation) | "👍 Helpful" |
| Reading | The Board: a "Right now" box (latest status per place, last 3 h) + all reports | Learn: filter by category, sort Newest / Most helpful, tap to read, phone Back closes the guide first |

Shared helper (not an app): `apps/bulletin-core.js` → `window.FutaBulletin` (data access, infinite scroll, demo data, error texts). Listed in `apps/manifest.js` so it loads; it has no icon.

## Setup
Run `supabase/18_bulletins.sql` in the Supabase SQL Editor after 01 and 05 (or paste `ALL_IN_ONE.sql` again). Safe to re-run; run it again after re-running 01 (01 revokes grants).

## Rules (decided only in the database)
- Writes go through `post_nepa`, `post_tutorial`, `vote_bulletin`, `report_bulletin`, `delete_bulletin`; reads through RLS on `bulletins` / `bulletin_votes` (you only ever see your own votes). No coins are paid for posting.
- Signed in **and** sign-up finished. No links, phone numbers or banned words (the same banned list as Feed), no repeated-character spam.
- Duplicates: NEPA same status + place by the same player is refused for 30 min; a live tutorial title cannot be reused.
- Reports: 3 different players hide a post automatically. Each report also lands in `public.reports` (`context = 'bulletin:<id>'`) so the admin sees it with the others. Blocking hides both ways.
- "Remove" by the author hides the post but keeps the row, so removing and re-posting cannot beat the daily limit.
- Change a number without code: `insert into public.app_config(key,value) values ('bulletin.nepa_daily','20') on conflict (key) do update set value = excluded.value;`
  Keys: `bulletin.nepa_daily` (10), `nepa_gap` (60), `nepa_hours` (12), `tut_daily` (3), `tut_gap` (300), `report_hide` (3).
- The status list and the 6 categories (Study, Tech, Money, Campus life, Skills, Health) live in `private.bul_statuses()` / `private.bul_cats()` in the SQL **and** in `bulletin-core.js`. Change both together.
- NEPA place chips (Obanla campus, Postgraduate campus, Off campus) are only shortcuts in `nepa.js`; any place text is accepted.

## Not built yet (ideas)
Admin screen to review reported posts (today: look at `public.reports`, and hide a post with `update public.bulletins set hidden = true where id = …`) · push/notification when power changes · showing NEPA status on the map or in the game's lighting · editing a post · comments.

## Tests
- Browser (demo mode, no Supabase): `node tools/test/bulletins-phone.js /tmp/out` (env `PW_CORE`, `CHROME`). Checks icons, board, confirm, report, posting, removing, filter, sort, reading, Back button.
- SQL (needs a throwaway Postgres): `supabase/tests/run.sh …` now ends with `18_bulletins.sql` + `tests/test_bulletins.sql` (access, validation, limits, duplicates, expiry, blocking, votes, reports auto-hide, remove, cleanup).
- Housekeeping (optional, pg_cron): `select cron.schedule('bulletin-cleanup','17 * * * *','select private.bulletin_cleanup()');`
