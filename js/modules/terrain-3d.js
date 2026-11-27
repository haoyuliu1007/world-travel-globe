(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory(typeof globalThis !== 'undefined' ? globalThis : root);
  } else {
    root.Terrain3DModule = factory(root);
  }
})(typeof window !== 'undefined' ? window : globalThis, function (global) {
  'use strict';

  const DEG2RAD = Math.PI / 180;
  const RAD2DEG = 180 / Math.PI;
  const EARTH_RADIUS_M = 6371000;
  const TERRARIUM_URL = 'https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png';
  const MAPTERHORN_URL = 'https://tiles.mapterhorn.com/{z}/{x}/{y}.webp';
  const BLACK_MARBLE_URL =
    'https://gibs.earthdata.nasa.gov/wmts/epsg3857/best/VIIRS_Black_Marble/default/2016-01-01/GoogleMapsCompatible_Level8/{z}/{y}/{x}.png';
  const OPENFREEMAP_URL = 'https://tiles.openfreemap.org/planet';

  const state = {
    terrain: false,
    exaggeration: 1.35,
    demProvider: 'mapterhorn',
    contours: false,
    buildings: false,
    nightLights: false,
    aurora: false,
    auroraInfo: null
  };

  let contourDemSource = null;
  let contourProtocolRegistered = false;
  const tileCache = new Map();
  const MAX_TILE_CACHE = 48;

  function esc(str) {
    return String(str || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  /**
   * Decode AWS Terrarium RGB triplet to elevation in meters.
   */
  function decodeTerrariumElevation(r, g, b) {
    return r * 256 + g + b / 256 - 32768;
  }

  /**
   * Convert WGS84 (lng, lat) to Web Mercator slippy tile + pixel coords [0, 256).
   */
  function lngLatToTileXY(lng, lat, zoom) {
    const z = Number(zoom) || 11;
    const n = Math.pow(2, z);
    const clampedLat = Math.max(-85.05112878, Math.min(85.05112878, Number(lat) || 0));
    const latRad = clampedLat * DEG2RAD;
    const xFloat = ((Number(lng) + 180) / 360) * n;
    const yFloat = ((1 - Math.log(Math.tan(latRad) + 1 / Math.cos(latRad)) / Math.PI) / 2) * n;
    const x = Math.max(0, Math.min(n - 1, Math.floor(xFloat)));
    const y = Math.max(0, Math.min(n - 1, Math.floor(yFloat)));
    const px = Math.max(0, Math.min(255, Math.floor((xFloat - x) * 256)));
    const py = Math.max(0, Math.min(255, Math.floor((yFloat - y) * 256)));
    return { z, x, y, px, py };
  }

  function destPointMeters(lng, lat, azimuthDeg, distMeters) {
    const dR = distMeters / EARTH_RADIUS_M;
    const brng = azimuthDeg * DEG2RAD;
    const lat1 = lat * DEG2RAD;
    const lon1 = lng * DEG2RAD;
    const sinLat1 = Math.sin(lat1);
    const cosLat1 = Math.cos(lat1);
    const sinDR = Math.sin(dR);
    const cosDR = Math.cos(dR);
    const lat2 = Math.asin(sinLat1 * cosDR + cosLat1 * sinDR * Math.cos(brng));
    const lon2 = lon1 + Math.atan2(Math.sin(brng) * sinDR * cosLat1, cosDR - sinLat1 * Math.sin(lat2));
    return [((lon2 * RAD2DEG + 540) % 360) - 180, lat2 * RAD2DEG];
  }

  /**
   * Pure horizon profile computation from an arbitrary elevation(lat, lng) sampler.
   * Accounts for Earth curvature and standard atmospheric refraction (k ≈ 1.15).
   */
  function computeHorizonFromSampler(lat, lng, sampleElevationFn, opts) {
    if (typeof sampleElevationFn !== 'function') {
      return { available: false, reason: 'Missing elevation sampler' };
    }
    const azStepDeg = Math.max(1, Number((opts && opts.azStepDeg) || 5));
    const minDistM = Number((opts && opts.minDistM) || 400);
    const maxDistM = Number((opts && opts.maxDistM) || 30000);
    const distSteps = Math.max(8, Number((opts && opts.distSteps) || 28));

    const observerHeightM = Number.isFinite(Number(opts && opts.observerHeightM))
      ? Number(opts.observerHeightM)
      : 1.6;
    const centerSample = sampleElevationFn(lat, lng);
    const observerElevation = (Number.isFinite(centerSample) ? centerSample : 0) + observerHeightM;

    const distances = [];
    for (let s = 0; s < distSteps; s++) {
      const t = distSteps === 1 ? 0 : s / (distSteps - 1);
      distances.push(minDistM * Math.pow(maxDistM / minDistM, t));
    }

    const profile = [];
    let maxObstacleDeg = 0;
    let sumAngle = 0;

    for (let az = 0; az < 360; az += azStepDeg) {
      let bestAngle = 0;
      let peakDistKm = 0;
      let peakElevM = observerElevation;

      for (let i = 0; i < distances.length; i++) {
        const d = distances[i];
        const [pLng, pLat] = destPointMeters(lng, lat, az, d);
        const h = sampleElevationFn(pLat, pLng);
        if (!Number.isFinite(h)) continue;
        // Effective Earth curvature + atmospheric refraction drop
        const drop = (d * d) / (2 * EARTH_RADIUS_M * 1.15);
        const angleDeg = Math.atan2(h - observerElevation - drop, d) * RAD2DEG;
        if (angleDeg > bestAngle) {
          bestAngle = angleDeg;
          peakDistKm = Number((d / 1000).toFixed(2));
          peakElevM = Math.round(h);
        }
      }

      const roundedAngle = Number(bestAngle.toFixed(2));
      if (roundedAngle > maxObstacleDeg) maxObstacleDeg = roundedAngle;
      sumAngle += roundedAngle;
      profile.push({
        az,
        maxAngleDeg: roundedAngle,
        peakDistKm,
        peakElevM
      });
    }

    return {
      available: true,
      observerElevation: Math.round(observerElevation),
      profile,
      maxObstacleDeg: Number(maxObstacleDeg.toFixed(2)),
      meanHorizonDeg: Number((sumAngle / Math.max(1, profile.length)).toFixed(2))
    };
  }

  function interpolateHorizonAngle(profile, azDeg) {
    if (!Array.isArray(profile) || !profile.length) return 0;
    const norm = ((azDeg % 360) + 360) % 360;
    const step = 360 / profile.length;
    const idx0 = Math.floor(norm / step) % profile.length;
    const idx1 = (idx0 + 1) % profile.length;
    const frac = (norm - idx0 * step) / step;
    const a0 = profile[idx0] ? profile[idx0].maxAngleDeg : 0;
    const a1 = profile[idx1] ? profile[idx1].maxAngleDeg : 0;
    return a0 + (a1 - a0) * frac;
  }

  /**
   * Estimate terrain-obstructed sunrise and sunset times by scanning the solar trajectory
   * against the 360° horizon elevation profile in the destination's local timezone.
   */
  function estimateTerrainAdjustedSunTimes(lat, lng, dateStr, profile, sunCalcRef, utcOffsetMin) {
    const SC = sunCalcRef || global.SunCalc;
    if (!SC || !Array.isArray(profile) || !profile.length) return null;

    const [y, m, d] = String(dateStr || '').split('-').map(Number);
    const yr = y || 2026;
    const mo = (m || 6) - 1;
    const dy = d || 21;
    const offsetMin = Number.isFinite(Number(utcOffsetMin))
      ? Number(utcOffsetMin)
      : Math.max(-720, Math.min(840, Math.round((Number(lng) || 0) / 15) * 60));

    const noonDt = new Date(Date.UTC(yr, mo, dy, 0, 12 * 60 - offsetMin, 0));
    const times = SC.getTimes(noonDt, lat, lng);
    const geomSunrise = times && times.sunrise instanceof Date && !Number.isNaN(times.sunrise.getTime()) ? times.sunrise : null;
    const geomSunset = times && times.sunset instanceof Date && !Number.isNaN(times.sunset.getTime()) ? times.sunset : null;

    let adjSunrise = null;
    let adjSunset = null;
    let prevClear = false;

    for (let min = 0; min < 1440; min += 2) {
      const dt = new Date(Date.UTC(yr, mo, dy, 0, min - offsetMin, 0));
      const pos = SC.getPosition(dt, lat, lng);
      const obsDeg = interpolateHorizonAngle(profile, pos.azimuth);
      const isClear = pos.altitude > Math.max(-0.833, obsDeg);
      if (isClear && !prevClear && !adjSunrise) {
        adjSunrise = dt;
      }
      if (isClear) {
        adjSunset = dt;
      }
      prevClear = isClear;
    }

    const sunriseDelayMin = geomSunrise && adjSunrise
      ? Math.max(0, Math.round((adjSunrise.getTime() - geomSunrise.getTime()) / 60000))
      : 0;
    const sunsetEarlyMin = geomSunset && adjSunset
      ? Math.max(0, Math.round((geomSunset.getTime() - adjSunset.getTime()) / 60000))
      : 0;

    return {
      geomSunrise,
      geomSunset,
      adjSunrise,
      adjSunset,
      sunriseDelayMin,
      sunsetEarlyMin
    };
  }

  function loadDemTilePixels(z, x, y) {
    const key = `${z}/${x}/${y}`;
    if (tileCache.has(key)) return tileCache.get(key);

    const p = new Promise((resolve, reject) => {
      if (typeof Image === 'undefined' || typeof document === 'undefined') {
        reject(new Error('DOM Canvas unavailable'));
        return;
      }
      const img = new Image();
      img.crossOrigin = 'anonymous';
      const url = `https://s3.amazonaws.com/elevation-tiles-prod/terrarium/${z}/${x}/${y}.png`;
      img.onload = () => {
        try {
          const cvs = document.createElement('canvas');
          cvs.width = 256;
          cvs.height = 256;
          const ctx = cvs.getContext('2d', { willReadFrequently: true });
          ctx.drawImage(img, 0, 0, 256, 256);
          const data = ctx.getImageData(0, 0, 256, 256).data;
          resolve(data);
        } catch (err) {
          reject(err);
        }
      };
      img.onerror = () => reject(new Error(`Failed DEM tile ${key}`));
      img.src = url;
    }).catch((err) => {
      tileCache.delete(key);
      throw err;
    });

    tileCache.set(key, p);
    if (tileCache.size > MAX_TILE_CACHE) {
      const oldest = tileCache.keys().next().value;
      tileCache.delete(oldest);
    }
    return p;
  }

  /**
   * Browser-side multi-resolution Terrarium DEM 360° horizon obstruction analysis:
   * z12 (~38m/px) near-field center tile + z11 (~76m/px) 3x3 far-field window.
   */
  async function computeTerrainHorizon(lat, lng, opts) {
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
      return { available: false, reason: 'Invalid coordinates' };
    }
    const z11 = 11;
    const centerTile11 = lngLatToTileXY(lng, lat, z11);
    const n11 = Math.pow(2, z11);
    const tileMap11 = new Map();
    const loads = [];

    for (let dx = -1; dx <= 1; dx++) {
      for (let dy = -1; dy <= 1; dy++) {
        const tx = ((centerTile11.x + dx) % n11 + n11) % n11;
        const ty = centerTile11.y + dy;
        if (ty < 0 || ty >= n11) continue;
        const k = `${tx}/${ty}`;
        loads.push(
          loadDemTilePixels(z11, tx, ty)
            .then((data) => tileMap11.set(k, data))
            .catch(() => null)
        );
      }
    }

    const z12 = 12;
    const centerTile12 = lngLatToTileXY(lng, lat, z12);
    const n12 = Math.pow(2, z12);
    const tileMap12 = new Map();
    const nearDx = centerTile12.px < 96 ? [-1, 0] : centerTile12.px > 160 ? [0, 1] : [0];
    const nearDy = centerTile12.py < 96 ? [-1, 0] : centerTile12.py > 160 ? [0, 1] : [0];
    for (let i = 0; i < nearDx.length; i++) {
      for (let j = 0; j < nearDy.length; j++) {
        const tx = ((centerTile12.x + nearDx[i]) % n12 + n12) % n12;
        const ty = centerTile12.y + nearDy[j];
        if (ty < 0 || ty >= n12) continue;
        const k = `${tx}/${ty}`;
        loads.push(
          loadDemTilePixels(z12, tx, ty)
            .then((data) => tileMap12.set(k, data))
            .catch(() => null)
        );
      }
    }

    await Promise.all(loads);
    if (!tileMap11.has(`${centerTile11.x}/${centerTile11.y}`)) {
      return { available: false, reason: 'Terrarium DEM tiles unavailable (offline or blocked)' };
    }

    const sampler = (sLat, sLng) => {
      const tc12 = lngLatToTileXY(sLng, sLat, z12);
      const px12 = tileMap12.get(`${tc12.x}/${tc12.y}`);
      if (px12) {
        const idx12 = (tc12.py * 256 + tc12.px) * 4;
        return decodeTerrariumElevation(px12[idx12], px12[idx12 + 1], px12[idx12 + 2]);
      }
      const tc11 = lngLatToTileXY(sLng, sLat, z11);
      const px11 = tileMap11.get(`${tc11.x}/${tc11.y}`);
      if (!px11) return null;
      const idx11 = (tc11.py * 256 + tc11.px) * 4;
      return decodeTerrariumElevation(px11[idx11], px11[idx11 + 1], px11[idx11 + 2]);
    };

    const res = computeHorizonFromSampler(lat, lng, sampler, opts);
    res.demSource = tileMap12.size > 0
      ? 'AWS Terrarium DEM (z12 近场 + z11 远场)'
      : 'AWS Mapzen Terrarium (z11)';
    return res;
  }

  function findAnchorLayerId(map) {
    if (!map || typeof map.getLayer !== 'function') return undefined;
    if (map.getLayer('atlas-glow')) return 'atlas-glow';
    if (map.getLayer('layer-labels')) return 'layer-labels';
    return undefined;
  }

  function syncButtonsUI() {
    const mapIds = [
      ['toggle-terrain-btn', state.terrain],
      ['toggle-contour-btn', state.contours],
      ['toggle-buildings-btn', state.buildings],
      ['toggle-nightlights-btn', state.nightLights],
      ['toggle-aurora-btn', state.aurora]
    ];
    mapIds.forEach(([id, active]) => {
      const el = typeof document !== 'undefined' ? document.getElementById(id) : null;
      if (el) el.classList.toggle('active', Boolean(active));
    });
    const exRow = typeof document !== 'undefined' ? document.getElementById('terrain-exag-row') : null;
    if (exRow) exRow.classList.toggle('is-hidden', !state.terrain);
  }

  function ensureDemSource(map) {
    if (!map) return;
    if (!map.getSource('aws-terrarium-dem')) {
      const useMapterhorn = state.demProvider === 'mapterhorn';
      map.addSource('aws-terrarium-dem', {
        type: 'raster-dem',
        tiles: [useMapterhorn ? MAPTERHORN_URL : TERRARIUM_URL],
        encoding: 'terrarium',
        tileSize: useMapterhorn ? 512 : 256,
        maxzoom: useMapterhorn ? 12 : 15,
        attribution: useMapterhorn ? '© Mapterhorn (CC BY 4.0) / Open Data' : 'Mapzen / AWS Terrarium DEM'
      });
    }
  }

  function setDemProvider(map, provider) {
    const next = provider === 'aws-terrarium' ? 'aws-terrarium' : 'mapterhorn';
    if (state.demProvider === next) return state.demProvider;
    state.demProvider = next;
    if (map && map.getSource && map.getSource('aws-terrarium-dem')) {
      const wasTerrain = state.terrain;
      const hadHillshade = Boolean(map.getLayer('layer-v4-hillshade'));
      if (wasTerrain) map.setTerrain(null);
      if (hadHillshade) map.removeLayer('layer-v4-hillshade');
      map.removeSource('aws-terrarium-dem');
      if (wasTerrain) toggleTerrain(map, true);
    }
    return state.demProvider;
  }

  function toggleTerrain(map, forceState) {
    if (!map || !map.isStyleLoaded || !map.isStyleLoaded()) return state.terrain;
    const next = typeof forceState === 'boolean' ? forceState : !state.terrain;
    state.terrain = next;

    try {
      if (next) {
        ensureDemSource(map);
        map.setTerrain({ source: 'aws-terrarium-dem', exaggeration: state.exaggeration });
        if (!map.getLayer('layer-v4-hillshade')) {
          map.addLayer(
            {
              id: 'layer-v4-hillshade',
              type: 'hillshade',
              source: 'aws-terrarium-dem',
              paint: {
                'hillshade-exaggeration': 0.38,
                'hillshade-shadow-color': 'rgba(8, 12, 22, 0.52)',
                'hillshade-highlight-color': 'rgba(255, 248, 232, 0.22)',
                'hillshade-accent-color': 'rgba(18, 28, 48, 0.28)'
              }
            },
            findAnchorLayerId(map)
          );
        }
      } else {
        map.setTerrain(null);
        if (map.getLayer('layer-v4-hillshade')) map.removeLayer('layer-v4-hillshade');
      }
    } catch (e) {
      state.terrain = false;
    }

    syncButtonsUI();
    return state.terrain;
  }

  function setTerrainExaggeration(map, factor) {
    const clamped = Math.max(0.5, Math.min(2.5, Number(factor) || 1.35));
    state.exaggeration = clamped;
    if (state.terrain && map && map.getSource('aws-terrarium-dem')) {
      try {
        map.setTerrain({ source: 'aws-terrarium-dem', exaggeration: clamped });
      } catch (e) {
        // ignore
      }
    }
    if (typeof document !== 'undefined') {
      document.querySelectorAll('[data-terrain-exag]').forEach((btn) => {
        btn.classList.toggle('active', Math.abs(Number(btn.dataset.terrainExag) - clamped) < 0.05);
      });
    }
    return clamped;
  }

  function queryElevation(map, lng, lat) {
    if (!map || typeof map.queryTerrainElevation !== 'function') return null;
    try {
      const val = map.queryTerrainElevation([lng, lat], { exaggerated: false });
      return Number.isFinite(val) ? Math.round(val) : null;
    } catch (e) {
      return null;
    }
  }

  async function toggleContours(map, forceState) {
    if (!map || !map.isStyleLoaded || !map.isStyleLoaded()) return state.contours;
    const next = typeof forceState === 'boolean' ? forceState : !state.contours;

    if (!next) {
      state.contours = false;
      if (map.getLayer('layer-v4-contours-label')) map.removeLayer('layer-v4-contours-label');
      if (map.getLayer('layer-v4-contours-line')) map.removeLayer('layer-v4-contours-line');
      if (map.getSource('v4-contours-src')) map.removeSource('v4-contours-src');
      syncButtonsUI();
      return false;
    }

    try {
      if (!global.LazyLoader || typeof global.LazyLoader.ensureMaplibreContour !== 'function') {
        return false;
      }
      const mlcontour = await global.LazyLoader.ensureMaplibreContour();
      if (!contourDemSource) {
        contourDemSource = new mlcontour.DemSource({
          url: TERRARIUM_URL,
          encoding: 'terrarium',
          maxzoom: 13,
          worker: false,
          cacheSize: 80
        });
      }
      if (!contourProtocolRegistered && global.maplibregl && typeof contourDemSource.setupMaplibre === 'function') {
        contourDemSource.setupMaplibre(global.maplibregl);
        contourProtocolRegistered = true;
      }

      if (!map.getSource('v4-contours-src')) {
        const contourUrl = contourDemSource.contourProtocolUrl({
          thresholds: {
            9: [250, 1000],
            11: [100, 500],
            13: [50, 200],
            15: [20, 100]
          },
          contourLayer: 'contours',
          elevationKey: 'ele',
          levelKey: 'level'
        });
        map.addSource('v4-contours-src', {
          type: 'vector',
          tiles: [contourUrl],
          maxzoom: 15
        });
      }

      if (!map.getLayer('layer-v4-contours-line')) {
        map.addLayer(
          {
            id: 'layer-v4-contours-line',
            type: 'line',
            source: 'v4-contours-src',
            'source-layer': 'contours',
            minzoom: 8.5,
            paint: {
              'line-color': ['case', ['>', ['get', 'level'], 0], 'rgba(226, 192, 125, 0.72)', 'rgba(241, 245, 249, 0.34)'],
              'line-width': ['case', ['>', ['get', 'level'], 0], 1.25, 0.65]
            }
          },
          findAnchorLayerId(map)
        );
      }

      state.contours = true;
    } catch (e) {
      state.contours = false;
    }

    syncButtonsUI();
    return state.contours;
  }

  function toggleBuildings(map, forceState) {
    if (!map || !map.isStyleLoaded || !map.isStyleLoaded()) return state.buildings;
    const next = typeof forceState === 'boolean' ? forceState : !state.buildings;
    state.buildings = next;

    try {
      if (next) {
        if (!map.getSource('openfreemap-vector')) {
          map.addSource('openfreemap-vector', {
            type: 'vector',
            url: OPENFREEMAP_URL,
            attribution: 'OpenFreeMap / OpenStreetMap'
          });
        }
        if (!map.getLayer('layer-v4-buildings')) {
          const isDark = typeof document !== 'undefined' && document.documentElement.getAttribute('data-theme') === 'dark';
          map.addLayer(
            {
              id: 'layer-v4-buildings',
              type: 'fill-extrusion',
              source: 'openfreemap-vector',
              'source-layer': 'building',
              minzoom: 13,
              paint: {
                'fill-extrusion-color': isDark ? '#334155' : '#CBD5E1',
                'fill-extrusion-height': ['coalesce', ['get', 'render_height'], 12],
                'fill-extrusion-base': ['coalesce', ['get', 'render_min_height'], 0],
                'fill-extrusion-opacity': 0.78
              }
            },
            findAnchorLayerId(map)
          );
        }
      } else {
        if (map.getLayer('layer-v4-buildings')) map.removeLayer('layer-v4-buildings');
      }
    } catch (e) {
      state.buildings = false;
    }

    syncButtonsUI();
    return state.buildings;
  }

  function toggleNightLights(map, forceState) {
    if (!map || !map.isStyleLoaded || !map.isStyleLoaded()) return state.nightLights;
    const next = typeof forceState === 'boolean' ? forceState : !state.nightLights;
    state.nightLights = next;

    try {
      if (next) {
        if (!map.getSource('v4-blackmarble-src')) {
          map.addSource('v4-blackmarble-src', {
            type: 'raster',
            tiles: [BLACK_MARBLE_URL],
            tileSize: 256,
            maxzoom: 8,
            attribution: 'NASA Earth Observatory Black Marble'
          });
        }
        if (!map.getLayer('layer-v4-blackmarble')) {
          map.addLayer(
            {
              id: 'layer-v4-blackmarble',
              type: 'raster',
              source: 'v4-blackmarble-src',
              paint: {
                'raster-opacity': 0.84,
                'raster-fade-duration': 240
              }
            },
            findAnchorLayerId(map)
          );
        }
      } else {
        if (map.getLayer('layer-v4-blackmarble')) map.removeLayer('layer-v4-blackmarble');
      }
    } catch (e) {
      state.nightLights = false;
    }

    syncButtonsUI();
    return state.nightLights;
  }

  function parseAuroraData(ovationJson, kpJson) {
    const coords = ovationJson && Array.isArray(ovationJson.coordinates) ? ovationJson.coordinates : [];
    const features = [];
    for (let i = 0; i < coords.length; i++) {
      const pt = coords[i];
      if (!Array.isArray(pt) || pt.length < 3) continue;
      const prob = Number(pt[2]);
      if (!Number.isFinite(prob) || prob < 10) continue;
      let lng = Number(pt[0]);
      const lat = Number(pt[1]);
      if (lng > 180) lng -= 360;
      if (!Number.isFinite(lng) || !Number.isFinite(lat)) continue;
      features.push({
        type: 'Feature',
        properties: { prob: Math.min(100, prob) },
        geometry: { type: 'Point', coordinates: [lng, lat] }
      });
    }

    let kpVal = null;
    if (Array.isArray(kpJson) && kpJson.length > 1) {
      const last = kpJson[kpJson.length - 1];
      const rawKp = Array.isArray(last) ? Number(last[1]) : Number(last && last.Kp);
      if (Number.isFinite(rawKp)) kpVal = rawKp;
    }

    return {
      geojson: { type: 'FeatureCollection', features },
      kp: kpVal,
      forecastTime: (ovationJson && (ovationJson['Forecast Time'] || ovationJson['Observation Time'])) || ''
    };
  }

  function countSpotsInAuroraBelt(features) {
    if (!global.TRAVEL_ATLAS || typeof global.TRAVEL_ATLAS.getAll !== 'function' || !features.length) return 0;
    const hotBins = new Set();
    for (let i = 0; i < features.length; i++) {
      if (features[i].properties.prob < 20) continue;
      const [lng, lat] = features[i].geometry.coordinates;
      hotBins.add(`${Math.round(lng / 3)}_${Math.round(lat / 2)}`);
    }
    const all = global.TRAVEL_ATLAS.getAll();
    let count = 0;
    for (let i = 0; i < all.length; i++) {
      const c = all[i].coords;
      if (!Array.isArray(c)) continue;
      if (Math.abs(c[1]) < 48) continue;
      if (hotBins.has(`${Math.round(c[0] / 3)}_${Math.round(c[1] / 2)}`)) count++;
    }
    return count;
  }

  function renderAuroraStatusPill(info, map) {
    const pill = typeof document !== 'undefined' ? document.getElementById('aurora-status-pill') : null;
    if (!pill) return;
    if (!state.aurora || !info) {
      pill.classList.add('is-hidden');
      pill.innerHTML = '';
      return;
    }
    const kpText = info.kp !== null ? `Kp ${info.kp.toFixed(1)}` : 'NOAA OVATION';
    const timeShort = info.forecastTime ? String(info.forecastTime).replace('T', ' ').slice(0, 16) + ' UTC' : '30m 实时预测';
    pill.classList.remove('is-hidden');
    pill.innerHTML = `
      <span class="aurora-dot"></span>
      <span><strong>${esc(kpText)}</strong> · ${esc(timeShort)}${info.coveredCities ? ` · 极光带覆盖 <strong class="mono-num">${info.coveredCities}</strong> 城` : ''}</span>
      <button id="aurora-pill-close" class="aurora-pill-close" type="button" aria-label="关闭极光图层">×</button>
    `;
    const closeBtn = pill.querySelector('#aurora-pill-close');
    if (closeBtn) {
      closeBtn.addEventListener('click', () => toggleAurora(map, false));
    }
  }

  async function toggleAurora(map, forceState) {
    if (!map || !map.isStyleLoaded || !map.isStyleLoaded()) return state.aurora;
    const next = typeof forceState === 'boolean' ? forceState : !state.aurora;

    if (!next) {
      state.aurora = false;
      if (map.getLayer('layer-v4-aurora')) map.removeLayer('layer-v4-aurora');
      if (map.getSource('v4-aurora-src')) map.removeSource('v4-aurora-src');
      renderAuroraStatusPill(null, map);
      syncButtonsUI();
      return false;
    }

    try {
      let ovationJson = null;
      let kpJson = null;

      const Api = global.ApiClient;
      const caps = Api ? await Api.detectWorkerCapabilities().catch(() => null) : null;
      if (caps && caps.available && caps.features && caps.features.aurora) {
        const res = await Api.fetchJson('/api/aurora', { cacheKey: 'aurora:worker', ttlMs: 900000, source: 'NOAA SWPC (Worker)' });
        ovationJson = res && res.ovation;
        kpJson = res && res.kp;
      } else {
        const [ovRes, kpRes] = await Promise.all([
          fetch('https://services.swpc.noaa.gov/json/ovation_aurora_latest.json'),
          fetch('https://services.swpc.noaa.gov/products/noaa-planetary-k-index.json').catch(() => null)
        ]);
        if (!ovRes.ok) throw new Error(`NOAA HTTP ${ovRes.status}`);
        ovationJson = await ovRes.json();
        kpJson = kpRes && kpRes.ok ? await kpRes.json().catch(() => null) : null;
      }

      const parsed = parseAuroraData(ovationJson, kpJson);
      const coveredCities = countSpotsInAuroraBelt(parsed.geojson.features);
      state.auroraInfo = { kp: parsed.kp, forecastTime: parsed.forecastTime, coveredCities };

      if (!map.getSource('v4-aurora-src')) {
        map.addSource('v4-aurora-src', { type: 'geojson', data: parsed.geojson });
      } else {
        map.getSource('v4-aurora-src').setData(parsed.geojson);
      }

      if (!map.getLayer('layer-v4-aurora')) {
        map.addLayer(
          {
            id: 'layer-v4-aurora',
            type: 'heatmap',
            source: 'v4-aurora-src',
            paint: {
              'heatmap-weight': ['interpolate', ['linear'], ['get', 'prob'], 10, 0.15, 50, 0.65, 95, 1],
              'heatmap-intensity': ['interpolate', ['linear'], ['zoom'], 1, 0.9, 5, 1.4],
              'heatmap-radius': ['interpolate', ['linear'], ['zoom'], 1, 14, 4, 28, 7, 42],
              'heatmap-opacity': 0.72,
              'heatmap-color': [
                'interpolate',
                ['linear'],
                ['heatmap-density'],
                0, 'rgba(0,0,0,0)',
                0.2, 'rgba(16, 185, 129, 0.36)',
                0.45, 'rgba(52, 211, 153, 0.72)',
                0.72, 'rgba(110, 231, 183, 0.88)',
                0.9, 'rgba(167, 139, 250, 0.92)'
              ]
            }
          },
          findAnchorLayerId(map)
        );
      }

      state.aurora = true;
      renderAuroraStatusPill(state.auroraInfo, map);
    } catch (e) {
      state.aurora = false;
      renderAuroraStatusPill(null, map);
    }

    syncButtonsUI();
    return state.aurora;
  }

  function getState() {
    return Object.assign({}, state);
  }

  return {
    TERRARIUM_URL,
    MAPTERHORN_URL,
    decodeTerrariumElevation,
    lngLatToTileXY,
    destPointMeters,
    computeHorizonFromSampler,
    estimateTerrainAdjustedSunTimes,
    computeTerrainHorizon,
    parseAuroraData,
    setDemProvider,
    toggleTerrain,
    setTerrainExaggeration,
    queryElevation,
    toggleContours,
    toggleBuildings,
    toggleNightLights,
    toggleAurora,
    getState
  };
});
