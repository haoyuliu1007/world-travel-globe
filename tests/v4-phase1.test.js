'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const rootDir = path.resolve(__dirname, '..');
const SunCalc = require(path.join(rootDir, 'vendor', 'suncalc.min.js'));
const BrightStars = require(path.join(rootDir, 'js', 'modules', 'bright-stars.js'));
const Terrain3D = require(path.join(rootDir, 'js', 'modules', 'terrain-3d.js'));
const StreetView = require(path.join(rootDir, 'js', 'modules', 'streetview.js'));

function loadAstronomy() {
  const code = fs.readFileSync(path.join(rootDir, 'vendor', 'astronomy.browser.min.js'), 'utf8');
  const sb = { window: {}, self: {}, console, Date, Math };
  sb.window = sb;
  sb.self = sb;
  vm.runInNewContext(code, sb);
  return sb.Astronomy;
}

function loadPhotoSimulator(Astro) {
  const code = fs.readFileSync(path.join(rootDir, 'js', 'modules', 'photo-simulator.js'), 'utf8');
  const sb = { window: {}, SunCalc, Astronomy: Astro, console, Date, Math };
  sb.window = sb;
  vm.runInNewContext(code, sb);
  return sb.PhotoSimulator;
}

test('Astronomy Engine computes Galactic Center horizon & astronomical night for Tokyo summer solstice', () => {
  const Astronomy = loadAstronomy();
  const PhotoSim = loadPhotoSimulator(Astronomy);

  // June 21 midnight in Tokyo (35.6895, 139.6917): Galactic Center should be above southern horizon
  const extras = PhotoSim.computeAstronomyExtras(35.6895, 139.6917, '2026-06-21', 0, Astronomy);
  assert.equal(extras.available, true);
  assert.ok(extras.gcAzimuth >= 0 && extras.gcAzimuth <= 360);
  assert.ok(extras.gcAltitude > 15 && extras.gcAltitude < 35, `Expected GC altitude ~24 deg, got ${extras.gcAltitude}`);
  assert.ok(extras.astroDusk instanceof Date && !Number.isNaN(extras.astroDusk.getTime()));
  assert.ok(extras.astroDawn instanceof Date && !Number.isNaN(extras.astroDawn.getTime()));
  assert.ok(extras.mwWindowStart instanceof Date && extras.mwWindowEnd instanceof Date);
  assert.ok(extras.mwPeakAlt > 20);
});

test('PhotoSimulator.computeLensFov calculates exact rectilinear FOV and crop factor', () => {
  const PhotoSim = loadPhotoSimulator(null);

  const ff24 = PhotoSim.computeLensFov(24, 'fullFrame');
  assert.ok(Math.abs(ff24.hFov - 73.74) < 0.05, `Expected 24mm FF hFov ~73.74, got ${ff24.hFov}`);
  assert.ok(Math.abs(ff24.vFov - 53.13) < 0.05, `Expected 24mm FF vFov ~53.13, got ${ff24.vFov}`);
  assert.equal(ff24.cropFactor, 1);

  const ff50 = PhotoSim.computeLensFov(50, 'fullFrame');
  assert.ok(Math.abs(ff50.hFov - 39.60) < 0.05, `Expected 50mm FF hFov ~39.60, got ${ff50.hFov}`);

  const apsc35 = PhotoSim.computeLensFov(35, 'apsc');
  assert.ok(apsc35.cropFactor >= 1.5 && apsc35.cropFactor <= 1.55);
  assert.ok(apsc35.eqFocalMm >= 52 && apsc35.eqFocalMm <= 54);
});

test('Terrain3D decodes Terrarium RGB, computes synthetic mountain horizon obstruction & delays sunrise', () => {
  // 32768m offset: (128, 0, 0) -> 0m; (131, 232, 0) -> 1000m
  assert.equal(Terrain3D.decodeTerrariumElevation(128, 0, 0), 0);
  assert.equal(Terrain3D.decodeTerrariumElevation(131, 232, 0), 1000);

  // Synthetic DEM: observer at 0m; due East ridge rising 1763m at ~10km distance => atan2(1763, 10000) ≈ 10.0 deg
  const centerLat = 30.0;
  const centerLng = 100.0;
  const ridgeSampler = (lat, lng) => {
    const dLngKm = (lng - centerLng) * 111.32 * Math.cos(centerLat * Math.PI / 180);
    const dLatKm = (lat - centerLat) * 110.57;
    if (dLngKm >= 9.5 && dLngKm <= 11.5 && Math.abs(dLatKm) < 5) {
      return 1763;
    }
    return 0;
  };

  const horizon = Terrain3D.computeHorizonFromSampler(centerLat, centerLng, ridgeSampler, { azStepDeg: 5 });
  assert.equal(horizon.available, true);
  assert.equal(horizon.profile.length, 72);
  const eastPoint = horizon.profile.find((p) => p.az === 90);
  assert.ok(eastPoint, 'Must contain az=90 east profile entry');
  assert.ok(eastPoint.maxAngleDeg > 8.5 && eastPoint.maxAngleDeg < 11.0, `Expected east ridge angle ~10 deg, got ${eastPoint.maxAngleDeg}`);

  const adj = Terrain3D.estimateTerrainAdjustedSunTimes(centerLat, centerLng, '2026-03-21', horizon.profile, SunCalc);
  assert.ok(adj && adj.sunriseDelayMin >= 30, `Expected significant sunrise delay >= 30m, got ${adj && adj.sunriseDelayMin}`);
});

test('BrightStars aligns Polaris to North Celestial Pole and normalizes J2000 unit vectors', () => {
  const stars = BrightStars.getProjectedStars(new Date('2026-06-21T00:00:00Z'));
  assert.ok(stars.length >= 80);
  const polaris = stars.find((s) => s.name === 'Polaris');
  assert.ok(polaris, 'Polaris must be present in BrightStars catalog');
  const norm = Math.hypot(polaris.x, polaris.y, polaris.z);
  assert.ok(Math.abs(norm - 1) < 1e-6);
  assert.ok(polaris.y > 0.999, `Expected Polaris y > 0.999, got ${polaris.y}`);
});

test('StreetView.parsePanoramaxFeature parses 360 STAC item and Worker validates V4 Phase 1 routes', async () => {
  const sampleStac = {
    id: 'pano-item-1',
    geometry: { coordinates: [2.2949, 48.8549] },
    providers: [{ name: 'IGN France' }],
    links: [
      { rel: 'prev', href: 'https://api.panoramax.xyz/api/items/prev-1' },
      { rel: 'next', href: 'https://api.panoramax.xyz/api/items/next-1' },
      { rel: 'license', href: 'https://etalab.fr', title: 'etalab-2.0' }
    ],
    assets: {
      sd: { href: 'https://example.com/sd.jpg' },
      hd: { href: 'https://example.com/hd.jpg' },
      thumb: { href: 'https://example.com/thumb.jpg' }
    },
    properties: {
      datetime: '2025-06-26T09:38:45Z',
      license: 'etalab-2.0',
      'view:azimuth': 314,
      'pers:interior_orientation': { field_of_view: 360 }
    }
  };
  const parsed = StreetView.parsePanoramaxFeature(sampleStac);
  assert.equal(parsed.isPano, true);
  assert.equal(parsed.azimuth, 314);
  assert.equal(parsed.author, 'IGN France');
  assert.equal(parsed.prevUrl, 'https://api.panoramax.xyz/api/items/prev-1');

  const workerMod = await import('../worker/index.js');
  const worker = workerMod.default;
  const mockEnv = { ASSETS: { fetch: async () => new Response('ok', { status: 200 }) } };

  const health = await (await worker.fetch(new Request('https://example.com/api/health'), mockEnv)).json();
  assert.equal(health.features.terrain, true);
  assert.equal(health.features.aurora, true);
  assert.equal(health.features.panoramax, true);

  const badPnx = await worker.fetch(new Request('https://example.com/api/panoramax?bbox=10,20,5,30'), mockEnv);
  assert.equal(badPnx.status, 400);

  const badTileZoom = await worker.fetch(new Request('https://example.com/api/tile/terrarium/25/1/1'), mockEnv);
  assert.equal(badTileZoom.status, 400);
});
