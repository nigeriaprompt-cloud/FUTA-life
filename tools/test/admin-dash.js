// Admin dashboard: gate, wrong/right password (demo data), no horizontal scroll at phone/tablet/desktop widths, no page errors.
const path = require('path'), http = require('http'), fs = require('fs'); const root = path.join(__dirname, '../../public');
const { chromium } = require(process.env.PW_CORE || 'playwright'); const out = process.env.OUT || '/tmp';
const mime = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml' };
const srv = http.createServer((q, r) => { let p = decodeURIComponent(q.url.split('?')[0]); if (p.endsWith('/')) p += 'index.html'; const f = path.join(root, p); if (!f.startsWith(root) || !fs.existsSync(f)) { r.statusCode = 404; return r.end(); } r.setHeader('content-type', mime[path.extname(f)] || 'application/octet-stream'); fs.createReadStream(f).pipe(r); });
let fails = 0; const ok = (c, m) => { console.log((c ? 'ok   - ' : 'FAIL - ') + m); if (!c) fails++; };
(async () => {
  await new Promise(r => srv.listen(0, r)); const port = srv.address().port;
  const b = await chromium.launch({ executablePath: process.env.CHROME, args: ['--no-sandbox'] });
  for (const [w, h, name] of [[375, 740, 'phone'], [820, 1000, 'tablet'], [1366, 800, 'desktop']]) {
    const pg = await (await b.newContext({ viewport: { width: w, height: h } })).newPage(); const errs = []; pg.on('pageerror', e => errs.push(e.message)); pg.on('console', m => m.type() === 'error' && !/404/.test(m.text()) && errs.push(m.text()));
    await pg.goto(`http://localhost:${port}/admin/index.html`); await pg.waitForSelector('#pw');
    ok(await pg.isVisible('#gate') && !(await pg.isVisible('#dash')), name + ': locked until a password is entered');
    await pg.screenshot({ path: path.join(out, `admin-${name}-gate.png`) });
    await pg.fill('#pw', ''); await pg.click('#go'); ok(!(await pg.isVisible('#dash')), name + ': empty password does nothing');
    await pg.fill('#pw', 'DiorGang##1'); await pg.click('#go'); await pg.waitForSelector('#dash:not([hidden])'); await pg.waitForTimeout(300);
    ok(await pg.locator('.tile').count() >= 7, name + ': tiles shown'); ok(await pg.locator('svg rect').count() >= 30, name + ': charts drawn');
    const sw = await pg.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth); ok(sw <= 0, name + ': no sideways scroll (' + sw + ')');
    ok(!(await pg.evaluate(() => document.body.innerHTML.includes('DiorGang'))), name + ': password is not written into the page');
    await pg.screenshot({ path: path.join(out, `admin-${name}.png`), fullPage: true });
    await pg.click('#lock'); ok(await pg.isVisible('#gate'), name + ': Lock returns to the gate'); ok(errs.length === 0, name + ': no page errors ' + errs.join('|'));
  }
  const src = fs.readFileSync(path.join(root, 'admin/index.html'), 'utf8'); ok(!/DiorGang/.test(src), 'the password is not in the page source');
  await b.close(); srv.close(); console.log(fails ? 'ADMIN DASH FAILED' : 'ADMIN DASH PASSED'); process.exit(fails ? 1 : 0);
})();
