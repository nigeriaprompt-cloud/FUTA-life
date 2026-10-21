/* ==========================================================================
   FutaVaultCore — the Bank vault rules, in JavaScript, for the LOCAL DEMO only (no Supabase keys yet).
   The REAL game never uses this file's answers: the real rules live in supabase/13_vault.sql and the browser only talks to the
   RPCs vault_status / vault_start / vault_answer / vault_giveup.  This file is a faithful twin so the demo behaves the same.
   (In demo mode the answers sit in the browser's memory — that is fine for a demo, never for the live game.)

   FutaVaultCore.createDemo({ pay(amount), isTeen() -> Promise<bool>, store? }) → { status(), start(), answer(id, ans), giveup(id), jailSecs() }
   Pure puzzle functions (also used by tools/test/vault.test.js):  gen(kind) · view(kind, st) · step(kind, st, ans) · KINDS
   Every number below is a twin of app_config 'vault' in 13_vault.sql — change both together (docs/VAULT.md).
   ========================================================================== */
(function (g) {
  'use strict';
  const CFG = { seconds: 120, grace: 3, strikes: 2, lockTries: 3, crackerGuesses: 8, refillSecs: 1200, cooldownSecs: 10800, jailSecs: 180, teenFailCooldownSecs: 600 };
  const KINDS = ['lock', 'cracker', 'wires', 'pattern', 'lights', 'match'];
  const ri = (lo, hi) => lo + Math.floor(Math.random() * (hi - lo + 1)), pick = (a) => a[ri(0, a.length - 1)];
  const shuffle = (a) => { a = a.slice(); for (let i = a.length - 1; i > 0; i--) { const j = ri(0, i); [a[i], a[j]] = [a[j], a[i]]; } return a; };
  const copy = (o) => JSON.parse(JSON.stringify(o));
  const err = (m) => { const e = new Error(m); e.code = m; return e; };
  const FRIENDLY = { wrong_place: 'You can’t do that here.', in_jail: 'You are in jail.', vault_cooldown: 'The bank is watching you. Come back later.', vault_empty: 'The vault is empty right now.', vault_busy: 'Someone is robbing the vault right now.', bad_attempt: 'That attempt is over.', bad_answer: 'That answer is not valid.', show_first: 'Watch the lights first.' };

  /* ---------- how much is in the vault: mostly medium, sometimes huge, 7m–14m, whole thousands ---------- */
  function roll() { const r = Math.random(); let lo, hi; if (r < 0.6) { lo = 7000000; hi = 10000000; } else if (r < 0.9) { lo = 10000000; hi = 12500000; } else { lo = 12500000; hi = 14000000; } return Math.floor((lo + Math.floor(Math.random() * (hi - lo + 1))) / 1000) * 1000; }

  /* ========================= 1. code lock ========================= */
  const dig = (n, pos) => Math.floor(n / [0, 100, 10, 1][pos]) % 10, ORD = ['', 'first', 'middle', 'last'];
  function clueOk(n, c) {
    const d1 = Math.floor(n / 100), d2 = Math.floor(n / 10) % 10, d3 = n % 10;
    switch (c.t) {
      case 'par': return (dig(n, c.pos) % 2 === 0) === (c.v === 'even');
      case 'sum': return d1 + d2 + d3 === c.v;
      case 'cmp': { const x = dig(n, c.a), y = dig(n, c.b); return (x > y ? 'gt' : x < y ? 'lt' : 'eq') === c.v; }
      case 'has': return (d1 === c.d || d2 === c.d || d3 === c.d) === c.v;
      case 'distinct': return (d1 !== d2 && d2 !== d3 && d1 !== d3) === c.v;
      case 'div': return n % c.n === 0;
      case 'max': return Math.max(d1, d2, d3) === c.v;
      case 'dig': return dig(n, c.pos) === c.v;
      case 'pair': return dig(n, c.a) + dig(n, c.b) === c.v;
      case 'prod': return d1 * d2 * d3 === c.v;
      case 'rng': return n >= c.lo && n <= c.hi;
    } return false;
  }
  function clueText(c) {
    switch (c.t) {
      case 'par': return 'The ' + ORD[c.pos] + ' digit is ' + c.v + '.';
      case 'sum': return 'The three digits add up to ' + c.v + '.';
      case 'cmp': return 'The ' + ORD[c.a] + ' digit is ' + (c.v === 'gt' ? 'bigger than' : c.v === 'lt' ? 'smaller than' : 'equal to') + ' the ' + ORD[c.b] + ' digit.';
      case 'has': return c.v ? 'It contains a ' + c.d + '.' : 'It has no ' + c.d + ' in it.';
      case 'distinct': return c.v ? 'All three digits are different.' : 'At least two digits are the same.';
      case 'div': return 'It divides exactly by ' + c.n + '.';
      case 'max': return 'The biggest digit is ' + c.v + '.';
      case 'dig': return 'The ' + ORD[c.pos] + ' digit is ' + c.v + '.';
      case 'pair': return 'The ' + ORD[c.a] + ' and ' + ORD[c.b] + ' digits add up to ' + c.v + '.';
      case 'prod': return 'Multiply the three digits and you get ' + c.v + '.';
      case 'rng': return 'It is between ' + c.lo + ' and ' + c.hi + '.';
    } return '';
  }
  function clueFor(n) {
    const k = ri(1, 11), d1 = Math.floor(n / 100), d2 = Math.floor(n / 10) % 10, d3 = n % 10;
    if (k === 1) { const p = ri(1, 3); return { t: 'par', pos: p, v: dig(n, p) % 2 === 0 ? 'even' : 'odd' }; }
    if (k === 2) return { t: 'sum', v: d1 + d2 + d3 };
    if (k === 3) { const a = ri(1, 3), b = ri(1, 3); if (a === b || dig(n, a) === dig(n, b)) return null; return { t: 'cmp', a, b, v: dig(n, a) > dig(n, b) ? 'gt' : 'lt' }; }
    if (k === 4) { const d = Math.random() < 0.5 ? dig(n, ri(1, 3)) : ri(0, 9); return { t: 'has', d, v: d1 === d || d2 === d || d3 === d }; }
    if (k === 5) return { t: 'distinct', v: d1 !== d2 && d2 !== d3 && d1 !== d3 };
    if (k === 6) { const divs = [3, 4, 6, 7, 9, 11, 13].filter(x => n % x === 0); if (!divs.length) return null; return { t: 'div', n: pick(divs) }; }
    if (k === 7) return { t: 'max', v: Math.max(d1, d2, d3) };
    if (k === 8 || k === 9) { const a = ri(1, 3), b = 1 + (a + ri(0, 1)) % 3; return { t: 'pair', a: Math.min(a, b), b: Math.max(a, b), v: dig(n, a) + dig(n, b) }; }
    if (k === 10) return { t: 'prod', v: d1 * d2 * d3 };
    return { t: 'rng', lo: Math.max(100, n - ri(40, 220)), hi: Math.min(999, n + ri(40, 220)) };
  }
  const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
  function clueCount(clues) { let c = 0; for (let n = 100; n <= 999; n++) if (clues.every(q => clueOk(n, q))) c++; return c; }
  function genCode(code) {
    const clues = []; let cnt = 900;
    for (; ;) {
      let best = null, bestc = 1e9;
      if (clues.length < 5) for (let i = 0; i < 6; i++) { const c = clueFor(code); if (!c || clues.some(q => same(q, c))) continue; const cc = clueCount(clues.concat([c])); if (cc < bestc || (cc === bestc && Math.random() < 0.5)) { best = c; bestc = cc; } }
      if (!best) { const pos = ri(1, 3); best = { t: 'dig', pos, v: dig(code, pos) }; if (clues.some(q => same(q, best))) continue; }
      clues.push(best); cnt = clueCount(clues); if (cnt === 1 && clues.length >= 3) return clues;
    }
  }
  function genLock() {
    const codes = []; while (codes.length < 3) { const n = ri(100, 999); if (codes.indexOf(n) < 0) codes.push(n); }
    return { codes, clues: codes.map(genCode), tries: CFG.lockTries, right: null };
  }

  /* ========================= 2. safe cracker ========================= */
  function genCracker() { return { secret: shuffle([0, 1, 2, 3, 4, 5, 6, 7, 8, 9]).slice(0, 4).join(''), guesses: [], max: CFG.crackerGuesses }; }

  /* ========================= 3. wire cutting ========================= */
  const COLS = ['red', 'blue', 'yellow', 'green', 'white', 'black'];
  function genWires() {
    for (let tries = 1; ; tries++) {
      const wires = []; for (let i = 0; i < 6; i++) wires.push(pick(COLS));
      if (new Set(wires).size < 4) continue;
      const count = (c) => wires.filter(w => w === c).length, subj = shuffle(Array.from(new Set(wires))).slice(0, 3), card = []; let cut = [];
      subj.forEach(s => {
        let y = pick(COLS); if (y === s) y = COLS[(COLS.indexOf(s) + 1) % 6];
        const t = pick(['even', 'odd', 'many', 'none']), cnt = count(y), pass = t === 'even' ? cnt % 2 === 0 : t === 'odd' ? cnt % 2 === 1 : t === 'many' ? cnt >= 2 : cnt === 0;
        card.push('Cut ' + s.toUpperCase() + ' wires only if ' + (t === 'even' ? 'there is an even number of ' + y.toUpperCase() + ' wires (zero counts as even).' : t === 'odd' ? 'there is an odd number of ' + y.toUpperCase() + ' wires.' : t === 'many' ? 'there are 2 or more ' + y.toUpperCase() + ' wires.' : 'there is no ' + y.toUpperCase() + ' wire at all.'));
        if (pass) wires.forEach((w, j) => { if (w === s) cut.push(j); });
      });
      card.push('Leave every other colour alone. Count wires as they are on the panel now.');
      const ok = ri(1, 4); let dir, oc = null;
      if (ok === 1) { dir = 'asc'; card.push('Cut from left to right.'); }
      else if (ok === 2) { dir = 'desc'; card.push('Cut from right to left.'); }
      else if (ok === 3) { const a = pick(COLS), b = COLS[(COLS.indexOf(a) + 1) % 6]; dir = count(a) > count(b) ? 'desc' : 'asc'; card.push('If there are more ' + a.toUpperCase() + ' wires than ' + b.toUpperCase() + ' wires, cut from right to left. Otherwise cut from left to right.'); }
      else { dir = 'colour'; oc = shuffle(subj); card.push('Cut by colour: ' + oc.map(x => x.toUpperCase()).join(', then ') + '. Wires of the same colour go left to right.'); }
      cut.sort((a, b) => a - b); if (dir === 'desc') cut.reverse(); if (dir === 'colour') cut.sort((a, b) => oc.indexOf(wires[a]) - oc.indexOf(wires[b]) || a - b);
      if ((cut.length >= 2 && cut.length <= 5) || tries > 60) return { wires, card, sol: cut, cut: [], strikes: 0 };
    }
  }

  /* ========================= 4. pattern ========================= */
  function opts(right, cands) {
    let o = [right]; cands.forEach(c => { if (c != null && o.length < 4 && o.indexOf(c) < 0) o.push(c); });
    for (let i = 0; o.length < 4 && i < 50; i++) if (/^-?\d+$/.test(right)) { const c = String(+right + ri(-9, 9)); if (o.indexOf(c) < 0) o.push(c); }
    o = shuffle(o); return { options: o, ans: o.indexOf(right) };
  }
  function genPatternRound() {
    const f = ri(1, 10); let series, right, cands; const S = (a) => a.map(String), rng5 = [0, 1, 2, 3, 4];
    if (f === 1) { const a = ri(2, 15), d = ri(2, 9); series = S(rng5.map(k => a + d * k)); right = String(a + d * 5); cands = [a + d * 5 + d, a + d * 5 - d, a + d * 5 + 1, a + d * 5 - 1, a + d * 4 + 1].map(String); }
    else if (f === 2) { const a = ri(1, 4), r = ri(2, 3); series = S(rng5.map(k => a * Math.pow(r, k))); const L = a * Math.pow(r, 5); right = String(L); cands = [(a * Math.pow(r, 4)) * 2 - a * Math.pow(r, 3), a * Math.pow(r, 4) * (r + 1), L + a, L - r].map(String); }
    else if (f === 3) { const a = ri(5, 30), p = ri(5, 12), q = ri(1, p - 1), s = [a, a + p, a + p - q, a + 2 * p - q, a + 2 * p - 2 * q]; series = S(s); right = String(a + 3 * p - 2 * q); cands = [s[4] - q, s[4] + q, s[4] + p + q, a + 3 * p - 2 * q + 1, a + 3 * p - 2 * q - 1].map(String); }
    else if (f === 4) { const a = ri(1, 9), k = ri(1, 3), s = [a, a + k, a + 3 * k, a + 6 * k, a + 10 * k]; series = S(s); right = String(a + 15 * k); cands = [a + 14 * k, a + 16 * k, a + 15 * k + 1, a + 14 * k, a + 16 * k].map(String); }
    else if (f === 5) { const off = ri(1, 4), c = ri(0, 9); series = S(rng5.map(k => (off + k) * (off + k) + c)); const L = (off + 5) * (off + 5) + c; right = String(L); cands = [L - 2, L + 2, (off + 4) * (off + 4) + c + 2 * (off + 4), L + off + 5].map(String); }
    else if (f === 6) { const a = ri(1, 5), b = ri(2, 7), s = [a, b, a + b, a + 2 * b, 2 * a + 3 * b]; series = S(s); right = String(s[3] + s[4]); cands = [s[4] * 2, s[3] + s[4] + 1, s[3] + s[4] - 1, s[4] + s[2], s[4] + s[3] + 3].map(String); }
    else if (f === 7) { const a = ri(1, 9), b = ri(10, 40), p = ri(2, 6), q = ri(2, 9), s = [a, b, a + p, b + q, a + 2 * p]; series = S(s); right = String(b + 2 * q); cands = [a + 3 * p, b + q + p, b + 3 * q, b + 2 * q - 1, b + 2 * q + p].map(String); }
    else if (f === 8) {
      const shp = shuffle(['tri', 'circle', 'square', 'star', 'diamond']).slice(0, 3), col = shuffle(['red', 'blue', 'green']).slice(0, 2), all = ['red', 'blue', 'green'];
      series = rng5.map(k => shp[k % 3] + ':' + col[k % 2]); right = shp[5 % 3] + ':' + col[5 % 2];
      cands = [shp[5 % 3] + ':' + col[0], shp[0] + ':' + col[5 % 2], shp[1] + ':' + col[5 % 2], shp[5 % 3] + ':' + pick(all), shp[1] + ':' + col[0]];
    }
    else if (f === 9) { const step = pick([45, 90, 135, 270]), a = ri(0, 7) * 45; series = rng5.map(k => 'arrow:' + ((a + step * k) % 360)); right = 'arrow:' + ((a + step * 5) % 360); cands = shuffle([0, 45, 90, 135, 180, 225, 270, 315]).map(x => 'arrow:' + x); }
    else { const a = ri(1, 3), s = [a, a + 1, a + 3, a + 6, a + 10]; series = s.map(x => 'dots:' + x); right = 'dots:' + (a + 15); cands = ['dots:' + (a + 14), 'dots:' + (a + 16), 'dots:' + (a + 13), 'dots:' + (a + 14)]; }
    const o = opts(right, cands); return { series, options: o.options, ans: o.ans };
  }
  function genPattern() { return Object.assign({ round: 1, strikes: 0 }, genPatternRound()); }

  /* ========================= 5. light memory ========================= */
  const LC = ['red', 'green', 'blue', 'yellow'];
  function genLights() { return { seq: [pick(LC), pick(LC), pick(LC)], pos: 0, shown: 0, round: 1, strikes: 0 }; }

  /* ========================= 6. fingerprint / key card ========================= */
  const SPECS = { print: { pattern: ['loop', 'whorl', 'arch', 'double'], ridge: ['fine', 'coarse'], scar: ['clean', 'scarred'], lean: ['left', 'right'] }, card: { stripe: ['red', 'blue', 'green', 'gold'], chip: ['round', 'square', 'triangle'], notches: ['1', '2', '3', '4'], holo: ['yes', 'no'] } };
  function matchText(variant, k, v, neg) {
    if (variant === 'print') {
      if (k === 'pattern') return neg ? 'The pattern is NOT a ' + v + '.' : 'The pattern is a ' + v + '.';
      if (k === 'ridge') return neg ? 'The ridges are not ' + v + '.' : 'The ridges are ' + v + '.';
      if (k === 'scar') return v === 'scarred' ? (neg ? 'It has no scar.' : 'It has a scar.') : (neg ? 'It has a scar.' : 'It has no scar.');
      if (k === 'lean') return neg ? 'It does not lean ' + v + '.' : 'It leans ' + v + '.';
    } else {
      if (k === 'stripe') return neg ? 'The stripe is not ' + v + '.' : 'The stripe is ' + v + '.';
      if (k === 'chip') return neg ? 'The chip is not ' + v + '.' : 'The chip is ' + v + '.';
      if (k === 'notches') return neg ? 'It does not have ' + v + (v === '1' ? ' notch.' : ' notches.') : 'It has ' + v + (v === '1' ? ' notch.' : ' notches.');
      if (k === 'holo') return v === 'yes' ? (neg ? 'There is no hologram star.' : 'It has the hologram star.') : (neg ? 'It has the hologram star.' : 'There is no hologram star.');
    } return '';
  }
  const matchCount = (items, defs) => items.filter(it => defs.every(c => c.neg ? it[c.k] !== c.v : it[c.k] === c.v)).length;
  function genMatch() {
    const variant = pick(['print', 'card']), spec = SPECS[variant], keys = Object.keys(spec), items = [];
    while (items.length < 6) { const it = {}; keys.forEach(k => { it[k] = pick(spec[k]); }); if (!items.some(x => same(x, it))) items.push(it); }
    const target = ri(0, 5), defs = [], texts = []; let cnt = 6;
    for (let guard = 0; guard < 40; guard++) {
      let best = null, bestc = 100;
      for (let i = 0; i < 5; i++) {
        const k = pick(keys), vals = spec[k], v = items[target][k], neg = vals.length > 2 && Math.random() < 0.5; let w = v; if (neg) do { w = pick(vals); } while (w === v);
        const cl = { k, v: neg ? w : v, neg }; if (defs.some(q => same(q, cl))) continue; const cc = matchCount(items, defs.concat([cl])); if (cc < bestc || (cc === bestc && Math.random() < 0.5)) { best = cl; bestc = cc; }
      }
      if (best) { defs.push(best); cnt = bestc; texts.push(matchText(variant, best.k, best.v, best.neg)); }
      if (cnt === 1 && defs.length >= 3) break;
    }
    return { variant, items, target, clues: texts, defs, eliminated: [], strikes: 0 };
  }

  /* ========================= dispatch ========================= */
  const gen = (k) => ({ lock: genLock, cracker: genCracker, wires: genWires, pattern: genPattern, lights: genLights, match: genMatch }[k])();
  function view(kind, st) {
    const mx = CFG.strikes;
    if (kind === 'lock') return { kind, title: 'Code lock', intro: 'Three codes. Each clue is true. Enter all three.', dials: st.clues.map((cl, i) => ({ label: String.fromCharCode(65 + i), clues: cl.map(clueText) })), triesLeft: st.tries, right: st.right };
    if (kind === 'cracker') return { kind, title: 'Safe cracker', intro: 'Find the 4-digit code. The safe tells you how close each guess is.', digits: 4, max: st.max, left: st.max - st.guesses.length, history: copy(st.guesses) };
    if (kind === 'wires') return { kind, title: 'Cut the wires', intro: 'Read the rule card. Cut only the right wires, in the right order.', wires: st.wires.slice(), card: st.card.slice(), cut: st.cut.slice(), strikesLeft: mx - st.strikes };
    if (kind === 'pattern') return { kind, title: 'Pattern', intro: 'What comes next? Three rounds in a row.', round: st.round, rounds: 3, series: st.series.slice(), options: st.options.slice(), strikesLeft: mx - st.strikes };
    if (kind === 'lights') return { kind, title: 'Light memory', intro: 'Watch the lights, then repeat them. It gets longer.', round: st.round, rounds: 3, colours: LC.slice(), len: st.seq.length, shown: st.shown, strikesLeft: mx - st.strikes };
    if (kind === 'match') return { kind, title: st.variant === 'print' ? 'Fingerprint match' : 'Key card match', intro: 'Pick the one that fits every clue.', variant: st.variant, clues: st.clues.slice(), items: copy(st.items), eliminated: st.eliminated.slice(), strikesLeft: mx - st.strikes };
    return null;
  }
  function step(kind, st0, ans) {
    const st = copy(st0), mx = CFG.strikes; let outcome = 'continue', fb = {};
    if (!ans || typeof ans !== 'object') throw err('bad_answer');
    if (kind === 'lock') {
      if (!Array.isArray(ans.codes) || ans.codes.length !== 3 || ans.codes.some(x => typeof x !== 'number')) throw err('bad_answer');
      const right = ans.codes.map((x, i) => x === st.codes[i]); if (right.every(Boolean)) return { st, outcome: 'solved', fb };
      st.tries--; st.right = right; if (st.tries <= 0) outcome = 'fail'; fb = { right };
    } else if (kind === 'cracker') {
      const guess = ans.guess; if (typeof guess !== 'string' || !/^[0-9]{4}$/.test(guess)) throw err('bad_answer');
      let e = 0, m = 0; for (let i = 0; i < 4; i++) if (guess[i] === st.secret[i]) e++;
      for (let d = 0; d <= 9; d++) m += Math.min(st.secret.split(String(d)).length - 1, guess.split(String(d)).length - 1); m -= e;
      st.guesses.push({ guess, exact: e, misplaced: m }); fb = { exact: e, misplaced: m };
      if (e === 4) outcome = 'solved'; else if (st.guesses.length >= st.max) outcome = 'fail';
    } else if (kind === 'wires') {
      if (typeof ans.cut !== 'number' || ans.cut < 0 || ans.cut > 5) throw err('bad_answer');
      if (st.cut.indexOf(ans.cut) >= 0) return { st, outcome, fb };
      if (st.sol[st.cut.length] === ans.cut) { st.cut.push(ans.cut); fb = { ok: true }; if (st.cut.length >= st.sol.length) outcome = 'solved'; }
      else { st.strikes++; fb = { ok: false }; if (st.strikes >= mx) outcome = 'fail'; }
    } else if (kind === 'pattern') {
      if (typeof ans.pick !== 'number') throw err('bad_answer');
      if (ans.pick === st.ans) { fb = { correct: true }; if (st.round >= 3) outcome = 'solved'; else { st.round++; Object.assign(st, genPatternRound()); } }
      else { fb = { correct: false }; st.strikes++; Object.assign(st, genPatternRound()); if (st.strikes >= mx) outcome = 'fail'; }
    } else if (kind === 'lights') {
      if (ans.op === 'show') { fb = { reveal: st.seq.slice(st.shown), from: st.shown }; st.shown = st.seq.length; }
      else if (ans.op === 'tap') {
        if (st.shown < st.seq.length) throw err('show_first'); if (LC.indexOf(ans.c) < 0) throw err('bad_answer');
        if (st.seq[st.pos] === ans.c) {
          st.pos++;
          if (st.pos >= st.seq.length) { fb = { ok: true, roundDone: true }; if (st.round >= 3) outcome = 'solved'; else { st.round++; st.pos = 0; st.seq.push(pick(LC)); } } else fb = { ok: true };
        } else { st.strikes++; st.pos = 0; fb = { ok: false }; if (st.strikes >= mx) outcome = 'fail'; }
      } else throw err('bad_answer');
    } else if (kind === 'match') {
      if (typeof ans.pick !== 'number' || ans.pick < 0 || ans.pick > 5) throw err('bad_answer');
      if (st.eliminated.indexOf(ans.pick) >= 0) return { st, outcome, fb };
      if (ans.pick === st.target) { outcome = 'solved'; fb = { ok: true }; } else { st.strikes++; st.eliminated.push(ans.pick); fb = { ok: false }; if (st.strikes >= mx) outcome = 'fail'; }
    } else throw err('bad_answer');
    return { st, outcome, fb };
  }

  /* ========================= the demo vault (one player, state in localStorage) ========================= */
  function createDemo(o) {
    o = o || {}; const KEY = 'futa.demo.vault', now = () => Date.now(); let S = null;
    const load = () => { try { S = JSON.parse(localStorage.getItem(KEY)); } catch (e) { S = null; } S = S || { amount: roll(), status: 'full', refillAt: 0, cooldownUntil: 0, jailUntil: 0, attempt: null }; };
    const save = () => { try { localStorage.setItem(KEY, JSON.stringify(S)); } catch (e) { /* private mode */ } };
    const secs = (t) => Math.max(0, Math.ceil((t - now()) / 1000));
    function fail(why) {
      const a = S.attempt; S.attempt = null; S.status = 'full'; let res;
      if (a.teen) { const until = (why === 'expired' ? a.deadline : now()) + CFG.teenFailCooldownSecs * 1000; S.cooldownUntil = Math.max(S.cooldownUntil, until); res = { status: 'failed', why, cooldownSecs: secs(until) }; }
      else { const until = (why === 'expired' ? a.deadline : now()) + CFG.jailSecs * 1000; S.jailUntil = until; res = { status: 'caught', why, jailSecs: secs(until) }; }
      save(); return res;
    }
    function tick() {
      load();
      if (S.status === 'locked' && (!S.attempt || S.attempt.deadline + CFG.grace * 1000 <= now())) { if (S.attempt) fail('expired'); else { S.status = 'full'; save(); } }
      if (S.status === 'empty' && S.refillAt <= now()) { S.amount = roll(); S.status = 'full'; S.refillAt = 0; save(); }
    }
    const json = (a, withTeen) => { const p = a.puzzles[a.step], r = { attempt: a.id, totalSecs: CFG.seconds, secsLeft: secs(a.deadline), step: a.step, count: 3, puzzle: view(p.kind, p.st) }; if (withTeen) r.teen = a.teen; return r; };
    const D = {
      jailSecs() { load(); return secs(S.jailUntil); },
      async status() {
        tick(); const teen = o.isTeen ? await o.isTeen() : false;
        return { vault: S.status === 'full' ? 'full' : S.status === 'locked' ? 'robbery' : 'empty', mine: S.status === 'locked', refillSecs: S.status === 'empty' ? secs(S.refillAt) : 0, cooldownSecs: secs(S.cooldownUntil), jailSecs: secs(S.jailUntil), teen: !!teen, totalSecs: CFG.seconds, jailLen: CFG.jailSecs, teenCooldownLen: CFG.teenFailCooldownSecs };
      },
      async start() {
        tick(); if (secs(S.jailUntil) > 0) throw err('in_jail');
        if (S.status === 'locked' && S.attempt) return json(S.attempt, true);
        if (secs(S.cooldownUntil) > 0) throw err('vault_cooldown'); if (S.status === 'empty') throw err('vault_empty');
        const teen = o.isTeen ? !!(await o.isTeen()) : false, puzzles = shuffle(KINDS).slice(0, 3).map(k => ({ kind: k, st: gen(k) }));
        S.attempt = { id: now(), deadline: now() + CFG.seconds * 1000, step: 0, puzzles, teen }; S.status = 'locked'; save(); return json(S.attempt, true);
      },
      async answer(id, ans) {
        tick(); const a = S.attempt; if (!a || a.id !== id) throw err('bad_attempt');
        const cur = a.puzzles[a.step], r = step(cur.kind, cur.st, ans);
        if (r.outcome === 'fail') return fail('strikes');
        if (r.outcome === 'solved') {
          if (a.step + 1 >= 3) {
            const amt = S.amount; S.attempt = null; S.status = 'empty'; S.amount = 0; S.refillAt = now() + CFG.refillSecs * 1000; S.cooldownUntil = now() + CFG.cooldownSecs * 1000; save(); if (o.pay) o.pay(amt);
            return { status: 'win', payout: amt, cooldownSecs: secs(S.cooldownUntil) };
          }
          a.step++; save(); return Object.assign({ status: 'solved', feedback: r.fb }, json(a, false));
        }
        cur.st = r.st; save(); return Object.assign({ status: 'continue', feedback: r.fb }, json(a, false));
      },
      async giveup(id) { tick(); if (!S.attempt || S.attempt.id !== id) throw err('bad_attempt'); return fail('gaveup'); }
    };
    return D;
  }

  g.FutaVaultCore = { CFG, KINDS, FRIENDLY, roll, gen, view, step, createDemo, clueCount, clueOk, clueText, matchCount, genCode };
  if (typeof module !== 'undefined' && module.exports) module.exports = g.FutaVaultCore;
})(typeof window !== 'undefined' ? window : globalThis);
