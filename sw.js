/* World Travel Globe Offline-First Service Worker */
const CACHE_NAME = 'wtg-shell-__BUILD_VER__';
const DATA_CACHE = 'wtg-data-v4';

const CORE_ASSETS = /* __SW_CORE_ASSETS__ */ ['./', './index.html'];

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
  // Let the media server handle byte ranges and avoid caching the entire intro in the shell.
  if (req.headers.has('Range') || /\/assets\/cosmic-intro\/[^/]+\.(?:mp4|webm)$/.test(url.pathname)) return;

  // Network-first for Worker /api/* endpoints
  if (url.pathname.startsWith('/api/')) {
    event.respondWith(
      fetch(req).catch(() => new Response(JSON.stringify({ ok: false, offline: true }), {
        status: 503,
        headers: { 'Content-Type': 'application/json' }
      }))
    );
    return;
  }

  // Cache-first for lazy region chunks, i18n chunks, and vendor libs
  if (
    url.pathname.includes('/data/regions/') ||
    url.pathname.includes('/data/i18n/') ||
    url.pathname.includes('/vendor/')
  ) {
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

  // Navigation requests (HTML shell): network-first so updates take effect immediately, cache as offline fallback
  if (req.mode === 'navigate') {
    event.respondWith(
      caches.open(CACHE_NAME).then(async (cache) => {
        try {
          const res = await fetch(req);
          if (res && res.ok) {
            cache.put('./index.html', res.clone());
          }
          return res;
        } catch {
          return (await cache.match('./index.html')) || (await cache.match('./'));
        }
      })
    );
    return;
  }

  // Versioned bundled shell assets (/css/, /js/, /data/atlas-index.min.js): cache-first
  if (
    url.searchParams.has('v') &&
    (url.pathname.includes('/css/') ||
      url.pathname.includes('/js/') ||
      url.pathname.includes('/data/atlas-index.min.js'))
  ) {
    event.respondWith(
      caches.open(CACHE_NAME).then(async (cache) => {
        const hit = await cache.match(req);
        if (hit) return hit;
        const res = await fetch(req);
        if (res && res.ok) cache.put(req, res.clone());
        return res;
      })
    );
    return;
  }

  // Stale-while-revalidate for remaining same-origin shell assets
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
