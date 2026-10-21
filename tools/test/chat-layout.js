// Interior chat: never overlaps the stats bars / phone button, shows at most 7 messages, tap a name to tag it (yourself too), @mentions highlighted.
const path = require('path'), http = require('http'), fs = require('fs'); const root = path.join(__dirname, '../../public'), out = process.env.OUT || '/tmp';
const { chromium } = require(process.env.PW_CORE || 'playwright');
const srv = http.createServer((q, r) => { const f = path.join(root, decodeURIComponent(q.url.split('?')[0])); fs.readFile(f, (e, b) => { if (e) { r.writeHead(404); r.end(); return; } r.writeHead(200, { 'content-type': { '.html': 'text/html', '.js': 'text/javascript', '.json': 'application/json', '.css': 'text/css' }[path.extname(f)] || 'application/octet-stream' }); r.end(b); }); });
let fails = 0; const ok = (c, m) => { console.log((c ? 'ok   - ' : 'FAIL - ') + m); if (!c) fails++; };
(async () => {
  await new Promise(r => srv.listen(0, r)); const port = srv.address().port;
  const b = await chromium.launch({ executablePath: process.env.CHROME, args: ['--no-sandbox', '--use-gl=swiftshader', '--enable-unsafe-swiftshader'] });
  for (const [w, h] of [[430, 820], [360, 640]]) {
    const pg = await (await b.newContext({ viewport: { width: w, height: h } })).newPage(); const errs = []; pg.on('pageerror', e => errs.push(e.message));
    await pg.goto(`http://localhost:${port}/world/interior.html?id=lt1&n=LT1&ty=lecture_theatre&hour=11&peers=1&fast=1`); await pg.waitForSelector('#flChat', { timeout: 30000 }); await pg.waitForTimeout(2500);
    for (let i = 1; i <= 10; i++) { await pg.fill('#flIn input', 'message number ' + i); await pg.press('#flIn input', 'Enter'); await pg.waitForTimeout(350); }
    await pg.waitForTimeout(800);
    ok(await pg.locator('#flLog > div').count() <= 7, `${w}px: at most 7 messages shown (${await pg.locator('#flLog > div').count()})`);
    ok((await pg.locator('#flLog').innerText()).includes('message number 10') && !(await pg.locator('#flLog').innerText()).includes('message number 2\n'), `${w}px: newest kept, oldest dropped`);
    const box = async (sel) => pg.evaluate(s => { const e = [...document.querySelectorAll(s)][0]; if (!e) return null; const r = e.getBoundingClientRect(); return { x: r.left, y: r.top, r: r.right, b: r.bottom }; }, sel);
    const chat = await box('#flChat'), bars = await pg.evaluate(() => { const e = [...document.querySelectorAll('div')].find(d => d.textContent.startsWith('⚡') && d.style.position === 'absolute'); if (!e) return null; const r = e.getBoundingClientRect(); return { x: r.left, y: r.top, r: r.right, b: r.bottom }; }), phone = await box('#futaPhoneBtn');
    const hit = (a, c) => a && c && a.x < c.r && a.r > c.x && a.y < c.b && a.b > c.y;
    ok(!hit(chat, bars), `${w}px: chat does not overlap the stats bars`); ok(!hit(chat, phone), `${w}px: chat does not overlap the phone button`);
    await pg.locator('#flLog b').first().click(); const v = await pg.inputValue('#flIn input'); ok(/^@[a-z0-9_]+ $/.test(v), `${w}px: tapping a name tags it (${JSON.stringify(v)})`);
    await pg.fill('#flIn input', ''); await pg.locator('#flLog .me b').first().click(); ok(/^@you $/.test(await pg.inputValue('#flIn input')), `${w}px: you can tag yourself`);
    await pg.fill('#flIn input', 'hi @zainab see you'); await pg.press('#flIn input', 'Enter'); await pg.waitForTimeout(700); ok(await pg.locator('#flLog .tag').count() >= 1, `${w}px: @mention is highlighted`);
    ok(await pg.evaluate(() => [...document.querySelectorAll('#flLog .tag')].every(t => t.children.length === 0)), `${w}px: mentions are plain text (no HTML injected)`);
    await pg.screenshot({ path: path.join(out, `chat-layout-${w}.png`) }); ok(errs.length === 0, `${w}px: no page errors ${errs.join('|')}`);
  }
  await b.close(); srv.close(); console.log(fails ? 'CHAT LAYOUT FAILED' : 'CHAT LAYOUT PASSED'); process.exit(fails ? 1 : 0);
})();
