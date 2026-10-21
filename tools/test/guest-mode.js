// Real phone + real pages as a SIGNED-OUT guest (fake Supabase client says "no session"): phone opens first, closing it is not remembered,
// the Settings toggle turns it off, gated apps ask to sign in, interior actions ask to sign in, sign-in link carries ?next=.   usage: node tools/test/guest-mode.js outdir
const { chromium } = require(process.env.PW_CORE || 'playwright'); const http = require('http'), fs = require('fs'), path = require('path');
const root = path.resolve(__dirname, '../../public'), out = process.argv[2] || '.'; fs.mkdirSync(out, { recursive: true });
const mime = { html: 'text/html', js: 'text/javascript', css: 'text/css', json: 'application/json', webmanifest: 'application/manifest+json', png: 'image/png', svg: 'image/svg+xml', txt: 'text/plain', glb: 'model/gltf-binary' };
const srv = http.createServer((q, r) => { const f = path.join(root, decodeURIComponent(q.url.split('?')[0])); fs.readFile(f, (e, b) => { if (e) { r.writeHead(404); r.end(); return; } r.writeHead(200, { 'content-type': mime[path.extname(f).slice(1)] || 'application/octet-stream' }); r.end(b); }); });
let bad = 0; const ok = (c, m) => { if (!c) { bad++; console.log('FAIL -', m); } else console.log('ok   -', m); };
const CFG = "window.FUTA_CONFIG={demo:false,supabaseUrl:'https://x.supabase.co',supabaseAnonKey:'k',afterUrl:'/world/',minAge:13,adultAge:18,brand:{name:'FUTAlife'},previewLod:'auto'};";
const API = "window.FutaApi={me:()=>Promise.resolve({user:null}),rpc:(n)=>Promise.reject(new Error('auth_required')),onAuth(){return ()=>{}},sb(){return{channel(){const c={on(){return c},subscribe(){return c},unsubscribe(){}};return c},from(){throw new Error('no')}}},fail:(e)=>e,signOut:()=>Promise.resolve()};";
(async () => {
  await new Promise(r => srv.listen(0, r)); const base = 'http://localhost:' + srv.address().port;
  const b = await chromium.launch({ executablePath: process.env.CHROME, args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--no-sandbox'] });
  const ctx = await b.newContext({ viewport: { width: 390, height: 780 }, serviceWorkers: 'block' });
  await ctx.route('**/onboarding/config.js', r => r.fulfill({ contentType: 'text/javascript', body: CFG }));
  await ctx.route('**/onboarding/api.js', r => r.fulfill({ contentType: 'text/javascript', body: API }));
  await ctx.route('**/vendor/supabase.min.js', r => r.fulfill({ contentType: 'text/javascript', body: 'window.supabase={}' }));
  const pg = await ctx.newPage(); const errs = []; pg.on('pageerror', e => errs.push(e.message));
  const sh = (fn, a) => pg.evaluate(fn, a);
  const open = () => sh(() => document.getElementById('futaPhone') ? 0 : 0);
  const isOpen = () => sh(() => FutaPhone.isOpen());
  await pg.goto(base + '/world/interior.html?id=x&n=Library&ty=office&tpl=library&hour=11&d=1'); await pg.waitForFunction('window.FutaPhone&&FutaPhone.isGuest&&FutaPhone.isGuest()', null, { timeout: 90000 }); await pg.waitForTimeout(1500);
  ok(await isOpen(), 'phone is open first after the page loads (390px wide phone screen)');
  await sh(() => FutaPhone.hide()); ok(!(await isOpen()), 'closing the phone shows the room');
  await pg.reload(); await pg.waitForFunction('window.FutaPhone&&FutaPhone.isGuest&&FutaPhone.isGuest()', null, { timeout: 90000 }); await pg.waitForTimeout(1500);
  ok(await isOpen(), 'after a reload it opens again (closing is not remembered)');
  // gated apps
  await sh(() => FutaPhone.open('property'));
  const gate = () => sh(() => { const g = document.getElementById('futaPhoneHost').shadowRoot.querySelector('.ph-gate'); return g ? g.textContent : ''; });
  ok(/Sign in to continue/.test(await gate()) && /buy property/.test(await gate()), 'Property asks a guest to sign in: ' + (await gate()).slice(0, 80)); await pg.screenshot({ path: out + '/1-gate.png' });
  const href = await sh(() => FutaPhone.loginUrl()); ok(/signup\.html\?next=%2Fworld%2Finterior\.html/.test(href), 'sign-in link carries ?next= (' + href.slice(0, 90) + '…)');
  await sh(() => [...document.getElementById('futaPhoneHost').shadowRoot.querySelectorAll('.ph-gate button')].find(x => /Not now/.test(x.textContent)).click()); ok(!(await gate()), '"Not now" closes the sheet');
  // Global app: opens, tells the guest to sign in
  await sh(() => FutaPhone.open('global')); await pg.waitForTimeout(400);
  ok(await sh(() => /Sign in to join the conversation/.test(document.getElementById('futaPhoneHost').shadowRoot.textContent)), 'Global app shows the sign-in message to guests'); await pg.screenshot({ path: out + '/2-global-guest.png' });
  // interior action as a guest
  await sh(() => FutaPhone.home()); await sh(() => FutaPhone.hide());
  const r = await pg.evaluate(async () => { try { await window.FUTA_ENGINE_API_TEST(); } catch (e) { return String(e && e.message || e); } return 'ok'; }).catch(() => 'n/a');
  // settings toggle: turn "show phone on start" off
  await sh(() => FutaPhone.show(true)); await sh(() => FutaPhone.open('settings')); await pg.waitForTimeout(500);
  await sh(() => document.getElementById('futaPhoneHost').shadowRoot.querySelector('[data-act=auto]').click());
  await pg.reload(); await pg.waitForFunction('window.FutaPhone&&FutaPhone.isGuest&&FutaPhone.isGuest()', null, { timeout: 90000 }); await pg.waitForTimeout(1500);
  ok(!(await isOpen()), 'with Settings > Show phone on start OFF the phone stays away');
  ok(errs.length === 0, 'no page errors ' + errs.slice(0, 2).join('|'));
  await b.close(); srv.close(); console.log(bad ? bad + ' FAILED' : 'ALL OK');
})();
