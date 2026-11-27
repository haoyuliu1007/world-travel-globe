'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const vm = require('node:vm');

const SunCalc = require('../vendor/suncalc.min.js');
const PhenologyEngine = require('../js/modules/phenology-engine.js');
global.SunCalc = SunCalc;
global.PhenologyEngine = PhenologyEngine;
const PhotoSimulator = require('../js/modules/photo-simulator.js');
const GeoIntelligence = require('../js/modules/geo-intelligence.js');

const ROOT = path.resolve(__dirname, '..');

function loadAtlasVm() {
  const indexHtml = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
  const scriptMatches = [...indexHtml.matchAll(/<script src="(data\/[^"?]+)(?:\?v=\d+)?"><\/script>/g)];
  const sandbox = { window: {}, console };
  sandbox.window = sandbox;
  for (const m of scriptMatches) {
    vm.runInNewContext(fs.readFileSync(path.join(ROOT, m[1]), 'utf8'), sandbox);
  }
  return { atlas: sandbox.TRAVEL_ATLAS };
}

test('V5 Enrichment Schema 5.0 + Phenology Holdout Validation', () => {
  const enr = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/enrichment/atlas-enrichment.json'), 'utf8'));
  const val = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/enrichment/phenology-validation.json'), 'utf8'));

  assert.equal(enr.schemaVersion, '5.0.0');
  assert.equal(enr.totalCities, 722);
  assert.equal(val.schemaVersion, '5.0.0');
  assert.ok(val.coverage.calibratedSubsetCount >= 20 && val.coverage.calibratedSubsetCount <= 40);
  assert.ok(val.models.blossom.holdoutMaeDays < 6, `Blossom holdout MAE=${val.models.blossom.holdoutMaeDays}`);
  assert.ok(val.models.autumn.holdoutMaeDays < 8, `Autumn holdout MAE=${val.models.autumn.holdoutMaeDays}`);

  const kyoto = enr.byId['jp-kansai-kyoto'];
  assert.equal(kyoto.phenologyModelTier, 'C');
  assert.ok(kyoto.provenance && kyoto.provenance.source && kyoto.provenance.timeCoverage);
  assert.ok(kyoto.calibratedPhenology && kyoto.calibratedPhenology.blossom && kyoto.calibratedPhenology.autumn);
});

test('PhenologyEngine exposes Tier A/B/C metadata and separates Aurora space weather', () => {
  const { atlas } = loadAtlasVm();
  const enr = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/enrichment/atlas-enrichment.json'), 'utf8'));
  const all = atlas.getAll();
  const kyoto = all.find((d) => d.id === 'jp-kansai-kyoto');
  const tromso = all.find((d) => d.id === 'no-arctic-tromso-nordkapp');

  const sakuraEv = PhenologyEngine.evaluatePhenology(kyoto, 4, {
    category: 'blossom',
    enrichment: enr.byId[kyoto.id]
  });
  assert.equal(sakuraEv.tier, 'C');
  assert.equal(sakuraEv.modelFamily, 'botanical-phenology');
  assert.ok(sakuraEv.provenance && sakuraEv.provenance.source);
  assert.ok(sakuraEv.uncertaintyDays > 0);

  const auroraEv = PhenologyEngine.evaluatePhenology(tromso, 11, {
    category: 'aurora',
    enrichment: enr.byId[tromso.id],
    sunCalcRef: SunCalc
  });
  assert.equal(auroraEv.modelFamily, 'space-weather');
  assert.ok(auroraEv.suitability >= 60);

  const glacierEv = PhenologyEngine.evaluatePhenology(tromso, 2, {
    category: 'ice_glacier',
    enrichment: enr.byId[tromso.id]
  });
  assert.equal(glacierEv.category, 'ice_glacier');
});

test('PhotoSimulator Photo Opportunity Index enforces 8 scenes, >14d weather guard, and Alpenglow disclaimer', () => {
  assert.equal(Object.keys(PhotoSimulator.SCENE_PRESETS).length, 8);

  const nearFuture = new Date(Date.now() + 2 * 86400000).toISOString().slice(0, 10);
  const farFuture = new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10);

  const simNear = PhotoSimulator.computeSimulation(35.01, 135.77, nearFuture, 6 * 60, 110);
  const poiNear = PhotoSimulator.computePhotoOpportunityIndex({
    lat: 35.01,
    lng: 135.77,
    dateStr: nearFuture,
    minutes: 6 * 60,
    cameraAzimuth: 110,
    sceneType: 'sunrise_sunset',
    sim: simNear,
    weather: { cloudCover: 12, visibilityKm: 24, precipProb: 5, windKmh: 8 }
  });
  assert.equal(poiNear.weatherIncluded, true);
  assert.ok(poiNear.score >= 50 && poiNear.score <= 100);
  assert.ok(Array.isArray(poiNear.positiveDrivers) && poiNear.positiveDrivers.length > 0);

  const simFar = PhotoSimulator.computeSimulation(35.01, 135.77, farFuture, 6 * 60, 110);
  const poiFar = PhotoSimulator.computePhotoOpportunityIndex({
    lat: 35.01,
    lng: 135.77,
    dateStr: farFuture,
    minutes: 6 * 60,
    cameraAzimuth: 110,
    sceneType: 'milky_way',
    sim: simFar,
    weather: { cloudCover: 99, precipProb: 95, visibilityKm: 1, windKmh: 80 }
  });
  assert.equal(poiFar.weatherIncluded, false);
  assert.match(poiFar.indexDisclaimer, /14|astro|历史|norm|天文/i);

  const alpenglow = PhotoSimulator.computePeakAlpenglowEstimate(
    2100,
    6740,
    new Date('2026-04-01T07:00:00Z'),
    new Date('2026-04-01T19:00:00Z')
  );
  assert.ok(alpenglow.leadMinutes > 0);
  assert.match(alpenglow.demDisclaimer, /DEM|30|90/i);
});

test('GeoIntelligence 10-dim vector, filtered similarity, and expanded query constraints', () => {
  const { atlas } = loadAtlasVm();
  const enr = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/enrichment/atlas-enrichment.json'), 'utf8'));
  const all = atlas.getAll();
  const tokyo = all.find((d) => d.id === 'jp-kanto-tokyo');

  const vec = GeoIntelligence.buildDestinationVector(tokyo, enr.byId[tokyo.id]);
  assert.equal(vec.length, 10);
  vec.forEach((v) => assert.ok(v >= 0 && v <= 1, `vector dim out of range: ${v}`));

  const sims = GeoIntelligence.findSimilarDestinations('jp-kansai-kyoto', all, {
    limit: 5,
    cheaperThanSource: true,
    sameMonth: true,
    enrichmentMap: enr.byId
  });
  assert.ok(sims.length > 0);
  assert.ok(sims[0].reasons.length > 0);

  const intent = GeoIntelligence.parseNaturalQuery('10月去日本高铁方便看红叶，预算8000，慢游5天，不要海滩');
  assert.equal(intent.month, 10);
  assert.equal(intent.preferTransit, true);
  assert.equal(intent.pace, 'relaxed');
  assert.equal(intent.maxBudgetRmb, 8000);
  assert.ok(intent.excludeTags.includes('coast'));
});
