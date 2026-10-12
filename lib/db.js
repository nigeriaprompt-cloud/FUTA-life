/* ==========================================================================
   FUTA World — database entry point. Picks the adapter from the environment:
   SUPABASE_URL set → Postgres via Supabase (production), otherwise in-memory
   (local dev / tools/test/api-node.mjs). One interface, two backends.
   ========================================================================== */
'use strict';

const cfg = require('./config.js');

const impl = (cfg.supabaseUrl && cfg.supabaseServiceRoleKey)
  ? require('./db-supabase.js')
  : require('./db-memory.js');

module.exports = impl.create(cfg);
