(function (global) {
  'use strict';

  let activeViewer = null;
  let fovMarker = null;

  function esc(str) {
    return String(str || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function icon(name, size) {
    return global.AppIcons ? global.AppIcons.svg(name, size || 14) : '';
  }

  function destroyViewer() {
    if (activeViewer && typeof activeViewer.remove === 'function') {
      try { activeViewer.remove(); } catch (e) {}
    }
    activeViewer = null;
    if (fovMarker) {
      fovMarker.remove();
      fovMarker = null;
    }
  }

  function close() {
    destroyViewer();
    const modal = document.getElementById('streetview-modal');
    if (modal) {
      modal.classList.add('is-hidden');
      modal.innerHTML = '';
    }
  }

  function syncGlobePosition(lng, lat, bearing) {
    const map = typeof global.getGlobeMap === 'function' ? global.getGlobeMap() : null;
    if (!map || !Number.isFinite(lng) || !Number.isFinite(lat)) return;
    if (!fovMarker && global.maplibregl) {
      const el = document.createElement('div');
      el.style.cssText = 'width:16px;height:16px;border-radius:50%;background:#38BDF8;border:2px solid #fff;box-shadow:0 0 12px rgba(56,189,248,0.9);';
      fovMarker = new global.maplibregl.Marker({ element: el, anchor: 'center' }).setLngLat([lng, lat]).addTo(map);
    } else if (fovMarker) {
      fovMarker.setLngLat([lng, lat]);
    }
    map.easeTo({ center: [lng, lat], bearing: Number.isFinite(bearing) ? bearing : map.getBearing(), duration: 500 });
  }

  async function queryMapillaryNearby(lat, lng) {
    const Api = global.ApiClient;
    const caps = Api ? await Api.detectWorkerCapabilities() : { available: false };
    const localToken = global.StorageDB ? await global.StorageDB.getSetting('mapillaryToken', '') : '';

    const d = 0.0045;
    const bbox = `${(lng - d).toFixed(5)},${(lat - d).toFixed(5)},${(lng + d).toFixed(5)},${(lat + d).toFixed(5)}`;

    if (caps && caps.available && caps.features && caps.features.streetview) {
      const data = await Api.fetchJson(`/api/streetview?bbox=${encodeURIComponent(bbox)}&limit=8`, {
        cacheKey: `mly:worker:${bbox}`,
        ttlMs: 3600000,
        source: 'Mapillary Worker Proxy'
      });
      return { configured: true, token: data.clientToken || '', images: data.data || [] };
    }

    if (!localToken) {
      return { configured: false, token: '', images: [] };
    }

    const url = `https://graph.mapillary.com/images?access_token=${encodeURIComponent(localToken)}&fields=id,captured_at,compass_angle,is_pano,computed_geometry,thumb_1024_url&bbox=${bbox}&limit=8`;
    const res = Api
      ? await Api.fetchJson(url, { cacheKey: `mly:direct:${bbox}`, ttlMs: 3600000, source: 'Mapillary Graph API' })
      : await (await fetch(url)).json();
    return { configured: true, token: localToken, images: (res && res.data) || [] };
  }

  async function open(dest, spot, spotIdx) {
    const modal = document.getElementById('streetview-modal');
    if (!modal || !dest) return;
    destroyViewer();

    const coords = (spot && spot.coords) || dest.coords;
    if (!Array.isArray(coords) || coords.length < 2) return;
    const [lng, lat] = coords;
    const title = spot ? `${dest.shortName || dest.name} · ${spot.name}` : dest.name;

    modal.classList.remove('is-hidden');
    modal.innerHTML = `
      <div style="display:flex;align-items:center;justify-content:space-between;padding:12px 16px;border-bottom:1px solid var(--border-hairline);gap:10px;">
        <div style="min-width:0;">
          <div style="font-weight:600;font-size:14px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${icon('eye', 15)} 沉浸式街景与实景降级 · ${esc(title)}</div>
          <div id="sv-status-line" style="font-size:11.5px;color:var(--text-secondary);margin-top:2px;">正在检索 Mapillary 街景覆盖情况…</div>
        </div>
        <button class="icon-btn" id="sv-close-btn" type="button" aria-label="关闭">${icon('x', 16)}</button>
      </div>
      <div class="streetview-body" id="sv-stage">
        <div class="globe-loader" style="position:static;transform:none;"><div class="loader-ring"></div><span>正在检查街景资源…</span></div>
      </div>
      <div id="sv-footer" style="padding:10px 16px;border-top:1px solid var(--border-hairline);display:flex;justify-content:space-between;align-items:center;gap:8px;flex-wrap:wrap;font-size:11.5px;">
        <span class="mono-num">${lat.toFixed(5)}, ${lng.toFixed(5)}</span>
        <div style="display:flex;gap:8px;flex-wrap:wrap;">
          <a class="mini-action-pill" href="https://www.mapillary.com/app/?lat=${lat}&lng=${lng}&z=17" target="_blank" rel="noopener noreferrer">Mapillary 官网打开 ↗</a>
          <a class="mini-action-pill" href="https://kartaview.org/map/@${lat},${lng},17z" target="_blank" rel="noopener noreferrer">KartaView ↗</a>
          <a class="mini-action-pill" href="https://www.google.com/maps/@?api=1&map_action=pano&viewpoint=${lat},${lng}" target="_blank" rel="noopener noreferrer">Google Street View ↗</a>
        </div>
      </div>
    `;

    modal.querySelector('#sv-close-btn').addEventListener('click', close);

    const statusEl = modal.querySelector('#sv-status-line');
    const stageEl = modal.querySelector('#sv-stage');

    let mlyResult = { configured: false, token: '', images: [] };
    try {
      mlyResult = await queryMapillaryNearby(lat, lng);
    } catch (e) {
      mlyResult = { configured: true, token: '', images: [], error: e.message };
    }

    if (!document.body.contains(stageEl)) return;

    if (mlyResult.configured && mlyResult.images.length) {
      const imgs = mlyResult.images;
      const first = imgs[0];
      const panoCount = imgs.filter((i) => i.is_pano).length;
      statusEl.innerHTML = `<span class="source-tag routing">已覆盖 · ${imgs.length} 张街景${panoCount ? ` (含 ${panoCount} 张 360° 全景)` : ''}</span> · Mapillary CC BY-SA 4.0`;

      if (mlyResult.token && global.LazyLoader) {
        try {
          stageEl.innerHTML = `<div id="mly-viewer-mount" style="width:100%;height:100%;"></div>`;
          const mlyLib = await global.LazyLoader.ensureMapillary();
          if (!document.body.contains(stageEl)) return;
          activeViewer = new mlyLib.Viewer({
            accessToken: mlyResult.token,
            container: 'mly-viewer-mount',
            imageId: first.id
          });
          activeViewer.on('image', (ev) => {
            const img = ev.image;
            if (img && img.lngLat) {
              syncGlobePosition(img.lngLat.lng, img.lngLat.lat, img.compassAngle);
            }
          });
          return;
        } catch (e) {
          // Fall through to thumbnail strip if MapillaryJS script fails
        }
      }

      // Clean Mapillary photo carousel without requiring MapillaryJS
      stageEl.innerHTML = `
        <div style="width:100%;height:100%;display:flex;flex-direction:column;justify-content:center;align-items:center;padding:16px;gap:10px;">
          <img id="sv-main-img" src="${esc(first.thumb_1024_url)}" alt="${esc(title)}" style="max-width:100%;max-height:calc(100% - 74px);object-fit:contain;border-radius:10px;" />
          <div style="display:flex;gap:6px;overflow-x:auto;max-width:100%;">
            ${imgs
              .map(
                (im, idx) => `
              <button class="sv-pick-btn mini-action-pill" data-idx="${idx}" type="button">
                ${im.is_pano ? '360°' : '街景'} #${idx + 1} (${Math.round(im.compass_angle || 0)}°)
              </button>
            `
              )
              .join('')}
          </div>
        </div>
      `;
      stageEl.querySelectorAll('.sv-pick-btn').forEach((btn) => {
        btn.addEventListener('click', () => {
          const im = imgs[Number(btn.dataset.idx)];
          if (!im) return;
          stageEl.querySelector('#sv-main-img').src = im.thumb_1024_url;
          const g = im.computed_geometry && im.computed_geometry.coordinates;
          if (g) syncGlobePosition(g[0], g[1], im.compass_angle);
        });
      });
      return;
    }

    // Graceful Degradation: Wikimedia Commons real/panoramic photos
    statusEl.innerHTML = mlyResult.configured
      ? `<span class="source-tag empirical">无街景覆盖 · 已自动降级为 Wikimedia 实景照片</span>`
      : `<span class="source-tag empirical">未配置 Mapillary Token · 已自动降级为 Wikimedia 实景照片 (可在系统诊断中配置免费 Token)</span>`;

    try {
      const photos = global.MediaWikidataService
        ? await global.MediaWikidataService.fetchPlacePhotos({
            id: `${dest.id}-sv-${spotIdx ?? 'city'}`,
            lat,
            lng,
            name: spot ? spot.name : (dest.shortName || dest.name),
            country: dest.country,
            radiusM: 2500,
            limit: 6
          })
        : [];
      if (!document.body.contains(stageEl)) return;

      if (!photos.length) {
        stageEl.innerHTML = `
          <div style="text-align:center;color:var(--text-secondary);padding:24px;max-width:440px;">
            <div style="font-size:15px;font-weight:600;color:var(--text-primary);margin-bottom:8px;">附近暂无开放街景或实景照片</div>
            <p style="font-size:12.5px;line-height:1.6;">可使用下方按钮直接在 Mapillary、KartaView 或 Google Street View 地图页面查看该坐标周边最新全景。</p>
          </div>
        `;
        return;
      }

      let curIdx = 0;
      const renderFallback = () => {
        const p = photos[curIdx];
        stageEl.innerHTML = `
          <div style="width:100%;height:100%;display:flex;flex-direction:column;justify-content:center;align-items:center;padding:16px;gap:10px;">
            <img src="${esc(p.fullUrl || p.thumbUrl)}" alt="${esc(p.title)}" style="max-width:100%;max-height:calc(100% - 88px);object-fit:contain;border-radius:10px;" />
            <div style="color:#E4E4E7;font-size:12px;text-align:center;">
              <strong>${esc(p.title)}</strong> ${p.isPano ? '<span class="source-tag realtime">全景幅</span>' : ''} · ${esc(p.author)} (${esc(p.license)})
            </div>
            <div style="display:flex;gap:6px;flex-wrap:wrap;justify-content:center;">
              ${photos.map((_, idx) => `<button class="mini-action-pill sv-fb-btn ${idx === curIdx ? 'active' : ''}" data-idx="${idx}" type="button">#${idx + 1}</button>`).join('')}
            </div>
          </div>
        `;
        stageEl.querySelectorAll('.sv-fb-btn').forEach((b) => {
          b.addEventListener('click', () => {
            curIdx = Number(b.dataset.idx);
            renderFallback();
          });
        });
      };
      renderFallback();
    } catch (e) {
      stageEl.innerHTML = `<div style="color:var(--text-secondary);padding:24px;">实景加载失败，请使用下方外部街景链接。</div>`;
    }
  }

  global.StreetViewModule = {
    open,
    close
  };
})(window);
