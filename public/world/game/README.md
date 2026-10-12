# public/world/game — what is where
- `avatar/` — the 3D people (players + NPCs). Start with `docs/AVATAR_SPEC.md`. Dev page: `avatar/lab.html`.
- `onboarding/` — sign-up + character creator. Open `onboarding/signup.html` (settings: `onboarding/config.js`; flip `demo:true` there to preview the flow with no server).
- `net/` — the world's live layer: `bridge.js` is the `window.FUTA` bridge (docs/ARCHITECTURE.md §5, loaded by the map), `realtime.js` shows other players via Supabase Realtime (needs the API — see `docs/DEPLOY.md`).
- Full preview (API + map + realtime): `vercel dev` then open http://localhost:3000/ — map-only pages still work with `python3 -m http.server` from `public/`.
