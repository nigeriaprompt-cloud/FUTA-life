/* ==========================================================================
   FUTA onboarding — API client. One function per endpoint in docs/API.md.
   demo:true  -> answers locally (localStorage "futa.demo.db") so the flow can be previewed with no server.
   demo:false -> fetch() the Node (Vercel) endpoints. Cookies carry the session
                 (credentials: 'include'); every POST echoes the futa_csrf cookie
                 in the X-CSRF-Token header (the server refuses POSTs without it).
   Every function returns a Promise resolving to {ok:true,...} or rejecting with Error(message).
   ========================================================================== */
(function (g) {
  'use strict';
  const C = () => g.FUTA_CONFIG, KEY = 'futa.demo.db';
  const db = { read() { try { return JSON.parse(localStorage.getItem(KEY)) || { users: [], me: null }; } catch (e) { return { users: [], me: null }; } }, write(d) { try { localStorage.setItem(KEY, JSON.stringify(d)); } catch (e) { /* private mode */ } } };
  const wait = (v) => new Promise(r => setTimeout(() => r(v), 260));
  const cookie = (name) => (document.cookie.match(new RegExp('(?:^|; )' + name + '=([^;]*)')) || [])[1] || '';
  async function ensureCsrf() {
    if (cookie('futa_csrf')) return;                       // GET /me hands out the cookie if missing
    try { await fetch(C().apiBase + '/me', { credentials: 'include', headers: { 'Accept': 'application/json' } }); } catch (e) { /* offline; POST will 403 and the caller shows the error */ }
  }
  async function http(method, path, body) {
    const headers = { 'Accept': 'application/json' };
    if (body !== undefined && body !== null) headers['Content-Type'] = 'application/json';
    if (method !== 'GET') {
      await ensureCsrf();
      const tok = cookie('futa_csrf');
      if (tok) headers['X-CSRF-Token'] = tok;
    }
    const res = await fetch(C().apiBase + path, { method, credentials: 'include', headers, body: body ? JSON.stringify(body) : undefined });
    let data = {}; try { data = await res.json(); } catch (e) { /* non-json */ }
    if (!res.ok || data.ok === false) throw new Error(data.error || ('Request failed (' + res.status + ')'));
    return data;
  }
  const API = {
    /* POST /auth/register {email,password} -> {ok, needsVerify}  (sends a 6-digit code / link by email) */
    register(email, password) {
      if (!C().demo) return http('POST', '/auth/register', { email, password });
      const d = db.read(); if (d.users.some(u => u.email === email)) return Promise.reject(new Error('That email already has an account. Try signing in.'));
      const u = { id: 'u' + Date.now(), email, password, provider: 'email', username: null, dob: null, avatar: null, life: null }; d.users.push(u); d.me = u.id; db.write(d); return wait({ ok: true, needsVerify: false, user: u });
    },
    /* POST /auth/login {email,password} -> {ok,user} */
    login(email, password) {
      if (!C().demo) return http('POST', '/auth/login', { email, password });
      const d = db.read(), u = d.users.find(x => x.email === email && x.password === password); if (!u) return Promise.reject(new Error('Wrong email or password.'));
      d.me = u.id; db.write(d); return wait({ ok: true, user: u });
    },
    /* POST /auth/google {credential} -> {ok,user}  (server verifies the Google ID token — never trust the browser) */
    google(credential) {
      if (!C().demo) return http('POST', '/auth/google', { credential });
      const d = db.read(); let u = d.users.find(x => x.provider === 'google-demo'); if (!u) { u = { id: 'g' + Date.now(), email: 'demo.user@gmail.com', provider: 'google-demo', username: null, dob: null, avatar: null, life: null }; d.users.push(u); } d.me = u.id; db.write(d); return wait({ ok: true, user: u });
    },
    /* GET /me -> {ok,user|null} */
    me() { if (!C().demo) return http('GET', '/me'); const d = db.read(); return wait({ ok: true, user: d.users.find(u => u.id === d.me) || null }); },
    /* GET /username/check?u=name -> {ok,available,reason?} */
    usernameCheck(name) {
      if (!C().demo) return http('GET', '/username/check?u=' + encodeURIComponent(name));
      const d = db.read(), taken = d.users.some(u => u.username === name) || ['admin', 'futa', 'support', 'moderator'].indexOf(name) >= 0; return wait({ ok: true, available: !taken, reason: taken ? 'That name is taken.' : '' });
    },
    /* POST /me/profile {username,dob} -> {ok,user}  (server computes age and stores teen flag) */
    saveProfile(username, dob) {
      if (!C().demo) return http('POST', '/me/profile', { username, dob });
      const d = db.read(), u = d.users.find(x => x.id === d.me); if (!u) return Promise.reject(new Error('Please sign in again.')); u.username = username; u.dob = dob; db.write(d); return wait({ ok: true, user: u });
    },
    /* POST /me/avatar {look} -> {ok,look}  (server runs AvatarValidator and returns the cleaned look) */
    saveAvatar(look) {
      if (!C().demo) return http('POST', '/me/avatar', { look });
      const d = db.read(), u = d.users.find(x => x.id === d.me); if (u) { u.avatar = look; db.write(d); } return wait({ ok: true, look });
    },
    /* POST /me/life {start} -> {ok,life} */
    saveLife(start) {
      if (!C().demo) return http('POST', '/me/life', { start });
      const d = db.read(), u = d.users.find(x => x.id === d.me); if (u) { u.life = start; db.write(d); } return wait({ ok: true, life: start });
    },
    signOut() { if (!C().demo) return http('POST', '/auth/logout'); const d = db.read(); d.me = null; db.write(d); return wait({ ok: true }); }
  };
  g.FutaApi = API;
})(window);
