/* ==========================================================================
   FutaCommunity — the FUTAlife WhatsApp channel + "who is online" labels, on the MAP and in the PHONE.

   WHAT YOU SEE
     • Map:    a small pill at the top right  "● 24 online".  Tap it → a card: players online, inside buildings, out on campus,
               the busiest places, and the "FUTAlife on WhatsApp" button.
     • Phone:  on the home screen, an online strip + a "FUTAlife on WhatsApp" card.   Settings → Community: the same links.
   WHERE THE NUMBERS COME FROM (counts only, no names): supabase/21_online.sql
     touch_online()  ← this file calls it about once a minute while the game is open and the player is signed in
     online_now()    → { players, inside, busiest:[{b:buildingId, n}] }  (guests may read it).  If the SQL is not installed yet, or the network
                       is down, NOTHING is shown (we never show made-up numbers).  Demo mode (no Supabase keys) shows just "1 online" (you).
   HOW TO CHANGE THINGS  — set window.FUTA_COMMUNITY before this file loads, or edit CFG below:
     whatsappChannel : your channel link (announcements; followers CANNOT message you through a channel, it is one-way)
     whatsappChat    : OPTIONAL — your WhatsApp number in international format, digits only (e.g. "2348012345678"). When set, a
                       "Message us" button (a normal chat with you) appears next to the channel button.
     chatText        : the message that is pre-filled in that chat
   Loaded by world/index.html and world/interior.html (before phone.js). phone.js calls FutaCommunity.home(homeEl) after each home render and
   settings.js calls FutaCommunity.settingsHtml(). All text is added with textContent; links open in a new tab with rel="noopener noreferrer".
   ========================================================================== */
(function (g) {
  'use strict';
  const CFG = Object.assign({
    whatsappChannel: 'https://whatsapp.com/channel/0029Vb8ycAzEgGfKUalSm62w',
    whatsappChat: '',
    chatText: 'Hello FUTAlife, I need help with something in the game.',
    pollMs: 30000, pingMs: 60000, countsMs: 15000
  }, g.FUTA_COMMUNITY || {});
  const doc = g.document; if (!doc) return;

  /* ---------- links (only WhatsApp addresses are ever opened) ---------- */
  const okUrl = (u) => /^https:\/\/(whatsapp\.com|chat\.whatsapp\.com|wa\.me)\//.test(String(u || '')) ? u : '';
  const channelUrl = () => okUrl(CFG.whatsappChannel);
  const chatUrl = () => /^\d{8,15}$/.test(String(CFG.whatsappChat || '')) ? 'https://wa.me/' + CFG.whatsappChat + '?text=' + encodeURIComponent(CFG.chatText || '') : '';

  /* our own little chat-bubble mark (not the WhatsApp logo): a green disc, a white speech bubble, three dots */
  const glyph = (px) => '<svg viewBox="0 0 40 40" width="' + px + '" height="' + px + '" aria-hidden="true" focusable="false" style="display:block;fill:none;stroke:none"><circle cx="20" cy="20" r="20" style="fill:#1faa59"/>' +
    '<path d="M20 9.8a9.4 9.4 0 0 0-8 14.3L10.8 29.6l5.7-1.5A9.4 9.4 0 1 0 20 9.8z" style="fill:#fff"/><g style="fill:#1faa59"><circle cx="16.2" cy="19.6" r="1.35"/><circle cx="20" cy="19.6" r="1.35"/><circle cx="23.8" cy="19.6" r="1.35"/></g></svg>';

  /* ---------- the online numbers ---------- */
  const S = { ok: false, players: 0, inside: 0, busiest: [] }, subs = [];
  const isDemo = () => !!(g.FUTA_CONFIG && g.FUTA_CONFIG.demo);
  const api = () => g.FutaApi && typeof g.FutaApi.rpc === 'function' ? g.FutaApi : null;
  async function refresh() {
    try {
      if (isDemo()) Object.assign(S, { ok: true, players: 1, inside: 0, busiest: [] });
      else {
        const a = api(); if (!a) return; const d = await a.rpc('online_now');
        if (!d || typeof d.players !== 'number') return;
        Object.assign(S, { ok: true, players: d.players, inside: Math.min(d.players, +d.inside || 0), busiest: Array.isArray(d.busiest) ? d.busiest.slice(0, 3) : [] });
      }
    } catch (e) { return; }   // SQL not installed yet, or offline: show nothing rather than guess
    subs.forEach(f => { try { f(S); } catch (e) { /* a broken listener must not stop the others */ } });
  }
  async function ping() {
    if (doc.hidden || isDemo()) return; const P = g.FutaPhone, u = P && P.getUser && P.getUser(), a = api(); if (!u || !a) return;
    try { await a.rpc('touch_online'); } catch (e) { /* not installed yet / offline: ignore */ }
  }
  const nameOf = (() => { let m = null; return (id) => {
    if (!m) { m = new Map(); try { ((g.PTW_DATA && g.PTW_DATA.buildings) || []).forEach(b => m.set(b.id, String(b.name || '').replace(/\s*\(.*?\)\s*/g, ' ').trim())); } catch (e) { /* no world data: fall back below */ } }
    return m.get(id) || 'A busy building'; }; })();
  const fmt = (n) => Number(n || 0).toLocaleString('en-NG');

  /* ---------- tiny DOM helpers ---------- */
  const el = (tag, cls, text) => { const e = doc.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; };
  const css = (t) => { const s = doc.createElement('style'); s.textContent = t; return s; };
  function link(cls, href) { const a = el('a', cls); a.href = href; a.target = '_blank'; a.rel = 'noopener noreferrer'; return a; }

  /* ======================================================================
     MAP: the online pill + card
     ====================================================================== */
  const MAP_CSS = [
    /* the pill: an emerald "LIVE" end-cap + an ivory count, gold hairline and a soft halo */
    '.fo-pill{position:fixed;z-index:5;top:calc(62px + env(safe-area-inset-top,0px));right:10px;height:36px;display:flex;align-items:stretch;padding:0;overflow:hidden;border-radius:999px;border:1px solid #b8923a;',
    'background:var(--bg,#fbf8f1);color:var(--fg,#1c1f1d);font:inherit;cursor:pointer;box-shadow:0 6px 18px rgba(10,30,20,.3),0 0 0 3px rgba(184,146,58,.16);-webkit-tap-highlight-color:transparent;transition:transform .15s,opacity .2s,box-shadow .2s}',
    '.fo-pill:hover{box-shadow:0 8px 22px rgba(10,30,20,.36),0 0 0 4px rgba(184,146,58,.26)}.fo-pill:active{transform:scale(.96)}.fo-pill.fo-hide{opacity:0;pointer-events:none}.fo-pill[hidden]{display:none}',
    '.fo-live{display:flex;align-items:center;gap:6px;padding:0 10px 0 12px;background:linear-gradient(135deg,#1e5a40,#0f3125);color:#f0d78c;font:700 9.5px/1 system-ui,-apple-system,Segoe UI,sans-serif;letter-spacing:.17em;text-transform:uppercase}',
    '.fo-count{display:flex;align-items:baseline;gap:5px;padding:0 14px 0 11px;align-self:center}.fo-count b{font:700 16px/1 Georgia,"Iowan Old Style",serif}',
    '.fo-count span{font:600 12px/1 system-ui,-apple-system,Segoe UI,sans-serif;color:var(--mut,#666)}',
    '.fo-dot{width:7px;height:7px;border-radius:50%;background:#5fe3a1;flex:none;animation:fo-pulse 2.4s ease-out infinite}',
    '@keyframes fo-pulse{0%{box-shadow:0 0 0 0 rgba(95,227,161,.65)}70%{box-shadow:0 0 0 7px rgba(95,227,161,0)}100%{box-shadow:0 0 0 0 rgba(95,227,161,0)}}',
    '@media (prefers-reduced-motion:reduce){.fo-dot{animation:none}.fo-card{animation:none!important}}',
    /* the card: an emerald hero with a big gold number, a split meter, ranked places, the WhatsApp button */
    '.fo-card{box-sizing:border-box;position:fixed;z-index:7;top:calc(106px + env(safe-area-inset-top,0px));right:10px;width:min(312px,calc(100vw - 20px));max-height:calc(100vh - 130px);overflow:auto;border-radius:20px;',
    'background:var(--bg,#fbf8f1);color:var(--fg,#1c1f1d);border:1px solid #b8923a;box-shadow:0 18px 48px rgba(8,22,16,.45),0 0 0 4px rgba(184,146,58,.14);font:13px/1.35 system-ui,-apple-system,Segoe UI,sans-serif;transform-origin:top right;animation:fo-in .2s ease-out}',
    '.fo-card[hidden]{display:none}@keyframes fo-in{from{opacity:0;transform:translateY(-8px) scale(.96)}to{opacity:1;transform:none}}',
    '.fo-hero{position:relative;padding:15px 16px 17px;color:#f6efdc;background:radial-gradient(120% 150% at 88% -25%,rgba(240,215,140,.32),transparent 58%),radial-gradient(90% 90% at 0% 120%,rgba(95,227,161,.16),transparent 60%),linear-gradient(160deg,#1e5a40,#0f3125 72%)}',
    '.fo-hero::after{content:"";position:absolute;left:16px;right:16px;bottom:0;height:1px;background:linear-gradient(90deg,transparent,#c9a24a,transparent)}',
    '.fo-eyebrow{display:flex;align-items:center;gap:7px;font:700 10px/1 system-ui,sans-serif;letter-spacing:.17em;text-transform:uppercase;color:#f0d78c}',
    '.fo-x{position:absolute;top:10px;right:10px;width:28px;height:28px;display:grid;place-items:center;padding:0;border-radius:50%;border:1px solid rgba(240,215,140,.45);background:rgba(255,255,255,.08);color:#f0d78c;font:15px/1 system-ui,sans-serif;cursor:pointer}.fo-x:hover{background:rgba(255,255,255,.16)}',
    '.fo-big{display:flex;align-items:baseline;gap:9px;margin-top:10px}.fo-big b{font:700 50px/.92 Georgia,"Iowan Old Style",serif;color:#f0d78c;text-shadow:0 2px 14px rgba(0,0,0,.3);letter-spacing:-.01em}',
    '.fo-big span{font:600 15px/1.1 Georgia,serif;color:#efe6cb}.fo-sub{margin:7px 0 0;font-size:11.5px;color:#c9d6cc}',
    '.fo-body{padding:14px 16px 14px}',
    '.fo-meter{display:flex;height:9px;border-radius:99px;overflow:hidden;background:color-mix(in srgb,var(--ln,#d9cfb8) 75%,transparent);box-shadow:inset 0 1px 2px rgba(0,0,0,.12)}.fo-meter i{display:block;height:100%;transition:width .5s ease}',
    '.fo-meter .in{background:linear-gradient(90deg,#c9a24a,#e8c96d)}.fo-meter .out{background:linear-gradient(90deg,#2f9d6a,#55c993)}',
    '.fo-legend{display:flex;flex-wrap:wrap;gap:6px 16px;margin:10px 0 14px;font-size:12px;color:var(--mut,#666)}.fo-legend div{display:flex;align-items:center;gap:6px}',
    '.fo-legend b{font:700 15px/1 Georgia,serif;color:var(--fg,#1c1f1d)}.fo-legend i{width:9px;height:9px;border-radius:50%;flex:none}',
    '.fo-busy h4{margin:0 0 4px;font:700 10px/1 system-ui,sans-serif;letter-spacing:.16em;text-transform:uppercase;color:var(--mut,#666)}',
    '.fo-busy ol{list-style:none;margin:0 0 12px;padding:0}.fo-busy li{display:flex;align-items:center;gap:10px;padding:8px 0;border-bottom:1px solid color-mix(in srgb,var(--ln,#d9cfb8) 70%,transparent)}.fo-busy li:last-child{border-bottom:0}',
    '.fo-rank{width:22px;height:22px;flex:none;display:grid;place-items:center;border-radius:50%;font:700 12px/1 Georgia,serif;color:#12392a;background:linear-gradient(180deg,#f0d78c,#c9a24a);box-shadow:0 1px 3px rgba(0,0,0,.25)}',
    '.fo-busy li span{flex:1;min-width:0;font:600 13.5px/1.2 Georgia,serif}.fo-busy li em{font:700 11px/1 system-ui,sans-serif;font-style:normal;padding:5px 9px;border-radius:99px;color:var(--ac,#1e4d37);background:color-mix(in srgb,var(--ac,#1e4d37) 12%,transparent);white-space:nowrap}',
    '.fo-note{margin:0 0 12px;font-size:11px;color:var(--mut,#666)}',
    '.fo-wa{display:flex;align-items:center;gap:11px;padding:10px 12px;border-radius:14px;text-decoration:none;color:#f6efdc;background:linear-gradient(135deg,#1e5a40,#12392a);border:1px solid #c9a24a;box-shadow:0 4px 12px rgba(18,57,42,.3)}',
    '.fo-wa:hover{filter:brightness(1.08)}.fo-wa svg{flex:none}.fo-wa span{flex:1;min-width:0}.fo-wa b{display:block;font:700 15px/1.15 Georgia,serif}.fo-wa small{display:block;margin-top:3px;font-size:11.5px;color:#d9cfae}',
    '.fo-wa i{font-style:normal;font-weight:700;color:#f0d78c;font-size:16px}',
    '.fo-wa2{display:block;margin-top:8px;text-align:center;padding:9px;border-radius:12px;text-decoration:none;font-weight:700;color:var(--ac,#1e4d37);border:1px solid #b8923a;background:transparent}'
  ].join('');

  function mountMap() {
    if (!doc.getElementById('zoom') || doc.getElementById('futaOnline')) return;   // only the map page has the zoom card
    doc.head.appendChild(css(MAP_CSS));
    const reduce = !!(g.matchMedia && g.matchMedia('(prefers-reduced-motion: reduce)').matches);
    const pill = el('button', 'fo-pill'); pill.id = 'futaOnline'; pill.type = 'button'; pill.hidden = true; pill.setAttribute('aria-haspopup', 'dialog'); pill.setAttribute('aria-expanded', 'false');
    const live = el('span', 'fo-live'); live.append(el('i', 'fo-dot'), doc.createTextNode('Live'));
    const cnt = el('span', 'fo-count'), num = el('b', '', '0'); cnt.append(num, el('span', '', 'online')); pill.append(live, cnt);
    const card = el('div', 'fo-card'); card.hidden = true; card.setAttribute('role', 'dialog'); card.setAttribute('aria-label', 'Who is online');
    doc.body.append(pill, card);

    function countUp(node, to) {   // a short count-up the first time the card opens
      if (reduce || to < 2) { node.textContent = fmt(to); return; }
      const t0 = g.performance.now(), dur = 550; const step = (t) => { const k = Math.min(1, (t - t0) / dur), e = 1 - Math.pow(1 - k, 3); node.textContent = fmt(Math.round(to * e)); if (k < 1 && node.isConnected) g.requestAnimationFrame(step); }; g.requestAnimationFrame(step);
    }
    function paintCard(animate) {
      card.textContent = '';
      const hero = el('div', 'fo-hero'), eb = el('div', 'fo-eyebrow'); eb.append(el('i', 'fo-dot'), doc.createTextNode('Live on FUTA World'));
      const x = el('button', 'fo-x', '✕'); x.type = 'button'; x.setAttribute('aria-label', 'Close'); x.addEventListener('click', (e) => { e.stopPropagation(); open(false); });
      const big = el('div', 'fo-big'), bn = el('b', '', animate ? '0' : fmt(S.players)); big.append(bn, el('span', '', S.players === 1 ? 'player online' : 'players online'));
      hero.append(eb, x, big, el('p', 'fo-sub', 'Right now, across the whole campus')); card.appendChild(hero);
      const body = el('div', 'fo-body'), out = Math.max(0, S.players - S.inside), pin = S.players ? Math.round(100 * S.inside / S.players) : 0;
      const meter = el('div', 'fo-meter'); meter.setAttribute('role', 'img'); meter.setAttribute('aria-label', S.inside + ' inside buildings, ' + out + ' out on campus');
      const mi = el('i', 'in'), mo = el('i', 'out'); mi.style.width = pin + '%'; mo.style.width = (S.players ? 100 - pin : 0) + '%'; meter.append(mi, mo);
      const lg = el('div', 'fo-legend');
      [['#d9b24f', S.inside, 'inside buildings'], ['#3fae7c', out, 'out on campus']].forEach(([c, n, t]) => { const d = el('div'), dot = el('i'); dot.style.background = c; d.append(dot, el('b', '', fmt(n)), doc.createTextNode(t)); lg.appendChild(d); });
      body.append(meter, lg);
      if (S.busiest.length) { const bz = el('div', 'fo-busy'), ol = el('ol'); bz.appendChild(el('h4', '', 'Busiest places')); S.busiest.forEach((x2, i) => { const li = el('li'); li.append(el('b', 'fo-rank', String(i + 1)), el('span', '', nameOf(x2.b)), el('em', '', fmt(x2.n) + ' here')); ol.appendChild(li); }); bz.appendChild(ol); body.appendChild(bz); }
      body.appendChild(el('p', 'fo-note', 'Counts only. Names and exact places stay private.'));
      const ch = channelUrl(); if (ch) { const a = link('fo-wa', ch); a.innerHTML = glyph(34); const t = el('span'); t.append(el('b', '', 'FUTAlife on WhatsApp'), el('small', '', 'News, updates and help from the team')); a.append(t, el('i', '', '↗')); body.appendChild(a); }
      const cu = chatUrl(); if (cu) { const a = link('fo-wa2', cu); a.textContent = 'Message us directly'; body.appendChild(a); }
      card.appendChild(body); if (animate) countUp(bn, S.players);
    }
    const open = (v) => { card.hidden = !v; pill.setAttribute('aria-expanded', String(v)); if (v) paintCard(true); };
    pill.addEventListener('click', (e) => { e.stopPropagation(); open(card.hidden); });
    doc.addEventListener('click', (e) => { if (!card.hidden && !card.contains(e.target) && e.target !== pill) open(false); });
    doc.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !card.hidden) open(false); });
    subs.push(() => { pill.hidden = !S.ok; num.textContent = fmt(S.players); if (!card.hidden) paintCard(false); });
    startBuildingCounts();
    // step aside while the building zoom bar is showing (it sits in the same corner on phones)
    setInterval(() => { const c = doc.getElementById('cmp'); const busy = !!c && g.getComputedStyle(c).display !== 'none'; pill.classList.toggle('fo-hide', busy); if (busy && !card.hidden) open(false); }, 400);
  }

  /* ======================================================================
     PHONE: home-screen strip + WhatsApp card  (lives inside the phone's shadow DOM, so it carries its own style)
     ====================================================================== */
  const HOME_CSS = [
    '.fo-home{display:flex;flex-direction:column;gap:.55em;margin:.4em 0 1.2em}.fo-foot{display:flex;justify-content:center;margin:.1em 0 .55em}',
    '.fo-strip{display:inline-flex;align-items:center;gap:.6em;padding:.6em 1.1em;border-radius:999px;color:#fff;font-size:.84em;background:rgba(255,255,255,.1);-webkit-backdrop-filter:blur(14px);backdrop-filter:blur(14px);border:1px solid rgba(255,255,255,.14)}',
    '.fo-strip[hidden]{display:none}.fo-strip b{font:700 1.18em Georgia,serif;color:var(--gold2)}.fo-strip s{text-decoration:none;opacity:.8}.fo-strip .sep{opacity:.35}',
    '.fo-dot{width:.62em;height:.62em;border-radius:50%;background:#3ddc97;flex:none;animation:fo-pulse 2.4s ease-out infinite}',
    '@keyframes fo-pulse{0%{box-shadow:0 0 0 0 rgba(61,220,151,.55)}70%{box-shadow:0 0 0 .55em rgba(61,220,151,0)}100%{box-shadow:0 0 0 0 rgba(61,220,151,0)}}',
    '@media (prefers-reduced-motion:reduce){.fo-dot{animation:none}}',
    '.fo-wacard{display:flex;align-items:center;gap:.75em;padding:.55em .75em .55em .65em;border-radius:1.2em;text-decoration:none;color:#fff;background:linear-gradient(135deg,rgba(255,255,255,.17),rgba(255,255,255,.07));',
    '-webkit-backdrop-filter:blur(14px);backdrop-filter:blur(14px);border:1px solid rgba(240,215,140,.5);box-shadow:0 .5em 1.4em rgba(0,0,0,.22),inset 0 1px 0 rgba(255,255,255,.18)}',
    '.fo-wacard:active{transform:scale(.985)}.fo-wacard svg{flex:none;width:2.5em;height:2.5em;filter:drop-shadow(0 .15em .25em rgba(0,0,0,.35))}',
    '.fo-wacard .tx{flex:1;min-width:0}.fo-wacard b{display:block;font:700 1.12em/1.1 Georgia,"Iowan Old Style",serif;letter-spacing:.005em}',
    '.fo-wacard small{display:block;margin-top:.25em;font-size:.8em;opacity:.78;line-height:1.25}',
    '.fo-wacard .go{flex:none;padding:.5em 1em;border-radius:999px;font-weight:700;font-size:.82em;color:var(--emerald,#12392a);background:linear-gradient(180deg,var(--gold2,#f0d78c),var(--gold,#c9a24a));box-shadow:0 .15em .5em rgba(0,0,0,.25)}',
    '.fo-chat{display:block;text-align:center;padding:.6em;border-radius:999px;font-weight:700;font-size:.84em;text-decoration:none;color:var(--gold2,#f0d78c);border:1px solid rgba(240,215,140,.45);background:rgba(0,0,0,.12)}'
  ].join('');

  let strips = new Set();
  function paintStrip(s) {
    s.textContent = ''; s.hidden = !S.ok; if (!S.ok) return;
    s.append(el('i', 'fo-dot'), el('b', '', fmt(S.players)), el('s', '', S.players === 1 ? ' player online' : ' players online'));
    if (S.inside > 0) s.append(el('span', 'sep', '·'), el('b', '', fmt(S.inside)), el('s', '', ' inside buildings'));
  }
  subs.push(() => { strips.forEach(s => { if (s.isConnected) paintStrip(s); else strips.delete(s); }); });
  function home(homeEl) {
    if (!homeEl) return; homeEl.querySelectorAll('.fo-home,.fo-foot').forEach(n => n.remove());
    const box = el('div', 'fo-home'); box.appendChild(css(HOME_CSS));          // the WhatsApp card sits BELOW all the apps
    const ch = channelUrl();
    if (ch) { const a = link('fo-wacard', ch); a.innerHTML = glyph(44); const t = el('span', 'tx'); t.append(el('b', '', 'FUTAlife'), el('small', '', 'Join our WhatsApp channel')); a.append(t, el('span', 'go', 'Follow')); box.appendChild(a); }
    const cu = chatUrl(); if (cu) { const a = link('fo-chat', cu); a.textContent = 'Message us on WhatsApp'; box.appendChild(a); }
    homeEl.appendChild(box);
    const foot = el('div', 'fo-foot');                                         // the online strip sits just BELOW the clock
    const strip = el('div', 'fo-strip'); strip.setAttribute('aria-live', 'polite'); strips.add(strip); paintStrip(strip); foot.appendChild(strip);
    const clk = homeEl.querySelector('.ph-clock'); homeEl.insertBefore(foot, clk ? clk.nextSibling : homeEl.firstChild);
  }

  /* Settings → Community (same look as the other Settings rows) */
  function settingsHtml() {
    const row = (href, title, sub) => '<a class="ph-row" href="' + href + '" target="_blank" rel="noopener noreferrer" style="text-decoration:none;color:inherit"><span class="ri" style="display:grid;place-items:center">' + glyph(26) + '</span><span class="t"><b>' + title + '</b><small>' + sub + '</small></span><span aria-hidden="true" style="color:var(--mute);font-size:1.3em;padding-left:.3em">›</span></a>';
    const ch = channelUrl(), cu = chatUrl(); if (!ch && !cu) return '';
    return '<div class="ph-h">Community</div><div class="ph-list">' + (ch ? row(ch, 'Follow FUTAlife on WhatsApp', 'News, updates and help') : '') + (cu ? row(cu, 'Message us on WhatsApp', 'Questions, ideas or problems') : '') + '</div>';
  }

  /* ---------- real headcount per building (map only) ----------
     building_counts() (supabase/22_building_counts.sql) → { buildingId: n }.  Real data only: if the SQL is not installed, the network is down or
     this is demo mode, ok stays false and the map shows no numbers at all. */
  const BC = { ok: false, map: {} }, bcSubs = []; let bcOn = false, released = false;
  async function refreshCounts() {
    if (doc.hidden || isDemo()) return; const a = api(); if (!a) return;
    try {
      const P = g.FutaPhone, u = P && P.getUser && P.getUser();
      if (u && !released) { released = true; try { await a.rpc('leave_building'); } catch (e) { /* ignore */ } }   // the map means you are outside: clears a building left behind by a closed tab
      const d = await a.rpc('building_counts'); if (!d || typeof d !== 'object') return;
      BC.ok = true; BC.map = d;
    } catch (e) { return; }
    bcSubs.forEach(f => { try { f(BC.map); } catch (e) { /* keep going */ } });
  }
  function startBuildingCounts() {
    if (bcOn) return; bcOn = true; let n = 0;
    const kick = () => { if (!isDemo() && !api() && n++ < 60) { setTimeout(kick, 500); return; } refreshCounts(); setInterval(refreshCounts, CFG.countsMs); };
    setTimeout(kick, 800);
    doc.addEventListener('visibilitychange', () => { if (!doc.hidden) refreshCounts(); });
  }

  /* ---------- start ---------- */
  let started = false, tries = 0;
  function start() {
    if (started) return; if (!isDemo() && !api() && tries++ < 60) { setTimeout(start, 500); return; }   // wait for phone.js to load the sign-in code
    started = true; refresh(); ping();
    setInterval(() => { if (!doc.hidden) refresh(); }, CFG.pollMs); setInterval(ping, CFG.pingMs);
    doc.addEventListener('visibilitychange', () => { if (!doc.hidden) { refresh(); ping(); } });
    const P = g.FutaPhone; if (P && P.on) P.on('user', () => { ping(); });
  }
  const boot = () => { mountMap(); setTimeout(start, 600); };
  if (doc.readyState === 'loading') doc.addEventListener('DOMContentLoaded', boot); else boot();

  g.FutaCommunity = { config: CFG, get: () => Object.assign({}, S), on: (f) => { subs.push(f); }, counts: () => BC.map, onCounts: (f) => { bcSubs.push(f); if (BC.ok) f(BC.map); }, refreshCounts, refresh, ping, home, settingsHtml, channelUrl, chatUrl };
})(window);
