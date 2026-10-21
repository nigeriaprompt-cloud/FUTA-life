// Builds the interior for EVERY building on the map and checks the owner's rules.  usage: node tools/test/interiors-all366.js
// Rules: every building gets a template; ATM only in banks; security NPC (hours always) in every bank + administrative/academic building; no template build errors.
const { chromium } = require(process.env.PW_CORE || 'playwright'); const http = require('http'), fs = require('fs'), path = require('path'); const root = path.resolve(__dirname, '../../public');
const mime = { html: 'text/html', js: 'text/javascript', css: 'text/css', json: 'application/json' };
const srv = http.createServer((q, r) => { const f = path.join(root, decodeURIComponent(q.url.split('?')[0])); fs.readFile(f, (e, b) => { if (e) { r.writeHead(404); r.end(); return; } r.writeHead(200, { 'content-type': mime[f.split('.').pop()] || 'application/octet-stream' }); r.end(b); }); });
(async () => {
  const html = fs.readFileSync(path.join(root, 'world/index.html'), 'utf8').split('\n')[71], data = JSON.parse(html.match(/PTW_DATA=(\{.*\});?<\/script>/)[1]).buildings.map(b => ({ id: b.id, name: b.name, type: b.type }));
  await new Promise(r => srv.listen(0, r)); const port = srv.address().port;
  const b = await chromium.launch({ executablePath: process.env.CHROME, args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--no-sandbox'] });
  const pg = await b.newPage(); const errs = []; pg.on('pageerror', e => errs.push(e.message)); await pg.goto(`http://localhost:${port}/world/game/interiors/preview.html?tpl=hostel&hud=0`); await pg.waitForFunction('window.__prev', null, { timeout: 30000 });
  const res = await pg.evaluate((list) => {
    const SEC = new Set(['bank', 'library', 'lecture_theatre', 'auditorium', 'computer_lab', 'lab', 'faculty', 'admin_office', 'primary_school']), out = { byTpl: {}, problems: [], total: list.length };
    for (const bd of list) {
      let c, built; try { c = FutaTemplates.classify(bd); built = FutaTemplates.make(bd); } catch (e) { out.problems.push(bd.name + ' (' + bd.type + '): BUILD FAILED ' + e.message); continue; }
      const t = out.byTpl[c.id] = out.byTpl[c.id] || { n: 0, errors: 0 }; t.n++;
      const atms = built.interactives.filter(p => p.name === 'atm').length; if (atms && c.id !== 'bank') out.problems.push(bd.name + ': ATM outside a bank (' + c.id + ')'); if (c.id === 'bank' && !atms) out.problems.push(bd.name + ': bank without ATM');
      if (SEC.has(c.id)) { const sp = built.spec; if (!sp.security || !(sp.npcs || []).some(n => n.role === 'security' && n.hours === 'always')) out.problems.push(bd.name + ': ' + c.id + ' lacks an always-on security NPC'); }
      if (!built.spec.npcs || !built.spec.npcs.length) out.problems.push(bd.name + ': no NPCs');
      const r = FutaCheck.run(built); if (r.errors.length) t.errors++; built.dispose();
    }
    return out;
  }, data);
  console.log('buildings:', res.total, ' templates used:', Object.keys(res.byTpl).length); Object.entries(res.byTpl).sort((a, b) => b[1].n - a[1].n).forEach(([k, v]) => console.log('  ' + k.padEnd(16), String(v.n).padStart(3), v.errors ? ' layout-check errors in ' + v.errors : ' clean'));
  console.log(res.problems.length ? 'RULE PROBLEMS (' + res.problems.length + '):\n' + res.problems.slice(0, 30).join('\n') : 'RULES OK: every building has an interior, ATM only in banks, security where required, NPCs everywhere.'); console.log(errs.length ? 'page errors: ' + errs.slice(0, 3).join(' | ') : ''); await b.close(); srv.close(); process.exit(res.problems.length ? 1 : 0);
})();
