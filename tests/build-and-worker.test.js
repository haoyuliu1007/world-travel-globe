'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const rootDir = path.resolve(__dirname, '..');
const distDir = path.join(rootDir, 'dist');

test('dist/ build outputs exist and dist/index.html references consolidated local bundles', () => {
  assert.ok(fs.existsSync(path.join(distDir, 'index.html')));
  assert.ok(fs.existsSync(path.join(distDir, 'css', 'app.bundle.min.css')));
  assert.ok(fs.existsSync(path.join(distDir, 'vendor', 'libs.bundle.min.js')));
  assert.ok(fs.existsSync(path.join(distDir, 'js', 'app.bundle.min.js')));
  assert.ok(fs.existsSync(path.join(distDir, 'data', 'atlas-index.min.js')));
  assert.ok(fs.existsSync(path.join(distDir, 'data', 'audit-report.json')));
  assert.ok(fs.existsSync(path.join(distDir, 'manifest.webmanifest')));
  assert.ok(fs.existsSync(path.join(distDir, 'sw.js')));

  const swText = fs.readFileSync(path.join(distDir, 'sw.js'), 'utf8');
  assert.ok(!swText.includes('__BUILD_VER__'), 'dist/sw.js must stamp build version');
  assert.ok(swText.includes('app.bundle.min.js'), 'dist/sw.js must precache bundled JS');

  const indexHtml = fs.readFileSync(path.join(distDir, 'index.html'), 'utf8');
  const refs = [
    ...[...indexHtml.matchAll(/<script src="([^"?]+)(?:\?[^"]*)?"><\/script>/g)].map((m) => m[1]),
    ...[...indexHtml.matchAll(/<link rel="stylesheet" href="([^"?]+)(?:\?[^"]*)?"\s*\/>/g)].map((m) => m[1])
  ];
  assert.ok(refs.length >= 4 && refs.length <= 8, `Expected 4-8 consolidated asset refs, got ${refs.length}`);
  for (const rel of refs) {
    assert.ok(fs.existsSync(path.join(distDir, rel)), `Missing dist asset referenced by index.html: ${rel}`);
  }
});

test('Cloudflare Worker handles /api/health, CORS, input validation, and unconfigured D1/R2 501 gracefully', async () => {
  const workerMod = await import('../worker/index.js');
  const worker = workerMod.default;
  const mockEnv = {
    ASSETS: { fetch: async () => new Response('ok', { status: 200 }) }
  };

  const healthRes = await worker.fetch(new Request('https://example.com/api/health'), mockEnv);
  assert.equal(healthRes.status, 200);
  const healthJson = await healthRes.json();
  assert.equal(healthJson.ok, true);
  assert.equal(healthJson.features.tile, true);
  assert.equal(healthJson.features.img, true);
  assert.equal(healthJson.features.wikipedia, true);
  assert.equal(healthJson.features.d1, false);
  assert.equal(healthJson.features.r2, false);

  const optRes = await worker.fetch(new Request('https://example.com/api/health', { method: 'OPTIONS' }), mockEnv);
  assert.equal(optRes.status, 204);
  assert.equal(optRes.headers.get('Access-Control-Allow-Origin'), '*');

  const badImgRes = await worker.fetch(new Request('https://example.com/api/img?url=https://evil.com/a.png'), mockEnv);
  assert.equal(badImgRes.status, 400);

  const badTileRes = await worker.fetch(new Request('https://example.com/api/tile/badskin/2/1/3'), mockEnv);
  assert.equal(badTileRes.status, 400);

  const badWikiRes = await worker.fetch(new Request('https://example.com/api/wikipedia?lang=fr&action=query'), mockEnv);
  assert.equal(badWikiRes.status, 400);

  const d1Res = await worker.fetch(new Request('https://example.com/api/profile'), mockEnv);
  assert.equal(d1Res.status, 501);

  const r2Res = await worker.fetch(new Request('https://example.com/api/photos', { method: 'POST' }), mockEnv);
  assert.equal(r2Res.status, 501);
});
