'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const MediaWikidata = require('../js/services/media-wikidata.js');
const TravelArchive = require('../js/modules/travel-archive.js');

const ROOT = path.resolve(__dirname, '..');

test('V5.0 Batch 6: MediaWikidata allows rice terrace / wild duck scenery while rejecting food dishes', () => {
  const terrace = MediaWikidata.scoreTravelPhoto(
    { title: 'Yuanyang Rice Terraces at sunrise', description: 'Misty terraced fields in Yunnan', width: 1600, height: 1000 },
    '元阳梯田',
    '中国'
  );
  assert.equal(terrace.isIrrelevant, false);
  assert.ok(terrace.score > 20);

  const wildDuck = MediaWikidata.scoreTravelPhoto(
    { title: 'Mallard wild duck on alpine lake', description: 'Wildlife in mountain valley', width: 1400, height: 930 },
    '卡纳斯',
    '中国'
  );
  assert.equal(wildDuck.isIrrelevant, false);

  const friedRice = MediaWikidata.scoreTravelPhoto(
    { title: 'Yangzhou fried rice dish on plate', description: 'Restaurant menu item', width: 1200, height: 900 },
    '扬州',
    '中国'
  );
  assert.equal(friedRice.isIrrelevant, true);

  const roastDuck = MediaWikidata.scoreTravelPhoto(
    { title: 'Peking roast duck meal at restaurant', description: 'Delicious food dish', width: 1200, height: 900 },
    '北京',
    '中国'
  );
  assert.equal(roastDuck.isIrrelevant, true);
});

test('V5.0 Batch 6: MediaWikidata extractPhotoSeason parses EXIF dates honestly with hemisphere flip', () => {
  const nhSpring = MediaWikidata.extractPhotoSeason({ capturedAt: '2025:04:05 07:30:00' }, 35.0);
  assert.equal(nhSpring.season, 'spring');
  assert.equal(nhSpring.month, 4);

  const shAutumn = MediaWikidata.extractPhotoSeason({ capturedAt: '2025-04-05' }, -45.0);
  assert.equal(shAutumn.season, 'autumn');

  const undated = MediaWikidata.extractPhotoSeason({ title: 'Random Scenic Shot' }, 35.0);
  assert.equal(undated.season, 'unknown');
  assert.equal(undated.month, null);
});

test('V5.0 Batch 6: Worker /api/epic supports ?date=YYYY-MM-DD with honest fallback to latest', async () => {
  const workerMod = await import('../worker/index.js');
  const origFetch = global.fetch;
  try {
    global.fetch = async (url) => {
      const s = String(url);
      if (s.includes('/api/natural/date/2025-01-01')) {
        return new Response(JSON.stringify([]), { status: 200, headers: { 'Content-Type': 'application/json' } });
      }
      if (s.endsWith('/api/natural')) {
        return new Response(JSON.stringify([{
          identifier: '20260401001122',
          caption: 'Test EPIC',
          date: '2026-04-01 00:11:22',
          image: 'epic_1b_20260401001122',
          centroid_coordinates: { lat: 0, lon: 120 },
          dscovr_j2000_position: { x: 1e6, y: 1e6, z: 2e5 }
        }]), { status: 200, headers: { 'Content-Type': 'application/json' } });
      }
      return new Response('[]', { status: 404 });
    };

    const res = await workerMod.default.fetch(new Request('https://kairos.example/api/epic?date=2025-01-01'), {});
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.requestedDate, '2025-01-01');
    assert.equal(body.actualDate, '2026-04-01');
    assert.equal(body.fallbackToLatest, true);
    assert.equal(body.frames.length, 1);
  } finally {
    global.fetch = origFetch;
  }
});

test('V5.0 Batch 6: TravelArchive defaults to private showcase & persists travel journals', async () => {
  const priv = await TravelArchive.getPrivacySettings();
  assert.equal(priv.publicProfile, false);
  await TravelArchive.setPublicProfile(true);
  assert.equal((await TravelArchive.getPrivacySettings()).publicProfile, true);
  await TravelArchive.setPublicProfile(false);

  const saved = await TravelArchive.saveJournalEntry({
    title: 'Kyoto Kiyomizu Sunrise',
    date: '2026-04-03',
    mood: 'inspired',
    rating: 5,
    note: 'Clear eastern ridge light at 06:00'
  });
  const list = await TravelArchive.getJournals();
  assert.ok(list.some((x) => x.id === saved.id && x.rating === 5));
  await TravelArchive.deleteJournalEntry(saved.id);
  assert.equal((await TravelArchive.getJournals()).some((x) => x.id === saved.id), false);

  const idxHtml = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
  assert.ok(idxHtml.includes('id="layer-meta-inspector"'));
});
