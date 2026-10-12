/* ==========================================================================
   FUTA World — the window.FUTA bridge (docs/ARCHITECTURE.md §5).
   The ONLY supported way for game code to talk to the map.
   Loaded by one <script> tag at the very end of futa-map-modern.html, AFTER
   the map's single big script, so it can use the map's top-level bindings
   (scene, cam, S, G, BLD, SEL, mode, sun, fog, setSel, click, gnd …).
   Never reach into map internals from anywhere else.

   Events: ready, buildingClick(building), enterBuilding(building),
           leaveBuilding, groundClick({x,z}), frame(dt), cameraChange,
           worldReloaded.  enterBuilding/leaveBuilding only start firing
           once something calls FUTA.registerInterior (Phase 3).
   Extra (not in §5): FUTA.isReady flag, FUTA.getCameraState() — used by
           game/net/realtime.js; documented in docs/ARCHITECTURE.md.
   ========================================================================== */
(function () {
  'use strict';

  /* Safe access to a map binding: the map may still be booting (or broken). */
  const g = (fn, dflt) => { try { const v = fn(); return v === undefined ? dflt : v; } catch (e) { return dflt; } };

  const listeners = Object.create(null);
  const FUTA = {
    isReady: false,
    on(name, fn) { (listeners[name] = listeners[name] || []).push(fn); return () => FUTA.off(name, fn); },
    off(name, fn) { const l = listeners[name]; if (l) { const i = l.indexOf(fn); if (i >= 0) l.splice(i, 1); } },
    emit(name, payload) {
      const l = listeners[name];
      if (!l) return;
      for (const fn of l.slice()) { try { fn(payload); } catch (e) { console.error('[FUTA.' + name + ' listener]', e); } }
    },
  };
  window.FUTA = FUTA;

  /* ------------------------------------------------------------ methods */
  FUTA.getScene = () => g(() => scene, null);
  FUTA.getCamera = () => g(() => cam, null);
  FUTA.getBuildings = () => g(() => BLD.slice(), []);
  FUTA.getBuilding = (id) => g(() => BLD.find((b) => b.id === id) || null, null);
  FUTA.getCameraState = () => g(() => ({ x: S.x, z: S.z, d: S.d, yaw: S.yaw, pit: S.pit }), null);

  FUTA.addToScene = (o) => { g(() => { scene.add(o); return true; }); return o; };
  FUTA.removeFromScene = (o) => { g(() => { scene.remove(o); return true; }); return o; };

  FUTA.worldToScreen = (x, z, y) => {
    const v = g(() => {
      const p = new THREE.Vector3(x, y || 0, z).project(cam);
      return { x: (p.x * 0.5 + 0.5) * innerWidth, y: (-p.y * 0.5 + 0.5) * innerHeight, behind: p.z > 1 };
    }, null);
    return v || { x: 0, y: 0, behind: true };
  };

  /* v1: the campus ground is flat (y = 0). Heights come from buildings, not
     terrain. Replace when the map grows real elevation data. */
  FUTA.groundAt = () => 0;

  FUTA.flyTo = (t) => {
    if (!t) return;
    const ok = g(() => {
      const base = { x: S.x, z: S.z, d: S.d, yaw: S.yaw, pit: S.pit };
      G = Object.assign(base, {
        x: t.x != null ? t.x : base.x,
        z: t.z != null ? t.z : base.z,
        d: t.d != null ? t.d : base.d,
        yaw: t.yaw != null ? t.yaw : base.yaw,
        pit: t.pit != null ? t.pit : base.pit,
      });
      return true;
    }, false);
    if (!ok) console.warn('[FUTA.flyTo] map not ready yet');
  };

  /* v1 covers sun + fog (all that has named bindings). ambient / sky / lampsOn
     are accepted and ignored until a lighting user exists — then extend here. */
  FUTA.setLighting = (o) => {
    o = o || {};
    g(() => {
      if (o.sunDir) {
        const v = new THREE.Vector3(o.sunDir.x, o.sunDir.y, o.sunDir.z).normalize().multiplyScalar(4000);
        sun.position.copy(v);
      }
      if (o.sunColor != null && sun.color) sun.set(o.sunColor);
      if (o.fog != null && scene.fog) scene.fog.color.set(o.fog);
      return true;
    });
  };

  /* Interiors (Phase 3): the map looks for window.FUTA_INTERIOR before it
     shows its "isn't built yet" note, so we only install the facade when a
     template has actually registered. */
  const interiors = Object.create(null);
  FUTA.registerInterior = (template, loaderFn) => {
    if (typeof loaderFn !== 'function') return;
    interiors[String(template)] = loaderFn;
    if (!window.FUTA_INTERIOR) {
      let current = null;
      window.FUTA_INTERIOR = {
        enter(building) {
          const tpl = g(() => (building && building.interiorConfig && building.interiorConfig.template) || building.type, null);
          const load = interiors[tpl] || interiors['*'];
          if (!load) return false;               // caller falls back to its own note
          current = building;
          FUTA.emit('enterBuilding', building);
          load(building);
          return true;
        },
        leave() { if (current) { FUTA.emit('leaveBuilding', current); current = null; } },
      };
    }
  };

  /* ------------------------------------------------------------ events */

  /* ready — poll until the map's boot() has applied the world data. */
  (function waitReady() {
    const done = g(() => typeof BLD !== 'undefined' && Array.isArray(BLD) && BLD.length > 0 && !!scene, false);
    if (done) {
      FUTA.isReady = true;
      FUTA.emit('ready');
      FUTA.emit('cameraChange', FUTA.getCameraState()); // seed: consumers learn the current position at once
      return;
    }
    setTimeout(waitReady, 100);
  })();

  /* frame / cameraChange / worldReloaded — our own rAF loop, so the map's
     loop stays untouched. cameraChange only fires when S actually changed. */
  let lastT = performance.now(), snap = null, lastBLD = null;
  (function tick(now) {
    requestAnimationFrame(tick);
    const dt = Math.min(0.05, (now - lastT) / 1000);
    lastT = now;
    if (!FUTA.isReady) return;
    FUTA.emit('frame', dt);
    const s = FUTA.getCameraState();
    if (s && snap && (s.x !== snap.x || s.z !== snap.z || s.d !== snap.d || s.yaw !== snap.yaw || s.pit !== snap.pit)) {
      FUTA.emit('cameraChange', s);
    }
    if (s) snap = s;
    const bl = g(() => BLD, null);
    if (bl && lastBLD && bl !== lastBLD) FUTA.emit('worldReloaded');
    if (bl) lastBLD = bl;
  })(performance.now());

  /* buildingClick / groundClick — wrap the map's own click(e): it either
     selects a building (via setSel) or closes the selection (ground tap). */
  g(() => {
    const prevSel = setSel;
    setSel = function (o) {
      prevSel.apply(this, arguments);
      const isBuilding = o && (o.kind === 'building' || g(() => BLD.indexOf(o) >= 0, false));
      if (isBuilding) FUTA.emit('buildingClick', o);
    };
    const prevClick = click;
    click = function (e) {
      prevClick.apply(this, arguments);
      if (g(() => mode !== 'city', false) || g(() => !!ADMIN, false)) return;
      if (g(() => SEL, null)) return;                // something got picked → buildingClick covers it
      const p = g(() => gnd(e.clientX, e.clientY), null);
      if (p) FUTA.emit('groundClick', { x: p.x, z: p.z });
    };
    return true;
  });
})();
