/* ==========================================================================
   FUTA World — server settings. Reads the environment.
   Vercel → Project → Settings → Environment Variables is the home for these;
   nothing here reaches the browser except what a handler returns on purpose.
   Business rules below are byte-for-byte with legacy/php/config.php.
   ========================================================================== */
'use strict';

module.exports = {
  /* Supabase — set on Vercel, never in JS shipped to browsers. */
  supabaseUrl: process.env.SUPABASE_URL || '',                 // e.g. https://xxxx.supabase.co
  supabaseServiceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY || '', // server-only; bypasses RLS
  supabaseAnonKey: process.env.SUPABASE_ANON_KEY || '',         // public by design (RLS guards data); handed out only via /realtime/token
  supabaseJwtSecret: process.env.SUPABASE_JWT_SECRET || '',      // signs realtime tokens; Supabase → Settings → API → JWT secret
  googleClientId: process.env.GOOGLE_CLIENT_ID || '',           // same Web client id as onboarding/config.js

  /* Session/CSRF signing. Required — there is deliberately no default. */
  sessionSecret: process.env.SESSION_SECRET || '',

  /* Rules (kept with legacy/php/config.php). */
  minAge: 13,
  adultAge: 18,
  reservedUsernames: ['admin', 'futa', 'support', 'moderator', 'staff', 'security', 'system'],
  lifeStarts: ['fresh', 'hustler', 'creative'],                 // keep in sync with onboarding/life-start.json

  /* Cookies. */
  sessionDays: 30,
  sessionCookie: 'futa_sid',
  csrfCookie: 'futa_csrf',
  csrfHeader: 'x-csrf-token',
  secureCookies: process.env.VERCEL === '1' || process.env.NODE_ENV === 'production',

  realtimeTokenTtl: 3600, // seconds; /realtime/token
};
