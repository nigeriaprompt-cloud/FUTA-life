// Real phone, demo mode: unread counts (rows, tabs, 99+ badge), the offline bar, and the installable-app basics.  usage: node tools/test/unread-offline-shot.js outdir
const { chromium } = require(process.env.PW_CORE || 'playwright'); const http = require('http'), fs = require('fs'), path = require('path');
const root = path.resolve(__dirname, '../../public'), out = process.argv[2] || '.'; fs.mkdirSync(out, { recursive: true });
const mime = { html: 'text/html', js: 'text/javascript', css: 'text/css', json: 'application/json', webmanifest: 'application/manifest+json', png: 'image/png', svg: 'image/svg+xml', txt: 'text/plain', ico: 'image/x-icon' };
const srv = http.createServer((q, r) => { const f = path.join(root, decodeURIComponent(q.url.split('?')[0])); fs.readFile(f, (e, b) => { if (e) { r.writeHead(404); r.end(); return; } r.writeHead(200, { 'content-type': mime[f.split('.').pop()] || 'application/octet-stream' }); r.end(b); }); });
let bad = 0; const ok = (c, m) => { if (!c) { bad++; console.log('FAIL -', m); } else console.log('ok   -', m); };
(async () => {
  await new Promise(r => srv.listen(0, r)); const base = 'http://localhost:' + srv.address().port;
  const b = await chromium.launch({ executablePath: process.env.CHROME, args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--no-sandbox'] });
  const ctx = await b.newContext({ viewport: { width: 390, height: 780 } }), pg = await ctx.newPage(); const errs = []; pg.on('pageerror', e => errs.push(e.message));
  await pg.goto(base + '/world/interior.html?id=x&n=Library&ty=office&tpl=library&hour=11&d=1'); await pg.waitForFunction('window.FutaPhone&&window.FutaNet&&window.__frames>5', null, { timeout: 90000 });
  await pg.waitForTimeout(3500);
  const sh = () => pg.evaluate(() => document.getElementById('futaPhoneHost').shadowRoot);
  await pg.evaluate(() => { FutaPhone.show(); FutaPhone.home(); }); await pg.waitForFunction(() => [...document.getElementById('futaPhoneHost').shadowRoot.querySelectorAll('em')].some(e => e.textContent === '99+'), null, { timeout: 30000 }).catch(() => { });
  const homeBadge = await pg.evaluate(() => { const r = document.getElementById('futaPhoneHost').shadowRoot; const em = [...r.querySelectorAll('em')].map(e => e.textContent); return em; });
  ok(homeBadge.includes('99+'), 'Chat icon on the home screen shows 99+ (got ' + JSON.stringify(homeBadge) + ')'); await pg.screenshot({ path: out + '/1-home-badge.png' });
  await pg.evaluate(() => { FutaPhone.getUser = () => ({ id: 'me', username: 'me', wallet: {} }); FutaPhone.open('chat'); }); await pg.waitForTimeout(800);
  await pg.evaluate(() => document.getElementById('futaPhoneHost').shadowRoot.querySelector('[data-t=friends]').click()); await pg.waitForTimeout(800);
  const rows = await pg.evaluate(() => [...document.getElementById('futaPhoneHost').shadowRoot.querySelectorAll('.ph-row[data-u] ')].map(r => r.querySelector('b').textContent + '=' + r.querySelector('.ph-un').textContent));
  ok(rows.join() === 'amaka=99+,tola=3', 'friends: ' + rows.join()); await pg.screenshot({ path: out + '/2-friends.png' });
  await pg.evaluate(() => document.getElementById('futaPhoneHost').shadowRoot.querySelector('[data-t=groups]').click()); await pg.waitForTimeout(800); await pg.screenshot({ path: out + '/3-groups.png' });
  // offline bar
  await ctx.setOffline(true); await pg.evaluate(() => window.dispatchEvent(new Event('offline'))); await pg.waitForTimeout(1200);
  const off = await pg.evaluate(() => { const r = document.getElementById('futaNet').shadowRoot; const p = r.querySelector('.p'); return { cls: p.className, txt: p.textContent }; });
  ok(/show/.test(off.cls) && /offline/i.test(off.txt), 'offline bar appears: "' + off.txt + '"'); await pg.screenshot({ path: out + '/4-offline.png' });
  await ctx.setOffline(false); await pg.evaluate(() => window.dispatchEvent(new Event('online'))); await pg.waitForTimeout(1500);
  const on = await pg.evaluate(() => document.getElementById('futaNet').shadowRoot.querySelector('.p').textContent); ok(/Back online/.test(on), 'bar says "' + on + '" when the connection returns'); await pg.screenshot({ path: out + '/5-back-online.png' });
  // installable basics
  const m = await pg.evaluate(async () => { const j = await (await fetch(document.querySelector('link[rel=manifest]').href)).json(); const st = await Promise.all(j.icons.map(i => fetch(i.src).then(x => x.status))); const reg = await navigator.serviceWorker.getRegistration(); return { name: j.name, display: j.display, start: j.start_url, st, sw: !!(reg && reg.active), purposes: j.icons.map(i => i.purpose).join() }; });
  ok(m.display === 'standalone' && m.st.every(s => s === 200) && m.sw && /maskable/.test(m.purposes), 'installable: ' + JSON.stringify(m));
  srv.closeAllConnections(); srv.close(); await pg.goto(base + '/world/game/live/live-demo.html').catch(() => { }); await pg.waitForTimeout(1500);
  ok(/offline|connection/i.test(await pg.evaluate(() => document.body.innerText)), 'a page that is not cached opens the friendly offline page'); await pg.screenshot({ path: out + '/6-offline-page.png' });
  ok(errs.length === 0, 'no page errors ' + errs.slice(0, 2).join('|'));
  await b.close(); console.log(bad ? bad + ' FAILED' : 'ALL OK');
})();
