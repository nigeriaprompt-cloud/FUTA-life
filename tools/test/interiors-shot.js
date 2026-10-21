// Renders interior templates headlessly, saves PNGs + a JSON report of FutaCheck results.
// usage: node tools/test/interiors-shot.js outdir [tpl1,tpl2|all] [hour] [name=...] — env CHROME, PW_CORE
const { chromium } = require(process.env.PW_CORE || 'playwright'); const http = require('http'), fs = require('fs'), path = require('path'); const root = path.resolve(__dirname, '../../public'), out = process.argv[2] || '.';
const arg = process.argv[3] || 'all', hour = process.argv[4] || '15', extra = process.argv[5] || '';
const mime = { html: 'text/html', js: 'text/javascript', css: 'text/css', json: 'application/json' };
const srv = http.createServer((q, r) => { const f = path.join(root, decodeURIComponent(q.url.split('?')[0])); fs.readFile(f, (e, b) => { if (e) { r.writeHead(404); r.end(); return; } r.writeHead(200, { 'content-type': mime[f.split('.').pop()] || 'application/octet-stream' }); r.end(b); }); });
(async () => {
  await new Promise(r => srv.listen(0, r)); const port = srv.address().port, base = `http://localhost:${port}/world/game/interiors/preview.html`;
  const b = await chromium.launch({ executablePath: process.env.CHROME, args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--no-sandbox'] });
  let ids = arg.split(','); const pg = await b.newPage({ viewport: { width: 1100, height: 760 } }); const errs = []; pg.on('pageerror', e => errs.push(e.message)); pg.on('console', m => { if (m.type() === 'error' && !/404/.test(m.text())) errs.push(m.text()); });
  if (arg === 'all') { await pg.goto(base + '?tpl=hostel'); ids = await pg.evaluate('FutaTemplates.ids()'); }
  const report = {}; let bad = 0;
  for (const id of ids) {
    errs.length = 0; await pg.goto(`${base}?tpl=${id}&t=${hour}${extra ? '&' + extra : ''}`); await pg.waitForFunction('window.__prev&&window.__frames>2', null, { timeout: 30000 }).catch(() => { });
    const r = await pg.evaluate('window.__prev?window.__prev.report:{errors:["page failed to build"],warnings:[],stats:{}}'); r.pageErrors = errs.slice(); report[id] = r; if (r.errors.length || errs.length) bad++;
    await pg.waitForTimeout(250); await pg.screenshot({ path: path.join(out, `int-${id}.png`) });
    console.log((r.errors.length || errs.length ? 'FAIL ' : 'ok   ') + id.padEnd(16), JSON.stringify(r.stats), r.errors.slice(0, 6).join(' | '), errs.slice(0, 2).join(' | '));
    if (process.env.WARN) r.warnings.forEach(w => console.log('       warn:', w));
  }
  fs.writeFileSync(path.join(out, 'interiors-report.json'), JSON.stringify(report, null, 1)); console.log(bad ? bad + ' template(s) with problems' : 'all templates clean'); await b.close(); srv.close(); process.exit(bad ? 1 : 0);
})();
