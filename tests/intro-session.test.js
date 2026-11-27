'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

function createIntroSandbox() {
  const store = new Map();
  class MockAudio {
    constructor() {
      this.loop = false;
      this.preload = '';
      this.volume = 0;
      this.muted = false;
      this.paused = true;
      this.currentTime = 0;
    }
    play() { return Promise.resolve(); }
    pause() { this.paused = true; }
  }
  const sandbox = {
    Audio: MockAudio,
    performance: { now: () => 0 },
    document: {
      addEventListener() {},
      removeEventListener() {},
      documentElement: {}
    },
    localStorage: {
      getItem: (k) => (store.has(k) ? store.get(k) : null),
      setItem: (k, v) => { store.set(k, String(v)); },
      removeItem: (k) => { store.delete(k); }
    },
    location: { search: '', hash: '' },
    matchMedia: () => ({ matches: false }),
    setInterval,
    clearInterval
  };
  sandbox.window = sandbox;
  const src = fs.readFileSync(path.resolve(__dirname, '..', 'assets', 'prologue', 'bgm.js'), 'utf8');
  vm.runInNewContext(src, sandbox);
  return { sandbox, store };
}

test('IntroSession enforces 3 plays per 6-hour rolling window and auto-resets after 6 hours', () => {
  const { sandbox } = createIntroSandbox();
  const IntroSession = sandbox.IntroSession;
  const SIX_HOURS = 6 * 60 * 60 * 1000;
  const t0 = 1_700_000_000_000;

  // Visits 1..3 within 6 hours -> allowed
  for (let i = 0; i < 3; i++) {
    const now = t0 + i * 60_000;
    assert.equal(IntroSession.shouldAutoRun({ now }), true, `play #${i + 1} should auto-run`);
    const st = IntroSession.recordPlay(now);
    assert.equal(st.plays, i + 1);
  }

  // Visit 4 within 6 hours -> suppressed
  assert.equal(IntroSession.shouldAutoRun({ now: t0 + SIX_HOURS - 1000 }), false);
  assert.equal(IntroSession.getState(t0 + SIX_HOURS - 1000).plays, 3);

  // Mark tour seen within the same window
  IntroSession.markTourSeen(t0 + 180_000);
  assert.equal(IntroSession.hasSeenTour(t0 + SIX_HOURS - 1000), true);

  // Deep-link query/hash suppresses auto-run even when plays < 3
  assert.equal(IntroSession.shouldAutoRun({ now: t0 + SIX_HOURS + 1, landing: false }), false);

  // 6 hours + 1ms later -> automatically resets plays and tourSeen for a fresh 3-play window
  const tReset = t0 + SIX_HOURS + 1;
  const resetState = IntroSession.getState(tReset);
  assert.equal(resetState.plays, 0);
  assert.equal(resetState.tourSeen, false);
  assert.equal(IntroSession.hasSeenTour(tReset), false);
  assert.equal(IntroSession.shouldAutoRun({ now: tReset }), true);
});
