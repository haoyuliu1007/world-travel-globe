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

  function prefersReducedMotion() {
    return Boolean(global.matchMedia && global.matchMedia('(prefers-reduced-motion: reduce)').matches);
  }

  // WebGL 3D Spherical Skybox + Multi-Scale Starfield (zero idle CPU, 2D Canvas fallback)
  const SKYBOX_KEY = 'wtg_skybox_v1';
  const SKYBOX_PRESETS = [
    { id: 'milkyway', labelKey: 'skyMilkyway', url: 'assets/skyboxes/milkyway.jpg', exposure: 1.05, starBoost: 1.0, tiltDeg: 26 },
    { id: 'nebula', labelKey: 'skyNebula', url: 'assets/skyboxes/nebula.jpg', exposure: 0.96, starBoost: 1.05, tiltDeg: 18 },
    { id: 'aurora', labelKey: 'skyAurora', url: 'assets/skyboxes/aurora.jpg', exposure: 0.94, starBoost: 1.0, tiltDeg: 14 },
    { id: 'starfield', labelKey: 'skyStarfield', url: null, exposure: 1.0, starBoost: 1.45, tiltDeg: 24 }
  ];

  const starfield = (() => {
    const STAR_COUNT = 1900;
    const DEG2RAD = Math.PI / 180;
    const FADE_MS = 550;

    let canvas = null;
    let gl = null;
    let ctx2d = null;
    let useWebGL = false;
    let width = 0;
    let height = 0;
    let dpr = 1;
    let rafId = 0;
    let isBlank = true;

    let skyProg = null;
    let starProg = null;
    let quadBuf = null;
    let starBuf = null;
    let starsData = null;

    const texCache = new Map();
    const loadingUrls = new Set();

    let slotA = null;
    let slotB = null;
    let fadeStart = 0;
    let isFading = false;

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
    slotA = getPresetMeta(currentPresetId);
    slotB = slotA;

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
      const list = new Array(STAR_COUNT);
      const spectral = [
        [0.74, 0.85, 1.00], // B/A cool sapphire-white
        [0.92, 0.95, 1.00], // A/F pure pearl
        [1.00, 0.96, 0.88], // F/G pale champagne
        [1.00, 0.86, 0.70]  // G/K warm amber-white
      ];

      for (let i = 0; i < STAR_COUNT; i++) {
        // 35% gently biased near galactic equator, 65% full-sphere
        let u;
        if (rand() < 0.35) {
          u = (rand() + rand() - 1) * 0.35;
        } else {
          u = rand() * 2 - 1;
        }
        const theta = rand() * Math.PI * 2;
        const s = Math.sqrt(Math.max(0, 1 - u * u));
        const tier = rand();
        let size;
        let alpha;
        if (tier < 0.72) {
          size = 1.1 + rand() * 0.6;
          alpha = 0.24 + rand() * 0.22;
        } else if (tier < 0.94) {
          size = 1.7 + rand() * 0.8;
          alpha = 0.48 + rand() * 0.26;
        } else {
          size = 2.6 + rand() * 1.4;
          alpha = 0.76 + rand() * 0.20;
        }

        const spPick = rand();
        const col = spPick < 0.28
          ? spectral[0]
          : (spPick < 0.68 ? spectral[1] : (spPick < 0.88 ? spectral[2] : spectral[3]));

        list[i] = {
          x: s * Math.cos(theta),
          y: u,
          z: s * Math.sin(theta),
          size,
          alpha,
          r: col[0],
          g: col[1],
          b: col[2]
        };
      }
      return list;
    }

    function compileShader(type, src) {
      const sh = gl.createShader(type);
      gl.shaderSource(sh, src);
      gl.compileShader(sh);
      if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
        gl.deleteShader(sh);
        return null;
      }
      return sh;
    }

    function linkProgram(vsSrc, fsSrc) {
      const vs = compileShader(gl.VERTEX_SHADER, vsSrc);
      const fs = compileShader(gl.FRAGMENT_SHADER, fsSrc);
      if (!vs || !fs) return null;
      const prog = gl.createProgram();
      gl.attachShader(prog, vs);
      gl.attachShader(prog, fs);
      gl.linkProgram(prog);
      gl.deleteShader(vs);
      gl.deleteShader(fs);
      if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
        gl.deleteProgram(prog);
        return null;
      }
      return prog;
    }

    function initWebGL() {
      try {
        gl = canvas.getContext('webgl', {
          alpha: false,
          antialias: false,
          depth: false,
          stencil: false,
          powerPreference: 'low-power'
        });
      } catch (e) {
        gl = null;
      }
      if (!gl) return false;

      const skyVS = `
        attribute vec2 aPos;
        varying vec2 vNdc;
        void main() {
          vNdc = aPos;
          gl_Position = vec4(aPos, 0.0, 1.0);
        }
      `;
      const skyFS = `
        precision highp float;
        varying vec2 vNdc;
        uniform vec2 uResolution;
        uniform vec3 uRight;
        uniform vec3 uUp;
        uniform vec3 uForward;
        uniform float uFocal;
        uniform sampler2D uTexA;
        uniform sampler2D uTexB;
        uniform float uHasA;
        uniform float uHasB;
        uniform float uMix;
        uniform float uExpA;
        uniform float uExpB;
        uniform float uTiltSinA;
        uniform float uTiltCosA;
        uniform float uTiltSinB;
        uniform float uTiltCosB;
        uniform float uZoomFade;

        vec3 tiltDir(vec3 d, float s, float c) {
          return vec3(d.x, d.y * c - d.z * s, d.y * s + d.z * c);
        }

        vec2 dirToEquirect(vec3 d) {
          float u = fract(atan(d.z, d.x) / 6.28318530718 + 0.5);
          float v = acos(clamp(d.y, -1.0, 1.0)) / 3.14159265359;
          return vec2(u, v);
        }

        vec3 voidFallback(vec3 d) {
          float band = exp(-abs(d.y) * 5.0);
          return mix(vec3(0.012, 0.018, 0.036), vec3(0.028, 0.052, 0.102), band);
        }

        vec3 sampleSlot(vec3 ray, sampler2D tex, float hasTex, float expVal, float ts, float tc) {
          vec3 d = normalize(tiltDir(ray, ts, tc));
          if (hasTex > 0.5) {
            return texture2D(tex, dirToEquirect(d)).rgb * expVal;
          }
          return voidFallback(d);
        }

        void main() {
          vec2 halfRes = uResolution * 0.5;
          vec3 ray = normalize(uForward * uFocal + uRight * (vNdc.x * halfRes.x) + uUp * (vNdc.y * halfRes.y));
          vec3 colA = sampleSlot(ray, uTexA, uHasA, uExpA, uTiltSinA, uTiltCosA);
          vec3 colB = sampleSlot(ray, uTexB, uHasB, uExpB, uTiltSinB, uTiltCosB);
          vec3 col = mix(colA, colB, uMix);

          float r2 = dot(vNdc, vNdc);
          col += vec3(0.016, 0.038, 0.082) * exp(-r2 * 2.2);
          float vig = smoothstep(1.55, 0.45, sqrt(r2));
          col *= mix(0.76, 1.0, vig) * uZoomFade;
          gl_FragColor = vec4(col, 1.0);
        }
      `;

      const starVS = `
        attribute vec3 aDir;
        attribute float aSize;
        attribute float aAlpha;
        attribute vec3 aColor;
        uniform vec2 uResolution;
        uniform vec3 uRight;
        uniform vec3 uUp;
        uniform vec3 uForward;
        uniform float uFocal;
        uniform float uDpr;
        uniform float uTiltSin;
        uniform float uTiltCos;
        uniform float uStarBoost;
        uniform float uZoomFade;
        varying float vAlpha;
        varying vec3 vColor;

        void main() {
          // Inverse tilt of the celestial sphere so stars match tilted panorama
          vec3 d = vec3(aDir.x, aDir.y * uTiltCos + aDir.z * uTiltSin, -aDir.y * uTiltSin + aDir.z * uTiltCos);
          float zCam = dot(d, uForward);
          if (zCam <= 0.12) {
            gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
            gl_PointSize = 0.0;
            vAlpha = 0.0;
            vColor = aColor;
            return;
          }
          float xCam = dot(d, uRight);
          float yCam = dot(d, uUp);
          vec2 halfRes = uResolution * 0.5;
          float ndcX = (xCam / zCam) * (uFocal / max(1.0, halfRes.x));
          float ndcY = (yCam / zCam) * (uFocal / max(1.0, halfRes.y));
          gl_Position = vec4(ndcX, ndcY, 0.0, 1.0);
          gl_PointSize = clamp(aSize * uDpr, 1.0, 10.0);
          vAlpha = min(1.0, aAlpha * uStarBoost * uZoomFade);
          vColor = aColor;
        }
      `;
      const starFS = `
        precision mediump float;
        varying float vAlpha;
        varying vec3 vColor;
        void main() {
          vec2 p = gl_PointCoord * 2.0 - 1.0;
          float d2 = dot(p, p);
          if (d2 > 1.0) discard;
          float core = exp(-d2 * 4.2);
          float halo = exp(-d2 * 1.4) * 0.28;
          float a = clamp(core + halo, 0.0, 1.0) * vAlpha;
          gl_FragColor = vec4(vColor, a);
        }
      `;

      skyProg = linkProgram(skyVS, skyFS);
      starProg = linkProgram(starVS, starFS);
      if (!skyProg || !starProg) return false;

      quadBuf = gl.createBuffer();
      gl.bindBuffer(gl.ARRAY_BUFFER, quadBuf);
      gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);

      const packed = new Float32Array(STAR_COUNT * 8);
      for (let i = 0; i < starsData.length; i++) {
        const st = starsData[i];
        const o = i * 8;
        packed[o] = st.x;
        packed[o + 1] = st.y;
        packed[o + 2] = st.z;
        packed[o + 3] = st.size;
        packed[o + 4] = st.alpha;
        packed[o + 5] = st.r;
        packed[o + 6] = st.g;
        packed[o + 7] = st.b;
      }
      starBuf = gl.createBuffer();
      gl.bindBuffer(gl.ARRAY_BUFFER, starBuf);
      gl.bufferData(gl.ARRAY_BUFFER, packed, gl.STATIC_DRAW);

      useWebGL = true;
      return true;
    }

    function requestTexture(meta) {
      if (!useWebGL || !gl || !meta || !meta.url) return;
      if (texCache.has(meta.url) || loadingUrls.has(meta.url)) return;
      loadingUrls.add(meta.url);

      const img = new Image();
      img.decoding = 'async';
      img.onload = () => {
        loadingUrls.delete(meta.url);
        if (!gl) return;
        const tex = gl.createTexture();
        gl.bindTexture(gl.TEXTURE_2D, tex);
        gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.REPEAT);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGB, gl.RGB, gl.UNSIGNED_BYTE, img);
        texCache.set(meta.url, tex);

        if (slotB && slotB.url === meta.url && !prefersReducedMotion()) {
          fadeStart = performance.now();
          isFading = true;
        }
        scheduleRender();
      };
      img.onerror = () => {
        loadingUrls.delete(meta.url);
      };
      img.src = meta.url;
    }

    function ensureCanvas() {
      if (!canvas) {
        canvas = document.getElementById('starfield-canvas');
        if (!canvas) return false;
        starsData = buildStarCatalog();
        if (!initWebGL()) {
          ctx2d = canvas.getContext('2d');
        }
        if (slotB && slotB.url) requestTexture(slotB);
      }
      return Boolean(useWebGL ? gl : ctx2d);
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
      if (useWebGL && gl) {
        gl.viewport(0, 0, targetW, targetH);
      } else if (ctx2d) {
        ctx2d.setTransform(dpr, 0, 0, dpr, 0, 0);
      }
      scheduleRender();
    }

    function computeCameraBasis() {
      const fixed = prefersReducedMotion() || !map || typeof map.getCenter !== 'function';
      const center = fixed ? { lng: 108, lat: 24 } : map.getCenter();
      const bearing = fixed ? 0 : map.getBearing();
      const pitch = fixed ? 0 : map.getPitch();

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

    function render2DFallback(cam, zoomFade) {
      ctx2d.clearRect(0, 0, width, height);
      const g = ctx2d.createRadialGradient(width * 0.5, height * 0.5, 0, width * 0.5, height * 0.5, Math.max(width, height) * 0.72);
      g.addColorStop(0, '#0d192e');
      g.addColorStop(0.55, '#070d1b');
      g.addColorStop(1, '#03050b');
      ctx2d.fillStyle = g;
      ctx2d.fillRect(0, 0, width, height);

      const cx = width * 0.5;
      const cy = height * 0.5;
      const focal = Math.max(width, height) * 0.92;
      const boost = (slotB ? slotB.starBoost : 1.0) * 1.15;

      for (let i = 0; i < starsData.length; i++) {
        const st = starsData[i];
        const zCam = st.x * cam.forward[0] + st.y * cam.forward[1] + st.z * cam.forward[2];
        if (zCam <= 0.14) continue;
        const xCam = st.x * cam.right[0] + st.y * cam.right[1] + st.z * cam.right[2];
        const yCam = st.x * cam.up[0] + st.y * cam.up[1] + st.z * cam.up[2];
        const sx = cx + (xCam / zCam) * focal;
        const sy = cy - (yCam / zCam) * focal;
        if (sx < -4 || sx > width + 4 || sy < -4 || sy > height + 4) continue;

        const a = Math.min(0.95, st.alpha * boost * zoomFade);
        ctx2d.fillStyle = `rgba(${Math.round(st.r * 255)},${Math.round(st.g * 255)},${Math.round(st.b * 255)},${a.toFixed(3)})`;
        ctx2d.beginPath();
        ctx2d.arc(sx, sy, st.size * 0.48, 0, Math.PI * 2);
        ctx2d.fill();
      }
    }

    function render(now) {
      rafId = 0;
      if (!ensureCanvas()) return;
      if (!width || !height) {
        resize();
        return;
      }

      const zoom = map && typeof map.getZoom === 'function' ? map.getZoom() : 1.8;
      if (zoom >= 5.2) {
        if (!isBlank) {
          if (useWebGL && gl) {
            gl.clearColor(0.012, 0.018, 0.036, 1.0);
            gl.clear(gl.COLOR_BUFFER_BIT);
          } else if (ctx2d) {
            ctx2d.clearRect(0, 0, width, height);
          }
          isBlank = true;
        }
        return;
      }

      isBlank = false;
      const cam = computeCameraBasis();
      const focal = Math.max(width, height) * 0.92;
      const zoomFade = zoom <= 3.6 ? 1 : Math.max(0, 1 - (zoom - 3.6) / 1.6);

      if (!useWebGL || !gl) {
        render2DFallback(cam, zoomFade);
        return;
      }

      let mixT = 1.0;
      if (isFading) {
        const rawT = Math.max(0, Math.min(1, ((now || performance.now()) - fadeStart) / FADE_MS));
        mixT = rawT * rawT * (3 - 2 * rawT);
        if (rawT >= 1) {
          isFading = false;
          slotA = slotB;
          mixT = 1.0;
        }
      }

      const texA = slotA && slotA.url ? texCache.get(slotA.url) : null;
      const texB = slotB && slotB.url ? texCache.get(slotB.url) : null;
      const tiltAR = ((slotA && slotA.tiltDeg) || 0) * DEG2RAD;
      const tiltBR = ((slotB && slotB.tiltDeg) || 0) * DEG2RAD;

      gl.disable(gl.BLEND);
      gl.useProgram(skyProg);
      gl.bindBuffer(gl.ARRAY_BUFFER, quadBuf);
      const aPosLoc = gl.getAttribLocation(skyProg, 'aPos');
      gl.enableVertexAttribArray(aPosLoc);
      gl.vertexAttribPointer(aPosLoc, 2, gl.FLOAT, false, 0, 0);

      gl.uniform2f(gl.getUniformLocation(skyProg, 'uResolution'), width, height);
      gl.uniform3fv(gl.getUniformLocation(skyProg, 'uRight'), cam.right);
      gl.uniform3fv(gl.getUniformLocation(skyProg, 'uUp'), cam.up);
      gl.uniform3fv(gl.getUniformLocation(skyProg, 'uForward'), cam.forward);
      gl.uniform1f(gl.getUniformLocation(skyProg, 'uFocal'), focal);

      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, texA || texB || null);
      gl.uniform1i(gl.getUniformLocation(skyProg, 'uTexA'), 0);
      gl.uniform1f(gl.getUniformLocation(skyProg, 'uHasA'), texA ? 1.0 : 0.0);

      gl.activeTexture(gl.TEXTURE1);
      gl.bindTexture(gl.TEXTURE_2D, texB || texA || null);
      gl.uniform1i(gl.getUniformLocation(skyProg, 'uTexB'), 1);
      gl.uniform1f(gl.getUniformLocation(skyProg, 'uHasB'), texB ? 1.0 : 0.0);

      gl.uniform1f(gl.getUniformLocation(skyProg, 'uMix'), mixT);
      gl.uniform1f(gl.getUniformLocation(skyProg, 'uExpA'), (slotA && slotA.exposure) || 1.0);
      gl.uniform1f(gl.getUniformLocation(skyProg, 'uExpB'), (slotB && slotB.exposure) || 1.0);
      gl.uniform1f(gl.getUniformLocation(skyProg, 'uTiltSinA'), Math.sin(tiltAR));
      gl.uniform1f(gl.getUniformLocation(skyProg, 'uTiltCosA'), Math.cos(tiltAR));
      gl.uniform1f(gl.getUniformLocation(skyProg, 'uTiltSinB'), Math.sin(tiltBR));
      gl.uniform1f(gl.getUniformLocation(skyProg, 'uTiltCosB'), Math.cos(tiltBR));
      gl.uniform1f(gl.getUniformLocation(skyProg, 'uZoomFade'), zoomFade);

      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);

      // Pass 2: 1,900 multi-scale crisp 3D stars
      const starBoost = ((slotA && slotA.starBoost) || 1.0) * (1 - mixT) + ((slotB && slotB.starBoost) || 1.0) * mixT;
      gl.enable(gl.BLEND);
      gl.blendFunc(gl.SRC_ALPHA, gl.ONE);
      gl.useProgram(starProg);
      gl.bindBuffer(gl.ARRAY_BUFFER, starBuf);

      const STRIDE = 32;
      const locDir = gl.getAttribLocation(starProg, 'aDir');
      const locSize = gl.getAttribLocation(starProg, 'aSize');
      const locAlpha = gl.getAttribLocation(starProg, 'aAlpha');
      const locCol = gl.getAttribLocation(starProg, 'aColor');
      gl.enableVertexAttribArray(locDir);
      gl.vertexAttribPointer(locDir, 3, gl.FLOAT, false, STRIDE, 0);
      gl.enableVertexAttribArray(locSize);
      gl.vertexAttribPointer(locSize, 1, gl.FLOAT, false, STRIDE, 12);
      gl.enableVertexAttribArray(locAlpha);
      gl.vertexAttribPointer(locAlpha, 1, gl.FLOAT, false, STRIDE, 16);
      gl.enableVertexAttribArray(locCol);
      gl.vertexAttribPointer(locCol, 3, gl.FLOAT, false, STRIDE, 20);

      gl.uniform2f(gl.getUniformLocation(starProg, 'uResolution'), width, height);
      gl.uniform3fv(gl.getUniformLocation(starProg, 'uRight'), cam.right);
      gl.uniform3fv(gl.getUniformLocation(starProg, 'uUp'), cam.up);
      gl.uniform3fv(gl.getUniformLocation(starProg, 'uForward'), cam.forward);
      gl.uniform1f(gl.getUniformLocation(starProg, 'uFocal'), focal);
      gl.uniform1f(gl.getUniformLocation(starProg, 'uDpr'), dpr);
      gl.uniform1f(gl.getUniformLocation(starProg, 'uTiltSin'), Math.sin(tiltBR));
      gl.uniform1f(gl.getUniformLocation(starProg, 'uTiltCos'), Math.cos(tiltBR));
      gl.uniform1f(gl.getUniformLocation(starProg, 'uStarBoost'), starBoost);
      gl.uniform1f(gl.getUniformLocation(starProg, 'uZoomFade'), zoomFade);

      gl.drawArrays(gl.POINTS, 0, STAR_COUNT);
      gl.disable(gl.BLEND);

      if (isFading) {
        scheduleRender();
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
      slotA = slotB || slotA;
      slotB = nextMeta;
      if (nextMeta.url) requestTexture(nextMeta);

      if (prefersReducedMotion()) {
        slotA = nextMeta;
        isFading = false;
      } else {
        fadeStart = performance.now();
        isFading = true;
      }
      syncPresetUI();
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
    clusterIndex = new global.Supercluster({ radius: 44, maxZoom: 5, minPoints: 3 });
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
    labelCanvas.style.cssText = 'position:fixed;inset:0;z-index:5;pointer-events:none;';
    document.body.insertBefore(labelCanvas, document.getElementById('topbar'));
    labelCtx = labelCanvas.getContext('2d');
    resizeLabelCanvas();
  }

  function resizeLabelCanvas() {
    if (!labelCanvas || !labelCtx) return;
    const dpr = Math.min(global.devicePixelRatio || 1, 2);
    const w = global.innerWidth;
    const h = global.innerHeight;
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

  function layoutVisibleLabels() {
    if (!map || !labelCanvas || !labelCtx) return;
    resizeLabelCanvas();
    const w = global.innerWidth;
    const h = global.innerHeight;
    labelCtx.clearRect(0, 0, w, h);
    drawnLabelBoxes = [];

    if (state.mode === 'gallery' || state.mode === 'planner' || state.mode === 'archive') return;

    // Draw Supercluster count badges on HiDPI 2D canvas (no MapLibre glyphs needed)
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
        labelCtx.fillStyle = '#09090B';
        labelCtx.fillText(String(cf.properties.point_count_abbreviated || cf.properties.point_count), pt.x, pt.y + 0.5);
      }
      labelCtx.textAlign = 'left';
    }

    const zoom = map.getZoom();
    const center = map.getCenter();
    const isFiltering = isAnyFilterActive();
    const showTier2 = state.forceAllLabels || zoom >= 3.9 || isFiltering;
    const maxLabels = state.forceAllLabels ? 80 : isMobileViewport() ? 18 : 34;
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
      if (pt.x < 16 || pt.x > w - 16 || pt.y < 64 || pt.y > h - 68) continue;

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
      const text = tx(c.dest.shortName || c.dest.name);
      let estW = labelWidthCache.get(text);
      if (estW === undefined) {
        estW = Math.ceil(labelCtx.measureText(text).width) + 4;
        labelWidthCache.set(text, estW);
      }
      const estH = 18;
      const lx = Math.round(c.x + 9);
      const ly = Math.round(c.y);

      if (!state.forceAllLabels && !c.isSelected) {
        let collides = false;
        for (let j = 0; j < drawnLabelBoxes.length; j++) {
          const b = drawnLabelBoxes[j];
          if (lx < b.x + b.w + 8 && lx + estW + 8 > b.x && ly - 9 < b.y + 9 + 4 && ly + 9 + 4 > b.y - 9) {
            collides = true;
            break;
          }
        }
        if (collides) continue;
      }

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
  function setViewMode(mode, skipUrl) {
    const valid = ['map', 'gallery', 'planner', 'archive'];
    state.mode = valid.includes(mode) ? mode : 'map';

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
    if (!skipUrl) syncUrlState(false);
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
    if (mode === 'gallery') state.mode = 'gallery';

    return {
      focusId: params.get('focus'),
      instant: params.get('instant') === '1'
    };
  }

  function bindEvents() {
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

    function updateLayersBadge() {
      const badge = document.getElementById('layers-active-badge');
      if (!badge) return;
      const wxBtnEl = document.getElementById('toggle-weather-layer-btn');
      const tmBtnEl = document.getElementById('toggle-timemachine-btn');
      const fpBtnEl = document.getElementById('toggle-footprint-btn');
      const anyActive = Boolean(
        state.showLabels ||
        state.forceAllLabels ||
        (wxBtnEl && wxBtnEl.classList.contains('active')) ||
        (tmBtnEl && tmBtnEl.classList.contains('active')) ||
        (fpBtnEl && fpBtnEl.classList.contains('active'))
      );
      badge.classList.toggle('is-hidden', !anyActive);
    }

    if (typeof MutationObserver !== 'undefined') {
      const layerObserver = new MutationObserver(updateLayersBadge);
      ['toggle-weather-layer-btn', 'toggle-timemachine-btn', 'toggle-footprint-btn'].forEach((id) => {
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

    document.getElementById('zoom-in-btn').addEventListener('click', () => {
      if (map) map.zoomIn({ duration: 280, easing: easeInOutCubic });
    });
    document.getElementById('zoom-out-btn').addEventListener('click', () => {
      if (map) map.zoomOut({ duration: 280, easing: easeInOutCubic });
    });

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
        e.preventDefault();
        if (global.CommandPalette) {
          if (global.CommandPalette.isOpen()) global.CommandPalette.close();
          else global.CommandPalette.open();
        }
        return;
      }

      if (e.key === '/' && !isTyping) {
        e.preventDefault();
        if (global.CommandPalette) global.CommandPalette.open();
        return;
      }

      if (e.key.toLowerCase() === 'f' && !isTyping && !e.ctrlKey && !e.metaKey) {
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

    // Browser Back/Forward support
    global.addEventListener('popstate', () => {
      suppressPopState = true;
      const params = new URLSearchParams(global.location.search);
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
    if (canvas) {
      canvas.addEventListener('webglcontextlost', (e) => {
        e.preventDefault();
        const banner = document.getElementById('webgl-recovery-banner');
        if (banner) banner.classList.remove('is-hidden');
      });
      canvas.addEventListener('webglcontextrestored', () => {
        const banner = document.getElementById('webgl-recovery-banner');
        if (banner) banner.classList.add('is-hidden');
        syncGeoJsonSource();
        scheduleLabelLayout();
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
      const badge = dest.allWeather ? t('badgeAllWeather') : t('badgeSeasonal');
      const locLabel = (dest.country && dest.country !== '中国') ? `${tx(dest.country)} · ${tx(dest.province)}` : tx(dest.province);
      const isLight = Theme && Theme.getState().mode === 'light';
      const titleCol = isLight ? '#18181B' : '#F5F5F7';
      const subCol = isLight ? '#52525B' : '#A1A1AA';
      const accentCol = (Theme && Theme.getState().accentHex) || '#E2C07D';
      hoverPopup
        .setLngLat(dest.coords)
        .setHTML(`
          <div style="font-weight:500;font-size:13px;margin-bottom:2px;color:${titleCol};">${tx(dest.name)}</div>
          <div style="color:${subCol};font-size:11px;margin-bottom:4px;">${locLabel} · ${badge}</div>
          <div style="color:${subCol};font-size:11.5px;line-height:1.45;">${tx(dest.subtitle)}</div>
          <div style="color:${accentCol};font-size:11px;margin-top:5px;">${t('hoverAction', { n: dest.spotCount || (dest.spots ? dest.spots.length : 0) })}</div>
        `)
        .addTo(map);
    });

    map.on('mouseleave', 'atlas-hit', () => {
      if (map.getCanvas()) map.getCanvas().style.cursor = '';
      if (hoveredFeatureId !== null) {
        map.setFeatureState({ source: 'atlas-points', id: hoveredFeatureId }, { hover: false });
        hoveredFeatureId = null;
      }
      if (hoverPopup) hoverPopup.remove();
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

    if (!map || !map.isStyleLoaded()) return;

    // Restrained deep-space starfield shows behind transparent sky with soft sapphire atmosphere halo
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

  function refreshAllTexts() {
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
    if (global.AmbientRadio && typeof global.AmbientRadio.refreshLocale === 'function') {
      global.AmbientRadio.refreshLocale();
    }
  }

  function init() {
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
    const focusDest = initialParams.focusId ? ATLAS.getById(initialParams.focusId) : null;

    renderContinentTabs();
    syncFilterControlUI();
    recomputeMatchedSet();
    renderPhenologyBar();
    renderSidebar();
    renderActiveChips();

    if (isMobileViewport()) {
      setSidebarOpen(false);
    }

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

    if (map.scrollZoom) {
      map.scrollZoom.setWheelZoomRate(1 / 320);
      map.scrollZoom.setZoomRate(1 / 110);
    }

    ensureLabelOverlay();
    starfield.resize();
    global.addEventListener('resize', starfield.resize);
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
      if (state.skin !== 'satellite') switchSkin(state.skin, true);
      if (state.mode === 'gallery') setViewMode('gallery', true);
      scheduleLabelLayout();
      initAutoTileRoute();
      if (global.OnboardingTour) global.OnboardingTour.init();

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
    }
    if (global.navigator && 'serviceWorker' in global.navigator && global.location && (global.location.protocol === 'https:' || global.location.hostname === '127.0.0.1' || global.location.hostname === 'localhost')) {
      global.navigator.serviceWorker.register('sw.js').catch(() => {});
    }
  }

  document.addEventListener('DOMContentLoaded', init);
})(window);
