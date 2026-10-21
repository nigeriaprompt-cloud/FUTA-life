/* Phone app: Feed — text-only posts on a coloured background, a classic scrolling feed (infinite scroll), posts vanish after 24 h.
   Each post pays GAME money into the player's in-game BANK balance (seen and withdrawn at an ATM in a bank). Amount, daily limit and text limits are decided by the DATABASE: supabase/05_feed.sql, docs/FEED.md.
   Tabs: Feed (read) · Write (post) · Earn (bank balance + reward history).
   No likes, no comments (on purpose). The only extra action is "Report" on someone else's post.
   Real mode: reads feed_posts / ledger (RLS) and writes ONLY through RPCs post_to_feed / report_user.
   Demo mode (no Supabase keys): fake posts and a fake bank balance in memory so you can see the layout.
   All user text is inserted with textContent. Background keys must match private.feed_bgs() in 05_feed.sql. */
(function (g) {
  'use strict';
  const Ph = g.FutaPhone; if (!Ph) return;
  const PAGE = 12;
  const BGS = [   // [key, css background, text colour]
    ['sunset', 'linear-gradient(135deg,#ff9a3d,#e8396b)', '#fff'], ['ocean', 'linear-gradient(135deg,#1fa2ff,#12d8fa 60%,#a6ffcb)', '#06283d'],
    ['forest', 'linear-gradient(135deg,#0f5a3b,#35b27a)', '#fff'], ['royal', 'linear-gradient(135deg,#4b2fbf,#9b5de5)', '#fff'],
    ['rose', 'linear-gradient(135deg,#ff6fa5,#ffc2d6)', '#4a0d27'], ['midnight', 'linear-gradient(135deg,#0b1026,#2b3a67)', '#f4f1de'],
    ['gold', 'linear-gradient(135deg,#f5c542,#ffe9a0)', '#3d2b00'], ['mint', 'linear-gradient(135deg,#b5ead7,#e2f7ee)', '#134a35'],
    ['fire', 'linear-gradient(135deg,#ff512f,#dd2476)', '#fff'], ['lagos', 'linear-gradient(135deg,#0b7a3b,#f6f6f6 55%,#0b7a3b)', '#0a3d1f'],
    ['dusk', 'linear-gradient(135deg,#355c7d,#6c5b7b 55%,#c06c84)', '#fff'], ['slate', 'linear-gradient(135deg,#232526,#414345)', '#fff']
  ];
  const BG = Object.fromEntries(BGS.map(b => [b[0], b]));
  g.FutaFeedBG = BG;   // shared with the profile view (latest status card)
  const naira = (n) => '₦' + Number(n || 0).toLocaleString('en-NG');   // game money, whole numbers
  const ERR = {
    daily_limit: 'You have used all your posts for today. Come back tomorrow.', post_not_allowed: 'That text is not allowed. Use at least 3 words, no links, no phone numbers.',
    duplicate_post: 'Someone already posted this exact text. Write your own.', bad_background: 'Pick one of the backgrounds.'
  };
  const say = (e) => ERR[e && e.message] || (e && e.message) || 'Something went wrong. Try again.';
  const left = (iso) => { const ms = new Date(iso) - Date.now(); if (ms <= 0) return 'expired'; const h = Math.floor(ms / 36e5), m = Math.floor(ms % 36e5 / 6e4); return h > 0 ? h + 'h ' + m + 'm left' : Math.max(m, 1) + 'm left'; };
  const h = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; };

  const CSS = '.fd{display:flex;flex-direction:column;flex:1;min-height:0}.fd .ph-tabs{position:sticky;top:0;z-index:3}' +
    '.fd-view{flex:1;padding:.7em .8em 1.2em;display:flex;flex-direction:column;gap:.8em}' +
    '.fd-post{background:#fff;border:1px solid var(--line);border-radius:1em;overflow:hidden}' +
    '.fd-head{display:flex;align-items:center;gap:.6em;padding:.6em .75em}.fd-head .ph-av{width:2em;height:2em;font-size:.85em;flex:none}.fd-head b{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.fd-head small{color:var(--mute);flex:none}' +
    '.fd-card{display:flex;align-items:center;justify-content:center;text-align:center;min-height:11em;padding:1.4em 1.1em;font-weight:700;line-height:1.35;white-space:pre-wrap;overflow-wrap:anywhere}' +
    '.fd-foot{display:flex;justify-content:flex-end;gap:.4em;padding:.35em .6em;min-height:2.3em;align-items:center}.fd-foot button{color:var(--mute);font-size:.85em;padding:.3em .6em;border-radius:1em}.fd-foot button:active{background:#f3eee0}' +
    '.fd-sent{text-align:center;color:var(--mute);font-size:.85em;padding:.8em}' +
    '.fd-compose{position:relative;border-radius:1em;overflow:hidden;min-height:13em;display:flex;align-items:center;cursor:text}.fd-compose textarea{flex:1;width:100%;height:3em;max-height:12em;overflow:hidden;background:transparent;border:0;outline:0;resize:none;text-align:center;font:inherit;font-weight:700;font-size:1.15em;line-height:1.35;padding:.4em 1.1em;color:inherit}.fd-compose textarea::placeholder{color:inherit;opacity:.6}' +
    '.fd-meta{display:flex;justify-content:space-between;color:var(--mute);font-size:.85em}.fd-meta .bad{color:#c0392b}' +
    '.fd-sw{display:grid;grid-template-columns:repeat(6,1fr);gap:.5em}.fd-sw button{aspect-ratio:1;border-radius:50%;border:.18em solid transparent}.fd-sw button.on{border-color:var(--gold);box-shadow:0 0 0 .12em #fff inset}' +
    '.fd-btn{background:var(--emerald);color:var(--gold2);font-weight:700;padding:.85em;border-radius:.9em;text-align:center}.fd-btn[disabled]{opacity:.45}' +
    '.fd-big{background:var(--emerald);color:var(--gold2);border-radius:1em;padding:1em;text-align:center}.fd-big b{display:block;font-size:1.8em}.fd-big small{opacity:.8}' +
    '' +
    '.fd-led{background:#fff;border:1px solid var(--line);border-radius:1em;overflow:hidden}.fd-led .ph-row small{white-space:normal}';

  const DEMO_T = ['Jollof rice at the cafeteria today was a whole vibe, no cap', 'Reminder: the library closes at 10pm, plan your night well', 'Light just came back in the hostel and the whole block screamed', 'Studying for exams, send prayers and snacks please', 'Sunset at the Faculty junction hits different every single evening', 'Who else is surviving only on noodles and hope this week?', 'Small steps every day still count, keep going FUTA fam', 'The generator noise at midnight is my lullaby now', 'Weekend plan: sleep, eat, repeat, then pretend to read', 'Morning lectures should be illegal, but here we are anyway'];
  const DEMO_U = ['Tola', 'Amaka', 'Segun', 'Chidi', 'Bisi', 'Hauwa', 'Kunle'];

  Ph.registerApp({
    id: 'feed', name: 'Feed', icon: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="4" y="3.5" width="16" height="17" rx="2.5"/><path d="M8 8.5h8M8 12h8M8 15.5h5"/></svg>', color: ['#e8396b', '#8a1f4e'],
    mount(body, ctx) {
      const demo = Ph.demo(), api = Ph.api(); let u = Ph.getUser(), tab = 'feed', dead = false;
      let st = { daily_limit: 7, posts_left: 7, reward: 500, min_chars: 15, max_chars: 280, bank: 0 }; const demoLed = [];
      const fake = []; if (demo) for (let i = 0; i < 40; i++) fake.push({ id: 1000 - i, user_id: 'd' + (i % 7), username: DEMO_U[i % 7], body: DEMO_T[i % 10], bg: BGS[(i * 5) % BGS.length][0], expires_at: new Date(Date.now() + (24 - (i % 23) - 0.5) * 36e5).toISOString() });

      const style = h('style'); style.textContent = CSS; body.appendChild(style);
      const root = h('div', 'fd'); body.appendChild(root);
      const tabs = h('div', 'ph-tabs'); [['feed', 'Feed'], ['write', 'Write'], ['earn', 'Earn']].forEach(([k, t]) => { const b = h('button', k === 'feed' ? 'on' : '', t); b.type = 'button'; b.dataset.t = k; b.onclick = () => go(k); tabs.appendChild(b); });
      const view = h('div', 'fd-view'); root.append(tabs, view);
      const refresh = h('button', '', '↻'); refresh.type = 'button'; refresh.setAttribute('aria-label', 'Refresh feed'); refresh.style.cssText = 'color:var(--gold2);font-size:1.2em;padding:0 .4em'; ctx.bar.appendChild(refresh); refresh.onclick = () => { if (tab === 'feed') showFeed(); };

      let io = null;
      function go(k) { tab = k; tabs.querySelectorAll('button').forEach(b => b.classList.toggle('on', b.dataset.t === k)); if (io) { io.disconnect(); io = null; } view.innerHTML = ''; body.scrollTop = 0; if (!u) { view.appendChild(h('p', 'ph-note', 'Sign in (Settings) to read and post.')); return; } ({ feed: showFeed, write: showWrite, earn: showEarn })[k](); }
      async function loadStatus() { if (demo) return st; try { st = await api.rpc('get_feed_status'); } catch (e) { Ph.toast(say(e)); } return st; }

      /* ---------------- Feed: classic cards, newest first, infinite scroll (keyset paging by id) ---------------- */
      function card(p) {
        const wrap = h('article', 'fd-post'), bg = BG[p.bg] || BGS[0];
        const head = h('div', 'fd-head'); const av = h('span', 'ph-av', (p.username || '?').charAt(0).toUpperCase()); head.append(av, h('b', '', p.username || 'Player'), h('small', '', left(p.expires_at)));
        const c = h('div', 'fd-card', p.body); c.style.background = bg[1]; c.style.color = bg[2]; const n = p.body.length; c.style.fontSize = n <= 60 ? '1.5em' : n <= 140 ? '1.2em' : '1em';
        const foot = h('div', 'fd-foot'); if (!u || p.user_id !== u.id) { const r = h('button', '', 'Report'); r.type = 'button'; r.onclick = () => askReport(foot, p); foot.appendChild(r); }
        wrap.append(head, c, foot); return wrap;
      }
      function askReport(foot, p) {
        foot.innerHTML = ''; [['spam', 'Spam'], ['inappropriate', 'Inappropriate'], ['harassment', 'Harassment']].forEach(([k, t]) => { const b = h('button', '', t); b.type = 'button'; b.onclick = async () => { foot.textContent = 'Thanks, we will look at it.'; foot.style.color = 'var(--mute)'; if (!demo) try { await api.rpc('report_user', { p_target: p.user_id, p_reason: k, p_context: 'feed:' + p.id }); } catch (e) { Ph.toast(say(e)); } }; foot.appendChild(b); });
      }
      async function page(before) {
        if (demo) { await new Promise(r => setTimeout(r, 250)); return fake.filter(p => before == null || p.id < before).slice(0, PAGE); }
        let q = api.sb().from('feed_posts').select('id,user_id,username,body,bg,expires_at').order('id', { ascending: false }).limit(PAGE); if (before != null) q = q.lt('id', before);
        const { data, error } = await q; if (error) throw error; return data || [];
      }
      function showFeed() {
        view.innerHTML = ''; const list = h('div'); list.style.cssText = 'display:flex;flex-direction:column;gap:.8em'; const sent = h('div', 'fd-sent', 'Loading…'); view.append(list, sent);
        let oldest = null, busy = false, end = false;
        async function more() {
          if (busy || end || dead) return; busy = true;
          try {
            const rows = await page(oldest); if (dead || tab !== 'feed') return; rows.forEach(p => list.appendChild(card(p))); if (rows.length) oldest = rows[rows.length - 1].id;
            if (rows.length < PAGE) { end = true; sent.textContent = list.children.length ? 'You are all caught up. Posts vanish after 24 hours.' : 'No posts yet. Be the first one!'; } else sent.textContent = 'Loading more…';
          } catch (e) { sent.textContent = 'Could not load: ' + say(e) + ' (tap ↻)'; end = true; }
          busy = false; if (!end && io) { io.unobserve(sent); io.observe(sent); }   // re-check: if the sentinel is still on screen, load the next page
        }
        io = new IntersectionObserver((es) => { if (es.some(e => e.isIntersecting)) more(); }, { root: body, rootMargin: '300px' }); io.observe(sent);
      }

      /* ---------------- Write: pick a background, type, post ---------------- */
      async function showWrite() {
        view.innerHTML = ''; await loadStatus(); if (dead || tab !== 'write') return;
        let bg = BGS[0][0];
        const info = h('div', 'fd-meta'), meta = h('div', 'fd-meta'), count = h('span'), hint = h('span');
        const box = h('div', 'fd-compose'), ta = h('textarea'); ta.maxLength = st.max_chars; ta.placeholder = 'Write something worth reading…'; ta.setAttribute('aria-label', 'Your post'); box.appendChild(ta);
        const sw = h('div', 'fd-sw'); BGS.forEach(b => { const x = h('button'); x.type = 'button'; x.style.background = b[1]; x.setAttribute('aria-label', b[0]); x.onclick = () => { bg = b[0]; paint(); }; x.dataset.k = b[0]; sw.appendChild(x); });
        const go_ = h('button', 'fd-btn', 'Post'); go_.type = 'button';
        function paint() { const b = BG[bg]; box.style.background = b[1]; box.style.color = b[2]; sw.querySelectorAll('button').forEach(x => x.classList.toggle('on', x.dataset.k === bg)); upd(); }
        function upd() {
          const n = ta.value.trim().length, short = n < st.min_chars; count.textContent = n + '/' + st.max_chars; count.className = n > 0 && short ? 'bad' : ''; hint.textContent = short ? 'at least ' + st.min_chars + ' characters' : '';
          info.textContent = ''; info.append(h('span', '', st.posts_left + ' of ' + st.daily_limit + ' posts left today'), h('span', '', 'Earn ' + naira(st.reward) + ' each')); go_.disabled = short || st.posts_left <= 0;
        }
        meta.append(hint, count); ta.oninput = () => { ta.style.height = 'auto'; ta.style.height = Math.min(ta.scrollHeight, 190) + 'px'; upd(); }; box.onclick = () => ta.focus();
        go_.onclick = async () => {
          const text = ta.value.trim(); if (go_.disabled) return; go_.disabled = true; go_.textContent = 'Posting…';
          try {
            let r;
            if (demo) { if (st.posts_left <= 0) throw new Error('daily_limit'); fake.unshift({ id: (fake[0] ? fake[0].id : 1000) + 1, user_id: u.id, username: u.username || 'You', body: text, bg, expires_at: new Date(Date.now() + 864e5).toISOString() }); st.posts_left--; st.bank += st.reward; demoLed.unshift({ d_bank: st.reward, created_at: new Date().toISOString() }); r = { reward: st.reward, bank: st.bank, posts_left: st.posts_left }; }
            else { r = await api.rpc('post_to_feed', { p_body: text, p_bg: bg }); st.posts_left = r.posts_left; st.bank = r.bank; }
            Ph.toast('Posted! +' + naira(r.reward) + ' in your bank'); if (!dead) go('feed');
          } catch (e) { Ph.toast(say(e)); go_.textContent = 'Post'; upd(); }
        };
        view.append(info, box, meta, sw, go_, h('p', 'ph-note', 'Text only. Posts disappear after 24 hours. No links or phone numbers.')); paint();
      }

      /* ---------------- Earn: the in-game bank balance + reward history ---------------- */
      async function showEarn() {
        view.innerHTML = ''; await loadStatus(); if (dead || tab !== 'earn') return;
        const big = h('div', 'fd-big'); big.append(h('small', '', 'In your bank account'), h('b', '', naira(st.bank)), h('small', '', 'Earn ' + naira(st.reward) + ' per post, up to ' + st.daily_limit + ' posts a day')); view.appendChild(big);
        view.appendChild(h('p', 'ph-note', 'Rewards go straight into your bank balance. Go to a bank in FUTAlife and use the ATM to move them to your pocket.'));
        let led = demoLed;
        if (!demo) { led = []; try { const { data } = await api.sb().from('ledger').select('d_bank,created_at').eq('kind', 'feed_reward').order('id', { ascending: false }).limit(10); led = data || []; } catch (e) { Ph.toast(say(e)); } }
        if (dead || tab !== 'earn') return;
        if (led.length) { const box = h('div', 'fd-led'); led.forEach(x => { const r = h('div', 'ph-row'), t = h('span', 't'); t.append(h('b', '', '+' + naira(x.d_bank)), h('small', '', 'Post reward · ' + new Date(x.created_at).toLocaleDateString())); r.appendChild(t); box.appendChild(r); }); view.appendChild(box); }
      }

      const onUser = (nu) => { if (dead) return; u = nu; go(tab); }; Ph.on('user', onUser);
      go('feed');
      return { destroy() { dead = true; if (io) io.disconnect(); refresh.remove(); }, back() { return false; } };
    }
  });
})(window);
