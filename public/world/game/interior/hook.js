/* Map → interior hook. The 800 KB map page calls window.FUTA_INTERIOR.enter(building) when the player taps "Enter".
   We just navigate to the interior page (a separate page = the map stays small and fast; the interior loads only when someone goes in).
   The interior's Leave button comes back to /world/ . */
(function (g) {
  'use strict';
  g.FUTA_INTERIOR = {
    enter(b) {
      if (!b) return;
      const q = new URLSearchParams({ id: b.id || '', n: b.name || '', ty: b.type || '', r: location.pathname + (location.hash || '') });
      try { sessionStorage.setItem('futa.lastBuilding', JSON.stringify({ id: b.id, name: b.name, at: Date.now() })); } catch (e) { /* private mode */ }
      const url = '/world/interior.html?' + q.toString();
      if (g.FutaSplash) { g.FutaSplash.show({ name: b.name, type: b.type, fade: true }).set(10, 'Opening the doors…'); setTimeout(() => { location.href = url; }, 260); }   // same screen as the interior page, so the hand-over is seamless
      else location.href = url;
    }
  };
})(window);
