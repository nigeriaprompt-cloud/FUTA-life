// Headless check: a building with NO interior (detail level 3: Obafemi Awolowo Auditorium) shows no Enter button anywhere. usage: node map-nointerior.js
const { chromium } = require(process.env.PW_CORE || 'playwright');
const http = require('http'), fs = require('fs'), path = require('path');
const root = path.resolve(__dirname, '../../public'), types = { '.js': 'text/javascript', '.html': 'text/html', '.json': 'application/json', '.css': 'text/css' };
const srv = http.createServer((q, s) => { let u = q.url.split('?')[0]; if (u.endsWith('/')) u += 'index.html'; fs.readFile(path.join(root, decodeURIComponent(u)), (e, b) => { if (e) { s.writeHead(404); return s.end(); } s.writeHead(200, { 'content-type': types[path.extname(u)] || 'application/octet-stream' }); s.end(b); }); });
(async () => {
  await new Promise(r => srv.listen(0, r)); const port = srv.address().port;
  const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const pg = await b.newPage({ viewport: { width: 390, height: 800 } });
  await pg.goto(`http://localhost:${port}/world/index.html`); await pg.waitForTimeout(6000);
  await pg.click('#find > button'); await pg.fill('#find input', 'Obafemi Awolowo'); await pg.waitForTimeout(500); await pg.click('#find .fr >> nth=0'); await pg.waitForTimeout(1800);
  const v = await pg.evaluate(() => [...document.querySelectorAll('button')].filter(b => b.offsetParent).map(b => (b.textContent || b.title).trim()));
  const noEnter = !v.some(t => /^Enter/.test(t)), zoom = v.includes('Zoom in'), bar = await pg.locator('#cmp').evaluate(e => getComputedStyle(e).display);
  console.log((noEnter ? 'ok   - ' : 'FAIL - ') + 'no Enter button (' + v.filter(t => !/^[+−⌖◐]$/.test(t)).join(' | ') + ')');
  console.log((zoom ? 'ok   - ' : 'FAIL - ') + 'Zoom in is offered instead'); console.log((bar === 'none' ? 'ok   - ' : 'FAIL - ') + 'no zoom bar');
  await b.close(); srv.close(); process.exit(noEnter && zoom && bar === 'none' ? 0 : 1);
})().catch(e => { console.log('FAIL', e.message); process.exit(1); });
