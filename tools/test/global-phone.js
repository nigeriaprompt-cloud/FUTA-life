/* Browser test for the Global phone app (phone/apps/global.js) with a fake Supabase. SQL rules live in supabase/tests/test_global.sql.
   Checks: messages load + @tag highlight, @ suggestions, tagging by tapping a name, reply bar + quote, send calls send_global_message, live messages,
   tag badge (99+ cap, alert banner, cleared on open), guest screen, user text is never HTML.   usage: node tools/test/global-phone.js */
const fs = require('fs'), path = require('path');
let chromium; try { ({ chromium } = require('playwright')); } catch (e) { ({ chromium } = require(path.join(process.env.PLAYWRIGHT_NODE_PATH || '/opt/node22/lib/node_modules', 'playwright'))); }
const SRC = fs.readFileSync(path.join(__dirname, '../../public/world/game/phone/apps/global.js'), 'utf8');
const PAGE_JS = `
window.calls = []; window.badges = []; window.alerts = []; window.toasts = []; window.__h = {}; window.apps = {}; window.gate = []; window.USER = { id: 'me', username: 'me_user' }; window.UNSEEN = 120;
const T = { global_messages: [
  { id: 1, user_id: 'x1', username: 'tola', body: 'hello <b>everyone</b>', reply_name: null, created_at: new Date().toISOString() },
  { id: 2, user_id: 'x2', username: 'chidi', body: 'hey @me_user and @tola', reply_to: 1, reply_name: 'tola', reply_body: 'hello', created_at: new Date().toISOString() } ] };
const q = (rows) => { let r = rows.slice(); const b = { select() { return b; }, order() { r.sort((a, c) => c.id - a.id); return b; }, limit(n) { r = r.slice(0, n); return b; }, then(f, e) { return Promise.resolve({ data: r, error: null }).then(f, e); } }; return b; };
const RPC = { get_global_unread: () => window.UNSEEN, mark_global_read: () => null, search_players: (a) => [{ user_id: 'x9', username: 'chika_ng' }, { user_id: 'x1', username: 'tola' }].filter(p => p.username.indexOf(a.p_query) === 0),
  send_global_message: (a) => { if (a.p_body === 'bad') throw new Error('message_not_allowed'); return 500; } };
window.FutaApi = { sb() { return { from: (t) => q(T[t] || []), channel() { const c = { on(t, o, f) { window.__h[o.table + ':' + o.event] = f; return c; }, subscribe() { return c; }, unsubscribe() { } }; return c; } }; },
  rpc(n, a) { window.calls.push([n, a]); return Promise.resolve(RPC[n] ? RPC[n](a || {}) : null); } };
window.__ph = {};
window.FutaPhone = { on(ev, f) { (window.__ph[ev] = window.__ph[ev] || []).push(f); }, registerApp(d) { window.apps[d.id] = d; }, getUser() { return window.USER; }, api() { return window.FutaApi; }, demo() { return false; },
  badge(id, n) { window.badges.push([id, n]); }, alert(a) { window.alerts.push(a); }, toast(t) { window.toasts.push(t); }, requireLogin(w) { window.gate.push(w); return true; }, SIGNUP_URL: '/signup' };
window.openApp = () => { document.body.innerHTML = '<div id="body"></div>'; window.inst = window.apps.global.mount(document.getElementById('body'), { icons: { send: '>' }, setTitle() { } }); };
`;
const ok = (c, m) => { if (!c) { console.error('FAIL:', m); process.exitCode = 1; throw new Error(m); } console.log('ok  -', m); };
(async () => {
  const b = await chromium.launch(), p = await b.newPage(); const errs = []; p.on('pageerror', e => errs.push(e.message)); p.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });
  await p.setContent('<body></body>'); await p.addScriptTag({ content: PAGE_JS }); await p.addScriptTag({ content: SRC });
  const wait = (ms) => p.waitForTimeout(ms || 80), lastBadge = () => p.evaluate(() => (window.badges[window.badges.length - 1] || [])[1]);
  const type = async (t) => { await p.fill('input', t); await p.evaluate(() => document.querySelector('input').dispatchEvent(new Event('input', { bubbles: true }))); await wait(450); };
  const chips = () => p.evaluate(() => [...document.querySelectorAll('.ph-quick button')].map(x => x.textContent));
  // background listener: tags while the app is closed
  await p.evaluate(() => window.__ph.user.forEach(f => f(window.USER))); await wait(100);
  ok(await lastBadge() === 120, 'badge starts at the server count of unseen tags (120; the phone shows 99+)');
  await p.evaluate(() => window.__h['notifications:INSERT']({ new: { id: 9, app: 'global', title: '@chidi tagged you in Global', body: 'hey @me_user' } })); await wait(50);
  ok(await lastBadge() === 121 && await p.evaluate(() => window.alerts.length === 1 && window.alerts[0].app === 'global'), 'a tag raises the badge and pops an alert that opens Global');
  await p.evaluate(() => window.__h['notifications:INSERT']({ new: { id: 10, kind: 'money', title: 'money' } })); await wait(50);
  ok(await lastBadge() === 121, 'money alerts are not counted here');
  await p.evaluate(() => window.openApp()); await wait(300);
  ok(await lastBadge() === 0 && await p.evaluate(() => window.calls.some(c => c[0] === 'mark_global_read')), 'opening Global clears the badge and tells the server');
  const msgs = await p.evaluate(() => [...document.querySelectorAll('.ph-msg')].map(m => m.textContent));
  ok(msgs.length === 2 && msgs[0].indexOf('hello <b>everyone</b>') >= 0, 'messages load oldest first and HTML is shown as text');
  ok(await p.evaluate(() => !document.querySelector('.ph-msg b') || document.querySelector('.ph-msg b').parentElement.className !== 'ph-msg' || true) && await p.evaluate(() => document.querySelectorAll('.ph-msg')[0].innerHTML.indexOf('&lt;b&gt;') >= 0), 'no HTML injection');
  ok(await p.evaluate(() => document.querySelectorAll('.ph-msg')[1].textContent.indexOf('↩ tola') >= 0), 'a reply shows the quote of the original');
  ok(await p.evaluate(() => { const sp = [...document.querySelectorAll('.ph-msg')[1].querySelectorAll('span')].filter(s => s.textContent === '@me_user')[0]; return !!sp && /f3d57a|243, 213, 122/.test(sp.getAttribute('style') + getComputedStyle(sp).backgroundColor); }), 'a tag of me is highlighted gold');
  // suggestions
  await type('hi @to'); ok((await chips()).join() === '@tola', 'typing @to suggests people already in the room (' + (await chips()).join() + ')');
  await type('hi @ch'); ok((await chips()).join() === '@chidi,@chika_ng', 'server search adds more (' + (await chips()).join() + ')');
  await p.click('.ph-quick button >> text=@chika_ng'); ok(await p.inputValue('input') === 'hi @chika_ng ', 'tapping a suggestion completes the tag');
  ok((await chips()).length === 0, 'suggestions close after picking');
  // tag by tapping a name
  await p.fill('input', ''); await p.click('.ph-msg small.ph-who >> text=tola'); ok(await p.inputValue('input') === '@tola ', 'tapping a name tags that player');
  // reply
  await p.fill('input', ''); await p.click('.ph-msg >> nth=0 >> button'); ok(await p.evaluate(() => !document.querySelector('.ph-gr').hidden && document.querySelector('.ph-gr').textContent.indexOf('Replying to tola') >= 0), 'reply bar shows who you answer');
  await p.fill('input', 'welcome!'); await p.press('input', 'Enter'); await wait(200);
  ok(await p.evaluate(() => window.calls.some(c => c[0] === 'send_global_message' && c[1].p_body === 'welcome!' && c[1].p_reply_to === 1)), 'send_global_message gets the text and the reply id');
  ok(await p.evaluate(() => document.querySelector('.ph-gr').hidden && document.querySelector('input').value === ''), 'reply bar and box clear after sending');
  ok(await p.evaluate(() => { const m = [...document.querySelectorAll('.ph-msg')].pop(); return m.classList.contains('me') && m.textContent.indexOf('↩ tola') >= 0; }), 'my message appears with its quote');
  // live + dedupe
  await p.evaluate(() => window.__h['global_messages:INSERT']({ new: { id: 500, user_id: 'me', username: 'me_user', body: 'welcome!' } })); await wait(50);
  await p.evaluate(() => window.__h['global_messages:INSERT']({ new: { id: 600, user_id: 'x3', username: 'amaka', body: 'live one' } })); await wait(50);
  ok(await p.evaluate(() => document.querySelectorAll('.ph-msg').length === 4), 'live message appears; the echo of my own is not shown twice');
  // rejected message is put back in the box
  await wait(450); await p.fill('input', 'bad'); await p.press('input', 'Enter'); await wait(200);
  ok(await p.inputValue('input') === 'bad' && await p.evaluate(() => window.toasts.some(t => /can’t be sent/.test(t))), 'a refused message returns to the box with a friendly toast');
  // a tag arriving while open does not raise the badge
  await p.evaluate(() => window.badges.length = 0); await p.evaluate(() => window.__h['notifications:INSERT']({ new: { id: 11, app: 'global', title: 't' } })); await wait(100);
  ok(await lastBadge() !== 1, 'a tag while Global is open does not leave a badge');
  // guest screen
  await p.evaluate(() => { window.inst.destroy(); window.USER = null; window.openApp(); }); await wait(200);
  ok(await p.evaluate(() => /Sign in to join/.test(document.body.textContent) && document.querySelector('form').style.display === 'none'), 'guests see a sign-in message and no message box');
  await p.click('button.ph-btn'); ok(await p.evaluate(() => window.gate.length === 1), 'its button opens the sign-in sheet');
  ok(errs.length === 0, 'no console errors' + (errs.length ? ': ' + errs.join(' | ') : ''));
  await b.close(); console.log('GLOBAL PHONE TESTS PASSED');
})().catch(e => { console.error(e.message); process.exit(1); });
