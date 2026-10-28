/* Browser test for the red unread numbers on Feed, NEPA and Tutorial (public/world/game/phone/apps/unread-badges.js) with a tiny fake Supabase.
   usage: node tools/test/feed-nepa-tutorial-unread.js */
const fs = require('fs'), path = require('path'); const { chromium } = require(process.env.PW_CORE || 'playwright');
const SRC = fs.readFileSync(path.join(__dirname, '../../public/world/game/phone/apps/unread-badges.js'), 'utf8');
const PAGE = `
window.badges = { feed: [], nepa: [], tutorial: [] }; window.__ph = {}; window.__h = {}; window.__open = false;
const __ls = {}; Object.defineProperty(window, 'localStorage', { value: { getItem: k => (k in __ls ? __ls[k] : null), setItem: (k, v) => { __ls[k] = String(v); } } });
window.__ls = __ls;
const T = { feed_posts: [{ id: 1, user_id: 'a' }, { id: 2, user_id: 'b' }], bulletins: [{ id: 1, kind: 'nepa', user_id: 'a' }, { id: 2, kind: 'tutorial', user_id: 'a' }, { id: 3, kind: 'nepa', user_id: 'b' }] };
const q = (rows) => { let r = rows.slice(), head = false; const b = { select(c, o) { head = !!(o && o.head); return b; }, eq(c, v) { r = r.filter(x => x[c] === v); return b; }, gt(c, v) { r = r.filter(x => x[c] > v); return b; }, neq(c, v) { r = r.filter(x => x[c] !== v); return b; },
  order(c, o) { r.sort((x, y) => (o && o.ascending === false) ? y[c] - x[c] : x[c] - y[c]); return b; }, limit(n) { r = r.slice(0, n); return b; }, then(f, e) { return Promise.resolve({ data: head ? null : r, count: r.length, error: null }).then(f, e); } }; return b; };
window.__T = T;
window.FutaApi = { sb() { return { from: t => q(T[t] || []), channel() { const c = { on(t, o, f) { const k = o.table + ':' + o.event, pv = window.__h[k]; window.__h[k] = pv ? (m) => { pv(m); f(m); } : f; return c; }, subscribe() { return c; }, unsubscribe() { } }; return c; } }; } };
window.FutaPhone = { on(ev, f) { (window.__ph[ev] = window.__ph[ev] || []).push(f); }, getUser() { return null; }, api() { return window.FutaApi; }, demo() { return false; }, isOpen() { return window.__open; },
  badge(id, n) { if (window.badges[id]) window.badges[id].push(n); } };
`;
const ok = (c, m) => { if (!c) { console.error('FAIL:', m); process.exit(1); } console.log('ok  -', m); };
(async () => {
  const b = await chromium.launch(), p = await b.newPage(); const errs = []; p.on('pageerror', e => errs.push(e.message));
  await p.setContent('<body></body>'); await p.addScriptTag({ content: PAGE }); await p.addScriptTag({ content: SRC });
  const wait = (ms) => p.waitForTimeout(ms || 100), last = (id) => p.evaluate((i) => window.badges[i][window.badges[i].length - 1], id);
  const ins = (table, row) => p.evaluate(([t, r]) => window.__h[t + ':INSERT']({ new: r }), [table, row]);
  const emit = (ev, a) => p.evaluate(([e, x]) => (window.__ph[e] || []).forEach(f => f(x)), [ev, a]);
  await emit('user', null); await emit('user', { id: 'me', username: 'me' }); await p.evaluate(() => { window.FutaPhone.getUser = () => ({ id: 'me' }); }); await emit('user', { id: 'me', username: 'me' }); await wait(500);
  ok(await last('feed') === 0 && await last('nepa') === 0 && await last('tutorial') === 0, 'first run starts from "now": posts already there do not count (0, 0, 0)');
  await ins('feed_posts', { id: 10, user_id: 'a' }); await wait(); ok(await last('feed') === 1, 'a new Feed post while the app is closed adds 1');
  await ins('feed_posts', { id: 11, user_id: 'me' }); await wait(); ok(await last('feed') === 1, 'my own Feed post is not counted');
  await ins('bulletins', { id: 20, kind: 'nepa', user_id: 'a' }); await ins('bulletins', { id: 21, kind: 'nepa', user_id: 'b' }); await wait();
  ok(await last('nepa') === 2 && await last('tutorial') === 0, 'two NEPA reports add 2 to NEPA only');
  await ins('bulletins', { id: 22, kind: 'tutorial', user_id: 'a' }); await ins('bulletins', { id: 23, kind: 'tutorial', user_id: 'a', hidden: true }); await wait();
  ok(await last('tutorial') === 1 && await last('nepa') === 2, 'a Tutorial guide adds 1 to Tutorial only; a hidden one is ignored');
  await p.evaluate(() => { window.__T.feed_posts.push({ id: 30, user_id: 'a' }, { id: 31, user_id: 'b' }, { id: 32, user_id: 'me' }); window.__T.bulletins.push({ id: 40, kind: 'nepa', user_id: 'a' }); window.dispatchEvent(new Event('online')); }); await wait(700);
  ok(await last('feed') === 2 && await last('nepa') === 1, 'back online: the phone recounts from the server (feed 2 from others, nepa 1; got ' + await last('feed') + ' / ' + await last('nepa') + ')');
  await p.evaluate(() => { window.__open = true; }); await emit('open', 'feed'); await wait(300);
  ok(await last('feed') === 0, 'opening Feed clears its number');
  await ins('feed_posts', { id: 50, user_id: 'a' }); await wait(); ok(await last('feed') === 0, 'a post arriving while you are looking at Feed is not counted');
  await emit('open', null); await wait(300); await p.evaluate(() => { window.__open = true; });
  await ins('feed_posts', { id: 51, user_id: 'a' }); await wait(); ok(await last('feed') === 1, 'back on the home screen: the next new post counts again');
  await p.evaluate(() => { window.__open = true; }); await emit('open', 'nepa'); await wait(300); ok(await last('nepa') === 0, 'opening NEPA clears NEPA only');
  await emit('open', 'tutorial'); await wait(300); ok(await last('tutorial') === 0 && await last('feed') === 1, 'opening Tutorial clears Tutorial; Feed keeps its number');
  await emit('open', null); await p.evaluate(() => { window.__open = false; }); await ins('bulletins', { id: 60, kind: 'tutorial', user_id: 'a' }); await wait();
  ok(await last('tutorial') === 1, 'phone hidden: new posts still count');
  const saved = await p.evaluate(() => Object.keys(window.__ls).filter(k => k.indexOf('futa.') === 0).sort().join(','));
  ok(saved === 'futa.feed.seen.me,futa.nepa.seen.me,futa.tutorial.seen.me', 'the last-seen post is remembered per app and per player (' + saved + ')');
  await emit('user', null); await wait(); ok(await last('feed') === 0 && await last('nepa') === 0 && await last('tutorial') === 0, 'signing out clears the numbers');
  ok(errs.length === 0, 'no page errors' + (errs.length ? ': ' + errs.join(' | ') : '')); await b.close(); console.log('FEED / NEPA / TUTORIAL UNREAD TESTS PASSED');
})().catch(e => { console.error(e.message); process.exit(1); });
