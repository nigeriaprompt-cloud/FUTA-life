/* ==========================================================================
   FUTA Avatar — core: math, body-section tables, loft, geometry accumulator, material
   Classic script (no build step). Needs three.js r128 loaded first.
   Everything attaches to window.FutaAvatar. See docs/AVATAR_SPEC.md.

   KEY IDEAS (so it loads fast on phones):
   - A character is baked into ONE BufferGeometry (one draw call) skinned to a 15-bone skeleton.
   - Colours are per-vertex. Patterns (Ankara, plaid, stripes…) are drawn in the fragment shader,
     so there are NO texture downloads and no atlas.
   - Geometry is cached per "look" and shared by every instance; each instance only owns bones.
   ========================================================================== */
(function (global) {
  'use strict';
  const T = global.THREE;
  if (!T) throw new Error('FutaAvatar needs THREE (r128) loaded first');
  const FA = (global.FutaAvatar = global.FutaAvatar || {});
  const PI = Math.PI;

  /* ------------------------------------------------------------------ small utils */
  const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
  const lerp = (a, b, t) => a + (b - a) * t;
  function hexRGB(hex) { const c = new T.Color(hex); c.convertSRGBToLinear(); return [c.r, c.g, c.b]; }
  function mix3(a, b, k) { return [lerp(a[0], b[0], k), lerp(a[1], b[1], k), lerp(a[2], b[2], k)]; }
  function mul3(a, k) { return [a[0] * k, a[1] * k, a[2] * k]; }
  function hashStr(s) { let h = 2166136261; s = String(s); for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; }
  function rng(seed) { // mulberry32, deterministic
    let a = (typeof seed === 'string' ? hashStr(seed) : seed >>> 0) || 1;
    return function () { a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  }
  FA.util = { clamp, lerp, hexRGB, mix3, mul3, hashStr, rng };

  /* ------------------------------------------------------------------ bones (fixed order = skinIndex values) */
  const BONES = ['hips', 'spine', 'head', 'armL', 'foreL', 'handL', 'armR', 'foreR', 'handR', 'thighL', 'shinL', 'footL', 'thighR', 'shinR', 'footR'];
  const BI = {}; BONES.forEach((n, i) => { BI[n] = i; });
  FA.BONES = BONES; FA.BI = BI;

  /* ------------------------------------------------------------------ cross-section tables
     rows are [y, rx(half width), rz(half depth), cz(forward offset), cx(side offset)] in metres,
     authored for a 1.78 m body, avatar faces +z, origin at the floor between the feet. */
  const TAB = {
    PELVIS_M: [[0.80, 0.150, 0.108, 0], [0.86, 0.172, 0.114, -0.008], [0.93, 0.176, 0.116, -0.012], [1.00, 0.168, 0.108, -0.006], [1.06, 0.158, 0.100, 0]],
    PELVIS_F: [[0.80, 0.158, 0.108, 0], [0.86, 0.184, 0.120, -0.012], [0.93, 0.192, 0.126, -0.016], [1.00, 0.178, 0.112, -0.008], [1.06, 0.150, 0.098, 0]],
    TORSO_M: [[0.88, 0.166, 0.108, -0.010], [0.96, 0.160, 0.103, -0.004], [1.04, 0.155, 0.100, 0], [1.09, 0.148, 0.096, 0], [1.16, 0.153, 0.100, 0.004], [1.24, 0.178, 0.112, 0.010], [1.32, 0.196, 0.113, 0.012], [1.39, 0.192, 0.104, 0.004], [1.44, 0.168, 0.088, -0.004], [1.485, 0.090, 0.072, -0.008], [1.52, 0.050, 0.052, -0.004]],
    TORSO_F: [[0.88, 0.170, 0.112, -0.012], [0.96, 0.158, 0.100, -0.004], [1.04, 0.150, 0.098, 0], [1.09, 0.126, 0.090, 0], [1.15, 0.130, 0.092, 0.002], [1.22, 0.150, 0.106, 0.012], [1.29, 0.172, 0.112, 0.016], [1.36, 0.166, 0.098, 0.004], [1.42, 0.148, 0.082, -0.004], [1.475, 0.082, 0.066, -0.008], [1.51, 0.050, 0.052, -0.004]],
    NECK: [[1.44, 0.064, 0.064, 0.002], [1.50, 0.050, 0.054, 0.004], [1.55, 0.047, 0.050, 0.010], [1.585, 0.046, 0.049, 0.012]],
    THIGH: [[0.92, 0.080, 0.090, 0], [0.82, 0.092, 0.100, 0.002], [0.68, 0.082, 0.088, 0.004], [0.56, 0.064, 0.066, 0.004], [0.50, 0.052, 0.056, 0]],
    SHIN: [[0.50, 0.052, 0.055, 0], [0.44, 0.052, 0.058, -0.010], [0.34, 0.047, 0.058, -0.014], [0.22, 0.036, 0.042, -0.004], [0.12, 0.029, 0.032, 0], [0.08, 0.028, 0.030, 0]],
    UPARM: [[1.462, 0.022, 0.024, 0], [1.446, 0.042, 0.045, 0], [1.41, 0.05, 0.052, 0.001], [1.36, 0.054, 0.056, 0.002], [1.26, 0.050, 0.052, 0.004], [1.14, 0.040, 0.042, 0.004], [1.08, 0.037, 0.040, 0]],
    FOREARM: [[1.10, 0.039, 0.041, 0], [1.04, 0.041, 0.043, 0], [0.96, 0.034, 0.035, 0], [0.88, 0.027, 0.024, 0], [0.84, 0.026, 0.020, 0]],
    SHOE_UP: [[-0.035, 0.030, 0.034], [0.0, 0.038, 0.044], [0.06, 0.044, 0.054], [0.13, 0.047, 0.050], [0.20, 0.045, 0.040], [0.255, 0.034, 0.030], [0.28, 0.018, 0.018]],
    SHOE_SOLE: [[-0.04, 0.033, 0.011], [0.0, 0.040, 0.012], [0.13, 0.048, 0.012], [0.22, 0.047, 0.012], [0.27, 0.035, 0.011], [0.285, 0.020, 0.010]]
  };
  // joint pivots in avatar-root space (rest pose). Bone local offsets are derived from these.
  const PIV = {
    hips: [0, 0.925, 0], spine: [0, 1.09, 0], head: [0, 1.555, 0.006],
    thigh: 0.90, shin: 0.50, foot: 0.08, legX: 0.088,
    arm: 1.385, fore: 1.08, hand: 0.82
  };
  FA.TAB = TAB; FA.PIV = PIV;

  /* ------------------------------------------------------------------ table helpers */
  function cr(p0, p1, p2, p3, t) { return 0.5 * ((2 * p1) + (-p0 + p2) * t + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t * t + (-p0 + 3 * p1 - 3 * p2 + p3) * t * t * t); }
  const norm5 = (a) => [a[0], a[1], a[2], a[3] || 0, a[4] || 0];
  function smooth(tab, sub) { // Catmull-Rom: `sub` extra rows between each pair
    const s = tab.map(norm5), out = [];
    if (sub <= 1) return s;
    for (let i = 0; i < s.length - 1; i++) {
      const a = s[Math.max(0, i - 1)], b = s[i], c = s[i + 1], d = s[Math.min(s.length - 1, i + 2)];
      for (let k = 0; k < sub; k++) { const t = k / sub, row = []; for (let m = 0; m < 5; m++) row.push(cr(a[m], b[m], c[m], d[m], t)); out.push(row); }
    }
    out.push(s[s.length - 1].slice());
    return out;
  }
  const grow = (s, d) => s.map(a => [a[0], a[1] + d, a[2] + d, a[3] || 0, a[4] || 0]);
  const mulR = (s, kx, kz) => s.map(a => [a[0], a[1] * kx, a[2] * (kz === undefined ? kx : kz), a[3] || 0, a[4] || 0]);
  const shiftY = (s, dy) => s.map(a => [a[0] + dy, a[1], a[2], a[3] || 0, a[4] || 0]);
  function sortY(s) { return s.slice().sort((a, b) => a[0] - b[0]); }
  function sample(tab, y) { // linear interpolation of any table at height y
    const s = sortY(tab);
    if (y <= s[0][0]) return s[0].slice(); if (y >= s[s.length - 1][0]) return s[s.length - 1].slice();
    for (let i = 0; i < s.length - 1; i++) if (s[i][0] <= y && s[i + 1][0] >= y) {
      const t = (y - s[i][0]) / ((s[i + 1][0] - s[i][0]) || 1), r = [y];
      for (let m = 1; m < 5; m++) r.push(lerp(s[i][m] || 0, s[i + 1][m] || 0, t));
      return r;
    }
    return s[0].slice();
  }
  function clip(tab, lo, hi) { // keep rows in [lo,hi] and add exact interpolated end rows
    const s = sortY(tab.map(norm5)); lo = Math.max(lo, s[0][0]); hi = Math.min(hi, s[s.length - 1][0]);
    const out = [sample(s, lo)];
    for (const r of s) if (r[0] > lo + 1e-4 && r[0] < hi - 1e-4) out.push(r);
    out.push(sample(s, hi));
    return out;
  }
  FA.tab = { cr, smooth, grow, mulR, shiftY, sample, clip, sortY, norm5 };

  /* ------------------------------------------------------------------ loft: sweep an ellipse along y
     opt: N (segments around), arc [a0,a1] (open garment), pleat {n,amp}, caps ('both'|'none'|'top'|'bottom'),
          cell (pattern cell size in m; produces pattern uv in `pu`) */
  function loft(secs, opt) {
    opt = opt || {};
    const N = opt.N || 16, caps = opt.caps || 'both', arc = opt.arc, cell = opt.cell || 0.12;
    const s = sortY(secs.map(norm5)), R = s.length, M = N + 1;
    let circ = 0; for (const r of s) circ += 2 * PI * Math.sqrt((r[1] * r[1] + r[2] * r[2]) / 2); circ /= R;
    const K = Math.max(1, Math.round(circ * (arc ? (arc[1] - arc[0]) / (2 * PI) : 1) / cell));
    const side = R * M;
    const p = new Float32Array(side * 3), pu = new Float32Array(side * 2), u = new Float32Array(side * 2), idx = [];
    for (let i = 0; i < R; i++) for (let j = 0; j < M; j++) {
      const a = arc ? arc[0] + (arc[1] - arc[0]) * (j / N) : (j / N) * PI * 2;
      let k = 1; if (opt.pleat) k = 1 + opt.pleat.amp * Math.cos(opt.pleat.n * a) * clamp((0.12 - s[i][0]) / 0.25 + 0.5, 0, 1);
      const o = (i * M + j) * 3;
      p[o] = s[i][4] + s[i][1] * k * Math.sin(a); p[o + 1] = s[i][0]; p[o + 2] = s[i][3] + s[i][2] * k * Math.cos(a);
      pu[(i * M + j) * 2] = (j / N) * K; pu[(i * M + j) * 2 + 1] = s[i][0] / cell;
      u[(i * M + j) * 2] = j / N; u[(i * M + j) * 2 + 1] = i / (R - 1);
    }
    for (let i = 0; i < R - 1; i++) for (let j = 0; j < N; j++) { const A = i * M + j, B = A + 1, C = (i + 1) * M + j, D = C + 1; idx.push(A, B, C, B, D, C); }
    // normals: from a temporary geometry, welded across the seam for closed lofts
    const tg = new T.BufferGeometry(); tg.setAttribute('position', new T.BufferAttribute(p, 3)); tg.setIndex(idx); tg.computeVertexNormals();
    const nrm = tg.attributes.normal.array;
    if (!arc) for (let i = 0; i < R; i++) {
      const a = i * M, b = i * M + N;
      const nx = nrm[a * 3] + nrm[b * 3], ny = nrm[a * 3 + 1] + nrm[b * 3 + 1], nz = nrm[a * 3 + 2] + nrm[b * 3 + 2], l = Math.hypot(nx, ny, nz) || 1;
      nrm[a * 3] = nrm[b * 3] = nx / l; nrm[a * 3 + 1] = nrm[b * 3 + 1] = ny / l; nrm[a * 3 + 2] = nrm[b * 3 + 2] = nz / l;
    }
    tg.dispose();
    const capsWanted = [];
    if (!arc && (caps === 'both' || caps === 'bottom')) capsWanted.push([0, -1]);
    if (!arc && (caps === 'both' || caps === 'top')) capsWanted.push([R - 1, 1]);
    const total = side + capsWanted.length * (M + 1);
    const P = new Float32Array(total * 3), Nn = new Float32Array(total * 3), U = new Float32Array(total * 2), PU = new Float32Array(total * 2);
    P.set(p); Nn.set(nrm); U.set(u); PU.set(pu);
    const I = idx.slice();
    capsWanted.forEach((cap, ci) => {
      const o = side + ci * (M + 1), row = cap[0], ny = cap[1];
      for (let j = 0; j < M; j++) {
        const src = (row * M + j) * 3, dst = (o + j) * 3;
        P[dst] = p[src]; P[dst + 1] = p[src + 1]; P[dst + 2] = p[src + 2]; Nn[dst + 1] = ny;
        PU[(o + j) * 2] = p[src] / cell; PU[(o + j) * 2 + 1] = p[src + 2] / cell;
      }
      const c = (o + M) * 3; P[c] = s[row][4]; P[c + 1] = s[row][0]; P[c + 2] = s[row][3]; Nn[c + 1] = ny;
      PU[(o + M) * 2] = s[row][4] / cell; PU[(o + M) * 2 + 1] = s[row][3] / cell;
      for (let j = 0; j < N; j++) { if (ny < 0) I.push(o + M, o + j + 1, o + j); else I.push(o + M, o + j, o + j + 1); }
    });
    return { p: P, n: Nn, u: U, pu: PU, i: I };
  }

  /* wrap any THREE geometry into the same {p,n,u,pu,i} record */
  function fromTHREE(g, cell) {
    cell = cell || 0.12;
    const pos = g.attributes.position, n = g.attributes.normal, uv = g.attributes.uv, cnt = pos.count;
    const p = new Float32Array(pos.array), nn = n ? new Float32Array(n.array) : new Float32Array(cnt * 3), u = uv ? new Float32Array(uv.array) : new Float32Array(cnt * 2);
    const pu = new Float32Array(cnt * 2); for (let i = 0; i < cnt; i++) { pu[i * 2] = (u[i * 2]) * 4; pu[i * 2 + 1] = (u[i * 2 + 1]) * 4; }
    let I; if (g.index) I = Array.prototype.slice.call(g.index.array); else { I = []; for (let i = 0; i < cnt; i++) I.push(i); }
    return { p, n: nn, u, pu, i: I };
  }
  FA.geo = { loft, fromTHREE };

  /* ------------------------------------------------------------------ accumulator: many parts → one skinned BufferGeometry */
  class Acc {
    constructor() { this.P = []; this.N = []; this.C = []; this.SI = []; this.SW = []; this.PU = []; this.PT = []; this.I = []; this.vc = 0; }
    /* o: { bone, color:[r,g,b] linear, c2, pat (shader pattern id), m: Matrix4, jt:[pivotY, otherBone, len, dir],
            ao (0..0.3 baked underside darkening), tint: (x,y,z)=>[r,g,b] | null } */
    add(g, o) {
      const n = g.p.length / 3, base = this.vc, m = o.m || null, nm = m ? new T.Matrix3().getNormalMatrix(m) : null;
      const v = new T.Vector3(), nv = new T.Vector3(), col = o.color || [1, 1, 1], c2 = o.c2 || col, ao = o.ao === undefined ? 0.16 : o.ao;
      const bone = o.bone, jt = o.jt, pat = o.pat || 0;
      for (let i = 0; i < n; i++) {
        v.set(g.p[i * 3], g.p[i * 3 + 1], g.p[i * 3 + 2]); nv.set(g.n[i * 3], g.n[i * 3 + 1], g.n[i * 3 + 2]);
        if (m) { v.applyMatrix4(m); nv.applyMatrix3(nm).normalize(); }
        this.P.push(v.x, v.y, v.z); this.N.push(nv.x, nv.y, nv.z);
        let c = col; if (o.tint) { const t = o.tint(v.x, v.y, v.z, nv); if (t) c = t; }
        const sh = 1 - ao * (0.5 - 0.5 * nv.y); // underside slightly darker = fake ambient occlusion
        this.C.push(c[0] * sh, c[1] * sh, c[2] * sh);
        let wOther = 0, other = 0;
        if (jt) { const s = jt[3] * (v.y - jt[0]) / jt[2]; wOther = clamp(0.5 - 0.5 * s, 0, 1); other = jt[1]; }
        this.SI.push(bone, other, 0, 0); this.SW.push(1 - wOther, wOther, 0, 0);
        this.PU.push(g.pu ? g.pu[i * 2] : 0, g.pu ? g.pu[i * 2 + 1] : 0);
        this.PT.push(pat, c2[0], c2[1], c2[2]);
      }
      for (let i = 0; i < g.i.length; i++) this.I.push(g.i[i] + base);
      this.vc += n;
    }
    finish() {
      const g = new T.BufferGeometry();
      g.setAttribute('position', new T.BufferAttribute(new Float32Array(this.P), 3));
      g.setAttribute('normal', new T.BufferAttribute(new Float32Array(this.N), 3));
      g.setAttribute('color', new T.BufferAttribute(new Float32Array(this.C), 3));
      g.setAttribute('skinIndex', new T.BufferAttribute(new Uint16Array(this.SI), 4));
      g.setAttribute('skinWeight', new T.BufferAttribute(new Float32Array(this.SW), 4));
      g.setAttribute('aPuv', new T.BufferAttribute(new Float32Array(this.PU), 2));
      g.setAttribute('aPat', new T.BufferAttribute(new Float32Array(this.PT), 4));
      g.setIndex(new T.BufferAttribute(this.vc > 65535 ? new Uint32Array(this.I) : new Uint16Array(this.I), 1));
      g.computeBoundingSphere(); g.computeBoundingBox();
      g.userData.tris = this.I.length / 3; g.userData.verts = this.vc;
      return g;
    }
  }
  FA.Acc = Acc;

  /* ------------------------------------------------------------------ material (patterns in the shader, no textures) */
  const PAT = { flat: 0, fabric: 1, stripes: 2, pinstripe: 3, plaid: 4, dots: 5, ankara_a: 6, ankara_b: 7, kente: 8, floral: 9, denim: 10, knit: 11, cornrows: 12, braid: 13, diagonal: 14, skin: 15, hair: 16, face: 17 };
  FA.PAT = PAT;

  const GLSL_FRAG_FUNCS = `
varying vec2 vPuv; varying vec4 vPat;
float h21(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
vec3 gold = vec3(0.90, 0.55, 0.08);

uniform vec4 uF[9];
float el(vec2 p, vec2 r){ return length(p / r); }
vec3 facePaint(vec2 p, vec3 skin) {
  vec3 col = skin;
  float ex = uF[0].x, ey = uF[0].y, rx = uF[0].z, ry = uF[0].w;
  float slant = uF[1].x, irisR = uF[1].y, pupR = uF[1].z, lash = uF[1].w;
  vec3 irisC = uF[2].rgb; float browY = uF[2].a;
  vec3 browC = uF[3].rgb; float browTh = uF[3].a;
  vec3 lipC = uF[4].rgb; float lipFull = uF[4].a;
  vec3 shC = uF[5].rgb; float shAmt = uF[5].a;
  float arch = uF[6].x, lipW = uF[6].z, mouthY = uF[6].w;
  float noseY = uF[7].x, noseW = uF[7].y;
  float ax = abs(p.x);
  if (ax > 0.075) return col;
  vec2 q = vec2(ax - ex, p.y - ey);
  float cs = cos(slant), sn = sin(slant);
  vec2 qe = vec2(cs * q.x + sn * q.y, -sn * q.x + cs * q.y);
  // eye shadow + lid crease
  float m = 1.0 - smoothstep(0.5, 1.0, el(qe - vec2(0.0, ry * 1.5), vec2(rx * 1.4, ry * 2.1)));
  col = mix(col, shC, m * shAmt * step(0.0, qe.y));
  float cr = el(qe - vec2(0.0, ry * 0.8), vec2(rx * 1.2, ry * 2.3));
  col *= 1.0 - 0.07 * smoothstep(0.08, 0.0, abs(cr - 1.0)) * step(ry * 0.35, qe.y);
  // eyeball
  float xr = clamp(qe.x / rx, -1.0, 1.0);
  float d = el(qe, vec2(rx, ry * (1.0 - 0.32 * xr * xr)));
  float inEye = 1.0 - smoothstep(0.9, 1.0, d);
  vec3 eye = vec3(0.94, 0.91, 0.88) * (1.0 - 0.34 * smoothstep(-0.2 * ry, ry, qe.y));
  vec2 qi = qe - vec2(-0.0006, -0.0004);
  float di = length(qi) / irisR;
  float irisM = 1.0 - smoothstep(0.88, 1.0, di);
  vec3 ic = mix(irisC * 0.5, irisC * 1.35, smoothstep(1.0, 0.2, di)) * (1.0 - 0.45 * smoothstep(0.72, 1.0, di)) * (1.0 - 0.4 * smoothstep(ry * 0.1, ry * 0.9, qe.y));
  eye = mix(eye, ic, irisM);
  eye = mix(eye, vec3(0.01), 1.0 - smoothstep(pupR * 0.85, pupR, length(qi)));
  eye = mix(eye, vec3(1.0), (1.0 - smoothstep(irisR * 0.14, irisR * 0.22, length(qi - vec2(irisR * 0.34, irisR * 0.4)))) * 0.95);
  col = mix(col, eye, inEye);
  float ring = smoothstep(0.78, 0.93, d) * (1.0 - smoothstep(1.0, 1.13, d));
  float wTop = smoothstep(-0.5 * ry, 0.5 * ry, qe.y);
  vec3 lc = lash > 0.5 ? vec3(0.012) : skin * 0.38;
  col = mix(col, lc, ring * (0.4 + 0.6 * wTop) * (lash > 0.5 ? 0.95 : 0.7));
  if (lash > 1.5) { float fl = 1.0 - smoothstep(0.5, 1.0, el(qe - vec2(rx * 1.05, ry * 0.55), vec2(rx * 0.32, ry * 0.2))); col = mix(col, lc, fl * 0.9); float up = smoothstep(0.88, 1.0, d) * (1.0 - smoothstep(1.0, 1.25, d)) * wTop; col = mix(col, lc, up); }
  // brows
  float t = (ax - (ex - 0.0185)) / 0.043;
  float yc = browY + arch * 0.011 * sin(clamp(t, 0.0, 1.0) * 3.0) - 0.0016 * t;
  float h = browTh * 0.0026 * (1.0 - 0.5 * t * t) * (1.0 + 0.3 * (1.0 - t));
  float bm = (1.0 - smoothstep(h * 0.6, h, abs(p.y - yc))) * smoothstep(0.0, 0.08, t) * (1.0 - smoothstep(0.9, 1.0, t));
  bm *= 0.86 + 0.14 * h21(floor(p * 1100.0));
  col = mix(col, browC, bm * 0.94);
  // nose shading
  col *= 1.0 - 0.14 * (1.0 - smoothstep(0.4, 1.0, el(p - vec2(0.0, noseY - 0.006), vec2(0.014 * noseW, 0.007))));
  col = mix(col, skin * 0.25, (1.0 - smoothstep(0.55, 1.0, el(vec2(ax - 0.0088 * noseW, p.y - (noseY - 0.0035)), vec2(0.0032, 0.0017)))) * 0.85);
  // lips
  float lx = p.x, ly = p.y - mouthY, u = abs(lx) / lipW;
  float wm = 1.0 - smoothstep(0.86, 1.0, u);
  float hu = 0.0092 * lipFull * (1.0 - 0.45 * u * u) - 0.0017 * exp(-pow(lx / 0.0042, 2.0));
  float hl = 0.0122 * lipFull * sqrt(max(0.0, 1.0 - 0.85 * u * u));
  float inUp = step(0.0, ly) * (1.0 - smoothstep(hu * 0.9, hu, ly));
  float inLo = step(ly, 0.0) * (1.0 - smoothstep(hl * 0.9, hl, -ly));
  vec3 lo = lipC * 1.05 + 0.1 * (1.0 - smoothstep(0.3, 1.0, el(vec2(lx, ly + hl * 0.45), vec2(lipW * 0.38, hl * 0.22))));
  col = mix(col, lipC * 0.86, inUp * wm);
  col = mix(col, lo, inLo * wm);
  float ml = (1.0 - smoothstep(0.0002, 0.0009, abs(ly))) * (1.0 - smoothstep(0.82, 1.0, u));
  col = mix(col, lipC * 0.2, ml * 0.9);
  return col;
}
vec3 patternColor(float id, vec2 uv, vec3 c1, vec3 c2) {
  vec2 f = fract(uv), cell = floor(uv); vec3 col = c1;
  float n = h21(floor(uv * 52.0));
  if (id < 1.5) { col = c1 * (0.955 + 0.09 * n); }
  else if (id < 2.5) { col = mix(c1, c2, step(0.5, f.y)); }
  else if (id < 3.5) { col = mix(c1, c2, step(0.9, f.x)); }
  else if (id < 4.5) {
    col = c1;
    col = mix(col, c2, 0.62 * step(0.58, f.x) * step(f.x, 0.84));
    col = mix(col, c2, 0.62 * step(0.58, f.y) * step(f.y, 0.84));
    col = mix(col, vec3(0.9), 0.55 * step(0.08, f.x) * step(f.x, 0.11));
    col = mix(col, vec3(0.9), 0.55 * step(0.08, f.y) * step(f.y, 0.11));
    col *= (0.95 + 0.1 * n);
  }
  else if (id < 5.5) { vec2 q = fract(uv + vec2(0.5 * mod(cell.y, 2.0), 0.0)); col = mix(c1, c2, 1.0 - smoothstep(0.19, 0.23, length(q - 0.5))); }
  else if (id < 6.5) {
    vec2 p = f - 0.5; float r = length(p), a = atan(p.y, p.x), rp = r * (1.0 + 0.2 * sin(a * 8.0));
    float par = mod(cell.x + cell.y, 2.0); vec3 A = par < 0.5 ? c1 : c2; vec3 B = par < 0.5 ? c2 : c1;
    col = B;
    col = mix(col, A, 1.0 - smoothstep(0.35, 0.37, rp));
    col = mix(col, B, 1.0 - smoothstep(0.25, 0.27, rp));
    col = mix(col, gold, 1.0 - smoothstep(0.15, 0.17, rp));
    col = mix(col, A, 1.0 - smoothstep(0.06, 0.08, rp));
    col = mix(col, gold, 1.0 - smoothstep(0.07, 0.05, length(min(f, 1.0 - f))));
  }
  else if (id < 7.5) {
    vec2 q = abs(f - 0.5); float d = q.x + q.y;
    col = mix(c1, c2, step(0.5, d));
    col = mix(col, gold, 1.0 - smoothstep(0.08, 0.10, length(f - 0.5)));
    col = mix(col, c1, 1.0 - smoothstep(0.03, 0.05, length(f - 0.5)));
    col = mix(col, gold, 0.9 * (1.0 - smoothstep(0.07, 0.09, length(min(f, 1.0 - f)))));
  }
  else if (id < 8.5) {
    float b = step(0.5, fract(uv.x * 2.0));
    col = mix(c1, c2, b);
    col = mix(col, gold, step(0.84, f.y) * b);
    col = mix(col, vec3(0.08), step(0.9, f.y) * (1.0 - b));
    col = mix(col, vec3(0.1, 0.45, 0.2), step(0.45, f.y) * step(f.y, 0.55) * (1.0 - b));
    col *= (0.93 + 0.14 * n);
  }
  else if (id < 9.5) {
    vec2 p = f - 0.5; float r = length(p), a = atan(p.y, p.x);
    float petal = 0.30 * (0.55 + 0.45 * abs(cos(2.5 * a)));
    col = c1; col = mix(col, c2, 1.0 - smoothstep(petal - 0.015, petal + 0.015, r));
    col = mix(col, gold, 1.0 - smoothstep(0.045, 0.06, r));
    col = mix(col, c2 * 0.8, 0.8 * (1.0 - smoothstep(0.03, 0.05, length(min(f, 1.0 - f)))));
  }
  else if (id < 10.5) { float tw = fract((uv.x + uv.y) * 32.0); col = c1 * (0.9 + 0.1 * tw + 0.1 * n); col = mix(col, c2, 0.06); }
  else if (id < 11.5) { col = c1 * (0.8 + 0.2 * sin(uv.x * 6.2832 * 7.0)) * (0.96 + 0.08 * n); }
  else if (id < 12.5) { float line = smoothstep(0.1, 0.0, min(f.x, 1.0 - f.x)); col = c1 * (1.0 - 0.7 * line) * (0.88 + 0.16 * sin(uv.y * 70.0)); }
  else if (id < 13.5) { col = c1 * (0.62 + 0.38 * abs(sin(uv.y * 34.0 + uv.x * 6.2832 * 0.5))); }
  else if (id < 14.5) { col = mix(c1, c2, step(0.5, fract((uv.x + uv.y) * 1.0))); }
  else if (id < 15.5) { col = c1 * (0.985 + 0.03 * n); }
  else if (id < 16.5) { col = c1 * (0.9 + 0.2 * h21(floor(uv * 90.0))); }
  else { col = facePaint(uv, c1); }
  return col;
}`;

  function patch(shader) {
    const fu = []; const fd = (this && this.userData && this.userData.face) || null; for (let i = 0; i < 9; i++) fu.push(new T.Vector4(fd ? fd[i][0] : 0, fd ? fd[i][1] : 0, fd ? fd[i][2] : 0, fd ? fd[i][3] : 0)); shader.uniforms.uF = { value: fu };
    shader.vertexShader = shader.vertexShader
      .replace('void main() {', 'attribute vec2 aPuv; attribute vec4 aPat; varying vec2 vPuv; varying vec4 vPat;\nvoid main() {')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\n vPuv = aPuv; vPat = aPat;');
    shader.fragmentShader = shader.fragmentShader
      .replace('void main() {', GLSL_FRAG_FUNCS + '\nvoid main() {')
      .replace('#include <color_fragment>', 'diffuseColor.rgb *= (vPat.x > 0.5 ? patternColor(vPat.x, vPuv, vColor, vPat.yzw) : vColor);');
  }
  const matCache = {};
  /* kind: 'lambert' (cheap, default for crowds) | 'standard' (nicer, for the player and the creator) */
  FA.material = function (kind) {
    kind = kind === 'standard' ? 'standard' : 'lambert';
    if (matCache[kind]) return matCache[kind];
    const base = { vertexColors: true, skinning: true };
    const m = kind === 'standard' ? new T.MeshStandardMaterial(Object.assign({ roughness: 0.62, metalness: 0 }, base)) : new T.MeshLambertMaterial(base);
    m.onBeforeCompile = patch; m.customProgramCacheKey = () => 'futa-avatar-' + kind;
    return (matCache[kind] = m);
  };
  /* material for ONE geometry: same shader program (shared), but carries this look's face-paint uniforms */
  FA.materialFor = function (geo, kind) {
    kind = kind === 'standard' ? 'standard' : 'lambert'; const ud = geo.userData; ud.mats = ud.mats || {};
    if (ud.mats[kind]) return ud.mats[kind];
    const m = FA.material(kind).clone(); m.userData = { face: ud.face }; m.onBeforeCompile = patch; m.customProgramCacheKey = () => 'futa-avatar-' + kind;
    return (ud.mats[kind] = m);
  };
  /* a non-skinned version of the same material, for props merged into one static mesh */
  FA.propMaterial = function () {
    if (matCache.prop) return matCache.prop;
    const m = new T.MeshLambertMaterial({ vertexColors: true });
    m.onBeforeCompile = patch; m.customProgramCacheKey = () => 'futa-avatar-prop';
    return (matCache.prop = m);
  };
})(typeof window !== 'undefined' ? window : globalThis);
