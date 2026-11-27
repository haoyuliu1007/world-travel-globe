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
  const FOCAL_PRESETS = [14, 24, 35, 50, 85, 135, 200, 400];
  const ASPECT_RATIOS = ['native', '3:2', '4:3', '16:9', '1:1'];
  const horizonCache = new Map();
  const weatherCache = new Map();
  const WEATHER_TTL_MS = 900000;

  let state = {
    destId: null,
    spotIdx: -1,
    dateStr: new Date().toISOString().slice(0, 10),
    minutes: new Date().getHours() * 60 + new Date().getMinutes(),
    cameraAzimuth: 180,
    showOnGlobe: true,
    sensorKey: 'fullFrame',
    focalMm: 24,
    orientation: 'landscape',
    aspectOverride: 'native',
    observerHeightM: 1.6,
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

  function tx(str) {
    return global.AppI18n && typeof global.AppI18n.tx === 'function' ? global.AppI18n.tx(str) : (str || '');
  }

  function getSensorLabel(preset) {
    if (!preset) return '';
    const enMap = {
      fullFrame: 'Full Frame 35mm',
      apsc: 'APS-C (1.5×)',
      m43: 'M4/3 (2.0×)',
      medium: 'Medium Format 44×33',
      custom: 'Custom'
    };
    return L(preset.label, enMap[preset.id] || preset.label);
  }

  function estimateUtcOffsetMinutes(lng, weatherUtcOffsetSec) {
    if (Number.isFinite(Number(weatherUtcOffsetSec))) {
      return Math.round(Number(weatherUtcOffsetSec) / 60);
    }
    const clampedLng = Math.max(-180, Math.min(180, Number(lng) || 0));
    return Math.max(-720, Math.min(840, Math.round(clampedLng / 15) * 60));
  }

  function formatUtcOffset(offsetMin) {
    const m = Number(offsetMin) || 0;
    const sign = m >= 0 ? '+' : '-';
    const abs = Math.abs(m);
    const hrs = Math.floor(abs / 60);
    const rem = abs % 60;
    return rem ? `UTC${sign}${hrs}:${String(rem).padStart(2, '0')}` : `UTC${sign}${hrs}`;
  }

  function localWallTimeToUtcDate(dateStr, minutes, utcOffsetMin) {
    const parts = String(dateStr || '').split('-').map(Number);
    const yr = parts[0] || 2026;
    const mo = (parts[1] || 6) - 1;
    const dy = parts[2] || 21;
    const min = Number.isFinite(Number(minutes)) ? Number(minutes) : 720;
    const off = Number.isFinite(Number(utcOffsetMin)) ? Number(utcOffsetMin) : 0;
    return new Date(Date.UTC(yr, mo, dy, 0, min - off, 0));
  }

  function formatTimeInOffset(dt, utcOffsetMin) {
    if (!(dt instanceof Date) || Number.isNaN(dt.getTime())) return L('极昼/极夜', 'Polar Day/Night');
    const off = Number.isFinite(Number(utcOffsetMin)) ? Number(utcOffsetMin) : 0;
    const shifted = new Date(dt.getTime() + off * 60000);
    const hh = String(shifted.getUTCHours()).padStart(2, '0');
    const mm = String(shifted.getUTCMinutes()).padStart(2, '0');
    return `${hh}:${mm}`;
  }

  function fmtTime(dt, utcOffsetMin) {
    if (Number.isFinite(Number(utcOffsetMin))) {
      return formatTimeInOffset(dt, utcOffsetMin);
    }
    if (!(dt instanceof Date) || Number.isNaN(dt.getTime())) return L('极昼/极夜', 'Polar Day/Night');
    const hh = String(dt.getHours()).padStart(2, '0');
    const mm = String(dt.getMinutes()).padStart(2, '0');
    return `${hh}:${mm}`;
  }

  function compassDirName(deg) {
    const dirs = getLang() === 'en'
      ? ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW']
      : ['N 北', 'NE 东北', 'E 东', 'SE 东南', 'S 南', 'SW 西南', 'W 西', 'NW 西北'];
    const idx = Math.round(((deg % 360) + 360) % 360 / 45) % 8;
    return L(dirs[idx], dirs[idx]);
  }

  function classifyLightAngle(sunAz, camAz, sunAlt) {
    if (sunAlt < -6) return { label: L('天文暗夜 / 星空窗口', 'Astro Night / Star Window'), badge: L('夜间', 'Night') };
    if (sunAlt < 0) return { label: L('曙暮光 / 蓝调时刻', 'Twilight / Blue Hour'), badge: L('蓝调', 'Blue Hour') };
    const diff = Math.abs((((sunAz - camAz) % 360) + 540) % 360 - 180);
    if (diff <= 28) return { label: L('正逆光 · 剪影/轮廓光绝佳 (注意眩光)', 'Direct Backlight · Silhouettes & Rim Light (Watch Flare)'), badge: L('逆光', 'Backlight') };
    if (diff <= 65) return { label: L('侧逆光 · 立体质感与水面反光强', 'Side-Backlight · Dramatic Texture & Water Glint'), badge: L('侧逆光', 'Side-Back') };
    if (diff <= 115) return { label: L('90° 侧光 · 建筑与山体明暗对比强烈', '90° Side Light · Strong Relief & Shadow Contrast'), badge: L('侧光', 'Side Light') };
    if (diff <= 152) return { label: L('侧顺光 · 色彩饱和且保留层次', 'Side-Front Light · Rich Color & Balanced Depth'), badge: L('侧顺光', 'Side-Front') };
    return { label: L('正顺光 · 色彩通透还原度高', 'Front Light · Vivid True Color'), badge: L('顺光', 'Front Light') };
  }

  function moonPhaseLabel(phase) {
    if (phase < 0.04 || phase >= 0.96) return L('新月 New Moon (适合拍银河)', 'New Moon (Ideal for Milky Way)');
    if (phase < 0.22) return L('蛾眉月 Waxing Crescent', 'Waxing Crescent');
    if (phase < 0.28) return L('上弦月 First Quarter', 'First Quarter');
    if (phase < 0.47) return L('盈凸月 Waxing Gibbous', 'Waxing Gibbous');
    if (phase < 0.53) return L('满月 Full Moon (月光强烈)', 'Full Moon (Bright Moonlight)');
    if (phase < 0.72) return L('亏凸月 Waning Gibbous', 'Waning Gibbous');
    if (phase < 0.78) return L('下弦月 Last Quarter', 'Last Quarter');
    return L('残月 Waning Crescent', 'Waning Crescent');
  }

  /**
   * Compute exact rectilinear camera FOV angles from focal length, sensor size,
   * aspect ratio crop, and landscape/portrait orientation.
   */
  function computeLensFov(focalMm, sensorKey, opts) {
    const preset = SENSOR_PRESETS[sensorKey] || SENSOR_PRESETS.fullFrame;
    const o = opts && typeof opts === 'object' ? opts : {};
    const baseW = sensorKey === 'custom' && Number(o.w) > 1 ? Number(o.w) : preset.w;
    const baseH = sensorKey === 'custom' && Number(o.h) > 1 ? Number(o.h) : preset.h;
    const orientation = o.orientation === 'portrait' ? 'portrait' : 'landscape';
    const aspectOverride = o.aspectOverride && o.aspectOverride !== 'native' ? o.aspectOverride : 'native';

    let cropW = baseW;
    let cropH = baseH;
    let aspect = preset.aspect;

    if (aspectOverride && /^\d+:\d+$/.test(aspectOverride)) {
      const [rw, rh] = aspectOverride.split(':').map(Number);
      const targetRatio = rw / Math.max(1, rh);
      if (baseW / baseH > targetRatio) {
        cropH = baseH;
        cropW = baseH * targetRatio;
      } else {
        cropW = baseW;
        cropH = baseW / targetRatio;
      }
      aspect = aspectOverride;
    }

    const activeW = orientation === 'portrait' ? cropH : cropW;
    const activeH = orientation === 'portrait' ? cropW : cropH;
    if (orientation === 'portrait' && /^\d+:\d+$/.test(aspect)) {
      const [aw, ah] = aspect.split(':');
      aspect = `${ah}:${aw}`;
    }

    const f = Math.max(4, Math.min(1200, Number(focalMm) || 24));
    const diag = Math.hypot(activeW, activeH);
    const ffDiag = Math.hypot(36, 24);
    const cropFactor = Number((ffDiag / diag).toFixed(2));
    const hFov = Number((2 * Math.atan(activeW / (2 * f)) * (180 / Math.PI)).toFixed(2));
    const vFov = Number((2 * Math.atan(activeH / (2 * f)) * (180 / Math.PI)).toFixed(2));
    const dFov = Number((2 * Math.atan(diag / (2 * f)) * (180 / Math.PI)).toFixed(2));
    return {
      sensorKey: preset.id,
      sensorLabel: getSensorLabel(preset),
      sensorW: Number(activeW.toFixed(2)),
      sensorH: Number(activeH.toFixed(2)),
      aspect,
      aspectRatio: Number((activeW / Math.max(0.1, activeH)).toFixed(4)),
      orientation,
      focalMm: f,
      eqFocalMm: Math.round(f * (ffDiag / diag)),
      cropFactor,
      hFov,
      vFov,
      dFov
    };
  }

  /**
   * Project optical lens FOV onto the MapLibre viewport (which clamps WebGL vertical FOV
   * to [minMapFov, maxMapFov]), computing exact telephoto crop frame dimensions.
   */
  function computeViewfinderProjection(lens, viewportW, viewportH, minMapFov = 18, maxMapFov = 65) {
    const l = lens || computeLensFov(24, 'fullFrame');
    const vFov = Number(l.vFov) || 40;
    const appliedMapVFov = Math.max(minMapFov, Math.min(maxMapFov, vFov));
    const isTelephotoCrop = vFov < minMapFov - 0.05;
    const isWideApproximation = vFov > maxMapFov + 0.05;
    const verticalRatio = isTelephotoCrop
      ? Math.tan((vFov / 2) * DEG2RAD) / Math.tan((appliedMapVFov / 2) * DEG2RAD)
      : 1;

    const maxW = Math.max(180, (Number(viewportW) || 1280) * 0.84);
    const maxH = Math.max(150, (Number(viewportH) || 720) * 0.64);
    const aspectRatio = Number(l.aspectRatio) || (l.sensorW / Math.max(0.1, l.sensorH)) || 1.5;
    const baseH = Math.min(maxH, maxW / aspectRatio);
    const targetH = baseH * verticalRatio;
    const frameH = Math.max(64, Math.min(maxH, Math.round(targetH)));
    const frameW = Math.max(64, Math.min(maxW, Math.round(frameH * aspectRatio)));
    const cropPct = Math.max(1, Math.min(100, Math.round(verticalRatio * 100)));

    return {
      appliedMapVFov: Number(appliedMapVFov.toFixed(2)),
      isTelephotoCrop,
      isWideApproximation,
      verticalRatio: Number(verticalRatio.toFixed(4)),
      cropPct,
      frameW,
      frameH
    };
  }

  /**
   * Compute Astronomy Engine ephemeris extras in the destination's local timezone.
   */
  function computeAstronomyExtras(lat, lng, dateStr, minutes, astroRef, utcOffsetMin) {
    const A = astroRef || global.Astronomy;
    if (!A || typeof A.Observer !== 'function' || typeof A.Horizon !== 'function') {
      return { available: false };
    }
    const offsetMin = Number.isFinite(Number(utcOffsetMin))
      ? Number(utcOffsetMin)
      : estimateUtcOffsetMinutes(lng);
    const dt = localWallTimeToUtcDate(dateStr, minutes || 0, offsetMin);
    const obs = new A.Observer(lat, lng, 0);

    // Galactic Center (Sagittarius A* J2000: RA 17.7611h, Dec -29.0078°)
    const gcNow = A.Horizon(dt, obs, 17.7611, -29.0078, 'normal');

    let astroDusk = null;
    let astroDawn = null;
    try {
      const noonLocal = localWallTimeToUtcDate(dateStr, 12 * 60, offsetMin);
      const duskRes = A.SearchAltitude(A.Body.Sun, obs, -1, noonLocal, 1, -18);
      if (duskRes && duskRes.date) astroDusk = duskRes.date;
      const midnightLocal = localWallTimeToUtcDate(dateStr, 23 * 60 + 30, offsetMin);
      const dawnRes = A.SearchAltitude(A.Body.Sun, obs, 1, midnightLocal, 1, -18);
      if (dawnRes && dawnRes.date) astroDawn = dawnRes.date;
    } catch (e) {
      // Polar day/night or search boundary
    }

    // Scan tonight (18:00 -> next day 06:00 local time) in 20m steps for dark-sky Galactic Center window
    let bestStart = null;
    let bestEnd = null;
    let curStart = null;
    let peakAlt = -90;
    let peakAz = 0;

    for (let offsetM = 18 * 60; offsetM <= 30 * 60; offsetM += 20) {
      const sampleDt = localWallTimeToUtcDate(dateStr, offsetM, offsetMin);
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
      utcOffsetMin: offsetMin,
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

  function computeSimulation(lat, lng, dateStr, minutes, cameraAzimuth, utcOffsetMin) {
    if (!global.SunCalc) return null;
    const offsetMin = Number.isFinite(Number(utcOffsetMin))
      ? Number(utcOffsetMin)
      : estimateUtcOffsetMinutes(lng);
    const dt = localWallTimeToUtcDate(dateStr, minutes, offsetMin);
    const noonDt = localWallTimeToUtcDate(dateStr, 12 * 60, offsetMin);

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
      const cDt = localWallTimeToUtcDate(dateStr, mTotal, offsetMin);
      const p = global.SunCalc.getPosition(cDt, lat, lng);
      curve.push({ h, alt: p.altitude, az: p.azimuth });
    }

    const lightRelation = classifyLightAngle(sunPos.azimuth, cameraAzimuth, sunPos.altitude);
    const astroExtras = computeAstronomyExtras(lat, lng, dateStr, minutes, null, offsetMin);

    return {
      dt,
      utcOffsetMin: offsetMin,
      utcOffsetLabel: formatUtcOffset(offsetMin),
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
      <svg width="192" height="192" viewBox="0 0 192 192" aria-label="${esc(L('太阳方位与机位朝向罗盘', 'Sun azimuth and camera bearing compass'))}">
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
      <svg width="100%" height="${h}" viewBox="0 0 ${w} ${h}" style="display:block;width:100%;height:${h}px;margin-top:6px;" aria-label="${esc(L('24小时太阳高度角曲线', '24-hour solar altitude curve'))}">
        <rect x="0" y="${midY}" width="${w}" height="${h - midY}" fill="rgba(15,23,42,0.28)" />
        <line x1="0" y1="${midY}" x2="${w}" y2="${midY}" stroke="rgba(255,255,255,0.2)" stroke-width="1" />
        <polyline fill="none" stroke="#FBBF24" stroke-width="1.8" points="${pts}" />
        <line x1="${curX.toFixed(1)}" y1="4" x2="${curX.toFixed(1)}" y2="${h - 4}" stroke="#38BDF8" stroke-width="1" stroke-dasharray="2 2" />
        <circle cx="${curX.toFixed(1)}" cy="${curY.toFixed(1)}" r="4" fill="#FBBF24" stroke="#09090B" stroke-width="1.2" />
        <text x="4" y="12" fill="#A1A1AA" font-size="9">+90°</text>
        <text x="4" y="${midY - 3}" fill="#A1A1AA" font-size="9">${esc(L('地平线 0°', 'Horizon 0°'))}</text>
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
      <svg width="100%" height="${h}" viewBox="0 0 ${w} ${h}" style="display:block;width:100%;height:${h}px;margin-top:6px;" aria-label="${esc(L('360度真实地形地平线遮挡剖面', '360-degree terrain horizon profile'))}">
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

    const wxKey = `${coords[1].toFixed(3)},${coords[0].toFixed(3)}`;
    const cachedWxInit = weatherCache.get(wxKey);
    const utcOffsetMin = estimateUtcOffsetMinutes(
      coords[0],
      cachedWxInit && cachedWxInit.data && cachedWxInit.data.utc_offset_seconds
    );
    const lensFov = computeLensFov(state.focalMm, state.sensorKey, {
      w: state.customW,
      h: state.customH,
      orientation: state.orientation,
      aspectOverride: state.aspectOverride
    });
    const sim = computeSimulation(coords[1], coords[0], state.dateStr, state.minutes, state.cameraAzimuth, utcOffsetMin);
    if (!sim) {
      containerEl.innerHTML = `<div class="sim-card">${esc(L('SunCalc 天文库未就绪。', 'SunCalc astronomy engine unavailable.'))}</div>`;
      return;
    }

    const tzOff = sim.utcOffsetMin;
    const timeText = `${String(Math.floor(state.minutes / 60)).padStart(2, '0')}:${String(state.minutes % 60).padStart(2, '0')}`;
    const targetOptions = [
      `<option value="-1" ${state.spotIdx < 0 ? 'selected' : ''}>${esc(L('城市中心', 'City Center'))} · ${esc(tx(dest.shortName || dest.name))}</option>`,
      ...spots.map((s, idx) => `<option value="${idx}" ${state.spotIdx === idx ? 'selected' : ''}>${esc(L(`机位 ${idx + 1}`, `Spot ${idx + 1}`))} · ${esc(tx(s.name))}</option>`)
    ].join('');

    const sensorOptions = Object.values(SENSOR_PRESETS)
      .map((s) => `<option value="${s.id}" ${state.sensorKey === s.id ? 'selected' : ''}>${esc(getSensorLabel(s))}</option>`)
      .join('');

    const astro = sim.astroExtras;
    const moonHint = sim.moonIllum.fraction < 0.25
      ? L('弱光极佳', 'Dark-Sky Ideal')
      : sim.moonIllum.fraction < 0.65
        ? L('中等干扰', 'Moderate Glow')
        : L('强月光明显', 'Strong Moonlight');
    const mwCardHtml = astro && astro.available
      ? `
        <div class="sim-card">
          <div style="display:flex;justify-content:space-between;align-items:center;gap:6px;flex-wrap:wrap;">
            <strong>${icon('sparkles', 14)} ${esc(L('星空与银河摄影窗口', 'Milky Way & Dark-Sky Window'))}</strong>
            <span class="source-tag astronomy">Astronomy Engine · ${esc(sim.utcOffsetLabel)}</span>
          </div>
          <div style="font-size:11.5px;line-height:1.65;margin-top:6px;">
            <div>${esc(L('银河核心 (Sgr A*)：方位', 'Galactic Center (Sgr A*): Az'))} <strong class="mono-num">${astro.gcAzimuth}°</strong> (${compassDirName(astro.gcAzimuth)}) · ${esc(L('高度', 'Alt'))} <strong class="mono-num">${astro.gcAltitude}°</strong></div>
            <div>${esc(L('天文黑夜 (-18°)：', 'Astronomical Night (-18°): '))}<strong class="mono-num">${fmtTime(astro.astroDusk, tzOff)}</strong> — <strong class="mono-num">${fmtTime(astro.astroDawn, tzOff)}</strong></div>
            <div>${esc(L('今晚银心可拍窗口：', 'Tonight Core Window: '))}${
              astro.mwWindowStart && astro.mwWindowEnd
                ? `<strong class="mono-num">${fmtTime(astro.mwWindowStart, tzOff)}–${fmtTime(astro.mwWindowEnd, tzOff)}</strong> (${esc(L('最高仰角', 'Peak Alt'))} <span class="mono-num">${astro.mwPeakAlt}°</span> @ ${astro.mwPeakAz}°)`
                : `<span style="color:var(--text-secondary);">${esc(L('当晚银心高度偏低或极昼无天文黑夜', 'Core too low or polar twilight tonight'))}</span>`
            }</div>
            <div style="color:var(--text-secondary);">${esc(L('月光干扰参考：照明度', 'Moonlight Interference: Illum'))} <span class="mono-num">${Math.round(sim.moonIllum.fraction * 100)}%</span> (${esc(moonHint)})</div>
          </div>
          <div style="display:flex;gap:6px;flex-wrap:wrap;margin-top:8px;">
            <button class="mini-action-pill" id="sim-toggle-blackmarble" type="button">${icon('moon', 12)} ${esc(L('暗夜灯光图层', 'Night Lights'))}</button>
            <button class="mini-action-pill" id="sim-toggle-aurora" type="button">${icon('aurora', 12)} ${esc(L('实时极光带', 'Live Aurora'))}</button>
          </div>
        </div>
      `
      : '';

    containerEl.innerHTML = `
      <div class="sim-card">
        <div style="display:flex;justify-content:space-between;align-items:center;gap:6px;flex-wrap:wrap;">
          <strong>${icon('sunrise', 14)} ${esc(L('专业摄影机位光影模拟器', 'Sun & Light Spot Simulator'))}</strong>
          <span class="source-tag astronomy">${esc(L('目的地时间', 'Local Time'))} ${esc(sim.utcOffsetLabel)} · SunCalc</span>
        </div>

        <div style="margin-top:8px;display:flex;gap:6px;align-items:center;flex-wrap:wrap;">
          <select class="sim-input" id="sim-spot-select" style="flex:1;min-width:140px;" aria-label="${esc(L('选择模拟机位', 'Select spot'))}">${targetOptions}</select>
          <button class="mini-action-pill sim-vf-launch" id="sim-open-viewfinder-btn" type="button">
            ${icon('camera', 12)} ${esc(L('3D 取景器', '3D Viewfinder'))}
          </button>
        </div>

        <div class="sim-controls-row">
          <input class="sim-input mono-num" id="sim-date-input" type="date" value="${esc(state.dateStr)}" aria-label="${esc(L('模拟日期', 'Simulation date'))}" />
          <div style="display:flex;align-items:center;gap:6px;">
            <span id="sim-time-label" class="mono-num" style="font-size:12px;min-width:44px;">${timeText}</span>
            <input id="sim-time-range" type="range" min="0" max="1439" step="5" value="${state.minutes}" style="flex:1;" aria-label="${esc(L('模拟时刻', 'Simulation time'))}" />
          </div>
        </div>

        <div class="sim-presets">
          <button class="mini-action-pill sim-preset-btn" data-preset="now" type="button">${esc(L('此刻', 'Now'))}</button>
          <button class="mini-action-pill sim-preset-btn" data-preset="dawn" type="button">${esc(L('蓝调晨', 'Blue Dawn'))}</button>
          <button class="mini-action-pill sim-preset-btn" data-preset="sunrise" type="button">${esc(L('日出', 'Sunrise'))}</button>
          <button class="mini-action-pill sim-preset-btn" data-preset="goldenM" type="button">${esc(L('黄金晨', 'Golden AM'))}</button>
          <button class="mini-action-pill sim-preset-btn" data-preset="goldenE" type="button">${esc(L('黄金昏', 'Golden PM'))}</button>
          <button class="mini-action-pill sim-preset-btn" data-preset="sunset" type="button">${esc(L('日落', 'Sunset'))}</button>
          <button class="mini-action-pill sim-preset-btn" data-preset="dusk" type="button">${esc(L('蓝调昏', 'Blue Dusk'))}</button>
        </div>

        <div class="sim-lens-bar">
          <div style="display:flex;gap:6px;align-items:center;flex-wrap:wrap;justify-content:space-between;">
            <select class="sim-input" id="sim-sensor-select" style="width:auto;min-width:128px;height:28px;font-size:11.5px;" aria-label="${esc(L('传感器画幅', 'Sensor format'))}">${sensorOptions}</select>
            <span class="mono-num" style="font-size:11px;color:var(--text-secondary);">
              ${esc(L('视角', 'FOV'))} ${lensFov.hFov.toFixed(1)}°×${lensFov.vFov.toFixed(1)}° · ${esc(L('等效', 'Eq.'))} ${lensFov.eqFocalMm}mm
            </span>
          </div>
          <div class="sim-focal-pills">
            ${FOCAL_PRESETS.map((f) => `<button class="mini-action-pill sim-focal-btn ${state.focalMm === f ? 'active' : ''}" data-focal="${f}" type="button">${f}mm</button>`).join('')}
          </div>
        </div>

        <div class="sim-compass-wrap">
          <div id="sim-compass-host">${buildCompassSvg(sim, state.cameraAzimuth, lensFov.hFov)}</div>
          <div id="sim-sun-stats" style="flex:1;min-width:155px;font-size:11.5px;line-height:1.6;">
            <div>${esc(L('太阳方位：', 'Sun Azimuth: '))}<strong class="mono-num">${sim.sunPos.azimuth.toFixed(1)}°</strong> (${compassDirName(sim.sunPos.azimuth)})</div>
            <div>${esc(L('太阳高度：', 'Sun Altitude: '))}<strong class="mono-num">${sim.sunPos.altitude.toFixed(1)}°</strong></div>
            <div>${esc(L('机位朝向：', 'Camera Bearing: '))}<strong class="mono-num">${state.cameraAzimuth}°</strong> (${compassDirName(state.cameraAzimuth)})</div>
            <div style="margin-top:4px;"><span class="source-tag astronomy">${esc(sim.lightRelation.badge)}</span> ${esc(sim.lightRelation.label)}</div>
          </div>
        </div>

        <div style="margin-top:6px;">
          <div style="display:flex;justify-content:space-between;align-items:center;font-size:11.5px;">
            <span>${esc(L('调整机位拍摄朝向：', 'Camera Azimuth: '))}<strong id="sim-azimuth-label" class="mono-num">${state.cameraAzimuth}°</strong></span>
            <div style="display:flex;gap:6px;">
              <button class="mini-action-pill" id="sim-align-cam-btn" type="button">${esc(L('同步地球视角', 'Sync Globe View'))}</button>
              <label style="display:inline-flex;align-items:center;gap:4px;cursor:pointer;">
                <input id="sim-globe-toggle" type="checkbox" ${state.showOnGlobe ? 'checked' : ''} /> ${esc(L('地球射线', 'Globe Rays'))}
              </label>
            </div>
          </div>
          <input id="sim-azimuth-range" type="range" min="0" max="359" value="${state.cameraAzimuth}" style="width:100%;margin-top:4px;" />
        </div>

        <div id="sim-curve-host">${buildCurveSvg(sim, state.minutes)}</div>

        <div class="sim-times-grid">
          <div class="sim-time-cell"><span>🌅 ${esc(L('蓝调晨 (Dawn)', 'Blue Dawn'))}</span><strong class="mono-num">${fmtTime(sim.times.dawn, tzOff)}</strong></div>
          <div class="sim-time-cell"><span>☀️ ${esc(L('日出', 'Sunrise'))} (${sim.sunrisePos ? `${sim.sunrisePos.azimuth.toFixed(0)}°` : '--'})</span><strong class="mono-num">${fmtTime(sim.times.sunrise, tzOff)}</strong></div>
          <div class="sim-time-cell"><span>✨ ${esc(L('黄金晨结束', 'Golden AM End'))}</span><strong class="mono-num">${fmtTime(sim.times.goldenHourEnd, tzOff)}</strong></div>
          <div class="sim-time-cell"><span>✨ ${esc(L('黄金昏开始', 'Golden PM Start'))}</span><strong class="mono-num">${fmtTime(sim.times.goldenHour, tzOff)}</strong></div>
          <div class="sim-time-cell"><span>🌇 ${esc(L('日落', 'Sunset'))} (${sim.sunsetPos ? `${sim.sunsetPos.azimuth.toFixed(0)}°` : '--'})</span><strong class="mono-num">${fmtTime(sim.times.sunset, tzOff)}</strong></div>
          <div class="sim-time-cell"><span>🌆 ${esc(L('蓝调昏 (Dusk)', 'Blue Dusk'))}</span><strong class="mono-num">${fmtTime(sim.times.dusk, tzOff)}</strong></div>
        </div>

        <div style="margin-top:10px;padding-top:8px;border-top:1px solid var(--border-hairline);font-size:11.5px;">
          <div>🌙 <strong>${esc(L('月相与月出月落', 'Moon Phase & Rise/Set'))}</strong>：${esc(moonPhaseLabel(sim.moonIllum.phase))} · ${esc(L('照明度', 'Illum'))} <span class="mono-num">${Math.round(sim.moonIllum.fraction * 100)}%</span></div>
          <div style="color:var(--text-secondary);margin-top:2px;">
            ${esc(L('月出：', 'Moonrise: '))}<span class="mono-num">${fmtTime(sim.moonTimes.rise, tzOff)}</span> · ${esc(L('月落：', 'Moonset: '))}<span class="mono-num">${fmtTime(sim.moonTimes.set, tzOff)}</span> · ${esc(L('月亮方位', 'Moon Az'))} <span class="mono-num">${sim.moonPos.azimuth.toFixed(0)}°</span> / ${esc(L('高度', 'Alt'))} <span class="mono-num">${sim.moonPos.altitude.toFixed(1)}°</span>
          </div>
        </div>
      </div>

      <div class="sim-card" id="sim-terrain-box">
        <div style="display:flex;justify-content:space-between;align-items:center;gap:6px;flex-wrap:wrap;">
          <strong>${icon('mountain', 14)} ${esc(L('观测点地形遮挡与光照推演', 'Terrain Horizon Obstruction'))}</strong>
          <span class="source-tag astronomy">${esc(L('多分辨率 DEM 射线', 'Multi-Res DEM Rays'))}</span>
        </div>
        <div id="sim-terrain-status" style="font-size:11.5px;color:var(--text-secondary);margin-top:6px;">
          ${esc(L('正在读取周边 DEM 高程瓦片计算 360° 山体遮挡…', 'Sampling surrounding DEM elevation tiles for 360° ridge profile…'))}
        </div>
      </div>

      ${mwCardHtml}

      <div class="sim-card" id="sim-advice-box">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px;">
          <strong>${esc(L('拍摄窗口综合建议', 'Shooting Window Advice'))}</strong>
          <span class="source-tag empirical">${esc(L('区分天文 / 预报 / 经验', 'Astronomy / Forecast / Field'))}</span>
        </div>
        <div id="sim-wx-advice" style="font-size:11.5px;color:var(--text-secondary);margin-bottom:6px;">
          <span class="source-tag realtime">${esc(L('气象预报', 'Forecast'))}</span> ${esc(L('正在比对未来 7 日云量与降水预报…', 'Checking 7-day cloud cover & rain probability…'))}
        </div>
        ${
          activeSpot
            ? `<div style="font-size:11.5px;line-height:1.55;">
                <span class="source-tag empirical">${esc(L('经验建议 · 实地档案', 'Field Notes · Archive'))}</span>
                <strong>${esc(tx(activeSpot.bestTime || ''))}</strong><br/>
                <span style="color:var(--text-secondary);">${esc(tx(activeSpot.tips || ''))}</span>
              </div>`
            : ''
        }
      </div>
    `;

    updateGlobeOverlay(coords, sim, state.cameraAzimuth, lensFov.hFov);

    const rerender = () => mount(dest, containerEl, state.spotIdx);

    const renderWeatherAdvice = (live) => {
      const wxAdviceEl = containerEl.querySelector('#sim-wx-advice');
      if (!wxAdviceEl || !document.body.contains(wxAdviceEl) || !live) return;
      const hourly = live && live.hourly;
      const targetPrefix = `${state.dateStr}T${String(Math.floor(state.minutes / 60)).padStart(2, '0')}`;
      const idx = hourly && Array.isArray(hourly.time) ? hourly.time.findIndex((t) => t.startsWith(targetPrefix)) : -1;
      if (idx >= 0) {
        const cc = hourly.cloud_cover[idx];
        const pop = hourly.precipitation_probability[idx];
        let verdict = L('光影条件良好，适合常规拍摄。', 'Favorable lighting conditions for shooting.');
        if (pop >= 55) verdict = L('降水概率偏高，建议做好防雨或转向室内/雨景构图。', 'High rain probability — bring weather protection or plan moody/rain shots.');
        else if (cc >= 25 && cc <= 65) verdict = L('中低云量适中，日出日落出现火烧云/层次光概率较高。', 'Balanced mid/low cloud cover — high odds of dramatic sunset color.');
        else if (cc < 25) verdict = L('天空极通透，适合星空、清晰远景与强对比日光。', 'Crystal-clear skies — great for crisp vistas and night stars.');
        else verdict = L('云层较厚，适合柔和漫射光、建筑摄影或长曝光。', 'Heavy overcast — ideal for soft diffused light and long exposures.');
        wxAdviceEl.innerHTML = `<span class="source-tag realtime">${esc(L('Open-Meteo 预报', 'Open-Meteo Forecast'))}</span> ${esc(L('选定时刻预报云量', 'Forecast Cloud'))} <strong class="mono-num">${cc}%</strong> · ${esc(L('降水概率', 'Precip'))} <strong class="mono-num">${pop}%</strong> — ${esc(verdict)}`;
      } else {
        wxAdviceEl.innerHTML = `<span class="source-tag astronomy">${esc(L('天文计算', 'Astronomy'))}</span> ${esc(L('所选日期超出 7 日实况预报窗口，请结合下方历史气候统计与经验时段安排机位。', 'Selected date is beyond the 7-day live forecast window; use the 5-year climate archive and field notes.'))}`;
      }
    };

    const updateDynamicReadouts = () => {
      const wxHit = weatherCache.get(wxKey);
      const curTzOff = estimateUtcOffsetMinutes(coords[0], wxHit && wxHit.data && wxHit.data.utc_offset_seconds);
      const nextSim = computeSimulation(coords[1], coords[0], state.dateStr, state.minutes, state.cameraAzimuth, curTzOff);
      if (!nextSim) return;
      const tLabel = containerEl.querySelector('#sim-time-label');
      const azLabel = containerEl.querySelector('#sim-azimuth-label');
      const compassHost = containerEl.querySelector('#sim-compass-host');
      const sunStats = containerEl.querySelector('#sim-sun-stats');
      const curveHost = containerEl.querySelector('#sim-curve-host');
      if (tLabel) {
        tLabel.textContent = `${String(Math.floor(state.minutes / 60)).padStart(2, '0')}:${String(state.minutes % 60).padStart(2, '0')}`;
      }
      if (azLabel) azLabel.textContent = `${state.cameraAzimuth}°`;
      if (compassHost) compassHost.innerHTML = buildCompassSvg(nextSim, state.cameraAzimuth, lensFov.hFov);
      if (sunStats) {
        sunStats.innerHTML = `
          <div>${esc(L('太阳方位：', 'Sun Azimuth: '))}<strong class="mono-num">${nextSim.sunPos.azimuth.toFixed(1)}°</strong> (${compassDirName(nextSim.sunPos.azimuth)})</div>
          <div>${esc(L('太阳高度：', 'Sun Altitude: '))}<strong class="mono-num">${nextSim.sunPos.altitude.toFixed(1)}°</strong></div>
          <div>${esc(L('机位朝向：', 'Camera Bearing: '))}<strong class="mono-num">${state.cameraAzimuth}°</strong> (${compassDirName(state.cameraAzimuth)})</div>
          <div style="margin-top:4px;"><span class="source-tag astronomy">${esc(nextSim.lightRelation.badge)}</span> ${esc(nextSim.lightRelation.label)}</div>
        `;
      }
      if (curveHost) curveHost.innerHTML = buildCurveSvg(nextSim, state.minutes);
      updateGlobeOverlay(coords, nextSim, state.cameraAzimuth, lensFov.hFov);
      const cachedWx = weatherCache.get(wxKey);
      if (cachedWx && Date.now() - cachedWx.ts < WEATHER_TTL_MS) {
        renderWeatherAdvice(cachedWx.data);
      }
    };

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
      updateDynamicReadouts();
    });
    containerEl.querySelector('#sim-azimuth-range').addEventListener('input', (e) => {
      state.cameraAzimuth = Number(e.target.value);
      updateDynamicReadouts();
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
            focalMm: state.focalMm,
            orientation: state.orientation,
            aspectOverride: state.aspectOverride,
            utcOffsetMin: tzOff
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
        const toMin = (dt) => {
          if (!(dt instanceof Date) || Number.isNaN(dt.getTime())) return null;
          const shifted = new Date(dt.getTime() + tzOff * 60000);
          return shifted.getUTCHours() * 60 + shifted.getUTCMinutes();
        };
        if (p === 'now') {
          const shiftedNow = new Date(Date.now() + tzOff * 60000);
          state.dateStr = shiftedNow.toISOString().slice(0, 10);
          state.minutes = shiftedNow.getUTCHours() * 60 + shiftedNow.getUTCMinutes();
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
          terrainEl.innerHTML = `<span class="source-tag empirical">${esc(L('DEM 暂不可用', 'DEM Unavailable'))}</span> ${esc(L('无法获取高程瓦片（离线或受限），仅显示几何地平线日出日落。', 'Terrain tiles unavailable (offline/restricted); showing geometric horizon times.'))}`;
          return;
        }
        const adj = global.Terrain3DModule.estimateTerrainAdjustedSunTimes(
          coords[1],
          coords[0],
          state.dateStr,
          hRes.profile,
          global.SunCalc,
          tzOff
        );
        terrainEl.innerHTML = `
          <div>${esc(L('观测点高程', 'Observer Elev'))} <strong class="mono-num">${hRes.observerElevation}m</strong> (${esc(L('机位', 'Tripod'))} +${state.observerHeightM}m) · ${esc(L('最大山脊仰角', 'Max Ridge'))} <strong class="mono-num">${hRes.maxObstacleDeg}°</strong> · ${esc(hRes.demSource || 'Terrarium DEM')}</div>
          ${
            adj
              ? `<div style="margin-top:3px;">${esc(L('观测点遮挡日出：', 'Terrain Sunrise: '))}<strong class="mono-num">${fmtTime(adj.adjSunrise, tzOff)}</strong> (${esc(L('晚', 'later'))} <span class="mono-num">+${adj.sunriseDelayMin}</span> ${esc(L('分钟', 'min'))}) · ${esc(L('遮挡日落：', 'Terrain Sunset: '))}<strong class="mono-num">${fmtTime(adj.adjSunset, tzOff)}</strong> (${esc(L('提前', 'earlier'))} <span class="mono-num">-${adj.sunsetEarlyMin}</span> ${esc(L('分钟', 'min'))})</div>`
              : ''
          }
          <div style="font-size:10.5px;color:var(--text-muted);margin-top:2px;">${esc(L('说明：计算相机观测点见光时间；远处高海拔主峰（如“日照金山”）通常早于低处机位受光。', 'Note: computed for observer spot elevation; distant high peaks catch alpenglow earlier.'))}</div>
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

    // Weather-aware advice when within 7-day Open-Meteo window (memory cached 15m)
    const wxAdviceEl = containerEl.querySelector('#sim-wx-advice');
    if (wxAdviceEl && global.WeatherService) {
      const cachedWx = weatherCache.get(wxKey);
      if (cachedWx && Date.now() - cachedWx.ts < WEATHER_TTL_MS) {
        renderWeatherAdvice(cachedWx.data);
      } else {
        try {
          const live = await global.WeatherService.fetchLiveWeather(coords[1], coords[0]);
          weatherCache.set(wxKey, { data: live, ts: Date.now() });
          renderWeatherAdvice(live);
        } catch (e) {
          if (document.body.contains(wxAdviceEl)) {
            wxAdviceEl.innerHTML = `<span class="source-tag empirical">${esc(L('离线模式', 'Offline Mode'))}</span> ${esc(L('气象预报暂不可用，天文太阳/月相计算仍可离线精确运行。', 'Weather forecast unavailable; Sun & Moon calculations work offline.'))}`;
          }
        }
      }
    }
  }

  const api = {
    SENSOR_PRESETS,
    FOCAL_PRESETS,
    ASPECT_RATIOS,
    estimateUtcOffsetMinutes,
    formatUtcOffset,
    localWallTimeToUtcDate,
    formatTimeInOffset,
    computeSimulation,
    classifyLightAngle,
    computeLensFov,
    computeViewfinderProjection,
    computeAstronomyExtras,
    mount,
    clearGlobeOverlay
  };

  global.PhotoSimulator = api;
  if (typeof module === 'object' && module.exports) {
    module.exports = api;
  }
})(typeof window !== 'undefined' ? window : globalThis);
