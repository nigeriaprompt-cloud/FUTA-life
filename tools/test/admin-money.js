// Admin "Send money" card (public/admin/index.html) in demo mode: one player, all players, validation, review/confirm step, history, no sideways scroll, no page errors.
// usage: node tools/test/admin-money.js   (the config file is replaced inside the browser so it never talks to your real Supabase)
const path = require('path'), http = require('http'), fs = require('fs'); const root = path.join(__dirname, '../../public');
const { chromium } = require(process.env.PW_CORE || 'playwright'); const out = process.env.OUT || '/tmp';
const mime = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml' };
const srv = http.createServer((q, r) => { let p = decodeURIComponent(q.url.split('?')[0]); if (p.endsWith('/')) p += 'index.html'; const f = path.join(root, p); if (!f.startsWith(root) || !fs.existsSync(f)) { r.statusCode = 404; return r.end(); } r.setHeader('content-type', mime[path.extname(f)] || 'application/octet-stream'); r.end(fs.readFileSync(f)); });
let fails = 0; const ok = (c, m) => { console.log((c ? 'ok   - ' : 'FAIL - ') + m); if (!c) fails++; };
(async () => {
  await new Promise(r => srv.listen(0, r)); const port = srv.address().port;
  const b = await chromium.launch({ executablePath: process.env.CHROME, args: ['--no-sandbox'] });
  for (const [w, h, name] of [[375, 740, 'phone'], [1366, 800, 'desktop']]) {
    const pg = await (await b.newContext({ viewport: { width: w, height: h } })).newPage(); const errs = []; pg.on('pageerror', e => errs.push(e.message)); pg.on('console', m => m.type() === 'error' && !/404|ERR_/.test(m.text()) && errs.push(m.text()));
    await pg.route('**/onboarding/config.js', r => r.fulfill({ contentType: 'text/javascript', body: 'window.FUTA_CONFIG={demo:true,supabaseUrl:"",supabaseAnonKey:""};' }));
    await pg.goto(`http://localhost:${port}/admin/index.html`); await pg.waitForSelector('#pw'); await pg.fill('#pw', 'DiorGang##1'); await pg.click('#go'); await pg.waitForSelector('#dash:not([hidden])'); await pg.waitForTimeout(300);
    const msg = () => pg.textContent('#mnNote2'), conf = () => pg.isVisible('#mnConf');
    ok(await pg.isVisible('#mny'), name + ': Send money card is on the dashboard');
    ok(await pg.isVisible('#mnUserW'), name + ': "One player" is the default and shows the username box');
    await pg.click('#mnReview'); ok(/username/i.test(await msg()) && !(await conf()), name + ': empty username is refused');
    await pg.fill('#mnUser', 'Tola_Ade'); await pg.click('#mnReview'); ok(/whole amount/i.test(await msg()) && !(await conf()), name + ': empty amount is refused');
    await pg.fill('#mnAmt', '12.5'); await pg.click('#mnReview'); ok(/whole amount/i.test(await msg()), name + ': decimals are refused (whole naira only)');
    await pg.fill('#mnAmt', '-4'); await pg.click('#mnReview'); ok(/whole amount/i.test(await msg()), name + ': negative is refused');
    await pg.click('#mnQuick button[data-v="5000"]'); ok(await pg.inputValue('#mnAmt') === '5000', name + ': quick amount fills the box');
    await pg.fill('#mnNote', 'Well done'); await pg.click('#mnReview');
    ok(await conf() && !(await pg.isVisible('#mnGo')), name + ': review step asks to confirm');
    const t1 = await pg.textContent('#mnConfTxt'); ok(t1.includes('₦5,000') && t1.includes('@tola_ade') && t1.includes('Well done'), name + ': confirm text names the player, amount and note (' + t1.slice(0, 60) + '…)');
    await pg.fill('#mnAmt', '6000'); ok(!(await conf()), name + ': changing a field cancels the pending review');
    await pg.click('#mnReview'); await pg.click('#mnCancel'); ok(!(await conf()) && await pg.isVisible('#mnGo'), name + ': Cancel goes back');
    await pg.click('#mnReview'); await pg.click('#mnSend'); await pg.waitForTimeout(200);
    ok(/Sent ₦6,000 to @tola_ade/.test(await msg()), name + ': one-player send reported (' + await msg() + ')'); ok(await pg.inputValue('#mnAmt') === '', name + ': form cleared after sending');
    ok((await pg.textContent('#mnHist')).includes('@tola_ade') && (await pg.textContent('#mnHist')).includes('₦6,000'), name + ': it appears in Recent sends');
    // all players
    await pg.click('#mnMode button[data-m="all"]'); await pg.waitForTimeout(200);
    ok(!(await pg.isVisible('#mnUserW')), name + ': "All players" hides the username box'); ok(/120 players/.test(await pg.textContent('#mnInfo')), name + ': shows how many players will get it');
    await pg.fill('#mnAmt', '1000'); await pg.click('#mnReview'); const t2 = await pg.textContent('#mnConfTxt');
    ok(t2.includes('EACH of 120') && t2.includes('₦120,000'), name + ': confirm shows the player count and the total (' + t2.slice(0, 70) + '…)');
    await pg.click('#mnSend'); await pg.waitForTimeout(200); ok(/Sent ₦1,000 to 120 players \(₦120,000 in total\)/.test(await msg()), name + ': all-players send reported');
    ok((await pg.textContent('#mnHist')).includes('All 120 players'), name + ': history shows the all-players send');
    const sw = await pg.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth); ok(sw <= 0, name + ': no sideways scroll (' + sw + ')');
    await pg.locator('#mny').screenshot({ path: path.join(out, `admin-money-${name}.png`) });
    ok(!(await pg.evaluate(() => document.body.innerHTML.includes('DiorGang'))), name + ': password is not written into the page');
    ok(errs.length === 0, name + ': no page errors ' + errs.join('|'));
  }
  const src = fs.readFileSync(path.join(root, 'admin/index.html'), 'utf8'); ok(!/DiorGang/.test(src), 'the password is not in the page source');
  ok(!/innerHTML\s*=\s*[^;]*(mnUser|mnNote|\.note|\.to\b)/.test(src), 'player-typed text is never put in with innerHTML');
  await b.close(); srv.close(); console.log(fails ? 'ADMIN MONEY FAILED' : 'ADMIN MONEY PASSED'); process.exit(fails ? 1 : 0);
})();
