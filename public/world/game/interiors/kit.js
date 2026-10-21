/* ==========================================================================
   FutaKit — tiny 3D kit for interiors. Builds furniture from boxes / cylinders / spheres into ONE merged geometry per object
   with baked shading (top lighter, sides softer, floor-contact darker) so rooms look rich with very few draw calls and no textures.
   Needs THREE r128. Everything here is in METRES. Y is up. Objects face +Z ("front").

   const b = new FutaKit.Builder();
   b.box(x, yBottom, z, w, h, d, '#8a5a3c');        // (x,z) = centre, y = bottom
   b.cyl(x, yBottom, z, radius, h, color, {r2: topRadius, seg: 12});
   b.sph(x, yCentre, z, radius, color, {sy: 1, sz: 1});
   b.push(x, y, z, rotY) ... b.pop();              // local transform for a group of parts
   options on any part: {layer:'glow'|'glass', shade:0.8, ao:false}   glow = unlit emissive (screens, lamps), glass = see-through
   b.build() → { solid, glow, glass }  (BufferGeometry or null)       FutaKit.meshes(b) → THREE.Group using the shared materials
   ========================================================================== */
(function (g) {
  'use strict';
  const T = g.THREE;
  const tmpC = new T.Color();
  function rgb(c) { if (Array.isArray(c)) return c; tmpC.set(c); tmpC.convertSRGBToLinear(); return [tmpC.r, tmpC.g, tmpC.b]; }
  const sm = (a, b, x) => { const t = Math.max(0, Math.min(1, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

  /* ---------- unit primitives (cached) ---------- */
  const U = {};
  function unitBox() {
    if (U.box) return U.box; const P = [], N = [], I = [];
    const faces = [[[1, 0, 0], [0, 0, 1], [0, 1, 0]], [[-1, 0, 0], [0, 0, -1], [0, 1, 0]], [[0, 1, 0], [1, 0, 0], [0, 0, 1]], [[0, -1, 0], [1, 0, 0], [0, 0, -1]], [[0, 0, 1], [-1, 0, 0], [0, 1, 0]], [[0, 0, -1], [1, 0, 0], [0, 1, 0]]];
    faces.forEach(([n, u, v]) => { const o = P.length / 3; for (const [a, c] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) { P.push(n[0] * .5 + u[0] * a * .5 + v[0] * c * .5, n[1] * .5 + u[1] * a * .5 + v[1] * c * .5 + .5, n[2] * .5 + u[2] * a * .5 + v[2] * c * .5); N.push(n[0], n[1], n[2]); } I.push(o, o + 1, o + 2, o, o + 2, o + 3); });
    // faces above give CCW only for some orientations; fix winding by checking against normal
    for (let i = 0; i < I.length; i += 3) { const a = I[i] * 3, b = I[i + 1] * 3, c = I[i + 2] * 3; const ux = P[b] - P[a], uy = P[b + 1] - P[a + 1], uz = P[b + 2] - P[a + 2], vx = P[c] - P[a], vy = P[c + 1] - P[a + 1], vz = P[c + 2] - P[a + 2]; const cx = uy * vz - uz * vy, cy = uz * vx - ux * vz, cz = ux * vy - uy * vx; if (cx * N[a] + cy * N[a + 1] + cz * N[a + 2] < 0) { const t = I[i + 1]; I[i + 1] = I[i + 2]; I[i + 2] = t; } }
    return (U.box = { P, N, I });
  }
  function unitCyl(seg, r2) {
    const key = 'c' + seg + '_' + r2; if (U[key]) return U[key]; const P = [], N = [], I = [];
    for (let i = 0; i <= seg; i++) { const a = i / seg * Math.PI * 2, c = Math.cos(a), s = Math.sin(a), ny = (1 - r2) * .5; const l = Math.hypot(1, ny); P.push(c * .5, 0, s * .5, c * .5 * r2, 1, s * .5 * r2); N.push(c / l, ny / l, s / l, c / l, ny / l, s / l); }
    for (let i = 0; i < seg; i++) { const a = i * 2; I.push(a, a + 1, a + 3, a, a + 3, a + 2); }
    const capB = P.length / 3; P.push(0, 0, 0); N.push(0, -1, 0); for (let i = 0; i <= seg; i++) { const a = i / seg * Math.PI * 2; P.push(Math.cos(a) * .5, 0, Math.sin(a) * .5); N.push(0, -1, 0); } for (let i = 0; i < seg; i++) I.push(capB, capB + 2 + i, capB + 1 + i);
    if (r2 > 0.001) { const capT = P.length / 3; P.push(0, 1, 0); N.push(0, 1, 0); for (let i = 0; i <= seg; i++) { const a = i / seg * Math.PI * 2; P.push(Math.cos(a) * .5 * r2, 1, Math.sin(a) * .5 * r2); N.push(0, 1, 0); } for (let i = 0; i < seg; i++) I.push(capT, capT + 1 + i, capT + 2 + i); }
    return (U[key] = { P, N, I });
  }
  function unitSph(seg) {
    const key = 's' + seg; if (U[key]) return U[key]; const P = [], N = [], I = [], H = Math.max(3, seg >> 1);
    for (let j = 0; j <= H; j++) { const v = j / H * Math.PI, y = Math.cos(v), r = Math.sin(v); for (let i = 0; i <= seg; i++) { const a = i / seg * Math.PI * 2; const x = Math.cos(a) * r, z = Math.sin(a) * r; P.push(x, y, z); N.push(x, y, z); } }
    for (let j = 0; j < H; j++) for (let i = 0; i < seg; i++) { const a = j * (seg + 1) + i, b = a + seg + 1; I.push(a, b, a + 1, b, b + 1, a + 1); }
    return (U[key] = { P, N, I });
  }

  class Layer { constructor() { this.pos = []; this.nor = []; this.col = []; this.idx = []; } }
  class Builder {
    constructor() { this.L = { solid: new Layer(), glow: new Layer(), glass: new Layer() }; this.st = [new T.Matrix4()]; this.m = this.st[0]; this._n = new T.Matrix3(); this.bounds = { x0: 1e9, x1: -1e9, z0: 1e9, z1: -1e9, y1: 0 }; }
    push(x, y, z, ry) { const r = new T.Matrix4().makeRotationY(ry || 0); r.setPosition(x || 0, y || 0, z || 0); this.m = this.st[this.st.length - 1].clone().multiply(r); this.st.push(this.m); return this; }
    pop() { this.st.pop(); this.m = this.st[this.st.length - 1]; return this; }
    _emit(layer, P, N, I, sc, c, o) {
      const L = this.L[layer], base = L.pos.length / 3, m = this.m, e = m.elements; this._n.getNormalMatrix(m); const nm = this._n.elements; const col = rgb(c), shade = o.shade == null ? 1 : o.shade, ao = o.ao !== false && layer === 'solid';
      for (let i = 0; i < P.length; i += 3) {
        const lx = P[i] * sc[0], ly = P[i + 1] * sc[1], lz = P[i + 2] * sc[2];
        const x = e[0] * lx + e[4] * ly + e[8] * lz + e[12], y = e[1] * lx + e[5] * ly + e[9] * lz + e[13], z = e[2] * lx + e[6] * ly + e[10] * lz + e[14];
        let nx = nm[0] * N[i] / sc[0] + nm[3] * N[i + 1] / sc[1] + nm[6] * N[i + 2] / sc[2], ny = nm[1] * N[i] / sc[0] + nm[4] * N[i + 1] / sc[1] + nm[7] * N[i + 2] / sc[2], nz = nm[2] * N[i] / sc[0] + nm[5] * N[i + 1] / sc[1] + nm[8] * N[i + 2] / sc[2];
        const nl = Math.hypot(nx, ny, nz) || 1; nx /= nl; ny /= nl; nz /= nl;
        L.pos.push(x, y, z); L.nor.push(nx, ny, nz);
        let f = layer === 'solid' ? (0.84 + 0.12 * ny + 0.045 * nx + 0.07 * nz) : 1; if (ny < -0.5) f *= 0.8; f *= shade; if (ao) f *= 0.74 + 0.26 * sm(0, 0.5, y);
        L.col.push(col[0] * f, col[1] * f, col[2] * f);
        const bd = this.bounds; if (x < bd.x0) bd.x0 = x; if (x > bd.x1) bd.x1 = x; if (z < bd.z0) bd.z0 = z; if (z > bd.z1) bd.z1 = z; if (y > bd.y1) bd.y1 = y;
      }
      for (let i = 0; i < I.length; i++) L.idx.push(I[i] + base);
      // negative scales flip winding; our parts never use negative scale
    }
    box(x, y, z, w, h, d, c, o) { o = o || {}; const u = unitBox(); this.push(x, y, z, 0); this._emit(o.layer || 'solid', u.P, u.N, u.I, [w, h, d], c, o); return this.pop(); }
    cyl(x, y, z, r, h, c, o) { o = o || {}; const u = unitCyl(o.seg || 12, o.r2 == null ? 1 : o.r2 / r); this.push(x, y, z, 0); this._emit(o.layer || 'solid', u.P, u.N, u.I, [r * 2, h, r * 2], c, o); return this.pop(); }
    sph(x, y, z, r, c, o) { o = o || {}; const u = unitSph(o.seg || 10); this.push(x, y, z, 0); this._emit(o.layer || 'solid', u.P, u.N, u.I, [r, r * (o.sy == null ? 1 : o.sy), r * (o.sz == null ? 1 : o.sz)], c, o); return this.pop(); }
    /** horizontal cylinder along X (pipes, rolls, bars). length l, radius r, centred at (x,y,z) */
    bar(x, y, z, l, r, c, o) { o = o || {}; this.push(x, y, z, 0); const rr = new T.Matrix4().makeRotationZ(Math.PI / 2); this.m = this.m.clone().multiply(rr); const u = unitCyl(o.seg || 8, 1); this._emit(o.layer || 'solid', u.P.map((v, i) => i % 3 === 1 ? v - .5 : v), u.N, u.I, [r * 2, l, r * 2], c, o); this.m = this.st[this.st.length - 1]; return this.pop(); }
    /** disc whose axis points along +Z (door faces, dials, wheels): radius r, thickness t, front face at z+t. (x,y) = centre. */
    disc(x, y, z, r, t, c, o) { o = o || {}; this.push(x, y, z, 0); this.m = this.m.clone().multiply(new T.Matrix4().makeRotationX(Math.PI / 2)); const u = unitCyl(o.seg || 20, o.r2 == null ? 1 : o.r2 / r); this._emit(o.layer || 'solid', u.P, u.N, u.I, [r * 2, t, r * 2], c, o); this.m = this.st[this.st.length - 1]; return this.pop(); }
    /** box rotated about the Z axis around its bottom-centre (spokes, hands): (x,y,z) = pivot, w × h × d with h pointing "up" before rotation, rz in radians */
    boxR(x, y, z, w, h, d, rz, c, o) { o = o || {}; this.push(x, y, z, 0); this.m = this.m.clone().multiply(new T.Matrix4().makeRotationZ(rz)); const u = unitBox(); this._emit(o.layer || 'solid', u.P, u.N, u.I, [w, h, d], c, o); this.m = this.st[this.st.length - 1]; return this.pop(); }
    /** thin vertical-axis slanted plank / wedge top: ramp rising toward +z? (w wide, h tall at back, d deep): used for desk slopes, benches backs */
    tilt(x, y, z, w, h, d, ax, c, o) { o = o || {}; this.push(x, y, z, 0); const r = new T.Matrix4().makeRotationX(ax); this.m = this.m.clone().multiply(r); const u = unitBox(); this._emit(o.layer || 'solid', u.P, u.N, u.I, [w, h, d], c, o); this.m = this.st[this.st.length - 1]; return this.pop(); }
    build() { const out = {}; for (const k in this.L) { const L = this.L[k]; if (!L.idx.length) { out[k] = null; continue; } const geo = new T.BufferGeometry(); geo.setAttribute('position', new T.Float32BufferAttribute(L.pos, 3)); geo.setAttribute('normal', new T.Float32BufferAttribute(L.nor, 3)); geo.setAttribute('color', new T.Float32BufferAttribute(L.col, 3)); geo.setIndex(L.idx.length > 65000 ? new T.Uint32BufferAttribute(L.idx, 1) : new T.Uint16BufferAttribute(L.idx, 1)); geo.computeBoundingSphere(); geo.computeBoundingBox(); out[k] = geo; } return out; }
  }

  /* ---------- shared materials (one of each → cheap) ---------- */
  const MAT = { solid: new T.MeshLambertMaterial({ vertexColors: true }), glow: new T.MeshBasicMaterial({ vertexColors: true, toneMapped: false }), glass: new T.MeshLambertMaterial({ vertexColors: true, transparent: true, opacity: 0.32, depthWrite: false }) };
  /** Build a Group of meshes from a Builder. cast/receive control shadows. Each call makes its own geometry (dispose with FutaKit.dispose). */
  function meshes(b, o) {
    o = o || {}; const grp = new T.Group(), geo = b.build();
    if (geo.solid) { const m = new T.Mesh(geo.solid, o.material || MAT.solid); m.castShadow = o.cast !== false; m.receiveShadow = o.receive !== false; grp.add(m); grp.userData.solid = m; }
    if (geo.glow) { const m = new T.Mesh(geo.glow, MAT.glow); m.userData.glow = true; grp.add(m); }
    if (geo.glass) { const m = new T.Mesh(geo.glass, MAT.glass); m.renderOrder = 5; grp.add(m); }
    return grp;
  }
  function dispose(obj) { obj.traverse(o => { if (o.geometry) o.geometry.dispose(); if (o.material && o.material.map && o.material.userData.own) o.material.map.dispose(); if (o.material && o.material.userData.own) o.material.dispose(); }); }

  /* ---------- canvas helpers: signs + tiny textures ---------- */
  const texCache = {};
  function canvasTex(key, w, h, draw, repeat) {
    if (texCache[key]) return texCache[key]; const c = document.createElement('canvas'); c.width = w; c.height = h; draw(c.getContext('2d'), w, h);
    const t = new T.CanvasTexture(c); t.encoding = T.sRGBEncoding; t.anisotropy = 4; if (repeat) { t.wrapS = t.wrapT = T.RepeatWrapping; } return (texCache[key] = t);
  }
  /** A flat sign/board with text. Returns a Mesh (w × h metres) facing +Z; rotate/position it yourself. */
  function sign(text, w, h, o) {
    o = o || {}; const bg = o.bg || '#12305a', fg = o.fg || '#ffffff', font = o.font || '700', lines = String(text).split('\n');
    const px = 256, key = 'sign|' + text + '|' + bg + '|' + fg + '|' + w + '|' + h + '|' + (o.icon || '');
    const tex = canvasTex(key, px * Math.min(4, Math.max(1, Math.round(w))) , Math.round(px * h / w * Math.min(4, Math.max(1, Math.round(w)))), (x, cw, ch) => {
      x.fillStyle = bg; x.fillRect(0, 0, cw, ch); if (o.border !== false) { x.strokeStyle = o.border || 'rgba(255,255,255,.35)'; x.lineWidth = ch * 0.04; x.strokeRect(ch * 0.04, ch * 0.04, cw - ch * 0.08, ch * 0.92); }
      x.fillStyle = fg; x.textAlign = 'center'; x.textBaseline = 'middle'; const fs = Math.min(ch / (lines.length + 0.6), cw / (Math.max(...lines.map(s => s.length)) * 0.62 + 1)); x.font = font + ' ' + fs + 'px system-ui,Segoe UI,sans-serif';
      lines.forEach((s, i) => x.fillText(s, cw / 2 + (o.icon ? fs * 0.6 : 0), ch / 2 + (i - (lines.length - 1) / 2) * fs * 1.15)); if (o.icon) { x.font = fs * 1.1 + 'px system-ui'; x.fillText(o.icon, fs * 0.9, ch / 2); }
    });
    const m = new T.Mesh(new T.PlaneGeometry(w, h), new T.MeshBasicMaterial({ map: tex, toneMapped: false })); m.userData.sign = true; return m;
  }
  /** Soft round light/shadow decal texture (white → transparent). */
  function blobTex() { return canvasTex('blob', 64, 64, (x) => { const gr = x.createRadialGradient(32, 32, 0, 32, 32, 32); gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.5, 'rgba(255,255,255,.35)'); gr.addColorStop(1, 'rgba(255,255,255,0)'); x.fillStyle = gr; x.fillRect(0, 0, 64, 64); }); }
  /** Soft rectangular window-light texture. */
  function patchTex() { return canvasTex('patch', 64, 64, (x) => { const gr = x.createLinearGradient(0, 0, 0, 64); gr.addColorStop(0, 'rgba(255,255,255,.9)'); gr.addColorStop(1, 'rgba(255,255,255,.25)'); x.fillStyle = gr; x.fillRect(6, 6, 52, 52); x.filter = 'blur(5px)'; x.drawImage(x.canvas, 0, 0); }); }

  g.FutaKit = { Builder, meshes, dispose, MAT, rgb, canvasTex, sign, blobTex, patchTex };
})(typeof window !== 'undefined' ? window : globalThis);
