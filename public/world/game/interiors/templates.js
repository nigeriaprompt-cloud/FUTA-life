/* ==========================================================================
   FutaTemplates — one interior TEMPLATE per kind of building, and classify(building) which picks the template.
   Template files:  tpl_res.js (hostel, house)  tpl_bank.js  tpl_vault.js (vault door + jail cell)  tpl_edu.js  tpl_commerce.js  tpl_care.js  — each calls FutaTemplates.def(id, spec).

   spec = {
     title:'Hostel', icon:'🛏️',
     w:12, d:9, h:2.9,                       room size in metres (x = 0..w left→right, z = 0..d back wall→front wall; the DOOR is in the front wall z=d)
     venue:'hostel',                         id used by the server (activities.json "venues"); defaults to the template id
     theme:{ floor:{type:'tile|wood|carpet|concrete|marble|terrazzo|grass', c1, c2}, wall, trim, wainscot, accent, curtain, frame, outer },
     windows:[{wall:'back|left|right|front', at:3.2, w:1.5, h:1.25, sill:1.0}],  doorAt:6,
     build(R, C){ … R.add / R.against / R.onWall / R.row / R.sign / R.ceilingLights … }   // see rooms.js header
     npcs:[ …NPC specs… ],  security:true|false
   }
   C (context given to build): { id, name (building name), title (display name), variant, seed, rnd(), row(), grid(), pick(arr) }
   NPC spec:  { role, n, beh, hours, pose, at:[[x,z,yawRad]…], sit:['chair','sofa'…] (furniture names to sit on), path:[[x,z]…], zone:[x1,z1,x2,z2], tag }
     role  : security cleaner lecturer student staff teller pharmacist cleric pastor cook stylist trainer trader nurse   (avatar-npc.js)
     beh   : 'post' (stand at an `at` spot) · 'sit' (take a seat on one of `sit` furniture) · 'stand' (stand at `at` spots) ·
             'patrol' (walk `path`) · 'sweep' (wander `zone`) · 'teach' (stand at `at`, teach pose) · 'wander' (stroll `zone`)
     hours : when this group is present, Nigeria time — always | work (8-17) | service (8-20) | day (7-19) | class (8-16) | study (8-22) | social (11-22) |
             home (17-9 + weekend days) | event (9-20) | clean (6-9, 17-19) | night (19-7)
   RULES (owner's): ATM exists ONLY in banks. Every administrative / academic building (faculty, lecture theatre, auditorium, admin office,
   library, lab, computer lab, school) and every bank has a SECURITY NPC (security:true + a {role:'security'} entry).
   ========================================================================== */
(function (g) {
  'use strict';
  const D = (g.FutaTemplates = g.FutaTemplates || {});
  const defs = (D.defs = D.defs || {});
  const rnd = (s) => { s = (s * 9301 + 49297) % 233280; return s / 233280; };
  const hashStr = (str) => { let h = 2166136261; str = String(str); for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; };

  D.def = (id, spec) => { defs[id] = Object.assign({ id, w: 12, d: 9, h: 3, venue: id, theme: {}, windows: [], npcs: [], security: false, title: id, icon: '🏠' }, spec); return defs[id]; };
  D.alias = (id, base, over) => { const b = defs[base]; if (!b) throw new Error('alias of unknown template ' + base); defs[id] = Object.assign({}, b, { id, venue: id }, over || {}); return defs[id]; };

  /* NPC spec helpers (yaw in radians; 0 = looks toward +z = the door/camera side, π = looks into the room) */
  D.SEC = (x, z, yaw, o) => Object.assign({ role: 'security', n: 1, beh: 'post', at: [[x, z, yaw == null ? Math.PI : yaw]], pose: 'guard', hours: 'always', tag: 'security' }, o || {});
  D.PATROL = (path, o) => Object.assign({ role: 'security', n: 1, beh: 'patrol', path, pose: 'patrol', hours: 'work', tag: 'security' }, o || {});
  D.CLEAN = (zone, o) => Object.assign({ role: 'cleaner', n: 1, beh: 'sweep', zone, pose: 'sweep', hours: 'clean' }, o || {});
  D.STAFF = (x, z, yaw, o) => Object.assign({ role: 'staff', n: 1, beh: 'post', at: [[x, z, yaw == null ? 0 : yaw]], pose: 'talk', hours: 'work' }, o || {});

  /* ---------- classify(building) → { id, variant, title } ---------- */
  const R = (re, id, variant) => [re, id, variant];
  const BY_NAME = [
    R(/\b(bank|uba|wema)\b/i, 'bank'), R(/pharmacy/i, 'pharmacy'), R(/health centre|hospital/i, 'health_centre'), R(/clinic/i, 'clinic'),
    R(/library/i, 'library'), R(/museum/i, 'museum'), R(/zoo|wildlife/i, 'visitor_centre'),
    R(/mosque/i, 'mosque'), R(/church|chapel|cathedral/i, 'church'),
    R(/great hall|auditorium/i, 'auditorium'), R(/lecture rooms?/i, 'lecture_theatre', 'rooms'), R(/lecture theatre|^lt\s?\d|\bLT\d|1000-capacity/i, 'lecture_theatre'),
    R(/computer|\bict\b/i, 'computer_lab'), R(/laborator/i, 'lab'),
    R(/gymnasium|\bgym\b/i, 'gym'), R(/grandstand|stadium/i, 'sports_room', 'grandstand'), R(/table tennis/i, 'sports_room', 'tabletennis'), R(/chess|sport room/i, 'sports_room'),
    R(/student union|\bsub\b/i, 'student_union'), R(/primary school/i, 'primary_school'),
    R(/school of|^s(aat|eet|et|ls|oc)\b|postgraduate/i, 'faculty'),
    R(/senate|alumni|pta\b|step-b|microbiology|cce office|administration|registry|bursary|vice.?chancellor/i, 'admin_office'),
    R(/business centre/i, 'business_centre'), R(/print|copy centre/i, 'print_shop'), R(/cyber/i, 'cyber_cafe'),
    R(/car wash/i, 'carwash'), R(/petrol|filling station|fuel/i, 'petrol_shop'),
    R(/feed mill/i, 'workshop', 'feedmill'), R(/power room/i, 'workshop', 'power'), R(/farm centre/i, 'workshop', 'farm'), R(/workshop|garage|mechanic/i, 'workshop'),
    R(/bookshop|book store/i, 'bookshop'), R(/phone/i, 'phone_shop'), R(/supermart|supermarket|shopping complex|mall/i, 'supermarket'), R(/provision|stores?\b/i, 'provisions'),
    R(/bakery|cakes|pastries/i, 'bakery'), R(/amala|bukka|mama put/i, 'restaurant', 'amala'), R(/suya|grill|barbecue/i, 'restaurant', 'suya'), R(/chicken|fried|pizza|burger/i, 'restaurant', 'fastfood'),
    R(/salon|hair|barber|glam|beauty|studio/i, 'salon')
  ];
  const BY_TYPE = { hostel: 'hostel', house: 'house', shop: 'provisions', restaurant: 'restaurant', pharmacy: 'pharmacy', salon: 'salon', church: 'church', school: 'primary_school', office: 'admin_office', institution: 'faculty', landmark: 'museum', hotel: 'hostel' };
  D.classify = function (b) {
    const name = (b && b.name) || '', type = (b && b.type) || '';
    const clean = name.replace(/\s*\(.*?\)\s*/g, ' ').trim();
    let id = null, variant = null;
    if (type === 'hostel' || type === 'house') id = type;                       // names like "Jibowu Hostel" must not hit other rules
    else for (const [re, tid, v] of BY_NAME) if (re.test(name)) { id = tid; variant = v || null; break; }
    if (!id) id = BY_TYPE[type] || 'provisions';
    if (!defs[id]) id = defs.provisions ? 'provisions' : Object.keys(defs)[0];
    return { id, variant, title: clean || (defs[id] && defs[id].title) || 'Building' };
  };

  /* NPC stand-spots shared between variants can land inside a variant's furniture: move any `at` spot that is walled in to the nearest free, reachable floor cell (same yaw). Lists with no such spot are returned untouched. */
  function snapNpcs(list, grid, spawn) {
    const FI = g.FutaInteract; if (!grid || !FI || !list) return list;
    const free = (i, j) => i >= 0 && j >= 0 && i < grid.w && j < grid.h && !grid.blocked[j * grid.w + i];
    const reach = (x, z) => { const p = FI.findPath(grid, { x: spawn.x, z: spawn.z }, { x, z }); if (!p) return false; const l = p[p.length - 1]; return Math.hypot(l.x - x, l.z - z) <= .5; };
    let changed = false;
    const out = list.map(n => {
      if (!n.at) return n;
      const at = n.at.map(a => {
        const [ci, cj] = grid.cell(a[0], a[1]); if (free(ci, cj)) return a;
        for (let r = 1; r < 10; r++) { const c = []; for (let dj = -r; dj <= r; dj++) for (let di = -r; di <= r; di++) if (Math.max(Math.abs(di), Math.abs(dj)) === r && free(ci + di, cj + dj)) { const [x, z] = grid.center(ci + di, cj + dj); c.push([x, z]); } for (const q of c) if (reach(q[0], q[1])) { changed = true; return [q[0], q[1], a[2]]; } }
        return a;
      });
      return at.some((q, k) => q !== n.at[k]) ? Object.assign({}, n, { at }) : n;
    });
    return changed ? out : list;
  }

  /* ---------- make(buildingOrSpec) → built room (see rooms.js build()) + spec ---------- */
  D.make = function (building, opts) {
    opts = opts || {}; const k = opts.id ? { id: opts.id, variant: opts.variant || null, title: (building && building.name) || '' } : D.classify(building);
    const spec = defs[k.id]; if (!spec) throw new Error('No interior template: ' + k.id);
    const seed = hashStr((building && (building.id || building.name)) || k.id) % 100000, rr = (() => { let s = seed + 1; return () => (s = (s * 9301 + 49297) % 233280) / 233280; })();
    const Rm = g.FutaRoom.create({ id: (building && building.id) || k.id, w: spec.w, d: spec.d, h: spec.h, theme: spec.theme, windows: spec.windows, doorAt: spec.doorAt, venue: spec.venue });
    const C = { id: spec.id, name: (building && building.name) || '', title: k.title, variant: k.variant, seed, rnd: rr, building,
      pick: (a) => a[Math.floor(rr() * a.length)],
      row: (name, x0, z0, n, dx, dz, rot, opt) => { const out = []; for (let i = 0; i < n; i++) out.push(Rm.add(name, x0 + dx * i, z0 + dz * i, rot || 0, Object.assign({ seed: seed + i }, opt || {}))); return out; },
      grid: (name, x0, z0, nx, nz, dx, dz, rot, opt) => { const out = []; for (let j = 0; j < nz; j++) for (let i = 0; i < nx; i++) out.push(Rm.add(name, x0 + dx * i, z0 + dz * j, rot || 0, Object.assign({ seed: seed + i * 7 + j }, opt || {}))); return out; } };
    spec.build(Rm, C);
    const built = Rm.build(); const npcList = snapNpcs(C.npcs || spec.npcs, built.grid, built.spawn);   // a variant builder may set C.npcs to replace the default NPC list
    built.spec = npcList === spec.npcs ? spec : Object.assign({}, spec, { npcs: npcList }); built.ctx = C; built.venue = spec.venue; built.title = k.title;
    return built;
  };
  D.ids = () => Object.keys(defs);
})(typeof window !== 'undefined' ? window : globalThis);
