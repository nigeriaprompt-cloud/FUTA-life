// Headless check of the map's tidy button flow (no images). usage: node map-buttons.js
// Player view (Enter step is in map-enter.js): only region chips on top, short hint, tap a building -> zoom bar with ONE Enter + one close icon, no auto-enter, Enter goes inside.
const { chromium } = require(process.env.PW_CORE || 'playwright');
const http = require('http'), fs = require('fs'), path = require('path');
const root = path.resolve(__dirname, '../../public'), types = { '.js': 'text/javascript', '.html': 'text/html', '.json': 'application/json', '.css': 'text/css' };
const srv = http.createServer((q, s) => { let u = q.url.split('?')[0]; if (u.endsWith('/')) u += 'index.html'; fs.readFile(path.join(root, decodeURIComponent(u)), (e, b) => { if (e) { s.writeHead(404); return s.end(); } s.writeHead(200, { 'content-type': types[path.extname(u)] || 'application/octet-stream' }); s.end(b); }); });
let fails = 0; const ok = (c, m) => { console.log((c ? 'ok   - ' : 'FAIL - ') + m); if (!c) fails++; };
const vis = (pg) => pg.evaluate(() => [...document.querySelectorAll('button')].filter(b => b.offsetParent).map(b => (b.textContent || b.title).trim()));
(async () => {
  await new Promise(r => srv.listen(0, r)); const port = srv.address().port;
  const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const pg = await b.newPage({ viewport: { width: 390, height: 800 } }); const errs = []; pg.on('pageerror', e => errs.push(e.message));
  await pg.goto(`http://localhost:${port}/world/index.html`); await pg.waitForFunction(() => document.getElementById('load') && getComputedStyle(document.getElementById('load')).display === 'none' || !document.getElementById('load'), null, { timeout: 60000 }).catch(() => { }); await pg.waitForTimeout(3000);
  let v = await vis(pg);
  ok(!['Akure Area', 'Nigeria', 'Africa', 'World', 'FUTA Campus'].some(n => v.includes(n)), 'level-jump buttons are gone for players (' + v.join(' | ') + ')');
  ok(v.includes('FUTA · Obanla') && v.includes('FUTA · Postgraduate'), 'region chips remain');
  ok((await pg.locator('#nav button.on').allInnerTexts()).join() === 'FUTA · Obanla', 'current region is highlighted');
  ok(!(await pg.locator('#hint').isVisible()), 'the pinch / drag hint text is not shown');
  // select a building through the search box
  await pg.click('#find > button'); await pg.fill('#find input', 'Library'); await pg.waitForTimeout(400); await pg.click('#find .fr >> nth=0'); await pg.waitForTimeout(1800);
  v = await vis(pg);
  const enterBtns = v.filter(t => t === 'Enter' || t === 'Enter building').length;
  ok(await pg.locator('#cmp').evaluate(e => getComputedStyle(e).display) === 'flex', 'zoom bar is shown after tapping a building');
  ok(enterBtns === 1, 'exactly one Enter button on screen (found ' + enterBtns + ')');
  ok(!v.includes('Outside view') && !v.includes('Explore outside') && !v.includes('Back to campus') && !v.includes('← Back to campus') && !v.includes('Zoom here'), 'no duplicate Outside view / Back to campus / Zoom here buttons');
  ok(await pg.locator('#cmp button.x').count() === 1, 'one close icon on the bar');
  ok((await pg.locator('.am.cs').count()) === 0, 'no seat / garden hotspot buttons');
  await pg.waitForTimeout(2500); ok(pg.url().includes('/world/index.html'), 'no auto-enter: still on the map after 4 s');
  // the close icon returns to the campus view
  await pg.click('#cmp button.x'); await pg.waitForTimeout(600); ok(await pg.locator('#cmp').evaluate(e => getComputedStyle(e).display) === 'none', 'close icon hides the bar');
  ok(errs.length === 0, 'no page errors' + (errs.length ? ': ' + errs.slice(0, 2).join(' | ') : ''));
  await b.close(); srv.close(); console.log(fails ? fails + ' FAILED' : 'ALL MAP BUTTON CHECKS PASSED'); process.exit(fails ? 1 : 0);
})().catch(e => { console.log('FAIL', e.message); process.exit(1); });
