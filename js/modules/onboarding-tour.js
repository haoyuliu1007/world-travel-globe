(function (global) {
  'use strict';

  const SEEN_KEY = 'wtg_onboarding_v2_seen';

  let rootEl = null;
  let spotlightEl = null;
  let welcomeOverlayEl = null;
  let coachmarkEl = null;
  let bgmBtnEl = null;
  let bgmUnsub = null;
  let currentStep = -1; // -1 = closed, 0 = welcome, 1..5 = steps
  let active = false;
  let introObserver = null;
  let startTimer = null;

  function t(key) {
    return global.AppI18n ? global.AppI18n.t(key) : key;
  }

  function svgIcon(name, size) {
    return global.AppIcons ? global.AppIcons.svg(name, size || 14) : '';
  }

  function hasSeen() {
    if (global.IntroSession && typeof global.IntroSession.hasSeenTour === 'function') {
      return global.IntroSession.hasSeenTour();
    }
    try {
      return global.localStorage.getItem(SEEN_KEY) === '1';
    } catch (e) {
      return false;
    }
  }

  function markSeen() {
    if (global.IntroSession && typeof global.IntroSession.markTourSeen === 'function') {
      global.IntroSession.markTourSeen();
      return;
    }
    try {
      global.localStorage.setItem(SEEN_KEY, '1');
    } catch (e) {
      // ignore
    }
  }

  function getSteps() {
    return [
      null,
      {
        selector: '.search-capsule',
        titleKey: 'tourStep1Title',
        descKey: 'tourStep1Desc',
        pad: 6,
        radius: '999px',
        legend: [
          ['list', 'tourLegList'],
          ['search', 'tourLegSearch'],
          ['sliders', 'tourLegFilter'],
          ['bookmark', 'tourLegFav'],
          ['sun', 'tourLegTheme'],
          ['languages', 'tourLegLang']
        ]
      },
      {
        selector: '.mode-switch',
        titleKey: 'tourStep2Title',
        descKey: 'tourStep2Desc',
        pad: 6,
        radius: '999px'
      },
      {
        selector: '#map',
        isGlobeCenter: true,
        titleKey: 'tourStep3Title',
        descKey: 'tourStep3Desc',
        pad: 0,
        radius: '50%',
        dots: [
          ['var(--accent-gold)', 'tourLegGold'],
          ['var(--accent-ice)', 'tourLegIce']
        ]
      },
      {
        selector: '#phenology-bar',
        titleKey: 'tourStep4Title',
        descKey: 'tourStep4Desc',
        pad: 6,
        radius: '999px'
      },
      {
        selector: '#globe-controls',
        titleKey: 'tourStep5Title',
        descKey: 'tourStep5Desc',
        pad: 6,
        radius: '999px',
        legend: [
          ['layers', 'tourLegLayers'],
          ['box3d', 'tourLeg3d'],
          ['rotateCw', 'tourLegSpin'],
          ['maximize', 'tourLegFull'],
          ['compass', 'tourLegRegion'],
          ['plus', 'tourLegZoom']
        ]
      }
    ];
  }

  function ensureDom() {
    if (rootEl) return;

    rootEl = document.createElement('div');
    rootEl.id = 'onboarding-tour-root';
    rootEl.className = 'tour-root is-hidden';
    rootEl.setAttribute('role', 'dialog');
    rootEl.setAttribute('aria-modal', 'true');
    rootEl.setAttribute('aria-label', t('tourReplay'));

    rootEl.innerHTML = `
      <button class="tour-bgm-btn is-hidden" id="tour-bgm-btn" type="button" aria-label="静音"></button>
      <div class="tour-spotlight" id="tour-spotlight"></div>
      <div class="tour-welcome-overlay" id="tour-welcome-overlay">
        <div class="tour-welcome-card">
          <h2 class="tour-welcome-title" id="tour-welcome-title"></h2>
          <div class="tour-feature-list" id="tour-feature-list"></div>
          <div class="tour-welcome-actions">
            <button class="tour-primary-btn" id="tour-start-btn" type="button"></button>
            <button class="tour-quiet-btn" id="tour-welcome-skip-btn" type="button"></button>
          </div>
        </div>
      </div>
      <div class="tour-coachmark" id="tour-coachmark">
        <h3 class="tour-cm-title" id="tour-cm-title"></h3>
        <p class="tour-cm-desc" id="tour-cm-desc"></p>
        <div class="tour-cm-legend" id="tour-cm-legend"></div>
        <div class="tour-cm-foot">
          <div class="tour-dots" id="tour-cm-dots"></div>
          <div class="tour-cm-actions">
            <button class="tour-quiet-btn" id="tour-cm-skip-btn" type="button"></button>
            <button class="tour-next-btn" id="tour-cm-next-btn" type="button"></button>
          </div>
        </div>
      </div>
    `;

    document.body.appendChild(rootEl);

    spotlightEl = rootEl.querySelector('#tour-spotlight');
    welcomeOverlayEl = rootEl.querySelector('#tour-welcome-overlay');
    coachmarkEl = rootEl.querySelector('#tour-coachmark');
    bgmBtnEl = rootEl.querySelector('#tour-bgm-btn');

    if (bgmBtnEl) {
      bgmBtnEl.addEventListener('click', () => {
        if (global.CosmicBGM) global.CosmicBGM.toggleMute();
      });
    }

    rootEl.querySelector('#tour-start-btn').addEventListener('click', () => goToStep(1));
    rootEl.querySelector('#tour-welcome-skip-btn').addEventListener('click', () => close());
    rootEl.querySelector('#tour-cm-skip-btn').addEventListener('click', () => close());
    rootEl.querySelector('#tour-cm-next-btn').addEventListener('click', () => {
      if (currentStep >= 5) close();
      else goToStep(currentStep + 1);
    });

    welcomeOverlayEl.addEventListener('click', (e) => {
      if (e.target === welcomeOverlayEl) close();
    });

    global.addEventListener('resize', () => {
      if (active && currentStep >= 1 && currentStep <= 5) {
        positionStep(currentStep);
      }
    });

    global.addEventListener(
      'keydown',
      (e) => {
        if (!active) return;
        if (e.key === 'Escape') {
          e.preventDefault();
          e.stopImmediatePropagation();
          close();
        } else if (e.key === 'ArrowRight' || e.key === 'Enter') {
          if (currentStep === 0 && e.key === 'ArrowRight') {
            e.preventDefault();
            e.stopImmediatePropagation();
            goToStep(1);
          } else if (currentStep >= 1 && currentStep <= 5 && e.key === 'ArrowRight') {
            e.preventDefault();
            e.stopImmediatePropagation();
            if (currentStep >= 5) close();
            else goToStep(currentStep + 1);
          }
        } else if (e.key === 'ArrowLeft' && currentStep > 1) {
          e.preventDefault();
          e.stopImmediatePropagation();
          goToStep(currentStep - 1);
        }
      },
      true
    );
  }

  function renderWelcomeContent() {
    if (!rootEl) return;
    rootEl.querySelector('#tour-welcome-title').textContent = t('tourWelcomeTitle');
    rootEl.querySelector('#tour-start-btn').textContent = t('tourStartBtn');
    rootEl.querySelector('#tour-welcome-skip-btn').textContent = t('tourSkipLater');

    const rows = [
      { icon: 'globe', cls: 'is-gold', title: t('tourFeat1Title'), desc: t('tourFeat1Desc') },
      { icon: 'sun', cls: 'is-blue', title: t('tourFeat2Title'), desc: t('tourFeat2Desc') },
      { icon: 'route', cls: 'is-green', title: t('tourFeat3Title'), desc: t('tourFeat3Desc') }
    ];

    rootEl.querySelector('#tour-feature-list').innerHTML = rows
      .map(
        (r) => `
        <div class="tour-feature-row">
          <div class="tour-feature-icon ${r.cls}">${svgIcon(r.icon, 18)}</div>
          <div class="tour-feature-copy">
            <div class="tour-feature-title">${r.title}</div>
            <div class="tour-feature-desc">${r.desc}</div>
          </div>
        </div>
      `
      )
      .join('');
  }

  function getTargetRect(cfg) {
    const vw = global.innerWidth || 1280;
    const vh = global.innerHeight || 720;

    if (cfg.isGlobeCenter) {
      const size = Math.round(Math.min(340, vw * 0.56, vh * 0.52));
      return {
        left: Math.round((vw - size) / 2),
        top: Math.round((vh - size) / 2),
        width: size,
        height: size
      };
    }

    const el = document.querySelector(cfg.selector);
    if (!el) return null;
    const r = el.getBoundingClientRect();
    if (r.width === 0 && r.height === 0) return null;
    return {
      left: r.left - (cfg.pad || 0),
      top: r.top - (cfg.pad || 0),
      width: r.width + (cfg.pad || 0) * 2,
      height: r.height + (cfg.pad || 0) * 2
    };
  }

  function positionStep(stepIdx) {
    const steps = getSteps();
    const cfg = steps[stepIdx];
    if (!cfg || !spotlightEl || !coachmarkEl) return;

    const rect = getTargetRect(cfg);
    const vw = global.innerWidth || 1280;
    const vh = global.innerHeight || 720;

    if (rect) {
      spotlightEl.style.left = `${Math.round(rect.left)}px`;
      spotlightEl.style.top = `${Math.round(rect.top)}px`;
      spotlightEl.style.width = `${Math.round(rect.width)}px`;
      spotlightEl.style.height = `${Math.round(rect.height)}px`;
      spotlightEl.style.borderRadius = cfg.radius || '16px';
      spotlightEl.style.opacity = '1';
    } else {
      spotlightEl.style.opacity = '0';
    }

    // Measure coachmark after content update
    coachmarkEl.style.opacity = '1';
    coachmarkEl.style.pointerEvents = 'auto';
    const cmRect = coachmarkEl.getBoundingClientRect();
    const cmW = cmRect.width || 288;
    const cmH = cmRect.height || 168;
    const margin = 16;
    const gap = 14;

    let left = Math.round((vw - cmW) / 2);
    let top = Math.round((vh - cmH) / 2);

    if (rect) {
      if (cfg.isGlobeCenter) {
        if (rect.left + rect.width + gap + cmW <= vw - margin) {
          left = rect.left + rect.width + gap;
          top = rect.top + (rect.height - cmH) / 2;
        } else if (rect.left - gap - cmW >= margin) {
          left = rect.left - gap - cmW;
          top = rect.top + (rect.height - cmH) / 2;
        } else {
          left = (vw - cmW) / 2;
          top = Math.min(vh - cmH - margin, rect.top + rect.height + gap);
        }
      } else {
        const spaceBelow = vh - (rect.top + rect.height) - margin;
        const spaceAbove = rect.top - margin;

        if (spaceBelow >= cmH + gap || spaceBelow >= spaceAbove) {
          top = rect.top + rect.height + gap;
        } else {
          top = rect.top - cmH - gap;
        }

        // Align horizontally with target, preferring right alignment if target is on right half
        if (rect.left + rect.width / 2 > vw / 2) {
          left = rect.left + rect.width - cmW;
        } else {
          left = rect.left;
        }
      }
    }

    left = Math.max(margin, Math.min(vw - cmW - margin, Math.round(left)));
    top = Math.max(margin, Math.min(vh - cmH - margin, Math.round(top)));

    coachmarkEl.style.left = `${left}px`;
    coachmarkEl.style.top = `${top}px`;
  }

  function goToStep(nextStep) {
    ensureDom();
    currentStep = nextStep;

    if (nextStep === 0) {
      renderWelcomeContent();
      welcomeOverlayEl.classList.remove('is-hidden');
      spotlightEl.style.opacity = '0';
      coachmarkEl.style.opacity = '0';
      coachmarkEl.style.pointerEvents = 'none';
      return;
    }

    if (nextStep < 1 || nextStep > 5) {
      close();
      return;
    }

    welcomeOverlayEl.classList.add('is-hidden');

    const cfg = getSteps()[nextStep];
    coachmarkEl.querySelector('#tour-cm-title').textContent = t(cfg.titleKey);
    coachmarkEl.querySelector('#tour-cm-desc').textContent = t(cfg.descKey);

    const legendEl = coachmarkEl.querySelector('#tour-cm-legend');
    if (cfg.legend) {
      legendEl.innerHTML = `<div class="tour-legend-grid">${cfg.legend
        .map(([ic, lk]) => `<div class="tour-legend-item">${svgIcon(ic, 13)}<span>${t(lk)}</span></div>`)
        .join('')}</div>`;
      legendEl.style.display = 'block';
    } else if (cfg.dots) {
      legendEl.innerHTML = `<div class="tour-dot-legend">${cfg.dots
        .map(([col, lk]) => `<div class="tour-legend-item"><span class="tour-color-dot" style="background:${col}"></span><span>${t(lk)}</span></div>`)
        .join('')}</div>`;
      legendEl.style.display = 'block';
    } else {
      legendEl.innerHTML = '';
      legendEl.style.display = 'none';
    }

    const dotsEl = coachmarkEl.querySelector('#tour-cm-dots');
    dotsEl.innerHTML = [1, 2, 3, 4, 5]
      .map(
        (i) =>
          `<button type="button" class="tour-dot-btn ${i === nextStep ? 'active' : ''}" data-tour-dot="${i}" aria-label="${i}/5"></button>`
      )
      .join('');
    dotsEl.querySelectorAll('[data-tour-dot]').forEach((btn) => {
      btn.addEventListener('click', () => goToStep(Number(btn.dataset.tourDot)));
    });

    coachmarkEl.querySelector('#tour-cm-skip-btn').textContent = t('tourSkip');
    coachmarkEl.querySelector('#tour-cm-next-btn').textContent = nextStep === 5 ? t('tourFinish') : t('tourNext');

    positionStep(nextStep);
  }

  function syncBgmBtn() {
    if (!bgmBtnEl) return;
    const bgm = global.CosmicBGM;
    const show = Boolean(active && bgm && bgm.isActive());
    bgmBtnEl.classList.toggle('is-hidden', !show);
    if (!show) return;
    const muted = bgm.isMuted();
    bgmBtnEl.textContent = muted ? '🔇' : '🔊';
    bgmBtnEl.setAttribute('aria-label', muted ? '取消静音' : '静音');
  }

  function start(isReplay) {
    if (startTimer) {
      clearTimeout(startTimer);
      startTimer = null;
    }
    if (introObserver) {
      introObserver.disconnect();
      introObserver = null;
    }

    // Ensure map view is active and popovers/drawer don't clash
    if (typeof global.setAppViewMode === 'function') {
      global.setAppViewMode('map', true);
    }

    ensureDom();
    active = true;
    rootEl.classList.remove('is-hidden');
    if (global.CosmicBGM && !bgmUnsub) {
      bgmUnsub = global.CosmicBGM.onChange(syncBgmBtn);
    }
    syncBgmBtn();
    goToStep(0);
  }

  function close() {
    if (!active) return;
    active = false;
    currentStep = -1;
    markSeen();
    if (bgmUnsub) {
      bgmUnsub();
      bgmUnsub = null;
    }
    if (global.CosmicBGM) global.CosmicBGM.fadeOutAndStop(1600);
    syncBgmBtn();
    if (rootEl) {
      rootEl.classList.add('is-hidden');
      if (spotlightEl) spotlightEl.style.opacity = '0';
      if (coachmarkEl) {
        coachmarkEl.style.opacity = '0';
        coachmarkEl.style.pointerEvents = 'none';
      }
    }
  }

  function init() {
    if (active || hasSeen()) return;
    if (global.location && (global.location.search || global.location.hash)) return;

    const mapBtn = document.getElementById('mode-map-btn');
    if (mapBtn && mapBtn.getAttribute('aria-selected') !== 'true') return;

    const scheduleStart = (delayMs) => {
      if (startTimer) clearTimeout(startTimer);
      startTimer = setTimeout(() => {
        if (!hasSeen() && !active) start(false);
      }, delayMs);
    };

    const introState = document.documentElement.dataset.introState || 'map';
    if (introState === 'map') {
      scheduleStart(650);
    } else if (typeof MutationObserver !== 'undefined') {
      introObserver = new MutationObserver(() => {
        if (document.documentElement.dataset.introState === 'map') {
          introObserver.disconnect();
          introObserver = null;
          if (!active && !hasSeen()) scheduleStart(550);
        }
      });
      introObserver.observe(document.documentElement, {
        attributes: true,
        attributeFilter: ['data-intro-state']
      });
    }
  }

  global.OnboardingTour = {
    init,
    start,
    close,
    hasSeen,
    isOpen: () => active
  };
})(window);
