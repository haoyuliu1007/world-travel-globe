(function (global) {
  'use strict';

  const ONE_HOUR_MS = 60 * 60 * 1000;
  let framesCache = null;
  let activeIdx = 0;
  let playTimer = null;
  let isPlaying = false;
  let keyHandler = null;

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

  function rewriteEpicImg(url, caps) {
    if (caps && caps.available && caps.features && caps.features.img && typeof url === 'string' && url.startsWith('https://epic.gsfc.nasa.gov/')) {
      return `/api/img?url=${encodeURIComponent(url)}`;
    }
    return url;
  }

  function deriveMediumFromUrls(f) {
    if (f && f.mediumUrl) return f.mediumUrl;
    const raw = (f && (f.fullUrl || f.thumbUrl)) || '';
    if (raw.includes('/thumbs/')) return raw.replace('/thumbs/', '/jpg/');
    if (raw.includes('/png/') && raw.endsWith('.png')) return raw.replace('/png/', '/jpg/').replace(/\.png$/, '.jpg');
    return raw;
  }

  async function fetchEpicFrames() {
    const Api = global.ApiClient;
    const caps = Api ? await Api.detectWorkerCapabilities().catch(() => null) : null;
    if (caps && caps.available && caps.features && caps.features.epic) {
      const json = Api
        ? await Api.fetchJson('/api/epic', { cacheKey: 'nasa:epic:v2', ttlMs: ONE_HOUR_MS, source: 'NASA DSCOVR EPIC', serviceId: 'nasa-epic', timeoutMs: 9000 })
        : await (await fetch('/api/epic')).json();
      const rawFrames = Array.isArray(json && json.frames) ? json.frames : [];
      return rawFrames.map((f) => {
        const med = deriveMediumFromUrls(f);
        return {
          identifier: f.identifier,
          caption: f.caption,
          date: f.date,
          centroid: f.centroid,
          dscovrPos: f.dscovrPos,
          thumbUrl: rewriteEpicImg(f.thumbUrl, caps),
          mediumUrl: rewriteEpicImg(med, caps),
          fullUrl: rewriteEpicImg(f.fullUrl, caps)
        };
      });
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
        mediumUrl: `https://epic.gsfc.nasa.gov/archive/natural/${dp}/jpg/${img}.jpg`,
        fullUrl: `https://epic.gsfc.nasa.gov/archive/natural/${dp}/png/${img}.png`
      };
    });
  }

  function stopPlayback() {
    isPlaying = false;
    if (playTimer) {
      clearInterval(playTimer);
      playTimer = null;
    }
  }

  function preloadNext(frames) {
    if (!Array.isArray(frames) || frames.length < 2 || typeof Image === 'undefined') return;
    const next = frames[(activeIdx + 1) % frames.length];
    if (next && (next.mediumUrl || next.thumbUrl)) {
      const pre = new Image();
      pre.src = next.mediumUrl || next.thumbUrl;
    }
  }

  function close() {
    stopPlayback();
    if (keyHandler && typeof document !== 'undefined') {
      document.removeEventListener('keydown', keyHandler);
      keyHandler = null;
    }
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
      stopPlayback();
      modal.innerHTML = `
        <div class="epic-dialog">
          <div class="epic-head">
            <strong>${icon('globe', 15)} ${esc(L('NASA DSCOVR EPIC · 今日真地球', 'NASA DSCOVR EPIC · Live Earth'))}</strong>
            <button id="epic-close-btn" class="icon-btn" type="button" aria-label="${esc(L('关闭', 'Close'))}">${icon('x', 15)}</button>
          </div>
          <p style="font-size:12.5px;color:var(--text-secondary);">${esc(L('暂未获取到 NASA EPIC L1 拉格朗日点影像，请稍后重试。', 'Unable to fetch NASA EPIC L1 imagery right now. Please try again later.'))}</p>
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
      : L('约 1,500,000', '~1,500,000');

    const displayUrl = f.mediumUrl || f.thumbUrl || f.fullUrl;
    const playLabel = isPlaying ? L('暂停轮播', 'Pause') : L('自动轮播', 'Play Timelapse');

    modal.innerHTML = `
      <div class="epic-dialog">
        <div class="epic-head">
          <div>
            <strong>${icon('globe', 15)} ${esc(L('NASA DSCOVR EPIC · 今日真实整盘地球', 'NASA DSCOVR EPIC · Live Full-Disk Earth'))}</strong>
            <div style="font-size:11px;color:var(--text-muted);">${esc(L(`日地拉格朗日 L1 点实拍 (距地 ${distKm} km · 公共领域 NASA Public Domain)`, `Captured from Sun-Earth L1 (${distKm} km · NASA Public Domain)`))}</div>
          </div>
          <button id="epic-close-btn" class="icon-btn" type="button" aria-label="${esc(L('关闭', 'Close'))}">${icon('x', 15)}</button>
        </div>
        <div class="epic-stage">
          <img id="epic-stage-img" src="${esc(displayUrl)}" alt="${esc(f.caption || 'Earth from DSCOVR EPIC')}" decoding="async" />
        </div>
        <div class="epic-meta">
          <span class="mono-num">${esc(L('拍摄时间', 'Captured'))}: ${esc(f.date)} UTC</span>
          <span class="mono-num">${esc(L('星下点', 'Subpoint'))}: ${esc(cen)}</span>
          <a href="${esc(f.fullUrl)}" target="_blank" rel="noopener noreferrer" style="color:var(--accent-primary);">${esc(L('查看高清原图 (2048px PNG) ↗', 'Full-Res PNG (2048px) ↗'))}</a>
        </div>
        <div class="epic-footer">
          <button id="epic-prev-btn" class="secondary-btn" type="button">${esc(L('上一帧', 'Prev'))}</button>
          <button id="epic-play-btn" class="secondary-btn ${isPlaying ? 'active' : ''}" type="button">${esc(playLabel)}</button>
          <span class="mono-num" style="font-size:11.5px;color:var(--text-secondary);">${activeIdx + 1} / ${frames.length}</span>
          <button id="epic-next-btn" class="secondary-btn" type="button">${esc(L('下一帧', 'Next'))}</button>
        </div>
      </div>
    `;

    const imgEl = modal.querySelector('#epic-stage-img');
    if (imgEl && f.thumbUrl && displayUrl !== f.thumbUrl) {
      imgEl.addEventListener('error', () => {
        if (imgEl.dataset.fallbackDone) return;
        imgEl.dataset.fallbackDone = '1';
        imgEl.src = f.thumbUrl;
      }, { once: true });
    }

    modal.querySelector('#epic-close-btn').addEventListener('click', close);
    modal.querySelector('#epic-prev-btn').addEventListener('click', () => {
      stopPlayback();
      activeIdx = (activeIdx - 1 + frames.length) % frames.length;
      renderModal(frames);
    });
    modal.querySelector('#epic-next-btn').addEventListener('click', () => {
      stopPlayback();
      activeIdx = (activeIdx + 1) % frames.length;
      renderModal(frames);
    });
    modal.querySelector('#epic-play-btn').addEventListener('click', () => {
      if (isPlaying) {
        stopPlayback();
        renderModal(frames);
      } else {
        isPlaying = true;
        renderModal(frames);
        playTimer = setInterval(() => {
          activeIdx = (activeIdx + 1) % frames.length;
          renderModal(frames);
        }, 1150);
      }
    });

    preloadNext(frames);
  }

  async function open() {
    const modal = document.getElementById('epic-earth-modal');
    if (!modal) return;
    modal.classList.remove('is-hidden');
    modal.onclick = (e) => {
      if (e.target === modal) close();
    };
    if (!keyHandler && typeof document !== 'undefined') {
      keyHandler = (e) => {
        if (modal.classList.contains('is-hidden')) return;
        if (e.key === 'Escape') close();
        else if (framesCache && framesCache.length) {
          if (e.key === 'ArrowLeft') {
            stopPlayback();
            activeIdx = (activeIdx - 1 + framesCache.length) % framesCache.length;
            renderModal(framesCache);
          } else if (e.key === 'ArrowRight') {
            stopPlayback();
            activeIdx = (activeIdx + 1) % framesCache.length;
            renderModal(framesCache);
          } else if (e.key === ' ') {
            e.preventDefault();
            const playBtn = modal.querySelector('#epic-play-btn');
            if (playBtn) playBtn.click();
          }
        }
      };
      document.addEventListener('keydown', keyHandler);
    }

    if (framesCache && framesCache.length) {
      renderModal(framesCache);
      return;
    }
    modal.innerHTML = `<div class="epic-dialog"><div style="padding:28px;text-align:center;font-size:12.5px;color:var(--text-secondary);">${esc(L('正在从 NASA DSCOVR EPIC (L1 拉格朗日点) 获取最新地球实拍…', 'Fetching latest Earth imagery from NASA DSCOVR EPIC (Sun-Earth L1)…'))}</div></div>`;
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
