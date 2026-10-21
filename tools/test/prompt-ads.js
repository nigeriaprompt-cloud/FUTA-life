// Headless check of the The Prompt advert card on the phone home screen + the The Prompt app (deep link, Back).
// usage: node tools/test/prompt-ads.js [outdir]     (needs port 8000 free: the site's embed.js only talks to localhost:8000 / the game's address)
// The website is FAKED with route interception: /feed/phone_ads.php returns a sample campaign, pages are tiny stand-ins that load the REAL embed.js
// from the website project (SITE_DIR, default ../../../site relative to /home/claude).
const { chromium } = require(process.env.PW_CORE || 'playwright');
const http = require('http'), fs = require('fs'), path = require('path');
const root = path.resolve(__dirname, '../../public'), out = process.argv[2] || '.';
const SITE_DIR = process.env.SITE_DIR || '/home/claude/site';
const types = { '.js': 'text/javascript', '.html': 'text/html', '.json': 'application/json', '.css': 'text/css' };
const HOST = '<!doctype html><meta charset=utf-8><meta name=viewport content="width=device-width,initial-scale=1"><body style="margin:0;background:linear-gradient(#a9cdb6,#7fae93)"><p style="padding:8px">game map</p><script src="/world/game/community/community.js" defer></script><script src="/world/game/phone/phone.js" defer></script>';
const srv = http.createServer((req, res) => {
  const url = req.url.split('?')[0]; if (url === '/host.html') { res.writeHead(200, { 'content-type': 'text/html' }); return res.end(HOST); }
  fs.readFile(path.join(root, decodeURIComponent(url)), (e, b) => { if (e) { res.writeHead(404); return res.end(); } res.writeHead(200, { 'content-type': types[path.extname(url)] || 'application/octet-stream' }); res.end(b); });
});
const S = 'https://theprompt.org.ng';
const photo = (a, b, glyph) => `<svg xmlns="http://www.w3.org/2000/svg" width="300" height="220"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${a}"/><stop offset="1" stop-color="${b}"/></linearGradient></defs><rect width="300" height="220" fill="url(#g)"/><text x="150" y="140" font-size="110" text-anchor="middle">${glyph}</text></svg>`;
const FEED = (extra) => Object.assign({
  active: true, campaign: { title: 'Freshers Must-Have', subtitle: 'Everything you need for campus life', more: 0 },
  see_all: S + '/feed/campaign.php',
  items: [
    { id: 1, name: 'Jollof Rice + Chicken Combo', price_txt: '₦2,500', image: S + '/uploads/jollof.svg', store: 'Mama Put FUTA', kind: 'food', url: S + '/store/mamaput' },
    { id: 2, name: 'Oversized Hoodie', price_txt: '₦4,500', image: S + '/uploads/hoodie.svg', store: 'Thrift by Tobi', kind: 'product', url: S + '/product.php?id=2&store=tobi' },
    { id: 3, name: 'Shawarma + Zobo', price_txt: '₦3,200', image: S + '/uploads/shawarma.svg', store: 'Zee Bites', kind: 'food', url: S + '/store/zeebites' },
    { id: 4, name: 'Phone Power Bank 10k', price_txt: '₦4,900', image: '', store: 'GadgetHub', kind: 'product', url: S + '/product.php?id=4&store=gadgethub' }
  ]
}, extra || {});
let fails = 0; const ok = (c, m) => { console.log((c ? 'ok   - ' : 'FAIL - ') + m); if (!c) fails++; };
(async () => {
  await new Promise((r, j) => srv.listen(8000, r).on('error', j)); const port = 8000;
  const b = await chromium.launch({ executablePath: process.env.CHROME || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
  async function newPhone(feedMode) {
    const ctx = await b.newContext({ viewport: { width: 390, height: 800 }, deviceScaleFactor: 2 }); const pg = await ctx.newPage();
    const errs = []; pg.on('pageerror', e => errs.push(e.message));
    await pg.addInitScript(() => { localStorage.setItem('futa.demo.db', JSON.stringify({ me: 'u1', users: [{ id: 'u1', email: 'a@b.c', username: 'lagos_ada', onboarded: true }] })); localStorage.setItem('futa.phone.open', 'true'); });
    await pg.route(S + '/**', async (route) => {
      const u = new URL(route.request().url()), p = u.pathname;
      const cors = { 'access-control-allow-origin': '*' };
      if (p === '/feed/phone_ads.php') {
        if (feedMode === 'down') return route.abort();
        return route.fulfill({ status: 200, contentType: 'application/json', headers: cors, body: JSON.stringify(feedMode === 'off' ? { active: false } : FEED()) });
      }
      if (p === '/uploads/jollof.svg') return route.fulfill({ contentType: 'image/svg+xml', body: photo('#e8892b', '#b3361c', '🍛') });
      if (p === '/uploads/hoodie.svg') return route.fulfill({ contentType: 'image/svg+xml', body: photo('#5b6ee1', '#2a2f7a', '🧥') });
      if (p === '/uploads/shawarma.svg') return route.fulfill({ contentType: 'image/svg+xml', body: photo('#d9a441', '#8a5a14', '🌯') });
      if (p === '/assets/js/embed.js') return route.fulfill({ contentType: 'text/javascript', body: fs.readFileSync(path.join(SITE_DIR, 'assets/js/embed.js')) });
      const page = (t, links) => `<!doctype html><meta charset=utf-8><meta name=viewport content="width=device-width,initial-scale=1"><title>${t}</title><body style="font:16px system-ui;margin:0"><div style="background:#128C7E;color:#fff;padding:14px;font-weight:700">${t}</div><div style="padding:16px">${links}</div><script src="/assets/js/embed.js"></script>`;
      if (p.startsWith('/store/')) return route.fulfill({ contentType: 'text/html', body: page('Restaurant store: ' + p.split('/')[2], '<p>Menu + cart</p><a id="go" href="/product.php?id=9&store=x">Open a product</a>') });
      if (p === '/product.php') return route.fulfill({ contentType: 'text/html', body: page('Product page', '<p>Order on WhatsApp</p>') });
      if (p === '/feed/campaign.php') return route.fulfill({ contentType: 'text/html', body: page('All campaign products', '<a id="go" href="/store/mamaput">Mama Put</a>') });
      return route.fulfill({ contentType: 'text/html', body: page('The Prompt home', '<a id="go" href="/store/mamaput">Mama Put (restaurant)</a>') });
    });
    await pg.goto(`http://localhost:${port}/host.html`); await pg.waitForSelector('.ph-ico'); await pg.waitForTimeout(900);
    return { pg, ctx, errs };
  }
  const sr = (pg, sel) => pg.evaluate((s) => { const r = document.querySelector('#futaPhoneHost').shadowRoot; return r.querySelector(s) ? r.querySelector(s).innerText : null; }, sel);

  /* ---- 1. card shows, in the right place ---- */
  let { pg, ctx, errs } = await newPhone('ok');
  await pg.waitForSelector('.pa-home:not([hidden])', { timeout: 8000 });
  const order = await pg.evaluate(() => { const h = document.querySelector('#futaPhoneHost').shadowRoot.querySelector('.ph-home'); return [...h.children].map(n => n.className.split(' ')[0]); });
  ok(order.indexOf('ph-grid') < order.indexOf('pa-home') && order.indexOf('pa-home') < order.indexOf('fo-home'), 'order on the home screen: apps -> advert card -> WhatsApp card (' + order.join(' > ') + ')');
  ok((await pg.locator('.pa-item').count()) === 4, '4 items drawn');
  const txt = await sr(pg, '.pa-home');
  ok(/Freshers Must-Have/.test(txt) && /Jollof Rice \+ Chicken Combo/.test(txt) && /₦2,500/.test(txt) && /Mama Put FUTA/.test(txt), 'campaign title, item name, price and seller shown');
  ok(await pg.locator('.pa-tag').count() === 2, 'two items carry the Food tag');
  ok(await pg.locator('.pa-item:nth-child(4) .pa-ph img').count() === 0, 'an item with no photo falls back to the emoji tile');
  await pg.waitForTimeout(500); await pg.screenshot({ path: out + '/ads-home.png' });
  /* scroll the home screen so the card + WhatsApp card are both in view */
  await pg.evaluate(() => { const h = document.querySelector('#futaPhoneHost').shadowRoot.querySelector('.ph-home'); h.scrollTop = h.scrollHeight; }); await pg.waitForTimeout(300); await pg.screenshot({ path: out + '/ads-home-scrolled.png' });

  /* ---- 2. tap a food item -> opens inside The Prompt app on the restaurant store ---- */
  await pg.locator('.pa-item').first().click(); await pg.waitForSelector('iframe'); await pg.waitForTimeout(900);
  const fsrc = async () => { const f = pg.frames().find(x => x.parentFrame() && x.url().startsWith(S)); return f ? f.url() : ''; };   // the page the frame is REALLY on (iframe.src only remembers where it started)
  ok((await fsrc()) === S + '/store/mamaput', 'tapping the food combo opens the restaurant store inside the phone');
  ok(/The Prompt/.test(await sr(pg, '.ph-bar h2')), 'The Prompt app is open');
  await pg.waitForTimeout(500); await pg.screenshot({ path: out + '/ads-opened.png' });

  /* ---- 3. Back goes through site pages, then leaves the app ---- */
  const fr = () => pg.frames().find(f => f.url().startsWith(S));
  await fr().click('#go'); await pg.waitForTimeout(900);
  ok((await fsrc()).includes('/product.php?id=9'), 'followed a link inside the site');
  await pg.evaluate(() => document.querySelector('#futaPhoneHost').shadowRoot.querySelector('.ph-back').click()); await pg.waitForTimeout(450);   // shorter than the 900 ms fallback timer, so this proves the site's embed.js answered
  ok((await fsrc()) === S + '/store/mamaput', 'Back = previous website page (store), not the home screen');
  ok(await pg.evaluate(() => !!document.querySelector('#futaPhoneHost').shadowRoot.querySelector('.ph-app.on')), 'the app is still open after that Back');
  await pg.evaluate(() => document.querySelector('#futaPhoneHost').shadowRoot.querySelector('.ph-back').click()); await pg.waitForTimeout(500);
  ok(await pg.evaluate(() => !document.querySelector('#futaPhoneHost').shadowRoot.querySelector('.ph-app.on')), 'Back on the first page leaves the app (home screen)');

  /* ---- 4. See all + plain tap on the app icon still work ---- */
  await pg.locator('.pa-all').click(); await pg.waitForSelector('iframe'); await pg.waitForTimeout(600);
  ok((await fsrc()) === S + '/feed/campaign.php', '"See all" opens the full campaign page');
  await pg.evaluate(() => document.querySelector('#futaPhoneHost').shadowRoot.querySelector('.ph-back').click()); await pg.waitForTimeout(300);
  await pg.locator('.ph-ico:has-text("The Prompt")').click(); await pg.waitForSelector('iframe'); await pg.waitForTimeout(500);
  ok((await fsrc()) === S + '/', 'the The Prompt app icon still opens the site home');
  ok(errs.length === 0, 'no page errors' + (errs.length ? ': ' + errs.join(' | ') : '')); await ctx.close();

  /* ---- 5. no campaign on / site down => no card at all ---- */
  for (const mode of ['off', 'down']) {
    const t = await newPhone(mode); await t.pg.waitForTimeout(1200);
    const shown = await t.pg.evaluate(() => { const n = document.querySelector('#futaPhoneHost').shadowRoot.querySelector('.pa-home'); return !!n && !n.hidden; });
    ok(!shown, mode === 'off' ? 'no active campaign => card hidden' : 'site unreachable => card hidden (no fake items)');
    ok(await t.pg.locator('.fo-wacard').count() === 1, '...and the WhatsApp card is still there'); await t.ctx.close();
  }
  await b.close(); srv.close(); console.log(fails ? fails + ' FAILED' : 'all passed'); process.exit(fails ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
