'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const rootDir = path.resolve(__dirname, '..');

function loadAllDestinations() {
  const indexHtml = fs.readFileSync(path.join(rootDir, 'index.html'), 'utf8');
  const scripts = [...indexHtml.matchAll(/<script src="(data\/[^"?]+)(?:\?v=\d+)?"><\/script>/g)].map((m) => m[1]);
  const sb = { window: {}, console };
  sb.window = sb;
  for (const rel of scripts) {
    vm.runInNewContext(fs.readFileSync(path.join(rootDir, rel), 'utf8'), sb);
  }
  return { scripts, all: sb.TRAVEL_ATLAS.getAll() };
}

test('atlas dataset integrity: 722 cities, 5414 spots, 137 countries, valid coordinates', () => {
  const { scripts, all } = loadAllDestinations();
  assert.equal(scripts.length, 56);
  assert.equal(all.length, 722);

  const ids = new Set();
  const countries = new Set();
  let spotCount = 0;

  for (const d of all) {
    assert.ok(d.id && !ids.has(d.id), `Duplicate or empty id: ${d.id}`);
    ids.add(d.id);
    assert.ok(Array.isArray(d.coords) && d.coords.length >= 2, `Invalid city coords: ${d.id}`);
    assert.ok(Math.abs(d.coords[0]) <= 180 && Math.abs(d.coords[1]) <= 90, `Out of range city coords: ${d.id}`);
    assert.ok(Array.isArray(d.months) && d.months.length === 12, `Missing 12 months: ${d.id}`);

    String(d.country || '')
      .split('/')
      .map((s) => s.trim())
      .filter(Boolean)
      .forEach((c) => countries.add(c));

    for (const sp of d.spots || []) {
      spotCount++;
      assert.ok(Array.isArray(sp.coords) && sp.coords.length >= 2, `Invalid spot coords in ${d.id}`);
      assert.ok(Math.abs(sp.coords[0]) <= 180 && Math.abs(sp.coords[1]) <= 90, `Out of range spot coords in ${d.id}`);
    }
  }

  assert.equal(spotCount, 5414);
  assert.equal(countries.size, 137);
});

test('audit-report.json matches non-destructive audit schema', () => {
  const reportPath = path.join(rootDir, 'data', 'audit-report.json');
  assert.ok(fs.existsSync(reportPath), 'data/audit-report.json must exist');
  const rep = JSON.parse(fs.readFileSync(reportPath, 'utf8'));
  assert.equal(rep.nonDestructive, true);
  assert.equal(rep.summary.cities, 722);
  assert.equal(rep.summary.spots, 5414);
  assert.equal(rep.summary.countries, 137);
  assert.equal(rep.summary.duplicateCityIdsCount, 0);
  assert.equal(rep.summary.invalidCityCoordsCount, 0);
  assert.equal(rep.summary.invalidSpotCoordsCount, 0);
});
