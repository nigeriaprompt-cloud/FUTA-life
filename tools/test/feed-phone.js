// Headless check of the Feed phone app in DEMO mode (no Supabase). usage: node feed-phone.js outdir
// Serves public/ plus a tiny host page, opens the phone at 390 px, checks infinite scroll, posting, the 7/day limit, the Earn tab.
const { chromium } = require(process.env.PW_CORE || 'playwright');
const http = require('http'), fs = require('fs'), path = require('path');
const root = path.resolve(__dirname, '../../public'), out = process.argv[2] || '.';
const types = { '.js': 'text/javascript', '.html': 'text/html', '.json': 'application/json', '.css': 'text/css' };
const HOST = '<!doctype html><meta charset=utf-8><meta name=viewport content="width=device-width,initial-scale=1"><body style="margin:0;background:#cfe3d4"><p>host</p><script src="/world/game/phone/phone.js" defer></script>';
const srv = http.createServer((req, res) => {
  const url = req.url.split('?')[0]; if (url === '/host.html') { res.writeHead(200, { 'content-type': 'text/html' }); return res.end(HOST); }
  fs.readFile(path.join(root, decodeURIComponent(url)), (e, b) => { if (e) { res.writeHead(404); return res.end(); } res.writeHead(200, { 'content-type': types[path.extname(url)] || 'application/octet-stream' }); res.end(b); });
});
let fails = 0; const ok = (c, m) => { console.log((c ? 'ok   - ' : 'FAIL - ') + m); if (!c) fails++; };
(async () => {
  await new Promise(r => srv.listen(0, r)); const port = srv.address().port;
  const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
  const pg = await b.newPage({ viewport: { width: 390, height: 800 } });
  const errs = []; pg.on('pageerror', e => errs.push(e.message)); pg.on('console', m => { if (m.type() === "error" && !/favicon/.test(m.location().url || "")) errs.push(m.text() + ' @' + (m.location().url || '')); });
  await pg.addInitScript(() => { localStorage.setItem('futa.demo.db', JSON.stringify({ me: 'u1', users: [{ id: 'u1', email: 'a@b.c', username: 'lagos_ada', onboarded: true }] })); localStorage.setItem('futa.phone.open', 'true'); });
  await pg.goto(`http://localhost:${port}/host.html`);
  await pg.waitForSelector('.ph-ico'); await pg.waitForTimeout(800);
  await pg.click('.ph-ico:has-text("Feed")'); await pg.waitForSelector('.fd-post');
  const n = () => pg.locator('.fd-post').count();
  ok(await n() === 12, 'first page = 12 posts'); await pg.screenshot({ path: out + '/feed1.png' });
  for (let i = 0; i < 4; i++) { await pg.evaluate(() => { const b = document.querySelector('#futaPhoneHost').shadowRoot.querySelector('.ph-body'); b.scrollTop = b.scrollHeight; }); await pg.waitForTimeout(700); }
  ok(await n() === 40, 'infinite scroll loaded all 40 demo posts (got ' + await n() + ')');
  ok((await pg.locator('.fd-sent').innerText()).includes('all caught up'), 'end-of-feed message shown');
  await pg.click('.fd .ph-tabs button[data-t=write]'); await pg.waitForSelector('.fd-compose textarea');
  ok(await pg.locator('.fd-btn:has-text("Post")').isDisabled(), 'Post disabled while text is too short');
  await pg.click('.fd-sw button[data-k=royal]'); await pg.fill('.fd-compose textarea', 'Hello FUTA, this is my very first post'); await pg.screenshot({ path: out + '/write.png' });
  await pg.click('.fd-btn:has-text("Post")'); await pg.waitForSelector('.fd-post');
  ok((await pg.locator('.fd-post .fd-card').first().innerText()).includes('very first post'), 'new post appears at the top of the feed');
  for (let i = 2; i <= 7; i++) { await pg.click('.fd .ph-tabs button[data-t=write]'); await pg.fill('.fd-compose textarea', 'Another post number ' + i + ' for the day'); await pg.click('.fd-btn:has-text("Post")'); await pg.waitForSelector('.fd-post'); }
  await pg.click('.fd .ph-tabs button[data-t=write]'); await pg.fill('.fd-compose textarea', 'One more post that should be blocked');
  ok(await pg.locator('.fd-btn:has-text("Post")').isDisabled(), '8th post blocked (0 left)'); await pg.screenshot({ path: out + '/limit.png' });
  await pg.click('.fd .ph-tabs button[data-t=earn]'); await pg.waitForSelector('.fd-big');
  const bal = await pg.locator('.fd-big b').innerText(); ok(bal === '₦3,500', 'Earn shows ₦3,500 in the bank after 7 posts (got ' + bal + ')'); await pg.screenshot({ path: out + '/earn.png' });
  ok(errs.length === 0, 'no console errors' + (errs.length ? ': ' + errs.join(' | ').slice(0, 300) : ''));
  await b.close(); srv.close(); console.log(fails ? fails + ' FAILED' : 'ALL FEED UI CHECKS PASSED'); process.exit(fails ? 1 : 0);
})().catch(e => { console.log('FAIL', e.message); process.exit(1); });
