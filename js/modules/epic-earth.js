(function (global) {
  'use strict';

  const ONE_HOUR_MS = 60 * 60 * 1000;
  let framesCache = null;
  let activeIdx = 0;

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

  function rewriteEpicImg(url, caps) {
    if (caps && caps.available && caps.features && caps.features.img && typeof url === 'string' && url.startsWith('https://epic.gsfc.nasa.gov/')) {
      return `/api/img?url=${encodeURIComponent(url)}`;
    }
    return url;
  }

  async function fetchEpicFrames() {
    const Api = global.ApiClient;
    const caps = Api ? await Api.detectWorkerCapabilities().catch(() => null) : null;
    if (caps && caps.available && caps.features && caps.features.epic) {
      const json = Api
        ? await Api.fetchJson('/api/epic', { cacheKey: 'nasa:epic:v1', ttlMs: ONE_HOUR_MS, source: 'NASA DSCOVR EPIC', timeoutMs: 9000 })
        : await (await fetch('/api/epic')).json();
      const rawFrames = Array.isArray(json && json.frames) ? json.frames : [];
      return rawFrames.map((f) => ({
        identifier: f.identifier,
        caption: f.caption,
        date: f.date,
        centroid: f.centroid,
        dscovrPos: f.dscovrPos,
        thumbUrl: rewriteEpicImg(f.thumbUrl, caps),
        fullUrl: rewriteEpicImg(f.fullUrl, caps)
      }));
    }

    const res = await fetch('https://epic.gsfc.nasa.gov/api/natural');
    if (!res.ok) throw new Error(`NASA EPIC HTTP ${res.status}`);
    const list = await res.json();
    return (Array.isArray(list) ? list : []).slice(0, 8).map((item) => {
      const dp = String(item.date || '').split(' ')[0].replace(/-/g, '/');
      const img = item.image || '';
      return {
        identifier: item.identifier,
        caption: item.caption || 'NASA DSCOVR EPIC Natural Color Earth',
        date: item.date,
        centroid: item.centroid_coordinates || null,
        dscovrPos: item.dscovr_j2000_position || null,
        thumbUrl: `https://epic.gsfc.nasa.gov/archive/natural/${dp}/thumbs/${img}.jpg`,
        fullUrl: `https://epic.gsfc.nasa.gov/archive/natural/${dp}/png/${img}.png`
      };
    });
  }

  function close() {
    const modal = document.getElementById('epic-earth-modal');
    if (modal) {
      modal.classList.add('is-hidden');
      modal.innerHTML = '';
    }
  }

  function renderModal(frames) {
    const modal = document.getElementById('epic-earth-modal');
    if (!modal) return;
    if (!Array.isArray(frames) || !frames.length) {
      modal.innerHTML = `
        <div class="epic-dialog">
          <div class="epic-head">
            <strong>${icon('globe', 15)} NASA DSCOVR EPIC · 今日真地球</strong>
            <button id="epic-close-btn" class="icon-btn" type="button">${icon('x', 15)}</button>
          </div>
          <p style="font-size:12.5px;color:var(--text-secondary);">暂未获取到 NASA EPIC L1 拉格朗日点影像，请稍后重试。</p>
        </div>
      `;
      modal.querySelector('#epic-close-btn').addEventListener('click', close);
      return;
    }

    activeIdx = Math.max(0, Math.min(frames.length - 1, activeIdx));
    const f = frames[activeIdx];
    const cen = f.centroid && Number.isFinite(f.centroid.lat) ? `${f.centroid.lat.toFixed(1)}°, ${f.centroid.lon.toFixed(1)}°` : '--';
    const distKm = f.dscovrPos && Number.isFinite(f.dscovrPos.x)
      ? Math.round(Math.hypot(f.dscovrPos.x, f.dscovrPos.y, f.dscovrPos.z)).toLocaleString()
      : '约 1,500,000';

    modal.innerHTML = `
      <div class="epic-dialog">
        <div class="epic-head">
          <div>
            <strong>${icon('globe', 15)} NASA DSCOVR EPIC · 今日真实整盘地球</strong>
            <div style="font-size:11px;color:var(--text-muted);">日地拉格朗日 L1 点实拍 (距地 ${esc(distKm)} km · 公共领域 NASA Public Domain)</div>
          </div>
          <button id="epic-close-btn" class="icon-btn" type="button">${icon('x', 15)}</button>
        </div>
        <div class="epic-stage">
          <img src="${esc(f.thumbUrl || f.fullUrl)}" alt="${esc(f.caption || 'Earth from DSCOVR EPIC')}" />
        </div>
        <div class="epic-meta">
          <span class="mono-num">拍摄时间: ${esc(f.date)} UTC</span>
          <span class="mono-num">星下点: ${esc(cen)}</span>
          <a href="${esc(f.fullUrl)}" target="_blank" rel="noopener noreferrer" style="color:var(--accent-primary);">查看高清原图 ↗</a>
        </div>
        <div class="epic-footer">
          <button id="epic-prev-btn" class="secondary-btn" type="button">上一帧</button>
          <span class="mono-num" style="font-size:11.5px;color:var(--text-secondary);">${activeIdx + 1} / ${frames.length}</span>
          <button id="epic-next-btn" class="secondary-btn" type="button">下一帧</button>
        </div>
      </div>
    `;

    modal.querySelector('#epic-close-btn').addEventListener('click', close);
    modal.querySelector('#epic-prev-btn').addEventListener('click', () => {
      activeIdx = (activeIdx - 1 + frames.length) % frames.length;
      renderModal(frames);
    });
    modal.querySelector('#epic-next-btn').addEventListener('click', () => {
      activeIdx = (activeIdx + 1) % frames.length;
      renderModal(frames);
    });
  }

  async function open() {
    const modal = document.getElementById('epic-earth-modal');
    if (!modal) return;
    modal.classList.remove('is-hidden');
    modal.onclick = (e) => {
      if (e.target === modal) close();
    };
    if (framesCache && framesCache.length) {
      renderModal(framesCache);
      return;
    }
    modal.innerHTML = `<div class="epic-dialog"><div style="padding:28px;text-align:center;font-size:12.5px;color:var(--text-secondary);">正在从 NASA DSCOVR EPIC (L1 拉格朗日点) 获取最新地球实拍…</div></div>`;
    try {
      framesCache = await fetchEpicFrames();
      renderModal(framesCache);
    } catch (e) {
      renderModal([]);
    }
  }

  global.EpicEarthModule = {
    open,
    close
  };
})(typeof window !== 'undefined' ? window : globalThis);
