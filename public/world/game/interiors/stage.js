/* ==========================================================================
   FutaStage — renderer + camera + lights for ONE room.  Used by the game (engine.js) and by preview.html.
     const st = FutaStage.create({ canvas, pixelRatio });   st.setRoom(built);   st.applySky(FutaClock.sky());
     st.frame(dt, targetXZ)   → call every frame: smooths the camera, cuts away the walls that face the camera, renders.
     st.ray(clientX, clientY) → THREE.Raycaster for picking;  st.orbit(dyaw, dpitch);  st.zoom(factor);  st.dispose()
   Camera looks into the room from the front-right (the door side) at about 40°; walls between the camera and the room are hidden.
   ========================================================================== */
(function (g) {
  'use strict';
  const T = g.THREE;
  function create(o) {
    o = o || {}; const canvas = o.canvas || document.createElement('canvas');
    const lowEnd = typeof matchMedia !== 'undefined' && matchMedia('(pointer:coarse)').matches;
    const ren = new T.WebGLRenderer({ canvas, antialias: !lowEnd, powerPreference: 'high-performance', alpha: false }); ren.outputEncoding = T.sRGBEncoding; ren.setPixelRatio(o.pixelRatio || Math.min(lowEnd ? 1.5 : 2, g.devicePixelRatio || 1));
    const scene = new T.Scene(), cam = new T.PerspectiveCamera(42, 1, 0.1, 120);
    const hemi = new T.HemisphereLight(0xffffff, 0x8a8478, 0.95), sun = new T.DirectionalLight(0xfff1d6, 0.55); sun.position.set(6, 10, 8); scene.add(hemi, sun);
    const S = { ren, scene, cam, canvas, hemi, sun, built: null, yaw: 0.62, pitch: 0.72, dist: 11, tgt: new T.Vector3(), cur: new T.Vector3(), minD: 4.5, maxD: 22, ray: new T.Raycaster(), ndc: new T.Vector2(), t: 0 };
    S.resize = function (w, h) { w = w || canvas.clientWidth || innerWidth; h = h || canvas.clientHeight || innerHeight; ren.setSize(w, h, false); cam.aspect = w / h; cam.updateProjectionMatrix(); };
    S.setRoom = function (built) {
      if (S.built) { scene.remove(S.built.group); S.built.dispose(); } S.built = built; scene.add(built.group);
      const m = Math.max(built.w, built.d); S.dist = Math.max(7, Math.min(S.maxD, m * 0.95 + 3)); S.maxD = Math.max(14, m * 1.9 + 6); S.tgt.set(built.w / 2, 0.9, built.d / 2); S.cur.copy(S.tgt); S.ctr = true;
    };
    S.applySky = function (k) {
      if (!k) return; const night = k.night || 0;
      hemi.intensity = 0.82 + 0.18 * (1 - night); hemi.color.setHex(night > 0.5 ? 0xbfc9ff : 0xffffff); sun.color.set(k.sunColor || 0xfff1d6); sun.intensity = 0.15 + 0.4 * Math.min(1, k.sunI || 0);
      const bg = new T.Color(night > 0.5 ? 0x0e1226 : k.phase === 'golden' || k.phase === 'dusk' ? 0x3a2a30 : 0x2b3342); scene.background = bg; if (S.built) S.built.applySky(k);
    };
    S.orbit = (dy, dp) => { S.yaw += dy; S.pitch = Math.max(0.35, Math.min(1.2, S.pitch + dp)); };
    S.zoom = (f) => { S.dist = Math.max(S.minD, Math.min(S.maxD, S.dist * f)); };
    S.follow = (x, z) => { S.tgt.set(x, 0.9, z); };
    const _v = new T.Vector3();
    S.frame = function (dt) {
      S.t += dt; const k = S.ctr ? 1 : 1 - Math.pow(0.0015, dt); S.ctr = false; S.cur.lerp(S.tgt, k);
      const cp = Math.cos(S.pitch); cam.position.set(S.cur.x + Math.sin(S.yaw) * cp * S.dist, S.cur.y + Math.sin(S.pitch) * S.dist, S.cur.z + Math.cos(S.yaw) * cp * S.dist); cam.lookAt(S.cur.x, S.cur.y - 0.1, S.cur.z);
      const b = S.built; if (b) for (const w of Object.values(b.walls)) { const n = w.userData.n, c = w.userData.c; _v.set(cam.position.x - c[0], cam.position.y - c[1], cam.position.z - c[2]); w.visible = (_v.x * n[0] + _v.z * n[2]) < 0.2; }
      ren.render(scene, cam);
    };
    S.rayAt = function (cx, cy) { const r = canvas.getBoundingClientRect(); S.ndc.set(((cx - r.left) / r.width) * 2 - 1, -((cy - r.top) / r.height) * 2 + 1); S.ray.setFromCamera(S.ndc, cam); return S.ray; };
    S.dispose = function () { if (S.built) { scene.remove(S.built.group); S.built.dispose(); S.built = null; } ren.dispose(); ren.forceContextLoss && ren.forceContextLoss(); };
    S.resize(); return S;
  }
  g.FutaStage = { create };
})(typeof window !== 'undefined' ? window : globalThis);
