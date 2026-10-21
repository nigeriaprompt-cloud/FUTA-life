/* Phone app: Property — buy and own houses, shops and land with GAME money, LEVEL BY LEVEL (5 levels, cheapest listing ₦500,000).
   Level 1 is open. To unlock level N you must own one property of level N-1 (the server checks this: supabase/06_property.sql).
   Owned properties pay daily rent into the BANK ("Collect rent", once per Lagos day).
   Real mode: prices/ownership are read from property_catalog / property_owned (RLS) and written ONLY through RPCs buy_property / collect_rent.
   Demo mode (no Supabase keys): a pretend wallet and ownership kept in memory so you can try every level.
   The LISTINGS array below holds the text and the picture type; to add or edit a listing change it here AND insert/update its row in 06_property.sql (same id).
   Pictures are drawn in code (SVG, no image files). All text goes in with textContent. */
(function (g) {
  'use strict';
  const Ph = g.FutaPhone; if (!Ph) return;

  const LEVELS = [
    { n: 1, name: 'Starter', tag: 'Rooms, kiosks and a plot of your own', sky: ['#f6efd9', '#dfe9d6'], gr: '#b9c9a0' },
    { n: 2, name: 'Comfort', tag: 'Flats, stores and family bungalows', sky: ['#f4e6c2', '#cfe1d3'], gr: '#a8c08c' },
    { n: 3, name: 'Prestige', tag: 'Duplexes, plazas and prime land', sky: ['#f7dfae', '#c9dae2'], gr: '#9db985' },
    { n: 4, name: 'Luxury', tag: 'Villas, suites and lakeside estates', sky: ['#f8cf93', '#b9cee3'], gr: '#8fb07c' },
    { n: 5, name: 'Royal', tag: 'Mansions, towers and crown estates', sky: ['#3a2b63', '#e9b86a'], gr: '#5f7f62' }
  ];
  // id, level, kind (picture), name, area, price (display only; the real price comes from the server), beds, baths, sqm, blurb
  const L = (id, lv, kind, name, area, price, beds, baths, sqm, blurb) => ({ id, lv, kind, name, area, price, beds, baths, sqm, blurb });
  const LISTINGS = [
    L('l1_room', 1, 'hostel', 'Student Room Share', 'South Gate, Akure', 500000, 1, 1, 14, 'A tidy self-contained room two minutes from the lecture halls. Steady tenants, steady rent.'),
    L('l1_kiosk', 1, 'shop', 'Campus Kiosk', 'Aule Road', 750000, 0, 0, 9, 'A busy corner kiosk beside the cafeteria walkway. Snacks, recharge cards and cold drinks sell all day.'),
    L('l1_annex', 1, 'hostel', 'Single-Room Annex', 'North Gate', 1200000, 1, 1, 22, 'A quiet annex behind a landlord’s compound with its own meter and a tiled bathroom.'),
    L('l1_plot', 1, 'land', 'Quarter-Plot of Land', 'Oba-Ile Road', 1800000, 0, 0, 450, 'A fenced quarter-plot with a survey plan, ready for the day you build your dream.'),
    L('l2_flat', 2, 'bungalow', 'Mini Flat', 'Ijapo Estate', 2500000, 1, 1, 48, 'A bright one-bedroom flat with a small parlour, kitchen and steady water.'),
    L('l2_store', 2, 'shop', 'Corner Provision Store', 'Oda Road', 3500000, 0, 1, 36, 'A fully stocked provision store on a busy junction, with a back room for storage.'),
    L('l2_bung', 2, 'bungalow', 'Two-Bedroom Bungalow', 'Alagbaka', 6000000, 2, 2, 110, 'A cosy bungalow with a front garden, a gate and room for the whole family.'),
    L('l2_hostel', 2, 'apartment', 'Student Hostel Block', 'Ondo Road', 9000000, 12, 6, 320, 'Twelve rooms, always full by September. A proper business with a caretaker on site.'),
    L('l3_duplex', 3, 'duplex', 'Three-Bedroom Duplex', 'Ijapo Heights', 15000000, 3, 3, 210, 'Two storeys of marble floors, a balcony and a quiet street lined with palms.'),
    L('l3_unit', 3, 'plaza', 'Boutique Plaza Unit', 'Oba Adesida Road', 22000000, 0, 2, 85, 'A glass-front shop in the busiest plaza in town. Every brand wants this address.'),
    L('l3_court', 3, 'duplex', 'Gated Court Terrace', 'Alagbaka GRA', 30000000, 4, 4, 260, 'A terraced home inside a guarded court with 24-hour power and paved roads.'),
    L('l3_land', 3, 'land', 'Commercial Land, One Hectare', 'Akure–Ondo Expressway', 42000000, 0, 0, 10000, 'A full hectare on the expressway. Whatever you build here will be seen by everyone.'),
    L('l4_villa', 4, 'villa', 'Palm Villa with Pool', 'Alagbaka GRA', 85000000, 5, 6, 520, 'A sun-drenched villa with arches, a swimming pool and gardens kept by a full-time gardener.'),
    L('l4_suites', 4, 'apartment', 'Serviced Apartments Block', 'Isikan Avenue', 140000000, 24, 24, 1800, 'Twenty-four furnished suites for visiting executives. Premium rent, premium respect.'),
    L('l4_lake', 4, 'land', 'Lakeside Estate Land', 'Ala Lake Road', 180000000, 0, 0, 24000, 'Rolling lakeside land with a private road, perfect for a gated estate of your own.'),
    L('l4_plaza', 4, 'plaza', 'Business Plaza', 'Oba Adesida Road', 240000000, 0, 16, 3600, 'A full commercial plaza with forty lettable shops, a clock tower and a basement car park.'),
    L('l5_mansion', 5, 'mansion', 'Heritage Mansion', 'Alagbaka Hill', 450000000, 9, 11, 1900, 'A grand mansion with marble columns, a fountain court and wings for family and guests.'),
    L('l5_tower', 5, 'tower', 'Akure Skyline Tower', 'City Centre', 900000000, 0, 40, 22000, 'A glass tower that owns the skyline. Banks, firms and embassies queue to rent a floor.'),
    L('l5_crown', 5, 'palace', 'Crown Estate', 'Ala Hills', 2000000000, 20, 24, 60000, 'Palace, towers, gardens and a private gate. The crown jewel of every property portfolio in Akure.')
  ];
  const BY = Object.fromEntries(LISTINGS.map(p => [p.id, p]));
  const ERR = {
    level_locked: 'Own a property from the level below to unlock this one.', not_enough_money: 'You do not have enough money in that account.', already_owned: 'You already own this property.',
    nothing_to_collect: 'No rent to collect right now. Come back tomorrow.', not_signed_in: 'Sign in (Settings) first.', no_such_property: 'That listing is not available.', bad_source: 'Pick pocket or bank.'
  };
  const say = (e) => ERR[e && e.message] || (e && e.message) || 'Something went wrong. Try again.';
  const naira = (n) => '₦' + Number(n || 0).toLocaleString('en-NG');
  const short = (n) => n >= 1e9 ? '₦' + +(n / 1e9).toFixed(2) + 'B' : n >= 1e6 ? '₦' + +(n / 1e6).toFixed(2) + 'M' : n >= 1e3 ? '₦' + +(n / 1e3).toFixed(0) + 'K' : '₦' + n;
  const h = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; };
  const lagosToday = () => new Date().toLocaleDateString('en-CA', { timeZone: 'Africa/Lagos' });

  /* ---------------- pictures: classic scenes drawn from kind + level (our own SVG, never user text) ---------------- */
  let uid = 0;
  function art(kind, lv) {
    const V = LEVELS[lv - 1], id = 'pa' + (++uid), night = lv === 5;
    const wall = ['#efe4c8', '#f2e8cf', '#f6ecd4', '#f8efdc', '#fbf3e2'][lv - 1], roof = ['#8a5a3c', '#8f4a36', '#7b3f32', '#a8523a', '#c9a24a'][lv - 1], dk = '#2a1f17', lit = '#f6d77a', glass = night ? '#9ec3e8' : '#b7d3e3';
    const E = ' stroke="' + dk + '" stroke-opacity=".4"';
    const rect = (x, y, w, hh, f, extra) => '<rect x="' + x + '" y="' + y + '" width="' + w + '" height="' + hh + '" fill="' + f + '"' + (extra || '') + '/>';
    const win = (x, y, w, hh, on) => '<rect x="' + x + '" y="' + y + '" width="' + w + '" height="' + hh + '" rx="1.5" fill="' + (on ? lit : glass) + '" stroke="' + dk + '" stroke-opacity=".55"/><path d="M' + (x + w / 2) + ' ' + y + 'v' + hh + 'M' + x + ' ' + (y + hh / 2) + 'h' + w + '" stroke="' + dk + '" stroke-opacity=".35"/>';
    const door = (x, y, w, hh, c) => rect(x, y, w, hh, c || '#5b3a24', ' rx="2"') + '<circle cx="' + (x + w - 3) + '" cy="' + (y + hh / 2) + '" r="1.4" fill="#f0d78c"/>';
    const tree = (x, s) => '<rect x="' + (x - 2) + '" y="' + (140 - 16 * s) + '" width="4" height="' + 16 * s + '" fill="#6b4a2f"/><circle cx="' + x + '" cy="' + (140 - 24 * s) + '" r="' + 12 * s + '" fill="#4f8a58"/><circle cx="' + (x + 6 * s) + '" cy="' + (140 - 20 * s) + '" r="' + 8 * s + '" fill="#5e9c66"/>';
    const palm = (x) => '<path d="M' + x + ' 140q3-30-2-52" stroke="#7a5a3a" stroke-width="3.5" fill="none"/><path d="M' + (x - 2) + ' 88q-16-6-24 6M' + (x - 2) + ' 88q-6-14-22-12M' + (x - 2) + ' 88q8-14 24-8M' + (x - 2) + ' 88q18-2 22 10" stroke="#3f8a4f" stroke-width="3.2" fill="none" stroke-linecap="round"/>';
    let b = '';
    if (kind === 'hostel') {
      b = rect(40, 72, 240, 68, wall, E) + rect(34, 64, 252, 10, roof);
      for (let i = 0; i < 5; i++) if (i !== 2) b += win(54 + i * 48, 82, 26, 22, i % 2) + win(54 + i * 48, 112, 26, 22, !(i % 2));
      b += door(148, 108, 24, 32) + rect(128, 86, 64, 14, '#12392a', ' rx="2"') + '<text x="160" y="96.5" font-size="8" fill="#f0d78c" text-anchor="middle" font-family="Georgia,serif">HOSTEL</text>' + tree(18, 1) + tree(304, 1.1);
    } else if (kind === 'shop') {
      b = rect(60, 88, 200, 52, wall, E) + rect(54, 70, 212, 16, '#12392a') + '<text x="160" y="82" font-size="10" fill="#f0d78c" text-anchor="middle" font-family="Georgia,serif" letter-spacing="2">PROVISIONS</text>';
      for (let i = 0; i < 10; i++) b += '<path d="M' + (58 + i * 20.5) + ' 88h20.5l3 14h-26.5z" fill="' + (i % 2 ? '#fbf3e2' : '#b3402f') + '"/>';
      b += win(74, 108, 70, 26, true) + door(176, 106, 28, 34, '#12392a') + rect(214, 112, 34, 22, '#c9a24a', ' rx="2"') + tree(26, 1) + tree(296, 1);
    } else if (kind === 'bungalow') {
      b = rect(236, 40, 12, 28, '#a0624a') + rect(70, 88, 180, 52, wall, E) + '<polygon points="54,92 160,42 266,92" fill="' + roof + '"' + E + '/>' + win(86, 102, 30, 24, true) + win(204, 102, 30, 24, false) + door(146, 104, 28, 36) + '<path d="M30 140v-14M46 140v-14M62 140v-14M258 140v-14M274 140v-14M290 140v-14M26 132h40M254 132h40" stroke="#8a7a5a" stroke-width="2"/>' + tree(22, .9) + tree(300, 1);
    } else if (kind === 'duplex') {
      b = rect(70, 62, 180, 78, wall, E) + '<polygon points="58,66 160,22 262,66" fill="' + roof + '"/>' + rect(66, 98, 188, 5, '#d8cba8') + win(86, 72, 28, 20, true) + win(206, 72, 28, 20, false) + win(146, 74, 28, 18, true) + win(86, 112, 28, 22, false) + win(206, 112, 28, 22, true) + door(146, 108, 28, 32) + '<path d="M138 104h44" stroke="#c9a24a" stroke-width="3"/>' + tree(30, 1.1) + tree(292, 1);
    } else if (kind === 'apartment') {
      b = rect(96, 38, 128, 102, wall, E) + rect(90, 32, 140, 8, roof) + rect(150, 18, 20, 14, '#8a8f93', ' rx="2"');
      for (let r = 0; r < 4; r++) for (let c = 0; c < 4; c++) if (!(r === 3 && (c === 1 || c === 2))) b += win(106 + c * 30, 48 + r * 22, 18, 14, (r + c) % 3 === 0);
      b += door(148, 112, 24, 28, '#12392a') + tree(60, 1.2) + tree(262, 1.2);
    } else if (kind === 'villa') {
      b = '<ellipse cx="226" cy="154" rx="52" ry="9" fill="#6fb6d6" stroke="#fff" stroke-width="2"/>' + rect(40, 82, 170, 58, wall, E) + '<polygon points="30,86 62,52 190,52 220,86" fill="' + roof + '"/>' + rect(210, 100, 40, 40, wall, E) + '<polygon points="204,104 230,80 256,104" fill="' + roof + '"/>';
      for (let i = 0; i < 3; i++) b += '<path d="M' + (56 + i * 44) + ' 140v-26a14 14 0 0 1 28 0v26z" fill="' + (i === 1 ? '#5b3a24' : glass) + '" stroke="' + dk + '" stroke-opacity=".5"/>';
      b += win(222, 112, 16, 16, true) + palm(22) + palm(290);
    } else if (kind === 'mansion' || kind === 'palace') {
      b = rect(20, 78, 280, 62, wall, E) + rect(104, 44, 112, 96, wall, E) + '<polygon points="92,46 160,12 228,46" fill="' + roof + '" stroke="#8a6a2a"/><circle cx="160" cy="34" r="6" fill="' + lit + '" stroke="#8a6a2a"/>';
      for (let i = 0; i < 6; i++) b += rect(110 + i * 19, 56, 5, 84, '#fff8e6', ' stroke="#bba878" stroke-width=".8"');
      b += '<path d="M146 140v-26a14 14 0 0 1 28 0v26z" fill="#5b3a24"/>';
      for (let i = 0; i < 2; i++) b += win(36 + i * 36, 90, 22, 26, true) + win(224 + i * 36, 90, 22, 26, i === 0);
      if (kind === 'palace') b += rect(6, 50, 24, 90, wall, E) + rect(290, 50, 24, 90, wall, E) + '<polygon points="2,52 18,18 34,52" fill="' + roof + '"/><polygon points="286,52 302,18 318,52" fill="' + roof + '"/>' + win(12, 62, 12, 18, true) + win(296, 62, 12, 18, true);
      b += '<path d="M0 140h320" stroke="#c9a24a" stroke-width="1.6"/><ellipse cx="160" cy="154" rx="26" ry="6" fill="#8ec5e0" stroke="#c9a24a"/><path d="M160 154v-10M160 144q-6 2-7 8M160 144q6 2 7 8" stroke="#dff3ff" stroke-width="1.6" fill="none"/>';
    } else if (kind === 'tower') {
      b = '<defs><linearGradient id="' + id + 'g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#bcd8ee"/><stop offset=".5" stop-color="#6f9cc0"/><stop offset="1" stop-color="#2f5d86"/></linearGradient></defs>' + rect(80, 112, 160, 28, '#e8dcc0', E) + rect(122, 12, 76, 102, 'url(#' + id + 'g)', ' stroke="#12392a" stroke-width="1.4"') + rect(158, 0, 4, 14, '#c9a24a');
      for (let i = 1; i < 9; i++) b += '<path d="M122 ' + (12 + i * 11.3) + 'h76" stroke="#fff" stroke-opacity=".35"/>';
      for (let i = 1; i < 4; i++) b += '<path d="M' + (122 + i * 19) + ' 12v102" stroke="#fff" stroke-opacity=".3"/>';
      b += door(148, 118, 24, 22, '#12392a') + win(96, 120, 28, 14, true) + win(196, 120, 28, 14, true) + tree(56, 1) + tree(264, 1);
    } else if (kind === 'plaza') {
      b = rect(40, 70, 240, 70, wall, E) + rect(34, 62, 252, 10, roof) + '<path d="M118 62a42 42 0 0 1 84 0z" fill="' + roof + '" stroke="#8a6a2a"/>' + rect(128, 74, 64, 14, '#12392a', ' rx="2"') + '<text x="160" y="84.5" font-size="8" fill="#f0d78c" text-anchor="middle" font-family="Georgia,serif" letter-spacing="1.5">PLAZA</text>';
      for (let i = 0; i < 4; i++) { const x = 52 + i * 52 + (i > 1 ? 56 : 0) - (i > 1 ? 0 : 0); b += rect(x, 96, 38, 44, glass, ' stroke="' + dk + '" stroke-opacity=".5"') + '<path d="M' + x + ' 96h38l3 8h-44z" fill="' + (i % 2 ? '#c9a24a' : '#12392a') + '"/>'; }
      b += door(148, 104, 24, 36) + tree(18, 1) + tree(304, 1);
    } else {   // land
      b = '<polygon points="30,140 290,140 260,112 60,112" fill="' + (night ? '#6f8f6f' : '#c7d3a2') + '" stroke="#8a7a4a" stroke-dasharray="4 3"/><path d="M60 112v-10M100 112v-10M140 112v-10M180 112v-10M220 112v-10M260 112v-10M60 106h200" stroke="#8a6a3a" stroke-width="2"/>' + rect(150, 70, 4, 50, '#6b4a2f') + rect(124, 56, 56, 22, '#fbf3e2', ' rx="2" stroke="#c9a24a"') + '<text x="152" y="66" font-size="7" fill="#12392a" text-anchor="middle" font-family="Georgia,serif" font-weight="700">FOR SALE</text><text x="152" y="74.5" font-size="6" fill="#8a6a2a" text-anchor="middle">PLOT</text>' + tree(24, 1.2) + tree(298, 1.3) + tree(56, .8);
    }
    const sun = night ? '<circle cx="268" cy="30" r="11" fill="#fff4cf"/><circle cx="273" cy="27" r="10" fill="#3a2b63"/>' + [[40, 20], [90, 36], [200, 16], [240, 44], [20, 54]].map(s => '<circle cx="' + s[0] + '" cy="' + s[1] + '" r="1.2" fill="#fff"/>').join('') : '<circle cx="' + (lv % 2 ? 40 : 276) + '" cy="30" r="14" fill="#fff3c4" opacity=".9"/>';
    return '<svg viewBox="0 0 320 170" preserveAspectRatio="xMidYMid slice" role="img" aria-hidden="true"><defs><linearGradient id="' + id + '" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="' + V.sky[0] + '"/><stop offset="1" stop-color="' + V.sky[1] + '"/></linearGradient></defs>' +
      '<rect width="320" height="170" fill="url(#' + id + ')"/>' + sun + '<path d="M0 126q60-14 120-4t200-6v54H0z" fill="' + V.gr + '" opacity=".55"/><rect y="140" width="320" height="30" fill="' + V.gr + '"/><path d="M0 142h320" stroke="#0002"/>' + b + '</svg>';
  }

  const CSS = '.pp{display:flex;flex-direction:column;flex:1;min-height:0;background:var(--cream)}' +
    '.pp .ph-tabs{position:sticky;top:0;z-index:3}' +
    '.pp-wal{display:flex;gap:.5em;padding:.7em 1em 0}.pp-wal div{flex:1;background:#fff;border:1px solid var(--line);border-radius:.9em;padding:.5em .7em}.pp-wal small{display:block;color:var(--mute);font-size:.78em;letter-spacing:.06em;text-transform:uppercase}.pp-wal b{font:700 1em Georgia,serif;color:var(--emerald)}' +
    '.pp-view{flex:1;padding:.7em 1em 1.4em;display:flex;flex-direction:column;gap:.8em}' +
    '.pp-rail{display:flex;gap:.5em;overflow-x:auto;scrollbar-width:none;padding:.1em .1em .3em}.pp-lv{flex:none;width:5.6em;padding:.55em .3em;border-radius:1em;background:#fff;border:1px solid var(--line);text-align:center;position:relative}.pp-lv i{display:grid;place-items:center;width:2em;height:2em;margin:0 auto .25em;border-radius:50%;background:var(--emerald);color:var(--gold2);font:700 1em Georgia,serif;font-style:normal}.pp-lv span{display:block;font-size:.78em;font-weight:600;color:var(--ink)}.pp-lv.on{border-color:var(--gold);box-shadow:0 0 0 .14em rgba(201,162,74,.3)}.pp-lv.lock{opacity:.7}.pp-lv.lock i{background:#b9b09a}.pp-lv svg{position:absolute;top:.35em;right:.4em;width:1em;height:1em;stroke:var(--mute);fill:none;stroke-width:2}' +
    '.pp-ban{border-radius:1.1em;padding:.9em 1em;color:#f6efdc;background:linear-gradient(135deg,var(--emerald2),var(--emerald));border:1px solid var(--gold)}.pp-ban h3{margin:0;font:600 1.25em Georgia,serif;color:var(--gold2)}.pp-ban p{margin:.25em 0 0;opacity:.88;font-size:.9em}.pp-ban .rq{margin-top:.5em;display:inline-block;background:rgba(240,215,140,.16);border:1px solid rgba(240,215,140,.4);border-radius:2em;padding:.2em .7em;font-size:.82em;color:var(--gold2)}' +
    '.pp-card{background:#fff;border:1px solid var(--line);border-radius:1.1em;overflow:hidden;text-align:left;width:100%;display:block;box-shadow:0 .2em .6em rgba(40,30,10,.06)}.pp-card:active{transform:scale(.99)}.pp-img{aspect-ratio:16/8.6;position:relative;overflow:hidden;background:#e8dfc6}.pp-img svg{display:block;width:100%;height:100%}' +
    '.pp-tag{position:absolute;top:.6em;left:.6em;background:rgba(18,57,42,.9);color:var(--gold2);font-size:.75em;font-weight:700;letter-spacing:.05em;padding:.25em .7em;border-radius:2em;border:1px solid var(--gold)}.pp-tag.own{background:var(--gold);color:var(--emerald)}' +
    '.pp-info{padding:.7em .85em .85em}.pp-info b{display:block;font:700 1.05em Georgia,serif;color:var(--emerald)}.pp-info small{color:var(--mute);display:block;margin-top:.1em}.pp-spec{display:flex;gap:.9em;margin:.5em 0 0;color:var(--ink);font-size:.85em}.pp-spec span{white-space:nowrap}.pp-price{display:flex;justify-content:space-between;align-items:baseline;margin-top:.55em;padding-top:.5em;border-top:1px dashed var(--line)}.pp-price strong{font:700 1.25em Georgia,serif;color:#8a6a2a}.pp-price em{font-style:normal;color:var(--mute);font-size:.8em}' +
    '.pp-hero{border-radius:1.1em;overflow:hidden;border:1px solid var(--gold)}.pp-hero .pp-img{aspect-ratio:16/9}.pp-d h2{margin:.1em 0 0;font:700 1.35em Georgia,serif;color:var(--emerald)}.pp-d small{color:var(--mute)}.pp-d p{margin:.4em 0 0;line-height:1.45;color:var(--ink)}' +
    '.pp-grid{display:grid;grid-template-columns:1fr 1fr;gap:.5em}.pp-grid div{background:#fff;border:1px solid var(--line);border-radius:.8em;padding:.5em .7em}.pp-grid small{display:block;color:var(--mute);font-size:.78em}.pp-grid b{font-weight:700}' +
    '.pp-src{display:grid;grid-template-columns:1fr 1fr;gap:.5em}.pp-src button{padding:.6em;border-radius:.9em;background:#fff;border:1.5px solid var(--line);text-align:left}.pp-src button.on{border-color:var(--gold);background:#fbf3dc}.pp-src small{display:block;color:var(--mute)}.pp-src b{font-size:.95em}' +
    '.pp-btn{background:var(--emerald);color:var(--gold2);font-weight:700;padding:.9em;border-radius:.95em;text-align:center;border:1px solid var(--gold);width:100%}.pp-btn[disabled]{opacity:.45}.pp-btn.ghost{background:#fff;color:var(--emerald)}' +
    '.pp-sum{background:linear-gradient(135deg,var(--emerald2),var(--emerald));color:#f6efdc;border:1px solid var(--gold);border-radius:1.1em;padding:1em;display:grid;grid-template-columns:1fr 1fr;gap:.6em}.pp-sum small{display:block;opacity:.8;font-size:.78em;text-transform:uppercase;letter-spacing:.06em}.pp-sum b{font:700 1.15em Georgia,serif;color:var(--gold2)}' +
    '.pp-empty{text-align:center;color:var(--mute);padding:2em 1em}.pp-empty b{display:block;font:700 1.1em Georgia,serif;color:var(--emerald);margin-bottom:.3em}';

  /* demo-mode pretend state (kept while the page is open). Big bank balance on purpose so every level can be tried. */
  const D = { pocket: 5000000, bank: 2500000000, owned: {}, rent: null };

  Ph.registerApp({
    id: 'property', name: 'Property', icon: 'home', color: ['#3b8f6a', '#12392a'],
    mount(body, ctx) {
      const demo = Ph.demo(), api = Ph.api(); let u = Ph.getUser(), tab = 'explore', lv = 1, dead = false, detail = null;
      let wal = { pocket: 0, bank: 0 }, owned = {}; const price = {}, rentOf = {};   // owned: id -> {last_rent}; price/rentOf: server numbers
      LISTINGS.forEach(p => { price[p.id] = p.price; rentOf[p.id] = Math.round(p.price / 1000); });

      const style = h('style'); style.textContent = CSS; body.appendChild(style);
      const root = h('div', 'pp'); body.appendChild(root);
      const wBox = h('div', 'pp-wal'), tabs = h('div', 'ph-tabs'), view = h('div', 'pp-view'); root.append(wBox, tabs, view);
      [['explore', 'Explore'], ['mine', 'My Property']].forEach(([k, t]) => { const b = h('button', k === 'explore' ? 'on' : '', t); b.type = 'button'; b.dataset.t = k; b.onclick = () => { detail = null; ctx.setTitle('Property'); tab = k; draw(); }; tabs.appendChild(b); });

      const topLevel = () => Object.keys(owned).reduce((m, id) => Math.max(m, BY[id] ? BY[id].lv : 0), 0);
      const unlocked = (n) => n === 1 || Object.keys(owned).some(id => BY[id] && BY[id].lv === n - 1);
      function paintWallet() { wBox.innerHTML = ''; [['In pocket', wal.pocket], ['In bank', wal.bank]].forEach(([t, v]) => { const d = h('div'); d.append(h('small', '', t), h('b', '', naira(v))); wBox.appendChild(d); }); }

      async function load() {
        if (!u) { view.innerHTML = ''; wBox.innerHTML = ''; view.appendChild(h('p', 'pp-empty', 'Sign in (Settings) to browse and buy property.')); return false; }
        if (demo) { wal = { pocket: D.pocket, bank: D.bank }; owned = D.owned; return true; }
        try {
          const sb = api.sb();
          const [c, o] = await Promise.all([sb.from('property_catalog').select('id,level,price,rent_daily'), sb.from('property_owned').select('prop_id,last_rent')]);
          if (c.error) throw c.error; if (o.error) throw o.error;
          (c.data || []).forEach(r => { price[r.id] = Number(r.price); rentOf[r.id] = Number(r.rent_daily); });
          owned = {}; (o.data || []).forEach(r => { owned[r.prop_id] = { last_rent: r.last_rent }; });
          const w = (Ph.getUser() || u).wallet || {}; wal = { pocket: Number(w.pocket || 0), bank: Number(w.bank || 0) };
          return true;
        } catch (e) { view.innerHTML = ''; view.appendChild(h('p', 'pp-empty', 'Could not load properties: ' + say(e) + ' (run supabase/06_property.sql if you have not yet)')); return false; }
      }
      async function draw() {
        tabs.querySelectorAll('button').forEach(b => b.classList.toggle('on', b.dataset.t === tab)); tabs.style.display = detail ? 'none' : '';
        const ok = await load(); if (dead || !ok) return; paintWallet(); view.innerHTML = ''; body.scrollTop = 0;
        if (detail) showDetail(detail); else if (tab === 'explore') showExplore(); else showMine();
      }

      function listCard(p) {
        const c = h('button', 'pp-card'); c.type = 'button';
        const im = h('div', 'pp-img'); im.innerHTML = art(p.kind, p.lv);
        const isOwn = !!owned[p.id], lock = !unlocked(p.lv);
        im.appendChild(h('span', 'pp-tag' + (isOwn ? ' own' : ''), isOwn ? 'OWNED' : lock ? 'LEVEL ' + p.lv + ' · LOCKED' : 'LEVEL ' + p.lv));
        const inf = h('div', 'pp-info'); inf.append(h('b', '', p.name), h('small', '', p.area));
        const sp = h('div', 'pp-spec'); if (p.beds) sp.appendChild(h('span', '', p.beds + ' bed')); if (p.baths) sp.appendChild(h('span', '', p.baths + ' bath')); sp.appendChild(h('span', '', p.sqm.toLocaleString() + ' m²')); inf.appendChild(sp);
        const pr = h('div', 'pp-price'); pr.append(h('strong', '', naira(price[p.id])), h('em', '', 'rent ' + short(rentOf[p.id]) + '/day')); inf.appendChild(pr);
        c.append(im, inf); c.onclick = () => { detail = p.id; draw(); }; return c;
      }

      function showExplore() {
        const rail = h('div', 'pp-rail');
        LEVELS.forEach(V => { const b = h('button', 'pp-lv' + (V.n === lv ? ' on' : '') + (unlocked(V.n) ? '' : ' lock')); b.type = 'button'; b.append(h('i', '', String(V.n)), h('span', '', V.name)); if (!unlocked(V.n)) b.insertAdjacentHTML('beforeend', ctx.icons.lock); b.onclick = () => { lv = V.n; draw(); }; rail.appendChild(b); });
        const V = LEVELS[lv - 1], items = LISTINGS.filter(p => p.lv === lv), lo = Math.min(...items.map(p => price[p.id])), hi = Math.max(...items.map(p => price[p.id]));
        const ban = h('div', 'pp-ban'); ban.append(h('h3', '', 'Level ' + V.n + ' · ' + V.name), h('p', '', V.tag), h('span', 'rq', unlocked(lv) ? 'Open · ' + short(lo) + ' to ' + short(hi) : 'Locked · own a Level ' + (lv - 1) + ' property to unlock'));
        view.append(rail, ban); items.forEach(p => view.appendChild(listCard(p)));
      }

      function showMine() {
        const ids = Object.keys(owned).filter(id => BY[id]);
        const worth = ids.reduce((s, id) => s + price[id], 0), rent = ids.reduce((s, id) => s + rentOf[id], 0), today = lagosToday();
        const can = ids.some(id => (demo ? D.rent : (owned[id].last_rent || null)) !== today);
        const sum = h('div', 'pp-sum'); [['Portfolio value', naira(worth)], ['Rent per day', naira(rent)], ['Properties', String(ids.length)], ['Highest level', topLevel() ? 'Level ' + topLevel() : 'None yet']].forEach(([t, v]) => { const d = h('div'); d.append(h('small', '', t), h('b', '', v)); sum.appendChild(d); });
        view.appendChild(sum);
        if (!ids.length) { const e = h('div', 'pp-empty'); e.append(h('b', '', 'No property yet'), h('span', '', 'Your first home or shop starts at ₦500,000. Open Explore and begin your portfolio.')); view.appendChild(e); return; }
        const col = h('button', 'pp-btn', can ? 'Collect today’s rent' : 'Rent collected for today'); col.type = 'button'; col.disabled = !can;
        col.onclick = async () => {
          col.disabled = true; col.textContent = 'Collecting…';
          try {
            let r;
            if (demo) { D.bank += rent; D.rent = lagosToday(); r = { amount: rent }; } else { r = await api.rpc('collect_rent'); if (Ph.refreshUser) Ph.refreshUser(); }
            Ph.toast('Rent collected: +' + naira(r.amount) + ' in your bank'); if (!dead) draw();
          } catch (e) { Ph.toast(say(e)); if (!dead) draw(); }
        };
        view.appendChild(col); ids.sort((a, b) => BY[b].lv - BY[a].lv).forEach(id => view.appendChild(listCard(BY[id])));
      }

      function showDetail(id) {
        const p = BY[id]; ctx.setTitle(p.name); let from = wal.pocket >= price[id] || wal.bank < price[id] ? 'pocket' : 'bank', confirming = false;
        const hero = h('div', 'pp-hero'), im = h('div', 'pp-img'); im.innerHTML = art(p.kind, p.lv); im.appendChild(h('span', 'pp-tag' + (owned[id] ? ' own' : ''), owned[id] ? 'OWNED' : 'LEVEL ' + p.lv + ' · ' + LEVELS[p.lv - 1].name.toUpperCase())); hero.appendChild(im);
        const d = h('div', 'pp-d'); d.append(h('h2', '', p.name), h('small', '', p.area), h('p', '', p.blurb));
        const gr = h('div', 'pp-grid'); [['Price', naira(price[id])], ['Rent income', naira(rentOf[id]) + ' / day'], ['Size', p.sqm.toLocaleString() + ' m²'], [p.beds ? 'Rooms' : 'Type', p.beds ? p.beds + ' bed · ' + p.baths + ' bath' : (p.kind === 'land' ? 'Land' : 'Commercial')]].forEach(([t, v]) => { const x = h('div'); x.append(h('small', '', t), h('b', '', v)); gr.appendChild(x); });
        const act = h('div'); act.style.cssText = 'display:flex;flex-direction:column;gap:.6em'; view.append(hero, d, gr, act);
        function paintAct() {
          act.innerHTML = '';
          if (owned[id]) { act.appendChild(h('p', 'ph-note', 'You own this property. It pays rent into your bank every day.')); return; }
          if (!unlocked(p.lv)) { act.appendChild(h('p', 'ph-note', 'Locked. Own any Level ' + (p.lv - 1) + ' property to unlock Level ' + p.lv + '.')); return; }
          const src = h('div', 'pp-src'); [['pocket', 'Pay from pocket', wal.pocket], ['bank', 'Pay from bank', wal.bank]].forEach(([k, t, v]) => { const b = h('button', from === k ? 'on' : ''); b.type = 'button'; b.append(h('b', '', t), h('small', '', naira(v))); b.onclick = () => { from = k; confirming = false; paintAct(); }; src.appendChild(b); });
          const enough = wal[from] >= price[id], buy = h('button', 'pp-btn', confirming ? 'Confirm: pay ' + naira(price[id]) : enough ? 'Buy for ' + naira(price[id]) : 'Not enough in ' + from); buy.type = 'button'; buy.disabled = !enough;
          buy.onclick = async () => {
            if (!confirming) { confirming = true; paintAct(); return; }
            buy.disabled = true; buy.textContent = 'Processing…';
            try {
              if (demo) { if (D[from] < price[id]) throw new Error('not_enough_money'); D[from] -= price[id]; D.owned[id] = { last_rent: null }; }
              else { await api.rpc('buy_property', { p_prop: id, p_from: from }); if (Ph.refreshUser) Ph.refreshUser(); }
              Ph.toast('Congratulations! You now own ' + p.name); if (dead) return; detail = null; tab = 'mine'; ctx.setTitle('Property'); draw();
            } catch (e) { Ph.toast(say(e)); confirming = false; if (!dead) draw(); }
          };
          act.append(src, buy); if (confirming) { const no = h('button', 'pp-btn ghost', 'Cancel'); no.type = 'button'; no.onclick = () => { confirming = false; paintAct(); }; act.appendChild(no); }
        }
        paintAct();
      }

      Ph.on('user', (nu) => { if (dead) return; u = nu; draw(); });
      draw();
      return { destroy() { dead = true; }, back() { if (detail) { detail = null; ctx.setTitle('Property'); draw(); return true; } return false; } };
    }
  });
  /* shared with the profile view (apps/profile.js): listing text + pictures */
  g.FutaCatalog = g.FutaCatalog || {}; g.FutaCatalog.property = { LEVELS, LISTINGS, art };
})(window);
