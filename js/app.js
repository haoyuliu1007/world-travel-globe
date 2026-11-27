(function (global) {
  'use strict';

  const ATLAS = global.TRAVEL_ATLAS;
  const Panel = global.DetailPanel;
  const Icons = global.AppIcons;
  const I18n = global.AppI18n;
  const Theme = global.AppTheme;

  function t(key, vars) {
    return I18n ? I18n.t(key, vars) : key;
  }

  function tx(str) {
    return I18n ? I18n.tx(str) : (str || '');
  }

  const FAVORITES_KEY = 'wtg_favorites_v1';
  const TILE_MODE_KEY = 'wtg_tile_mode_v1';

  const GLOBAL_TILE_URLS = {
    satellite: ['https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}'],
    natgeo: ['https://services.arcgisonline.com/ArcGIS/rest/services/NatGeo_World_Map/MapServer/tile/{z}/{y}/{x}'],
    physical: ['https://services.arcgisonline.com/ArcGIS/rest/services/World_Physical_Map/MapServer/tile/{z}/{y}/{x}'],
    dark: ['https://a.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}.png'],
    labels: ['https://services.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}']
  };

  const CN_TILE_URLS = {
    satellite: [
      'https://webst01.is.autonavi.com/appmaptile?style=6&x={x}&y={y}&z={z}',
      'https://webst02.is.autonavi.com/appmaptile?style=6&x={x}&y={y}&z={z}',
      'https://webst03.is.autonavi.com/appmaptile?style=6&x={x}&y={y}&z={z}',
      'https://webst04.is.autonavi.com/appmaptile?style=6&x={x}&y={y}&z={z}'
    ],
    natgeo: [
      'https://webrd01.is.autonavi.com/appmaptile?lang=zh_cn&size=1&scale=1&style=8&x={x}&y={y}&z={z}',
      'https://webrd02.is.autonavi.com/appmaptile?lang=zh_cn&size=1&scale=1&style=8&x={x}&y={y}&z={z}',
      'https://webrd03.is.autonavi.com/appmaptile?lang=zh_cn&size=1&scale=1&style=8&x={x}&y={y}&z={z}',
      'https://webrd04.is.autonavi.com/appmaptile?lang=zh_cn&size=1&scale=1&style=8&x={x}&y={y}&z={z}'
    ],
    physical: GLOBAL_TILE_URLS.physical,
    dark: GLOBAL_TILE_URLS.dark,
    labels: [
      'https://wprd01.is.autonavi.com/appmaptile?lang=zh_cn&size=1&style=8&x={x}&y={y}&z={z}&scl=1&ltype=4',
      'https://wprd02.is.autonavi.com/appmaptile?lang=zh_cn&size=1&style=8&x={x}&y={y}&z={z}&scl=1&ltype=4',
      'https://wprd03.is.autonavi.com/appmaptile?lang=zh_cn&size=1&style=8&x={x}&y={y}&z={z}&scl=1&ltype=4',
      'https://wprd04.is.autonavi.com/appmaptile?lang=zh_cn&size=1&style=8&x={x}&y={y}&z={z}&scl=1&ltype=4'
    ]
  };

  let activeTileRoute = 'global';
  let workerTileAvailable = false;

  function loadSavedTileMode() {
    try {
      const val = global.localStorage.getItem(TILE_MODE_KEY);
      if (val === 'cn' || val === 'global' || val === 'worker') return val;
    } catch (e) {
      // ignore
    }
    return 'auto';
  }

  function saveTileMode(mode) {
    try {
      if (mode === 'auto') global.localStorage.removeItem(TILE_MODE_KEY);
      else global.localStorage.setItem(TILE_MODE_KEY, mode);
    } catch (e) {
      // ignore
    }
  }

  function getTileUrls(skinKey, effectiveMode) {
    if (effectiveMode === 'worker') {
      return [`/api/tile/${skinKey}/{z}/{y}/{x}`];
    }
    if (effectiveMode === 'cn') {
      return CN_TILE_URLS[skinKey] || GLOBAL_TILE_URLS[skinKey];
    }
    return GLOBAL_TILE_URLS[skinKey];
  }

  function updateTileRouteButton(effectiveMode) {
    const btn = document.getElementById('toggle-tile-cdn-btn');
    if (!btn) return;
    const keyMap = {
      cn: 'tileRouteCn',
      worker: 'tileRouteWorker',
      global: 'tileRouteGlobal'
    };
    const key = keyMap[effectiveMode] || 'tileRouteAuto';
    btn.setAttribute('data-i18n', key);
    btn.textContent = t(key);
    btn.classList.toggle('active', effectiveMode === 'cn' || effectiveMode === 'worker');
  }

  function applyTileSourceMode(effectiveMode) {
    activeTileRoute = effectiveMode;
    updateTileRouteButton(effectiveMode);
    if (!map || !map.isStyleLoaded || !map.isStyleLoaded()) return;
    ['satellite', 'natgeo', 'physical', 'dark', 'labels'].forEach((skinKey) => {
      const src = map.getSource(skinKey);
      if (src && typeof src.setTiles === 'function') {
        src.setTiles(getTileUrls(skinKey, effectiveMode));
      }
    });
  }

  function probeImageLoad(url, timeoutMs) {
    return new Promise((resolve) => {
      if (typeof Image === 'undefined') {
        resolve({ ok: false, ms: timeoutMs });
        return;
      }
      const start = Date.now();
      const img = new Image();
      let done = false;
      const finish = (ok) => {
        if (done) return;
        done = true;
        clearTimeout(timer);
        img.onload = null;
        img.onerror = null;
        resolve({ ok, ms: Date.now() - start });
      };
      const timer = setTimeout(() => finish(false), timeoutMs || 3500);
      img.onload = () => finish(true);
      img.onerror = () => finish(false);
      img.src = url;
    });
  }

  async function initAutoTileRoute() {
    const saved = loadSavedTileMode();
    if (global.ApiClient) {
      const caps = await global.ApiClient.detectWorkerCapabilities().catch(() => null);
      workerTileAvailable = Boolean(caps && caps.available && caps.features && caps.features.tile);
    }
    if (saved === 'cn' || saved === 'global' || (saved === 'worker' && workerTileAvailable)) {
      applyTileSourceMode(saved);
      return;
    }
    if (workerTileAvailable) {
      applyTileSourceMode('worker');
      return;
    }
    const [esriRes, cnRes] = await Promise.all([
      probeImageLoad('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/2/1/3', 3500),
      probeImageLoad('https://webst01.is.autonavi.com/appmaptile?style=6&x=3&y=1&z=2', 3500)
    ]);
    if ((!esriRes.ok || esriRes.ms >= 3500) && cnRes.ok) {
      applyTileSourceMode('cn');
    } else {
      applyTileSourceMode('global');
    }
  }

  const SKIN_META = {
    satellite: { maxZoom: 17.5, label: '卫星' },
    natgeo: { maxZoom: 15.8, label: '国家地理' },
    physical: { maxZoom: 10.2, label: '地形' },
    dark: { maxZoom: 17.5, label: '暗夜' }
  };

  const WEATHER_LABELS = {
    allWeather: '四季皆美',
    sunny: '晴天星空',
    rain: '烟雨云海',
    snow: '雪景蓝冰',
    special: '极限奇观'
  };

  const THEME_LABELS = {
    nature: '自然奇观',
    architecture: '城市建筑'
  };

  const state = {
    continent: 'global',
    month: 'all',
    theme: 'all',
    weather: 'all',
    onlyFavorites: false,
    query: '',
    skin: 'satellite',
    mode: 'map',
    showLabels: false,
    forceAllLabels: false,
    isGlobe: true,
    isSpinning: false,
    clustering: true,
    isFullscreen: false,
    selectedId: null,
    activeSpotIdx: -1,
    favorites: new Set(),
    subSpotMarkers: [],
    activeBeaconMarker: null
  };

  let map = null;
  let appInitialized = false;
  let isEmbedMode = false;
  let webglFailed = false;
  let wasSpinningBeforeHide = false;
  let hoverPopup = null;
  let hoveredFeatureId = null;
  let spinRaf = null;
  let lastSpinTime = 0;
  let labelRaf = null;
  let skinFadeTimer = null;
  let introTimer = null;
  let isIntroFlight = false;
  let suppressPopState = false;

  // Pre-built index for sub-millisecond filtering & phenology counts
  let atlasIndex = [];
  let indexById = new Map();
  let lastMatchedIds = new Set();
  const expandedRegions = new Set();
  let clusterIndex = null;
  let drawnClusters = [];

  // Zero-DOM-churn HiDPI Canvas 2D label layer
  let labelCanvas = null;
  let labelCtx = null;
  let drawnLabelBoxes = [];
  const labelWidthCache = new Map();
  let targetButtonZoom = null;
  let lastZoomBtnAt = 0;
  let hoverCloseTimer = null;

  function prefersReducedMotion() {
    return Boolean(global.matchMedia && global.matchMedia('(prefers-reduced-motion: reduce)').matches);
  }

  // 1:1 Parallax Deep Space Skyboxes (Milky Way & Aurora) + Retina 3D Starfield
  const SKYBOX_KEY = 'wtg_skybox_v4';
  const SKYBOX_PRESETS = [
    { id: 'milkyway', labelKey: 'skyMilkyway', url: 'assets/skyboxes/milkyway.jpg', starCount: 750, starBoost: 0.85 },
    { id: 'aurora', labelKey: 'skyAurora', url: 'assets/skyboxes/aurora.jpg', starCount: 950, starBoost: 0.95 }
  ];

  function resolveSeasonToken(monthVal) {
    if (monthVal === 'all' || monthVal == null) return 'all';
    const m = Number(monthVal);
    if (m === 12 || m === 1 || m === 2) return 'winter';
    if (m >= 3 && m <= 5) return 'spring';
    if (m >= 6 && m <= 8) return 'summer';
    if (m >= 9 && m <= 11) return 'autumn';
    return 'all';
  }

  function syncSeasonAndSkyboxAttrs() {
    if (!document.documentElement) return;
    document.documentElement.dataset.season = resolveSeasonToken(state && state.month);
    document.documentElement.dataset.skybox = starfield.getPreset();
  }

  const starfield = (() => {
    const MAX_STARS = 1700;
    const DEG2RAD = Math.PI / 180;

    let canvas = null;
    let ctx = null;
    let layerA = null;
    let layerB = null;
    let activeLayerSlot = 0; // 0 -> layerA, 1 -> layerB
    let layerToken = 0;
    const loadedUrls = new Set();

    let starsData = null;
    let width = 0;
    let height = 0;
    let dpr = 1;
    let rafId = 0;
    let isBlank = true;

    function getPresetMeta(id) {
      return SKYBOX_PRESETS.find((p) => p.id === id) || SKYBOX_PRESETS[0];
    }

    function loadInitialPresetId() {
      try {
        const saved = global.localStorage.getItem(SKYBOX_KEY);
        if (saved && SKYBOX_PRESETS.some((p) => p.id === saved)) return saved;
      } catch (e) {
        // ignore
      }
      return 'milkyway';
    }

    let currentPresetId = loadInitialPresetId();

    function createRng(seed) {
      let s = seed >>> 0;
      return () => {
        s = (s + 0x6D2B79F5) >>> 0;
        let t = Math.imul(s ^ (s >>> 15), 1 | s);
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
      };
    }

    function buildStarCatalog() {
      const rand = createRng(20260722);
      const list = new Array(MAX_STARS);
      const spectral = [
        [204, 224, 255], // cool sapphire-white
        [242, 246, 255], // pure pearl
        [255, 245, 224], // pale champagne
        [255, 226, 186]  // warm amber-white
      ];

      for (let i = 0; i < MAX_STARS; i++) {
        const u = rand() * 2 - 1;
        const theta = rand() * Math.PI * 2;
        const s = Math.sqrt(Math.max(0, 1 - u * u));
        const tier = rand();
        let r;
        let alpha;
        let isAnchor = false;
        if (tier < 0.76) {
          r = 0.45 + rand() * 0.30;
          alpha = 0.18 + rand() * 0.20;
        } else if (tier < 0.96) {
          r = 0.75 + rand() * 0.30;
          alpha = 0.40 + rand() * 0.24;
        } else {
          r = 1.05 + rand() * 0.30;
          alpha = 0.66 + rand() * 0.19;
          isAnchor = true;
        }

        const spPick = rand();
        const rgb = spPick < 0.26
          ? spectral[0]
          : (spPick < 0.68 ? spectral[1] : (spPick < 0.89 ? spectral[2] : spectral[3]));

        list[i] = {
          x: s * Math.cos(theta),
          y: u,
          z: s * Math.sin(theta),
          r,
          alpha,
          isAnchor,
          rgb: `${rgb[0]},${rgb[1]},${rgb[2]}`
        };
      }
      return list;
    }

    function applyBackdropLayer(meta) {
      if (!layerA || !layerB) {
        layerA = document.getElementById('skybox-layer-a');
        layerB = document.getElementById('skybox-layer-b');
      }
      if (!layerA || !layerB) return;

      const token = ++layerToken;
      if (!meta || !meta.url) {
        layerA.classList.remove('is-active');
        layerB.classList.remove('is-active');
        return;
      }

      const activate = () => {
        if (token !== layerToken) return;
        const nextSlot = activeLayerSlot === 0 ? 1 : 0;
        const incoming = nextSlot === 0 ? layerA : layerB;
        const outgoing = nextSlot === 0 ? layerB : layerA;
        incoming.style.backgroundImage = `url("${meta.url}")`;
        incoming.classList.add('is-active');
        outgoing.classList.remove('is-active');
        activeLayerSlot = nextSlot;
      };

      if (loadedUrls.has(meta.url)) {
        activate();
        return;
      }

      const img = new Image();
      img.decoding = 'async';
      img.onload = () => {
        loadedUrls.add(meta.url);
        activate();
      };
      img.src = meta.url;
    }

    function ensureCanvas() {
      if (!canvas) {
        canvas = document.getElementById('starfield-canvas');
        layerA = document.getElementById('skybox-layer-a');
        layerB = document.getElementById('skybox-layer-b');
        if (!canvas) return false;
        ctx = canvas.getContext('2d');
        starsData = buildStarCatalog();
        syncSeasonAndSkyboxAttrs();
        applyBackdropLayer(getPresetMeta(currentPresetId));
      }
      return Boolean(ctx);
    }

    function resize() {
      if (!ensureCanvas()) return;
      dpr = Math.min(global.devicePixelRatio || 1, 2);
      width = global.innerWidth || 1;
      height = global.innerHeight || 1;
      const targetW = Math.round(width * dpr);
      const targetH = Math.round(height * dpr);
      if (canvas.width !== targetW || canvas.height !== targetH) {
        canvas.width = targetW;
        canvas.height = targetH;
      }
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      scheduleRender();
    }

    function computeCameraBasis(center, bearing, pitch) {
      const latR = center.lat * DEG2RAD;
      const lngR = center.lng * DEG2RAD;
      const bR = bearing * DEG2RAD;
      const pR = pitch * 0.55 * DEG2RAD;

      const cosLat = Math.cos(latR);
      const sinLat = Math.sin(latR);
      const cosLng = Math.cos(lngR);
      const sinLng = Math.sin(lngR);

      const fx = -cosLat * cosLng;
      const fy = -sinLat;
      const fz = -cosLat * sinLng;

      const ex = -sinLng;
      const ez = cosLng;

      const nx = -sinLat * cosLng;
      const ny = cosLat;
      const nz = -sinLat * sinLng;

      const cosB = Math.cos(bR);
      const sinB = Math.sin(bR);
      const rx = ex * cosB - nx * sinB;
      const ry = -ny * sinB;
      const rz = ez * cosB - nz * sinB;

      const ux0 = ex * sinB + nx * cosB;
      const uy0 = ny * cosB;
      const uz0 = ez * sinB + nz * cosB;

      const cosP = Math.cos(pR);
      const sinP = Math.sin(pR);
      return {
        right: [rx, ry, rz],
        up: [-fx * sinP + ux0 * cosP, -fy * sinP + uy0 * cosP, -fz * sinP + uz0 * cosP],
        forward: [fx * cosP + ux0 * sinP, fy * cosP + uy0 * sinP, fz * cosP + uz0 * sinP]
      };
    }

    function updateParallax(center, pitch, reduced) {
      if (!layerA || !layerB) return;
      if (reduced) {
        layerA.style.transform = 'translate3d(0, 0, 0)';
        layerB.style.transform = 'translate3d(0, 0, 0)';
        return;
      }
      const tx = Math.sin(center.lng * DEG2RAD * 1.25) * (width * 0.024);
      const ty = (Math.sin(center.lat * DEG2RAD * 1.5) * 0.7 + Math.sin(pitch * DEG2RAD) * 0.3) * (height * 0.024);
      const xf = `translate3d(${tx.toFixed(2)}px, ${ty.toFixed(2)}px, 0)`;
      layerA.style.transform = xf;
      layerB.style.transform = xf;
    }

    function render() {
      rafId = 0;
      if (!ensureCanvas()) return;
      if (!width || !height) {
        resize();
        return;
      }

      const zoom = map && typeof map.getZoom === 'function' ? map.getZoom() : 1.8;
      if (zoom >= 5.2) {
        if (!isBlank) {
          ctx.clearRect(0, 0, width, height);
          isBlank = true;
        }
        return;
      }

      ctx.clearRect(0, 0, width, height);
      isBlank = false;

      const reduced = prefersReducedMotion() || !map || typeof map.getCenter !== 'function';
      const center = reduced ? { lng: 108, lat: 24 } : map.getCenter();
      const bearing = reduced ? 0 : map.getBearing();
      const pitch = reduced ? 0 : map.getPitch();

      updateParallax(center, pitch, reduced);

      const cx = width * 0.5;
      const cy = height * 0.5;
      const cam = computeCameraBasis(center, bearing, pitch);
      const focal = Math.max(width, height) * 0.92;
      const zoomFade = zoom <= 3.6 ? 1 : Math.max(0, 1 - (zoom - 3.6) / 1.6);

      const meta = getPresetMeta(currentPresetId);
      const perfCfg = global.__wtgPerfConfig || { starDensity: 1.0 };
      const starDensity = Number.isFinite(Number(perfCfg.starDensity)) ? Number(perfCfg.starDensity) : 1.0;
      const count = Math.min(MAX_STARS, Math.round((meta.starCount || MAX_STARS) * starDensity));
      const boost = meta.starBoost || 1.0;

      for (let i = 0; i < count; i++) {
        const st = starsData[i];
        const zCam = st.x * cam.forward[0] + st.y * cam.forward[1] + st.z * cam.forward[2];
        if (zCam <= 0.14) continue;

        const xCam = st.x * cam.right[0] + st.y * cam.right[1] + st.z * cam.right[2];
        const yCam = st.x * cam.up[0] + st.y * cam.up[1] + st.z * cam.up[2];
        const sx = cx + (xCam / zCam) * focal;
        const sy = cy - (yCam / zCam) * focal;

        if (sx < -6 || sx > width + 6 || sy < -6 || sy > height + 6) continue;

        const a = Math.min(0.95, st.alpha * boost * zoomFade);
        if (st.isAnchor) {
          const haloR = st.r * 3.2;
          const grad = ctx.createRadialGradient(sx, sy, 0, sx, sy, haloR);
          grad.addColorStop(0, `rgba(${st.rgb},${Math.min(0.32, a * 0.24).toFixed(3)})`);
          grad.addColorStop(1, `rgba(${st.rgb},0)`);
          ctx.fillStyle = grad;
          ctx.beginPath();
          ctx.arc(sx, sy, haloR, 0, Math.PI * 2);
          ctx.fill();
        }

        ctx.fillStyle = `rgba(${st.rgb},${a.toFixed(3)})`;
        if (st.r <= 0.72) {
          const sz = st.r * 1.55;
          ctx.fillRect(sx - sz * 0.5, sy - sz * 0.5, sz, sz);
        } else {
          ctx.beginPath();
          ctx.arc(sx, sy, st.r, 0, Math.PI * 2);
          ctx.fill();
        }
      }

      // Overlay real J2000 bright stars, constellations & Galactic Center aligned to live GMST (60s cached)
      if (global.BrightStars && typeof global.BrightStars.getProjectedStars === 'function') {
        const nowMs = Date.now();
        if (!starfield._realCache || nowMs - starfield._realCacheAt > 60000) {
          const nowDt = new Date(nowMs);
          starfield._realCache = {
            gcVec: global.BrightStars.getGalacticCenterVector(nowDt),
            stars: global.BrightStars.getProjectedStars(nowDt)
          };
          starfield._realCacheAt = nowMs;
        }
        const gcVec = starfield._realCache.gcVec;
        const gcZ = gcVec[0] * cam.forward[0] + gcVec[1] * cam.forward[1] + gcVec[2] * cam.forward[2];
        if (gcZ > 0.16 && zoom < 4.5) {
          const gcX = cx + ((gcVec[0] * cam.right[0] + gcVec[1] * cam.right[1] + gcVec[2] * cam.right[2]) / gcZ) * focal;
          const gcY = cy - ((gcVec[0] * cam.up[0] + gcVec[1] * cam.up[1] + gcVec[2] * cam.up[2]) / gcZ) * focal;
          const gcRad = Math.min(width, height) * 0.22;
          if (gcX > -gcRad && gcX < width + gcRad && gcY > -gcRad && gcY < height + gcRad) {
            const gcGrad = ctx.createRadialGradient(gcX, gcY, 0, gcX, gcY, gcRad);
            gcGrad.addColorStop(0, `rgba(226,192,125,${(0.11 * zoomFade).toFixed(3)})`);
            gcGrad.addColorStop(0.45, `rgba(148,180,255,${(0.05 * zoomFade).toFixed(3)})`);
            gcGrad.addColorStop(1, 'rgba(0,0,0,0)');
            ctx.fillStyle = gcGrad;
            ctx.beginPath();
            ctx.arc(gcX, gcY, gcRad, 0, Math.PI * 2);
            ctx.fill();
          }
        }

        const realStars = starfield._realCache.stars;
        const projected = new Array(realStars.length);
        for (let i = 0; i < realStars.length; i++) {
          const rs = realStars[i];
          const zCam = rs.x * cam.forward[0] + rs.y * cam.forward[1] + rs.z * cam.forward[2];
          if (zCam <= 0.14) continue;
          const sx = cx + ((rs.x * cam.right[0] + rs.y * cam.right[1] + rs.z * cam.right[2]) / zCam) * focal;
          const sy = cy - ((rs.x * cam.up[0] + rs.y * cam.up[1] + rs.z * cam.up[2]) / zCam) * focal;
          if (sx >= -12 && sx <= width + 12 && sy >= -12 && sy <= height + 12) {
            projected[i] = { sx, sy, rs };
          }
        }

        const lines = global.BrightStars.CONSTELLATIONS || [];
        ctx.strokeStyle = `rgba(226,192,125,${(0.16 * zoomFade).toFixed(3)})`;
        ctx.lineWidth = 0.75;
        ctx.beginPath();
        for (let l = 0; l < lines.length; l++) {
          const poly = lines[l];
          let started = false;
          for (let k = 0; k < poly.length; k++) {
            const pt = projected[poly[k]];
            if (!pt) { started = false; continue; }
            if (!started) { ctx.moveTo(pt.sx, pt.sy); started = true; }
            else ctx.lineTo(pt.sx, pt.sy);
          }
        }
        ctx.stroke();

        for (let i = 0; i < projected.length; i++) {
          const pt = projected[i];
          if (!pt) continue;
          const { sx, sy, rs } = pt;
          const a = Math.min(0.98, rs.alpha * zoomFade);
          if (rs.mag <= 1.2) {
            const haloR = rs.r * 3.8;
            const grad = ctx.createRadialGradient(sx, sy, 0, sx, sy, haloR);
            grad.addColorStop(0, `rgba(${rs.rgb},${(a * 0.42).toFixed(3)})`);
            grad.addColorStop(1, `rgba(${rs.rgb},0)`);
            ctx.fillStyle = grad;
            ctx.beginPath();
            ctx.arc(sx, sy, haloR, 0, Math.PI * 2);
            ctx.fill();
          } else {
            ctx.fillStyle = `rgba(${rs.rgb},${(a * 0.22).toFixed(3)})`;
            ctx.beginPath();
            ctx.arc(sx, sy, rs.r * 2.1, 0, Math.PI * 2);
            ctx.fill();
          }

          ctx.fillStyle = `rgba(${rs.rgb},${a.toFixed(3)})`;
          ctx.beginPath();
          ctx.arc(sx, sy, rs.r, 0, Math.PI * 2);
          ctx.fill();

          if (rs.mag <= 0.6) {
            const glint = rs.r * 3.1;
            ctx.strokeStyle = `rgba(${rs.rgb},${(a * 0.45).toFixed(3)})`;
            ctx.lineWidth = 0.7;
            ctx.beginPath();
            ctx.moveTo(sx - glint, sy);
            ctx.lineTo(sx + glint, sy);
            ctx.moveTo(sx, sy - glint);
            ctx.lineTo(sx, sy + glint);
            ctx.stroke();
          }
        }
      }
    }

    function scheduleRender() {
      if (rafId) return;
      rafId = requestAnimationFrame(render);
    }

    function syncPresetUI() {
      const grid = document.getElementById('skybox-preset-grid');
      if (!grid) return;
      grid.querySelectorAll('.skybox-btn').forEach((btn) => {
        const active = btn.dataset.skybox === currentPresetId;
        btn.classList.toggle('active', active);
        btn.setAttribute('aria-pressed', String(active));
      });
    }

    function setPreset(id) {
      const nextMeta = getPresetMeta(id);
      if (nextMeta.id === currentPresetId) return;
      currentPresetId = nextMeta.id;
      try {
        global.localStorage.setItem(SKYBOX_KEY, currentPresetId);
      } catch (e) {
        // ignore
      }
      applyBackdropLayer(nextMeta);
      syncSeasonAndSkyboxAttrs();
      syncPresetUI();
      syncMapThemeAndAccent();
      scheduleRender();
    }

    function renderPresetGrid() {
      const grid = document.getElementById('skybox-preset-grid');
      if (!grid) return;
      grid.innerHTML = SKYBOX_PRESETS.map((p) => {
        const active = p.id === currentPresetId ? 'active' : '';
        return `
          <button class="skybox-btn ${active}" data-skybox="${p.id}" type="button" aria-pressed="${p.id === currentPresetId}">
            <span class="skybox-thumb skybox-thumb-${p.id}" aria-hidden="true"></span>
            <span class="skybox-name" data-i18n="${p.labelKey}">${t(p.labelKey)}</span>
          </button>
        `;
      }).join('');
      grid.querySelectorAll('.skybox-btn').forEach((btn) => {
        btn.addEventListener('click', () => setPreset(btn.dataset.skybox));
      });
    }

    return {
      resize,
      scheduleRender,
      setPreset,
      getPreset: () => currentPresetId,
      getPresets: () => SKYBOX_PRESETS.slice(),
      renderPresetGrid
    };
  })();

  global.AppSkybox = {
    getPreset: starfield.getPreset,
    setPreset: starfield.setPreset,
    getPresets: starfield.getPresets
  };

  function isMobileViewport() {
    return global.innerWidth <= 768;
  }

  function isCoarsePointer() {
    return Boolean(global.matchMedia && global.matchMedia('(hover: none), (pointer: coarse)').matches);
  }

  function easeInOutCubic(t) {
    return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
  }

  function haversineKm(a, b) {
    const toRad = Math.PI / 180;
    const dLat = (b[1] - a[1]) * toRad;
    const dLng = (b[0] - a[0]) * toRad;
    const lat1 = a[1] * toRad;
    const lat2 = b[1] * toRad;
    const s = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
    return 6371 * 2 * Math.asin(Math.min(1, Math.sqrt(s)));
  }

  function loadFavorites() {
    try {
      const raw = global.localStorage.getItem(FAVORITES_KEY);
      if (raw) {
        const arr = JSON.parse(raw);
        if (Array.isArray(arr)) {
          state.favorites = new Set(arr.filter((id) => ATLAS.getById(id)));
        }
      }
    } catch (e) {
      // ignore storage access errors
    }
  }

  function saveFavorites() {
    try {
      global.localStorage.setItem(FAVORITES_KEY, JSON.stringify([...state.favorites]));
    } catch (e) {
      // ignore storage access errors
    }
  }

  function hydrateIcons() {
    if (!Icons) return;
    document.querySelectorAll('[data-icon]').forEach((el) => {
      const name = el.getAttribute('data-icon');
      const size = Number(el.getAttribute('data-size') || 15);
      el.innerHTML = Icons.svg(name, size);
    });
  }

  function buildAtlasIndex() {
    const all = ATLAS.getAll();
    atlasIndex = all.map((dest, idx) => {
      let monthScores;
      if (Array.isArray(dest.monthScores) && dest.monthScores.length === 12) {
        monthScores = Uint8Array.from(dest.monthScores);
      } else {
        monthScores = new Uint8Array(12);
        (dest.months || []).forEach((m) => {
          if (m.m >= 1 && m.m <= 12) monthScores[m.m - 1] = Number(m.score) || 0;
        });
      }

      const entry = {
        numId: idx + 1,
        dest,
        monthScores,
        haystack: null
      };
      indexById.set(dest.id, entry);
      return entry;
    });
  }

  function getEntryHaystack(entry) {
    if (entry.haystack !== null) return entry.haystack;
    const dest = entry.dest;
    const spotStr = dest.spots
      ? dest.spots.map((s) => `${s.name} ${s.category || ''} ${s.scene || ''}`).join(' ')
      : (dest.spotNames || []).join(' ');
    entry.haystack = [
      dest.id || '',
      dest.country || '',
      dest.name || '',
      dest.shortName || '',
      dest.subtitle || '',
      dest.province || '',
      dest.region || '',
      dest.heroSummary || '',
      (dest.badges || []).join(' '),
      spotStr
    ]
      .join(' ')
      .toLowerCase();
    return entry.haystack;
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

  function buildStyle() {
    return {
      version: 8,
      projection: { type: 'globe' },
      sky: {
        'sky-color': 'rgba(4, 7, 15, 0)',
        'horizon-color': '#356FB8',
        'fog-color': '#0C1A33',
        'sky-horizon-blend': 0.48,
        'horizon-fog-blend': 0.60,
        'atmosphere-blend': ['interpolate', ['linear'], ['zoom'], 0, 0.78, 4.5, 0.55, 7, 0]
      },
      sources: {
        satellite: {
          type: 'raster',
          tiles: getTileUrls('satellite', activeTileRoute),
          tileSize: 256,
          maxzoom: 18,
          attribution: 'Esri World Imagery'
        },
        natgeo: {
          type: 'raster',
          tiles: getTileUrls('natgeo', activeTileRoute),
          tileSize: 256,
          maxzoom: 16,
          attribution: 'National Geographic & Esri'
        },
        physical: {
          type: 'raster',
          tiles: getTileUrls('physical', activeTileRoute),
          tileSize: 256,
          maxzoom: 10,
          attribution: 'Esri World Physical'
        },
        dark: {
          type: 'raster',
          tiles: getTileUrls('dark', activeTileRoute),
          tileSize: 256,
          maxzoom: 18,
          attribution: 'CartoDB Dark Matter'
        },
        labels: {
          type: 'raster',
          tiles: getTileUrls('labels', activeTileRoute),
          tileSize: 256,
          maxzoom: 18
        },
        'atlas-points': {
          type: 'geojson',
          data: { type: 'FeatureCollection', features: [] }
        },
        'atlas-clusters': {
          type: 'geojson',
          data: { type: 'FeatureCollection', features: [] }
        },
        subroute: {
          type: 'geojson',
          data: { type: 'FeatureCollection', features: [] }
        },
        'spider-legs': {
          type: 'geojson',
          data: { type: 'FeatureCollection', features: [] }
        }
      },
      layers: [
        {
          id: 'globe-ocean-base',
          type: 'background',
          paint: { 'background-color': '#0A121D' }
        },
        {
          id: 'layer-satellite',
          type: 'raster',
          source: 'satellite',
          layout: { visibility: 'visible' },
          paint: { 'raster-opacity': 1, 'raster-opacity-transition': { duration: 360, delay: 0 }, 'raster-fade-duration': 300 }
        },
        {
          id: 'layer-natgeo',
          type: 'raster',
          source: 'natgeo',
          layout: { visibility: 'none' },
          paint: { 'raster-opacity': 0, 'raster-opacity-transition': { duration: 360, delay: 0 }, 'raster-fade-duration': 300 }
        },
        {
          id: 'layer-physical',
          type: 'raster',
          source: 'physical',
          layout: { visibility: 'none' },
          paint: { 'raster-opacity': 0, 'raster-opacity-transition': { duration: 360, delay: 0 }, 'raster-fade-duration': 300 }
        },
        {
          id: 'layer-dark',
          type: 'raster',
          source: 'dark',
          layout: { visibility: 'none' },
          paint: { 'raster-opacity': 0, 'raster-opacity-transition': { duration: 360, delay: 0 }, 'raster-fade-duration': 300 }
        },
        {
          id: 'layer-labels',
          type: 'raster',
          source: 'labels',
          layout: { visibility: 'none' },
          paint: { 'raster-opacity': 0.85, 'raster-fade-duration': 140 }
        },
        {
          id: 'atlas-glow',
          type: 'circle',
          source: 'atlas-points',
          paint: {
            'circle-radius': [
              'interpolate', ['linear'], ['zoom'],
              1, [
                'case',
                ['==', ['get', 'selected'], 1], 16,
                ['boolean', ['feature-state', 'hover'], false], 14,
                ['==', ['get', 'matched'], 0], 4,
                7.5
              ],
              5, [
                'case',
                ['==', ['get', 'selected'], 1], 17,
                ['boolean', ['feature-state', 'hover'], false], 15,
                ['==', ['get', 'matched'], 0], 4.5,
                10
              ],
              10, [
                'case',
                ['==', ['get', 'selected'], 1], 18,
                ['boolean', ['feature-state', 'hover'], false], 16,
                ['==', ['get', 'matched'], 0], 5,
                13
              ]
            ],
            'circle-color': [
              'case',
              ['==', ['get', 'allWeather'], 1], '#E2C07D',
              '#8AB4F8'
            ],
            'circle-opacity': [
              'case',
              ['==', ['get', 'selected'], 1], 0.34,
              ['boolean', ['feature-state', 'hover'], false], 0.38,
              ['==', ['get', 'matched'], 0], 0.04,
              0.20
            ],
            'circle-blur': 0.72,
            'circle-opacity-transition': { duration: 260, delay: 0 },
            'circle-radius-transition': { duration: 220, delay: 0 }
          }
        },
        {
          id: 'atlas-core',
          type: 'circle',
          source: 'atlas-points',
          paint: {
            'circle-radius': [
              'interpolate', ['linear'], ['zoom'],
              1, [
                'case',
                ['==', ['get', 'selected'], 1], 6.0,
                ['boolean', ['feature-state', 'hover'], false], 5.6,
                ['==', ['get', 'matched'], 0], 2.2,
                ['==', ['get', 'priority'], 1], 4.0,
                2.8
              ],
              5, [
                'case',
                ['==', ['get', 'selected'], 1], 6.5,
                ['boolean', ['feature-state', 'hover'], false], 6.0,
                ['==', ['get', 'matched'], 0], 2.5,
                ['==', ['get', 'priority'], 1], 5.0,
                3.8
              ],
              10, [
                'case',
                ['==', ['get', 'selected'], 1], 7.0,
                ['boolean', ['feature-state', 'hover'], false], 6.5,
                ['==', ['get', 'matched'], 0], 2.8,
                ['==', ['get', 'priority'], 1], 5.8,
                4.8
              ]
            ],
            'circle-color': [
              'case',
              ['==', ['get', 'selected'], 1], '#FFFFFF',
              ['==', ['get', 'allWeather'], 1], '#E2C07D',
              '#8AB4F8'
            ],
            'circle-stroke-width': [
              'case',
              ['==', ['get', 'selected'], 1], 2.2,
              ['==', ['get', 'matched'], 0], 0.4,
              1.2
            ],
            'circle-stroke-color': [
              'case',
              ['==', ['get', 'selected'], 1], '#E2C07D',
              '#09090B'
            ],
            'circle-opacity': [
              'case',
              ['==', ['get', 'matched'], 0], 0.18,
              0.96
            ],
            'circle-opacity-transition': { duration: 260, delay: 0 },
            'circle-radius-transition': { duration: 200, delay: 0 }
          }
        },
        {
          id: 'atlas-hit',
          type: 'circle',
          source: 'atlas-points',
          paint: {
            'circle-radius': isCoarsePointer() ? 22 : 14,
            'circle-opacity': 0
          }
        },
        {
          id: 'atlas-cluster-circle',
          type: 'circle',
          source: 'atlas-clusters',
          paint: {
            'circle-radius': ['interpolate', ['linear'], ['get', 'point_count'], 3, 13, 30, 19, 120, 26],
            'circle-color': 'rgba(226, 192, 125, 0.88)',
            'circle-stroke-width': 2,
            'circle-stroke-color': '#09090B',
            'circle-opacity': 0.92
          }
        },
        {
          id: 'subroute-line',
          type: 'line',
          source: 'subroute',
          paint: {
            'line-color': '#D6B77A',
            'line-width': 2.2,
            'line-dasharray': [2, 2],
            'line-opacity': 0.85
          }
        },
        {
          id: 'spider-legs-line',
          type: 'line',
          source: 'spider-legs',
          paint: {
            'line-color': '#9FB4C8',
            'line-width': 1.25,
            'line-opacity': 0.72
          }
        }
      ]
    };
  }

  function getActiveScopeContinent() {
    if (state.query.trim()) return 'global';
    const info = ATLAS.getContinent(state.continent);
    if (state.continent !== 'global' && info && info.status === 'active') {
      return state.continent;
    }
    return 'global';
  }

  function matchesEntry(entry, ignoreMonth) {
    const d = entry.dest;
    const scopeCont = getActiveScopeContinent();
    if (scopeCont !== 'global' && d.continent !== scopeCont) return false;

    if (!ignoreMonth && state.month !== 'all') {
      const mIdx = Number(state.month) - 1;
      if (entry.monthScores[mIdx] < 4) return false;
    }
    if (state.theme !== 'all') {
      const themes = d.themeTags || [];
      if (!themes.includes(state.theme)) return false;
    }
    if (state.weather !== 'all') {
      if (state.weather === 'allWeather') {
        if (!d.allWeather) return false;
      } else {
        const tags = d.weatherTags || [];
        if (!tags.includes(state.weather)) return false;
      }
    }
    if (state.onlyFavorites && !state.favorites.has(d.id)) {
      return false;
    }
    if (state.query.trim()) {
      const hay = getEntryHaystack(entry);
      const tokens = state.query.trim().toLowerCase().split(/\s+/).filter(Boolean);
      for (let i = 0; i < tokens.length; i++) {
        if (!hay.includes(tokens[i])) return false;
      }
    }
    return true;
  }

  function getFilteredDestinations() {
    const out = [];
    for (let i = 0; i < atlasIndex.length; i++) {
      if (matchesEntry(atlasIndex[i], false)) {
        out.push(atlasIndex[i].dest);
      }
    }
    return out;
  }

  function recomputeMatchedSet() {
    const next = new Set();
    for (let i = 0; i < atlasIndex.length; i++) {
      if (matchesEntry(atlasIndex[i], false)) {
        next.add(atlasIndex[i].dest.id);
      }
    }
    lastMatchedIds = next;
    return next;
  }

  /* Update WebGL GeoJSON source (only called when filters/selection change, never on zoom!) */
  function rebuildClusterIndex() {
    if (!global.Supercluster) {
      clusterIndex = null;
      return;
    }
    const matchedPts = [];
    for (let i = 0; i < atlasIndex.length; i++) {
      const d = atlasIndex[i].dest;
      if (!lastMatchedIds.has(d.id) || d.id === state.selectedId) continue;
      if (!Array.isArray(d.coords) || d.coords.length < 2) continue;
      matchedPts.push({
        type: 'Feature',
        id: atlasIndex[i].numId,
        geometry: { type: 'Point', coordinates: d.coords },
        properties: {
          id: d.id,
          label: d.shortName || d.name,
          allWeather: d.allWeather ? 1 : 0,
          priority: d.priority === 1 ? 1 : 2,
          matched: 1,
          selected: 0,
          favorite: state.favorites.has(d.id) ? 1 : 0
        }
      });
    }
    clusterIndex = new global.Supercluster({ radius: 54, maxZoom: 5, minPoints: 3 });
    clusterIndex.load(matchedPts);
  }

  function syncClusterLayer() {
    if (!map || !map.getSource('atlas-clusters')) return;
    const zoom = map.getZoom();
    const useClusters = Boolean(state.clustering && clusterIndex && zoom < 4.5 && !state.selectedId);
    drawnClusters = [];
    if (!useClusters) {
      map.getSource('atlas-clusters').setData({ type: 'FeatureCollection', features: [] });
      if (map.getLayer('atlas-core')) map.setLayoutProperty('atlas-core', 'visibility', 'visible');
      if (map.getLayer('atlas-glow')) map.setLayoutProperty('atlas-glow', 'visibility', 'visible');
      return;
    }

    const allInView = clusterIndex.getClusters([-180, -85, 180, 85], Math.max(0, Math.floor(zoom)));
    const clusterFeatures = [];
    const unclusteredFeatures = [];
    for (let i = 0; i < allInView.length; i++) {
      const f = allInView[i];
      if (f.properties && f.properties.cluster) {
        clusterFeatures.push(f);
        drawnClusters.push(f);
      } else {
        unclusteredFeatures.push(f);
      }
    }
    map.getSource('atlas-clusters').setData({ type: 'FeatureCollection', features: clusterFeatures });
    if (map.getSource('atlas-points')) {
      map.getSource('atlas-points').setData({ type: 'FeatureCollection', features: unclusteredFeatures });
    }
  }

  function syncGeoJsonSource() {
    if (!map || !map.getSource('atlas-points')) return;
    rebuildClusterIndex();
    const zoom = map.getZoom();
    if (state.clustering && clusterIndex && zoom < 4.5 && !state.selectedId) {
      syncClusterLayer();
      return;
    }
    if (map.getSource('atlas-clusters')) {
      map.getSource('atlas-clusters').setData({ type: 'FeatureCollection', features: [] });
    }
    drawnClusters = [];
    const features = atlasIndex.map((entry) => {
      const d = entry.dest;
      return {
        type: 'Feature',
        id: entry.numId,
        geometry: { type: 'Point', coordinates: d.coords },
        properties: {
          id: d.id,
          label: d.shortName || d.name,
          allWeather: d.allWeather ? 1 : 0,
          priority: d.priority === 1 ? 1 : 2,
          matched: lastMatchedIds.has(d.id) ? 1 : 0,
          selected: d.id === state.selectedId ? 1 : 0,
          favorite: state.favorites.has(d.id) ? 1 : 0
        }
      };
    });
    map.getSource('atlas-points').setData({ type: 'FeatureCollection', features });
  }

  /* Zero-DOM-Churn HiDPI Canvas 2D Label Overlay */
  function ensureLabelOverlay() {
    if (labelCanvas) return;
    labelCanvas = document.createElement('canvas');
    labelCanvas.id = 'globe-label-canvas';
    const mapHost = document.getElementById('map');
    if (mapHost) {
      labelCanvas.style.cssText = 'position:absolute;inset:0;z-index:1;pointer-events:none;';
      mapHost.appendChild(labelCanvas);
    } else {
      labelCanvas.style.cssText = 'position:fixed;inset:0;z-index:2;pointer-events:none;';
      document.body.insertBefore(labelCanvas, document.getElementById('topbar'));
    }
    labelCtx = labelCanvas.getContext('2d');
    resizeLabelCanvas();
  }

  function resizeLabelCanvas() {
    if (!labelCanvas || !labelCtx) return;
    const dpr = Math.min(global.devicePixelRatio || 1, 2);
    const parent = labelCanvas.parentElement;
    const w = (parent && parent.clientWidth) || global.innerWidth;
    const h = (parent && parent.clientHeight) || global.innerHeight;
    if (labelCanvas.width !== Math.round(w * dpr) || labelCanvas.height !== Math.round(h * dpr)) {
      labelCanvas.width = Math.round(w * dpr);
      labelCanvas.height = Math.round(h * dpr);
      labelCanvas.style.width = `${w}px`;
      labelCanvas.style.height = `${h}px`;
    }
    labelCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  function isPointOnFrontHemisphere(coords, centerLng, centerLat) {
    const toRad = Math.PI / 180;
    const lat1 = centerLat * toRad;
    const lat2 = coords[1] * toRad;
    const dLng = (coords[0] - centerLng) * toRad;
    const cosA = Math.sin(lat1) * Math.sin(lat2) + Math.cos(lat1) * Math.cos(lat2) * Math.cos(dLng);
    return cosA > 0.08;
  }

  function scheduleLabelLayout() {
    if (labelRaf) return;
    labelRaf = requestAnimationFrame(() => {
      labelRaf = null;
      layoutVisibleLabels();
    });
  }

  function formatGlobeLabel(dest) {
    if (!dest) return '';
    const lang = I18n ? I18n.getLang() : 'zh-CN';
    const shortLabel = tx(dest.shortName || dest.name);
    if (lang !== 'en') return shortLabel;
    if (!/[\u4e00-\u9fff]/.test(shortLabel)) return shortLabel;
    const fullLabel = tx(dest.name);
    if (fullLabel && !/[\u4e00-\u9fff]/.test(fullLabel)) return fullLabel;
    const rawId = String(dest.id || '').replace(/^[a-z]{2}-/, '');
    if (!rawId) return shortLabel;
    return rawId
      .split('-')
      .map((part) => (part ? part[0].toUpperCase() + part.slice(1) : ''))
      .join(' ');
  }

  function boxesOverlap(ax, ay, aw, ah, b, padX, padY) {
    return (
      ax < b.x + b.w + padX &&
      ax + aw + padX > b.x &&
      ay < b.y + b.h + padY &&
      ay + ah + padY > b.y
    );
  }

  function layoutVisibleLabels() {
    if (!map || !labelCanvas || !labelCtx) return;
    resizeLabelCanvas();
    const parent = labelCanvas.parentElement;
    const w = (parent && parent.clientWidth) || global.innerWidth;
    const h = (parent && parent.clientHeight) || global.innerHeight;
    labelCtx.clearRect(0, 0, w, h);
    drawnLabelBoxes = [];
    const occupiedBoxes = [];

    if (state.mode === 'gallery' || state.mode === 'planner' || state.mode === 'archive') return;

    // Draw Supercluster count badges on HiDPI 2D canvas and reserve their bounding boxes
    // so city labels never collide with cluster circles.
    if (drawnClusters.length && state.clustering && !state.selectedId && map.getZoom() < 4.5) {
      const cCenter = map.getCenter();
      labelCtx.font = '600 11px "IBM Plex Mono", "Inter", sans-serif';
      labelCtx.textAlign = 'center';
      labelCtx.textBaseline = 'middle';
      for (let i = 0; i < drawnClusters.length; i++) {
        const cf = drawnClusters[i];
        const coords = cf.geometry && cf.geometry.coordinates;
        if (!coords) continue;
        if (state.isGlobe && !isPointOnFrontHemisphere(coords, cCenter.lng, cCenter.lat)) continue;
        const pt = map.project(coords);
        if (pt.x < 10 || pt.x > w - 10 || pt.y < 10 || pt.y > h - 10) continue;
        const ptCount = Number(cf.properties.point_count || 0);
        const radius = (ptCount >= 30 ? 22 : ptCount >= 10 ? 18 : 15) + 7;
        occupiedBoxes.push({
          x: pt.x - radius,
          y: pt.y - radius,
          w: radius * 2,
          h: radius * 2
        });
        labelCtx.fillStyle = '#09090B';
        labelCtx.fillText(String(cf.properties.point_count_abbreviated || cf.properties.point_count), pt.x, pt.y + 0.5);
      }
      labelCtx.textAlign = 'left';
    }

    const zoom = map.getZoom();
    const center = map.getCenter();
    const isFiltering = isAnyFilterActive();
    const showTier2 = state.forceAllLabels || zoom >= 3.9 || isFiltering;
    const perfMax = (global.__wtgPerfConfig && Number(global.__wtgPerfConfig.maxLabels)) || 65;
    const baseMax = state.forceAllLabels ? Math.max(80, perfMax) : isMobileViewport() ? Math.min(20, Math.round(perfMax * 0.4)) : Math.min(48, perfMax);
    const maxLabels = baseMax;
    const maxLatSpan = zoom >= 3.0 ? Math.min(90, 185 / Math.pow(2, zoom - 1.2)) : 180;
    const maxLngSpan = Math.min(180, maxLatSpan * 1.45);

    const candidates = [];
    for (let i = 0; i < atlasIndex.length; i++) {
      const d = atlasIndex[i].dest;
      if (!lastMatchedIds.has(d.id)) continue;
      const isSelected = d.id === state.selectedId;
      if (isSelected && state.subSpotMarkers.length > 0 && zoom >= 7.5) continue;
      if (!showTier2 && d.priority !== 1 && !isSelected && !state.favorites.has(d.id)) continue;

      if (state.isGlobe && !isPointOnFrontHemisphere(d.coords, center.lng, center.lat)) {
        continue;
      }
      if (zoom >= 3.0) {
        if (Math.abs(d.coords[1] - center.lat) > maxLatSpan) continue;
        let dLng = Math.abs(d.coords[0] - center.lng);
        if (dLng > 180) dLng = 360 - dLng;
        if (dLng > maxLngSpan) continue;
      }

      const pt = map.project(d.coords);
      if (pt.x < 16 || pt.x > w - 16 || pt.y < 68 || pt.y > h - 76) continue;

      const rank = (isSelected ? 1000 : 0) + (state.favorites.has(d.id) ? 200 : 0) + (d.priority === 1 ? 80 : 0) + (d.allWeather ? 20 : 0);
      candidates.push({ dest: d, x: pt.x, y: pt.y, rank, isSelected });
    }

    candidates.sort((a, b) => b.rank - a.rank);

    const isLightMapSkin = document.body.classList.contains('light-map-skin');
    const accentHex = (Theme && Theme.getState().accentHex) || '#E2C07D';
    labelCtx.font = '500 11.5px "Inter", "Noto Sans SC", "PingFang SC", "Microsoft YaHei", sans-serif';
    labelCtx.textBaseline = 'middle';
    labelCtx.lineJoin = 'round';
    labelCtx.lineWidth = 3.2;
    labelCtx.strokeStyle = isLightMapSkin ? 'rgba(255,255,255,0.92)' : 'rgba(5,6,10,0.88)';

    let used = 0;
    for (let i = 0; i < candidates.length && used < maxLabels; i++) {
      const c = candidates[i];
      const text = formatGlobeLabel(c.dest);
      let estW = labelWidthCache.get(text);
      if (estW === undefined) {
        estW = Math.ceil(labelCtx.measureText(text).width) + 4;
        labelWidthCache.set(text, estW);
      }
      const estH = 18;
      let lx = Math.round(c.x + 9);
      const ly = Math.round(c.y);
      // Flip label to the left of the pin if near right edge, and enforce viewport margins
      if (lx + estW > w - 18 && c.x - 10 - estW >= 16) {
        lx = Math.round(c.x - 10 - estW);
      }
      if (!c.isSelected && (lx < 16 || lx + estW > w - 16 || ly - 9 < 66 || ly + 9 > h - 74)) {
        continue;
      }

      const boxY = ly - 9;
      if (!state.forceAllLabels && !c.isSelected) {
        let collides = false;
        for (let j = 0; j < occupiedBoxes.length; j++) {
          if (boxesOverlap(lx, boxY, estW, estH, occupiedBoxes[j], 8, 4)) {
            collides = true;
            break;
          }
        }
        if (collides) continue;
      }

      occupiedBoxes.push({ x: lx, y: boxY, w: estW, h: estH });
      drawnLabelBoxes.push({ id: c.dest.id, x: lx, y: ly, w: estW, h: estH });
      used++;

      labelCtx.fillStyle = c.isSelected
        ? '#FFFFFF'
        : c.dest.allWeather
          ? (isLightMapSkin ? '#8A5A10' : accentHex)
          : (isLightMapSkin ? '#18181B' : '#F5F5F7');

      labelCtx.strokeText(text, lx, ly);
      labelCtx.fillText(text, lx, ly);
    }
  }

  function findLabelAtPoint(px, py) {
    for (let i = drawnLabelBoxes.length - 1; i >= 0; i--) {
      const b = drawnLabelBoxes[i];
      if (px >= b.x - 6 && px <= b.x + b.w + 4 && py >= b.y - 12 && py <= b.y + 12) {
        return b.id;
      }
    }
    return null;
  }

  /* Active Pulsing Beacon (Single DOM marker for selected city only) */
  function updateActiveBeacon(dest) {
    if (state.activeBeaconMarker) {
      state.activeBeaconMarker.remove();
      state.activeBeaconMarker = null;
    }
    if (!dest || !map) return;
    const root = document.createElement('div');
    root.className = 'active-beacon-root';
    root.innerHTML = '<div class="active-beacon-ring"></div>';
    state.activeBeaconMarker = new maplibregl.Marker({
      element: root,
      anchor: 'center',
      subpixelPositioning: true
    })
      .setLngLat(dest.coords)
      .addTo(map);
  }

  /* L3 Sub-spot Markers with Screen-Space Spiderfy */
  function clearSubSpots() {
    state.subSpotMarkers.forEach((m) => m.marker.remove());
    state.subSpotMarkers = [];
    if (map && map.getSource('subroute')) {
      map.getSource('subroute').setData({ type: 'FeatureCollection', features: [] });
    }
    if (map && map.getSource('spider-legs')) {
      map.getSource('spider-legs').setData({ type: 'FeatureCollection', features: [] });
    }
    const toast = document.getElementById('subspot-toast');
    if (toast) toast.classList.add('is-hidden');
  }

  function applySpiderfyLayout() {
    if (!map || !state.subSpotMarkers.length) return;
    const pts = state.subSpotMarkers.map((item) => ({
      item,
      pt: map.project(item.coords),
      dx: 0,
      dy: 0
    }));

    // Simple cluster detection within 34px radius in screen coordinates
    const visited = new Array(pts.length).fill(false);
    const legFeatures = [];

    for (let i = 0; i < pts.length; i++) {
      if (visited[i]) continue;
      const cluster = [pts[i]];
      visited[i] = true;
      for (let j = i + 1; j < pts.length; j++) {
        if (visited[j]) continue;
        const dist = Math.hypot(pts[j].pt.x - pts[i].pt.x, pts[j].pt.y - pts[i].pt.y);
        if (dist < 34) {
          visited[j] = true;
          cluster.push(pts[j]);
        }
      }
      if (cluster.length > 1) {
        const radius = Math.min(48, 24 + cluster.length * 4);
        const cx = cluster.reduce((s, c) => s + c.pt.x, 0) / cluster.length;
        const cy = cluster.reduce((s, c) => s + c.pt.y, 0) / cluster.length;
        cluster.forEach((c, k) => {
          const angle = (Math.PI * 2 * k) / cluster.length - Math.PI / 2;
          const tx = cx + Math.cos(angle) * radius;
          const ty = cy + Math.sin(angle) * radius;
          c.dx = Math.round(tx - c.pt.x);
          c.dy = Math.round(ty - c.pt.y);
          const unproj = map.unproject([tx, ty]);
          legFeatures.push({
            type: 'Feature',
            geometry: { type: 'LineString', coordinates: [c.item.coords, [unproj.lng, unproj.lat]] }
          });
        });
      }
    }

    pts.forEach(({ item, dx, dy }) => {
      if (item.innerEl) {
        item.innerEl.style.transform = (dx || dy) ? `translate3d(${dx}px, ${dy}px, 0)` : '';
      }
      const tag = item.innerEl && item.innerEl.querySelector('.subspot-tag');
      if (tag) {
        // Hide overlapping subspot tag on spiderfied cluster unless active/hovered, to keep labels crisp
        const isCrowded = Boolean(dx || dy);
        tag.style.opacity = isCrowded && !item.rootEl.classList.contains('active') ? '0' : '1';
      }
    });

    if (map.getSource('spider-legs')) {
      map.getSource('spider-legs').setData({ type: 'FeatureCollection', features: legFeatures });
    }
  }

  function renderSubSpots(dest) {
    clearSubSpots();
    if (!dest || !dest.spots || !dest.spots.length) return;

    const lineCoords = dest.spots.map((s) => s.coords);
    if (map.getSource('subroute') && lineCoords.length >= 2) {
      map.getSource('subroute').setData({
        type: 'FeatureCollection',
        features: [{ type: 'Feature', geometry: { type: 'LineString', coordinates: lineCoords } }]
      });
    }

    dest.spots.forEach((sp, idx) => {
      const root = document.createElement('div');
      root.className = 'subspot-pin-root';
      const inner = document.createElement('div');
      inner.className = 'subspot-pin-inner';
      inner.style.animationDelay = `${Math.min(idx * 35, 240)}ms`;
      const baseTag = tx(sp.name).split(/[·&（(/]/)[0].trim();
      const shortTag = baseTag.length > 8 ? baseTag.slice(0, 7) + '…' : baseTag;
      inner.innerHTML = `
        <div class="subspot-hitbox" title="${tx(sp.name)}">
          <span class="subspot-num">${idx + 1}</span>
        </div>
        <span class="subspot-tag">${shortTag}</span>
      `;
      root.appendChild(inner);

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

      state.subSpotMarkers.push({ marker, rootEl: root, innerEl: inner, coords: sp.coords });
    });

    applySpiderfyLayout();

    const toast = document.getElementById('subspot-toast');
    const toastText = document.getElementById('subspot-toast-text');
    if (toast && toastText) {
      toastText.textContent = t('subspotToast', { name: tx(dest.shortName || dest.name), n: dest.spots.length });
      toast.classList.remove('is-hidden');
    }
  }

  function getDrawerViewportPadding() {
    const sidebar = document.getElementById('left-sidebar');
    const drawer = document.getElementById('detail-drawer');
    const drawerOpen = Boolean(drawer && !drawer.classList.contains('is-hidden'));
    if (isMobileViewport()) {
      return {
        top: 76,
        bottom: drawerOpen ? Math.round(global.innerHeight * 0.56) : 136,
        left: 16,
        right: 16
      };
    }
    const leftPad = (sidebar && !sidebar.classList.contains('is-hidden')) ? 310 : 28;
    const rightPad = drawerOpen ? 430 : 28;
    return { top: 82, bottom: 84, left: leftPad, right: rightPad };
  }

  /* Silky Cinematic Camera System */
  function cancelActiveFlight() {
    if (introTimer) {
      clearTimeout(introTimer);
      introTimer = null;
    }
    if (isIntroFlight) {
      isIntroFlight = false;
      const skipBtn = document.getElementById('skip-intro-btn');
      if (skipBtn) skipBtn.classList.add('is-hidden');
    }
    if (map && map.isMoving()) {
      map.stop();
    }
  }

  function cinematicFlyTo(opts) {
    if (!map) return;
    stopSpin();
    const reduced = prefersReducedMotion();
    const maxSkinZoom = (SKIN_META[state.skin] && SKIN_META[state.skin].maxZoom) || 17.5;
    const targetZoom = Math.min(opts.zoom || 9.0, maxSkinZoom);

    const camOpts = {
      center: opts.center,
      zoom: targetZoom,
      pitch: opts.pitch !== undefined ? opts.pitch : 42,
      bearing: opts.bearing !== undefined ? opts.bearing : 0,
      padding: opts.padding || getDrawerViewportPadding()
    };

    if (opts.instant || reduced) {
      map.jumpTo(camOpts);
      return;
    }

    const cur = map.getCenter();
    const distKm = haversineKm([cur.lng, cur.lat], opts.center);
    const duration = opts.duration || Math.round(Math.min(2200, Math.max(900, 950 + distKm * 0.06)));
    const curve = distKm > 2500 ? 1.52 : distKm > 500 ? 1.32 : 1.15;

    map.flyTo(
      Object.assign({}, camOpts, {
        duration,
        curve,
        easing: easeInOutCubic,
        essential: true
      })
    );
  }

  function focusSubSpotMarkerOnly(idx) {
    state.activeSpotIdx = idx;
    state.subSpotMarkers.forEach((m, i) => {
      m.rootEl.classList.toggle('active', i === idx);
    });
  }
  global.focusSubSpotMarkerOnly = focusSubSpotMarkerOnly;

  function flyToSubSpot(idx) {
    const dest = ATLAS.getById(state.selectedId);
    if (!dest || !dest.spots || !dest.spots[idx]) return;
    focusSubSpotMarkerOnly(idx);
    const sp = dest.spots[idx];
    cinematicFlyTo({
      center: sp.coords,
      zoom: 12.6,
      pitch: 52,
      bearing: idx % 2 === 0 ? 16 : -16,
      duration: 1350
    });
    Panel.highlightSpot(idx);
  }
  global.flyToSubSpot = flyToSubSpot;

  function setSidebarOpen(open) {
    const sidebar = document.getElementById('left-sidebar');
    const toggleBtn = document.getElementById('sidebar-toggle-btn');
    if (sidebar) sidebar.classList.toggle('is-hidden', !open);
    if (toggleBtn) toggleBtn.classList.toggle('active', open);
    document.body.classList.toggle('sidebar-collapsed', !open);
  }

  function selectDestination(id, opts) {
    const options = typeof opts === 'boolean' ? { instant: opts } : (opts || {});
    const dest = ATLAS.getById(id);
    if (!dest) return;
    stopSpin();

    // Switch back to map mode if currently in gallery
    if (state.mode === 'gallery') {
      setViewMode('map');
    }

    state.selectedId = id;
    state.activeSpotIdx = 0;

    // Auto-collapse left sidebar when focusing destination to keep globe as hero
    setSidebarOpen(false);

    updateActiveBeacon(dest);
    Panel.open(dest, state.month);
    const activeLang = I18n ? I18n.getLang() : 'zh-CN';
    const needsDetail = !dest.spots && typeof ATLAS.ensureDetail === 'function';
    const needsLangChunk = I18n && typeof I18n.ensureRegionLang === 'function' && activeLang !== 'zh-CN' && activeLang !== 'zh-TW';

    if (dest.spots) {
      renderSubSpots(dest);
      if (typeof options.spotIdx === 'number' && options.spotIdx >= 0 && dest.spots[options.spotIdx]) {
        Panel.highlightSpot(options.spotIdx);
        focusSubSpotMarkerOnly(options.spotIdx);
      }
    } else {
      clearSubSpots();
    }

    if (needsDetail || needsLangChunk) {
      Promise.all([
        needsDetail ? ATLAS.ensureDetail(id) : Promise.resolve(dest),
        needsLangChunk ? I18n.ensureRegionLang(activeLang, dest) : Promise.resolve()
      ]).then(([hydrated]) => {
        const latest = hydrated || ATLAS.getById(id) || dest;
        const entry = indexById.get(id);
        if (entry && latest) entry.dest = latest;
        if (state.selectedId !== id) return;
        if (latest && latest.spots) renderSubSpots(latest);
        if (latest) Panel.open(latest, state.month);
        if (typeof options.spotIdx === 'number' && options.spotIdx >= 0 && latest && latest.spots && latest.spots[options.spotIdx]) {
          Panel.highlightSpot(options.spotIdx);
          focusSubSpotMarkerOnly(options.spotIdx);
        }
      });
    }

    syncGeoJsonSource();
    updateSelectionUI();
    scheduleLabelLayout();

    if (!options.skipUrl) {
      syncUrlState(true);
    }

    if (options.spotIdx >= 0 && dest.spots && dest.spots[options.spotIdx]) {
      cinematicFlyTo({
        center: dest.spots[options.spotIdx].coords,
        zoom: 12.6,
        pitch: 52,
        bearing: 14,
        instant: options.instant
      });
    } else {
      cinematicFlyTo({
        center: dest.coords,
        zoom: dest.zoom || 9.0,
        pitch: 42,
        bearing: 0,
        instant: options.instant
      });
    }
  }
  global.selectAtlasDestination = selectDestination;

  function closeDestination(skipUrl) {
    state.selectedId = null;
    state.activeSpotIdx = -1;
    clearSubSpots();
    updateActiveBeacon(null);
    if (global.PhotoSimulator && typeof global.PhotoSimulator.clearGlobeOverlay === 'function') {
      global.PhotoSimulator.clearGlobeOverlay(map);
    }
    Panel.close();
    syncGeoJsonSource();
    updateSelectionUI();
    scheduleLabelLayout();
    if (!skipUrl) {
      syncUrlState(true);
    }
  }

  function updateSelectionUI() {
    document.querySelectorAll('.city-nav-item').forEach((btn) => {
      btn.classList.toggle('active', btn.dataset.id === state.selectedId);
    });
  }

  /* Phenology 12-Month Timeline */
  function renderPhenologyBar() {
    const track = document.getElementById('phenology-track');
    const hemiHint = document.getElementById('phenology-hemi-hint');
    if (!track) return;

    const counts = new Array(12).fill(0);
    let totalScope = 0;
    for (let i = 0; i < atlasIndex.length; i++) {
      const entry = atlasIndex[i];
      if (!matchesEntry(entry, true)) continue;
      totalScope++;
      for (let m = 0; m < 12; m++) {
        if (entry.monthScores[m] >= 4) counts[m]++;
      }
    }
    const maxCount = Math.max(1, ...counts);

    let html = `
      <button class="pheno-btn ${state.month === 'all' ? 'active' : ''}" data-month="all" type="button" role="radio" aria-checked="${state.month === 'all'}" title="${t('allYear')} · ${totalScope}">
        <span>${t('allYear')}</span>
      </button>
    `;

    for (let m = 1; m <= 12; m++) {
      const active = String(m) === String(state.month);
      const cnt = counts[m - 1];
      const dotOpacity = (0.18 + (cnt / maxCount) * 0.82).toFixed(2);
      const label = t('monthFmt', { m });
      html += `
        <button class="pheno-btn ${active ? 'active' : ''}" data-month="${m}" type="button" role="radio" aria-checked="${active}" title="${label} · ${t('citiesCountFmt', { n: cnt })}">
          <span>${label}</span>
          <span class="pheno-dot" style="opacity:${dotOpacity}"></span>
        </button>
      `;
    }
    track.innerHTML = html;

    if (hemiHint) {
      if (state.month === 'all') {
        hemiHint.textContent = t('citiesCountFmt', { n: totalScope });
      } else {
        const m = Number(state.month);
        const cnt = counts[m - 1];
        const seasonStr = I18n ? I18n.tSeason(m) : '';
        hemiHint.textContent = `${seasonStr} · ${t('citiesCountFmt', { n: cnt })}`;
      }
    }

    track.querySelectorAll('.pheno-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        state.month = btn.dataset.month;
        applyFilterUpdates();
        if (global.PhenologyEngine && global.PhenologyEngine.isHeatmapEnabled()) {
          global.PhenologyEngine.updateSeasonHeatmap(map, state.month);
        }
        if (state.selectedId && state.month !== 'all') {
          const dest = ATLAS.getById(state.selectedId);
          if (dest) Panel.open(dest, state.month);
        }
      });
    });
  }

  /* Active Filter Chips Strip */
  function isAnyFilterActive() {
    return (
      state.month !== 'all' ||
      state.theme !== 'all' ||
      state.weather !== 'all' ||
      state.onlyFavorites ||
      state.query.trim() !== '' ||
      state.continent !== 'global'
    );
  }

  function renderActiveChips() {
    const bar = document.getElementById('active-filter-chips');
    const badge = document.getElementById('filter-active-badge');
    if (!bar) return;

    const chips = [];
    if (state.continent !== 'global') {
      chips.push({ key: 'continent', label: I18n ? I18n.tContinent(state.continent) : state.continent });
    }
    if (state.month !== 'all') {
      chips.push({ key: 'month', label: t('monthFmt', { m: state.month }) });
    }
    if (state.theme !== 'all') {
      const themeKey = state.theme === 'nature' ? 'themeNature' : 'themeArch';
      chips.push({ key: 'theme', label: t(themeKey) });
    }
    if (state.weather !== 'all') {
      const wMap = {
        allWeather: 'weatherAllWeather',
        sunny: 'weatherSunny',
        rain: 'weatherRain',
        snow: 'weatherSnow',
        special: 'weatherSpecial'
      };
      chips.push({ key: 'weather', label: t(wMap[state.weather] || 'filterAll') });
    }
    if (state.onlyFavorites) {
      chips.push({ key: 'favorites', label: t('galFav') });
    }
    if (state.query.trim()) {
      chips.push({ key: 'query', label: `${state.query.trim()}` });
    }

    const filterCount = (state.theme !== 'all' ? 1 : 0) + (state.weather !== 'all' ? 1 : 0);
    if (badge) {
      badge.textContent = String(filterCount);
      badge.classList.toggle('is-hidden', filterCount === 0);
    }

    if (!chips.length) {
      bar.classList.add('is-hidden');
      bar.innerHTML = '';
      return;
    }

    const closeSvg = Icons ? Icons.svg('x', 11) : '×';
    bar.innerHTML = `
      ${chips.map((c) => `<button class="filter-chip" data-clear="${c.key}" type="button">${c.label} ${closeSvg}</button>`).join('')}
      <span class="chips-match-count mono-num">${t('citiesCountFmt', { n: lastMatchedIds.size })}</span>
      <button class="chips-action-btn" id="fit-filtered-btn" type="button">${t('fitResults')}</button>
      <button class="chips-action-btn" id="clear-all-chips-btn" type="button">${t('clear')}</button>
    `;
    bar.classList.remove('is-hidden');

    bar.querySelectorAll('.filter-chip').forEach((btn) => {
      btn.addEventListener('click', () => {
        const key = btn.dataset.clear;
        if (key === 'continent') switchContinent('global', true);
        else if (key === 'month') state.month = 'all';
        else if (key === 'theme') state.theme = 'all';
        else if (key === 'weather') state.weather = 'all';
        else if (key === 'favorites') state.onlyFavorites = false;
        else if (key === 'query') state.query = '';
        syncFilterControlUI();
        applyFilterUpdates();
      });
    });

    const fitBtn = document.getElementById('fit-filtered-btn');
    if (fitBtn) fitBtn.addEventListener('click', fitFilteredResults);

    const clearAll = document.getElementById('clear-all-chips-btn');
    if (clearAll) clearAll.addEventListener('click', resetAllFilters);
  }

  function fitFilteredResults() {
    const items = getFilteredDestinations();
    if (!items.length || !map) return;
    if (items.length === 1) {
      selectDestination(items[0].id);
      return;
    }
    const bounds = new maplibregl.LngLatBounds();
    items.forEach((d) => bounds.extend(d.coords));
    map.fitBounds(bounds, {
      padding: getDrawerViewportPadding(),
      maxZoom: 6.5,
      duration: prefersReducedMotion() ? 0 : 1100
    });
  }

  function syncFilterControlUI() {
    document.querySelectorAll('#theme-pills .pill-btn').forEach((b) => {
      b.classList.toggle('active', b.dataset.theme === state.theme);
    });
    document.querySelectorAll('#weather-pills .pill-btn').forEach((b) => {
      b.classList.toggle('active', b.dataset.weather === state.weather);
    });
    const favBtn = document.getElementById('favorites-toggle-btn');
    if (favBtn) {
      favBtn.classList.toggle('active', state.onlyFavorites);
      favBtn.setAttribute('aria-pressed', state.onlyFavorites ? 'true' : 'false');
    }
    const favCount = document.getElementById('favorites-count-badge');
    if (favCount) {
      favCount.textContent = String(state.favorites.size);
      favCount.classList.toggle('is-hidden', state.favorites.size === 0);
    }

    document.querySelectorAll('.continent-btn').forEach((b) => {
      b.classList.toggle('active', b.dataset.continent === state.continent);
    });
  }

  function resetAllFilters() {
    state.continent = 'global';
    state.month = 'all';
    state.theme = 'all';
    state.weather = 'all';
    state.onlyFavorites = false;
    state.query = '';
    syncFilterControlUI();
    applyFilterUpdates();
  }

  function applyFilterUpdates(skipUrl) {
    syncSeasonAndSkyboxAttrs();
    recomputeMatchedSet();
    syncGeoJsonSource();
    renderPhenologyBar();
    renderSidebar();
    renderActiveChips();
    scheduleLabelLayout();
    if (state.mode === 'gallery' && global.AestheticGallery) {
      global.AestheticGallery.render();
    }
    const summaryEl = document.getElementById('popover-match-summary');
    if (summaryEl) summaryEl.textContent = t('matchFmt', { count: lastMatchedIds.size });
    if (!skipUrl) syncUrlState(false);
  }

  function renderSidebar() {
    const all = ATLAS.getAll();
    const listEl = document.getElementById('sidebar-list');
    const scopeCont = getActiveScopeContinent();
    const scopeTotal = scopeCont === 'global'
      ? all.length
      : all.filter((d) => d.continent === scopeCont).length;

    const titleEl = document.getElementById('sidebar-title');
    if (titleEl) {
      titleEl.textContent = scopeCont === 'global' ? t('sidebarTitle') : (I18n ? I18n.tContinent(scopeCont) : scopeCont);
    }

    const resetBtn = document.getElementById('reset-filters-btn');
    if (resetBtn) resetBtn.classList.toggle('is-hidden', !isAnyFilterActive());

    const sc = document.getElementById('sidebar-count');
    if (sc) sc.textContent = `${lastMatchedIds.size} / ${scopeTotal}`;

    const grouped = new Map();
    ATLAS.REGION_ORDER.forEach((r) => grouped.set(r, []));
    all.forEach((d) => {
      if (!lastMatchedIds.has(d.id)) return;
      if (!grouped.has(d.region)) grouped.set(d.region, []);
      grouped.get(d.region).push(d);
    });

    const filtering = isAnyFilterActive();
    let html = '';
    let autoExpandedCount = 0;
    const chevSvg = Icons ? Icons.svg('chevronDown', 13) : '▾';

    grouped.forEach((items, regionName) => {
      if (!items.length) return;
      const isOpen = expandedRegions.has(regionName) || (filtering && autoExpandedCount < 6) || (!filtering && autoExpandedCount < 2);
      if (isOpen) {
        expandedRegions.add(regionName);
        autoExpandedCount++;
      }
      const itemsHtml = isOpen
        ? items
            .map((d) => {
              let rightBadge = `<span class="city-nav-prov mono-num">${tx(d.suggestedDays)}</span>`;
              if (state.month !== 'all') {
                const entry = indexById.get(d.id);
                const scVal = entry ? entry.monthScores[Number(state.month) - 1] : 3;
                const cls = scVal >= 5 ? 'score-5' : scVal === 4 ? 'score-4' : scVal === 3 ? 'score-3' : 'score-low';
                rightBadge = `<span class="score-pill ${cls}">${scVal}★</span>`;
              }
              const dotCls = d.allWeather ? 'dot-gold' : 'dot-ice';
              const activeCls = d.id === state.selectedId ? 'active' : '';
              return `
                <button class="city-nav-item ${activeCls}" data-id="${d.id}" type="button">
                  <span class="city-nav-left">
                    <span class="dot ${dotCls}"></span>
                    <span class="city-nav-name">${tx(d.name)}</span>
                  </span>
                  <span class="city-nav-right">${rightBadge}</span>
                </button>
              `;
            })
            .join('')
        : '';

      html += `
        <div class="region-group ${isOpen ? 'is-open' : ''}" data-region="${regionName}">
          <button class="region-header" type="button" aria-expanded="${isOpen ? 'true' : 'false'}">
            <span>${tx(regionName)}</span>
            <span class="region-header-right mono-num">${items.length} <span class="region-chevron">${chevSvg}</span></span>
          </button>
          <div class="region-items">${itemsHtml}</div>
        </div>
      `;
    });

    if (!html) {
      html = `<div style="padding:28px 14px;text-align:center;color:var(--text-secondary);font-size:12.5px;">${t('emptySidebar')}</div>`;
    }
    listEl.innerHTML = html;

    listEl.querySelectorAll('.region-header').forEach((hdr) => {
      hdr.addEventListener('click', () => {
        const grp = hdr.parentElement;
        const reg = grp && grp.dataset.region;
        if (!reg) return;
        if (expandedRegions.has(reg)) expandedRegions.delete(reg);
        else expandedRegions.add(reg);
        renderSidebar();
      });
    });

    listEl.querySelectorAll('.city-nav-item').forEach((btn) => {
      btn.addEventListener('click', () => selectDestination(btn.dataset.id));
      btn.addEventListener('mouseenter', () => {
        const d = ATLAS.getById(btn.dataset.id);
        if (d && !d.spots && typeof ATLAS.ensureDetail === 'function') {
          ATLAS.ensureDetail(btn.dataset.id);
        }
      }, { passive: true });
    });
  }

  function renderContinentTabs() {
    const container = document.getElementById('continent-tabs');
    if (!container) return;
    const countsByCont = {};
    ATLAS.getAll().forEach((d) => {
      countsByCont[d.continent] = (countsByCont[d.continent] || 0) + 1;
    });
    container.innerHTML = ATLAS.CONTINENTS.map((c) => {
      const cnt = c.id === 'global' ? ATLAS.getAll().length : (countsByCont[c.id] || 0);
      const active = c.id === state.continent ? 'active' : '';
      const shortName = I18n ? I18n.tContinent(c.id) : c.name;
      return `<button class="continent-btn ${active}" data-continent="${c.id}" type="button">${shortName} <span class="continent-tag">${cnt}</span></button>`;
    }).join('');

    container.querySelectorAll('.continent-btn').forEach((btn) => {
      btn.addEventListener('click', () => switchContinent(btn.dataset.continent));
    });
  }

  function switchContinent(continentId, skipCamera) {
    stopSpin();
    state.continent = continentId;
    const info = ATLAS.getContinent(continentId);

    document.querySelectorAll('.continent-btn').forEach((b) => {
      b.classList.toggle('active', b.dataset.continent === continentId);
    });

    if (!skipCamera && map) {
      cinematicFlyTo({
        center: info.center,
        zoom: info.zoom,
        pitch: info.pitch || 16,
        bearing: 0,
        padding: { top: 76, bottom: 76, left: isMobileViewport() ? 16 : 300, right: 16 },
        duration: 1300
      });
    }

    if (state.selectedId) {
      const cur = ATLAS.getById(state.selectedId);
      if (!cur || continentId === 'global' || cur.continent !== continentId) {
        closeDestination(true);
      }
    }
    applyFilterUpdates();
  }

  /* Smooth Skin Crossfade + Per-Skin MaxZoom Clamp */
  function switchSkin(skinId, skipUrl) {
    if (!SKIN_META[skinId]) return;
    const prevSkin = state.skin;
    state.skin = skinId;

    document.querySelectorAll('[data-skin]').forEach((btn) => {
      btn.classList.toggle('active', btn.dataset.skin === skinId);
    });

    if (!map) return;
    syncMapThemeAndAccent();
    const maxZ = SKIN_META[skinId].maxZoom;
    map.setMaxZoom(maxZ);
    if (map.getZoom() > maxZ) {
      map.easeTo({ zoom: maxZ, duration: 350 });
    }

    if (prevSkin !== skinId) {
      const nextLayer = `layer-${skinId}`;
      const prevLayer = `layer-${prevSkin}`;
      if (skinFadeTimer) clearTimeout(skinFadeTimer);

      if (map.getLayer(nextLayer)) {
        map.setLayoutProperty(nextLayer, 'visibility', 'visible');
        map.setPaintProperty(nextLayer, 'raster-opacity', 0);
        requestAnimationFrame(() => {
          if (map.getLayer(nextLayer)) {
            map.setPaintProperty(nextLayer, 'raster-opacity', 1);
          }
          if (map.getLayer(prevLayer)) {
            map.setPaintProperty(prevLayer, 'raster-opacity', 0);
          }
        });
        skinFadeTimer = setTimeout(() => {
          Object.keys(SKIN_META).forEach((s) => {
            if (s !== state.skin && map.getLayer(`layer-${s}`)) {
              map.setLayoutProperty(`layer-${s}`, 'visibility', 'none');
            }
          });
        }, 400);
      }
    }

    if (!skipUrl) syncUrlState(false);
    if (global.SolarTerminator) global.SolarTerminator.reapplyAfterStyleLoad(map);
  }

  /* Delta-Time Smooth Auto Spin */
  function spinStep(now) {
    if (!state.isSpinning || !map) return;
    if (!lastSpinTime) lastSpinTime = now;
    const dt = Math.min(0.06, (now - lastSpinTime) / 1000);
    lastSpinTime = now;

    const c = map.getCenter();
    let nextLng = c.lng + dt * 7.2;
    if (nextLng > 180) nextLng -= 360;
    map.setCenter([nextLng, c.lat]);
    spinRaf = requestAnimationFrame(spinStep);
  }

  function startSpin() {
    if (state.isSpinning || prefersReducedMotion()) return;
    state.isSpinning = true;
    lastSpinTime = 0;
    const btn = document.getElementById('toggle-spin-btn');
    if (btn) btn.classList.add('active');
    spinRaf = requestAnimationFrame(spinStep);
  }

  function stopSpin() {
    if (!state.isSpinning && !spinRaf) return;
    state.isSpinning = false;
    lastSpinTime = 0;
    if (spinRaf) cancelAnimationFrame(spinRaf);
    spinRaf = null;
    const btn = document.getElementById('toggle-spin-btn');
    if (btn) btn.classList.remove('active');
  }

  /* View Mode (3D Map / Aesthetic Gallery / Trip Planner / Private Archive) */
  function setViewMode(mode, skipUrl, pushHistory) {
    const valid = ['map', 'gallery', 'planner', 'archive'];
    let requested = valid.includes(mode) ? mode : 'map';
    if (isEmbedMode && (requested === 'archive' || requested === 'planner')) {
      requested = 'map';
    }
    const prevMode = state.mode;
    state.mode = requested;

    const mapBtn = document.getElementById('mode-map-btn');
    const galBtn = document.getElementById('mode-gallery-btn');
    const planBtn = document.getElementById('mode-planner-btn');
    const archBtn = document.getElementById('mode-archive-btn');
    const galView = document.getElementById('gallery-view');
    const planView = document.getElementById('planner-view');
    const archView = document.getElementById('archive-view');

    [
      [mapBtn, 'map'],
      [galBtn, 'gallery'],
      [planBtn, 'planner'],
      [archBtn, 'archive']
    ].forEach(([btn, mName]) => {
      if (!btn) return;
      const active = state.mode === mName;
      btn.classList.toggle('active', active);
      btn.setAttribute('aria-selected', active ? 'true' : 'false');
    });

    document.querySelectorAll('#mobile-bottom-nav [data-mob-mode]').forEach((btn) => {
      const active = btn.getAttribute('data-mob-mode') === state.mode;
      btn.classList.toggle('active', active);
      btn.setAttribute('aria-pressed', active ? 'true' : 'false');
    });

    if (galView) galView.classList.toggle('is-hidden', state.mode !== 'gallery');
    if (planView) planView.classList.toggle('is-hidden', state.mode !== 'planner');
    if (archView) archView.classList.toggle('is-hidden', state.mode !== 'archive');

    if (state.mode !== 'map') stopSpin();
    if (state.mode === 'gallery' && global.AestheticGallery) {
      global.AestheticGallery.render();
    } else if (state.mode === 'planner' && global.TripPlanner) {
      global.TripPlanner.renderWorkspace();
    } else if (state.mode === 'archive' && global.TravelArchive) {
      global.TravelArchive.renderWorkspace();
    }
    scheduleLabelLayout();
    if (!skipUrl) syncUrlState(Boolean(pushHistory !== false && prevMode !== state.mode));
  }
  global.setAppViewMode = setViewMode;

  /* Favorites Toggle & Sync */
  function toggleFavorite(id) {
    if (!id) return;
    if (state.favorites.has(id)) {
      state.favorites.delete(id);
    } else {
      state.favorites.add(id);
    }
    saveFavorites();
    syncFavoriteButtonUI(id);
    syncFilterControlUI();
    applyFilterUpdates(true);
  }

  function syncFavoriteButtonUI(id) {
    const btn = document.getElementById('drawer-fav-btn');
    if (!btn || !Icons) return;
    const isFav = Boolean(id && state.favorites.has(id));
    btn.classList.toggle('is-favorited', isFav);
    btn.setAttribute('aria-pressed', isFav ? 'true' : 'false');
    btn.innerHTML = Icons.svg(isFav ? 'bookmarkFilled' : 'bookmark', 14);
  }
  global.syncFavoriteButtonUI = syncFavoriteButtonUI;

  /* URL State Sync & Deep Link Compatibility */
  function syncUrlState(push) {
    if (suppressPopState || !global.history || !global.history.replaceState) return;
    const url = new URL(global.location.href);
    const params = url.searchParams;

    if (state.selectedId) params.set('focus', state.selectedId);
    else params.delete('focus');

    if (state.month !== 'all') params.set('m', state.month);
    else params.delete('m');

    if (state.theme !== 'all') params.set('t', state.theme);
    else params.delete('t');

    if (state.weather !== 'all') params.set('w', state.weather);
    else params.delete('w');

    if (state.continent !== 'global') params.set('c', state.continent);
    else params.delete('c');

    if (state.skin !== 'satellite') params.set('skin', state.skin);
    else params.delete('skin');

    if (state.mode !== 'map') params.set('mode', state.mode);
    else params.delete('mode');

    if (global.AppI18n && typeof global.AppI18n.getLang === 'function') {
      const lngCode = global.AppI18n.getLang();
      if (lngCode && lngCode !== 'zh-CN') params.set('lang', lngCode);
      else params.delete('lang');
    }

    params.delete('instant');

    const nextHref = `${url.pathname}${params.toString() ? '?' + params.toString() : ''}${url.hash}`;
    try {
      if (push) global.history.pushState({ focus: state.selectedId }, '', nextHref);
      else global.history.replaceState({ focus: state.selectedId }, '', nextHref);
    } catch (e) {
      // ignore file:// origin restrictions
    }
  }

  function readInitialUrlState() {
    const params = new URLSearchParams(global.location.search);
    const m = params.get('m');
    if (m && (m === 'all' || (Number(m) >= 1 && Number(m) <= 12))) state.month = m;

    const t = params.get('t');
    if (t && (t === 'all' || THEME_LABELS[t])) state.theme = t;

    const w = params.get('w');
    if (w && (w === 'all' || WEATHER_LABELS[w])) state.weather = w;

    const c = params.get('c');
    if (c && ATLAS.CONTINENTS.some((x) => x.id === c)) state.continent = c;

    const skin = params.get('skin');
    if (skin && SKIN_META[skin]) state.skin = skin;

    const mode = params.get('mode');
    if (mode === 'gallery' || mode === 'planner' || mode === 'archive') state.mode = mode;

    const urlLang = params.get('lang');
    if ((urlLang === 'zh-CN' || urlLang === 'zh-TW' || urlLang === 'en') && global.AppI18n && typeof global.AppI18n.setLang === 'function') {
      global.AppI18n.setLang(urlLang, { persist: false });
    }

    const spotRaw = params.get('spot');
    const spotIdx = spotRaw !== null && spotRaw !== '' && Number.isFinite(Number(spotRaw)) ? Number(spotRaw) : null;
    const camRaw = params.get('cam');
    const camBearing = camRaw !== null && camRaw !== '' && Number.isFinite(Number(camRaw)) ? Number(camRaw) : null;
    const dateStr = params.get('date') || null;
    const layersParam = params.get('layers') ? params.get('layers').split(',').filter(Boolean) : [];

    const embed = params.get('embed');
    return {
      focusId: params.get('focus') || params.get('dest') || (embed && embed !== 'global' ? embed : null),
      instant: params.get('instant') === '1' || Boolean(embed),
      embed,
      chromeOff: params.get('chrome') === 'off',
      autoSpin: params.get('spin') === '1',
      autoDayNight: params.get('daynight') === '1',
      autoTerrain: params.get('terrain') === '1',
      spotIdx,
      camBearing,
      dateStr,
      layers: layersParam
    };
  }

  function bindEvents() {
    // Brand home button -> return to globe & fly global
    const brandHomeBtn = document.getElementById('brand-home-btn');
    if (brandHomeBtn) {
      brandHomeBtn.addEventListener('click', () => {
        if (state.mode !== 'map') setViewMode('map');
        flyContinent('global');
      });
    }

    // Mobile bottom navigation bar
    document.querySelectorAll('#mobile-bottom-nav [data-mob-mode]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const m = btn.getAttribute('data-mob-mode');
        if (m) setViewMode(m);
      });
    });
    const mobLayersBtn = document.getElementById('mob-layers-btn');
    if (mobLayersBtn) {
      mobLayersBtn.addEventListener('click', () => {
        const lBtn = document.getElementById('layers-popover-btn');
        if (lBtn) lBtn.click();
      });
    }

    // Lazy proxies for V5 HelpCenter & ShareCenter so every module entry works on first click
    if (!global.HelpCenter && global.LazyLoader && typeof global.LazyLoader.loadScript === 'function') {
      global.HelpCenter = {
        open: (slug) => global.LazyLoader.loadScript('js/lazy/help-center.js').then(() => global.HelpCenter && global.HelpCenter.open(slug)).catch(() => {}),
        openTopic: (slug) => global.LazyLoader.loadScript('js/lazy/help-center.js').then(() => global.HelpCenter && global.HelpCenter.openTopic(slug)).catch(() => {})
      };
    }
    if (!global.ShareCenter && global.LazyLoader && typeof global.LazyLoader.loadScript === 'function') {
      global.ShareCenter = {
        open: (ctx) => global.LazyLoader.loadScript('js/lazy/share-center.js').then(() => global.ShareCenter && global.ShareCenter.open(ctx)).catch(() => {})
      };
    }

    // Account Center & Help Center triggers
    const accBtn = document.getElementById('account-btn');
    if (accBtn) {
      accBtn.addEventListener('click', () => {
        if (global.AuthService && typeof global.AuthService.openAccountCenter === 'function') {
          global.AuthService.openAccountCenter();
        }
      });
    }
    const helpBtn = document.getElementById('help-btn');
    if (helpBtn) {
      helpBtn.addEventListener('click', () => {
        if (global.HelpCenter && typeof global.HelpCenter.open === 'function') {
          global.HelpCenter.open('quick-start');
        }
      });
    }
    document.addEventListener('keydown', (e) => {
      if (e.key === '?' && !e.ctrlKey && !e.metaKey && !e.altKey) {
        const tag = (e.target && e.target.tagName) || '';
        if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || (e.target && e.target.isContentEditable)) return;
        e.preventDefault();
        if (global.HelpCenter && typeof global.HelpCenter.open === 'function') {
          global.HelpCenter.open('keyboard-and-feedback');
        }
      }
    });
    global.syncAccountBadgeUI = () => {
      const btn = document.getElementById('account-btn');
      if (!btn || !global.AuthService) return;
      const u = global.AuthService.getCurrentUser();
      btn.classList.toggle('active', Boolean(u));
      if (u) btn.title = `${u.displayName || u.email}`;
    };

    // Gallery sticky back + help
    const galStickyBack = document.getElementById('gallery-sticky-back-btn');
    if (galStickyBack) galStickyBack.addEventListener('click', () => setViewMode('map'));
    const galHelpBtn = document.getElementById('gallery-help-btn');
    if (galHelpBtn) {
      galHelpBtn.addEventListener('click', () => {
        if (global.HelpCenter && typeof global.HelpCenter.openTopic === 'function') {
          global.HelpCenter.openTopic('destination-details');
        }
      });
    }

    // Mode switch
    document.getElementById('mode-map-btn').addEventListener('click', () => setViewMode('map'));
    document.getElementById('mode-gallery-btn').addEventListener('click', () => setViewMode('gallery'));
    const planModeBtn = document.getElementById('mode-planner-btn');
    if (planModeBtn) planModeBtn.addEventListener('click', () => setViewMode('planner'));
    const archModeBtn = document.getElementById('mode-archive-btn');
    if (archModeBtn) archModeBtn.addEventListener('click', () => setViewMode('archive'));

    // Popovers: Filter, Appearance Studio, Language Selector, Map Layers, Ambient Radio
    const popBtn = document.getElementById('filter-popover-btn');
    const popEl = document.getElementById('filter-popover');
    const appBtn = document.getElementById('appearance-btn');
    const appEl = document.getElementById('appearance-popover');
    const langBtn = document.getElementById('lang-btn');
    const langEl = document.getElementById('lang-popover');
    const layersBtn = document.getElementById('layers-popover-btn');
    const layersEl = document.getElementById('layers-popover');
    const musicBtn = document.getElementById('music-popover-btn');
    const musicEl = document.getElementById('music-popover');

    const closeAllPopovers = (exceptEl) => {
      [
        [popEl, popBtn],
        [appEl, appBtn],
        [langEl, langBtn],
        [layersEl, layersBtn],
        [musicEl, musicBtn]
      ].forEach(([el, btn]) => {
        if (el && el !== exceptEl && !el.classList.contains('is-hidden')) {
          el.classList.add('is-hidden');
          if (btn) btn.setAttribute('aria-expanded', 'false');
        }
      });
    };

    [
      [popBtn, popEl],
      [appBtn, appEl],
      [langBtn, langEl],
      [layersBtn, layersEl],
      [musicBtn, musicEl]
    ].forEach(([btn, el]) => {
      if (!btn || !el) return;
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const willOpen = el.classList.contains('is-hidden');
        closeAllPopovers(el);
        el.classList.toggle('is-hidden', !willOpen);
        btn.setAttribute('aria-expanded', willOpen ? 'true' : 'false');
      });
    });

    document.addEventListener('click', (e) => {
      if (
        (popEl && popEl.contains(e.target)) ||
        (appEl && appEl.contains(e.target)) ||
        (langEl && langEl.contains(e.target)) ||
        (layersEl && layersEl.contains(e.target)) ||
        (musicEl && musicEl.contains(e.target))
      ) {
        return;
      }
      closeAllPopovers(null);
    });

    if (layersEl) {
      const LAYER_SPECS = {
        'toggle-weather-layer-btn': {
          title: 'Global Weather / Radar',
          badge: 'Live (10–30m)',
          desc: 'Source: RainViewer / NOAA Radar · Res: ~1–5km global · Reflectivity & cloud deck.'
        },
        'toggle-timemachine-btn': {
          title: 'NASA GIBS Earth Time Machine',
          badge: 'Historical Daily',
          desc: 'Source: NASA EOSDIS GIBS (MODIS/VIIRS) · Res: 250m–1km · Daily archival compositing (cloud gaps possible).'
        },
        'toggle-nightlights-btn': {
          title: 'NASA Black Marble Night Lights',
          badge: 'Historical Mosaic',
          desc: 'Source: NASA VIIRS Day/Night Band · Res: ~500m · Cloud-free artificial skyglow composite.'
        },
        'toggle-aurora-btn': {
          title: 'NOAA OVATION Aurora Oval',
          badge: 'Live Space Weather',
          desc: 'Source: NOAA SWPC OVATION + Kp Index · Res: ~1° lat/lon · Updates every 15–30 min.'
        },
        'toggle-daynight-btn': {
          title: 'Solar Terminator',
          badge: 'Live Ephemeris',
          desc: 'Source: SunCalc Astronomical Model · Exact subsolar point, twilight & polar circle boundary.'
        },
        'toggle-pheno-heat-btn': {
          title: 'KAIROS Phenology Heatmap',
          badge: 'Archive + Calibrated',
          desc: 'Source: Atlas Curated Phenology + ERA5 Normals · Tier A/B/C seasonal suitability index (0–100).'
        },
        'toggle-terrain-btn': {
          title: '3D Terrain Elevation',
          badge: 'Static DEM',
          desc: 'Source: Terrarium / Mapterhorn RGB DEM · Res: ~30–76m mesh · Adjustable exaggeration (1.0×–1.8×).'
        },
        'toggle-contour-btn': {
          title: 'Topographic Contours',
          badge: 'Static DEM',
          desc: 'Source: MapLibre Contour Vector · Active at Zoom >= 9 · Elevation interval lines.'
        }
      };
      layersEl.addEventListener('click', (ev) => {
        const btn = ev.target.closest('button[id]');
        const spec = btn && LAYER_SPECS[btn.id];
        if (!spec) return;
        const tEl = document.getElementById('layer-meta-title');
        const bEl = document.getElementById('layer-meta-badge');
        const dEl = document.getElementById('layer-meta-desc');
        if (tEl) tEl.textContent = spec.title;
        if (bEl) bEl.textContent = spec.badge;
        if (dEl) dEl.textContent = spec.desc;
      });
      const opSlider = document.getElementById('layer-global-opacity');
      const opVal = document.getElementById('layer-global-opacity-val');
      if (opSlider) {
        opSlider.addEventListener('input', () => {
          const v = Number(opSlider.value) / 100;
          if (opVal) opVal.textContent = `${opSlider.value}%`;
          if (map && typeof map.getStyle === 'function') {
            ['layer-gibs-a', 'layer-v4-phenology-heat', 'layer-daynight-terminator'].forEach((lid) => {
              if (map.getLayer(lid)) {
                const prop = lid.includes('heat') ? 'heatmap-opacity' : (lid.includes('terminator') ? 'fill-opacity' : 'raster-opacity');
                try { map.setPaintProperty(lid, prop, v); } catch (e) { /* ignore */ }
              }
            });
          }
        });
      }
    }

    function updateLayersBadge() {
      const badge = document.getElementById('layers-active-badge');
      if (!badge) return;
      const wxBtnEl = document.getElementById('toggle-weather-layer-btn');
      const tmBtnEl = document.getElementById('toggle-timemachine-btn');
      const fpBtnEl = document.getElementById('toggle-footprint-btn');
      const t3dState = global.Terrain3DModule ? global.Terrain3DModule.getState() : {};
      const anyActive = Boolean(
        state.showLabels ||
        state.forceAllLabels ||
        (wxBtnEl && wxBtnEl.classList.contains('active')) ||
        (tmBtnEl && tmBtnEl.classList.contains('active')) ||
        (fpBtnEl && fpBtnEl.classList.contains('active')) ||
        t3dState.terrain ||
        t3dState.contours ||
        t3dState.buildings ||
        t3dState.nightLights ||
        t3dState.aurora ||
        (global.PhenologyEngine && global.PhenologyEngine.isHeatmapEnabled())
      );
      badge.classList.toggle('is-hidden', !anyActive);
    }

    if (typeof MutationObserver !== 'undefined') {
      const layerObserver = new MutationObserver(updateLayersBadge);
      [
        'toggle-weather-layer-btn',
        'toggle-timemachine-btn',
        'toggle-footprint-btn',
        'toggle-terrain-btn',
        'toggle-contour-btn',
        'toggle-buildings-btn',
        'toggle-nightlights-btn',
        'toggle-aurora-btn',
        'toggle-pheno-heat-btn'
      ].forEach((id) => {
        const el = document.getElementById(id);
        if (el) layerObserver.observe(el, { attributes: true, attributeFilter: ['class'] });
      });
    }

    document.querySelectorAll('#theme-pills .pill-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        state.theme = btn.dataset.theme;
        syncFilterControlUI();
        applyFilterUpdates();
      });
    });

    document.querySelectorAll('#weather-pills .pill-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        state.weather = btn.dataset.weather;
        syncFilterControlUI();
        applyFilterUpdates();
      });
    });

    document.getElementById('popover-reset-btn').addEventListener('click', resetAllFilters);
    document.getElementById('reset-filters-btn').addEventListener('click', resetAllFilters);

    // Favorites filter toggle & drawer bookmark button
    document.getElementById('favorites-toggle-btn').addEventListener('click', () => {
      state.onlyFavorites = !state.onlyFavorites;
      syncFilterControlUI();
      applyFilterUpdates();
    });

    document.getElementById('drawer-fav-btn').addEventListener('click', () => {
      if (state.selectedId) toggleFavorite(state.selectedId);
    });

    // Sidebar collapse/expand
    document.getElementById('sidebar-collapse-btn').addEventListener('click', () => setSidebarOpen(false));
    const sidebarToggleBtn = document.getElementById('sidebar-toggle-btn');
    if (sidebarToggleBtn) {
      sidebarToggleBtn.addEventListener('click', () => {
        const sidebar = document.getElementById('left-sidebar');
        const isCurrentlyOpen = sidebar && !sidebar.classList.contains('is-hidden');
        setSidebarOpen(!isCurrentlyOpen);
      });
    }

    // Map skin & controls
    document.querySelectorAll('[data-skin]').forEach((btn) => {
      btn.addEventListener('click', () => switchSkin(btn.dataset.skin));
    });

    document.getElementById('toggle-labels-btn').addEventListener('click', (e) => {
      state.showLabels = !state.showLabels;
      e.currentTarget.classList.toggle('active', state.showLabels);
      if (map && map.getLayer('layer-labels')) {
        map.setLayoutProperty('layer-labels', 'visibility', state.showLabels ? 'visible' : 'none');
      }
      updateLayersBadge();
    });

    const tileCdnBtn = document.getElementById('toggle-tile-cdn-btn');
    if (tileCdnBtn) {
      tileCdnBtn.addEventListener('click', () => {
        let nextMode;
        if (workerTileAvailable) {
          nextMode = activeTileRoute === 'worker' ? 'cn' : activeTileRoute === 'cn' ? 'global' : 'worker';
        } else {
          nextMode = activeTileRoute === 'cn' ? 'global' : 'cn';
        }
        saveTileMode(nextMode);
        applyTileSourceMode(nextMode);
      });
    }

    document.getElementById('toggle-all-labels-btn').addEventListener('click', (e) => {
      state.forceAllLabels = !state.forceAllLabels;
      e.currentTarget.classList.toggle('active', state.forceAllLabels);
      scheduleLabelLayout();
      updateLayersBadge();
    });

    document.getElementById('toggle-proj-btn').addEventListener('click', (e) => {
      state.isGlobe = !state.isGlobe;
      map.setProjection({ type: state.isGlobe ? 'globe' : 'mercator' });
      e.currentTarget.classList.toggle('active', state.isGlobe);
      scheduleLabelLayout();
    });

    document.getElementById('toggle-spin-btn').addEventListener('click', () => {
      if (state.isSpinning) stopSpin();
      else startSpin();
    });

    const wxLayerBtn = document.getElementById('toggle-weather-layer-btn');
    if (wxLayerBtn) {
      wxLayerBtn.addEventListener('click', async () => {
        if (!global.WeatherPanel) return;
        const activeMode = await global.WeatherPanel.setGlobalWeatherLayer(map);
        wxLayerBtn.classList.toggle('active', activeMode !== 'off');
        wxLayerBtn.title = activeMode === 'radar'
          ? '全球实时雷达 (RainViewer) · 点击切红外云图'
          : activeMode === 'clouds'
            ? '全球红外云图 (RainViewer) · 点击关闭'
            : '全球实时雷达/云图';
      });
    }

    const tmBtn = document.getElementById('toggle-timemachine-btn');
    if (tmBtn) {
      tmBtn.addEventListener('click', () => {
        if (global.EarthTimeMachine) global.EarthTimeMachine.toggleDock();
      });
    }

    const clusterBtn = document.getElementById('toggle-cluster-btn');
    if (clusterBtn) {
      clusterBtn.classList.toggle('active', state.clustering);
      clusterBtn.addEventListener('click', () => {
        state.clustering = !state.clustering;
        clusterBtn.classList.toggle('active', state.clustering);
        syncGeoJsonSource();
        scheduleLabelLayout();
      });
    }

    const fpBtn = document.getElementById('toggle-footprint-btn');
    if (fpBtn) {
      fpBtn.addEventListener('click', () => {
        if (global.TravelArchive) global.TravelArchive.applyFootprintLayer(map);
      });
    }

    const terrainBtn = document.getElementById('toggle-terrain-btn');
    if (terrainBtn) {
      terrainBtn.addEventListener('click', () => {
        if (global.Terrain3DModule) global.Terrain3DModule.toggleTerrain(map);
      });
    }
    document.querySelectorAll('[data-terrain-exag]').forEach((btn) => {
      btn.addEventListener('click', () => {
        if (global.Terrain3DModule) global.Terrain3DModule.setTerrainExaggeration(map, Number(btn.dataset.terrainExag));
      });
    });
    const contourBtn = document.getElementById('toggle-contour-btn');
    if (contourBtn) {
      contourBtn.addEventListener('click', () => {
        if (global.Terrain3DModule) global.Terrain3DModule.toggleContours(map);
      });
    }
    const bldgBtn = document.getElementById('toggle-buildings-btn');
    if (bldgBtn) {
      bldgBtn.addEventListener('click', () => {
        if (global.Terrain3DModule) global.Terrain3DModule.toggleBuildings(map);
      });
    }
    const nlBtn = document.getElementById('toggle-nightlights-btn');
    if (nlBtn) {
      nlBtn.addEventListener('click', () => {
        if (global.Terrain3DModule) global.Terrain3DModule.toggleNightLights(map);
      });
    }
    const auroraBtn = document.getElementById('toggle-aurora-btn');
    if (auroraBtn) {
      auroraBtn.addEventListener('click', () => {
        if (global.Terrain3DModule) global.Terrain3DModule.toggleAurora(map);
      });
    }
    const phenoHeatBtn = document.getElementById('toggle-pheno-heat-btn');
    if (phenoHeatBtn) {
      phenoHeatBtn.addEventListener('click', () => {
        if (global.PhenologyEngine) global.PhenologyEngine.toggleSeasonHeatmap(map, state.month);
      });
    }
    const dayNightBtn = document.getElementById('toggle-daynight-btn');
    if (dayNightBtn) {
      dayNightBtn.addEventListener('click', () => {
        if (global.SolarTerminator) global.SolarTerminator.toggle(map);
      });
    }
    const epicBtn = document.getElementById('open-epic-earth-btn');
    if (epicBtn) {
      epicBtn.addEventListener('click', () => {
        closeAllPopovers(null);
        if (global.EpicEarthModule) global.EpicEarthModule.open();
      });
    }

    const tourReplayBtn = document.getElementById('onboarding-replay-btn');
    if (tourReplayBtn) {
      tourReplayBtn.addEventListener('click', () => {
        closeAllPopovers(null);
        if (state.selectedId) closeDestination(true);
        if (global.OnboardingTour) global.OnboardingTour.start(true);
      });
    }

    const toggleFullscreen = (nextVal) => {
      state.isFullscreen = nextVal !== undefined ? nextVal : !state.isFullscreen;
      document.body.classList.toggle('fullscreen-globe', state.isFullscreen);
      const exitPill = document.getElementById('fullscreen-exit-btn');
      if (exitPill) exitPill.classList.toggle('is-hidden', !state.isFullscreen);
      const fsBtn = document.getElementById('toggle-fullscreen-btn');
      if (fsBtn) fsBtn.classList.toggle('active', state.isFullscreen);
    };
    const fsBtn = document.getElementById('toggle-fullscreen-btn');
    if (fsBtn) fsBtn.addEventListener('click', () => toggleFullscreen());
    const fsExitBtn = document.getElementById('fullscreen-exit-btn');
    if (fsExitBtn) fsExitBtn.addEventListener('click', () => toggleFullscreen(false));

    const diagBtn = document.getElementById('open-diagnostics-btn');
    if (diagBtn) {
      diagBtn.addEventListener('click', () => {
        if (global.DiagnosticsModule) global.DiagnosticsModule.open();
      });
    }

    document.getElementById('fly-china-btn').addEventListener('click', () => {
      stopSpin();
      closeDestination();
      state.continent = 'asia';
      syncFilterControlUI();
      applyFilterUpdates();
      cinematicFlyTo({
        center: [104.5, 34.5],
        zoom: 3.15,
        pitch: 22,
        bearing: 0,
        padding: { top: 76, bottom: 76, left: 24, right: 24 },
        duration: 1300
      });
    });

    document.getElementById('fly-global-btn').addEventListener('click', () => switchContinent('global'));

    const stepZoomBy = (delta) => {
      if (!map) return;
      const now = Date.now();
      const minZ = typeof map.getMinZoom === 'function' ? map.getMinZoom() : 0.8;
      const maxZ = typeof map.getMaxZoom === 'function' ? map.getMaxZoom() : 18;
      const base = (targetButtonZoom !== null && now - lastZoomBtnAt < 360) ? targetButtonZoom : map.getZoom();
      lastZoomBtnAt = now;
      targetButtonZoom = Math.max(minZ, Math.min(maxZ, base + delta));
      map.easeTo({
        zoom: targetButtonZoom,
        duration: 240,
        easing: easeInOutCubic
      });
    };
    document.getElementById('zoom-in-btn').addEventListener('click', () => stepZoomBy(0.35));
    document.getElementById('zoom-out-btn').addEventListener('click', () => stepZoomBy(-0.35));

    document.getElementById('back-to-city-overview').addEventListener('click', () => {
      const dest = ATLAS.getById(state.selectedId);
      if (dest) {
        cinematicFlyTo({
          center: dest.coords,
          zoom: dest.zoom || 9.0,
          pitch: 42,
          bearing: 0,
          duration: 1050
        });
      }
    });

    document.getElementById('drawer-close-btn').addEventListener('click', () => closeDestination());
    const expandBtn = document.getElementById('drawer-expand-btn');
    if (expandBtn) {
      expandBtn.addEventListener('click', () => Panel.cycleSheetState());
    }

    const posterBtn = document.getElementById('poster-dest-btn');
    if (posterBtn) {
      posterBtn.addEventListener('click', async () => {
        if (!state.selectedId || !global.PosterShare) return;
        const dest = ATLAS.getById(state.selectedId);
        if (!dest) return;
        const res = await global.PosterShare.generateDestinationPoster(dest, map);
        if (res) global.PosterShare.openPosterModal(res);
      });
    }
    const embedBtn = document.getElementById('embed-dest-btn');
    if (embedBtn) {
      embedBtn.addEventListener('click', async () => {
        if (!state.selectedId || !global.PosterShare) return;
        const dest = ATLAS.getById(state.selectedId);
        if (!dest) return;
        const code = global.PosterShare.buildEmbedIframeCode(dest);
        if (global.navigator && global.navigator.clipboard) {
          await global.navigator.clipboard.writeText(code).catch(() => {});
        }
        if (Icons) embedBtn.innerHTML = Icons.svg('check', 14);
        setTimeout(() => { if (Icons) embedBtn.innerHTML = Icons.svg('globe', 14); }, 1800);
      });
    }

    // Share destination deep link
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
          if (Icons) shareBtn.innerHTML = Icons.svg('check', 14);
          setTimeout(() => { if (Icons) shareBtn.innerHTML = Icons.svg('share', 14); }, 1600);
        };
        if (isCoarsePointer() && global.navigator && typeof global.navigator.share === 'function') {
          try {
            await global.navigator.share({
              title: dest ? tx(dest.name) : t('appTitle'),
              text: dest ? `${tx(dest.country)} · ${tx(dest.subtitle)}` : t('appTitle'),
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
        } catch (e) {
          // fallback
        }
        const ta = document.createElement('textarea');
        ta.value = shareUrl;
        ta.setAttribute('readonly', '');
        ta.style.cssText = 'position:fixed;opacity:0;';
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
      const all = getFilteredDestinations();
      if (!all.length) return;
      const idx = all.findIndex((d) => d.id === state.selectedId);
      const nextIdx = idx === -1 ? 0 : (idx + delta + all.length) % all.length;
      selectDestination(all[nextIdx].id);
    }
    document.getElementById('prev-dest-btn').addEventListener('click', () => stepDestination(-1));
    document.getElementById('next-dest-btn').addEventListener('click', () => stepDestination(1));

    const skipBtn = document.getElementById('skip-intro-btn');
    if (skipBtn) {
      skipBtn.addEventListener('click', () => {
        const dest = ATLAS.getById(state.selectedId);
        cancelActiveFlight();
        if (dest) {
          cinematicFlyTo({ center: dest.coords, zoom: dest.zoom || 9.0, pitch: 42, bearing: 0, instant: true });
        }
      });
    }

    // Global Keyboard Shortcuts: Ctrl/Cmd+K, /, Esc, Left/Right
    global.addEventListener('keydown', (e) => {
      const tag = document.activeElement && document.activeElement.tagName;
      const isTyping = tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT';

      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        if (isEmbedMode) return;
        e.preventDefault();
        if (global.CommandPalette) {
          if (global.CommandPalette.isOpen()) global.CommandPalette.close();
          else global.CommandPalette.open();
        }
        return;
      }

      if (e.key === '/' && !isTyping) {
        if (isEmbedMode) return;
        e.preventDefault();
        if (global.CommandPalette) global.CommandPalette.open();
        return;
      }

      if (e.key.toLowerCase() === 'f' && !isTyping && !e.ctrlKey && !e.metaKey) {
        if (isEmbedMode) return;
        e.preventDefault();
        state.isFullscreen = !state.isFullscreen;
        document.body.classList.toggle('fullscreen-globe', state.isFullscreen);
        const exitPill = document.getElementById('fullscreen-exit-btn');
        if (exitPill) exitPill.classList.toggle('is-hidden', !state.isFullscreen);
        const fsBtn = document.getElementById('toggle-fullscreen-btn');
        if (fsBtn) fsBtn.classList.toggle('active', state.isFullscreen);
        return;
      }

      if (e.key === 'Escape') {
        if (global.Viewfinder3D && global.Viewfinder3D.isOpen()) {
          global.Viewfinder3D.close();
          return;
        }
        if (state.isFullscreen) {
          state.isFullscreen = false;
          document.body.classList.remove('fullscreen-globe');
          const exitPill = document.getElementById('fullscreen-exit-btn');
          if (exitPill) exitPill.classList.add('is-hidden');
          const fsBtn = document.getElementById('toggle-fullscreen-btn');
          if (fsBtn) fsBtn.classList.remove('active');
          return;
        }
        const svModal = document.getElementById('streetview-modal');
        if (svModal && !svModal.classList.contains('is-hidden') && global.StreetViewModule) {
          global.StreetViewModule.close();
          return;
        }
        const diagModal = document.getElementById('diagnostics-modal');
        if (diagModal && !diagModal.classList.contains('is-hidden') && global.DiagnosticsModule) {
          global.DiagnosticsModule.close();
          return;
        }
        if (global.CommandPalette && global.CommandPalette.isOpen()) {
          global.CommandPalette.close();
          return;
        }
        if ((popEl && !popEl.classList.contains('is-hidden')) ||
            (appEl && !appEl.classList.contains('is-hidden')) ||
            (langEl && !langEl.classList.contains('is-hidden')) ||
            (layersEl && !layersEl.classList.contains('is-hidden'))) {
          if (popEl) popEl.classList.add('is-hidden');
          if (appEl) appEl.classList.add('is-hidden');
          if (langEl) langEl.classList.add('is-hidden');
          if (layersEl) layersEl.classList.add('is-hidden');
          if (popBtn) popBtn.setAttribute('aria-expanded', 'false');
          if (appBtn) appBtn.setAttribute('aria-expanded', 'false');
          if (langBtn) langBtn.setAttribute('aria-expanded', 'false');
          if (layersBtn) layersBtn.setAttribute('aria-expanded', 'false');
          return;
        }
        if (isIntroFlight) {
          cancelActiveFlight();
          return;
        }
        if (state.mode !== 'map') {
          setViewMode('map');
          return;
        }
        if (state.selectedId) {
          closeDestination();
        }
      }
    });

    // Browser Back/Forward support (restores both view mode and destination focus)
    global.addEventListener('popstate', () => {
      suppressPopState = true;
      const params = new URLSearchParams(global.location.search);
      const nextMode = params.get('mode') || 'map';
      if (['map', 'gallery', 'planner', 'archive'].includes(nextMode) && nextMode !== state.mode) {
        setViewMode(nextMode, true, false);
      }
      const focusId = params.get('focus');
      if (focusId && ATLAS.getById(focusId)) {
        selectDestination(focusId, { skipUrl: true });
      } else if (state.selectedId) {
        closeDestination(true);
      }
      suppressPopState = false;
    });
  }

  function bindMapInteractions() {
    let moveGlassTimer = null;
    map.on('movestart', () => {
      if (moveGlassTimer) {
        clearTimeout(moveGlassTimer);
        moveGlassTimer = null;
      }
      document.body.classList.add('is-map-moving');
    });
    map.on('moveend', () => {
      if (moveGlassTimer) clearTimeout(moveGlassTimer);
      moveGlassTimer = setTimeout(() => {
        document.body.classList.remove('is-map-moving');
        moveGlassTimer = null;
      }, 140);
    });

    map.on('mousedown', () => { stopSpin(); cancelActiveFlight(); });
    map.on('wheel', () => { stopSpin(); cancelActiveFlight(); });
    map.on('touchstart', () => { stopSpin(); cancelActiveFlight(); });

    map.on('move', () => {
      scheduleLabelLayout();
      starfield.scheduleRender();
    });
    map.on('zoomend', () => {
      if (state.clustering && clusterIndex && !state.selectedId) {
        syncGeoJsonSource();
      }
      scheduleLabelLayout();
      starfield.scheduleRender();
      if (state.subSpotMarkers.length) applySpiderfyLayout();
    });
    map.on('resize', () => {
      resizeLabelCanvas();
      scheduleLabelLayout();
      starfield.resize();
    });

    const onFullscreenResize = () => {
      if (map) {
        map.resize();
        resizeLabelCanvas();
        scheduleLabelLayout();
        starfield.resize();
      }
    };
    document.addEventListener('fullscreenchange', onFullscreenResize);
    document.addEventListener('webkitfullscreenchange', onFullscreenResize);

    // WebGL Context Loss & Restore Handling
    const canvas = map.getCanvas();
    let webglFallbackTimer = null;
    if (canvas) {
      canvas.addEventListener('webglcontextlost', (e) => {
        e.preventDefault();
        const banner = document.getElementById('webgl-recovery-banner');
        const txt = document.getElementById('webgl-recovery-text');
        if (txt) {
          txt.textContent = I18n && I18n.getLang() === 'en'
            ? 'WebGL context lost — restoring 3D view (2D catalog remains available)…'
            : t('webglRecovery');
        }
        if (banner) banner.classList.remove('is-hidden');
        stopSpin();
        if (webglFallbackTimer) clearTimeout(webglFallbackTimer);
        webglFallbackTimer = setTimeout(() => {
          if (!isEmbedMode) setViewMode('gallery', true);
        }, 4200);
      });
      canvas.addEventListener('webglcontextrestored', () => {
        if (webglFallbackTimer) {
          clearTimeout(webglFallbackTimer);
          webglFallbackTimer = null;
        }
        const banner = document.getElementById('webgl-recovery-banner');
        if (banner) banner.classList.add('is-hidden');
        syncGeoJsonSource();
        scheduleLabelLayout();
        starfield.scheduleRender();
      });
    }

    // Hover & Click on WebGL Atlas Points
    map.on('mousemove', 'atlas-hit', (e) => {
      if (isCoarsePointer() || !e.features || !e.features.length) return;
      const f = e.features[0];
      const id = f.properties.id;
      const dest = ATLAS.getById(id);
      if (!dest) return;
      if (!dest.spots && typeof ATLAS.ensureDetail === 'function') {
        ATLAS.ensureDetail(id);
      }

      map.getCanvas().style.cursor = 'pointer';
      if (hoveredFeatureId !== null && hoveredFeatureId !== f.id) {
        map.setFeatureState({ source: 'atlas-points', id: hoveredFeatureId }, { hover: false });
      }
      hoveredFeatureId = f.id;
      map.setFeatureState({ source: 'atlas-points', id: hoveredFeatureId }, { hover: true });

      if (!hoverPopup) {
        hoverPopup = new maplibregl.Popup({ closeButton: false, closeOnClick: false, offset: 14 });
      }
      if (hoverCloseTimer) {
        clearTimeout(hoverCloseTimer);
        hoverCloseTimer = null;
      }
      const badge = dest.allWeather ? t('badgeAllWeather') : t('badgeSeasonal');
      const locLabel = (dest.country && dest.country !== '中国') ? `${tx(dest.country)} · ${tx(dest.province)}` : tx(dest.province);
      const isLight = Theme && Theme.getState().mode === 'light';
      const titleCol = isLight ? '#18181B' : '#F5F5F7';
      const subCol = isLight ? '#52525B' : '#A1A1AA';
      const accentCol = (Theme && Theme.getState().accentHex) || '#E2C07D';
      const safeId = String(dest.id).replace(/&/g, '&amp;').replace(/"/g, '&quot;');
      hoverPopup
        .setLngLat(dest.coords)
        .setHTML(`
          <div class="hover-popup-card" data-dest-id="${safeId}" style="cursor:pointer;">
            <div style="font-weight:500;font-size:13px;margin-bottom:2px;color:${titleCol};">${tx(dest.name)}</div>
            <div style="color:${subCol};font-size:11px;margin-bottom:4px;">${locLabel} · ${badge}</div>
            <div style="color:${subCol};font-size:11.5px;line-height:1.45;">${tx(dest.subtitle)}</div>
            <div style="color:${accentCol};font-size:11px;margin-top:5px;">${t('hoverAction', { n: dest.spotCount || (dest.spots ? dest.spots.length : 0) })}</div>
          </div>
        `)
        .addTo(map);
      const popupEl = typeof hoverPopup.getElement === 'function' ? hoverPopup.getElement() : null;
      if (popupEl && !popupEl.dataset.boundClick) {
        popupEl.dataset.boundClick = '1';
        popupEl.addEventListener('mouseenter', () => {
          if (hoverCloseTimer) {
            clearTimeout(hoverCloseTimer);
            hoverCloseTimer = null;
          }
        });
        popupEl.addEventListener('mouseleave', () => {
          hoverCloseTimer = setTimeout(() => {
            if (hoverPopup) hoverPopup.remove();
          }, 160);
        });
        popupEl.addEventListener('click', (ev) => {
          const card = popupEl.querySelector('.hover-popup-card');
          const destId = card && card.dataset.destId;
          if (!destId) return;
          ev.stopPropagation();
          if (hoverPopup) hoverPopup.remove();
          selectDestination(destId);
        });
      }
    });

    map.on('mouseleave', 'atlas-hit', () => {
      if (map.getCanvas()) map.getCanvas().style.cursor = '';
      if (hoveredFeatureId !== null) {
        map.setFeatureState({ source: 'atlas-points', id: hoveredFeatureId }, { hover: false });
        hoveredFeatureId = null;
      }
      if (hoverCloseTimer) clearTimeout(hoverCloseTimer);
      hoverCloseTimer = setTimeout(() => {
        if (hoverPopup) hoverPopup.remove();
      }, 180);
    });

    map.on('click', (e) => {
      if (state.clustering && clusterIndex && map.getLayer('atlas-cluster-circle')) {
        const cHits = map.queryRenderedFeatures(e.point, { layers: ['atlas-cluster-circle'] });
        if (cHits && cHits.length && cHits[0].properties.cluster_id !== undefined) {
          const cid = Number(cHits[0].properties.cluster_id);
          const targetZoom = Math.min(7, clusterIndex.getClusterExpansionZoom(cid) + 0.4);
          cinematicFlyTo({ center: cHits[0].geometry.coordinates, zoom: targetZoom, pitch: 24, duration: 850 });
          return;
        }
      }
      const hits = map.queryRenderedFeatures(e.point, { layers: ['atlas-hit'] });
      if (hits && hits.length) {
        const id = hits[0].properties.id;
        if (hoverPopup) hoverPopup.remove();
        if (id) selectDestination(id);
        return;
      }
      const labelHitId = findLabelAtPoint(e.point.x, e.point.y);
      if (labelHitId) {
        if (hoverPopup) hoverPopup.remove();
        selectDestination(labelHitId);
      }
    });
  }

  function syncMapThemeAndAccent(themeInfo) {
    const info = themeInfo || (Theme ? Theme.getState() : { mode: 'dark', accentHex: '#E2C07D' });
    const isLight = info.mode === 'light';
    const isLightMapSkin = isLight && (state.skin === 'natgeo' || state.skin === 'physical');
    document.body.classList.toggle('light-map-skin', isLightMapSkin);
    starfield.scheduleRender();

    if (!map || !map.isStyleLoaded()) return;

    map.setSky({
      'sky-color': 'rgba(4, 7, 15, 0)',
      'horizon-color': '#356FB8',
      'fog-color': '#0C1A33',
      'sky-horizon-blend': 0.48,
      'horizon-fog-blend': 0.60,
      'atmosphere-blend': ['interpolate', ['linear'], ['zoom'], 0, 0.78, 4.5, 0.55, 7, 0]
    });

    if (map.getLayer('globe-ocean-base')) {
      map.setPaintProperty('globe-ocean-base', 'background-color', '#0A121D');
    }
    if (map.getLayer('atlas-glow')) {
      map.setPaintProperty('atlas-glow', 'circle-color', [
        'case',
        ['==', ['get', 'allWeather'], 1], info.accentHex,
        isLightMapSkin ? '#2563EB' : '#8AB4F8'
      ]);
    }
    if (map.getLayer('atlas-core')) {
      map.setPaintProperty('atlas-core', 'circle-color', [
        'case',
        ['==', ['get', 'selected'], 1], '#FFFFFF',
        ['==', ['get', 'allWeather'], 1], info.accentHex,
        isLightMapSkin ? '#2563EB' : '#8AB4F8'
      ]);
      map.setPaintProperty('atlas-core', 'circle-stroke-color', [
        'case',
        ['==', ['get', 'selected'], 1], info.accentHex,
        isLightMapSkin ? '#FFFFFF' : '#09090B'
      ]);
    }
    if (map.getLayer('subroute-line')) {
      map.setPaintProperty('subroute-line', 'line-color', info.accentHex);
    }
  }

  function renderLanguageGrid() {
    const grid = document.getElementById('lang-grid');
    if (!grid || !I18n) return;
    const cur = I18n.getLang();
    grid.innerHTML = I18n.LANGUAGES.map((l) => {
      const active = l.id === cur ? 'active' : '';
      return `
        <button class="lang-item ${active}" data-lang="${l.id}" type="button" role="option" aria-selected="${l.id === cur ? 'true' : 'false'}">
          <div>
            <div class="lang-item-native">${l.name}</div>
            <div class="lang-item-sub">${l.sub}</div>
          </div>
          <span class="lang-item-code">${l.code}</span>
        </button>
      `;
    }).join('');

    grid.querySelectorAll('.lang-item').forEach((btn) => {
      btn.addEventListener('click', () => {
        switchLanguage(btn.dataset.lang);
      });
    });
  }

  function invalidateSearchHaystack() {
    for (let i = 0; i < atlasIndex.length; i++) {
      atlasIndex[i].haystack = null;
    }
  }

  function switchLanguage(langId) {
    if (!I18n) return;
    I18n.setLang(langId);
    invalidateSearchHaystack();
    renderLanguageGrid();
    refreshAllTexts();
    if (global.StoryPrologue && typeof global.StoryPrologue.refreshLocale === 'function') {
      global.StoryPrologue.refreshLocale(langId);
    }
    const langEl = document.getElementById('lang-popover');
    const langBtn = document.getElementById('lang-btn');
    if (langEl) langEl.classList.add('is-hidden');
    if (langBtn) langBtn.setAttribute('aria-expanded', 'false');

    if (langId !== 'zh-CN' && langId !== 'zh-TW' && typeof I18n.ensureLangIndex === 'function') {
      const curDest = state.selectedId ? ATLAS.getById(state.selectedId) : null;
      Promise.all([
        I18n.ensureLangIndex(langId),
        curDest && typeof I18n.ensureRegionLang === 'function'
          ? I18n.ensureRegionLang(langId, curDest)
          : Promise.resolve()
      ]).then(() => {
        if (I18n.getLang() !== langId) return;
        invalidateSearchHaystack();
        refreshAllTexts();
      });
    }
  }
  global.switchAppLanguage = switchLanguage;

  function refreshAllTexts() {
    labelWidthCache.clear();
    const all = ATLAS.getAll();
    const totalSpots = all.reduce(
      (sum, d) => sum + (d.spotCount != null ? d.spotCount : (d.spots ? d.spots.length : 0)),
      0
    );
    const statsEl = document.getElementById('atlas-stats-line');
    if (statsEl) {
      statsEl.textContent = t('statsFmt', {
        cities: all.length,
        spots: totalSpots.toLocaleString('en-US')
      });
    }
    const summaryEl = document.getElementById('popover-match-summary');
    if (summaryEl) {
      summaryEl.textContent = t('matchFmt', { count: lastMatchedIds.size || all.length });
    }
    renderContinentTabs();
    renderPhenologyBar();
    renderSidebar();
    renderActiveChips();
    scheduleLabelLayout();
    if (state.selectedId) {
      const dest = ATLAS.getById(state.selectedId);
      if (dest) {
        Panel.open(dest, state.month);
        const toastText = document.getElementById('subspot-toast-text');
        if (toastText) {
          toastText.textContent = t('subspotToast', {
            name: tx(dest.shortName || dest.name),
            n: dest.spotCount != null ? dest.spotCount : (dest.spots ? dest.spots.length : 0)
          });
        }
      }
    }
    if (state.mode === 'gallery' && global.AestheticGallery) {
      global.AestheticGallery.render();
    }
    if (state.mode === 'planner' && global.TripPlanner) {
      global.TripPlanner.renderWorkspace();
    }
    if (state.mode === 'archive' && global.TravelArchive) {
      global.TravelArchive.renderWorkspace();
    }
    if (global.AmbientRadio && typeof global.AmbientRadio.refreshLocale === 'function') {
      global.AmbientRadio.refreshLocale();
    }
  }

  function enterWebglFallbackMode(err) {
    webglFailed = true;
    const loader = document.getElementById('globe-loader');
    if (loader) loader.classList.add('is-hidden');
    const banner = document.getElementById('webgl-recovery-banner');
    const txt = document.getElementById('webgl-recovery-text');
    if (txt) {
      const lang = I18n ? I18n.getLang() : 'zh-CN';
      txt.textContent = lang === 'en'
        ? 'WebGL unavailable on this device — switched to 2D Atlas Catalog (all 722 destinations remain browsable).'
        : '当前设备暂不支持 WebGL 3D 渲染，已自动切换为 2D 图鉴与清单浏览全部 722 座目的地。';
    }
    if (banner) banner.classList.remove('is-hidden');
    if (!isEmbedMode) {
      setViewMode('gallery', true);
      setSidebarOpen(true);
    }
  }

  function init() {
    if (appInitialized) return;
    appInitialized = true;
    hydrateIcons();
    if (I18n) {
      I18n.hydrateStaticDom();
      const bootLang = I18n.getLang();
      if (bootLang !== 'zh-CN' && bootLang !== 'zh-TW' && typeof I18n.ensureLangIndex === 'function') {
        I18n.ensureLangIndex(bootLang).then(() => {
          if (I18n.getLang() !== bootLang) return;
          invalidateSearchHaystack();
          refreshAllTexts();
        });
      }
    }
    if (Theme) {
      Theme.init((themeInfo) => {
        syncMapThemeAndAccent(themeInfo);
      });
    }
    renderLanguageGrid();
    starfield.renderPresetGrid();
    syncSeasonAndSkyboxAttrs();
    loadFavorites();
    buildAtlasIndex();

    const all = ATLAS.getAll();
    const totalSpots = all.reduce(
      (sum, d) => sum + (d.spotCount != null ? d.spotCount : (d.spots ? d.spots.length : 0)),
      0
    );
    document.getElementById('atlas-stats-line').textContent = t('statsFmt', {
      cities: all.length,
      spots: totalSpots.toLocaleString('en-US')
    });

    const initialParams = readInitialUrlState();
    isEmbedMode = Boolean(initialParams.embed);
    const focusDest = initialParams.focusId ? ATLAS.getById(initialParams.focusId) : null;

    renderContinentTabs();
    syncFilterControlUI();
    recomputeMatchedSet();
    renderPhenologyBar();
    renderSidebar();
    renderActiveChips();

    // Default sidebar collapsed across desktop & mobile so globe stays centered
    setSidebarOpen(false);

    // Initialize Command Palette & Gallery
    if (global.CommandPalette) {
      global.CommandPalette.init({
        searchIndex: atlasIndex,
        onSelect: (id, spotIdx) => selectDestination(id, { spotIdx }),
        onRelax: resetAllFilters
      });
    }
    if (global.AestheticGallery) {
      global.AestheticGallery.init({
        getFiltered: getFilteredDestinations,
        getFavorites: () => state.favorites,
        onSelect: (id) => selectDestination(id),
        onBackToMap: () => setViewMode('map')
      });
    }
    if (global.AmbientRadio) {
      global.AmbientRadio.init();
    }

    // Determine initial camera pose (if deep-linked without ?instant=1, show global context first for cinematic intro!)
    let initCenter = [72.0, 22.0];
    let initZoom = 1.65;
    let initPitch = 14;
    if (focusDest) {
      if (initialParams.instant || prefersReducedMotion()) {
        initCenter = focusDest.coords;
        initZoom = focusDest.zoom || 9.0;
        initPitch = 42;
      } else {
        const startLng = focusDest.coords[0] - 42 < -180 ? focusDest.coords[0] + 318 : focusDest.coords[0] - 42;
        const startLat = Math.max(-35, Math.min(35, focusDest.coords[1] * 0.4));
        initCenter = [startLng, startLat];
        initZoom = 1.45;
        initPitch = 10;
      }
    } else if (state.continent !== 'global') {
      const cInfo = ATLAS.getContinent(state.continent);
      if (cInfo) {
        initCenter = cInfo.center;
        initZoom = cInfo.zoom;
        initPitch = cInfo.pitch || 16;
      }
    }

    const initialSavedTileMode = loadSavedTileMode();
    if (initialSavedTileMode === 'cn' || initialSavedTileMode === 'global') {
      activeTileRoute = initialSavedTileMode;
    }

    try {
      map = new maplibregl.Map({
        container: 'map',
        style: buildStyle(),
        center: initCenter,
        zoom: initZoom,
        pitch: initPitch,
        minZoom: 1.1,
        maxZoom: SKIN_META[state.skin].maxZoom,
        pixelRatio: Math.min(global.devicePixelRatio || 1, 1.5),
        fadeDuration: 120,
        refreshExpiredTiles: false,
        maxTileCacheSize: 256,
        attributionControl: false
      });
    } catch (e) {
      bindEvents();
      enterWebglFallbackMode(e);
      return;
    }

    if (map.scrollZoom) {
      map.scrollZoom.setWheelZoomRate(1 / 320);
      map.scrollZoom.setZoomRate(1 / 110);
    }

    ensureLabelOverlay();
    starfield.resize();
    let resizeDebounceTimer = null;
    const handleViewportChange = () => {
      if (resizeDebounceTimer) clearTimeout(resizeDebounceTimer);
      resizeDebounceTimer = setTimeout(() => {
        resizeDebounceTimer = null;
        if (map && typeof map.resize === 'function') map.resize();
        starfield.resize();
        resizeLabelCanvas();
        scheduleLabelLayout();
      }, 90);
    };
    global.addEventListener('resize', handleViewportChange);
    global.addEventListener('orientationchange', handleViewportChange);
    global.addEventListener('wtg:perfchange', () => {
      resizeLabelCanvas();
      scheduleLabelLayout();
      starfield.resize();
    });
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) {
        wasSpinningBeforeHide = state.isSpinning;
        if (state.isSpinning) stopSpin();
        if (global.SolarTerminator && typeof global.SolarTerminator.setPaused === 'function') {
          global.SolarTerminator.setPaused(true);
        }
      } else {
        if (wasSpinningBeforeHide && state.mode === 'map' && !webglFailed) {
          startSpin();
        }
        wasSpinningBeforeHide = false;
        if (global.SolarTerminator && typeof global.SolarTerminator.setPaused === 'function') {
          global.SolarTerminator.setPaused(false);
        }
        starfield.scheduleRender();
        scheduleLabelLayout();
      }
    });
    bindMapInteractions();
    bindEvents();

    const hideLoader = () => {
      const loader = document.getElementById('globe-loader');
      if (loader) loader.classList.add('is-hidden');
    };
    const loaderFallback = setTimeout(hideLoader, 1500);

    let styleReady = false;
    const onStyleReady = () => {
      if (styleReady) return;
      styleReady = true;
      clearTimeout(loaderFallback);
      hideLoader();

      syncGeoJsonSource();
      syncMapThemeAndAccent();
      if (global.SolarTerminator) global.SolarTerminator.reapplyAfterStyleLoad(map);
      if (state.skin !== 'satellite') switchSkin(state.skin, true);
      if (state.mode === 'gallery') setViewMode('gallery', true);
      scheduleLabelLayout();
      initAutoTileRoute();
      if (global.PhenologyEngine) global.PhenologyEngine.loadEnrichment();
      if (global.OnboardingTour && !initialParams.embed) global.OnboardingTour.init();

      if (initialParams.autoTerrain && global.Terrain3DModule) {
        global.Terrain3DModule.toggleTerrain(map, true);
      }
      if (initialParams.autoDayNight && global.SolarTerminator) {
        global.SolarTerminator.toggle(map, true);
      }
      if (initialParams.autoSpin) {
        startSpin();
      }

      if (initialParams.embed) {
        document.body.classList.add('embed-mode');
        const bar = document.getElementById('embed-chrome-bar');
        const base = (global.location.origin && global.location.origin !== 'null')
          ? `${global.location.origin}${global.location.pathname}`
          : 'https://world-travel-globe.globe-app.workers.dev/';
        const openUrl = focusDest ? `${base}?focus=${encodeURIComponent(focusDest.id)}` : base;
        if (bar) {
          bar.classList.remove('is-hidden');
          const titleTxt = focusDest
            ? `${tx(focusDest.name)} · ${tx(focusDest.country || '')}`
            : 'World Travel Globe · 722 Destinations';
          const openLabel = I18n && I18n.getLang() !== 'en' ? '打开完整 3D 地球仪 ↗' : 'Open Full Globe ↗';
          bar.innerHTML = `
            <span class="embed-bar-title">${String(titleTxt).replace(/&/g, '&amp;').replace(/</g, '&lt;')}</span>
            <a class="embed-bar-link" href="${openUrl}" target="_blank" rel="noopener noreferrer">${openLabel}</a>
          `;
        }
        if (focusDest) {
          state.selectedId = focusDest.id;
          updateActiveBeacon(focusDest);
          syncGeoJsonSource();
        }
        return;
      }

      if (focusDest) {
        if (initialParams.instant || prefersReducedMotion()) {
          selectDestination(focusDest.id, { instant: true, skipUrl: true });
        } else {
          // Open detail card immediately, then perform smooth 1.3s cinematic intro swoop from global orbit
          isIntroFlight = true;
          const skipBtn = document.getElementById('skip-intro-btn');
          if (skipBtn) skipBtn.classList.remove('is-hidden');

          state.selectedId = focusDest.id;
          setSidebarOpen(false);
          updateActiveBeacon(focusDest);
          Panel.open(focusDest, state.month);
          const fLang = I18n ? I18n.getLang() : 'zh-CN';
          const needFocusDetail = !focusDest.spots && typeof ATLAS.ensureDetail === 'function';
          const needFocusLang = I18n && typeof I18n.ensureRegionLang === 'function' && fLang !== 'zh-CN' && fLang !== 'zh-TW';
          if (focusDest.spots) {
            renderSubSpots(focusDest);
          } else {
            clearSubSpots();
          }
          if (needFocusDetail || needFocusLang) {
            Promise.all([
              needFocusDetail ? ATLAS.ensureDetail(focusDest.id) : Promise.resolve(focusDest),
              needFocusLang ? I18n.ensureRegionLang(fLang, focusDest) : Promise.resolve()
            ]).then(([hydrated]) => {
              const latest = hydrated || ATLAS.getById(focusDest.id) || focusDest;
              const entry = indexById.get(focusDest.id);
              if (entry && latest) entry.dest = latest;
              if (state.selectedId !== focusDest.id) return;
              if (latest && latest.spots) renderSubSpots(latest);
              if (latest) Panel.open(latest, state.month);
            });
          }
          syncGeoJsonSource();
          updateSelectionUI();

          introTimer = setTimeout(() => {
            if (!isIntroFlight) return;
            cinematicFlyTo({
              center: focusDest.coords,
              zoom: focusDest.zoom || 9.0,
              pitch: 42,
              bearing: 0,
              duration: 1350
            });
            map.once('moveend', () => {
              isIntroFlight = false;
              if (skipBtn) skipBtn.classList.add('is-hidden');
            });
          }, 220);
        }
      }
    };

    map.on('style.load', onStyleReady);
    map.on('load', onStyleReady);

    global.getGlobeMap = function () { return map; };

    if (global.StorageDB) {
      global.StorageDB.init().then(() => {
        if (global.TripPlanner) {
          global.TripPlanner.restoreFromUrlIfPresent().then((restored) => {
            if (restored) setViewMode('planner', true);
          });
        }
        if (global.TravelArchive && global.TravelArchive.restoreFootprintFromUrl()) {
          global.TravelArchive.applyFootprintLayer(map, true);
        }
      }).catch(() => {});
    }
    if (global.DiagnosticsModule) {
      global.DiagnosticsModule.applyPerformanceTier('auto');
      if (typeof global.DiagnosticsModule.startWatchdog === 'function') {
        global.DiagnosticsModule.startWatchdog();
      }
    }
    // Offline Travel Pack helper (IndexedDB cache with explicit timestamp, zero bulk tile scraping)
    global.saveOfflineTravelPack = async function (destId) {
      if (!global.StorageDB || !global.TRAVEL_ATLAS) return { ok: false };
      const dest = (await global.TRAVEL_ATLAS.ensureDetail(destId)) || global.TRAVEL_ATLAS.getAll().find((d) => d.id === destId);
      if (!dest) return { ok: false };
      let hub = null;
      try {
        const res = await fetch('data/transport/hubs.json');
        if (res.ok) {
          const j = await res.json();
          hub = j && j.byId ? j.byId[destId] : null;
        }
      } catch (e) { /* ignore offline hub fetch */ }
      const enr = global.PhenologyEngine && typeof global.PhenologyEngine.getEnrichmentMap === 'function'
        ? (global.PhenologyEngine.getEnrichmentMap() || {})[destId] || null
        : null;
      const pack = {
        destId,
        cachedAt: new Date().toISOString(),
        dest,
        hub,
        enrichment: enr,
        note: 'Offline pack stores itinerary, destination metadata, spots & gateways (does not bulk-scrape map tiles).'
      };
      await global.StorageDB.setCache(`offline_pack:${destId}`, pack, 30 * 24 * 3600 * 1000);
      return { ok: true, cachedAt: pack.cachedAt, destId };
    };

    // PWA install prompt & SW update listener
    let deferredInstallPrompt = null;
    window.addEventListener('beforeinstallprompt', (e) => {
      e.preventDefault();
      deferredInstallPrompt = e;
      const topbar = document.getElementById('topbar');
      if (topbar && !document.getElementById('pwa-install-btn')) {
        const instBtn = document.createElement('button');
        instBtn.id = 'pwa-install-btn';
        instBtn.type = 'button';
        instBtn.className = 'capsule-icon-btn';
        instBtn.title = 'Install KAIROS App';
        instBtn.setAttribute('aria-label', 'Install KAIROS App');
        instBtn.textContent = '⊕';
        instBtn.addEventListener('click', async () => {
          if (!deferredInstallPrompt) return;
          deferredInstallPrompt.prompt();
          await deferredInstallPrompt.userChoice.catch(() => {});
          deferredInstallPrompt = null;
          instBtn.remove();
        });
        topbar.appendChild(instBtn);
      }
    });

    if (global.navigator && 'serviceWorker' in global.navigator && global.location && (global.location.protocol === 'https:' || global.location.hostname === '127.0.0.1' || global.location.hostname === 'localhost')) {
      global.navigator.serviceWorker.register('sw.js').then((reg) => {
        if (!reg) return;
        reg.addEventListener('updatefound', () => {
          const nw = reg.installing;
          if (!nw) return;
          nw.addEventListener('statechange', () => {
            if (nw.state === 'installed' && global.navigator.serviceWorker.controller) {
              const toast = document.getElementById('subspot-toast');
              const txt = document.getElementById('subspot-toast-text');
              if (toast && txt) {
                txt.textContent = 'KAIROS V5.0 updated — reload anytime for latest build';
                toast.classList.remove('is-hidden');
              }
            }
          });
        });
      }).catch(() => {});
    }
  }

  document.addEventListener('DOMContentLoaded', init);
})(window);
