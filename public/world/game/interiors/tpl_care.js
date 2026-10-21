/* Care / community / activity interiors: health_centre, clinic, church, mosque, gym, sports_room (default | tabletennis | grandstand),
   workshop (default | feedmill | power | farm), visitor_centre.  Also defines its own furniture (all names prefixed cr_). No ATMs here (banks only). */
(function (g) {
  'use strict';
  const D = g.FutaTemplates, F = g.FutaFurn, { SEC, CLEAN } = D, P = F.P, pick = F.pick;
  const PI = Math.PI;

  /* ====================================================================== custom furniture */
  // church pew with real seats (rot 0 → sitters face +z; use rot 180 to face the altar on the back wall)
  F.def('cr_pew', { size: [3.5, .7], seat: null,
    _seatN(o) { const n = o.n || 4, a = []; for (let i = 0; i < n; i++) a.push({ x: (i - (n - 1) / 2) * .55, z: .02, face: 0, y: .46 }); return a; },
    draw(b, o) { const n = o.n || 4, L = n * .55 + .2, c = o.c || '#8a5a34'; this.size = [L, .7];
      b.box(0, .42, .02, L, .05, .46, c); b.box(0, .5, -.22, L - .1, .5, .05, c); b.box(0, .98, -.22, L, .05, .09, P.dark);
      for (const s of [-1, 1]) { b.box(s * (L / 2 - .04), 0, -.02, .08, .95, .56, P.dark); b.box(s * (L / 2 - .04), .95, -.02, .1, .05, .58, '#4a3020'); }
      b.box(0, 0, .26, L - .1, .12, .12, P.dark); b.box(0, .12, .3, L - .2, .06, .1, '#7a2a30');          // kneeler
      b.box(0, .28, -.3, L - .2, .18, .1, '#6b4428');                                                     // hymnal shelf of the pew behind
      for (let i = 0; i < n; i++) b.box((i - (n - 1) / 2) * .55 + .05, .47, .0, .3, .02, .22, i % 2 ? '#7a2a30' : '#b08a3a', { ao: false }); } });
  // raised spectator row (grandstand); o.h = riser height; sitters face +z at rot 0
  F.def('cr_tierrow', { size: [2.5, 1.0], seat: null,
    _seatN(o) { const n = o.n || 5, h = o.h || .3, a = []; for (let i = 0; i < n; i++) a.push({ x: (i - (n - 1) / 2) * .5, z: .12, face: 0, y: h + .42 }); return a; },
    draw(b, o) { const n = o.n || 5, h = o.h || .3, L = n * .5, c = o.c || '#c0392b'; this.size = [L, 1.0];
      b.box(0, 0, 0, L, h, 1.0, '#b7b1a3'); b.box(0, h, .5, L, .03, .03, '#8d8878');
      for (let i = 0; i < n; i++) { const x = (i - (n - 1) / 2) * .5; b.box(x, h, .12, .44, .4, .4, pick([c, c, c, '#f2f2f2'], i + (o.seed || 0))); b.box(x, h + .4, -.12, .44, .38, .07, c); } } });
  // mosque: minbar (steps up to a small canopy), geometric wall panel, Qur'an stand, hanging stained-glass style panel
  F.def('cr_minbar', { size: [1.0, 2.2],
    draw(b, o) { const c = o.c || '#e9e0c8', c2 = o.c2 || '#2f6f5f';
      for (const s of [-1, 1]) b.box(s * .45, 0, 0, .1, 1.1, 2.1, c);
      for (let i = 0; i < 5; i++) b.box(0, 0, .85 - i * .35, .8, .2 + i * .17, .33, i % 2 ? c : '#d8ccaa');
      b.box(0, 1.0, -.82, .8, .1, .45, c2); for (const s of [-1, 1]) b.box(s * .42, 1.1, -.82, .08, 1.2, .08, c2);
      b.box(0, 2.3, -.82, .96, .1, .6, c2); b.cyl(0, 2.4, -.82, .3, .25, '#d9b24a', { seg: 12, r2: .08 }); b.box(0, 1.1, -1.03, .8, 1.2, .05, '#1d4d42'); } });
  F.def('cr_geopanel', { size: [1.3, .1], wall: true, blocker: false,
    draw(b, o) { const w = o.w || 1.3, h = o.h || 1.6, y = o.y || 1.0, c = o.c || '#2f6f5f', c2 = o.c2 || '#e9dfc8', gold = '#d9b24a'; b.box(0, y, -.03, w, h, .04, c2);
      const cols = Math.max(1, Math.round(w / .43)), rows = Math.max(1, Math.round(h / .43)), cw = w / cols, ch = h / rows;
      for (let i = 0; i < cols; i++) for (let j = 0; j < rows; j++) { const x = -w / 2 + cw * (i + .5), yy = y + ch * j; b.box(x, yy + .03, -.005, cw - .06, ch - .06, .02, c, { ao: false }); b.box(x, yy + .09, .008, cw - .18, ch - .18, .02, c2, { ao: false }); b.box(x, yy + ch / 2 - .06, .02, .12, .12, .02, (i + j) % 2 ? gold : c, { ao: false }); }
      b.box(0, y - .03, -.01, w + .06, .04, .06, gold); b.box(0, y + h - .01, -.01, w + .06, .04, .06, gold); } });
  F.def('cr_quranstand', { size: [.6, .45],
    draw(b, o) { b.box(0, 0, 0, .5, .05, .4, P.dark); b.box(0, .05, 0, .06, .4, .06, P.walnut); b.box(0, .45, .02, .5, .03, .3, P.walnut); b.box(0, .48, .02, .44, .05, .26, '#f1ead6'); b.box(0, .5, .02, .02, .04, .26, '#2f6f5f'); b.box(-.1, .52, .02, .18, .01, .22, '#fffdf3', { ao: false }); } });
  F.def('cr_wudu', { size: [2.6, .5], blocker: true,
    draw(b, o) { const n = o.n || 4, L = n * .65; this.size = [L, .5]; b.box(0, 0, -.05, L, .85, .3, '#cfd8d6'); b.box(0, .85, -.05, L + .04, .06, .34, '#f1ece0'); b.box(0, .06, .12, L, .06, .12, '#9fb6b0');
      for (let i = 0; i < n; i++) { const x = (i - (n - 1) / 2) * .65; b.cyl(x, 1.0, -.2, .02, .16, P.steel, { seg: 6 }); b.box(x, 1.1, -.12, .03, .03, .1, P.steel); b.box(x, .12, .2, .3, .02, .3, '#e9e3d4', { ao: false }); b.cyl(x, 0, .3, .12, .3, '#e8e2d0', { seg: 8 }); b.cyl(x, .3, .3, .13, .04, '#2f6f5f', { seg: 8 }); } } });
  // church: wall cross (scalable), stained-glass panel, flower stand, candle stand
  F.def('cr_bigcross', { size: [1.4, .1], wall: true, blocker: false,
    draw(b, o) { const s = o.s || 1, y = o.y || 1.6, c = o.c || '#d9b24a'; b.box(0, y, -.03, .22 * s, 2.3 * s, .06, c); b.box(0, y + 1.5 * s, -.03, 1.2 * s, .22 * s, .06, c); b.box(0, y + .1 * s, -.06, .1 * s, 2.0 * s, .02, '#fff0b0', { layer: 'glow', shade: .7 }); b.box(0, y + 1.55 * s, -.06, 1.0 * s, .1 * s, .02, '#fff0b0', { layer: 'glow', shade: .7 }); } });
  F.def('cr_stained', { size: [1.0, .1], wall: true, blocker: false,
    draw(b, o) { const w = o.w || 1.0, h = o.h || 2.2, y = o.y || 1.0, cols = ['#d94a3a', '#2f6fd0', '#e8b63a', '#3aa05a', '#8a3fb0', '#e07a30'], nx = 3, ny = Math.round(h / .38), cw = w / nx, ch = (h - .35) / ny;
      b.box(0, y, -.03, w + .12, h + .06, .04, '#5a3a24');
      for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) b.box(-w / 2 + cw * (i + .5), y + .03 + ch * j, -.005, cw - .04, ch - .04, .02, pick(cols, i * 3 + j * 5 + (o.seed || 0)), { layer: 'glow', shade: .72, ao: false });
      b.cyl(0, y + h - .35, -.005, w / 2 - .02, .03, pick(cols, 2 + (o.seed || 0)), { layer: 'glow', seg: 14, shade: .72 }); b.box(0, y + h / 2, .0, .04, h - .2, .03, '#5a3a24'); } });
  F.def('cr_flowers', { size: [.6, .6],
    draw(b, o) { b.cyl(0, 0, 0, .2, .75, '#f1ece0', { seg: 10, r2: .15 }); b.cyl(0, .75, 0, .24, .05, '#d9b24a', { seg: 10 }); for (let i = 0; i < 9; i++) { const a = i * 2.2, r = .06 + (i % 3) * .06; b.sph(Math.cos(a) * r, .95 + (i % 4) * .08, Math.sin(a) * r, .09, pick(['#f2f2f2', '#e8506a', '#f4c63a', '#f08ab0', '#ffffff'], i), { seg: 6 }); } b.sph(0, .88, 0, .15, '#3f8f4f', { seg: 7 }); } });
  F.def('cr_candles', { size: [.4, .4],
    draw(b, o) { b.cyl(0, 0, 0, .14, .03, '#d9b24a', { seg: 10 }); b.cyl(0, 0, 0, .02, 1.0, '#d9b24a', { seg: 6 }); b.cyl(0, 1.0, 0, .14, .02, '#d9b24a', { seg: 10 }); for (let i = 0; i < 3; i++) { const x = (i - 1) * .08; b.cyl(x, 1.02, 0, .018, .14, '#f7f3e6', { seg: 6 }); b.sph(x, 1.18, 0, .018, '#ffd27a', { layer: 'glow', seg: 5 }); } } });
  // health
  F.def('cr_medcab', { size: [1.1, .45],
    draw(b, o) { b.box(0, 0, 0, 1.1, 1.9, .42, '#eef3f2'); b.box(0, .95, .215, 1.0, .9, .01, P.glass, { layer: 'glass' }); b.box(0, .1, .215, 1.0, .75, .01, '#d9e4e1');
      for (const y of [1.2, 1.5, 1.8]) b.box(0, y - .04, .05, 1.0, .02, .3, P.steel);
      for (let k = 0; k < 3; k++) for (let i = 0; i < 6; i++) b.cyl(-.42 + i * .17, 1.0 + k * .3 + .02, .06, .045, .15 + (i % 2) * .05, pick(['#e8a33a', '#f3f0ea', '#3d8a4c', '#3d5a80', '#b3362e'], i + k * 2), { seg: 6 });
      b.box(0, 1.84, .22, .5, .08, .01, '#1f7a74', { ao: false }); b.box(0, 1.855, .23, .06, .05, .01, '#ffffff', { ao: false }); b.box(0, 1.855, .23, .2, .015, .01, '#ffffff', { ao: false }); }, spot: [0, .85, PI] });
  F.def('cr_cross_green', { size: [.5, .1], wall: true, blocker: false, draw(b, o) { const y = o.y || 1.9; b.box(0, y, -.02, .16, .5, .03, '#2f9a5a', { layer: 'glow', shade: .8 }); b.box(0, y + .17, -.02, .5, .16, .03, '#2f9a5a', { layer: 'glow', shade: .8 }); } });
  F.def('cr_bin', { size: [.4, .4], blocker: false, draw(b, o) { b.cyl(0, 0, 0, .15, .5, o.c || '#e0b62a', { seg: 10, r2: .17 }); b.cyl(0, .5, 0, .18, .03, P.dgrey, { seg: 10 }); } });
  // gym
  F.def('cr_mirrorwall', { size: [4, .1], wall: true, blocker: false,
    draw(b, o) { const w = o.w || 4, n = Math.max(1, Math.round(w / 1.3)), pw = w / n; b.box(0, .25, -.03, w + .1, 2.1, .04, '#22262c');
      for (let i = 0; i < n; i++) { const x = -w / 2 + pw * (i + .5); b.box(x, .32, -.005, pw - .06, 1.95, .02, '#cfe6f0', { layer: 'glow', shade: .68, ao: false }); b.box(x, .32, .006, pw * .35, 1.95, .01, '#ecf8fc', { layer: 'glow', shade: .5, ao: false }); } b.box(0, 1.0, .03, w, .04, .05, P.steel); } });
  F.def('cr_squatrack', { size: [2.0, 1.5],
    draw(b, o) { for (const s of [-1, 1]) { b.box(s * .8, 0, -.5, .08, 2.1, .08, P.dgrey); b.box(s * .8, 0, .5, .08, 2.1, .08, P.dgrey); b.box(s * .8, 0, 0, .06, .06, 1.05, P.dgrey); b.box(s * .8, 2.0, 0, .06, .1, 1.05, P.dgrey); b.box(s * .8, 1.25, -.5, .1, .06, .12, P.red); b.box(s * .8, 1.25, .5, .1, .06, .12, P.red); }
      b.bar(0, 1.32, -.5, 1.9, .02, P.steel); b.bar(0, 1.32, .5, 1.9, .02, P.steel); for (const s of [-1, 1]) for (const zz of [-.5, .5]) { b.cyl(s * .55, 1.1, zz, .22, .05, P.black, { seg: 12 }); } b.box(0, .1, 0, 1.9, .03, 1.3, '#3a3d42', { ao: false }); }, spot: [0, 1.0, PI] });
  F.def('cr_cable', { size: [2.6, .9],
    draw(b, o) { for (const s of [-1, 1]) { b.box(s * 1.15, 0, 0, .12, 2.2, .5, P.dgrey); b.box(s * 1.15, 1.6, .26, .1, .14, .02, '#ff6a4c', { layer: 'glow' }); b.box(s * 1.0, .15, 0, .2, .5, .3, P.steel); } b.box(0, 2.1, 0, 2.4, .12, .5, P.dgrey); b.box(0, 0, -.1, 2.3, .08, .5, P.black); b.box(0, 0, 0, 2.4, .05, .8, '#2a2d32', { ao: false }); b.bar(0, 1.5, .05, .8, .015, P.steel); } , spot: [0, 1.0, PI] });
  F.def('cr_kettlebells', { size: [1.4, .55],
    draw(b, o) { b.box(0, 0, 0, 1.4, .08, .5, P.dgrey); b.box(0, .35, 0, 1.4, .05, .5, P.dgrey); for (const s of [-1, 1]) b.box(s * .66, 0, 0, .06, .8, .5, P.dgrey); for (let i = 0; i < 5; i++) { const r = .09 + i * .008, x = -.52 + i * .26; b.sph(x, .08 + r, 0, r, P.black, { seg: 8 }); b.box(x, .08 + r * 1.7, 0, r * 1.2, .02, .03, P.black); b.sph(x, .35 + .05 + r, 0, r, '#b3362e', { seg: 8 }); } }, spot: [0, .8, PI] });
  F.def('cr_lockers', { size: [1.6, .5],
    draw(b, o) { const n = Math.round((o.w || 1.6) / .4), L = n * .4; this.size = [L, .5]; for (let i = 0; i < n; i++) { const x = (i - (n - 1) / 2) * .4; b.box(x, 0, 0, .38, 1.9, .48, pick(['#e0662e', '#2f5f9a', '#3a3d42'], i + (o.seed || 0))); b.box(x, 1.45, .245, .26, .2, .01, '#2a2d32', { ao: false }); b.box(x + .12, 1.0, .25, .03, .12, .02, P.steel); } } });
  F.def('cr_scoreboard', { size: [2.6, .1], wall: true, blocker: false,
    draw(b, o) { const y = o.y || 2.3, w = o.w || 2.6; b.box(0, y, -.04, w, .9, .08, '#16181c'); b.box(-w * .3, y + .1, .01, w * .28, .5, .01, '#ffc83a', { layer: 'glow', shade: .85 }); b.box(w * .3, y + .1, .01, w * .28, .5, .01, '#ffc83a', { layer: 'glow', shade: .85 }); b.box(0, y + .12, .01, .12, .45, .01, '#ff4c3a', { layer: 'glow', shade: .85 }); b.box(0, y + .72, .01, w * .8, .08, .01, '#e8f0f0', { ao: false }); } });
  F.def('cr_stall', { size: [3.0, 1.0],
    draw(b, o) { const w = o.w || 3, c = o.c || '#c0392b'; this.size = [w, 1.0]; b.box(0, 0, .1, w, 1.0, .6, '#3a4a5a'); b.box(0, 1.0, .1, w + .08, .05, .68, '#e9e4d8'); b.box(0, 0, .42, w - .1, .9, .02, '#2d3b4a');
      for (const s of [-1, 1]) b.box(s * (w / 2 - .05), 1.0, -.2, .08, 1.4, .08, P.dgrey); const n = Math.round(w / .3); for (let i = 0; i < n; i++) b.box(-w / 2 + .15 + i * .3, 2.35, -.1, .3, .1, 1.0, i % 2 ? '#f2f2f2' : c, { shade: .96 });
      for (let i = 0; i < 6; i++) b.cyl(-w / 2 + .4 + i * (w - .8) / 5, 1.05, .1, .05, .22, pick(['#f2c33a', '#d94a3a', '#3a8fd9', '#f4f4f4'], i), { seg: 8 }); } });
  // workshop / feed mill / power room / farm
  F.def('cr_workbench', { size: [2.0, .8],
    draw(b, o) { const w = o.w || 2.0; this.size = [w, .8]; b.box(0, .85, 0, w, .06, .75, '#9a7a4a'); for (const s of [-1, 1]) { b.box(s * (w / 2 - .06), 0, 0, .08, .85, .7, '#4a3a2a'); } b.box(0, .12, 0, w - .2, .05, .65, '#6b5538'); b.box(0, .4, -.28, w - .2, .04, .1, '#6b5538');
      b.box(-w / 2 + .25, .91, .1, .22, .1, .12, '#c0392b'); b.box(-w / 2 + .25, 1.0, .1, .06, .16, .04, P.steel); b.box(.2, .91, 0, .5, .03, .3, '#5a6572'); b.cyl(.55, .91, .1, .06, .1, '#e0b62a', { seg: 8 }); b.box(-.2, .91, -.1, .16, .06, .3, P.dgrey); b.box(.7, .91, .2, .22, .04, .08, P.steel); } });
  F.def('cr_toolwall', { size: [2.4, .1], wall: true, blocker: false,
    draw(b, o) { const w = o.w || 2.4, y = o.y || .9; b.box(0, y, -.03, w, 1.2, .03, '#6b5538'); for (let i = 0; i < 9; i++) { const x = -w / 2 + .2 + i * (w - .4) / 8; b.box(x, y + .2 + (i % 3) * .3, .0, .05, .35 + (i % 2) * .15, .03, pick(['#c0392b', P.steel, '#e0b62a', P.dgrey, '#2f5f9a'], i)); b.box(x, y + .55 + (i % 3) * .3, .0, .14, .05, .03, P.steel); } } });
  F.def('cr_hopper', { size: [1.9, 1.9],
    draw(b, o) { const c = o.c || '#8b929a'; for (const sx of [-1, 1]) for (const sz of [-1, 1]) b.box(sx * .8, 0, sz * .8, .1, 1.6, .1, P.dgrey); b.box(0, 1.6, 0, 1.8, .6, 1.8, c); b.cyl(0, 1.0, 0, .9, .6, c, { seg: 4, r2: .15 }); b.cyl(0, .85, 0, .14, .3, P.dgrey, { seg: 8 }); b.box(0, 2.2, 0, 1.9, .06, 1.9, P.dgrey); b.box(0, 1.7, .91, .5, .3, .02, '#e0b62a'); b.box(.7, 0, 0, .06, 2.2, .06, P.steel); b.box(0, .0, 0, 1.5, .03, 1.5, '#7a6a50', { ao: false }); } });
  F.def('cr_conveyor', { size: [3.4, .7],
    draw(b, o) { const L = o.w || 3.4; this.size = [L, .7]; b.box(0, .75, 0, L, .12, .6, P.dgrey); b.box(0, .87, 0, L - .1, .02, .5, '#1a1a1a'); for (let i = 0; i < 5; i++) { const x = -L / 2 + .3 + i * (L - .6) / 4; b.box(x, 0, -.2, .06, .75, .06, P.steel); b.box(x, 0, .2, .06, .75, .06, P.steel); } for (let i = 0; i < 3; i++) b.box(-L / 2 + .6 + i * .9, .89, 0, .4, .22, .34, '#d8c79a', { shade: .95 }); } });
  F.def('cr_drums', { size: [1.1, .9],
    draw(b, o) { const cs = o.cs || ['#2f5f9a', '#c0392b', '#3a8a4c', '#e0b62a']; for (let i = 0; i < 4; i++) { const x = (i % 2 - .5) * .5, z = (Math.floor(i / 2) - .5) * .45; b.cyl(x, 0, z, .24, .9, pick(cs, i + (o.seed || 0)), { seg: 12 }); b.cyl(x, .45, z, .245, .04, P.dgrey, { seg: 12 }); b.cyl(x, .88, z, .22, .03, P.dgrey, { seg: 12 }); } } });
  F.def('cr_cablereel', { size: [1.0, .6],
    draw(b, o) { for (const s of [-1, 1]) b.cyl(0, 0, 0, .0, 0, '#000', { seg: 3 }); b.box(0, 0, 0, .8, .05, .5, '#8a6a42'); for (const s of [-1, 1]) { b.cyl(s * .26, .35, 0, .36, .04, '#9a7a4a', { seg: 14 }); } b.cyl(0, .35, 0, .26, .48, '#202428', { seg: 12 }); b.cyl(0, .35, 0, .07, .5, '#8a6a42', { seg: 8 }); b.box(.38, 0, 0, .02, .02, .02, '#000'); } });
  F.def('cr_extinguisher', { size: [.3, .1], wall: true, blocker: false, draw(b, o) { b.box(0, 1.0, -.03, .3, .5, .02, '#f3f0ea'); b.cyl(0, 1.0, .02, .07, .38, '#c0392b', { seg: 10 }); b.cyl(0, 1.38, .02, .03, .08, P.black, { seg: 8 }); } });
  F.def('cr_wheelbarrow', { size: [.7, 1.4], draw(b, o) { b.box(0, .4, .1, .55, .25, .7, '#2f8a55'); b.cyl(0, 0, .5, .2, .05, P.black, { seg: 10 }); for (const s of [-1, 1]) { b.box(s * .24, .3, -.25, .04, .04, .8, '#8a6a42'); b.box(s * .24, 0, -.6, .04, .3, .04, '#8a6a42'); } b.sph(0, .62, .1, .26, '#6a4a2a', { sy: .5, seg: 8 }); } });
  F.def('cr_hay', { size: [1.3, .9], draw(b, o) { for (let i = 0; i < 3; i++) { const x = (i % 2 - .25) * .6, y = Math.floor(i / 2) * .4; b.box(x, y, 0, .6, .4, .8, '#d9b84a', { shade: .95 }); b.box(x, y + .13, 0, .62, .02, .82, '#b8963a'); b.box(x, y + .28, 0, .62, .02, .82, '#b8963a'); } } });
  F.def('cr_cart', { size: [.9, .6], blocker: true, draw(b, o) { b.box(0, .35, 0, .8, .06, .5, '#9a7a4a'); for (const s of [-1, 1]) b.cyl(s * .38, 0, .3, .18, .04, '#3a2a20', { seg: 12 }); b.box(0, .4, -.22, .8, .3, .04, '#9a7a4a'); b.box(0, .4, .22, .8, .3, .04, '#9a7a4a'); b.box(0, 0, 0, .06, .35, .06, P.dark); b.sph(-.2, .55, 0, .14, '#e0662e', { seg: 7 }); b.sph(.1, .55, .05, .14, '#3a8a4c', { seg: 7 }); b.sph(.28, .55, -.05, .12, '#e5b93a', { seg: 7 }); } });
  // visitor centre
  F.def('cr_terrarium', { size: [1.4, .65],
    draw(b, o) { const k = o.kind || 'snake'; b.box(0, 0, 0, 1.4, .55, .6, '#3a2a20'); b.box(0, .55, 0, 1.46, .05, .66, '#2a1e18'); b.box(0, .6, 0, 1.36, .05, .56, '#d8c08a'); b.box(0, .65, 0, 1.36, .75, .56, P.glass, { layer: 'glass' }); b.box(0, 1.42, 0, 1.46, .06, .66, '#2a1e18');
      b.box(0, 1.37, 0, 1.2, .02, .3, '#fff1b0', { layer: 'glow', shade: .8 }); b.box(-.45, .65, -.1, .4, .22, .3, '#7a746a'); b.sph(-.5, .9, -.1, .15, '#8a8478', { seg: 6 }); b.cyl(.45, .65, -.15, .02, .5, '#6b4a2a', { seg: 5 }); b.sph(.45, 1.2, -.15, .2, '#3f8f4f', { seg: 7 });
      if (k === 'snake') { for (let i = 0; i < 9; i++) { const a = i * .8; b.sph(Math.cos(a) * (.28 - i * .015) + .1, .68 + i * .004 + (i > 6 ? .06 : 0), Math.sin(a) * (.14 - i * .008), .06, i % 2 ? '#e0a42e' : '#4a6a2a', { seg: 6 }); } b.sph(.12, .78, .0, .07, '#4a6a2a', { seg: 6 }); }
      else if (k === 'lizard') { b.box(.2, .66, .05, .36, .05, .12, '#6aa84a'); b.sph(.42, .7, .05, .07, '#6aa84a', { seg: 6 }); b.box(.0, .66, .05, .22, .02, .05, '#4a8a3a'); b.box(-.1, .66, .05, .15, .04, .04, '#6aa84a'); }
      else if (k === 'tortoise') { b.sph(.1, .78, .05, .22, '#6a5a2a', { sy: .6, seg: 8 }); b.sph(.34, .72, .05, .06, '#8a9a5a', { seg: 6 }); }
      else { b.sph(.2, .72, .05, .09, '#4aa06a', { sy: .8, seg: 6 }); b.sph(.28, .8, .05, .04, '#4aa06a', { seg: 5 }); b.cyl(-.1, .65, .1, .22, .02, '#5aa0c0', { seg: 10, layer: 'glass' }); } }, spot: [0, .85, PI] });
  F.def('cr_aquarium', { size: [1.8, .65],
    draw(b, o) { b.box(0, 0, 0, 1.8, .7, .6, '#2b3a44'); b.box(0, .7, 0, 1.86, .05, .66, '#1c2630'); b.box(0, .75, 0, 1.76, .05, .56, '#d8c898'); b.box(0, .8, 0, 1.76, .85, .56, '#6fc2e0', { layer: 'glass', shade: .85 }); b.box(0, 1.65, 0, 1.86, .06, .66, '#1c2630'); b.box(0, 1.6, 0, 1.6, .02, .3, '#bfe8ff', { layer: 'glow', shade: .8 });
      for (let i = 0; i < 3; i++) { b.cyl(-.6 + i * .6, .8, -.15, .02, .35 + i * .1, '#2f9a5a', { seg: 5 }); b.sph(-.6 + i * .6, 1.15 + i * .1, -.15, .12, '#2f9a5a', { seg: 6, sy: 1.6 }); }
      b.sph(.55, .85, .0, .14, '#8a8478', { seg: 6 }); for (let i = 0; i < 7; i++) b.sph(-.7 + i * .24, 1.0 + (i % 3) * .18, .05 + (i % 2) * .08, .045, pick(['#ff8a2a', '#ffd23a', '#ffffff', '#3a8fd9'], i), { seg: 5, sy: .7, layer: 'glow', shade: .85 }); }, spot: [0, .85, PI] });
  F.def('cr_infoboard', { size: [1.4, .1], wall: true, blocker: false,
    draw(b, o) { const w = o.w || 1.4, y = o.y || 1.0, c = o.c || '#2f6f5f'; b.box(0, y, -.03, w, 1.3, .04, '#3a2a20'); b.box(0, y + .05, -.005, w - .1, 1.2, .02, '#f3efe2', { ao: false }); b.box(0, y + .95, .01, w - .1, .3, .02, c, { ao: false });
      b.box(-w * .2, y + .35, .01, w * .5, .5, .02, pick(['#6aa8d0', '#d0a86a', '#7fc08a'], o.seed || 0), { ao: false }); b.sph(-w * .2, y + .6, .03, .1, '#3a2a20', { seg: 6 }); b.box(-w * .2, y + .35, .03, .3, .15, .02, '#3a2a20');
      for (let i = 0; i < 4; i++) b.box(w * .27, y + .75 - i * .14, .01, w * .26, .04, .01, '#6a6a6a', { ao: false }); } });
  F.def('cr_giftshelf', { size: [1.6, .5],
    draw(b, o) { const w = 1.6; b.box(0, 0, -.1, w, 1.7, .05, '#e9dfc8'); for (const s of [-1, 1]) b.box(s * (w / 2 - .02), 0, 0, .04, 1.7, .4, '#b07a4a');
      for (let r = 0; r < 4; r++) { b.box(0, .1 + r * .45, 0, w, .04, .4, '#b07a4a'); for (let i = 0; i < 5; i++) { const x = -.6 + i * .3, c = pick(['#e0a42e', '#c8c8c8', '#8a5a34', '#f08ab0', '#4aa06a', '#e0662e'], i + r * 3 + (o.seed || 0)); b.sph(x, .24 + r * .45, 0, .1, c, { seg: 6 }); b.sph(x, .37 + r * .45, 0, .065, c, { seg: 6 }); } } } });
  F.def('cr_lion', { size: [1.3, .9], draw(b, o) { b.box(0, 0, 0, 1.2, .35, .8, '#cfc6b2'); b.box(0, .35, 0, 1.0, .08, .6, '#b0a68e'); b.box(-.08, .43, 0, .7, .4, .32, '#c9923a'); b.sph(.38, .85, .0, .2, '#c9923a', { seg: 8 }); b.sph(.38, .85, .0, .27, '#8a5a24', { seg: 8, sz: 1.0, sy: 1.05 }); b.sph(.4, .86, .0, .17, '#d9a44a', { seg: 8 }); b.box(.55, .78, 0, .05, .06, .1, '#3a2a20'); for (const sz of [-1, 1]) { b.box(.3, .43, sz * .14, .1, .0, .1, '#c9923a'); b.box(-.3, .43, sz * .14, .1, .0, .1, '#c9923a'); } b.box(-.5, .5, 0, .3, .05, .05, '#b07a30'); b.sph(-.66, .5, 0, .06, '#6a4a1a', { seg: 5 }); }, spot: [0, .9, PI] });

  const BRIGHT = ['#c9423a', '#2f6fd0', '#e8b63a', '#3aa05a', '#8a3fb0'];
  const room = (R, key, val) => { R.theme[key] = val; };
  const setWindows = (R, list) => { R.windows.length = 0; list.forEach(w => R.windows.push(Object.assign({ w: 1.4, h: 1.25, sill: 1.0 }, w))); };

  /* ====================================================================== HEALTH CENTRE */
  D.def('health_centre', {
    title: 'Health Centre', icon: '🏥', w: 14, d: 10, h: 3.2, venue: 'health_centre', doorAt: 7, security: true,
    theme: { floor: { type: 'tile', c1: '#eef3f2', c2: '#d6e4e2' }, wall: '#f4f8f7', wainscot: '#3a9a96', trim: '#ffffff', curtain: '#3d9a6a', frame: '#ffffff' },
    windows: [{ wall: 'back', at: 7.0, w: 1.4 }, { wall: 'left', at: 2.2, w: 1.4 }, { wall: 'right', at: 6.2, w: 1.4 }, { wall: 'right', at: 8.9, w: 1.0 }, { wall: 'front', at: 2.0, w: 1.4 }],
    build(R, C) {
      const teal = '#2f9a96', green = '#4aa86a';
      // dispensary along the back-left: shelves + medicine cabinets + counter hatch
      R.against('shelf', 'back', 1.0, { w: 1.2, c: '#e9eeee' }); R.against('shelf', 'back', 2.3, { w: 1.2, c: '#e9eeee' }); R.against('cr_medcab', 'back', 3.7); R.against('cr_medcab', 'back', 4.9);
      R.add('counter', 3.0, 2.0, 0, { w: 4.2, c: teal, c2: '#f4f1ea' });
      // vitals corner + doctor's consulting desk + exam couch with screens
      R.against('scale', 'back', 6.2); R.against('bpmachine', 'back', 6.9, { gap: .1 }); R.add('desk', 8.6, 1.9, 0, { w: 1.5, c: '#e9e4d8', c2: '#c9d6d4' }); R.add('chair', 8.6, 2.75, 180, { c: teal }); R.add('chair', 7.6, 1.2, 270, { c: '#3a4a52' });
      R.against('medbed', 'back', 10.7, { c: green }); R.add('curtainscreen', 10.7, 2.3, 0, { c: green }); R.add('curtainscreen', 10.05, 1.1, 90, { c: green }); R.add('curtainscreen', 11.35, 1.1, 90, { c: green });
      // ward bay on the right wall: three beds with green curtains between
      [3.4, 4.9, 6.4].forEach(z => R.against('medbed', 'right', z, { c: green }));
      [4.15, 5.65].forEach(z => R.add('curtainscreen', 12.95, z, 0, { c: green })); R.add('curtainscreen', 12.95, 2.65, 0, { c: green }); R.add('curtainscreen', 12.95, 7.15, 0, { c: green });
      R.add('trolley', 11.2, 7.4, 20); R.add('cr_bin', 13.4, 8.1, 0); R.against('basin', 'right', 9.0); R.against('dispenser', 'right', 9.8, { gap: .0 });
      // waiting area (front-left) + reception
      R.add('rug', 3.0, 7.1, 0, { w: 4.4, d: 3.0, c: '#bfdcd8', c2: '#f4f1ea' });
      R.against('sofa', 'left', 5.7, { c: teal, c2: '#1f6a68', n: 2 }); R.against('sofa', 'left', 7.7, { c: teal, c2: '#1f6a68', n: 2 });
      R.add('coffeetable', 2.2, 6.7, 90, {}); R.add('armchair', 4.3, 5.9, 270, { c: '#e8e4d8' }); R.add('armchair', 4.3, 7.6, 270, { c: '#e8e4d8' });
      R.add('plant', .5, 9.4, 0); R.add('palm', 5.4, 9.4, 0);
      R.add('reception', 8.9, 5.0, 0, { w: 2.8, c: teal, c2: '#f4f1ea' }); R.add('chair', 8.9, 4.2, 0, { c: '#e8e4d8' }); R.add('printer', 9.9, 4.2, 0);
      R.add('queuerope', 7.2, 6.5, 0, { n: 2 }); R.add('lamp', 12.8, 9.4, 0);
      // wall decor
      R.onWall('noticeboard', 'back', 13.0, { w: 1.2 }); R.onWall('wallclock', 'back', 5.6); R.onWall('cr_cross_green', 'back', 9.6, { y: 2.2 }); R.onWall('cr_cross_green', 'left', 2.9, { y: 2.2 });
      R.onWall('wallpic', 'left', 9.0, { w: 1.1, h: .7, c: '#8fc9c0' }); R.onWall('wallpic', 'right', 1.2, { w: 1.0, h: .7, c: '#9ac6e0' }); R.onWall('bannerhang', 'front', 11.0, { w: 1.2, c: teal, c2: '#ffffff' });
      R.sign(C.title.toUpperCase(), 7.0, 2.65, .1, 5.2, .5, 0, { bg: teal, fg: '#ffffff' });
      R.sign('RECEPTION', 8.9, 2.1, 4.6, 1.3, .3, 0, { bg: '#ffffff', fg: teal }); R.sign('PHARMACY', 3.0, 2.4, .12, 1.8, .32, 0, { bg: '#ffffff', fg: teal });
      R.ceilingLights(3, 2, { color: '#f4fbff' });
    },
    npcs: [
      SEC(6.1, 9.2, 0), D.PATROL([[1.5, 9.0], [5.0, 9.0], [5.0, 7.0], [1.8, 6.9]], { hours: 'service' }),
      { role: 'pharmacist', n: 1, beh: 'post', at: [[3.0, 1.05, 0]], pose: 'talk', hours: 'service' },
      { role: 'staff', n: 1, beh: 'post', at: [[8.0, 4.1, 0]], pose: 'type', hours: 'service', tag: 'receptionist' },
      { role: 'staff', n: 1, beh: 'post', at: [[9.3, .85, 0]], pose: 'talk', hours: 'service', tag: 'doctor' },
      { role: 'nurse', n: 2, beh: 'post', at: [[11.55, 5.5, 1.57], [11.55, 2.4, 1.57]], pose: 'talk', hours: 'service' },
      { role: 'nurse', n: 1, beh: 'wander', zone: [8, 6.6, 12, 9], pose: 'idle', hours: 'service' },
      { role: 'student', n: 3, beh: 'sit', sit: ['sofa', 'armchair'], hours: 'service' },
      { role: 'student', n: 1, beh: 'stand', at: [[7.2, 7.4, 0]], pose: 'phone', hours: 'service' },
      CLEAN([1.5, 5.5, 11, 9.3], { hours: 'clean' })
    ]
  });

  /* ====================================================================== CLINIC */
  D.def('clinic', {
    title: 'Clinic', icon: '⚕️', w: 10, d: 8, h: 3.0, venue: 'clinic', doorAt: 5,
    theme: { floor: { type: 'tile', c1: '#f1efe8', c2: '#dfe6ea' }, wall: '#f6f4ee', wainscot: '#4a7fb0', trim: '#ffffff', curtain: '#4a7fb0', frame: '#ffffff' },
    windows: [{ wall: 'back', at: 2.2, w: 1.3 }, { wall: 'back', at: 7.8, w: 1.3 }, { wall: 'left', at: 5.4, w: 1.2 }, { wall: 'right', at: 4.0, w: 1.2 }],
    build(R, C) {
      const blue = '#4a7fb0';
      R.against('cr_medcab', 'back', 4.0); R.against('cr_medcab', 'back', 5.2); R.against('fridge', 'back', 6.2, {}); R.against('scale', 'back', 1.0); R.against('bpmachine', 'back', 1.7, { gap: .1 });
      R.add('desk', 2.4, 2.4, 0, { w: 1.5, c: '#e9e4d8', c2: '#c9d6e4' }); R.add('chair', 2.4, 3.2, 180, { c: blue }); R.add('chair', 1.5, 1.8, 270, { c: '#3a4a52' });
      R.against('medbed', 'right', 2.2, { c: blue }); R.add('curtainscreen', 8.9, 3.0, 0, { c: blue }); R.add('curtainscreen', 8.9, 1.4, 0, { c: blue }); R.add('trolley', 7.3, 2.9, 10);
      R.add('reception', 7.2, 5.3, 0, { w: 2.2, c: blue, c2: '#f4f1ea' }); R.add('chair', 7.2, 4.6, 0, { c: '#e8e4d8' });
      R.add('rug', 2.5, 5.7, 0, { w: 3.0, d: 2.0, c: '#c8d8e8', c2: '#f4f1ea' }); R.against('sofa', 'left', 5.4, { c: blue, c2: '#2b5a88', n: 2 }); R.add('chair', 3.3, 6.9, 180, { c: blue }); R.add('chair', 2.5, 6.9, 180, { c: blue }); R.add('coffeetable', 2.1, 5.4, 90, {});
      R.against('dispenser', 'right', 6.8, { gap: 0 }); R.add('plant', .5, 7.4, 0); R.add('palm', 9.4, 7.4, 0); R.add('cr_bin', 9.3, 6.2, 0);
      R.onWall('wallclock', 'back', 3.2); R.onWall('cr_cross_green', 'back', 5.2, { y: 2.2 }); R.onWall('noticeboard', 'back', 9.2, { w: 1.0 }); R.onWall('wallpic', 'left', 2.4, { c: '#9ac6e0', w: .9, h: .7 });
      R.sign(C.title.toUpperCase(), 5.0, 2.45, .1, 3.8, .45, 0, { bg: blue, fg: '#ffffff' });
      R.ceilingLights(2, 2, { color: '#f4fbff' });
    },
    npcs: [
      { role: 'staff', n: 1, beh: 'post', at: [[2.4, .85, 0]], pose: 'talk', hours: 'service', tag: 'doctor' },
      { role: 'nurse', n: 1, beh: 'post', at: [[7.2, 3.7, 0]], pose: 'type', hours: 'service' },
      { role: 'nurse', n: 1, beh: 'post', at: [[7.6, 1.4, 1.57]], pose: 'idle', hours: 'service' },
      { role: 'student', n: 2, beh: 'sit', sit: ['sofa', 'chair'], hours: 'service' },
      CLEAN([1, 4, 9, 7], { hours: 'clean' })
    ]
  });

  /* ====================================================================== CHURCH */
  D.def('church', {
    title: 'Church', icon: '⛪', w: 15, d: 12, h: 5.0, venue: 'church', doorAt: 7.5,
    theme: { floor: { type: 'wood', c1: '#b98a5a', c2: '#a67a4c' }, wall: '#f3ecdc', wainscot: '#7a4a30', trim: '#e9dcc0', accent: '#efe6d2', curtain: '#7a1f2a', frame: '#e9dcc0' },
    windows: [{ wall: 'left', at: 3.5, w: 1.0, h: 2.2, sill: 1.3 }, { wall: 'left', at: 8.5, w: 1.0, h: 2.2, sill: 1.3 }, { wall: 'right', at: 3.5, w: 1.0, h: 2.2, sill: 1.3 }, { wall: 'right', at: 8.5, w: 1.0, h: 2.2, sill: 1.3 }, { wall: 'front', at: 2.5, w: 1.4, h: 2.0, sill: 1.5 }, { wall: 'front', at: 12.5, w: 1.4, h: 2.0, sill: 1.5 }],
    build(R, C) {
      const red = '#8c1c2a', gold = '#d9b24a';
      // chancel platform, cross, pulpit, altar table, flowers
      R.add('stage', 7.5, 1.4, 0, { w: 9.4, d: 2.8, h: .3, c: '#5a3a24', c2: '#7a2a30' });
      R.onWall('cr_bigcross', 'back', 7.5, { s: 1.2, y: 1.3 });
      R.add('altar', 7.5, 1.7, 0, {}); R.add('cr_candles', 6.0, 1.75, 0); R.add('cr_candles', 9.0, 1.75, 0);
      R.add('pulpit', 3.6, 1.2, 0, { c: '#6b4428' }); R.add('mic', 3.1, 1.9, 0);
      R.add('cr_flowers', 6.7, .75, 0); R.add('cr_flowers', 10.0, .75, 0); R.add('cr_flowers', 2.5, 2.3, 0);
      R.add('piano', 11.4, 1.4, 0); R.add('drums', 13.5, 1.5, 0); R.add('speaker', 12.4, .45, 0); R.add('speaker', 14.4, .45, 0); R.add('chair', 11.4, 2.35, 180, { c: '#3a3a40' });
      for (let i = 0; i < 3; i++) R.add('chair', 4.3 + i * .8, .75, 0, { c: red });   // choir chairs (3: a 4th behind the altar could not be reached)
      // red runner + pews
      R.add('rug', 7.5, 7.1, 0, { w: 1.6, d: 9.2, c: red, c2: gold });
      for (let r = 0; r < 4; r++) { const z = 4.6 + r * 1.7;   // 1.7 m row pitch keeps a walkable gap between pews so every seat can be reached
        R.add('cr_pew', 4.5, z, 180, { n: 6, c: '#8a5a34', inter: ['pray'] }); R.add('cr_pew', 10.5, z, 180, { n: 6, c: '#8a5a34', inter: ['pray'] }); }
      // side: stained glass between windows, refreshment corner, plants
      [1.0, 6.0, 11.0].forEach((z, i) => { R.onWall('cr_stained', 'left', z, { y: 1.3, h: 2.3, seed: i }); R.onWall('cr_stained', 'right', z, { y: 1.3, h: 2.3, seed: i + 2 }); });
      R.against('fridge', 'front', 1.6, {}); R.against('dispenser', 'front', 3.0, { gap: 0 }); R.add('plant', .6, 11.3, 0); R.add('palm', 14.2, 11.1, 0); R.add('plant', 13.2, 11.3, 0);
      R.add('table', 13.4, 9.0, 90, { w: 1.4, d: .7 }); R.add('plant', 14.3, 6.6, 0); R.add('palm', .6, 4.0, 0);
      R.onWall('wallclock', 'back', 1.3); R.onWall('bannerhang', 'back', 2.6, { w: 1.2, c: red, c2: gold }); R.onWall('bannerhang', 'back', 12.4, { w: 1.2, c: '#2f5f9a', c2: gold });
      R.sign(C.title.toUpperCase(), 7.5, 3.9, .1, 5.2, .5, 0, { bg: '#5a3a24', fg: gold });
      R.ceilingLights(3, 3, { color: '#ffe9b8', pool: 3.4 });
    },
    npcs: [
      { role: 'pastor', n: 1, beh: 'post', at: [[3.6, 2.1, 0]], pose: 'talk', hours: 'event' },
      { role: 'staff', n: 1, beh: 'post', at: [[11.4, 3.0, 3.14]], pose: 'type', hours: 'event', tag: 'keyboardist' },
      { role: 'staff', n: 3, beh: 'sit', sit: ['chair'], hours: 'event' },
      { role: 'student', n: 14, beh: 'sit', sit: ['cr_pew'], hours: 'event' },
      { role: 'staff', n: 2, beh: 'stand', at: [[6.4, 10.9, 0], [8.6, 10.9, 0]], pose: 'talk', hours: 'event' },
      CLEAN([1, 4, 14, 11], { hours: 'clean' })
    ]
  });

  /* ====================================================================== MOSQUE */
  D.def('mosque', {
    title: 'Mosque', icon: '🕌', w: 14, d: 11, h: 4.6, venue: 'mosque', doorAt: 7,
    theme: { floor: { type: 'tile', c1: '#ece3cb', c2: '#ddd1b0' }, wall: '#f4efe0', wainscot: '#2f6f5f', trim: '#d9b24a', accent: '#f1eadb', curtain: '#2f6f5f', frame: '#e9dfc8' },
    windows: [{ wall: 'left', at: 3.2, w: 1.0, h: 2.4, sill: 1.4 }, { wall: 'left', at: 7.2, w: 1.0, h: 2.4, sill: 1.4 }, { wall: 'right', at: 3.2, w: 1.0, h: 2.4, sill: 1.4 }, { wall: 'right', at: 7.2, w: 1.0, h: 2.4, sill: 1.4 }, { wall: 'front', at: 2.4, w: 1.2, h: 2.0, sill: 1.5 }, { wall: 'front', at: 11.6, w: 1.2, h: 2.0, sill: 1.5 }],
    build(R, C) {
      const green = '#2f6f5f', gold = '#d9b24a';
      R.add('rug', 7.0, 5.8, 0, { w: 13.0, d: 8.0, c: '#e8dfc4', c2: green });
      R.onWall('mihrab', 'back', 7.0, {}); R.add('cr_minbar', 10.6, 1.25, 0, {}); R.add('cr_quranstand', 4.2, 1.2, 0); R.add('lamp', 3.0, .5, 0, {}); R.add('lamp', 11.9, 2.3, 0);
      R.onWall('cr_geopanel', 'back', 2.2, { w: 1.7, h: 2.2, y: 1.0 }); R.onWall('cr_geopanel', 'back', 11.8, { w: 1.7, h: 2.2, y: 1.0 }); R.onWall('cr_geopanel', 'back', 4.7, { w: .9, h: 2.2, y: 1.0, c: '#d9b24a' });
      for (const z of [1.6, 5.6, 9.2]) { R.onWall('cr_geopanel', 'left', z, { w: z > 9 ? 1.2 : 1.6, h: 1.6, y: 1.0, c: green }); R.onWall('cr_geopanel', 'right', z, { w: z > 9 ? 1.2 : 1.6, h: 1.6, y: 1.0, c: green }); }
      // prayer rows (qibla = back wall); centre aisle kept open
      [3.6, 5.0, 6.4].forEach((z, i) => { R.add('prayerrow', 3.7, z, 0, { n: 4, seed: i }); R.add('prayerrow', 10.3, z, 0, { n: 4, seed: i + 3 }); });
      R.add('column', 3.2, 8.4, 0, { h: 4.4 }); R.add('column', 10.8, 8.4, 0, { h: 4.4 });
      // entrance: shoe racks, wudu corner, water
      R.against('shoerack', 'front', 2.2); R.against('shoerack', 'front', 3.2); R.against('shoerack', 'front', 10.4); R.add('cr_wudu', 12.5, 8.4, 90, { n: 4 }); R.add('stool', 11.7, 7.8, 0); R.add('stool', 11.7, 9.0, 0, { c: '#2f6f5f' });
      R.against('dispenser', 'left', 8.4, { gap: 0 }); R.against('shelf', 'left', 9.8, { w: 1.2 }); R.add('plant', .55, 10.65, 0); R.add('palm', 13.4, 4.4, 0);
      R.onWall('wallclock', 'back', 9.0); R.onWall('noticeboard', 'right', 10.2, { w: 1.1 });
      R.sign(C.title.toUpperCase(), 7.0, 3.7, .1, 4.4, .5, 0, { bg: green, fg: gold });
      R.ceilingLights(3, 2, { color: '#fff1c8', pool: 3.4 });
    },
    npcs: [
      { role: 'cleric', n: 1, beh: 'post', at: [[9.0, 2.5, 3.14]], pose: 'talk', hours: 'event', tag: 'imam' },
      { role: 'student', n: 4, beh: 'stand', at: [[2.7, 3.4, 3.14], [4.5, 4.8, 3.14], [9.4, 3.4, 3.14], [11.2, 6.2, 3.14]], pose: 'pray', hours: 'event' },
      { role: 'staff', n: 2, beh: 'stand', at: [[4.8, 8.8, 3.14], [8.8, 8.9, 0.6]], pose: 'talk', hours: 'event' },
      { role: 'cleric', n: 1, beh: 'wander', zone: [1.5, 7.5, 12, 10], pose: 'idle', hours: 'event' },
      CLEAN([1, 3, 13, 10], { hours: 'clean' })
    ]
  });

  /* ====================================================================== GYM */
  D.def('gym', {
    title: 'Gymnasium', icon: '🏋️', w: 14, d: 10, h: 3.6, venue: 'gym', doorAt: 7,
    theme: { floor: { type: 'concrete', c1: '#3a3f46', c2: '#30343a' }, wall: '#e8e6e0', wainscot: '#e0662e', trim: '#22262c', curtain: '#22262c', frame: '#22262c', accent: '#2b2f36' },
    windows: [{ wall: 'left', at: 3.0, w: 1.6 }, { wall: 'left', at: 7.0, w: 1.6 }, { wall: 'right', at: 3.0, w: 1.6 }, { wall: 'right', at: 7.0, w: 1.6 }],
    build(R, C) {
      const org = '#e0662e';
      R.onWall('cr_mirrorwall', 'back', 3.6, { w: 5.2 }); R.onWall('cr_mirrorwall', 'back', 10.4, { w: 5.2 });
      // cardio row
      [1.2, 2.4, 3.6].forEach(x => R.against('treadmill', 'back', x, { gap: .15 })); R.against('treadmill', 'back', 4.8, { gap: .15 });
      R.add('cr_cable', 9.6, 1.0, 0); R.against('cr_squatrack', 'back', 12.4, { gap: .1 });
      // free weights
      R.add('weightbench', 9.5, 4.6, 0, {}); R.add('weightbench', 11.7, 4.6, 0, {}); R.against('dumbbells', 'right', 7.4, {}); R.against('cr_kettlebells', 'right', 8.9, {});
      // floor / stretching area + punchbags
      R.add('rug', 3.0, 5.6, 0, { w: 5.2, d: 3.2, c: '#2b2f36', c2: org });
      R.add('mat', 1.6, 5.5, 0, { c: org }); R.add('mat', 3.9, 5.5, 0, { c: '#2f5f9a' }); R.add('mat', 2.8, 7.0, 0, { c: '#3a3f46', w: 2.4 });
      R.add('punchbag', .8, 8.9, 0); R.add('punchbag', 2.2, 8.9, 0);
      // changing area, showers, lockers, trainer desk
      R.against('cr_lockers', 'left', 5.3, { w: 1.6 }); R.against('basin', 'front', 12.5, { gap: .02 }); R.add('bucket', 13.0, 8.9, 0);
      R.add('counter', 5.4, 8.9, 180, { w: 2.4, c: '#22262c', c2: org }); R.add('stool', 4.7, 8.2, 0); R.add('fridge', 3.5, 9.5, 180, {});   // was beside the door; moved next to the trainer counter
      R.against('dispenser', 'right', 5.8, { gap: 0 }); R.add('mirror', 13.4, 6.4, 0, {}); R.add('plant', 13.4, 2.9, 0); R.add('lamp', .5, 9.4, 0);
      R.onWall('cr_scoreboard', 'left', 8.2, { w: 1.7, y: 2.2 }); R.onWall('bannerhang', 'right', 5.0, { c: org, c2: '#ffffff' }); R.onWall('wallclock', 'back', 7.0);
      R.sign(C.title.toUpperCase(), 7.0, 2.9, .1, 4.6, .5, 0, { bg: '#22262c', fg: org });
      R.ceilingLights(3, 2, { color: '#f4f8ff' });
    },
    npcs: [
      { role: 'trainer', n: 1, beh: 'post', at: [[5.4, 9.55, 3.14]], pose: 'talk', hours: 'day', tag: 'trainer' },
      { role: 'student', n: 2, beh: 'stand', at: [[1.2, 2.9, 0], [3.6, 2.9, 0]], pose: 'run', hours: 'day' },
      { role: 'student', n: 2, beh: 'stand', at: [[9.4, 3.2, 0], [11.7, 3.2, 0]], pose: 'workout', hours: 'day' },
      { role: 'student', n: 2, beh: 'stand', at: [[2.0, 5.4, 0], [4.2, 5.8, 0]], pose: 'workout', hours: 'day' },
      { role: 'student', n: 1, beh: 'wander', zone: [6, 5.5, 12, 8.5], pose: 'idle', hours: 'day' },
      CLEAN([1, 4, 13, 9], { hours: 'clean' })
    ]
  });

  /* ====================================================================== SPORTS ROOM (default chess+games | tabletennis | grandstand) */
  D.def('sports_room', {
    title: 'Sports Room', icon: '♟️', w: 15, d: 10, h: 4.0, venue: 'sports_room', doorAt: 7.5,
    theme: { floor: { type: 'wood', c1: '#c79a62', c2: '#b88a54' }, wall: '#f1ecdf', wainscot: '#2f5f9a', trim: '#ffffff', curtain: '#2f5f9a', frame: '#ffffff' },
    windows: [{ wall: 'back', at: 3.0, w: 1.6 }, { wall: 'back', at: 12.0, w: 1.6 }, { wall: 'left', at: 5.0, w: 1.6 }, { wall: 'right', at: 5.0, w: 1.6 }],
    build(R, C) {
      const v = C.variant || 'chess';
      if (v === 'tabletennis') return tableTennis(R, C);
      if (v === 'grandstand') return grandstand(R, C);
      return chessRoom(R, C);
    },
    npcs: [
      { role: 'trainer', n: 1, beh: 'post', at: [[7.5, 1.0, 0]], pose: 'talk', hours: 'day' },
      { role: 'student', n: 4, beh: 'sit', sit: ['chair'], hours: 'social' },
      { role: 'student', n: 2, beh: 'stand', at: [[9.0, 4.2, 0], [10.4, 4.7, 3.14]], pose: 'play', hours: 'social' },
      { role: 'student', n: 1, beh: 'wander', zone: [1, 6, 14, 9], pose: 'idle', hours: 'social' },
      CLEAN([1, 3, 14, 9], { hours: 'clean' })
    ]
  });

  function chessRoom(R, C) {
    const blue = '#2f5f9a';
    R.theme.floor = { type: 'wood', c1: '#c79a62', c2: '#b88a54' };
    // chess corner: four tables with a chair each side
    [[3.0, 3.4], [5.4, 3.4], [3.0, 5.8], [5.4, 5.8]].forEach(([x, z], i) => { R.add('chesstable', x, z, 0, { seed: i }); R.add('chair', x, z - .8, 0, { c: '#7a4a2a' }); R.add('chair', x, z + .8, 180, { c: '#7a4a2a' }); });
    R.add('rug', 4.2, 4.6, 0, { w: 6.2, d: 5.4, c: '#3a4a6a', c2: '#e9dfc8' });
    // table tennis + foosball + pool
    R.add('pingpong', 11.0, 3.2, 0, {}); R.add('pingpong', 11.0, 6.2, 0, {}); R.add('foosball', 13.2, 8.6, 0); R.add('pooltable', 8.7, 8.3, 0);
    // trophies, bench, water, wall decor
    R.against('trophycase', 'back', 7.5, {}); R.against('trophycase', 'back', 9.3, {}); R.against('bench', 'left', 8.2, { n: 4, back: true }); R.against('dispenser', 'right', 1.4, { gap: 0 });
    R.add('mat', 1.6, 8.3, 0, { c: blue }); R.add('plant', .5, 1.0, 0); R.add('palm', 14.3, 1.0, 0); R.add('plant', 14.3, 9.3, 0); R.add('lamp', .5, 5.8, 0);
    R.onWall('cr_scoreboard', 'back', 5.4, { w: 2.2, y: 2.2 }); R.onWall('wallpic', 'left', 2.4, { c: '#9ac6e0' }); R.onWall('wallpic', 'left', 3.6, { c: '#d9b24a', w: .7 }); R.onWall('wallclock', 'right', 8.0); R.onWall('bannerhang', 'right', 2.6, { c: blue, c2: '#ffffff' });
    R.onWall('noticeboard', 'back', 13.6, { w: 1.2 });
    R.sign((C.name || 'GAMES AND CHESS ROOM').toUpperCase(), 7.5, 3.0, .1, 5.2, .5, 0, { bg: blue, fg: '#ffffff' });
    R.ceilingLights(3, 2, { color: '#fff4dc' });
  }
  function tableTennis(R, C) {
    const green = '#1f6b5c';
    R.theme.floor = { type: 'tile', c1: '#2f6f8f', c2: '#2a6280' }; R.theme.wall = '#eef2f0'; R.theme.wainscot = green; R.theme.curtain = green;
    for (let j = 0; j < 2; j++) for (let i = 0; i < 3; i++) R.add('pingpong', 3.2 + i * 4.3, 3.0 + j * 3.2, 0, {});
    R.add('rug', 7.5, 4.6, 0, { w: 13.0, d: 6.8, c: '#2a6280', c2: '#e9e4d8' });
    R.against('bench', 'left', 4.5, { n: 4, back: true }); R.against('bench', 'right', 4.5, { n: 4, back: true }); R.against('trophycase', 'back', 14.0, {}); R.against('dispenser', 'back', 1.0, { gap: 0 });
    R.add('cr_scoreboard', 7.5, 0.1, 0, {}); R.add('plant', .5, 9.3, 0); R.add('palm', 14.3, 9.3, 0); R.add('mat', 2.2, 8.3, 0, { c: green }); R.add('trolley', 12.5, 8.4, 0);
    R.onWall('cr_scoreboard', 'back', 7.5, { w: 3.0, y: 2.4 }); R.onWall('bannerhang', 'back', 3.8, { c: green, c2: '#ffffff' }); R.onWall('bannerhang', 'back', 11.2, { c: green, c2: '#ffffff' }); R.onWall('wallclock', 'left', 8.0);
    R.sign((C.name || 'TABLE TENNIS HALL').toUpperCase(), 7.5, 3.45, .1, 6.0, .5, 0, { bg: green, fg: '#ffffff' });
    R.ceilingLights(3, 2, { color: '#f4f8ff' });
    C.npcs = [{ role: 'trainer', n: 1, beh: 'post', at: [[7.5, 1.0, 0]], pose: 'talk', hours: 'day' }, { role: 'student', n: 4, beh: 'sit', sit: ['bench'], hours: 'social' }, { role: 'student', n: 2, beh: 'stand', at: [[1.2, 3.0, 1.57], [13.8, 6.2, -1.57]], pose: 'play', hours: 'social' }, { role: 'student', n: 1, beh: 'wander', zone: [1, 6, 14, 9], pose: 'idle', hours: 'social' }];
  }
  function grandstand(R, C) {
    const red = '#c0392b';
    R.theme.floor = { type: 'concrete', c1: '#aaa69a', c2: '#9a968a' }; R.theme.wall = '#e9e4d8'; R.theme.wainscot = red; R.theme.curtain = '#22262c'; R.theme.outer = '#8d8574';
    setWindows(R, [{ wall: 'left', at: 2.4, w: 2.0, h: 1.6, sill: 1.3 }, { wall: 'left', at: 5.5, w: 2.0, h: 1.6, sill: 1.3 }, { wall: 'left', at: 8.2, w: 1.6, h: 1.6, sill: 1.3 }, { wall: 'back', at: 3.0, w: 1.6 }, { wall: 'back', at: 7.0, w: 1.6 }]);
    // tiered stand on the right, facing the pitch (left windows)
    [[13.9, 1.0], [11.9, .65], [9.9, .3]].forEach(([x, h], r) => { [2.4, 7.4].forEach((z, s) => R.add('cr_tierrow', x, z, 270, { n: 8, h, c: r % 2 ? '#f0f0f0' : red, seed: r * 2 + s })); });
    // refreshment stand + concourse
    R.add('cr_stall', 3.4, 1.6, 0, { w: 3.6, c: red }); R.add('fridge', 5.7, 0.8, 0, {}); R.against('dispenser', 'back', 6.6, { gap: 0 }); R.add('stool', 2.2, 3.0, 0); R.add('stool', 3.4, 3.0, 0); R.add('stool', 4.6, 3.0, 0);
    R.against('trophycase', 'left', 4.6, {}); R.against('trophycase', 'left', 6.0, {}); R.add('mat', 3.0, 6.9, 0, { c: '#2f5f9a' }); R.add('plant', .5, 9.3, 0); R.add('plant', 8.4, 0.7, 0); R.add('palm', 8.8, 9.0, 0);
    R.add('rug', 5.0, 6.6, 0, { w: 6.0, d: 2.6, c: '#aeb4bc', c2: red });
    R.onWall('cr_scoreboard', 'back', 11.0, { w: 3.0, y: 2.6 }); R.onWall('bannerhang', 'back', 9.2, { c: red, c2: '#ffffff' }); R.onWall('bannerhang', 'back', 1.0, { c: '#22262c', c2: '#ffffff', w: 1.0 }); R.onWall('wallclock', 'back', 5.0);
    R.sign((C.name || 'GRANDSTAND').toUpperCase(), 3.4, 3.6, .1, 3.6, .45, 0, { bg: '#22262c', fg: '#ffffff' });
    R.sign('REFRESHMENTS', 3.4, 2.5, -.3 + 2.1, 2.2, .3, 0, { bg: '#ffffff', fg: red });
    R.ceilingLights(3, 2, { color: '#fff4dc' });
    C.npcs = [{ role: 'trainer', n: 1, beh: 'post', at: [[7.5, 1.0, 0]], pose: 'talk', hours: 'day' }, { role: 'student', n: 5, beh: 'sit', sit: ['cr_tierrow', 'stool'], hours: 'social' }, { role: 'student', n: 1, beh: 'wander', zone: [1, 6, 8, 9], pose: 'idle', hours: 'social' }];
  }

  /* ====================================================================== WORKSHOP (default | feedmill | power | farm) */
  D.def('workshop', {
    title: 'Workshop', icon: '🔧', w: 15, d: 10, h: 4.2, venue: 'workshop', doorAt: 7.5,
    theme: { floor: { type: 'concrete', c1: '#aaa69a', c2: '#9a968a' }, wall: '#e6e1d4', wainscot: '#e0b62a', trim: '#4a4a4a', curtain: null, frame: '#4a4a4a', outer: '#7d776a' },
    windows: [{ wall: 'back', at: 3.0, w: 1.8 }, { wall: 'back', at: 12.0, w: 1.8 }, { wall: 'left', at: 5.0, w: 1.6 }, { wall: 'right', at: 5.0, w: 1.6 }],
    build(R, C) {
      const v = C.variant || 'general';
      if (v === 'feedmill') return feedMill(R, C);
      if (v === 'power') return powerRoom(R, C);
      if (v === 'farm') return farmCentre(R, C);
      return generalShop(R, C);
    },
    npcs: [
      { role: 'staff', n: 2, beh: 'stand', at: [[3.0, 2.3, 0], [11.0, 2.7, 0]], pose: 'type', hours: 'work' },
      { role: 'staff', n: 1, beh: 'wander', zone: [1, 5, 14, 9], pose: 'idle', hours: 'work' },
      { role: 'student', n: 1, beh: 'stand', at: [[7.5, 6.2, 0]], pose: 'idle', hours: 'work' },
      CLEAN([1, 3, 14, 9], { hours: 'clean' })
    ]
  });

  function generalShop(R, C) {
    R.theme.curtain = null;
    R.add('cr_workbench', 3.0, 1.2, 0, { w: 2.4 }); R.add('cr_workbench', 6.0, 1.2, 0, { w: 2.4 }); R.onWall('cr_toolwall', 'back', 4.5, { w: 5.4, y: 1.3 });
    R.add('machine', 11.0, 1.5, 0, {}); R.add('machine', 13.2, 1.5, 0, {}); R.against('shelf', 'right', 4.5, { w: 1.6, h: 2.0 }); R.against('shelf', 'right', 6.4, { w: 1.6, h: 2.0 });
    R.against('cabinet', 'left', 4.0); R.against('cabinet', 'left', 5.0); R.add('crate', 1.0, 7.4, 0, { n: 2 }); R.add('crate', 1.0, 8.4, 0, { n: 3 }); R.add('sacks', 3.0, 8.6, 0, {});
    R.add('counter', 12.0, 8.4, 180, { w: 3.0, c: '#4a5a6a', c2: '#d9d5cb' }); R.add('cr_drums', 7.5, 8.9, 0, {}); R.add('cr_cablereel', 5.2, 8.7, 0); R.add('cr_cart', 9.0, 8.7, 0);
    R.add('table', 7.5, 5.0, 0, { w: 2.2, d: 1.1, c: '#9a7a4a' }); R.add('stool', 6.5, 6.0, 0); R.add('stool', 8.5, 6.0, 0); R.add('bucket', 13.8, 6.6, 0); R.add('plant', .6, 9.3, 0);
    R.onWall('cr_extinguisher', 'left', 7.4); R.onWall('cr_extinguisher', 'right', 8.6); R.onWall('wallclock', 'back', 9.0); R.onWall('noticeboard', 'left', 2.0, { w: 1.2 });
    R.sign((C.name || 'WORKSHOP').toUpperCase(), 7.5, 3.2, .1, 5.0, .5, 0, { bg: '#3a3a3a', fg: '#e0b62a' }); R.sign('SAFETY FIRST', 12.0, 2.4, 7.9, 2.0, .3, 0, { bg: '#e0b62a', fg: '#222' });
    R.ceilingLights(3, 2, { color: '#fff4dc' });
  }
  function feedMill(R, C) {
    R.theme.wainscot = '#8b929a'; R.theme.wall = '#ece5d0'; R.theme.floor = { type: 'concrete', c1: '#b3ab98', c2: '#a39b88' };
    R.add('cr_hopper', 3.0, 2.4, 0, {}); R.add('cr_hopper', 6.0, 2.4, 0, { c: '#a9715a' }); R.add('machine', 9.4, 1.6, 0, {}); R.add('machine', 12.2, 1.6, 0, {}); R.add('cr_conveyor', 11.0, 4.0, 0, { w: 4.0 });
    R.against('sacks', 'left', 6.5, {}); R.against('sacks', 'left', 7.9, {}); R.add('sacks', 6.4, 7.6, 0, {}); R.add('sacks', 8.0, 7.6, 0, {}); R.add('scale', 10.8, 6.4, 0); R.add('cr_cart', 13.3, 6.6, 90);
    R.add('counter', 12.4, 8.5, 180, { w: 3.0, c: '#6a5a3a', c2: '#d9d5cb', inter: false }); R.add('crate', 1.0, 4.6, 0, { n: 3 }); R.add('cr_workbench', 13.4, 5.0, 270, { w: 1.6 });
    R.against('cabinet', 'back', 8.0); R.add('cr_drums', 2.3, 5.2, 0, { cs: ['#8a6a42', '#c0392b'] }); R.add('plant', .6, 9.3, 0);
    R.onWall('cr_extinguisher', 'back', 14.2); R.onWall('noticeboard', 'right', 4.4, { w: 1.2 }); R.onWall('bannerhang', 'back', 4.5, { c: '#3a8a4c', c2: '#ffffff', w: 1.4 }); R.onWall('wallclock', 'left', 3.0);
    R.sign((C.name || 'FEED MILL').toUpperCase(), 7.5, 3.4, .1, 5.0, .5, 0, { bg: '#3a8a4c', fg: '#ffffff' });
    R.ceilingLights(3, 2, { color: '#fff4dc' });
  }
  function powerRoom(R, C) {
    R.theme.wall = '#d9d6cc'; R.theme.wainscot = '#c0392b'; R.theme.floor = { type: 'concrete', c1: '#8a8d90', c2: '#7a7d80' };
    R.add('generator', 2.4, 2.3, 0, { c: '#d9a43a' }); R.add('generator', 5.2, 2.3, 0, { c: '#c0392b' }); R.add('generator', 8.0, 2.3, 0, { c: '#d9a43a' }); R.add('generator', 10.8, 2.3, 0, { c: '#3a6aa0' });
    R.add('powerpanel', 13.4, 5.2, 270, {}); R.against('powerpanel', 'right', 3.0, {}); R.against('powerpanel', 'right', 7.6, {}); R.against('serverrack', 'left', 6.5, {}); R.against('serverrack', 'left', 7.6, {});
    R.add('cr_drums', 3.2, 6.2, 0, {}); R.add('cr_drums', 4.6, 6.2, 0, { cs: ['#c0392b', '#e0b62a'] }); R.add('cr_cablereel', 6.6, 6.5, 0); R.add('cr_cablereel', 8.0, 6.5, 0); R.add('cr_workbench', 10.8, 8.5, 180, { w: 2.2 });
    R.add('machine', 1.6, 8.5, 0, {}); R.add('crate', 13.6, 8.8, 0, { n: 2 }); R.against('cabinet', 'back', 13.0);
    R.onWall('cr_extinguisher', 'back', .8); R.onWall('cr_extinguisher', 'left', 4.0); R.onWall('cr_toolwall', 'left', 2.2, { w: 1.2 }); R.onWall('wallclock', 'back', 14.2, {});
    R.sign('DANGER  HIGH VOLTAGE', 7.5, 2.6, .12, 4.0, .4, 0, { bg: '#e0b62a', fg: '#222' }); R.sign((C.name || 'POWER ROOM').toUpperCase(), 7.5, 3.4, .1, 5.0, .5, 0, { bg: '#2b2f36', fg: '#ffffff' });
    R.ceilingLights(3, 2, { color: '#e8f0ff' });
  }
  function farmCentre(R, C) {
    R.theme.wall = '#efe8d2'; R.theme.wainscot = '#3a8a4c'; R.theme.floor = { type: 'concrete', c1: '#b8ad92', c2: '#a89d82' };
    R.add('crate', 1.0, 1.0, 0, { n: 3 }); R.add('crate', 2.0, 1.0, 0, { n: 2 }); R.add('crate', 3.0, 1.0, 0, { n: 3 }); R.add('crate', 4.0, 1.0, 0, { n: 2 });
    R.add('cr_hay', 7.0, 1.0, 0, {}); R.add('cr_hay', 8.6, 1.0, 0, {}); R.add('sacks', 11.0, 1.0, 0, {}); R.add('sacks', 12.6, 1.0, 0, {}); R.against('cr_toolwall', 'left', 4.6, { w: 2.4 });
    R.add('cr_wheelbarrow', 3.4, 4.0, 0); R.add('cr_wheelbarrow', 5.0, 4.0, 0); R.add('cr_cart', 8.0, 5.0, 0); R.add('cr_cart', 9.4, 5.0, 0);
    R.add('counter', 12.0, 5.6, 0, { w: 2.8, c: '#6a8a4a', c2: '#d9d5cb' }); R.add('scale', 10.2, 5.6, 0); R.add('cr_workbench', 14.0, 3.4, 270, { w: 1.8 });
    R.add('plant', 1.0, 7.0, 0, { s: 1.4 }); R.add('plant', 2.0, 7.3, 0, { s: 1.2 }); R.add('palm', 1.2, 9.0, 0); R.add('crate', 13.8, 8.8, 0, { n: 3 }); R.add('crate', 12.8, 8.8, 0, { n: 2 }); R.add('cr_drums', 4.2, 8.6, 0, { cs: ['#3a8a4c', '#2f5f9a'] });
    R.add('table', 8.0, 8.0, 0, { w: 2.2, d: .9, c: '#a8895a' }); R.add('basket', 7.2, 7.4, 0); R.add('basket', 8.8, 7.4, 0); R.add('machine', 11.4, 8.2, 0, {});
    R.onWall('bannerhang', 'back', 5.8, { c: '#3a8a4c', c2: '#ffffff', w: 1.2 }); R.onWall('bannerhang', 'back', 9.8, { c: '#e0b62a', c2: '#3a8a4c', w: 1.2 }); R.onWall('wallclock', 'right', 3.0); R.onWall('cr_extinguisher', 'right', 7.8); R.onWall('noticeboard', 'back', 14.0, { w: 1.0 });
    R.sign((C.name || 'FARM CENTRE').toUpperCase(), 7.5, 3.4, .1, 5.0, .5, 0, { bg: '#3a8a4c', fg: '#ffffff' });
    R.ceilingLights(3, 2, { color: '#fff4dc' });
  }

  /* ====================================================================== VISITOR CENTRE (Wildlife Park / Zoo) */
  D.def('visitor_centre', {
    title: 'Visitor Centre', icon: '🦁', w: 14, d: 10, h: 3.6, venue: 'visitor_centre', doorAt: 7,
    theme: { floor: { type: 'terrazzo', c1: '#e3d8bd', c2: '#7a8a5a' }, wall: '#f1ead4', wainscot: '#4a6a3a', trim: '#6b4428', curtain: '#4a6a3a', frame: '#6b4428' },
    windows: [{ wall: 'left', at: 3.0, w: 1.6 }, { wall: 'right', at: 3.0, w: 1.6 }, { wall: 'right', at: 7.0, w: 1.4 }, { wall: 'front', at: 2.2, w: 1.4 }, { wall: 'front', at: 11.8, w: 1.4 }],
    build(R, C) {
      const gr = '#4a6a3a';
      // ticket desk + info
      R.add('counter', 3.0, 8.6, 180, { w: 3.0, c: gr, c2: '#e9e4d8', inter: false }); R.add('stool', 2.2, 9.5, 0); R.add('printer', 5.1, 8.4, 180); R.add('queuerope', 3.0, 6.9, 0, { n: 2 });
      // exhibits: terrariums along the back wall, aquariums right wall, centre statue
      [['snake', 1.2], ['lizard', 3.0], ['tortoise', 4.8], ['frog', 6.6]].forEach(([k, x]) => R.against('cr_terrarium', 'back', x + .5, { kind: k }));
      R.against('cr_aquarium', 'right', 3.3, {}); R.against('cr_aquarium', 'right', 5.5, {}); R.add('cr_lion', 7.5, 5.0, 0, {}); R.add('glasscase', 11.2, 2.3, 0, {});
      [0, 1, 2].forEach(i => R.onWall('cr_infoboard', 'back', 9.1 + i * 1.5, { seed: i, c: pick(['#2f6f5f', '#8a5a24', '#2f5f9a'], i) })); R.onWall('cr_infoboard', 'left', 2.0, { seed: 1 }); R.onWall('cr_infoboard', 'left', 4.2, { seed: 2, c: '#8a5a24' });
      // gift stall (front-right)
      R.add('cr_giftshelf', 11.5, 7.9, 180, { seed: 1 }); R.add('cr_giftshelf', 13.2, 8.8, 90, { seed: 3 }); R.add('counter', 10.4, 6.2, 0, { w: 2.2, c: '#8a5a24', c2: '#e9e4d8', inter: false }); R.add('basket', 12.4, 6.4, 0);
      R.add('bench', 1.4, 3.7, 90, { n: 3, back: true }); R.against('dispenser', 'left', 6.0, { gap: 0 }); R.add('palm', .6, 1.0, 0); R.add('plant', 8.2, 8.4, 0); R.add('palm', 13.3, 1.0, 0); R.add('plant', 12.6, 4.5, 0);
      R.add('rug', 7.5, 5.2, 0, { w: 4.2, d: 3.0, c: '#4a6a3a', c2: '#d9b24a' });
      R.onWall('wallclock', 'right', 1.2); R.onWall('bannerhang', 'left', 8.4, { c: gr, c2: '#f2c33a', w: 1.3 }); R.onWall('wallpic', 'left', 7.6, { c: '#b8a05a', w: .9 });
      R.sign((C.name || 'WILDLIFE PARK').toUpperCase() + ' VISITOR CENTRE', 7.0, 2.85, .1, 6.6, .5, 0, { bg: gr, fg: '#f2c33a' }); R.sign('TICKETS', 3.0, 2.3, 8.1, 1.6, .3, 0, { bg: '#ffffff', fg: gr });
      R.ceilingLights(3, 2, { color: '#fff1d0' });
    },
    npcs: [
      { role: 'staff', n: 1, beh: 'post', at: [[3.0, 9.55, 3.14]], pose: 'type', hours: 'day', tag: 'ticket' },
      { role: 'staff', n: 1, beh: 'post', at: [[10.4, 5.4, 0]], pose: 'talk', hours: 'day', tag: 'giftstall' },
      SEC(8.8, 9.4, 3.14, { hours: 'day' }),
      { role: 'student', n: 3, beh: 'stand', at: [[3.4, 2.9, 0], [4.4, 2.9, 0], [11.2, 3.6, 0]], pose: 'phone', hours: 'day' },
      { role: 'student', n: 1, beh: 'wander', zone: [3, 3.2, 12, 7], pose: 'idle', hours: 'day' },
      { role: 'staff', n: 1, beh: 'wander', zone: [8, 3.2, 12, 8], pose: 'idle', hours: 'day', tag: 'keeper' },
      CLEAN([1, 3, 13, 9], { hours: 'clean' })
    ]
  });
})(typeof window !== 'undefined' ? window : globalThis);
