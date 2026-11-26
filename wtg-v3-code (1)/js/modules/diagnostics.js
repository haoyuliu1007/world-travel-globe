(function (global) {
  'use strict';

  let fps = 60;
  let fpsTimer = null;
  let perfTier = 'auto'; // 'auto' | 'high' | 'balanced' | 'eco'

  function esc(str) {
    return String(str || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  function icon(name, size) {
    return global.AppIcons ? global.AppIcons.svg(name, size || 14) : '';
  }

  function detectEffectiveTier() {
    if (perfTier !== 'auto') return perfTier;
    const mem = (global.navigator && global.navigator.deviceMemory) || 4;
    const cores = (global.navigator && global.navigator.hardwareConcurrency) || 4;
    const reduced = Boolean(global.matchMedia && global.matchMedia('(prefers-reduced-motion: reduce)').matches);
    if (reduced || mem <= 2 || cores <= 2) return 'eco';
    if (mem >= 8 && cores >= 6 && global.innerWidth > 768) return 'high';
    return 'balanced';
  }

  function applyPerformanceTier(tier) {
    perfTier = tier || 'auto';
    const eff = detectEffectiveTier();
    document.documentElement.setAttribute('data-perf-tier', eff);
    const map = typeof global.getGlobeMap === 'function' ? global.getGlobeMap() : null;
    if (map && typeof map.setPixelRatio === 'function') {
      const pr = eff === 'eco' ? 1 : eff === 'balanced' ? Math.min(global.devicePixelRatio || 1, 1.35) : Math.min(global.devicePixelRatio || 1, 2);
      map.setPixelRatio(pr);
    }
  }

  function startFpsMonitor(onTick) {
    stopFpsMonitor();
    let frames = 0;
    let last = performance.now();
    function loop(now) {
      frames++;
      if (now - last >= 1000) {
        fps = Math.round((frames * 1000) / (now - last));
        frames = 0;
        last = now;
        if (typeof onTick === 'function') onTick(fps);
      }
      fpsTimer = requestAnimationFrame(loop);
    }
    fpsTimer = requestAnimationFrame(loop);
  }

  function stopFpsMonitor() {
    if (fpsTimer) cancelAnimationFrame(fpsTimer);
    fpsTimer = null;
  }

  function close() {
    stopFpsMonitor();
    const modal = document.getElementById('diagnostics-modal');
    if (modal) {
      modal.classList.add('is-hidden');
      modal.innerHTML = '';
    }
  }

  async function open() {
    const modal = document.getElementById('diagnostics-modal');
    if (!modal) return;
    modal.classList.remove('is-hidden');

    const navTiming = performance.getEntriesByType && performance.getEntriesByType('navigation')[0];
    const domReadyMs = navTiming ? Math.round(navTiming.domContentLoadedEventEnd) : '--';
    const loadMs = navTiming ? Math.round(navTiming.loadEventEnd || performance.now()) : Math.round(performance.now());
    const memMb = performance.memory ? `${Math.round(performance.memory.usedJSHeapSize / 1048576)} MB` : '浏览器未开放';

    const apiStats = global.ApiClient ? global.ApiClient.getMetrics() : { requests: 0, cacheHits: 0, hitRatePct: 0, errors: 0, bytes: 0 };
    const workerCaps = global.ApiClient ? await global.ApiClient.detectWorkerCapabilities() : { available: false, mode: 'static-direct' };
    const dbStats = global.StorageDB ? await global.StorageDB.getStorageStats() : {};
    const wdConflicts = global.StorageDB ? await global.StorageDB.getAllWikidataConflicts() : [];
    const mlyToken = global.StorageDB ? await global.StorageDB.getSetting('mapillaryToken', '') : '';
    const orsKey = global.StorageDB ? await global.StorageDB.getSetting('orsApiKey', '') : '';

    let auditSummary = null;
    let auditOutliers = [];
    try {
      const res = await fetch('data/audit-report.json');
      if (res.ok) {
        const rep = await res.json();
        auditSummary = rep.summary;
        auditOutliers = (rep.reviewQueue && rep.reviewQueue.distanceOutliers) || [];
      }
    } catch (e) {
      // ignore
    }

    modal.innerHTML = `
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px;">
        <h3 style="margin:0;font-size:15px;">${icon('activity', 16)} 系统性能诊断 · 数据审核队列 · 免费 API 配置</h3>
        <button class="icon-btn" id="diag-close-btn" type="button" aria-label="关闭">${icon('x', 16)}</button>
      </div>

      <div class="weather-kpi-grid" style="margin-bottom:12px;">
        <div class="weather-kpi"><div class="weather-kpi-label">实时帧率 / 档位</div><div class="weather-kpi-val mono-num"><span id="diag-fps">${fps}</span> FPS · ${detectEffectiveTier()}</div></div>
        <div class="weather-kpi"><div class="weather-kpi-label">首屏 DOM / Load</div><div class="weather-kpi-val mono-num">${domReadyMs}ms / ${loadMs}ms</div></div>
        <div class="weather-kpi"><div class="weather-kpi-label">JS 内存占用</div><div class="weather-kpi-val mono-num">${memMb}</div></div>
        <div class="weather-kpi"><div class="weather-kpi-label">API 缓存命中率</div><div class="weather-kpi-val mono-num">${apiStats.hitRatePct}% (${apiStats.cacheHits}/${apiStats.requests})</div></div>
      </div>

      <div class="panel-box" style="padding:12px;">
        <div style="display:flex;justify-content:space-between;align-items:center;gap:8px;flex-wrap:wrap;">
          <strong>性能分级与离线缓存</strong>
          <select id="diag-perf-select" class="sim-input" style="width:150px;">
            <option value="auto" ${perfTier === 'auto' ? 'selected' : ''}>自动识别 (${detectEffectiveTier()})</option>
            <option value="high" ${perfTier === 'high' ? 'selected' : ''}>高画质 (High DPR)</option>
            <option value="balanced" ${perfTier === 'balanced' ? 'selected' : ''}>均衡模式 (Balanced)</option>
            <option value="eco" ${perfTier === 'eco' ? 'selected' : ''}>省电降级 (Eco 1x)</option>
          </select>
        </div>
        <div style="font-size:11.5px;color:var(--text-secondary);margin-top:6px;">
          运行模式：<span class="mono-num">${esc(workerCaps.mode)}</span> · IndexedDB 缓存条目：<span class="mono-num">${dbStats.cacheCount || 0}</span>
          <button class="mini-action-pill" id="diag-clear-cache" type="button" style="margin-left:8px;">清理 API 缓存</button>
        </div>
      </div>

      <div class="panel-box" style="padding:12px;">
        <strong>可选免费 API Token 配置（仅保存于本地浏览器 IndexedDB）</strong>
        <div style="font-size:11px;color:var(--text-muted);margin:4px 0 8px;">
          Open-Meteo、Wikimedia、Wikidata、NASA GIBS 与 OSRM 均无需任何密钥即可使用；如希望启用 Mapillary 街景或 OpenRouteService 备用路由，可填入免费个人 Token：
        </div>
        <div class="form-grid-2">
          <label class="form-field"><span>Mapillary Client Token (街景)</span><input id="diag-mly-token" class="sim-input" type="password" value="${esc(mlyToken)}" placeholder="MLY|..." /></label>
          <label class="form-field"><span>OpenRouteService Key (可选)</span><input id="diag-ors-key" class="sim-input" type="password" value="${esc(orsKey)}" placeholder="5b3ce359..." /></label>
        </div>
        <button class="primary-btn" id="diag-save-keys" type="button" style="margin-top:8px;height:30px;font-size:12px;">保存本地配置</button>
        <span id="diag-save-msg" style="font-size:11px;color:var(--accent-primary);margin-left:8px;"></span>
      </div>

      <div class="panel-box" style="padding:12px;">
        <strong>地理数据核验与人工审核清单（非破坏性，不覆盖原始数据）</strong>
        <div style="font-size:11.5px;color:var(--text-secondary);margin-top:4px;">
          ${auditSummary ? `已审计 ${auditSummary.cities} 座城市 / ${auditSummary.spots} 个机位：重复ID ${auditSummary.duplicateCityIdsCount}，无效坐标 ${auditSummary.invalidCityCoordsCount + auditSummary.invalidSpotCoordsCount}，跨区 >250km 机位 ${auditSummary.distanceOutliersGT250kmCount} 条（多为跨城区域合集）。` : '未加载到 audit-report.json。'}
        </div>
        ${wdConflicts.length ? `<div style="font-size:11.5px;color:#FB7185;margin-top:4px;">Wikidata 运行时坐标差异待核项：${wdConflicts.map((c) => `${esc(c.destId)}(${c.coordDeltaKm}km)`).join(' · ')}</div>` : ''}
        ${
          auditOutliers.length
            ? `<div style="max-height:140px;overflow-y:auto;margin-top:6px;font-size:11px;border-top:1px solid var(--border-hairline);padding-top:6px;">
                ${auditOutliers
                  .slice(0, 12)
                  .map((o) => `<div>• [${esc(o.cityName)}] ${esc(o.spotName)} — 距城心 <span class="mono-num">${o.distanceKm} km</span></div>`)
                  .join('')}
              </div>`
            : ''
        }
      </div>

      <div style="font-size:11px;color:var(--text-muted);line-height:1.55;">
        <strong>开源组件与开放数据授权：</strong>
        MapLibre GL JS v5 (BSD-3-Clause) · SunCalc v2.1.4 (BSD-2-Clause) · Fuse.js v7.5.0 (Apache-2.0) · Supercluster v9.1.0 (ISC) · Dexie.js v4.4.7 (Apache-2.0) · Apache ECharts v6.1.0 (Apache-2.0) · Open-Meteo (CC BY 4.0) · Wikimedia Commons (CC BY/SA) · Wikidata (CC0) · NASA GIBS (Public Domain) · OpenStreetMap / OSRM (ODbL)。
      </div>
    `;

    startFpsMonitor((val) => {
      const f = modal.querySelector('#diag-fps');
      if (f) f.textContent = String(val);
    });

    modal.querySelector('#diag-close-btn').addEventListener('click', close);
    modal.querySelector('#diag-perf-select').addEventListener('change', (e) => {
      applyPerformanceTier(e.target.value);
      open();
    });
    modal.querySelector('#diag-clear-cache').addEventListener('click', async () => {
      if (global.StorageDB) await global.StorageDB.clearApiCache();
      open();
    });
    modal.querySelector('#diag-save-keys').addEventListener('click', async () => {
      if (!global.StorageDB) return;
      await global.StorageDB.setSetting('mapillaryToken', modal.querySelector('#diag-mly-token').value.trim());
      await global.StorageDB.setSetting('orsApiKey', modal.querySelector('#diag-ors-key').value.trim());
      modal.querySelector('#diag-save-msg').textContent = '已保存到本地 IndexedDB';
    });
  }

  global.DiagnosticsModule = {
    open,
    close,
    applyPerformanceTier,
    detectEffectiveTier
  };
})(window);
