/* ==========================================================================
   FutaJail — the jail screen. When the server says a player is in jail (arrested at the vault), interior.html shows THIS instead of a building:
   a 3D police cell with the player's own avatar (pacing, sitting on the bunk, leaning on the bars, lying down), an officer patrolling the corridor,
   a flickering lamp, a moonbeam with dust, and a big countdown to release. When the time is up the gate swings open and the player walks out.

     FutaJail.start({ canvas, secs, len, reason, api, returnUrl }) → Promise<jail>
       secs  : seconds left on the sentence (from the server)         len : full sentence length (for the ring), default 180
       api   : { jail() → {inJail, secsLeft, reason}, leave() }       The SERVER decides when you are free; this file only shows the countdown.
   The room is the `jail_cell` template in tpl_vault.js. Needs THREE, FutaAvatar, FutaTemplates, FutaStage, FutaKit, FutaClock.
   Test hook: window.__jail
   ========================================================================== */
(function (g) {
  'use strict';
  const T = g.THREE, FA = g.FutaAvatar, FT = g.FutaTemplates, K = g.FutaKit;
  const el = (tag, css, html) => { const e = document.createElement(tag); if (css) e.style.cssText = css; if (html != null) e.textContent = html; return e; };
  const clock = (s) => { s = Math.max(0, Math.ceil(s)); return Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0'); };
  const rnd = (a, b) => a + Math.random() * (b - a);
  const LINES = ['Think about what you did.', 'The lamp hums. Somewhere a tap drips.', 'Someone has scratched tally marks into the wall.', 'The officer glances at his watch.', 'Good behaviour makes time pass faster. Slightly.',
    'Next time, maybe just use the ATM.', 'You can hear the generator rumbling outside.', 'Three minutes is a long time when you are looking at bars.'];

  async function start(opt) {
    const canvas = opt.canvas, api = opt.api || {}, J = FT.JAIL, lowEnd = typeof matchMedia !== 'undefined' && matchMedia('(pointer:coarse)').matches;
    const len = Math.max(opt.len || 180, opt.secs || 1), built = FT.make({ id: 'jail', name: 'Police cell' }, { id: 'jail_cell' });
    const stage = g.FutaStage.create({ canvas }); stage.setRoom(built); const scene = stage.scene;
    const sky = Object.assign({}, g.FutaClock.sky(), { night: .92, lamps: 1, sunUp: false, sunI: 0, phase: 'night', stars: 0 }); stage.applySky(sky);
    stage.hemi.intensity = .62; stage.hemi.color.setHex(0xaebcf0); stage.hemi.groundColor.setHex(0x3a3f52); stage.sun.intensity = .1; stage.dist = lowEnd ? 9.6 : 8.6; stage.pitch = .62; stage.follow(3.7, 2.7); stage.cur.copy(stage.tgt);
    addEventListener('resize', () => stage.resize());
    document.title = 'In jail — FUTAlife';

    /* ---------- the player (own look) and the officer ---------- */
    let look = null; try { if (g.FutaApi && g.FutaApi.me) { const r = await g.FutaApi.me(); look = r && r.user && r.user.avatar; } } catch (e) { /* not signed in: random look */ }
    look = look || FA.look.random('f', 7);
    const me = FA.create(look, { lod: lowEnd ? 1 : 0, material: lowEnd ? 'lambert' : 'standard' }); me.group.rotation.order = 'YXZ'; scene.add(me.group);
    const cop = FA.npc.create('security', 4242, { lod: 1 }); scene.add(cop.group);
    const bunk = built.room.pieces.find(p => p.name === 'bunk'), lie = bunk && bunk.lie;

    /* ---------- lights: a flickering cell lamp, a moonbeam on the floor, drifting dust ---------- */
    const lamp = new T.PointLight(0xffd7a0, 1.0, 11, 1.6); lamp.position.set(3.7, 2.6, 2.4); scene.add(lamp);
    const beam = new T.Mesh(new T.PlaneGeometry(1, 1), new T.MeshBasicMaterial({ map: K.patchTex(), color: 0x9db8ff, transparent: true, opacity: .34, depthWrite: false, blending: T.AdditiveBlending, toneMapped: false, side: T.DoubleSide }));
    beam.rotation.x = -Math.PI / 2; beam.position.set(5.0, .03, 2.0); beam.scale.set(1.0, 3.2, 1); scene.add(beam);
    const N = lowEnd ? 28 : 60, pos = new Float32Array(N * 3), vel = []; for (let i = 0; i < N; i++) { pos[i * 3] = rnd(4.3, 5.6); pos[i * 3 + 1] = rnd(.2, 2.3); pos[i * 3 + 2] = rnd(.3, 3.3); vel.push([rnd(-.02, .02), rnd(.01, .05), rnd(-.02, .02)]); }
    const dg = new T.BufferGeometry(); dg.setAttribute('position', new T.BufferAttribute(pos, 3));
    const dust = new T.Points(dg, new T.PointsMaterial({ map: K.blobTex(), color: 0xc8d8ff, size: .09, transparent: true, opacity: .7, depthWrite: false, blending: T.AdditiveBlending, sizeAttenuation: true })); scene.add(dust);

    /* ---------- the gate (separate so it can swing open) ---------- */
    const gb = new K.Builder(), gw = J.gateX1 - J.gateX0; for (let i = 0; i <= 10; i++) gb.box(.04 + i * (gw - .08) / 10, 0, 0, .03, 3.0, .03, '#2a2d33', { ao: false });
    for (const y of [.18, 1.15, 2.88]) gb.box(gw / 2, y, 0, gw, .07, .05, '#3a3e45', { ao: false }); gb.box(.05, 0, 0, .08, 3.0, .08, '#454a52', { ao: false }); gb.box(gw - .05, 0, 0, .08, 3.0, .08, '#454a52', { ao: false }); gb.box(gw - .12, 1.05, .06, .1, .16, .06, '#d9b24a');
    const gate = K.meshes(gb, { cast: false }); gate.position.set(J.gateX0, 0, J.barsZ); scene.add(gate);

    /* ---------- HUD ---------- */
    const root = el('div', 'position:fixed;inset:0;z-index:40;pointer-events:none;font:15px system-ui,"Segoe UI",sans-serif;color:#fff;overflow:hidden'); document.body.appendChild(root);
    root.appendChild(el('div', 'position:absolute;inset:0;background:radial-gradient(ellipse at 50% 45%,rgba(0,0,0,0) 38%,rgba(2,4,10,.78) 100%)'));
    const title = el('div', 'position:absolute;left:0;right:0;top:calc(14px + env(safe-area-inset-top));text-align:center;text-shadow:0 2px 12px #000'); root.appendChild(title);
    const t1 = el('div', 'font:800 13px system-ui;letter-spacing:.32em;color:#f5c542', 'POLICE CELL 3'), t2 = el('div', 'margin-top:4px;opacity:.85;font-size:14px', opt.reason === 'vault' || !opt.reason ? 'Caught at the Heritage Bank vault' : 'Held by the police'); title.append(t1, t2);
    const ringBox = el('div', 'position:absolute;left:50%;bottom:calc(22px + env(safe-area-inset-bottom));transform:translateX(-50%);width:210px;height:210px;display:grid;place-items:center;text-align:center'); root.appendChild(ringBox);
    const C = 2 * Math.PI * 92; ringBox.innerHTML = '<svg viewBox="0 0 210 210" width="210" height="210" style="position:absolute;inset:0;filter:drop-shadow(0 4px 18px #000a)"><circle cx="105" cy="105" r="92" fill="rgba(6,10,20,.72)" stroke="#ffffff22" stroke-width="10"/><circle id="jr" cx="105" cy="105" r="92" fill="none" stroke="#f5c542" stroke-width="10" stroke-linecap="round" transform="rotate(-90 105 105)" stroke-dasharray="' + C.toFixed(1) + '" stroke-dashoffset="0"/></svg>';
    const ring = ringBox.querySelector('#jr'), inner = el('div', 'position:relative'), big = el('div', 'font:800 46px ui-monospace,Menlo,Consolas,monospace;font-variant-numeric:tabular-nums;text-shadow:0 0 18px #f5c54288', clock(opt.secs)), cap = el('div', 'font-size:12px;letter-spacing:.2em;opacity:.8;margin-top:2px', 'UNTIL RELEASE'); inner.append(big, cap); ringBox.appendChild(inner);
    const line = el('div', 'position:absolute;left:12px;right:12px;bottom:calc(250px + env(safe-area-inset-bottom));text-align:center;font-style:italic;opacity:0;transition:opacity 1s;text-shadow:0 2px 10px #000;color:#dfe8ff'); root.appendChild(line);
    const out = el('button', 'position:absolute;left:50%;transform:translateX(-50%);bottom:calc(250px + env(safe-area-inset-bottom));pointer-events:auto;background:#22c55e;color:#04210f;border:0;border-radius:14px;padding:14px 26px;font:800 17px system-ui;display:none;box-shadow:0 8px 26px #22c55e55', 'Walk out ➜'); root.appendChild(out);
    let li = 0; const sayLine = () => { line.style.opacity = 0; setTimeout(() => { if (state.free) return; line.textContent = LINES[li++ % LINES.length]; line.style.opacity = .95; }, 1000); }; sayLine(); const lineT = setInterval(sayLine, 9000);

    /* ---------- player routines (simple scripted life in a cell) ---------- */
    const P = { x: 2.3, z: 3.2, y: 0, ry: Math.PI / 2, lie: null }, state = { free: false, left: opt.secs, acts: [], cur: null, t: 0, gate: 0, exiting: false, pose: '' };
    const setPose = (n) => { if (state.pose !== n) { state.pose = n; me.setPose(n); } }; setPose('idle');
    const go = (x, z, sp) => ({ k: 'go', x, z, sp: sp || 1.25 }), sit = (x, z, ry, hold) => ({ k: 'sit', x, z, ry, hold }), stand = () => ({ k: 'stand' }), idle = (ry, hold, pose) => ({ k: 'idle', ry, hold, pose }), lay = (hold) => ({ k: 'lie', hold });
    const routines = [
      () => [go(2.35, 1.7), sit(1.62, 1.7, Math.PI / 2, rnd(7, 12)), stand()],
      () => [go(2.4, 2.7), go(5.1, 2.7), go(2.4, 2.8), go(3.3, 3.4), idle(0, rnd(2, 4))],
      () => [go(2.2, 4.2), idle(0, rnd(7, 11))],
      () => [go(2.35, 1.7), lay(rnd(9, 14)), stand()],
      () => [go(3.9, 3.6), idle(Math.PI, rnd(4, 6), 'pray')]];
    let last = -1; const nextRoutine = () => { let i; do { i = Math.floor(Math.random() * routines.length); } while (i === last); last = i; state.acts = routines[i](); };
    function actStep(dt) {
      if (state.exiting) { /* handled by the exit script */ }
      let a = state.cur; if (!a) { if (!state.acts.length) { if (state.exiting) { state.exitDone = true; a = { k: 'idle', ry: 0, hold: 9e9 }; } else if (state.free) { a = { k: 'idle', ry: 0, hold: 9e9 }; } else nextRoutine(); } a = state.cur = state.acts.shift() || a; state.t = 0; if (a.k === 'sit') { setPose('walk'); } }
      state.t += dt;
      if (a.k === 'go') {
        const dx = a.x - P.x, dz = a.z - P.z, d = Math.hypot(dx, dz), st = a.sp * dt; P.lie = null; P.y = 0;
        if (d <= st) { P.x = a.x; P.z = a.z; state.cur = null; } else { P.x += dx / d * st; P.z += dz / d * st; P.ry = Math.atan2(dx, dz); setPose('walk'); }
      } else if (a.k === 'sit') {
        const dx = a.x - P.x, dz = a.z - P.z, d = Math.hypot(dx, dz);
        if (d > .02 && !a.seated) { const st = 1.0 * dt; if (d <= st) { P.x = a.x; P.z = a.z; } else { P.x += dx / d * st; P.z += dz / d * st; P.ry = Math.atan2(dx, dz); setPose('walk'); } if (Math.hypot(a.x - P.x, a.z - P.z) <= .02) a.seated = true; }
        else { a.seated = true; P.y = .13; P.ry = a.ry; setPose('sit'); if (state.t > (a.hold || 8)) state.cur = null; }
      } else if (a.k === 'stand') { P.y = 0; P.lie = null; setPose('idle'); state.cur = null; }
      else if (a.k === 'idle') { P.ry = a.ry; setPose(a.pose || 'idle'); if (state.t > (a.hold || 4)) { setPose('idle'); state.cur = null; } }
      else if (a.k === 'lie') { if (lie) { P.lie = lie; P.x = lie.x; P.z = lie.z; P.y = lie.y; setPose('sleep'); } if (state.t > (a.hold || 10)) { state.cur = null; } }
    }

    /* ---------- the officer ---------- */
    const O = { x: 1.2, z: 6.0, ry: Math.PI / 2, dir: 1, wait: 1.2, pose: '' }, opose = (n) => { if (O.pose !== n) { O.pose = n; cop.setPose(n); } };
    function officer(dt) {
      if (O.wait > 0) { O.wait -= dt; opose('guard'); return; }
      const tx = O.dir > 0 ? 6.2 : 1.2, dx = tx - O.x, sp = .85 * dt; opose('patrol'); O.ry = Math.atan2(dx, 0.0001);
      if (Math.abs(dx) <= sp) { O.x = tx; O.dir *= -1; O.wait = rnd(2.2, 4); } else { O.x += Math.sign(dx) * sp; }
      if (Math.abs(O.x - 3.7) < .5 && O.wait <= 0) { O.wait = rnd(2.5, 4); O.ry = Math.PI; }             // pauses at the gate and looks into the cell
    }

    /* ---------- release ---------- */
    async function checkServer() {
      try { const r = api.jail ? await api.jail() : null; if (r && r.inJail) { state.left = r.secsLeft; return false; } return true; } catch (e) { return true; }
    }
    async function release() {
      if (state.free) return; state.free = true; ring.setAttribute('stroke', '#22c55e'); big.textContent = 'FREE'; big.style.color = '#4ade80'; cap.textContent = 'TIME SERVED'; line.style.opacity = 0; clearInterval(lineT);
      out.style.display = 'block'; state.acts = [go(3.7, 3.0), idle(0, 9e9)]; state.cur = null; clearInterval(srvT);
    }
    out.onclick = async () => {
      out.disabled = true; state.exiting = true; state.acts = [go(3.7, 4.2, 1.5), go(3.7, 7.1, 1.5), { k: 'idle', ry: 0, hold: .2 }]; state.cur = null;
      const wait = setInterval(async () => { if (state.exitDone) { clearInterval(wait); try { api.leave && await api.leave(); } catch (e) { /* ignore */ } try { location.href = opt.returnUrl || '/world/'; } catch (e) { /* ignore */ } } }, 200);
    };
    const srvT = setInterval(async () => { if (state.free) return; const ok = await checkServer(); if (ok && state.left <= 1) release(); }, 10000);

    /* ---------- input: drag to look around, wheel/pinch to zoom ---------- */
    let userYaw = 0; const ptr = new Map(); let pinch0 = 0;
    canvas.style.touchAction = 'none';
    canvas.addEventListener('pointerdown', (e) => { canvas.setPointerCapture && canvas.setPointerCapture(e.pointerId); ptr.set(e.pointerId, { x: e.clientX, y: e.clientY }); if (ptr.size === 2) { const a = [...ptr.values()]; pinch0 = Math.hypot(a[0].x - a[1].x, a[0].y - a[1].y); } });
    canvas.addEventListener('pointermove', (e) => { if (!ptr.has(e.pointerId)) return; const old = ptr.get(e.pointerId); ptr.set(e.pointerId, { x: e.clientX, y: e.clientY }); if (ptr.size === 2) { const a = [...ptr.values()], d = Math.hypot(a[0].x - a[1].x, a[0].y - a[1].y); if (pinch0) stage.zoom(pinch0 / d); pinch0 = d; return; } userYaw -= (e.clientX - old.x) * .005; stage.pitch = Math.max(.35, Math.min(1.1, stage.pitch + (e.clientY - old.y) * .003)); });
    const up = (e) => { ptr.delete(e.pointerId); if (ptr.size < 2) pinch0 = 0; }; canvas.addEventListener('pointerup', up); canvas.addEventListener('pointercancel', up); canvas.addEventListener('wheel', (e) => { e.preventDefault(); stage.zoom(e.deltaY > 0 ? 1.08 : .92); }, { passive: false });

    /* ---------- frame loop ---------- */
    let lastT = performance.now(), tt = 0, srvAt = performance.now(), leftAt = state.left; const tmp = new T.Vector3();
    function frame(now) {
      const dt = Math.min(.05, (now - lastT) / 1000); lastT = now; tt += dt;
      if (!state.free) { state.left = Math.max(0, leftAt - (now - srvAt) / 1000); big.textContent = clock(state.left); ring.setAttribute('stroke-dashoffset', (C * (1 - Math.max(0, Math.min(1, state.left / len)))).toFixed(1)); if (state.left <= 0) { leftAt = 0; checkServer().then(ok => { if (ok) release(); else { leftAt = state.left; srvAt = performance.now(); } }); srvAt = performance.now() + 5000; } }
      actStep(dt); officer(dt);
      if (P.lie) { me.group.rotation.set(-Math.PI / 2, P.lie.rot, 0); me.group.position.set(P.x + Math.sin(P.lie.rot) * .85, P.y + .14, P.z + Math.cos(P.lie.rot) * .85); } else { me.group.rotation.set(0, P.ry, 0); me.group.position.set(P.x, P.y, P.z); } me.update(dt);
      cop.group.position.set(O.x, 0, O.z); cop.group.rotation.y = O.ry; cop.update(dt);
      lamp.intensity = .95 + Math.sin(tt * 23) * .04 + (Math.sin(tt * 3.1) > .985 ? -.5 : 0) + Math.sin(tt * 1.3) * .06; beam.material.opacity = .30 + Math.sin(tt * .7) * .05;
      const a = dg.attributes.position; for (let i = 0; i < N; i++) { pos[i * 3] += vel[i][0] * dt * 3 + Math.sin(tt + i) * .0015; pos[i * 3 + 1] += vel[i][1] * dt * 3; pos[i * 3 + 2] += vel[i][2] * dt * 3; if (pos[i * 3 + 1] > 2.5) { pos[i * 3 + 1] = .2; pos[i * 3] = rnd(4.3, 5.6); pos[i * 3 + 2] = rnd(.3, 3.3); } } a.needsUpdate = true;
      const tg = state.free ? 1 : 0; state.gate += (tg - state.gate) * Math.min(1, dt * 2.2); gate.rotation.y = -state.gate * 1.75;
      stage.yaw = .6 + userYaw + Math.sin(tt * .18) * .05; stage.follow(3.7, 2.8); stage.frame(dt);
      g.__jailFrames = (g.__jailFrames || 0) + 1; requestAnimationFrame(frame);
    }
    requestAnimationFrame(frame);
    if (state.left <= 0) checkServer().then(ok => ok && release());
    const J2 = { built, stage, me, cop, P, state, release, root, get left() { return state.left; } }; g.__jail = J2; return J2;
  }
  g.FutaJail = { start };
})(typeof window !== 'undefined' ? window : globalThis);
