/* ==========================================================================
   FUTA World — Supabase (Postgres) database adapter. Production data layer.
   Talks to Supabase with the SERVICE ROLE key only (server-side, bypasses RLS).
   Interface must stay identical to db-memory.js.
   ========================================================================== */
'use strict';

function create(cfg) {
  const { createClient } = require('@supabase/supabase-js'); // lazy: memory mode must run without node_modules
  const db = createClient(cfg.supabaseUrl, cfg.supabaseServiceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  /* Every helper throws on real errors so a broken DB never looks like "not found". */
  async function one(table, eqField, eqValue) {
    const { data, error } = await db.from(table).select('*').eq(eqField, eqValue).maybeSingle();
    if (error) throw error;
    return data;
  }

  return {
    /* ---- users ---- */
    async getUserById(id) { return one('world_users', 'id', id); },
    async getUserByEmail(email) { return one('world_users', 'email', String(email).toLowerCase()); },
    async getUserByGoogleSub(sub) { return one('world_users', 'google_sub', String(sub)); },
    async getUserByUsername(username) { return one('world_users', 'username', String(username).toLowerCase()); },
    async usernameTaken(username, exceptId) {
      let q = db.from('world_users').select('id').eq('username', String(username).toLowerCase());
      if (exceptId != null) q = q.neq('id', exceptId);
      const { data, error } = await q.maybeSingle();
      if (error) throw error;
      return !!data;
    },
    async insertUser(fields) {
      const { data, error } = await db.from('world_users')
        .insert({
          email: fields.email || null,
          password_hash: fields.password_hash || null,
          google_sub: fields.google_sub || null,
        })
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    async updateUser(id, patch) {
      const { data, error } = await db.from('world_users').update(patch).eq('id', id).select().maybeSingle();
      if (error) throw error;
      return data;
    },

    /* ---- sessions ---- */
    async createSession(sid, userId, days) {
      const expires = new Date(Date.now() + days * 86400000).toISOString();
      const { error } = await db.from('world_sessions')
        .insert({ sid, user_id: userId, expires_at: expires });
      if (error) throw error;
    },
    async getSessionUser(sid) {
      const { data, error } = await db.from('world_sessions')
        .select('sid, expires_at, world_users(*)')
        .eq('sid', sid)
        .maybeSingle();
      if (error) throw error;
      if (!data) return null;
      if (new Date(data.expires_at).getTime() < Date.now()) {
        await db.from('world_sessions').delete().eq('sid', sid);
        return null;
      }
      return data.world_users || null;
    },
    async deleteSession(sid) {
      const { error } = await db.from('world_sessions').delete().eq('sid', sid);
      if (error) throw error;
    },
    async deleteExpiredSessions() {
      const { error } = await db.from('world_sessions').delete().lt('expires_at', new Date().toISOString());
      if (error) throw error;
    },

    /* ---- rate limiting: one atomic SQL function (see supabase/schema.sql) ---- */
    async rateLimit(key, max, secs) {
      const { data, error } = await db.rpc('rate_limit_hit', { p_key: key, p_max: max, p_secs: secs });
      if (error) throw error;
      return data === true;
    },
  };
}

module.exports = { create };
