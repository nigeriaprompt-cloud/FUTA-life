/* ==========================================================================
   FutaVaultPuzzles — the six puzzle SCREENS of the vault (what the player sees and taps). Rules/answers live on the server (supabase/13_vault.sql);
   this file only draws the clues it is given and sends the player's answer through ctx.answer().  Used by vault-ui.js.

   FutaVaultPuzzles.make(kind, host, view, ctx) → { update(view, feedback), destroy() }
     kind : 'lock' | 'cracker' | 'wires' | 'pattern' | 'lights' | 'match'
     host : the element to draw into         view : what the server shows (never a secret)
     ctx  : { answer(ans)→Promise, busy()→bool, mem:{…, save()}, tone(freq, ms), sfx('good'|'bad'), hint(text) }
   All text from the server is put in with textContent. SVG strings are built only from numbers and fixed colour names.
   To change a look: edit the draw functions below. To change a RULE: edit 13_vault.sql AND vault-core.js together.
   ========================================================================== */
(function (g) {
  'use strict';
  const $ = (tag, cls, txt) => { const e = document.createElement(tag); if (cls) e.className = cls; if (txt != null) e.textContent = txt; return e; };
  const sleep = (ms) => new Promise(r => setTimeout(r, ms));
  const intro = (t) => $('p', 'fv-intro', t);
  const hearts = (n, max) => { const d = $('div', 'fv-strikes'); d.setAttribute('aria-label', n + ' mistakes left'); for (let i = 0; i < max; i++) d.append($('span', i < n ? 'on' : 'off', '♥')); return d; };
  let uid = 0;

  /* ------------------------------------------------------------ 1. code lock */
  function mkLock(host, v0, ctx) {
    const codes = ctx.mem.codes || (ctx.mem.codes = ['', '', '']);
    function build(view, fb) {
      host.textContent = ''; host.append(intro(view.intro));
      const meta = $('div', 'fv-meta'); meta.append($('span', '', 'Tries left: ' + view.triesLeft)); host.append(meta);
      const grid = $('div', 'fv-lock'), inputs = [];
      view.dials.forEach((d, i) => {
        const ok = view.right && view.right[i], bad = view.right && !view.right[i];
        const c = $('div', 'fv-dial' + (ok ? ' ok' : bad ? ' bad' : '')); c.append($('div', 'fv-dial-h', 'Code ' + d.label + (ok ? '  ✓ cracked' : '')));
        const inp = $('input', 'fv-code'); inp.type = 'text'; inp.inputMode = 'numeric'; inp.maxLength = 3; inp.autocomplete = 'off'; inp.placeholder = '•••'; inp.value = codes[i]; inp.disabled = !!ok; inp.setAttribute('aria-label', 'Code ' + d.label);
        inp.oninput = () => { inp.value = inp.value.replace(/\D/g, '').slice(0, 3); codes[i] = inp.value; ctx.mem.save(); if (inp.value.length === 3) { const nx = inputs.slice(i + 1).find(x => !x.disabled); if (nx) nx.focus(); } };
        inp.onkeydown = (e) => { if (e.key === 'Enter') submit(); };
        const ul = $('ul', 'fv-clues'); d.clues.forEach(t => ul.append($('li', '', t))); inputs.push(inp); c.append(inp, ul); grid.append(c);
      });
      const go = $('button', 'fv-btn primary', 'Try the codes'); go.onclick = submit; host.append(grid, go);
      if (fb && fb.right && !fb.right.every(Boolean)) { ctx.sfx('bad'); host.classList.remove('shake'); void host.offsetWidth; host.classList.add('shake'); }
    }
    function submit() { if (ctx.busy()) return; if (codes.some(c => c.length !== 3)) { ctx.hint('Every code has exactly 3 digits.'); return; } ctx.answer({ codes: codes.map(Number) }); }
    build(v0, null); return { update: build, destroy() { } };
  }

  /* ------------------------------------------------------------ 2. safe cracker */
  function mkCracker(host, v0, ctx) {
    let cur = '';
    function onKey(e) { if (/^[0-9]$/.test(e.key)) press(e.key); else if (e.key === 'Backspace') press('<'); else if (e.key === 'Enter') press('ok'); }
    function press(k) { if (ctx.busy()) return; if (k === '<') cur = cur.slice(0, -1); else if (k === 'ok') { if (cur.length !== 4) { ctx.hint('Enter 4 digits.'); return; } const gs = cur; cur = ''; ctx.answer({ guess: gs }); return; } else if (cur.length < 4) cur += k; drawSlots(); }
    let slots;
    function drawSlots() { if (!slots) return; [...slots.children].forEach((s, i) => { s.textContent = cur[i] || ''; s.classList.toggle('on', i === cur.length); }); }
    function build(view, fb) {
      host.textContent = ''; host.append(intro(view.intro + ' All four digits are different.'));
      const meta = $('div', 'fv-meta'); meta.append($('span', '', 'Guesses left: ' + view.left + ' / ' + view.max)); host.append(meta);
      slots = $('div', 'fv-slots'); for (let i = 0; i < 4; i++) slots.append($('div', 'fv-slot')); host.append(slots);
      const hist = $('div', 'fv-hist'); view.history.slice().reverse().forEach(h => {
        const r = $('div', 'fv-hrow'); r.append($('b', 'fv-hguess', h.guess)); const pegs = $('span', 'fv-pegs');
        for (let i = 0; i < h.exact; i++) pegs.append($('i', 'peg g')); for (let i = 0; i < h.misplaced; i++) pegs.append($('i', 'peg y')); for (let i = h.exact + h.misplaced; i < 4; i++) pegs.append($('i', 'peg n'));
        r.append(pegs, $('span', 'fv-htxt', h.exact + ' in place · ' + h.misplaced + ' elsewhere')); hist.append(r);
      });
      if (!view.history.length) hist.append($('div', 'fv-hempty', 'Your guesses will appear here.'));
      const pad = $('div', 'fv-keypad'); ['1', '2', '3', '4', '5', '6', '7', '8', '9', '<', '0', 'ok'].forEach(k => { const b = $('button', 'fv-key' + (k === 'ok' ? ' go' : ''), k === '<' ? '⌫' : k === 'ok' ? 'OK' : k); b.onclick = () => press(k); pad.append(b); });
      host.append(hist, pad); drawSlots();
      if (fb && typeof fb.exact === 'number') ctx.sfx(fb.exact >= 2 ? 'good' : 'bad');
    }
    document.addEventListener('keydown', onKey); build(v0, null);
    return { update: build, destroy() { document.removeEventListener('keydown', onKey); } };
  }

  /* ------------------------------------------------------------ 3. wire cutting */
  const WC = { red: '#ef4444', blue: '#3b82f6', yellow: '#facc15', green: '#22c55e', white: '#f1f5f9', black: '#1f2937' };
  function wiresSVG(wires, cut) {
    let s = '<svg viewBox="0 0 312 168" role="img" aria-label="Wire panel"><rect x="6" y="6" width="300" height="156" rx="14" fill="#10161f" stroke="#2c3a4d" stroke-width="2"/>' +
      '<rect x="18" y="14" width="276" height="16" rx="5" fill="#3a4658"/><rect x="18" y="138" width="276" height="16" rx="5" fill="#3a4658"/>';
    wires.forEach((c, i) => {
      const x = 36 + i * 48, col = WC[c] || '#999', idx = cut.indexOf(i), isCut = idx >= 0;
      s += '<circle cx="' + x + '" cy="22" r="4" fill="#9aa7b8"/><circle cx="' + x + '" cy="146" r="4" fill="#9aa7b8"/>';
      const under = c === 'black' ? '<path d="M' + x + ' 26 C' + (x + 16) + ' 62 ' + (x - 16) + ' 108 ' + x + ' 142" fill="none" stroke="#8793a3" stroke-width="12" stroke-linecap="round"/>' : '';
      if (!isCut) {
        s += under + '<path d="M' + x + ' 26 C' + (x + 16) + ' 62 ' + (x - 16) + ' 108 ' + x + ' 142" fill="none" stroke="' + col + '" stroke-width="9" stroke-linecap="round"/>' +
          '<path d="M' + (x - 2) + ' 30 C' + (x + 12) + ' 62 ' + (x - 20) + ' 108 ' + (x - 3) + ' 138" fill="none" stroke="#fff" stroke-opacity=".28" stroke-width="2" stroke-linecap="round"/>' +
          '<path data-w="' + i + '" d="M' + x + ' 26 C' + (x + 16) + ' 62 ' + (x - 16) + ' 108 ' + x + ' 142" fill="none" stroke="transparent" stroke-width="40" stroke-linecap="butt" style="cursor:pointer"/>';
      } else {
        s += (c === 'black' ? '<path d="M' + x + ' 26 C' + (x + 6) + ' 44 ' + (x + 6) + ' 56 ' + (x + 3) + ' 66" fill="none" stroke="#8793a3" stroke-width="12" stroke-linecap="round"/><path d="M' + (x - 3) + ' 100 C' + (x - 6) + ' 114 ' + (x - 4) + ' 128 ' + x + ' 142" fill="none" stroke="#8793a3" stroke-width="12" stroke-linecap="round"/>' : '') +
          '<path d="M' + x + ' 26 C' + (x + 6) + ' 44 ' + (x + 6) + ' 56 ' + (x + 3) + ' 66" fill="none" stroke="' + col + '" stroke-width="9" stroke-linecap="round"/>' +
          '<path d="M' + (x - 3) + ' 100 C' + (x - 6) + ' 114 ' + (x - 4) + ' 128 ' + x + ' 142" fill="none" stroke="' + col + '" stroke-width="9" stroke-linecap="round"/>' +
          '<circle cx="' + (x + 3) + '" cy="70" r="4" fill="#fbbf24"/><circle cx="' + (x - 3) + '" cy="96" r="4" fill="#fbbf24"/>' +
          '<circle cx="' + x + '" cy="83" r="11" fill="#0b1220" stroke="#fbbf24" stroke-width="2"/><text x="' + x + '" y="88" text-anchor="middle" font-size="14" font-weight="700" fill="#fbbf24" font-family="system-ui">' + (idx + 1) + '</text>';
      }
    });
    return s + '</svg>';
  }
  function mkWires(host, v0, ctx) {
    function build(view, fb) {
      host.textContent = ''; host.append(intro(view.intro));
      const card = $('div', 'fv-paper'); card.append($('div', 'fv-paper-h', 'RULE CARD')); view.card.forEach(l => card.append($('p', '', l))); host.append(card);
      const meta = $('div', 'fv-meta'); meta.append(hearts(view.strikesLeft, ctx.maxStrikes ? ctx.maxStrikes(view.strikesLeft) : 2), $('span', '', 'Wires are counted left → right')); host.append(meta);
      const wrap = $('div', 'fv-wirebox'); wrap.innerHTML = wiresSVG(view.wires, view.cut); host.append(wrap);
      wrap.querySelectorAll('[data-w]').forEach(p => { p.onclick = () => { if (ctx.busy()) return; ctx.answer({ cut: +p.getAttribute('data-w') }); }; });
      if (fb && fb.ok === false) { ctx.sfx('bad'); wrap.classList.add('shake'); host.classList.add('flash-bad'); setTimeout(() => host.classList.remove('flash-bad'), 500); }
      if (fb && fb.ok === true) ctx.sfx('good');
    }
    build(v0, null); return { update: build, destroy() { } };
  }

  /* ------------------------------------------------------------ 4. pattern */
  const SC = { red: '#ef4444', blue: '#3b82f6', green: '#22c55e' };
  function tokenEl(t, big) {
    const d = $('div', 'fv-tile' + (big ? ' big' : ''));
    const m = /^(tri|circle|square|star|diamond):(red|blue|green)$/.exec(t), a = /^arrow:(\d{1,3})$/.exec(t), p = /^dots:(\d{1,2})$/.exec(t);
    if (m) {
      const f = SC[m[2]], sh = { tri: '<polygon points="30,8 54,50 6,50"/>', circle: '<circle cx="30" cy="30" r="22"/>', square: '<rect x="9" y="9" width="42" height="42" rx="4"/>',
        star: '<polygon points="30,5 37,22 55,23 41,35 46,53 30,43 14,53 19,35 5,23 23,22"/>', diamond: '<polygon points="30,5 55,30 30,55 5,30"/>' }[m[1]];
      d.innerHTML = '<svg viewBox="0 0 60 60"><g fill="' + f + '" stroke="#0b1220" stroke-width="2">' + sh + '</g></svg>';
    } else if (a) d.innerHTML = '<svg viewBox="0 0 60 60"><g transform="rotate(' + (+a[1]) + ' 30 30)" fill="#e2e8f0" stroke="#0b1220" stroke-width="2"><path d="M30 6 L48 28 H37 V54 H23 V28 H12 Z"/></g></svg>';
    else if (p) { const n = +p[1]; let s = '<svg viewBox="0 0 60 60"><g fill="#fbbf24">'; for (let i = 0; i < n; i++) { const r = Math.floor(i / 6), c = i % 6, inRow = Math.min(6, n - r * 6); s += '<circle cx="' + (30 + (c - (inRow - 1) / 2) * 9) + '" cy="' + (12 + r * 11) + '" r="3.8"/>'; } d.innerHTML = s + '</g></svg>'; }
    else d.textContent = t;
    return d;
  }
  function mkPattern(host, v0, ctx) {
    function build(view, fb) {
      host.textContent = ''; host.append(intro(view.intro));
      const meta = $('div', 'fv-meta'); meta.append($('span', '', 'Round ' + view.round + ' / ' + view.rounds), hearts(view.strikesLeft, ctx.maxStrikes ? ctx.maxStrikes(view.strikesLeft) : 2)); host.append(meta);
      const row = $('div', 'fv-series'); view.series.forEach(t => row.append(tokenEl(t, false))); const q = $('div', 'fv-tile q', '?'); row.append(q); host.append(row);
      const opts = $('div', 'fv-opts'); view.options.forEach((t, i) => { const b = $('button', 'fv-opt'); b.setAttribute('aria-label', 'Option ' + (i + 1)); b.append(tokenEl(t, true)); b.onclick = () => { if (ctx.busy()) return; ctx.answer({ pick: i }); }; opts.append(b); }); host.append(opts);
      if (fb && fb.correct === true) { ctx.sfx('good'); host.append($('div', 'fv-note good', '✓ Correct')); }
      if (fb && fb.correct === false) { ctx.sfx('bad'); host.classList.remove('shake'); void host.offsetWidth; host.classList.add('shake'); host.append($('div', 'fv-note bad', '✗ Wrong — here is a new pattern')); }
    }
    build(v0, null); return { update: build, destroy() { } };
  }

  /* ------------------------------------------------------------ 5. light memory */
  function mkLights(host, v0, ctx) {
    const mem = ctx.mem; mem.seq = mem.seq || []; mem.pos = mem.pos || 0;
    const COL = { red: '#ef4444', green: '#22c55e', blue: '#3b82f6', yellow: '#facc15' }, FREQ = { red: 262, green: 330, blue: 392, yellow: 523 };
    let alive = true, mode = 'wait', pads = {}, status, dots, strikesEl, roundEl, view = v0;
    function frame() {
      host.textContent = ''; host.append(intro(v0.intro));
      const meta = $('div', 'fv-meta'); roundEl = $('span', ''); strikesEl = $('span', ''); meta.append(roundEl, strikesEl); host.append(meta);
      const grid = $('div', 'fv-pads'); v0.colours.forEach(c => { const b = $('button', 'fv-pad'); b.style.setProperty('--c', COL[c]); b.setAttribute('aria-label', c); b.onclick = () => tap(c); pads[c] = b; grid.append(b); });
      status = $('div', 'fv-lstatus', ''); dots = $('div', 'fv-ldots'); host.append(grid, status, dots);
    }
    function head() { roundEl.textContent = 'Round ' + view.round + ' / ' + view.rounds; strikesEl.textContent = ''; strikesEl.append(hearts(view.strikesLeft, ctx.maxStrikes ? ctx.maxStrikes(view.strikesLeft) : 2)); drawDots(); }
    function drawDots() { dots.textContent = ''; for (let i = 0; i < view.len; i++) dots.append($('i', i < mem.pos ? 'on' : '')); }
    function setMode(m, msg) { mode = m; host.classList.toggle('fv-locked', m !== 'input'); status.textContent = msg || (m === 'input' ? 'Your turn — repeat the lights' : ''); }
    function flash(c, ms) { return new Promise(res => { const p = pads[c]; if (!p) return res(); p.classList.add('lit'); ctx.tone(FREQ[c], ms * .85); setTimeout(() => { p.classList.remove('lit'); setTimeout(res, 230); }, ms); }); }
    async function play(seq) { setMode('show', 'Watch carefully…'); await sleep(350); for (const c of seq) { if (!alive) return false; await flash(c, 520); } return alive; }
    async function showThenInput() { if (await play(mem.seq)) { mem.pos = 0; mem.save(); drawDots(); setMode('input'); } }
    async function requestShow() { setMode('wait', 'Get ready…'); await sleep(750); if (alive) ctx.answer({ op: 'show' }); }
    function tap(c) {
      if (mode !== 'input' || ctx.busy()) return; const p = pads[c]; p.classList.add('lit'); ctx.tone(FREQ[c], 160); setTimeout(() => p.classList.remove('lit'), 170); ctx.answer({ op: 'tap', c });
    }
    function update(nv, fb) {
      view = nv; head();
      if (fb && fb.reveal) {                                                             // the server just showed us the new light(s): remember them, play the whole sequence
        mem.seq = mem.seq.slice(0, fb.from).concat(fb.reveal); mem.save();
        if (mem.seq.length !== view.len) { setMode('lost', 'You lost track of the sequence — tap anyway and hope!'); mem.pos = 0; return; }
        showThenInput();
      } else if (fb && fb.ok === false) { ctx.sfx('bad'); mem.pos = 0; mem.save(); head(); host.classList.remove('shake'); void host.offsetWidth; host.classList.add('shake'); setMode('wait', 'Wrong! Watch again…'); setTimeout(() => { if (alive) showThenInput(); }, 700); }
      else if (fb && fb.ok === true && fb.roundDone) { ctx.sfx('good'); mem.pos = 0; mem.save(); head(); setMode('wait', '✓ Round cleared'); requestShow(); }
      else if (fb && fb.ok === true) { mem.pos++; mem.save(); drawDots(); }
      else if (view.shown < view.len) requestShow();                                      // first draw (or coming back)
      else if (mem.seq.length === view.len) setMode('input');
      else setMode('lost', 'You lost track of the sequence — tap anyway and hope!');
    }
    frame(); update(v0, null);
    return { update, destroy() { alive = false; } };
  }

  /* ------------------------------------------------------------ 6. fingerprint / key card match */
  function printSVG(it) {
    const id = 'cp' + (++uid), fine = it.ridge === 'fine', step = fine ? 3.5 : 6.2, sw = fine ? 1.1 : 2.1, lean = it.lean === 'left' ? -14 : 14; let d = '';
    if (it.pattern === 'whorl') for (let r = 3; r < 38; r += step) d += '<ellipse cx="40" cy="52" rx="' + (r * .82).toFixed(1) + '" ry="' + (r * 1.1).toFixed(1) + '"/>';
    else if (it.pattern === 'loop') for (let r = 3; r < 36; r += step) d += '<path d="M' + (40 - r).toFixed(1) + ' 94 V50 A' + r.toFixed(1) + ' ' + (r * 1.05).toFixed(1) + ' 0 0 1 ' + (40 + r).toFixed(1) + ' 50 V82"/>';
    else if (it.pattern === 'arch') for (let y = 90; y > 12; y -= step * 1.15) d += '<path d="M2 ' + y.toFixed(1) + ' Q40 ' + (y - (90 - y) * .55 - 10).toFixed(1) + ' 78 ' + y.toFixed(1) + '"/>';
    else { for (let r = 3; r < 26; r += step) d += '<ellipse cx="29" cy="40" rx="' + (r * .72).toFixed(1) + '" ry="' + r.toFixed(1) + '"/>'; for (let r = 3; r < 26; r += step) d += '<ellipse cx="51" cy="62" rx="' + (r * .72).toFixed(1) + '" ry="' + r.toFixed(1) + '"/>'; }
    const scar = it.scar === 'scarred' ? '<path d="M14 26 L30 42 L25 51 L48 67 L43 76 L62 90" fill="none" stroke="#0a1913" stroke-width="3.6" stroke-linejoin="round"/><path d="M14 26 L30 42 L25 51 L48 67 L43 76 L62 90" fill="none" stroke="#fff" stroke-opacity=".5" stroke-width=".7" stroke-linejoin="round"/>' : '';
    return '<svg viewBox="0 0 80 100"><defs><clipPath id="' + id + '"><ellipse cx="40" cy="50" rx="35" ry="47"/></clipPath></defs><ellipse cx="40" cy="50" rx="37" ry="48" fill="#0a1913" stroke="#2f6f57" stroke-width="2"/>' +
      '<g clip-path="url(#' + id + ')"><g transform="rotate(' + lean + ' 40 50)" fill="none" stroke="#9be7c4" stroke-width="' + sw + '" stroke-linecap="round">' + d + '</g>' + scar + '</g></svg>';
  }
  const STRIPE = { red: '#ef4444', blue: '#3b82f6', green: '#22c55e', gold: '#facc15' };
  function cardSVG(it) {
    const chip = { round: '<circle cx="22" cy="38" r="9"/>', square: '<rect x="13" y="29" width="18" height="18" rx="2"/>', triangle: '<polygon points="22,28 32,47 12,47"/>' }[it.chip] || '', n = Math.max(1, Math.min(4, +it.notches || 1));
    let notches = ''; for (let i = 0; i < n; i++) notches += '<rect x="' + (46 + i * 11) + '" y="56" width="6" height="8" fill="#0b1220"/>';
    const holo = it.holo === 'yes' ? '<polygon points="82,26 85,34 94,34 87,39 90,48 82,43 74,48 77,39 70,34 79,34" fill="#a5f3fc" stroke="#0e7490" stroke-width="1"/>' : '';
    return '<svg viewBox="0 0 104 64"><rect x="1" y="1" width="102" height="62" rx="7" fill="#1f2937" stroke="#64748b" stroke-width="2"/><rect x="1" y="9" width="102" height="9" fill="' + (STRIPE[it.stripe] || '#999') + '"/>' +
      '<g fill="#facc15" stroke="#7a5b00" stroke-width="1.5">' + chip + '</g><rect x="42" y="30" width="22" height="3" rx="1.5" fill="#475569"/><rect x="42" y="37" width="30" height="3" rx="1.5" fill="#475569"/>' + holo + notches + '</svg>';
  }
  function mkMatch(host, v0, ctx) {
    function build(view, fb) {
      host.textContent = ''; host.append(intro(view.intro));
      const meta = $('div', 'fv-meta'); meta.append(hearts(view.strikesLeft, ctx.maxStrikes ? ctx.maxStrikes(view.strikesLeft) : 2), $('span', '', view.variant === 'print' ? 'Which print is it?' : 'Which card is it?')); host.append(meta);
      const cl = $('ul', 'fv-clues big'); view.clues.forEach(t => cl.append($('li', '', t))); host.append(cl);
      const grid = $('div', 'fv-items ' + view.variant);
      view.items.forEach((it, i) => {
        const out = view.eliminated.indexOf(i) >= 0, b = $('button', 'fv-item' + (out ? ' out' : '')); b.disabled = out; b.setAttribute('aria-label', (view.variant === 'print' ? 'Fingerprint ' : 'Key card ') + 'ABCDEF'[i]);
        const art = $('div', 'fv-art'); art.innerHTML = view.variant === 'print' ? printSVG(it) : cardSVG(it); b.append(art, $('span', 'fv-lab', 'ABCDEF'[i])); if (out) b.append($('span', 'fv-cross', '✗'));
        b.onclick = () => { if (ctx.busy() || out) return; ctx.answer({ pick: i }); }; grid.append(b);
      });
      host.append(grid);
      if (fb && fb.ok === false) { ctx.sfx('bad'); grid.classList.add('shake'); host.classList.add('flash-bad'); setTimeout(() => host.classList.remove('flash-bad'), 500); }
    }
    build(v0, null); return { update: build, destroy() { } };
  }

  const MK = { lock: mkLock, cracker: mkCracker, wires: mkWires, pattern: mkPattern, lights: mkLights, match: mkMatch };
  g.FutaVaultPuzzles = { make(kind, host, view, ctx) { const f = MK[kind]; if (!f) throw new Error('unknown puzzle ' + kind); return f(host, view, ctx); }, kinds: Object.keys(MK), printSVG, cardSVG, tokenEl, wiresSVG };
})(typeof window !== 'undefined' ? window : globalThis);
