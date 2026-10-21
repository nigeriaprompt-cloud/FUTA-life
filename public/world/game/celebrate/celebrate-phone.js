/* FUTA Celebrations — the PHONE side. Loaded by phone.js. Draws, only while the admin has a celebration switched ON:
   • a swaying bunting garland across the top of the home screen   • a soft glow + sparkles + gentle confetti behind the icons
   • a "ribbon card" with the event title, the message and a countdown   • a small gold star on the round launcher button
   • one friendly toast the first time the phone opens each day.
   Everything is drawn inside the phone's Shadow DOM, so it can never touch the map or any app. Text uses textContent only.
   Respects "reduce motion" (no animation, still pretty). Removing it: turn the celebration off in /admin, or delete the one line in phone.js that loads this file. */
(function (g) {
  'use strict';
  const C = g.FutaCelebrate, P = g.FutaPhone; if (!C || !P || g.FutaCelebrateUI) return;
  const sh = P._shadow; if (!sh) return;
  const css = `
#futaPhone{--f1:#0f2b5b;--f2:#c9a24a;--f3:#f0d78c;--f4:#fbf8f1;--f5:#2c4f86;--fg:#f0d78c}
.ph-fest{position:absolute;inset:0;z-index:2;pointer-events:none;overflow:hidden;opacity:0;transition:opacity .6s;border-radius:inherit}
.ph-fest.on{opacity:1}
.ph-view.in-app ~ .ph-fest{opacity:0}
.ph-fest .glow{position:absolute;left:-20%;right:-20%;top:-10%;height:62%;background:radial-gradient(ellipse at 50% 0%,color-mix(in srgb,var(--fg) 38%,transparent),transparent 68%);mix-blend-mode:screen}
.ph-fest .glow2{position:absolute;left:-10%;right:-10%;bottom:-8%;height:34%;background:radial-gradient(ellipse at 50% 100%,color-mix(in srgb,var(--f2) 30%,transparent),transparent 70%)}
.ph-fest svg.gar{position:absolute;left:0;top:1.95em;width:100%;height:2.6em;overflow:visible;filter:drop-shadow(0 .12em .18em rgba(0,0,0,.35))}
.ph-fest .pn{transform-box:fill-box;transform-origin:50% 0;animation:fsway 3.4s ease-in-out infinite}
@keyframes fsway{0%,100%{transform:rotate(-5deg)}50%{transform:rotate(5deg)}}
.ph-fest i.sp{position:absolute;width:.34em;height:.34em;border-radius:50%;background:var(--fg);box-shadow:0 0 .6em .1em var(--fg);opacity:0;animation:ftw 3.2s ease-in-out infinite}
@keyframes ftw{0%,100%{opacity:0;transform:scale(.4)}50%{opacity:.9;transform:scale(1)}}
.ph-fest b.cf{position:absolute;top:-6%;width:.5em;height:.78em;border-radius:.08em;opacity:.9;animation:ffall linear infinite}
@keyframes ffall{0%{transform:translate3d(0,-8%,0) rotate(0)}100%{transform:translate3d(var(--dx,.8em),115vh,0) rotate(var(--r,540deg))}}
.ph-fcard{position:relative;margin:0 0 1em;padding:.85em 1em .85em .9em;border-radius:1.2em;color:#fff;display:flex;gap:.8em;align-items:center;overflow:hidden;
  background:linear-gradient(135deg,color-mix(in srgb,var(--f1) 92%,#000),color-mix(in srgb,var(--f5) 85%,#000));border:1px solid var(--f2);
  box-shadow:0 .5em 1.4em rgba(0,0,0,.35),inset 0 0 0 .22em color-mix(in srgb,var(--f2) 22%,transparent)}
.ph-fcard::before{content:"";position:absolute;inset:0;background:linear-gradient(115deg,transparent 35%,rgba(255,255,255,.16) 48%,transparent 60%);transform:translateX(-120%);animation:fshine 5.5s ease-in-out infinite}
@keyframes fshine{0%,55%{transform:translateX(-120%)}100%{transform:translateX(120%)}}
.ph-fcard .md{flex:none;width:2.9em;height:2.9em;border-radius:50%;display:grid;place-items:center;font-size:1.45em;background:radial-gradient(circle at 30% 25%,var(--f3),var(--f2));box-shadow:0 .2em .5em rgba(0,0,0,.35),inset 0 0 0 .12em rgba(255,255,255,.35)}
.ph-fcard .tx{min-width:0;flex:1}
.ph-fcard b{display:block;font:600 1.08em Georgia,"Iowan Old Style",serif;color:var(--f3);letter-spacing:.01em}
.ph-fcard span{display:block;font-size:.84em;line-height:1.35;opacity:.92;margin-top:.15em}
.ph-fcard small{display:inline-block;margin-top:.4em;font-size:.72em;font-weight:700;letter-spacing:.06em;text-transform:uppercase;color:var(--f3);border:1px solid color-mix(in srgb,var(--f3) 55%,transparent);padding:.15em .7em;border-radius:2em}
#futaPhoneBtn.fest::after{content:"✦";position:absolute;top:-.25em;left:-.25em;width:1.5em;height:1.5em;border-radius:50%;display:grid;place-items:center;font-size:.8em;color:var(--f1,#0f2b5b);background:radial-gradient(circle at 30% 25%,#f0d78c,#c9a24a);box-shadow:0 0 0 2px #fff6,0 0 .9em .15em #f0d78caa;animation:fpulse 2.4s ease-in-out infinite}
@keyframes fpulse{0%,100%{transform:scale(1)}50%{transform:scale(1.14)}}
@media (prefers-reduced-motion:reduce){.ph-fest .pn,.ph-fest i.sp,.ph-fest b.cf,.ph-fcard::before,#futaPhoneBtn.fest::after{animation:none!important}.ph-fest b.cf{display:none}.ph-fest i.sp{opacity:.7}}`;
  const sty = document.createElement('style'); sty.textContent = css; sh.appendChild(sty);

  const screen = sh.querySelector('.ph-screen'), view = sh.querySelector('.ph-view'), btn = sh.querySelector('#futaPhoneBtn'), root = sh.querySelector('#futaPhone');
  const fest = document.createElement('div'); fest.className = 'ph-fest'; fest.setAttribute('aria-hidden', 'true'); view.parentNode.insertBefore(fest, view.nextSibling);
  const NS = 'http://www.w3.org/2000/svg';
  const R = (n) => { let s = n * 9301 + 49297; return () => ((s = (s * 9301 + 49297) % 233280) / 233280); };   // tiny seeded random: the same garland every time

  function garland(colors) {
    const W = 360, svg = document.createElementNS(NS, 'svg'); svg.setAttribute('class', 'gar'); svg.setAttribute('viewBox', '0 0 ' + W + ' 46'); svg.setAttribute('preserveAspectRatio', 'none');
    const swags = [[-4, 0, 180, 20, 364, 0]];   // one gentle sag from edge to edge, with the string drawn as a quadratic curve
    const path = document.createElementNS(NS, 'path'); path.setAttribute('d', 'M-4 2 Q180 30 364 2'); path.setAttribute('fill', 'none'); path.setAttribute('stroke', colors[1]); path.setAttribute('stroke-width', '1.6'); svg.appendChild(path);
    const N = 15;
    for (let i = 0; i <= N; i++) {
      const t = (i + .5) / (N + 1), x = (1 - t) * (1 - t) * -4 + 2 * (1 - t) * t * 180 + t * t * 364, y = (1 - t) * (1 - t) * 2 + 2 * (1 - t) * t * 30 + t * t * 2;
      const p = document.createElementNS(NS, 'path'); p.setAttribute('d', 'M' + (x - 8) + ' ' + y + 'H' + (x + 8) + 'L' + x + ' ' + (y + 16) + 'Z'); p.setAttribute('class', 'pn');
      p.setAttribute('fill', colors[i % colors.length === 1 ? 2 : i % colors.length]); p.setAttribute('stroke', 'rgba(0,0,0,.22)'); p.setAttribute('stroke-width', '.6'); p.style.animationDelay = (-(i % 7) * .45) + 's'; svg.appendChild(p);
      if (i % 3 === 1) { const c = document.createElementNS(NS, 'circle'); c.setAttribute('cx', x); c.setAttribute('cy', y + 20); c.setAttribute('r', 2.3); c.setAttribute('fill', colors[1]); svg.appendChild(c); }
    }
    return svg;
  }
  function build(t) {
    fest.innerHTML = ''; const rnd = R(7), cols = t.colors;
    ['glow', 'glow2'].forEach(c => { const d = document.createElement('div'); d.className = c; fest.appendChild(d); });
    fest.appendChild(garland(cols));
    for (let i = 0; i < 16; i++) { const s = document.createElement('i'); s.className = 'sp'; s.style.left = (6 + rnd() * 88) + '%'; s.style.top = (8 + rnd() * 70) + '%'; s.style.animationDelay = (rnd() * 3.2) + 's'; s.style.animationDuration = (2.4 + rnd() * 2.2) + 's'; fest.appendChild(s); }
    for (let i = 0; i < 18; i++) { const c = document.createElement('b'); c.className = 'cf'; c.style.left = (rnd() * 100) + '%'; c.style.background = cols[1 + (i % (cols.length - 1))]; c.style.animationDuration = (7 + rnd() * 6) + 's'; c.style.animationDelay = (-rnd() * 12) + 's'; c.style.setProperty('--dx', ((rnd() - .5) * 3).toFixed(2) + 'em'); c.style.setProperty('--r', (360 + rnd() * 540 | 0) + 'deg'); c.style.height = (.5 + rnd() * .5) + 'em'; fest.appendChild(c); }
  }
  function vars(t) { const c = t.colors, s = root.style; s.setProperty('--f1', c[0]); s.setProperty('--f2', c[1]); s.setProperty('--f3', c[2]); s.setProperty('--f4', c[3]); s.setProperty('--f5', c[4]); s.setProperty('--fg', t.glow); if (btn) btn.style.setProperty('--f1', c[0]); }

  /* the ribbon card on the home screen (renderHome rebuilds the home screen, so phone.js calls UI.home(homeEl) after each render) */
  function card(homeEl) {
    if (!homeEl) return; const old = homeEl.querySelector('.ph-fcard'); if (old) old.remove();
    const s = C.state; if (!s.on) return;
    const d = document.createElement('div'); d.className = 'ph-fcard'; d.setAttribute('role', 'status');
    const md = document.createElement('div'); md.className = 'md'; md.textContent = s.theme.icon;
    const tx = document.createElement('div'); tx.className = 'tx'; const b = document.createElement('b'); b.textContent = s.title; const sp = document.createElement('span'); sp.textContent = s.message; tx.append(b, sp);
    const left = C.leftText(s.endsAt); if (left) { const sm = document.createElement('small'); sm.textContent = left; tx.appendChild(sm); }
    d.append(md, tx); const anchor = homeEl.querySelector('.ph-card'); homeEl.insertBefore(d, anchor || homeEl.querySelector('.ph-grid'));
  }
  function welcome(s) {   // one friendly toast per event per day
    const key = 'futa.cel.toast.' + s.event, day = new Date().toDateString(); try { if (localStorage.getItem(key) === day) return; localStorage.setItem(key, day); } catch (e) { }
    P.toast(s.theme.icon + ' ' + s.title + ' is on. Enjoy the celebration!');
  }
  let wasOn = false;
  const UI = g.FutaCelebrateUI = { home: card };
  C.onChange(s => {
    const homeEl = sh.querySelector('.ph-home');
    if (s.on) { vars(s.theme); build(s.theme); fest.classList.add('on'); if (btn) btn.classList.add('fest'); card(homeEl); if (!wasOn) { const rootEl = sh.querySelector('#futaPhone'); const f = () => welcome(s); if (rootEl && rootEl.getAttribute('aria-hidden') === 'false') f(); else { const mo = new MutationObserver(() => { if (rootEl.getAttribute('aria-hidden') === 'false') { mo.disconnect(); f(); } }); mo.observe(rootEl, { attributes: true, attributeFilter: ['aria-hidden'] }); } } }
    else { fest.classList.remove('on'); if (btn) btn.classList.remove('fest'); card(homeEl); setTimeout(() => { if (!C.state.on) fest.innerHTML = ''; }, 700); }
    wasOn = s.on;
  });
})(window);
