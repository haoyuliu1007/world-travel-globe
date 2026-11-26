'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const rootDir = path.resolve(__dirname, '..');
const outPath = path.join(rootDir, 'data', 'audit-report.json');

function haversineKm(a, b) {
  const r = Math.PI / 180;
  const dLat = (b[1] - a[1]) * r;
  const dLng = (b[0] - a[0]) * r;
  const s =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(a[1] * r) * Math.cos(b[1] * r) * Math.sin(dLng / 2) ** 2;
  return 6371 * 2 * Math.asin(Math.min(1, Math.sqrt(s)));
}

function isValidCoords(coords) {
  return (
    Array.isArray(coords) &&
    coords.length >= 2 &&
    Number.isFinite(Number(coords[0])) &&
    Number.isFinite(Number(coords[1])) &&
    Math.abs(Number(coords[0])) <= 180 &&
    Math.abs(Number(coords[1])) <= 90
  );
}

function countCountries(list) {
  const set = new Set();
  for (const d of list) {
    String(d.country || '')
      .split('/')
      .map((s) => s.trim())
      .filter(Boolean)
      .forEach((c) => set.add(c));
  }
  return set.size;
}

function main() {
  const indexHtml = fs.readFileSync(path.join(rootDir, 'index.html'), 'utf8');
  const scriptMatches = [...indexHtml.matchAll(/<script src="(data\/[^"?]+)(?:\?v=\d+)?"><\/script>/g)];
  const dataScripts = scriptMatches.map((m) => m[1]);

  const sandbox = { window: {}, console };
  sandbox.window = sandbox;
  for (const rel of dataScripts) {
    const src = fs.readFileSync(path.join(rootDir, rel), 'utf8');
    vm.runInNewContext(src, sandbox);
  }

  const all = sandbox.TRAVEL_ATLAS.getAll();
  const seenIds = new Set();
  const duplicateCityIds = [];
  const invalidCityCoords = [];
  const invalidSpotCoords = [];
  const missingMonths = [];
  const missingBudget = [];
  const missingItinerary = [];
  const missingWeather = [];
  const duplicateSpotsInCity = [];
  const distanceOutliers = [];
  const missingSpotFields = [];

  let totalSpots = 0;
  let spotsWithRefUrl = 0;
  const continentCounts = {};
  const monthScoreHist = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0, other: 0 };

  for (const dest of all) {
    if (seenIds.has(dest.id)) duplicateCityIds.push(dest.id);
    seenIds.add(dest.id);

    continentCounts[dest.continent] = (continentCounts[dest.continent] || 0) + 1;

    if (!isValidCoords(dest.coords)) {
      invalidCityCoords.push({ id: dest.id, name: dest.name, coords: dest.coords });
    }
    if (!Array.isArray(dest.months) || dest.months.length !== 12) {
      missingMonths.push({ id: dest.id, count: Array.isArray(dest.months) ? dest.months.length : 0 });
    } else {
      for (const m of dest.months) {
        const sc = Number(m && m.score);
        if (monthScoreHist[sc] !== undefined) monthScoreHist[sc]++;
        else monthScoreHist.other++;
      }
    }
    if (!dest.budget || !dest.budget.luxury || !dest.budget.comfort) {
      missingBudget.push(dest.id);
    }
    if (!Array.isArray(dest.itinerary) || !dest.itinerary.length) {
      missingItinerary.push(dest.id);
    }
    if (!dest.weather || typeof dest.weather !== 'object') {
      missingWeather.push(dest.id);
    }

    const spotNames = new Set();
    const spots = Array.isArray(dest.spots) ? dest.spots : [];
    for (let i = 0; i < spots.length; i++) {
      const sp = spots[i];
      totalSpots++;
      const sName = String(sp.name || '').trim();
      if (spotNames.has(sName)) {
        duplicateSpotsInCity.push({ cityId: dest.id, spotIndex: i, spotName: sName });
      }
      spotNames.add(sName);

      if (!isValidCoords(sp.coords)) {
        invalidSpotCoords.push({ cityId: dest.id, spotIndex: i, spotName: sName, coords: sp.coords });
      } else if (isValidCoords(dest.coords)) {
        const km = haversineKm(dest.coords, sp.coords);
        if (km > 250) {
          distanceOutliers.push({
            cityId: dest.id,
            cityName: dest.shortName || dest.name,
            country: dest.country,
            spotIndex: i,
            spotName: sName,
            distanceKm: Math.round(km),
            cityCoords: dest.coords,
            spotCoords: sp.coords,
            severity: km > 600 ? 'high' : 'info',
            reason: 'Spot >250km from parent city center (may be multi-site region or coordinate review item)'
          });
        }
      }

      const missing = [];
      if (!sp.elevation) missing.push('elevation');
      if (!sp.access) missing.push('access');
      if (!sp.bestTime) missing.push('bestTime');
      if (!sp.scene) missing.push('scene');
      if (!sp.tips) missing.push('tips');
      if (missing.length) {
        missingSpotFields.push({ cityId: dest.id, spotIndex: i, spotName: sName, missing });
      }
      if (/https?:\/\//i.test(`${sp.access || ''} ${sp.tips || ''}`)) {
        spotsWithRefUrl++;
      }
    }
  }

  distanceOutliers.sort((a, b) => b.distanceKm - a.distanceKm);

  const report = {
    generatedAt: new Date().toISOString(),
    schemaVersion: '1.0.0',
    nonDestructive: true,
    summary: {
      dataModules: dataScripts.length,
      continents: Object.keys(continentCounts).length,
      countries: countCountries(all),
      cities: all.length,
      spots: totalSpots,
      spotsWithRefUrl,
      continentCounts,
      monthScoreHist,
      duplicateCityIdsCount: duplicateCityIds.length,
      invalidCityCoordsCount: invalidCityCoords.length,
      invalidSpotCoordsCount: invalidSpotCoords.length,
      missingMonthsCount: missingMonths.length,
      missingBudgetCount: missingBudget.length,
      missingItineraryCount: missingItinerary.length,
      missingWeatherCount: missingWeather.length,
      duplicateSpotsInCityCount: duplicateSpotsInCity.length,
      distanceOutliersGT250kmCount: distanceOutliers.length,
      distanceOutliersGT600kmCount: distanceOutliers.filter((x) => x.distanceKm > 600).length,
      missingSpotFieldsCount: missingSpotFields.length
    },
    reviewQueue: {
      duplicateCityIds,
      invalidCityCoords,
      invalidSpotCoords,
      missingMonths,
      missingBudget,
      missingItinerary,
      missingWeather,
      duplicateSpotsInCity,
      missingSpotFields: missingSpotFields.slice(0, 100),
      distanceOutliers: distanceOutliers.slice(0, 260)
    }
  };

  fs.writeFileSync(outPath, JSON.stringify(report, null, 2), 'utf8');
  console.log('Audit report written:', outPath);
  console.log(JSON.stringify(report.summary, null, 2));
}

main();
