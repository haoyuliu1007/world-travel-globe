'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const rootDir = path.resolve(__dirname, '..');
const distDir = path.join(rootDir, 'dist');

test('dist/ build outputs exist and dist/index.html references only valid local files', () => {
  assert.ok(fs.existsSync(path.join(distDir, 'index.html')));
  assert.ok(fs.existsSync(path.join(distDir, 'data', 'atlas-index.min.js')));
  assert.ok(fs.existsSync(path.join(distDir, 'data', 'audit-report.json')));
  assert.ok(fs.existsSync(path.join(distDir, 'manifest.webmanifest')));
  assert.ok(fs.existsSync(path.join(distDir, 'sw.js')));

  const indexHtml = fs.readFileSync(path.join(distDir, 'index.html'), 'utf8');
  const refs = [
    ...[...indexHtml.matchAll(/<script src="([^"?]+)(?:\?[^"]*)?"><\/script>/g)].map((m) => m[1]),
    ...[...indexHtml.matchAll(/<link rel="stylesheet" href="([^"?]+)(?:\?[^"]*)?"\s*\/>/g)].map((m) => m[1])
  ];
  assert.ok(refs.length >= 15);
  for (const rel of refs) {
    assert.ok(fs.existsSync(path.join(distDir, rel)), `Missing dist asset referenced by index.html: ${rel}`);
  }
});

test('Cloudflare Worker handles /api/health, CORS OPTIONS, and unconfigured D1/R2 501 gracefully', async () => {
  const workerMod = await import('../worker/index.js');
  const worker = workerMod.default;
  const mockEnv = {
    ASSETS: { fetch: async () => new Response('ok', { status: 200 }) }
  };

  const healthRes = await worker.fetch(new Request('https://example.com/api/health'), mockEnv);
  assert.equal(healthRes.status, 200);
  const healthJson = await healthRes.json();
  assert.equal(healthJson.ok, true);
  assert.equal(healthJson.features.d1, false);
  assert.equal(healthJson.features.r2, false);

  const optRes = await worker.fetch(new Request('https://example.com/api/health', { method: 'OPTIONS' }), mockEnv);
  assert.equal(optRes.status, 204);
  assert.equal(optRes.headers.get('Access-Control-Allow-Origin'), '*');

  const d1Res = await worker.fetch(new Request('https://example.com/api/profile'), mockEnv);
  assert.equal(d1Res.status, 501);

  const r2Res = await worker.fetch(new Request('https://example.com/api/photos', { method: 'POST' }), mockEnv);
  assert.equal(r2Res.status, 501);
});
