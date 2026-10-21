// Walks the whole sign-up flow on a phone-sized screen in demo mode and saves screenshots. usage: node flow.js outdir
const { chromium } = require(process.env.PW_CORE||'playwright');
const http = require('http'), fs = require('fs'), path = require('path');
const root = path.resolve(__dirname, '../../public'), out = process.argv[2] || '.';
const types = { '.js': 'text/javascript', '.html': 'text/html', '.json': 'application/json', '.css': 'text/css' };
const srv = http.createServer((req, res) => { const f = path.join(root, decodeURIComponent(req.url.split('?')[0])); fs.readFile(f, (e, b) => { if (e) { res.writeHead(404); res.end(); return; } res.writeHead(200, { 'content-type': types[path.extname(f)] || 'application/octet-stream' }); res.end(b); }); });
(async () => {
  await new Promise(r => srv.listen(0, r)); const port = srv.address().port;
  const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const pg = await b.newPage({ viewport: { width: 390, height: 800 }, deviceScaleFactor: 1 });
  pg.on('console', m => { if (m.type() === 'error' || m.type() === 'warning') console.log('console:', m.text().slice(0, 300)); }); pg.on('pageerror', e => console.log('PAGEERROR', e.message.slice(0, 400)));
  let bytes = 0; pg.on('response', async r => { try { const l = r.headers()['content-length']; bytes += +l || 0; } catch (e) { } });
  const t0 = Date.now();
  await pg.goto(`http://localhost:${port}/world/game/onboarding/signup.html`); await pg.waitForSelector('#startBtn');
  console.log('welcome visible ms', Date.now() - t0); await pg.screenshot({ path: out + '/s1_welcome.png' });
  await pg.click('#startBtn'); await pg.waitForSelector('#em'); await pg.screenshot({ path: out + '/s2_account.png' });
  await pg.fill('#em', 'ada@example.com'); await pg.fill('#pw', 'secret123'); await pg.click('#go');
  await pg.waitForSelector('#un'); await pg.fill('#un', 'lagos_ada'); await pg.fill('#dob', '2003-05-12'); await pg.waitForSelector('#unh.ok'); await pg.screenshot({ path: out + '/s3_profile.png' });
  await pg.click('#go'); await pg.waitForSelector('.cr canvas', { timeout: 30000 }); await pg.waitForTimeout(2500); await pg.screenshot({ path: out + '/s4_look.png' });
  await pg.click('.cr-tabs button[data-t=hair]'); await pg.waitForTimeout(1200); await pg.screenshot({ path: out + '/s4b_hair.png' });
  await pg.click('.cr-tabs button[data-t=clothes]'); await pg.waitForTimeout(1200); await pg.screenshot({ path: out + '/s4c_clothes.png' });
  await pg.click('#save'); await pg.waitForSelector('.story'); await pg.click('.story >> nth=2'); await pg.screenshot({ path: out + '/s5_life.png' });
  await pg.click('#go'); await pg.waitForSelector('#enter'); await pg.waitForTimeout(2500); await pg.screenshot({ path: out + '/s6_final.png' });
  console.log('done total ms', Date.now() - t0);
  await b.close(); srv.close();
})().catch(e => { console.log('FAIL', e.message); process.exit(1); });
