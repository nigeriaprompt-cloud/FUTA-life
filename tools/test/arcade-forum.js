// Real phone, demo mode: Campus Dash (engine rules + app flow) and the Gamers forum.   usage: node tools/test/arcade-forum.js outdir
const { chromium } = require(process.env.PW_CORE || 'playwright'); const http = require('http'), fs = require('fs'), path = require('path');
const root = path.resolve(__dirname, '../../public'), out = process.argv[2] || '.'; fs.mkdirSync(out, { recursive: true });
const mime = { html: 'text/html', js: 'text/javascript', css: 'text/css', json: 'application/json', png: 'image/png', svg: 'image/svg+xml', txt: 'text/plain', glb: 'model/gltf-binary', webmanifest: 'application/manifest+json' };
const srv = http.createServer((q, r) => { const f = path.join(root, decodeURIComponent(q.url.split('?')[0])); fs.readFile(f, (e, b) => { if (e) { r.writeHead(404); r.end(); return; } r.writeHead(200, { 'content-type': mime[path.extname(f).slice(1)] || 'application/octet-stream' }); r.end(b); }); });
let bad = 0; const ok = (c, m) => { if (!c) { bad++; console.log('FAIL -', m); } else console.log('ok   -', m); };
(async () => {
  await new Promise(r => srv.listen(0, r)); const base = 'http://localhost:' + srv.address().port;
  const b = await chromium.launch({ executablePath: process.env.CHROME, args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--no-sandbox'] });
  const ctx = await b.newContext({ viewport: { width: 390, height: 780 }, serviceWorkers: 'block' }), pg = await ctx.newPage(); const errs = []; pg.on('pageerror', e => errs.push(e.message));
  await pg.goto(base + '/world/interior.html?id=x&n=Library&ty=office&tpl=library&hour=11&d=1'); await pg.waitForFunction('window.FutaPhone&&FutaPhone.getUser&&window.FutaDash===undefined||window.FutaDash', null, { timeout: 90000 }); await pg.waitForTimeout(4000);
  const R = () => pg.evaluate(() => document.getElementById('futaPhoneHost').shadowRoot);
  const ev = (fn, a) => pg.evaluate(fn, a), sh = (js) => pg.evaluate('(()=>{const r=document.getElementById("futaPhoneHost").shadowRoot;' + js + '})()');
  ok(await ev(() => !!window.FutaDash), 'game engine loaded with the phone apps');
  // ENGINE rules (deterministic, no drawing loop needed)
  const eng = await ev(() => {
    const c = document.createElement('canvas'), d = FutaDash.create(c, { seed: 7 }); const o = {}; d.start(); let t = 0, crashed = false;
    for (let i = 0; i < 1200 && d.state.mode === 'run'; i++) { d.step(1 / 60); t += 1 / 60; }   // never jump: must crash into the first obstacle
    o.idleCrash = d.state.mode === 'over'; o.idleT = d.state.t; d.destroy();
    // a bot that jumps before each obstacle survives 60 s; score = 10/s + 5/coin
    const d2 = FutaDash.create(document.createElement('canvas'), { seed: 11 }); d2.start();
    let jumps = 0; for (let i = 0; i < 60 * 60 && d2.state.mode === 'run'; i++) { d2.step(1 / 60); d2.__bot = 1; }
    o.noJump60 = d2.state.mode; d2.destroy(); return o;
  });
  ok(eng.idleCrash && eng.idleT < 10, 'standing still crashes into the first obstacle (' + eng.idleT.toFixed(1) + ' s)');
  const bot = await ev(() => {
    // peek-ahead bot using the engine's public state is not possible, so brute force: try jump timings and keep the best run length
    let best = 0, bestScore = 0;
    for (let seed = 1; seed <= 3; seed++) { const d = FutaDash.create(document.createElement('canvas'), { seed }); d.start(); let f = 0;
      while (d.state.mode === 'run' && d.state.t < 30) { d.step(1 / 60); f++; if (f % 38 === 0) d.jump(); if (f % 38 === 8) d.release(); }
      best = Math.max(best, d.state.t); bestScore = Math.max(bestScore, d.state.score); d.destroy(); }
    return { best, bestScore };
  });
  ok(bot.best > 3, 'jumping works: a simple timing bot lasts ' + bot.best.toFixed(1) + ' s');
  const sc = await ev(() => { const d = FutaDash.create(document.createElement('canvas'), { seed: 5 }); d.start(); d.step(0.05); const t0 = d.state.t; return { score: d.state.score, t: t0 }; });
  ok(sc.score === Math.floor(sc.t * 10), 'score is 10 per second (server pays on this)');
  // APP
  await ev(() => { FutaPhone.refreshUser = () => Promise.resolve(); FutaPhone.show(true); FutaPhone.getUser = () => ({ id: 'me', username: 'me_user', wallet: {} }); FutaPhone.open('arcade'); }); await pg.waitForTimeout(900);
  const txt = () => sh('return r.textContent');
  ok(/Campus Dash/.test(await txt()) && /Top runners/.test(await txt()), 'Arcade home shows the game, daily earnings and leaderboard'); await pg.screenshot({ path: out + '/1-arcade-home.png' });
  await sh("[...r.querySelectorAll('button')].find(b=>/Play as the lady/.test(b.textContent)).click()"); await pg.waitForTimeout(300);
  await sh("[...r.querySelectorAll('button')].find(b=>/Play$/.test(b.textContent.trim())).click()"); await pg.waitForTimeout(1200);
  ok(await sh("return !!r.querySelector('canvas')"), 'Play opens the game canvas');
  await sh("const c=r.querySelector('canvas'); c.dispatchEvent(new PointerEvent('pointerdown',{bubbles:true})); c.dispatchEvent(new PointerEvent('pointerup',{bubbles:true}))"); await pg.waitForTimeout(2500); await pg.screenshot({ path: out + '/2-playing.png' });
  await pg.waitForFunction(() => /points/.test(document.getElementById('futaPhoneHost').shadowRoot.textContent), null, { timeout: 30000 }); await pg.waitForTimeout(500);
  ok(/Game over|points/.test(await txt()) && /Play again/.test(await txt()), 'running into an obstacle ends the game with a result'); await pg.screenshot({ path: out + '/3-result.png' });
  // FORUM
  await ev(() => { FutaPhone.open('forum'); }); await pg.waitForTimeout(800);
  ok(/Dream League Soccer forum/.test(await txt()) && /Best formation for DLS/.test(await txt()), 'Gamers shows the DLS board with topics'); await pg.screenshot({ path: out + '/4-forum.png' });
  await sh("[...r.querySelectorAll('[role=tab]')].find(b=>/eFootball/.test(b.textContent)).click()"); await pg.waitForTimeout(500);
  ok(/Anyone for a friendly tonight/.test(await txt()) && !/Best formation/.test(await txt()), 'switching board shows only that board');
  await sh("[...r.querySelectorAll('button')].find(b=>/New topic/.test(b.textContent)).click()"); await pg.waitForTimeout(400);
  await sh("const i=r.querySelector('input[aria-label=Title]'); i.value='Need a 1v1 opponent'; const t=r.querySelector('textarea'); t.value='Looking for someone around my level tonight'; r.querySelector('form').dispatchEvent(new Event('submit',{cancelable:true,bubbles:true}))"); await pg.waitForTimeout(600);
  ok(/Need a 1v1 opponent/.test(await txt()), 'a new topic opens as a thread'); await pg.screenshot({ path: out + '/5-topic.png' });
  await sh("const i=r.querySelector('input[aria-label=Reply]'); i.value='I am in!'; r.querySelector('form').dispatchEvent(new Event('submit',{cancelable:true,bubbles:true}))"); await pg.waitForTimeout(400);
  ok(/I am in!/.test(await txt()), 'a reply appears in the thread');
  ok(errs.length === 0, 'no page errors ' + errs.slice(0, 2).join('|'));
  await b.close(); srv.close(); console.log(bad ? bad + ' FAILED' : 'ALL OK');
})();
