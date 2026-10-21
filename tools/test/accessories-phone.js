// Headless check of the Accessories phone app in DEMO mode (no Supabase). usage: node accessories-phone.js outdir
// Serves public/ plus a tiny host page, opens the phone at 390 px, checks levels, locks, category filter, buying and the collection tab.
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
  const errs = []; pg.on('pageerror', e => errs.push(e.message)); pg.on('console', m => { if (m.type() === 'error' && !/favicon/.test(m.location().url || '')) errs.push(m.text() + ' @' + (m.location().url || '')); });
  await pg.addInitScript(() => { localStorage.setItem('futa.demo.db', JSON.stringify({ me: 'u1', users: [{ id: 'u1', email: 'a@b.c', username: 'lagos_ada', onboarded: true }] })); localStorage.setItem('futa.phone.open', 'true'); });
  await pg.goto(`http://localhost:${port}/host.html`);
  await pg.waitForSelector('.ph-ico'); await pg.waitForTimeout(800);
  await pg.click('.ph-ico:has-text("Accessories")'); await pg.waitForSelector('.pp-card');
  const n = () => pg.locator('.pp-card').count(), tag = (i) => pg.locator('.pp-card .pp-tag').nth(i).innerText();
  ok(await n() === 4, 'level 1 shows 4 items (got ' + await n() + ')'); await pg.screenshot({ path: out + '/acc-showcase.png' });
  ok((await pg.locator('.pp-price strong').first().innerText()) === '₦50,000', 'cheapest item costs ₦50,000');
  await pg.click('.pp-rail:nth-of-type(1) .pp-lv:has-text("Classic")'); await pg.waitForSelector('.pp-card');
  ok((await tag(0)).includes('LOCKED'), 'level 2 items are locked at the start'); await pg.screenshot({ path: out + '/acc-locked.png' });
  await pg.click('.pp-card >> nth=0'); await pg.waitForSelector('.pp-d');
  ok((await pg.locator('.ph-note').innerText()).includes('Locked'), 'locked detail shows no Buy button'); await pg.screenshot({ path: out + '/acc-detail-locked.png' });
  await pg.click('.ph-back, [aria-label="Back"]').catch(() => {}); await pg.waitForTimeout(300);
  if (!(await pg.locator('.pp-rail').count())) { await pg.evaluate(() => { }); }
  // go back to level 1 and buy the watch
  await pg.waitForSelector('.pp-rail'); await pg.click('.pp-rail:nth-of-type(1) .pp-lv:has-text("Starter")'); await pg.waitForSelector('.pp-card');
  await pg.click('.pp-card:has-text("Casio G-Shock")'); await pg.waitForSelector('.pp-btn');
  await pg.click('.pp-btn'); ok((await pg.locator('.pp-btn').first().innerText()).startsWith('Confirm'), 'first tap asks to confirm'); await pg.screenshot({ path: out + '/acc-confirm.png' });
  await pg.click('.pp-btn'); await pg.waitForSelector('.pp-sum');
  ok((await pg.locator('.pp-sum').innerText()).includes('1 of 20'), 'collection shows 1 of 20 owned'); await pg.screenshot({ path: out + '/acc-collection.png' });
  ok((await pg.locator('.pp-wal').innerText()).includes('4,950,000'), 'pocket dropped to ₦4,950,000');
  // level 2 now open, category filter works
  await pg.click('.ph-tabs button[data-t=explore]'); await pg.waitForSelector('.pp-rail');
  await pg.click('.pp-rail:nth-of-type(1) .pp-lv:has-text("Classic")'); await pg.waitForSelector('.pp-card');
  ok(!(await tag(0)).includes('LOCKED'), 'level 2 unlocked after owning a level 1 piece');
  await pg.click('[data-cat=Bags]'); await pg.waitForSelector('.pp-card');
  ok(await n() === 1 && (await pg.locator('.pp-card').first().innerText()).includes('Fossil Leather Backpack'), 'Bags filter shows only the backpack');
  await pg.screenshot({ path: out + '/acc-bags.png' });
  ok(errs.length === 0, 'no console errors' + (errs.length ? ': ' + errs.join(' | ').slice(0, 300) : ''));
  await b.close(); srv.close(); console.log(fails ? fails + ' FAILED' : 'ALL ACCESSORIES UI CHECKS PASSED'); process.exit(fails ? 1 : 0);
})().catch(e => { console.log('FAIL', e.message); process.exit(1); });
