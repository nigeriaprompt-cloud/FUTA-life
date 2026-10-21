/* Phone app: Accessories — buy and own watches, bags, shades and jewellery with GAME money, LEVEL BY LEVEL (5 levels).
   Level 1 is open. To unlock level N you must own one accessory of level N-1 (the server checks this: supabase/08_accessories.sql).
   Accessories do NOT earn income (they are for style). Cheapest item costs 50,000 coins (check constraint in 08_accessories.sql).
   Real mode: prices/ownership are read from acc_catalog / acc_owned (RLS) and written ONLY through the RPC buy_accessory.
   Demo mode (no Supabase keys): a pretend wallet and collection kept in memory so you can try every level.
   LISTINGS below holds text + picture type; to add or edit an item change it here AND in 08_accessories.sql (same id). The "slot/look" fields name
   the avatar slot (wrist/bag/glasses/ears/neck) and option id in avatar-options.json, ready for a later "Wear it" feature (not built yet).
   NAMES: items use real brand and model names (e.g. Casio G-Shock, Rolex, Toyota, Mercedes-Benz). Only the text names are real; pictures are our own generic drawings, never logos. Brand names are trademarks of their owners:
   check with a lawyer before real-money sales or public launch, and rename here (text only, ids/prices stay) if needed.
   Pictures are drawn in code (SVG, no image files). All text goes in with textContent. */
(function (g) {
  'use strict';
  const Ph = g.FutaPhone; if (!Ph) return;

  const LEVELS = [
    { n: 1, name: 'Starter', tag: 'Everyday pieces to start your collection', bg: ['#f1e7cf', '#d8c9a3'] },
    { n: 2, name: 'Classic', tag: 'Steel, leather and brass with real polish', bg: ['#efe0b8', '#c9b27a'] },
    { n: 3, name: 'Statement', tag: 'Chronographs, aviators and gold plate', bg: ['#e9cf8e', '#b8944a'] },
    { n: 4, name: 'Designer', tag: 'Rose gold, designer labels, heads will turn', bg: ['#3b2b4f', '#7a5a2a'] },
    { n: 5, name: 'Royal', tag: 'Diamonds, crocodile leather and one-of-a-kind', bg: ['#1b1530', '#5d4a1c'] }
  ];
  const CATS = ['All', 'Watches', 'Bags', 'Shades', 'Jewellery'];
  // id, level, kind (picture), name, category, price (display only; the real price comes from the server), material, worn-on slot, colour, blurb
  const L = (id, lv, kind, name, area, price, mat, slot, col, blurb) => ({ id, lv, kind, name, area, price, mat, slot, col, blurb });
  const LISTINGS = [
    L('a1_watch', 1, 'watch', 'Casio G-Shock', 'Watches', 50000, 'Resin', 'Wrist', '#2a2d31', 'The tough one. Shock-resistant, waterproof and a campus favourite for the gym and the football pitch.'),
    L('a1_bag', 1, 'sling', 'Nike Sling Bag', 'Bags', 65000, 'Canvas', 'Shoulder', '#7a6a3a', 'Carries your phone, keys and a snack across campus. Sporty, light and always in style.'),
    L('a1_shades', 1, 'shades', 'Oakley Holbrook', 'Shades', 55000, 'Acetate', 'Face', '#1b1b1d', 'Bold dark frames that handle the Akure sun and look sharp doing it.'),
    L('a1_studs', 1, 'studs', 'Pandora Silver Studs', 'Jewellery', 60000, 'Silver', 'Ears', '#cfd3d8', 'A small silver sparkle that goes with everything you own.'),
    L('a2_watch', 2, 'watch', 'Tissot PRX', 'Watches', 250000, 'Steel', 'Wrist', '#aab2ba', 'A slim steel watch with a clean dial. Smart enough for lectures, interviews and Sunday service.'),
    L('a2_bag', 2, 'pack', 'Fossil Leather Backpack', 'Bags', 300000, 'Leather', 'Back', '#6b3e26', 'Rich brown leather, a padded laptop pocket and room for a whole semester of notes.'),
    L('a2_shades', 2, 'round', 'Ray-Ban Round Metal', 'Shades', 280000, 'Metal', 'Face', '#b08a2e', 'Thin round frames with a retro feel. The choice of the quiet creative.'),
    L('a2_bangles', 2, 'bangles', 'Alex and Ani Bangle Set', 'Jewellery', 220000, 'Brass', 'Wrist', '#c59a2c', 'Stacked bangles that ring softly when you wave hello.'),
    L('a3_watch', 3, 'watch', 'Omega Speedmaster', 'Watches', 1200000, 'Steel & leather', 'Wrist', '#2e5d8a', 'A chronograph with a real racing and space-race reputation. A watch with a story.'),
    L('a3_bag', 3, 'handbag', 'Coach Leather Satchel', 'Bags', 1500000, 'Leather', 'Hand', '#8a2f3a', 'Structured, roomy and finished in deep red leather. It says you mean business.'),
    L('a3_shades', 3, 'aviator', 'Ray-Ban Aviator', 'Shades', 1100000, 'Gold metal', 'Face', '#c9a24a', 'Classic gold-frame teardrops. They suit every face and every road trip.'),
    L('a3_chain', 3, 'chain', 'Versace Gold Chain', 'Jewellery', 1400000, 'Gold plate', 'Neck', '#d9b550', 'A heavy gold-tone chain with real presence. Wear it over a plain tee.'),
    L('a4_watch', 4, 'watch', 'Rolex Datejust', 'Watches', 6000000, 'Rose gold', 'Wrist', '#c98a73', 'The watch everybody recognises. Polished rose-gold finish and a quiet, confident tick.'),
    L('a4_bag', 4, 'tote', 'Louis Vuitton Neverfull', 'Bags', 8000000, 'Coated canvas', 'Shoulder', '#7a4a24', 'A big, famous tote you spot from across the room. Fits your whole day inside.'),
    L('a4_shades', 4, 'aviator', 'Gucci Aviator', 'Shades', 5000000, 'Titanium', 'Face', '#4a3a72', 'Feather-light frames with mirrored violet lenses and unmistakable designer style.'),
    L('a4_hoops', 4, 'hoops', 'Tiffany & Co. Gold Hoops', 'Jewellery', 7000000, '18k gold', 'Ears', '#e0b94a', 'Big, bold and polished to a mirror shine.'),
    L('a5_watch', 5, 'watch', 'Richard Mille Tourbillon', 'Watches', 40000000, 'Platinum & diamond', 'Wrist', '#d8dde3', 'A skeleton dial, a diamond-set case and a price that stops conversations. Only a handful exist.'),
    L('a5_bag', 5, 'handbag', 'Hermès Birkin Crocodile', 'Bags', 55000000, 'Crocodile leather', 'Hand', '#1f3d2e', 'The most talked-about handbag in the world, in rare crocodile leather with a gold clasp.'),
    L('a5_shades', 5, 'aviator', 'Cartier Gold Aviators', 'Shades', 30000000, '24k gold', 'Face', '#f0cf66', 'Gold frames and crystal lenses from the jeweller to royalty. Made to be remembered.'),
    L('a5_necklace', 5, 'necklace', 'Harry Winston Diamond Necklace', 'Jewellery', 90000000, 'Diamond', 'Neck', '#e8f1ff', 'A river of diamonds from the Jeweller to the Stars. The finishing touch for a Royal look.')
  ];
  const BY = Object.fromEntries(LISTINGS.map(p => [p.id, p]));
  const ERR = {
    level_locked: 'Own an accessory from the level below to unlock this one.', not_enough_money: 'You do not have enough money in that account.', already_owned: 'You already own this accessory.',
    not_signed_in: 'Sign in (Settings) first.', no_such_item: 'That accessory is not available.', bad_source: 'Pick pocket or bank.'
  };
  const say = (e) => ERR[e && e.message] || (e && e.message) || 'Something went wrong. Try again.';
  const naira = (n) => '₦' + Number(n || 0).toLocaleString('en-NG');
  const short = (n) => n >= 1e9 ? '₦' + +(n / 1e9).toFixed(2) + 'B' : n >= 1e6 ? '₦' + +(n / 1e6).toFixed(2) + 'M' : n >= 1e3 ? '₦' + +(n / 1e3).toFixed(0) + 'K' : '₦' + n;
  const h = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; };

  /* ---------------- pictures: one item on a velvet display, drawn from kind + level + colour (our own SVG, never user text) ---------------- */
  let uid = 0;
  function art(kind, lv, col) {
    const V = LEVELS[lv - 1], id = 'ac' + (++uid), dk = '#1b1b1d', dark = lv >= 4, gold = '#d9b550', glass = dark ? '#b9a6e0' : '#bcd9ea';
    const rect = (x, y, w, hh, f, ex) => '<rect x="' + x + '" y="' + y + '" width="' + w + '" height="' + hh + '" fill="' + f + '"' + (ex || '') + '/>';
    const circ = (x, y, r, f, ex) => '<circle cx="' + x + '" cy="' + y + '" r="' + r + '" fill="' + f + '"' + (ex || '') + '/>';
    const ring = (x, y, r, c, w) => '<circle cx="' + x + '" cy="' + y + '" r="' + r + '" fill="none" stroke="' + c + '" stroke-width="' + w + '"/>';
    const edge = ' stroke="' + dk + '" stroke-opacity=".4"', shadow = '<ellipse cx="160" cy="146" rx="78" ry="6" fill="#0003"/>';
    let b = shadow;
    if (kind === 'watch') {
      const dial = lv === 1 ? '#222' : '#f4f1e8', hand = lv === 1 ? '#7bf2a0' : dk;
      b += rect(146, 18, 28, 52, col, ' rx="6"' + edge) + rect(146, 100, 28, 46, col, ' rx="6"' + edge) + ring(160, 85, 40, lv >= 3 ? gold : '#8b9199', 6) + circ(160, 85, 34, dial, edge);
      if (lv === 1) b += '<text x="160" y="92" text-anchor="middle" font-size="20" font-family="monospace" fill="' + hand + '">12:45</text>';
      else {
        for (let i = 0; i < 12; i++) { const a = i * Math.PI / 6; b += '<path d="M' + (160 + 28 * Math.sin(a)) + ' ' + (85 - 28 * Math.cos(a)) + 'L' + (160 + 32 * Math.sin(a)) + ' ' + (85 - 32 * Math.cos(a)) + '" stroke="' + dk + '" stroke-width="2"/>'; }
        b += '<path d="M160 85V62M160 85L176 92" stroke="' + hand + '" stroke-width="3" stroke-linecap="round"/>';
        if (lv >= 3) b += circ(160, 70, 5, '#0002') + circ(147, 85, 5, '#0002') + circ(173, 85, 5, '#0002');
        if (lv === 5) b += [[160, 51], [182, 63], [186, 85], [182, 107], [160, 119], [138, 107], [134, 85], [138, 63]].map(p => circ(p[0], p[1], 2.4, '#fff')).join('');
      }
      b += rect(198, 80, 6, 10, col, ' rx="2"');
    } else if (kind === 'sling' || kind === 'pack') {
      const pack = kind === 'pack';
      b += (pack ? '<path d="M120 50Q160 6 200 50" fill="none" stroke="' + dk + '" stroke-width="7"/>' : '<path d="M96 62Q160 6 224 62" fill="none" stroke="' + col + '" stroke-width="9"/>') +
        '<rect x="' + (pack ? 112 : 104) + '" y="' + (pack ? 44 : 56) + '" width="' + (pack ? 96 : 112) + '" height="' + (pack ? 100 : 82) + '" rx="' + (pack ? 24 : 14) + '" fill="' + col + '"' + edge + '/>' +
        rect(pack ? 126 : 116, pack ? 92 : 94, pack ? 68 : 88, 36, '#0002', ' rx="8"') + '<path d="M' + (pack ? 112 : 104) + ' ' + (pack ? 72 : 84) + 'h' + (pack ? 96 : 112) + '" stroke="' + dk + '" stroke-opacity=".5" stroke-width="3"/>' + rect(154, pack ? 68 : 80, 12, 8, gold, ' rx="2"');
    } else if (kind === 'handbag' || kind === 'tote') {
      const tote = kind === 'tote';
      b += '<path d="M' + (tote ? 124 : 130) + ' 62Q' + (tote ? 124 : 130) + ' 16 160 16Q' + (tote ? 196 : 190) + ' 16 ' + (tote ? 196 : 190) + ' 62" fill="none" stroke="' + col + '" stroke-width="8"/>' +
        '<path d="M' + (tote ? 96 : 100) + ' 62h' + (tote ? 128 : 120) + 'l' + (tote ? 8 : 14) + ' 80h-' + (tote ? 144 : 148) + 'z" fill="' + col + '"' + edge + '/>' + '<path d="M' + (tote ? 98 : 104) + ' 80h' + (tote ? 124 : 112) + '" stroke="' + dk + '" stroke-opacity=".35" stroke-width="3"/>' + rect(150, 72, 20, 14, gold, ' rx="3"' + edge);
      if (lv === 5) b += '<path d="M104 96h112M108 112h104M112 128h96" stroke="#0003" stroke-width="2" stroke-dasharray="6 5"/>';
    } else if (kind === 'shades' || kind === 'round' || kind === 'aviator') {
      const rr = kind === 'round';
      const lens = (cx) => kind === 'aviator' ? '<path d="M' + (cx - 34) + ' 66h68q4 40-34 48q-38-8-34-48z" fill="' + glass + '" fill-opacity=".85" stroke="' + col + '" stroke-width="5" stroke-linejoin="round"/>' : rr ? circ(cx, 90, 30, glass, ' fill-opacity=".8" stroke="' + col + '" stroke-width="4"') : '<rect x="' + (cx - 34) + '" y="68" width="68" height="44" rx="12" fill="' + (dark ? '#2b2b33' : '#17171a') + '" stroke="' + col + '" stroke-width="5"/>';
      b += lens(110) + lens(210) + '<path d="M144 84q16-12 32 0" fill="none" stroke="' + col + '" stroke-width="5"/>' + '<path d="M76 80L48 70M244 80L272 70" stroke="' + col + '" stroke-width="5" stroke-linecap="round"/>' + '<path d="M90 76l14 10M190 76l14 10" stroke="#fff" stroke-opacity=".5" stroke-width="3" stroke-linecap="round"/>';
    } else if (kind === 'studs') {
      b += [[120, 82], [200, 82]].map(p => circ(p[0], p[1], 15, col, edge) + circ(p[0] - 4, p[1] - 4, 5, '#fff', ' opacity=".8"')).join('');
    } else if (kind === 'hoops') {
      b += [[118, 88], [202, 88]].map(p => ring(p[0], p[1], 34, col, 8) + circ(p[0], p[1] - 34, 5, col, edge)).join('') + '<path d="M96 70a34 34 0 0 1 8-14" stroke="#fff" stroke-opacity=".6" stroke-width="3" fill="none"/>';
    } else if (kind === 'bangles') {
      b += [0, 1, 2, 3, 4, 5].map(i => '<ellipse cx="160" cy="' + (118 - i * 14) + '" rx="60" ry="14" fill="none" stroke="' + (i % 2 ? gold : col) + '" stroke-width="5"/>').join('');
    } else if (kind === 'chain') {
      b += '<path d="M70 24Q160 190 250 24" fill="none" stroke="' + col + '" stroke-width="9" stroke-dasharray="14 5" stroke-linecap="round"/>' + '<path d="M70 24Q160 190 250 24" fill="none" stroke="#fff" stroke-opacity=".35" stroke-width="2"/>' + circ(160, 96, 4, col);
    } else if (kind === 'necklace') {
      b += '<path d="M66 22Q160 170 254 22" fill="none" stroke="#c9d2da" stroke-width="3"/>' + [0.12, 0.22, 0.32, 0.42, 0.5, 0.58, 0.68, 0.78, 0.88].map(t => { const x = 66 + 188 * t, y = 22 + 296 * t * (1 - t); const big = Math.abs(t - 0.5) < 0.09; return circ(x, y, big ? 8 : 5, col, ' stroke="#8fb6ea" stroke-width="1.5"') + circ(x - 2, y - 2, 1.8, '#fff'); }).join('') + '<path d="M160 112l16 -8 9 16 -25 18 -25 -18 9 -16z" fill="' + col + '" stroke="#8fb6ea" stroke-width="2"/>';
    }
    const star = dark ? [[40, 20], [92, 40], [260, 24], [284, 60], [24, 80]].map(s => circ(s[0], s[1], 1.3, '#fff')).join('') : '';
    return '<svg viewBox="0 0 320 170" preserveAspectRatio="xMidYMid slice" role="img" aria-hidden="true"><defs><linearGradient id="' + id + '" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="' + V.bg[0] + '"/><stop offset="1" stop-color="' + V.bg[1] + '"/></linearGradient></defs>' +
      '<rect width="320" height="170" fill="url(#' + id + ')"/>' + star + '<rect y="148" width="320" height="22" fill="' + (dark ? '#120d24' : '#6b4a2a') + '" opacity=".55"/>' + b + '</svg>';
  }

  const CSS = '.pp{display:flex;flex-direction:column;flex:1;min-height:0;background:var(--cream)}' +
    '.pp .ph-tabs{position:sticky;top:0;z-index:3}' +
    '.pp-wal{display:flex;gap:.5em;padding:.7em 1em 0}.pp-wal div{flex:1;background:#fff;border:1px solid var(--line);border-radius:.9em;padding:.5em .7em}.pp-wal small{display:block;color:var(--mute);font-size:.78em;letter-spacing:.06em;text-transform:uppercase}.pp-wal b{font:700 1em Georgia,serif;color:var(--emerald)}' +
    '.pp-view{flex:1;padding:.7em 1em 1.4em;display:flex;flex-direction:column;gap:.8em}' +
    '.pp-rail{display:flex;gap:.5em;overflow-x:auto;scrollbar-width:none;padding:.1em .1em .3em}.pp-lv{flex:none;width:5.6em;padding:.55em .3em;border-radius:1em;background:#fff;border:1px solid var(--line);text-align:center;position:relative}.pp-lv i{display:grid;place-items:center;width:2em;height:2em;margin:0 auto .25em;border-radius:50%;background:var(--emerald);color:var(--gold2);font:700 1em Georgia,serif;font-style:normal}.pp-lv span{display:block;font-size:.78em;font-weight:600;color:var(--ink)}.pp-lv.on{border-color:var(--gold);box-shadow:0 0 0 .14em rgba(201,162,74,.3)}.pp-lv.lock{opacity:.7}.pp-lv.lock i{background:#b9b09a}.pp-lv svg{position:absolute;top:.35em;right:.4em;width:1em;height:1em;stroke:var(--mute);fill:none;stroke-width:2}' +
    '.pp-ban{border-radius:1.1em;padding:.9em 1em;color:#f6efdc;background:linear-gradient(135deg,#8a6a1c,#3d2c06);border:1px solid var(--gold)}.pp-ban h3{margin:0;font:600 1.25em Georgia,serif;color:var(--gold2)}.pp-ban p{margin:.25em 0 0;opacity:.88;font-size:.9em}.pp-ban .rq{margin-top:.5em;display:inline-block;background:rgba(240,215,140,.16);border:1px solid rgba(240,215,140,.4);border-radius:2em;padding:.2em .7em;font-size:.82em;color:var(--gold2)}' +
    '.pp-card{background:#fff;border:1px solid var(--line);border-radius:1.1em;overflow:hidden;text-align:left;width:100%;display:block;box-shadow:0 .2em .6em rgba(40,30,10,.06)}.pp-card:active{transform:scale(.99)}.pp-img{aspect-ratio:16/8.6;position:relative;overflow:hidden;background:#e8dfc6}.pp-img svg{display:block;width:100%;height:100%}' +
    '.pp-tag{position:absolute;top:.6em;left:.6em;background:rgba(18,57,42,.9);color:var(--gold2);font-size:.75em;font-weight:700;letter-spacing:.05em;padding:.25em .7em;border-radius:2em;border:1px solid var(--gold)}.pp-tag.own{background:var(--gold);color:var(--emerald)}' +
    '.pp-info{padding:.7em .85em .85em}.pp-info b{display:block;font:700 1.05em Georgia,serif;color:var(--emerald)}.pp-info small{color:var(--mute);display:block;margin-top:.1em}.pp-spec{display:flex;gap:.9em;margin:.5em 0 0;color:var(--ink);font-size:.85em}.pp-spec span{white-space:nowrap}.pp-price{display:flex;justify-content:space-between;align-items:baseline;margin-top:.55em;padding-top:.5em;border-top:1px dashed var(--line)}.pp-price strong{font:700 1.25em Georgia,serif;color:#8a6a2a}.pp-price em{font-style:normal;color:var(--mute);font-size:.8em}' +
    '.pp-hero{border-radius:1.1em;overflow:hidden;border:1px solid var(--gold)}.pp-hero .pp-img{aspect-ratio:16/9}.pp-d h2{margin:.1em 0 0;font:700 1.35em Georgia,serif;color:var(--emerald)}.pp-d small{color:var(--mute)}.pp-d p{margin:.4em 0 0;line-height:1.45;color:var(--ink)}' +
    '.pp-grid{display:grid;grid-template-columns:1fr 1fr;gap:.5em}.pp-grid div{background:#fff;border:1px solid var(--line);border-radius:.8em;padding:.5em .7em}.pp-grid small{display:block;color:var(--mute);font-size:.78em}.pp-grid b{font-weight:700}' +
    '.pp-src{display:grid;grid-template-columns:1fr 1fr;gap:.5em}.pp-src button{padding:.6em;border-radius:.9em;background:#fff;border:1.5px solid var(--line);text-align:left}.pp-src button.on{border-color:var(--gold);background:#fbf3dc}.pp-src small{display:block;color:var(--mute)}.pp-src b{font-size:.95em}' +
    '.pp-btn{background:var(--emerald);color:var(--gold2);font-weight:700;padding:.9em;border-radius:.95em;text-align:center;border:1px solid var(--gold);width:100%}.pp-btn[disabled]{opacity:.45}.pp-btn.ghost{background:#fff;color:var(--emerald)}' +
    '.pp-sum{background:linear-gradient(135deg,#8a6a1c,#3d2c06);color:#f6efdc;border:1px solid var(--gold);border-radius:1.1em;padding:1em;display:grid;grid-template-columns:1fr 1fr;gap:.6em}.pp-sum small{display:block;opacity:.8;font-size:.78em;text-transform:uppercase;letter-spacing:.06em}.pp-sum b{font:700 1.15em Georgia,serif;color:var(--gold2)}' +
    '.pp-empty{text-align:center;color:var(--mute);padding:2em 1em}.pp-empty b{display:block;font:700 1.1em Georgia,serif;color:var(--emerald);margin-bottom:.3em}';


  /* demo-mode pretend state (kept while the page is open). Big bank balance on purpose so every level can be tried. */
  const D = { pocket: 5000000, bank: 500000000, owned: {} };

  Ph.registerApp({
    id: 'accessories', name: 'Accessories', icon: 'gem', color: ['#d4a63a', '#6b4a0c'],
    mount(body, ctx) {
      const demo = Ph.demo(), api = Ph.api(); let u = Ph.getUser(), tab = 'explore', lv = 1, cat = 'All', dead = false, detail = null;
      let wal = { pocket: 0, bank: 0 }, owned = {}; const price = {};   // owned: id -> {bought_at}; price: server numbers
      LISTINGS.forEach(p => { price[p.id] = p.price; });

      const style = h('style'); style.textContent = CSS; body.appendChild(style);
      const root = h('div', 'pp'); body.appendChild(root);
      const wBox = h('div', 'pp-wal'), tabs = h('div', 'ph-tabs'), view = h('div', 'pp-view'); root.append(wBox, tabs, view);
      [['explore', 'Showcase'], ['mine', 'My Collection']].forEach(([k, t]) => { const b = h('button', k === 'explore' ? 'on' : '', t); b.type = 'button'; b.dataset.t = k; b.onclick = () => { detail = null; ctx.setTitle('Accessories'); tab = k; draw(); }; tabs.appendChild(b); });

      const topLevel = () => Object.keys(owned).reduce((m, id) => Math.max(m, BY[id] ? BY[id].lv : 0), 0);
      const unlocked = (n) => n === 1 || Object.keys(owned).some(id => BY[id] && BY[id].lv === n - 1);
      function paintWallet() { wBox.innerHTML = ''; [['In pocket', wal.pocket], ['In bank', wal.bank]].forEach(([t, v]) => { const d = h('div'); d.append(h('small', '', t), h('b', '', naira(v))); wBox.appendChild(d); }); }

      async function load() {
        if (!u) { view.innerHTML = ''; wBox.innerHTML = ''; view.appendChild(h('p', 'pp-empty', 'Sign in (Settings) to browse and buy accessories.')); return false; }
        if (demo) { wal = { pocket: D.pocket, bank: D.bank }; owned = D.owned; return true; }
        try {
          const sb = api.sb();
          const [c, o] = await Promise.all([sb.from('acc_catalog').select('id,level,price'), sb.from('acc_owned').select('item_id,bought_at')]);
          if (c.error) throw c.error; if (o.error) throw o.error;
          (c.data || []).forEach(r => { price[r.id] = Number(r.price); });
          owned = {}; (o.data || []).forEach(r => { owned[r.item_id] = { bought_at: r.bought_at }; });
          const w = (Ph.getUser() || u).wallet || {}; wal = { pocket: Number(w.pocket || 0), bank: Number(w.bank || 0) };
          return true;
        } catch (e) { view.innerHTML = ''; view.appendChild(h('p', 'pp-empty', 'Could not load accessories: ' + say(e) + ' (run supabase/08_accessories.sql if you have not yet)')); return false; }
      }
      async function draw() {
        tabs.querySelectorAll('button').forEach(b => b.classList.toggle('on', b.dataset.t === tab)); tabs.style.display = detail ? 'none' : '';
        const ok = await load(); if (dead || !ok) return; paintWallet(); view.innerHTML = ''; body.scrollTop = 0;
        if (detail) showDetail(detail); else if (tab === 'explore') showExplore(); else showMine();
      }

      function listCard(p) {
        const c = h('button', 'pp-card'); c.type = 'button';
        const im = h('div', 'pp-img'); im.innerHTML = art(p.kind, p.lv, p.col);
        const isOwn = !!owned[p.id], lock = !unlocked(p.lv);
        im.appendChild(h('span', 'pp-tag' + (isOwn ? ' own' : ''), isOwn ? 'OWNED' : lock ? 'LEVEL ' + p.lv + ' · LOCKED' : 'LEVEL ' + p.lv));
        const inf = h('div', 'pp-info'); inf.append(h('b', '', p.name), h('small', '', p.area));
        const sp = h('div', 'pp-spec'); sp.appendChild(h('span', '', p.mat)); sp.appendChild(h('span', '', 'Worn: ' + p.slot)); inf.appendChild(sp);
        const pr = h('div', 'pp-price'); pr.append(h('strong', '', naira(price[p.id]))); inf.appendChild(pr);
        c.append(im, inf); c.onclick = () => { detail = p.id; draw(); }; return c;
      }

      function showExplore() {
        const rail = h('div', 'pp-rail');
        LEVELS.forEach(V => { const b = h('button', 'pp-lv' + (V.n === lv ? ' on' : '') + (unlocked(V.n) ? '' : ' lock')); b.type = 'button'; b.append(h('i', '', String(V.n)), h('span', '', V.name)); if (!unlocked(V.n)) b.insertAdjacentHTML('beforeend', ctx.icons.lock); b.onclick = () => { lv = V.n; draw(); }; rail.appendChild(b); });
        const V = LEVELS[lv - 1], inLv = LISTINGS.filter(p => p.lv === lv), lo = Math.min(...inLv.map(p => price[p.id])), hi = Math.max(...inLv.map(p => price[p.id]));
        const ban = h('div', 'pp-ban'); ban.append(h('h3', '', 'Level ' + V.n + ' · ' + V.name), h('p', '', V.tag), h('span', 'rq', unlocked(lv) ? 'Open · ' + short(lo) + ' to ' + short(hi) : 'Locked · own a Level ' + (lv - 1) + ' accessory to unlock'));
        const chips = h('div', 'pp-rail'); CATS.forEach(c => { const b = h('button', 'pp-lv' + (c === cat ? ' on' : '')); b.type = 'button'; b.appendChild(h('span', '', c)); b.dataset.cat = c; b.onclick = () => { cat = c; draw(); }; chips.appendChild(b); });
        view.append(rail, ban, chips);
        const items = inLv.filter(p => cat === 'All' || p.area === cat);
        if (!items.length) view.appendChild(h('p', 'pp-empty', 'Nothing in this category at Level ' + lv + '.')); else items.forEach(p => view.appendChild(listCard(p)));
      }

      function showMine() {
        const ids = Object.keys(owned).filter(id => BY[id]), worth = ids.reduce((s, id) => s + price[id], 0);
        const sum = h('div', 'pp-sum'); [['Collection value', naira(worth)], ['Pieces owned', String(ids.length) + ' of ' + LISTINGS.length], ['Highest level', topLevel() ? 'Level ' + topLevel() : 'None yet'], ['Watches · Bags · Shades · Jewellery', ['Watches', 'Bags', 'Shades', 'Jewellery'].map(c => ids.filter(id => BY[id].area === c).length).join(' · ')]].forEach(([t, v]) => { const d = h('div'); d.append(h('small', '', t), h('b', '', v)); sum.appendChild(d); });
        view.appendChild(sum);
        if (!ids.length) { const e = h('div', 'pp-empty'); e.append(h('b', '', 'Your collection is empty'), h('span', '', 'Your first piece starts at ₦50,000. Open the Showcase and pick something that suits you.')); view.appendChild(e); return; }
        ids.sort((a, b) => BY[b].lv - BY[a].lv).forEach(id => view.appendChild(listCard(BY[id])));
      }

      function showDetail(id) {
        const p = BY[id]; ctx.setTitle(p.name); let from = wal.pocket >= price[id] || wal.bank < price[id] ? 'pocket' : 'bank', confirming = false;
        const hero = h('div', 'pp-hero'), im = h('div', 'pp-img'); im.innerHTML = art(p.kind, p.lv, p.col); im.appendChild(h('span', 'pp-tag' + (owned[id] ? ' own' : ''), owned[id] ? 'OWNED' : 'LEVEL ' + p.lv + ' · ' + LEVELS[p.lv - 1].name.toUpperCase())); hero.appendChild(im);
        const d = h('div', 'pp-d'); d.append(h('h2', '', p.name), h('small', '', p.area), h('p', '', p.blurb));
        const gr = h('div', 'pp-grid'); [['Price', naira(price[id])], ['Material', p.mat], ['Worn on', p.slot], ['Level', p.lv + ' · ' + LEVELS[p.lv - 1].name]].forEach(([t, v]) => { const x = h('div'); x.append(h('small', '', t), h('b', '', v)); gr.appendChild(x); });
        const act = h('div'); act.style.cssText = 'display:flex;flex-direction:column;gap:.6em'; view.append(hero, d, gr, act);
        function paintAct() {
          act.innerHTML = '';
          if (owned[id]) { act.appendChild(h('p', 'ph-note', 'This piece is in your collection. Wearing it on your character is coming soon.')); return; }
          if (!unlocked(p.lv)) { act.appendChild(h('p', 'ph-note', 'Locked. Own any Level ' + (p.lv - 1) + ' accessory to unlock Level ' + p.lv + '.')); return; }
          const src = h('div', 'pp-src'); [['pocket', 'Pay from pocket', wal.pocket], ['bank', 'Pay from bank', wal.bank]].forEach(([k, t, v]) => { const b = h('button', from === k ? 'on' : ''); b.type = 'button'; b.append(h('b', '', t), h('small', '', naira(v))); b.onclick = () => { from = k; confirming = false; paintAct(); }; src.appendChild(b); });
          const enough = wal[from] >= price[id], buy = h('button', 'pp-btn', confirming ? 'Confirm: pay ' + naira(price[id]) : enough ? 'Buy for ' + naira(price[id]) : 'Not enough in ' + from); buy.type = 'button'; buy.disabled = !enough;
          buy.onclick = async () => {
            if (!confirming) { confirming = true; paintAct(); return; }
            buy.disabled = true; buy.textContent = 'Processing…';
            try {
              if (demo) { if (D[from] < price[id]) throw new Error('not_enough_money'); D[from] -= price[id]; D.owned[id] = { bought_at: new Date().toISOString() }; }
              else { await api.rpc('buy_accessory', { p_item: id, p_from: from }); if (Ph.refreshUser) Ph.refreshUser(); }
              Ph.toast('Congratulations! You now own: ' + p.name); if (dead) return; detail = null; tab = 'mine'; ctx.setTitle('Accessories'); draw();
            } catch (e) { Ph.toast(say(e)); confirming = false; if (!dead) draw(); }
          };
          act.append(src, buy); if (confirming) { const no = h('button', 'pp-btn ghost', 'Cancel'); no.type = 'button'; no.onclick = () => { confirming = false; paintAct(); }; act.appendChild(no); }
        }
        paintAct();
      }

      Ph.on('user', (nu) => { if (dead) return; u = nu; draw(); });
      draw();
      return { destroy() { dead = true; }, back() { if (detail) { detail = null; ctx.setTitle('Accessories'); draw(); return true; } return false; } };
    }
  });
  /* shared with the profile view (apps/profile.js): listing text + pictures */
  g.FutaCatalog = g.FutaCatalog || {}; g.FutaCatalog.accessories = { LEVELS, LISTINGS, art };
})(window);
