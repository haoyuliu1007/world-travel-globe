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
  let returnFocusEl = null;
  let bgmUnsub = null;
  let revealObserver = null;
  let countObserver = null;
  let navRaf = 0;
  const inertNodes = new Set();

  let refs = {};

  function buildDom() {
    if (built) return;
    built = true;

    root.innerHTML = `
      <div class="sp-hairline" id="sp-hairline" aria-hidden="true"></div>

      <header class="sp-nav" id="sp-nav">
        <div class="sp-nav-inner">
          <div class="sp-brand">
            <span class="sp-brand-dot" aria-hidden="true"></span>
            <span>World Travel Globe</span>
          </div>
          <nav class="sp-nav-links" aria-label="序章章节">
            <button class="sp-nav-link" type="button" data-scroll-target="#sp-act-chapters">探索缘起</button>
            <button class="sp-nav-link" type="button" data-scroll-target="#sp-act-instrument">天文仪器</button>
            <button class="sp-nav-link" type="button" data-scroll-target="#sp-act-finale">即刻出发</button>
          </nav>
          <div class="sp-top-controls">
            <button class="sp-pill-btn sp-mute-btn" id="sp-mute" type="button" aria-label="静音">🔊</button>
            <button class="sp-pill-btn" id="sp-skip" type="button">跳过，进入地球仪 <kbd style="opacity:.65;font-size:11px;margin-left:3px;">Esc</kbd></button>
          </div>
        </div>
      </header>

      <section class="sp-hero" id="sp-act-hero">
        <img class="sp-hero-photo" src="assets/prologue/scene-1-origin.jpg?v=1" alt="" />
        <div class="sp-hero-grid" aria-hidden="true"></div>
        <div class="sp-hero-glow" aria-hidden="true"></div>

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
            <button class="sp-btn-primary" id="sp-hero-enter-btn" type="button">
              <span>进入 3D 地球仪</span>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M5 12h14M13 5l7 7-7 7"/></svg>
            </button>
            <button class="sp-btn-ghost" id="sp-hero-explore-btn" type="button">
              <span>向下阅读序章</span>
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 5v14M5 12l7 7 7-7"/></svg>
            </button>
          </div>
        </div>
      </section>

      <div class="sp-metrics-wrap" id="sp-metrics">
        <div class="sp-metrics-bar sp-reveal" style="--sp-delay: 120ms;">
          <div class="sp-metric-cell">
            <div class="sp-metric-val" data-count="137">0</div>
            <div class="sp-metric-name">国家与地区</div>
          </div>
          <div class="sp-metric-cell">
            <div class="sp-metric-val" data-count="722">0</div>
            <div class="sp-metric-name">精选目的地</div>
          </div>
          <div class="sp-metric-cell">
            <div class="sp-metric-val is-accent" data-count="5414">0</div>
            <div class="sp-metric-name">真实摄影机位</div>
          </div>
        </div>
      </div>

      <section class="sp-section" id="sp-act-chapters">
        <div class="sp-container">
          <div class="sp-section-head">
            <div class="sp-kicker sp-reveal" style="--sp-delay: 0ms;">Living Planetary Atlas</div>
            <h2 class="sp-section-title sp-reveal" style="--sp-delay: 60ms;">
              <span class="sp-phrase">不是碎片化的攻略清单，</span><br />
              <span class="sp-phrase sp-accent-grad">而是一整颗呼吸着的星球。</span>
            </h2>
            <p class="sp-section-sub sp-reveal" style="--sp-delay: 120ms;">
              <span class="sp-phrase">洪堡在《宇宙》中写下：</span><span class="sp-phrase">海拔、洋流、花期与光影从未孤立。</span>
              <span class="sp-phrase">当你真正认识一处坐标，</span><span class="sp-phrase">冷冰冰的“空间”，才成了“地方”。</span>
            </p>
          </div>

          <div class="sp-bento">
            <article class="sp-card sp-card--wide sp-reveal" style="--sp-delay: 40ms;">
              <img class="sp-card-bg" src="assets/prologue/scene-3-earth.jpg?v=1" alt="" />
              <div class="sp-card-scrim" aria-hidden="true"></div>
              <div class="sp-card-body">
                <div class="sp-card-era">1845 · Alexander von Humboldt · Kosmos</div>
                <h3 class="sp-card-title">
                  <span class="sp-phrase">自然，是一张千万丝线</span><span class="sp-phrase">织成的网。</span>
                </h3>
                <p class="sp-card-desc">
                  <span class="sp-phrase">在碎片攻略的时代，地球被切成了互不相干的打卡点。</span>
                  <span class="sp-phrase">我们把真实卫星地形、十二个月物候规律与太阳光影，</span><span class="sp-phrase">重新缝合回同一颗连续转动的 3D 球体。</span>
                </p>
              </div>
              <div class="sp-card-visual">
                <img src="assets/prologue/scene-3-earth.jpg?v=1" alt="从轨道回望地球晨昏线" />
              </div>
            </article>

            <article class="sp-card sp-reveal" style="--sp-delay: 80ms;">
              <img class="sp-card-bg" src="assets/prologue/scene-1-origin.jpg?v=1" alt="" />
              <div class="sp-card-scrim" aria-hidden="true"></div>
              <div class="sp-card-body">
                <div class="sp-card-era">c. 1600 BCE · Nebra Sky Disc</div>
                <h3 class="sp-card-title">
                  <span class="sp-phrase">三千六百年前，人类第一次</span><span class="sp-phrase">把星空与季节刻上青铜。</span>
                </h3>
                <p class="sp-card-desc">
                  <span class="sp-phrase">只为读懂风向、物候，与出发的准确时刻。</span>
                </p>
              </div>
            </article>

            <article class="sp-card sp-reveal" style="--sp-delay: 140ms;">
              <img class="sp-card-bg" src="assets/prologue/scene-2-astrolabe.jpg?v=1" alt="" style="object-position: right center;" />
              <div class="sp-card-scrim" aria-hidden="true"></div>
              <div class="sp-card-body">
                <div class="sp-card-era">c. 240 BCE · Eratosthenes</div>
                <h3 class="sp-card-title">
                  <span class="sp-phrase">两千年前，仅凭正午 7.2° 树影，</span><span class="sp-phrase">便算出整颗星球的周长。</span>
                </h3>
                <p class="sp-card-desc">
                  <span class="sp-phrase">人类第一次确信：脚下并非无尽平面，而是一颗完整的球。</span>
                </p>
              </div>
            </article>

            <article class="sp-card sp-reveal" style="--sp-delay: 100ms;">
              <div class="sp-card-body">
                <div class="sp-card-era">1987 · Frank White · The Overview Effect</div>
                <h3 class="sp-card-title">
                  <span class="sp-phrase">直到飞离大气层回望，</span><span class="sp-phrase">地图上的国界才第一次消失。</span>
                </h3>
                <p class="sp-card-desc">
                  <span class="sp-phrase">宇航哲学称之为「总观效应」——万物共享同一道晨昏线。</span>
                </p>
              </div>
            </article>

            <article class="sp-card sp-reveal" style="--sp-delay: 160ms;">
              <div class="sp-card-body">
                <div class="sp-card-era">1977 · Yi-Fu Tuan · Space &amp; Place</div>
                <h3 class="sp-card-title">
                  <span class="sp-phrase">当你真正认识一处坐标，</span><span class="sp-phrase">冷冰冰的“空间”，才成了“地方”。</span>
                </h3>
                <p class="sp-card-desc">
                  <span class="sp-phrase">这正是我们造这颗 3D 地球仪的起点。</span>
                </p>
              </div>
            </article>
          </div>
        </div>
      </section>

      <section class="sp-section sp-section--soft" id="sp-act-instrument">
        <div class="sp-container">
          <div class="sp-section-head">
            <div class="sp-kicker sp-reveal" style="--sp-delay: 0ms;">Precision Instrument</div>
            <h2 class="sp-section-title sp-reveal" style="--sp-delay: 60ms;">
              <span class="sp-phrase">以天文仪器的精度，</span><span class="sp-phrase sp-accent-grad">丈量下一次出发。</span>
            </h2>
          </div>

          <div class="sp-inst-shell sp-reveal" style="--sp-delay: 120ms;">
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

      <section class="sp-finale" id="sp-act-finale">
        <img class="sp-finale-bg" src="assets/prologue/scene-4-dawn.jpg?v=1" alt="" />
        <div class="sp-finale-scrim" aria-hidden="true"></div>
        <div class="sp-finale-inner">
          <div class="sp-kicker sp-reveal" style="--sp-delay: 0ms;">Ready for Departure</div>
          <h2 class="sp-finale-title sp-reveal" style="--sp-delay: 70ms;">
            <span class="sp-phrase">出发之前，</span><span class="sp-phrase sp-accent-grad">先与世界相遇。</span>
          </h2>
          <div class="sp-finale-sub sp-reveal" style="--sp-delay: 130ms;">137 国 · 722 城 · 5,414 处光影坐标</div>
          <div class="sp-reveal" style="--sp-delay: 190ms;">
            <button class="sp-btn-primary" id="sp-enter-btn" type="button">
              <span>进入 3D 地球仪</span>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M5 12h14M13 5l7 7-7 7"/></svg>
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
      nav: root.querySelector('#sp-nav'),
      muteBtn: root.querySelector('#sp-mute'),
      skipBtn: root.querySelector('#sp-skip'),
      heroEnterBtn: root.querySelector('#sp-hero-enter-btn'),
      heroExploreBtn: root.querySelector('#sp-hero-explore-btn'),
      enterBtn: root.querySelector('#sp-enter-btn'),
      instCanvas: root.querySelector('#sp-inst-canvas'),
      iCtx: root.querySelector('#sp-inst-canvas').getContext('2d'),
      tabs: Array.from(root.querySelectorAll('.sp-tab')),
      caps: Array.from(root.querySelectorAll('.sp-cap')),
      navLinks: Array.from(root.querySelectorAll('.sp-nav-link')),
      reveals: Array.from(root.querySelectorAll('.sp-reveal')),
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

    refs.navLinks.forEach((btn) => {
      btn.addEventListener('click', () => {
        const target = root.querySelector(btn.dataset.scrollTarget);
        if (target) target.scrollIntoView({ behavior: reduced.matches ? 'auto' : 'smooth', block: 'start' });
      });
    });

    refs.heroExploreBtn.addEventListener('click', () => {
      const metrics = root.querySelector('#sp-metrics');
      if (metrics) metrics.scrollIntoView({ behavior: reduced.matches ? 'auto' : 'smooth', block: 'center' });
    });

    refs.skipBtn.addEventListener('click', () => close('skip'));
    refs.heroEnterBtn.addEventListener('click', () => close('cta'));
    refs.enterBtn.addEventListener('click', () => close('cta'));
    refs.muteBtn.addEventListener('click', () => {
      if (global.CosmicBGM) global.CosmicBGM.toggleMute();
    });

    root.addEventListener('scroll', onScroll, { passive: true });
    global.addEventListener('resize', () => {
      if (isOpen) resizeInst();
    });
  }

  function revealVisibleInViewport() {
    if (!isOpen) return;
    const h = root.clientHeight || global.innerHeight || 900;
    refs.reveals.forEach((el) => {
      if (el.classList.contains('is-visible')) return;
      const r = el.getBoundingClientRect();
      if (r.top < h * 1.05 && r.bottom > -40) {
        el.classList.add('is-visible');
        if (revealObserver) revealObserver.unobserve(el);
      }
    });
    refs.counters.forEach((el) => {
      if (el.dataset.counted === '1') return;
      const r = el.getBoundingClientRect();
      if (r.top < h * 1.02 && r.bottom > 0) {
        animateCount(el);
        if (countObserver) countObserver.unobserve(el);
      }
    });
  }

  function onScroll() {
    if (!isOpen || navRaf) return;
    navRaf = requestAnimationFrame(() => {
      navRaf = 0;
      const y = root.scrollTop;
      const maxS = Math.max(1, root.scrollHeight - root.clientHeight);
      if (refs.hairline) {
        refs.hairline.style.transform = `scaleX(${clamp01(y / maxS).toFixed(4)})`;
      }
      if (refs.nav) {
        refs.nav.classList.toggle('is-scrolled', y > 8);
      }
      revealVisibleInViewport();
    });
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

  function setupObservers() {
    teardownObservers();

    if (reduced.matches || typeof IntersectionObserver === 'undefined') {
      refs.reveals.forEach((el) => el.classList.add('is-visible'));
      refs.counters.forEach((el) => animateCount(el));
      return;
    }

    refs.reveals.forEach((el) => el.classList.remove('is-visible'));
    refs.counters.forEach((el) => {
      el.dataset.counted = '0';
      el.textContent = '0';
    });

    revealObserver = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            entry.target.classList.add('is-visible');
            revealObserver.unobserve(entry.target);
          }
        });
      },
      { root, threshold: 0.12, rootMargin: '0px 0px -30px 0px' }
    );
    refs.reveals.forEach((el) => revealObserver.observe(el));

    countObserver = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            animateCount(entry.target);
            countObserver.unobserve(entry.target);
          }
        });
      },
      { root, threshold: 0.65 }
    );
    refs.counters.forEach((el) => countObserver.observe(el));
  }

  function teardownObservers() {
    if (revealObserver) {
      revealObserver.disconnect();
      revealObserver = null;
    }
    if (countObserver) {
      countObserver.disconnect();
      countObserver = null;
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
      if (node !== root && node.tagName !== 'SCRIPT' && !node.inert) {
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
    instBlend += (activeInst - instBlend) * (reduced.matches ? 1 : 0.12);
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

    const w0 = Math.max(0, 1 - Math.abs(instBlend - 0));
    const w1 = Math.max(0, 1 - Math.abs(instBlend - 1));
    const w2 = Math.max(0, 1 - Math.abs(instBlend - 2));

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
    if (!isOpen) {
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
      close('escape');
    }
  }

  function shouldChainTour(reason) {
    if (isReplayRun) return false;
    if (global.location && (global.location.search || global.location.hash)) return false;
    if (!global.OnboardingTour) return false;
    if (reason === 'cta') return true;
    return typeof global.OnboardingTour.hasSeen === 'function' ? !global.OnboardingTour.hasSeen() : true;
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
    root.scrollTop = 0;
    if (refs.hairline) refs.hairline.style.transform = 'scaleX(0)';
    if (refs.nav) refs.nav.classList.remove('is-scrolled');
    lockBackground();
    resizeInst();
    setupObservers();

    if (!opts.keepBgm && global.CosmicBGM) {
      global.CosmicBGM.start(0.58);
    } else if (global.CosmicBGM && !global.CosmicBGM.isActive()) {
      global.CosmicBGM.start(0.58);
    }

    syncMuteUI();
    if (global.CosmicBGM && !bgmUnsub) {
      bgmUnsub = global.CosmicBGM.onChange(syncMuteUI);
    }

    document.addEventListener('keydown', onKeydown, true);

    requestAnimationFrame(() => {
      root.classList.remove('is-entering');
      requestAnimationFrame(() => {
        root.classList.add('k-ready');
        revealVisibleInViewport();
      });
    });

    if (!rafId) rafId = requestAnimationFrame(tick);
  }

  function close(reason = 'done') {
    if (!isOpen || isClosing) return;
    isClosing = true;
    document.removeEventListener('keydown', onKeydown, true);

    const willRunTour = shouldChainTour(reason);
    if (global.CosmicBGM) {
      if (willRunTour) {
        global.CosmicBGM.duck(0.36, 700);
      } else {
        global.CosmicBGM.fadeOutAndStop(1600);
      }
    }

    const finalize = () => {
      isOpen = false;
      isClosing = false;
      if (rafId) {
        cancelAnimationFrame(rafId);
        rafId = 0;
      }
      if (navRaf) {
        cancelAnimationFrame(navRaf);
        navRaf = 0;
      }
      teardownObservers();
      if (bgmUnsub) {
        bgmUnsub();
        bgmUnsub = null;
      }
      root.hidden = true;
      root.classList.remove('is-exiting', 'is-entering', 'k-ready');
      unlockBackground();
      document.documentElement.dataset.introState = 'map';
      document.documentElement.dataset.introReason = reason;

      if (willRunTour && global.OnboardingTour) {
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
