/* Phone app: Tutorial — short how-to guides shared by players. Any signed-in player can publish a guide (title + category + steps/text); everyone can read, filter by category,
   sort by Newest / Most helpful, tap a guide to read it in full and press 👍 Helpful. Guides stay until the author removes them.
   STYLE: modern — soft grey-blue background, white rounded cards with soft shadows, gradient hero, coloured category pills, pill-shaped controls, sans-serif type.
   LOGO: an open book (two white pages) with a gold spark on a violet→blue gradient tile (SVG below).
   Needs apps/bulletin-core.js (shared helpers, also used by NEPA) and supabase/18_bulletins.sql. All rules (limits, text checks) are decided by the DATABASE.
   Tabs: Learn (list ↔ full guide; the phone's Back button closes the guide first) · Share (write a guide). Demo mode (no Supabase keys) shows fake guides.
   All user text is inserted with textContent. Docs: docs/BULLETINS.md */
(function (g) {
  'use strict';
  const Ph = g.FutaPhone; if (!Ph) return;
  const ICON = '<svg viewBox="0 0 24 24" aria-hidden="true" style="width:3.1em;height:3.1em"><path d="M2.8 7.6c3.1-1.3 6.2-1.1 9.2.7v12.2c-3-1.8-6.1-2-9.2-.7z" fill="#fff" stroke="none"/>' +
    '<path d="M21.2 7.6c-3.1-1.3-6.2-1.1-9.2.7v12.2c3-1.8 6.1-2 9.2-.7z" fill="#fff" opacity=".78" stroke="none"/><path d="M12 .9l1 2.3 2.3 1-2.3 1-1 2.3-1-2.3-2.3-1 2.3-1z" fill="#ffd166" stroke="none"/></svg>';
  const CSS = '.tu{flex:1;min-height:0;display:flex;flex-direction:column;background:#f3f4fb;color:#1c1f3a;font-family:system-ui,-apple-system,"Segoe UI",sans-serif}.tu button{font-family:inherit}' +
    '.tu-top{flex:none;padding:.7em .8em .2em;display:flex}.tu-seg{display:flex;background:#e6e8f5;border-radius:999px;padding:.2em}.tu-top .tu-seg{flex:1}.tu-seg button{flex:1;padding:.5em 1em;border-radius:999px;font-weight:600;font-size:.88em;color:#5a5f80}.tu-seg button.on{background:#fff;color:#3b35c8;box-shadow:0 2px 6px rgba(40,40,100,.16)}' +
    '.tu-view{padding:.7em .8em 1.4em;display:flex;flex-direction:column;gap:.8em}' +
    '.tu-hero{border-radius:1.2em;padding:1.05em 1.1em;color:#fff;background:linear-gradient(135deg,#7a5cff,#1fb6ff);box-shadow:0 10px 24px rgba(90,80,230,.28)}.tu-hero b{display:block;font-size:1.25em;letter-spacing:-.01em}.tu-hero small{opacity:.92}' +
    '.tu-chips{display:flex;gap:.45em;overflow-x:auto;padding:.1em 0 .3em;scrollbar-width:none}.tu-chips::-webkit-scrollbar{display:none}.tu-chip{flex:none;padding:.5em .9em;border-radius:999px;background:#fff;border:1px solid #e1e4f3;font-weight:600;font-size:.86em;color:#4b4f6b}.tu-chip.on{background:var(--c);border-color:transparent;color:#fff}' +
    '.tu-seg.sm{align-self:flex-start}.tu-seg.sm button{flex:none;padding:.4em 1em;font-size:.82em}' +
    '.tu-list{display:flex;flex-direction:column;gap:.8em}.tu-card{background:#fff;border-radius:1.2em;padding:.95em 1em;box-shadow:0 6px 18px rgba(32,40,90,.08);cursor:pointer;display:flex;flex-direction:column;gap:.45em;text-align:left}.tu-card:active{transform:scale(.99)}' +
    '.tu-pill{align-self:flex-start;font-weight:700;font-size:.72em;padding:.3em .75em;border-radius:999px;color:var(--c)}.tu-title{margin:0;font-size:1.05em;line-height:1.25;font-weight:700;overflow-wrap:anywhere}' +
    '.tu-ex{margin:0;color:#5a5f80;font-size:.88em;line-height:1.4;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden;overflow-wrap:anywhere}.tu-meta{display:flex;gap:.7em;align-items:center;font-size:.78em;color:#7a7fa0;flex-wrap:wrap}.tu-meta b{color:var(--c)}' +
    '.tu-sent{text-align:center;color:#7a7fa0;font-size:.86em;padding:.7em}' +
    '.tu-back{align-self:flex-start;padding:.45em .9em;border-radius:999px;background:#fff;color:#3b35c8;font-weight:600;font-size:.85em;box-shadow:0 2px 8px rgba(40,40,100,.12)}' +
    '.tu-doc{background:#fff;border-radius:1.3em;padding:1.1em 1.1em 1em;box-shadow:0 8px 22px rgba(32,40,90,.1);display:flex;flex-direction:column;gap:.5em}.tu-doc h2{margin:.1em 0 0;font-size:1.3em;line-height:1.25;letter-spacing:-.01em;overflow-wrap:anywhere}.tu-p{margin:.35em 0;line-height:1.6;overflow-wrap:anywhere}' +
    '.tu-acts{display:flex;gap:.5em;flex-wrap:wrap;align-items:center;margin-top:.6em;padding-top:.8em;border-top:1px solid #eceef8}.tu-acts button{padding:.65em 1.1em;border-radius:999px;font-weight:700;font-size:.88em;background:#eef0fb;color:#3b35c8}.tu-acts button.on{background:linear-gradient(135deg,#7a5cff,#1fb6ff);color:#fff}.tu-acts button:disabled{opacity:.6}.tu-acts .gh{background:none;color:#7a7fa0;margin-left:auto;font-weight:600}.tu-acts span{font-size:.85em;color:#7a7fa0}' +
    '.tu-lab{margin:0 0 -.4em;font-weight:700;font-size:.8em;color:#4b4f6b}.tu-in{width:100%;box-sizing:border-box;border:2px solid #e1e4f3;background:#fff;border-radius:1em;padding:.8em .9em;font:inherit;color:#1c1f3a;outline:none}.tu-in:focus{border-color:#7a5cff}textarea.tu-in{min-height:11em;resize:none;line-height:1.5}' +
    '.tu-meter{display:flex;justify-content:space-between;font-size:.8em;color:#7a7fa0}.tu-meter .bad{color:#c0392b}.tu-go{padding:.95em;border-radius:1em;font-weight:700;font-size:1em;color:#fff;background:linear-gradient(135deg,#7a5cff,#1fb6ff);box-shadow:0 8px 20px rgba(90,80,230,.3)}.tu-go:disabled{opacity:.45;box-shadow:none}' +
    '.tu-tip{background:#fff;border-radius:1em;padding:.8em .95em;font-size:.84em;color:#5a5f80;line-height:1.45}.tu-tip b{color:#3b35c8}';

  Ph.registerApp({
    id: 'tutorial', name: 'Tutorial', icon: ICON, color: ['#7a5cff', '#1fb6ff'],
    mount(body, ctx) {
      const B = g.FutaBulletin;
      if (!B) { const p = document.createElement('p'); p.className = 'ph-note'; p.textContent = 'Could not load the shared helper (bulletin-core.js).'; body.appendChild(p); return { back() { return false; } }; }
      const { h, CATS, REASONS, say, ago } = B, store = B.store('tutorial'), COL = Object.fromEntries(CATS);
      let u = Ph.getUser(), tab = 'learn', dead = false, pg = null, cat = '', sort = 'new', closeDoc = null, st = { daily_limit: 3, posts_left: 3 };
      const style = h('style'); style.textContent = CSS; body.appendChild(style);
      const root = h('div', 'tu'); body.appendChild(root);
      const top = h('div', 'tu-top'), seg = h('div', 'tu-seg'); [['learn', 'Learn'], ['share', 'Share a guide']].forEach(([k, t]) => { const b = h('button', k === 'learn' ? 'on' : '', t); b.type = 'button'; b.dataset.t = k; b.onclick = () => go(k); seg.appendChild(b); });
      top.appendChild(seg); const view = h('div', 'tu-view'); root.append(top, view);
      const refresh = h('button', '', '↻'); refresh.type = 'button'; refresh.setAttribute('aria-label', 'Refresh'); refresh.style.cssText = 'color:#fff;font-size:1.2em;padding:0 .4em'; ctx.bar.appendChild(refresh); refresh.onclick = () => go(tab);
      ctx.setTitle('Tutorial');
      async function loadStatus() { try { st = await store.status(); } catch (e) { Ph.toast(say(e)); } return st; }
      const readMin = (t) => Math.max(1, Math.round(t.trim().split(/\s+/).length / 180));

      function go(k) {
        tab = k; closeDoc = null; seg.querySelectorAll('button').forEach(b => b.classList.toggle('on', b.dataset.t === k)); if (pg) { pg.destroy(); pg = null; }
        view.innerHTML = ''; body.scrollTop = 0; if (!u) { view.appendChild(h('p', 'tu-sent', 'Sign in (Settings) to read and share guides.')); return; }
        (k === 'learn' ? showLearn : showShare)();
      }

      /* ---------------- Learn: filter + sort + cards; a tap opens the full guide ---------------- */
      function showLearn() {
        const hero = h('div', 'tu-hero'); hero.append(h('b', '', 'Learn something new today'), h('small', '', 'Short guides from players like you'));
        const chips = h('div', 'tu-chips'); [['All', '', '#4b3fe0']].concat(CATS.map(c => [c[0], c[0], c[1]])).forEach(([t, k, c]) => { const b = h('button', 'tu-chip' + (k === cat ? ' on' : ''), t); b.type = 'button'; b.style.setProperty('--c', c); b.onclick = () => { cat = k; chips.querySelectorAll('button').forEach(x => x.classList.toggle('on', x === b)); draw(); }; chips.appendChild(b); });
        const sorter = h('div', 'tu-seg sm'); [['new', 'Newest'], ['top', 'Most helpful']].forEach(([k, t]) => { const b = h('button', k === sort ? 'on' : '', t); b.type = 'button'; b.onclick = () => { sort = k; sorter.querySelectorAll('button').forEach(x => x.classList.toggle('on', x === b)); draw(); }; sorter.appendChild(b); });
        const list = h('div', 'tu-list'), sent = h('div', 'tu-sent', 'Loading…'); const parts = [hero, chips, sorter, list, sent]; view.append(...parts);
        function draw() {
          if (pg) pg.destroy(); list.innerHTML = ''; sent.textContent = 'Loading…';
          pg = B.pager({ root: body, list, sent, render: card, empty: cat ? 'No guides in ' + cat + ' yet. Share the first one!' : 'No guides yet. Share the first one!', end: 'You have reached the end.',
            load: async (off) => { const rows = await store.page({ offset: off, category: cat, sort }), v = await store.myVotes(rows.map(r => r.id)); rows.forEach(r => { r._v = v.has(r.id); }); return rows; } });
        }
        function card(p) {
          const c = COL[p.category] || '#4b3fe0', a = h('article', 'tu-card'); a.style.setProperty('--c', c); a.tabIndex = 0; a.setAttribute('role', 'button');
          const pill = h('span', 'tu-pill', p.category); pill.style.background = c + '1f'; p._cnt = h('b', '', '👍 ' + p.helpful);
          const meta = h('div', 'tu-meta'); meta.append(p._cnt, h('span', '', 'by ' + p.username), h('span', '', ago(p.created_at)), h('span', '', readMin(p.body) + ' min read'));
          a.append(pill, h('h3', 'tu-title', p.title), h('p', 'tu-ex', p.body.replace(/\s+/g, ' ')), meta); a.onclick = () => open(p); a.onkeydown = (e) => { if (e.key === 'Enter') open(p); }; return a;
        }
        function open(p) {   // the list stays in the page (hidden), so closing the guide is instant and keeps your place
          const y = body.scrollTop, own = !!u && p.user_id === u.id, c = COL[p.category] || '#4b3fe0'; parts.forEach(e => { e.style.display = 'none'; }); body.scrollTop = 0;
          const doc = h('div'); doc.style.cssText = 'display:flex;flex-direction:column;gap:.8em'; const back = h('button', 'tu-back', '← All guides'); back.type = 'button';
          const card_ = h('article', 'tu-doc'), pill = h('span', 'tu-pill', p.category); pill.style.background = c + '1f'; pill.style.setProperty('--c', c);
          card_.append(pill, h('h2', '', p.title), h('div', 'tu-meta', 'by ' + p.username + ' · ' + ago(p.created_at) + ' · ' + readMin(p.body) + ' min read'));
          p.body.split('\n').filter(l => l.trim()).forEach(l => card_.appendChild(h('p', 'tu-p', l)));
          const acts = h('div', 'tu-acts'); card_.appendChild(acts); doc.append(back, card_); view.appendChild(doc);
          const close = () => { doc.remove(); parts.forEach(e => { e.style.display = ''; }); body.scrollTop = y; closeDoc = null; }; closeDoc = close; back.onclick = close; actions(acts, p, own, close);
        }
        function actions(acts, p, own, close) {
          acts.innerHTML = ''; const v = h('button', p._v ? 'on' : '', '👍 Helpful · ' + p.helpful); v.type = 'button'; acts.appendChild(v);
          if (own) v.disabled = true; else v.onclick = async () => { v.disabled = true; try { const r = await store.vote(p.id); p.helpful = r.helpful; p._v = r.voted; if (p._cnt) p._cnt.textContent = '👍 ' + p.helpful; } catch (e) { Ph.toast(say(e)); } actions(acts, p, own, close); };
          const x = h('button', 'gh', own ? 'Remove' : 'Report'); x.type = 'button'; x.onclick = () => own ? askRemove(acts, p, own, close) : askReport(acts, p, own, close); acts.appendChild(x);
        }
        function askReport(acts, p, own, close) {
          acts.innerHTML = ''; acts.appendChild(h('span', '', 'Why?'));
          REASONS.forEach(([k, t]) => { const b = h('button', '', t); b.type = 'button'; b.onclick = async () => { acts.textContent = ''; try { await store.report(p.id, k); acts.appendChild(h('span', '', 'Thank you. We will look at it.')); } catch (e) { Ph.toast(say(e)); actions(acts, p, own, close); } }; acts.appendChild(b); });
          const c = h('button', 'gh', 'Cancel'); c.type = 'button'; c.onclick = () => actions(acts, p, own, close); acts.appendChild(c);
        }
        function askRemove(acts, p, own, close) {
          acts.innerHTML = ''; acts.appendChild(h('span', '', 'Remove this guide?'));
          const y = h('button', '', 'Yes, remove'); y.type = 'button'; y.onclick = async () => { try { await store.remove(p.id); close(); draw(); } catch (e) { Ph.toast(say(e)); actions(acts, p, own, close); } };
          const n = h('button', 'gh', 'No'); n.type = 'button'; n.onclick = () => actions(acts, p, own, close); acts.append(y, n);
        }
        draw();
      }

      /* ---------------- Share: title + category + guide ---------------- */
      async function showShare() {
        await loadStatus(); if (dead || tab !== 'share') return;
        let pick = '';
        const title = h('input', 'tu-in'); title.maxLength = 60; title.placeholder = 'e.g. How to save power on your phone'; title.setAttribute('aria-label', 'Title');
        const chips = h('div', 'tu-chips'); chips.style.flexWrap = 'wrap'; CATS.forEach(([t, c]) => { const b = h('button', 'tu-chip', t); b.type = 'button'; b.style.setProperty('--c', c); b.dataset.k = t; b.onclick = () => { pick = t; paint(); }; chips.appendChild(b); });
        const ta = h('textarea', 'tu-in'); ta.maxLength = 1200; ta.placeholder = 'Explain it simply. Short steps work best:\n1. First…\n2. Then…'; ta.setAttribute('aria-label', 'Guide');
        const meter = h('div', 'tu-meter'), info = h('span'), count = h('span'); meter.append(info, count); const go_ = h('button', 'tu-go', 'Publish guide'); go_.type = 'button';
        function paint() {
          chips.querySelectorAll('button').forEach(b => b.classList.toggle('on', b.dataset.k === pick)); const n = ta.value.trim().length, tl = title.value.trim().length;
          count.textContent = n + '/1200'; count.className = n > 0 && n < 40 ? 'bad' : ''; info.textContent = n > 0 && n < 40 ? 'at least 40 characters' : st.posts_left + ' of ' + st.daily_limit + ' guides left today';
          go_.disabled = !pick || tl < 5 || n < 40 || st.posts_left <= 0;
        }
        title.oninput = ta.oninput = paint;
        go_.onclick = async () => {
          if (go_.disabled) return; go_.disabled = true; go_.textContent = 'Publishing…';
          try { const r = await store.post({ title: title.value.trim(), category: pick, body: ta.value.trim() }); st.posts_left = r.posts_left; Ph.toast('Published! Thanks for sharing.'); if (!dead) { sort = 'new'; cat = ''; go('learn'); } }
          catch (e) { Ph.toast(say(e)); go_.textContent = 'Publish guide'; paint(); }
        };
        const tip = h('div', 'tu-tip'); tip.append(h('b', '', 'A good guide: '), document.createTextNode('one clear goal and 3–6 short steps. Plain text only, no links or phone numbers.'));
        view.append(h('p', 'tu-lab', 'Title'), title, h('p', 'tu-lab', 'Category'), chips, h('p', 'tu-lab', 'Your guide'), ta, meter, go_, tip); paint();
      }

      const onUser = (nu) => { if (dead) return; u = nu; go(tab); }; Ph.on('user', onUser);
      go('learn');
      return { destroy() { dead = true; if (pg) pg.destroy(); refresh.remove(); }, back() { if (closeDoc) { closeDoc(); return true; } return false; } };
    }
  });
})(window);
