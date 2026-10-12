# FUTA World — documents for Cline

Put `.clinerules` in the project root and the `docs/` folder next to it. Start every Cline task with the prompt template at the bottom of `docs/ROADMAP.md`.

| File | What it is |
|---|---|
| `.clinerules` | rules Cline follows on every task |
| `docs/ROADMAP.md` | phases 0–9, each with a "Done when" test |
| `docs/ARCHITECTURE.md` | how the pieces fit: PHP, realtime server, map, bridge, budgets, security |
| `docs/DATA_MODEL.md` | database tables |
| `docs/API.md` | REST routes and the realtime socket protocol |
| `docs/GAME_DESIGN.md` | time of day, NPCs and uniforms, interiors, avatar, phone, activities |
| `docs/PAYMENTS.md` | Paystack, manual flow, admin switch, contributions |
| `docs/STYLE_AND_SOCIAL.md` | features for women's engagement: style, safety, friends, home, events, virality |
| `docs/SIGNUP_AND_CHARACTER.md` | **new** sign-up (Google/email), character creator, go-live checklist |
| `docs/AVATAR_SPEC.md` | **new** avatar/NPC look format, speed tricks, how to add clothes/hair |
| `docs/LIFE_LAYER.md` | **new** Lagos-life loop: stats, gigs, events |

Code folders in this package: `public/world/game/avatar/` (3D people), `public/world/game/onboarding/` (sign-up + creator), `api/` (PHP endpoints), `tools/` (generators + tests).

Also copy `futa-map-modern.html`, `students.html` and `campus.html` into `public/world/assets/reference/` (the map file is the base of Phase 0).
