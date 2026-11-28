'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

global.SunCalc = require('../vendor/suncalc.min.js');
global.Astronomy = require('../vendor/astronomy.browser.min.js');
global.tzlookup = require('../vendor/tz-lookup.min.js');
require('../js/services/timezone-service.js');

const PhotoSimulator = require('../js/modules/photo-simulator.js');
const Terrain3DModule = require('../js/modules/terrain-3d.js');
const PhenologyEngine = require('../js/modules/phenology-engine.js');

const ROOT = path.resolve(__dirname, '..');

function loadAtlas() {
  const idx = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
  const sb = { window: {}, console };
  sb.window = sb;
  for (const m of idx.matchAll(/<script src="(data\/[^"?]+)(?:\?v=\d+)?"><\/script>/g)) {
    vm.runInNewContext(fs.readFileSync(path.join(ROOT, m[1]), 'utf8'), sb);
  }
  return sb.TRAVEL_ATLAS.getAll();
}

test('V5.1 Data Quality: Aldabra coordinates, Jasper distinct spots, EN reduplications & OurAirports hubs', () => {
  const all = loadAtlas();

  const aldabra = all.find((d) => d.id === 'sc-aldabra-outer');
  assert.ok(aldabra);
  assert.ok(Math.abs(aldabra.coords[0] - 46.35) < 0.2 && Math.abs(aldabra.coords[1] - (-9.417)) < 0.2,
    `Expected Aldabra coordinates on land, got ${JSON.stringify(aldabra.coords)}`);

  const jasper = all.find((d) => d.id === 'ca-rockies-jasper-icefields' || (d.spots || []).some((s) => /Bow Lake Viewpoint/i.test(s.name)));
  assert.ok(jasper);
  const bow = jasper.spots.find((s) => /Bow Lake Viewpoint/i.test(s.name));
  const peyto = jasper.spots.find((s) => /Peyto Lake Viewpoint/i.test(s.name));
  assert.ok(bow && peyto);
  assert.notEqual(JSON.stringify(bow.coords), JSON.stringify(peyto.coords), 'Bow Lake & Peyto Lake spots must have distinct coordinates');

  // Verify no accidental consecutive duplicate EN words (except real toponyms & grammatical English pairs like "early May may..." / "via Via...")
  const ALLOWED_DUP = new Set(['bora', 'wagga', 'pago', 'baden', 'puka', 'chow', 'meno', 'rewa', 'cat', 'killi', 'beho', 'mac', 'phi', 'nau', 'chau', 'may', 'via', 'vira', 'toro', 'llao', 'pole', 'tao', 'bom', 'hua']);
  const enDir = path.join(ROOT, 'data/i18n/en');
  for (const file of fs.readdirSync(enDir).filter((f) => f.endsWith('.json'))) {
    const obj = JSON.parse(fs.readFileSync(path.join(enDir, file), 'utf8'));
    const txt = JSON.stringify(obj);
    for (const m of txt.matchAll(/\b([A-Za-z]{3,})\s+\1\b/gi)) {
      const w = m[1].toLowerCase();
      assert.ok(ALLOWED_DUP.has(w), `Unexpected duplicated EN token "${m[0]}" in ${file}`);
    }
  }

  const hubs = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/transport/hubs.json'), 'utf8'));
  const xiapu = hubs.byId['cn-xiapu-pingtan'];
  assert.ok(xiapu && xiapu.nearestAirports && xiapu.nearestAirports[0].countryIso === 'CN', 'cn-xiapu-pingtan must match mainland CN airport (FOC)');
  assert.ok(xiapu.nearestAirports[0].distanceKm <= 100);

  const icelandHub = hubs.byId['is-sw-reykjavik-blue-lagoon'];
  assert.equal(icelandHub.isIsland, true);
  assert.equal(icelandHub.railHub.available, false, 'Iceland must not report passenger railHub');
});

test('V5.1 Astronomy & DEM Fixes: Reykjavik summer solstice, polar/moon differentiation & flat 0-deg horizon', () => {
  // Reykjavik June 21 civil day: Astronomy Engine computes real local sunset around 00:03/23:55 without SunCalc +24h distortion
  const reyk = PhotoSimulator.computeSimulation(64.1466, -21.9426, '2026-06-21', 720, 180, 0);
  assert.ok(reyk && reyk.times);
  assert.equal(reyk.polarState, 'white_night');
  assert.equal(PhotoSimulator.formatTimeInOffset(null, 0, 'twilight', 'white_night'), '白夜 / 连续曙暮光');
  assert.equal(PhotoSimulator.formatTimeInOffset(null, 0, 'moon'), '今日无升落');
  if (reyk.times.sunset) {
    const diffHours = Math.abs(reyk.times.sunset.getTime() - Date.UTC(2026, 5, 21, 12, 0)) / 3600000;
    assert.ok(diffHours < 13, `Reykjavik sunset must fall inside local civil day boundary, got ${reyk.times.sunset.toISOString()}`);
  }

  // Flat horizon profile (0 deg across all azimuths) must give 0 delay / 0 early sunset
  const flatHorizon = Terrain3DModule.computeHorizonFromSampler(35.01, 135.77, () => 50, { observerHeightM: 1.6 });
  assert.equal(flatHorizon.maxObstacleDeg, 0);
  const flatAdj = Terrain3DModule.estimateTerrainAdjustedSunTimes(35.01, 135.77, '2026-04-15', flatHorizon.profile, global.SunCalc, 540);
  assert.equal(flatAdj.sunriseDelayMin, 0);
  assert.equal(flatAdj.sunsetEarlyMin, 0);
});

test('V5.1 Phenology Honesty: Arctic white-night Milky Way cap, tropical autumn cap & validation baselines', () => {
  const all = loadAtlas();
  const reyk = all.find((d) => d.id === 'is-sw-reykjavik-blue-lagoon');
  const mwJune = PhenologyEngine.evaluatePhenology(reyk, 6, { category: 'milkyway', astroRef: global.Astronomy });
  assert.ok(mwJune.suitability <= 10, `Reykjavik June Milky Way must be <=10 during white night, got ${mwJune.suitability}`);

  const singapore = all.find((d) => d.id === 'sg-singapore' || d.country === '新加坡');
  if (singapore) {
    const sgAutumn = PhenologyEngine.evaluatePhenology(singapore, 10, { category: 'autumn' });
    assert.ok(sgAutumn.suitability <= 30, `Tropical Singapore autumn foliage score must be capped, got ${sgAutumn.suitability}`);
  }

  const val = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/enrichment/phenology-validation.json'), 'utf8'));
  assert.ok(Number.isFinite(val.models.blossom.baselineCityMeanMaeDays));
  assert.ok(Number.isFinite(val.models.blossom.leaveOneCityOutMaeDays));
  assert.ok(Number.isFinite(val.models.autumn.baselineCityMeanMaeDays));
  assert.ok(Number.isFinite(val.models.autumn.leaveOneCityOutMaeDays));
  assert.match(val.methodology, /climatological|not interannual/i);
});
