/* ==========================================================================
   FutaInteract — click a chair → walk there → sit.   Click an ATM → walk up → use it (game money only).
   Pure logic (grid A*, no THREE) + a tiny DOM ATM panel.  The world code gives it an "interior" description
   and a "player" adapter; see docs/SUPABASE.md → "Interiors".

   interior = { id, room, min:[x,z], max:[x,z], cell: 0.5,
                blockers: [ {x,z,w,d}, … ]  (furniture/walls as axis-aligned boxes, world metres),
                seats: [ {id, x, z, face:radians, label?} ],  atms: [ {id, x, z, face} ] }
   player  = { get pos(){return {x,z}}, followPath(points, done), face(rad), setPose(name), teleport(x,z) }
   ========================================================================== */
(function (g) {
  'use strict';

  /* ---------- grid + A* ---------- */
  function makeGrid(it) {
    const c = it.cell || 0.5, w = Math.ceil((it.max[0] - it.min[0]) / c), h = Math.ceil((it.max[1] - it.min[1]) / c), blocked = new Uint8Array(w * h), R = (it.radius == null ? 0.2 : it.radius); // R = body radius (clearance added around furniture)
    (it.blockers || []).forEach(b => {
      const x0 = Math.floor((b.x - b.w / 2 - R - it.min[0]) / c), x1 = Math.ceil((b.x + b.w / 2 + R - it.min[0]) / c), z0 = Math.floor((b.z - b.d / 2 - R - it.min[1]) / c), z1 = Math.ceil((b.z + b.d / 2 + R - it.min[1]) / c);
      for (let z = Math.max(0, z0); z < Math.min(h, z1); z++) for (let x = Math.max(0, x0); x < Math.min(w, x1); x++) blocked[z * w + x] = 1;
    });
    return { c, w, h, blocked, min: it.min, cell: (x, z) => [Math.floor((x - it.min[0]) / c), Math.floor((z - it.min[1]) / c)], center: (i, j) => [it.min[0] + (i + .5) * c, it.min[1] + (j + .5) * c] };
  }
  /** Nearest free cell to (i,j) (so clicking on furniture still works). */
  function nearestFree(G, i, j) {
    i = Math.max(0, Math.min(G.w - 1, i)); j = Math.max(0, Math.min(G.h - 1, j)); if (!G.blocked[j * G.w + i]) return [i, j];
    for (let r = 1; r < 12; r++) for (let dz = -r; dz <= r; dz++) for (let dx = -r; dx <= r; dx++) { if (Math.max(Math.abs(dx), Math.abs(dz)) !== r) continue; const x = i + dx, z = j + dz; if (x >= 0 && z >= 0 && x < G.w && z < G.h && !G.blocked[z * G.w + x]) return [x, z]; }
    return null;
  }
  function findPath(G, from, to) {
    const s = nearestFree(G, ...G.cell(from.x, from.z)), t = nearestFree(G, ...G.cell(to.x, to.z)); if (!s || !t) return null;
    const W = G.w, N = W * G.h, gS = new Float32Array(N).fill(1e9), prev = new Int32Array(N).fill(-1), closed = new Uint8Array(N), si = s[1] * W + s[0], ti = t[1] * W + t[0];
    const hh = (i) => { const x = i % W, z = (i / W) | 0; const dx = Math.abs(x - t[0]), dz = Math.abs(z - t[1]); return (dx + dz) + (1.414 - 2) * Math.min(dx, dz); };
    const open = [[hh(si), si]]; gS[si] = 0;
    while (open.length) {
      let bi = 0; for (let k = 1; k < open.length; k++) if (open[k][0] < open[bi][0]) bi = k; const [, cur] = open.splice(bi, 1)[0]; if (closed[cur]) continue; closed[cur] = 1; if (cur === ti) break;
      const cx = cur % W, cz = (cur / W) | 0;
      for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) {
        if (!dx && !dz) continue; const x = cx + dx, z = cz + dz; if (x < 0 || z < 0 || x >= W || z >= G.h) continue; const ni = z * W + x; if (G.blocked[ni] || closed[ni]) continue;
        if (dx && dz && (G.blocked[cz * W + x] || G.blocked[z * W + cx])) continue;       // no cutting corners
        const ng = gS[cur] + (dx && dz ? 1.414 : 1); if (ng < gS[ni]) { gS[ni] = ng; prev[ni] = cur; open.push([ng + hh(ni), ni]); }
      }
    }
    if (!closed[ti]) return null; const cells = []; for (let i = ti; i !== -1; i = prev[i]) cells.push(i); cells.reverse();
    let pts = cells.map(i => { const [x, z] = G.center(i % W, (i / W) | 0); return { x, z }; });
    pts = smooth(G, pts); return pts;
  }
  const clear = (G, a, b) => { const n = Math.ceil(Math.hypot(b.x - a.x, b.z - a.z) / (G.c * .5)); for (let k = 0; k <= n; k++) { const x = a.x + (b.x - a.x) * k / n, z = a.z + (b.z - a.z) * k / n, [i, j] = G.cell(x, z); if (i < 0 || j < 0 || i >= G.w || j >= G.h || G.blocked[j * G.w + i]) return false; } return true; };
  function smooth(G, p) { if (p.length < 3) return p; const out = [p[0]]; let a = 0; while (a < p.length - 1) { let b = p.length - 1; while (b > a + 1 && !clear(G, p[a], p[b])) b--; out.push(p[b]); a = b; } return out; }

  /* ---------- controller ---------- */
  function create(opts) {
    const live = opts.live, player = opts.player, toast = opts.toast || (() => { }); let it = null, G = null, busy = false, cancelTok = 0, sittingOn = null;
    const C = {
      setInterior(i) { it = i; G = i ? makeGrid(i) : null; sittingOn = null; },
      /** Click on the floor. */
      async walkTo(x, z) { if (!G) return false; await C.standUp(); const path = findPath(G, player.pos, { x, z }); if (!path) { toast('You can’t go there.'); return false; } return run(path); },
      /** Click on a chair/bench/bed seat. */
      async sitAt(seatId) {
        if (!it) return false; const s = it.seats.find(q => q.id === seatId); if (!s) return false;
        if (live.seatTaken(seatId)) { toast('Someone is sitting there.'); return false; }
        await C.standUp(); const tok = ++cancelTok, path = findPath(G, player.pos, { x: s.x, z: s.z }); if (!path) { toast('You can’t reach that seat.'); return false; }
        const arrived = await run(path, tok); if (!arrived || tok !== cancelTok) return false;
        let ok = false; try { ok = await live.sit(seatId); } catch (e) { toast((e && e.message) || 'Could not sit down — try again.'); return false; }   // a real error must not be reported as "someone sat there"
        if (!ok) { toast('Someone just sat there.'); return false; }
        player.teleport(s.x, s.z); player.face(s.face || 0); player.setPose('sit'); sittingOn = seatId; return true;
      },
      async standUp() { cancelTok++; if (sittingOn) { sittingOn = null; player.setPose('idle'); await live.stand(); } },
      /** Click on an ATM: walk to it, face it, open the panel. */
      async useAtm(atmId) {
        const a = it && it.atms.find(q => q.id === atmId); if (!a) return false; await C.standUp(); const tok = ++cancelTok;
        const front = { x: a.x + Math.sin(a.face || 0) * .7, z: a.z + Math.cos(a.face || 0) * .7 }, path = findPath(G, player.pos, front); if (!path) { toast('You can’t reach the ATM.'); return false; }
        const arrived = await run(path, tok); if (!arrived || tok !== cancelTok) return false; player.face((a.face || 0) + Math.PI); player.setPose('phone'); openAtm(live, () => player.setPose('idle')); return true;
      },
      get sitting() { return sittingOn; }, findPath: (a, b) => G && findPath(G, a, b),
      /** Hit-test helper for the world's click handler: returns {type:'seat'|'atm'|'floor', id?, x, z}. */
      pick(x, z) {
        if (!it) return null; const near = (arr, r) => arr.map(o => ({ o, d: Math.hypot(o.x - x, o.z - z) })).filter(q => q.d < r).sort((u, v) => u.d - v.d)[0];
        const a = near(it.atms || [], .9); if (a) return { type: 'atm', id: a.o.id, x, z }; const s = near(it.seats || [], .75); if (s) return { type: 'seat', id: s.o.id, x, z }; return { type: 'floor', x, z };
      },
      handle(x, z) { const p = C.pick(x, z); if (!p) return Promise.resolve(false); return p.type === 'atm' ? C.useAtm(p.id) : p.type === 'seat' ? C.sitAt(p.id) : C.walkTo(x, z); }
    };
    function run(path, tok) { return new Promise((res) => { busy = true; player.followPath(path, (finished) => { busy = false; res(finished !== false && (tok == null || tok === cancelTok)); }); }); }
    return C;
  }

  /* ---------- ATM panel (plain DOM, works on phones) ---------- */
  function openAtm(live, onClose) {
    if (typeof document === 'undefined') return; const old = document.getElementById('futaAtm'); if (old) old.remove();
    const el = document.createElement('div'); el.id = 'futaAtm';
    el.style.cssText = 'position:fixed;inset:auto 0 0 0;max-width:420px;margin:0 auto;background:#10172a;color:#fff;border-radius:18px 18px 0 0;padding:16px 16px calc(16px + env(safe-area-inset-bottom));font:15px system-ui;z-index:50;box-shadow:0 -8px 30px #0008';
    el.innerHTML = '<div style="display:flex;justify-content:space-between;align-items:center"><b>FUTA Bank ATM</b><button data-x style="background:none;border:0;color:#fff;font-size:22px">×</button></div><div data-bal style="margin:10px 0;line-height:1.7">Loading…</div><div data-row style="display:grid;grid-template-columns:1fr 1fr;gap:8px"></div><div data-msg style="margin-top:8px;min-height:20px;color:#f5c542"></div>';
    document.body.appendChild(el); const bal = el.querySelector('[data-bal]'), row = el.querySelector('[data-row]'), msg = el.querySelector('[data-msg]'); const fmt = n => '₦' + Number(n).toLocaleString();
    const show = (w) => { bal.innerHTML = 'In your pocket: <b>' + fmt(w.pocket) + '</b><br>In the bank: <b>' + fmt(w.bank) + '</b>'; };
    const btn = (label, fn) => { const b = document.createElement('button'); b.textContent = label; b.style.cssText = 'padding:12px;border-radius:12px;border:0;background:#243056;color:#fff;font-size:15px'; b.onclick = () => { msg.textContent = ''; fn().then(show).catch(e => msg.textContent = e.message); }; row.appendChild(b); return b; };
    btn('Withdraw ₦1,000', () => live.withdraw(1000)); btn('Withdraw ₦5,000', () => live.withdraw(5000)); btn('Deposit ₦1,000', () => live.deposit(1000)); btn('Deposit all pocket', () => live.wallet().then(w => w.pocket > 0 ? live.deposit(w.pocket) : w));
    live.wallet().then(w => { show(w); if (w.canClaimDaily) btn('Claim daily alert (+₦1,000)', () => live.claimDaily()); }).catch(e => { bal.textContent = e.message; });
    el.querySelector('[data-x]').onclick = () => { el.remove(); onClose && onClose(); };
  }

  g.FutaInteract = { create, makeGrid, findPath, openAtm };
})(typeof window !== 'undefined' ? window : globalThis);
