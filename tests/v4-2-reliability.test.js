'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const rootDir = path.resolve(__dirname, '..');

const ProfileCRDT = require('../js/services/crdt-merge.js');
const GeoIntelligence = require('../js/modules/geo-intelligence.js');
const PhenologyEngine = require('../js/modules/phenology-engine.js');
const MediaWikidataService = require('../js/services/media-wikidata.js');

function loadPhotoSimulatorWithSunCalc() {
  const sb = {
    window: {},
    console,
    Date,
    Math,
    URLSearchParams,
    setTimeout,
    clearTimeout
  };
  sb.window = sb;
  sb.globalThis = sb;
  vm.runInNewContext(fs.readFileSync(path.join(rootDir, 'vendor', 'suncalc.min.js'), 'utf8'), sb);
  vm.runInNewContext(fs.readFileSync(path.join(rootDir, 'js', 'modules', 'photo-simulator.js'), 'utf8'), sb);
  return sb.PhotoSimulator;
}

function loadI18nDict() {
  const sb = {
    window: {
      location: { search: '' },
      localStorage: { getItem: () => null, setItem: () => {} }
    },
    document: {
      documentElement: { lang: 'zh-CN' },
      querySelectorAll: () => [],
      getElementById: () => null
    },
    URLSearchParams,
    console
  };
  sb.window.window = sb.window;
  vm.runInNewContext(fs.readFileSync(path.join(rootDir, 'js', 'i18n.js'), 'utf8'), sb);
  return sb.window.AppI18n;
}

test('V4.2 CRDT tombstones prevent resurrection across offline devices & strip secrets', () => {
  const devA = {
    schemaVersion: '4.2.0',
    logicalClock: 3,
    tombstones: {
      travelStatus: { 'jp-kyoto': 5000 },
      customLists: {},
      trips: { trip_del: 6000 },
      expenses: {},
      userPhotos: {}
    },
    travelStatus: [
      {
        destId: 'is-reykjavik',
        status: 'visited',
        notes: 'Aurora night',
        rating: 5,
        updatedAt: 5200,
        fieldUpdatedAt: { status: 5200, notes: 4000, rating: 5200 }
      }
    ],
    trips: [],
    expenses: [],
    customLists: [],
    userPhotos: [],
    settings: [
      { key: 'cloudSyncPassphrase', value: 'my-secret-pass', updatedAt: 9999 },
      { key: 'mapillaryToken', value: 'secret-token', updatedAt: 9999 },
      { key: 'preferredUnit', value: 'metric', updatedAt: 4000 }
    ]
  };

  // Device B was offline and still holds stale kyoto + trip_del, plus a newer note on reykjavik
  const devB = {
    schemaVersion: '4.0.0',
    logicalClock: 2,
    tombstones: { travelStatus: {}, customLists: {}, trips: {}, expenses: {}, userPhotos: {} },
    travelStatus: [
      { destId: 'jp-kyoto', status: 'planned', notes: 'stale', updatedAt: 3000 },
      {
        destId: 'is-reykjavik',
        status: 'wishlist',
        notes: 'Edited Kirkjufell coordinates',
        rating: 4,
        updatedAt: 5100,
        fieldUpdatedAt: { status: 3500, notes: 5500, rating: 4000 }
      }
    ],
    trips: [{ id: 'trip_del', name: 'Old Trip', updatedAt: 4500 }],
    expenses: [],
    customLists: [],
    userPhotos: [],
    settings: [{ key: 'preferredUnit', value: 'imperial', updatedAt: 4000 }]
  };

  const m1 = ProfileCRDT.mergeUserProfiles(devA, devB);
  const m2 = ProfileCRDT.mergeUserProfiles(devB, devA);

  // Commutativity
  assert.deepEqual(m1.merged.travelStatus, m2.merged.travelStatus);
  assert.deepEqual(m1.merged.trips, m2.merged.trips);
  assert.deepEqual(m1.merged.settings, m2.merged.settings);

  // Deleted records must NOT resurrect
  assert.equal(m1.merged.travelStatus.some((x) => x.destId === 'jp-kyoto'), false);
  assert.equal(m1.merged.trips.some((x) => x.id === 'trip_del'), false);
  assert.ok(m1.stats.deletedByTombstone >= 2);

  // Field-level merge preserves Device A's newer status (5200 > 3500) AND Device B's newer note (5500 > 4000)
  const reyk = m1.merged.travelStatus.find((x) => x.destId === 'is-reykjavik');
  assert.equal(reyk.status, 'visited');
  assert.equal(reyk.notes, 'Edited Kirkjufell coordinates');

  // Re-creation with newer timestamp (> tombstone) succeeds
  const devC = {
    travelStatus: [{ destId: 'jp-kyoto', status: 'visited', updatedAt: 7000 }],
    tombstones: {}
  };
  const m3 = ProfileCRDT.mergeUserProfiles(m1.merged, devC);
  assert.equal(m3.merged.travelStatus.some((x) => x.destId === 'jp-kyoto'), true);

  // Sensitive secrets never leak into sync payload
  const sanitized = ProfileCRDT.sanitizeProfileForSync(m1.merged);
  assert.equal(sanitized.settings.some((s) => s.key === 'cloudSyncPassphrase' || s.key === 'mapillaryToken'), false);
  assert.equal(sanitized.settings.some((s) => s.key === 'preferredUnit'), true);
});

test('V4.2 PhotoSimulator calculates astronomy in destination local time across 6 global test cities', () => {
  const PhotoSimulator = loadPhotoSimulatorWithSunCalc();
  const cities = [
    { name: 'Tromsø', lat: 69.6492, lng: 18.9553, date: '2026-04-15' },
    { name: 'Reykjavik', lat: 64.1466, lng: -21.9426, date: '2026-04-15' },
    { name: 'Wuhan', lat: 30.5928, lng: 114.3055, date: '2026-04-15' },
    { name: 'Singapore', lat: 1.3521, lng: 103.8198, date: '2026-04-15' },
    { name: 'Tekapo', lat: -44.0047, lng: 170.4771, date: '2026-04-15' },
    { name: 'Antarctica Peninsula', lat: -64.825, lng: -63.493, date: '2026-01-15' }
  ];

  for (const c of cities) {
    const sim = PhotoSimulator.computeSimulation(c.lat, c.lng, c.date, 12 * 60, 180);
    assert.ok(sim && sim.curve.length > 40, `${c.name} curve generated`);
    let peak = sim.curve[0];
    for (const pt of sim.curve) {
      if (pt.alt > peak.alt) peak = pt;
    }
    // Solar noon altitude peak in destination local time must fall near 12:00 (within 1.5h for longitude zones)
    assert.ok(
      peak.h >= 10.5 && peak.h <= 14.0,
      `${c.name} solar noon peak should be near 12:00 destination local time, got ${peak.h}h`
    );
    assert.ok(sim.utcOffsetLabel.startsWith('UTC'), `${c.name} includes UTC offset badge`);
  }
});

test('V4.2 Viewfinder optical crop scales telephoto reticle frame & supports portrait / aspect ratios', () => {
  const PhotoSimulator = loadPhotoSimulatorWithSunCalc();
  const lens200 = PhotoSimulator.computeLensFov(200, 'fullFrame');
  assert.ok(lens200.vFov < 8);
  const projTele = PhotoSimulator.computeViewfinderProjection(lens200, 1280, 720, 18, 65);
  assert.equal(projTele.appliedMapVFov, 18);
  assert.equal(projTele.isTelephotoCrop, true);
  assert.ok(projTele.verticalRatio < 0.42);
  assert.ok(projTele.cropPct < 45);

  const lens14 = PhotoSimulator.computeLensFov(14, 'fullFrame');
  const projWide = PhotoSimulator.computeViewfinderProjection(lens14, 1280, 720, 18, 65);
  assert.equal(projWide.appliedMapVFov, 65);
  assert.equal(projWide.isWideApproximation, true);

  const lensPortrait = PhotoSimulator.computeLensFov(50, 'fullFrame', { orientation: 'portrait', aspectOverride: '3:2' });
  assert.equal(lensPortrait.aspect, '2:3');
  assert.ok(lensPortrait.vFov > lensPortrait.hFov);

  const lensSquare = PhotoSimulator.computeLensFov(35, 'fullFrame', { aspectOverride: '1:1' });
  assert.equal(lensSquare.aspect, '1:1');
  assert.equal(lensSquare.hFov, lensSquare.vFov);
});

test('V4.2 GeoIntelligence supports negative constraints, hard budget ceilings & tight exact search', () => {
  const sampleDests = [
    {
      id: 'fr-paris',
      name: '巴黎',
      shortName: '巴黎',
      country: '法国',
      province: '法兰西岛',
      continent: 'europe',
      priority: 1,
      coords: [2.35, 48.85],
      monthScores: [3, 3, 4, 5, 5, 5, 4, 4, 5, 5, 3, 4],
      subtitle: '塞纳河铁塔建筑艺术之都',
      comfortBudgetRmb: 16000
    },
    {
      id: 'cn-sanya',
      name: '三亚',
      shortName: '三亚',
      country: '中国',
      province: '海南',
      continent: 'asia',
      priority: 1,
      coords: [109.5, 18.25],
      monthScores: [5, 5, 4, 4, 3, 3, 3, 3, 3, 4, 5, 5],
      subtitle: '热带海岛沙滩海岸日落',
      comfortBudgetRmb: 5500
    },
    {
      id: 'cn-kangding',
      name: '康定',
      shortName: '康定',
      country: '中国',
      province: '四川',
      continent: 'asia',
      priority: 2,
      coords: [101.96, 30.05],
      monthScores: [3, 3, 4, 4, 4, 4, 4, 4, 5, 5, 4, 3],
      subtitle: '雪山垭口冰川秋色海子',
      comfortBudgetRmb: 4800
    }
  ];

  // Negative constraint excludes coast/beach destination (Sanya)
  const negRes = GeoIntelligence.searchAndExplain('10月 亚洲 雪山 不要海滩', sampleDests);
  assert.equal(negRes.results.some((r) => r.dest.id === 'cn-sanya'), false);
  assert.equal(negRes.results.some((r) => r.dest.id === 'cn-kangding'), true);

  // Hard budget cap excludes Paris (16,000 > 6,000 * 1.15)
  const budgetRes = GeoIntelligence.searchAndExplain('10月 预算6000', sampleDests);
  assert.equal(budgetRes.results.some((r) => r.dest.id === 'fr-paris'), false);
});

test('V4.2 MediaWikidata rejects cross-continent state flags & PhenologyEngine labels ERA5 reanalysis honestly', () => {
  const flagRes = MediaWikidataService.scoreTravelPhoto(
    { title: 'Flag of Arizona', description: 'State flag of Arizona US', width: 1200, height: 800 },
    '阿那亚',
    '中国'
  );
  assert.equal(flagRes.isIrrelevant, true);

  const snowClim = Array.from({ length: 12 }, () => ({ tempMean: -5, snowProbPct: 68, rainProbPct: 20, clearProbPct: 60, sunshineHours: 140 }));
  const ev = PhenologyEngine.evaluatePhenology(
    { id: 'jp-hokkaido', name: '北海道', coords: [142.5, 43.2], monthScores: Array(12).fill(5) },
    1,
    { category: 'snow', climateMonthly: snowClim }
  );
  assert.equal(ev.dataSource, 'era5-reanalysis');
  assert.match(ev.explanation, /再分析/);
});

test('V4.2 CI workflow paths, docs hygiene, and English UI dictionary integrity', () => {
  const workflowText = fs.readFileSync(path.join(rootDir, '.github', 'workflows', 'data-governance.yml'), 'utf8');
  assert.equal(workflowText.includes('working-directory: globe-app'), false);
  assert.ok(workflowText.includes('data/audit-report.json'));

  const dataSourcesDoc = fs.readFileSync(path.join(rootDir, 'docs', 'DATA_SOURCES.md'), 'utf8');
  assert.equal(/file:\/\/\/c:/i.test(dataSourcesDoc), false);

  const i18n = loadI18nDict();
  i18n.setLang('en');
  for (const key of ['pageTitle', 'statusVisited', 'spotLightSim', 'spotViewfinder3d', 'mediaGalleryCount', 'plannerTitle', 'archiveTitle']) {
    assert.ok(i18n.t(key) && i18n.t(key) !== key, `Missing English translation for ${key}`);
  }
});
