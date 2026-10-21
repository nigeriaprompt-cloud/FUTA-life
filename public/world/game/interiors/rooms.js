/* ==========================================================================
   FutaRoom — builds one interior room: floor, walls (with windows + door), furniture, lights, NPC stations. See interiors/README in docs/INTERIORS.md.

   const R = FutaRoom.create({ w:10, d:8, h:3, theme:{ floor:{type:'wood',c1:'#b98a5a',c2:'#a67a4c'}, wall:'#efe6d4', trim:'#ffffff', wainscot:'#c9b79a', accent:'#d9b24a', curtain:'#b3362e' },
                               windows:[{wall:'back', at:3, w:1.5, h:1.3, sill:1.0}], doorAt:5 });
   R.add('bunk', 2, 1.2, 0, { inter:'sleep_bunk' });      // place a piece (x,z in metres, rotation in degrees); inter = interaction id from interactions.json
   R.against('wardrobe', 'left', 4, { inter:'wardrobe' }); // back to a wall:  'back'|'left'|'right'|'front', 'at' = distance along the wall
   R.onWall('wallpic', 'back', 7, { c:'#6aa6c9' });        // wall-mounted decoration
   R.sign('WEMA BANK', x,y,z, w,h, rotDeg, {bg,fg});       R.light(x,z,{color,pool});   R.ceilingLights(2,2);
   R.station('door', x, z, faceDeg, {pose:'guard', tag:'door'});   R.route('patrol', [[x,z],…]);
   const built = R.build();   // → { group, interactives, seats, blockers, stations, routes, spawn, windows, applySky(k), dispose() }
   Coordinates: x 0..w (left→right), z 0..d (back wall z=0 → front wall z=d, where the door is). Camera looks from the front (+z).
   ========================================================================== */
(function (g) {
  'use strict';
  const T = g.THREE, K = g.FutaKit, F = g.FutaFurn, DEG = Math.PI / 180;

  /* ---------- procedural floor / wall textures (tiny canvases, cached) ---------- */
  const rnd = (s) => { s = (s * 9301 + 49297) % 233280; return s / 233280; };
  function shade(hex, f) { const c = new T.Color(hex); c.multiplyScalar(f); return '#' + c.getHexString(); }
  const FLOOR = {
    tile(x, S, c1, c2) { const n = 4, t = S / n; for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) { x.fillStyle = (i + j) % 2 ? c1 : c2; x.fillRect(i * t, j * t, t, t); x.fillStyle = 'rgba(255,255,255,.05)'; x.fillRect(i * t, j * t, t, t * .45); } x.strokeStyle = 'rgba(0,0,0,.28)'; x.lineWidth = 2; for (let i = 0; i <= n; i++) { x.beginPath(); x.moveTo(i * t, 0); x.lineTo(i * t, S); x.stroke(); x.beginPath(); x.moveTo(0, i * t); x.lineTo(S, i * t); x.stroke(); } },
    wood(x, S, c1, c2) { const n = 8, t = S / n; for (let j = 0; j < n; j++) { x.fillStyle = c2; x.fillRect(0, j * t, S, t); let off = rnd(j + 4) * S; for (let k = -1; k < 3; k++) { const w = S * (.45 + rnd(j * 3 + k + 9) * .35); x.fillStyle = rnd(j * 7 + k + 2) > .5 ? c1 : c2; x.fillRect(off + k * w, j * t, w, t); x.strokeStyle = 'rgba(0,0,0,.35)'; x.lineWidth = 1.5; x.strokeRect(off + k * w, j * t, w, t); } } x.strokeStyle = 'rgba(0,0,0,.07)'; x.lineWidth = 1; for (let i = 0; i < 70; i++) { const y = rnd(i * 5) * S, xx = rnd(i * 11) * S; x.beginPath(); x.moveTo(xx, y); x.lineTo(xx + 30 + rnd(i) * 40, y + rnd(i + 3) * 2); x.stroke(); } },
    carpet(x, S, c1, c2) { x.fillStyle = c1; x.fillRect(0, 0, S, S); for (let i = 0; i < 2200; i++) { x.fillStyle = rnd(i) > .5 ? 'rgba(255,255,255,.05)' : 'rgba(0,0,0,.07)'; x.fillRect(rnd(i * 3 + 1) * S, rnd(i * 7 + 2) * S, 2, 2); } },
    concrete(x, S, c1, c2) { x.fillStyle = c1; x.fillRect(0, 0, S, S); for (let i = 0; i < 1500; i++) { x.fillStyle = rnd(i) > .5 ? 'rgba(255,255,255,.06)' : 'rgba(0,0,0,.08)'; x.fillRect(rnd(i * 3 + 1) * S, rnd(i * 7 + 2) * S, 1 + rnd(i) * 3, 1 + rnd(i + 4) * 3); } x.strokeStyle = 'rgba(0,0,0,.25)'; x.lineWidth = 2; x.strokeRect(1, 1, S - 2, S - 2); },
    marble(x, S, c1, c2) { const n = 2, t = S / n; for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) { x.fillStyle = (i + j) % 2 ? c1 : c2; x.fillRect(i * t, j * t, t, t); x.strokeStyle = 'rgba(80,80,90,.18)'; x.lineWidth = 1.5; for (let k = 0; k < 4; k++) { x.beginPath(); let px = i * t + rnd(i * 9 + j * 5 + k) * t, py = j * t; x.moveTo(px, py); for (let s = 1; s <= 6; s++) { px += (rnd(k * 13 + s + i) - .5) * 40; py = j * t + s * t / 6; x.lineTo(px, py); } x.stroke(); } x.fillStyle = 'rgba(255,255,255,.07)'; x.fillRect(i * t, j * t, t, t * .5); } x.strokeStyle = 'rgba(0,0,0,.22)'; x.lineWidth = 2; for (let i = 0; i <= n; i++) { x.beginPath(); x.moveTo(i * t, 0); x.lineTo(i * t, S); x.stroke(); x.beginPath(); x.moveTo(0, i * t); x.lineTo(S, i * t); x.stroke(); } },
    terrazzo(x, S, c1, c2) { x.fillStyle = c1; x.fillRect(0, 0, S, S); for (let i = 0; i < 380; i++) { x.fillStyle = pickc(i, [c2, '#ffffff', '#9a9a9a', '#cdb48a']); x.globalAlpha = .55; const r = 2 + rnd(i * 2) * 5; x.beginPath(); x.ellipse(rnd(i * 3 + 1) * S, rnd(i * 7 + 2) * S, r, r * .6, rnd(i) * 3, 0, 6.3); x.fill(); } x.globalAlpha = 1; x.strokeStyle = 'rgba(0,0,0,.2)'; x.lineWidth = 2; x.strokeRect(0, 0, S, S); },
    grass(x, S, c1, c2) { x.fillStyle = c1; x.fillRect(0, 0, S, S); for (let i = 0; i < 1800; i++) { x.fillStyle = rnd(i) > .5 ? c2 : shade(c1, .8); x.fillRect(rnd(i * 3 + 1) * S, rnd(i * 7 + 2) * S, 2, 4); } }
  };
  const pickc = (i, a) => a[Math.floor(rnd(i * 5 + 1) * a.length)];
  function floorTex(spec, w, d) {
    const type = spec.type || 'tile', c1 = spec.c1 || '#d9d2c2', c2 = spec.c2 || shade(c1, .92), scale = spec.scale || (type === 'wood' ? 2.4 : type === 'marble' ? 2.4 : 2.0), key = 'floor|' + type + c1 + c2;
    const base = K.canvasTex(key, 256, 256, (x, S) => (FLOOR[type] || FLOOR.tile)(x, S, c1, c2), true), t = base.clone(); t.needsUpdate = true; t.repeat.set(w / scale, d / scale); return t;
  }

  function create(o) {
    const W = o.w, D = o.d, H = o.h || 3.0, TH = 0.22, th = Object.assign({ floor: { type: 'tile', c1: '#d9d2c2' }, wall: '#ece4d2', trim: '#ffffff', wainscot: null, accent: null, curtain: '#b3362e', outer: '#8d8574' }, o.theme || {});
    const R = { w: W, d: D, h: H, theme: th, windows: (o.windows || []).map(w => Object.assign({ w: 1.4, h: 1.25, sill: 1.0 }, w)), doorAt: o.doorAt == null ? W / 2 : o.doorAt, id: o.id || 'room', venue: o.venue || null,
      pieces: [], inters: [], seats: [], blockers: [], stations: [], routes: {}, lights: [], extras: [], statics: new K.Builder(), _sizeCache: {} };

    const doorW = 1.3;
    function sizeOf(name, opt) { const key = name + '|' + JSON.stringify(opt || {}); if (R._sizeCache[key]) return R._sizeCache[key]; const d = F.get(name), b = new K.Builder(); d.draw.call(d, b, Object.assign({}, opt || {})); return (R._sizeCache[key] = d.size.slice()); }
    R.sizeOf = sizeOf;
    const cs = (a) => [Math.cos(a), Math.sin(a)];
    const toWorld = (p, lx, lz) => { const [c, s] = cs(p.rot); return [p.x + lx * c + lz * s, p.z - lx * s + lz * c]; };

    /** place a piece. x,z = centre of its footprint (metres). rot in degrees (see header). */
    R.add = function (name, x, z, rotDeg, opt) {
      opt = Object.assign({}, opt || {}); const d = F.get(name), p = { id: name + '#' + R.pieces.length, name, def: d, x, z, rot: (rotDeg || 0) * DEG, o: opt, size: null };
      if (opt.inter == null && g.FutaActs && R.venue) { const auto = g.FutaActs.forProp(name, R.venue); if (auto.length) opt.inter = auto; }   // automatic interactions from acts.js
      if (opt.inter === false) opt.inter = null;
      const inter = opt.inter; let draw = new K.Builder(), target = inter ? draw : R.statics;
      if (inter) { d.draw.call(d, draw, opt); } else { target.push(x, 0, z, p.rot); d.draw.call(d, target, opt); target.pop(); }
      p.size = d.size.slice(); R.pieces.push(p);
      if (d.blocker !== false && !opt.nb) { const sw = Math.abs(Math.sin(p.rot)) > .7; const bw = sw ? p.size[1] : p.size[0], bd = sw ? p.size[0] : p.size[1]; R.blockers.push({ x, z, w: bw, d: bd, piece: p.id }); }
      // seats
      const seats = F.seatsOf(d, opt); seats.forEach((s, i) => { const [wx, wz] = toWorld(p, s.x, s.z); R.seats.push({ id: p.id + ':' + i, x: wx, z: wz, face: s.face + p.rot, y: s.y || .46, piece: p, tag: opt.tag || null, inter: inter && i === (opt.seatIndex || 0) ? inter : null }); });
      // stand-spot (where a player stands to use the piece)
      const sp = opt.spot || d.spot || [0, p.size[1] / 2 + .45, Math.PI]; const [sx, sz] = toWorld(p, sp[0], sp[1]); p.spot = { x: sx, z: sz, face: sp[2] + p.rot };
      if (d.lie) { const [lx, lz] = toWorld(p, d.lie.x, d.lie.z); p.lie = { x: lx, y: d.lie.y, z: lz, rot: d.lie.rot + p.rot }; }
      if (inter) { const grp = K.meshes(draw); grp.position.set(x, 0, z); grp.rotation.y = p.rot; p.group = grp; R.inters.push(p); }
      return p;
    };
    R.against = function (name, wall, along, opt) {
      opt = opt || {}; const sz = sizeOf(name, opt), dd = sz[1] / 2 + (opt.gap == null ? 0.04 : opt.gap);
      if (wall === 'back') return R.add(name, along, dd, 0, opt); if (wall === 'front') return R.add(name, along, D - dd, 180, opt);
      if (wall === 'left') return R.add(name, dd, along, 90, opt); return R.add(name, W - dd, along, 270, opt);
    };
    R.onWall = function (name, wall, along, opt) { opt = Object.assign({ gap: 0 }, opt || {}); return R.against(name, wall, along, opt); };
    R.row = function (name, x0, z0, nx, nz, dx, dz, rot, opt) { const out = []; for (let i = 0; i < nx; i++) for (let j = 0; j < nz; j++) out.push(R.add(name, x0 + i * dx, z0 + j * dz, rot, Object.assign({ seed: i * 3 + j }, opt || {}))); return out; };
    R.sign = function (text, x, y, z, w, h, rotDeg, style) { const m = K.sign(text, w, h, style); m.position.set(x, y, z); m.rotation.y = (rotDeg || 0) * DEG; R.extras.push(m); return m; };
    R.light = function (x, z, opt) { opt = Object.assign({ y: H - .45, color: '#ffe2a8', pool: 2.8, fixture: true }, opt || {}); R.lights.push(Object.assign({ x, z }, opt)); return opt; };
    R.ceilingLights = function (nx, nz, opt) { for (let i = 0; i < nx; i++) for (let j = 0; j < nz; j++) R.light((i + .5) * W / nx, (j + .5) * D / nz, opt); };
    R.station = function (id, x, z, faceDeg, opt) { const s = Object.assign({ id, x, z, face: (faceDeg || 0) * DEG, pose: 'idle', tag: id }, opt || {}); R.stations.push(s); return s; };
    R.route = function (id, pts, opt) { R.routes[id] = Object.assign({ pts: pts.map(p => ({ x: p[0], z: p[1] })), loop: true }, opt || {}); };

    /* ---------- shell ---------- */
    function walls(group) {
      const out = {}; const openings = { back: [], left: [], right: [], front: [{ at: R.doorAt, w: doorW, h: 2.15, sill: 0, door: true }] };
      R.windows.forEach(w => openings[w.wall].push(w));
      const mk = (side, x0, z0, len, alongX) => {
        const b = new K.Builder(), ops = openings[side].slice().sort((a, c) => a.at - c.at); let cur = 0; const outer = th.outer, wallC = th.accent && side === 'back' ? th.accent : th.wall;
        // segment helper: (a..b) along wall, (y0..y1) vertical
        const seg = (a, c, y0, y1) => { if (c - a < 0.001 || y1 - y0 < 0.001) return; const L = c - a, mid = a + L / 2, hh = y1 - y0;
          const core = (cx, cz, w, d, col, sh) => b.box(cx, y0, cz, w, hh, d, col, { ao: false, shade: sh }); const ix = alongX ? x0 + mid : x0, iz = alongX ? z0 : z0 + mid;
          if (alongX) { core(ix, iz, L, TH, outer, .85); const zi = side === 'back' ? iz + TH / 2 - .02 : iz - TH / 2 + .02; b.box(ix, y0, zi, L, hh, .04, wallC, { ao: false }); if (th.wainscot && y0 < 1.0) { const wh = Math.min(y1, 1.0) - y0; if (wh > 0) { b.box(ix, y0, side === 'back' ? iz + TH / 2 + .0 : iz - TH / 2, L, wh, .06, th.wainscot, { ao: false }); } } }
          else { core(ix, iz, TH, L, outer, .85); const xi = side === 'left' ? ix + TH / 2 - .02 : ix - TH / 2 + .02; b.box(xi, y0, iz, .04, hh, L, wallC, { ao: false }); if (th.wainscot && y0 < 1.0) { const wh = Math.min(y1, 1.0) - y0; if (wh > 0) b.box(side === 'left' ? ix + TH / 2 : ix - TH / 2, y0, iz, .06, wh, L, th.wainscot, { ao: false }); } } };
        ops.forEach(op => { const a = op.at - op.w / 2, c = op.at + op.w / 2; seg(cur, a, 0, H); seg(a, c, 0, op.sill); seg(a, c, op.sill + op.h, H); cur = c; }); seg(cur, len, 0, H);
        // trim: baseboard + crown
        const tr = th.trim; if (alongX) { const zi = side === 'back' ? z0 + TH / 2 + .035 : z0 - TH / 2 - .035; b.box(len / 2 + x0, 0, zi, len, .12, .05, tr, { ao: false }); b.box(len / 2 + x0, H - .1, zi, len, .1, .06, tr, { ao: false }); } else { const xi = side === 'left' ? x0 + TH / 2 + .035 : x0 - TH / 2 - .035; b.box(xi, 0, len / 2 + z0, .05, .12, len, tr, { ao: false }); b.box(xi, H - .1, len / 2 + z0, .06, .1, len, tr, { ao: false }); }
        // windows: frame + muntins; pane = separate mesh (colour follows the sky)
        const panes = [];
        openings[side].forEach(op => { if (op.door) return; const wx = alongX ? x0 + op.at : x0, wz = alongX ? z0 : z0 + op.at, sx = alongX ? op.w : .08, sz = alongX ? .08 : op.w; const fr = th.frame || '#f4f1ea';
          b.box(wx, op.sill - .04, wz, alongX ? op.w + .12 : .14, .06, alongX ? .14 : op.w + .12, fr, { ao: false }); b.box(wx, op.sill + op.h, wz, alongX ? op.w + .12 : .1, .06, alongX ? .1 : op.w + .12, fr, { ao: false });
          for (const s of [-1, 1]) b.box(alongX ? wx + s * op.w / 2 : wx, op.sill, alongX ? wz : wz + s * op.w / 2, alongX ? .06 : .1, op.h, alongX ? .1 : .06, fr, { ao: false });
          b.box(wx, op.sill + op.h / 2 - .015, wz, alongX ? op.w : .06, .03, alongX ? .06 : op.w, fr, { ao: false }); b.box(wx, op.sill, wz, alongX ? .03 : .06, op.h, alongX ? .06 : .03, fr, { ao: false });
          // curtains
          if (th.curtain && op.curtain !== false) { const cc = th.curtain, off = side === 'back' ? .1 : side === 'front' ? -.1 : side === 'left' ? .1 : -.1; for (const s of [-1, 1]) { const cx = alongX ? wx + s * (op.w / 2 + .12) : wx + off, cz = alongX ? wz + off : wz + s * (op.w / 2 + .12); b.box(cx, op.sill - .25, cz, alongX ? .26 : .08, op.h + .65, alongX ? .08 : .26, cc, { shade: .95 }); } b.bar(wx + (alongX ? 0 : off), op.sill + op.h + .38, wz + (alongX ? off : 0), op.w + .6, .018, '#6b4428', {}); if (!alongX) { /* rod along z is drawn rotated; skip */ } }
          const pm = new T.Mesh(new T.PlaneGeometry(op.w, op.h), new T.MeshBasicMaterial({ color: 0xbfe3f5, toneMapped: false })); pm.position.set(wx, op.sill + op.h / 2, wz); pm.rotation.y = side === 'back' ? 0 : side === 'front' ? Math.PI : side === 'left' ? Math.PI / 2 : -Math.PI / 2; pm.userData.pane = true; pm.userData.op = op; panes.push(pm); });
        // door
        const dr = openings.front[0]; if (side === 'front') { const dx = R.doorAt, fr = th.doorFrame || '#6b4428'; b.box(dx, 0, D + .0, .1, 2.18, TH + .06, fr, { ao: false }); b.box(dx - doorW / 2, 0, D, .1, 2.18, TH + .06, fr, { ao: false }); b.box(dx + doorW / 2, 0, D, .1, 2.18, TH + .06, fr, { ao: false }); b.box(dx, 2.15, D, doorW + .1, .1, TH + .06, fr, { ao: false }); b.box(dx, 0, D + TH / 2 - .03, .0001, 0, 0, fr); }
        const grp = K.meshes(b, { cast: false }); const mesh = grp.userData.solid; if (mesh) { mesh.castShadow = true; mesh.receiveShadow = true; } panes.forEach(p => grp.add(p));
        grp.userData.side = side; grp.userData.panes = panes; return grp; };
      out.back = mk('back', 0, -TH / 2, W, true); out.front = mk('front', 0, D + TH / 2, W, true); out.left = mk('left', -TH / 2, 0, D, false); out.right = mk('right', W + TH / 2, 0, D, false);
      // wall centres / outward normals for camera cut-away
      out.back.userData.n = [0, 0, -1]; out.back.userData.c = [W / 2, H / 2, -TH / 2]; out.front.userData.n = [0, 0, 1]; out.front.userData.c = [W / 2, H / 2, D + TH / 2];
      out.left.userData.n = [-1, 0, 0]; out.left.userData.c = [-TH / 2, H / 2, D / 2]; out.right.userData.n = [1, 0, 0]; out.right.userData.c = [W + TH / 2, H / 2, D / 2];
      Object.values(out).forEach(w => group.add(w)); return out;
    }

    /** Build everything into THREE objects. Call once. */
    R.build = function () {
      const group = new T.Group(); group.name = 'room:' + R.id;
      // floor
      const fl = new T.Mesh(new T.PlaneGeometry(W + TH * 2, D + TH * 2), new T.MeshLambertMaterial({ map: floorTex(th.floor, W + TH * 2, D + TH * 2) })); fl.material.userData.own = true; fl.rotation.x = -Math.PI / 2; fl.position.set(W / 2, 0, D / 2); fl.receiveShadow = true; fl.userData.floor = true; group.add(fl);
      const wl = walls(group);
      // statics
      const stat = K.meshes(R.statics); group.add(stat); stat.userData.statics = true;
      // interactive pieces
      R.inters.forEach(p => { p.group.userData.inter = p; p.group.traverse(m => { m.userData.interPiece = p; }); group.add(p.group); });
      // extras (signs)
      R.extras.forEach(m => group.add(m));
      // lights: ceiling fixtures (glow discs) + floor pools
      const fb = new K.Builder(); const pools = [];
      R.lights.forEach(l => { if (l.fixture) { fb.cyl(l.x, l.y + .25, l.z, .012, H - l.y - .25 > 0 ? H - l.y - .25 : .1, '#e9e4d6', { seg: 4, ao: false }); fb.cyl(l.x, l.y, l.z, .3, .08, '#fff4d0', { layer: 'glow', seg: 14, r2: .24 }); fb.cyl(l.x, l.y + .08, l.z, .31, .03, '#f3efe4', { seg: 14, ao: false }); }
        if (l.pool) { const pm = new T.Mesh(new T.PlaneGeometry(l.pool, l.pool), new T.MeshBasicMaterial({ map: K.blobTex(), color: new T.Color(l.color), transparent: true, opacity: 0, depthWrite: false, blending: T.AdditiveBlending, toneMapped: false })); pm.rotation.x = -Math.PI / 2; pm.position.set(l.x, .02, l.z); pm.userData.pool = l; pools.push(pm); group.add(pm); } });
      const fg = K.meshes(fb, { cast: false, receive: false }); group.add(fg);
      // window sun patches (positioned in applySky)
      const patches = []; R.windows.forEach(w => { const pm = new T.Mesh(new T.PlaneGeometry(1, 1), new T.MeshBasicMaterial({ map: K.patchTex(), color: 0xfff0c8, transparent: true, opacity: 0, depthWrite: false, blending: T.AdditiveBlending, toneMapped: false, side: T.DoubleSide })); pm.rotation.x = -Math.PI / 2; pm.userData.win = w; pm.visible = false; patches.push(pm); group.add(pm); });
      // blockers around the room edge (so nobody walks into walls) + grid
      const edge = .02, blk = R.blockers.concat([{ x: W / 2, z: 0, w: W, d: edge }, { x: W / 2, z: D, w: W, d: edge }, { x: 0, z: D / 2, w: edge, d: D }, { x: W, z: D / 2, w: edge, d: D }]);
      const spawn = { x: R.doorAt, z: D - 1.0, face: Math.PI }; // facing into the room? avatars face +z by default; face=PI looks toward -z (into the room)
      const exitSpot = { x: R.doorAt, z: D - .75, face: 0 };
      const grid = g.FutaInteract ? g.FutaInteract.makeGrid({ min: [0, 0], max: [W, D], cell: .25, blockers: blk }) : null;
      if (grid) relocateSpots(R, grid, { x: R.doorAt, z: D - 1.0 });
      const built = { room: R, group, walls: wl, panes: Object.values(wl).flatMap(w => w.userData.panes), pools, patches, interactives: R.inters, seats: R.seats, blockers: blk, stations: R.stations, routes: R.routes, spawn, exitSpot, windows: R.windows, w: W, d: D, h: H,
        grid,
        applySky(k, ambientBoost) { applySky(built, k); }, dispose() { group.traverse(o => { if (o.geometry) o.geometry.dispose(); if (o.material && o.material.userData.own) { o.material.map && o.material.map.dispose(); o.material.dispose(); } if (o.material && o.userData && (o.userData.pane || o.userData.pool || o.userData.win)) o.material.dispose(); }); } };
      return built;
    };
    return R;
  }


  /* ---------- use-spots: if the default stand-spot of an interactive piece is walled in by a neighbour, move it to the nearest free, reachable
     floor point beside the piece (facing the piece). Pieces that already have a free, reachable spot are left exactly as placed. ---------- */
  function relocateSpots(R, grid, from) {
    const FI = g.FutaInteract, free = (x, z) => { const [ci, cj] = grid.cell(x, z); return ci >= 0 && cj >= 0 && ci < grid.w && cj < grid.h && !grid.blocked[cj * grid.w + ci]; };
    const reaches = (x, z) => { const p = FI.findPath(grid, from, { x, z }); if (!p) return false; const l = p[p.length - 1]; return Math.hypot(l.x - x, l.z - z) <= .5; };
    R.inters.forEach(p => {
      if (free(p.spot.x, p.spot.z) && reaches(p.spot.x, p.spot.z)) return;
      if (R.seats.some(s => s.piece === p) || R.seats.some(s => Math.hypot(s.x - p.spot.x, s.z - p.spot.z) < 2.6)) return;   // seated use: the engine sits the player down
      const bk = R.blockers.find(b => b.piece === p.id); if (!bk) return; const cand = [];
      for (let j = 0; j < grid.h; j++) for (let i = 0; i < grid.w; i++) {
        if (grid.blocked[j * grid.w + i]) continue; const [cx, cz] = grid.center(i, j);
        const dx = Math.max(Math.abs(cx - bk.x) - bk.w / 2, 0), dz = Math.max(Math.abs(cz - bk.z) - bk.d / 2, 0), dist = Math.hypot(dx, dz); if (dist > 1.3) continue;
        cand.push({ x: cx, z: cz, cost: Math.abs(dist - .55) + .35 * Math.hypot(cx - p.spot.x, cz - p.spot.z) });
      }
      cand.sort((a, b) => a.cost - b.cost);
      for (let k = 0; k < Math.min(cand.length, 25); k++) if (reaches(cand[k].x, cand[k].z)) { const c = cand[k]; p.spot = { x: c.x, z: c.z, face: Math.atan2(bk.x - c.x, bk.z - c.z), moved: true }; return; }
    });
  }

  /* ---------- time of day for a built room: window panes, sun patches, lamp pools ---------- */
  const _c = new T.Color();
  function applySky(B, k) {
    const dayPane = _c.setHex(k.horizon).lerp(new T.Color(0xffffff), .35 * (1 - k.night)).clone(); const nightPane = new T.Color(0x0b1130);
    const paneCol = dayPane.clone().lerp(nightPane, Math.min(1, k.night * 1.15)); if (k.phase === 'golden' || (k.phase === 'dusk')) paneCol.lerp(new T.Color(k.sunColor), .25);
    B.panes.forEach(p => p.material.color.copy(paneCol));
    const lampK = Math.min(1, .12 + k.lamps * .95);
    B.pools.forEach(p => { p.material.opacity = Math.min(.8, lampK * (p.userData.pool.strength || .55)); });
    const dir = k.sunDir, up = k.sunUp && dir[1] > .08 && k.sunI > .06;
    B.patches.forEach(pm => {
      const w = pm.userData.win; const nrm = w.wall === 'back' ? [0, -1] : w.wall === 'front' ? [0, 1] : w.wall === 'left' ? [-1, 0] : [1, 0];     // outward normal (x,z)
      const lit = up && (dir[0] * nrm[0] + dir[2] * nrm[1]) > .15; pm.visible = lit; if (!lit) return;
      const along = w.wall === 'back' || w.wall === 'front', wx = along ? w.at : (w.wall === 'left' ? 0 : B.w), wz = along ? (w.wall === 'back' ? 0 : B.d) : w.at;
      // project the window's centre onto the floor along the sun ray (light travels opposite to the sun direction)
      const yc = w.sill + w.h / 2, t = yc / dir[1], fx = wx - dir[0] * t, fz = wz - dir[2] * t;
      const len = Math.min(5.5, Math.hypot(dir[0], dir[2]) / dir[1] * w.h + .6), wid = w.w; const ang = Math.atan2(-dir[0], -dir[2]);
      pm.position.set(fx, .03, fz); pm.rotation.set(-Math.PI / 2, 0, -ang, 'YXZ'); pm.rotation.order = 'YXZ'; pm.rotation.y = ang; pm.rotation.x = -Math.PI / 2; pm.scale.set(wid, len, 1);
      pm.material.color.setHex(k.sunColor); pm.material.opacity = Math.min(.55, k.sunI * .6);
    });
  }

  g.FutaRoom = { create, applySky, floorTex };
})(typeof window !== 'undefined' ? window : globalThis);
