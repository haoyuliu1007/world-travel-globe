'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ApiClient = require('../js/services/api-client.js');

const rootDir = path.resolve(__dirname, '..');
const distDir = path.join(rootDir, 'dist');

test('V4.5 ApiClient exposes 11-service health registry, supports Retry-After backoff & external AbortSignal', async () => {
  const initialHealth = ApiClient.getServiceHealth();
  assert.equal(initialHealth.length, 11, 'Expected 11 upstream services in health registry');
  for (const id of ['open-meteo', 'nasa-gibs', 'nasa-epic', 'noaa-swpc', 'mapterhorn', 'aws-terrarium', 'openfreemap', 'wikimedia', 'wikidata', 'panoramax', 'osrm']) {
    assert.ok(initialHealth.some((s) => s.id === id), `Missing service ${id}`);
  }

  const origFetch = global.fetch;
  let calls = 0;
  try {
    global.fetch = async (url) => {
      calls++;
      if (calls === 1) {
        return new Response('rate limited', { status: 429, headers: { 'Retry-After': '0' } });
      }
      return new Response(JSON.stringify({ ok: true, frames: [] }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    };
    const data = await ApiClient.fetchJson('https://epic.gsfc.nasa.gov/api/natural', {
      cacheKey: 'test:epic:retry',
      retries: 1,
      minIntervalMs: 1
    });
    assert.equal(calls, 2, 'Expected automatic retry after 429');
    assert.equal(data.ok, true);
    const epicHealth = ApiClient.getServiceHealth().find((s) => s.id === 'nasa-epic');
    assert.equal(epicHealth.status, 'ok');
    assert.equal(epicHealth.freshness, 'realtime');

    // External AbortController aborts immediately
    const ctrl = new AbortController();
    ctrl.abort();
    await assert.rejects(
      () => ApiClient.fetchJson('https://api.open-meteo.com/v1/forecast', {
        cacheKey: 'test:meteo:abort',
        signal: ctrl.signal,
        retries: 2
      }),
      /abort/i
    );
    const meteoHealth = ApiClient.getServiceHealth().find((s) => s.id === 'open-meteo');
    assert.equal(meteoHealth.status, 'unavailable');
  } finally {
    global.fetch = origFetch;
  }
});

test('V4.5 Worker serves frame-ancestors * CSP on HTML assets and exposes mediumUrl in /api/epic', async () => {
  const workerMod = await import('../worker/index.js');
  const worker = workerMod.default;
  const mockEnv = {
    ASSETS: {
      fetch: async () => new Response('<!doctype html><html></html>', {
        status: 200,
        headers: { 'Content-Type': 'text/html; charset=utf-8' }
      })
    }
  };

  const pageRes = await worker.fetch(new Request('https://example.com/?embed=jp-kanto-tokyo&chrome=off'), mockEnv);
  assert.equal(pageRes.status, 200);
  assert.equal(pageRes.headers.get('Content-Security-Policy'), 'frame-ancestors *');
  assert.equal(pageRes.headers.get('X-Content-Type-Options'), 'nosniff');

  const workerText = fs.readFileSync(path.join(rootDir, 'worker', 'index.js'), 'utf8');
  assert.ok(workerText.includes('/jpg/${imgName}.jpg'), 'Worker /api/epic must include 1080px jpg mediumUrl');
  assert.ok(workerText.includes('AbortSignal.timeout'), 'Worker upstream fetches must enforce AbortSignal.timeout');
});

test('V4.5 Build outputs unique 1200x630 raster PNG OG cards for destinations & wires og:image', () => {
  const sampleIds = ['jp-kanto-tokyo', 'np-bt-kathmandu-nagarkot', 'fr-paris-nw-paris'];
  for (const id of sampleIds) {
    const pngPath = path.join(distDir, 'og', `${id}.png`);
    const htmlPath = path.join(distDir, 'p', id, 'index.html');
    assert.ok(fs.existsSync(htmlPath), `Missing landing HTML for ${id}`);
    assert.ok(fs.existsSync(pngPath), `Missing PNG OG card for ${id}`);
    const buf = fs.readFileSync(pngPath);
    assert.deepEqual([...buf.subarray(0, 4)], [0x89, 0x50, 0x4e, 0x47], `${id}.png PNG magic mismatch`);
    assert.equal(buf.readUInt32BE(16), 1200, `${id}.png width must be 1200`);
    assert.equal(buf.readUInt32BE(20), 630, `${id}.png height must be 630`);

    const html = fs.readFileSync(htmlPath, 'utf8');
    assert.ok(html.includes(`/og/${encodeURIComponent(id)}.png`), `${id} HTML must reference per-destination .png in og:image`);
  }
});
