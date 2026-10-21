// Screenshots the campus map at given Nigeria hours.  usage: node map-shot.js outdir 8 13 17.8 21   (needs playwright + chromium)
const { chromium } = require(process.env.PW_CORE || 'playwright'); const http = require('http'), fs = require('fs'), path = require('path');
const root = path.resolve(__dirname, '../../public'), out = process.argv[2] || '.', hours = process.argv.slice(3).length ? process.argv.slice(3) : ['8'];
const mime = { html: 'text/html', js: 'text/javascript', css: 'text/css', json: 'application/json' };
const srv = http.createServer((q, r) => { const f = path.join(root, decodeURIComponent(q.url.split('?')[0])); fs.readFile(f, (e, b) => { if (e) { r.writeHead(404); r.end(); return; } r.writeHead(200, { 'content-type': mime[f.split('.').pop()] || 'application/octet-stream' }); r.end(b); }); });
(async () => {
  await new Promise(r => srv.listen(0, r)); const port = srv.address().port;
  const b = await chromium.launch({ executablePath: process.env.CHROME, args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--no-sandbox'] });
  for (const h of hours) {
    const pg = await b.newPage({ viewport: { width: 900, height: 600 } }); const errs = []; pg.on('pageerror', e => errs.push(e.message)); pg.on('console', m => { if (m.type() === 'error' && !/404/.test(m.text())) errs.push(m.text()); });
    await pg.goto(`http://localhost:${port}/world/index.html?hour=${h}`); await pg.waitForTimeout(6000);
    await pg.screenshot({ path: path.join(out, 'map_' + h.replace('.', '_') + '.png') }); console.log('hour', h, errs.length ? 'ERRORS ' + errs.slice(0, 3).join(' | ') : 'ok'); await pg.close();
  }
  await b.close(); srv.close();
})();
