// Creator hair tab: free while signing up, locked ("visit a salon") once the player is onboarded. usage: node tools/test/hair-lock.js   env PW_CORE, CHROME as in salon-interior.js
const { chromium } = require(process.env.PW_CORE || 'playwright'); const http = require('http'), fs = require('fs'), path = require('path');
const root = path.resolve(__dirname, '../../public'), mime = { html: 'text/html', js: 'text/javascript', css: 'text/css', json: 'application/json' };
const srv = http.createServer((q, r) => { const f = path.join(root, decodeURIComponent(q.url.split('?')[0])); fs.readFile(f, (e, b) => { if (e) { r.writeHead(404); r.end(); return; } r.writeHead(200, { 'content-type': mime[f.split('.').pop()] || 'application/octet-stream' }); r.end(b); }); });
(async () => {
  await new Promise(r => srv.listen(0, r)); const port = srv.address().port;
  let bad = 0; const b = await chromium.launch({ executablePath: process.env.CHROME, args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--no-sandbox'] });
  for (const onboarded of [true, false]) {
    const pg = await b.newPage({ viewport: { width: 390, height: 780 } }); const errs = []; pg.on('pageerror', e => errs.push(e.message));
    await pg.addInitScript((ob) => { if (!sessionStorage.getItem('s')) { sessionStorage.setItem('s', '1'); const u = { id: 'u1', email: 't@t.com', provider: 'email', username: 'tester', dob: '2000-01-01', avatar: ob ? { body: { frame: 'f' }, hair: { style: 'afro', color: 1 } } : null, life: {}, onboarded: ob }; localStorage.setItem('futa.demo.db', JSON.stringify({ users: [u], me: 'u1' })); } }, onboarded);
    await pg.goto(`http://localhost:${port}/world/game/onboarding/signup.html?stay&edit=look`);
    await pg.waitForFunction('window.FutaCreator&&document.querySelector(".cr-tabs")', null, { timeout: 40000 }).catch(() => { });
    const tabs = await pg.$$eval('.cr-tab, .cr-tabs button', els => els.map(e => e.textContent));
    await pg.click('text=Hair').catch(() => { }); await pg.waitForTimeout(400);
    const panel = await pg.$eval('.cr-panel', e => e.textContent).catch(() => 'NO PANEL');
    const locked = /salon/i.test(panel) && !/Afro/.test(panel), ok = onboarded ? locked : !locked && /Afro/.test(panel);
    console.log((ok && !errs.length ? 'PASS ' : 'FAIL ') + (onboarded ? 'after sign-up: hair tab is locked, points to a salon' : 'during sign-up: hair styles are free to pick') + (errs.length ? '  ERR ' + errs[0] : '')); if (!ok || errs.length) bad++;
    await pg.close();
  }
  await b.close(); srv.close(); process.exit(bad ? 1 : 0);
})();
