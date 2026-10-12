/* ==========================================================================
   FUTA World — look normaliser for the server.
   MUST behave exactly like FutaAvatar.look.normalize (game/avatar/avatar-build.js)
   and the old AvatarValidator::clean — if you change one, change all three.
   Single source of truth for every choice: game/avatar/avatar-options.json
   (edit it, then run python3 tools/build-options.py).
   clean(look, false) is the ONLY thing allowed to touch a player's saved look:
   false = players can never wear NPC-only (restricted) uniforms.
   ========================================================================== */
'use strict';

const path = require('path');
const O = require(path.join(__dirname, '..', 'public', 'world', 'game', 'avatar', 'avatar-options.json'));

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const int = (v, lo, hi, d) => { v = Math.round(Number(v)); return isFinite(v) ? clamp(v, lo, hi) : d; };
const num = (v, lo, hi, d) => { v = Number(v); return isFinite(v) ? clamp(v, lo, hi) : d; };
const find = (list, id) => list.find((x) => x.id === id);

function normItem(slot, raw, allowRestricted, frame) {
  const cat = O.wear[slot];
  if (!raw || typeof raw !== 'object') return null;
  const def = find(cat, raw.id);
  if (!def) return null;
  if (def.restricted && !allowRestricted) return null;
  const it = { id: def.id, c: int(raw.c, 0, O.palettes.cloth.length - 1, 0) };
  if (raw.c2 != null) it.c2 = int(raw.c2, 0, O.palettes.cloth.length - 1, 0);
  if (def.pat && raw.p && O.patterns.indexOf(raw.p) >= 0) it.p = raw.p;
  return it;
}

function normalize(look, opts) {
  opts = opts || {};
  look = look && typeof look === 'object' ? look : {};
  const b = look.body || {}, f = look.face || {}, h = look.hair || {}, w = look.wear || {};
  const frame = b.frame === 'f' ? 'f' : 'm';
  const out = {
    v: 1,
    body: {
      frame,
      height: num(b.height, O.body.height.min, O.body.height.max, O.body.height.default),
      build: num(b.build, O.body.build.min, O.body.build.max, O.body.build.default),
      bust: num(b.bust, O.body.bust.min, O.body.bust.max, O.body.bust.default),
      hips: num(b.hips, O.body.hips.min, O.body.hips.max, O.body.hips.default),
      shoulders: num(b.shoulders, O.body.shoulders.min, O.body.shoulders.max, O.body.shoulders.default),
    },
  };
  out.skin = int(look.skin, 0, O.palettes.skin.length - 1, 5);
  out.face = {
    shape: int(f.shape, 0, O.face.shape.count - 1, 0),
    eyes: int(f.eyes, 0, O.face.eyes.count - 1, 0),
    eyeColor: int(f.eyeColor, 0, O.face.eyeColor.count - 1, 0),
    brows: int(f.brows, 0, O.face.brows.count - 1, 0),
    nose: int(f.nose, 0, O.face.nose.count - 1, 0),
    lips: int(f.lips, 0, O.face.lips.count - 1, 0),
  };
  const hs = find(O.hair.styles, h.style);
  out.hair = {
    style: hs ? hs.id : (frame === 'f' ? 'cornrows' : 'fade'),
    color: int(h.color, 0, O.palettes.hair.length - 1, 0),
    seed: int(h.seed, 0, 99999, 7),
  };
  const bs = O.beard.styles.map((x) => x.id);
  out.beard = frame === 'm' && bs.indexOf(look.beard) >= 0 ? look.beard : 'none';
  const mk = look.makeup || {};
  out.makeup = {};
  if (mk.lips != null) out.makeup.lips = int(mk.lips, 0, O.makeup.lips.count - 1, 0);
  if (mk.shadow != null) out.makeup.shadow = int(mk.shadow, 0, O.makeup.shadow.count - 1, 0);
  if (mk.blush != null) out.makeup.blush = int(mk.blush, 0, O.makeup.blush.count - 1, 0);
  if (mk.liner) out.makeup.liner = true;
  if (mk.lashes) out.makeup.lashes = true;
  if (look.nails != null) out.nails = int(look.nails, 0, O.palettes.nail.length - 1, 0);
  out.wear = {};
  const D = O.defaults[frame];
  ['top', 'layer', 'bottom', 'dress', 'shoes', 'head', 'glasses', 'bag', 'neck', 'wrist', 'ears'].forEach((slot) => {
    let it = normItem(slot, w[slot], opts.allowRestricted, frame);
    if (!it && D[slot]) it = Object.assign({}, D[slot]);
    if (it && it.id !== 'none') out.wear[slot] = it;
  });
  if (out.wear.dress) { delete out.wear.top; delete out.wear.bottom; } // a dress replaces top + bottom
  return out;
}

module.exports = {
  normalize,
  /* The flag is `allowRestricted` — NEVER true from a request (NPC uniforms only). */
  clean: (look, allowRestricted) => normalize(look, { allowRestricted: !!allowRestricted }),
};
