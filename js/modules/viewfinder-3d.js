(function (global) {
  'use strict';

  const FOCAL_LIST = [14, 24, 35, 50, 85, 135, 200];
  let active = false;
  let savedCamera = null;
  let savedTerrainState = false;
  let moveHandler = null;
  let state = {
    dest: null,
    spot: null,
    coords: [0, 0],
    dateStr: new Date().toISOString().slice(0, 10),
    minutes: new Date().getHours() * 60 + new Date().getMinutes(),
    sensorKey: 'fullFrame',
    focalMm: 24,
    bearing: 0
  };

  function esc(str) {
    return String(str || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function applyMapFov(map, vFov) {
    if (!map || !map.transform || typeof map.transform.fov !== 'number') return;
    const clamped = Math.max(18, Math.min(65, Number(vFov) || 40));
    try {
      map.transform.fov = clamped;
      if (typeof map.triggerRepaint === 'function') map.triggerRepaint();
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
      markers.push({ az: sim.sunrisePos.azimuth, label: '↗日出', kind: 'sunrise' });
    }
    if (sim && sim.sunsetPos) {
      markers.push({ az: sim.sunsetPos.azimuth, label: '↘日落', kind: 'sunset' });
    }
    if (sim && sim.astroExtras && sim.astroExtras.available) {
      markers.push({ az: sim.astroExtras.gcAzimuth, label: `✦银心 ${Math.round(sim.astroExtras.gcAltitude)}°`, kind: 'mw' });
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

  function renderHud() {
    const hud = document.getElementById('viewfinder-hud');
    if (!hud || !active) return;

    const map = typeof global.getGlobeMap === 'function' ? global.getGlobeMap() : null;
    const bearing = map ? Math.round(((map.getBearing() % 360) + 360) % 360) : state.bearing;
    state.bearing = bearing;

    const lens = global.PhotoSimulator
      ? global.PhotoSimulator.computeLensFov(state.focalMm, state.sensorKey)
      : { hFov: 73.7, vFov: 53.1, eqFocalMm: state.focalMm, sensorLabel: '全画幅 35mm', aspect: '3:2' };

    const sim = global.PhotoSimulator
      ? global.PhotoSimulator.computeSimulation(state.coords[1], state.coords[0], state.dateStr, state.minutes, bearing)
      : null;

    const elevM = map && global.Terrain3DModule ? global.Terrain3DModule.queryElevation(map, state.coords[0], state.coords[1]) : null;
    const elevLabel = elevM !== null ? `${elevM}m` : ((state.spot && state.spot.elevation) || state.dest.elevation || '--');
    const timeText = `${String(Math.floor(state.minutes / 60)).padStart(2, '0')}:${String(state.minutes % 60).padStart(2, '0')}`;
    const title = state.spot
      ? `${state.dest.shortName || state.dest.name} · ${state.spot.name}`
      : (state.dest.shortName || state.dest.name);

    const frameRatio = lens.aspect === '4:3' ? '4 / 3' : '3 / 2';

    hud.innerHTML = `
      <div class="vf-top-bar">
        <div class="vf-title-pill">
          <span class="vf-live-dot"></span>
          <span>${esc(title)}</span>
          <span class="mono-num vf-bearing-chip">${bearing}°</span>
        </div>
        <div class="vf-compass-tape" id="vf-compass-tape">
          <div class="vf-tape-center"></div>
          ${buildCompassMarkers(bearing, lens.hFov, sim)}
        </div>
        <button id="vf-close-btn" class="vf-exit-btn" type="button">退出取景 <kbd>Esc</kbd></button>
      </div>

      <div class="vf-frame-stage">
        <div class="vf-reticle-box" style="aspect-ratio:${frameRatio};">
          <span class="vf-corner tl"></span>
          <span class="vf-corner tr"></span>
          <span class="vf-corner bl"></span>
          <span class="vf-corner br"></span>
          <div class="vf-thirds-h1"></div>
          <div class="vf-thirds-h2"></div>
          <div class="vf-thirds-v1"></div>
          <div class="vf-thirds-v2"></div>
          <div class="vf-hud-meta-tl mono-num">${state.focalMm}mm · ${esc(lens.sensorLabel)}</div>
          <div class="vf-hud-meta-tr mono-num">FOV ${lens.hFov.toFixed(1)}° × ${lens.vFov.toFixed(1)}° · 等效 ${lens.eqFocalMm}mm</div>
          <div class="vf-hud-meta-bl">${sim ? `${esc(sim.lightRelation.badge)} · ${esc(sim.lightRelation.label)}` : ''}</div>
          <div class="vf-hud-meta-br mono-num">海拔 ${esc(elevLabel)} · 基于 DEM 与几何透视示意</div>
        </div>
      </div>

      <div class="vf-bottom-dock">
        <div class="vf-focal-row">
          <select id="vf-sensor-select" class="vf-select" aria-label="画幅">
            <option value="fullFrame" ${state.sensorKey === 'fullFrame' ? 'selected' : ''}>全画幅</option>
            <option value="apsc" ${state.sensorKey === 'apsc' ? 'selected' : ''}>APS-C</option>
            <option value="m43" ${state.sensorKey === 'm43' ? 'selected' : ''}>M4/3</option>
            <option value="medium" ${state.sensorKey === 'medium' ? 'selected' : ''}>中画幅</option>
          </select>
          ${FOCAL_LIST.map((f) => `<button class="vf-focal-btn ${state.focalMm === f ? 'active' : ''}" data-focal="${f}" type="button">${f}mm</button>`).join('')}
        </div>
        <div class="vf-time-row">
          <input id="vf-date-input" class="vf-date-input mono-num" type="date" value="${esc(state.dateStr)}" aria-label="日期" />
          <span class="mono-num vf-time-val">${timeText}</span>
          <input id="vf-time-range" class="vf-time-range" type="range" min="0" max="1439" step="5" value="${state.minutes}" aria-label="时刻" />
        </div>
      </div>
    `;

    hud.querySelector('#vf-close-btn').addEventListener('click', close);
    hud.querySelector('#vf-sensor-select').addEventListener('change', (e) => {
      state.sensorKey = e.target.value;
      const nextLens = global.PhotoSimulator.computeLensFov(state.focalMm, state.sensorKey);
      applyMapFov(map, nextLens.vFov);
      renderHud();
    });
    hud.querySelectorAll('.vf-focal-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        state.focalMm = Number(btn.dataset.focal) || 24;
        const nextLens = global.PhotoSimulator.computeLensFov(state.focalMm, state.sensorKey);
        applyMapFov(map, nextLens.vFov);
        renderHud();
      });
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
      savedCamera = {
        center: map.getCenter(),
        zoom: map.getZoom(),
        pitch: map.getPitch(),
        bearing: map.getBearing(),
        fov: map.transform && typeof map.transform.fov === 'number' ? map.transform.fov : 36.87
      };
      savedTerrainState = global.Terrain3DModule ? global.Terrain3DModule.getState().terrain : false;
    }

    active = true;
    state.dest = dest;
    state.spot = spot || null;
    state.coords = coords;
    if (opts) {
      if (opts.dateStr) state.dateStr = opts.dateStr;
      if (Number.isFinite(opts.minutes)) state.minutes = opts.minutes;
      if (opts.sensorKey) state.sensorKey = opts.sensorKey;
      if (Number.isFinite(opts.focalMm)) state.focalMm = opts.focalMm;
      if (Number.isFinite(opts.bearing)) state.bearing = opts.bearing;
    }

    if (global.Terrain3DModule && !savedTerrainState) {
      global.Terrain3DModule.toggleTerrain(map, true);
    }

    const lens = global.PhotoSimulator
      ? global.PhotoSimulator.computeLensFov(state.focalMm, state.sensorKey)
      : { vFov: 53.1 };
    applyMapFov(map, lens.vFov);

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
      if (!active) return;
      const tape = document.getElementById('vf-compass-tape');
      const bChip = hud.querySelector('.vf-bearing-chip');
      const b = Math.round(((map.getBearing() % 360) + 360) % 360);
      state.bearing = b;
      if (bChip) bChip.textContent = `${b}°`;
      if (tape && global.PhotoSimulator) {
        const curLens = global.PhotoSimulator.computeLensFov(state.focalMm, state.sensorKey);
        const sim = global.PhotoSimulator.computeSimulation(state.coords[1], state.coords[0], state.dateStr, state.minutes, b);
        tape.innerHTML = `<div class="vf-tape-center"></div>${buildCompassMarkers(b, curLens.hFov, sim)}`;
      }
    };
    map.on('move', moveHandler);
  }

  function close() {
    if (!active) return;
    active = false;
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
