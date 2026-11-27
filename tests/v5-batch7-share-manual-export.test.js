'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ExportService = require('../js/lazy/export-service.js');
const ShareCenter = require('../js/lazy/share-center.js');

const ROOT = path.resolve(__dirname, '..');

test('V5.0 Batch 7: ExportService exports all 8 open formats cleanly with real TripPlanner trip shape', () => {
  const sampleTrip = {
    id: 'trip_v5_kyoto',
    name: 'Kyoto Spring Atlas',
    origin: 'Shanghai',
    destName: 'Kyoto',
    startDate: '2026-04-02',
    days: [
      {
        day: 1,
        title: 'Day 1 Sunrise',
        stops: [
          { name: 'Kiyomizu-dera, View', coords: [135.785, 34.9949], dwellMin: 90, locked: true, note: 'Arrive 06:00' },
          { name: 'Arashiyama Bamboo', coords: [135.6713, 35.0168], dwellMin: 120, note: 'Soft morning glow' }
        ]
      }
    ]
  };

  const jsonOut = JSON.parse(ExportService.toJSON(sampleTrip));
  assert.equal(jsonOut.format, 'KAIROS-Trip-v5');
  assert.equal(jsonOut.days[0].stops.length, 2);

  const csvOut = ExportService.toCSV(sampleTrip);
  assert.ok(csvOut.startsWith('\uFEFFDay,Date,Order'));
  assert.ok(csvOut.includes('"Kiyomizu-dera, View"'));

  const icsOut = ExportService.toICS(sampleTrip);
  assert.ok(icsOut.includes('BEGIN:VCALENDAR') && icsOut.includes('BEGIN:VEVENT') && icsOut.includes('END:VCALENDAR'));
  assert.ok(icsOut.includes('Kiyomizu-dera\\, View'));

  const gpxOut = ExportService.toGPX(sampleTrip);
  assert.ok(gpxOut.includes('<gpx version="1.1"') && gpxOut.includes('<wpt ') && gpxOut.includes('<trkpt '));

  const kmlOut = ExportService.toKML(sampleTrip);
  assert.ok(kmlOut.includes('http://www.opengis.net/kml/2.2') && kmlOut.includes('<Placemark>') && kmlOut.includes('<LineString>'));

  const geo = JSON.parse(ExportService.toGeoJSON(sampleTrip));
  assert.equal(geo.type, 'FeatureCollection');
  assert.equal(geo.features.length, 3); // 2 points + 1 linestring

  const htmlOut = ExportService.toPrintableHtml(sampleTrip);
  assert.ok(htmlOut.includes('KAIROS.') && htmlOut.includes('Kiyomizu-dera, View'));
});

test('V5.0 Batch 7: ShareCenter defines 12 types, 6 aspect ratios, deep links & web intents', () => {
  assert.equal(ShareCenter.SHARE_TYPES.length, 12);
  assert.equal(Object.keys(ShareCenter.POSTER_RATIOS).length, 6);

  const link = ShareCenter.buildDeepLink({
    dest: { id: 'jp-kansai-kyoto' },
    spotIdx: 2,
    state: { cameraAzimuth: 145, dateStr: '2026-04-04' },
    layers: ['aurora', 'phenology']
  });
  const parsed = new URL(link);
  assert.equal(parsed.searchParams.get('focus'), 'jp-kansai-kyoto');
  assert.equal(parsed.searchParams.get('spot'), '2');
  assert.equal(parsed.searchParams.get('cam'), '145');
  assert.equal(parsed.searchParams.get('date'), '2026-04-04');
  assert.equal(parsed.searchParams.get('layers'), 'aurora,phenology');

  const intents = ShareCenter.buildSocialIntents('Kyoto Dawn', link);
  assert.equal(intents.length, 5);
  assert.ok(intents.some((i) => i.id === 'x' && i.url.includes('twitter.com/intent/tweet')));
});

test('V5.0 Batch 7: Trilingual 30-chapter User Manuals exist cleanly for zh-CN, zh-TW, and en', () => {
  const cn = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/docs/manual-zh-CN.json'), 'utf8'));
  const tw = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/docs/manual-zh-TW.json'), 'utf8'));
  const en = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/docs/manual-en.json'), 'utf8'));

  [cn, tw, en].forEach((doc) => {
    assert.equal(doc.schemaVersion, '5.0.0');
    assert.equal(doc.chapters.length, 30);
    doc.chapters.forEach((ch) => {
      assert.ok(ch.id >= 1 && ch.id <= 30);
      assert.ok(ch.slug && ch.title && ch.purpose && ch.entry && ch.example && ch.issues && ch.limits);
      assert.ok(Array.isArray(ch.steps) && ch.steps.length >= 2);
    });
  });

  assert.notEqual(cn.chapters[0].title, en.chapters[0].title);
  assert.ok(tw.chapters[7].title.includes('攝影') || tw.chapters[4].title.includes('攝影'));
});
