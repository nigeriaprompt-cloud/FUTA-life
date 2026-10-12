# Deploying FUTA World (Supabase + Vercel)

The whole app is one Vercel project: static files from `public/` + one Node function (`api/index.js`) in front of a Supabase Postgres
database. Realtime (live players) runs on Supabase Realtime channels — there is no long-lived server process of our own.

```
browser ──► Vercel ──► api/index.js ──► Supabase Postgres   (service-role key, server only)
   │                      │
   └──── /world/ map ─────┴──► Supabase Realtime            (server-signed JWT, zone:<x>:<z> channels)
```

## 1. Create the Supabase project
1. https://supabase.com → New project (free tier is fine to start). Pick a region close to your users.
2. Open **SQL Editor** → paste the entire contents of `supabase/schema.sql` → **Run**. Safe to re-run. It creates:
   - `world_users`, `world_sessions`, `rate_limits` — all RLS-locked with **no policies**, so the public anon key sees nothing;
   - the `rate_limit_hit` SQL function (executable by the service role only);
   - read/write policies on `realtime.messages` for `role = authenticated` (this is what makes zone channels *private*: only
     connections carrying our server-signed JWT can join).
3. From **Project Settings → API** copy four values (keep them handy; the service key never leaves the server):

| Value | Where it goes |
|---|---|
| Project URL (`https://xxxx.supabase.co`) | Vercel env `SUPABASE_URL` |
| `anon` `public` key | Vercel env `SUPABASE_ANON_KEY` |
| `service_role` secret key | Vercel env `SUPABASE_SERVICE_ROLE_KEY` |
| JWT secret | Vercel env `SUPABASE_JWT_SECRET` |

> If your project was created in the newer "publishable/secret key" mode, the legacy `anon`/`service_role`/JWT-secret values are still
> shown under Settings → API (scroll down). The realtime token in `api/index.js` is HS256-signed with that JWT secret.

## 2. Create the Vercel project
1. Push this repo to GitHub (already: `nigeriaprompt-cloud/FUTA-life`), then https://vercel.com → **Add New → Project** → import the repo.
   Framework preset: **Other**. No build command; `vercel.json` already sets `outputDirectory: public` and the rewrites
   (`/api/v1/*` → the one function, `/world/` → the map file).
2. Add the environment variables (Production + Preview):

| Env var | Value |
|---|---|
| `SUPABASE_URL` | project URL |
| `SUPABASE_ANON_KEY` | anon key (public by design — RLS guards the data; the client only receives it via `/realtime/token`) |
| `SUPABASE_SERVICE_ROLE_KEY` | service key — **server only**, never in JS/HTML/git |
| `SUPABASE_JWT_SECRET` | JWT secret — signs realtime tokens |
| `SESSION_SECRET` | any long random string (e.g. `openssl rand -hex 32`) — HMAC for session + CSRF cookies |
| `GOOGLE_CLIENT_ID` | optional; the same Web client ID you put in `onboarding/config.js` |

3. Deploy. First load: `https://<your-domain>/` shows the landing page; `/world/` shows the map; `/api/v1/me` returns `{"ok":true,"user":null}`.

CLI alternative: `npm i -g vercel` → `vercel link` → `vercel env add SUPABASE_URL` (repeat for each var) → `vercel --prod`.

## 3. Run it locally
- **API only (no accounts needed):** `npm test` → `node tools/test/api-node.mjs` runs the real handler against the in-memory DB
  (used whenever `SUPABASE_URL` is unset — nothing is saved).
- **Everything, like production:** `vercel dev` (uses the same rewrites + env; `vercel env pull` fills `.env`).
  `http://localhost:3000/` → landing, `/world/` → map with realtime.
- Plain `python -m http.server` still serves `public/` for map-only checks, but `/world/` and `/api/v1/*` need the rewrites, so
  use `vercel dev` for full flows.

## 4. First-run checks (do them every deploy)
1. Desktop + a 390 px-wide phone viewport: landing → **Create your character** → sign up → username/dob (try an age < 13: must be
   blocked) → character studio → life start → **Enter the world**.
2. Console: no errors, no secrets (search the network tab: no service-role key, no JWT secret anywhere).
3. **Two browsers, two accounts:** both at `/world/`, zoom near each other — each should see the other's avatar move when the other
   drags the map (status pill bottom-left shows “Live — N nearby”).
4. Log out in one browser → its player disappears in the other within a couple of seconds.

## 5. Notes and limits (v1)
- Google sign-in needs `GOOGLE_CLIENT_ID` + `googleClientId` set and the domain in *Authorized JavaScript origins*; it has not been
  tested against real Google yet (`SIGNUP_AND_CHARACTER.md` §3).
- Email verification is still a TODO in `api/index.js`.
- Movement is cosmetic (no server-side speed clamp until chat arrives — `ARCHITECTURE.md` §6).
- Every app table is invisible to the anon key (RLS, no policies). If you add tables later, keep them locked the same way and let the
  server use the service key.
