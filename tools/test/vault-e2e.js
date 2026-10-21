// Plays the Bank vault through the REAL UI in a headless browser (local demo mode, answers read from the demo's localStorage).
// usage: node tools/test/vault-e2e.js [outdir]      env: CHROME (chromium binary), PW_CORE (playwright path)
// Checks: win (all puzzle kinds are solved through the screens) + payout in pocket + cooldown · give up → jail screen → release → leave · under-18 "Vault Challenge" has no jail.
const { chromium } = require(process.env.PW_CORE || 'playwright'); const http = require('http'), fs = require('fs'), path = require('path');
const root = path.resolve(__dirname, '../../public'), out = process.argv[2] || '.'; fs.mkdirSync(out, { recursive: true });
const mime = { html: 'text/html', js: 'text/javascript', css: 'text/css', json: 'application/json' };
const srv = http.createServer((q, r) => { const f = path.join(root, decodeURIComponent(q.url.split('?')[0])); fs.readFile(f, (e, b) => { if (e) { r.writeHead(404); r.end(); return; } r.writeHead(200, { 'content-type': mime[f.split('.').pop()] || 'application/octet-stream' }); r.end(b); }); });
let fails = 0; const ok = (c, m) => { console.log((c ? 'ok   - ' : 'FAIL - ') + m); if (!c) fails++; };
const URL_ = (port, extra) => `http://localhost:${port}/world/interior.html?id=building_mv0q4b841p&n=Bank&ty=office&hour=15&d=1&fast=1${extra || ''}`;
(async () => {
  await new Promise(r => srv.listen(0, r)); const port = srv.address().port;
  const br = await chromium.launch({ executablePath: process.env.CHROME, args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--no-sandbox'] });
  async function fresh(extra, vp) {
    const ctx = await br.newContext({ viewport: vp || { width: 1000, height: 700 } }), pg = await ctx.newPage(), errs = []; pg.on('pageerror', e => errs.push(e.message)); pg.on('dialog', d => d.accept());
    pg.on('console', m => { if (m.type() === 'error' && !/404/.test(m.text())) errs.push(m.text()); }); await pg.goto(URL_(port, extra));
    await pg.waitForFunction('window.__eng&&window.__frames>5', null, { timeout: 60000 }); return { pg, errs, ctx };
  }
  const openVault = async (pg) => { await pg.evaluate(() => __eng.useVault(__eng.built.interactives.find(p => p.name === 'vaultdoor'))); await pg.waitForSelector('.fv-card .fv-btn.primary', { timeout: 30000 }); };
  const demo = (pg) => pg.evaluate(() => JSON.parse(localStorage.getItem('futa.demo.vault')));
  const clickText = (pg, sel, txt) => pg.evaluate(([s, t]) => { const b = [...document.querySelectorAll(s)].find(x => x.textContent.trim() === t); if (b) b.click(); return !!b; }, [sel, txt]);

  async function solveStep(pg, seen) {
    const S = await demo(pg), a = S.attempt, p = a.puzzles[a.step], st = p.st; seen.add(p.kind);
    if (p.kind === 'lock') {
      await pg.evaluate((codes) => { document.querySelectorAll('.fv-code').forEach((i, k) => { if (!i.disabled) { i.value = String(codes[k]); i.dispatchEvent(new Event('input')); } }); }, st.codes); await clickText(pg, '.fv-btn', 'Try the codes');
    } else if (p.kind === 'cracker') { for (const d of st.secret) await clickText(pg, '.fv-key', d); await clickText(pg, '.fv-key', 'OK'); }
    else if (p.kind === 'wires') { for (const i of st.sol) { await pg.evaluate((i) => { const e = document.querySelector('[data-w="' + i + '"]'); e.dispatchEvent(new MouseEvent('click', { bubbles: true })); }, i); await pg.waitForTimeout(250); } }
    else if (p.kind === 'pattern') { await pg.evaluate((n) => document.querySelectorAll('.fv-opt')[n].click(), st.ans); }
    else if (p.kind === 'lights') {
      for (let round = 0; round < 3; round++) {
        await pg.waitForFunction(() => { const h = document.querySelector('.fv-pzh'); return h && !h.classList.contains('fv-locked') && document.querySelector('.fv-lstatus').textContent.indexOf('Your turn') >= 0; }, null, { timeout: 40000 }).catch(() => { });
        const cur = (await demo(pg)).attempt; if (!cur || cur.step !== a.step) return; const q = cur.puzzles[cur.step].st;
        for (let k = q.pos; k < q.seq.length; k++) { await pg.evaluate((c) => { const names = ['red', 'green', 'blue', 'yellow']; document.querySelectorAll('.fv-pad')[names.indexOf(c)].click(); }, q.seq[k]); await pg.waitForTimeout(450); }
        await pg.waitForTimeout(500);
      }
    } else if (p.kind === 'match') { await pg.evaluate((n) => document.querySelectorAll('.fv-item')[n].click(), st.target); }
    return p.kind;
  }

  /* ---------- 1. adult wins ---------- */
  { const { pg, errs, ctx } = await fresh(); const seen = new Set(); await openVault(pg);
    const pocket0 = await pg.evaluate(() => JSON.parse(localStorage.getItem('futa.demo.play') || '{"pocket":5000}').pocket);
    await pg.click('.fv-btn.primary'); await pg.waitForSelector('.fv-timer', { timeout: 20000 });
    ok(!!(await pg.$('.fv-steps')), 'play screen shows timer + 3 steps'); await pg.screenshot({ path: path.join(out, 'vault-play1.png') });
    let guard = 0; while (!(await pg.$('.fv-res')) && guard++ < 14) {
      const S = await demo(pg); if (!S.attempt) break; const kind = await solveStep(pg, seen); await pg.screenshot({ path: path.join(out, 'vault-' + kind + '.png') }).catch(() => { }); await pg.waitForTimeout(1500);
    }
    await pg.waitForSelector('.fv-res.win', { timeout: 20000 }).catch(() => { }); const won = !!(await pg.$('.fv-res.win'));
    ok(won, 'adult cleared all 3 puzzles through the UI (kinds played: ' + [...seen].join(', ') + ')');
    if (won) { await pg.waitForTimeout(2300); await pg.screenshot({ path: path.join(out, 'vault-win.png') }); const S = await demo(pg), pocket1 = await pg.evaluate(() => JSON.parse(localStorage.getItem('futa.demo.play')).pocket);
      ok(pocket1 - pocket0 >= 7000000 && pocket1 - pocket0 <= 14000000, 'payout 7m–14m went to the pocket (+₦' + (pocket1 - pocket0).toLocaleString() + ')'); ok(S.status === 'empty' && S.refillAt - Date.now() > 1190000, 'vault is empty and refills in ~20 min');
      ok(S.cooldownUntil - Date.now() > 10790000, 'winner has the 3 h cooldown'); await clickText(pg, '.fv-btn', 'Done'); await pg.waitForTimeout(400);
      await pg.waitForFunction(() => __eng.led && true); await pg.evaluate(() => __eng.pollVault()); await pg.waitForTimeout(300);
      await pg.evaluate(() => __eng.useVault(__eng.built.interactives.find(p => p.name === 'vaultdoor'))); await pg.waitForSelector('.fv-pill', { timeout: 20000 }); ok(/EMPTY/.test(await pg.textContent('.fv-pill')), 'lobby now says EMPTY with refill countdown'); }
    ok(errs.length === 0, 'no page errors (win run) ' + errs.slice(0, 3).join(' | ')); await ctx.close(); }

  /* ---------- 1b. every puzzle kind through the UI: force kinds by swapping the saved attempt, reload, RESUME it ---------- */
  for (const kinds of [['wires', 'pattern', 'match'], ['lights', 'lock', 'cracker']]) {
    const { pg, errs, ctx } = await fresh(); await openVault(pg); await pg.click('.fv-btn.primary'); await pg.waitForSelector('.fv-timer');
    await pg.evaluate((ks) => { const S = JSON.parse(localStorage.getItem('futa.demo.vault')); S.attempt.puzzles = ks.map(k => ({ kind: k, st: FutaVaultCore.gen(k) })); S.attempt.step = 0; localStorage.setItem('futa.demo.vault', JSON.stringify(S)); }, kinds);
    await pg.reload(); await pg.waitForFunction('window.__eng&&window.__frames>5', null, { timeout: 60000 }); await openVault(pg);
    ok(/Resume/.test(await pg.textContent('.fv-btn.primary')), 'reload mid-attempt → lobby offers "Resume"'); await pg.click('.fv-btn.primary'); await pg.waitForSelector('.fv-timer'); const seen = new Set(); let guard = 0;
    while (!(await pg.$('.fv-res')) && guard++ < 10) { await pg.waitForTimeout(600); const S = await demo(pg); if (!S.attempt) break; const kind = await solveStep(pg, seen); await pg.screenshot({ path: path.join(out, 'vault-' + kind + '.png') }).catch(() => { }); await pg.waitForTimeout(1500); }
    await pg.waitForSelector('.fv-res.win', { timeout: 20000 }).catch(() => { }); ok(!!(await pg.$('.fv-res.win')) && kinds.every(k => seen.has(k)), 'all of [' + kinds.join(', ') + '] solved through the screens → win'); ok(errs.length === 0, 'no page errors ' + errs.slice(0, 3).join(' | ')); await ctx.close();
  }

  /* ---------- 2. adult fails → jail screen → release ---------- */
  { const { pg, errs, ctx } = await fresh(); await openVault(pg); await pg.click('.fv-btn.primary'); await pg.waitForSelector('.fv-timer');
    await clickText(pg, '.fv-btn', 'Give up'); await pg.waitForSelector('.fv-res.caught', { timeout: 15000 }); ok(true, 'giving up → BUSTED screen'); await pg.screenshot({ path: path.join(out, 'vault-busted.png') });
    await pg.waitForFunction('window.__jail&&window.__jailFrames>5', null, { timeout: 40000 }); ok(true, 'page reloads into the jail cell (cannot escape by refreshing)');
    await pg.waitForTimeout(3500); await pg.screenshot({ path: path.join(out, 'jail.png') });
    const left = await pg.evaluate(() => __jail.left); ok(left > 165 && left <= 180, '3-minute sentence (' + Math.round(left) + ' s left)');
    ok(/\d:\d\d/.test(await pg.evaluate(() => document.body.innerText)), 'countdown is on screen');
    // shorten the sentence in the demo store, reload, wait for release
    await pg.evaluate(() => { const s = JSON.parse(localStorage.getItem('futa.demo.vault')); s.jailUntil = Date.now() + 4000; localStorage.setItem('futa.demo.vault', JSON.stringify(s)); }); await pg.reload();
    await pg.waitForFunction('window.__jail&&window.__jailFrames>3', null, { timeout: 40000 }); await pg.waitForFunction(() => __jail.state.free, null, { timeout: 40000 }); ok(true, 'released when the countdown ends');
    await pg.waitForTimeout(2500); await pg.screenshot({ path: path.join(out, 'jail-free.png') });
    await clickText(pg, 'button', 'Walk out ➜'); const left_ = await pg.waitForFunction(() => location.pathname.indexOf('interior.html') < 0, null, { timeout: 45000 }).then(() => true).catch(() => false); ok(left_, 'Walk out → back to the map'); ok(errs.length === 0, 'no page errors (jail run) ' + errs.slice(0, 3).join(' | ')); await ctx.close(); }

  /* ---------- 3. under 18: Vault Challenge, no arrest ---------- */
  { const { pg, errs, ctx } = await fresh('&teen=1'); await openVault(pg); ok(/Vault Challenge/.test(await pg.textContent('.fv-head')), 'teen sees "Vault Challenge"'); ok(!/ARRESTED|jail/i.test(await pg.textContent('.fv-rules')), 'teen rules mention no arrest');
    await pg.click('.fv-btn.primary'); await pg.waitForSelector('.fv-timer'); await clickText(pg, '.fv-btn', 'Give up'); await pg.waitForSelector('.fv-res.fail', { timeout: 15000 }); ok(true, 'teen failing → "Challenge failed" (cooldown only)'); await pg.screenshot({ path: path.join(out, 'vault-teen-fail.png') });
    const S = await demo(pg); ok(S.jailUntil === 0 && S.cooldownUntil > Date.now() + 500000, 'no jail time, 10-minute cooldown'); ok(errs.length === 0, 'no page errors (teen run) ' + errs.slice(0, 3).join(' | ')); await ctx.close(); }

  /* ---------- 4. phone-size layout ---------- */
  { const { pg, ctx } = await fresh('', { width: 390, height: 780 }); await openVault(pg); await pg.click('.fv-btn.primary'); await pg.waitForSelector('.fv-timer');
    const w = await pg.evaluate(() => ({ sw: document.querySelector('.fv-card').scrollWidth, cw: document.querySelector('.fv-card').clientWidth, vw: innerWidth })); ok(w.sw <= w.cw + 1 && w.cw <= w.vw, 'phone width (390 px): no sideways overflow'); await pg.screenshot({ path: path.join(out, 'vault-phone.png') }); await ctx.close(); }

  await br.close(); srv.close(); console.log(fails ? '\n' + fails + ' CHECK(S) FAILED' : '\nVAULT E2E PASSED'); process.exit(fails ? 1 : 0);
})();
