'use strict';

(() => {

  const intro = document.querySelector('#cosmic-intro');
  const video = document.querySelector('#cosmic-film');
  const progress = document.querySelector('#cosmic-progress');
  const play = document.querySelector('#cosmic-play');
  const skip = document.querySelector('#cosmic-skip');
  const replay = document.querySelector('#cosmic-replay');
  const credits = document.querySelector('#cosmic-credits');
  const options = replay.closest('.cosmic-options');
  const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
  const scene = { center: [72, 22], zoom: 1.65, pitch: 14, bearing: 0 };
  const storageKey = 'wtg-cosmic-slow-tour-seen';
  const handoffTime = 23.80;
  const matchLandmarks = [
    [[76, 10], [979.034, 597.269]],
    [[40, -20], [827.802, 723.585]],
    [[100, 4], [1087.259, 620.277]]
  ];
  const supportedVideo = [
    ['assets/cosmic-intro/cosmic-slow-tour.webm', 'video/webm; codecs="vp9"'],
    ['assets/cosmic-intro/cosmic-slow-tour.mp4', 'video/mp4; codecs="avc1.640028"']
  ].filter(([, type]) => video.canPlayType(type)).map(([url]) => url);

  let playback = null;
  let mapReveal = null;
  let restorePending = null;
  let motionTimer;
  let introStatus = 'map';

  function seen() {
    try { return localStorage.getItem(storageKey) === '1'; } catch { return false; }
  }

  function markSeen() {
    try { localStorage.setItem(storageKey, '1'); } catch {}
  }

  function publish(status, reason = '') {
    introStatus = status;
    document.documentElement.dataset.introState = status;
    document.documentElement.dataset.introReason = reason;
  }

  function currentMap() {
    return window.getGlobeMap?.();
  }

  function canMatch(map) {
    if (!map?.isStyleLoaded() || !map.areTilesLoaded() || !map.getLayer('layer-satellite')
        || map.getLayoutProperty('layer-satellite', 'visibility') === 'none'
        || document.getElementById('mode-map-btn').getAttribute('aria-selected') !== 'true') return false;
    const pose = map.getCenter();
    return Math.abs(pose.lng - scene.center[0]) < .05 && Math.abs(pose.lat - scene.center[1]) < .05
      && Math.abs(map.getZoom() - scene.zoom) < .02 && Math.abs(map.getPitch() - scene.pitch) < .2
      && Math.abs(map.getBearing()) < .2 && matchesViewport(map);
  }

  function prepareMap(map) {
    const root = document.documentElement;
    root.classList.add('cosmic-stage', 'cosmic-motion');
    const layers = map.getStyle().layers
      .filter(({ id, layout }) => id.startsWith('atlas-') && layout?.visibility !== 'none')
      .map(({ id, layout }) => [id, layout?.visibility || 'visible']);
    layers.forEach(([id]) => map.setLayoutProperty(id, 'visibility', 'none'));
    mapReveal = { map, root, layers };
  }

  function revealMap() {
    if (!mapReveal) return;
    const { map, root, layers } = mapReveal;
    mapReveal = null;
    root.classList.add('cosmic-tools');
    const restore = () => {
      clearTimeout(timer);
      restorePending = null;
      layers.forEach(([id, visibility]) => {
        if (map.getLayer(id)) map.setLayoutProperty(id, 'visibility', visibility);
      });
      root.classList.remove('cosmic-stage', 'cosmic-tools');
      motionTimer = setTimeout(() => root.classList.remove('cosmic-motion'), 245);
    };
    const timer = setTimeout(restore, 245);
    restorePending = restore;
  }

  const strings = {
    'zh': ['宇宙开场', '重播宇宙开场', '影像来源', '跳过', '播放进度', '播放', '暂停'],
    'zh-tw': ['宇宙開場', '重播宇宙開場', '影像來源', '略過', '播放進度', '播放', '暫停'],
    en: ['Opening film', 'Replay opening film', 'Film credits', 'Skip', 'Playback position', 'Play', 'Pause'],
    ja: ['オープニング映像', 'オープニングを再生', '映像クレジット', 'スキップ', '再生位置', '再生', '一時停止'],
    ko: ['오프닝 영상', '오프닝 다시 보기', '영상 출처', '건너뛰기', '재생 위치', '재생', '일시 정지'],
    fr: ['Film d’ouverture', 'Revoir le film', 'Crédits du film', 'Passer', 'Position de lecture', 'Lire', 'Pause'],
    de: ['Eröffnungsfilm', 'Eröffnungsfilm erneut ansehen', 'Bildnachweise', 'Überspringen', 'Wiedergabeposition', 'Abspielen', 'Pause'],
    es: ['Vídeo de apertura', 'Repetir la apertura', 'Créditos del vídeo', 'Omitir', 'Posición de reproducción', 'Reproducir', 'Pausa'],
    ru: ['Вступительный ролик', 'Повторить вступление', 'Источники видео', 'Пропустить', 'Позиция воспроизведения', 'Воспроизвести', 'Пауза']
  };
  let labels = strings.en;
  function localize() {
    const locale = (document.documentElement.lang || 'en').toLowerCase();
    labels = strings[locale] || strings[locale.split('-')[0]] || strings.en;
    const [title, replayLabel, creditLabel, skipLabel, progressLabel] = labels;
    intro.setAttribute('aria-label', title);
    replay.textContent = replayLabel;
    credits.textContent = creditLabel;
    skip.querySelector('span').textContent = skipLabel;
    progress.setAttribute('aria-label', progressLabel);
    playButton();
  }

  function playButton() {
    const paused = video.paused;
    play.textContent = paused ? '▶' : 'Ⅱ';
    play.setAttribute('aria-label', paused ? labels[5] : labels[6]);
  }

  function cancelFrame(run) {
    if (!run.frameId) return;
    if (video.cancelVideoFrameCallback) video.cancelVideoFrameCallback(run.frameId);
    else cancelAnimationFrame(run.frameId);
    run.frameId = 0;
  }

  function matchesViewport(map) {
    const scale = Math.max(innerWidth / 1920, innerHeight / 1080);
    return matchLandmarks.every(([coordinates, reference]) => {
      const point = map.project(coordinates);
      const x = innerWidth / 2 + (reference[0] - 960) * scale;
      const y = innerHeight / 2 + (reference[1] - 540) * scale;
      return Math.hypot(point.x - x, point.y - y) <= 4;
    });
  }

  function finish(run, reason) {
    if (playback !== run || run.finishing) return;
    run.finishing = true;
    clearTimeout(run.startupTimer);
    clearTimeout(run.stallTimer);
    cancelFrame(run);
    run.events.abort();
    markSeen();
    const map = currentMap();
    const matched = reason === 'complete' && !reducedMotion.matches && canMatch(map);
    if (matched) prepareMap(map);
    publish(matched ? 'handoff' : 'map', reason);
    const hadFocus = intro.contains(document.activeElement);
    const release = () => {
      if (playback !== run) return;
      video.pause();
      video.removeAttribute('src');
      video.load();
      video.classList.remove('has-frame');
      intro.hidden = true;
      run.inertNodes.forEach(node => { node.inert = false; });
      intro.classList.remove('is-exiting');
      document.body.classList.remove('intro-active');
      publish('map', reason);
      playback = null;
      revealMap();
      if (hadFocus) (run.returnFocus || document.querySelector('#open-palette-btn'))?.focus({ preventScroll: true });
    };
    if (matched) {
      intro.classList.add('is-exiting');
      setTimeout(release, 170);
    } else release();
  }

  function start(isReplay) {
    if (playback || !supportedVideo.length) return;
    restorePending?.();
    clearTimeout(motionTimer);
    document.documentElement.classList.remove('cosmic-motion');
    const run = {
      returnFocus: isReplay ? document.activeElement : null,
      inertNodes: Array.from(document.body.children)
        .filter(node => node !== intro && node.tagName !== 'SCRIPT' && !node.inert),
      events: new AbortController(),
      frameId: 0,
      started: performance.now(),
      played: false,
      index: 0,
      attempt: 0
    };
    playback = run;
    intro.hidden = false;
    document.body.classList.add('intro-active');
    run.inertNodes.forEach(node => { node.inert = true; });
    progress.value = 0;
    progress.disabled = true;
    play.disabled = true;
    publish('loading');
    skip.focus({ preventScroll: true });
    const on = (type, callback) => video.addEventListener(type, callback, { signal: run.events.signal });

    const tick = (_now, metadata) => {
      if (run.finishing || playback !== run) return;
      run.frameId = 0;
      const time = metadata?.mediaTime ?? video.currentTime;
      progress.value = Math.min(time, Number(progress.max));
      if (time >= handoffTime && currentMap()?.areTilesLoaded()) {
        finish(run, 'complete');
      } else if (!video.paused) scheduleFrame();
    };
    const scheduleFrame = () => {
      if (run.frameId || run.finishing) return;
      run.frameId = video.requestVideoFrameCallback
        ? video.requestVideoFrameCallback(tick)
        : requestAnimationFrame(tick);
    };

    const trySource = () => {
      const attempt = ++run.attempt;
      run.url = supportedVideo[run.index];
      video.src = run.url;
      video.play().catch(error => {
        if (playback === run && !run.finishing && attempt === run.attempt && error.name === 'NotAllowedError') {
          finish(run, 'blocked');
        }
      });
    };
    on('error', () => {
      if (++run.index >= supportedVideo.length || run.played) {
        finish(run, 'video-error');
        return;
      }
      clearTimeout(run.startupTimer);
      run.startupTimer = setTimeout(() => finish(run, 'startup-timeout'),
        Math.min(1050, Math.max(0, 2350 - (performance.now() - run.started))));
      trySource();
    });
    on('loadedmetadata', () => {
      if (Number.isFinite(video.duration)) progress.max = video.duration;
      progress.disabled = false;
    });
    on('playing', () => {
      clearTimeout(run.startupTimer);
      clearTimeout(run.stallTimer);
      run.played = true;
      video.classList.add('has-frame');
      play.disabled = false;
      publish('playing');
      playButton();
      scheduleFrame();
    });
    on('waiting', () => {
      if (!run.played || video.paused || video.seeking) return;
      clearTimeout(run.stallTimer);
      run.stallTimer = setTimeout(() => finish(run, 'stalled'), 1750);
    });
    on('pause', () => {
      clearTimeout(run.stallTimer);
      playButton();
      cancelFrame(run);
    });
    on('seeked', () => {
      if (!video.paused) scheduleFrame();
    });
    on('ended', () => finish(run, 'complete'));

    run.startupTimer = setTimeout(() => finish(run, 'startup-timeout'), isReplay ? 2000 : 1500);
    trySource();
  }

  document.addEventListener('keydown', event => {
    if (!playback) return;
    event.stopPropagation();
    if (event.key === 'Escape') {
      event.preventDefault();
      finish(playback, 'escape');
    }
  });
  skip.addEventListener('click', () => playback && finish(playback, 'skip'));
  replay.addEventListener('click', () => start(true));
  play.addEventListener('click', () => {
    if (!playback || introStatus === 'handoff') return;
    if (video.paused) video.play().catch(() => playback && finish(playback, 'blocked'));
    else video.pause();
  });
  progress.addEventListener('input', () => {
    if (playback && !playback.finishing && video.readyState > 0) {
      video.currentTime = Math.min(Number(progress.value), video.duration);
    }
  });
  reducedMotion.addEventListener('change', () => {
    if (reducedMotion.matches && playback) finish(playback, 'reduced-motion');
  });

  const desktop = matchMedia('(min-width: 800px) and (pointer: fine)');
  const landing = !location.search && !location.hash;
  localize();
  new MutationObserver(localize).observe(document.documentElement, { attributes: true, attributeFilter: ['lang'] });
  options.hidden = !supportedVideo.length;
  publish('map');
  if (landing && desktop.matches && !seen() && !reducedMotion.matches) start(false);
})();
