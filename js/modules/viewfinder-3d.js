(function (global) {
  'use strict';

  const FOCAL_LIST = [14, 24, 35, 50, 85, 135, 200, 400];
  let active = false;
  let savedCamera = null;
  let savedTerrainState = false;
  let moveHandler = null;
  let moveRafId = 0;
  let cachedSimKey = '';
  let cachedSim = null;
  let state = {
    dest: null,
    spot: null,
    coords: [0, 0],
    dateStr: new Date().toISOString().slice(0, 10),
    minutes: new Date().getHours() * 60 + new Date().getMinutes(),
    sensorKey: 'fullFrame',
    focalMm: 24,
    orientation: 'landscape',
    aspectOverride: 'native',
    bearing: 0,
    showThirds: true,
    utcOffsetMin: null
  };

  function esc(str) {
    return String(str || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
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

  function applyMapFov(map, vFov) {
    if (!map) return;
    const clamped = Math.max(18, Math.min(65, Number(vFov) || 40));
    try {
      if (typeof map.setVerticalFieldOfView === 'function') {
        map.setVerticalFieldOfView(clamped);
      } else if (map.transform && typeof map.transform.fov === 'number') {
        map.transform.fov = clamped;
        if (typeof map.triggerRepaint === 'function') map.triggerRepaint();
      }
    } catch (e) {
      // ignore
    }
  }

  function angleDiff(targetDeg, refDeg) {
    return ((((targetDeg - refDeg) % 360) + 540) % 360) - 180;
  }

  function buildCompassMarkers(bearing, hFov, sim) {
    const markers = [
      { az: 0, label: 'N', kind: 'cardinal' },
      { az: 90, label: 'E', kind: 'cardinal' },
      { az: 180, label: 'S', kind: 'cardinal' },
      { az: 270, label: 'W', kind: 'cardinal' }
    ];
    if (sim && sim.sunPos) {
      markers.push({ az: sim.sunPos.azimuth, label: `☀ ${Math.round(sim.sunPos.altitude)}°`, kind: 'sun' });
    }
    if (sim && sim.sunrisePos) {
      markers.push({ az: sim.sunrisePos.azimuth, label: '↗Sunrise', kind: 'sunrise' });
    }
    if (sim && sim.sunsetPos) {
      markers.push({ az: sim.sunsetPos.azimuth, label: '↘Sunset', kind: 'sunset' });
    }
    if (sim && sim.astroExtras && sim.astroExtras.available) {
      markers.push({ az: sim.astroExtras.gcAzimuth, label: `✦GC ${Math.round(sim.astroExtras.gcAltitude)}°`, kind: 'mw' });
    }

    const span = Math.max(hFov * 1.3, 60);
    return markers
      .map((m) => {
        const diff = angleDiff(m.az, bearing);
        if (Math.abs(diff) > span / 2) return '';
        const leftPct = 50 + (diff / span) * 100;
        return `<span class="vf-tape-mark vf-mark-${m.kind}" style="left:${leftPct.toFixed(1)}%;">${esc(m.label)}</span>`;
      })
      .join('');
  }

  function currentLens() {
    if (global.PhotoSimulator) {
      return global.PhotoSimulator.computeLensFov(state.focalMm, state.sensorKey, {
        orientation: state.orientation,
        aspectOverride: state.aspectOverride
      });
    }
    return { hFov: 73.7, vFov: 53.1, eqFocalMm: state.focalMm, sensorLabel: 'Full Frame 35mm', aspect: '3:2', aspectRatio: 1.5 };
  }

  function currentProjection(lens) {
    const vw = typeof global.innerWidth === 'number' ? global.innerWidth : 1280;
    const vh = typeof global.innerHeight === 'number' ? global.innerHeight : 720;
    if (global.PhotoSimulator && typeof global.PhotoSimulator.computeViewfinderProjection === 'function') {
      return global.PhotoSimulator.computeViewfinderProjection(lens, vw, vh, 18, 65);
    }
    return {
      appliedMapVFov: Math.max(18, Math.min(65, lens.vFov || 40)),
      isTelephotoCrop: false,
      isWideApproximation: false,
      cropPct: 100,
      frameW: 640,
      frameH: 426
    };
  }

  function renderHud() {
    const hud = document.getElementById('viewfinder-hud');
    if (!hud || !active) return;

    const map = typeof global.getGlobeMap === 'function' ? global.getGlobeMap() : null;
    const bearing = map ? Math.round(((map.getBearing() % 360) + 360) % 360) : state.bearing;
    state.bearing = bearing;

    const lens = currentLens();
    const proj = currentProjection(lens);

    const simKey = `${state.coords[1].toFixed(4)},${state.coords[0].toFixed(4)}|${state.dateStr}|${state.minutes}`;
    if (global.PhotoSimulator) {
      if (simKey !== cachedSimKey || !cachedSim) {
        const resolvedTz = global.TimezoneService && typeof global.TimezoneService.resolveOffsetForLocationDate === 'function'
          ? global.TimezoneService.resolveOffsetForLocationDate(state.coords[1], state.coords[0], state.dateStr, state.minutes)
          : null;
        if (resolvedTz && Number.isFinite(resolvedTz.offsetMin)) {
          state.utcOffsetMin = resolvedTz.offsetMin;
        }
        cachedSim = global.PhotoSimulator.computeSimulation(
          state.coords[1],
          state.coords[0],
          state.dateStr,
          state.minutes,
          bearing,
          state.utcOffsetMin
        );
        cachedSimKey = simKey;
      }
    }
    const sim = cachedSim;
    const lightRel = sim && global.PhotoSimulator
      ? global.PhotoSimulator.classifyLightAngle(sim.sunPos.azimuth, bearing, sim.sunPos.altitude)
      : null;

    const elevM = map && global.Terrain3DModule ? global.Terrain3DModule.queryElevation(map, state.coords[0], state.coords[1]) : null;
    const elevLabel = elevM !== null ? `${elevM}m` : ((state.spot && state.spot.elevation) || state.dest.elevation || '--');
    const timeText = `${String(Math.floor(state.minutes / 60)).padStart(2, '0')}:${String(state.minutes % 60).padStart(2, '0')}`;
    const tzBadge = (sim && (sim.timezoneDisplay || sim.utcOffsetLabel)) || 'Local';
    const title = state.spot
      ? `${tx(state.dest.shortName || state.dest.name)} · ${tx(state.spot.name)}`
      : tx(state.dest.shortName || state.dest.name);

    const optModeChip = proj.isTelephotoCrop
      ? `<span class="vf-mode-chip tele">${esc(L(`光学裁切 · 真实视角 ${proj.cropPct}% (WebGL 下限 18°)`, `Optical Crop · True View ${proj.cropPct}% (WebGL min 18°)`))}</span>`
      : proj.isWideApproximation
        ? `<span class="vf-mode-chip wide">${esc(L('超广角近似 · 视口上限 65°', 'Wide Approx · Viewport max 65°'))}</span>`
        : '';

    const orientLabel = state.orientation === 'portrait' ? L('竖构图', 'Portrait') : L('横构图', 'Landscape');
    const pitchDeg = map && typeof map.getPitch === 'function' ? Math.round(map.getPitch()) : 75;
    const cropModeChip = proj.mode === 'webgl-digital-crop'
      ? `<span class="vf-mode-chip tele">${esc(L(`WebGL 数码裁切 · 光学视场 ${proj.appliedMapVFov.toFixed(0)}°`, `WebGL Digital Crop · Optical FOV ${proj.appliedMapVFov.toFixed(0)}°`))}</span>`
      : optModeChip || `<span class="vf-mode-chip optical">${esc(L(`光学视场 ${proj.appliedMapVFov.toFixed(0)}°`, `Optical FOV ${proj.appliedMapVFov.toFixed(0)}°`))}</span>`;
    hud.innerHTML = `
      <div class="vf-top-bar">
        <div class="vf-title-pill">
          <span class="vf-live-dot"></span>
          <span>${esc(title)}</span>
          <span class="mono-num vf-bearing-chip">${bearing}°</span>
          <span class="mono-num vf-bearing-chip" id="vf-pitch-badge" title="${esc(L('俯仰倾角', 'Horizon Pitch'))}">↕${pitchDeg}°</span>
        </div>
        <div class="vf-compass-tape" id="vf-compass-tape">
          <div class="vf-tape-center"></div>
          ${buildCompassMarkers(bearing, lens.hFov, sim)}
        </div>
        <button id="vf-close-btn" class="vf-exit-btn" type="button">${esc(L('退出取景', 'Exit'))} <kbd>Esc</kbd></button>
      </div>

      <div class="vf-frame-stage">
        <div class="vf-reticle-box" style="width:${proj.frameW}px;height:${proj.frameH}px;">
          <span class="vf-corner tl"></span>
          <span class="vf-corner tr"></span>
          <span class="vf-corner bl"></span>
          <span class="vf-corner br"></span>
          ${state.showThirds ? `<div class="vf-thirds-h1"></div><div class="vf-thirds-h2"></div><div class="vf-thirds-v1"></div><div class="vf-thirds-v2"></div>` : ''}
          <div class="vf-hud-meta-tl mono-num">${state.focalMm}mm · ${esc(lens.sensorLabel)} · ${esc(orientLabel)} (${esc(lens.aspect)})</div>
          <div class="vf-hud-meta-tr mono-num">FOV ${lens.hFov.toFixed(1)}° × ${lens.vFov.toFixed(1)}° · ${esc(L('等效', 'Eq.'))} ${lens.eqFocalMm}mm</div>
          <div class="vf-hud-meta-bl" id="vf-light-badge">${lightRel ? `${esc(lightRel.badge)} · ${esc(lightRel.label)}` : ''}</div>
          <div class="vf-hud-meta-br mono-num">${esc(L('海拔', 'Elev'))} ${esc(elevLabel)} · ${esc(tzBadge)}</div>
          <div class="vf-hud-opt-chip">${cropModeChip}</div>
        </div>
      </div>

      <div class="vf-bottom-dock">
        <div class="vf-focal-row">
          <select id="vf-sensor-select" class="vf-select" aria-label="${esc(L('画幅', 'Sensor'))}">
            <option value="fullFrame" ${state.sensorKey === 'fullFrame' ? 'selected' : ''}>${esc(L('全画幅', 'Full Frame'))}</option>
            <option value="apsc" ${state.sensorKey === 'apsc' ? 'selected' : ''}>APS-C</option>
            <option value="m43" ${state.sensorKey === 'm43' ? 'selected' : ''}>M4/3</option>
            <option value="medium" ${state.sensorKey === 'medium' ? 'selected' : ''}>${esc(L('中画幅', 'Med Format'))}</option>
          </select>
          <select id="vf-aspect-select" class="vf-select" aria-label="${esc(L('构图比', 'Aspect ratio'))}">
            <option value="native" ${state.aspectOverride === 'native' ? 'selected' : ''}>${esc(L('原生画幅', 'Native'))}</option>
            <option value="3:2" ${state.aspectOverride === '3:2' ? 'selected' : ''}>3:2</option>
            <option value="4:3" ${state.aspectOverride === '4:3' ? 'selected' : ''}>4:3</option>
            <option value="16:9" ${state.aspectOverride === '16:9' ? 'selected' : ''}>16:9</option>
            <option value="1:1" ${state.aspectOverride === '1:1' ? 'selected' : ''}>1:1</option>
          </select>
          <button id="vf-orient-btn" class="vf-focal-btn ${state.orientation === 'portrait' ? 'active' : ''}" type="button">
            ${esc(orientLabel)}
          </button>
          <button id="vf-thirds-btn" class="vf-focal-btn ${state.showThirds ? 'active' : ''}" type="button">
            ${esc(L('九宫格', 'Grid'))}
          </button>
          ${FOCAL_LIST.map((f) => `<button class="vf-focal-btn ${state.focalMm === f ? 'active' : ''}" data-focal="${f}" type="button">${f}mm</button>`).join('')}
        </div>
        <div class="vf-time-row">
          <span class="mono-num vf-focal-readout">${state.focalMm}mm</span>
          <input id="vf-focal-slider" class="vf-focal-slider" type="range" min="14" max="600" step="1" value="${Math.min(600, state.focalMm)}" aria-label="${esc(L('自定义焦距', 'Custom focal length'))}" />
          <input id="vf-date-input" class="vf-date-input mono-num" type="date" value="${esc(state.dateStr)}" aria-label="${esc(L('日期', 'Date'))}" />
          <span class="mono-num vf-time-val">${timeText}</span>
          <input id="vf-time-range" class="vf-time-range" type="range" min="0" max="1439" step="5" value="${state.minutes}" aria-label="${esc(L('时刻', 'Time'))}" />
        </div>
      </div>
    `;

    hud.querySelector('#vf-close-btn').addEventListener('click', close);
    const applyAndRedraw = () => {
      const nextLens = currentLens();
      const nextProj = currentProjection(nextLens);
      applyMapFov(map, nextProj.appliedMapVFov);
      renderHud();
    };
    hud.querySelector('#vf-sensor-select').addEventListener('change', (e) => {
      state.sensorKey = e.target.value;
      applyAndRedraw();
    });
    const thirdsBtn = hud.querySelector('#vf-thirds-btn');
    if (thirdsBtn) {
      thirdsBtn.addEventListener('click', () => {
        state.showThirds = !state.showThirds;
        renderHud();
      });
    }
    hud.querySelector('#vf-aspect-select').addEventListener('change', (e) => {
      state.aspectOverride = e.target.value;
      applyAndRedraw();
    });
    hud.querySelector('#vf-orient-btn').addEventListener('click', () => {
      state.orientation = state.orientation === 'landscape' ? 'portrait' : 'landscape';
      applyAndRedraw();
    });
    hud.querySelectorAll('.vf-focal-btn[data-focal]').forEach((btn) => {
      btn.addEventListener('click', () => {
        state.focalMm = Number(btn.dataset.focal) || 24;
        applyAndRedraw();
      });
    });
    hud.querySelector('#vf-focal-slider').addEventListener('input', (e) => {
      state.focalMm = Number(e.target.value) || 24;
      applyAndRedraw();
    });
    hud.querySelector('#vf-date-input').addEventListener('change', (e) => {
      if (e.target.value) {
        state.dateStr = e.target.value;
        renderHud();
      }
    });
    hud.querySelector('#vf-time-range').addEventListener('input', (e) => {
      state.minutes = Number(e.target.value);
      renderHud();
    });
  }

  function open(dest, spot, opts) {
    const map = typeof global.getGlobeMap === 'function' ? global.getGlobeMap() : null;
    const hud = document.getElementById('viewfinder-hud');
    if (!map || !hud || !dest) return;

    const coords = (spot && spot.coords) || dest.coords;
    if (!Array.isArray(coords) || coords.length < 2) return;

    if (!active) {
      const curFov = typeof map.getVerticalFieldOfView === 'function'
        ? map.getVerticalFieldOfView()
        : (map.transform && typeof map.transform.fov === 'number' ? map.transform.fov : 36.87);
      savedCamera = {
        center: map.getCenter(),
        zoom: map.getZoom(),
        pitch: map.getPitch(),
        bearing: map.getBearing(),
        fov: curFov
      };
      savedTerrainState = global.Terrain3DModule ? global.Terrain3DModule.getState().terrain : false;
    }

    active = true;
    state.dest = dest;
    state.spot = spot || null;
    state.coords = coords;
    const initDate = (opts && opts.dateStr) || state.dateStr;
    const initMin = (opts && Number.isFinite(opts.minutes)) ? opts.minutes : state.minutes;
    const resolvedTzInit = global.TimezoneService && typeof global.TimezoneService.resolveOffsetForLocationDate === 'function'
      ? global.TimezoneService.resolveOffsetForLocationDate(coords[1], coords[0], initDate, initMin)
      : null;
    state.utcOffsetMin = resolvedTzInit && Number.isFinite(resolvedTzInit.offsetMin)
      ? resolvedTzInit.offsetMin
      : (global.PhotoSimulator ? global.PhotoSimulator.estimateUtcOffsetMinutes(coords[0], opts && opts.utcOffsetSec) : null);
    if (opts) {
      if (opts.dateStr) state.dateStr = opts.dateStr;
      if (Number.isFinite(opts.minutes)) state.minutes = opts.minutes;
      if (opts.sensorKey) state.sensorKey = opts.sensorKey;
      if (Number.isFinite(opts.focalMm)) state.focalMm = opts.focalMm;
      if (opts.orientation) state.orientation = opts.orientation;
      if (opts.aspectOverride) state.aspectOverride = opts.aspectOverride;
      if (Number.isFinite(opts.bearing)) state.bearing = opts.bearing;
      if (Number.isFinite(opts.utcOffsetMin)) state.utcOffsetMin = opts.utcOffsetMin;
    }

    if (global.Terrain3DModule && !savedTerrainState) {
      global.Terrain3DModule.toggleTerrain(map, true);
    }

    const lens = currentLens();
    const proj = currentProjection(lens);
    applyMapFov(map, proj.appliedMapVFov);

    map.flyTo({
      center: coords,
      zoom: 14.1,
      pitch: 75,
      bearing: state.bearing,
      duration: 1100
    });

    document.body.classList.add('viewfinder-active');
    hud.classList.remove('is-hidden');
    renderHud();

    if (moveHandler) map.off('move', moveHandler);
    moveHandler = () => {
      if (!active || moveRafId) return;
      moveRafId = requestAnimationFrame(() => {
        moveRafId = 0;
        if (!active) return;
        const tape = document.getElementById('vf-compass-tape');
        const bChip = hud.querySelector('.vf-bearing-chip');
        const pBadge = document.getElementById('vf-pitch-badge');
        const lightEl = document.getElementById('vf-light-badge');
        const b = Math.round(((map.getBearing() % 360) + 360) % 360);
        const p = Math.round(map.getPitch ? map.getPitch() : 75);
        state.bearing = b;
        if (bChip) bChip.textContent = `${b}°`;
        if (pBadge) pBadge.textContent = `↕${p}°`;
        if (global.PhotoSimulator && cachedSim) {
          if (tape) {
            const curLens = currentLens();
            tape.innerHTML = `<div class="vf-tape-center"></div>${buildCompassMarkers(b, curLens.hFov, cachedSim)}`;
          }
          if (lightEl) {
            const rel = global.PhotoSimulator.classifyLightAngle(cachedSim.sunPos.azimuth, b, cachedSim.sunPos.altitude);
            lightEl.textContent = `${rel.badge} · ${rel.label}`;
          }
        }
      });
    };
    map.on('move', moveHandler);
  }

  function close() {
    if (!active) return;
    active = false;
    if (moveRafId) {
      cancelAnimationFrame(moveRafId);
      moveRafId = 0;
    }
    const map = typeof global.getGlobeMap === 'function' ? global.getGlobeMap() : null;
    const hud = document.getElementById('viewfinder-hud');

    if (hud) {
      hud.classList.add('is-hidden');
      hud.innerHTML = '';
    }
    document.body.classList.remove('viewfinder-active');

    if (map) {
      if (moveHandler) {
        map.off('move', moveHandler);
        moveHandler = null;
      }
      if (savedCamera) {
        applyMapFov(map, savedCamera.fov);
        map.easeTo({
          center: savedCamera.center,
          zoom: savedCamera.zoom,
          pitch: savedCamera.pitch,
          bearing: savedCamera.bearing,
          duration: 800
        });
      }
      if (global.Terrain3DModule && !savedTerrainState) {
        global.Terrain3DModule.toggleTerrain(map, false);
      }
    }
    savedCamera = null;
  }

  function isOpen() {
    return active;
  }

  global.Viewfinder3D = {
    open,
    close,
    isOpen
  };
})(typeof window !== 'undefined' ? window : globalThis);
