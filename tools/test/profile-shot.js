// Opens the phone on interior.html (demo mode), shows profiles and chat->profile, saves screenshots + checks.  usage: node tools/test/profile-shot.js outdir
const { chromium } = require(process.env.PW_CORE || 'playwright'); const http = require('http'), fs = require('fs'), path = require('path'); const root = path.resolve(__dirname, '../../public'), out = process.argv[2] || '.';
const mime = { html: 'text/html', js: 'text/javascript', css: 'text/css', json: 'application/json' };
const srv = http.createServer((q, r) => { const f = path.join(root, decodeURIComponent(q.url.split('?')[0])); fs.readFile(f, (e, b) => { if (e) { r.writeHead(404); r.end(); return; } r.writeHead(200, { 'content-type': mime[f.split('.').pop()] || 'application/octet-stream' }); r.end(b); }); });
(async () => {
  fs.mkdirSync(out, { recursive: true }); await new Promise(r => srv.listen(0, r)); const port = srv.address().port;
  const b = await chromium.launch({ executablePath: process.env.CHROME, args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--no-sandbox'] });
  const pg = await b.newPage({ viewport: { width: 1100, height: 860 } }); const errs = []; pg.on('pageerror', e => errs.push('PAGE ' + e.message)); pg.on('console', m => { if (m.type() === 'error') errs.push('CONSOLE ' + m.text()); });
  await pg.addInitScript(() => { try { localStorage.setItem('futa.phone.open', 'true'); } catch (e) { } });
  await pg.goto(`http://localhost:${port}/world/interior.html?id=x&n=Library&ty=office&tpl=library&hour=11&d=1`); await pg.waitForFunction('window.FutaProfile&&window.FutaPhone&&window.__frames>5', null, { timeout: 40000 });
  const who = process.argv[3] || 'tola';
  await pg.evaluate((n) => window.FutaProfile.open({ id: 'u_' + n, username: n }), who); await pg.waitForTimeout(3500);
  const ph = await pg.locator('#futaPhoneHost'); await pg.screenshot({ path: path.join(out, `profile-top-${who}.png`) });
  // scroll the profile body to take more shots
  const scrollInfo = await pg.evaluate(() => { const host = document.getElementById('futaPhoneHost').shadowRoot, sc = host.querySelector('.ph-body'); return sc ? { h: sc.scrollHeight, c: sc.clientHeight } : null; }); console.log('scroll', JSON.stringify(scrollInfo));
  for (let i = 1; i <= 3; i++) { await pg.evaluate((i) => { const sc = document.getElementById('futaPhoneHost').shadowRoot.querySelector('.ph-body'); sc.scrollTop = sc.clientHeight * 0.85 * i; }, i); await pg.waitForTimeout(500); await pg.screenshot({ path: path.join(out, `profile-s${i}-${who}.png`) }); }
  const txt = await pg.evaluate(() => document.getElementById('futaPhoneHost').shadowRoot.querySelector('.ph-body').innerText); console.log(/\bage\b|birth|e-?mail|@/i.test(txt) ? 'LEAK? ' + txt.slice(0, 200) : 'no age/email text on the profile'); console.log(txt.replace(/\n+/g, ' | ').slice(0, 500));
  // chat -> friends -> profile button
  await pg.evaluate(() => { window.FutaPhone.getUser = () => ({ id: 'me', username: 'me', wallet: {} }); window.FutaPhone.home(); window.FutaPhone.open('chat'); }); await pg.waitForTimeout(800);
  console.log('chat html', await pg.evaluate(() => document.getElementById('futaPhoneHost').shadowRoot.querySelector('.ph-body').innerHTML.slice(0, 300)));
  await pg.evaluate(() => { const r = document.getElementById('futaPhoneHost').shadowRoot; r.querySelector('[data-t=friends]').click(); }); await pg.waitForTimeout(800);
  console.log('friends html', await pg.evaluate(() => document.getElementById('futaPhoneHost').shadowRoot.querySelector('.ph-body').innerText.slice(0, 300)));
  await pg.evaluate(() => { const r = document.getElementById('futaPhoneHost').shadowRoot; r.querySelector('.ph-row .ph-mini').click(); }); await pg.waitForTimeout(3000); await pg.screenshot({ path: path.join(out, 'profile-from-chat.png') });
  const t1 = await pg.evaluate(() => document.getElementById('futaPhoneHost').shadowRoot.querySelector('h2').textContent);
  await pg.evaluate(() => document.getElementById('futaPhoneHost').shadowRoot.querySelector('.ph-back').click()); await pg.waitForTimeout(600);
  const t2 = await pg.evaluate(() => ({ title: document.getElementById('futaPhoneHost').shadowRoot.querySelector('h2').textContent, tabs: getComputedStyle(document.getElementById('futaPhoneHost').shadowRoot.querySelector('.ph-tabs')).display }));
  console.log('title in profile:', t1, '| after Back:', JSON.stringify(t2));
  console.log(errs.length ? 'ERRORS:\n' + errs.slice(0, 8).join('\n') : 'no page errors'); await b.close(); srv.close();
})();
