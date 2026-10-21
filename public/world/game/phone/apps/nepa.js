/* Phone app: NEPA — the power bulletin. Any signed-in player files a quick report (⚡ Light is ON · 🔌 OFF · ⚠️ Low voltage · 🔧 Maintenance · 📰 News) with a place and an
   optional short note; everyone sees what is happening right now. Reports vanish after 12 h. Other players tap "✓ I see this too" to confirm a report.
   STYLE: classic — cream newspaper paper, navy ink, serif headings, double rules, stamp-style status labels. LOGO: a navy seal with a milled gold edge and a gold lightning bolt (SVG below).
   Needs apps/bulletin-core.js (shared helpers, also used by Tutorial) and supabase/18_bulletins.sql. All rules (limits, text checks, expiry) are decided by the DATABASE.
   Tabs: The Board (right-now summary + reports, infinite scroll) · File a report. Demo mode (no Supabase keys) shows fake reports. All user text is inserted with textContent. Docs: docs/BULLETINS.md */
(function (g) {
  'use strict';
  const Ph = g.FutaPhone; if (!Ph) return;
  const ICON = '<svg viewBox="0 0 24 24" aria-hidden="true" style="width:3.1em;height:3.1em"><circle cx="12" cy="12" r="11.3" fill="none" stroke="#e9c86b" stroke-width=".7" stroke-dasharray=".8 1.5"/>' +
    '<circle cx="12" cy="12" r="10" fill="#17284d" stroke="#e9c86b" stroke-width="1.2"/><circle cx="12" cy="12" r="8.3" fill="none" stroke="#e9c86b" stroke-width=".4" opacity=".7"/>' +
    '<path d="M13.4 3.9 6.9 13h4.2l-.9 7.1 6.9-9.6h-4.3z" fill="#f4d97a" stroke="#b8922f" stroke-width=".4" stroke-linejoin="round"/></svg>';
  const PLACES = ['Obanla campus', 'Postgraduate campus', 'Off campus'];
  const INK = '#1d2742';
  const CSS = '.np{flex:1;min-height:0;display:flex;flex-direction:column;background:#f4eedb;color:' + INK + ';font-family:Georgia,"Times New Roman",serif}' +
    '.np button{font-family:system-ui,sans-serif}' +
    '.np-tabs{flex:none;display:flex;background:#ebe3cb;border-bottom:.15em double ' + INK + '}.np-tabs button{flex:1;padding:.7em .3em;font:700 .8em Georgia,serif;letter-spacing:.14em;text-transform:uppercase;color:#7a7766;border-bottom:.2em solid transparent;margin-bottom:-.15em}.np-tabs button.on{color:' + INK + ';border-color:#b8922f}' +
    '.np-view{padding:.8em .8em 1.4em;display:flex;flex-direction:column;gap:.9em}' +
    '.np-mast{text-align:center;border-top:.2em double ' + INK + ';border-bottom:.2em double ' + INK + ';padding:.55em 0 .5em}.np-mast b{display:block;font:700 1.3em/1.1 Georgia,serif;letter-spacing:.14em;text-transform:uppercase}.np-mast small{display:block;font-style:italic;color:#5b5a4b;font-size:.82em;margin-top:.3em}' +
    '.np-box,.np-card{background:#fbf7ea;border:1px solid ' + INK + ';outline:1px solid #1d274255;outline-offset:.22em;margin:.22em}' +
    '.np-box{padding:.7em .85em}.np-box h4{margin:0 0 .5em;font:700 .74em Georgia,serif;letter-spacing:.16em;text-transform:uppercase;text-align:center;border-bottom:1px solid #1d274266;padding-bottom:.45em}' +
    '.np-now{display:flex;align-items:center;gap:.55em;padding:.35em 0;border-bottom:1px dotted #1d274255}.np-now:last-child{border:0}.np-dot{width:.8em;height:.8em;border-radius:50%;background:var(--c);flex:none}' +
    '.np-now b{flex:1;min-width:0;overflow-wrap:anywhere;line-height:1.2}.np-now span{font:700 .78em system-ui;color:var(--c);text-transform:uppercase;letter-spacing:.05em}.np-now small{color:#7a7766;font:.74em system-ui;min-width:4.6em;text-align:right}' +
    '.np-list{display:flex;flex-direction:column;gap:1em}.np-card{position:relative;padding:.8em .9em .55em 1.15em;box-shadow:.25em .3em 0 #1d274218}.np-card::before{content:"";position:absolute;left:0;top:0;bottom:0;width:.42em;background:var(--c)}' +
    '.np-stamp{display:inline-block;font:700 .7em system-ui,sans-serif;letter-spacing:.12em;color:var(--c);border:.14em solid var(--c);padding:.2em .55em;border-radius:.3em;transform:rotate(-2deg)}' +
    '.np-place{margin:.5em 0 .15em;font:700 1.18em/1.2 Georgia,serif;overflow-wrap:anywhere}.np-note{margin:.25em 0 .45em;font-style:italic;line-height:1.4;overflow-wrap:anywhere}.np-meta{font:.76em system-ui,sans-serif;color:#7a7766}' +
    '.np-foot{display:flex;gap:.4em;align-items:center;margin-top:.55em;padding-top:.45em;border-top:1px dotted #1d274255;flex-wrap:wrap;min-height:2.6em}.np-foot span{font:.8em system-ui;color:#7a7766}' +
    '.np-foot button{font-weight:600;font-size:.8em;padding:.5em .75em;border:1px solid ' + INK + ';border-radius:.3em;background:transparent;color:' + INK + '}.np-foot button.on{background:' + INK + ';color:#f0d78c}.np-foot button:disabled{opacity:.75}.np-foot .gh{border-color:transparent;color:#7a7766;margin-left:auto}' +
    '.np-sent{text-align:center;color:#7a7766;font:italic .88em Georgia,serif;padding:.6em}.np-h{margin:0;font:700 .76em Georgia,serif;letter-spacing:.14em;text-transform:uppercase}' +
    '.np-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:.5em}.np-pick{display:flex;flex-direction:column;align-items:center;gap:.2em;padding:.65em .2em;border:1px solid ' + INK + ';background:#fbf7ea;border-radius:.3em;color:' + INK + '}.np-pick span{font-size:1.4em}.np-pick b{font-size:.74em;text-align:center}.np-pick.on{background:var(--c);border-color:var(--c);color:#fff}' +
    '.np-chips{display:flex;flex-wrap:wrap;gap:.4em}.np-chip{padding:.5em .8em;border:1px solid ' + INK + ';border-radius:2em;background:transparent;font-size:.82em;color:' + INK + '}.np-chip.on{background:' + INK + ';color:#f0d78c}' +
    '.np-in{width:100%;box-sizing:border-box;border:1px solid ' + INK + ';background:#fffdf5;border-radius:.3em;padding:.7em;font:inherit;color:' + INK + '}textarea.np-in{min-height:4.6em;resize:none}' +
    '.np-meter{display:flex;justify-content:space-between;font:.8em system-ui;color:#7a7766}.np-go{padding:.9em;background:' + INK + ';color:#f0d78c;border:.15em double #e9c86b;border-radius:.3em;font:700 .95em Georgia,serif;letter-spacing:.1em;text-transform:uppercase}.np-go:disabled{opacity:.45}';

  Ph.registerApp({
    id: 'nepa', name: 'NEPA', icon: ICON, color: ['#2b4375', '#0d1830'],
    mount(body, ctx) {
      const B = g.FutaBulletin;
      if (!B) { const p = document.createElement('p'); p.className = 'ph-note'; p.textContent = 'Could not load the shared helper (bulletin-core.js).'; body.appendChild(p); return { back() { return false; } }; }
      const { h, STATUS, REASONS, say, ago, left } = B, S = Object.fromEntries(STATUS.map(s => [s[0], s])), store = B.store('nepa');
      let u = Ph.getUser(), tab = 'board', dead = false, pg = null, st = { daily_limit: 10, posts_left: 10, hours: 12 };
      const style = h('style'); style.textContent = CSS; body.appendChild(style);
      const root = h('div', 'np'); body.appendChild(root);
      const tabs = h('div', 'np-tabs'); [['board', 'The Board'], ['post', 'File a report']].forEach(([k, t]) => { const b = h('button', k === 'board' ? 'on' : '', t); b.type = 'button'; b.dataset.t = k; b.onclick = () => go(k); tabs.appendChild(b); });
      const view = h('div', 'np-view'); root.append(tabs, view);
      const refresh = h('button', '', '↻'); refresh.type = 'button'; refresh.setAttribute('aria-label', 'Refresh the board'); refresh.style.cssText = 'color:#f0d78c;font-size:1.2em;padding:0 .4em'; ctx.bar.appendChild(refresh); refresh.onclick = () => go(tab);
      ctx.setTitle('NEPA');
      async function loadStatus() { try { st = await store.status(); } catch (e) { Ph.toast(say(e)); } return st; }

      function go(k) {
        tab = k; tabs.querySelectorAll('button').forEach(b => b.classList.toggle('on', b.dataset.t === k)); if (pg) { pg.destroy(); pg = null; }
        view.innerHTML = ''; body.scrollTop = 0; if (!u) { view.appendChild(h('p', 'np-sent', 'Sign in (Settings) to read and file reports.')); return; }
        (k === 'board' ? showBoard : showPost)();
      }

      /* ---------------- The Board ---------------- */
      function showBoard() {
        const mast = h('div', 'np-mast'); mast.append(h('b', '', 'The Power Bulletin'), h('small', '', new Date().toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Africa/Lagos' }) + ' · Lagos'));
        const now = h('section', 'np-box'), list = h('div', 'np-list'), sent = h('div', 'np-sent', 'Loading…'); view.append(mast, now, list, sent); drawNow(now);
        pg = B.pager({ root: body, list, sent, render: notice, empty: 'Nothing on the board yet. Be the first to file a report.', end: 'That is everything on the board.',
          load: async (off) => { const rows = await store.page({ offset: off }), v = await store.myVotes(rows.map(r => r.id)); rows.forEach(r => { r._v = v.has(r.id); }); return rows; } });
      }
      async function drawNow(box) {   // the latest report for each place in the last 3 hours (news items are not a "status")
        box.appendChild(h('h4', '', 'Right now · last 3 hours')); const wrap = h('div'); box.appendChild(wrap); wrap.appendChild(h('div', 'np-sent', 'Checking…'));
        try {
          const rows = await store.page({ since: 180, size: 40 }); if (dead || tab !== 'board') return; wrap.innerHTML = '';
          const seen = new Set(), latest = []; rows.forEach(r => { const k = (r.place || '').toLowerCase(); if (r.status !== 'news' && !seen.has(k)) { seen.add(k); latest.push(r); } });
          if (!latest.length) wrap.appendChild(h('div', 'np-sent', 'No reports in the last 3 hours.'));
          latest.slice(0, 6).forEach(r => { const s = S[r.status] || S.news, row = h('div', 'np-now'); row.style.setProperty('--c', s[3]); row.append(h('i', 'np-dot'), h('b', '', r.place), h('span', '', s[1]), h('small', '', ago(r.created_at))); wrap.appendChild(row); });
        } catch (e) { wrap.textContent = 'Could not load: ' + say(e); }
      }
      function notice(p) {
        const s = S[p.status] || S.news, own = !!u && p.user_id === u.id, a = h('article', 'np-card'); a.style.setProperty('--c', s[3]);
        a.append(h('span', 'np-stamp', s[2] + ' ' + s[1].toUpperCase()), h('h3', 'np-place', p.place)); if (p.body) a.appendChild(h('p', 'np-note', '“' + p.body + '”'));
        a.appendChild(h('div', 'np-meta', 'Reported by ' + p.username + ' · ' + ago(p.created_at) + ' · ' + left(p.expires_at)));
        const foot = h('div', 'np-foot'); a.appendChild(foot); footer(foot, p, own); return a;
      }
      function footer(foot, p, own) {
        foot.innerHTML = '';
        const c = h('button', p._v ? 'on' : '', own ? '✓ ' + p.helpful + ' confirmed' : '✓ I see this too · ' + p.helpful); c.type = 'button'; foot.appendChild(c);
        if (own) c.disabled = true; else c.onclick = async () => { c.disabled = true; try { const r = await store.vote(p.id); p.helpful = r.helpful; p._v = r.voted; } catch (e) { Ph.toast(say(e)); } footer(foot, p, own); };
        const x = h('button', 'gh', own ? 'Remove' : 'Report'); x.type = 'button'; x.onclick = () => own ? askRemove(foot, p, own) : askReport(foot, p, own); foot.appendChild(x);
      }
      function askReport(foot, p, own) {
        foot.innerHTML = ''; foot.appendChild(h('span', '', 'Why?'));
        REASONS.forEach(([k, t]) => { const b = h('button', '', t); b.type = 'button'; b.onclick = async () => { foot.textContent = ''; try { await store.report(p.id, k); foot.appendChild(h('span', '', 'Thank you. We will look at it.')); } catch (e) { Ph.toast(say(e)); footer(foot, p, own); } }; foot.appendChild(b); });
        const c = h('button', 'gh', 'Cancel'); c.type = 'button'; c.onclick = () => footer(foot, p, own); foot.appendChild(c);
      }
      function askRemove(foot, p, own) {
        foot.innerHTML = ''; foot.appendChild(h('span', '', 'Remove this report?'));
        const y = h('button', '', 'Yes, remove'); y.type = 'button'; y.onclick = async () => { try { await store.remove(p.id); foot.closest('.np-card').remove(); } catch (e) { Ph.toast(say(e)); footer(foot, p, own); } };
        const n = h('button', 'gh', 'No'); n.type = 'button'; n.onclick = () => footer(foot, p, own); foot.append(y, n);
      }

      /* ---------------- File a report ---------------- */
      async function showPost() {
        await loadStatus(); if (dead || tab !== 'post') return;
        let sel = null, chip = null;
        const grid = h('div', 'np-grid'); STATUS.forEach(s => { const b = h('button', 'np-pick'); b.type = 'button'; b.dataset.k = s[0]; b.style.setProperty('--c', s[3]); b.append(h('span', '', s[2]), h('b', '', s[1])); b.onclick = () => { sel = s[0]; paint(); }; grid.appendChild(b); });
        const chips = h('div', 'np-chips'), inp = h('input', 'np-in'); inp.maxLength = 40; inp.placeholder = 'Or type a place, e.g. Hostel Block A'; inp.setAttribute('aria-label', 'Place'); inp.oninput = () => { chip = null; paint(); };
        PLACES.forEach(p => { const b = h('button', 'np-chip', p); b.type = 'button'; b.dataset.p = p; b.onclick = () => { chip = p; inp.value = ''; paint(); }; chips.appendChild(b); });
        const ta = h('textarea', 'np-in'); ta.maxLength = 200; ta.placeholder = 'Add a short note (optional)'; ta.setAttribute('aria-label', 'Note'); ta.oninput = paint;
        const meter = h('div', 'np-meter'), left_ = h('span'), count = h('span'); meter.append(left_, count);
        const go_ = h('button', 'np-go', 'Post to the board'); go_.type = 'button';
        const place = () => inp.value.trim() || chip || '';
        function paint() {
          grid.querySelectorAll('button').forEach(b => b.classList.toggle('on', b.dataset.k === sel)); chips.querySelectorAll('button').forEach(b => b.classList.toggle('on', b.dataset.p === chip));
          const n = ta.value.trim().length; count.textContent = n + '/200'; left_.textContent = st.posts_left + ' of ' + st.daily_limit + ' reports left today';
          go_.disabled = !sel || place().length < 2 || (n > 0 && n < 10) || st.posts_left <= 0;
        }
        go_.onclick = async () => {
          if (go_.disabled) return; go_.disabled = true; go_.textContent = 'Posting…';
          try { const r = await store.post({ status: sel, place: place(), note: ta.value.trim() }); st.posts_left = r.posts_left; Ph.toast('Posted to the board'); if (!dead) go('board'); }
          catch (e) { Ph.toast(say(e)); go_.textContent = 'Post to the board'; paint(); }
        };
        view.append(h('h4', 'np-h', '1 · What is the light doing?'), grid, h('h4', 'np-h', '2 · Where?'), chips, inp, h('h4', 'np-h', '3 · A short note (optional)'), ta, meter, go_,
          h('p', 'np-sent', 'Plain text only. No links or phone numbers. Reports disappear after ' + st.hours + ' hours.')); paint();
      }

      const onUser = (nu) => { if (dead) return; u = nu; go(tab); }; Ph.on('user', onUser);
      go('board');
      return { destroy() { dead = true; if (pg) pg.destroy(); refresh.remove(); }, back() { return false; } };
    }
  });
})(window);
