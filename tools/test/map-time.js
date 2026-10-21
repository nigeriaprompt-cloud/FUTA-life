// Screenshots the map at several Nigeria-time hours. usage: node tools/test/map-time.js outdir [hours comma list] [mode: city|map]
const { chromium } = require(process.env.PW_CORE || 'playwright'); const http = require('http'), fs = require('fs'), path = require('path'); const root = path.resolve(__dirname, '../../public'), out = process.argv[2] || '.';
const hours = (process.argv[3] || '6.9,12,17.8,18.8,21').split(',').map(Number), mode = process.argv[4] || 'city';
const mime = { html: 'text/html', js: 'text/javascript', css: 'text/css', json: 'application/json' };
const srv = http.createServer((q, r) => { const f = path.join(root, decodeURIComponent(q.url.split('?')[0])); fs.readFile(f, (e, b) => { if (e) { r.writeHead(404); r.end(); return; } r.writeHead(200, { 'content-type': mime[f.split('.').pop()] || 'application/octet-stream' }); r.end(b); }); });
(async () => {
  await new Promise(r => srv.listen(0, r)); const port = srv.address().port;
  const b = await chromium.launch({ executablePath: process.env.CHROME, args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--no-sandbox'] });
  for (const h of hours) {
    const pg = await b.newPage({ viewport: { width: 900, height: 560 } }); const errs = []; pg.on('pageerror', e => errs.push(e.message));
    await pg.goto(`http://localhost:${port}/world/index.html?t=${h}`); await pg.waitForFunction('!document.getElementById("load")', null, { timeout: 60000 }).catch(() => console.log('load timeout'));
    await pg.waitForTimeout(2500); await pg.screenshot({ path: path.join(out, `map-${mode}-${h}.png`) }); console.log('shot', h, errs.length ? 'ERR ' + errs[0] : 'ok'); await pg.close();
  }
  await b.close(); srv.close();
})();
