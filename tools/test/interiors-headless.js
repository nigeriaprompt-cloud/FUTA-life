/* Headless layout check: node tools/test/interiors-headless.js   → every template, every variant, 6 seeds each. Exit code 1 if any error. */
const ctx = require('./interiors-headless-load.js'); const D = ctx.FutaTemplates;
const V = { restaurant: ['amala', 'suya', 'fastfood'], sports_room: ['grandstand', 'tabletennis'], workshop: ['feedmill', 'power', 'farm', 'general'], lecture_theatre: ['rooms'] };
let n = 0, bad = 0;
for (const id of D.ids()) for (const v of [null, ...(V[id] || [])]) for (let k = 0; k < 6; k++) {
  n++; try { const b = D.make({ id: 'bld_' + k + '_' + id, name: 'Test ' + k, type: '' }, { id, variant: v }); const r = ctx.FutaCheck.run(b); if (r.errors.length) { bad++; console.log('FAIL', id, v || '', 'seed', k, r.errors.slice(0, 3).join(' | ')); } }
  catch (e) { bad++; console.log('THROW', id, v || '', e.message); }
}
console.log(n + ' builds, ' + bad + ' with errors'); process.exit(bad ? 1 : 0);
