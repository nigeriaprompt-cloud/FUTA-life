/* ==========================================================================
   FutaActs — what a player can DO with each piece of furniture.
   Needs interior/activities.js (generated from interior/activities.json by tools/build-options.py: effects + allowed venues).
   - propActs[furnitureName] = candidate activity ids.  forProp(name, venue) keeps only those the VENUE allows
     (activities.json → "venues").  So an ATM-like thing can never appear outside a bank, a bunk gives "sleep" only in hostels/homes…
   - rooms.js calls forProp() for every placed piece: if it returns something, the piece becomes clickable automatically.
     A template can still force/override with R.add(name, x, z, rot, { inter:['cook'] }) or switch it off with { inter:false }.
   - To add a new interaction: 1) add it to activities.json (effects, venues), 2) run tools/build-options.py, 3) list it below.
   ========================================================================== */
(function (g) {
  'use strict';
  const A = (g.FutaActs = g.FutaActs || {});
  const propActs = {
    bunk: ['sleep', 'study'], bed: ['sleep'], sleepmat: ['sleep'], medbed: ['checkup'],
    wardrobe: ['wardrobe'], mirror: ['check_mirror', 'get_hair'], readdesk: ['study', 'read_notice'], desk: ['study', 'print_doc'],
    cooker: ['cook'], stove_pot: ['cook'], fridge: ['snack', 'buy_drink'], freezer: ['buy_drink', 'buy_snack', 'buy_cake'],
    kcounter: ['cook'], dining: ['eat_home', 'eat_meal'], table_round: ['eat_meal'], table: ['study'],
    tvunit: ['watch_tv'], sofa: ['watch_tv'], armchair: ['watch_tv'],
    bucket: ['shower'], basin: ['shower'], washtub: ['shower'],
    dispenser: ['drink_water'], vending: ['buy_snack', 'buy_drink'],
    noticeboard: ['read_notice'], wallshelf: ['read_book'], bookrack: ['read_book', 'buy_textbook'], shelf: ['read_book'],
    counter: ['buy_snack', 'buy_drink', 'buy_cake', 'order_food', 'buy_textbook', 'buy_phone_acc', 'buy_meds', 'print_doc', 'browse_cafe'],
    gondola: ['buy_snack', 'buy_drink', 'buy_meds'], gondola_phone: ['buy_phone_acc'], rack: ['buy_meds'],
    warmer: ['order_food', 'eat_meal'], printer: ['print_doc'], pcdesk: ['use_computer', 'browse_cafe'],
    atm: ['atm'], scale: ['checkup'], bpmachine: ['checkup'],
    salonchair: ['get_hair'], washbasin: ['get_hair'],
    pulpit: ['give_talk'], altar: ['pray'], prayermat: ['pray'], prayerrow: ['pray'], pew: ['pray'], seat_row: ['attend_lecture'],
    piano: ['play_music'], drums: ['play_music'], stage: ['give_talk'], podium: ['give_talk'],
    lectseat: ['attend_lecture'], classdesk: ['attend_lecture', 'study'],
    labbench: ['lab_work'], microscope: ['lab_work'],
    globe: ['view_exhibit'], plinth: ['view_exhibit'], glasscase: ['view_exhibit'], trophycase: ['view_exhibit'],
    treadmill: ['run_treadmill'], weightbench: ['lift_weights'], dumbbells: ['lift_weights'], punchbag: ['workout'], mat: ['workout'],
    pingpong: ['play_pingpong'], chesstable: ['play_chess'], foosball: ['play_game'], pooltable: ['play_game'],
    generator: ['operate_generator'], powerpanel: ['operate_generator'], machine: ['tinker'], crate: ['tinker'], sacks: ['tinker']
  };
  const rigPoseMap = { lie: 'sleep', workout: 'lift', play: 'dance', pray: 'pray', eat: 'eat', type: 'type', teach: 'teach', read: 'read', phone: 'phone', sweep: 'cook', run: 'run', sit: 'watch', idle: 'idle' };
  const by = () => { const m = {}; ((A.data && A.data.activities) || []).forEach(a => { m[a.id] = a; }); return m; };
  let cache = null; const catalog = () => cache || (cache = by());
  Object.assign(A, {
    propActs,
    get: (id) => catalog()[id] || null,
    allowed: (id, venue) => { const a = catalog()[id]; return !!a && a.venues.indexOf(venue) >= 0; },
    /** activity ids a given furniture piece offers inside a given venue (template id) */
    forProp(name, venue) { const l = propActs[name]; if (!l) return []; return l.filter(id => A.allowed(id, venue)); },
    rigPose: (p) => rigPoseMap[p] || p || 'idle',
    /** one line describing the effect of an activity, for the menu: "+4 knowledge  −8 energy  −₦300" */
    describe(a) {
      const bits = []; const f = (n, label, icon) => { if (a[n]) bits.push((a[n] > 0 ? '+' : '−') + Math.abs(a[n]) + ' ' + icon); };
      f('energy', 'energy', '⚡'); f('hunger', 'food', '🍲'); f('mood', 'mood', '😊'); f('knowledge', 'knowledge', '📘'); if (a.cash) bits.push((a.cash < 0 ? '−₦' : '+₦') + Math.abs(a.cash).toLocaleString());
      return bits.join('  ');
    }
  });
})(typeof window !== 'undefined' ? window : globalThis);
