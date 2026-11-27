'use strict';

(function (global) {
  const root = document.getElementById('story-prologue');
  if (!root) return;

  const reduced = matchMedia('(prefers-reduced-motion: reduce)');
  const clamp01 = (v) => Math.max(0, Math.min(1, v));
  const lerp = (a, b, t) => a + (b - a) * t;

  let built = false;
  let isOpen = false;
  let isClosing = false;
  let isReplayRun = false;
  let rafId = 0;
  let activeInst = 0;
  let instBlend = 0;
  let activeSlideIdx = 0;
  let instNearViewport = false;
  let returnFocusEl = null;
  let bgmUnsub = null;
  let leaveTimer = 0;
  let wheelLockUntil = 0;
  let wheelAccum = 0;
  let wheelAccumTimer = 0;
  let touchStartY = 0;
  let touchStartX = 0;
  let touchTracking = false;
  const inertNodes = new Set();

  let refs = {};

  const CHAPTER_LABELS = [
    '序幕',
    '青铜星空',
    '丈量星球',
    '总观效应',
    '空间与地方',
    '万物之网',
    '天文仪器',
    '启程时刻'
  ];

  const FINAL_COORD_TEXT = '46.5422° N · 7.9821° E · 山谷灯火';

  function buildDom() {
    if (built) return;
    built = true;

    root.innerHTML = `
      <div class="sp-hairline" id="sp-hairline" aria-hidden="true"></div>

      <header class="sp-nav" id="sp-nav">
        <div class="sp-brand">
          <span class="sp-brand-dot" aria-hidden="true"></span>
          <span>World Travel Globe</span>
        </div>
        <div class="sp-top-controls">
          <button class="sp-mute-btn" id="sp-mute" type="button" aria-label="静音">🔊</button>
          <button class="sp-skip-quiet" id="sp-skip" type="button" aria-label="跳过序章直接进入地球仪">跳过</button>
        </div>
      </header>

      <nav class="sp-dot-rail" id="sp-dot-rail" aria-label="序章章节进度">
        ${CHAPTER_LABELS.map((label, idx) => `
          <button class="sp-dot-btn${idx === 0 ? ' active' : ''}" type="button" data-slide-idx="${idx}" aria-label="${label}">
            <span class="sp-dot-label">${label}</span>
          </button>
        `).join('')}
      </nav>

      <!-- Slide 1: Hero -->
      <section class="sp-slide is-active" id="sp-s1" data-slide="0">
        <img class="sp-bg-photo" src="assets/prologue/scene-1-origin.jpg?v=1" alt="" />
        <div class="sp-grid-overlay" aria-hidden="true"></div>
        <div class="sp-scrim-hero" aria-hidden="true"></div>

        <div class="sp-hero-inner">
          <div class="sp-badge sp-reveal" style="--sp-delay: 20ms;">
            <span class="sp-badge-pill">3D 卫星图鉴</span>
            <span>覆盖七大洲 137 国与 5,414 处光影机位</span>
          </div>

          <h1 class="sp-hero-title">
            <span class="sp-line-clip"><span class="sp-line-inner" style="--sp-delay: 60ms;">世界，不止于平面</span></span>
            <span class="sp-line-clip"><span class="sp-line-inner sp-accent-grad" style="--sp-delay: 130ms;">以天文学的精度去旅行</span></span>
          </h1>

          <p class="sp-hero-sub sp-reveal" style="--sp-delay: 190ms;">
            <span class="sp-phrase">从青铜星盘到近地轨道，</span><span class="sp-phrase">人类花了三千六百年才看清这颗星球的全貌。</span>
            <span class="sp-phrase">现在，物候、日照与地形尺度，</span><span class="sp-phrase">重新交还到你的掌心。</span>
          </p>

          <div class="sp-hero-actions sp-reveal" style="--sp-delay: 250ms;">
            <button class="sp-btn-primary" id="sp-start-btn" type="button">
              <span>开启序章之旅</span>
              <svg class="sp-arrow-down" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 5v14M5 12l7 7 7-7"/></svg>
            </button>
            <div class="sp-hero-hint">推荐 · 开启全屏与配乐，沉浸阅读序章</div>
          </div>
        </div>

        <div class="sp-cue" aria-hidden="true">
          <div class="sp-cue-line"></div>
        </div>
      </section>

      <!-- Slide 2: Nebra Sky Disc (Right-Aligned Negative Space + Clip-Wipe) -->
      <section class="sp-slide sp-anim-wipe" id="sp-s2" data-slide="1">
        <img class="sp-bg-photo" src="assets/prologue/scene-2-nebra.jpg?v=1" alt="" style="object-position: left center;" />
        <div class="sp-scrim-right" aria-hidden="true"></div>
        <div class="sp-story-inner sp-align-right">
          <div class="sp-nebra-arc-wrap sp-reveal" style="--sp-delay: 0ms;" aria-hidden="true">
            <svg class="sp-nebra-arc" viewBox="0 0 180 42" fill="none">
              <defs>
                <linearGradient id="spGoldGrad" x1="8" y1="34" x2="172" y2="34" gradientUnits="userSpaceOnUse">
                  <stop offset="0" stop-color="#f6dfaf"/>
                  <stop offset="0.55" stop-color="#e0c38e"/>
                  <stop offset="1" stop-color="#7eaaff"/>
                </linearGradient>
              </defs>
              <path class="sp-draw-path" pathLength="100" d="M8 34C48 10 132 10 172 34" stroke="url(#spGoldGrad)" stroke-width="1.35" stroke-linecap="round"/>
              <path class="sp-draw-path" pathLength="100" d="M36 34C64 19 116 19 144 34" stroke="rgba(224,195,142,0.45)" stroke-width="0.9" stroke-dasharray="3 4"/>
              <circle class="sp-arc-node" cx="90" cy="15.5" r="2.6" fill="#f6dfaf"/>
              <circle class="sp-arc-node" cx="8" cy="34" r="1.8" fill="#e0c38e"/>
              <circle class="sp-arc-node" cx="172" cy="34" r="1.8" fill="#7eaaff"/>
            </svg>
          </div>
          <div class="sp-kicker sp-reveal" style="--sp-delay: 40ms;">c. 1600 BCE · Nebra Sky Disc</div>
          <h2 class="sp-story-quote sp-reveal" style="--sp-delay: 110ms;">
            <span class="sp-phrase">三千六百年前，人类第一次</span><br />
            <span class="sp-phrase sp-accent-grad">把星空与季节刻上青铜。</span>
          </h2>
          <div class="sp-story-rule" aria-hidden="true"></div>
          <p class="sp-story-sub sp-reveal" style="--sp-delay: 190ms;">
            <span class="sp-phrase">只为读懂风向、物候，</span><span class="sp-phrase">与出发的准确时刻</span>
          </p>
        </div>
      </section>

      <!-- Slide 3: Eratosthenes (Left-Aligned Negative Space + 7.2 deg Geometry) -->
      <section class="sp-slide sp-anim-geo" id="sp-s3" data-slide="2">
        <img class="sp-bg-photo" src="assets/prologue/scene-2-astrolabe.jpg?v=1" alt="" style="object-position: right center;" />
        <div class="sp-scrim-left" aria-hidden="true"></div>
        <div class="sp-story-inner sp-align-left">
          <div class="sp-geo-wrap sp-reveal" style="--sp-delay: 0ms;" aria-hidden="true">
            <svg class="sp-geo-diagram" viewBox="0 0 220 76" fill="none">
              <path class="sp-geo-arc" pathLength="100" d="M18 68A125 125 0 0 1 168 38" stroke="rgba(245,245,247,0.42)" stroke-width="1.2"/>
              <line class="sp-geo-ray" pathLength="100" x1="18" y1="12" x2="196" y2="12" stroke="rgba(224,195,142,0.55)" stroke-width="0.9" stroke-dasharray="4 3"/>
              <line class="sp-geo-ray" pathLength="100" x1="18" y1="31" x2="152" y2="31" stroke="#e0c38e" stroke-width="1.2"/>
              <line class="sp-geo-wedge" pathLength="100" x1="108" y1="41" x2="114" y2="16" stroke="#f6dfaf" stroke-width="1.35"/>
              <line class="sp-geo-wedge" pathLength="100" x1="114" y1="16" x2="126" y2="31" stroke="#7eaaff" stroke-width="1.15"/>
              <path class="sp-geo-fill" d="M108 41L114 16L126 31Z" fill="rgba(224,195,142,0.22)"/>
              <circle cx="108" cy="41" r="2.2" fill="#f6dfaf"/>
              <circle cx="152" cy="31" r="2" fill="#e0c38e"/>
            </svg>
            <span class="sp-geo-badge">7.2° · 1/50 OF SPHERE</span>
          </div>
          <div><div class="sp-kicker sp-reveal" style="--sp-delay: 50ms;">c. 240 BCE · Eratosthenes</div></div>
          <h2 class="sp-story-quote sp-reveal" style="--sp-delay: 110ms;">
            <span class="sp-phrase">两千年前，仅凭正午 7.2° 的树影，</span><br />
            <span class="sp-phrase sp-accent-grad">便算出整颗星球的周长。</span>
          </h2>
          <div class="sp-story-rule" aria-hidden="true"></div>
          <p class="sp-story-sub sp-reveal" style="--sp-delay: 190ms;">
            <span class="sp-phrase">人类第一次确信：脚下并非无尽平面，</span><span class="sp-phrase">而是一颗完整的球</span>
          </p>
        </div>
      </section>

      <!-- Slide 4: The Overview Effect (Left Orbital Space + Wide-Lens Dolly Zoom) -->
      <section class="sp-slide sp-anim-orbital" id="sp-s4" data-slide="3">
        <img class="sp-bg-photo" src="assets/prologue/scene-3-earth.jpg?v=1" alt="" style="object-position: right center;" />
        <div class="sp-scrim-orbital" aria-hidden="true"></div>
        <div class="sp-story-inner sp-align-left">
          <div class="sp-kicker sp-reveal" style="--sp-delay: 0ms;">1987 · Frank White · The Overview Effect</div>
          <h2 class="sp-story-quote sp-reveal" style="--sp-delay: 90ms;">
            <span class="sp-phrase">直到飞离大气层回望，</span><br />
            <span class="sp-phrase sp-accent-grad">地图上的国界才第一次消失。</span>
          </h2>
          <div class="sp-story-rule" aria-hidden="true"></div>
          <p class="sp-story-sub sp-reveal" style="--sp-delay: 180ms;">
            <span class="sp-phrase">宇航哲学称之为「总观效应」——</span><span class="sp-phrase">万物共享同一道晨昏线</span>
          </p>
        </div>
      </section>

      <!-- Slide 5: Space & Place (Upper Night Sky + Coordinate-Lock Reticle) -->
      <section class="sp-slide sp-anim-coord" id="sp-s5" data-slide="4">
        <img class="sp-bg-photo" src="assets/prologue/scene-5-place.jpg?v=1" alt="" style="object-position: center bottom;" />
        <div class="sp-scrim-top" aria-hidden="true"></div>
        <div class="sp-story-inner sp-align-top">
          <div class="sp-coord-lock sp-reveal" id="sp-coord-lock" style="--sp-delay: 0ms;" aria-hidden="true">
            <span class="sp-reticle">
              <svg width="24" height="24" viewBox="0 0 26 26" fill="none">
                <circle cx="13" cy="13" r="10.5" stroke="currentColor" stroke-width="1" stroke-dasharray="6 4"/>
                <circle cx="13" cy="13" r="4.5" stroke="currentColor" stroke-width="1"/>
                <path d="M13 0.5V5M13 21V25.5M0.5 13H5M21 13H25.5" stroke="currentColor" stroke-width="1"/>
              </svg>
            </span>
            <span class="sp-coord-readout" id="sp-coord-readout">00.0000° N · 00.0000° E</span>
          </div>
          <div><div class="sp-kicker sp-reveal" style="--sp-delay: 40ms;">1977 · Yi-Fu Tuan · Space &amp; Place</div></div>
          <h2 class="sp-story-quote sp-reveal" style="--sp-delay: 100ms;">
            <span class="sp-phrase">当你真正认识一处坐标，</span><br />
            <span class="sp-phrase sp-accent-grad">冷冰冰的“空间”，才成了“地方”。</span>
          </h2>
          <div class="sp-story-rule" aria-hidden="true"></div>
          <p class="sp-story-sub sp-reveal" style="--sp-delay: 170ms;">
            <span class="sp-phrase">这正是我们造这颗 3D 地球仪的起点</span>
          </p>
        </div>
      </section>

      <!-- Slide 6: Humboldt + Living Planetary Atlas Metrics (Delta Negative Space + Cascade) -->
      <section class="sp-slide sp-anim-cascade" id="sp-s6" data-slide="5">
        <img class="sp-bg-photo" src="assets/prologue/scene-6-humboldt.jpg?v=1" alt="" style="object-position: right center;" />
        <div class="sp-scrim-humboldt" aria-hidden="true"></div>
        <div class="sp-earth-inner">
          <div class="sp-earth-copy">
            <div class="sp-kicker sp-reveal" style="--sp-delay: 0ms;">1845 · Alexander von Humboldt · Kosmos</div>
            <h2 class="sp-earth-title sp-reveal" style="--sp-delay: 70ms;">
              <span class="sp-phrase">自然，是一张千万丝线</span><br />
              <span class="sp-phrase sp-accent-grad">织成的网。</span>
            </h2>
            <p class="sp-earth-lead sp-reveal" style="--sp-delay: 140ms;">
              <span class="sp-phrase">海拔、洋流、花期与光影从未孤立。</span>
              <span class="sp-phrase">我们把整颗地球的地形尺度、十二个月物候与太阳光线，</span><span class="sp-phrase">重新交还到你的掌心。</span>
            </p>
          </div>

          <div class="sp-metrics-bar sp-reveal" style="--sp-delay: 210ms;">
            <div class="sp-metric-cell">
              <div class="sp-metric-val" data-count="137">0</div>
              <div class="sp-metric-name">国家与地区</div>
            </div>
            <div class="sp-metric-cell">
              <div class="sp-metric-val" data-count="722">0</div>
              <div class="sp-metric-name">精选目的地</div>
            </div>
            <div class="sp-metric-cell">
              <div class="sp-metric-val sp-accent-grad" data-count="5414">0</div>
              <div class="sp-metric-name">真实摄影机位</div>
            </div>
          </div>
        </div>
      </section>

      <!-- Slide 7: Precision Instrument (Dark Observatory Console + One-Shot Border Scan) -->
      <section class="sp-slide sp-anim-console" id="sp-s7" data-slide="6">
        <div class="sp-inst-inner">
          <div class="sp-inst-head">
            <div class="sp-kicker sp-reveal" style="--sp-delay: 0ms;">Precision Instrument</div>
            <h2 class="sp-inst-title sp-reveal" style="--sp-delay: 70ms;">
              <span class="sp-phrase">以天文仪器的精度，</span><span class="sp-phrase sp-accent-grad">丈量下一次出发。</span>
            </h2>
          </div>

          <div class="sp-inst-shell sp-reveal" style="--sp-delay: 140ms;">
            <div class="sp-tabs-wrap">
              <div class="sp-tabs" role="tablist" aria-label="核心仪器能力">
                <button class="sp-tab active" data-inst="0" role="tab" aria-selected="true" type="button">物候刻度</button>
                <button class="sp-tab" data-inst="1" role="tab" aria-selected="false" type="button">日照星盘</button>
                <button class="sp-tab" data-inst="2" role="tab" aria-selected="false" type="button">环球航迹</button>
              </div>
            </div>

            <div class="sp-dial-frame">
              <canvas class="sp-inst-canvas" id="sp-inst-canvas" aria-hidden="true"></canvas>
              <div class="sp-cap-bar">
                <div class="sp-cap active" data-cap="0">
                  <h3>十二个月物候刻度</h3>
                  <p>按月份筛选全球最佳花期、雪季、秋叶与极光窗口，只在对的时间前往对的经纬。</p>
                </div>
                <div class="sp-cap" data-cap="1">
                  <h3>SunCalc 黄金日照星盘</h3>
                  <p>实时推演任意机位的日出方位、黄金时刻仰角与顺逆光轨迹，不再全凭天气撞大运。</p>
                </div>
                <div class="sp-cap" data-cap="2">
                  <h3>大圆航迹与足迹档案馆</h3>
                  <p>自动编排多日动线与双档预算；点亮去过与心愿坐标，长出只属于你的世界版图。</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      <!-- Slide 8: Departure Finale (Dawn Horizon Lift + Subtle Settlement) -->
      <section class="sp-slide sp-anim-dawn" id="sp-s8" data-slide="7">
        <img class="sp-bg-photo" src="assets/prologue/scene-4-dawn.jpg?v=1" alt="" style="object-position: center bottom;" />
        <div class="sp-scrim-dawn" aria-hidden="true"></div>
        <div class="sp-finale-inner">
          <div class="sp-kicker sp-reveal" style="--sp-delay: 0ms;">Ready for Departure</div>
          <h2 class="sp-finale-title sp-reveal" style="--sp-delay: 70ms;">
            <span class="sp-phrase">出发之前，</span><span class="sp-phrase sp-accent-grad">先与世界相遇。</span>
          </h2>
          <div class="sp-finale-sub sp-reveal" style="--sp-delay: 130ms;">137 国 · 722 城 · 5,414 处光影坐标</div>
          <div class="sp-reveal" style="--sp-delay: 190ms;">
            <button class="sp-btn-primary" id="sp-enter-btn" type="button">
              <span>进入 3D 地球仪</span>
              <svg class="sp-arrow-right" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M5 12h14M13 5l7 7-7 7"/></svg>
            </button>
          </div>

          <div class="sp-footnotes sp-reveal" style="--sp-delay: 240ms;">
            Nebra Sky Disc (c. 1600 BCE) · Eratosthenes (c. 240 BCE) · Alexander von Humboldt《Kosmos》(1845) · Yi-Fu Tuan《Space and Place》(1977) · Frank White《The Overview Effect》(1987)
          </div>
        </div>
      </section>
    `;

    refs = {
      hairline: root.querySelector('#sp-hairline'),
      muteBtn: root.querySelector('#sp-mute'),
      skipBtn: root.querySelector('#sp-skip'),
      startBtn: root.querySelector('#sp-start-btn'),
      enterBtn: root.querySelector('#sp-enter-btn'),
      slides: Array.from(root.querySelectorAll('.sp-slide')),
      dots: Array.from(root.querySelectorAll('.sp-dot-btn')),
      coordLock: root.querySelector('#sp-coord-lock'),
      coordReadout: root.querySelector('#sp-coord-readout'),
      instCanvas: root.querySelector('#sp-inst-canvas'),
      iCtx: root.querySelector('#sp-inst-canvas').getContext('2d'),
      tabs: Array.from(root.querySelectorAll('.sp-tab')),
      caps: Array.from(root.querySelectorAll('.sp-cap')),
      counters: Array.from(root.querySelectorAll('[data-count]'))
    };

    refs.tabs.forEach((btn) => {
      btn.addEventListener('click', () => {
        activeInst = Number(btn.dataset.inst);
        refs.tabs.forEach((b, i) => {
          b.classList.toggle('active', i === activeInst);
          b.setAttribute('aria-selected', String(i === activeInst));
        });
        refs.caps.forEach((c, i) => c.classList.toggle('active', i === activeInst));
      });
    });

    refs.dots.forEach((dot) => {
      dot.addEventListener('click', () => {
        goToSlide(Number(dot.dataset.slideIdx));
      });
    });

    refs.startBtn.addEventListener('click', () => {
      if (global.IntroSession) global.IntroSession.requestFullscreen();
      if (global.CosmicBGM) {
        if (global.CosmicBGM.isBlocked() || global.CosmicBGM.isMuted()) {
          global.CosmicBGM.unmute();
        } else if (!global.CosmicBGM.isActive()) {
          global.CosmicBGM.start(0.58);
        }
      }
      goToSlide(1);
    });

    refs.skipBtn.addEventListener('click', () => close('skip'));
    refs.enterBtn.addEventListener('click', () => close('cta'));
    refs.muteBtn.addEventListener('click', () => {
      if (global.CosmicBGM) global.CosmicBGM.toggleMute();
    });

    global.addEventListener('resize', () => {
      if (isOpen) resizeInst();
    });
  }

  function clearTransitionTimers() {
    if (leaveTimer) {
      clearTimeout(leaveTimer);
      leaveTimer = 0;
    }
    if (wheelAccumTimer) {
      clearTimeout(wheelAccumTimer);
      wheelAccumTimer = 0;
    }
    wheelAccum = 0;
  }

  function updateSlideEffects(idx) {
    if (idx === 4) {
      animateCoordLock();
    } else if (idx === 5) {
      refs.counters.forEach((el) => animateCount(el));
    }

    const wasNear = instNearViewport;
    instNearViewport = idx === 6;
    if (instNearViewport && !wasNear && isOpen && !rafId) {
      resizeInst();
      rafId = requestAnimationFrame(tick);
    }
  }

  function goToSlide(idx, opts = {}) {
    if (!refs.slides || !refs.slides.length) return;
    const nextIdx = Math.max(0, Math.min(refs.slides.length - 1, idx));
    const force = Boolean(opts.force);
    const instant = Boolean(opts.instant) || reduced.matches;
    if (!force && nextIdx === activeSlideIdx) return;

    const prevIdx = activeSlideIdx;
    const prevSlide = refs.slides[prevIdx];
    const nextSlide = refs.slides[nextIdx];
    if (!nextSlide) return;

    if (leaveTimer) {
      clearTimeout(leaveTimer);
      leaveTimer = 0;
    }

    refs.slides.forEach((s) => {
      if (s !== nextSlide) s.classList.remove('is-leaving');
    });

    if (!instant && prevSlide && prevSlide !== nextSlide) {
      prevSlide.classList.remove('is-active');
      prevSlide.classList.add('is-leaving');
      leaveTimer = setTimeout(() => {
        prevSlide.classList.remove('is-leaving');
        leaveTimer = 0;
      }, 680);
    } else {
      refs.slides.forEach((s, i) => {
        s.classList.toggle('is-active', i === nextIdx);
        s.classList.remove('is-leaving');
      });
    }

    nextSlide.classList.remove('is-leaving');
    nextSlide.classList.add('is-active');
    activeSlideIdx = nextIdx;

    if (refs.hairline) {
      const progress = nextIdx / Math.max(1, refs.slides.length - 1);
      refs.hairline.style.transform = `scaleX(${progress.toFixed(4)})`;
    }

    refs.dots.forEach((d, i) => {
      const isActive = i === nextIdx;
      d.classList.toggle('active', isActive);
      if (isActive) d.setAttribute('aria-current', 'step');
      else d.removeAttribute('aria-current');
    });

    updateSlideEffects(nextIdx);
  }

  function onWheel(event) {
    if (!isOpen || isClosing) return;
    event.preventDefault();

    let dy = event.deltaY;
    if (event.deltaMode === 1) dy *= 32;
    else if (event.deltaMode === 2) dy *= (global.innerHeight || 900);

    const now = performance.now();
    if (now < wheelLockUntil) {
      wheelAccum = 0;
      return;
    }

    wheelAccum += dy;
    if (wheelAccumTimer) clearTimeout(wheelAccumTimer);
    wheelAccumTimer = setTimeout(() => {
      wheelAccum = 0;
      wheelAccumTimer = 0;
    }, 180);

    if (Math.abs(wheelAccum) >= 34) {
      const dir = wheelAccum > 0 ? 1 : -1;
      wheelAccum = 0;
      if (wheelAccumTimer) {
        clearTimeout(wheelAccumTimer);
        wheelAccumTimer = 0;
      }
      const targetIdx = Math.max(0, Math.min(refs.slides.length - 1, activeSlideIdx + dir));
      if (targetIdx !== activeSlideIdx) {
        wheelLockUntil = now + 560;
        goToSlide(targetIdx);
      } else {
        wheelLockUntil = now + 240;
      }
    }
  }

  function onTouchStart(event) {
    if (!isOpen || isClosing || !event.touches || event.touches.length !== 1) return;
    const t = event.target;
    if (t && t.closest && t.closest('button, a, input, .sp-tabs')) {
      touchTracking = false;
      return;
    }
    touchTracking = true;
    touchStartY = event.touches[0].clientY;
    touchStartX = event.touches[0].clientX;
  }

  function onTouchEnd(event) {
    if (!isOpen || isClosing || !touchTracking || !event.changedTouches || !event.changedTouches.length) return;
    touchTracking = false;
    const dy = touchStartY - event.changedTouches[0].clientY;
    const dx = touchStartX - event.changedTouches[0].clientX;
    if (Math.abs(dy) >= 44 && Math.abs(dy) > Math.abs(dx) * 1.2) {
      goToSlide(activeSlideIdx + (dy > 0 ? 1 : -1));
    }
  }

  function animateCoordLock() {
    const lockEl = refs.coordLock;
    const readoutEl = refs.coordReadout;
    if (!lockEl || !readoutEl) return;
    if (readoutEl.dataset.locked === '1') return;
    readoutEl.dataset.locked = '1';

    if (reduced.matches) {
      readoutEl.textContent = FINAL_COORD_TEXT;
      lockEl.classList.add('is-locked');
      return;
    }

    const dur = 750;
    const start = performance.now();
    const step = (now) => {
      if (!isOpen) return;
      const t = clamp01((now - start) / dur);
      if (t >= 1) {
        readoutEl.textContent = FINAL_COORD_TEXT;
        lockEl.classList.add('is-locked');
        return;
      }
      const eased = 1 - Math.pow(1 - t, 2.5);
      const jitterLat = t < 0.78 ? ((Math.sin(now * 0.041) * 0.8 + 0.2) * (1 - t) * 4) : 0;
      const jitterLon = t < 0.86 ? ((Math.cos(now * 0.053) * 0.8 + 0.2) * (1 - t) * 3) : 0;
      const lat = Math.max(0, 46.5422 * eased + jitterLat).toFixed(4);
      const lon = Math.max(0, 7.9821 * eased + jitterLon).toFixed(4);
      readoutEl.textContent = `${lat}° N · ${lon}° E`;
      requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  }

  function animateCount(el) {
    if (el.dataset.counted === '1') return;
    el.dataset.counted = '1';
    const target = Number(el.dataset.count) || 0;
    const format = (val) => val.toLocaleString('en-US');

    if (reduced.matches) {
      el.textContent = format(target);
      return;
    }

    const dur = 900;
    const start = performance.now();
    const step = (now) => {
      if (!isOpen) return;
      const t = clamp01((now - start) / dur);
      const eased = 1 - Math.pow(1 - t, 3);
      el.textContent = format(Math.round(target * eased));
      if (t < 1) requestAnimationFrame(step);
      else el.textContent = format(target);
    };
    requestAnimationFrame(step);
  }

  function resetStage() {
    clearTransitionTimers();
    wheelLockUntil = 0;
    activeSlideIdx = 0;
    instNearViewport = false;

    refs.slides.forEach((s, i) => {
      s.classList.remove('is-leaving');
      s.classList.toggle('is-active', i === 0);
    });
    refs.dots.forEach((d, i) => {
      const isActive = i === 0;
      d.classList.toggle('active', isActive);
      if (isActive) d.setAttribute('aria-current', 'step');
      else d.removeAttribute('aria-current');
    });
    if (refs.hairline) refs.hairline.style.transform = 'scaleX(0)';

    refs.counters.forEach((el) => {
      el.dataset.counted = '0';
      el.textContent = reduced.matches ? Number(el.dataset.count || 0).toLocaleString('en-US') : '0';
    });
    if (refs.coordLock && refs.coordReadout) {
      refs.coordLock.classList.toggle('is-locked', reduced.matches);
      refs.coordReadout.dataset.locked = '0';
      refs.coordReadout.textContent = reduced.matches ? FINAL_COORD_TEXT : '00.0000° N · 00.0000° E';
    }
  }

  function resizeInst() {
    if (!refs.instCanvas) return { w: 1, h: 1 };
    const dpr = Math.min(global.devicePixelRatio || 1, 2);
    const w = refs.instCanvas.clientWidth || 1;
    const h = refs.instCanvas.clientHeight || 1;
    if (refs.instCanvas.width !== Math.round(w * dpr) || refs.instCanvas.height !== Math.round(h * dpr)) {
      refs.instCanvas.width = Math.round(w * dpr);
      refs.instCanvas.height = Math.round(h * dpr);
    }
    refs.iCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
    return { w, h };
  }

  function syncMuteUI() {
    if (!refs.muteBtn || !global.CosmicBGM) return;
    const muted = global.CosmicBGM.isMuted();
    refs.muteBtn.textContent = muted ? '🔇' : '🔊';
    refs.muteBtn.setAttribute('aria-label', muted ? '取消静音' : '静音');
  }

  function lockBackground() {
    Array.from(document.body.children).forEach((node) => {
      if (node !== root && node.id !== 'cosmic-intro' && node.tagName !== 'SCRIPT' && !node.inert) {
        node.inert = true;
        inertNodes.add(node);
      }
    });
  }

  function unlockBackground() {
    inertNodes.forEach((node) => { node.inert = false; });
    inertNodes.clear();
  }

  function renderInstrument(t) {
    instBlend += (activeInst - instBlend) * (reduced.matches ? 1 : 0.28);
    if (Math.abs(activeInst - instBlend) < 0.004) instBlend = activeInst;
    const { w, h } = resizeInst();
    const ctx = refs.iCtx;
    ctx.clearRect(0, 0, w, h);

    ctx.strokeStyle = 'rgba(255, 255, 255, 0.08)';
    ctx.lineWidth = 0.5;
    for (let x = 80; x < w; x += 80) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, h);
      ctx.stroke();
    }
    ctx.beginPath();
    ctx.moveTo(0, h * 0.44);
    ctx.lineTo(w, h * 0.44);
    ctx.stroke();

    const w0 = Math.max(0, 1 - Math.abs(instBlend - 0) * 2.1);
    const w1 = Math.max(0, 1 - Math.abs(instBlend - 1) * 2.1);
    const w2 = Math.max(0, 1 - Math.abs(instBlend - 2) * 2.1);

    if (w0 > 0.01) {
      ctx.save();
      ctx.globalAlpha = w0;
      const spanW = Math.min(w - 80, 680);
      const startX = (w - spanW) / 2;
      const baseY = h * 0.44;
      const activeIdx = reduced.matches ? 3 : ((t * 0.55) % 12);
      const seasonTags = ['雪', '雾', '樱', '春', '夏', '绿', '星', '山', '秋', '枫', '光', '雪'];

      ctx.font = '500 11px "PingFang SC", "Microsoft YaHei", sans-serif';
      ctx.textAlign = 'center';

      for (let m = 0; m < 12; m++) {
        const x = startX + (spanW / 11) * m;
        const dist = Math.min(Math.abs(activeIdx - m), 12 - Math.abs(activeIdx - m));
        const focus = clamp01(1 - dist / 1.45);
        const tickH = lerp(16, 52, focus);

        ctx.strokeStyle = focus > 0.25 ? `rgba(224, 195, 142, ${lerp(0.45, 1, focus)})` : 'rgba(245, 245, 247, 0.42)';
        ctx.lineWidth = focus > 0.25 ? 1.8 : 0.9;
        ctx.beginPath();
        ctx.moveTo(x, baseY - tickH);
        ctx.lineTo(x, baseY + 8);
        ctx.stroke();

        ctx.fillStyle = focus > 0.3 ? '#e0c38e' : 'rgba(245, 245, 247, 0.72)';
        ctx.fillText(String(m + 1).padStart(2, '0') + '月', x, baseY + 26);

        if (focus > 0.45) {
          ctx.fillStyle = 'rgba(224, 195, 142, 0.95)';
          ctx.fillText(seasonTags[m], x, baseY - tickH - 10);
        }

        if (m < 11) {
          for (let s = 1; s <= 3; s++) {
            const sx = x + ((spanW / 11) / 4) * s;
            ctx.strokeStyle = 'rgba(255, 255, 255, 0.16)';
            ctx.lineWidth = 0.5;
            ctx.beginPath();
            ctx.moveTo(sx, baseY - 6);
            ctx.lineTo(sx, baseY + 4);
            ctx.stroke();
          }
        }
      }
      ctx.restore();
    }

    if (w1 > 0.01) {
      ctx.save();
      ctx.globalAlpha = w1;
      const cx = w * 0.70;
      const cy = h * 0.48;
      const rad = Math.min(w, h) * 0.32;

      [1.0, 0.72].forEach((k) => {
        ctx.strokeStyle = 'rgba(245, 245, 247, 0.26)';
        ctx.lineWidth = 0.9;
        ctx.beginPath();
        ctx.arc(cx, cy, rad * k, 0, Math.PI * 2);
        ctx.stroke();
      });

      for (let a = 0; a < 36; a++) {
        const ang = (a * 10 * Math.PI) / 180;
        const inner = rad * (a % 9 === 0 ? 0.85 : 0.93);
        ctx.strokeStyle = a % 9 === 0 ? 'rgba(245, 245, 247, 0.65)' : 'rgba(255, 255, 255, 0.22)';
        ctx.lineWidth = a % 9 === 0 ? 1.2 : 0.6;
        ctx.beginPath();
        ctx.moveTo(cx + Math.cos(ang) * inner, cy + Math.sin(ang) * inner);
        ctx.lineTo(cx + Math.cos(ang) * rad, cy + Math.sin(ang) * rad);
        ctx.stroke();
      }

      ctx.font = '500 10px "PingFang SC", "Microsoft YaHei", sans-serif';
      ctx.fillStyle = 'rgba(245, 245, 247, 0.58)';
      ctx.textAlign = 'center';
      ctx.fillText('N', cx, cy - rad - 8);
      ctx.fillText('S', cx, cy + rad + 15);
      ctx.fillText('E', cx + rad + 12, cy + 3);
      ctx.fillText('W', cx - rad - 12, cy + 3);

      const sweep = reduced.matches ? -0.45 : (-0.9 + Math.sin(t * 0.45) * 0.65);
      const sx = cx + Math.cos(sweep) * rad;
      const sy = cy + Math.sin(sweep) * rad;

      ctx.strokeStyle = '#e0c38e';
      ctx.lineWidth = 1.4;
      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.lineTo(sx, sy);
      ctx.stroke();

      ctx.fillStyle = '#e0c38e';
      ctx.beginPath();
      ctx.arc(sx, sy, 4, 0, Math.PI * 2);
      ctx.fill();

      const deg = Math.round((((sweep * 180) / Math.PI) + 450) % 360);
      ctx.font = '500 11px "PingFang SC", "Microsoft YaHei", sans-serif';
      ctx.fillStyle = '#e0c38e';
      ctx.fillText(`黄金时刻 · AZIMUTH ${deg}°`, cx, cy + 4);
      ctx.restore();
    }

    if (w2 > 0.01) {
      ctx.save();
      ctx.globalAlpha = w2;
      const nodes = [
        { x: w * 0.46, y: h * 0.46, name: '北京 · BEIJING' },
        { x: w * 0.65, y: h * 0.24, name: '雷克雅未克 · REYKJAVIK' },
        { x: w * 0.84, y: h * 0.56, name: '皇后镇 · QUEENSTOWN' }
      ];

      ctx.font = '500 11px "PingFang SC", "Microsoft YaHei", sans-serif';
      for (let i = 0; i < nodes.length - 1; i++) {
        const p1 = nodes[i];
        const p2 = nodes[i + 1];
        const mx = (p1.x + p2.x) / 2;
        const my = Math.min(p1.y, p2.y) - 46;

        ctx.strokeStyle = 'rgba(224, 195, 142, 0.72)';
        ctx.lineWidth = 1.3;
        ctx.beginPath();
        ctx.moveTo(p1.x, p1.y);
        ctx.quadraticCurveTo(mx, my, p2.x, p2.y);
        ctx.stroke();
      }

      nodes.forEach((n) => {
        ctx.strokeStyle = 'rgba(245, 245, 247, 0.56)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.arc(n.x, n.y, 8, 0, Math.PI * 2);
        ctx.stroke();

        ctx.fillStyle = '#e0c38e';
        ctx.beginPath();
        ctx.arc(n.x, n.y, 2.8, 0, Math.PI * 2);
        ctx.fill();

        ctx.fillStyle = 'rgba(245, 245, 247, 0.86)';
        ctx.fillText(n.name, n.x - 16, n.y + 22);
      });
      ctx.restore();
    }
  }

  function tick(now) {
    if (!isOpen || !instNearViewport) {
      rafId = 0;
      return;
    }
    const t = reduced.matches ? 0 : now * 0.001;
    renderInstrument(t);
    rafId = requestAnimationFrame(tick);
  }

  function onKeydown(event) {
    if (!isOpen || isClosing) return;
    if (event.key === 'Escape') {
      event.preventDefault();
      event.stopPropagation();
      close('skip');
    } else if (event.key === 'ArrowDown' || event.key === 'PageDown') {
      event.preventDefault();
      goToSlide(activeSlideIdx + 1);
    } else if (event.key === 'ArrowUp' || event.key === 'PageUp') {
      event.preventDefault();
      goToSlide(activeSlideIdx - 1);
    } else if (event.key === 'Home') {
      event.preventDefault();
      goToSlide(0);
    } else if (event.key === 'End') {
      event.preventDefault();
      goToSlide(refs.slides.length - 1);
    } else if (event.key === ' ' && (!document.activeElement || document.activeElement.tagName !== 'BUTTON')) {
      event.preventDefault();
      goToSlide(activeSlideIdx + (event.shiftKey ? -1 : 1));
    }
  }

  function bindStageInputs() {
    document.addEventListener('keydown', onKeydown, true);
    root.addEventListener('wheel', onWheel, { passive: false });
    root.addEventListener('touchstart', onTouchStart, { passive: true });
    root.addEventListener('touchend', onTouchEnd, { passive: true });
  }

  function unbindStageInputs() {
    document.removeEventListener('keydown', onKeydown, true);
    root.removeEventListener('wheel', onWheel, { passive: false });
    root.removeEventListener('touchstart', onTouchStart, { passive: true });
    root.removeEventListener('touchend', onTouchEnd, { passive: true });
  }

  function open(opts = {}) {
    buildDom();
    if (isOpen && !isClosing) return;
    isClosing = false;
    isOpen = true;
    isReplayRun = Boolean(opts.isReplay);
    returnFocusEl = opts.isReplay ? document.activeElement : null;

    document.documentElement.dataset.introState = 'prologue';
    document.documentElement.dataset.introReason = '';
    root.classList.remove('k-ready', 'is-exiting');
    root.classList.add('is-entering');
    root.hidden = false;
    lockBackground();
    resizeInst();
    resetStage();

    if (global.CosmicIntro && typeof global.CosmicIntro.preload === 'function') {
      global.CosmicIntro.preload();
    }

    if (global.AmbientRadio && typeof global.AmbientRadio.pause === 'function') {
      global.AmbientRadio.pause(true);
    }

    if (!opts.keepBgm && global.CosmicBGM) {
      global.CosmicBGM.start(0.58);
    } else if (global.CosmicBGM && !global.CosmicBGM.isActive()) {
      global.CosmicBGM.start(0.58);
    }

    syncMuteUI();
    if (global.CosmicBGM && !bgmUnsub) {
      bgmUnsub = global.CosmicBGM.onChange(syncMuteUI);
    }

    bindStageInputs();

    requestAnimationFrame(() => {
      root.classList.remove('is-entering');
      document.documentElement.classList.remove('prologue-boot');
      requestAnimationFrame(() => {
        root.classList.add('k-ready');
        goToSlide(0, { force: true, instant: true });
      });
    });
  }

  function close(reason = 'skip') {
    if (!isOpen || isClosing) return;
    isClosing = true;
    unbindStageInputs();
    clearTransitionTimers();
    document.documentElement.classList.remove('prologue-boot');

    const canHandOffToFilm =
      reason === 'cta' &&
      !isReplayRun &&
      Boolean(global.CosmicIntro && global.CosmicIntro.isSupported());

    if (canHandOffToFilm) {
      if (global.IntroSession) global.IntroSession.requestFullscreen();
      if (global.CosmicBGM) {
        if (global.CosmicBGM.isBlocked() || global.CosmicBGM.isMuted()) {
          global.CosmicBGM.unmute();
        } else if (!global.CosmicBGM.isActive()) {
          global.CosmicBGM.start(0.58);
        }
      }

      isOpen = false;
      isClosing = false;
      instNearViewport = false;
      if (rafId) { cancelAnimationFrame(rafId); rafId = 0; }
      if (bgmUnsub) { bgmUnsub(); bgmUnsub = null; }
      unlockBackground();

      const filmStarted = global.CosmicIntro.play({
        isReplay: false,
        keepBgm: true,
        chainTour: true
      });
      if (filmStarted !== false) {
        setTimeout(() => {
          root.hidden = true;
          root.classList.remove('is-exiting', 'is-entering', 'k-ready');
          refs.slides.forEach((s) => s.classList.remove('is-leaving'));
        }, 120);
        return;
      }
      isOpen = true;
      isClosing = true;
      bindStageInputs();
    }

    const landing = !global.location || (!global.location.search && !global.location.hash);
    const shouldStartTour =
      !isReplayRun &&
      landing &&
      Boolean(global.OnboardingTour) &&
      (reason === 'cta' || (typeof global.OnboardingTour.hasSeen === 'function' ? !global.OnboardingTour.hasSeen() : true));

    if (global.CosmicBGM) {
      if (shouldStartTour) {
        global.CosmicBGM.duck(0.36, 700);
      } else {
        global.CosmicBGM.fadeOutAndStop(1600);
      }
    }

    const finalize = () => {
      isOpen = false;
      isClosing = false;
      instNearViewport = false;
      if (rafId) { cancelAnimationFrame(rafId); rafId = 0; }
      clearTransitionTimers();
      if (bgmUnsub) { bgmUnsub(); bgmUnsub = null; }
      root.hidden = true;
      root.classList.remove('is-exiting', 'is-entering', 'k-ready');
      refs.slides.forEach((s) => s.classList.remove('is-leaving'));
      unlockBackground();
      document.documentElement.dataset.introState = 'map';
      document.documentElement.dataset.introReason = reason;

      if (shouldStartTour && global.OnboardingTour) {
        global.OnboardingTour.start(false);
      } else if (returnFocusEl && typeof returnFocusEl.focus === 'function') {
        try { returnFocusEl.focus({ preventScroll: true }); } catch {}
      }
    };

    if (reduced.matches) {
      finalize();
    } else {
      root.classList.add('is-exiting');
      setTimeout(finalize, 480);
    }
  }

  // Wire replay entry inside Appearance popover once DOM is ready
  const wireReplayBtn = () => {
    const btn = document.getElementById('prologue-replay-btn');
    if (btn && !btn.dataset.spBound) {
      btn.dataset.spBound = '1';
      btn.addEventListener('click', () => {
        const pop = document.getElementById('appearance-popover');
        if (pop) pop.classList.add('is-hidden');
        const apBtn = document.getElementById('appearance-btn');
        if (apBtn) apBtn.setAttribute('aria-expanded', 'false');
        open({ isReplay: true, keepBgm: false });
      });
    }
  };
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', wireReplayBtn);
  } else {
    wireReplayBtn();
  }

  global.StoryPrologue = {
    open,
    close,
    isOpen: () => isOpen
  };
})(window);
