/* Phone app: Chat — four tabs:
     Campus   the open campus room (everyone)
     Building the private chat of the building you are standing in (only shown while you are inside one; the DATABASE enforces who may read it)
     Friends  find players by username, wave requests, and direct messages with people who waved back
     Groups   group chats: create, invite (the other person must accept), member-only messages
   Real mode talks to Supabase through FutaApi: it READS rows (RLS-protected) and WRITES only through RPCs (send_room_message, send_dm,
   send_wave, respond_wave, search_players, create_group, invite_to_group, respond_group_invite, leave_group, remove_group_member,
   send_group_message), so rate limits, the word filter, teen rules, wave-first and member-only are enforced by supabase/01_schema.sql
   and supabase/10_chat_social.sql, never here.  Demo mode (no Supabase keys) fakes a little data so you can see the layout.
   All user text is inserted with textContent.
   MONEY + ALERTS (supabase/14_transfers.sql): in a friend chat, "₦ Send money" calls send_money (bank to bank, friends only, daily limits checked by the server).
   The money shows as a gold bubble in the chat and the receiver gets a pop-down alert + badge even when the phone is hidden (notifications table, realtime).
   TICKS + RESEND (supabase/15_receipts.sql): your messages show WhatsApp-style status. Clock = sending, ✓ = sent, ✓✓ grey = delivered (their phone has it),
   ✓✓ light blue = seen (they opened the chat; direct messages only; rooms and groups show ✓). If the network fails the message turns red with "Tap to retry"
   and is also retried automatically when the connection returns. Each message carries a client id (p_client), so a retry can never post twice. Unsent messages
   are kept in the OUTBOX (memory + localStorage) so closing the phone or reloading does not lose them.
   QUICK REPLIES: tappable suggestion chips above the message box (QUICK / suggest() below). They only fill in text; sending still goes through the normal RPCs.
   NEIGHBOURS (supabase/23_neighbours.sql): every player is put at random into a small group of up to 8 (same age band). ensure_neighbours() returns it; it shows as its own
   "Neighbours" tab here AND as its own Neighbours app on the phone home screen. It is a normal group underneath (ticks, unread, realtime), but cannot be left or invited into.
   REPLIES (groups + neighbours): tap ↩ Reply under a message; the reply carries p_reply_to and shows a quote of the original. SUGGESTIONS: the chips are time-aware
   (Good morning / afternoon / evening, Lagos time) and answer the last message (greeting back, "You’re welcome" after thanks, "Thank you" after someone helped).
   Other code can open a conversation:  FutaChat.openWith({ id, username })  (used by the name-label profile card in live/ui.js). */
(function (g) {
  'use strict';
  const Ph = g.FutaPhone; if (!Ph) return;
  const ROOM = 'campus_lobby', MAX = 240, FRESH_MS = 9 * 60 * 1000;
  const NICE = {
    wave_first: 'You can message each other after you both wave.', not_allowed: 'That isn’t allowed for this player.', slow_down: 'Slow down a little.',
    message_not_allowed: 'That message can’t be sent.', not_member: 'You are not in this group.', not_in_room: 'You have to be inside that building to chat there.',
    group_full: 'That group is full.', too_many_groups: 'You are in too many groups.', bad_group_name: 'Pick another group name (2–30 letters, no links).',
    finish_sign_up: 'Finish sign-up first.', not_found: 'That is no longer available.',
    bad_amount: 'Enter a valid amount.', over_limit: 'That is more than you can send in one go.', daily_limit: 'You have reached today’s sending limit.', receiver_limit: 'They can’t receive more money today.',
    insufficient_funds: 'Not enough money in your bank. Deposit at an ATM first.', in_jail: 'You can’t send money while in jail.'
  };
  const nice = (e) => { const m = (e && e.message) || String(e || ''), k = Object.keys(NICE).sort((x, y) => y.length - x.length).find(x => m.indexOf(x) >= 0);/* longest code first: message_not_allowed must not match not_allowed */ return k ? NICE[k] : (m || 'Something went wrong.'); };
  let chatOpen = false, user = null, chs = [], dmHandler = null, grpHandler = null, tickHandler = null, NB = null, nbErr = null;

  /* ---------- OUTBOX: messages that have not reached the server yet. The open Chat screen (hooks) draws their status. ---------- */
  const OB_MAX = 30, OB_TTL = 24 * 3600e3;
  let outbox = [], hooks = null; const inflight = new Set();
  const obKey = () => 'futa.outbox.' + (user || 'anon');
  function obLoad() { try { outbox = (JSON.parse(g.localStorage.getItem(obKey()) || '[]') || []).filter(x => x && x.cid && x.n && Date.now() - x.ts < OB_TTL).slice(-OB_MAX); } catch (e) { outbox = []; } }
  function obSave() { try { g.localStorage.setItem(obKey(), JSON.stringify(outbox.slice(-OB_MAX))); } catch (e) { } }
  const uuid = () => (g.crypto && g.crypto.randomUUID) ? g.crypto.randomUUID() : 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => { const r = Math.random() * 16 | 0; return (c === 'x' ? r : (r & 3 | 8)).toString(16); });
  /* "the request did not reach the server (or we never heard back)" — as opposed to the server saying no. Only these are retried. */
  const isNet = (e) => (g.navigator && g.navigator.onLine === false) || /failed to fetch|networkerror|network request|load failed|fetch|timeout|timed out|offline|connection|econn|abort/i.test((e && e.message) || String(e || ''));
  async function deliver(rec) {
    if (inflight.has(rec.cid) || !Ph.api()) return; inflight.add(rec.cid); if (hooks) hooks.state(rec, 'pending');
    try {
      const id = await Ph.api().rpc(rec.n, Object.assign({}, rec.a, { p_client: rec.cid }));       // same client id every time = the server never posts it twice
      outbox = outbox.filter(x => x.cid !== rec.cid); obSave(); if (hooks) hooks.state(rec, 'sent', id);
    } catch (e) {
      if (isNet(e)) { if (hooks) hooks.state(rec, 'failed'); }
      else { outbox = outbox.filter(x => x.cid !== rec.cid); obSave(); if (hooks) hooks.state(rec, 'rejected', null, e); else Ph.toast('A message could not be sent: ' + nice(e)); }
    } finally { inflight.delete(rec.cid); }
  }
  function flush() { if (!user || (g.navigator && g.navigator.onLine === false)) return; outbox.slice().forEach(deliver); }
  g.addEventListener('online', flush); setInterval(() => { if (outbox.length) flush(); }, 25000);
  /* the receiver's side of the ticks: "my phone has it" (delivered) and "I opened the chat" (seen) */
  let tDel = 0, tRead = {};
  const markDelivered = () => { clearTimeout(tDel); tDel = setTimeout(() => { const a = Ph.api(); if (a && user && !Ph.demo()) a.rpc('mark_dms_delivered').catch(() => { }); }, 300); };
  const markRead = (peerId) => { clearDm(peerId); clearTimeout(tRead[peerId]); tRead[peerId] = setTimeout(() => { const a = Ph.api(); if (a && user && !Ph.demo()) a.rpc('mark_dms_read', { p_peer: peerId }).catch(() => { }); }, 400); };
  const canSee = () => !g.document.hidden && Ph.isOpen() && chatOpen;
  /* ---------- UNREAD COUNTS. The server is the truth (get_unread: per friend, per group, invites, money alerts); realtime keeps it live. ----------
     Chat icon badge = everything added up, shown as 99+ above 99. Rows and tabs inside the app show their own counts. */
  const U = { dms: {}, groups: {}, invites: 0, alerts: 0, campus: 0 }; let paint = null, syncHook = null, viewTab = null;
  const sumOf = (o) => Object.values(o).reduce((a, b) => a + (b | 0), 0), capN = (n) => n > 99 ? '99+' : String(n);
  const nbUn = () => NB ? (U.groups[NB.id] | 0) : 0;   // the neighbour group has its own badge (Neighbours app + tab), so it is not counted twice
  const refresh = () => { Ph.badge('chat', sumOf(U.dms) + sumOf(U.groups) - nbUn() + (U.invites | 0) + (U.alerts | 0) + (U.campus | 0)); Ph.badge('neighbours', nbUn()); if (paint) paint(); };
  const addDm = (id) => { U.dms[id] = (U.dms[id] | 0) + 1; refresh(); }, clearDm = (id) => { if (U.dms[id]) { delete U.dms[id]; refresh(); } };
  const addGrp = (id) => { U.groups[id] = (U.groups[id] | 0) + 1; refresh(); }, clearGrp = (id) => { if (U.groups[id]) { delete U.groups[id]; refresh(); } };
  const resetUnread = () => { U.dms = {}; U.groups = {}; U.invites = 0; U.alerts = 0; U.campus = 0; refresh(); };
  /* CAMPUS room unread: the room is public and has no read state on the server, so THIS phone remembers the last message you saw (per player).
     New messages from other people raise the number (Chat icon + Campus tab); opening the Campus tab clears it. First run starts from "now" (no huge number). */
  const csKey = () => 'futa.campus.seen.' + (user || 'anon');
  const csGet = () => { try { const v = parseInt(g.localStorage.getItem(csKey()), 10); return v >= 0 ? v : null; } catch (e) { return null; } };
  const csSet = (id) => { try { id = +id || 0; const c = csGet(); if (c == null || id > c) g.localStorage.setItem(csKey(), String(id)); } catch (e) { } };
  const campusLooking = () => viewTab === 'campus' && chatOpen && !g.document.hidden && Ph.isOpen();
  async function syncCampus() {
    const a = Ph.api(); if (!a || !user || Ph.demo()) return;
    try {
      const sb = a.sb(); let seen = csGet();
      if (seen == null) { const r = await sb.from('room_messages').select('id').eq('room', ROOM).order('id', { ascending: false }).limit(1); if (r.error) return; seen = r.data && r.data[0] ? +r.data[0].id : 0; try { g.localStorage.setItem(csKey(), String(seen)); } catch (e) { } U.campus = 0; refresh(); return; }
      const r = await sb.from('room_messages').select('id', { count: 'exact', head: true }).eq('room', ROOM).gt('id', seen).neq('user_id', user);
      if (r.error) return; U.campus = campusLooking() ? 0 : (r.count | 0); refresh();
    } catch (e) { /* offline: keep the number we have */ }
  }
  let tSync = 0, tG = {};
  async function syncUnread() {   // ask the server for the exact numbers (login, reconnect, phone shown, group invites)
    const a = Ph.api(); if (!a || !user || Ph.demo()) return; syncCampus();
    try { const r = await a.rpc('get_unread'); if (r) { U.dms = r.dms || {}; U.groups = r.groups || {}; U.invites = r.invites | 0; U.alerts = r.alerts | 0; refresh(); if (syncHook) syncHook(); } } catch (e) { /* offline: keep what we have */ }
  }
  const syncSoon = () => { clearTimeout(tSync); tSync = setTimeout(syncUnread, 350); };
  const markGroup = (gid) => { clearGrp(gid); clearTimeout(tG[gid]); tG[gid] = setTimeout(() => { const a = Ph.api(); if (a && user && !Ph.demo()) a.rpc('mark_group_read', { p_group: gid }).catch(() => { }); }, 400); };
  g.addEventListener('online', syncSoon); g.document.addEventListener('visibilitychange', () => { if (!g.document.hidden) syncSoon(); });

  /* ---------- NEIGHBOURS: ask the server for my random neighbour group (it is created the first time) ---------- */
  let nbBusy = null;
  function ensureNb() {
    if (NB) return Promise.resolve(NB); const a = Ph.api(); if (!a || !user || Ph.demo()) return Promise.resolve(null);
    if (nbBusy) return nbBusy; const me = user;
    nbBusy = a.rpc('ensure_neighbours').then(r => { if (user !== me) return null; nbErr = null; if (r && r.id) { NB = { id: r.id, name: r.name || 'Neighbours', members: r.members | 0 }; refresh(); } return NB; })
      .catch(e => { nbErr = e; return null; }).then(x => { nbBusy = null; return x; });
    return nbBusy;
  }
  const nbMsg = () => { const m = (nbErr && nbErr.message) || ''; return /finish_sign_up/.test(m) ? 'Finish sign-up to meet your neighbours.' : /ensure_neighbours|schema cache|could not find/i.test(m) ? 'Neighbours is not switched on yet.' : nbErr ? nice(nbErr) : 'Could not find your neighbours. Try again in a moment.'; };

  /* ---------- background listeners (badge when the Chat app is closed) ---------- */
  function stopListeners() { chs.forEach(c => { try { c.unsubscribe(); } catch (e) { } }); chs = []; user = null; NB = null; nbErr = null; if (!Ph.demo()) resetUnread(); }
  function startListeners() {
    const u = Ph.getUser(), api = Ph.api(); if (!u || Ph.demo() || !api || user === u.id) return; stopListeners(); user = u.id;
    obLoad(); markDelivered(); syncUnread(); ensureNb(); setTimeout(flush, 800);   // catch up: tell senders we are online, and resend anything that never left this phone
    try {
      const sb = api.sb(), mk = (name, table, event, filter, fn) => { const o = { event, schema: 'public', table }; if (filter) o.filter = filter; chs.push(sb.channel('phone:' + name + ':' + u.id).on('postgres_changes', o, (m) => { if (m && m.new) fn(m.new); }).subscribe()); };
      mk('dm', 'dms', 'INSERT', 'recipient=eq.' + u.id, (r) => { markDelivered(); if (dmHandler && dmHandler(r)) return; if (r.kind === 'money') return; addDm(r.sender); });   // money has its own alert below
      mk('dmu', 'dms', 'UPDATE', 'sender=eq.' + u.id, (r) => { if (tickHandler) tickHandler(r); });   // my sent messages became delivered / seen
      mk('nt', 'notifications', 'INSERT', 'user_id=eq.' + u.id, (r) => {   if (r.app) return;   if (r.kind === 'neighbour') { showNbNotification(r); return; }   // neighbour: slide-in panel with quick reply, like WhatsApp from the notification shade
        // Global tags belong to the Global app. Someone sent you money: banner (even if the phone is hidden) + badge
        Ph.alert({ icon: '💸', title: r.title, body: r.body || 'Tap to open the chat', app: 'chat', opts: r.from_user ? { peer: { id: r.from_user, username: String(r.title || '').split(' ')[0] } } : null });
        U.alerts++; refresh(); if (g.FutaChat && g.FutaChat.onMoney) g.FutaChat.onMoney(r);
      });
      mk('gi', 'group_members', '*', 'user_id=eq.' + u.id, () => { syncSoon(); });   // an invite arrived, or I joined / declined / left: ask the server for the numbers
      mk('cr', 'room_messages', 'INSERT', 'room=eq.' + ROOM, (r) => { if (r.user_id === u.id) return; if (campusLooking()) { csSet(r.id); return; } U.campus++; refresh(); });   // someone spoke in Campus while I was elsewhere
      mk('gm', 'group_messages', 'INSERT', null, (r) => { if (r.user_id === u.id) return; if (grpHandler && grpHandler(r)) return; addGrp(r.group_id); });   // RLS: only messages from my groups arrive
    } catch (e) { console.warn('[phone chat]', e.message); }
  }
  /* ---------- neighbour message notification slide-in (WhatsApp quick-reply from the shade) ---------- */
  let nbNotifEl = null, nbNotifMsg = null, nbNotifGrp = null, nbNotifSender = null, nbNotifFrom = null;
  function showNbNotification(n) {
    // n = { id, user_id, title, body, created_at }  (kind='neighbour', from_user = sender)
    const from = n.from_user || n.user_id;
    nbNotifSender = n.title || 'Neighbour';
    nbNotifFrom = from;
    nbNotifGrp = null;   // will resolve from the group_messages realtime listener if needed
    const existing = document.getElementById('futaNbNotif');
    if (existing) existing.remove();
    nbNotifEl = document.createElement('div');
    nbNotifEl.id = 'futaNbNotif';
    nbNotifEl.className = 'futa-nb-notif';
    nbNotifEl.innerHTML =
      '<div class="futa-nb-head"><b class="futa-nb-from">' + esc(nbNotifSender) + '</b>' +
      '<button class="futa-nb-close" type="button" aria-label="Close">✕</button></div>' +
      '<div class="futa-nb-msg" id="futaNbMsg">' + esc(n.body || '') + '</div>' +
      '<div class="futa-nb-input"><input id="futaNbReply" type="text" placeholder="Reply…" maxlength="240">' +
      '<button class="futa-nb-send" type="button">Send</button></div>' +
      '<div class="futa-nb-hint" id="futaNbHint"></div>';
    nbNotifEl.querySelector('.futa-nb-close').onclick = () => hideNbNotification();
    nbNotifEl.querySelector('.futa-nb-send').onclick = () => sendNbReply();
    nbNotifEl.querySelector('#futaNbReply').onkeypress = (e) => { if (e.key === 'Enter') sendNbReply(); };
    // tap anywhere outside the input closes the panel (but keep the input tappable)
    nbNotifEl.onclick = (e) => { if (e.target.id === 'futaNbNotif') hideNbNotification(); };
    (document.body || document.documentElement).appendChild(nbNotifEl);
    setTimeout(() => nbNotifEl.classList.add('show'), 20);
    nbNotifEl.querySelector('#futaNbReply').focus();
  }
  function hideNbNotification() { if (nbNotifEl) { nbNotifEl.classList.remove('show'); setTimeout(() => { nbNotifEl.remove(); nbNotifEl = null; nbNotifMsg = null; nbNotifGrp = null; nbNotifSender = null; nbNotifFrom = null; }, 220); } }
  async function sendNbReply() {
    const inp = nbNotifEl ? nbNotifEl.querySelector('#futaNbReply') : null;
    if (!inp || !inp.value.trim()) return;
    const txt = inp.value.trim(); inp.disabled = true;
    const btn = nbNotifEl.querySelector('.futa-nb-send'); btn.disabled = true; btn.textContent = 'Sending…';
    try {
      const api = Ph.api(); if (!api) throw new Error('Not signed in.');
      // resolve my neighbour group id (it is cached in NB)
      const grp = NB && NB.id ? NB.id : (await api.rpc('ensure_neighbours')).id;
      await api.rpc('send_group_message', { p_group: grp, p_body: txt, p_reply_to: nbNotifMsg });
      inp.value = ''; hideNbNotification(); Ph.toast('Replied to ' + nbNotifSender);
    } catch (e) { inp.disabled = false; btn.disabled = false; btn.textContent = 'Send'; Ph.toast('Could not send: ' + nice(e)); }
  }
  Ph.on('user', (u) => { if (!u) { stopListeners(); outbox = []; } else startListeners(); });
  Ph.on('open', (id) => { chatOpen = id === 'chat' || id === 'neighbours'; if (chatOpen) syncSoon(); });   // counts are cleared per conversation as each one is opened
  g.FutaChat = { openWith(p) { if (!p || !p.id) return; Ph.show(true); Ph.open('chat', { peer: { id: p.id, username: p.username || 'Player' } }); } };

  /* demo data (device only) */
  const DEMO_PEOPLE = [{ user_id: 'd1', username: 'tola', relation: 'friends' }, { user_id: 'd2', username: 'amaka', relation: 'friends' }, { user_id: 'd3', username: 'segun', relation: 'none' }];
  const demoGroups = [];
  let demoSeeded = false;
  const seedDemo = () => { if (demoSeeded || !Ph.demo()) return; demoSeeded = true; demoGroups.push({ id: 'dg0', name: 'Library crew', role: 'member' }); U.dms = { d1: 3, d2: 120 }; U.groups = { dg0: 5 }; refresh(); };   // demo mode only: show what the counts look like
  setTimeout(seedDemo, 1200);

  const CHAT = {
    id: 'chat', name: 'Chat', icon: 'chat', color: ['#35b27a', '#0f5a3b'],
    mount(body, ctx) {
      const I = ctx.icons, demo = Ph.demo(), api = Ph.api(); seedDemo(); const bub = new Map(), dmIds = new Map(); let lastIn = '', chipsKind = '', u = Ph.getUser(), dead = false, tab = 'campus', ch = null, seen = new Set(), send = null, peer = null, group = null, panel = false, bld = null, searchT = 0;
      body.innerHTML = '<div class="ph-tabs"><button type="button" data-t="campus" class="on">Campus<i class="ph-tn" hidden></i></button><button type="button" data-t="neighbours">Neighbours<i class="ph-tn" hidden></i></button><button type="button" data-t="building" hidden>Building</button><button type="button" data-t="friends">Friends<i class="ph-tn" hidden></i></button><button type="button" data-t="groups">Groups<i class="ph-tn" hidden></i></button></div><div class="ph-log" aria-live="polite"></div><div class="ph-quick" hidden></div><div class="ph-replybar" hidden></div><form class="ph-send" autocomplete="off"><input maxlength="' + MAX + '" placeholder="Message…" enterkeyhint="send" aria-label="Message"><button aria-label="Send">' + I.send + '</button></form>';
      const log = body.querySelector('.ph-log'), quick = body.querySelector('.ph-quick'), form = body.querySelector('form'), inp = form.querySelector('input'), tabs = body.querySelectorAll('.ph-tabs button'), bTab = body.querySelector('[data-t=building]');
      const sb = () => api.sb(), rpc = (n, a) => api.rpc(n, a), rbar = body.querySelector('.ph-replybar'), msgs = new Map(); let replyTo = null;

      /* ---- small helpers ---- */
      const sysMsg = (t) => { const d = document.createElement('div'); d.className = 'ph-sys-msg'; d.textContent = t; log.appendChild(d); log.scrollTop = 1e9; return d; };
      const h = (t) => { const d = document.createElement('div'); d.className = 'ph-h'; d.textContent = t; log.appendChild(d); return d; };
      const list = () => { const w = document.createElement('div'); w.className = 'ph-list'; w.style.alignSelf = 'stretch'; log.appendChild(w); return w; };
      const mini = (label, fn, cls) => { const b = document.createElement('button'); b.type = 'button'; b.className = 'ph-mini' + (cls ? ' ' + cls : ''); b.textContent = label; b.onclick = (e) => { e.stopPropagation(); fn(b); }; return b; };
      const bigBtn = (label, fn, cls) => { const b = document.createElement('button'); b.type = 'button'; b.className = 'ph-btn' + (cls ? ' ' + cls : ''); b.textContent = label; b.style.alignSelf = 'stretch'; b.onclick = () => fn(b); log.appendChild(b); return b; };
      function row(name, sub, acts, onTap, cnt) {
        const d = document.createElement(onTap ? 'button' : 'div'); if (onTap) { d.type = 'button'; d.onclick = onTap; } d.className = 'ph-row';
        d.innerHTML = '<span class="ph-av" style="width:2.2em;height:2.2em;font-size:.9em"></span><span class="t"><b></b><small></small></span>';
        d.querySelector('.ph-av').textContent = (name || '?').charAt(0).toUpperCase(); d.querySelector('b').textContent = name || 'Player'; d.querySelector('small').textContent = sub || ''; if (cnt) { d.dataset.u = cnt.k + ':' + cnt.id; const pl = document.createElement('span'); pl.className = 'ph-un'; const n0 = ((cnt.k === 'dm' ? U.dms : U.groups)[cnt.id]) | 0; pl.hidden = !n0; pl.textContent = capN(n0); d.querySelector('.t').after(pl); d.classList.toggle('has-un', !!n0); } (acts || []).forEach(a => d.appendChild(a)); return d;
      }
      /* ---- replies (groups + neighbours) ---- */
      const quoteEl = (r) => { const q = document.createElement('div'), b = document.createElement('b'), t = document.createElement('span'); q.className = 'ph-quote'; b.textContent = r.username || 'Message'; t.textContent = String(r.body || '').slice(0, 80); q.append(b, t); return q; };
      function clearReply() { replyTo = null; rbar.hidden = true; rbar.innerHTML = ''; }
      function setReply(r) {
        replyTo = { id: r.id, username: r.username || 'Player', body: String(r.body || '').slice(0, 120) }; rbar.innerHTML = ''; rbar.hidden = false;
        const t = document.createElement('span'), x = document.createElement('button'); t.className = 'ph-rp-t'; t.append('↩ Replying to ');
        const b = document.createElement('b'); b.textContent = replyTo.username; t.append(b, ': ' + replyTo.body.slice(0, 50)); x.type = 'button'; x.textContent = '✕'; x.setAttribute('aria-label', 'Cancel reply'); x.onclick = clearReply; rbar.append(t, x); inp.focus();
      }

      /* ---- ticks: clock / ✓ / ✓✓ / ✓✓ light blue / red ! ---- */
      const TICKS = {
        pending: '<svg viewBox="0 0 16 11"><circle cx="8" cy="5.5" r="4.3"/><path d="M8 3.3v2.4l1.6 1"/></svg>',
        failed: '<svg viewBox="0 0 16 11"><circle cx="8" cy="5.5" r="4.6"/><path d="M8 3.2v2.9M8 7.9v.2"/></svg>',
        sent: '<svg viewBox="0 0 16 11"><polyline points="3,6 6,9 12,2"/></svg>',
        delivered: '<svg viewBox="0 0 16 11"><polyline points="1.5,6 4.5,9 10.5,2"/><polyline points="6.2,8.2 6.9,9 13.5,2"/></svg>'
      }; TICKS.seen = TICKS.delivered;
      const LABEL = { pending: 'Sending', failed: 'Not sent. Tap to retry', sent: 'Sent', delivered: 'Delivered', seen: 'Seen' };
      function setStatus(b, st) {
        if (!b || !b.tick || b.st === st || b.st === 'seen' || (b.st === 'delivered' && (st === 'sent' || st === 'pending'))) return; b.st = st;
        b.tick.dataset.s = st; b.tick.innerHTML = TICKS[st]; b.tick.setAttribute('aria-label', LABEL[st]); b.tick.title = LABEL[st]; b.el.classList.toggle('failed', st === 'failed');
        const old = b.el.querySelector('.ph-retry'); if (st === 'failed' && !old) { const r = document.createElement('button'); r.type = 'button'; r.className = 'ph-retry'; r.textContent = 'Not sent · Tap to retry'; b.el.insertBefore(r, b.el.querySelector('.ph-meta')); } else if (st !== 'failed' && old) old.remove();
      }
      const stOf = (m, kind) => kind === 'd' ? (m.read_at ? 'seen' : m.delivered_at ? 'delivered' : 'sent') : 'sent';
      function addMeta(d, st, ts) {
        const meta = document.createElement('span'), t = document.createElement('time'), tk = document.createElement('span'); meta.className = 'ph-meta'; tk.className = 'ph-tick'; tk.setAttribute('role', 'img');
        try { t.textContent = new Date(ts || Date.now()).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }); } catch (e) { /* no time */ } meta.appendChild(t); meta.appendChild(tk); d.appendChild(meta);
        const b = { el: d, tick: tk, st: '' }; setStatus(b, st); return b;
      }
      /* a message I am sending right now (draws the clock, then sent / failed as the outbox reports) */
      function outBubble(rec) {
        const d = document.createElement('div'); d.className = 'ph-msg me'; if (rec.reply) d.appendChild(quoteEl(rec.reply)); d.appendChild(document.createTextNode(rec.text)); const b = addMeta(d, inflight.has(rec.cid) || !rec.failed ? 'pending' : 'failed', rec.ts); b.rec = rec; b.k = rec.k;
        d.onclick = () => { if (b.st === 'failed') deliver(rec); }; bub.set(rec.cid, b); log.appendChild(d); log.scrollTop = 1e9; return b;
      }
      const H = hooks = {
        state(rec, st, id, err) {
          const b = bub.get(rec.cid);
          if (st === 'rejected') { if (b) { b.el.remove(); bub.delete(rec.cid); if (!inp.value) inp.value = rec.text; } Ph.toast(nice(err)); return; }
          if (!b) return; if (st === 'sent') { b.id = id; seen.add(rec.k + id); if (rec.k === 'd') { dmIds.set(id, b); catchUp(id, b); } }
          rec.failed = st === 'failed'; setStatus(b, st);
        }
      };
      async function catchUp(id, b) {   // the "delivered / seen" update may have arrived before we knew the message id
        try { const { data } = await sb().from('dms').select('delivered_at,read_at').eq('id', id).maybeSingle(); if (data && !dead) setStatus(b, data.read_at ? 'seen' : data.delivered_at ? 'delivered' : 'sent'); } catch (e) { /* ticks are cosmetic */ }
      }
      tickHandler = (r) => { const b = dmIds.get(r.id); if (b) setStatus(b, r.read_at ? 'seen' : r.delivered_at ? 'delivered' : 'sent'); };
      const sel = async (table, full, base, f) => { let r = await f(sb().from(table).select(full)); if (r.error && /client_id|delivered_at|read_at|kind|amount|reply_to/.test(r.error.message || '')) r = await f(sb().from(table).select(base)); return r; };   // works before 14/15 SQL is run
      const cidsOf = (rows) => new Set((rows || []).map(x => x.client_id).filter(Boolean));
      /* unsent messages of THIS conversation reappear (red or sending) when you come back to it; the outbox retries them */
      function restorePending(scope, loaded) {
        outbox.filter(x => x.scope === scope && !bub.has(x.cid) && !(loaded && loaded.has(x.cid))).forEach(x => { x.failed = !inflight.has(x.cid); outBubble(x); }); flush();
      }
      function line(m, mine, kind) {
        if (mine && m.client_id && bub.has(m.client_id)) { const b = bub.get(m.client_id); if (m.id != null) { b.id = m.id; seen.add(kind + m.id); if (kind === 'd') dmIds.set(m.id, b); } setStatus(b, stOf(m, kind)); return; }   // the echo of a message I just sent
        if (m.id != null) { const k = kind + m.id; if (seen.has(k)) return; seen.add(k); }
        if (m.kind === 'money') return moneyLine(m, mine);
        const d = document.createElement('div'); d.className = 'ph-msg' + (mine ? ' me' : '');
        if (!mine) { lastIn = String(m.body || ''); suggest(); }
        if (!mine && m.username) { const s = document.createElement('small'); s.textContent = m.username; if (m.user_id && g.FutaProfile) { s.className = 'ph-who'; s.title = 'View profile'; s.onclick = () => showProfile({ id: m.user_id, username: m.username }); } d.appendChild(s); }
        if (kind === 'g' && m.id != null) msgs.set(m.id, { username: m.username || (mine ? 'You' : 'Player'), body: m.body });
        if (kind === 'g' && m.reply_to) d.appendChild(quoteEl(msgs.get(m.reply_to) || { username: 'Earlier message', body: '' }));
        d.appendChild(document.createTextNode(m.body));
        if (kind === 'g' && m.id != null) { const rb = document.createElement('button'); rb.type = 'button'; rb.className = 'ph-rpb'; rb.textContent = '↩ Reply'; rb.setAttribute('aria-label', 'Reply to ' + (m.username || 'message')); rb.onclick = (e) => { e.stopPropagation(); setReply({ id: m.id, username: mine ? 'yourself' : m.username, body: m.body }); }; d.appendChild(rb); }
        if (mine) { const b = addMeta(d, stOf(m, kind), m.created_at); b.id = m.id; if (kind === 'd' && m.id != null) dmIds.set(m.id, b); }
        log.appendChild(d); while (log.children.length > 80) log.firstChild.remove(); log.scrollTop = 1e9;
      }
      function reset(showForm, placeholder) {
        try { ch && ch.unsubscribe(); } catch (e) { } ch = null; dmHandler = null; grpHandler = null; peer = null; group = null; panel = false; send = null; seen = new Set(); bub.clear(); dmIds.clear(); msgs.clear(); clearReply(); log.innerHTML = ''; lastIn = ''; chipsKind = ''; quick.hidden = true; quick.innerHTML = '';
        form.style.display = showForm ? '' : 'none'; if (placeholder) inp.placeholder = placeholder; ctx.setTitle('Chat');
      }
      const needSignIn = () => { reset(false); sysMsg('Sign in to chat with other players.'); };
      const lock = (b, t) => { b.disabled = true; if (t) b.textContent = t; };

      /* ---- QUICK REPLIES: chips that answer the last message (or open the conversation) ---- */
      const QUICK = {
        hello: ['Hey! 👋', 'How far? 😄', 'I dey o, you?', 'Good day 🙏'], thanks: ['You’re welcome 🙏', 'No wahala 😊', 'Anytime!'], bye: ['Take care 👋', 'See you soon!', 'Later! ✌️'],
        laugh: ['😂😂', 'Hahaha 😭', 'Omo 😂'], question: ['Yes 👍', 'No wahala', 'Not now, later', 'Let me check 🤔'], money: ['Thank you so much! 🙏', 'Received ✅', 'God bless you 🙌', 'You’re a legend 🔥'],
        any: ['👍', 'Okay 👌', 'Nice! 🔥', 'I dey come', 'Alright'],
        room: ['Hi everyone 👋', 'Anyone around?', 'Good day, campus! 🎓', 'Who dey library?'], building: ['Hi everyone 👋', 'Nice place! 😍', 'Anyone here for a chat?'], dm: ['Hey! 👋', 'How far?', 'You dey? 😄'], group: ['Hi team 👋', 'What’s up?', 'Anyone free?']
      };
      const hourNG = () => (new Date().getUTCHours() + 1) % 24;   // Nigeria time (WAT = UTC+1)
      const timeGreet = () => { const h = hourNG(); return h >= 5 && h < 12 ? 'Good morning ☀️' : h >= 12 && h < 17 ? 'Good afternoon 🌤️' : h >= 17 && h < 22 ? 'Good evening 🌙' : 'Hello 🌙'; };
      const uniq = (a) => a.filter((x, i) => a.indexOf(x) === i);
      function pickChips() {
        const t = lastIn.toLowerCase(), base = peer ? 'dm' : group ? 'group' : tab === 'building' ? 'building' : 'room', tg = timeGreet(), neigh = !!(group && group.neighbour);
        if (!t) return neigh ? [tg, 'Hi neighbours 👋', 'How una dey? 😄', 'Hope your day is going well 🙏'] : uniq([tg].concat(QUICK[base]));
        if (t === '__money__') return QUICK.money;
        if (/\b(thank|thanks|thx|tnx|appreciate)\b/.test(t)) return QUICK.thanks;
        if (/\b(here you go|i sent|just sent|sent it|i got you|take it|you can have|i brought|brought you|i helped|it'?s on me|i('| wi)ll share|shared (it|the)|no wahala, (i|it))\b/.test(t)) return ['Thank you so much! 🙏', 'Thanks, I appreciate it 🙌', 'God bless you 🙏', 'You’re a star ⭐'];
        if (/\bwelcome\b/.test(t) && !/you'?re welcome|you are welcome/.test(t)) return ['Thank you! 😊', 'Glad to be here 🙌', 'Happy to meet you all 👋'];
        if (/\bgood ?night\b/.test(t)) return ['Good night 😴 sleep well', 'Night night 🌙', 'Sleep well! 💤'];
        if (/\bgood morning\b|\bmorning\b/.test(t)) return ['Good morning! ☀️ Hope you slept well', 'Morning o! 😄', 'Good morning 🙏 have a great day'];
        if (/\bgood afternoon\b|\bafternoon\b/.test(t)) return ['Good afternoon! 🌤️ How’s your day?', 'Afternoon o! 😄', 'Good afternoon 🙏'];
        if (/\bgood evening\b|\bevening\b/.test(t)) return ['Good evening! 🌙 How was your day?', 'Evening o! 😄', 'Good evening 🙏'];
        if (/\b(thank|thanks|thx|tnx|appreciate)\b/.test(t)) return QUICK.thanks;
        if (/\b(bye|goodnight|good night|see you|later|ttyl|cya)\b/.test(t)) return QUICK.bye;
        if (/(^|\b)(hi|hello|hey|yo|howdy|sup|wassup|how far|good day|what'?s up|how una dey)\b/.test(t)) return uniq([/^Good/.test(tg) ? tg : 'Hey! 👋'].concat(QUICK.hello));
        if (/(lol|lmao|haha|😂|🤣)/.test(t)) return QUICK.laugh;
        if (/\?|\b(where|when|what|who|why|how|can you|do you|are you|wanna|want to)\b/.test(t)) return QUICK.question;
        return QUICK.any;
      }
      function suggest() {
        if (!send || panel || profBox || inp.value) { quick.hidden = true; return; }
        const set = pickChips(); quick.innerHTML = '';
        set.slice(0, 4).forEach(txt => { const b = document.createElement('button'); b.type = 'button'; b.textContent = txt; b.onclick = () => submitText(txt); quick.appendChild(b); });
        quick.hidden = !set.length; quick.scrollLeft = 0;
      }
      inp.addEventListener('input', () => { if (inp.value) quick.hidden = true; else suggest(); });
      function submitText(t) {
        t = String(t || '').trim().slice(0, MAX); if (!t || !u || !send) return; quick.hidden = true;
        const plan = send(t); if (!plan) return;
        if (plan.demo) { plan.demo(t); clearReply(); lastIn = ''; suggest(); return; }                      // demo mode: fake ticks, no server
        if (outbox.length >= OB_MAX) { Ph.toast('Too many unsent messages. Check your connection.'); return; }
        const rec = { cid: uuid(), k: plan.k, n: plan.n, a: plan.a, scope: plan.scope, text: t, ts: Date.now(), reply: plan.reply || null }; clearReply();
        outbox.push(rec); obSave(); outBubble(rec); deliver(rec); lastIn = ''; suggest();
      }
      /* demo mode only: walk a fake message through the ticks so you can see them */
      function demoOut(t, k, then) {
        const rec = { cid: uuid(), k, text: t, ts: Date.now(), reply: replyTo }, b = outBubble(rec); const at = (ms, st) => setTimeout(() => { if (!dead) setStatus(b, st); }, ms);
        at(350, 'sent'); if (k === 'd') { at(1300, 'delivered'); at(2600, 'seen'); } if (then) setTimeout(() => { if (!dead) then(); }, 900);
      }
      const num = (n) => '₦' + Number(n || 0).toLocaleString('en-NG');
      function moneyLine(m, mine) {   // gold bubble: "You sent ₦5,000" / "tola sent you ₦5,000" (+ note)
        if (m.id != null) { const k = 'm' + m.id; if (seen.has(k)) return; seen.add(k); }
        const amt = Number(m.amount) || 0, note = /—/.test(m.body || '') ? String(m.body).split('—').slice(1).join('—').trim() : '';
        const d = document.createElement('div'); d.className = 'ph-msg money' + (mine ? ' me' : ''); const sp = document.createElement('span'), b = document.createElement('b'); sp.textContent = mine ? '💸 You sent' : '💸 ' + ((peer && peer.username) || 'They') + ' sent you'; b.textContent = num(amt); d.appendChild(sp); d.appendChild(b);
        if (note) { const em = document.createElement('em'); em.textContent = '“' + note + '”'; d.appendChild(em); }
        log.appendChild(d); log.scrollTop = 1e9; if (!mine) { lastIn = '__money__'; suggest(); }
      }
      /* ---- Send money (friends only; the server checks friendship, limits and balance) ---- */
      async function moneySheet(f) {
        const sh = document.createElement('div'); sh.className = 'ph-sheet'; sh.innerHTML = '<div class="mn-sheet"><h3></h3><p class="mn-lead"></p><div data-body></div></div>';
        body.closest('.ph-screen').appendChild(sh); const close = () => sh.remove(); sh.onclick = (e) => { if (e.target === sh) close(); };
        sh.querySelector('h3').textContent = 'Send money to ' + (f.username || 'friend'); const lead = sh.querySelector('.mn-lead'), box = sh.querySelector('[data-body]'); lead.textContent = 'Loading…';
        let info = { min: 100, max: 500000, leftToday: 0, countLeft: 0, bank: 0 };
        if (demo) info = { min: 100, max: 500000, leftToday: 2000000, countLeft: 10, bank: 250000 }; else { try { info = await rpc('get_transfer_info'); } catch (e) { lead.textContent = nice(e); return; } }
        if (dead) return; lead.textContent = 'From your bank: ' + num(info.bank) + ' · you can still send ' + num(Math.min(info.leftToday, info.max)) + ' today';
        box.innerHTML = '<input class="mn-amt" inputmode="numeric" pattern="[0-9]*" maxlength="9" placeholder="₦ Amount" aria-label="Amount"><div class="mn-q"></div><input maxlength="40" placeholder="Add a note (optional)" aria-label="Note"><div class="mn-err" role="alert"></div><button class="ph-btn gold" type="button" data-go>Review</button><button class="ph-btn" type="button" data-n>Cancel</button>';
        const amt = box.querySelector('.mn-amt'), note = box.querySelectorAll('input')[1], err = box.querySelector('.mn-err'), go = box.querySelector('[data-go]'), q = box.querySelector('.mn-q'); box.querySelector('[data-n]').onclick = close;
        [1000, 5000, 10000, 50000].filter(n => n <= info.max).forEach(n => { const b = document.createElement('button'); b.type = 'button'; b.textContent = num(n); b.onclick = () => { amt.value = String(n); err.textContent = ''; }; q.appendChild(b); });
        amt.oninput = () => { amt.value = amt.value.replace(/[^0-9]/g, ''); err.textContent = ''; };
        go.onclick = () => {
          const n = parseInt(amt.value, 10) || 0;
          if (n < info.min) { err.textContent = 'The smallest amount is ' + num(info.min) + '.'; return; } if (n > info.max) { err.textContent = 'You can send up to ' + num(info.max) + ' at a time.'; return; }
          if (n > info.bank) { err.textContent = 'Not enough money in your bank. Deposit at an ATM first.'; return; } if (n > info.leftToday || info.countLeft < 1) { err.textContent = 'That is over today’s sending limit.'; return; }
          const nt = note.value.trim(); box.innerHTML = '<div class="mn-sum"></div><p class="mn-lead">Money moves from your bank to theirs straight away. You can’t undo it.</p><button class="ph-btn gold" type="button" data-ok>Send it</button><button class="ph-btn" type="button" data-b>Back</button>';
          box.querySelector('.mn-sum').textContent = num(n) + ' → ' + (f.username || 'friend') + (nt ? ' · “' + nt + '”' : ''); const ok = box.querySelector('[data-ok]');
          box.querySelector('[data-b]').onclick = () => { close(); moneySheet(f); };
          ok.onclick = async () => {
            ok.disabled = true; ok.textContent = 'Sending…';
            try {
              if (!demo) await rpc('send_money', { p_to: f.id, p_amount: n, p_note: nt || null }); close();
              moneyLine({ body: '💸 Sent ' + num(n) + (nt ? ' — ' + nt : ''), amount: n, kind: 'money' }, true); Ph.toast('Sent ' + num(n) + ' to ' + (f.username || 'your friend')); if (!demo) Ph.refreshUser();
            } catch (e) { ok.disabled = false; ok.textContent = 'Send it'; Ph.toast(nice(e)); }
          };
        };
      }
      g.FutaChat.onMoney = (r) => { if (!dead && peer && r.from_user === peer.id) { try { Ph.api().rpc('mark_notifications_read'); } catch (e) { } } };

      /* ---- Campus + Building: both are "rooms" ---- */
      async function openRoom(room, hint) {
        reset(true, hint); if (!u) return needSignIn(); form.style.display = '';
        if (demo) { sysMsg('Demo chat — messages stay on this device.'); [['Tola', 'Anyone heading to the library?'], ['Amaka', 'Cafeteria jollof is sold out again 😩'], ['Segun', 'Welcome to FUTAlife!']].forEach(([n, b]) => line({ username: n, body: b })); send = () => ({ demo: (t) => demoOut(t, 'r', () => line({ username: 'Tola', body: ['Haha true 😂', 'See you there!', 'Omo, same here'][Math.random() * 3 | 0] })) }); return; }
        send = (t) => ({ k: 'r', n: 'send_room_message', a: { p_room: room, p_body: t }, scope: 'r:' + room });
        try {
          const { data, error } = await sel('room_messages', 'id,user_id,username,body,client_id,created_at', 'id,user_id,username,body,created_at', (q) => q.eq('room', room).order('id', { ascending: false }).limit(40)); if (error) throw error; if (dead || tab !== (room === ROOM ? 'campus' : 'building')) return;
          (data || []).reverse().forEach(r => line(r, r.user_id === u.id, 'r')); if (room === ROOM) { csSet(data && data.length ? Math.max.apply(null, data.map(r => +r.id || 0)) : 0); U.campus = 0; refresh(); } if (!data || !data.length) sysMsg('No messages yet. Say hi 👋'); restorePending('r:' + room, cidsOf(data)); suggest();
          ch = sb().channel('phone:room:' + room).on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'room_messages', filter: 'room=eq.' + room }, (m) => { if (m.new) { line(m.new, m.new.user_id === u.id, 'r'); if (room === ROOM) csSet(m.new.id); } }).subscribe();
        } catch (e) { sysMsg('Could not load chat: ' + nice(e)); }
      }
      /* the Building tab exists only while the server says we are inside a building */
      async function refreshBuilding() {
        bld = null; if (u && !demo) { try { const { data } = await sb().from('player_stats').select('building,updated_at').eq('id', u.id).maybeSingle(); if (data && data.building && Date.now() - new Date(data.updated_at).getTime() < FRESH_MS) bld = 'int_' + String(data.building).toLowerCase() + '_1'; } catch (e) { /* no tab */ } }
        if (dead) return; bTab.hidden = !bld; if (!bld && tab === 'building') go('campus');
      }

      /* ---- Friends: search + wave requests + DMs ---- */
      async function openFriends() {
        reset(false); if (!u) return needSignIn();
        const s = document.createElement('label'); s.className = 'ph-search'; s.style.margin = '0'; s.style.alignSelf = 'stretch'; s.innerHTML = '<span style="width:1.1em;height:1.1em;display:inline-flex;flex:none;stroke:#9a927d;fill:none;stroke-width:2;stroke-linecap:round">' + I.search + '</span><input type="search" maxlength="20" placeholder="Find a player by username" autocomplete="off" aria-label="Search players">'; log.appendChild(s);
        const results = document.createElement('div'); results.style.alignSelf = 'stretch'; log.appendChild(results); const sInp = s.querySelector('input');
        sInp.oninput = () => { clearTimeout(searchT); const q = sInp.value.trim(); if (q.length < 2) { results.innerHTML = ''; return; } searchT = setTimeout(() => runSearch(q, results, (p, cell) => personActions(p, cell)), 300); };
        const rest = document.createElement('div'); rest.style.cssText = 'align-self:stretch'; log.appendChild(rest);
        if (!demo) { const al = document.createElement('div'); al.style.alignSelf = 'stretch'; log.insertBefore(al, rest); loadAlerts(al); }
        if (demo) { const l = document.createElement('div'); l.className = 'ph-list'; DEMO_PEOPLE.filter(p => p.relation === 'friends').sort((a, b) => (U.dms[b.user_id] | 0) - (U.dms[a.user_id] | 0)).forEach(p => l.appendChild(row(p.username, 'Tap to chat', [profBtn({ id: p.user_id, username: p.username })], () => openDm({ id: p.user_id, username: p.username }), { k: 'dm', id: p.user_id }))); rest.appendChild(l); return; }
        try {
          const w = await sb().from('waves').select('id,from_user,to_user,status'); if (w.error) throw w.error; if (dead || tab !== 'friends' || peer) return;
          const rows = w.data || [], incoming = rows.filter(x => x.status === 'pending' && x.to_user === u.id), friendIds = [...new Set(rows.filter(x => x.status === 'accepted').map(x => x.from_user === u.id ? x.to_user : x.from_user))];
          const ids = [...new Set(incoming.map(x => x.from_user).concat(friendIds))], names = {};
          if (ids.length) { const p = await sb().from('profiles').select('id,username').in('id', ids); if (p.error) throw p.error; (p.data || []).forEach(x => { names[x.id] = x.username; }); }
          if (dead || tab !== 'friends' || peer) return;
          if (incoming.length) { const hh = document.createElement('div'); hh.className = 'ph-h'; hh.textContent = 'Wave requests'; rest.appendChild(hh); const l = document.createElement('div'); l.className = 'ph-list'; rest.appendChild(l);
            incoming.forEach(x => { const r = row(names[x.from_user] || 'Player', 'waved at you', [], null); r.appendChild(mini('Accept', (b) => rpc('respond_wave', { p_id: x.id, p_accept: true }).then(() => { r.remove(); Ph.toast('You can message ' + (names[x.from_user] || 'them') + ' now.'); openFriends(); }).catch(e => Ph.toast(nice(e))), 'gold')); r.appendChild(mini('Ignore', () => rpc('respond_wave', { p_id: x.id, p_accept: false }).then(() => r.remove()).catch(e => Ph.toast(nice(e))))); l.appendChild(r); }); }
          const hh = document.createElement('div'); hh.className = 'ph-h'; hh.textContent = 'Friends'; rest.appendChild(hh);
          if (!friendIds.length) { const n = document.createElement('div'); n.className = 'ph-note'; n.textContent = 'No friends yet. Search above, or wave at someone in the world. When they wave back you can chat here.'; rest.appendChild(n); return; }
          const l = document.createElement('div'); l.className = 'ph-list'; rest.appendChild(l); friendIds.slice().sort((a, b) => (U.dms[b] | 0) - (U.dms[a] | 0)).forEach(id => { const f = { id, username: names[id] || 'Player' }; l.appendChild(row(f.username, 'Tap to chat', [profBtn(f)], () => openDm(f), { k: 'dm', id })); });
        } catch (e) { sysMsg('Could not load friends: ' + nice(e)); }
      }
      /* Alerts: recent money received (kept 30 days on the server). Showing them marks them read and clears the phone badge. */
      async function loadAlerts(box) {
        try {
          const { data, error } = await sb().from('notifications').select('id,from_user,title,body,amount,read_at,created_at').eq('kind', 'money').order('id', { ascending: false }).limit(6); if (error || dead || tab !== 'friends' || peer || !data || !data.length) return;
          const ids = [...new Set(data.map(x => x.from_user).filter(Boolean))], names = {}; if (ids.length) { const p = await sb().from('profiles').select('id,username').in('id', ids); (p.data || []).forEach(x => { names[x.id] = x.username; }); } if (dead || tab !== 'friends' || peer) return;
          const hh = document.createElement('div'); hh.className = 'ph-h'; hh.textContent = 'Alerts'; box.appendChild(hh); const l = document.createElement('div'); l.className = 'ph-list'; box.appendChild(l);
          data.forEach(x => { const f = x.from_user ? { id: x.from_user, username: names[x.from_user] || 'Player' } : null, ago = Math.max(1, Math.round((Date.now() - new Date(x.created_at).getTime()) / 60000)), when = ago < 60 ? ago + ' min ago' : ago < 1440 ? Math.round(ago / 60) + ' h ago' : Math.round(ago / 1440) + ' d ago';
            const r = row('💸 ' + x.title, (x.body ? '“' + x.body + '” · ' : '') + when + (x.read_at ? '' : ' · new'), [], f ? () => openDm(f) : null); if (!x.read_at) r.style.borderColor = 'var(--gold)'; l.appendChild(r); });
          rpc('mark_notifications_read').then(() => { U.alerts = 0; refresh(); }).catch(() => { });
        } catch (e) { /* alerts are optional */ }
      }
      async function runSearch(q, out, actions) {
        try {
          const rows = demo ? DEMO_PEOPLE.filter(p => p.username.indexOf(q.toLowerCase()) >= 0) : await rpc('search_players', { p_query: q }); if (dead) return; out.innerHTML = '';
          if (!rows || !rows.length) { const n = document.createElement('div'); n.className = 'ph-note'; n.textContent = 'No players found.'; out.appendChild(n); return; }
          const l = document.createElement('div'); l.className = 'ph-list'; out.appendChild(l); rows.forEach(p => { const r = row(p.username, p.relation === 'friends' ? 'Friend' : p.relation === 'waved' ? 'You waved' : p.relation === 'incoming' ? 'Waved at you' : '', [], null); actions(p, r); l.appendChild(r); });
        } catch (e) { out.innerHTML = ''; const n = document.createElement('div'); n.className = 'ph-note'; n.textContent = nice(e); out.appendChild(n); }
      }
      /* search result buttons: names only — you can message only after waving */
      function personActions(p, r) {
        const f = { id: p.user_id, username: p.username }; r.appendChild(profBtn(f));
        if (p.relation === 'friends') { r.appendChild(mini('Message', () => openDm(f), 'gold')); return; }
        if (p.relation === 'waved') { const b = mini('Waved ✓', () => { }); b.disabled = true; r.appendChild(b); return; }
        r.appendChild(mini(p.relation === 'incoming' ? 'Wave back' : '👋 Wave', (b) => { if (demo) { lock(b, 'Waved ✓'); return; } rpc('send_wave', { p_to: p.user_id }).then(x => { if (x && x.status === 'accepted') { b.remove(); r.appendChild(mini('Message', () => openDm(f), 'gold')); Ph.toast('Connected! You can message ' + p.username + '.'); } else lock(b, 'Waved ✓'); }).catch(e => Ph.toast(nice(e))); }, 'gold'));
      }
      /* open a conversation with someone (also the entry point for FutaChat.openWith) */
      async function openPeer(p) {
        if (demo) return openDm(p); if (!u) { setTab('friends'); return needSignIn(); }
        try { const { data, error } = await sb().from('waves').select('status').or('and(from_user.eq.' + u.id + ',to_user.eq.' + p.id + '),and(from_user.eq.' + p.id + ',to_user.eq.' + u.id + ')'); if (error) throw error; if ((data || []).some(x => x.status === 'accepted')) return openDm(p); } catch (e) { /* fall through to the wave screen */ }
        reset(false); peer = p; ctx.setTitle(p.username || 'Chat'); sysMsg('You and ' + (p.username || 'this player') + ' are not connected yet. Wave first. Once they wave back, you can message each other.');
        bigBtn('👋 Wave at ' + (p.username || 'them'), (b) => rpc('send_wave', { p_to: p.id }).then(x => { if (x && x.status === 'accepted') openDm(p); else { lock(b, 'Wave sent ✓'); } }).catch(e => Ph.toast(nice(e))), 'gold');
      }
      async function openDm(f) {
        reset(true, 'Message ' + (f.username || 'friend') + '…'); peer = f; ctx.setTitle(f.username || 'Chat');
        { const pb = document.createElement('div'); pb.style.cssText = 'align-self:stretch;display:flex;justify-content:flex-end'; pb.style.gap = '.4em'; pb.appendChild(mini('₦ Send money', () => moneySheet(f), 'gold')); pb.appendChild(mini('👤 Profile', () => showProfile(f))); log.appendChild(pb); }
        dmHandler = (d) => { if (peer && d.sender === peer.id) { line({ id: d.id, body: d.body, kind: d.kind, amount: d.amount }, false, 'd'); if (canSee()) markRead(peer.id); else if (d.kind !== 'money') addDm(d.sender); return true; } return false; };
        if (demo) { clearDm(f.id); line({ body: 'Hey! 👋', username: f.username }); send = () => ({ demo: (t) => demoOut(t, 'd') }); suggest(); return; }
        send = (t) => ({ k: 'd', n: 'send_dm', a: { p_to: f.id, p_body: t }, scope: 'd:' + f.id });
        try {
          const own = 'and(sender.eq.' + u.id + ',recipient.eq.' + f.id + '),and(sender.eq.' + f.id + ',recipient.eq.' + u.id + ')';
          const { data, error } = await sel('dms', 'id,sender,recipient,body,kind,amount,client_id,delivered_at,read_at,created_at', 'id,sender,recipient,body,created_at', (q) => q.or(own).order('id', { ascending: false }).limit(40)); if (error) throw error; if (dead || !peer || peer.id !== f.id) return;
          (data || []).reverse().forEach(d => line({ id: d.id, body: d.body, kind: d.kind, amount: d.amount, client_id: d.client_id, delivered_at: d.delivered_at, read_at: d.read_at, created_at: d.created_at }, d.sender === u.id, 'd'));
          if (!data || !data.length) sysMsg('Say hi to ' + (f.username || 'your friend') + ' 👋'); restorePending('d:' + f.id, cidsOf(data)); suggest(); if (canSee()) markRead(f.id);
        } catch (e) { sysMsg('Could not load messages: ' + nice(e)); }
      }

      /* ---- Groups ---- */
      async function openGroups() {
        reset(false); if (!u) return needSignIn();
        const mk = document.createElement('div'); mk.style.alignSelf = 'stretch'; log.appendChild(mk);
        const showForm = () => { mk.innerHTML = ''; const f = document.createElement('form'); f.className = 'ph-search'; f.style.margin = '0'; f.innerHTML = '<input maxlength="30" placeholder="Group name" aria-label="Group name"><button type="submit" class="ph-mini gold">Create</button>'; mk.appendChild(f); const gi = f.querySelector('input'); gi.focus();
          f.onsubmit = (e) => { e.preventDefault(); const nm = gi.value.trim(); if (nm.length < 2) return; if (demo) { const d = { id: 'dg' + (demoGroups.length + 1), name: nm, role: 'owner' }; demoGroups.push(d); return openGroup(d, true); } rpc('create_group', { p_name: nm }).then(id => openGroup({ id, name: nm, role: 'owner' }, true)).catch(er => Ph.toast(nice(er))); }; };
        mk.appendChild(mini('＋ New group', showForm, 'gold'));
        if (demo) { h('Your groups'); const l = list(); if (!demoGroups.length) { const n = document.createElement('div'); n.className = 'ph-note'; n.textContent = 'Demo groups stay on this device.'; log.appendChild(n); } demoGroups.forEach(d => l.appendChild(row(d.name, 'Tap to open', [], () => openGroup(d), { k: 'grp', id: d.id }))); return; }
        try {
          const m = await sb().from('group_members').select('group_id,status,role').eq('user_id', u.id).in('status', ['invited', 'member']); if (m.error) throw m.error; if (dead || tab !== 'groups' || group) return;
          m.data = (m.data || []).filter(x => !(NB && x.group_id == NB.id)); const ids = (m.data || []).map(x => x.group_id), info = {};   // the neighbour group has its own tab
          
          if (ids.length) { const gr = await sb().from('chat_groups').select('id,name').in('id', ids); if (gr.error) throw gr.error; (gr.data || []).forEach(x => { info[x.id] = x.name; }); }
          if (dead || tab !== 'groups' || group) return;
          const inv = (m.data || []).filter(x => x.status === 'invited'), mem = (m.data || []).filter(x => x.status === 'member');
          if (inv.length) { h('Invites'); const l = list(); inv.forEach(x => { const r = row(info[x.group_id] || 'Group', 'invited you', [], null); r.appendChild(mini('Join', () => rpc('respond_group_invite', { p_group: x.group_id, p_accept: true }).then(() => openGroups()).catch(e => Ph.toast(nice(e))), 'gold')); r.appendChild(mini('No', () => rpc('respond_group_invite', { p_group: x.group_id, p_accept: false }).then(() => r.remove()).catch(e => Ph.toast(nice(e))))); l.appendChild(r); }); }
          h('Your groups'); if (!mem.length) { const n = document.createElement('div'); n.className = 'ph-note'; n.textContent = 'No groups yet. Tap “New group”, then add people you know.'; log.appendChild(n); return; }
          const l = list(); mem.slice().sort((a, b) => (U.groups[b.group_id] | 0) - (U.groups[a.group_id] | 0)).forEach(x => l.appendChild(row(info[x.group_id] || 'Group', x.role === 'owner' ? 'You started this group' : 'Tap to open', [], () => openGroup({ id: x.group_id, name: info[x.group_id] || 'Group', role: x.role }), { k: 'grp', id: x.group_id })));
        } catch (e) { sysMsg('Could not load groups: ' + nice(e)); }
      }
      async function openGroup(gr, addNow) {
        reset(true, gr.neighbour ? 'Message your neighbours…' : 'Message the group…'); group = gr; ctx.setTitle((gr.neighbour ? '🏘️ ' : '') + (gr.name || 'Group'));
        const bar = document.createElement('div'); bar.style.cssText = 'display:flex;gap:.4em;align-self:stretch;flex-wrap:wrap'; bar.appendChild(mini('👥 People', () => openPanel('members'))); if (!gr.neighbour) { bar.appendChild(mini('＋ Add', () => openPanel('add'), 'gold')); bar.appendChild(mini('Leave', () => { if (!confirm('Leave this group?')) return; (demo ? Promise.resolve(demoGroups.splice(demoGroups.indexOf(gr), 1)) : rpc('leave_group', { p_group: gr.id })).then(() => setTab('groups')).catch(e => Ph.toast(nice(e))); })); } log.appendChild(bar);
        if (gr.neighbour) { const n = document.createElement('div'); n.className = 'ph-note'; n.textContent = 'Your neighbours: a small group of players put together at random. Say hi with one tap, and use ↩ Reply under any message.'; log.appendChild(n); }
        grpHandler = (r) => { if (group && r.group_id === group.id) { line({ id: r.id, user_id: r.user_id, username: r.username, body: r.body, reply_to: r.reply_to }, false, 'g'); if (canSee()) markGroup(group.id); else addGrp(group.id); return true; } return false; };
        if (demo) { clearGrp(gr.id); send = () => ({ demo: (t) => demoOut(t, 'g') }); if (gr.neighbour) { line({ id: 'n1', username: 'tola', body: 'Good morning neighbours ☀️' }, false, 'g'); line({ id: 'n2', username: 'amaka', body: 'Morning! Who has a spare charger?' }, false, 'g'); } else sysMsg('Demo group — only you are here.'); suggest(); if (addNow) openPanel('add'); return; }
        send = (t) => ({ k: 'g', n: 'send_group_message', a: Object.assign({ p_group: gr.id, p_body: t }, replyTo ? { p_reply_to: replyTo.id } : {}), scope: 'g:' + gr.id, reply: replyTo });
        try {
          const { data, error } = await sel('group_messages', 'id,user_id,username,body,client_id,created_at,reply_to', 'id,user_id,username,body,created_at', (q) => q.eq('group_id', gr.id).order('id', { ascending: false }).limit(40)); if (error) throw error; if (dead || !group || group.id !== gr.id) return;
          (data || []).reverse().forEach(r => line(r, r.user_id === u.id, 'g')); if (!data || !data.length) sysMsg(gr.neighbour ? 'No messages yet. Be the first to say hello 👋' : 'No messages yet. Say hi 👋'); restorePending('g:' + gr.id, cidsOf(data)); suggest(); if (canSee()) markGroup(gr.id);
          ch = sb().channel('phone:grp:' + gr.id).on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'group_messages', filter: 'group_id=eq.' + gr.id }, (m) => { if (m.new) line(m.new, m.new.user_id === u.id, 'g'); }).subscribe();
        } catch (e) { sysMsg('Could not load the group: ' + nice(e)); }
        if (addNow) openPanel('add');
      }
      /* People / Add panels replace the thread until you press Back */
      async function openPanel(kind) {
        const gr = group; if (!gr) return; panel = true; try { ch && ch.unsubscribe(); } catch (e) { } ch = null; grpHandler = null; form.style.display = 'none'; log.innerHTML = ''; ctx.setTitle(gr.name + (kind === 'add' ? ' · Add' : ' · People'));
        if (kind === 'add' && !gr.neighbour) {
          const s = document.createElement('label'); s.className = 'ph-search'; s.style.margin = '0'; s.style.alignSelf = 'stretch'; s.innerHTML = '<span style="width:1.1em;height:1.1em;display:inline-flex;flex:none;stroke:#9a927d;fill:none;stroke-width:2;stroke-linecap:round">' + I.search + '</span><input type="search" maxlength="20" placeholder="Search a username to invite" autocomplete="off">'; log.appendChild(s);
          const out = document.createElement('div'); out.style.alignSelf = 'stretch'; log.appendChild(out); const note = document.createElement('div'); note.className = 'ph-note'; note.textContent = 'They get an invite and must accept before they can see the group. Teens and adults can’t share a group.'; log.appendChild(note); const si = s.querySelector('input'); si.focus();
          si.oninput = () => { clearTimeout(searchT); const q = si.value.trim(); if (q.length < 2) { out.innerHTML = ''; return; } searchT = setTimeout(() => runSearch(q, out, (p, r) => r.appendChild(mini('Invite', (b) => { if (demo) { lock(b, 'Invited ✓'); return; } rpc('invite_to_group', { p_group: gr.id, p_user: p.user_id }).then(x => lock(b, x && x.status === 'member' ? 'In group' : 'Invited ✓')).catch(e => Ph.toast(nice(e))); }, 'gold'))), 300); };
          return;
        }
        if (demo) { const l = list(); l.appendChild(row('You', 'Owner', [], null)); return; }
        try {
          const m = await sb().from('group_members').select('user_id,status,role').eq('group_id', gr.id).in('status', ['member', 'invited']); if (m.error) throw m.error; const ids = (m.data || []).map(x => x.user_id), names = {};
          if (ids.length) { const p = await sb().from('profiles').select('id,username').in('id', ids); (p.data || []).forEach(x => { names[x.id] = x.username; }); } if (dead || !panel) return;
          const l = list(); (m.data || []).sort((a, b) => (a.status === 'member' ? 0 : 1) - (b.status === 'member' ? 0 : 1)).forEach(x => { const r = row((names[x.user_id] || 'Player') + (x.user_id === u.id ? ' (you)' : ''), x.status === 'invited' ? 'Invite pending' : x.role === 'owner' ? 'Owner' : 'Member', [], null);
            if (gr.role === 'owner' && x.user_id !== u.id) r.appendChild(mini(x.status === 'invited' ? 'Cancel' : 'Remove', () => rpc('remove_group_member', { p_group: gr.id, p_user: x.user_id }).then(() => r.remove()).catch(e => Ph.toast(nice(e))))); l.appendChild(r); });
        } catch (e) { sysMsg('Could not load people: ' + nice(e)); }
      }

      /* ---- Profile: the other player's page (outfit, property, cars, accessories …) replaces the thread until Back ---- */
      const profBtn = (f) => { const b = mini('👤', () => showProfile(f)); b.title = b.ariaLabel = 'View profile'; b.setAttribute('aria-label', 'View ' + (f.username || 'player') + '’s profile'); return b; };
      const tabsBar = body.querySelector('.ph-tabs'); let profBox = null, profView = null, profSaved = null;
      function showProfile(p) {
        if (!g.FutaProfile) return Ph.toast('Profiles are not available yet.'); if (profBox) closeProfile(true);
        profSaved = { tabs: tabsBar.style.display, log: log.style.display, form: form.style.display };
        tabsBar.style.display = 'none'; log.style.display = 'none'; form.style.display = 'none'; ctx.setTitle(p.username || 'Profile');
        profBox = document.createElement('div'); profBox.style.cssText = 'flex:1;min-height:0;overflow:auto;overflow-x:hidden'; body.insertBefore(profBox, form);
        profView = g.FutaProfile.load(profBox, p, { onMessage: (x) => { closeProfile(true); openPeer({ id: x.id, username: x.username }); }, onClose: () => { closeProfile(); } });
      }
      function closeProfile(quiet) {
        if (!profBox) return; try { profView && profView.destroy(); } catch (e) { } profBox.remove(); profBox = profView = null;
        tabsBar.style.display = profSaved.tabs; log.style.display = profSaved.log; form.style.display = profSaved.form; if (!quiet) ctx.setTitle(peer ? (peer.username || 'Chat') : group ? (group.name || 'Group') : 'Chat');
      }

      /* ---- tabs, sending, lifecycle ---- */
      async function openNeighbours() {
        if (!u) return needSignIn();
        if (demo) return openGroup({ id: 'dnb', name: 'Neighbours 1', role: 'member', neighbour: true });
        reset(false); sysMsg('Finding your neighbours…');
        const nb = await ensureNb(); if (dead || tab !== 'neighbours') return;
        reset(false); if (!nb) { sysMsg(nbMsg()); bigBtn('Try again', () => { nbErr = null; openNeighbours(); }, 'ghost'); return; }
        openGroup({ id: nb.id, name: nb.name, role: 'member', neighbour: true });
      }
      function go(t) { tab = t; viewTab = t; if (t === 'campus' && U.campus) { U.campus = 0; refresh(); } ({ campus: () => openRoom(ROOM, 'Message the campus…'), neighbours: openNeighbours, building: () => openRoom(bld, 'Message this building…'), friends: openFriends, groups: openGroups })[t](); }
      function setTab(t) { tabs.forEach(x => x.classList.toggle('on', x.dataset.t === t)); go(t); }
      tabs.forEach(b => b.onclick = () => { if (b.dataset.t === 'building' && !bld) return; setTab(b.dataset.t); });
      form.onsubmit = (e) => {
        e.preventDefault(); const t = inp.value.trim().slice(0, MAX); if (!t || !u || !send) return; inp.value = '';
        submitText(t);
      };
      Ph.on('vis', () => { if (!dead && (peer || group)) setTimeout(() => { if (canSee()) { if (peer) markRead(peer.id); else if (group && !panel) markGroup(group.id); } }, 50); }); g.document.addEventListener('visibilitychange', () => { if (!dead && canSee()) { if (peer) markRead(peer.id); else if (group && !panel) markGroup(group.id); } });
      syncHook = () => { if (!dead && canSee()) { if (peer) markRead(peer.id); else if (group && !panel) markGroup(group.id); } };
      paint = () => {   // redraw the little numbers: tab badges + the rows on screen
        const setN = (t, n) => { const i = t && t.querySelector('.ph-tn'); if (i) { i.hidden = !n; i.textContent = capN(n); } };
        setN(body.querySelector('[data-t=campus]'), U.campus | 0); setN(body.querySelector('[data-t=friends]'), sumOf(U.dms) + (U.alerts | 0)); setN(body.querySelector('[data-t=groups]'), sumOf(U.groups) - nbUn() + (U.invites | 0)); setN(body.querySelector('[data-t=neighbours]'), nbUn());
        log.querySelectorAll('[data-u]').forEach(r => { const [k, id] = r.dataset.u.split(':'), n = ((k === 'dm' ? U.dms : U.groups)[id]) | 0, pl = r.querySelector('.ph-un'); if (pl) { pl.hidden = !n; pl.textContent = capN(n); pl.setAttribute('aria-label', n + ' unread'); } r.classList.toggle('has-un', !!n); });
      }; paint();
      const onUser = (nu) => { if (dead) return; u = nu; refreshBuilding(); setTab(tab === 'building' ? 'campus' : tab); }; Ph.on('user', onUser);
      const o = ctx.opts && ctx.opts.peer; startListeners(); refreshBuilding();
      if (o) { tab = 'friends'; tabs.forEach(x => x.classList.toggle('on', x.dataset.t === 'friends')); openPeer(o); } else if (ctx.opts && ctx.opts.tab === 'neighbours') setTab('neighbours'); else go('campus');
      return {
        destroy() { dead = true; viewTab = null; paint = null; syncHook = null; if (hooks === H) hooks = null; tickHandler = null; clearTimeout(searchT); try { closeProfile(true); } catch (e) { } try { ch && ch.unsubscribe(); } catch (e) { } ch = null; dmHandler = null; grpHandler = null; },
        back() {   // one step back inside the app before the phone goes home
          if (profBox) { closeProfile(); return true; }
          if (panel && group) { const gr = group; panel = false; openGroup(gr); return true; }
          if (group && group.neighbour) return false;   // the Neighbours chat is a top-level screen: Back goes to the phone home
          if (group) { setTab('groups'); return true; }
          if (peer) { setTab('friends'); return true; }
          return false;
        }
      };
    }
  };
  Ph.registerApp(CHAT);
  /* the Neighbours home-screen app = the same screen, opened straight on the Neighbours tab */
  Ph.registerApp(Object.assign({}, CHAT, {
    id: 'neighbours', name: 'Neighbours',
    icon: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M2.8 11.2L8 6.8l5.2 4.4"/><path d="M4.3 10v8.2h7.4V10"/><path d="M12.8 13.4l4.2-3.4 4.2 3.4"/><path d="M14.2 12.6v5.6h5.6v-5.6"/><path d="M7 18.2v-3.4h2.6v3.4"/></svg>',
    color: ['#e0a63a', '#9a6a12'],
    mount(body, ctx) { ctx.opts = Object.assign({}, ctx.opts, { tab: 'neighbours' }); return CHAT.mount(body, ctx); }
  }));
})(window);
