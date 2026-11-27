'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');
const zlib = require('zlib');
const { buildSeoPages } = require('./scripts/build-seo-pages.js');

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

async function main() {
  const indexHtml = fs.readFileSync(path.join(rootDir, 'index.html'), 'utf8');
  const scriptMatches = [...indexHtml.matchAll(/<script src="(data\/[^"?]+)(?:\?v=\d+)?"><\/script>/g)];
  const dataScripts = scriptMatches.map((m) => m[1]);
  if (dataScripts.length !== 56 || dataScripts[0] !== 'data/registry.js') {
    throw new Error(`Expected 56 data scripts starting with data/registry.js, got ${dataScripts.length}`);
  }

  // Recreate dist/
  fs.rmSync(distDir, { recursive: true, force: true });
  for (const sub of [
    'assets',
    'css',
    'js',
    path.join('js', 'services'),
    path.join('js', 'workers'),
    path.join('js', 'modules'),
    'vendor',
    'data',
    path.join('data', 'regions')
  ]) {
    ensureDir(path.join(distDir, sub));
  }

  // Copy static runtime assets (keep lazy-loaded assets like echarts & web workers)
  const assetCopies = [
    ['vendor/maplibre-gl.js', 'vendor/maplibre-gl.js'],
    ['vendor/echarts.min.js', 'vendor/echarts.min.js'],
    ['vendor/maplibre-contour.min.js', 'vendor/maplibre-contour.min.js'],
    ['manifest.webmanifest', 'manifest.webmanifest']
  ];
  for (const [srcRel, dstRel] of assetCopies) {
    const srcAbs = path.join(rootDir, srcRel);
    if (fs.existsSync(srcAbs)) {
      fs.copyFileSync(srcAbs, path.join(distDir, dstRel));
    }
  }
  fs.cpSync(path.join(rootDir, 'assets', 'cosmic-intro'),
    path.join(distDir, 'assets', 'cosmic-intro'), { recursive: true });
  if (fs.existsSync(path.join(rootDir, 'assets', 'prologue'))) {
    fs.cpSync(path.join(rootDir, 'assets', 'prologue'),
      path.join(distDir, 'assets', 'prologue'), { recursive: true });
  }
  if (fs.existsSync(path.join(rootDir, 'assets', 'bgm'))) {
    fs.cpSync(path.join(rootDir, 'assets', 'bgm'),
      path.join(distDir, 'assets', 'bgm'), { recursive: true });
  }
  if (fs.existsSync(path.join(rootDir, 'assets', 'skyboxes'))) {
    fs.cpSync(path.join(rootDir, 'assets', 'skyboxes'),
      path.join(distDir, 'assets', 'skyboxes'), { recursive: true });
  }

  const workerSrcDir = path.join(rootDir, 'js', 'workers');
  if (fs.existsSync(workerSrcDir)) {
    for (const ent of fs.readdirSync(workerSrcDir, { withFileTypes: true })) {
      if (ent.isFile() && ent.name.endsWith('.js')) {
        fs.copyFileSync(path.join(workerSrcDir, ent.name), path.join(distDir, 'js', 'workers', ent.name));
      }
    }
  }
  // Copy vendor/fuse.min.js and vendor/supercluster.min.js separately for atlas-worker.js importScripts('../vendor/...')
  for (const wVendor of ['vendor/fuse.min.js', 'vendor/supercluster.min.js']) {
    const srcAbs = path.join(rootDir, wVendor);
    if (fs.existsSync(srcAbs)) {
      fs.copyFileSync(srcAbs, path.join(distDir, wVendor));
    }
  }
  const auditReportSrc = path.join(rootDir, 'data', 'audit-report.json');
  if (fs.existsSync(auditReportSrc)) {
    fs.copyFileSync(auditReportSrc, path.join(distDir, 'data', 'audit-report.json'));
  }
  // Copy optional pre-computed enrichment layer (data/enrichment/atlas-enrichment.json)
  const enrichmentSrc = path.join(rootDir, 'data', 'enrichment', 'atlas-enrichment.json');
  if (fs.existsSync(enrichmentSrc)) {
    ensureDir(path.join(distDir, 'data', 'enrichment'));
    fs.copyFileSync(enrichmentSrc, path.join(distDir, 'data', 'enrichment', 'atlas-enrichment.json'));
  }

  // Bundle CSS files (maplibre-gl.css + styles.css + upgrades.css + prologue.css) into one CSS request
  const cssParts = ['vendor/maplibre-gl.css', 'css/styles.css', 'css/upgrades.css', 'assets/prologue/prologue.css']
    .filter((rel) => fs.existsSync(path.join(rootDir, rel)))
    .map((rel) => fs.readFileSync(path.join(rootDir, rel), 'utf8'));
  const cssBundle = cssParts.join('\n');
  fs.writeFileSync(path.join(distDir, 'css', 'app.bundle.min.css'), cssBundle, 'utf8');

  // Bundle intro/prologue runtime (bgm + prologue + cosmic player) into one early script request
  const introScriptRels = ['assets/prologue/bgm.js', 'assets/prologue/prologue.js', 'assets/cosmic-intro/player.js'];
  const introBundle = introScriptRels
    .filter((rel) => fs.existsSync(path.join(rootDir, rel)))
    .map((rel) => fs.readFileSync(path.join(rootDir, rel), 'utf8').trim())
    .join('\n;\n') + '\n';
  fs.writeFileSync(path.join(distDir, 'assets', 'prologue', 'intro.bundle.min.js'), introBundle, 'utf8');

  // Bundle small vendor libraries into one JS request
  const vendorLibParts = [
    'vendor/suncalc.min.js',
    'vendor/fuse.min.js',
    'vendor/supercluster.min.js',
    'vendor/dexie.min.js',
    'vendor/astronomy.browser.min.js',
    'vendor/minisearch.min.js',
    'vendor/tz-lookup.min.js'
  ].map((rel) => fs.readFileSync(path.join(rootDir, rel), 'utf8').trim());
  const vendorBundle = vendorLibParts.join('\n;\n') + '\n';
  fs.writeFileSync(path.join(distDir, 'vendor', 'libs.bundle.min.js'), vendorBundle, 'utf8');

  // Bundle application JS modules in exact index.html order into one JS request
  const appScriptMatches = [...indexHtml.matchAll(/<script src="(js\/[^"?]+)(?:\?v=\d+)?"><\/script>/g)];
  const appScripts = appScriptMatches.map((m) => m[1]);
  if (appScripts.length < 10) {
    throw new Error(`Expected >= 10 app scripts in index.html, got ${appScripts.length}`);
  }
  const appBundle =
    appScripts
      .map((rel) => fs.readFileSync(path.join(rootDir, rel), 'utf8').trim())
      .join('\n;\n') + '\n';
  fs.writeFileSync(path.join(distDir, 'js', 'app.bundle.min.js'), appBundle, 'utf8');

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
    const jsonStr = JSON.stringify(items);
    fs.writeFileSync(path.join(distDir, 'data', 'regions', `r${rIdx}.json`), jsonStr, 'utf8');
    fs.writeFileSync(
      path.join(distDir, 'data', 'regions', `r${rIdx}.js`),
      `window.TRAVEL_ATLAS.registerDestinations(${jsonStr});\n`,
      'utf8'
    );
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

  // Replace CSS, intro scripts, vendor libs, data/*.js, and js/*.js blocks with consolidated bundles in dist/index.html
  const buildVer = Date.now().toString(36);
  const cssBlockRe = /(?:\s*<link rel="stylesheet" href="(?:vendor\/maplibre-gl\.css|css\/[^"?]+|assets\/prologue\/prologue\.css)(?:\?v=\d+)?"\s*\/>\s*)+/;
  const introBlockRe = /(?:\s*<script src="assets\/(?:prologue\/(?:bgm|prologue)|cosmic-intro\/player)\.js(?:\?v=\d+)?"><\/script>\s*)+/;
  const vendorBlockRe = /(?:\s*<script src="vendor\/(?:suncalc|fuse|supercluster|dexie|astronomy\.browser|minisearch|tz-lookup)\.min\.js"><\/script>\s*)+/;
  const dataBlockRe = /(?:\s*<script src="data\/[^"?]+(?:\?v=\d+)?"><\/script>\s*)+/;
  const appBlockRe = /(?:\s*<script src="js\/[^"?]+(?:\?v=\d+)?"><\/script>\s*)+/;
  if (!cssBlockRe.test(indexHtml) || !vendorBlockRe.test(indexHtml) || !dataBlockRe.test(indexHtml) || !appBlockRe.test(indexHtml)) {
    throw new Error('Could not locate expected CSS/vendor/data/js blocks in index.html');
  }
  let distHtml = indexHtml
    .replace(cssBlockRe, `\n  <link rel="stylesheet" href="css/app.bundle.min.css?v=${buildVer}" />\n`)
    .replace(vendorBlockRe, `\n  <script src="vendor/libs.bundle.min.js?v=${buildVer}"></script>\n`)
    .replace(dataBlockRe, `\n  <script src="data/atlas-index.min.js?v=${buildVer}"></script>\n`)
    .replace(appBlockRe, `\n  <script src="js/app.bundle.min.js?v=${buildVer}"></script>\n`);
  if (introBlockRe.test(distHtml)) {
    distHtml = distHtml.replace(introBlockRe, `\n  <script src="assets/prologue/intro.bundle.min.js?v=${buildVer}"></script>\n`);
  }
  fs.writeFileSync(path.join(distDir, 'index.html'), distHtml, 'utf8');

  // Stamp dist/sw.js with exact build version and bundled core assets
  const swCoreAssets = [
    './',
    './index.html',
    `./css/app.bundle.min.css?v=${buildVer}`,
    `./assets/prologue/intro.bundle.min.js?v=${buildVer}`,
    './vendor/maplibre-gl.js',
    `./vendor/libs.bundle.min.js?v=${buildVer}`,
    `./data/atlas-index.min.js?v=${buildVer}`,
    `./js/app.bundle.min.js?v=${buildVer}`
  ];
  const swSrc = fs.readFileSync(path.join(rootDir, 'sw.js'), 'utf8');
  const distSw = swSrc
    .replace(/wtg-shell-__BUILD_VER__/g, `wtg-shell-${buildVer}`)
    .replace(/\/\*\s*__SW_CORE_ASSETS__\s*\*\/\s*\[[^\]]*\]/, JSON.stringify(swCoreAssets));
  fs.writeFileSync(path.join(distDir, 'sw.js'), distSw, 'utf8');

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
  Cache-Control: public, max-age=3600, must-revalidate

/css/*
  Cache-Control: public, max-age=3600, must-revalidate

/js/*
  Cache-Control: public, max-age=3600, must-revalidate

/vendor/*
  Cache-Control: public, max-age=31536000, immutable

/og/*
  Cache-Control: public, max-age=86400

/p/*
  Cache-Control: public, max-age=3600, must-revalidate
`;
  fs.writeFileSync(path.join(distDir, '_headers'), headersContent, 'utf8');

  const seoSummary = await buildSeoPages(all, distDir, { rootDir });

  // Count dist files
  let fileCount = 0;
  function walk(dir) {
    for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
      if (ent.isDirectory()) walk(path.join(dir, ent.name));
      else fileCount++;
    }
  }
  walk(distDir);

  const cssGz = zlib.gzipSync(Buffer.from(cssBundle, 'utf8'), { level: 9 }).length;
  const vendorGz = zlib.gzipSync(Buffer.from(vendorBundle, 'utf8'), { level: 9 }).length;
  const appGz = zlib.gzipSync(Buffer.from(appBundle, 'utf8'), { level: 9 }).length;

  console.log(`Built dist/ successfully!`);
  console.log(`  Destinations: ${all.length} cities, ${totalSpots} spots, ${countryCount} countries`);
  console.log(`  css/app.bundle.min.css: ${(Buffer.byteLength(cssBundle) / 1024).toFixed(1)} KB raw -> ${(cssGz / 1024).toFixed(1)} KB gzip`);
  console.log(`  vendor/libs.bundle.min.js: ${(Buffer.byteLength(vendorBundle) / 1024).toFixed(1)} KB raw -> ${(vendorGz / 1024).toFixed(1)} KB gzip`);
  console.log(`  js/app.bundle.min.js (${appScripts.length} files): ${(Buffer.byteLength(appBundle) / 1024).toFixed(1)} KB raw -> ${(appGz / 1024).toFixed(1)} KB gzip`);
  console.log(`  atlas-index.min.js: ${(rawBytes / 1024).toFixed(1)} KB raw (${rawBytes} bytes) -> ${(gzBytes / 1024).toFixed(1)} KB gzip (${gzBytes} bytes)`);
  console.log(`  Lazy region chunks: ${regionBuckets.size} files in data/regions/`);
  if (i18nCount > 0) console.log(`  Lazy i18n chunks: ${i18nCount} files in data/i18n/`);
  console.log(`  SEO landing pages: ${seoSummary.pagesCount} pages in p/, ${seoSummary.ogCardsCount} OG cards in og/ (PNG rendered=${seoSummary.ogPngsRendered}, cached=${seoSummary.ogPngsCached}), sitemap.xml (${seoSummary.sitemapUrls} URLs)`);
  console.log(`  Total dist/ files: ${fileCount}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
