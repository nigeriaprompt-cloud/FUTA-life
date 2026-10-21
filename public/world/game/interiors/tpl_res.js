/* Residential templates: hostel (student room + kitchenette + bath corner), house (home).  Reference style for other template files. */
(function (g) {
  'use strict';
  const D = g.FutaTemplates, { SEC, CLEAN } = D;

  /* ------------------------------------------------------------ HOSTEL */
  D.def('hostel', {
    title: 'Hostel', icon: '🛏️', w: 12, d: 9, h: 2.9, venue: 'hostel', doorAt: 6,
    theme: { floor: { type: 'tile', c1: '#e9e1d0', c2: '#d3c8b0' }, wall: '#f2ead8', wainscot: '#9fc7b6', trim: '#ffffff', curtain: '#2f6f8f' },
    windows: [{ wall: 'back', at: 4.6, w: 1.5 }, { wall: 'back', at: 9.2, w: 1.5 }, { wall: 'right', at: 1.5, w: 1.3 }, { wall: 'left', at: 8.0, w: 1.3 }],
    build(R, C) {
      const warm = ['#2f6f8f', '#7a3b4a', '#3d8a4c', '#6b3fa0'];
      // sleeping area: four bunks (eight beds), two on each side wall
      R.against('bunk', 'left', 2.9, { c: C.pick(warm) }); R.against('bunk', 'left', 4.2, { c: C.pick(warm) });
      R.against('bunk', 'right', 3.4, { c: C.pick(warm) }); R.against('bunk', 'right', 4.7, { c: C.pick(warm) });
      R.against('wardrobe', 'back', 1.1); R.against('wardrobe', 'back', 2.3);
      // reading corner
      R.against('readdesk', 'left', 6.2); R.add('chair', 1.7, 6.2, 270); R.against('readdesk', 'left', 7.7, { c: '#d9b88a' }); R.add('chair', 1.7, 7.7, 270);
      R.add('lamp', 0.45, 5.2, 0); R.add('plant', 0.45, 8.6, 0);
      // wall: notice board, mirror, clock
      R.onWall('noticeboard', 'back', 6.5, { w: 1.2 }); R.onWall('mirror', 'back', 7.6); R.onWall('wallclock', 'back', 5.6, { gap: 0 });
      // kitchenette (back-right): counter, gas cooker, fridge, water dispenser
      R.against('kcounter', 'back', 9.0); R.against('cooker', 'back', 10.6); R.against('fridge', 'back', 11.5);
      R.against('dispenser', 'right', 6.4);
      // bath corner (bucket bath, washtub) + shoe rack by the door
      R.against('washtub', 'right', 7.7); R.against('bucket', 'right', 8.4); R.against('shoerack', 'front', 8.6);
      // living: sofa facing the TV, rug, small table
      R.add('rug', 3.9, 7.0, 0, { w: 2.8, d: 1.8, c: '#2f5d7a', c2: '#d4af37' }); R.add('sofa', 3.9, 6.55, 0, { c: '#b5833a' }); R.against('tvunit', 'front', 3.9); R.add('coffeetable', 3.9, 7.6, 0);
      R.add('table_round', 7.8, 6.0, 0); R.add('stool', 6.95, 6.0, 0); R.add('stool', 8.65, 6.0, 0);
      R.ceilingLights(3, 2); R.sign(C.title.toUpperCase(), 6.0, 2.35, 0.1, 2.2, 0.32, 0, { bg: '#16352c', fg: '#f6e7b4' });
    },
    npcs: [
      { role: 'student', n: 3, beh: 'sit', sit: ['chair', 'sofa', 'stool'], hours: 'home' },
      { role: 'student', n: 2, beh: 'post', at: [[6.9, 7.6, 3.5], [9.0, 7.4, 3.0]], pose: 'phone', hours: 'home' },
      { role: 'student', n: 1, beh: 'post', at: [[10.6, 1.3, 0]], pose: 'cook', hours: 'home', tag: 'cook' },
      { role: 'student', n: 2, beh: 'lie', on: ['bunk'], hours: 'night' },
      CLEAN([2.5, 4, 11, 8.2])
    ]
  });
})(typeof window !== 'undefined' ? window : globalThis);
