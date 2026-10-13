/* ==========================================================================
   FUTA Avatar — look normalisation + geometry build + cache + instance creation
   Public API (what the rest of the game uses):
     FutaAvatar.look.normalize(look, {allowRestricted})  → clean look (never throws)
     FutaAvatar.look.random(frame, seed)                 → a nice random look
     FutaAvatar.create(look, {lod:0|1|2, material:'lambert'|'standard'}) → avatar instance
         avatar.group      THREE.Group to add to the scene
         avatar.setPose(name, opts) / avatar.update(dt)      (see avatar-rig.js)
         avatar.info       {tris, verts, lod}
   ========================================================================== */
(function (global) {
  'use strict';
  const T = global.THREE, FA = global.FutaAvatar, { clamp, hexRGB, rng, hashStr } = FA.util;
  const OPT = () => FA.OPTIONS;

  /* ------------------------------------------------------------ look normalisation (mirrors the PHP validator) */
  const int = (v, lo, hi, d) => { v = Math.round(Number(v)); return isFinite(v) ? clamp(v, lo, hi) : d; };
  const num = (v, lo, hi, d) => { v = Number(v); return isFinite(v) ? clamp(v, lo, hi) : d; };
  const find = (list, id) => list.find(x => x.id === id);

  function normItem(slot, raw, opts, frame) {
    const O = OPT(), cat = O.wear[slot];
    if (!raw || typeof raw !== 'object') return null;
    const def = find(cat, raw.id);
    if (!def) return null;
    if (def.restricted && !opts.allowRestricted) return null;
    const it = { id: def.id, c: int(raw.c, 0, O.palettes.cloth.length - 1, 0) };
    if (raw.c2 != null) it.c2 = int(raw.c2, 0, O.palettes.cloth.length - 1, 0);
    if (def.pat && raw.p && O.patterns.indexOf(raw.p) >= 0) it.p = raw.p;
    return it;
  }
  function normalize(look, opts) {
    opts = opts || {}; look = look || {};
    const O = OPT(), b = look.body || {}, f = look.face || {}, h = look.hair || {}, w = look.wear || {};
    const frame = b.frame === 'f' ? 'f' : 'm';
    const out = { v: 1, body: { frame, height: num(b.height, 0.92, 1.08, 1), build: num(b.build, 0, 1, 0.5), bust: num(b.bust, 0, 1, 0.5), hips: num(b.hips, 0, 1, 0.5), shoulders: num(b.shoulders, 0, 1, 0.5) } };
    out.skin = int(look.skin, 0, O.palettes.skin.length - 1, 5);
    out.face = { shape: int(f.shape, 0, O.face.shape.count - 1, 0), eyes: int(f.eyes, 0, O.face.eyes.count - 1, 0), eyeColor: int(f.eyeColor, 0, O.face.eyeColor.count - 1, 0), brows: int(f.brows, 0, O.face.brows.count - 1, 0), nose: int(f.nose, 0, O.face.nose.count - 1, 0), lips: int(f.lips, 0, O.face.lips.count - 1, 0) };
    const hs = find(O.hair.styles, h.style);
    out.hair = { style: hs ? hs.id : (frame === 'f' ? 'cornrows' : 'fade'), color: int(h.color, 0, O.palettes.hair.length - 1, 0), seed: int(h.seed, 0, 99999, 7) };
    const bs = O.beard.styles.map(x => x.id); out.beard = frame === 'm' && bs.indexOf(look.beard) >= 0 ? look.beard : 'none';
    const mk = look.makeup || {}; out.makeup = {};
    if (mk.lips != null) out.makeup.lips = int(mk.lips, 0, 7, 0); if (mk.shadow != null) out.makeup.shadow = int(mk.shadow, 0, 7, 0); if (mk.blush != null) out.makeup.blush = int(mk.blush, 0, 5, 0);
    if (mk.liner) out.makeup.liner = true; if (mk.lashes) out.makeup.lashes = true;
    if (look.nails != null) out.nails = int(look.nails, 0, O.palettes.nail.length - 1, 0);
    out.wear = {};
    const D = O.defaults[frame];
    ['top', 'layer', 'bottom', 'dress', 'shoes', 'head', 'glasses', 'bag', 'neck', 'wrist', 'ears'].forEach(slot => {
      let it = normItem(slot, w[slot], opts, frame);
      if (!it && D[slot]) it = Object.assign({}, D[slot]);
      if (it && it.id !== 'none') out.wear[slot] = it;
    });
    if (out.wear.dress) { delete out.wear.top; delete out.wear.bottom; } // a dress replaces top + bottom
    return out;
  }
  function random(frame, seed, opts) {
    const O = OPT(), R = rng(seed == null ? (Math.random() * 1e9) | 0 : seed), pick = (a) => a[Math.floor(R() * a.length)], f = frame === 'f' ? 'f' : 'm';
    const ok = (list) => list.filter(x => !x.restricted && (x.for === 'u' || x.for === f));
    const col = () => Math.floor(R() * O.palettes.cloth.length), item = (slot, p) => { const d = pick(ok(O.wear[slot])); const it = { id: d.id, c: col(), c2: col() }; if (d.pat && R() < (p || 0.4)) it.p = pick(['ankara_a', 'ankara_b', 'kente', 'floral', 'plaid', 'stripes', 'dots']); return it; };
    const look = { body: { frame: f, height: 0.95 + R() * 0.1, build: 0.2 + R() * 0.6, bust: R(), hips: 0.3 + R() * 0.5, shoulders: 0.3 + R() * 0.5 }, skin: pick([3, 4, 5, 5, 6, 6, 7, 8, 2, 9]),
      face: { shape: Math.floor(R() * 6), eyes: Math.floor(R() * 6), eyeColor: pick([0, 0, 0, 1, 7, 4]), brows: Math.floor(R() * 5), nose: Math.floor(R() * 5), lips: Math.floor(R() * 5) },
      hair: { style: pick(ok(O.hair.styles.map(s => Object.assign({ restricted: false }, s)))).id, color: pick([0, 0, 0, 1, 1, 2, 7, 10]), seed: Math.floor(R() * 9999) },
      beard: f === 'm' && R() < 0.35 ? pick(['stubble', 'mustache', 'goatee', 'full']) : 'none', nails: f === 'f' && R() < 0.5 ? Math.floor(R() * 9) : undefined,
      makeup: f === 'f' ? { lips: R() < 0.8 ? Math.floor(R() * 8) : undefined, lashes: R() < 0.6, liner: R() < 0.5, blush: R() < 0.5 ? Math.floor(R() * 6) : undefined } : {}, wear: {} };
    if (f === 'f' && R() < 0.35) look.wear.dress = item('dress', 0.5).id === 'none' ? undefined : item('dress', 0.5);
    if (!look.wear.dress) { look.wear.top = item('top', 0.35); look.wear.bottom = item('bottom', 0.3); }
    look.wear.shoes = item('shoes'); if (R() < 0.3) look.wear.glasses = item('glasses'); if (R() < 0.35) look.wear.bag = item('bag');
    if (R() < 0.25) look.wear.layer = item('layer'); if (R() < 0.2) look.wear.head = item('head', 0.5);
    return normalize(look, opts);
  }
  FA.look = { normalize, random, key: (look, lod) => hashStr(JSON.stringify(look) + '|' + lod).toString(36) };

  /* ------------------------------------------------------------ geometry build (cached) */
  const cache = new Map(), MAXC = 64;
  function buildGeometry(look, lodIdx) {
    const key = FA.look.key(look, lodIdx), hit = cache.get(key);
    if (hit) { hit.refs++; cache.delete(key); cache.set(key, hit); return hit; }
    const L = FA.LOD[lodIdx] || FA.LOD[1], acc = new FA.Acc(), B = FA._body, W = FA._wear;
    const ctx = { acc, look, L, f: look.body.frame === 'f', skin: hexRGB(OPT().palettes.skin[look.skin]), cover: FA.wearCover(look), head: null };
    ctx.tabs = B.bodyTables(ctx);
    const t0 = (global.performance || Date).now();
    B.buildHead(ctx); W.buildHair(ctx); W.buildHeadwear(ctx); W.buildBeard(ctx); W.buildGlasses(ctx);
    B.buildSkin(ctx); B.buildHands(ctx); B.buildShoes(ctx);
    W.buildWear(ctx); W.buildBag(ctx); W.buildAccessories(ctx);
    const geo = acc.finish(); geo.userData.buildMs = (global.performance || Date).now() - t0; geo.userData.tabs = ctx.tabs; geo.userData.face = ctx.faceU;
    const rec = { key, geo, tabs: ctx.tabs, refs: 1, lod: lodIdx };
    cache.set(key, rec);
    if (cache.size > MAXC) for (const [k, v] of cache) { if (v.refs <= 0) { v.geo.dispose(); cache.delete(k); if (cache.size <= MAXC) break; } }
    return rec;
  }
  FA.buildGeometry = buildGeometry;
  FA.cacheStats = () => ({ entries: cache.size });

  /* ------------------------------------------------------------ instance */
  FA.create = function (lookIn, opts) {
    opts = opts || {};
    const look = FA.look.normalize(lookIn, { allowRestricted: !!opts.allowRestricted });
    const lod = opts.lod == null ? 1 : opts.lod, rec = buildGeometry(look, lod);
    const rig = FA.rig.make(rec.tabs, look);
    const mesh = new T.SkinnedMesh(rec.geo, FA.materialFor(rec.geo, opts.material || (lod === 0 ? 'standard' : 'lambert')));
    mesh.add(rig.root); mesh.bind(rig.skeleton); mesh.frustumCulled = false; mesh.castShadow = !!opts.shadow;
    const group = new T.Group(); group.add(mesh); group.scale.setScalar(look.body.height);
    const av = { group, mesh, look, rig, lod, info: { tris: rec.geo.userData.tris, verts: rec.geo.userData.verts, lod, buildMs: rec.geo.userData.buildMs }, _rec: rec,
      setPose: (n, o) => rig.setPose(n, o), update: (dt) => rig.update(dt), dispose() { rec.refs--; rig.dispose && rig.dispose(); } };
    FA.rig.attachProps && FA.rig.attachProps(av, opts.props);
    return av;
  };
})(typeof window !== 'undefined' ? window : globalThis);
