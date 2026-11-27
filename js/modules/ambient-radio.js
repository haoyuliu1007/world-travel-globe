(function (global) {
  'use strict';

  const PREFS_KEY = 'wtg_radio_prefs_v1';
  const DEFAULT_VOLUME = 0.32;

  const TRACKS = [
    {
      id: 'the-blue-horizon',
      num: '00',
      cat: 'cosmic',
      src: 'assets/prologue/the-blue-horizon.mp3?v=1',
      title: { 'zh-CN': '蓝调地平线', 'zh-TW': '藍調地平線', en: 'The Blue Horizon' },
      genre: { 'zh-CN': '序章主题 · 星际原声', 'zh-TW': '序章主題 · 星際原聲', en: 'Opening Theme · Cosmic' }
    },
    {
      id: 'orbital-horizon',
      num: '01',
      cat: 'cosmic',
      src: 'assets/bgm/01-orbital-horizon.mp3',
      title: { 'zh-CN': '苍穹巡航', 'zh-TW': '蒼穹巡航', en: 'Orbital Horizon' },
      genre: { 'zh-CN': '星际氛围 · Space Ambient', 'zh-TW': '星際氛圍 · Space Ambient', en: 'Space Ambient' }
    },
    {
      id: 'terminator-dawn',
      num: '02',
      cat: 'cosmic',
      src: 'assets/bgm/02-terminator-dawn.mp3',
      title: { 'zh-CN': '晨昏线微光', 'zh-TW': '晨昏線微光', en: 'Terminator Dawn' },
      genre: { 'zh-CN': '新古典钢琴 · Neo-Classical', 'zh-TW': '新古典鋼琴 · Neo-Classical', en: 'Neo-Classical Felt Piano' }
    },
    {
      id: 'milky-way-drift',
      num: '03',
      cat: 'cosmic',
      src: 'assets/bgm/03-milky-way-drift.mp3',
      title: { 'zh-CN': '星海漫游', 'zh-TW': '星海漫遊', en: 'Milky Way Drift' },
      genre: { 'zh-CN': '空灵宇宙 · Ethereal Cosmic', 'zh-TW': '空靈宇宙 · Ethereal Cosmic', en: 'Ethereal Cosmic' }
    },
    {
      id: 'misty-jiangnan',
      num: '04',
      cat: 'oriental',
      src: 'assets/bgm/04-misty-jiangnan.mp3',
      title: { 'zh-CN': '烟雨江南', 'zh-TW': '煙雨江南', en: 'Misty Jiangnan' },
      genre: { 'zh-CN': '东方雅韵 · East Asian', 'zh-TW': '東方雅韻 · East Asian', en: 'Modern East Asian' }
    },
    {
      id: 'kyoto-autumn',
      num: '05',
      cat: 'oriental',
      src: 'assets/bgm/05-kyoto-autumn.mp3',
      title: { 'zh-CN': '岚山秋叶', 'zh-TW': '嵐山秋葉', en: 'Kyoto Autumn' },
      genre: { 'zh-CN': '日式治愈 · Japanese Healing', 'zh-TW': '日式治癒 · Japanese Healing', en: 'Japanese Healing' }
    },
    {
      id: 'alpine-snowline',
      num: '06',
      cat: 'oriental',
      src: 'assets/bgm/06-alpine-snowline.mp3',
      title: { 'zh-CN': '雪线微风', 'zh-TW': '雪線微風', en: 'Alpine Snowline' },
      genre: { 'zh-CN': '高山室内乐 · Chamber', 'zh-TW': '高山室內樂 · Chamber', en: 'Alpine Chamber' }
    },
    {
      id: 'aegean-sunlight',
      num: '07',
      cat: 'coastal',
      src: 'assets/bgm/07-aegean-sunlight.mp3',
      title: { 'zh-CN': '爱琴海午后', 'zh-TW': '愛琴海午後', en: 'Aegean Sunlight' },
      genre: { 'zh-CN': '地中海吉他 · Acoustic', 'zh-TW': '地中海吉他 · Acoustic', en: 'Mediterranean Acoustic' }
    },
    {
      id: 'pacific-breeze',
      num: '08',
      cat: 'coastal',
      src: 'assets/bgm/08-pacific-breeze.mp3',
      title: { 'zh-CN': '太平洋季风', 'zh-TW': '太平洋季風', en: 'Pacific Breeze' },
      genre: { 'zh-CN': '热带弛放 · Downtempo', 'zh-TW': '熱帶弛放 · Downtempo', en: 'Tropical Downtempo' }
    },
    {
      id: 'golden-coast-drive',
      num: '09',
      cat: 'coastal',
      src: 'assets/bgm/09-golden-coast-drive.mp3',
      title: { 'zh-CN': '阳光公路', 'zh-TW': '陽光公路', en: 'Golden Coast Drive' },
      genre: { 'zh-CN': '独立民谣 · Indie Folk', 'zh-TW': '獨立民謠 · Indie Folk', en: 'Indie Folk Acoustic' }
    },
    {
      id: 'silk-road-mirage',
      num: '10',
      cat: 'frontier',
      src: 'assets/bgm/10-silk-road-mirage.mp3',
      title: { 'zh-CN': '丝路长风', 'zh-TW': '絲路長風', en: 'Silk Road Mirage' },
      genre: { 'zh-CN': '世界融合 · World Ambient', 'zh-TW': '世界融合 · World Ambient', en: 'Silk Road Ambient' }
    },
    {
      id: 'patagonia-horizon',
      num: '11',
      cat: 'frontier',
      src: 'assets/bgm/11-patagonia-horizon.mp3',
      title: { 'zh-CN': '巴塔哥尼亚远山', 'zh-TW': '巴塔哥尼亞遠山', en: 'Patagonia Horizon' },
      genre: { 'zh-CN': '电影后摇 · Post-Rock', 'zh-TW': '電影後搖 · Post-Rock', en: 'Cinematic Post-Rock' }
    },
    {
      id: 'sahara-twilight',
      num: '12',
      cat: 'frontier',
      src: 'assets/bgm/12-sahara-twilight.mp3',
      title: { 'zh-CN': '撒哈拉星夜', 'zh-TW': '撒哈拉星夜', en: 'Sahara Twilight' },
      genre: { 'zh-CN': '北非夜曲 · Desert Chill', 'zh-TW': '北非夜曲 · Desert Chill', en: 'Desert Chill' }
    },
    {
      id: 'icelandic-aurora',
      num: '13',
      cat: 'nocturnal',
      src: 'assets/bgm/13-icelandic-aurora.mp3',
      title: { 'zh-CN': '冰岛极光', 'zh-TW': '冰島極光', en: 'Icelandic Aurora' },
      genre: { 'zh-CN': '北欧新古典 · Nordic', 'zh-TW': '北歐新古典 · Nordic', en: 'Nordic Post-Classical' }
    },
    {
      id: 'midnight-transit',
      num: '14',
      cat: 'nocturnal',
      src: 'assets/bgm/14-midnight-transit.mp3',
      title: { 'zh-CN': '午夜航站楼', 'zh-TW': '午夜航站樓', en: 'Midnight Transit' },
      genre: { 'zh-CN': '爵士低保真 · Jazz Lo-Fi', 'zh-TW': '爵士低保真 · Jazz Lo-Fi', en: 'Chill Jazz Lo-Fi' }
    },
    {
      id: 'stillness-in-orbit',
      num: '15',
      cat: 'nocturnal',
      src: 'assets/bgm/15-stillness-in-orbit.mp3',
      title: { 'zh-CN': '静谧星轨', 'zh-TW': '靜謐星軌', en: 'Stillness in Orbit' },
      genre: { 'zh-CN': '冥想钢琴 · Ambient Piano', 'zh-TW': '冥想鋼琴 · Ambient Piano', en: 'Meditative Piano' }
    }
  ];

  const CATS = [
    { id: 'all', labelKey: 'radioCatAll' },
    { id: 'cosmic', labelKey: 'radioCatCosmic' },
    { id: 'oriental', labelKey: 'radioCatOriental' },
    { id: 'coastal', labelKey: 'radioCatCoastal' },
    { id: 'frontier', labelKey: 'radioCatFrontier' },
    { id: 'nocturnal', labelKey: 'radioCatNocturnal' }
  ];

  const MODES = ['seq', 'one', 'shuffle'];

  let audio = null;
  let rampTimer = 0;
  let initialized = false;
  let isPlaying = false;
  let isBuffering = false;
  let isMuted = false;
  let activeCat = 'all';
  let loadedTrackId = null;
  let state = {
    trackId: 'the-blue-horizon',
    volume: DEFAULT_VOLUME,
    mode: 'seq'
  };

  let popoverEl = null;
  let triggerBtn = null;
  let triggerDot = null;
  let ui = {};

  function lang() {
    return global.AppI18n ? global.AppI18n.getLang() : 'zh-CN';
  }

  function t(key) {
    return global.AppI18n ? global.AppI18n.t(key) : key;
  }

  function svgIcon(name, size) {
    return global.AppIcons ? global.AppIcons.svg(name, size || 14) : '';
  }

  function locText(obj) {
    if (!obj) return '';
    const l = lang();
    return obj[l] || obj['zh-CN'] || obj.en || '';
  }

  function loadPrefs() {
    try {
      const raw = global.localStorage ? global.localStorage.getItem(PREFS_KEY) : null;
      if (!raw) return;
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === 'object') {
        if (TRACKS.some((tr) => tr.id === parsed.trackId)) state.trackId = parsed.trackId;
        if (typeof parsed.volume === 'number' && Number.isFinite(parsed.volume)) {
          state.volume = Math.max(0, Math.min(1, parsed.volume));
        }
        if (MODES.includes(parsed.mode)) state.mode = parsed.mode;
      }
    } catch {}
  }

  function savePrefs() {
    try {
      if (global.localStorage) {
        global.localStorage.setItem(PREFS_KEY, JSON.stringify({
          trackId: state.trackId,
          volume: Number(state.volume.toFixed(3)),
          mode: state.mode
        }));
      }
    } catch {}
  }

  function ensureAudio() {
    if (audio) return audio;
    audio = new Audio();
    audio.preload = 'none';
    audio.loop = false;
    audio.volume = 0;

    audio.addEventListener('waiting', () => {
      if (isPlaying) {
        isBuffering = true;
        updateTransportUI();
      }
    });
    audio.addEventListener('playing', () => {
      isBuffering = false;
      isPlaying = true;
      updateTransportUI();
    });
    audio.addEventListener('timeupdate', updateProgressUI);
    audio.addEventListener('loadedmetadata', updateProgressUI);
    audio.addEventListener('ended', () => {
      if (state.mode === 'one') {
        try { audio.currentTime = 0; } catch {}
        audio.play().catch(() => {});
      } else {
        next(true);
      }
    });
    audio.addEventListener('error', () => {
      isBuffering = false;
      if (isPlaying) {
        isPlaying = false;
        updateTransportUI();
      }
    });
    return audio;
  }

  function clearRamp() {
    if (rampTimer) {
      clearInterval(rampTimer);
      rampTimer = 0;
    }
  }

  function rampVolume(target, durationMs, onDone) {
    const el = ensureAudio();
    clearRamp();
    const startVol = el.volume;
    const ms = Math.max(16, durationMs || 450);
    const startAt = performance.now();
    rampTimer = setInterval(() => {
      const p = Math.min(1, (performance.now() - startAt) / ms);
      const eased = 1 - Math.pow(1 - p, 3);
      try { el.volume = Math.max(0, Math.min(1, startVol + (target - startVol) * eased)); } catch {}
      if (p >= 1) {
        clearRamp();
        if (typeof onDone === 'function') onDone();
      }
    }, 24);
  }

  function getTrack(id = state.trackId) {
    return TRACKS.find((tr) => tr.id === id) || TRACKS[0];
  }

  function getVisibleTracks() {
    if (activeCat === 'all') return TRACKS;
    return TRACKS.filter((tr) => tr.cat === activeCat);
  }

  function formatTime(sec) {
    if (!Number.isFinite(sec) || sec < 0) return '0:00';
    const whole = Math.floor(sec);
    const m = Math.floor(whole / 60);
    const s = whole % 60;
    return `${m}:${String(s).padStart(2, '0')}`;
  }

  function play(trackId) {
    if (trackId && TRACKS.some((tr) => tr.id === trackId)) {
      state.trackId = trackId;
      savePrefs();
    }

    if (global.CosmicBGM && typeof global.CosmicBGM.isActive === 'function' && global.CosmicBGM.isActive()) {
      global.CosmicBGM.fadeOutAndStop(400);
    }

    const el = ensureAudio();
    const track = getTrack(state.trackId);
    if (loadedTrackId !== track.id) {
      loadedTrackId = track.id;
      el.src = track.src;
      try { el.load(); } catch {}
      isBuffering = true;
    }

    el.muted = isMuted;
    const targetVol = isMuted ? 0 : state.volume;
    if (el.paused) el.volume = 0;

    isPlaying = true;
    updateTransportUI();
    updateTracklistUI();

    const p = el.play();
    if (p && typeof p.then === 'function') {
      p.then(() => {
        isBuffering = false;
        rampVolume(targetVol, 450);
        updateTransportUI();
      }).catch(() => {
        isBuffering = false;
        isPlaying = false;
        updateTransportUI();
      });
    } else {
      rampVolume(targetVol, 450);
    }
  }

  function pause(immediate = false) {
    clearRamp();
    isBuffering = false;
    isPlaying = false;
    updateTransportUI();
    if (!audio) return;
    if (immediate || audio.paused) {
      try {
        audio.volume = 0;
        audio.pause();
      } catch {}
      return;
    }
    rampVolume(0, 320, () => {
      try { audio.pause(); } catch {}
    });
  }

  function togglePlay() {
    if (isPlaying) pause(false);
    else play();
  }

  function selectTrack(trackId, autoPlay = true) {
    if (!TRACKS.some((tr) => tr.id === trackId)) return;
    const changed = state.trackId !== trackId;
    state.trackId = trackId;
    savePrefs();
    if (autoPlay) {
      play(trackId);
    } else {
      if (changed && audio && !audio.paused) {
        play(trackId);
      } else {
        updateTransportUI();
        updateTracklistUI();
      }
    }
  }

  function next(autoPlay = isPlaying) {
    const pool = getVisibleTracks();
    const list = pool.length ? pool : TRACKS;
    if (state.mode === 'shuffle' && list.length > 1) {
      const choices = list.filter((tr) => tr.id !== state.trackId);
      const pick = choices[Math.floor(Math.random() * choices.length)] || list[0];
      selectTrack(pick.id, autoPlay);
      return;
    }
    const idx = list.findIndex((tr) => tr.id === state.trackId);
    const nextIdx = idx === -1 ? 0 : (idx + 1) % list.length;
    selectTrack(list[nextIdx].id, autoPlay);
  }

  function prev(autoPlay = isPlaying) {
    if (audio && audio.currentTime > 4) {
      try { audio.currentTime = 0; } catch {}
      updateProgressUI();
      return;
    }
    const pool = getVisibleTracks();
    const list = pool.length ? pool : TRACKS;
    const idx = list.findIndex((tr) => tr.id === state.trackId);
    const prevIdx = idx <= 0 ? list.length - 1 : idx - 1;
    selectTrack(list[prevIdx].id, autoPlay);
  }

  function setVolume(vol) {
    const clamped = Math.max(0, Math.min(1, Number(vol)));
    if (!Number.isFinite(clamped)) return;
    state.volume = clamped;
    if (clamped > 0) isMuted = false;
    savePrefs();
    if (audio) {
      clearRamp();
      audio.muted = isMuted;
      audio.volume = isMuted ? 0 : clamped;
    }
    updateVolumeUI();
  }

  function toggleMute() {
    isMuted = !isMuted;
    if (audio) {
      audio.muted = isMuted;
      if (!isMuted) audio.volume = state.volume;
    }
    updateVolumeUI();
  }

  function cycleMode() {
    const idx = MODES.indexOf(state.mode);
    state.mode = MODES[(idx + 1) % MODES.length];
    savePrefs();
    updateModeUI();
  }

  function buildPopoverDom() {
    if (!popoverEl) return;
    popoverEl.innerHTML = `
      <div class="radio-head">
        <div class="radio-head-left">
          <span class="radio-title" id="radio-title"></span>
          <span class="radio-count-pill mono-num" id="radio-count-pill"></span>
        </div>
        <button class="radio-mode-btn" id="radio-mode-btn" type="button"></button>
      </div>

      <div class="radio-now">
        <div class="radio-now-top">
          <div class="radio-eq" id="radio-eq" aria-hidden="true">
            <span></span><span></span><span></span>
          </div>
          <div class="radio-now-meta">
            <div class="radio-now-title" id="radio-now-title"></div>
            <div class="radio-now-sub" id="radio-now-sub"></div>
          </div>
          <span class="radio-status-badge" id="radio-status-badge"></span>
        </div>

        <div class="radio-seek-row">
          <input class="radio-seek" id="radio-seek" type="range" min="0" max="100" step="0.5" value="0" aria-label="Seek" />
          <div class="radio-time-row mono-num">
            <span id="radio-time-cur">0:00</span>
            <span id="radio-time-dur">0:00</span>
          </div>
        </div>

        <div class="radio-controls-row">
          <div class="radio-transport">
            <button class="radio-icon-btn" id="radio-prev-btn" type="button" aria-label="Previous">${svgIcon('skipBack', 14)}</button>
            <button class="radio-play-btn" id="radio-play-btn" type="button" aria-label="Play / Pause"></button>
            <button class="radio-icon-btn" id="radio-next-btn" type="button" aria-label="Next">${svgIcon('skipForward', 14)}</button>
          </div>
          <div class="radio-vol-wrap">
            <button class="radio-icon-btn" id="radio-mute-btn" type="button" aria-label="Mute"></button>
            <input class="radio-vol-slider" id="radio-vol-slider" type="range" min="0" max="1" step="0.02" aria-label="Volume" />
          </div>
        </div>
      </div>

      <div class="radio-cats" id="radio-cats" role="tablist"></div>
      <div class="radio-list" id="radio-list" role="listbox"></div>
    `;

    ui = {
      title: popoverEl.querySelector('#radio-title'),
      countPill: popoverEl.querySelector('#radio-count-pill'),
      modeBtn: popoverEl.querySelector('#radio-mode-btn'),
      eq: popoverEl.querySelector('#radio-eq'),
      nowTitle: popoverEl.querySelector('#radio-now-title'),
      nowSub: popoverEl.querySelector('#radio-now-sub'),
      statusBadge: popoverEl.querySelector('#radio-status-badge'),
      seek: popoverEl.querySelector('#radio-seek'),
      timeCur: popoverEl.querySelector('#radio-time-cur'),
      timeDur: popoverEl.querySelector('#radio-time-dur'),
      prevBtn: popoverEl.querySelector('#radio-prev-btn'),
      playBtn: popoverEl.querySelector('#radio-play-btn'),
      nextBtn: popoverEl.querySelector('#radio-next-btn'),
      muteBtn: popoverEl.querySelector('#radio-mute-btn'),
      volSlider: popoverEl.querySelector('#radio-vol-slider'),
      cats: popoverEl.querySelector('#radio-cats'),
      list: popoverEl.querySelector('#radio-list')
    };

    popoverEl.addEventListener('click', (e) => {
      e.stopPropagation();
    });

    ui.playBtn.addEventListener('click', togglePlay);
    ui.prevBtn.addEventListener('click', () => prev(true));
    ui.nextBtn.addEventListener('click', () => next(true));
    ui.modeBtn.addEventListener('click', cycleMode);
    ui.muteBtn.addEventListener('click', toggleMute);
    ui.volSlider.addEventListener('input', (e) => setVolume(e.target.value));
    ui.seek.addEventListener('input', (e) => {
      if (!audio || !Number.isFinite(audio.duration) || audio.duration <= 0) return;
      const pct = Math.max(0, Math.min(100, Number(e.target.value)));
      try { audio.currentTime = (pct / 100) * audio.duration; } catch {}
      updateProgressUI();
    });
  }

  function updateModeUI() {
    if (!ui.modeBtn) return;
    const iconMap = { seq: 'repeat', one: 'repeatOne', shuffle: 'shuffle' };
    const keyMap = { seq: 'radioModeSeq', one: 'radioModeOne', shuffle: 'radioModeShuffle' };
    ui.modeBtn.innerHTML = `${svgIcon(iconMap[state.mode], 12)}<span>${t(keyMap[state.mode])}</span>`;
  }

  function updateVolumeUI() {
    if (!ui.muteBtn || !ui.volSlider) return;
    const silent = isMuted || state.volume <= 0.001;
    ui.muteBtn.innerHTML = svgIcon(silent ? 'volumeMute' : 'volume', 14);
    ui.volSlider.value = String(isMuted ? 0 : state.volume);
  }

  function updateProgressUI() {
    if (!ui.seek || !ui.timeCur || !ui.timeDur) return;
    if (!audio || loadedTrackId !== state.trackId || !Number.isFinite(audio.duration) || audio.duration <= 0) {
      ui.seek.value = '0';
      ui.timeCur.textContent = '0:00';
      ui.timeDur.textContent = '0:00';
      return;
    }
    const pct = Math.max(0, Math.min(100, (audio.currentTime / audio.duration) * 100));
    ui.seek.value = String(pct.toFixed(1));
    ui.timeCur.textContent = formatTime(audio.currentTime);
    ui.timeDur.textContent = formatTime(audio.duration);
  }

  function updateTransportUI() {
    const track = getTrack(state.trackId);
    if (triggerBtn) triggerBtn.classList.toggle('is-playing', isPlaying);
    if (triggerDot) triggerDot.classList.toggle('is-hidden', !isPlaying);
    if (!ui.nowTitle) return;

    ui.nowTitle.textContent = locText(track.title);
    ui.nowSub.textContent = locText(track.genre);
    ui.playBtn.innerHTML = svgIcon(isPlaying ? 'pause' : 'play', 15);
    ui.eq.classList.toggle('is-playing', isPlaying);
    if (isBuffering) {
      ui.statusBadge.textContent = t('radioLoading');
      ui.statusBadge.classList.add('is-active');
    } else if (isPlaying) {
      ui.statusBadge.textContent = t('radioPlaying');
      ui.statusBadge.classList.add('is-active');
    } else {
      ui.statusBadge.textContent = t('radioPaused');
      ui.statusBadge.classList.remove('is-active');
    }
    updateProgressUI();
  }

  function renderCategories() {
    if (!ui.cats) return;
    if (!ui.cats.dataset.bound) {
      ui.cats.dataset.bound = '1';
      ui.cats.addEventListener('click', (e) => {
        const btn = e.target.closest('[data-radio-cat]');
        if (!btn) return;
        activeCat = btn.dataset.radioCat;
        ui.cats.querySelectorAll('[data-radio-cat]').forEach((el) => {
          const on = el.dataset.radioCat === activeCat;
          el.classList.toggle('active', on);
          el.setAttribute('aria-selected', on ? 'true' : 'false');
        });
        updateTracklistUI();
      });
    }
    ui.cats.innerHTML = CATS.map((c) => `
      <button type="button" class="radio-cat-pill${activeCat === c.id ? ' active' : ''}" data-radio-cat="${c.id}" role="tab" aria-selected="${activeCat === c.id ? 'true' : 'false'}">${t(c.labelKey)}</button>
    `).join('');
  }

  function updateTracklistUI() {
    if (!ui.list) return;
    if (!ui.list.dataset.bound) {
      ui.list.dataset.bound = '1';
      ui.list.addEventListener('click', (e) => {
        const btn = e.target.closest('[data-track-id]');
        if (!btn) return;
        const id = btn.dataset.trackId;
        if (id === state.trackId && isPlaying) pause(false);
        else selectTrack(id, true);
      });
    }
    const list = getVisibleTracks();
    ui.list.innerHTML = list.map((tr) => {
      const isCurrent = tr.id === state.trackId;
      return `
        <button type="button" class="radio-track${isCurrent ? ' is-current' : ''}${isCurrent && isPlaying ? ' is-playing' : ''}" data-track-id="${tr.id}" role="option" aria-selected="${isCurrent ? 'true' : 'false'}">
          <span class="radio-track-num mono-num">${tr.num}</span>
          <span class="radio-track-info">
            <span class="radio-track-title">${locText(tr.title)}</span>
            <span class="radio-track-genre">${locText(tr.genre)}</span>
          </span>
          <span class="radio-track-indicator">${isCurrent && isPlaying ? svgIcon('pause', 12) : svgIcon('play', 12)}</span>
        </button>
      `;
    }).join('');
  }

  function refreshLocale() {
    if (!initialized || !popoverEl) return;
    if (triggerBtn) {
      const label = t('radioBtnTitle');
      triggerBtn.setAttribute('title', label);
      triggerBtn.setAttribute('aria-label', t('radioTitle'));
    }
    if (ui.title) ui.title.textContent = t('radioTitle');
    if (ui.countPill) ui.countPill.textContent = t('radioTracksCount');
    updateModeUI();
    updateVolumeUI();
    updateTransportUI();
    renderCategories();
    updateTracklistUI();
  }

  function init() {
    if (initialized) return;
    initialized = true;
    loadPrefs();
    popoverEl = global.document ? global.document.getElementById('music-popover') : null;
    triggerBtn = global.document ? global.document.getElementById('music-popover-btn') : null;
    triggerDot = global.document ? global.document.getElementById('music-playing-dot') : null;
    if (popoverEl) {
      buildPopoverDom();
      refreshLocale();
    }
  }

  global.AmbientRadio = {
    init,
    play,
    pause,
    togglePlay,
    selectTrack,
    next,
    prev,
    setVolume,
    toggleMute,
    cycleMode,
    refreshLocale,
    getTracks: () => TRACKS.slice(),
    getState: () => ({
      trackId: state.trackId,
      volume: state.volume,
      mode: state.mode,
      isPlaying,
      isMuted,
      activeCat,
      srcLoaded: Boolean(audio && audio.getAttribute('src'))
    })
  };
})(window);
