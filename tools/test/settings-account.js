// Headless check of the phone Settings account features + the reset-password screen, DEMO mode (no Supabase).
// usage: node settings-account.js [screenshotDir]
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
  const b = await chromium.launch({ executablePath: process.env.CHROME || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
  const errs = [];
  async function page(provider, w = 390, h = 800) {
    const pg = await b.newPage({ viewport: { width: w, height: h } });
    pg.on('pageerror', e => errs.push(e.message)); pg.on('console', m => { if (m.type() === 'error' && !/favicon/.test(m.location().url || '')) errs.push(m.text()); });
    await pg.addInitScript(([db]) => { if (!sessionStorage.getItem('seeded')) { localStorage.setItem('futa.demo.db', db); localStorage.setItem('futa.phone.open', 'true'); sessionStorage.setItem('seeded', '1'); } }, [DB(provider)]);
    return pg;
  }
  const shot = (pg, n) => out ? pg.screenshot({ path: out + '/' + n + '.png' }) : null;
  const txt = (pg, sel) => pg.locator(sel).first().innerText();
  async function openSettings(pg) { await pg.goto(base + '/host.html'); await pg.waitForSelector('.ph-ico'); await pg.waitForTimeout(700); await pg.click('.ph-ico:has-text("Settings")'); await pg.waitForSelector('.ph-profile'); }

  /* ---------- email account ---------- */
  let pg = await page('email'); await openSettings(pg);
  ok((await pg.locator('.ph-row[data-act=name]').count()) === 1 && (await pg.locator('.ph-row[data-act=pw]').count()) === 1 && (await pg.locator('.ph-row[data-act=forgot]').count()) === 1, 'Settings has Username, Password and Forgot password rows');
  ok((await pg.locator('[data-act=logout]').count()) === 1, 'Log out is still there');
  await shot(pg, 's1-settings');
  // username
  await pg.click('.ph-row[data-act=name]'); await pg.waitForSelector('#nm:visible');
  ok((await pg.inputValue('#nm')) === 'lagos_ada', 'username sheet opens with the current name');
  await pg.fill('#nm', 'ab'); await pg.dispatchEvent('#nm', 'input'); ok((await txt(pg, '#hint')).includes('At least 3'), 'too short shows a hint');
  await pg.fill('#nm', 'Lagos Ada!!'); await pg.dispatchEvent('#nm', 'input'); ok((await pg.inputValue('#nm')) === 'lagosada', 'capitals, spaces and symbols are cleaned as you type');
  await pg.fill('#nm', 'taken_name'); await pg.dispatchEvent('#nm', 'input'); await pg.waitForTimeout(900); ok((await txt(pg, '#hint')).includes('taken') && await pg.locator('[data-save]').isDisabled(), 'taken name refused, Save stays disabled');
  await pg.fill('#nm', 'admin'); await pg.dispatchEvent('#nm', 'input'); await pg.waitForTimeout(900); ok(await pg.locator('[data-save]').isDisabled(), 'reserved name refused');
  await pg.fill('#nm', 'ada_lagos'); await pg.dispatchEvent('#nm', 'input'); await pg.waitForTimeout(900); ok((await txt(pg, '#hint')).includes('available') && !(await pg.locator('[data-save]').isDisabled()), 'free name shows "available"');
  await shot(pg, 's2-username');
  await pg.click('[data-save]'); await pg.waitForSelector('.ph-sheet', { state: 'detached' }); await pg.waitForTimeout(500);
  ok((await txt(pg, '.ph-profile b')) === 'ada_lagos', 'profile card shows the new name');
  await pg.click('.ph-row[data-act=name]'); await pg.waitForSelector('.st-lead'); await pg.waitForTimeout(600);
  ok((await txt(pg, '.st-lead')).includes('You can change it again on') && await pg.locator('#nm:visible').count() === 0, 'second rename is blocked with the date (cooldown)'); await shot(pg, 's3-cooldown');
  await pg.click('.st-sheet [data-n]');
  // password
  await pg.click('.ph-row[data-act=pw]'); await pg.waitForSelector('#p1:visible'); ok(await pg.locator('#cur:visible').count() === 1, 'password sheet asks for the current password');
  await pg.fill('#cur', 'wrongpass'); await pg.fill('#p1', 'newpass1234'); await pg.fill('#p2', 'newpass1234'); await pg.click('[data-save]'); await pg.waitForTimeout(500);
  ok((await txt(pg, '#hint')).includes('current password is not correct'), 'wrong current password refused');
  await pg.fill('#cur', 'oldpass123'); await pg.fill('#p1', 'short'); await pg.fill('#p2', 'short'); await pg.click('[data-save]'); ok((await txt(pg, '#hint')).includes('at least 8'), 'short new password refused');
  await pg.fill('#p1', 'newpass1234'); await pg.fill('#p2', 'different123'); await pg.click('[data-save]'); ok((await txt(pg, '#hint')).includes('not the same'), 'mismatch refused');
  await shot(pg, 's4-password');
  await pg.fill('#p2', 'newpass1234'); await pg.click('[data-save]'); await pg.waitForSelector('.ph-sheet', { state: 'detached' });
  ok((await pg.evaluate(() => JSON.parse(localStorage.getItem('futa.demo.db')).users[0].password)) === 'newpass1234', 'password changed');
  // forgot
  await pg.click('.ph-row[data-act=forgot]'); await pg.waitForSelector('#em'); ok((await txt(pg, '#em')) === 'a***@futa.test', 'forgot sheet shows a masked email');
  await pg.click('[data-send]'); await pg.waitForSelector('.st-hint.ok'); ok(await pg.evaluate(() => !!localStorage.getItem('futa.recovery')), 'reset request sent and remembered on this device'); await shot(pg, 's5-forgot');
  await pg.click('.st-sheet [data-n]');
  // log out
  await pg.click('[data-act=logout]'); await pg.click('[data-y]'); await pg.waitForURL(/signup\.html/, { timeout: 5000 }).catch(() => { }); ok(/signup\.html/.test(pg.url()), 'Log out returns to the sign-up page'); await pg.close();

  /* ---------- Google-only account ---------- */
  pg = await page('google-demo'); await openSettings(pg); await pg.click('.ph-row[data-act=pw]'); await pg.waitForSelector('#p1:visible');
  ok((await txt(pg, '#ttl')) === 'Set a password' && await pg.locator('#cur:visible').count() === 0, 'Google-only account sees "Set a password" with no current-password box');
  await pg.fill('#p1', 'googlepass99'); await pg.fill('#p2', 'googlepass99'); await pg.click('[data-save]'); await pg.waitForSelector('.ph-sheet', { state: 'detached' }); ok(true, 'Google-only account can set a password'); await pg.close();

  /* ---------- reset-link screen on the sign-up page ---------- */
  pg = await page('email'); await pg.addInitScript(() => { if (!sessionStorage.getItem('rec')) { localStorage.setItem('futa.recovery', String(Date.now())); sessionStorage.setItem('rec', '1'); } });
  await pg.goto(base + '/world/game/onboarding/signup.html?code=abc'); await pg.waitForSelector('h2');
  ok((await txt(pg, 'h2')) === 'Choose a new password', 'arriving from a reset email shows "Choose a new password"'); ok(!/code=/.test(pg.url()), 'the code is removed from the address bar'); await shot(pg, 's6-newpass');
  await pg.fill('#p1', 'brandnew1234'); await pg.fill('#p2', 'nomatch12345'); await pg.click('#go'); ok((await txt(pg, '#msg')).includes('not the same'), 'reset screen refuses mismatched passwords');
  await pg.fill('#p2', 'brandnew1234'); await pg.click('#go'); await pg.waitForTimeout(900);
  ok((await pg.evaluate(() => JSON.parse(localStorage.getItem('futa.demo.db')).users[0].password)) === 'brandnew1234' && (await pg.evaluate(() => !localStorage.getItem('futa.recovery'))), 'new password saved and the reset flag cleared'); await pg.close();
  pg = await page('email'); await pg.goto(base + '/world/game/onboarding/signup.html?code=abc'); await pg.waitForSelector('h2');
  ok((await txt(pg, 'h2')) !== 'Choose a new password', 'a ?code with NO reset request on this device does not show the reset screen'); await pg.close();

  ok(errs.length === 0, 'no console errors' + (errs.length ? ': ' + errs.join(' | ').slice(0, 300) : ''));
  await b.close(); srv.close(); console.log(fails ? fails + ' FAILED' : 'ALL ACCOUNT UI CHECKS PASSED'); process.exit(fails ? 1 : 0);
})().catch(e => { console.log('FAIL', e.message); process.exit(1); });
