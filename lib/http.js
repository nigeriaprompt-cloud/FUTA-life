/* ==========================================================================
   FUTA World — HTTP helpers for the Vercel function: JSON replies, cookies,
   body reading, client IP. Uses only Node core so the same handler also runs
   on plain node (tools/test/api-node.mjs).
   ========================================================================== */
'use strict';

const crypto = require('crypto');

/* JSON reply. Same rule as legacy PHP out(): every answer carries ok (code < 400). */
function send(res, code, obj, cookies) {
  if (res.headersSent) return;
  const body = JSON.stringify(Object.assign({ ok: code < 400 }, obj));
  res.statusCode = code;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  if (cookies && cookies.length) res.setHeader('Set-Cookie', cookies);
  res.end(body);
}

function parseCookies(header) {
  const out = {};
  if (!header) return out;
  for (const part of String(header).split(';')) {
    const i = part.indexOf('=');
    if (i < 1) continue;
    const k = part.slice(0, i).trim();
    if (k && out[k] === undefined) out[k] = decodeURIComponent(part.slice(i + 1).trim());
  }
  return out;
}

/* Build one Set-Cookie line. opts: {maxAge (s), httpOnly, secure} */
function cookieLine(name, value, opts) {
  opts = opts || {};
  let s = name + '=' + encodeURIComponent(value) + '; Path=/; SameSite=Lax';
  if (opts.maxAge != null) s += '; Max-Age=' + Math.floor(opts.maxAge);
  if (opts.httpOnly !== false) s += '; HttpOnly';
  if (opts.secure) s += '; Secure';
  return s;
}

/* Read a small JSON body (avatar looks are a few KB; hard-cap to stop junk). */
function readBody(req, limit) {
  limit = limit || 128 * 1024;
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on('data', (c) => {
      size += c.length;
      if (size > limit) { reject(new Error('Body too large.')); req.destroy(); return; }
      chunks.push(c);
    });
    req.on('end', () => {
      if (!chunks.length) return resolve({});
      try {
        const parsed = JSON.parse(Buffer.concat(chunks).toString('utf8'));
        resolve(parsed && typeof parsed === 'object' ? parsed : {});
      } catch (e) { reject(new Error('Invalid JSON.')); }
    });
    req.on('error', reject);
  });
}

/* First IP in x-forwarded-for (Vercel sets it; direct node falls back to socket). */
function clientIp(req) {
  const fwd = req.headers && req.headers['x-forwarded-for'];
  if (fwd) {
    const first = String(fwd).split(',')[0].trim();
    if (first) return first;
  }
  return (req.socket && req.socket.remoteAddress) || 'unknown';
}

/* Timing-safe string compare (used for CSRF tokens). */
function sameString(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string') return false;
  const ba = Buffer.from(a), bb = Buffer.from(b);
  if (ba.length !== bb.length) return false;
  return crypto.timingSafeEqual(ba, bb);
}

module.exports = { send, parseCookies, cookieLine, readBody, clientIp, sameString };
