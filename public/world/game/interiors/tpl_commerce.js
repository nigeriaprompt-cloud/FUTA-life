/* Commerce templates: pharmacy, provisions, supermarket, bookshop, phone_shop, print_shop, cyber_cafe, bakery, restaurant (amala|suya|fastfood|default),
   salon, petrol_shop, carwash.  NO ATMs here (banks only).  Extra furniture used only by these shops is defined at the top of this file. */
(function (g) {
  'use strict';
  const D = g.FutaTemplates, F = g.FutaFurn, { CLEAN } = D;
  const pick = (a, i) => a[((i % a.length) + a.length) % a.length];
  const rn = (s) => { s = (s * 9301 + 49297) % 233280; return s / 233280; };
  const PC = ['#e5b93a', '#b3362e', '#3d8a4c', '#3d5a80', '#e08a2e', '#d6568a', '#f3f0ea', '#1f7a74', '#6b3fa0'];

  /* ------------------------------------------------------------ shop-only furniture */
  F.def('display_case', { size: [1.6, .7], spot: [0, .8, Math.PI], draw(b, o) {
    const L = o.w || 1.6, c = o.c || '#8a5a3c'; this.size = [L, .7];
    b.box(0, 0, 0, L, .6, .64, c); b.box(0, .6, 0, L + .04, .04, .68, '#f1ece0');
    for (let t = 0; t < 2; t++) { b.box(0, .64 + t * .32, 0, L - .06, .02, .56, '#e9e4d8'); const n = Math.floor(L / .3); for (let i = 0; i < n; i++) { const x = -L / 2 + .22 + i * ((L - .44) / Math.max(1, n - 1)), col = pick(['#f4c6d6', '#7a4a2c', '#f6e7b4', '#c8562e', '#fff5e0', '#d6568a'], i + t * 2 + (o.seed || 0)); b.cyl(x, .66 + t * .32, 0, .11, .1, col, { seg: 10 }); b.cyl(x, .76 + t * .32, 0, .08, .04, pick(['#fff', '#e5b93a', '#b3362e'], i + t), { seg: 8 }); } }
    b.box(0, .66, .3, L - .04, .62, .02, '#bfe3f2', { layer: 'glass' }); b.box(0, 1.28, 0, L, .03, .64, '#3a2a20'); } });
  F.def('breadrack', { size: [1.2, .5], spot: [0, .8, Math.PI], draw(b, o) {
    b.box(-.58, 0, 0, .04, 1.7, .46, '#6b4428'); b.box(.58, 0, 0, .04, 1.7, .46, '#6b4428'); b.box(0, 0, -.2, 1.2, 1.7, .03, '#4a3020');
    for (let r = 0; r < 4; r++) { b.box(0, .2 + r * .42, 0, 1.16, .03, .44, '#cfa96a'); for (let i = 0; i < 5; i++) { b.sph(-.45 + i * .22, .27 + r * .42, 0, .1, pick(['#c58a3c', '#d9a24e', '#a8692c', '#e0b765'], i + r), { sy: .55, sz: 1.5, seg: 7 }); } } } });
  F.def('oven', { size: [1.3, .8], spot: [0, .85, Math.PI], draw(b, o) {
    b.box(0, 0, 0, 1.3, 1.5, .7, '#b4bcc5'); b.box(0, .25, .36, 1.1, .7, .02, '#1b1b1f'); b.box(0, .3, .37, .95, .6, .01, '#e8892e', { layer: 'glow', shade: .8 }); b.box(0, .95, .36, 1.1, .3, .02, '#454b52');
    for (let i = 0; i < 4; i++) b.cyl(-.4 + i * .27, 1.03, .39, .05, .03, '#d9d5cb', { seg: 8 }); b.box(0, 1.5, 0, 1.34, .06, .74, '#454b52'); b.box(0, 1.56, 0, .3, .3, .3, '#8b929a'); } });
  F.def('grill', { size: [1.5, .8], spot: [0, .85, Math.PI], draw(b, o) {
    b.box(0, 0, 0, 1.4, .8, .6, '#1b1b1f'); b.box(0, .8, 0, 1.3, .05, .5, '#3a2a20'); b.box(0, .84, 0, 1.2, .03, .42, '#ff6a1f', { layer: 'glow', shade: .9 }); b.box(.1, .86, .05, .7, .02, .2, '#ffc23a', { layer: 'glow' });
    for (let i = 0; i < 9; i++) b.box(-.55 + i * .14, .88, 0, .03, .03, .62, '#8a8f96'); for (let i = 0; i < 6; i++) b.box(-.4 + i * .16, .9, 0, .12, .05, .4, pick(['#8a4a22', '#a85a28', '#6b3a1c'], i), { shade: .95 });
    b.box(0, 1.0, -.3, 1.4, .5, .05, '#3a3a3f'); b.cyl(-.55, 1.4, -.3, .1, .6, '#2a2a2f', { seg: 8 }); b.cyl(.6, .8, .3, .1, .3, '#3d5a80', { seg: 8 }); } });
  F.def('booth', { size: [2.0, 1.5], spot: [0, 1.15, Math.PI],
    seat: [{ x: -.45, z: -.55, face: 0, y: .46 }, { x: .45, z: -.55, face: 0, y: .46 }, { x: -.45, z: .55, face: Math.PI, y: .46 }, { x: .45, z: .55, face: Math.PI, y: .46 }],
    draw(b, o) { const c = o.c || '#c1121f'; b.box(0, .72, 0, 1.4, .05, .7, o.c2 || '#f4f1ea'); b.box(0, 0, 0, .1, .72, .1, '#454b52'); b.box(0, 0, 0, .5, .03, .3, '#454b52');
      for (const s of [-1, 1]) { b.box(0, 0, s * .55, 1.9, .42, .42, c); b.box(0, .42, s * .55, 1.9, .06, .42, '#e9e4d8', { shade: .95 }); b.box(0, .45, s * .78, 1.9, .6, .1, c); }
      b.box(0, .77, 0, .2, .12, .1, '#e5b93a'); } });
  F.def('wigs', { size: [1.4, .5], spot: [0, .8, Math.PI], draw(b, o) {
    b.box(0, 0, 0, 1.4, .9, .5, o.c || '#f3f0ea'); b.box(0, .9, 0, 1.44, .04, .54, '#d6568a');
    for (let i = 0; i < 4; i++) { const x = -.5 + i * .33; b.cyl(x, .94, 0, .02, .3, '#b4bcc5', { seg: 6 }); b.sph(x, 1.28, 0, .1, '#7a4a30', { sy: 1.2, seg: 8 }); b.sph(x, 1.33, 0, .13, pick(['#1b1b1f', '#6b3fa0', '#8a4a22', '#d6568a'], i), { sy: 1.05, seg: 8 }); }
    b.box(0, 1.5, -.22, 1.4, .6, .04, '#2a2a2f'); for (let i = 0; i < 6; i++) b.box(-.55 + i * .22, 1.55, -.19, .14, .5, .02, pick(['#d6568a', '#f3f0ea', '#6b3fa0', '#e5b93a'], i), { layer: 'glow', shade: .7 }); } });
  F.def('oilrack', { size: [1.4, .5], spot: [0, .8, Math.PI], draw(b, o) {
    b.box(-.68, 0, 0, .04, 1.6, .46, '#2a2a2f'); b.box(.68, 0, 0, .04, 1.6, .46, '#2a2a2f'); b.box(0, 0, -.2, 1.4, 1.6, .03, '#2a2a2f');
    for (let r = 0; r < 4; r++) { b.box(0, .15 + r * .38, 0, 1.36, .03, .44, '#b4bcc5'); for (let i = 0; i < 7; i++) { const c = pick(['#e5b93a', '#b3362e', '#3d5a80', '#3d8a4c', '#e08a2e'], i + r * 2); b.box(-.57 + i * .19, .18 + r * .38, 0, .14, .24, .14, c); b.box(-.57 + i * .19, .42 + r * .38, 0, .06, .05, .06, '#1b1b1f'); } } } });
  F.def('tyres', { size: [.8, .8], draw(b, o) { const n = o.n || 4; for (let i = 0; i < n; i++) { b.cyl(0, i * .2, 0, .36, .2, '#1b1b1f', { seg: 14 }); b.cyl(0, i * .2 + .01, 0, .2, .19, '#454b52', { seg: 12 }); } } });
  F.def('copier', { size: [1.0, .8], spot: [0, .85, Math.PI], draw(b, o) {
    b.box(0, 0, 0, .95, .9, .7, '#e9e4d8'); b.box(0, .9, 0, .97, .22, .72, '#d9d5cb'); b.box(0, 1.12, -.02, .9, .04, .6, '#f3f0ea'); b.box(.28, .95, .37, .3, .1, .02, '#1b1b1f'); b.box(.28, .97, .38, .24, .06, .01, '#4ad0ff', { layer: 'glow' });
    b.box(-.2, .42, .36, .5, .3, .02, '#454b52'); b.box(-.2, .55, .42, .46, .02, .14, '#fff'); b.box(0, 0, .0, .95, .06, .7, '#3d5a80'); } });
  F.def('menuboard', { size: [1.6, .1], wall: true, blocker: false, draw(b, o) {
    const w = o.w || 1.6; b.box(0, 1.5, 0, w + .1, 1.0, .05, '#1b1b1f'); b.box(0, 1.55, .03, w, .9, .01, o.c || '#26323d', { layer: 'glow', shade: .6 });
    b.box(0, 2.3, .03, w * .6, .15, .01, o.c2 || '#e5b93a', { layer: 'glow' }); for (let i = 0; i < 5; i++) { b.box(-w * .22, 2.1 - i * .13, .035, w * .38 * (.6 + rn(i + (o.seed || 1)) * .4), .035, .005, '#f3f0ea', { layer: 'glow', shade: .85 }); b.box(w * .3, 2.1 - i * .13, .035, .2, .035, .005, o.c2 || '#e5b93a', { layer: 'glow', shade: .85 }); } } });
  F.def('greencross', { size: [.9, .1], wall: true, blocker: false, draw(b, o) {
    b.box(0, 1.65, 0, 1.0, 1.0, .05, '#f3f0ea'); b.box(0, 1.95, .03, .22, .66, .01, o.c || '#1f9a4c', { layer: 'glow' }); b.box(0, 1.95, .03, .66, .22, .01, o.c || '#1f9a4c', { layer: 'glow' }); } });
  F.def('hosereel', { size: [.7, .3], blocker: false, wall: true, draw(b, o) { b.box(0, 1.0, 0, .5, .5, .1, '#2a2a2f'); b.cyl(0, 1.0, .06, .22, .08, '#e5b93a', { seg: 12 }); b.cyl(0, 1.0, .06, .12, .1, '#3d5a80', { seg: 10 }); } });
  F.def('shopfridge', { size: [1.0, .75], spot: [0, .9, Math.PI], draw(b, o) { // upright glass-door drinks fridge
    b.box(0, 0, 0, .95, 2.0, .72, o.c || '#b3362e'); b.box(0, .1, .37, .8, 1.7, .02, '#26323d'); b.box(0, .14, .38, .76, 1.62, .01, '#cfe6f2', { layer: 'glow', shade: .65 });
    for (let r = 0; r < 5; r++) for (let i = 0; i < 4; i++) b.cyl(-.27 + i * .18, .25 + r * .32, .385, .06, .22, pick(PC, r * 4 + i + (o.seed || 0)), { seg: 6, layer: 'glow', shade: .75 }); b.box(0, 1.9, .37, .6, .08, .02, '#f3f0ea', { layer: 'glow' }); } });

  const ACT = { gondola: ['buy_snack', 'buy_drink'] };
  const ST = (role, n, beh, at, extra) => Object.assign({ role, n, beh, at, hours: 'service' }, extra || {});
  const CUST = (n, at, o) => Object.assign({ role: 'student', n, beh: 'stand', at, pose: 'phone', hours: 'service' }, o || {});
  const SITTERS = (sit, n, o) => Object.assign({ role: 'student', n: n || 2, beh: 'sit', sit, hours: 'service' }, o || {});

  /* ------------------------------------------------------------ PHARMACY (Green-Cross style) */
  D.def('pharmacy', {
    title: 'Pharmacy', icon: '💊', w: 10, d: 7.5, h: 3.1, venue: 'pharmacy', doorAt: 7.6,
    theme: { floor: { type: 'tile', c1: '#f2f6f3', c2: '#d9e8df' }, wall: '#f7faf7', wainscot: '#1f8a4c', trim: '#ffffff', curtain: '#cfe8d8', accent: '#eaf5ee' },
    windows: [{ wall: 'back', at: 1.4, w: 1.3 }, { wall: 'front', at: 2.6, w: 1.8 }, { wall: 'right', at: 2.2, w: 1.4 }],
    build(R, C) {
      const G = '#1f8a4c';
      [3.5, 5.4, 7.3, 9.1].forEach((x, i) => R.against('wallshelf', 'back', x, { w: 1.8, seed: i + 2 })); R.against('fridge', 'back', 0.5); R.against('cabinet', 'back', 2.2);
      R.add('greencross', 6.4, 0.1, 0); R.onWall('greencross', 'back', 6.4);
      R.add('counter', 6.3, 3.4, 0, { w: 6.2, c: G, c2: '#f1ede4', glass: true, till: true });
      R.add('printer', 2.2, 2.0, 0); R.add('plant', 0.45, 3.0, 0);
      // customer floor
      R.add('gondola', 5.0, 5.2, 0, { w: 2.4, c: G, seed: 5 }); R.add('gondola', 8.2, 5.2, 0, { w: 1.8, c: G, seed: 7 }); R.add('gondola', 3.3, 5.2, 90, { w: 1.8, c: '#2f7fb5', seed: 3 });
      R.against('gondola', 'left', 6.0, { w: 1.8, c: '#2f7fb5', seed: 4 }); R.against('rack', 'left', 4.3, { }); R.against('scale', 'right', 4.5); R.against('bpmachine', 'right', 5.2);
      R.against('bench', 'right', 6.45, { n: 3, back: true, c: '#e8e2d2', c2: G }); R.add('rug', 8.4, 6.6, 0, { w: 2.2, d: 1.0, c: '#bfe0cc', c2: '#ffffff' });
      R.against('dispenser', 'front', 1.4); R.add('plant', 8.8, 7.1, 0); R.add('sign_stand', 9.0, 4.0, 0, { c: G }); R.add('lamp', 0.45, 7.15, 0);
      R.onWall('wallclock', 'right', 3.6); R.onWall('noticeboard', 'left', 2.6, { w: 1.2 }); R.onWall('wallpic', 'right', 6.0, { c: '#7cc6a0', w: .9, h: .6 });
      R.sign(C.title.toUpperCase(), 5.0, 2.65, 0.1, 3.8, 0.5, 0, { bg: G, fg: '#ffffff' });
      R.ceilingLights(3, 2, { color: '#f4fff6' });
    },
    npcs: [ST('pharmacist', 2, 'post', [[4.7, 2.5, 0], [7.9, 2.5, 0]], { pose: 'talk' }), CUST(2, [[5.0, 4.4, 0], [8.2, 4.4, 3.14]]), SITTERS(['bench'], 1), CLEAN([1, 4.4, 9, 7], { hours: 'clean' })]
  });

  /* ------------------------------------------------------------ PROVISIONS (corner store) */
  D.def('provisions', {
    title: 'Provision Store', icon: '🛒', w: 7, d: 5.6, h: 2.9, venue: 'provisions', doorAt: 5.6,
    theme: { floor: { type: 'concrete', c1: '#d6cdb9', c2: '#c4bba6' }, wall: '#f6e3a0', wainscot: '#c1272d', trim: '#ffffff', curtain: '#c1272d' },
    windows: [{ wall: 'back', at: 1.2, w: 1.2 }, { wall: 'left', at: 3.0, w: 1.3 }, { wall: 'front', at: 1.8, w: 1.6 }],
    build(R, C) {
      R.against('wallshelf', 'back', 3.0, { w: 2.0, seed: 1 }); R.against('wallshelf', 'back', 5.0, { w: 2.0, seed: 6 }); R.against('freezer', 'back', 6.5); R.against('shopfridge', 'back', 0.6, { c: '#c1272d' });
      R.add('counter', 4.3, 2.7, 0, { w: 4.2, c: '#c1272d', c2: '#f1ede4', glass: true });
      R.add('basket', 6.0, 3.6, 0); R.add('kettle', 0.9, 2.1, 0, { nb: true });
      R.against('gondola', 'left', 4.0, { w: 1.8, seed: 2 }); R.add('gondola', 3.0, 4.5, 0, { w: 2.0, c: '#c1272d', seed: 9 });
      R.against('sacks', 'right', 4.3, {}); R.add('crate', 6.1, 1.9, 0, { n: 2 }); R.add('crate', 0.8, 5.2, 0, { n: 3, seed: 4 });
      R.against('dispenser', 'right', 1.3); R.add('sign_stand', 4.6, 4.2, 0, { c: '#e5b93a' }); R.onWall('wallclock', 'right', 2.2); R.onWall('noticeboard', 'left', 1.2, { w: 1.0 });
      R.sign(C.title.toUpperCase(), 3.5, 2.6, 0.1, 3.0, 0.4, 0, { bg: '#c1272d', fg: '#ffe9a8' });
      R.ceilingLights(2, 2);
    },
    npcs: [ST('trader', 1, 'post', [[3.4, 1.8, 0]], { pose: 'talk' }), CUST(2, [[2.0, 3.75, 3.14], [5.2, 3.75, 3.14]]), CLEAN([0.8, 3.5, 6, 5], { hours: 'clean' })]
  });

  /* ------------------------------------------------------------ SUPERMARKET (also shopping complexes) */
  D.def('supermarket', {
    title: 'Supermarket', icon: '🛍️', w: 16, d: 11, h: 3.6, venue: 'supermarket', doorAt: 4.0,
    theme: { floor: { type: 'tile', c1: '#f1efe9', c2: '#d9dde4' }, wall: '#f4f6f9', wainscot: '#1e5fa8', trim: '#ffffff', curtain: '#f0b429', frame: '#ffffff' },
    windows: [{ wall: 'front', at: 8.5, w: 2.2 }, { wall: 'front', at: 12.5, w: 2.2 }, { wall: 'left', at: 5.5, w: 1.6 }, { wall: 'right', at: 9.0, w: 1.6 }],
    build(R, C) {
      const B = '#1e5fa8', Y = '#f0b429';
      // chilled wall along the back + wall shelves
      [1.0, 2.1, 3.2, 4.3].forEach((x, i) => R.against('freezer', 'back', x + 0.0, { c: i % 2 ? '#c1272d' : B }));
      [6.5, 8.6, 10.7].forEach((x, i) => R.against('wallshelf', 'back', x, { w: 2.0, seed: i + 3 })); R.against('shopfridge', 'back', 12.4, { c: '#c1272d' }); R.against('shopfridge', 'back', 13.5, { c: B }); R.against('shopfridge', 'back', 14.6, { c: '#c1272d' });
      // aisles
      [3.3, 5.2, 7.1].forEach((z, r) => [3.0, 5.6, 8.2].forEach((x, i) => R.add('gondola', x, z, 0, { w: 2.4, c: pick([B, '#c1272d', '#2f8f4c', Y], r + i), seed: r * 5 + i })));
      R.against('gondola', 'left', 6.0, { w: 2.0, c: Y, seed: 20 }); R.against('gondola', 'left', 8.2, { w: 2.0, c: Y, seed: 21 });
      R.add('crate', 11.0, 3.4, 0, { n: 3, seed: 5 }); R.add('crate', 12.2, 3.4, 0, { n: 2, seed: 8 }); R.add('crate', 13.4, 3.4, 0, { n: 3, seed: 2 }); R.add('sacks', 11.8, 5.0, 0, {}); R.add('sacks', 13.6, 5.0, 0, { c: '#e9dcb4' });
      // checkouts (right side, cashiers between counter and wall)
      R.add('counter', 14.0, 7.4, 270, { w: 2.2, c: B, c2: '#e9e4d8', till: true }); R.add('counter', 14.0, 9.6, 270, { w: 2.0, c: B, c2: '#e9e4d8', till: true });
      R.add('trolley', 11.4, 8.8, 0); R.add('trolley', 12.1, 8.8, 0); R.add('trolley', 12.8, 10.0, 0); R.add('basket', 11.0, 7.8, 0); R.add('basket', 11.6, 7.8, 0);
      R.against('vending', 'front', 7.0, { c: '#c1272d' }); R.against('dispenser', 'front', 6.0); R.against('rack', 'front', 1.6); R.add('plant', 0.5, 10.4, 0); R.add('palm', 15.4, 0.7, 0); R.add('sign_stand', 6.4, 9.4, 0, { c: Y });
      R.onWall('wallclock', 'right', 5.0); R.onWall('bannerhang', 'back', 5.7, { w: 1.2, c: B, c2: Y }); R.onWall('bannerhang', 'left', 3.4, { w: 1.2, c: '#c1272d', c2: Y });
      R.sign(C.title.toUpperCase(), 8.0, 3.2, 0.12, 5.4, 0.7, 0, { bg: B, fg: '#ffffff' });
      R.ceilingLights(4, 3, { color: '#f4f8ff' });
    },
    npcs: [ST('trader', 2, 'post', [[14.9, 7.4, 4.71], [14.9, 9.6, 4.71]], { pose: 'talk' }), CUST(4, [[3.0, 4.25, 3.14], [5.6, 6.15, 3.14], [8.2, 4.25, 3.14], [10.0, 8.5, 3.14]]), { role: 'student', n: 2, beh: 'wander', zone: [1.5, 8.2, 9.5, 10.2], hours: 'service' }, { role: 'staff', n: 1, beh: 'post', at: [[9.5, 10.2, 3.14]], pose: 'talk', hours: 'service', tag: 'manager' }, CLEAN([1, 3, 12, 10], { hours: 'clean' })]
  });

  /* ------------------------------------------------------------ BOOKSHOP */
  D.def('bookshop', {
    title: 'Bookshop', icon: '📚', w: 10, d: 7.8, h: 3.2, venue: 'bookshop', doorAt: 2.0,
    theme: { floor: { type: 'wood', c1: '#9a6a3c', c2: '#855a32' }, wall: '#efe3c8', wainscot: '#6b1f2e', trim: '#e9dcc0', curtain: '#6b1f2e', accent: '#e7d8b6' },
    windows: [{ wall: 'back', at: 5.0, w: 1.6 }, { wall: 'right', at: 3.0, w: 1.4 }, { wall: 'front', at: 6.0, w: 2.0 }],
    build(R, C) {
      [1.2, 3.4].forEach((x, i) => R.against('wallshelf', 'back', x, { w: 2.0, books: true, seed: i + 1 })); [6.9, 8.9].forEach((x, i) => R.against('wallshelf', 'back', x, { w: 1.9, books: true, seed: i + 8 }));
      R.against('wallshelf', 'left', 3.1, { w: 2.0, books: true, seed: 12 }); R.against('wallshelf', 'left', 5.3, { w: 2.0, books: true, seed: 14 }); R.against('bookrack', 'right', 5.6, { seed: 3 }); R.against('bookrack', 'right', 6.9, { seed: 6 });
      [3.0, 5.2, 7.4].forEach((x, i) => R.add('bookrack', x, 3.4, 0, { seed: i })); [3.0, 5.2].forEach((x, i) => R.add('bookrack', x, 5.1, 0, { seed: i + 4 }));
      R.add('counter', 8.0, 5.3, 0, { w: 2.6, c: '#6b1f2e', c2: '#e9dcc0', till: true }); R.add('plant', 8.9, 7.25, 0);
      R.add('rug', 1.9, 6.4, 0, { w: 2.8, d: 2.2, c: '#6b1f2e', c2: '#d9b24a' }); R.add('armchair', 1.0, 5.9, 90, { c: '#2f5d4a' }); R.add('armchair', 2.9, 5.9, 270, { c: '#2f5d4a' }); R.add('coffeetable', 2.0, 5.9, 0); R.add('lamp', 0.5, 7.2, 0); R.add('globe', 3.7, 7.0, 0);
      R.onWall('wallpic', 'back', 5.0, { c: '#c8562e', w: 1.0, h: .7, gap: 0 }); R.onWall('wallclock', 'right', 1.2); R.onWall('noticeboard', 'right', 4.4, { w: 1.0 });
      R.sign(C.title.toUpperCase(), 5.0, 2.8, 0.1, 3.0, 0.4, 0, { bg: '#6b1f2e', fg: '#f6e7b4' }); R.ceilingLights(3, 2, { color: '#ffe3b0' });
    },
    npcs: [ST('trader', 1, 'post', [[8.0, 4.4, 0]], { pose: 'talk' }), CUST(2, [[3.0, 4.25, 3.14], [5.2, 2.45, 0]], { pose: 'read' }), SITTERS(['armchair'], 1, { pose: 'read' }), CLEAN([1, 3, 9, 7], { hours: 'clean' })]
  });

  /* ------------------------------------------------------------ PHONE SHOP */
  D.def('phone_shop', {
    title: 'Phone Shop', icon: '📱', w: 7.5, d: 5.8, h: 3.0, venue: 'phone_shop', doorAt: 5.5,
    theme: { floor: { type: 'tile', c1: '#2b2f3a', c2: '#394050' }, wall: '#e8ecf4', wainscot: '#10141f', trim: '#f2b705', curtain: '#10141f', accent: '#1b2236' },
    windows: [{ wall: 'left', at: 3.0, w: 1.4 }, { wall: 'front', at: 2.0, w: 1.8 }, { wall: 'right', at: 2.0, w: 1.2 }],
    build(R, C) {
      const Y = '#f2b705';
      R.against('wallshelf', 'back', 1.4, { w: 2.0, seed: 31 }); R.against('wallshelf', 'back', 3.6, { w: 2.0, seed: 33 }); R.against('wallshelf', 'back', 5.7, { w: 1.8, seed: 35 }); R.against('cabinet', 'back', 7.0);
      R.add('counter', 3.9, 2.6, 0, { w: 4.2, c: '#10141f', c2: '#d9dde4', glass: true }); R.add('screen', 3.6, 0.2, 0, { w: 2.0, nb: true }); R.onWall('screen', 'back', 3.6, { w: 1.6, screen: '#143a7a' });
      R.add('gondola_phone', 2.0, 4.1, 0, {}); R.add('gondola_phone', 5.0, 4.1, 0, {}); R.against('gondola_phone', 'right', 3.9, {}); R.against('gondola_phone', 'left', 4.4, {});
      R.against('bench', 'front', 1.5, { n: 2, c: Y, c2: '#10141f' }); R.add('pcdesk', 6.7, 2.4, 0, {}); R.add('sign_stand', 6.4, 4.9, 0, { c: Y }); R.add('plant', 0.5, 5.45, 0);
      R.onWall('wallclock', 'left', 1.5); R.onWall('bannerhang', 'right', 1.0, { w: 1.0, c: '#143a7a', c2: Y }); R.onWall('wallpic', 'left', 5.0, { c: '#d6568a', w: .9, h: .6 });
      R.sign(C.title.toUpperCase(), 3.75, 2.55, 0.1, 3.2, 0.45, 0, { bg: '#10141f', fg: Y }); R.ceilingLights(3, 2, { color: '#f0f4ff' });
    },
    npcs: [ST('trader', 1, 'post', [[3.4, 1.7, 0]], { pose: 'talk' }), ST('staff', 1, 'post', [[5.2, 1.7, 0]], { pose: 'type' }), CUST(2, [[2.0, 3.45, 0], [5.0, 3.45, 0]]), SITTERS(['bench'], 1), CLEAN([1, 3.5, 7, 5.3], { hours: 'clean' })]
  });

  /* ------------------------------------------------------------ PRINT SHOP */
  D.def('print_shop', {
    title: 'Print & Copy Centre', icon: '🖨️', w: 8.5, d: 6.2, h: 3.0, venue: 'print_shop', doorAt: 6.5,
    theme: { floor: { type: 'concrete', c1: '#cfd3d8', c2: '#bbc0c7' }, wall: '#f4f5f7', wainscot: '#1f4fa0', trim: '#ffffff', curtain: '#1f4fa0', accent: '#e8f0fb' },
    windows: [{ wall: 'back', at: 2.0, w: 1.4 }, { wall: 'right', at: 3.0, w: 1.4 }, { wall: 'front', at: 2.5, w: 1.8 }],
    build(R, C) {
      const B = '#1f4fa0', O = '#f08a1c';
      R.against('wallshelf', 'back', 4.2, { w: 2.0, seed: 41 }); R.against('wallshelf', 'back', 6.35, { w: 1.9, seed: 43 }); R.against('cabinet', 'back', 7.7); R.against('cabinet', 'back', 0.6);
      R.add('copier', 4.5, 1.6, 0); R.nb;
      R.add('counter', 4.7, 3.5, 0, { w: 3.8, c: B, c2: '#f1ede4', till: true });
      R.add('copier', 1.9, 1.8, 0, {}); R.add('printer', 6.2, 1.5, 0, {});
      R.against('pcdesk', 'left', 3.4, {}); R.against('pcdesk', 'left', 4.9, {}); R.against('desk', 'front', 2.9, { w: 1.6, c: '#e8e2d2' }); R.add('chair', 2.9, 5.15, 0, { c: B });
      R.against('printer', 'right', 4.2, {}); R.against('noticeboard', 'right', 5.5, { w: 1.4 }); R.add('sign_stand', 4.6, 4.8, 0, { c: O });
      R.add('crate', 7.6, 5.6, 0, { n: 2, c: '#c8b78c' }); R.against('dispenser', 'front', 0.5); R.add('plant', 0.5, 0.6, 0, { nb: true });
      R.onWall('wallclock', 'left', 1.5); R.onWall('whiteboard', 'right', 2.0, { w: 1.2 }); R.onWall('wallpic', 'left', 5.8, { c: O, w: .9, h: .6 });
      R.sign(C.title.toUpperCase(), 4.2, 2.65, 0.1, 4.2, 0.45, 0, { bg: B, fg: '#ffffff' }); R.ceilingLights(3, 2, { color: '#f4f8ff' });
    },
    npcs: [ST('staff', 1, 'post', [[4.6, 2.65, 0]], { pose: 'type' }), CUST(2, [[3.8, 4.3, 0], [6.0, 4.3, 0]]), SITTERS(['chair'], 1), CLEAN([1, 4, 8, 6], { hours: 'clean' })]
  });

  /* ------------------------------------------------------------ CYBER CAFE */
  D.def('cyber_cafe', {
    title: 'Cyber Cafe', icon: '💻', w: 11, d: 7.8, h: 3.0, venue: 'cyber_cafe', doorAt: 8.5,
    theme: { floor: { type: 'carpet', c1: '#27324a', c2: '#2e3b57' }, wall: '#2e3b5a', wainscot: '#141a2b', trim: '#35d0e6', curtain: '#141a2b', accent: '#22304f' },
    windows: [{ wall: 'left', at: 5.0, w: 1.4 }, { wall: 'right', at: 2.0, w: 1.2 }, { wall: 'front', at: 3.0, w: 1.6 }],
    build(R, C) {
      const CY = '#35d0e6';
      [2.4, 3.9, 5.4, 6.9, 8.4, 9.9].forEach(x => R.against('pcdesk', 'back', x, { n: 1, c: '#e8ecf4' })); // row 1 along back wall (starts at x 2.4 so the dispenser/vending corner stays reachable)
      [2.0, 3.5, 5.0, 6.5].forEach(x => R.add('pcdesk', x, 3.1, 0, { c: '#e8ecf4' })); [2.0, 3.5, 5.0, 6.5].forEach(x => R.add('pcdesk', x, 5.3, 0, { c: '#e8ecf4' }));
      R.against('printer', 'right', 2.5, {}); R.against('desk', 'right', 4.2, { w: 1.4 }); R.add('chair', 9.6, 4.2, 90, { c: '#35d0e6' });
      R.add('counter', 9.75, 6.0, 0, { w: 2.3, c: '#141a2b', c2: '#35d0e6' }); R.against('dispenser', 'left', 0.8); R.against('vending', 'left', 1.9, { c: '#1f5fb0' });
      R.add('sofa', 0.9, 6.8, 90, { c: '#35d0e6', n: 2 }); R.add('coffeetable', 2.9, 6.8, 0); R.add('plant', 10.4, 7.3, 0); R.add('lamp', 0.4, 7.4, 0, { nb: true });
      R.onWall('screen', 'left', 4.0, { w: 2.0, screen: '#143a7a' }); R.onWall('wallclock', 'right', 6.5); R.onWall('noticeboard', 'left', 7.0, { w: 1.2 }); R.onWall('menuboard', 'right', 5.0, { w: 1.6, c: '#1b2d4f', c2: CY });
      R.sign(C.title.toUpperCase(), 8.8, 2.55, 7.6, 3.6, 0.45, 180, { bg: '#141a2b', fg: CY }); R.ceilingLights(4, 2, { color: '#dfeaff' });
    },
    npcs: [ST('staff', 1, 'post', [[8.8, 5.2, 0]], { pose: 'type' }), SITTERS(['pcdesk'], 5, { pose: 'type', hours: 'study' }), CUST(1, [[5.0, 6.6, 3.14]]), CLEAN([1, 6, 10, 7.5], { hours: 'clean' })]
  });

  /* ------------------------------------------------------------ BAKERY */
  D.def('bakery', {
    title: 'Bakery', icon: '🥐', w: 8.5, d: 6.4, h: 3.0, venue: 'bakery', doorAt: 6.4,
    theme: { floor: { type: 'tile', c1: '#f3e2cc', c2: '#e6cba8' }, wall: '#fbeedd', wainscot: '#8a4a28', trim: '#ffffff', curtain: '#e8a0b4', accent: '#f8dcc0' },
    windows: [{ wall: 'back', at: 1.2, w: 1.2 }, { wall: 'left', at: 3.2, w: 1.5 }, { wall: 'front', at: 2.2, w: 2.0 }],
    build(R, C) {
      const BR = '#8a4a28', PK = '#e8789c';
      R.against('oven', 'back', 6.8); R.against('breadrack', 'back', 4.6); R.against('breadrack', 'back', 3.2); R.against('freezer', 'back', 1.8, { c: PK }); R.against('shopfridge', 'back', 0.6, { c: PK });
      R.add('display_case', 2.4, 2.9, 0, { w: 1.6 }); R.add('display_case', 4.1, 2.9, 0, { w: 1.7 }); R.add('counter', 6.9, 2.9, 0, { w: 2.4, c: BR, c2: '#f1ede4', till: true });
      R.add('table_round', 2.2, 4.8, 0, { c: '#f4d9b0' }); R.add('chair', 1.4, 4.8, 90, { c: PK }); R.add('chair', 3.0, 4.8, 270, { c: PK });
      R.add('table_round', 4.6, 4.8, 0, { c: '#f4d9b0' }); R.add('chair', 3.8, 4.8, 90, { c: PK }); R.add('chair', 5.4, 4.8, 270, { c: PK });
      R.add('dispenser', 7.8, 4.4, 0); R.add('sign_stand', 6.4, 4.9, 0, { c: PK }); R.add('plant', 0.5, 5.8, 0); R.add('rug', 7.0, 5.6, 0, { w: 2.0, d: 1.0, c: PK, c2: '#fff' });
      R.onWall('menuboard', 'left', 1.6, { w: 1.4, c: '#3a2a20', c2: '#f4c6d6' }); R.onWall('wallclock', 'right', 3.0); R.onWall('wallpic', 'left', 5.0, { c: '#e8a0b4', w: .9, h: .6 });
      R.sign(C.title.toUpperCase(), 4.2, 2.6, 0.1, 3.4, 0.45, 0, { bg: PK, fg: '#fff5e0' }); R.ceilingLights(3, 2, { color: '#ffe8c4' });
    },
    npcs: [ST('cook', 1, 'post', [[6.9, 2.0, 0]], { pose: 'talk', tag: 'baker' }), ST('cook', 1, 'post', [[6.4, 1.4, 3.14]], { pose: 'cook' }), CUST(2, [[2.4, 3.9, 3.14], [4.1, 3.9, 3.14]]), SITTERS(['chair'], 2), CLEAN([1, 3.8, 8, 6], { hours: 'clean' })]
  });

  /* ------------------------------------------------------------ RESTAURANT: amala | suya | fastfood | default */
  D.def('restaurant', {
    title: 'Restaurant', icon: '🍲', w: 12, d: 8.2, h: 3.1, venue: 'restaurant', doorAt: 9.5,
    theme: { floor: { type: 'tile', c1: '#eadfc6', c2: '#d6c6a4' }, wall: '#f4ead2', wainscot: '#7a3b24', trim: '#ffffff', curtain: '#b3362e' },
    windows: [{ wall: 'back', at: 7.5, w: 1.6 }, { wall: 'left', at: 5.0, w: 1.4 }, { wall: 'front', at: 3.0, w: 2.0 }, { wall: 'right', at: 3.0, w: 1.4 }],
    build(R, C) {
      const v = C.variant;
      if (v === 'amala') {
        Object.assign(R.theme, { floor: { type: 'terrazzo', c1: '#c9bfa8', c2: '#8a7a5a' }, wall: '#2f7a3f', wainscot: '#e5b93a', curtain: '#e08a2e', trim: '#f6e7b4' });
        const G = '#2f7a3f';
        R.against('stove_pot', 'back', 1.6); R.against('stove_pot', 'back', 3.2); R.against('warmer', 'back', 5.2, { c: '#b4bcc5' }); R.against('freezer', 'back', 6.7, { c: '#e5b93a' }); R.against('fridge', 'back', 7.6); R.against('shopfridge', 'back', 8.6, { c: '#e08a2e' });
        R.add('counter', 4.2, 3.0, 0, { w: 6.0, c: '#7a3b24', c2: '#f1ede4', till: false });
        [3.4, 8.4].forEach(tx => { const z = 6.0; R.add('table', tx, z, 0, { w: 3.4, d: .8, c: '#b07a4a' }); R.add('bench', tx, z - .78, 0, { n: 6, c: '#6b4428' }); R.add('bench', tx, z + .78, 180, { n: 6, c: '#6b4428' }); });   // two long tables; wide aisles so every bench seat is reachable
        R.add('table', 9.3, 3.0, 0, { w: 1.2, d: .8, c: '#b07a4a' }); R.add('chair', 8.8, 3.8, 180, { c: '#6b4428' }); R.add('chair', 9.8, 3.8, 180, { c: '#6b4428' });
        R.against('tvunit', 'right', 5.2, {}); R.against('dispenser', 'right', 1.0); R.add('plant', 11.5, 7.6, 0); R.add('palm', 0.6, 7.5, 0); R.add('sign_stand', 7.6, 3.5, 0, { c: '#e5b93a' });
        R.onWall('menuboard', 'left', 2.0, { w: 1.8, c: '#1f3a24', c2: '#e5b93a' }); R.onWall('bannerhang', 'left', 7.0, { w: 1.2, c: '#e08a2e', c2: '#2f7a3f' }); R.onWall('wallclock', 'right', 7.0);
        R.sign((C.name ? C.title : 'AMALA SPOT').toUpperCase(), 4.5, 2.7, 0.1, 4.4, 0.55, 0, { bg: '#e5b93a', fg: '#2f3a1f' }); R.ceilingLights(3, 2, { color: '#ffd9a0' });
      } else if (v === 'suya') {
        Object.assign(R.theme, { floor: { type: 'concrete', c1: '#4a3f38', c2: '#3a312b' }, wall: '#3b2a22', wainscot: '#b3362e', curtain: '#8a1c1c', trim: '#e5b93a' });
        R.against('grill', 'back', 1.6); R.against('grill', 'back', 3.3); R.against('freezer', 'back', 5.0, { c: '#b3362e' }); R.against('shopfridge', 'back', 6.2, { c: '#e5b93a' }); R.against('fridge', 'back', 7.3);
        R.add('counter', 3.3, 3.0, 0, { w: 4.4, c: '#b3362e', c2: '#3a2a20', till: true });
        [1.6, 3.0, 4.4, 5.8].forEach(x => R.add('barstool', x + .2, 4.0, 0, { c: '#e5b93a' }));
        R.add('table', 9.0, 4.6, 0, { w: 1.4, d: .8, c: '#6b4428' }); R.add('bench', 9.0, 3.9, 0, { n: 3, c: '#3a2a20' }); R.add('bench', 9.0, 5.3, 180, { n: 3, c: '#3a2a20' });
        R.add('table', 9.0, 6.9, 0, { w: 1.4, d: .8, c: '#6b4428' }); R.add('bench', 9.0, 6.2, 0, { n: 3, c: '#3a2a20' }); R.add('bench', 9.0, 7.6, 180, { n: 3, c: '#3a2a20' });
        R.add('table', 5.0, 6.4, 0, { w: 1.4, d: .8, c: '#6b4428' }); R.add('stool', 3.9, 6.4, 0, { c: '#b3362e' }); R.add('stool', 6.1, 6.4, 0, { c: '#b3362e' });
        R.add('table_round', 2.2, 6.4, 0, { c: '#6b4428' }); R.add('stool', 1.3, 6.4, 0, { c: '#b3362e' }); R.add('stool', 3.1, 6.4, 0, { c: '#b3362e' });
        R.against('tvunit', 'right', 1.5, {}); R.add('sign_stand', 7.2, 3.8, 0, { c: '#b3362e' }); R.add('crate', 11.3, 7.5, 0, { n: 2 }); R.add('lamp', 0.4, 7.7, 0, { nb: true });
        R.onWall('menuboard', 'left', 2.5, { w: 1.8, c: '#1b1b1f', c2: '#ff9a2e' }); R.onWall('wallclock', 'right', 5.0); R.onWall('bannerhang', 'left', 6.0, { w: 1.2, c: '#b3362e', c2: '#e5b93a' });
        R.sign((C.name ? C.title : 'SUYA SPOT').toUpperCase(), 3.3, 2.7, 0.1, 4.0, 0.5, 0, { bg: '#b3362e', fg: '#ffd27a' }); R.ceilingLights(3, 2, { color: '#ffb866', pool: 3.2 });
      } else if (v === 'fastfood') {
        Object.assign(R.theme, { floor: { type: 'tile', c1: '#f4f1ea', c2: '#d8d2c4' }, wall: '#fff4d6', wainscot: '#c1121f', curtain: '#c1121f', trim: '#ffcc00' });
        R.against('freezer', 'back', 0.8, { c: '#c1121f' }); R.against('oven', 'back', 2.4); R.against('warmer', 'back', 4.2, { c: '#d9d5cb' }); R.against('fridge', 'back', 5.6); R.against('shopfridge', 'back', 6.8, { c: '#c1121f' });
        R.add('counter', 7.5, 3.0, 0, { w: 7.0, c: '#c1121f', c2: '#fff4d6', glass: false, till: true });
        R.onWall('menuboard', 'back', 9.6, { w: 1.8, c: '#222', c2: '#ffcc00' }); R.onWall('menuboard', 'back', 11.4, { w: 1.4, c: '#222', c2: '#ffcc00', seed: 3 });
        [[1.5, 3.3], [1.5, 5.5]].forEach(p => R.add('booth', p[0] + .5, p[1], 90, { c: '#c1121f' })); [[5.0, 4.6], [5.0, 6.9]].forEach(p => R.add('booth', p[0], p[1], 0, { c: '#c1121f' }));   // booth aisles widened so every booth seat is reachable
        R.add('table_round', 10.2, 5.2, 0, { c: '#ffcc00' }); R.add('stool', 9.4, 5.2, 0, { c: '#c1121f' }); R.add('stool', 11.0, 5.2, 0, { c: '#c1121f' }); R.add('table_round', 10.2, 7.0, 0, { c: '#ffcc00' }); R.add('stool', 9.4, 7.0, 0, { c: '#c1121f' }); R.add('stool', 11.0, 7.0, 0, { c: '#c1121f' });
        R.against('dispenser', 'right', 1.0); R.add('plant', 0.5, 7.6, 0); R.onWall('screen', 'right', 3.6, { w: 1.6, screen: '#7a1a1a' }); R.onWall('wallclock', 'left', 5.0);
        R.sign((C.name ? C.title : 'FAST FOOD').toUpperCase(), 7.5, 2.8, 0.1, 4.4, 0.6, 0, { bg: '#c1121f', fg: '#ffcc00' }); R.ceilingLights(4, 2, { color: '#fff4e0' });
      } else {
        const T = '#7a3b24';
        R.against('stove_pot', 'back', 1.6); R.against('warmer', 'back', 3.4); R.against('freezer', 'back', 5.0, { c: '#b3362e' }); R.against('fridge', 'back', 6.1); R.against('shopfridge', 'back', 7.2, { c: '#3d8a4c' });
        R.add('counter', 3.4, 3.0, 0, { w: 4.8, c: T, c2: '#f1ede4', till: true });
        [[2.0, 5.0], [5.2, 5.0], [8.4, 5.0], [2.0, 7.0], [5.2, 7.0], [8.4, 7.0]].forEach(p => R.add('dining', p[0], p[1], 0, {}));
        R.against('tvunit', 'right', 1.6, {}); R.against('dispenser', 'right', 3.0); R.add('plant', 11.5, 7.6, 0); R.add('palm', 0.5, 0.7, 0, { nb: true }); R.add('rug', 10.0, 2.6, 0, { w: 2.4, d: 1.4, c: '#b3362e', c2: '#e5b93a' });
        R.onWall('menuboard', 'left', 2.2, { w: 1.8, c: '#2f2a24', c2: '#e5b93a' }); R.onWall('wallpic', 'left', 6.0, { c: '#e08a2e', w: 1.0, h: .7 }); R.onWall('wallclock', 'right', 6.0);
        R.sign(C.title.toUpperCase(), 3.4, 2.7, 0.1, 3.8, 0.5, 0, { bg: T, fg: '#f6e7b4' }); R.ceilingLights(3, 2, { color: '#ffe8bf' });
      }
    },
    npcs: [
      { role: 'cook', n: 2, beh: 'post', at: [[1.6, 1.45, 3.14], [3.3, 1.45, 3.14]], pose: 'cook', hours: 'service', tag: 'cook' },
      { role: 'trader', n: 1, beh: 'post', at: [[4.6, 2.2, 0]], pose: 'talk', hours: 'service' },
      SITTERS(['dining', 'bench', 'booth', 'barstool', 'stool', 'chair'], 4, { pose: 'eat', hours: 'social' }), CUST(1, [[7.0, 4.6, 3.14]]), CLEAN([1, 4, 11, 8], { hours: 'clean' })
    ]
  });

  /* ------------------------------------------------------------ SALON */
  D.def('salon', {
    title: 'Salon', icon: '💇', w: 9.5, d: 6.8, h: 3.0, venue: 'salon', doorAt: 7.5,
    theme: { floor: { type: 'tile', c1: '#f4f0f6', c2: '#2a2230' }, wall: '#f3dff0', wainscot: '#8a3f8f', trim: '#ffffff', curtain: '#d6568a', accent: '#ecc9e6' },
    windows: [{ wall: 'left', at: 5.0, w: 1.4 }, { wall: 'front', at: 2.4, w: 2.0 }, { wall: 'right', at: 2.0, w: 1.2 }],
    build(R, C) {
      const P = '#d6568a', V = '#8a3f8f';
      [2.0, 3.5, 5.0, 6.5].forEach((x, i) => { R.onWall('mirror', 'back', x); R.add('salonchair', x, 1.5, 0, { c: i % 2 ? P : V }); });
      R.against('cabinet', 'back', 8.6, {}); R.against('washbasin', 'right', 3.3, {}); R.against('washbasin', 'right', 4.5, { }); R.against('dryer', 'left', 2.0, { c: V }); R.against('dryer', 'left', 3.3, { c: P });
      R.add('wigs', 4.0, 6.3, 0, { nb: true }); R.against('wigs', 'front', 2.0, {}); R.against('wallshelf', 'left', 4.6, { w: 1.6, seed: 52 });
      R.add('counter', 6.2, 4.2, 0, { w: 1.6, c: V, c2: '#f1ede4', till: true }); R.add('sofa', 2.4, 5.5, 0, { c: P, n: 2 }); R.add('coffeetable', 2.4, 4.4, 0);
      R.against('tvunit', 'front', 5.2, {}); R.add('rug', 4.8, 3.4, 0, { w: 4.0, d: 1.4, c: V, c2: '#f5d0ea' }); R.add('plant', 0.5, 6.3, 0); R.add('palm', 9.0, 0.6, 0, { nb: true }); R.add('lamp', 9.0, 6.2, 0, {});
      R.onWall('wallclock', 'right', 6.0); R.onWall('wallpic', 'left', 4.6, { c: P, w: .8, h: .6 }); R.onWall('menuboard', 'right', 1.0, { w: 1.2, c: '#3a1f3a', c2: '#f5a0d0' });
      R.sign(C.title.toUpperCase(), 4.75, 2.65, 0.1, 3.4, 0.45, 0, { bg: V, fg: '#ffe0f4' }); R.ceilingLights(3, 2, { color: '#fff0fa' });
    },
    npcs: [{ role: 'stylist', n: 3, beh: 'post', at: [[2.0, 2.4, 0], [3.5, 2.4, 0], [5.0, 2.4, 0]], pose: 'cook', hours: 'service' }, ST('trader', 1, 'post', [[6.2, 3.3, 0]], { pose: 'talk' }), { role: 'student', n: 2, beh: 'sit', sit: ['salonchair', 'dryer'], hours: 'service' }, SITTERS(['sofa'], 1), CLEAN([1, 3.5, 9, 6.3], { hours: 'clean' })]
  });

  /* ------------------------------------------------------------ PETROL SHOP (filling-station kiosk) */
  D.def('petrol_shop', {
    title: 'Filling Station Shop', icon: '⛽', w: 8, d: 5.8, h: 3.0, venue: 'petrol_shop', doorAt: 4.0,
    theme: { floor: { type: 'tile', c1: '#e8e6e0', c2: '#cfcbc0' }, wall: '#fff6e0', wainscot: '#00833e', trim: '#e11d2a', curtain: '#00833e' },
    windows: [{ wall: 'left', at: 2.8, w: 2.0 }, { wall: 'front', at: 1.8, w: 2.2 }, { wall: 'front', at: 6.2, w: 2.2 }, { wall: 'right', at: 2.8, w: 2.0 }],
    build(R, C) {
      const G = '#00833e', Rd = '#e11d2a';
      R.against('shopfridge', 'back', 0.7, { c: Rd }); R.against('shopfridge', 'back', 1.8, { c: G }); R.against('shopfridge', 'back', 2.9, { c: Rd }); R.against('oilrack', 'back', 5.0); R.against('wallshelf', 'back', 6.9, { w: 1.4, seed: 61 });
      R.add('counter', 5.2, 3.0, 0, { w: 3.4, c: G, c2: '#f1ede4', till: true }); R.add('gondola', 2.2, 4.2, 0, { w: 2.0, c: Rd, seed: 12 }); R.against('gondola', 'left', 3.8, { w: 1.6, c: G, seed: 14 });
      R.against('vending', 'right', 4.8, { c: Rd }); R.against('dispenser', 'right', 2.3); R.add('tyres', 7.2, 1.2, 0, { n: 3, nb: false }); R.add('sign_stand', 6.4, 4.3, 0, { c: Rd }); R.add('basket', 3.6, 4.9, 0); R.add('plant', 0.5, 5.3, 0);
      R.onWall('wallclock', 'left', 1.2); R.onWall('menuboard', 'right', 4.6, { w: 1.2, c: '#102a18', c2: '#ffcc00' }); R.onWall('wallpic', 'left', 5.0, { c: '#f0b429', w: .9, h: .6 });
      R.sign(C.title.toUpperCase(), 4.0, 2.65, 0.1, 4.2, 0.5, 0, { bg: G, fg: '#ffffff' }); R.ceilingLights(3, 2, { color: '#f4fff4' });
    },
    npcs: [ST('trader', 1, 'post', [[5.2, 2.1, 0]], { pose: 'talk' }), ST('staff', 1, 'post', [[6.6, 2.1, 0]], { pose: 'type', hours: 'day' }), CUST(2, [[2.2, 3.3, 0], [5.2, 4.2, 3.14]]), CLEAN([1, 3.6, 7, 5.4], { hours: 'clean' })]
  });

  /* ------------------------------------------------------------ CAR WASH (office + waiting lounge) */
  D.def('carwash', {
    title: 'Car Wash', icon: '🚿', w: 9, d: 6.4, h: 3.0, venue: 'carwash', doorAt: 4.5,
    theme: { floor: { type: 'concrete', c1: '#c9ced6', c2: '#b4bac4' }, wall: '#eaf2fa', wainscot: '#1f78c8', trim: '#ffffff', curtain: '#1f78c8', accent: '#d8e8f6' },
    windows: [{ wall: 'left', at: 3.2, w: 2.2 }, { wall: 'front', at: 1.8, w: 1.8 }, { wall: 'right', at: 3.2, w: 2.2 }, { wall: 'back', at: 2.2, w: 1.4 }],
    build(R, C) {
      const B = '#1f78c8';
      R.against('desk', 'back', 6.2, { w: 1.6, c: '#e8e2d2' }); R.add('chair', 6.2, 1.5, 0, { c: B }); R.against('cabinet', 'back', 8.2); R.against('filecab', 'back', 7.4); R.add('pcdesk', 4.2, 1.2, 0, {}); R.nb;
      R.add('counter', 6.0, 3.3, 0, { w: 3.6, c: B, c2: '#f1ede4', till: true });
      R.add('sofa', 1.6, 5.4, 0, { c: '#2a3a52' }); R.add('armchair', 3.4, 5.6, 0, { c: '#2a3a52' }); R.add('coffeetable', 2.0, 4.4, 0); R.add('tvunit', 0.5, 3.0, 90, {}); R.add('rug', 2.4, 4.9, 0, { w: 3.4, d: 2.0, c: '#9bb7cc', c2: '#1f78c8' });
      R.against('vending', 'right', 5.8, { c: '#1f78c8' }); R.against('dispenser', 'right', 4.4); R.against('fridge', 'back', 0.6); R.against('shopfridge', 'back', 1.8, { c: '#c1272d' });
      R.add('tyres', 7.55, 5.6, 0, { n: 4 }); R.add('bucket', 6.5, 5.8, 0, {}); R.add('bucket', 6.1, 5.4, 0, { nb: true }); R.add('sign_stand', 5.0, 5.0, 0, { c: '#ffcc00' }); R.add('plant', 0.5, 6.1, 0);
      R.onWall('hosereel', 'left', 1.6); R.onWall('menuboard', 'back', 3.2, { w: 1.6, c: '#0e2a46', c2: '#7fd0ff' }); R.onWall('wallclock', 'right', 1.2); R.onWall('noticeboard', 'right', 2.6, { w: 1.0 });
      R.sign(C.title.toUpperCase(), 4.5, 2.6, 0.1, 3.6, 0.5, 0, { bg: B, fg: '#ffffff' }); R.ceilingLights(3, 2, { color: '#f0f8ff' });
    },
    npcs: [ST('staff', 1, 'post', [[6.0, 2.3, 0]], { pose: 'type' }), ST('trader', 1, 'post', [[7.4, 1.4, 0]], { pose: 'talk', hours: 'day' }), SITTERS(['sofa', 'armchair'], 2), CUST(1, [[6.0, 4.4, 3.14]]), CLEAN([1, 3.6, 8, 6], { hours: 'clean' })]
  });
})(typeof window !== 'undefined' ? window : globalThis);
