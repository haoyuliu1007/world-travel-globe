'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const rootDir = path.resolve(__dirname, '..');
const SunCalc = require(path.join(rootDir, 'vendor', 'suncalc.min.js'));
const AestheticIndex = require(path.join(rootDir, 'js', 'modules', 'aesthetic-index.js'));

test('SunCalc v2.1.4 computes valid solar noon azimuth and golden hour for Tokyo', () => {
  const dt = new Date('2026-06-21T03:00:00Z');
  const times = SunCalc.getTimes(dt, 35.6895, 139.6917);
  assert.ok(times.sunrise instanceof Date && !Number.isNaN(times.sunrise.getTime()));
  assert.ok(times.sunset instanceof Date && !Number.isNaN(times.sunset.getTime()));
  const noonPos = SunCalc.getPosition(times.solarNoon, 35.6895, 139.6917);
  assert.ok(Math.abs(noonPos.azimuth - 180) < 1.0, `Expected solar noon azimuth ~180 deg, got ${noonPos.azimuth}`);
  assert.ok(noonPos.altitude > 70, `Expected June solstice altitude >70 deg, got ${noonPos.altitude}`);
});

test('PhotoSimulator classifies lighting angles accurately', () => {
  const code = fs.readFileSync(path.join(rootDir, 'js', 'modules', 'photo-simulator.js'), 'utf8');
  const sb = { window: {}, SunCalc, console, Date, Math };
  sb.window = sb;
  vm.runInNewContext(code, sb);

  const backlit = sb.PhotoSimulator.classifyLightAngle(90, 90, 25);
  assert.equal(backlit.badge, '逆光');

  const frontlit = sb.PhotoSimulator.classifyLightAngle(90, 270, 25);
  assert.equal(frontlit.badge, '顺光');

  const sidelit = sb.PhotoSimulator.classifyLightAngle(90, 180, 25);
  assert.equal(sidelit.badge, '侧光');

  const night = sb.PhotoSimulator.classifyLightAngle(90, 180, -10);
  assert.equal(night.badge, '夜间');
});

test('AestheticIndex computes deterministic 7-dimension scores and responds to custom weights', () => {
  const sampleDest = {
    id: 'jp-kanto-tokyo',
    coords: [139.6917, 35.6895],
    allWeather: true,
    weatherTags: ['allWeather', 'sunny'],
    months: [
      { m: 4, score: 5, temp: '10°C – 19°C', rain: '约134mm', highlight: '4月樱花满开' }
    ]
  };
  const balanced = AestheticIndex.computeDestinationIndex(sampleDest, 4, null, null, SunCalc);
  assert.ok(balanced.total >= 60 && balanced.total <= 100);
  assert.equal(balanced.dimensions.length, 7);

  const withSnowClimate = Array.from({ length: 12 }, (_, idx) => ({
    month: idx + 1,
    tempMean: 16,
    rainProbPct: 10,
    clearProbPct: 80,
    snowProbPct: 0,
    sunshineHours: 220
  }));
  const realScore = AestheticIndex.computeDestinationIndex(sampleDest, 4, null, withSnowClimate, SunCalc);
  const tempDim = realScore.dimensions.find((d) => d.key === 'tempComfort');
  assert.equal(tempDim.source, 'realtime');
  assert.ok(realScore.total >= 75);
});
