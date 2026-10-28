/* Unread red counts for the Feed, NEPA and Tutorial phone apps. It is NOT an app: it only draws numbers on those three icons (Global and Chat count themselves in global.js / chat.js).
   WHAT PLAYERS SEE: a red number on the app icon (and on the floating phone button) = posts from OTHER players that arrived since you last opened that app; 99+ above 99.
     Opening the app clears its number. Your own posts never count. Nothing is counted for posts that were already there the first time this phone signs in (it starts from "now").
   HOW IT IS COUNTED: these tables have no read state on the server, so THIS phone remembers the newest post id you have seen, per app and per player
     (localStorage futa.feed.seen.<id> · futa.nepa.seen.<id> · futa.tutorial.seen.<id>), the same way Global does it. The server only answers "how many posts have an id above that?"
     (RLS already hides expired, removed and blocked posts, so they are never counted).
   LIVE: Supabase Realtime INSERT events (needs supabase/25_unread_realtime.sql) raise the number at once, even while the phone is hidden.
     A recount from the server also runs on sign-in, when the connection returns, when the browser tab comes back to the front and every 60 s while the tab is in front,
     so the numbers are right even if Realtime is not switched on for these tables.
   TO CHANGE: the three apps are listed in APPS below (table + optional kind). Add one line to count another app. Demo mode (no Supabase keys) shows sample numbers (3, 5, 1) that clear when you open the app. */
(function (g) {
  'use strict';
  const Ph = g.FutaPhone; if (!Ph) return;
  const POLL_MS = 60000;
  const APPS = { feed: { table: 'feed_posts' }, nepa: { table: 'bulletins', kind: 'nepa' }, tutorial: { table: 'bulletins', kind: 'tutorial' } };
  const IDS = Object.keys(APPS);
  const n = { feed: 0, nepa: 0, tutorial: 0 };
  let uid = null, chs = [], openId = null, timer = null, demoShown = false;

  const show = (id) => Ph.badge(id, n[id]);
  const set = (id, v) => { n[id] = Math.max(0, v | 0); show(id); };
  /* "looking at it right now" = that app is open AND the phone itself is on screen */
  const viewing = (id) => openId === id && Ph.isOpen();

  /* ---------- the newest post id this phone has seen (per app, per player) ---------- */
  const key = (id) => 'futa.' + id + '.seen.' + uid;
  const getSeen = (id) => { try { const v = parseInt(g.localStorage.getItem(key(id)), 10); return v >= 0 ? v : null; } catch (e) { return null; } };
  const putSeen = (id, v) => { try { v = +v || 0; const c = getSeen(id); if (c == null || v > c) g.localStorage.setItem(key(id), String(v)); } catch (e) { } };

  const base = (id, cols, opts) => { const a = APPS[id]; let q = Ph.api().sb().from(a.table).select(cols, opts); if (a.kind) q = q.eq('kind', a.kind); return q; };
  async function newest(id) {   // highest post id the player can see right now (0 = none)
    const r = await base(id, 'id').order('id', { ascending: false }).limit(1); if (r.error) throw r.error; return r.data && r.data[0] ? +r.data[0].id : 0;
  }
  async function sync(id) {
    const me = uid; if (!me || Ph.demo() || !Ph.api()) return;
    try {
      const seen = getSeen(id);
      if (seen == null) { const top = await newest(id); if (me !== uid) return; try { g.localStorage.setItem(key(id), String(top)); } catch (e) { } set(id, 0); return; }   // first run: start from "now"
      const r = await base(id, 'id', { count: 'exact', head: true }).gt('id', seen).neq('user_id', me);
      if (r.error || me !== uid) return; set(id, viewing(id) ? 0 : (r.count | 0));
    } catch (e) { /* offline: keep what we have */ }
  }
  const syncAll = () => { if (uid && !Ph.demo()) IDS.forEach(sync); };

  /* ---------- opening / leaving an app ---------- */
  async function markSeen(id) {   // everything up to now counts as seen
    const me = uid; set(id, 0); if (!me || Ph.demo() || !Ph.api()) return;
    try { const top = await newest(id); if (me === uid) putSeen(id, top); } catch (e) { }
  }
  Ph.on('open', (id) => {
    const prev = openId; openId = id || null;
    if (prev && prev !== id && APPS[prev]) markSeen(prev);   // leaving: whatever was posted while you were in there counts as seen
    if (id && APPS[id]) markSeen(id);                         // entering: clears the number
  });

  /* ---------- live + recount ---------- */
  function stop() {
    chs.forEach(c => { try { c.unsubscribe(); } catch (e) { } }); chs = []; clearInterval(timer); timer = null; uid = null;
    if (!Ph.demo()) IDS.forEach(id => set(id, 0));
  }
  function start() {
    const u = Ph.getUser(); if (!u) return;
    if (Ph.demo()) return;
    const api = Ph.api(); if (!api || uid === u.id) return; stop(); uid = u.id;
    syncAll();
    timer = setInterval(() => { if (!g.document.hidden) syncAll(); }, POLL_MS);
    const onRow = (id) => (x) => {
      const r = x && x.new; if (!r || r.user_id === u.id) return;   // my own post is never counted
      if (viewing(id)) return; set(id, n[id] + 1);                  // the app is on screen: nothing to count (it is marked seen when you leave)
    };
    try {
      chs.push(api.sb().channel('phone:feed:' + u.id).on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'feed_posts' }, onRow('feed')).subscribe());
      const nepa = onRow('nepa'), tut = onRow('tutorial');
      chs.push(api.sb().channel('phone:bul:' + u.id).on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'bulletins' }, (x) => {
        const r = x && x.new; if (!r || r.hidden) return; if (r.kind === 'nepa') nepa(x); else if (r.kind === 'tutorial') tut(x);
      }).subscribe());
    } catch (e) { console.warn('[phone unread]', e.message); }
  }
  const seedDemo = () => { if (demoShown || !Ph.demo()) return; demoShown = true; set('feed', 3); set('nepa', 5); set('tutorial', 1); };   // demo mode only: show what the numbers look like
  setTimeout(seedDemo, 1500);
  g.addEventListener('online', syncAll); g.document.addEventListener('visibilitychange', () => { if (!g.document.hidden) syncAll(); });
  Ph.on('user', (u) => { if (!u) stop(); else start(); });
  if (Ph.getUser()) start();   // the phone may already know the player by the time this file loads
})(window);
