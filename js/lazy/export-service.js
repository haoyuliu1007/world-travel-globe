(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory(typeof globalThis !== 'undefined' ? globalThis : root);
  } else {
    root.ExportService = factory(root);
  }
})(typeof window !== 'undefined' ? window : globalThis, function (global) {
  'use strict';

  function escXml(str) {
    return String(str || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&apos;');
  }

  function csvCell(v) {
    let s = String(v == null ? '' : v);
    // Prevent CSV formula injection (CWE-1236) in Excel / LibreOffice / Google Sheets
    if (/^[\s\t\r]*[=+\-@]/.test(s) || /^[\t\r]/.test(s)) {
      s = "'" + s;
    }
    if (/[",\r\n']/.test(s)) return `"${s.replace(/"/g, '""')}"`;
    return s;
  }

  function icsEscape(str) {
    return String(str || '')
      .replace(/\\/g, '\\\\')
      .replace(/;/g, '\\;')
      .replace(/,/g, '\\,')
      .replace(/\r?\n/g, '\\n');
  }

  function collectTripStops(trip) {
    const t = trip || {};
    const out = [];
    const days = Array.isArray(t.days) ? t.days : (Array.isArray(t.daysList) ? t.daysList : []);
    const baseStart = /^\d{4}-\d{2}-\d{2}$/.test(String(t.startDate || ''))
      ? new Date(`${t.startDate}T00:00:00Z`)
      : new Date();
    for (let i = 0; i < days.length; i += 1) {
      const d = days[i];
      const dayDt = new Date(baseStart.getTime() + (Math.max(1, Number(d.day) || i + 1) - 1) * 86400000);
      const dateStr = dayDt.toISOString().slice(0, 10);
      const stops = Array.isArray(d.stops) ? d.stops : [];
      for (let j = 0; j < stops.length; j += 1) {
        const s = stops[j];
        out.push({
          day: Number(d.day) || i + 1,
          dateStr,
          order: j + 1,
          name: s.name || s.spotName || `Stop ${j + 1}`,
          category: s.category || 'scenic',
          startTime: s.startTime || `${String(Math.min(20, 8 + j * 2)).padStart(2, '0')}:00`,
          durationMin: Number(s.dwellMin || s.durationMin) || 90,
          coords: Array.isArray(s.coords) && s.coords.length >= 2 ? s.coords : null,
          note: s.note || s.tips || '',
          locked: Boolean(s.locked)
        });
      }
    }
    return out;
  }

  function toJSON(trip) {
    return JSON.stringify(Object.assign({ exportedAt: new Date().toISOString(), format: 'KAIROS-Trip-v5' }, trip || {}), null, 2);
  }

  function toCSV(trip) {
    const stops = collectTripStops(trip);
    const header = ['Day', 'Date', 'Order', 'Stop', 'Category', 'StartTime', 'DurationMin', 'Lng', 'Lat', 'Locked', 'Note'];
    const rows = [header.map(csvCell).join(',')];
    for (const s of stops) {
      rows.push([
        s.day,
        s.dateStr,
        s.order,
        s.name,
        s.category,
        s.startTime,
        s.durationMin,
        s.coords ? s.coords[0] : '',
        s.coords ? s.coords[1] : '',
        s.locked ? 'YES' : 'NO',
        s.note
      ].map(csvCell).join(','));
    }
    return '\uFEFF' + rows.join('\r\n');
  }

  function formatIcsDt(dateStr, hhmm) {
    const cleanD = String(dateStr || '2026-04-01').replace(/-/g, '');
    const m = String(hhmm || '09:00').match(/(\d{1,2}):(\d{2})/);
    const hh = String(m ? Number(m[1]) : 9).padStart(2, '0');
    const mm = String(m ? Number(m[2]) : 0).padStart(2, '0');
    return `${cleanD}T${hh}${mm}00`;
  }

  function toICS(trip) {
    const t = trip || {};
    const stops = collectTripStops(t);
    const stamp = new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d+Z$/, 'Z');
    const lines = [
      'BEGIN:VCALENDAR',
      'VERSION:2.0',
      'PRODID:-//KAIROS World Travel Atlas//Trip Planner V5.0//EN',
      'CALSCALE:GREGORIAN',
      `X-WR-CALNAME:${icsEscape(t.name || 'KAIROS Itinerary')}`
    ];
    stops.forEach((s, idx) => {
      const m = s.startTime.match(/(\d{1,2}):(\d{2})/);
      const startMin = (m ? Number(m[1]) * 60 + Number(m[2]) : 540) + s.durationMin;
      const endH = String(Math.floor(Math.min(1435, startMin) / 60)).padStart(2, '0');
      const endM = String(Math.min(1435, startMin) % 60).padStart(2, '0');
      lines.push(
        'BEGIN:VEVENT',
        `UID:kairos-${(t.id || 'trip').replace(/[^a-zA-Z0-9_-]/g, '')}-${idx + 1}@kairos-atlas`,
        `DTSTAMP:${stamp}`,
        `DTSTART:${formatIcsDt(s.dateStr, s.startTime)}`,
        `DTEND:${formatIcsDt(s.dateStr, `${endH}:${endM}`)}`,
        `SUMMARY:${icsEscape(`Day ${s.day}: ${s.name}`)}`,
        `LOCATION:${icsEscape(s.coords ? `${s.name} (${s.coords[1]}, ${s.coords[0]})` : s.name)}`,
        `DESCRIPTION:${icsEscape(s.note || t.name || 'KAIROS Stop')}`,
        'END:VEVENT'
      );
    });
    lines.push('END:VCALENDAR');
    return lines.join('\r\n');
  }

  function toGPX(trip) {
    const t = trip || {};
    const stops = collectTripStops(t).filter((s) => s.coords);
    const wpts = stops.map((s) => (
      `  <wpt lat="${Number(s.coords[1]).toFixed(6)}" lon="${Number(s.coords[0]).toFixed(6)}">\n` +
      `    <name>${escXml(`D${s.day} ${s.name}`)}</name>\n` +
      `    <desc>${escXml(s.note || s.category)}</desc>\n` +
      `  </wpt>`
    )).join('\n');
    const trkpts = stops.map((s) => (
      `      <trkpt lat="${Number(s.coords[1]).toFixed(6)}" lon="${Number(s.coords[0]).toFixed(6)}"><name>${escXml(s.name)}</name></trkpt>`
    )).join('\n');
    return `<?xml version="1.0" encoding="UTF-8"?>\n` +
      `<gpx version="1.1" creator="KAIROS World Travel Atlas V5.0" xmlns="http://www.topografix.com/GPX/1/1">\n` +
      `  <metadata><name>${escXml(t.name || 'KAIROS Trip')}</name></metadata>\n` +
      `${wpts ? wpts + '\n' : ''}` +
      `  <trk>\n    <name>${escXml(t.name || 'KAIROS Route')}</name>\n    <trkseg>\n${trkpts}\n    </trkseg>\n  </trk>\n</gpx>`;
  }

  function toKML(trip) {
    const t = trip || {};
    const stops = collectTripStops(t).filter((s) => s.coords);
    const marks = stops.map((s) => (
      `    <Placemark>\n` +
      `      <name>${escXml(`Day ${s.day} · ${s.name}`)}</name>\n` +
      `      <description>${escXml(s.note || s.startTime)}</description>\n` +
      `      <Point><coordinates>${Number(s.coords[0]).toFixed(6)},${Number(s.coords[1]).toFixed(6)},0</coordinates></Point>\n` +
      `    </Placemark>`
    )).join('\n');
    const lineCoords = stops.map((s) => `${Number(s.coords[0]).toFixed(6)},${Number(s.coords[1]).toFixed(6)},0`).join(' ');
    const routePlacemark = stops.length >= 2
      ? `    <Placemark><name>${escXml(t.name || 'Route')}</name><LineString><coordinates>${lineCoords}</coordinates></LineString></Placemark>\n`
      : '';
    return `<?xml version="1.0" encoding="UTF-8"?>\n` +
      `<kml xmlns="http://www.opengis.net/kml/2.2">\n  <Document>\n    <name>${escXml(t.name || 'KAIROS Trip')}</name>\n` +
      `${marks ? marks + '\n' : ''}${routePlacemark}  </Document>\n</kml>`;
  }

  function toGeoJSON(trip) {
    const t = trip || {};
    const stops = collectTripStops(t).filter((s) => s.coords);
    const features = stops.map((s) => ({
      type: 'Feature',
      properties: {
        day: s.day,
        order: s.order,
        name: s.name,
        category: s.category,
        startTime: s.startTime,
        durationMin: s.durationMin
      },
      geometry: {
        type: 'Point',
        coordinates: [Number(s.coords[0]), Number(s.coords[1])]
      }
    }));
    if (stops.length >= 2) {
      features.push({
        type: 'Feature',
        properties: { name: t.name || 'KAIROS Route', kind: 'route' },
        geometry: {
          type: 'LineString',
          coordinates: stops.map((s) => [Number(s.coords[0]), Number(s.coords[1])])
        }
      });
    }
    return JSON.stringify({ type: 'FeatureCollection', features }, null, 2);
  }

  function toMarkdown(trip) {
    const t = trip || {};
    const stops = collectTripStops(t);
    const lines = [
      `# KAIROS. — ${t.name || 'World Travel Atlas Itinerary'}`,
      '',
      `- **Origin**: ${t.origin || '—'}`,
      `- **Destination**: ${t.destName || t.destId || '—'}`,
      `- **Days**: ${t.daysCount || (Array.isArray(t.days) ? t.days.length : 1)}`,
      `- **Transport**: ${(t.intercityMode || 'flight').toUpperCase()} + ${t.mode || 'driving'}`,
      ''
    ];
    let curDay = null;
    for (const s of stops) {
      if (s.day !== curDay) {
        curDay = s.day;
        lines.push(`## Day ${s.day} (${s.dateStr})`, '');
      }
      const coordTxt = s.coords ? ` (\`${Number(s.coords[1]).toFixed(4)}, ${Number(s.coords[0]).toFixed(4)}\`)` : '';
      lines.push(`- **${s.startTime}** · ${s.name}${coordTxt} — *${s.durationMin} min*${s.locked ? ' [Locked]' : ''}`);
      if (s.note) lines.push(`  - ${s.note}`);
    }
    return lines.join('\n') + '\n';
  }

  function toPrintableHtml(trip) {
    const t = trip || {};
    const stops = collectTripStops(t);
    const rows = stops.map((s) => `<tr><td>Day ${s.day} (${escXml(s.dateStr)})</td><td>${escXml(s.startTime)}</td><td>${escXml(s.name)}</td><td>${escXml(s.note)}</td></tr>`).join('');
    return `<!doctype html><html><head><meta charset="utf-8"><title>${escXml(t.name || 'KAIROS Trip')}</title>` +
      `<style>body{font-family:system-ui,-apple-system,sans-serif;padding:24px;color:#16283F;}table{width:100%;border-collapse:collapse;margin-top:14px;}th,td{border:1px solid #d1d5db;padding:8px;text-align:left;font-size:13px;}th{background:#f3f4f6;}@media print{body{padding:0;}}</style></head>` +
      `<body><h1>KAIROS. — ${escXml(t.name || 'World Travel Atlas Itinerary')}</h1>` +
      `<p>${escXml((t.origin || '') + ' → ' + (t.destName || ''))}</p>` +
      `<table><thead><tr><th>Day</th><th>Time</th><th>Stop</th><th>Notes</th></tr></thead><tbody>${rows}</tbody></table></body></html>`;
  }

  function triggerDownload(content, mime, filename) {
    if (typeof Blob === 'undefined' || typeof document === 'undefined') return false;
    const blob = content instanceof Blob ? content : new Blob([content], { type: mime });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    return true;
  }

  function exportTrip(trip, format) {
    const slug = String((trip && trip.name) || 'kairos-trip').replace(/[^a-zA-Z0-9\u4e00-\u9fa5_-]+/g, '-').slice(0, 40) || 'kairos-trip';
    const f = String(format || 'json').toLowerCase();
    if (f === 'json') return triggerDownload(toJSON(trip), 'application/json', `${slug}.json`);
    if (f === 'md' || f === 'markdown') return triggerDownload(toMarkdown(trip), 'text/markdown;charset=utf-8', `${slug}.md`);
    if (f === 'csv') return triggerDownload(toCSV(trip), 'text/csv;charset=utf-8', `${slug}.csv`);
    if (f === 'ics') return triggerDownload(toICS(trip), 'text/calendar;charset=utf-8', `${slug}.ics`);
    if (f === 'gpx') return triggerDownload(toGPX(trip), 'application/gpx+xml', `${slug}.gpx`);
    if (f === 'kml') return triggerDownload(toKML(trip), 'application/vnd.google-earth.kml+xml', `${slug}.kml`);
    if (f === 'geojson') return triggerDownload(toGeoJSON(trip), 'application/geo+json', `${slug}.geojson`);
    if (f === 'pdf' || f === 'print') {
      const html = toPrintableHtml(trip);
      if (typeof window !== 'undefined' && typeof window.open === 'function') {
        const w = window.open('', '_blank');
        if (w && w.document) {
          w.document.write(html);
          w.document.close();
          if (typeof w.print === 'function') setTimeout(() => w.print(), 200);
          return true;
        }
      }
      return triggerDownload(html, 'text/html;charset=utf-8', `${slug}-print.html`);
    }
    return false;
  }

  function openTripExportModal(trip) {
    if (typeof document === 'undefined') return false;
    let modal = document.getElementById('trip-export-modal');
    if (!modal) {
      modal = document.createElement('div');
      modal.id = 'trip-export-modal';
      modal.className = 'modal-backdrop is-hidden';
      modal.setAttribute('role', 'dialog');
      modal.setAttribute('aria-modal', 'true');
      document.body.appendChild(modal);
    }
    const L = (zh, en) => {
      const lang = global.AppI18n && typeof global.AppI18n.getLang === 'function' ? global.AppI18n.getLang() : 'zh-CN';
      if (lang === 'en') return en;
      if (lang === 'zh-TW' && global.AppI18n && typeof global.AppI18n.toTraditional === 'function') {
        return global.AppI18n.toTraditional(zh);
      }
      return zh;
    };
    const formats = [
      { id: 'ics', label: 'Calendar (.ics)', desc: L('导入 Apple / Google / Outlook 日历 (RFC 5545)', 'Import to Apple/Google/Outlook Calendar') },
      { id: 'gpx', label: 'GPS Route (.gpx)', desc: L('户外手持/手表/两步路 GPX 1.1 轨迹点', 'Outdoor GPS & watches GPX 1.1') },
      { id: 'kml', label: 'Google Earth (.kml)', desc: L('Google Earth / 奥维互动 KML 2.2 图层', 'Google Earth KML 2.2 overlay') },
      { id: 'geojson', label: 'GIS (.geojson)', desc: L('开放标准 GeoJSON FeatureCollection', 'Standard GeoJSON vector features') },
      { id: 'pdf', label: 'Print / PDF', desc: L('干净打印排版，浏览器一键另存 PDF 路书', 'Print-ready HTML/PDF roadbook') },
      { id: 'md', label: 'Markdown (.md)', desc: L('Notion / Obsidian 可编辑路书大纲', 'Clean Markdown outline for Notion/Obsidian') },
      { id: 'csv', label: 'Spreadsheet (.csv)', desc: L('Excel 兼容 UTF-8 BOM 明细表', 'Excel UTF-8 BOM CSV table') },
      { id: 'json', label: 'Archive (.json)', desc: L('完整无损行程 JSON 数据包', 'Full lossless KAIROS JSON') }
    ];
    modal.innerHTML = `
      <div class="modal-card" style="max-width:560px;">
        <div class="modal-head" style="display:flex;justify-content:space-between;align-items:center;">
          <h3>📥 ${L('多格式开放导出与离线包', 'Open Formats Export & Offline Pack')}</h3>
          <button id="exp-modal-close" class="modal-close-btn" type="button" aria-label="Close">×</button>
        </div>
        <div class="modal-body" style="padding:14px 16px;">
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:12px;">
            ${formats.map((f) => `
              <button class="tp-suggestion-item exp-fmt-btn" data-fmt="${f.id}" type="button" style="text-align:left;padding:10px;border:1px solid var(--border-hairline);border-radius:8px;display:block;">
                <div style="font-weight:700;font-size:12.5px;">${f.label}</div>
                <div style="font-size:11px;color:var(--text-muted);margin-top:2px;">${f.desc}</div>
              </button>
            `).join('')}
          </div>
          <div style="padding:10px;border-radius:8px;background:var(--bg-hover);display:flex;justify-content:space-between;align-items:center;gap:8px;flex-wrap:wrap;">
            <div style="font-size:11.5px;color:var(--text-secondary);">
              <strong>${L('目的地离线旅行包', 'Offline Travel Pack')}</strong>
              <div id="exp-offline-status" style="font-size:10.5px;color:var(--text-muted);">${L('仅缓存行程与城市/机场元数据（绝不批量爬取瓦片）', 'Caches itinerary, city spots & gateway metadata only (no bulk tile scraping)')}</div>
            </div>
            <button id="exp-offline-btn" class="primary-btn" type="button">${L('保存离线包', 'Save Offline Pack')}</button>
          </div>
        </div>
      </div>
    `;
    modal.classList.remove('is-hidden');
    modal.setAttribute('aria-label', L('多格式开放导出与离线包', 'Open Formats Export & Offline Pack'));
    const closeExp = () => {
      modal.classList.add('is-hidden');
      modal.innerHTML = '';
    };
    modal.querySelector('#exp-modal-close').addEventListener('click', closeExp);
    modal.addEventListener('click', (e) => { if (e.target === modal) closeExp(); });
    modal.querySelectorAll('.exp-fmt-btn').forEach((btn) => {
      btn.addEventListener('click', () => { exportTrip(trip, btn.dataset.fmt); });
    });
    const offBtn = modal.querySelector('#exp-offline-btn');
    if (offBtn) {
      offBtn.addEventListener('click', async () => {
        const stEl = modal.querySelector('#exp-offline-status');
        if (trip && trip.destId && typeof global.saveOfflineTravelPack === 'function') {
          const res = await global.saveOfflineTravelPack(trip.destId);
          if (stEl) stEl.textContent = res.ok ? `Cached at ${res.cachedAt}` : 'Offline cache unavailable';
        }
      });
    }
    return true;
  }

  return {
    toJSON,
    toMarkdown,
    toCSV,
    toICS,
    toGPX,
    toKML,
    toGeoJSON,
    toPrintableHtml,
    exportTrip,
    openTripExportModal
  };
});
