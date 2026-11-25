(function (global) {
  'use strict';

  const ATLAS = global.TRAVEL_ATLAS;
  const Panel = global.DetailPanel;

  const state = {
    continent: 'global',
    month: 'all',
    theme: 'all',
    weather: 'all',
    query: '',
    skin: 'satellite',
    showLabels: true,
    forceAllLabels: false,
    isGlobe: true,
    isSpinning: false,
    selectedId: null,
    subSpotMarkers: [],
    mainMarkers: new Map()
  };

  let map = null;
  let hoverPopup = null;
  let spinRaf = null;

  function isMobileViewport() {
    return global.innerWidth <= 768;
  }

  function isCoarsePointer() {
    return Boolean(global.matchMedia && global.matchMedia('(hover: none), (pointer: coarse)').matches);
  }

  function buildStyle() {
    return {
      version: 8,
      projection: { type: 'globe' },
      sky: {
        'sky-color': '#0b1838',
        'horizon-color': '#3f84d1',
        'sky-horizon-blend': 0.52,
        'atmosphere-blend': ['interpolate', ['linear'], ['zoom'], 0, 1, 5, 0.72, 7, 0]
      },
      sources: {
        satellite: {
          type: 'raster',
          tiles: ['https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}'],
          tileSize: 256,
          maxzoom: 18,
          attribution: 'Esri World Imagery'
        },
        natgeo: {
          type: 'raster',
          tiles: ['https://services.arcgisonline.com/ArcGIS/rest/services/NatGeo_World_Map/MapServer/tile/{z}/{y}/{x}'],
          tileSize: 256,
          maxzoom: 16,
          attribution: 'National Geographic & Esri'
        },
        physical: {
          type: 'raster',
          tiles: ['https://services.arcgisonline.com/ArcGIS/rest/services/World_Physical_Map/MapServer/tile/{z}/{y}/{x}'],
          tileSize: 256,
          maxzoom: 10,
          attribution: 'Esri World Physical'
        },
        dark: {
          type: 'raster',
          tiles: ['https://a.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}.png'],
          tileSize: 256,
          maxzoom: 18,
          attribution: 'CartoDB Dark Matter'
        },
        labels: {
          type: 'raster',
          tiles: ['https://services.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}'],
          tileSize: 256,
          maxzoom: 18
        },
        subroute: {
          type: 'geojson',
          data: { type: 'FeatureCollection', features: [] }
        }
      },
      layers: [
        { id: 'layer-satellite', type: 'raster', source: 'satellite', layout: { visibility: 'visible' } },
        { id: 'layer-natgeo', type: 'raster', source: 'natgeo', layout: { visibility: 'none' } },
        { id: 'layer-physical', type: 'raster', source: 'physical', layout: { visibility: 'none' } },
        { id: 'layer-dark', type: 'raster', source: 'dark', layout: { visibility: 'none' } },
        { id: 'layer-labels', type: 'raster', source: 'labels', layout: { visibility: 'visible' }, paint: { 'raster-opacity': 0.9 } },
        {
          id: 'subroute-line',
          type: 'line',
          source: 'subroute',
          paint: {
            'line-color': '#fbbf24',
            'line-width': 2.5,
            'line-dasharray': [2, 2],
            'line-opacity': 0.88
          }
        }
      ]
    };
  }

  function countCountries(list) {
    const set = new Set();
    (list || []).forEach((d) => {
      String(d.country || '')
        .split('/')
        .map((s) => s.trim())
        .filter(Boolean)
        .forEach((c) => set.add(c));
    });
    return set.size;
  }

  const SIDEBAR_TITLES = {
    global: '🌍 全球精选目的地',
    asia: '🏯 亚洲精选目的地',
    europe: '🏰 欧洲精选目的地',
    oceania: '🦘 大洋洲精选目的地',
    north_america: '🦅 北美洲精选目的地',
    south_america: '🦙 南美洲精选目的地',
    africa_antarctica: '🦁 非洲 / 南极精选目的地'
  };

  function getActiveScopeContinent() {
    if (state.query.trim()) return 'global';
    const info = ATLAS.getContinent(state.continent);
    if (state.continent !== 'global' && info && info.status === 'active') {
      return state.continent;
    }
    return 'global';
  }

  function matchesFilter(dest) {
    const scopeCont = getActiveScopeContinent();
    if (scopeCont !== 'global' && dest.continent !== scopeCont) {
      return false;
    }
    if (state.month !== 'all') {
      const mNum = Number(state.month);
      const mo = (dest.months || []).find((x) => x.m === mNum);
      if (!mo || mo.score < 4) return false;
    }
    if (state.theme !== 'all') {
      const themes = dest.themeTags || [];
      if (!themes.includes(state.theme)) return false;
    }
    if (state.weather !== 'all') {
      if (state.weather === 'allWeather') {
        if (!dest.allWeather) return false;
      } else {
        const tags = dest.weatherTags || [];
        if (!tags.includes(state.weather)) return false;
      }
    }
    if (state.query.trim()) {
      const q = state.query.trim().toLowerCase();
      const hay = [
        dest.country || '',
        dest.name,
        dest.shortName || '',
        dest.subtitle,
        dest.province,
        dest.region,
        dest.heroSummary,
        (dest.badges || []).join(' '),
        (dest.spots || []).map((s) => `${s.name} ${s.category || ''} ${s.scene || ''}`).join(' ')
      ]
        .join(' ')
        .toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  }

  function getFilteredIds() {
    const set = new Set();
    ATLAS.getAll().forEach((d) => {
      if (matchesFilter(d)) set.add(d.id);
    });
    return set;
  }

  function clearSubSpots() {
    state.subSpotMarkers.forEach((m) => m.remove());
    state.subSpotMarkers = [];
    state.mainMarkers.forEach((marker) => {
      marker.getElement().classList.remove('has-subspots');
    });
    if (map && map.getSource('subroute')) {
      map.getSource('subroute').setData({ type: 'FeatureCollection', features: [] });
    }
    document.getElementById('subspot-toast').classList.add('hidden');
  }

  function renderSubSpots(dest) {
    clearSubSpots();
    if (!dest || !dest.spots || !dest.spots.length) return;

    const lineCoords = dest.spots.map((s) => s.coords);
    if (map.getSource('subroute') && lineCoords.length >= 2) {
      map.getSource('subroute').setData({
        type: 'FeatureCollection',
        features: [
          {
            type: 'Feature',
            geometry: { type: 'LineString', coordinates: lineCoords }
          }
        ]
      });
    }

    dest.spots.forEach((sp, idx) => {
      const root = document.createElement('div');
      root.className = 'subspot-pin-root';
      const baseTag = sp.name.split(/[·&（(/]/)[0].trim();
      const shortTag = baseTag.length > 8 ? baseTag.slice(0, 7) + '…' : baseTag;
      root.innerHTML = `<div class="subspot-pin-inner" title="${sp.name}"><span class="subspot-num">${idx + 1}</span><span class="subspot-tag">${shortTag}</span></div>`;
      root.addEventListener('click', (e) => {
        e.stopPropagation();
        flyToSubSpot(idx);
      });
      const marker = new maplibregl.Marker({
        element: root,
        anchor: 'center',
        subpixelPositioning: true
      })
        .setLngLat(sp.coords)
        .addTo(map);
      state.subSpotMarkers.push(marker);
    });

    const toast = document.getElementById('subspot-toast');
    document.getElementById('subspot-toast-text').textContent =
      `已标注「${dest.name}」${dest.spots.length} 个精准子机位（点击编号直接俯冲实景）`;
    toast.classList.remove('hidden');
  }

  function getDrawerViewportPadding() {
    const sidebar = document.getElementById('left-sidebar');
    const drawer = document.getElementById('detail-drawer');
    const drawerOpen = Boolean(drawer && !drawer.classList.contains('hidden'));
    if (isMobileViewport()) {
      return {
        top: 112,
        bottom: drawerOpen ? Math.round(global.innerHeight * 0.66) : 68,
        left: 16,
        right: 16
      };
    }
    const leftPad = (sidebar && !sidebar.classList.contains('hidden')) ? 305 : 24;
    const rightPad = drawerOpen ? Math.min(580, Math.round(global.innerWidth * 0.45)) : 24;
    return { top: 112, bottom: 68, left: leftPad, right: rightPad };
  }

  function flyToSubSpot(idx) {
    const dest = ATLAS.getById(state.selectedId);
    if (!dest || !dest.spots || !dest.spots[idx]) return;
    stopSpin();
    const sp = dest.spots[idx];
    state.subSpotMarkers.forEach((m, i) => {
      m.getElement().classList.toggle('active', i === idx);
    });
    map.flyTo({
      center: sp.coords,
      zoom: 12.6,
      pitch: 52,
      bearing: (idx % 2 === 0 ? 18 : -18),
      padding: getDrawerViewportPadding(),
      duration: 1450,
      essential: true
    });
    Panel.highlightSpot(idx);
  }
  global.flyToSubSpot = flyToSubSpot;

  function selectDestination(id, instant) {
    const dest = ATLAS.getById(id);
    if (!dest) return;
    stopSpin();
    state.selectedId = id;
    document.getElementById('continent-banner').classList.add('hidden');

    if (isMobileViewport()) {
      document.getElementById('left-sidebar').classList.add('hidden');
      document.getElementById('sidebar-open-btn').classList.remove('hidden');
      const filtersBar = document.querySelector('.topbar-filters');
      const filterBtn = document.getElementById('mobile-filter-toggle');
      if (filtersBar) filtersBar.classList.remove('mobile-open');
      if (filterBtn) {
        filterBtn.setAttribute('aria-expanded', 'false');
        filterBtn.textContent = '🔍 筛选';
      }
      const drawerEl = document.getElementById('detail-drawer');
      const expandBtn = document.getElementById('drawer-expand-btn');
      if (drawerEl) drawerEl.classList.remove('sheet-expanded');
      if (expandBtn) expandBtn.textContent = '⤢ 展开';
    }

    renderSubSpots(dest);
    Panel.open(dest, state.month);
    updateSelectionUI();

    const camOpts = {
      center: dest.coords,
      zoom: dest.zoom || 9.0,
      pitch: 42,
      bearing: 0,
      padding: getDrawerViewportPadding()
    };
    if (instant) {
      map.jumpTo(camOpts);
    } else {
      map.flyTo(Object.assign({}, camOpts, { duration: 1500, essential: true }));
    }
  }

  function closeDestination() {
    state.selectedId = null;
    clearSubSpots();
    Panel.close();
    updateSelectionUI();
  }

  function updateSelectionUI() {
    state.mainMarkers.forEach((marker, id) => {
      const el = marker.getElement();
      const isSelected = id === state.selectedId;
      el.classList.toggle('selected', isSelected);
      el.classList.toggle('has-subspots', isSelected);
    });
    document.querySelectorAll('.city-nav-item').forEach((btn) => {
      btn.classList.toggle('active', btn.dataset.id === state.selectedId);
    });
    updateLabelDensity();
  }

  function updateLabelDensity() {
    if (!map) return;
    const zoom = map.getZoom();
    const isFiltering = state.month !== 'all' || state.theme !== 'all' || state.weather !== 'all' || state.query.trim() !== '';
    const showAll = state.forceAllLabels || zoom >= 4.1 || isFiltering;
    const matched = getFilteredIds();

    state.mainMarkers.forEach((marker, id) => {
      const dest = ATLAS.getById(id);
      const el = marker.getElement();
      const isMatched = matched.has(id);
      const shouldShow = isMatched && (showAll || (dest && dest.priority === 1) || id === state.selectedId);
      el.classList.toggle('label-hidden', !shouldShow);
    });
  }

  function renderMainMarkers() {
    const all = ATLAS.getAll();
    all.forEach((dest) => {
      const root = document.createElement('div');
      root.className = `globe-pin-root ${dest.allWeather ? 'pin-gold' : 'pin-cyan'}`;
      root.innerHTML = `
        <div class="globe-pin-inner">
          <span class="pin-pulse"><span class="pin-core"></span></span>
          <span class="pin-label">${dest.shortName || dest.name}</span>
        </div>
      `;
      root.addEventListener('mouseenter', () => {
        if (isCoarsePointer()) return;
        if (!hoverPopup) {
          hoverPopup = new maplibregl.Popup({ closeButton: false, closeOnClick: false, offset: 18 });
        }
        const badge = dest.allWeather ? '🌟 四季晴雨雪皆美' : '🎯 季节/气象限定';
        const locLabel = (dest.country && dest.country !== '中国') ? `${dest.country} · ${dest.province}` : dest.province;
        hoverPopup
          .setLngLat(dest.coords)
          .setHTML(`
            <div style="font-weight:700;font-size:13px;margin-bottom:3px;">${dest.name}</div>
            <div style="color:#38bdf8;font-size:11px;margin-bottom:4px;">${locLabel} · ${badge}</div>
            <div style="color:#cbd5e1;font-size:11px;line-height:1.45;">${dest.subtitle}</div>
            <div style="color:#fbbf24;font-size:10.5px;margin-top:5px;">点击地球仪俯冲查看 ${dest.spots.length} 个精准机位 →</div>
          `)
          .addTo(map);
      });
      root.addEventListener('mouseleave', () => {
        if (isCoarsePointer()) return;
        if (hoverPopup) hoverPopup.remove();
      });
      root.addEventListener('click', (e) => {
        e.stopPropagation();
        if (hoverPopup) hoverPopup.remove();
        selectDestination(dest.id);
      });

      const marker = new maplibregl.Marker({
        element: root,
        anchor: 'center',
        subpixelPositioning: true
      })
        .setLngLat(dest.coords)
        .addTo(map);
      state.mainMarkers.set(dest.id, marker);
    });
  }

  function renderSidebar() {
    const all = ATLAS.getAll();
    const matched = getFilteredIds();
    const listEl = document.getElementById('sidebar-list');
    const isFiltering = state.month !== 'all' || state.theme !== 'all' || state.weather !== 'all' || state.query.trim() !== '';
    const scopeCont = getActiveScopeContinent();
    const scopeTotal = scopeCont === 'global'
      ? all.length
      : all.filter((d) => d.continent === scopeCont).length;

    const titleEl = document.querySelector('.sidebar-title');
    if (titleEl) {
      titleEl.textContent = SIDEBAR_TITLES[scopeCont] || SIDEBAR_TITLES.global;
    }

    document.getElementById('reset-filters-btn').classList.toggle('hidden', !isFiltering);
    document.getElementById('sidebar-count').textContent = `${matched.size} / ${scopeTotal} 城`;

    // Dim/highlight markers on the 3D globe
    state.mainMarkers.forEach((marker, id) => {
      marker.getElement().classList.toggle('dimmed', !matched.has(id));
    });
    updateLabelDensity();

    const grouped = new Map();
    ATLAS.REGION_ORDER.forEach((r) => grouped.set(r, []));
    all.forEach((d) => {
      if (!matched.has(d.id)) return;
      if (!grouped.has(d.region)) grouped.set(d.region, []);
      grouped.get(d.region).push(d);
    });

    let html = '';
    grouped.forEach((items, regionName) => {
      if (!items.length) return;
      const meta = ATLAS.REGION_META[regionName] || { icon: '📍' };
      html += `
        <div class="region-group">
          <div class="region-header">
            <span>${meta.icon} ${regionName}</span>
            <span>${items.length}</span>
          </div>
          <div class="region-items">
            ${items
              .map((d) => {
                let rightBadge = `<span class="city-nav-prov">${d.suggestedDays}</span>`;
                if (state.month !== 'all') {
                  const mo = d.months.find((x) => x.m === Number(state.month));
                  const sc = mo ? mo.score : 3;
                  const cls = sc >= 5 ? 'score-5' : sc === 4 ? 'score-4' : sc === 3 ? 'score-3' : 'score-low';
                  rightBadge = `<span class="score-pill ${cls}">${sc}★</span>`;
                }
                const dotCls = d.allWeather ? 'dot-gold' : 'dot-cyan';
                const activeCls = d.id === state.selectedId ? 'active' : '';
                return `
                  <button class="city-nav-item ${activeCls}" data-id="${d.id}">
                    <span class="city-nav-left">
                      <span class="dot ${dotCls}"></span>
                      <span class="city-nav-name">${d.name}</span>
                    </span>
                    <span class="city-nav-right">${rightBadge}</span>
                  </button>
                `;
              })
              .join('')}
          </div>
        </div>
      `;
    });

    if (!html) {
      html = `<div style="padding:24px 12px;text-align:center;color:#94a3b8;font-size:12px;">当前筛选条件下暂无匹配目的地，可点击右上角“重置筛选”。</div>`;
    }
    listEl.innerHTML = html;

    listEl.querySelectorAll('.city-nav-item').forEach((btn) => {
      btn.addEventListener('click', () => selectDestination(btn.dataset.id));
    });
  }

  function renderContinentTabs() {
    const container = document.getElementById('continent-tabs');
    const countsByCont = {};
    ATLAS.getAll().forEach((d) => {
      countsByCont[d.continent] = (countsByCont[d.continent] || 0) + 1;
    });
    container.innerHTML = ATLAS.CONTINENTS.map((c) => {
      const cnt = countsByCont[c.id] || 0;
      const tag = cnt > 0 ? `<span class="continent-tag">${cnt}城</span>` : '';
      const active = c.id === state.continent ? 'active' : '';
      return `<button class="continent-btn ${active}" data-continent="${c.id}">${c.icon} ${c.name}${tag}</button>`;
    }).join('');

    container.querySelectorAll('.continent-btn').forEach((btn) => {
      btn.addEventListener('click', () => switchContinent(btn.dataset.continent));
    });
  }

  function switchContinent(continentId) {
    stopSpin();
    state.continent = continentId;
    const info = ATLAS.getContinent(continentId);

    document.querySelectorAll('.continent-btn').forEach((b) => {
      b.classList.toggle('active', b.dataset.continent === continentId);
    });

    map.flyTo({
      center: info.center,
      zoom: info.zoom,
      pitch: info.pitch || 16,
      bearing: 0,
      duration: 1400,
      essential: true
    });

    const banner = document.getElementById('continent-banner');
    if (continentId === 'global' || info.status === 'active') {
      banner.classList.add('hidden');
      if (state.selectedId) {
        const cur = ATLAS.getById(state.selectedId);
        if (!cur || continentId === 'global' || cur.continent !== continentId) {
          closeDestination();
        }
      }
      renderSidebar();
      return;
    }

    closeDestination();
    banner.classList.remove('hidden');
    document.getElementById('banner-round').textContent = info.round;
    document.getElementById('banner-title').textContent = `${info.icon} ${info.name}（待建设轮次）`;
    document.getElementById('banner-desc').textContent =
      '已按照全球大洲轮次锁定经纬度视角与国家清单。已完成亚欧大洋南北美五大洲，将按同款杭州级颗粒度在此大洲逐一放上真实坐标与全气象方案。';
    document.getElementById('banner-chips').innerHTML = info.plannedCountries
      .map((name) => `<span class="country-chip">⏳ ${typeof name === 'string' ? name : name.name}</span>`)
      .join('');
    renderSidebar();
  }

  function switchSkin(skinId) {
    state.skin = skinId;
    const skins = ['satellite', 'natgeo', 'physical', 'dark'];
    skins.forEach((s) => {
      const layerId = `layer-${s}`;
      if (map.getLayer(layerId)) {
        map.setLayoutProperty(layerId, 'visibility', s === skinId ? 'visible' : 'none');
      }
    });
    document.querySelectorAll('[data-skin]').forEach((btn) => {
      btn.classList.toggle('active', btn.dataset.skin === skinId);
    });
  }

  function spinStep() {
    if (!state.isSpinning || !map) return;
    const c = map.getCenter();
    c.lng = (c.lng + 0.16) > 180 ? c.lng + 0.16 - 360 : c.lng + 0.16;
    map.setCenter(c);
    spinRaf = requestAnimationFrame(spinStep);
  }

  function startSpin() {
    if (state.isSpinning) return;
    state.isSpinning = true;
    document.getElementById('toggle-spin-btn').classList.add('active');
    spinStep();
  }

  function stopSpin() {
    state.isSpinning = false;
    if (spinRaf) cancelAnimationFrame(spinRaf);
    spinRaf = null;
    const btn = document.getElementById('toggle-spin-btn');
    if (btn) btn.classList.remove('active');
  }

  function bindEvents() {
    document.getElementById('month-filter').addEventListener('change', (e) => {
      state.month = e.target.value;
      renderSidebar();
      if (state.selectedId && state.month !== 'all') {
        const dest = ATLAS.getById(state.selectedId);
        if (dest) Panel.open(dest, state.month);
      }
    });

    document.querySelectorAll('#theme-pills .pill-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        state.theme = btn.dataset.theme;
        document.querySelectorAll('#theme-pills .pill-btn').forEach((b) => {
          b.classList.toggle('active', b === btn);
        });
        renderSidebar();
      });
    });

    document.querySelectorAll('#weather-pills .pill-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        state.weather = btn.dataset.weather;
        document.querySelectorAll('#weather-pills .pill-btn').forEach((b) => {
          b.classList.toggle('active', b === btn);
        });
        renderSidebar();
      });
    });

    const searchInput = document.getElementById('search-input');
    const clearBtn = document.getElementById('search-clear');
    searchInput.addEventListener('input', (e) => {
      state.query = e.target.value;
      clearBtn.classList.toggle('hidden', !state.query);
      renderSidebar();
    });
    clearBtn.addEventListener('click', () => {
      searchInput.value = '';
      state.query = '';
      clearBtn.classList.add('hidden');
      renderSidebar();
    });

    document.getElementById('reset-filters-btn').addEventListener('click', () => {
      state.month = 'all';
      state.theme = 'all';
      state.weather = 'all';
      state.query = '';
      document.getElementById('month-filter').value = 'all';
      document.getElementById('search-input').value = '';
      document.getElementById('search-clear').classList.add('hidden');
      document.querySelectorAll('#theme-pills .pill-btn').forEach((b) => {
        b.classList.toggle('active', b.dataset.theme === 'all');
      });
      document.querySelectorAll('#weather-pills .pill-btn').forEach((b) => {
        b.classList.toggle('active', b.dataset.weather === 'all');
      });
      renderSidebar();
    });

    document.getElementById('sidebar-collapse-btn').addEventListener('click', () => {
      document.getElementById('left-sidebar').classList.add('hidden');
      document.getElementById('sidebar-open-btn').classList.remove('hidden');
    });

    document.getElementById('sidebar-open-btn').addEventListener('click', () => {
      document.getElementById('left-sidebar').classList.remove('hidden');
      document.getElementById('sidebar-open-btn').classList.add('hidden');
    });

    document.getElementById('banner-close').addEventListener('click', () => {
      document.getElementById('continent-banner').classList.add('hidden');
    });

    document.getElementById('banner-fly-china').addEventListener('click', () => {
      switchContinent('global');
    });

    document.querySelectorAll('[data-skin]').forEach((btn) => {
      btn.addEventListener('click', () => switchSkin(btn.dataset.skin));
    });

    document.getElementById('toggle-labels-btn').addEventListener('click', (e) => {
      state.showLabels = !state.showLabels;
      e.currentTarget.classList.toggle('active', state.showLabels);
      if (map.getLayer('layer-labels')) {
        map.setLayoutProperty('layer-labels', 'visibility', state.showLabels ? 'visible' : 'none');
      }
    });

    document.getElementById('toggle-all-labels-btn').addEventListener('click', (e) => {
      state.forceAllLabels = !state.forceAllLabels;
      e.currentTarget.classList.toggle('active', state.forceAllLabels);
      updateLabelDensity();
    });

    document.getElementById('toggle-proj-btn').addEventListener('click', (e) => {
      state.isGlobe = !state.isGlobe;
      map.setProjection({ type: state.isGlobe ? 'globe' : 'mercator' });
      e.currentTarget.classList.toggle('active', state.isGlobe);
      e.currentTarget.textContent = state.isGlobe ? '🌐 3D球体' : '🗺️ 2D平面';
    });

    document.getElementById('toggle-spin-btn').addEventListener('click', () => {
      if (state.isSpinning) stopSpin();
      else startSpin();
    });

    document.getElementById('fly-china-btn').addEventListener('click', () => {
      stopSpin();
      closeDestination();
      state.continent = 'asia';
      document.querySelectorAll('.continent-btn').forEach((b) => {
        b.classList.toggle('active', b.dataset.continent === 'asia');
      });
      document.getElementById('continent-banner').classList.add('hidden');
      renderSidebar();
      map.flyTo({ center: [104.5, 34.5], zoom: 3.15, pitch: 22, bearing: 0, padding: { top: 0, bottom: 0, left: 0, right: 0 }, duration: 1400 });
    });

    document.getElementById('fly-global-btn').addEventListener('click', () => {
      switchContinent('global');
    });

    document.getElementById('back-to-city-overview').addEventListener('click', () => {
      const dest = ATLAS.getById(state.selectedId);
      if (dest) {
        map.flyTo({ center: dest.coords, zoom: dest.zoom || 9.0, pitch: 42, bearing: 0, padding: getDrawerViewportPadding(), duration: 1100 });
      }
    });

    document.getElementById('drawer-close-btn').addEventListener('click', closeDestination);

    const mobileFilterBtn = document.getElementById('mobile-filter-toggle');
    if (mobileFilterBtn) {
      mobileFilterBtn.addEventListener('click', () => {
        const filtersBar = document.querySelector('.topbar-filters');
        if (!filtersBar) return;
        const isOpen = filtersBar.classList.toggle('mobile-open');
        mobileFilterBtn.setAttribute('aria-expanded', isOpen ? 'true' : 'false');
        mobileFilterBtn.textContent = isOpen ? '✕ 收起筛选' : '🔍 筛选';
      });
    }

    const drawerExpandBtn = document.getElementById('drawer-expand-btn');
    if (drawerExpandBtn) {
      drawerExpandBtn.addEventListener('click', () => {
        const drawerEl = document.getElementById('detail-drawer');
        if (!drawerEl) return;
        const expanded = drawerEl.classList.toggle('sheet-expanded');
        drawerExpandBtn.textContent = expanded ? '⤡ 半屏' : '⤢ 展开';
      });
    }

    const shareBtn = document.getElementById('share-dest-btn');
    if (shareBtn) {
      shareBtn.addEventListener('click', async () => {
        if (!state.selectedId) return;
        const dest = ATLAS.getById(state.selectedId);
        const baseUrl = (global.location.origin && global.location.origin !== 'null')
          ? `${global.location.origin}${global.location.pathname}`
          : global.location.href.split('?')[0].split('#')[0];
        const shareUrl = `${baseUrl}?focus=${encodeURIComponent(state.selectedId)}`;
        const flashCopied = () => {
          shareBtn.textContent = '✅ 已复制';
          setTimeout(() => { shareBtn.textContent = '🔗 分享'; }, 1800);
        };
        if (isCoarsePointer() && global.navigator && typeof global.navigator.share === 'function') {
          try {
            await global.navigator.share({
              title: dest ? dest.name : '全球梦想旅游地球仪',
              text: dest ? `${dest.country} · ${dest.subtitle}` : '3D 交互卫星旅行地球仪',
              url: shareUrl
            });
            return;
          } catch (err) {
            if (err && err.name === 'AbortError') return;
          }
        }
        try {
          if (global.navigator && global.navigator.clipboard && global.navigator.clipboard.writeText) {
            await global.navigator.clipboard.writeText(shareUrl);
            flashCopied();
            return;
          }
        } catch (err) {
          // fallback below
        }
        const ta = document.createElement('textarea');
        ta.value = shareUrl;
        ta.setAttribute('readonly', '');
        ta.style.position = 'fixed';
        ta.style.opacity = '0';
        document.body.appendChild(ta);
        ta.select();
        try {
          document.execCommand('copy');
          flashCopied();
        } finally {
          document.body.removeChild(ta);
        }
      });
    }

    document.querySelectorAll('#drawer-tabs .tab-btn').forEach((btn) => {
      btn.addEventListener('click', () => Panel.setTab(btn.dataset.tab));
    });

    function stepDestination(delta) {
      const all = ATLAS.getAll().filter(matchesFilter);
      if (!all.length) return;
      const idx = all.findIndex((d) => d.id === state.selectedId);
      const nextIdx = idx === -1 ? 0 : (idx + delta + all.length) % all.length;
      selectDestination(all[nextIdx].id);
    }

    document.getElementById('prev-dest-btn').addEventListener('click', () => stepDestination(-1));
    document.getElementById('next-dest-btn').addEventListener('click', () => stepDestination(1));

    global.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && state.selectedId) {
        closeDestination();
      }
    });
  }

  function init() {
    const all = ATLAS.getAll();
    const totalSpots = all.reduce((sum, d) => sum + (d.spots ? d.spots.length : 0), 0);
    const countryCount = countCountries(all);
    document.getElementById('atlas-stats-line').textContent =
      `已点亮：全球七大洲全面封神 · ${countryCount} 国/地区 · ${all.length} 城 · ${totalSpots} 个精准机位（滚轮缩放 · 拖拽旋转地球）`;

    renderContinentTabs();

    if (isMobileViewport()) {
      document.getElementById('left-sidebar').classList.add('hidden');
      document.getElementById('sidebar-open-btn').classList.remove('hidden');
    }

    map = new maplibregl.Map({
      container: 'map',
      style: buildStyle(),
      center: [72.0, 22.0],
      zoom: 1.65,
      pitch: 14,
      minZoom: 1.1,
      maxZoom: 17.5,
      attributionControl: false
    });

    map.addControl(new maplibregl.NavigationControl({ visualizePitch: true }), 'bottom-right');

    map.on('mousedown', stopSpin);
    map.on('wheel', stopSpin);
    map.on('touchstart', stopSpin);
    map.on('zoom', updateLabelDensity);

    map.on('load', () => {
      renderMainMarkers();
      renderSidebar();
      const params = new URLSearchParams(global.location.search);
      const focusId = params.get('focus');
      if (focusId && ATLAS.getById(focusId)) {
        selectDestination(focusId, params.get('instant') === '1');
      }
    });

    bindEvents();
  }

  document.addEventListener('DOMContentLoaded', init);
})(window);
