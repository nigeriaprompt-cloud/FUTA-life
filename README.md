# FUTA World — documents for Cline

Put `.clinerules` in the project root and the `docs/` folder next to it. Start every Cline task with the prompt template at the bottom of `docs/ROADMAP.md`.

| File | What it is |
|---|---|
| `.clinerules` | rules Cline follows on every task |
| `docs/ROADMAP.md` | phases 0–9, each with a "Done when" test |
| `docs/ARCHITECTURE.md` | how the pieces fit: Vercel API + Supabase, realtime, map, bridge, budgets, security |
| `docs/DATA_MODEL.md` | database tables |
| `docs/API.md` | REST routes and the realtime socket protocol |
| `docs/GAME_DESIGN.md` | time of day, NPCs and uniforms, interiors, avatar, phone, activities |
| `docs/PAYMENTS.md` | Paystack, manual flow, admin switch, contributions |
| `docs/STYLE_AND_SOCIAL.md` | features for women's engagement: style, safety, friends, home, events, virality |
| `docs/SIGNUP_AND_CHARACTER.md` | **new** sign-up (Google/email), character creator, go-live checklist |
| `docs/AVATAR_SPEC.md` | **new** avatar/NPC look format, speed tricks, how to add clothes/hair |
| `docs/LIFE_LAYER.md` | **new** Lagos-life loop: stats, gigs, events |
| `docs/DEPLOY.md` | **new** how to run it for real: Supabase + Vercel setup, env vars, local dev, first-run checks |

Code folders in this package: `public/world/game/avatar/` (3D people), `public/world/game/onboarding/` (sign-up + creator), `public/world/game/net/` (window.FUTA bridge + realtime), `api/` + `lib/` (the Node API), `supabase/` (database schema), `tools/` (generators + tests). The old PHP endpoints live in `legacy/php/` for reference only.

The map (`futa-map-modern.html`) lives at `public/world/` and is served at `/world/`; `students.html` and `campus.html` in `public/world/assets/reference/` are reference-only scenes.
