/* Phone app: Settings — account info, CHANGE USERNAME, CHANGE / FORGOT PASSWORD, privacy, phone options, edit character, and LOG OUT.
   Username rule (one change per N days) and its server check live in supabase/11_account.sql; passwords go through Supabase Auth (onboarding/api.js: changePassword, resetPassword).
   To add a setting: add a row in render() and (if it must be saved on the server) a new RPC in supabase/01_schema.sql + grant it. */
(function (g) {
  'use strict';
  const Ph = g.FutaPhone; if (!Ph) return;
  const CSS = '.st-sheet{text-align:left!important}.st-sheet h3,.st-sheet .st-lead{text-align:center}.st-sheet input{display:block;width:100%;box-sizing:border-box;margin:0 0 .6em;padding:.8em .9em;border:1px solid var(--line);border-radius:.8em;background:#fff;color:var(--ink);font:inherit;font-size:max(16px,1em)}' +
    '.st-sheet input:focus{outline:2px solid var(--gold);outline-offset:1px}.st-hint{min-height:1.4em;margin:-.1em .2em .7em;font-size:.88em;color:var(--mute)}.st-hint.ok{color:var(--ok)}.st-hint.bad{color:var(--bad)}' +
    '.st-sheet [hidden]{display:none!important}.st-sheet .st-link{display:block;margin:.8em auto .2em;color:var(--emerald2);text-decoration:underline;font-size:.9em}';
  Ph.registerApp({
    id: 'settings', name: 'Settings', icon: 'settings', color: ['#8a9390', '#2f3735'],
    mount(body, ctx) {
      const esc = ctx.esc, I = ctx.icons; let dead = false, OPT = null;
      /* "School & status" (set in onboarding, editable here). The lists come from onboarding/campus-options.json; the server (set_campus) re-checks every value. */
      const nameOf = (list, id) => ((list || []).find(x => String(x.id) === String(id)) || {}).name || '';
      function campusText(c) {
        if (!c || !OPT) return c ? 'Tap to change' : 'Tell us where you belong';
        const st = OPT.statuses.find(x => x.id === c.status), sc = OPT.schools.find(x => x.id === c.school), b = [st ? st.title : c.status];
        if (sc) b.push(sc.short); if (sc && c.dept) b.push(nameOf(sc.depts, c.dept)); if (c.level) b.push(nameOf(OPT.levels, c.level)); if (c.year) b.push(c.year); if (c.area) b.push(nameOf(OPT.areas, c.area)); if (c.exam) b.push(nameOf(OPT.exams, c.exam));
        return b.join(' · ');
      }
      fetch(Ph.SIGNUP_URL.replace(/signup\.html$/, 'campus-options.json')).then(r => r.json()).then(d => { OPT = d; render(); }).catch(() => { });
      function campusSheet() {
        if (!OPT) { Ph.toast('Still loading the school list. Try again in a moment.'); return; }
        const u = Ph.getUser() || {}, old = u.campus || {}; let status = OPT.statuses.find(x => x.id === old.status) || null, v = { school: old.school || '', dept: old.dept || '', extra: '' };
        if (status && status.extra && old[status.extra.type] != null) v.extra = String(old[status.extra.type]);
        const sh = ctx.el('div', 'ph-sheet'); sh.innerHTML = '<div style="text-align:left;max-height:88%;overflow:auto"><h3 style="text-align:center">School &amp; status</h3><p style="text-align:center">Shown as a small tag on your profile.</p><div data-f></div><button class="ph-btn" type="button" data-save disabled>Save</button><button class="ph-btn" type="button" data-n style="background:#fff;color:var(--emerald)">Cancel</button></div>';
        body.closest('.ph-screen').appendChild(sh); const close = () => sh.remove(); sh.onclick = (e) => { if (e.target === sh) close(); }; sh.querySelector('[data-n]').onclick = close;
        const box = sh.querySelector('[data-f]'), save = sh.querySelector('[data-save]');
        const sel = (id, label, items, cur, ph) => '<label style="display:block;margin:0 0 .7em"><span style="display:block;font-size:.8em;color:var(--mute);margin-bottom:.25em">' + esc(label) + '</span><select data-' + id + ' style="width:100%;min-height:2.9em;border-radius:.8em;border:1px solid var(--line);background:#fff;padding:0 .7em;font:inherit"><option value="">' + esc(ph) + '</option>' + items.map(i => '<option value="' + esc(i.id) + '"' + (String(i.id) === String(cur) ? ' selected' : '') + '>' + esc(i.name) + '</option>').join('') + '</select></label>';
        function draw() {
          let h = sel('st', 'I am a…', OPT.statuses.map(x => ({ id: x.id, name: x.title })), status && status.id, 'Choose one'); const st = status;
          if (st && st.school !== 'none') h += sel('sc', (st.schoolLabel || 'School') + (st.school === 'optional' ? ' (optional)' : ''), OPT.schools.map(x => ({ id: x.id, name: x.short + ' · ' + x.name })), v.school, 'Choose your school');
          const sc = st && OPT.schools.find(x => x.id === v.school); if (sc) h += sel('dp', 'Department (optional)', sc.depts, v.dept, 'Not sure / skip');
          const ex = st && st.extra; if (ex) { let items = ex.type === 'level' ? OPT.levels : ex.type === 'area' ? OPT.areas : ex.type === 'exam' ? OPT.exams : []; if (ex.type === 'year') { items = []; for (let y = ex.max || OPT.years.max; y >= (ex.min || OPT.years.min); y--) items.push({ id: y, name: String(y) }); } h += sel('ex', ex.label + (ex.required ? '' : ' (optional)'), items, v.extra, 'Choose…'); }
          box.innerHTML = h; save.disabled = !st || (st.school === 'required' && !v.school) || (!!ex && !!ex.required && !v.extra);
          const q = (k) => box.querySelector('[data-' + k + ']');
          q('st').onchange = (e) => { status = OPT.statuses.find(x => x.id === e.target.value) || null; v = { school: status && status.school === 'none' ? '' : v.school, dept: '', extra: '' }; draw(); };
          if (q('sc')) q('sc').onchange = (e) => { v.school = e.target.value; v.dept = ''; draw(); };
          if (q('dp')) q('dp').onchange = (e) => { v.dept = e.target.value; };
          if (q('ex')) q('ex').onchange = (e) => { v.extra = e.target.value; draw(); };
        }
        draw();
        save.onclick = () => { save.disabled = true; save.textContent = 'Saving…'; g.FutaApi.saveCampus(status.id, v.school, v.dept, v.extra, status.extra && status.extra.type).then(() => Ph.refreshUser()).then(() => { Ph.toast('Saved'); close(); }).catch(e => { Ph.toast(e.message); save.disabled = false; save.textContent = 'Save'; }); };
      }
      const chev = '<span class="ph-chev" style="width:1em;height:1em;display:inline-flex;stroke:currentColor;fill:none;stroke-width:2">' + I.chev + '</span>';
      const row = (ic, t, s, right, tag) => '<' + (tag || 'div') + ' class="ph-row"' + (tag === 'button' ? ' type="button"' : '') + '><span class="ri">' + I[ic] + '</span><span class="t"><b>' + esc(t) + '</b>' + (s ? '<small>' + esc(s) + '</small>' : '') + '</span>' + (right || '') + '</' + (tag || 'div') + '>';
      function render() {
        if (dead) return; const u = Ph.getUser(), api = Ph.api();
        let h = '<div class="ph-pad">';
        if (u) {
          h += '<div class="ph-profile"><div class="ph-av">' + esc((u.username || u.email || '?').charAt(0).toUpperCase()) + '</div><div><b>' + esc(u.username || 'New player') + '</b><small>' + esc(u.email || '') + '</small></div></div>';
          h += '<div class="ph-h">Account</div><div class="ph-list">' + row('user', 'Username', u.username || 'Not set yet', chev, 'button').replace('class="ph-row"', 'class="ph-row" data-act="name"') + row('wallet', 'Pocket money', u.wallet && u.wallet.pocket != null ? '₦' + Number(u.wallet.pocket).toLocaleString() : '—') + row('face', 'Change my look', 'Edit your character', chev, 'button').replace('class="ph-row"', 'class="ph-row" data-act="look"') + row('home', 'School & status', campusText(u.campus), chev, 'button').replace('class="ph-row"', 'class="ph-row" data-act="campus"') + '</div>';
          h += '<div class="ph-h">Security</div><div class="ph-list">' + row('shield', 'Password', 'Change it', chev, 'button').replace('class="ph-row"', 'class="ph-row" data-act="pw"') + row('shield', 'Forgot password?', 'Email me a reset link', chev, 'button').replace('class="ph-row"', 'class="ph-row" data-act="forgot"') + '</div>';
          h += '<div class="ph-h">Privacy &amp; safety</div><div class="ph-list"><button class="ph-row" type="button" data-act="waves" role="switch" aria-checked="' + (u.acceptWaves !== false) + '"><span class="ri">' + I.people + '</span><span class="t"><b>Accept waves</b><small>Let other players wave at you first</small></span><span class="ph-sw" aria-checked="' + (u.acceptWaves !== false) + '"></span></button>' + row('shield', 'Teen mode', u.isTeen ? 'On — extra protection for under 18s' : 'Off') + '</div>';
        } else {
          h += '<div class="ph-profile"><div class="ph-av">?</div><div><b>Not signed in</b><small>Sign in to save your progress</small></div></div><div style="margin-top:.9em"><button class="ph-btn gold" type="button" data-act="signin">Sign in or create account</button></div>';
        }
        h += (g.FutaCommunity ? g.FutaCommunity.settingsHtml() : '') + '<div class="ph-h">Phone</div><div class="ph-list"><button class="ph-row" type="button" data-act="auto" role="switch" aria-checked="' + (Ph.store.get('auto', true) !== false) + '"><span class="ri">' + I.phone + '</span><span class="t"><b>Show phone on start</b><small>Hide it any time with ⌄</small></span><span class="ph-sw" aria-checked="' + (Ph.store.get('auto', true) !== false) + '"></span></button>' + (g.FutaInstall && g.FutaInstall.state() !== 'installed' && g.FutaInstall.state() !== 'unavailable' ? '<button class="ph-row" type="button" data-act="install"><span class="ri">' + I.phone + '</span><span class="t"><b>Install FUTAlife app</b><small>Add to your home screen</small></span>' + chev + '</button>' : '') + row('info', 'About', 'FUTAlife · phone v1') + '</div>';
        if (u) h += '<div class="ph-h">Session</div><button class="ph-btn danger" type="button" data-act="logout">' + '<span style="width:1.2em;height:1.2em;display:inline-flex;stroke:currentColor;fill:none;stroke-width:2;stroke-linecap:round;stroke-linejoin:round">' + I.out + '</span>Log out</button>';
        h += '</div>'; body.innerHTML = h; wire();
      }
      function sheet() {
        const s = ctx.el('div', 'ph-sheet'); s.innerHTML = '<div><h3>Log out?</h3><p>You will need to sign in again to play.</p><button class="ph-btn danger" type="button" data-y>Log out</button><button class="ph-btn" type="button" data-n>Stay signed in</button></div>';
        body.closest('.ph-screen').appendChild(s); const close = () => s.remove();
        s.onclick = (e) => { if (e.target === s) close(); }; s.querySelector('[data-n]').onclick = close;
        s.querySelector('[data-y]').onclick = function () { this.disabled = true; this.textContent = 'Signing out…'; Ph.logout(); };
      }

      /* ---------- bottom sheets for the account settings ---------- */
      function openSheet(html) {   // the <style> travels with the sheet: render() clears the app body, so it cannot live there
        const sh = ctx.el('div', 'ph-sheet'); sh.innerHTML = '<div class="st-sheet"><style>' + CSS + '</style>' + html + '</div>'; body.closest('.ph-screen').appendChild(sh);
        const close = () => sh.remove(); sh.onclick = (e) => { if (e.target === sh) close(); }; sh.querySelectorAll('[data-n]').forEach(b => b.onclick = close);
        return { sh, close, q: (x) => sh.querySelector(x) };
      }
      const nice = (iso) => { try { return new Date(iso).toLocaleDateString(undefined, { day: 'numeric', month: 'long', year: 'numeric' }); } catch (e) { return iso; } };
      function nameError(e) {
        const m = (e && e.message) || '', c = /username_cooldown:(\d{4}-\d{2}-\d{2})/.exec(m);
        if (c) return 'You changed your name recently. You can change it again on ' + nice(c[1]) + '.';
        if (/same_name/.test(m)) return 'That is already your name.';
        if (/finish_sign_up/.test(m)) return 'Finish creating your character first.';
        return m || 'Could not change the name. Try again.';
      }
      function nameSheet() {
        const u = Ph.getUser(), api = Ph.api(); if (!u) return;
        const S = openSheet('<h3>Change username</h3><p class="st-lead">Checking…</p><div class="st-body" hidden><input id="nm" maxlength="20" autocomplete="off" autocapitalize="off" spellcheck="false" aria-label="New username"><div class="st-hint" id="hint"></div><button class="ph-btn gold" type="button" data-save disabled>Save username</button></div><button class="ph-btn" type="button" data-n>Cancel</button>');
        const lead = S.q('.st-lead'), box = S.q('.st-body'), inp = S.q('#nm'), hint = S.q('#hint'), save = S.q('[data-save]');
        const say = (t, k) => { hint.textContent = t; hint.className = 'st-hint' + (k ? ' ' + k : ''); };
        api.usernameStatus().then(r => {
          if (dead || !S.sh.isConnected) return;
          if (!r.canChange) { lead.textContent = 'You changed your name recently. You can change it again on ' + nice(r.nextChangeAt) + '.'; return; }
          lead.textContent = 'Other players see this name above your head and in chat. You can change it once every ' + r.cooldownDays + ' days, so choose well.';
          box.hidden = false; inp.value = u.username || ''; inp.focus(); inp.select();
        }).catch(e => { lead.textContent = nameError(e); });
        let t = 0, seq = 0;
        inp.oninput = () => {
          const v = inp.value.toLowerCase().replace(/[^a-z0-9_]/g, ''); if (v !== inp.value) inp.value = v; save.disabled = true; clearTimeout(t); const my = ++seq;
          if (v === u.username) return say('This is your current name.');
          if (v.length < 3) return say(v ? 'At least 3 characters.' : '');
          say('Checking…'); t = setTimeout(() => api.usernameCheck(v).then(r => { if (my !== seq) return; if (r.available) { say('✓ ' + v + ' is available', 'ok'); save.disabled = false; } else say(r.reason || 'That name is not available.', 'bad'); }).catch(e => { if (my === seq) say(e.message, 'bad'); }), 350);
        };
        save.onclick = () => {
          const v = inp.value.trim(); save.disabled = true; save.textContent = 'Saving…';
          api.changeUsername(v).then(() => { S.close(); Ph.toast('Username changed to ' + v + '.'); return Ph.refreshUser(); })
            .catch(e => { say(nameError(e), 'bad'); save.textContent = 'Save username'; });
        };
      }
      function passwordSheet() {
        const api = Ph.api(); if (!Ph.getUser()) return;
        const S = openSheet('<h3 id="ttl">Change password</h3><p class="st-lead" id="lead">One moment…</p><div class="st-body" hidden><input id="cur" type="password" autocomplete="current-password" placeholder="Current password" aria-label="Current password" hidden><input id="p1" type="password" autocomplete="new-password" placeholder="New password (8+ characters)" aria-label="New password"><input id="p2" type="password" autocomplete="new-password" placeholder="Type the new password again" aria-label="New password again"><div class="st-hint" id="hint"></div><button class="ph-btn gold" type="button" data-save>Save password</button><button class="st-link" type="button" data-forgot hidden>Forgot your current password?</button></div><button class="ph-btn" type="button" data-n>Cancel</button>');
        const box = S.q('.st-body'), cur = S.q('#cur'), p1 = S.q('#p1'), p2 = S.q('#p2'), hint = S.q('#hint'), save = S.q('[data-save]'), fg = S.q('[data-forgot]');
        const say = (t, k) => { hint.textContent = t; hint.className = 'st-hint' + (k ? ' ' + k : ''); }; let has = true;
        api.authInfo().then(r => {
          if (dead || !S.sh.isConnected) return; has = r.hasPassword; box.hidden = false; cur.hidden = !has; fg.hidden = !has;
          S.q('#ttl').textContent = has ? 'Change password' : 'Set a password';
          S.q('#lead').textContent = has ? 'Type your current password, then the new one.' : 'You signed in with Google. A password lets you also sign in with your email.';
          (has ? cur : p1).focus();
        }).catch(e => { S.q('#lead').textContent = e.message; });
        fg.onclick = () => { S.close(); forgotSheet(); };
        save.onclick = () => {
          say('');
          if (has && !cur.value) return say('Type your current password.', 'bad');
          if (p1.value.length < 8) return say('The new password needs at least 8 characters.', 'bad');
          if (p1.value !== p2.value) return say('The two new passwords are not the same.', 'bad');
          save.disabled = true; save.textContent = 'Saving…';
          api.changePassword(cur.value, p1.value).then(() => { S.close(); Ph.toast('Password changed.'); })
            .catch(e => { say(e.message, 'bad'); save.disabled = false; save.textContent = 'Save password'; });
        };
      }
      function forgotSheet() {
        const u = Ph.getUser(), api = Ph.api(); if (!u || !u.email) return;
        const at = u.email.indexOf('@'), mask = u.email.charAt(0) + '***' + u.email.slice(at);
        const S = openSheet('<h3>Reset password by email</h3><p class="st-lead">We will send a reset link to <b id="em"></b>. Open the link <b>on this device</b>, then choose a new password.</p><div class="st-hint" id="hint"></div><button class="ph-btn gold" type="button" data-send>Send reset link</button><button class="ph-btn" type="button" data-n>Close</button>');
        S.q('#em').textContent = mask; const hint = S.q('#hint'), send = S.q('[data-send]');
        send.onclick = () => {
          send.disabled = true; send.textContent = 'Sending…'; hint.textContent = ''; hint.className = 'st-hint';
          api.resetPassword(u.email).then(() => { hint.textContent = 'If that email has an account, a reset link is on its way. Check your inbox and spam.'; hint.className = 'st-hint ok'; send.textContent = 'Link sent'; setTimeout(() => { if (send.isConnected) { send.disabled = false; send.textContent = 'Send again'; } }, 60000); })
            .catch(e => { hint.textContent = e.message; hint.className = 'st-hint bad'; send.disabled = false; send.textContent = 'Send reset link'; });
        };
      }
      function wire() {
        body.querySelectorAll('[data-act]').forEach(b => b.onclick = () => {
          const a = b.dataset.act, u = Ph.getUser(), api = Ph.api();
          if (a === 'logout') return sheet();
          if (a === 'name' && u) return nameSheet();
          if (a === 'pw' && u) return passwordSheet();
          if (a === 'forgot' && u) return forgotSheet();
          if (a === 'signin') { location.href = (Ph.loginUrl ? Ph.loginUrl() : Ph.SIGNUP_URL); return; }
          if (a === 'campus') return campusSheet();
          if (a === 'look') { location.href = (Ph.loginUrl ? Ph.loginUrl() : Ph.SIGNUP_URL) + '?stay'; return; }
          if (a === 'install') { g.FutaInstall.prompt().then(r => { if (r === 'accepted') Ph.toast('FUTAlife installed'); else if (r === 'ios') Ph.toast('Tap Share, then Add to Home Screen'); render(); }); return; }
          if (a === 'auto') { const on = b.getAttribute('aria-checked') !== 'true'; b.setAttribute('aria-checked', on); b.querySelector('.ph-sw').setAttribute('aria-checked', on); Ph.store.set('auto', on); return; }
          if (a === 'waves' && u) {
            const on = b.getAttribute('aria-checked') !== 'true'; b.setAttribute('aria-checked', on); b.querySelector('.ph-sw').setAttribute('aria-checked', on);
            if (Ph.demo()) { u.acceptWaves = on; return; }
            api.rpc('set_privacy', { p_accept_waves: on }).then(() => { u.acceptWaves = on; }).catch(e => { b.setAttribute('aria-checked', !on); b.querySelector('.ph-sw').setAttribute('aria-checked', !on); Ph.toast(e.message); });
          }
        });
      }
      render(); const off = () => render(); Ph.on('user', off);
      return { destroy() { dead = true; } };
    }
  });
})(window);
