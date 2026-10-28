/* ==========================================================================
   FUTA Phone — the in-game phone that floats over the map.
   WHAT THIS FILE DOES: builds the phone shell (frame, status bar, home screen, dock, app screen), the round launcher button,
   hide / call-out (button, swipe down, Esc, home bar), and a tiny app registry. It also loads the sign-in code (config.js + api.js)
   so apps know who is logged in.
   HOW TO ADD AN APP (another dev / Claude account): create  apps/<id>.js  that calls  FutaPhone.registerApp({...})  and add "<id>"
   to apps/manifest.js. Nothing else to touch. See game/phone/README.md.
   Apps never touch the map; the phone only draws DOM on top of it.
   ========================================================================== */
(function (g) {
  'use strict';
  if (g.FutaPhone) return;
  const BASE = (document.currentScript && document.currentScript.src || location.href).replace(/[^/]*$/, '');   // .../game/phone/
  const ONBOARD = BASE + '../onboarding/', VENDOR = BASE + '../../vendor/';
  const SIGNUP_URL = '/world/game/onboarding/signup.html';
  const store = { get(k, d) { try { const v = localStorage.getItem('futa.phone.' + k); return v === null ? d : JSON.parse(v); } catch (e) { return d; } }, set(k, v) { try { localStorage.setItem('futa.phone.' + k, JSON.stringify(v)); } catch (e) { } } };
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const el = (tag, cls, html) => { const e = document.createElement(tag); if (cls) e.className = cls; if (html != null) e.innerHTML = html; return e; };

  /* ---------- icons (stroke icons, 24x24). Apps can use  icon:'chat'  or pass their own <svg>…</svg> string ---------- */
  const P = (d) => '<svg viewBox="0 0 24 24" aria-hidden="true">' + d + '</svg>';
  const ICONS = {
    phone: P('<rect x="7" y="2.5" width="10" height="19" rx="2.5"/><path d="M10.5 18.5h3"/>'),
    chat: P('<path d="M4 5.5h16a1.5 1.5 0 0 1 1.5 1.5v8.5A1.5 1.5 0 0 1 20 17H10l-4.5 3.5V17H4a1.5 1.5 0 0 1-1.5-1.5V7A1.5 1.5 0 0 1 4 5.5z"/><path d="M7.5 10h9M7.5 13h5.5"/>'),
    settings: P('<circle cx="12" cy="12" r="3"/><path d="M19.4 14.6a1.6 1.6 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.6 1.6 0 0 0-1.8-.3 1.6 1.6 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.6 1.6 0 0 0-1-1.5 1.6 1.6 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.6 1.6 0 0 0 .3-1.8 1.6 1.6 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.6 1.6 0 0 0 1.5-1 1.6 1.6 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.6 1.6 0 0 0 1.8.3h0a1.6 1.6 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.6 1.6 0 0 0 1 1.5 1.6 1.6 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.6 1.6 0 0 0-.3 1.8v0a1.6 1.6 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.6 1.6 0 0 0-1.5 1z"/>'),
    home: P('<path d="M3 11l9-7.5 9 7.5"/><path d="M5.5 9.5V20h13V9.5"/><path d="M10 20v-5.5h4V20"/>'),
    car: P('<path d="M4 15.5V12l1.8-4.6A2 2 0 0 1 7.7 6h8.6a2 2 0 0 1 1.9 1.4L20 12v3.5"/><rect x="3" y="12" width="18" height="5" rx="1.6"/><circle cx="7.5" cy="17.5" r="1.7"/><circle cx="16.5" cy="17.5" r="1.7"/><path d="M6 12h12"/>'),
    shirt: P('<path d="M8.5 3.5L3 6.5l2.2 4 2.3-1.2V20.5h9V9.3l2.3 1.2 2.2-4-5.5-3a3.5 3.5 0 0 1-7 0z"/>'),
    watch: P('<rect x="7" y="6.5" width="10" height="11" rx="3"/><path d="M9 6.5l.7-3h4.6l.7 3M9 17.5l.7 3h4.6l.7-3"/><path d="M12 10v2.3l1.6 1"/>'),
    gem: P('<path d="M6.5 4h11l4 5.5L12 20.5 2.5 9.5z"/><path d="M2.5 9.5h19M9 4l-2 5.5 5 11 5-11L15 4"/>'),
    back: P('<path d="M15 5l-7 7 7 7"/>'), down: P('<path d="M6 9l6 6 6-6"/>'), chev: P('<path d="M9 5l7 7-7 7"/>'), send: P('<path d="M21 3L10.5 13.5"/><path d="M21 3l-6.5 18-4-7.5L3 9.5z"/>'),
    user: P('<circle cx="12" cy="8" r="4"/><path d="M4 20.5c1-4 4.2-6 8-6s7 2 8 6"/>'), lock: P('<rect x="5" y="10.5" width="14" height="10" rx="2"/><path d="M8 10.5V8a4 4 0 0 1 8 0v2.5"/>'),
    shield: P('<path d="M12 3l8 3v6c0 4.5-3.2 7.8-8 9-4.8-1.2-8-4.5-8-9V6z"/><path d="M8.5 12l2.5 2.5 4.5-5"/>'),
    out: P('<path d="M9 4.5H5.5A1.5 1.5 0 0 0 4 6v12a1.5 1.5 0 0 0 1.5 1.5H9"/><path d="M16 8l4 4-4 4M20 12H9"/>'),
    wallet: P('<path d="M3.5 7.5A2 2 0 0 1 5.5 5.5H18v3"/><rect x="3.5" y="7.5" width="17" height="12" rx="2"/><circle cx="16.5" cy="13.5" r="1.1"/>'),
    search: P('<circle cx="11" cy="11" r="6.5"/><path d="M16 16l4.5 4.5"/>'), people: P('<circle cx="9" cy="8.5" r="3.3"/><path d="M2.8 20c.8-3.6 3.2-5.3 6.2-5.3s5.4 1.7 6.2 5.3"/><circle cx="17" cy="9.5" r="2.6"/><path d="M17.5 14.5c2.2.2 3.3 1.8 3.8 4.5"/>'),
    info: P('<circle cx="12" cy="12" r="9"/><path d="M12 11v5.5M12 7.8v.1"/>'), face: P('<circle cx="12" cy="12" r="9"/><path d="M8.5 14.5c1 1.4 2.2 2 3.5 2s2.5-.6 3.5-2"/><path d="M9 9.8v.1M15 9.8v.1"/>'), tag: P('<path d="M3 12.5V4h8.5L21 13.5 13.5 21z"/><circle cx="7.5" cy="8.5" r="1.2"/>')
  };

  /* ---------- state ---------- */
  const apps = new Map(); let order = [], user = null, authDone = false, openApp = null, current = null, hideOnClose = false, host, shadow, root, view, homeEl, appEl, toastEl, btn, ready = false;
  const subs = { user: [], open: [] }, badges = {};
  const P_ = { icons: ICONS, esc, el, store, SIGNUP_URL, BASE };

  P_.registerApp = function (d) { if (!d || !d.id) return; apps.set(d.id, d); if (ready) buildHome(); };
  P_.getUser = () => user;
  P_.isOpen = () => !!root && root.classList.contains('open');
  P_.on = (ev, fn) => { (subs[ev] || (subs[ev] = [])).push(fn); };
  P_.off = (ev, fn) => { subs[ev] = (subs[ev] || []).filter(f => f !== fn); };
  const emit = (ev, a) => (subs[ev] || []).forEach(f => { try { f(a); } catch (e) { console.error('[phone]', e); } });
  P_.toast = function (msg) { if (!toastEl) return; toastEl.textContent = msg; toastEl.classList.add('show'); clearTimeout(P_.toast.t); P_.toast.t = setTimeout(() => toastEl.classList.remove('show'), 2600); };
  /* Pop-down alert that is visible even while the phone is hidden (new money, messages).  P_.alert({ title, body, icon, app, opts, vibrate })
     Tapping it opens the phone on that app.  Text is inserted with textContent. */
  let bannerEl = null;
  P_.alert = function (a) {
    if (!a || !a.title) return; if (!bannerEl) { bannerEl = el('button'); bannerEl.type = 'button'; bannerEl.className = 'ph-banner'; bannerEl.setAttribute('role', 'status'); shadow.appendChild(bannerEl); }
    bannerEl.innerHTML = '<i></i><span><b></b><small></small></span>'; bannerEl.querySelector('i').textContent = a.icon || '🔔'; bannerEl.querySelector('b').textContent = a.title; bannerEl.querySelector('small').textContent = a.body || '';
    bannerEl.onclick = () => { bannerEl.classList.remove('show'); P_.show(true); if (a.app) P_.open(a.app, a.opts); };
    bannerEl.classList.remove('show'); void bannerEl.offsetWidth; bannerEl.classList.add('show'); clearTimeout(P_.alert.t); P_.alert.t = setTimeout(() => bannerEl && bannerEl.classList.remove('show'), 6000);
    if (a.vibrate !== false) { try { g.navigator.vibrate && g.navigator.vibrate([90, 60, 90]); } catch (e) { } }
  };
  /* WhatsApp-style heads-up with quick reply.  P_.notify({ key, icon, title, body, count, placeholder, onOpen(), onRead(), onReply(text) -> Promise })
     Shows a card at the top (even while the phone is hidden): who wrote, the message, and  Reply · Mark as read · ✕.  Reply opens an input right in the card, so the player
     never has to open the app.  Calling it again with the same key while it is up just updates the text (and keeps whatever the player is typing).
     It stays while the player is typing; otherwise it hides itself after ~9 s.  All text goes in with textContent.  P_.notifyHide(key) closes it (e.g. the chat is now open). */
  let headsEl = null, headsT = null, headsA = null;
  const headsBusy = () => !!(headsEl && (headsEl.classList.contains('typing') || headsEl.classList.contains('sending') || (headsEl.querySelector('input') || {}).value));
  const headsTimer = () => { clearTimeout(headsT); headsT = setTimeout(() => { if (headsBusy() || (headsEl && headsEl.matches(':hover'))) headsTimer(); else P_.notifyHide(); }, 9000); };
  P_.notifyHide = function (key) { if (!headsEl || (key != null && headsA && headsA.key !== key)) return; clearTimeout(headsT); const e = headsEl, x = headsA; e.classList.remove('show', 'typing', 'sending'); headsA = null; if (x && x.onHide) { try { x.onHide(); } catch (err) { } } const inp = e.querySelector('input'); if (inp) { inp.value = ''; inp.blur(); } };
  P_.notify = function (a) {
    if (!a || !a.title || !shadow) return;
    if (!headsEl) {
      headsEl = el('div'); headsEl.className = 'ph-heads'; headsEl.setAttribute('role', 'alert');
      headsEl.innerHTML = '<div class="ph-hd"><i></i><b></b><em>now</em><button type="button" class="ph-hx" aria-label="Close">✕</button></div><div class="ph-hm" role="button" tabindex="0"></div><div class="ph-ha"><button type="button" class="ph-hr">↩ Reply</button><button type="button" class="ph-hk">✓ Mark as read</button></div><form class="ph-hf" autocomplete="off"><input type="text" maxlength="240" enterkeyhint="send"><button type="submit">Send</button></form><div class="ph-hs" aria-live="polite"></div>';
      ['pointerdown', 'pointermove', 'pointerup', 'wheel', 'touchstart', 'touchmove', 'mousedown', 'dblclick', 'contextmenu', 'keydown', 'keyup', 'keypress'].forEach(ev => headsEl.addEventListener(ev, e => e.stopPropagation(), { passive: true }));   // typing here must never walk the character
      shadow.appendChild(headsEl);
      const q = (s) => headsEl.querySelector(s), inp = q('input'), st = q('.ph-hs');
      q('.ph-hx').onclick = () => P_.notifyHide();
      q('.ph-hm').onclick = () => { const x = headsA; P_.notifyHide(); if (x && x.onOpen) { P_.show(true); x.onOpen(); } };
      q('.ph-hk').onclick = () => { const x = headsA; P_.notifyHide(); if (x && x.onRead) { try { x.onRead(); } catch (e) { } } };
      q('.ph-hr').onclick = () => { headsEl.classList.add('typing'); clearTimeout(headsT); setTimeout(() => inp.focus(), 30); };
      inp.addEventListener('focus', () => { headsEl.classList.add('typing'); clearTimeout(headsT); });
      inp.addEventListener('blur', () => { if (!inp.value) { headsEl.classList.remove('typing'); if (headsEl.classList.contains('show')) headsTimer(); } });
      inp.addEventListener('keydown', (e) => { if (e.key === 'Escape') { inp.value = ''; P_.notifyHide(); } });
      q('.ph-hf').addEventListener('submit', async (e) => {
        e.preventDefault(); const x = headsA, txt = inp.value.trim(); if (!x || !txt || headsEl.classList.contains('sending')) return;
        headsEl.classList.add('sending'); inp.disabled = true; st.textContent = 'Sending…'; st.className = 'ph-hs';
        try { await x.onReply(txt); inp.value = ''; st.textContent = 'Sent ✓'; st.className = 'ph-hs ok'; setTimeout(() => { if (headsA === x) P_.notifyHide(); }, 900); }
        catch (err) { st.textContent = (err && err.message) || 'Could not send. Try again.'; st.className = 'ph-hs bad'; }
        headsEl.classList.remove('sending'); inp.disabled = false; if (headsA === x && st.className.indexOf('bad') >= 0) inp.focus();
      });
    }
    const same = headsA && headsA.key === a.key && headsEl.classList.contains('show'); headsA = a;
    const q = (s) => headsEl.querySelector(s);
    q('.ph-hd i').textContent = a.icon || '💬'; q('.ph-hd b').textContent = a.title; q('.ph-hm').textContent = a.body || ''; q('.ph-hd em').textContent = a.count > 1 ? a.count + ' new' : 'now';
    q('input').placeholder = a.placeholder || 'Reply…'; q('.ph-hr').hidden = !a.onReply; q('.ph-hk').hidden = !a.onRead; q('.ph-hf').hidden = !a.onReply;
    if (!same) { q('.ph-hs').textContent = ''; q('.ph-hs').className = 'ph-hs'; q('input').value = ''; headsEl.classList.remove('typing', 'sending'); }
    headsEl.classList.add('show'); headsTimer();
    if (!same && a.vibrate !== false) { try { g.navigator.vibrate && g.navigator.vibrate([90, 60, 90]); } catch (e) { } }
  };
  P_.badge = function (id, n) { badges[id] = n | 0; buildHome(); const total = Object.values(badges).reduce((a, b) => a + b, 0); btn.classList.toggle('has', total > 0); btn.querySelector('.badge').textContent = total > 99 ? '99+' : total; };
  P_.api = () => g.FutaApi || null;
  P_.demo = () => !!(g.FUTA_CONFIG && g.FUTA_CONFIG.demo);

  /* ---------- sign-in plumbing (loads the same files the sign-up page uses) ---------- */
  function loadScript(src) { return new Promise((res, rej) => { const s = document.createElement('script'); s.src = src; s.onload = res; s.onerror = () => rej(new Error('load ' + src)); document.head.appendChild(s); }); }
  async function loadAuth() {
    try {
      if (!g.FUTA_CONFIG) await loadScript(ONBOARD + 'config.js');
      if (!g.FUTA_CONFIG.demo && !g.supabase) await loadScript(VENDOR + 'supabase.min.js');
      if (!g.FutaApi) await loadScript(ONBOARD + 'api.js');
      await P_.refreshUser();
      g.FutaApi.onAuth((ev) => { if (ev === 'SIGNED_OUT' && user) { user = null; emit('user', null); renderHome(); if (openApp) P_.home(); } else if (ev === 'SIGNED_IN') P_.refreshUser(); });
    } catch (e) { console.warn('[phone] sign-in code not available:', e.message); }
  }
  P_.refreshUser = function () { return g.FutaApi.me().then(r => { user = r.user || null; authDone = true; emit('user', user); renderHome(); return user; }).catch(() => { user = null; authDone = true; emit('user', null); renderHome(); return null; }); };

  /* ---------- GUEST MODE: anyone can look around; real actions ask them to sign in ----------
     P_.isGuest()            true once we know nobody is signed in (never true in demo mode)
     P_.requireLogin(why)    shows the "Sign in to <why>" sheet (Sign in or create account / Not now); returns true when the caller must stop (guest)
     Signing in brings the player back to this same page (signup page reads ?next=). */
  P_.isGuest = () => authDone && !user && !P_.demo();
  const nextUrl = () => { try { return location.pathname + location.search + location.hash; } catch (e) { return '/world/'; } };
  P_.loginUrl = () => SIGNUP_URL + '?next=' + encodeURIComponent(nextUrl());
  let gateEl = null;
  P_.requireLogin = function (why) {
    if (user || P_.demo()) return false; if (!shadow) return true;
    if (gateEl) gateEl.remove();
    gateEl = el('div'); gateEl.className = 'ph-gate'; gateEl.setAttribute('role', 'dialog'); gateEl.setAttribute('aria-modal', 'true'); gateEl.setAttribute('aria-label', 'Sign in');
    gateEl.style.cssText = 'position:fixed;inset:0;z-index:99;display:grid;place-items:center;background:rgba(8,20,14,.55);padding:16px;font:14px/1.4 system-ui,-apple-system,"Segoe UI",Roboto,sans-serif';
    const card = el('div'); card.style.cssText = 'width:min(92vw,340px);background:#fbf8f1;color:#1f2622;border:1px solid #c9a24a;border-radius:1.2em;padding:1.3em 1.2em;text-align:center;box-shadow:0 18px 50px rgba(0,0,0,.5)';
    const h = el('div'); h.style.cssText = 'font:700 1.25em Georgia,serif;color:#12392a;margin-bottom:.4em'; h.textContent = 'Sign in to continue';
    const t = el('p'); t.style.cssText = 'margin:0 0 1em;color:#4b4a42'; t.textContent = 'You are looking around as a guest. Sign in or create a free account to ' + (why || 'do that') + '.';
    const mk = (label, primary, fn) => { const b = el('button'); b.type = 'button'; b.textContent = label; b.style.cssText = 'display:block;width:100%;min-height:2.9em;border-radius:.9em;font:600 1em inherit;cursor:pointer;margin-top:.5em;' + (primary ? 'background:linear-gradient(135deg,#1e5a40,#12392a);color:#f0d78c;border:1px solid #c9a24a' : 'background:#fff;color:#12392a;border:1px solid #e6dfcd'); b.onclick = fn; return b; };
    const close = () => { if (gateEl) { gateEl.remove(); gateEl = null; } };
    card.append(h, t, mk('Sign in or create account', true, () => { location.href = P_.loginUrl(); }), mk('Not now', false, close));
    gateEl.appendChild(card); gateEl.addEventListener('click', (e) => { if (e.target === gateEl) close(); }); gateEl.addEventListener('keydown', (e) => { if (e.key === 'Escape') close(); });
    shadow.appendChild(gateEl); const first = card.querySelector('button'); if (first) first.focus();
    return true;
  };
  const LOGIN_APPS = { property: 'buy property', cars: 'buy vehicles', accessories: 'buy accessories', clothes: 'change your clothes', feed: 'use the feed', forum: 'join the gamers forum', nepa: 'read and post power updates', tutorial: 'read and share guides', chat: 'chat with other players', profile: 'see player profiles' };

  /* log out: clears the session, then returns to the sign-in page */
  P_.logout = function () {
    const done = () => { user = null; emit('user', null); location.href = SIGNUP_URL; };
    if (!g.FutaApi) return done();
    return g.FutaApi.signOut().catch(() => { }).then(done);
  };

  /* ---------- building the shell ---------- */
  function sysIcons() { return '<svg viewBox="0 0 24 24"><rect x="2" y="15" width="3.2" height="6" rx=".8"/><rect x="7" y="11.5" width="3.2" height="9.5" rx=".8"/><rect x="12" y="8" width="3.2" height="13" rx=".8"/><rect x="17" y="4" width="3.2" height="17" rx=".8" opacity=".35"/></svg><span class="ph-bat"></span>'; }
  function build(css) {
    // The phone lives in a Shadow DOM so the map's own global CSS (button, h3, label…) can never leak into it, and ours never leaks out.
    host = document.createElement('div'); host.id = 'futaPhoneHost'; document.body.appendChild(host); shadow = host.attachShadow({ mode: 'open' });
    const sty = document.createElement('style'); sty.textContent = css; shadow.appendChild(sty);
    root = el('div'); root.id = 'futaPhone'; root.setAttribute('role', 'dialog'); root.setAttribute('aria-label', 'Phone'); root.setAttribute('aria-hidden', 'true');
    root.innerHTML = '<button class="ph-tab" type="button" aria-label="Hide phone">Hide phone ' + ICONS.down + '</button><div class="ph-frame"><div class="ph-screen"><div class="ph-wall"></div><div class="ph-island"></div>' +
      '<div class="ph-status"><span class="ph-clk">9:41</span><span class="ph-sys">' + sysIcons() + '<button class="ph-hide" type="button" aria-label="Hide phone" title="Hide phone"><span>Hide</span>' + ICONS.down + '</button></span></div>' +
      '<div class="ph-view"><div class="ph-home"></div><div class="ph-app"></div></div>' +
      '<div class="ph-gesture" role="button" aria-label="Home" tabindex="0"></div><div class="ph-toast" role="status"></div></div></div>';
    shadow.appendChild(root);
    view = root.querySelector('.ph-view'); homeEl = root.querySelector('.ph-home'); appEl = root.querySelector('.ph-app'); toastEl = root.querySelector('.ph-toast');
    btn = el('button'); btn.id = 'futaPhoneBtn'; btn.type = 'button'; btn.setAttribute('aria-label', 'Open phone'); btn.title = 'Phone'; btn.innerHTML = ICONS.phone.replace('<svg', '<svg fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"') + '<span class="lbl">Phone</span><span class="badge"></span>';
    shadow.appendChild(btn); P_._shadow = shadow;
    loadScript(BASE + '../celebrate/celebrate.js').then(() => loadScript(BASE + '../celebrate/celebrate-phone.js')).catch(() => { /* celebrations are optional: the phone works without them */ });

    // keep the map from reacting to anything done on the phone (drag, wheel, pinch, keys)
    ['pointerdown', 'pointermove', 'pointerup', 'wheel', 'touchstart', 'touchmove', 'mousedown', 'dblclick', 'contextmenu', 'keydown', 'keyup'].forEach(ev => { root.addEventListener(ev, e => e.stopPropagation(), { passive: true }); btn.addEventListener(ev, e => e.stopPropagation(), { passive: true }); });
    btn.onclick = () => P_.show();
    root.querySelector('.ph-hide').onclick = () => P_.hide(); root.querySelector('.ph-tab').onclick = () => P_.hide();
    document.addEventListener('keydown', (e) => { if ((e.key === 'p' || e.key === 'P') && !e.ctrlKey && !e.metaKey && !e.altKey && !e.repeat && !/INPUT|TEXTAREA|SELECT/.test((document.activeElement || {}).tagName || '') && !(shadow.activeElement && /INPUT|TEXTAREA|SELECT/.test(shadow.activeElement.tagName)) && innerWidth >= 700) P_.toggle(); });   // desktop: P calls the phone out / puts it away
    const gest = root.querySelector('.ph-gesture'); gest.onclick = () => { if (openApp) P_.home(); else P_.hide(); };
    gest.onkeydown = (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); gest.click(); } };
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && P_.isOpen() && !/INPUT|TEXTAREA|SELECT/.test((shadow.activeElement || {}).tagName || '')) { if (openApp) P_.home(); else P_.hide(); } });
    // swipe down on the status bar / home bar hides the phone
    let y0 = null; const st = root.querySelector('.ph-status');
    st.addEventListener('pointerdown', e => { if (e.target.closest('button')) return; y0 = e.clientY; }); window.addEventListener('pointerup', e => { if (y0 != null && e.clientY - y0 > 50) P_.hide(); y0 = null; });
    tick(); setInterval(tick, 15000);
  }
  function tick() { const d = new Date(); const c = root.querySelector('.ph-clk'); if (c) c.textContent = d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit', hour12: false }); const t = homeEl.querySelector('.ph-time'); if (t) { t.textContent = d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit', hour12: false }); homeEl.querySelector('.ph-date').textContent = d.toLocaleDateString([], { weekday: 'long', day: 'numeric', month: 'long' }); } }

  const DOCK = ['chat', 'settings'];
  function iconBtn(a, dock) {
    const b = el('button', 'ph-ico'); b.type = 'button'; b.setAttribute('aria-label', a.name); b.style.setProperty('--c1', (a.color || ['#2f7d5a', '#12392a'])[0]); b.style.setProperty('--c2', (a.color || ['#2f7d5a', '#12392a'])[1]);
    const ic = ICONS[a.icon] || a.icon || ICONS.info; b.innerHTML = '<i>' + ic + (badges[a.id] ? '<em>' + (badges[a.id] > 99 ? '99+' : badges[a.id]) + '</em>' : '') + '</i><span>' + esc(a.name) + '</span>';
    b.onclick = () => P_.open(a.id); return b;
  }
  function buildHome() { if (!homeEl) return; renderHome(); }
  function renderHome() {
    if (!homeEl) return;
    homeEl.innerHTML = '<div class="ph-clock"><div class="ph-time"></div><div class="ph-date"></div></div><div class="ph-card"></div><div class="ph-grid"></div>';
    const card = homeEl.querySelector('.ph-card');
    if (user) { const w = user.wallet; card.innerHTML = '<div class="ph-av">' + esc((user.username || user.email || '?').charAt(0).toUpperCase()) + '</div><div><b>' + esc(user.username || 'Welcome') + '</b><small>' + (w && w.pocket != null ? '₦' + Number(w.pocket).toLocaleString() + ' in pocket' : 'Signed in') + '</small></div>'; if (user.username) { card.style.cursor = 'pointer'; card.title = 'My profile'; card.onclick = () => P_.open('profile', { peer: { id: user.id, username: user.username, self: true } }); } }
    else { card.innerHTML = '<div class="ph-av">?</div><div><b>Not signed in</b><small>Open Settings to sign in</small></div>'; card.style.cursor = 'pointer'; card.onclick = () => P_.open('settings'); }
    const grid = homeEl.querySelector('.ph-grid'); const list = [...apps.values()].sort((a, b) => (order.indexOf(a.id) + 99) % 99 - (order.indexOf(b.id) + 99) % 99);
    list.filter(a => DOCK.indexOf(a.id) < 0 && !a.hidden).forEach(a => grid.appendChild(iconBtn(a)));
    let dock = root.querySelector('.ph-dock'); if (dock) dock.remove(); dock = el('div', 'ph-dock'); DOCK.forEach(id => { const a = apps.get(id); if (a) dock.appendChild(iconBtn(a, true)); });
    view.parentNode.insertBefore(dock, view.nextSibling);
    tick(); if (g.FutaCelebrateUI) g.FutaCelebrateUI.home(homeEl); if (g.FutaPromptAds) g.FutaPromptAds.home(homeEl); if (g.FutaCommunity) g.FutaCommunity.home(homeEl);   /* advert card first, so it sits between the apps and the WhatsApp card */    // festive ribbon card while a celebration is on (game/celebrate/)
  }

  /* ---------- open / close an app ---------- */
  P_.open = function (id, opts) {   // opts.hideOnClose: when the app is closed, put the phone away too (used by the interior wardrobe)
    const a = apps.get(id); if (!a) return; if (LOGIN_APPS[id] && P_.isGuest()) { P_.requireLogin(LOGIN_APPS[id]); return; } if (openApp) closeApp();
    hideOnClose = !!(opts && opts.hideOnClose); openApp = id; appEl.innerHTML = '<div class="ph-bar"><button class="ph-back" type="button" aria-label="Home">' + ICONS.back + '</button><h2></h2><span class="ph-bar-x"></span></div><div class="ph-body"></div>';
    const h2 = appEl.querySelector('h2'); h2.textContent = a.title || a.name; appEl.querySelector('.ph-back').onclick = () => { if (current && current.back && current.back() === true) return; P_.home(); };
    const body = appEl.querySelector('.ph-body'); const ctx = { phone: P_, opts: opts || {}, user, esc, el, icons: ICONS, body, bar: appEl.querySelector('.ph-bar-x'), setTitle: (t) => { h2.textContent = t; } };
    view.classList.add('in-app'); appEl.classList.add('on');
    try { current = a.mount(body, ctx) || {}; } catch (e) { console.error('[phone app ' + id + ']', e); body.innerHTML = '<p class="ph-note">This app hit a problem. Go back and try again.</p>'; current = {}; }
    emit('open', id);
  };
  function closeApp() { try { current && current.destroy && current.destroy(); } catch (e) { } current = null; openApp = null; appEl.classList.remove('on'); view.classList.remove('in-app'); emit('open', null); }   // null = back on the home screen (chat.js uses it to know when to count unread again)
  P_.home = function () { if (!openApp) return; closeApp(); if (hideOnClose) { hideOnClose = false; P_.hide(true); } };

  /* ---------- show / hide (the "call out" and "put away") ---------- */
  P_.show = function (temp) { emit('vis', true); root.classList.add('open'); root.setAttribute('aria-hidden', 'false'); btn.classList.add('away'); /* the phone opens on every load (unless Settings > "Show phone on start" is off); opening/closing it by hand is NOT remembered */
    if (!user && g.FutaApi) P_.refreshUser(); };
  P_.hide = function (keepPref) { emit('vis', false); hideOnClose = false; root.classList.remove('open'); root.setAttribute('aria-hidden', 'true'); btn.classList.remove('away'); if (shadow.activeElement) shadow.activeElement.blur(); };
  P_.toggle = () => P_.isOpen() ? P_.hide() : P_.show();

  /* ---------- boot ---------- */
  function boot() {
    fetch(BASE + 'phone.css').then(r => r.text()).catch(() => '').then(start);
  }
  function start(css) {
    build(css); ready = true;
    const loadApps = () => loadScript(BASE + 'apps/manifest.js').then(() => {
      order = g.FUTA_PHONE_APPS || []; return Promise.all(order.map(id => loadScript(BASE + 'apps/' + id + '.js').catch(e => console.warn('[phone] app failed:', id, e.message))));
    }).then(() => loadScript(BASE + 'prompt-ads.js').catch(() => { /* the advert card is optional: the phone works without it */ })).then(() => { renderHome(); });
    loadApps(); loadAuth();   // in parallel: the map keeps the main thread busy, so don't chain network waits
    if (store.get('auto', true) !== false) setTimeout(() => P_.show(true), 500);   // phone first: players close it to see the map
  }
  g.FutaPhone = P_;
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot); else boot();
})(window);
