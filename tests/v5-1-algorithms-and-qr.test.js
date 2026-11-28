'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fc = require('fast-check');
const jsQR = require('jsqr');

const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

global.Fuse = require('../vendor/fuse.min.js');
global.MiniSearch = require('../vendor/minisearch.min.js');
global.SunCalc = require('../vendor/suncalc.min.js');
global.Astronomy = require('../vendor/astronomy.browser.min.js');

// Load qrcode-generator into global for QRCodeService
vm.runInThisContext(fs.readFileSync(path.join(__dirname, '../vendor/qrcode-generator.min.js'), 'utf8'));

const CRDT = require('../js/services/crdt-merge.js');
const ExpenseSplitter = require('../js/lazy/expense-splitter.js');
const QRCodeService = require('../js/services/qr-code.js');
const TransportService = require('../js/services/transport-service.js');
const RoutingService = require('../js/services/routing-service.js');
const TripPlanner = require('../js/modules/trip-planner.js');
const GeoIntelligence = require('../js/modules/geo-intelligence.js');

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

test('CRDT mergeTripDocuments satisfies commutativity, associativity, idempotence & tombstone safety (500 trials)', () => {
  const stopArb = fc.record({
    id: fc.constantFrom('s1', 's2', 's3', 's4'),
    name: fc.constantFrom('Spot A', 'Spot B', 'Spot C', 'Spot D'),
    order: fc.integer({ min: 0, max: 10 }),
    updatedAt: fc.integer({ min: 1000, max: 2000 }),
    dwellMin: fc.constantFrom(60, 90, 120)
  });

  const tripDocArb = fc.record({
    id: fc.constant('trip_prop'),
    name: fc.constantFrom('Kyoto Plan', 'Autumn Trip', 'Alpine Loop'),
    updatedAt: fc.integer({ min: 1000, max: 2000 }),
    clock: fc.integer({ min: 1, max: 50 }),
    days: fc.tuple(fc.array(stopArb, { maxLength: 4 }), fc.array(stopArb, { maxLength: 4 })).map(([d1, d2]) => [
      { day: 1, title: 'Day 1', titleUpdatedAt: 1200, stops: d1 },
      { day: 2, title: 'Day 2', titleUpdatedAt: 1200, stops: d2 }
    ]),
    deletedStopIds: fc.dictionary(
      fc.constantFrom('s1', 's2', 's3', 's4'),
      fc.integer({ min: 1000, max: 2000 })
    )
  });

  const canonical = (doc) => JSON.stringify({
    id: doc.id,
    name: doc.name,
    clock: doc.clock,
    stopTombstones: doc.stopTombstones,
    days: (doc.days || []).map((dy) => ({
      day: dy.day,
      title: dy.title,
      stops: (dy.stops || []).map((s) => ({ id: s.id, name: s.name, order: s.order, updatedAt: s.updatedAt }))
    }))
  });

  fc.assert(
    fc.property(tripDocArb, tripDocArb, tripDocArb, (a, b, c) => {
      // Idempotence
      const aa = CRDT.mergeTripDocuments(a, a);
      assert.equal(canonical(aa), canonical(CRDT.mergeTripDocuments(aa, a)));

      // Commutativity
      const ab = CRDT.mergeTripDocuments(a, b);
      const ba = CRDT.mergeTripDocuments(b, a);
      assert.equal(canonical(ab), canonical(ba));

      // Associativity
      const abc1 = CRDT.mergeTripDocuments(ab, c);
      const bc = CRDT.mergeTripDocuments(b, c);
      const abc2 = CRDT.mergeTripDocuments(a, bc);
      assert.equal(canonical(abc1), canonical(abc2));
    }),
    { numRuns: 500 }
  );
});

test('ExpenseSplitter integer-cent conservation, multi-currency & exact min-transfer optimality (500 trials)', () => {
  const memberPool = ['Alice', 'Bob', 'Carol', 'Dave', 'Eve'].map((id) => ({ id, name: id }));
  const memberIds = memberPool.map((m) => m.id);
  const expArb = fc.record({
    id: fc.string({ minLength: 2, maxLength: 6 }),
    note: fc.constant('Item'),
    amount: fc.integer({ min: 1, max: 50000 }).map((c) => Number((c / 100).toFixed(2))),
    currency: fc.constantFrom('CNY', 'USD', 'JPY'),
    payerId: fc.constantFrom(...memberIds),
    splitType: fc.constantFrom('equal', 'custom'),
    participants: fc.constant(memberIds)
  });

  fc.assert(
    fc.property(fc.array(expArb, { minLength: 1, maxLength: 8 }), (rawList) => {
      const expenses = rawList.map((e, idx) => {
        if (e.splitType === 'custom') {
          const share = Number((e.amount / 5).toFixed(2));
          const rem = Number((e.amount - share * 4).toFixed(2));
          return Object.assign({}, e, {
            id: `e_${idx}`,
            customShares: { Alice: share, Bob: share, Carol: share, Dave: share, Eve: rem }
          });
        }
        return Object.assign({}, e, { id: `e_${idx}` });
      });

      const res = ExpenseSplitter.computeSettlements(memberPool, expenses, {
        fxToCny: { CNY: 1, USD: 7.2, JPY: 0.048 }
      });

      const sumCents = res.balances.reduce((acc, b) => acc + Math.round(b.netBalance * 100), 0);
      assert.equal(sumCents, 0, 'Net balances must conserve exact cents (sum === 0)');

      const nonZeroMembers = res.balances.filter((b) => Math.abs(b.netBalance) > 0.005).length;
      if (nonZeroMembers > 0) {
        assert.equal(res.method, 'exact_optimal');
        assert.ok(res.transfers.length <= nonZeroMembers - 1, `Expected <= ${nonZeroMembers - 1} transfers, got ${res.transfers.length}`);
      } else {
        assert.equal(res.transfers.length, 0);
      }

      // Verify transfers settle every member balance to 0
      const verifyCents = {};
      res.balances.forEach((b) => { verifyCents[b.userId] = Math.round(b.netBalance * 100); });
      res.transfers.forEach((t) => {
        const c = Math.round(t.amount * 100);
        verifyCents[t.fromId] += c;
        verifyCents[t.toId] -= c;
      });
      Object.values(verifyCents).forEach((v) => assert.ok(Math.abs(v) <= 1, `Residual cent mismatch: ${v}`));
    }),
    { numRuns: 500 }
  );

  // Explicit invalid custom share warning + refund test
  const badRes = ExpenseSplitter.computeSettlements(
    [{ id: 'A', name: 'A' }, { id: 'B', name: 'B' }],
    [
      { id: '1', note: 'Dinner', amount: 100, payerId: 'A', participants: ['A', 'B', 'A'], splitType: 'custom', customShares: { A: 30, B: 40 } },
      { id: '2', note: 'Refund', amount: -20, payerId: 'A', participants: ['A', 'B'], splitType: 'equal' }
    ]
  );
  assert.ok(badRes.warnings.length >= 1, 'Mismatched custom shares must emit explicit warning');
  assert.equal(badRes.balances.reduce((s, x) => s + Math.round(x.netBalance * 100), 0), 0);
});

test('QRCodeService produces real scannable QR matrices decoded by jsQR for short/long UTF-8 & rejects overflow', () => {
  const decodeQrText = (text) => {
    const matrix = QRCodeService.encodeMatrix(text);
    const n = matrix.length;
    const quiet = 4;
    const scale = 6;
    const dim = (n + quiet * 2) * scale;
    const rgba = new Uint8ClampedArray(dim * dim * 4);
    rgba.fill(255);
    for (let r = 0; r < n; r++) {
      for (let c = 0; c < n; c++) {
        if (!matrix[r][c]) continue;
        for (let dy = 0; dy < scale; dy++) {
          for (let dx = 0; dx < scale; dx++) {
            const x = (c + quiet) * scale + dx;
            const y = (r + quiet) * scale + dy;
            const idx = (y * dim + x) * 4;
            rgba[idx] = 0;
            rgba[idx + 1] = 0;
            rgba[idx + 2] = 0;
            rgba[idx + 3] = 255;
          }
        }
      }
    }
    const decoded = jsQR(rgba, dim, dim);
    assert.ok(decoded && decoded.data, `Failed to decode QR for: ${text}`);
    assert.equal(decoded.data, text);
  };

  decodeQrText('https://world-travel-globe.globe-app.workers.dev/?focus=jp-kansai-kyoto');
  decodeQrText('https://world-travel-globe.globe-app.workers.dev/?trip=京都摄影协作&days=5&m=11&spots=清水寺_岚山_伏见稻荷大社_金阁寺_哲学之道&note=' + 'A'.repeat(90));
  assert.throws(() => QRCodeService.encodeMatrix('X'.repeat(3200)), /capacity|2953/i);
});

test('TransportService cross-sea graph, Antarctica expeditions, antimeridian split & RoutingService overland error', async () => {
  const shanghaiToTokyo = TransportService.compareIntercityModes({
    originLabel: '上海',
    originCoords: [121.4737, 31.2304],
    dest: { id: 'jp-kanto-tokyo', name: '东京', shortName: '东京', coords: [139.6917, 35.6895] }
  });
  const byId = Object.fromEntries(shanghaiToTokyo.modes.map((m) => [m.id, m]));
  assert.equal(byId.flight.feasible, true);
  assert.equal(byId.hsr.feasible, false, 'Shanghai->Tokyo crosses sea: HSR must be infeasible');
  assert.equal(byId.rail.feasible, false, 'Shanghai->Tokyo crosses sea: Rail must be infeasible');
  assert.equal(byId.driving.feasible, false, 'Shanghai->Tokyo crosses sea: Driving must be infeasible');

  const hnlToMaui = TransportService.compareIntercityModes({
    originLabel: 'Honolulu',
    originCoords: [-157.8583, 21.3069],
    dest: { id: 'us-hi-east-maui-haleakala-hana', name: '茂宜岛', shortName: '茂宜岛', coords: [-156.2533, 20.7097] }
  });
  const hnlModes = Object.fromEntries(hnlToMaui.modes.map((m) => [m.id, m]));
  assert.equal(hnlModes.driving.feasible, false, 'Oahu -> Maui inter-island road impossible');
  assert.equal(hnlModes.ferry.feasible, true);

  const ant = TransportService.compareIntercityModes({
    originLabel: 'Ushuaia',
    originCoords: [-68.303, -54.8019],
    dest: { id: 'aq-peninsula', name: '南极半岛', shortName: '南极半岛', coords: [-62.5, -64.8] }
  });
  const antModes = Object.fromEntries(ant.modes.map((m) => [m.id, m]));
  assert.equal(antModes.flight.feasible, false, 'Antarctica has no scheduled commercial flights');
  assert.equal(antModes.ferry.feasible, true);

  const hnlToTokyo = TransportService.compareIntercityModes({
    originLabel: 'Honolulu',
    originCoords: [-157.8583, 21.3069],
    dest: { id: 'jp-kanto-tokyo', name: '东京', shortName: '东京', coords: [139.6917, 35.6895] }
  });
  assert.equal(hnlToTokyo.geometry.type, 'MultiLineString', 'Trans-Pacific antimeridian arc must split at ±180°');
  for (const seg of hnlToTokyo.geometry.coordinates) {
    for (let i = 1; i < seg.length; i++) {
      assert.ok(Math.abs(seg[i][0] - seg[i - 1][0]) < 180, 'Antimeridian split segments must not jump across globe');
    }
  }

  // Short overland route failing upstream fetch -> crossSea MUST be false, routingError true
  const origFetch = global.fetch;
  global.fetch = async () => { throw new Error('Simulated OSRM outage'); };
  try {
    const shortOverland = await RoutingService.routeSegment([139.70, 35.68], [139.77, 35.71], 'driving');
    assert.equal(shortOverland.crossSea, false);
    assert.equal(shortOverland.routingError, true);
  } finally {
    global.fetch = origFetch;
  }
});

test('TripPlanner CSV formula guard, CITY_ALIASES accuracy & GeoIntelligence intent fixes', () => {
  const all = loadAtlas();
  ['paris', 'london', 'new york', 'zurich', 'reykjavik', 'honolulu', '北京', '东京'].forEach((q) => {
    const hits = TripPlanner.resolveDestinationMatches(q, all);
    assert.ok(hits.length > 0, `Expected non-empty matches for alias query "${q}"`);
  });

  const csv = TripPlanner.tripToCsv({
    mode: 'driving',
    days: [{ day: 1, title: '=cmd|calc', stops: [{ name: '+SUM(A1)', coords: [0, 0], locked: false }] }],
    budgetItems: [{ category: '@evil', detail: '-100', cost: 100 }]
  });
  assert.ok(!csv.includes('"=cmd') && csv.includes("'=cmd"));
  assert.ok(!csv.includes('"+SUM') && csv.includes("'+SUM"));
  assert.ok(!csv.includes('"@evil') && csv.includes("'@evil"));
  assert.ok(!csv.includes('"-100') && csv.includes("'-100"));

  assert.equal(GeoIntelligence.searchAndExplain('', all).results.length, 0);
  assert.equal(GeoIntelligence.searchAndExplain('   ', all).results.length, 0);

  const jungleIntent = GeoIntelligence.parseNaturalQuery('tropical jungle adventure marine coast');
  assert.equal(jungleIntent.month, null, 'jungle/marine must not false-trigger June/March');

  const yrIntent = GeoIntelligence.parseNaturalQuery('元阳梯田 2026年');
  assert.equal(yrIntent.maxBudgetRmb, null, '元阳梯田 2026年 must not parse 2026 as RMB budget');

  const asiaRes = GeoIntelligence.searchAndExplain('亚洲 10月 秋色', all);
  asiaRes.results.forEach((r) => assert.equal(r.dest.continent, 'asia'));

  const tokyo = all.find((d) => d.id === 'jp-kanto-tokyo');
  const reykjavik = all.find((d) => d.id === 'is-sw-reykjavik-blue-lagoon');
  const vTokyo = GeoIntelligence.buildDestinationVector(tokyo);
  const vReyk = GeoIntelligence.buildDestinationVector(reykjavik);
  assert.ok(vTokyo[9] > vReyk[9], `Expected Tokyo transitScore (${vTokyo[9]}) > Iceland (${vReyk[9]})`);
});
