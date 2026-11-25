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
  for (const sub of ['css', 'js', 'vendor', 'data']) {
    ensureDir(path.join(distDir, sub));
  }

  // Copy static runtime assets
  const assetCopies = [
    ['css/styles.css', 'css/styles.css'],
    ['js/icons.js', 'js/icons.js'],
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

  // Build single minified data bundle
  const bundleCode =
    registrySrc.trimEnd() +
    '\nwindow.TRAVEL_ATLAS.registerDestinations(' +
    JSON.stringify(all) +
    ');\n';
  const bundleOutPath = path.join(distDir, 'data', 'atlas-bundle.min.js');
  fs.writeFileSync(bundleOutPath, bundleCode, 'utf8');

  const rawBytes = Buffer.byteLength(bundleCode, 'utf8');
  const gzBytes = zlib.gzipSync(Buffer.from(bundleCode, 'utf8'), { level: 9 }).length;

  // Replace all 56 data/*.js script tags with single bundle tag in dist/index.html
  const blockRe = /(?:\s*<script src="data\/[^"?]+(?:\?v=\d+)?"><\/script>\s*)+/;
  if (!blockRe.test(indexHtml)) {
    throw new Error('Could not locate data/*.js script block in index.html');
  }
  const distHtml = indexHtml.replace(
    blockRe,
    '\n  <script src="data/atlas-bundle.min.js?v=20"></script>\n'
  );
  fs.writeFileSync(path.join(distDir, 'index.html'), distHtml, 'utf8');

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
  console.log(`  atlas-bundle.min.js: ${(rawBytes / 1024 / 1024).toFixed(2)} MB raw (${rawBytes} bytes) -> ${(gzBytes / 1024 / 1024).toFixed(2)} MB gzip (${gzBytes} bytes)`);
  console.log(`  Total dist/ files: ${fileCount}`);
}

main();
