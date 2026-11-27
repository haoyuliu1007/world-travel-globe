(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory(typeof globalThis !== 'undefined' ? globalThis : root);
  } else {
    root.SolarTerminator = factory(root);
  }
})(typeof window !== 'undefined' ? window : globalThis, function (global) {
  'use strict';

  const DEG2RAD = Math.PI / 180;
  const RAD2DEG = 180 / Math.PI;
  const MAX_MERC_LAT = 85.051;

  const state = {
    enabled: false,
    liveMode: true,
    customDate: null,
    timerId: 0
  };

  function esc(str) {
    return String(str || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  /**
   * Pure astronomical calculation of the Sun's geographic subsolar point [lng, lat]
   * and declination/RA at any UTC Date. Works 100% offline.
   */
  function computeSubsolarPoint(dateInput) {
    const dt = dateInput instanceof Date && !Number.isNaN(dateInput.getTime()) ? dateInput : new Date();
    const jd = dt.getTime() / 86400000 + 2440587.5;
    const d = jd - 2451545.0;

    const g = (((357.5291 + 0.98560028 * d) % 360) + 360) % 360;
    const q = (((280.459 + 0.98564736 * d) % 360) + 360) % 360;
    const gRad = g * DEG2RAD;
    const L = (q + 1.915 * Math.sin(gRad) + 0.020 * Math.sin(2 * gRad)) * DEG2RAD;
    const e = (23.4393 - 0.00000036 * d) * DEG2RAD;

    const decRad = Math.asin(Math.max(-1, Math.min(1, Math.sin(e) * Math.sin(L))));
    const raRad = Math.atan2(Math.cos(e) * Math.sin(L), Math.cos(L));
    const raHours = ((raRad * RAD2DEG) / 15 + 24) % 24;

    const gmstHours = (((18.697374558 + 24.06570982441908 * d) % 24) + 24) % 24;
    const lng = ((((raHours - gmstHours) * 15 + 540) % 360) + 360) % 360 - 180;
    const lat = decRad * RAD2DEG;

    return {
      lng: Number(lng.toFixed(4)),
      lat: Number(lat.toFixed(4)),
      decRad,
      timestamp: dt.toISOString()
    };
  }

  function solarAltitudeDeg(latDeg, lngDeg, subsolar) {
    const phi = latDeg * DEG2RAD;
    const dec = subsolar.lat * DEG2RAD;
    const ha = (lngDeg - subsolar.lng) * DEG2RAD;
    const s = Math.sin(phi) * Math.sin(dec) + Math.cos(phi) * Math.cos(dec) * Math.cos(ha);
    return Math.asin(Math.max(-1, Math.min(1, s))) * RAD2DEG;
  }

  /**
   * Solve the latitude along meridian `lng` where solar altitude crosses `targetAltDeg`
   * between the sunlit pole/subsolar band and the winter pole.
   */
  function findBandBoundaryLat(lngDeg, subsolar, targetAltDeg) {
    const dec = subsolar.lat;
    const summerSign = dec >= 0 ? 1 : -1;
    // Start bracket on summer/day side vs winter/night side
    let loLat = summerSign > 0 ? -MAX_MERC_LAT : MAX_MERC_LAT;
    let hiLat = summerSign > 0 ? MAX_MERC_LAT : -MAX_MERC_LAT;

    // On meridians near solar noon, peak altitude occurs near dec; use dec or summer pole as high end
    const haCos = Math.cos((lngDeg - subsolar.lng) * DEG2RAD);
    const poleAlt = solarAltitudeDeg(hiLat, lngDeg, subsolar);
    const eqAlt = solarAltitudeDeg(dec, lngDeg, subsolar);
    if (eqAlt > poleAlt && haCos > 0) hiLat = dec;

    const altWinter = solarAltitudeDeg(loLat, lngDeg, subsolar);
    const altDay = solarAltitudeDeg(hiLat, lngDeg, subsolar);

    if (altDay <= targetAltDeg) return hiLat;
    if (altWinter >= targetAltDeg) return loLat;

    for (let it = 0; it < 18; it++) {
      const mid = (loLat + hiLat) / 2;
      if (solarAltitudeDeg(mid, lngDeg, subsolar) > targetAltDeg) {
        hiLat = mid;
      } else {
        loLat = mid;
      }
    }
    return Number(((loLat + hiLat) / 2).toFixed(3));
  }

  function buildNightBandRing(subsolar, targetAltDeg) {
    const winterPole = subsolar.lat >= 0 ? -MAX_MERC_LAT : MAX_MERC_LAT;
    const pts = [];
    for (let lng = -180; lng <= 180; lng += 3) {
      pts.push([lng, findBandBoundaryLat(lng, subsolar, targetAltDeg)]);
    }
    const ring = pts.slice();
    ring.push([180, winterPole]);
    ring.push([-180, winterPole]);
    ring.push(ring[0].slice());
    return ring;
  }

  /**
   * Build 3 spherical shadow polygons (0°, -6° civil, -12° nautical/astro) and the 0° terminator line.
   */
  function buildTerminatorGeoJson(dateInput) {
    const subsolar = computeSubsolarPoint(dateInput);
    // Avoid zero-declination ambiguity on exact equinox instant while staying within <0.25°
    const safeSub = Math.abs(subsolar.lat) < 0.25
      ? Object.assign({}, subsolar, { lat: subsolar.lat >= 0 ? 0.25 : -0.25 })
      : subsolar;

    const termCoords = [];
    for (let lng = -180; lng <= 180; lng += 2) {
      termCoords.push([lng, findBandBoundaryLat(lng, safeSub, 0)]);
    }

    const civilRing = buildNightBandRing(safeSub, 0);
    const nauticalRing = buildNightBandRing(safeSub, -6);
    const astroRing = buildNightBandRing(safeSub, -12);

    return {
      subsolar,
      terminatorLine: {
        type: 'FeatureCollection',
        features: [
          {
            type: 'Feature',
            properties: { kind: 'terminator' },
            geometry: { type: 'LineString', coordinates: termCoords }
          }
        ]
      },
      nightPolygons: {
        type: 'FeatureCollection',
        features: [
          {
            type: 'Feature',
            properties: { band: 'civil', opacity: 0.22 },
            geometry: { type: 'Polygon', coordinates: [civilRing] }
          },
          {
            type: 'Feature',
            properties: { band: 'nautical', opacity: 0.26 },
            geometry: { type: 'Polygon', coordinates: [nauticalRing] }
          },
          {
            type: 'Feature',
            properties: { band: 'astro', opacity: 0.34 },
            geometry: { type: 'Polygon', coordinates: [astroRing] }
          }
        ]
      }
    };
  }

  function findAnchorLayerId(map) {
    if (!map || typeof map.getLayer !== 'function') return undefined;
    if (map.getLayer('layer-v4-blackmarble')) return 'atlas-glow';
    if (map.getLayer('atlas-glow')) return 'atlas-glow';
    if (map.getLayer('layer-labels')) return 'layer-labels';
    return undefined;
  }

  function applySunLight(map, subsolar) {
    if (!map || typeof map.setLight !== 'function') return;
    try {
      const center = typeof map.getCenter === 'function' ? map.getCenter() : { lng: 0, lat: 0 };
      const dLng = ((subsolar.lng - center.lng + 540) % 360) - 180;
      const dLat = subsolar.lat - center.lat;
      const az = ((Math.atan2(dLng, dLat) * RAD2DEG) + 360) % 360;
      map.setLight({
        anchor: 'viewport',
        color: '#FFF4DC',
        intensity: 0.38,
        position: [1.35, Math.round(az), 48]
      });
    } catch (e) {
      // ignore if style lacks 3D light
    }
  }

  function applyToMap(map, dateInput) {
    if (!map || !map.isStyleLoaded || !map.isStyleLoaded()) return null;
    const dt = dateInput || (state.liveMode ? new Date() : state.customDate || new Date());
    const data = buildTerminatorGeoJson(dt);
    const beforeId = findAnchorLayerId(map);

    if (!map.getSource('v4-daynight-src')) {
      map.addSource('v4-daynight-src', { type: 'geojson', data: data.nightPolygons });
    } else {
      map.getSource('v4-daynight-src').setData(data.nightPolygons);
    }

    if (!map.getSource('v4-terminator-line-src')) {
      map.addSource('v4-terminator-line-src', { type: 'geojson', data: data.terminatorLine });
    } else {
      map.getSource('v4-terminator-line-src').setData(data.terminatorLine);
    }

    if (!map.getLayer('layer-v4-daynight-fill')) {
      map.addLayer(
        {
          id: 'layer-v4-daynight-fill',
          type: 'fill',
          source: 'v4-daynight-src',
          paint: {
            'fill-color': [
              'match',
              ['get', 'band'],
              'civil', 'rgba(8, 16, 40, 0.24)',
              'nautical', 'rgba(4, 10, 28, 0.26)',
              'astro', 'rgba(2, 6, 18, 0.34)',
              'rgba(4, 10, 28, 0.25)'
            ],
            'fill-opacity': 0.92
          }
        },
        beforeId
      );
    }

    if (!map.getLayer('layer-v4-terminator-glow')) {
      map.addLayer(
        {
          id: 'layer-v4-terminator-glow',
          type: 'line',
          source: 'v4-terminator-line-src',
          paint: {
            'line-color': '#F59E0B',
            'line-width': 7,
            'line-blur': 6,
            'line-opacity': 0.42
          }
        },
        beforeId
      );
    }

    if (!map.getLayer('layer-v4-terminator-core')) {
      map.addLayer(
        {
          id: 'layer-v4-terminator-core',
          type: 'line',
          source: 'v4-terminator-line-src',
          paint: {
            'line-color': '#FDE68A',
            'line-width': 1.4,
            'line-opacity': 0.78
          }
        },
        beforeId
      );
    }

    applySunLight(map, data.subsolar);
    renderStatusPill(map, data.subsolar, dt);
    return data;
  }

  function removeFromMap(map) {
    if (!map) return;
    ['layer-v4-terminator-core', 'layer-v4-terminator-glow', 'layer-v4-daynight-fill'].forEach((id) => {
      if (map.getLayer(id)) map.removeLayer(id);
    });
    ['v4-terminator-line-src', 'v4-daynight-src'].forEach((id) => {
      if (map.getSource(id)) map.removeSource(id);
    });
  }

  function syncButtonUI() {
    if (typeof document === 'undefined') return;
    const btn = document.getElementById('toggle-daynight-btn');
    if (btn) btn.classList.toggle('active', state.enabled);
  }

  function renderStatusPill(map, subsolar, dt) {
    if (typeof document === 'undefined') return;
    const pill = document.getElementById('daynight-status-pill');
    if (!pill) return;
    if (!state.enabled || !subsolar) {
      pill.classList.add('is-hidden');
      pill.innerHTML = '';
      return;
    }

    const utcMin = dt.getUTCHours() * 60 + dt.getUTCMinutes();
    const utcStr = `${String(dt.getUTCHours()).padStart(2, '0')}:${String(dt.getUTCMinutes()).padStart(2, '0')} UTC`;
    const latStr = `${Math.abs(subsolar.lat).toFixed(1)}°${subsolar.lat >= 0 ? 'N' : 'S'}`;
    const lngStr = `${Math.abs(subsolar.lng).toFixed(1)}°${subsolar.lng >= 0 ? 'E' : 'W'}`;
    const lang = global.AppI18n ? global.AppI18n.getLang() : 'zh-CN';
    const liveLbl = lang === 'en' ? 'Live' : '此刻';
    const headLbl = lang === 'en' ? 'Solar Subpoint' : '太阳直射点';

    pill.classList.remove('is-hidden');
    pill.innerHTML = `
      <span class="dn-dot"></span>
      <span class="dn-meta"><strong>${esc(headLbl)}</strong> <span class="mono-num">${esc(latStr)}, ${esc(lngStr)}</span></span>
      <input id="dn-utc-slider" class="dn-utc-slider" type="range" min="0" max="1435" step="5" value="${utcMin}" aria-label="UTC Time" />
      <span class="mono-num dn-utc-val">${esc(utcStr)}</span>
      <button id="dn-live-btn" class="dn-mini-btn ${state.liveMode ? 'active' : ''}" type="button">${esc(liveLbl)}</button>
      <button id="dn-close-btn" class="aurora-pill-close" type="button" aria-label="Close">×</button>
    `;

    const slider = pill.querySelector('#dn-utc-slider');
    if (slider) {
      slider.addEventListener('input', (e) => {
        state.liveMode = false;
        const mins = Number(e.target.value) || 0;
        const base = state.customDate ? new Date(state.customDate.getTime()) : new Date();
        base.setUTCHours(Math.floor(mins / 60), mins % 60, 0, 0);
        state.customDate = base;
        applyToMap(map, base);
      });
    }
    const liveBtn = pill.querySelector('#dn-live-btn');
    if (liveBtn) {
      liveBtn.addEventListener('click', () => {
        state.liveMode = true;
        state.customDate = null;
        applyToMap(map, new Date());
      });
    }
    const closeBtn = pill.querySelector('#dn-close-btn');
    if (closeBtn) {
      closeBtn.addEventListener('click', () => toggle(map, false));
    }
  }

  function toggle(map, forceState, opts) {
    const next = typeof forceState === 'boolean' ? forceState : !state.enabled;
    state.enabled = next;
    if (state.timerId) {
      clearInterval(state.timerId);
      state.timerId = 0;
    }

    if (!next) {
      if (map) removeFromMap(map);
      renderStatusPill(map, null, null);
      syncButtonUI();
      return false;
    }

    if (opts && opts.date instanceof Date) {
      state.liveMode = false;
      state.customDate = opts.date;
    }

    if (map && map.isStyleLoaded && map.isStyleLoaded()) {
      applyToMap(map);
      if (global.Terrain3DModule && !(opts && opts.skipNightLights)) {
        global.Terrain3DModule.toggleNightLights(map, true);
      }
    }

    state.timerId = setInterval(() => {
      if (!state.enabled || !state.liveMode) return;
      const m = typeof global.getGlobeMap === 'function' ? global.getGlobeMap() : map;
      if (m && m.isStyleLoaded && m.isStyleLoaded()) {
        applyToMap(m, new Date());
      }
    }, 300000);

    syncButtonUI();
    return true;
  }

  function reapplyAfterStyleLoad(map) {
    if (!state.enabled || !map) return;
    applyToMap(map);
  }

  return {
    computeSubsolarPoint,
    buildTerminatorGeoJson,
    toggle,
    applyToMap,
    reapplyAfterStyleLoad,
    isEnabled: () => state.enabled,
    getState: () => Object.assign({}, state)
  };
});
