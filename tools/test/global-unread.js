/* Browser test for the Global app's unread number (public/world/game/phone/apps/global.js) with a tiny fake Supabase.
   usage: node tools/test/global-unread.js */
const fs = require('fs'), path = require('path'); const { chromium } = require(process.env.PW_CORE || 'playwright');
const SRC = fs.readFileSync(path.join(__dirname, '../../public/world/game/phone/apps/global.js'), 'utf8');
const PAGE = `
window.badges = []; window.apps = {}; window.__ph = {}; window.__h = {};
const __ls = {}; Object.defineProperty(window, 'localStorage', { value: { getItem: k => (k in __ls ? __ls[k] : null), setItem: (k, v) => { __ls[k] = String(v); } } });
const T = { global_messages: [{ id: 1, user_id: 'a', username: 'a', body: 'x' }, { id: 2, user_id: 'b', username: 'b', body: 'y' }] };
const q = (rows) => { let r = rows.slice(), head = false; const b = { select(c, o) { head = !!(o && o.head); return b; }, gt(c, v) { r = r.filter(x => x[c] > v); return b; }, neq(c, v) { r = r.filter(x => x[c] !== v); return b; },
  order(c, o) { r.sort((x, y) => (o && o.ascending === false) ? y[c] - x[c] : x[c] - y[c]); return b; }, limit(n) { r = r.slice(0, n); return b; }, then(f, e) { return Promise.resolve({ data: head ? null : r, count: r.length, error: null }).then(f, e); } }; return b; };
window.__T = T; window.GUNREAD = 2;
window.FutaApi = { sb() { return { from: t => q(T[t] || []), channel() { const c = { on(t, o, f) { const k = o.table + ':' + o.event, pv = window.__h[k]; window.__h[k] = pv ? (m) => { pv(m); f(m); } : f; return c; }, subscribe() { return c; }, unsubscribe() { } }; return c; } }; },
  rpc(n) { return Promise.resolve(n === 'get_global_unread' ? window.GUNREAD : null); } };
window.FutaPhone = { on(ev, f) { (window.__ph[ev] = window.__ph[ev] || []).push(f); }, registerApp(d) { window.apps[d.id] = d; }, getUser() { return { id: 'me', username: 'me' }; }, api() { return window.FutaApi; }, demo() { return false; },
  badge(id, n) { if (id === 'global') window.badges.push(n); }, alert() { }, isOpen() { return true; }, toast() { }, requireLogin() { } };
`;
const ok = (c, m) => { if (!c) { console.error('FAIL:', m); process.exit(1); } console.log('ok  -', m); };
(async () => {
  const b = await chromium.launch(), p = await b.newPage(); const errs = []; p.on('pageerror', e => errs.push(e.message));
  await p.setContent('<body></body>'); await p.addScriptTag({ content: PAGE }); await p.addScriptTag({ content: SRC });
  const wait = (ms) => p.waitForTimeout(ms || 100), last = () => p.evaluate(() => window.badges[window.badges.length - 1]);
  const msg = (id, who) => p.evaluate(([i, w]) => window.__h['global_messages:INSERT']({ new: { id: i, user_id: w, username: w, body: 'hi' } }), [id, who]);
  await p.evaluate(() => (window.__ph.user || []).forEach(f => f({ id: 'me', username: 'me' }))); await wait(600);
  ok(await last() === 2, 'badge starts with the 2 tags/replies the server reports; messages already in the room do not count (first run starts from now)');
  await msg(10, 'a'); await wait(); ok(await last() === 3, 'a new Global message while the app is closed adds 1 (3)');
  await msg(11, 'me'); await wait(); ok(await last() === 3, 'my own message is not counted');
  await p.evaluate(() => { window.__T.global_messages.push({ id: 20, user_id: 'a', body: '1' }, { id: 21, user_id: 'b', body: '2' }, { id: 22, user_id: 'me', body: 'm' }); window.dispatchEvent(new Event('online')); }); await wait(700);
  ok(await last() === 4, 'back online: the phone recounts what you missed (2 from others) → 2 tags + 2 = 4 (got ' + await last() + ')');
  await p.evaluate(() => { document.body.innerHTML = '<div id="body"></div>'; window.apps.global.mount(document.getElementById('body'), { setTitle() { }, icons: {}, opts: null, el: (t, a, x) => { const e = document.createElement(t); Object.assign(e, a || {}); if (x) e.textContent = x; return e; } }); }); await wait(700);
  ok(await last() === 0, 'opening Global clears the message count and marks the tags read (0)');
  await msg(30, 'b'); await wait(); ok(await last() === 0, 'a message in the Global you are looking at is not counted');
  ok(errs.length === 0, 'no page errors' + (errs.length ? ': ' + errs.join(' | ') : '')); await b.close(); console.log('GLOBAL UNREAD TESTS PASSED');
})().catch(e => { console.error(e.message); process.exit(1); });
