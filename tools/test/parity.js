// Proves the SQL validator (supabase/01_schema.sql) and the browser normaliser (avatar-build.js) agree on random + garbage looks.
// usage: node tools/test/parity.js <psql args>     (needs the local test DB from supabase/tests/run.sh)
const fs = require('fs'), vm = require('vm'), path = require('path'), cp = require('child_process');
const root = path.join(__dirname, '..', '..', 'public', 'world');
const ctx = { console, Math, JSON }; ctx.window = ctx; ctx.globalThis = ctx; vm.createContext(ctx);
for (const f of ['vendor/three.min.js', 'game/avatar/avatar-options.js', 'game/avatar/avatar-core.js', 'game/avatar/avatar-body.js', 'game/avatar/avatar-wear.js', 'game/avatar/avatar-rig.js', 'game/avatar/avatar-build.js'])
  try { vm.runInContext(fs.readFileSync(path.join(root, f), 'utf8'), ctx, { filename: f }); } catch (e) { if (!/avatar-(npc)/.test(f)) { console.error('load fail', f, e.message); process.exit(2); } }
const FA = ctx.FutaAvatar, O = FA.OPTIONS; let seed = 12345; const R = () => (seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296;
const pick = a => a[Math.floor(R() * a.length)], garbage = () => pick([undefined, -4, 99999, 1.5]),            // out-of-range numbers or missing. (JS coerces strings/booleans with Number(); SQL ignores them — only hostile clients send those, and the SQL result is what gets stored.)
  objGarbage = () => pick([null, 'x', 7, true, [], {}, { a: 1 }]);
function randLook() {
  const frame = pick(['m', 'f', 'z']), L = { body: { frame, height: pick([0.5, 0.95, 1, 1.2, garbage()]), build: pick([-1, 0.3, 2, garbage()]), bust: R(), hips: R(), shoulders: R() }, skin: pick([0, 5, 11, 40, -2, garbage()]),
    face: { shape: pick([0, 3, 9, garbage()]), eyes: pick([0, 5, 8]), eyeColor: pick([0, 7, 20]), brows: pick([0, 4, 6]), nose: pick([0, 4, 5]), lips: pick([0, 4, 5]) },
    hair: { style: pick(O.hair.styles.map(s => s.id).concat(['nope', null])), color: pick([0, 11, 12, garbage()]), seed: pick([0, 7, 123456, garbage()]) }, beard: pick(O.beard.styles.map(s => s.id).concat(['nope'])),
    makeup: pick([{}, { lips: 3, shadow: 20, blush: 1, liner: true, lashes: true }, objGarbage()]), nails: pick([undefined, 0, 8, 12]), wear: {} };
  for (const slot of Object.keys(O.wear)) if (R() < .8) { const d = pick(O.wear[slot].concat([{ id: 'ghost' }])); L.wear[slot] = pick([{ id: d.id, c: pick([0, 3, 23, 40, garbage()]), c2: pick([undefined, 2, 99]), p: pick([undefined, 'plaid', 'ankara_a', 'bogus']) }, objGarbage()]); }
  return L;
}
const looks = Array.from({ length: 400 }, randLook), res = [];
const sql = looks.map((l, i) => `select ${i}, public.validate_avatar($j$${JSON.stringify(l)}$j$::jsonb, false)::text;`).join('\n');
const out = cp.execFileSync('psql', [...process.argv.slice(2), '-At', '-F', '\t', '-q'], { input: sql, maxBuffer: 1 << 28 }).toString().trim().split('\n');
const rnd = x => typeof x === 'number' && !Number.isInteger(x) ? Math.round(x * 1000) / 1000 : x;
const canon = v => Array.isArray(v) ? v.map(canon) : v && typeof v === 'object' ? Object.fromEntries(Object.keys(v).sort().map(k => [k, canon(v[k])])) : rnd(v);
let bad = 0;
out.forEach(line => { const [i, js] = [line.split('\t')[0], line.slice(line.indexOf('\t') + 1)]; const a = canon(FA.look.normalize(looks[i])), b = canon(JSON.parse(js));
  const sa = JSON.stringify(a), sb = JSON.stringify(b); if (sa !== sb) { if (bad++ < 4) { console.log('MISMATCH #' + i, '\n input', JSON.stringify(looks[i]), '\n js   ', sa, '\n sql  ', sb); } } });
console.log(bad ? `FAILED ${bad}/${looks.length}` : `PARITY OK: ${looks.length} looks identical in JS and SQL`); process.exit(bad ? 1 : 0);
