'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.resolve(__dirname, '..');

test('V5.0 Batch 1: KAIROS brand SVG/PNG/ICO assets exist and SVGs contain pure vectors without Base64 PNGs', () => {
  const requiredSvgs = [
    'assets/brand/svg/kairos-primary.svg',
    'assets/brand/svg/kairos-dark.svg',
    'assets/brand/svg/kairos-horizontal.svg',
    'assets/brand/svg/kairos-horizontal-dark.svg',
    'assets/brand/svg/kairos-black.svg',
    'assets/brand/svg/kairos-white.svg',
    'assets/brand/svg/kairos-symbol.svg',
    'assets/brand/svg/kairos-symbol-dark.svg',
    'assets/brand/svg/kairos-icon.svg',
    'assets/brand/icons/favicon.svg'
  ];
  for (const rel of requiredSvgs) {
    const abs = path.join(ROOT, rel);
    assert.ok(fs.existsSync(abs), `Missing SVG: ${rel}`);
    const content = fs.readFileSync(abs, 'utf8');
    assert.ok(content.includes('<path '), `SVG lacks <path> element: ${rel}`);
    assert.ok(!content.includes('data:image/'), `SVG must NOT embed base64 raster image: ${rel}`);
    assert.ok(!/<script/i.test(content), `SVG must NOT contain scripts: ${rel}`);
  }

  const requiredBins = [
    'assets/brand/icons/favicon.ico',
    'assets/brand/icons/favicon-16.png',
    'assets/brand/icons/favicon-32.png',
    'assets/brand/icons/favicon-48.png',
    'assets/brand/icons/icon-64.png',
    'assets/brand/icons/apple-touch-icon.png',
    'assets/brand/icons/icon-192.png',
    'assets/brand/icons/icon-512.png',
    'assets/brand/icons/icon-maskable-512.png',
    'assets/brand/social/og-cover.png'
  ];
  for (const rel of requiredBins) {
    const abs = path.join(ROOT, rel);
    assert.ok(fs.existsSync(abs), `Missing binary brand asset: ${rel}`);
    assert.ok(fs.statSync(abs).size > 200, `Asset unexpectedly empty: ${rel}`);
  }

  const tokensCss = fs.readFileSync(path.join(ROOT, 'assets/brand/brand-tokens.css'), 'utf8');
  assert.ok(tokensCss.includes('#16283F') && tokensCss.includes('#E8A33D') && tokensCss.includes('#FAF8F4'));
  assert.ok(fs.existsSync(path.join(ROOT, 'docs/BRAND_GUIDELINES.md')));
});

test('V5.0 Batch 1: TripPlanner resolves Beijing independently from Tokyo and refuses silent fallback on unknown input', async () => {
  const sandbox = { window: {}, console, Date, Math, Set, Map, Array, Object, String, Number, JSON, URL, URLSearchParams, TextEncoder, TextDecoder, btoa, atob };
  sandbox.window = sandbox;
  vm.runInNewContext(fs.readFileSync(path.join(ROOT, 'data/registry.js'), 'utf8'), sandbox);
  vm.runInNewContext(fs.readFileSync(path.join(ROOT, 'data/asia/china/north_metro.js'), 'utf8'), sandbox);
  vm.runInNewContext(fs.readFileSync(path.join(ROOT, 'data/asia/japan.js'), 'utf8'), sandbox);
  vm.runInNewContext(fs.readFileSync(path.join(ROOT, 'js/modules/trip-planner.js'), 'utf8'), sandbox);

  const all = sandbox.TRAVEL_ATLAS.getAll();
  const TP = sandbox.TripPlanner;

  // Resolve both Chinese and English queries
  const bjZh = TP.resolveDestinationMatches('北京', all);
  assert.ok(bjZh.length >= 1 && bjZh[0].id === 'cn-beijing', `Expected cn-beijing for 北京, got ${bjZh[0] && bjZh[0].id}`);

  const bjEn = TP.resolveDestinationMatches('Beijing', all);
  assert.ok(bjEn.length >= 1 && bjEn[0].id === 'cn-beijing', `Expected cn-beijing for Beijing, got ${bjEn[0] && bjEn[0].id}`);

  const tyo = TP.resolveDestinationMatches('Tokyo', all);
  assert.ok(tyo.length >= 1 && tyo[0].id === 'jp-kanto-tokyo', `Expected jp-kanto-tokyo for Tokyo, got ${tyo[0] && tyo[0].id}`);

  // Unknown input returns [] (no silent fallback to Tokyo or allDest[0])
  const none = TP.resolveDestinationMatches('AtlantisNowhereXYZ', all);
  assert.equal(none.length, 0, 'Unknown query must return empty candidates');

  // Generate Tokyo then Beijing trips independently
  const tokyoTrip = TP.generateTripPlan({ dest: sandbox.TRAVEL_ATLAS.getById('jp-kanto-tokyo'), days: 3, budgetRmb: 15000, mode: 'driving' });
  const beijingTrip = TP.generateTripPlan({ dest: sandbox.TRAVEL_ATLAS.getById('cn-beijing'), days: 4, budgetRmb: 8000, mode: 'walking' });

  assert.equal(tokyoTrip.destId, 'jp-kanto-tokyo');
  assert.equal(beijingTrip.destId, 'cn-beijing');
  assert.notEqual(tokyoTrip.id, beijingTrip.id);
  const bjStops = beijingTrip.days.flatMap((d) => d.stops.map((s) => s.destId));
  assert.ok(bjStops.length > 0 && bjStops.every((id) => id === 'cn-beijing'), 'Every Beijing stop must belong to cn-beijing');
});
