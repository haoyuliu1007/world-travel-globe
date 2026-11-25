/* World Travel Globe Offline-First Service Worker */
const CACHE_NAME = 'wtg-shell-v3';
const DATA_CACHE = 'wtg-data-v3';

const CORE_ASSETS = [
  './',
  './index.html',
  './css/styles.css',
  './css/upgrades.css',
  './vendor/maplibre-gl.css',
  './vendor/maplibre-gl.js',
  './vendor/suncalc.min.js',
  './vendor/fuse.min.js',
  './vendor/supercluster.min.js',
  './vendor/dexie.min.js',
  './js/icons.js',
  './js/i18n.js',
  './js/theme.js',
  './js/detail-panel.js',
  './js/command-palette.js',
  './js/gallery.js',
  './js/app.js'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(CORE_ASSETS)).catch(() => {})
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((k) => k !== CACHE_NAME && k !== DATA_CACHE)
          .map((k) => caches.delete(k))
      )
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;

  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  // Network-first for Cloudflare Worker /api/* endpoints
  if (url.pathname.startsWith('/api/')) {
    event.respondWith(
      fetch(req).catch(() => new Response(JSON.stringify({ ok: false, offline: true }), {
        status: 503,
        headers: { 'Content-Type': 'application/json' }
      }))
    );
    return;
  }

  // Cache-first for lazy region chunks and vendor libs
  if (url.pathname.includes('/data/regions/') || url.pathname.includes('/vendor/')) {
    event.respondWith(
      caches.open(DATA_CACHE).then(async (cache) => {
        const hit = await cache.match(req);
        if (hit) return hit;
        const res = await fetch(req);
        if (res && res.ok) cache.put(req, res.clone());
        return res;
      })
    );
    return;
  }

  // Stale-while-revalidate for shell assets
  event.respondWith(
    caches.open(CACHE_NAME).then(async (cache) => {
      const hit = await cache.match(req);
      const netPromise = fetch(req)
        .then((res) => {
          if (res && res.ok) cache.put(req, res.clone());
          return res;
        })
        .catch(() => null);
      return hit || (await netPromise);
    })
  );
});
