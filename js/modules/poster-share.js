(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory(typeof globalThis !== 'undefined' ? globalThis : root);
  } else {
    root.PosterShare = factory(root);
  }
})(typeof window !== 'undefined' ? window : globalThis, function (global) {
  'use strict';

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

  function t(key, vars) {
    return global.AppI18n ? global.AppI18n.t(key, vars) : key;
  }

  function tx(str) {
    return global.AppI18n ? global.AppI18n.tx(str) : (str || '');
  }

  function buildEmbedIframeCode(dest, baseOrigin) {
    const id = dest && dest.id ? dest.id : 'global';
    const base = baseOrigin || (global.location ? `${global.location.origin}${global.location.pathname}` : 'https://world-travel-globe.globe-app.workers.dev/');
    const cleanBase = base.endsWith('/') ? base : base.replace(/index\.html$/, '');
    const src = `${cleanBase}?embed=${encodeURIComponent(id)}&chrome=off`;
    const title = dest ? `KAIROS · ${dest.shortName || dest.name}` : 'KAIROS · World Travel Atlas';
    return `<iframe src="${src}" title="${esc(title)}" width="100%" height="460" style="border:0;border-radius:16px;overflow:hidden;" loading="lazy" allowfullscreen></iframe>`;
  }

  /**
   * Capture a crisp one-frame snapshot from MapLibre without enabling preserveDrawingBuffer permanently.
   */
  function captureGlobeSnapshot(map) {
    return new Promise((resolve) => {
      if (!map || typeof map.getCanvas !== 'function' || typeof map.once !== 'function') {
        resolve(null);
        return;
      }
      let settled = false;
      const timer = setTimeout(() => {
        if (!settled) {
          settled = true;
          resolve(null);
        }
      }, 450);

      map.once('render', () => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        try {
          const canvas = map.getCanvas();
          const img = new Image();
          img.onload = () => resolve(img);
          img.onerror = () => resolve(null);
          img.src = canvas.toDataURL('image/png');
        } catch (e) {
          resolve(null);
        }
      });
      if (typeof map.triggerRepaint === 'function') map.triggerRepaint();
    });
  }

  function drawRoundedRect(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  function wrapCanvasText(ctx, text, x, y, maxWidth, lineHeight, maxLines) {
    const words = String(text || '');
    let line = '';
    let curY = y;
    let lines = 0;
    for (let i = 0; i < words.length; i++) {
      const ch = words[i];
      const test = line + ch;
      if (ctx.measureText(test).width > maxWidth && line.length > 0) {
        lines++;
        if (maxLines && lines >= maxLines) {
          ctx.fillText(line.slice(0, Math.max(1, line.length - 1)) + '…', x, curY);
          return curY + lineHeight;
        }
        ctx.fillText(line, x, curY);
        line = ch;
        curY += lineHeight;
      } else {
        line = test;
      }
    }
    if (line) {
      ctx.fillText(line, x, curY);
      curY += lineHeight;
    }
    return curY;
  }

  function drawProceduralGlobeFallback(ctx, x, y, w, h, coords) {
    const cx = x + w / 2;
    const cy = y + h / 2;
    const rad = Math.min(w, h) * 0.36;
    const bg = ctx.createRadialGradient(cx - rad * 0.3, cy - rad * 0.3, 18, cx, cy, rad * 1.45);
    bg.addColorStop(0, '#1D3B6E');
    bg.addColorStop(0.6, '#0B162C');
    bg.addColorStop(1, '#04070F');
    ctx.fillStyle = bg;
    ctx.fillRect(x, y, w, h);

    ctx.strokeStyle = 'rgba(226, 192, 125, 0.25)';
    ctx.lineWidth = 1.5;
    for (let r = 0.35; r <= 1.05; r += 0.35) {
      ctx.beginPath();
      ctx.ellipse(cx, cy, rad * r, rad, 0, 0, Math.PI * 2);
      ctx.stroke();
    }
    for (let dy = -0.5; dy <= 0.5; dy += 0.5) {
      ctx.beginPath();
      ctx.ellipse(cx, cy + rad * dy, rad * Math.cos(dy * Math.PI * 0.5), rad * 0.14, 0, 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.strokeStyle = 'rgba(226, 192, 125, 0.72)';
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.arc(cx, cy, rad, 0, Math.PI * 2);
    ctx.stroke();

    if (Array.isArray(coords) && coords.length >= 2) {
      ctx.fillStyle = '#FBBF24';
      ctx.beginPath();
      ctx.arc(cx + 12, cy - 10, 7, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  async function renderPosterCanvas(spec) {
    const W = 1080;
    const H = 1620;
    const canvas = document.createElement('canvas');
    canvas.width = W;
    canvas.height = H;
    const ctx = canvas.getContext('2d');

    // Deep obsidian editorial canvas
    const grad = ctx.createLinearGradient(0, 0, W, H);
    grad.addColorStop(0, '#070B16');
    grad.addColorStop(0.5, '#0D1528');
    grad.addColorStop(1, '#050811');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, W, H);

    // Subtle decorative border
    ctx.strokeStyle = 'rgba(226, 192, 125, 0.26)';
    ctx.lineWidth = 2;
    drawRoundedRect(ctx, 32, 32, W - 64, H - 64, 28);
    ctx.stroke();

    // Kicker header
    ctx.fillStyle = '#E8A33D';
    ctx.font = '600 22px "Inter", "PingFang SC", sans-serif';
    ctx.fillText(spec.kicker || 'KAIROS. · WORLD TRAVEL ATLAS', 72, 92);

    ctx.fillStyle = 'rgba(226, 232, 240, 0.55)';
    ctx.font = '500 20px "IBM Plex Mono", monospace';
    ctx.textAlign = 'right';
    ctx.fillText(spec.coordsText || 'GEO INTELLIGENCE', W - 72, 92);
    ctx.textAlign = 'left';

    // Globe viewport snapshot box
    const imgX = 72;
    const imgY = 128;
    const imgW = W - 144;
    const imgH = 620;
    ctx.save();
    drawRoundedRect(ctx, imgX, imgY, imgW, imgH, 24);
    ctx.clip();
    if (spec.globeImg) {
      const srcAspect = spec.globeImg.width / Math.max(1, spec.globeImg.height);
      const dstAspect = imgW / imgH;
      let sx = 0, sy = 0, sw = spec.globeImg.width, sh = spec.globeImg.height;
      if (srcAspect > dstAspect) {
        sw = spec.globeImg.height * dstAspect;
        sx = (spec.globeImg.width - sw) / 2;
      } else {
        sh = spec.globeImg.width / dstAspect;
        sy = (spec.globeImg.height - sh) / 2;
      }
      ctx.drawImage(spec.globeImg, sx, sy, sw, sh, imgX, imgY, imgW, imgH);
    } else {
      drawProceduralGlobeFallback(ctx, imgX, imgY, imgW, imgH, spec.coords);
    }
    const overlay = ctx.createLinearGradient(0, imgY + imgH - 180, 0, imgY + imgH);
    overlay.addColorStop(0, 'rgba(7, 11, 22, 0)');
    overlay.addColorStop(1, 'rgba(7, 11, 22, 0.88)');
    ctx.fillStyle = overlay;
    ctx.fillRect(imgX, imgY, imgW, imgH);
    ctx.restore();

    ctx.strokeStyle = 'rgba(255, 255, 255, 0.16)';
    ctx.lineWidth = 2;
    drawRoundedRect(ctx, imgX, imgY, imgW, imgH, 24);
    ctx.stroke();

    // Title & Subtitle
    ctx.fillStyle = '#F8FAFC';
    ctx.font = '700 54px "Inter", "PingFang SC", "Microsoft YaHei", sans-serif';
    let curY = wrapCanvasText(ctx, spec.title || '', 72, 830, W - 144, 68, 2);

    ctx.fillStyle = '#94A3B8';
    ctx.font = '400 28px "Inter", "PingFang SC", "Microsoft YaHei", sans-serif';
    curY = wrapCanvasText(ctx, spec.subtitle || '', 72, curY + 12, W - 144, 42, 3);

    // Metric pills row
    const pills = Array.isArray(spec.metrics) ? spec.metrics.slice(0, 3) : [];
    const pillY = Math.max(curY + 24, 1060);
    const gap = 18;
    const pillW = pills.length ? Math.floor((W - 144 - gap * (pills.length - 1)) / pills.length) : 0;
    pills.forEach((m, idx) => {
      const px = 72 + idx * (pillW + gap);
      ctx.fillStyle = 'rgba(255, 255, 255, 0.05)';
      drawRoundedRect(ctx, px, pillY, pillW, 110, 16);
      ctx.fill();
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.12)';
      ctx.stroke();

      ctx.fillStyle = '#94A3B8';
      ctx.font = '500 20px "Inter", "PingFang SC", sans-serif';
      ctx.fillText(m.label, px + 22, pillY + 38);

      ctx.fillStyle = '#E2C07D';
      ctx.font = '700 30px "IBM Plex Mono", "Inter", sans-serif';
      ctx.fillText(m.value, px + 22, pillY + 82);
    });

    // Bottom bars or highlights
    const chartY = pillY + 146;
    ctx.fillStyle = '#CBD5E1';
    ctx.font = '600 22px "Inter", "PingFang SC", sans-serif';
    ctx.fillText(spec.sectionTitle || '12-MONTH PHENOLOGY & HIGHLIGHTS', 72, chartY);

    if (Array.isArray(spec.bars) && spec.bars.length) {
      const barBaseY = chartY + 170;
      const maxH = 120;
      const bw = Math.floor((W - 144 - (spec.bars.length - 1) * 14) / spec.bars.length);
      spec.bars.forEach((b, idx) => {
        const bx = 72 + idx * (bw + 14);
        const bh = Math.max(10, Math.round((Math.min(100, b.pct) / 100) * maxH));
        ctx.fillStyle = b.color || (b.pct >= 80 ? '#E2C07D' : '#38BDF8');
        drawRoundedRect(ctx, bx, barBaseY - bh, bw, bh, 6);
        ctx.fill();
        ctx.fillStyle = '#94A3B8';
        ctx.font = '500 18px "IBM Plex Mono", sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText(b.label, bx + bw / 2, barBaseY + 28);
      });
      ctx.textAlign = 'left';
    } else if (Array.isArray(spec.lines) && spec.lines.length) {
      ctx.fillStyle = '#CBD5E1';
      ctx.font = '400 24px "Inter", "PingFang SC", sans-serif';
      spec.lines.slice(0, 5).forEach((ln, idx) => {
        ctx.fillText(ln, 72, chartY + 46 + idx * 40);
      });
    }

    // Footer
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.10)';
    ctx.beginPath();
    ctx.moveTo(72, H - 108);
    ctx.lineTo(W - 72, H - 108);
    ctx.stroke();

    // KAIROS Enso emblem + brand footer
    ctx.save();
    ctx.strokeStyle = '#FAF8F4';
    ctx.lineWidth = 3.2;
    ctx.beginPath();
    ctx.arc(88, H - 72, 13, Math.PI * 0.35, Math.PI * 2.08);
    ctx.stroke();
    ctx.fillStyle = '#E8A33D';
    ctx.beginPath();
    ctx.arc(98, H - 62, 3.4, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    ctx.fillStyle = '#E8A33D';
    ctx.font = '600 22px "Inter", "PingFang SC", sans-serif';
    ctx.fillText('KAIROS. · WORLD TRAVEL ATLAS', 114, H - 64);

    ctx.fillStyle = '#94A3B8';
    ctx.font = '500 18px "IBM Plex Mono", monospace';
    ctx.textAlign = 'right';
    ctx.fillText(spec.footerUrl || 'world-travel-globe.globe-app.workers.dev', W - 72, H - 64);
    ctx.textAlign = 'left';

    return new Promise((resolve) => {
      canvas.toBlob((blob) => {
        resolve({
          dataUrl: canvas.toDataURL('image/png'),
          blob,
          filename: spec.filename || 'kairos-poster.png',
          title: spec.title || 'KAIROS · World Travel Atlas',
          text: spec.subtitle || '',
          shareUrl: spec.shareUrl || 'https://world-travel-globe.globe-app.workers.dev/'
        });
      }, 'image/png');
    });
  }

  async function generateDestinationPoster(dest, map) {
    if (!dest) return null;
    const globeImg = await captureGlobeSnapshot(map);
    const months = Array.isArray(dest.months) && dest.months.length === 12
      ? dest.months
      : Array.from({ length: 12 }, (_, i) => ({ m: i + 1, score: (dest.monthScores && dest.monthScores[i]) || 3 }));
    const lat = Array.isArray(dest.coords) ? dest.coords[1] : 0;
    const lng = Array.isArray(dest.coords) ? dest.coords[0] : 0;
    const base = global.location ? `${global.location.origin}${global.location.pathname}` : 'https://world-travel-globe.globe-app.workers.dev/';
    return renderPosterCanvas({
      kicker: `${tx(dest.country || '')} · ${tx(dest.province || dest.region || '')}`.toUpperCase(),
      coordsText: `${Math.abs(lat).toFixed(2)}°${lat >= 0 ? 'N' : 'S'}, ${Math.abs(lng).toFixed(2)}°${lng >= 0 ? 'E' : 'W'}`,
      coords: dest.coords,
      globeImg,
      title: tx(dest.name),
      subtitle: tx(dest.subtitle || dest.heroSummary || ''),
      metrics: [
        { label: 'Curated Spots', value: String(dest.spotCount || (dest.spots ? dest.spots.length : 0)) },
        { label: 'Suggested Stay', value: tx(dest.suggestedDays || '3-5d') },
        { label: 'Elevation', value: tx(dest.elevation || '--').slice(0, 14) }
      ],
      sectionTitle: '12-MONTH PHENOLOGY INDEX',
      bars: months.map((m) => ({
        label: String(m.m),
        pct: Math.round(((Number(m.score) || 2) / 5) * 100),
        color: m.score >= 5 ? '#E2C07D' : m.score === 4 ? '#38BDF8' : '#475569'
      })),
      filename: `wtg-${dest.id}.png`,
      shareUrl: `${base}?focus=${encodeURIComponent(dest.id)}`
    });
  }

  async function generateFootprintPoster(stats, statuses, allDests, map) {
    const globeImg = await captureGlobeSnapshot(map);
    const destMap = new Map((allDests || []).map((d) => [d.id, d]));
    const counts = { asia: 0, europe: 0, oceania: 0, north_america: 0, south_america: 0, africa_antarctica: 0 };
    (statuses || []).filter((s) => s.status === 'visited').forEach((s) => {
      const d = destMap.get(s.destId);
      if (d && counts[d.continent] !== undefined) counts[d.continent]++;
    });
    const maxC = Math.max(1, ...Object.values(counts));
    const labels = [
      ['asia', 'Asia'],
      ['europe', 'Europe'],
      ['north_america', 'N.Am'],
      ['south_america', 'S.Am'],
      ['oceania', 'Oceania'],
      ['africa_antarctica', 'Afr/Ant']
    ];
    return renderPosterCanvas({
      kicker: 'PRIVATE FOOTPRINT ARCHIVE · KAIROS',
      coordsText: `${stats.visitedCount} / ${stats.citiesTotal} CITIES`,
      globeImg,
      title: t('archiveTitle'),
      subtitle: `${stats.countriesVisited}/${stats.countriesTotal} Countries · ${stats.continentsVisited}/6 Continents · ${stats.completionPct}% World Coverage`,
      metrics: [
        { label: 'Visited', value: String(stats.visitedCount) },
        { label: 'Countries', value: `${stats.countriesVisited}/${stats.countriesTotal}` },
        { label: 'Planned / Wish', value: `${stats.plannedCount} / ${stats.wishlistCount}` }
      ],
      sectionTitle: 'VISITED CITIES BY CONTINENT',
      bars: labels.map(([k, lbl]) => ({
        label: `${lbl} (${counts[k]})`,
        pct: Math.round((counts[k] / maxC) * 100),
        color: '#34D399'
      })),
      filename: `wtg-footprints-${new Date().toISOString().slice(0, 10)}.png`
    });
  }

  async function generateTripPoster(trip, map) {
    if (!trip) return null;
    const globeImg = await captureGlobeSnapshot(map);
    const totalStops = (trip.days || []).reduce((s, d) => s + (d.stops ? d.stops.length : 0), 0);
    const totalBudget = (trip.budgetItems || []).reduce((s, b) => s + (Number(b.cost) || 0), 0) || Number(trip.budgetRmb || 0);
    return renderPosterCanvas({
      kicker: 'SMART TRIP ITINERARY · KAIROS',
      coordsText: `${(trip.days || []).length} DAYS · ${totalStops} STOPS`,
      globeImg,
      title: trip.name || trip.destName || 'Trip Itinerary',
      subtitle: `${trip.origin || ''} → ${tx(trip.destName || '')} · Mode: ${trip.mode || 'driving'} · Est. Budget: ¥${totalBudget.toLocaleString()}`,
      metrics: [
        { label: 'Days', value: String((trip.days || []).length) },
        { label: 'Curated Stops', value: String(totalStops) },
        { label: 'Est. Budget', value: `¥${totalBudget.toLocaleString()}` }
      ],
      sectionTitle: 'DAILY ROUTE HIGHLIGHTS',
      lines: (trip.days || []).slice(0, 5).map((d) => `Day ${d.day}: ${(d.stops || []).map((s) => tx(s.name)).slice(0, 3).join(' · ') || d.title}`),
      filename: `wtg-trip-${(trip.id || 'plan')}.png`
    });
  }

  function closeModal() {
    const modal = document.getElementById('poster-share-modal');
    if (modal) {
      modal.classList.add('is-hidden');
      modal.innerHTML = '';
    }
  }

  function openPosterModal(poster) {
    const modal = document.getElementById('poster-share-modal');
    if (!modal || !poster) return;
    modal.classList.remove('is-hidden');
    modal.onclick = (e) => {
      if (e.target === modal) closeModal();
    };
    const lang = global.AppI18n ? global.AppI18n.getLang() : 'zh-CN';
    const isEn = lang === 'en';
    modal.innerHTML = `
      <div class="poster-dialog">
        <div class="epic-head">
          <strong>${icon('share', 15)} ${isEn ? 'Retina Travel Poster' : '高清旅行分享海报 (1080×1620)'}</strong>
          <button id="poster-close-btn" class="icon-btn" type="button">${icon('x', 15)}</button>
        </div>
        <div class="poster-preview-wrap">
          <img src="${poster.dataUrl}" alt="${esc(poster.title)}" />
        </div>
        <div class="poster-actions">
          <button id="poster-sys-share-btn" class="primary-btn" type="button">${icon('share', 14)} ${isEn ? 'System Share' : '调起系统分享'}</button>
          <a id="poster-download-btn" class="secondary-btn" href="${poster.dataUrl}" download="${esc(poster.filename)}" style="text-decoration:none;display:inline-flex;align-items:center;gap:6px;">${icon('download', 14)} ${isEn ? 'Download PNG' : '保存 PNG 海报'}</a>
          <button id="poster-copy-link-btn" class="secondary-btn" type="button">${isEn ? 'Copy Link' : '复制直达链接'}</button>
        </div>
        <div id="poster-share-status" style="font-size:11.5px;color:var(--accent-primary);text-align:center;min-height:16px;"></div>
      </div>
    `;

    modal.querySelector('#poster-close-btn').addEventListener('click', closeModal);
    modal.querySelector('#poster-sys-share-btn').addEventListener('click', async () => {
      const statusEl = modal.querySelector('#poster-share-status');
      try {
        if (global.navigator && typeof global.navigator.share === 'function') {
          if (poster.blob && typeof File === 'function') {
            const file = new File([poster.blob], poster.filename, { type: 'image/png' });
            if (!global.navigator.canShare || global.navigator.canShare({ files: [file] })) {
              await global.navigator.share({ files: [file], title: poster.title, text: poster.text, url: poster.shareUrl });
              return;
            }
          }
          await global.navigator.share({ title: poster.title, text: poster.text, url: poster.shareUrl });
          return;
        }
      } catch (err) {
        if (err && err.name === 'AbortError') return;
      }
      if (global.navigator && global.navigator.clipboard) {
        await global.navigator.clipboard.writeText(poster.shareUrl).catch(() => {});
      }
      if (statusEl) {
        statusEl.textContent = isEn
          ? 'Native file share unavailable in this desktop browser — link copied & PNG ready to download!'
          : '当前桌面浏览器不支持图片直传，已复制链接，可点击「保存 PNG 海报」发送！';
      }
    });
    modal.querySelector('#poster-copy-link-btn').addEventListener('click', async () => {
      const statusEl = modal.querySelector('#poster-share-status');
      if (global.navigator && global.navigator.clipboard) {
        await global.navigator.clipboard.writeText(poster.shareUrl).catch(() => {});
      }
      if (statusEl) statusEl.textContent = isEn ? 'Deep link copied!' : '已复制目的地直达链接！';
    });
  }

  return {
    captureGlobeSnapshot,
    renderPosterCanvas,
    generateDestinationPoster,
    generateFootprintPoster,
    generateTripPoster,
    openPosterModal,
    closeModal,
    buildEmbedIframeCode
  };
});
