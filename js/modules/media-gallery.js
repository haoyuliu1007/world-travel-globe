(function (global) {
  'use strict';

  let lightboxItems = [];
  let lightboxIndex = 0;
  let galleryObserver = null;
  const thumbQueue = [];
  let activeThumbFetches = 0;

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

  function t(key, vars) {
    return global.AppI18n ? global.AppI18n.t(key, vars) : key;
  }

  function L(zh, en) {
    const lang = global.AppI18n && typeof global.AppI18n.getLang === 'function' ? global.AppI18n.getLang() : 'zh-CN';
    if (lang === 'en') return en;
    if (lang === 'zh-TW' && global.AppI18n && typeof global.AppI18n.toTraditional === 'function') {
      return global.AppI18n.toTraditional(zh);
    }
    return zh;
  }

  function tx(str) {
    return global.AppI18n && typeof global.AppI18n.tx === 'function' ? global.AppI18n.tx(str) : (str || '');
  }

  function openLightbox(items, startIdx) {
    if (!Array.isArray(items) || !items.length) return;
    lightboxItems = items;
    lightboxIndex = Math.max(0, Math.min(items.length - 1, startIdx || 0));
    renderLightbox();
  }

  function closeLightbox() {
    const el = document.getElementById('media-lightbox');
    if (el) {
      el.classList.add('is-hidden');
      el.innerHTML = '';
    }
  }

  function renderLightbox() {
    const el = document.getElementById('media-lightbox');
    if (!el || !lightboxItems.length) return;
    const item = lightboxItems[lightboxIndex];
    el.classList.remove('is-hidden');
    el.innerHTML = `
      <button class="lightbox-close" id="lb-close-btn" type="button" aria-label="${esc(t('paletteClose'))}">${icon('x', 18)}</button>
      ${lightboxItems.length > 1 ? `<button class="lightbox-nav prev" id="lb-prev-btn" type="button" aria-label="${esc(L('上一张', 'Previous photo'))}">${icon('chevronLeft', 20)}</button>` : ''}
      ${lightboxItems.length > 1 ? `<button class="lightbox-nav next" id="lb-next-btn" type="button" aria-label="${esc(L('下一张', 'Next photo'))}">${icon('chevronRight', 20)}</button>` : ''}
      <div class="lightbox-stage">
        <img src="${esc(item.fullUrl || item.thumbUrl)}" alt="${esc(item.title || '')}" />
      </div>
      <div class="lightbox-caption">
        <div style="font-weight:600;margin-bottom:4px;">${esc(item.title || t('mediaEmptyTitle'))} <span class="mono-num" style="opacity:0.7;">(${lightboxIndex + 1}/${lightboxItems.length})</span></div>
        <div style="opacity:0.86;font-size:11.5px;">
          ${esc(t('mediaLightboxCredit', { author: item.author || 'Wikimedia Commons', license: item.license || 'Open License' }))}
          ${item.sourceUrl ? ` · <a href="${esc(item.sourceUrl)}" target="_blank" rel="noopener noreferrer">${esc(t('mediaViewOriginal'))}</a>` : ''}
        </div>
      </div>
    `;

    el.querySelector('#lb-close-btn').addEventListener('click', closeLightbox);
    el.addEventListener('click', (e) => {
      if (e.target === el) closeLightbox();
    });
    const prevBtn = el.querySelector('#lb-prev-btn');
    const nextBtn = el.querySelector('#lb-next-btn');
    if (prevBtn) {
      prevBtn.addEventListener('click', () => {
        lightboxIndex = (lightboxIndex - 1 + lightboxItems.length) % lightboxItems.length;
        renderLightbox();
      });
    }
    if (nextBtn) {
      nextBtn.addEventListener('click', () => {
        lightboxIndex = (lightboxIndex + 1) % lightboxItems.length;
        renderLightbox();
      });
    }
  }

  document.addEventListener('keydown', (e) => {
    const el = document.getElementById('media-lightbox');
    if (!el || el.classList.contains('is-hidden')) return;
    if (e.key === 'Escape') {
      e.stopImmediatePropagation();
      closeLightbox();
    } else if (e.key === 'ArrowLeft' && lightboxItems.length > 1) {
      lightboxIndex = (lightboxIndex - 1 + lightboxItems.length) % lightboxItems.length;
      renderLightbox();
    } else if (e.key === 'ArrowRight' && lightboxItems.length > 1) {
      lightboxIndex = (lightboxIndex + 1) % lightboxItems.length;
      renderLightbox();
    }
  }, true);

  async function loadDestinationMedia(dest, containerEl) {
    if (!dest || !containerEl || !global.MediaWikidataService) return;
    containerEl.innerHTML = `
      <div class="media-strip-head">
        <span>${icon('image', 13)} ${esc(t('mediaLoadingTitle'))}</span>
        <span class="source-tag realtime">${esc(t('mediaOnDemand'))}</span>
      </div>
      <div class="media-strip-grid">
        <div class="media-skeleton"></div>
        <div class="media-skeleton"></div>
        <div class="media-skeleton"></div>
      </div>
    `;

    try {
      const photos = await global.MediaWikidataService.fetchPlacePhotos({
        id: dest.id,
        lat: dest.coords && dest.coords[1],
        lng: dest.coords && dest.coords[0],
        name: dest.shortName || dest.name,
        country: dest.country,
        radiusM: 5000,
        limit: 6
      });

      if (!document.body.contains(containerEl)) return;
      if (!photos.length) {
        containerEl.innerHTML = `
          <div class="media-strip-head">
            <span>${icon('image', 13)} ${esc(t('mediaEmptyTitle'))}</span>
            <span class="source-tag empirical">${esc(t('mediaNoGeotag'))}</span>
          </div>
        `;
        return;
      }

      const lat = dest.coords && dest.coords[1];
      let seasonFilter = 'all';
      const renderGalleryState = () => {
        if (!document.body.contains(containerEl)) return;
        const seasonTagged = photos.map((p) => {
          const sInfo = global.MediaWikidataService && typeof global.MediaWikidataService.extractPhotoSeason === 'function'
            ? global.MediaWikidataService.extractPhotoSeason(p, lat)
            : { season: 'unknown', month: null };
          return { photo: p, season: sInfo.season, month: sInfo.month };
        });
        const filtered = seasonFilter === 'all'
          ? seasonTagged
          : seasonTagged.filter((x) => x.season === seasonFilter);

        const seasonTabs = [
          { id: 'all', label: L('全部', 'All') },
          { id: 'spring', label: L('春', 'Spring') },
          { id: 'summer', label: L('夏', 'Summer') },
          { id: 'autumn', label: L('秋', 'Autumn') },
          { id: 'winter', label: L('冬', 'Winter') },
          { id: 'unknown', label: L('未标日期', 'Undated') }
        ];
        const counts = {};
        seasonTagged.forEach((x) => { counts[x.season] = (counts[x.season] || 0) + 1; });

        containerEl.innerHTML = `
          <div class="media-strip-head">
            <span>${icon('image', 13)} ${esc(t('mediaGalleryCount', { n: filtered.length }))}</span>
            <span class="source-tag realtime">${esc(t('mediaCommonsClickFull'))}</span>
          </div>
          <div style="display:flex;gap:5px;flex-wrap:wrap;margin-bottom:8px;">
            ${seasonTabs.map((tab) => {
              const cnt = tab.id === 'all' ? photos.length : (counts[tab.id] || 0);
              return `<button class="mini-action-pill mg-season-btn ${seasonFilter === tab.id ? 'active' : ''}" data-season="${tab.id}" type="button">${esc(tab.label)} (${cnt})</button>`;
            }).join('')}
          </div>
          ${filtered.length ? `
            <div class="media-strip-grid">
              ${filtered.slice(0, 3).map((item, i) => `
                <button class="media-thumb-card" data-photo-idx="${i}" type="button" title="${esc(item.photo.title)} · ${esc(item.photo.license)}">
                  <img src="${esc(item.photo.thumbUrl)}" alt="${esc(item.photo.title)}" loading="lazy" decoding="async" />
                  <span class="media-thumb-credit">${esc(item.season !== 'unknown' ? `${item.season.toUpperCase()} · ` : '')}${esc(item.photo.license)} · ${esc(item.photo.author)}</span>
                </button>
              `).join('')}
            </div>
          ` : `<div style="font-size:11.5px;color:var(--text-muted);padding:10px 0;">${esc(L('该季节暂无带 EXIF 拍摄日期的 Wikimedia 公开影像（绝不伪造季节标签）。', 'No Commons images with EXIF capture dates for this season (never fabricated).'))}</div>`}
        `;

        containerEl.querySelectorAll('.mg-season-btn').forEach((b) => {
          b.addEventListener('click', () => {
            seasonFilter = b.dataset.season;
            renderGalleryState();
          });
        });
        containerEl.querySelectorAll('.media-thumb-card').forEach((btn) => {
          btn.addEventListener('click', () => {
            openLightbox(filtered.map((x) => x.photo), Number(btn.dataset.photoIdx || 0));
          });
        });
      };
      renderGalleryState();
    } catch (e) {
      if (document.body.contains(containerEl)) {
        containerEl.innerHTML = `
          <div class="media-strip-head">
            <span>${icon('image', 13)} ${esc(t('mediaEmptyTitle'))}</span>
            <span class="source-tag empirical">${esc(t('mediaOffline'))}</span>
          </div>
        `;
      }
    }
  }

  async function loadSpotPhoto(dest, spot, idx, boxEl) {
    if (!dest || !spot || !boxEl || !global.MediaWikidataService) return;
    if (boxEl.dataset.loaded === '1') return;
    boxEl.dataset.loaded = '1';
    boxEl.innerHTML = `<div class="media-skeleton" style="height:110px;"></div>`;

    try {
      const photos = await global.MediaWikidataService.fetchPlacePhotos({
        id: `${dest.id}-sp-${idx}`,
        lat: spot.coords && spot.coords[1],
        lng: spot.coords && spot.coords[0],
        name: spot.name,
        country: dest.country,
        radiusM: 2000,
        limit: 3
      });

      if (!document.body.contains(boxEl)) return;
      if (!photos.length) {
        boxEl.innerHTML = '';
        boxEl.style.display = 'none';
        return;
      }

      const first = photos[0];
      boxEl.innerHTML = `
        <img src="${esc(first.thumbUrl)}" alt="${esc(first.title)}" loading="lazy" decoding="async" />
        <div class="spot-photo-meta">
          <span>${esc(first.author)} · ${esc(first.license)}</span>
          <a href="${esc(first.sourceUrl)}" target="_blank" rel="noopener noreferrer" style="color:var(--accent-primary);">Wikimedia ↗</a>
        </div>
      `;
      boxEl.querySelector('img').addEventListener('click', () => openLightbox(photos, 0));
    } catch (e) {
      boxEl.innerHTML = '';
      boxEl.style.display = 'none';
    }
  }

  async function loadWikidataBadge(dest, containerEl) {
    if (!dest || !containerEl || !global.MediaWikidataService) return;
    containerEl.innerHTML = `<div class="wikidata-card"><span style="color:var(--text-muted);">${esc(L('正在与 Wikidata 交叉核验地理与建筑元数据…', 'Cross-verifying coordinates & metadata with Wikidata…'))}</span></div>`;
    try {
      const rec = await global.MediaWikidataService.verifyWithWikidata(dest);
      if (!document.body.contains(containerEl) || !rec) return;

      const confMap = {
        high: { cls: 'high', label: L('高可信度 (坐标一致)', 'High Confidence (Coords Match)') },
        medium: { cls: 'medium', label: L('中等可信度 (区域范围)', 'Medium Confidence (Regional)') },
        review: { cls: 'review', label: L('已记录坐标差异审核队列', 'Logged to Coord Review') },
        empirical: { cls: 'empirical', label: L('本地实地档案 (未匹配 QID)', 'Local Field Archive (No QID)') }
      };
      const cm = confMap[rec.confidence] || confMap.empirical;
      const p = rec.payload;
      const details = p
        ? [
            p.labelEn ? `EN: ${esc(p.labelEn)}` : '',
            p.elevationM !== null ? `${L('Wikidata 海拔', 'Wikidata Elev')}: ${p.elevationM}m` : '',
            p.instanceOf && p.instanceOf.length ? `${L('类型', 'Type')}: ${esc(p.instanceOf.join(' / '))}` : '',
            p.architects && p.architects.length ? `${L('建筑师', 'Architects')}: ${esc(p.architects.join(', '))}` : '',
            p.heritage && p.heritage.length ? `${L('遗产', 'Heritage')}: ${esc(p.heritage.join(', '))}` : '',
            rec.coordDeltaKm !== null ? `${L('坐标偏差', 'Coord Delta')}: ${rec.coordDeltaKm} km` : ''
          ]
            .filter(Boolean)
            .join(' · ')
        : L('保留原始人工采集数据，未覆盖任何源字段。', 'Preserves original curated field notes without overwriting.');

      containerEl.innerHTML = `
        <div class="wikidata-card">
          <div class="wikidata-head">
            <strong>${icon('shield', 13)} ${esc(L('Wikidata 地理核验', 'Wikidata Verification'))} ${p ? `(${esc(rec.qid)})` : ''}</strong>
            <span class="confidence-badge ${cm.cls}">${esc(cm.label)}</span>
          </div>
          <div style="color:var(--text-secondary);line-height:1.5;">${details}</div>
          ${p && p.wikidataUrl ? `<div style="margin-top:4px;"><a href="${esc(p.wikidataUrl)}" target="_blank" rel="noopener noreferrer" style="color:var(--accent-primary);">${esc(L('查看 Wikidata 条目 ↗', 'View on Wikidata ↗'))}</a> · ${esc(L('核验时间：', 'Verified: '))}${new Date(rec.updatedAt).toLocaleDateString()}</div>` : ''}
        </div>
      `;
    } catch (e) {
      if (document.body.contains(containerEl)) {
        containerEl.innerHTML = '';
      }
    }
  }

  function hashDestHue(id) {
    const str = String(id || 'globe');
    let h = 0;
    for (let i = 0; i < str.length; i++) {
      h = (h * 31 + str.charCodeAt(i)) >>> 0;
    }
    return h % 360;
  }

  function buildGeoGradient(dest) {
    const baseHue = hashDestHue(dest && dest.id);
    const isNature = dest && Array.isArray(dest.themeTags) && dest.themeTags.includes('nature');
    const h1 = isNature ? (175 + (baseHue % 55)) : (210 + (baseHue % 45));
    const h2 = (h1 + (dest && dest.allWeather ? 28 : 42)) % 360;
    return `radial-gradient(circle at 82% 18%, hsla(${h2}, 58%, 38%, 0.48) 0%, transparent 56%), linear-gradient(135deg, hsl(${h1}, 32%, 14%) 0%, hsl(${h2}, 26%, 9%) 100%)`;
  }

  async function loadDrawerHeroBanner(dest, bannerEl) {
    if (!dest || !bannerEl) return;
    const bgEl = bannerEl.querySelector('#drawer-hero-bg') || bannerEl.querySelector('.drawer-hero-bg');
    if (!bgEl) return;

    bannerEl.dataset.destId = dest.id;
    bannerEl.classList.remove('has-hero-photo');
    bgEl.style.background = buildGeoGradient(dest);
    bgEl.innerHTML = '';
    bgEl.onclick = null;

    if (!global.MediaWikidataService) return;
    try {
      const photos = await global.MediaWikidataService.fetchPlacePhotos({
        id: dest.id,
        lat: dest.coords && dest.coords[1],
        lng: dest.coords && dest.coords[0],
        name: dest.shortName || dest.name,
        country: dest.country,
        radiusM: 5000,
        limit: 6
      });
      if (!document.body.contains(bannerEl) || bannerEl.dataset.destId !== dest.id) return;
      if (!photos || !photos.length) return;

      const hero = photos[0];
      const img = document.createElement('img');
      img.className = 'drawer-hero-img';
      img.alt = hero.title || dest.name || '';
      img.decoding = 'async';
      img.addEventListener('load', () => {
        if (bannerEl.dataset.destId !== dest.id) return;
        img.classList.add('is-loaded');
        bannerEl.classList.add('has-hero-photo');
      }, { once: true });
      img.addEventListener('error', () => {
        img.remove();
      }, { once: true });
      img.src = hero.thumbUrl;
      bgEl.appendChild(img);
      bgEl.onclick = () => openLightbox(photos, 0);
    } catch (e) {
      // Keep atmospheric gradient fallback silently
    }
  }

  function processThumbQueue() {
    while (activeThumbFetches < 3 && thumbQueue.length) {
      const task = thumbQueue.shift();
      activeThumbFetches++;
      global.MediaWikidataService.fetchPlacePhotos({
        id: task.dest.id,
        lat: task.dest.coords && task.dest.coords[1],
        lng: task.dest.coords && task.dest.coords[0],
        name: task.dest.shortName || task.dest.name,
        country: task.dest.country,
        radiusM: 5000,
        limit: 1
      })
        .then((photos) => {
          if (photos && photos[0] && document.body.contains(task.slotEl)) {
            const p = photos[0];
            const img = document.createElement('img');
            img.src = p.thumbUrl;
            img.alt = task.dest.shortName || task.dest.name || '';
            img.loading = 'lazy';
            img.decoding = 'async';
            img.title = p.license || '';
            img.className = 'gallery-thumb-img';
            img.addEventListener('load', () => {
              img.classList.add('is-loaded');
              const ph = task.slotEl.querySelector('.gallery-thumb-placeholder');
              if (ph) ph.style.opacity = '0';
            }, { once: true });
            img.addEventListener('error', () => img.remove(), { once: true });
            task.slotEl.insertBefore(img, task.slotEl.firstChild);
          }
        })
        .catch(() => {})
        .finally(() => {
          activeThumbFetches--;
          processThumbQueue();
        });
    }
  }

  function observeGalleryThumbs(gridEl, destList) {
    if (!gridEl || !global.MediaWikidataService) return;
    if (galleryObserver) galleryObserver.disconnect();
    const byId = new Map((destList || []).map((d) => [d.id, d]));

    if (typeof IntersectionObserver === 'undefined') return;
    galleryObserver = new IntersectionObserver(
      (entries) => {
        entries.forEach((ent) => {
          if (!ent.isIntersecting) return;
          const slot = ent.target;
          galleryObserver.unobserve(slot);
          if (slot.dataset.queued === '1') return;
          slot.dataset.queued = '1';
          const dest = byId.get(slot.dataset.thumbId);
          if (dest) {
            thumbQueue.push({ dest, slotEl: slot });
            processThumbQueue();
          }
        });
      },
      { rootMargin: '140px' }
    );

    gridEl.querySelectorAll('.gallery-card-thumb[data-thumb-id]').forEach((el) => {
      galleryObserver.observe(el);
    });
  }

  global.MediaGallery = {
    openLightbox,
    closeLightbox,
    loadDestinationMedia,
    loadDrawerHeroBanner,
    loadSpotPhoto,
    loadWikidataBadge,
    observeGalleryThumbs
  };
})(window);
