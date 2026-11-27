(function (global) {
  'use strict';

  const DEG2RAD = Math.PI / 180;
  const SENSOR_PRESETS = {
    fullFrame: { id: 'fullFrame', label: '全画幅 35mm', w: 36.0, h: 24.0, aspect: '3:2' },
    apsc: { id: 'apsc', label: 'APS-C (1.5×)', w: 23.5, h: 15.6, aspect: '3:2' },
    m43: { id: 'm43', label: 'M4/3 (2.0×)', w: 17.3, h: 13.0, aspect: '4:3' },
    medium: { id: 'medium', label: '中画幅 44×33', w: 43.8, h: 32.9, aspect: '4:3' },
    custom: { id: 'custom', label: '自定义', w: 36.0, h: 24.0, aspect: '3:2' }
  };
  const FOCAL_PRESETS = [14, 24, 35, 50, 85, 135, 200];
  const horizonCache = new Map();

  let state = {
    destId: null,
    spotIdx: -1,
    dateStr: new Date().toISOString().slice(0, 10),
    minutes: new Date().getHours() * 60 + new Date().getMinutes(),
    cameraAzimuth: 180,
    showOnGlobe: true,
    sensorKey: 'fullFrame',
    focalMm: 24,
    customW: 36.0,
    customH: 24.0
  };

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

  function fmtTime(dt) {
    if (!(dt instanceof Date) || Number.isNaN(dt.getTime())) return '极昼/极夜';
    const hh = String(dt.getHours()).padStart(2, '0');
    const mm = String(dt.getMinutes()).padStart(2, '0');
    return `${hh}:${mm}`;
  }

  function compassDirName(deg) {
    const dirs = ['N 北', 'NE 东北', 'E 东', 'SE 东南', 'S 南', 'SW 西南', 'W 西', 'NW 西北'];
    const idx = Math.round(((deg % 360) + 360) % 360 / 45) % 8;
    return dirs[idx];
  }

  function classifyLightAngle(sunAz, camAz, sunAlt) {
    if (sunAlt < -6) return { label: '天文暗夜 / 星空窗口', badge: '夜间' };
    if (sunAlt < 0) return { label: '曙暮光 / 蓝调时刻', badge: '蓝调' };
    const diff = Math.abs((((sunAz - camAz) % 360) + 540) % 360 - 180);
    if (diff <= 28) return { label: '正逆光 · 剪影/轮廓光绝佳 (注意眩光)', badge: '逆光' };
    if (diff <= 65) return { label: '侧逆光 · 立体质感与水面反光强', badge: '侧逆光' };
    if (diff <= 115) return { label: '90° 侧光 · 建筑与山体明暗对比强烈', badge: '侧光' };
    if (diff <= 152) return { label: '侧顺光 · 色彩饱和且保留层次', badge: '侧顺光' };
    return { label: '正顺光 · 色彩通透还原度高', badge: '顺光' };
  }

  function moonPhaseLabel(phase) {
    if (phase < 0.04 || phase >= 0.96) return '新月 New Moon (适合拍银河)';
    if (phase < 0.22) return '蛾眉月 Waxing Crescent';
    if (phase < 0.28) return '上弦月 First Quarter';
    if (phase < 0.47) return '盈凸月 Waxing Gibbous';
    if (phase < 0.53) return '满月 Full Moon (月光强烈)';
    if (phase < 0.72) return '亏凸月 Waning Gibbous';
    if (phase < 0.78) return '下弦月 Last Quarter';
    return '残月 Waning Crescent';
  }

  /**
   * Compute exact rectilinear camera FOV angles from focal length & sensor size.
   */
  function computeLensFov(focalMm, sensorKey, customSensor) {
    const preset = SENSOR_PRESETS[sensorKey] || SENSOR_PRESETS.fullFrame;
    const w = sensorKey === 'custom' && customSensor && Number(customSensor.w) > 1
      ? Number(customSensor.w)
      : preset.w;
    const h = sensorKey === 'custom' && customSensor && Number(customSensor.h) > 1
      ? Number(customSensor.h)
      : preset.h;
    const f = Math.max(4, Math.min(1200, Number(focalMm) || 24));
    const diag = Math.hypot(w, h);
    const ffDiag = Math.hypot(36, 24);
    const cropFactor = Number((ffDiag / diag).toFixed(2));
    const hFov = Number((2 * Math.atan(w / (2 * f)) * (180 / Math.PI)).toFixed(2));
    const vFov = Number((2 * Math.atan(h / (2 * f)) * (180 / Math.PI)).toFixed(2));
    const dFov = Number((2 * Math.atan(diag / (2 * f)) * (180 / Math.PI)).toFixed(2));
    return {
      sensorKey: preset.id,
      sensorLabel: preset.label,
      sensorW: w,
      sensorH: h,
      aspect: preset.aspect,
      focalMm: f,
      eqFocalMm: Math.round(f * (ffDiag / diag)),
      cropFactor,
      hFov,
      vFov,
      dFov
    };
  }

  /**
   * Compute Astronomy Engine ephemeris extras: Galactic Center position,
   * astronomical night bounds (-18° sun altitude), and tonight's Milky Way window.
   */
  function computeAstronomyExtras(lat, lng, dateStr, minutes, astroRef) {
    const A = astroRef || global.Astronomy;
    if (!A || typeof A.Observer !== 'function' || typeof A.Horizon !== 'function') {
      return { available: false };
    }
    const [y, m, d] = String(dateStr || '').split('-').map(Number);
    const yr = y || 2026;
    const mo = (m || 6) - 1;
    const dy = d || 21;
    const hh = Math.floor((minutes || 0) / 60);
    const mm = (minutes || 0) % 60;
    const dt = new Date(yr, mo, dy, hh, mm, 0);
    const obs = new A.Observer(lat, lng, 0);

    // Galactic Center (Sagittarius A* J2000: RA 17.7611h, Dec -29.0078°)
    const gcNow = A.Horizon(dt, obs, 17.7611, -29.0078, 'normal');

    let astroDusk = null;
    let astroDawn = null;
    try {
      const noonLocal = new Date(yr, mo, dy, 12, 0, 0);
      const duskRes = A.SearchAltitude(A.Body.Sun, obs, -1, noonLocal, 1, -18);
      if (duskRes && duskRes.date) astroDusk = duskRes.date;
      const midnightLocal = new Date(yr, mo, dy, 23, 30, 0);
      const dawnRes = A.SearchAltitude(A.Body.Sun, obs, 1, midnightLocal, 1, -18);
      if (dawnRes && dawnRes.date) astroDawn = dawnRes.date;
    } catch (e) {
      // Polar day/night or search boundary
    }

    // Scan tonight (18:00 -> next day 06:00) in 20m steps for dark-sky Galactic Center window
    let bestStart = null;
    let bestEnd = null;
    let curStart = null;
    let peakAlt = -90;
    let peakAz = 0;

    for (let offsetMin = 18 * 60; offsetMin <= 30 * 60; offsetMin += 20) {
      const sampleDt = new Date(yr, mo, dy, Math.floor(offsetMin / 60), offsetMin % 60, 0);
      const eqSun = A.Equator(A.Body.Sun, sampleDt, obs, true, true);
      const sunH = A.Horizon(sampleDt, obs, eqSun.ra, eqSun.dec, 'normal');
      const gcH = A.Horizon(sampleDt, obs, 17.7611, -29.0078, 'normal');

      if (sunH.altitude <= -12 && gcH.altitude >= 10) {
        if (!curStart) curStart = sampleDt;
        if (!bestStart) bestStart = sampleDt;
        bestEnd = sampleDt;
        if (gcH.altitude > peakAlt) {
          peakAlt = gcH.altitude;
          peakAz = gcH.azimuth;
        }
      } else if (curStart && bestEnd) {
        break;
      }
    }

    return {
      available: true,
      gcAzimuth: Number(gcNow.azimuth.toFixed(1)),
      gcAltitude: Number(gcNow.altitude.toFixed(1)),
      astroDusk,
      astroDawn,
      mwWindowStart: bestStart,
      mwWindowEnd: bestEnd,
      mwPeakAlt: peakAlt > -90 ? Number(peakAlt.toFixed(1)) : null,
      mwPeakAz: peakAlt > -90 ? Number(peakAz.toFixed(1)) : null
    };
  }

  function destPoint(lng, lat, bearingDeg, distKm) {
    const R = 6371;
    const brng = bearingDeg * DEG2RAD;
    const lat1 = lat * DEG2RAD;
    const lon1 = lng * DEG2RAD;
    const dR = distKm / R;
    const lat2 = Math.asin(Math.sin(lat1) * Math.cos(dR) + Math.cos(lat1) * Math.sin(dR) * Math.cos(brng));
    const lon2 =
      lon1 +
      Math.atan2(
        Math.sin(brng) * Math.sin(dR) * Math.cos(lat1),
        Math.cos(dR) - Math.sin(lat1) * Math.sin(lat2)
      );
    return [(lon2 / DEG2RAD + 540) % 360 - 180, lat2 / DEG2RAD];
  }

  function computeSimulation(lat, lng, dateStr, minutes, cameraAzimuth) {
    if (!global.SunCalc) return null;
    const [y, m, d] = String(dateStr || '').split('-').map(Number);
    const hh = Math.floor(minutes / 60);
    const mm = minutes % 60;
    const dt = new Date(y || 2026, (m || 6) - 1, d || 21, hh, mm, 0);
    const noonDt = new Date(y || 2026, (m || 6) - 1, d || 21, 12, 0, 0);

    const times = global.SunCalc.getTimes(noonDt, lat, lng);
    const sunPos = global.SunCalc.getPosition(dt, lat, lng);
    const sunrisePos = times.sunrise instanceof Date && !Number.isNaN(times.sunrise.getTime())
      ? global.SunCalc.getPosition(times.sunrise, lat, lng)
      : null;
    const sunsetPos = times.sunset instanceof Date && !Number.isNaN(times.sunset.getTime())
      ? global.SunCalc.getPosition(times.sunset, lat, lng)
      : null;

    const moonPos = global.SunCalc.getMoonPosition(dt, lat, lng);
    const moonIllum = global.SunCalc.getMoonIllumination(dt);
    const moonTimes = global.SunCalc.getMoonTimes(noonDt, lat, lng);

    const curve = [];
    for (let h = 0; h <= 24; h += 0.5) {
      const mTotal = Math.min(1439, Math.round(h * 60));
      const cDt = new Date(y || 2026, (m || 6) - 1, d || 21, Math.floor(mTotal / 60), mTotal % 60, 0);
      const p = global.SunCalc.getPosition(cDt, lat, lng);
      curve.push({ h, alt: p.altitude, az: p.azimuth });
    }

    const lightRelation = classifyLightAngle(sunPos.azimuth, cameraAzimuth, sunPos.altitude);
    const astroExtras = computeAstronomyExtras(lat, lng, dateStr, minutes);

    return {
      dt,
      times,
      sunPos,
      sunrisePos,
      sunsetPos,
      moonPos,
      moonIllum,
      moonTimes,
      curve,
      lightRelation,
      astroExtras
    };
  }

  function buildCompassSvg(sim, cameraAzimuth, hFov) {
    const cx = 96;
    const cy = 96;
    const r = 74;
    const polar = (deg, rad) => {
      const a = (deg - 90) * DEG2RAD;
      return [cx + Math.cos(a) * rad, cy + Math.sin(a) * rad];
    };

    const halfFov = Math.max(4, Math.min(68, (Number(hFov) || 48) / 2));
    const fov1 = polar(cameraAzimuth - halfFov, r);
    const fov2 = polar(cameraAzimuth + halfFov, r);
    const largeArc = halfFov * 2 > 180 ? 1 : 0;
    const fovPath = `M ${cx} ${cy} L ${fov1[0].toFixed(1)} ${fov1[1].toFixed(1)} A ${r} ${r} 0 ${largeArc} 1 ${fov2[0].toFixed(1)} ${fov2[1].toFixed(1)} Z`;

    const [camX, camY] = polar(cameraAzimuth, r - 4);
    const [sunX, sunY] = polar(sim.sunPos.azimuth, r - 6);
    const [moonX, moonY] = polar(sim.moonPos.azimuth, r - 18);

    const gcDot = sim.astroExtras && sim.astroExtras.available
      ? (() => {
          const [gx, gy] = polar(sim.astroExtras.gcAzimuth, r - 24);
          return `<circle cx="${gx.toFixed(1)}" cy="${gy.toFixed(1)}" r="3.6" fill="#A78BFA" stroke="#09090B" stroke-width="1" />`;
        })()
      : '';

    const srLine = sim.sunrisePos
      ? (() => {
          const [x, y] = polar(sim.sunrisePos.azimuth, r);
          return `<line x1="${cx}" y1="${cy}" x2="${x.toFixed(1)}" y2="${y.toFixed(1)}" stroke="#FBBF24" stroke-width="1.6" stroke-dasharray="3 3" />`;
        })()
      : '';
    const ssLine = sim.sunsetPos
      ? (() => {
          const [x, y] = polar(sim.sunsetPos.azimuth, r);
          return `<line x1="${cx}" y1="${cy}" x2="${x.toFixed(1)}" y2="${y.toFixed(1)}" stroke="#FB7185" stroke-width="1.6" stroke-dasharray="3 3" />`;
        })()
      : '';

    return `
      <svg width="192" height="192" viewBox="0 0 192 192" aria-label="太阳方位与机位朝向罗盘">
        <circle cx="${cx}" cy="${cy}" r="${r}" fill="rgba(255,255,255,0.03)" stroke="rgba(255,255,255,0.16)" stroke-width="1" />
        <circle cx="${cx}" cy="${cy}" r="${r * 0.55}" fill="none" stroke="rgba(255,255,255,0.08)" stroke-dasharray="2 3" />
        <path d="${fovPath}" fill="rgba(56,189,248,0.20)" stroke="rgba(56,189,248,0.68)" stroke-width="1" />
        ${srLine}
        ${ssLine}
        <line x1="${cx}" y1="${cy}" x2="${camX.toFixed(1)}" y2="${camY.toFixed(1)}" stroke="#38BDF8" stroke-width="2" />
        <line x1="${cx}" y1="${cy}" x2="${sunX.toFixed(1)}" y2="${sunY.toFixed(1)}" stroke="#F59E0B" stroke-width="2.4" />
        <circle cx="${sunX.toFixed(1)}" cy="${sunY.toFixed(1)}" r="6" fill="${sim.sunPos.altitude >= 0 ? '#FBBF24' : '#71717A'}" stroke="#09090B" stroke-width="1.5" />
        <circle cx="${moonX.toFixed(1)}" cy="${moonY.toFixed(1)}" r="4.5" fill="#E2E8F0" stroke="#09090B" stroke-width="1" />
        ${gcDot}
        <text x="${cx}" y="14" text-anchor="middle" fill="#A1A1AA" font-size="10">N 0°</text>
        <text x="180" y="${cy + 3}" text-anchor="middle" fill="#A1A1AA" font-size="10">E</text>
        <text x="${cx}" y="185" text-anchor="middle" fill="#A1A1AA" font-size="10">S</text>
        <text x="12" y="${cy + 3}" text-anchor="middle" fill="#A1A1AA" font-size="10">W</text>
      </svg>
    `;
  }

  function buildCurveSvg(sim, curMinutes) {
    const w = 310;
    const h = 84;
    const midY = 52;
    const pts = sim.curve
      .map((p) => {
        const x = (p.h / 24) * w;
        const y = midY - (p.alt / 90) * 42;
        return `${x.toFixed(1)},${y.toFixed(1)}`;
      })
      .join(' ');
    const curX = ((curMinutes / 60) / 24) * w;
    const curY = midY - (sim.sunPos.altitude / 90) * 42;

    return `
      <svg width="100%" height="${h}" viewBox="0 0 ${w} ${h}" style="display:block;width:100%;height:${h}px;margin-top:6px;" aria-label="24小时太阳高度角曲线">
        <rect x="0" y="${midY}" width="${w}" height="${h - midY}" fill="rgba(15,23,42,0.28)" />
        <line x1="0" y1="${midY}" x2="${w}" y2="${midY}" stroke="rgba(255,255,255,0.2)" stroke-width="1" />
        <polyline fill="none" stroke="#FBBF24" stroke-width="1.8" points="${pts}" />
        <line x1="${curX.toFixed(1)}" y1="4" x2="${curX.toFixed(1)}" y2="${h - 4}" stroke="#38BDF8" stroke-width="1" stroke-dasharray="2 2" />
        <circle cx="${curX.toFixed(1)}" cy="${curY.toFixed(1)}" r="4" fill="#FBBF24" stroke="#09090B" stroke-width="1.2" />
        <text x="4" y="12" fill="#A1A1AA" font-size="9">+90°</text>
        <text x="4" y="${midY - 3}" fill="#A1A1AA" font-size="9">地平线 0°</text>
        <text x="${w - 34}" y="${h - 4}" fill="#A1A1AA" font-size="9">24:00</text>
      </svg>
    `;
  }

  function buildHorizonProfileSvg(profile, camAz) {
    if (!Array.isArray(profile) || !profile.length) return '';
    const w = 310;
    const h = 68;
    const baseY = 58;
    const maxScaleDeg = Math.max(15, Math.min(45, Math.max(...profile.map((p) => p.maxAngleDeg)) + 4));
    const pts = profile.map((p) => {
      const x = (p.az / 360) * w;
      const y = baseY - (Math.max(0, p.maxAngleDeg) / maxScaleDeg) * 46;
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    });
    const poly = `0,${baseY} ${pts.join(' ')} ${w},${baseY}`;
    const camX = (((camAz % 360) + 360) % 360) / 360 * w;
    return `
      <svg width="100%" height="${h}" viewBox="0 0 ${w} ${h}" style="display:block;width:100%;height:${h}px;margin-top:6px;" aria-label="360度真实地形地平线遮挡剖面">
        <polygon points="${poly}" fill="rgba(226,192,125,0.22)" stroke="#E2C07D" stroke-width="1.4" />
        <line x1="${camX.toFixed(1)}" y1="6" x2="${camX.toFixed(1)}" y2="${baseY}" stroke="#38BDF8" stroke-width="1.2" stroke-dasharray="2 2" />
        <text x="4" y="13" fill="#A1A1AA" font-size="9">+${Math.round(maxScaleDeg)}°</text>
        <text x="4" y="${h - 2}" fill="#A1A1AA" font-size="8.5">N</text>
        <text x="${w * 0.25 - 4}" y="${h - 2}" fill="#A1A1AA" font-size="8.5">E</text>
        <text x="${w * 0.5 - 4}" y="${h - 2}" fill="#A1A1AA" font-size="8.5">S</text>
        <text x="${w * 0.75 - 4}" y="${h - 2}" fill="#A1A1AA" font-size="8.5">W</text>
        <text x="${w - 10}" y="${h - 2}" fill="#A1A1AA" font-size="8.5">N</text>
      </svg>
    `;
  }

  function updateGlobeOverlay(coords, sim, cameraAzimuth, hFov) {
    const map = typeof global.getGlobeMap === 'function' ? global.getGlobeMap() : null;
    if (!map || !map.isStyleLoaded()) return;

    if (!state.showOnGlobe || !coords || !sim) {
      clearGlobeOverlay(map);
      return;
    }

    const [lng, lat] = coords;
    const rayDistKm = 4.5;
    const features = [];

    if (sim.sunrisePos) {
      features.push({
        type: 'Feature',
        properties: { kind: 'sunrise', color: '#FBBF24' },
        geometry: { type: 'LineString', coordinates: [[lng, lat], destPoint(lng, lat, sim.sunrisePos.azimuth, rayDistKm)] }
      });
    }
    if (sim.sunsetPos) {
      features.push({
        type: 'Feature',
        properties: { kind: 'sunset', color: '#FB7185' },
        geometry: { type: 'LineString', coordinates: [[lng, lat], destPoint(lng, lat, sim.sunsetPos.azimuth, rayDistKm)] }
      });
    }
    features.push({
      type: 'Feature',
      properties: { kind: 'sun', color: '#F59E0B' },
      geometry: { type: 'LineString', coordinates: [[lng, lat], destPoint(lng, lat, sim.sunPos.azimuth, rayDistKm * 1.15)] }
    });

    const halfFov = Math.max(4, Math.min(68, (Number(hFov) || 48) / 2));
    const fovPoly = [[lng, lat]];
    const step = Math.max(2, halfFov / 4);
    for (let a = -halfFov; a <= halfFov + 0.01; a += step) {
      fovPoly.push(destPoint(lng, lat, cameraAzimuth + a, rayDistKm * 0.85));
    }
    fovPoly.push([lng, lat]);

    const lineFc = { type: 'FeatureCollection', features };
    const fovFc = {
      type: 'FeatureCollection',
      features: [{ type: 'Feature', geometry: { type: 'Polygon', coordinates: [fovPoly] } }]
    };

    if (!map.getSource('sun-rays-src')) {
      map.addSource('sun-rays-src', { type: 'geojson', data: lineFc });
      map.addSource('sun-fov-src', { type: 'geojson', data: fovFc });
      map.addLayer({
        id: 'sun-fov-fill',
        type: 'fill',
        source: 'sun-fov-src',
        paint: { 'fill-color': '#38BDF8', 'fill-opacity': 0.18 }
      });
      map.addLayer({
        id: 'sun-rays-layer',
        type: 'line',
        source: 'sun-rays-src',
        paint: {
          'line-color': ['get', 'color'],
          'line-width': ['case', ['==', ['get', 'kind'], 'sun'], 3, 2],
          'line-opacity': 0.92
        }
      });
    } else {
      map.getSource('sun-rays-src').setData(lineFc);
      map.getSource('sun-fov-src').setData(fovFc);
    }
  }

  function clearGlobeOverlay(map) {
    const m = map || (typeof global.getGlobeMap === 'function' ? global.getGlobeMap() : null);
    if (!m) return;
    if (m.getLayer('sun-rays-layer')) m.removeLayer('sun-rays-layer');
    if (m.getLayer('sun-fov-fill')) m.removeLayer('sun-fov-fill');
    if (m.getSource('sun-rays-src')) m.removeSource('sun-rays-src');
    if (m.getSource('sun-fov-src')) m.removeSource('sun-fov-src');
  }

  async function mount(dest, containerEl, preferredSpotIdx) {
    if (!dest || !containerEl) return;
    if (state.destId !== dest.id) {
      state.destId = dest.id;
      state.spotIdx = typeof preferredSpotIdx === 'number' && preferredSpotIdx >= 0 ? preferredSpotIdx : 0;
    } else if (typeof preferredSpotIdx === 'number' && preferredSpotIdx >= 0) {
      state.spotIdx = preferredSpotIdx;
    }

    const spots = Array.isArray(dest.spots) ? dest.spots : [];
    const activeSpot = spots[state.spotIdx] || null;
    const coords = (activeSpot && activeSpot.coords) || dest.coords;
    if (!Array.isArray(coords) || coords.length < 2) return;

    const lensFov = computeLensFov(state.focalMm, state.sensorKey, { w: state.customW, h: state.customH });
    const sim = computeSimulation(coords[1], coords[0], state.dateStr, state.minutes, state.cameraAzimuth);
    if (!sim) {
      containerEl.innerHTML = `<div class="sim-card">SunCalc 天文库未就绪。</div>`;
      return;
    }

    const timeText = `${String(Math.floor(state.minutes / 60)).padStart(2, '0')}:${String(state.minutes % 60).padStart(2, '0')}`;
    const targetOptions = [
      `<option value="-1" ${state.spotIdx < 0 ? 'selected' : ''}>城市中心 · ${esc(dest.shortName || dest.name)}</option>`,
      ...spots.map((s, idx) => `<option value="${idx}" ${state.spotIdx === idx ? 'selected' : ''}>机位 ${idx + 1} · ${esc(s.name)}</option>`)
    ].join('');

    const sensorOptions = Object.values(SENSOR_PRESETS)
      .map((s) => `<option value="${s.id}" ${state.sensorKey === s.id ? 'selected' : ''}>${esc(s.label)}</option>`)
      .join('');

    const astro = sim.astroExtras;
    const mwCardHtml = astro && astro.available
      ? `
        <div class="sim-card">
          <div style="display:flex;justify-content:space-between;align-items:center;gap:6px;flex-wrap:wrap;">
            <strong>${icon('sparkles', 14)} 星空与银河摄影窗口</strong>
            <span class="source-tag astronomy">Astronomy Engine</span>
          </div>
          <div style="font-size:11.5px;line-height:1.65;margin-top:6px;">
            <div>银河核心 (Sgr A*)：方位 <strong class="mono-num">${astro.gcAzimuth}°</strong> (${compassDirName(astro.gcAzimuth)}) · 高度 <strong class="mono-num">${astro.gcAltitude}°</strong></div>
            <div>天文黑夜 (-18°)：<strong class="mono-num">${fmtTime(astro.astroDusk)}</strong> — <strong class="mono-num">${fmtTime(astro.astroDawn)}</strong></div>
            <div>今晚银心可拍窗口：${
              astro.mwWindowStart && astro.mwWindowEnd
                ? `<strong class="mono-num">${fmtTime(astro.mwWindowStart)}–${fmtTime(astro.mwWindowEnd)}</strong> (最高仰角 <span class="mono-num">${astro.mwPeakAlt}°</span> @ ${astro.mwPeakAz}°)`
                : '<span style="color:var(--text-secondary);">当晚银心高度偏低或极昼无天文黑夜</span>'
            }</div>
            <div style="color:var(--text-secondary);">月光干扰参考：照明度 <span class="mono-num">${Math.round(sim.moonIllum.fraction * 100)}%</span> (${sim.moonIllum.fraction < 0.25 ? '弱光极佳' : sim.moonIllum.fraction < 0.65 ? '中等干扰' : '强月光明显'})</div>
          </div>
          <div style="display:flex;gap:6px;flex-wrap:wrap;margin-top:8px;">
            <button class="mini-action-pill" id="sim-toggle-blackmarble" type="button">${icon('moon', 12)} 暗夜灯光图层</button>
            <button class="mini-action-pill" id="sim-toggle-aurora" type="button">${icon('aurora', 12)} 实时极光带</button>
          </div>
        </div>
      `
      : '';

    containerEl.innerHTML = `
      <div class="sim-card">
        <div style="display:flex;justify-content:space-between;align-items:center;gap:6px;flex-wrap:wrap;">
          <strong>${icon('sunrise', 14)} 专业摄影机位光影模拟器</strong>
          <span class="source-tag astronomy">天文计算 · SunCalc</span>
        </div>

        <div style="margin-top:8px;display:flex;gap:6px;align-items:center;flex-wrap:wrap;">
          <select class="sim-input" id="sim-spot-select" style="flex:1;min-width:140px;" aria-label="选择模拟机位">${targetOptions}</select>
          <button class="mini-action-pill sim-vf-launch" id="sim-open-viewfinder-btn" type="button">
            ${icon('camera', 12)} 3D 取景器
          </button>
        </div>

        <div class="sim-controls-row">
          <input class="sim-input mono-num" id="sim-date-input" type="date" value="${esc(state.dateStr)}" aria-label="模拟日期" />
          <div style="display:flex;align-items:center;gap:6px;">
            <span class="mono-num" style="font-size:12px;min-width:44px;">${timeText}</span>
            <input id="sim-time-range" type="range" min="0" max="1439" step="5" value="${state.minutes}" style="flex:1;" aria-label="模拟时刻" />
          </div>
        </div>

        <div class="sim-presets">
          <button class="mini-action-pill sim-preset-btn" data-preset="now" type="button">此刻</button>
          <button class="mini-action-pill sim-preset-btn" data-preset="dawn" type="button">蓝调晨</button>
          <button class="mini-action-pill sim-preset-btn" data-preset="sunrise" type="button">日出</button>
          <button class="mini-action-pill sim-preset-btn" data-preset="goldenM" type="button">黄金晨</button>
          <button class="mini-action-pill sim-preset-btn" data-preset="goldenE" type="button">黄金昏</button>
          <button class="mini-action-pill sim-preset-btn" data-preset="sunset" type="button">日落</button>
          <button class="mini-action-pill sim-preset-btn" data-preset="dusk" type="button">蓝调昏</button>
        </div>

        <div class="sim-lens-bar">
          <div style="display:flex;gap:6px;align-items:center;flex-wrap:wrap;justify-content:space-between;">
            <select class="sim-input" id="sim-sensor-select" style="width:auto;min-width:128px;height:28px;font-size:11.5px;" aria-label="传感器画幅">${sensorOptions}</select>
            <span class="mono-num" style="font-size:11px;color:var(--text-secondary);">
              视角 ${lensFov.hFov.toFixed(1)}°×${lensFov.vFov.toFixed(1)}° · 等效 ${lensFov.eqFocalMm}mm
            </span>
          </div>
          <div class="sim-focal-pills">
            ${FOCAL_PRESETS.map((f) => `<button class="mini-action-pill sim-focal-btn ${state.focalMm === f ? 'active' : ''}" data-focal="${f}" type="button">${f}mm</button>`).join('')}
          </div>
        </div>

        <div class="sim-compass-wrap">
          ${buildCompassSvg(sim, state.cameraAzimuth, lensFov.hFov)}
          <div style="flex:1;min-width:155px;font-size:11.5px;line-height:1.6;">
            <div>太阳方位：<strong class="mono-num">${sim.sunPos.azimuth.toFixed(1)}°</strong> (${compassDirName(sim.sunPos.azimuth)})</div>
            <div>太阳高度：<strong class="mono-num">${sim.sunPos.altitude.toFixed(1)}°</strong></div>
            <div>机位朝向：<strong class="mono-num">${state.cameraAzimuth}°</strong> (${compassDirName(state.cameraAzimuth)})</div>
            <div style="margin-top:4px;"><span class="source-tag astronomy">${esc(sim.lightRelation.badge)}</span> ${esc(sim.lightRelation.label)}</div>
          </div>
        </div>

        <div style="margin-top:6px;">
          <div style="display:flex;justify-content:space-between;align-items:center;font-size:11.5px;">
            <span>调整机位拍摄朝向：<strong class="mono-num">${state.cameraAzimuth}°</strong></span>
            <div style="display:flex;gap:6px;">
              <button class="mini-action-pill" id="sim-align-cam-btn" type="button">同步地球视角</button>
              <label style="display:inline-flex;align-items:center;gap:4px;cursor:pointer;">
                <input id="sim-globe-toggle" type="checkbox" ${state.showOnGlobe ? 'checked' : ''} /> 地球射线
              </label>
            </div>
          </div>
          <input id="sim-azimuth-range" type="range" min="0" max="359" value="${state.cameraAzimuth}" style="width:100%;margin-top:4px;" />
        </div>

        ${buildCurveSvg(sim, state.minutes)}

        <div class="sim-times-grid">
          <div class="sim-time-cell"><span>🌅 蓝调晨 (Dawn)</span><strong class="mono-num">${fmtTime(sim.times.dawn)}</strong></div>
          <div class="sim-time-cell"><span>☀️ 日出 (${sim.sunrisePos ? `${sim.sunrisePos.azimuth.toFixed(0)}°` : '--'})</span><strong class="mono-num">${fmtTime(sim.times.sunrise)}</strong></div>
          <div class="sim-time-cell"><span>✨ 黄金晨结束</span><strong class="mono-num">${fmtTime(sim.times.goldenHourEnd)}</strong></div>
          <div class="sim-time-cell"><span>✨ 黄金昏开始</span><strong class="mono-num">${fmtTime(sim.times.goldenHour)}</strong></div>
          <div class="sim-time-cell"><span>🌇 日落 (${sim.sunsetPos ? `${sim.sunsetPos.azimuth.toFixed(0)}°` : '--'})</span><strong class="mono-num">${fmtTime(sim.times.sunset)}</strong></div>
          <div class="sim-time-cell"><span>🌆 蓝调昏 (Dusk)</span><strong class="mono-num">${fmtTime(sim.times.dusk)}</strong></div>
        </div>

        <div style="margin-top:10px;padding-top:8px;border-top:1px solid var(--border-hairline);font-size:11.5px;">
          <div>🌙 <strong>月相与月出月落</strong>：${esc(moonPhaseLabel(sim.moonIllum.phase))} · 照明度 <span class="mono-num">${Math.round(sim.moonIllum.fraction * 100)}%</span></div>
          <div style="color:var(--text-secondary);margin-top:2px;">
            月出：<span class="mono-num">${fmtTime(sim.moonTimes.rise)}</span> · 月落：<span class="mono-num">${fmtTime(sim.moonTimes.set)}</span> · 月亮方位 <span class="mono-num">${sim.moonPos.azimuth.toFixed(0)}°</span> / 高度 <span class="mono-num">${sim.moonPos.altitude.toFixed(1)}°</span>
          </div>
        </div>
      </div>

      <div class="sim-card" id="sim-terrain-box">
        <div style="display:flex;justify-content:space-between;align-items:center;gap:6px;flex-wrap:wrap;">
          <strong>${icon('mountain', 14)} 真实地形遮挡与日照金山推演</strong>
          <span class="source-tag astronomy">DEM 射线采样</span>
        </div>
        <div id="sim-terrain-status" style="font-size:11.5px;color:var(--text-secondary);margin-top:6px;">
          正在读取周边 AWS Terrarium DEM 高程瓦片计算 360° 山体遮挡…
        </div>
      </div>

      ${mwCardHtml}

      <div class="sim-card" id="sim-advice-box">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px;">
          <strong>拍摄窗口综合建议</strong>
          <span class="source-tag empirical">区分天文 / 预报 / 经验</span>
        </div>
        <div id="sim-wx-advice" style="font-size:11.5px;color:var(--text-secondary);margin-bottom:6px;">
          <span class="source-tag realtime">气象预报</span> 正在比对未来 7 日云量与降水预报…
        </div>
        ${
          activeSpot
            ? `<div style="font-size:11.5px;line-height:1.55;">
                <span class="source-tag empirical">经验建议 · 实地档案</span>
                <strong>${esc(activeSpot.bestTime || '')}</strong><br/>
                <span style="color:var(--text-secondary);">${esc(activeSpot.tips || '')}</span>
              </div>`
            : ''
        }
      </div>
    `;

    updateGlobeOverlay(coords, sim, state.cameraAzimuth, lensFov.hFov);

    const rerender = () => mount(dest, containerEl, state.spotIdx);

    containerEl.querySelector('#sim-spot-select').addEventListener('change', (e) => {
      state.spotIdx = Number(e.target.value);
      rerender();
    });
    containerEl.querySelector('#sim-date-input').addEventListener('change', (e) => {
      if (e.target.value) {
        state.dateStr = e.target.value;
        rerender();
      }
    });
    containerEl.querySelector('#sim-time-range').addEventListener('input', (e) => {
      state.minutes = Number(e.target.value);
      rerender();
    });
    containerEl.querySelector('#sim-azimuth-range').addEventListener('input', (e) => {
      state.cameraAzimuth = Number(e.target.value);
      rerender();
    });
    containerEl.querySelector('#sim-sensor-select').addEventListener('change', (e) => {
      state.sensorKey = e.target.value;
      rerender();
    });
    containerEl.querySelectorAll('.sim-focal-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        state.focalMm = Number(btn.dataset.focal) || 24;
        rerender();
      });
    });
    containerEl.querySelector('#sim-globe-toggle').addEventListener('change', (e) => {
      state.showOnGlobe = e.target.checked;
      updateGlobeOverlay(coords, sim, state.cameraAzimuth, lensFov.hFov);
    });
    containerEl.querySelector('#sim-align-cam-btn').addEventListener('click', () => {
      const m = typeof global.getGlobeMap === 'function' ? global.getGlobeMap() : null;
      if (m) {
        state.cameraAzimuth = Math.round(((m.getBearing() % 360) + 360) % 360);
        rerender();
      }
    });

    const vfBtn = containerEl.querySelector('#sim-open-viewfinder-btn');
    if (vfBtn) {
      vfBtn.addEventListener('click', () => {
        if (global.Viewfinder3D) {
          global.Viewfinder3D.open(dest, activeSpot, {
            spotIdx: state.spotIdx,
            dateStr: state.dateStr,
            minutes: state.minutes,
            bearing: state.cameraAzimuth,
            sensorKey: state.sensorKey,
            focalMm: state.focalMm
          });
        }
      });
    }

    const bmBtn = containerEl.querySelector('#sim-toggle-blackmarble');
    if (bmBtn) {
      bmBtn.addEventListener('click', () => {
        const m = typeof global.getGlobeMap === 'function' ? global.getGlobeMap() : null;
        if (m && global.Terrain3DModule) {
          const on = global.Terrain3DModule.toggleNightLights(m);
          bmBtn.classList.toggle('active', on);
        }
      });
    }
    const auBtn = containerEl.querySelector('#sim-toggle-aurora');
    if (auBtn) {
      auBtn.addEventListener('click', async () => {
        const m = typeof global.getGlobeMap === 'function' ? global.getGlobeMap() : null;
        if (m && global.Terrain3DModule) {
          const on = await global.Terrain3DModule.toggleAurora(m);
          auBtn.classList.toggle('active', on);
        }
      });
    }

    containerEl.querySelectorAll('.sim-preset-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        const p = btn.dataset.preset;
        const toMin = (dt) => (dt instanceof Date && !Number.isNaN(dt.getTime()) ? dt.getHours() * 60 + dt.getMinutes() : null);
        if (p === 'now') {
          const n = new Date();
          state.dateStr = n.toISOString().slice(0, 10);
          state.minutes = n.getHours() * 60 + n.getMinutes();
        } else if (p === 'dawn' && toMin(sim.times.dawn) !== null) state.minutes = toMin(sim.times.dawn);
        else if (p === 'sunrise' && toMin(sim.times.sunrise) !== null) state.minutes = toMin(sim.times.sunrise);
        else if (p === 'goldenM' && toMin(sim.times.goldenHourEnd) !== null) state.minutes = Math.max(0, toMin(sim.times.goldenHourEnd) - 25);
        else if (p === 'goldenE' && toMin(sim.times.goldenHour) !== null) state.minutes = toMin(sim.times.goldenHour) + 15;
        else if (p === 'sunset' && toMin(sim.times.sunset) !== null) state.minutes = toMin(sim.times.sunset);
        else if (p === 'dusk' && toMin(sim.times.dusk) !== null) state.minutes = toMin(sim.times.dusk);
        rerender();
      });
    });

    // Terrain Horizon Obstruction (cached per spot coordinate)
    const terrainEl = containerEl.querySelector('#sim-terrain-status');
    if (terrainEl && global.Terrain3DModule) {
      const hKey = `${coords[1].toFixed(4)},${coords[0].toFixed(4)}`;
      const renderHorizonResult = (hRes) => {
        if (!document.body.contains(terrainEl)) return;
        if (!hRes || !hRes.available) {
          terrainEl.innerHTML = `<span class="source-tag empirical">DEM 暂不可用</span> 无法获取高程瓦片（离线或受限），仅显示几何地平线日出日落。`;
          return;
        }
        const adj = global.Terrain3DModule.estimateTerrainAdjustedSunTimes(
          coords[1],
          coords[0],
          state.dateStr,
          hRes.profile,
          global.SunCalc
        );
        terrainEl.innerHTML = `
          <div>观测点高程 <strong class="mono-num">${hRes.observerElevation}m</strong> · 最大山脊仰角 <strong class="mono-num">${hRes.maxObstacleDeg}°</strong> · ${esc(hRes.demSource || 'Terrarium DEM')}</div>
          ${
            adj
              ? `<div style="margin-top:3px;">地形修正日出：<strong class="mono-num">${fmtTime(adj.adjSunrise)}</strong> (较几何晚 <span class="mono-num">+${adj.sunriseDelayMin}</span> 分钟) · 修正日落：<strong class="mono-num">${fmtTime(adj.adjSunset)}</strong> (提前 <span class="mono-num">-${adj.sunsetEarlyMin}</span> 分钟)</div>`
              : ''
          }
          ${buildHorizonProfileSvg(hRes.profile, state.cameraAzimuth)}
        `;
      };

      if (horizonCache.has(hKey)) {
        renderHorizonResult(horizonCache.get(hKey));
      } else {
        global.Terrain3DModule.computeTerrainHorizon(coords[1], coords[0])
          .then((hRes) => {
            if (hRes && hRes.available) horizonCache.set(hKey, hRes);
            renderHorizonResult(hRes);
          })
          .catch(() => renderHorizonResult(null));
      }
    }

    // Weather-aware advice when within 7-day Open-Meteo window
    const wxAdviceEl = containerEl.querySelector('#sim-wx-advice');
    if (wxAdviceEl && global.WeatherService) {
      try {
        const live = await global.WeatherService.fetchLiveWeather(coords[1], coords[0]);
        if (!document.body.contains(wxAdviceEl)) return;
        const hourly = live && live.hourly;
        const targetPrefix = `${state.dateStr}T${String(Math.floor(state.minutes / 60)).padStart(2, '0')}`;
        const idx = hourly && Array.isArray(hourly.time) ? hourly.time.findIndex((t) => t.startsWith(targetPrefix)) : -1;
        if (idx >= 0) {
          const cc = hourly.cloud_cover[idx];
          const pop = hourly.precipitation_probability[idx];
          let verdict = '光影条件良好，适合常规拍摄。';
          if (pop >= 55) verdict = '降水概率偏高，建议做好防雨或转向室内/雨景构图。';
          else if (cc >= 25 && cc <= 65) verdict = '中低云量适中，日出日落出现火烧云/层次光概率较高。';
          else if (cc < 25) verdict = '天空极通透，适合星空、清晰远景与强对比日光。';
          else verdict = '云层较厚，适合柔和漫射光、建筑摄影或长曝光。';
          wxAdviceEl.innerHTML = `<span class="source-tag realtime">Open-Meteo 预报</span> 选定时刻预报云量 <strong class="mono-num">${cc}%</strong> · 降水概率 <strong class="mono-num">${pop}%</strong> — ${esc(verdict)}`;
        } else {
          wxAdviceEl.innerHTML = `<span class="source-tag astronomy">天文计算</span> 所选日期超出 7 日实况预报窗口，请结合下方历史气候统计与经验时段安排机位。`;
        }
      } catch (e) {
        if (document.body.contains(wxAdviceEl)) {
          wxAdviceEl.innerHTML = `<span class="source-tag empirical">离线模式</span> 气象预报暂不可用，天文太阳/月相计算仍可离线精确运行。`;
        }
      }
    }
  }

  const api = {
    SENSOR_PRESETS,
    FOCAL_PRESETS,
    computeSimulation,
    classifyLightAngle,
    computeLensFov,
    computeAstronomyExtras,
    mount,
    clearGlobeOverlay
  };

  global.PhotoSimulator = api;
  if (typeof module === 'object' && module.exports) {
    module.exports = api;
  }
})(typeof window !== 'undefined' ? window : globalThis);
