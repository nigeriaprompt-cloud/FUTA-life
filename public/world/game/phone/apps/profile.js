/* Phone app: Profile — the page other players see when they tap a name (in Chat, the world card, or "My profile" on the phone home card).
   Shows: a rotating 3D portrait of the character, name, gender, "Standing" (highest level owned), join month, life story, a 4-tile summary,
   latest status (the 24-hour feed post), the outfit list, and the PROPERTY, CARS and ACCESSORIES the player owns (same pictures as the shop apps).
   NEVER shown (the server does not send them): age / birthday, email, money, prices paid, where the player is.
   Data: ONE call, the RPC get_profile(p_user) from supabase/12_profile.sql (run it!). Names/pictures of items come from the shop apps through g.FutaCatalog
   (property.js, cars.js, accessories.js export their LISTINGS + art()); if the server knows an id this build doesn't, it is simply skipped.
   Public API (used by chat.js and live/ui.js):
     FutaProfile.open({ id, username })              open the Profile app on top of the phone (shows the phone if hidden)
     FutaProfile.load(root, peer, { onMessage })     render into any element (Chat uses this so its Back button works)
   The app is registered with hidden:true — it has no home-screen icon.  Demo mode (no Supabase keys) invents a believable profile from the name.
   All server/user text goes in with textContent; only our own SVG pictures use innerHTML. */
(function (g) {
  'use strict';
  const Ph = g.FutaPhone; if (!Ph) return;
  const NEEDED = ['avatar-options.js', 'avatar-core.js', 'avatar-body.js', 'avatar-wear.js', 'avatar-rig.js', 'avatar-build.js'];
  const LV_NAMES = ['Starter', 'Comfort', 'Prestige', 'Luxury', 'Royal'];
  const STARTS = { fresh: 'Fresh student', hustler: 'Campus hustler', creative: 'The creative' };
  const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
  const NICE = { not_found: 'This profile isn’t available.', auth_required: 'Please sign in again.', slow_down: 'Slow down a little.', not_allowed: 'That isn’t allowed for this player.' };
  const nice = (e) => { const m = (e && e.message) || String(e || ''), k = Object.keys(NICE).find(x => m.indexOf(x) >= 0); return k ? NICE[k] : (m || 'Something went wrong.'); };
  const h = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; };
  const hash = (s) => { let x = 2166136261; s = String(s); for (let i = 0; i < s.length; i++) { x ^= s.charCodeAt(i); x = Math.imul(x, 16777619); } return x >>> 0; };

  const CSS = '.pf{--pf-serif:Georgia,"Iowan Old Style","Palatino Linotype",serif;background:var(--cream);color:var(--ink);min-height:100%;position:relative;padding-bottom:1.4em}' +
    '.pf *{box-sizing:border-box}' +
    /* hero */
    '.pf-hero{position:relative;padding:1.05em 1em 3.3em;text-align:center;color:#fff;overflow:hidden;background:radial-gradient(120% 75% at 50% 0,#2f6f53 0,#18432f 52%,#0a2217 100%)}' +
    '.pf-hero:before{content:"";position:absolute;inset:0;background:repeating-linear-gradient(135deg,rgba(240,215,140,.07) 0 1px,transparent 1px 15px);pointer-events:none}' +
    '.pf-hero:after{content:"";position:absolute;left:0;right:0;bottom:0;height:2.4em;background:linear-gradient(to bottom,transparent,rgba(0,0,0,.18))}' +
    '.pf-crest{position:relative;font-size:.66em;letter-spacing:.34em;text-transform:uppercase;color:var(--gold2);opacity:.9;margin-bottom:.9em}' +
    '.pf-crest:before,.pf-crest:after{content:"";display:inline-block;width:2.2em;height:1px;background:linear-gradient(90deg,transparent,var(--gold2));vertical-align:middle;margin:0 .8em}.pf-crest:after{transform:scaleX(-1)}' +
    '.pf-arch{position:relative;width:min(58%,196px);aspect-ratio:3/4.15;margin:0 auto;border-radius:999px 999px 1.1em 1.1em;border:2px solid var(--gold);box-shadow:0 0 0 5px rgba(201,162,74,.2),0 18px 38px rgba(0,0,0,.5),inset 0 0 40px rgba(0,0,0,.25);background:radial-gradient(90% 65% at 50% 28%,#4a9473 0,#215943 62%,#133a2b 100%);overflow:hidden;touch-action:none;cursor:grab}' +
    '.pf-arch canvas{position:absolute;inset:0;width:100%;height:100%;display:block}' +
    '.pf-ini{position:absolute;inset:0;display:grid;place-items:center;font:700 4em var(--pf-serif);color:var(--gold2);opacity:.85}' +
    '.pf-hint{position:absolute;left:0;right:0;bottom:.5em;font-size:.62em;letter-spacing:.2em;text-transform:uppercase;color:#ffffffa8;pointer-events:none}' +
    '.pf-name{position:relative;font:700 1.85em/1.05 var(--pf-serif);letter-spacing:.01em;margin:.62em 0 .12em;word-break:break-word;text-shadow:0 2px 12px rgba(0,0,0,.4)}' +
    '.pf-stand{position:relative;display:inline-block;font-size:.68em;font-weight:700;letter-spacing:.22em;text-transform:uppercase;color:#2a1f05;background:linear-gradient(135deg,#f6e3a1,#c9a24a 55%,#a98128);padding:.34em 1em;border-radius:999px;box-shadow:0 3px 10px rgba(0,0,0,.35)}' +
    '.pf-eyebrow{font-size:.7em;letter-spacing:.28em;text-transform:uppercase;color:#c9a24a;margin-bottom:.25em}.pf-campus{margin:0 1.1em;padding:1em 1.1em;border-radius:1em;background:linear-gradient(135deg,#12392a,#1b4d39);color:#f6ecc9;border:1px solid #c9a24a;box-shadow:0 6px 18px rgba(18,57,42,.22);position:relative;overflow:hidden}.pf-campus:before{content:"";position:absolute;inset:.35em;border:1px solid rgba(240,215,140,.28);border-radius:.75em;pointer-events:none}.pf-campus .t{font-family:Georgia,serif;font-size:1.25em;color:#f0d78c}.pf-campus .r{display:flex;justify-content:space-between;gap:1em;margin-top:.55em;font-size:.84em}.pf-campus .r span{opacity:.7;text-transform:uppercase;letter-spacing:.1em;font-size:.78em;padding-top:.15em}.pf-campus .r b{text-align:right;font-weight:600}' +
    '.pf-chips{position:relative;display:flex;flex-wrap:wrap;justify-content:center;gap:.4em;margin-top:.8em}' +
    '.pf-chip{font-size:.76em;padding:.32em .8em;border-radius:999px;border:1px solid rgba(240,215,140,.42);background:rgba(255,255,255,.09);color:#f6ecc9;white-space:nowrap}' +
    /* stat tiles overlapping the hero */
    '.pf-stats{position:relative;z-index:2;display:grid;grid-template-columns:repeat(4,1fr);gap:.45em;margin:-2.3em .8em 0}' +
    '.pf-stat{background:#fff;border:1px solid var(--line);border-radius:.95em;padding:.6em .2em .5em;text-align:center;box-shadow:0 8px 20px rgba(18,57,42,.14)}' +
    '.pf-stat b{display:block;font:700 1.55em/1 var(--pf-serif);color:var(--emerald)}.pf-stat span{display:block;margin-top:.28em;font-size:.6em;letter-spacing:.14em;text-transform:uppercase;color:var(--mute)}' +
    /* actions */
    '.pf-acts{display:flex;gap:.55em;margin:.9em .8em 0}' +
    '.pf-btn{flex:1;border:0;border-radius:.95em;padding:.85em .6em;font-weight:700;font-size:.95em;background:linear-gradient(135deg,#1e5a40,#12392a);color:var(--gold2);box-shadow:0 6px 16px rgba(18,57,42,.25)}' +
    '.pf-btn.gold{background:linear-gradient(135deg,#f6e3a1,#c9a24a 60%,#a98128);color:#2a1f05}.pf-btn.ghost{flex:none;background:#fff;color:var(--emerald);border:1px solid var(--line);box-shadow:none}.pf-btn:disabled{opacity:.55}' +
    /* sections */
    '.pf-sec{margin:1.35em .8em 0}.pf-h{display:flex;align-items:center;gap:.7em;margin-bottom:.7em}' +
    '.pf-h h3{margin:0;font:700 .72em/1 inherit;letter-spacing:.2em;text-transform:uppercase;color:#8a6a1d}.pf-h i{flex:1;height:1px;background:linear-gradient(90deg,var(--gold),transparent)}' +
    '.pf-h em{font-style:normal;font-size:.72em;font-weight:700;color:var(--emerald);background:#fff;border:1px solid var(--line);border-radius:999px;padding:.15em .65em}' +
    '.pf-post{border-radius:1.05em;padding:1.35em 1.1em;text-align:center;box-shadow:0 8px 20px rgba(0,0,0,.14);line-height:1.35;font-weight:600;word-break:break-word;white-space:pre-wrap}' +
    '.pf-cap{margin-top:.5em;font-size:.72em;color:var(--mute);text-align:center;letter-spacing:.04em}' +
    '.pf-look{display:grid;grid-template-columns:1fr 1fr;gap:.45em}.pf-lk{display:flex;align-items:center;gap:.55em;background:#fff;border:1px solid var(--line);border-radius:.85em;padding:.5em .65em;min-width:0}' +
    '.pf-lk i{flex:none;width:1.25em;height:1.25em;border-radius:50%;border:2px solid #0000001f;box-shadow:inset 0 0 0 1px #fff7}.pf-lk span{display:block;min-width:0}.pf-lk small{display:block;font-size:.62em;letter-spacing:.14em;text-transform:uppercase;color:var(--mute)}.pf-lk b{display:block;font-size:.84em;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}' +
    '.pf-cards{display:grid;grid-template-columns:1fr 1fr;gap:.6em}' +
    '.pf-card{background:#fff;border:1px solid var(--line);border-radius:1em;overflow:hidden;box-shadow:0 6px 16px rgba(18,57,42,.09);display:flex;flex-direction:column}' +
    '.pf-img{position:relative;aspect-ratio:16/10;background:#e8e2d0;overflow:hidden}.pf-img svg{display:block;width:100%;height:100%}' +
    '.pf-lv{position:absolute;left:.45em;top:.45em;font-size:.6em;font-weight:700;letter-spacing:.12em;text-transform:uppercase;color:#2a1f05;background:linear-gradient(135deg,#f6e3a1,#c9a24a);padding:.28em .7em;border-radius:999px;box-shadow:0 2px 6px rgba(0,0,0,.3)}' +
    '.pf-cb{padding:.55em .65em .65em}.pf-cb b{display:block;font-size:.82em;line-height:1.2;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden}.pf-cb small{display:block;margin-top:.25em;font-size:.68em;color:var(--mute)}' +
    '.pf-empty{border:1px dashed #cdbf95;border-radius:1em;padding:1em;text-align:center;color:var(--mute);font-style:italic;font-size:.85em;background:#fffdf6}' +
    '.pf-foot{display:flex;justify-content:center;gap:1.4em;margin:1.6em .8em 0;font-size:.78em}.pf-foot button{background:none;border:0;color:var(--mute);text-decoration:underline;padding:.3em}' +
    '.pf-msg{padding:2.2em 1.4em;text-align:center;color:var(--mute)}' +
    '.pf-skel{padding:0}.pf-skel .pf-hero{padding-bottom:3.3em}.pf-load{position:absolute;inset:0;display:grid;place-items:center;color:var(--gold2);font-size:.85em;letter-spacing:.14em;text-transform:uppercase}';

  /* ---------- 3D engine (same files the creator and Clothes app use), loaded on first profile only ---------- */
  let engine = null;
  function loadEngine() {
    if (g.FutaAvatar && g.THREE) return Promise.resolve();
    if (engine) return engine;
    const base = Ph.BASE, list = (g.THREE ? [] : [base + '../../vendor/three.min.js']).concat(g.FutaAvatar ? [] : NEEDED.map(n => base + '../avatar/' + n));
    engine = new Promise((resolve, reject) => {
      let i = 0; const next = () => { if (i >= list.length) return resolve(); const s = document.createElement('script'); s.src = list[i++]; s.async = false; s.onload = next; s.onerror = () => { engine = null; reject(new Error('load ' + s.src)); }; document.head.appendChild(s); }; next();
    });
    return engine;
  }

  /* ---------- the server call (or a believable fake in demo mode) ---------- */
  const pickN = (arr, n, seed) => { const out = [], used = {}; for (let i = 0; i < n && arr.length; i++) { const k = (seed >>> (i * 3)) % arr.length; let j = k; while (used[j] && Object.keys(used).length < arr.length) j = (j + 1) % arr.length; used[j] = 1; out.push(arr[j]); } return out; };
  /* school & status labels come from onboarding/campus-options.json (same file onboarding + Settings use) */
  let OPT = null, optP = null;
  function loadOpts() { return optP || (optP = fetch(Ph.SIGNUP_URL.replace(/signup\.html$/, 'campus-options.json')).then(r => r.json()).then(d => (OPT = d)).catch(() => null)); }
  const nm = (arr, id) => { const x = (arr || []).find(y => y.id === id); return x ? x.name : id; };
  function campusInfo(c) {
    if (!c || !c.status || !OPT) return null;
    const st = OPT.statuses.find(x => x.id === c.status); if (!st) return null; const sc = OPT.schools.find(x => x.id === c.school), rows = [];
    if (sc) rows.push([st.school === 'optional' ? 'Wants to join' : 'School', sc.name]);
    if (sc && c.dept) rows.push(['Department', nm(sc.depts, c.dept)]);
    if (c.level) rows.push(['Level', nm(OPT.levels, c.level)]);
    if (c.year) rows.push([c.status === 'corper' ? 'Service year' : c.status === 'graduate' || c.status === 'alumni' ? 'Graduated' : 'Year', String(c.year)]);
    if (c.area) rows.push(['Lives in', nm(OPT.areas, c.area)]);
    if (c.exam) rows.push(['Admission', nm(OPT.exams, c.exam)]);
    return { title: st.title, short: sc ? sc.short : '', rows };
  }
  function demoProfile(peer, FA, selfLook) {
    const s = hash(peer.username || peer.id || 'x'), frame = (selfLook && selfLook.body && selfLook.body.frame) || (s % 2 ? 'f' : 'm'), C = g.FutaCatalog || {};
    const list = (c, n) => (c ? pickN(c.LISTINGS, n, s) : []).map(x => ({ id: x.id, level: x.lv, slot: x.slot ? String(x.slot).toLowerCase() : undefined, since: '2026-10-0' + (1 + s % 9) })).sort((a, b) => b.level - a.level);
    return { id: peer.id, username: peer.username || 'player', avatar: selfLook || FA.look.random(frame, s % 9973), gender: frame === 'f' ? 'female' : 'male', joined: '2026-10', start: ['fresh', 'hustler', 'creative'][s % 3], campus: [{ status: 'student', school: 'seet', dept: 'mechanical_engineering', level: '300' }, { status: 'student', school: 'soc', dept: 'computer_science', level: '200' }, { status: 'corper', school: 'sos', dept: 'physics', year: 2026 }, { status: 'akure', area: 'south_gate' }, { status: 'aspirant', school: 'set', exam: 'post_utme' }, { status: 'alumni', school: 'saat', year: 2019 }][s % 6], me: !!peer.self, relation: peer.self ? 'none' : ['none', 'friends', 'waved', 'incoming'][s % 4], friends: s % 23,
      properties: list(C.property, s % 4), cars: list(C.cars, (s >> 2) % 4), accessories: list(C.accessories, (s >> 4) % 5),
      latest_post: s % 3 === 0 ? { body: 'Lagos life is a movie, and I am the lead. 🎬', bg: 'sunset', at: new Date(Date.now() - 3 * 36e5).toISOString() } : null };
  }
  async function fetchProfile(peer) {
    if (Ph.demo()) { await loadEngine(); const u = Ph.getUser(); return demoProfile(peer, g.FutaAvatar, peer.self && u && u.avatar ? u.avatar : null); }
    const api = Ph.api(); if (!api) throw new Error('Sign in to see profiles.');
    return api.rpc('get_profile', { p_user: peer.id });
  }

  /* ---------- 3D portrait ---------- */
  function mount3d(arch, look) {
    let dead = false, raf = 0, renderer = null, av = null;
    const ini = h('div', 'pf-ini', '…'); arch.appendChild(ini);
    loadEngine().then(() => {
      if (dead) return; const T = g.THREE, FA = g.FutaAvatar; if (!look) { return; }
      const canvas = h('canvas'); arch.insertBefore(canvas, ini);
      renderer = new T.WebGLRenderer({ canvas, antialias: true, alpha: true, powerPreference: 'default' }); renderer.outputEncoding = T.sRGBEncoding; renderer.setPixelRatio(Math.min(2, g.devicePixelRatio || 1));
      const scene = new T.Scene(), cam = new T.PerspectiveCamera(24, 1, 0.1, 50), pivot = new T.Group(); scene.add(pivot);
      scene.add(new T.HemisphereLight(0xffffff, 0x6b7280, 0.75)); const key = new T.DirectionalLight(0xfff0dd, 0.75); key.position.set(2, 3.5, 3); scene.add(key); const rim = new T.DirectionalLight(0x88aaff, 0.35); rim.position.set(-3, 2, -2); scene.add(rim);
      av = FA.create(look, { lod: 0, material: 'standard' }); av.setPose('idle'); pivot.add(av.group); ini.remove();
      const size = () => { const w = arch.clientWidth || 180, hh = arch.clientHeight || 250; renderer.setSize(w, hh, false); cam.aspect = w / hh; cam.updateProjectionMatrix(); }; size();
      let rot = 0.35, spinPause = 0, drag = null, last = performance.now();
      arch.onpointerdown = (e) => { drag = e.clientX; spinPause = 2.5; try { arch.setPointerCapture(e.pointerId); } catch (x) { } arch.style.cursor = 'grabbing'; };
      arch.onpointermove = (e) => { if (drag == null) return; rot += (e.clientX - drag) * 0.012; drag = e.clientX; spinPause = 2.5; };
      arch.onpointerup = arch.onpointercancel = () => { drag = null; arch.style.cursor = 'grab'; };
      const frame = (now) => { if (dead) return; raf = requestAnimationFrame(frame); const dt = Math.min(0.05, (now - last) / 1000); last = now;
        if (spinPause > 0) spinPause -= dt; else rot += dt * 0.45; pivot.rotation.y = rot; av.update(dt);
        if (arch.clientWidth && Math.abs(renderer.domElement.width / (renderer.getPixelRatio()) - arch.clientWidth) > 2) size();
        cam.position.set(0, 1.08, 5.55); cam.lookAt(0, 0.93, 0); renderer.render(scene, cam); };
      raf = requestAnimationFrame(frame);
    }).catch(() => { ini.textContent = ''; });
    return { initial(t) { ini.textContent = t; }, destroy() { dead = true; cancelAnimationFrame(raf); try { av && av.dispose(); } catch (e) { } if (renderer) { try { renderer.dispose(); renderer.forceContextLoss && renderer.forceContextLoss(); } catch (e) { } } } };
  }

  /* ---------- helpers for the look list ---------- */
  function lookRows(look, FA) {
    const O = FA && FA.OPTIONS; if (!O || !look) return [];
    const pal = O.palettes || {}, clothCol = (c) => (pal.cloth && c != null && pal.cloth[c]) || null, rows = [];
    const lab = (list, id) => { const f = (list || []).find(x => x.id === id); return f ? f.label : null; };
    const hairSt = O.hair && O.hair.styles, hr = look.hair && look.hair.style && look.hair.style !== 'bald' ? lab(hairSt, look.hair.style) : (look.hair ? 'Bald' : null);
    if (hr) rows.push(['Hair', hr, look.hair && look.hair.style !== 'bald' && pal.hair ? pal.hair[look.hair.color] : null]);
    if (look.beard && look.beard !== 'none') rows.push(['Beard', lab(O.beard && O.beard.styles, look.beard) || 'Beard', look.hair && pal.hair ? pal.hair[look.hair.color] : null]);
    const W = look.wear || {}, order = [['dress', 'Dress'], ['top', 'Top'], ['bottom', 'Bottom'], ['layer', 'Layer'], ['shoes', 'Shoes'], ['head', 'Headwear'], ['glasses', 'Glasses'], ['bag', 'Bag'], ['neck', 'Neck'], ['wrist', 'Wrist'], ['ears', 'Ears']];
    order.forEach(([k, t]) => { const it = W[k]; if (!it || !it.id) return; const l = lab(O.wear && O.wear[k], it.id); if (l && l !== 'None') rows.push([t, l, clothCol(it.c)]); });
    return rows;
  }
  function ago(iso) { const m = Math.max(0, (Date.now() - new Date(iso).getTime()) / 60000); return m < 2 ? 'just now' : m < 60 ? Math.round(m) + ' min ago' : m < 1440 ? Math.round(m / 60) + ' h ago' : Math.round(m / 1440) + ' d ago'; }

  /* ---------- render a loaded profile into root ---------- */
  function render(root, p, opts) {
    opts = opts || {}; const FA = g.FutaAvatar, C = g.FutaCatalog || {}; root.innerHTML = '';
    const wrap = h('div', 'pf'), style = h('style'); style.textContent = CSS; wrap.appendChild(style);
    const lvName = (n) => (C.property && C.property.LEVELS[n - 1] && C.property.LEVELS[n - 1].name) || LV_NAMES[n - 1] || ('Level ' + n);
    const owned = (kind, list) => (list || []).map(o => { const cat = C[kind]; const l = cat && cat.LISTINGS.find(x => x.id === o.id); return l ? { o, l } : null; }).filter(Boolean);
    const props = owned('property', p.properties), cars = owned('cars', p.cars), accs = owned('accessories', p.accessories);
    const top = [].concat(props, cars, accs).reduce((m, x) => Math.max(m, x.l.lv || 0), 0);

    /* hero */
    const hero = h('div', 'pf-hero'); hero.appendChild(h('div', 'pf-crest', 'FUTAlife'));
    const arch = h('div', 'pf-arch'); const hint = h('div', 'pf-hint', 'drag to turn'); arch.appendChild(hint); hero.appendChild(arch);
    const m3 = mount3d(arch, p.avatar); m3.initial((p.username || '?').charAt(0).toUpperCase());
    hero.appendChild(h('div', 'pf-name', p.username)); hero.appendChild(h('span', 'pf-stand', top ? lvName(top) + ' standing' : 'Newcomer'));
    const chips = h('div', 'pf-chips');
    if (p.gender) chips.appendChild(h('span', 'pf-chip', (p.gender === 'female' ? '♀ Female' : '♂ Male')));
    if (p.joined) { const [y, mo] = String(p.joined).split('-'); if (y && mo && MONTHS[+mo - 1]) chips.appendChild(h('span', 'pf-chip', 'Joined ' + MONTHS[+mo - 1] + ' ' + y)); }
    const ci = campusInfo(p.campus); if (ci) chips.appendChild(h('span', 'pf-chip', ci.short ? ci.title + ' · ' + ci.short : ci.title));
    if (p.start) chips.appendChild(h('span', 'pf-chip', STARTS[p.start] || p.start));
    hero.appendChild(chips); wrap.appendChild(hero);

    /* tiles */
    const st = h('div', 'pf-stats'); [[props.length, 'Property'], [cars.length, 'Cars'], [accs.length, 'Style'], [p.friends || 0, 'Friends']].forEach(([n, t]) => { const d = h('div', 'pf-stat'); d.appendChild(h('b', '', String(n))); d.appendChild(h('span', '', t)); st.appendChild(d); }); wrap.appendChild(st);

    /* actions */
    const acts = h('div', 'pf-acts'); wrap.appendChild(acts);
    const paintActs = () => {
      acts.innerHTML = '';
      const rel = p.relation, mk = (label, cls, fn, dis) => { const b = h('button', 'pf-btn ' + (cls || ''), label); b.type = 'button'; if (dis) b.disabled = true; else b.onclick = () => fn(b); acts.appendChild(b); return b; };
      if (p.me) { mk('Change my outfit', 'gold', () => { Ph.open('clothes'); }); return; }
      if (rel === 'friends') mk('✉  Message', 'gold', () => { if (opts.onMessage) opts.onMessage(p); else if (g.FutaChat) g.FutaChat.openWith({ id: p.id, username: p.username }); });
      else if (rel === 'waved') mk('Wave sent ✓', 'ghost', null, true);
      else mk(rel === 'incoming' ? '👋  Wave back' : '👋  Wave', 'gold', (b) => { b.disabled = true; if (Ph.demo()) { p.relation = 'waved'; paintActs(); return; }
        Ph.api().rpc('send_wave', { p_to: p.id }).then(x => { p.relation = x && x.status === 'accepted' ? 'friends' : 'waved'; paintActs(); if (p.relation === 'friends') Ph.toast('Connected! You can message ' + p.username + ' now.'); }).catch(e => { b.disabled = false; Ph.toast(nice(e)); }); });
    }; paintActs();

    if (ci) { const cc = h('div', 'pf-campus'); cc.style.marginTop = '1.2em'; cc.appendChild(h('div', 'pf-eyebrow', 'Campus')); cc.appendChild(h('div', 't', ci.title)); ci.rows.forEach(([k, v]) => { const r = h('div', 'r'); r.appendChild(h('span', '', k)); r.appendChild(h('b', '', v)); cc.appendChild(r); }); wrap.appendChild(cc); }
    else if (p.me) { const b = h('button', 'pf-btn ghost', '🎓  Add your school & status'); b.type = 'button'; b.style.margin = '1.2em 1.1em 0'; b.onclick = () => Ph.open('settings'); wrap.appendChild(b); }

    const sec = (title, count) => { const s = h('section', 'pf-sec'), hd = h('div', 'pf-h'); hd.appendChild(h('h3', '', title)); hd.appendChild(h('i')); if (count != null) hd.appendChild(h('em', '', String(count))); s.appendChild(hd); wrap.appendChild(s); return s; };

    /* latest status */
    if (p.latest_post && p.latest_post.body) {
      const s = sec('Status'), bg = (g.FutaFeedBG && g.FutaFeedBG[p.latest_post.bg]) || ['', 'linear-gradient(135deg,#0f5a3b,#35b27a)', '#fff'], card = h('div', 'pf-post', p.latest_post.body), n = p.latest_post.body.length;
      card.style.background = bg[1]; card.style.color = bg[2]; card.style.fontSize = n <= 60 ? '1.35em' : n <= 140 ? '1.12em' : '.95em'; s.appendChild(card); s.appendChild(h('div', 'pf-cap', 'Posted ' + ago(p.latest_post.at) + ' · disappears after 24 hours'));
    }

    /* look */
    const rows = lookRows(p.avatar, FA);
    if (rows.length) { const s = sec('The look'), grid = h('div', 'pf-look'); rows.forEach(([t, v, col]) => { const d = h('div', 'pf-lk'), sw = h('i'); sw.style.background = col || 'transparent'; if (!col) sw.style.visibility = 'hidden'; const tx = h('span'); tx.appendChild(h('small', '', t)); tx.appendChild(h('b', '', v)); d.append(sw, tx); grid.appendChild(d); }); s.appendChild(grid); }

    /* property / cars / accessories */
    const cardsSec = (title, items, emptyText, sub) => {
      const s = sec(title, items.length);
      if (!items.length) { s.appendChild(h('div', 'pf-empty', emptyText)); return; }
      const grid = h('div', 'pf-cards');
      items.forEach(({ o, l }, i) => { const c = h('article', 'pf-card'), im = h('div', 'pf-img'); try { im.innerHTML = sub.art(l); } catch (e) { /* no picture */ } im.appendChild(h('span', 'pf-lv', 'Level ' + l.lv)); const b = h('div', 'pf-cb'); b.appendChild(h('b', '', l.name)); b.appendChild(h('small', '', sub.line(l))); c.append(im, b); grid.appendChild(c); });
      s.appendChild(grid);
    };
    cardsSec('Property', props, p.me ? 'Nothing yet. Open the Property app to buy your first place.' : 'No property yet.', { art: (l) => C.property.art(l.kind, l.lv), line: (l) => l.area });
    cardsSec('Garage', cars, p.me ? 'Nothing yet. Open the Cars app to get your first ride.' : 'No cars yet.', { art: (l) => C.cars.art(l.kind, l.lv, l.col), line: (l) => l.area });
    cardsSec('Accessories', accs, p.me ? 'Nothing yet. Open the Accessories app for your first piece.' : 'No accessories yet.', { art: (l) => C.accessories.art(l.kind, l.lv, l.col), line: (l) => l.area + ' · ' + l.slot });

    /* footer: block / report */
    if (!p.me) {
      const f = h('div', 'pf-foot'), blk = h('button', '', 'Block'), rep = h('button', '', 'Report'); blk.type = rep.type = 'button'; f.append(blk, rep); wrap.appendChild(f);
      blk.onclick = () => { if (!confirm('Block ' + p.username + '? You will no longer see each other’s messages.')) return; if (Ph.demo()) { Ph.toast('Blocked (demo).'); return; } Ph.api().rpc('block_user', { p_target: p.id }).then(() => { Ph.toast('Blocked.'); if (opts.onClose) opts.onClose(); }).catch(e => Ph.toast(nice(e))); };
      rep.onclick = () => { const why = prompt('Report ' + p.username + ' — harassment, spam, impersonation, inappropriate, underage or other?', 'harassment'); if (!why) return; if (Ph.demo()) { Ph.toast('Thanks — reported (demo).'); return; } Ph.api().rpc('report_user', { p_target: p.id, p_reason: why.trim().toLowerCase(), p_context: 'profile' }).then(() => Ph.toast('Thanks — our team will look at it.')).catch(() => Ph.toast('Choose: harassment, spam, impersonation, inappropriate, underage, other')); };
    }
    root.appendChild(wrap); return { destroy() { m3.destroy(); } };
  }

  /* skeleton → data → render. Returns {destroy()} right away. */
  function load(root, peer, opts) {
    let dead = false, view = null; root.innerHTML = '';
    const sk = h('div', 'pf pf-skel'), st = h('style'); st.textContent = CSS; sk.appendChild(st); const hero = h('div', 'pf-hero'); hero.appendChild(h('div', 'pf-crest', 'FUTAlife')); const arch = h('div', 'pf-arch'); arch.appendChild(h('div', 'pf-load', 'Loading')); hero.appendChild(arch); hero.appendChild(h('div', 'pf-name', peer.username || 'Player')); sk.appendChild(hero); root.appendChild(sk);
    Promise.all([fetchProfile(peer), loadOpts()]).then(([p]) => { if (dead) return; if (!p) throw new Error('not_found'); view = render(root, p, opts); })
      .catch(e => { if (dead) return; root.innerHTML = ''; const m = h('div', 'pf-msg', nice(e)); root.appendChild(m); });
    return { destroy() { dead = true; if (view) view.destroy(); } };
  }

  g.FutaProfile = { open(peer) { if (!peer || !peer.id) return; Ph.show(true); Ph.open('profile', { peer }); }, load, render };

  Ph.registerApp({
    id: 'profile', name: 'Profile', title: 'Profile', icon: 'user', color: ['#c9a24a', '#5a431a'], hidden: true,
    mount(body, ctx) {
      const peer = (ctx.opts && ctx.opts.peer) || (Ph.getUser() ? { id: Ph.getUser().id, username: Ph.getUser().username, self: true } : null);
      if (!peer) { body.appendChild(h('div', 'pf-msg', 'Sign in to see profiles.')); return {}; }
      ctx.setTitle(peer.self ? 'My profile' : (peer.username || 'Profile'));
      body.style.padding = '0'; const root = h('div'); body.appendChild(root); let v = load(root, peer, { onMessage: (p) => { if (g.FutaChat) g.FutaChat.openWith({ id: p.id, username: p.username }); }, onClose: () => Ph.home() });
      return { destroy() { v.destroy(); } };
    }
  });
})(window);
