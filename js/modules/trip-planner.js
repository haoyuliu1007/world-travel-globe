(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory(typeof globalThis !== 'undefined' ? globalThis : root);
  } else {
    root.TripPlanner = factory(root);
  }
})(typeof window !== 'undefined' ? window : globalThis, function (global) {
  'use strict';

  const DAY_COLORS = ['#E8A33D', '#38BDF8', '#34D399', '#F472B6', '#A78BFA', '#FB923C', '#2DD4BF'];

  let activeTrip = null;
  let routeChart = null;
  let dragPayload = null;
  let lastRouteGeoJson = null;
  let activeSubTab = 'itinerary'; // 'itinerary' | 'transport' | 'budget' | 'prep' | 'collab'
  let activeScheduleView = 'timeline'; // 'timeline' | 'calendar'
  let selectedDayFilter = 0; // 0 = all days
  let fxState = { base: 'CNY', rates: { CNY: 1, USD: 0.138, EUR: 0.129, JPY: 21.1 }, date: 'offline-ref', source: 'Reference' };

  let plannerDraft = {
    mode: 'new',
    selectedDestId: '',
    extraDestIds: [],
    destQuery: '',
    origin: '上海',
    originCoords: [121.4737, 31.2304],
    startDate: new Date(Date.now() + 14 * 86400000).toISOString().slice(0, 10),
    days: 4,
    travelers: 2,
    budgetRmb: 12000,
    currency: 'CNY',
    dailyStartTime: '08:30',
    month: new Date().getMonth() + 1,
    intercityMode: 'flight',
    transferMode: 'airport_express',
    transportMode: 'driving',
    pace: 'balanced',
    interest: 'all',
    hotelName: ''
  };

  const ORIGIN_COORDS_MAP = {
    上海: [121.4737, 31.2304], shanghai: [121.4737, 31.2304],
    北京: [116.4074, 39.9042], beijing: [116.4074, 39.9042],
    广州: [113.2644, 23.1291], guangzhou: [113.2644, 23.1291],
    深圳: [114.0579, 22.5431], shenzhen: [114.0579, 22.5431],
    成都: [104.0665, 30.5723], chengdu: [104.0665, 30.5723],
    香港: [114.1694, 22.3193], 'hong kong': [114.1694, 22.3193],
    台北: [121.5654, 25.0330], taipei: [121.5654, 25.0330],
    东京: [139.6917, 35.6895], tokyo: [139.6917, 35.6895],
    伦敦: [-0.1276, 51.5072], london: [-0.1276, 51.5072],
    纽约: [-74.0060, 40.7128], 'new york': [-74.0060, 40.7128],
    新加坡: [103.8198, 1.3521], singapore: [103.8198, 1.3521]
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
    城际交通: 'Intercity Transport',
    当地交通: 'Local Transport',
    住宿体验: 'Lodging & Stays',
    餐饮美食: 'Dining & Cuisine',
    景点门票: 'Tickets & Guides',
    签证保险: 'Visa & Insurance',
    摄影相关: 'Photography Fees',
    购物伴手礼: 'Shopping',
    应急备用金: 'Contingency Fund',
    交通与接驳: 'Transport & Transfers',
    门票向导: 'Tickets & Guides',
    其他支出: 'Other Expenses',
    消费: 'Expense',
    新增项目: 'New Item',
    '探索路线': 'Explore Route',
    '自由组合': 'Custom Stops',
    '分享行程': 'Shared Trip'
  };

  function translatePlannerText(str) {
    if (!str) return '';
    if (getLang() === 'en') {
      if (CAT_EN_MAP[str]) return CAT_EN_MAP[str];
      const mDay = String(str).match(/^Day\s+(\d+)\s*·\s*(.+)$/);
      if (mDay && CAT_EN_MAP[mDay[2]]) return `Day ${mDay[1]} · ${CAT_EN_MAP[mDay[2]]}`;
      return tx(str);
    }
    return L(tx(str), str);
  }

  function normalizeSearchText(s) {
    return String(s || '')
      .toLowerCase()
      .replace(/[·•・,，.。()（）/\-_\s]+/g, ' ')
      .trim();
  }

  function resolveOriginCoords(originLabel) {
    const norm = normalizeSearchText(originLabel);
    if (ORIGIN_COORDS_MAP[norm]) return ORIGIN_COORDS_MAP[norm];
    const all = global.TRAVEL_ATLAS ? global.TRAVEL_ATLAS.getAll() : [];
    const hit = resolveDestinationMatches(originLabel, all)[0];
    if (hit && Array.isArray(hit.coords)) return hit.coords;
    return [121.4737, 31.2304];
  }

  function resolveDestinationMatches(query, allDest) {
    const raw = String(query || '').trim();
    const list = Array.isArray(allDest) ? allDest : [];
    if (!raw || !list.length) return [];
    const qNorm = normalizeSearchText(raw);
    const qCompact = qNorm.replace(/\s+/g, '');
    const aliasHits = CITY_ALIASES[qNorm] || CITY_ALIASES[qCompact] || [];

    const scored = [];
    for (let i = 0; i < list.length; i++) {
      const d = list[i];
      if (!d) continue;
      const zhName = String(d.name || '');
      const zhShort = String(d.shortName || '');
      const enName = tx(zhName);
      const enShort = tx(zhShort);
      const tradName = global.AppI18n && typeof global.AppI18n.toTraditional === 'function' ? global.AppI18n.toTraditional(zhName) : zhName;
      const tradShort = global.AppI18n && typeof global.AppI18n.toTraditional === 'function' ? global.AppI18n.toTraditional(zhShort) : zhShort;
      const fields = [d.id, zhShort, zhName, enShort, enName, tradShort, tradName, d.country, tx(d.country), d.province, tx(d.province)]
        .filter(Boolean)
        .map(normalizeSearchText);

      let score = 0;
      if (d.id.toLowerCase() === qNorm || aliasHits.includes(d.id)) score = 1000;
      else if (fields.slice(1, 7).some((f) => f === qNorm || f.replace(/\s+/g, '') === qCompact)) score = 900;
      else if (fields.slice(1, 7).some((f) => f.startsWith(qNorm) || f.split(' ').includes(qNorm))) score = 700;
      else if (fields.some((f) => f.includes(qNorm) || (qCompact.length >= 2 && f.replace(/\s+/g, '').includes(qCompact)))) score = 400;
      if (score > 0) scored.push({ dest: d, score });
    }
    scored.sort((a, b) => b.score - a.score || (b.dest.priority || 0) - (a.dest.priority || 0));
    return scored.map((s) => s.dest);
  }

  function resetDraftForNewTrip(defaults) {
    plannerDraft = Object.assign({}, plannerDraft, {
      mode: 'new',
      selectedDestId: (defaults && defaults.destId) || '',
      extraDestIds: [],
      destQuery: (defaults && defaults.destQuery) || '',
      origin: (defaults && defaults.origin) || plannerDraft.origin || '上海',
      days: Number(defaults && defaults.days) || 4,
      budgetRmb: Number(defaults && defaults.budgetRmb) || 12000
    });
    return plannerDraft;
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

  /**
   * Re-optimize day stops while strictly preserving user-locked stop indices (`stop.locked === true`).
   */
  function reoptimizeUnlockedDays(trip) {
    if (!trip || !Array.isArray(trip.days)) return trip;
    trip.days.forEach((dy) => {
      const stops = Array.isArray(dy.stops) ? dy.stops : [];
      if (stops.length < 2) return;
      const lockedSlots = [];
      const unlocked = [];
      stops.forEach((st, idx) => {
        if (st && st.locked) lockedSlots.push({ idx, stop: st });
        else unlocked.push(st);
      });
      const opt = orderDayStopsByLight(twoOptOptimize(nearestNeighborSort(unlocked)));
      const rebuilt = new Array(stops.length);
      lockedSlots.forEach((l) => { rebuilt[l.idx] = l.stop; });
      let u = 0;
      for (let i = 0; i < rebuilt.length; i++) {
        if (!rebuilt[i]) rebuilt[i] = opt[u++];
      }
      dy.stops = rebuilt;
    });
    trip.updatedAt = Date.now();
    return trip;
  }

  function detectTripConflicts(trip) {
    const warnings = [];
    if (!trip || !Array.isArray(trip.days)) return warnings;
    trip.days.forEach((dy) => {
      const stops = dy.stops || [];
      let totalDwell = 0;
      let totalKm = 0;
      for (let i = 0; i < stops.length; i++) {
        totalDwell += Number(stops[i].dwellMin || 90);
        if (i > 0 && Array.isArray(stops[i - 1].coords) && Array.isArray(stops[i].coords)) {
          totalKm += haversineKm(stops[i - 1].coords, stops[i].coords);
        }
      }
      if (totalDwell > 660) {
        warnings.push({ day: dy.day, type: 'time_overload', message: L(`Day ${dy.day} 景点停留累计 ${Math.round(totalDwell / 60)} 小时，建议精简或拆天`, `Day ${dy.day} exceeds 11h dwell time`) });
      }
      if (totalKm > 240 && trip.mode !== 'flight') {
        warnings.push({ day: dy.day, type: 'distance_overload', message: L(`Day ${dy.day} 直线跨度 ${Math.round(totalKm)} km，请注意每日车程负载`, `Day ${dy.day} spans ${Math.round(totalKm)} km`) });
      }
    });
    const totalEst = (trip.budgetItems || []).reduce((s, b) => s + (Number(b.cost) || 0), 0);
    if (trip.budgetRmb && totalEst > trip.budgetRmb * 1.05) {
      warnings.push({ day: 0, type: 'budget_over', message: L(`当前明细合计 ¥${totalEst.toLocaleString()} 超出总预算 ¥${trip.budgetRmb.toLocaleString()}`, `Budget items (¥${totalEst}) exceed cap (¥${trip.budgetRmb})`) });
    }
    return warnings;
  }

  function computeAccommodationAdvice(trip) {
    const stops = (trip && trip.days ? trip.days : []).flatMap((d) => d.stops || []).filter((s) => Array.isArray(s.coords));
    if (!stops.length) return null;
    const avgLng = stops.reduce((s, x) => s + x.coords[0], 0) / stops.length;
    const avgLat = stops.reduce((s, x) => s + x.coords[1], 0) / stops.length;
    const centroid = [Number(avgLng.toFixed(4)), Number(avgLat.toFixed(4))];
    const hub = global.TransportService ? global.TransportService.getHubsForDest(trip.destId) : null;
    const hotelCoords = trip.hotelCoords && Array.isArray(trip.hotelCoords) ? trip.hotelCoords : centroid;
    const firstStop = trip.days[0] && trip.days[0].stops[0];
    const distToFirstKm = firstStop && Array.isArray(firstStop.coords) ? Number(haversineKm(hotelCoords, firstStop.coords).toFixed(1)) : 0;
    const links = global.TransportService ? global.TransportService.getBookingLinks(trip.origin, { id: trip.destId, name: trip.destName }) : {};
    return {
      centroid,
      distToFirstKm,
      recommendedZone: L(`${tx(trip.destName)} 核心机位几何中心区（距首站 ${distToFirstKm} km）`, `Central zone of ${tx(trip.destName)} (${distToFirstKm} km to Day 1)`),
      hubHint: hub && hub.nearestAirports && hub.nearestAirports[0] ? `${hub.nearestAirports[0].iata} (${hub.nearestAirports[0].distanceKm} km)` : '',
      bookingUrl: links.hotels || `https://www.booking.com/searchresults.html?ss=${encodeURIComponent(trip.destName || '')}`
    };
  }

  function buildPrepChecklist(destList) {
    const hasSnow = destList.some((d) => (d.weatherTags || []).includes('snow') || /雪|冰|snow|glacier/i.test(`${d.subtitle || ''} ${d.heroSummary || ''}`));
    const hasAurora = destList.some((d) => /极光|aurora|milky|银河|星空/i.test(`${d.subtitle || ''} ${d.heroSummary || ''}`));
    const gear = [
      { id: 'pg_cam', text: L('相机机身 + 备用电池（低温多备 2 块）', 'Camera body + spare batteries'), done: false },
      { id: 'pg_wide', text: L('广角镜头 (14–24mm) 覆盖建筑/星空/风光照', 'Wide lens (14–24mm) for landscapes & sky'), done: false },
      { id: 'pg_tele', text: L('长焦镜头 (70–200mm+) 压缩山峰与日照金山', 'Telephoto (70–200mm+) for compressed peaks'), done: false }
    ];
    if (hasAurora) gear.push({ id: 'pg_tripod', text: L('碳纤维三脚架 + 快门线 / 镜头除雾带', 'Carbon tripod + intervalometer + lens warmer'), done: false });
    if (hasSnow) gear.push({ id: 'pg_snow', text: L('防滑冰爪 + 相机防寒保护套', 'Microspikes + cold-weather camera cover'), done: false });

    const packing = [
      { id: 'pk_doc', text: L('护照 / 身份证件 / 签证确认单（官方核验入境要求）', 'Passport / ID / Visa docs (verify official rules)'), done: false },
      { id: 'pk_ins', text: L('旅行医疗与航延保险电子保单', 'Travel & medical insurance policy'), done: false },
      { id: 'pk_pwr', text: L('全球转换插头 + 高容量充电宝', 'Universal adapter + power bank'), done: false },
      { id: 'pk_off', text: L('在 KAIROS 中保存本行程离线包', 'Save KAIROS Offline Travel Pack before departure'), done: false }
    ];
    return { gear, packing, customTodos: [], visaReminderDate: '' };
  }

  function buildBudgetSeed(dest, days, budgetRmb) {
    const alloc = [
      ['城际交通', '机票 / 高铁 / 跨城接驳估算', 0.28],
      ['当地交通', '机场快线 / 地铁 / 租车估算', 0.09],
      ['住宿体验', `${days} 晚酒店 / 民宿估算`, 0.28],
      ['餐饮美食', '当地餐饮与咖啡估算', 0.14],
      ['景点门票', '预约门票与向导活动估算', 0.08],
      ['签证保险', '签证费与旅行险估算', 0.04],
      ['摄影相关', '器材租赁 / 机位入场费估算', 0.03],
      ['购物伴手礼', '纪念品与日常杂费估算', 0.03],
      ['应急备用金', '机动预留', 0.03]
    ];
    return alloc.map(([cat, det, ratio], idx) => ({
      id: `bi_${idx}`,
      category: L(cat, CAT_EN_MAP[cat] || cat),
      detail: det,
      cost: Math.round(budgetRmb * ratio),
      actualCost: 0,
      priceType: 'estimated'
    }));
  }

  function generateTripPlan(opts) {
    const dests = Array.isArray(opts.dests) && opts.dests.length ? opts.dests : (opts.dest ? [opts.dest] : []);
    const primaryDest = dests[0];
    const days = Math.max(1, Math.min(21, Number(opts.days) || 4));
    const budgetRmb = Math.max(500, Number(opts.budgetRmb) || 12000);
    const interest = opts.interest || 'all';
    const mode = opts.mode || 'driving';
    const intercityMode = opts.intercityMode || 'flight';
    const transferMode = opts.transferMode || 'airport_express';
    const month = Number(opts.month) || (new Date().getMonth() + 1);
    const travelers = Math.max(1, Number(opts.travelers) || 1);
    const origin = opts.origin || L('上海', 'Shanghai');
    const originCoords = opts.originCoords || resolveOriginCoords(origin);

    const pool = [];
    dests.forEach((d) => {
      if (!d) return;
      const rawSpots = Array.isArray(d.spots) ? d.spots : [];
      const filtered = rawSpots.filter((sp) => {
        if (interest === 'nature') return /自然|山|海|湖|雪|峡|林|公园|海岸/.test(`${sp.category} ${sp.name} ${sp.scene}`);
        if (interest === 'architecture') return /建筑|馆|塔|桥|寺|城|街|宫|教堂/.test(`${sp.category} ${sp.name} ${sp.scene}`);
        return true;
      });
      const chosen = twoOptOptimize(nearestNeighborSort(filtered.length >= 2 ? filtered : rawSpots));
      chosen.forEach((sp) => pool.push({ dest: d, sp }));
    });

    const dayBuckets = Array.from({ length: days }, (_, idx) => ({
      day: idx + 1,
      title: (primaryDest && Array.isArray(primaryDest.itinerary) && primaryDest.itinerary[idx] && primaryDest.itinerary[idx].title) || `Day ${idx + 1} · ${L('探索路线', 'Explore Route')}`,
      stops: [],
      routeSummary: null
    }));

    pool.forEach((item, i) => {
      const targetDay = Math.min(days - 1, Math.floor((i * days) / Math.max(1, pool.length)));
      dayBuckets[targetDay].stops.push({
        id: `st_${Date.now().toString(36)}_${i}`,
        destId: item.dest.id,
        name: item.sp.name,
        category: item.sp.category || '',
        coords: item.sp.coords,
        bestTime: item.sp.bestTime || '',
        dwellMin: 90,
        locked: false
      });
    });

    dayBuckets.forEach((dy) => {
      dy.stops = orderDayStopsByLight(dy.stops);
    });

    const dName = dests.map((d) => d.shortName || d.name).join(' · ') || L('全球', 'Global');
    const intercityComparison = global.TransportService && primaryDest
      ? global.TransportService.compareIntercityModes({ originLabel: origin, originCoords, dest: primaryDest })
      : null;

    return {
      id: `trip_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`,
      name: opts.name || L(`${dName} ${days}日深度行程`, `${tx(dName)} ${days}-Day Itinerary`),
      origin,
      originCoords,
      destId: primaryDest ? primaryDest.id : '',
      destName: dName,
      destIds: dests.map((d) => d.id),
      startDate: opts.startDate || plannerDraft.startDate,
      dailyStartTime: opts.dailyStartTime || plannerDraft.dailyStartTime || '08:30',
      travelers,
      daysCount: days,
      budgetRmb,
      currency: opts.currency || 'CNY',
      month,
      interest,
      intercityMode,
      transferMode,
      mode,
      pace: opts.pace || 'balanced',
      hotelName: opts.hotelName || '',
      hotelCoords: null,
      intercityComparison,
      days: dayBuckets,
      budgetItems: buildBudgetSeed(primaryDest, days, budgetRmb),
      prep: buildPrepChecklist(dests),
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
      im: trip.intercityMode,
      b: trip.budgetRmb,
      days: (trip.days || []).map((dy) => ({
        t: dy.title,
        s: (dy.stops || []).map((st) => ({ n: st.name, c: st.coords, d: st.destId, l: st.locked ? 1 : 0 }))
      })),
      bi: (trip.budgetItems || []).map((x) => [x.category, x.detail, x.cost, x.actualCost || 0])
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
      intercityMode: c.im || 'flight',
      budgetRmb: c.b || 10000,
      currency: 'CNY',
      travelers: 1,
      daysCount: (c.days || []).length || 1,
      days: (c.days || []).map((dy, idx) => ({
        day: idx + 1,
        title: dy.t || `Day ${idx + 1}`,
        stops: (dy.s || []).map((st, j) => ({
          id: `st_sh_${idx}_${j}`,
          name: st.n,
          coords: st.c,
          destId: st.d || c.d,
          locked: Boolean(st.l),
          dwellMin: 90
        })),
        routeSummary: null
      })),
      budgetItems: (c.bi || []).map((x, idx) => ({ id: `bi_sh_${idx}`, category: x[0], detail: x[1], cost: Number(x[2]) || 0, actualCost: Number(x[3]) || 0 })),
      updatedAt: Date.now()
    };
  }

  function tripToCsv(trip) {
    const rows = [['Day', 'DayTitle', 'StopOrder', 'StopName', 'Longitude', 'Latitude', 'TransportMode', 'Locked']];
    (trip.days || []).forEach((dy) => {
      (dy.stops || []).forEach((st, idx) => {
        const lng = st.coords ? st.coords[0] : '';
        const lat = st.coords ? st.coords[1] : '';
        rows.push([dy.day, dy.title, idx + 1, st.name, lng, lat, trip.mode, st.locked ? 'YES' : 'NO']);
      });
    });
    rows.push([]);
    rows.push(['BudgetCategory', 'Detail', 'EstimatedRMB', 'ActualRMB']);
    (trip.budgetItems || []).forEach((b) => rows.push([b.category, b.detail, b.cost, b.actualCost || 0]));
    return '\uFEFF' + rows.map((r) => r.map((v) => `"${String(v ?? '').replace(/"/g, '""')}"`).join(',')).join('\r\n');
  }

  function drawTripOnGlobe(trip) {
    const map = typeof global.getGlobeMap === 'function' ? global.getGlobeMap() : null;
    if (!map || !map.isStyleLoaded() || !trip) return;

    const lineFeatures = [];
    const stopFeatures = [];
    const bounds = global.maplibregl ? new global.maplibregl.LngLatBounds() : null;

    // Draw schematic intercity arc if origin & primary destination exist
    const firstStop = trip.days && trip.days[0] && trip.days[0].stops && trip.days[0].stops[0];
    if (trip.originCoords && firstStop && Array.isArray(firstStop.coords) && global.TransportService) {
      const arc = global.TransportService.buildGreatCircleCoordinates(trip.originCoords, firstStop.coords, 28);
      lineFeatures.push({
        type: 'Feature',
        properties: { color: '#E8A33D', routed: 0, intercity: 1 },
        geometry: { type: 'LineString', coordinates: arc }
      });
    }

    (trip.days || []).forEach((dy, dIdx) => {
      const color = DAY_COLORS[dIdx % DAY_COLORS.length];
      const legs = dy.routeSummary && Array.isArray(dy.routeSummary.legs) ? dy.routeSummary.legs : [];
      if (legs.length) {
        legs.forEach((leg) => {
          if (leg.geometry && Array.isArray(leg.geometry.coordinates)) {
            lineFeatures.push({
              type: 'Feature',
              properties: { color, routed: leg.routed ? 1 : 0, intercity: 0 },
              geometry: leg.geometry
            });
          }
        });
      } else if (dy.stops.length >= 2) {
        lineFeatures.push({
          type: 'Feature',
          properties: { color, routed: 0, intercity: 0 },
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
          'line-width': ['case', ['==', ['get', 'routed'], 1], 3.2, 2.0],
          'line-opacity': 0.9
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
    if (!trip || (!global.RoutingService && !global.TransportService)) return;
    for (const dy of trip.days || []) {
      if (dy.stops.length >= 2) {
        if (global.TransportService && (trip.mode === 'transit' || trip.mode === 'mixed')) {
          const legs = [];
          let totalRoutedKm = 0;
          let totalAirRefKm = 0;
          let totalMinutes = 0;
          for (let i = 0; i < dy.stops.length - 1; i++) {
            const leg = await global.TransportService.computeLocalLeg(dy.stops[i].coords, dy.stops[i + 1].coords, trip.mode);
            legs.push(leg);
            if (leg.routed) totalRoutedKm += leg.distanceKm;
            else totalAirRefKm += leg.distanceKm;
            totalMinutes += leg.durationMin || 0;
          }
          dy.routeSummary = { legs, totalRoutedKm: Number(totalRoutedKm.toFixed(1)), totalAirRefKm: Number(totalAirRefKm.toFixed(1)), totalMinutes, hasUnrouted: totalAirRefKm > 0 };
        } else if (global.RoutingService) {
          dy.routeSummary = await global.RoutingService.computeStopsRoute(dy.stops, trip.mode || 'driving');
        }
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

  async function addSpotToActiveTrip(dest, spot, extraMeta) {
    await ensureActiveTrip();
    if (!activeTrip.days || !activeTrip.days.length) {
      activeTrip.days = [{ day: 1, title: `Day 1 · ${L('自由组合', 'Custom Stops')}`, stops: [], routeSummary: null }];
    }
    activeTrip.days[0].stops.push(Object.assign({
      id: `st_${Date.now().toString(36)}`,
      destId: dest.id,
      name: spot.name,
      category: spot.category || '',
      coords: spot.coords,
      bestTime: spot.bestTime || '',
      dwellMin: 90,
      locked: false
    }, extraMeta || {}));
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
        series: [{ type: 'pie', radius: ['42%', '72%'], data, label: { color: '#A1A1AA', fontSize: 11 } }]
      });
    } catch (e) {}
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

  function fmtCurrency(amountRmb, currency) {
    const cur = String(currency || 'CNY').toUpperCase();
    const rate = (fxState.rates && fxState.rates[cur]) || 1;
    const val = Math.round((Number(amountRmb) || 0) * rate);
    return `${cur} ${val.toLocaleString()}`;
  }

  async function renderWorkspace() {
    const view = document.getElementById('planner-view');
    if (!view) return;
    await ensureActiveTrip();
    if (global.TransportService) {
      global.TransportService.loadHubs().catch(() => {});
      global.TransportService.fetchExchangeRates('CNY').then((r) => { if (r) fxState = r; }).catch(() => {});
    }

    const allTrips = global.StorageDB ? await global.StorageDB.getTrips() : [activeTrip];
    const allDest = global.TRAVEL_ATLAS ? global.TRAVEL_ATLAS.getAll() : [];
    const totalBudget = (activeTrip.budgetItems || []).reduce((s, x) => s + (Number(x.cost) || 0), 0);
    const totalActual = (activeTrip.budgetItems || []).reduce((s, x) => s + (Number(x.actualCost) || 0), 0);
    const travelers = Math.max(1, Number(activeTrip.travelers) || 1);
    const perPerson = Math.round(totalBudget / travelers);
    const perDayBudget = Math.round(totalBudget / Math.max(1, (activeTrip.days || []).length));
    const curCode = activeTrip.currency || 'CNY';

    const conflicts = detectTripConflicts(activeTrip);
    const stayAdvice = computeAccommodationAdvice(activeTrip);
    const prep = activeTrip.prep || buildPrepChecklist([]);
    const primaryDestObj = allDest.find((d) => d.id === activeTrip.destId) || null;
    const intercity = global.TransportService && primaryDestObj
      ? global.TransportService.compareIntercityModes({
          originLabel: activeTrip.origin,
          originCoords: activeTrip.originCoords || resolveOriginCoords(activeTrip.origin),
          dest: primaryDestObj
        })
      : activeTrip.intercityComparison;
    const transfers = global.TransportService && primaryDestObj ? global.TransportService.getArrivalTransfers(primaryDestObj) : [];

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

    const draftDestVal = plannerDraft.mode === 'new' ? plannerDraft.destQuery : tx(activeTrip.destName);
    const draftOriginVal = plannerDraft.mode === 'new' ? (plannerDraft.origin || translatePlannerText(activeTrip.origin)) : translatePlannerText(activeTrip.origin);
    const draftDaysVal = plannerDraft.mode === 'new' ? plannerDraft.days : (activeTrip.daysCount || (activeTrip.days || []).length);
    const draftBudgetVal = plannerDraft.mode === 'new' ? plannerDraft.budgetRmb : (activeTrip.budgetRmb || 12000);
    const draftMonthVal = plannerDraft.mode === 'new' ? plannerDraft.month : Number(activeTrip.month);
    const draftModeVal = plannerDraft.mode === 'new' ? plannerDraft.transportMode : activeTrip.mode;
    const draftIntercityVal = plannerDraft.mode === 'new' ? plannerDraft.intercityMode : (activeTrip.intercityMode || 'flight');
    const draftInterestVal = plannerDraft.mode === 'new' ? plannerDraft.interest : activeTrip.interest;
    const visibleDays = selectedDayFilter > 0 ? (activeTrip.days || []).filter((d) => d.day === selectedDayFilter) : (activeTrip.days || []);

    view.innerHTML = `
      <div class="workspace-sticky-nav">
        <button class="gallery-back-btn" id="tp-sticky-back-btn" type="button">${icon('chevronLeft', 14)} ${esc(t('plannerBack'))}</button>
        <div class="workspace-sticky-title">KAIROS · ${esc(t('plannerTitle'))}</div>
        <button class="secondary-btn" id="tp-help-btn" type="button" style="height:30px;padding:0 10px;">?</button>
      </div>
      <div class="workspace-container">
        <div class="gallery-head">
          <div>
            <span class="gallery-kicker">KAIROS · SMART TRIP PLANNER 2.0 · MULTIMODAL &amp; COLLABORATIVE</span>
            <h2>${esc(t('plannerTitle'))}</h2>
            <p class="gallery-lead">${esc(t('plannerLead'))}</p>
          </div>
          <div style="display:flex;gap:8px;flex-wrap:wrap;">
            <button class="secondary-btn" id="tp-new-trip-btn" type="button">+ ${esc(L('新建行程', 'New Trip'))}</button>
            <button class="secondary-btn" id="tp-dup-trip-btn" type="button">${esc(L('复制模板', 'Duplicate'))}</button>
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
                <label class="form-field"><span>${esc(L('串联第二目的地（可选多城连游）', 'Add 2nd City (Optional Multi-City)'))}</span>
                  <input id="tp-dest-extra" class="sim-input" type="text" placeholder="${esc(L('如：京都、大阪、成都…', 'e.g. Kyoto, Osaka…'))}" value="${esc(plannerDraft.extraDestQuery || '')}" />
                </label>
                <div class="form-grid-2">
                  <label class="form-field"><span>${esc(L('出发日期', 'Start Date'))}</span><input id="tp-start-date" class="sim-input mono-num" type="date" value="${esc(activeTrip.startDate || plannerDraft.startDate)}" /></label>
                  <label class="form-field"><span>${esc(L('同行人数', 'Travelers'))}</span><input id="tp-travelers" class="sim-input mono-num" type="number" min="1" max="20" value="${travelers}" /></label>
                </div>
                <div class="form-grid-2">
                  <label class="form-field"><span>${esc(t('plannerDays'))}</span><input id="tp-days" class="sim-input mono-num" type="number" min="1" max="21" value="${draftDaysVal}" /></label>
                  <label class="form-field"><span>${esc(t('plannerTotalBudget'))}</span><input id="tp-budget" class="sim-input mono-num" type="number" min="500" step="500" value="${draftBudgetVal}" /></label>
                </div>
                <div class="form-grid-2">
                  <label class="form-field"><span>${esc(L('城际主交通 (A层)', 'Intercity (Tier A)'))}</span>
                    <select id="tp-intercity-mode" class="sim-input">
                      <option value="flight" ${draftIntercityVal === 'flight' ? 'selected' : ''}>✈ ${esc(L('飞机', 'Flight'))}</option>
                      <option value="hsr" ${draftIntercityVal === 'hsr' ? 'selected' : ''}>🚄 ${esc(L('高铁', 'High-Speed Rail'))}</option>
                      <option value="rail" ${draftIntercityVal === 'rail' ? 'selected' : ''}>🚆 ${esc(L('普通铁路', 'Rail'))}</option>
                      <option value="coach" ${draftIntercityVal === 'coach' ? 'selected' : ''}>🚌 ${esc(L('长途汽车', 'Coach'))}</option>
                      <option value="driving" ${draftIntercityVal === 'driving' ? 'selected' : ''}>🚗 ${esc(L('自驾', 'Self-Drive'))}</option>
                      <option value="ferry" ${draftIntercityVal === 'ferry' ? 'selected' : ''}>⛴ ${esc(L('渡轮', 'Ferry'))}</option>
                    </select>
                  </label>
                  <label class="form-field"><span>${esc(L('当地日常交通 (C层)', 'Local Mode (Tier C)'))}</span>
                    <select id="tp-mode" class="sim-input">
                      <option value="driving" ${draftModeVal === 'driving' ? 'selected' : ''}>${esc(t('plannerModeDriving'))}</option>
                      <option value="walking" ${draftModeVal === 'walking' ? 'selected' : ''}>${esc(t('plannerModeWalking'))}</option>
                      <option value="cycling" ${draftModeVal === 'cycling' ? 'selected' : ''}>${esc(t('plannerModeCycling'))}</option>
                      <option value="transit" ${draftModeVal === 'transit' ? 'selected' : ''}>🚇 ${esc(L('地铁/公交', 'Metro / Bus'))}</option>
                      <option value="mixed" ${draftModeVal === 'mixed' ? 'selected' : ''}>🔀 ${esc(L('混合交通', 'Mixed'))}</option>
                    </select>
                  </label>
                </div>
                <div class="form-grid-2">
                  <label class="form-field"><span>${esc(t('plannerMonth'))}</span>
                    <select id="tp-month" class="sim-input">
                      ${Array.from({ length: 12 }, (_, m) => `<option value="${m + 1}" ${draftMonthVal === m + 1 ? 'selected' : ''}>${esc(t('monthFmt', { m: m + 1 }))}</option>`).join('')}
                    </select>
                  </label>
                  <label class="form-field"><span>${esc(t('plannerInterest'))}</span>
                    <select id="tp-interest" class="sim-input">
                      <option value="all" ${draftInterestVal === 'all' ? 'selected' : ''}>${esc(t('plannerIntAll'))}</option>
                      <option value="nature" ${draftInterestVal === 'nature' ? 'selected' : ''}>${esc(t('plannerIntNature'))}</option>
                      <option value="architecture" ${draftInterestVal === 'architecture' ? 'selected' : ''}>${esc(t('plannerIntArch'))}</option>
                    </select>
                  </label>
                </div>
                <div id="tp-generate-confirm" class="tp-confirm-box" style="font-size:11.5px;color:var(--text-secondary);padding:7px 9px;border-radius:8px;background:var(--bg-hover);border:1px solid var(--border-hairline);"></div>
                <div id="tp-generate-error" style="font-size:11.5px;color:#FB7185;min-height:14px;"></div>
                <div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:2px;">
                  <button class="primary-btn" id="tp-generate-btn" type="button" style="flex:1;">${esc(t('plannerGenerateBtn'))}</button>
                  <button class="secondary-btn" id="tp-calc-route-btn" type="button">${esc(t('plannerCalcRouteBtn'))}</button>
                </div>
              </div>
            </div>

            ${stayAdvice ? `
              <div class="panel-box">
                <h3 style="margin:0 0 6px;">${esc(L('住宿与出发基准', 'Accommodation & Base'))}</h3>
                <div style="font-size:11.5px;color:var(--text-secondary);margin-bottom:6px;">
                  <div>${esc(stayAdvice.recommendedZone)}</div>
                  ${stayAdvice.hubHint ? `<div class="mono-num" style="margin-top:2px;">${esc(L('最近机场枢纽：', 'Nearest Airport: '))}${esc(stayAdvice.hubHint)}</div>` : ''}
                </div>
                <div style="display:flex;gap:6px;">
                  <input id="tp-hotel-input" class="sim-input" type="text" value="${esc(activeTrip.hotelName || '')}" placeholder="${esc(L('输入拟定酒店名称…', 'Enter hotel name…'))}" style="flex:1;" />
                  <a class="secondary-btn" href="${esc(stayAdvice.bookingUrl)}" target="_blank" rel="noopener" style="text-decoration:none;font-size:11px;">${esc(L('查住宿', 'Search'))} ↗</a>
                </div>
              </div>
            ` : ''}
          </div>

          <div>
            <div class="panel-box">
              <div style="display:flex;justify-content:space-between;align-items:center;gap:8px;flex-wrap:wrap;">
                <div>
                  <h3 style="margin:0;">${esc(activeTrip.name)}</h3>
                  <div style="font-size:11.5px;color:var(--text-secondary);margin-top:3px;display:flex;gap:6px;flex-wrap:wrap;">
                    <span class="source-tag routing">${esc(activeTrip.intercityMode || 'flight').toUpperCase()} + ${esc(activeTrip.mode)}</span>
                    <span class="source-tag empirical">OSRM: ${totalRoutedKm} km · ${totalMin} min</span>
                    ${totalAirKm > 0 ? `<span class="source-tag empirical">Air/Ref: ${totalAirKm} km</span>` : ''}
                  </div>
                </div>
                <div style="display:flex;gap:6px;flex-wrap:wrap;">
                  <button class="mini-action-pill" id="tp-reopt-btn" type="button">${esc(L('一键重排(保留锁定)', 'Re-optimize'))}</button>
                  <button class="mini-action-pill" id="tp-exp-json" type="button">${icon('download', 12)} JSON</button>
                  <button class="mini-action-pill" id="tp-exp-csv" type="button">${icon('download', 12)} CSV</button>
                  <button class="mini-action-pill" id="tp-exp-more" type="button">${icon('download', 12)} ICS/GPX/KML/PDF</button>
                  <button class="mini-action-pill" id="tp-share-url" type="button">${icon('share', 12)} ${esc(t('plannerShareLink'))}</button>
                </div>
              </div>

              <div style="display:flex;gap:6px;flex-wrap:wrap;margin-top:10px;border-top:1px solid var(--border-hairline);padding-top:10px;">
                ${[
                  ['itinerary', L('每日行程', 'Itinerary')],
                  ['transport', L('3层交通与枢纽', 'Multimodal Transport')],
                  ['budget', L('智能预算 2.0', 'Budget 2.0')],
                  ['prep', L('出行准备清单', 'Prep Kit')],
                  ['collab', L('多人协作/AA分账', 'Collab & Split')]
                ].map(([tid, lbl]) => `<button class="mini-action-pill tp-subtab ${activeSubTab === tid ? 'active' : ''}" data-subtab="${tid}" type="button">${esc(lbl)}</button>`).join('')}
              </div>
              <div id="tp-share-msg" style="font-size:11px;color:var(--accent-primary);margin-top:6px;"></div>
            </div>

            ${conflicts.length ? `
              <div class="panel-box" style="border-color:rgba(245,158,11,0.45);background:rgba(245,158,11,0.08);">
                <strong style="font-size:12px;color:#F59E0B;">${esc(L('行程冲突与负载提醒', 'Itinerary Conflict Alerts'))}</strong>
                <ul style="margin:6px 0 0 18px;font-size:11.5px;color:var(--text-secondary);">
                  ${conflicts.map((c) => `<li>${esc(c.message)}</li>`).join('')}
                </ul>
              </div>
            ` : ''}

            ${activeSubTab === 'itinerary' ? `
              <div style="display:flex;justify-content:space-between;align-items:center;gap:8px;flex-wrap:wrap;margin-bottom:10px;">
                <div style="display:flex;gap:4px;flex-wrap:wrap;">
                  <button class="mini-action-pill tp-day-filter ${selectedDayFilter === 0 ? 'active' : ''}" data-day="0" type="button">${esc(L('全部天数', 'All Days'))}</button>
                  ${(activeTrip.days || []).map((dy) => `<button class="mini-action-pill tp-day-filter ${selectedDayFilter === dy.day ? 'active' : ''}" data-day="${dy.day}" type="button">D${dy.day}</button>`).join('')}
                </div>
                <div style="display:flex;gap:4px;">
                  <button class="mini-action-pill tp-sched-view ${activeScheduleView === 'timeline' ? 'active' : ''}" data-sview="timeline" type="button">${esc(L('时间轴', 'Timeline'))}</button>
                  <button class="mini-action-pill tp-sched-view ${activeScheduleView === 'calendar' ? 'active' : ''}" data-sview="calendar" type="button">${esc(L('日历视图', 'Calendar'))}</button>
                  <button class="mini-action-pill" id="tp-add-custom-stop" type="button">+ ${esc(L('自定义景点/接驳', 'Add Stop'))}</button>
                </div>
              </div>

              ${activeScheduleView === 'calendar' ? `
                <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(210px,1fr));gap:10px;margin-bottom:12px;">
                  ${visibleDays.map((dy) => `
                    <div class="panel-box" style="margin:0;">
                      <div style="font-weight:700;font-size:12.5px;color:var(--accent-primary);">Day ${dy.day}</div>
                      <div style="font-size:11px;color:var(--text-muted);margin-bottom:6px;">${esc(translatePlannerText(dy.title))}</div>
                      ${(dy.stops || []).map((s, idx) => `<div style="font-size:11.5px;padding:3px 0;border-bottom:1px solid var(--border-hairline);">${idx + 1}. ${s.locked ? '🔒 ' : ''}${esc(tx(s.name))}</div>`).join('')}
                    </div>
                  `).join('')}
                </div>
              ` : visibleDays.map((dy) => {
                const dIdx = (activeTrip.days || []).indexOf(dy);
                return `
                <div class="day-card" data-day-idx="${dIdx}">
                  <div style="display:flex;justify-content:space-between;align-items:center;gap:8px;flex-wrap:wrap;">
                    <strong>Day ${dy.day} · ${esc(translatePlannerText(dy.title))}</strong>
                    <span class="mono-num" style="font-size:11px;color:var(--text-secondary);">
                      ${esc(activeTrip.dailyStartTime || '08:30')} · ${dy.routeSummary ? `${dy.routeSummary.totalRoutedKm} km · ${dy.routeSummary.totalMinutes} min` : `${dy.stops.length} stops`}
                    </span>
                  </div>
                  <div class="day-stops-dropzone" data-day-idx="${dIdx}">
                    ${dy.stops.length ? dy.stops.map((st, sIdx) => `
                      <div class="stop-drag-item" draggable="true" data-day-idx="${dIdx}" data-stop-idx="${sIdx}">
                        <div style="min-width:0;">
                          <div style="font-size:12.5px;font-weight:500;">${sIdx + 1}. ${st.locked ? '🔒 ' : ''}${esc(tx(st.name))}</div>
                          <div style="font-size:11px;color:var(--text-muted);">${st.bestTime ? `${esc(tx(st.bestTime))} · ` : ''}${Number(st.dwellMin || 90)} min</div>
                        </div>
                        <div style="display:flex;gap:4px;flex-shrink:0;">
                          <button class="icon-btn tp-lock-stop" data-day="${dIdx}" data-stop="${sIdx}" title="${esc(L('锁定/解锁', 'Lock/Unlock'))}" type="button">${st.locked ? '🔒' : '🔓'}</button>
                          <button class="icon-btn tp-dwell-stop" data-day="${dIdx}" data-stop="${sIdx}" title="${esc(L('调节停留时长', 'Adjust dwell'))}" type="button">⏱</button>
                          <button class="icon-btn tp-move-up" data-day="${dIdx}" data-stop="${sIdx}" type="button">↑</button>
                          <button class="icon-btn tp-move-down" data-day="${dIdx}" data-stop="${sIdx}" type="button">↓</button>
                          <button class="icon-btn tp-fly-stop" data-day="${dIdx}" data-stop="${sIdx}" type="button">${icon('target', 12)}</button>
                          <button class="icon-btn tp-del-stop" data-day="${dIdx}" data-stop="${sIdx}" type="button">${icon('x', 12)}</button>
                        </div>
                      </div>
                    `).join('') : `<div style="padding:12px;text-align:center;color:var(--text-muted);font-size:11.5px;border:1px dashed var(--border-hairline);border-radius:8px;margin-top:6px;">${esc(t('plannerDropHint'))}</div>`}
                  </div>
                </div>`;
              }).join('')}
            ` : ''}

            ${activeSubTab === 'transport' ? `
              <div class="panel-box">
                <h3>${esc(L('A 层：城际交通对比（估算参考 + 官方购票入口）', 'Tier A: Intercity Mode Comparison (Est. + Official Links)'))}</h3>
                <p style="font-size:11.5px;color:var(--text-secondary);margin-bottom:8px;">
                  ${esc(L('说明：飞机航线为大圆测地线参考，高铁/铁路耗时为走廊估算，绝不虚构实时车次、航班号或余票价格；点击右侧跳转官方平台查询实时班次。', 'Note: Flight arcs are schematic great-circle references and rail times are corridor estimates. Always check official operators for live schedules and fares.'))}
                </p>
                ${intercity && intercity.hub && intercity.hub.nearestAirports ? `
                  <div style="margin-bottom:10px;font-size:12px;">
                    <strong>${esc(L('目的地最近机场枢纽 (OurAirports 公开数据)：', 'Nearest Gateways (OurAirports): '))}</strong>
                    ${intercity.hub.nearestAirports.map((a) => `<span class="source-tag empirical">${esc(a.iata)} · ${esc(a.name)} (${a.distanceKm} km)</span>`).join(' ')}
                  </div>
                ` : ''}
                <div style="display:grid;gap:8px;">
                  ${(intercity && intercity.modes ? intercity.modes : []).map((m) => `
                    <div style="display:flex;justify-content:space-between;align-items:center;gap:8px;padding:8px 10px;border-radius:10px;border:1px solid var(--border-hairline);background:var(--bg-hover);opacity:${m.feasible ? 1 : 0.5};">
                      <div>
                        <strong style="font-size:12.5px;">${esc(m.id.toUpperCase())}</strong>
                        <div style="font-size:11px;color:var(--text-muted);">${esc(m.providerLabel)}</div>
                      </div>
                      <div class="mono-num" style="font-size:11.5px;text-align:right;">
                        ${m.feasible ? `~${m.distanceKm} km · ~${Math.floor(m.durationMin / 60)}h${m.durationMin % 60}m · ¥${m.estCostRmbRange[0]}–${m.estCostRmbRange[1]}` : esc(L('该距离/跨海不可直达', 'Not feasible'))}
                      </div>
                      <a class="mini-action-pill" href="${esc(m.officialUrl)}" target="_blank" rel="noopener" style="text-decoration:none;">${esc(m.officialLabel)} ↗</a>
                    </div>
                  `).join('')}
                </div>
              </div>
              <div class="panel-box">
                <h3>${esc(L('B 层：抵达后接驳方式估算', 'Tier B: Arrival Transfers'))}</h3>
                <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(200px,1fr));gap:8px;">
                  ${transfers.map((tr) => `
                    <div style="padding:8px 10px;border-radius:8px;border:1px solid var(--border-hairline);background:var(--bg-hover);">
                      <div style="font-weight:600;font-size:12px;">${esc(L(tr.labelZh, tr.labelEn))}</div>
                      <div class="mono-num" style="font-size:11px;color:var(--text-secondary);">~${tr.durationMin} min · ~¥${tr.estCostRmb}</div>
                    </div>
                  `).join('')}
                </div>
              </div>
            ` : ''}

            ${activeSubTab === 'budget' ? `
              <div class="panel-box">
                <div style="display:flex;justify-content:space-between;align-items:center;gap:8px;flex-wrap:wrap;margin-bottom:8px;">
                  <div>
                    <h3 style="margin:0;">${esc(t('plannerBudgetTitle', { total: totalBudget.toLocaleString() }))}</h3>
                    <div class="mono-num" style="font-size:11.5px;color:var(--text-secondary);">
                      ${esc(L(`人均 ${fmtCurrency(perPerson, curCode)} · 日均 ${fmtCurrency(perDayBudget, curCode)} · 实际已支 ¥${totalActual.toLocaleString()}`, `Per person ${fmtCurrency(perPerson, curCode)} · Actual ¥${totalActual.toLocaleString()}`))}
                    </div>
                    <div style="font-size:10.5px;color:var(--text-muted);">${esc(L(`汇率来源：${fxState.source} (${fxState.date})，仅供参考，非实际银行结算汇率`, `FX: ${fxState.source} (${fxState.date}) — reference only`))}</div>
                  </div>
                  <select id="tp-currency-select" class="sim-input" style="width:92px;">
                    ${['CNY', 'USD', 'EUR', 'JPY', 'GBP', 'HKD', 'TWD', 'CHF'].map((c) => `<option value="${c}" ${curCode === c ? 'selected' : ''}>${c}</option>`).join('')}
                  </select>
                </div>
                <div id="tp-budget-list">
                  ${(activeTrip.budgetItems || []).map((b, idx) => `
                    <div style="display:grid;grid-template-columns:100px 1fr 78px 78px 26px;gap:5px;align-items:center;margin-bottom:6px;">
                      <input class="sim-input tp-bi-cat" data-idx="${idx}" value="${esc(translatePlannerText(b.category))}" style="height:28px;font-size:11px;" />
                      <input class="sim-input tp-bi-det" data-idx="${idx}" value="${esc(translatePlannerText(b.detail))}" style="height:28px;font-size:11px;" />
                      <input class="sim-input mono-num tp-bi-cost" data-idx="${idx}" type="number" title="${esc(L('预算(RMB)', 'Est RMB'))}" value="${b.cost}" style="height:28px;font-size:11px;" />
                      <input class="sim-input mono-num tp-bi-actual" data-idx="${idx}" type="number" title="${esc(L('实际(RMB)', 'Actual RMB'))}" value="${b.actualCost || 0}" style="height:28px;font-size:11px;" />
                      <button class="icon-btn tp-bi-del" data-idx="${idx}" type="button">${icon('trash', 12)}</button>
                    </div>
                  `).join('')}
                </div>
                <button class="secondary-btn" id="tp-add-budget-btn" type="button" style="width:100%;margin-top:6px;">${esc(t('plannerAddBudgetBtn'))}</button>
                <div class="echarts-box" id="tp-budget-chart" style="height:200px;"></div>
              </div>
            ` : ''}

            ${activeSubTab === 'prep' ? `
              <div class="panel-box">
                <h3>${esc(L('出行准备与摄影装备清单', 'Pre-Departure & Photo Gear Checklist'))}</h3>
                <p style="font-size:11.5px;color:var(--text-secondary);margin-bottom:8px;">
                  ${esc(L('涉及签证、入境要求、航司托运及安全警示请以目的地使领馆及官方部门最新公告为准。', 'Verify visa, entry, and safety advisories directly with official embassies and carriers.'))}
                </p>
                <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(240px,1fr));gap:12px;">
                  <div>
                    <strong style="font-size:12px;">${esc(L('行李与证件检查', 'Packing & Docs'))}</strong>
                    ${(prep.packing || []).map((it, idx) => `<label style="display:flex;gap:6px;align-items:center;font-size:12px;margin-top:6px;"><input type="checkbox" class="tp-prep-chk" data-grp="packing" data-idx="${idx}" ${it.done ? 'checked' : ''} /><span>${esc(it.text)}</span></label>`).join('')}
                  </div>
                  <div>
                    <strong style="font-size:12px;">${esc(L('摄影装备建议', 'Photo Gear'))}</strong>
                    ${(prep.gear || []).map((it, idx) => `<label style="display:flex;gap:6px;align-items:center;font-size:12px;margin-top:6px;"><input type="checkbox" class="tp-prep-chk" data-grp="gear" data-idx="${idx}" ${it.done ? 'checked' : ''} /><span>${esc(it.text)}</span></label>`).join('')}
                  </div>
                </div>
                <div style="display:flex;gap:8px;margin-top:12px;flex-wrap:wrap;">
                  <a class="secondary-btn" href="https://cs.mfa.gov.cn/" target="_blank" rel="noopener" style="text-decoration:none;font-size:11.5px;">${esc(L('中国领事服务网', 'Consular Advisory'))} ↗</a>
                  <a class="secondary-btn" href="https://www.iatatravelcentre.com/" target="_blank" rel="noopener" style="text-decoration:none;font-size:11.5px;">IATA Travel Centre ↗</a>
                </div>
              </div>
            ` : ''}

            ${activeSubTab === 'collab' ? `<div id="tp-collab-host" class="panel-box"><div style="font-size:12px;color:var(--text-secondary);">${esc(L('正在按需加载多人协同与 AA 分账模块…', 'Loading Collaboration & Expense Split module…'))}</div></div>` : ''}
          </div>
        </div>
      </div>
    `;

    if (activeSubTab === 'budget') {
      renderBudgetChart(view.querySelector('#tp-budget-chart'), activeTrip);
    }
    if (activeSubTab === 'collab' && global.LazyLoader && typeof global.LazyLoader.loadScript === 'function') {
      Promise.all([
        global.LazyLoader.loadScript('js/lazy/expense-splitter.js').catch(() => {}),
        global.LazyLoader.loadScript('js/lazy/collab-space.js').catch(() => {})
      ]).then(() => {
        if (global.CollabSpace && typeof global.CollabSpace.mount === 'function') {
          global.CollabSpace.mount(view.querySelector('#tp-collab-host'), activeTrip, () => renderWorkspace());
        }
      });
    }

    // Bind sticky & header nav
    view.querySelector('#tp-back-btn').addEventListener('click', () => {
      if (typeof global.setAppViewMode === 'function') global.setAppViewMode('map');
    });
    const stickyBack = view.querySelector('#tp-sticky-back-btn');
    if (stickyBack) stickyBack.addEventListener('click', () => { if (typeof global.setAppViewMode === 'function') global.setAppViewMode('map'); });
    const tpHelpBtn = view.querySelector('#tp-help-btn');
    if (tpHelpBtn) tpHelpBtn.addEventListener('click', () => { if (global.HelpCenter) global.HelpCenter.openTopic('trip-planner'); });

    view.querySelectorAll('.tp-subtab').forEach((b) => {
      b.addEventListener('click', () => { activeSubTab = b.dataset.subtab; renderWorkspace(); });
    });
    view.querySelectorAll('.tp-day-filter').forEach((b) => {
      b.addEventListener('click', () => { selectedDayFilter = Number(b.dataset.day) || 0; renderWorkspace(); });
    });
    view.querySelectorAll('.tp-sched-view').forEach((b) => {
      b.addEventListener('click', () => { activeScheduleView = b.dataset.sview; renderWorkspace(); });
    });

    view.querySelector('#tp-new-trip-btn').addEventListener('click', () => {
      resetDraftForNewTrip({ origin: view.querySelector('#tp-origin').value.trim() });
      renderWorkspace();
      const inp = view.querySelector('#tp-dest-search');
      if (inp) inp.focus();
    });
    view.querySelector('#tp-dup-trip-btn').addEventListener('click', async () => {
      const copy = JSON.parse(JSON.stringify(activeTrip));
      copy.id = `trip_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;
      copy.name = `${activeTrip.name} (${L('副本', 'Copy')})`;
      copy.updatedAt = Date.now();
      activeTrip = copy;
      if (global.StorageDB) await global.StorageDB.saveTrip(activeTrip);
      renderWorkspace();
    });

    const destInput = view.querySelector('#tp-dest-search');
    const destIdHidden = view.querySelector('#tp-dest-id');
    const sugBox = view.querySelector('#tp-dest-suggestions');
    const confirmBox = view.querySelector('#tp-generate-confirm');
    const errBox = view.querySelector('#tp-generate-error');

    const updateConfirmPreview = () => {
      if (!confirmBox) return;
      const lockedDest = destIdHidden && destIdHidden.value ? allDest.find((d) => d.id === destIdHidden.value) : null;
      const origTxt = (view.querySelector('#tp-origin').value || '').trim() || L('本地出发', 'Origin');
      const dTxt = lockedDest ? `${tx(lockedDest.shortName || lockedDest.name)} (${lockedDest.id})` : ((destInput && destInput.value.trim()) || L('未选择目的地', 'No destination selected'));
      const dDays = view.querySelector('#tp-days').value || 4;
      const dBud = Number(view.querySelector('#tp-budget').value || 12000).toLocaleString();
      const dIc = view.querySelector('#tp-intercity-mode').value;
      const dMode = view.querySelector('#tp-mode').value;
      confirmBox.textContent = `${origTxt} → ${dTxt} · ${dDays}${L('天', 'd')} · ${dIc}/${dMode} · ¥${dBud}`;
    };
    updateConfirmPreview();

    const renderSuggestions = (matches) => {
      if (!sugBox) return;
      if (!matches.length) { sugBox.classList.add('is-hidden'); sugBox.innerHTML = ''; return; }
      sugBox.classList.remove('is-hidden');
      sugBox.innerHTML = matches.slice(0, 8).map((d) => `<button class="tp-suggestion-item" type="button" data-dest-id="${esc(d.id)}" role="option"><span><strong>${esc(tx(d.shortName || d.name))}</strong> <small style="opacity:0.7;">${esc(tx(d.country))}</small></span><span class="mono-num" style="font-size:10.5px;opacity:0.75;">${d.spotCount || (d.spots ? d.spots.length : 0)} spots</span></button>`).join('');
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
        renderSuggestions(q ? resolveDestinationMatches(q, allDest) : []);
        updateConfirmPreview();
      });
    }
    ['#tp-origin', '#tp-days', '#tp-budget', '#tp-mode', '#tp-intercity-mode'].forEach((sel) => {
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
      if (map && bounds && !bounds.isEmpty()) map.fitBounds(bounds, { padding: 80, maxZoom: 12.5, duration: 1100 });
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
          if (errBox) errBox.textContent = L(`未找到与「${searchVal || '空'}」匹配的目的地，请重新输入并从候选列表中选择。`, `No destination matched "${searchVal}".`);
          return;
        }
        const qNorm = normalizeSearchText(searchVal);
        const top = candidates[0];
        const topExact = top.id.toLowerCase() === qNorm || normalizeSearchText(top.shortName) === qNorm || normalizeSearchText(top.name) === qNorm || normalizeSearchText(tx(top.shortName)) === qNorm || normalizeSearchText(tx(top.name)) === qNorm || (CITY_ALIASES[qNorm] && CITY_ALIASES[qNorm].includes(top.id));
        if (candidates.length > 1 && !topExact) {
          renderSuggestions(candidates);
          if (errBox) errBox.textContent = L(`找到 ${candidates.length} 个相近目的地，请在候选中点选确认具体城市。`, `Found ${candidates.length} matches — pick exact city below.`);
          return;
        }
        matched = top;
      }

      const destList = [matched];
      const extraQuery = (view.querySelector('#tp-dest-extra') ? view.querySelector('#tp-dest-extra').value : '').trim();
      if (extraQuery) {
        const extraMatch = resolveDestinationMatches(extraQuery, allDest)[0];
        if (extraMatch && extraMatch.id !== matched.id) destList.push(extraMatch);
      }

      const loadedDests = [];
      for (const d of destList) {
        const full = (global.TRAVEL_ATLAS ? await global.TRAVEL_ATLAS.ensureDetail(d.id) : null) || d;
        loadedDests.push(full);
      }

      if (errBox) errBox.textContent = '';
      const origTxt = view.querySelector('#tp-origin').value.trim();
      const newTrip = generateTripPlan({
        origin: origTxt,
        originCoords: resolveOriginCoords(origTxt),
        dests: loadedDests,
        startDate: view.querySelector('#tp-start-date').value,
        travelers: Number(view.querySelector('#tp-travelers').value),
        days: Number(view.querySelector('#tp-days').value),
        budgetRmb: Number(view.querySelector('#tp-budget').value),
        month: Number(view.querySelector('#tp-month').value),
        intercityMode: view.querySelector('#tp-intercity-mode').value,
        mode: view.querySelector('#tp-mode').value,
        interest: view.querySelector('#tp-interest').value
      });
      activeTrip = newTrip;
      selectedDayFilter = 0;
      plannerDraft.mode = 'edit';
      plannerDraft.selectedDestId = loadedDests[0].id;
      plannerDraft.destQuery = tx(loadedDests[0].shortName || loadedDests[0].name);
      if (global.StorageDB) await global.StorageDB.saveTrip(activeTrip);
      renderWorkspace();
      computeAllDayRoutes(activeTrip).then(() => {
        if (activeTrip && activeTrip.id === newTrip.id) {
          const pv = document.getElementById('planner-view');
          if (pv && !pv.classList.contains('is-hidden')) renderWorkspace();
        }
      }).catch(() => {});
    });

    view.querySelector('#tp-calc-route-btn').addEventListener('click', async (e) => {
      e.target.textContent = L('正在请求路网…', 'Computing routes…');
      activeTrip.mode = view.querySelector('#tp-mode').value;
      await computeAllDayRoutes(activeTrip);
      renderWorkspace();
    });

    const reoptBtn = view.querySelector('#tp-reopt-btn');
    if (reoptBtn) {
      reoptBtn.addEventListener('click', async () => {
        reoptimizeUnlockedDays(activeTrip);
        if (global.StorageDB) await global.StorageDB.saveTrip(activeTrip);
        await computeAllDayRoutes(activeTrip);
        renderWorkspace();
      });
    }

    const hotelInp = view.querySelector('#tp-hotel-input');
    if (hotelInp) {
      hotelInp.addEventListener('change', async () => {
        activeTrip.hotelName = hotelInp.value.trim();
        if (global.StorageDB) await global.StorageDB.saveTrip(activeTrip);
      });
    }

    const saveBudgetPatch = async () => {
      if (global.StorageDB) await global.StorageDB.saveTrip(activeTrip);
      renderWorkspace();
    };
    const curSel = view.querySelector('#tp-currency-select');
    if (curSel) {
      curSel.addEventListener('change', async () => {
        activeTrip.currency = curSel.value;
        await saveBudgetPatch();
      });
    }
    view.querySelectorAll('.tp-bi-cat').forEach((inp) => inp.addEventListener('change', (e) => { activeTrip.budgetItems[Number(e.target.dataset.idx)].category = e.target.value; saveBudgetPatch(); }));
    view.querySelectorAll('.tp-bi-det').forEach((inp) => inp.addEventListener('change', (e) => { activeTrip.budgetItems[Number(e.target.dataset.idx)].detail = e.target.value; saveBudgetPatch(); }));
    view.querySelectorAll('.tp-bi-cost').forEach((inp) => inp.addEventListener('change', (e) => { activeTrip.budgetItems[Number(e.target.dataset.idx)].cost = Number(e.target.value) || 0; saveBudgetPatch(); }));
    view.querySelectorAll('.tp-bi-actual').forEach((inp) => inp.addEventListener('change', (e) => { activeTrip.budgetItems[Number(e.target.dataset.idx)].actualCost = Number(e.target.value) || 0; saveBudgetPatch(); }));
    view.querySelectorAll('.tp-bi-del').forEach((btn) => btn.addEventListener('click', () => { activeTrip.budgetItems.splice(Number(btn.dataset.idx), 1); saveBudgetPatch(); }));
    const addBudBtn = view.querySelector('#tp-add-budget-btn');
    if (addBudBtn) addBudBtn.addEventListener('click', () => { activeTrip.budgetItems.push({ id: `bi_${Date.now()}`, category: L('其他支出', 'Other Expenses'), detail: L('新增项目', 'New Item'), cost: 500, actualCost: 0 }); saveBudgetPatch(); });

    view.querySelectorAll('.tp-prep-chk').forEach((chk) => {
      chk.addEventListener('change', async () => {
        if (!activeTrip.prep) activeTrip.prep = buildPrepChecklist([]);
        const grp = chk.dataset.grp;
        const idx = Number(chk.dataset.idx);
        if (activeTrip.prep[grp] && activeTrip.prep[grp][idx]) activeTrip.prep[grp][idx].done = chk.checked;
        if (global.StorageDB) await global.StorageDB.saveTrip(activeTrip);
      });
    });

    const addCustomBtn = view.querySelector('#tp-add-custom-stop');
    if (addCustomBtn) {
      addCustomBtn.addEventListener('click', async () => {
        const name = global.prompt(L('输入自定义景点或交通接驳节点名称：', 'Enter custom stop or transit node name:'));
        if (!name || !name.trim()) return;
        const targetDay = (activeTrip.days && activeTrip.days[0]) || null;
        if (!targetDay) return;
        const refCoords = targetDay.stops[0] && targetDay.stops[0].coords ? targetDay.stops[0].coords : (primaryDestObj ? primaryDestObj.coords : [0, 0]);
        targetDay.stops.push({ id: `st_c_${Date.now().toString(36)}`, destId: activeTrip.destId, name: name.trim(), coords: refCoords, dwellMin: 60, locked: true });
        if (global.StorageDB) await global.StorageDB.saveTrip(activeTrip);
        renderWorkspace();
      });
    }

    // Stop drag/lock/dwell/reorder
    view.querySelectorAll('.stop-drag-item').forEach((el) => {
      el.addEventListener('dragstart', () => { dragPayload = { dayIdx: Number(el.dataset.dayIdx), stopIdx: Number(el.dataset.stopIdx) }; el.classList.add('dragging'); });
      el.addEventListener('dragend', () => el.classList.remove('dragging'));
    });
    view.querySelectorAll('.day-card').forEach((card) => {
      card.addEventListener('dragover', (e) => e.preventDefault());
      card.addEventListener('drop', async (e) => {
        e.preventDefault();
        if (!dragPayload) return;
        const targetDayIdx = Number(card.dataset.dayIdx);
        const [moved] = activeTrip.days[dragPayload.dayIdx].stops.splice(dragPayload.stopIdx, 1);
        if (moved) activeTrip.days[targetDayIdx].stops.push(moved);
        dragPayload = null;
        if (global.StorageDB) await global.StorageDB.saveTrip(activeTrip);
        renderWorkspace();
      });
    });
    view.querySelectorAll('.tp-lock-stop').forEach((b) => b.addEventListener('click', async () => {
      const st = activeTrip.days[Number(b.dataset.day)].stops[Number(b.dataset.stop)];
      if (st) st.locked = !st.locked;
      if (global.StorageDB) await global.StorageDB.saveTrip(activeTrip);
      renderWorkspace();
    }));
    view.querySelectorAll('.tp-dwell-stop').forEach((b) => b.addEventListener('click', async () => {
      const st = activeTrip.days[Number(b.dataset.day)].stops[Number(b.dataset.stop)];
      if (!st) return;
      st.dwellMin = st.dwellMin >= 180 ? 45 : (Number(st.dwellMin || 90) + 30);
      if (global.StorageDB) await global.StorageDB.saveTrip(activeTrip);
      renderWorkspace();
    }));
    view.querySelectorAll('.tp-move-up').forEach((b) => b.addEventListener('click', async () => {
      const d = Number(b.dataset.day), s = Number(b.dataset.stop), arr = activeTrip.days[d].stops;
      if (s > 0) { [arr[s - 1], arr[s]] = [arr[s], arr[s - 1]]; if (global.StorageDB) await global.StorageDB.saveTrip(activeTrip); renderWorkspace(); }
    }));
    view.querySelectorAll('.tp-move-down').forEach((b) => b.addEventListener('click', async () => {
      const d = Number(b.dataset.day), s = Number(b.dataset.stop), arr = activeTrip.days[d].stops;
      if (s < arr.length - 1) { [arr[s + 1], arr[s]] = [arr[s], arr[s + 1]]; if (global.StorageDB) await global.StorageDB.saveTrip(activeTrip); renderWorkspace(); }
    }));
    view.querySelectorAll('.tp-del-stop').forEach((b) => b.addEventListener('click', async () => {
      activeTrip.days[Number(b.dataset.day)].stops.splice(Number(b.dataset.stop), 1);
      if (global.StorageDB) await global.StorageDB.saveTrip(activeTrip);
      renderWorkspace();
    }));
    view.querySelectorAll('.tp-fly-stop').forEach((b) => b.addEventListener('click', () => {
      const st = activeTrip.days[Number(b.dataset.day)].stops[Number(b.dataset.stop)];
      if (!st || !st.coords) return;
      drawTripOnGlobe(activeTrip);
      if (typeof global.setAppViewMode === 'function') global.setAppViewMode('map');
      const map = typeof global.getGlobeMap === 'function' ? global.getGlobeMap() : null;
      if (map) map.flyTo({ center: st.coords, zoom: 13, pitch: 48, duration: 1100 });
    }));

    // Exports & Share
    view.querySelector('#tp-exp-json').addEventListener('click', () => downloadText(`${activeTrip.name}.json`, JSON.stringify(activeTrip, null, 2), 'application/json'));
    view.querySelector('#tp-exp-csv').addEventListener('click', () => downloadText(`${activeTrip.name}.csv`, tripToCsv(activeTrip), 'text/csv;charset=utf-8'));
    view.querySelector('#tp-exp-more').addEventListener('click', async () => {
      if (global.LazyLoader && typeof global.LazyLoader.loadScript === 'function') {
        await global.LazyLoader.loadScript('js/lazy/export-service.js').catch(() => {});
      }
      if (global.ExportService && typeof global.ExportService.openTripExportModal === 'function') {
        global.ExportService.openTripExportModal(activeTrip);
      } else {
        const printEl = document.getElementById('trip-print-area');
        if (!printEl) return;
        printEl.classList.remove('is-hidden');
        printEl.innerHTML = `<h1>${esc(activeTrip.name)}</h1>${(activeTrip.days || []).map((d) => `<h3>Day ${d.day}</h3><ol>${d.stops.map((s) => `<li>${esc(tx(s.name))}</li>`).join('')}</ol>`).join('')}`;
        global.print();
        setTimeout(() => printEl.classList.add('is-hidden'), 500);
      }
    });
    view.querySelector('#tp-share-url').addEventListener('click', async () => {
      if (global.LazyLoader && typeof global.LazyLoader.loadScript === 'function') {
        await global.LazyLoader.loadScript('js/lazy/share-center.js').catch(() => {});
      }
      if (global.ShareCenter && typeof global.ShareCenter.open === 'function') {
        const shareUrl = serializeTripToUrl(activeTrip);
        global.ShareCenter.open({
          type: 'trip',
          title: activeTrip.name,
          shareUrl,
          dest: primaryDestObj,
          trip: activeTrip
        });
        return;
      }
      const shareUrl = serializeTripToUrl(activeTrip);
      const msgEl = view.querySelector('#tp-share-msg');
      try {
        if (global.navigator && global.navigator.clipboard) await global.navigator.clipboard.writeText(shareUrl);
        msgEl.textContent = L(`已复制分享链接（${shareUrl.length} 字符）`, `Share link copied (${shareUrl.length} chars)`);
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
    } catch (e) {}
    return false;
  }

  return {
    generateTripPlan,
    resolveDestinationMatches,
    resetDraftForNewTrip,
    twoOptOptimize,
    orderDayStopsByLight,
    reoptimizeUnlockedDays,
    detectTripConflicts,
    computeAccommodationAdvice,
    buildPrepChecklist,
    serializeTripToUrl,
    deserializeTripFromParam,
    tripToCsv,
    addSpotToActiveTrip,
    renderWorkspace,
    drawTripOnGlobe,
    restoreFromUrlIfPresent
  };
});
