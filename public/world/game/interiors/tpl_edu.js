/* Education / admin templates. STEP 1 = library only. Next in docs/INTERIORS_HANDOFF.md §2.1: lecture_theatre, auditorium, computer_lab, lab,
   faculty, admin_office, primary_school, student_union, museum, business_centre (security NPC hours:'always' in the first eight; NO ATM). */
(function (g) {
  'use strict';
  const D = g.FutaTemplates, F = g.FutaFurn, { SEC, PATROL, CLEAN, STAFF } = D;

  /* lecture bench row WITH working seats (the catalogue's `lectseat` has none). Faces +Z at rotation 0; rotate 180 to face the stage at the back wall. */
  F.def('lect_row', { size: [3.6, 0.9], spot: [0, -0.9, 0],
    _seatN(o) { const n = o.n || 6, a = []; for (let i = 0; i < n; i++) a.push({ x: (i - (n - 1) / 2) * 0.6, z: -0.15, face: 0, y: 0.46 }); return a; },
    draw(b, o) { const n = o.n || 6, L = n * 0.6; this.size = [L, 0.9]; b.box(0, 0.72, 0.25, L, 0.05, 0.38, o.c || '#cf9f66'); b.box(0, 0, 0.25, L, 0.72, 0.04, '#454b52');
      for (let i = 0; i < n; i++) { const x = (i - (n - 1) / 2) * 0.6; b.box(x, 0.43, -0.15, 0.46, 0.06, 0.42, o.c2 || '#3d5a80'); b.box(x, 0.5, -0.38, 0.46, 0.38, 0.05, o.c2 || '#3d5a80'); b.box(x, 0, -0.15, 0.05, 0.43, 0.05, '#454b52'); } } });


  /* auditorium row: padded seats, faces +Z at rotation 0 (rotate 180 to face the stage) */
  F.def('aud_row', { size: [3.3, 0.6], spot: [0, -0.8, 0],
    _seatN(o) { const n = o.n || 6, a = []; for (let i = 0; i < n; i++) a.push({ x: (i - (n - 1) / 2) * 0.55, z: 0, face: 0, y: 0.46 }); return a; },
    draw(b, o) { const n = o.n || 6, c = o.c || '#8c1c3a'; this.size = [n * 0.55, 0.6];
      for (let i = 0; i < n; i++) { const x = (i - (n - 1) / 2) * 0.55; b.box(x, 0.4, 0, 0.5, 0.08, 0.5, c); b.box(x, 0.48, -0.24, 0.5, 0.5, 0.08, c); b.box(x, 0, 0, 0.06, 0.4, 0.06, '#2b2b30'); }
      for (const sx of [-1, 1]) b.box(sx * (n * 0.275 + 0.02), 0.3, 0, 0.05, 0.36, 0.5, '#3a2a20'); } });

  /* lab station: bench with a microscope and flasks, two stools on the near side */
  F.def('lab_station', { size: [2.2, 1.4], spot: [0, 0.95, Math.PI],
    seat: [{ x: -0.5, z: 0.85, face: Math.PI, y: 0.62 }, { x: 0.5, z: 0.85, face: Math.PI, y: 0.62 }],
    draw(b, o) { b.box(0, 0, -0.25, 2.2, 0.85, 0.7, '#d5d9dc'); b.box(0, 0.85, -0.25, 2.24, 0.05, 0.74, '#2b3a44');
      b.box(-0.6, 0.9, -0.3, 0.25, 0.03, 0.3, '#454b52'); b.box(-0.6, 0.93, -0.38, 0.05, 0.28, 0.05, '#1b1b1f'); b.tilt(-0.6, 1.1, -0.34, 0.05, 0.26, 0.05, 0.6, '#f3f0ea');
      [0.1, 0.35, 0.6].forEach((x, i) => b.cyl(x, 0.9, -0.3, 0.07, 0.16 + (i % 2) * 0.06, ['#9fd6f5', '#f4c6d6', '#bfe8c0'][i], { seg: 8, r2: 0.04, layer: 'glass' }));
      b.box(0.85, 0.9, -0.25, 0.3, 0.12, 0.2, '#b3362e');
      for (const sx of [-0.5, 0.5]) { b.cyl(sx, 0, 0.85, 0.02, 0.6, '#8b929a', { seg: 5 }); b.cyl(sx, 0.6, 0.85, 0.17, 0.05, '#1f7a74', { seg: 10 }); } } });

  /* ------------------------------------------------------------ LIBRARY (Albert Ilemobade Library) */
  D.def('library', {
    title: 'Library', icon: '📚', w: 14, d: 10, h: 3.4, venue: 'library', doorAt: 7, security: true,
    theme: { floor: { type: 'wood', c1: '#b98a5a', c2: '#a67a4c' }, wall: '#f1ead9', wainscot: '#2f5d4a', trim: '#ffffff', accent: '#d9b24a', curtain: '#2f5d4a' },
    windows: [{ wall: 'back', at: 4.2, w: 1.6 }, { wall: 'back', at: 9.8, w: 1.6 }, { wall: 'right', at: 4.5, w: 1.6 }],
    build(R, C) {
      const wood = ['#6b4428', '#7a5237'];
      // book stacks along the back wall and the left wall
      [1.0, 2.3, 3.6, 5.1, 6.4, 7.7, 11.6, 12.9].forEach((x, i) => R.against('shelf', 'back', x, { c: C.pick(wood), h: 2.2 }));
      [1.6, 2.9, 4.2].forEach(z => R.against('shelf', 'left', z, { c: C.pick(wood), h: 2.2 }));
      R.against('bookrack', 'left', 5.7);
      // reading tables with chairs (two rows of two)
      [[5.6, 3.7], [10.4, 3.7], [5.6, 7.0], [10.4, 7.0]].forEach(([x, z]) => {
        R.add('table', x, z, 0, { w: 2.4, d: 1.0, c: '#c79a63', spot: [1.55, 0, -Math.PI / 2] });
        [-0.8, 0.8].forEach(dx => { R.add('chair', x + dx, z - 1.0, 0, { c: '#7a5237' }); R.add('chair', x + dx, z + 1.0, 180, { c: '#7a5237' }); });
        R.add('lamp', x, z, 0, { nb: true });
      });
      // librarian desk by the door (left) with a computer, plus the catalogue computers on the right wall
      R.add('reception', 2.4, 8.6, 0, { w: 2.8 }); R.add('printer', 4.6, 9.3, 0, { spot: [0, -0.9, 0] });
      R.against('pcdesk', 'right', 7.0); R.against('pcdesk', 'right', 8.6);
      // comforts
      R.against('dispenser', 'right', 1.2); R.against('noticeboard', 'front', 11.4, { w: 1.4 }); R.add('plant', 0.5, 9.4, 0); R.add('plant', 13.4, 5.0, 0); R.add('plant', 13.4, 2.7, 0);
      R.onWall('wallclock', 'back', 8.9, { gap: 0 }); R.onWall('wallpic', 'back', 10.9, { c: '#6aa6c9' });
      R.ceilingLights(4, 2); R.sign(C.title.toUpperCase(), 7.0, 2.7, 0.1, 3.2, 0.36, 0, { bg: '#2f5d4a', fg: '#f6e7b4' });
    },
    npcs: [
      D.SEC(8.6, 9.3, Math.PI, { hours: 'always' }),
      D.PATROL([[2, 8], [12, 8], [12, 2.2], [2, 2.2]], { hours: 'study' }),
      { role: 'staff', n: 1, beh: 'post', at: [[2.4, 7.6, 0]], pose: 'talk', hours: 'work', tag: 'librarian' },
      { role: 'student', n: 6, beh: 'sit', sit: ['chair'], hours: 'study' },
      { role: 'student', n: 2, beh: 'post', at: [[1.6, 2.2, 1.57], [6.6, 2.2, 3.14]], pose: 'browse', hours: 'study' },
      CLEAN([1.5, 1.5, 12.5, 9], { hours: 'clean' })
    ]
  });

  /* ------------------------------------------------------------ LECTURE THEATRE (LT1, LT2, ETF 750, 1000-capacity …; variant 'rooms' = Three-in-One lecture rooms) */
  D.def('lecture_theatre', {
    title: 'Lecture Theatre', icon: '🎓', w: 16, d: 12, h: 4.2, venue: 'lecture_theatre', doorAt: 8, security: true,
    theme: { floor: { type: 'carpet', c1: '#7d93bd', c2: '#7289b5' }, wall: '#eef0f2', wainscot: '#5b6b86', trim: '#ffffff', accent: '#e5b93a', curtain: '#2f4a7a' },
    windows: [{ wall: 'left', at: 4.2, w: 1.5 }, { wall: 'left', at: 8.2, w: 1.5 }, { wall: 'right', at: 4.2, w: 1.5 }, { wall: 'right', at: 8.2, w: 1.5 }],
    build(R, C) {
      // teaching wall (back): raised stage, podium, projector screen, two whiteboards, speakers
      R.add('stage', 8, 1.3, 0, { w: 9, d: 2.2 }); R.against('screen', 'back', 8, { w: 4 }); R.against('whiteboard', 'back', 3.3, { w: 2.6 }); R.against('whiteboard', 'back', 12.7, { w: 2.6 });
      R.add('podium', 6.2, 1.9, 0); R.add('speaker', 3.2, 1.6, 0); R.add('speaker', 12.8, 1.6, 0);
      // two blocks of tiered bench rows facing the stage, centre aisle
      // rows are 1.8 m apart so people can walk between them to the middle seats
      [4.2, 6.0, 7.8, 9.6].forEach(z => { [3.4, 8, 12.6].forEach(x => R.add('lect_row', x, z, 180, { n: 4 })); });
      // side aisle: water, notice board, bins of plants; door end
      R.against('dispenser', 'left', 10.4); R.against('noticeboard', 'right', 10.2, { w: 1.2 }); R.add('plant', 0.5, 11.3, 0); R.add('plant', 15.4, 11.3, 0); 
      R.onWall('wallclock', 'left', 6.2, { gap: 0 }); R.ceilingLights(4, 3);
      R.sign(C.title.toUpperCase(), 8, 3.1, 0.1, 4.2, 0.4, 0, { bg: '#1f2f56', fg: '#f6e7b4' });
    },
    npcs: [
      D.SEC(9.4, 11.1, Math.PI, { hours: 'always' }),
      D.PATROL([[1.6, 11], [14.4, 11], [14.4, 3.2], [1.6, 3.2]], { hours: 'class' }),
      { role: 'lecturer', n: 1, beh: 'teach', at: [[8.4, 2.1, 0]], pose: 'teach', hours: 'class', tag: 'lecturer' },
      { role: 'student', n: 18, beh: 'sit', sit: ['lect_row'], hours: 'class' },
      CLEAN([1.5, 3.5, 14.5, 10.5], { hours: 'clean' })
    ]
  });

  /* ------------------------------------------------------------ AUDITORIUM (Great Hall, CCE / OAU / Hilltop auditoria) */
  D.def('auditorium', {
    title: 'Auditorium', icon: '🎭', w: 20, d: 16, h: 5.6, venue: 'auditorium', doorAt: 10, security: true,
    theme: { floor: { type: 'carpet', c1: '#a8586b', c2: '#9c4d60' }, wall: '#f1e8d6', wainscot: '#6b2a3a', trim: '#d9b24a', accent: '#d9b24a', curtain: '#8c1c3a' },
    windows: [{ wall: 'left', at: 5, w: 1.6 }, { wall: 'left', at: 10, w: 1.6 }, { wall: 'right', at: 5, w: 1.6 }, { wall: 'right', at: 10, w: 1.6 }],
    build(R, C) {
      R.add('stage', 10, 1.5, 0, { w: 13, d: 3, c: '#5b3a22', c2: '#7a5237' }); R.against('screen', 'back', 10, { w: 6 });
      R.add('podium', 6.5, 2.4, 0); R.add('piano', 13.2, 2.3, 0); R.add('speaker', 3.0, 2.2, 0); R.add('speaker', 17.0, 2.2, 0); R.add('mic', 8.6, 2.6, 0);
      [5.4, 7.2, 9.0, 10.8, 12.6].forEach(z => [2.6, 6.3, 10, 13.7, 17.4].forEach(x => R.add('aud_row', x, z, 180, { n: 4 })));
      [2.5, 17.5].forEach(x => { R.add('column', x, 14.5, 0); R.add('plant', x, 15.4, 0); }); R.against('dispenser', 'left', 14.6); R.against('noticeboard', 'right', 14.4, { w: 1.2 });
      R.ceilingLights(5, 4); R.sign(C.title.toUpperCase(), 10, 4.4, 0.1, 6, 0.5, 0, { bg: '#6b2a3a', fg: '#f6e7b4' });
    },
    npcs: [
      D.SEC(11.4, 15.2, Math.PI, { hours: 'always' }), D.SEC(8.6, 15.2, Math.PI, { hours: 'event' }),
      D.PATROL([[1.6, 14.5], [18.4, 14.5], [18.4, 4.6], [1.6, 4.6]], { hours: 'event' }),
      { role: 'staff', n: 1, beh: 'post', at: [[8.0, 2.4, 0]], pose: 'talk', hours: 'event', tag: 'host' },
      { role: 'student', n: 24, beh: 'sit', sit: ['aud_row'], hours: 'event' },
      CLEAN([1.5, 4, 18.5, 14], { hours: 'clean' })
    ]
  });

  /* ------------------------------------------------------------ COMPUTER LAB (ICT building, Computer Resource Centre) */
  D.def('computer_lab', {
    title: 'Computer Lab', icon: '💻', w: 14, d: 10, h: 3.2, venue: 'computer_lab', doorAt: 11, security: true,
    theme: { floor: { type: 'tile', c1: '#dfe3e8', c2: '#cdd3da' }, wall: '#eef1f5', wainscot: '#2b6cb0', trim: '#ffffff', accent: '#2b6cb0', curtain: '#2b6cb0' },
    windows: [{ wall: 'back', at: 2.5, w: 1.5 }, { wall: 'back', at: 11.5, w: 1.5 }, { wall: 'left', at: 5, w: 1.4 }],
    build(R, C) {
      R.against('whiteboard', 'back', 5.5, { w: 3 }); R.against('screen', 'back', 9.5, { w: 3 });
      [3.2, 5.4, 7.6].forEach(z => [2.0, 3.9, 5.8, 7.7, 9.6].forEach((x, i) => R.add('pcdesk', x, z, 0, { c: (i + z) % 2 ? '#f3f0ea' : '#e6eaee' })));
      R.against('serverrack', 'right', 3.0); R.against('serverrack', 'right', 4.0); R.against('printer', 'right', 6.3); R.against('dispenser', 'right', 7.8); R.against('noticeboard', 'left', 8.4, { w: 1.2 });
      R.add('desk', 12.0, 1.6, 0, { w: 1.6 }); R.add('plant', 0.5, 9.4, 0); R.add('plant', 13.4, 9.4, 0);
      R.onWall('wallclock', 'left', 2.8, { gap: 0 }); R.ceilingLights(4, 2); R.sign(C.title.toUpperCase(), 7, 2.7, 0.1, 3, 0.34, 0, { bg: '#1f4f86', fg: '#ffffff' });
    },
    npcs: [
      D.SEC(9.0, 9.2, Math.PI, { hours: 'always' }),
      { role: 'staff', n: 1, beh: 'post', at: [[12.0, 2.7, Math.PI]], pose: 'talk', hours: 'work', tag: 'technician' },
      { role: 'student', n: 9, beh: 'sit', sit: ['pcdesk'], pose: 'type', hours: 'study' },
      CLEAN([1.5, 2, 12.5, 9], { hours: 'clean' })
    ]
  });

  /* ------------------------------------------------------------ LABORATORY (Age Laboratory, Microbiology annex) */
  D.def('lab', {
    title: 'Laboratory', icon: '🔬', w: 14, d: 10, h: 3.3, venue: 'lab', doorAt: 7, security: true,
    theme: { floor: { type: 'tile', c1: '#e6efec', c2: '#d3e1dd' }, wall: '#f4f7f6', wainscot: '#1f7a74', trim: '#ffffff', accent: '#1f7a74', curtain: '#1f7a74' },
    windows: [{ wall: 'back', at: 3, w: 1.6 }, { wall: 'back', at: 7, w: 1.6 }, { wall: 'back', at: 11, w: 1.6 }],
    build(R, C) {
      [[3.2, 4.0], [7.0, 4.0], [10.8, 4.0], [3.2, 7.2], [7.0, 7.2], [10.8, 7.2]].forEach(([x, z]) => R.add('lab_station', x, z, 0, { inter: ['lab_work'] }));
      R.against('labbench', 'left', 2.2, { w: 1.8 }); R.against('cabinet', 'right', 2.0); R.against('cabinet', 'right', 3.0); R.against('fridge', 'right', 4.2); R.against('dispenser', 'left', 8.2);
      R.against('noticeboard', 'right', 7.4, { w: 1.1 }); R.add('globe', 0.5, 9.3, 0); R.add('plant', 13.4, 9.4, 0); R.onWall('wallclock', 'left', 5.0, { gap: 0 });
      R.ceilingLights(4, 3); R.sign(C.title.toUpperCase(), 7, 2.8, 0.1, 3, 0.34, 0, { bg: '#165a56', fg: '#ffffff' });
    },
    npcs: [
      D.SEC(9.4, 9.3, Math.PI, { hours: 'always' }),
      { role: 'lecturer', n: 1, beh: 'teach', at: [[7.0, 1.6, 0]], pose: 'teach', hours: 'class', tag: 'lab_lead' },
      { role: 'student', n: 7, beh: 'sit', sit: ['lab_station'], pose: 'read', hours: 'class' },
      CLEAN([1.5, 2, 12.5, 9], { hours: 'clean' })
    ]
  });

  /* ------------------------------------------------------------ FACULTY / SCHOOL BUILDING (SET, SEET, SOC, SLS, SAAT, Postgraduate) */
  D.def('faculty', {
    title: 'School', icon: '🏫', w: 16, d: 11, h: 3.8, venue: 'faculty', doorAt: 4.5, security: true,
    theme: { floor: { type: 'terrazzo', c1: '#e9e4d8', c2: '#d8d1c0' }, wall: '#f1efe6', wainscot: '#2f5d4a', trim: '#ffffff', accent: '#2f5d4a', curtain: '#2f5d4a' },
    windows: [{ wall: 'back', at: 2.2, w: 1.5 }, { wall: 'back', at: 6.5, w: 1.5 }, { wall: 'left', at: 5.5, w: 1.4 }, { wall: 'right', at: 5.5, w: 1.4 }],
    build(R, C) {
      // lobby (left): reception, notice boards, trophy case, waiting seats
      R.add('reception', 3.4, 2.2, 0, { w: 3 }); R.against('noticeboard', 'back', 7.2, { w: 1.5 }); R.against('trophycase', 'left', 5.6); R.against('sofa', 'left', 7.8); R.against('dispenser', 'left', 9.4);
      R.add('coffeetable', 3.2, 7.8, 0); R.add('armchair', 3.2, 6.6, 0, { c: '#2f5d4a' }); R.add('plant', 0.6, 10.2, 0); R.add('plant', 7.4, 10.2, 0); R.add('globe', 5.4, 5.0, 0, { nb: true });
      // classroom (right): whiteboard, podium, desks facing the board
      R.against('whiteboard', 'back', 12.4, { w: 3.6 }); R.add('podium', 14.6, 1.6, 0); R.against('screen', 'back', 9.6, { w: 2 });
      [4.4, 6.1, 7.8].forEach(z => [10.0, 11.9, 13.8].forEach(x => R.add('classdesk', x, z, 0)));
      R.against('shelf', 'right', 9.8); R.add('plant', 15.4, 10.2, 0);
      R.onWall('wallclock', 'back', 8.4, { gap: 0 }); R.ceilingLights(4, 2); R.sign(C.title.toUpperCase(), 8, 3.1, 0.1, 3.6, 0.4, 0, { bg: '#1f4235', fg: '#f6e7b4' });
    },
    npcs: [
      D.SEC(6.0, 10.2, Math.PI, { hours: 'always' }), D.PATROL([[1.5, 9.5], [7.5, 9.5], [7.5, 3.8], [1.5, 3.8]], { hours: 'class' }),
      { role: 'staff', n: 1, beh: 'post', at: [[3.4, 1.4, 0]], pose: 'talk', hours: 'work', tag: 'secretary' },
      { role: 'lecturer', n: 1, beh: 'teach', at: [[13.4, 2.0, 0]], pose: 'teach', hours: 'class', tag: 'lecturer' },
      { role: 'student', n: 8, beh: 'sit', sit: ['classdesk'], hours: 'class' },
      { role: 'student', n: 2, beh: 'sit', sit: ['armchair', 'sofa'], pose: 'phone', hours: 'study' },
      CLEAN([1.5, 3.5, 7.5, 9.5], { hours: 'clean' })
    ]
  });

  /* ------------------------------------------------------------ ADMIN OFFICE (Senate, Registry, Bursary, VC office) */
  D.def('admin_office', {
    title: 'Administrative Office', icon: '🏛️', w: 14, d: 10, h: 3.4, venue: 'admin_office', doorAt: 7, security: true,
    theme: { floor: { type: 'tile', c1: '#d9d2c3', c2: '#c9c1af' }, wall: '#f3eee2', wainscot: '#5a3b24', trim: '#ffffff', accent: '#7a5237', curtain: '#5a3b24' },
    windows: [{ wall: 'back', at: 3, w: 1.5 }, { wall: 'back', at: 11, w: 1.5 }, { wall: 'right', at: 5, w: 1.4 }],
    build(R, C) {
      R.add('reception', 7, 7.4, 0, { w: 3 }); R.against('noticeboard', 'left', 5.5, { w: 1.4 }); R.against('filecab', 'back', 7.0); R.against('filecab', 'back', 8.0);
      [[2.6, 2.4], [5.2, 2.4], [8.8, 2.4], [11.4, 2.4]].forEach(([x, z]) => R.add('desk', x, z, 0, { w: 1.5 }));
      R.add('pcdesk', 2.6, 4.4, 0); R.add('pcdesk', 11.4, 4.4, 0); R.against('printer', 'right', 7.6); R.against('dispenser', 'left', 8.2);
      R.add('sofa', 12.2, 8.6, 270); R.add('coffeetable', 10.6, 8.6, 0); R.add('plant', 0.6, 9.4, 0); R.add('plant', 13.4, 1.0, 0);
      R.onWall('wallclock', 'left', 3.4, { gap: 0 }); R.ceilingLights(4, 2); R.sign(C.title.toUpperCase(), 7, 2.9, 0.1, 4.2, 0.4, 0, { bg: '#4a3020', fg: '#f6e7b4' });
    },
    npcs: [
      D.SEC(4.2, 9.2, Math.PI, { hours: 'always' }), D.PATROL([[1.5, 9], [12.5, 9], [12.5, 5.8], [1.5, 5.8]], { hours: 'work' }),
      { role: 'staff', n: 1, beh: 'post', at: [[7.0, 6.1, Math.PI]], pose: 'talk', hours: 'work', tag: 'clerk' },
      { role: 'staff', n: 2, beh: 'sit', sit: ['pcdesk'], pose: 'type', hours: 'work' },
      { role: 'student', n: 2, beh: 'sit', sit: ['sofa'], pose: 'phone', hours: 'work' },
      CLEAN([1.5, 5.5, 12.5, 9.5], { hours: 'clean' })
    ]
  });

  /* ------------------------------------------------------------ PRIMARY SCHOOL (FUTA Staff School) */
  D.def('primary_school', {
    title: 'Staff School Classroom', icon: '🍎', w: 12, d: 9, h: 3.2, venue: 'primary_school', doorAt: 10, security: true,
    theme: { floor: { type: 'tile', c1: '#f3e3b5', c2: '#e9d49a' }, wall: '#fdf6dc', wainscot: '#e08a2e', trim: '#ffffff', accent: '#e08a2e', curtain: '#3a9bd1' },
    windows: [{ wall: 'back', at: 3, w: 1.6 }, { wall: 'back', at: 9, w: 1.6 }, { wall: 'left', at: 5, w: 1.4 }],
    build(R, C) {
      R.against('whiteboard', 'back', 6, { w: 3.6 }); R.add('desk', 9.6, 1.8, 0, { w: 1.4 }); R.against('shelf', 'right', 4.5); R.against('bookrack', 'right', 6.8); R.against('noticeboard', 'left', 7.0, { w: 1.4 });
      [3.6, 5.5, 7.4].forEach(z => [2.4, 4.6, 6.8].forEach(x => R.add('classdesk', x, z, 0)));
      R.add('plant', 0.6, 8.4, 0); R.add('globe', 11.2, 8.0, 0, { nb: true }); R.against('dispenser', 'left', 2.4);
      R.onWall('wallclock', 'left', 3.6, { gap: 0 }); R.ceilingLights(3, 2); R.sign('STAFF SCHOOL', 6, 2.7, 0.1, 3, 0.4, 0, { bg: '#c46f1a', fg: '#ffffff' });
    },
    npcs: [
      D.SEC(10.6, 8.2, Math.PI, { hours: 'always' }),
      { role: 'lecturer', n: 1, beh: 'teach', at: [[9.0, 2.6, Math.PI]], pose: 'teach', hours: 'class', tag: 'teacher' },
      CLEAN([1.5, 3, 11, 8], { hours: 'clean' })
    ]
  });

  /* ------------------------------------------------------------ STUDENT UNION (SUG building, student centres) */
  D.def('student_union', {
    title: 'Student Union', icon: '🎓', w: 16, d: 11, h: 3.6, venue: 'student_union', doorAt: 8,
    theme: { floor: { type: 'wood', c1: '#b98a58', c2: '#a67a4b' }, wall: '#f4e9d2', wainscot: '#1f6f5c', trim: '#ffffff', accent: '#e0a526', curtain: '#1f6f5c' },
    windows: [{ wall: 'back', at: 3, w: 1.6 }, { wall: 'back', at: 8, w: 1.6 }, { wall: 'back', at: 13, w: 1.6 }],
    build(R, C) {
      // TV corner
      R.against('tvunit', 'back', 3.2); R.add('sofa', 3.2, 4.6, 180); R.add('armchair', 1.4, 3.8, 90, { c: '#1f6f5c' }); R.add('coffeetable', 3.2, 3.3, 0);
      // games
      R.add('pooltable', 11.6, 3.6, 0); R.add('foosball', 7.9, 5.6, 0); R.add('chesstable', 14.4, 7.6, 0);
      // canteen counter + stools
      R.against('counter', 'right', 8.6, { w: 3 }); R.against('fridge', 'right', 5.2); R.add('stool', 11.4, 7.8, 0); R.add('stool', 11.4, 9.4, 0);
      R.against('noticeboard', 'left', 8.0, { w: 1.6 }); R.against('noticeboard', 'left', 9.8, { w: 1.2 }); R.against('dispenser', 'left', 6.2);
      R.add('table', 4.6, 8.2, 0); R.add('chair', 3.8, 8.2, 90); R.add('chair', 5.4, 8.2, 270); R.add('plant', 0.6, 1.0, 0); R.add('plant', 15.4, 1.0, 0);
      R.onWall('wallclock', 'back', 5.6, { gap: 0 }); R.ceilingLights(4, 2); R.sign(C.title.toUpperCase(), 8, 3.0, 0.1, 3.4, 0.4, 0, { bg: '#14493d', fg: '#ffe9a8' });
    },
    npcs: [
      D.SEC(9.6, 10.2, Math.PI, { hours: 'always' }),
      { role: 'vendor', n: 1, beh: 'post', at: [[13.2, 8.6, -Math.PI / 2]], pose: 'talk', hours: 'day', tag: 'canteen' },
      { role: 'student', n: 3, beh: 'sit', sit: ['sofa', 'armchair'], pose: 'phone', hours: 'social' },
      { role: 'student', n: 4, beh: 'stand', at: [[11.6, 5.1, Math.PI], [9.8, 3.6, 1.6], [13.4, 3.6, 4.7], [8.0, 6.9, 0]], pose: 'talk', hours: 'social' },
      { role: 'student', n: 2, beh: 'sit', sit: ['chair'], hours: 'social' },
      { role: 'student', n: 2, beh: 'wander', zone: [1.5, 5, 14.5, 10], hours: 'social' },
      CLEAN([1.5, 4, 14.5, 10], { hours: 'clean' })
    ]
  });

  /* ------------------------------------------------------------ MUSEUM (Heritage / visitor centre) */
  D.def('museum', {
    title: 'Museum', icon: '🏺', w: 14, d: 10, h: 3.8, venue: 'museum', doorAt: 7,
    theme: { floor: { type: 'marble', c1: '#ece7dc', c2: '#d9d2c3' }, wall: '#efe6d3', wainscot: '#3d3a52', trim: '#d9b24a', accent: '#d9b24a', curtain: '#3d3a52' },
    windows: [{ wall: 'back', at: 7, w: 1.6 }],
    build(R, C) {
      [3.2, 7, 10.8].forEach(x => R.add('plinth', x, 3.4, 0, { item: ['vase', 'bust', 'orb'][[3.2, 7, 10.8].indexOf(x)] }));
      [3.2, 7, 10.8].forEach(x => R.add('plinth', x, 6.4, 0, { item: ['drum', 'mask', 'bowl'][[3.2, 7, 10.8].indexOf(x)] }));
      R.against('glasscase', 'left', 3.0); R.against('glasscase', 'left', 6.2); R.against('glasscase', 'right', 3.0); R.against('glasscase', 'right', 6.2);
      R.against('wallpic', 'back', 3.2, { w: 1.4 }); R.against('wallpic', 'back', 10.8, { w: 1.4 }); R.against('trophycase', 'right', 8.4);
      R.add('reception', 3.2, 9.0, 0, { w: 2 }); R.add('bench', 10.4, 9.0, 0); R.add('plant', 13.4, 9.4, 0); R.add('globe', 0.9, 8.4, 0);
      R.ceilingLights(3, 2); R.sign(C.title.toUpperCase(), 7, 3.2, 0.1, 3, 0.4, 0, { bg: '#2d2a40', fg: '#f6e7b4' });
    },
    npcs: [
      D.SEC(6.0, 9.2, Math.PI, { hours: 'always' }),
      { role: 'staff', n: 1, beh: 'post', at: [[3.2, 8.2, Math.PI]], pose: 'talk', hours: 'day', tag: 'curator' },
      { role: 'visitor', n: 3, beh: 'wander', zone: [1.5, 2, 12.5, 8], hours: 'day' },
      CLEAN([1.5, 2, 12.5, 8], { hours: 'clean' })
    ]
  });

  /* ------------------------------------------------------------ BUSINESS CENTRE / CYBER CAFE */
  D.def('business_centre', {
    title: 'Business Centre', icon: '🖨️', w: 12, d: 8, h: 3.2, venue: 'business_centre', doorAt: 6,
    theme: { floor: { type: 'tile', c1: '#d8dde3', c2: '#c8ced6' }, wall: '#f1f3f6', wainscot: '#c2410c', trim: '#ffffff', accent: '#c2410c', curtain: '#c2410c' },
    windows: [{ wall: 'back', at: 3, w: 1.6 }, { wall: 'back', at: 9, w: 1.6 }],
    build(R, C) {
      R.add('counter', 3.2, 2.0, 0, { w: 3 }); R.against('printer', 'back', 11.0); R.against('printer', 'left', 2.4);
      [1.8, 3.6, 5.4, 7.2].forEach(x => R.add('pcdesk', x, 5.0, 0));
      R.against('pcdesk', 'right', 2.6); R.against('shelf', 'right', 5.0); R.against('noticeboard', 'left', 5.4, { w: 1.2 }); R.against('dispenser', 'right', 6.8);
      R.add('plant', 0.6, 7.4, 0); R.add('plant', 11.4, 1.0, 0); R.ceilingLights(3, 2); R.sign(C.title.toUpperCase(), 6, 2.7, 0.1, 3.4, 0.38, 0, { bg: '#9a330a', fg: '#ffffff' });
    },
    npcs: [
      { role: 'vendor', n: 1, beh: 'post', at: [[3.2, 3.0, Math.PI]], pose: 'talk', hours: 'day', tag: 'operator' },
      { role: 'student', n: 3, beh: 'sit', sit: ['pcdesk'], pose: 'type', hours: 'day' },
      CLEAN([1.5, 3, 10.5, 7], { hours: 'clean' })
    ]
  });
})(typeof window !== 'undefined' ? window : globalThis);
