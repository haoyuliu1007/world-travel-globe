(function (global) {
  'use strict';

  const GIBS_LAYERS = [
    {
      id: 'VIIRS_SNPP_CorrectedReflectance_TrueColor',
      name: 'VIIRS 每日真彩卫星影像',
      resolution: '375m / 日',
      matrix: 'GoogleMapsCompatible_Level9',
      ext: 'jpg',
      maxZoom: 9,
      desc: 'NASA Suomi-NPP VIIRS 真彩光学反射影像，展示全球云系与地表真实色彩。'
    },
    {
      id: 'MODIS_Terra_CorrectedReflectance_TrueColor',
      name: 'MODIS Terra 历史真彩影像',
      resolution: '250m / 日 (2000年至今)',
      matrix: 'GoogleMapsCompatible_Level9',
      ext: 'jpg',
      maxZoom: 9,
      desc: 'NASA Terra 卫星 250m 分辨率真彩影像，支持跨年份自然地貌对比。'
    },
    {
      id: 'MODIS_Terra_NDSI_Snow_Cover',
      name: '全球积雪覆盖指数 (NDSI)',
      resolution: '500m / 日',
      matrix: 'GoogleMapsCompatible_Level8',
      ext: 'png',
      maxZoom: 8,
      desc: '识别高山、极地及冬季大陆积雪覆盖边界（NDSI）。'
    },
    {
      id: 'MODIS_Terra_NDVI_8Day',
      name: '全球植被绿度变化 (NDVI 8日合成)',
      resolution: '250m / 8日',
      matrix: 'GoogleMapsCompatible_Level9',
      ext: 'png',
      maxZoom: 9,
      desc: '全球植被覆盖与物候绿度变化（需选择对应 8 日合成周期，系统自动对齐最近周期）。'
    },
    {
      id: 'MODIS_Terra_Cloud_Top_Temp_Day',
      name: '白昼云顶温度 / 云层分布',
      resolution: '1km / 日',
      matrix: 'GoogleMapsCompatible_Level6',
      ext: 'png',
      maxZoom: 6,
      desc: '反映全球云系厚度与云顶亮温分布。'
    }
  ];

  let isOpen = false;
  let state = {
    enabled: false,
    layerId: GIBS_LAYERS[0].id,
    dateA: '2025-10-15',
    dateB: '2025-04-15',
    compareMode: false,
    compareMix: 50,
    opacity: 85,
    showTerminator: false,
    latestServerDate: '2025-11-20'
  };
  let serverDateChecked = false;

  function esc(str) {
    return String(str || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  function icon(name, size) {
    return global.AppIcons ? global.AppIcons.svg(name, size || 14) : '';
  }

  function alignNdviDate(dateStr) {
    // MODIS 8-day composites align to day-of-year 1, 9, 17, 25...
    const dt = new Date(`${dateStr}T00:00:00Z`);
    if (Number.isNaN(dt.getTime())) return dateStr;
    const yr = dt.getUTCFullYear();
    const start = Date.UTC(yr, 0, 1);
    const doy = Math.floor((dt.getTime() - start) / 86400000);
    const alignedDoy = Math.floor(doy / 8) * 8;
    const out = new Date(start + alignedDoy * 86400000);
    return out.toISOString().slice(0, 10);
  }

  function buildGibsTileUrl(layerObj, dateStr) {
    const d = layerObj.id.includes('NDVI_8Day') ? alignNdviDate(dateStr) : dateStr;
    return `https://gibs.earthdata.nasa.gov/wmts/epsg3857/best/${layerObj.id}/default/${d}/${layerObj.matrix}/{z}/{y}/{x}.${layerObj.ext}`;
  }

  let latestSyncCtrl = null;

  function L(zh, en) {
    const lang = global.AppI18n && typeof global.AppI18n.getLang === 'function' ? global.AppI18n.getLang() : 'zh-CN';
    if (lang === 'en') return en;
    if (lang === 'zh-TW' && global.AppI18n && typeof global.AppI18n.toTraditional === 'function') {
      return global.AppI18n.toTraditional(zh);
    }
    return zh;
  }

  async function syncLatestGibsDate() {
    if (serverDateChecked) return;
    serverDateChecked = true;
    try {
      if (latestSyncCtrl) latestSyncCtrl.abort();
      latestSyncCtrl = typeof AbortController !== 'undefined' ? new AbortController() : null;
      const res = await fetch('https://gibs.earthdata.nasa.gov/wmts/epsg3857/best/VIIRS_SNPP_CorrectedReflectance_TrueColor/default/2025-10-15/GoogleMapsCompatible_Level9/2/1/2.jpg', {
        method: 'HEAD',
        signal: latestSyncCtrl ? latestSyncCtrl.signal : undefined
      });
      const srvHdr = res.headers.get('date');
      if (srvHdr) {
        const srvDt = new Date(srvHdr);
        if (!Number.isNaN(srvDt.getTime())) {
          srvDt.setUTCDate(srvDt.getUTCDate() - 3);
          const iso = srvDt.toISOString().slice(0, 10);
          state.latestServerDate = iso;
          state.dateA = iso;
          const bDt = new Date(srvDt);
          bDt.setUTCMonth(bDt.getUTCMonth() - 6);
          state.dateB = bDt.toISOString().slice(0, 10);
        }
      }
    } catch (e) {
      // Keep safe 2025-10-15 fallback
    }
  }

  function buildNightTerminatorPolygon(dateObj) {
    if (global.SolarTerminator && typeof global.SolarTerminator.buildTerminatorFeature === 'function') {
      const feat = global.SolarTerminator.buildTerminatorFeature(dateObj || new Date());
      if (feat) {
        return { type: 'FeatureCollection', features: [feat] };
      }
    }
    if (!global.SunCalc) return null;
    // Find subsolar point: where sun altitude is maximum at dateObj
    const dt = dateObj || new Date();
    const minutesUtc = dt.getUTCHours() * 60 + dt.getUTCMinutes() + dt.getUTCSeconds() / 60;
    const subSolarLng = (12 - minutesUtc / 60) * 15;
    // Approximate solar declination from day of year
    const start = Date.UTC(dt.getUTCFullYear(), 0, 0);
    const doy = (dt.getTime() - start) / 86400000;
    const declRad = -23.44 * (Math.PI / 180) * Math.cos((2 * Math.PI / 365) * (doy + 10));

    const coords = [];
    const tanDecl = Math.tan(declRad);
    for (let lng = -180; lng <= 180; lng += 5) {
      const ha = (lng - subSolarLng) * (Math.PI / 180);
      const latRad = Math.atan(-Math.cos(ha) / (tanDecl || 1e-6));
      coords.push([lng, Math.max(-85, Math.min(85, latRad * (180 / Math.PI)))]);
    }
    const nightPole = declRad >= 0 ? -85 : 85;
    const ring = [[ -180, nightPole ], ...coords, [ 180, nightPole ], [ -180, nightPole ]];
    return {
      type: 'FeatureCollection',
      features: [{ type: 'Feature', geometry: { type: 'Polygon', coordinates: [ring] } }]
    };
  }

  function applyLayersToMap() {
    const map = typeof global.getGlobeMap === 'function' ? global.getGlobeMap() : null;
    if (!map || !map.isStyleLoaded()) return;

    const beforeId = map.getLayer('layer-labels') ? 'layer-labels' : undefined;

    ['layer-gibs-a', 'layer-gibs-b', 'layer-terminator'].forEach((lid) => {
      if (map.getLayer(lid)) map.removeLayer(lid);
    });
    ['gibs-src-a', 'gibs-src-b', 'terminator-src'].forEach((sid) => {
      if (map.getSource(sid)) map.removeSource(sid);
    });

    const layerObj = GIBS_LAYERS.find((l) => l.id === state.layerId) || GIBS_LAYERS[0];
    const baseOp = Math.max(0, Math.min(1, state.opacity / 100));

    if (state.enabled) {
      const opA = state.compareMode ? baseOp * (1 - state.compareMix / 100) : baseOp;
      const opB = state.compareMode ? baseOp * (state.compareMix / 100) : 0;

      map.addSource('gibs-src-a', {
        type: 'raster',
        tiles: [buildGibsTileUrl(layerObj, state.dateA)],
        tileSize: 256,
        maxzoom: layerObj.maxZoom,
        attribution: 'NASA EOSDIS GIBS'
      });
      map.addLayer(
        {
          id: 'layer-gibs-a',
          type: 'raster',
          source: 'gibs-src-a',
          paint: { 'raster-opacity': opA, 'raster-fade-duration': 180 }
        },
        beforeId
      );

      if (state.compareMode) {
        map.addSource('gibs-src-b', {
          type: 'raster',
          tiles: [buildGibsTileUrl(layerObj, state.dateB)],
          tileSize: 256,
          maxzoom: layerObj.maxZoom,
          attribution: 'NASA EOSDIS GIBS'
        });
        map.addLayer(
          {
            id: 'layer-gibs-b',
            type: 'raster',
            source: 'gibs-src-b',
            paint: { 'raster-opacity': opB, 'raster-fade-duration': 180 }
          },
          beforeId
        );
      }
    }

    if (state.showTerminator) {
      const fc = buildNightTerminatorPolygon(new Date(`${state.dateA}T12:00:00Z`));
      if (fc) {
        map.addSource('terminator-src', { type: 'geojson', data: fc });
        map.addLayer(
          {
            id: 'layer-terminator',
            type: 'fill',
            source: 'terminator-src',
            paint: { 'fill-color': '#050814', 'fill-opacity': 0.42 }
          },
          beforeId
        );
      }
    }

    const btn = document.getElementById('toggle-timemachine-btn');
    if (btn) btn.classList.toggle('active', state.enabled || state.showTerminator);
  }

  function shiftDate(baseStr, deltaDays) {
    const dt = new Date(`${baseStr}T00:00:00Z`);
    if (Number.isNaN(dt.getTime())) return state.latestServerDate;
    dt.setUTCDate(dt.getUTCDate() + deltaDays);
    return dt.toISOString().slice(0, 10);
  }

  function renderDock() {
    const dock = document.getElementById('timemachine-dock');
    if (!dock) return;
    if (!isOpen) {
      dock.classList.add('is-hidden');
      return;
    }
    dock.classList.remove('is-hidden');

    const layerObj = GIBS_LAYERS.find((l) => l.id === state.layerId) || GIBS_LAYERS[0];

    dock.innerHTML = `
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;">
        <strong style="font-size:13px;">${icon('history', 14)} ${esc(L('地球时光机 · NASA GIBS 遥感', 'Earth Time Machine · NASA GIBS'))}</strong>
        <div style="display:flex;gap:6px;align-items:center;">
          <label style="font-size:11.5px;display:inline-flex;align-items:center;gap:4px;cursor:pointer;">
            <input id="tm-enable-chk" type="checkbox" ${state.enabled ? 'checked' : ''} /> ${esc(L('启用图层', 'Enable Layer'))}
          </label>
          <button class="icon-btn" id="tm-close-btn" type="button" aria-label="${esc(L('关闭', 'Close'))}">${icon('x', 14)}</button>
        </div>
      </div>

      <select id="tm-layer-select" class="sim-input" style="margin-bottom:8px;">
        ${GIBS_LAYERS.map((l) => `<option value="${l.id}" ${l.id === state.layerId ? 'selected' : ''}>${esc(l.name)} (${esc(l.resolution)})</option>`).join('')}
      </select>

      <div style="font-size:11px;color:var(--text-secondary);margin-bottom:8px;line-height:1.45;">
        ${esc(layerObj.desc)}<br/>
        <span class="source-tag realtime">${esc(L('来源：NASA EOSDIS GIBS (Public Domain)', 'Source: NASA EOSDIS GIBS (Public Domain)'))}</span> · <span class="mono-num">${esc(L('分辨率', 'Res'))} ${esc(layerObj.resolution)}</span>
        <div style="color:var(--text-muted);margin-top:2px;">${esc(L('说明：卫星过境受云层与高纬极夜影响，局部日期可能存在黑色空窗条带（绝不插值伪造影像）。', 'Note: Swath gaps or high-latitude polar night blackout strips reflect real satellite coverage (never interpolated).'))}</div>
      </div>

      <div class="form-grid-2" style="margin-bottom:8px;">
        <label class="form-field">
          <span>${esc(L('影像日期 A', 'Date A'))}</span>
          <input id="tm-date-a" class="sim-input mono-num" type="date" max="${state.latestServerDate}" value="${state.dateA}" />
        </label>
        <label class="form-field">
          <span>${esc(L('透明度', 'Opacity'))} (${state.opacity}%)</span>
          <input id="tm-opacity" type="range" min="10" max="100" value="${state.opacity}" style="margin-top:8px;" />
        </label>
      </div>

      <div style="margin-bottom:8px;">
        <div style="font-size:11px;color:var(--text-muted);margin-bottom:4px;">${esc(L('时间轴快捷跳转（相对最新可用影像）', 'Quick Time Jumps (vs latest pass)'))}</div>
        <div style="display:flex;gap:5px;flex-wrap:wrap;">
          <button class="mini-action-pill tm-jump-btn" data-days="0" type="button">${esc(L('最新', 'Latest'))}</button>
          <button class="mini-action-pill tm-jump-btn" data-days="-30" type="button">${esc(L('1月前', '1 Mo Ago'))}</button>
          <button class="mini-action-pill tm-jump-btn" data-days="-90" type="button">${esc(L('上季', '1 Qtr Ago'))}</button>
          <button class="mini-action-pill tm-jump-btn" data-days="-180" type="button">${esc(L('半年前', '6 Mo Ago'))}</button>
          <button class="mini-action-pill tm-jump-btn" data-days="-365" type="button">${esc(L('1年前', '1 Yr Ago'))}</button>
          <button class="mini-action-pill tm-jump-btn" data-days="-1825" type="button">${esc(L('5年前', '5 Yr Ago'))}</button>
        </div>
      </div>

      <div style="padding-top:8px;border-top:1px solid var(--border-hairline);display:flex;justify-content:space-between;align-items:center;gap:6px;flex-wrap:wrap;">
        <label style="font-size:11.5px;display:inline-flex;align-items:center;gap:4px;cursor:pointer;">
          <input id="tm-compare-chk" type="checkbox" ${state.compareMode ? 'checked' : ''} /> ${esc(L('双日期对比', 'Dual Compare'))}
        </label>
        <label style="font-size:11.5px;display:inline-flex;align-items:center;gap:4px;cursor:pointer;">
          <input id="tm-term-chk" type="checkbox" ${state.showTerminator ? 'checked' : ''} /> ${esc(L('晨昏昼夜线', 'Terminator'))}
        </label>
      </div>

      ${
        state.compareMode
          ? `<div style="margin-top:8px;padding:8px;border-radius:8px;background:var(--bg-hover);">
              <div class="form-grid-2">
                <label class="form-field"><span>${esc(L('对比日期 B', 'Date B'))}</span><input id="tm-date-b" class="sim-input mono-num" type="date" max="${state.latestServerDate}" value="${state.dateB}" /></label>
                <label class="form-field"><span>${esc(L('分屏卷帘 / 混合', 'Blend'))} (${state.compareMix}%)</span><input id="tm-mix-range" type="range" min="0" max="100" value="${state.compareMix}" style="margin-top:8px;" /></label>
              </div>
              <div style="margin-top:6px;display:flex;justify-content:space-between;font-size:10.5px;color:var(--text-muted);">
                <span>A: ${esc(state.dateA)} (${100 - state.compareMix}%)</span>
                <span>◀ ${esc(L('分屏对比卷帘', 'Split Compare'))} ▶</span>
                <span>B: ${esc(state.dateB)} (${state.compareMix}%)</span>
              </div>
            </div>`
          : ''
      }
    `;

    dock.querySelector('#tm-close-btn').addEventListener('click', () => {
      isOpen = false;
      renderDock();
    });
    dock.querySelector('#tm-enable-chk').addEventListener('change', (e) => {
      state.enabled = e.target.checked;
      applyLayersToMap();
    });
    dock.querySelector('#tm-layer-select').addEventListener('change', (e) => {
      state.layerId = e.target.value;
      state.enabled = true;
      renderDock();
      applyLayersToMap();
    });
    dock.querySelector('#tm-date-a').addEventListener('change', (e) => {
      if (e.target.value) {
        state.dateA = e.target.value;
        state.enabled = true;
        renderDock();
        applyLayersToMap();
      }
    });
    dock.querySelector('#tm-opacity').addEventListener('input', (e) => {
      state.opacity = Number(e.target.value);
      applyLayersToMap();
    });
    dock.querySelector('#tm-compare-chk').addEventListener('change', (e) => {
      state.compareMode = e.target.checked;
      state.enabled = true;
      renderDock();
      applyLayersToMap();
    });
    dock.querySelector('#tm-term-chk').addEventListener('change', (e) => {
      state.showTerminator = e.target.checked;
      applyLayersToMap();
    });

    const dateBEl = dock.querySelector('#tm-date-b');
    const mixEl = dock.querySelector('#tm-mix-range');
    if (dateBEl) {
      dateBEl.addEventListener('change', (e) => {
        if (e.target.value) {
          state.dateB = e.target.value;
          applyLayersToMap();
        }
      });
    }
    if (mixEl) {
      mixEl.addEventListener('input', (e) => {
        state.compareMix = Number(e.target.value);
        applyLayersToMap();
      });
    }

    dock.querySelectorAll('.tm-jump-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        const d = Number(btn.dataset.days);
        state.dateA = shiftDate(state.latestServerDate, d);
        state.enabled = true;
        renderDock();
        applyLayersToMap();
      });
    });
  }

  async function toggleDock() {
    isOpen = !isOpen;
    if (isOpen) {
      await syncLatestGibsDate();
      if (!state.enabled) state.enabled = true;
      applyLayersToMap();
    }
    renderDock();
  }

  global.EarthTimeMachine = {
    GIBS_LAYERS,
    toggleDock,
    applyLayersToMap,
    buildNightTerminatorPolygon
  };
})(window);
