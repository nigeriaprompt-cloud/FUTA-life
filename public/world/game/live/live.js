/* ==========================================================================
   FutaLive — live players, room chat, waves + DMs, seats, ATM.   Network only: no THREE here.
   Backend: Supabase Realtime + the RPCs in supabase/01_schema.sql.  Rendering is in remotes.js.

   HOW IT WORKS
   - One Realtime channel per ROOM ("zone_<cx>_<cz>" for outdoors, "int_<buildingId>_<n>" for an interior instance).
     The channel carries: presence (who is here), broadcast "pos" (movement), postgres_changes (chat + seats).
   - Movement is sent at most `posHz` times/second and ONLY while moving (+ a 1/s heartbeat). Receivers interpolate (Interp).
   - A player's NAME and OUTFIT are never read from the network message: we take only the user id from presence and
     load the name/avatar from the `profiles` table. So nobody can fake a label by editing their own packet's text.
     (A hacked client can still claim another user's id; see docs/SUPABASE.md "Known limits".)
   - Safety (wave-first DMs, blocks, teen rules, chat filter, rate limits) is enforced in SQL, not here.
   Every public function returns a Promise or void and never throws into the game loop.
   ========================================================================== */
(function (g) {
  'use strict';
  const CFG = Object.assign({ posHz: 4, heartbeatMs: 1000, zoneSize: 160, zoneHysteresis: 12, maxPeersRendered: 30, historyLimit: 30, seatRenewMs: 120000 }, g.FUTA_LIVE || {});

  /* ---------- pure helpers (unit-tested in tools/test/live.test.js) ---------- */
  const zoneRoom = (x, z) => 'zone_' + Math.floor(x / CFG.zoneSize) + '_' + Math.floor(z / CFG.zoneSize);
  /** Stay in the current zone until the player is clearly inside another one (prevents flapping on borders). */
  function zoneFor(x, z, cur) {
    const want = zoneRoom(x, z); if (!cur || cur === want) return want;
    const m = /^zone_(-?\d+)_(-?\d+)$/.exec(cur); if (!m) return want;
    const cx = +m[1], cz = +m[2], S = CFG.zoneSize, h = CFG.zoneHysteresis;
    const inside = x > cx * S - h && x < (cx + 1) * S + h && z > cz * S - h && z < (cz + 1) * S + h; return inside ? cur : want;
  }
  const angDiff = (a, b) => { let d = (b - a) % (Math.PI * 2); if (d > Math.PI) d -= Math.PI * 2; if (d < -Math.PI) d += Math.PI * 2; return d; };

  /** Snapshot interpolation: render ~150 ms in the past so there is nearly always a pair of snapshots to blend. */
  class Interp {
    constructor(delay) { this.delay = delay == null ? 150 : delay; this.b = []; }
    push(t, x, y, z, ry, anim) { const b = this.b; if (b.length && t <= b[b.length - 1].t) return; b.push({ t, x, y, z, ry, anim }); if (b.length > 12) b.shift(); }
    sample(now) {
      const b = this.b, T = now - this.delay; if (!b.length) return null;
      if (T <= b[0].t) return Object.assign({}, b[0]);
      for (let i = b.length - 1; i > 0; i--) if (b[i - 1].t <= T) {
        const p = b[i - 1], q = b[i]; if (T >= q.t) { // ahead of newest data: hold, or extrapolate a little (max 250 ms) so players do not freeze
          const k = Math.min(T - q.t, 250) / Math.max(1, q.t - p.t); const ex = Math.min(k, 1); return { x: q.x + (q.x - p.x) * ex, y: q.y, z: q.z + (q.z - p.z) * ex, ry: q.ry, anim: q.anim, t: T };
        }
        const k = (T - p.t) / (q.t - p.t); return { x: p.x + (q.x - p.x) * k, y: p.y + (q.y - p.y) * k, z: p.z + (q.z - p.z) * k, ry: p.ry + angDiff(p.ry, q.ry) * k, anim: k < .5 ? p.anim : q.anim, t: T };
      }
      return Object.assign({}, b[b.length - 1]);
    }
  }

  /* ---------- the live client ---------- */
  function create(opts) {
    const sb = opts.sb, me = opts.me;                   // me = { id, username }  (from FutaApi.me())
    const L = { room: null, peers: new Map(), profiles: new Map(), seatsTaken: new Map(), cfg: CFG };
    const ev = {}, on = (n, f) => { (ev[n] = ev[n] || []).push(f); return () => { ev[n] = (ev[n] || []).filter(x => x !== f); }; }, emit = (n, a) => (ev[n] || []).slice().forEach(f => { try { f(a); } catch (e) { console.error('[live]', n, e); } });
    let ch = null, joinToken = 0, lastSent = 0, lastPos = null, hash = '', seat = null, seatTimer = null, dmCh = null, loading = new Set();
    L.on = on;
    const clock = () => (g.performance ? performance.now() : Date.now());

    function peerOf(id) { let p = L.peers.get(id); if (!p) { p = { id, interp: new Interp(), profile: L.profiles.get(id) || null, seat: null, present: false }; L.peers.set(id, p); } return p; }

    async function loadProfiles(ids) {
      const need = ids.filter(i => i !== me.id && !L.profiles.has(i) && !loading.has(i)); if (!need.length) return; need.forEach(i => loading.add(i));
      try {
        const { data, error } = await sb.from('profiles').select('id,username,avatar_json,avatar_hash').in('id', need.slice(0, 80));
        if (error) throw error;
        (data || []).forEach(p => { L.profiles.set(p.id, p); const pe = L.peers.get(p.id); if (pe) { pe.profile = p; emit('peerProfile', pe); } });
      } catch (e) { console.warn('[live] profile load failed', e.message || e); }
      need.forEach(i => loading.delete(i));
    }

    function syncPresence() {
      if (!ch) return; const st = ch.presenceState(), seen = new Set();
      Object.keys(st).forEach(k => {
        if (k === me.id) return; const metas = st[k]; if (!metas || !metas.length) return; const m = metas[metas.length - 1];
        seen.add(k); const p = peerOf(k), wasHere = p.present; p.present = true; p.seat = m.seat || null; p.hash = m.hash || '';
        if (!wasHere) emit('peerJoin', p); else emit('peerState', p);
      });
      L.peers.forEach((p, id) => { if (p.present && !seen.has(id)) { p.present = false; L.peers.delete(id); emit('peerLeave', p); } });
      loadProfiles(Array.from(seen));
    }

    /** Enter a room. Safe to call again with another room name (leaves the old one first). */
    async function join(room) {
      if (room === L.room && ch) return; const token = ++joinToken; await leave(true); if (token !== joinToken) return;
      L.room = room; L.seatsTaken.clear();
      const c = sb.channel('futa:' + room, { config: { private: true, presence: { key: me.id }, broadcast: { self: false, ack: false } } });
      c.on('presence', { event: 'sync' }, syncPresence);
      c.on('broadcast', { event: 'pos' }, (m) => {
        const d = m && m.payload; if (!d || d.i === me.id) return; const p = L.peers.get(d.i); if (!p || !p.present) return;      // only players who are really in presence
        if (![d.x, d.y, d.z, d.r].every(Number.isFinite) || Math.abs(d.x) > 1e5 || Math.abs(d.z) > 1e5) return;                    // ignore junk
        p.interp.push(clock(), d.x, d.y, d.z, d.r, d.a || 'idle');
      });
      c.on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'room_messages', filter: 'room=eq.' + room }, (m) => { if (m && m.new) emit('chat', { id: m.new.id, room, userId: m.new.user_id, username: m.new.username, body: m.new.body, at: m.new.created_at, mine: m.new.user_id === me.id }); });
      c.on('postgres_changes', { event: '*', schema: 'public', table: 'seat_claims', filter: 'room=eq.' + room }, (m) => {
        const r = m && (m.new && m.new.seat_id ? m.new : m.old); if (!r) return; if (m.eventType === 'DELETE') L.seatsTaken.delete(r.seat_id); else L.seatsTaken.set(r.seat_id, r.user_id); emit('seats', L.seatsTaken);
      });
      ch = c;
      await new Promise((res) => c.subscribe((status) => {
        if (status === 'SUBSCRIBED') { if (token === joinToken) { track(); res(); } else res(); }
        else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') { emit('status', status); res(); }
      }));
      if (token !== joinToken) return;
      emit('room', room); history(room).catch(() => { }); loadSeats(room).catch(() => { });
    }
    async function leave(quiet) {
      if (seat) { seat = null; sb.rpc('release_seat').then(() => { }, () => { }); }
      if (ch) { const c = ch; ch = null; try { await sb.removeChannel(c); } catch (e) { /* ignore */ } }
      L.peers.forEach(p => { if (p.present) emit('peerLeave', p); }); L.peers.clear(); L.room = null; lastPos = null; if (!quiet) emit('room', null);
    }
    function track() { if (ch) ch.track({ hash, seat, t: Date.now() }).catch(() => { }); }
    L.join = join; L.leave = () => leave(false); L.zoneFor = zoneFor; L.zoneRoom = zoneRoom;
    /** Call every frame with the player's position; it switches zone rooms and throttles network sends for you. */
    L.tick = function (x, y, z, ry, anim, outdoors) {
      if (outdoors) { const want = zoneFor(x, z, L.room && L.room.indexOf('zone_') === 0 ? L.room : null); if (want !== L.room) join(want).catch(() => { }); }
      if (!ch || !L.room) return; const now = clock(), moved = !lastPos || Math.hypot(x - lastPos.x, z - lastPos.z) > 0.04 || Math.abs(angDiff(ry, lastPos.ry)) > 0.05 || anim !== lastPos.anim;
      const gap = moved ? 1000 / CFG.posHz : CFG.heartbeatMs; if (now - lastSent < gap) return; lastSent = now; lastPos = { x, z, ry, anim };
      ch.send({ type: 'broadcast', event: 'pos', payload: { i: me.id, x: +x.toFixed(2), y: +y.toFixed(2), z: +z.toFixed(2), r: +ry.toFixed(2), a: anim } }).catch(() => { });
    };
    L.setLook = (h) => { hash = h || ''; track(); };
    /** Nearest N peers for rendering (cap for phones). */
    L.nearest = function (x, z) { const a = []; L.peers.forEach(p => { if (!p.present || !p.profile) return; const s = p.interp.sample(clock()); if (s) a.push({ p, s, d: Math.hypot(s.x - x, s.z - z) }); }); a.sort((u, v) => u.d - v.d); return a.slice(0, CFG.maxPeersRendered); };

    /* ---- chat ---- */
    async function history(room) {
      const { data, error } = await sb.from('room_messages').select('id,user_id,username,body,created_at').eq('room', room).order('id', { ascending: false }).limit(CFG.historyLimit);
      if (error) throw error; emit('history', (data || []).reverse().map(r => ({ id: r.id, room, userId: r.user_id, username: r.username, body: r.body, at: r.created_at, mine: r.user_id === me.id })));
    }
    async function loadSeats(room) { const { data } = await sb.rpc('list_seats', { p_room: room }); L.seatsTaken.clear(); (data || []).forEach(r => L.seatsTaken.set(r.seat_id, r.user_id)); emit('seats', L.seatsTaken); }
    const call = async (fn, args) => { const { data, error } = await sb.rpc(fn, args); if (error) throw FutaApiFail(error); return data; };
    const FutaApiFail = (e) => (g.FutaApi && g.FutaApi.fail) ? g.FutaApi.fail(e) : new Error(e.message || String(e));
    L.say = (text) => { if (!L.room) return Promise.reject(new Error('Not in a room yet.')); return call('send_room_message', { p_room: L.room, p_body: text }); };

    /* ---- seats ---- */
    L.sit = async function (seatId) {
      if (!L.room) throw new Error('Not in a room yet.'); const r = await call('claim_seat', { p_room: L.room, p_seat: seatId });
      if (!r.ok) return false; seat = seatId; track(); clearInterval(seatTimer); seatTimer = setInterval(() => { call('claim_seat', { p_room: L.room, p_seat: seatId }).then(x => { if (!x.ok) L.stand(); }).catch(() => { }); }, CFG.seatRenewMs); return true;
    };
    L.stand = async function () { clearInterval(seatTimer); if (!seat) return; seat = null; track(); await call('release_seat').catch(() => { }); };
    L.seatTaken = (id) => L.seatsTaken.has(id) && L.seatsTaken.get(id) !== me.id;

    /* ---- ATM / wallet (game money) ---- */
    L.wallet = () => call('get_wallet'); L.withdraw = (n) => call('atm_withdraw', { p_amount: n }); L.deposit = (n) => call('atm_deposit', { p_amount: n }); L.claimDaily = () => call('atm_claim_daily');

    /* ---- people: waves, DMs, safety ---- */
    L.wave = (userId) => call('send_wave', { p_to: userId });
    L.answerWave = (id, accept) => call('respond_wave', { p_id: id, p_accept: accept });
    L.dm = (userId, text) => call('send_dm', { p_to: userId, p_body: text });
    L.block = (userId) => call('block_user', { p_target: userId }); L.unblock = (userId) => call('unblock_user', { p_target: userId });
    L.report = (userId, reason, context) => call('report_user', { p_target: userId, p_reason: reason, p_context: context || null });
    L.dmHistory = async function (otherId) { const { data, error } = await sb.from('dms').select('id,sender,recipient,body,created_at').or(`and(sender.eq.${me.id},recipient.eq.${otherId}),and(sender.eq.${otherId},recipient.eq.${me.id})`).order('id', { ascending: false }).limit(50); if (error) throw error; return (data || []).reverse(); };
    L.pendingWaves = async function () { const { data, error } = await sb.from('waves').select('id,from_user,created_at').eq('to_user', me.id).eq('status', 'pending').order('id', { ascending: false }).limit(20); if (error) throw error; return data || []; };
    /** Personal channel: incoming DMs and waves, wherever you are in the world. */
    L.listenPersonal = function () {
      if (dmCh) return; dmCh = sb.channel('futa:me:' + me.id);
      dmCh.on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'dms', filter: 'recipient=eq.' + me.id }, (m) => emit('dm', m.new));
      dmCh.on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'waves', filter: 'to_user=eq.' + me.id }, (m) => emit('waveIn', m.new));
      dmCh.on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'waves', filter: 'from_user=eq.' + me.id }, (m) => emit('waveUpdate', m.new));
      dmCh.subscribe();
    };
    L.close = async function () { await leave(true); if (dmCh) { try { await sb.removeChannel(dmCh); } catch (e) { /* ignore */ } dmCh = null; } };
    return L;
  }

  g.FutaLive = { create, Interp, zoneRoom, zoneFor, config: CFG };
})(typeof window !== 'undefined' ? window : globalThis);
