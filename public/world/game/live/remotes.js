/* ==========================================================================
   FutaRemotes — draws the other live players: their outfit (from their saved look) + a username label above the head.
   Needs THREE r128 + FutaAvatar + a FutaLive instance. Call update() every frame.
   - At most live.cfg.maxPeersRendered people are drawn (nearest first). Far ones use the cheapest LOD, near ones LOD 1.
   - Avatar geometry is cached per look by FutaAvatar, so ten people with the same look cost one mesh.
   - pick(raycaster) returns the peer under the pointer → open the profile card (ui.js).
   ========================================================================== */
(function (g) {
  'use strict';
  const T = g.THREE, FA = g.FutaAvatar;
  function labelTexture(text, teen) {
    const c = document.createElement('canvas'), x = c.getContext('2d'), fs = 34; x.font = '600 ' + fs + 'px system-ui,sans-serif';
    const w = Math.ceil(x.measureText(text).width) + 36, h = fs + 20; c.width = w; c.height = h; x.font = '600 ' + fs + 'px system-ui,sans-serif';
    x.fillStyle = 'rgba(12,16,32,.78)'; const r = h / 2; x.beginPath(); x.moveTo(r, 0); x.arcTo(w, 0, w, h, r); x.arcTo(w, h, 0, h, r); x.arcTo(0, h, 0, 0, r); x.arcTo(0, 0, w, 0, r); x.fill();
    x.fillStyle = '#fff'; x.textBaseline = 'middle'; x.textAlign = 'center'; x.fillText(text, w / 2, h / 2 + 2);
    const t = new T.CanvasTexture(c); t.minFilter = T.LinearFilter; t.generateMipmaps = false; return { tex: t, aspect: w / h };
  }
  function create(opts) {
    const scene = opts.scene, live = opts.live, groundY = opts.groundY || (() => 0), items = new Map(); let t = 0;
    function make(p) {
      const look = p.profile.avatar_json || FA.look.random('m', 1), av = FA.create(look, { lod: 1 }), lab = labelTexture(p.profile.username), mat = new T.SpriteMaterial({ map: lab.tex, depthTest: false, transparent: true }), sp = new T.Sprite(mat);
      sp.renderOrder = 10; sp.scale.set(0.2 * lab.aspect, 0.2, 1); sp.position.y = 1.95 * look.body.height; av.group.add(sp); scene.add(av.group);
      const it = { av, sp, mat, tex: lab.tex, id: p.id, hash: p.profile.avatar_hash, pose: '', yaw: 0 }; items.set(p.id, it); return it;
    }
    function drop(id) { const it = items.get(id); if (!it) return; scene.remove(it.av.group); it.av.dispose(); it.tex.dispose(); it.mat.dispose(); items.delete(id); }
    const R = {
      items,
      /** @param me {x,z} the local player; @param cam the THREE camera (for label scale) */
      update(dt, me, cam) {
        const list = live.nearest(me.x, me.z), keep = new Set();
        list.forEach(({ p, s, d }) => {
          keep.add(p.id); let it = items.get(p.id); if (it && it.hash !== p.profile.avatar_hash) { drop(p.id); it = null; } if (!it) it = make(p);
          const g_ = it.av.group; g_.position.set(s.x, groundY(s.x, s.z) + (s.y || 0), s.z); g_.rotation.y = s.ry;
          const pose = p.seat ? 'sit' : (s.anim === 'run' ? 'run' : s.anim === 'walk' ? 'walk' : (s.anim || 'idle')); if (pose !== it.pose) { it.pose = pose; it.av.setPose(pose); }
          it.av.update(dt); const near = d < 45; it.sp.visible = near; if (near && cam) { const k = Math.max(1, Math.min(3, d / 8)); it.sp.scale.set(0.2 * k * it.sp.material.map.image.width / it.sp.material.map.image.height, 0.2 * k, 1); }
        });
        items.forEach((_, id) => { if (!keep.has(id)) drop(id); });
      },
      /** returns the peer whose avatar is under the pointer, or null */
      pick(raycaster) { const meshes = []; items.forEach(it => meshes.push(it.av.mesh)); if (!meshes.length) return null; const h = raycaster.intersectObjects(meshes, false)[0]; if (!h) return null; for (const [id, it] of items) if (it.av.mesh === h.object) return live.peers.get(id) || null; return null; },
      dispose() { Array.from(items.keys()).forEach(drop); }
    };
    return R;
  }
  g.FutaRemotes = { create };
})(typeof window !== 'undefined' ? window : globalThis);
