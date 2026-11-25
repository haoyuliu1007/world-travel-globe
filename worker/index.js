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
        route: true,
        streetview: Boolean(env && env.MAPILLARY_TOKEN),
        pois: Boolean(env && env.OTM_API_KEY),
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

  if (p === '/api/streetview') {
    if (!env || !env.MAPILLARY_TOKEN) {
      return jsonResponse({ ok: false, configured: false, error: 'MAPILLARY_TOKEN not configured' }, 501);
    }
    const bbox = url.searchParams.get('bbox') || '';
    const limit = Math.min(12, Number(url.searchParams.get('limit') || 8));
    const upstream = `https://graph.mapillary.com/images?access_token=${encodeURIComponent(env.MAPILLARY_TOKEN)}&fields=id,captured_at,compass_angle,is_pano,computed_geometry,thumb_1024_url&bbox=${encodeURIComponent(bbox)}&limit=${limit}`;
    const res = await fetch(upstream);
    const data = await res.json();
    return jsonResponse({ ok: res.ok, configured: true, data: data.data || [] }, res.status, 'public, max-age=3600');
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
    const osrmProf = mode === 'walking' ? 'foot' : mode === 'cycling' ? 'bike' : 'driving';
    const pair = body.coordinates.map((c) => `${Number(c[0]).toFixed(5)},${Number(c[1]).toFixed(5)}`).join(';');
    const osrmRes = await fetch(`https://router.project-osrm.org/route/v1/${osrmProf}/${pair}?overview=full&geometries=geojson`);
    const osrmJson = await osrmRes.json();
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
    if (request.method === 'GET') {
      const row = await env.DB.prepare('SELECT payload_json, updated_at FROM user_profiles WHERE user_key = ?').bind(syncKey).first();
      if (!row) return jsonResponse({ ok: false, error: 'Profile not found' }, 404);
      return jsonResponse({ ok: true, data: JSON.parse(row.payload_json), updatedAt: row.updated_at });
    }
    if (request.method === 'PUT') {
      const payload = await request.text();
      const now = Date.now();
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
      return handleApi(request, env);
    }
    if (env && env.ASSETS) {
      return env.ASSETS.fetch(request);
    }
    return new Response('Static assets binding unavailable', { status: 500 });
  }
};
