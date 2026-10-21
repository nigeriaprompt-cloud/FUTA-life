// Back-button behaviour of the Clothes app in both entry points + wardrobe in a room.   usage: node tools/test/wardrobe-interior.js [outdir]
// env CHROME, PW_CORE as in interior-play.js
const { chromium } = require(process.env.PW_CORE || 'playwright'); const http = require('http'), fs = require('fs'), path = require('path');
const root = path.resolve(__dirname, '../../public'), out = process.argv[2] || '/tmp/wardrobe'; const mime = { html: 'text/html', js: 'text/javascript', css: 'text/css', json: 'application/json' };
const srv = http.createServer((q, r) => { const f = path.join(root, decodeURIComponent(q.url.split('?')[0])); fs.readFile(f, (e, b) => { if (e) { r.writeHead(404); r.end(); return; } r.writeHead(200, { 'content-type': mime[f.split('.').pop()] || 'application/octet-stream' }); r.end(b); }); });
let bad = 0; const ok = (name, cond, extra) => { console.log((cond ? 'PASS ' : 'FAIL ') + name + (cond ? '' : '  ' + JSON.stringify(extra))); if (!cond) bad++; };
(async () => {
  fs.mkdirSync(out, { recursive: true }); await new Promise(r => srv.listen(0, r)); const port = srv.address().port;
  const b = await chromium.launch({ executablePath: process.env.CHROME, args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--no-sandbox'] });
  const pg = await b.newPage({ viewport: { width: 390, height: 780 } }); const errs = []; pg.on('pageerror', e => errs.push('PAGE ' + e.message)); pg.on('console', m => { if (m.type() === 'error') errs.push('CONSOLE ' + m.text()); });
  await pg.addInitScript(() => { try { if (!sessionStorage.getItem('seeded')) { sessionStorage.setItem('seeded', '1'); localStorage.setItem('futa.phone.open', 'false'); const u = { id: 'u1', email: 't@t.com', provider: 'email', username: 'tester', dob: '2000-01-01', avatar: null, life: {}, onboarded: true }; localStorage.setItem('futa.demo.db', JSON.stringify({ users: [u], me: 'u1' })); } } catch (e) { } });
  await pg.goto(`http://localhost:${port}/world/interior.html?id=test_hostel&n=Hostel&ty=hostel&hour=15&d=1&fast=1`);
  await pg.waitForFunction('window.__eng&&window.__frames>5&&window.FutaPhone', null, { timeout: 40000 });
  await pg.evaluate(async () => { const d = JSON.parse(localStorage.getItem('futa.demo.db')); d.users[0].avatar = FutaAvatar.look.random('f', 7); localStorage.setItem('futa.demo.db', JSON.stringify(d)); await FutaPhone.refreshUser(); });
  const S = (js) => pg.evaluate(js);
  const sr = "document.querySelector('#futaPhoneHost').shadowRoot";
  const state = () => S(`({ open: FutaPhone.isOpen(), app: !!${sr}.querySelector('.ph-app.on'), pref: localStorage.getItem('futa.phone.open') })`);
  const back = () => S(`${sr}.querySelector('.ph-back').click()`);
  const waitClothes = () => pg.waitForFunction(`${sr}.querySelectorAll('.cl-chip').length>1`, null, { timeout: 25000 });
  const pickOther = () => S(`[...${sr}.querySelectorAll('.cl-chip:not(.on)')][0].click()`);

  // A) from the MAIN PHONE: open phone (remembered), open Clothes app, Back -> phone home screen, still open
  await S(`FutaPhone.show()`); await S(`FutaPhone.open('clothes')`); await waitClothes();
  await back(); await pg.waitForTimeout(250); let s = await state();
  ok('A. phone -> Clothes -> Back lands on the phone home screen (phone stays open)', s.open && !s.app, s);
  await S(`FutaPhone.hide()`);

  // B) WARDROBE with the phone away: opens the Clothes app; Back returns to the room and the phone is away; saved choice unchanged
  await S(`localStorage.setItem('futa.phone.open','false')`);
  await S(`window.__eng.runActivity(FutaActs.get('wardrobe'), {})`); await waitClothes(); s = await state();
  ok('B. wardrobe opens the Clothes app', s.open && s.app, s); ok('B. opening the wardrobe does not change the remembered phone choice', s.pref === 'false', s);
  await back(); await pg.waitForTimeout(250); s = await state();
  ok('B. wardrobe -> Back returns to the room (phone away)', !s.open && !s.app, s); ok('B. remembered phone choice still false', s.pref === 'false', s);

  // C) WARDROBE while the player keeps the phone open normally (remembered = true): Back still returns to the room, choice stays true
  await S(`FutaPhone.show()`); await S(`FutaPhone.home()`); await S(`window.__eng.runActivity(FutaActs.get('wardrobe'), {})`); await waitClothes();
  await back(); await pg.waitForTimeout(250); s = await state();
  ok('C. wardrobe (phone was open) -> Back returns to the room', !s.open && !s.app, s); ok('C. remembered phone choice still true', s.pref === 'true', s);

  // D) unsaved change: first Back warns and stays, second Back leaves (wardrobe)
  await S(`window.__eng.runActivity(FutaActs.get('wardrobe'), {})`); await waitClothes(); await pickOther(); await pg.waitForTimeout(300);
  await back(); await pg.waitForTimeout(250); s = await state(); ok('D. unsaved outfit: first Back stays in the app and warns', s.open && s.app, s);
  await back(); await pg.waitForTimeout(250); s = await state(); ok('D. second Back leaves and returns to the room', !s.open && !s.app, s);

  // E) same guard when the app was opened from the main phone: second Back lands on the phone home, phone open
  await S(`FutaPhone.show(); FutaPhone.open('clothes')`); await waitClothes(); await pickOther(); await pg.waitForTimeout(300);
  await back(); await pg.waitForTimeout(250); s = await state(); ok('E. (main phone) first Back warns and stays', s.open && s.app, s);
  await back(); await pg.waitForTimeout(250); s = await state(); ok('E. (main phone) second Back goes to phone home', s.open && !s.app, s);
  await S(`FutaPhone.hide()`);

  // F) save in the wardrobe: the character in the room changes; Back then leaves
  await S(`window.__eng.runActivity(FutaActs.get('wardrobe'), {})`); await waitClothes();
  const l0 = await S(`JSON.stringify(window.__eng.me.look)`); await pickOther(); await pg.waitForTimeout(300);
  await pg.screenshot({ path: path.join(out, 'wardrobe-picked.png') });
  await S(`[...${sr}.querySelectorAll('.cl-btn')].find(x=>/Save/.test(x.textContent)).click()`); await pg.waitForTimeout(1500);
  const l1 = await S(`JSON.stringify(window.__eng.me.look)`); ok('F. saving updates the character in the room', l0 !== l1);
  await back(); await pg.waitForTimeout(250); s = await state(); ok('F. Back after saving returns to the room', !s.open && !s.app, s);

  console.log(errs.length ? 'ERRORS:\n' + errs.slice(0, 8).join('\n') : 'no page errors'); if (errs.length) bad++;
  await b.close(); srv.close(); process.exit(bad ? 1 : 0);
})();
