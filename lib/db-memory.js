/* ==========================================================================
   FUTA World — in-memory database adapter.
   Used when SUPABASE_URL is not set, i.e. local dev and tools/test/api-node.mjs
   (same idea as the old PHP dev SQLite file). Data dies with the process.
   Interface must stay identical to db-supabase.js.
   ========================================================================== */
'use strict';

function create(cfg) {
  const users = [];          // rows shaped like world_users
  const sessions = new Map(); // sid -> {user_id, expires_at(ms)}
  const buckets = new Map(); // rate-limit key -> [ms timestamps]
  let nextId = 1;

  if (!create._warned) {
    create._warned = true;
    console.warn('[futa] SUPABASE_URL not set → in-memory DB (dev/test only; nothing is saved).');
  }

  const withUser = (u) => (u ? Object.assign({}, u) : null);

  return {
    /* ---- users ---- */
    async getUserById(id) {
      return withUser(users.find((u) => u.id === Number(id)) || null);
    },
    async getUserByEmail(email) {
      const e = String(email).toLowerCase();
      return withUser(users.find((u) => u.email === e) || null);
    },
    async getUserByGoogleSub(sub) {
      return withUser(users.find((u) => u.google_sub === String(sub)) || null);
    },
    async getUserByUsername(username) {
      const n = String(username).toLowerCase();
      return withUser(users.find((u) => u.username === n) || null);
    },
    async usernameTaken(username, exceptId) {
      const n = String(username).toLowerCase();
      return users.some((u) => u.username === n && u.id !== Number(exceptId));
    },
    async insertUser(fields) {
      const u = {
        id: nextId++,
        email: fields.email || null,
        password_hash: fields.password_hash || null,
        google_sub: fields.google_sub || null,
        username: null, dob: null, is_teen: 0,
        avatar_json: null, life_start: null,
        created_at: new Date().toISOString(),
      };
      users.push(u);
      return withUser(u);
    },
    async updateUser(id, patch) {
      const u = users.find((x) => x.id === Number(id));
      if (!u) return null;
      Object.assign(u, patch);
      return withUser(u);
    },

    /* ---- sessions ---- */
    async createSession(sid, userId, days) {
      sessions.set(sid, { user_id: Number(userId), expires_at: Date.now() + days * 86400000 });
    },
    async getSessionUser(sid) {
      const s = sessions.get(sid);
      if (!s) return null;
      if (s.expires_at < Date.now()) { sessions.delete(sid); return null; }
      return this.getUserById(s.user_id);
    },
    async deleteSession(sid) { sessions.delete(sid); },
    async deleteExpiredSessions() {
      const now = Date.now();
      for (const [k, v] of sessions) if (v.expires_at < now) sessions.delete(k);
    },

    /* ---- rate limiting (window in ms, same semantics as PHP's per-session counter) ---- */
    async rateLimit(key, max, secs) {
      const now = Date.now();
      const arr = (buckets.get(key) || []).filter((t) => t > now - secs * 1000);
      if (arr.length >= max) { buckets.set(key, arr); return false; }
      arr.push(now);
      buckets.set(key, arr);
      return true;
    },
  };
}

module.exports = { create };
