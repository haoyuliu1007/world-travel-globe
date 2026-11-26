/* World Travel Globe — Cloudflare Workers Edge API Proxy & Optional D1/R2 Adapter */

const RATE_WINDOW_MS = 60_000;
const RATE_LIMIT_MAX = 90;
const ipHits = new Map();

function corsHeaders(extra) {
  return Object.assign(
    {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Sync-Key'
    },
    extra || {}
  );
}

function jsonResponse(obj, status, cacheControl) {
  return new Response(JSON.stringify(obj), {
    status: status || 200,
    headers: corsHeaders({
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': cacheControl || 'no-store'
    })
  });
}

function checkRateLimit(request) {
  const ip = request.headers.get('CF-Connecting-IP') || 'anon';
  const now = Date.now();
  const entry = ipHits.get(ip);
  if (!entry || now - entry.start > RATE_WINDOW_MS) {
    ipHits.set(ip, { start: now, count: 1 });
    return true;
  }
  entry.count++;
  return entry.count <= RATE_LIMIT_MAX;
}

async function cachedUpstreamJson(cacheKeyUrl, upstreamUrl, ttlSeconds, init) {
  const cache = typeof caches !== 'undefined' ? caches.default : null;
  const cacheReq = new Request(cacheKeyUrl, { method: 'GET' });
  if (cache) {
    const hit = await cache.match(cacheReq);
    if (hit) return hit;
  }
  const res = await fetch(upstreamUrl, init);
  const body = await res.text();
  const out = new Response(body, {
    status: res.status,
    headers: corsHeaders({
      'Content-Type': res.headers.get('content-type') || 'application/json; charset=utf-8',
      'Cache-Control': `public, max-age=${ttlSeconds || 300}`
    })
  });
  if (cache && res.ok) {
    await cache.put(cacheReq, out.clone());
  }
  return out;
}

async function handleApi(request, env) {
  const url = new URL(request.url);
  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders() });
  }
  if (!checkRateLimit(request)) {
    return jsonResponse({ ok: false, error: 'Rate limit exceeded' }, 429);
  }

  const p = url.pathname;

  if (p === '/api/health') {
    return jsonResponse({
      ok: true,
      runtime: 'cloudflare-worker',
      features: {
        weather: true,
        commons: true,
        wikidata: true,
        wikipedia: true,
        img: true,
        tile: true,
        route: true,
        streetview: Boolean(env && (env.MAPILLARY_CLIENT_TOKEN || env.MAPILLARY_TOKEN)),
        pois: true, // Overpass fallback works without a key; OTM key only enhances it
        poisEnhanced: Boolean(env && env.OTM_API_KEY),
        d1: Boolean(env && env.DB),
        r2: Boolean(env && env.PHOTOS_BUCKET)
      }
    });
  }

  if (p === '/api/weather') {
    const endpoint = url.searchParams.get('endpoint') || 'https://api.open-meteo.com/v1/forecast';
    if (!endpoint.startsWith('https://api.open-meteo.com/') && !endpoint.startsWith('https://archive-api.open-meteo.com/')) {
      return jsonResponse({ ok: false, error: 'Disallowed weather endpoint' }, 400);
    }
    const qs = new URLSearchParams(url.searchParams);
    qs.delete('endpoint');
    const upstream = `${endpoint}?${qs.toString()}`;
    return cachedUpstreamJson(request.url, upstream, 1800);
  }

  if (p === '/api/commons') {
    const upstream = `https://commons.wikimedia.org/w/api.php?${url.searchParams.toString()}`;
    return cachedUpstreamJson(request.url, upstream, 86400, {
      headers: { 'User-Agent': 'WorldTravelGlobe/3.0 (https://world-travel-globe.globe-app.workers.dev)' }
    });
  }

  if (p === '/api/wikidata') {
    const upstream = `https://www.wikidata.org/w/api.php?${url.searchParams.toString()}`;
    return cachedUpstreamJson(request.url, upstream, 86400, {
      headers: { 'User-Agent': 'WorldTravelGlobe/3.0 (https://world-travel-globe.globe-app.workers.dev)' }
    });
  }

  if (p === '/api/wikipedia') {
    const lang = url.searchParams.get('lang') || 'en';
    if (lang !== 'zh' && lang !== 'en') {
      return jsonResponse({ ok: false, error: 'Unsupported Wikipedia language' }, 400);
    }
    const qs = new URLSearchParams(url.searchParams);
    qs.delete('lang');
    const upstream = `https://${lang}.wikipedia.org/w/api.php?${qs.toString()}`;
    return cachedUpstreamJson(request.url, upstream, 86400, {
      headers: { 'User-Agent': 'WorldTravelGlobe/3.0 (https://world-travel-globe.globe-app.workers.dev)' }
    });
  }

  if (p === '/api/img') {
    const target = url.searchParams.get('url') || '';
    let parsed;
    try {
      parsed = new URL(target);
    } catch (e) {
      return jsonResponse({ ok: false, error: 'Invalid image URL' }, 400);
    }
    if (parsed.protocol !== 'https:' || parsed.hostname !== 'upload.wikimedia.org') {
      return jsonResponse({ ok: false, error: 'Disallowed image host' }, 400);
    }
    const cache = typeof caches !== 'undefined' ? caches.default : null;
    const cacheReq = new Request(request.url, { method: 'GET' });
    if (cache) {
      const hit = await cache.match(cacheReq);
      if (hit) return hit;
    }
    const res = await fetch(parsed.toString(), {
      headers: {
        'User-Agent': 'WorldTravelGlobe/3.0 (https://world-travel-globe.globe-app.workers.dev)',
        Accept: 'image/*'
      }
    });
    const ct = res.headers.get('content-type') || '';
    if (!ct.startsWith('image/')) {
      return jsonResponse({ ok: false, error: 'Upstream did not return an image' }, res.ok ? 400 : res.status);
    }
    const body = await res.arrayBuffer();
    const out = new Response(body, {
      status: res.status,
      headers: corsHeaders({
        'Content-Type': ct,
        'Cache-Control': 'public, max-age=604800, immutable'
      })
    });
    if (cache && res.ok) {
      await cache.put(cacheReq, out.clone());
    }
    return out;
  }

  const tileMatch = p.match(/^\/api\/tile\/([a-z]+)\/(\d{1,2})\/(\d+)\/(\d+)$/);
  if (tileMatch) {
    const skin = tileMatch[1];
    const z = Number(tileMatch[2]);
    const y = tileMatch[3];
    const x = tileMatch[4];
    if (!Number.isFinite(z) || z > 19) {
      return jsonResponse({ ok: false, error: 'Invalid zoom level' }, 400);
    }
    const tileTemplates = {
      satellite: `https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/${z}/${y}/${x}`,
      natgeo: `https://services.arcgisonline.com/ArcGIS/rest/services/NatGeo_World_Map/MapServer/tile/${z}/${y}/${x}`,
      physical: `https://services.arcgisonline.com/ArcGIS/rest/services/World_Physical_Map/MapServer/tile/${z}/${y}/${x}`,
      labels: `https://services.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/${z}/${y}/${x}`,
      dark: `https://a.basemaps.cartocdn.com/dark_all/${z}/${x}/${y}.png`
    };
    const upstream = tileTemplates[skin];
    if (!upstream) {
      return jsonResponse({ ok: false, error: 'Unsupported tile skin' }, 400);
    }
    const cache = typeof caches !== 'undefined' ? caches.default : null;
    const cacheReq = new Request(request.url, { method: 'GET' });
    if (cache) {
      const hit = await cache.match(cacheReq);
      if (hit) return hit;
    }
    const res = await fetch(upstream, {
      headers: {
        'User-Agent': 'WorldTravelGlobe/3.0 (https://world-travel-globe.globe-app.workers.dev)',
        Accept: 'image/*'
      }
    });
    const ct = res.headers.get('content-type') || 'image/jpeg';
    const body = await res.arrayBuffer();
    const out = new Response(body, {
      status: res.status,
      headers: corsHeaders({
        'Content-Type': ct,
        'Cache-Control': 'public, max-age=604800'
      })
    });
    if (cache && res.ok) {
      await cache.put(cacheReq, out.clone());
    }
    return out;
  }

  if (p === '/api/streetview') {
    // MAPILLARY_CLIENT_TOKEN is the *public* client token (safe to expose to browsers;
    // Mapillary's own docs require it in frontend MapillaryJS). Never store a private
    // app secret here. MAPILLARY_TOKEN is kept as a legacy alias.
    const mlyToken = env && (env.MAPILLARY_CLIENT_TOKEN || env.MAPILLARY_TOKEN);
    if (!mlyToken) {
      return jsonResponse({ ok: false, configured: false, error: 'MAPILLARY_CLIENT_TOKEN not configured' }, 501);
    }
    const bbox = url.searchParams.get('bbox') || '';
    const parts = bbox.split(',').map(Number);
    if (parts.length !== 4 || parts.some((n) => !Number.isFinite(n))) {
      return jsonResponse({ ok: false, error: 'Invalid bbox' }, 400);
    }
    const limit = Math.min(12, Math.max(1, Number(url.searchParams.get('limit') || 8)));
    try {
      const upstream = 'https://graph.mapillary.com/images?access_token=' + mlyToken + '&fields=id,captured_at,compass_angle,is_pano,computed_geometry,thumb_1024_url&bbox=' + encodeURIComponent(bbox) + '&limit=' + limit;
      const res = await fetch(upstream);
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        return jsonResponse({ ok: false, configured: true, error: (data && data.error && data.error.message) || 'Mapillary upstream error', data: [] }, 502);
      }
      // clientToken is public by design: frontend MapillaryJS needs it to render the 360 viewer.
      return jsonResponse({ ok: true, configured: true, clientToken: mlyToken, data: data.data || [] }, 200, 'public, max-age=3600');
    } catch (e) {
      return jsonResponse({ ok: false, configured: true, error: 'Mapillary upstream unreachable', data: [] }, 502);
    }
  }

  if (p === '/api/route' && request.method === 'POST') {
    const body = await request.json().catch(() => null);
    if (!body || !Array.isArray(body.coordinates) || body.coordinates.length < 2) {
      return jsonResponse({ ok: false, error: 'Missing coordinates' }, 400);
    }
    const mode = body.mode || 'driving';
    if (env && env.ORS_API_KEY) {
      const profile = mode === 'walking' ? 'foot-walking' : mode === 'cycling' ? 'cycling-regular' : 'driving-car';
      const orsRes = await fetch(`https://api.openrouteservice.org/v2/directions/${profile}/geojson`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: env.ORS_API_KEY },
        body: JSON.stringify({ coordinates: body.coordinates })
      });
      if (orsRes.ok) {
        const gj = await orsRes.json();
        const f = gj.features && gj.features[0];
        if (f && f.properties && f.properties.summary) {
          return jsonResponse({
            routed: true,
            crossSea: false,
            provider: 'OpenRouteService (Worker)',
            distanceKm: Number((f.properties.summary.distance / 1000).toFixed(2)),
            durationMin: Math.round(f.properties.summary.duration / 60),
            geometry: f.geometry
          });
        }
      }
    }
    // router.project-osrm.org only hosts the *driving* profile; its /foot/ and /bike/
    // paths silently return driving routes. Use the FOSSGIS routing.openstreetmap.de
    // instances for foot/bike so walking/cycling results are genuinely profile-correct.
    // FOSSGIS (routing.openstreetmap.de) hosts car/foot/bike profiles and accepts
    // server-side fetch. router.project-osrm.org 403s non-browser user agents
    // (verified 2026-11-26: nginx 403 HTML, which broke JSON parsing here), so it
    // is only a secondary fallback for driving.
    const fosProfile = mode === 'walking' ? 'routed-foot' : mode === 'cycling' ? 'routed-bike' : 'routed-car';
    const bases = [`https://routing.openstreetmap.de/${fosProfile}/route/v1/driving`];
    if (mode !== 'walking' && mode !== 'cycling') bases.push('https://router.project-osrm.org/route/v1/driving');
    const pair = body.coordinates.map((c) => `${Number(c[0]).toFixed(5)},${Number(c[1]).toFixed(5)}`).join(';');
    let osrmJson = null;
    for (const base of bases) {
      try {
        const r = await fetch(`${base}/${pair}?overview=full&geometries=geojson`, {
          headers: { 'User-Agent': 'world-travel-globe/3.0 (+https://world-travel-globe.globe-app.workers.dev/)' }
        });
        const j = await r.json().catch(() => null);
        if (j && j.code === 'Ok') { osrmJson = j; break; }
        if (j && !osrmJson) osrmJson = j;
      } catch (e) { /* try next base */ }
    }
    if (!osrmJson) {
      return jsonResponse({ routed: false, crossSea: true, error: 'Routing upstream returned invalid response' }, 200);
    }
    if (osrmJson && osrmJson.code === 'Ok' && osrmJson.routes && osrmJson.routes[0]) {
      const r0 = osrmJson.routes[0];
      return jsonResponse({
        routed: true,
        crossSea: false,
        provider: 'OSRM (Worker)',
        distanceKm: Number((r0.distance / 1000).toFixed(2)),
        durationMin: Math.round(r0.duration / 60),
        geometry: r0.geometry
      });
    }
    return jsonResponse({ routed: false, crossSea: true, error: 'No route available' }, 200);
  }

  if (p === '/api/profile') {
    if (!env || !env.DB) {
      return jsonResponse({ ok: false, error: 'D1 database binding (DB) not configured' }, 501);
    }
    const syncKey = request.headers.get('X-Sync-Key') || '';
    if (!syncKey || syncKey.length < 16) {
      return jsonResponse({ ok: false, error: 'Valid X-Sync-Key header required' }, 401);
    }
    if (request.method === 'GET' && url.searchParams.get('backup') === 'latest') {
      try {
        const row = await env.DB.prepare('SELECT payload_json, updated_at, backed_up_at FROM profile_backups WHERE user_key = ? ORDER BY backed_up_at DESC LIMIT 1').bind(syncKey).first();
        if (!row) return jsonResponse({ ok: false, error: 'No backup found' }, 404);
        return jsonResponse({ ok: true, data: JSON.parse(row.payload_json), updatedAt: row.updated_at, backedUpAt: row.backed_up_at });
      } catch (e) {
        return jsonResponse({ ok: false, error: 'Backups not available (migration 0002 not applied)' }, 501);
      }
    }
    if (request.method === 'GET') {
      const row = await env.DB.prepare('SELECT payload_json, updated_at FROM user_profiles WHERE user_key = ?').bind(syncKey).first();
      if (!row) return jsonResponse({ ok: false, error: 'Profile not found' }, 404);
      return jsonResponse({ ok: true, data: JSON.parse(row.payload_json), updatedAt: row.updated_at });
    }
    if (request.method === 'PUT') {
      const payload = await request.text();
      if (payload.length > 5_000_000) {
        return jsonResponse({ ok: false, error: 'Payload too large (max 5 MB)' }, 413);
      }
      try { JSON.parse(payload); } catch (e) {
        return jsonResponse({ ok: false, error: 'Payload is not valid JSON' }, 400);
      }
      const now = Date.now();
      const existing = await env.DB.prepare('SELECT payload_json, updated_at FROM user_profiles WHERE user_key = ?').bind(syncKey).first();
      // Optimistic-concurrency conflict check: client sends the server updatedAt it
      // based its edits on. If the server moved since, refuse to silently overwrite.
      const baseUpdatedAt = Number(request.headers.get('X-Base-Updated-At') || 0);
      if (existing && baseUpdatedAt && Number(existing.updated_at) !== baseUpdatedAt) {
        return jsonResponse({ ok: false, conflict: true, error: 'Server profile changed since last sync; pull and merge first', serverUpdatedAt: Number(existing.updated_at) }, 409);
      }
      if (existing) {
        // Keep the previous version as a backup (best-effort; table may not exist on
        // databases that have not applied migration 0002 yet).
        try {
          await env.DB.prepare('INSERT INTO profile_backups (user_key, payload_json, updated_at, backed_up_at) VALUES (?, ?, ?, ?)')
            .bind(syncKey, existing.payload_json, Number(existing.updated_at), now).run();
          await env.DB.prepare('DELETE FROM profile_backups WHERE user_key = ? AND id NOT IN (SELECT id FROM profile_backups WHERE user_key = ? ORDER BY backed_up_at DESC LIMIT 3)')
            .bind(syncKey, syncKey).run();
        } catch (e) { /* backup is best-effort */ }
      }
      await env.DB.prepare(
        'INSERT INTO user_profiles (user_key, payload_json, updated_at) VALUES (?, ?, ?) ON CONFLICT(user_key) DO UPDATE SET payload_json = excluded.payload_json, updated_at = excluded.updated_at'
      )
        .bind(syncKey, payload, now)
        .run();
      return jsonResponse({ ok: true, updatedAt: now });
    }
    if (request.method === 'DELETE') {
      await env.DB.prepare('DELETE FROM user_profiles WHERE user_key = ?').bind(syncKey).run();
      return jsonResponse({ ok: true });
    }
  }

  if (p === '/api/photos') {
    if (!env || !env.PHOTOS_BUCKET) {
      return jsonResponse({ ok: false, error: 'R2 bucket binding (PHOTOS_BUCKET) not configured' }, 501);
    }
    const syncKey = request.headers.get('X-Sync-Key') || 'anon';
    if (request.method === 'POST') {
      const bytes = await request.arrayBuffer();
      const objKey = `${syncKey.slice(0, 16)}/${Date.now().toString(36)}.jpg`;
      await env.PHOTOS_BUCKET.put(objKey, bytes, { httpMetadata: { contentType: 'image/jpeg' } });
      return jsonResponse({ ok: true, key: objKey }, 201);
    }
  }

  if (p === '/api/pois') {
    const lat = Number(url.searchParams.get('lat'));
    const lon = Number(url.searchParams.get('lon'));
    const radius = Math.min(10000, Number(url.searchParams.get('radius') || 3000));
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
      return jsonResponse({ ok: false, error: 'Invalid lat/lon' }, 400);
    }
    if (env && env.OTM_API_KEY) {
      const otmUrl = `https://api.opentripmap.com/0.1/en/places/radius?radius=${radius}&lon=${lon}&lat=${lat}&rate=2&limit=15&apikey=${encodeURIComponent(env.OTM_API_KEY)}`;
      return cachedUpstreamJson(request.url, otmUrl, 86400);
    }
    // Zero-key Overpass API fallback for open OSM tourism POIs
    const q = `[out:json][timeout:10];(node["tourism"~"attraction|viewpoint|museum"](around:${radius},${lat},${lon}););out center 15;`;
    const opUrl = `https://overpass-api.de/api/interpreter?data=${encodeURIComponent(q)}`;
    return cachedUpstreamJson(request.url, opUrl, 86400);
  }

  return jsonResponse({ ok: false, error: 'Not found' }, 404);
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname.startsWith('/api/')) {
      try {
        return await handleApi(request, env);
      } catch (e) {
        return jsonResponse({ ok: false, error: 'Worker internal error', detail: String(e && e.message ? e.message : e) }, 500);
      }
    }
    if (env && env.ASSETS) {
      return env.ASSETS.fetch(request);
    }
    return new Response('Static assets binding unavailable', { status: 500 });
  }
};
