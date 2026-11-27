'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const ProfileCRDT = require('../js/services/crdt-merge.js');

function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0;
    a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const DEST_IDS = ['jp-kyoto', 'is-reykjavik', 'cn-wuhan', 'np-kathmandu', 'au-adelaide'];
const STATUSES = ['visited', 'planned', 'wishlist'];
const NOTES = ['sunrise view', 'aurora forecast', 'golden hour', 'check weather', ''];

function randomProfile(rng) {
  const ts = () => 1000 + Math.floor(rng() * 12) * 100;
  const clk = () => Math.floor(rng() * 5);

  const travelStatus = [];
  for (const destId of DEST_IDS) {
    if (rng() < 0.65) {
      const updatedAt = ts();
      const useFields = rng() < 0.7;
      const rec = {
        destId,
        status: STATUSES[Math.floor(rng() * STATUSES.length)],
        rating: Math.floor(rng() * 6),
        updatedAt,
        clock: clk()
      };
      if (rng() < 0.8) rec.notes = NOTES[Math.floor(rng() * NOTES.length)];
      if (rng() < 0.5) rec.visitedAt = '2026-04-12';
      if (useFields) {
        rec.fieldUpdatedAt = {
          status: ts(),
          notes: ts(),
          rating: ts(),
          visitedAt: ts()
        };
      }
      travelStatus.push(rec);
    }
  }

  const trips = [];
  for (let i = 1; i <= 3; i++) {
    if (rng() < 0.55) {
      trips.push({
        id: `trip_${i}`,
        name: `Route ${i}-${Math.floor(rng() * 4)}`,
        updatedAt: ts(),
        clock: clk()
      });
    }
  }

  const expenses = [];
  for (let i = 1; i <= 3; i++) {
    if (rng() < 0.45) {
      expenses.push({
        id: `exp_${i}`,
        amountRmb: 100 * (1 + Math.floor(rng() * 8)),
        updatedAt: ts(),
        clock: clk()
      });
    }
  }

  const customLists = [];
  for (let i = 1; i <= 2; i++) {
    if (rng() < 0.45) {
      customLists.push({
        id: `list_${i}`,
        name: `List ${Math.floor(rng() * 5)}`,
        destIds: ['jp-kyoto'],
        updatedAt: ts(),
        clock: clk()
      });
    }
  }

  const userPhotos = [];
  for (let i = 1; i <= 2; i++) {
    if (rng() < 0.4) {
      userPhotos.push({
        id: `photo_${i}`,
        destId: 'jp-kyoto',
        updatedAt: ts(),
        clock: clk()
      });
    }
  }

  const tombs = { travelStatus: {}, customLists: {}, trips: {}, expenses: {}, userPhotos: {} };
  for (const destId of DEST_IDS) {
    if (rng() < 0.35) tombs.travelStatus[destId] = ts();
  }
  for (let i = 1; i <= 3; i++) {
    if (rng() < 0.3) tombs.trips[`trip_${i}`] = ts();
    if (rng() < 0.25) tombs.expenses[`exp_${i}`] = ts();
  }

  const settings = [
    { key: 'preferredUnit', value: rng() < 0.5 ? 'metric' : 'imperial', updatedAt: ts(), clock: clk() },
    { key: 'cloudSyncPassphrase', value: `secret-${Math.floor(rng() * 999)}`, updatedAt: 99999 },
    { key: 'apiTokens', value: { mapillary: 'tok' }, updatedAt: 99999 }
  ];

  return {
    schemaVersion: '4.5.0',
    logicalClock: 1 + Math.floor(rng() * 10),
    tombstones: tombs,
    travelStatus,
    customLists,
    trips,
    expenses,
    userPhotos,
    settings
  };
}

test('V4.5 CRDT randomized property suite: commutativity, associativity & idempotency across 240 trials', () => {
  const rng = mulberry32(0x450450);

  for (let trial = 0; trial < 240; trial++) {
    const a = randomProfile(rng);
    const b = randomProfile(rng);
    const c = randomProfile(rng);

    const ab = ProfileCRDT.mergeUserProfiles(a, b).merged;
    const ba = ProfileCRDT.mergeUserProfiles(b, a).merged;
    assert.deepEqual(ab, ba, `Commutativity failed on trial ${trial}`);

    const ab_c = ProfileCRDT.mergeUserProfiles(ab, c).merged;
    const bc = ProfileCRDT.mergeUserProfiles(b, c).merged;
    const a_bc = ProfileCRDT.mergeUserProfiles(a, bc).merged;
    assert.deepEqual(ab_c, a_bc, `Associativity failed on trial ${trial}`);

    const ab_ab = ProfileCRDT.mergeUserProfiles(ab, ab).merged;
    assert.deepEqual(ab_ab, ab, `Idempotency(merge(AB, AB)) failed on trial ${trial}`);

    const ab_c_c = ProfileCRDT.mergeUserProfiles(ab_c, c).merged;
    assert.deepEqual(ab_c_c, ab_c, `Absorption(merge(ABC, C)) failed on trial ${trial}`);

    // Secrets never survive merge or sanitization
    const sanitized = ProfileCRDT.sanitizeProfileForSync(ab_c);
    for (const s of sanitized.settings) {
      assert.equal(ProfileCRDT.LOCAL_ONLY_SETTING_KEYS.has(s.key), false);
    }
  }
});

test('V4.5 CRDT 3-device out-of-order convergence: delete vs stale vs re-create across all 6 permutations', () => {
  // Dev A has stale record at t=1000
  const devA = {
    logicalClock: 1,
    tombstones: {},
    travelStatus: [{ destId: 'cn-wuhan', status: 'planned', notes: 'old', updatedAt: 1000, clock: 1 }]
  };
  // Dev B deleted it offline at t=2000
  const devB = {
    logicalClock: 2,
    tombstones: { travelStatus: { 'cn-wuhan': 2000 } },
    travelStatus: []
  };
  // Dev C re-created it later at t=3000 (keeps tomb=2000 or only has t=3000)
  const devC = {
    logicalClock: 3,
    tombstones: {},
    travelStatus: [{ destId: 'cn-wuhan', status: 'visited', notes: 'recreated', updatedAt: 3000, clock: 3 }]
  };

  const perms = [
    [devA, devB, devC],
    [devA, devC, devB],
    [devB, devA, devC],
    [devB, devC, devA],
    [devC, devA, devB],
    [devC, devB, devA]
  ];

  const results = perms.map(([x, y, z]) => {
    const xy = ProfileCRDT.mergeUserProfiles(x, y).merged;
    return ProfileCRDT.mergeUserProfiles(xy, z).merged;
  });

  for (let i = 0; i < results.length; i++) {
    assert.deepEqual(results[i], results[0], `Permutation ${i} diverged`);
    const rec = results[i].travelStatus.find((d) => d.destId === 'cn-wuhan');
    assert.ok(rec, 'Re-created record at t=3000 should survive');
    assert.equal(rec.status, 'visited');
    assert.equal(rec.notes, 'recreated');
    assert.equal(results[i].logicalClock, 3);
  }
});
