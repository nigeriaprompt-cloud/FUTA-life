/* ==========================================================================
   FUTA onboarding — API client. One function per endpoint in docs/API.md.
   demo:true  -> answers locally (localStorage "futa.demo.db") so the flow can be previewed with no server.
   demo:false -> Supabase (supabase-js): auth + RPCs defined in supabase/01_schema.sql. The browser only ever holds the anon key.
   Every function returns a Promise resolving to {ok:true,...} or rejecting with Error(message).
   ========================================================================== */
(function (g) {
  'use strict';
  const C = () => g.FUTA_CONFIG, KEY = 'futa.demo.db', RECOVERY = 'futa.recovery';
  const hasPw = (u) => ((u.app_metadata && u.app_metadata.providers) || []).indexOf('email') >= 0 || (u.identities || []).some(i => i.provider === 'email');   // does this account have an email+password login?
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
  const FRIENDLY = { under_age: 'Sorry, you need to be at least 13 to join.', auth_required: 'Please sign in again.', bad_amount: 'That amount is not allowed.', insufficient_funds: 'Not enough money.', already_claimed: 'You already claimed today. Come back tomorrow.', slow_down: 'Slow down a little.', message_not_allowed: 'That message is not allowed.', wave_first: 'Wave first and wait for them to wave back.', not_allowed: 'That is not allowed.', finish_sign_up: 'Finish creating your character first.', hair_requires_salon: 'Hair and beard are changed at a salon (it costs money).', nothing_changed: 'That is already your hair.', school_required: 'Please choose your school.', extra_required: 'Please answer the last question.', bad_status: 'Please pick one of the options.', bad_school: 'Please pick a school from the list.', bad_dept: 'Please pick a department from the list.', bad_extra: 'Please pick an answer from the list.', 'Invalid login credentials': 'Wrong email or password.', 'Email not confirmed': 'Please confirm your email first (check your inbox), then sign in.', 'Failed to fetch': 'Cannot reach the server. Check your internet and try again.', 'NetworkError': 'Cannot reach the server. Check your internet and try again.', 'rate limit': 'Too many attempts. Wait a minute and try again.', 'Password should be at least': 'Password needs at least 8 characters.', 'User already registered': 'That email already has an account. Try signing in.' };
  function fail(err) { const m = (err && err.message) || String(err); const k = Object.keys(FRIENDLY).find(x => m.indexOf(x) >= 0); return new Error(k ? FRIENDLY[k] : m); }
  async function rpc(name, args) { const { data, error } = await sb().rpc(name, args || {}); if (error) throw fail(error); return data; }
  async function sbMe() { const { data } = await sb().auth.getSession(); if (!data.session) return null; return rpc('get_me'); }
  const shape = (u) => u && { id: u.id, email: u.email, username: u.username, dob: u.dob, isTeen: u.isTeen, avatar: u.avatar, campus: u.campus, life: u.life, onboarded: u.onboarded, wallet: u.wallet, acceptWaves: u.acceptWaves };
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
      if (!C().demo) return sb().auth.signInWithOAuth({ provider: 'google', options: { redirectTo: location.origin + location.pathname, queryParams: { prompt: 'select_account' } } }).then(({ error }) => { if (error) throw fail(error); return new Promise(() => { }); /* the browser is leaving for Google; on return me() restores the session */ });
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
    /* POST /me/campus {status,school,dept,extra} -> {ok,user}  ("Where do you belong?"; the server checks every value against campus-options.json, see supabase/11_campus.sql) */
    saveCampus(status, school, dept, extra, extraType) {
      if (!C().demo) return rpc('set_campus', { p_status: status, p_school: school || null, p_dept: dept || null, p_extra: extra == null || extra === '' ? null : String(extra) }).then(u => ({ ok: true, user: shape(u) }));
      const d = db.read(), u = d.users.find(x => x.id === d.me); if (!u) return Promise.reject(new Error('Please sign in again.'));
      const c = { status }; if (school) c.school = school; if (dept) c.dept = dept; if (extra !== '' && extra != null && extraType) c[extraType] = extraType === 'year' ? +extra : extra; u.campus = c; db.write(d); return wait({ ok: true, user: u });
    },
    /* POST /me/life {start} -> {ok,life} */
    saveLife(start) {
      if (!C().demo) return rpc('save_life', { p_start: start }).then(u => ({ ok: true, life: u.life, user: shape(u) }));
      const d = db.read(), u = d.users.find(x => x.id === d.me); if (u) { u.life = start; db.write(d); } return wait({ ok: true, life: start });
    },
    /* Sign out. Always clears the local session, even if the network call fails, so the user is never stuck "logged in". */
    signOut() {
      if (!C().demo) { let s; try { s = sb(); } catch (e) { return Promise.resolve({ ok: true }); }
        return s.auth.signOut({ scope: 'local' }).catch(() => { }).then(() => { try { Object.keys(localStorage).filter(k => /^sb-.*-auth-token/.test(k)).forEach(k => localStorage.removeItem(k)); } catch (e) { } return { ok: true }; }); }
      const d = db.read(); d.me = null; db.write(d); return wait({ ok: true });
    },
    /* Finish an OAuth / email-confirm round trip: report errors Supabase put in the URL, then tidy the address bar. Returns an error message or ''. */
    consumeAuthRedirect() {
      let msg = ''; try {
        const q = new URLSearchParams(location.search), h = new URLSearchParams(location.hash.replace(/^#/, ''));
        const e = q.get('error_description') || h.get('error_description') || q.get('error') || h.get('error');
        if (e) msg = /expired|invalid/i.test(e) ? 'That link expired or was opened on another device. Please sign in with your email and password.' : e.replace(/\+/g, ' ');
        if (q.has('error') || q.has('error_description') || h.has('error') || h.has('access_token') || q.has('code')) {
          const done = () => { const u = new URL(location.href); ['error', 'error_code', 'error_description', 'code'].forEach(k => u.searchParams.delete(k)); history.replaceState(null, '', u.pathname + (u.search || '') ); };
          if (q.has('code') && !C().demo) { sb().auth.getSession().then(done, done); } else done();
        }
      } catch (e) { } return msg;
    },
    /* resend the confirmation email (sign-up screen) */
    resendConfirm(email) { if (C().demo) return wait({ ok: true }); return sb().auth.resend({ type: 'signup', email, options: { emailRedirectTo: location.origin + location.pathname } }).then(({ error }) => { if (error) throw fail(error); return { ok: true }; }); },
    /* password reset email. The link must come back to the sign-up page (the address Supabase already allows, SETUP A6); that page then asks for a NEW password.
       We remember "a reset was asked" on this device, because the link only works in the browser that asked (PKCE) — see isRecovery(). */
    resetPassword(email) {
      try { localStorage.setItem(RECOVERY, String(Date.now())); } catch (e) { }
      if (C().demo) return wait({ ok: true });
      return sb().auth.resetPasswordForEmail(email, { redirectTo: location.origin + '/world/game/onboarding/signup.html' })
        .then(({ error }) => { if (error) { try { localStorage.removeItem(RECOVERY); } catch (e) { } throw fail(error); } return { ok: true }; });
    },
    /* true when this page was opened from a password-reset email asked for within the last hour (call BEFORE consumeAuthRedirect, which tidies the URL) */
    isRecovery() {
      try { const q = new URLSearchParams(location.search), h = new URLSearchParams(location.hash.replace(/^#/, '')), t = +localStorage.getItem(RECOVERY) || 0;
        return t > 0 && Date.now() - t < 36e5 && (q.has('code') || h.get('type') === 'recovery'); } catch (e) { return false; }
    },
    /* set a NEW password while holding a reset-link session (sign-up page "Choose a new password" screen) */
    setPassword(next) {
      if (!next || next.length < 8) return Promise.reject(new Error('Password needs at least 8 characters.'));
      const done = () => { try { localStorage.removeItem(RECOVERY); } catch (e) { } return { ok: true }; };
      if (C().demo) { const d = db.read(), u = d.users.find(x => x.id === d.me); if (!u) return Promise.reject(new Error('That link expired. Ask for a new one.')); u.password = next; db.write(d); return wait(done()); }
      return sb().auth.updateUser({ password: next }).then(({ error }) => { if (error) throw fail(error); return done(); });
    },
    /* ---- account settings (phone Settings app) ---- */
    /* {email, hasPassword}: Google-only accounts have no password yet, so the phone offers "Set a password" without asking for the current one */
    authInfo() {
      if (C().demo) { const d = db.read(), u = d.users.find(x => x.id === d.me); return u ? wait({ email: u.email, hasPassword: u.provider === 'email' }) : Promise.reject(new Error('Please sign in again.')); }
      return sb().auth.getUser().then(({ data }) => { const u = data && data.user; if (!u) throw new Error('Please sign in again.'); return { email: u.email, hasPassword: hasPw(u) }; });
    },
    /* change the password of the signed-in player. Email accounts must give the current password first (checked by Supabase itself). */
    async changePassword(current, next) {
      if (!next || next.length < 8) throw new Error('Password needs at least 8 characters.');
      if (C().demo) { const d = db.read(), u = d.users.find(x => x.id === d.me); if (!u) throw new Error('Please sign in again.');
        if (u.provider === 'email') { if (u.password !== current) throw new Error('Your current password is not correct.'); if (current === next) throw new Error('Choose a password different from your current one.'); }
        u.password = next; u.provider = 'email'; db.write(d); await wait(0); return { ok: true }; }
      const s = sb(), { data } = await s.auth.getUser(), u = data && data.user; if (!u) throw new Error('Please sign in again.');
      if (hasPw(u)) {
        if (!current) throw new Error('Type your current password.');
        if (current === next) throw new Error('Choose a password different from your current one.');
        const r = await s.auth.signInWithPassword({ email: u.email, password: current }); if (r.error) throw new Error('Your current password is not correct.');
      }
      const { error } = await s.auth.updateUser({ password: next }); if (error) throw fail(error); return { ok: true };
    },
    /* {username, canChange, nextChangeAt, cooldownDays} — one rename per cooldown (server rule, supabase/11_account.sql) */
    usernameStatus() {
      if (!C().demo) return rpc('get_username_status').then(r => ({ username: r.username, canChange: r.can_change, nextChangeAt: r.next_change_at, cooldownDays: r.cooldown_days }));
      const d = db.read(), u = d.users.find(x => x.id === d.me); if (!u) return Promise.reject(new Error('Please sign in again.'));
      const days = 30, nxt = u.nameChangedAt ? new Date(new Date(u.nameChangedAt).getTime() + days * 864e5) : null, can = !nxt || nxt <= new Date();
      return wait({ username: u.username, canChange: can, nextChangeAt: can ? null : nxt.toISOString(), cooldownDays: days });
    },
    /* rename the signed-in player -> {ok,user}. Errors: 'username_cooldown:YYYY-MM-DD', 'same_name', or the reason text from usernameCheck */
    changeUsername(name) {
      const n = String(name || '').trim().toLowerCase();
      if (!C().demo) return rpc('change_username', { p_name: n }).then(u => ({ ok: true, user: shape(u) }));
      const d = db.read(), u = d.users.find(x => x.id === d.me); if (!u) return Promise.reject(new Error('Please sign in again.'));
      if (n === u.username) return Promise.reject(new Error('same_name'));
      if (!/^[a-z0-9_]{3,20}$/.test(n)) return Promise.reject(new Error('Use 3–20 letters, numbers or _ only.'));
      if (u.nameChangedAt && new Date(u.nameChangedAt).getTime() + 30 * 864e5 > Date.now()) return Promise.reject(new Error('username_cooldown:' + new Date(new Date(u.nameChangedAt).getTime() + 30 * 864e5).toISOString().slice(0, 10)));
      if (d.users.some(x => x.username === n) || ['admin', 'futa', 'support', 'moderator'].indexOf(n) >= 0) return Promise.reject(new Error('That name is taken.'));
      u.username = n; u.nameChangedAt = new Date().toISOString(); db.write(d); return wait({ ok: true, user: u });
    },
    /* subscribe to sign-in/sign-out in this or another tab. fn(event, session) */
    onAuth(fn) { if (C().demo) return () => { }; const { data } = sb().auth.onAuthStateChange(fn); return () => data.subscription.unsubscribe(); }
  };
  /* ---- game calls used by the world (real mode only; the demo world has no server) ---- */
  API.sb = sb; API.rpc = rpc; API.fail = fail;
  g.FutaApi = API;
})(window);
