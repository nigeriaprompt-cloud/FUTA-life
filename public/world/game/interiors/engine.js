/* ==========================================================================
   FutaEngine — the walking game inside ONE building.  Used by public/world/interior.html.

     FutaEngine.start({ canvas, building:{id,name,type}, tpl?, variant?, returnUrl? })  → Promise<engine>

   What it does
     · builds the room for the building (FutaTemplates.make) and lights it by Nigeria time (FutaClock)
     · the player walks (tap the floor), sits (tap a seat) and USES furniture (tap it → menu of activities → server `do_activity`)
     · NPCs (security, staff, students, cleaners …) appear/disappear by their `hours`, sit on seats, patrol, sweep, wander; tap one to talk
     · ATM panel only for banks (activity `atm`, venue `bank`) — the server enforces it too
     · stats bar (energy / hunger / mood / knowledge / pocket money)
     · real server (Supabase) when FUTA_CONFIG.demo === false, otherwise a local demo store (localStorage) with the same rules
     · live multiplayer room `int_<buildingId>_1` when the Supabase live layer is available (other players + seats)
   Page parameters (interior.html):  ?id=&n=&t=(Nigeria hour, preview)&d=(day 0-6)&tpl=(force template)&r=(return url)&fast=1&peers=1&hud=0
   Test hooks: window.__eng
   ========================================================================== */
(function (g) {
  'use strict';
  const T = g.THREE, FA = g.FutaAvatar, FI = g.FutaInteract, FT = g.FutaTemplates, Acts = g.FutaActs;
  const Q = new URLSearchParams(typeof location !== 'undefined' ? location.search : '');
  const hash = (s) => { let h = 2166136261; s = String(s); for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; };
  const mkRng = (seed) => { let s = (seed >>> 0) % 233280 || 1; return () => (s = (s * 9301 + 49297) % 233280) / 233280; };
  const el = (tag, css, html) => { const e = document.createElement(tag); if (css) e.style.cssText = css; if (html != null) e.innerHTML = html; return e; };
  const lagosDay = () => (Q.get('d') != null ? ((+Q.get('d') % 7) + 7) % 7 : new Date(Date.now() + 3600000).getUTCDay());

  /* ---------------- who is present when (Nigeria time) ---------------- */
  function present(rule, h, day) {
    const wk = day >= 1 && day <= 5, r = (a, b) => h >= a && h < b;
    switch (rule || 'always') {
      case 'always': return true; case 'work': return wk && r(8, 17); case 'class': return wk && r(8, 16); case 'service': return r(8, 20);
      case 'day': return r(7, 19); case 'study': return r(8, 22); case 'social': return r(11, 22); case 'home': return h >= 17 || h < 9 || day === 0 || day === 6;
      case 'event': return r(9, 20); case 'clean': return r(6, 9) || r(17, 19); case 'night': return h >= 19 || h < 7; default: return true;
    }
  }

  /* ---------------- game API: real server or local demo (same shapes) ---------------- */
  const FRIENDLY = { wrong_place: 'You can’t do that here.', cooldown: 'Give it a moment before doing that again.', too_tired: 'You’re too tired for that — try sleeping.', insufficient_funds: 'Not enough money.', bad_amount: 'That amount is not allowed.', already_claimed: 'Already claimed today.', use_the_atm: 'Use the ATM for that.', auth_required: 'Please sign in again.', nothing_changed: 'That is already your hair.', hair_requires_salon: 'Hair is changed at a salon.', finish_sign_up: 'Finish creating your character first.', in_jail: 'You are in jail.' };
  const friendly = (e) => { const m = (e && e.message) || String(e); if ((m.indexOf('auth_required') >= 0 || m.indexOf('sign in again') >= 0) && g.FutaPhone && g.FutaPhone.requireLogin) g.FutaPhone.requireLogin('do that'); const k = Object.keys(FRIENDLY).find(x => m.indexOf(x) >= 0); return new Error(k ? FRIENDLY[k] : m); };
  function makeApi() {
    const cfg = g.FUTA_CONFIG || { demo: true }, real = !cfg.demo && g.FutaApi && g.FutaApi.rpc;
    if (real) {
      const rpc = (n, a) => g.FutaApi.rpc(n, a).catch(e => { throw friendly(e); });
      const realApi = { demo: false, enter: (b, v) => rpc('enter_building', { p_building: b, p_venue: v }), leave: () => rpc('leave_building'), stats: () => rpc('get_stats'), act: (id) => rpc('do_activity', { p_activity: id }), saveHair: (lk) => rpc('save_hair', { p_look: lk }),   // atomic on the server: takes the price AND saves hair/beard, or does neither
        wallet: () => rpc('get_wallet'), withdraw: (n) => rpc('atm_withdraw', { p_amount: n }), deposit: (n) => rpc('atm_deposit', { p_amount: n }), claimDaily: () => rpc('atm_claim_daily'),
        jail: () => g.FutaApi.rpc('get_jail'),
        vault: { status: () => g.FutaApi.rpc('vault_status'), start: () => g.FutaApi.rpc('vault_start'), answer: (id, ans) => g.FutaApi.rpc('vault_answer', { p_attempt: id, p_answer: ans }), giveup: (id) => g.FutaApi.rpc('vault_giveup', { p_attempt: id }) } };
      /* GUESTS (not signed in) may walk in and look around, but every real action asks them to sign in first (Ph.requireLogin). Reads return neutral values. */
      let who = null; const isGuest = () => who || (who = g.FutaApi.me().then(r => !(r && r.user)).catch(() => true));
      if (g.FutaApi.onAuth) g.FutaApi.onAuth(() => { who = null; });
      const gate = (why) => { if (g.FutaPhone && g.FutaPhone.requireLogin) g.FutaPhone.requireLogin(why); return Promise.reject(new Error('Sign in to ' + why + '.')); };
      const NEUTRAL = { enter: null, leave: null, jail: { inJail: false, secsLeft: 0 }, stats: { energy: 100, hunger: 100, mood: 100, knowledge: 0, venue: null, building: null, wallet: { pocket: 0, bank: 0, canClaimDaily: false } }, wallet: { pocket: 0, bank: 0, canClaimDaily: false } };
      const WHY = { act: 'do activities', saveHair: 'change your look', withdraw: 'use the ATM', deposit: 'use the ATM', claimDaily: 'claim your daily money' };
      const guard = (name, fn, why) => (...a) => isGuest().then(gu => gu ? (why ? gate(why) : Promise.resolve(NEUTRAL[name])) : fn(...a));
      const out = { demo: false };
      Object.keys(realApi).forEach(k => { if (k === 'demo' || k === 'vault') return; out[k] = guard(k, realApi[k], WHY[k]); });
      out.vault = { status: (...a) => isGuest().then(gu => gu ? { vault: 'unknown' } : realApi.vault.status(...a)) };
      ['start', 'answer', 'giveup'].forEach(k => { out.vault[k] = (...a) => isGuest().then(gu => gu ? gate('try the vault') : realApi.vault[k](...a)); });
      return out;
    }
    const KEY = 'futa.demo.play'; let S = null; try { S = JSON.parse(localStorage.getItem(KEY)); } catch (e) { /* none */ }
    S = S || { energy: 100, hunger: 80, mood: 60, knowledge: 0, pocket: 5000, bank: 20000, daily: '', cd: {}, venue: null, building: null, at: Date.now() };
    const save = () => { try { localStorage.setItem(KEY, JSON.stringify(S)); } catch (e) { /* private mode */ } };
    const today = () => new Date(Date.now() + 3600000).toISOString().slice(0, 10);
    const decay = () => { const d = (Acts.data && Acts.data.decay) || { hungerPerMin: .16, energyPerMin: .1, floor: 5 }, m = (Date.now() - S.at) / 60000; S.at = Date.now(); S.hunger = Math.min(S.hunger, Math.max(d.floor, S.hunger - d.hungerPerMin * m)); S.energy = Math.min(S.energy, Math.max(d.floor, S.energy - d.energyPerMin * m)); };
    const wallet = () => ({ pocket: S.pocket, bank: S.bank, canClaimDaily: S.daily !== today() });
    const stats = () => { decay(); save(); return { energy: Math.round(S.energy), hunger: Math.round(S.hunger), mood: Math.round(S.mood), knowledge: S.knowledge, venue: S.venue, building: S.building, wallet: wallet() }; };
    const bank = (fn) => () => { if (S.venue !== 'bank') return Promise.reject(friendly({ message: 'wrong_place' })); return Promise.resolve(fn()); };
    const VC = g.FutaVaultCore, isTeen = async () => { if (Q.get('teen')) return Q.get('teen') === '1'; try { const r = await g.FutaApi.me(); return !!(r && r.user && r.user.isTeen); } catch (e) { return false; } };
    const vdemo = VC ? VC.createDemo({ pay: (amt) => { S.pocket += amt; save(); }, isTeen }) : null;
    return { demo: true,
      jail: () => { const n = vdemo ? vdemo.jailSecs() : 0; return Promise.resolve({ inJail: n > 0, secsLeft: n, reason: 'vault' }); }, vault: vdemo,
      enter: (b, v) => { if (vdemo && vdemo.jailSecs() > 0) return Promise.reject(friendly({ message: 'in_jail' })); S.venue = v; S.building = b; save(); return Promise.resolve(); }, leave: () => { S.venue = null; S.building = null; save(); return Promise.resolve(); }, stats: () => Promise.resolve(stats()),
      act(id) {
        const a = Acts.get(id); if (!a) return Promise.reject(friendly({ message: 'bad_activity' })); decay();
        if (!S.venue || a.venues.indexOf(S.venue) < 0) return Promise.reject(friendly({ message: 'wrong_place' }));
        if (a.ui === 'atm') return Promise.reject(friendly({ message: 'use_the_atm' }));
        const last = S.cd[id]; if (last && Date.now() - last < (a.cooldown || 0) * 1000) return Promise.reject(friendly({ message: 'cooldown' }));
        if ((a.energy || 0) < 0 && S.energy + a.energy < 0) return Promise.reject(friendly({ message: 'too_tired' }));
        if ((a.cash || 0) < 0 && S.pocket < -a.cash) return Promise.reject(friendly({ message: 'insufficient_funds' }));
        const cl = (v) => Math.max(0, Math.min(100, v)); S.energy = cl(S.energy + (a.energy || 0)); S.hunger = cl(S.hunger + (a.hunger || 0)); S.mood = cl(S.mood + (a.mood || 0)); S.knowledge += (a.knowledge || 0); S.pocket += (a.cash || 0); S.cd[id] = Date.now(); save(); return Promise.resolve(stats());
      },
      async saveHair(lk) { const s = await this.act('get_hair'); const r = await g.FutaApi.saveAvatar(lk); return { look: r.look, stats: s }; },   // demo: same order of checks as the server
      wallet: () => Promise.resolve(wallet()),
      withdraw: (n) => bank(() => { if (n <= 0 || n > S.bank) throw friendly({ message: n > S.bank ? 'insufficient_funds' : 'bad_amount' }); S.bank -= n; S.pocket += n; save(); return wallet(); })(),
      deposit: (n) => bank(() => { if (n <= 0 || n > S.pocket) throw friendly({ message: n > S.pocket ? 'insufficient_funds' : 'bad_amount' }); S.pocket -= n; S.bank += n; save(); return wallet(); })(),
      claimDaily: () => bank(() => { if (S.daily === today()) throw friendly({ message: 'already_claimed' }); S.daily = today(); S.bank += 1000; save(); return wallet(); })()
    };
  }

  /* ---------------- small things NPCs say ---------------- */
  const LINES = {
    security: ['Good day. Please keep the noise down.', 'ID ready? Just joking — enjoy your visit.', 'Anything wrong, you call me.', 'No running inside, please.'],
    cleaner: ['Mind the wet floor!', 'Excuse me, I am sweeping here.', 'Please use the bin, o.', 'Na work we dey do, boss.'],
    lecturer: ['Read ahead for the next class.', 'Come and see me during office hours.', 'Is that your assignment? Submit it online.'],
    student: ['Abeg, who has the past questions?', 'Exam is close, I never read anything.', 'Light just went again!', 'Wetin dey happen?', 'See you for the next class.'],
    staff: ['How can I help you?', 'Please join the queue.', 'Come back tomorrow, we are closing soon.', 'Welcome!'],
    teller: ['Welcome to the bank. Use the ATM or see me at the counter.', 'Your account is in good standing.'],
    cook: ['Food is hot — come and eat!', 'Pepper too much? Joking, it is just right.'], trader: ['Oya buy something, na fresh!', 'For you, special price.'], vendor: ['Fresh stock today!', 'Buy small, buy big, na the same love.'],
    nurse: ['Please sit and wait to be called.', 'Stay hydrated.'], pharmacist: ['Take it after food.', 'No self-medication, please.'],
    visitor: ['This place is lovely.', 'I came to see the exhibits.'],
    'vault-guard': ['That vault has never been opened by force. Not once.', 'Try anything and you spend the night in a cell.', 'Only this bank has a vault like this one.', 'I have been standing here since morning. Do not make me chase you.']
  };
  const loadScript = (src) => new Promise((res, rej) => { if (document.querySelector('script[data-lazy="' + src + '"]')) return res(); const e = document.createElement('script'); e.src = src; e.dataset.lazy = src; e.onload = res; e.onerror = () => rej(new Error('Could not load ' + src)); document.head.appendChild(e); });
  const greet = () => { const h = g.FutaClock.hour(); return h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening'; };

  /* ======================================================================= */
  async function start(opt) {
    const building = opt.building || {}, canvas = opt.canvas, api = makeApi(), bid = building.id || building.name || 'preview';
    if (Q.get('t')) g.FutaClock.setFixed(+Q.get('t'));
    if (!Q.get('nojail')) {                                   // arrested? then this page shows the jail cell instead of the building (the server decides, a refresh cannot escape it)
      const jl = await api.jail().catch(() => null);
      if (jl && jl.inJail) { await loadScript('game/interiors/jail.js'); return g.FutaJail.start({ canvas, secs: jl.secsLeft, len: 180, reason: jl.reason, api, returnUrl: opt.returnUrl }); }
    }
    const built = FT.make(building, { id: opt.tpl, variant: opt.variant }), W = built.w, D = built.d, venue = built.venue, spec = built.spec;
    const stage = g.FutaStage.create({ canvas }); stage.setRoom(built); stage.applySky(g.FutaClock.sky()); addEventListener('resize', () => stage.resize());
    const scene = stage.scene, lowEnd = typeof matchMedia !== 'undefined' && matchMedia('(pointer:coarse)').matches;
    document.title = built.title + ' — FUTAlife';

    /* ---------- HUD ---------- */
    const hudOn = Q.get('hud') !== '0', root = el('div', 'position:fixed;inset:0;pointer-events:none;font:14px system-ui,sans-serif;color:#fff;z-index:20;' + (hudOn ? '' : 'display:none'));
    document.body.appendChild(root);
    const top = el('div', 'position:absolute;left:0;right:0;top:0;display:flex;gap:8px;align-items:center;padding:calc(8px + env(safe-area-inset-top)) 10px 8px;pointer-events:none');
    const title = el('div', 'background:#0b1022cc;border-radius:12px;padding:7px 11px;font-weight:700;backdrop-filter:blur(6px)', (spec.icon || '') + ' ' + built.title), clockEl = el('div', 'background:#0b1022cc;border-radius:12px;padding:7px 10px;font-size:13px');
    const leaveBtn = el('button', 'margin-left:auto;pointer-events:auto;background:#c2410c;color:#fff;border:0;border-radius:12px;padding:9px 14px;font:600 14px system-ui', 'Leave ➜');
    top.append(title, clockEl, leaveBtn); root.appendChild(top);
    const bars = el('div', 'position:absolute;left:10px;bottom:calc(10px + env(safe-area-inset-bottom));background:#0b1022cc;border-radius:12px;padding:8px 11px;display:grid;grid-template-columns:auto 70px;gap:3px 8px;align-items:center;font-size:12px');
    root.appendChild(bars);
    const barDefs = [['⚡', 'energy', '#facc15'], ['🍲', 'hunger', '#fb923c'], ['😊', 'mood', '#4ade80'], ['📘', 'knowledge', '#60a5fa']], barEl = {};
    barDefs.forEach(([ic, k, col]) => { const lab = el('span', '', ic), track = el('div', 'height:7px;border-radius:4px;background:#ffffff26;overflow:hidden'), fill = el('div', 'height:100%;width:0;background:' + col + ';transition:width .4s'); track.appendChild(fill); barEl[k] = { fill, lab }; bars.append(lab, track); });
    const cash = el('div', 'grid-column:1/3;font-weight:700;margin-top:2px', '₦ —'); bars.appendChild(cash);
    const toastEl = el('div', 'position:absolute;left:50%;top:calc(58px + env(safe-area-inset-top));transform:translateX(-50%);background:#111827ee;border-radius:12px;padding:9px 14px;max-width:86vw;text-align:center;opacity:0;transition:opacity .25s'); root.appendChild(toastEl);
    let toastT = 0; const toast = (m) => { toastEl.innerHTML = m; toastEl.style.opacity = 1; clearTimeout(toastT); toastT = setTimeout(() => { toastEl.style.opacity = 0; }, 3200); };
    const hint = el('div', 'position:absolute;right:10px;bottom:calc(10px + env(safe-area-inset-bottom));max-width:44vw;background:#0b1022aa;border-radius:12px;padding:7px 10px;font-size:12px;opacity:.9;transition:opacity 1s', 'Tap the floor to walk · tap glowing objects to use them · tap people to talk · drag to look around'); root.appendChild(hint); setTimeout(() => { hint.style.opacity = 0; }, 9000);
    const sheet = el('div', 'position:absolute;left:0;right:0;bottom:0;max-width:460px;margin:0 auto;background:#10172af2;border-radius:18px 18px 0 0;padding:14px 14px calc(14px + env(safe-area-inset-bottom));pointer-events:auto;display:none;box-shadow:0 -8px 30px #0008'); root.appendChild(sheet);
    const prog = el('div', 'position:absolute;left:50%;bottom:calc(86px + env(safe-area-inset-bottom));transform:translateX(-50%);width:min(320px,80vw);background:#0b1022ee;border-radius:12px;padding:10px 12px;display:none'); root.appendChild(prog);
    const bubble = el('div', 'position:absolute;transform:translate(-50%,-100%);background:#fff;color:#111;border-radius:12px;padding:6px 10px;max-width:220px;font-size:13px;display:none;box-shadow:0 4px 14px #0006'); root.appendChild(bubble);

    function applyStats(s) {
      if (!s) return; barDefs.forEach(([, k]) => { const v = s[k]; barEl[k].fill.style.width = (k === 'knowledge' ? Math.min(100, v % 100 || (v ? 100 : 0)) : Math.max(0, Math.min(100, v))) + '%'; barEl[k].lab.title = k + ': ' + v; });
      if (s.wallet) cash.innerHTML = '₦' + Number(s.wallet.pocket).toLocaleString() + ' <span style="opacity:.6;font-weight:400">pocket</span>';
    }
    const refreshStats = () => api.stats().then(applyStats).catch(() => { });

    /* ---------- player ---------- */
    let look = null; try { if (g.FutaApi && g.FutaApi.me) { const r = await g.FutaApi.me(); look = r && r.user && r.user.avatar; } } catch (e) { /* not signed in: random look */ }
    let hasLook = !!look; const meUser = { id: 'me', username: 'you' }; look = look || FA.look.random('f', 7);
    const mkMe = (lk) => { const m = FA.create(lk, { lod: lowEnd ? 1 : 0, material: lowEnd ? 'lambert' : 'standard' }); m.group.rotation.order = 'YXZ'; return m; };
    let me = mkMe(look); scene.add(me.group);
    /* wardrobe: swap the player's model when the saved look changes (the phone's Clothes app saved a new outfit) */
    function swapLook(nl) { if (!nl || JSON.stringify(nl) === JSON.stringify(look)) return false; try { const nm = mkMe(nl); nm.setPose(P.anim === 'walk' ? 'idle' : P.anim); scene.add(nm.group); scene.remove(me.group); me.dispose && me.dispose(); me = nm; look = nl; if (P.anim === 'walk') P.anim = 'idle'; return true; } catch (e) { console.warn('could not apply new look', e); return false; } }
    /* tell other players in the room about the new look (real mode only: the server keeps profiles.avatar_hash up to date) */
    async function announceLook() { if (!live || !live.setLook || api.demo || !g.FutaApi || !g.FutaApi.sb) return; try { const r = await g.FutaApi.me(), q = await g.FutaApi.sb().from('profiles').select('avatar_hash').eq('id', r.user.id).single(); if (q.data) live.setLook(q.data.avatar_hash); } catch (e) { /* they will see it on their next refresh */ } }
    const P = { x: built.spawn.x, z: built.spawn.z, y: 0, ry: built.spawn.face, anim: 'idle', path: null, done: null };
    const seatY = (x, z) => { const s = built.seats.find(q => Math.hypot(q.x - x, q.z - z) < .06); return s ? Math.max(0, (s.y || .46) - .46) : 0; };
    const player = {
      get pos() { return P; },
      followPath(p, done) { if (P.done) { const d = P.done; P.done = null; d(false); } P.path = p.slice(1); P.done = done; if (!P.path.length) { const d = P.done; P.done = null; d && d(true); } },
      face(r) { P.ry = r; }, setPose(n) { P.anim = n; me.setPose(n); }, teleport(x, z) { P.x = x; P.z = z; P.y = seatY(x, z); P.path = null; }
    };

    if (g.FutaPhone && g.FutaPhone.on) g.FutaPhone.on('user', (u) => { if (u && u.avatar) { hasLook = true; if (swapLook(u.avatar)) announceLook(); } });

    /* ---------- NPCs ---------- */
    const npcSpecsCount = () => ((spec.npcs || []).concat((built.ctx && built.ctx.extraNpcs) || [])).reduce((a, s) => a + (s.n || 1), 0), npcs = [], occupied = new Set(), lodN = lowEnd || npcSpecsCount() > 24 ? 2 : 1;
    const npcSpecs = (spec.npcs || []).concat((built.ctx && built.ctx.extraNpcs) || []);
    npcSpecs.forEach((s, gi) => { for (let i = 0; i < (s.n || 1); i++) npcs.push({ s, gi, i, seed: hash(bid + ':' + gi + ':' + i), av: null, seat: null, st: null }); });
    const SITPOSE = { type: 'type', eat: 'eat', watch: 'watch', browse: 'browse', sit: 'sit' };
    const freeSeat = (it) => { const names = it.s.sit || []; const rr = mkRng(it.seed); const c = built.seats.filter(q => !occupied.has(q.id) && names.indexOf(q.piece.name) >= 0); return c.length ? c[Math.floor(rr() * c.length)] : null; };
    const randFree = (zone, rr) => { for (let k = 0; k < 30; k++) { const x = zone[0] + rr() * (zone[2] - zone[0]), z = zone[1] + rr() * (zone[3] - zone[1]), [ci, cj] = built.grid.cell(x, z); if (ci >= 0 && cj >= 0 && ci < built.grid.w && cj < built.grid.h && !built.grid.blocked[cj * built.grid.w + ci]) return { x, z }; } return null; };
    function spawn(it) {
      const s = it.s, rr = mkRng(it.seed), b = s.beh; let x = 1, z = 1, ry = 0, y = 0, pose = s.pose || 'idle', seat = null;
      if (b === 'post' || b === 'stand' || b === 'teach') { const a = (s.at || [[W / 2, D / 2, 0]])[it.i % (s.at || [1]).length]; x = a[0]; z = a[1]; ry = a[2] || 0; }
      else if (b === 'sit') { seat = freeSeat(it); if (!seat) return false; occupied.add(seat.id); x = seat.x; z = seat.z; ry = seat.face; y = Math.max(0, (seat.y || .46) - .46); pose = SITPOSE[s.pose] || 'sit'; }
      else if (b === 'patrol') { const p = s.path[(it.i * 2) % s.path.length]; x = p[0]; z = p[1]; it.st = { k: (it.i * 2) % s.path.length, wait: rr() * 2 }; }
      else if (b === 'sweep' || b === 'wander') { const zone = s.zone || [1, 1, W - 1, D - 2], p = randFree(zone, rr); if (!p) return false; x = p.x; z = p.z; it.st = { wait: rr() * 3 }; }
      else return false;
      const av = FA.npc.create(s.role, it.seed % 100000, { lod: lodN }); av.mesh.userData.npc = it; av.group.position.set(x, y, z); av.group.rotation.y = ry; av.setPose(pose === 'idle' && b === 'wander' ? 'idle' : pose);
      scene.add(av.group); it.av = av; it.seat = seat; it.x = x; it.z = z; it.y = y; it.ry = ry; it.pose = pose; it.path = null; return true;
    }
    function despawn(it) { if (!it.av) return; scene.remove(it.av.group); it.av.dispose && it.av.dispose(); if (it.seat) occupied.delete(it.seat.id); it.av = null; it.seat = null; it.path = null; }
    function schedule() { const h = g.FutaClock.hour(), day = lagosDay(); npcs.forEach(it => { const want = present(it.s.hours, h, day); if (want && !it.av && !it.dead) { if (!spawn(it)) it.dead = true; } else if (!want && it.av) despawn(it); }); syncSeats(); }
    function stepNpc(it, dt) {
      const s = it.s, b = s.beh, av = it.av; if (!av) return;
      if (b === 'patrol' || b === 'sweep' || b === 'wander') {
        const st = it.st, rr = Math.random;
        if (it.path && it.path.length) {
          const t = it.path[0], dx = t.x - it.x, dz = t.z - it.z, d = Math.hypot(dx, dz), sp = (b === 'patrol' ? .9 : b === 'sweep' ? .6 : 1.1) * dt;
          if (d <= sp) { it.x = t.x; it.z = t.z; it.path.shift(); if (!it.path.length) { st.wait = 1 + rr() * 3; if (b === 'patrol') st.k = (st.k + 1) % s.path.length; } } else { it.x += dx / d * sp; it.z += dz / d * sp; it.ry = Math.atan2(dx, dz); }
          if (it.pose !== 'walk' && it.pose !== 'patrol') { it.pose = b === 'patrol' ? 'patrol' : 'walk'; av.setPose(it.pose); }
        } else {
          if (it.pose === 'walk' || it.pose === 'patrol') { it.pose = b === 'sweep' ? 'sweep' : 'idle'; av.setPose(it.pose); }
          st.wait -= dt; if (st.wait <= 0) {
            const tgt = b === 'patrol' ? { x: s.path[st.k][0], z: s.path[st.k][1] } : randFree(s.zone || [1, 1, W - 1, D - 2], mkRng((Math.random() * 1e6) | 0));
            if (b === 'patrol' && tgt && Math.hypot(tgt.x - it.x, tgt.z - it.z) < .4) { st.k = (st.k + 1) % s.path.length; st.wait = .3; return av.update(dt); }
            const p = tgt && FI.findPath(built.grid, { x: it.x, z: it.z }, tgt); if (p && p.length > 1) it.path = p.slice(1); else { st.wait = 2; if (b === 'patrol') st.k = (st.k + 1) % s.path.length; }
          }
        }
        av.group.position.set(it.x, 0, it.z); av.group.rotation.y = it.ry;
      }
      av.update(dt);
    }
    // seats taken by NPCs can't be clicked by the player
    const interior = { id: bid, room: venue, min: [0, 0], max: [W, D], cell: .25, blockers: built.blockers, seats: [], atms: [] };
    function syncSeats() { interior.seats = built.seats.filter(q => !occupied.has(q.id)).map(q => ({ id: q.id, x: q.x, z: q.z, face: q.face })); inter && inter.setInterior(interior); }

    /* ---------- live multiplayer (optional) ---------- */
    let live = null, remotes = null, liveUI = null;
    const entered = api.enter(bid, venue);   // building chat is members-only: the server must know we are inside BEFORE we join the room
    entered.catch(() => { });
    try {
      let sb = null, who = meUser;
      if (Q.get('peers') && g.FutaMockSb) sb = g.FutaMockSb.create(meUser.id, FA);
      else if (!api.demo && g.FutaLive && g.FutaApi && g.FutaApi.sb) { sb = g.FutaApi.sb(); const r = await g.FutaApi.me(); if (r && r.user) who = { id: r.user.id, username: r.user.username }; else sb = null; }   // guests walk around on their own (no live room)
      if (sb && g.FutaLive) { live = g.FutaLive.create({ sb, me: who }); remotes = g.FutaRemotes.create({ scene, live }); if (g.FutaLiveUI) liveUI = g.FutaLiveUI.mount(live, who, { bottom: 'calc(128px + env(safe-area-inset-bottom))' }); live.listenPersonal && live.listenPersonal(); entered.catch(() => { }).then(() => live.join(('int_' + bid + '_1').toLowerCase())).catch(() => { }); }
    } catch (e) { live = null; }
    const localLive = { seatTaken: () => false, sit: async () => true, stand: async () => { } };
    const inter = FI.create({ live: live || localLive, player, toast });
    schedule(); syncSeats();

    /* ---------- interactive furniture ---------- */
    const marks = []; const dia = (() => { const c = document.createElement('canvas'); c.width = c.height = 64; const x = c.getContext('2d'), gr = x.createRadialGradient(32, 32, 2, 32, 32, 30); gr.addColorStop(0, '#fff7c2'); gr.addColorStop(.45, '#ffd54a'); gr.addColorStop(1, 'rgba(255,200,40,0)'); x.fillStyle = gr; x.beginPath(); x.arc(32, 32, 30, 0, 7); x.fill(); const t = new T.CanvasTexture(c); return t; })();
    built.interactives.forEach(p => { if (!p.group) return; const bb = new T.Box3().setFromObject(p.group), sp = new T.Sprite(new T.SpriteMaterial({ map: dia, transparent: true, depthTest: false, opacity: .9 })); sp.scale.set(.32, .32, 1); sp.renderOrder = 9; sp.position.set((bb.min.x + bb.max.x) / 2, bb.max.y + .28, (bb.min.z + bb.max.z) / 2); sp.userData.base = sp.position.y; scene.add(sp); marks.push(sp); });
    const prettyName = (n) => ({ pcdesk: 'Computer', labbench: 'Lab bench', lab_station: 'Lab station', classdesk: 'Desk', wallshelf: 'Shelf', noticeboard: 'Notice board', dispenser: 'Water dispenser', atm: 'ATM', tvunit: 'TV', stove_pot: 'Cooking pot', kcounter: 'Kitchen counter', readdesk: 'Reading table' }[n] || (n.charAt(0).toUpperCase() + n.slice(1).replace(/_/g, ' ')));
    let busy = false, leaving = false;
    const closeSheet = () => { sheet.style.display = 'none'; sheet.innerHTML = ''; };
    function openSheet(p, ids) {
      sheet.innerHTML = ''; const head = el('div', 'display:flex;justify-content:space-between;align-items:center;margin-bottom:8px', '<b>' + prettyName(p.name) + '</b>'), x = el('button', 'background:none;border:0;color:#fff;font-size:24px;line-height:1', '×'); x.onclick = closeSheet; head.appendChild(x); sheet.appendChild(head);
      ids.forEach(id => { const a = Acts.get(id); if (!a) return; const b = el('button', 'display:flex;width:100%;justify-content:space-between;align-items:center;gap:10px;margin:6px 0;padding:12px;border-radius:12px;border:0;background:#243056;color:#fff;font:15px system-ui;text-align:left', '<span>' + (a.icon || '') + ' <b>' + a.label + '</b></span><small style="opacity:.8">' + (Acts.describe(a) || '') + '</small>'); b.onclick = () => runActivity(a, p); sheet.appendChild(b); });
      sheet.style.display = 'block';
    }
    const progress = (secs, label) => new Promise(res => { const ms = Math.max(300, (Q.get('fast') ? .15 : 1) * secs * 1000), t0 = performance.now(); prog.style.display = 'block'; prog.innerHTML = '<div style="margin-bottom:6px">' + label + '</div><div style="height:8px;border-radius:5px;background:#ffffff26;overflow:hidden"><div data-f style="height:100%;width:0;background:#fbbf24"></div></div>'; const f = prog.querySelector('[data-f]'); (function tick() { const k = Math.min(1, (performance.now() - t0) / ms); f.style.width = k * 100 + '%'; if (k < 1) requestAnimationFrame(tick); else { prog.style.display = 'none'; res(); } })(); });
    async function runActivity(a, p) {
      if (busy) return; closeSheet();
      if (a.ui === 'atm') { busy = true; me.setPose('phone'); P.anim = 'phone'; g.FutaInteract.openAtm(api, () => { busy = false; if (!inter.sitting) player.setPose('idle'); }); return; }
      if (a.id === 'wardrobe' && g.FutaPhone && g.FutaPhone.open) {   // wardrobe = the phone's Clothes app (live 3D preview + Clothes/Extras), opened right here in the room
        if (!hasLook) { if (g.FutaPhone && g.FutaPhone.requireLogin) g.FutaPhone.requireLogin('change your look'); else toast('Sign in and create your character first.'); return; }
        g.FutaPhone.show(true); g.FutaPhone.open('clothes', { hideOnClose: true }); return;   // Back / Home puts the phone away and returns you to the room
      }
      if (a.id === 'get_hair' && g.FutaSalon) {   // salon / barber: same hair choices as sign-up, filtered by gender; the server takes the price (do_activity 'get_hair')
        if (!hasLook) { if (g.FutaPhone && g.FutaPhone.requireLogin) g.FutaPhone.requireLogin('change your look'); else toast('Sign in and create your character first.'); return; }
        busy = true; if (g.FutaPhone && g.FutaPhone.isOpen()) g.FutaPhone.hide(true);
        try {
          g.FutaSalon.open({
            look, price: a.cash,
            save: async (nl) => { const r = await api.saveHair(nl); if (r && r.stats) applyStats(r.stats); if (g.FutaPhone && g.FutaPhone.refreshUser) { try { await g.FutaPhone.refreshUser(); } catch (e) { /* phone not ready */ } } return r && r.look ? r.look : nl; },   // one call: charge + save, so nobody pays without getting the haircut
            onDone: (nl) => { swapLook(nl); announceLook(); toast('💇 <b>Looking fresh!</b> Hair done.'); },
            onClose: () => { busy = false; }
          });
        } catch (e) { busy = false; toast('⚠️ Could not open the salon: ' + (e.message || e)); }
        return;
      }
      if (a.ui === 'creator') { if (typeof g.FUTA_OPEN_CREATOR === 'function') g.FUTA_OPEN_CREATOR(location.href); else { const cu = (g.FUTA_CONFIG && g.FUTA_CONFIG.creatorUrl) || '/world/game/onboarding/signup.html?stay&edit=look'; location.href = cu + (cu.indexOf('?') < 0 ? '?' : '&') + 'r=' + encodeURIComponent(location.pathname + location.search); } return; }
      busy = true;
      try {
        const s = await api.act(a.id), lying = a.pose === 'lie' && p.lie, sitting = inter.sitting, back = { x: P.x, z: P.z, y: P.y, ry: P.ry };
        if (lying) { P.x = p.lie.x; P.z = p.lie.z; P.y = p.lie.y; P.ry = p.lie.rot; P.lieRot = p.lie.rot; }
        const pose = Acts.rigPose(a.pose); me.setPose(pose); P.anim = pose;
        await progress(a.secs || 3, (a.icon || '') + ' ' + a.label + '…');
        if (lying) { P.x = back.x; P.z = back.z; P.y = back.y; P.ry = back.ry; P.lieRot = null; }
        player.setPose(sitting ? 'sit' : 'idle'); applyStats(s); toast((a.icon || '') + ' <b>' + a.label + '</b> ' + (Acts.describe(a) || ''));
      } catch (e) { P.lieRot = null; toast('⚠️ ' + (e.message || e)); player.setPose(inter.sitting ? 'sit' : 'idle'); }
      busy = false;
    }
    /* ---------- the Bank vault (only that building has a vaultdoor piece) ---------- */
    let led = null, pollT = 0, vaultUI = null;
    const doorPiece = built.interactives.find(p => p.name === 'vaultdoor');
    async function pollVault() { if (!api.vault || leaving) return; try { const st = await api.vault.status(); if (led) led.set(st.vault === 'robbery' ? 'robbery' : st.vault, st.refillSecs); } catch (e) { if (led) led.set('unknown'); } }
    if (doorPiece && g.FutaVaultDoor && api.vault) { led = g.FutaVaultDoor.attach(scene, doorPiece); led.set('unknown'); api.enter(bid, venue).catch(() => { }).then(() => { pollVault(); pollT = setInterval(pollVault, 8000); }); }
    async function useVault(p) {
      if (busy || leaving || !api.vault) return; const ok = await inter.walkTo(p.spot.x, p.spot.z); if (!ok) return; player.face(p.spot.face); player.setPose('idle'); busy = true;
      try { await loadScript('game/interiors/vault-puzzles.js'); await loadScript('game/interiors/vault-ui.js'); } catch (e) { busy = false; toast('⚠️ ' + e.message); return; }
      vaultUI = g.FutaVaultUI.open({ api: api.vault, toast,
        onClose: () => { busy = false; vaultUI = null; refreshStats(); pollVault(); },
        onWin: () => { refreshStats(); pollVault(); },
        onCaught: () => { try { location.reload(); } catch (e) { /* ignore */ } } });
    }
    async function usePiece(p) {
      if (p.name === 'vaultdoor') return useVault(p);
      if (busy || leaving) return; const ids = (p.o.inter || []).filter(id => Acts.allowed(id, venue)); if (!ids.length) { toast('Nothing to do with that here.'); return; }
      const own = built.seats.filter(s => s.piece === p && !occupied.has(s.id)), onlyLie = ids.every(id => (Acts.get(id) || {}).pose === 'lie');
      if (own.length && !onlyLie) { const ok = await inter.sitAt(own.sort((u, v) => Math.hypot(u.x - P.x, u.z - P.z) - Math.hypot(v.x - P.x, v.z - P.z))[0].id); if (!ok) return; }
      else { const ok = await inter.walkTo(p.spot.x, p.spot.z); if (!ok) return; player.face(p.spot.face); player.setPose('idle'); }
      openSheet(p, ids);
    }
    function talk(it) {
      const r = it.s.role, lines = LINES[it.s.tag] || LINES[r] || LINES.staff, line = lines[Math.floor(Math.random() * lines.length)], who = it.s.tag ? it.s.tag.replace(/_/g, ' ') : r;
      bubble.innerHTML = '<b style="text-transform:capitalize">' + who + '</b><br>' + (Math.random() < .35 ? greet() + '. ' : '') + line; bubble.style.display = 'block'; bubble._it = it; clearTimeout(bubble._t); bubble._t = setTimeout(() => { bubble.style.display = 'none'; bubble._it = null; }, 3600);
    }

    /* ---------- leaving ---------- */
    async function leave() {
      if (leaving) return; leaving = true; closeSheet(); clearInterval(pollT);
      try { await inter.walkTo(built.exitSpot.x, built.exitSpot.z); } catch (e) { /* ignore */ }
      await inter.standUp(); try { await api.leave(); } catch (e) { /* ignore */ } try { live && live.close && await live.close(); } catch (e) { /* ignore */ }
      if (opt.onLeave) opt.onLeave(); else location.href = opt.returnUrl || '/world/';
    }
    leaveBtn.onclick = leave;

    /* ---------- input: tap = act, drag = orbit, pinch/wheel = zoom ---------- */
    const ray = new T.Raycaster(), plane = new T.Plane(new T.Vector3(0, 1, 0), 0), hitP = new T.Vector3(), floorMesh = built.group.children.find(c => c.userData.floor), statics = built.group.children.find(c => c.userData.statics);
    function pickAt(cx, cy) {
      const r = stage.rayAt(cx, cy); const npcMeshes = npcs.filter(n => n.av).map(n => n.av.mesh);
      const groups = built.interactives.map(p => p.group).filter(Boolean), hits = r.intersectObjects(npcMeshes.concat(groups), true).filter(h => h.object.userData.npc || h.object.userData.interPiece);
      let best = hits[0] || null;
      if (remotes) { const pe = remotes.pick(r); if (pe && (!best || pe.distance < best.distance)) return { type: 'peer', peer: pe.peer || pe }; }
      if (best) { const o = best.object; if (o.userData.npc) return { type: 'npc', it: o.userData.npc }; return { type: 'piece', p: o.userData.interPiece }; }
      const sh = statics ? r.intersectObject(statics, true)[0] : null, fl = floorMesh ? r.intersectObject(floorMesh, false)[0] : null, pt = (sh && (!fl || sh.distance < fl.distance)) ? sh.point : fl ? fl.point : (r.ray.intersectPlane(plane, hitP) ? hitP : null);
      return pt ? { type: 'floor', x: pt.x, z: pt.z } : null;
    }
    async function onTap(cx, cy) {
      if (leaving) return; hint.style.opacity = 0; if (bubble.style.display !== 'none' && !bubble._it) bubble.style.display = 'none'; const h = pickAt(cx, cy); if (!h) return; if (sheet.style.display !== 'none') closeSheet();
      if (h.type === 'npc') return talk(h.it); if (h.type === 'piece') return usePiece(h.p); if (h.type === 'peer') return liveUI && liveUI.openCard(h.peer);
      if (busy) return;
      if (h.z > D - 1.1 && Math.abs(h.x - built.spawn.x) < 1.0) return leave();
      await inter.handle(Math.max(.3, Math.min(W - .3, h.x)), Math.max(.3, Math.min(D - .3, h.z)));
    }
    const ptr = new Map(); let drag = null, pinch0 = 0;
    canvas.addEventListener('pointerdown', (e) => { canvas.setPointerCapture && canvas.setPointerCapture(e.pointerId); ptr.set(e.pointerId, { x: e.clientX, y: e.clientY }); drag = { x: e.clientX, y: e.clientY, moved: 0, id: e.pointerId }; if (ptr.size === 2) { const a = [...ptr.values()]; pinch0 = Math.hypot(a[0].x - a[1].x, a[0].y - a[1].y); drag.moved = 99; } });
    canvas.addEventListener('pointermove', (e) => {
      if (!ptr.has(e.pointerId)) return; const old = ptr.get(e.pointerId); ptr.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (ptr.size === 2) { const a = [...ptr.values()], d = Math.hypot(a[0].x - a[1].x, a[0].y - a[1].y); if (pinch0) stage.zoom(pinch0 / d); pinch0 = d; return; }
      if (drag && drag.id === e.pointerId) { const dx = e.clientX - old.x, dy = e.clientY - old.y; drag.moved += Math.abs(dx) + Math.abs(dy); if (drag.moved > 8) stage.orbit(-dx * .006, dy * .004); }
    });
    const up = (e) => { const d = drag; ptr.delete(e.pointerId); if (ptr.size < 2) pinch0 = 0; if (d && d.id === e.pointerId && d.moved <= 8 && e.type === 'pointerup') onTap(e.clientX, e.clientY); if (!ptr.size) drag = null; };
    canvas.addEventListener('pointerup', up); canvas.addEventListener('pointercancel', up); canvas.addEventListener('wheel', (e) => { e.preventDefault(); stage.zoom(e.deltaY > 0 ? 1.1 : .91); }, { passive: false });

    /* ---------- enter on the server, first stats ---------- */
    entered.then(refreshStats).catch(e => toast('⚠️ ' + e.message)); setInterval(refreshStats, 30000);
    setInterval(() => { stage.applySky(g.FutaClock.sky()); clockEl.textContent = '🕒 ' + g.FutaClock.label(); }, 5000); clockEl.textContent = '🕒 ' + g.FutaClock.label(); setInterval(schedule, 2500);

    /* ---------- frame loop ---------- */
    let last = performance.now(), tt = 0; const v3 = new T.Vector3();
    function frame(now) {
      const dt = Math.min(.05, (now - last) / 1000); last = now; tt += dt;
      if (P.path && P.path.length) {
        const t = P.path[0], dx = t.x - P.x, dz = t.z - P.z, d = Math.hypot(dx, dz), step = 1.9 * dt;
        if (d <= step) { P.x = t.x; P.z = t.z; P.path.shift(); if (!P.path.length) { const dn = P.done; P.done = null; P.path = null; if (P.anim === 'walk') { P.anim = 'idle'; me.setPose('idle'); } dn && dn(true); } }
        else { P.x += dx / d * step; P.z += dz / d * step; P.ry = Math.atan2(dx, dz); if (P.anim !== 'walk') { P.anim = 'walk'; me.setPose('walk'); } }
      }
      if (P.lieRot != null) { me.group.rotation.set(-Math.PI / 2, P.lieRot, 0); me.group.position.set(P.x + Math.sin(P.lieRot) * .85, P.y + .14, P.z + Math.cos(P.lieRot) * .85); } else { me.group.rotation.set(0, P.ry, 0); me.group.position.set(P.x, P.y, P.z); } me.update(dt);
      npcs.forEach(it => stepNpc(it, dt)); marks.forEach((m, i) => { m.position.y = m.userData.base + Math.sin(tt * 2.2 + i) * .04; });
      live && live.tick && live.tick(P.x, P.y, P.z, P.ry, P.anim === 'sit' ? 'idle' : P.anim, false); remotes && remotes.update(dt, P, stage.cam);
      stage.follow(P.x, P.z); stage.frame(dt);
      if (bubble._it && bubble._it.av) { v3.set(bubble._it.x, 2.1 * (bubble._it.av.look ? bubble._it.av.look.body.height : 1) + (bubble._it.y || 0), bubble._it.z).project(stage.cam); bubble.style.left = (v3.x * .5 + .5) * innerWidth + 'px'; bubble.style.top = (-v3.y * .5 + .5) * innerHeight + 'px'; }
      g.__frames = (g.__frames || 0) + 1; requestAnimationFrame(frame);
    }
    requestAnimationFrame(frame);
    const eng = { useVault, pollVault, get led() { return led; }, built, stage, player: P, get me() { return me; }, npcs, api, inter, occupied, usePiece, runActivity, talk, leave, pickAt, onTap, toast, schedule, live,
      get busy() { return busy; }, project: (x, y, z) => { v3.set(x, y, z).project(stage.cam); return { x: (v3.x * .5 + .5) * innerWidth, y: (-v3.y * .5 + .5) * innerHeight }; } };
    g.__eng = eng; return eng;
  }
  g.FutaEngine = { start, present };
})(typeof window !== 'undefined' ? window : globalThis);
