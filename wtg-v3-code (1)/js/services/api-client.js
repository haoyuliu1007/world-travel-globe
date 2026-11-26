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

  let workerCapabilities = null;
  let workerProbePromise = null;

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

  async function detectWorkerCapabilities() {
    if (workerCapabilities) return workerCapabilities;
    if (workerProbePromise) return workerProbePromise;

    workerProbePromise = (async () => {
      const fallback = {
        available: false,
        mode: 'static-direct',
        features: { weather: false, commons: false, wikidata: false, streetview: false, route: false, d1: false, r2: false }
      };
      if (!global.location || global.location.protocol === 'file:') {
        workerCapabilities = fallback;
        return workerCapabilities;
      }
      try {
        const ctrl = typeof AbortController !== 'undefined' ? new AbortController() : null;
        const timer = ctrl ? setTimeout(() => ctrl.abort(), 1800) : null;
        const res = await fetch('/api/health', {
          signal: ctrl ? ctrl.signal : undefined,
          headers: { Accept: 'application/json' }
        });
        if (timer) clearTimeout(timer);
        if (!res.ok) {
          workerCapabilities = fallback;
          return workerCapabilities;
        }
        const ct = res.headers.get('content-type') || '';
        if (!ct.includes('application/json')) {
          workerCapabilities = fallback;
          return workerCapabilities;
        }
        const json = await res.json();
        workerCapabilities = Object.assign({ available: true, mode: 'cloudflare-worker' }, json);
        return workerCapabilities;
      } catch (e) {
        workerCapabilities = fallback;
        return workerCapabilities;
      }
    })();

    return workerProbePromise;
  }

  async function rawFetchWithRetry(url, opts) {
    const options = opts || {};
    const timeoutMs = options.timeoutMs || 10000;
    const retries = options.retries !== undefined ? options.retries : 1;
    const host = getHost(url);

    let lastErr = null;
    for (let attempt = 0; attempt <= retries; attempt++) {
      await scheduleHostSlot(host, options.minIntervalMs || 110);
      const ctrl = typeof AbortController !== 'undefined' ? new AbortController() : null;
      const timer = ctrl ? setTimeout(() => ctrl.abort(), timeoutMs) : null;
      try {
        const res = await fetch(url, {
          method: options.method || 'GET',
          headers: options.headers || undefined,
          body: options.body || undefined,
          signal: ctrl ? ctrl.signal : undefined
        });
        if (timer) clearTimeout(timer);
        if (!res.ok) {
          if ((res.status === 429 || res.status >= 500) && attempt < retries) {
            await new Promise((r) => setTimeout(r, 400 * (attempt + 1)));
            continue;
          }
          throw new Error(`HTTP ${res.status}`);
        }
        const text = await res.text();
        metrics.bytes += text.length;
        return options.responseType === 'text' ? text : JSON.parse(text);
      } catch (err) {
        if (timer) clearTimeout(timer);
        lastErr = err;
        if (attempt < retries) {
          await new Promise((r) => setTimeout(r, 400 * (attempt + 1)));
        }
      }
    }
    throw lastErr || new Error('Network request failed');
  }

  async function fetchJson(url, opts) {
    const options = opts || {};
    const cacheKey = options.cacheKey || `url:${url}`;
    const ttlMs = options.ttlMs || 0;
    metrics.requests++;

    if (!options.bypassCache && ttlMs > 0 && global.StorageDB) {
      const cached = await global.StorageDB.getCache(cacheKey);
      if (cached && cached.data !== undefined) {
        metrics.cacheHits++;
        logEntry({ cacheKey, status: 'cache-hit', source: cached.source || 'idb' });
        return cached.data;
      }
    }

    if (inflight.has(cacheKey)) {
      return inflight.get(cacheKey);
    }

    const p = (async () => {
      try {
        const data = await rawFetchWithRetry(url, options);
        metrics.networkHits++;
        if (ttlMs > 0 && global.StorageDB) {
          await global.StorageDB.setCache(cacheKey, data, ttlMs, options.source || getHost(url));
        }
        logEntry({ cacheKey, status: 'ok', source: options.source || getHost(url) });
        return data;
      } catch (err) {
        metrics.errors++;
        logEntry({ cacheKey, status: 'error', error: String(err && err.message ? err.message : err) });
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

  global.ApiClient = {
    fetchJson,
    detectWorkerCapabilities,
    getWorkerCapabilities: () => workerCapabilities,
    getMetrics
  };
})(window);
