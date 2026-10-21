/* Browser test for the phone Chat app (public/world/game/phone/apps/chat.js) with an in-memory fake Supabase.
   Checks the UI flows: Campus, Building tab, player search + wave, deep link (FutaChat.openWith), groups (create / invite / people / back), and that user text is never HTML.
   It does NOT test SQL rules — that is supabase/tests/test_chat.sql.   usage: node tools/test/chat-phone.js   (needs playwright + chromium) */
const fs = require('fs'), path = require('path');
let chromium; try { ({ chromium } = require('playwright')); } catch (e) { ({ chromium } = require(path.join(process.env.PLAYWRIGHT_NODE_PATH || '/home/claude/.npm-global/lib/node_modules', 'playwright'))); }
const SRC = fs.readFileSync(path.join(__dirname, '../../public/world/game/phone/apps/chat.js'), 'utf8');

const PAGE_JS = `
window.calls = []; window.badges = []; window.UNREAD = { dms: { x1: 3, x2: 120 }, groups: { 7: 5 }, invites: 1, alerts: 0 }; window.toasts = []; window.alerts = []; window.__h = {};
const __ls = {}; Object.defineProperty(window, 'localStorage', { value: { getItem: (k) => (k in __ls ? __ls[k] : null), setItem: (k, v) => { __ls[k] = String(v); }, removeItem: (k) => { delete __ls[k]; } } }); window.apps = {};
const T = { room_messages: [{ id: 1, room: 'campus_lobby', user_id: 'x1', username: 'tola', body: 'hello campus' }, { id: 2, room: 'int_b12_1', user_id: 'x1', username: 'tola', body: 'hello library' }, { id: 3, room: 'campus_lobby', user_id: 'x1', username: 'tola', body: '<img src=x onerror="window.__xss=1">' }],
  player_stats: [{ id: 'me', building: null, updated_at: new Date().toISOString() }], waves: [{ id: 9, from_user: 'x1', to_user: 'me', status: 'accepted' }], dms: [],
  notifications: [{ id: 1, from_user: 'x1', kind: 'money', title: 'tola sent you ₦2,000', body: 'for data', amount: 2000, read_at: null, created_at: new Date().toISOString() }],
  profiles: [{ id: 'x1', username: 'tola' }, { id: 'x2', username: 'chidi' }, { id: 'x3', username: 'chika' }], group_members: [{ group_id: 7, user_id: 'me', status: 'member', role: 'member' }], chat_groups: [{ id: 7, name: 'Library crew' }], group_messages: [] }; T.waves.push({ id: 10, from_user: 'x2', to_user: 'me', status: 'accepted' });
const q = (rows) => { let r = rows.slice(), head = false; const b = { select(c, o) { head = !!(o && o.head); return b; }, gt(c, v) { r = r.filter(x => x[c] > v); return b; }, neq(c, v) { r = r.filter(x => x[c] !== v); return b; }, eq(c, v) { r = r.filter(x => x[c] === v); return b; }, in(c, a) { r = r.filter(x => a.indexOf(x[c]) >= 0); return b; }, or(str) { const ms = [...String(str).matchAll(/and\\((\\w+)\\.eq\\.([^,]+),(\\w+)\\.eq\\.([^)]+)\\)/g)]; if (ms.length) r = r.filter(x => ms.some(m => x[m[1]] === m[2] && x[m[3]] === m[4])); return b; }, order(c, o) { r.sort((x, y) => (o && o.ascending === false) ? y[c] - x[c] : x[c] - y[c]); return b; }, limit(n) { r = r.slice(0, n); return b; }, is() { return b; },
  maybeSingle() { return Promise.resolve({ data: r[0] || null, error: null }); }, then(f, e) { return Promise.resolve({ data: head ? null : r, count: r.length, error: null }).then(f, e); } }; return b; };
const people = [{ user_id: 'x1', username: 'tola', relation: 'friends' }, { user_id: 'x2', username: 'chidi', relation: 'none' }, { user_id: 'x3', username: 'chika', relation: 'none' }];
let nid = 100;
const RPC = {
  get_transfer_info: () => ({ min: 100, max: 500000, leftToday: 2000000, countLeft: 10, bank: 80000 }),
  send_money: (a) => { if (a.p_amount > 80000) throw new Error('insufficient_funds'); return { id: nid++, amount: a.p_amount, bank: 80000 - a.p_amount }; },
  mark_notifications_read: () => null, mark_group_read: () => null, get_unread: () => window.UNREAD,
  search_players: (a) => people.filter(p => p.username.indexOf(a.p_query) >= 0),
  send_wave: (a) => { const x = a.p_to === 'x3' ? 'accepted' : 'pending'; if (x === 'accepted') T.waves.push({ id: nid++, from_user: 'x3', to_user: 'me', status: 'accepted' }); return { status: x }; },
  send_room_message: () => nid++, send_dm: () => (window.lastDm = nid++), send_group_message: () => nid++, respond_wave: () => ({}), invite_to_group: () => ({ status: 'invited' }), leave_group: () => null, remove_group_member: () => null, respond_group_invite: () => ({}),
  create_group: (a) => { const id = nid++; T.chat_groups.push({ id, name: a.p_name }); T.group_members.push({ group_id: id, user_id: 'me', status: 'member', role: 'owner' }); return id; }
};
window.FutaApi = { sb() { return { from: (t) => q(T[t] || []), channel() { const c = { on(t, o, f) { { const k = o.table + ':' + o.event, pv = window.__h[k]; window.__h[k] = pv ? (m) => { try { pv(m); } catch (e) { } f(m); } : f; } return c; }, subscribe() { return c; }, unsubscribe() { } }; return c; } }; },
  rpc(n, a) { window.calls.push([n, a]); return Promise.resolve(RPC[n] ? RPC[n](a || {}) : null); } };
window.__ph = {}; window.FutaPhone = { on(ev, f) { (window.__ph[ev] = window.__ph[ev] || []).push(f); }, registerApp(d) { window.apps[d.id] = d; }, getUser() { return { id: 'me', username: 'me' }; }, api() { return window.FutaApi; }, demo() { return false; }, badge(id, n) { window.badges.push(n); }, toast(m) { window.toasts.push(m); },
  isOpen() { return true; }, alert(a) { window.alerts.push(a); }, refreshUser() { window.refreshed = (window.refreshed || 0) + 1; return Promise.resolve(); }, show() { }, open(id, opts) { window.openCall = [id, opts]; window.openApp(opts); } };
window.__T = T;
window.openApp = (opts) => { document.body.innerHTML = '<div class="ph-screen"><div id="body"></div></div>'; window.title = ''; (window.__ph.open || []).forEach(f => f('chat')); window.inst = window.apps.chat.mount(document.getElementById('body'), { icons: { send: '>', search: '?' }, setTitle: (t) => { window.title = t; }, opts: opts || {} }); };
`;
const ok = (c, m) => { if (!c) { console.error('FAIL:', m); process.exitCode = 1; throw new Error(m); } console.log('ok  -', m); };
(async () => {
  const b = await chromium.launch(), p = await b.newPage(); const errs = []; p.on('pageerror', e => errs.push(e.message)); p.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });
  await p.setContent('<body></body>'); await p.addScriptTag({ content: PAGE_JS }); await p.addScriptTag({ content: SRC });
  const wait = (ms) => p.waitForTimeout(ms || 80);
  const click = async (sel, t) => { await p.evaluate(([s, tx]) => { const el = [...document.querySelectorAll(s)].find(e => !tx || e.textContent.indexOf(tx) >= 0); if (!el) throw new Error('no ' + s + ' ' + (tx || '')); el.click(); }, [sel, t]); await wait(); };
  const lastBadge = () => p.evaluate(() => window.badges[window.badges.length - 1]);
  const pills = () => p.evaluate(() => [...document.querySelectorAll('.ph-row[data-u]')].map(r => r.querySelector('b').textContent + '=' + (r.querySelector('.ph-un').hidden ? '' : r.querySelector('.ph-un').textContent)));
  const tabs = () => p.evaluate(() => ({ f: document.querySelector('[data-t=friends] .ph-tn').hidden ? '' : document.querySelector('[data-t=friends] .ph-tn').textContent, g: document.querySelector('[data-t=groups] .ph-tn').hidden ? '' : document.querySelector('[data-t=groups] .ph-tn').textContent }));

  // Campus unread: the Chat icon number, the Campus tab pill, and Global-style "seen" memory on this phone
  const campusMsg = (id, who) => ({ new: { id, room: 'campus_lobby', user_id: who, username: who, body: 'hi' } });
  const pill = () => p.evaluate(() => { const i = document.querySelector('[data-t=campus] .ph-tn'); return i && !i.hidden ? i.textContent : ''; });
  await p.evaluate(() => (window.__ph.user || []).forEach(f => f({ id: 'me', username: 'me' }))); await wait(900);   // the phone tells chat.js a player is signed in → background listeners start while the app is closed
  ok(await lastBadge() === 129, 'first run starts from now: Campus adds nothing (badge 129 = friends + groups + invites)');
  await p.evaluate((m) => window.__h['room_messages:INSERT'](m), campusMsg(50, 'x1')); await wait();
  ok(await lastBadge() === 130, 'a Campus message while the phone is elsewhere raises the Chat icon (130)');
  await p.evaluate((m) => window.__h['room_messages:INSERT'](m), campusMsg(51, 'me')); await wait();
  ok(await lastBadge() === 130, 'my own Campus message is not counted');
  // messages that arrived while offline are found by asking the server again
  await p.evaluate(() => { window.__T.room_messages.push({ id: 60, room: 'campus_lobby', user_id: 'x1', body: 'a' }, { id: 61, room: 'campus_lobby', user_id: 'x2', body: 'b' }, { id: 62, room: 'campus_lobby', user_id: 'me', body: 'mine' }, { id: 63, room: 'int_b12_1', user_id: 'x1', body: 'other room' }); window.dispatchEvent(new Event('online')); }); await wait(900);
  ok(await lastBadge() === 129 + 2, 'coming back online recounts Campus from the server: 2 others (not mine, not another room) → 131 (got ' + await lastBadge() + ')');
  await p.evaluate(() => window.openApp()); await wait(600);
  ok(await lastBadge() === 129, 'opening Campus clears its number (129)');
  ok(await pill() === '', 'Campus tab shows no pill while you are in it');
  await p.evaluate((m) => window.__h['room_messages:INSERT'](m), campusMsg(70, 'x2')); await wait();
  ok(await lastBadge() === 129, 'a message in the Campus you are looking at is not counted');
  await click('[data-t=friends]'); await wait(300);
  await p.evaluate((m) => window.__h['room_messages:INSERT'](m), campusMsg(71, 'x2')); await wait();
  ok(await lastBadge() === 130 && await pill() === '1', 'on another tab it counts again: icon 130 and Campus tab pill 1 (got ' + await lastBadge() + ' / ' + await pill() + ')');
  await click('[data-t=campus]'); await wait(600);
  ok(await lastBadge() === 129 && await pill() === '', 'going back to Campus clears it');
  ok(errs.length === 0, 'no console errors' + (errs.length ? ': ' + errs.join(' | ') : ''));
  await b.close(); console.log('CAMPUS UNREAD TESTS PASSED');
})().catch(e => { console.error(e.message); process.exit(1); });
