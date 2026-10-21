/* Browser test for the phone Chat app (public/world/game/phone/apps/chat.js) with an in-memory fake Supabase.
   Checks the UI flows: Campus, Building tab, player search + wave, deep link (FutaChat.openWith), groups (create / invite / people / back), and that user text is never HTML.
   It does NOT test SQL rules — that is supabase/tests/test_chat.sql.   usage: node tools/test/chat-phone.js   (needs playwright + chromium) */
const fs = require('fs'), path = require('path');
let chromium; try { ({ chromium } = require('playwright')); } catch (e) { ({ chromium } = require(path.join(process.env.PLAYWRIGHT_NODE_PATH || '/home/claude/.npm-global/lib/node_modules', 'playwright'))); }
const SRC = fs.readFileSync(path.join(__dirname, '../../public/world/game/phone/apps/chat.js'), 'utf8');

const PAGE_JS = `
window.calls = []; window.toasts = []; window.alerts = []; window.__h = {};
const __ls = {}; Object.defineProperty(window, 'localStorage', { value: { getItem: (k) => (k in __ls ? __ls[k] : null), setItem: (k, v) => { __ls[k] = String(v); }, removeItem: (k) => { delete __ls[k]; } } }); window.apps = {};
const T = { room_messages: [{ id: 1, room: 'campus_lobby', user_id: 'x1', username: 'tola', body: 'hello campus' }, { id: 2, room: 'int_b12_1', user_id: 'x1', username: 'tola', body: 'hello library' }, { id: 3, room: 'campus_lobby', user_id: 'x1', username: 'tola', body: '<img src=x onerror="window.__xss=1">' }],
  player_stats: [{ id: 'me', building: null, updated_at: new Date().toISOString() }], waves: [{ id: 9, from_user: 'x1', to_user: 'me', status: 'accepted' }], dms: [],
  notifications: [{ id: 1, from_user: 'x1', kind: 'money', title: 'tola sent you ₦2,000', body: 'for data', amount: 2000, read_at: null, created_at: new Date().toISOString() }],
  profiles: [{ id: 'x1', username: 'tola' }, { id: 'x2', username: 'chidi' }, { id: 'x3', username: 'chika' }], group_members: [], chat_groups: [], group_messages: [] };
const q = (rows) => { let r = rows.slice(); const b = { select() { return b; }, eq(c, v) { r = r.filter(x => x[c] === v); return b; }, in(c, a) { r = r.filter(x => a.indexOf(x[c]) >= 0); return b; }, or(str) { const ms = [...String(str).matchAll(/and\\((\\w+)\\.eq\\.([^,]+),(\\w+)\\.eq\\.([^)]+)\\)/g)]; if (ms.length) r = r.filter(x => ms.some(m => x[m[1]] === m[2] && x[m[3]] === m[4])); return b; }, order() { return b; }, limit() { return b; }, is() { return b; },
  maybeSingle() { return Promise.resolve({ data: r[0] || null, error: null }); }, then(f, e) { return Promise.resolve({ data: r, error: null }).then(f, e); } }; return b; };
const people = [{ user_id: 'x1', username: 'tola', relation: 'friends' }, { user_id: 'x2', username: 'chidi', relation: 'none' }, { user_id: 'x3', username: 'chika', relation: 'none' }];
let nid = 100;
const RPC = {
  get_transfer_info: () => ({ min: 100, max: 500000, leftToday: 2000000, countLeft: 10, bank: 80000 }),
  send_money: (a) => { if (a.p_amount > 80000) throw new Error('insufficient_funds'); return { id: nid++, amount: a.p_amount, bank: 80000 - a.p_amount }; },
  mark_notifications_read: () => null,
  search_players: (a) => people.filter(p => p.username.indexOf(a.p_query) >= 0),
  send_wave: (a) => { const x = a.p_to === 'x3' ? 'accepted' : 'pending'; if (x === 'accepted') T.waves.push({ id: nid++, from_user: 'x3', to_user: 'me', status: 'accepted' }); return { status: x }; },
  send_room_message: () => nid++, send_dm: () => (window.lastDm = nid++), send_group_message: () => nid++, respond_wave: () => ({}), invite_to_group: () => ({ status: 'invited' }), leave_group: () => null, remove_group_member: () => null, respond_group_invite: () => ({}),
  create_group: (a) => { const id = nid++; T.chat_groups.push({ id, name: a.p_name }); T.group_members.push({ group_id: id, user_id: 'me', status: 'member', role: 'owner' }); return id; }
};
window.FutaApi = { sb() { return { from: (t) => q(T[t] || []), channel() { const c = { on(t, o, f) { window.__h[o.table + ':' + o.event] = f; return c; }, subscribe() { return c; }, unsubscribe() { } }; return c; } }; },
  rpc(n, a) { window.calls.push([n, a]); return Promise.resolve(RPC[n] ? RPC[n](a || {}) : null); } };
window.__ph = {}; window.FutaPhone = { on(ev, f) { (window.__ph[ev] = window.__ph[ev] || []).push(f); }, registerApp(d) { window.apps[d.id] = d; }, getUser() { return { id: 'me', username: 'me' }; }, api() { return window.FutaApi; }, demo() { return false; }, badge() { }, toast(m) { window.toasts.push(m); },
  isOpen() { return true; }, alert(a) { window.alerts.push(a); }, refreshUser() { window.refreshed = (window.refreshed || 0) + 1; return Promise.resolve(); }, show() { }, open(id, opts) { window.openCall = [id, opts]; window.openApp(opts); } };
window.__T = T;
window.openApp = (opts) => { document.body.innerHTML = '<div class="ph-screen"><div id="body"></div></div>'; window.title = ''; (window.__ph.open || []).forEach(f => f('chat')); window.inst = window.apps.chat.mount(document.getElementById('body'), { icons: { send: '>', search: '?' }, setTitle: (t) => { window.title = t; }, opts: opts || {} }); };
`;
const ok = (c, m) => { if (!c) { console.error('FAIL:', m); process.exitCode = 1; throw new Error(m); } console.log('ok  -', m); };
(async () => {
  const b = await chromium.launch(), p = await b.newPage(); const errs = []; p.on('pageerror', e => errs.push(e.message)); p.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });
  await p.setContent('<body></body>'); await p.addScriptTag({ content: PAGE_JS }); await p.addScriptTag({ content: SRC });
  const txt = () => p.evaluate(() => document.body.innerText), wait = (ms) => p.waitForTimeout(ms || 80);
  const click = async (sel, t) => { await p.evaluate(([s, tx]) => { const el = [...document.querySelectorAll(s)].find(e => !tx || e.textContent.indexOf(tx) >= 0); if (!el) throw new Error('no ' + s + ' ' + (tx || '')); el.click(); }, [sel, t || '']); await wait(); };
  const calls = () => p.evaluate(() => window.calls.map(c => c[0]));

  await p.evaluate(() => window.openApp()); await wait(150);
  ok((await txt()).includes('hello campus'), 'Campus tab loads room messages');
  ok(await p.evaluate(() => window.__xss === undefined) && (await txt()).includes('<img src=x'), 'message text is shown as text, never run as HTML');
  ok(await p.evaluate(() => document.querySelector('[data-t=building]').hidden), 'Building tab hidden while outside');
  await p.evaluate(() => { window.__T.player_stats[0].building = 'B12'; window.openApp(); }); await wait(200);
  ok(await p.evaluate(() => !document.querySelector('[data-t=building]').hidden), 'Building tab appears inside a building');
  await click('[data-t=building]'); ok((await txt()).includes('hello library') && !(await txt()).includes('hello campus'), 'Building tab shows only that building’s room');
  await p.fill('form input', 'hi building'); await p.press('form input', 'Enter'); await wait();
  ok(await p.evaluate(() => window.calls.some(c => c[0] === 'send_room_message' && c[1].p_room === 'int_b12_1')), 'sending goes to the private building room');

  await click('[data-t=friends]'); ok((await txt()).includes('tola'), 'Friends tab lists friends');
  await p.fill('.ph-search input', 'ch'); await wait(450);
  ok((await txt()).includes('chidi') && (await txt()).includes('chika') && !(await txt()).includes('Message\nchidi'), 'search shows matching names');
  ok(await p.evaluate(() => window.calls.some(c => c[0] === 'search_players' && c[1].p_query === 'ch')), 'search uses the search_players RPC');
  await click('.ph-mini', '👋 Wave'); ok((await calls()).includes('send_wave'), 'Wave button calls send_wave');

  await p.evaluate(() => window.FutaChat.openWith({ id: 'x2', username: 'chidi' })); await wait(150);
  ok(await p.evaluate(() => window.openCall && window.openCall[0] === 'chat' && window.openCall[1].peer.id === 'x2'), 'FutaChat.openWith opens the Chat app on that player');
  ok((await txt()).includes('Wave first') && !(await p.evaluate(() => getComputedStyle(document.querySelector('form')).display !== 'none')), 'a stranger shows the wave-first screen and no message box');
  await p.evaluate(() => window.FutaChat.openWith({ id: 'x1', username: 'tola' })); await wait(150);
  ok(await p.evaluate(() => getComputedStyle(document.querySelector('form')).display !== 'none') && await p.evaluate(() => window.title === 'tola'), 'a friend opens straight into the conversation');
  await p.fill('form input', 'yo'); await p.press('form input', 'Enter'); await wait(); ok((await calls()).includes('send_dm'), 'DM goes through send_dm');
  ok(await p.evaluate(() => window.inst.back() === true), 'Back from a conversation stays inside the app');


  /* ---- quick replies, money, alerts ---- */
  const chips = () => p.evaluate(() => [...document.querySelectorAll('.ph-quick button')].map(b => b.textContent));
  await p.evaluate(() => window.FutaChat.openWith({ id: 'x1', username: 'tola' })); await wait(150);
  ok((await chips()).length >= 3 && (await chips()).includes('Hey! 👋'), 'an empty friend chat offers opening chips');
  await p.evaluate(() => { window.__T.dms.push({ id: 500, sender: 'x1', recipient: 'me', body: 'are you coming to the library?', kind: 'text' }); window.openApp({ peer: { id: 'x1', username: 'tola' } }); }); await wait(200);
  ok((await chips()).includes('Yes 👍'), 'a question gets yes / no / later chips');
  const before = await p.evaluate(() => window.calls.filter(c => c[0] === 'send_dm').length);
  await click('.ph-quick button', 'Yes 👍');
  ok(await p.evaluate((n) => { const c = window.calls.filter(x => x[0] === 'send_dm'); return c.length === n + 1 && c[c.length - 1][1].p_body === 'Yes 👍' && c[c.length - 1][1].p_to === 'x1'; }, before), 'tapping a chip sends it through send_dm');
  await p.fill('form input', 'typing…'); ok(await p.evaluate(() => document.querySelector('.ph-quick').hidden), 'chips hide while the player types');
  await p.fill('form input', ''); await wait();
  await p.evaluate(() => { window.__T.dms.length = 0; window.__T.dms.push({ id: 501, sender: 'x1', recipient: 'me', body: 'thanks a lot', kind: 'text' }); window.openApp({ peer: { id: 'x1', username: 'tola' } }); }); await wait(200);
  ok((await chips()).some(c => /welcome/.test(c)), 'a thank-you gets welcome chips');

  ok(await p.evaluate(() => !![...document.querySelectorAll('.ph-mini')].find(b => /Send money/.test(b.textContent))), 'a friend chat has a Send money button');
  await click('.ph-mini', 'Send money'); await wait(200);
  ok((await txt()).includes('₦80,000') && (await calls()).includes('get_transfer_info'), 'the sheet shows the bank balance and today’s limit');
  await click('.mn-q button', '₦5,000'); ok(await p.evaluate(() => document.querySelector('.mn-amt').value === '5000'), 'quick amounts fill the box');
  await p.fill('.mn-amt', '50'); await click('[data-go]'); ok((await txt()).includes('smallest amount'), 'too small is refused on the phone before calling the server');
  await p.fill('.mn-amt', '900000'); await click('[data-go]'); ok((await txt()).includes('up to'), 'above the per-transfer limit is refused on the phone');
  await p.fill('.mn-amt', '90000'); await click('[data-go]'); ok((await txt()).includes('Not enough money'), 'more than the bank is refused on the phone');
  await p.fill('.mn-amt', '5000'); await p.fill('.mn-sheet input[aria-label=Note]', 'for jollof'); await click('[data-go]');
  ok((await txt()).includes('₦5,000 → tola') && !(await p.evaluate(() => window.calls.some(c => c[0] === 'send_money'))), 'there is a review step and nothing is sent yet');
  await click('[data-ok]'); await wait(200);
  ok(await p.evaluate(() => window.calls.some(c => c[0] === 'send_money' && c[1].p_to === 'x1' && c[1].p_amount === 5000 && c[1].p_note === 'for jollof')), 'confirming calls send_money with amount and note');
  ok(await p.evaluate(() => !!document.querySelector('.ph-msg.money.me') && document.querySelector('.ph-msg.money.me').textContent.includes('₦5,000') && document.querySelector('.ph-msg.money.me').textContent.includes('for jollof')), 'a gold money bubble appears in the chat');
  ok(await p.evaluate(() => !document.querySelector('.ph-sheet') && window.refreshed > 0), 'the sheet closes and the wallet is refreshed');
  // history: a stored money message renders as a bubble for the receiver
  await p.evaluate(() => { window.__T.dms.length = 0; window.__T.dms.push({ id: 600, sender: 'x1', recipient: 'me', body: '💸 Sent ₦2,000 — for data', kind: 'money', amount: 2000 }); window.openApp({ peer: { id: 'x1', username: 'tola' } }); }); await wait(200);
  ok(await p.evaluate(() => [...document.querySelectorAll('.ph-msg.money')].some(d => !d.classList.contains('me') && d.textContent.includes('tola sent you') && d.textContent.includes('₦2,000') && d.textContent.includes('for data'))), 'money you received shows as “tola sent you ₦2,000”');
  ok((await chips()).some(c => /Thank you|Received/.test(c)), 'money received offers thank-you chips');
  // failure
  await click('.ph-mini', 'Send money'); await wait(150); await p.fill('.mn-amt', '5000'); await click('[data-go]'); await p.evaluate(() => { window.__rpc = window.FutaApi.rpc; window.FutaApi.rpc = (n, a) => { window.calls.push([n, a]); return n === 'send_money' ? Promise.reject(new Error('daily_limit')) : Promise.resolve(n === 'get_transfer_info' ? { min: 100, max: 500000, leftToday: 9e6, countLeft: 9, bank: 80000 } : null); }; });
  await click('[data-ok]'); await wait(200); ok(await p.evaluate(() => window.toasts.some(t => /sending limit/.test(t))) && !!(await p.evaluate(() => document.querySelector('.ph-sheet'))), 'a server refusal shows a friendly message and keeps the sheet open');
  await p.evaluate(() => { document.querySelector('.ph-sheet').remove(); window.FutaApi.rpc = window.__rpc; });
  // alerts list in Friends
  await click('[data-t=friends]'); await wait(250);
  ok((await txt()).includes('Alerts') && (await txt()).includes('tola sent you ₦2,000') && (await txt()).includes('for data'), 'Friends tab lists money alerts');
  ok((await calls()).includes('mark_notifications_read'), 'showing the alerts marks them read');


  const SHOT = process.env.SHOT_DIR;   // optional: node tools/test/chat-phone.js with SHOT_DIR=/some/dir saves pictures of the tick states (uses the real phone.css)
  const snap = async (name) => { if (!SHOT) return; await p.evaluate((css) => { if (!document.getElementById('__css')) { const st = document.createElement('style'); st.id = '__css'; st.textContent = css + 'body{margin:0;background:#cfe3d4}#futaPhone{position:static!important;width:390px;margin:10px;display:block;transform:none!important;opacity:1!important;visibility:visible!important;pointer-events:auto!important;font-size:15px}.ph-screen{height:430px;display:flex;flex-direction:column;background:#fbf8f1}#body{display:flex;flex-direction:column;flex:1;min-height:0}'; document.head.appendChild(st); document.querySelector('.ph-screen').parentNode.id = 'futaPhone'; } }, fs.readFileSync(path.join(__dirname, '../../public/world/game/phone/phone.css'), 'utf8')); await p.locator('#futaPhone').screenshot({ path: SHOT + '/' + name + '.png' }); };
  /* ---- ticks + resend ---- */
  const tick = () => p.evaluate(() => { const t = [...document.querySelectorAll('.ph-msg.me .ph-tick')].pop(); return t ? t.dataset.s : null; });
  await p.evaluate(() => { window.__T.dms.length = 0; window.calls.length = 0; window.openApp({ peer: { id: 'x1', username: 'tola' } }); }); await wait(200);
  await p.fill('form input', 'tick test'); await p.press('form input', 'Enter'); await wait(250);
  ok(await tick() === 'sent', 'a sent DM shows one tick (sent)');
  ok(await p.evaluate(() => { const c = window.calls.filter(x => x[0] === 'send_dm').pop(); return /^[0-9a-f-]{36}$/.test(c[1].p_client); }), 'every send carries a client id (so a retry cannot post twice)');
  await p.evaluate(() => window.__h['dms:UPDATE']({ new: { id: window.lastDm, delivered_at: new Date().toISOString(), read_at: null } })); await wait(50);
  ok(await tick() === 'delivered' && await p.evaluate(() => document.querySelector('.ph-tick[data-s=delivered] polyline:nth-child(2)') !== null), 'when their phone has it: two ticks (delivered)');
  await p.evaluate(() => window.__h['dms:UPDATE']({ new: { id: window.lastDm, delivered_at: new Date().toISOString(), read_at: new Date().toISOString() } })); await wait(50);
  ok(await tick() === 'seen', 'when they open the chat: the ticks become seen (light blue, see the screenshot test)');
  await p.evaluate(() => window.__h['dms:UPDATE']({ new: { id: window.lastDm, delivered_at: new Date().toISOString(), read_at: null } })); await wait(50);
  ok(await tick() === 'seen', 'a late "delivered" update never downgrades seen');

  await snap('ticks-seen');
  // history shows the right ticks
  await p.evaluate(() => { const t = new Date().toISOString(); window.__T.dms.length = 0; window.__T.dms.push({ id: 700, sender: 'me', recipient: 'x1', body: 'one', kind: 'text', created_at: t }, { id: 701, sender: 'me', recipient: 'x1', body: 'two', kind: 'text', delivered_at: t, created_at: t }, { id: 702, sender: 'me', recipient: 'x1', body: 'three', kind: 'text', delivered_at: t, read_at: t, created_at: t }); window.openApp({ peer: { id: 'x1', username: 'tola' } }); }); await wait(250);
  ok(await p.evaluate(() => { const m = {}; document.querySelectorAll('.ph-msg.me').forEach(d => { m[d.firstChild.textContent] = d.querySelector('.ph-tick').dataset.s; }); return m.one === 'sent' && m.two === 'delivered' && m.three === 'seen'; }), 'history: sent, delivered and seen messages each show the right ticks');

  // the receiving side reports delivered / seen
  await p.evaluate(() => { window.calls.length = 0; window.__h['dms:INSERT']({ new: { id: 800, sender: 'x1', recipient: 'me', body: 'hey you', kind: 'text' } }); }); await wait(700);
  ok(await p.evaluate(() => window.calls.some(c => c[0] === 'mark_dms_delivered')), 'a new DM makes this phone report “delivered”');
  ok(await p.evaluate(() => window.calls.some(c => c[0] === 'mark_dms_read' && c[1].p_peer === 'x1')), 'with the chat open, it also reports “seen”');
  await p.evaluate(() => { window.calls.length = 0; window.inst.back(); (window.__ph.open || []).forEach(f => f(null)); window.__h['dms:INSERT']({ new: { id: 801, sender: 'x1', recipient: 'me', body: 'again', kind: 'text' } }); }); await wait(700);
  ok(await p.evaluate(() => window.calls.some(c => c[0] === 'mark_dms_delivered') && !window.calls.some(c => c[0] === 'mark_dms_read')), 'with the chat closed it only reports “delivered”, not “seen”');

  // network failure → red, retry, same client id, no duplicate
  await p.evaluate(() => { window.__T.dms.length = 0; window.openApp({ peer: { id: 'x1', username: 'tola' } }); window.calls.length = 0; window.__okRpc = window.FutaApi.rpc; window.FutaApi.rpc = (n, a) => { window.calls.push([n, a]); return n === 'send_dm' ? Promise.reject(new Error('TypeError: Failed to fetch')) : window.__okRpc(n, a); }; }); await wait(200);
  await p.fill('form input', 'offline msg'); await p.press('form input', 'Enter'); await wait(300);
  await snap('ticks-failed');
  ok(await tick() === 'failed' && await p.evaluate(() => !!document.querySelector('.ph-msg.me.failed .ph-retry')) && (await txt()).includes('Tap to retry'), 'no network: the message turns red with “Not sent · Tap to retry”');
  ok(await p.evaluate(() => document.querySelector('form input').value === ''), 'the text is not thrown back into the box (it is safe in the outbox)');
  const cid1 = await p.evaluate(() => window.calls.filter(x => x[0] === 'send_dm').pop()[1].p_client);
  await p.evaluate(() => { window.FutaApi.rpc = window.__okRpc; window.calls.length = 0; }); await click('.ph-retry'); await wait(300);
  ok(await tick() === 'sent' && await p.evaluate((c) => { const x = window.calls.filter(y => y[0] === 'send_dm'); return x.length === 1 && x[0][1].p_client === c; }, cid1), 'tapping retry sends the SAME client id and the tick becomes sent');
  ok(await p.evaluate(() => document.querySelectorAll('.ph-msg.me').length === 1 && !document.querySelector('.ph-retry')), 'still one bubble, retry button gone');

  // closing the chat does not lose an unsent message; coming back online resends it automatically
  await p.evaluate(() => { window.FutaApi.rpc = (n, a) => { window.calls.push([n, a]); return n === 'send_dm' ? Promise.reject(new Error('Failed to fetch')) : window.__okRpc(n, a); }; });
  await p.fill('form input', 'will survive'); await p.press('form input', 'Enter'); await wait(300);
  ok(await tick() === 'failed', 'second unsent message is red');
  await p.evaluate(() => { window.inst.destroy(); window.openApp({ peer: { id: 'x1', username: 'tola' } }); }); await wait(300);
  ok((await txt()).includes('will survive') && await p.evaluate(() => !!document.querySelector('.ph-msg.me.failed')), 'leaving and re-opening the chat still shows the unsent message');
  await p.evaluate(() => { window.FutaApi.rpc = window.__okRpc; window.calls.length = 0; window.dispatchEvent(new Event('online')); }); await wait(400);
  ok(await p.evaluate(() => window.calls.filter(c => c[0] === 'send_dm' && c[1].p_body === 'will survive').length === 1) && await tick() === 'sent', 'when the connection returns it is resent automatically and turns to sent');
  ok(await p.evaluate(() => JSON.parse(localStorage.getItem('futa.outbox.me') || '[]').length === 0), 'the outbox is empty afterwards');

  // a server refusal is not retried: bubble removed, text back in the box
  await p.evaluate(() => { window.FutaApi.rpc = (n, a) => { window.calls.push([n, a]); return n === 'send_dm' ? Promise.reject(new Error('message_not_allowed')) : window.__okRpc(n, a); }; window.toasts.length = 0; });
  const nb = await p.evaluate(() => document.querySelectorAll('.ph-msg.me').length);
  await p.fill('form input', 'bad words'); await p.press('form input', 'Enter'); await wait(300);
  ok(await p.evaluate((n) => document.querySelectorAll('.ph-msg.me').length === n && document.querySelector('form input').value === 'bad words', nb), 'a message the server refuses is removed and its text comes back to edit');
  ok(await p.evaluate(() => window.toasts.some(t => /can.t be sent/.test(t))), 'with a friendly reason');
  ok(await p.evaluate(() => JSON.parse(localStorage.getItem('futa.outbox.me') || '[]').length === 0), 'refused messages are not kept for retry');
  // rooms and groups: failed + retry too, ticks stay single
  await p.evaluate(() => { window.FutaApi.rpc = window.__okRpc; window.openApp(); }); await wait(250);
  await p.fill('form input', 'room msg'); await p.press('form input', 'Enter'); await wait(250);
  ok(await tick() === 'sent' && await p.evaluate(() => document.querySelectorAll('.ph-tick[data-s=delivered]').length === 0), 'campus messages show a single tick (no read receipts in public rooms)');
  await p.evaluate(() => { window.FutaApi.rpc = (n, a) => { window.calls.push([n, a]); return n === 'send_room_message' ? Promise.reject(new Error('NetworkError when attempting to fetch resource.')) : window.__okRpc(n, a); }; });
  await p.fill('form input', 'room offline'); await p.press('form input', 'Enter'); await wait(250);
  ok(await tick() === 'failed', 'an unsent campus message is red too');
  await p.evaluate(() => { window.FutaApi.rpc = window.__okRpc; }); await click('.ph-retry'); await wait(250); ok(await tick() === 'sent', 'and can be retried');

  await click('[data-t=groups]'); await click('.ph-mini', 'New group'); await p.fill('.ph-search input', 'Study Squad'); await p.press('.ph-search input', 'Enter'); await wait(200);
  ok(await p.evaluate(() => window.calls.some(c => c[0] === 'create_group' && c[1].p_name === 'Study Squad')) && await p.evaluate(() => window.title.indexOf('Study Squad') === 0), 'creating a group opens it');
  ok((await txt()).includes('must accept'), 'a new group opens on the Add screen and says invitees must accept');
  await p.fill('.ph-search input', 'chi'); await wait(450); await click('.ph-mini', 'Invite');
  ok(await p.evaluate(() => window.calls.some(c => c[0] === 'invite_to_group' && c[1].p_user === 'x2')), 'Add → search → Invite calls invite_to_group');
  ok(await p.evaluate(() => window.inst.back() === true) && await p.evaluate(() => window.title === 'Study Squad'), 'Back from the Add screen returns to the group thread');
  await p.fill('form input', 'first!'); await p.press('form input', 'Enter'); await wait(); ok((await calls()).includes('send_group_message'), 'group message goes through send_group_message');
  await click('.ph-mini', 'People'); ok((await txt()).includes('(you)'), 'People screen lists members');
  await p.evaluate(() => window.inst.back());
  ok(await p.evaluate(() => window.inst.back() === true), 'Back from the thread returns to the group list');
  ok(await p.evaluate(() => window.inst.back() === false), 'Back from the list lets the phone go home');
  ok(errs.length === 0, 'no console errors' + (errs.length ? ': ' + errs.join(' | ') : ''));
  await b.close(); console.log('CHAT PHONE TESTS PASSED');
})().catch(e => { console.error(e.message); process.exit(1); });
