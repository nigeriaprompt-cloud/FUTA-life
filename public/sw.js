/* FUTAlife service worker. Purpose: make the site installable and show a friendly page when the phone is offline.
   It is deliberately SIMPLE and SAFE:
   - network-first for everything, so a new deploy is always picked up (no stale game code);
   - the cache is only a fallback when the network fails;
   - it never touches Supabase / Google / any other website, only files from this site, and only GET requests.
   To force every phone to drop its cache after a release, change VERSION. */
const VERSION = 'futalife-v3';
const SHELL = ['/offline.html', '/brand/icon-192.png', '/brand/favicon.svg'];
const MAX_ENTRIES = 150;

self.addEventListener('install', (e) => { e.waitUntil(caches.open(VERSION).then(c => c.addAll(SHELL)).then(() => self.skipWaiting())); });
self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k !== VERSION).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});

async function trim(cache) { const keys = await cache.keys(); if (keys.length > MAX_ENTRIES) { await Promise.all(keys.slice(0, keys.length - MAX_ENTRIES).map(k => cache.delete(k))); } }

self.addEventListener('fetch', (e) => {
  const r = e.request, u = new URL(r.url);
  if (r.method !== 'GET' || u.origin !== self.location.origin || r.headers.has('range')) return;        // other sites, uploads, video ranges: let the browser handle it
  if (u.pathname === '/sw.js' || u.pathname === '/ping.txt') return;      // /ping.txt is the connection check: it must always hit the real network
  e.respondWith((async () => {
    try {
      const res = await fetch(r);
      if (res && res.ok && res.type === 'basic') { const c = await caches.open(VERSION); c.put(r, res.clone()).then(() => trim(c)).catch(() => { }); }
      return res;
    } catch (err) {
      const hit = await caches.match(r, { ignoreSearch: r.mode === 'navigate' });
      if (hit) return hit;
      if (r.mode === 'navigate') { const off = await caches.match('/offline.html'); if (off) return off; }
      return new Response('Offline', { status: 503, statusText: 'Offline', headers: { 'content-type': 'text/plain' } });
    }
  })());
});
