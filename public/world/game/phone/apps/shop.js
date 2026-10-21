/* Shared "marketplace" screen used by the Property, Cars, Clothes and Accessories apps.
   FutaPhone.shopApp({id,name,icon,color,tagline,categories,searchHint}) returns an app definition.
   TODO (later): replace the placeholder cards by real listings. Prices, fees and ownership MUST be decided by the server (see docs/PAYMENTS.md);
   put the loading code inside  mount()  below (search for "LISTINGS HOOK"). */
(function (g) {
  'use strict';
  const Ph = g.FutaPhone; if (!Ph) return;
  Ph.shopApp = function (cfg) {
    return {
      id: cfg.id, name: cfg.name, title: cfg.title || cfg.name, icon: cfg.icon, color: cfg.color,
      mount(body, ctx) {
        const esc = ctx.esc, ic = ctx.icons[cfg.icon] || '';
        body.innerHTML =
          '<div class="ph-hero" style="--c1:' + cfg.color[0] + ';--c2:' + cfg.color[1] + '"><h3>' + esc(cfg.name) + '</h3><p>' + esc(cfg.tagline) + '</p><span class="ph-soon">Opening soon</span></div>' +
          '<div class="ph-chips">' + cfg.categories.map((c, i) => '<button type="button" class="ph-chip' + (i === 0 ? ' on' : '') + '">' + esc(c) + '</button>').join('') + '</div>' +
          '<label class="ph-search"><span style="width:1.1em;height:1.1em;display:inline-flex;stroke:#9a927d;fill:none;stroke-width:2">' + ctx.icons.search + '</span><input type="search" placeholder="' + esc(cfg.searchHint) + '" aria-label="Search"></label>' +
          '<div class="ph-cards">' + [0, 1, 2, 3].map(() => '<div class="ph-prod"><div class="im" style="stroke:#b9ad87">' + ic.replace('<svg', '<svg fill="none" stroke="currentColor"') + '</div><div class="tx"><i></i><i></i></div></div>').join('') + '</div>' +
          '<p class="ph-note">Listings will appear here when the ' + esc(cfg.name.toLowerCase()) + ' market opens in FUTAlife.</p>';
        const chips = body.querySelectorAll('.ph-chip'); chips.forEach(c => c.onclick = () => { chips.forEach(x => x.classList.toggle('on', x === c)); /* LISTINGS HOOK: filter by category here */ });
        body.querySelector('input').addEventListener('input', () => { /* LISTINGS HOOK: search here */ });
      }
    };
  };
})(window);
