/* ==========================================================================
   FUTA onboarding — API client. One function per endpoint in docs/API.md.
   demo:true  -> answers locally (localStorage "futa.demo.db") so the flow can be previewed with no server.
   demo:false -> Supabase (supabase-js): auth + RPCs defined in supabase/01_schema.sql. The browser only ever holds the anon key.
   Every function returns a Promise resolving to {ok:true,...} or rejecting with Error(message).
   ========================================================================== */
(function (g) {
  'use strict';
  const C = () => g.FUTA_CONFIG, KEY = 'futa.demo.db';
  const db = { read() { try { return JSON.parse(localStorage.getItem(KEY)) || { users: [], me: null }; } catch (e) { return { users: [], me: null }; } }, write(d) { try { localStorage.setItem(KEY, JSON.stringify(d)); } catch (e) { /* private mode */ } } };
  const wait = (v) => new Promise(r => setTimeout(() => r(v), 260));
  /* ---- Supabase (real mode) ---- */
  let _sb = null;
  function sb() {
    if (_sb) return _sb; const c = C();
    if (!g.supabase || !c.supabaseUrl || !c.supabaseAnonKey) throw new Error('Supabase is not configured. Fill supabaseUrl and supabaseAnonKey in config.js.');
    _sb = g.supabase.createClient(c.supabaseUrl, c.supabaseAnonKey, { auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true, flowType: 'pkce' }, realtime: { params: { eventsPerSecond: 10 } } });
    return _sb;
  }
  const FRIENDLY = { under_age: 'Sorry, you need to be at least 13 to join.', auth_required: 'Please sign in again.', bad_amount: 'That amount is not allowed.', insufficient_funds: 'Not enough money.', already_claimed: 'You already claimed today. Come back tomorrow.', slow_down: 'Slow down a little.', message_not_allowed: 'That message is not allowed.', wave_first: 'Wave first and wait for them to wave back.', not_allowed: 'That is not allowed.', finish_sign_up: 'Finish creating your character first.', 'Invalid login credentials': 'Wrong email or password.', 'Email not confirmed': 'Please confirm your email first (check your inbox), then sign in.', 'User already registered': 'That email already has an account. Try signing in.' };
  function fail(err) { const m = (err && err.message) || String(err); const k = Object.keys(FRIENDLY).find(x => m.indexOf(x) >= 0); return new Error(k ? FRIENDLY[k] : m); }
  async function rpc(name, args) { const { data, error } = await sb().rpc(name, args || {}); if (error) throw fail(error); return data; }
  async function sbMe() { const { data } = await sb().auth.getSession(); if (!data.session) return null; return rpc('get_me'); }
  const shape = (u) => u && { id: u.id, email: u.email, username: u.username, dob: u.dob, isTeen: u.isTeen, avatar: u.avatar, life: u.life, onboarded: u.onboarded, wallet: u.wallet, acceptWaves: u.acceptWaves };
  const API = {
    /* POST /auth/register {email,password} -> {ok, needsVerify}  (sends a 6-digit code / link by email) */
    register(email, password) {
      if (!C().demo) return sb().auth.signUp({ email, password, options: { emailRedirectTo: location.origin + location.pathname } }).then(({ data, error }) => { if (error) throw fail(error); if (data.user && data.user.identities && data.user.identities.length === 0) throw fail({ message: 'User already registered' }); return { ok: true, needsVerify: !data.session }; });
      const d = db.read(); if (d.users.some(u => u.email === email)) return Promise.reject(new Error('That email already has an account. Try signing in.'));
      const u = { id: 'u' + Date.now(), email, password, provider: 'email', username: null, dob: null, avatar: null, life: null }; d.users.push(u); d.me = u.id; db.write(d); return wait({ ok: true, needsVerify: false, user: u });
    },
    /* POST /auth/login {email,password} -> {ok,user} */
    login(email, password) {
      if (!C().demo) return sb().auth.signInWithPassword({ email, password }).then(({ error }) => { if (error) throw fail(error); return sbMe().then(u => ({ ok: true, user: shape(u) })); });
      const d = db.read(), u = d.users.find(x => x.email === email && x.password === password); if (!u) return Promise.reject(new Error('Wrong email or password.'));
      d.me = u.id; db.write(d); return wait({ ok: true, user: u });
    },
    /* POST /auth/google {credential} -> {ok,user}  (server verifies the Google ID token — never trust the browser) */
    google(credential) {
      if (!C().demo) return sb().auth.signInWithOAuth({ provider: 'google', options: { redirectTo: location.origin + location.pathname } }).then(({ error }) => { if (error) throw fail(error); return new Promise(() => { }); /* the browser is leaving for Google; on return me() restores the session */ });
      const d = db.read(); let u = d.users.find(x => x.provider === 'google-demo'); if (!u) { u = { id: 'g' + Date.now(), email: 'demo.user@gmail.com', provider: 'google-demo', username: null, dob: null, avatar: null, life: null }; d.users.push(u); } d.me = u.id; db.write(d); return wait({ ok: true, user: u });
    },
    /* GET /me -> {ok,user|null} */
    me() { if (!C().demo) return Promise.resolve().then(sbMe).then(u => ({ ok: true, user: shape(u) })).catch(e => { throw fail(e); }); const d = db.read(); return wait({ ok: true, user: d.users.find(u => u.id === d.me) || null }); },
    /* GET /username/check?u=name -> {ok,available,reason?} */
    usernameCheck(name) {
      if (!C().demo) return rpc('username_available', { p_name: name }).then(r => ({ ok: true, available: r.available, reason: r.reason }));
      const d = db.read(), taken = d.users.some(u => u.username === name) || ['admin', 'futa', 'support', 'moderator'].indexOf(name) >= 0; return wait({ ok: true, available: !taken, reason: taken ? 'That name is taken.' : '' });
    },
    /* POST /me/profile {username,dob} -> {ok,user}  (server computes age and stores teen flag) */
    saveProfile(username, dob) {
      if (!C().demo) return rpc('set_profile', { p_username: username, p_dob: dob }).then(u => ({ ok: true, user: shape(u) }));
      const d = db.read(), u = d.users.find(x => x.id === d.me); if (!u) return Promise.reject(new Error('Please sign in again.')); u.username = username; u.dob = dob; db.write(d); return wait({ ok: true, user: u });
    },
    /* POST /me/avatar {look} -> {ok,look}  (server runs AvatarValidator and returns the cleaned look) */
    saveAvatar(look) {
      if (!C().demo) return rpc('save_avatar', { p_look: look }).then(l => ({ ok: true, look: l }));
      const d = db.read(), u = d.users.find(x => x.id === d.me); if (u) { u.avatar = look; db.write(d); } return wait({ ok: true, look });
    },
    /* POST /me/life {start} -> {ok,life} */
    saveLife(start) {
      if (!C().demo) return rpc('save_life', { p_start: start }).then(u => ({ ok: true, life: u.life, user: shape(u) }));
      const d = db.read(), u = d.users.find(x => x.id === d.me); if (u) { u.life = start; db.write(d); } return wait({ ok: true, life: start });
    },
    signOut() { if (!C().demo) return sb().auth.signOut().then(() => ({ ok: true })); const d = db.read(); d.me = null; db.write(d); return wait({ ok: true }); }
  };
  /* ---- game calls used by the world (real mode only; the demo world has no server) ---- */
  API.sb = sb; API.rpc = rpc; API.fail = fail;
  g.FutaApi = API;
})(window);
