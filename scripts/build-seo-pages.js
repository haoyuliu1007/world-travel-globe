'use strict';

const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const SITE_ORIGIN = 'https://world-travel-globe.globe-app.workers.dev';
const CONTINENT_META = {
  asia: { zh: '亚洲', en: 'Asia' },
  europe: { zh: '欧洲', en: 'Europe' },
  north_america: { zh: '北美洲', en: 'North America' },
  south_america: { zh: '南美洲', en: 'South America' },
  oceania: { zh: '大洋洲', en: 'Oceania' },
  africa_antarctica: { zh: '非洲与南极', en: 'Africa & Antarctica' }
};

function esc(str) {
  return String(str || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function hashHue(id) {
  const s = String(id || 'globe');
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return h % 360;
}

/* Pure Node.js CRC32 + zlib PNG writer for 1200x630 fallback OG raster cover */
const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1);
    t[n] = c >>> 0;
  }
  return t;
})();

function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function pngChunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const typeBuf = Buffer.from(type, 'ascii');
  const crcBuf = Buffer.alloc(4);
  const combined = Buffer.concat([typeBuf, data]);
  crcBuf.writeUInt32BE(crc32(combined), 0);
  return Buffer.concat([len, typeBuf, data, crcBuf]);
}

function generateFallbackCoverPng() {
  const W = 1200;
  const H = 630;
  const stride = W * 4 + 1;
  const raw = Buffer.alloc(stride * H);
  const cx = W * 0.5;
  const cy = H * 0.52;
  const ringR = 205;

  for (let y = 0; y < H; y++) {
    const rowStart = y * stride;
    raw[rowStart] = 0; // filter type None
    for (let x = 0; x < W; x++) {
      const dx = x - cx;
      const dy = y - cy;
      const dist = Math.hypot(dx, dy);
      const vignette = Math.max(0, 1 - dist / 760);

      let r = Math.round(6 + 18 * vignette);
      let g = Math.round(10 + 30 * vignette);
      let b = Math.round(22 + 56 * vignette);

      // Subtle glowing golden globe ring
      const ringDelta = Math.abs(dist - ringR);
      if (ringDelta < 3.2) {
        const w = 1 - ringDelta / 3.2;
        r = Math.min(255, Math.round(r + 226 * w * 0.85));
        g = Math.min(255, Math.round(g + 192 * w * 0.85));
        b = Math.min(255, Math.round(b + 125 * w * 0.85));
      } else if (dist < ringR - 3) {
        // Illuminated globe sphere
        const sphereFade = Math.max(0, 1 - dist / ringR);
        r = Math.min(255, Math.round(r + 16 * sphereFade));
        g = Math.min(255, Math.round(g + 44 * sphereFade));
        b = Math.min(255, Math.round(b + 88 * sphereFade));
      }

      // Deterministic star specks outside ring
      if (dist > ringR + 14 && ((x * 73856093) ^ (y * 19349663)) % 997 === 0) {
        r = 228;
        g = 236;
        b = 250;
      }

      const off = rowStart + 1 + x * 4;
      raw[off] = r;
      raw[off + 1] = g;
      raw[off + 2] = b;
      raw[off + 3] = 255;
    }
  }

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(W, 0);
  ihdr.writeUInt32BE(H, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // RGBA
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;

  const idat = zlib.deflateSync(raw, { level: 6 });
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    pngChunk('IHDR', ihdr),
    pngChunk('IDAT', idat),
    pngChunk('IEND', Buffer.alloc(0))
  ]);
}

function generateOgSvg(dest) {
  const hue = hashHue(dest.id);
  const hue2 = (hue + 38) % 360;
  const lat = Array.isArray(dest.coords) ? Number(dest.coords[1]) || 0 : 0;
  const lng = Array.isArray(dest.coords) ? Number(dest.coords[0]) || 0 : 0;
  const pinX = Math.round(740 + ((lng + 180) / 360) * 390);
  const pinY = Math.round(130 + ((90 - lat) / 180) * 210);
  const months = Array.isArray(dest.months) && dest.months.length === 12
    ? dest.months
    : Array.from({ length: 12 }, (_, i) => ({ m: i + 1, score: 3 }));
  const spotCount = Array.isArray(dest.spots) ? dest.spots.length : (dest.spotCount || 0);
  const barsSvg = months.map((m, i) => {
    const h = Math.max(8, Math.round(((Number(m.score) || 2) / 5) * 84));
    const bx = 64 + i * 48;
    const fill = m.score >= 5 ? '#E2C07D' : m.score === 4 ? '#38BDF8' : '#334155';
    return `<rect x="${bx}" y="${516 - h}" width="34" height="${h}" rx="5" fill="${fill}"/><text x="${bx + 17}" y="538" text-anchor="middle" fill="#94A3B8" font-size="14" font-family="monospace">${m.m}</text>`;
  }).join('');

  return `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630" viewBox="0 0 1200 630">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="hsl(${hue}, 38%, 11%)"/>
      <stop offset="100%" stop-color="hsl(${hue2}, 34%, 6%)"/>
    </linearGradient>
    <radialGradient id="glow" cx="78%" cy="32%" r="48%">
      <stop offset="0%" stop-color="rgba(226,192,125,0.28)"/>
      <stop offset="100%" stop-color="rgba(0,0,0,0)"/>
    </radialGradient>
  </defs>
  <rect width="1200" height="630" fill="url(#bg)"/>
  <rect width="1200" height="630" fill="url(#glow)"/>
  <rect x="24" y="24" width="1152" height="582" rx="22" fill="none" stroke="rgba(226,192,125,0.28)" stroke-width="2"/>
  <text x="64" y="84" fill="#E2C07D" font-size="20" font-weight="600" font-family="sans-serif">${esc(dest.country || '')} · ${esc(dest.province || dest.region || '')}</text>
  <text x="64" y="156" fill="#F8FAFC" font-size="52" font-weight="700" font-family="sans-serif">${esc(String(dest.shortName || dest.name || '').slice(0, 18))}</text>
  <text x="64" y="212" fill="#CBD5E1" font-size="24" font-family="sans-serif">${esc(String(dest.subtitle || '').slice(0, 36))}</text>
  <text x="64" y="272" fill="#94A3B8" font-size="19" font-family="monospace">${Math.abs(lat).toFixed(2)}°${lat >= 0 ? 'N' : 'S'}, ${Math.abs(lng).toFixed(2)}°${lng >= 0 ? 'E' : 'W'}  ·  ${spotCount} PHOTO SPOTS  ·  ${esc(dest.suggestedDays || '3-5d')}</text>
  <rect x="740" y="130" width="390" height="210" rx="14" fill="rgba(15,23,42,0.55)" stroke="rgba(255,255,255,0.14)"/>
  <line x1="740" y1="235" x2="1130" y2="235" stroke="rgba(255,255,255,0.12)" stroke-dasharray="4 4"/>
  <line x1="935" y1="130" x2="935" y2="340" stroke="rgba(255,255,255,0.12)" stroke-dasharray="4 4"/>
  <circle cx="${pinX}" cy="${pinY}" r="16" fill="rgba(226,192,125,0.28)"/>
  <circle cx="${pinX}" cy="${pinY}" r="6" fill="#E2C07D" stroke="#09090B" stroke-width="2"/>
  <text x="64" y="408" fill="#CBD5E1" font-size="16" font-weight="600" font-family="sans-serif">12-MONTH PHENOLOGY INDEX</text>
  ${barsSvg}
  <text x="64" y="582" fill="#E2C07D" font-size="18" font-weight="600" font-family="sans-serif">World Travel Globe · 全球旅行地理图鉴</text>
  <text x="1136" y="582" text-anchor="end" fill="#94A3B8" font-size="16" font-family="monospace">${SITE_ORIGIN.replace('https://', '')}</text>
</svg>`;
}

function buildDestPageHtml(dest, neighbors, enDict) {
  const id = dest.id;
  const lat = Array.isArray(dest.coords) ? Number(dest.coords[1]) : 0;
  const lng = Array.isArray(dest.coords) ? Number(dest.coords[0]) : 0;
  const coordText = `${Math.abs(lat).toFixed(4)}°${lat >= 0 ? 'N' : 'S'}, ${Math.abs(lng).toFixed(4)}°${lng >= 0 ? 'E' : 'W'}`;
  const canonicalUrl = `${SITE_ORIGIN}/p/${encodeURIComponent(id)}/`;
  const enName = (enDict && enDict[dest.name]) || (enDict && enDict[dest.shortName]) || '';
  const titleText = `${dest.name}${enName ? ` (${enName})` : ''} · 机位/物候/气候摄影指南 | World Travel Globe`;
  const descText = String(dest.heroSummary || dest.subtitle || '').slice(0, 155);
  const spots = Array.isArray(dest.spots) ? dest.spots : [];
  const months = Array.isArray(dest.months) ? dest.months : [];
  const contLabel = (CONTINENT_META[dest.continent] && CONTINENT_META[dest.continent].zh) || '';
  const embedHtml = `<iframe src="${SITE_ORIGIN}/?embed=${encodeURIComponent(id)}&chrome=off" title="${esc(dest.shortName || dest.name)}" width="100%" height="460" style="border:0;border-radius:16px;" loading="lazy"></iframe>`;

  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'TouristDestination',
    name: dest.name,
    alternateName: enName || undefined,
    description: dest.heroSummary || dest.subtitle || '',
    url: canonicalUrl,
    image: `${SITE_ORIGIN}/og/cover.png`,
    geo: { '@type': 'GeoCoordinates', latitude: lat, longitude: lng },
    containedInPlace: { '@type': 'Country', name: dest.country || '' }
  };

  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${esc(titleText)}</title>
  <meta name="description" content="${esc(descText)}" />
  <link rel="canonical" href="${esc(canonicalUrl)}" />
  <meta property="og:type" content="article" />
  <meta property="og:title" content="${esc(titleText)}" />
  <meta property="og:description" content="${esc(descText)}" />
  <meta property="og:url" content="${esc(canonicalUrl)}" />
  <meta property="og:image" content="${SITE_ORIGIN}/og/cover.png" />
  <meta name="twitter:card" content="summary_large_image" />
  <script type="application/ld+json">${JSON.stringify(jsonLd)}</script>
  <style>
    :root{color-scheme:dark;--bg:#070B16;--card:#0F172A;--border:rgba(255,255,255,.12);--gold:#E2C07D;--text:#F8FAFC;--muted:#94A3B8;}
    *{box-sizing:border-box} body{margin:0;background:var(--bg);color:var(--text);font-family:system-ui,-apple-system,"PingFang SC","Microsoft YaHei",sans-serif;line-height:1.65}
    .wrap{max-width:960px;margin:0 auto;padding:28px 18px 64px}
    .nav{display:flex;justify-content:space-between;align-items:center;gap:12px;flex-wrap:wrap;margin-bottom:20px;font-size:13px;color:var(--muted)}
    .nav a{color:var(--gold);text-decoration:none}
    .hero-img{width:100%;border-radius:16px;border:1px solid var(--border);display:block;margin-bottom:20px}
    .cta-row{display:flex;flex-wrap:wrap;gap:10px;margin:16px 0 26px}
    .btn{display:inline-flex;align-items:center;gap:6px;padding:10px 18px;border-radius:999px;font-weight:600;text-decoration:none;font-size:14px}
    .btn-primary{background:var(--gold);color:#09090B}
    .btn-sec{background:rgba(255,255,255,.06);color:var(--text);border:1px solid var(--border)}
    .grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(270px,1fr));gap:12px}
    .card{background:var(--card);border:1px solid var(--border);border-radius:14px;padding:14px}
    .card h3{margin:0 0 6px;font-size:15.5px;color:#fff}
    .mono{font-family:ui-monospace,SFMono-Regular,Consolas,monospace;font-size:12px;color:var(--muted)}
    .m-row{display:grid;grid-template-columns:repeat(12,minmax(0,1fr));gap:4px;margin:14px 0 24px}
    .m-cell{background:var(--card);border:1px solid var(--border);border-radius:8px;padding:6px 4px;text-align:center;font-size:11px}
    .m-s5{border-color:rgba(226,192,125,.65);color:var(--gold)}
    pre{background:#020617;border:1px solid var(--border);border-radius:10px;padding:12px;overflow-x:auto;font-size:12px;color:#CBD5E1}
  </style>
</head>
<body>
  <main class="wrap">
    <nav class="nav">
      <span><a href="../../">World Travel Globe</a> / <a href="../">${esc(contLabel || '全球目录')}</a> / ${esc(dest.country || '')}</span>
      <span class="mono">${esc(coordText)}</span>
    </nav>
    <h1>${esc(dest.name)}${enName ? ` · ${esc(enName)}` : ''}</h1>
    <p style="color:#CBD5E1;font-size:16px;">${esc(dest.subtitle || '')}</p>
    <p style="color:var(--muted);">${esc(dest.heroSummary || '')}</p>
    <div class="cta-row">
      <a class="btn btn-primary" href="../../?focus=${encodeURIComponent(id)}">在 3D 地球仪中探索此地 ↗</a>
      <a class="btn btn-sec" href="../../?embed=${encodeURIComponent(id)}&chrome=off" target="_blank" rel="noopener">预览嵌入小部件</a>
      <a class="btn btn-sec" href="../">浏览全部 722 城目录</a>
    </div>
    <img class="hero-img" src="../../og/${encodeURIComponent(id)}.svg" alt="${esc(dest.name)} 地理信息卡" width="1200" height="630" />

    <h2>12 个月物候评分</h2>
    <div class="m-row">
      ${months.map((m) => `<div class="m-cell ${m.score >= 5 ? 'm-s5' : ''}"><div>${m.m}月</div><strong>${m.score}★</strong></div>`).join('')}
    </div>

    <h2>精选摄影机位 (${spots.length})</h2>
    <div class="grid">
      ${spots.map((sp, i) => `
        <article class="card">
          <h3>${String(i + 1).padStart(2, '0')} · ${esc(sp.name)}</h3>
          <div class="mono">${Array.isArray(sp.coords) ? `${Number(sp.coords[1]).toFixed(4)}, ${Number(sp.coords[0]).toFixed(4)}` : ''} · ${esc(sp.elevation || '')}</div>
          <p style="font-size:13px;color:#CBD5E1;margin:8px 0 4px;"><strong>黄金时段：</strong>${esc(sp.bestTime || '')}</p>
          <p style="font-size:13px;color:var(--muted);margin:0;">${esc(sp.scene || sp.tips || '')}</p>
        </article>
      `).join('')}
    </div>

    <h2 style="margin-top:28px;">嵌入到你的博客或 Notion (iframe)</h2>
    <pre>${esc(embedHtml)}</pre>

    ${neighbors.length ? `
      <h2 style="margin-top:28px;">同区域推荐目的地</h2>
      <div class="grid">
        ${neighbors.map((nb) => `<a class="card" style="text-decoration:none;color:inherit;" href="../${encodeURIComponent(nb.id)}/"><h3>${esc(nb.shortName || nb.name)}</h3><div class="mono">${esc(nb.country)} · ${(nb.spots || []).length} 机位</div></a>`).join('')}
      </div>
    ` : ''}
  </main>
</body>
</html>`;
}

function buildDirectoryHtml(all) {
  const byCont = new Map();
  all.forEach((d) => {
    const c = d.continent || 'other';
    if (!byCont.has(c)) byCont.set(c, []);
    byCont.get(c).push(d);
  });
  const sections = [...byCont.entries()].map(([cont, list]) => {
    const label = (CONTINENT_META[cont] && `${CONTINENT_META[cont].zh} (${CONTINENT_META[cont].en})`) || cont;
    const links = list.map((d) => `<a class="item" href="./${encodeURIComponent(d.id)}/"><strong>${esc(d.shortName || d.name)}</strong><span>${esc(d.country)} · ${(d.spots || []).length} spots</span></a>`).join('');
    return `<section><h2>${esc(label)} · ${list.length}</h2><div class="grid">${links}</div></section>`;
  }).join('');

  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>全球 722 座目的地索引目录 | World Travel Globe</title>
  <meta name="description" content="覆盖全球七大洲 137 个国家和地区、722 座精选目的地与 5,414 个摄影机位的地理目录。" />
  <link rel="canonical" href="${SITE_ORIGIN}/p/" />
  <style>
    body{margin:0;background:#070B16;color:#F8FAFC;font-family:system-ui,-apple-system,sans-serif;line-height:1.6}
    .wrap{max-width:1120px;margin:0 auto;padding:28px 18px 64px}
    a{color:#E2C07D;text-decoration:none}
    .grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(210px,1fr));gap:10px;margin-bottom:28px}
    .item{display:flex;flex-direction:column;gap:2px;background:#0F172A;border:1px solid rgba(255,255,255,.1);border-radius:10px;padding:10px 12px}
    .item span{font-size:12px;color:#94A3B8}
  </style>
</head>
<body>
  <main class="wrap">
    <p><a href="../">← 返回 3D 交互卫星地球仪</a></p>
    <h1>World Travel Globe · 全球 ${all.length} 座目的地目录</h1>
    ${sections}
  </main>
</body>
</html>`;
}

function buildSeoPages(allDestinations, distDir, opts) {
  const list = Array.isArray(allDestinations) ? allDestinations : [];
  const rootDir = (opts && opts.rootDir) || path.resolve(distDir, '..');
  const enIndexPath = path.join(rootDir, 'data', 'i18n', 'en', 'index.json');
  let enDict = null;
  if (fs.existsSync(enIndexPath)) {
    try { enDict = JSON.parse(fs.readFileSync(enIndexPath, 'utf8')); } catch (e) { /* ignore */ }
  }

  const pDir = path.join(distDir, 'p');
  const ogDir = path.join(distDir, 'og');
  fs.mkdirSync(pDir, { recursive: true });
  fs.mkdirSync(ogDir, { recursive: true });

  fs.writeFileSync(path.join(ogDir, 'cover.png'), generateFallbackCoverPng());

  const urls = [`${SITE_ORIGIN}/`, `${SITE_ORIGIN}/p/`];
  for (let i = 0; i < list.length; i++) {
    const dest = list[i];
    const destDir = path.join(pDir, dest.id);
    fs.mkdirSync(destDir, { recursive: true });
    const neighbors = list
      .filter((x) => x.id !== dest.id && (x.country === dest.country || x.continent === dest.continent))
      .slice(0, 6);

    fs.writeFileSync(path.join(ogDir, `${dest.id}.svg`), generateOgSvg(dest), 'utf8');
    fs.writeFileSync(path.join(destDir, 'index.html'), buildDestPageHtml(dest, neighbors, enDict), 'utf8');
    urls.push(`${SITE_ORIGIN}/p/${encodeURIComponent(dest.id)}/`);
  }

  fs.writeFileSync(path.join(pDir, 'index.html'), buildDirectoryHtml(list), 'utf8');

  const nowIso = new Date().toISOString().slice(0, 10);
  const sitemapXml = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls
    .map((u) => `  <url><loc>${esc(u)}</loc><lastmod>${nowIso}</lastmod></url>`)
    .join('\n')}\n</urlset>\n`;
  fs.writeFileSync(path.join(distDir, 'sitemap.xml'), sitemapXml, 'utf8');
  fs.writeFileSync(path.join(distDir, 'robots.txt'), `User-agent: *\nAllow: /\nSitemap: ${SITE_ORIGIN}/sitemap.xml\n`, 'utf8');

  return { pagesCount: list.length, ogCardsCount: list.length + 1, sitemapUrls: urls.length };
}

module.exports = {
  buildSeoPages,
  generateOgSvg,
  generateFallbackCoverPng
};
