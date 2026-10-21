/* Shared helpers for the phone apps NEPA (apps/nepa.js) and Tutorial (apps/tutorial.js). It is NOT an app: it only defines window.FutaBulletin.
   WHAT IT GIVES THE APPS:  h() (build elements with textContent, never innerHTML) · ago() / left() · say() (error codes → friendly text) · STATUS / CATS / REASONS lists ·
   store(kind) = one object that talks to the server (real mode) or to fake in-memory posts (demo mode, no Supabase keys) · pager() = infinite scroll.
   REAL MODE: reads table public.bulletins / bulletin_votes (RLS) and writes ONLY through the functions in supabase/18_bulletins.sql
   (get_bulletin_status, post_nepa, post_tutorial, vote_bulletin, report_bulletin, delete_bulletin). Limits and rules are decided there, never here.
   The STATUS keys and CATS names must match private.bul_statuses() / private.bul_cats() in 18_bulletins.sql — change both together. Docs: docs/BULLETINS.md */
(function (g) {
  'use strict';
  const PAGE = 12;
  const h = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; };
  const STATUS = [   // [key, label, icon, colour]
    ['on', 'Light is ON', '⚡', '#1f7a4d'], ['off', 'Light is OFF', '🔌', '#b3261e'], ['low', 'Low voltage', '⚠️', '#c77700'], ['maint', 'Maintenance', '🔧', '#2a5db0'], ['news', 'News', '📰', '#5b4b8a']
  ];
  const CATS = [['Study', '#6c5ce7'], ['Tech', '#0984e3'], ['Money', '#00a884'], ['Campus life', '#e17055'], ['Skills', '#d63384'], ['Health', '#00a6b4']];
  const REASONS = [['spam', 'Spam'], ['inappropriate', 'Inappropriate'], ['harassment', 'Harassment']];
  const ERR = {
    daily_limit: 'You have used all your posts for today. Come back tomorrow.', slow_down: 'Please wait a little before posting again.',
    post_not_allowed: 'That text is not allowed. No links, no phone numbers, and keep to the length shown.', bad_place: 'Write a place name (2–40 letters or numbers, no links).',
    duplicate_post: 'That has already been posted. Write something of your own.', finish_sign_up: 'Finish creating your character first.', own_post: 'You cannot do that on your own post.',
    already_reported: 'You already reported this.', not_found: 'That post is no longer there.', bad_status: 'Pick a status first.', bad_category: 'Pick a category first.'
  };
  const say = (e) => ERR[e && e.message] || (e && e.message) || 'Something went wrong. Try again.';
  const ago = (iso) => { const s = Math.max(0, (Date.now() - new Date(iso)) / 1000); if (s < 60) return 'just now'; const m = Math.floor(s / 60); if (m < 60) return m + ' min ago'; const hr = Math.floor(m / 60); return hr < 24 ? hr + ' h ago' : Math.floor(hr / 24) + ' d ago'; };
  const left = (iso) => { if (!iso) return ''; const ms = new Date(iso) - Date.now(); if (ms <= 0) return 'expired'; const hr = Math.floor(ms / 36e5), m = Math.floor(ms % 36e5 / 6e4); return hr > 0 ? hr + 'h left' : Math.max(m, 1) + 'm left'; };

  /* ---------------- infinite scroll: load(offset) → rows, render(row) → element ---------------- */
  function pager(o) {
    let offset = 0, busy = false, end = false, dead = false;
    async function more() {
      if (busy || end || dead) return; busy = true;
      try {
        const rows = await o.load(offset); if (dead) return;
        rows.forEach(r => o.list.appendChild(o.render(r))); offset += rows.length;
        if (rows.length < PAGE) { end = true; o.sent.textContent = o.list.children.length ? o.end : o.empty; } else o.sent.textContent = 'Loading more…';
      } catch (e) { o.sent.textContent = 'Could not load: ' + say(e) + ' (tap ↻)'; end = true; }
      finally { busy = false; if (!end && !dead) { io.unobserve(o.sent); io.observe(o.sent); } }   // still on screen? then load the next page
    }
    const io = new IntersectionObserver((es) => { if (es.some(e => e.isIntersecting)) more(); }, { root: o.root, rootMargin: '300px' }); io.observe(o.sent);
    return { destroy() { dead = true; io.disconnect(); } };
  }

  /* ---------------- real server ---------------- */
  function realStore(kind) {
    const api = g.FutaPhone.api(), nepa = kind === 'nepa';
    const COLS = nepa ? 'id,user_id,username,status,place,body,helpful,created_at,expires_at' : 'id,user_id,username,category,title,body,helpful,created_at';
    return {
      demo: false,
      status: () => api.rpc('get_bulletin_status', { p_kind: kind }),
      async page(o) {   // o: { offset, size, category, sort: 'new' | 'top', since: minutes }
        let q = api.sb().from('bulletins').select(COLS).eq('kind', kind);
        if (o.category) q = q.eq('category', o.category);
        if (o.since) q = q.gte('created_at', new Date(Date.now() - o.since * 6e4).toISOString());
        q = o.sort === 'top' ? q.order('helpful', { ascending: false }).order('id', { ascending: false }) : q.order('id', { ascending: false });
        const from = o.offset || 0, { data, error } = await q.range(from, from + (o.size || PAGE) - 1); if (error) throw error; return data || [];
      },
      async myVotes(ids) { if (!ids.length) return new Set(); const { data } = await api.sb().from('bulletin_votes').select('bulletin_id').in('bulletin_id', ids); return new Set((data || []).map(r => r.bulletin_id)); },
      post: (a) => nepa ? api.rpc('post_nepa', { p_status: a.status, p_place: a.place, p_note: a.note || '' }) : api.rpc('post_tutorial', { p_title: a.title, p_category: a.category, p_body: a.body }),
      vote: (id) => api.rpc('vote_bulletin', { p_id: id }), report: (id, r) => api.rpc('report_bulletin', { p_id: id, p_reason: r }), remove: (id) => api.rpc('delete_bulletin', { p_id: id })
    };
  }

  /* ---------------- demo (no Supabase): fake posts in memory so the layout can be seen ---------------- */
  const D_NEPA = [['on', 'Library', 'Light is back at the library and reading rooms', 12, 'Tola'], ['off', 'Faculty area', 'Light went off around the faculty buildings just now', 35, 'Amaka'], ['low', 'Hostel Block A', 'Voltage is very low, the bulbs are dim', 50, 'Segun'],
    ['on', 'Main gate', 'Stable since morning, no interruption', 95, 'Chidi'], ['maint', 'Market road', 'A crew is working on a transformer, expect a short cut', 140, 'Bisi'], ['news', 'Off campus', 'Supply is expected to improve tonight', 200, 'Hauwa'], ['off', 'Hostel Block B', 'Total blackout since the afternoon', 260, 'Kunle']];
  const D_TUT = [['Charge smart during power cuts', 'Tech', 'Tola', 3, 'Light comes and goes, so use it well.\n1. Charge your phone and power bank first.\n2. Turn on battery saver before the light goes.\n3. Lower the screen brightness while charging.'],
    ['A simple weekly study timetable', 'Study', 'Amaka', 30, 'Pick two hardest courses and give each a fixed daily slot.\n1. Write your lectures first.\n2. Put study blocks of 90 minutes in the gaps.\n3. Keep one evening free to rest.'],
    ['Budget your allowance in four steps', 'Money', 'Segun', 52, 'Money lasts longer with a plan.\n1. Write down what comes in this month.\n2. List food, transport and data.\n3. Save a small amount first.\n4. Check your list every Sunday.'],
    ['Write a clear email to your lecturer', 'Skills', 'Chidi', 80, 'Keep it short and polite.\n1. Use a clear subject line.\n2. Say who you are and your course.\n3. Ask one question.\n4. Thank them and sign with your name.'],
    ['Sleep well in a noisy hostel', 'Health', 'Bisi', 120, 'Good sleep helps you remember more.\n1. Keep a fixed bedtime.\n2. Use earplugs or soft music.\n3. Put your phone away 30 minutes before bed.'],
    ['Prepare for your first lab session', 'Campus life', 'Hauwa', 170, 'Labs go better when you are ready.\n1. Read the manual the night before.\n2. Bring your lab coat and notebook.\n3. Arrive ten minutes early.']];
  function demoStore(kind) {
    const nepa = kind === 'nepa', iso = (m) => new Date(Date.now() - m * 6e4).toISOString(), wait = (v) => new Promise(r => setTimeout(() => r(v), 180));
    let rows = nepa ? D_NEPA.map((d, i) => ({ id: 100 - i, user_id: 'd' + i, username: d[4], status: d[0], place: d[1], body: d[2], helpful: (i * 3) % 5, created_at: iso(d[3]), expires_at: new Date(Date.now() + 8 * 36e5).toISOString() }))
      : D_TUT.map((d, i) => ({ id: 100 - i, user_id: 'd' + i, username: d[2], category: d[1], title: d[0], body: d[4], helpful: (7 - i) * 3, created_at: iso(d[3] * 60) }));
    const voted = new Set(); let posts = nepa ? 10 : 3, nid = 500;
    return {
      demo: true,
      status: () => wait({ daily_limit: nepa ? 10 : 3, posts_left: posts, hours: 12 }),
      page(o) {
        let r = rows.slice(); if (o.category) r = r.filter(x => x.category === o.category); if (o.since) r = r.filter(x => Date.now() - new Date(x.created_at) < o.since * 6e4);
        r.sort(o.sort === 'top' ? (a, b) => b.helpful - a.helpful || b.id - a.id : (a, b) => b.id - a.id);
        const from = o.offset || 0; return wait(r.slice(from, from + (o.size || PAGE)).map(x => Object.assign({}, x)));
      },
      myVotes: async (ids) => new Set(ids.filter(i => voted.has(i))),
      async post(a) {
        if (posts <= 0) throw new Error('daily_limit'); posts--; const u = g.FutaPhone.getUser() || {};
        rows.unshift(Object.assign({ id: nid++, user_id: u.id || 'me', username: u.username || 'You', helpful: 0, created_at: new Date().toISOString() },
          nepa ? { status: a.status, place: a.place, body: a.note || '', expires_at: new Date(Date.now() + 12 * 36e5).toISOString() } : { category: a.category, title: a.title, body: a.body }));
        return wait({ id: nid, posts_left: posts });
      },
      async vote(id) { const x = rows.find(r => r.id === id); if (voted.has(id)) { voted.delete(id); x.helpful--; } else { voted.add(id); x.helpful++; } return wait({ helpful: x.helpful, voted: voted.has(id) }); },
      report: () => wait(null), remove: async (id) => { rows = rows.filter(r => r.id !== id); return wait(null); }
    };
  }

  const store = (kind) => g.FutaPhone.demo() ? demoStore(kind) : realStore(kind);
  g.FutaBulletin = { PAGE, h, STATUS, CATS, REASONS, say, ago, left, pager, store };
})(window);
