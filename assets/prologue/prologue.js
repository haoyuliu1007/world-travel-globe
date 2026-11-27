'use strict';

(function (global) {
  const root = document.getElementById('story-prologue');
  if (!root) return;

  const TOUR_SEEN_KEY = 'wtg_onboarding_v1_seen';
  const reduced = matchMedia('(prefers-reduced-motion: reduce)');
  const clamp01 = (v) => Math.max(0, Math.min(1, v));
  const lerp = (a, b, t) => a + (b - a) * t;
  const smoothstep = (e0, e1, x) => {
    const t = clamp01((x - e0) / (e1 - e0));
    return t * t * (3 - 2 * t);
  };

  let built = false;
  let isOpen = false;
  let isClosing = false;
  let isReplayRun = false;
  let rafId = 0;
  let smoothY = 0;
  let activeInst = 0;
  let instBlend = 0;
  let returnFocusEl = null;
  let bgmUnsub = null;
  const inertNodes = new Set();

  let refs = {};
  let heroChars = [];

  function buildDom() {
    if (built) return;
    built = true;

    root.innerHTML = `
      <div class="sp-grain" aria-hidden="true"></div>
      <div class="sp-hairline" id="sp-hairline"></div>
      <div class="sp-top-controls">
        <button class="sp-pill-btn sp-mute-btn" id="sp-mute" type="button" aria-label="静音">🔊</button>
        <button class="sp-pill-btn" id="sp-skip" type="button">跳过，进入地球仪 <kbd style="opacity:.65;font-size:11px;margin-left:3px;">Esc</kbd></button>
      </div>

      <section class="sp-hero" id="sp-act-hero">
        <img class="sp-photo" id="sp-hero-photo" src="assets/prologue/scene-1-origin.jpg?v=1" alt="" style="filter: brightness(1.18) contrast(1.05);" />
        <div class="sp-vignette-hero" aria-hidden="true"></div>
        <div class="sp-hero-copy" id="sp-hero-copy">
          <div class="sp-kicker sp-kicker-anim">World Travel Globe</div>
          <h1 class="sp-hero-title" id="sp-hero-title">世界，不止于平面。</h1>
        </div>
        <div class="sp-cue" id="sp-hero-cue" aria-hidden="true">
          <div class="sp-cue-line"></div>
          <span>向下轻滑</span>
        </div>
      </section>

      <section class="sp-manifesto" id="sp-act-manifesto">
        <div class="sp-manifesto-sticky">
          <div class="sp-manifesto-bg" aria-hidden="true">
            <img class="sp-photo" id="sp-bg-origin" src="assets/prologue/scene-1-origin.jpg?v=1" alt="" style="filter: brightness(1.12) contrast(1.04);" />
            <img class="sp-photo" id="sp-bg-astrolabe" src="assets/prologue/scene-2-astrolabe.jpg?v=1" alt="" style="object-position: right center; filter: brightness(1.16) contrast(1.04);" />
            <img class="sp-photo" id="sp-bg-earth-dim" src="assets/prologue/scene-3-earth.jpg?v=1" alt="" style="filter: brightness(0.92);" />
            <div class="sp-manifesto-scrim"></div>
          </div>

          <div class="sp-breath-frame">
            <div class="sp-breath-slide" data-breath="0">
              <div class="sp-kicker">c. 1600 BCE · Nebra Sky Disc</div>
              <div class="sp-breath-text sp-sheen">三千六百年前，人类第一次把星空与季节刻上青铜。</div>
              <div class="sp-breath-rule"></div>
              <div class="sp-breath-sub">只为读懂风向、物候，与出发的时刻</div>
            </div>

            <div class="sp-breath-slide" data-breath="1">
              <div class="sp-kicker">c. 240 BCE · Eratosthenes</div>
              <div class="sp-breath-text sp-sheen">两千年前，仅凭正午 7.2° 的树影，便算出整颗星球的周长。</div>
              <div class="sp-breath-rule"></div>
              <div class="sp-breath-sub">人类第一次确信：脚下并非无尽平面，而是一颗完整的球</div>
            </div>

            <div class="sp-breath-slide" data-breath="2">
              <div class="sp-kicker">1987 · The Overview Effect</div>
              <div class="sp-breath-text sp-sheen">直到飞离大气层回望，地图上的国界才第一次消失。</div>
              <div class="sp-breath-rule"></div>
              <div class="sp-breath-sub">宇航哲学称之为「总观效应」——万物共享同一道晨昏</div>
            </div>

            <div class="sp-breath-slide" data-breath="3">
              <div class="sp-kicker">1977 · Yi-Fu Tuan · Space &amp; Place</div>
              <div class="sp-breath-text sp-sheen">当你真正认识一处坐标，冷冰冰的“空间”，才成了“地方”。</div>
              <div class="sp-breath-rule"></div>
              <div class="sp-breath-sub">这正是我们造这颗地球仪的起点</div>
            </div>
          </div>
        </div>
      </section>

      <section class="sp-earth" id="sp-act-earth">
        <div class="sp-earth-sticky">
          <div class="sp-earth-photo-wrap" aria-hidden="true">
            <img class="sp-earth-photo" id="sp-earth-photo" src="assets/prologue/scene-3-earth.jpg?v=1" alt="" />
            <div class="sp-earth-scrim"></div>
          </div>

          <div class="sp-earth-moment" id="sp-moment-a">
            <div class="sp-kicker">1845 · Alexander von Humboldt</div>
            <h2 class="sp-earth-headline sp-sheen" id="sp-earth-headline">自然，是一张千万丝线<br />织成的网。</h2>
            <p class="sp-earth-lead">
              洪堡在《宇宙》中写下：海拔、洋流、花期与光影从未孤立。只是在碎片攻略的时代，一整颗活的星球被切成了互不相干的清单。
            </p>
          </div>

          <div class="sp-earth-moment" id="sp-moment-b" style="opacity: 0;">
            <div class="sp-kicker" style="margin-bottom: 18px;">Living Planetary Atlas</div>
            <div class="sp-monolith-box">
              <div class="sp-rule-top" id="sp-rule-top"></div>
              <div class="sp-monolith-metrics">
                <div class="sp-metric-cell">
                  <div class="sp-metric-val" id="sp-num-countries">137</div>
                  <div class="sp-metric-name">国家与地区</div>
                </div>
                <div class="sp-metric-cell">
                  <div class="sp-metric-val" id="sp-num-cities">722</div>
                  <div class="sp-metric-name">精选目的地</div>
                </div>
                <div class="sp-metric-cell">
                  <div class="sp-metric-val champagne" id="sp-num-spots">5,414</div>
                  <div class="sp-metric-name">真实摄影机位</div>
                </div>
              </div>
              <div class="sp-rule-bot" id="sp-rule-bot"></div>
            </div>
            <p class="sp-earth-lead">
              我们把整颗地球的地形尺度、十二个月物候与太阳光线，重新交还到你的掌心。
            </p>
          </div>
        </div>
      </section>

      <section class="sp-instrument" id="sp-act-instrument">
        <div class="sp-inst-head">
          <div class="sp-kicker">Precision Instrument</div>
          <h2 class="sp-inst-title sp-sheen" id="sp-inst-title">以天文仪器的精度，丈量下一次出发。</h2>
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

        <div class="sp-tabs" role="tablist" aria-label="核心仪器能力">
          <button class="sp-tab active" data-inst="0" role="tab" aria-selected="true" type="button">物候刻度</button>
          <button class="sp-tab" data-inst="1" role="tab" aria-selected="false" type="button">日照星盘</button>
          <button class="sp-tab" data-inst="2" role="tab" aria-selected="false" type="button">环球航迹</button>
        </div>
      </section>

      <section class="sp-finale" id="sp-act-finale">
        <img class="sp-finale-bg" src="assets/prologue/scene-4-dawn.jpg?v=1" alt="" />
        <div class="sp-finale-scrim" aria-hidden="true"></div>
        <div class="sp-finale-inner">
          <div class="sp-kicker" style="margin-bottom: 16px;">Ready for Departure</div>
          <h2 class="sp-finale-title sp-sheen" id="sp-finale-title">出发之前，先与世界相遇。</h2>
          <div class="sp-finale-sub">137 国 · 722 城 · 5,414 处光影坐标</div>
          <button class="sp-cta" id="sp-enter-btn" type="button">
            <span>进入 3D 地球仪</span>
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M5 12h14M13 5l7 7-7 7"/></svg>
          </button>

          <div class="sp-footnotes">
            Nebra Sky Disc (c. 1600 BCE) · Eratosthenes (c. 240 BCE) · Alexander von Humboldt《Kosmos》(1845) · Yi-Fu Tuan《Space and Place》(1977) · Frank White《The Overview Effect》(1987)
          </div>
        </div>
      </section>
    `;

    // Split Hero Title into masked kinetic characters
    const titleEl = root.querySelector('#sp-hero-title');
    const txt = titleEl.textContent.trim();
    titleEl.textContent = '';
    heroChars = [];
    Array.from(txt).forEach((ch, idx) => {
      const mask = document.createElement('span');
      mask.className = 'sp-mask';
      const span = document.createElement('span');
      span.className = 'sp-char sp-sheen';
      span.textContent = ch;
      span.style.transitionDelay = `${100 + idx * 46}ms`;
      mask.appendChild(span);
      titleEl.appendChild(mask);
      heroChars.push(span);
    });

    refs = {
      hairline: root.querySelector('#sp-hairline'),
      muteBtn: root.querySelector('#sp-mute'),
      skipBtn: root.querySelector('#sp-skip'),
      enterBtn: root.querySelector('#sp-enter-btn'),
      heroAct: root.querySelector('#sp-act-hero'),
      heroPhoto: root.querySelector('#sp-hero-photo'),
      heroCopy: root.querySelector('#sp-hero-copy'),
      heroCue: root.querySelector('#sp-hero-cue'),
      manifestoAct: root.querySelector('#sp-act-manifesto'),
      breaths: Array.from(root.querySelectorAll('.sp-breath-slide')),
      bgOrigin: root.querySelector('#sp-bg-origin'),
      bgAstrolabe: root.querySelector('#sp-bg-astrolabe'),
      bgEarthDim: root.querySelector('#sp-bg-earth-dim'),
      earthAct: root.querySelector('#sp-act-earth'),
      earthPhoto: root.querySelector('#sp-earth-photo'),
      earthHeadline: root.querySelector('#sp-earth-headline'),
      momentA: root.querySelector('#sp-moment-a'),
      momentB: root.querySelector('#sp-moment-b'),
      ruleTop: root.querySelector('#sp-rule-top'),
      ruleBot: root.querySelector('#sp-rule-bot'),
      numCountries: root.querySelector('#sp-num-countries'),
      numCities: root.querySelector('#sp-num-cities'),
      numSpots: root.querySelector('#sp-num-spots'),
      instTitle: root.querySelector('#sp-inst-title'),
      finaleTitle: root.querySelector('#sp-finale-title'),
      instCanvas: root.querySelector('#sp-inst-canvas'),
      iCtx: root.querySelector('#sp-inst-canvas').getContext('2d'),
      tabs: Array.from(root.querySelectorAll('.sp-tab')),
      caps: Array.from(root.querySelectorAll('.sp-cap'))
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

    refs.skipBtn.addEventListener('click', () => close('skip'));
    refs.enterBtn.addEventListener('click', () => close('cta'));
    refs.muteBtn.addEventListener('click', () => {
      if (global.CosmicBGM) global.CosmicBGM.toggleMute();
    });

    global.addEventListener('resize', () => {
      if (isOpen) resizeInst();
    });
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

  function sectionProgress(el, y) {
    const top = el.offsetTop;
    const span = Math.max(1, el.offsetHeight - root.clientHeight);
    return clamp01((y - top) / span);
  }

  function breathCurve(p, start, peakStart, peakEnd, end) {
    const fadeIn = start === peakStart ? 1 : smoothstep(start, peakStart, p);
    const fadeOut = 1 - smoothstep(peakEnd, end, p);
    return fadeIn * fadeOut;
  }

  function updateHero(t, y) {
    const p = clamp01(y / Math.max(1, refs.heroAct.offsetHeight));
    refs.heroPhoto.style.transform = `scale(${lerp(1.06, 1.0, p).toFixed(4)}) translate3d(0, ${(-p * 18).toFixed(1)}px, 0)`;
    refs.heroPhoto.style.opacity = String(lerp(1.0, 0.42, p).toFixed(3));
    const copyOp = clamp01(1 - p * 1.5);
    refs.heroCopy.style.opacity = copyOp.toFixed(3);
    refs.heroCopy.style.transform = `translate3d(0, ${(-p * 34).toFixed(1)}px, 0)`;
    refs.heroCue.style.opacity = clamp01(1 - p * 3.2).toFixed(3);

    const sheenPos = reduced.matches ? 50 : ((18 + Math.sin(t * 0.45) * 28 + p * 60) % 100);
    heroChars.forEach((ch, idx) => {
      ch.style.setProperty('--sheen-pos', `${(sheenPos + idx * 3).toFixed(1)}%`);
    });
  }

  function updateManifesto(y) {
    const p = sectionProgress(refs.manifestoAct, y);
    const ranges = [
      [0.00, 0.00, 0.21, 0.28],
      [0.24, 0.31, 0.46, 0.53],
      [0.49, 0.56, 0.71, 0.78],
      [0.74, 0.81, 0.94, 1.00]
    ];

    refs.breaths.forEach((el, i) => {
      const [s, ps, pe, e] = ranges[i];
      const op = breathCurve(p, s, ps, pe, e);
      const localT = clamp01((p - s) / Math.max(0.001, e - s));
      const scale = lerp(0.985, 1.015, localT);
      const blurPx = reduced.matches ? 0 : (1 - op) * 8;

      el.style.opacity = op.toFixed(3);
      el.style.transform = `translate3d(0, ${((1 - op) * 10).toFixed(1)}px, 0) scale(${scale.toFixed(4)})`;
      el.style.filter = `blur(${blurPx.toFixed(2)}px)`;

      const lineEl = el.querySelector('.sp-breath-text');
      const ruleEl = el.querySelector('.sp-breath-rule');
      if (!reduced.matches) {
        lineEl.style.letterSpacing = `calc(-0.03em + ${(lerp(0.075, 0, op)).toFixed(4)}em)`;
      }
      lineEl.style.setProperty('--sheen-pos', `${lerp(15, 88, localT).toFixed(1)}%`);
      ruleEl.style.transform = `scaleX(${op.toFixed(3)})`;
      ruleEl.style.opacity = op.toFixed(3);
    });

    const originOp = (1 - smoothstep(0.22, 0.34, p)) * 0.76;
    const astroOp = breathCurve(p, 0.20, 0.32, 0.54, 0.64) * 0.90;
    const earthOp = smoothstep(0.48, 0.60, p) * 0.72;

    refs.bgOrigin.style.opacity = originOp.toFixed(3);
    refs.bgOrigin.style.transform = `scale(${lerp(1.04, 1.0, p).toFixed(4)})`;
    refs.bgAstrolabe.style.opacity = astroOp.toFixed(3);
    refs.bgAstrolabe.style.transform = `scale(${lerp(1.06, 1.0, p).toFixed(4)})`;
    refs.bgEarthDim.style.opacity = earthOp.toFixed(3);
  }

  function updateEarth(y) {
    const p = sectionProgress(refs.earthAct, y);
    const scale = lerp(1.12, 1.0, p);
    const shiftX = lerp(11, 7, p);
    refs.earthPhoto.style.transform = `translate3d(${shiftX.toFixed(2)}%, ${lerp(3, -2, p).toFixed(2)}%, 0) scale(${scale.toFixed(4)})`;
    refs.earthPhoto.style.opacity = lerp(0.88, 1.0, smoothstep(0.0, 0.25, p)).toFixed(3);

    const aOp = breathCurve(p, 0.00, 0.00, 0.38, 0.48);
    refs.momentA.style.opacity = aOp.toFixed(3);
    refs.momentA.style.transform = `translate3d(0, ${lerp(0, -10, clamp01(p / 0.5)).toFixed(1)}px, 0)`;
    refs.momentA.style.filter = `blur(${(reduced.matches ? 0 : (1 - aOp) * 5).toFixed(2)}px)`;
    refs.earthHeadline.style.setProperty('--sheen-pos', `${lerp(20, 82, clamp01(p / 0.48)).toFixed(1)}%`);

    const bOp = breathCurve(p, 0.48, 0.60, 0.92, 1.00);
    refs.momentB.style.opacity = bOp.toFixed(3);
    refs.momentB.style.transform = `translate3d(0, ${lerp(22, 0, smoothstep(0.48, 0.62, p)).toFixed(1)}px, 0)`;
    refs.momentB.style.filter = `blur(${(reduced.matches ? 0 : (1 - bOp) * 5).toFixed(2)}px)`;

    const countT = smoothstep(0.49, 0.72, p);
    const ruleT = smoothstep(0.48, 0.66, p);
    refs.ruleTop.style.transform = `scaleX(${ruleT.toFixed(3)})`;
    refs.ruleBot.style.transform = `scaleX(${ruleT.toFixed(3)})`;

    const cVal = Math.round(137 * (reduced.matches ? 1 : countT));
    const cityVal = Math.round(722 * (reduced.matches ? 1 : countT));
    const spotVal = Math.round(5414 * (reduced.matches ? 1 : countT));
    refs.numCountries.textContent = String(cVal);
    refs.numCities.textContent = String(cityVal);
    refs.numSpots.textContent = spotVal.toLocaleString('en-US');
  }

  function renderInstrument(t) {
    instBlend += (activeInst - instBlend) * (reduced.matches ? 1 : 0.09);
    const { w, h } = resizeInst();
    const ctx = refs.iCtx;
    ctx.clearRect(0, 0, w, h);

    ctx.strokeStyle = 'rgba(255, 255, 255, 0.09)';
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

      ctx.font = '400 11px "Noto Sans SC", sans-serif';
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

      ctx.font = '400 10px "Noto Sans SC", sans-serif';
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
      ctx.font = '400 11px "Noto Sans SC", sans-serif';
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

      ctx.font = '400 11px "Noto Sans SC", sans-serif';
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
    const targetY = root.scrollTop;
    smoothY = reduced.matches ? targetY : lerp(smoothY, targetY, 0.09);

    const maxS = Math.max(1, root.scrollHeight - root.clientHeight);
    refs.hairline.style.transform = `scaleX(${clamp01(smoothY / maxS).toFixed(4)})`;

    updateHero(t, smoothY);
    updateManifesto(smoothY);
    updateEarth(smoothY);
    renderInstrument(t);

    const ambientSheen = reduced.matches ? 50 : (20 + (Math.sin(t * 0.55) * 0.5 + 0.5) * 60);
    refs.instTitle.style.setProperty('--sheen-pos', `${ambientSheen.toFixed(1)}%`);
    refs.finaleTitle.style.setProperty('--sheen-pos', `${(100 - ambientSheen).toFixed(1)}%`);

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

  function shouldChainTour() {
    if (isReplayRun) return false;
    if (global.location && (global.location.search || global.location.hash)) return false;
    try {
      return global.localStorage.getItem(TOUR_SEEN_KEY) !== '1';
    } catch {
      return false;
    }
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
    smoothY = 0;
    lockBackground();
    resizeInst();

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
      requestAnimationFrame(() => root.classList.add('k-ready'));
    });

    if (!rafId) rafId = requestAnimationFrame(tick);
  }

  function close(reason = 'done') {
    if (!isOpen || isClosing) return;
    isClosing = true;
    document.removeEventListener('keydown', onKeydown, true);

    const willRunTour = shouldChainTour() && Boolean(global.OnboardingTour);
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
      if (bgmUnsub) {
        bgmUnsub();
        bgmUnsub = null;
      }
      root.hidden = true;
      root.classList.remove('is-exiting', 'is-entering', 'k-ready');
      unlockBackground();
      document.documentElement.dataset.introState = 'map';
      document.documentElement.dataset.introReason = reason;
      if (returnFocusEl && typeof returnFocusEl.focus === 'function') {
        try { returnFocusEl.focus({ preventScroll: true }); } catch {}
      }
    };

    if (reduced.matches) {
      finalize();
    } else {
      root.classList.add('is-exiting');
      setTimeout(finalize, 540);
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
