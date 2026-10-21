/* ==========================================================================
   FutaClock — Akure/Nigeria time (WAT, UTC+1, no daylight saving) → sky + light settings for the map AND the interiors.
   Shared by: world/index.html (applySky), game/interiors/* (window light, lamps), NPC schedules.
   API
     FutaClock.hour()        fractional hour 0–24 in Nigeria time (e.g. 17.5 = 5:30 PM)
     FutaClock.period()      'morning' | 'day' | 'golden' | 'dusk' | 'night'
     FutaClock.sky()         { phase, night, sunElev, sunDir[3], sunI, sunColor, hemiSky, hemiGround, hemiI, fog, background, glow, lamps, zenith, horizon, stars }
     FutaClock.label()       "5:30 PM"
     FutaClock.setFixed(h)   freeze the time for previews/tests (null = real time). Also: open any page with ?t=17.75
     FutaClock.makeDome(THREE) → { mesh, set(k), follow(camera) }   a gradient sky + stars + sun glow, one draw call
   To change the look: edit KEYS below (hour, then values). Everything is interpolated between neighbouring keys.
   ========================================================================== */
(function (g) {
  'use strict';
  const SUNRISE = 6.67, SUNSET = 18.67;                 // Akure is near the equator: sunrise ≈ 6:40, sunset ≈ 18:40 all year
  const hex = (h) => [(h >> 16 & 255) / 255, (h >> 8 & 255) / 255, (h & 255) / 255];
  const toHex = (c) => (Math.round(c[0] * 255) << 16) | (Math.round(c[1] * 255) << 8) | Math.round(c[2] * 255);
  const mix = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
  const L = (a, b, t) => a + (b - a) * t, sm = (t) => t * t * (3 - 2 * t), clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  // hour, night(0..1), sunI, sunColor, hemiSky, hemiGround, hemiI, fog, background(horizon haze), zenith, glow(window light), lamps(street lamps)
  const K = (h, n, si, sc, hs, hg, hi, fog, bg, zen, gl, lp) => ({ h, n, si, sc: hex(sc), hs: hex(hs), hg: hex(hg), hi, fog: hex(fog), bg: hex(bg), zen: hex(zen), gl, lp });
  const KEYS = [
    K(0.0, 1.0, 0.00, 0x8aa4ee, 0x34427a, 0x1a2144, 0.45, 0x101834, 0x131c3c, 0x050912, 1.00, 1.00),
    K(5.0, 1.0, 0.00, 0x8aa4ee, 0x34427a, 0x1a2144, 0.45, 0x101834, 0x131c3c, 0x050912, 1.00, 1.00),
    K(5.9, 0.75, 0.04, 0xffb08a, 0x6a6fa8, 0x3b3a5c, 0.52, 0x6e6a8c, 0x7a6f96, 0x1d2a5a, 0.75, 0.80),   // first light
    K(6.7, 0.30, 0.38, 0xffbe84, 0xc2b8c8, 0x8d7a66, 0.64, 0xe9c3ae, 0xf3c9a6, 0x5f86c4, 0.30, 0.20),   // sunrise (peach)
    K(7.8, 0.08, 0.72, 0xffdcae, 0xdcebf5, 0x8d8466, 0.75, 0xd9e5e6, 0xbcdbea, 0x5aa0dc, 0.08, 0.00),   // soft morning
    K(9.5, 0.00, 0.98, 0xffe8c2, 0xeaf3f8, 0x8d8466, 0.80, 0xcfe0e4, 0xa9d0e6, 0x4c9ae0, 0.00, 0.00),   // bright day
    K(16.3, 0.00, 0.95, 0xffe8c2, 0xeaf3f8, 0x8d8466, 0.80, 0xcfe0e4, 0xa9d0e6, 0x4c9ae0, 0.00, 0.00),
    K(17.4, 0.00, 0.80, 0xffc77a, 0xf3e3cf, 0x9a7a55, 0.72, 0xf0cfa5, 0xf5cf99, 0x5b95d0, 0.04, 0.00),   // golden hour begins
    K(18.2, 0.12, 0.55, 0xff9a52, 0xf0c29a, 0x8a5a45, 0.62, 0xe9a97f, 0xf2a46c, 0x5578b8, 0.30, 0.30),
    K(18.8, 0.45, 0.20, 0xff7a45, 0xb895a8, 0x5a4660, 0.50, 0xa7788f, 0xd5788a, 0x2f3f86, 0.75, 0.85),   // sunset
    K(19.5, 0.85, 0.00, 0x8aa4ee, 0x5a6fb0, 0x2a3466, 0.46, 0x2c3562, 0x3a3f78, 0x0c1234, 0.95, 1.00),   // dusk
    K(20.3, 1.0, 0.00, 0x8aa4ee, 0x34427a, 0x1a2144, 0.45, 0x101834, 0x131c3c, 0x050912, 1.00, 1.00),
    K(24.0, 1.0, 0.00, 0x8aa4ee, 0x34427a, 0x1a2144, 0.45, 0x101834, 0x131c3c, 0x050912, 1.00, 1.00)
  ];
  let fixed = null;
  const q = typeof location !== 'undefined' ? new URLSearchParams(location.search).get('t') : null; if (q != null && q !== '' && !isNaN(+q)) fixed = ((+q % 24) + 24) % 24;
  function hour() { if (fixed != null) return fixed; const d = new Date(Date.now() + 3600000); return d.getUTCHours() + d.getUTCMinutes() / 60 + d.getUTCSeconds() / 3600; }
  function period(h) { h = h == null ? hour() : h; return h < 5.6 || h >= 19.5 ? 'night' : h < 9.5 ? 'morning' : h < 17.0 ? 'day' : h < 18.67 ? 'golden' : 'dusk'; }
  function sky(h) {
    h = h == null ? hour() : h; let a = KEYS[0], b = KEYS[1];
    for (let i = 0; i < KEYS.length - 1; i++) if (h >= KEYS[i].h && h <= KEYS[i + 1].h) { a = KEYS[i]; b = KEYS[i + 1]; break; }
    const t = b.h === a.h ? 0 : sm((h - a.h) / (b.h - a.h)), c = (k) => toHex(mix(a[k], b[k], t));
    const f = clamp((h - SUNRISE) / (SUNSET - SUNRISE), 0, 1), elevRaw = Math.sin(Math.PI * f), up = h > SUNRISE - 0.4 && h < SUNSET + 0.4;
    const az = Math.PI * f;                                              // east → overhead → west
    const dir = up ? [-Math.cos(az) * 0.9, Math.max(0.05, elevRaw), -0.38] : [-0.45, 0.8, -0.35];
    const n = Math.hypot(dir[0], dir[1], dir[2]);
    const night = L(a.n, b.n, t), zen = mix(a.zen, b.zen, t), hor = mix(a.bg, b.bg, t);
    return { phase: period(h), hour: h, night, sunElev: up ? elevRaw : 0, sunDir: [dir[0] / n, dir[1] / n, dir[2] / n], sunI: L(a.si, b.si, t), sunColor: c('sc'),
      hemiSky: c('hs'), hemiGround: c('hg'), hemiI: L(a.hi, b.hi, t), fog: c('fog'), background: c('bg'), glow: L(a.gl, b.gl, t), lamps: L(a.lp, b.lp, t),
      zenith: toHex(zen), horizon: toHex(hor), stars: clamp((night - 0.55) / 0.45, 0, 1), sunUp: up };
  }
  function label(h) { h = h == null ? hour() : h; let hh = Math.floor(h), mm = Math.floor((h - hh) * 60); const ap = hh >= 12 ? 'PM' : 'AM'; hh = hh % 12 || 12; return hh + ':' + (mm < 10 ? '0' : '') + mm + ' ' + ap; }

  /* ---- sky dome: vertical gradient (zenith → horizon haze), warm glow around the sun, stars at night. One mesh, no textures. ---- */
  function makeDome(T) {
    const mat = new T.ShaderMaterial({ side: T.BackSide, depthWrite: false, fog: false,
      uniforms: { uZen: { value: new T.Color(0x4c9ae0) }, uHor: { value: new T.Color(0xa9d0e6) }, uSun: { value: new T.Vector3(0, 1, 0) }, uSunC: { value: new T.Color(0xffe8c2) }, uGlow: { value: 0 }, uStars: { value: 0 } },
      vertexShader: 'varying vec3 vD; void main(){ vD = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); gl_Position.z = gl_Position.w * 0.99999; }',
      fragmentShader: 'varying vec3 vD; uniform vec3 uZen,uHor,uSun,uSunC; uniform float uGlow,uStars;' +
        'float h21(vec2 p){ p = fract(p*vec2(123.34,456.21)); p += dot(p,p+45.32); return fract(p.x*p.y); }' +
        'void main(){ vec3 d = normalize(vD); float up = clamp(d.y,0.0,1.0); vec3 col = mix(uHor, uZen, pow(up,0.55));' +
        ' col = mix(col, uHor*0.85, smoothstep(0.0,-0.25,d.y));' +
        ' float s = max(dot(d, normalize(uSun)),0.0); col += uSunC * (pow(s,24.0)*0.55*uGlow + pow(s,400.0)*1.2*uGlow) * (1.0-up*0.5);' +
        ' if(uStars>0.01 && d.y>0.02){ vec2 p = d.xz/(d.y+0.35)*60.0; vec2 id = floor(p); float r = h21(id); float st = step(0.985,r) * smoothstep(0.5,0.0,length(fract(p)-0.5)) ; col += vec3(0.9,0.93,1.0) * st * uStars * (0.5+0.5*h21(id+7.0)); }' +
        ' gl_FragColor = vec4(col,1.0); }' });
    const mesh = new T.Mesh(new T.SphereGeometry(1, 24, 14), mat); mesh.scale.setScalar(40000); mesh.renderOrder = -10; mesh.frustumCulled = false;
    return { mesh, set(k) { mat.uniforms.uZen.value.setHex(k.zenith); mat.uniforms.uHor.value.setHex(k.horizon); mat.uniforms.uSun.value.set(k.sunDir[0], k.sunDir[1], k.sunDir[2]); mat.uniforms.uSunC.value.setHex(k.sunColor); mat.uniforms.uGlow.value = k.sunUp ? Math.min(1, k.sunI * 1.6 + 0.25) : 0; mat.uniforms.uStars.value = k.stars; },
      follow(cam) { mesh.position.copy(cam.position); } };
  }

  g.FutaClock = { hour, period, sky, label, makeDome, setFixed(h) { fixed = h == null ? null : ((h % 24) + 24) % 24; }, get fixed() { return fixed != null; }, sunrise: SUNRISE, sunset: SUNSET };
})(typeof window !== 'undefined' ? window : globalThis);
