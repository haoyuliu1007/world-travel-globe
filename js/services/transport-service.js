(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory(typeof globalThis !== 'undefined' ? globalThis : root);
  } else {
    root.TransportService = factory(root);
  }
})(typeof window !== 'undefined' ? window : globalThis, function (global) {
  'use strict';

  let hubsCache = null;
  let hubsPromise = null;
  let fxCache = { base: 'CNY', rates: null, date: null, fetchedAt: 0 };

  const FALLBACK_FX_RATES_CNY = {
    CNY: 1,
    USD: 0.138,
    EUR: 0.129,
    JPY: 21.1,
    GBP: 0.109,
    HKD: 1.08,
    TWD: 4.45,
    CHF: 0.122,
    AUD: 0.212,
    CAD: 0.193,
    SGD: 0.185,
    KRW: 192.0,
    THB: 4.78
  };

  function haversineKm(a, b) {
    if (global.RoutingService && typeof global.RoutingService.haversineKm === 'function') {
      return global.RoutingService.haversineKm(a, b);
    }
    const r = Math.PI / 180;
    const dLat = (b[1] - a[1]) * r;
    const dLng = (b[0] - a[0]) * r;
    const s = Math.sin(dLat / 2) ** 2 + Math.cos(a[1] * r) * Math.cos(b[1] * r) * Math.sin(dLng / 2) ** 2;
    return 6371 * 2 * Math.asin(Math.min(1, Math.sqrt(s)));
  }

  async function loadHubs() {
    if (hubsCache) return hubsCache;
    if (hubsPromise) return hubsPromise;
    if (typeof fetch !== 'function') return null;
    hubsPromise = fetch('data/transport/hubs.json')
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (data && data.byId) hubsCache = data.byId;
        return hubsCache;
      })
      .catch(() => null);
    return hubsPromise;
  }

  function getHubsForDest(destId) {
    if (!hubsCache || !destId) return null;
    return hubsCache[destId] || null;
  }

  function buildGreatCircleCoordinates(fromCoords, toCoords, steps) {
    const n = Math.max(8, steps || 28);
    const toRad = Math.PI / 180;
    const toDeg = 180 / Math.PI;
    const lat1 = fromCoords[1] * toRad;
    const lon1 = fromCoords[0] * toRad;
    const lat2 = toCoords[1] * toRad;
    const lon2 = toCoords[0] * toRad;

    const d = 2 * Math.asin(Math.sqrt(
      Math.sin((lat2 - lat1) / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin((lon2 - lon1) / 2) ** 2
    ));
    if (!Number.isFinite(d) || d < 1e-6) return [fromCoords, toCoords];

    const pts = [];
    for (let i = 0; i <= n; i++) {
      const f = i / n;
      const a = Math.sin((1 - f) * d) / Math.sin(d);
      const b = Math.sin(f * d) / Math.sin(d);
      const x = a * Math.cos(lat1) * Math.cos(lon1) + b * Math.cos(lat2) * Math.cos(lon2);
      const y = a * Math.cos(lat1) * Math.sin(lon1) + b * Math.cos(lat2) * Math.sin(lon2);
      const z = a * Math.sin(lat1) + b * Math.sin(lat2);
      const lat = Math.atan2(z, Math.sqrt(x * x + y * y)) * toDeg;
      const lon = Math.atan2(y, x) * toDeg;
      pts.push([Number(lon.toFixed(4)), Number(lat.toFixed(4))]);
    }
    return pts;
  }

  function getBookingLinks(originLabel, dest) {
    const name = (dest && (dest.shortName || dest.name)) || '';
    const qOrig = encodeURIComponent(originLabel || '');
    const qDest = encodeURIComponent(name);
    const hub = getHubsForDest(dest && dest.id);
    const iata = hub && hub.nearestAirports && hub.nearestAirports[0] ? hub.nearestAirports[0].iata : '';
    const links = {
      flight: `https://www.google.com/travel/flights?q=${encodeURIComponent(`Flights to ${iata || name}`)}`,
      rail: (hub && hub.railHub && hub.railHub.operatorUrl) || 'https://www.12306.cn/',
      hotels: `https://www.booking.com/searchresults.html?ss=${qDest}`,
      transit: `https://www.google.com/maps/dir/?api=1&origin=${qOrig}&destination=${qDest}&travelmode=transit`
    };
    return links;
  }

  /**
   * Tier A Intercity comparison across Flight, High-Speed Rail, Regular Rail, Coach, Driving & Ferry.
   * All timings/budgets are explicitly marked estimated; no flight/train numbers or live fares are fabricated.
   */
  function compareIntercityModes(opts) {
    const originCoords = opts && Array.isArray(opts.originCoords) ? opts.originCoords : null;
    const dest = opts && opts.dest ? opts.dest : null;
    const destCoords = dest && Array.isArray(dest.coords) ? dest.coords : null;
    const distanceKm = originCoords && destCoords
      ? Math.round(haversineKm(originCoords, destCoords))
      : Number(opts && opts.fallbackDistanceKm) || 1200;

    const hub = dest ? getHubsForDest(dest.id) : null;
    const links = getBookingLinks(opts && opts.originLabel, dest);
    const railAvailable = Boolean(hub && hub.railHub && hub.railHub.available && distanceKm <= 2400);
    const roadFeasible = distanceKm <= 2200 && !(hub && hub.ferryLikely && distanceKm > 250);

    const modes = [
      {
        id: 'flight',
        tier: 'A',
        feasible: distanceKm >= 120,
        distanceKm,
        durationMin: Math.round(distanceKm / 780 * 60) + 135, // cruise + airport buffer
        estCostRmbRange: [Math.max(450, Math.round(distanceKm * 0.55)), Math.max(950, Math.round(distanceKm * 1.15))],
        routeKind: 'schematic_great_circle',
        providerLabel: 'Great-Circle Geodesic Reference (Not actual airway)',
        officialUrl: links.flight,
        officialLabel: 'Google Flights'
      },
      {
        id: 'hsr',
        tier: 'A',
        feasible: railAvailable && distanceKm <= 2200,
        distanceKm: Math.round(distanceKm * 1.18),
        durationMin: Math.round((distanceKm * 1.18) / 260 * 60) + 35,
        estCostRmbRange: [Math.max(80, Math.round(distanceKm * 0.42)), Math.max(160, Math.round(distanceKm * 0.72))],
        routeKind: 'corridor_estimate',
        providerLabel: 'Regional HSR Corridor Estimate (Verify live schedule)',
        officialUrl: links.rail,
        officialLabel: 'Official Rail'
      },
      {
        id: 'rail',
        tier: 'A',
        feasible: railAvailable && distanceKm <= 2600,
        distanceKm: Math.round(distanceKm * 1.22),
        durationMin: Math.round((distanceKm * 1.22) / 110 * 60) + 30,
        estCostRmbRange: [Math.max(45, Math.round(distanceKm * 0.18)), Math.max(110, Math.round(distanceKm * 0.36))],
        routeKind: 'corridor_estimate',
        providerLabel: 'Conventional Rail Estimate',
        officialUrl: links.rail,
        officialLabel: 'Official Rail'
      },
      {
        id: 'coach',
        tier: 'A',
        feasible: roadFeasible && distanceKm <= 900,
        distanceKm: Math.round(distanceKm * 1.25),
        durationMin: Math.round((distanceKm * 1.25) / 72 * 60) + 20,
        estCostRmbRange: [Math.max(35, Math.round(distanceKm * 0.25)), Math.max(80, Math.round(distanceKm * 0.45))],
        routeKind: 'road_estimate',
        providerLabel: 'Long-Distance Coach Estimate',
        officialUrl: links.transit,
        officialLabel: 'Transit Map'
      },
      {
        id: 'driving',
        tier: 'A',
        feasible: roadFeasible && distanceKm <= 1600,
        distanceKm: Math.round(distanceKm * 1.24),
        durationMin: Math.round((distanceKm * 1.24) / 80 * 60),
        estCostRmbRange: [Math.max(80, Math.round(distanceKm * 0.75)), Math.max(180, Math.round(distanceKm * 1.25))],
        routeKind: 'osrm_road',
        providerLabel: 'OSRM / Road Self-Drive',
        officialUrl: links.transit,
        officialLabel: 'Road Map'
      },
      {
        id: 'ferry',
        tier: 'A',
        feasible: Boolean(hub && hub.ferryLikely) || distanceKm <= 450,
        distanceKm,
        durationMin: Math.round(distanceKm / 38 * 60) + 45,
        estCostRmbRange: [Math.max(60, Math.round(distanceKm * 0.55)), Math.max(180, Math.round(distanceKm * 1.1))],
        routeKind: 'maritime_reference',
        providerLabel: 'Ferry / Maritime Crossing Reference',
        officialUrl: links.transit,
        officialLabel: 'Port Transit'
      }
    ];

    return {
      originLabel: (opts && opts.originLabel) || '',
      destId: dest ? dest.id : '',
      hub,
      modes,
      geometry: originCoords && destCoords
        ? { type: 'LineString', coordinates: buildGreatCircleCoordinates(originCoords, destCoords, 28) }
        : null
    };
  }

  function getArrivalTransfers(dest) {
    const hub = dest ? getHubsForDest(dest.id) : null;
    const primaryAirport = hub && hub.nearestAirports && hub.nearestAirports[0];
    const dist = primaryAirport ? primaryAirport.distanceKm : 28;
    return [
      { id: 'airport_express', labelZh: '机场快线 / 城际铁路', labelEn: 'Airport Express / Rail', durationMin: Math.max(18, Math.round(dist * 0.9)), estCostRmb: Math.max(20, Math.round(dist * 1.2)) },
      { id: 'metro', labelZh: '地铁接驳', labelEn: 'Metro / Subway', durationMin: Math.max(25, Math.round(dist * 1.35)), estCostRmb: Math.max(6, Math.round(dist * 0.35)) },
      { id: 'airport_bus', labelZh: '机场大巴 / 公交', labelEn: 'Airport Shuttle / Bus', durationMin: Math.max(35, Math.round(dist * 1.5)), estCostRmb: Math.max(15, Math.round(dist * 0.7)) },
      { id: 'taxi', labelZh: '出租车 / 网约车', labelEn: 'Taxi / Rideshare', durationMin: Math.max(20, Math.round(dist * 1.1)), estCostRmb: Math.max(45, Math.round(dist * 3.4)) }
    ];
  }

  async function computeLocalLeg(fromCoords, toCoords, localMode) {
    if (localMode === 'transit' || localMode === 'mixed') {
      const straightKm = Number(haversineKm(fromCoords, toCoords).toFixed(2));
      if (localMode === 'mixed' && straightKm <= 2.2 && global.RoutingService) {
        return global.RoutingService.routeSegment(fromCoords, toCoords, 'walking');
      }
      const roadKm = Number((straightKm * 1.26).toFixed(2));
      return {
        routed: false,
        crossSea: straightKm > 2500,
        provider: 'Transit Estimate (Check local metro/bus GTFS)',
        distanceKm: roadKm,
        durationMin: Math.max(10, Math.round((roadKm / 26) * 60) + 8),
        note: '城市公共交通参考估算；具体换乘请以当地地铁/公交实时时刻表为准',
        geometry: { type: 'LineString', coordinates: [fromCoords, toCoords] }
      };
    }
    if (global.RoutingService) {
      return global.RoutingService.routeSegment(fromCoords, toCoords, localMode || 'driving');
    }
    const km = Number(haversineKm(fromCoords, toCoords).toFixed(2));
    return {
      routed: false,
      crossSea: false,
      provider: 'Straight-Line Estimate',
      distanceKm: km,
      durationMin: Math.round(km * 2),
      geometry: { type: 'LineString', coordinates: [fromCoords, toCoords] }
    };
  }

  async function fetchExchangeRates(baseCurrency) {
    const base = String(baseCurrency || 'CNY').toUpperCase();
    if (fxCache.rates && fxCache.base === base && Date.now() - fxCache.fetchedAt < 12 * 3600 * 1000) {
      return fxCache;
    }
    try {
      const Api = global.ApiClient;
      const caps = Api ? await Api.detectWorkerCapabilities() : { available: false };
      const url = caps && caps.available && caps.features && caps.features.fx
        ? `/api/fx?from=${encodeURIComponent(base)}`
        : `https://api.frankfurter.app/latest?from=${encodeURIComponent(base)}`;
      const res = await fetch(url, { signal: AbortSignal.timeout ? AbortSignal.timeout(7000) : undefined });
      const data = await res.json().catch(() => null);
      if (res.ok && data && data.rates) {
        data.rates[base] = 1;
        fxCache = { base, rates: data.rates, date: data.date || new Date().toISOString().slice(0, 10), fetchedAt: Date.now(), source: 'Frankfurter (ECB Reference)' };
        return fxCache;
      }
    } catch (e) {
      // fall through to offline reference rates
    }
    const cnyRates = Object.assign({}, FALLBACK_FX_RATES_CNY);
    const basePerCny = cnyRates[base] || 1;
    const derived = {};
    for (const k of Object.keys(cnyRates)) {
      derived[k] = Number((cnyRates[k] / basePerCny).toFixed(4));
    }
    fxCache = { base, rates: derived, date: 'offline-ref', fetchedAt: Date.now(), source: 'Offline Reference Fallback (Not live market rate)' };
    return fxCache;
  }

  return {
    haversineKm,
    loadHubs,
    getHubsForDest,
    buildGreatCircleCoordinates,
    getBookingLinks,
    compareIntercityModes,
    getArrivalTransfers,
    computeLocalLeg,
    fetchExchangeRates
  };
});
