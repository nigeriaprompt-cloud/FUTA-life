/* FUTA Celebrations — the shared core. One tiny file used by the map, the phone and the admin page.
   WHAT IT DOES: knows the 5 celebration themes (colours, icon, default words), fetches the current on/off state, tells everyone when it changes.
   WHERE THE STATE LIVES: real mode  -> Supabase  public.get_celebration()  (supabase/18_celebrations.sql; only the admin can change it, see docs/CELEBRATIONS.md)
                          demo mode  -> localStorage 'futa.celebration' (so you can try it with the admin page in one tab and the map in another).
   API:  FutaCelebrate.state            { on, event, title, message, startsAt, endsAt, theme }  (theme = the object from THEMES, or null when off)
         FutaCelebrate.onChange(fn)     fn(state) is called now and on every change; returns an unsubscribe function
         FutaCelebrate.refresh()        fetch again now
         FutaCelebrate.THEMES / leftText(endsAt) / demoSet(obj) / normalize(obj)
   Text from the server is shown with textContent only. A broken network never breaks the page (the last known state stays). */
(function (g) {
  'use strict';
  if (g.FutaCelebrate) return;
  const THEMES = {
    convocation:   { id: 'convocation', name: 'Convocation', icon: '🎓', title: 'Convocation Ceremony', message: 'Congratulations to our graduating class!', colors: ['#0f2b5b', '#c9a24a', '#f0d78c', '#fbf8f1', '#2c4f86'], glow: '#f0d78c' },
    matriculation: { id: 'matriculation', name: 'Matriculation', icon: '📜', title: 'Matriculation Ceremony', message: 'Welcome, new students. Your FUTA story begins today!', colors: ['#1e5a40', '#c9a24a', '#fbf8f1', '#f0d78c', '#2f8f6a'], glow: '#9fe3bd' },
    independence:  { id: 'independence', name: 'Independence Day', icon: '🇳🇬', title: 'Independence Day', message: 'Happy Independence Day, Nigeria!', colors: ['#0b7a3b', '#ffffff', '#0b7a3b', '#ffffff', '#0f5a2d'], glow: '#b8f0cf' },
    christmas:     { id: 'christmas', name: 'Christmas & New Year', icon: '🎄', title: 'Season’s Greetings', message: 'Merry Christmas and a prosperous New Year!', colors: ['#b3261e', '#1f7a4d', '#f0d78c', '#ffffff', '#8a1c16'], glow: '#ffd9a0' },
    party:         { id: 'party', name: 'Campus Celebration', icon: '🎉', title: 'Campus Celebration', message: 'Something special is happening at FUTA!', colors: ['#6b3fa0', '#e5c04a', '#d6568a', '#2f8fb5', '#fbf8f1'], glow: '#f5c6ff' }
  };
  const KEY = 'futa.celebration';
  const subs = new Set(); let st = normalize(null), timer = null, started = false;

  function normalize(o) {
    o = o || {}; const ev = THEMES[o.event] ? o.event : 'convocation', now = Date.now();
    const s = o.startsAt ? Date.parse(o.startsAt) : NaN, e = o.endsAt ? Date.parse(o.endsAt) : NaN;
    // the server already applied the clock; in demo mode we apply it here. Either way, an end time in the past means OFF.
    const on = !!o.on && !(e <= now) && !(s > now);
    return { on, armed: !!o.on, event: ev, title: o.title || THEMES[ev].title, message: o.message || THEMES[ev].message, startsAt: o.startsAt || null, endsAt: o.endsAt || null, theme: on ? THEMES[ev] : null };
  }
  function same(a, b) { return a.on === b.on && a.event === b.event && a.title === b.title && a.message === b.message && a.endsAt === b.endsAt; }
  function set(next) { const n = normalize(next); if (same(n, st)) return; st = n; api.state = n; subs.forEach(f => { try { f(n); } catch (e) { console.error(e); } }); }
  function leftText(endsAt) {
    if (!endsAt) return ''; const ms = Date.parse(endsAt) - Date.now(); if (!(ms > 0)) return '';
    const m = Math.floor(ms / 6e4), d = Math.floor(m / 1440), h = Math.floor((m % 1440) / 60);
    return d >= 1 ? 'Ends in ' + d + 'd ' + h + 'h' : h >= 1 ? 'Ends in ' + h + 'h ' + (m % 60) + 'm' : 'Ends in ' + Math.max(1, m) + ' min';
  }
  const demo = () => !!(g.FUTA_CONFIG && g.FUTA_CONFIG.demo);
  async function fetchState() {
    if (g.FUTA_CONFIG && g.FUTA_CONFIG.demo) { try { return JSON.parse(localStorage.getItem(KEY) || 'null'); } catch (e) { return null; } }
    const A = g.FutaApi; if (!A || !A.sb) return undefined;
    const r = await A.sb().rpc('get_celebration'); if (r.error) throw r.error; return r.data;
  }
  async function refresh() { try { const d = await fetchState(); if (d !== undefined) set(d); } catch (e) { /* offline: keep the last state */ } }
  const BASE = (document.currentScript && document.currentScript.src || '/world/game/celebrate/celebrate.js').replace(/celebrate\/[^/]*$/, '');
  function waitForApi(tries) {   // the phone normally loads config.js + api.js; if it has not by ~2-3 s (or there is no phone on this page) we load them ourselves
    const c = g.FUTA_CONFIG;
    if (c && (c.demo || g.FutaApi)) return refresh();
    if (tries === 8 && !c && !g.__celCfg) g.__celCfg = loadScript(BASE + 'onboarding/config.js').catch(() => { });
    if (tries === 12 && g.FUTA_CONFIG && !g.FUTA_CONFIG.demo && !g.FutaApi && !g.__celApi) { g.__celApi = loadApi().then(refresh).catch(() => { }); }
    if (tries > 80) return; setTimeout(() => waitForApi(tries + 1), 250);
  }
  function loadScript(src) { return new Promise((res, rej) => { const s = document.createElement('script'); s.src = src; s.onload = res; s.onerror = rej; document.head.appendChild(s); }); }
  async function loadApi() {
    if (!g.supabase) await loadScript(BASE + '../vendor/supabase.min.js');
    if (!g.FutaApi) await loadScript(BASE + 'onboarding/api.js');
  }
  function start() {
    if (started) return; started = true;
    waitForApi(0);
    clearInterval(timer); timer = setInterval(() => { if (document.hidden) return; refresh(); set({ ...st, on: st.armed }); }, 30000);   // refresh, and let an end/start time that has just passed take effect
    g.addEventListener('storage', e => { if (e.key === KEY) refresh(); });
    document.addEventListener('visibilitychange', () => { if (!document.hidden) refresh(); });
    g.addEventListener('online', refresh);
  }
  const api = {
    THEMES, state: st, normalize, leftText, refresh,
    onChange(fn) { subs.add(fn); start(); try { fn(st); } catch (e) { console.error(e); } return () => subs.delete(fn); },
    demoSet(o) { try { localStorage.setItem(KEY, JSON.stringify(o)); } catch (e) { } refresh(); }
  };
  g.FutaCelebrate = api; start();
})(window);
