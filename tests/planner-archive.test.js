'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

const rootDir = path.resolve(__dirname, '..');
const RoutingService = require(path.join(rootDir, 'js', 'services', 'routing-service.js'));
const TripPlanner = require(path.join(rootDir, 'js', 'modules', 'trip-planner.js'));
const TravelArchive = require(path.join(rootDir, 'js', 'modules', 'travel-archive.js'));

test('RoutingService refuses to fabricate land route across oceans (>2500km)', async () => {
  // Tokyo to Paris (~9700km)
  const seg = await RoutingService.routeSegment([139.6917, 35.6895], [2.3522, 48.8566], 'driving');
  assert.equal(seg.routed, false);
  assert.equal(seg.crossSea, true);
  assert.equal(seg.durationMin, null);
  assert.ok(seg.distanceKm > 9000);
});

test('TripPlanner generates day-by-day plan, CSV export, and URL share round-trip', () => {
  const mockDest = {
    id: 'jp-kanto-tokyo',
    shortName: '东京',
    name: '东京',
    coords: [139.6917, 35.6895],
    spots: [
      { name: 'Spot A', category: '现代建筑', coords: [139.75, 35.66], bestTime: '07:00' },
      { name: 'Spot B', category: '自然美景', coords: [139.77, 35.63], bestTime: '17:30' },
      { name: 'Spot C', category: '现代建筑', coords: [139.81, 35.71], bestTime: '18:00' }
    ],
    budget: {
      comfort: {
        items: [
          { category: '机票', detail: '往返', cost: 4000 },
          { category: '住宿', detail: '4晚', cost: 6000 }
        ]
      }
    },
    itinerary: [{ day: 'Day 1', title: '建筑线' }]
  };

  const trip = TripPlanner.generateTripPlan({ dest: mockDest, days: 2, budgetRmb: 10000, mode: 'walking' });
  assert.equal(trip.days.length, 2);
  assert.equal(trip.days.reduce((s, d) => s + d.stops.length, 0), 3);

  const csv = TripPlanner.tripToCsv(trip);
  assert.ok(csv.includes('Spot A') && csv.includes('walking'));

  const shareUrl = TripPlanner.serializeTripToUrl(trip);
  const param = new URL(shareUrl.startsWith('http') ? shareUrl : `https://example.com/${shareUrl}`).searchParams.get('trip');
  const restored = TripPlanner.deserializeTripFromParam(param);
  assert.equal(restored.name, trip.name);
  assert.equal(restored.mode, 'walking');
  assert.equal(restored.days.length, 2);
});

test('TravelArchive encodes/decodes footprint share URL and computes exploration stats', () => {
  const statuses = [
    { destId: 'jp-kanto-tokyo', status: 'visited' },
    { destId: 'fr-paris', status: 'planned' },
    { destId: 'is-reykjavik', status: 'wishlist' }
  ];
  const url = TravelArchive.encodeFootprintShare(statuses);
  const param = new URL(url.startsWith('http') ? url : `https://example.com/${url}`).searchParams.get('footprint');
  const decoded = TravelArchive.decodeFootprintShare(param);
  assert.equal(decoded.length, 3);
  assert.equal(decoded[0].status, 'visited');

  const stats = TravelArchive.computeExplorationStats(statuses, [
    { id: 'jp-kanto-tokyo', continent: 'asia', country: '日本' },
    { id: 'fr-paris', continent: 'europe', country: '法国' },
    { id: 'is-reykjavik', continent: 'europe', country: '冰岛' }
  ]);
  assert.equal(stats.visitedCount, 1);
  assert.equal(stats.countriesVisited, 1);
  assert.equal(stats.continentsVisited, 1);
});
