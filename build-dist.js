'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');
const zlib = require('zlib');

const rootDir = __dirname;
const distDir = path.join(rootDir, 'dist');

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

function countCountries(list) {
  const set = new Set();
  for (const d of list) {
    String(d.country || '')
      .split('/')
      .map((s) => s.trim())
      .filter(Boolean)
      .forEach((c) => set.add(c));
  }
  return set.size;
}

function main() {
  const indexHtml = fs.readFileSync(path.join(rootDir, 'index.html'), 'utf8');
  const scriptMatches = [...indexHtml.matchAll(/<script src="(data\/[^"?]+)(?:\?v=\d+)?"><\/script>/g)];
  const dataScripts = scriptMatches.map((m) => m[1]);
  if (dataScripts.length !== 56 || dataScripts[0] !== 'data/registry.js') {
    throw new Error(`Expected 56 data scripts starting with data/registry.js, got ${dataScripts.length}`);
  }

  // Recreate dist/
  fs.rmSync(distDir, { recursive: true, force: true });
  for (const sub of ['css', 'js', 'vendor', 'data', path.join('data', 'regions')]) {
    ensureDir(path.join(distDir, sub));
  }

  // Copy static runtime assets
  const assetCopies = [
    ['css/styles.css', 'css/styles.css'],
    ['js/icons.js', 'js/icons.js'],
    ['js/i18n.js', 'js/i18n.js'],
    ['js/theme.js', 'js/theme.js'],
    ['js/detail-panel.js', 'js/detail-panel.js'],
    ['js/command-palette.js', 'js/command-palette.js'],
    ['js/gallery.js', 'js/gallery.js'],
    ['js/app.js', 'js/app.js'],
    ['vendor/maplibre-gl.js', 'vendor/maplibre-gl.js'],
    ['vendor/maplibre-gl.css', 'vendor/maplibre-gl.css']
  ];
  for (const [srcRel, dstRel] of assetCopies) {
    fs.copyFileSync(path.join(rootDir, srcRel), path.join(distDir, dstRel));
  }

  // Load registry.js + all 55 data modules in exact order
  const sandbox = { window: {}, console };
  sandbox.window = sandbox;
  const registrySrc = fs.readFileSync(path.join(rootDir, 'data/registry.js'), 'utf8');
  vm.runInNewContext(registrySrc, sandbox);

  for (let i = 1; i < dataScripts.length; i++) {
    const src = fs.readFileSync(path.join(rootDir, dataScripts[i]), 'utf8');
    vm.runInNewContext(src, sandbox);
  }

  const all = sandbox.TRAVEL_ATLAS.getAll();
  const totalSpots = all.reduce((s, d) => s + (d.spots ? d.spots.length : 0), 0);
  const countryCount = countCountries(all);
  if (all.length !== 722 || totalSpots !== 5414 || countryCount !== 137) {
    throw new Error(`Bundle sanity check failed: cities=${all.length}, spots=${totalSpots}, countries=${countryCount}`);
  }

  // Group full destination data into per-region JSON chunks + build lightweight index
  const regionOrder = Array.isArray(sandbox.TRAVEL_ATLAS.REGION_ORDER)
    ? sandbox.TRAVEL_ATLAS.REGION_ORDER
    : [];
  const regionBuckets = new Map();
  const indexAll = all.map((d) => {
    let rIdx = regionOrder.indexOf(d.region);
    if (rIdx === -1) rIdx = regionOrder.length;
    if (!regionBuckets.has(rIdx)) regionBuckets.set(rIdx, []);
    regionBuckets.get(rIdx).push(d);

    const monthScores = new Array(12).fill(0);
    (d.months || []).forEach((m) => {
      if (m && m.m >= 1 && m.m <= 12) monthScores[m.m - 1] = Number(m.score) || 0;
    });

    return {
      id: d.id,
      continent: d.continent,
      country: d.country,
      region: d.region,
      province: d.province,
      name: d.name,
      shortName: d.shortName,
      priority: d.priority,
      themeTags: d.themeTags,
      weatherTags: d.weatherTags,
      subtitle: d.subtitle,
      coords: d.coords,
      zoom: d.zoom,
      elevation: d.elevation,
      suggestedDays: d.suggestedDays,
      allWeather: d.allWeather,
      badges: d.badges,
      heroSummary: d.heroSummary,
      spotCount: Array.isArray(d.spots) ? d.spots.length : 0,
      spotNames: Array.isArray(d.spots) ? d.spots.map((s) => s.name) : [],
      monthScores,
      _r: rIdx
    };
  });

  for (const [rIdx, items] of regionBuckets.entries()) {
    const chunkPath = path.join(distDir, 'data', 'regions', `r${rIdx}.json`);
    fs.writeFileSync(chunkPath, JSON.stringify(items), 'utf8');
  }

  // Build single lightweight index bundle
  const indexCode =
    registrySrc.trimEnd() +
    '\nwindow.TRAVEL_ATLAS.registerDestinations(' +
    JSON.stringify(indexAll) +
    ');\n';
  const indexOutPath = path.join(distDir, 'data', 'atlas-index.min.js');
  fs.writeFileSync(indexOutPath, indexCode, 'utf8');

  const rawBytes = Buffer.byteLength(indexCode, 'utf8');
  const gzBytes = zlib.gzipSync(Buffer.from(indexCode, 'utf8'), { level: 9 }).length;

  // Replace all 56 data/*.js script tags with lightweight index bundle tag in dist/index.html
  const blockRe = /(?:\s*<script src="data\/[^"?]+(?:\?v=\d+)?"><\/script>\s*)+/;
  if (!blockRe.test(indexHtml)) {
    throw new Error('Could not locate data/*.js script block in index.html');
  }
  const distHtml = indexHtml.replace(
    blockRe,
    '\n  <script src="data/atlas-index.min.js?v=33"></script>\n'
  );
  fs.writeFileSync(path.join(distDir, 'index.html'), distHtml, 'utf8');

  // Copy optional pre-translated i18n chunks if present (data/i18n/{lang}/index.json & r*.json)
  const i18nSrcDir = path.join(rootDir, 'data', 'i18n');
  let i18nCount = 0;
  if (fs.existsSync(i18nSrcDir)) {
    const copyTree = (src, dst) => {
      ensureDir(dst);
      for (const ent of fs.readdirSync(src, { withFileTypes: true })) {
        const sPath = path.join(src, ent.name);
        const dPath = path.join(dst, ent.name);
        if (ent.isDirectory()) copyTree(sPath, dPath);
        else {
          fs.copyFileSync(sPath, dPath);
          i18nCount++;
        }
      }
    };
    copyTree(i18nSrcDir, path.join(distDir, 'data', 'i18n'));
  }

  // Hosting metadata files (.nojekyll for GitHub Pages, _headers for Cloudflare Pages / Netlify)
  fs.writeFileSync(path.join(distDir, '.nojekyll'), '', 'utf8');
  const headersContent = `/index.html
  Cache-Control: no-cache, must-revalidate

/data/*
  Cache-Control: public, max-age=31536000, immutable

/css/*
  Cache-Control: public, max-age=31536000, immutable

/js/*
  Cache-Control: public, max-age=31536000, immutable

/vendor/*
  Cache-Control: public, max-age=31536000, immutable
`;
  fs.writeFileSync(path.join(distDir, '_headers'), headersContent, 'utf8');

  // Count dist files
  let fileCount = 0;
  function walk(dir) {
    for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
      if (ent.isDirectory()) walk(path.join(dir, ent.name));
      else fileCount++;
    }
  }
  walk(distDir);

  console.log(`Built dist/ successfully!`);
  console.log(`  Destinations: ${all.length} cities, ${totalSpots} spots, ${countryCount} countries`);
  console.log(`  atlas-index.min.js: ${(rawBytes / 1024).toFixed(1)} KB raw (${rawBytes} bytes) -> ${(gzBytes / 1024).toFixed(1)} KB gzip (${gzBytes} bytes)`);
  console.log(`  Lazy region chunks: ${regionBuckets.size} files in data/regions/`);
  if (i18nCount > 0) console.log(`  Lazy i18n chunks: ${i18nCount} files in data/i18n/`);
  console.log(`  Total dist/ files: ${fileCount}`);
}

main();
