/* ==========================================================================
   FutaVaultUI — the Bank vault screen (lobby → 3 puzzles on ONE shared countdown → win / busted / challenge failed).
   The server decides everything; this file only shows what the server tells it. Puzzle screens: vault-puzzles.js. Rules + economy: docs/VAULT.md

   FutaVaultUI.open({ api, onClose(), onWin(res), onCaught(res), onFail(res), toast(msg) }) → { close() }
     api = { status(), start(), answer(attemptId, answer), giveup(attemptId) }   (engine.js supplies the real RPCs or the local demo)
   Under-18 players (status.teen) see the "Vault Challenge": same puzzles, but no arrest — only a cooldown.
   Plain DOM, works at 390 px wide. Every server string goes in with textContent.
   ========================================================================== */
(function (g) {
  'use strict';
  const $ = (tag, cls, txt) => { const e = document.createElement(tag); if (cls) e.className = cls; if (txt != null) e.textContent = txt; return e; };
  const sleep = (ms) => new Promise(r => setTimeout(r, ms));
  const money = (n) => '₦' + Number(n).toLocaleString('en-NG');
  const clock = (s) => { s = Math.max(0, Math.ceil(s)); const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), x = s % 60; return (h ? h + ':' + String(m).padStart(2, '0') : m) + ':' + String(x).padStart(2, '0'); };
  const FRIENDLY = { wrong_place: 'You have to be inside the Bank for that.', in_jail: 'You are in jail.', vault_cooldown: 'The bank is watching you. Come back later.', vault_empty: 'The vault is empty right now.',
    vault_busy: 'Someone else is at the vault right now.', bad_attempt: 'That attempt is already over.', bad_answer: 'That answer is not valid.', show_first: 'Watch the lights first.', auth_required: 'Please sign in again.' };
  const friendly = (e) => { const m = (e && e.message) || String(e), k = Object.keys(FRIENDLY).find(x => m.indexOf(x) >= 0); return k ? FRIENDLY[k] : 'Something went wrong. Try again.'; };

  /* ---------- sound: tiny soft tones (optional, never required) ---------- */
  let AC = null;
  function tone(freq, ms, vol) { try { AC = AC || new (g.AudioContext || g.webkitAudioContext)(); if (AC.state === 'suspended') AC.resume(); const o = AC.createOscillator(), gn = AC.createGain(); o.type = 'sine'; o.frequency.value = freq; gn.gain.value = vol == null ? .05 : vol; o.connect(gn); gn.connect(AC.destination); const t = AC.currentTime; gn.gain.setValueAtTime(vol == null ? .05 : vol, t); gn.gain.exponentialRampToValueAtTime(.0001, t + ms / 1000); o.start(t); o.stop(t + ms / 1000 + .02); } catch (e) { /* no audio */ } }
  const sfx = (k) => { if (k === 'good') { tone(660, 110); setTimeout(() => tone(880, 140), 90); } else if (k === 'bad') { tone(150, 240, .07); } else if (k === 'win') [523, 659, 784, 1046].forEach((f, i) => setTimeout(() => tone(f, 200), i * 120)); else if (k === 'siren') { tone(620, 260, .06); setTimeout(() => tone(470, 260, .06), 280); setTimeout(() => tone(620, 260, .06), 560); } };

  /* ---------- styles (once) ---------- */
  function css() {
    if (document.getElementById('fvCss')) return; const s = document.createElement('style'); s.id = 'fvCss';
    s.textContent = `
.fv-root{position:fixed;inset:0;z-index:90;display:flex;align-items:center;justify-content:center;padding:env(safe-area-inset-top) env(safe-area-inset-right) env(safe-area-inset-bottom) env(safe-area-inset-left);background:radial-gradient(ellipse at 50% 30%,rgba(16,40,34,.92),rgba(4,6,12,.96));backdrop-filter:blur(5px);color:#e8edf2;font:15px/1.4 system-ui,'Segoe UI',sans-serif;-webkit-user-select:none;user-select:none;animation:fvIn .25s ease-out}
.fv-root *{box-sizing:border-box}
@keyframes fvIn{from{opacity:0}to{opacity:1}}
.fv-card{position:relative;width:min(540px,100%);max-height:100%;overflow:auto;background:linear-gradient(180deg,#18212b,#10161d);border:1px solid #2c3b4a;border-radius:20px;box-shadow:0 20px 70px #000a,inset 0 1px 0 #ffffff12;display:flex;flex-direction:column}
@media(max-width:560px){.fv-root{align-items:stretch}.fv-card{border-radius:0;border-left:0;border-right:0}}
.fv-head{display:flex;align-items:center;gap:10px;padding:14px 16px;background:linear-gradient(90deg,#0f6b4f,#0b4f3b);border-bottom:3px solid #d9b24a;border-radius:20px 20px 0 0}
@media(max-width:560px){.fv-head{border-radius:0}}
.fv-head h2{margin:0;font-size:17px;letter-spacing:.04em;flex:1;color:#fff}.fv-head small{display:block;font-weight:400;opacity:.8;letter-spacing:0;font-size:12px}
.fv-x{background:#ffffff1f;border:0;color:#fff;width:34px;height:34px;border-radius:50%;font-size:20px;cursor:pointer}
.fv-body{padding:16px;display:flex;flex-direction:column;gap:12px}
.fv-pill{align-self:flex-start;padding:7px 14px;border-radius:999px;font-weight:700;letter-spacing:.06em;font-size:13px}
.fv-pill.full{background:#0e3a27;color:#4ade80;border:1px solid #1f7a4d}.fv-pill.robbery{background:#3a1010;color:#ff6b6b;border:1px solid #8a2323;animation:fvPulse 1s infinite}.fv-pill.empty{background:#3a2a08;color:#fbbf24;border:1px solid #8a6516}.fv-pill.wait{background:#222c38;color:#9fb0c3;border:1px solid #3a4a5c}
@keyframes fvPulse{50%{opacity:.55}}
.fv-rules{margin:0;padding:0;list-style:none;display:flex;flex-direction:column;gap:8px}.fv-rules li{display:flex;gap:10px;align-items:flex-start;background:#ffffff08;border:1px solid #ffffff10;border-radius:12px;padding:10px 12px}.fv-rules b{flex:none;width:24px;text-align:center}
.fv-btn{border:0;border-radius:14px;padding:14px 16px;font:700 16px system-ui;cursor:pointer;background:#243447;color:#fff;transition:transform .08s,filter .15s}.fv-btn:active{transform:scale(.97)}.fv-btn:disabled{opacity:.45;cursor:not-allowed}
.fv-btn.primary{background:linear-gradient(180deg,#e0b948,#c79a2c);color:#241a00;box-shadow:0 6px 18px #c79a2c44}.fv-btn.danger{background:#5a1c1c;color:#ffd5d5}.fv-btn.ghost{background:transparent;border:1px solid #3a4a5c;color:#b8c6d4;font-weight:600}
.fv-msg{min-height:20px;color:#ffb4b4;font-size:14px;text-align:center}
.fv-timer{display:flex;align-items:center;gap:12px;padding:12px 16px 0}.fv-time{font:700 26px ui-monospace,Menlo,Consolas,monospace;min-width:84px;color:#fff;font-variant-numeric:tabular-nums}.fv-time.low{color:#ff6b6b;animation:fvPulse .6s infinite}
.fv-bar{flex:1;height:10px;border-radius:6px;background:#ffffff1c;overflow:hidden}.fv-bar>i{display:block;height:100%;width:100%;background:linear-gradient(90deg,#22c55e,#facc15);transition:width .25s linear,background .4s}.fv-bar>i.mid{background:linear-gradient(90deg,#facc15,#f59e0b)}.fv-bar>i.low{background:linear-gradient(90deg,#ef4444,#f97316)}
.fv-steps{display:flex;align-items:center;gap:8px;padding:10px 16px 0;font-size:13px;color:#9fb0c3}.fv-steps i{width:26px;height:26px;border-radius:50%;display:grid;place-items:center;font-style:normal;font-weight:700;background:#222c38;border:2px solid #3a4a5c}.fv-steps i.done{background:#14532d;border-color:#22c55e;color:#bbf7d0}.fv-steps i.now{border-color:#d9b24a;color:#ffe08a}.fv-steps span{flex:1;text-align:right;font-weight:600;color:#cfd9e3}
.fv-puz{padding:8px 16px 4px;position:relative}.fv-locked .fv-pad{pointer-events:none}
.fv-intro{margin:6px 0 10px;color:#b8c6d4}.fv-meta{display:flex;justify-content:space-between;align-items:center;margin:4px 0 10px;color:#cfd9e3;font-weight:600;font-size:14px}
.fv-strikes span{font-size:20px;margin-left:2px}.fv-strikes .on{color:#ef4444}.fv-strikes .off{color:#3a4350}
.fv-foot{display:flex;gap:10px;padding:10px 16px 16px;align-items:center}.fv-foot .fv-btn{padding:10px 14px;font-size:14px}
.fv-toastline{position:absolute;left:16px;right:16px;bottom:6px;text-align:center;color:#fbbf24;font-size:13px;pointer-events:none}
/* lock */.fv-lock{display:flex;flex-direction:column;gap:10px}.fv-dial{background:#0d141b;border:1px solid #2c3b4a;border-radius:14px;padding:10px 12px;display:grid;grid-template-columns:92px 1fr;gap:4px 12px;align-items:center}.fv-dial-h{grid-column:1/3;font-weight:700;color:#d9b24a;font-size:13px;letter-spacing:.05em}
.fv-dial.ok{border-color:#22c55e;background:#0c2418}.fv-dial.ok .fv-dial-h{color:#4ade80}.fv-dial.bad{border-color:#7f2a2a}
.fv-code{width:92px;font:700 26px ui-monospace,Menlo,monospace;text-align:center;letter-spacing:.15em;background:#05090d;color:#7ef0b5;border:2px solid #2f6f57;border-radius:10px;padding:8px 0;-webkit-user-select:text;user-select:text}.fv-code:disabled{opacity:.8}.fv-code:focus{outline:0;border-color:#d9b24a}
.fv-clues{margin:0;padding-left:18px;color:#cfd9e3;font-size:13.5px}.fv-clues li{margin:2px 0}.fv-clues.big{background:#ffffff08;border:1px solid #ffffff10;border-radius:12px;padding:10px 12px 10px 28px;font-size:14.5px;margin-bottom:12px}
/* cracker */.fv-slots{display:flex;gap:10px;justify-content:center;margin:6px 0 10px}.fv-slot{width:54px;height:64px;border-radius:12px;background:#05090d;border:2px solid #2f6f57;display:grid;place-items:center;font:700 32px ui-monospace,monospace;color:#7ef0b5}.fv-slot.on{border-color:#d9b24a;box-shadow:0 0 0 3px #d9b24a33}
.fv-hist{max-height:150px;overflow:auto;background:#0d141b;border:1px solid #2c3b4a;border-radius:12px;padding:6px 10px;margin-bottom:10px}.fv-hrow{display:flex;align-items:center;gap:10px;padding:4px 0;border-bottom:1px solid #ffffff0d}.fv-hrow:last-child{border:0}.fv-hguess{font:700 18px ui-monospace,monospace;letter-spacing:.18em;color:#e8edf2;width:76px}.fv-htxt{color:#9fb0c3;font-size:12.5px}.fv-hempty{color:#6b7b8c;font-size:13px;padding:8px 0;text-align:center}
.fv-pegs{display:flex;gap:4px}.peg{width:12px;height:12px;border-radius:50%;display:block}.peg.g{background:#22c55e}.peg.y{background:#facc15}.peg.n{background:#2a3644}
.fv-keypad{display:grid;grid-template-columns:repeat(3,1fr);gap:8px}.fv-key{border:0;border-radius:12px;background:#243447;color:#fff;font:700 22px system-ui;padding:12px 0;cursor:pointer}.fv-key:active{background:#34506b}.fv-key.go{background:#c79a2c;color:#241a00}
/* wires */.fv-paper{background:#f3ecd6;color:#2b2410;border-radius:10px;padding:10px 14px 6px;margin-bottom:10px;font:13.5px/1.35 ui-monospace,Menlo,Consolas,monospace;box-shadow:0 4px 12px #0006}.fv-paper-h{font-weight:700;letter-spacing:.14em;font-size:11px;color:#8a6d1f;margin-bottom:4px}.fv-paper p{margin:0 0 6px}
.fv-wirebox svg{width:100%;height:auto;display:block}.fv-wirebox path[data-w]:hover{stroke:#ffffff14}
/* pattern */.fv-series{display:flex;gap:8px;flex-wrap:wrap;justify-content:center;margin:6px 0 12px}.fv-tile{width:54px;height:54px;border-radius:12px;background:#0d141b;border:1px solid #2c3b4a;display:grid;place-items:center;font:700 20px ui-monospace,monospace;color:#e8edf2}.fv-tile svg{width:44px;height:44px}.fv-tile.q{border:2px dashed #d9b24a;color:#d9b24a;font-size:26px}.fv-tile.big{width:100%;height:84px}.fv-tile.big svg{width:66px;height:66px}.fv-tile.big{font-size:28px}
.fv-opts{display:grid;grid-template-columns:1fr 1fr;gap:10px}.fv-opt{padding:0;border:2px solid #2c3b4a;background:#141d27;border-radius:14px;cursor:pointer;color:inherit}.fv-opt:active{border-color:#d9b24a}.fv-opt .fv-tile{background:transparent;border:0}
.fv-note{text-align:center;margin-top:10px;font-weight:700}.fv-note.good{color:#4ade80}.fv-note.bad{color:#ff7b7b}
/* lights */.fv-pads{display:grid;grid-template-columns:1fr 1fr;gap:12px;max-width:340px;margin:8px auto}.fv-pad{aspect-ratio:1.25;border:0;border-radius:18px;background:var(--c);filter:brightness(.42) saturate(.9);cursor:pointer;box-shadow:inset 0 -6px 0 #0004;transition:filter .08s,transform .08s}.fv-pad.lit{filter:brightness(1.35) saturate(1.2);transform:scale(1.04);box-shadow:0 0 34px var(--c),inset 0 -6px 0 #0003}
.fv-lstatus{text-align:center;min-height:22px;color:#fbbf24;font-weight:600;margin-top:4px}.fv-ldots{display:flex;gap:6px;justify-content:center;margin:8px 0 4px;flex-wrap:wrap}.fv-ldots i{width:11px;height:11px;border-radius:50%;background:#2a3644}.fv-ldots i.on{background:#4ade80}
/* match */.fv-items{display:grid;grid-template-columns:repeat(3,1fr);gap:10px}.fv-item{position:relative;border:2px solid #2c3b4a;background:#0d141b;border-radius:14px;padding:8px 6px 4px;cursor:pointer;color:#cfd9e3;display:flex;flex-direction:column;align-items:center;gap:2px}.fv-item:active{border-color:#d9b24a}.fv-art svg{width:100%;height:auto;display:block;max-height:96px}.fv-items.print .fv-art svg{width:64px}.fv-lab{font-weight:700;font-size:12px;color:#8fa0b3}
.fv-item.out{opacity:.35;filter:grayscale(1)}.fv-cross{position:absolute;inset:0;display:grid;place-items:center;font-size:44px;color:#ef4444;pointer-events:none}
/* effects */.shake{animation:fvShake .4s}@keyframes fvShake{20%{transform:translateX(-8px)}40%{transform:translateX(8px)}60%{transform:translateX(-5px)}80%{transform:translateX(5px)}}.flash-bad{animation:fvFlash .5s}@keyframes fvFlash{0%{box-shadow:inset 0 0 0 999px #ef444430}100%{box-shadow:inset 0 0 0 999px #ef444400}}
.fv-over{position:absolute;inset:0;display:grid;place-items:center;background:#0b1118d9;border-radius:inherit;font-size:22px;font-weight:700;color:#4ade80;animation:fvIn .15s;z-index:3}
/* results */.fv-res{padding:28px 18px;text-align:center;display:flex;flex-direction:column;align-items:center;gap:12px}.fv-res h3{margin:0;font-size:26px;letter-spacing:.04em}.fv-big{font:800 40px ui-monospace,Menlo,monospace;color:#4ade80;text-shadow:0 0 24px #22c55e66}
.fv-res.win h3{color:#facc15}.fv-res.caught h3{color:#ff6b6b}.fv-res.fail h3{color:#fbbf24}.fv-res p{margin:0;color:#b8c6d4;max-width:380px}
.fv-siren{position:absolute;inset:0;pointer-events:none;background:linear-gradient(90deg,#ef444455,#3b82f655);animation:fvSiren .5s steps(2) infinite;z-index:5;border-radius:inherit}@keyframes fvSiren{50%{transform:scaleX(-1)}}
.fv-coin{position:absolute;top:-20px;font-size:22px;animation:fvFall linear forwards;pointer-events:none;z-index:6}@keyframes fvFall{to{transform:translateY(105vh) rotate(540deg);opacity:.8}}
.fv-lobbywait{color:#9fb0c3;text-align:center;padding:18px}`;
    document.head.appendChild(s);
  }

  /* ======================================================================= */
  function open(o) {
    css(); const api = o.api, root = $('div', 'fv-root'), card = $('div', 'fv-card'); root.append(card); root.setAttribute('role', 'dialog'); root.setAttribute('aria-modal', 'true'); document.body.appendChild(root);
    const S = { teen: false, att: null, step: 0, count: 3, total: 120, deadline: 0, busy: false, puz: null, kind: null, maxStrikes: 2, tm: 0, poll: 0, done: false, expiring: false, info: {} };
    const mk = (kind, step) => { const key = 'futa.vault.mem.' + S.att + '.' + step; let m = {}; try { m = JSON.parse(sessionStorage.getItem(key)) || {}; } catch (e) { m = {}; } Object.defineProperty(m, 'save', { enumerable: false, value() { try { sessionStorage.setItem(key, JSON.stringify(m)); } catch (e) { /* private mode */ } } }); return m; };
    const title = () => S.teen ? 'Vault Challenge' : 'Bank Vault';
    function stopTimers() { clearInterval(S.tm); clearInterval(S.poll); S.tm = S.poll = 0; }
    function end() { if (S.done) return; S.done = true; stopTimers(); if (S.puz) { try { S.puz.destroy(); } catch (e) { /* ignore */ } } root.remove(); document.removeEventListener('keydown', esc); o.onClose && o.onClose(); }
    const esc = (e) => { if (e.key === 'Escape' && !S.att) end(); }; document.addEventListener('keydown', esc);
    const head = (closable) => { const h = $('div', 'fv-head'); const t = $('h2'); t.append(document.createTextNode((S.teen ? '🧩 ' : '🏦 ') + title())); t.append($('small', '', S.teen ? 'Same puzzles. No arrest — just a cooldown.' : 'Heritage Bank · Akure')); h.append(t); if (closable) { const x = $('button', 'fv-x', '✕'); x.setAttribute('aria-label', 'Close'); x.onclick = end; h.append(x); } return h; };
    const show = (...els) => { card.textContent = ''; card.append(...els); };

    /* ---------------- lobby ---------------- */
    async function lobby(msg) {
      stopTimers(); S.att = null; show(head(true), $('div', 'fv-lobbywait', 'Checking the vault…'));
      let st; try { st = await api.status(); } catch (e) { const eb = $('div', 'fv-body'); eb.append($('div', 'fv-msg', friendly(e)), btn('Leave', end, 'ghost')); show(head(true), eb); return; }
      S.teen = !!st.teen; S.info = st; if (st.totalSecs) S.total = st.totalSecs;
      const body = $('div', 'fv-body'), pill = $('div', 'fv-pill'), go = btn(S.teen ? 'Start the challenge' : 'Break in', start, 'primary'), line = $('div', 'fv-msg', msg || '');
      const robber = S.teen ? 'Someone is attempting the vault' : 'ROBBERY IN PROGRESS';
      const upd = () => {
        const cd = Math.max(0, st.cooldownSecs - Math.floor((Date.now() - t0) / 1000)), rf = Math.max(0, st.refillSecs - Math.floor((Date.now() - t0) / 1000));
        if (st.vault === 'robbery' && st.mine) { pill.className = 'fv-pill robbery'; pill.textContent = 'YOUR ATTEMPT IS IN PROGRESS'; go.textContent = 'Resume'; go.disabled = false; }
        else if (st.vault === 'robbery') { pill.className = 'fv-pill robbery'; pill.textContent = robber; go.disabled = true; }
        else if (st.vault === 'empty') { pill.className = 'fv-pill empty'; pill.textContent = 'EMPTY · REFILLS IN ' + clock(rf); go.disabled = true; if (rf <= 0) { lobby(); } }
        else if (cd > 0) { pill.className = 'fv-pill wait'; pill.textContent = 'VAULT FULL'; go.disabled = true; line.textContent = (S.teen ? 'Come back to the challenge in ' : 'The bank is watching you. Come back in ') + clock(cd) + '.'; }
        else { pill.className = 'fv-pill full'; pill.textContent = 'VAULT FULL'; go.disabled = false; }
      };
      const t0 = Date.now(); upd(); S.poll = setInterval(upd, 1000);
      const secs = st.totalSecs || S.total, jl = st.jailLen || 180, cl = st.teenCooldownLen || 600;
      const rules = $('ul', 'fv-rules');
      [['🧠', '3 random puzzles, picked fresh every time — no routine to memorise.'], ['⏱️', 'One shared countdown of ' + clock(secs) + ' for all three.'],
       ['❤️', 'Wrong moves cost strikes. Run out of strikes or time and ' + (S.teen ? 'you must wait ' + clock(cl) + ' before trying again.' : 'you are ARRESTED — ' + clock(jl) + ' in jail.')],
       ['💰', S.teen ? 'Solve all three and you take everything in the vault. Nobody knows how much is in there.' : 'Solve all three and you take the WHOLE vault into your pocket. Nobody knows how much is in there.'],
       ['🔒', 'The vault locks while someone is at it, and refills 20 minutes after a successful ' + (S.teen ? 'challenge.' : 'robbery.')]].forEach(([i, t]) => rules.append((() => { const li = $('li'); li.append($('b', '', i), $('span', '', t)); return li; })()));
      body.append(pill, rules, line, go, btn('Not now', end, 'ghost')); show(head(true), body);
    }
    function btn(label, fn, cls) { const b = $('button', 'fv-btn' + (cls ? ' ' + cls : ''), label); b.onclick = fn; return b; }

    /* ---------------- start / resume ---------------- */
    async function start() {
      if (S.busy) return; S.busy = true;
      try { const r = await api.start(); S.busy = false; begin(r); } catch (e) { S.busy = false; stopTimers(); lobby(friendly(e)); }
    }

    /* ---------------- playing ---------------- */
    function syncTime(secsLeft, total) { if (total) S.total = total; if (typeof secsLeft === 'number') S.deadline = performance.now() + secsLeft * 1000; }
    function begin(r) {
      stopTimers(); S.att = r.attempt; S.step = r.step; S.count = r.count || 3; syncTime(r.secsLeft, r.totalSecs); S.teen = r.teen != null ? !!r.teen : S.teen; S.expiring = false;
      const timer = $('div', 'fv-timer'), tm = $('div', 'fv-time', clock(r.secsLeft)), bar = $('div', 'fv-bar'), fill = $('i'); bar.append(fill); timer.append(tm, bar);
      const steps = $('div', 'fv-steps'), stepName = $('span', ''); const dots = []; for (let i = 0; i < S.count; i++) { const d = $('i', '', String(i + 1)); dots.push(d); steps.append(d); } steps.append(stepName);
      const puz = $('div', 'fv-puz'), foot = $('div', 'fv-foot'), hint = $('div', 'fv-toastline'); puz.append(hint);
      const giveBtn = btn('Give up', () => { if (confirm(S.teen ? 'Give up the challenge? You will have to wait before trying again.' : 'Giving up counts as being caught. Go to jail?')) giveUp(); }, 'ghost'); foot.append(giveBtn);
      show(head(false), timer, steps, puz, foot);
      const tick = () => {
        const left = Math.max(0, (S.deadline - performance.now()) / 1000); tm.textContent = clock(left); tm.classList.toggle('low', left <= 10); const k = left / S.total; fill.style.width = Math.max(0, Math.min(100, k * 100)) + '%'; fill.className = k < .17 ? 'low' : k < .4 ? 'mid' : '';
        if (left <= 0 && !S.expiring && !S.done) expire();
      }; S.tm = setInterval(tick, 200); tick();
      let hintT = 0; const sayHint = (t) => { hint.textContent = t; clearTimeout(hintT); hintT = setTimeout(() => { hint.textContent = ''; }, 2600); };
      function mount(view, step) {
        if (S.puz) { try { S.puz.destroy(); } catch (e) { /* ignore */ } S.puz = null; }
        puz.querySelectorAll('.fv-over').forEach(n => n.remove()); const host = $('div', 'fv-pzh'); [...puz.children].forEach(c => { if (c !== hint) c.remove(); }); puz.insertBefore(host, hint);
        S.kind = view.kind; S.step = step; S.maxStrikes = Math.max(2, view.strikesLeft || 0);
        dots.forEach((d, i) => { d.className = i < step ? 'done' : i === step ? 'now' : ''; d.textContent = i < step ? '✓' : String(i + 1); }); stepName.textContent = view.title;
        const mem = mk(view.kind, step);
        const ctx = { mem, tone, sfx, hint: sayHint, busy: () => S.busy || S.done, maxStrikes: (n) => { S.maxStrikes = Math.max(S.maxStrikes, n); return S.maxStrikes; }, answer };
        S.puz = g.FutaVaultPuzzles.make(view.kind, host, view, ctx); S.host = host;
      }
      async function answer(ans) {
        if (S.busy || S.done) return null; S.busy = true; let res;
        try { res = await api.answer(S.att, ans); } catch (e) { S.busy = false; const m = friendly(e); if (/over/.test(m) || (e && /bad_attempt/.test(e.message || ''))) { return settle(); } sayHint(m); return null; }
        S.busy = false; syncTime(res.secsLeft, res.totalSecs); handle(res); return res;
      }
      async function handle(res) {
        if (res.status === 'continue') { if (S.puz) { S.host.classList.remove('flash-bad'); S.puz.update(res.puzzle, res.feedback || {}); } }
        else if (res.status === 'solved') {
          sfx('good'); S.busy = true; const ov = $('div', 'fv-over', '✓ Puzzle ' + (S.step + 1) + ' cleared'); puz.append(ov); await sleep(900); S.busy = false; if (S.done) return; mount(res.puzzle, res.step);
        } else if (res.status === 'win') win(res);
        else if (res.status === 'caught') caught(res);
        else if (res.status === 'failed') failed(res);
        else settle();
      }
      async function giveUp() { if (S.busy) return; S.busy = true; try { handle(await api.giveup(S.att)); } catch (e) { settle(); } S.busy = false; }
      async function expire() { S.expiring = true; await sleep(250); if (S.done) return; S.busy = true; try { const r = await api.giveup(S.att); S.busy = false; handle(r); } catch (e) { S.busy = false; settle(); } }
      async function settle() { stopTimers(); try { const st = await api.status(); if (st.jailSecs > 0) return caught({ jailSecs: st.jailSecs }); if (st.cooldownSecs > 0 && S.teen) return failed({ cooldownSecs: st.cooldownSecs }); } catch (e) { /* ignore */ } lobby('That attempt is over.'); }
      mount(r.puzzle, r.step);
    }

    /* ---------------- results ---------------- */
    function coins(n) { for (let i = 0; i < n; i++) { const c = $('span', 'fv-coin', ['💰', '🪙', '💵'][i % 3]); c.style.left = Math.random() * 100 + '%'; c.style.animationDuration = 1.6 + Math.random() * 1.6 + 's'; c.style.animationDelay = Math.random() * .8 + 's'; root.append(c); setTimeout(() => c.remove(), 4200); } }
    function win(res) {
      stopTimers(); S.att = null; sfx('win'); coins(36); const big = $('div', 'fv-big', money(0)), b = $('div', 'fv-res win');
      b.append($('div', '', '🏆'), $('h3', '', S.teen ? 'CHALLENGE COMPLETE!' : 'THE VAULT IS YOURS!'), $('p', '', 'You cleared all three puzzles and took everything inside.'), big,
        $('p', '', 'It is in your pocket now. Walk to an ATM and deposit it before anyone gets ideas.'), $('p', '', 'The vault refills in 20 minutes. You are on a cooldown' + (res.cooldownSecs ? ' for ' + clock(res.cooldownSecs) : '') + '.'), btn('Done', end, 'primary'));
      show(head(false), b); const t0 = performance.now(), amt = +res.payout || 0; (function up() { const k = Math.min(1, (performance.now() - t0) / 1900), e = 1 - Math.pow(1 - k, 3); big.textContent = money(Math.round(amt * e)); if (k < 1 && !S.done) requestAnimationFrame(up); })();
      o.onWin && o.onWin(res);
    }
    function caught(res) {
      stopTimers(); S.att = null; sfx('siren'); const b = $('div', 'fv-res caught'), sir = $('div', 'fv-siren');
      b.append($('div', '', '🚨'), $('h3', '', 'BUSTED!'), $('p', '', 'The alarm went off. Police are taking you to jail' + (res.jailSecs ? ' for ' + clock(res.jailSecs) : '') + '.'));
      show(head(false), b); card.append(sir); setTimeout(() => { if (S.done) return; o.onCaught ? o.onCaught(res) : end(); }, 2600);
    }
    function failed(res) {
      stopTimers(); S.att = null; sfx('bad'); const b = $('div', 'fv-res fail');
      b.append($('div', '', '⏳'), $('h3', '', 'CHALLENGE FAILED'), $('p', '', 'No arrest — you are just on a cooldown' + (res.cooldownSecs ? ': try again in ' + clock(res.cooldownSecs) : '') + '. New puzzles next time.'), btn('OK', end, 'primary'));
      show(head(false), b); o.onFail && o.onFail(res);
    }

    lobby();
    return { close: end };
  }
  g.FutaVaultUI = { open, money, clock };
})(typeof window !== 'undefined' ? window : globalThis);
