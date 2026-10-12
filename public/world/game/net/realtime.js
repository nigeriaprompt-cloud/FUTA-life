/* ==========================================================================
   FUTA World — live multiplayer layer for /world (Phase 0 realtime).
   What it does:  signs in via POST /api/v1/realtime/token, joins Supabase
   Realtime broadcast+presence channels named zone:<cellX>:<cellZ> (100 m
   cells, own cell + 8 neighbours = interest management, ARCHITECTURE §6),
   sends your camera focus ~5×/s, and draws other players as FutaAvatar
   characters with name labels, interpolated ~150 ms behind.

   v1 limits (documented, deliberate):
   - Movement is COSMETIC: no server-side speed clamp yet (comes with chat).
   - Your position = where your camera looks; there is no local avatar yet.
   - Privacy toggles (hide my position) arrive with Phase 7 style rules.

   How to change: constants below; protocol is docs/API.md § realtime.
   Loaded from futa-map-modern.html after bridge.js (needs window.FUTA).
   ========================================================================== */
(function () {
  'use strict';

  const API = '/api/v1';
  const CELL = 100;            // world units per zone cell (ARCHITECTURE §6)
  const MOVE_MS = 200;         // 5 position sends per second
  const INTERP_MS = 150;       // render this far behind (ARCHITECTURE §6)
  const TRACK_M = 4;           // re-announce presence after moving this far
  const TRACK_MS = 2000;       // …but at most this often
  const MAX_AVATARS = 40;      // performance budget §8 (≤60 full avatars)
  const TOKEN_REFRESH_MS = 45 * 60 * 1000; // handshake again before the 60 min JWT expires
  const NAME_RE = /^[a-z0-9_]{3,20}$/;

  const st = {
    username: null, client: null, token: null, url: null, anonKey: null,
    cells: new Map(),        // 'cx:cz' -> channel
    ownKey: null,            // 'cx:cz' of where the camera is
    present: new Map(),      // 'cx:cz' -> Map(username -> {x,z})  (presence roster)
    pos: { x: 0, z: 0 },     // camera focus (our position)
    sent: null,              // last position we broadcast
    tracked: null,           // last position we put in presence
    trackedAt: 0,
    remote: new Map(),       // username -> remote player record
    pending: new Set(),      // usernames whose avatar is loading
    up: new Set(),           // cell keys whose channel is SUBSCRIBED
    moveTimer: null, refreshTimer: null, attempt: 0,
    rebuildTimer: null, started: false,
  };

  /* ------------------------------------------------------------ small UI */
  let pillEl = null;
  function pill(text, show) {
    try {
      if (!pillEl) {
        pillEl = document.createElement('div');
        pillEl.id = 'futa-live';
        pillEl.setAttribute('role', 'status');
        pillEl.style.cssText = 'position:fixed;left:12px;bottom:12px;z-index:60;' +
          'background:#12161dcc;color:#dfe6ee;border:1px solid #2a323f;border-radius:999px;' +
          'padding:7px 13px;font:600 12px/1.3 system-ui,sans-serif;letter-spacing:.01em;' +
          'pointer-events:none;max-width:70vw;';
        document.body.appendChild(pillEl);
      }
      pillEl.textContent = text;
      pillEl.style.display = show === false ? 'none' : 'block';
    } catch (e) { /* cosmetic only */ }
  }

  /* ------------------------------------------------------------ http */
  const cookie = (name) => (document.cookie.match(new RegExp('(?:^|; )' + name + '=([^;]*)')) || [])[1] || '';
  async function ensureCsrf() {
    if (cookie('futa_csrf')) return;
    try { await fetch(API + '/me', { credentials: 'include', headers: { Accept: 'application/json' } }); } catch (e) { /* offline */ }
  }
  async function post(path, body) {
    await ensureCsrf();
    const headers = { Accept: 'application/json' };
    const tok = cookie('futa_csrf');
    if (tok) headers['X-CSRF-Token'] = tok;
    if (body !== undefined) headers['Content-Type'] = 'application/json';
    const res = await fetch(API + path, {
      method: 'POST', credentials: 'include', headers,
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
    let data = null;
    try { data = await res.json(); } catch (e) { /* non-json */ }
    return { status: res.status, data };
  }

  /* ------------------------------------------------------------ remote players */
  const num = (v) => (Number.isFinite(Number(v)) ? Number(v) : 0);
  const clampPos = (v) => Math.max(-6000, Math.min(6000, v));

  /* Name label: canvas text (fillText — user text never touches innerHTML). */
  function makeLabel(name) {
    const c = document.createElement('canvas');
    let ctx = c.getContext('2d');
    const font = '700 30px system-ui, -apple-system, sans-serif';
    ctx.font = font;
    const w = Math.min(420, Math.ceil(ctx.measureText(name).width) + 26);
    c.width = w; c.height = 46;                       // resizing resets state:
    ctx = c.getContext('2d');
    ctx.font = font;
    ctx.fillStyle = 'rgba(10,13,17,0.72)';
    ctx.beginPath();
    if (ctx.roundRect) ctx.roundRect(0, 0, w, 46, 12); else ctx.rect(0, 0, w, 46);
    ctx.fill();
    ctx.fillStyle = '#eef1f5';
    ctx.textBaseline = 'middle';
    ctx.fillText(name, 13, 24);
    const tex = new THREE.CanvasTexture(c);
    tex.minFilter = THREE.LinearFilter;
    const spr = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthTest: false }));
    spr.scale.set((w / 46) * 1.05, 1.05, 1);
    spr.position.y = 2.1;
    spr.renderOrder = 999;
    return spr;
  }

  async function fetchLook(username) {
    const res = await fetch(API + '/players/' + encodeURIComponent(username) + '/avatar', {
      credentials: 'include', headers: { Accept: 'application/json' },
    });
    if (!res.ok) return null;
    try { const j = await res.json(); return j.look || null; } catch (e) { return null; }
  }

  async function ensureRemote(username, x, z) {
    if (st.remote.has(username) || st.pending.has(username)) return;
    if (st.remote.size + st.pending.size >= MAX_AVATARS) return;   // over budget: skip (labels-only mode comes with quality settings)
    st.pending.add(username);
    try {
      const look = await fetchLook(username);
      if (!st.remote.has(username) && !inRoster(username)) return; // left while we fetched
      const group = new THREE.Group();
      const label = makeLabel(username);
      group.add(label);
      let avatar = null;
      if (look && window.FutaAvatar) {
        try { avatar = window.FutaAvatar.create(look, { lod: 1, material: 'lambert' }); } catch (e) { console.warn('[realtime] avatar build failed', e); }
        if (avatar) group.add(avatar.group);
      }
      group.position.set(clampPos(x), 0, clampPos(z));
      window.FUTA.addToScene(group);
      st.remote.set(username, {
        username, group, label, avatar,
        x: clampPos(x), z: clampPos(z),     // displayed position
        samples: [],                         // [{t,x,z}] incoming broadcasts
        pose: 'idle', yaw: 0, lastSeen: 0,
      });
      pillStatus();
    } finally {
      st.pending.delete(username);
    }
  }

  function removeRemote(username) {
    const r = st.remote.get(username);
    if (!r) return;
    try { window.FUTA.removeFromScene(r.group); } catch (e) { /* already gone */ }
    if (r.avatar && typeof r.avatar.dispose === 'function') { try { r.avatar.dispose(); } catch (e) { /* best effort */ } }
    st.remote.delete(username);
    pillStatus();
  }

  function inRoster(username) {
    for (const m of st.present.values()) if (m.has(username)) return true;
    return false;
  }

  /* Union of every joined cell's presence roster (minus ourselves). */
  function reconcile() {
    const alive = new Set();
    for (const m of st.present.values()) {
      for (const u of m.keys()) if (u !== st.username) alive.add(u);
    }
    for (const u of st.remote.keys()) if (!alive.has(u)) removeRemote(u);
    for (const u of alive) {
      let x = 0, z = 0, seen = false;
      for (const m of st.present.values()) { const meta = m.get(u); if (meta && (meta.x || meta.z || !seen)) { x = meta.x; z = meta.z; seen = true; } }
      ensureRemote(u, x, z);
    }
    pillStatus();
  }

  function pillStatus() {
    if (!st.started) return;
    const n = st.remote.size;
    pill('● Live — ' + n + ' nearby', true);
  }

  /* ------------------------------------------------------------ zone channels */
  const cellKey = (x, z) => Math.floor(x / CELL) + ':' + Math.floor(z / CELL);

  function presenceMeta() {
    return {
      username: st.username,
      x: Math.round(st.pos.x * 10) / 10,
      z: Math.round(st.pos.z * 10) / 10,
    };
  }

  function onSync(key, ch) {
    const state = typeof ch.presenceState === 'function' ? ch.presenceState() : {};
    const map = new Map();
    for (const arr of Object.values(state)) {
      for (const p of arr || []) {
        const u = p && p.username;
        if (typeof u !== 'string' || !NAME_RE.test(u)) continue;   // never trust the browser
        map.set(u, { x: clampPos(num(p.x)), z: clampPos(num(p.z)) });
      }
    }
    st.present.set(key, map);
    reconcile();
  }

  function onMove(payload) {
    if (!payload || typeof payload !== 'object') return;
    const u = payload.u;
    if (typeof u !== 'string' || !NAME_RE.test(u) || u === st.username) return;
    const x = clampPos(num(payload.x)), z = clampPos(num(payload.z));
    let r = st.remote.get(u);
    if (!r) { ensureRemote(u, x, z); r = st.remote.get(u); if (!r) return; }
    const now = performance.now();
    r.samples.push({ t: now, x, z });
    while (r.samples.length > 12 || (r.samples.length > 2 && r.samples[1].t < now - 3000)) r.samples.shift();
    r.lastSeen = now;
  }

  function joinCell(key) {
    if (!st.client || st.cells.has(key)) return;
    const ch = st.client.channel('zone:' + key, { config: { private: true } });
    st.cells.set(key, ch);
    ch.on('presence', { event: 'sync' }, () => onSync(key, ch));
    ch.on('broadcast', { event: 'move' }, ({ payload }) => onMove(payload));
    ch.subscribe((status) => {
      if (status === 'SUBSCRIBED') {
        st.up.add(key);
        if (key === st.ownKey) { try { ch.track(presenceMeta()); st.tracked = { x: st.pos.x, z: st.pos.z }; st.trackedAt = performance.now(); } catch (e) { console.warn('[realtime] track failed', e); } }
        sendMove(true);
      } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
        st.up.delete(key);
      }
    });
  }

  async function leaveCell(key) {
    const ch = st.cells.get(key);
    if (!ch) return;
    st.cells.delete(key);
    st.up.delete(key);
    st.present.delete(key);
    try { await ch.unsubscribe(); if (st.client) st.client.removeChannel(ch); } catch (e) { /* fine */ }
  }

  async function updateCells() {
    const key = cellKey(st.pos.x, st.pos.z);
    if (key !== st.ownKey) {
      const old = st.cells.get(st.ownKey);
      if (old) { try { old.untrack(); } catch (e) { /* fine */ } }
      st.ownKey = key;
      const own = st.cells.get(key);
      if (own && st.up.has(key)) { try { own.track(presenceMeta()); st.trackedAt = performance.now(); } catch (e) { /* fine */ } }
    } else if (!st.ownKey) {
      st.ownKey = key;
    }
    const parts = key.split(':'), cx = Number(parts[0]), cz = Number(parts[1]);
    const want = new Set();
    for (let dx = -1; dx <= 1; dx++) for (let dz = -1; dz <= 1; dz++) want.add((cx + dx) + ':' + (cz + dz));
    for (const k of [...st.cells.keys()]) if (!want.has(k)) await leaveCell(k);
    for (const k of want) if (!st.cells.has(k)) joinCell(k);
  }

  function sendMove(force) {
    const ch = st.cells.get(st.ownKey);
    if (!ch || !st.up.has(st.ownKey)) return;
    const s = st.sent;
    if (!force && s && Math.abs(s.x - st.pos.x) < 0.05 && Math.abs(s.z - st.pos.z) < 0.05) return;
    st.sent = { x: st.pos.x, z: st.pos.z };
    try {
      ch.send({
        type: 'broadcast', event: 'move',
        payload: { u: st.username, x: Math.round(st.pos.x * 10) / 10, z: Math.round(st.pos.z * 10) / 10 },
      });
    } catch (e) { /* socket reconnecting; next tick retries */ }
  }

  /* ------------------------------------------------------------ rendering */
  /* Render INTERP_MS behind the newest sample; lerp between neighbours. */
  function lerpSamples(r, now) {
    const t = now - INTERP_MS;
    const s = r.samples;
    if (!s.length) return null;
    if (t <= s[0].t) return s[0];
    if (t >= s[s.length - 1].t) return s[s.length - 1];
    for (let i = 0; i < s.length - 1; i++) {
      const a = s[i], b = s[i + 1];
      if (t >= a.t && t <= b.t) {
        const k = (t - a.t) / Math.max(1, b.t - a.t);
        return { x: a.x + (b.x - a.x) * k, z: a.z + (b.z - a.z) * k };
      }
    }
    return s[s.length - 1];
  }

  function onFrame(dt) {
    if (!st.started) return;
    const now = performance.now();
    for (const r of st.remote.values()) {
      const p = lerpSamples(r, now);
      if (!p) continue;
      const dx = p.x - r.x, dz = p.z - r.z;
      const dist = Math.hypot(dx, dz);
      r.x = p.x; r.z = p.z;
      r.group.position.x = p.x;
      r.group.position.z = p.z;
      if (dist > 0.002) {
        r.yaw = Math.atan2(dx, dz);           // model faces +z (verify in avatar/lab.html; flip atan2 if it walks backwards)
        r.group.rotation.y = r.yaw;
      }
      const moving = dist / Math.max(dt, 0.001) > 0.4;
      const pose = moving ? 'walk' : 'idle';
      if (r.avatar) {
        if (r.pose !== pose) { r.pose = pose; try { r.avatar.setPose(pose); } catch (e) { /* ignore */ } }
        if (typeof r.avatar.update === 'function') { try { r.avatar.update(dt); } catch (e) { /* ignore */ } }
      }
    }
  }

  function onCamera(s) {
    if (!s) return;
    st.pos.x = s.x; st.pos.z = s.z;
    if (!st.started) return;
    updateCells();
    /* presence re-announce so late joiners can place a standing player */
    const now = performance.now();
    const tx = st.tracked;
    const movedFar = !tx || Math.hypot(s.x - tx.x, s.z - tx.z) >= TRACK_M;
    if (movedFar && now - st.trackedAt >= TRACK_MS) {
      const own = st.cells.get(st.ownKey);
      if (own && st.up.has(st.ownKey)) {
        try { own.track(presenceMeta()); st.tracked = { x: s.x, z: s.z }; st.trackedAt = now; } catch (e) { /* fine */ }
      }
    }
  }

  /* ------------------------------------------------------------ handshake / lifecycle */
  function decodeJwt(token) {
    try { return JSON.parse(atob(String(token).split('.')[1].replace(/-/g, '+').replace(/_/g, '/'))); } catch (e) { return null; }
  }

  /* → 'ok' | 'signin' (retry later) | 'anon' (server has no realtime; stop for good) */
  async function handshake() {
    pill('◌ Connecting…', true);
    const r = await post('/realtime/token');
    if (r.status === 401) { pill('Sign in to see other players', true); return 'signin'; }
    if (r.status === 503) { pill('', false); return 'anon'; }
    if (r.status !== 200 || !r.data || !r.data.token) throw new Error('token HTTP ' + r.status);
    const claims = decodeJwt(r.data.token);
    const username = claims && claims.user_metadata && claims.user_metadata.username;
    if (!NAME_RE.test(String(username || ''))) { pill('Finish your profile to appear in the world', true); return 'signin'; }
    if (!r.data.url || !r.data.anonKey) { pill('', false); return 'anon'; }
    st.username = username;
    st.token = r.data.token;
    st.url = r.data.url;
    st.anonKey = r.data.anonKey;
    return 'ok';
  }

  async function teardown() {
    if (st.moveTimer) { clearInterval(st.moveTimer); st.moveTimer = null; }
    if (st.refreshTimer) { clearInterval(st.refreshTimer); st.refreshTimer = null; }
    for (const u of [...st.remote.keys()]) removeRemote(u);
    st.present.clear();
    st.up.clear();
    if (st.client) {
      try { await st.client.removeAllChannels(); } catch (e) { /* fine */ }
      try { st.client.realtime.disconnect(); } catch (e) { /* fine */ }
    }
    st.client = null;
    st.cells.clear();
    st.ownKey = null;
    st.sent = null;
    st.tracked = null;
    st.started = false;
  }

  function scheduleRebuild(ms) {
    if (st.rebuildTimer) return;
    const wait = ms || Math.min(60000, 2000 * Math.pow(2, st.attempt)); // exponential backoff, capped 60 s
    st.rebuildTimer = setTimeout(() => { st.rebuildTimer = null; rebuild(); }, wait);
  }

  async function start() {
    if (st.started) return;
    let mode;
    try { mode = await handshake(); } catch (e) { console.warn('[realtime] handshake failed', e); mode = 'retry'; }
    if (mode === 'anon') return;                      // not configured on this deploy; stay quiet
    if (mode === 'signin') { st.attempt++; scheduleRebuild(60000); return; } // they may sign in later
    if (mode === 'retry') { st.attempt++; scheduleRebuild(); return; }
    try {
      const mod = await import('https://esm.sh/@supabase/supabase-js@2.45.0'); // ESM CDN: no build step
      st.client = mod.createClient(st.url, st.anonKey, {
        global: { headers: { Authorization: 'Bearer ' + st.token } },
      });
    } catch (e) {
      console.warn('[realtime] supabase-js load failed', e);
      st.attempt++;
      scheduleRebuild();
      return;
    }
    st.started = true;
    st.attempt = 0;
    await updateCells();
    if (st.moveTimer) clearInterval(st.moveTimer);
    st.moveTimer = setInterval(() => sendMove(false), MOVE_MS);
    if (st.refreshTimer) clearInterval(st.refreshTimer);
    st.refreshTimer = setInterval(() => rebuild(), TOKEN_REFRESH_MS);
    pillStatus();
  }

  let rebuilding = false;
  async function rebuild() {
    if (rebuilding) return;
    rebuilding = true;
    try {
      await teardown();
      st.attempt = 0;
      await start();
    } catch (e) {
      console.warn('[realtime] rebuild failed', e);
      scheduleRebuild();
    } finally {
      rebuilding = false;
    }
  }

  /* ------------------------------------------------------------ boot */
  function init() {
    if (!window.FUTA) { console.warn('[realtime] window.FUTA missing — bridge.js did not load'); return; }
    window.FUTA.on('frame', onFrame);
    window.FUTA.on('cameraChange', onCamera);
    if (window.FUTA.isReady) start(); else window.FUTA.on('ready', start);
    window.addEventListener('online', () => { st.attempt = 0; rebuild(); });
    window.addEventListener('offline', () => pill('◌ Offline — waiting for network', true));
  }
  init();
})();
