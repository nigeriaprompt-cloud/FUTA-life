/* ==========================================================================
   FutaSalon — the hairdresser / barber screen inside a salon interior.
   WHAT IT DOES: a full-screen panel with a live 3D preview where the player picks a hair style, hair colour and (men) a beard — the SAME
   choices as the Hair tab in sign-up. Only look.hair and look.beard change; gender, skin, body, face, makeup and clothes stay exactly as saved.
   GENDER: styles come from avatar/avatar-options.json and are filtered by the saved look's body.frame ('m' or 'f'): each style has for:'m' | 'f' | 'u'
   (u = unisex). Beard options are shown for men only. Add a hairstyle to the JSON + run tools/build-options.py and it shows up here by itself.
   MONEY: this file never touches money. The engine passes in  save(look)  which calls the server RPC save_hair: ONE atomic call that takes the price (activity
   "get_hair") from the pocket AND saves the hair/beard, or does neither (no money, cooldown, wrong place -> nothing charged, nothing saved).
   (An optional  pay()  is still supported: if given it runs first, and a later save failure then says the player was already charged.)
   USE:   FutaSalon.open({ look, price, save, pay?, onDone(look, stats), onClose() })  →  { close() }
   All text is inserted with textContent. The 3D engine (three.js + avatar-*.js) is already loaded by interior.html.
   ========================================================================== */
(function (g) {
  'use strict';
  const h = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; };
  const clone = (o) => JSON.parse(JSON.stringify(o));
  const naira = (n) => '₦' + Number(n || 0).toLocaleString('en-NG');

  const CSS = ':host{all:initial}' +
    '*{box-sizing:border-box}button{font:inherit;cursor:pointer;border:0;background:none;color:inherit;padding:0}' +
    '.sl{position:fixed;inset:0;z-index:90;display:flex;align-items:flex-end;justify-content:center;background:#0b1022b8;font:14px system-ui,sans-serif;color:#1b2b24;-webkit-user-select:none;user-select:none}' +
    '.sl-card{width:min(520px,100vw);height:min(760px,100dvh);display:flex;flex-direction:column;background:#fbf8f1;border-radius:18px 18px 0 0;overflow:hidden;box-shadow:0 -10px 40px #0009}' +
    '@media (min-width:700px){.sl{align-items:center}.sl-card{border-radius:18px;height:min(720px,94dvh)}}' +
    '.sl-top{flex:none;display:flex;align-items:center;gap:.6em;padding:.8em 1em;background:linear-gradient(#1f5a43,#173f2e);color:#f6e3a1;border-bottom:2px solid #d4a72c}' +
    '.sl-top b{font:700 1.15em Georgia,serif;flex:1}.sl-price{background:#0004;border-radius:999px;padding:.3em .8em;font-weight:700;font-size:.9em;color:#fff}' +
    '.sl-x{width:2em;height:2em;border-radius:50%;background:#0004;color:#fff;font-size:1.2em;line-height:1}' +
    '.sl-stage{position:relative;flex:none;height:42%;min-height:210px;background:radial-gradient(80% 70% at 50% 35%,#2d6a4f 0,#173f2e 62%,#0e2a1f 100%);overflow:hidden;touch-action:pan-y}' +
    '.sl-stage canvas{position:absolute;inset:0;width:100%;height:100%;display:block;touch-action:none}' +
    '.sl-load{position:absolute;inset:0;display:grid;place-items:center;color:#f0d78c;text-align:center;padding:1em;background:#0e2a1f}' +
    '.sl-fab{position:absolute;display:flex;gap:.4em}.sl-fab.tr{right:.6em;top:.6em}.sl-fab.bl{left:.6em;bottom:.6em}' +
    '.sl-ic{border:1px solid #ffffff33;background:#0009;color:#fff;border-radius:999px;padding:.4em .8em;font-size:.82em}' +
    '.sl-panel{flex:1;min-height:0;overflow:auto;padding:.9em 1em 1em;-webkit-user-select:none}' +
    '.sl-note{font-size:.82em;color:#6b7a72;margin:0 0 .9em}' +
    '.sl-row{margin-bottom:1.1em}.sl-row>label{display:block;font-size:.78em;letter-spacing:.06em;text-transform:uppercase;color:#6b7a72;margin-bottom:.5em}' +
    '.sl-chips{display:flex;flex-wrap:wrap;gap:.45em}.sl-chip{padding:.6em .85em;border-radius:.8em;border:1px solid #e3dcc8;background:#fff;color:#1b2b24}.sl-chip.on{border-color:#d4a72c;background:#fff6dd;font-weight:700;color:#173f2e}' +
    '.sl-sw{display:flex;flex-wrap:wrap;gap:.5em}.sl-sw button{width:2.2em;height:2.2em;border-radius:50%;border:2px solid #0002}.sl-sw button.on{outline:3px solid #d4a72c;outline-offset:2px}' +
    '.sl-err{margin:0 1em;padding:.6em .8em;border-radius:.7em;background:#fde8e6;color:#8a1c14;font-size:.88em;display:none}' +
    '.sl-bar{flex:none;display:flex;gap:.6em;padding:.7em 1em calc(.9em + env(safe-area-inset-bottom));background:#fbf8f1;border-top:1px solid #e3dcc8}' +
    '.sl-btn{flex:1;background:#173f2e;color:#f6e3a1;font-weight:700;padding:.9em;border-radius:.95em;text-align:center}.sl-btn:disabled{opacity:.45;cursor:default}.sl-btn.ghost{flex:none;background:#fff;color:#173f2e;border:1px solid #e3dcc8}';

  function open(o) {
    const FA = g.FutaAvatar, T = g.THREE; if (!FA || !T) throw new Error('3D engine not loaded');
    const H = FA.OPTIONS, saved = FA.look.normalize(o.look); let look = clone(saved), dead = false, busy = false, raf = 0, ro = null, timer = 0;
    const frame = saved.body.frame, isMan = frame === 'm';
    const styles = H.hair.styles.filter(s => !s.for || s.for === 'u' || s.for === frame);     // gender rule: u = everyone, m / f = that frame only
    const price = Math.abs(o.price || 0);

    const host = h('div'); host.id = 'futaSalonHost'; document.body.appendChild(host);
    const sr = host.attachShadow({ mode: 'open' }); const st = h('style'); st.textContent = CSS; sr.appendChild(st);
    ['pointerdown', 'pointermove', 'pointerup', 'wheel', 'touchstart', 'touchmove', 'mousedown', 'keydown', 'keyup'].forEach(ev => host.addEventListener(ev, e => e.stopPropagation(), { passive: true }));   // the room underneath must not react
    const root = h('div', 'sl'); root.setAttribute('role', 'dialog'); root.setAttribute('aria-label', isMan ? 'Barber' : 'Hair salon'); sr.appendChild(root);
    const card = h('div', 'sl-card'); root.appendChild(card);
    const top = h('div', 'sl-top'), title = h('b', '', isMan ? 'Barber & beard' : 'Hair salon'), tag = h('span', 'sl-price', price ? naira(price) : 'Free'), x = h('button', 'sl-x', '×'); x.type = 'button'; x.setAttribute('aria-label', 'Close');
    top.append(title, tag, x);
    const stage = h('div', 'sl-stage'), canvas = h('canvas'), loadEl = h('div', 'sl-load', 'Getting the chair ready…'), fabTr = h('div', 'sl-fab tr'), fabBl = h('div', 'sl-fab bl');
    const bSpin = h('button', 'sl-ic', 'Stop spin'), bFocus = h('button', 'sl-ic', 'Full body'); bSpin.type = bFocus.type = 'button'; fabTr.appendChild(bSpin); fabBl.appendChild(bFocus); stage.append(canvas, loadEl, fabTr, fabBl);
    const panel = h('div', 'sl-panel'), err = h('div', 'sl-err'), bar = h('div', 'sl-bar'), bCancel = h('button', 'sl-btn ghost', 'Cancel'), bPay = h('button', 'sl-btn', price ? 'Pay ' + naira(price) + ' & save' : 'Save'); bCancel.type = bPay.type = 'button'; bar.append(bCancel, bPay);
    card.append(top, stage, panel, err, bar);

    /* ---------- 3D preview: head-and-shoulders by default, since this is about hair ---------- */
    let rotY = 0.35, spin = true, view = 'head', camY = 1.6, camD = 2.6, tY = 1.6, tD = 2.6, av = null;
    const renderer = new T.WebGLRenderer({ canvas, antialias: true, alpha: true, powerPreference: 'default' }); renderer.outputEncoding = T.sRGBEncoding; renderer.setPixelRatio(Math.min(2, g.devicePixelRatio || 1));
    const scene = new T.Scene(), cam = new T.PerspectiveCamera(24, 1, 0.1, 50); scene.add(new T.HemisphereLight(0xffffff, 0x6b7280, 0.7));
    const key = new T.DirectionalLight(0xfff0dd, 0.7); key.position.set(2, 3.5, 3); scene.add(key); const rim = new T.DirectionalLight(0x88aaff, 0.35); rim.position.set(-3, 2, -2); scene.add(rim);
    const disc = new T.Mesh(new T.CircleGeometry(0.75, 40), new T.MeshLambertMaterial({ color: 0x1b3a2d })); disc.rotation.x = -Math.PI / 2; scene.add(disc);
    const pivot = new T.Group(); scene.add(pivot);
    const size = () => { const r = canvas.getBoundingClientRect(); if (!r.width) return; renderer.setSize(r.width, r.height, false); cam.aspect = r.width / r.height; cam.updateProjectionMatrix(); };
    ro = new ResizeObserver(size); ro.observe(canvas); size();
    let drag = null; canvas.addEventListener('pointerdown', e => { drag = { x: e.clientX, r: rotY }; spin = false; bSpin.textContent = 'Spin'; canvas.setPointerCapture(e.pointerId); });
    canvas.addEventListener('pointermove', e => { if (drag) rotY = drag.r + (e.clientX - drag.x) * 0.012; }); canvas.addEventListener('pointerup', () => { drag = null; });
    let last = performance.now();
    (function loop(now) { if (dead) return; raf = requestAnimationFrame(loop); const dt = Math.min(0.05, (now - last) / 1000); last = now; if (spin) rotY += dt * 0.5; pivot.rotation.y = rotY; if (av) av.update(dt);
      camY += (tY - camY) * Math.min(1, dt * 7); camD += (tD - camD) * Math.min(1, dt * 7); cam.position.set(0, camY + 0.12, camD); cam.lookAt(0, camY, 0); renderer.render(scene, cam); })(last);
    const rebuild = () => { if (dead) return; const next = FA.create(look, { lod: 0, material: 'standard' }); if (av) { pivot.remove(av.group); av.dispose(); } av = next; av.setPose('idle'); pivot.add(av.group); loadEl.style.display = 'none'; };
    bSpin.onclick = () => { spin = !spin; bSpin.textContent = spin ? 'Stop spin' : 'Spin'; };
    bFocus.onclick = () => { view = view === 'head' ? 'body' : 'head'; bFocus.textContent = view === 'head' ? 'Full body' : 'Close up'; tY = view === 'head' ? 1.6 : 0.93; tD = view === 'head' ? 2.6 : 5.3; };

    /* ---------- pickers: only hair (+ beard for men) are touched; everything else is copied from the saved look ---------- */
    const dirty = () => JSON.stringify([look.hair, look.beard || 'none']) !== JSON.stringify([saved.hair, saved.beard || 'none']);
    const paint = () => { bPay.disabled = busy || !dirty(); bCancel.disabled = busy; };
    function patch(fn) { const next = clone(saved); next.hair = clone(look.hair); next.beard = look.beard; fn(next); look = FA.look.normalize(next); clearTimeout(timer); timer = setTimeout(rebuild, 80); draw(); }
    const row = (t, node) => { const r = h('div', 'sl-row'); r.append(h('label', '', t), node); return r; };
    function draw() {
      const st0 = panel.scrollTop; panel.innerHTML = '';
      panel.appendChild(h('p', 'sl-note', isMan ? 'Styles for men. Your face, body and clothes stay as they are.' : 'Styles for women. Your face, body and clothes stay as they are.'));
      const chips = h('div', 'sl-chips'); styles.forEach(s => { const b = h('button', 'sl-chip' + (s.id === look.hair.style ? ' on' : ''), s.label); b.type = 'button'; b.onclick = () => patch(l => { l.hair.style = s.id; }); chips.appendChild(b); }); panel.appendChild(row('Style', chips));
      const sw = h('div', 'sl-sw'); H.palettes.hair.forEach((c, i) => { const b = h('button', i === look.hair.color ? 'on' : ''); b.type = 'button'; b.style.background = c; b.setAttribute('aria-label', 'Hair colour ' + (i + 1)); b.onclick = () => patch(l => { l.hair.color = i; }); sw.appendChild(b); }); panel.appendChild(row('Hair colour', sw));
      const sh = h('button', 'sl-chip', '🔀 Shuffle strands'); sh.type = 'button'; sh.onclick = () => patch(l => { l.hair.seed = Math.floor(Math.random() * 9999); }); panel.appendChild(row('Strands', sh));
      if (isMan) { const bc = h('div', 'sl-chips'); H.beard.styles.forEach(s => { const b = h('button', 'sl-chip' + (s.id === (look.beard || 'none') ? ' on' : ''), s.label); b.type = 'button'; b.onclick = () => patch(l => { l.beard = s.id; }); bc.appendChild(b); }); panel.appendChild(row('Beard', bc)); }
      panel.scrollTop = st0; paint();
    }

    /* ---------- close / pay & save ---------- */
    function close() { if (dead) return; dead = true; cancelAnimationFrame(raf); clearTimeout(timer); if (ro) ro.disconnect(); if (av) av.dispose(); renderer.dispose(); host.remove(); document.removeEventListener('keydown', onKey); o.onClose && o.onClose(); }
    const onKey = (e) => { if (e.key === 'Escape' && !busy) close(); }; document.addEventListener('keydown', onKey);
    x.onclick = bCancel.onclick = () => { if (!busy) close(); };
    root.addEventListener('pointerdown', e => { if (e.target === root && !busy) close(); });
    const showErr = (m) => { err.textContent = m; err.style.display = m ? 'block' : 'none'; };
    bPay.onclick = async () => {
      if (busy || !dirty()) return; busy = true; showErr(''); bPay.textContent = 'Please wait…'; paint(); let stats = null;
      try { if (o.pay) stats = await o.pay(); } catch (e) { busy = false; bPay.textContent = price ? 'Pay ' + naira(price) + ' & save' : 'Save'; showErr((e && e.message) || 'Could not take payment. Try again.'); paint(); return; }   // nothing saved, nothing lost
      try { const out = clone(saved); out.hair = clone(look.hair); out.beard = look.beard; const r = await o.save(out); const clean = FA.look.normalize(r || out); busy = false; const cb = o.onDone; close(); cb && cb(clean, stats); }
      catch (e) {
        busy = false;
        if (o.pay) { bPay.textContent = 'Try saving again'; showErr('Payment went through but the style could not be saved: ' + ((e && e.message) || 'try again.') + ' Tap again to retry (you will not be charged twice).'); o.pay = null; }   // paid separately already: retry only saves
        else { bPay.textContent = price ? 'Pay ' + naira(price) + ' & save' : 'Save'; showErr(((e && e.message) || 'Could not save your new hair.') + ' You were not charged.'); }   // atomic save: failure means nothing was taken
        paint();
      }
    };

    try { draw(); rebuild(); } catch (e) { close(); throw e; }
    return { close };
  }
  g.FutaSalon = { open };
})(typeof window !== 'undefined' ? window : globalThis);
