'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.resolve(__dirname, '..');

test('V5.0 Batch 3: Global transport hubs cover all 722 destinations with OurAirports provenance', () => {
  const hubs = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/transport/hubs.json'), 'utf8'));
  assert.equal(hubs.count, 722);
  assert.ok(hubs.source.includes('OurAirports'));
  const bj = hubs.byId['cn-beijing'];
  assert.ok(bj && bj.nearestAirports.length >= 1);
  assert.ok(['PEK', 'PKX'].includes(bj.nearestAirports[0].iata));
  assert.equal(bj.railHub.available, true);
  assert.ok(bj.railHub.operatorUrl.includes('12306.cn'));
});

test('V5.0 Batch 3: TransportService 3-tier comparison, great-circle honesty & local transit fallback', async () => {
  const sandbox = { window: {}, console, Math, Date, Array, Object, String, Number, JSON, Promise, encodeURIComponent };
  sandbox.window = sandbox;
  vm.runInNewContext(fs.readFileSync(path.join(ROOT, 'js/services/transport-service.js'), 'utf8'), sandbox);

  const TS = sandbox.TransportService;
  const cmp = TS.compareIntercityModes({
    originLabel: '北京',
    originCoords: [116.4074, 39.9042],
    dest: { id: 'jp-kanto-tokyo', name: '东京', coords: [139.6917, 35.6895] }
  });
  assert.ok(cmp.modes.some((m) => m.id === 'flight' && m.feasible && m.routeKind === 'schematic_great_circle'));
  assert.ok(cmp.geometry && cmp.geometry.coordinates.length >= 20);
  const flight = cmp.modes.find((m) => m.id === 'flight');
  assert.ok(flight.officialUrl.includes('google.com/travel/flights'));

  const transitLeg = await TS.computeLocalLeg([116.397, 39.916], [116.427, 39.936], 'transit');
  assert.equal(transitLeg.routed, false);
  assert.ok(transitLeg.durationMin >= 10);
});

test('V5.0 Batch 3: TripPlanner 2.0 preserves locked stops during re-optimization, supports multi-city & conflict detection', () => {
  const sandbox = { window: {}, console, Date, Math, Set, Map, Array, Object, String, Number, JSON, URL, URLSearchParams, TextEncoder, TextDecoder, btoa, atob };
  sandbox.window = sandbox;
  vm.runInNewContext(fs.readFileSync(path.join(ROOT, 'data/registry.js'), 'utf8'), sandbox);
  vm.runInNewContext(fs.readFileSync(path.join(ROOT, 'data/asia/china/north_metro.js'), 'utf8'), sandbox);
  vm.runInNewContext(fs.readFileSync(path.join(ROOT, 'data/asia/japan.js'), 'utf8'), sandbox);
  vm.runInNewContext(fs.readFileSync(path.join(ROOT, 'js/services/transport-service.js'), 'utf8'), sandbox);
  vm.runInNewContext(fs.readFileSync(path.join(ROOT, 'js/modules/trip-planner.js'), 'utf8'), sandbox);

  const TP = sandbox.TripPlanner;
  const bj = sandbox.TRAVEL_ATLAS.getById('cn-beijing');
  const tokyo = sandbox.TRAVEL_ATLAS.getById('jp-kanto-tokyo');

  const multi = TP.generateTripPlan({
    origin: '上海',
    dests: [bj, tokyo],
    days: 5,
    travelers: 2,
    budgetRmb: 16000,
    intercityMode: 'flight',
    mode: 'transit'
  });
  assert.equal(multi.destIds.length, 2);
  assert.equal(multi.budgetItems.length, 9);
  assert.ok(multi.prep.packing.length >= 4 && multi.prep.gear.length >= 3);

  // Lock stop at index 1 on Day 1 and verify reoptimizeUnlockedDays keeps it at index 1
  const d0 = multi.days[0];
  if (d0.stops.length >= 3) {
    d0.stops[1].locked = true;
    const lockedId = d0.stops[1].id;
    TP.reoptimizeUnlockedDays(multi);
    assert.equal(d0.stops[1].id, lockedId, 'Locked stop must stay pinned at index 1');
  }

  // Trigger budget conflict
  multi.budgetItems[0].cost = 99999;
  const conflicts = TP.detectTripConflicts(multi);
  assert.ok(conflicts.some((c) => c.type === 'budget_over'));
});
