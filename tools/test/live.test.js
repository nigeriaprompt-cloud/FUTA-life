// Unit tests for live.js + interact.js with a FAKE Supabase (no network). Run: node tools/test/live.test.js
const fs = require('fs'), vm = require('vm'), path = require('path'), assert = require('assert');
const base = path.join(__dirname, '..', '..', 'public', 'world', 'game', 'live');
function load() { const c = { console, Math, JSON, setInterval, clearInterval, setTimeout, Promise, Date, Uint8Array, Float32Array, Int32Array, Set, Map, Object, Number, Array, Error }; c.globalThis = c; vm.createContext(c); for (const f of ['live.js', 'interact.js']) vm.runInContext(fs.readFileSync(path.join(base, f), 'utf8'), c, { filename: f }); return c; }
const G = load();
// ---- fake supabase: channels share a bus so two clients "see" each other
const bus = { channels: {}, rpcs: [], profiles: { B: { id: 'B', username: 'bolu', avatar_json: { v: 1 }, avatar_hash: 'h' } } };
function fakeSb(selfId) {
  return { channel(name, cfg) { const c = { name, cfg, h: [], on(t, f, cb) { c.h.push({ t, f, cb }); return c; }, subscribe(cb) { (bus.channels[name] = bus.channels[name] || []).push({ c, selfId }); setTimeout(() => cb('SUBSCRIBED'), 0); return c; },
      async track(m) { c.meta = m; bus.sync(name); }, send(msg) { (bus.channels[name] || []).forEach(o => { if (o.c !== c) o.c.h.filter(x => x.t === 'broadcast').forEach(x => x.cb({ payload: msg.payload })); }); return Promise.resolve(); },
      presenceState() { const s = {}; (bus.channels[name] || []).forEach(o => { if (o.c.meta) s[o.selfId] = [o.c.meta]; }); return s; } }; return c; },
    removeChannel(c) { for (const k in bus.channels) bus.channels[k] = bus.channels[k].filter(o => o.c !== c); bus.sync(c.name); return Promise.resolve(); },
    rpc(fn, args) { bus.rpcs.push([selfId, fn, args]); if (fn === 'claim_seat') { if (!/^[a-z0-9_:.-]{1,60}$/.test(args.p_room) || !/^[a-z0-9_:.-]{1,40}$/.test(args.p_seat)) return Promise.resolve({ error: { message: 'bad_seat' } }); const k = args.p_room + '/' + args.p_seat; if (bus.seats && bus.seats[k] && bus.seats[k] !== selfId) return Promise.resolve({ data: { ok: false } }); (bus.seats = bus.seats || {})[k] = selfId; return Promise.resolve({ data: { ok: true } }); } if (fn === 'list_seats') return Promise.resolve({ data: [] }); if (fn === 'get_wallet') return Promise.resolve({ data: { pocket: 500, bank: 100, canClaimDaily: true } }); return Promise.resolve({ data: null }); },
    from() { const q = { select() { return q; }, in(_, ids) { q.ids = ids; return q; }, eq() { return q; }, order() { return q; }, limit() { return Promise.resolve({ data: [] }); }, then(r) { r({ data: (q.ids || []).map(i => bus.profiles[i]).filter(Boolean), error: null }); } }; return q; } };
}
bus.sync = (name) => (bus.channels[name] || []).forEach(o => o.c.h.filter(x => x.t === 'presence').forEach(x => x.cb()));
const wait = (ms) => new Promise(r => setTimeout(r, ms));
(async () => {
  // zone hysteresis
  const F = G.FutaLive; assert.strictEqual(F.zoneRoom(10, 10), 'zone_0_0'); assert.strictEqual(F.zoneFor(161, 10, 'zone_0_0'), 'zone_0_0', 'stays inside hysteresis margin'); assert.strictEqual(F.zoneFor(200, 10, 'zone_0_0'), 'zone_1_0'); assert.strictEqual(F.zoneRoom(-1, -1), 'zone_-1_-1');
  // interpolation
  const I = new F.Interp(100); I.push(1000, 0, 0, 0, 0); I.push(1200, 10, 0, 0, 0); let s = I.sample(1200); assert.ok(Math.abs(s.x - 5) < 1e-6, 'midpoint at now-100ms'); I.push(1100, 99, 0, 0, 0); assert.strictEqual(I.b.length, 2, 'out-of-order snapshot ignored');
  const J = new F.Interp(0); J.push(0, 0, 0, 0, 3.0); J.push(100, 0, 0, 0, -3.0); s = J.sample(50); assert.ok(Math.abs(Math.abs(s.ry) - Math.PI) < 0.2, 'rotation takes the short way round'); s = new F.Interp(0).sample(5); assert.strictEqual(s, null);
  console.log('ok  - zones + interpolation');
  // two live clients
  const A = F.create({ sb: fakeSb('A'), me: { id: 'A', username: 'ada' } }), B = F.create({ sb: fakeSb('B'), me: { id: 'B', username: 'bolu' } });
  const joined = [], profs = []; A.on('peerJoin', p => joined.push(p.id)); A.on('peerProfile', p => profs.push(p.profile.username));
  await A.join('zone_0_0'); await B.join('zone_0_0'); await wait(20);
  assert.deepStrictEqual(joined, ['B'], 'A sees B join'); assert.deepStrictEqual(profs, ['bolu'], 'name comes from profiles table'); console.log('ok  - presence + profile lookup');
  // a player changes their look (salon / wardrobe / clothes app): the other player must get the NEW avatar, not the cached one
  bus.profiles.B = { id: 'B', username: 'bolu', avatar_json: { v: 2 }, avatar_hash: 'h2' }; B.setLook('h2'); await wait(30);
  assert.strictEqual(A.peers.get('B').profile.avatar_hash, 'h2', 'A reloaded B\'s profile after B changed look'); assert.strictEqual(A.peers.get('B').profile.avatar_json.v, 2, 'A has the new avatar_json');
  assert.strictEqual(profs.length, 2, 'peerProfile fired again so the avatar gets rebuilt'); B.setLook('h2'); await wait(30); assert.strictEqual(profs.length, 2, 'same hash again: no needless reload'); console.log('ok  - look change reaches other players');
  for (let i = 0; i < 6; i++) { B.tick(i, 0, 3, 0.5, 'walk', false); await wait(10); }   // 10ms apart: throttle must drop most
  const sent = A.peers.get('B').interp.b.length; assert.ok(sent >= 1 && sent <= 2, 'position sends are throttled (got ' + sent + ')'); console.log('ok  - throttle');
  await wait(300); B.tick(9, 0, 3, 0.5, 'walk', false); assert.ok(A.peers.get('B').interp.b.length >= 2, 'later send passes'); assert.strictEqual(A.nearest(0, 0).length, 1, 'nearest() returns B');
  // spoof: broadcast from unknown id is ignored
  bus.channels['futa:zone_0_0'].forEach(o => { if (o.selfId === 'B') o.c.send({ payload: { i: 'ZZ', x: 1, y: 0, z: 1, r: 0 } }); }); assert.ok(!A.peers.has('ZZ'), 'unknown sender ignored');
  bus.channels['futa:zone_0_0'].forEach(o => { if (o.selfId === 'B') o.c.send({ payload: { i: 'B', x: NaN, y: 0, z: 1, r: 0 } }); }); console.log('ok  - junk/unknown packets ignored');
  await B.leave(); await wait(10); assert.ok(!A.peers.has('B'), 'peer removed on leave'); console.log('ok  - leave');
  // zone switch through tick()
  A.tick(400, 0, 10, 0, 'idle', true); await wait(20); assert.strictEqual(A.room, 'zone_2_0'); console.log('ok  - tick() switches zone room');
  // interact: path planning
  const it = { id: 'lib', min: [0, 0], max: [10, 10], cell: .5, blockers: [{ x: 5, z: 5, w: .4, d: 8 }], seats: [{ id: 'c1', x: 8, z: 5, face: 0 }, { id: 'c2', x: 2, z: 5, face: 0 }], atms: [{ id: 'atm1', x: 9.5, z: 9, face: Math.PI }] };
  const grid = G.FutaInteract.makeGrid(it), p = G.FutaInteract.findPath(grid, { x: 2, z: 5 }, { x: 8, z: 5 }); assert.ok(p && p.length >= 3, 'path exists around the wall'); assert.ok(p.some(q => q.z < 1.5 || q.z > 8.5), 'path goes around the 8m wall');
  for (let i = 1; i < p.length; i++) assert.ok(Math.hypot(p[i].x - p[i - 1].x, p[i].z - p[i - 1].z) > 0);
  const wall = { ...it, blockers: [{ x: 5, z: 5, w: .4, d: 20 }] }; assert.strictEqual(G.FutaInteract.findPath(G.FutaInteract.makeGrid(wall), { x: 2, z: 5 }, { x: 8, z: 5 }), null, 'no path through full wall');
  console.log('ok  - A* around furniture');
  // interact: sit
  const pos = { x: 2, z: 2 }, log = []; const player = { get pos() { return pos; }, followPath(pts, done) { const l = pts[pts.length - 1]; pos.x = l.x; pos.z = l.z; setTimeout(() => done(true), 1); }, face: r => log.push('face'), setPose: n => log.push('pose:' + n), teleport: (x, z) => { pos.x = x; pos.z = z; } };
  const AL = F.create({ sb: fakeSb('A'), me: { id: 'A' } }); await AL.join('int_lib_1'); const X = G.FutaInteract.create({ live: AL, player, toast: m => log.push('toast:' + m) }); X.setInterior(it);
  assert.deepStrictEqual(JSON.parse(JSON.stringify(X.pick(8.1, 5.1))), { type: 'seat', id: 'c1', x: 8.1, z: 5.1 }); assert.strictEqual(X.pick(9.4, 8.9).type, 'atm'); assert.strictEqual(X.pick(3, 3).type, 'floor');
  assert.strictEqual(await X.handle(8.1, 5.1), true, 'walks and sits'); assert.strictEqual(X.sitting, 'c1'); assert.ok(log.includes('pose:sit')); assert.ok(bus.rpcs.some(r => r[1] === 'claim_seat' && r[2].p_seat === 'c1'));
  await X.standUp(); assert.strictEqual(X.sitting, null); assert.ok(bus.rpcs.some(r => r[1] === 'release_seat'));
  bus.seats['int_lib_1/c2'] = 'someone-else'; AL.seatsTaken.set('c2', 'someone-else'); assert.strictEqual(await X.sitAt('c2'), false, 'taken seat refused'); assert.ok(log.some(l => l.startsWith('toast:Someone')));
  // real furniture ids look like 'chair#12:0' — the server rule rejected '#' (bad_seat) and the player was told "Someone just sat there" for an EMPTY chair
  const it2 = { ...it, seats: [{ id: 'chair#12:0', x: 8, z: 5, face: 0 }, { id: 'Sofa #3:1', x: 8, z: 6, face: 0 }] }; X.setInterior(it2); log.length = 0;
  assert.strictEqual(await X.sitAt('chair#12:0'), true, "furniture id with '#' can be sat on"); assert.deepStrictEqual(log.filter(l => l.startsWith('toast:')), [], 'no toast on success'); assert.ok(bus.rpcs.some(r => r[1] === 'claim_seat' && r[2].p_seat === 'chair-12:0'), 'server gets a safe seat key');
  assert.strictEqual(AL.seatTaken('chair#12:0'), false, 'my own seat is not "taken"'); await X.standUp();
  assert.strictEqual(await X.sitAt('Sofa #3:1'), true, 'upper case + spaces are mapped too'); await X.standUp();
  bus.seats['int_lib_1/chair-12:0'] = 'someone-else'; AL.seatsTaken.set('chair-12:0', 'someone-else'); assert.strictEqual(AL.seatTaken('chair#12:0'), true, 'another player on that chair is seen'); log.length = 0;
  assert.strictEqual(await X.sitAt('chair#12:0'), false); assert.ok(log.some(l => l === 'toast:Someone is sitting there.'));
  // a real error is reported as an error, never as "someone just sat there"
  const AL2 = F.create({ sb: { ...fakeSb('B'), rpc: () => Promise.resolve({ error: { message: 'boom' } }) }, me: { id: 'B' } }); const X2 = G.FutaInteract.create({ live: AL2, player, toast: m => log.push('toast:' + m) }); X2.setInterior(it2); AL2.room = 'int_lib_1'; log.length = 0;
  assert.strictEqual(await X2.sitAt('chair#12:0'), false); assert.ok(!log.some(l => /just sat/.test(l)), 'errors are not reported as "someone just sat there"'); assert.ok(log.some(l => l.startsWith('toast:')), 'but the player is told something');
  console.log('ok  - furniture ids with # / spaces / capitals; errors are not "someone just sat there"');
  console.log('ok  - click chair → walk → sit; taken seat refused'); console.log('ALL LIVE TESTS PASSED');
})().catch(e => { console.error('FAIL', e); process.exit(1); });
