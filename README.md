# FUTA World — Vercel + Supabase package

Standalone project: static front end (`public/`, deployed by Vercel, no build) + Supabase (accounts, database, realtime). Start with **`docs/SETUP_VERCEL_SUPABASE.md`** (owner's launch steps) and **`docs/SUPABASE.md`** (how it works). Put `.clinerules` in the project root for Cline.

**Live:** https://futa-life-ten.vercel.app (GitHub: `nigeriaprompt-cloud/FUTA-life`; every push to `main` redeploys automatically. Site runs in demo mode until Supabase keys are set in `public/world/game/onboarding/config.js` — see `docs/SETUP_VERCEL_SUPABASE.md` §B.)

| Path | What |
|---|---|
| `vercel.json`, `package.json` | hosting config (serve `public/`, no build) |
| `supabase/` | `01_schema.sql`, `02_avatar_options.sql`, local tests |
| `public/world/index.html` | the FUTA map (overview; opens after sign-up) |
| `public/world/game/onboarding/` | sign-up + character creator (`config.js` = your Supabase keys; `demo:true` previews with no server) |
| `public/world/game/avatar/` | fast 3D people (players + NPCs); `lab.html` dev page |
| `public/world/game/live/` | live players, chat, waves/DMs, chairs, ATM; `live-demo.html` dev page with fake players |
| `docs/` | roadmap, architecture, game design, safety, payments (older pages carry a banner: PHP → Supabase) |
| `tools/` | options generator, tests |

Preview locally: `cd public && python3 -m http.server 8000` → http://localhost:8000/world/game/onboarding/signup.html (demo mode) and /world/game/live/live-demo.html.
Reference files still to copy into `public/world/assets/reference/`: `students.html`, `campus.html`.
