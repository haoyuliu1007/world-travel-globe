(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory(typeof globalThis !== 'undefined' ? globalThis : root);
  } else {
    root.AestheticIndex = factory(root);
  }
})(typeof window !== 'undefined' ? window : globalThis, function (global) {
  'use strict';

  const DEFAULT_WEIGHTS = {
    tempComfort: 18,
    precipScore: 14,
    clearSkyScore: 16,
    lightCloudScore: 16,
    landscapeSeason: 22,
    phenologySnowVeg: 14,
    costCrowd: 0
  };

  const PRESETS = {
    balanced: { label: '综合追美', weights: Object.assign({}, DEFAULT_WEIGHTS) },
    photo: {
      label: '风光摄影',
      weights: { tempComfort: 8, precipScore: 12, clearSkyScore: 22, lightCloudScore: 26, landscapeSeason: 20, phenologySnowVeg: 12, costCrowd: 0 }
    },
    comfort: {
      label: '舒适度假',
      weights: { tempComfort: 30, precipScore: 24, clearSkyScore: 16, lightCloudScore: 8, landscapeSeason: 14, phenologySnowVeg: 8, costCrowd: 10 }
    },
    snowAurora: {
      label: '冰雪极光',
      weights: { tempComfort: 6, precipScore: 10, clearSkyScore: 20, lightCloudScore: 16, landscapeSeason: 20, phenologySnowVeg: 28, costCrowd: 0 }
    }
  };

  let activeWeights = Object.assign({}, DEFAULT_WEIGHTS);
  let activeMonth = new Date().getMonth() + 1;
  let activeContinent = 'global';
  let loadedSaved = false;

  async function ensureWeightsLoaded() {
    if (loadedSaved || !global.StorageDB) return;
    loadedSaved = true;
    try {
      const saved = await global.StorageDB.getSetting('aestheticWeights', null);
      if (saved && typeof saved === 'object') {
        activeWeights = Object.assign({}, DEFAULT_WEIGHTS, saved);
      }
    } catch (e) {
      // ignore
    }
  }

  function parseTempRangeMean(tempStr) {
    if (!tempStr) return null;
    const nums = String(tempStr).match(/-?\d+(?:\.\d+)?/g);
    if (!nums || !nums.length) return null;
    const vals = nums.map(Number).filter(Number.isFinite);
    if (!vals.length) return null;
    return vals.reduce((a, b) => a + b, 0) / vals.length;
  }

  function computeGoldenHourMinutes(lat, lng, monthNum, sunCalcRef) {
    const SC = sunCalcRef || global.SunCalc;
    if (!SC || !Number.isFinite(lat) || !Number.isFinite(lng)) return 55;
    try {
      const dt = new Date(Date.UTC(2026, monthNum - 1, 15, 12, 0, 0));
      const t = SC.getTimes(dt, lat, lng);
      if (t.sunrise instanceof Date && t.goldenHourEnd instanceof Date && !Number.isNaN(t.sunrise.getTime()) && !Number.isNaN(t.goldenHourEnd.getTime())) {
        const mins = Math.abs(t.goldenHourEnd.getTime() - t.sunrise.getTime()) / 60000;
        if (Number.isFinite(mins) && mins > 5 && mins < 240) return Math.round(mins);
      }
    } catch (e) {
      // fallback
    }
    return 55;
  }

  function computeDestinationIndex(dest, monthNum, customWeights, climateMonthly, sunCalcRef) {
    const m = Math.max(1, Math.min(12, Number(monthNum) || 1));
    const w = Object.assign({}, activeWeights, customWeights || {});
    const tags = Array.isArray(dest.weatherTags) ? dest.weatherTags : [];
    const monthObj = Array.isArray(dest.months) ? dest.months.find((x) => x.m === m) : null;
    const rawScore = monthObj
      ? Number(monthObj.score) || 3
      : Array.isArray(dest.monthScores)
        ? Number(dest.monthScores[m - 1]) || 3
        : 3;

    const clim = Array.isArray(climateMonthly) ? climateMonthly[m - 1] : null;
    const lat = Array.isArray(dest.coords) ? Number(dest.coords[1]) : 30;
    const lng = Array.isArray(dest.coords) ? Number(dest.coords[0]) : 0;

    // 1. Temperature comfort
    let tempMean = clim ? clim.tempMean : parseTempRangeMean(monthObj && monthObj.temp);
    let tempSource = clim ? 'realtime' : 'empirical';
    if (tempMean === null) {
      // Fallback latitude seasonal estimate (honestly marked empirical)
      const hemiSign = lat >= 0 ? 1 : -1;
      const seasonWave = Math.cos(((m - (hemiSign > 0 ? 7 : 1)) / 12) * Math.PI * 2);
      tempMean = Math.round(28 - Math.abs(lat) * 0.48 + seasonWave * (Math.abs(lat) * 0.22));
    }
    const idealTemp = tags.includes('snow') && rawScore >= 4 ? 0 : 20;
    const tempComfort = Math.max(25, Math.min(100, Math.round(100 - Math.abs(tempMean - idealTemp) * 2.4)));

    // 2. Precipitation suitability
    let precipScore = 70;
    let precipSource = 'empirical';
    if (clim) {
      precipSource = 'realtime';
      precipScore = tags.includes('rain')
        ? Math.min(100, Math.round(55 + clim.rainProbPct * 0.6))
        : Math.max(20, Math.round(100 - clim.rainProbPct * 0.95));
    } else {
      const rainTxt = String((monthObj && monthObj.rain) || '');
      const mmMatch = rainTxt.match(/(\d+)\s*mm/i);
      if (mmMatch) {
        const mm = Number(mmMatch[1]);
        precipScore = tags.includes('rain')
          ? Math.min(100, Math.round(62 + Math.min(mm, 200) * 0.16))
          : Math.max(25, Math.round(100 - Math.min(mm, 280) * 0.24));
      } else {
        precipScore = 50 + rawScore * 9;
      }
    }

    // 3. Clear sky probability
    let clearSkyScore = Math.min(100, 42 + rawScore * 10 + (tags.includes('sunny') ? 8 : 0));
    let clearSource = 'empirical';
    if (clim) {
      clearSource = 'realtime';
      clearSkyScore = Math.max(25, Math.min(100, Math.round(35 + clim.clearProbPct * 0.72)));
    }

    // 4. Light & Golden hour quality (SunCalc astronomy + optional Open-Meteo sunshine)
    const goldenMin = computeGoldenHourMinutes(lat, lng, m, sunCalcRef);
    const astroBonus = Math.min(100, Math.round(55 + Math.min(goldenMin, 95) * 0.45));
    const lightCloudScore = clim
      ? Math.round(astroBonus * 0.55 + Math.min(100, clim.sunshineHours / 2.6) * 0.45)
      : astroBonus;
    const lightSource = clim ? 'realtime' : 'astronomy';

    // 5. Seasonal landscape score
    const landscapeSeason = Math.max(20, Math.min(100, Math.round(rawScore * 18 + (dest.allWeather ? 10 : 0))));

    // 6. Phenology / Snow / Vegetation
    let phenologySnowVeg = Math.max(30, Math.round(rawScore * 16 + (tags.includes('special') ? 12 : 6)));
    let phenoSource = 'empirical';
    if (clim && tags.includes('snow')) {
      phenologySnowVeg = Math.max(35, Math.min(100, Math.round(50 + clim.snowProbPct * 0.9)));
      phenoSource = 'realtime';
    } else if (monthObj && /樱|枫|秋|雪|冰|极光|花|雾|银河|星|日出/.test(monthObj.highlight || '')) {
      phenologySnowVeg = Math.min(100, phenologySnowVeg + 12);
    }

    // 7. Cost / Crowd (estimated only; excluded unless user enables weight > 0)
    const costCrowd = Math.max(35, Math.min(95, rawScore <= 3 ? 82 : rawScore === 4 ? 68 : 54));

    const dims = [
      { key: 'tempComfort', label: '气温舒适度', score: tempComfort, weight: w.tempComfort, source: tempSource },
      { key: 'precipScore', label: '降水适配度', score: precipScore, weight: w.precipScore, source: precipSource },
      { key: 'clearSkyScore', label: '晴天概率', score: clearSkyScore, weight: w.clearSkyScore, source: clearSource },
      { key: 'lightCloudScore', label: '黄金光影时长', score: lightCloudScore, weight: w.lightCloudScore, source: lightSource },
      { key: 'landscapeSeason', label: '季节景观峰度', score: landscapeSeason, weight: w.landscapeSeason, source: 'empirical' },
      { key: 'phenologySnowVeg', label: '植被积雪物候', score: phenologySnowVeg, weight: w.phenologySnowVeg, source: phenoSource },
      { key: 'costCrowd', label: '错峰性价比(估算)', score: costCrowd, weight: w.costCrowd, source: 'estimated' }
    ];

    let totalWeight = 0;
    let weightedSum = 0;
    for (const d of dims) {
      if (d.weight > 0) {
        totalWeight += d.weight;
        weightedSum += d.score * d.weight;
      }
    }
    const total = totalWeight > 0 ? Math.round(weightedSum / totalWeight) : Math.round(rawScore * 20);
    const stars = total >= 88 ? 5 : total >= 76 ? 4 : total >= 62 ? 3 : total >= 46 ? 2 : 1;

    return {
      total,
      stars,
      month: m,
      dimensions: dims
    };
  }

  function sourceBadgeHtml(src) {
    if (src === 'realtime') return '<span class="source-tag realtime">ERA5 再分析气候</span>';
    if (src === 'astronomy') return '<span class="source-tag astronomy">SunCalc 天文</span>';
    if (src === 'estimated') return '<span class="source-tag empirical">参考估算 · 非实时</span>';
    return '<span class="source-tag empirical">实地档案经验</span>';
  }

  async function mountDrawerBreakdown(dest, monthNum, containerEl) {
    if (!dest || !containerEl) return;
    await ensureWeightsLoaded();

    let climateMonthly = null;
    if (global.StorageDB && Array.isArray(dest.coords)) {
      const cacheKey = `om:climate5y:${Number(dest.coords[1]).toFixed(2)},${Number(dest.coords[0]).toFixed(2)}`;
      const cached = await global.StorageDB.getCache(cacheKey);
      if (cached && Array.isArray(cached.data)) climateMonthly = cached.data;
    }

    if (!document.body.contains(containerEl)) return;
    const res = computeDestinationIndex(dest, monthNum, activeWeights, climateMonthly);

    containerEl.innerHTML = `
      <div class="index-breakdown-card">
        <div style="display:flex;justify-content:space-between;align-items:center;gap:8px;flex-wrap:wrap;">
          <strong>全球追美指数 · ${res.month} 月评分依据</strong>
          <span class="mono-num" style="font-size:15px;font-weight:700;color:var(--accent-primary);">${res.total} / 100 (${res.stars}★)</span>
        </div>
        <div style="font-size:11px;color:var(--text-muted);margin-top:4px;">
          严格区分 Open-Meteo ERA5 再分析气候、SunCalc 天文光影与人工实地档案；未缓存历史气候时点击「气候」页签可加载 5 年再分析网格均值。
        </div>
        ${res.dimensions
          .map(
            (d) => `
          <div class="dim-row">
            <div class="dim-row-top">
              <span>${d.label} ${sourceBadgeHtml(d.source)}</span>
              <span class="mono-num">${d.score}分 · 权重${d.weight}</span>
            </div>
            <div class="dim-bar-track"><div class="dim-bar-fill" style="width:${d.score}%"></div></div>
          </div>
        `
          )
          .join('')}
      </div>
    `;
  }

  async function renderGlobalRanking(gridEl, allList, onSelectFn) {
    if (!gridEl) return;
    await ensureWeightsLoaded();

    const scoped = activeContinent === 'global'
      ? allList
      : allList.filter((d) => d.continent === activeContinent);

    const ranked = scoped
      .map((dest) => {
        const idx = computeDestinationIndex(dest, activeMonth, activeWeights, null);
        return { dest, idx };
      })
      .sort((a, b) => b.idx.total - a.idx.total);

    const esc = (s) => String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

    const weightSliders = [
      ['tempComfort', '气温舒适'],
      ['precipScore', '降水适配'],
      ['clearSkyScore', '晴天概率'],
      ['lightCloudScore', '黄金光影'],
      ['landscapeSeason', '景观峰度'],
      ['phenologySnowVeg', '物候积雪'],
      ['costCrowd', '错峰估算']
    ]
      .map(
        ([k, lbl]) => `
      <label style="display:flex;align-items:center;gap:6px;font-size:11px;">
        <span style="min-width:60px;">${lbl}</span>
        <input class="idx-weight-slider" data-wkey="${k}" type="range" min="0" max="40" value="${activeWeights[k]}" style="flex:1;" />
        <span class="mono-num" style="min-width:22px;text-align:right;">${activeWeights[k]}</span>
      </label>
    `
      )
      .join('');

    const rowsHtml = ranked
      .slice(0, 48)
      .map(
        (item, i) => `
        <button class="gallery-card idx-rank-card" data-id="${esc(item.dest.id)}" type="button" style="text-align:left;">
          <div class="gallery-card-top">
            <span class="mono-num" style="color:var(--accent-primary);font-weight:700;">#${i + 1} · ${item.idx.total} 分</span>
            <span class="gallery-card-coords">${esc(item.dest.country)}</span>
          </div>
          <h3 class="gallery-card-title">${esc(item.dest.name)}</h3>
          <p class="gallery-card-sub">${esc(item.dest.subtitle || item.dest.heroSummary)}</p>
          <div class="gallery-card-foot">
            <span class="mono-num">${item.idx.month}月 · ${'★'.repeat(item.idx.stars)}</span>
            <span class="gallery-card-cta">飞往坐标 →</span>
          </div>
        </button>
      `
      )
      .join('');

    gridEl.innerHTML = `
      <div class="panel-box" style="grid-column:1 / -1;">
        <div style="display:flex;justify-content:space-between;align-items:center;gap:10px;flex-wrap:wrap;margin-bottom:10px;">
          <div>
            <h3 style="margin:0;">全球追美指数引擎 · ${activeMonth} 月综合推荐榜 (共 ${ranked.length} 座)</h3>
            <div style="font-size:11.5px;color:var(--text-muted);margin-top:2px;">支持自定义 7 维权重；气温/光影结合 SunCalc 与实地物候档案，错峰成本为参考估算。</div>
          </div>
          <div style="display:flex;gap:6px;flex-wrap:wrap;">
            <select id="idx-month-select" class="sim-input" style="width:92px;">
              ${Array.from({ length: 12 }, (_, m) => `<option value="${m + 1}" ${activeMonth === m + 1 ? 'selected' : ''}>${m + 1} 月</option>`).join('')}
            </select>
            <select id="idx-cont-select" class="sim-input" style="width:110px;">
              <option value="global" ${activeContinent === 'global' ? 'selected' : ''}>全球大洲</option>
              <option value="asia" ${activeContinent === 'asia' ? 'selected' : ''}>亚洲</option>
              <option value="europe" ${activeContinent === 'europe' ? 'selected' : ''}>欧洲</option>
              <option value="oceania" ${activeContinent === 'oceania' ? 'selected' : ''}>大洋洲</option>
              <option value="north_america" ${activeContinent === 'north_america' ? 'selected' : ''}>北美洲</option>
              <option value="south_america" ${activeContinent === 'south_america' ? 'selected' : ''}>南美洲</option>
              <option value="africa_antarctica" ${activeContinent === 'africa_antarctica' ? 'selected' : ''}>非洲 / 南极</option>
            </select>
          </div>
        </div>
        <div style="display:flex;gap:6px;flex-wrap:wrap;margin-bottom:10px;">
          ${Object.keys(PRESETS)
            .map((pk) => `<button class="mini-action-pill idx-preset-btn" data-preset="${pk}" type="button">${PRESETS[pk].label}</button>`)
            .join('')}
        </div>
        <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(210px,1fr));gap:8px;">
          ${weightSliders}
        </div>
      </div>
      ${rowsHtml}
    `;

    gridEl.querySelector('#idx-month-select').addEventListener('change', (e) => {
      activeMonth = Number(e.target.value);
      renderGlobalRanking(gridEl, allList, onSelectFn);
    });
    gridEl.querySelector('#idx-cont-select').addEventListener('change', (e) => {
      activeContinent = e.target.value;
      renderGlobalRanking(gridEl, allList, onSelectFn);
    });
    gridEl.querySelectorAll('.idx-preset-btn').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const p = PRESETS[btn.dataset.preset];
        if (!p) return;
        activeWeights = Object.assign({}, p.weights);
        if (global.StorageDB) await global.StorageDB.setSetting('aestheticWeights', activeWeights);
        renderGlobalRanking(gridEl, allList, onSelectFn);
      });
    });
    gridEl.querySelectorAll('.idx-weight-slider').forEach((inp) => {
      inp.addEventListener('change', async (e) => {
        activeWeights[e.target.dataset.wkey] = Number(e.target.value);
        if (global.StorageDB) await global.StorageDB.setSetting('aestheticWeights', activeWeights);
        renderGlobalRanking(gridEl, allList, onSelectFn);
      });
    });
    gridEl.querySelectorAll('.idx-rank-card').forEach((card) => {
      card.addEventListener('click', () => {
        if (typeof onSelectFn === 'function') onSelectFn(card.dataset.id);
      });
    });
  }

  return {
    DEFAULT_WEIGHTS,
    PRESETS,
    computeDestinationIndex,
    mountDrawerBreakdown,
    renderGlobalRanking
  };
});
