/* DEV TOOL: FutaCheck.run(built) → { errors:[], warnings:[], stats:{} } — layout sanity checks for one built room.
   errors   : things that must be fixed (pieces overlapping, outside the room, unreachable interactive piece/seat, ATM outside a bank, missing security…)
   warnings : style hints (very empty room, many draw calls…).  Used by preview.html and tools/test/interiors-shot.js. */
(function (g) {
  'use strict';
  function run(B) {
    const E = [], W = [], spec = B.spec, R = B.room, st = {}; const bl = B.blockers.filter(b => b.piece);
    const box = (b) => ({ x0: b.x - b.w / 2, x1: b.x + b.w / 2, z0: b.z - b.d / 2, z1: b.z + b.d / 2 });
    // 1. inside the room
    R.pieces.forEach(p => { if (p.def.blocker === false || p.o.nb) return; const b = box(B.blockers.find(q => q.piece === p.id) || { x: p.x, z: p.z, w: p.size[0], d: p.size[1] }); if (b.x0 < -0.02 || b.z0 < -0.02 || b.x1 > B.w + 0.02 || b.z1 > B.d + 0.02) E.push('outside room: ' + p.id + ' at ' + p.x.toFixed(2) + ',' + p.z.toFixed(2)); });
    // 2. overlaps between solid pieces (tolerate 6 cm)
    for (let i = 0; i < bl.length; i++) for (let j = i + 1; j < bl.length; j++) { const a = box(bl[i]), b = box(bl[j]); const ox = Math.min(a.x1, b.x1) - Math.max(a.x0, b.x0), oz = Math.min(a.z1, b.z1) - Math.max(a.z0, b.z0); if (ox > 0.06 && oz > 0.06) E.push('overlap: ' + bl[i].piece + ' / ' + bl[j].piece + ' (' + ox.toFixed(2) + '×' + oz.toFixed(2) + ' m)'); }
    // 3. door clear + reachability (A* on the walking grid)
    const grid = B.grid; if (!grid) W.push('no walking grid (load live/interact.js before rooms)'); else {
      const FI = g.FutaInteract, from = { x: B.spawn.x, z: B.spawn.z }; const reach = (x, z, what) => { const p = FI.findPath(grid, from, { x, z }); if (!p) { E.push('unreachable: ' + what); return; } const l = p[p.length - 1]; if (Math.hypot(l.x - x, l.z - z) > 0.75) E.push('blocked approach (' + Math.hypot(l.x - x, l.z - z).toFixed(2) + ' m short): ' + what); };
      const freeAt = (x, z) => { const [ci, cj] = grid.cell(x, z); return ci >= 0 && cj >= 0 && ci < grid.w && cj < grid.h && !grid.blocked[cj * grid.w + ci]; };
      B.seats.forEach(s => { if (!freeAt(s.x, s.z) && !s.piece.o.nb) { /* seat cells are inside their own chair blocker: fine */ } const p = FI.findPath(grid, from, { x: s.x, z: s.z }); if (!p) E.push('unreachable seat ' + s.id); else { const l = p[p.length - 1]; if (Math.hypot(l.x - s.x, l.z - s.z) > 1.6) E.push('seat walled in (' + Math.hypot(l.x - s.x, l.z - s.z).toFixed(2) + ' m short): ' + s.id); } });
      B.interactives.forEach(p => {
        const hasSeat = B.seats.some(s => s.piece === p) || B.seats.some(s => Math.hypot(s.x - p.spot.x, s.z - p.spot.z) < 2.6);   // the engine sits you down to use it
        if (!freeAt(p.spot.x, p.spot.z)) { if (!hasSeat) E.push('use-spot of ' + p.id + ' is inside furniture (' + p.spot.x.toFixed(2) + ',' + p.spot.z.toFixed(2) + ') — move neighbours or pass {spot:[x,z,face]}'); return; }
        reach(p.spot.x, p.spot.z, 'use-spot of ' + p.id);
      });
      B.stations.forEach(s => reach(s.x, s.z, 'station ' + s.id)); Object.keys(B.routes).forEach(k => B.routes[k].pts.forEach((q, i) => reach(q.x, q.z, 'route ' + k + '#' + i)));
    }
    // 4. owner's rules
    const atms = R.pieces.filter(p => p.name === 'atm').length; st.atms = atms; if (atms && B.venue !== 'bank') E.push('ATM outside a bank (' + atms + ')'); if (B.venue === 'bank' && !atms) E.push('bank without an ATM');
    const secNpc = (spec.npcs || []).filter(n => n.role === 'security'); if (spec.security && !secNpc.length) E.push('security:true but no security NPC'); if (!spec.security && secNpc.length) W.push('security NPC but security:false');
    if (/^(faculty|lecture_theatre|auditorium|admin_office|library|lab|computer_lab|primary_school|bank)$/.test(spec.id) && !spec.security) E.push('academic/admin/bank building must have security');
    // 5. content
    st.pieces = R.pieces.length; st.interactive = B.interactives.length; st.seats = B.seats.length; st.windows = B.windows.length; st.lights = R.lights.length; st.npcGroups = (spec.npcs || []).length;
    if (st.pieces < 14) W.push('sparse room: only ' + st.pieces + ' pieces'); if (st.interactive < 3) W.push('few interactive objects: ' + st.interactive);
    (spec.npcs || []).forEach((n, i) => { if (n.beh === 'post' || n.beh === 'stand' || n.beh === 'teach') { if (!n.at || !n.at.length) E.push('npc ' + n.role + ' (' + n.beh + ') has no "at" spots'); } if (n.beh === 'sit' && !(n.sit && n.sit.length)) E.push('npc ' + n.role + ' sits but has no "sit" furniture list'); if (n.beh === 'sit') { const have = R.seats.filter(s => n.sit.indexOf(s.piece.name) >= 0).length; if (!have) E.push('npc ' + n.role + ': no seat on ' + n.sit.join('/')); }
      (n.at || []).forEach(a => { if (grid) { const [ci, cj] = grid.cell(a[0], a[1]); if (ci < 0 || cj < 0 || ci >= grid.w || cj >= grid.h || grid.blocked[cj * grid.w + ci]) E.push('npc ' + n.role + ' stands inside furniture at ' + a[0] + ',' + a[1]); } }); });
    // 6. cost
    let tris = 0, meshes = 0; B.group.traverse(o => { if (o.isMesh && o.geometry) { meshes++; const g_ = o.geometry; tris += (g_.index ? g_.index.count : g_.attributes.position.count) / 3; } }); st.tris = Math.round(tris); st.meshes = meshes;
    if (meshes > 140) W.push('many draw calls: ' + meshes); if (tris > 120000) W.push('heavy: ' + st.tris + ' triangles');
    return { errors: E, warnings: W, stats: st };
  }
  g.FutaCheck = { run };
})(typeof window !== 'undefined' ? window : globalThis);
