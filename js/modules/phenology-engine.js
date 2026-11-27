(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory(typeof globalThis !== 'undefined' ? globalThis : root);
  } else {
    root.PhenologyEngine = factory(root);
  }
})(typeof window !== 'undefined' ? window : globalThis, function (global) {
  'use strict';

  const DEG2RAD = Math.PI / 180;
  const RAD2DEG = 180 / Math.PI;
  const CATEGORIES = [
    { id: 'all', label: '综合物候' },
    { id: 'blossom', label: '春季花海/樱花' },
    { id: 'autumn', label: '金秋红叶/落叶松' },
    { id: 'snow', label: '雪景/冰川/雾凇' },
    { id: 'aurora', label: '极光/极夜窗口' },
    { id: 'milkyway', label: '银河/暗夜星空' }
  ];

  let enrichmentCache = null;
  let enrichmentPromise = null;
  let heatState = { enabled: false, category: 'all', month: new Date().getMonth() + 1 };

  function esc(str) {
    return String(str || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  async function loadEnrichment() {
    if (enrichmentCache) return enrichmentCache;
    if (enrichmentPromise) return enrichmentPromise;
    if (typeof fetch !== 'function') return null;

    enrichmentPromise = fetch('data/enrichment/atlas-enrichment.json')
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (data && data.byId) enrichmentCache = data.byId;
        return enrichmentCache;
      })
      .catch(() => null);
    return enrichmentPromise;
  }

  function getEnrichmentMap() {
    return enrichmentCache || {};
  }

  /**
   * Compute centered dipole geomagnetic latitude (IGRF-13 pole: 80.7°N, 72.7°W).
   */
  function computeGeomagneticLat(latDeg, lngDeg) {
    const poleLat = 80.7 * DEG2RAD;
    const poleLng = -72.7 * DEG2RAD;
    const lat = (Number(latDeg) || 0) * DEG2RAD;
    const lng = (Number(lngDeg) || 0) * DEG2RAD;
    const sinM = Math.sin(lat) * Math.sin(poleLat) + Math.cos(lat) * Math.cos(poleLat) * Math.cos(lng - poleLng);
    return Number((Math.asin(Math.max(-1, Math.min(1, sinM))) * RAD2DEG).toFixed(2));
  }

  function parseTempMean(tempStr) {
    if (!tempStr) return null;
    const nums = String(tempStr).match(/-?\d+(?:\.\d+)?/g);
    if (!nums || !nums.length) return null;
    const vals = nums.map(Number).filter(Number.isFinite);
    if (!vals.length) return null;
    return vals.reduce((a, b) => a + b, 0) / vals.length;
  }

  function getMonthObj(dest, monthNum) {
    if (Array.isArray(dest.months)) {
      return dest.months.find((x) => x.m === monthNum) || null;
    }
    return null;
  }

  function getArchiveMonthScore(dest, monthNum) {
    const mo = getMonthObj(dest, monthNum);
    if (mo) return Number(mo.score) || 0;
    if (Array.isArray(dest.monthScores)) return Number(dest.monthScores[monthNum - 1]) || 0;
    return 3;
  }

  function formatPeakMonths(dest, enr) {
    const peaks = enr && Array.isArray(enr.peakMonths) && enr.peakMonths.length
      ? enr.peakMonths
      : (Array.isArray(dest.monthScores)
          ? dest.monthScores.map((s, i) => (s >= 4 ? i + 1 : 0)).filter(Boolean)
          : []);
    if (!peaks.length) return '全年均衡';
    return peaks.map((m) => `${m}月`).join('、');
  }

  function inferDefaultCategory(dest, enr) {
    const lands = (enr && enr.landscapeTypes) || [];
    if (lands.includes('aurora')) return 'aurora';
    if (lands.includes('autumn')) return 'autumn';
    if (lands.includes('blossom')) return 'blossom';
    if (lands.includes('snow') || lands.includes('glacier')) return 'snow';
    if (lands.includes('milkyway')) return 'milkyway';
    return 'all';
  }

  /**
   * Landscape-specific phenology suitability evaluation with transparent source,
   * confidence tier, and explicit scientific limitations.
   */
  function evaluatePhenology(dest, monthNum, opts) {
    const m = Math.max(1, Math.min(12, Number(monthNum) || 1));
    const options = opts || {};
    const enr = options.enrichment || (enrichmentCache && enrichmentCache[dest.id]) || null;
    const category = (!options.category || options.category === 'auto')
      ? inferDefaultCategory(dest, enr)
      : options.category;

    const coords = Array.isArray(dest.coords) ? dest.coords : [0, 30];
    const lng = Number(coords[0]) || 0;
    const lat = Number(coords[1]) || 0;
    const lands = (enr && Array.isArray(enr.landscapeTypes) ? enr.landscapeTypes : null) ||
      (global.GeoIntelligence ? global.GeoIntelligence.classifyLandscapesFromText(`${dest.name} ${dest.subtitle} ${dest.heroSummary}`) : []);

    const archiveScore = getArchiveMonthScore(dest, m);
    const mo = getMonthObj(dest, m);
    const clim = Array.isArray(options.climateMonthly) ? options.climateMonthly[m - 1] : null;
    const enrClim = enr && Array.isArray(enr.monthlyClimateSummary) ? enr.monthlyClimateSummary[m - 1] : null;
    const tempC = clim ? clim.tempMean : (enrClim && Number.isFinite(enrClim.tempMeanC) ? enrClim.tempMeanC : parseTempMean(mo && mo.temp));
    const elevM = enr && Number.isFinite(enr.elevationM) ? enr.elevationM : 0;

    if (category === 'aurora') {
      const mlat = computeGeomagneticLat(lat, lng);
      const absMlat = Math.abs(mlat);
      // Auroral oval peaks around 63°–73° magnetic latitude
      const ovalFactor = absMlat >= 60 && absMlat <= 75
        ? 100 - Math.abs(absMlat - 67) * 2.4
        : absMlat >= 52
          ? 52 + (absMlat - 52) * 3.5
          : Math.max(2, absMlat * 0.45);

      let darkFactor = 60;
      const SC = options.sunCalcRef || global.SunCalc;
      if (SC) {
        const dt = new Date(Date.UTC(2026, m - 1, 15, 12, 0, 0));
        const t = SC.getTimes(dt, lat, lng);
        if (t.night instanceof Date && t.nightEnd instanceof Date && !Number.isNaN(t.night.getTime()) && !Number.isNaN(t.nightEnd.getTime())) {
          const nightMs = (t.nightEnd.getTime() - t.night.getTime() + 86400000) % 86400000;
          const nightHours = nightMs / 3600000;
          darkFactor = Math.min(100, Math.max(10, Math.round(nightHours * 10.5)));
        } else {
          // Polar summer daylight vs polar winter darkness
          const isNorthWinter = lat >= 0 ? (m >= 10 || m <= 3) : (m >= 4 && m <= 9);
          darkFactor = isNorthWinter ? 98 : 0;
        }
      }
      const suitability = darkFactor === 0 ? 4 : Math.round(ovalFactor * 0.65 + darkFactor * 0.35);
      return {
        category: 'aurora',
        month: m,
        suitability: Math.max(0, Math.min(100, suitability)),
        peakWindowText: absMlat >= 55 ? (lat >= 0 ? '9月–次年3月（天文暗夜期）' : '4月–9月（南半球极夜）') : '磁纬偏低，仅强地磁暴期间偶现',
        dataSource: 'astronomy',
        confidence: 'medium',
        explanation: `地磁纬度 ${mlat > 0 ? `${mlat}°N` : `${Math.abs(mlat)}°S`} · ${m} 月黑夜条件评分 ${darkFactor}/100。`,
        limitations: '基于地磁纬度与天文黑夜时长；实际极光可见度取决于实时太阳风 Kp 指数与当地云量。'
      };
    }

    if (category === 'milkyway') {
      const Astro = options.astroRef || global.Astronomy;
      let gcPeakAlt = null;
      let darkHours = 0;
      if (Astro && typeof Astro.Observer === 'function') {
        const obs = new Astro.Observer(lat, lng, 0);
        for (let h = 0; h < 24; h += 1) {
          const sampleDt = new Date(Date.UTC(2026, m - 1, 15, h, 0, 0));
          const eqSun = Astro.Equator(Astro.Body.Sun, sampleDt, obs, true, true);
          const sunH = Astro.Horizon(sampleDt, obs, eqSun.ra, eqSun.dec, 'normal');
          if (sunH.altitude <= -12) {
            darkHours++;
            const gcH = Astro.Horizon(sampleDt, obs, 17.7611, -29.0078, 'normal');
            if (gcPeakAlt === null || gcH.altitude > gcPeakAlt) gcPeakAlt = gcH.altitude;
          }
        }
      }
      if (gcPeakAlt !== null) {
        const altScore = gcPeakAlt <= 0 ? 10 : Math.min(100, Math.round(30 + gcPeakAlt * 1.15));
        const darkScore = Math.min(100, darkHours * 14);
        const suitability = Math.round(altScore * 0.6 + darkScore * 0.25 + archiveScore * 3);
        return {
          category: 'milkyway',
          month: m,
          suitability: Math.max(5, Math.min(100, suitability)),
          peakWindowText: lat >= 0 ? '3月–10月无月光深夜' : '2月–10月（南半球天顶银心）',
          dataSource: 'astronomy',
          confidence: 'high',
          explanation: `${m} 月暗夜约 ${darkHours}h · 银心最高仰角 ${gcPeakAlt.toFixed(1)}°。`,
          limitations: '银心位置由 Astronomy Engine 精确星历计算；实际拍摄需避开满月及厚云层。'
        };
      }
      const fallbackSuit = Math.min(100, Math.round(archiveScore * 16 + (lands.includes('milkyway') ? 18 : 0)));
      return {
        category: 'milkyway',
        month: m,
        suitability: fallbackSuit,
        peakWindowText: formatPeakMonths(dest, enr),
        dataSource: 'archive-statistical',
        confidence: 'indicative',
        explanation: `结合实地暗夜记录与 ${m} 月晴空条件评估。`,
        limitations: '未加载星历引擎时的经验参考。'
      };
    }

    if (category === 'snow') {
      const hasSnowLand = lands.includes('snow') || lands.includes('glacier');
      if (clim) {
        const sc = Math.round(Math.min(100, clim.snowProbPct * 1.05 + (hasSnowLand ? 16 : 0) + archiveScore * 3));
        return {
          category: 'snow',
          month: m,
          suitability: Math.max(8, sc),
          peakWindowText: formatPeakMonths(dest, enr),
          dataSource: 'era5-reanalysis',
          confidence: 'high',
          explanation: `ERA5 5 年再分析 ${m} 月降雪/积雪率 ${clim.snowProbPct}%，均温 ${clim.tempMean}°C。`,
          limitations: '再分析网格均值非气象站实测，高海拔山峰局部积雪可能早于山谷网格。'
        };
      }
      const effectiveT = tempC !== null ? tempC : (24 - Math.abs(lat) * 0.45 - elevM * 0.004);
      const coldFit = effectiveT <= 2 ? 92 : effectiveT <= 8 ? 62 : Math.max(8, Math.round(45 - effectiveT * 2));
      const sc = Math.round(coldFit * 0.55 + archiveScore * 6 + (hasSnowLand ? 15 : 0));
      return {
        category: 'snow',
        month: m,
        suitability: Math.max(5, Math.min(100, sc)),
        peakWindowText: formatPeakMonths(dest, enr),
        dataSource: 'archive-statistical',
        confidence: hasSnowLand ? 'medium' : 'indicative',
        explanation: `${m} 月参考均温约 ${Math.round(effectiveT)}°C${elevM ? ` · 海拔 ${elevM}m` : ''}，实地评分 ${archiveScore}★。`,
        limitations: '未拉取 ERA5 逐日积雪深度前采用温度阈值与档案统计估算。'
      };
    }

    if (category === 'autumn') {
      const hasAut = lands.includes('autumn');
      const isTargetSeason = lat >= 0 ? (m >= 9 && m <= 11) : (m >= 3 && m <= 5);
      const tempFit = tempC !== null
        ? Math.max(15, Math.min(100, Math.round(100 - Math.abs(tempC - 10) * 4.5)))
        : (isTargetSeason ? 82 : 34);
      const sc = Math.round(tempFit * 0.45 + archiveScore * 8 + (hasAut ? 18 : 0) + (isTargetSeason ? 10 : -12));
      return {
        category: 'autumn',
        month: m,
        suitability: Math.max(5, Math.min(100, sc)),
        peakWindowText: hasAut ? formatPeakMonths(dest, enr) : (lat >= 0 ? '9月下旬–11月中旬' : '4月–5月'),
        dataSource: clim ? 'era5-reanalysis' : 'archive-statistical',
        confidence: hasAut ? 'medium' : 'indicative',
        explanation: `${hasAut ? '包含典型秋色/落叶林景观' : '综合气候推演'} · ${m} 月适温匹配度 ${tempFit}/100。`,
        limitations: '红叶转色受当年初霜与降水影响，实际峰值通常存在 ±1–2 周年际波动。'
      };
    }

    if (category === 'blossom') {
      const hasBlossom = lands.includes('blossom');
      const isSpring = lat >= 0 ? (m >= 3 && m <= 6) : (m >= 9 && m <= 12);
      const tempFit = tempC !== null
        ? Math.max(15, Math.min(100, Math.round(100 - Math.abs(tempC - 16) * 4.2)))
        : (isSpring ? 80 : 32);
      const sc = Math.round(tempFit * 0.45 + archiveScore * 8 + (hasBlossom ? 18 : 0) + (isSpring ? 10 : -12));
      return {
        category: 'blossom',
        month: m,
        suitability: Math.max(5, Math.min(100, sc)),
        peakWindowText: hasBlossom ? formatPeakMonths(dest, enr) : (lat >= 0 ? '3月–5月（随纬度海拔北移）' : '9月–11月'),
        dataSource: clim ? 'era5-reanalysis' : 'archive-statistical',
        confidence: hasBlossom ? 'medium' : 'indicative',
        explanation: `${hasBlossom ? '拥有春花/花海打卡记录' : '按春温梯次推演'} · ${m} 月花期适温 ${tempFit}/100。`,
        limitations: '花期对春季积温极敏感，请结合出发前 14 天当地实况预报。'
      };
    }

    // Default 'all' comprehensive seasonal phenology
    const baseSuit = Math.max(15, Math.min(100, Math.round(archiveScore * 18 + (dest.allWeather ? 8 : 0))));
    return {
      category: 'all',
      month: m,
      suitability: baseSuit,
      peakWindowText: formatPeakMonths(dest, enr),
      dataSource: clim ? 'era5-reanalysis' : 'archive-statistical',
      confidence: clim ? 'high' : 'medium',
      explanation: `${m} 月档案推荐度 ${archiveScore}★${mo && mo.highlight ? ` · ${mo.highlight}` : ''}。`,
      limitations: '综合实地季节档案与气候特征，实时出行请留意短期气象变化。'
    };
  }

  function updateSeasonHeatmap(map, month, category) {
    if (!map || !map.isStyleLoaded || !map.isStyleLoaded()) return;
    if (!heatState.enabled) return;

    const m = month && month !== 'all' ? Number(month) : (new Date().getMonth() + 1);
    const cat = category || heatState.category || 'all';
    heatState.month = m;
    heatState.category = cat;

    const all = global.TRAVEL_ATLAS ? global.TRAVEL_ATLAS.getAll() : [];
    const features = [];
    for (let i = 0; i < all.length; i++) {
      const d = all[i];
      if (!Array.isArray(d.coords) || d.coords.length < 2) continue;
      const ev = evaluatePhenology(d, m, { category: cat });
      if (ev.suitability < 45) continue;
      features.push({
        type: 'Feature',
        properties: { weight: Number((ev.suitability / 100).toFixed(2)) },
        geometry: { type: 'Point', coordinates: d.coords }
      });
    }

    const fc = { type: 'FeatureCollection', features };
    if (!map.getSource('v4-pheno-heat-src')) {
      map.addSource('v4-pheno-heat-src', { type: 'geojson', data: fc });
    } else {
      map.getSource('v4-pheno-heat-src').setData(fc);
    }

    const colorStops = {
      blossom: [0, 'rgba(0,0,0,0)', 0.25, 'rgba(244,114,182,0.35)', 0.65, 'rgba(251,113,133,0.75)', 1, 'rgba(253,164,175,0.92)'],
      autumn: [0, 'rgba(0,0,0,0)', 0.25, 'rgba(245,158,11,0.35)', 0.65, 'rgba(234,88,12,0.78)', 1, 'rgba(251,191,36,0.94)'],
      snow: [0, 'rgba(0,0,0,0)', 0.25, 'rgba(56,189,248,0.34)', 0.65, 'rgba(125,211,252,0.74)', 1, 'rgba(224,242,254,0.94)'],
      aurora: [0, 'rgba(0,0,0,0)', 0.25, 'rgba(16,185,129,0.38)', 0.65, 'rgba(52,211,153,0.78)', 1, 'rgba(167,139,250,0.92)'],
      milkyway: [0, 'rgba(0,0,0,0)', 0.25, 'rgba(99,102,241,0.36)', 0.65, 'rgba(139,92,246,0.76)', 1, 'rgba(226,192,125,0.94)'],
      all: [0, 'rgba(0,0,0,0)', 0.25, 'rgba(226,192,125,0.28)', 0.65, 'rgba(245,158,11,0.68)', 1, 'rgba(253,224,71,0.90)']
    };

    if (!map.getLayer('layer-v4-phenology-heat')) {
      const beforeId = map.getLayer('atlas-glow') ? 'atlas-glow' : undefined;
      map.addLayer(
        {
          id: 'layer-v4-phenology-heat',
          type: 'heatmap',
          source: 'v4-pheno-heat-src',
          paint: {
            'heatmap-weight': ['get', 'weight'],
            'heatmap-intensity': ['interpolate', ['linear'], ['zoom'], 1, 0.85, 5, 1.35],
            'heatmap-radius': ['interpolate', ['linear'], ['zoom'], 1, 18, 4, 34, 7, 48],
            'heatmap-opacity': 0.68,
            'heatmap-color': ['interpolate', ['linear'], ['heatmap-density'], ...(colorStops[cat] || colorStops.all)]
          }
        },
        beforeId
      );
    } else {
      map.setPaintProperty('layer-v4-phenology-heat', 'heatmap-color', [
        'interpolate', ['linear'], ['heatmap-density'], ...(colorStops[cat] || colorStops.all)
      ]);
    }
  }

  function toggleSeasonHeatmap(map, month, category) {
    if (!map || !map.isStyleLoaded || !map.isStyleLoaded()) return false;
    heatState.enabled = !heatState.enabled;
    const btn = typeof document !== 'undefined' ? document.getElementById('toggle-pheno-heat-btn') : null;
    if (btn) btn.classList.toggle('active', heatState.enabled);

    if (!heatState.enabled) {
      if (map.getLayer('layer-v4-phenology-heat')) map.removeLayer('layer-v4-phenology-heat');
      if (map.getSource('v4-pheno-heat-src')) map.removeSource('v4-pheno-heat-src');
      return false;
    }

    updateSeasonHeatmap(map, month, category);
    return true;
  }

  async function mountDrawerCard(dest, monthNum, containerEl, onSelectDest) {
    if (!dest || !containerEl) return;
    await loadEnrichment();
    if (!document.body.contains(containerEl)) return;

    const enr = enrichmentCache ? enrichmentCache[dest.id] : null;
    const activeCat = inferDefaultCategory(dest, enr);
    const render = (cat) => {
      if (!document.body.contains(containerEl)) return;
      const ev = evaluatePhenology(dest, monthNum, { category: cat, enrichment: enr });
      const allDests = global.TRAVEL_ATLAS ? global.TRAVEL_ATLAS.getAll() : [];
      const related = global.GeoIntelligence
        ? global.GeoIntelligence.findRelatedDestinations(dest, allDests, 4)
        : [];

      const srcLabel = ev.dataSource === 'astronomy'
        ? 'Astronomy 星历'
        : (ev.dataSource === 'era5-reanalysis' ? 'ERA5 再分析' : '实地统计物候');

      containerEl.innerHTML = `
        <div class="pheno-engine-card">
          <div style="display:flex;justify-content:space-between;align-items:center;gap:6px;flex-wrap:wrap;">
            <strong>V4 科学物候预测 · ${ev.month} 月适宜度 <span class="mono-num" style="color:var(--accent-primary);">${ev.suitability}/100</span></strong>
            <span class="source-tag ${ev.dataSource === 'astronomy' ? 'astronomy' : 'empirical'}">${esc(srcLabel)} · 置信度 ${esc(ev.confidence)}</span>
          </div>
          <div class="pheno-cat-pills">
            ${CATEGORIES.map((c) => `<button class="mini-action-pill pheno-cat-btn ${c.id === cat ? 'active' : ''}" data-cat="${c.id}" type="button">${esc(c.label)}</button>`).join('')}
          </div>
          <div style="font-size:11.5px;line-height:1.6;margin-top:6px;">
            <div><strong>推荐窗口：</strong>${esc(ev.peakWindowText)}</div>
            <div>${esc(ev.explanation)}</div>
            <div style="color:var(--text-muted);font-size:11px;margin-top:3px;">模型限制：${esc(ev.limitations)}</div>
          </div>
          ${
            related.length
              ? `
            <div class="related-graph-box">
              <div style="font-size:11px;color:var(--text-secondary);margin-bottom:5px;">地理知识图谱 · 相似或顺路秘境</div>
              <div class="related-graph-chips">
                ${related
                  .map(
                    (r) => `
                  <button class="mini-action-pill related-dest-btn" data-id="${esc(r.dest.id)}" type="button">
                    <span>${esc(r.dest.shortName || r.dest.name)}</span>
                    <span style="opacity:0.7;font-size:10.5px;">${esc(r.relationLabel)}</span>
                  </button>
                `
                  )
                  .join('')}
              </div>
            </div>
          `
              : ''
          }
        </div>
      `;

      containerEl.querySelectorAll('.pheno-cat-btn').forEach((btn) => {
        btn.addEventListener('click', () => render(btn.dataset.cat));
      });
      containerEl.querySelectorAll('.related-dest-btn').forEach((btn) => {
        btn.addEventListener('click', () => {
          if (typeof onSelectDest === 'function') onSelectDest(btn.dataset.id);
          else if (typeof global.selectAtlasDestination === 'function') global.selectAtlasDestination(btn.dataset.id);
        });
      });
    };

    render(activeCat);
  }

  return {
    CATEGORIES,
    loadEnrichment,
    getEnrichmentMap,
    computeGeomagneticLat,
    evaluatePhenology,
    toggleSeasonHeatmap,
    updateSeasonHeatmap,
    isHeatmapEnabled: () => heatState.enabled,
    mountDrawerCard
  };
});
