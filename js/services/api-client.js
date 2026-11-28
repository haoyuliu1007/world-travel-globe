(function (global) {
  'use strict';

  const inflight = new Map();
  const hostQueues = new Map();

  const metrics = {
    requests: 0,
    cacheHits: 0,
    networkHits: 0,
    errors: 0,
    bytes: 0,
    recentLog: []
  };

  const UPSTREAM_CATALOG = [
    { id: 'open-meteo', label: 'Open-Meteo (Weather / ERA5 / AQ)' },
    { id: 'nasa-gibs', label: 'NASA EOSDIS GIBS (Time Machine)' },
    { id: 'nasa-epic', label: 'NASA DSCOVR EPIC (L1 Full Disk)' },
    { id: 'noaa-swpc', label: 'NOAA SWPC (Aurora OVATION / Kp)' },
    { id: 'mapterhorn', label: 'Mapterhorn (512px WebP DEM)' },
    { id: 'aws-terrarium', label: 'AWS / Mapzen Terrarium DEM' },
    { id: 'openfreemap', label: 'OpenFreeMap (3D Vector Buildings)' },
    { id: 'wikimedia', label: 'Wikimedia Commons & Wikipedia' },
    { id: 'wikidata', label: 'Wikidata Entity Verification' },
    { id: 'panoramax', label: 'Panoramax (360° Street View)' },
    { id: 'osrm', label: 'OSRM / OSM Routing Engine' }
  ];

  const serviceHealth = new Map();
  UPSTREAM_CATALOG.forEach((s) => {
    serviceHealth.set(s.id, {
      id: s.id,
      label: s.label,
      status: 'idle',
      freshness: 'realtime',
      latencyMs: 0,
      lastCheckedAt: 0,
      lastError: ''
    });
  });

  let workerCapabilities = null;
  let workerCapabilitiesExpiresAt = 0;
  let workerProbePromise = null;

  function inferServiceId(url, options) {
    if (options && options.serviceId && serviceHealth.has(options.serviceId)) return options.serviceId;
    const u = String(url || '').toLowerCase();
    if (u.includes('open-meteo') || u.includes('/api/weather')) return 'open-meteo';
    if (u.includes('gibs.earthdata') || u.includes('blackmarble')) return 'nasa-gibs';
    if (u.includes('epic.gsfc') || u.includes('/api/epic')) return 'nasa-epic';
    if (u.includes('swpc.noaa') || u.includes('/api/aurora')) return 'noaa-swpc';
    if (u.includes('mapterhorn')) return 'mapterhorn';
    if (u.includes('elevation-tiles-prod') || u.includes('terrarium')) return 'aws-terrarium';
    if (u.includes('openfreemap')) return 'openfreemap';
    if (u.includes('wikimedia.org') || u.includes('wikipedia.org') || u.includes('/api/commons') || u.includes('/api/wikipedia')) return 'wikimedia';
    if (u.includes('wikidata.org') || u.includes('/api/wikidata')) return 'wikidata';
    if (u.includes('panoramax') || u.includes('/api/panoramax')) return 'panoramax';
    if (u.includes('osrm') || u.includes('routing.openstreetmap') || u.includes('/api/route')) return 'osrm';
    return null;
  }

  function recordServiceHealth(id, info) {
    if (!id || !serviceHealth.has(id)) return;
    const cur = serviceHealth.get(id);
    serviceHealth.set(id, Object.assign({}, cur, info, { lastCheckedAt: Date.now() }));
  }

  function getServiceHealth() {
    return Array.from(serviceHealth.values());
  }

  function logEntry(item) {
    metrics.recentLog.unshift(Object.assign({ ts: Date.now() }, item));
    if (metrics.recentLog.length > 40) metrics.recentLog.length = 40;
  }

  function getHost(url) {
    try {
      return new URL(url, global.location && global.location.href ? global.location.href : 'https://localhost').host || 'local';
    } catch (e) {
      return 'local';
    }
  }

  function scheduleHostSlot(host, minIntervalMs) {
    const gap = minIntervalMs || 120;
    const prev = hostQueues.get(host) || { nextAt: 0 };
    const now = Date.now();
    const waitMs = Math.max(0, prev.nextAt - now);
    const nextAt = Math.max(now, prev.nextAt) + gap;
    hostQueues.set(host, { nextAt });
    if (waitMs <= 0) return Promise.resolve();
    return new Promise((r) => setTimeout(r, waitMs));
  }

  function parseRetryAfterMs(headerVal) {
    if (!headerVal) return null;
    const sec = Number(headerVal);
    if (Number.isFinite(sec) && sec >= 0) {
      return Math.min(6000, Math.round(sec * 1000));
    }
    const ts = Date.parse(headerVal);
    if (Number.isFinite(ts)) {
      return Math.min(6000, Math.max(0, ts - Date.now()));
    }
    return null;
  }

  function computeBackoffMs(attempt, retryAfterHeader) {
    const ra = parseRetryAfterMs(retryAfterHeader);
    if (ra !== null && ra > 0) return ra;
    const exp = Math.min(4000, 350 * Math.pow(2, attempt));
    const jitter = Math.round(Math.random() * 200);
    return exp + jitter;
  }

  async function detectWorkerCapabilities() {
    if (workerCapabilities && Date.now() < workerCapabilitiesExpiresAt) return workerCapabilities;
    if (workerProbePromise) return workerProbePromise;

    workerProbePromise = (async () => {
      const fallback = {
        available: false,
        mode: 'static-direct',
        features: { weather: false, commons: false, wikidata: false, streetview: false, route: false, d1: false, r2: false }
      };
      if (!global.location || global.location.protocol === 'file:') {
        workerCapabilities = fallback;
        workerCapabilitiesExpiresAt = Infinity;
        return workerCapabilities;
      }
      try {
        const ctrl = typeof AbortController !== 'undefined' ? new AbortController() : null;
        const timer = ctrl ? setTimeout(() => ctrl.abort(), 5000) : null;
        const res = await fetch('/api/health', {
          signal: ctrl ? ctrl.signal : undefined,
          headers: { Accept: 'application/json' }
        });
        if (timer) clearTimeout(timer);
        if (!res.ok) {
          workerCapabilities = fallback;
          workerCapabilitiesExpiresAt = Date.now() + 30000;
          return workerCapabilities;
        }
        const ct = res.headers.get('content-type') || '';
        if (!ct.includes('application/json')) {
          workerCapabilities = fallback;
          workerCapabilitiesExpiresAt = Date.now() + 30000;
          return workerCapabilities;
        }
        const json = await res.json();
        workerCapabilities = Object.assign({ available: true, mode: 'cloudflare-worker' }, json);
        workerCapabilitiesExpiresAt = Date.now() + 600000;
        return workerCapabilities;
      } catch (e) {
        workerCapabilities = fallback;
        workerCapabilitiesExpiresAt = Date.now() + 30000;
        return workerCapabilities;
      } finally {
        workerProbePromise = null;
      }
    })();

    return workerProbePromise;
  }

  function createCombinedSignal(timeoutMs, externalSignal) {
    if (typeof AbortController === 'undefined') {
      return { signal: externalSignal, cleanup: () => {} };
    }
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(new Error('Request timeout')), timeoutMs);
    const onExternalAbort = () => ctrl.abort(externalSignal ? externalSignal.reason : new Error('Aborted'));
    if (externalSignal) {
      if (externalSignal.aborted) ctrl.abort(externalSignal.reason);
      else if (typeof externalSignal.addEventListener === 'function') {
        externalSignal.addEventListener('abort', onExternalAbort, { once: true });
      }
    }
    return {
      signal: ctrl.signal,
      cleanup: () => {
        clearTimeout(timer);
        if (externalSignal && typeof externalSignal.removeEventListener === 'function') {
          externalSignal.removeEventListener('abort', onExternalAbort);
        }
      }
    };
  }

  async function rawFetchWithRetry(url, opts) {
    const options = opts || {};
    const timeoutMs = options.timeoutMs || 10000;
    const retries = options.retries !== undefined ? options.retries : 1;
    const host = getHost(url);

    let lastErr = null;
    for (let attempt = 0; attempt <= retries; attempt++) {
      if (options.signal && options.signal.aborted) {
        throw new Error('Request aborted');
      }
      await scheduleHostSlot(host, options.minIntervalMs || 110);
      const { signal, cleanup } = createCombinedSignal(timeoutMs, options.signal);
      try {
        const res = await fetch(url, {
          method: options.method || 'GET',
          headers: options.headers || undefined,
          body: options.body || undefined,
          signal
        });
        cleanup();
        if (!res.ok) {
          if ((res.status === 429 || res.status === 503 || res.status >= 500) && attempt < retries) {
            const waitMs = computeBackoffMs(attempt, res.headers && res.headers.get('Retry-After'));
            await new Promise((r) => setTimeout(r, waitMs));
            continue;
          }
          throw new Error(`HTTP ${res.status}`);
        }
        const text = await res.text();
        metrics.bytes += text.length;
        return options.responseType === 'text' ? text : JSON.parse(text);
      } catch (err) {
        cleanup();
        lastErr = err;
        if (options.signal && options.signal.aborted) throw err;
        if (attempt < retries) {
          const waitMs = computeBackoffMs(attempt, null);
          await new Promise((r) => setTimeout(r, waitMs));
        }
      }
    }
    throw lastErr || new Error('Network request failed');
  }

  async function fetchJson(url, opts) {
    const options = opts || {};
    const cacheKey = options.cacheKey || `url:${url}`;
    const ttlMs = options.ttlMs || 0;
    const svcId = inferServiceId(url, options);
    metrics.requests++;

    if (!options.bypassCache && ttlMs > 0 && global.StorageDB) {
      const cached = await global.StorageDB.getCache(cacheKey);
      if (cached && cached.data !== undefined) {
        metrics.cacheHits++;
        if (svcId) recordServiceHealth(svcId, { status: 'ok', freshness: 'cached', lastError: '' });
        logEntry({ cacheKey, status: 'cache-hit', source: cached.source || 'idb' });
        return cached.data;
      }
    }

    if (inflight.has(cacheKey)) {
      return inflight.get(cacheKey);
    }

    const t0 = Date.now();
    const p = (async () => {
      try {
        const data = await rawFetchWithRetry(url, options);
        const latencyMs = Date.now() - t0;
        metrics.networkHits++;
        if (svcId) {
          recordServiceHealth(svcId, {
            status: 'ok',
            freshness: options.freshness || 'realtime',
            latencyMs,
            lastError: ''
          });
        }
        if (ttlMs > 0 && global.StorageDB) {
          await global.StorageDB.setCache(cacheKey, data, ttlMs, options.source || getHost(url));
        }
        logEntry({ cacheKey, status: 'ok', latencyMs, source: options.source || getHost(url) });
        return data;
      } catch (err) {
        const latencyMs = Date.now() - t0;
        const msg = String(err && err.message ? err.message : err);
        metrics.errors++;
        if (svcId) {
          recordServiceHealth(svcId, {
            status: 'unavailable',
            freshness: 'unavailable',
            latencyMs,
            lastError: msg
          });
        }
        logEntry({ cacheKey, status: 'error', error: msg });
        throw err;
      } finally {
        inflight.delete(cacheKey);
      }
    })();

    inflight.set(cacheKey, p);
    return p;
  }

  function getMetrics() {
    const hitRate = metrics.requests ? Math.round((metrics.cacheHits / metrics.requests) * 100) : 0;
    return Object.assign({}, metrics, { hitRatePct: hitRate });
  }

  const api = {
    UPSTREAM_CATALOG,
    fetchJson,
    detectWorkerCapabilities,
    getWorkerCapabilities: () => workerCapabilities,
    recordServiceHealth,
    getServiceHealth,
    getMetrics
  };

  global.ApiClient = api;
  if (typeof module === 'object' && module.exports) {
    module.exports = api;
  }
})(typeof window !== 'undefined' ? window : globalThis);
