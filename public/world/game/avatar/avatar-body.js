/* ==========================================================================
   FUTA Avatar — body, head, face, hands, shoes
   Builds into a FutaAvatar.Acc through a "ctx" created in avatar-build.js.
   All coordinates are avatar-root space (metres, +z = front, y up, 1.78 m reference body).
   ========================================================================== */
(function (global) {
  'use strict';
  const T = global.THREE, FA = global.FutaAvatar;
  const { clamp, lerp, mix3, mul3 } = FA.util;
  const { smooth, grow, mulR, clip, sample, sortY } = FA.tab;
  const { loft, fromTHREE } = FA.geo;
  const PAT = FA.PAT, PIV = FA.PIV, TAB = FA.TAB, PI = Math.PI;

  /* ---------- LOD parameters: the main mobile-performance knob ---------- */
  FA.LOD = [
    { name: 'hero', bodyN: 24, limbN: 14, sub: 3, head: [48, 34], hands: 'full', lids: true, brows: 4, hairDetail: 2, strands: 1.0, ears: true, nose: 2 },
    { name: 'near', bodyN: 12, limbN: 8, sub: 1, head: [24, 16], hands: 'mitten', lids: false, brows: 2, hairDetail: 1, strands: 0.4, ears: true, nose: 2 },
    { name: 'far', bodyN: 8, limbN: 6, sub: 1, head: [12, 8], hands: 'ball', lids: false, brows: 0, hairDetail: 0, strands: 0.15, ears: false, nose: 0 }
  ];

  /* ---------- tiny helpers ---------- */
  function MX(px, py, pz, rx, ry, rz, sx, sy, sz) {
    return new T.Matrix4().compose(new T.Vector3(px || 0, py || 0, pz || 0), new T.Quaternion().setFromEuler(new T.Euler(rx || 0, ry || 0, rz || 0)),
      new T.Vector3(sx === undefined ? 1 : sx, sy === undefined ? 1 : sy, sz === undefined ? 1 : sz));
  }
  const sphereCache = {};
  function unitSphere(w, h) { const k = w + 'x' + h; return sphereCache[k] || (sphereCache[k] = fromTHREE(new T.SphereGeometry(1, w, h))); }
  const boxRec = fromTHREE(new T.BoxGeometry(1, 1, 1));
  const cylCache = {};
  function unitCyl(seg) { return cylCache[seg] || (cylCache[seg] = fromTHREE(new T.CylinderGeometry(0.5, 0.5, 1, seg))); }
  const torusCache = {};
  function torus(r, tube, rs, ts, arc) { return fromTHREE(new T.TorusGeometry(r, tube, rs, ts, arc === undefined ? PI * 2 : arc)); }
  FA.shapes = { MX, unitSphere, boxRec, unitCyl, torus };

  /* ---------- scaled anatomy tables for this look ---------- */
  function bodyTables(ctx) {
    const b = ctx.look.body, f = b.frame === 'f';
    const build = b.build, bust = b.bust, hips = b.hips, sh = b.shoulders;
    const kx = lerp(0.88, 1.2, build), kz = lerp(0.9, 1.16, build);
    const hipX = lerp(0.9, 1.16, hips), hipZ = lerp(0.94, 1.12, hips);
    const bustAmt = f ? 0.4 + bust * 1.2 : bust * 0.8;
    const sm = (a, b2, y) => { const t = clamp((y - a) / (b2 - a), 0, 1); return t * t * (3 - 2 * t); };
    const pel = (f ? TAB.PELVIS_F : TAB.PELVIS_M).map(r => [r[0], r[1] * kx * hipX, r[2] * kz * hipZ, r[3] || 0, 0]);
    const tor = (f ? TAB.TORSO_F : TAB.TORSO_M).map(r => {
      const y = r[0], low = 1 - sm(0.88, 1.12, y), high = sm(1.2, 1.38, y);
      const bell = Math.exp(-Math.pow((y - 1.27) / 0.07, 2));
      let rx = r[1] * kx * lerp(1, hipX, low * 0.8) * lerp(1, lerp(0.92, 1.12, sh), high);
      let rz = r[2] * kz * lerp(1, hipZ, low * 0.8) + 0.02 * bustAmt * bell;
      return [y, rx, rz, (r[3] || 0) + 0.018 * bustAmt * bell, 0];
    });
    const limbK = lerp(0.9, 1.14, build);
    const armK = (f ? 0.92 : 1.08) * limbK, legK = (f ? 1.06 : 1.1) * lerp(0.92, 1.1, build);
    return {
      pelvis: pel, torso: tor, neck: TAB.NECK.map(r => [r[0], r[1], r[2], r[3], 0]),
      thigh: mulR(TAB.THIGH, legK), shin: mulR(TAB.SHIN, legK), uparm: mulR(TAB.UPARM, armK), forearm: mulR(TAB.FOREARM, armK),
      armK, legK, shX: (f ? 0.162 : 0.188) * lerp(0.94, 1.1, sh), legX: PIV.legX * lerp(0.95, 1.08, hips)
    };
  }

  /* ---------- head ---------- */
  const FACE_SHAPES = [
    { }, { rxk: 1.08, ryk: 0.96, jaw: 0.12, jawPow: 1.2 }, { rxk: 1.04, jaw: 0.08, jawPow: 0.9, chin: 0.05 },
    { rxk: 0.98, jaw: 0.36, jawPow: 1.7, chin: 0.0 }, { rxk: 0.95, ryk: 1.08, jaw: 0.22 }, { rxk: 1.02, jaw: 0.14, jawPow: 1.1 }
  ];
  const EYE_SETS = [{ size: 1, ex: 0.034, slant: 0.08 }, { size: 1.18, ex: 0.034, slant: 0.02 }, { size: 0.86, ex: 0.033, slant: 0.1 }, { size: 1, ex: 0.039, slant: 0.06 }, { size: 1, ex: 0.030, slant: 0.1 }, { size: 0.95, ex: 0.034, slant: -0.03 }];
  const BROW_SETS = [{ n: 4, th: 1.0, arch: 0.15, gap: 0.022 }, { n: 4, th: 1.6, arch: 0.1, gap: 0.021 }, { n: 4, th: 0.65, arch: 0.3, gap: 0.025 }, { n: 4, th: 1.1, arch: 0.0, gap: 0.022 }, { n: 4, th: 1.4, arch: 0.35, gap: 0.02 }];
  const NOSE_SETS = [{ w: 1, h: 1, tip: 1 }, { w: 1.3, h: 1, tip: 1.1 }, { w: 0.8, h: 1.05, tip: 0.9 }, { w: 0.9, h: 0.8, tip: 1.15 }, { w: 1.2, h: 1.2, tip: 1.2 }];
  const LIP_SETS = [{ w: 1, full: 1 }, { w: 1.05, full: 1.45 }, { w: 0.95, full: 0.7 }, { w: 1.2, full: 1.1 }, { w: 0.95, full: 1.15 }];
  const hl = (z) => 0.22 + 0.33 * z; // approx hairline height by front/back

  function headParams(look) {
    const f = look.body.frame === 'f', fc = look.face;
    const P = f ? { rx: 0.078, ry: 0.111, rz: 0.098, cy: 0.111, jaw: 0.17, jawPow: 1.5, chin: 0.02 } : { rx: 0.084, ry: 0.115, rz: 0.102, cy: 0.115, jaw: 0.14, jawPow: 1.4, chin: 0.03 };
    const sh = FACE_SHAPES[fc.shape] || {};
    if (sh.rxk) P.rx *= sh.rxk; if (sh.ryk) { P.ry *= sh.ryk; P.cy *= sh.ryk; }
    ['jaw', 'jawPow', 'chin'].forEach(k => { if (sh[k] !== undefined) P[k] = sh[k]; });
    return P;
  }

  function makeHeadGeo(P, seg) {
    const geo = new T.SphereGeometry(1, seg[0], seg[1]); geo.rotateY(-PI / 2);
    const pos = geo.attributes.position, unit = new Float32Array(pos.array);
    for (let i = 0; i < pos.count; i++) {
      let x = unit[i * 3], y = unit[i * 3 + 1], z = unit[i * 3 + 2];
      const t = clamp((0.12 - y) / 1.12, 0, 1);
      x *= 1 - P.jaw * Math.pow(t, P.jawPow);
      z *= 1 - 0.12 * Math.pow(t, 1.5) * (z > 0 ? 1 : 0.5);
      if (y > 0.25 && z > 0) z *= 1 + 0.035 * (y - 0.25);
      if (z < 0) z *= 1.05;
      if (y < -0.35 && z > 0) z += P.chin * Math.pow((-0.35 - y) / 0.65, 1.5) * 0.4;
      pos.setXYZ(i, x * P.rx, y * P.ry + P.cy, z * P.rz);
    }
    geo.computeVertexNormals();
    return { geo, unit };
  }
  /* a "shell" = the part of the head surface selected by test(ux,uy,uz) pushed outwards by k. Used for hair caps, hats, beards. */
  function shell(head, test, k, patUv, strict) {
    const { geo, unit, P } = head, p = geo.attributes.position, idx = geo.index.array, np = new Float32Array(p.count * 3), out = [];
    for (let i = 0; i < p.count; i++) { np[i * 3] = p.getX(i) * k; np[i * 3 + 1] = P.cy + (p.getY(i) - P.cy) * k; np[i * 3 + 2] = p.getZ(i) * k; }
    for (let t = 0; t < idx.length; t += 3) {
      const a = idx[t], b = idx[t + 1], c = idx[t + 2];
      const ux = (unit[a * 3] + unit[b * 3] + unit[c * 3]) / 3, uy = (unit[a * 3 + 1] + unit[b * 3 + 1] + unit[c * 3 + 1]) / 3, uz = (unit[a * 3 + 2] + unit[b * 3 + 2] + unit[c * 3 + 2]) / 3;
      if (strict ? (test(unit[a * 3], unit[a * 3 + 1], unit[a * 3 + 2]) && test(unit[b * 3], unit[b * 3 + 1], unit[b * 3 + 2]) && test(unit[c * 3], unit[c * 3 + 1], unit[c * 3 + 2])) : test(ux, uy, uz)) out.push(a, b, c);
    }
    const tg = new T.BufferGeometry(); tg.setAttribute('position', new T.BufferAttribute(np, 3)); tg.setIndex(out); tg.computeVertexNormals();
    const pu = new Float32Array(p.count * 2);
    for (let i = 0; i < p.count; i++) { const ux = unit[i * 3], uy = unit[i * 3 + 1], uz = unit[i * 3 + 2]; pu[i * 2] = (Math.atan2(ux, uz) / (2 * PI) + 0.5) * (patUv || 16); pu[i * 2 + 1] = uy * 6; }
    return { p: np, n: new Float32Array(tg.attributes.normal.array), u: new Float32Array(p.count * 2), pu, i: out };
  }

  /* skin tint: soft blush on cheeks, slightly redder nose/ears/lips area handled by features */
  function skinTint(base, makeup, blushRGB, headMatrix) {
    const inv = new T.Matrix4().copy(headMatrix).invert(), v = new T.Vector3();
    return (x, y, z) => {
      v.set(x, y, z).applyMatrix4(inv);
      if (v.z < 0.02) return null;
      let k = 0;
      for (const sd of [-1, 1]) { const dx = v.x - sd * 0.043, dy = v.y - (ctx_cy - 0.036); k = Math.max(k, Math.exp(-(dx * dx + dy * dy) / 0.00045)); }
      if (blushRGB) return mix3(base, blushRGB, 0.55 * k);
      return mix3(base, mul3(base, 0.93), 0.0);
    };
  }
  let ctx_cy = 0.112;

  function buildHead(ctx) {
    const { acc, look, L } = ctx, f = look.body.frame === 'f', fc = look.face;
    const P = headParams(look); ctx_cy = P.cy;
    const Hm = MX(PIV.head[0], PIV.head[1], PIV.head[2], 0, 0, 0, 1.08, 1.08, 1.08);
    const { geo, unit } = makeHeadGeo(P, L.head);
    const head = { geo, unit, P, Hm };
    ctx.head = head;
    const skin = ctx.skin, O = FA.OPTIONS.palettes;
    const mk = look.makeup || {};
    const blush = mk.blush != null ? FA.util.hexRGB(O.blush[mk.blush]) : null;
    const rec = fromTHREE(geo), hp = geo.attributes.position;
    for (let i = 0; i < hp.count; i++) { const front = hp.getZ(i) > 0.012; rec.pu[i * 2] = front ? hp.getX(i) : 9; rec.pu[i * 2 + 1] = front ? hp.getY(i) - P.cy : 9; }
    acc.add(rec, { bone: FA.BI.head, color: skin, pat: PAT.face, c2: skin, m: Hm, ao: 0.1, tint: skinTint(skin, mk, blush, Hm), jt: [1.5, FA.BI.spine, 0.05, 1] });
    // ray cast against the head to put features exactly on the surface
    const tmp = new T.Mesh(geo, new T.MeshBasicMaterial()); tmp.updateMatrixWorld(true);
    const ray = new T.Raycaster(), o = new T.Vector3(), d = new T.Vector3(0, 0, -1);
    function surf(x, y) { o.set(x, y, 0.4); ray.set(o, d); const h = ray.intersectObject(tmp); if (h.length) return { z: h[0].point.z, n: h[0].face.normal.clone() }; return { z: 0.08, n: new T.Vector3(0, 0, 1) }; }
    head.surf = surf;
    const at = (x, y, off, rx, ry, rz, sx, sy, sz) => { // matrix placing a unit shape on the face surface
      const s = surf(x, y), q = new T.Quaternion().setFromUnitVectors(new T.Vector3(0, 0, 1), s.n), e = new T.Euler().setFromQuaternion(q);
      return Hm.clone().multiply(new T.Matrix4().compose(new T.Vector3(x, y, s.z + off), new T.Quaternion().setFromEuler(new T.Euler(e.x + (rx || 0), e.y + (ry || 0), e.z + (rz || 0))), new T.Vector3(sx, sy, sz)));
    };
    head.at = at;
    const hb = FA.BI.head, S = (w, h) => unitSphere(w, h), cy = P.cy;
    const es = EYE_SETS[fc.eyes] || EYE_SETS[0], eyeY = cy + 0.006, ex = (f ? 0.032 : 0.035) * (es.ex / 0.034);
    head.eyeX = ex; head.eyeY = eyeY; head.es = es;
    // ---- the face itself is PAINTED in the fragment shader (eyes, brows, lips, nostrils): smooth, cheap, no extra triangles ----
    const bs = BROW_SETS[fc.brows] || BROW_SETS[0], ns = NOSE_SETS[fc.nose] || NOSE_SETS[0], ls = LIP_SETS[fc.lips] || LIP_SETS[0];
    const irisC = FA.util.hexRGB(O.eye[fc.eyeColor] || O.eye[0]), browC = mix3(FA.util.hexRGB(O.hair[look.hair.color] || O.hair[0]), [0.02, 0.015, 0.015], 0.35);
    let lipC = mix3(skin, f ? [0.45, 0.14, 0.15] : [0.32, 0.12, 0.11], f ? 0.34 : 0.26); if (mk.lips != null) lipC = mix3(FA.util.hexRGB(O.lip[mk.lips]), skin, 0.2);
    const shC = mk.shadow != null ? FA.util.hexRGB(O.shadow[mk.shadow]) : skin;
    const r = 0.0145 * es.size, lash = mk.lashes ? 2 : (mk.liner ? 1 : (f ? 1 : 0));
    ctx.faceU = [
      [ex, eyeY - cy, r * 1.0, r * 0.62], [es.slant * 0.9, r * 0.5, r * 0.22, lash], [irisC[0], irisC[1], irisC[2], eyeY - cy + bs.gap * 0.62 + 0.0035 + 0.004],
      [browC[0], browC[1], browC[2], bs.th], [lipC[0], lipC[1], lipC[2], ls.full], [shC[0], shC[1], shC[2], mk.shadow != null ? 0.7 : 0],
      [bs.arch + 0.2, 0, (f ? 0.027 : 0.029) * ls.w, -0.071], [-0.044, ns.w, f ? 1 : 0, 0], [skin[0], skin[1], skin[2], 0]
    ];
    // geometry kept for form: nose, ears
    const ny = cy - 0.044;
    if (L.nose >= 1) acc.add(S(8, 6), { bone: hb, color: skin, pat: PAT.skin, ao: 0.08, m: at(0, ny, 0.003, 0, 0, 0, 0.0108 * ns.w * ns.tip, 0.0102 * ns.tip, 0.0112 * ns.tip) });
    if (L.nose >= 2) acc.add(S(8, 6), { bone: hb, color: skin, pat: PAT.skin, ao: 0.08, m: at(0, cy - 0.027, -0.002, 0, 0, 0, 0.0062 * ns.w, 0.011 * ns.h, 0.0075) });
    if (L.nose >= 3) for (const sd of [-1, 1]) acc.add(S(6, 4), { bone: hb, color: skin, pat: PAT.skin, ao: 0.08, m: at(sd * 0.0125 * ns.w, ny - 0.002, -0.0005, 0, 0, 0, 0.0066 * ns.w, 0.0064, 0.006) });
    // soft lip volume (skin-coloured, painted lip colour shows through the paint on the head; this only adds a little relief)
    if (L.lids) { acc.add(S(8, 5), { bone: hb, color: lipC, pat: 0, ao: 0.05, m: at(0, cy - 0.0715, 0.0, 0, 0, 0, (f ? 0.0205 : 0.0225) * ls.w, 0.0034 * ls.full, 0.0048) }); }
    // ears
    if (L.ears) for (const sd of [-1, 1]) acc.add(S(8, 6), { bone: hb, color: skin, pat: PAT.skin, ao: 0.08, m: Hm.clone().multiply(MX(sd * P.rx * 0.985, P.cy - 0.004, -0.012, 0, 0, sd * 0.1, 0.008, 0.028, 0.018)) });
  }

  /* ---------- hands ---------- */
  function buildHands(ctx) {
    const { acc, tabs, skin, L, f, look } = ctx, k = f ? 0.9 : 1.0, nailC = look.nails != null ? FA.util.hexRGB(FA.OPTIONS.palettes.nail[look.nails]) : null;
    for (const sd of [-1, 1]) {
      const key = sd < 0 ? 'L' : 'R', bone = FA.BI['hand' + key], HP = MX(sd * tabs.shX, PIV.hand, 0), jt = [PIV.hand, FA.BI['fore' + key], 0.04, -1];
      const o = (extra) => Object.assign({ bone, color: skin, pat: PAT.skin, ao: 0.1, jt }, extra);
      const palmT = [[0.01, 0.014, 0.034 * k], [-0.04, 0.016, 0.040 * k], [-0.085, 0.014, 0.038 * k], [-0.095, 0.011, 0.032 * k]];
      if (L.hands === 'ball') { acc.add(unitSphere(6, 4), o({ m: HP.clone().multiply(MX(0, -0.06, 0.004, 0, 0, 0, 0.03, 0.065, 0.036)) })); continue; }
      acc.add(loft(smooth(palmT, L.hands === 'full' ? 2 : 1), { N: L.hands === 'full' ? 10 : 8, caps: 'both' }), o({ m: HP }));
      const curl = 0.38;
      if (L.hands === 'mitten') {
        const fm = HP.clone().multiply(MX(0, -0.092, 0.0, 0, 0, -sd * curl * 0.7));
        acc.add(loft([[0, 0.027, 0.0125], [-0.04, 0.026, 0.012], [-0.075, 0.021, 0.0105], [-0.092, 0.012, 0.007]], { N: 7, caps: 'bottom' }), o({ m: fm }));
        acc.add(unitSphere(6, 4), o({ m: HP.clone().multiply(MX(sd * 0.002, -0.05, 0.035 * k, -0.5, 0, sd * 0.35, 0.011 * k, 0.034 * k, 0.011 * k)) }));
        continue;
      }
      const fz = [-0.0285, -0.0095, 0.0095, 0.0285], fl = [0.058, 0.07, 0.066, 0.052];
      fz.forEach((z, i) => {
        const Lf = fl[i] * k, r = 0.0078 * k, m0 = HP.clone().multiply(MX(0, -0.09, z * k, 0, 0, -sd * curl));
        acc.add(loft([[0, r, r * 0.95], [-Lf * 0.5, r * 0.9, r * 0.88], [-Lf * 0.95, r * 0.7, r * 0.7], [-Lf, r * 0.3, r * 0.3]], { N: 6, caps: 'bottom' }), o({ m: m0 }));
        const m1 = m0.clone().multiply(MX(0, -Lf, 0, 0, 0, -sd * curl * 0.7));
        acc.add(loft([[0, r * 0.72, r * 0.72], [-Lf * 0.4, r * 0.6, r * 0.58], [-Lf * 0.55, r * 0.2, r * 0.2]], { N: 6, caps: 'bottom' }), o({ m: m1 }));
        if (nailC) acc.add(unitSphere(6, 4), { bone, color: nailC, pat: 0, ao: 0, jt, m: m1.clone().multiply(MX(0, -Lf * 0.38, r * 0.5, 0.2, 0, 0, r * 0.62, r * 0.9, r * 0.2)) });
      });
      const th = HP.clone().multiply(MX(sd * 0.002, -0.02, 0.034 * k, -0.5, 0, sd * 0.35));
      acc.add(loft([[0, 0.012 * k, 0.012 * k], [-0.03 * k, 0.011 * k, 0.011 * k], [-0.058 * k, 0.007 * k, 0.007 * k], [-0.064 * k, 0.003, 0.003]], { N: 6, caps: 'bottom' }), o({ m: th }));
      if (nailC) acc.add(unitSphere(6, 4), { bone, color: nailC, pat: 0, ao: 0, jt, m: th.clone().multiply(MX(0, -0.056 * k, 0.005, 0.1, 0, 0, 0.007, 0.008, 0.002)) });
    }
  }

  /* ---------- shoes ---------- */
  const SHOES = {
    sneakers: { upper: 'full', sole: 1.0, color: 0 }, loafers: { upper: 'low', sole: 0.5 }, boots: { upper: 'boot', sole: 0.9 },
    sandals: { upper: 'sandal', sole: 0.9 }, heels: { upper: 'heel', sole: 0.4 }
  };
  function buildShoes(ctx) {
    const { acc, tabs, skin, L, look } = ctx, sh = look.wear.shoes; if (!sh) return;
    const id = sh.id, spec = SHOES[id] || SHOES.sneakers, O = FA.OPTIONS.palettes.cloth;
    const upC = FA.util.hexRGB(O[sh.c % O.length]), soleC = id === 'sneakers' ? mix3(FA.util.hexRGB(O[sh.c2 != null ? sh.c2 % O.length : 0]), [1, 1, 1], 0.2) : mul3(upC, 0.45);
    for (const sd of [-1, 1]) {
      const key = sd < 0 ? 'L' : 'R', bone = FA.BI['foot' + key], jt = [PIV.foot, FA.BI['shin' + key], 0.05, -1];
      let base = MX(sd * tabs.legX, PIV.foot, 0);
      if (id === 'heels') base = base.clone().multiply(MX(0, 0, 0, 0.5, 0, 0)); // toes pitched down
      const upT = TAB.SHOE_UP.map(a => [a[0], a[1], a[2], 0.058 - a[2]]), soT = TAB.SHOE_SOLE.map(a => [a[0], a[1], a[2], 0.08 - a[2]]);
      const place = base.clone().multiply(MX(0, 0, -0.045, PI / 2, 0, 0));
      const n = L.limbN + 2;
      if (spec.upper === 'sandal') {
        acc.add(loft(smooth(upT.map(r => [r[0], r[1] * 0.97, r[2] * 0.62, r[3] - 0.012]), L.sub >= 2 ? 2 : 1), { N: n }), { bone, color: skin, pat: PAT.skin, ao: 0.1, jt, m: place });
        acc.add(loft(smooth(upT.filter(r => r[0] > 0.06 && r[0] < 0.135).map(r => [r[0], r[1] * 1.03, r[2] * 0.66, r[3] - 0.012]), 2), { N: n, caps: 'none' }), { bone, color: upC, pat: 0, jt, m: place });
      } else if (spec.upper === 'low' || spec.upper === 'heel') {
        acc.add(loft(smooth(upT.map(r => [r[0], r[1] * 0.99, r[2] * (spec.upper === 'heel' ? 0.82 : 0.8), r[3] - 0.004]), L.sub >= 2 ? 2 : 1), { N: n }), { bone, color: upC, pat: 0, ao: 0.1, jt, m: place });
        acc.add(loft(smooth(upT.filter(r => r[0] < 0.1).map(r => [r[0], r[1] * 0.92, r[2] * 0.52, r[3] + 0.012]), 1), { N: n, caps: 'top' }), { bone, color: skin, pat: PAT.skin, jt, m: place }); // foot top shows
      } else {
        const tall = spec.upper === 'boot';
        acc.add(loft(smooth(upT, L.sub >= 2 ? 2 : 1), { N: n }), { bone, color: upC, pat: 0, ao: 0.1, jt, m: place });
        if (tall) acc.add(loft([[0.0, 0.0001, 0.0001, 0], [0.0, 0.0001, 0.0001, 0]], { N: 3, caps: 'none' }), { bone, color: upC, pat: 0, jt, m: place });
      }
      acc.add(loft(smooth(soT, L.sub >= 2 ? 2 : 1), { N: n }), { bone, color: soleC, pat: 0, ao: 0.2, jt, m: place.clone().multiply(MX(0, 0, 0, 0, 0, 0, 1, 1, spec.sole)) });
      if (id === 'heels') acc.add(unitCyl(6), { bone, color: upC, pat: 0, jt, m: base.clone().multiply(MX(0, -0.05, -0.04, 0, 0, 0, 0.012, 0.09, 0.012)) });
      if (id === 'boots') acc.add(loft(smooth([[0.14, 0.0475, 0.056], [0.22, 0.046, 0.056], [0.34, 0.052, 0.062], [0.38, 0.056, 0.064]], 1), { N: n, caps: 'top' }), { bone: FA.BI['shin' + key], color: upC, pat: 0, jt: [PIV.shin, FA.BI['thigh' + key], 0.05, -1], m: MX(sd * tabs.legX, 0, 0) });
    }
  }

  /* ---------- skin: only the parts clothes do not cover ---------- */
  function buildSkin(ctx) {
    const { acc, tabs, skin, L, look } = ctx, cv = ctx.cover, sub = L.sub, BI = FA.BI;
    const so = (bone, jt) => ({ bone, color: skin, pat: PAT.skin, ao: 0.1, jt });
    // neck + upper chest sliver
    acc.add(loft(smooth(tabs.neck, sub), { N: L.bodyN * 0.7 | 0 }), so(BI.spine));
    acc.add(loft(smooth(clip(tabs.torso, cv.torsoSkinFrom, 1.53), sub), { N: L.bodyN, caps: 'top' }), so(BI.spine, [1.09, BI.hips, 0.08, 1]));
    if (cv.pelvisSkin) acc.add(loft(smooth(clip(tabs.pelvis, 0.8, cv.pelvisTop || 1.075), sub), { N: L.bodyN }), so(BI.hips));
    (cv.bands || []).forEach(b => acc.add(loft(smooth(clip(tabs.torso, b[0], b[1]), sub), { N: L.bodyN, caps: 'both' }), so(BI.spine, [1.09, BI.hips, 0.08, 1])));
    for (const sd of [-1, 1]) {
      const key = sd < 0 ? 'L' : 'R', X = (m) => MX(sd * tabs.legX, 0, 0).multiply(m || new T.Matrix4());
      // legs
      if (cv.legSkinTo > 0.1) {
        const thT = clip(tabs.thigh, 0.5, cv.legSkinTo > 0.92 ? 0.92 : cv.legSkinTo + 0.02), shinT = cv.legSkinTo > 0.5 ? clip(tabs.shin, 0.08, 0.5) : clip(tabs.shin, 0.08, cv.legSkinTo + 0.02);
        if (cv.legSkinTo > 0.5) acc.add(loft(smooth(clip(tabs.thigh, Math.max(0.5, cv.legSkinTo > 0.92 ? 0.5 : 0.5), Math.min(0.92, cv.legSkinTo + 0.02)), sub), { N: L.limbN, caps: 'both' }), Object.assign(so(BI['thigh' + key], [PIV.thigh, BI.hips, 0.05, -1]), { m: X() }));
        acc.add(loft(smooth(shinT, sub), { N: L.limbN }), Object.assign(so(BI['shin' + key], [PIV.shin, BI['thigh' + key], 0.05, -1]), { m: X() }));
        if (cv.legSkinTo > 0.5) acc.add(unitSphere(8, 6), Object.assign(so(BI['shin' + key], [PIV.shin, BI['thigh' + key], 0.05, -1]), { m: X(MX(0, 0.5, 0, 0, 0, 0, 0.056 * tabs.legK, 0.056 * tabs.legK, 0.056 * tabs.legK)) }));
      } else {
        acc.add(loft(smooth(clip(tabs.shin, 0.08, 0.16), 1), { N: Math.max(6, L.limbN - 2) }), Object.assign(so(BI['shin' + key], [PIV.shin, BI['thigh' + key], 0.05, -1]), { m: X() }));
      }
      // arms
      const AX = (m) => MX(sd * tabs.shX, 0, 0).multiply(m || new T.Matrix4());
      const jU = [PIV.arm, BI.spine, 0.05, -1], jF = [PIV.fore, BI['arm' + key], 0.05, -1];
      acc.add(unitSphere(10, 7), Object.assign(so(BI['arm' + key], jU), { m: AX(MX(0, PIV.arm, 0, 0, 0, 0, 0.054 * tabs.armK, 0.052 * tabs.armK, 0.054 * tabs.armK)) }));
      if (cv.upperArmSkinTo > 1.09) acc.add(loft(smooth(clip(tabs.uparm, 1.08, Math.min(1.47, cv.upperArmSkinTo + 0.005)), sub), { N: L.limbN }), Object.assign(so(BI['arm' + key], jU), { m: AX() }));
      acc.add(unitSphere(8, 6), Object.assign(so(BI['fore' + key], jF), { m: AX(MX(0, PIV.fore, 0, 0, 0, 0, 0.04 * tabs.armK, 0.04 * tabs.armK, 0.04 * tabs.armK)) }));
      if (cv.foreSkinTo > 0.86) acc.add(loft(smooth(clip(tabs.forearm, 0.84, Math.min(1.1, cv.foreSkinTo + 0.005)), sub), { N: L.limbN }), Object.assign(so(BI['fore' + key], jF), { m: AX() }));
      else acc.add(loft(smooth(clip(tabs.forearm, 0.84, 0.9), 1), { N: Math.max(6, L.limbN - 2) }), Object.assign(so(BI['fore' + key], jF), { m: AX() }));
    }
  }

  FA._body = { bodyTables, buildHead, buildHands, buildShoes, buildSkin, shell, headParams, SHOES, hl };
})(typeof window !== 'undefined' ? window : globalThis);
