/* Phone app: Gamers — a forum for popular mobile games. Boards: ⚽ DLS (Dream League Soccer) · 🎮 eFootball · 🕹️ Other games.
   Topics have a tag (Talk · Tips · Squad · Looking for a match · News). Open a topic to read and reply. Report a post (3 players hide it) or remove your own.
   Rules live in the DATABASE (supabase/20_forum.sql: age groups kept apart, no links / phone numbers / bad words, daily and speed limits, blocks);
   this file reads the RLS-protected tables and writes only through forum_new_topic / forum_reply / forum_report / forum_delete.
   Signed-out visitors are asked to sign in when they open it (Ph.requireLogin). Demo mode (no Supabase keys) shows a few sample topics kept on this device.
   All text is inserted with textContent. */
(function (g) {
  'use strict';
  const Ph = g.FutaPhone; if (!Ph) return;
  const BOARDS = [{ id: 'dls', icon: '⚽', name: 'DLS', long: 'Dream League Soccer', color: '#1e6bd6' }, { id: 'efootball', icon: '🎮', name: 'eFootball', long: 'eFootball', color: '#12805c' }, { id: 'other', icon: '🕹️', name: 'Other', long: 'Other games', color: '#8a4bd6' }];
  const TAGS = { talk: ['💬', 'Talk'], tips: ['💡', 'Tips'], squad: ['🛡️', 'Squad'], match: ['🤝', 'Looking for a match'], news: ['📰', 'News'] };
  const NICE = { slow_down: 'Slow down a little.', daily_limit: 'You have reached today’s topic limit.', message_not_allowed: 'That can’t be posted. No links or phone numbers, keep it friendly, and check the length.', finish_sign_up: 'Finish sign-up first.', not_found: 'That topic is no longer there.', not_allowed: 'That isn’t allowed.' };
  const nice = (e) => { const m = (e && e.message) || String(e || ''), k = Object.keys(NICE).find(x => m.indexOf(x) >= 0); return k ? NICE[k] : 'Something went wrong. Try again.'; };
  const ago = (t) => { const s = Math.max(1, Math.round((Date.now() - new Date(t).getTime()) / 1000)); return s < 60 ? 'now' : s < 3600 ? Math.round(s / 60) + ' min' : s < 86400 ? Math.round(s / 3600) + ' h' : Math.round(s / 86400) + ' d'; };
  const ICON = '<svg viewBox="0 0 24 24" aria-hidden="true" style="width:3em;height:3em;fill:none;stroke:currentColor;stroke-width:1.7;stroke-linecap:round;stroke-linejoin:round"><circle cx="12" cy="12" r="9"/><path d="M12 7.5l3.6 2.6-1.4 4.2H9.8L8.4 10.1z"/><path d="M12 3v4.5M20.5 9.5l-4.9.6M17.7 19.3l-3.5-5M6.3 19.3l3.5-5M3.5 9.5l4.9.6"/></svg>';
  const PAGE = 15;
  const DEMO = { topics: [
    { id: 1, board: 'dls', tag: 'tips', username: 'tola', title: 'Best formation for DLS 25', body: 'I use 4-3-3 with two fast wingers. It wins a lot on Pro division.', replies: 2, last_at: new Date(Date.now() - 3e6).toISOString(), created_at: new Date(Date.now() - 9e6).toISOString() },
    { id: 2, board: 'efootball', tag: 'match', username: 'amaka', title: 'Anyone for a friendly tonight?', body: 'Looking for a 1v1 friendly around 8pm. Drop a reply.', replies: 1, last_at: new Date(Date.now() - 6e5).toISOString(), created_at: new Date(Date.now() - 36e5).toISOString() },
    { id: 3, board: 'efootball', tag: 'squad', username: 'segun', title: 'Cheap squad build that works', body: 'Focus on fast strikers and one strong CDM. Saves coins.', replies: 0, last_at: new Date(Date.now() - 9e6).toISOString(), created_at: new Date(Date.now() - 9e6).toISOString() }],
    posts: { 1: [{ id: 1, username: 'amaka', body: 'Try 4-2-3-1 too, works for me.', created_at: new Date(Date.now() - 2e6).toISOString() }, { id: 2, username: 'segun', body: 'Agreed, wingers matter most.', created_at: new Date(Date.now() - 1e6).toISOString() }], 2: [{ id: 3, username: 'tola', body: 'I am free from 8:30!', created_at: new Date(Date.now() - 3e5).toISOString() }] } };

  Ph.registerApp({
    id: 'forum', name: 'Gamers', title: 'Gamers', icon: ICON, color: ['#1e6bd6', '#0b2a63'],
    mount(body, ctx) {
      const demo = Ph.demo(), api = Ph.api(), el = ctx.el; let u = Ph.getUser(), dead = false, board = 'dls', topic = null, ch = null, page = 0, view = 'list', limits = { topics_left: 5 };
      const sb = () => api.sb(), rpc = (n, a) => api.rpc(n, a);
      const h = (tag, css, txt) => { const e = el(tag); if (css) e.style.cssText = css; if (txt != null) e.textContent = txt; return e; };
      const btn = (label, fn, cls, css) => { const b = h('button', css || ''); b.type = 'button'; b.className = 'ph-btn' + (cls ? ' ' + cls : ''); b.textContent = label; b.onclick = fn; return b; };
      const mini = (label, fn) => { const b = h('button', 'border:0;background:none;color:#6f6a5e;font:inherit;font-size:.85em;cursor:pointer;min-height:2em;padding:0 .4em', label); b.type = 'button'; b.onclick = fn; return b; };
      body.style.cssText = 'display:flex;flex-direction:column;overflow:auto;padding:0';
      const bd = () => BOARDS.find(b => b.id === board);
      const closeCh = () => { try { ch && ch.unsubscribe(); } catch (e) { } ch = null; };

      if (!u && !demo) { body.appendChild(h('div', 'padding:1.4em 1em;text-align:center', 'Sign in to read and join the gamers forum.')); const b = btn('Sign in or create account', () => Ph.requireLogin('join the gamers forum'), 'gold'); b.style.margin = '.8em 1em'; body.appendChild(b); return {}; }

      /* ---------- topic list ---------- */
      async function list(more) {
        view = 'list'; closeCh(); topic = null; ctx.setTitle('Gamers'); if (!more) { page = 0; body.innerHTML = ''; } else { const m = body.querySelector('[data-more]'); if (m) m.remove(); }
        if (!more) {
          const tabs = h('div', 'display:flex;gap:.4em;padding:.6em .7em;position:sticky;top:0;background:#fbf8f1;z-index:2;border-bottom:1px solid #e6dfcd'); tabs.setAttribute('role', 'tablist');
          BOARDS.forEach(b => { const t = h('button', 'flex:1;min-height:2.6em;border-radius:.9em;font:600 .92em inherit;cursor:pointer;border:2px solid ' + (b.id === board ? b.color : '#e6dfcd') + ';background:' + (b.id === board ? b.color : '#fff') + ';color:' + (b.id === board ? '#fff' : '#33302a'), b.icon + ' ' + b.name); t.type = 'button'; t.setAttribute('role', 'tab'); t.setAttribute('aria-selected', b.id === board); t.onclick = () => { board = b.id; list(); }; tabs.appendChild(t); });
          body.appendChild(tabs);
          const top = h('div', 'display:flex;align-items:center;gap:.5em;padding:.6em .8em 0'); top.append(h('div', 'flex:1;font:700 1.05em Georgia,serif;color:' + bd().color, bd().long + ' forum'), btn('＋ New topic', () => compose(), 'gold', 'width:auto;min-height:2.4em;padding:0 .9em')); body.appendChild(top);
          body.appendChild(h('div', 'padding:0 .8em;font-size:.82em;color:#6f6a5e', 'Be kind. No links or phone numbers. Share tips, squads and find a match.'));
          body.appendChild(h('div', 'padding:0 .7em .8em;display:flex;flex-direction:column;gap:.45em;margin-top:.5em')).setAttribute('data-list', '1');
        }
        const box = body.querySelector('[data-list]');
        let rows = [], err = null;
        if (demo) rows = DEMO.topics.filter(t => t.board === board); else {
          try { const r = await sb().from('forum_topics').select('id,board,tag,user_id,username,title,replies,last_at,created_at').eq('board', board).order('last_at', { ascending: false }).range(page * PAGE, page * PAGE + PAGE - 1); if (r.error) throw r.error; rows = r.data || []; } catch (e) { err = e; }
        }
        if (dead || view !== 'list') return;
        if (err) { box.appendChild(h('div', 'padding:1em;text-align:center;color:#6f6a5e', 'Could not load topics. Check your connection.')); return; }
        if (!rows.length && !page) box.appendChild(h('div', 'padding:1.2em .5em;text-align:center;color:#6f6a5e', 'No topics here yet. Start the first one!'));
        rows.forEach(t => box.appendChild(card(t)));
        if (rows.length === PAGE) { const m = btn('Show more', () => { page++; list(true); }); m.setAttribute('data-more', '1'); m.style.margin = '.2em .8em .8em'; body.appendChild(m); }
      }
      function card(t) {
        const c = h('button', 'text-align:left;background:#fff;border:1px solid #e6dfcd;border-radius:1em;padding:.7em .8em;display:flex;flex-direction:column;gap:.25em;cursor:pointer;font:inherit;color:inherit'); c.type = 'button';
        const tg = TAGS[t.tag] || TAGS.talk; c.append(h('span', 'font-size:.78em;font-weight:700;color:' + bd().color, tg[0] + ' ' + tg[1]), h('span', 'font-weight:700;overflow-wrap:anywhere', t.title));
        c.append(h('span', 'font-size:.82em;color:#6f6a5e', t.username + ' · ' + t.replies + (t.replies === 1 ? ' reply' : ' replies') + ' · ' + ago(t.last_at)));
        c.onclick = () => open(t); return c;
      }

      /* ---------- one topic ---------- */
      async function open(t) {
        view = 'topic'; topic = t; closeCh(); body.innerHTML = ''; ctx.setTitle(bd().name);
        const head = h('div', 'padding:.8em;border-bottom:1px solid #e6dfcd;background:#fff;display:flex;flex-direction:column;gap:.3em'); const tg = TAGS[t.tag] || TAGS.talk;
        head.append(h('span', 'font-size:.78em;font-weight:700;color:' + bd().color, tg[0] + ' ' + tg[1]), h('div', 'font:700 1.1em Georgia,serif;overflow-wrap:anywhere', t.title));
        const meta = h('div', 'font-size:.82em;color:#6f6a5e', t.username + ' · ' + ago(t.created_at)); head.appendChild(meta);
        const tb = h('div', 'white-space:pre-wrap;overflow-wrap:anywhere;margin-top:.2em', ''); head.appendChild(tb);
        const acts = h('div', 'display:flex;justify-content:flex-end'); head.appendChild(acts); body.appendChild(head);
        const thread = h('div', 'flex:1;padding:.6em .7em;display:flex;flex-direction:column;gap:.45em'); body.appendChild(thread);
        const form = h('form', 'position:sticky;bottom:0;display:flex;gap:.5em;padding:.6em .7em;background:#fbf8f1;border-top:1px solid #e6dfcd'); const inp = h('input', 'flex:1;min-width:0;border:1px solid #e6dfcd;border-radius:2em;padding:.7em 1em;font:inherit;background:#fff'); inp.maxLength = 500; inp.placeholder = 'Write a reply…'; inp.setAttribute('aria-label', 'Reply');
        const sendB = h('button', 'width:2.9em;height:2.9em;border-radius:50%;border:1px solid #c9a24a;background:#12392a;color:#f0d78c;cursor:pointer;font-size:1.1em', '➤'); sendB.setAttribute('aria-label', 'Send reply'); form.append(inp, sendB); body.appendChild(form);
        const seen = new Set();
        const post = (p) => {
          if (seen.has(p.id)) return; seen.add(p.id); const me = u && p.user_id === u.id; const b = h('div', 'background:' + (me ? '#e8f0fb' : '#fff') + ';border:1px solid #e6dfcd;border-radius:1em;padding:.55em .75em');
          b.append(h('div', 'font-size:.8em;font-weight:700;color:' + bd().color, p.username + (me ? ' (you)' : '') + '  ·  ' + ago(p.created_at)), h('div', 'white-space:pre-wrap;overflow-wrap:anywhere', p.body));
          if (!demo && p.id != null) { const r = h('div', 'display:flex;justify-content:flex-end'); r.appendChild(me ? mini('Remove', () => { rpc('forum_delete', { p_kind: 'post', p_id: p.id }).then(() => b.remove()).catch(e => Ph.toast(nice(e))); }) : mini('Report', (ev) => { rpc('forum_report', { p_kind: 'post', p_id: p.id }).then(() => { Ph.toast('Thanks, reported.'); ev.target.remove(); }).catch(e => Ph.toast(nice(e))); })); b.appendChild(r); }
          thread.appendChild(b); body.scrollTop = body.scrollHeight;
        };
        const full = async () => {
          if (demo) { tb.textContent = t.body; (DEMO.posts[t.id] || []).forEach(post); return; }
          try { const r = await sb().from('forum_topics').select('body,user_id').eq('id', t.id).maybeSingle(); if (r.data) { tb.textContent = r.data.body; t.user_id = r.data.user_id; }
            const own = u && t.user_id === u.id; acts.appendChild(own ? mini('Remove topic', () => { rpc('forum_delete', { p_kind: 'topic', p_id: t.id }).then(() => list()).catch(e => Ph.toast(nice(e))); }) : mini('Report topic', (ev) => { rpc('forum_report', { p_kind: 'topic', p_id: t.id }).then(() => { Ph.toast('Thanks, reported.'); ev.target.remove(); }).catch(e => Ph.toast(nice(e))); }));
            const p = await sb().from('forum_posts').select('id,user_id,username,body,created_at').eq('topic_id', t.id).order('id', { ascending: true }).limit(200); if (p.error) throw p.error; if (dead || topic !== t) return; (p.data || []).forEach(post);
            if (!(p.data || []).length) thread.appendChild(h('div', 'text-align:center;color:#6f6a5e;padding:.6em', 'No replies yet. Say something!'));
            ch = sb().channel('phone:forum:' + t.id).on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'forum_posts', filter: 'topic_id=eq.' + t.id }, (m) => { if (m && m.new) post(m.new); }).subscribe();
          } catch (e) { thread.appendChild(h('div', 'text-align:center;color:#6f6a5e;padding:.6em', 'Could not load replies.')); }
        };
        form.onsubmit = async (ev) => {
          ev.preventDefault(); const v = inp.value.trim(); if (!v) return; inp.value = '';
          if (demo) { post({ id: 'd' + Date.now(), username: (u && u.username) || 'you', user_id: u && u.id, body: v, created_at: new Date().toISOString() }); return; }
          try { const id = await rpc('forum_reply', { p_topic: t.id, p_body: v }); post({ id, user_id: u.id, username: u.username, body: v, created_at: new Date().toISOString() }); } catch (e) { inp.value = v; Ph.toast(nice(e)); }
        };
        full();
      }

      /* ---------- new topic ---------- */
      async function compose() {
        view = 'new'; closeCh(); body.innerHTML = ''; ctx.setTitle('New topic'); let tag = 'talk';
        if (!demo) { try { limits = await rpc('forum_limits'); } catch (e) { } }
        const f = h('form', 'padding:.8em;display:flex;flex-direction:column;gap:.6em'); body.appendChild(f);
        f.appendChild(h('div', 'font-weight:700;color:' + bd().color, bd().icon + ' ' + bd().long));
        const tags = h('div', 'display:flex;flex-wrap:wrap;gap:.4em'); f.appendChild(tags);
        const paint = () => { tags.innerHTML = ''; Object.keys(TAGS).forEach(k => { const b = h('button', 'min-height:2.3em;padding:0 .8em;border-radius:2em;font:600 .85em inherit;cursor:pointer;border:2px solid ' + (k === tag ? bd().color : '#e6dfcd') + ';background:' + (k === tag ? bd().color : '#fff') + ';color:' + (k === tag ? '#fff' : '#33302a'), TAGS[k][0] + ' ' + TAGS[k][1]); b.type = 'button'; b.onclick = () => { tag = k; paint(); }; tags.appendChild(b); }); }; paint();
        const ti = h('input', 'border:1px solid #e6dfcd;border-radius:.9em;padding:.7em .9em;font:inherit;background:#fff'); ti.maxLength = 80; ti.placeholder = 'Title (5–80 letters)'; ti.setAttribute('aria-label', 'Title');
        const tx = h('textarea', 'border:1px solid #e6dfcd;border-radius:.9em;padding:.7em .9em;font:inherit;background:#fff;min-height:7em;resize:vertical'); tx.maxLength = 800; tx.placeholder = 'What do you want to say? (10–800 letters, no links or phone numbers)'; tx.setAttribute('aria-label', 'Your topic');
        const note = h('div', 'font-size:.82em;color:#6f6a5e', demo ? 'Demo: topics stay on this device.' : (limits.topics_left + ' topic' + (limits.topics_left === 1 ? '' : 's') + ' left today'));
        const go = btn('Post topic', () => { }, 'gold'); go.type = 'submit'; f.append(ti, tx, note, go);
        f.onsubmit = async (ev) => {
          ev.preventDefault(); const t0 = ti.value.trim(), b0 = tx.value.trim(); if (t0.length < 5 || b0.length < 10) { Ph.toast('Add a title and a few more words.'); return; } go.disabled = true;
          try {
            if (demo) { const n = { id: Date.now(), board, tag, username: (u && u.username) || 'you', title: t0, body: b0, replies: 0, last_at: new Date().toISOString(), created_at: new Date().toISOString() }; DEMO.topics.unshift(n); return open(n); }
            const id = await rpc('forum_new_topic', { p_board: board, p_tag: tag, p_title: t0, p_body: b0 }); if (dead) return; open({ id, board, tag, user_id: u.id, username: u.username, title: t0, replies: 0, last_at: new Date().toISOString(), created_at: new Date().toISOString() });
          } catch (e) { go.disabled = false; Ph.toast(nice(e)); }
        };
        ti.focus();
      }
      const onUser = (nu) => { if (dead) return; u = nu; };
      Ph.on('user', onUser); list();
      return { back() { if (view !== 'list') { list(); return true; } return false; }, destroy() { dead = true; closeCh(); Ph.off && Ph.off('user', onUser); } };
    }
  });
})(typeof window !== 'undefined' ? window : globalThis);
