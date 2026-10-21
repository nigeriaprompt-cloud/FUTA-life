// Headless check of the Clothes phone app in DEMO mode (no Supabase). usage: node clothes-phone.js outdir
// Opens the phone at 390 px, opens Clothes (3D preview), changes top / dress / headwear, saves, and checks that ONLY look.wear changed
// (body, face, hair stay as saved) and that NPC-only (restricted) items are never offered.
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
  const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const pg = await b.newPage({ viewport: { width: 390, height: 800 } });
  const errs = []; pg.on('pageerror', e => errs.push(e.message)); pg.on('console', m => { if (m.type() === 'error' && !/favicon/.test(m.location().url || '')) errs.push(m.text() + ' @' + (m.location().url || '')); });
  await pg.addInitScript(() => { localStorage.setItem('futa.demo.db', JSON.stringify({ me: 'u1', users: [{ id: 'u1', email: 'a@b.c', username: 'lagos_ada', onboarded: true, avatar: null }] })); localStorage.setItem('futa.phone.open', 'true'); });
  await pg.goto(`http://localhost:${port}/host.html`);
  await pg.waitForSelector('.ph-ico'); await pg.waitForTimeout(800);
  await pg.click('.ph-ico:has-text("Clothes")'); await pg.waitForSelector('.cl-sub button', { timeout: 20000 });
  await pg.waitForFunction(() => { const r = document.querySelector('#futaPhoneHost').shadowRoot, l = r.querySelector('.cl-load'); return l && getComputedStyle(l).display === 'none'; }, null, { timeout: 20000 });
  ok(true, '3D wardrobe loaded (engine + preview built)');
  ok(await pg.locator('.cl-btn:has-text("Save outfit")').isDisabled(), 'Save disabled until something changes');
  const subs = await pg.locator('.cl-sub button').allInnerTexts();
  ok(subs.join(',') === 'Top,Bottom,Dress,Layer,Shoes', 'Clothes tab slots: ' + subs.join(', ')); await pg.waitForTimeout(1200); await pg.screenshot({ path: out + '/clothes-1-start.png' });
  // change the top to a different style
  const chips = pg.locator('.cl-row .cl-chips >> nth=0 >> .cl-chip');
  const n = await chips.count(); let picked = null;
  for (let i = 0; i < n; i++) { if (!(await chips.nth(i).evaluate(e => e.classList.contains('on')))) { picked = await chips.nth(i).innerText(); await chips.nth(i).click(); break; } }
  await pg.waitForTimeout(500);
  ok(!(await pg.locator('.cl-btn:has-text("Save outfit")').isDisabled()), 'changing a top enables Save (picked ' + picked + ')');
  // dress replaces top + bottom
  await pg.click('.cl-sub button:has-text("Dress")'); await pg.click('.cl-chip:has-text("Sundress")'); await pg.waitForTimeout(600); await pg.screenshot({ path: out + '/clothes-2-dress.png' });
  // restricted items never offered
  const restricted = await pg.evaluate(() => { const O = window.FutaAvatar.OPTIONS.wear, a = []; Object.values(O).forEach(l => l.forEach(x => { if (x.restricted) a.push(x.label); })); return a; });
  let seen = [];
  for (const s of ['Layer', 'Headwear']) { await pg.click('.cl-tabs button:has-text("' + (s === 'Layer' ? 'Clothes' : 'Extras') + '")'); await pg.click('.cl-sub button:has-text("' + s + '")'); seen = seen.concat(await pg.locator('.cl-chip').allInnerTexts()); }
  ok(restricted.length > 0 && !restricted.some(r => seen.includes(r)), 'NPC-only items hidden (' + restricted.join(', ') + ')');
  // extras: headwear + zoom to face
  const cap = pg.locator('.cl-chip:has-text("Cap")').first(); await cap.click(); await pg.click('.cl-ic:has-text("Zoom to face")'); await pg.waitForTimeout(1200); await pg.screenshot({ path: out + '/clothes-3-extras-face.png' });
  // save and verify only wear changed
  await pg.click('.cl-btn:has-text("Save outfit")'); await pg.waitForTimeout(900);
  const res = await pg.evaluate(() => { const FA = window.FutaAvatar, d = JSON.parse(localStorage.getItem('futa.demo.db')), a = d.users[0].avatar, seed = FA.look.normalize(FA.look.random('f', 7)); return { a, seedBody: seed.body, seedSkin: seed.skin, seedFace: seed.face, seedHair: seed.hair }; });
  ok(res.a && res.a.wear && res.a.wear.dress && res.a.wear.dress.id === 'sundress' && !res.a.wear.top && !res.a.wear.bottom, 'saved look: sundress, and top/bottom removed');
  ok(res.a.wear.head && res.a.wear.head.id === 'cap', 'saved look: cap on head');
  ok(JSON.stringify(res.a.body) === JSON.stringify(res.seedBody) && res.a.skin === res.seedSkin && JSON.stringify(res.a.face) === JSON.stringify(res.seedFace) && JSON.stringify(res.a.hair) === JSON.stringify(res.seedHair), 'body, skin, face and hair unchanged by the app');
  ok(await pg.locator('.cl-btn:has-text("Save outfit")').isDisabled(), 'Save disabled again after saving');
  // undo
  await pg.click('.cl-tabs button:has-text("Clothes")'); await pg.click('.cl-sub button:has-text("Dress")'); await pg.click('.cl-chip:has-text("No dress")'); await pg.waitForTimeout(300);
  ok(!(await pg.locator('.cl-btn:has-text("Undo changes")').isDisabled()), 'Undo enabled after a change'); await pg.click('.cl-btn:has-text("Undo changes")'); await pg.waitForTimeout(500);
  ok(await pg.locator('.cl-btn:has-text("Save outfit")').isDisabled(), 'Undo returns to the saved outfit');
  ok(errs.length === 0, 'no console errors' + (errs.length ? ': ' + errs.join(' | ').slice(0, 400) : ''));
  await b.close(); srv.close(); console.log(fails ? fails + ' FAILED' : 'ALL CLOTHES UI CHECKS PASSED'); process.exit(fails ? 1 : 0);
})().catch(e => { console.log('FAIL', e.message); process.exit(1); });
