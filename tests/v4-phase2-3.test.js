'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const rootDir = path.resolve(__dirname, '..');
const SunCalc = require(path.join(rootDir, 'vendor', 'suncalc.min.js'));
const GeoIntel = require(path.join(rootDir, 'js', 'modules', 'geo-intelligence.js'));
const Pheno = require(path.join(rootDir, 'js', 'modules', 'phenology-engine.js'));
const TripPlanner = require(path.join(rootDir, 'js', 'modules', 'trip-planner.js'));
const ProfileCRDT = require(path.join(rootDir, 'js', 'services', 'crdt-merge.js'));

function loadAstronomy() {
  const code = fs.readFileSync(path.join(rootDir, 'vendor', 'astronomy.browser.min.js'), 'utf8');
  const sb = { window: {}, self: {}, console, Date, Math };
  sb.window = sb;
  sb.self = sb;
  vm.runInNewContext(code, sb);
  return sb.Astronomy;
}

test('GeoIntelligence parses natural-language constraints and produces explainable recommendations', () => {
  const q1 = '寻找10月份适合拍摄金色秋林、雪山、湖泊的欧洲旅行目的地';
  const intent1 = GeoIntel.parseNaturalQuery(q1);
  assert.equal(intent1.hasIntent, true);
  assert.equal(intent1.month, 10);
  assert.equal(intent1.continent, 'europe');
  assert.ok(intent1.landscapeTags.includes('autumn'));
  assert.ok(intent1.landscapeTags.includes('snow'));
  assert.ok(intent1.landscapeTags.includes('lake'));

  const q2 = '预算不超过8000元 7天 少雨 自然风光';
  const intent2 = GeoIntel.parseNaturalQuery(q2);
  assert.equal(intent2.hasIntent, true);
  assert.equal(intent2.maxBudgetRmb, 8000);
  assert.equal(intent2.days, 7);
  assert.equal(intent2.preferDry, true);

  const sampleDests = [
    {
      id: 'it-dolomites',
      name: '多洛米蒂 Dolomites',
      shortName: '多洛米蒂',
      country: '意大利',
      continent: 'europe',
      priority: 1,
      weatherTags: ['sunny'],
      subtitle: '阿尔卑斯金色落叶松与雪山湖泊',
      heroSummary: '10月落叶松金秋倒映在高山湖泊，雪峰林立',
      monthScores: [3, 3, 3, 3, 4, 5, 5, 5, 5, 5, 3, 4],
      budget: { comfort: { items: [{ category: '综合', cost: 11000 }] } }
    },
    {
      id: 'sg-city',
      name: '新加坡 Singapore',
      shortName: '新加坡',
      country: '新加坡',
      continent: 'asia',
      priority: 1,
      weatherTags: ['rain'],
      subtitle: '热带花园都市',
      heroSummary: '全年温暖都市地标',
      monthScores: [4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 3, 3],
      budget: { comfort: { items: [{ category: '综合', cost: 7500 }] } }
    }
  ];

  const out = GeoIntel.searchAndExplain(q1, sampleDests);
  assert.ok(out.results.length >= 1);
  assert.equal(out.results[0].dest.id, 'it-dolomites');
  assert.ok(out.results[0].reasons.length >= 2);
});

test('atlas-enrichment.json covers 722 cities non-destructively and PhenologyEngine differentiates landscape models', () => {
  const enrPath = path.join(rootDir, 'data', 'enrichment', 'atlas-enrichment.json');
  assert.ok(fs.existsSync(enrPath), 'atlas-enrichment.json must exist');
  const enr = JSON.parse(fs.readFileSync(enrPath, 'utf8'));
  assert.equal(enr.nonDestructive, true);
  assert.equal(enr.totalCities, 722);
  assert.equal(Object.keys(enr.byId).length, 722);

  const Astro = loadAstronomy();
  const reykjavik = { id: 'is-reykjavik', coords: [-21.94, 64.15], monthScores: [4, 4, 4, 3, 3, 4, 4, 4, 5, 5, 4, 4] };
  const singapore = { id: 'sg-city', coords: [103.82, 1.35], monthScores: [4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 3, 3] };

  const aurIce = Pheno.evaluatePhenology(reykjavik, 11, { category: 'aurora', sunCalcRef: SunCalc });
  const aurSg = Pheno.evaluatePhenology(singapore, 11, { category: 'aurora', sunCalcRef: SunCalc });
  assert.ok(aurIce.suitability > aurSg.suitability + 40, `Expected Iceland aurora (${aurIce.suitability}) >> Singapore (${aurSg.suitability})`);
  assert.equal(aurIce.dataSource, 'astronomy');
  assert.ok(aurIce.limitations.length > 5);

  const mwSummer = Pheno.evaluatePhenology({ id: 'nz-tekapo', coords: [170.48, -44.0], monthScores: [4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4] }, 7, {
    category: 'milkyway',
    astroRef: Astro
  });
  assert.equal(mwSummer.dataSource, 'astronomy');
  assert.ok(mwSummer.suitability >= 60);
});

test('TripPlanner.twoOptOptimize shortens crossed routes and orderDayStopsByLight orders sunrise to sunset', () => {
  const crossed = [
    { name: 'A', coords: [0.0, 0.0] },
    { name: 'B', coords: [1.0, 1.0] },
    { name: 'C', coords: [1.0, 0.0] },
    { name: 'D', coords: [0.0, 1.0] }
  ];
  const distKm = (arr) => {
    const r = Math.PI / 180;
    let total = 0;
    for (let i = 0; i < arr.length - 1; i++) {
      const a = arr[i].coords;
      const b = arr[i + 1].coords;
      const dLat = (b[1] - a[1]) * r;
      const dLng = (b[0] - a[0]) * r;
      const s = Math.sin(dLat / 2) ** 2 + Math.cos(a[1] * r) * Math.cos(b[1] * r) * Math.sin(dLng / 2) ** 2;
      total += 6371 * 2 * Math.asin(Math.min(1, Math.sqrt(s)));
    }
    return total;
  };

  const opt = TripPlanner.twoOptOptimize(crossed);
  assert.equal(opt.length, 4);
  assert.ok(distKm(opt) < distKm(crossed), `Expected 2-opt (${distKm(opt).toFixed(1)}km) < crossed (${distKm(crossed).toFixed(1)}km)`);

  const stops = [
    { name: 'Sunset Cliff', bestTime: '日落黄金时刻' },
    { name: 'Museum', bestTime: '全天开放' },
    { name: 'Sunrise Peak', bestTime: '日出前30分钟' }
  ];
  const ordered = TripPlanner.orderDayStopsByLight(stops);
  assert.equal(ordered[0].name, 'Sunrise Peak');
  assert.equal(ordered[ordered.length - 1].name, 'Sunset Cliff');
});

test('ProfileCRDT.mergeUserProfiles is commutative, idempotent, and preserves concurrent edits', () => {
  const profileA = {
    schemaVersion: 1,
    travelStatus: [
      { destId: 'jp-kyoto', status: 'visited', updatedAt: 1000 },
      { destId: 'is-reykjavik', status: 'wishlist', updatedAt: 2000 }
    ],
    trips: [{ id: 'trip_1', name: 'Kyoto', updatedAt: 1500 }],
    expenses: [],
    customLists: [],
    userPhotos: [],
    settings: [{ key: 'cloudSyncPassphrase', value: 'secret-a' }]
  };
  const profileB = {
    schemaVersion: 1,
    travelStatus: [
      { destId: 'jp-kyoto', status: 'planned', updatedAt: 900 },
      { destId: 'ch-zermatt', status: 'planned', updatedAt: 3000 }
    ],
    trips: [{ id: 'trip_2', name: 'Alps', updatedAt: 2500 }],
    expenses: [],
    customLists: [],
    userPhotos: [],
    settings: []
  };

  const ab = ProfileCRDT.mergeUserProfiles(profileA, profileB).merged;
  const ba = ProfileCRDT.mergeUserProfiles(profileB, profileA).merged;
  assert.equal(ab.travelStatus.length, 3);
  assert.equal(ba.travelStatus.length, 3);
  assert.deepEqual(ab.travelStatus, ba.travelStatus);
  assert.equal(ab.travelStatus.find((x) => x.destId === 'jp-kyoto').status, 'visited');
  assert.equal(ab.trips.length, 2);

  const idem = ProfileCRDT.mergeUserProfiles(ab, ab).merged;
  assert.deepEqual(idem.travelStatus, ab.travelStatus);
  assert.deepEqual(idem.trips, ab.trips);
});
