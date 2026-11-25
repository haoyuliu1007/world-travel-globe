(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory(typeof globalThis !== 'undefined' ? globalThis : root);
  } else {
    root.RoutingService = factory(root);
  }
})(typeof window !== 'undefined' ? window : globalThis, function (global) {
  'use strict';

  const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;

  function haversineKm(a, b) {
    const r = Math.PI / 180;
    const dLat = (b[1] - a[1]) * r;
    const dLng = (b[0] - a[0]) * r;
    const s =
      Math.sin(dLat / 2) ** 2 +
      Math.cos(a[1] * r) * Math.cos(b[1] * r) * Math.sin(dLng / 2) ** 2;
    return 6371 * 2 * Math.asin(Math.min(1, Math.sqrt(s)));
  }

  function mapOsrmProfile(mode) {
    if (mode === 'walking') return 'foot';
    if (mode === 'cycling') return 'bike';
    return 'driving';
  }

  function mapOrsProfile(mode) {
    if (mode === 'walking') return 'foot-walking';
    if (mode === 'cycling') return 'cycling-regular';
    return 'driving-car';
  }

  async function routeSegment(fromCoords, toCoords, mode) {
    const straightKm = Number(haversineKm(fromCoords, toCoords).toFixed(2));
    // Guard: > 2,500 km legs are intercontinental/cross-sea; do not hit road router
    if (straightKm > 2500) {
      return {
        routed: false,
        crossSea: true,
        provider: 'Great-Circle Air Reference',
        distanceKm: straightKm,
        durationMin: null,
        note: '跨海/跨洲距离 (>2,500 km)，仅提供航空直线参考，非陆路路线',
        geometry: { type: 'LineString', coordinates: [fromCoords, toCoords] }
      };
    }

    const coordPair = `${Number(fromCoords[0]).toFixed(5)},${Number(fromCoords[1]).toFixed(5)};${Number(toCoords[0]).toFixed(5)},${Number(toCoords[1]).toFixed(5)}`;
    const cacheKey = `route:v1:${mode}:${coordPair}`;
    if (global.StorageDB) {
      const cached = await global.StorageDB.getCache(cacheKey);
      if (cached && cached.data) return cached.data;
    }

    const Api = global.ApiClient;
    const caps = Api ? await Api.detectWorkerCapabilities() : { available: false };
    const localOrsKey = global.StorageDB ? await global.StorageDB.getSetting('orsApiKey', '') : '';

    // 1. Try Worker /api/route (uses server ORS key or OSRM)
    if (caps && caps.available && caps.features && caps.features.route) {
      try {
        const res = await Api.fetchJson('/api/route', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ coordinates: [fromCoords, toCoords], mode }),
          cacheKey,
          ttlMs: SEVEN_DAYS_MS,
          source: 'Worker Route Proxy'
        });
        if (res && res.routed) return res;
      } catch (e) {
        // fall through
      }
    }

    // 2. Try user-configured OpenRouteService key if provided
    if (localOrsKey) {
      try {
        const orsUrl = `https://api.openrouteservice.org/v2/directions/${mapOrsProfile(mode)}/geojson`;
        const res = await (Api
          ? Api.fetchJson(orsUrl, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json', Authorization: localOrsKey },
              body: JSON.stringify({ coordinates: [fromCoords, toCoords] }),
              cacheKey: `ors:${mode}:${coordPair}`,
              ttlMs: SEVEN_DAYS_MS,
              source: 'OpenRouteService'
            })
          : fetch(orsUrl, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json', Authorization: localOrsKey },
              body: JSON.stringify({ coordinates: [fromCoords, toCoords] })
            }).then((r) => r.json()));

        const feat = res && res.features && res.features[0];
        if (feat && feat.properties && feat.properties.summary) {
          const out = {
            routed: true,
            crossSea: false,
            provider: 'OpenRouteService',
            distanceKm: Number((feat.properties.summary.distance / 1000).toFixed(2)),
            durationMin: Math.round(feat.properties.summary.duration / 60),
            note: '真实路网路线',
            geometry: feat.geometry
          };
          if (global.StorageDB) await global.StorageDB.setCache(cacheKey, out, SEVEN_DAYS_MS, 'OpenRouteService');
          return out;
        }
      } catch (e) {
        // fall back to OSRM
      }
    }

    // 3. Default zero-key public OSRM router
    try {
      const profile = mapOsrmProfile(mode);
      const osrmUrl = `https://router.project-osrm.org/route/v1/${profile}/${coordPair}?overview=full&geometries=geojson`;
      const res = await (Api
        ? Api.fetchJson(osrmUrl, {
            cacheKey: `osrm:${profile}:${coordPair}`,
            ttlMs: SEVEN_DAYS_MS,
            source: 'OSRM Public Router',
            timeoutMs: 9000
          })
        : fetch(osrmUrl).then((r) => r.json()));

      if (res && res.code === 'Ok' && Array.isArray(res.routes) && res.routes[0]) {
        const r0 = res.routes[0];
        const out = {
          routed: true,
          crossSea: false,
          provider: 'OSRM (OpenStreetMap)',
          distanceKm: Number((r0.distance / 1000).toFixed(2)),
          durationMin: Math.round(r0.duration / 60),
          note: '真实 OSM 路网路线',
          geometry: r0.geometry
        };
        if (global.StorageDB) await global.StorageDB.setCache(cacheKey, out, SEVEN_DAYS_MS, 'OSRM');
        return out;
      }
    } catch (e) {
      // Fall through to honest unroutable notice
    }

    return {
      routed: false,
      crossSea: true,
      provider: 'Unroutable / Straight-Line Reference',
      distanceKm: straightKm,
      durationMin: null,
      note: '无法获取陆路连通路径（可能跨海、步行超限或路网接口暂不可用），仅显示直线距离参考',
      geometry: { type: 'LineString', coordinates: [fromCoords, toCoords] }
    };
  }

  async function computeStopsRoute(stops, mode) {
    const legs = [];
    let totalRoutedKm = 0;
    let totalAirRefKm = 0;
    let totalMinutes = 0;
    let hasUnrouted = false;

    for (let i = 0; i < stops.length - 1; i++) {
      const a = stops[i];
      const b = stops[i + 1];
      if (!a || !b || !Array.isArray(a.coords) || !Array.isArray(b.coords)) continue;
      const seg = await routeSegment(a.coords, b.coords, mode);
      legs.push(Object.assign({ fromName: a.name, toName: b.name }, seg));
      if (seg.routed) {
        totalRoutedKm += seg.distanceKm;
        totalMinutes += seg.durationMin || 0;
      } else {
        hasUnrouted = true;
        totalAirRefKm += seg.distanceKm;
      }
    }

    return {
      legs,
      totalRoutedKm: Number(totalRoutedKm.toFixed(1)),
      totalAirRefKm: Number(totalAirRefKm.toFixed(1)),
      totalMinutes,
      hasUnrouted
    };
  }

  return {
    haversineKm,
    routeSegment,
    computeStopsRoute
  };
});
