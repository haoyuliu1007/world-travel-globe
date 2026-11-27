(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory(typeof globalThis !== 'undefined' ? globalThis : root);
  } else {
    root.TripPlanner = factory(root);
  }
})(typeof window !== 'undefined' ? window : globalThis, function (global) {
  'use strict';

  const DAY_COLORS = ['#E2C07D', '#38BDF8', '#34D399', '#F472B6', '#A78BFA', '#FB923C', '#2DD4BF'];

  let activeTrip = null;
  let routeChart = null;
  let dragPayload = null;
  let lastRouteGeoJson = null;
  let plannerDraft = {
    mode: 'new',
    selectedDestId: '',
    destQuery: '',
    origin: '',
    days: 4,
    budgetRmb: 12000,
    month: new Date().getMonth() + 1,
    transportMode: 'driving',
    interest: 'all',
    confirmPending: false
  };

  const CITY_ALIASES = {
    beijing: ['cn-beijing', '北京'],
    peking: ['cn-beijing', '北京'],
    北京: ['cn-beijing'],
    shanghai: ['cn-shanghai', '上海'],
    tokyo: ['jp-kanto-tokyo', '东京'],
    东京: ['jp-kanto-tokyo'],
    kyoto: ['jp-kansai-kyoto', '京都'],
    京都: ['jp-kansai-kyoto'],
    paris: ['fr-paris', '巴黎'],
    london: ['uk-london', '伦敦'],
    'new york': ['us-east-nyc', '纽约'],
    nyc: ['us-east-nyc', '纽约'],
    zurich: ['ch-zurich-lucerne', '苏黎世'],
    reykjavik: ['is-reykjavik-golden-circle', '雷克雅未克'],
    kathmandu: ['np-bt-kathmandu-nagarkot', '加德满都']
  };

  function normalizeSearchText(s) {
    return String(s || '')
      .toLowerCase()
      .replace(/[·•・,，.。()（）/\-_\s]+/g, ' ')
      .trim();
  }

  function resolveDestinationMatches(query, allDest) {
    const raw = String(query || '').trim();
    const list = Array.isArray(allDest) ? allDest : [];
    if (!raw || !list.length) return [];
    const qNorm = normalizeSearchText(raw);
    const qCompact = qNorm.replace(/\s+/g, '');

    // Check explicit alias lookup first
    const aliasHits = CITY_ALIASES[qNorm] || CITY_ALIASES[qCompact] || [];

    const scored = [];
    for (let i = 0; i < list.length; i++) {
      const d = list[i];
      if (!d) continue;
      const zhName = String(d.name || '');
      const zhShort = String(d.shortName || '');
      const enName = tx(zhName);
      const enShort = tx(zhShort);
      const tradName = global.AppI18n && typeof global.AppI18n.toTraditional === 'function'
        ? global.AppI18n.toTraditional(zhName)
        : zhName;
      const tradShort = global.AppI18n && typeof global.AppI18n.toTraditional === 'function'
        ? global.AppI18n.toTraditional(zhShort)
        : zhShort;

      const fields = [d.id, zhShort, zhName, enShort, enName, tradShort, tradName, d.country, tx(d.country), d.province, tx(d.province)]
        .filter(Boolean)
        .map(normalizeSearchText);

      let score = 0;
      if (d.id.toLowerCase() === qNorm || aliasHits.includes(d.id)) {
        score = 1000;
      } else if (fields.slice(1, 7).some((f) => f === qNorm || f.replace(/\s+/g, '') === qCompact)) {
        score = 900;
      } else if (fields.slice(1, 7).some((f) => f.startsWith(qNorm) || f.split(' ').includes(qNorm))) {
        score = 700;
      } else if (fields.some((f) => f.includes(qNorm) || (qCompact.length >= 2 && f.replace(/\s+/g, '').includes(qCompact)))) {
        score = 400;
      }
      if (score > 0) {
        scored.push({ dest: d, score });
      }
    }
    scored.sort((a, b) => b.score - a.score || (b.dest.priority || 0) - (a.dest.priority || 0));
    return scored.map((s) => s.dest);
  }

  function resetDraftForNewTrip(defaults) {
    plannerDraft = {
      mode: 'new',
      selectedDestId: (defaults && defaults.destId) || '',
      destQuery: (defaults && defaults.destQuery) || '',
      origin: (defaults && defaults.origin) || '',
      days: Number(defaults && defaults.days) || 4,
      budgetRmb: Number(defaults && defaults.budgetRmb) || 12000,
      month: Number(defaults && defaults.month) || (new Date().getMonth() + 1),
      transportMode: (defaults && defaults.transportMode) || 'driving',
      interest: (defaults && defaults.interest) || 'all',
      confirmPending: false
    };
    return plannerDraft;
  }

  function esc(str) {
    return String(str || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  function icon(name, size) {
    return global.AppIcons ? global.AppIcons.svg(name, size || 14) : '';
  }

  function t(key, vars) {
    return global.AppI18n ? global.AppI18n.t(key, vars) : key;
  }

  function tx(str) {
    return global.AppI18n ? global.AppI18n.tx(str) : (str || '');
  }

  function getLang() {
    return global.AppI18n && typeof global.AppI18n.getLang === 'function' ? global.AppI18n.getLang() : 'zh-CN';
  }

  function L(zh, en) {
    const lang = getLang();
    if (lang === 'en') return en;
    if (lang === 'zh-TW' && global.AppI18n && typeof global.AppI18n.toTraditional === 'function') {
      return global.AppI18n.toTraditional(zh);
    }
    return zh;
  }

  const CAT_EN_MAP = {
    交通与接驳: 'Transport & Transfers',
    住宿体验: 'Lodging & Stays',
    餐饮美食: 'Dining & Cuisine',
    门票向导: 'Tickets & Guides',
    其他支出: 'Other Expenses',
    消费: 'Expense',
    新增项目: 'New Item',
    '城际/当地交通估算': 'Intercity & local transport (est.)',
    '当地特色风味估算': 'Local dining & coffee (est.)',
    '景点预约与活动估算': 'Tickets & activities (est.)',
    '探索路线': 'Explore Route',
    '出发地（本地/机场）': 'Origin (Home / Airport)',
    '自由组合': 'Custom Stops',
    '分享行程': 'Shared Trip'
  };

  function translatePlannerText(str) {
    if (!str) return '';
    if (getLang() === 'en') {
      if (CAT_EN_MAP[str]) return CAT_EN_MAP[str];
      const mDay = String(str).match(/^Day\s+(\d+)\s*·\s*(.+)$/);
      if (mDay && CAT_EN_MAP[mDay[2]]) return `Day ${mDay[1]} · ${CAT_EN_MAP[mDay[2]]}`;
      const mStay = String(str).match(/^(\d+)\s*晚精选住宿估算$/);
      if (mStay) return `${mStay[1]}-night stay (est.)`;
      return tx(str);
    }
    return L(tx(str), str);
  }

  function haversineKm(a, b) {
    const r = Math.PI / 180;
    const dLat = (b[1] - a[1]) * r;
    const dLng = (b[0] - a[0]) * r;
    const s = Math.sin(dLat / 2) ** 2 + Math.cos(a[1] * r) * Math.cos(b[1] * r) * Math.sin(dLng / 2) ** 2;
    return 6371 * 2 * Math.asin(Math.min(1, Math.sqrt(s)));
  }

  function nearestNeighborSort(spots) {
    if (!spots.length) return [];
    const remaining = spots.slice();
    const ordered = [remaining.shift()];
    while (remaining.length) {
      const last = ordered[ordered.length - 1];
      let bestIdx = 0;
      let bestDist = Infinity;
      for (let i = 0; i < remaining.length; i++) {
        const d = haversineKm(last.coords, remaining[i].coords);
        if (d < bestDist) {
          bestDist = d;
          bestIdx = i;
        }
      }
      ordered.push(remaining.splice(bestIdx, 1)[0]);
    }
    return ordered;
  }

  function twoOptOptimize(spots) {
    if (!Array.isArray(spots) || spots.length < 4) return Array.isArray(spots) ? spots.slice() : [];
    const route = spots.slice();
    const dist = (a, b) => (a && a.coords && b && b.coords ? haversineKm(a.coords, b.coords) : 0);
    let improved = true;
    let guard = 0;
    while (improved && guard < 120) {
      improved = false;
      guard++;
      for (let i = 0; i < route.length - 2; i++) {
        for (let k = i + 2; k < route.length; k++) {
          const cur = dist(route[i], route[i + 1]) + (k + 1 < route.length ? dist(route[k], route[k + 1]) : 0);
          const next = dist(route[i], route[k]) + (k + 1 < route.length ? dist(route[i + 1], route[k + 1]) : 0);
          if (next + 1e-6 < cur) {
            const seg = route.slice(i + 1, k + 1).reverse();
            route.splice(i + 1, seg.length, ...seg);
            improved = true;
          }
        }
      }
    }
    return route;
  }

  function lightSlotScore(stop) {
    const txt = `${(stop && stop.bestTime) || ''} ${(stop && stop.name) || ''}`;
    if (/日出|清晨|黎明|晨雾|蓝调晨|上午|sunrise|dawn|morning/i.test(txt)) return 1;
    if (/正午|午后|下午|midday|afternoon/i.test(txt)) return 2;
    if (/日落|夕阳|黄昏|傍晚|蓝调昏|夜景|星空|银河|极光|sunset|dusk|night|milky/i.test(txt)) return 3;
    return 2;
  }

  function orderDayStopsByLight(stops) {
    if (!Array.isArray(stops) || stops.length <= 1) return Array.isArray(stops) ? stops.slice() : [];
    return stops
      .map((s, idx) => ({ s, idx, slot: lightSlotScore(s) }))
      .sort((a, b) => (a.slot - b.slot) || (a.idx - b.idx))
      .map((x) => x.s);
  }

  function generateTripPlan(opts) {
    const dest = opts.dest;
    const days = Math.max(1, Math.min(14, Number(opts.days) || 4));
    const budgetRmb = Math.max(500, Number(opts.budgetRmb) || 12000);
    const interest = opts.interest || 'all';
    const mode = opts.mode || 'driving';
    const month = Number(opts.month) || (new Date().getMonth() + 1);

    const rawSpots = Array.isArray(dest && dest.spots) ? dest.spots : [];
    const filtered = rawSpots.filter((sp) => {
      if (interest === 'nature') return /自然|山|海|湖|雪|峡|林|公园|海岸/.test(`${sp.category} ${sp.name} ${sp.scene}`);
      if (interest === 'architecture') return /建筑|馆|塔|桥|寺|城|街|宫|教堂/.test(`${sp.category} ${sp.name} ${sp.scene}`);
      return true;
    });
    const pool = twoOptOptimize(nearestNeighborSort(filtered.length >= 2 ? filtered : rawSpots));

    const dayBuckets = Array.from({ length: days }, (_, idx) => ({
      day: idx + 1,
      title: (dest && Array.isArray(dest.itinerary) && dest.itinerary[idx] && dest.itinerary[idx].title) || `Day ${idx + 1} · ${L('探索路线', 'Explore Route')}`,
      stops: [],
      routeSummary: null
    }));

    pool.forEach((sp, i) => {
      const targetDay = Math.min(days - 1, Math.floor((i * days) / Math.max(1, pool.length)));
      dayBuckets[targetDay].stops.push({
        id: `st_${Date.now().toString(36)}_${i}`,
        destId: dest.id,
        name: sp.name,
        category: sp.category || '',
        coords: sp.coords,
        bestTime: sp.bestTime || ''
      });
    });

    dayBuckets.forEach((dy) => {
      dy.stops = orderDayStopsByLight(dy.stops);
    });

    // Seed budget from destination comfort tier scaled to user budget (explicitly marked estimated)
    let budgetItems = [];
    const comfortItems = dest && dest.budget && dest.budget.comfort && Array.isArray(dest.budget.comfort.items)
      ? dest.budget.comfort.items
      : null;
    if (comfortItems && comfortItems.length) {
      const baseSum = comfortItems.reduce((s, it) => s + (Number(it.cost) || 0), 0) || budgetRmb;
      const ratio = budgetRmb / baseSum;
      budgetItems = comfortItems.map((it, idx) => ({
        id: `bi_${idx}`,
        category: it.category || L('消费', 'Expense'),
        detail: it.detail || '',
        cost: Math.round((Number(it.cost) || 0) * ratio),
        priceType: 'estimated'
      }));
    } else {
      budgetItems = [
        { id: 'bi_1', category: L('交通与接驳', 'Transport & Transfers'), detail: L('城际/当地交通估算', 'Intercity & local transport (est.)'), cost: Math.round(budgetRmb * 0.35), priceType: 'estimated' },
        { id: 'bi_2', category: L('住宿体验', 'Lodging & Stays'), detail: L(`${days} 晚精选住宿估算`, `${days}-night stay (est.)`), cost: Math.round(budgetRmb * 0.35), priceType: 'estimated' },
        { id: 'bi_3', category: L('餐饮美食', 'Dining & Cuisine'), detail: L('当地特色风味估算', 'Local dining & coffee (est.)'), cost: Math.round(budgetRmb * 0.18), priceType: 'estimated' },
        { id: 'bi_4', category: L('门票向导', 'Tickets & Guides'), detail: L('景点预约与活动估算', 'Tickets & activities (est.)'), cost: Math.round(budgetRmb * 0.12), priceType: 'estimated' }
      ];
    }

    const dName = dest ? (dest.shortName || dest.name) : L('全球', 'Global');
    return {
      id: `trip_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`,
      name: opts.name || L(`${dName} ${days}日深度行程`, `${tx(dName)} ${days}-Day Itinerary`),
      origin: opts.origin || L('出发地（本地/机场）', 'Origin (Home / Airport)'),
      destId: dest ? dest.id : '',
      destName: dest ? (dest.shortName || dest.name) : '',
      daysCount: days,
      budgetRmb,
      month,
      interest,
      mode,
      days: dayBuckets,
      budgetItems,
      updatedAt: Date.now()
    };
  }

  function serializeTripToUrl(trip) {
    const compact = {
      n: trip.name,
      o: trip.origin,
      d: trip.destId,
      dn: trip.destName,
      m: trip.month,
      md: trip.mode,
      b: trip.budgetRmb,
      days: (trip.days || []).map((dy) => ({
        t: dy.title,
        s: (dy.stops || []).map((st) => ({ n: st.name, c: st.coords, d: st.destId }))
      })),
      bi: (trip.budgetItems || []).map((x) => [x.category, x.detail, x.cost])
    };
    const json = JSON.stringify(compact);
    const bytes = new TextEncoder().encode(json);
    let bin = '';
    for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
    const b64 = btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
    const base = global.location ? `${global.location.origin}${global.location.pathname}` : '';
    return `${base}?trip=${b64}`;
  }

  function deserializeTripFromParam(param) {
    if (!param) return null;
    const b64 = param.replace(/-/g, '+').replace(/_/g, '/');
    const bin = atob(b64);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    const json = new TextDecoder().decode(bytes);
    const c = JSON.parse(json);
    return {
      id: `trip_shared_${Date.now().toString(36)}`,
      name: c.n || '分享行程',
      origin: c.o || '',
      destId: c.d || '',
      destName: c.dn || '',
      month: c.m || 5,
      mode: c.md || 'driving',
      budgetRmb: c.b || 10000,
      daysCount: (c.days || []).length || 1,
      days: (c.days || []).map((dy, idx) => ({
        day: idx + 1,
        title: dy.t || `Day ${idx + 1}`,
        stops: (dy.s || []).map((st, j) => ({
          id: `st_sh_${idx}_${j}`,
          name: st.n,
          coords: st.c,
          destId: st.d || c.d
        })),
        routeSummary: null
      })),
      budgetItems: (c.bi || []).map((x, idx) => ({ id: `bi_sh_${idx}`, category: x[0], detail: x[1], cost: Number(x[2]) || 0 })),
      updatedAt: Date.now()
    };
  }

  function tripToCsv(trip) {
    const rows = [['Day', 'DayTitle', 'StopOrder', 'StopName', 'Longitude', 'Latitude', 'TransportMode']];
    (trip.days || []).forEach((dy) => {
      (dy.stops || []).forEach((st, idx) => {
        const lng = st.coords ? st.coords[0] : '';
        const lat = st.coords ? st.coords[1] : '';
        rows.push([dy.day, dy.title, idx + 1, st.name, lng, lat, trip.mode]);
      });
    });
    rows.push([]);
    rows.push(['BudgetCategory', 'Detail', 'CostRMB']);
    (trip.budgetItems || []).forEach((b) => rows.push([b.category, b.detail, b.cost]));
    return '\uFEFF' + rows.map((r) => r.map((v) => `"${String(v ?? '').replace(/"/g, '""')}"`).join(',')).join('\r\n');
  }

  function drawTripOnGlobe(trip) {
    const map = typeof global.getGlobeMap === 'function' ? global.getGlobeMap() : null;
    if (!map || !map.isStyleLoaded() || !trip) return;

    const lineFeatures = [];
    const stopFeatures = [];
    const bounds = global.maplibregl ? new global.maplibregl.LngLatBounds() : null;

    (trip.days || []).forEach((dy, dIdx) => {
      const color = DAY_COLORS[dIdx % DAY_COLORS.length];
      const legs = dy.routeSummary && Array.isArray(dy.routeSummary.legs) ? dy.routeSummary.legs : [];
      if (legs.length) {
        legs.forEach((leg) => {
          if (leg.geometry && Array.isArray(leg.geometry.coordinates)) {
            lineFeatures.push({
              type: 'Feature',
              properties: { color, routed: leg.routed ? 1 : 0 },
              geometry: leg.geometry
            });
          }
        });
      } else if (dy.stops.length >= 2) {
        lineFeatures.push({
          type: 'Feature',
          properties: { color, routed: 0 },
          geometry: { type: 'LineString', coordinates: dy.stops.map((s) => s.coords) }
        });
      }

      dy.stops.forEach((st, sIdx) => {
        if (!Array.isArray(st.coords)) return;
        if (bounds) bounds.extend(st.coords);
        stopFeatures.push({
          type: 'Feature',
          properties: { color, label: `D${dy.day}.${sIdx + 1}` },
          geometry: { type: 'Point', coordinates: st.coords }
        });
      });
    });

    lastRouteGeoJson = {
      lines: { type: 'FeatureCollection', features: lineFeatures },
      stops: { type: 'FeatureCollection', features: stopFeatures }
    };

    if (!map.getSource('trip-route-src')) {
      map.addSource('trip-route-src', { type: 'geojson', data: lastRouteGeoJson.lines });
      map.addSource('trip-stops-src', { type: 'geojson', data: lastRouteGeoJson.stops });
      map.addLayer({
        id: 'trip-route-layer',
        type: 'line',
        source: 'trip-route-src',
        paint: {
          'line-color': ['get', 'color'],
          'line-width': ['case', ['==', ['get', 'routed'], 1], 3.2, 1.8],
          'line-opacity': 0.92
        }
      });
      map.addLayer({
        id: 'trip-stops-layer',
        type: 'circle',
        source: 'trip-stops-src',
        paint: {
          'circle-radius': 6,
          'circle-color': ['get', 'color'],
          'circle-stroke-width': 2,
          'circle-stroke-color': '#09090B'
        }
      });
    } else {
      map.getSource('trip-route-src').setData(lastRouteGeoJson.lines);
      map.getSource('trip-stops-src').setData(lastRouteGeoJson.stops);
    }
    return bounds;
  }

  async function computeAllDayRoutes(trip) {
    if (!trip || !global.RoutingService) return;
    for (const dy of trip.days || []) {
      if (dy.stops.length >= 2) {
        dy.routeSummary = await global.RoutingService.computeStopsRoute(dy.stops, trip.mode || 'driving');
      } else {
        dy.routeSummary = null;
      }
    }
    if (global.StorageDB) await global.StorageDB.saveTrip(trip);
    drawTripOnGlobe(trip);
  }

  async function ensureActiveTrip() {
    if (activeTrip) return activeTrip;
    if (global.StorageDB) {
      const list = await global.StorageDB.getTrips();
      if (list && list.length) {
        activeTrip = list[0];
        return activeTrip;
      }
    }
    const all = global.TRAVEL_ATLAS ? global.TRAVEL_ATLAS.getAll() : [];
    const baseFallback = (global.TRAVEL_ATLAS && global.TRAVEL_ATLAS.getById('jp-kanto-tokyo')) || all[0];
    const fallbackDest = (baseFallback && global.TRAVEL_ATLAS && await global.TRAVEL_ATLAS.ensureDetail(baseFallback.id)) || baseFallback;
    activeTrip = generateTripPlan({ dest: fallbackDest, days: 3, budgetRmb: 15000, mode: 'driving' });
    if (global.StorageDB) await global.StorageDB.saveTrip(activeTrip);
    return activeTrip;
  }

  async function addSpotToActiveTrip(dest, spot) {
    await ensureActiveTrip();
    if (!activeTrip.days || !activeTrip.days.length) {
      activeTrip.days = [{ day: 1, title: `Day 1 · ${L('自由组合', 'Custom Stops')}`, stops: [], routeSummary: null }];
    }
    activeTrip.days[0].stops.push({
      id: `st_${Date.now().toString(36)}`,
      destId: dest.id,
      name: spot.name,
      category: spot.category || '',
      coords: spot.coords,
      bestTime: spot.bestTime || ''
    });
    if (global.StorageDB) await global.StorageDB.saveTrip(activeTrip);
    if (typeof global.setAppViewMode === 'function') global.setAppViewMode('planner');
    renderWorkspace();
  }

  async function renderBudgetChart(el, trip) {
    if (!el || !trip || !global.LazyLoader) return;
    try {
      const echarts = await global.LazyLoader.ensureECharts();
      if (!document.body.contains(el)) return;
      if (routeChart && routeChart.getDom && routeChart.getDom() !== el) {
        routeChart.dispose();
        routeChart = null;
      }
      if (!routeChart) routeChart = echarts.init(el);
      const data = (trip.budgetItems || []).map((b) => ({ name: translatePlannerText(b.category), value: Number(b.cost) || 0 }));
      routeChart.setOption({
        backgroundColor: 'transparent',
        tooltip: { trigger: 'item', formatter: '{b}: ¥{c} ({d}%)' },
        series: [
          {
            type: 'pie',
            radius: ['42%', '72%'],
            data,
            label: { color: '#A1A1AA', fontSize: 11 }
          }
        ]
      });
    } catch (e) {
      // ignore if offline
    }
  }

  function downloadText(filename, text, mime) {
    const blob = new Blob([text], { type: mime || 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  async function renderWorkspace() {
    const view = document.getElementById('planner-view');
    if (!view) return;
    await ensureActiveTrip();

    const allTrips = global.StorageDB ? await global.StorageDB.getTrips() : [activeTrip];
    const allDest = global.TRAVEL_ATLAS ? global.TRAVEL_ATLAS.getAll() : [];
    const totalBudget = (activeTrip.budgetItems || []).reduce((s, x) => s + (Number(x.cost) || 0), 0);
    const perDayBudget = Math.round(totalBudget / Math.max(1, (activeTrip.days || []).length));

    let totalRoutedKm = 0;
    let totalMin = 0;
    let totalAirKm = 0;
    (activeTrip.days || []).forEach((d) => {
      if (d.routeSummary) {
        totalRoutedKm += d.routeSummary.totalRoutedKm || 0;
        totalMin += d.routeSummary.totalMinutes || 0;
        totalAirKm += d.routeSummary.totalAirRefKm || 0;
      }
    });

    const draftDestVal = plannerDraft.mode === 'new'
      ? plannerDraft.destQuery
      : tx(activeTrip.destName);
    const draftOriginVal = plannerDraft.mode === 'new'
      ? (plannerDraft.origin || translatePlannerText(activeTrip.origin))
      : translatePlannerText(activeTrip.origin);
    const draftDaysVal = plannerDraft.mode === 'new'
      ? plannerDraft.days
      : (activeTrip.daysCount || (activeTrip.days || []).length);
    const draftBudgetVal = plannerDraft.mode === 'new'
      ? plannerDraft.budgetRmb
      : (activeTrip.budgetRmb || 12000);
    const draftMonthVal = plannerDraft.mode === 'new'
      ? plannerDraft.month
      : Number(activeTrip.month);
    const draftModeVal = plannerDraft.mode === 'new'
      ? plannerDraft.transportMode
      : activeTrip.mode;
    const draftInterestVal = plannerDraft.mode === 'new'
      ? plannerDraft.interest
      : activeTrip.interest;

    view.innerHTML = `
      <div class="workspace-sticky-nav">
        <button class="gallery-back-btn" id="tp-sticky-back-btn" type="button">${icon('chevronLeft', 14)} ${esc(t('plannerBack'))}</button>
        <div class="workspace-sticky-title">KAIROS · ${esc(t('plannerTitle'))}</div>
        <button class="secondary-btn" id="tp-help-btn" type="button" style="height:30px;padding:0 10px;">?</button>
      </div>
      <div class="workspace-container">
        <div class="gallery-head">
          <div>
            <span class="gallery-kicker">KAIROS · SMART TRIP PLANNER · REAL ROUTING &amp; BUDGET</span>
            <h2>${esc(t('plannerTitle'))}</h2>
            <p class="gallery-lead">${esc(t('plannerLead'))}</p>
          </div>
          <div style="display:flex;gap:8px;flex-wrap:wrap;">
            <button class="secondary-btn" id="tp-new-trip-btn" type="button">+ ${esc(L('新建行程', 'New Trip'))}</button>
            <button class="secondary-btn" id="tp-poster-btn" type="button">${icon('image', 14)} ${esc(t('posterBtn'))}</button>
            <button class="primary-btn" id="tp-preview-globe-btn" type="button">${icon('globe', 14)} ${esc(t('plannerPreviewGlobe'))}</button>
            <button class="gallery-back-btn" id="tp-back-btn" type="button">${icon('arrowUpRight', 14)} ${esc(t('plannerBack'))}</button>
          </div>
        </div>

        <div class="workspace-split">
          <div>
            <div class="panel-box">
              <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;">
                <h3 style="margin:0;">${esc(t('plannerNewTitle'))}</h3>
                <span class="source-tag ${plannerDraft.mode === 'new' ? 'live' : 'empirical'}" id="tp-draft-badge">
                  ${esc(plannerDraft.mode === 'new' ? L('新建草稿', 'New Draft') : L('编辑已存行程', 'Editing Saved'))}
                </span>
              </div>
              <div style="display:flex;flex-direction:column;gap:8px;">
                <label class="form-field"><span>${esc(t('plannerSavedTrips'))}</span>
                  <select id="tp-trip-select" class="sim-input">
                    ${allTrips.map((tr) => `<option value="${esc(tr.id)}" ${tr.id === activeTrip.id ? 'selected' : ''}>${esc(tr.name)}</option>`).join('')}
                  </select>
                </label>
                <label class="form-field"><span>${esc(t('plannerOrigin'))}</span>
                  <input id="tp-origin" class="sim-input" type="text" value="${esc(draftOriginVal)}" />
                </label>
                <div class="form-field" style="position:relative;">
                  <span>${esc(t('plannerDest'))}</span>
                  <input id="tp-dest-search" class="sim-input" type="text" autocomplete="off" value="${esc(draftDestVal)}" placeholder="${esc(t('plannerDestPlaceholder'))}" />
                  <input id="tp-dest-id" type="hidden" value="${esc(plannerDraft.mode === 'new' ? plannerDraft.selectedDestId : (activeTrip.destId || ''))}" />
                  <div id="tp-dest-suggestions" class="tp-suggestions is-hidden" role="listbox"></div>
                </div>
                <div class="form-grid-2">
                  <label class="form-field"><span>${esc(t('plannerDays'))}</span><input id="tp-days" class="sim-input mono-num" type="number" min="1" max="14" value="${draftDaysVal}" /></label>
                  <label class="form-field"><span>${esc(t('plannerTotalBudget'))}</span><input id="tp-budget" class="sim-input mono-num" type="number" min="500" step="500" value="${draftBudgetVal}" /></label>
                </div>
                <div class="form-grid-2">
                  <label class="form-field"><span>${esc(t('plannerMonth'))}</span>
                    <select id="tp-month" class="sim-input">
                      ${Array.from({ length: 12 }, (_, m) => `<option value="${m + 1}" ${draftMonthVal === m + 1 ? 'selected' : ''}>${esc(t('monthFmt', { m: m + 1 }))}</option>`).join('')}
                    </select>
                  </label>
                  <label class="form-field"><span>${esc(t('plannerTransport'))}</span>
                    <select id="tp-mode" class="sim-input">
                      <option value="driving" ${draftModeVal === 'driving' ? 'selected' : ''}>${esc(t('plannerModeDriving'))}</option>
                      <option value="walking" ${draftModeVal === 'walking' ? 'selected' : ''}>${esc(t('plannerModeWalking'))}</option>
                      <option value="cycling" ${draftModeVal === 'cycling' ? 'selected' : ''}>${esc(t('plannerModeCycling'))}</option>
                    </select>
                  </label>
                </div>
                <label class="form-field"><span>${esc(t('plannerInterest'))}</span>
                  <select id="tp-interest" class="sim-input">
                    <option value="all" ${draftInterestVal === 'all' ? 'selected' : ''}>${esc(t('plannerIntAll'))}</option>
                    <option value="nature" ${draftInterestVal === 'nature' ? 'selected' : ''}>${esc(t('plannerIntNature'))}</option>
                    <option value="architecture" ${draftInterestVal === 'architecture' ? 'selected' : ''}>${esc(t('plannerIntArch'))}</option>
                  </select>
                </label>
                <div id="tp-generate-confirm" class="tp-confirm-box" style="font-size:11.5px;color:var(--text-secondary);padding:7px 9px;border-radius:8px;background:var(--bg-hover);border:1px solid var(--border-hairline);"></div>
                <div id="tp-generate-error" style="font-size:11.5px;color:#FB7185;min-height:14px;"></div>
                <div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:2px;">
                  <button class="primary-btn" id="tp-generate-btn" type="button" style="flex:1;">${esc(t('plannerGenerateBtn'))}</button>
                  <button class="secondary-btn" id="tp-calc-route-btn" type="button">${esc(t('plannerCalcRouteBtn'))}</button>
                </div>
              </div>
            </div>

            <div class="panel-box">
              <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;">
                <h3 style="margin:0;">${esc(t('plannerBudgetTitle', { total: totalBudget.toLocaleString() }))}</h3>
                <span class="mono-num" style="font-size:11.5px;color:var(--text-secondary);">${esc(t('plannerPerDay', { amt: perDayBudget.toLocaleString() }))}</span>
              </div>
              <div id="tp-budget-list">
                ${(activeTrip.budgetItems || [])
                  .map(
                    (b, idx) => `
                  <div style="display:grid;grid-template-columns:92px 1fr 78px 26px;gap:5px;align-items:center;margin-bottom:6px;">
                    <input class="sim-input tp-bi-cat" data-idx="${idx}" value="${esc(translatePlannerText(b.category))}" style="height:28px;font-size:11px;" />
                    <input class="sim-input tp-bi-det" data-idx="${idx}" value="${esc(translatePlannerText(b.detail))}" style="height:28px;font-size:11px;" />
                    <input class="sim-input mono-num tp-bi-cost" data-idx="${idx}" type="number" value="${b.cost}" style="height:28px;font-size:11px;" />
                    <button class="icon-btn tp-bi-del" data-idx="${idx}" type="button">${icon('trash', 12)}</button>
                  </div>
                `
                  )
                  .join('')}
              </div>
              <button class="secondary-btn" id="tp-add-budget-btn" type="button" style="width:100%;margin-top:6px;">${esc(t('plannerAddBudgetBtn'))}</button>
              <div class="echarts-box" id="tp-budget-chart" style="height:180px;"></div>
            </div>
          </div>

          <div>
            <div class="panel-box">
              <div style="display:flex;justify-content:space-between;align-items:center;gap:8px;flex-wrap:wrap;">
                <div>
                  <h3 style="margin:0;">${esc(activeTrip.name)}</h3>
                  <div style="font-size:11.5px;color:var(--text-secondary);margin-top:3px;">
                    <span class="source-tag routing">OSRM: ${totalRoutedKm} km · ${totalMin} min (${esc(activeTrip.mode)})</span>
                    ${totalAirKm > 0 ? `<span class="source-tag empirical">Air ref: ${totalAirKm} km</span>` : ''}
                  </div>
                </div>
                <div style="display:flex;gap:6px;flex-wrap:wrap;">
                  <button class="mini-action-pill" id="tp-exp-json" type="button">${icon('download', 12)} JSON</button>
                  <button class="mini-action-pill" id="tp-exp-csv" type="button">${icon('download', 12)} CSV</button>
                  <button class="mini-action-pill" id="tp-exp-pdf" type="button">${icon('download', 12)} PDF</button>
                  <button class="mini-action-pill" id="tp-share-url" type="button">${icon('share', 12)} ${esc(t('plannerShareLink'))}</button>
                </div>
              </div>
              <div id="tp-share-msg" style="font-size:11px;color:var(--accent-primary);margin-top:6px;"></div>
            </div>

            ${(activeTrip.days || [])
              .map(
                (dy, dIdx) => `
              <div class="day-card" data-day-idx="${dIdx}">
                <div style="display:flex;justify-content:space-between;align-items:center;gap:8px;">
                  <strong>Day ${dy.day} · ${esc(translatePlannerText(dy.title))}</strong>
                  <span class="mono-num" style="font-size:11px;color:var(--text-secondary);">
                    ${dy.routeSummary ? `${dy.routeSummary.totalRoutedKm} km · ${dy.routeSummary.totalMinutes} min` : `${dy.stops.length} stops`}
                  </span>
                </div>
                <div class="day-stops-dropzone" data-day-idx="${dIdx}">
                  ${
                    dy.stops.length
                      ? dy.stops
                          .map(
                            (st, sIdx) => `
                        <div class="stop-drag-item" draggable="true" data-day-idx="${dIdx}" data-stop-idx="${sIdx}">
                          <div style="min-width:0;">
                            <div style="font-size:12.5px;font-weight:500;">${sIdx + 1}. ${esc(tx(st.name))}</div>
                            ${st.bestTime ? `<div style="font-size:11px;color:var(--text-muted);">${esc(tx(st.bestTime))}</div>` : ''}
                          </div>
                          <div style="display:flex;gap:4px;flex-shrink:0;">
                            <button class="icon-btn tp-move-up" data-day="${dIdx}" data-stop="${sIdx}" type="button">↑</button>
                            <button class="icon-btn tp-move-down" data-day="${dIdx}" data-stop="${sIdx}" type="button">↓</button>
                            <button class="icon-btn tp-fly-stop" data-day="${dIdx}" data-stop="${sIdx}" type="button">${icon('target', 12)}</button>
                            <button class="icon-btn tp-del-stop" data-day="${dIdx}" data-stop="${sIdx}" type="button">${icon('x', 12)}</button>
                          </div>
                        </div>
                      `
                          )
                          .join('')
                      : `<div style="padding:12px;text-align:center;color:var(--text-muted);font-size:11.5px;border:1px dashed var(--border-hairline);border-radius:8px;margin-top:6px;">${esc(t('plannerDropHint'))}</div>`
                  }
                </div>
              </div>
            `
              )
              .join('')}
          </div>
        </div>
      </div>
    `;

    renderBudgetChart(view.querySelector('#tp-budget-chart'), activeTrip);

    view.querySelector('#tp-back-btn').addEventListener('click', () => {
      if (typeof global.setAppViewMode === 'function') global.setAppViewMode('map');
    });
    const stickyBack = view.querySelector('#tp-sticky-back-btn');
    if (stickyBack) {
      stickyBack.addEventListener('click', () => {
        if (typeof global.setAppViewMode === 'function') global.setAppViewMode('map');
      });
    }
    const tpHelpBtn = view.querySelector('#tp-help-btn');
    if (tpHelpBtn) {
      tpHelpBtn.addEventListener('click', () => {
        if (global.HelpCenter && typeof global.HelpCenter.openTopic === 'function') {
          global.HelpCenter.openTopic('trip-planner');
        }
      });
    }
    const newTripBtn = view.querySelector('#tp-new-trip-btn');
    if (newTripBtn) {
      newTripBtn.addEventListener('click', () => {
        resetDraftForNewTrip({ origin: view.querySelector('#tp-origin').value.trim() });
        renderWorkspace();
        const inp = view.querySelector('#tp-dest-search');
        if (inp) inp.focus();
      });
    }

    const destInput = view.querySelector('#tp-dest-search');
    const destIdHidden = view.querySelector('#tp-dest-id');
    const sugBox = view.querySelector('#tp-dest-suggestions');
    const confirmBox = view.querySelector('#tp-generate-confirm');
    const errBox = view.querySelector('#tp-generate-error');

    const updateConfirmPreview = () => {
      if (!confirmBox) return;
      const lockedDest = destIdHidden && destIdHidden.value ? allDest.find((d) => d.id === destIdHidden.value) : null;
      const origTxt = (view.querySelector('#tp-origin').value || '').trim() || L('本地出发', 'Origin');
      const dTxt = lockedDest
        ? `${tx(lockedDest.shortName || lockedDest.name)} (${lockedDest.id})`
        : ((destInput && destInput.value.trim()) || L('未选择目的地', 'No destination selected'));
      const dDays = view.querySelector('#tp-days').value || 4;
      const dBud = Number(view.querySelector('#tp-budget').value || 12000).toLocaleString();
      const dMode = view.querySelector('#tp-mode').value;
      confirmBox.textContent = `${origTxt} → ${dTxt} · ${dDays}${L('天', 'd')} · ${dMode} · ¥${dBud}`;
    };
    updateConfirmPreview();

    const renderSuggestions = (matches) => {
      if (!sugBox) return;
      if (!matches.length) {
        sugBox.classList.add('is-hidden');
        sugBox.innerHTML = '';
        return;
      }
      sugBox.classList.remove('is-hidden');
      sugBox.innerHTML = matches
        .slice(0, 8)
        .map(
          (d) => `<button class="tp-suggestion-item" type="button" data-dest-id="${esc(d.id)}" role="option">
            <span><strong>${esc(tx(d.shortName || d.name))}</strong> <small style="opacity:0.7;">${esc(tx(d.country))}</small></span>
            <span class="mono-num" style="font-size:10.5px;opacity:0.75;">${d.spotCount || (d.spots ? d.spots.length : 0)} spots</span>
          </button>`
        )
        .join('');
      sugBox.querySelectorAll('.tp-suggestion-item').forEach((btn) => {
        btn.addEventListener('click', () => {
          const picked = allDest.find((d) => d.id === btn.dataset.destId);
          if (!picked) return;
          destInput.value = tx(picked.shortName || picked.name);
          destIdHidden.value = picked.id;
          plannerDraft.selectedDestId = picked.id;
          plannerDraft.destQuery = destInput.value;
          sugBox.classList.add('is-hidden');
          if (errBox) errBox.textContent = '';
          updateConfirmPreview();
        });
      });
    };

    if (destInput) {
      destInput.addEventListener('input', () => {
        const q = destInput.value.trim();
        plannerDraft.destQuery = q;
        if (destIdHidden) destIdHidden.value = '';
        plannerDraft.selectedDestId = '';
        if (errBox) errBox.textContent = '';
        if (!q) {
          renderSuggestions([]);
        } else {
          renderSuggestions(resolveDestinationMatches(q, allDest));
        }
        updateConfirmPreview();
      });
      destInput.addEventListener('focus', () => {
        const q = destInput.value.trim();
        if (q && !destIdHidden.value) {
          renderSuggestions(resolveDestinationMatches(q, allDest));
        }
      });
    }
    ['#tp-origin', '#tp-days', '#tp-budget', '#tp-mode'].forEach((sel) => {
      const el = view.querySelector(sel);
      if (el) el.addEventListener('change', updateConfirmPreview);
    });

    const tpPosterBtn = view.querySelector('#tp-poster-btn');
    if (tpPosterBtn && global.PosterShare) {
      tpPosterBtn.addEventListener('click', async () => {
        const m = typeof global.getGlobeMap === 'function' ? global.getGlobeMap() : null;
        const poster = await global.PosterShare.generateTripPoster(activeTrip, m);
        if (poster) global.PosterShare.openPosterModal(poster);
      });
    }

    view.querySelector('#tp-preview-globe-btn').addEventListener('click', () => {
      const bounds = drawTripOnGlobe(activeTrip);
      if (typeof global.setAppViewMode === 'function') global.setAppViewMode('map');
      const map = typeof global.getGlobeMap === 'function' ? global.getGlobeMap() : null;
      if (map && bounds && !bounds.isEmpty()) {
        map.fitBounds(bounds, { padding: 80, maxZoom: 12.5, duration: 1100 });
      }
    });

    view.querySelector('#tp-trip-select').addEventListener('change', async (e) => {
      const found = allTrips.find((t) => t.id === e.target.value);
      if (found) {
        activeTrip = found;
        plannerDraft.mode = 'edit';
        plannerDraft.selectedDestId = found.destId || '';
        plannerDraft.destQuery = tx(found.destName || '');
        renderWorkspace();
      }
    });

    view.querySelector('#tp-generate-btn').addEventListener('click', async () => {
      const searchVal = (destInput ? destInput.value : '').trim();
      const lockedId = destIdHidden ? destIdHidden.value.trim() : '';
      let matched = lockedId ? allDest.find((d) => d.id === lockedId) : null;

      if (!matched) {
        const candidates = resolveDestinationMatches(searchVal, allDest);
        if (!candidates.length) {
          if (errBox) {
            errBox.textContent = L(
              `未找到与「${searchVal || '空'}」匹配的目的地，请重新输入并从候选列表中选择（不会回退到旧行程）。`,
              `No destination matched "${searchVal}". Please pick a valid destination from the list.`
            );
          }
          return;
        }
        // Require explicit disambiguation if multiple candidates exist and top candidate is not an exact match
        const qNorm = normalizeSearchText(searchVal);
        const top = candidates[0];
        const topExact =
          top.id.toLowerCase() === qNorm ||
          normalizeSearchText(top.shortName) === qNorm ||
          normalizeSearchText(top.name) === qNorm ||
          normalizeSearchText(tx(top.shortName)) === qNorm ||
          normalizeSearchText(tx(top.name)) === qNorm ||
          (CITY_ALIASES[qNorm] && CITY_ALIASES[qNorm].includes(top.id));

        if (candidates.length > 1 && !topExact) {
          renderSuggestions(candidates);
          if (errBox) {
            errBox.textContent = L(
              `找到 ${candidates.length} 个相近目的地，请在下方候选中点选确认具体城市。`,
              `Found ${candidates.length} similar matches — please select the exact city below.`
            );
          }
          return;
        }
        matched = top;
      }

      if (errBox) errBox.textContent = '';
      const fullDest = (global.TRAVEL_ATLAS ? await global.TRAVEL_ATLAS.ensureDetail(matched.id) : null) || matched;
      const newTrip = generateTripPlan({
        origin: view.querySelector('#tp-origin').value.trim(),
        dest: fullDest,
        days: Number(view.querySelector('#tp-days').value),
        budgetRmb: Number(view.querySelector('#tp-budget').value),
        month: Number(view.querySelector('#tp-month').value),
        mode: view.querySelector('#tp-mode').value,
        interest: view.querySelector('#tp-interest').value
      });
      newTrip.id = `trip_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;
      activeTrip = newTrip;
      plannerDraft.mode = 'edit';
      plannerDraft.selectedDestId = fullDest.id;
      plannerDraft.destQuery = tx(fullDest.shortName || fullDest.name);
      if (global.StorageDB) await global.StorageDB.saveTrip(activeTrip);
      renderWorkspace();
      // Compute road/great-circle routes asynchronously without blocking immediate trip switch
      computeAllDayRoutes(activeTrip).then(() => {
        if (activeTrip && activeTrip.id === newTrip.id) {
          const pv = document.getElementById('planner-view');
          if (pv && !pv.classList.contains('is-hidden')) renderWorkspace();
        }
      }).catch(() => {});
    });

    view.querySelector('#tp-calc-route-btn').addEventListener('click', async (e) => {
      e.target.textContent = L('正在请求真实路网…', 'Computing real road routes…');
      activeTrip.mode = view.querySelector('#tp-mode').value;
      await computeAllDayRoutes(activeTrip);
      renderWorkspace();
    });

    // Budget editing
    const saveBudgetPatch = async () => {
      if (global.StorageDB) await global.StorageDB.saveTrip(activeTrip);
      renderWorkspace();
    };
    view.querySelectorAll('.tp-bi-cat').forEach((inp) => {
      inp.addEventListener('change', (e) => {
        activeTrip.budgetItems[Number(e.target.dataset.idx)].category = e.target.value;
        saveBudgetPatch();
      });
    });
    view.querySelectorAll('.tp-bi-det').forEach((inp) => {
      inp.addEventListener('change', (e) => {
        activeTrip.budgetItems[Number(e.target.dataset.idx)].detail = e.target.value;
        saveBudgetPatch();
      });
    });
    view.querySelectorAll('.tp-bi-cost').forEach((inp) => {
      inp.addEventListener('change', (e) => {
        activeTrip.budgetItems[Number(e.target.dataset.idx)].cost = Number(e.target.value) || 0;
        saveBudgetPatch();
      });
    });
    view.querySelectorAll('.tp-bi-del').forEach((btn) => {
      btn.addEventListener('click', () => {
        activeTrip.budgetItems.splice(Number(btn.dataset.idx), 1);
        saveBudgetPatch();
      });
    });
    view.querySelector('#tp-add-budget-btn').addEventListener('click', () => {
      activeTrip.budgetItems.push({ id: `bi_${Date.now()}`, category: L('其他支出', 'Other Expenses'), detail: L('新增项目', 'New Item'), cost: 500 });
      saveBudgetPatch();
    });

    // Drag & drop + button reorder
    view.querySelectorAll('.stop-drag-item').forEach((el) => {
      el.addEventListener('dragstart', () => {
        dragPayload = { dayIdx: Number(el.dataset.dayIdx), stopIdx: Number(el.dataset.stopIdx) };
        el.classList.add('dragging');
      });
      el.addEventListener('dragend', () => el.classList.remove('dragging'));
    });

    view.querySelectorAll('.day-card').forEach((card) => {
      card.addEventListener('dragover', (e) => e.preventDefault());
      card.addEventListener('drop', async (e) => {
        e.preventDefault();
        if (!dragPayload) return;
        const targetDayIdx = Number(card.dataset.dayIdx);
        const srcArr = activeTrip.days[dragPayload.dayIdx].stops;
        const [moved] = srcArr.splice(dragPayload.stopIdx, 1);
        if (moved) activeTrip.days[targetDayIdx].stops.push(moved);
        dragPayload = null;
        if (global.StorageDB) await global.StorageDB.saveTrip(activeTrip);
        renderWorkspace();
      });
    });

    view.querySelectorAll('.tp-move-up').forEach((b) => {
      b.addEventListener('click', async () => {
        const d = Number(b.dataset.day);
        const s = Number(b.dataset.stop);
        const arr = activeTrip.days[d].stops;
        if (s > 0) {
          [arr[s - 1], arr[s]] = [arr[s], arr[s - 1]];
          if (global.StorageDB) await global.StorageDB.saveTrip(activeTrip);
          renderWorkspace();
        }
      });
    });
    view.querySelectorAll('.tp-move-down').forEach((b) => {
      b.addEventListener('click', async () => {
        const d = Number(b.dataset.day);
        const s = Number(b.dataset.stop);
        const arr = activeTrip.days[d].stops;
        if (s < arr.length - 1) {
          [arr[s + 1], arr[s]] = [arr[s], arr[s + 1]];
          if (global.StorageDB) await global.StorageDB.saveTrip(activeTrip);
          renderWorkspace();
        }
      });
    });
    view.querySelectorAll('.tp-del-stop').forEach((b) => {
      b.addEventListener('click', async () => {
        activeTrip.days[Number(b.dataset.day)].stops.splice(Number(b.dataset.stop), 1);
        if (global.StorageDB) await global.StorageDB.saveTrip(activeTrip);
        renderWorkspace();
      });
    });
    view.querySelectorAll('.tp-fly-stop').forEach((b) => {
      b.addEventListener('click', () => {
        const st = activeTrip.days[Number(b.dataset.day)].stops[Number(b.dataset.stop)];
        if (!st || !st.coords) return;
        drawTripOnGlobe(activeTrip);
        if (typeof global.setAppViewMode === 'function') global.setAppViewMode('map');
        const map = typeof global.getGlobeMap === 'function' ? global.getGlobeMap() : null;
        if (map) map.flyTo({ center: st.coords, zoom: 13, pitch: 48, duration: 1100 });
      });
    });

    // Exports & Share
    view.querySelector('#tp-exp-json').addEventListener('click', () => {
      downloadText(`${activeTrip.name}.json`, JSON.stringify(activeTrip, null, 2), 'application/json');
    });
    view.querySelector('#tp-exp-csv').addEventListener('click', () => {
      downloadText(`${activeTrip.name}.csv`, tripToCsv(activeTrip), 'text/csv;charset=utf-8');
    });
    view.querySelector('#tp-exp-pdf').addEventListener('click', () => {
      const printEl = document.getElementById('trip-print-area');
      if (!printEl) return;
      printEl.classList.remove('is-hidden');
      printEl.innerHTML = `
        <h1>${esc(activeTrip.name)}</h1>
        <p>${esc(L('出发地：', 'Origin: '))}${esc(translatePlannerText(activeTrip.origin))} · ${esc(L('目的地：', 'Dest: '))}${esc(tx(activeTrip.destName))} · ${esc(L('交通：', 'Mode: '))}${esc(activeTrip.mode)} · ${esc(L('预算：', 'Budget: '))}¥${totalBudget.toLocaleString()}</p>
        ${(activeTrip.days || [])
          .map(
            (d) => `<h3>Day ${d.day} · ${esc(translatePlannerText(d.title))}</h3><ol>${d.stops.map((s) => `<li>${esc(tx(s.name))} (${s.coords ? s.coords.join(', ') : ''})</li>`).join('')}</ol>`
          )
          .join('')}
      `;
      global.print();
      setTimeout(() => printEl.classList.add('is-hidden'), 500);
    });
    view.querySelector('#tp-share-url').addEventListener('click', async () => {
      const shareUrl = serializeTripToUrl(activeTrip);
      const msgEl = view.querySelector('#tp-share-msg');
      try {
        if (global.navigator && global.navigator.clipboard) await global.navigator.clipboard.writeText(shareUrl);
        msgEl.textContent = L(
          `已复制分享链接（${shareUrl.length} 字符）：打开链接即可自动恢复完整行程。`,
          `Share link copied (${shareUrl.length} chars) — opening it restores this full itinerary.`
        );
      } catch (e) {
        msgEl.textContent = shareUrl;
      }
    });
  }

  async function restoreFromUrlIfPresent() {
    if (!global.location) return false;
    const params = new URLSearchParams(global.location.search);
    const raw = params.get('trip');
    if (!raw) return false;
    try {
      const restored = deserializeTripFromParam(raw);
      if (restored) {
        activeTrip = restored;
        if (global.StorageDB) await global.StorageDB.saveTrip(restored);
        return true;
      }
    } catch (e) {
      // ignore invalid share token
    }
    return false;
  }

  return {
    generateTripPlan,
    resolveDestinationMatches,
    resetDraftForNewTrip,
    twoOptOptimize,
    orderDayStopsByLight,
    serializeTripToUrl,
    deserializeTripFromParam,
    tripToCsv,
    addSpotToActiveTrip,
    renderWorkspace,
    drawTripOnGlobe,
    restoreFromUrlIfPresent
  };
});
