/* Phone app: Global — one public chat room for every player, with @tagging.
     * Type @ and a few letters: matching usernames pop up above the keyboard; tap one to tag that player. Tagged players get an alert and a badge on this app.
     * Tap ↩ on any message to reply to it; your message shows a small quote of the one you answered. Tapping a name opens that player's profile.
     * Teens and adults are kept apart, blocked players are hidden, bad words / numbers are filtered, 5 messages per 10 seconds: all enforced by the DATABASE
       (supabase/18_global_chat.sql: send_global_message, RLS on global_messages). This file only draws things. Text is always inserted with textContent.
   Signed-out visitors can open the app but see "Sign in to join the conversation" (Ph.requireLogin). Demo mode (no Supabase keys) fakes a few messages on this device.
   Badge on the home screen = tags/replies you have not seen yet (server count get_global_unread) + new messages since you last opened Global (counted on this phone); 99+ above 99. */
(function (g) {
  'use strict';
  const Ph = g.FutaPhone; if (!Ph) return;
  const MAX = 240, NAME = /@([A-Za-z0-9_]{2,20})/g;
  const NICE = { slow_down: 'Slow down a little.', message_not_allowed: 'That message can’t be sent.', finish_sign_up: 'Finish sign-up first.', message_gone: 'That message is no longer there.' };
  const nice = (e) => { const m = (e && e.message) || String(e || ''), k = Object.keys(NICE).find(x => m.indexOf(x) >= 0); return k ? NICE[k] : 'Something went wrong. Try again.'; };
  const GLOBE = '<svg viewBox="0 0 24 24" aria-hidden="true" style="width:3em;height:3em;fill:none;stroke:currentColor;stroke-width:1.7;stroke-linecap:round;stroke-linejoin:round"><circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3c2.6 2.6 3.9 5.6 3.9 9s-1.3 6.4-3.9 9c-2.6-2.6-3.9-5.6-3.9-9S9.4 5.6 12 3z"/></svg>';

  /* ---------- badge (tags/replies not yet seen), live even while the app is closed ---------- */
  let n = 0, m = 0, uid = null, chs = [], isOpen = false, onTag = null;      // n = tags/replies (server count), m = new messages since you last looked (counted on this phone)
  const setN = (v) => { n = Math.max(0, v | 0); Ph.badge('global', n + m); };
  const setM = (v) => { m = Math.max(0, v | 0); Ph.badge('global', n + m); };
  /* new Global messages: the room has no read state on the server, so THIS phone remembers the last message you saw (per player). First run starts from "now". */
  const gsKey = () => 'futa.global.seen.' + uid;
  const gsGet = () => { try { const v = parseInt(g.localStorage.getItem(gsKey()), 10); return v >= 0 ? v : null; } catch (e) { return null; } };
  const gsSet = (id) => { try { id = +id || 0; const c = gsGet(); if (c == null || id > c) g.localStorage.setItem(gsKey(), String(id)); } catch (e) { } };
  async function syncMsgs() {
    const api = Ph.api(), me = uid; if (!api || !me || Ph.demo()) return;
    try {
      const sb = api.sb(); let seen = gsGet();
      if (seen == null) { const r = await sb.from('global_messages').select('id').order('id', { ascending: false }).limit(1); if (r.error || me !== uid) return; try { g.localStorage.setItem(gsKey(), String(r.data && r.data[0] ? +r.data[0].id : 0)); } catch (e) { } setM(0); return; }
      const r = await sb.from('global_messages').select('id', { count: 'exact', head: true }).gt('id', seen).neq('user_id', me);
      if (r.error || me !== uid) return; setM(isOpen ? 0 : (r.count | 0));
    } catch (e) { /* offline: keep what we have */ }
  }
  g.addEventListener('online', () => { if (uid) syncMsgs(); }); g.document.addEventListener('visibilitychange', () => { if (!g.document.hidden && uid) syncMsgs(); });
  const stop = () => { chs.forEach(c => { try { c.unsubscribe(); } catch (e) { } }); chs = []; uid = null; if (!Ph.demo()) { m = 0; setN(0); } };
  function start() {
    const u = Ph.getUser(), api = Ph.api(); if (!u || Ph.demo() || !api || uid === u.id) return; stop(); uid = u.id;
    api.rpc('get_global_unread').then(v => { if (uid === u.id && !isOpen) setN(v | 0); }).catch(() => { }); syncMsgs();
    try {
      chs.push(api.sb().channel('phone:gtag:' + u.id).on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'notifications', filter: 'user_id=eq.' + u.id }, (m) => {
        const r = m && m.new; if (!r || r.app !== 'global') return;
        if (isOpen) { if (onTag) onTag(r); return; }
        setN(n + 1); Ph.alert({ icon: '🏷️', title: r.title, body: r.body || 'Tap to open Global', app: 'global' });
      }).subscribe());
      chs.push(api.sb().channel('phone:gmsg:' + u.id).on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'global_messages' }, (x) => {   // RLS: only my age group arrives
        const r = x && x.new; if (!r || r.user_id === u.id) return; if (isOpen) { gsSet(r.id); return; } setM(m + 1);
      }).subscribe());
    } catch (e) { console.warn('[phone global]', e.message); }
  }
  Ph.on('user', (u) => { if (!u) stop(); else start(); });

  /* ---------- demo seed ---------- */
  const DEMO = [['Tola', 'Anyone heading to the library?'], ['Amaka', 'Cafeteria jollof is sold out again 😩'], ['Segun', '@amaka the new place by the gate has rice 👀'], ['Amaka', '@segun you are a lifesaver']];

  Ph.registerApp({
    id: 'global', name: 'Global', icon: GLOBE, color: ['#3a7bd5', '#1b3f7a'],
    mount(body, ctx) {
      const demo = Ph.demo(), api = Ph.api(); let u = Ph.getUser(), dead = false, ch = null, replyTo = null, sendT = 0;
      const seen = new Set(), names = new Map(), mine = () => (u && u.username ? String(u.username).toLowerCase() : '');   // names: lower -> username of people seen in this room
      isOpen = true; ctx.setTitle('Global'); setM(0);
      body.innerHTML = '<div class="ph-log" aria-live="polite"></div><div class="ph-gr" hidden></div><div class="ph-quick" hidden></div><form class="ph-send" autocomplete="off"><input maxlength="' + MAX + '" placeholder="Say something to everyone…  @ to tag" enterkeyhint="send" aria-label="Message"><button aria-label="Send">' + ctx.icons.send + '</button></form>';
      const log = body.querySelector('.ph-log'), gr = body.querySelector('.ph-gr'), quick = body.querySelector('.ph-quick'), form = body.querySelector('form'), inp = form.querySelector('input');
      gr.style.cssText = 'display:flex;align-items:center;gap:.5em;padding:.4em .8em;background:#e8eefb;border-top:1px solid var(--line);font-size:.85em';
      gr.hidden = true;
      const sysMsg = (t) => { const d = document.createElement('div'); d.className = 'ph-sys-msg'; d.textContent = t; log.appendChild(d); log.scrollTop = 1e9; return d; };

      /* text with @names: tags become highlighted spans (mine = gold) */
      function fill(el, text) {
        let i = 0, m; NAME.lastIndex = 0;
        while ((m = NAME.exec(text))) {
          if (m.index > i) el.appendChild(document.createTextNode(text.slice(i, m.index)));
          const s = document.createElement('span'), me = m[1].toLowerCase() === mine(); s.textContent = m[0]; s.style.cssText = 'font-weight:700;border-radius:.4em;padding:0 .2em;' + (me ? 'background:#f3d57a;color:#4a3606' : 'background:#0000001a');
          el.appendChild(s); i = m.index + m[0].length;
        }
        if (i < text.length) el.appendChild(document.createTextNode(text.slice(i)));
      }
      function line(m, isMine) {
        if (m.id != null) { const k = 'g' + m.id; if (seen.has(k)) return; seen.add(k); }
        if (m.username) names.set(String(m.username).toLowerCase(), m.username);
        const d = document.createElement('div'), me = isMine || (u && m.user_id === u.id); d.className = 'ph-msg' + (me ? ' me' : ''); d.style.position = 'relative';
        if (!me && m.username) { const s = document.createElement('small'); s.textContent = m.username; s.className = 'ph-who'; s.title = 'Tag @' + m.username;
          s.onclick = () => tag(m.username); d.appendChild(s); }
        if (m.reply_name) { const q = document.createElement('div'); q.style.cssText = 'font-size:.8em;opacity:.8;border-left:3px solid #3a7bd5;padding:.1em .5em;margin-bottom:.3em;background:#00000012;border-radius:.3em'; const b = document.createElement('b'); b.textContent = '↩ ' + m.reply_name; q.appendChild(b); q.appendChild(document.createElement('br')); q.appendChild(document.createTextNode(m.reply_body || '')); d.appendChild(q); }
        const t = document.createElement('span'); fill(t, String(m.body || '')); d.appendChild(t);
        if (m.id != null || demo) { const r = document.createElement('button'); r.type = 'button'; r.textContent = '↩'; r.title = r.ariaLabel = 'Reply'; r.setAttribute('aria-label', 'Reply to ' + (m.username || 'message'));
          r.style.cssText = 'margin-left:.5em;border:0;background:none;color:inherit;opacity:.65;cursor:pointer;font-size:1em;min-width:1.8em;min-height:1.8em'; r.onclick = () => reply(m); d.appendChild(r); }
        const e = document.createElement('time'); e.style.cssText = 'display:block;font-size:.7em;opacity:.6;text-align:right'; try { e.textContent = new Date(m.created_at || Date.now()).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }); } catch (x) { } d.appendChild(e);
        log.appendChild(d); while (log.children.length > 120) log.firstChild.remove(); log.scrollTop = 1e9;
      }
      /* reply bar */
      function reply(m) {
        replyTo = { id: m.id, username: m.username || 'player', body: String(m.body || '').slice(0, 80) };
        gr.hidden = false; gr.innerHTML = ''; const t = document.createElement('span'); t.style.cssText = 'flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap'; const b = document.createElement('b'); b.textContent = 'Replying to ' + replyTo.username; t.appendChild(b); t.appendChild(document.createTextNode(': ' + replyTo.body));
        const x = document.createElement('button'); x.type = 'button'; x.textContent = '✕'; x.setAttribute('aria-label', 'Cancel reply'); x.style.cssText = 'border:0;background:none;font-size:1.1em;min-width:2em;min-height:2em;cursor:pointer'; x.onclick = clearReply; gr.append(t, x); inp.focus();
      }
      function clearReply() { replyTo = null; gr.hidden = true; gr.innerHTML = ''; }
      function tag(name) { const v = inp.value; inp.value = (v && !/\s$/.test(v) ? v + ' ' : v) + '@' + name + ' '; inp.focus(); chips(); }

      /* @ suggestions: usernames seen in the room first, then a server search (search_players) */
      let sT = 0, sq = '';
      const wordAt = () => { const p = inp.selectionStart == null ? inp.value.length : inp.selectionStart, m = /(?:^|\s)@([A-Za-z0-9_]{0,20})$/.exec(inp.value.slice(0, p)); return m ? m[1] : null; };
      function chips(list) {
        quick.innerHTML = ''; if (!list || !list.length) { quick.hidden = true; return; } quick.hidden = false;
        list.slice(0, 8).forEach(nm => { const b = document.createElement('button'); b.type = 'button'; b.textContent = '@' + nm; b.onclick = () => pick(nm); quick.appendChild(b); });
      }
      function pick(nm) { const p = inp.selectionStart == null ? inp.value.length : inp.selectionStart; const before = inp.value.slice(0, p).replace(/@[A-Za-z0-9_]{0,20}$/, '@' + nm + ' '); inp.value = before + inp.value.slice(p); inp.focus(); chips(); }
      inp.addEventListener('input', () => {
        const w = wordAt(); clearTimeout(sT); if (w === null) { chips(); return; } sq = w.toLowerCase();
        const local = [...names.entries()].filter(([k]) => k.indexOf(sq) === 0 && k !== mine()).map(([, v]) => v); chips(local);
        if (sq.length >= 2 && api && u && !demo) sT = setTimeout(async () => {
          try { const rows = await api.rpc('search_players', { p_query: sq }); if (dead || wordAt() === null) return; const more = (rows || []).map(r => r.username).filter(x => x && String(x).toLowerCase() !== mine());
            chips([...new Set(local.concat(more))]); } catch (e) { /* suggestions are optional */ }
        }, 250);
      });

      /* sending */
      form.addEventListener('submit', async (ev) => {
        ev.preventDefault(); const t = inp.value.trim(); if (!t) return;
        if (!u) return Ph.requireLogin ? Ph.requireLogin('chat with everyone') : (g.location.href = Ph.SIGNUP_URL);
        if (Date.now() - sendT < 400) return; sendT = Date.now(); chips();
        const rp = replyTo;
        if (demo) { line({ id: null, username: u.username || 'You', user_id: u.id, body: t, reply_name: rp && rp.username, reply_body: rp && rp.body, created_at: Date.now() }, true); inp.value = ''; clearReply(); return; }
        inp.value = ''; clearReply();
        try {
          const id = await api.rpc('send_global_message', { p_body: t, p_reply_to: rp && rp.id ? rp.id : null });
          if (dead) return; line({ id, user_id: u.id, username: u.username, body: t, reply_name: rp && rp.username, reply_body: rp && rp.body, created_at: new Date().toISOString() }, true);   // the realtime echo is ignored (same id)
        } catch (e) { if (!dead) { if (!inp.value) inp.value = t; Ph.toast(nice(e)); } }
      });
      onTag = () => { /* a tag arrived while the app is open: the message is already in the list; mark it seen */ markRead(); };
      const markRead = () => { if (u && api && !demo) api.rpc('mark_global_read').catch(() => { }); setN(0); };

      (async function init() {
        if (!u) { form.style.display = 'none'; const b = document.createElement('div'); b.style.cssText = 'padding:1.4em 1em;text-align:center'; const p = document.createElement('p'); p.textContent = 'Sign in to join the conversation. Everyone who plays is in here.'; p.style.marginBottom = '.8em';
          const bt = document.createElement('button'); bt.type = 'button'; bt.className = 'ph-btn'; bt.textContent = 'Sign in or create account'; bt.onclick = () => Ph.requireLogin ? Ph.requireLogin('chat with everyone') : (g.location.href = Ph.SIGNUP_URL); b.append(p, bt); log.appendChild(b); return; }
        if (demo) { sysMsg('Demo chat — messages stay on this device.'); DEMO.forEach(([a, t], i) => line({ username: a, body: t, created_at: Date.now() - (4 - i) * 60000 })); return; }
        try {
          const { data, error } = await api.sb().from('global_messages').select('id,user_id,username,body,reply_to,reply_name,reply_body,created_at').order('id', { ascending: false }).limit(50); if (error) throw error; if (dead) return;
          (data || []).reverse().forEach(r => line(r)); gsSet(data && data.length ? Math.max.apply(null, data.map(r => +r.id || 0)) : 0); setM(0); if (!data || !data.length) sysMsg('No messages yet. Say hi 👋');
          ch = api.sb().channel('phone:global').on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'global_messages' }, (x) => { if (x && x.new) { line(x.new); gsSet(x.new.id); } }).subscribe();   // RLS: only my age group arrives
          markRead();
        } catch (e) { sysMsg('Could not load Global: ' + nice(e)); }
      })();
      return {
        back() { if (replyTo) { clearReply(); return true; } return false; },
        destroy() { dead = true; isOpen = false; onTag = null; clearTimeout(sT); try { ch && ch.unsubscribe(); } catch (e) { } }
      };
    }
  });
})(typeof window !== 'undefined' ? window : globalThis);
