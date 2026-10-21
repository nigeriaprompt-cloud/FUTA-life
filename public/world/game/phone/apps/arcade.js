/* Phone app: Arcade — "Campus Dash", a one-tap endless runner that pays pocket money.  Engine: apps/arcade-dash.js.  Rules + payout: supabase/19_arcade.sql.
   FLOW (real mode): Play -> arcade_start() (server clock starts) -> game -> on "Game over" -> arcade_finish(run, score) -> the server clamps the score to what the
   elapsed time allows, pays score/10 x ₦10 into the POCKET, up to the daily cap, and returns your best. The phone never decides the money, it only shows it.
   Signed-out visitors can play a PRACTICE run (no money) and are invited to sign in. Demo mode (no Supabase keys) fakes the daily numbers on this device.
   Player pick: guy or lady runner (saved on this device). All text is inserted with textContent. */
(function (g) {
  'use strict';
  const Ph = g.FutaPhone; if (!Ph) return;
  const NICE = { slow_down: 'Hold on a few seconds before the next run.', in_jail: 'You cannot play from jail.', finish_sign_up: 'Finish sign-up first.', already_paid: 'That run was already paid.', not_found: 'That run could not be found.' };
  const nice = (e) => { const m = (e && e.message) || String(e || ''), k = Object.keys(NICE).find(x => m.indexOf(x) >= 0); return k ? NICE[k] : 'Could not reach the game server.'; };
  const naira = (n) => '₦' + Math.round(n || 0).toLocaleString('en-NG');
  const PAD = '<svg viewBox="0 0 24 24" aria-hidden="true" style="width:3em;height:3em;fill:none;stroke:currentColor;stroke-width:1.7;stroke-linecap:round;stroke-linejoin:round"><path d="M7 8h10a4.5 4.5 0 0 1 4.4 5.4l-.7 3.4a2.4 2.4 0 0 1-4 1.3L14.6 16H9.4l-2.1 2.1a2.4 2.4 0 0 1-4-1.3l-.7-3.4A4.5 4.5 0 0 1 7 8z"/><path d="M8 10.5v3M6.5 12h3"/><circle cx="15.5" cy="11.2" r=".6"/><circle cx="17.6" cy="12.8" r=".6"/></svg>';
  const DKEY = 'futa.arcade.demo';
  const ls = { get(k, d) { try { const v = g.localStorage.getItem(k); return v === null ? d : v; } catch (e) { return d; } }, set(k, v) { try { g.localStorage.setItem(k, v); } catch (e) { } } };

  Ph.registerApp({
    id: 'arcade', name: 'Arcade', title: 'Campus Dash', icon: PAD, color: ['#e0743a', '#7a2a12'],
    mount(body, ctx) {
      const demo = Ph.demo(), api = Ph.api(), el = ctx.el; let u = Ph.getUser(), dead = false, dash = null, run = null, st = null, keyFn = null, visFn = null, who = ls.get('futa.arcade.who', 'guy');
      const rpc = (n, a) => api.rpc(n, a);
      const h = (tag, css, txt) => { const e = el(tag); if (css) e.style.cssText = css; if (txt != null) e.textContent = txt; return e; };
      const btn = (label, fn, cls) => { const b = h('button'); b.type = 'button'; b.className = 'ph-btn' + (cls ? ' ' + cls : ''); b.textContent = label; b.onclick = fn; return b; };
      body.style.cssText = 'overflow:auto;padding:.7em .8em 1em;display:flex;flex-direction:column;gap:.7em';

      /* demo mode: daily numbers kept on this device */
      const dget = () => { let d; try { d = JSON.parse(ls.get(DKEY, 'null')); } catch (e) { d = null; } const day = new Date().toDateString(); if (!d || d.day !== day) d = { day, earned: 0, best: d ? d.best : 0, plays: d ? d.plays : 0 }; return d; };
      const dstat = () => { const d = dget(); return { cap: 3000, earned: d.earned, left: 3000 - d.earned, per10: 10, best: d.best, plays: d.plays }; };

      async function status() {
        if (!u) return null; if (demo) return dstat();
        try { return await rpc('arcade_status'); } catch (e) { return null; }
      }
      /* ---------- home ---------- */
      async function home() {
        stopGame(); body.innerHTML = ''; ctx.setTitle('Campus Dash');
        const hero = h('div', 'border-radius:1.1em;padding:1em;background:linear-gradient(135deg,#e0743a,#7a2a12);color:#fff7e6;display:flex;flex-direction:column;gap:.5em');
        hero.append(h('div', 'font:700 1.35em Georgia,serif', 'Campus Dash'), h('div', 'opacity:.9;font-size:.95em', 'Tap to jump over cones, generators and danfo buses. Grab ₦ coins. Every 10 points pays ₦10 into your pocket.'));
        body.appendChild(hero);
        const who2 = h('div', 'display:flex;gap:.5em'); const pick = (w, label) => { const b = h('button', 'flex:1;min-height:2.8em;border-radius:.9em;font:600 1em inherit;cursor:pointer;border:2px solid ' + (who === w ? '#e0743a' : '#e6dfcd') + ';background:' + (who === w ? '#fff1e6' : '#fff') + ';color:#3a2412', label); b.type = 'button'; b.setAttribute('aria-pressed', who === w); b.onclick = () => { who = w; ls.set('futa.arcade.who', w); home(); }; return b; };
        who2.append(pick('guy', '🧑🏾 Play as the guy'), pick('lady', '👩🏾 Play as the lady')); body.appendChild(who2);
        const play = btn('▶  Play', () => play1(), 'gold'); body.appendChild(play);
        const box = h('div', 'border:1px solid #e6dfcd;border-radius:1em;background:#fff;padding:.8em;display:flex;flex-direction:column;gap:.4em'); body.appendChild(box);
        const lb = h('div', 'border:1px solid #e6dfcd;border-radius:1em;background:#fff;padding:.8em'); body.appendChild(lb);
        if (!u) { box.append(h('div', 'font-weight:700', 'Practice mode'), h('div', 'color:#6f6a5e;font-size:.92em', 'You can play for fun. Sign in to earn real pocket money and get on the leaderboard.'), btn('Sign in or create account', () => Ph.requireLogin('earn money playing'))); lb.remove(); return; }
        st = await status(); if (dead) return;
        if (st) {
          box.append(h('div', 'display:flex;justify-content:space-between;font-weight:700', 'Today'), (() => { const r = h('div', 'display:flex;justify-content:space-between'); r.append(h('span', '', 'Earned ' + naira(st.earned) + ' of ' + naira(st.cap)), h('span', 'color:#6f6a5e', 'Best ' + (st.best | 0))); return r; })());
          const bar = h('div', 'height:.6em;border-radius:1em;background:#efe8d4;overflow:hidden'); bar.appendChild(h('div', 'height:100%;background:linear-gradient(90deg,#e0743a,#f0b429);width:' + Math.min(100, Math.round(st.earned * 100 / Math.max(1, st.cap))) + '%')); box.appendChild(bar);
          if (st.left <= 0) box.appendChild(h('div', 'color:#8a5a00;font-size:.9em', 'You reached today’s limit. You can still play for fun and the leaderboard. New earnings open tomorrow.'));
        }
        lb.append(h('div', 'font-weight:700;margin-bottom:.4em', '🏆 Top runners'));
        if (demo) { [['tola', 1240], ['amaka', 980], ['segun', 710]].forEach(([n, s], i) => lb.appendChild(lrow(i + 1, n, s, false))); return; }
        try { const rows = await rpc('arcade_board', { p_game: 'dash' }); if (dead) return; if (!rows || !rows.length) lb.appendChild(h('div', 'color:#6f6a5e', 'No scores yet. Be the first!')); (rows || []).forEach((r, i) => lb.appendChild(lrow(i + 1, r.username, r.best, r.me))); }
        catch (e) { lb.appendChild(h('div', 'color:#6f6a5e', 'Leaderboard not available right now.')); }
      }
      const lrow = (i, n, s, me) => { const r = h('div', 'display:flex;gap:.6em;padding:.3em 0;border-top:1px solid #f0ead8;' + (me ? 'font-weight:700;color:#7a2a12' : '')); r.append(h('span', 'width:1.6em;color:#6f6a5e', String(i)), h('span', 'flex:1;overflow:hidden;text-overflow:ellipsis', n), h('span', '', String(s))); return r; };

      /* ---------- one run ---------- */
      function stopGame() { if (dash) { dash.destroy(); dash = null; } if (keyFn) { g.document.removeEventListener('keydown', keyFn); g.document.removeEventListener('keyup', keyFn.up); keyFn = null; } }
      async function play1() {
        stopGame(); run = null; body.innerHTML = ''; ctx.setTitle('Campus Dash');
        const cv = h('canvas', 'width:100%;aspect-ratio:9/5;border-radius:1em;background:#16355f;touch-action:none;display:block;cursor:pointer;-webkit-tap-highlight-color:transparent'); cv.setAttribute('aria-label', 'Game. Tap to jump.');
        const info = h('div', 'text-align:center;color:#6f6a5e;font-size:.9em;min-height:1.3em', 'Getting ready…'); const res = h('div', 'display:flex;flex-direction:column;gap:.5em'); body.append(cv, info, res);
        let status0 = 'ok';
        if (u) { try { if (demo) { run = 'demo'; } else { const r = await rpc('arcade_start', { p_game: 'dash' }); run = r.run; } } catch (e) { if (dead) return; status0 = 'fail'; info.textContent = nice(e); res.append(btn('Try again', () => play1(), 'gold'), btn('Back', home)); if (!/slow_down/.test(e.message || '')) { /* e.g. jail */ } return; } }
        if (dead) return;
        dash = g.FutaDash.create(cv, { who, onEnd: finish });
        info.textContent = u ? 'Tap, click or press Space to jump' : 'Practice run — no money';
        const down = (e) => { e.preventDefault(); dash.jump(); }, up = () => dash.release();
        cv.addEventListener('pointerdown', down); cv.addEventListener('pointerup', up); cv.addEventListener('pointercancel', up); cv.addEventListener('pointerleave', up);
        keyFn = (e) => { if (e.code === 'Space' || e.code === 'ArrowUp' || e.code === 'KeyW') { e.preventDefault(); if (!e.repeat) dash && dash.jump(); } }; keyFn.up = (e) => { if (e.code === 'Space' || e.code === 'ArrowUp' || e.code === 'KeyW') dash && dash.release(); };
        g.document.addEventListener('keydown', keyFn); g.document.addEventListener('keyup', keyFn.up); dash.draw();
        async function finish(r) {
          res.innerHTML = ''; const card = h('div', 'border:1px solid #e6dfcd;border-radius:1em;background:#fff;padding:.9em;text-align:center;display:flex;flex-direction:column;gap:.3em'); res.appendChild(card);
          card.append(h('div', 'font:700 1.6em Georgia,serif;color:#7a2a12', String(r.score) + ' points'), h('div', 'color:#6f6a5e', r.coins + ' coins · ' + Math.round(r.secs) + ' seconds'));
          if (!u) { card.append(h('div', 'margin-top:.3em', 'Practice run. Sign in to earn money for runs like this.')); res.append(btn('Sign in or create account', () => Ph.requireLogin('earn money playing'), 'gold')); }
          else {
            const line = h('div', 'margin-top:.3em;font-weight:700', 'Saving your score…'); card.appendChild(line);
            try {
              if (demo) { const d = dget(); const pay = Math.max(0, Math.min(Math.floor(r.score / 10) * 10, 3000 - d.earned)); d.earned += pay; d.plays++; const nb = r.score > d.best; if (nb) d.best = r.score; ls.set(DKEY, JSON.stringify(d)); show(line, { paid: pay, new_best: nb, best: d.best, left: 3000 - d.earned }); }
              else { const out = await rpc('arcade_finish', { p_run: run, p_score: r.score }); if (dead) return; show(line, out); if (out.paid > 0 && Ph.refreshUser) Ph.refreshUser(); }
            } catch (e) { line.textContent = 'Could not save: ' + nice(e); }
          }
          res.append(btn('▶  Play again', () => play1(), 'gold'), btn('Back', home));
        }
        function show(line, o) { line.textContent = o.paid > 0 ? '+' + naira(o.paid) + ' in your pocket 🎉' : (o.left <= 0 ? 'Daily limit reached: no money this time' : 'Run a little longer to earn (at least 8 seconds)'); if (o.new_best) line.textContent += '  ·  New best!'; }
      }
      visFn = (v) => { if (!v && dash) dash.pause(); }; Ph.on('vis', visFn);
      const onUser = (nu) => { if (dead) return; u = nu; if (!dash) home(); }; Ph.on('user', onUser);
      home();
      return { back() { if (dash || run) { home(); return true; } return false; }, destroy() { dead = true; stopGame(); Ph.off && (Ph.off('user', onUser), Ph.off('vis', visFn)); } };
    }
  });
})(typeof window !== 'undefined' ? window : globalThis);
