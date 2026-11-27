(function (global) {
  'use strict';

  let activeViewer = null;
  let fovMarker = null;

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

  function destroyViewer() {
    if (activeViewer && typeof activeViewer.remove === 'function') {
      try {
        activeViewer.remove();
      } catch (e) {
        // ignore
      }
    }
    activeViewer = null;
    if (fovMarker) {
      fovMarker.remove();
      fovMarker = null;
    }
  }

  function close() {
    destroyViewer();
    const modal = document.getElementById('streetview-modal');
    if (modal) {
      modal.classList.add('is-hidden');
      modal.innerHTML = '';
    }
  }

  function syncGlobePosition(lng, lat, bearing) {
    const map = typeof global.getGlobeMap === 'function' ? global.getGlobeMap() : null;
    if (!map || !Number.isFinite(lng) || !Number.isFinite(lat)) return;
    if (!fovMarker && global.maplibregl) {
      const el = document.createElement('div');
      el.style.cssText =
        'width:16px;height:16px;border-radius:50%;background:#38BDF8;border:2px solid #fff;box-shadow:0 0 12px rgba(56,189,248,0.9);';
      fovMarker = new global.maplibregl.Marker({ element: el, anchor: 'center' }).setLngLat([lng, lat]).addTo(map);
    } else if (fovMarker) {
      fovMarker.setLngLat([lng, lat]);
    }
    map.easeTo({ center: [lng, lat], bearing: Number.isFinite(bearing) ? bearing : map.getBearing(), duration: 500 });
  }

  /**
   * Parse a Panoramax STAC Item GeoJSON feature into a normalized streetview record.
   */
  function parsePanoramaxFeature(f) {
    if (!f || typeof f !== 'object') return null;
    const props = f.properties || {};
    const assets = f.assets || {};
    const links = Array.isArray(f.links) ? f.links : [];
    const coords = f.geometry && Array.isArray(f.geometry.coordinates) ? f.geometry.coordinates : null;
    const interior = props['pers:interior_orientation'] || {};
    const fovDeg = Number(interior.field_of_view || 0);
    const isPano = fovDeg >= 350 || props['geovisio:status'] === 'ready' && fovDeg >= 300;
    const sdUrl = (assets.sd && assets.sd.href) || (assets.hd && assets.hd.href) || props['geovisio:image'] || '';
    const hdUrl = (assets.hd && assets.hd.href) || sdUrl;
    const thumbUrl = (assets.thumb && assets.thumb.href) || props['geovisio:thumbnail'] || sdUrl;

    const prevLink = links.find((l) => l.rel === 'prev');
    const nextLink = links.find((l) => l.rel === 'next');
    const viaLink = links.find((l) => l.rel === 'via');
    const licLink = links.find((l) => l.rel === 'license');

    const providers = Array.isArray(f.providers) ? f.providers : [];
    const author =
      (providers[0] && providers[0].name) ||
      (props.exif && props.exif['Exif.Image.Artist']) ||
      props['geovisio:producer'] ||
      'Panoramax Contributor';

    return {
      id: f.id,
      source: 'panoramax',
      coords,
      azimuth: Number.isFinite(Number(props['view:azimuth'])) ? Number(props['view:azimuth']) : 0,
      isPano,
      fovDeg,
      sdUrl,
      hdUrl,
      thumbUrl,
      capturedAt: String(props.datetime || props.datetimetz || '').slice(0, 10),
      author,
      license: props.license || (licLink && licLink.title) || 'Open License',
      licenseUrl: licLink ? licLink.href : '',
      instanceName: (viaLink && (viaLink.instance_name || viaLink.title)) || 'Panoramax',
      prevUrl: prevLink ? prevLink.href : '',
      nextUrl: nextLink ? nextLink.href : ''
    };
  }

  async function queryPanoramaxNearby(lat, lng) {
    const Api = global.ApiClient;
    const caps = Api ? await Api.detectWorkerCapabilities().catch(() => null) : null;
    const d = 0.008;
    const bbox = `${(lng - d).toFixed(5)},${(lat - d).toFixed(5)},${(lng + d).toFixed(5)},${(lat + d).toFixed(5)}`;

    let raw = null;
    if (caps && caps.available && caps.features && caps.features.panoramax) {
      raw = await Api.fetchJson(`/api/panoramax?bbox=${encodeURIComponent(bbox)}&limit=10`, {
        cacheKey: `pnx:worker:${bbox}`,
        ttlMs: 3600000,
        source: 'Panoramax Worker Proxy'
      });
    } else {
      const url = `https://api.panoramax.xyz/api/search?bbox=${encodeURIComponent(bbox)}&limit=10`;
      raw = Api
        ? await Api.fetchJson(url, { cacheKey: `pnx:direct:${bbox}`, ttlMs: 3600000, source: 'Panoramax API' })
        : await (await fetch(url)).json();
    }

    const items = (raw && Array.isArray(raw.features) ? raw.features : [])
      .map(parsePanoramaxFeature)
      .filter((it) => it && it.sdUrl);

    // Prefer true 360° panoramas first
    items.sort((a, b) => Number(b.isPano) - Number(a.isPano));
    return items;
  }

  async function queryMapillaryNearby(lat, lng) {
    const Api = global.ApiClient;
    const caps = Api ? await Api.detectWorkerCapabilities() : { available: false };
    const localToken = global.StorageDB ? await global.StorageDB.getSetting('mapillaryToken', '') : '';

    const d = 0.0045;
    const bbox = `${(lng - d).toFixed(5)},${(lat - d).toFixed(5)},${(lng + d).toFixed(5)},${(lat + d).toFixed(5)}`;

    if (caps && caps.available && caps.features && caps.features.streetview) {
      const data = await Api.fetchJson(`/api/streetview?bbox=${encodeURIComponent(bbox)}&limit=8`, {
        cacheKey: `mly:worker:${bbox}`,
        ttlMs: 3600000,
        source: 'Mapillary Worker Proxy'
      });
      return { configured: true, token: data.clientToken || '', images: data.data || [] };
    }

    if (!localToken) {
      return { configured: false, token: '', images: [] };
    }

    const url = `https://graph.mapillary.com/images?access_token=${encodeURIComponent(localToken)}&fields=id,captured_at,compass_angle,is_pano,computed_geometry,thumb_1024_url&bbox=${bbox}&limit=8`;
    const res = Api
      ? await Api.fetchJson(url, { cacheKey: `mly:direct:${bbox}`, ttlMs: 3600000, source: 'Mapillary Graph API' })
      : await (await fetch(url)).json();
    return { configured: true, token: localToken, images: (res && res.data) || [] };
  }

  /**
   * Zero-dependency WebGL equirectangular 360° panorama viewer with graceful image fallback.
   */
  function mountWebGLPanoViewer(containerEl, imageUrl, opts) {
    const baseAzimuth = Number((opts && opts.baseAzimuth) || 0);
    const onViewChange = opts && opts.onViewChange;

    containerEl.innerHTML = `
      <div class="pano-stage-wrap">
        <canvas class="pano-webgl-canvas"></canvas>
        <div class="pano-overlay-hint">${esc(L('拖拽环视 360° · 滚轮缩放视角 · 双击回正', 'Drag 360° · Scroll to zoom · Double-click to reset'))}</div>
      </div>
    `;

    const wrap = containerEl.querySelector('.pano-stage-wrap');
    const canvas = containerEl.querySelector('.pano-webgl-canvas');
    const gl = canvas.getContext('webgl', { antialias: true, powerPreference: 'default' });

    const fallbackFlat = (reason) => {
      wrap.innerHTML = `
        <div style="width:100%;height:100%;display:flex;flex-direction:column;align-items:center;justify-content:center;padding:12px;gap:8px;">
          <img src="${esc(imageUrl)}" alt="${esc(L('360° 全景影像', '360° Panorama'))}" style="max-width:100%;max-height:calc(100% - 28px);object-fit:contain;border-radius:10px;" />
          <div style="font-size:11px;color:var(--text-secondary);">${esc(reason || L('已切换至高清平面全景浏览', 'Switched to flat panorama viewer'))}</div>
        </div>
      `;
    };

    if (!gl) {
      fallbackFlat(L('当前设备不支持 WebGL，已降级为高清实景视图', 'WebGL unavailable — showing flat HD view'));
      return { remove: () => {} };
    }

    const vsSrc = `
      attribute vec2 a_pos;
      varying vec2 v_uv;
      void main() {
        v_uv = a_pos;
        gl_Position = vec4(a_pos, 0.0, 1.0);
      }
    `;
    const fsSrc = `
      precision mediump float;
      varying vec2 v_uv;
      uniform sampler2D u_tex;
      uniform float u_yaw;
      uniform float u_pitch;
      uniform float u_fov;
      uniform float u_aspect;
      const float PI = 3.14159265359;
      void main() {
        float halfTan = tan(u_fov * 0.5);
        vec3 dir = normalize(vec3(v_uv.x * halfTan * u_aspect, v_uv.y * halfTan, 1.0));
        float cp = cos(u_pitch), sp = sin(u_pitch);
        vec3 d1 = vec3(dir.x, dir.y * cp - dir.z * sp, dir.y * sp + dir.z * cp);
        float cy = cos(u_yaw), sy = sin(u_yaw);
        vec3 d2 = vec3(d1.x * cy + d1.z * sy, d1.y, -d1.x * sy + d1.z * cy);
        float lon = atan(d2.x, d2.z);
        float lat = asin(clamp(d2.y, -1.0, 1.0));
        vec2 texUv = vec2(0.5 + lon / (2.0 * PI), 0.5 - lat / PI);
        gl_FragColor = texture2D(u_tex, texUv);
      }
    `;

    function compile(type, src) {
      const sh = gl.createShader(type);
      gl.shaderSource(sh, src);
      gl.compileShader(sh);
      return sh;
    }

    const prog = gl.createProgram();
    gl.attachShader(prog, compile(gl.VERTEX_SHADER, vsSrc));
    gl.attachShader(prog, compile(gl.FRAGMENT_SHADER, fsSrc));
    gl.linkProgram(prog);
    gl.useProgram(prog);

    const buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
    const posLoc = gl.getAttribLocation(prog, 'a_pos');
    gl.enableVertexAttribArray(posLoc);
    gl.vertexAttribPointer(posLoc, 2, gl.FLOAT, false, 0, 0);

    const uYaw = gl.getUniformLocation(prog, 'u_yaw');
    const uPitch = gl.getUniformLocation(prog, 'u_pitch');
    const uFov = gl.getUniformLocation(prog, 'u_fov');
    const uAspect = gl.getUniformLocation(prog, 'u_aspect');

    const tex = gl.createTexture();
    let yaw = 0;
    let pitch = 0;
    let fovDeg = 76;
    let disposed = false;
    let textureReady = false;
    let rafId = 0;

    function draw() {
      rafId = 0;
      if (disposed || !textureReady) return;
      const dpr = Math.min(global.devicePixelRatio || 1, 2);
      const w = Math.max(1, Math.round(wrap.clientWidth * dpr));
      const h = Math.max(1, Math.round(wrap.clientHeight * dpr));
      if (canvas.width !== w || canvas.height !== h) {
        canvas.width = w;
        canvas.height = h;
      }
      gl.viewport(0, 0, w, h);
      gl.uniform1f(uYaw, yaw);
      gl.uniform1f(uPitch, pitch);
      gl.uniform1f(uFov, (fovDeg * Math.PI) / 180);
      gl.uniform1f(uAspect, w / Math.max(1, h));
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    }

    function scheduleDraw() {
      if (!rafId && !disposed) rafId = requestAnimationFrame(draw);
    }

    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      if (disposed) return;
      try {
        gl.bindTexture(gl.TEXTURE_2D, tex);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.REPEAT);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, img);
        textureReady = true;
        scheduleDraw();
      } catch (err) {
        fallbackFlat(L('全景原图跨域受限，已自动切换为高清实景视图', 'Cross-origin restricted for WebGL texture; showing flat HD view'));
      }
    };
    img.onerror = () => {
      if (!disposed) fallbackFlat(L('全景图像加载失败', 'Failed to load panorama image'));
    };
    img.src = imageUrl;

    let dragging = false;
    let lastX = 0;
    let lastY = 0;

    const notifyBearing = () => {
      if (typeof onViewChange === 'function') {
        const deg = (((baseAzimuth + (yaw * 180) / Math.PI) % 360) + 360) % 360;
        onViewChange(deg);
      }
    };

    const onDown = (x, y) => {
      dragging = true;
      lastX = x;
      lastY = y;
    };
    const onMove = (x, y) => {
      if (!dragging) return;
      const dx = x - lastX;
      const dy = y - lastY;
      lastX = x;
      lastY = y;
      yaw -= dx * 0.0045 * (fovDeg / 75);
      pitch = Math.max(-1.35, Math.min(1.35, pitch + dy * 0.0045 * (fovDeg / 75)));
      scheduleDraw();
    };
    const onUp = () => {
      if (dragging) {
        dragging = false;
        notifyBearing();
      }
    };

    const onMouseDown = (e) => onDown(e.clientX, e.clientY);
    const onMouseMove = (e) => onMove(e.clientX, e.clientY);
    canvas.addEventListener('mousedown', onMouseDown);
    global.addEventListener('mousemove', onMouseMove);
    global.addEventListener('mouseup', onUp);
    canvas.addEventListener('touchstart', (e) => {
      if (e.touches[0]) onDown(e.touches[0].clientX, e.touches[0].clientY);
    }, { passive: true });
    canvas.addEventListener('touchmove', (e) => {
      if (e.touches[0]) onMove(e.touches[0].clientX, e.touches[0].clientY);
    }, { passive: true });
    canvas.addEventListener('touchend', onUp);
    canvas.addEventListener('wheel', (e) => {
      e.preventDefault();
      fovDeg = Math.max(35, Math.min(105, fovDeg + e.deltaY * 0.04));
      scheduleDraw();
    }, { passive: false });
    canvas.addEventListener('dblclick', () => {
      yaw = 0;
      pitch = 0;
      fovDeg = 76;
      scheduleDraw();
      notifyBearing();
    });
    const onResize = () => scheduleDraw();
    global.addEventListener('resize', onResize);

    return {
      remove: () => {
        disposed = true;
        if (rafId) cancelAnimationFrame(rafId);
        canvas.removeEventListener('mousedown', onMouseDown);
        global.removeEventListener('mousemove', onMouseMove);
        global.removeEventListener('mouseup', onUp);
        global.removeEventListener('resize', onResize);
        try {
          gl.deleteTexture(tex);
          gl.deleteBuffer(buf);
          gl.deleteProgram(prog);
          const loseExt = gl.getExtension('WEBGL_lose_context');
          if (loseExt && typeof loseExt.loseContext === 'function') loseExt.loseContext();
        } catch (e) {
          // ignore
        }
      }
    };
  }

  async function open(dest, spot, spotIdx) {
    const modal = document.getElementById('streetview-modal');
    if (!modal || !dest) return;
    destroyViewer();

    const coords = (spot && spot.coords) || dest.coords;
    if (!Array.isArray(coords) || coords.length < 2) return;
    const [lng, lat] = coords;
    const title = spot ? `${tx(dest.shortName || dest.name)} · ${tx(spot.name)}` : tx(dest.name);

    modal.classList.remove('is-hidden');
    modal.innerHTML = `
      <div style="display:flex;align-items:center;justify-content:space-between;padding:12px 16px;border-bottom:1px solid var(--border-hairline);gap:10px;">
        <div style="min-width:0;">
          <div style="font-weight:600;font-size:14px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${icon('eye', 15)} ${esc(L('360° 全景与街景探索', '360° Panorama & Street View'))} · ${esc(title)}</div>
          <div id="sv-status-line" style="font-size:11.5px;color:var(--text-secondary);margin-top:2px;">${esc(L('正在检索 Panoramax 免密钥 360° 全景与 Mapillary 街景…', 'Searching Panoramax open 360° panoramas & Mapillary street view…'))}</div>
        </div>
        <button class="icon-btn" id="sv-close-btn" type="button" aria-label="${esc(L('关闭', 'Close'))}">${icon('x', 16)}</button>
      </div>
      <div class="streetview-body" id="sv-stage">
        <div class="globe-loader" style="position:static;transform:none;"><div class="loader-ring"></div><span>${esc(L('正在检查开放全景资源…', 'Checking open street imagery…'))}</span></div>
      </div>
      <div id="sv-footer" style="padding:10px 16px;border-top:1px solid var(--border-hairline);display:flex;justify-content:space-between;align-items:center;gap:8px;flex-wrap:wrap;font-size:11.5px;">
        <span class="mono-num">${lat.toFixed(5)}, ${lng.toFixed(5)}</span>
        <div style="display:flex;gap:8px;flex-wrap:wrap;">
          <a class="mini-action-pill" href="https://api.panoramax.xyz/#focus=map&map=17/${lat}/${lng}" target="_blank" rel="noopener noreferrer">Panoramax ↗</a>
          <a class="mini-action-pill" href="https://www.mapillary.com/app/?lat=${lat}&lng=${lng}&z=17" target="_blank" rel="noopener noreferrer">Mapillary ↗</a>
          <a class="mini-action-pill" href="https://kartaview.org/map/@${lat},${lng},17z" target="_blank" rel="noopener noreferrer">KartaView ↗</a>
          <a class="mini-action-pill" href="https://www.google.com/maps/@?api=1&map_action=pano&viewpoint=${lat},${lng}" target="_blank" rel="noopener noreferrer">Google Street View ↗</a>
        </div>
      </div>
    `;

    modal.querySelector('#sv-close-btn').addEventListener('click', close);

    const statusEl = modal.querySelector('#sv-status-line');
    const stageEl = modal.querySelector('#sv-stage');

    // Tier 1: Panoramax zero-key open 360° & street imagery
    let pnxItems = [];
    try {
      pnxItems = await queryPanoramaxNearby(lat, lng);
    } catch (e) {
      pnxItems = [];
    }
    if (!document.body.contains(stageEl)) return;

    if (pnxItems.length) {
      let curItem = pnxItems[0];
      const renderPanoramaxItem = (item) => {
        if (!document.body.contains(stageEl)) return;
        destroyViewer();
        curItem = item;
        if (item.coords && item.coords.length >= 2) {
          syncGlobePosition(item.coords[0], item.coords[1], item.azimuth);
        }
        statusEl.innerHTML = `<span class="source-tag routing">${esc(L('Panoramax 开放街景', 'Panoramax Open Street View'))}${item.isPano ? esc(L(' · 360° 全景', ' · 360° Pano')) : ''}</span> ${esc(item.author)} · ${esc(item.capturedAt)} · ${esc(item.license)}`;

        stageEl.innerHTML = `
          <div style="width:100%;height:100%;display:flex;flex-direction:column;">
            <div id="pnx-canvas-mount" style="flex:1;min-height:240px;position:relative;"></div>
            <div style="padding:8px 14px;display:flex;align-items:center;justify-content:space-between;gap:8px;flex-wrap:wrap;border-top:1px solid var(--border-hairline);background:rgba(0,0,0,0.22);">
              <div style="display:flex;gap:6px;overflow-x:auto;max-width:70%;">
                ${pnxItems
                  .map(
                    (it, idx) => `
                  <button class="mini-action-pill pnx-pick-btn ${it.id === item.id ? 'active' : ''}" data-idx="${idx}" type="button">
                    ${it.isPano ? '360°' : esc(L('街景', 'Street'))} #${idx + 1} (${Math.round(it.azimuth)}°)
                  </button>
                `
                  )
                  .join('')}
              </div>
              <div style="display:flex;gap:6px;">
                <button class="mini-action-pill" id="pnx-prev-btn" type="button" ${item.prevUrl ? '' : 'disabled'}>${esc(L('← 上一站', '← Prev'))}</button>
                <button class="mini-action-pill" id="pnx-next-btn" type="button" ${item.nextUrl ? '' : 'disabled'}>${esc(L('下一站 →', 'Next →'))}</button>
              </div>
            </div>
          </div>
        `;

        const mountBox = stageEl.querySelector('#pnx-canvas-mount');
        if (item.isPano) {
          activeViewer = mountWebGLPanoViewer(mountBox, item.sdUrl, {
            baseAzimuth: item.azimuth,
            onViewChange: (az) => {
              if (item.coords) syncGlobePosition(item.coords[0], item.coords[1], az);
            }
          });
        } else {
          mountBox.innerHTML = `<div style="width:100%;height:100%;display:flex;align-items:center;justify-content:center;padding:12px;"><img src="${esc(item.sdUrl)}" alt="${esc(title)}" style="max-width:100%;max-height:100%;object-fit:contain;border-radius:10px;" /></div>`;
        }

        stageEl.querySelectorAll('.pnx-pick-btn').forEach((b) => {
          b.addEventListener('click', () => {
            const nextIt = pnxItems[Number(b.dataset.idx)];
            if (nextIt) renderPanoramaxItem(nextIt);
          });
        });

        const stepSequence = async (seqUrl) => {
          if (!seqUrl) return;
          try {
            const res = await fetch(seqUrl);
            const feat = await res.json();
            const parsed = parsePanoramaxFeature(feat);
            if (parsed && parsed.sdUrl) renderPanoramaxItem(parsed);
          } catch (e) {
            // ignore
          }
        };
        const prevBtn = stageEl.querySelector('#pnx-prev-btn');
        const nextBtn = stageEl.querySelector('#pnx-next-btn');
        if (prevBtn && curItem.prevUrl) prevBtn.addEventListener('click', () => stepSequence(curItem.prevUrl));
        if (nextBtn && curItem.nextUrl) nextBtn.addEventListener('click', () => stepSequence(curItem.nextUrl));
      };

      renderPanoramaxItem(pnxItems[0]);
      return;
    }

    // Tier 2: Mapillary (when configured)
    let mlyResult = { configured: false, token: '', images: [] };
    try {
      mlyResult = await queryMapillaryNearby(lat, lng);
    } catch (e) {
      mlyResult = { configured: true, token: '', images: [], error: e.message };
    }

    if (!document.body.contains(stageEl)) return;

    if (mlyResult.configured && mlyResult.images.length) {
      const imgs = mlyResult.images;
      const first = imgs[0];
      const panoCount = imgs.filter((i) => i.is_pano).length;
      statusEl.innerHTML = `<span class="source-tag routing">${esc(L(`已覆盖 · ${imgs.length} 张街景`, `Covered · ${imgs.length} shots`))}${panoCount ? esc(L(` (含 ${panoCount} 张 360° 全景)`, ` (${panoCount} 360°)`)) : ''}</span> · Mapillary CC BY-SA 4.0`;

      if (mlyResult.token && global.LazyLoader) {
        try {
          stageEl.innerHTML = `<div id="mly-viewer-mount" style="width:100%;height:100%;"></div>`;
          const mlyLib = await global.LazyLoader.ensureMapillary();
          if (!document.body.contains(stageEl)) return;
          activeViewer = new mlyLib.Viewer({
            accessToken: mlyResult.token,
            container: 'mly-viewer-mount',
            imageId: first.id
          });
          activeViewer.on('image', (ev) => {
            const img = ev.image;
            if (img && img.lngLat) {
              syncGlobePosition(img.lngLat.lng, img.lngLat.lat, img.compassAngle);
            }
          });
          return;
        } catch (e) {
          // Fall through to thumbnail strip
        }
      }

      stageEl.innerHTML = `
        <div style="width:100%;height:100%;display:flex;flex-direction:column;justify-content:center;align-items:center;padding:16px;gap:10px;">
          <img id="sv-main-img" src="${esc(first.thumb_1024_url)}" alt="${esc(title)}" style="max-width:100%;max-height:calc(100% - 74px);object-fit:contain;border-radius:10px;" />
          <div style="display:flex;gap:6px;overflow-x:auto;max-width:100%;">
            ${imgs
              .map(
                (im, idx) => `
              <button class="sv-pick-btn mini-action-pill" data-idx="${idx}" type="button">
                ${im.is_pano ? '360°' : esc(L('街景', 'Street'))} #${idx + 1} (${Math.round(im.compass_angle || 0)}°)
              </button>
            `
              )
              .join('')}
          </div>
        </div>
      `;
      stageEl.querySelectorAll('.sv-pick-btn').forEach((btn) => {
        btn.addEventListener('click', () => {
          const im = imgs[Number(btn.dataset.idx)];
          if (!im) return;
          stageEl.querySelector('#sv-main-img').src = im.thumb_1024_url;
          const g = im.computed_geometry && im.computed_geometry.coordinates;
          if (g) syncGlobePosition(g[0], g[1], im.compass_angle);
        });
      });
      return;
    }

    // Tier 3: Graceful Degradation to Wikimedia Commons real/panoramic photos
    statusEl.innerHTML = `<span class="source-tag empirical">${esc(L('附近暂无开放街景 · 已自动降级为 Wikimedia 实景照片', 'No open street view nearby · Falling back to Wikimedia field photos'))}</span>`;

    try {
      const photos = global.MediaWikidataService
        ? await global.MediaWikidataService.fetchPlacePhotos({
            id: `${dest.id}-sv-${spotIdx ?? 'city'}`,
            lat,
            lng,
            name: spot ? spot.name : (dest.shortName || dest.name),
            country: dest.country,
            radiusM: 2500,
            limit: 6
          })
        : [];
      if (!document.body.contains(stageEl)) return;

      if (!photos.length) {
        stageEl.innerHTML = `
          <div style="text-align:center;color:var(--text-secondary);padding:24px;max-width:440px;">
            <div style="font-size:15px;font-weight:600;color:var(--text-primary);margin-bottom:8px;">${esc(L('附近暂无开放街景或实景照片', 'No open street view or field photos nearby'))}</div>
            <p style="font-size:12.5px;line-height:1.6;">${esc(L('可使用下方按钮直接在 Panoramax、Mapillary、KartaView 或 Google Street View 地图页面查看该坐标周边最新全景。', 'Use the links below to inspect live Panoramax, Mapillary, KartaView, or Google Street View coverage at these coordinates.'))}</p>
          </div>
        `;
        return;
      }

      let curIdx = 0;
      const renderFallback = () => {
        const p = photos[curIdx];
        stageEl.innerHTML = `
          <div style="width:100%;height:100%;display:flex;flex-direction:column;justify-content:center;align-items:center;padding:16px;gap:10px;">
            <img src="${esc(p.fullUrl || p.thumbUrl)}" alt="${esc(p.title)}" style="max-width:100%;max-height:calc(100% - 88px);object-fit:contain;border-radius:10px;" />
            <div style="color:#E4E4E7;font-size:12px;text-align:center;">
              <strong>${esc(p.title)}</strong> ${p.isPano ? `<span class="source-tag realtime">${esc(L('全景幅', 'Panorama'))}</span>` : ''} · ${esc(p.author)} (${esc(p.license)})
            </div>
            <div style="display:flex;gap:6px;flex-wrap:wrap;justify-content:center;">
              ${photos.map((_, idx) => `<button class="mini-action-pill sv-fb-btn ${idx === curIdx ? 'active' : ''}" data-idx="${idx}" type="button">#${idx + 1}</button>`).join('')}
            </div>
          </div>
        `;
        stageEl.querySelectorAll('.sv-fb-btn').forEach((b) => {
          b.addEventListener('click', () => {
            curIdx = Number(b.dataset.idx);
            renderFallback();
          });
        });
      };
      renderFallback();
    } catch (e) {
      stageEl.innerHTML = `<div style="color:var(--text-secondary);padding:24px;">${esc(L('实景加载失败，请使用下方外部街景链接。', 'Failed to load imagery; use the external links below.'))}</div>`;
    }
  }

  const api = {
    open,
    close,
    parsePanoramaxFeature,
    queryPanoramaxNearby
  };

  global.StreetViewModule = api;
  if (typeof module === 'object' && module.exports) {
    module.exports = api;
  }
})(typeof window !== 'undefined' ? window : globalThis);
