(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory(typeof globalThis !== 'undefined' ? globalThis : root);
  } else {
    root.TravelArchive = factory(root);
  }
})(typeof window !== 'undefined' ? window : globalThis, function (global) {
  'use strict';

  let footprintEnabled = false;
  let sharedFootprint = null;
  let reportChart = null;

  function esc(str) {
    return String(str || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  function icon(name, size) {
    return global.AppIcons ? global.AppIcons.svg(name, size || 14) : '';
  }

  async function hashSyncKey(passphrase) {
    const enc = new TextEncoder().encode(`wtg_sync_v1:${passphrase}`);
    if (global.crypto && global.crypto.subtle) {
      const buf = await global.crypto.subtle.digest('SHA-256', enc);
      return Array.from(new Uint8Array(buf))
        .map((b) => b.toString(16).padStart(2, '0'))
        .join('');
    }
    return String(passphrase).trim();
  }

  function encodeFootprintShare(statuses) {
    const compact = {
      v: statuses.filter((s) => s.status === 'visited').map((s) => s.destId),
      p: statuses.filter((s) => s.status === 'planned').map((s) => s.destId),
      w: statuses.filter((s) => s.status === 'wishlist').map((s) => s.destId)
    };
    const json = JSON.stringify(compact);
    const bytes = new TextEncoder().encode(json);
    let bin = '';
    for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
    const b64 = btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
    const base = global.location ? `${global.location.origin}${global.location.pathname}` : '';
    return `${base}?footprint=${b64}`;
  }

  function decodeFootprintShare(param) {
    if (!param) return null;
    const b64 = param.replace(/-/g, '+').replace(/_/g, '/');
    const bin = atob(b64);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    const parsed = JSON.parse(new TextDecoder().decode(bytes));
    const list = [];
    (parsed.v || []).forEach((id) => list.push({ destId: id, status: 'visited' }));
    (parsed.p || []).forEach((id) => list.push({ destId: id, status: 'planned' }));
    (parsed.w || []).forEach((id) => list.push({ destId: id, status: 'wishlist' }));
    return list;
  }

  function computeExplorationStats(statuses, allDests) {
    const destMap = new Map((allDests || []).map((d) => [d.id, d]));
    const visitedIds = new Set(statuses.filter((s) => s.status === 'visited').map((s) => s.destId));
    const plannedIds = new Set(statuses.filter((s) => s.status === 'planned').map((s) => s.destId));
    const wishlistIds = new Set(statuses.filter((s) => s.status === 'wishlist').map((s) => s.destId));

    const visitedContinents = new Set();
    const visitedCountries = new Set();
    const totalCountries = new Set();

    (allDests || []).forEach((d) => {
      String(d.country || '')
        .split('/')
        .map((x) => x.trim())
        .filter(Boolean)
        .forEach((c) => totalCountries.add(c));
    });

    visitedIds.forEach((id) => {
      const d = destMap.get(id);
      if (!d) return;
      if (d.continent) visitedContinents.add(d.continent);
      String(d.country || '')
        .split('/')
        .map((x) => x.trim())
        .filter(Boolean)
        .forEach((c) => visitedCountries.add(c));
    });

    const totalCities = (allDests || []).length || 722;
    const pct = Math.round((visitedIds.size / totalCities) * 1000) / 10;

    return {
      visitedCount: visitedIds.size,
      plannedCount: plannedIds.size,
      wishlistCount: wishlistIds.size,
      continentsVisited: visitedContinents.size,
      continentsTotal: 6,
      countriesVisited: visitedCountries.size,
      countriesTotal: totalCountries.size || 137,
      citiesTotal: totalCities,
      completionPct: pct
    };
  }

  async function compressImageFile(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onerror = () => reject(new Error('File read failed'));
      reader.onload = () => {
        const img = new Image();
        img.onerror = () => reject(new Error('Invalid image'));
        img.onload = () => {
          const maxDim = 1400;
          const scale = Math.min(1, maxDim / Math.max(img.width, img.height));
          const w = Math.max(1, Math.round(img.width * scale));
          const h = Math.max(1, Math.round(img.height * scale));
          const canvas = document.createElement('canvas');
          canvas.width = w;
          canvas.height = h;
          const ctx = canvas.getContext('2d');
          ctx.drawImage(img, 0, 0, w, h);
          const dataUrl = canvas.toDataURL('image/jpeg', 0.82);

          const tScale = Math.min(1, 320 / Math.max(img.width, img.height));
          const tw = Math.max(1, Math.round(img.width * tScale));
          const th = Math.max(1, Math.round(img.height * tScale));
          const tCanvas = document.createElement('canvas');
          tCanvas.width = tw;
          tCanvas.height = th;
          tCanvas.getContext('2d').drawImage(img, 0, 0, tw, th);
          const thumbUrl = tCanvas.toDataURL('image/jpeg', 0.72);

          resolve({ dataUrl, thumbUrl, sizeBytes: dataUrl.length });
        };
        img.src = reader.result;
      };
      reader.readAsDataURL(file);
    });
  }

  async function renderDrawerStatusBar(dest, containerEl) {
    if (!dest || !containerEl || !global.StorageDB) return;
    const rec = await global.StorageDB.getTravelStatus(dest.id);
    if (!document.body.contains(containerEl)) return;
    const curStatus = rec ? rec.status : '';

    const items = [
      ['visited', '✓ 已去过'],
      ['planned', '📅 计划中'],
      ['wishlist', '★ 想去']
    ];
    containerEl.innerHTML = items
      .map(
        ([st, lbl]) => `
        <button class="status-pill-btn ${curStatus === st ? 'active' : ''}" data-status="${st}" type="button">${lbl}</button>
      `
      )
      .join('') + `<button class="status-pill-btn" id="drawer-add-trip-quick" type="button">+ 加入行程</button>`;

    containerEl.querySelectorAll('.status-pill-btn[data-status]').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const nextSt = curStatus === btn.dataset.status ? '' : btn.dataset.status;
        if (!nextSt) await global.StorageDB.deleteTravelStatus(dest.id);
        else await global.StorageDB.setTravelStatus(dest.id, { status: nextSt, visitedAt: nextSt === 'visited' ? new Date().toISOString().slice(0, 10) : '' });
        renderDrawerStatusBar(dest, containerEl);
        if (footprintEnabled) applyFootprintLayer(typeof global.getGlobeMap === 'function' ? global.getGlobeMap() : null, true);
      });
    });

    const addTripBtn = containerEl.querySelector('#drawer-add-trip-quick');
    if (addTripBtn) {
      addTripBtn.addEventListener('click', () => {
        if (global.TripPlanner && Array.isArray(dest.spots) && dest.spots[0]) {
          global.TripPlanner.addSpotToActiveTrip(dest, dest.spots[0]);
        } else if (typeof global.setAppViewMode === 'function') {
          global.setAppViewMode('planner');
        }
      });
    }
  }

  async function applyFootprintLayer(map, forceState) {
    if (!map || !map.isStyleLoaded()) return;
    footprintEnabled = forceState !== undefined ? forceState : !footprintEnabled;

    const btn = document.getElementById('toggle-footprint-btn');
    if (btn) btn.classList.toggle('active', footprintEnabled);

    if (map.getLayer('footprint-pins-layer')) map.removeLayer('footprint-pins-layer');
    if (map.getSource('footprint-pins-src')) map.removeSource('footprint-pins-src');

    if (!footprintEnabled) return;

    const statuses = sharedFootprint || (global.StorageDB ? await global.StorageDB.getAllTravelStatuses() : []);
    const allDests = global.TRAVEL_ATLAS ? global.TRAVEL_ATLAS.getAll() : [];
    const byId = new Map(allDests.map((d) => [d.id, d]));

    const features = statuses
      .map((s) => {
        const d = byId.get(s.destId);
        if (!d || !Array.isArray(d.coords)) return null;
        const color = s.status === 'visited' ? '#34D399' : s.status === 'planned' ? '#F59E0B' : '#60A5FA';
        return {
          type: 'Feature',
          properties: { status: s.status, color },
          geometry: { type: 'Point', coordinates: d.coords }
        };
      })
      .filter(Boolean);

    map.addSource('footprint-pins-src', {
      type: 'geojson',
      data: { type: 'FeatureCollection', features }
    });
    map.addLayer({
      id: 'footprint-pins-layer',
      type: 'circle',
      source: 'footprint-pins-src',
      paint: {
        'circle-radius': 7.5,
        'circle-color': ['get', 'color'],
        'circle-stroke-width': 2,
        'circle-stroke-color': '#09090B',
        'circle-opacity': 0.95
      }
    });
  }

  async function renderAnnualReportChart(el, statuses, expenses, allDests) {
    if (!el || !global.LazyLoader) return;
    try {
      const echarts = await global.LazyLoader.ensureECharts();
      if (!document.body.contains(el)) return;
      if (reportChart && reportChart.getDom && reportChart.getDom() !== el) {
        reportChart.dispose();
        reportChart = null;
      }
      if (!reportChart) reportChart = echarts.init(el);

      const destMap = new Map(allDests.map((d) => [d.id, d]));
      const contNames = {
        asia: '亚洲',
        europe: '欧洲',
        oceania: '大洋洲',
        north_america: '北美洲',
        south_america: '南美洲',
        africa_antarctica: '非洲/南极'
      };
      const counts = {};
      Object.keys(contNames).forEach((k) => { counts[k] = 0; });
      statuses.filter((s) => s.status === 'visited').forEach((s) => {
        const d = destMap.get(s.destId);
        if (d && counts[d.continent] !== undefined) counts[d.continent]++;
      });

      reportChart.setOption({
        backgroundColor: 'transparent',
        tooltip: { trigger: 'axis' },
        grid: { left: 42, right: 16, top: 20, bottom: 26 },
        xAxis: { type: 'category', data: Object.keys(contNames).map((k) => contNames[k]), axisLabel: { color: '#A1A1AA', fontSize: 10.5 } },
        yAxis: { type: 'value', minInterval: 1, axisLabel: { color: '#A1A1AA', fontSize: 10.5 }, splitLine: { lineStyle: { color: 'rgba(255,255,255,0.08)' } } },
        series: [
          {
            name: '已去过城市数',
            type: 'bar',
            data: Object.keys(contNames).map((k) => counts[k]),
            itemStyle: { color: '#34D399', borderRadius: [4, 4, 0, 0] }
          }
        ]
      });
    } catch (e) {
      // ignore offline
    }
  }

  async function renderWorkspace() {
    const view = document.getElementById('archive-view');
    if (!view || !global.StorageDB) return;

    const [statuses, lists, photos, expenses, syncKeySaved] = await Promise.all([
      global.StorageDB.getAllTravelStatuses(),
      global.StorageDB.getCustomLists(),
      global.StorageDB.getUserPhotos(),
      global.StorageDB.getExpenses(),
      global.StorageDB.getSetting('cloudSyncPassphrase', '')
    ]);

    const allDests = global.TRAVEL_ATLAS ? global.TRAVEL_ATLAS.getAll() : [];
    const destMap = new Map(allDests.map((d) => [d.id, d]));
    const activeStatuses = sharedFootprint || statuses;
    const stats = computeExplorationStats(activeStatuses, allDests);
    const totalSpent = expenses.reduce((s, e) => s + (Number(e.amountRmb) || 0), 0);
    const caps = global.ApiClient ? await global.ApiClient.detectWorkerCapabilities() : { available: false, features: {} };

    view.innerHTML = `
      <div class="workspace-container">
        <div class="gallery-head">
          <div>
            <span class="gallery-kicker">PRIVATE TRAVEL ARCHIVE · LOCAL-FIRST & OPTIONAL CLOUD SYNC</span>
            <h2>私人旅行档案与全球足迹</h2>
            <p class="gallery-lead">
              ${sharedFootprint ? '当前正在查看他人分享的只读足迹视图。' : '无需登录即可完整使用的本地旅行档案（IndexedDB 持久化），支持足迹统计、摄影上传、真实消费记录与可选加密口令云同步。'}
            </p>
          </div>
          <div style="display:flex;gap:8px;flex-wrap:wrap;">
            ${sharedFootprint ? `<button class="secondary-btn" id="ar-exit-shared-btn" type="button">返回我的档案</button>` : ''}
            <button class="primary-btn" id="ar-footprint-globe-btn" type="button">${icon('globe', 14)} 在地球上点亮足迹</button>
            <button class="gallery-back-btn" id="ar-back-btn" type="button">${icon('arrowUpRight', 14)} 返回地球</button>
          </div>
        </div>

        <div class="weather-kpi-grid" style="margin-bottom:16px;">
          <div class="panel-box" style="margin:0;">
            <div class="weather-kpi-label">已去过目的地</div>
            <div style="font-size:22px;font-weight:700;color:#34D399;" class="mono-num">${stats.visitedCount} <span style="font-size:12px;color:var(--text-muted);">/ ${stats.citiesTotal}</span></div>
          </div>
          <div class="panel-box" style="margin:0;">
            <div class="weather-kpi-label">国家 / 大洲覆盖</div>
            <div style="font-size:22px;font-weight:700;" class="mono-num">${stats.countriesVisited}<span style="font-size:12px;color:var(--text-muted);">/${stats.countriesTotal}国 · ${stats.continentsVisited}/6洲</span></div>
          </div>
          <div class="panel-box" style="margin:0;">
            <div class="weather-kpi-label">计划中 / 想去清单</div>
            <div style="font-size:22px;font-weight:700;color:#60A5FA;" class="mono-num">${stats.plannedCount} <span style="font-size:12px;color:var(--text-muted);">计划 · ${stats.wishlistCount} 想去</span></div>
          </div>
          <div class="panel-box" style="margin:0;">
            <div class="weather-kpi-label">全球探索完成度 · 累计消费</div>
            <div style="font-size:22px;font-weight:700;color:var(--accent-primary);" class="mono-num">${stats.completionPct}% <span style="font-size:12px;color:var(--text-muted);">· ¥${totalSpent.toLocaleString()}</span></div>
          </div>
        </div>

        <div class="workspace-split">
          <div>
            <div class="panel-box">
              <h3>自定义旅行清单 (${lists.length})</h3>
              <div style="display:flex;gap:6px;margin-bottom:8px;">
                <input id="ar-new-list-name" class="sim-input" type="text" placeholder="新清单名称（如：2026 秋季红叶线）" />
                <button id="ar-create-list-btn" class="primary-btn" type="button">创建</button>
              </div>
              <div style="display:flex;flex-direction:column;gap:6px;">
                ${lists.length
                  ? lists
                      .map(
                        (l) => `
                    <div style="display:flex;justify-content:space-between;align-items:center;padding:8px;border-radius:8px;background:var(--bg-hover);">
                      <div>
                        <div style="font-weight:600;font-size:12.5px;">${esc(l.name)}</div>
                        <div style="font-size:11px;color:var(--text-muted);">${(l.destIds || []).length} 座目的地</div>
                      </div>
                      <button class="icon-btn ar-del-list" data-id="${esc(l.id)}" type="button" title="删除清单">${icon('trash', 13)}</button>
                    </div>
                  `
                      )
                      .join('')
                  : `<div style="font-size:11.5px;color:var(--text-muted);">暂无自定义清单。</div>`}
              </div>
            </div>

            <div class="panel-box">
              <h3>隐私数据导出、导入与设备同步</h3>
              <div style="display:flex;gap:6px;flex-wrap:wrap;margin-bottom:10px;">
                <button class="mini-action-pill" id="ar-export-json" type="button">${icon('download', 12)} 导出全量 JSON</button>
                <label class="mini-action-pill" style="cursor:pointer;">${icon('upload', 12)} 导入 JSON<input id="ar-import-json" type="file" accept="application/json" style="display:none;" /></label>
                <button class="mini-action-pill" id="ar-share-footprint" type="button">${icon('share', 12)} 分享足迹地图</button>
                <button class="mini-action-pill" id="ar-wipe-all" type="button" style="color:#FB7185;">${icon('trash', 12)} 清空本地档案</button>
              </div>
              <div id="ar-share-msg" style="font-size:11px;color:var(--accent-primary);margin-bottom:8px;"></div>
              <div style="padding-top:8px;border-top:1px solid var(--border-hairline);">
                <div style="font-size:12px;font-weight:600;margin-bottom:4px;">可选云端同步 (Cloudflare D1 隐私隔离)</div>
                <div style="font-size:11px;color:var(--text-muted);margin-bottom:6px;">
                  ${caps && caps.available && caps.features && caps.features.d1 ? '当前已连接 Cloudflare D1 云同步服务端。' : '当前为纯静态本地模式（GitHub Pages 或未绑定 D1）。仅当绑定 Cloudflare D1 时可同步至云端。'}
                </div>
                <div style="display:flex;gap:6px;">
                  <input id="ar-sync-pass" class="sim-input" type="password" value="${esc(syncKeySaved)}" placeholder="输入私人同步口令 (SHA-256 隔离)" />
                  <button class="secondary-btn" id="ar-cloud-push" type="button">上传</button>
                  <button class="secondary-btn" id="ar-cloud-pull" type="button">拉取</button>
                </div>
                <div id="ar-sync-msg" style="font-size:11px;color:var(--text-secondary);margin-top:4px;"></div>
              </div>
            </div>
          </div>

          <div>
            <div class="panel-box">
              <h3>年度旅行足迹统计</h3>
              <div class="echarts-box" id="ar-report-chart" style="height:200px;"></div>
            </div>

            <div class="panel-box">
              <h3>足迹目的地列表 (${activeStatuses.length})</h3>
              <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(220px,1fr));gap:8px;">
                ${activeStatuses.length
                  ? activeStatuses
                      .map((s) => {
                        const d = destMap.get(s.destId);
                        if (!d) return '';
                        const stTag = s.status === 'visited' ? '已去过' : s.status === 'planned' ? '计划中' : '想去';
                        return `
                          <button class="stop-drag-item ar-fly-dest" data-id="${esc(d.id)}" type="button" style="text-align:left;width:100%;cursor:pointer;">
                            <div style="min-width:0;">
                              <div style="font-weight:600;font-size:12.5px;">${esc(d.shortName || d.name)}</div>
                              <div style="font-size:11px;color:var(--text-muted);">${esc(d.country)} · ${stTag}</div>
                            </div>
                            ${icon('arrowUpRight', 13)}
                          </button>
                        `;
                      })
                      .join('')
                  : `<div style="font-size:12px;color:var(--text-muted);">在地球仪目的地详情页点击「已去过 / 计划中 / 想去」即可自动收录。</div>`}
              </div>
            </div>

            <div class="panel-box">
              <div style="display:flex;justify-content:space-between;align-items:center;gap:8px;flex-wrap:wrap;margin-bottom:8px;">
                <h3 style="margin:0;">个人摄影作品库 (${photos.length})</h3>
                <label class="primary-btn" style="cursor:pointer;height:30px;font-size:11.5px;">
                  ${icon('upload', 13)} 上传个人摄影作品
                  <input id="ar-photo-upload" type="file" accept="image/*" style="display:none;" />
                </label>
              </div>
              <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(150px,1fr));gap:8px;">
                ${photos.length
                  ? photos
                      .map(
                        (p, idx) => `
                    <div style="border-radius:8px;overflow:hidden;border:1px solid var(--border-hairline);background:var(--bg-hover);">
                      <img class="ar-user-photo-img" data-idx="${idx}" src="${esc(p.thumbUrl || p.dataUrl)}" alt="${esc(p.caption || '')}" style="width:100%;height:105px;object-fit:cover;display:block;cursor:zoom-in;" />
                      <div style="padding:6px 8px;display:flex;justify-content:space-between;align-items:center;font-size:11px;">
                        <span style="white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${esc(p.caption || p.destId || '旅拍作品')}</span>
                        <button class="icon-btn ar-del-photo" data-id="${esc(p.id)}" type="button">${icon('trash', 12)}</button>
                      </div>
                    </div>
                  `
                      )
                      .join('')
                  : `<div style="font-size:12px;color:var(--text-muted);">支持压缩后本地保存于 IndexedDB（若部署 Cloudflare R2 也可自动上传云端）。</div>`}
              </div>
            </div>

            <div class="panel-box">
              <h3>实际旅行消费记录 (合计 ¥${totalSpent.toLocaleString()})</h3>
              <div style="display:grid;grid-template-columns:100px 1fr 90px 76px;gap:6px;margin-bottom:8px;">
                <input id="ar-exp-date" class="sim-input mono-num" type="date" value="${new Date().toISOString().slice(0, 10)}" />
                <input id="ar-exp-note" class="sim-input" type="text" placeholder="城市/消费说明" />
                <input id="ar-exp-amt" class="sim-input mono-num" type="number" placeholder="金额RMB" />
                <button id="ar-exp-add" class="primary-btn" type="button">记一笔</button>
              </div>
              ${expenses
                .slice(0, 20)
                .map(
                  (e) => `
                <div class="budget-row">
                  <div class="budget-row-left">
                    <span class="mono-num" style="color:var(--text-muted);font-size:11px;">${esc(e.date)}</span>
                    <span>${esc(e.note || e.category)}</span>
                  </div>
                  <div style="display:flex;align-items:center;gap:8px;">
                    <span class="budget-cost">¥ ${Number(e.amountRmb || 0).toLocaleString()}</span>
                    <button class="icon-btn ar-del-exp" data-id="${esc(e.id)}" type="button">${icon('trash', 12)}</button>
                  </div>
                </div>
              `
                )
                .join('')}
            </div>
          </div>
        </div>
      </div>
    `;

    renderAnnualReportChart(view.querySelector('#ar-report-chart'), activeStatuses, expenses, allDests);

    view.querySelector('#ar-back-btn').addEventListener('click', () => {
      if (typeof global.setAppViewMode === 'function') global.setAppViewMode('map');
    });
    const exitSharedBtn = view.querySelector('#ar-exit-shared-btn');
    if (exitSharedBtn) {
      exitSharedBtn.addEventListener('click', () => {
        sharedFootprint = null;
        renderWorkspace();
      });
    }
    view.querySelector('#ar-footprint-globe-btn').addEventListener('click', () => {
      const map = typeof global.getGlobeMap === 'function' ? global.getGlobeMap() : null;
      if (typeof global.setAppViewMode === 'function') global.setAppViewMode('map');
      applyFootprintLayer(map, true);
    });

    view.querySelector('#ar-create-list-btn').addEventListener('click', async () => {
      const name = view.querySelector('#ar-new-list-name').value.trim();
      if (!name) return;
      await global.StorageDB.saveCustomList({ name, destIds: [] });
      renderWorkspace();
    });
    view.querySelectorAll('.ar-del-list').forEach((b) => {
      b.addEventListener('click', async () => {
        await global.StorageDB.deleteCustomList(b.dataset.id);
        renderWorkspace();
      });
    });

    view.querySelectorAll('.ar-fly-dest').forEach((b) => {
      b.addEventListener('click', () => {
        if (typeof global.selectAtlasDestination === 'function') global.selectAtlasDestination(b.dataset.id);
      });
    });

    view.querySelector('#ar-photo-upload').addEventListener('change', async (e) => {
      const file = e.target.files && e.target.files[0];
      if (!file) return;
      const compressed = await compressImageFile(file);
      await global.StorageDB.saveUserPhoto({
        destId: '',
        caption: file.name.replace(/\.[^.]+$/, ''),
        dataUrl: compressed.dataUrl,
        thumbUrl: compressed.thumbUrl,
        sizeBytes: compressed.sizeBytes
      });
      renderWorkspace();
    });

    view.querySelectorAll('.ar-user-photo-img').forEach((img) => {
      img.addEventListener('click', () => {
        if (!global.MediaGallery) return;
        const items = photos.map((p) => ({
          title: p.caption || '个人摄影作品',
          fullUrl: p.dataUrl,
          thumbUrl: p.thumbUrl || p.dataUrl,
          author: '个人档案上传',
          license: 'Private Local Storage'
        }));
        global.MediaGallery.openLightbox(items, Number(img.dataset.idx));
      });
    });

    view.querySelectorAll('.ar-del-photo').forEach((b) => {
      b.addEventListener('click', async () => {
        await global.StorageDB.deleteUserPhoto(b.dataset.id);
        renderWorkspace();
      });
    });

    view.querySelector('#ar-exp-add').addEventListener('click', async () => {
      const amt = Number(view.querySelector('#ar-exp-amt').value);
      if (!amt) return;
      await global.StorageDB.saveExpense({
        date: view.querySelector('#ar-exp-date').value,
        note: view.querySelector('#ar-exp-note').value.trim() || '旅行消费',
        amountRmb: amt
      });
      renderWorkspace();
    });
    view.querySelectorAll('.ar-del-exp').forEach((b) => {
      b.addEventListener('click', async () => {
        await global.StorageDB.deleteExpense(b.dataset.id);
        renderWorkspace();
      });
    });

    view.querySelector('#ar-export-json').addEventListener('click', async () => {
      const data = await global.StorageDB.exportAllUserData();
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `world-travel-globe-archive-${new Date().toISOString().slice(0, 10)}.json`;
      a.click();
      URL.revokeObjectURL(url);
    });

    view.querySelector('#ar-import-json').addEventListener('change', async (e) => {
      const f = e.target.files && e.target.files[0];
      if (!f) return;
      try {
        const parsed = JSON.parse(await f.text());
        await global.StorageDB.importAllUserData(parsed, 'merge');
        renderWorkspace();
      } catch (err) {
        view.querySelector('#ar-share-msg').textContent = '导入失败：JSON 格式无效。';
      }
    });

    view.querySelector('#ar-share-footprint').addEventListener('click', async () => {
      const url = encodeFootprintShare(activeStatuses);
      if (global.navigator && global.navigator.clipboard) {
        await global.navigator.clipboard.writeText(url).catch(() => {});
      }
      view.querySelector('#ar-share-msg').textContent = `足迹地图分享链接已复制（${url.length} 字符）。`;
    });

    view.querySelector('#ar-wipe-all').addEventListener('click', async () => {
      await global.StorageDB.wipeAllUserData(true);
      renderWorkspace();
    });

    const handleSync = async (direction) => {
      const pass = view.querySelector('#ar-sync-pass').value.trim();
      const msgEl = view.querySelector('#ar-sync-msg');
      if (!pass) {
        msgEl.textContent = '请先输入私人同步口令。';
        return;
      }
      await global.StorageDB.setSetting('cloudSyncPassphrase', pass);
      const keyHash = await hashSyncKey(pass);
      try {
        if (direction === 'push') {
          const payload = await global.StorageDB.exportAllUserData();
          const res = await fetch('/api/profile', {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json', 'X-Sync-Key': keyHash },
            body: JSON.stringify(payload)
          });
          const j = await res.json();
          msgEl.textContent = res.ok ? '已安全同步至 Cloudflare D1。' : `云同步未启用 (${res.status}): ${j.error || 'D1 Not Configured'}`;
        } else {
          const res = await fetch('/api/profile', { headers: { 'X-Sync-Key': keyHash } });
          const j = await res.json();
          if (res.ok && j.data) {
            await global.StorageDB.importAllUserData(j.data, 'merge');
            msgEl.textContent = '已从云端合并恢复档案！';
            renderWorkspace();
          } else {
            msgEl.textContent = `拉取失败 (${res.status}): ${j.error || '未找到数据或 D1 未配置'}`;
          }
        }
      } catch (err) {
        msgEl.textContent = '当前环境不支持云同步 API，已保留完整本地 IndexedDB 档案。';
      }
    };
    view.querySelector('#ar-cloud-push').addEventListener('click', () => handleSync('push'));
    view.querySelector('#ar-cloud-pull').addEventListener('click', () => handleSync('pull'));
  }

  function restoreFootprintFromUrl() {
    if (!global.location) return false;
    const raw = new URLSearchParams(global.location.search).get('footprint');
    if (!raw) return false;
    try {
      const decoded = decodeFootprintShare(raw);
      if (decoded && decoded.length) {
        sharedFootprint = decoded;
        return true;
      }
    } catch (e) {
      // ignore
    }
    return false;
  }

  return {
    encodeFootprintShare,
    decodeFootprintShare,
    computeExplorationStats,
    renderDrawerStatusBar,
    applyFootprintLayer,
    renderWorkspace,
    restoreFootprintFromUrl
  };
});
