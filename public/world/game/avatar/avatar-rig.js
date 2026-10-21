/* ==========================================================================
   FUTA Avatar — skeleton + procedural poses + hand props
   No animation files to download: every pose is a small function of time.
   TO ADD A POSE: add a function to POSES below. It fills channels with P('boneName', rx, ry, rz)
   and may set hipsY / hipsYaw / lift. See docs/AVATAR_SPEC.md → "Poses".
   Rotation cheat-sheet (rest = arms/legs hanging down):
     arm/thigh rotation.x  NEGATIVE = swing forward     shin rotation.x POSITIVE = knee bends
     armL rotation.z NEGATIVE = away from body          armR rotation.z POSITIVE = away from body
   ========================================================================== */
(function (global) {
  'use strict';
  const T = global.THREE, FA = global.FutaAvatar, PIV = FA.PIV, BONES = FA.BONES, { clamp, lerp } = FA.util;
  const PI = Math.PI, S = Math.sin, C = Math.cos;
  const rig = (FA.rig = {});

  rig.make = function (tabs, look) {
    const sx = tabs.shX, lx = tabs.legX;
    const rest = { hips: [0, PIV.hips ? 0 : 0.925, 0], spine: [0, 1.09, 0], head: [0, 1.555, 0.006],
      armL: [-sx, PIV.arm, 0], foreL: [-sx, PIV.fore, 0], handL: [-sx, PIV.hand, 0], armR: [sx, PIV.arm, 0], foreR: [sx, PIV.fore, 0], handR: [sx, PIV.hand, 0],
      thighL: [-lx, PIV.thigh, 0], shinL: [-lx, PIV.shin, 0], footL: [-lx, PIV.foot, 0], thighR: [lx, PIV.thigh, 0], shinR: [lx, PIV.shin, 0], footR: [lx, PIV.foot, 0] };
    rest.hips = [0, 0.925, 0];
    const parent = { hips: null, spine: 'hips', head: 'spine', armL: 'spine', foreL: 'armL', handL: 'foreL', armR: 'spine', foreR: 'armR', handR: 'foreR', thighL: 'hips', shinL: 'thighL', footL: 'shinL', thighR: 'hips', shinR: 'thighR', footR: 'shinR' };
    const bones = {}, list = [];
    BONES.forEach(n => { const b = new T.Bone(); b.name = n; bones[n] = b; list.push(b); });
    BONES.forEach(n => { const p = parent[n], r = rest[n]; if (p) { const pr = rest[p]; bones[n].position.set(r[0] - pr[0], r[1] - pr[1], r[2] - pr[2]); bones[p].add(bones[n]); } else bones[n].position.set(r[0], r[1], r[2]); });
    bones.hips.updateMatrixWorld(true);
    const skeleton = new T.Skeleton(list);
    const cover = FA.wearCover(look), legLimit = cover.legSkinTo < 0.35 ? 0.34 : cover.legSkinTo < 0.62 ? 0.5 : cover.legSkinTo < 0.8 ? 0.8 : 1;
    const R = { root: bones.hips, bones, skeleton, rest, t: Math.random() * 10, pose: 'idle', opts: {}, cur: {}, legLimit, f: look.body.frame === 'f' };
    BONES.forEach(n => { R.cur[n] = [0, 0, 0]; }); R.cur._hipsY = 0; R.cur._hipsYaw = 0;
    R.setPose = function (name, opts) { if (!POSES[name]) name = 'idle'; R.pose = name; R.opts = opts || {}; };
    R.update = function (dt) {
      R.t += dt; const P = {}; P._hipsY = 0; P._hipsYaw = 0; P.lift = 0;
      const set = (n, x, y, z) => { P[n] = [x || 0, y || 0, z || 0]; };
      POSES[R.pose](set, P, R.t, R.opts, R);
      const k = 1 - Math.exp(-dt * (R.opts.snap ? 60 : 11));
      for (let i = 0; i < BONES.length; i++) {
        const n = BONES[i], tg = P[n] || DEF[n], c = R.cur[n], b = bones[n];
        c[0] += (tg[0] - c[0]) * k; c[1] += (tg[1] - c[1]) * k; c[2] += (tg[2] - c[2]) * k; b.rotation.set(c[0], c[1], c[2]);
      }
      R.cur._hipsY += (P._hipsY - R.cur._hipsY) * k; R.cur._hipsYaw += (P._hipsYaw - R.cur._hipsYaw) * k;
      bones.hips.position.y = 0.925 + R.cur._hipsY; bones.hips.rotation.y = R.cur._hipsYaw;
    };
    R.dispose = function () { skeleton.dispose && skeleton.dispose(); };
    return R;
  };

  /* ------------------------------------------------------------ poses */
  const REST_ARM = 0.07;
  const DEF = {}; BONES.forEach(n => { DEF[n] = [0, 0, 0]; });
  DEF.armL = [0, 0, -REST_ARM]; DEF.armR = [0, 0, REST_ARM];
  const walkCore = (set, P, t, o, R, scan) => {
    const sp = o.speed == null ? 1 : o.speed, amp = Math.min(R.legLimit, 0.5 * Math.min(1.3, sp) + 0.1), ph = t * 6.4 * sp;
    const sw = S(ph), sw2 = S(ph + PI);
    const knee = (x) => Math.max(0, x) * 0.95 * (amp > 0.4 ? 1 : amp * 2.2);
    set('thighL', -amp * sw, 0, 0); set('thighR', -amp * sw2, 0, 0);
    set('shinL', knee(-C(ph)) * 0.0 + Math.max(0, S(ph + 1.6)) * 0.9 * (R.legLimit < 0.6 ? 0.4 : 1), 0, 0); set('shinR', Math.max(0, S(ph + 1.6 + PI)) * 0.9 * (R.legLimit < 0.6 ? 0.4 : 1), 0, 0);
    set('footL', Math.max(0, -S(ph)) * 0.25, 0, 0); set('footR', Math.max(0, S(ph)) * 0.25, 0, 0);
    set('armL', amp * 0.8 * sw2 * (o.carry ? 0.2 : 1), 0, -REST_ARM); set('armR', amp * 0.8 * sw * (o.carry ? 0.2 : 1), 0, REST_ARM);
    set('foreL', -0.12 - 0.25 * Math.max(0, sw2) * amp * 2, 0, 0); set('foreR', -0.12 - 0.25 * Math.max(0, sw) * amp * 2, 0, 0);
    set('spine', 0.04 * sp, -0.12 * sw * sp, 0.03 * sw); set('head', -0.02, scan ? 0.5 * S(t * 0.6) : 0.1 * sw, 0);
    P._hipsY = -Math.abs(C(ph)) * 0.025 * sp; P._hipsYaw = 0.1 * sw * sp;
  };
  const POSES = {
    idle(set, P, t, o, R) {
      const b = S(t * 1.7) * 0.012, sh = S(t * 0.5) * 0.04;
      set('spine', b, sh * 0.5, 0); set('head', -b * 0.5 + 0.02 * S(t * 0.37), 0.12 * S(t * 0.31), 0.02 * S(t * 0.23));
      set('armL', 0.04 * S(t * 1.2), 0, -REST_ARM - 0.02); set('armR', 0.04 * S(t * 1.2 + 1), 0, REST_ARM + 0.02);
      set('foreL', -0.12, 0, 0); set('foreR', -0.12, 0, 0);
      set('thighL', 0, 0, sh * 0.5); set('thighR', 0, 0, sh * 0.5); P._hipsYaw = sh * 0.4;
      if (R.f) { set('thighL', 0, 0, 0.03 + sh * 0.4); set('thighR', 0, 0, -0.03 + sh * 0.4); }
    },
    walk(set, P, t, o, R) { walkCore(set, P, t, o, R, false); },
    patrol(set, P, t, o, R) { walkCore(set, P, t, Object.assign({}, o, { speed: 0.7 }), R, true); set('armR', -0.7, 0, 0.1); set('foreR', -1.7, 0, 0); },
    run(set, P, t, o, R) { walkCore(set, P, t, Object.assign({ speed: 1.7 }, o), R, false); },
    sit(set, P, t, o, R) {
      const b = S(t * 1.5) * 0.01;
      P._hipsY = -0.43; set('thighL', -PI / 2 + 0.02, 0, -0.06); set('thighR', -PI / 2 + 0.02, 0, 0.06); set('shinL', PI / 2 - 0.05, 0, 0); set('shinR', PI / 2 - 0.05, 0, 0);
      set('footL', -0.1, 0, 0); set('footR', -0.1, 0, 0); set('spine', -0.05 + b, 0, 0); set('head', 0.04, 0.1 * S(t * 0.4), 0);
      set('armL', -0.45, 0, -0.08); set('armR', -0.45, 0, 0.08); set('foreL', -0.9, 0, 0); set('foreR', -0.9, 0, 0);
    },
    talk(set, P, t, o, R) {
      POSES.idle(set, P, t, o, R);
      const g = S(t * 2.3), g2 = S(t * 1.7 + 1);
      set('armR', -0.55 + 0.25 * g, 0, 0.18); set('foreR', -1.1 + 0.4 * g2, 0, 0); set('armL', -0.2 + 0.12 * g2, 0, -0.12); set('foreL', -0.7 + 0.2 * g, 0, 0);
      set('head', 0.03 * g, 0.2 * S(t * 0.9), 0.03 * g2);
    },
    guard(set, P, t, o, R) {
      set('thighL', 0, 0, -0.1); set('thighR', 0, 0, 0.1); set('spine', -0.02 + 0.01 * S(t * 1.5), 0, 0); set('head', 0, 0.55 * S(t * 0.35), 0);
      set('armL', -0.35, 0, -0.12); set('armR', -0.35, 0, 0.12); set('foreL', -1.25, 0, 0.2); set('foreR', -1.25, 0, -0.2);
    },
    sweep(set, P, t, o, R) {
      const ph = t * 2.2, s = S(ph);
      set('spine', 0.28, 0.25 * s, 0); set('head', 0.18, 0.1 * s, 0);
      set('armL', -0.5 - 0.1 * s, 0, -0.1); set('armR', -0.65 + 0.12 * s, 0, 0.1); set('foreL', -0.6, 0, 0); set('foreR', -0.5, 0, 0);
      set('thighL', -0.2 * s, 0, 0); set('thighR', 0.2 * s, 0, 0); set('shinL', 0.12, 0, 0); set('shinR', 0.12, 0, 0); P._hipsYaw = -0.15 * s;
    },
    teach(set, P, t, o, R) {
      POSES.idle(set, P, t, o, R);
      set('armR', -1.35 + 0.08 * S(t * 1.1), 0, 0.5); set('foreR', -0.25, 0, 0); set('head', 0.0, -0.35 + 0.1 * S(t * 0.5), 0); set('armL', -0.5, 0, -0.1); set('foreL', -1.2, 0, 0);
    },
    wave(set, P, t, o, R) {
      POSES.idle(set, P, t, o, R);
      set('armR', 0, 0, 2.55); set('foreR', 0, 0, 0.5 * S(t * 11) - 0.2); set('head', 0, 0.1, -0.08);
    },
    read(set, P, t, o, R) {
      POSES.idle(set, P, t, o, R);
      set('head', 0.38, 0.05 * S(t * 0.5), 0); set('armL', -0.85, 0, -0.1); set('armR', -0.85, 0, 0.1); set('foreL', -1.3, 0, 0.35); set('foreR', -1.3, 0, -0.35); set('spine', 0.06, 0, 0);
    },
    phone(set, P, t, o, R) {
      POSES.idle(set, P, t, o, R);
      set('head', 0.3, 0.05 * S(t * 0.4), 0); set('armR', -0.65, 0, 0.1); set('foreR', -1.75, 0, 0); set('spine', 0.05, 0, 0); set('armL', 0.0, 0, -REST_ARM);
    },
    dance(set, P, t, o, R) {
      const b = t * 7.5, s = S(b), c = C(b);
      P._hipsY = -0.03 - 0.03 * Math.abs(s); P._hipsYaw = 0.35 * s; set('spine', 0.05, -0.3 * s, 0.08 * c); set('head', 0, 0.15 * s, 0.1 * c);
      set('thighL', -0.25 * Math.max(0, s), 0, -0.12); set('thighR', -0.25 * Math.max(0, -s), 0, 0.12); set('shinL', 0.4 * Math.max(0, s), 0, 0); set('shinR', 0.4 * Math.max(0, -s), 0, 0);
      set('armL', -0.9 + 0.7 * c, 0, -0.9 - 0.4 * s); set('armR', -0.9 - 0.7 * c, 0, 0.9 - 0.4 * s); set('foreL', -1.2 + 0.4 * s, 0, 0); set('foreR', -1.2 - 0.4 * s, 0, 0);
    }
  };
  /* interior interaction poses (added with the interiors): cook, eat, type, pray, lift, sleep, browse, mirror, watch */
  POSES.cook = function (set, P, t, o, R) { POSES.idle(set, P, t, o, R); const a = t * 5; set('spine', 0.2, 0, 0); set('head', 0.3, 0.1 * S(t * 0.7), 0); set('armL', -0.75, 0, -0.12); set('foreL', -0.9, 0, 0.1); set('armR', -0.8 + 0.08 * C(a), 0, 0.1 + 0.08 * S(a)); set('foreR', -0.75 + 0.2 * S(a), 0, 0); };
  POSES.eat = function (set, P, t, o, R) { POSES.sit(set, P, t, o, R); const m = 0.5 + 0.5 * S(t * 2.4); set('armR', -0.85 - 0.2 * m, 0, 0.15); set('foreR', -1.1 - 0.9 * m, 0, 0); set('armL', -0.5, 0, -0.1); set('foreL', -1.1, 0, 0.3); set('head', 0.12 + 0.1 * m, 0.1 * S(t * 0.5), 0); };
  POSES.type = function (set, P, t, o, R) { POSES.sit(set, P, t, o, R); set('spine', 0.1, 0, 0); set('head', 0.22, 0.06 * S(t * 0.6), 0); set('armL', -0.95, 0, -0.1); set('armR', -0.95, 0, 0.1); set('foreL', -0.75 + 0.06 * S(t * 13), 0, 0.15); set('foreR', -0.75 + 0.06 * S(t * 11 + 1), 0, -0.15); };
  POSES.pray = function (set, P, t, o, R) { POSES.idle(set, P, t, o, R); set('head', 0.45, 0, 0); set('spine', 0.14, 0, 0); set('armL', -0.65, 0, -0.25); set('armR', -0.65, 0, 0.25); set('foreL', -1.95, 0, 0.5); set('foreR', -1.95, 0, -0.5); };
  POSES.lift = function (set, P, t, o, R) { const k = 0.5 + 0.5 * S(t * 3), k2 = 0.5 + 0.5 * S(t * 3 + PI); POSES.idle(set, P, t, o, R); set('thighL', 0, 0, -0.18); set('thighR', 0, 0, 0.18); set('armL', -0.15, 0, -0.1); set('armR', -0.15, 0, 0.1); set('foreL', -0.2 - 1.8 * k, 0, 0); set('foreR', -0.2 - 1.8 * k2, 0, 0); set('spine', -0.04, 0, 0); P._hipsY = -0.03 * k; };
  POSES.sleep = function (set, P, t, o, R) { const b = S(t * 1.1) * 0.015; set('spine', b, 0, 0); set('head', 0.05, 0.35, 0.1); set('armL', 0.1, 0, -0.35); set('armR', -0.5, 0, 0.2); set('foreL', -0.6, 0, 0); set('foreR', -1.4, 0, 0.3); set('thighL', 0, 0, -0.06); set('thighR', -0.25, 0, 0.08); set('shinR', 0.5, 0, 0); };
  POSES.browse = function (set, P, t, o, R) { POSES.idle(set, P, t, o, R); const s = S(t * 0.8); set('head', -0.05, 0.5 * s, 0); set('spine', 0.05, 0.15 * s, 0); set('armR', -1.25, 0, 0.2); set('foreR', -0.35, 0, 0); set('armL', 0.05, 0, -REST_ARM); };
  POSES.mirror = function (set, P, t, o, R) { POSES.idle(set, P, t, o, R); const s = S(t * 0.9); set('armL', -0.1, 0, -0.55); set('foreL', -1.4, 0, 0.3); set('armR', -0.1, 0, 0.55); set('foreR', -1.4, 0, -0.3); P._hipsYaw = 0.25 * s; set('head', 0.0, -0.25 * s, 0.05); };
  POSES.watch = function (set, P, t, o, R) { POSES.sit(set, P, t, o, R); set('head', 0.0, 0.0, 0.0); set('armL', -0.35, 0, -0.15); set('armR', -0.35, 0, 0.15); set('foreL', -0.5, 0, 0.1); set('foreR', -0.5, 0, -0.1); };
  rig.POSES = POSES; rig.poseNames = Object.keys(POSES);

  /* ------------------------------------------------------------ hand props (tiny, merged, shared geometry) */
  const propGeo = {};
  function mk(parts) { // parts: [rec, matrix, rgb]
    const acc = new FA.Acc();
    parts.forEach(p => acc.add(p[0], { bone: 0, color: p[2], pat: 0, ao: 0.1, m: p[1] }));
    const g = acc.finish(); g.deleteAttribute('skinIndex'); g.deleteAttribute('skinWeight'); return g;
  }
  const M = FA.shapes.MX, BOX = FA.shapes.boxRec, CYL = (n) => FA.shapes.unitCyl(n), hex = FA.util.hexRGB;
  const PROPS = {
    phone: { hand: 'R', pos: [0, -0.05, 0.035], rot: [-0.3, 0, 0], geo: () => mk([[BOX, M(0, 0, 0, 0, 0, 0, 0.072, 0.15, 0.009), hex('#14141a')], [BOX, M(0, 0.0, 0.005, 0, 0, 0, 0.064, 0.138, 0.002), hex('#5aa0ff')]]) },
    book: { hand: 'L', pos: [0.0, -0.07, 0.07], rot: [-0.5, 0, 0], geo: () => mk([[BOX, M(0, 0, 0, 0, 0, 0, 0.15, 0.2, 0.025), hex('#1f3a6b')], [BOX, M(0, 0, 0.002, 0, 0, 0, 0.14, 0.19, 0.022), hex('#efe9da')]]) },
    clipboard: { hand: 'L', pos: [0, -0.07, 0.06], rot: [-0.3, 0, 0], geo: () => mk([[BOX, M(0, 0, 0, 0, 0, 0, 0.2, 0.28, 0.012), hex('#8a5a3c')], [BOX, M(0, 0, 0.008, 0, 0, 0, 0.17, 0.24, 0.004), hex('#f4f1ea')]]) },
    broom: { hand: 'R', pos: [0, -0.04, 0.0], rot: [0.5, 0, 0], geo: () => mk([[CYL(5), M(0, -0.35, 0, 0, 0, 0, 0.022, 1.35, 0.022), hex('#8a6a3c')], [BOX, M(0, -1.0, 0.0, 0, 0, 0, 0.3, 0.14, 0.05), hex('#d9b84a')]]) },
    radio: { hand: null, bone: 'spine', pos: [0.115, 1.36, 0.1], rot: [0, 0, 0], geo: () => mk([[BOX, M(0, 0, 0, 0, 0, 0, 0.04, 0.09, 0.028), hex('#1b1b1f')], [CYL(4), M(0.012, 0.07, 0, 0, 0, 0, 0.006, 0.07, 0.006), hex('#111')]]) },
    baton: { hand: null, bone: 'hips', pos: [0.2, 0.95, 0.05], rot: [0, 0, 0.1], geo: () => mk([[CYL(5), M(0, -0.12, 0, 0, 0, 0, 0.03, 0.4, 0.03), hex('#15151a')]]) }
  };
  rig.attachProps = function (av, list) {
    (list || []).forEach(name => {
      const d = PROPS[name]; if (!d) return;
      const g = propGeo[name] || (propGeo[name] = d.geo()), m = new T.Mesh(g, FA.propMaterial());
      m.position.set(d.pos[0], d.pos[1], d.pos[2]); m.rotation.set(d.rot[0], d.rot[1], d.rot[2]);
      const b = av.rig.bones[d.hand ? 'hand' + d.hand : d.bone]; // positions for hand props are hand-local, for others bone-local
      if (!d.hand) { const r = av.rig.rest[d.bone]; m.position.set(d.pos[0] - r[0], d.pos[1] - r[1], d.pos[2] - r[2]); }
      b.add(m);
    });
  };
})(typeof window !== 'undefined' ? window : globalThis);
