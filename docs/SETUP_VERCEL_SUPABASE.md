# Launch guide — Vercel + Supabase (for the owner, no coding)

You need: a GitHub account, a Supabase account, a Vercel account, and (for "Continue with Google") a Google account for Google Cloud. Total time: about 45 minutes.

## A. Supabase (database, accounts, live features)
1. supabase.com → **New project**. Name `futa-world`, pick a strong database password (save it), **region: the nearest to Nigeria** (Frankfurt, London or Paris — there is no Africa region). Wait for it to finish.
2. Left menu → **SQL Editor** → **New query**. Open `supabase/01_schema.sql` from this folder, copy everything, paste, **Run**. It should say *Success*.
3. New query again → paste `supabase/02_avatar_options.sql` → **Run**.
4. **Project Settings → API**: copy the **Project URL** and the **anon / publishable** key. (Never copy the `service_role` / secret key anywhere in this project.)
5. **Authentication → Providers → Email**: keep it ON. Keep **Confirm email** ON (stops fake accounts).
6. **Authentication → URL Configuration**: set **Site URL** to your Vercel address (step C; you can come back and fill this). Add the same address, and `http://localhost:8000`, under **Redirect URLs**.
7. **Google login** — the exact clicks (15 minutes; a Google account is required):
   1. [console.cloud.google.com](https://console.cloud.google.com) → **New project** (name it `futa-world`, e.g.) → **Select project**.
   2. **APIs & Services → OAuth consent screen**: User type **External** → fill *App name* + your email → **Save and continue** through Scopes (keep the defaults: email, profile, openid) and Test users. On the last page press **Back to dashboard**. While the consent screen says **Testing**, only the Google accounts you add under **Test users** may sign in — that is enough for you to test. Before opening to the public, press **Publish app**.
   3. **APIs & Services → Credentials → Create credentials → OAuth client ID**:
      - *Application type*: **Web application**
      - *Authorized JavaScript origins*: `https://futalife.vercel.app` (plus `http://localhost:8000` if you also test locally)
      - *Authorized redirect URIs*: `https://bkebwdpfvafidhazhsan.supabase.co/auth/v1/callback` — this exact value is shown on the Supabase Google provider page as **Callback URL**; never invent one.
      - **Create** → copy the **Client ID** and **Client Secret** (the Secret is shown only once — if you lose it, create a new secret).
   4. Supabase → **Authentication → Providers → Google**: turn the provider **ON**, paste the Client ID into **Client IDs** and the Client Secret into **Client Secret (for OAuth)**, leave *Skip nonce checks* and *Allow users without an email* **off**, **Save**.
   5. Supabase → **Authentication → URL Configuration**: **Site URL** = `https://futalife.vercel.app/`; under **Redirect URLs** add `https://futalife.vercel.app/**` (and `http://localhost:8000/**` for local testing). Google sign-in bounces back through this list — if it is missing, the login fails after Google with a redirect error.
   6. Test with a real Google account that is listed under *Test users*: sign out, then **Continue with Google** on the site. If Google says "access blocked", the account is not on the test-user list (or the app was never published). **It has not been tested against real Google until you do this.**
8. **Realtime**: nothing to switch on; the SQL already does it. (Authentication → *Realtime settings* → leave "Allow public access" OFF; players must be signed in.)

## B. Put your keys into the project
Open `public/world/game/onboarding/config.js` and change three lines:
```js
demo: false,
supabaseUrl: 'https://xxxx.supabase.co',
supabaseAnonKey: 'eyJ…your anon key…',
```
The anon key is *meant* to be public; the database rules (RLS) are what protect your data.

## C. Vercel (hosting)
> **Already done for this repo (2026-10-13):** the project lives at `github.com/nigeriaprompt-cloud/FUTA-life` (old files preserved on the `backup-old-files` branch) and the Vercel project **https://futalife.vercel.app** is connected to it — every push to `main` redeploys automatically. The steps below explain how it was set up and what to do for a new environment.

1. Put this folder in a new **GitHub** repository (private is fine).
2. vercel.com → **Add New → Project** → import the repo → **Framework: Other** → leave build settings empty (`vercel.json` already says *no build, serve the `public` folder*) → **Deploy**.
3. Open the address Vercel gives you. You should land on the sign-up page. Go back to Supabase step 6 and put this address in.
4. Later: **Settings → Domains** to add your own domain.

**Important about the free Vercel plan:** Vercel's own docs say the free *Hobby* plan is for **non-commercial, personal use only**. Use it for building and testing with friends. Before you take real money (Paystack, shop orders, ads) move to **Vercel Pro (about $20 per month)** — or host the same static folder on Cloudflare Pages or Netlify. Nothing in the code changes.

## D. First test (do this before inviting anyone)
1. Open your site on your phone → *Create my character* → sign up with email → confirm the email → pick username + birthday → design the character → pick a story → *Enter*.
2. In Supabase **Table Editor**: `profiles` has your username and look; `wallets` shows bank 6,000–15,000 and pocket 500.
3. Sign up a second account on another phone/browser. Check that you can see each other once the live world is wired in (see `docs/SUPABASE.md` → "What is wired and what is not yet").

## E. Costs and limits you should know
| | Free | Paid |
|---|---|---|
| Supabase | 50,000 monthly users, 500 MB database, **200 live connections at once, 100 live messages/second**, project **pauses after 1 week with no activity** | Pro $25/month: 500 connections, 500 msgs/s, never pauses |
| Vercel | non-commercial only; 100 GB traffic/month | Pro $20/month |

Rule of thumb: the free Supabase plan is fine for testing and a small soft launch (roughly 15–25 people moving in the same area). **Upgrade to Supabase Pro before you announce publicly**, otherwise the project can pause and live movement will stutter at peak time. These numbers come from the providers' pages at the time of writing — check them again before launch.

## F. Keep the free database small (optional, 2 minutes)
Supabase → **Database → Extensions** → enable `pg_cron`, then in the SQL editor run:
```sql
select cron.schedule('futa-cleanup', '*/30 * * * *', $$select private.cleanup()$$);
```
This deletes chat older than 2 days and expired seat claims.

## G. Moving to QServers later
The front end is plain static files, so QServers can host the same `public/` folder (upload to `public_html`). Keep Supabase for accounts, live movement, chat and the database; QServers is not able to run live connections. Only add QServers if you want your own domain/email there or to host PHP pages for the social-commerce site.
