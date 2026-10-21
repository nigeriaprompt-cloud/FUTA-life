/* ==========================================================================
   FutaCreator — the character creator widget (live 3D preview + option panels).
   Data-driven: every list of choices comes from FutaAvatar.OPTIONS (avatar-options.json).
   Add a hairstyle / garment to the JSON and it appears here by itself.

   Usage:   const c = FutaCreator.mount(containerEl, { look, onChange(look){} });
            c.getLook()  c.setLook(look)  c.randomize()  c.dispose()
   Needs: three.min.js (r128) + avatar-*.js loaded first.
   ========================================================================== */
(function (global) {
  'use strict';
  const T = global.THREE, FA = global.FutaAvatar;
  const O = () => FA.OPTIONS, $ = (h) => { const d = document.createElement('div'); d.innerHTML = h.trim(); return d.firstChild; };
  const hexOf = (pal, i) => pal[i % pal.length];
  const DRAFT_KEY = 'futa.avatar.draft.v1';
  const TABS = [['body', 'Body'], ['face', 'Face'], ['hair', 'Hair'], ['makeup', 'Makeup'], ['clothes', 'Clothes'], ['extras', 'Extras']];
  const CLOTH_SLOTS = [['top', 'Top'], ['bottom', 'Bottom'], ['dress', 'Dress'], ['layer', 'Layer'], ['shoes', 'Shoes']];
  const EXTRA_SLOTS = [['head', 'Headwear'], ['glasses', 'Glasses'], ['bag', 'Bag'], ['neck', 'Neck'], ['wrist', 'Wrist'], ['ears', 'Ears']];

  function mount(root, opts) {
    opts = opts || {};
    let look = FA.look.normalize(opts.look || FA.look.random('f', Date.now() % 100000)), tab = 'body', slot = { clothes: 'top', extras: 'head' }, av = null, rotY = 0.35, autoSpin = true, focus = 'body', pose = 'idle', build = 0;
    root.innerHTML = '';
    const el = $('<div class="cr"><div class="cr-stage"><canvas></canvas><div class="cr-loading">Loading…</div><div class="cr-fab tr"><button class="cr-ic" data-a="rand">🎲 Random</button></div><div class="cr-fab bl"><button class="cr-ic" data-a="focus">🔍 Face</button></div><div class="cr-fab br"><button class="cr-ic" data-pose="idle">Idle</button><button class="cr-ic" data-pose="wave">Wave</button><button class="cr-ic" data-pose="dance">Dance</button></div></div><div class="cr-tabs"></div><div class="cr-panel"></div></div>');
    root.appendChild(el);
    const canvas = el.querySelector('canvas'), tabsEl = el.querySelector('.cr-tabs'), panel = el.querySelector('.cr-panel'), loadEl = el.querySelector('.cr-loading');

    /* ---------------- 3D preview ---------------- */
    const renderer = new T.WebGLRenderer({ canvas, antialias: true, alpha: true, powerPreference: 'default' });
    renderer.outputEncoding = T.sRGBEncoding; renderer.setPixelRatio(Math.min(2, global.devicePixelRatio || 1));
    const scene = new T.Scene(), cam = new T.PerspectiveCamera(24, 1, 0.1, 50);
    scene.add(new T.HemisphereLight(0xffffff, 0x6b7280, 0.7)); const key = new T.DirectionalLight(0xfff0dd, 0.7); key.position.set(2, 3.5, 3); scene.add(key);
    const rim = new T.DirectionalLight(0x88aaff, 0.35); rim.position.set(-3, 2, -2); scene.add(rim);
    const disc = new T.Mesh(new T.CircleGeometry(0.75, 40), new T.MeshLambertMaterial({ color: 0x232a36 })); disc.rotation.x = -Math.PI / 2; scene.add(disc);
    const pivot = new T.Group(); scene.add(pivot);
    let camY = 0.93, camD = 5.3, tY = 0.93, tD = 5.3;
    function size() { const r = canvas.getBoundingClientRect(); if (!r.width) return; renderer.setSize(r.width, r.height, false); cam.aspect = r.width / r.height; cam.updateProjectionMatrix(); }
    function rebuild() {
      const t0 = performance.now();
      const next = FA.create(look, { lod: 0, material: 'standard' });
      if (av) { pivot.remove(av.group); av.dispose(); } av = next; av.setPose(pose); pivot.add(av.group); loadEl.style.display = 'none'; build = performance.now() - t0;
      el.dispatchEvent(new CustomEvent('built', { detail: { ms: build, tris: av.info.tris } }));
    }
    let timer = 0; function changed(instant) { try { localStorage.setItem(DRAFT_KEY, JSON.stringify(look)); } catch (e) { } opts.onChange && opts.onChange(look); clearTimeout(timer); timer = setTimeout(rebuild, instant ? 0 : 90); }
    let last = performance.now(), raf = 0;
    function frame(now) { raf = requestAnimationFrame(frame); const dt = Math.min(0.05, (now - last) / 1000); last = now; if (autoSpin) rotY += dt * 0.5; pivot.rotation.y = rotY; if (av) av.update(dt);
      camY += (tY - camY) * Math.min(1, dt * 7); camD += (tD - camD) * Math.min(1, dt * 7); cam.position.set(0, camY + 0.15, camD); cam.lookAt(0, camY, 0); renderer.render(scene, cam); }
    let drag = null; canvas.addEventListener('pointerdown', e => { drag = { x: e.clientX, r: rotY }; autoSpin = false; canvas.setPointerCapture(e.pointerId); });
    canvas.addEventListener('pointermove', e => { if (drag) rotY = drag.r + (e.clientX - drag.x) * 0.012; }); canvas.addEventListener('pointerup', () => { drag = null; });
    new ResizeObserver(size).observe(canvas); size();
    el.querySelector('[data-a=focus]').onclick = function () { focus = focus === 'body' ? 'face' : 'body'; this.textContent = focus === 'body' ? '🔍 Face' : '🧍 Body'; tY = focus === 'body' ? 0.93 : 1.62; tD = focus === 'body' ? 5.3 : 2.3; };
    el.querySelector('[data-a=rand]').onclick = () => { randomize(); };
    el.querySelectorAll('[data-pose]').forEach(b => b.onclick = () => { pose = b.dataset.pose; av && av.setPose(pose); el.querySelectorAll('[data-pose]').forEach(x => x.classList.toggle('on', x === b)); });

    /* ---------------- panels ---------------- */
    const forFrame = (list) => list.filter(x => x.for === 'u' || x.for === look.body.frame || !x.for);
    function chips(items, cur, onPick) { const w = $('<div class="cr-chips"></div>'); items.forEach(it => { const b = $('<button class="cr-chip"></button>'); b.textContent = it.label; if (it.id === cur) b.classList.add('on'); b.onclick = () => onPick(it); w.appendChild(b); }); return w; }
    function swatches(pal, cur, onPick, allowNone) { const w = $('<div class="cr-sw"></div>'); if (allowNone) { const n = $('<button class="none" title="None"></button>'); if (cur == null) n.classList.add('on'); n.onclick = () => onPick(null); w.appendChild(n); } pal.forEach((h, i) => { const b = $('<button></button>'); b.style.background = h; if (i === cur) b.classList.add('on'); b.onclick = () => onPick(i); w.appendChild(b); }); return w; }
    function row(title, node, right) { const r = $('<div class="cr-row"><label><span></span><span></span></label></div>'); r.querySelector('span').textContent = title; if (right) r.querySelectorAll('span')[1].textContent = right; r.appendChild(node); return r; }
    function slider(key, lo, hi) { const i = $('<input type="range" step="0.01">'); i.min = lo; i.max = hi; i.value = look.body[key]; i.oninput = () => { look.body[key] = +i.value; changed(); }; return i; }
    function setLook(l, instant) { look = FA.look.normalize(l); draw(); changed(instant !== false); }
    /* opts.lockHair: the player already finished sign-up, so hair/beard can only be changed (and paid for) in a salon. Everything else stays editable. */
    const hairLock = opts.lockHair ? { hair: JSON.parse(JSON.stringify(look.hair)), beard: look.beard } : null;
    const keepHair = () => { if (hairLock) { look.hair = JSON.parse(JSON.stringify(hairLock.hair)); look.beard = hairLock.beard; } };
    function patch(fn) { fn(look); keepHair(); look = FA.look.normalize(look); changed(); draw(); }

    function drawBody() {
      const seg = $('<div class="fo-seg"><button data-f="f">Female</button><button data-f="m">Male</button></div>'); seg.querySelectorAll('button').forEach(b => { b.classList.toggle('on', b.dataset.f === look.body.frame); b.onclick = () => { if (look.body.frame === b.dataset.f) return; const keep = look.skin; look = FA.look.random(b.dataset.f, Date.now() % 99999); look.skin = keep; look = FA.look.normalize(look); changed(true); draw(); }; });
      panel.appendChild(seg);
      panel.appendChild(row('Skin tone', swatches(O().palettes.skin, look.skin, i => patch(l => { l.skin = i; }))));
      panel.appendChild(row('Height', slider('height', 0.92, 1.08)));
      panel.appendChild(row('Build', slider('build', 0, 1)));
      if (look.body.frame === 'f') panel.appendChild(row('Bust', slider('bust', 0, 1)));
      panel.appendChild(row('Hips', slider('hips', 0, 1)));
      panel.appendChild(row('Shoulders', slider('shoulders', 0, 1)));
    }
    function drawFace() {
      const F = O().face;
      [['shape', 'Face shape'], ['eyes', 'Eyes'], ['brows', 'Brows'], ['nose', 'Nose'], ['lips', 'Lips']].forEach(([k, t]) => {
        const items = Array.from({ length: F[k].count }, (_, i) => ({ id: i, label: (F[k].labels && F[k].labels[i]) || (t + ' ' + (i + 1)) }));
        panel.appendChild(row(t, chips(items, look.face[k], it => patch(l => { l.face[k] = it.id; }))));
      });
      panel.appendChild(row('Eye colour', swatches(O().palettes.eye, look.face.eyeColor, i => patch(l => { l.face.eyeColor = i; }))));
    }
    function drawHair() {
      const H = O();
      if (hairLock) { const n = $('<div class="cr-note" style="padding:14px 6px;line-height:1.5">💇 Hair and beard are changed at a <b>salon</b> (the price is taken from your pocket). Visit any salon on the map.</div>'); panel.appendChild(n); return; }
      panel.appendChild(row('Style', chips(forFrame(H.hair.styles), look.hair.style, it => patch(l => { l.hair.style = it.id; }))));
      panel.appendChild(row('Hair colour', swatches(H.palettes.hair, look.hair.color, i => patch(l => { l.hair.color = i; }))));
      const sh = $('<button class="cr-chip">🔀 Shuffle strands</button>'); sh.onclick = () => patch(l => { l.hair.seed = Math.floor(Math.random() * 9999); }); panel.appendChild(sh);
      if (look.body.frame === 'm') { const r = row('Beard', chips(H.beard.styles, look.beard, it => patch(l => { l.beard = it.id; }))); r.style.marginTop = '16px'; panel.appendChild(r); }
    }
    function drawMakeup() {
      const P = O().palettes, m = look.makeup || {};
      panel.appendChild(row('Lip colour', swatches(P.lip, m.lips == null ? null : m.lips, i => patch(l => { l.makeup = l.makeup || {}; if (i == null) delete l.makeup.lips; else l.makeup.lips = i; }), true)));
      panel.appendChild(row('Eyeshadow', swatches(P.shadow, m.shadow == null ? null : m.shadow, i => patch(l => { l.makeup = l.makeup || {}; if (i == null) delete l.makeup.shadow; else l.makeup.shadow = i; }), true)));
      panel.appendChild(row('Blush', swatches(P.blush, m.blush == null ? null : m.blush, i => patch(l => { l.makeup = l.makeup || {}; if (i == null) delete l.makeup.blush; else l.makeup.blush = i; }), true)));
      const tg = (k, t) => { const b = $('<button class="cr-chip"></button>'); b.textContent = t; if (m[k]) b.classList.add('on'); b.onclick = () => patch(l => { l.makeup = l.makeup || {}; if (l.makeup[k]) delete l.makeup[k]; else l.makeup[k] = true; }); return b; };
      const w = $('<div class="cr-chips"></div>'); w.appendChild(tg('lashes', 'Lashes')); w.appendChild(tg('liner', 'Eyeliner')); panel.appendChild(row('Eyes', w));
      panel.appendChild(row('Nail colour', swatches(P.nail, look.nails == null ? null : look.nails, i => patch(l => { if (i == null) delete l.nails; else l.nails = i; }), true)));
    }
    function drawItems(slots, group) {
      const sub = $('<div class="cr-sub"></div>'); slots.forEach(([k, t]) => { if (look.body.frame === 'm' && k === 'dress') return; const b = $('<button></button>'); b.textContent = t; if (slot[group] === k) b.classList.add('on'); b.onclick = () => { slot[group] = k; draw(); }; sub.appendChild(b); }); panel.appendChild(sub);
      const k = slot[group]; if (look.body.frame === 'm' && k === 'dress') slot[group] = 'top';
      const cat = forFrame(O().wear[k]).filter(x => !x.restricted), cur = look.wear[k], curId = cur ? cur.id : 'none';
      const list = (k === 'top' || k === 'bottom' || k === 'shoes') ? cat : (cat.some(x => x.id === 'none') ? cat : [{ id: 'none', label: 'None' }].concat(cat));
      panel.appendChild(row('Style', chips(list, curId, it => patch(l => { if (it.id === 'none') delete l.wear[k]; else { const old = l.wear[k] || {}; l.wear[k] = { id: it.id, c: old.c != null ? old.c : Math.floor(Math.random() * 24), c2: old.c2, p: old.p }; if (k === 'dress' && it.id !== 'none') { delete l.wear.top; delete l.wear.bottom; } if ((k === 'top' || k === 'bottom') && l.wear.dress) delete l.wear.dress; } }))));
      const def = cat.find(x => x.id === curId);
      if (cur && curId !== 'none') {
        const C = O().palettes.cloth;
        panel.appendChild(row('Colour', swatches(C, cur.c, i => patch(l => { l.wear[k].c = i; }))));
        panel.appendChild(row('Second colour', swatches(C, cur.c2 == null ? null : cur.c2, i => patch(l => { if (i == null) delete l.wear[k].c2; else l.wear[k].c2 = i; }), true)));
        if (def && def.pat) { const pats = [{ id: '', label: 'Plain' }].concat(O().patterns.filter(p => p !== 'flat' && p !== 'fabric').map(p => ({ id: p, label: p.replace('_', ' ') }))); panel.appendChild(row('Pattern', chips(pats, cur.p || '', it => patch(l => { if (it.id) l.wear[k].p = it.id; else delete l.wear[k].p; })))); }
      }
    }
    function draw() {
      tabsEl.querySelectorAll('button').forEach(b => b.classList.toggle('on', b.dataset.t === tab));
      const st = panel.scrollTop; panel.innerHTML = '';
      ({ body: drawBody, face: drawFace, hair: drawHair, makeup: drawMakeup, clothes: () => drawItems(CLOTH_SLOTS, 'clothes'), extras: () => drawItems(EXTRA_SLOTS, 'extras') })[tab](); panel.scrollTop = st;
    }
    TABS.forEach(([k, t]) => { const b = $('<button></button>'); b.dataset.t = k; b.textContent = t; b.onclick = () => { tab = k; panel.scrollTop = 0; draw(); }; tabsEl.appendChild(b); });
    function randomize() { const f = look.body.frame; look = FA.look.random(f, Math.floor(Math.random() * 1e9)); keepHair(); look = FA.look.normalize(look); changed(true); draw(); }

    draw(); rebuild(); raf = requestAnimationFrame(frame);
    return { el, getLook: () => JSON.parse(JSON.stringify(look)), setLook, randomize, lastBuildMs: () => build, dispose() { cancelAnimationFrame(raf); clearTimeout(timer); av && av.dispose(); renderer.dispose(); root.innerHTML = ''; } };
  }
  function loadDraft() { try { const s = localStorage.getItem(DRAFT_KEY); return s ? JSON.parse(s) : null; } catch (e) { return null; } }
  global.FutaCreator = { mount, loadDraft, DRAFT_KEY };
})(window);
