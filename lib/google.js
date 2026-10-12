/* ==========================================================================
   FUTA World — Google ID-token verification (server side, never trust the
   browser). Mirrors legacy/php/src/GoogleVerifier.php: ask Google's
   tokeninfo endpoint, check audience + issuer + expiry + email_verified.
   ========================================================================== */
'use strict';

const URL = 'https://www.googleapis.com/oauth2/v3/tokeninfo?id_token=';

async function verify(credential, clientId) {
  if (!credential || typeof credential !== 'string' || credential.length > 8192) return null;
  if (!clientId) return null; // GOOGLE_CLIENT_ID not configured → refuse (never accept unverified)
  const ctrl = typeof AbortController === 'function' ? new AbortController() : null;
  const timer = ctrl && setTimeout(() => ctrl.abort(), 6000);
  try {
    const res = await fetch(URL + encodeURIComponent(credential), ctrl ? { signal: ctrl.signal } : {});
    if (!res.ok) return null;
    const j = await res.json();
    if (j.aud !== clientId) return null;
    if (typeof j.iss !== 'string' || !/^https:\/\/accounts\.google\.com(\/|$)/.test(j.iss)) return null;
    if (j.email_verified !== true && j.email_verified !== 'true') return null;
    if (!j.sub || !j.email) return null;
    if (j.exp && Number(j.exp) * 1000 < Date.now()) return null;
    return { sub: String(j.sub), email: String(j.email).toLowerCase(), name: j.name ? String(j.name) : null };
  } catch (e) {
    return null;
  } finally {
    if (timer) clearTimeout(timer);
  }
}

module.exports = { verify };
