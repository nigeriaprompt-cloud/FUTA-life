/* ==========================================================================
   FUTA Avatar — NPC looks by role + seed (deterministic: same seed = same person on every phone)
   TO ADD A ROLE: add a function to ROLES returning a partial look; list its props in PROPS.
   Uniform pieces marked "restricted" in avatar-options.json are only available here (players cannot wear them).
   ========================================================================== */
(function (global) {
  'use strict';
  const FA = global.FutaAvatar, { rng } = FA.util, O = () => FA.OPTIONS;
  const C = { white: 0, black: 1, navy: 2, grey: 14, red: 4, orange: 5, yellow: 6, green: 7, teal: 8, blue: 9, purple: 10, pink: 11, brown: 12, beige: 13, royal: 16, wine: 17, lime: 22 };
  const PATS = ['ankara_a', 'ankara_b', 'kente', 'floral'];
  function mkR(seed) { const R = rng(seed); R.pick = a => a[Math.floor(R() * a.length)]; R.col = () => Math.floor(R() * 24); R.int = (n) => Math.floor(R() * n); return R; }
  function baseBody(R, f) { return { frame: f, height: 0.95 + R() * 0.1, build: 0.2 + R() * 0.6, bust: R(), hips: 0.3 + R() * 0.55, shoulders: 0.3 + R() * 0.5 }; }
  function face(R) { return { shape: R.int(6), eyes: R.int(6), eyeColor: R.pick([0, 0, 0, 1, 7]), brows: R.int(5), nose: R.int(5), lips: R.int(5) }; }
  const maleHair = ['buzz', 'fade', 'fade', 'afro', 'cornrows', 'twists', 'locs', 'bald'], femHair = ['cornrows', 'box_braids', 'long_straight', 'bob', 'bun', 'ponytail', 'puffs', 'braid_updo', 'afro'];
  function person(R, f, extra) {
    const look = { body: baseBody(R, f), skin: R.pick([3, 4, 4, 5, 5, 5, 6, 6, 7, 8, 9, 2]), face: face(R), hair: { style: R.pick(f === 'f' ? femHair : maleHair), color: R.pick([0, 0, 0, 1, 1, 2, 10, 7]), seed: R.int(9999) }, beard: 'none', makeup: {}, wear: {} };
    if (f === 'f') { look.makeup = { lips: R() < 0.7 ? R.int(8) : undefined, lashes: R() < 0.5, blush: R() < 0.4 ? R.int(6) : undefined }; if (R() < 0.4) look.nails = R.int(9); }
    return Object.assign(look, extra || {});
  }
  const ROLES = {
    security(R, f) { const l = person(R, f); l.hair.style = f === 'f' ? 'bun' : R.pick(['buzz', 'fade']); l.beard = f === 'm' && R() < 0.35 ? 'stubble' : 'none'; l.body.build = 0.55 + R() * 0.35; l.body.shoulders = 0.6 + R() * 0.3;
      l.wear = { top: { id: 'uniform_shirt', c: C.royal }, bottom: { id: 'slacks', c: C.navy }, shoes: { id: 'boots', c: C.black }, head: { id: 'peaked', c: C.navy }, layer: R() < 0.5 ? { id: 'hivis', c: C.lime } : undefined, neck: { id: 'lanyard', c: C.orange } }; return l; },
    cleaner(R, f) { const l = person(R, f); l.hair.style = f === 'f' ? R.pick(['cornrows', 'bun']) : R.pick(['buzz', 'fade', 'bald']); l.body.build = 0.3 + R() * 0.4;
      l.wear = { top: { id: 'tee', c: C.green }, bottom: { id: 'joggers', c: C.navy }, shoes: { id: 'sneakers', c: C.white, c2: C.grey }, layer: { id: 'hivis', c: C.orange }, head: f === 'f' && R() < 0.4 ? { id: 'hijab', c: C.beige } : R() < 0.4 ? { id: 'cap', c: C.green } : undefined }; return l; },
    lecturer(R, f) { const l = person(R, f); l.body.build = 0.35 + R() * 0.4; l.body.height = 0.97 + R() * 0.08; if (f === 'm') { l.hair.style = R.pick(['fade', 'buzz', 'bald']); l.beard = R.pick(['none', 'stubble', 'goatee', 'full']); } else l.hair.style = R.pick(['bob', 'cornrows', 'bun', 'long_straight']);
      if (f === 'm') l.wear = { top: { id: 'shirt', c: R.pick([C.white, C.blue, C.beige, C.grey]), c2: C.navy }, bottom: { id: 'slacks', c: R.pick([C.black, C.navy, C.grey]) }, shoes: { id: 'loafers', c: C.black }, layer: R() < 0.5 ? { id: 'blazer', c: R.pick([C.navy, C.grey, C.brown]) } : undefined, neck: R() < 0.5 ? { id: 'tie', c: R.pick([C.wine, C.navy, C.red]), c2: C.black } : { id: 'lanyard', c: C.teal } };
      else l.wear = { top: { id: 'blouse', c: R.col(), p: R() < 0.3 ? R.pick(PATS) : undefined, c2: R.col() }, bottom: { id: R.pick(['skirt', 'slacks', 'midi']), c: R.pick([C.black, C.navy, C.grey]) }, shoes: { id: R.pick(['heels', 'loafers']), c: C.black }, layer: R() < 0.4 ? { id: 'blazer', c: R.pick([C.navy, C.wine]) } : undefined, neck: { id: 'lanyard', c: C.teal } };
      if (R() < 0.4) l.wear.glasses = { id: R.pick(['round', 'square']), c: C.black }; return l; },
    student(R, f) { const l = person(R, f); const p = () => (R() < 0.3 ? R.pick(['plaid', 'stripes', 'ankara_a']) : undefined);
      if (f === 'm') l.wear = { top: { id: R.pick(['tee', 'polo', 'hoodie', 'tee', 'shirt']), c: R.col(), c2: R.col(), p: p() }, bottom: { id: R.pick(['jeans', 'chino', 'shorts', 'joggers']), c: R.pick([2, 16, 1, 13, 14]) }, shoes: { id: 'sneakers', c: R.col(), c2: C.white } };
      else if (R() < 0.3) l.wear = { dress: { id: R.pick(['sundress', 'bodycon', 'maxi']), c: R.col(), c2: R.col(), p: R() < 0.5 ? R.pick(PATS) : undefined }, shoes: { id: R.pick(['sandals', 'sneakers']), c: R.col() } };
      else l.wear = { top: { id: R.pick(['blouse', 'tee', 'croptop', 'tank']), c: R.col(), c2: R.col(), p: p() }, bottom: { id: R.pick(['jeans', 'mini', 'skirt', 'leggings', 'shorts']), c: R.pick([2, 16, 1, 13, 14, R.col()]) }, shoes: { id: R.pick(['sneakers', 'sandals', 'heels']), c: R.col(), c2: C.white } };
      if (R() < 0.6) l.wear.bag = { id: f === 'f' && R() < 0.4 ? 'handbag' : R.pick(['backpack', 'backpack', 'sling']), c: R.col(), c2: R.col() };
      if (R() < 0.35) l.wear.neck = { id: 'lanyard', c: C.blue }; if (R() < 0.2) l.wear.glasses = { id: R.pick(['round', 'square', 'shades']), c: C.black };
      if (f === 'f' && R() < 0.25) l.wear.head = R() < 0.5 ? { id: 'hijab', c: R.col() } : undefined; if (f === 'm' && R() < 0.15) l.wear.head = { id: 'cap', c: R.col() };
      if (R() < 0.3) l.wear.ears = { id: f === 'f' ? 'hoops' : 'studs', c: R.int(2) }; return l; },
    staff(R, f) { const l = person(R, f); l.body.build = 0.3 + R() * 0.45;
      l.wear = f === 'm' ? { top: { id: R.pick(['polo', 'shirt']), c: R.pick([C.white, C.blue, C.teal, C.beige]) }, bottom: { id: 'slacks', c: R.pick([C.black, C.navy, C.grey]) }, shoes: { id: 'loafers', c: C.black }, neck: { id: 'lanyard', c: C.teal } }
        : { top: { id: 'blouse', c: R.col(), p: R() < 0.4 ? R.pick(PATS) : undefined, c2: R.col() }, bottom: { id: R.pick(['skirt', 'slacks']), c: R.pick([C.black, C.navy]) }, shoes: { id: 'heels', c: C.black }, neck: { id: 'lanyard', c: C.teal } }; return l; },
    trader(R, f) { const l = person(R, f); l.body.build = 0.4 + R() * 0.45;
      l.wear = f === 'm' ? { top: { id: R.pick(['kaftan', 'tee', 'polo']), c: R.col(), c2: R.col(), p: R() < 0.4 ? R.pick(PATS) : undefined }, bottom: { id: R.pick(['sokoto', 'jeans', 'chino']), c: R.col() }, shoes: { id: 'sandals', c: C.brown }, head: R() < 0.3 ? { id: 'cap', c: R.col() } : undefined }
        : { top: { id: 'buba', c: R.col(), c2: R.col(), p: R.pick(PATS) }, bottom: { id: 'wrapper', c: R.col(), c2: R.col(), p: R.pick(PATS) }, shoes: { id: 'sandals', c: C.brown }, head: { id: 'gele', c: R.col(), c2: R.col(), p: R.pick(PATS) }, ears: { id: 'hoops', c: 0 }, wrist: { id: 'bangles', c: 0 } }; return l; },
    nurse(R, f) { const l = person(R, f); l.hair.style = f === 'f' ? R.pick(['bun', 'cornrows', 'bob']) : 'fade';
      l.wear = { top: { id: 'tee', c: C.teal }, bottom: { id: 'slacks', c: C.teal }, layer: { id: 'labcoat', c: C.white }, shoes: { id: 'sneakers', c: C.white, c2: C.white }, neck: { id: 'lanyard', c: C.blue } }; return l; }
  };
  const PROPS = { security: ['radio', 'baton'], cleaner: ['broom'], lecturer: ['clipboard'], student: [], staff: ['clipboard'], trader: [], nurse: ['clipboard'] };
  FA.npc = {
    roles: Object.keys(ROLES), props: (role) => PROPS[role] || [],
    look(role, seed, frame) { const R = mkR(seed == null ? 1 : seed), f = frame || (R() < 0.5 ? 'f' : 'm'), fn = ROLES[role] || ROLES.student; const l = fn(R, f); ['layer', 'head', 'glasses', 'bag', 'neck', 'wrist', 'ears'].forEach(k => { if (l.wear[k] === undefined) delete l.wear[k]; }); return FA.look.normalize(l, { allowRestricted: true }); },
    create(role, seed, o) { o = o || {}; const look = FA.npc.look(role, seed, o.frame); return FA.create(look, Object.assign({ lod: 1, allowRestricted: true, props: PROPS[role] || [] }, o)); }
  };
})(typeof window !== 'undefined' ? window : globalThis);
