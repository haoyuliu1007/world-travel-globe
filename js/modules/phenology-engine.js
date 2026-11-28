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
  let enrichmentMeta = null;
  let enrichmentPromise = null;
  let heatState = { enabled: false, category: 'all', month: new Date().getMonth() + 1 };

  const SUB_CATEGORIES = [
    { id: 'alpine_flower', label: '高山野花' },
    { id: 'grassland', label: '草原牧场' },
    { id: 'forest', label: '森林林海' },
    { id: 'ice_glacier', label: '冰川冻湖' },
    { id: 'lake', label: '高原圣湖' }
  ];

  function esc(str) {
    return String(str || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
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

  function tx(str) {
    return global.AppI18n && typeof global.AppI18n.tx === 'function' ? global.AppI18n.tx(str) : (str || '');
  }

  const MONTH_SHORT_EN = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  function fmtMonth(m) {
    return getLang() === 'en' ? (MONTH_SHORT_EN[m - 1] || `M${m}`) : L(`${m} 月`, `M${m}`);
  }

  function getCategoryLabel(cat) {
    const enMap = {
      all: 'Overall',
      blossom: 'Spring Blossoms',
      autumn: 'Autumn Foliage',
      snow: 'Snow & Glaciers',
      aurora: 'Aurora Window',
      milkyway: 'Milky Way & Stars'
    };
    return L(cat.label, enMap[cat.id] || cat.label);
  }

  function translateRelationLabel(raw) {
    if (getLang() !== 'en') return L(raw, raw);
    const landEn = {
      秋色: 'Autumn Foliage',
      花海: 'Blossoms',
      雪山: 'Snow Peaks',
      冰川: 'Glaciers',
      极光: 'Aurora',
      银河: 'Milky Way',
      湖泊: 'Lakes',
      海岸: 'Coastline',
      沙漠: 'Desert',
      森林: 'Forest',
      云海: 'Cloud Sea',
      高山: 'Alpine',
      城市: 'Architecture',
      火山: 'Volcano',
      草原: 'Grassland',
      峡谷: 'Canyon'
    };
    return String(raw || '')
      .split(' · ')
      .map((part) => {
        if (part === '地理景观关联') return 'Geo Match';
        const mNear = part.match(/^邻近\s+(\d+km)$/);
        if (mNear) return `Nearby ${mNear[1]}`;
        const mReg = part.match(/^同区域\s+(\d+km)$/);
        if (mReg) return `Same Region ${mReg[1]}`;
        const mLand = part.match(/^同属(.+)$/);
        if (mLand) return landEn[mLand[1]] || tx(mLand[1]);
        return tx(part);
      })
      .join(' · ');
  }

  async function loadEnrichment() {
    if (enrichmentCache) return enrichmentCache;
    if (enrichmentPromise) return enrichmentPromise;
    if (typeof fetch !== 'function') return null;

    enrichmentPromise = fetch('data/enrichment/atlas-enrichment.json')
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (data && data.byId) enrichmentCache = data.byId;
        if (data) {
          enrichmentMeta = {
            schemaVersion: data.schemaVersion,
            datasetVersion: data.datasetVersion,
            tierCounts: data.tierCounts || null,
            phenologyValidation: data.phenologyValidation || null
          };
        }
        return enrichmentCache;
      })
      .catch(() => null);
    return enrichmentPromise;
  }

  function getEnrichmentMap() {
    return enrichmentCache || {};
  }

  function getValidationSummary() {
    return enrichmentMeta && enrichmentMeta.phenologyValidation ? enrichmentMeta.phenologyValidation : null;
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
    if (!peaks.length) return L('全年均衡', 'Year-round');
    return getLang() === 'en'
      ? peaks.map((m) => MONTH_SHORT_EN[m - 1] || `M${m}`).join(', ')
      : peaks.map((m) => L(`${m}月`, `M${m}`)).join('、');
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

  function getTierLabel(tier) {
    if (tier === 'C') return L('Tier C · 实证校准子集', 'Tier C · Calibrated Subset');
    if (tier === 'B') return L('Tier B · 气候高程增强', 'Tier B · Climate & Elev Enhanced');
    return L('Tier A · 档案启发参考', 'Tier A · Archive Heuristic');
  }

  function resolveProvenance(dest, enr) {
    if (enr && enr.provenance) return enr.provenance;
    return {
      source: 'KAIROS Curated Travel Atlas Archive',
      sampleCoords: Array.isArray(dest && dest.coords) ? dest.coords : [null, null],
      spatialResolution: 'destination-centroid',
      timeCoverage: 'climatological multi-year archive',
      qualityGrade: enr && enr.quality ? enr.quality.confidence : 'standard',
      missingFields: [],
      license: 'Project Internal Curated Metadata'
    };
  }

  function decoratePhenologyResult(result, dest, enr, options) {
    const calMap = enr && enr.calibratedPhenology ? enr.calibratedPhenology : null;
    const cal = calMap && calMap[result.category] ? calMap[result.category] : null;
    const tier = cal
      ? 'C'
      : (enr && (enr.phenologyModelTier === 'B' || enr.phenologyModelTier === 'C')) ||
        (options && Array.isArray(options.climateMonthly)) ||
        result.dataSource === 'astronomy'
        ? 'B'
        : 'A';

    let finalSuit = result.suitability;
    let explanation = result.explanation;
    let peakWindowText = result.peakWindowText;
    let confidence = result.confidence;
    let uncertaintyDays = result.category === 'aurora' ? 1 : (result.dataSource === 'astronomy' ? 0 : 21);
    let uncertaintyNote = result.dataSource === 'astronomy'
      ? L('天文星历确定性计算', 'Deterministic ephemeris')
      : L('档案月度经验窗口 (±3 周常态波动，非逐日预报)', 'Archive monthly window (±3 wk variance, not a daily forecast)');

    if (cal) {
      uncertaintyDays = cal.uncertaintyDays || 4;
      uncertaintyNote = L(`校准气候常态 ±${uncertaintyDays} 天（受当年气象影响仍会有年际波动）`, `Climatological normal ±${uncertaintyDays}d (interannual weather still shifts actual dates)`);
      confidence = 'high';
      if (cal.predictedMonth === result.month) {
        finalSuit = Math.max(finalSuit, 86);
      }
      peakWindowText = `${L('气候常态峰值', 'Climatological Peak')} ~${cal.predictedDayLabel} (±${uncertaintyDays}d) · ${peakWindowText}`;
      explanation = `${explanation} ${L(`样本外历史常态 MAE ${cal.holdoutMaeDays} 天 (${cal.source})`, `Historical normal MAE ${cal.holdoutMaeDays}d (${cal.source})`)}`;
    } else if (tier === 'B' && result.dataSource !== 'astronomy') {
      uncertaintyDays = 14;
      uncertaintyNote = L('气候-高程推演窗口 (±2 周常态参考，非校准实测)', 'Climate-elevation window (±2 wk reference, uncalibrated)');
    }

    return Object.assign({}, result, {
      suitability: Math.max(0, Math.min(100, finalSuit)),
      peakWindowText,
      explanation,
      confidence,
      tier,
      tierLabel: getTierLabel(tier),
      modelFamily: result.category === 'aurora' ? 'space-weather' : (result.dataSource === 'astronomy' ? 'astronomy' : 'botanical-phenology'),
      uncertaintyDays,
      uncertaintyNote,
      experimental: tier !== 'C' && result.dataSource !== 'astronomy',
      calibratedPeak: cal || null,
      provenance: resolveProvenance(dest, enr)
    });
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
          const isNorthWinter = lat >= 0 ? (m >= 10 || m <= 3) : (m >= 4 && m <= 9);
          darkFactor = isNorthWinter ? 98 : 0;
        }
      }
      const suitability = darkFactor === 0 ? 4 : Math.round(ovalFactor * 0.65 + darkFactor * 0.35);
      const mlatStr = mlat > 0 ? `${mlat}°N` : `${Math.abs(mlat)}°S`;
      return decoratePhenologyResult({
        category: 'aurora',
        month: m,
        suitability: Math.max(0, Math.min(100, suitability)),
        peakWindowText: absMlat >= 55
          ? (lat >= 0 ? L('9月–次年3月（天文暗夜期）', 'Sep – Mar (Astronomical Dark Window)') : L('4月–9月（南半球极夜）', 'Apr – Sep (Southern Polar Night)'))
          : L('磁纬偏低，仅强地磁暴期间偶现', 'Low magnetic latitude — rare except strong Kp storms'),
        dataSource: 'astronomy',
        confidence: 'medium',
        explanation: L(
          `【空间天气独立模块】地磁纬度 ${mlatStr} · ${m} 月暗夜评分 ${darkFactor}/100。`,
          `[Space Weather] Geomagnetic lat ${mlatStr} · ${fmtMonth(m)} dark-sky score ${darkFactor}/100.`
        ),
        limitations: L(
          '极光属于太阳风地磁空间天气（NOAA Kp / OVATION 模型），非植物物候；需暗夜叠加低云量与 Kp≥3。',
          'Aurora is space weather (NOAA Kp/OVATION), not botanical phenology; requires dark sky, clear weather, and Kp≥3.'
        )
      }, dest, enr, options);
    }

    if (category === 'alpine_flower' || category === 'grassland' || category === 'forest' || category === 'ice_glacier' || category === 'lake') {
      const tagMap = {
        alpine_flower: ['blossom', 'mountain'],
        grassland: ['grassland'],
        forest: ['forest'],
        ice_glacier: ['glacier', 'snow'],
        lake: ['lake']
      };
      const matched = (tagMap[category] || []).some((id) => lands.includes(id));
      const idealTemp = category === 'ice_glacier' ? -2 : category === 'alpine_flower' ? 14 : category === 'grassland' ? 17 : 18;
      const tempFit = tempC !== null ? Math.max(12, Math.min(100, Math.round(100 - Math.abs(tempC - idealTemp) * 3.8))) : 68;
      const suit = Math.round(tempFit * 0.45 + archiveScore * 8 + (matched ? 16 : 0));
      return decoratePhenologyResult({
        category,
        month: m,
        suitability: Math.max(5, Math.min(100, suit)),
        peakWindowText: formatPeakMonths(dest, enr),
        dataSource: clim ? 'era5-reanalysis' : 'archive-statistical',
        confidence: matched ? 'medium' : 'indicative',
        explanation: L(
          `${matched ? '具备对应生境记录' : '按海拔与月均温包络推演'} · ${m} 月适温匹配 ${tempFit}/100。`,
          `${matched ? 'Documented habitat match' : 'Thermal-elevation estimate'} · ${fmtMonth(m)} fit ${tempFit}/100.`
        ),
        limitations: L(
          '非校准子集区域，结果仅供探索参考，具体物候受当年降水与局地微气候影响。',
          'Outside calibrated benchmark subset; seasonal timing varies with annual rainfall and microclimate.'
        )
      }, dest, enr, options);
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
      const noAstroDark = Astro && darkHours === 0;
      const computedMwSuit = noAstroDark
        ? 5
        : (gcPeakAlt !== null
          ? Math.max(5, Math.min(100, Math.round((gcPeakAlt <= 0 ? 10 : Math.min(100, Math.round(30 + gcPeakAlt * 1.15))) * 0.6 + Math.min(100, darkHours * 14) * 0.25 + archiveScore * 3)))
          : Math.min(100, Math.round(archiveScore * 16 + (lands.includes('milkyway') ? 18 : 0))));
      const baseRet = {
        category: 'milkyway',
        month: m,
        suitability: computedMwSuit,
        peakWindowText: noAstroDark
          ? L('本月极昼/白夜，建议改选 9月–次年3月', 'White Night / Polar Day — try Sep–Mar')
          : (gcPeakAlt !== null
            ? (lat >= 0 ? L('3月–10月无月光深夜', 'Mar – Oct (Moonless Late Night)') : L('2月–10月（南半球天顶银心）', 'Feb – Oct (Southern Zenith Core)'))
            : formatPeakMonths(dest, enr)),
        dataSource: gcPeakAlt !== null || noAstroDark ? 'astronomy' : 'archive-statistical',
        confidence: gcPeakAlt !== null || noAstroDark ? 'high' : 'indicative',
        explanation: noAstroDark
          ? L(`${m} 月无天文暗夜窗口（白夜/极昼，银河不可见）。`, `${fmtMonth(m)} has 0h astronomical dark sky (white night; Milky Way invisible).`)
          : (gcPeakAlt !== null
            ? L(`${m} 月暗夜约 ${darkHours}h · 银心最高仰角 ${gcPeakAlt.toFixed(1)}°。`, `${fmtMonth(m)} dark sky ~${darkHours}h · Galactic Core peak ${gcPeakAlt.toFixed(1)}°.`)
            : L(`结合实地暗夜记录与 ${m} 月晴空条件评估。`, `Assessed from field dark-sky notes & ${fmtMonth(m)} clear-sky odds.`)),
        limitations: gcPeakAlt !== null || noAstroDark
          ? L('银心位置由 Astronomy Engine 精确星历计算；实际拍摄需避开满月及厚云层。', 'Galactic Core ephemeris via Astronomy Engine; avoid full moon & overcast skies.')
          : L('未加载星历引擎时的经验参考。', 'Statistical reference while ephemeris engine is unavailable.')
      };
      return decoratePhenologyResult(baseRet, dest, enr, options);
    }

    if (category === 'snow') {
      const hasSnowLand = lands.includes('snow') || lands.includes('glacier');
      if (clim) {
        const sc = Math.round(Math.min(100, clim.snowProbPct * 1.05 + (hasSnowLand ? 16 : 0) + archiveScore * 3));
        return decoratePhenologyResult({
          category: 'snow',
          month: m,
          suitability: Math.max(8, sc),
          peakWindowText: formatPeakMonths(dest, enr),
          dataSource: 'era5-reanalysis',
          confidence: 'high',
          explanation: L(
            `ERA5 5 年再分析 ${m} 月降雪/积雪率 ${clim.snowProbPct}%，均温 ${clim.tempMean}°C。`,
            `ERA5 5-yr reanalysis ${fmtMonth(m)} snow prob ${clim.snowProbPct}%, mean ${clim.tempMean}°C.`
          ),
          limitations: L(
            '再分析网格均值非气象站实测，高海拔山峰局部积雪可能早于山谷网格。',
            'Reanalysis grid mean rather than point station data; alpine peaks may snow earlier than valleys.'
          )
        }, dest, enr, options);
      }
      const effectiveT = tempC !== null ? tempC : (24 - Math.abs(lat) * 0.45 - elevM * 0.004);
      const coldFit = effectiveT <= 2 ? 92 : effectiveT <= 8 ? 62 : Math.max(8, Math.round(45 - effectiveT * 2));
      const sc = Math.round(coldFit * 0.55 + archiveScore * 6 + (hasSnowLand ? 15 : 0));
      return decoratePhenologyResult({
        category: 'snow',
        month: m,
        suitability: Math.max(5, Math.min(100, sc)),
        peakWindowText: formatPeakMonths(dest, enr),
        dataSource: 'archive-statistical',
        confidence: hasSnowLand ? 'medium' : 'indicative',
        explanation: L(
          `${m} 月参考均温约 ${Math.round(effectiveT)}°C${elevM ? ` · 海拔 ${elevM}m` : ''}，实地评分 ${archiveScore}★。`,
          `${fmtMonth(m)} ref temp ~${Math.round(effectiveT)}°C${elevM ? ` · Elev ${elevM}m` : ''}, field score ${archiveScore}★.`
        ),
        limitations: L(
          '未拉取 ERA5 逐日积雪深度前采用温度阈值与档案统计估算。',
          'Estimated from temp threshold & field stats before ERA5 climate data is loaded.'
        )
      }, dest, enr, options);
    }

    if (category === 'autumn') {
      const hasAut = lands.includes('autumn');
      const isTropicalLowland = Math.abs(lat) < 23.44 && elevM < 1200;
      const isTargetSeason = lat >= 0 ? (m >= 9 && m <= 11) : (m >= 3 && m <= 5);
      const tempFit = tempC !== null
        ? Math.max(15, Math.min(100, Math.round(100 - Math.abs(tempC - 10) * 4.5)))
        : (isTargetSeason ? 82 : 34);
      const rawSc = Math.round(tempFit * 0.45 + archiveScore * 8 + (hasAut ? 18 : 0) + (isTargetSeason ? 10 : -12));
      const sc = isTropicalLowland && !hasAut ? Math.min(28, rawSc) : rawSc;
      return decoratePhenologyResult({
        category: 'autumn',
        month: m,
        suitability: Math.max(5, Math.min(100, sc)),
        peakWindowText: isTropicalLowland && !hasAut
          ? L('热带低纬常绿区，无显著秋叶期', 'Tropical evergreen zone — no temperate foliage season')
          : (hasAut ? formatPeakMonths(dest, enr) : (lat >= 0 ? L('9月下旬–11月中旬', 'Late Sep – Mid Nov') : L('4月–5月', 'Apr – May'))),
        dataSource: clim ? 'era5-reanalysis' : 'archive-statistical',
        confidence: hasAut ? 'medium' : 'indicative',
        explanation: isTropicalLowland && !hasAut
          ? L(`低纬热带低海拔 (${Math.abs(lat).toFixed(1)}°) 常绿林为主，不适用温带降温落叶模型。`, `Tropical lowland (${Math.abs(lat).toFixed(1)}°): evergreen vegetation; temperate leaf-fall chill index not applicable.`)
          : L(`${hasAut ? '包含典型秋色/落叶林景观' : '综合气候推演'} · ${m} 月适温匹配度 ${tempFit}/100。`, `${hasAut ? 'Verified autumn foliage habitat' : 'Thermal envelope estimate'} · ${fmtMonth(m)} temp fit ${tempFit}/100.`),
        limitations: L(
          '红叶转色受当年初霜与降水影响，实际峰值通常存在 ±1–2 周年际波动。',
          'Foliage turn varies ±1–2 weeks by first frost & rainfall each year.'
        )
      }, dest, enr, options);
    }

    if (category === 'blossom') {
      const hasBlossom = lands.includes('blossom');
      const isTropicalLowland = Math.abs(lat) < 23.44 && elevM < 1200;
      const isSpring = lat >= 0 ? (m >= 3 && m <= 6) : (m >= 9 && m <= 12);
      const tempFit = tempC !== null
        ? Math.max(15, Math.min(100, Math.round(100 - Math.abs(tempC - 16) * 4.2)))
        : (isSpring ? 80 : 32);
      const rawSc = Math.round(tempFit * 0.45 + archiveScore * 8 + (hasBlossom ? 18 : 0) + (isSpring ? 10 : -12));
      const sc = isTropicalLowland && !hasBlossom ? Math.min(45, rawSc) : rawSc;
      return decoratePhenologyResult({
        category: 'blossom',
        month: m,
        suitability: Math.max(5, Math.min(100, sc)),
        peakWindowText: isTropicalLowland && !hasBlossom
          ? L('热带花期主要受干湿季调控', 'Tropical blooms governed by wet/dry seasons')
          : (hasBlossom ? formatPeakMonths(dest, enr) : (lat >= 0 ? L('3月–5月（随纬度海拔北移）', 'Mar – May (shifts with latitude/elev)') : L('9月–11月', 'Sep – Nov'))),
        dataSource: clim ? 'era5-reanalysis' : 'archive-statistical',
        confidence: hasBlossom ? 'medium' : 'indicative',
        explanation: isTropicalLowland && !hasBlossom
          ? L(`热带低海拔区域主要受干湿季影响，温带春花积温模型仅供参考。`, `Tropical lowland area: wet/dry season drives blooms rather than temperate GDD.`)
          : L(`${hasBlossom ? '拥有春花/花海打卡记录' : '按春温梯次推演'} · ${m} 月花期适温 ${tempFit}/100。`, `${hasBlossom ? 'Recorded spring bloom destination' : 'Thermal bloom model'} · ${fmtMonth(m)} fit ${tempFit}/100.`),
        limitations: L(
          '花期对春季积温极敏感，请结合出发前 14 天当地实况预报。',
          'Blooms are sensitive to growing degree-days; verify 14-day forecast before departure.'
        )
      }, dest, enr, options);
    }

    // Default 'all' comprehensive seasonal phenology
    const baseSuit = Math.max(15, Math.min(100, Math.round(archiveScore * 18 + (dest.allWeather ? 8 : 0))));
    const hiTxt = mo && mo.highlight ? tx(mo.highlight) : '';
    return decoratePhenologyResult({
      category: 'all',
      month: m,
      suitability: baseSuit,
      peakWindowText: formatPeakMonths(dest, enr),
      dataSource: clim ? 'era5-reanalysis' : 'archive-statistical',
      confidence: clim ? 'high' : 'medium',
      explanation: L(
        `${m} 月档案推荐度 ${archiveScore}★${hiTxt ? ` · ${hiTxt}` : ''}。`,
        `${fmtMonth(m)} field rating ${archiveScore}★${hiTxt ? ` · ${hiTxt}` : ''}.`
      ),
      limitations: L(
        '综合实地季节档案与气候特征，实时出行请留意短期气象变化。',
        'Blends curated seasonal field notes & climate normals; check live weather before travel.'
      )
    }, dest, enr, options);
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
        ? L('Astronomy 星历', 'Astronomy Ephemeris')
        : (ev.dataSource === 'era5-reanalysis' ? L('ERA5 再分析', 'ERA5 Reanalysis') : L('实地统计物候', 'Field Archive'));

      containerEl.innerHTML = `
        <div class="pheno-engine-card">
          <div style="display:flex;justify-content:space-between;align-items:center;gap:6px;flex-wrap:wrap;">
            <strong>${esc(L(`KAIROS V5 物候与天文窗口 · ${ev.month} 月适宜度`, `KAIROS V5 Phenology & Window · ${fmtMonth(ev.month)}`))} <span class="mono-num" style="color:var(--accent-primary);">${ev.suitability}/100</span></strong>
            <span class="source-tag ${ev.dataSource === 'astronomy' ? 'astronomy' : 'empirical'}">${esc(srcLabel)} · ${esc(ev.tierLabel)}</span>
          </div>
          <div class="pheno-cat-pills">
            ${CATEGORIES.map((c) => `<button class="mini-action-pill pheno-cat-btn ${c.id === cat ? 'active' : ''}" data-cat="${c.id}" type="button">${esc(getCategoryLabel(c))}</button>`).join('')}
          </div>
          ${ev.modelFamily === 'space-weather' ? `<div style="margin-top:6px;padding:6px 8px;border-radius:8px;background:rgba(16,185,129,0.1);border:1px solid rgba(16,185,129,0.28);font-size:11px;color:var(--text-primary);">${esc(L('⚡ 极光属于空间天气预报（地磁暴 Kp + 极光卵 + 暗夜），独立于植被物候模型。', '⚡ Aurora belongs to Space Weather (Kp index + auroral oval + dark sky), separated from botanical phenology.'))}</div>` : ''}
          <div style="font-size:11.5px;line-height:1.6;margin-top:6px;">
            <div><strong>${esc(L('推荐窗口：', 'Peak Window: '))}</strong>${esc(ev.peakWindowText)}${ev.uncertaintyDays ? ` · ${esc(L('波动区间', 'Uncertainty'))} ±${ev.uncertaintyDays}d` : ''}</div>
            <div>${esc(ev.explanation)}</div>
            <div style="color:var(--text-muted);font-size:11px;margin-top:3px;">${esc(L('数据来源：', 'Provenance: '))}${esc(ev.provenance ? ev.provenance.source : '')} · ${esc(ev.limitations)}</div>
          </div>
          <div style="display:flex;gap:6px;flex-wrap:wrap;margin-top:8px;">
            <button class="mini-action-pill" id="pheno-compare-btn" type="button">⚖ ${esc(L('同类型对比 (2-4城)', 'Compare Destinations (2-4)'))}</button>
          </div>
          ${
            related.length
              ? `
            <div class="related-graph-box">
              <div style="font-size:11px;color:var(--text-secondary);margin-bottom:5px;">${esc(L('地理知识图谱 · 相似或顺路秘境', 'Geo Knowledge Graph · Similar or Nearby Gems'))}</div>
              <div class="related-graph-chips">
                ${related
                  .map(
                    (r) => `
                  <button class="mini-action-pill related-dest-btn" data-id="${esc(r.dest.id)}" type="button">
                    <span>${esc(tx(r.dest.shortName || r.dest.name))}</span>
                    <span style="opacity:0.7;font-size:10.5px;">${esc(translateRelationLabel(r.relationLabel))}</span>
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

      const cmpBtn = containerEl.querySelector('#pheno-compare-btn');
      if (cmpBtn) {
        cmpBtn.addEventListener('click', () => {
          const sims = global.GeoIntelligence && typeof global.GeoIntelligence.findSimilarDestinations === 'function'
            ? global.GeoIntelligence.findSimilarDestinations(dest.id, allDests, { limit: 2, enrichmentMap: enrichmentCache })
            : [];
          const ids = [dest.id, ...sims.map((s) => s.dest.id)];
          if (global.DestCompare && typeof global.DestCompare.open === 'function') {
            global.DestCompare.open(ids);
          } else if (global.LazyLoader && typeof global.LazyLoader.loadScript === 'function') {
            global.LazyLoader.loadScript('js/lazy/dest-compare.js').then(() => {
              if (global.DestCompare) global.DestCompare.open(ids);
            }).catch(() => {});
          }
        });
      }

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
    SUB_CATEGORIES,
    loadEnrichment,
    getEnrichmentMap,
    getValidationSummary,
    getProvenance: (id) => (enrichmentCache && enrichmentCache[id] ? enrichmentCache[id].provenance : null),
    computeGeomagneticLat,
    evaluatePhenology,
    toggleSeasonHeatmap,
    updateSeasonHeatmap,
    isHeatmapEnabled: () => heatState.enabled,
    mountDrawerCard
  };
});
