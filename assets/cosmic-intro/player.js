'use strict';

(() => {

  const intro = document.querySelector('#cosmic-intro');
  const video = document.querySelector('#cosmic-film');
  const loadingText = document.querySelector('#cosmic-loading-text');
  const progress = document.querySelector('#cosmic-progress');
  const playBtn = document.querySelector('#cosmic-play');
  const mute = document.querySelector('#cosmic-mute');
  const unmuteHint = document.querySelector('#cosmic-unmute-hint');
  const skip = document.querySelector('#cosmic-skip');
  const replay = document.querySelector('#cosmic-replay');
  const credits = document.querySelector('#cosmic-credits');
  const options = replay ? replay.closest('.cosmic-options') : null;
  const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
  const supportedVideo = [
    ['assets/cosmic-intro/cosmic-slow-tour.mp4?v=6', 'video/mp4; codecs="avc1.640028"']
  ].filter(([, type]) => video.canPlayType(type) || video.canPlayType('video/mp4')).map(([url]) => url);

  let playback = null;
  let mapReveal = null;
  let restorePending = null;
  let motionTimer;
  let introStatus = 'map';

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
        || document.getElementById('mode-map-btn')?.getAttribute('aria-selected') !== 'true') return false;
    return true;
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
    'zh': ['宇宙开场', '重播宇宙开场', '影像来源', '跳过', '播放进度', '播放', '暂停', '静音', '取消静音', '🔊 点击开启配乐', '正在进入宇宙视界…'],
    'zh-tw': ['宇宙開場', '重播宇宙開場', '影像來源', '略過', '播放進度', '播放', '暫停', '靜音', '取消靜音', '🔊 點擊開啟配樂', '正在進入宇宙視界…'],
    en: ['Opening film', 'Replay opening film', 'Film credits', 'Skip', 'Playback position', 'Play', 'Pause', 'Mute', 'Unmute', '🔊 Click to enable music', 'Entering cosmic view…'],
    ja: ['オープニング映像', 'オープニングを再生', '映像クレジット', 'スキップ', '再生位置', '再生', '一時停止', 'ミュート', 'ミュート解除', '🔊 クリックで音楽オン', '宇宙ビューを起動中…'],
    ko: ['오프닝 영상', '오프닝 다시 보기', '영상 출처', '건너뛰기', '재생 위치', '재생', '일시 정지', '음소거', '음소거 해제', '🔊 클릭하여 음악 켜기', '우주 뷰 여는 중…'],
    fr: ['Film d’ouverture', 'Revoir le film', 'Crédits du film', 'Passer', 'Position de lecture', 'Lire', 'Pause', 'Muet', 'Activer la musique', '🔊 Cliquer pour la musique', 'Entrée en vue cosmique…'],
    de: ['Eröffnungsfilm', 'Eröffnungsfilm erneut ansehen', 'Bildnachweise', 'Überspringen', 'Wiedergabeposition', 'Abspielen', 'Pause', 'Stumm', 'Ton an', '🔊 Klicken für Musik', 'Kosmische Ansicht wird geladen…'],
    es: ['Vídeo de apertura', 'Repetir la apertura', 'Créditos del vídeo', 'Omitir', 'Posición de reproducción', 'Reproducir', 'Pausa', 'Silenciar', 'Activar música', '🔊 Haz clic para la música', 'Entrando en vista cósmica…'],
    ru: ['Вступительный ролик', 'Повторить вступление', 'Источники видео', 'Пропустить', 'Позиция воспроизведения', 'Воспроизвести', 'Пауза', 'Без звука', 'Включить музыку', '🔊 Нажмите для музыки', 'Запуск космического обзора…']
  };
  let labels = strings.en;
  function localize() {
    const locale = (document.documentElement.lang || 'en').toLowerCase();
    labels = strings[locale] || strings[locale.split('-')[0]] || strings.en;
    const [title, replayLabel, creditLabel, skipLabel, progressLabel] = labels;
    intro.setAttribute('aria-label', title);
    if (replay) replay.textContent = replayLabel;
    if (credits) credits.textContent = creditLabel;
    skip.querySelector('span').textContent = skipLabel;
    progress.setAttribute('aria-label', progressLabel);
    if (unmuteHint) unmuteHint.textContent = labels[9];
    if (loadingText) loadingText.textContent = labels[10];
    playButton();
    muteButton();
  }

  function playButton() {
    const paused = video.paused;
    playBtn.textContent = paused ? '▶' : 'Ⅱ';
    playBtn.setAttribute('aria-label', paused ? labels[5] : labels[6]);
  }

  function muteButton() {
    if (!mute) return;
    const bgm = window.CosmicBGM;
    const isMuted = bgm ? (bgm.isMuted() || bgm.isBlocked()) : true;
    mute.textContent = isMuted ? '🔇' : '🔊';
    mute.setAttribute('aria-label', isMuted ? labels[8] : labels[7]);
    if (unmuteHint) {
      unmuteHint.hidden = !(playback && !playback.finishing && bgm && bgm.isBlocked() && !bgm.isMuted());
    }
  }

  if (window.CosmicBGM) {
    window.CosmicBGM.onChange(() => muteButton());
  }

  function cancelFrame(run) {
    if (!run.frameId) return;
    if (video.cancelVideoFrameCallback) video.cancelVideoFrameCallback(run.frameId);
    else cancelAnimationFrame(run.frameId);
    run.frameId = 0;
  }

  function lockBackground(run) {
    if (playback !== run || run.finishing) return;
    Array.from(document.body.children).forEach(node => {
      if (node !== intro && node.id !== 'story-prologue' && node.tagName !== 'SCRIPT' && !node.inert) {
        node.inert = true;
        run.inertNodes.add(node);
      }
    });
  }

  function revealIntro(run) {
    if (run.activated) return;
    run.activated = true;
    intro.inert = false;
    document.body.classList.add('intro-active');
    lockBackground(run);
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', () => lockBackground(run), { once: true, signal: run.events.signal });
    }
    skip.focus({ preventScroll: true });
  }

  function preload() {
    if (!supportedVideo.length || playback) return;
    if (!video.getAttribute('src')) {
      video.muted = true;
      video.volume = 0;
      video.preload = 'auto';
      video.src = supportedVideo[0];
    }
  }

  function finish(run, reason) {
    if (playback !== run || run.finishing) return;
    run.finishing = true;
    clearTimeout(run.startupTimer);
    clearTimeout(run.stallTimer);
    cancelFrame(run);
    run.events.abort();

    const map = currentMap();
    const matched = reason === 'complete' && !reducedMotion.matches && canMatch(map);
    if (matched) prepareMap(map);

    const landing = !location.search && !location.hash;
    const willChainTour = Boolean(run.chainTour) && landing && Boolean(window.OnboardingTour);

    if (window.CosmicBGM) {
      if (willChainTour) {
        window.CosmicBGM.duck(0.36, 700);
      } else {
        window.CosmicBGM.fadeOutAndStop(1600);
      }
    }

    publish(matched ? 'handoff' : 'map', reason);

    const hadFocus = intro.contains(document.activeElement);
    const release = () => {
      if (playback !== run) return;
      video.pause();
      video.removeAttribute('src');
      video.load();
      video.classList.remove('has-frame');
      intro.hidden = true;
      if (unmuteHint) unmuteHint.hidden = true;
      run.inertNodes.forEach(node => { node.inert = false; });
      run.inertNodes.clear();
      publish('map', reason);
      intro.classList.remove('is-exiting', 'is-exiting-fast', 'is-playing');
      document.documentElement.classList.remove('cosmic-intro-boot', 'prologue-boot');
      intro.inert = false;
      document.body.classList.remove('intro-active');
      playback = null;
      revealMap();
      try { map?.resize?.(); } catch {}

      if (willChainTour && window.OnboardingTour) {
        window.OnboardingTour.start(false);
      } else if (hadFocus) {
        (run.returnFocus || document.querySelector('#open-palette-btn'))?.focus({ preventScroll: true });
      }
    };

    if (matched || !reducedMotion.matches) {
      intro.classList.add(matched ? 'is-exiting' : 'is-exiting-fast');
      if (unmuteHint) unmuteHint.hidden = true;
      setTimeout(release, matched ? 520 : 380);
    } else {
      release();
    }
  }

  function play(opts = {}) {
    if (playback || !supportedVideo.length) return false;
    restorePending?.();
    clearTimeout(motionTimer);
    document.documentElement.classList.remove('cosmic-motion', 'cosmic-intro-boot');

    const isReplay = Boolean(opts.isReplay);
    const run = {
      isReplay,
      chainTour: Boolean(opts.chainTour) && !isReplay,
      returnFocus: isReplay ? document.activeElement : null,
      inertNodes: new Set(),
      events: new AbortController(),
      frameId: 0,
      started: performance.now(),
      played: false,
      index: 0,
      attempt: 0
    };
    playback = run;
    intro.hidden = false;
    intro.classList.remove('is-playing', 'is-exiting', 'is-exiting-fast');
    revealIntro(run);
    progress.value = 0;
    progress.disabled = true;
    playBtn.disabled = true;
    if (mute) mute.disabled = false;
    if (unmuteHint) unmuteHint.hidden = true;
    publish('loading');

    if (window.CosmicBGM) {
      if (!opts.keepBgm || !window.CosmicBGM.isActive()) {
        window.CosmicBGM.start(0.58);
      }
    }

    const on = (type, callback) => video.addEventListener(type, callback, { signal: run.events.signal });

    const tick = (_now, metadata) => {
      if (run.finishing || playback !== run) return;
      run.frameId = 0;
      const time = metadata?.mediaTime ?? video.currentTime;
      progress.value = Math.min(time, Number(progress.max));
      const handoffAt = Number.isFinite(video.duration) && video.duration > 1 ? video.duration - 0.45 : 26.15;
      if (time >= handoffAt && currentMap()?.areTilesLoaded()) {
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
      const currentAttr = video.getAttribute('src');
      if (currentAttr !== run.url || video.readyState === 0) {
        video.src = run.url;
      }
      // Mute raw clip audio permanently so unified CosmicBGM carries the entire soundtrack
      video.muted = true;
      video.volume = 0;
      muteButton();
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
        Math.min(4500, Math.max(0, 9000 - (performance.now() - run.started))));
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
      intro.classList.add('is-playing');
      video.classList.add('has-frame');
      playBtn.disabled = false;
      if (mute) mute.disabled = false;
      publish('playing');
      playButton();
      muteButton();
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

    run.startupTimer = setTimeout(() => finish(run, 'startup-timeout'), 9000);
    trySource();
    return true;
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
  if (replay) {
    replay.addEventListener('click', () => {
      const pop = document.getElementById('appearance-popover');
      if (pop) pop.classList.add('is-hidden');
      const apBtn = document.getElementById('appearance-btn');
      if (apBtn) apBtn.setAttribute('aria-expanded', 'false');
      play({ isReplay: true, keepBgm: false, chainTour: false });
    });
  }
  playBtn.addEventListener('click', () => {
    if (!playback || introStatus === 'handoff') return;
    if (video.paused) video.play().catch(() => playback && finish(playback, 'blocked'));
    else video.pause();
  });
  if (mute) {
    mute.addEventListener('click', () => {
      if (!playback || introStatus === 'handoff') return;
      if (window.CosmicBGM) window.CosmicBGM.toggleMute();
      muteButton();
    });
  }
  if (unmuteHint) {
    unmuteHint.addEventListener('click', () => {
      if (!playback || introStatus === 'handoff') return;
      if (window.CosmicBGM) window.CosmicBGM.unmute();
      muteButton();
    });
  }
  video.addEventListener('click', () => {
    if (playback && window.CosmicBGM && window.CosmicBGM.isBlocked()) {
      window.CosmicBGM.unmute();
      muteButton();
    }
  });
  progress.addEventListener('input', () => {
    if (playback && !playback.finishing && video.readyState > 0) {
      video.currentTime = Math.min(Number(progress.value), video.duration);
    }
  });
  reducedMotion.addEventListener('change', () => {
    if (reducedMotion.matches && playback) finish(playback, 'reduced-motion');
  });

  window.CosmicIntro = {
    play,
    preload,
    isSupported: () => supportedVideo.length > 0,
    isPlaying: () => Boolean(playback)
  };

  localize();
  new MutationObserver(localize).observe(document.documentElement, { attributes: true, attributeFilter: ['lang'] });
  if (options) options.hidden = !supportedVideo.length;

  // Unified boot: Prologue first (max 3 times per 6-hour rolling window across all devices)
  if (window.IntroSession && window.IntroSession.shouldAutoRun() && window.StoryPrologue) {
    window.IntroSession.recordPlay();
    preload();
    window.StoryPrologue.open({ isReplay: false, keepBgm: false });
  } else {
    document.documentElement.classList.remove('prologue-boot', 'cosmic-intro-boot');
    publish('map');
  }
})();
