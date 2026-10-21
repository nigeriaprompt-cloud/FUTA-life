// Salon interior: hair styles depend on gender, server takes the price, hair saves, the phone's Clothes app keeps the new hair.
// usage: node tools/test/salon-interior.js [outdir]   env CHROME, PW_CORE as in interior-play.js
const { chromium } = require(process.env.PW_CORE || 'playwright'); const http = require('http'), fs = require('fs'), path = require('path');
const root = path.resolve(__dirname, '../../public'), out = process.argv[2] || '/tmp/salon'; const mime = { html: 'text/html', js: 'text/javascript', css: 'text/css', json: 'application/json' };
const srv = http.createServer((q, r) => { const f = path.join(root, decodeURIComponent(q.url.split('?')[0])); fs.readFile(f, (e, b) => { if (e) { r.writeHead(404); r.end(); return; } r.writeHead(200, { 'content-type': mime[f.split('.').pop()] || 'application/octet-stream' }); r.end(b); }); });
let bad = 0; const ok = (n, c, x) => { console.log((c ? 'PASS ' : 'FAIL ') + n + (c ? '' : '  ' + JSON.stringify(x))); if (!c) bad++; };
async function run(b, port, frame) {
  const pg = await b.newPage({ viewport: { width: 390, height: 780 } }); const errs = []; pg.on('pageerror', e => errs.push('PAGE ' + e.message)); pg.on('console', m => { if (m.type() === 'error') errs.push('CONSOLE ' + m.text()); });
  await pg.addInitScript(() => { try { if (!sessionStorage.getItem('seeded')) { sessionStorage.setItem('seeded', '1'); localStorage.setItem('futa.phone.open', 'false'); const u = { id: 'u1', email: 't@t.com', provider: 'email', username: 'tester', dob: '2000-01-01', avatar: null, life: {}, onboarded: true }; localStorage.setItem('futa.demo.db', JSON.stringify({ users: [u], me: 'u1' })); } } catch (e) { } });
  await pg.goto(`http://localhost:${port}/world/interior.html?id=test_salon&n=Glam%20Salon&ty=salon&hour=11&d=1&fast=1`);
  await pg.waitForFunction('window.__eng&&window.__frames>5&&window.FutaPhone', null, { timeout: 40000 });
  await pg.evaluate(async (fr) => { const d = JSON.parse(localStorage.getItem('futa.demo.db')); const l = FutaAvatar.look.random(fr, 11); l.hair.style = fr === 'm' ? 'afro' : 'afro'; d.users[0].avatar = l; localStorage.setItem('futa.demo.db', JSON.stringify(d)); await FutaPhone.refreshUser(); }, frame);
  const S = (js) => pg.evaluate(js), sh = "document.querySelector('#futaSalonHost').shadowRoot";
  const tag = frame === 'm' ? 'MEN' : 'WOMEN';
  ok(tag + ': this is the salon template', await S('window.__eng.built.venue') === 'salon');
  const pocket0 = (await S('window.__eng.api.stats()')).wallet.pocket;
  await S(`window.__eng.runActivity(FutaActs.get('get_hair'), {})`); await pg.waitForFunction(`!!document.querySelector('#futaSalonHost')&&${sh}.querySelectorAll('.sl-chip').length>3`, null, { timeout: 25000 });
  const labels = await S(`[...${sh}.querySelectorAll('.sl-row')].map(r=>({t:r.querySelector('label').textContent, c:[...r.querySelectorAll('.sl-chip')].map(c=>c.textContent)}))`);
  const style = labels.find(r => r.t === 'Style').c, beard = labels.find(r => r.t === 'Beard');
  const OPT = await S('FutaAvatar.OPTIONS.hair.styles.map(s=>({l:s.label,f:s.for}))'); const wantFor = frame, should = OPT.filter(s => s.f === 'u' || s.f === wantFor).map(s => s.l), shouldNot = OPT.filter(s => s.f !== 'u' && s.f !== wantFor).map(s => s.l);
  ok(tag + ': offers exactly the styles for this gender (' + style.length + ')', JSON.stringify(style) === JSON.stringify(should), { style, should });
  ok(tag + ': offers none of the other gender\'s styles (' + shouldNot.join(', ') + ')', shouldNot.every(l => style.indexOf(l) < 0));
  ok(tag + ': beard row ' + (frame === 'm' ? 'shown for men' : 'hidden for women'), frame === 'm' ? !!beard : !beard);
  await pg.screenshot({ path: path.join(out, 'salon-' + frame + '.png') });
  // pick a different style + colour, then pay & save
  const before = await S(`JSON.stringify(window.__eng.me.look.hair)`);
  await S(`[...${sh}.querySelectorAll('.sl-row:nth-of-type(1) .sl-chip:not(.on)')][1].click()`); await pg.waitForTimeout(200); await S(`${sh}.querySelectorAll('.sl-sw button')[8].click()`); await pg.waitForTimeout(300);
  await pg.screenshot({ path: path.join(out, 'salon-' + frame + '-picked.png') });
  await S(`${sh}.querySelector('.sl-btn:not(.ghost)').click()`); await pg.waitForFunction(`!document.querySelector('#futaSalonHost')`, null, { timeout: 15000 });
  await pg.waitForTimeout(600);
  const pocket1 = (await S('window.__eng.api.stats()')).wallet.pocket, after = await S(`JSON.stringify(window.__eng.me.look.hair)`), savedHair = await S(`JSON.stringify(JSON.parse(localStorage.getItem('futa.demo.db')).users[0].avatar.hair)`);
  ok(tag + ': ₦3,000 taken from the pocket by the activity', pocket0 - pocket1 === 3000, { pocket0, pocket1 });
  ok(tag + ': hair in the room changed', before !== after); ok(tag + ': new hair was saved on the account', savedHair === after, { savedHair, after });
  // the phone's Clothes app must start from the NEW hair (otherwise saving an outfit would undo the haircut)
  await S(`FutaPhone.show(true); FutaPhone.open('clothes')`); await pg.waitForFunction(`document.querySelector('#futaPhoneHost').shadowRoot.querySelectorAll('.cl-chip').length>1`, null, { timeout: 25000 });
  await S(`[...document.querySelector('#futaPhoneHost').shadowRoot.querySelectorAll('.cl-chip:not(.on)')][0].click()`); await pg.waitForTimeout(300);
  await S(`[...document.querySelector('#futaPhoneHost').shadowRoot.querySelectorAll('.cl-btn')].find(x=>/Save/.test(x.textContent)).click()`); await pg.waitForTimeout(1500);
  ok(tag + ': a later outfit change keeps the new haircut', await S(`JSON.stringify(JSON.parse(localStorage.getItem('futa.demo.db')).users[0].avatar.hair)`) === after);
  await S(`FutaPhone.hide(true)`);
  // second visit straight away: cooldown -> nothing saved, no extra charge, message shown
  await S(`window.__eng.runActivity(FutaActs.get('get_hair'), {})`); await pg.waitForFunction(`!!document.querySelector('#futaSalonHost')&&${sh}.querySelectorAll('.sl-chip').length>3`, null, { timeout: 25000 });
  await S(`[...${sh}.querySelectorAll('.sl-row:nth-of-type(1) .sl-chip:not(.on)')][0].click()`); await pg.waitForTimeout(200); await S(`${sh}.querySelector('.sl-btn:not(.ghost)').click()`); await pg.waitForTimeout(800);
  const msg = await S(`${sh}.querySelector('.sl-err').textContent`), pocket2 = (await S('window.__eng.api.stats()')).wallet.pocket;
  ok(tag + ': too soon -> friendly message, not charged, still open', !!msg && pocket2 === pocket1 && !!(await S(`document.querySelector('#futaSalonHost')`)), { msg, pocket1, pocket2 });
  await pg.screenshot({ path: path.join(out, 'salon-' + frame + '-cooldown.png') });
  await S(`${sh}.querySelector('.sl-btn.ghost').click()`); await pg.waitForTimeout(300); ok(tag + ': Cancel closes the salon', !(await S(`document.querySelector('#futaSalonHost')`)));
  if (errs.length) { console.log('ERRORS:\n' + errs.slice(0, 6).join('\n')); bad++; } else console.log(tag + ': no page errors'); await pg.close();
}
(async () => {
  fs.mkdirSync(out, { recursive: true }); await new Promise(r => srv.listen(0, r)); const port = srv.address().port;
  const b = await chromium.launch({ executablePath: process.env.CHROME, args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--no-sandbox'] });
  await run(b, port, 'f'); await run(b, port, 'm'); await b.close(); srv.close(); process.exit(bad ? 1 : 0);
})();
