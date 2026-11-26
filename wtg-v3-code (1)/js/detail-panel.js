(function (global) {
  'use strict';

  const MONTH_NAMES = ['1月', '2月', '3月', '4月', '5月', '6月', '7月', '8月', '9月', '10月', '11月', '12月'];

  const CONTINENT_LABELS = {
    asia: '亚洲',
    europe: '欧洲',
    oceania: '大洋洲',
    south_america: '南美洲',
    north_america: '北美洲',
    africa_antarctica: '非洲 / 南极'
  };

  function icon(name, size) {
    return global.AppIcons ? global.AppIcons.svg(name, size || 14) : '';
  }

  function t(key, vars) {
    return global.AppI18n ? global.AppI18n.t(key, vars) : key;
  }

  function tx(str) {
    return global.AppI18n ? global.AppI18n.tx(str) : (str || '');
  }

  function escapeHtml(str) {
    if (str === null || str === undefined) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function formatCoords(coords, decimals) {
    if (!Array.isArray(coords) || coords.length < 2) return '';
    const lng = Number(coords[0]);
    const lat = Number(coords[1]);
    const d = typeof decimals === 'number' ? decimals : 4;
    const latDir = lat >= 0 ? '°N' : '°S';
    const lngDir = lng >= 0 ? '°E' : '°W';
    return `${Math.abs(lat).toFixed(d)}${latDir}, ${Math.abs(lng).toFixed(d)}${lngDir}`;
  }

  function linkifyHtml(str) {
    if (str === null || str === undefined) return '';
    const text = String(str);
    const urlRe = /https?:\/\/[^\s<>'"），。；、）】\]]+/g;
    let out = '';
    let lastIdx = 0;
    let match;
    while ((match = urlRe.exec(text)) !== null) {
      let rawUrl = match[0];
      let trailing = '';
      while (rawUrl.length > 0 && /[.,;:!?\)\]]$/.test(rawUrl)) {
        if (rawUrl.endsWith(')') && (rawUrl.match(/\(/g) || []).length >= (rawUrl.match(/\)/g) || []).length) {
          break;
        }
        trailing = rawUrl.slice(-1) + trailing;
        rawUrl = rawUrl.slice(0, -1);
      }
      out += escapeHtml(text.slice(lastIdx, match.index));
      let host = rawUrl.replace(/^https?:\/\//i, '').split(/[/?#]/)[0].replace(/^www\./i, '');
      if (!host) host = t('refLink');
      const safeUrl = escapeHtml(rawUrl);
      out += `<a class="inline-ref-link" href="${safeUrl}" target="_blank" rel="noopener noreferrer" title="${safeUrl}">${icon('arrowUpRight', 11)}${escapeHtml(host)}</a>${escapeHtml(trailing)}`;
      lastIdx = match.index + match[0].length;
    }
    out += escapeHtml(text.slice(lastIdx));
    return out;
  }

  function formatRmb(num) {
    return '¥ ' + Number(num || 0).toLocaleString('zh-CN');
  }

  function renderStars(score) {
    const s = Math.max(1, Math.min(5, Number(score) || 3));
    return '★'.repeat(s) + '☆'.repeat(5 - s);
  }

  function updateJsonLd(dest) {
    const el = document.getElementById('dest-jsonld');
    if (!el) return;
    if (!dest) {
      el.textContent = '{}';
      return;
    }
    const payload = {
      '@context': 'https://schema.org',
      '@type': 'TouristDestination',
      name: dest.name,
      description: dest.heroSummary || dest.subtitle || '',
      geo: Array.isArray(dest.coords) && dest.coords.length >= 2
        ? {
            '@type': 'GeoCoordinates',
            latitude: dest.coords[1],
            longitude: dest.coords[0]
          }
        : undefined,
      containedInPlace: {
        '@type': 'Country',
        name: dest.country || ''
      }
    };
    el.textContent = JSON.stringify(payload);
  }

  const DetailPanel = {
    currentDest: null,
    activeTab: 'spots',
    selectedMonth: null,
    expandedSpotIndex: 0,
    sheetState: 'half',

    open: function (dest, preferredMonth) {
      if (!dest) return;
      const isNewDest = !this.currentDest || this.currentDest.id !== dest.id;
      this.currentDest = dest;
      if (isNewDest) {
        this.expandedSpotIndex = 0;
      }

      if (preferredMonth && preferredMonth !== 'all') {
        this.selectedMonth = Number(preferredMonth);
      } else {
        const best = (dest.months || []).reduce(
          (acc, cur) => (cur.score > acc.score ? cur : acc),
          { m: 10, score: 0 }
        );
        this.selectedMonth = best.m || 10;
      }

      this.renderHeader(dest);
      this.renderBody();
      updateJsonLd(dest);

      const drawer = document.getElementById('detail-drawer');
      if (drawer) {
        drawer.classList.remove('is-hidden');
        this.setSheetState('half');
      }
      document.body.classList.add('drawer-open');
    },

    close: function () {
      const drawer = document.getElementById('detail-drawer');
      if (drawer) drawer.classList.add('is-hidden');
      document.body.classList.remove('drawer-open');
      this.currentDest = null;
      this.expandedSpotIndex = 0;
      updateJsonLd(null);
    },

    setSheetState: function (nextState) {
      const valid = nextState === 'peek' || nextState === 'half' || nextState === 'full' ? nextState : 'half';
      this.sheetState = valid;
      const drawer = document.getElementById('detail-drawer');
      if (drawer) {
        drawer.setAttribute('data-sheet-state', valid);
        drawer.style.transform = '';
      }
      const expandBtn = document.getElementById('drawer-expand-btn');
      if (expandBtn) {
        expandBtn.innerHTML = icon(valid === 'full' ? 'minimize' : 'maximize', 14);
      }
    },

    cycleSheetState: function () {
      const next = this.sheetState === 'peek' ? 'half' : this.sheetState === 'half' ? 'full' : 'half';
      this.setSheetState(next);
    },

    setTab: function (tabName) {
      this.activeTab = tabName;
      document.querySelectorAll('#drawer-tabs .tab-btn').forEach((btn) => {
        const active = btn.dataset.tab === tabName;
        btn.classList.toggle('active', active);
        btn.setAttribute('aria-selected', active ? 'true' : 'false');
      });
      this.renderBody();
    },

    highlightSpot: function (idx) {
      this.expandedSpotIndex = idx;
      if (this.activeTab !== 'spots') {
        this.setTab('spots');
      } else {
        this.syncAccordionDOM();
      }
      requestAnimationFrame(() => {
        const card = document.querySelector(`.spot-card[data-spot-idx="${idx}"]`);
        if (card) {
          card.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        }
      });
    },

    syncAccordionDOM: function () {
      const body = document.getElementById('detail-body');
      if (!body) return;
      body.querySelectorAll('.spot-card').forEach((card) => {
        const i = Number(card.dataset.spotIdx);
        const active = i === this.expandedSpotIndex;
        card.classList.toggle('is-expanded', active);
        card.classList.toggle('highlighted', active);
        const btn = card.querySelector('.spot-accordion-head');
        if (btn) btn.setAttribute('aria-expanded', active ? 'true' : 'false');
      });
      body.querySelectorAll('.spot-chip').forEach((chip) => {
        chip.classList.toggle('active', Number(chip.dataset.idx) === this.expandedSpotIndex);
      });
    },

    renderHeader: function (dest) {
      const contLabel = global.AppI18n ? global.AppI18n.tContinent(dest.continent) : (CONTINENT_LABELS[dest.continent] || '全球');
      document.getElementById('drawer-breadcrumb').textContent =
        `${contLabel} · ${tx(dest.country)} · ${tx(dest.province || dest.region)}`;
      document.getElementById('drawer-title').textContent = tx(dest.name);
      document.getElementById('drawer-subtitle').textContent = tx(dest.subtitle);

      const badgeEl = document.getElementById('drawer-allweather-badge');
      if (dest.allWeather) {
        badgeEl.className = 'kicker-tag all-weather';
        badgeEl.textContent = t('badgeAllWeather');
      } else {
        badgeEl.className = 'kicker-tag seasonal';
        badgeEl.textContent = t('badgeSeasonal');
      }

      const coordsEl = document.getElementById('drawer-hero-coords');
      if (coordsEl) {
        coordsEl.textContent = formatCoords(dest.coords, 3);
      }

      // 12-month phenology ribbon
      const ribbonEl = document.getElementById('drawer-phenology-ribbon');
      if (ribbonEl) {
        const months = dest.months || [];
        const byM = new Map(months.map((m) => [m.m, m]));
        ribbonEl.innerHTML = Array.from({ length: 12 }, (_, idx) => {
          const m = idx + 1;
          const mo = byM.get(m) || { score: 2, highlight: '' };
          const title = `${t('monthFmt', { m })} · ${mo.score}★ ${tx(mo.highlight || '')}`.trim();
          return `<div class="ribbon-cell" data-month="${m}" data-score="${mo.score || 2}" title="${escapeHtml(title)}"><span class="ribbon-bar"></span><span class="ribbon-m">${m}</span></div>`;
        }).join('');
        ribbonEl.querySelectorAll('.ribbon-cell').forEach((cell) => {
          cell.addEventListener('click', () => {
            this.selectedMonth = Number(cell.dataset.month);
            this.setTab('months');
          });
        });
      }

      const metaStrip = document.getElementById('drawer-meta-strip');
      const parts = [
        `${t('elevationPrefix')} ${escapeHtml(tx(dest.elevation))}`,
        `${t('daysPrefix')} ${escapeHtml(tx(dest.suggestedDays))}`,
        ...(dest.badges || []).slice(0, 2).map((b) => escapeHtml(tx(b)))
      ].filter(Boolean);
      metaStrip.textContent = parts.join('  ·  ');

      let statusBar = document.getElementById('drawer-status-bar');
      if (!statusBar && metaStrip && metaStrip.parentNode) {
        statusBar = document.createElement('div');
        statusBar.id = 'drawer-status-bar';
        statusBar.className = 'drawer-status-bar';
        metaStrip.parentNode.insertBefore(statusBar, metaStrip.nextSibling);
      }
      if (statusBar && global.TravelArchive && typeof global.TravelArchive.renderDrawerStatusBar === 'function') {
        global.TravelArchive.renderDrawerStatusBar(dest, statusBar);
      } else if (statusBar) {
        statusBar.innerHTML = '';
      }

      document.getElementById('drawer-hero-summary').textContent = tx(dest.heroSummary);
      document.getElementById('tab-spots-count').textContent = dest.spots ? dest.spots.length : (dest.spotCount || 0);

      document.querySelectorAll('#drawer-tabs .tab-btn').forEach((btn) => {
        const active = btn.dataset.tab === this.activeTab;
        btn.classList.toggle('active', active);
        btn.setAttribute('aria-selected', active ? 'true' : 'false');
      });

      if (typeof global.syncFavoriteButtonUI === 'function') {
        global.syncFavoriteButtonUI(dest.id);
      }
    },

    renderBody: function () {
      const dest = this.currentDest;
      if (!dest) return;
      const body = document.getElementById('detail-body');

      let contentHtml = '';
      if (this.activeTab === 'spots') {
        contentHtml = `<div id="drawer-media-hero" class="media-hero-strip"></div>${this.buildSpotsHtml(dest)}`;
      } else if (this.activeTab === 'photo') {
        contentHtml = `<div id="photo-simulator-mount"></div>`;
      } else if (this.activeTab === 'months') {
        contentHtml = `${this.buildMonthsHtml(dest)}<div id="aesthetic-index-mount"></div>`;
      } else if (this.activeTab === 'weather') {
        contentHtml = `<div id="live-weather-mount"></div>${this.buildWeatherHtml(dest)}`;
      } else if (this.activeTab === 'budget') {
        contentHtml = this.buildBudgetHtml(dest);
      } else if (this.activeTab === 'itinerary') {
        contentHtml = this.buildItineraryHtml(dest);
      }

      const provenanceHtml = `${this.buildProvenanceHtml(dest)}<div id="wikidata-verify-mount"></div>`;
      body.innerHTML = `<div class="drawer-body-inner">${contentHtml}${provenanceHtml}</div>`;

      if (global.MediaGallery) {
        const heroEl = body.querySelector('#drawer-media-hero');
        if (heroEl && this.activeTab === 'spots') {
          global.MediaGallery.loadDestinationMedia(dest, heroEl);
        }
        const wdEl = body.querySelector('#wikidata-verify-mount');
        if (wdEl) {
          global.MediaGallery.loadWikidataBadge(dest, wdEl);
        }
      }

      if (this.activeTab === 'photo' && global.PhotoSimulator) {
        global.PhotoSimulator.mount(dest, body.querySelector('#photo-simulator-mount'), this.expandedSpotIndex);
      }
      if (this.activeTab === 'weather' && global.WeatherPanel) {
        global.WeatherPanel.mount(dest, body.querySelector('#live-weather-mount'));
      }
      if (this.activeTab === 'months' && global.AestheticIndex) {
        global.AestheticIndex.mountDrawerBreakdown(dest, this.selectedMonth, body.querySelector('#aesthetic-index-mount'));
      }

      if (this.activeTab === 'spots') {
        if (global.MediaGallery && Array.isArray(dest.spots) && this.expandedSpotIndex >= 0 && dest.spots[this.expandedSpotIndex]) {
          const initPhotoBox = body.querySelector(`.spot-card[data-spot-idx="${this.expandedSpotIndex}"] .spot-photo-box`);
          if (initPhotoBox) global.MediaGallery.loadSpotPhoto(dest, dest.spots[this.expandedSpotIndex], this.expandedSpotIndex, initPhotoBox);
        }
        body.querySelectorAll('.spot-accordion-head').forEach((btn) => {
          btn.addEventListener('click', () => {
            const idx = Number(btn.dataset.idx);
            this.expandedSpotIndex = this.expandedSpotIndex === idx ? -1 : idx;
            this.syncAccordionDOM();
            if (this.expandedSpotIndex >= 0) {
              if (typeof global.focusSubSpotMarkerOnly === 'function') {
                global.focusSubSpotMarkerOnly(idx);
              }
              if (global.MediaGallery && Array.isArray(dest.spots) && dest.spots[idx]) {
                const pBox = body.querySelector(`.spot-card[data-spot-idx="${idx}"] .spot-photo-box`);
                if (pBox) global.MediaGallery.loadSpotPhoto(dest, dest.spots[idx], idx, pBox);
              }
            }
          });
        });

        const flyHandler = (el) => {
          el.addEventListener('click', (e) => {
            e.stopPropagation();
            const idx = Number(el.dataset.idx);
            this.expandedSpotIndex = idx;
            this.syncAccordionDOM();
            if (typeof global.flyToSubSpot === 'function') {
              global.flyToSubSpot(idx);
            }
          });
        };
        body.querySelectorAll('.spot-locate-btn').forEach(flyHandler);
        body.querySelectorAll('.spot-chip').forEach(flyHandler);

        body.querySelectorAll('.spot-sim-btn').forEach((btn) => {
          btn.addEventListener('click', (e) => {
            e.stopPropagation();
            this.expandedSpotIndex = Number(btn.dataset.idx);
            this.setTab('photo');
          });
        });
        body.querySelectorAll('.spot-sv-btn').forEach((btn) => {
          btn.addEventListener('click', (e) => {
            e.stopPropagation();
            const idx = Number(btn.dataset.idx);
            if (global.StreetViewModule && Array.isArray(dest.spots) && dest.spots[idx]) {
              global.StreetViewModule.open(dest, dest.spots[idx], idx);
            }
          });
        });
        body.querySelectorAll('.spot-plan-btn').forEach((btn) => {
          btn.addEventListener('click', (e) => {
            e.stopPropagation();
            const idx = Number(btn.dataset.idx);
            if (global.TripPlanner && Array.isArray(dest.spots) && dest.spots[idx]) {
              global.TripPlanner.addSpotToActiveTrip(dest, dest.spots[idx]);
            }
          });
        });
      } else if (this.activeTab === 'months') {
        body.querySelectorAll('.month-cell').forEach((cell) => {
          cell.addEventListener('click', () => {
            this.selectedMonth = Number(cell.dataset.month);
            this.renderBody();
          });
        });
      }

      const retryBtn = body.querySelector('#retry-detail-btn');
      if (retryBtn) {
        retryBtn.addEventListener('click', () => {
          if (typeof global.TRAVEL_ATLAS?.ensureDetail === 'function') {
            dest._detailFailed = false;
            this.renderBody();
            global.TRAVEL_ATLAS.ensureDetail(dest.id).then((hydrated) => {
              if (hydrated && this.currentDest && this.currentDest.id === dest.id) {
                this.open(hydrated, this.selectedMonth);
              }
            });
          }
        });
      }

      body.scrollTop = 0;
    },

    buildPendingHtml: function (dest) {
      if (dest && dest._detailFailed) {
        return `
          <div style="padding:24px 4px;color:var(--text-secondary);font-size:12.5px;display:flex;align-items:center;gap:10px;flex-wrap:wrap;">
            <span>详情分片加载超时，请重试</span>
            <button id="retry-detail-btn" class="text-btn" type="button" style="border:1px solid var(--border-strong);padding:4px 10px;border-radius:999px;">重新加载</button>
          </div>
        `;
      }
      return `<div style="padding:24px 4px;color:var(--text-muted);font-size:12.5px;">${t('loadingDetail')}</div>`;
    },

    buildSpotsHtml: function (dest) {
      if (!Array.isArray(dest.spots)) {
        return this.buildPendingHtml(dest);
      }
      const spots = dest.spots;
      return spots
        .map((sp, i) => {
          const isExpanded = this.expandedSpotIndex === i;
          const expCls = isExpanded ? 'is-expanded highlighted' : '';
          const catBadge = sp.category
            ? `<div class="spot-cat-label">${escapeHtml(tx(sp.category))}</div>`
            : '';
          return `
            <article class="spot-card ${expCls}" data-spot-idx="${i}">
              <button class="spot-accordion-head" type="button" data-idx="${i}" aria-expanded="${isExpanded ? 'true' : 'false'}">
                <div class="spot-title-wrap">
                  <span class="spot-index">${String(i + 1).padStart(2, '0')}</span>
                  <div>
                    <h4 class="spot-name">${escapeHtml(tx(sp.name))}</h4>
                    ${catBadge}
                  </div>
                </div>
                <span class="spot-chevron">${icon('chevronDown', 15)}</span>
              </button>
              <div class="spot-accordion-body">
                <div class="spot-accordion-inner">
                  <div class="spot-accordion-pad">
                    <div class="spot-locate-row">
                      <span class="mono-num" style="font-size:11px;color:var(--text-muted)">${formatCoords(sp.coords, 4)} · ${escapeHtml(tx(sp.elevation))}</span>
                      <button class="spot-locate-btn" data-idx="${i}" type="button">${icon('target', 12)} ${t('flyToSpot')}</button>
                    </div>
                    <div class="spot-photo-box" data-spot-photo-idx="${i}"></div>
                    <div class="spot-coords-row">${linkifyHtml(tx(sp.access))}</div>
                    <div class="spot-field"><strong>${t('goldenHour')}</strong>${escapeHtml(tx(sp.bestTime))}</div>
                    <div class="spot-field"><strong>${t('realScene')}</strong>${escapeHtml(tx(sp.scene))}</div>
                    <div class="spot-tips">${linkifyHtml(tx(sp.tips))}</div>
                    <div class="spot-actions-row">
                      <button class="mini-action-pill spot-sim-btn" data-idx="${i}" type="button">${icon('sun', 12)} 光影模拟</button>
                      <button class="mini-action-pill spot-sv-btn" data-idx="${i}" type="button">${icon('eye', 12)} 街景/实景</button>
                      <button class="mini-action-pill spot-plan-btn" data-idx="${i}" type="button">${icon('route', 12)} 加入行程</button>
                    </div>
                  </div>
                </div>
              </div>
            </article>
          `;
        })
        .join('');
    },

    buildMonthsHtml: function (dest) {
      if (!Array.isArray(dest.months) || !dest.months.length) {
        return this.buildPendingHtml(dest);
      }
      const months = dest.months;
      const cells = months
        .map((mo) => {
          const active = mo.m === this.selectedMonth ? 'active' : '';
          const cls = mo.score >= 5 ? 'm-score-5' : mo.score === 4 ? 'm-score-4' : '';
          return `
            <button class="month-cell ${cls} ${active}" data-month="${mo.m}" type="button">
              <div class="month-name">${t('monthFmt', { m: mo.m })}</div>
              <div class="month-stars">${renderStars(mo.score)}</div>
              <div class="month-temp">${escapeHtml(tx(mo.temp))}</div>
            </button>
          `;
        })
        .join('');

      const cur = months.find((x) => x.m === this.selectedMonth) || months[0];
      const lat = Number((dest.coords && dest.coords[1]) || 0);
      const hemiHint = lat >= 0 ? t('hemiNorth') : t('hemiSouth');
      const detailBox = cur
        ? `
          <div class="month-detail-box">
            <div class="month-detail-head">
              <h4>${t('monthArchiveFmt', { m: cur.m, hemi: hemiHint })}</h4>
              <span class="weather-rating">${t('recommendScore')} ${renderStars(cur.score)}</span>
            </div>
            <div class="month-kv-row">
              <div class="month-kv"><span>${t('tempRange')}</span><strong class="mono-num">${escapeHtml(tx(cur.temp))}</strong></div>
              <div class="month-kv"><span>${t('climateFeature')}</span><strong>${escapeHtml(tx(cur.rain))}</strong></div>
            </div>
            <div class="spot-field"><strong>${t('monthHighlight')}</strong>${escapeHtml(tx(cur.highlight))}</div>
          </div>
        `
        : '';

      return `<div class="month-grid">${cells}</div>${detailBox}`;
    },

    buildWeatherHtml: function (dest) {
      if (!dest.weather || typeof dest.weather !== 'object') {
        return this.buildPendingHtml(dest);
      }
      const w = dest.weather;
      const cards = [
        { key: 'sunny', iconName: 'sun', label: t('weatherSunnyTitle'), data: w.sunny },
        { key: 'rainy', iconName: 'cloudRain', label: t('weatherRainyTitle'), data: w.rainy },
        { key: 'snowy', iconName: 'snowflake', label: t('weatherSnowyTitle'), data: w.snowy },
        { key: 'special', iconName: 'aurora', label: t('weatherSpecialTitle'), data: w.special }
      ];
      return cards
        .map((c) => {
          const d = c.data || {};
          const triggerHtml = d.trigger
            ? `<div class="weather-trigger"><strong>${t('weatherTrigger')}</strong>${linkifyHtml(tx(d.trigger))}</div>`
            : '';
          const gearHtml = d.gear
            ? `<div class="weather-gear"><strong>${t('weatherGear')}</strong>${linkifyHtml(tx(d.gear))}</div>`
            : '';
          return `
            <article class="weather-card">
              <div class="weather-card-head">
                <div class="weather-card-title">${icon(c.iconName, 14)} ${c.label}${d.title ? ` · ${escapeHtml(tx(d.title))}` : ''}</div>
                <span class="weather-rating">${escapeHtml(tx(d.rating || ''))}</span>
              </div>
              <p class="weather-desc">${linkifyHtml(tx(d.desc || ''))}</p>
              ${triggerHtml}
              ${gearHtml}
            </article>
          `;
        })
        .join('');
    },

    buildBudgetHtml: function (dest) {
      if (!dest.budget || typeof dest.budget !== 'object') {
        return this.buildPendingHtml(dest);
      }
      const b = dest.budget;
      const tiers = [
        { key: 'luxury', cls: 'luxury', label: t('budgetLuxury'), data: b.luxury },
        { key: 'comfort', cls: 'comfort', label: t('budgetComfort'), data: b.comfort }
      ];
      return tiers
        .map((tItem) => {
          const td = tItem.data || { unitLabel: '', items: [], note: '' };
          const total = (td.items || []).reduce((sum, it) => sum + (Number(it.cost) || 0), 0);
          const usdApprox = Math.round(total / 7.2);
          const rows = (td.items || [])
            .map(
              (it) => `
                <div class="budget-row">
                  <div class="budget-row-left">
                    <span class="budget-cat">[${escapeHtml(tx(it.category))}]</span>
                    <span class="budget-detail">${linkifyHtml(tx(it.detail))}</span>
                  </div>
                  <div class="budget-cost">${formatRmb(it.cost)}</div>
                </div>
              `
            )
            .join('');
          return `
            <section class="budget-tier-card ${tItem.cls}">
              <div class="budget-tier-head">
                <div>
                  <div class="budget-tier-title">${tItem.label}</div>
                  <div class="budget-tier-sub">${escapeHtml(tx(td.unitLabel))}</div>
                </div>
                <div class="budget-total">
                  <div class="budget-total-rmb">${formatRmb(total)}</div>
                  <div class="budget-total-usd">${t('approxUsd', { usd: usdApprox.toLocaleString('en-US') })}</div>
                </div>
              </div>
              <div class="budget-rows">${rows}</div>
              <div class="budget-note">${linkifyHtml(tx(td.note || ''))}</div>
            </section>
          `;
        })
        .join('');
    },

    buildItineraryHtml: function (dest) {
      if (!Array.isArray(dest.itinerary) || !dest.itinerary.length) {
        return this.buildPendingHtml(dest);
      }
      const steps = dest.itinerary;
      return `
        <div class="timeline">
          ${steps
            .map(
              (st) => `
                <div class="timeline-item">
                  <div class="timeline-day">${escapeHtml(tx(st.day))}</div>
                  <h4 class="timeline-title">${escapeHtml(tx(st.title))}</h4>
                  <p class="timeline-plan">${linkifyHtml(tx(st.plan))}</p>
                </div>
              `
            )
            .join('')}
        </div>
      `;
    },

    buildProvenanceHtml: function (dest) {
      const note = dest.verificationNote || dest.sourceNote || dest.dataNotes || dest.researchNotes || '';
      const extra = note ? `<div style="margin-top:4px">${linkifyHtml(tx(note))}</div>` : '';
      return `
        <div class="provenance-footer">
          <div><strong>${t('provenanceTitle')}</strong> · <span class="mono-num">${escapeHtml(dest.id)}</span></div>
          <div>${t('provenanceNote')}</div>
          ${extra}
        </div>
      `;
    }
  };

  /* Mobile 3-Stage Bottom Sheet Touch Drag & Velocity Snap */
  function bindMobileSheetGesture() {
    const handle = document.getElementById('drawer-drag-handle');
    const drawer = document.getElementById('detail-drawer');
    if (!handle || !drawer) return;

    let dragging = false;
    let startY = 0;
    let baseTranslate = 0;
    let lastY = 0;
    let lastTime = 0;
    let velocity = 0;

    function getStateOffset(st) {
      const vh = global.innerHeight || 800;
      const sheetH = vh * 0.92;
      if (st === 'full') return 0;
      if (st === 'half') return Math.round(vh * 0.38);
      return Math.max(120, Math.round(sheetH - 148));
    }

    handle.addEventListener('pointerdown', (e) => {
      if (global.innerWidth > 768) return;
      dragging = true;
      startY = e.clientY;
      lastY = e.clientY;
      lastTime = performance.now();
      velocity = 0;
      baseTranslate = getStateOffset(DetailPanel.sheetState);
      drawer.classList.add('is-dragging');
      handle.setPointerCapture(e.pointerId);
    });

    handle.addEventListener('pointermove', (e) => {
      if (!dragging) return;
      const now = performance.now();
      const dt = Math.max(1, now - lastTime);
      velocity = (e.clientY - lastY) / dt;
      lastY = e.clientY;
      lastTime = now;

      const peekMax = getStateOffset('peek');
      const nextY = Math.max(0, Math.min(peekMax + 40, baseTranslate + (e.clientY - startY)));
      drawer.style.transform = `translate3d(0, ${nextY}px, 0)`;
    });

    function finishDrag(e) {
      if (!dragging) return;
      dragging = false;
      drawer.classList.remove('is-dragging');
      if (handle.hasPointerCapture && handle.hasPointerCapture(e.pointerId)) {
        handle.releasePointerCapture(e.pointerId);
      }

      const deltaY = e.clientY - startY;
      const currentY = baseTranslate + deltaY;
      const fullY = getStateOffset('full');
      const halfY = getStateOffset('half');
      const peekY = getStateOffset('peek');

      if (velocity < -0.45) {
        DetailPanel.setSheetState(DetailPanel.sheetState === 'peek' ? 'half' : 'full');
      } else if (velocity > 0.45) {
        DetailPanel.setSheetState(DetailPanel.sheetState === 'full' ? 'half' : 'peek');
      } else {
        const distances = [
          { st: 'full', d: Math.abs(currentY - fullY) },
          { st: 'half', d: Math.abs(currentY - halfY) },
          { st: 'peek', d: Math.abs(currentY - peekY) }
        ].sort((a, b) => a.d - b.d);
        DetailPanel.setSheetState(distances[0].st);
      }
    }

    handle.addEventListener('pointerup', finishDrag);
    handle.addEventListener('pointercancel', finishDrag);
  }

  document.addEventListener('DOMContentLoaded', bindMobileSheetGesture);

  global.DetailPanel = DetailPanel;
})(window);
