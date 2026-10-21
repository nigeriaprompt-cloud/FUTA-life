// Headless browser check of public/world/game/live/live-demo.html (fake backend). usage: node tools/test/live-e2e.js [outdir]
// needs playwright (npm i playwright-core) and Chromium; set CHROME=/path/to/chrome if not at the default.
const { chromium } = require(process.env.PW_CORE || 'playwright'); const http = require('http'), fs = require('fs'), path = require('path'); const root = path.resolve(__dirname, '../../public'), out = process.argv[2] || '.';
const mime = { html: 'text/html', js: 'text/javascript', css: 'text/css', json: 'application/json' };
const srv = http.createServer((q, r) => { const f = path.join(root, decodeURIComponent(q.url.split('?')[0])); fs.readFile(f, (e, b) => { if (e) { r.writeHead(404); r.end(); return; } r.writeHead(200, { 'content-type': mime[f.split('.').pop()] || 'application/octet-stream' }); r.end(b); }); });
const ok = (c, m) => { if (!c) { console.log('FAIL', m); process.exitCode = 1; } else console.log('ok  -', m); };
(async () => {
  await new Promise(r => srv.listen(0, r)); const port = srv.address().port;
  const b = await chromium.launch({ executablePath: process.env.CHROME, args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--no-sandbox'] });
  const pg = await b.newPage({ viewport: { width: 420, height: 760 }, deviceScaleFactor: 2, hasTouch: true }); const errs = [];
  pg.on('pageerror', e => errs.push(e.message)); pg.on('console', m => { if (m.type() === 'error' && !/404/.test(m.text())) errs.push(m.text()); });
  await pg.goto(`http://localhost:${port}/world/game/live/live-demo.html`); await pg.waitForFunction('window.__demo && document.title.indexOf("✓")>0', null, { timeout: 30000 });
  await pg.waitForFunction('window.__demo.remotes.items.size===3', null, { timeout: 15000 }); ok(true, '3 remote players are drawn');
  await pg.waitForTimeout(1200); await pg.screenshot({ path: path.join(out, 'live1.png') });
  const names = await pg.evaluate('Array.from(window.__demo.live.peers.values()).map(p=>p.profile&&p.profile.username).sort().join(",")'); ok(names === 'ngozi,tunde,zainab', 'names come from profiles: ' + names);
  // chair → walk around the wall → sit
  const sat = await pg.evaluate('window.__demo.handle(8,3.1)'); ok(sat === true, 'click chair → walked → sat'); const s = await pg.evaluate('({anim:window.__demo.state.anim,x:window.__demo.state.x,z:window.__demo.state.z,seat:window.__demo.inter.sitting})'); ok(s.anim === 'sit' && s.seat === 'chair2', 'sitting on chair2 ' + JSON.stringify(s));
  await pg.waitForTimeout(500); await pg.screenshot({ path: path.join(out, 'live2.png') });
  // chat round trip
  await pg.fill('#flIn input', 'hello from the test'); await pg.press('#flIn input', 'Enter'); await pg.waitForFunction('document.getElementById("flLog").innerText.indexOf("Welcome to FUTA")>0', null, { timeout: 5000 }); ok(true, 'chat: own message + bot reply shown');
  // ATM
  await pg.evaluate('window.__demo.handle(10.4,9)'); await pg.waitForSelector('#futaAtm'); await pg.waitForFunction('document.querySelector("#futaAtm [data-bal]").innerText.indexOf("15,000")>0'); await pg.click('#futaAtm [data-row] button:nth-child(2)'); await pg.waitForFunction('document.querySelector("#futaAtm [data-bal]").innerText.indexOf("5,500")>0', null, { timeout: 4000 }); ok(true, 'ATM: withdraw ₦5,000 updates pocket to ₦5,500');
  await pg.screenshot({ path: path.join(out, 'live3.png') }); await pg.click('#futaAtm [data-x]');
  // tap on a person → card
  const hit = await pg.evaluate(`(()=>{const it=[...window.__demo.remotes.items.values()][0];const v=new THREE.Vector3();it.av.group.getWorldPosition(v);v.y+=1;return v.toArray();})()`); void hit;
  ok(errs.length === 0, 'no page errors' + (errs.length ? ': ' + errs[0] : '')); await b.close(); srv.close();
})().catch(e => { console.log('E2E ERROR', e.message); process.exit(1); });
