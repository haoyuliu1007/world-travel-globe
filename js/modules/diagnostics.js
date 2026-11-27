(function (global) {
  'use strict';

  const TIER_PRESETS = {
    high: { tier: 'high', maxPixelRatio: 2, maxLabels: 110, starDensity: 1.0, tileCacheSize: 384, allow3DBuildings: true },
    balanced: { tier: 'balanced', maxPixelRatio: 1.35, maxLabels: 65, starDensity: 0.65, tileCacheSize: 256, allow3DBuildings: true },
    eco: { tier: 'eco', maxPixelRatio: 1, maxLabels: 32, starDensity: 0.35, tileCacheSize: 128, allow3DBuildings: false }
  };

  let fps = 60;
  let fpsTimer = null;
  let watchdogTimer = null;
  let lowFpsStreak = 0;
  let perfTier = 'auto'; // 'auto' | 'high' | 'balanced' | 'eco'
  let autoForcedDowngrade = null;

  function esc(str) {
    return String(str || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  function icon(name, size) {
    return global.AppIcons ? global.AppIcons.svg(name, size || 14) : '';
  }

  function L(zh, en) {
    const lang = global.AppI18n && typeof global.AppI18n.getLang === 'function' ? global.AppI18n.getLang() : 'zh-CN';
    if (lang === 'en') return en;
    if (lang === 'zh-TW' && global.AppI18n && typeof global.AppI18n.toTraditional === 'function') {
      return global.AppI18n.toTraditional(zh);
    }
    return zh;
  }

  function detectEffectiveTier() {
    if (perfTier !== 'auto') return perfTier;
    if (autoForcedDowngrade) return autoForcedDowngrade;
    const mem = (global.navigator && global.navigator.deviceMemory) || 4;
    const cores = (global.navigator && global.navigator.hardwareConcurrency) || 4;
    const reduced = Boolean(global.matchMedia && global.matchMedia('(prefers-reduced-motion: reduce)').matches);
    if (reduced || mem <= 2 || cores <= 2) return 'eco';
    if (mem >= 8 && cores >= 6 && global.innerWidth > 768) return 'high';
    return 'balanced';
  }

  function getPerfConfig() {
    const eff = detectEffectiveTier();
    return Object.assign({}, TIER_PRESETS[eff] || TIER_PRESETS.balanced, { mode: perfTier });
  }

  function applyPerformanceTier(tier) {
    perfTier = tier || 'auto';
    if (perfTier !== 'auto') autoForcedDowngrade = null;
    const cfg = getPerfConfig();
    if (typeof document !== 'undefined' && document.documentElement) {
      document.documentElement.setAttribute('data-perf-tier', cfg.tier);
    }
    global.__wtgPerfConfig = cfg;

    const map = typeof global.getGlobeMap === 'function' ? global.getGlobeMap() : null;
    if (map) {
      if (typeof map.setPixelRatio === 'function') {
        map.setPixelRatio(Math.min(global.devicePixelRatio || 1, cfg.maxPixelRatio));
      }
      if (!cfg.allow3DBuildings && global.Terrain3DModule && global.Terrain3DModule.getState().buildings) {
        global.Terrain3DModule.toggleBuildings(map, false);
      }
    }
    if (typeof global.dispatchEvent === 'function' && typeof global.CustomEvent === 'function') {
      try {
        global.dispatchEvent(new global.CustomEvent('wtg:perfchange', { detail: cfg }));
      } catch (e) {
        // ignore
      }
    }
    return cfg;
  }

  function startWatchdog() {
    if (watchdogTimer || typeof requestAnimationFrame !== 'function' || typeof performance === 'undefined') return;
    let frames = 0;
    let last = performance.now();
    const tick = (now) => {
      if (typeof document !== 'undefined' && document.hidden) {
        frames = 0;
        last = now;
        watchdogTimer = requestAnimationFrame(tick);
        return;
      }
      frames++;
      if (now - last >= 1000) {
        fps = Math.round((frames * 1000) / (now - last));
        frames = 0;
        last = now;
        if (perfTier === 'auto') {
          if (fps > 0 && fps < 22) {
            lowFpsStreak++;
            if (lowFpsStreak >= 4) {
              const cur = detectEffectiveTier();
              if (cur === 'high') autoForcedDowngrade = 'balanced';
              else if (cur === 'balanced') autoForcedDowngrade = 'eco';
              lowFpsStreak = 0;
              if (detectEffectiveTier() !== cur) applyPerformanceTier('auto');
            }
          } else {
            lowFpsStreak = 0;
          }
        }
      }
      watchdogTimer = requestAnimationFrame(tick);
    };
    watchdogTimer = requestAnimationFrame(tick);
  }

  function startFpsMonitor(onTick) {
    stopFpsMonitor();
    let frames = 0;
    let last = performance.now();
    function loop(now) {
      if (typeof document !== 'undefined' && document.hidden) {
        frames = 0;
        last = now;
      } else {
        frames++;
        if (now - last >= 1000) {
          fps = Math.round((frames * 1000) / (now - last));
          frames = 0;
          last = now;
          if (typeof onTick === 'function') onTick(fps);
        }
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

  function statusBadgeColor(status) {
    if (status === 'ok') return '#34D399';
    if (status === 'degraded' || status === 'cached') return '#FBBF24';
    if (status === 'unavailable' || status === 'error') return '#FB7185';
    return '#94A3B8';
  }

  async function open() {
    const modal = document.getElementById('diagnostics-modal');
    if (!modal) return;
    modal.classList.remove('is-hidden');

    const navTiming = performance.getEntriesByType && performance.getEntriesByType('navigation')[0];
    const domReadyMs = navTiming ? Math.round(navTiming.domContentLoadedEventEnd) : '--';
    const loadMs = navTiming ? Math.round(navTiming.loadEventEnd || performance.now()) : Math.round(performance.now());
    const memMb = performance.memory ? `${Math.round(performance.memory.usedJSHeapSize / 1048576)} MB` : L('浏览器未开放', 'Unavailable');

    const apiStats = global.ApiClient ? global.ApiClient.getMetrics() : { requests: 0, cacheHits: 0, hitRatePct: 0, errors: 0, bytes: 0 };
    const serviceHealth = global.ApiClient && typeof global.ApiClient.getServiceHealth === 'function'
      ? global.ApiClient.getServiceHealth()
      : [];
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

    const effCfg = getPerfConfig();
    const healthRowsHtml = serviceHealth.map((s) => `
      <div style="display:flex;justify-content:space-between;align-items:center;padding:3px 6px;border-radius:6px;background:rgba(255,255,255,0.03);font-size:11px;">
        <span>${esc(s.label)}</span>
        <span class="mono-num" style="color:${statusBadgeColor(s.status)};">${esc(s.status)} · ${esc(s.freshness)}${s.latencyMs ? ` (${s.latencyMs}ms)` : ''}</span>
      </div>
    `).join('');

    modal.innerHTML = `
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px;">
        <h3 style="margin:0;font-size:15px;">${icon('activity', 16)} ${esc(L('系统性能诊断 · 数据审核 · 上游健康状态', 'System Diagnostics · Data Audit · Service Health'))}</h3>
        <button class="icon-btn" id="diag-close-btn" type="button" aria-label="${esc(L('关闭', 'Close'))}">${icon('x', 16)}</button>
      </div>

      <div class="weather-kpi-grid" style="margin-bottom:12px;">
        <div class="weather-kpi"><div class="weather-kpi-label">${esc(L('实时帧率 / 档位', 'Live FPS / Tier'))}</div><div class="weather-kpi-val mono-num"><span id="diag-fps">${fps}</span> FPS · <span id="diag-eff-tier">${effCfg.tier}</span></div></div>
        <div class="weather-kpi"><div class="weather-kpi-label">${esc(L('首屏 DOM / Load', 'DOM / Load'))}</div><div class="weather-kpi-val mono-num">${domReadyMs}ms / ${loadMs}ms</div></div>
        <div class="weather-kpi"><div class="weather-kpi-label">${esc(L('JS 内存占用', 'JS Heap'))}</div><div class="weather-kpi-val mono-num">${esc(memMb)}</div></div>
        <div class="weather-kpi"><div class="weather-kpi-label">${esc(L('API 缓存命中率', 'API Cache Hit'))}</div><div class="weather-kpi-val mono-num">${apiStats.hitRatePct}% (${apiStats.cacheHits}/${apiStats.requests})</div></div>
      </div>

      <div class="panel-box" style="padding:12px;">
        <div style="display:flex;justify-content:space-between;align-items:center;gap:8px;flex-wrap:wrap;">
          <strong>${esc(L('自适应渲染档位与缓存', 'Adaptive Rendering & Offline Cache'))}</strong>
          <select id="diag-perf-select" class="sim-input" style="width:185px;">
            <option value="auto" ${perfTier === 'auto' ? 'selected' : ''}>${esc(L(`自动识别 (${effCfg.tier})`, `Auto (${effCfg.tier})`))}</option>
            <option value="high" ${perfTier === 'high' ? 'selected' : ''}>${esc(L('高画质 (DPR 2x · 110 标签)', 'High (DPR 2x · 110 labels)'))}</option>
            <option value="balanced" ${perfTier === 'balanced' ? 'selected' : ''}>${esc(L('均衡模式 (DPR 1.35x · 65 标签)', 'Balanced (1.35x · 65 labels)'))}</option>
            <option value="eco" ${perfTier === 'eco' ? 'selected' : ''}>${esc(L('省电降级 (DPR 1x · 32 标签)', 'Eco (1x · 32 labels)'))}</option>
          </select>
        </div>
        <div style="font-size:11.5px;color:var(--text-secondary);margin-top:6px;">
          ${esc(L('运行模式', 'Runtime'))}: <span class="mono-num">${esc(workerCaps.mode)}</span> · ${esc(L('缓存条目', 'Cached Entries'))}: <span class="mono-num">${dbStats.cacheCount || 0}</span> · ${esc(L('标签上限', 'Label Budget'))}: <span class="mono-num">${effCfg.maxLabels}</span>
          <button class="mini-action-pill" id="diag-clear-cache" type="button" style="margin-left:8px;">${esc(L('清理 API 缓存', 'Clear API Cache'))}</button>
        </div>
      </div>

      ${serviceHealth.length ? `
      <div class="panel-box" style="padding:12px;">
        <strong>${esc(L('11 路公开数据源实时状态', '11 Upstream Data Services Health'))}</strong>
        <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(230px,1fr));gap:5px;margin-top:8px;">
          ${healthRowsHtml}
        </div>
      </div>` : ''}

      <div class="panel-box" style="padding:12px;">
        <strong>${esc(L('可选免费 API Token（仅保存于本地 IndexedDB）', 'Optional Free API Tokens (Local IndexedDB Only)'))}</strong>
        <div style="font-size:11px;color:var(--text-muted);margin:4px 0 8px;">
          ${esc(L(
            'Open-Meteo、Wikimedia、Wikidata、NASA GIBS/EPIC、Panoramax 与 OSRM 均无需密钥即可使用；如需启用 Mapillary 或 OpenRouteService 可在此填入个人 Token：',
            'Open-Meteo, Wikimedia, Wikidata, NASA GIBS/EPIC, Panoramax & OSRM work key-free. Optional tokens below stay strictly local:'
          ))}
        </div>
        <div class="form-grid-2">
          <label class="form-field"><span>Mapillary Client Token</span><input id="diag-mly-token" class="sim-input" type="password" value="${esc(mlyToken)}" placeholder="MLY|..." /></label>
          <label class="form-field"><span>OpenRouteService Key</span><input id="diag-ors-key" class="sim-input" type="password" value="${esc(orsKey)}" placeholder="5b3ce359..." /></label>
        </div>
        <button class="primary-btn" id="diag-save-keys" type="button" style="margin-top:8px;height:32px;font-size:12px;">${esc(L('保存本地配置', 'Save Local Keys'))}</button>
        <span id="diag-save-msg" style="font-size:11px;color:var(--accent-primary);margin-left:8px;"></span>
      </div>

      <div class="panel-box" style="padding:12px;">
        <strong>${esc(L('地理档案离线审计报告（只读核验）', 'Geographic Archive Integrity Audit'))}</strong>
        <div style="font-size:11.5px;color:var(--text-secondary);margin-top:4px;">
          ${auditSummary
            ? esc(L(
                `已审计 ${auditSummary.cities} 座城市 / ${auditSummary.spots} 个机位：重复 ID ${auditSummary.duplicateCityIdsCount}，无效坐标 ${auditSummary.invalidCityCoordsCount + auditSummary.invalidSpotCoordsCount}，跨区 >250km 机位 ${auditSummary.distanceOutliersGT250kmCount} 条。`,
                `Audited ${auditSummary.cities} destinations / ${auditSummary.spots} spots: duplicate IDs ${auditSummary.duplicateCityIdsCount}, invalid coords ${auditSummary.invalidCityCoordsCount + auditSummary.invalidSpotCoordsCount}, wide regional spots >250km: ${auditSummary.distanceOutliersGT250kmCount}.`
              ))
            : esc(L('未加载 audit-report.json。', 'audit-report.json not loaded.'))}
        </div>
        ${wdConflicts.length ? `<div style="font-size:11.5px;color:#FB7185;margin-top:4px;">${esc(L('Wikidata 坐标差异项：', 'Wikidata Coord Mismatches: '))}${wdConflicts.map((c) => `${esc(c.destId)}(${c.coordDeltaKm}km)`).join(' · ')}</div>` : ''}
        ${
          auditOutliers.length
            ? `<div style="max-height:110px;overflow-y:auto;margin-top:6px;font-size:11px;border-top:1px solid var(--border-hairline);padding-top:6px;">
                ${auditOutliers
                  .slice(0, 10)
                  .map((o) => `<div>• [${esc(o.cityName)}] ${esc(o.spotName)} — <span class="mono-num">${o.distanceKm} km</span></div>`)
                  .join('')}
              </div>`
            : ''
        }
      </div>

      <div style="font-size:11px;color:var(--text-muted);line-height:1.55;">
        <strong>${esc(L('开源组件与开放数据授权：', 'Open-Source & Open-Data Licenses:'))}</strong>
        MapLibre GL JS v5 (BSD-3) · SunCalc (BSD-2) · Astronomy Engine (MIT) · tz-lookup (CC0) · Fuse.js (Apache-2.0) · MiniSearch (MIT) · Supercluster (ISC) · Dexie.js (Apache-2.0) · ECharts (Apache-2.0) · Open-Meteo (CC BY 4.0) · Wikimedia (CC BY/SA) · NASA GIBS/EPIC (Public Domain) · OSM/OSRM (ODbL).
      </div>
    `;

    startFpsMonitor((val) => {
      const f = modal.querySelector('#diag-fps');
      const tierEl = modal.querySelector('#diag-eff-tier');
      if (f) f.textContent = String(val);
      if (tierEl) tierEl.textContent = detectEffectiveTier();
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
      modal.querySelector('#diag-save-msg').textContent = L('已保存到本地 IndexedDB', 'Saved locally');
    });
  }

  global.DiagnosticsModule = {
    open,
    close,
    applyPerformanceTier,
    detectEffectiveTier,
    getPerfConfig,
    startWatchdog
  };
})(typeof window !== 'undefined' ? window : globalThis);
