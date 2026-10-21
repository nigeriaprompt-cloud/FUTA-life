/* ==========================================================================
   tpl_vault.js — everything 3D for the Bank VAULT and for the JAIL cell. Rules + economy: docs/VAULT.md

   Furniture added to FutaFurn:   vaultdoor (steel door with wheel, bolts, keypad)  ·  cellbars  ·  windowbars  ·  cellwc
   Template added:                jail_cell   (venue 'jail' — never chosen by classify(); jail.js builds it when a player is arrested)
   Helper:                        FutaVaultDoor.attach(scene, piece) → { set(state, secs), dispose() }
                                  a glowing status panel above the door: 'full' | 'robbery' | 'empty' (with refill countdown) | 'unknown'

   The vault DOOR itself is only placed by tpl_bank.js, and only in the Bank (building id VAULT_BUILDING below).
   Change the door's look here; change the numbers (amount, seconds, cooldowns) only in supabase/13_vault.sql (app_config 'vault') and vault-core.js.
   ========================================================================== */
(function (g) {
  'use strict';
  const F = g.FutaFurn, T = g.THREE, K = g.FutaKit, D = g.FutaTemplates, P = F.P;
  const VAULT_BUILDING = 'building_mv0q4b841p';                       // the vault Bank on the map (same id as app_config 'vault'.building_id)
  const isVaultBank = (C) => !!C && (C.building && C.building.id === VAULT_BUILDING);

  /* ------------------------------------------------------------ the vault door (front faces +Z; put it against a wall with R.against) */
  F.def('vaultdoor', { size: [2.3, .5], spot: [0, .75, Math.PI], draw(b, o) {
    const steel = '#30353b', plate = '#444b53', chrome = '#cfd6dd', body = '#8e979f', gold = o.c2 || '#d9b24a', cy = 1.2;
    b.box(0, 0, -.05, 2.3, 2.5, .4, steel);                                                       // the wall block the door sits in
    b.box(0, .08, .15, 2.12, 2.34, .03, plate);                                                   // raised inner frame
    for (const sx of [-1, 1]) for (const y of [.18, 2.3]) b.cyl(sx * 1.0, y, .19, .035, .03, chrome, { seg: 8 });   // frame rivets
    b.disc(0, cy, .16, .99, .05, '#15181c');                                                     // dark recess
    b.disc(0, cy, .2, .94, .05, chrome);                                                         // chrome ring
    b.disc(0, cy, .24, .85, .06, body);                                                          // door slab
    b.disc(0, cy, .29, .73, .03, '#a9b2ba');                                                     // bevel
    for (let i = 0; i < 12; i++) { const a = i / 12 * Math.PI * 2; b.disc(Math.sin(a) * .79, cy + Math.cos(a) * .79, .28, .042, .05, '#e4e9ee', { seg: 8 }); }   // bolts
    b.disc(0, cy, .31, .3, .05, gold); b.disc(0, cy, .35, .22, .04, '#c4cbd2'); b.disc(0, cy, .38, .07, .05, '#8a6d1f', { seg: 10 });   // hub
    for (let i = 0; i < 6; i++) { const a = i / 6 * Math.PI * 2; b.boxR(0, cy, .4, .05, .52, .05, -a, '#e9eef2'); b.sph(Math.sin(a) * .56, cy + Math.cos(a) * .56, .42, .06, gold, { seg: 8 }); }   // wheel handle
    for (const y of [.55, 1.2, 1.85]) b.box(-.98, y, .2, .16, .12, .08, '#59616a');                // hinges
    for (const y of [.55, 1.2, 1.85]) b.box(.9, y, .2, .22, .07, .07, chrome);                     // locking bars
    b.box(1.04, .8, .17, .24, .5, .04, '#1b1f23');                                               // keypad panel
    b.box(1.04, 1.18, .2, .18, .09, .01, '#47e08b', { layer: 'glow' });
    for (let r = 0; r < 4; r++) for (let c = 0; c < 3; c++) b.box(.96 + c * .08, .86 + r * .08, .2, .05, .05, .015, '#9aa3ab');
    b.box(0, .0, .15, 2.3, .06, .1, '#20242a');                                                  // kick plate
  } });

  /* ------------------------------------------------------------ jail furniture */
  F.def('cellbars', { size: [3, .1], draw(b, o) {
    const w = o.w || 3, h = o.h || 3.0, c = o.c || '#2a2d33', n = Math.max(2, Math.round(w / .14)); this.size = [w, .1];
    for (let i = 0; i <= n; i++) b.box(-w / 2 + i * w / n, 0, 0, .03, h, .03, c, { ao: false });
    for (const y of [.18, 1.15, h - .12]) b.box(0, y, 0, w, .07, .05, '#3a3e45', { ao: false });
    if (o.post) for (const s of [-1, 1]) b.box(s * (w / 2 - .03), 0, 0, .09, h, .09, '#454a52', { ao: false });
  } });
  F.def('windowbars', { size: [1, .1], blocker: false, wall: true, draw(b, o) {
    const w = o.w || .95, y0 = o.y0 || 2.15, h = o.h || .55; this.size = [w, .1];
    for (let i = 0; i < 6; i++) b.box(-w / 2 + .09 + i * (w - .18) / 5, y0, 0, .03, h, .03, '#1f2226', { ao: false });
    b.box(0, y0 - .02, 0, w + .06, .04, .07, '#2c3036', { ao: false }); b.box(0, y0 + h - .02, 0, w + .06, .04, .07, '#2c3036', { ao: false });
  } });
  F.def('cellwc', { size: [.7, .55], draw(b) {
    b.box(0, 0, -.06, .5, .42, .4, '#aeb6bd'); b.cyl(0, .42, -.02, .22, .06, '#c9d0d6', { seg: 14, r2: .2 }); b.box(0, .62, -.2, .34, .26, .1, '#98a1a8'); b.box(.3, 0, -.18, .22, .1, .2, '#aeb6bd');
    b.box(.32, .7, -.2, .3, .08, .22, '#c0c7cd'); b.cyl(.32, .78, -.26, .02, .1, '#7a838a', { seg: 6 }); b.cyl(.32, .0, -.12, .03, .7, '#7a838a', { seg: 6 });
  } });

  /* ------------------------------------------------------------ the jail cell template (see jail.js)
     Room 7.4 × 7.4 m. The CELL is z 0…4.6 (bars at z 4.6, gate gap x 3.0…4.4), the CORRIDOR z 4.6…7.4 (a police officer patrols it). */
  const CELL = { w: 7.4, d: 7.4, barsZ: 4.6, gateX0: 3.0, gateX1: 4.4, bunk: { x: 1.25, z: 1.35 }, sit: { x: 1.9, z: 2.55 } };
  D.def('jail_cell', {
    title: 'Police cell', icon: '⛓️', w: CELL.w, d: CELL.d, h: 3.2, venue: 'jail', doorAt: CELL.w / 2, security: false,
    theme: { floor: { type: 'concrete', c1: '#5a5e63', c2: '#4b4f54' }, wall: '#7b8986', wainscot: '#2e3a39', trim: '#3c4443', frame: '#2b3034', curtain: null, outer: '#555e5b', doorFrame: '#32383c' },
    windows: [{ wall: 'back', at: 5.2, w: .95, h: .55, sill: 2.15, curtain: false }],
    build(R, C) {
      R.add('bunk', CELL.bunk.x, CELL.bunk.z, 0, { inter: false, c: '#3a3f45', seed: 2 }); R.add('bunk', 6.15, CELL.bunk.z, 0, { inter: false, c: '#3a3f45', seed: 5 });
      R.against('cellwc', 'back', 3.7, { inter: false }); R.add('stool', 4.9, 3.3, 0, { inter: false, c: '#6b7078' }); R.add('bucket', 2.9, 3.9, 0, { inter: false });
      R.onWall('windowbars', 'back', 5.2, { inter: false });
      R.add('cellbars', CELL.gateX0 / 2, CELL.barsZ, 0, { w: CELL.gateX0, inter: false, post: true }); R.add('cellbars', (CELL.gateX1 + CELL.w) / 2, CELL.barsZ, 0, { w: CELL.w - CELL.gateX1, inter: false, post: true });
      R.add('bench', 1.4, 6.7, 0, { inter: false, n: 3 }); R.onWall('noticeboard', 'right', 5.9, { inter: false, w: 1.2 }); R.add('plant', 6.9, 6.9, 0, { inter: false });
      R.sign('CELL 3', 3.7, 2.55, .06, 1.0, .3, 0, { bg: '#1b1e22', fg: '#f5c542' });
      R.light(3.7, 2.2, { color: '#ffd9a0', pool: 5.2, fixture: true, y: 2.7 }); R.light(3.7, 6.0, { color: '#d9e6ff', pool: 3.6, fixture: true });
    },
    npcs: []                                                              // the officer is created by jail.js (it is not part of the building engine)
  });
  D.JAIL = CELL;

  /* ------------------------------------------------------------ status panel above the vault door */
  const STATES = {
    full: { text: 'VAULT FULL', col: '#4ade80', bg: '#06281a' },
    robbery: { text: 'ROBBERY IN PROGRESS', col: '#ff5a5a', bg: '#2d0a0a', blink: true },
    empty: { text: 'EMPTY', col: '#fbbf24', bg: '#2a1d04' },
    unknown: { text: 'VAULT', col: '#9aa3ab', bg: '#15181c' }
  };
  function attach(scene, piece, o) {
    o = o || {}; const cv = document.createElement('canvas'); cv.width = 512; cv.height = 96; const x = cv.getContext('2d'), tex = new T.CanvasTexture(cv); tex.encoding = T.sRGBEncoding;
    const mesh = new T.Mesh(new T.PlaneGeometry(1.55, .29), new T.MeshBasicMaterial({ map: tex, toneMapped: false })); mesh.userData.vaultLed = true;
    const c = Math.cos(piece.rot), s = Math.sin(piece.rot), lx = 0, lz = .17;                       // local (0, y, .17) → world, same transform as FutaRoom.add
    mesh.position.set(piece.x + lx * c + lz * s, 2.31, piece.z - lx * s + lz * c); mesh.rotation.y = piece.rot; scene.add(mesh);
    let st = 'unknown', secs = 0, on = true, last = '';
    function draw() {
      const S = STATES[st] || STATES.unknown, label = st === 'empty' && secs > 0 ? 'EMPTY · REFILL ' + Math.floor(secs / 60) + ':' + String(secs % 60).padStart(2, '0') : S.text, key = st + label + (S.blink ? on : '');
      if (key === last) return; last = key; x.fillStyle = S.bg; x.fillRect(0, 0, 512, 96); x.strokeStyle = S.col; x.globalAlpha = .55; x.lineWidth = 4; x.strokeRect(4, 4, 504, 88); x.globalAlpha = 1;
      x.fillStyle = S.col; x.globalAlpha = S.blink && !on ? .25 : 1; x.font = '700 ' + (label.length > 16 ? 40 : 52) + 'px system-ui,Segoe UI,sans-serif'; x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillText(label, 256, 50); x.globalAlpha = 1; tex.needsUpdate = true;
    }
    draw(); const blinkT = setInterval(() => { on = !on; draw(); }, 600);
    return { mesh, set(state, s2) { st = STATES[state] ? state : 'unknown'; secs = Math.max(0, s2 | 0); draw(); }, tick(dt) { if (st === 'empty' && secs > 0) { /* caller sets secs each poll */ } }, dispose() { clearInterval(blinkT); scene.remove(mesh); mesh.geometry.dispose(); mesh.material.dispose(); tex.dispose(); } };
  }
  g.FutaVaultDoor = { attach, isVaultBank, VAULT_BUILDING, STATES };
})(typeof window !== 'undefined' ? window : globalThis);
