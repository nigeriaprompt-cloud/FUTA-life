/* The Prompt advert card — a small swipeable strip of 4 items (food combos + products) on the phone HOME screen,
   between the apps and the FUTAlife WhatsApp card.

   WHERE THE ITEMS COME FROM: the website's own Homepage Campaigns (Admin > Campaigns). Whatever campaign you switch on there is what shows here.
   No active campaign, site unreachable, or anything odd  =>  the card stays HIDDEN (it never shows fake or placeholder items).
   The data comes from  <site>/feed/phone_ads.php  (read-only JSON, only the game's address is allowed to read it).

   WHEN A PLAYER TAPS AN ITEM: it opens INSIDE the phone's The Prompt app (restaurant store with cart for food, product page with the
   "Order on WhatsApp" button for products). "See all" opens the full campaign page the same way.

   Called by phone.js:  FutaPromptAds.home(homeEl)  after the apps are drawn and BEFORE the WhatsApp card, so the order on screen is
   clock -> apps -> advert -> WhatsApp card.  Change the address with  window.FUTA_PROMPT_ADS = { api: '...' }  before phone.js loads. */
(function (g) {
  'use strict';
  const doc = g.document; if (!doc) return;
  const CFG = Object.assign({ api: 'https://theprompt.org.ng/feed/phone_ads.php', ttlMs: 120000, refreshMs: 300000 }, g.FUTA_PROMPT_ADS || {});
  let HOST = 'theprompt.org.ng'; try { HOST = new URL(CFG.api).host; } catch (e) { /* keep default */ }

  /* only addresses on the site itself are ever opened or shown */
  const safeUrl = (u) => { try { const x = new URL(u); return x.protocol === 'https:' && x.host === HOST ? x.href : ''; } catch (e) { return ''; } };
  const el = (t, c, txt) => { const n = doc.createElement(t); if (c) n.className = c; if (txt != null) n.textContent = txt; return n; };

  const CSS = [
    '.pa-home{margin:.2em 0 .6em;padding:.7em 0 .75em;border-radius:1.2em;color:#fff;background:linear-gradient(135deg,rgba(255,255,255,.17),rgba(255,255,255,.06));',
    '-webkit-backdrop-filter:blur(14px);backdrop-filter:blur(14px);border:1px solid rgba(240,215,140,.5);box-shadow:0 .5em 1.4em rgba(0,0,0,.22),inset 0 1px 0 rgba(255,255,255,.18)}',
    '.pa-home[hidden]{display:none}',
    '.pa-head{display:flex;align-items:center;gap:.6em;padding:0 .8em .6em}',
    '.pa-logo{flex:none;width:2.1em;height:2.1em;border-radius:.6em;display:grid;place-items:center;background:linear-gradient(135deg,#25D366,#128C7E);box-shadow:0 .15em .4em rgba(0,0,0,.3)}',
    '.pa-logo svg{width:1.5em;height:1.5em}',
    '.pa-tx{flex:1;min-width:0}.pa-tx b{display:block;font:700 1.02em/1.15 Georgia,"Iowan Old Style",serif;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}',
    '.pa-tx small{display:block;margin-top:.15em;font-size:.76em;opacity:.78;line-height:1.2;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}',
    '.pa-all{flex:none;padding:.42em .85em;border:0;border-radius:999px;font:700 .76em system-ui,sans-serif;color:var(--emerald,#12392a);cursor:pointer;',
    'background:linear-gradient(180deg,var(--gold2,#f0d78c),var(--gold,#c9a24a));box-shadow:0 .15em .5em rgba(0,0,0,.25)}',
    '.pa-strip{display:flex;gap:.6em;overflow-x:auto;scroll-snap-type:x mandatory;padding:0 .8em .15em;scrollbar-width:none;-webkit-overflow-scrolling:touch}.pa-strip::-webkit-scrollbar{display:none}',
    '.pa-item{flex:none;width:7.4em;scroll-snap-align:start;text-align:left;padding:0;border:1px solid rgba(255,255,255,.14);border-radius:1em;overflow:hidden;cursor:pointer;color:#fff;font:inherit;background:rgba(0,0,0,.26)}',
    '.pa-item:active{transform:scale(.97)}',
    '.pa-ph{position:relative;height:4.4em;background:linear-gradient(135deg,#2d7a57,#12392a);display:grid;place-items:center;font-size:1.9em;overflow:hidden}',
    '.pa-ph img{position:absolute;inset:0;width:100%;height:100%;object-fit:cover;display:block}',
    '.pa-tag{position:absolute;left:.4em;top:.4em;z-index:1;padding:.15em .55em;border-radius:999px;font:700 .36em/1.4 system-ui,sans-serif;letter-spacing:.04em;text-transform:uppercase;color:#12392a;background:#f0d78c}',
    '.pa-bd{padding:.5em .6em .6em}.pa-nm{display:-webkit-box;-webkit-box-orient:vertical;-webkit-line-clamp:2;line-clamp:2;min-height:2.4em;font-weight:700;font-size:.8em;line-height:1.2;overflow:hidden}',
    '.pa-pr{display:block;margin-top:.2em;font:700 1.02em Georgia,serif;color:var(--gold2,#f0d78c)}',
    '.pa-st{display:block;margin-top:.1em;font-size:.7em;opacity:.72;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}',
    '.pa-dots{display:flex;justify-content:center;gap:.35em;padding:.55em 0 0}.pa-dots i{width:.42em;height:.42em;border-radius:50%;background:rgba(255,255,255,.3);transition:background .2s,transform .2s}.pa-dots i.on{background:var(--gold2,#f0d78c);transform:scale(1.25)}',
    '@media (prefers-reduced-motion:reduce){.pa-item:active{transform:none}}'
  ].join('');

  const LOGO = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 2.8h14a3.2 3.2 0 0 1 3.2 3.2v9.1a3.2 3.2 0 0 1-3.2 3.2h-8.6L5.2 22v-3.7H5a3.2 3.2 0 0 1-3.2-3.2V6A3.2 3.2 0 0 1 5 2.8z" fill="#fff"/><path d="M7.3 6.9h9.4v2.5h-3.5v6.3h-2.4V9.4H7.3z" fill="#128C7E"/></svg>';

  /* ---- data: one small request, reused for a couple of minutes ---- */
  let cache = null, cacheAt = 0, inflight = null;
  function load() {
    if (cache && Date.now() - cacheAt < CFG.ttlMs) return Promise.resolve(cache);
    if (inflight) return inflight;
    const ctl = typeof AbortController === 'function' ? new AbortController() : null; const t = ctl && setTimeout(() => ctl.abort(), 8000);
    inflight = fetch(CFG.api, { mode: 'cors', credentials: 'omit', signal: ctl ? ctl.signal : undefined })
      .then(r => { if (!r.ok) throw new Error('http ' + r.status); return r.json(); })
      .then(j => { cache = clean(j); cacheAt = Date.now(); return cache; })
      .catch(() => { cache = null; return null; })               // any problem = no card
      .then(v => { if (t) clearTimeout(t); inflight = null; return v; });
    return inflight;
  }
  /* trust nothing: keep only the fields we draw, and only site addresses */
  function clean(j) {
    if (!j || j.active !== true || !Array.isArray(j.items)) return null;
    const items = j.items.slice(0, 6).map(i => ({
      name: String(i.name || '').slice(0, 80), price: String(i.price_txt || '').slice(0, 20), store: String(i.store || '').slice(0, 50),
      kind: i.kind === 'food' ? 'food' : 'product', image: safeUrl(i.image), url: safeUrl(i.url)
    })).filter(i => i.name && i.url);
    if (!items.length) return null;
    const c = j.campaign || {};
    return { title: String(c.title || 'Campus deals').slice(0, 60), subtitle: String(c.subtitle || '').slice(0, 90), items, seeAll: safeUrl(j.see_all) };
  }

  /* ---- drawing ---- */
  function openIn(url) { const P = g.FutaPhone; if (P && url) P.open('theprompt', { url }); }
  function item(i) {
    const b = el('button', 'pa-item'); b.type = 'button'; b.setAttribute('aria-label', i.name + (i.price ? ', ' + i.price : '') + (i.store ? ', from ' + i.store : ''));
    const ph = el('div', 'pa-ph'); ph.append(i.kind === 'food' ? '🍽️' : '🛍️');
    if (i.image) { const im = el('img'); im.alt = ''; im.loading = 'lazy'; im.referrerPolicy = 'strict-origin-when-cross-origin'; im.onerror = () => im.remove(); im.src = i.image; ph.appendChild(im); }   // no photo / blocked = the emoji tile stays
    if (i.kind === 'food') ph.appendChild(el('span', 'pa-tag', 'Food'));
    const bd = el('div', 'pa-bd'); bd.append(el('span', 'pa-nm', i.name), el('span', 'pa-pr', i.price)); if (i.store) bd.appendChild(el('span', 'pa-st', i.store));
    b.append(ph, bd); b.onclick = () => openIn(i.url); return b;
  }
  function paint(box, d) {
    box.textContent = ''; box.appendChild(el('style', '', CSS));
    const head = el('div', 'pa-head'); const logo = el('span', 'pa-logo'); logo.innerHTML = LOGO;
    const tx = el('span', 'pa-tx'); tx.append(el('b', '', d.title), el('small', '', d.subtitle || 'Deals from The Prompt sellers'));
    head.append(logo, tx);
    if (d.seeAll) { const all = el('button', 'pa-all', 'See all'); all.type = 'button'; all.onclick = () => openIn(d.seeAll); head.appendChild(all); }
    const strip = el('div', 'pa-strip'); strip.setAttribute('role', 'list'); d.items.forEach(i => strip.appendChild(item(i)));
    const dots = el('div', 'pa-dots'); dots.setAttribute('aria-hidden', 'true'); d.items.forEach((_, n) => dots.appendChild(el('i', n === 0 ? 'on' : '')));
    strip.addEventListener('scroll', () => { const w = strip.firstElementChild ? strip.firstElementChild.offsetWidth + 6 : 1; const k = Math.min(d.items.length - 1, Math.round(strip.scrollLeft / w)); [...dots.children].forEach((x, n) => x.classList.toggle('on', n === k)); }, { passive: true });
    box.append(head, strip); if (d.items.length > 2) box.appendChild(dots);
    box.hidden = false;
  }

  let last = null;
  function home(homeEl) {
    if (!homeEl) return; last = homeEl;
    homeEl.querySelectorAll('.pa-home').forEach(n => n.remove());
    const box = el('section', 'pa-home'); box.hidden = true; box.setAttribute('aria-label', 'The Prompt deals'); homeEl.appendChild(box);   // placed now (keeps the order), filled when the data arrives
    load().then(d => { if (d && box.isConnected) paint(box, d); });
  }
  /* quiet refresh while the phone sits on the home screen */
  setInterval(() => { if (last && last.isConnected && !doc.hidden && !last.closest('.in-app')) { cache = null; const old = last.querySelector('.pa-home'); if (old) load().then(d => { if (!old.isConnected) return; if (d) paint(old, d); else old.hidden = true; }); } }, CFG.refreshMs);

  g.FutaPromptAds = { home, reload: () => { cache = null; return load(); }, config: CFG };
})(typeof window !== 'undefined' ? window : globalThis);
