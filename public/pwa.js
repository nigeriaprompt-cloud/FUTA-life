/* FUTAlife — "install as an app".
   WHAT IT DOES: registers the service worker (/sw.js), and offers to install FUTAlife on the phone's home screen.
   - Android / desktop Chrome & Edge: catches the browser's install prompt and shows a small "Install FUTAlife" card (sign-up page only) + a row in Phone > Settings.
   - iPhone / iPad (Safari has no install prompt): the card explains "Share → Add to Home Screen".
   - Already installed (opened from the home screen): shows nothing.
   API for other scripts:  FutaInstall.state() -> 'installed' | 'available' | 'ios' | 'unavailable',  FutaInstall.prompt() -> Promise<'accepted'|'dismissed'|'ios'|'unavailable'>
   Everything is drawn inside a Shadow DOM so the map's global CSS cannot break it. */
(function (g) {
  'use strict';
  if (g.FutaInstall) return;
  const store = { get(k) { try { return localStorage.getItem('futa.pwa.' + k); } catch (e) { return null; } }, set(k, v) { try { localStorage.setItem('futa.pwa.' + k, v); } catch (e) { } } };
  const standalone = () => (g.matchMedia && g.matchMedia('(display-mode: standalone)').matches) || g.navigator.standalone === true;
  const ua = g.navigator.userAgent || '', ios = /iphone|ipad|ipod/i.test(ua) || (/Macintosh/i.test(ua) && g.navigator.maxTouchPoints > 1);
  const safari = ios && /safari/i.test(ua) && !/crios|fxios|edgios|opios/i.test(ua);
  let deferred = null; const subs = [];
  const emit = () => subs.forEach(f => { try { f(FI.state()); } catch (e) { } });

  const FI = g.FutaInstall = {
    state() { if (standalone()) return 'installed'; if (deferred) return 'available'; if (ios) return 'ios'; return 'unavailable'; },
    onChange(f) { subs.push(f); },
    async prompt() {
      if (deferred) { const d = deferred; deferred = null; d.prompt(); let r = 'dismissed'; try { r = (await d.userChoice).outcome; } catch (e) { } emit(); return r; }
      if (ios && !standalone()) { showCard('ios', true); return 'ios'; }
      return 'unavailable';
    }
  };

  g.addEventListener('beforeinstallprompt', (e) => { e.preventDefault(); deferred = e; emit(); maybeCard(); });
  g.addEventListener('appinstalled', () => { deferred = null; store.set('installed', '1'); hideCard(); emit(); });

  /* ---------- service worker ---------- */
  if ('serviceWorker' in g.navigator && (g.location.protocol === 'https:' || g.location.hostname === 'localhost' || g.location.hostname === '127.0.0.1')) {
    g.addEventListener('load', () => { g.navigator.serviceWorker.register('/sw.js').catch(e => console.warn('[pwa] service worker failed:', e && e.message)); });
  }

  /* ---------- the little install card (sign-up page only) ---------- */
  let host = null;
  const onSignup = /\/onboarding\/signup/.test(g.location.pathname) || g.location.pathname === '/join';
  function hideCard() { if (host) { host.remove(); host = null; } }
  function showCard(mode, force) {
    if (host || standalone()) return;
    host = document.createElement('div'); host.id = 'futaInstall'; document.body.appendChild(host); const sr = host.attachShadow({ mode: 'open' });
    sr.innerHTML = '<style>:host{all:initial}*{box-sizing:border-box}.c{position:fixed;left:12px;right:12px;bottom:calc(12px + env(safe-area-inset-bottom));max-width:440px;margin:0 auto;z-index:99999;display:flex;align-items:center;gap:12px;padding:12px 14px;border-radius:18px;' +
      'background:linear-gradient(135deg,#1e5a40,#0d2a1e);border:1px solid #d9ac35;box-shadow:0 14px 40px #000a;color:#fbf8f1;font:14px/1.35 system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;animation:u .4s cubic-bezier(.2,.9,.3,1.1)}' +
      '@keyframes u{from{transform:translateY(120%);opacity:0}}img{width:46px;height:46px;border-radius:12px;flex:none}.t{flex:1;min-width:0}b{display:block;font:700 15px Georgia,serif;color:#fbeaa8}span{opacity:.85;font-size:12.5px}' +
      'button{font:inherit;cursor:pointer;border:0}.go{padding:10px 16px;border-radius:12px;font-weight:700;background:linear-gradient(135deg,#fbeaa8,#d9ac35);color:#2b1f05}.x{width:30px;height:30px;border-radius:50%;background:#ffffff1f;color:#fff;font-size:18px;line-height:1;flex:none}</style>' +
      '<div class="c" role="dialog" aria-label="Install FUTAlife"><img alt="" src="/brand/icon-192.png"><div class="t"><b>Install FUTAlife</b><span></span></div>' + (mode === 'ios' ? '' : '<button class="go" type="button">Install</button>') + '<button class="x" type="button" aria-label="Close">×</button></div>';
    const msg = sr.querySelector('span'); msg.textContent = mode === 'ios' ? 'Tap the Share button, then “Add to Home Screen”.' : 'Add it to your home screen for full-screen play.';
    const go = sr.querySelector('.go'); if (go) go.onclick = () => FI.prompt().then(() => hideCard());
    sr.querySelector('.x').onclick = () => { store.set('dismiss', String(Date.now())); hideCard(); };
  }
  function maybeCard() {
    if (!onSignup || standalone() || store.get('installed')) return; const d = +store.get('dismiss') || 0; if (Date.now() - d < 7 * 864e5) return;
    const st = FI.state(); if (st === 'available') setTimeout(() => showCard('android'), 1500); else if (st === 'ios' && safari) setTimeout(() => showCard('ios'), 2500);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', maybeCard); else maybeCard();

  /* ---------- "You are offline" bar ----------
     Shows a slim bar at the top whenever the phone has no working internet, and a green "Back online" for a moment when it returns.
     navigator.onLine alone lies (Wi-Fi with no data), so we also fetch /ping.txt (never cached) every 15 s and when the page comes back to the front.
     Everything else keeps working: the game is already loaded, and chat messages wait in the outbox and send by themselves when the connection is back. */
  let bar = null, barSR = null, down = false, fails = 0, okT = 0;
  function barEl() {
    if (bar) return barSR; bar = document.createElement('div'); bar.id = 'futaNet'; (document.body || document.documentElement).appendChild(bar); const sr = bar.attachShadow({ mode: 'open' });
    sr.innerHTML = '<style>:host{all:initial}.b{position:fixed;left:0;right:0;top:0;z-index:2147483000;display:flex;justify-content:center;pointer-events:none;padding-top:env(safe-area-inset-top)}' +
      '.p{margin:6px 10px 0;max-width:94vw;padding:7px 14px;border-radius:999px;font:600 13px/1.25 system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;color:#fff;box-shadow:0 6px 20px #0006;transition:transform .3s,opacity .3s;transform:translateY(-140%);opacity:0;display:flex;gap:8px;align-items:center}' +
      '.p.show{transform:none;opacity:1}.p.off{background:#a32a1f}.p.on{background:#1f7a4d}.d{width:9px;height:9px;border-radius:50%;background:#fff;flex:none}.p.off .d{animation:k 1.2s infinite}@keyframes k{50%{opacity:.25}}</style>' +
      '<div class="b" role="status" aria-live="polite"><div class="p off"><i class="d"></i><span></span></div></div>';
    barSR = sr; return sr;
  }
  function showNet(kind) {
    const sr = barEl(), p = sr.querySelector('.p'), t = sr.querySelector('span'); clearTimeout(okT);
    if (kind === 'off') { p.className = 'p off show'; t.textContent = 'You are offline. Check your internet connection. Messages will send when you are back.'; }
    else if (kind === 'on') { p.className = 'p on show'; t.textContent = 'Back online'; okT = setTimeout(() => { p.className = 'p on'; }, 2600); }
    else { p.className = 'p ' + (p.classList.contains('on') ? 'on' : 'off'); }
  }
  function setDown(v) { if (v === down) return; down = v; showNet(v ? 'off' : 'on'); try { g.dispatchEvent(new CustomEvent('futa-net', { detail: { online: !v } })); } catch (e) { } }
  async function ping() {
    if (g.navigator.onLine === false) { fails = 2; setDown(true); return; }
    const c = new AbortController(), t = setTimeout(() => c.abort(), 6000);
    try { const r = await fetch('/ping.txt?t=' + Date.now(), { cache: 'no-store', signal: c.signal }); if (!r.ok) throw new Error('bad'); fails = 0; setDown(false); }
    catch (e) { fails++; if (fails >= 2) setDown(true); }
    finally { clearTimeout(t); }
  }
  g.addEventListener('offline', () => { fails = 2; setDown(true); });
  g.addEventListener('online', () => { fails = 0; ping(); });
  document.addEventListener('visibilitychange', () => { if (!document.hidden) ping(); });
  setInterval(() => { if (!document.hidden) ping(); }, 15000);
  g.FutaNet = { online: () => !down, check: ping };
  if (g.navigator.onLine === false) setTimeout(() => { fails = 2; setDown(true); }, 300);
})(window);
