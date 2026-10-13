/* DEV ONLY: an in-page fake of the few supabase-js calls FutaLive uses, with 3 bot players, so you can try live movement,
   chat, sitting and the ATM with NO Supabase project (live-demo.html). Never loaded by the real game. */
(function (g) {
  'use strict';
  function create(selfId, FA) {
    const chans = {}, bots = {}, wallet = { pocket: 500, bank: 15000, daily: true }, seats = {}, S = { rooms: {} };
    const names = [['zainab', 'f', 11], ['tunde', 'm', 22], ['ngozi', 'f', 33]];
    names.forEach(([n, f, sd], i) => { bots['bot' + i] = { id: 'bot' + i, username: n, avatar_json: FA.look.random(f, sd), avatar_hash: 'b' + i, t0: i * 2.1, cx: -2 + i * 2.5, cz: 2 + (i % 2) * 2 }; });
    const fire = (room, type, cb) => (chans['futa:' + room] || []).forEach(c => c.h.filter(x => x.t === type).forEach(x => cb(x)));
    const api = {
      bots, wallet,
      channel(name, cfg) {
        const c = { name, h: [], meta: null, on(t, f, cb) { c.h.push({ t, f, cb }); return c; }, subscribe(cb) { (chans[name] = chans[name] || []).push(c); setTimeout(() => { cb && cb('SUBSCRIBED'); if (name.indexOf('futa:zone_') === 0 || name.indexOf('futa:int_') === 0) startBots(name); }, 30); return c; },
          track(m) { c.meta = m; return Promise.resolve(); }, send() { return Promise.resolve(); },
          presenceState() { const s = {}; if (c.botsOn) Object.keys(bots).forEach(k => s[k] = [{ hash: bots[k].avatar_hash, seat: bots[k].seat || null }]); return s; } }; return c;
      },
      removeChannel(c) { const k = c.name; chans[k] = (chans[k] || []).filter(x => x !== c); clearInterval(c.iv); return Promise.resolve(); },
      rpc(fn, a) {
        const ok = (d) => Promise.resolve({ data: d, error: null }), bad = (m) => Promise.resolve({ data: null, error: { message: m } });
        if (fn === 'claim_seat') { const k = a.p_room + '/' + a.p_seat; if (seats[k] && seats[k] !== selfId) return ok({ ok: false }); Object.keys(seats).forEach(x => { if (seats[x] === selfId) delete seats[x]; }); seats[k] = selfId; return ok({ ok: true }); }
        if (fn === 'release_seat') { Object.keys(seats).forEach(x => { if (seats[x] === selfId) delete seats[x]; }); return ok(null); }
        if (fn === 'list_seats') return ok(Object.keys(seats).filter(k => k.indexOf(a.p_room + '/') === 0).map(k => ({ seat_id: k.split('/')[1], user_id: seats[k] })));
        if (fn === 'get_wallet') return ok({ pocket: wallet.pocket, bank: wallet.bank, canClaimDaily: wallet.daily });
        if (fn === 'atm_withdraw') { if (a.p_amount > wallet.bank) return bad('insufficient_funds'); wallet.bank -= a.p_amount; wallet.pocket += a.p_amount; return api.rpc('get_wallet'); }
        if (fn === 'atm_deposit') { if (a.p_amount > wallet.pocket) return bad('insufficient_funds'); wallet.bank += a.p_amount; wallet.pocket -= a.p_amount; return api.rpc('get_wallet'); }
        if (fn === 'atm_claim_daily') { if (!wallet.daily) return bad('already_claimed'); wallet.daily = false; wallet.bank += 1000; return api.rpc('get_wallet'); }
        if (fn === 'send_room_message') { const m = { id: Date.now(), room: a.p_room, user_id: selfId, username: 'you', body: a.p_body, created_at: new Date().toISOString() }; setTimeout(() => fire(a.p_room, 'postgres_changes', x => x.f.table === 'room_messages' && x.cb({ new: m })), 40); setTimeout(() => botSay(a.p_room), 900); return ok(m.id); }
        if (fn === 'send_wave') return ok({ status: 'pending' }); if (fn === 'send_dm') return ok(1); return ok(null);
      },
      from(table) {
        const q = { select() { return q; }, in(_, ids) { q.ids = ids; return q; }, eq() { return q; }, or() { return q; }, order() { return q; }, limit() { return q; }, then(r) { r({ data: table === 'profiles' ? (q.ids || []).map(i => bots[i]).filter(Boolean) : [], error: null }); } }; return q;
      }
    };
    function botSay(room) { const b = bots.bot0, m = { id: Date.now() + 1, room, user_id: b.id, username: b.username, body: 'Hi! Welcome to FUTA 👋', created_at: new Date().toISOString() }; fire(room, 'postgres_changes', x => x.f.table === 'room_messages' && x.cb({ new: m })); }
    function startBots(name) {
      const c = (chans[name] || []).slice(-1)[0]; if (!c || c.iv) return; c.botsOn = true; c.h.filter(x => x.t === 'presence').forEach(x => x.cb()); const t0 = performance.now();
      c.iv = setInterval(() => { const t = (performance.now() - t0) / 1000; Object.keys(bots).forEach((k, i) => { const b = bots[k]; if (b.fixed) return; const a = t * .5 + b.t0, x = b.cx + Math.cos(a) * 1.4, z = b.cz + Math.sin(a) * 1.4, r = Math.atan2(-Math.sin(a), Math.cos(a)) + Math.PI / 2; c.h.filter(h => h.t === 'broadcast').forEach(h => h.cb({ payload: { i: k, x, y: 0, z, r, a: 'walk' } })); }); }, 250);
    }
    return api;
  }
  g.FutaMockSb = { create };
})(window);
