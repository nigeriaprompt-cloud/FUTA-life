/* ==========================================================================
   FUTA World — sessions and CSRF.
   The session cookie holds "<sid>.<HMAC>" — the server stores the sid in
   world_sessions, so logout really revokes it (the browser decides nothing).
   CSRF = double submit: futa_csrf cookie (readable by JS) must be echoed in
   the X-CSRF-Token header on every POST.
   ========================================================================== */
'use strict';

const crypto = require('crypto');
const cfg = require('./config.js');
const db = require('./db.js');

const b64u = (buf) => buf.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

function secret() {
  if (!cfg.sessionSecret) {
    throw new Error('SESSION_SECRET is not set — add it in Vercel → Settings → Environment Variables.');
  }
  return cfg.sessionSecret;
}

function sign(sid) {
  return b64u(crypto.createHmac('sha256', secret()).update('futa.sid.' + sid).digest());
}

/* New signed session cookie value; also creates the row server-side. */
async function create(userId) {
  const sid = b64u(crypto.randomBytes(24));
  await db.createSession(sid, userId, cfg.sessionDays);
  return sid + '.' + sign(sid);
}

/* Verify cookie value → sid, or null. Constant-time HMAC check, then DB lookup. */
async function sidOf(cookieValue) {
  if (typeof cookieValue !== 'string' || cookieValue.length < 10) return null;
  const i = cookieValue.lastIndexOf('.');
  if (i < 1) return null;
  const sid = cookieValue.slice(0, i), mac = cookieValue.slice(i + 1);
  const want = sign(sid);
  const a = Buffer.from(mac), b = Buffer.from(want);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  return sid;
}

/* The signed-in user for a cookie value, or null. */
async function userOf(cookieValue) {
  const sid = await sidOf(cookieValue);
  if (!sid) return null;
  return db.getSessionUser(sid);
}

async function destroy(cookieValue) {
  const sid = await sidOf(cookieValue);
  if (sid) await db.deleteSession(sid);
}

function sessionCookieLine(sidValue) {
  return cfg.sessionCookie + '=' + encodeURIComponent(sidValue) +
    '; Path=/; SameSite=Lax; HttpOnly' +
    (cfg.secureCookies ? '; Secure' : '') +
    '; Max-Age=' + cfg.sessionDays * 24 * 3600;
}

function clearSessionCookieLine() {
  return cfg.sessionCookie + '=; Path=/; SameSite=Lax; HttpOnly' +
    (cfg.secureCookies ? '; Secure' : '') + '; Max-Age=0';
}

/* futa_csrf is deliberately NOT HttpOnly — the page must read it to echo it. */
function newCsrf() { return b64u(crypto.randomBytes(18)); }

function csrfCookieLine(value) {
  return cfg.csrfCookie + '=' + encodeURIComponent(value) +
    '; Path=/; SameSite=Lax' +
    (cfg.secureCookies ? '; Secure' : '') +
    '; Max-Age=' + 7 * 24 * 3600;
}

module.exports = { create, userOf, destroy, sessionCookieLine, clearSessionCookieLine, newCsrf, csrfCookieLine };
