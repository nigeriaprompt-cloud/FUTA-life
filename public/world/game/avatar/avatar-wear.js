/* ==========================================================================
   FUTA Avatar — clothes, hair, headwear, glasses, beard, bags, accessories
   Every garment = a few lofts built from the SAME body tables (so it always fits any build),
   merged into the character's single skinned geometry.
   TO ADD A NEW GARMENT: (1) add it to avatar-options.json, (2) add a SPEC row below,
   (3) if it needs special shapes add a case in buildTop / buildBottom / buildDress / buildLayer.
   See docs/AVATAR_SPEC.md.
   ========================================================================== */
(function (global) {
  'use strict';
  const T = global.THREE, FA = global.FutaAvatar;
  const { clamp, lerp, mix3, mul3, hexRGB, rng } = FA.util;
  const { smooth, grow, clip, sample } = FA.tab;
  const { loft, fromTHREE } = FA.geo;
  const { MX, unitSphere, unitCyl, boxRec, torus } = FA.shapes;
  const B = FA._body, PAT = FA.PAT, PIV = FA.PIV, BI = FA.BI, PI = Math.PI;

  /* ---------------------------------------------------------------- garment specs (data, not code)
     neck  = y where bare skin starts again at the neck   up   = lowest y the upper-arm sleeve reaches (1.44 = sleeveless)
     fore  = lowest y the forearm sleeve reaches (1.10 = none)   hem = bottom of garment   g = thickness (m) */
  const TOP = {
    tee:           { hem: 0.95, neck: 1.46, up: 1.27, fore: 1.10, g: 0.009, flare: 0.02, collar: 'crew' },
    tank:          { hem: 0.95, neck: 1.43, up: 1.44, fore: 1.10, g: 0.008, flare: 0.01, collar: 'none' },
    polo:          { hem: 0.93, neck: 1.46, up: 1.25, fore: 1.10, g: 0.009, flare: 0.02, collar: 'polo' },
    shirt:         { hem: 0.88, neck: 1.465, up: 1.08, fore: 0.90, g: 0.009, flare: 0.03, collar: 'shirt', buttons: true },
    hoodie:        { hem: 0.90, neck: 1.47, up: 1.08, fore: 0.90, g: 0.022, flare: 0.05, collar: 'hood', pocket: true },
    knit:          { hem: 0.92, neck: 1.47, up: 1.08, fore: 0.90, g: 0.016, flare: 0.03, collar: 'rib', force: PAT.knit },
    blouse:        { hem: 0.92, neck: 1.45, up: 1.30, fore: 1.10, g: 0.008, flare: 0.07, collar: 'v' },
    croptop:       { hem: 1.18, neck: 1.45, up: 1.30, fore: 1.10, g: 0.007, flare: 0.0, collar: 'none', band: [1.04, 1.19] },
    kaftan:        { hem: 0.46, neck: 1.47, up: 1.08, fore: 0.97, g: 0.03, flare: 0.22, collar: 'rib', trim: true },
    buba:          { hem: 0.72, neck: 1.46, up: 1.12, fore: 1.00, g: 0.02, flare: 0.2, collar: 'v', trim: true, bell: true },
    uniform_shirt: { hem: 0.90, neck: 1.465, up: 1.22, fore: 1.10, g: 0.009, flare: 0.02, collar: 'shirt', buttons: true, epaulettes: true }
  };
  const BOTTOM = {
    jeans:    { hem: 0.12, g: 0.007, taper: 0.9, belt: true, force: PAT.denim },
    chino:    { hem: 0.12, g: 0.006, taper: 0.86, belt: true },
    slacks:   { hem: 0.11, g: 0.007, taper: 0.92, belt: true },
    shorts:   { hem: 0.58, g: 0.009, taper: 1.0 },
    joggers:  { hem: 0.14, g: 0.012, taper: 0.8, cuff: true },
    sokoto:   { hem: 0.12, g: 0.032, taper: 1.0, bag: true },
    leggings: { hem: 0.12, g: 0.002, taper: 0.95 },
    mini:     { hem: 0.74, g: 0.012, skirt: true, flare: 0.22 },
    skirt:    { hem: 0.55, g: 0.012, skirt: true, flare: 0.28 },
    midi:     { hem: 0.30, g: 0.014, skirt: true, flare: 0.42, pleat: true },
    wrapper:  { hem: 0.22, g: 0.014, skirt: true, flare: 0.12, wrap: true }
  };
  const DRESS = {
    sundress: { hem: 0.62, neck: 1.40, up: 1.44, fore: 1.10, g: 0.007, flare: 0.5, strap: true },
    bodycon:  { hem: 0.70, neck: 1.40, up: 1.44, fore: 1.10, g: 0.003, flare: 0.0, strap: true },
    maxi:     { hem: 0.12, neck: 1.40, up: 1.44, fore: 1.10, g: 0.008, flare: 0.5, strap: true },
    gown:     { hem: 0.16, neck: 1.44, up: 1.30, fore: 1.10, g: 0.012, flare: 0.45, puff: true },
    abaya:    { hem: 0.06, neck: 1.47, up: 1.08, fore: 0.90, g: 0.03, flare: 0.3, bell: true }
  };
  const LAYER = {
    jacket:   { hem: 0.96, neck: 1.47, up: 1.08, fore: 0.92, g: 0.022, open: false, rib: true },
    blazer:   { hem: 0.82, neck: 1.48, up: 1.08, fore: 0.90, g: 0.02, open: true, lapel: true },
    cardigan: { hem: 0.84, neck: 1.47, up: 1.08, fore: 0.90, g: 0.02, open: true, force: PAT.knit },
    hivis:    { hem: 0.95, neck: 1.45, up: 1.44, fore: 1.10, g: 0.02, open: false, vest: true },
    labcoat:  { hem: 0.55, neck: 1.48, up: 1.08, fore: 0.90, g: 0.026, open: true, lapel: true }
  };
  FA.WEAR_SPECS = { TOP, BOTTOM, DRESS, LAYER };

  /* what is covered → which skin pieces avatar-body.js has to emit */
  FA.wearCover = function (look) {
    const w = look.wear, c = { torsoSkinFrom: 0.88, upperArmSkinTo: 1.44, foreSkinTo: 1.10, legSkinTo: 1.0, pelvisSkin: true, pelvisTop: 0.9, bands: [] };
    const apply = (S) => { c.torsoSkinFrom = c.torsoSkinFrom === 0.88 ? S.neck : Math.max(c.torsoSkinFrom, S.neck); c.upperArmSkinTo = Math.min(c.upperArmSkinTo, S.up); c.foreSkinTo = Math.min(c.foreSkinTo, S.fore); if (S.band) c.bands.push(S.band); };
    const dress = w.dress && w.dress.id !== 'none' ? DRESS[w.dress.id] : null;
    if (dress) { apply(dress); c.legSkinTo = Math.min(c.legSkinTo, dress.hem); }
    else {
      if (w.top && TOP[w.top.id]) apply(TOP[w.top.id]);
      if (w.bottom && BOTTOM[w.bottom.id]) { c.legSkinTo = Math.min(c.legSkinTo, BOTTOM[w.bottom.id].hem); }
    }
    if (w.layer && LAYER[w.layer.id]) { const S = LAYER[w.layer.id]; if (!S.open || true) { c.upperArmSkinTo = Math.min(c.upperArmSkinTo, S.up); c.foreSkinTo = Math.min(c.foreSkinTo, S.fore); } c.torsoSkinFrom = Math.max(c.torsoSkinFrom, S.neck); }
    if (!(w.dress && w.dress.id !== 'none') && !(w.bottom && BOTTOM[w.bottom.id])) c.pelvisTop = 1.075;
    if (c.legSkinTo < 0.12) c.legSkinTo = 0.12;
    return c;
  };

  /* ---------------------------------------------------------------- small helpers */
  const CELL = { 0: 0.12, 1: 0.12, 2: 0.035, 3: 0.02, 4: 0.07, 5: 0.035, 6: 0.1, 7: 0.1, 8: 0.09, 9: 0.075, 10: 0.12, 11: 0.12, 14: 0.05 };
  function paint(ctx, it, S) {
    const O = FA.OPTIONS.palettes.cloth, c = hexRGB(O[(it.c || 0) % O.length]);
    const c2 = it.c2 != null ? hexRGB(O[it.c2 % O.length]) : mul3(c, 0.55);
    let pat = it.p && PAT[it.p] !== undefined ? PAT[it.p] : (S && S.force !== undefined ? S.force : PAT.fabric);
    if (S && S.force !== undefined && !(it.p && PAT[it.p] !== undefined)) pat = S.force;
    if (pat === PAT.denim && (it.c2 == null)) { /* denim stitch tone */ }
    return { c, c2, pat, cell: CELL[pat] || 0.12 };
  }
  const trim = (c) => mix3(mul3(c, 0.5), [1, 1, 1], 0.1);
  const GOLD = hexRGB('#d9a62e'), SILVER = hexRGB('#c9ccd2');
  const metal = (it) => ((it && it.c) || 0) % 2 ? SILVER : GOLD;

  /* torso+pelvis as one column of rows, optionally extended below the hips with a flare */
  function column(ctx, lo, hi, d, flare) {
    const t = ctx.tabs, rows = t.pelvis.filter(r => r[0] < 0.88).concat(t.torso).map(r => r.slice());
    rows.forEach(r => { if (r[0] >= 0.88 && r[0] <= 1.06) { const pr = sample(t.pelvis, r[0]); r[1] = Math.max(r[1], pr[1]); r[2] = Math.max(r[2], pr[2]); r[3] = Math.max(r[3], pr[3] || 0); } }); // hips are wider than the waist: never let the pelvis skin poke out
    if (lo < 0.8) {
      const b = rows[0], n = Math.max(2, Math.ceil((0.8 - lo) / 0.12));
      for (let i = 1; i <= n; i++) { const k = 1 + (flare || 0) * (i / n), y = 0.8 - i * (0.8 - lo) / n; const th = sample(t.thigh, Math.max(0.5, y)); rows.unshift([y, Math.max(b[1] * k, t.legX + th[1] + 0.012 + d), Math.max(b[2] * k, th[2] + 0.012 + d), b[3] || 0, 0]); }
    }
    return clip(grow(rows, d), lo, hi);
  }
  const frontZ = (ctx, y, d) => { const r = sample(ctx.tabs.torso, y); return r[3] + r[2] + (d || 0); };
  const AXm = (ctx, sd, m) => MX(sd * ctx.tabs.shX, 0, 0).multiply(m || new T.Matrix4());
  const LXm = (ctx, sd, m) => MX(sd * ctx.tabs.legX, 0, 0).multiply(m || new T.Matrix4());
  const spineJt = [1.09, BI.hips, 0.08, 1];

  /* tube along a path (hair strands, straps, braids). pts: [[x,y,z]…], radii: number | fn(t) */
  function tube(pts, radius, N, cell) {
    const R = pts.length, M = N + 1, P = new Float32Array(R * M * 3), PU = new Float32Array(R * M * 2), U = new Float32Array(R * M * 2), I = [];
    let along = 0; const v = new T.Vector3(), tg = new T.Vector3(), a = new T.Vector3(), b = new T.Vector3(), ref = new T.Vector3(1, 0, 0);
    for (let i = 0; i < R; i++) {
      const p0 = pts[Math.max(0, i - 1)], p1 = pts[Math.min(R - 1, i + 1)];
      tg.set(p1[0] - p0[0], p1[1] - p0[1], p1[2] - p0[2]).normalize();
      if (i > 0) along += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1], pts[i][2] - pts[i - 1][2]);
      a.crossVectors(tg, Math.abs(tg.x) > 0.9 ? new T.Vector3(0, 0, 1) : ref).normalize(); b.crossVectors(tg, a).normalize();
      const r = typeof radius === 'function' ? radius(i / (R - 1)) : radius;
      for (let j = 0; j < M; j++) {
        const ang = (j / N) * PI * 2, o = (i * M + j) * 3;
        P[o] = pts[i][0] + (a.x * Math.cos(ang) + b.x * Math.sin(ang)) * r; P[o + 1] = pts[i][1] + (a.y * Math.cos(ang) + b.y * Math.sin(ang)) * r; P[o + 2] = pts[i][2] + (a.z * Math.cos(ang) + b.z * Math.sin(ang)) * r;
        PU[(i * M + j) * 2] = j / N; PU[(i * M + j) * 2 + 1] = along * (cell || 31);
      }
    }
    for (let i = 0; i < R - 1; i++) for (let j = 0; j < N; j++) { const A = i * M + j, B2 = A + 1, C = (i + 1) * M + j, D = C + 1; I.push(A, C, B2, B2, C, D); }
    const tgeo = new T.BufferGeometry(); tgeo.setAttribute('position', new T.BufferAttribute(P, 3)); tgeo.setIndex(I); tgeo.computeVertexNormals();
    return { p: P, n: new Float32Array(tgeo.attributes.normal.array), u: U, pu: PU, i: I };
  }
  /* segment matrix for a unit cylinder (height 1 along y, diameter 1) */
  function segM(a, b, r) {
    const A = new T.Vector3(a[0], a[1], a[2]), Bv = new T.Vector3(b[0], b[1], b[2]), d = Bv.clone().sub(A), len = d.length() || 1e-4;
    return new T.Matrix4().compose(A.clone().add(Bv).multiplyScalar(0.5), new T.Quaternion().setFromUnitVectors(new T.Vector3(0, 1, 0), d.normalize()), new T.Vector3(r * 2, len, r * 2));
  }
  function catmull(pts, sub) {
    const out = [];
    for (let i = 0; i < pts.length - 1; i++) {
      const a = pts[Math.max(0, i - 1)], b = pts[i], c = pts[i + 1], d = pts[Math.min(pts.length - 1, i + 2)];
      for (let k = 0; k < sub; k++) { const t = k / sub; out.push([FA.tab.cr(a[0], b[0], c[0], d[0], t), FA.tab.cr(a[1], b[1], c[1], d[1], t), FA.tab.cr(a[2], b[2], c[2], d[2], t)]); }
    }
    out.push(pts[pts.length - 1].slice()); return out;
  }
  /* push a hanging hair/strap point out of the torso so strands lie ON the clothes, not inside them */
  function clearTorso(ctx, p, margin) {
    if (p[1] > 1.5 || p[1] < 0.85) return p;
    const r = sample(ctx.tabs.torso, p[1]), rx = r[1] + margin, rz = r[2] + margin, dx = p[0] - r[4], dz = p[2] - r[3];
    const e = (dx * dx) / (rx * rx) + (dz * dz) / (rz * rz);
    if (e < 1) { const k = 1 / Math.sqrt(Math.max(e, 0.04)); p[0] = r[4] + dx * k; p[2] = r[3] + dz * k; }
    return p;
  }

  /* ================================================================ TOPS */
  function sleeves(ctx, S, pp, g, bone0) {
    const { acc, tabs, L } = ctx, sub = L.sub;
    for (const sd of [-1, 1]) {
      const key = sd < 0 ? 'L' : 'R', jU = [PIV.arm, BI.spine, 0.05, -1], jF = [PIV.fore, BI['arm' + key], 0.05, -1];
      const o = (bone, jt) => ({ bone, color: pp.c, c2: pp.c2, pat: pp.pat, ao: 0.14, jt, m: AXm(ctx, sd) });
      if (S.up < 1.43) {
        let rows = grow(clip(tabs.uparm, S.up, 1.47), g); if (S.bell && S.up <= 1.2) rows = rows.map(r => [r[0], r[1] * (1 + 0.5 * (1 - (r[0] - 1.08) / 0.38) * 0), r[2], r[3], r[4]]);
        acc.add(loft(smooth(rows, sub), { N: L.limbN, caps: 'both', cell: pp.cell }), o(BI['arm' + key], jU));
      }
      if (S.fore < 1.09) {
        let rows = grow(clip(tabs.forearm, S.fore, 1.11), g);
        if (S.bell) rows = rows.map(r => { const t = clamp((1.0 - r[0]) / 0.16, 0, 1); return [r[0], r[1] + 0.025 * t * t, r[2] + 0.025 * t * t, r[3], r[4]]; });
        acc.add(loft(smooth(rows, sub), { N: L.limbN, caps: 'both', cell: pp.cell }), o(BI['fore' + key], jF));
        if (S.cuff) acc.add(loft(smooth(grow(clip(tabs.forearm, S.fore, S.fore + 0.04), g + 0.004), 1), { N: L.limbN, caps: 'both' }), Object.assign(o(BI['fore' + key], jF), { color: trim(pp.c), pat: 0 }));
      }
    }
  }
  function collar(ctx, S, pp, g) {
    const { acc, L } = ctx, y0 = S.neck - 0.03, sp = { bone: BI.spine, ao: 0.1, jt: spineJt };
    if (S.collar === 'crew' || S.collar === 'rib') {
      acc.add(loft([[S.neck - 0.012, 0.118, 0.092, 0.0, 0], [S.neck + 0.005, 0.088, 0.078, 0.004, 0], [S.neck + 0.022, 0.07, 0.07, 0.006, 0]].map((r, i) => [r[0], r[1] * (S.collar === 'rib' ? 1.0 : 0.96), r[2], r[3], r[4]]), { N: Math.max(8, L.bodyN * 0.7 | 0), caps: 'none' }), Object.assign({ color: S.collar === 'rib' ? pp.c : trim(pp.c), pat: S.collar === 'rib' ? pp.pat : 0 }, sp));
    } else if (S.collar === 'polo' || S.collar === 'shirt') {
      acc.add(loft([[S.neck - 0.015, 0.12, 0.098, 0, 0], [S.neck + 0.012, 0.083, 0.084, 0.004, 0], [S.neck + 0.04, 0.074, 0.074, 0.006, 0]], { N: Math.max(8, L.bodyN * 0.7 | 0), caps: 'none' }), Object.assign({ color: pp.c, pat: pp.pat === PAT.fabric ? PAT.fabric : 0 }, sp));
    } else if (S.collar === 'hood') {
      acc.add(loft([[1.43, 0.15, 0.108, -0.04, 0], [1.50, 0.115, 0.1, -0.055, 0], [1.58, 0.1, 0.1, -0.06, 0]], { N: Math.max(8, L.bodyN * 0.7 | 0), arc: [PI * 0.45, PI * 1.55], caps: 'none' }), Object.assign({ color: pp.c, pat: 0 }, sp));
    } else if (S.collar === 'v') {
      acc.add(loft([[S.neck - 0.012, 0.1, 0.09, 0.0, 0], [S.neck + 0.02, 0.07, 0.07, 0.004, 0]], { N: 8, arc: [PI * 0.12, PI * 1.88], caps: 'none' }), Object.assign({ color: pp.c, pat: 0 }, sp));
    }
  }
  function buildTop(ctx, it, S, isDress) {
    const { acc, tabs, L } = ctx, g = S.g, pp = paint(ctx, it, S);
    const col = column(ctx, S.hem, S.neck, g, S.flare);
    acc.add(loft(smooth(col, L.sub), { N: L.bodyN, caps: S.hem < 0.88 || S.collar === 'none' ? 'bottom' : 'none', cell: pp.cell, pleat: S.pleat }), { bone: BI.spine, color: pp.c, c2: pp.c2, pat: pp.pat, ao: 0.16, jt: spineJt, tint: null });
    if (S.up < 1.43 || S.fore < 1.09) sleeves(ctx, S, pp, g, BI.spine);
    if (S.collar && S.collar !== 'none') collar(ctx, S, pp, g);
    if (S.pocket && L.name !== 'far') acc.add(boxRec, { bone: BI.spine, color: mul3(pp.c, 0.9), pat: 0, ao: 0.1, jt: spineJt, m: MX(0, 1.0, frontZ(ctx, 1.0, g * 0.5), -0.12, 0, 0, 0.17, 0.1, 0.012) });
    if (S.trim && L.name !== 'far') { // embroidered neck trim / hem band
      acc.add(loft(smooth(clip(grow(col, 0.004), S.hem, S.hem + 0.04), 1), { N: L.bodyN, caps: 'none' }), { bone: BI.hips, color: pp.c2, pat: 0, ao: 0.1 });
      acc.add(loft([[1.35, 0.06, 0.03, frontZ(ctx, 1.35, g) - 0.02, 0], [1.2, 0.06, 0.03, frontZ(ctx, 1.2, g) - 0.02, 0], [1.0, 0.06, 0.03, frontZ(ctx, 1.0, g) - 0.02, 0]].map(r => r), { N: 6, caps: 'none', arc: [-PI * 0.45, PI * 0.45] }), { bone: BI.spine, color: pp.c2, pat: 0, ao: 0.1, jt: spineJt });
    }
    if (S.buttons && L.name !== 'far') for (let i = 0; i < 5; i++) { const y = 1.38 - i * 0.1; acc.add(unitSphere(5, 4), { bone: BI.spine, color: [0.92, 0.92, 0.9], pat: 0, ao: 0, jt: spineJt, m: MX(0, y, frontZ(ctx, y, g + 0.001), 0, 0, 0, 0.006, 0.006, 0.004) }); }
    if (S.epaulettes) for (const sd of [-1, 1]) acc.add(boxRec, { bone: BI.spine, color: [0.1, 0.1, 0.12], pat: 0, ao: 0.1, jt: spineJt, m: MX(sd * 0.15, 1.44, 0.0, 0, 0, sd * -0.35, 0.07, 0.008, 0.06) });
    
  }

  /* ================================================================ BOTTOMS */
  function buildBottom(ctx, it, S) {
    const { acc, tabs, L } = ctx, pp = paint(ctx, it, S), sub = L.sub, g = S.g, waist = 1.045;
    if (S.skirt) { // hangs from the hips bone only; avatar-rig clamps leg swing for long skirts
      let col = column(ctx, S.hem, waist, g, S.flare);
      const pl = S.pleat ? { n: 14, amp: 0.05 } : null;
      acc.add(loft(smooth(col, sub), { N: L.bodyN, caps: 'none', cell: pp.cell, pleat: pl }), { bone: BI.hips, color: pp.c, c2: pp.c2, pat: pp.pat, ao: 0.2 });
      acc.add(loft(smooth(clip(grow(col, 0.003), waist - 0.035, waist), 1), { N: L.bodyN, caps: 'top' }), { bone: BI.hips, color: pp.c2, pat: 0, ao: 0.1 });
      if (S.wrap && L.name !== 'far') { acc.add(unitSphere(8, 6), { bone: BI.hips, color: pp.c, c2: pp.c2, pat: pp.pat, ao: 0.1, m: MX(0.11, 0.98, 0.1, 0, 0, 0, 0.05, 0.04, 0.035) }); acc.add(boxRec, { bone: BI.hips, color: pp.c, c2: pp.c2, pat: pp.pat, ao: 0.1, m: MX(0.14, 0.78, 0.11, 0, 0, 0.15, 0.06, 0.34, 0.012) }); }
      return;
    }
    const col = column(ctx, 0.80, waist, g + 0.001, 0);
    acc.add(loft(smooth(col, sub), { N: L.bodyN, caps: 'none', cell: pp.cell }), { bone: BI.hips, color: pp.c, c2: pp.c2, pat: pp.pat, ao: 0.16 });
    if (S.belt && L.name !== 'far') { acc.add(loft(smooth(clip(grow(col, 0.0035), waist - 0.03, waist), 1), { N: L.bodyN, caps: 'none' }), { bone: BI.hips, color: [0.08, 0.06, 0.05], pat: 0, ao: 0.05 }); acc.add(boxRec, { bone: BI.hips, color: GOLD, pat: 0, ao: 0, m: MX(0, waist - 0.015, frontZ({ tabs: { torso: tabs.pelvis } }, waist - 0.015, g + 0.006), 0, 0, 0, 0.03, 0.02, 0.006) }); }
    for (const sd of [-1, 1]) {
      const key = sd < 0 ? 'L' : 'R', tp = (k) => (S.taper !== 1 ? lerp(1, S.taper, k) : 1);
      let th = clip(tabs.thigh, Math.max(0.5, S.hem), 0.93).map(r => [r[0], r[1] * (S.bag ? 1.28 : 1) + g, r[2] * (S.bag ? 1.2 : 1) + g, r[3], 0]);
      acc.add(loft(smooth(th, sub), { N: L.limbN, caps: 'none', cell: pp.cell }), { bone: BI['thigh' + key], color: pp.c, c2: pp.c2, pat: pp.pat, ao: 0.16, jt: [PIV.thigh, BI.hips, 0.05, -1], m: LXm(ctx, sd) });
      if (S.hem < 0.5) {
        const sh = clip(tabs.shin, S.hem, 0.5).map(r => { const k = tp((0.5 - r[0]) / 0.42); return [r[0], r[1] * k * (S.bag ? 1.3 : 1) + g, r[2] * k * (S.bag ? 1.25 : 1) + g, r[3], 0]; });
        acc.add(loft(smooth(sh, sub), { N: L.limbN, caps: 'none', cell: pp.cell }), { bone: BI['shin' + key], color: pp.c, c2: pp.c2, pat: pp.pat, ao: 0.16, jt: [PIV.shin, BI['thigh' + key], 0.05, -1], m: LXm(ctx, sd) });
        if (S.cuff) acc.add(loft(smooth(clip(tabs.shin, S.hem, S.hem + 0.06).map(r => [r[0], r[1] * tp(1) + g + 0.006, r[2] * tp(1) + g + 0.006, r[3], 0]), 1), { N: L.limbN, caps: 'both' }), { bone: BI['shin' + key], color: trim(pp.c), pat: 0, ao: 0.1, jt: [PIV.shin, BI['thigh' + key], 0.05, -1], m: LXm(ctx, sd) });
      }
    }
  }

  /* ================================================================ DRESSES */
  function buildDress(ctx, it, S) {
    const { acc, L } = ctx, pp = paint(ctx, it, S), sub = L.sub, g = S.g;
    const col = column(ctx, S.hem, S.neck, g, S.flare);
    // ONE loft from hem to neckline: rows below the waist follow the hips bone, rows above follow the spine
    acc.add(loft(smooth(col, sub), { N: L.bodyN, caps: 'top', cell: pp.cell, pleat: S.flare > 0.3 ? { n: 12, amp: 0.035 } : null }), { bone: BI.spine, color: pp.c, c2: pp.c2, pat: pp.pat, ao: 0.18, jt: [1.0, BI.hips, 0.12, 1] });
    if (S.up < 1.43 || S.fore < 1.09) sleeves(ctx, S, pp, g);
    if (S.strap) for (const sd of [-1, 1]) acc.add(boxRec, { bone: BI.spine, color: pp.c, pat: 0, ao: 0.1, jt: spineJt, m: segM([sd * 0.082, S.neck - 0.02, frontZ(ctx, S.neck - 0.02, g + 0.002)], [sd * 0.066, 1.488, 0.0], 0.5).multiply(MX(0, 0, 0, 0, 0, 0, 0.022, 1, 0.004)) });
    if (S.puff && L.name !== 'far') for (const sd of [-1, 1]) acc.add(unitSphere(8, 6), { bone: BI['arm' + (sd < 0 ? 'L' : 'R')], color: pp.c, c2: pp.c2, pat: pp.pat, ao: 0.1, jt: [PIV.arm, BI.spine, 0.05, -1], m: AXm(ctx, sd, MX(0, 1.39, 0, 0, 0, 0, 0.07, 0.06, 0.07)) });
  }

  /* ================================================================ LAYERS */
  function buildLayer(ctx, it, S) {
    const { acc, L } = ctx, pp = paint(ctx, it, S), sub = L.sub, g = S.g;
    const col = column(ctx, S.hem, S.neck, g, S.hem < 0.8 ? 0.08 : 0.02);
    const arc = S.open ? [PI * 0.1, PI * 1.9] : null;
    acc.add(loft(smooth(col, sub), { N: L.bodyN, arc, caps: S.open ? 'none' : 'bottom', cell: pp.cell }), { bone: BI.spine, color: pp.c, c2: pp.c2, pat: pp.pat, ao: 0.18, jt: spineJt });
    if (S.up < 1.43 || S.fore < 1.09) sleeves(ctx, Object.assign({}, S, { cuff: S.rib }), pp, g);
    if (S.rib) { acc.add(loft(smooth(clip(grow(col, 0.004), S.hem, S.hem + 0.045), 1), { N: L.bodyN, caps: 'none' }), { bone: BI.spine, color: trim(pp.c), pat: PAT.knit, jt: spineJt }); acc.add(loft([[S.neck - 0.015, 0.12, 0.1, 0, 0], [S.neck + 0.03, 0.078, 0.076, 0.006, 0]], { N: 10, caps: 'none' }), { bone: BI.spine, color: trim(pp.c), pat: PAT.knit, jt: spineJt }); }
    if (S.lapel && L.name !== 'far') for (const sd of [-1, 1]) acc.add(boxRec, { bone: BI.spine, color: mul3(pp.c, 0.9), pat: 0, ao: 0.1, jt: spineJt, m: MX(sd * 0.055, 1.33, frontZ(ctx, 1.33, g + 0.002), -0.12, 0, sd * 0.22, 0.05, 0.2, 0.01) });
    if (S.vest) { // reflective bands (security / cleaners)
      for (const y of [1.08, 1.27]) acc.add(loft(smooth(clip(grow(col, 0.003), y, y + 0.045), 1), { N: L.bodyN, caps: 'none' }), { bone: BI.spine, color: [0.86, 0.88, 0.9], pat: 0, ao: 0, jt: spineJt });
      for (const sd of [-1, 1]) acc.add(boxRec, { bone: BI.spine, color: [0.86, 0.88, 0.9], pat: 0, ao: 0, jt: spineJt, m: MX(sd * 0.075, 1.32, frontZ(ctx, 1.32, g + 0.002), 0, 0, 0, 0.035, 0.3, 0.006) });
    }
  }

  /* ================================================================ HAIR */
  function scalpTest(id) {
    const hl = B.hl;
    return (ux, uy, uz) => uy > hl(uz);
  }
  const HAIR_TIPS = { box_braids: 1, locs: 1 };
  function hairColor(ctx) { const O = FA.OPTIONS.palettes.hair; return hexRGB(O[ctx.look.hair.color % O.length]); }

  function hairPoint(head, ux, uy, uz, k) { const P = head.P; return [ux * P.rx * k, P.cy + uy * P.ry * k, uz * P.rz * k]; }
  const HC = [0, 1.555, 0.006];
  function strand(ctx, start, len, opt) { // hanging strand in avatar space, kept clear of the torso
    const pts = [], n = opt.n || 7, side = start[0] > 0 ? 1 : -1;
    for (let i = 0; i <= n; i++) {
      const t = i / n;
      const p = [start[0] * (1 + (opt.spread || 0.06) * t) + (opt.dx || 0) * t, start[1] - len * t, start[2] + (opt.dz || 0) * t];
      pts.push(clearTorso(ctx, p, opt.margin || 0.03));
    }
    return pts;
  }
  function buildHair(ctx) {
    const { acc, look, L, head } = ctx, id = look.hair.style, hw = look.wear.head && look.wear.head.id;
    if (!head || id === 'bald') return;
    if (hw === 'hijab' || hw === 'durag' || hw === 'gele') return;
    const capped = hw === 'cap' || hw === 'beanie' || hw === 'peaked';
    const hair = hairColor(ctx), skin = ctx.skin, P = head.P, Hm = head.Hm, hb = BI.head, R = rng(look.hair.seed || 7), hl = B.hl;
    const hairMat = { bone: hb, color: hair, pat: PAT.hair, ao: 0.12, m: Hm };
    const jtLong = [1.5, BI.spine, 0.16, 1];
    const sstep = (a, b2, x) => { const t = clamp((x - a) / (b2 - a), 0, 1); return t * t * (3 - 2 * t); };
    const softTint = (k, base) => { const sk = mul3(skin, 1.0); return (x, y, z) => { const uy = (y - 1.555 - P.cy) / (P.ry * k), uz = (z - 0.006) / (P.rz * k); return mix3(sk, base, sstep(0.0, 0.1, uy - hl(uz))); }; };
    const cap = (k, test, extra) => { const o = Object.assign({}, hairMat, extra || {}); if (!o.tint && !o.hard) o.tint = softTint(k, o.color); return acc.add(B.shell(head, test, k, 16), o); };
    const scalp = (k, extra) => { if (!capped) cap(k, (ux, uy, uz) => uy > hl(uz), extra); };
    const cornrowRec = (k, test) => { const r = B.shell(head, test, k, 16); for (let i = 0; i < r.p.length / 3; i++) { r.pu[i * 2] = r.p[i * 3] / 0.0135; r.pu[i * 2 + 1] = r.p[i * 3 + 2] / 0.0135; } return r; };
    const strandsN = (n) => Math.max(0, Math.round(n * L.strands));
    const dotOnCap = (minY) => { // random unit-sphere point on the scalp
      for (let t = 0; t < 30; t++) { const u = R() * 2 - 1, a = R() * PI * 2, s = Math.sqrt(1 - u * u), ux = s * Math.cos(a), uz = s * Math.sin(a), uy = u; if (uy > Math.max(minY, hl(uz) + 0.04)) return [ux, uy, uz]; }
      return [0, 1, 0];
    };
    switch (id) {
      case 'buzz': scalp(1.012, { color: mix3(hair, skin, 0.35) }); break;
      case 'fade':
        if (!capped) { cap(1.012, (ux, uy, uz) => uy > hl(uz), { color: mix3(hair, skin, 0.5) }); cap(1.03, (ux, uy, uz) => uy > hl(uz) + 0.34 || (uy > 0.1 && uz > 0.3 && uy > hl(uz) + 0.18)); }
        break;
      case 'afro': if (!capped) cap(1.34, (ux, uy, uz) => uy > hl(uz) - 0.06 && !(uz > 0.8 && uy < 0.55)); break;
      case 'twists':
        scalp(1.02);
        { const n = strandsN(70); for (let i = 0; i < n; i++) { const u = dotOnCap(capped ? 0.7 : 0.15), p = hairPoint(head, u[0], u[1], u[2], 1.03), up = new T.Vector3(u[0] * 0.7, u[1], u[2] * 0.7).normalize(); const q = new T.Quaternion().setFromUnitVectors(new T.Vector3(0, 1, 0), up); acc.add(unitSphere(5, 4), Object.assign({}, hairMat, { m: Hm.clone().multiply(new T.Matrix4().compose(new T.Vector3(p[0] + up.x * 0.012, p[1] + up.y * 0.012, p[2] + up.z * 0.012), q, new T.Vector3(0.0145, 0.026, 0.0145))) })); } }
        break;
      case 'cornrows': if (!capped) acc.add(cornrowRec(1.016, (ux, uy, uz) => uy > hl(uz)), Object.assign({}, hairMat, { pat: PAT.cornrows, tint: softTint(1.016, hair) })); break;
      case 'braid_updo':
        if (!capped) acc.add(cornrowRec(1.016, (ux, uy, uz) => uy > hl(uz)), Object.assign({}, hairMat, { pat: PAT.cornrows }));
        acc.add(torus(0.042, 0.017, 6, 14), Object.assign({}, hairMat, { pat: PAT.braid, m: Hm.clone().multiply(MX(0, P.cy + P.ry * 0.97, -0.02, PI / 2 - 0.2, 0, 0)) }));
        break;
      case 'bun': scalp(1.014); acc.add(unitSphere(L.name === 'far' ? 6 : 12, L.name === 'far' ? 5 : 9), Object.assign({}, hairMat, { m: Hm.clone().multiply(MX(0, P.cy + P.ry * 1.02, -0.03, 0, 0, 0, 0.052, 0.048, 0.052)) })); break;
      case 'puffs': scalp(1.014); for (const sd of [-1, 1]) acc.add(unitSphere(L.name === 'far' ? 6 : 12, L.name === 'far' ? 5 : 9), Object.assign({}, hairMat, { m: Hm.clone().multiply(MX(sd * 0.06, P.cy + P.ry * 0.92, -0.018, 0, 0, 0, 0.056, 0.052, 0.056)) })); break;
      case 'ponytail': {
        scalp(1.016);
        const pts = catmull([[0, 1.555 + P.cy + P.ry * 0.62, 0.006 - P.rz * 0.8], [0, 1.555 + P.cy + P.ry * 0.7, -0.17], [0, 1.555 + P.cy * 0.5, -0.215], [0, 1.43, -0.205], [0, 1.30, -0.17], [0, 1.2, -0.15]].map(p => p), 3);
        acc.add(tube(pts.map(p => clearTorso(ctx, p.slice(), 0.03)), (t) => 0.034 * (1 - 0.55 * t) + 0.004, 8, 31), { bone: hb, color: hair, pat: PAT.hair, ao: 0.1, jt: jtLong });
        acc.add(torus(0.03, 0.007, 5, 10), Object.assign({}, hairMat, { color: [0.05, 0.04, 0.04], pat: 0, m: MX(0, 1.555 + P.cy + P.ry * 0.68, -0.15, 0.4, 0, 0) }));
        break; }
      case 'box_braids': case 'locs': {
        scalp(id === 'locs' ? 1.03 : 1.016);
        const isL = id === 'locs', n = strandsN(isL ? 24 : 46);
        for (let i = 0; i < n; i++) {
          let u = null; for (let tr = 0; tr < 20 && !u; tr++) { const c = dotOnCap(0.0); if (c[2] < 0.22 && !(c[2] > 0 && Math.abs(c[0]) < 0.88) && c[1] > hl(c[2]) + 0.03) u = c; }
          if (!u) continue;
          const hp = hairPoint(head, u[0], u[1], u[2], 1.01), st = [hp[0], hp[1] + 1.555, hp[2] + 0.006];
          const back = u[2] < -0.1, len = isL ? 0.2 + R() * 0.14 : (back ? 0.42 + R() * 0.16 : 0.2 + R() * 0.12);
          const pts = catmull(strand(ctx, st, len + (st[1] - 1.52), { n: 6, spread: 0.05, margin: 0.032 }), 2);
          acc.add(tube(pts, (t) => (isL ? 0.0105 : 0.0068) * (1 - 0.25 * t), isL ? 6 : 5, isL ? 22 : 31), { bone: hb, color: hair, pat: isL ? PAT.hair : PAT.braid, ao: 0.1, jt: jtLong });
        }
        break; }
      case 'long_straight': case 'bob': {
        scalp(1.02);
        const bob = id === 'bob', yb = bob ? 1.42 : 1.2;
        const rows = [[1.66, 0.092, 0.108, -0.006, 0], [1.58, 0.1, 0.12, -0.012, 0], [1.50, 0.108, 0.128, -0.02, 0], [1.42, bob ? 0.108 : 0.12, bob ? 0.128 : 0.14, -0.025, 0]];
        if (!bob) rows.push([1.30, 0.15, 0.15, -0.028, 0], [1.2, 0.152, 0.152, -0.028, 0]);
        // keep it behind / beside the shoulders
        const hr = rows.map(r => { const t = sample(ctx.tabs.torso, r[0]); const need = (r[0] < 1.5 && r[0] > 0.85) ? t[2] + t[3] + 0.02 : 0; return [r[0], Math.max(r[1], r[0] < 1.45 ? t[1] * 0.78 : 0), Math.max(r[2], need * 0 + r[2]), Math.min(r[3], -0.03 - (r[0] < 1.45 ? 0.01 : 0)), 0]; });
        acc.add(loft(smooth(hr, 2), { N: bob ? 12 : 14, arc: [PI * (bob ? 0.28 : 0.55), PI * (bob ? 1.72 : 1.45)], caps: 'none' }), { bone: hb, color: hair, pat: PAT.hair, ao: 0.1, jt: jtLong });
        if (!bob) for (const sd of [-1, 1]) acc.add(tube(catmull(strand(ctx, [sd * 0.09, 1.56, 0.06], 0.3, { n: 4, spread: 0.12, margin: 0.03 }), 2), (t) => 0.02 * (1 - 0.5 * t) + 0.003, 6, 24), { bone: hb, color: hair, pat: PAT.hair, ao: 0.1, jt: jtLong });
        break; }
    }
  }

  /* ================================================================ HEADWEAR */
  function buildHeadwear(ctx) {
    const { acc, look, L, head } = ctx, it = look.wear.head; if (!head || !it || it.id === 'none') return;
    const pp = paint(ctx, it, null), P = head.P, Hm = head.Hm, hb = BI.head, hl = B.hl;
    const m0 = { bone: hb, color: pp.c, c2: pp.c2, pat: it.p ? pp.pat : PAT.fabric, ao: 0.14, m: Hm };
    const shell = (k, t) => B.shell(head, t, k, 16);
    switch (it.id) {
      case 'cap': acc.add(shell(1.04, (ux, uy, uz) => uy > 0.3 - 0.4 * Math.max(0, -uz) - 0.1 * Math.abs(ux)), m0);
        acc.add(unitSphere(10, 6), Object.assign({}, m0, { color: pp.c2, pat: 0, m: Hm.clone().multiply(MX(0, P.cy + P.ry * 0.33, P.rz * 0.95, 0.25, 0, 0, P.rx * 1.0, 0.004, 0.085)) }));
        acc.add(unitSphere(5, 4), Object.assign({}, m0, { m: Hm.clone().multiply(MX(0, P.cy + P.ry * 1.04, 0, 0, 0, 0, 0.008, 0.007, 0.008)) })); break;
      case 'peaked': acc.add(shell(1.07, (ux, uy, uz) => uy > 0.22), m0);
        acc.add(unitSphere(12, 5), Object.assign({}, m0, { m: Hm.clone().multiply(MX(0, P.cy + P.ry * 1.03, -0.004, 0, 0, 0, P.rx * 1.38, 0.016, P.rz * 1.3)) }));
        acc.add(unitSphere(10, 4), Object.assign({}, m0, { color: [0.04, 0.04, 0.05], pat: 0, m: Hm.clone().multiply(MX(0, P.cy + P.ry * 0.25, P.rz * 1.05, 0.2, 0, 0, P.rx * 1.0, 0.004, 0.075)) }));
        acc.add(unitSphere(6, 4), Object.assign({}, m0, { color: GOLD, pat: 0, m: Hm.clone().multiply(MX(0, P.cy + P.ry * 0.62, P.rz * 1.08, 0, 0, 0, 0.012, 0.012, 0.004)) })); break;
      case 'beanie': acc.add(shell(1.05, (ux, uy, uz) => uy > 0.12 - 0.15 * Math.max(0, -uz)), Object.assign({}, m0, { pat: PAT.knit }));
        acc.add(shell(1.075, (ux, uy, uz) => uy > 0.12 - 0.15 * Math.max(0, -uz) && uy < 0.34 - 0.2 * Math.max(0, -uz)), Object.assign({}, m0, { color: pp.c2, pat: PAT.knit })); break;
      case 'durag': acc.add(shell(1.03, (ux, uy, uz) => uy > 0.12 - 0.3 * Math.max(0, -uz)), Object.assign({}, m0, { pat: PAT.fabric }));
        for (const sd of [-1, 1]) acc.add(tube([[sd * 0.012, 1.60, -0.095], [sd * 0.03, 1.52, -0.12], [sd * 0.05, 1.40, -0.15], [sd * 0.055, 1.30, -0.16]].map(p => clearTorso(ctx, p, 0.03)), 0.011, 5, 24), { bone: hb, color: pp.c, pat: 0, ao: 0.1, jt: [1.5, BI.spine, 0.16, 1] }); break;
      case 'gele': {
        const o = Object.assign({}, m0, { pat: it.p ? pp.pat : PAT.ankara_a });
        acc.add(shell(1.055, (ux, uy, uz) => uy > 0.18 - 0.2 * Math.max(0, -uz)), o);
        for (const sd of [-1, 1]) acc.add(unitSphere(L.name === 'far' ? 6 : 12, L.name === 'far' ? 5 : 9), Object.assign({}, o, { m: Hm.clone().multiply(MX(sd * 0.065, P.cy + P.ry * 1.05, 0.0, 0, 0, sd * -0.5, 0.1, 0.055, 0.075)) }));
        acc.add(unitSphere(10, 7), Object.assign({}, o, { m: Hm.clone().multiply(MX(0, P.cy + P.ry * 1.18, 0.02, 0, 0, 0, 0.07, 0.065, 0.065)) }));
        break; }
      case 'hijab': {
        const out = (ux, uy, uz) => !(uz > 0.42 && uy > -0.62 && uy < 0.5 && Math.abs(ux) < 0.8);
        acc.add(shell(1.075, (ux, uy, uz) => uy > -0.62 && out(ux, uy, uz)), Object.assign({}, m0, { pat: PAT.fabric }));
        acc.add(loft(smooth([[1.30, 0.19, 0.145, -0.01, 0], [1.40, 0.17, 0.128, -0.008, 0], [1.47, 0.106, 0.092, -0.008, 0], [1.52, 0.086, 0.084, -0.004, 0]], 2), { N: 14, caps: 'none' }), { bone: hb, color: pp.c, pat: PAT.fabric, ao: 0.16, jt: [1.5, BI.spine, 0.16, 1] }); break; }
    }
  }

  /* ================================================================ FACE EXTRAS */
  function buildBeard(ctx) {
    const { acc, look, head } = ctx, bd = look.beard; if (!head || !bd || bd === 'none' || look.body.frame === 'f') return;
    const P = head.P, hair = mix3(hexRGB(FA.OPTIONS.palettes.hair[look.hair.color % 12]), ctx.skin, 0.1), m = { bone: BI.head, color: hair, pat: PAT.hair, ao: 0.12, m: head.Hm };
    const mouth = (ux, uy, uz) => uz > 0.55 && Math.abs(ux) < 0.34 && uy > -0.74 && uy < -0.5;
    switch (bd) {
      case 'stubble': acc.add(B.shell(head, (ux, uy, uz) => uy < -0.28 && uz > -0.1 && !mouth(ux, uy, uz), 1.006), Object.assign({}, m, { color: mix3(hair, ctx.skin, 0.62) })); break;
      case 'mustache': acc.add(B.shell(head, (ux, uy, uz) => uy < -0.38 && uy > -0.52 && uz > 0.55 && Math.abs(ux) < 0.38, 1.014), m); break;
      case 'goatee': acc.add(B.shell(head, (ux, uy, uz) => (uy < -0.74 && Math.abs(ux) < 0.4 && uz > 0.2) || (uy < -0.38 && uy > -0.52 && uz > 0.55 && Math.abs(ux) < 0.38), 1.016), m); break;
      case 'full': acc.add(B.shell(head, (ux, uy, uz) => ((uy < -0.2 && uz > -0.2 && Math.abs(ux) > 0.1) || (uy < -0.7 && uz > 0.1)) && !mouth(ux, uy, uz), 1.02), m); break;
    }
  }
  function buildGlasses(ctx) {
    const { acc, look, head } = ctx, it = look.wear.glasses; if (!head || !it || it.id === 'none') return;
    const P = head.P, Hm = head.Hm, hb = BI.head, es = head.eyeX, ey = head.eyeY, s = head.surf(0, ey), zf = s.z + 0.02;
    const dark = it.id === 'shades', frame = dark ? [0.03, 0.03, 0.035] : mul3(hexRGB(FA.OPTIONS.palettes.cloth[(it.c || 1) % 24]), 0.8);
    const rr = it.id === 'round' ? 0.0235 : 0.025, sq = it.id !== 'round';
    for (const sd of [-1, 1]) {
      const x = sd * es;
      if (sq) acc.add(boxRec, { bone: hb, color: frame, pat: 0, ao: 0, m: Hm.clone().multiply(MX(x, ey + 0.012, zf, 0, 0, 0, 0.05, 0.002, 0.003)) }), acc.add(boxRec, { bone: hb, color: frame, pat: 0, ao: 0, m: Hm.clone().multiply(MX(x, ey - 0.012, zf, 0, 0, 0, 0.05, 0.002, 0.003)) }), acc.add(boxRec, { bone: hb, color: frame, pat: 0, ao: 0, m: Hm.clone().multiply(MX(x + sd * 0.025, ey, zf, 0, 0, 0, 0.002, 0.026, 0.003)) }), acc.add(boxRec, { bone: hb, color: frame, pat: 0, ao: 0, m: Hm.clone().multiply(MX(x - sd * 0.025, ey, zf, 0, 0, 0, 0.002, 0.026, 0.003)) });
      else acc.add(torus(rr, 0.0018, 4, 14), { bone: hb, color: frame, pat: 0, ao: 0, m: Hm.clone().multiply(MX(x, ey, zf, 0, 0, 0)) });
      if (dark) acc.add(unitSphere(8, 5), { bone: hb, color: [0.03, 0.04, 0.06], pat: 0, ao: 0, m: Hm.clone().multiply(MX(x, ey, zf, 0, 0, 0, 0.026, 0.022, 0.0012)) });
      acc.add(unitCyl(4), { bone: hb, color: frame, pat: 0, ao: 0, m: Hm.clone().multiply(segM([sd * (es + 0.025), ey + 0.004, zf], [sd * (P.rx * 0.98), ey + 0.004, -0.02], 0.0016)) });
    }
    acc.add(boxRec, { bone: hb, color: frame, pat: 0, ao: 0, m: Hm.clone().multiply(MX(0, ey + 0.004, zf, 0, 0, 0, 0.02, 0.002, 0.003)) });
  }

  /* ================================================================ BAGS + ACCESSORIES */
  function buildBag(ctx) {
    const { acc, look, L } = ctx, it = look.wear.bag; if (!it || it.id === 'none') return;
    const pp = paint(ctx, it, null);
    if (it.id === 'backpack') {
      acc.add(loft(smooth([[1.0, 0.13, 0.06, -0.185, 0], [1.1, 0.145, 0.075, -0.19, 0], [1.28, 0.14, 0.075, -0.19, 0], [1.38, 0.115, 0.055, -0.185, 0]], 1), { N: 10, caps: 'both' }), { bone: BI.spine, color: pp.c, c2: pp.c2, pat: pp.pat, ao: 0.2, jt: spineJt });
      acc.add(loft([[1.06, 0.06, 0.02, -0.255, 0], [1.2, 0.07, 0.02, -0.262, 0]], { N: 8, caps: 'both' }), { bone: BI.spine, color: pp.c2, pat: 0, ao: 0.2, jt: spineJt });
      for (const sd of [-1, 1]) acc.add(tube(catmull([[sd * 0.085, 1.34, -0.16], [sd * 0.095, 1.46, -0.07], [sd * 0.1, 1.46, 0.03], [sd * 0.1, 1.36, 0.1], [sd * 0.115, 1.2, 0.07], [sd * 0.1, 1.1, -0.12]].map(p => p), 2), 0.012, 5, 24), { bone: BI.spine, color: pp.c2, pat: 0, ao: 0.1, jt: spineJt });
    } else if (it.id === 'sling') {
      acc.add(tube(catmull([[0.1, 1.46, 0.0], [0.08, 1.36, 0.11], [-0.02, 1.2, 0.12], [-0.12, 1.05, 0.06], [-0.16, 1.0, -0.06]], 3), 0.011, 5, 24), { bone: BI.spine, color: pp.c2, pat: 0, ao: 0.1, jt: spineJt });
      acc.add(loft(smooth([[0.95, 0.07, 0.04, -0.14, -0.15], [1.05, 0.08, 0.045, -0.14, -0.15], [1.14, 0.065, 0.04, -0.14, -0.15]], 1), { N: 9, caps: 'both' }), { bone: BI.hips, color: pp.c, c2: pp.c2, pat: pp.pat, ao: 0.2 });
    } else if (it.id === 'handbag') {
      const m = AXm(ctx, 1, MX(0.01, PIV.hand - 0.16, 0.02));
      acc.add(boxRec, { bone: BI.handR, color: pp.c, c2: pp.c2, pat: pp.pat, ao: 0.2, m: m.clone().multiply(MX(0, 0, 0, 0, 0, 0, 0.17, 0.12, 0.07)) });
      acc.add(torus(0.045, 0.006, 4, 12, PI), { bone: BI.handR, color: pp.c2, pat: 0, ao: 0.1, m: m.clone().multiply(MX(0, 0.05, 0, 0, 0, 0)) });
    }
  }
  function buildAccessories(ctx) {
    const { acc, look, L, head } = ctx, w = look.wear;
    const nk = w.neck;
    if (nk && nk.id !== 'none') {
      const pp = paint(ctx, nk, null), jt = spineJt;
      if (nk.id === 'chain') { acc.add(torus(0.085, 0.0035, 5, 22), { bone: BI.spine, color: metal(nk), pat: 0, ao: 0, jt, m: MX(0, 1.41, 0.015, PI / 2 + 0.25, 0, 0, 1.05, 1.0, 1.25) }); acc.add(unitSphere(6, 5), { bone: BI.spine, color: metal(nk), pat: 0, ao: 0, jt, m: MX(0, 1.33, frontZ(ctx, 1.33, 0.012), 0, 0, 0, 0.012, 0.016, 0.005) }); }
      if (nk.id === 'tie') { const z = frontZ(ctx, 1.27, 0.014); acc.add(boxRec, { bone: BI.spine, color: pp.c, pat: PAT.diagonal, c2: pp.c2, ao: 0.1, jt, m: MX(0, 1.25, z, -0.08, 0, 0, 0.034, 0.3, 0.008) }); acc.add(unitSphere(6, 5), { bone: BI.spine, color: pp.c, pat: 0, ao: 0.1, jt, m: MX(0, 1.405, frontZ(ctx, 1.405, 0.016), 0, 0, 0, 0.022, 0.022, 0.014) }); }
      if (nk.id === 'lanyard') { for (const sd of [-1, 1]) acc.add(tube(catmull([[sd * 0.05, 1.5, -0.02], [sd * 0.075, 1.45, 0.07], [sd * 0.04, 1.3, frontZ(ctx, 1.3, 0.012)], [0, 1.2, frontZ(ctx, 1.2, 0.012)]], 2), 0.005, 4, 24), { bone: BI.spine, color: pp.c, pat: 0, ao: 0, jt }); acc.add(boxRec, { bone: BI.spine, color: [0.95, 0.95, 0.95], pat: 0, ao: 0, jt, m: MX(0, 1.16, frontZ(ctx, 1.16, 0.016), -0.1, 0, 0, 0.055, 0.08, 0.004) }); }
      if (nk.id === 'scarf') { acc.add(loft([[1.43, 0.115, 0.1, 0, 0], [1.48, 0.1, 0.092, 0.004, 0], [1.54, 0.074, 0.076, 0.008, 0]], { N: 12, caps: 'none' }), { bone: BI.spine, color: pp.c, pat: PAT.knit, ao: 0.14, jt }); acc.add(boxRec, { bone: BI.spine, color: pp.c, pat: PAT.knit, ao: 0.14, jt, m: MX(0.05, 1.3, frontZ(ctx, 1.3, 0.02), -0.05, 0, 0.05, 0.075, 0.25, 0.018) }); }
    }
    const wr = w.wrist;
    if (wr && wr.id !== 'none') {
      const key = 'L', jF = [PIV.fore, BI.armL, 0.05, -1], mm = AXm(ctx, -1);
      if (wr.id === 'watch') { acc.add(loft(smooth(grow(clip(ctx.tabs.forearm, 0.86, 0.92), 0.004), 1), { N: 8, caps: 'both' }), { bone: BI.foreL, color: [0.1, 0.1, 0.12], pat: 0, ao: 0.1, jt: jF, m: mm }); acc.add(boxRec, { bone: BI.foreL, color: metal(wr), pat: 0, ao: 0, jt: jF, m: mm.clone().multiply(MX(0, 0.9, 0.034, 0, 0, 0, 0.034, 0.034, 0.008)) }); }
      if (wr.id === 'bangles') for (let i = 0; i < 3; i++) acc.add(torus(0.032, 0.0035, 4, 14), { bone: BI.foreL, color: i % 2 ? SILVER : GOLD, pat: 0, ao: 0, jt: jF, m: mm.clone().multiply(MX(0, 0.88 + i * 0.016, 0, PI / 2, 0, 0)) });
    }
    const er = w.ears;
    if (head && er && er.id !== 'none') for (const sd of [-1, 1]) {
      const P = head.P, ex = sd * P.rx * 1.0, ey = P.cy - 0.03, mt = metal(er);
      if (er.id === 'studs') acc.add(unitSphere(5, 4), { bone: BI.head, color: mt, pat: 0, ao: 0, m: head.Hm.clone().multiply(MX(ex, ey, -0.012, 0, 0, 0, 0.0065, 0.0065, 0.0065)) });
      else acc.add(torus(0.019, 0.0018, 4, 12), { bone: BI.head, color: mt, pat: 0, ao: 0, m: head.Hm.clone().multiply(MX(ex, ey - 0.02, -0.012, 0, PI / 2, 0)) });
    }
  }

  /* ================================================================ orchestration for the clothing part */
  function buildWear(ctx) {
    const w = ctx.look.wear, dress = w.dress && w.dress.id !== 'none' ? DRESS[w.dress.id] : null;
    if (dress) buildDress(ctx, w.dress, dress);
    else { if (w.bottom && BOTTOM[w.bottom.id]) buildBottom(ctx, w.bottom, BOTTOM[w.bottom.id]); if (w.top && TOP[w.top.id]) buildTop(ctx, w.top, TOP[w.top.id]); }
    if (w.layer && LAYER[w.layer.id]) buildLayer(ctx, w.layer, LAYER[w.layer.id]);
  }

  FA._wear = { buildWear, buildHair, buildHeadwear, buildBeard, buildGlasses, buildBag, buildAccessories, tube, segM };
})(typeof window !== 'undefined' ? window : globalThis);
