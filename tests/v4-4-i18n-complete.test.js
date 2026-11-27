'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const SunCalc = require('../vendor/suncalc.min.js');

const rootDir = path.resolve(__dirname, '..');
const hasCjk = (str) => /[\u4e00-\u9fff]/.test(String(str || ''));

function createMockDocument(initialLang = 'zh-CN') {
  const docEl = { lang: initialLang, classList: { add() {}, remove() {}, toggle() {} }, dataset: {} };
  const makeEl = (attrs = {}) => {
    const map = new Map(Object.entries(attrs));
    return {
      textContent: '',
      value: '',
      getAttribute: (k) => (map.has(k) ? map.get(k) : null),
      setAttribute: (k, v) => map.set(k, String(v))
    };
  };
  const ariaEl = makeEl({ 'data-i18n-aria': 'ariaMap', 'aria-label': '全球旅行 3D 交互卫星地球仪' });
  const titleEl = makeEl({ 'data-i18n-title': 'layersTitle', title: '地图图层与工具' });
  const textEl = makeEl({ 'data-i18n': 'modeMap' });
  const badgeEl = makeEl({ id: 'lang-code-badge' });
  return {
    title: '',
    documentElement: docEl,
    readyState: 'complete',
    querySelectorAll(sel) {
      if (sel === '[data-i18n]') return [textEl];
      if (sel === '[data-i18n-aria]') return [ariaEl];
      if (sel === '[data-i18n-title]') return [titleEl];
      return [];
    },
    getElementById(id) {
      if (id === 'lang-code-badge') return badgeEl;
      return null;
    },
    _els: { ariaEl, titleEl, textEl, badgeEl }
  };
}

function loadWithI18n(lang = 'en') {
  const store = new Map();
  const doc = createMockDocument(lang);
  const sb = {
    window: null,
    document: doc,
    console,
    Date,
    Math,
    URLSearchParams,
    SunCalc,
    matchMedia: () => ({ matches: false }),
    location: { search: `?lang=${lang}` },
    localStorage: {
      getItem: (k) => store.get(k) || null,
      setItem: (k, v) => store.set(k, String(v))
    }
  };
  sb.window = sb;
  vm.runInNewContext(fs.readFileSync(path.join(rootDir, 'js', 'i18n.js'), 'utf8'), sb);
  sb.AppI18n.setLang(lang);
  return { sb, doc };
}

test('V4.4 index.html early boot syncs <html lang> and hydrates data-i18n-aria / data-i18n-title', () => {
  const html = fs.readFileSync(path.join(rootDir, 'index.html'), 'utf8');
  assert.ok(html.includes('wtg_lang_v1'), 'index.html early boot reads wtg_lang_v1');
  assert.ok(html.includes('document.documentElement.lang = savedLang'), 'index.html sets documentElement.lang immediately');
  assert.ok(html.includes('data-i18n-aria="ariaMap"'), 'index.html includes data-i18n-aria attributes');

  const { sb, doc } = loadWithI18n('en');
  assert.equal(doc.documentElement.lang, 'en');
  assert.equal(doc._els.textEl.textContent, 'Globe');
  assert.equal(hasCjk(doc._els.ariaEl.getAttribute('aria-label')), false, 'aria-label hydrated to EN');
  assert.equal(hasCjk(doc._els.titleEl.getAttribute('title')), false, 'title hydrated to EN');
  assert.equal(doc._els.badgeEl.textContent, 'EN');
  assert.match(sb.AppI18n.t('pageTitle'), /V(4\.[45]|5\.0)/);
});

test('V4.4 StoryPrologue provides entry language switcher & complete English copy for all 8 chapters', () => {
  const src = fs.readFileSync(path.join(rootDir, 'assets', 'prologue', 'prologue.js'), 'utf8');
  assert.ok(src.includes('sp-lang-switch'), 'Prologue renders sp-lang-switch pill');
  assert.ok(src.includes('refreshLocale'), 'Prologue exports refreshLocale');

  const rootMock = { innerHTML: '', querySelector: () => null, querySelectorAll: () => [] };
  const sb = {
    window: null,
    document: {
      documentElement: { lang: 'en' },
      readyState: 'complete',
      getElementById: (id) => (id === 'story-prologue' ? rootMock : null),
      addEventListener: () => {}
    },
    matchMedia: () => ({ matches: false }),
    URLSearchParams,
    location: { search: '?lang=en' },
    localStorage: { getItem: () => 'en', setItem: () => {} },
    console
  };
  sb.window = sb;
  vm.runInNewContext(src, sb);

  assert.ok(sb.StoryPrologue && typeof sb.StoryPrologue.getLocaleCopy === 'function');
  const en = sb.StoryPrologue.getLocaleCopy('en');
  assert.equal(en.chapters.length, 8);
  assert.equal(en.s6Metrics.length, 3);
  assert.equal(en.s7Tabs.length, 3);
  assert.equal(en.s7Caps.length, 3);

  const checkFields = [
    en.langSwitchAria, en.muteOn, en.muteOff, en.skipLabel, en.skipAria, en.railAria,
    en.finalCoord, en.s1BadgePill, en.s1BadgeText, en.s1Line1, en.s1Line2, en.s1SubHtml,
    en.s1Start, en.s1Hint, en.s2Quote1, en.s2Quote2, en.s3Quote1, en.s3Quote2,
    en.s4Quote1, en.s4Quote2, en.s5Quote1, en.s5Quote2, en.s6Title1, en.s6Title2,
    en.s6LeadHtml, en.s7TitleHtml, en.s7GoldenHour, en.s8TitleHtml, en.s8Sub, en.s8Enter,
    ...en.chapters, ...en.s6Metrics, ...en.s7Tabs, ...en.s7SeasonTags, ...en.s7Nodes,
    ...en.s7Caps.flatMap((c) => [c.title, c.desc])
  ];
  for (const field of checkFields) {
    assert.equal(hasCjk(field), false, `Found unexpected CJK in Prologue EN copy: ${field}`);
  }
});

test('V4.4 PhotoSimulator, PhenologyEngine, AestheticIndex & WeatherService localize cleanly to EN', () => {
  const { sb } = loadWithI18n('en');
  vm.runInNewContext(fs.readFileSync(path.join(rootDir, 'js', 'modules', 'photo-simulator.js'), 'utf8'), sb);
  vm.runInNewContext(fs.readFileSync(path.join(rootDir, 'js', 'modules', 'phenology-engine.js'), 'utf8'), sb);
  vm.runInNewContext(fs.readFileSync(path.join(rootDir, 'js', 'modules', 'aesthetic-index.js'), 'utf8'), sb);
  vm.runInNewContext(fs.readFileSync(path.join(rootDir, 'js', 'services', 'weather-service.js'), 'utf8'), sb);

  const backlit = sb.PhotoSimulator.classifyLightAngle(90, 90, 25);
  assert.equal(backlit.badge, 'Backlight');
  assert.equal(hasCjk(backlit.label), false);
  const night = sb.PhotoSimulator.classifyLightAngle(90, 180, -10);
  assert.equal(night.badge, 'Night');

  const sampleDest = {
    id: 'is-reykjavik',
    name: 'Reykjavik',
    coords: [-21.94, 64.14],
    weatherTags: ['snow'],
    monthScores: [5, 5, 4, 3, 3, 4, 4, 4, 4, 5, 5, 5],
    months: [{ m: 1, score: 5, temp: '-2~3°C', highlight: 'Aurora night' }]
  };
  const pheno = sb.PhenologyEngine.evaluatePhenology(sampleDest, 1, { category: 'aurora' });
  assert.equal(hasCjk(pheno.peakWindowText + pheno.explanation + pheno.limitations), false, 'Phenology EN must not leak CJK');

  const idx = sb.AestheticIndex.computeDestinationIndex(sampleDest, 1, null, null, SunCalc);
  for (const dim of idx.dimensions) {
    assert.equal(hasCjk(dim.label), false, `AestheticIndex dim EN must not leak CJK: ${dim.label}`);
  }

  assert.equal(sb.WeatherService.describeWmoCode(1), 'Mostly Clear');
  const aq = sb.WeatherService.classifyAirQuality({ current: { us_aqi: 20, uv_index: 9, grass_pollen: 5 } });
  assert.equal(aq.aqiLevel, 'Crystal Clear');
  assert.equal(aq.uvLevel, 'Very High UV');
  assert.equal(aq.pollenLabel, 'Low Pollen');
});

test('V4.4 MediaWikidataService filters Southeast Asian curry/dish photos in favor of landmarks', () => {
  const sb = { window: {}, console };
  sb.window = sb;
  vm.runInNewContext(fs.readFileSync(path.join(rootDir, 'js', 'services', 'media-wikidata.js'), 'utf8'), sb);

  const ranked = sb.MediaWikidataService.rankAndFilterTravelPhotos(
    [
      { title: 'Gaeng hang ley - Chiang Mai', description: 'Pork belly curry served in Chiang Mai', width: 1600, height: 1200 },
      { title: 'Nam phrik ong with phak', description: 'Spicy chili paste with fresh greens', width: 1400, height: 1050 },
      { title: 'Wat Phra That Doi Suthep golden pagoda sunset', description: 'Chiang Mai temple viewpoint', width: 1800, height: 1200, provider: 'Wikipedia PageImage' }
    ],
    'Chiang Mai',
    3,
    'Thailand'
  );
  assert.equal(ranked.length, 1);
  assert.ok(ranked[0].title.includes('Wat Phra That Doi Suthep'));
});
