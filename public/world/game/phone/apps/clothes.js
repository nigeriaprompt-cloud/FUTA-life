/* Phone app: Clothes — change what your character WEARS, exactly like the Clothes and Extras tabs in sign-up, with a live 3D preview.
   Only look.wear changes (top, bottom, dress, layer, shoes + headwear, glasses, bag, neck, wrist, ears). Gender, skin, body, face, hair and makeup are
   copied from the saved look and can NOT be changed here: on save we take the saved look and replace only its "wear" part.
   Choices come from avatar/avatar-options.json (same source as the creator); NPC-only items (restricted) are never offered.
   Saving goes through FutaApi.saveAvatar -> the save_avatar RPC (the server re-validates the whole look). No money is involved: outfits are free.
   The 3D engine (three.js + avatar-*.js) loads the first time the app opens, never at game start.
   To add a garment: edit avatar-options.json, run tools/build-options.py, teach avatar-wear.js to draw it. This app picks it up by itself.
   All text goes in with textContent. */
(function (g) {
  'use strict';
  const Ph = g.FutaPhone; if (!Ph) return;

  const CLOTH_SLOTS = [['top', 'Top'], ['bottom', 'Bottom'], ['dress', 'Dress'], ['layer', 'Layer'], ['shoes', 'Shoes']];
  const EXTRA_SLOTS = [['head', 'Headwear'], ['glasses', 'Glasses'], ['bag', 'Bag'], ['neck', 'Neck'], ['wrist', 'Wrist'], ['ears', 'Ears']];
  const NEEDED = ['avatar-options.js', 'avatar-core.js', 'avatar-body.js', 'avatar-wear.js', 'avatar-rig.js', 'avatar-build.js'];
  const h = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; };
  const clone = (o) => JSON.parse(JSON.stringify(o));

  const CSS = '.cl{display:flex;flex-direction:column;flex:1;min-height:0;background:var(--cream);height:100%}' +
    '.cl-stage{position:relative;flex:none;height:44%;min-height:230px;background:radial-gradient(80% 70% at 50% 35%,#2d6a4f 0,#173f2e 62%,#0e2a1f 100%);overflow:hidden;touch-action:pan-y}' +
    '.cl-stage canvas{position:absolute;inset:0;width:100%;height:100%;display:block;touch-action:none}' +
    '.cl-load{position:absolute;inset:0;display:grid;place-items:center;color:#f0d78c;font-size:.95em;text-align:center;padding:1em;background:#0e2a1f}' +
    '.cl-fab{position:absolute;display:flex;gap:.4em}.cl-fab.tr{right:.6em;top:.6em}.cl-fab.bl{left:.6em;bottom:.6em}' +
    '.cl-ic{border:1px solid #ffffff33;background:#0009;color:#fff;border-radius:999px;padding:.4em .8em;font-size:.82em}' +
    '.cl-tabs{flex:none;display:flex;gap:.3em;padding:.55em 1em 0;background:var(--cream)}.cl-tabs button{flex:1;padding:.55em;border-radius:.8em .8em 0 0;font-weight:700;color:var(--mute);border-bottom:2px solid transparent}.cl-tabs button.on{color:var(--emerald);border-bottom-color:var(--gold)}' +
    '.cl-sub{flex:none;display:flex;gap:.35em;overflow-x:auto;scrollbar-width:none;padding:.6em 1em .2em}.cl-sub::-webkit-scrollbar{display:none}.cl-sub button{flex:0 0 auto;padding:.45em .85em;border-radius:999px;border:1px solid var(--line);background:#fff;color:var(--mute);font-weight:600;font-size:.88em}.cl-sub button.on{background:var(--emerald);color:var(--gold2);border-color:var(--emerald)}' +
    '.cl-panel{flex:1;min-height:0;overflow:auto;padding:.5em 1em 1em}' +
    '.cl-row{margin-bottom:1.1em}.cl-row>label{display:block;font-size:.8em;letter-spacing:.06em;text-transform:uppercase;color:var(--mute);margin-bottom:.5em}' +
    '.cl-chips{display:flex;flex-wrap:wrap;gap:.45em}.cl-chip{padding:.55em .8em;border-radius:.8em;border:1px solid var(--line);background:#fff;font-size:.9em;color:var(--ink)}.cl-chip.on{border-color:var(--gold);background:#fff6dd;font-weight:700;color:var(--emerald)}' +
    '.cl-sw{display:flex;flex-wrap:wrap;gap:.5em}.cl-sw button{width:2.1em;height:2.1em;border-radius:50%;border:2px solid #0002;padding:0}.cl-sw button.on{outline:3px solid var(--gold);outline-offset:2px}.cl-sw button.none{background:repeating-linear-gradient(45deg,#e8e2d0 0 6px,#fbf8f1 6px 12px)}' +
    '.cl-bar{flex:none;display:flex;gap:.6em;padding:.6em 1em .9em;background:var(--cream);border-top:1px solid var(--line)}' +
    '.cl-btn{flex:1;background:var(--emerald);color:var(--gold2);font-weight:700;padding:.85em;border-radius:.95em;text-align:center}.cl-btn:disabled{opacity:.45}.cl-btn.ghost{flex:none;background:#fff;color:var(--emerald);border:1px solid var(--line)}';

  /* load the 3D engine once (same files the creator uses) */
  let engine = null;
  function loadEngine(base) {
    if (g.FutaAvatar && g.THREE) return Promise.resolve();
    if (engine) return engine;
    const list = (g.THREE ? [] : [base + '../../vendor/three.min.js']).concat(NEEDED.map(n => base + '../avatar/' + n));
    engine = new Promise((resolve, reject) => {
      let i = 0;
      const next = () => { if (i >= list.length) return resolve(); const s = document.createElement('script'); s.src = list[i++]; s.async = false; s.onload = next; s.onerror = () => { engine = null; reject(new Error('Could not load ' + s.src)); }; document.head.appendChild(s); };
      next();
    });
    return engine;
  }

  Ph.registerApp({
    id: 'clothes', name: 'Clothes', icon: 'shirt', color: ['#c06a8a', '#5a1f3a'],
    mount(body, ctx) {
      const demo = Ph.demo(); let u = Ph.getUser(), dead = false, raf = 0, ro = null, timer = 0, leaveArmed = false;
      let FA = null, T = null, saved = null, look = null, group = 'clothes', slot = { clothes: 'top', extras: 'head' }, av = null, rotY = 0.35, spin = true, focus = 'body';
      let renderer = null, scene = null, cam = null, pivot = null, camY = 0.93, camD = 5.3, tY = 0.93, tD = 5.3;

      const style = h('style'); style.textContent = CSS; body.appendChild(style);
      const root = h('div', 'cl'); body.appendChild(root);
      const stage = h('div', 'cl-stage'), canvas = h('canvas'), loadEl = h('div', 'cl-load', 'Loading your wardrobe…');
      const fabTr = h('div', 'cl-fab tr'), fabBl = h('div', 'cl-fab bl');
      const bFocus = h('button', 'cl-ic', 'Zoom to face'); bFocus.type = 'button'; fabBl.appendChild(bFocus);
      const bSpin = h('button', 'cl-ic', 'Stop spin'); bSpin.type = 'button'; fabTr.appendChild(bSpin);
      stage.append(canvas, loadEl, fabTr, fabBl);
      const tabs = h('div', 'cl-tabs'), sub = h('div', 'cl-sub'), panel = h('div', 'cl-panel'), bar = h('div', 'cl-bar');
      const bUndo = h('button', 'cl-btn ghost', 'Undo changes'), bSave = h('button', 'cl-btn', 'Save outfit'); bUndo.type = 'button'; bSave.type = 'button'; bar.append(bUndo, bSave);
      root.append(stage, tabs, sub, panel, bar);
      [['clothes', 'Clothes'], ['extras', 'Extras']].forEach(([k, t]) => { const b = h('button', k === group ? 'on' : '', t); b.type = 'button'; b.dataset.g = k; b.onclick = () => { group = k; draw(); }; tabs.appendChild(b); });

      const dirty = () => JSON.stringify(look.wear) !== JSON.stringify(saved.wear);
      const forFrame = (list) => list.filter(x => !x.for || x.for === 'u' || x.for === look.body.frame);
      const paintBar = () => { bSave.disabled = !dirty(); bUndo.disabled = !dirty(); };

      function fail(msg) { loadEl.style.display = 'grid'; loadEl.textContent = msg; bar.style.display = 'none'; tabs.style.display = 'none'; sub.style.display = 'none'; panel.style.display = 'none'; }

      /* ---------- 3D preview (same camera/light setup as the creator) ---------- */
      function startStage() {
        renderer = new T.WebGLRenderer({ canvas, antialias: true, alpha: true, powerPreference: 'default' });
        renderer.outputEncoding = T.sRGBEncoding; renderer.setPixelRatio(Math.min(2, g.devicePixelRatio || 1));
        scene = new T.Scene(); cam = new T.PerspectiveCamera(24, 1, 0.1, 50);
        scene.add(new T.HemisphereLight(0xffffff, 0x6b7280, 0.7)); const key = new T.DirectionalLight(0xfff0dd, 0.7); key.position.set(2, 3.5, 3); scene.add(key);
        const rim = new T.DirectionalLight(0x88aaff, 0.35); rim.position.set(-3, 2, -2); scene.add(rim);
        const disc = new T.Mesh(new T.CircleGeometry(0.75, 40), new T.MeshLambertMaterial({ color: 0x1b3a2d })); disc.rotation.x = -Math.PI / 2; scene.add(disc);
        pivot = new T.Group(); scene.add(pivot);
        const size = () => { const r = canvas.getBoundingClientRect(); if (!r.width) return; renderer.setSize(r.width, r.height, false); cam.aspect = r.width / r.height; cam.updateProjectionMatrix(); };
        ro = new ResizeObserver(size); ro.observe(canvas); size();
        let drag = null;
        canvas.addEventListener('pointerdown', e => { drag = { x: e.clientX, r: rotY }; spin = false; bSpin.textContent = 'Spin'; canvas.setPointerCapture(e.pointerId); });
        canvas.addEventListener('pointermove', e => { if (drag) rotY = drag.r + (e.clientX - drag.x) * 0.012; });
        canvas.addEventListener('pointerup', () => { drag = null; });
        let last = performance.now();
        const frame = (now) => { if (dead) return; raf = requestAnimationFrame(frame); const dt = Math.min(0.05, (now - last) / 1000); last = now; if (spin) rotY += dt * 0.5; pivot.rotation.y = rotY; if (av) av.update(dt);
          camY += (tY - camY) * Math.min(1, dt * 7); camD += (tD - camD) * Math.min(1, dt * 7); cam.position.set(0, camY + 0.15, camD); cam.lookAt(0, camY, 0); renderer.render(scene, cam); };
        raf = requestAnimationFrame(frame);
      }
      function rebuild() {
        if (dead || !renderer) return;
        const next = FA.create(look, { lod: 0, material: 'standard' });
        if (av) { pivot.remove(av.group); av.dispose(); } av = next; av.setPose('idle'); pivot.add(av.group); loadEl.style.display = 'none';
      }
      const changed = () => { clearTimeout(timer); timer = setTimeout(rebuild, 90); paintBar(); };
      bFocus.onclick = () => { focus = focus === 'body' ? 'face' : 'body'; bFocus.textContent = focus === 'body' ? 'Zoom to face' : 'Full body'; tY = focus === 'body' ? 0.93 : 1.62; tD = focus === 'body' ? 5.3 : 2.3; };
      bSpin.onclick = () => { spin = !spin; bSpin.textContent = spin ? 'Stop spin' : 'Spin'; };

      /* ---------- pickers (only look.wear is touched) ---------- */
      function patchWear(fn) { const w = clone(look.wear || {}); fn(w); const next = clone(saved); next.wear = w; look = FA.look.normalize(next); changed(); draw(); }   // body/face/hair always come from the saved look
      function row(title, node) { const r = h('div', 'cl-row'), l = h('label', '', title); r.append(l, node); return r; }
      function chips(items, cur, onPick) { const w = h('div', 'cl-chips'); items.forEach(it => { const b = h('button', 'cl-chip' + (it.id === cur ? ' on' : ''), it.label); b.type = 'button'; b.onclick = () => onPick(it); w.appendChild(b); }); return w; }
      function swatches(pal, cur, onPick, allowNone) {
        const w = h('div', 'cl-sw');
        if (allowNone) { const n = h('button', 'none' + (cur == null ? ' on' : '')); n.type = 'button'; n.title = 'None'; n.setAttribute('aria-label', 'None'); n.onclick = () => onPick(null); w.appendChild(n); }
        pal.forEach((c, i) => { const b = h('button', i === cur ? 'on' : ''); b.type = 'button'; b.style.background = typeof c === 'string' ? c : '#' + Number(c).toString(16).padStart(6, '0'); b.setAttribute('aria-label', 'Colour ' + (i + 1)); b.onclick = () => onPick(i); w.appendChild(b); });
        return w;
      }
      function draw() {
        tabs.querySelectorAll('button').forEach(b => b.classList.toggle('on', b.dataset.g === group));
        const slots = (group === 'clothes' ? CLOTH_SLOTS : EXTRA_SLOTS).filter(([k]) => !(look.body.frame === 'm' && k === 'dress'));
        if (!slots.some(([k]) => k === slot[group])) slot[group] = slots[0][0];
        sub.innerHTML = ''; slots.forEach(([k, t]) => { const b = h('button', k === slot[group] ? 'on' : '', t); b.type = 'button'; b.onclick = () => { slot[group] = k; panel.scrollTop = 0; draw(); }; sub.appendChild(b); });
        const st = panel.scrollTop; panel.innerHTML = '';
        const k = slot[group], O = FA.OPTIONS, cat = forFrame(O.wear[k]).filter(x => !x.restricted), cur = look.wear[k], curId = cur ? cur.id : 'none';
        const must = (k === 'top' || k === 'bottom' || k === 'shoes');   // these can be changed but not taken off
        const list = must ? cat : (cat.some(x => x.id === 'none') ? cat : [{ id: 'none', label: 'None' }].concat(cat));
        panel.appendChild(row('Style', chips(list, curId, it => patchWear(w => {
          if (it.id === 'none') delete w[k];
          else {
            const old = w[k] || {}; w[k] = { id: it.id, c: old.c != null ? old.c : Math.floor(Math.random() * O.palettes.cloth.length), c2: old.c2, p: old.p };
            if (k === 'dress') { delete w.top; delete w.bottom; }
            if ((k === 'top' || k === 'bottom') && w.dress) delete w.dress;
          }
        }))));
        const def = cat.find(x => x.id === curId);
        if (cur && curId !== 'none') {
          const C = O.palettes.cloth;
          panel.appendChild(row('Colour', swatches(C, cur.c, i => patchWear(w => { w[k].c = i; }))));
          panel.appendChild(row('Second colour', swatches(C, cur.c2 == null ? null : cur.c2, i => patchWear(w => { if (i == null) delete w[k].c2; else w[k].c2 = i; }), true)));
          if (def && def.pat) { const pats = [{ id: '', label: 'Plain' }].concat(O.patterns.filter(p => p !== 'flat' && p !== 'fabric').map(p => ({ id: p, label: p.replace('_', ' ') }))); panel.appendChild(row('Pattern', chips(pats, cur.p || '', it => patchWear(w => { if (it.id) w[k].p = it.id; else delete w[k].p; })))); }
        }
        panel.scrollTop = st; paintBar();
      }

      /* ---------- save / undo ---------- */
      bUndo.onclick = () => { look = clone(saved); changed(); draw(); rebuild(); };
      bSave.onclick = async () => {
        bSave.disabled = true; bUndo.disabled = true; bSave.textContent = 'Saving…';
        try {
          const out = clone(saved); out.wear = clone(look.wear);   // everything except clothes comes from the saved look
          const r = await g.FutaApi.saveAvatar(out), clean = FA.look.normalize(r && r.look ? r.look : out);
          saved = clean; look = clone(clean); leaveArmed = false;
          if (Ph.refreshUser) Ph.refreshUser();
          if (!demo && g.FUTA_LIVE && g.FUTA_LIVE.setLook && g.FutaApi.sb) { try { const q = await g.FutaApi.sb().from('profiles').select('avatar_hash').eq('id', u.id).single(); if (q.data) g.FUTA_LIVE.setLook(q.data.avatar_hash); } catch (e) { /* other players update on their next refresh */ } }
          Ph.toast('Outfit saved. Looking good!');
        } catch (e) { Ph.toast((e && e.message) || 'Could not save your outfit. Try again.'); }
        bSave.textContent = 'Save outfit'; if (!dead) { changed(); draw(); }
      };

      /* ---------- start ---------- */
      (async function init() {
        if (!u) { fail('Sign in (Settings) to change your clothes.'); return; }
        try { await loadEngine(ctx.phone.BASE); } catch (e) { fail('Could not load the wardrobe. Check your connection and reopen the app.'); return; }
        if (dead) return;
        FA = g.FutaAvatar; T = g.THREE;
        let base = u.avatar;
        if (!base && demo) { try { base = JSON.parse(localStorage.getItem('futa.avatar.draft.v1')); } catch (e) { base = null; } if (!base) base = FA.look.random('f', 7); }
        if (!base) { fail('Finish creating your character first, then come back to change clothes.'); return; }
        saved = FA.look.normalize(base); look = clone(saved);
        try { startStage(); } catch (e) { fail('Your device could not start the 3D preview (WebGL).'); return; }
        draw(); rebuild();
      })();

      return {
        destroy() { dead = true; cancelAnimationFrame(raf); clearTimeout(timer); if (ro) ro.disconnect(); if (av) av.dispose(); if (renderer) renderer.dispose(); },
        back() { if (saved && dirty() && !leaveArmed) { leaveArmed = true; Ph.toast('Unsaved outfit. Tap Save outfit, or press back again to leave.'); return true; } return false; }
      };
    }
  });
})(window);
