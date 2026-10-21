// Plays one building in the real interior.html (headless): walk, use furniture, NPCs, stats.  usage: node tools/test/interior-play.js outdir "Building Name" type [hour] [day]
// env CHROME, PW_CORE as in interiors-shot.js
const { chromium } = require(process.env.PW_CORE || 'playwright'); const http = require('http'), fs = require('fs'), path = require('path'); const root = path.resolve(__dirname, '../../public'), out = process.argv[2] || '.';
const name = process.argv[3] || 'Wema Bank', type = process.argv[4] || 'bank', hour = process.argv[5] || '11', day = process.argv[6] || '1';
const mime = { html: 'text/html', js: 'text/javascript', css: 'text/css', json: 'application/json' };
const srv = http.createServer((q, r) => { const f = path.join(root, decodeURIComponent(q.url.split('?')[0])); fs.readFile(f, (e, b) => { if (e) { r.writeHead(404); r.end(); return; } r.writeHead(200, { 'content-type': mime[f.split('.').pop()] || 'application/octet-stream' }); r.end(b); }); });
(async () => {
  fs.mkdirSync(out, { recursive: true }); await new Promise(r => srv.listen(0, r)); const port = srv.address().port;
  const b = await chromium.launch({ executablePath: process.env.CHROME, args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--no-sandbox'] });
  const pg = await b.newPage({ viewport: { width: 1000, height: 700 } }); const errs = []; pg.on('pageerror', e => errs.push('PAGE ' + e.message)); pg.on('response', r => { if (r.status() >= 400) errs.push('HTTP ' + r.status() + ' ' + r.url()); }); pg.on('console', m => { if (m.type() === 'error') errs.push('CONSOLE ' + m.text()); });
  await pg.goto(`http://localhost:${port}/world/interior.html?id=test_${type}&n=${encodeURIComponent(name)}&ty=${type}&hour=${hour}&d=${day}&fast=1`);
  await pg.waitForFunction('window.__eng&&window.__frames>5', null, { timeout: 40000 }).catch(() => { });
  const info = await pg.evaluate(() => { const e = window.__eng; if (!e) return null; return { tpl: e.built.spec.id, venue: e.built.venue, npcs: e.npcs.filter(n => n.av).map(n => n.s.role + ':' + n.s.beh).reduce((a, k) => (a[k] = (a[k] || 0) + 1, a), {}), pieces: e.built.interactives.map(p => p.name + '=' + (p.o.inter || []).join('/')).slice(0, 40) }; });
  console.log(JSON.stringify(info, null, 1));
  if (info) {
    await pg.waitForTimeout(1500); await pg.screenshot({ path: path.join(out, `play-${type}-start.png`) });
    // 1) walk across the room
    const w = await pg.evaluate(async () => { const e = window.__eng, ok = await e.inter.walkTo(e.built.w / 2, e.built.d / 2); return { ok, x: e.player.x, z: e.player.z }; }); console.log('walk', JSON.stringify(w));
    // 2) use every interactive piece's first allowed activity (server rules: wrong venue must be refused)
    const res = await pg.evaluate(async () => { const e = window.__eng, A = window.FutaActs, out = []; for (const p of e.built.interactives.slice(0, 40)) { const ids = (p.o.inter || []).filter(id => A.allowed(id, e.built.venue)); if (!ids.length) { out.push(p.name + ': NO ALLOWED ACTIVITY'); continue; } const a = A.get(ids[0]); if (a.ui === 'atm' || a.ui === 'creator') { out.push(p.name + ': ' + a.ui + ' ui'); continue; } try { await e.api.act(a.id); out.push(p.name + ': ' + a.id + ' ok'); } catch (er) { out.push(p.name + ': ' + a.id + ' -> ' + er.message); } } return out; }); console.log(res.join('\n'));
    // 3) click a piece with the real pointer path
    const first = await pg.evaluate(() => { const e = window.__eng, p = e.built.interactives.find(q => (q.o.inter || []).length); if (!p) return null; const bb = new THREE.Box3().setFromObject(p.group), c = bb.getCenter(new THREE.Vector3()); return { name: p.name, pt: e.project(c.x, c.y, c.z) }; });
    if (first) { await pg.mouse.click(first.pt.x, first.pt.y); await pg.waitForFunction(() => [...document.querySelectorAll('div')].some(d => d.style.maxWidth === '460px' && d.style.display === 'block'), null, { timeout: 20000 }).catch(() => {}); await pg.waitForTimeout(400); await pg.screenshot({ path: path.join(out, `play-${type}-sheet.png`) }); console.log('clicked', first.name, 'sheet open:', await pg.evaluate(() => document.querySelector('#c').parentNode && [...document.querySelectorAll('div')].some(d => d.style.maxWidth === '460px' && d.style.display === 'block'))); }
    const st = await pg.evaluate(() => window.__eng.api.stats()); console.log('stats', JSON.stringify(st));
  }
  console.log(errs.length ? 'ERRORS:\n' + errs.slice(0, 8).join('\n') : 'no page errors'); await b.close(); srv.close();
})();
