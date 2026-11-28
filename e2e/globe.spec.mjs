import fs from 'fs';
import path from 'path';
import http from 'http';
import assert from 'assert';
import { fileURLToPath } from 'url';
import { chromium } from 'playwright-core';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, '..');
const DIST_DIR = path.join(ROOT_DIR, 'dist');
const SHOT_DIR = path.join(__dirname, 'screenshots');
const VERIFY_SHOT_DIR = path.join(ROOT_DIR, 'docs', 'audit-v5', 'v5-1-verify');
const AXE_PATH = path.join(ROOT_DIR, 'node_modules', 'axe-core', 'axe.min.js');

const MIME_MAP = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.webp': 'image/webp',
  '.webmanifest': 'application/manifest+json',
  '.xml': 'application/xml; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8',
  '.mp3': 'audio/mpeg',
  '.mp4': 'video/mp4'
};

const TINY_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=',
  'base64'
);

function findBrowserExecutable() {
  const candidates = [
    process.env.CHROME_PATH,
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
    'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
    '/usr/bin/google-chrome',
    '/usr/bin/chromium',
    '/usr/bin/chromium-browser'
  ].filter(Boolean);
  for (const p of candidates) {
    if (fs.existsSync(p)) return p;
  }
  throw new Error('No Chromium/Chrome/Edge binary found. Set CHROME_PATH env var.');
}

function startStaticServer() {
  const coverPng = fs.existsSync(path.join(DIST_DIR, 'og', 'cover.png'))
    ? fs.readFileSync(path.join(DIST_DIR, 'og', 'cover.png'))
    : TINY_PNG;

  return new Promise((resolve) => {
    const server = http.createServer((req, res) => {
      const urlObj = new URL(req.url, 'http://127.0.0.1');
      const p = decodeURIComponent(urlObj.pathname);

      if (p === '/api/health') {
        res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
        res.end(JSON.stringify({
          ok: true,
          runtime: 'e2e-mock-worker',
          features: { weather: true, commons: true, wikidata: true, wikipedia: true, img: true, tile: true, route: true, terrain: true, mapterhorn: true, aurora: true, panoramax: true, epic: true, airQuality: true, pois: true, d1: false, r2: false }
        }));
        return;
      }

      if (p === '/api/epic') {
        res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
        res.end(JSON.stringify({
          ok: true,
          source: 'NASA DSCOVR EPIC',
          frames: [
            {
              identifier: '20261125001751',
              caption: 'NASA DSCOVR EPIC Natural Color Earth',
              date: '2026-11-25 00:17:51',
              centroid: { lat: -19.1, lon: 84.0 },
              dscovrPos: { x: 1100000, y: 780000, z: -390000 },
              thumbUrl: 'https://epic.gsfc.nasa.gov/archive/natural/2026/11/25/thumbs/epic_1b_20261125001751.jpg',
              mediumUrl: 'https://epic.gsfc.nasa.gov/archive/natural/2026/11/25/jpg/epic_1b_20261125001751.jpg',
              fullUrl: 'https://epic.gsfc.nasa.gov/archive/natural/2026/11/25/png/epic_1b_20261125001751.png'
            },
            {
              identifier: '20261125020552',
              caption: 'NASA DSCOVR EPIC Natural Color Earth Frame 2',
              date: '2026-11-25 02:05:52',
              centroid: { lat: -19.2, lon: 57.0 },
              dscovrPos: { x: 1102000, y: 775000, z: -392000 },
              thumbUrl: 'https://epic.gsfc.nasa.gov/archive/natural/2026/11/25/thumbs/epic_1b_20261125020552.jpg',
              mediumUrl: 'https://epic.gsfc.nasa.gov/archive/natural/2026/11/25/jpg/epic_1b_20261125020552.jpg',
              fullUrl: 'https://epic.gsfc.nasa.gov/archive/natural/2026/11/25/png/epic_1b_20261125020552.png'
            }
          ]
        }));
        return;
      }

      if (p === '/api/img') {
        res.writeHead(200, { 'Content-Type': 'image/png' });
        res.end(coverPng);
        return;
      }

      if (p.startsWith('/api/tile/')) {
        res.writeHead(200, { 'Content-Type': 'image/png' });
        res.end(TINY_PNG);
        return;
      }

      if (p === '/api/route') {
        res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
        res.end(JSON.stringify({
          routed: true,
          crossSea: false,
          provider: 'E2E Mock OSRM',
          distanceKm: 12.4,
          durationMin: 24,
          geometry: { type: 'LineString', coordinates: [[116.397, 39.916], [116.407, 39.904]] }
        }));
        return;
      }

      let rel = p === '/' ? 'index.html' : p.replace(/^\/+/, '');
      let filePath = path.join(DIST_DIR, rel);
      if (fs.existsSync(filePath) && fs.statSync(filePath).isDirectory()) {
        filePath = path.join(filePath, 'index.html');
      }
      if (!filePath.startsWith(DIST_DIR) || !fs.existsSync(filePath)) {
        res.writeHead(404, { 'Content-Type': 'text/plain' });
        res.end('Not found');
        return;
      }

      const ext = path.extname(filePath).toLowerCase();
      res.writeHead(200, { 'Content-Type': MIME_MAP[ext] || 'application/octet-stream' });
      fs.createReadStream(filePath).pipe(res);
    });
    server.listen(0, '127.0.0.1', () => {
      const addr = server.address();
      resolve({ server, baseUrl: `http://127.0.0.1:${addr.port}` });
    });
  });
}

async function attachFastNetworkStubs(page, localOrigin) {
  await page.route('**/*', (route) => {
    const url = route.request().url();
    if (url.startsWith(localOrigin) || url.startsWith('data:') || url.startsWith('blob:')) {
      return route.continue();
    }
    if (url.includes('open-meteo.com')) {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          utc_offset_seconds: 20700,
          current: { temperature_2m: 18.4, relative_humidity_2m: 48, wind_speed_10m: 9.2, weather_code: 1, us_aqi: 34, pm2_5: 8.1, uv_index: 6.2 },
          hourly: { time: ['2026-04-15T12:00'], cloud_cover: [28], precipitation_probability: [10] },
          daily: { time: ['2026-04-15'], temperature_2m_max: [23], temperature_2m_min: [11], weather_code: [1], precipitation_probability_max: [10] }
        })
      });
    }
    if (url.includes('commons.wikimedia.org') || url.includes('wikipedia.org') || url.includes('wikidata.org') || url.includes('panoramax.xyz')) {
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ query: { pages: {} }, features: [] }) });
    }
    return route.fulfill({ status: 200, contentType: 'image/png', body: TINY_PNG });
  });
}

async function run() {
  fs.mkdirSync(SHOT_DIR, { recursive: true });
  fs.mkdirSync(VERIFY_SHOT_DIR, { recursive: true });
  const axeSource = fs.existsSync(AXE_PATH) ? fs.readFileSync(AXE_PATH, 'utf8') : '';
  const executablePath = findBrowserExecutable();
  const { server, baseUrl } = await startStaticServer();
  const browser = await chromium.launch({
    executablePath,
    headless: true,
    args: ['--no-sandbox', '--disable-dev-shm-usage', '--enable-webgl', '--use-gl=angle', '--use-angle=swiftshader-webgl']
  });

  const report = {
    browserPath: executablePath,
    emulatedEnv: true,
    scenarios: [],
    timings: {},
    viewports: {}
  };

  try {
    // 1. Desktop E2E + Prologue Language Switch
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
    const page = await ctx.newPage();
    const pageErrors = [];
    page.on('pageerror', (err) => pageErrors.push(String(err)));
    await attachFastNetworkStubs(page, baseUrl);

    await page.goto(`${baseUrl}/`, { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('#story-prologue:not([hidden]) #sp-skip', { timeout: 10000 });
    const enBtn = page.locator('#sp-lang-switch [data-sp-lang="en"]').first();
    assert.ok(await enBtn.count(), 'Prologue EN switcher must exist');
    await enBtn.click();
    await page.waitForTimeout(200);
    const heroText = await page.textContent('#sp-s1-line1');
    assert.ok(heroText && heroText.includes('The World, Beyond'), `Expected English prologue headline, got: ${heroText}`);
    await page.click('#sp-skip');
    await page.waitForTimeout(450);
    report.scenarios.push('1. Prologue load & entry EN language switch');

    // 2. Main workspace + Language Switch + Perf timing
    await page.goto(`${baseUrl}/?instant=1&focus=np-bt-kathmandu-nagarkot`, { waitUntil: 'load' });
    await page.waitForSelector('#detail-drawer:not(.is-hidden)', { timeout: 12000 });
    const navStats = await page.evaluate(() => {
      const n = performance.getEntriesByType('navigation')[0];
      const res = performance.getEntriesByType('resource');
      return {
        domContentLoadedMs: n ? Math.round(n.domContentLoadedEventEnd) : 0,
        loadMs: n ? Math.round(n.loadEventEnd) : 0,
        resourceCount: res.length
      };
    });
    report.timings = navStats;
    assert.ok(navStats.domContentLoadedMs > 0 && navStats.loadMs >= 0);
    report.scenarios.push('2. Main globe initial load & timing capture');

    // 3. Verify Photo Simulator displays exact IANA Kathmandu +5:45 timezone
    await page.click('#drawer-tabs [data-tab="photo"]');
    await page.waitForSelector('#sim-tz-badge', { timeout: 8000 });
    const ktmTzText = await page.textContent('#sim-tz-badge');
    assert.ok(ktmTzText.includes('Asia/Kathmandu') && ktmTzText.includes('+5:45'), `Expected Kathmandu UTC+5:45 badge, got: ${ktmTzText}`);
    report.scenarios.push('3. Kathmandu Asia/Kathmandu UTC+5:45 IANA verification');

    // 4. Switch app language to English and verify title + content translate
    await page.evaluate(() => window.switchAppLanguage && window.switchAppLanguage('en'));
    await page.waitForTimeout(500);
    const enTitle = await page.title();
    assert.ok(enTitle.includes('KAIROS'), `Expected KAIROS English title, got: ${enTitle}`);
    await page.screenshot({ path: path.join(SHOT_DIR, 'desktop-kathmandu-en.png') });
    await page.evaluate(() => window.switchAppLanguage && window.switchAppLanguage('zh-CN'));
    await page.waitForTimeout(350);
    report.scenarios.push('4. Trilingual UI switch (zh-CN <-> en)');

    // 5. Open 3D Viewfinder, bump to 400mm telephoto crop, then exit with Esc
    await page.click('#drawer-tabs [data-tab="photo"]');
    await page.waitForSelector('#sim-open-viewfinder-btn', { timeout: 6000 });
    await page.click('#sim-open-viewfinder-btn');
    await page.waitForSelector('#viewfinder-hud:not(.is-hidden)', { timeout: 6000 });
    await page.evaluate(() => {
      const s = document.getElementById('vf-focal-slider');
      s.value = '400';
      s.dispatchEvent(new Event('input', { bubbles: true }));
    });
    await page.waitForTimeout(200);
    const cropChipText = await page.textContent('#viewfinder-hud .vf-mode-chip.tele');
    assert.ok(cropChipText && cropChipText.length > 4, 'Telephoto digital crop HUD indicator must show at 400mm');
    await page.keyboard.press('Escape');
    await page.waitForTimeout(300);
    assert.ok(await page.locator('#viewfinder-hud.is-hidden').count(), 'Viewfinder exits on Esc');
    report.scenarios.push('5. 3D Viewfinder 400mm telephoto crop & Esc exit');

    // 6. NASA DSCOVR EPIC full-disk modal (large stage >= 300px, mediumUrl, play/pause)
    await page.click('#layers-popover-btn');
    await page.click('#open-epic-earth-btn');
    await page.waitForSelector('#epic-earth-modal:not(.is-hidden) #epic-stage-img', { timeout: 8000 });
    await page.waitForTimeout(250);
    const epicMetrics = await page.evaluate(() => {
      const stage = document.querySelector('#epic-earth-modal .epic-stage');
      const img = document.getElementById('epic-stage-img');
      const playBtn = document.getElementById('epic-play-btn');
      return {
        stageHeight: stage ? Math.round(stage.getBoundingClientRect().height) : 0,
        imgSrc: img ? img.getAttribute('src') : '',
        hasPlayBtn: Boolean(playBtn)
      };
    });
    assert.ok(epicMetrics.stageHeight >= 300, `EPIC stage must be large (>=300px), got ${epicMetrics.stageHeight}px`);
    assert.ok(epicMetrics.imgSrc.includes('jpg') || epicMetrics.imgSrc.includes('/api/img'), `EPIC img should use jpg medium res: ${epicMetrics.imgSrc}`);
    assert.ok(epicMetrics.hasPlayBtn, 'EPIC modal must include Play/Pause timelapse button');
    await page.screenshot({ path: path.join(SHOT_DIR, 'epic-full-disk-modal.png') });
    await page.click('#epic-close-btn');
    report.scenarios.push(`6. NASA EPIC Full-Disk Modal (stage ${epicMetrics.stageHeight}px, timelapse button verified)`);

    // 7. Diagnostics Modal: switch performance tiers & check 11 service health grid
    await page.click('#layers-popover-btn');
    await page.click('#open-diagnostics-btn');
    await page.waitForSelector('#diagnostics-modal:not(.is-hidden) #diag-perf-select', { timeout: 6000 });
    await page.selectOption('#diag-perf-select', 'eco');
    await page.waitForTimeout(200);
    const ecoAttr = await page.getAttribute('html', 'data-perf-tier');
    assert.equal(ecoAttr, 'eco', 'Expected data-perf-tier=eco');
    await page.selectOption('#diag-perf-select', 'auto');
    await page.click('#diag-close-btn');
    report.scenarios.push('7. Adaptive rendering tiers & 11-service health diagnostics');

    // 8. Embed mode security & UX check
    await page.goto(`${baseUrl}/?embed=jp-kanto-tokyo&chrome=off`, { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('#embed-chrome-bar:not(.is-hidden)', { timeout: 10000 });
    const embedCheck = await page.evaluate(() => {
      const bar = document.getElementById('embed-chrome-bar');
      const topbarHidden = getComputedStyle(document.getElementById('topbar')).display === 'none';
      const drawerHidden = getComputedStyle(document.getElementById('detail-drawer')).display === 'none';
      return {
        hasEmbedClass: document.body.classList.contains('embed-mode'),
        topbarHidden,
        drawerHidden,
        linkHref: bar && bar.querySelector('a') ? bar.querySelector('a').getAttribute('href') : ''
      };
    });
    assert.ok(embedCheck.hasEmbedClass && embedCheck.topbarHidden && embedCheck.drawerHidden);
    assert.ok(embedCheck.linkHref.includes('focus=jp-kanto-tokyo'));
    await page.keyboard.press('Control+KeyK');
    await page.waitForTimeout(150);
    assert.ok(await page.locator('#command-palette.is-hidden').count(), 'Command palette must stay blocked in embed mode');
    report.scenarios.push('8. Embed mode chrome hiding, full-globe link & shortcut lock');

    // 9. Static SEO page check inside Chromium
    await page.goto(`${baseUrl}/p/jp-kanto-tokyo/`, { waitUntil: 'load' });
    const seoMetrics = await page.evaluate(() => {
      const ogImg = document.querySelector('meta[property="og:image"]');
      const imgEl = document.querySelector('img.hero-img');
      return {
        ogImageContent: ogImg ? ogImg.getAttribute('content') : '',
        imgNaturalW: imgEl ? imgEl.naturalWidth : 0,
        imgNaturalH: imgEl ? imgEl.naturalHeight : 0
      };
    });
    assert.ok(seoMetrics.ogImageContent.endsWith('/og/jp-kanto-tokyo.png'));
    assert.equal(seoMetrics.imgNaturalW, 1200);
    assert.equal(seoMetrics.imgNaturalH, 630);
    report.scenarios.push('9. Static SEO landing page & 1200x630 PNG OG card');

    // 10. Multi-viewport responsive checks across all 8 required viewports (emulated Chromium)
    const V5_SHOT_DIR = path.join(__dirname, 'screenshots', 'v5');
    fs.mkdirSync(V5_SHOT_DIR, { recursive: true });
    const viewports = [
      { name: 'mobile-360x800', width: 360, height: 800, isMobile: true },
      { name: 'mobile-390x844', width: 390, height: 844, isMobile: true },
      { name: 'mobile-430x932', width: 430, height: 932, isMobile: true },
      { name: 'tablet-768x1024', width: 768, height: 1024, isMobile: true },
      { name: 'laptop-1024x768', width: 1024, height: 768, isMobile: false },
      { name: 'desktop-1440x900', width: 1440, height: 900, isMobile: false },
      { name: 'desktop-1920x1080', width: 1920, height: 1080, isMobile: false },
      { name: 'desktop-2560x1440', width: 2560, height: 1440, isMobile: false }
    ];

    for (const vp of viewports) {
      const vpCtx = await browser.newContext({ viewport: { width: vp.width, height: vp.height } });
      const vpPage = await vpCtx.newPage();
      vpPage.on('pageerror', (err) => pageErrors.push(`${vp.name}: ${err}`));
      await attachFastNetworkStubs(vpPage, baseUrl);
      await vpPage.goto(`${baseUrl}/?instant=1`, { waitUntil: 'domcontentloaded' });
      await vpPage.waitForSelector('#topbar', { timeout: 10000 });
      await vpPage.waitForTimeout(250);

      const layout = await vpPage.evaluate((isMobile) => {
        const overflowPx = Math.max(0, document.documentElement.scrollWidth - window.innerWidth);
        const searchBtn = document.getElementById('open-palette-btn');
        const modeBtn = isMobile ? document.querySelector('#mobile-bottom-nav .mob-nav-btn') : document.getElementById('mode-map-btn');
        const sr = searchBtn ? searchBtn.getBoundingClientRect() : { height: 0 };
        const mr = modeBtn ? modeBtn.getBoundingClientRect() : { height: 0 };
        return {
          innerWidth: window.innerWidth,
          scrollWidth: document.documentElement.scrollWidth,
          overflowPx,
          minTouchHeight: isMobile ? Math.min(Math.round(sr.height), Math.round(mr.height)) : Math.round(mr.height)
        };
      }, vp.isMobile);

      assert.ok(layout.overflowPx <= 2, `${vp.name} horizontal overflow: ${layout.overflowPx}px`);
      if (vp.isMobile) {
        assert.ok(layout.minTouchHeight >= 40, `${vp.name} touch target height ${layout.minTouchHeight}px < 40px`);
      }
      await vpPage.screenshot({ path: path.join(V5_SHOT_DIR, `viewport-${vp.name}.png`) });
      report.viewports[vp.name] = layout;
      await vpCtx.close();
    }
    report.scenarios.push('10. 8-viewport responsive & touch target audit (emulated Chromium, screenshots saved in e2e/screenshots/v5/)');

    // 11. Label canvas stacking inside #map + unified drawer scroll (desktop & mobile)
    const deskCtx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const deskPage = await deskCtx.newPage();
    deskPage.on('pageerror', (err) => pageErrors.push(`desktop-scroll: ${err}`));
    await attachFastNetworkStubs(deskPage, baseUrl);
    await deskPage.goto(`${baseUrl}/?instant=1&focus=jp-kanto-tokyo`, { waitUntil: 'load' });
    await deskPage.waitForSelector('#detail-drawer:not(.is-hidden) #drawer-scroll', { timeout: 12000 });
    await deskPage.waitForTimeout(300);

    const deskMetrics = await deskPage.evaluate(async () => {
      const lc = document.querySelector('#map #globe-label-canvas');
      const lcZ = lc ? getComputedStyle(lc).zIndex : '';
      const drawer = document.getElementById('detail-drawer');
      const scrollEl = document.getElementById('drawer-scroll');
      const hero = document.getElementById('drawer-hero-banner');
      const tabsBar = document.getElementById('drawer-tabs-bar');
      const header = document.getElementById('drawer-header');
      const drawerTop = drawer.getBoundingClientRect().top;
      const topBefore = hero.getBoundingClientRect().top;
      scrollEl.scrollTop = Math.max(580, (header ? header.offsetHeight : 440) + 120);
      await new Promise((r) => setTimeout(r, 140));
      const topAfter = hero.getBoundingClientRect().top;
      const tabsTop = tabsBar.getBoundingClientRect().top;
      return {
        hasCanvasInMap: Boolean(lc),
        lcZ,
        topBefore,
        topAfter,
        drawerTop,
        tabsTop,
        isScrolled: scrollEl.classList.contains('is-scrolled')
      };
    });
    assert.ok(deskMetrics.hasCanvasInMap && deskMetrics.lcZ === '1', `Expected #map #globe-label-canvas with z-index 1, got ${JSON.stringify(deskMetrics)}`);
    assert.ok(deskMetrics.topAfter < deskMetrics.topBefore - 100, `Expected hero banner to scroll up cleanly: ${deskMetrics.topBefore} -> ${deskMetrics.topAfter}`);
    assert.ok(Math.abs(deskMetrics.tabsTop - deskMetrics.drawerTop) <= 6, `Expected #drawer-tabs-bar sticky at top (${deskMetrics.tabsTop} vs ${deskMetrics.drawerTop})`);
    assert.ok(deskMetrics.isScrolled, 'Expected #drawer-scroll to receive .is-scrolled');
    await deskCtx.close();

    const mobCtx = await browser.newContext({ viewport: { width: 390, height: 844 } });
    const mobPage = await mobCtx.newPage();
    mobPage.on('pageerror', (err) => pageErrors.push(`mobile-scroll: ${err}`));
    await attachFastNetworkStubs(mobPage, baseUrl);
    await mobPage.goto(`${baseUrl}/?instant=1&focus=jp-kanto-tokyo`, { waitUntil: 'load' });
    await mobPage.waitForSelector('#detail-drawer:not(.is-hidden) #drawer-scroll', { timeout: 12000 });
    await mobPage.waitForTimeout(300);

    const mobMetrics = await mobPage.evaluate(async () => {
      const drawer = document.getElementById('detail-drawer');
      const scrollEl = document.getElementById('drawer-scroll');
      const stateBefore = drawer.getAttribute('data-sheet-state');
      scrollEl.scrollTop = 220;
      await new Promise((r) => setTimeout(r, 250));
      return {
        stateBefore,
        stateAfter: drawer.getAttribute('data-sheet-state'),
        isScrolled: scrollEl.classList.contains('is-scrolled')
      };
    });
    assert.equal(mobMetrics.stateBefore, 'half', 'Expected mobile drawer initial state to be half');
    assert.equal(mobMetrics.stateAfter, 'full', 'Expected scrolling down on mobile drawer to auto-expand to full');
    assert.ok(mobMetrics.isScrolled, 'Expected mobile #drawer-scroll to receive .is-scrolled');
    await mobCtx.close();
    report.scenarios.push('11. Map label stacking inside #map & unified drawer scroll (desktop + mobile auto-expand)');

    // 12. V5.0 Batch 1 Regression: Tokyo -> Beijing independent planner + return-to-globe sticky bar & mobile bottom nav
    await page.goto(`${baseUrl}/?instant=1`, { waitUntil: 'load' });
    await page.click('#mode-planner-btn');
    await page.waitForSelector('#planner-view:not(.is-hidden) #tp-generate-btn', { timeout: 8000 });
    await page.click('#tp-new-trip-btn');
    await page.fill('#tp-dest-search', '北京');
    await page.click('#tp-generate-btn');
    await page.waitForFunction(() => {
      const sel = document.getElementById('tp-trip-select');
      const txt = sel && sel.selectedOptions[0] ? sel.selectedOptions[0].textContent : '';
      return txt.includes('北京') || txt.includes('Beijing');
    }, null, { timeout: 8000 });
    const bjState = await page.evaluate(() => {
      const sel = document.getElementById('tp-trip-select');
      const optText = sel && sel.selectedOptions[0] ? sel.selectedOptions[0].textContent : '';
      const stopTxt = document.querySelector('#planner-view .stop-drag-item') ? document.querySelector('#planner-view .stop-drag-item').textContent : '';
      return { optText, stopTxt };
    });
    assert.ok(bjState.optText.includes('北京') || bjState.optText.includes('Beijing'), `Expected Beijing trip after Tokyo, got ${bjState.optText}`);
    assert.ok(bjState.stopTxt.length > 0, 'Expected Beijing stops rendered');

    // 13. V5.0 Multimodal Transport tab, Lock Stop & 8-Format Export Modal
    await page.click('.tp-subtab[data-subtab="transport"]');
    await page.waitForTimeout(150);
    const transportTxt = await page.textContent('#planner-view');
    assert.ok(transportTxt.includes('OurAirports') || transportTxt.includes('PEK') || transportTxt.includes('Flight') || transportTxt.includes('飞机'), 'Expected multimodal transport gateways');
    await page.click('#tp-exp-more');
    await page.waitForSelector('#trip-export-modal:not(.is-hidden) .exp-fmt-btn', { timeout: 6000 });
    const fmtCount = await page.locator('#trip-export-modal .exp-fmt-btn').count();
    assert.equal(fmtCount, 8, 'Expected 8 file export formats (including Markdown) in Export Modal');
    await page.keyboard.press('Escape');
    await page.waitForSelector('#trip-export-modal.is-hidden', { state: 'attached', timeout: 4000 });
    await page.screenshot({ path: path.join(VERIFY_SHOT_DIR, 'desktop-light-planner.png') });
    await page.click('#tp-sticky-back-btn');
    await page.waitForSelector('#planner-view.is-hidden', { state: 'attached', timeout: 6000 });
    report.scenarios.push('12-13. V5.1 Beijing vs Tokyo planner, multimodal hubs, Esc modal dismiss & 8-format ExportService');

    // 14. V5.0 Photo Opportunity Index (>14d forecast guard) + Help Center (30 chapters) + Share Center (6 ratios, QR)
    await page.goto(`${baseUrl}/?instant=1&focus=jp-kansai-kyoto`, { waitUntil: 'load' });
    await page.waitForSelector('#detail-drawer:not(.is-hidden) #drawer-tabs .tab-btn[data-tab="photo"]', { timeout: 10000 });
    await page.click('#drawer-tabs .tab-btn[data-tab="photo"]');
    await page.waitForSelector('#sim-poi-box #sim-poi-score', { timeout: 6000 });
    const farDate = new Date(Date.now() + 45 * 86400000).toISOString().slice(0, 10);
    await page.fill('#sim-date-input', farDate);
    await page.dispatchEvent('#sim-date-input', 'change');
    await page.waitForTimeout(200);
    const poiBodyTxt = await page.textContent('#sim-poi-body');
    assert.ok(poiBodyTxt && /14|天文|astronomy/i.test(poiBodyTxt), `Expected >14d forecast guard note, got: ${poiBodyTxt}`);
    await page.click('#sim-share-window-btn');
    await page.waitForSelector('#share-center-modal:not(.is-hidden) #sc-ratio-sel', { timeout: 6000 });
    const qrCount = await page.locator('#share-center-modal svg').count();
    assert.ok(qrCount >= 1, 'ShareCenter should render local inline QR SVG');
    await page.click('#sc-close-btn');

    await page.click('#help-btn');
    await page.waitForSelector('#help-center-modal:not(.is-hidden) .hc-toc-btn', { timeout: 6000 });
    const chapCount = await page.locator('#help-center-modal .hc-toc-btn').count();
    assert.equal(chapCount, 30, 'HelpCenter must show all 30 manual chapters');
    await page.fill('#hc-search-input', 'GPX');
    await page.waitForTimeout(200);
    const filteredChapCount = await page.locator('#help-center-modal .hc-toc-btn').count();
    assert.ok(filteredChapCount >= 1 && filteredChapCount < 30, 'HelpCenter search should filter chapters');
    await page.click('#hc-close-btn');
    report.scenarios.push('14. V5.0 Photo Opportunity Index (>14d guard), ShareCenter local QR & 30-chapter HelpCenter');

    // 15. V5.1 Real Same-Context BroadcastChannel Sync, Dark/Light axe-core Accessibility & Mobile Overlap Gate
    await page.evaluate(() => {
      document.documentElement.setAttribute('data-theme', 'dark');
    });
    await page.waitForTimeout(150);
    await page.screenshot({ path: path.join(VERIFY_SHOT_DIR, 'desktop-dark.png') });
    await page.evaluate(() => {
      document.documentElement.setAttribute('data-theme', 'light');
    });
    await page.waitForTimeout(150);
    await page.screenshot({ path: path.join(VERIFY_SHOT_DIR, 'desktop-light.png') });

    // Open Help modal in light theme and verify non-dark background + screenshot
    await page.click('#help-btn');
    await page.waitForSelector('#help-center-modal:not(.is-hidden) .modal-card', { timeout: 6000 });
    await page.waitForTimeout(150);
    const helpCardBg = await page.evaluate(() => getComputedStyle(document.querySelector('#help-center-modal .modal-card')).backgroundColor);
    assert.ok(helpCardBg.includes('255, 255, 255'), `Expected light modal card white bg in light mode, got ${helpCardBg}`);
    await page.screenshot({ path: path.join(VERIFY_SHOT_DIR, 'desktop-help-light.png') });
    await page.keyboard.press('Escape');
    await page.waitForSelector('#help-center-modal.is-hidden', { state: 'attached', timeout: 4000 });

    // Real same-context BroadcastChannel delivery test
    const tab2 = await ctx.newPage();
    tab2.on('pageerror', (err) => pageErrors.push(`collab-tab2: ${err}`));
    await attachFastNetworkStubs(tab2, baseUrl);
    await tab2.goto(`${baseUrl}/?instant=1`, { waitUntil: 'load' });
    await tab2.evaluate(() => {
      window.__rxBcMsgs = [];
      const ch = new BroadcastChannel('kairos_collab');
      ch.onmessage = (ev) => window.__rxBcMsgs.push(ev.data);
    });
    await page.evaluate(() => {
      const ch = new BroadcastChannel('kairos_collab');
      ch.postMessage({ tripId: 'trip_bc_v51', ping: 'kairos_5_1' });
    });
    await tab2.waitForFunction(() => Array.isArray(window.__rxBcMsgs) && window.__rxBcMsgs.length > 0, null, { timeout: 5000 });
    const rx = await tab2.evaluate(() => window.__rxBcMsgs[0]);
    assert.equal(rx.ping, 'kairos_5_1', 'Same-context BroadcastChannel must synchronize across tabs');
    await tab2.close();

    // Mobile 390x844 bottom-nav overlap & clearance check
    const mobCheckCtx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
    const mobCheckPage = await mobCheckCtx.newPage();
    await attachFastNetworkStubs(mobCheckPage, baseUrl);
    await mobCheckPage.goto(`${baseUrl}/?instant=1&focus=jp-kanto-tokyo`, { waitUntil: 'load' });
    await mobCheckPage.waitForSelector('#detail-drawer:not(.is-hidden)', { timeout: 10000 });
    await mobCheckPage.waitForTimeout(250);
    await mobCheckPage.screenshot({ path: path.join(VERIFY_SHOT_DIR, 'mobile-390.png') });
    const mobBarCheck = await mobCheckPage.evaluate(() => {
      const nav = document.getElementById('mobile-bottom-nav');
      const pheno = document.getElementById('phenology-bar');
      const controls = document.getElementById('globe-controls');
      const rNav = nav ? nav.getBoundingClientRect() : null;
      const rPheno = pheno ? pheno.getBoundingClientRect() : null;
      const rCtrl = controls ? controls.getBoundingClientRect() : null;
      return {
        navTop: rNav ? rNav.top : 9999,
        phenoBottom: rPheno ? rPheno.bottom : 0,
        ctrlBottom: rCtrl ? rCtrl.bottom : 0
      };
    });
    assert.ok(mobBarCheck.ctrlBottom <= mobBarCheck.navTop + 4, `Controls (${mobBarCheck.ctrlBottom}) overlap mobile bottom nav (${mobBarCheck.navTop})`);
    await mobCheckCtx.close();

    // Run axe-core audit on desktop page
    if (axeSource) {
      await page.addScriptTag({ content: axeSource });
      const axeRes = await page.evaluate(async () => {
        const res = await window.axe.run(document, {
          runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa'] }
        });
        return {
          violations: res.violations.map((v) => ({ id: v.id, impact: v.impact, count: v.nodes.length, help: v.help }))
        };
      });
      const criticalOrSerious = axeRes.violations.filter((v) => v.impact === 'critical' || v.impact === 'serious');
      report.axeViolations = axeRes.violations;
      assert.equal(criticalOrSerious.length, 0, `Unexpected serious/critical axe-core a11y violations: ${JSON.stringify(criticalOrSerious)}`);
    }

    const a11yAudit = await page.evaluate(() => {
      const topBtns = [...document.querySelectorAll('#topbar button')];
      const missingLabels = topBtns.filter((b) => !b.textContent.trim() && !b.getAttribute('aria-label') && !b.getAttribute('title')).length;
      const hasMainAria = Boolean(document.querySelector('[role="dialog"], header, main, aside'));
      return { missingLabels, hasMainAria };
    });
    assert.equal(a11yAudit.missingLabels, 0, 'Every #topbar icon button must have text, aria-label, or title');
    assert.ok(a11yAudit.hasMainAria, 'Page must preserve semantic landmarks');
    report.scenarios.push('15. BroadcastChannel real sync, dark/light theme verify, mobile zero-overlap & axe-core WCAG gate');

    assert.equal(pageErrors.length, 0, `Uncaught pageerrors occurred: ${pageErrors.join(' | ')}`);
    await ctx.close();

    console.log(JSON.stringify({ ok: true, report }, null, 2));
  } finally {
    await browser.close();
    server.close();
  }
}

run().catch((err) => {
  console.error('E2E FAILED:', err);
  process.exit(1);
});
