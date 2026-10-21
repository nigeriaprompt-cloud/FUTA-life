/* Campus Dash — the game engine for the Arcade phone app (apps/arcade.js). It is NOT an app: it only defines window.FutaDash.
   One tap / click / Space jumps (hold = higher). Dodge cones, generators, crates and danfo buses; grab ₦ coins.
   SCORE = 10 points per second survived + 5 per coin  (the server relies on this: supabase/19_arcade.sql allows at most 18 per second + 20 and pays 
   from the score, so never make the game give more points per second than that).
   API:  const d = FutaDash.create(canvas, { who: 'guy' | 'lady', seed, onEnd({score, coins, secs}) })
         d.start()  d.jump()  d.release()  d.pause()  d.resume()  d.setWho(w)  d.destroy()   d.state -> { mode: 'ready'|'run'|'paused'|'over', score, coins, t }
         d.step(dt) advances the world by dt seconds (the loop calls it; tests call it directly).   Drawing is plain canvas, no images, no libraries. */
(function (g) {
  'use strict';
  const W = 360, H = 200, GY = 160, PX = 64, GRAV = 1900, JUMP = 640;
  const TYPES = [{ n: 'cone', w: 14, h: 22 }, { n: 'gen', w: 30, h: 28 }, { n: 'crate', w: 26, h: 38 }, { n: 'bus', w: 66, h: 42 }];
  const mkRng = (seed) => { let s = (seed >>> 0) || 12345; return () => ((s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 4294967296); };
  function create(canvas, opts) {
    opts = opts || {}; const ctx = canvas.getContext('2d'), rnd = mkRng(opts.seed || (Date.now() & 0xffff)); let who = opts.who === 'lady' ? 'lady' : 'guy';
    canvas.width = W * 2; canvas.height = H * 2;
    const S = { mode: 'ready', score: 0, coins: 0, t: 0 }; let py = 0, vy = 0, onG = true, holding = false, obs = [], cns = [], nextGap = 0, speed = 200, phase = 0, raf = 0, last = 0, dead = false, scroll = 0, shake = 0, popups = [];
    const reset = () => { S.score = 0; S.coins = 0; S.t = 0; py = 0; vy = 0; onG = true; holding = false; obs = []; cns = []; nextGap = 260; speed = 200; phase = 0; popups = []; shake = 0; };
    function jump() {
      if (S.mode === 'ready') return start(); if (S.mode === 'paused') return resume(); if (S.mode !== 'run') return;
      holding = true; if (onG) { vy = -JUMP; onG = false; }
    }
    function release() { holding = false; if (S.mode === 'run' && vy < -260) vy *= 0.55; }   // let go early = short hop
    function start() { reset(); S.mode = 'run'; last = 0; }
    function pause() { if (S.mode === 'run') S.mode = 'paused'; }
    function resume() { if (S.mode === 'paused') { S.mode = 'run'; last = 0; } }
    const hit = (a, b) => a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
    function step(dt) {
      if (S.mode !== 'run') return; dt = Math.min(dt, 0.05);
      S.t += dt; speed = Math.min(200 + S.t * 5, 400); scroll += speed * dt; phase += dt * (6 + speed / 60);
      vy += GRAV * dt * (holding && vy < 0 ? 0.72 : 1); py += vy * dt; if (py >= 0) { py = 0; vy = 0; onG = true; }
      nextGap -= speed * dt;
      if (nextGap <= 0) {
        const t = TYPES[Math.min(TYPES.length - 1, (rnd() * (1.6 + Math.min(S.t / 25, 2.4))) | 0)];
        obs.push({ x: W + 20, w: t.w, h: t.h, n: t.n }); nextGap = speed * 0.78 + 110 + rnd() * speed * 0.7;
        if (rnd() < 0.6) cns.push({ x: W + 20 + nextGap * 0.5, y: 52 + rnd() * 52 });   // coin floating in the gap
      }
      obs.forEach(o => { o.x -= speed * dt; }); cns.forEach(c => { c.x -= speed * dt; }); obs = obs.filter(o => o.x + o.w > -10); cns = cns.filter(c => c.x > -10);
      const me = { x: PX + 5, y: GY + py - 34, w: 14, h: 34 };
      for (const o of obs) if (hit(me, { x: o.x + 2, y: GY - o.h + 2, w: o.w - 4, h: o.h - 2 })) { return die(); }
      cns = cns.filter(c => { if (hit(me, { x: c.x - 8, y: GY - c.y - 8, w: 16, h: 16 })) { S.coins++; popups.push({ x: PX, y: GY - c.y, t: 0 }); return false; } return true; });
      S.score = Math.floor(S.t * 10) + S.coins * 5;
    }
    function die() { S.mode = 'over'; shake = 0.25; S.score = Math.floor(S.t * 10) + S.coins * 5; draw(); if (opts.onEnd) { try { opts.onEnd({ score: S.score, coins: S.coins, secs: S.t }); } catch (e) { } } }

    /* ---------- drawing ---------- */
    function person(x, y, run) {
      const lady = who === 'lady', skin = lady ? '#8a5a3c' : '#6b4429', top = lady ? '#d6568a' : '#1e5a40', low = lady ? '#6b3fa0' : '#2c3b66';
      ctx.save(); ctx.translate(x, y);
      const sw = run ? Math.sin(phase) * 7 : 0, air = !onG;
      ctx.strokeStyle = skin; ctx.lineWidth = 4; ctx.lineCap = 'round';
      if (lady) { ctx.fillStyle = low; ctx.beginPath(); ctx.moveTo(-1, -17); ctx.lineTo(25, -17); ctx.lineTo(29, -8); ctx.lineTo(-5, -8); ctx.closePath(); ctx.fill(); }   // skirt
      ctx.beginPath(); ctx.moveTo(8, -9); ctx.lineTo(8 + (air ? 6 : sw), air ? -2 : 0); ctx.moveTo(14, -9); ctx.lineTo(14 + (air ? -4 : -sw), air ? -4 : 0); ctx.stroke();       // legs
      if (!lady) { ctx.strokeStyle = low; ctx.beginPath(); ctx.moveTo(8, -12); ctx.lineTo(8 + (air ? 6 : sw), air ? -2 : 0); ctx.moveTo(14, -12); ctx.lineTo(14 + (air ? -4 : -sw), air ? -4 : 0); ctx.stroke(); }
      ctx.fillStyle = top; ctx.fillRect(4, -26, 14, 12);                                    // top
      ctx.strokeStyle = skin; ctx.beginPath(); ctx.moveTo(18, -23); ctx.lineTo(24, air ? -30 : -18 + sw / 3); ctx.moveTo(4, -23); ctx.lineTo(-2, air ? -30 : -18 - sw / 3); ctx.stroke();   // arms
      ctx.fillStyle = skin; ctx.beginPath(); ctx.arc(11, -32, 7, 0, 7); ctx.fill();         // head
      if (lady) { ctx.fillStyle = '#1b1210'; ctx.beginPath(); ctx.arc(11, -34, 7.4, Math.PI, 0); ctx.fill(); ctx.fillRect(3.6, -34, 3, 14 + Math.sin(phase) * (run ? 1.5 : 0)); ctx.beginPath(); ctx.arc(11, -42, 4, 0, 7); ctx.fill(); }   // hair + puff
      else { ctx.fillStyle = '#12392a'; ctx.beginPath(); ctx.arc(11, -34, 7.4, Math.PI, 0); ctx.fill(); ctx.fillRect(11, -35, 11, 3); }   // cap
      ctx.fillStyle = '#fff'; ctx.fillRect(14, -33, 2, 2);                                  // eye
      ctx.restore();
    }
    function obstacle(o) {
      const x = o.x, y = GY - o.h; ctx.save();
      if (o.n === 'cone') { ctx.fillStyle = '#f26b21'; ctx.beginPath(); ctx.moveTo(x + 7, y); ctx.lineTo(x + 14, GY); ctx.lineTo(x, GY); ctx.fill(); ctx.fillStyle = '#fff'; ctx.fillRect(x + 3.5, y + 9, 7, 3); }
      else if (o.n === 'gen') { ctx.fillStyle = '#c0392b'; ctx.fillRect(x, y, o.w, o.h); ctx.fillStyle = '#222'; ctx.fillRect(x + 3, y + 4, 12, 9); ctx.fillStyle = '#f0d78c'; ctx.fillRect(x + 19, y + 5, 7, 4); ctx.fillStyle = '#333'; ctx.fillRect(x + 2, GY - 3, 5, 3); ctx.fillRect(x + o.w - 7, GY - 3, 5, 3); }
      else if (o.n === 'crate') { ctx.fillStyle = '#a9743c'; ctx.fillRect(x, y, o.w, o.h); ctx.strokeStyle = '#6e4519'; ctx.lineWidth = 2; ctx.strokeRect(x + 1, y + 1, o.w - 2, o.h - 2); ctx.beginPath(); ctx.moveTo(x, y + o.h / 2); ctx.lineTo(x + o.w, y + o.h / 2); ctx.stroke(); }
      else { ctx.fillStyle = '#f2c230'; ctx.fillRect(x, y, o.w, o.h - 6); ctx.fillStyle = '#222'; ctx.fillRect(x, y + 16, o.w, 3); ctx.fillStyle = '#bfe3f5'; for (let i = 0; i < 4; i++) ctx.fillRect(x + 5 + i * 15, y + 5, 11, 9); ctx.fillStyle = '#222'; ctx.beginPath(); ctx.arc(x + 14, GY - 4, 6, 0, 7); ctx.arc(x + o.w - 14, GY - 4, 6, 0, 7); ctx.fill(); }
      ctx.restore();
    }
    function draw() {
      ctx.save(); ctx.scale(2, 2); if (shake > 0) { ctx.translate((rnd() - .5) * 5, (rnd() - .5) * 5); }
      const sky = ctx.createLinearGradient(0, 0, 0, GY); sky.addColorStop(0, '#16355f'); sky.addColorStop(.6, '#e07a4f'); sky.addColorStop(1, '#f6c667'); ctx.fillStyle = sky; ctx.fillRect(0, 0, W, H);
      ctx.fillStyle = '#fff4c4'; ctx.beginPath(); ctx.arc(290, 54, 20, 0, 7); ctx.fill();
      const skyl = (k, col, hgt, w) => { ctx.fillStyle = col; const off = (scroll * k) % (w * 3); for (let i = -1; i < 6; i++) { const bx = i * w * 1.0 - off % w, bh = hgt * (0.6 + ((i + Math.floor(off / w) * 7) * 37 % 10) / 14); ctx.fillRect(bx, GY - bh, w - 6, bh); } };
      skyl(.15, '#5b4a70', 70, 46); skyl(.35, '#2f2a49', 44, 38);
      ctx.fillStyle = '#2b2b33'; ctx.fillRect(0, GY, W, H - GY); ctx.fillStyle = '#c9a24a'; ctx.fillRect(0, GY, W, 3);
      ctx.fillStyle = '#f0d78c'; for (let i = 0; i < 12; i++) { const x = ((i * 48 - scroll) % 576 + 576) % 576 - 40; ctx.fillRect(x, GY + 22, 24, 3); }
      cns.forEach(c => { ctx.fillStyle = '#f0b429'; ctx.beginPath(); ctx.arc(c.x, GY - c.y, 8, 0, 7); ctx.fill(); ctx.fillStyle = '#7a5206'; ctx.font = 'bold 11px sans-serif'; ctx.textAlign = 'center'; ctx.fillText('₦', c.x, GY - c.y + 4); });
      obs.forEach(obstacle); person(PX, GY + py, S.mode === 'run' && onG);
      popups.forEach(p => { ctx.fillStyle = 'rgba(255,244,196,' + Math.max(0, 1 - p.t * 2) + ')'; ctx.font = 'bold 12px sans-serif'; ctx.fillText('+5', p.x + 30, p.y - p.t * 30); });
      ctx.fillStyle = 'rgba(255,255,255,.92)'; ctx.font = 'bold 15px system-ui,sans-serif'; ctx.textAlign = 'left'; ctx.fillText(String(S.score), 12, 24); ctx.font = '11px system-ui,sans-serif'; ctx.fillText('₦ ' + S.coins, 12, 40);
      if (S.mode !== 'run') { ctx.fillStyle = 'rgba(8,20,14,.5)'; ctx.fillRect(0, 0, W, H); ctx.fillStyle = '#fff'; ctx.textAlign = 'center'; ctx.font = 'bold 20px Georgia,serif';
        ctx.fillText(S.mode === 'over' ? 'Game over' : S.mode === 'paused' ? 'Paused' : 'Campus Dash', W / 2, 80); ctx.font = '13px system-ui,sans-serif';
        ctx.fillText(S.mode === 'over' ? 'Score ' + S.score : S.mode === 'paused' ? 'Tap to continue' : 'Tap, click or press Space to jump', W / 2, 104); }
      ctx.restore();
    }
    function loop(ts) {
      if (dead) return; raf = requestAnimationFrame(loop); if (!last) last = ts; const dt = Math.min((ts - last) / 1000, 0.1); last = ts;
      if (S.mode === 'run') step(dt); popups.forEach(p => { p.t += dt; }); popups = popups.filter(p => p.t < .5); if (shake > 0) shake -= dt; draw();
    }
    raf = requestAnimationFrame(loop);
    return { state: S, start, jump, release, pause, resume, step, draw, setWho(w) { who = w === 'lady' ? 'lady' : 'guy'; draw(); }, destroy() { dead = true; cancelAnimationFrame(raf); } };
  }
  g.FutaDash = { create, W, H };
})(typeof window !== 'undefined' ? window : globalThis);
