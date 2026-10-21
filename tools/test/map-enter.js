// Headless check: tap a building on the map, then Enter on the zoom bar opens that building's interior. usage: node map-enter.js
const { chromium } = require(process.env.PW_CORE || 'playwright');
const http = require('http'), fs = require('fs'), path = require('path');
const root = path.resolve(__dirname, '../../public'), types = { '.js': 'text/javascript', '.html': 'text/html', '.json': 'application/json', '.css': 'text/css' };
const srv = http.createServer((q, s) => { let u = q.url.split('?')[0]; if (u.endsWith('/')) u += 'index.html'; fs.readFile(path.join(root, decodeURIComponent(u)), (e, b) => { if (e) { s.writeHead(404); return s.end(); } s.writeHead(200, { 'content-type': types[path.extname(u)] || 'application/octet-stream' }); s.end(b); }); });
(async () => {
  await new Promise(r => srv.listen(0, r)); const port = srv.address().port;
  const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const pg = await b.newPage({ viewport: { width: 390, height: 800 } });
  await pg.goto(`http://localhost:${port}/world/index.html`); await pg.waitForTimeout(6000);
  await pg.click('#find > button'); await pg.fill('#find input', 'Library'); await pg.waitForTimeout(400); await pg.click('#find .fr >> nth=0'); await pg.waitForTimeout(1800);
  const bar = await pg.evaluate(() => [...document.querySelectorAll('#cmp button')].map(b => b.textContent).join(' '));
  await pg.click('#cmp button.pri'); await pg.waitForTimeout(4000);
  const okUrl = /interior\.html\?id=/.test(pg.url()), okBar = bar === 'Enter ✕';
  console.log((okBar ? 'ok   - ' : 'FAIL - ') + 'bar has only Enter and close (' + bar + ')'); console.log((okUrl ? 'ok   - ' : 'FAIL - ') + 'Enter opens the building interior');
  await b.close(); srv.close(); process.exit(okBar && okUrl ? 0 : 1);
})().catch(e => { console.log('FAIL', e.message); process.exit(1); });
