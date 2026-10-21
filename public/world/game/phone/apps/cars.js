/* Phone app: Cars — buy and own bikes, keke, cars, SUVs and even a helicopter with GAME money, LEVEL BY LEVEL (5 levels, cheapest vehicle ₦500,000).
   Level 1 is open. To unlock level N you must own one vehicle of level N-1 (the server checks this: supabase/07_cars.sql).
   Owned vehicles earn daily hire income into the BANK ("Collect hire income", once per Lagos day).
   Real mode: prices/ownership are read from car_catalog / car_owned (RLS) and written ONLY through RPCs buy_car / collect_car_income.
   Demo mode (no Supabase keys): a pretend wallet and garage kept in memory so you can try every level.
   The LISTINGS array below holds the text and the picture type; to add or edit a vehicle change it here AND insert/update its row in 07_cars.sql (same id).
   NAMES: items use real brand and model names (e.g. Casio G-Shock, Rolex, Toyota, Mercedes-Benz). Only the text names are real; pictures are our own generic drawings, never logos. Brand names are trademarks of their owners:
   check with a lawyer before real-money sales or public launch, and rename here (text only, ids/prices stay) if needed.
   Pictures are drawn in code (SVG, no image files). All text goes in with textContent. */
(function (g) {
  'use strict';
  const Ph = g.FutaPhone; if (!Ph) return;

  const LEVELS = [
    { n: 1, name: 'Starter', tag: 'Okada, keke and your first little car', sky: ['#f6efd9', '#dfe9d6'], gr: '#b9c9a0' },
    { n: 2, name: 'Comfort', tag: 'Hatchbacks, sedans, buses and pickups', sky: ['#f4e6c2', '#cfe1d3'], gr: '#a8c08c' },
    { n: 3, name: 'Prestige', tag: 'Executive sedans and proper SUVs', sky: ['#f7dfae', '#c9dae2'], gr: '#9db985' },
    { n: 4, name: 'Luxury', tag: 'Grand saloons, coupés and armoured rides', sky: ['#f8cf93', '#b9cee3'], gr: '#8fb07c' },
    { n: 5, name: 'Royal', tag: 'Limousines, supercars and the sky', sky: ['#3a2b63', '#e9b86a'], gr: '#5f7f62' }
  ];
  // id, level, kind (picture), name, category, price (display only; the real price comes from the server), seats, top speed km/h, fuel, body colour, blurb
  const L = (id, lv, kind, name, area, price, seats, speed, fuel, col, blurb) => ({ id, lv, kind, name, area, price, seats, speed, fuel, col, blurb });
  const LISTINGS = [
    L('c1_okada', 1, 'bike', 'Honda CG125 Okada', 'Motorbike', 520000, 2, 90, 'Petrol', '#c0392b', 'The campus favourite. Weave through traffic and never be late for a nine o’clock lecture.'),
    L('c1_keke', 1, 'keke', 'Bajaj Keke', 'Tricycle', 750000, 4, 55, 'Petrol', '#1c7a3d', 'The famous yellow-and-green tricycle that pays for itself carrying students between gates.'),
    L('c1_bike', 1, 'bike', 'Yamaha YBR 125', 'Motorbike', 950000, 2, 100, 'Petrol', '#2c6fb3', 'Light, quick and thrifty. Goes all week on a few litres of petrol.'),
    L('c1_hatch', 1, 'hatch', 'Toyota Vitz (Tokunbo)', 'Hatchback', 1900000, 4, 130, 'Petrol', '#d4a017', 'A neat used Vitz with cold air-con and a clean interior. Your first real car.'),
    L('c2_hatch', 2, 'hatch', 'Honda Fit', 'Hatchback', 2800000, 5, 150, 'Petrol', '#3a7bd5', 'Zippy around town, easy to park and kind to your fuel budget.'),
    L('c2_sedan', 2, 'sedan', 'Toyota Corolla', 'Sedan', 4500000, 5, 170, 'Petrol', '#7a7f85', 'The reliable all-rounder with a roomy boot, built for church runs and long trips home.'),
    L('c2_bus', 2, 'bus', 'Toyota Hiace Bus', 'Bus', 7000000, 14, 120, 'Diesel', '#e0a800', 'Fourteen seats on the busiest route in Akure. A proper transport business.'),
    L('c2_pick', 2, 'pickup', 'Toyota Hilux', 'Pickup', 9000000, 5, 160, 'Diesel', '#2f7a4f', 'A tough pickup with an open bed. Hauls goods, building materials and ambition.'),
    L('c3_sedan', 3, 'sedan', 'Toyota Camry', 'Sedan', 15000000, 5, 200, 'Petrol', '#1d2b4a', 'Smooth, quiet and comfortable. The executive sedan that says you have arrived.'),
    L('c3_suv', 3, 'suv', 'Toyota Highlander', 'SUV', 25000000, 7, 190, 'Hybrid', '#6b1f2a', 'Seven seats and enough room for the whole family and their luggage.'),
    L('c3_4x4', 3, 'suv', 'Toyota Land Cruiser Prado', 'SUV', 38000000, 7, 180, 'Diesel', '#3d4a2f', 'Built for rough roads and rainy seasons. No pothole in Ondo State will stop it.'),
    L('c3_pick', 3, 'pickup', 'Ford Ranger', 'Pickup', 45000000, 5, 190, 'Diesel', '#b8452e', 'A double-cab workhorse with a strong diesel engine and a tough bed.'),
    L('c4_saloon', 4, 'sedan', 'Mercedes-Benz S-Class', 'Sedan', 80000000, 5, 240, 'Petrol', '#111418', 'The flagship saloon. Whisper-quiet, hand-finished and the car for a big arrival.'),
    L('c4_range', 4, 'suv', 'Range Rover Autobiography', 'SUV', 150000000, 5, 250, 'Petrol', '#f1ede2', 'Commanding, elegant and fast. The car every big man in the city wants to be seen in.'),
    L('c4_coupe', 4, 'coupe', 'Porsche 911 Turbo', 'Coupe', 220000000, 2, 300, 'Petrol', '#c0392b', 'Low, loud and lovely. A roaring engine and eyes on you at every junction.'),
    L('c4_armor', 4, 'suv', 'Cadillac Escalade (Armoured)', 'SUV', 250000000, 5, 210, 'Diesel', '#2a2d31', 'Reinforced glass and body panels. Travel anywhere with total peace of mind.'),
    L('c5_limo', 5, 'limo', 'Rolls-Royce Phantom Limousine', 'Limousine', 450000000, 8, 220, 'Petrol', '#111418', 'Eight seats, a mini bar and gold trim all around. Weddings and welcomes, in style.'),
    L('c5_super', 5, 'coupe', 'Lamborghini Aventador', 'Supercar', 900000000, 2, 350, 'Petrol', '#4b2fbf', 'A V12 supercar that goes from zero to a hundred before you finish blinking.'),
    L('c5_heli', 5, 'heli', 'Airbus H125 Helicopter', 'Helicopter', 2000000000, 5, 260, 'Jet fuel', '#c9a24a', 'Skip the traffic entirely. Take off from your own pad and look down on Akure.')
  ];
  const BY = Object.fromEntries(LISTINGS.map(p => [p.id, p]));
  const ERR = {
    level_locked: 'Own a vehicle from the level below to unlock this one.', not_enough_money: 'You do not have enough money in that account.', already_owned: 'You already own this vehicle.',
    nothing_to_collect: 'No hire income to collect right now. Come back tomorrow.', not_signed_in: 'Sign in (Settings) first.', no_such_car: 'That vehicle is not available.', bad_source: 'Pick pocket or bank.'
  };
  const say = (e) => ERR[e && e.message] || (e && e.message) || 'Something went wrong. Try again.';
  const naira = (n) => '₦' + Number(n || 0).toLocaleString('en-NG');
  const short = (n) => n >= 1e9 ? '₦' + +(n / 1e9).toFixed(2) + 'B' : n >= 1e6 ? '₦' + +(n / 1e6).toFixed(2) + 'M' : n >= 1e3 ? '₦' + +(n / 1e3).toFixed(0) + 'K' : '₦' + n;
  const h = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; };
  const lagosToday = () => new Date().toLocaleDateString('en-CA', { timeZone: 'Africa/Lagos' });

  /* ---------------- pictures: side-view scenes drawn from kind + level + colour (our own SVG, never user text) ---------------- */
  let uid = 0;
  function art(kind, lv, col) {
    const V = LEVELS[lv - 1], id = 'ca' + (++uid), night = lv === 5, dk = '#1b1b1d', glass = night ? '#9ec3e8' : '#bcd9ea', lit = '#fff3b0', gold = lv >= 4;
    const rect = (x, y, w, hh, f, extra) => '<rect x="' + x + '" y="' + y + '" width="' + w + '" height="' + hh + '" fill="' + f + '"' + (extra || '') + '/>';
    const poly = (pts, f, extra) => '<polygon points="' + pts + '" fill="' + f + '"' + (extra || '') + '/>';
    const wheel = (x, r) => '<circle cx="' + x + '" cy="' + (144 - r) + '" r="' + r + '" fill="' + dk + '"/><circle cx="' + x + '" cy="' + (144 - r) + '" r="' + r * .55 + '" fill="#d5d9dc"/><circle cx="' + x + '" cy="' + (144 - r) + '" r="' + r * .18 + '" fill="#555"/>';
    const edge = ' stroke="' + dk + '" stroke-opacity=".45"';
    // generic car: body rect + cabin trapezoid. o: x0,x1,top (body top), cab [xa,xb,slopeFront(left),slopeRear(right),height], wx wheel xs, r wheel radius
    const car = (o) => {
      const bot = 128, [a, b, fa, fb, hc] = o.cab, mid = (a + b) / 2, roofY = o.top - hc; let s = '<ellipse cx="' + (o.x0 + o.x1) / 2 + '" cy="146" rx="' + ((o.x1 - o.x0) / 2 + 8) + '" ry="4" fill="#0003"/>';
      s += rect(o.x0, o.top, o.x1 - o.x0, bot - o.top, col, ' rx="9"' + edge) + poly(a + ',' + o.top + ' ' + (a + fa) + ',' + roofY + ' ' + (b - fb) + ',' + roofY + ' ' + b + ',' + o.top, col, edge);
      s += poly((a + 5) + ',' + (o.top - 1) + ' ' + (a + fa + 3) + ',' + (roofY + 5) + ' ' + (mid - 2) + ',' + (roofY + 5) + ' ' + (mid - 2) + ',' + (o.top - 1), glass) + poly((mid + 2) + ',' + (o.top - 1) + ' ' + (mid + 2) + ',' + (roofY + 5) + ' ' + (b - fb - 3) + ',' + (roofY + 5) + ' ' + (b - 5) + ',' + (o.top - 1), glass);
      if (o.extra) s += o.extra;
      s += '<path d="M' + mid + ' ' + roofY + 'v' + (bot - roofY - 4) + '" stroke="' + dk + '" stroke-opacity=".35"/>' + rect(mid - 12, o.top + 7, 9, 2.5, dk, ' rx="1" opacity=".5"');
      if (gold) s += rect(o.x0 + 4, o.top + 12, o.x1 - o.x0 - 8, 2.5, '#d9b550');
      s += rect(o.x1 - 6, o.top + 5, 6, 7, lit, ' rx="2"') + rect(o.x0, o.top + 5, 5, 7, '#d23a2a', ' rx="2"') + rect(o.x0 + 3, bot - 4, o.x1 - o.x0 - 6, 5, dk, ' rx="2" opacity=".55"');
      o.wx.forEach(x => { s += '<path d="M' + (x - o.r - 4) + ' 131a' + (o.r + 4) + ' ' + (o.r + 4) + ' 0 0 1 ' + (2 * o.r + 8) + ' 0z" fill="' + dk + '"/>' + wheel(x, o.r); });
      return s;
    };
    let b = '';
    if (kind === 'hatch') b = car({ x0: 84, x1: 236, top: 102, cab: [112, 222, 26, 20, 26], wx: [118, 204], r: 12 });
    else if (kind === 'sedan') b = car({ x0: 64, x1: 256, top: 104, cab: [108, 206, 28, 26, 25], wx: [102, 220], r: 12 });
    else if (kind === 'suv') b = car({ x0: 68, x1: 252, top: 94, cab: [86, 238, 22, 14, 30], wx: [108, 214], r: 14 });
    else if (kind === 'coupe') b = car({ x0: 60, x1: 264, top: 110, cab: [118, 212, 38, 26, 18], wx: [100, 226], r: 12, extra: rect(60, 98, 22, 4, dk, ' rx="1"') + rect(66, 98, 3, 12, dk) });
    else if (kind === 'pickup') b = car({ x0: 62, x1: 258, top: 100, cab: [158, 244, 22, 14, 26], wx: [104, 220], r: 14, extra: rect(70, 94, 84, 6, '#0004') + rect(68, 92, 88, 3, dk, ' opacity=".6"') });
    else if (kind === 'limo') {
      b = car({ x0: 24, x1: 296, top: 106, cab: [74, 270, 20, 18, 20], wx: [64, 244], r: 12 });
      for (let i = 1; i < 4; i++) b += '<path d="M' + (74 + i * 49) + ' 90v16" stroke="' + dk + '" stroke-opacity=".5"/>';
    } else if (kind === 'bus') {
      b = '<ellipse cx="160" cy="146" rx="112" ry="4" fill="#0003"/>' + rect(54, 70, 214, 58, col, ' rx="8"' + edge) + rect(54, 112, 214, 6, '#0003');
      for (let i = 0; i < 6; i++) b += rect(64 + i * 28, 78, 22, 18, glass, ' rx="2"');
      b += poly('236,76 262,76 266,104 236,104', glass) + rect(54, 100, 214, 3, '#fff', ' opacity=".5"') + rect(262, 108, 6, 8, lit, ' rx="2"') + rect(54, 108, 5, 8, '#d23a2a', ' rx="2"') + rect(60, 124, 202, 5, dk, ' rx="2" opacity=".55"') + [96, 226].map(x => '<path d="M' + (x - 18) + ' 131a18 18 0 0 1 36 0z" fill="' + dk + '"/>' + wheel(x, 14)).join('');
    } else if (kind === 'bike') {
      b = '<ellipse cx="160" cy="146" rx="80" ry="3.5" fill="#0003"/>' + wheel(110, 14) + wheel(212, 14) + '<path d="M110 130L148 108H192L212 130M148 108L132 130M192 108l8-18" stroke="' + dk + '" stroke-width="4" fill="none" stroke-linecap="round"/>' + '<path d="M212 130l-9-40h14" stroke="#555" stroke-width="3.5" fill="none" stroke-linecap="round"/>' +
        '<path d="M142 106q10-16 34-10l14 12z" fill="' + col + '"' + edge + '/>' + rect(112, 98, 36, 8, dk, ' rx="4"') + '<circle cx="219" cy="92" r="5" fill="' + lit + '" stroke="' + dk + '"/>' + '<path d="M104 118l-20 6" stroke="#888" stroke-width="3"/>';
    } else if (kind === 'keke') {
      b = '<ellipse cx="160" cy="146" rx="100" ry="4" fill="#0003"/>' + rect(96, 98, 120, 30, col, ' rx="6"' + edge) + '<path d="M92 98V66h108q12 0 16 14l6 18z" fill="#f5c542"' + edge + '/>' + rect(100, 70, 4, 28, dk) + rect(176, 70, 4, 28, dk) + poly('200,68 214,80 220,98 200,98', glass) + '<path d="M222 128q0-26 14-28l6 6-6 22z" fill="' + col + '"' + edge + '/>' + rect(216, 104, 6, 7, lit, ' rx="2"') + rect(92, 108, 5, 8, '#d23a2a', ' rx="2"') + wheel(124, 12) + wheel(160, 12) + wheel(232, 12) + '<path d="M120 98q20-12 50 0" stroke="#c9a24a" stroke-width="2.5" fill="none"/>';
    } else {   // heli
      b = '<circle cx="160" cy="146" r="62" fill="#e6c455" opacity=".35"/><text x="160" y="150" font-size="34" fill="#0004" text-anchor="middle" font-family="Georgia,serif" font-weight="700">H</text>' +
        poly('108,96 24,90 24,102 108,108', col, edge) + poly('24,90 12,66 36,88', col, edge) + '<ellipse cx="156" cy="100" rx="62" ry="27" fill="' + col + '"' + edge + '/>' + '<path d="M168 82q38 0 46 20q-20 6-46 4z" fill="' + glass + '"/>' + rect(153, 68, 6, 16, dk) + rect(60, 63, 190, 4, dk, ' rx="2"') + rect(12, 70, 3, 22, dk, ' rx="1"') +
        '<path d="M118 126v10M190 126v10M96 138h124" stroke="' + dk + '" stroke-width="3.5" stroke-linecap="round"/>' + (gold ? rect(104, 104, 104, 3, '#d9b550') : '');
    }
    const sun = night ? '<circle cx="268" cy="28" r="11" fill="#fff4cf"/><circle cx="273" cy="25" r="10" fill="#3a2b63"/>' + [[40, 20], [90, 36], [200, 16], [240, 44], [20, 54]].map(s => '<circle cx="' + s[0] + '" cy="' + s[1] + '" r="1.2" fill="#fff"/>').join('') : '<circle cx="' + (lv % 2 ? 44 : 274) + '" cy="30" r="14" fill="#fff3c4" opacity=".9"/>';
    const sky = [[0, 96, 30, 44], [34, 96, 26, 30], [62, 96, 34, 52], [250, 96, 28, 40], [280, 96, 40, 56]].map(r => rect(r[0], 140 - r[3] - 14, r[2], r[3], night ? '#2a2150' : '#0001')).join('');
    return '<svg viewBox="0 0 320 170" preserveAspectRatio="xMidYMid slice" role="img" aria-hidden="true"><defs><linearGradient id="' + id + '" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="' + V.sky[0] + '"/><stop offset="1" stop-color="' + V.sky[1] + '"/></linearGradient></defs>' +
      '<rect width="320" height="170" fill="url(#' + id + ')"/>' + sun + sky + '<rect y="122" width="320" height="22" fill="' + V.gr + '"/><rect y="144" width="320" height="26" fill="#4a4f55"/><path d="M0 144h320" stroke="#d9d2bd" stroke-width="2"/><path d="M0 160h320" stroke="#f0d78c" stroke-width="2" stroke-dasharray="16 12"/>' + b + '</svg>';
  }

  const CSS = '.pp{display:flex;flex-direction:column;flex:1;min-height:0;background:var(--cream)}' +
    '.pp .ph-tabs{position:sticky;top:0;z-index:3}' +
    '.pp-wal{display:flex;gap:.5em;padding:.7em 1em 0}.pp-wal div{flex:1;background:#fff;border:1px solid var(--line);border-radius:.9em;padding:.5em .7em}.pp-wal small{display:block;color:var(--mute);font-size:.78em;letter-spacing:.06em;text-transform:uppercase}.pp-wal b{font:700 1em Georgia,serif;color:var(--emerald)}' +
    '.pp-view{flex:1;padding:.7em 1em 1.4em;display:flex;flex-direction:column;gap:.8em}' +
    '.pp-rail{display:flex;gap:.5em;overflow-x:auto;scrollbar-width:none;padding:.1em .1em .3em}.pp-lv{flex:none;width:5.6em;padding:.55em .3em;border-radius:1em;background:#fff;border:1px solid var(--line);text-align:center;position:relative}.pp-lv i{display:grid;place-items:center;width:2em;height:2em;margin:0 auto .25em;border-radius:50%;background:var(--emerald);color:var(--gold2);font:700 1em Georgia,serif;font-style:normal}.pp-lv span{display:block;font-size:.78em;font-weight:600;color:var(--ink)}.pp-lv.on{border-color:var(--gold);box-shadow:0 0 0 .14em rgba(201,162,74,.3)}.pp-lv.lock{opacity:.7}.pp-lv.lock i{background:#b9b09a}.pp-lv svg{position:absolute;top:.35em;right:.4em;width:1em;height:1em;stroke:var(--mute);fill:none;stroke-width:2}' +
    '.pp-ban{border-radius:1.1em;padding:.9em 1em;color:#f6efdc;background:linear-gradient(135deg,#2c4f86,#14264a);border:1px solid var(--gold)}.pp-ban h3{margin:0;font:600 1.25em Georgia,serif;color:var(--gold2)}.pp-ban p{margin:.25em 0 0;opacity:.88;font-size:.9em}.pp-ban .rq{margin-top:.5em;display:inline-block;background:rgba(240,215,140,.16);border:1px solid rgba(240,215,140,.4);border-radius:2em;padding:.2em .7em;font-size:.82em;color:var(--gold2)}' +
    '.pp-card{background:#fff;border:1px solid var(--line);border-radius:1.1em;overflow:hidden;text-align:left;width:100%;display:block;box-shadow:0 .2em .6em rgba(40,30,10,.06)}.pp-card:active{transform:scale(.99)}.pp-img{aspect-ratio:16/8.6;position:relative;overflow:hidden;background:#e8dfc6}.pp-img svg{display:block;width:100%;height:100%}' +
    '.pp-tag{position:absolute;top:.6em;left:.6em;background:rgba(18,57,42,.9);color:var(--gold2);font-size:.75em;font-weight:700;letter-spacing:.05em;padding:.25em .7em;border-radius:2em;border:1px solid var(--gold)}.pp-tag.own{background:var(--gold);color:var(--emerald)}' +
    '.pp-info{padding:.7em .85em .85em}.pp-info b{display:block;font:700 1.05em Georgia,serif;color:var(--emerald)}.pp-info small{color:var(--mute);display:block;margin-top:.1em}.pp-spec{display:flex;gap:.9em;margin:.5em 0 0;color:var(--ink);font-size:.85em}.pp-spec span{white-space:nowrap}.pp-price{display:flex;justify-content:space-between;align-items:baseline;margin-top:.55em;padding-top:.5em;border-top:1px dashed var(--line)}.pp-price strong{font:700 1.25em Georgia,serif;color:#8a6a2a}.pp-price em{font-style:normal;color:var(--mute);font-size:.8em}' +
    '.pp-hero{border-radius:1.1em;overflow:hidden;border:1px solid var(--gold)}.pp-hero .pp-img{aspect-ratio:16/9}.pp-d h2{margin:.1em 0 0;font:700 1.35em Georgia,serif;color:var(--emerald)}.pp-d small{color:var(--mute)}.pp-d p{margin:.4em 0 0;line-height:1.45;color:var(--ink)}' +
    '.pp-grid{display:grid;grid-template-columns:1fr 1fr;gap:.5em}.pp-grid div{background:#fff;border:1px solid var(--line);border-radius:.8em;padding:.5em .7em}.pp-grid small{display:block;color:var(--mute);font-size:.78em}.pp-grid b{font-weight:700}' +
    '.pp-src{display:grid;grid-template-columns:1fr 1fr;gap:.5em}.pp-src button{padding:.6em;border-radius:.9em;background:#fff;border:1.5px solid var(--line);text-align:left}.pp-src button.on{border-color:var(--gold);background:#fbf3dc}.pp-src small{display:block;color:var(--mute)}.pp-src b{font-size:.95em}' +
    '.pp-btn{background:var(--emerald);color:var(--gold2);font-weight:700;padding:.9em;border-radius:.95em;text-align:center;border:1px solid var(--gold);width:100%}.pp-btn[disabled]{opacity:.45}.pp-btn.ghost{background:#fff;color:var(--emerald)}' +
    '.pp-sum{background:linear-gradient(135deg,#2c4f86,#14264a);color:#f6efdc;border:1px solid var(--gold);border-radius:1.1em;padding:1em;display:grid;grid-template-columns:1fr 1fr;gap:.6em}.pp-sum small{display:block;opacity:.8;font-size:.78em;text-transform:uppercase;letter-spacing:.06em}.pp-sum b{font:700 1.15em Georgia,serif;color:var(--gold2)}' +
    '.pp-empty{text-align:center;color:var(--mute);padding:2em 1em}.pp-empty b{display:block;font:700 1.1em Georgia,serif;color:var(--emerald);margin-bottom:.3em}';

  /* demo-mode pretend state (kept while the page is open). Big bank balance on purpose so every level can be tried. */
  const D = { pocket: 5000000, bank: 2500000000, owned: {}, inc: null };

  Ph.registerApp({
    id: 'cars', name: 'Cars', icon: 'car', color: ['#4a6fa5', '#1b2f52'],
    mount(body, ctx) {
      const demo = Ph.demo(), api = Ph.api(); let u = Ph.getUser(), tab = 'explore', lv = 1, dead = false, detail = null;
      let wal = { pocket: 0, bank: 0 }, owned = {}; const price = {}, rentOf = {};   // owned: id -> {last_income}; price/rentOf: server numbers
      LISTINGS.forEach(p => { price[p.id] = p.price; rentOf[p.id] = Math.round(p.price / 1000); });

      const style = h('style'); style.textContent = CSS; body.appendChild(style);
      const root = h('div', 'pp'); body.appendChild(root);
      const wBox = h('div', 'pp-wal'), tabs = h('div', 'ph-tabs'), view = h('div', 'pp-view'); root.append(wBox, tabs, view);
      [['explore', 'Showroom'], ['mine', 'My Garage']].forEach(([k, t]) => { const b = h('button', k === 'explore' ? 'on' : '', t); b.type = 'button'; b.dataset.t = k; b.onclick = () => { detail = null; ctx.setTitle('Cars'); tab = k; draw(); }; tabs.appendChild(b); });

      const topLevel = () => Object.keys(owned).reduce((m, id) => Math.max(m, BY[id] ? BY[id].lv : 0), 0);
      const unlocked = (n) => n === 1 || Object.keys(owned).some(id => BY[id] && BY[id].lv === n - 1);
      function paintWallet() { wBox.innerHTML = ''; [['In pocket', wal.pocket], ['In bank', wal.bank]].forEach(([t, v]) => { const d = h('div'); d.append(h('small', '', t), h('b', '', naira(v))); wBox.appendChild(d); }); }

      async function load() {
        if (!u) { view.innerHTML = ''; wBox.innerHTML = ''; view.appendChild(h('p', 'pp-empty', 'Sign in (Settings) to browse and buy vehicles.')); return false; }
        if (demo) { wal = { pocket: D.pocket, bank: D.bank }; owned = D.owned; return true; }
        try {
          const sb = api.sb();
          const [c, o] = await Promise.all([sb.from('car_catalog').select('id,level,price,income_daily'), sb.from('car_owned').select('car_id,last_income')]);
          if (c.error) throw c.error; if (o.error) throw o.error;
          (c.data || []).forEach(r => { price[r.id] = Number(r.price); rentOf[r.id] = Number(r.income_daily); });
          owned = {}; (o.data || []).forEach(r => { owned[r.car_id] = { last_income: r.last_income }; });
          const w = (Ph.getUser() || u).wallet || {}; wal = { pocket: Number(w.pocket || 0), bank: Number(w.bank || 0) };
          return true;
        } catch (e) { view.innerHTML = ''; view.appendChild(h('p', 'pp-empty', 'Could not load vehicles: ' + say(e) + ' (run supabase/07_cars.sql if you have not yet)')); return false; }
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
        const sp = h('div', 'pp-spec'); sp.appendChild(h('span', '', p.seats + ' seats')); sp.appendChild(h('span', '', p.speed + ' km/h')); sp.appendChild(h('span', '', p.fuel)); inf.appendChild(sp);
        const pr = h('div', 'pp-price'); pr.append(h('strong', '', naira(price[p.id])), h('em', '', 'earns ' + short(rentOf[p.id]) + '/day')); inf.appendChild(pr);
        c.append(im, inf); c.onclick = () => { detail = p.id; draw(); }; return c;
      }

      function showExplore() {
        const rail = h('div', 'pp-rail');
        LEVELS.forEach(V => { const b = h('button', 'pp-lv' + (V.n === lv ? ' on' : '') + (unlocked(V.n) ? '' : ' lock')); b.type = 'button'; b.append(h('i', '', String(V.n)), h('span', '', V.name)); if (!unlocked(V.n)) b.insertAdjacentHTML('beforeend', ctx.icons.lock); b.onclick = () => { lv = V.n; draw(); }; rail.appendChild(b); });
        const V = LEVELS[lv - 1], items = LISTINGS.filter(p => p.lv === lv), lo = Math.min(...items.map(p => price[p.id])), hi = Math.max(...items.map(p => price[p.id]));
        const ban = h('div', 'pp-ban'); ban.append(h('h3', '', 'Level ' + V.n + ' · ' + V.name), h('p', '', V.tag), h('span', 'rq', unlocked(lv) ? 'Open · ' + short(lo) + ' to ' + short(hi) : 'Locked · own a Level ' + (lv - 1) + ' vehicle to unlock'));
        view.append(rail, ban); items.forEach(p => view.appendChild(listCard(p)));
      }

      function showMine() {
        const ids = Object.keys(owned).filter(id => BY[id]);
        const worth = ids.reduce((s, id) => s + price[id], 0), rent = ids.reduce((s, id) => s + rentOf[id], 0), today = lagosToday();
        const can = ids.some(id => (demo ? D.inc : (owned[id].last_income || null)) !== today);
        const sum = h('div', 'pp-sum'); [['Garage value', naira(worth)], ['Income per day', naira(rent)], ['Vehicles', String(ids.length)], ['Highest level', topLevel() ? 'Level ' + topLevel() : 'None yet']].forEach(([t, v]) => { const d = h('div'); d.append(h('small', '', t), h('b', '', v)); sum.appendChild(d); });
        view.appendChild(sum);
        if (!ids.length) { const e = h('div', 'pp-empty'); e.append(h('b', '', 'Your garage is empty'), h('span', '', 'Your first ride starts at ₦500,000. Open the Showroom and start your collection.')); view.appendChild(e); return; }
        const col = h('button', 'pp-btn', can ? 'Collect today’s hire income' : 'Hire income collected today'); col.type = 'button'; col.disabled = !can;
        col.onclick = async () => {
          col.disabled = true; col.textContent = 'Collecting…';
          try {
            let r;
            if (demo) { D.bank += rent; D.inc = lagosToday(); r = { amount: rent }; } else { r = await api.rpc('collect_car_income'); if (Ph.refreshUser) Ph.refreshUser(); }
            Ph.toast('Hire income collected: +' + naira(r.amount) + ' in your bank'); if (!dead) draw();
          } catch (e) { Ph.toast(say(e)); if (!dead) draw(); }
        };
        view.appendChild(col); ids.sort((a, b) => BY[b].lv - BY[a].lv).forEach(id => view.appendChild(listCard(BY[id])));
      }

      function showDetail(id) {
        const p = BY[id]; ctx.setTitle(p.name); let from = wal.pocket >= price[id] || wal.bank < price[id] ? 'pocket' : 'bank', confirming = false;
        const hero = h('div', 'pp-hero'), im = h('div', 'pp-img'); im.innerHTML = art(p.kind, p.lv, p.col); im.appendChild(h('span', 'pp-tag' + (owned[id] ? ' own' : ''), owned[id] ? 'OWNED' : 'LEVEL ' + p.lv + ' · ' + LEVELS[p.lv - 1].name.toUpperCase())); hero.appendChild(im);
        const d = h('div', 'pp-d'); d.append(h('h2', '', p.name), h('small', '', p.area), h('p', '', p.blurb));
        const gr = h('div', 'pp-grid'); [['Price', naira(price[id])], ['Hire income', naira(rentOf[id]) + ' / day'], ['Top speed', p.speed + ' km/h'], ['Seats · Fuel', p.seats + ' · ' + p.fuel]].forEach(([t, v]) => { const x = h('div'); x.append(h('small', '', t), h('b', '', v)); gr.appendChild(x); });
        const act = h('div'); act.style.cssText = 'display:flex;flex-direction:column;gap:.6em'; view.append(hero, d, gr, act);
        function paintAct() {
          act.innerHTML = '';
          if (owned[id]) { act.appendChild(h('p', 'ph-note', 'This vehicle is in your garage. It earns hire income into your bank every day.')); return; }
          if (!unlocked(p.lv)) { act.appendChild(h('p', 'ph-note', 'Locked. Own any Level ' + (p.lv - 1) + ' vehicle to unlock Level ' + p.lv + '.')); return; }
          const src = h('div', 'pp-src'); [['pocket', 'Pay from pocket', wal.pocket], ['bank', 'Pay from bank', wal.bank]].forEach(([k, t, v]) => { const b = h('button', from === k ? 'on' : ''); b.type = 'button'; b.append(h('b', '', t), h('small', '', naira(v))); b.onclick = () => { from = k; confirming = false; paintAct(); }; src.appendChild(b); });
          const enough = wal[from] >= price[id], buy = h('button', 'pp-btn', confirming ? 'Confirm: pay ' + naira(price[id]) : enough ? 'Buy for ' + naira(price[id]) : 'Not enough in ' + from); buy.type = 'button'; buy.disabled = !enough;
          buy.onclick = async () => {
            if (!confirming) { confirming = true; paintAct(); return; }
            buy.disabled = true; buy.textContent = 'Processing…';
            try {
              if (demo) { if (D[from] < price[id]) throw new Error('not_enough_money'); D[from] -= price[id]; D.owned[id] = { last_income: null }; }
              else { await api.rpc('buy_car', { p_car: id, p_from: from }); if (Ph.refreshUser) Ph.refreshUser(); }
              Ph.toast('Congratulations! Your new ride: ' + p.name); if (dead) return; detail = null; tab = 'mine'; ctx.setTitle('Cars'); draw();
            } catch (e) { Ph.toast(say(e)); confirming = false; if (!dead) draw(); }
          };
          act.append(src, buy); if (confirming) { const no = h('button', 'pp-btn ghost', 'Cancel'); no.type = 'button'; no.onclick = () => { confirming = false; paintAct(); }; act.appendChild(no); }
        }
        paintAct();
      }

      Ph.on('user', (nu) => { if (dead) return; u = nu; draw(); });
      draw();
      return { destroy() { dead = true; }, back() { if (detail) { detail = null; ctx.setTitle('Cars'); draw(); return true; } return false; } };
    }
  });
  /* shared with the profile view (apps/profile.js): listing text + pictures */
  g.FutaCatalog = g.FutaCatalog || {}; g.FutaCatalog.cars = { LEVELS, LISTINGS, art };
})(window);
