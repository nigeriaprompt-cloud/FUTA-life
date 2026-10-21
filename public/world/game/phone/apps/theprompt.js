/* Phone app: The Prompt — opens https://theprompt.org.ng INSIDE the phone, so the player stays where they are (map or building) and browses the site there.
   HOW: an <iframe> fills the app. The iframe is sandboxed WITHOUT "allow-top-navigation", so a link on the site can never take over the game's tab; links that open a new
   tab (target=_blank) still work. A slim bar on top has Reload and "Open in browser" (new tab).
   IF THE PAGE STAYS BLANK: the site itself is refusing to be shown inside another page (its server sends X-Frame-Options or a Content-Security-Policy "frame-ancestors").
   Fix on the SITE, not here: allow the game's address in frame-ancestors (and remove X-Frame-Options). Until then, "Open in browser" still works.
   LOGO: the SVG below (white chat bubble + green T on a WhatsApp-green tile). To use the real logo file instead, replace ICON with an <svg> or <img> string.
   DEEP LINKS: Ph.open('theprompt', { url: 'https://theprompt.org.ng/store/mama-put' }) opens that page (only addresses on the site itself are accepted).
   The home-screen advert card (phone/prompt-ads.js) uses this.
   BACK BUTTON: the site pages send a tiny "where am I" message (site file assets/js/embed.js). The phone keeps a trail of pages, so Back goes to the
   previous page of the site first and only leaves the app from the first page. If a page has no embed.js, Back still works (it reloads the previous
   address after a short wait); if the site has none at all, Back simply leaves the app like before.
   To change the address: edit SITE only. */
(function (g) {
  'use strict';
  const Ph = g.FutaPhone; if (!Ph) return;
  const SITE = 'https://theprompt.org.ng', HOST = 'theprompt.org.ng';
  const ICON = '<svg viewBox="0 0 24 24" aria-hidden="true" style="width:3em;height:3em"><path d="M5 2.8h14a3.2 3.2 0 0 1 3.2 3.2v9.1a3.2 3.2 0 0 1-3.2 3.2h-8.6L5.2 22v-3.7H5a3.2 3.2 0 0 1-3.2-3.2V6A3.2 3.2 0 0 1 5 2.8z" fill="#fff" stroke="none"/><path d="M7.3 6.9h9.4v2.5h-3.5v6.3h-2.4V9.4H7.3z" fill="#128C7E" stroke="none"/></svg>';
  const ok = (u) => { try { const x = new URL(u); return x.protocol === 'https:' && x.host === HOST ? x.href : ''; } catch (e) { return ''; } };   // only the site itself, over https
  Ph.registerApp({
    id: 'theprompt', name: 'The Prompt', icon: ICON, color: ['#25D366', '#128C7E'],
    mount(body, ctx) {
      const el = ctx.el; ctx.setTitle('The Prompt');
      const first = ok(ctx.opts && ctx.opts.url) || SITE + '/';
      const trail = [first];                                  // pages visited in this app, newest last
      const cur = () => trail[trail.length - 1];
      const bar = el('div'); bar.style.cssText = 'flex:none;display:flex;align-items:center;gap:.5em;padding:.45em .7em;background:#fff;border-bottom:1px solid #0001';
      const lab = el('span'); lab.style.cssText = 'flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-weight:600;color:#128C7E';
      const paintLab = () => { let p = ''; try { const u = new URL(cur()); p = u.pathname === '/' ? '' : u.pathname; } catch (e) { /* host only */ } lab.textContent = HOST + p; };
      const mk = (txt, title, fn) => { const b = el('button'); b.type = 'button'; b.textContent = txt; b.title = title; b.setAttribute('aria-label', title); b.style.cssText = 'flex:none;min-width:2.4em;height:2.4em;border-radius:1.2em;border:1px solid #0002;background:#f4faf6;font-size:1em;cursor:pointer'; b.onclick = fn; return b; };
      const frame = el('iframe'); frame.title = 'The Prompt'; frame.referrerPolicy = 'strict-origin-when-cross-origin';
      frame.setAttribute('sandbox', 'allow-scripts allow-same-origin allow-forms allow-popups allow-popups-to-escape-sandbox allow-downloads allow-modals');   // no allow-top-navigation: the site cannot navigate the game away
      frame.setAttribute('allow', 'clipboard-write'); frame.style.cssText = 'flex:1 1 auto;min-height:0;width:100%;border:0;background:#fff';
      const home = mk('⌂', 'The Prompt home', () => { trail.length = 0; trail.push(SITE + '/'); paintLab(); frame.src = SITE + '/'; });
      bar.append(lab, home, mk('↻', 'Reload', () => { frame.src = cur(); }), mk('↗', 'Open in browser', () => { g.open(cur(), '_blank', 'noopener'); }));
      const hint = el('p'); hint.textContent = 'Blank page? Tap ↗ to open it in your browser.'; hint.style.cssText = 'flex:none;margin:0;padding:.25em .8em;font-size:.8em;color:#5b6b63;background:#f4faf6';
      frame.addEventListener('load', () => { hint.style.display = 'none'; });

      /* the site tells us each page it shows (assets/js/embed.js) */
      let waitBack = null;
      const onMsg = (e) => {
        if (e.source !== frame.contentWindow || e.origin !== SITE) return;
        const m = e.data; if (!m || m.src !== 'theprompt' || m.type !== 'nav') return; const u = ok(m.url); if (!u) return;
        if (waitBack) { clearTimeout(waitBack); waitBack = null; }
        if (trail.length > 1 && trail[trail.length - 2] === u) trail.pop();          // went back
        else if (cur() !== u) trail.push(u);                                           // went forward
        if (trail.length > 40) trail.shift();
        hint.style.display = 'none'; paintLab();
      };
      g.addEventListener('message', onMsg);
      body.style.padding = '0'; body.append(bar, frame, hint); paintLab(); frame.src = first;
      return {
        back() {
          if (trail.length < 2) return false;                                          // first page: let the phone leave the app
          const prev = trail[trail.length - 2];
          try { frame.contentWindow.postMessage({ src: 'futa', type: 'back' }, SITE); } catch (e) { /* fall through to the timer */ }
          if (waitBack) clearTimeout(waitBack);
          waitBack = setTimeout(() => { waitBack = null; trail.pop(); paintLab(); frame.src = prev; }, 900);   // that page did not answer: load the previous address ourselves
          return true;
        },
        destroy() { g.removeEventListener('message', onMsg); if (waitBack) clearTimeout(waitBack); try { frame.src = 'about:blank'; } catch (e) { /* closing anyway */ } }
      };
    }
  });
})(typeof window !== 'undefined' ? window : globalThis);
