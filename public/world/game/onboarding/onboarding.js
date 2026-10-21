/* ==========================================================================
   FUTA onboarding flow — the screens: welcome → account → profile → look → life → final.
   One function per screen (S.welcome, S.account, …). Cline: to add a screen, add S.<name> and call go('<name>').
   Talks to the server ONLY through FutaApi (api.js). Settings come from FUTA_CONFIG (config.js).
   The heavy 3D engine is NOT loaded up front: it downloads in the background after the welcome screen
   paints (loadEngine), so the first screen appears instantly even on slow mobile data.
   ========================================================================== */
(function () {
  'use strict';
  /* "?next=/world/interior.html?..." : where to go after sign-in (set by the phone's "Sign in to continue" sheet). Kept in storage so it survives Google sign-in and email confirmation.
     Only same-site paths are accepted (never another website). */
  const safeNext = (v) => (typeof v === 'string' && /^\/(?!\/|\\)[^\s]*$/.test(v) && v.length < 600) ? v : null;
  try { const q = safeNext(new URLSearchParams(location.search).get('next')); if (q) sessionStorage.setItem('futa.next', q); } catch (e) { /* private mode */ }
  function after() { let n = null; try { n = safeNext(sessionStorage.getItem('futa.next')); sessionStorage.removeItem('futa.next'); } catch (e) { /* none */ } return n || C.afterUrl; }

  const C = window.FUTA_CONFIG, API = window.FutaApi;
  const $ = (s, r) => (r || document).querySelector(s);
  const esc = (s) => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const screen = $('#screen'), backBtn = $('#back'), stepsEl = $('#steps'), signBtn = $('#signout');
  let user = null, history = [], cur = '', pending = {};

  /* ---------- helpers ---------- */
  function toast(msg) { const t = $('#toast'); t.textContent = msg; t.classList.add('show'); clearTimeout(toast.t); toast.t = setTimeout(() => t.classList.remove('show'), 3200); }
  const STEP_OF = { welcome: -1, newpass: -1, account: 0, profile: 1, campus: 2, look: 3, life: 4, final: 5 };
  function setSteps(name) { const n = STEP_OF[name]; stepsEl.hidden = n < 0; stepsEl.querySelectorAll('li').forEach((li, i) => li.classList.toggle('on', i <= n)); }
  function go(name, opts) {
    if (cur && !(opts && opts.replace)) history.push(cur);
    cur = name; setSteps(name); document.body.classList.toggle('fit', name === 'look'); // 'fit' = the studio fills the screen exactly (no page scroll)
    backBtn.hidden = history.length === 0 || name === 'final' || name === 'welcome'; signBtn.hidden = !user;
    if (S.dispose) { S.dispose(); S.dispose = null; }
    screen.innerHTML = ''; screen.style.animation = 'none'; void screen.offsetWidth; screen.style.animation = '';
    S[name]();
  }
  backBtn.onclick = () => { const prev = history.pop(); if (prev) { cur = ''; go(prev, { replace: true }); history.pop && 0; backBtn.hidden = history.length === 0; } };
  function busy(btn, on, label) { btn.disabled = on; if (label) btn.dataset.l = btn.dataset.l || btn.textContent, btn.textContent = on ? label : btn.dataset.l; }
  function route(u) { // decide the first screen that is still unfinished (also resumes after a refresh)
    user = u; history = []; signBtn.hidden = !u;
    if (!u) return go('welcome', { replace: true });
    if (u.onboarded && !/[?&]stay\b/.test(location.search) && !C.demo) { location.replace(after()); return; }   // already has a character: straight to the map (add ?stay to stay here)
    if (!u.username || !u.dob) return go('profile', { replace: true });
    if (/[?&]edit=campus\b/.test(location.search) || (!u.campus && !/[?&]edit=look\b/.test(location.search))) return go('campus', { replace: true });   // "Where do you belong?" (school + status); ?stay&edit=campus lets a player change it later
    if (!u.avatar || /[?&]edit=look\b/.test(location.search)) return go('look', { replace: true });   // ?stay&edit=look = the wardrobe in a building opens the outfit editor
    if (!u.life) return go('life', { replace: true });
    go('final', { replace: true });
  }

  function doSignOut() {
    busy(signBtn, true, 'Signing out…');
    API.signOut().catch(() => { }).then(() => { user = null; history = []; cur = ''; busy(signBtn, false); signBtn.hidden = true; pending = {}; go('welcome', { replace: true }); toast('You are signed out.'); });
  }
  signBtn.onclick = doSignOut;

  /* ---------- lazy 3D engine ---------- */
  const ENGINE = ['../../vendor/three.min.js', '../avatar/avatar-options.js', '../avatar/avatar-core.js', '../avatar/avatar-body.js', '../avatar/avatar-wear.js', '../avatar/avatar-rig.js', '../avatar/avatar-build.js', 'creator.js'];
  let enginePromise = null;
  function loadEngine() {
    if (enginePromise) return enginePromise;
    enginePromise = new Promise((resolve, reject) => {
      let left = ENGINE.length;
      ENGINE.forEach(src => { const s = document.createElement('script'); s.src = src; s.async = false; s.onload = () => { if (--left === 0) resolve(); }; s.onerror = () => { enginePromise = null; reject(new Error('Could not load ' + src)); }; document.head.appendChild(s); });
    });
    return enginePromise;
  }
  const idle = window.requestIdleCallback || ((f) => setTimeout(f, 1200));

  /* ---------- screens ---------- */
  const S = {};

  S.welcome = function () {
    screen.innerHTML = `
      <section class="hero">
        <div>
          <div class="skyline" aria-hidden="true"></div>
          <h1 style="margin-top:18px">${esc(C.brand.name)}</h1>
          <p class="lead">${esc(C.brand.tagline)} Create your look, walk the campus, meet people, hustle, and live that Lagos life.</p>
        </div>
        <div class="card narrow">
          <button class="btn gold" id="startBtn">Create my character</button>
          <div class="or">or</div>
          <button class="btn" id="signinBtn">I already have an account</button>
          <p class="fine">By continuing you agree to the community rules: be kind, no harassment, no sharing others’ private info.</p>
        </div>
      </section>`;
    $('#startBtn').onclick = () => { pending.mode = 'register'; go('account'); };
    $('#signinBtn').onclick = () => { pending.mode = 'login'; go('account'); };
    idle(() => loadEngine().catch(() => { }));
  };

  const GOOGLE_SVG = '<svg viewBox="0 0 48 48"><path fill="#EA4335" d="M24 9.5c3.5 0 6.6 1.2 9.1 3.6l6.8-6.8C35.8 2.4 30.3 0 24 0 14.6 0 6.5 5.4 2.6 13.2l7.9 6.1C12.4 13.6 17.7 9.5 24 9.5z"/><path fill="#4285F4" d="M46.5 24.5c0-1.6-.1-3.1-.4-4.5H24v9h12.7c-.6 3-2.3 5.5-4.8 7.2l7.5 5.8c4.4-4.1 7.1-10.1 7.1-17.5z"/><path fill="#FBBC05" d="M10.5 28.7A14.5 14.5 0 0 1 9.5 24c0-1.6.3-3.2.8-4.7l-7.9-6.1A24 24 0 0 0 0 24c0 3.9.9 7.5 2.6 10.8l7.9-6.1z"/><path fill="#34A853" d="M24 48c6.5 0 11.9-2.1 15.9-5.8l-7.5-5.8c-2.1 1.4-4.8 2.3-8.4 2.3-6.3 0-11.6-4.1-13.5-9.8l-7.9 6.1C6.5 42.6 14.6 48 24 48z"/></svg>';

  S.account = function () {
    const mode = pending.mode || 'register';
    screen.innerHTML = `
      <div class="card narrow">
        <h2>${mode === 'register' ? 'Create your account' : 'Welcome back'}</h2>
        <p class="lead" style="margin-bottom:12px">${mode === 'register' ? 'Takes under a minute. You’ll design your character next.' : 'Sign in to continue to your life in FUTAlife.'}</p>
        <div id="gslot"></div>
        <div class="or">or use email</div>
        <div class="tabs2"><button data-m="register" class="${mode === 'register' ? 'on' : ''}">Create account</button><button data-m="login" class="${mode === 'login' ? 'on' : ''}">Sign in</button></div>
        <form id="f" novalidate>
          <label class="f"><span>Email</span><input type="email" id="em" autocomplete="email" inputmode="email" required></label>
          <label class="f"><span>Password</span><input type="password" id="pw" autocomplete="${mode === 'register' ? 'new-password' : 'current-password'}" minlength="8" required></label>
          <div class="hint" id="msg"></div>
          <button class="btn gold" id="go" type="submit">${mode === 'register' ? 'Continue' : 'Sign in'}</button>
          ${mode === 'login' ? '<button class="linkbtn" type="button" id="forgot">Forgot password?</button>' : ''}
        </form>
        ${C.demo ? '<p class="fine">Demo mode: accounts are stored only in this browser.</p>' : ''}
      </div>`;
    screen.querySelectorAll('.tabs2 button').forEach(b => b.onclick = () => { pending.mode = b.dataset.m; go('account', { replace: true }); });
    // Google button: real Google button when a client id is configured, otherwise a demo button
    const slot = $('#gslot');
    slot.innerHTML = `<button class="btn g" type="button" id="gbtn">${GOOGLE_SVG}<span>Continue with Google</span></button>`;
    $('#gbtn').onclick = function () { const b = this; busy(b, true); API.google('demo').then(r => route(r.user)).catch(e => { toast(e.message); busy(b, false); }); };   // real mode: leaves for Google; the session is restored by the boot code when Google sends the player back
    if ($('#forgot')) $('#forgot').onclick = () => {
      const em = $('#em').value.trim().toLowerCase(), msg = $('#msg'); msg.className = 'hint bad';
      if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(em)) { msg.textContent = 'Type your email above first, then tap Forgot password.'; return; }
      API.resetPassword(em).then(() => { msg.className = 'hint ok'; msg.textContent = 'If that email has an account, a reset link is on its way.'; }).catch(err => { msg.textContent = err.message; });
    };
    $('#f').onsubmit = (e) => {
      e.preventDefault(); const em = $('#em').value.trim().toLowerCase(), pw = $('#pw').value, msg = $('#msg'), btn = $('#go');
      msg.className = 'hint bad';
      if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(em)) { msg.textContent = 'Enter a valid email address.'; return; }
      if (pw.length < 8) { msg.textContent = 'Password needs at least 8 characters.'; return; }
      busy(btn, true, 'One moment…');
      (mode === 'register' ? API.register(em, pw) : API.login(em, pw))
        .then(res => (res && res.needsVerify) ? (msg.className = 'hint ok', msg.innerHTML = 'Almost there! We sent a confirmation link to <b></b>. Open it, then come back here and sign in. <button type="button" class="linkbtn" id="resend">Resend email</button>', msg.querySelector('b').textContent = em, $('#resend').onclick = () => API.resendConfirm(em).then(() => toast('Confirmation email sent again.')).catch(x => toast(x.message)), busy(btn, false)) : API.me().then(r => route(r.user)))
        .catch(err => { msg.textContent = err.message; busy(btn, false); });
    };
  };

  function ageOf(dob) { const d = new Date(dob), n = new Date(); let a = n.getFullYear() - d.getFullYear(); if (n < new Date(n.getFullYear(), d.getMonth(), d.getDate())) a--; return a; }
  S.profile = function () {
    screen.innerHTML = `
      <div class="card narrow">
        <h2>Who are you?</h2>
        <p class="lead" style="margin-bottom:12px">Pick a username people will see above your head.</p>
        <form id="f" novalidate>
          <label class="f"><span>Username</span><input type="text" id="un" maxlength="20" autocomplete="username" autocapitalize="none" spellcheck="false" placeholder="e.g. lagos_baddie"></label>
          <div class="hint" id="unh">3–20 letters, numbers or _</div>
          <label class="f" style="margin-top:8px"><span>Date of birth</span><input type="date" id="dob" max="${new Date().toISOString().slice(0, 10)}"></label>
          <div class="hint" id="dobh">We use this only for age safety. Players under ${C.adultAge} get Teen Mode.</div>
          <button class="btn gold" id="go" type="submit" disabled>Continue</button>
        </form>
      </div>`;
    const un = $('#un'), dob = $('#dob'), unh = $('#unh'), dobh = $('#dobh'), go_ = $('#go'); let okName = false, okDob = false, tm = 0;
    if (user && user.username) un.value = user.username; if (user && user.dob) dob.value = user.dob;
    const refresh = () => { go_.disabled = !(okName && okDob); };
    const checkName = () => {
      clearTimeout(tm); const v = un.value.trim().toLowerCase(); okName = false; refresh();
      if (!/^[a-z0-9_]{3,20}$/.test(v)) { unh.className = 'hint' + (v ? ' bad' : ''); unh.textContent = v ? 'Use 3–20 letters, numbers or _ only.' : '3–20 letters, numbers or _'; return; }
      unh.className = 'hint'; unh.textContent = 'Checking…';
      tm = setTimeout(() => API.usernameCheck(v).then(r => { if (un.value.trim().toLowerCase() !== v) return; okName = !!r.available; unh.className = 'hint ' + (r.available ? 'ok' : 'bad'); unh.textContent = r.available ? '✓ ' + v + ' is yours' : (r.reason || 'That name is taken.'); refresh(); }).catch(() => { unh.textContent = 'Could not check right now.'; }), 350);
    };
    const checkDob = () => {
      okDob = false; if (!dob.value) { refresh(); return; } const a = ageOf(dob.value);
      if (a < C.minAge) { dobh.className = 'hint bad'; dobh.textContent = 'Sorry, you need to be at least ' + C.minAge + ' to join.'; }
      else if (a < C.adultAge) { okDob = true; dobh.className = 'hint ok'; dobh.textContent = 'Teen Mode: private chat is limited and some outfits are hidden.'; }
      else { okDob = true; dobh.className = 'hint ok'; dobh.textContent = '✓ Thanks'; }
      refresh();
    };
    un.oninput = checkName; dob.oninput = dob.onchange = checkDob; checkName(); checkDob();
    $('#f').onsubmit = (e) => { e.preventDefault(); busy(go_, true, 'Saving…'); API.saveProfile(un.value.trim().toLowerCase(), dob.value).then(r => { user = r.user || user; go(user.campus ? 'look' : 'campus'); }).catch(err => { toast(err.message); busy(go_, false); }); };
  };

  /* ---------- "Where do you belong?": status + FUTA school/department + one extra answer. Options come from campus-options.json (the server checks the same list). ---------- */
  S.campus = function () {
    screen.innerHTML = `<h2 style="margin:4px 2px 0">Where do you belong?</h2><p class="lead">Tell us your place in the FUTA story. It shows as a small tag on your profile, and you can change it later.</p><div class="stories compact" id="st"><div class="skeleton" style="height:140px"></div></div><div id="cf" class="card narrow" hidden></div><div class="hint" id="cm" style="text-align:center;margin:8px 0"></div><button class="btn gold" id="go" disabled>Continue</button>`;
    const old = (user && user.campus) || {}; let opt = null, status = null, vals = { school: old.school || '', dept: old.dept || '', extra: '' };
    const sel = (id, label, items, cur, ph) => `<label class="f"><span>${esc(label)}</span><select id="${id}"><option value="">${esc(ph || 'Choose…')}</option>${items.map(i => `<option value="${esc(i.id)}"${String(i.id) === String(cur) ? ' selected' : ''}>${esc(i.name)}</option>`).join('')}</select></label>`;
    const name = (list, id) => (list.find(x => String(x.id) === String(id)) || {}).name || '';
    function fields() {
      const cf = $('#cf'), st = status; cf.hidden = !st || (st.school === 'none' && !st.extra); if (!st) return;
      let h = '';
      if (st.school !== 'none') h += sel('fs', (st.schoolLabel || 'Your school') + (st.school === 'optional' ? ' (optional)' : ''), opt.schools.map(x => ({ id: x.id, name: x.short + ' · ' + x.name })), vals.school, 'Choose your school');
      const sc = opt.schools.find(x => x.id === vals.school);
      if (st.school !== 'none' && sc) h += sel('fd', 'Department (optional)', sc.depts, vals.dept, 'Not sure / skip');
      const ex = st.extra;
      if (ex) {
        let items = ex.type === 'level' ? opt.levels : ex.type === 'area' ? opt.areas : ex.type === 'exam' ? opt.exams : [];
        if (ex.type === 'year') { items = []; for (let y = ex.max || opt.years.max; y >= (ex.min || opt.years.min); y--) items.push({ id: y, name: String(y) }); }
        h += sel('fe', ex.label + (ex.required ? '' : ' (optional)'), items, vals.extra, 'Choose…');
      }
      cf.innerHTML = h;
      const s1 = $('#fs'), s2 = $('#fd'), s3 = $('#fe');
      if (s1) s1.onchange = () => { vals.school = s1.value; vals.dept = ''; fields(); check(); };
      if (s2) s2.onchange = () => { vals.dept = s2.value; check(); };
      if (s3) s3.onchange = () => { vals.extra = s3.value; check(); };
    }
    function check() {
      const st = status, ok = !!st && (st.school !== 'required' || !!vals.school) && (!st.extra || !st.extra.required || !!vals.extra);
      $('#go').disabled = !ok; const bits = [];
      if (st) { bits.push(st.title); const sc = opt.schools.find(x => x.id === vals.school); if (sc && st.school !== 'none') bits.push(sc.short); if (sc && vals.dept) bits.push(name(sc.depts, vals.dept)); if (st.extra && vals.extra) bits.push(st.extra.type === 'year' ? vals.extra : name({ level: opt.levels, area: opt.areas, exam: opt.exams }[st.extra.type] || [], vals.extra)); }
      $('#cm').textContent = bits.length ? 'Your tag: ' + bits.join(' · ') : '';
    }
    fetch('campus-options.json').then(r => r.json()).then(d => {
      opt = d; const box = $('#st'); box.innerHTML = '';
      d.statuses.forEach(s => {
        const b = document.createElement('button'); b.type = 'button'; b.className = 'story'; b.innerHTML = `<h3>${esc(s.title)}</h3><p>${esc(s.blurb)}</p>`;
        b.onclick = () => { if (status !== s) { status = s; vals = { school: s.school === 'none' ? '' : vals.school, dept: '', extra: '' }; } box.querySelectorAll('.story').forEach(x => x.classList.toggle('on', x === b)); fields(); check(); if (!$('#cf').hidden) $('#cf').scrollIntoView({ behavior: 'smooth', block: 'nearest' }); };
        box.appendChild(b); if (old.status === s.id) { b.click(); const e = s.extra; if (e && old[e.type] != null) { vals.extra = String(old[e.type]); fields(); check(); } }
      });
    }).catch(() => { $('#st').textContent = 'Could not load the school list. Check your connection and refresh.'; });
    $('#go').onclick = function () { busy(this, true, 'Saving…'); API.saveCampus(status.id, vals.school, vals.dept, vals.extra, status.extra && status.extra.type).then(r => { user = r.user || user; go('look'); }).catch(e => { toast(e.message); busy(this, false); }); };
  };

  S.look = function () {
    screen.innerHTML = `<h2 style="margin:4px 2px 0">Design your character</h2><div class="creator-wrap"><div id="crMount"><div class="skeleton" style="height:55vh"></div></div><div class="bar"><button class="btn gold" id="save">Looks great — save</button></div></div>`;
    let ctl = null, dead = false;
    S.dispose = () => { dead = true; ctl && ctl.dispose(); };
    loadEngine().then(() => {
      if (dead) return; const mount = $('#crMount'); mount.className = ''; mount.style.cssText = 'flex:1;min-height:0;display:flex;flex-direction:column';
      const start = (user && user.avatar) || window.FutaCreator.loadDraft() || null;
      ctl = window.FutaCreator.mount(mount, { look: start || undefined, lockHair: !!(user && user.onboarded && user.avatar) });   // after sign-up, hair is a paid salon service
    }).catch(e => { $('#crMount').innerHTML = '<div class="card">Could not load the character studio. Check your connection and refresh.<br><small>' + esc(e.message) + '</small></div>'; });
    $('#save').onclick = function () { if (!ctl) return; busy(this, true, 'Saving…'); API.saveAvatar(ctl.getLook()).then(r => { user.avatar = r.look; const back = new URLSearchParams(location.search).get('r'); if (/[?&]edit=look\b/.test(location.search) && back && /^\/(?!\/)/.test(back)) { location.href = back; return; } go('life'); }).catch(e => { toast(e.message); busy(this, false); }); };
  };

  S.life = function () {
    screen.innerHTML = `<h2 style="margin:4px 2px 0">How does your story start?</h2><p class="lead">You can’t get this wrong — you can change direction anytime in the world.</p><div class="stories" id="st"><div class="skeleton" style="height:140px"></div></div><button class="btn gold" id="go" disabled>Start my life</button>`;
    let pick = null;
    fetch('life-start.json').then(r => r.json()).then(d => {
      const st = $('#st'); st.innerHTML = '';
      d.starts.forEach(s => { const b = document.createElement('button'); b.className = 'story'; b.innerHTML = `<h3>${esc(s.title)}</h3><p>${esc(s.blurb)}</p><div class="pills"><span class="pill">₦${s.cash.toLocaleString()}</span>${Object.keys(s.stats).map(k => `<span class="pill">${esc(k)} ${s.stats[k]}</span>`).join('')}</div>`; b.onclick = () => { pick = s.id; st.querySelectorAll('.story').forEach(x => x.classList.toggle('on', x === b)); $('#go').disabled = false; }; st.appendChild(b); });
    }).catch(() => { $('#st').textContent = 'Could not load story choices.'; });
    $('#go').onclick = function () { busy(this, true, 'Setting up…'); API.saveLife(pick).then(r => { user.life = r.life; go('final'); }).catch(e => { toast(e.message); busy(this, false); }); };
  };

  S.final = function () {
    screen.innerHTML = `<div class="final"><h1>You’re in, ${esc(user.username || 'friend')}.</h1><p class="lead">Your character is ready. Akure is waiting.</p><div class="stage-sm" id="fs"></div><div class="narrow" style="width:100%"><button class="btn gold" id="enter">Enter FUTAlife</button><button class="btn" id="edit" style="margin-top:8px">Change my look</button></div></div>`;
    $('#edit').onclick = () => go('look');
    $('#enter').onclick = () => { if (C.demo) { toast('Demo mode: the real game opens at ' + C.afterUrl); } else location.href = after(); };
    let raf = 0, r = null;
    S.dispose = () => { cancelAnimationFrame(raf); r && r.dispose(); };
    loadEngine().then(() => {
      const T = window.THREE, host = $('#fs'); if (!host) return; const cv = document.createElement('canvas'); host.appendChild(cv);
      r = new T.WebGLRenderer({ canvas: cv, antialias: true, alpha: true }); r.outputEncoding = T.sRGBEncoding; r.setPixelRatio(Math.min(2, devicePixelRatio || 1));
      const w = host.clientWidth, h = host.clientHeight; r.setSize(w, h, false); const sc = new T.Scene(), cam = new T.PerspectiveCamera(24, w / h, .1, 50);
      sc.add(new T.HemisphereLight(0xffffff, 0x6b7280, .75)); const k = new T.DirectionalLight(0xfff0dd, .7); k.position.set(2, 3.5, 3); sc.add(k);
      const av = window.FutaAvatar.create(user.avatar, { lod: 0, material: 'standard' }); av.setPose('wave'); sc.add(av.group); cam.position.set(0, 1.1, 6.2); cam.lookAt(0, .95, 0);
      let last = performance.now(); (function loop(n) { raf = requestAnimationFrame(loop); const dt = Math.min(.05, (n - last) / 1000); last = n; av.group.rotation.y = Math.sin(n / 1500) * .35; av.update(dt); r.render(sc, cam); })(last);
    }).catch(() => { });
  };

  /* "Choose a new password": shown when the player arrives from a password-reset email (API.isRecovery). Without this the reset link just signed them in. */
  S.newpass = function () {
    screen.innerHTML = `
      <div class="card narrow">
        <h2>Choose a new password</h2>
        <p class="lead" style="margin-bottom:12px">Pick one you don’t use anywhere else. At least 8 characters.</p>
        <form id="f" novalidate>
          <label class="f"><span>New password</span><input type="password" id="p1" autocomplete="new-password" minlength="8" required></label>
          <label class="f"><span>Type it again</span><input type="password" id="p2" autocomplete="new-password" minlength="8" required></label>
          <div class="hint" id="msg"></div>
          <button class="btn gold" id="go" type="submit">Save new password</button>
        </form>
      </div>`;
    $('#f').onsubmit = (e) => {
      e.preventDefault(); const a = $('#p1').value, b = $('#p2').value, msg = $('#msg'), btn = $('#go'); msg.className = 'hint bad';
      if (a.length < 8) { msg.textContent = 'Password needs at least 8 characters.'; return; }
      if (a !== b) { msg.textContent = 'The two passwords are not the same.'; return; }
      busy(btn, true, 'Saving…');
      API.setPassword(a).then(() => { toast('Password changed.'); route(user); }).catch(err => { msg.textContent = err.message; busy(btn, false); });
    };
  };

  /* ---------- boot ---------- */
  const recovering = API.isRecovery();   // opened from a password-reset email? Must be asked BEFORE consumeAuthRedirect tidies the URL
  const redirectMsg = API.consumeAuthRedirect();   // errors from Google / email-link round trips, then tidies the URL
  API.me().then(r => { if (recovering && r.user) { user = r.user; signBtn.hidden = false; go('newpass', { replace: true }); } else { route(r.user); if (recovering) toast('That reset link did not work on this device. Ask for a new link here.'); } if (redirectMsg) toast(redirectMsg); }).catch(e => { go('welcome'); toast(redirectMsg || e.message); });
  // signed out in another tab (or the session expired) -> back to the start; signed in elsewhere -> pick up where they are
  API.onAuth((ev) => { if (ev === 'SIGNED_OUT' && user) { user = null; route(null); } });
})();
