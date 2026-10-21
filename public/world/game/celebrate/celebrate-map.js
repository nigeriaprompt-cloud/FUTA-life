/* FUTA Celebrations — the MAP side. Loaded by public/world/index.html. While the admin has a celebration ON it adds, to the 3D campus:
   • bunting (strings of coloured pennants) around the rooflines of the main landmarks   • tall flags on roof corners
   • balloon clusters that bob in the breeze   • soft golden light pillars you can see from far away (like searchlights)
   • gentle confetti drifting around wherever the camera looks   • a glass "ribbon" with the event name and countdown   • a one-time confetti burst.
   It only ADDS one THREE.Group to the campus (`city`) and removes it again when the celebration ends. It needs window.FUTA_MAPCTX (set in index.html).
   Cost: about 2000 instanced triangles + 450 confetti points, redrawn ~30 times a second ONLY while a celebration is on and the campus view is showing.
   "Reduce motion" devices get a still, decorated map (no drifting, no burst). Text from the server uses textContent only. */
(function (g) {
  'use strict';
  const C = g.FutaCelebrate; if (!C) return;
  let X = null, T = null, deco = null, ticking = false, parts = null, ribbon = null, sigB = '', lastTick = 0, spent = [];
  const REDUCE = g.matchMedia && g.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const LOW = (navigator.hardwareConcurrency || 8) <= 4;
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const rnd = (() => { let s = 12345; return () => ((s = (s * 9301 + 49297) % 233280) / 233280); })();   // seeded: the same decorations every time

  function init() { X = g.FUTA_MAPCTX; if (!X) { setTimeout(init, 300); return; } T = X.THREE; C.onChange(apply); setInterval(() => { if (deco && sigOf() !== sigB) build(C.state.theme); }, 5000); }
  const sigOf = () => { const b = X.getB() || []; return b.length + ':' + (b[0] && b[0].id) + ':' + (b.filter(o => o._c).length); };

  function apply(s) { if (!X) return; if (s.on) { build(s.theme); ribbonUI(s); burst(s); startTick(); } else { clear(); ribbonUI(s); } X.wake(); }
  function clear() { if (!deco) return; X.city.remove(deco); deco.traverse(o => { if (o.geometry) o.geometry.dispose(); if (o.material) { if (o.material.map) o.material.map.dispose(); o.material.dispose(); } }); deco = null; parts = null; spent = []; }

  /* which buildings get decorated: landmarks first, then big public-looking ones */
  function pickBuildings() {
    const re = /senate|admin|library|gate|chapel|convoc|auditor|hall|centre|center|church|mosque|arena|stadium|sport|cafeteria|health|school|faculty|engineering/i;
    return (X.getB() || []).filter(o => o && o._c && o.type !== 'house' && o.lod !== 3).map(o => { const c = o._c; return { o, c, score: (o.lod === 1 ? 100 : 0) + (re.test(o.name || '') ? 40 : 0) + Math.min(60, c.w * c.d / 80) }; })
      .sort((a, b) => b.score - a.score).slice(0, LOW ? 9 : 16);
  }
  const l2w = (c, x, z) => { const s = Math.sin(c.rot), k = Math.cos(c.rot); return [c.x + k * x + s * z, c.z - s * x + k * z]; };

  function build(theme) {
    clear(); const B = pickBuildings(); sigB = sigOf(); if (!B.length) return;
    const THREE = T, col = theme.colors, gold = new THREE.Color(col[1]); deco = new THREE.Group(); deco.name = 'celebration';
    const cc = col.map(c => new THREE.Color(c));
    /* ---- bunting: pennants hang from a sagging string along every roof edge ---- */
    const pen = [], lines = []; let nb = 0;
    B.forEach(({ c }) => {
      const hw = c.w / 2 + .5, hd = c.d / 2 + .5, y0 = c.h + .4, ps = clamp(Math.max(c.w, c.d) * .085, 2, 5);
      const corners = [[-hw, -hd], [hw, -hd], [hw, hd], [-hw, hd]];
      for (let e = 0; e < 4; e++) {
        const A = corners[e], Bc = corners[(e + 1) % 4], len = Math.hypot(Bc[0] - A[0], Bc[1] - A[1]), sag = Math.min(1.8, len * .06), n = Math.max(3, Math.floor(len / (ps * 1.25)));
        const pt = (t) => { const p = l2w(c, A[0] + (Bc[0] - A[0]) * t, A[1] + (Bc[1] - A[1]) * t); return [p[0], y0 - sag * 4 * t * (1 - t), p[1]]; };
        let prev = pt(0); for (let i = 1; i <= 14; i++) { const q = pt(i / 14); lines.push(prev[0], prev[1], prev[2], q[0], q[1], q[2]); prev = q; }
        const a = l2w(c, A[0], A[1]), b = l2w(c, Bc[0], Bc[1]), ry = Math.atan2(-(b[1] - a[1]), b[0] - a[0]);
        for (let i = 0; i < n; i++) { const p = pt((i + .5) / n); pen.push({ x: p[0], y: p[1], z: p[2], ry, s: ps, k: nb++ % cc.length }); }
      }
    });
    if (pen.length) {
      const tg = new THREE.BufferGeometry(); tg.setAttribute('position', new THREE.BufferAttribute(new Float32Array([-.5, 0, 0, .5, 0, 0, 0, -1.15, 0]), 3));
      const im = new THREE.InstancedMesh(tg, new THREE.MeshBasicMaterial({ side: THREE.DoubleSide, fog: false }), pen.length), m = new THREE.Object3D();
      pen.forEach((p, i) => { m.position.set(p.x, p.y, p.z); m.rotation.set(0, p.ry, 0); m.scale.set(p.s, p.s, p.s); m.updateMatrix(); im.setMatrixAt(i, m.matrix); im.setColorAt(i, cc[p.k === 1 ? 2 : p.k]); });
      im.instanceColor.needsUpdate = true; deco.add(im);
      const lg = new THREE.BufferGeometry(); lg.setAttribute('position', new THREE.BufferAttribute(new Float32Array(lines), 3)); deco.add(new THREE.LineSegments(lg, new THREE.LineBasicMaterial({ color: gold, fog: false })));
    }
    /* ---- flags on poles + balloon clusters at roof corners; light pillars on the top landmarks ---- */
    const flags = [], balloons = [];
    B.slice(0, 10).forEach(({ c }, bi) => {
      const hw = c.w / 2, hd = c.d / 2, ph = clamp(c.h * .7, 10, 22);
      [[hw, hd], [-hw, hd]].forEach((cr, k) => { const p = l2w(c, cr[0] * .96, cr[1] * .96); flags.push({ x: p[0], y: c.h, z: p[1], h: ph, ry: c.rot + (k ? Math.PI : 0), s: clamp(Math.max(c.w, c.d) * .14, 4.5, 8), k: (bi + k) % cc.length }); });
      [[-hw, -hd], [hw, -hd]].forEach((cr, k) => { const p = l2w(c, cr[0] * .9, cr[1] * .9), r = clamp(Math.max(c.w, c.d) * .06, 1.5, 3.4); for (let j = 0; j < 6; j++) { const a = j / 6 * Math.PI * 2 + k; balloons.push({ x: p[0] + Math.cos(a) * r * 1.2, z: p[1] + Math.sin(a) * r * 1.2, y0: c.h, up: r * (3.2 + rnd() * 2.4) + 4, r, k: (j + bi) % cc.length, ph: rnd() * 6.28, ax: p[0], az: p[1] }); } });
    });
    const poleG = new THREE.CylinderGeometry(.14, .14, 1, 6); poleG.translate(0, .5, 0);
    const poles = new THREE.InstancedMesh(poleG, new THREE.MeshBasicMaterial({ color: 0xe9dfc0, fog: false }), flags.length), fg = new THREE.PlaneGeometry(1, .62); fg.translate(.5, 0, 0);
    const fl = new THREE.InstancedMesh(fg, new THREE.MeshBasicMaterial({ side: THREE.DoubleSide, fog: false }), flags.length), mo = new THREE.Object3D();
    flags.forEach((f, i) => { mo.position.set(f.x, f.y, f.z); mo.rotation.set(0, 0, 0); mo.scale.set(1, f.h, 1); mo.updateMatrix(); poles.setMatrixAt(i, mo.matrix); fl.setColorAt(i, cc[f.k]); });
    fl.instanceColor.needsUpdate = true; deco.add(poles, fl);
    const bg = new THREE.SphereGeometry(1, 10, 8), bl = new THREE.InstancedMesh(bg, new THREE.MeshBasicMaterial({ fog: false }), balloons.length || 1);
    balloons.forEach((b, i) => bl.setColorAt(i, cc[b.k])); if (balloons.length) bl.instanceColor.needsUpdate = true; deco.add(bl);
    const strP = new Float32Array(balloons.length * 6), sg = new THREE.BufferGeometry(); sg.setAttribute('position', new THREE.BufferAttribute(strP, 3)); deco.add(new THREE.LineSegments(sg, new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: .55, fog: false })));
    const pil = []; B.slice(0, 4).forEach(({ c }) => { const m = new THREE.Mesh(new THREE.CylinderGeometry(2.2, 9, 190, 16, 1, true), new THREE.MeshBasicMaterial({ color: new THREE.Color(theme.glow), transparent: true, opacity: .2, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, fog: false })); m.position.set(c.x, c.h + 85, c.z); deco.add(m); pil.push(m); });
    const gt = document.createElement('canvas'); gt.width = gt.height = 128; { const g2 = gt.getContext('2d'), gr = g2.createRadialGradient(64, 64, 4, 64, 64, 64); gr.addColorStop(0, 'rgba(255,255,255,.95)'); gr.addColorStop(.45, 'rgba(255,255,255,.4)'); gr.addColorStop(1, 'rgba(255,255,255,0)'); g2.fillStyle = gr; g2.fillRect(0, 0, 128, 128); }
    const gtex = new THREE.CanvasTexture(gt);
    B.slice(0, 10).forEach(({ c }, i) => { const sz = Math.max(c.w, c.d) * 2.3 + 14, m = new THREE.Mesh(new THREE.PlaneGeometry(sz, sz), new THREE.MeshBasicMaterial({ map: gtex, color: i % 2 ? cc[2] : new THREE.Color(theme.glow), transparent: true, opacity: .5, blending: THREE.AdditiveBlending, depthWrite: false, fog: false })); m.rotation.x = -Math.PI / 2; m.position.set(c.x, .5, c.z); deco.add(m); });
    /* ---- confetti around wherever the camera looks ---- */
    const N = LOW ? 260 : 450, pos = new Float32Array(N * 3), colr = new Float32Array(N * 3), seed = [], pc = [cc[1], cc[2], cc[3], cc[4], new THREE.Color('#ffffff')];
    for (let i = 0; i < N; i++) { const c = pc[i % pc.length]; colr[i * 3] = c.r; colr[i * 3 + 1] = c.g; colr[i * 3 + 2] = c.b; seed.push([rnd(), rnd(), rnd(), .4 + rnd() * .9, rnd() * 6.28]); }
    const cg = new THREE.BufferGeometry(); cg.setAttribute('position', new THREE.BufferAttribute(pos, 3)); cg.setAttribute('color', new THREE.BufferAttribute(colr, 3));
    const cv = document.createElement('canvas'); cv.width = cv.height = 32; const x2 = cv.getContext('2d'); x2.fillStyle = '#fff'; x2.beginPath(); x2.roundRect ? x2.roundRect(6, 3, 20, 26, 5) : x2.rect(6, 3, 20, 26); x2.fill();
    const conf = new THREE.Points(cg, new THREE.PointsMaterial({ size: 6, sizeAttenuation: false, vertexColors: true, map: new THREE.CanvasTexture(cv), transparent: true, depthWrite: false, fog: false, alphaTest: .05 })); conf.frustumCulled = false; deco.add(conf);
    parts = { flags, balloons, fl, bl, sg, strP, pil, conf, pos, seed, N, mo, fg, t0: performance.now() };
    X.city.add(deco); update(0); X.wake();
  }

  function update(t) {
    if (!deco || !parts) return; const P = parts, S = X.getView(), night = X.skyNight ? X.skyNight() : 0, sec = t / 1000, m = P.mo;
    P.flags.forEach((f, i) => { m.position.set(f.x, f.y + f.h * .78, f.z); m.rotation.set(0, f.ry + Math.sin(sec * 1.7 + i) * .16, 0); m.scale.set(f.s, f.s, 1); m.updateMatrix(); P.fl.setMatrixAt(i, m.matrix); }); P.fl.instanceMatrix.needsUpdate = true;
    P.balloons.forEach((b, i) => { const bob = Math.sin(sec * 1.1 + b.ph) * .35, sx = Math.sin(sec * .7 + b.ph) * .5, y = b.y0 + b.up + bob; m.position.set(b.x + sx, y, b.z + Math.cos(sec * .6 + b.ph) * .5); m.rotation.set(0, 0, 0); m.scale.set(b.r * .9, b.r * 1.12, b.r * .9); m.updateMatrix(); P.bl.setMatrixAt(i, m.matrix); P.strP.set([b.ax, b.y0, b.az, m.position.x, y - b.r, m.position.z], i * 6); });
    P.bl.instanceMatrix.needsUpdate = true; P.sg.attributes.position.needsUpdate = true;
    P.pil.forEach((p, i) => { p.material.opacity = .14 + night * .18 + Math.sin(sec * .9 + i * 1.7) * .03; });
    const size = clamp(S.d * .55, 40, 1100), H = clamp(S.d * .6, 40, 800), fall = REDUCE ? 0 : sec * .05, pos = P.pos;
    for (let i = 0; i < P.N; i++) { const s = P.seed[i], v = ((s[1] - fall * s[3]) % 1 + 1) % 1; pos[i * 3] = S.x + (s[0] - .5) * size + Math.sin(sec * s[3] + s[4]) * size * .012; pos[i * 3 + 1] = v * H; pos[i * 3 + 2] = S.z + (s[2] - .5) * size + Math.cos(sec * s[3] * .8 + s[4]) * size * .012; }
    P.conf.geometry.attributes.position.needsUpdate = true;
  }
  function startTick() {
    if (ticking || REDUCE) return; ticking = true;
    let prev = performance.now(), slow = 0, gap = 33;   // adaptive: if the device struggles (frames slower than ~70 ms) we animate less often instead of making the whole map laggy
    (function loop(t) {
      if (!C.state.on || !deco) { ticking = false; return; } requestAnimationFrame(loop);
      const dt = t - prev; prev = t; if (dt < 400) { slow = slow * .9 + dt * .1; gap = slow > 70 ? 250 : slow > 45 ? 100 : 33; }
      if (document.hidden || X.paused() || X.getMode() !== 'city' || t - lastTick < gap) return; lastTick = t; update(t); X.wake();
    })(performance.now());
  }

  /* ---- the glass ribbon (top of the screen) ---- */
  function ribbonUI(s) {
    if (!s.on) { if (ribbon) { ribbon.remove(); ribbon = null; } return; }
    let hidden = false; try { hidden = sessionStorage.getItem('futa.cel.ribbon') === s.event + s.title; } catch (e) { }
    if (hidden) { if (ribbon) { ribbon.remove(); ribbon = null; } return; }
    if (!ribbon) {
      const st = document.createElement('style'); st.textContent = '#celrib{position:fixed;z-index:4;left:50%;top:calc(96px + env(safe-area-inset-top,0px));transform:translateX(-50%);max-width:min(560px,calc(100vw - 20px));display:flex;align-items:center;gap:10px;padding:7px 8px 7px 8px;border-radius:999px;color:#fff;font:500 13px/1.25 system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;background:linear-gradient(120deg,var(--c1),var(--c2));border:1px solid var(--c3);box-shadow:0 8px 24px rgba(0,0,0,.28),inset 0 0 0 3px rgba(255,255,255,.07);overflow:hidden;animation:celin .6s cubic-bezier(.2,.9,.3,1.1) both;transition:opacity .2s}'
        + '#celrib::before{content:"";position:absolute;inset:0;background:linear-gradient(110deg,transparent 35%,rgba(255,255,255,.22) 50%,transparent 65%);transform:translateX(-120%);animation:celsh 5s ease-in-out infinite}'
        + '#celrib .ic{flex:none;width:34px;height:34px;border-radius:50%;display:grid;place-items:center;font-size:18px;background:radial-gradient(circle at 30% 25%,var(--c4),var(--c3));box-shadow:inset 0 0 0 2px rgba(255,255,255,.35)}'
        + '#celrib .tx{min-width:0;position:relative}#celrib b{display:block;font:600 14px Georgia,"Iowan Old Style",serif;color:var(--c4);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}#celrib span{display:block;font-size:12px;opacity:.92;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}'
        + '#celrib .x{flex:none;position:relative;width:30px;height:30px;min-height:0;border-radius:50%;background:rgba(255,255,255,.14);color:#fff;font-size:15px;line-height:1;padding:0;display:grid;place-items:center}#celrib .x:hover{background:rgba(255,255,255,.26)}'
        + '@keyframes celin{from{opacity:0;transform:translate(-50%,-14px)}}@keyframes celsh{0%,55%{transform:translateX(-120%)}100%{transform:translateX(120%)}}@media(max-width:560px){#celrib span{display:none}}@media(prefers-reduced-motion:reduce){#celrib,#celrib::before{animation:none!important}}';
      document.head.appendChild(st);
      ribbon = document.createElement('div'); ribbon.id = 'celrib'; ribbon.setAttribute('role', 'status');
      const ic = document.createElement('div'); ic.className = 'ic'; const tx = document.createElement('div'); tx.className = 'tx'; tx.append(document.createElement('b'), document.createElement('span'));
      const x = document.createElement('button'); x.type = 'button'; x.className = 'x'; x.setAttribute('aria-label', 'Hide this banner'); x.textContent = '✕';
      x.onclick = () => { try { sessionStorage.setItem('futa.cel.ribbon', C.state.event + C.state.title); } catch (e) { } if (ribbon) { ribbon.remove(); ribbon = null; } };
      ribbon.append(ic, tx, x); document.body.appendChild(ribbon);
      setInterval(() => { if (ribbon) { const c = document.getElementById('cmp'); ribbon.style.opacity = c && c.style.display !== 'none' && c.style.display !== '' ? 0 : 1; ribbon.style.pointerEvents = ribbon.style.opacity === '0' ? 'none' : ''; const sp = ribbon.querySelector('span'); if (sp && C.state.on) sp.textContent = C.state.message + (C.leftText(C.state.endsAt) ? ' · ' + C.leftText(C.state.endsAt) : ''); } }, 1000);
    }
    const c = s.theme.colors; ribbon.style.setProperty('--c1', c[0]); ribbon.style.setProperty('--c2', c[4]); ribbon.style.setProperty('--c3', c[1]); ribbon.style.setProperty('--c4', c[2]);
    ribbon.querySelector('.ic').textContent = s.theme.icon; ribbon.querySelector('b').textContent = s.title; ribbon.querySelector('span').textContent = s.message + (C.leftText(s.endsAt) ? ' · ' + C.leftText(s.endsAt) : '');
  }

  /* ---- one confetti burst per event per session ---- */
  function burst(s) {
    if (REDUCE) return; const key = 'futa.cel.burst.' + s.event; try { if (sessionStorage.getItem(key)) return; sessionStorage.setItem(key, '1'); } catch (e) { }
    const cv = document.createElement('canvas'); cv.style.cssText = 'position:fixed;inset:0;z-index:7;pointer-events:none;width:100%;height:100%'; const dpr = Math.min(2, g.devicePixelRatio || 1), W = cv.width = innerWidth * dpr, H = cv.height = innerHeight * dpr; document.body.appendChild(cv);
    const ctx = cv.getContext('2d'), cols = s.theme.colors.concat(['#ffffff']), P = [];
    for (let i = 0; i < 170; i++) { const right = i % 2; P.push({ x: right ? W : 0, y: H, vx: (right ? -1 : 1) * (4 + Math.random() * 9) * dpr, vy: -(9 + Math.random() * 12) * dpr, w: (5 + Math.random() * 6) * dpr, h: (8 + Math.random() * 8) * dpr, r: Math.random() * 6, vr: (Math.random() - .5) * .4, c: cols[i % cols.length] }); }
    let f = 0; (function go() { ctx.clearRect(0, 0, W, H); P.forEach(p => { p.x += p.vx; p.y += p.vy; p.vy += .35 * dpr; p.vx *= .985; p.r += p.vr; ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.r); ctx.globalAlpha = Math.max(0, 1 - f / 150); ctx.fillStyle = p.c; ctx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h); ctx.restore(); }); if (++f < 150) requestAnimationFrame(go); else cv.remove(); })();
  }
  init();
})(window);
