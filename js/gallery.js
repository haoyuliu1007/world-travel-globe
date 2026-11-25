(function (global) {
  'use strict';

  const PAGE_SIZE = 36;
  let activeCollection = 'all';
  let visibleLimit = PAGE_SIZE;
  let getFilteredFn = null;
  let getFavoritesFn = null;
  let onSelectFn = null;
  let onBackToMapFn = null;

  function icon(name, size) {
    return global.AppIcons ? global.AppIcons.svg(name, size || 13) : '';
  }

  function t(key, vars) {
    return global.AppI18n ? global.AppI18n.t(key, vars) : key;
  }

  function tx(str) {
    return global.AppI18n ? global.AppI18n.tx(str) : (str || '');
  }

  function escapeHtml(str) {
    return String(str || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function formatCoords(coords) {
    if (!Array.isArray(coords) || coords.length < 2) return '';
    const lng = Number(coords[0]);
    const lat = Number(coords[1]);
    return `${Math.abs(lat).toFixed(2)}°${lat >= 0 ? 'N' : 'S'} ${Math.abs(lng).toFixed(2)}°${lng >= 0 ? 'E' : 'W'}`;
  }

  function filterByCollection(list) {
    const favs = typeof getFavoritesFn === 'function' ? getFavoritesFn() : new Set();
    if (activeCollection === 'nature') {
      return list.filter((d) => (d.themeTags || []).includes('nature'));
    }
    if (activeCollection === 'architecture') {
      return list.filter((d) => (d.themeTags || []).includes('architecture'));
    }
    if (activeCollection === 'allWeather') {
      return list.filter((d) => Boolean(d.allWeather));
    }
    if (activeCollection === 'special') {
      return list.filter((d) => (d.weatherTags || []).includes('special'));
    }
    if (activeCollection === 'favorites') {
      return list.filter((d) => favs.has(d.id));
    }
    return list;
  }

  function render() {
    const grid = document.getElementById('gallery-grid');
    const countEl = document.getElementById('gallery-count');
    if (!grid) return;

    const baseList = typeof getFilteredFn === 'function' ? getFilteredFn() : [];
    const items = filterByCollection(baseList);
    if (countEl) countEl.textContent = t('destCountFmt', { n: items.length });

    if (!items.length) {
      grid.innerHTML = `
        <div class="gallery-more-wrap" style="flex-direction:column;gap:8px;padding:48px 16px;color:var(--text-secondary);">
          <div>${t('emptyGallery')}</div>
        </div>
      `;
      return;
    }

    const slice = items.slice(0, visibleLimit);
    const cardsHtml = slice
      .map((d) => {
        const months = d.months || [];
        const byM = new Map(months.map((m) => [m.m, m.score]));
        const ribbon = Array.from({ length: 12 }, (_, idx) => {
          const sc = (Array.isArray(d.monthScores) && d.monthScores[idx]) || byM.get(idx + 1) || 2;
          return `<span class="gallery-ribbon-seg" data-score="${sc}"></span>`;
        }).join('');
        return `
          <button class="gallery-card" data-id="${escapeHtml(d.id)}" type="button">
            <div class="gallery-card-top">
              <span class="gallery-card-country">${escapeHtml(tx(d.country))} · ${escapeHtml(tx(d.region))}</span>
              <span class="gallery-card-coords mono-num">${formatCoords(d.coords)}</span>
            </div>
            <h3 class="gallery-card-title">${escapeHtml(tx(d.name))}</h3>
            <p class="gallery-card-sub">${escapeHtml(tx(d.subtitle || d.heroSummary))}</p>
            <div class="gallery-card-ribbon">${ribbon}</div>
            <div class="gallery-card-foot">
              <span class="mono-num">${t('spotsCountFmt', { n: d.spotCount || (d.spots ? d.spots.length : 0) })} · ${escapeHtml(tx(d.suggestedDays))}</span>
              <span class="gallery-card-cta">${t('flyCoord')} ${icon('arrowUpRight', 13)}</span>
            </div>
          </button>
        `;
      })
      .join('');

    const moreHtml = items.length > visibleLimit
      ? `<div class="gallery-more-wrap"><button class="text-btn" id="gallery-load-more" type="button">${t('loadMore', { n: items.length - visibleLimit })}</button></div>`
      : '';

    grid.innerHTML = cardsHtml + moreHtml;

    grid.querySelectorAll('.gallery-card').forEach((card) => {
      card.addEventListener('click', () => {
        const id = card.dataset.id;
        if (typeof onSelectFn === 'function') onSelectFn(id);
      });
    });

    const moreBtn = document.getElementById('gallery-load-more');
    if (moreBtn) {
      moreBtn.addEventListener('click', () => {
        visibleLimit += PAGE_SIZE;
        render();
      });
    }
  }

  function init(opts) {
    getFilteredFn = opts.getFiltered;
    getFavoritesFn = opts.getFavorites;
    onSelectFn = opts.onSelect;
    onBackToMapFn = opts.onBackToMap;

    document.querySelectorAll('#gallery-collections .gallery-tab').forEach((btn) => {
      btn.addEventListener('click', () => {
        activeCollection = btn.dataset.collection;
        visibleLimit = PAGE_SIZE;
        document.querySelectorAll('#gallery-collections .gallery-tab').forEach((b) => {
          b.classList.toggle('active', b === btn);
        });
        render();
      });
    });

    const backBtn = document.getElementById('gallery-back-map-btn');
    if (backBtn) {
      backBtn.addEventListener('click', () => {
        if (typeof onBackToMapFn === 'function') onBackToMapFn();
      });
    }
  }

  global.AestheticGallery = {
    init,
    render
  };
})(window);
