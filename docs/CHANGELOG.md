# Changelog
## Unreleased
- **Switched backend to Vercel + Supabase.** Added `supabase/` (schema, RLS, RPCs, avatar-options seed, SQL tests: 74 checks pass on Postgres 16), `onboarding/api.js` now uses supabase-js (demo mode kept), `live/` (live players, name labels, room chat, waves/DMs, seats, ATM, click-to-walk pathfinding, dev demo with fake backend), `vercel.json`, docs `SUPABASE.md` + `SETUP_VERCEL_SUPABASE.md`. Removed PHP `api/`. Map is now `public/world/index.html` (three.js served locally).
- Added sign-up + character creator prototype (Google/email, username, age gate, 3D studio, story start) — `onboarding/`.
- Added mobile-fast avatar/NPC builder (`avatar/`), options JSON as single source of truth, PHP `AvatarValidator`, onboarding API (`api/`).
- Added docs: SIGNUP_AND_CHARACTER, AVATAR_SPEC, LIFE_LAYER. Roadmap: Phase 0B and 4B added; Phase 8 (contributions) deferred; API/DATA_MODEL/PAYMENTS marked.
