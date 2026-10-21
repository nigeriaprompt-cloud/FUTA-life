// Headless check of the NEPA and Tutorial phone apps in DEMO mode (no Supabase). usage: node tools/test/bulletins-phone.js [outdir]
// env PW_CORE (path to playwright) and CHROME (path to chrome) as in the other phone tests. Takes screenshots into outdir.
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
  fs.mkdirSync(out, { recursive: true }); await new Promise(r => srv.listen(0, r)); const port = srv.address().port;
  const b = await chromium.launch({ executablePath: process.env.CHROME || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
  const pg = await b.newPage({ viewport: { width: 390, height: 800 } });
  const errs = []; pg.on('pageerror', e => errs.push(e.message)); pg.on('console', m => { if (m.type() === 'error' && !/favicon/.test(m.location().url || '')) errs.push(m.text()); });
  await pg.addInitScript(() => { localStorage.setItem('futa.demo.db', JSON.stringify({ me: 'u1', users: [{ id: 'u1', email: 'a@b.c', username: 'lagos_ada', onboarded: true }] })); localStorage.setItem('futa.phone.open', 'true'); });
  await pg.goto(`http://localhost:${port}/host.html`); await pg.waitForSelector('.ph-ico'); await pg.waitForTimeout(800);
  const apps = await pg.locator('.ph-ico span').allInnerTexts();
  ok(apps.includes('NEPA') && apps.includes('Tutorial'), 'NEPA and Tutorial icons are on the phone home screen');
  ok(!apps.includes('bulletin-core'), 'the shared helper is not shown as an app');
  await pg.screenshot({ path: out + '/home.png' });

  // ---------------- NEPA ----------------
  await pg.click('.ph-ico:has-text("NEPA")'); await pg.waitForSelector('.np-card');
  ok(await pg.locator('.np-card').count() === 7, 'board shows the 7 demo reports');
  ok(await pg.locator('.np-now').count() === 5, '"Right now" shows the latest status of 5 places');
  ok((await pg.locator('.np-mast').innerText()).includes('POWER BULLETIN') || (await pg.locator('.np-mast').innerText()).toLowerCase().includes('power bulletin'), 'masthead is shown');
  await pg.screenshot({ path: out + '/nepa-board.png' });
  const c1 = pg.locator('.np-card').first().locator('.np-foot button').first();
  const t0 = await c1.innerText(); await c1.click(); await pg.waitForTimeout(500);
  const c1b = pg.locator('.np-card').first().locator('.np-foot button').first();
  ok(/·\s*\d+/.test(t0) && (await c1b.innerText()) !== t0 && (await c1b.getAttribute('class') || '').includes('on'), 'tap "I see this too" adds your confirmation');
  await c1b.click(); await pg.waitForTimeout(500); ok((await pg.locator('.np-card').first().locator('.np-foot button').first().innerText()) === t0, 'tap again takes it back');
  await pg.locator('.np-card').first().locator('.gh').click(); ok(await pg.locator('.np-foot button:has-text("Spam")').count() === 1, 'Report shows the reasons');
  await pg.click('.np-foot button:has-text("Spam")'); await pg.waitForTimeout(400); ok((await pg.locator('.np-card').first().locator('.np-foot').innerText()).includes('Thank you'), 'report is accepted');
  await pg.click('.np-tabs button[data-t=post]'); await pg.waitForSelector('.np-go');
  ok(await pg.locator('.np-go').isDisabled(), 'Post is disabled until status and place are chosen');
  await pg.click('.np-pick[data-k=on]'); await pg.click('.np-chip[data-p="Obanla campus"]'); await pg.fill('textarea.np-in', 'short'); await pg.waitForTimeout(150);
  ok(await pg.locator('.np-go').isDisabled(), 'a note under 10 characters keeps Post disabled');
  await pg.fill('textarea.np-in', 'Light just came back here'); await pg.waitForTimeout(150); ok(await pg.locator('.np-go').isEnabled(), 'valid report enables Post');
  await pg.screenshot({ path: out + '/nepa-post.png' });
  await pg.click('.np-go'); await pg.waitForSelector('.np-card');
  ok(await pg.locator('.np-card').count() === 8 && (await pg.locator('.np-card').first().innerText()).includes('Obanla campus'), 'new report appears first on the board');
  ok(await pg.locator('.np-card').first().locator('.np-foot button').first().isDisabled(), 'you cannot confirm your own report');
  await pg.locator('.np-card').first().locator('.gh').click(); await pg.click('.np-foot button:has-text("Yes, remove")'); await pg.waitForTimeout(400);
  ok(await pg.locator('.np-card').count() === 7, 'you can remove your own report');
  await pg.click('.ph-back'); await pg.waitForTimeout(500);

  // ---------------- Tutorial ----------------
  await pg.click('.ph-ico:has-text("Tutorial")'); await pg.waitForSelector('.tu-card');
  ok(await pg.locator('.tu-card').count() === 6, 'Learn shows the 6 demo guides'); await pg.screenshot({ path: out + '/tutorial-list.png' });
  await pg.click('.tu-chip:has-text("Tech")'); await pg.waitForTimeout(600); ok(await pg.locator('.tu-card').count() === 1, 'category filter: Tech has 1 guide');
  await pg.click('.tu-chip:has-text("All")'); await pg.waitForTimeout(600);
  const first = () => pg.locator('.tu-card').first().locator('.tu-title').innerText();
  await pg.click('.tu-seg.sm button:has-text("Most helpful")'); await pg.waitForTimeout(600); ok((await first()).includes('Charge smart'), 'Most helpful puts the top guide first');
  await pg.locator('.tu-card').first().click(); await pg.waitForSelector('.tu-doc');
  ok(await pg.locator('.tu-card').first().isHidden() && await pg.locator('.tu-p').count() >= 3, 'tapping a guide opens it in full (steps as separate lines)'); await pg.screenshot({ path: out + '/tutorial-guide.png' });
  const hb = pg.locator('.tu-acts button').first(); const h0 = await hb.innerText(); await hb.click(); await pg.waitForTimeout(500);
  ok((await pg.locator('.tu-acts button').first().innerText()) !== h0, 'Helpful vote counts');
  await pg.click('.ph-back'); await pg.waitForTimeout(400);
  ok(await pg.locator('.tu-doc').count() === 0 && await pg.locator('.tu-card').first().isVisible() && await pg.locator('.tu-title').first().isVisible(), 'phone Back closes the guide first and shows the list again');
  ok(await pg.locator('.tu-card').first().locator('.tu-meta b').innerText() !== '', 'list shows the updated helpful count');
  await pg.click('.tu-top .tu-seg button[data-t=share]'); await pg.waitForSelector('.tu-go');
  ok(await pg.locator('.tu-go').isDisabled(), 'Publish is disabled until the form is filled');
  await pg.fill('input.tu-in', 'How to read a timetable fast'); await pg.click('.tu-chip:has-text("Study")');
  await pg.fill('textarea.tu-in', '1. Find your day.\n2. Find your hall.\n3. Note the start time.\n4. Set an alarm for ten minutes before.'); await pg.waitForTimeout(150);
  ok(await pg.locator('.tu-go').isEnabled(), 'filled form enables Publish'); await pg.screenshot({ path: out + '/tutorial-share.png' });
  await pg.click('.tu-go'); await pg.waitForSelector('.tu-card');
  ok((await first()).includes('How to read a timetable fast') && await pg.locator('.tu-card').count() === 7, 'published guide appears first');
  await pg.click('.ph-back'); await pg.waitForTimeout(500); ok(await pg.locator('.ph-ico:has-text("Tutorial")').isVisible(), 'Back leaves the app to the home screen');
  ok(errs.length === 0, 'no page errors' + (errs.length ? ': ' + errs[0] : '')); await b.close(); srv.close(); process.exit(fails ? 1 : 0);
})();
