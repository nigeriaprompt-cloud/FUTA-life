// Headless look-and-feel check of the phone Chat quick replies, Send money sheet and pop-down alert, DEMO mode (no Supabase).
// usage: node money-chat-demo.js [screenshotDir]
const { chromium } = require(process.env.PW_CORE || 'playwright');
const http = require('http'), fs = require('fs'), path = require('path');
const root = path.resolve(__dirname, '../../public'), out = process.argv[2] || '';
const types = { '.js': 'text/javascript', '.html': 'text/html', '.json': 'application/json', '.css': 'text/css' };
const HOST = '<!doctype html><meta charset=utf-8><meta name=viewport content="width=device-width,initial-scale=1"><body style="margin:0;background:#cfe3d4"><script src="/world/game/phone/phone.js" defer></script>';
const srv = http.createServer((req, res) => {
  const url = req.url.split('?')[0]; if (url === '/host.html') { res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' }); return res.end(HOST); }
  fs.readFile(path.join(root, decodeURIComponent(url)), (e, b) => { if (e) { res.writeHead(404); return res.end(); } res.writeHead(200, { 'content-type': (types[path.extname(url)] || 'application/octet-stream') + (/\.(js|html|css)$/.test(url) ? '; charset=utf-8' : '') }); res.end(b); });
});
let fails = 0; const ok = (c, m) => { console.log((c ? 'ok   - ' : 'FAIL - ') + m); if (!c) fails++; };
const DB = (provider) => JSON.stringify({ me: 'u1', users: [
  { id: 'u1', email: 'ada@futa.test', password: 'oldpass123', provider, username: 'lagos_ada', dob: '2000-01-01', onboarded: true, avatar: null, life: 'x', wallet: { pocket: 2500, bank: 0 } },
  { id: 'u2', email: 'bee@futa.test', password: 'x', provider: 'email', username: 'taken_name', dob: '2000-01-01', onboarded: true }] });
(async () => {
  await new Promise(r => srv.listen(0, r)); const base = 'http://localhost:' + srv.address().port;
  const b = await chromium.launch({ executablePath: process.env.CHROME || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--no-sandbox'] });
  const errs = []; const pg = await b.newPage({ viewport: { width: 390, height: 800 } });
  pg.on('pageerror', e => errs.push(e.message)); pg.on('console', m => { if (m.type() === 'error' && !/favicon/.test(m.location().url || '')) errs.push(m.text()); });
  await pg.addInitScript(([db]) => { if (!sessionStorage.getItem('seeded')) { localStorage.setItem('futa.demo.db', db); localStorage.setItem('futa.phone.open', 'true'); sessionStorage.setItem('seeded', '1'); } }, [DB('email')]);
  const shot = (n) => out ? pg.screenshot({ path: out + '/' + n + '.png' }) : null, wait = (t) => pg.waitForTimeout(t || 250);
  await pg.goto(base + '/host.html'); await pg.waitForSelector('.ph-ico'); await wait(700); await pg.click('.ph-ico:has-text("Chat")'); await wait(500);
  await pg.click('.ph-tabs button:has-text("Friends")'); await wait(400); await pg.click('.ph-row:has-text("tola")'); await wait(500);
  ok(await pg.locator('.ph-quick button').count() >= 3, 'quick-reply chips show in a friend chat'); await shot('chat-chips');
  await pg.click('.ph-quick button >> nth=0'); await wait(300);
  ok((await pg.locator('.ph-msg.me').last().innerText()).length > 0, 'tapping a chip posts it');
  const tk = () => pg.evaluate(() => { const t = [...document.getElementById('futaPhoneHost').shadowRoot.querySelectorAll('.ph-msg.me .ph-tick')].pop(); return t && t.dataset.s; });
  await wait(100); ok(['pending', 'sent'].includes(await tk()), 'demo: the message starts with a clock / one tick'); await pg.waitForTimeout(1600); ok(await tk() === 'delivered', 'demo: then two grey ticks (delivered)'); await pg.waitForTimeout(1600); ok(await tk() === 'seen', 'demo: then two light-blue ticks (seen)'); await shot('chat-ticks');
  await pg.click('.ph-mini:has-text("Send money")'); await wait(400); ok(/250,000/.test(await pg.locator('.mn-lead').innerText()), 'sheet shows the bank balance'); await shot('money-sheet');
  await pg.click('.mn-q button >> nth=1'); await pg.fill('.mn-sheet input[aria-label=Note]', 'for jollof'); await pg.click('[data-go]'); await wait(300); await shot('money-review');
  await pg.click('[data-ok]'); await wait(500); ok(await pg.locator('.ph-msg.money.me').count() === 1, 'money bubble appears'); await shot('money-bubble');
  await pg.evaluate(() => { window.FutaPhone.hide(); window.FutaPhone.alert({ icon: '💸', title: 'tola sent you ₦5,000', body: 'for jollof', app: 'chat' }); }); await wait(700);
  ok(await pg.evaluate(() => { const b = document.getElementById('futaPhoneHost').shadowRoot.querySelector('.ph-banner'); const r = b.getBoundingClientRect(); return b.classList.contains('show') && r.top >= 0 && r.bottom < 120; }), 'the alert banner drops down while the phone is hidden'); await shot('alert-banner');
  await pg.click('.ph-banner'); await wait(500); ok(await pg.evaluate(() => window.FutaPhone.isOpen()), 'tapping the banner opens the phone');
  ok(errs.length === 0, 'no console errors' + (errs.length ? ': ' + errs.join(' | ') : ''));
  await b.close(); srv.close(); process.exit(fails ? 1 : 0);
})().catch(e => { console.error(e.message); process.exit(1); });
