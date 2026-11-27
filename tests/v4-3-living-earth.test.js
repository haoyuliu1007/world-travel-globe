'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const rootDir = path.resolve(__dirname, '..');
const distDir = path.join(rootDir, 'dist');

const SolarTerminator = require('../js/modules/solar-terminator.js');
const WeatherService = require('../js/services/weather-service.js');
const PosterShare = require('../js/modules/poster-share.js');
const Terrain3DModule = require('../js/modules/terrain-3d.js');

test('V4.3 SolarTerminator computes accurate subsolar declination across equinox & solstices', () => {
  const marchEq = SolarTerminator.computeSubsolarPoint(new Date('2026-03-20T12:00:00Z'));
  assert.ok(Math.abs(marchEq.lat) < 1.5, `Equinox lat should be near 0°, got ${marchEq.lat}`);

  const juneSol = SolarTerminator.computeSubsolarPoint(new Date('2026-06-21T12:00:00Z'));
  assert.ok(juneSol.lat > 22.0 && juneSol.lat < 24.0, `June solstice lat expected ~23.4°, got ${juneSol.lat}`);

  const decSol = SolarTerminator.computeSubsolarPoint(new Date('2026-12-21T12:00:00Z'));
  assert.ok(decSol.lat < -22.0 && decSol.lat > -24.0, `Dec solstice lat expected ~-23.4°, got ${decSol.lat}`);

  const geo = SolarTerminator.buildTerminatorGeoJson(new Date('2026-06-21T12:00:00Z'));
  assert.equal(geo.terminatorLine.features[0].geometry.coordinates.length, 181);
  assert.equal(geo.nightPolygons.features.length, 3);
  for (const feat of geo.nightPolygons.features) {
    const ring = feat.geometry.coordinates[0];
    assert.deepEqual(ring[0], ring[ring.length - 1], 'Night band polygon ring must be closed');
    for (const pt of ring) {
      assert.ok(Number.isFinite(pt[0]) && Number.isFinite(pt[1]), 'No NaN coordinates allowed');
    }
  }
});

test('V4.3 Static SEO landing pages, OG cards, fallback PNG, and sitemap are built into dist/', () => {
  assert.ok(fs.existsSync(path.join(distDir, 'p', 'index.html')), 'dist/p/index.html exists');
  assert.ok(fs.existsSync(path.join(distDir, 'p', 'jp-kanto-tokyo', 'index.html')), 'dist/p/jp-kanto-tokyo/index.html exists');
  assert.ok(fs.existsSync(path.join(distDir, 'og', 'jp-kanto-tokyo.svg')), 'dist/og/jp-kanto-tokyo.svg exists');
  assert.ok(fs.existsSync(path.join(distDir, 'og', 'cover.png')), 'dist/og/cover.png exists');
  assert.ok(fs.existsSync(path.join(distDir, 'sitemap.xml')), 'dist/sitemap.xml exists');
  assert.ok(fs.existsSync(path.join(distDir, 'robots.txt')), 'dist/robots.txt exists');

  const pngHeader = fs.readFileSync(path.join(distDir, 'og', 'cover.png')).subarray(0, 4);
  assert.deepEqual([...pngHeader], [0x89, 0x50, 0x4e, 0x47], 'cover.png must have valid PNG magic header');

  const tokyoHtml = fs.readFileSync(path.join(distDir, 'p', 'jp-kanto-tokyo', 'index.html'), 'utf8');
  assert.ok(tokyoHtml.includes('TouristDestination'));
  assert.ok(tokyoHtml.includes('og:title'));
  assert.ok(tokyoHtml.includes('?focus=jp-kanto-tokyo'));
  assert.ok(tokyoHtml.includes('?embed=jp-kanto-tokyo'));

  const tokyoSvg = fs.readFileSync(path.join(distDir, 'og', 'jp-kanto-tokyo.svg'), 'utf8');
  assert.ok(tokyoSvg.includes('<svg') && tokyoSvg.includes('1200') && tokyoSvg.includes('630'));

  const sitemap = fs.readFileSync(path.join(distDir, 'sitemap.xml'), 'utf8');
  const locCount = (sitemap.match(/<loc>https:\/\/world-travel-globe\.globe-app\.workers\.dev\/p\/[^<]+\/<\/loc>/g) || []).length;
  assert.equal(locCount, 722, `Expected 722 /p/<id>/ entries in sitemap.xml, got ${locCount}`);
});

test('V4.3 WeatherService.classifyAirQuality, PosterShare embed snippet & Terrain3D Mapterhorn API', () => {
  const clearAq = WeatherService.classifyAirQuality({ current: { us_aqi: 22, pm2_5: 4.1, uv_index: 9.2, birch_pollen: 5 } });
  assert.equal(clearAq.aqi, 22);
  assert.equal(clearAq.aqiLevel, '通透优');
  assert.equal(clearAq.uvLevel, '极强防晒');
  assert.equal(clearAq.pollenLabel, '低花粉');

  const hazyAq = WeatherService.classifyAirQuality({ current: { us_aqi: 168, pm2_5: 62.4, uv_index: 1.5, grass_pollen: 65 } });
  assert.equal(hazyAq.aqiLevel, '雾霾强遮蔽');
  assert.equal(hazyAq.pollenLabel, '花粉偏高');

  const iframeCode = PosterShare.buildEmbedIframeCode({ id: 'is-reykjavik', shortName: '雷克雅未克' }, 'https://world-travel-globe.globe-app.workers.dev/');
  assert.ok(iframeCode.includes('<iframe'));
  assert.ok(iframeCode.includes('?embed=is-reykjavik&chrome=off'));

  assert.ok(Terrain3DModule.MAPTERHORN_URL.includes('tiles.mapterhorn.com'));
  assert.equal(typeof Terrain3DModule.setDemProvider, 'function');
  assert.equal(Terrain3DModule.getState().demProvider, 'mapterhorn');
});

test('V4.3 Worker supports /api/health flags, Open-Meteo AQ, Mapterhorn tiles, and EPIC image proxy', async () => {
  const workerMod = await import('../worker/index.js');
  const worker = workerMod.default;
  const mockEnv = {
    ASSETS: { fetch: async () => new Response('ok', { status: 200 }) }
  };

  const healthRes = await worker.fetch(new Request('https://example.com/api/health'), mockEnv);
  const healthJson = await healthRes.json();
  assert.equal(healthJson.features.epic, true);
  assert.equal(healthJson.features.airQuality, true);
  assert.equal(healthJson.features.mapterhorn, true);

  const badImgRes = await worker.fetch(new Request('https://example.com/api/img?url=https://bad.example.com/x.png'), mockEnv);
  assert.equal(badImgRes.status, 400);

  const appJs = fs.readFileSync(path.join(rootDir, 'js', 'app.js'), 'utf8');
  assert.ok(appJs.includes("params.get('embed')"));
  assert.ok(appJs.includes('embed-mode'));

  const cssUpgrades = fs.readFileSync(path.join(rootDir, 'css', 'upgrades.css'), 'utf8');
  assert.ok(cssUpgrades.includes('body.embed-mode'));
});
