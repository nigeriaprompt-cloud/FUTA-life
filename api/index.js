/* ==========================================================================
   FUTA World API (v1) — ONE Vercel serverless function for every route.
   Contract = docs/API.md; browser client = public/world/game/onboarding/api.js.
   Mirrors legacy/php/v1/index.php route-for-route (same paths, same JSON,
   same error strings) so the onboarding flow works unchanged.

   Routing: vercel.json rewrites /api/v1/* → /api/index?path=* ; this file
   recovers the route from either form (see routePath below).

   Local test:  node tools/test/api-node.mjs   (in-memory DB, no Supabase needed)
   Deploy:      see docs/DEPLOY.md
   ========================================================================== */
'use strict';

const crypto = require('crypto');
const cfg = require('../lib/config.js');
const http = require('../lib/http.js');
const db = require('../lib/db.js');
const session = require('../lib/session.js');
const password = require('../lib/password.js');
const google = require('../lib/google.js');
const normalizeLib = require('../lib/normalize.js');

/* fail() sends the error and throws this so the route stops like PHP's `never`. */
class HttpDone extends Error {}

function parseUrl(req) {
  const u = req.url || '/';
  const qi = u.indexOf('?');
  const pathname = qi >= 0 ? u.slice(0, qi) : u;
  const query = {};
  if (qi >= 0) {
    for (const kv of u.slice(qi + 1).split('&')) {
      if (!kv) continue;
      const eq = kv.indexOf('=');
      const k = decodeURIComponent((eq >= 0 ? kv.slice(0, eq) : kv).replace(/\+/g, ' '));
      const v = decodeURIComponent((eq >= 0 ? kv.slice(eq + 1) : '').replace(/\+/g, ' '));
      if (k) query[k] = v;
    }
  }
  if (req.query && typeof req.query === 'object') Object.assign(query, req.query); // Vercel's parse wins
  return { pathname, query };
}

/* Recover the /api/v1 route whether the platform passed the original URL
   through or rewrote it to /api/index?path=... */
function routePath(pathname, query) {
  let p;
  if (pathname === '/api/v1' || pathname.indexOf('/api/v1/') === 0) p = pathname.slice('/api/v1'.length);
  else if (query.path != null) p = '/' + query.path;
  else if (pathname === '/api/index' || pathname === '/index') p = '';
  else p = pathname;
  p = '/' + String(p || '').replace(/^\/+/, '');
  if (p.length > 1) p = p.replace(/\/+$/, '');
  return p;
}

/* Age from a strict YYYY-MM-DD date, or null when the date is not a real date.
   Mirrors PHP DateTime::createFromFormat('Y-m-d') + strict re-format + diff. */
function ageFromDob(dob) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(dob));
  if (!m) return null;
  const y = +m[1], mo = +m[2], d = +m[3];
  const dt = new Date(Date.UTC(y, mo - 1, d));
  if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== mo - 1 || dt.getUTCDate() !== d) return null;
  const now = new Date();
  let age = now.getFullYear() - y;
  const hadBirthday = now.getMonth() + 1 > mo || (now.getMonth() + 1 === mo && now.getDate() >= d);
  if (!hadBirthday) age--;
  return age;
}

/* Approximation of PHP FILTER_VALIDATE_EMAIL (Node has no builtin). */
const EMAIL_RE = /^[A-Za-z0-9._%+\-]+@[A-Za-z0-9.\-]+\.[A-Za-z]{2,}$/;
const USERNAME_RE = /^[a-z0-9_]{3,20}$/;

const b64u = (buf) => buf.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const b64uJson = (o) => b64u(Buffer.from(JSON.stringify(o)));

/* Server-signed Supabase JWT for Realtime (role authenticated; verified with
   SUPABASE_JWT_SECRET — the same secret Supabase signs its own tokens with). */
function realtimeJwt(user) {
  const now = Math.floor(Date.now() / 1000);
  const header = { alg: 'HS256', typ: 'JWT' };
  const payload = {
    role: 'authenticated',
    aud: 'authenticated',
    iss: 'supabase',
    sub: String(user.id),
    iat: now,
    exp: now + cfg.realtimeTokenTtl,
    user_metadata: {
      uid: user.id,
      username: user.username || null,
      avatar_hash: user.avatar_json
        ? crypto.createHash('sha1').update(user.avatar_json).digest('hex').slice(0, 16)
        : null,
    },
  };
  const data = b64uJson(header) + '.' + b64uJson(payload);
  const sig = crypto.createHmac('sha256', cfg.supabaseJwtSecret).update(data).digest('base64url');
  return data + '.' + sig;
}


module.exports = async function handler(req, res) {
  const setCookies = [];   // Set-Cookie lines gathered for this request
  let jar = {};            // cookies parsed from the request

  const out = (obj, code) => {
    code = code || 200;
    if (!jar[cfg.csrfCookie]) setCookies.push(session.csrfCookieLine(session.newCsrf())); // hand a CSRF token to everyone
    http.send(res, code, obj, setCookies);
  };
  const fail = (msg, code) => {
    out({ error: msg }, code || 400);
    throw new HttpDone(msg);
  };

  try {
    const method = (req.method || 'GET').toUpperCase();
    jar = http.parseCookies(req.headers.cookie || '');
    const { pathname, query } = parseUrl(req);
    const path = routePath(pathname, query);
    const ip = http.clientIp(req);

    let body = {};
    if (method === 'POST' || method === 'PUT' || method === 'PATCH') {
      /* CSRF — double submit: the futa_csrf cookie must come back in X-CSRF-Token.
         (api.js fetches /me first when the cookie is missing.) */
      const given = req.headers[cfg.csrfHeader];
      if (!jar[cfg.csrfCookie] || !given || !http.sameString(jar[cfg.csrfCookie], String(given))) {
        fail('Session expired. Refresh the page and try again.', 403);
      }
      try {
        body = await http.readBody(req);
      } catch (e) {
        e.status = 400;
        throw e;
      }
    }

    /* ---- helpers (per-request closures: no state shared between requests) ---- */
    let meCache, meLoaded = false;
    const me = async () => {
      if (!meLoaded) { meLoaded = true; meCache = await session.userOf(jar[cfg.sessionCookie]); }
      return meCache;
    };
    const needMe = async () => {
      const u = await me();
      if (!u) fail('Please sign in again.', 401);
      return u;
    };
    const rateLimit = async (key, max, secs) => {
      if (!(await db.rateLimit(key, max, secs))) fail('Too many tries. Please wait a minute.', 429);
    };
    const startSession = async (userId) => {
      setCookies.push(session.sessionCookieLine(await session.create(userId)));
    };

    function publicUser(u) {
      if (!u) return null;
      let avatar = null;
      try { avatar = u.avatar_json ? JSON.parse(u.avatar_json) : null; } catch (e) { avatar = null; }
      return { id: Number(u.id), email: u.email, username: u.username, dob: u.dob, teen: !!u.is_teen, avatar, life: u.life_start };
    }

    /* ---- dynamic route: GET /players/{username}/avatar (public, look only) ---- */
    const pm = method === 'GET' ? /^\/players\/([a-z0-9_]{3,20})\/avatar$/.exec(path) : null;
    if (pm) {
      const u = await db.getUserByUsername(pm[1]);
      let look = null;
      if (u && u.avatar_json) { try { look = JSON.parse(u.avatar_json); } catch (e) { look = null; } }
      if (!look) fail('Not found.', 404);
      return out({ username: u.username, look });
    }

    /* ---- the routes (same switch as legacy/php/v1/index.php) ---- */
    switch (method + ' ' + path) {
      case 'POST /auth/register': {
        await rateLimit('auth:' + ip, 8, 60);
        const email = String(body.email || '').trim().toLowerCase();
        const pw = String(body.password || '');
        if (!EMAIL_RE.test(email)) fail('Enter a valid email address.');
        if (pw.length < 8) fail('Password needs at least 8 characters.');
        if (await db.getUserByEmail(email)) fail('That email already has an account. Try signing in.', 409);
        const hash = await password.hash(pw);
        let u;
        try {
          u = await db.insertUser({ email, password_hash: hash });
        } catch (e) {
          if (e && e.code === '23505') fail('That email already has an account. Try signing in.', 409);
          throw e;
        }
        await startSession(u.id);
        // TODO(email verification): flip to true + send a 6-digit code once the mailer
        // is ready (docs/SIGNUP_AND_CHARACTER.md → "Before go-live").
        return out({ needsVerify: false });
      }

      case 'POST /auth/login': {
        await rateLimit('auth:' + ip, 8, 60);
        const email = String(body.email || '').trim().toLowerCase();
        const u = await db.getUserByEmail(email);
        const ok = !!(u && u.password_hash && (await password.verify(String(body.password || ''), u.password_hash)));
        if (!ok) fail('Wrong email or password.', 401);
        await startSession(u.id);
        return out({ user: publicUser(u) });
      }

      case 'POST /auth/google': {
        await rateLimit('auth:' + ip, 8, 60);
        const g = await google.verify(String(body.credential || ''), cfg.googleClientId);
        if (!g) fail('Google sign-in could not be verified.', 401);
        let u = await db.getUserByGoogleSub(g.sub);
        if (!u && g.email) u = await db.getUserByEmail(g.email);
        if (u && !u.google_sub) u = await db.updateUser(u.id, { google_sub: g.sub });
        if (!u) {
          try {
            u = await db.insertUser({ email: g.email, google_sub: g.sub });
          } catch (e) {
            if (e && e.code === '23505') {
              u = await db.getUserByEmail(g.email);
              if (u && !u.google_sub) u = await db.updateUser(u.id, { google_sub: g.sub });
            } else throw e;
          }
        }
        if (!u) fail('Google sign-in could not be verified.', 401);
        await startSession(u.id);
        return out({ user: publicUser(u) });
      }

      case 'POST /auth/logout': {
        await session.destroy(jar[cfg.sessionCookie]);
        setCookies.push(session.clearSessionCookieLine());
        return out({});
      }

      case 'GET /me': {
        return out({ user: publicUser(await me()) });
      }

      case 'GET /username/check': {
        const n = String(query.u != null ? query.u : '').toLowerCase();
        if (!USERNAME_RE.test(n)) return out({ available: false, reason: 'Use 3–20 letters, numbers or _ only.' });
        if (cfg.reservedUsernames.indexOf(n) >= 0) return out({ available: false, reason: 'That name is reserved.' });
        const row = await db.getUserByUsername(n);
        const cur = await me();
        const mine = !!(row && cur && Number(row.id) === Number(cur.id));
        return out({ available: !row || mine, reason: row && !mine ? 'That name is taken.' : null });
      }

      case 'POST /me/profile': {
        const u = await needMe();
        const n = String(body.username || '').trim().toLowerCase();
        const dob = String(body.dob || '');
        if (!USERNAME_RE.test(n) || cfg.reservedUsernames.indexOf(n) >= 0) fail('Pick a different username.');
        const age = ageFromDob(dob);
        if (age == null) fail('Enter a valid date of birth.');
        if (age < cfg.minAge) fail('You need to be at least ' + cfg.minAge + ' to join.', 403);
        if (await db.usernameTaken(n, u.id)) fail('That name is taken.', 409);
        const fresh = await db.updateUser(u.id, { username: n, dob, is_teen: age < cfg.adultAge ? 1 : 0 });
        return out({ user: publicUser(fresh) });
      }

      case 'POST /me/avatar': {
        const u = await needMe();
        const look = normalizeLib.clean(body.look, false); // false = players can never wear NPC-only uniforms
        await db.updateUser(u.id, { avatar_json: JSON.stringify(look) });
        return out({ look });
      }

      case 'POST /me/life': {
        const u = await needMe();
        const start = String(body.start || '');
        if (cfg.lifeStarts.indexOf(start) < 0) fail('Unknown start.');
        await db.updateUser(u.id, { life_start: start });
        return out({ life: start });
      }

      /* ---- new: realtime handshake (docs/API.md § realtime) ---- */
      case 'POST /realtime/token': {
        const u = await needMe();
        if (!cfg.supabaseJwtSecret) fail('Realtime is not configured on this server.', 503);
        if (!cfg.supabaseUrl || !cfg.supabaseAnonKey) {
          console.error('[futa] SUPABASE_URL / SUPABASE_ANON_KEY missing — realtime token will not connect.');
        }
        return out({ token: realtimeJwt(u), url: cfg.supabaseUrl, anonKey: cfg.supabaseAnonKey, expires_in: cfg.realtimeTokenTtl });
      }

      default:
        fail('Not found', 404);
    }
  } catch (err) {
    if (err instanceof HttpDone) return;                 // reply already sent
    if (err && err.status === 400) {                     // unreadable body
      if (!res.headersSent) http.send(res, 400, { error: 'Bad request.' }, setCookies);
      return;
    }
    console.error('[futa api] ' + req.method + ' ' + req.url, err);
    if (!res.headersSent) http.send(res, 500, { error: 'Server error.' }, setCookies);
  }
};
