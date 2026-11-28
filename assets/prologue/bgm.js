'use strict';

(function (global) {
  const AUDIO_SRC = 'assets/prologue/the-blue-horizon.mp3?v=1';
  const audio = new Audio(AUDIO_SRC);
  audio.loop = true;
  audio.preload = 'none';
  audio.volume = 0;

  let userMuted = false;
  let blocked = false;
  let active = false;
  let desiredVolume = 0.58;
  let rampTimer = 0;
  let gestureBound = false;
  const listeners = new Set();

  function notify() {
    listeners.forEach((fn) => {
      try { fn({ muted: isMuted(), blocked, active }); } catch {}
    });
  }

  function clearRamp() {
    if (rampTimer) {
      clearInterval(rampTimer);
      rampTimer = 0;
    }
  }

  function rampTo(target, durationMs, onDone) {
    clearRamp();
    const startVol = audio.volume;
    const ms = Math.max(16, durationMs || 600);
    const startAt = performance.now();
    rampTimer = setInterval(() => {
      const t = Math.min(1, (performance.now() - startAt) / ms);
      const eased = 1 - Math.pow(1 - t, 3);
      try { audio.volume = Math.max(0, Math.min(1, startVol + (target - startVol) * eased)); } catch {}
      if (t >= 1) {
        clearRamp();
        if (typeof onDone === 'function') onDone();
      }
    }, 24);
  }

  function unbindGesture() {
    if (!gestureBound) return;
    gestureBound = false;
    ['pointerdown', 'keydown', 'wheel', 'touchstart'].forEach((evt) => {
      document.removeEventListener(evt, onFirstGesture, true);
    });
  }

  function onFirstGesture() {
    if (!active || userMuted) {
      unbindGesture();
      return;
    }
    blocked = false;
    unbindGesture();
    audio.muted = false;
    audio.volume = 0;
    audio.play().then(() => {
      rampTo(desiredVolume, 750);
      notify();
    }).catch(() => {
      blocked = true;
      notify();
    });
  }

  function bindGesture() {
    if (gestureBound) return;
    gestureBound = true;
    ['pointerdown', 'keydown', 'wheel', 'touchstart'].forEach((evt) => {
      document.addEventListener(evt, onFirstGesture, { capture: true, passive: true });
    });
  }

  function start(targetVol = 0.58) {
    desiredVolume = targetVol;
    active = true;
    if (userMuted) {
      audio.muted = true;
      blocked = false;
      notify();
      return;
    }
    audio.muted = false;
    if (!audio.paused) {
      blocked = false;
      rampTo(desiredVolume, 650);
      notify();
      return;
    }
    audio.volume = 0;
    const p = audio.play();
    if (p && typeof p.then === 'function') {
      p.then(() => {
        blocked = false;
        unbindGesture();
        rampTo(desiredVolume, 900);
        notify();
      }).catch(() => {
        blocked = true;
        bindGesture();
        notify();
      });
    }
  }

  function duck(vol = 0.36, ms = 700) {
    if (!active) return;
    desiredVolume = vol;
    if (!userMuted && !audio.paused) {
      rampTo(vol, ms);
    }
  }

  function fadeOutAndStop(ms = 1600) {
    active = false;
    blocked = false;
    unbindGesture();
    if (audio.paused) {
      clearRamp();
      audio.volume = 0;
      try { audio.currentTime = 0; } catch {}
      notify();
      return;
    }
    rampTo(0, ms, () => {
      audio.pause();
      try { audio.currentTime = 0; } catch {}
      notify();
    });
  }

  function isMuted() {
    return userMuted || audio.muted;
  }

  function toggleMute() {
    userMuted = !isMuted();
    audio.muted = userMuted;
    if (!userMuted) {
      blocked = false;
      unbindGesture();
      active = true;
      if (audio.paused) {
        audio.volume = 0;
        audio.play().then(() => rampTo(desiredVolume, 550)).catch(() => {
          blocked = true;
          bindGesture();
          notify();
        });
      } else {
        rampTo(desiredVolume, 350);
      }
    }
    notify();
    return userMuted;
  }

  function unmute() {
    userMuted = false;
    blocked = false;
    unbindGesture();
    audio.muted = false;
    active = true;
    if (audio.paused) {
      audio.volume = 0;
      audio.play().then(() => rampTo(desiredVolume, 500)).catch(() => {});
    } else {
      rampTo(desiredVolume, 350);
    }
    notify();
  }

  function onChange(cb) {
    if (typeof cb === 'function') listeners.add(cb);
    return () => listeners.delete(cb);
  }

  global.CosmicBGM = {
    start,
    duck,
    fadeOutAndStop,
    toggleMute,
    unmute,
    isMuted,
    isBlocked: () => blocked,
    isActive: () => active,
    onChange
  };

  const WINDOW_KEY = 'wtg_intro_window_v1';
  const WINDOW_MS = 6 * 60 * 60 * 1000;
  const MAX_PLAYS = 3;

  function writeSessionState(state) {
    try {
      if (global.localStorage) {
        global.localStorage.setItem(WINDOW_KEY, JSON.stringify(state));
      }
    } catch {}
  }

  function readSessionState(now = Date.now()) {
    let parsed = null;
    try {
      const raw = global.localStorage ? global.localStorage.getItem(WINDOW_KEY) : null;
      if (raw) parsed = JSON.parse(raw);
    } catch {}
    if (!parsed || typeof parsed !== 'object' || !Number.isFinite(parsed.windowStart) || (now - parsed.windowStart) >= WINDOW_MS) {
      const fresh = { windowStart: now, plays: 0, tourSeen: false };
      writeSessionState(fresh);
      return fresh;
    }
    return {
      windowStart: parsed.windowStart,
      plays: Number(parsed.plays) || 0,
      tourSeen: Boolean(parsed.tourSeen)
    };
  }

  function getState(now = Date.now()) {
    return readSessionState(now);
  }

  function shouldAutoRun(opts = {}) {
    const landing = opts.landing !== undefined
      ? Boolean(opts.landing)
      : Boolean(!global.location || (!global.location.search && !global.location.hash));
    if (!landing) return false;

    const reduced = opts.reducedMotion !== undefined
      ? Boolean(opts.reducedMotion)
      : Boolean(typeof global.matchMedia === 'function' && global.matchMedia('(prefers-reduced-motion: reduce)').matches);
    if (reduced) return false;

    return getState(opts.now !== undefined ? opts.now : Date.now()).plays < MAX_PLAYS;
  }

  function recordPlay(now = Date.now()) {
    const state = readSessionState(now);
    const next = {
      windowStart: state.windowStart,
      plays: state.plays + 1,
      tourSeen: state.tourSeen
    };
    writeSessionState(next);
    return next;
  }

  function hasSeenTour(now = Date.now()) {
    return getState(now).tourSeen;
  }

  function markTourSeen(now = Date.now()) {
    const state = readSessionState(now);
    const next = {
      windowStart: state.windowStart,
      plays: state.plays,
      tourSeen: true
    };
    writeSessionState(next);
    return next;
  }

  function requestFullscreen() {
    try {
      const doc = global.document;
      if (!doc) return;
      if (doc.fullscreenElement || doc.webkitFullscreenElement) return;
      const el = doc.documentElement;
      if (!el) return;
      const fn = el.requestFullscreen || el.webkitRequestFullscreen;
      if (typeof fn === 'function') {
        const res = fn.call(el);
        if (res && typeof res.catch === 'function') res.catch(() => {});
      }
    } catch {}
  }

  global.IntroSession = {
    WINDOW_MS,
    MAX_PLAYS,
    getState,
    shouldAutoRun,
    recordPlay,
    hasSeenTour,
    markTourSeen,
    requestFullscreen
  };
})(window);
