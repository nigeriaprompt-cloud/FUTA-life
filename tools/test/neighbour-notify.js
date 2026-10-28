/* Browser test: neighbour message heads-up with quick reply (phone/phone.js notify + phone/apps/chat.js nbHeadsUp).
   Loads the REAL phone + chat app with a fake FutaApi, pushes a realtime group_messages INSERT and checks: the card shows the sender + text, it grows to "3 new",
   Reply sends send_group_message with p_reply_to = the message id WITHOUT opening the app, Mark as read calls mark_group_read, friend groups / my own messages stay silent,
   typing in the card never reaches the game's key handlers.   usage: node tools/test/neighbour-notify.js   (needs playwright + chromium) */
const fs = require('fs'), path = require('path'), http = require('http');
let chromium; try { ({ chromium } = require('playwright')); } catch (e) { ({ chromium } = require(path.join(process.env.PLAYWRIGHT_NODE_PATH || '/home/claude/.npm-global/lib/node_modules', 'playwright'))); }
const ROOT = path.join(__dirname, '../../public'), MIME = { '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.html': 'text/html', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png' };
const srv = http.createServer((q, r) => { const u = decodeURIComponent(q.url.split('?')[0]); if (u === '/t.html') { r.setHeader('content-type', 'text/html'); return r.end(PAGE); } const f = path.join(ROOT, u); if (!f.startsWith(ROOT) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { r.statusCode = 404; return r.end(); } r.setHeader('content-type', MIME[path.extname(f)] || 'application/octet-stream'); fs.createReadStream(f).pipe(r); });
const PAGE = `<!doctype html><meta charset=utf-8><meta name=viewport content="width=device-width,initial-scale=1"><body style="margin:0;height:100vh;background:#223"><script>
window.FUTA_CONFIG = { demo: false }; window.supabase = {}; window.calls = []; window.__h = {}; window.gameKeys = 0; addEventListener('keydown', () => window.gameKeys++);
window.FutaApi = { me: () => Promise.resolve({ user: { id: 'me', username: 'me' } }), onAuth() { },
  sb() { const c = { on(t, o, f) { window.__h[o.table + ':' + o.event] = f; return c; }, subscribe() { return c; }, unsubscribe() { } }; const q = { select: () => q, eq: () => q, neq: () => q, gt: () => q, order: () => q, limit: () => q, in: () => q, then: (f) => Promise.resolve({ data: [], count: 0, error: null }).then(f) }; return { from: () => q, channel: () => c }; },
  rpc(n, a) { window.calls.push([n, a || {}]); const R = { ensure_neighbours: { id: 7, name: 'Neighbours 7', members: 4 }, get_unread: { dms: {}, groups: {}, invites: 0, alerts: 0, campus: 0 }, send_group_message: 501 }; if (n === 'send_group_message' && window.failSend) return Promise.reject(new Error('slow_down')); return Promise.resolve(R[n] === undefined ? null : R[n]); } };
</script><script src="/world/game/phone/phone.js"></script>`;
let fails = 0; const ok = (c, m) => { console.log((c ? 'ok   - ' : 'FAIL - ') + m); if (!c) fails++; };
(async () => {
  await new Promise(r => srv.listen(0, r)); const port = srv.address().port; const b = await chromium.launch(); const pg = await b.newPage({ viewport: { width: 390, height: 780 } }); const errs = []; pg.on('pageerror', e => errs.push(e.message));
  await pg.goto('http://localhost:' + port + '/t.html'); await pg.waitForFunction(() => window.__h['group_messages:INSERT'] && window.FutaPhone && window.FutaPhone.notify, null, { timeout: 15000 });
  await pg.waitForTimeout(800);
  const push = (row) => pg.evaluate((r) => window.__h['group_messages:INSERT']({ new: r }), row);
  const card = pg.locator('.ph-heads'), shown = () => card.evaluate(e => e.classList.contains('show'));
  await pg.evaluate(() => FutaPhone.hide(true));                                                       // phone put away: the heads-up must still appear

  await push({ id: 41, group_id: 99, user_id: 'x1', username: 'amaka', body: 'friend group msg' }); await pg.waitForTimeout(150);
  ok(!(await card.count()) || !(await shown()), 'message from a FRIEND group does not pop up');
  await push({ id: 42, group_id: 7, user_id: 'me', username: 'me', body: 'my own' }); await pg.waitForTimeout(150);
  ok(!(await card.count()) || !(await shown()), 'my own message does not pop up');

  await push({ id: 43, group_id: 7, user_id: 'x1', username: 'tola', body: 'Who has a spare charger <b>pls</b>?' }); await pg.waitForTimeout(500);
  ok(await shown(), 'neighbour message shows the heads-up while the phone is hidden');
  ok((await card.locator('.ph-hd b').textContent()).startsWith('tola'), 'card shows the sender');
  ok((await card.locator('.ph-hm').textContent()) === 'Who has a spare charger <b>pls</b>?' && (await card.locator('.ph-hm b').count()) === 0, 'message text is shown as plain text (no HTML)');
  await pg.screenshot({ path: '/tmp/nb-card.png', clip: { x: 0, y: 0, width: 390, height: 200 } });
  const box = await card.boundingBox(); ok(box && box.y >= 0 && box.y < 60 && box.width > 250 && box.x >= 0 && box.x + box.width <= 390, 'card is at the top of the screen and fits a 390px phone (' + JSON.stringify(box && { x: Math.round(box.x), y: Math.round(box.y), w: Math.round(box.width) }) + ')');
  ok(!(await pg.evaluate(() => FutaPhone.isOpen())), 'the phone/app was NOT opened');

  await push({ id: 44, group_id: 7, user_id: 'x2', username: 'chidi', body: 'me too' }); await push({ id: 45, group_id: 7, user_id: 'x2', username: 'chidi', body: 'anyone?' }); await pg.waitForTimeout(200);
  ok((await card.locator('.ph-hd em').textContent()) === '3 new' && (await card.locator('.ph-hm').textContent()) === 'anyone?', 'several messages update the same card (3 new, latest text)');

  await card.locator('.ph-hr').click(); await pg.waitForTimeout(150);
  ok(await card.locator('.ph-hf input').isVisible(), 'Reply opens the input inside the card');
  await pg.keyboard.type('ws I have one'); ok((await pg.evaluate(() => window.gameKeys)) === 0, 'typing in the card does not reach the game key handlers');
  await pg.waitForTimeout(100); await push({ id: 46, group_id: 7, user_id: 'x1', username: 'tola', body: 'coming now' });
  ok((await card.locator('input').inputValue()) === 'ws I have one' && (await shown()), 'a new message while typing keeps my text and keeps the card up');
  await pg.screenshot({ path: '/tmp/nb-typing.png', clip: { x: 0, y: 0, width: 390, height: 200 } });
  await card.locator('.ph-hf button').click(); await pg.waitForTimeout(1500);
  const sent = await pg.evaluate(() => window.calls.filter(c => c[0] === 'send_group_message'));
  ok(sent.length === 1 && sent[0][1].p_group === 7 && sent[0][1].p_body === 'ws I have one' && sent[0][1].p_reply_to === 46 && /^[0-9a-f-]{36}$/.test(sent[0][1].p_client), 'reply goes to my neighbour group as a reply to the latest message (' + JSON.stringify(sent[0] && sent[0][1]) + ')');
  ok(!(await shown()), 'card closes after the reply is sent');
  ok(!(await pg.evaluate(() => FutaPhone.isOpen())), 'still no app opened after replying');
  await pg.waitForTimeout(700); ok((await pg.evaluate(() => window.calls.filter(c => c[0] === 'mark_group_read').length)) === 1, 'replying also marks the chat read');

  await push({ id: 47, group_id: 7, user_id: 'x1', username: 'tola', body: 'thanks!' }); await pg.waitForTimeout(400); ok(await shown() && (await card.locator('.ph-hd em').textContent()) === 'now', 'next message after a reply starts a fresh card');
  await pg.evaluate(() => { window.failSend = true; }); await card.locator('.ph-hr').click(); await pg.waitForTimeout(150); await pg.keyboard.type('hello'); await pg.keyboard.press('Enter'); await pg.waitForTimeout(500);
  ok(await shown() && (await card.locator('.ph-hs').textContent()).length > 0 && (await card.locator('input').inputValue()) === 'hello', 'failed send keeps the card and the text and says why: "' + await card.locator('.ph-hs').textContent() + '"');
  await pg.keyboard.press('Escape'); await pg.waitForTimeout(300); ok(!(await shown()), 'Escape closes the card');

  await push({ id: 48, group_id: 7, user_id: 'x1', username: 'tola', body: 'one more' }); await pg.waitForTimeout(400);
  await card.locator('.ph-hk').click(); await pg.waitForTimeout(900);
  ok(!(await shown()) && (await pg.evaluate(() => window.calls.filter(c => c[0] === 'mark_group_read').length)) === 2, 'Mark as read closes the card and tells the server');
  ok(!(await pg.evaluate(() => FutaPhone.isOpen())), 'Mark as read does not open the app');

  await push({ id: 49, group_id: 7, user_id: 'x1', username: 'tola', body: 'open me' }); await pg.waitForTimeout(400); await card.locator('.ph-hm').click(); await pg.waitForTimeout(600);
  ok((await pg.evaluate(() => FutaPhone.isOpen())) && !(await shown()), 'tapping the message itself opens the Neighbours app');
  await push({ id: 50, group_id: 7, user_id: 'x1', username: 'tola', body: 'while looking' }); await pg.waitForTimeout(400); ok(!(await shown()), 'no pop-up while the Neighbours chat is already open on screen');
  ok(errs.length === 0, 'no page errors' + (errs.length ? ': ' + errs.join(' | ') : ''));
  await pg.screenshot({ path: '/tmp/nb-final.png' }); await b.close(); srv.close(); console.log(fails ? fails + ' FAILED' : 'ALL NEIGHBOUR NOTIFY TESTS PASSED'); process.exit(fails ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
