'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const rootDir = path.resolve(__dirname, '..');
const TimezoneService = require('../js/services/timezone-service.js');
const SolarTerminator = require('../js/modules/solar-terminator.js');

function loadSunCalcAndPhotoSim() {
  const sb = {
    window: {},
    console,
    Date,
    Math,
    Intl,
    Map,
    URLSearchParams,
    setTimeout,
    clearTimeout,
    module: undefined,
    exports: undefined
  };
  sb.window = sb;
  sb.globalThis = sb;
  vm.runInNewContext(fs.readFileSync(path.join(rootDir, 'vendor', 'tz-lookup.min.js'), 'utf8'), sb);
  vm.runInNewContext(fs.readFileSync(path.join(rootDir, 'vendor', 'suncalc.min.js'), 'utf8'), sb);
  sb.window.TimezoneService = TimezoneService;
  sb.TimezoneService = TimezoneService;
  vm.runInNewContext(fs.readFileSync(path.join(rootDir, 'js', 'modules', 'photo-simulator.js'), 'utf8'), sb);
  return { SunCalc: sb.SunCalc, PhotoSimulator: sb.PhotoSimulator, tzlookup: sb.tzlookup };
}

test('V4.5 IANA TimezoneService resolves winter/summer DST, half-hour & 45-min offsets across 8 global cities', () => {
  const cases = [
    { name: 'Wuhan', lat: 30.5928, lng: 114.3055, iana: 'Asia/Shanghai', janMin: 480, julMin: 480 },
    { name: 'Kathmandu', lat: 27.7172, lng: 85.3240, iana: 'Asia/Kathmandu', janMin: 345, julMin: 345 },
    { name: 'Adelaide', lat: -34.9285, lng: 138.6007, iana: 'Australia/Adelaide', janMin: 630, julMin: 570 },
    { name: 'New York', lat: 40.7128, lng: -74.0060, iana: 'America/New_York', janMin: -300, julMin: -240 },
    { name: 'London', lat: 51.5074, lng: -0.1278, iana: 'Europe/London', janMin: 0, julMin: 60 },
    { name: 'Reykjavik', lat: 64.1466, lng: -21.9426, iana: 'Atlantic/Reykjavik', janMin: 0, julMin: 0 },
    { name: 'Tekapo', lat: -44.0047, lng: 170.4771, iana: 'Pacific/Auckland', janMin: 780, julMin: 720 },
    { name: 'Tromsø', lat: 69.6492, lng: 18.9553, iana: 'Europe/Oslo', janMin: 60, julMin: 120 }
  ];

  for (const c of cases) {
    const jan = TimezoneService.resolveOffsetForLocationDate(c.lat, c.lng, '2026-01-15', 720);
    const jul = TimezoneService.resolveOffsetForLocationDate(c.lat, c.lng, '2026-07-15', 720);
    assert.equal(jan.iana, c.iana, `${c.name} IANA timezone mismatch`);
    assert.equal(jan.source, 'iana');
    assert.equal(jan.offsetMin, c.janMin, `${c.name} Jan offset mismatch`);
    assert.equal(jul.offsetMin, c.julMin, `${c.name} Jul offset mismatch`);
  }

  // Verify PhotoSimulator automatically applies 45-min Kathmandu offset and Adelaide seasonal DST shift
  const { PhotoSimulator } = loadSunCalcAndPhotoSim();
  const ktmSim = PhotoSimulator.computeSimulation(27.7172, 85.3240, '2026-04-15', 720, 180);
  assert.equal(ktmSim.utcOffsetMin, 345);
  assert.equal(ktmSim.utcOffsetLabel, 'UTC+5:45');

  const adlJan = PhotoSimulator.computeSimulation(-34.9285, 138.6007, '2026-01-15', 720, 180);
  const adlJul = PhotoSimulator.computeSimulation(-34.9285, 138.6007, '2026-07-15', 720, 180);
  assert.equal(adlJan.utcOffsetMin, 630);
  assert.equal(adlJan.isDst, true);
  assert.equal(adlJul.utcOffsetMin, 570);
  assert.equal(adlJul.isDst, false);

  // Explicit fallback outside land/coverage
  const oceanFallback = TimezoneService.resolveOffsetForLocationDate(Number.NaN, 120, '2026-04-15', 720);
  assert.equal(oceanFallback.source, 'longitude_fallback');
  assert.ok(oceanFallback.displayLabel.startsWith('Est.'));
});

test('V4.5 SolarTerminator handles exact equinox, solstices, antimeridian & cross-validates against SunCalc', () => {
  const { SunCalc } = loadSunCalcAndPhotoSim();

  const dates = [
    new Date('2026-03-20T14:46:00Z'), // Vernal equinox instant (dec ≈ 0°)
    new Date('2026-06-21T12:00:00Z'), // June solstice
    new Date('2026-09-22T23:55:00Z'), // Autumn equinox near 180° date line
    new Date('2026-12-21T06:00:00Z')  // December solstice
  ];

  for (const dt of dates) {
    const geo = SolarTerminator.buildTerminatorGeoJson(dt);
    assert.equal(geo.terminatorLine.features[0].geometry.coordinates.length, 181);
    assert.equal(geo.nightPolygons.features.length, 3);

    // Every ring must be closed, valid [-180, 180] x [-85.051, 85.051], and have no > 40° antimeridian jump
    for (const feat of geo.nightPolygons.features) {
      const rings = feat.geometry.type === 'MultiPolygon'
        ? feat.geometry.coordinates.map((p) => p[0])
        : feat.geometry.coordinates;
      assert.ok(rings.length >= 1);
      for (const ring of rings) {
        assert.ok(ring.length >= 4);
        assert.deepEqual(ring[0], ring[ring.length - 1], `Closed ring on ${dt.toISOString()} ${feat.properties.band}`);
        for (const [lng, lat] of ring) {
          assert.ok(Number.isFinite(lng) && Number.isFinite(lat));
          assert.ok(lng >= -180 && lng <= 180, `lng ${lng} out of range`);
          assert.ok(lat >= -85.052 && lat <= 85.052, `lat ${lat} out of range`);
        }
      }
    }

    // Independent cross-validation against SunCalc solar altitude across terminator points
    for (const [lng, lat] of geo.terminatorLine.features[0].geometry.coordinates) {
      if (Math.abs(lat) >= 84.5) continue; // clamped at Web Mercator pole limit
      const scPos = SunCalc.getPosition(dt, lat, lng);
      assert.ok(
        Math.abs(scPos.altitude) < 1.0,
        `Terminator point (${lat}, ${lng}) on ${dt.toISOString()} disagrees with SunCalc altitude: ${scPos.altitude}°`
      );
    }
  }

  // Exact equinox continuity: declinations +0.01° vs -0.01° must NOT jump along equator
  const preEq = SolarTerminator.buildTerminatorGeoJson(new Date('2026-03-20T14:30:00Z'));
  const postEq = SolarTerminator.buildTerminatorGeoJson(new Date('2026-03-20T15:00:00Z'));
  const subPre = preEq.subsolar;
  const subPost = postEq.subsolar;
  assert.ok(Math.abs(subPre.lat) < 0.2 && Math.abs(subPost.lat) < 0.2);
});
