/* ==========================================================================
   FutaSplash — the classic "entering a building" screen. ~4 KB, no images to wait for except the tiny logo.
   Used twice, so the hand-over looks like ONE screen:
     1. the map page (hook.js) fades it in the moment the player taps Enter, then navigates;
     2. interior.html paints it instantly and fills the bar as the real scripts load.
   API:  const s = FutaSplash.show({ name, type, fade });   s.set(pct, 'message');   s.hide();   s.fail(html);
   ========================================================================== */
(function (g) {
  'use strict';
  if (g.FutaSplash) return;

  /* what we say about each kind of place (matched on the building name first, then its type) */
  const KINDS = [
    [/library/i, '📚', 'Library', 'Quiet shelves and long reading tables'],
    [/hostel|hall\b|jibowu|abiola|akande|adeniyi|balogun|akindeko/i, '🛏️', 'Student residence', 'Home away from home'],
    [/lecture|^lt\s?\d|\blt\d|auditorium|theatre|etf|three-in-one|1000-capacity/i, '🎓', 'Lecture venue', 'Take your seat — class is about to begin'],
    [/health|clinic|pharmacy/i, '⚕️', 'Health services', 'Care and calm'],
    [/chapel|mosque|church/i, '⛪', 'Place of worship', 'A moment of stillness'],
    [/gym|sport|table tennis|chess|grandstand/i, '⚽', 'Sports & recreation', 'Warm up and play'],
    [/bookshop|shop|shammall|complex|print|store|market/i, '🛍️', 'Campus shop', 'Everything you need, close by'],
    [/chikini|cakes|food|restaurant|cafe|cafeteria|canteen/i, '🍽️', 'Food outlet', 'Fresh and hot'],
    [/bank|atm/i, '🏦', 'FUTA Bank', 'Safe, simple banking'],
    [/senate|alumni|admin|registry|office|bursary/i, '🏛️', 'Administration', 'Official business'],
    [/school of|^s(aat|eet|et|ls|oc)\b|computer|ict|lab|faculty|postgraduate/i, '🔬', 'Academic school', 'Where ideas get built'],
    [/student union|hilltop|awolowo/i, '💬', 'Student life', 'Meet, talk and gather']
  ];
  const TIPS = ['Tap the floor to walk', 'Tap glowing objects to use them', 'Tap people to say hello', 'Drag to look around'];
  const kindOf = (name, type) => {
    for (const k of KINDS) if (k[0].test(name || '')) return k;
    for (const k of KINDS) if (k[0].test(type || '')) return k;
    return [null, '🏢', 'Campus building', 'Step inside'];
  };
  const esc = (t) => String(t == null ? '' : t).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

  const CSS = '#fSplash{position:fixed;inset:0;z-index:2147483000;display:flex;align-items:center;justify-content:center;background:radial-gradient(120% 90% at 50% 38%,#17284f 0%,#0b1226 58%,#05080f 100%);color:#f4ecd6;font-family:Georgia,"Iowan Old Style","Palatino Linotype",serif;opacity:1;transition:opacity .45s ease;-webkit-user-select:none;user-select:none;padding:env(safe-area-inset-top) 0 env(safe-area-inset-bottom)}' +
    '#fSplash.fx{opacity:0}#fSplash.out{opacity:0;pointer-events:none}' +
    '#fSplash .fr{position:absolute;inset:14px;border:1px solid rgba(201,162,74,.55);border-radius:6px;pointer-events:none}#fSplash .fr::after{content:"";position:absolute;inset:5px;border:1px solid rgba(201,162,74,.22);border-radius:3px}' +
    '#fSplash .bx{position:relative;width:min(86vw,380px);text-align:center;animation:fsRise .7s ease-out both}' +
    '#fSplash .lg{width:68px;height:68px;margin:0 auto 14px;border-radius:50%;padding:5px;background:linear-gradient(145deg,#e6c46a,#9c7a2c);box-shadow:0 6px 22px rgba(0,0,0,.5)}#fSplash .lg img{width:100%;height:100%;display:block;border-radius:50%;background:#12392a}' +
    '#fSplash .br{font:600 11px/1 system-ui,sans-serif;letter-spacing:.34em;text-transform:uppercase;color:#c9a24a}' +
    '#fSplash .orn{display:flex;align-items:center;justify-content:center;gap:10px;margin:16px 0 14px;color:#c9a24a;font-size:12px}#fSplash .orn i{display:block;height:1px;width:56px;background:linear-gradient(90deg,transparent,#c9a24a)}#fSplash .orn i:last-child{transform:scaleX(-1)}' +
    '#fSplash .ic{font-size:34px;line-height:1;margin-bottom:10px;filter:drop-shadow(0 3px 6px rgba(0,0,0,.5))}' +
    '#fSplash h1{margin:0;font-size:clamp(22px,6.4vw,30px);font-weight:600;line-height:1.2;letter-spacing:.015em;text-wrap:balance}' +
    '#fSplash .kd{margin:8px 0 0;font:600 11px/1.3 system-ui,sans-serif;letter-spacing:.2em;text-transform:uppercase;color:#a9b4cf}' +
    '#fSplash .tg{margin:6px 0 0;font-style:italic;font-size:15px;color:#d9d2bd}' +
    '#fSplash .pb{margin:26px auto 0;width:min(70vw,260px);height:4px;border-radius:4px;background:rgba(255,255,255,.12);overflow:hidden}#fSplash .pb i{display:block;height:100%;width:100%;transform:scaleX(0);transform-origin:left;background:linear-gradient(90deg,#9c7a2c,#f0d58a);border-radius:4px}' +
    '#fSplash .st{display:flex;justify-content:space-between;width:min(70vw,260px);margin:9px auto 0;font:12px system-ui,sans-serif;color:#aab3c8;letter-spacing:.03em}#fSplash .st b{font-weight:600;color:#f0d58a;font-variant-numeric:tabular-nums}' +
    '#fSplash .tp{margin:22px 0 0;font:12px system-ui,sans-serif;color:#7f8aa6;letter-spacing:.04em;min-height:16px;transition:opacity .4s}' +
    '#fSplash .er{margin-top:18px;font:14px system-ui,sans-serif;color:#f5c9c0}#fSplash .er a{color:#f0d58a}' +
    '@keyframes fsRise{from{opacity:0;transform:translateY(12px)}to{opacity:1;transform:none}}' +
    '@media(prefers-reduced-motion:reduce){#fSplash .bx{animation:none}#fSplash{transition:none}}';

  g.FutaSplash = {
    show(o) {
      o = o || {};
      const old = document.getElementById('fSplash'); if (old) old.remove();
      if (!document.getElementById('fSplashCss')) { const st = document.createElement('style'); st.id = 'fSplashCss'; st.textContent = CSS; (document.head || document.documentElement).appendChild(st); }
      const k = kindOf(o.name, o.type), name = o.name || k[2];
      const root = document.createElement('div'); root.id = 'fSplash'; root.setAttribute('role', 'status'); root.setAttribute('aria-live', 'polite');
      root.innerHTML = '<div class="fr"></div><div class="bx"><div class="lg"><img src="/brand/favicon.svg" alt="" width="58" height="58"></div><div class="br">FUTAlife</div><div class="orn"><i></i>✦<i></i></div>' +
        '<div class="ic">' + k[1] + '</div><h1>' + esc(name) + '</h1><div class="kd">' + esc(k[2]) + '</div><div class="tg">' + esc(k[3]) + '</div>' +
        '<div class="pb"><i></i></div><div class="st"><span data-m>Opening the doors…</span><b data-p>0%</b></div><div class="tp" data-t>' + TIPS[0] + '</div></div>';
      if (o.fade) root.classList.add('fx');
      (document.body || document.documentElement).appendChild(root);
      if (o.fade) requestAnimationFrame(() => requestAnimationFrame(() => root.classList.remove('fx')));

      const bar = root.querySelector('.pb i'), pEl = root.querySelector('[data-p]'), mEl = root.querySelector('[data-m]'), tEl = root.querySelector('[data-t]');
      let shown = 0, target = 0, raf = 0, ti = 0, dead = false;
      const tick = () => {   // the bar eases toward the target so it never jumps, and never reaches 100 until done
        shown += (target - shown) * .14; if (target - shown < .08) shown = target;
        bar.style.transform = 'scaleX(' + (shown / 100).toFixed(3) + ')'; pEl.textContent = Math.round(shown) + '%';
        if (!dead && shown < target) raf = requestAnimationFrame(tick); else raf = 0;
      };
      const tipT = setInterval(() => { ti = (ti + 1) % TIPS.length; tEl.style.opacity = 0; setTimeout(() => { tEl.textContent = TIPS[ti]; tEl.style.opacity = 1; }, 380); }, 2600);
      const api = {
        el: root,
        set(pct, msg) { target = Math.max(target, Math.min(100, pct)); if (msg) mEl.textContent = msg; if (!raf) raf = requestAnimationFrame(tick); return api; },
        hide() { dead = true; clearInterval(tipT); target = 100; bar.style.transform = 'scaleX(1)'; pEl.textContent = '100%'; mEl.textContent = 'Welcome in'; setTimeout(() => { root.classList.add('out'); setTimeout(() => root.remove(), 520); }, 220); },
        fail(html) { dead = true; clearInterval(tipT); root.querySelector('.pb').style.display = root.querySelector('.st').style.display = root.querySelector('.tp').style.display = 'none'; const e = document.createElement('div'); e.className = 'er'; e.innerHTML = html; root.querySelector('.bx').appendChild(e); }
      };
      return api;
    }
  };
})(window);
