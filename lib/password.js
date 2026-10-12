/* ==========================================================================
   FUTA World — password hashing with Node's crypto.scrypt.
   Format: scrypt$N$r$p$saltB64$hashB64   (replaces PHP password_hash).
   ========================================================================== */
'use strict';

const crypto = require('crypto');

const N = 16384, R = 8, P = 1, KEYLEN = 64;

function scrypt(pw, salt, n, r, p) {
  return new Promise((resolve, reject) => {
    crypto.scrypt(
      String(pw).normalize('NFKC'), salt, KEYLEN,
      { N: n, r, p, maxmem: 128 * 1024 * 1024 },
      (err, dk) => (err ? reject(err) : resolve(dk))
    );
  });
}

async function hash(pw) {
  const salt = crypto.randomBytes(16);
  const dk = await scrypt(pw, salt, N, R, P);
  return ['scrypt', N, R, P, salt.toString('base64'), dk.toString('base64')].join('$');
}

/* Returns false for wrong passwords and for anything malformed (never throws). */
async function verify(pw, stored) {
  try {
    const parts = String(stored || '').split('$');
    if (parts.length !== 6 || parts[0] !== 'scrypt') return false;
    const n = parseInt(parts[1], 10), r = parseInt(parts[2], 10), p = parseInt(parts[3], 10);
    if (!n || !r || !p) return false;
    const salt = Buffer.from(parts[4], 'base64');
    const want = Buffer.from(parts[5], 'base64');
    const dk = await scrypt(pw, salt, n, r, p);
    return dk.length === want.length && crypto.timingSafeEqual(dk, want);
  } catch (e) { return false; }
}

module.exports = { hash, verify };
