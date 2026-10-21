// Headless check of the FUTAlife WhatsApp link + the online labels. usage: node tools/test/community.js [outdir]
// Part 1  map page stand-in (#zoom + #cmp + community.js) with a fake online_now(): pill, card, busiest list, WhatsApp link, hide-while-zoom-bar, error = nothing shown.
// Part 2  the REAL phone (demo mode): home-screen strip + WhatsApp card, Settings → Community row.
const { chromium } = require(process.env.PW_CORE || 'playwright');
const http = require('http'), fs = require('fs'), path = require('path');
const root = path.resolve(__dirname, '../../public'), out = process.argv[2] || '.';
const CH = 'https://whatsapp.com/channel/0029Vb8ycAzEgGfKUalSm62w';
const types = { '.js': 'text/javascript', '.html': 'text/html', '.json': 'application/json', '.css': 'text/css' };
const MAPHOST = `<!doctype html><meta charset=utf-8><meta name=viewport content="width=device-width,initial-scale=1"><body style="margin:0;background:#8fb89c;height:100vh">
<div id="zoom"></div><div id="cmp" style="display:none">bar</div>
<script>window.FUTA_CONFIG={demo:false};window.PTW_DATA={buildings:[{id:'b1',name:'Albert Ilemobade Library (Main)'},{id:'b2',name:'Student Union Building'}]};
window.__mode='ok';window.calls=[];window.FutaApi={rpc:async(n)=>{window.calls.push(n);if(window.__mode==='fail')throw new Error('x');if(n==='online_now')return{players:24,inside:7,busiest:[{b:'b1',n:4},{b:'b2',n:2}]};return null}};
window.FutaPhone={getUser:()=>({id:'u'}),on(){}};</script><script src="/world/game/community/community.js"></script>`;
const PHONEHOST = '<!doctype html><meta charset=utf-8><meta name=viewport content="width=device-width,initial-scale=1"><body style="margin:0;background:#cfe3d4"><script src="/world/game/community/community.js"></script><script src="/world/game/phone/phone.js" defer></script>';
const srv = http.createServer((req, res) => {
  const url = req.url.split('?')[0];
  if (url === '/map.html' || url === '/phone.html') { res.writeHead(200, { 'content-type': 'text/html' }); return res.end(url === '/map.html' ? MAPHOST : PHONEHOST); }
  fs.readFile(path.join(root, decodeURIComponent(url)), (e, b) => { if (e) { res.writeHead(404); return res.end(); } res.writeHead(200, { 'content-type': types[path.extname(url)] || 'application/octet-stream' }); res.end(b); });
});
let fails = 0; const ok = (c, m) => { console.log((c ? 'ok   - ' : 'FAIL - ') + m); if (!c) fails++; };
(async () => {
  await new Promise(r => srv.listen(0, r)); const port = srv.address().port;
  const b = await chromium.launch({ executablePath: process.env.CHROME || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
  const errs = [];
  /* ---- part 1: map pill + card ---- */
  let pg = await b.newPage({ viewport: { width: 390, height: 800 } }); pg.on('pageerror', e => errs.push(e.message)); pg.on('console', m => { if (m.type() === 'error' && !/favicon|404/.test(m.text() + (m.location().url || ''))) errs.push(m.text()); });
  await pg.goto(`http://localhost:${port}/map.html`); await pg.waitForSelector('#futaOnline:not([hidden])', { timeout: 8000 });
  ok(/live/i.test(await pg.locator('#futaOnline').innerText()) && /24\s*online/i.test(await pg.locator('#futaOnline').innerText()), 'map pill shows "LIVE 24 online"');
  ok((await pg.evaluate(() => window.calls)).includes('online_now'), 'the pill asked the server for counts (online_now)');
  await pg.screenshot({ path: out + '/community-pill.png' });
  await pg.click('#futaOnline'); await pg.waitForSelector('.fo-card:not([hidden])'); await pg.waitForTimeout(800); const card = await pg.locator('.fo-card').innerText();   // wait for the count-up
  ok(/24\s*players online/i.test(card) && /7\s*inside buildings/i.test(card) && /17\s*out on campus/i.test(card), 'card shows 24 online, 7 inside, 17 out on campus');
  ok(/Albert Ilemobade Library/.test(card) && /4 here/.test(card) && /Student Union Building/.test(card) && !/\(Main\)/.test(card), 'busiest places listed with clean names');
  const wa = pg.locator('.fo-card a.fo-wa'); ok((await wa.getAttribute('href')) === CH && (await wa.getAttribute('target')) === '_blank' && /noopener/.test(await wa.getAttribute('rel')), 'WhatsApp button links to the FUTAlife channel (new tab, noopener)');
  ok(await pg.locator('.fo-wa2').count() === 0, 'no "Message us" button until a chat number is configured');
  await pg.waitForTimeout(800); await pg.screenshot({ path: out + '/community-card.png' });
  await pg.mouse.click(60, 400); await pg.waitForTimeout(150); ok(await pg.locator('.fo-card').isHidden(), 'tapping outside closes the card');
  await pg.click('#futaOnline'); await pg.keyboard.press('Escape'); ok(await pg.locator('.fo-card').isHidden(), 'Escape closes the card');
  await pg.evaluate(() => { document.getElementById('cmp').style.display = 'flex'; }); await pg.waitForTimeout(700);
  ok(await pg.locator('#futaOnline').evaluate(e => e.classList.contains('fo-hide')), 'pill steps aside while the building zoom bar is showing');
  /* a chat number adds the "Message us" button */
  await pg.evaluate(() => { FutaCommunity.config.whatsappChat = '2348012345678'; document.getElementById('cmp').style.display = 'none'; }); await pg.waitForTimeout(700); await pg.click('#futaOnline');
  ok((await pg.locator('.fo-wa2').getAttribute('href')).startsWith('https://wa.me/2348012345678?text='), 'with a chat number set, "Message us directly" opens wa.me');
  /* a bad channel link is never opened */
  ok(await pg.evaluate(() => { FutaCommunity.config.whatsappChannel = 'javascript:alert(1)'; return FutaCommunity.channelUrl() === ''; }), 'a non-WhatsApp link is refused');
  await pg.close();
  /* failure: nothing shown, nothing made up */
  pg = await b.newPage({ viewport: { width: 390, height: 800 } }); await pg.addInitScript(() => { window.__early = true; });
  await pg.route('**/map.html', r => r.fulfill({ contentType: 'text/html', body: MAPHOST.replace("window.__mode='ok'", "window.__mode='fail'") }));
  await pg.goto(`http://localhost:${port}/map.html`); await pg.waitForTimeout(2500); ok(await pg.locator('#futaOnline').isHidden(), 'if the server cannot be reached the pill stays hidden (no fake numbers)'); await pg.close();
  /* ---- part 2: real phone, demo mode ---- */
  pg = await b.newPage({ viewport: { width: 390, height: 820 } }); pg.on('pageerror', e => errs.push(e.message));
  await pg.addInitScript(() => { localStorage.setItem('futa.demo.db', JSON.stringify({ me: 'u1', users: [{ id: 'u1', email: 'a@b.c', username: 'lagos_ada', onboarded: true }] })); localStorage.setItem('futa.phone.open', 'true'); });
  await pg.goto(`http://localhost:${port}/phone.html`); await pg.waitForSelector('.fo-wacard', { timeout: 15000 }); await pg.waitForTimeout(1500);
  const home = await pg.locator('.fo-home').innerText(), foot = await pg.locator('.fo-foot').innerText();
  ok(/1\s*player online/i.test(foot), 'phone home strip: demo mode shows "1 player online" (just you)');
  const pw = pg.locator('.fo-wacard'); ok((await pw.getAttribute('href')) === CH && /noopener/.test(await pw.getAttribute('rel')), 'phone home WhatsApp card links to the channel');
  ok(/FUTAlife/.test(home) && /WhatsApp channel/.test(home) && /Follow/.test(home), 'phone home card text');
  await pg.screenshot({ path: out + '/community-phone-home.png' });
  const lay = await pg.evaluate(() => { const r = document.getElementById('futaPhoneHost').shadowRoot, st = r.querySelector('.fo-strip'), ic = [...r.querySelectorAll('.ph-grid .ph-ico')], card = r.querySelector('.fo-wacard'), clock = r.querySelector('.ph-clock'), prof = r.querySelector('.ph-card');
    return { stripBottom: st.getBoundingClientRect().bottom, stripTop: st.getBoundingClientRect().top, clockBottom: clock.getBoundingClientRect().bottom, profTop: prof.getBoundingClientRect().top, firstIcon: Math.min(...ic.map(i => i.getBoundingClientRect().top)), lastIcon: Math.max(...ic.map(i => i.getBoundingClientRect().bottom)), waTop: card.getBoundingClientRect().top }; });
  ok(lay.stripTop >= lay.clockBottom - 1 && lay.stripBottom <= lay.profTop + 1, 'online strip sits just BELOW the clock, above the profile card and apps (strip top ' + Math.round(lay.stripTop) + ' >= clock bottom ' + Math.round(lay.clockBottom) + ')');
  ok(lay.waTop >= lay.lastIcon - 1, 'WhatsApp card sits BELOW all the apps (card top ' + Math.round(lay.waTop) + ' >= last icon bottom ' + Math.round(lay.lastIcon) + ')');
  await pg.evaluate(() => { const h = document.getElementById('futaPhoneHost').shadowRoot.querySelector('.ph-home'); h.scrollTop = h.scrollHeight; }); await pg.waitForTimeout(400);
  await pg.screenshot({ path: out + '/community-phone-home-bottom.png' });
  await pg.evaluate(() => { document.getElementById('futaPhoneHost').shadowRoot.querySelector('.ph-home').scrollTop = 0; });
  await pg.click('.ph-ico:has-text("Settings")'); await pg.waitForSelector('.ph-row:has-text("Follow FUTAlife on WhatsApp")', { timeout: 8000 }); await pg.waitForTimeout(500);
  ok((await pg.locator('.ph-row:has-text("Follow FUTAlife on WhatsApp")').getAttribute('href')) === CH, 'Settings → Community row links to the channel');
  await pg.locator('.ph-row:has-text("Follow FUTAlife on WhatsApp")').scrollIntoViewIfNeeded(); await pg.screenshot({ path: out + '/community-phone-settings.png' });
  /* sign-up page has the help link too */
  ok(/href="https:\/\/whatsapp\.com\/channel\/0029Vb8ycAzEgGfKUalSm62w"[^>]*rel="noopener noreferrer"/.test(fs.readFileSync(path.join(root, 'world/game/onboarding/signup.html'), 'utf8')), 'sign-up page has the "Need help?" WhatsApp link');
  ok(errs.length === 0, 'no console errors' + (errs.length ? ': ' + errs.slice(0, 3).join(' | ') : ''));
  await b.close(); srv.close(); console.log(fails ? fails + ' FAILED' : 'ALL COMMUNITY CHECKS PASSED'); process.exit(fails ? 1 : 0);
})().catch(e => { console.log('FAIL', e.message); process.exit(1); });
