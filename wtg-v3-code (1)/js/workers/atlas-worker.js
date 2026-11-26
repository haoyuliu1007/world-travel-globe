'use strict';

importScripts('../vendor/fuse.min.js', '../vendor/supercluster.min.js');

let records = [];
let fuse = null;
let clusterIndex = null;
let geoFeatures = [];

function buildSearchRecords(items) {
  records = items.map((d) => ({
    id: d.id,
    name: d.name || '',
    shortName: d.shortName || '',
    country: d.country || '',
    province: d.province || '',
    region: d.region || '',
    subtitle: d.subtitle || '',
    continent: d.continent || '',
    priority: d.priority || 2,
    allWeather: Boolean(d.allWeather),
    coords: d.coords,
    monthScores: d.monthScores || [],
    badgesText: Array.isArray(d.badges) ? d.badges.join(' ') : '',
    spotsText: Array.isArray(d.spotNames) ? d.spotNames.join(' ') : '',
    spotNames: Array.isArray(d.spotNames) ? d.spotNames : []
  }));

  if (typeof Fuse !== 'undefined') {
    fuse = new Fuse(records, {
      includeScore: true,
      threshold: 0.34,
      ignoreLocation: true,
      minMatchCharLength: 2,
      keys: [
        { name: 'shortName', weight: 2.6 },
        { name: 'name', weight: 2.2 },
        { name: 'country', weight: 1.8 },
        { name: 'id', weight: 1.6 },
        { name: 'province', weight: 1.2 },
        { name: 'region', weight: 1.0 },
        { name: 'spotsText', weight: 1.1 },
        { name: 'subtitle', weight: 0.7 }
      ]
    });
  }

  geoFeatures = records
    .filter((r) => Array.isArray(r.coords) && r.coords.length >= 2)
    .map((r, idx) => ({
      type: 'Feature',
      id: idx + 1,
      geometry: { type: 'Point', coordinates: r.coords },
      properties: {
        id: r.id,
        label: r.shortName || r.name,
        allWeather: r.allWeather ? 1 : 0,
        priority: r.priority === 1 ? 1 : 2
      }
    }));

  if (typeof Supercluster !== 'undefined') {
    clusterIndex = new Supercluster({
      radius: 44,
      maxZoom: 6,
      minPoints: 3
    });
    clusterIndex.load(geoFeatures);
  }
}

function runSearch(query, limit) {
  const q = String(query || '').trim();
  const maxN = limit || 28;
  if (!q) {
    return records
      .filter((r) => r.priority === 1)
      .slice(0, 12)
      .map((r) => ({ id: r.id, score: 1, matchedSpotIdx: -1, matchedSpotName: '' }));
  }

  const qLower = q.toLowerCase();
  const exactHits = [];
  const seen = new Set();

  for (let i = 0; i < records.length; i++) {
    const r = records[i];
    const nameL = `${r.shortName} ${r.name}`.toLowerCase();
    const countryL = r.country.toLowerCase();
    const idL = r.id.toLowerCase();
    let score = 0;
    let matchedSpotIdx = -1;
    let matchedSpotName = '';

    if (r.shortName.toLowerCase() === qLower || r.name.toLowerCase() === qLower || idL === qLower) {
      score += 300;
    } else if (nameL.includes(qLower)) {
      score += 140;
    }
    if (countryL === qLower) score += 120;
    else if (countryL.includes(qLower)) score += 70;
    if (idL.includes(qLower)) score += 60;
    if ((r.province + ' ' + r.region).toLowerCase().includes(qLower)) score += 40;

    for (let j = 0; j < r.spotNames.length; j++) {
      if (String(r.spotNames[j] || '').toLowerCase().includes(qLower)) {
        score += 55;
        matchedSpotIdx = j;
        matchedSpotName = r.spotNames[j];
        break;
      }
    }

    if (score > 0) {
      if (r.priority === 1) score += 10;
      exactHits.push({ id: r.id, score, matchedSpotIdx, matchedSpotName });
      seen.add(r.id);
    }
  }

  exactHits.sort((a, b) => b.score - a.score);

  if (fuse && exactHits.length < maxN) {
    const fuzzy = fuse.search(q, { limit: maxN });
    for (const hit of fuzzy) {
      const r = hit.item;
      if (seen.has(r.id)) continue;
      seen.add(r.id);
      exactHits.push({
        id: r.id,
        score: Math.round((1 - (hit.score || 0.5)) * 50),
        matchedSpotIdx: -1,
        matchedSpotName: ''
      });
    }
  }

  return exactHits.slice(0, maxN);
}

function getClusters(bbox, zoom, matchedIds) {
  if (!clusterIndex) return [];
  const z = Math.max(0, Math.floor(zoom || 1));
  if (!matchedIds || !matchedIds.length || matchedIds.length === records.length) {
    return clusterIndex.getClusters(bbox || [-180, -85, 180, 85], z);
  }
  const set = new Set(matchedIds);
  const sub = new Supercluster({ radius: 44, maxZoom: 6, minPoints: 3 });
  sub.load(geoFeatures.filter((f) => set.has(f.properties.id)));
  return sub.getClusters(bbox || [-180, -85, 180, 85], z);
}

self.onmessage = function (e) {
  const msg = e.data || {};
  const { id, type, payload } = msg;
  try {
    if (type === 'INIT_INDEX') {
      buildSearchRecords(Array.isArray(payload) ? payload : []);
      self.postMessage({ id, ok: true, count: records.length });
    } else if (type === 'SEARCH') {
      const results = runSearch(payload && payload.query, payload && payload.limit);
      self.postMessage({ id, ok: true, results });
    } else if (type === 'CLUSTER') {
      const clusters = getClusters(payload && payload.bbox, payload && payload.zoom, payload && payload.matchedIds);
      self.postMessage({ id, ok: true, clusters });
    } else if (type === 'GET_EXPANSION_ZOOM') {
      const z = clusterIndex && payload && payload.clusterId !== undefined
        ? clusterIndex.getClusterExpansionZoom(payload.clusterId)
        : 5;
      self.postMessage({ id, ok: true, zoom: z });
    }
  } catch (err) {
    self.postMessage({ id, ok: false, error: String(err && err.message ? err.message : err) });
  }
};
