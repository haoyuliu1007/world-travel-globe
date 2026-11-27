'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const rootDir = path.resolve(__dirname, '..');
const distDir = path.join(rootDir, 'dist');

function createRadioSandbox() {
  const store = new Map();
  let bgmActive = true;
  let fadeCalls = 0;

  class MockAudio {
    constructor() {
      this.preload = '';
      this.loop = false;
      this.volume = 0;
      this.muted = false;
      this.paused = true;
      this.currentTime = 0;
      this.duration = 160;
      this._src = '';
      this._listeners = new Map();
    }
    set src(v) { this._src = String(v); }
    get src() { return this._src; }
    getAttribute(name) { return name === 'src' ? (this._src || null) : null; }
    addEventListener(type, fn) {
      if (!this._listeners.has(type)) this._listeners.set(type, []);
      this._listeners.get(type).push(fn);
    }
    load() {}
    play() { this.paused = false; return Promise.resolve(); }
    pause() { this.paused = true; }
  }

  const sandbox = {
    Audio: MockAudio,
    performance: { now: () => Date.now() },
    setInterval,
    clearInterval,
    document: {
      getElementById: () => null
    },
    localStorage: {
      getItem: (k) => (store.has(k) ? store.get(k) : null),
      setItem: (k, v) => { store.set(k, String(v)); },
      removeItem: (k) => { store.delete(k); }
    },
    CosmicBGM: {
      isActive: () => bgmActive,
      fadeOutAndStop: () => { fadeCalls++; bgmActive = false; }
    }
  };
  sandbox.window = sandbox;

  const src = fs.readFileSync(path.join(rootDir, 'js', 'modules', 'ambient-radio.js'), 'utf8');
  vm.runInNewContext(src, sandbox);
  return { sandbox, store, getFadeCalls: () => fadeCalls };
}

test('AmbientRadio catalog has 16 unique tracks and all MP3 files exist in assets/ and dist/assets/', () => {
  const { sandbox } = createRadioSandbox();
  const tracks = sandbox.AmbientRadio.getTracks();
  assert.equal(tracks.length, 16);

  const ids = new Set(tracks.map((t) => t.id));
  assert.equal(ids.size, 16, 'Track IDs must be unique');

  for (const tr of tracks) {
    const rel = tr.src.split('?')[0];
    const srcPath = path.join(rootDir, rel);
    const distPath = path.join(distDir, rel);
    assert.ok(fs.existsSync(srcPath), `Missing source track: ${rel}`);
    assert.ok(fs.existsSync(distPath), `Missing dist track: ${rel}`);
    assert.ok(fs.statSync(distPath).size > 100_000, `Track file looks empty: ${rel}`);
  }
});

test('AmbientRadio lazy-loads audio, persists prefs, cycles modes, and stops CosmicBGM on play', () => {
  const { sandbox, store, getFadeCalls } = createRadioSandbox();
  const Radio = sandbox.AmbientRadio;

  Radio.init();
  const initState = Radio.getState();
  assert.equal(initState.isPlaying, false);
  assert.equal(initState.srcLoaded, false, 'Must NOT load audio src during init()');

  Radio.play();
  assert.equal(Radio.getState().isPlaying, true);
  assert.equal(Radio.getState().srcLoaded, true);
  assert.equal(getFadeCalls(), 1, 'Playing AmbientRadio must stop active CosmicBGM');

  Radio.next(true);
  assert.equal(Radio.getState().trackId, 'orbital-horizon');

  Radio.prev(true);
  assert.equal(Radio.getState().trackId, 'the-blue-horizon');

  Radio.cycleMode();
  assert.equal(Radio.getState().mode, 'one');
  Radio.cycleMode();
  assert.equal(Radio.getState().mode, 'shuffle');
  Radio.cycleMode();
  assert.equal(Radio.getState().mode, 'seq');

  Radio.setVolume(0.45);
  assert.equal(Radio.getState().volume, 0.45);

  const saved = JSON.parse(store.get('wtg_radio_prefs_v1'));
  assert.equal(saved.trackId, 'the-blue-horizon');
  assert.equal(saved.volume, 0.45);
  assert.equal(saved.mode, 'seq');

  Radio.pause(true);
});
