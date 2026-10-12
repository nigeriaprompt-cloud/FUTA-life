/* ==========================================================================
   FUTA World — API smoke test. Runs the REAL api/index.js handler on plain
   Node (no Vercel, no Supabase: SUPABASE_URL stays unset → in-memory DB).
   Run:  node tools/test/api-node.mjs        (or: npm test)
   Exits non-zero on the first failed assertion.
   ========================================================================== */
process.env.SESSION_SECRET = process.env.SESSION_SECRET || 'test-session-secret-not-a-real-one';
process.env.SUPABASE_JWT_SECRET = process.env.SUPABASE_JWT_SECRET || 'test-jwt-secret-not-a-real-one';

import http from 'node:http';
import assert from 'node:assert';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const handler = require('../../api/index.js');

/* ---- tiny server around the handler ---- */
const server = http.createServer((req, res) => {
  Promise.resolve(handler(req, res)).catch((e) => {
    console.error('unhandled:', e);
    if (!res.headersSent) { res.statusCode = 500; res.end('{"error":"crash"}'); }
  });
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const BASE = 'http://127.0.0.1:' + server.address().port;

/* ---- cookie jar (one jar = one browser) ---- */
const jar = new Map();
async function call(method, path, body, opts) {
  opts = opts || {};
  const headers = { Accept: 'application/json' };
  const cookies = [...jar.entries()].map(([k, v]) => k + '=' + v).join('; ');
  if (cookies && !opts.noCookies) headers.Cookie = cookies;
  if (method !== 'GET' && !opts.noCsrf && jar.has('futa_csrf')) headers['X-CSRF-Token'] = jar.get('futa_csrf');
  let payload;
  if (body !== undefined) {
    headers['Content-Type'] = 'application/json';
    payload = JSON.stringify(body);
  }
  const res = await fetch(BASE + path, { method, headers, body: payload });
  const sc = typeof res.headers.getSetCookie === 'function' ? res.headers.getSetCookie() : [];
  for (const line of sc) {
    const pair = line.split(';')[0];
    const i = pair.indexOf('=');
    const k = pair.slice(0, i).trim(), v = decodeURIComponent(pair.slice(i + 1));
    if (v === '' || /Max-Age=0/i.test(line)) jar.delete(k); else jar.set(k, v);
  }
  let data = null;
  try { data = await res.json(); } catch (e) { /* non-json */ }
  return { status: res.status, data };
}

let passed = 0;
function ok(cond, label) {
  assert.ok(cond, label);
  passed++;
  console.log('  \u2713 ' + label);
}

const dobForAge = (a) => {
  const d = new Date(), p = (n) => String(n).padStart(2, '0');
  return (d.getFullYear() - a) + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate());
};


try {
  /* ---- bootstrapping ---- */
  let r = await call('GET', '/api/v1/me');
  ok(r.status === 200 && r.data.ok === true && r.data.user === null, 'GET /me without session → user:null');
  ok(jar.has('futa_csrf'), 'CSRF cookie handed out');

  r = await call('POST', '/api/v1/auth/register', { email: 'x@y.co', password: 'longenough' }, { noCsrf: true });
  ok(r.status === 403, 'POST without X-CSRF-Token → 403');

  /* ---- register ---- */
  r = await call('POST', '/api/v1/auth/register', { email: 'alice@example.com', password: 'short' });
  ok(r.status === 400 && /8 characters/.test(r.data.error), 'register: weak password → 400');
  r = await call('POST', '/api/v1/auth/register', { email: 'not-an-email', password: 'longenough' });
  ok(r.status === 400 && /valid email/.test(r.data.error), 'register: bad email → 400');
  r = await call('POST', '/api/v1/auth/register', { email: 'alice@example.com', password: 'password123' });
  ok(r.status === 200 && r.data.needsVerify === false, 'register: ok → {needsVerify:false}');
  ok(jar.has('futa_sid'), 'session cookie set');
  r = await call('GET', '/api/v1/me');
  ok(r.data.user && r.data.user.email === 'alice@example.com', 'register signs you in (GET /me)');
  r = await call('POST', '/api/v1/auth/register', { email: 'alice@example.com', password: 'password123' });
  ok(r.status === 409, 'register: duplicate email → 409');

  /* ---- login ---- */
  r = await call('POST', '/api/v1/auth/login', { email: 'alice@example.com', password: 'wrongwrong' });
  ok(r.status === 401 && /Wrong email or password/.test(r.data.error), 'login: wrong password → 401');
  r = await call('POST', '/api/v1/auth/login', { email: 'alice@example.com', password: 'password123' });
  ok(r.status === 200 && r.data.user.email === 'alice@example.com', 'login: ok → {user}');

  /* ---- google (no GOOGLE_CLIENT_ID configured → must refuse) ---- */
  r = await call('POST', '/api/v1/auth/google', { credential: 'bogus.token.here' });
  ok(r.status === 401 && /could not be verified/.test(r.data.error), 'google: unverifiable token → 401');

  /* ---- username check ---- */
  r = await call('GET', '/api/v1/username/check?u=ab');
  ok(r.status === 200 && r.data.available === false && /3–20/.test(r.data.reason), 'username/check: too short → reason');
  r = await call('GET', '/api/v1/username/check?u=admin');
  ok(r.data.available === false && r.data.reason === 'That name is reserved.', 'username/check: reserved → reserved');
  r = await call('GET', '/api/v1/username/check?u=alice_01');
  ok(r.data.available === true && r.data.reason === null, 'username/check: free → available, reason null');

  /* ---- profile (age rules) ---- */
  r = await call('POST', '/api/v1/me/profile', { username: 'A', dob: '2005-01-01' });
  ok(r.status === 400 && /different username/.test(r.data.error), 'profile: bad username → 400');
  r = await call('POST', '/api/v1/me/profile', { username: 'alice_01', dob: '2020-02-31' });
  ok(r.status === 400 && /valid date/.test(r.data.error), 'profile: impossible date → 400');
  r = await call('POST', '/api/v1/me/profile', { username: 'alice_01', dob: dobForAge(12) });
  ok(r.status === 403 && /at least 13/.test(r.data.error), 'profile: age 12 → 403 (<13 blocked)');
  r = await call('POST', '/api/v1/me/profile', { username: 'alice_01', dob: dobForAge(15) });
  ok(r.status === 200 && r.data.user.username === 'alice_01' && r.data.user.teen === true, 'profile: age 15 → saved with teen flag');
  r = await call('GET', '/api/v1/username/check?u=alice_01');
  ok(r.data.available === true && r.data.reason === null, 'username/check: own name → still available (mine)');

  /* ---- avatar (normalisation, restricted items stripped) ---- */
  r = await call('POST', '/api/v1/me/avatar', { look: {} });
  ok(r.status === 200 && r.data.look.wear.top.id === 'tee', 'avatar: {} → defaults applied');
  r = await call('POST', '/api/v1/me/avatar', { look: { wear: { top: { id: 'uniform_shirt', c: 3 } } } });
  ok(r.data.look.wear.top.id === 'tee', 'avatar: NPC-only item stripped (allowRestricted=false)');
  r = await call('POST', '/api/v1/me/avatar', { look: { skin: 999, body: { frame: 'x' }, hair: { style: 'nope' } } });
  ok(r.data.look.skin <= 11 && r.data.look.body.frame === 'm', 'avatar: garbage clamped to valid ranges');

  /* ---- life ---- */
  r = await call('POST', '/api/v1/me/life', { start: 'nope' });
  ok(r.status === 400 && r.data.error === 'Unknown start.', 'life: unknown start → 400');
  r = await call('POST', '/api/v1/me/life', { start: 'hustler' });
  ok(r.status === 200 && r.data.life === 'hustler', 'life: saved');

  /* ---- public player avatar (for the world) ---- */
  r = await call('GET', '/api/v1/players/alice_01/avatar');
  ok(r.status === 200 && r.data.username === 'alice_01' && r.data.look && r.data.look.body, 'players/{u}/avatar → look');
  r = await call('GET', '/api/v1/players/nobody_99/avatar');
  ok(r.status === 404, 'players/unknown/avatar → 404');

  /* ---- realtime token ---- */
  r = await call('POST', '/api/v1/realtime/token');
  ok(r.status === 200 && typeof r.data.token === 'string' && r.data.token.split('.').length === 3, 'realtime/token → JWT');
  ok(r.data.expires_in === 3600, 'realtime/token → expires_in 3600');
  const payload = JSON.parse(Buffer.from(r.data.token.split('.')[1], 'base64url').toString('utf8'));
  ok(payload.role === 'authenticated' && payload.user_metadata.username === 'alice_01', 'realtime JWT carries role + username');
  ok(typeof payload.sub === 'string', 'realtime JWT sub is a string');

  /* ---- logout really revokes server-side ---- */
  r = await call('POST', '/api/v1/auth/logout');
  ok(r.status === 200 && r.data.ok === true, 'logout → ok');
  r = await call('GET', '/api/v1/me');
  ok(r.data.user === null, 'after logout GET /me → null');
  r = await call('POST', '/api/v1/realtime/token');
  ok(r.status === 401, 'after logout POST /realtime/token → 401');

  /* ---- rate limit on auth routes (8/min per IP) ---- */
  let limited = false;
  for (let i = 0; i < 12 && !limited; i++) {
    r = await call('POST', '/api/v1/auth/login', { email: 'alice@example.com', password: 'wrongwrong' });
    if (r.status === 429) limited = true;
  }
  ok(limited, 'auth rate limit trips → 429');

  console.log('\nALL PASS — ' + passed + ' assertions');
} catch (e) {
  console.error('\nFAILED: ' + e.message);
  process.exitCode = 1;
} finally {
  server.close();
}
