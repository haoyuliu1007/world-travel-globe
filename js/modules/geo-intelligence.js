(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory(typeof globalThis !== 'undefined' ? globalThis : root);
  } else {
    root.GeoIntelligence = factory(root);
  }
})(typeof window !== 'undefined' ? window : globalThis, function (global) {
  'use strict';

  const LANDSCAPE_RULES = [
    { id: 'autumn', label: '秋色/红叶/金秋', re: /秋|红叶|枫|落叶松|白桦|银杏|胡杨|彩林|autumn|foliage|maple|larch|golden/i },
    { id: 'blossom', label: '花海/樱花/春花', re: /樱|花海|薰衣草|油菜花|郁金香|杜鹃|杏花|桃花|blossom|sakura|lavender|tulip|bloom/i },
    { id: 'snow', label: '雪山/雪景/雾凇', re: /雪|雾凇|蓝冰|粉雪|snow|winter|powder|frost|snowy/i },
    { id: 'glacier', label: '冰川/冰原/峡湾', re: /冰川|冰原|冰湖|冰洞|峡湾|glacier|fjord|iceberg|icefield/i },
    { id: 'aurora', label: '极光/极夜', re: /极光|aurora|northern lights|borealis|kp/i },
    { id: 'milkyway', label: '银河/星空/暗夜', re: /银河|星空|星轨|暗夜|观星|milky way|stargaz|stars|night sky/i },
    { id: 'lake', label: '湖泊/倒影', re: /湖|海子|镜湖|盐湖|lake|lagoon|loch|tarn|reflection/i },
    { id: 'coast', label: '海岸/海岛/悬崖海景', re: /海岸|海岛|海滨|海滩|沙滩|海湾|大海|海洋|礁石|灯塔|coast|island|beach|cliff|\bsea\b|ocean/i },
    { id: 'desert', label: '沙漠/戈壁/雅丹', re: /沙漠|沙丘|戈壁|雅丹|丹霞|荒漠|desert|dune|canyon|badlands/i },
    { id: 'forest', label: '森林/雨林/秘境', re: /森林|林海|雨林|原始林|竹海|红杉|forest|rainforest|woodland|redwood/i },
    { id: 'cloudsea', label: '云海/晨雾/日照金山', re: /云海|晨雾|佛光|平流雾|日照金山|cloud sea|mist|fog|inversion/i },
    { id: 'mountain', label: '高山/峰林/山岳', re: /山|峰|垭口|草甸|高山|mountain|peak|alps|ridge|summit|meadow/i },
    { id: 'architecture', label: '城市/古建/人文地标', re: /城|古镇|古城|宫|寺|教堂|塔|桥|街区|博物馆|castle|temple|cathedral|old town|palace|architecture/i },
    { id: 'volcano', label: '火山/地热/温泉', re: /火山|间歇泉|地热|熔岩|volcano|geothermal|geyser|caldera/i },
    { id: 'grassland', label: '草原/牧场', re: /草原|牧场|高地|grassland|steppe|prairie|highland/i },
    { id: 'canyon', label: '峡谷/瀑布', re: /峡谷|大峡谷|瀑布|深谷|canyon|gorge|waterfall|falls/i }
  ];

  const CONTINENT_PATTERNS = [
    { id: 'europe', label: '欧洲', re: /欧洲|北欧|西欧|南欧|东欧|阿尔卑斯|多洛米蒂|冰岛|瑞士|挪威|法国|意大利|西班牙|德国|奥地利|英国|苏格兰|希腊|europe|nordic|alps|iceland|switzerland|norway|italy|france/i },
    { id: 'asia', label: '亚洲', re: /亚洲|东亚|东南亚|南亚|中亚|西亚|中国|国内|日本|韩国|川西|新疆|西藏|云南|北海道|京都|尼泊尔|asia|china|japan|korea|tibet|xinjiang|nepal/i },
    { id: 'north_america', label: '北美洲', re: /北美|北美洲|美国|加拿大|阿拉斯加|落基山|墨西哥|加勒比|north america|usa|canada|alaska|rockies|mexico/i },
    { id: 'south_america', label: '南美洲', re: /南美|南美洲|巴塔哥尼亚|秘鲁|智利|玻利维亚|阿根廷|巴西|安第斯|south america|patagonia|peru|chile|bolivia|argentina|andes/i },
    { id: 'oceania', label: '大洋洲', re: /大洋洲|新西兰|澳大利亚|澳洲|斐济|大溪地|oceania|new zealand|australia|pacific/i },
    { id: 'africa_antarctica', label: '非洲/南极', re: /非洲|东非|南非|摩洛哥|纳米比亚|埃及|南极|antarctica|africa|morocco|namibia|kenya|egypt/i }
  ];

  const MONTH_NAMES_EN = [
    'january', 'february', 'march', 'april', 'may', 'june',
    'july', 'august', 'september', 'october', 'november', 'december'
  ];
  const MONTH_CN_NUM = {
    一: 1, 二: 2, 两: 2, 三: 3, 四: 4, 五: 5, 六: 6, 七: 7, 八: 8, 九: 9, 十: 10, 十一: 11, 十二: 12
  };
  const CN_DIGITS = { 一: 1, 二: 2, 两: 2, 三: 3, 四: 4, 五: 5, 六: 6, 七: 7, 八: 8, 九: 9, 十: 10 };

  let miniSearchCache = null;
  let miniSearchRefLen = 0;

  function haversineKm(a, b) {
    const r = Math.PI / 180;
    const dLat = (b[1] - a[1]) * r;
    const dLng = (b[0] - a[0]) * r;
    const s = Math.sin(dLat / 2) ** 2 + Math.cos(a[1] * r) * Math.cos(b[1] * r) * Math.sin(dLng / 2) ** 2;
    return 6371 * 2 * Math.asin(Math.min(1, Math.sqrt(s)));
  }

  /**
   * Bilingual Chinese + Latin tokenizer producing both whole runs and CJK 2-grams.
   */
  function tokenizeGeoText(text) {
    const s = String(text || '').toLowerCase();
    if (!s) return [];
    const tokens = [];
    const latin = s.match(/[a-z0-9_-]{2,}/g) || [];
    for (let i = 0; i < latin.length; i++) tokens.push(latin[i]);

    const cjkRuns = s.match(/[\u4e00-\u9fff]+/g) || [];
    for (let i = 0; i < cjkRuns.length; i++) {
      const run = cjkRuns[i];
      if (run.length <= 4) tokens.push(run);
      if (run.length === 1) {
        tokens.push(run);
      } else {
        for (let j = 0; j < run.length - 1; j++) {
          tokens.push(run.slice(j, j + 2));
        }
      }
    }
    return tokens;
  }

  function classifyLandscapesFromText(text) {
    const out = [];
    for (let i = 0; i < LANDSCAPE_RULES.length; i++) {
      if (LANDSCAPE_RULES[i].re.test(text)) out.push(LANDSCAPE_RULES[i].id);
    }
    return out;
  }

  function estimateComfortBudget(dest) {
    if (Number.isFinite(dest && dest.comfortBudgetRmb)) return dest.comfortBudgetRmb;
    const items = dest && dest.budget && dest.budget.comfort && Array.isArray(dest.budget.comfort.items)
      ? dest.budget.comfort.items
      : null;
    if (items && items.length) {
      const sum = items.reduce((acc, it) => acc + (Number(it && it.cost) || 0), 0);
      if (sum > 0) return Math.round(sum);
    }
    return null;
  }

  const ANALOGY_PRESETS = [
    { re: /(?:像|类似|平替|like|similar to)\s*(瑞士|switzerland)/i, excludeCountry: '瑞士', tags: ['snow', 'mountain', 'lake'], label: '阿尔卑斯雪峰湖泊系' },
    { re: /(?:像|类似|平替|like|similar to)\s*(冰岛|iceland)/i, excludeCountry: '冰岛', tags: ['glacier', 'aurora', 'volcano'], label: '极光冰川火山系' },
    { re: /(?:像|类似|平替|like|similar to)\s*(日本|japan|京都|kyoto)/i, excludeCountry: '日本', tags: ['blossom', 'autumn', 'architecture'], label: '东亚四季花叶古建系' },
    { re: /(?:像|类似|平替|like|similar to)\s*(挪威|norway)/i, excludeCountry: '挪威', tags: ['glacier', 'coast', 'mountain'], label: '峡湾海岸雪山系' }
  ];

  /**
   * Parse natural-language travel query into structured hard/soft constraints,
   * negative exclusions, and analogy preferences.
   */
  function parseNaturalQuery(rawQuery) {
    const raw = String(rawQuery || '').trim();
    const q = raw.toLowerCase();

    // Extract negative clauses first (e.g. "不要海滩", "避开雪山", "no beach", "avoid coast")
    const excludeTags = [];
    const negRe = /(?:不要|避开|别去|不想看|不含|别太|avoid|without|exclude|no\s+)([^，,;；。]+)/gi;
    let cleanedForPositive = q;
    let mNeg;
    while ((mNeg = negRe.exec(q)) !== null) {
      const negClause = mNeg[1] || '';
      const negLands = classifyLandscapesFromText(negClause);
      negLands.forEach((tid) => {
        if (!excludeTags.includes(tid)) excludeTags.push(tid);
      });
      cleanedForPositive = cleanedForPositive.replace(mNeg[0], ' ');
    }

    let month = null;
    const numMonthMatch = cleanedForPositive.match(/(?:^|[^\d])(1[0-2]|[1-9])\s*月份?/);
    if (numMonthMatch) {
      month = Number(numMonthMatch[1]);
    } else {
      const cnMonthMatch = cleanedForPositive.match(/(十一|十二|[一二三四五六七八九十])\s*月份?/);
      if (cnMonthMatch && MONTH_CN_NUM[cnMonthMatch[1]]) {
        month = MONTH_CN_NUM[cnMonthMatch[1]];
      } else {
        for (let i = 0; i < MONTH_NAMES_EN.length; i++) {
          if (new RegExp(`\\b${MONTH_NAMES_EN[i].slice(0, 3)}(?:[a-z]*)\\b`, 'i').test(cleanedForPositive)) {
            month = i + 1;
            break;
          }
        }
      }
    }

    let season = null;
    if (/春|spring/i.test(cleanedForPositive)) season = 'spring';
    else if (/夏|summer/i.test(cleanedForPositive)) season = 'summer';
    else if (/秋|金秋|autumn|fall/i.test(cleanedForPositive)) season = 'autumn';
    else if (/冬|winter/i.test(cleanedForPositive)) season = 'winter';

    let maxBudgetRmb = null;
    const wanMatch = cleanedForPositive.match(/(\d+(?:\.\d+)?)\s*万(?:元|块|rmb)?/);
    const rmbMatch = cleanedForPositive.match(/(?:预算|不超过|低于|以内|<=|under|budget)?\s*(\d{3,6})\s*(?:元|rmb|cny|块)?/);
    const usdMatch = cleanedForPositive.match(/\$\s*(\d{2,5})|(\d{2,5})\s*(?:usd|美元)/i);
    if (usdMatch) {
      maxBudgetRmb = Math.round(Number(usdMatch[1] || usdMatch[2]) * 7.2);
    } else if (wanMatch) {
      maxBudgetRmb = Math.round(Number(wanMatch[1]) * 10000);
    } else if (rmbMatch && /预算|元|块|rmb|cny|不超过|低于|以内|under|budget/i.test(cleanedForPositive)) {
      maxBudgetRmb = Number(rmbMatch[1]);
    }

    let days = null;
    const daysMatch = cleanedForPositive.match(/(\d{1,2})\s*(?:天|日|days?)/i);
    if (daysMatch) {
      days = Number(daysMatch[1]);
    } else {
      const cnDayMatch = cleanedForPositive.match(/([一二两三四五六七八九十])\s*(?:天|日)/);
      if (cnDayMatch && CN_DIGITS[cnDayMatch[1]]) days = CN_DIGITS[cnDayMatch[1]];
    }

    let continent = null;
    let continentLabel = '';
    for (let i = 0; i < CONTINENT_PATTERNS.length; i++) {
      if (CONTINENT_PATTERNS[i].re.test(cleanedForPositive)) {
        continent = CONTINENT_PATTERNS[i].id;
        continentLabel = CONTINENT_PATTERNS[i].label;
        break;
      }
    }

    const landscapeTags = classifyLandscapesFromText(cleanedForPositive).filter((t) => !excludeTags.includes(t));
    let analogy = null;
    const cheaperPreference = /更便宜|平替|性价比|低预算|cheaper|affordable/i.test(q);
    for (let i = 0; i < ANALOGY_PRESETS.length; i++) {
      if (ANALOGY_PRESETS[i].re.test(q)) {
        analogy = ANALOGY_PRESETS[i];
        analogy.tags.forEach((tid) => {
          if (!excludeTags.includes(tid) && !landscapeTags.includes(tid)) {
            landscapeTags.push(tid);
          }
        });
        break;
      }
    }

    const preferDry = /少雨|晴朗|干爽|不下雨|晴天|通透|dry|sunny|clear/i.test(cleanedForPositive);
    const preferWarm = /温暖|暖和|暖冬|热带|warm/i.test(cleanedForPositive);
    const preferCool = /避暑|凉爽|清凉|cool/i.test(cleanedForPositive);

    const summaryChips = [];
    if (month) summaryChips.push(`${month}月`);
    else if (season) summaryChips.push({ spring: '春季', summer: '夏季', autumn: '秋季', winter: '冬季' }[season]);
    if (continentLabel) summaryChips.push(continentLabel);
    if (maxBudgetRmb) summaryChips.push(`硬约束 ≤ ¥${maxBudgetRmb.toLocaleString()}`);
    if (days) summaryChips.push(`${days}天行程`);
    landscapeTags.slice(0, 4).forEach((tagId) => {
      const rule = LANDSCAPE_RULES.find((r) => r.id === tagId);
      if (rule) summaryChips.push(rule.label.split('/')[0]);
    });
    excludeTags.forEach((tagId) => {
      const rule = LANDSCAPE_RULES.find((r) => r.id === tagId);
      if (rule) summaryChips.push(`排除：${rule.label.split('/')[0]}`);
    });
    if (analogy) summaryChips.push(analogy.label);
    if (cheaperPreference) summaryChips.push('高性价比优先');
    if (preferDry) summaryChips.push('少雨晴朗偏好');
    if (preferWarm) summaryChips.push('温暖偏好');
    if (preferCool) summaryChips.push('避暑清凉偏好');

    const hasIntent = Boolean(
      month ||
      season ||
      maxBudgetRmb ||
      days ||
      continent ||
      preferDry ||
      preferWarm ||
      preferCool ||
      excludeTags.length > 0 ||
      analogy ||
      landscapeTags.length >= 2 ||
      (raw.length >= 8 && landscapeTags.length >= 1)
    );

    return {
      raw,
      hasIntent,
      month,
      season,
      maxBudgetRmb,
      days,
      continent,
      landscapeTags,
      excludeTags,
      analogy,
      cheaperPreference,
      preferDry,
      preferWarm,
      preferCool,
      summaryChips
    };
  }

  function buildMiniSearch(destinations, enrichmentById) {
    const MS = global.MiniSearch || (typeof require === 'function' ? (() => {
      try { return require('../../vendor/minisearch.min.js'); } catch (e) { return null; }
    })() : null);
    if (!MS || !Array.isArray(destinations) || !destinations.length) return null;

    if (miniSearchCache && miniSearchRefLen === destinations.length) return miniSearchCache;

    const docs = destinations.map((d) => {
      const enr = enrichmentById && enrichmentById[d.id];
      const spotText = Array.isArray(d.spots)
        ? d.spots.map((s) => `${s.name} ${s.category || ''} ${s.scene || ''}`).join(' ')
        : (Array.isArray(d.spotNames) ? d.spotNames.join(' ') : '');
      const landText = enr && Array.isArray(enr.landscapeTypes)
        ? enr.landscapeTypes.map((tid) => {
            const rule = LANDSCAPE_RULES.find((r) => r.id === tid);
            return rule ? rule.label : tid;
          }).join(' ')
        : '';
      return {
        id: d.id,
        name: d.name || '',
        shortName: d.shortName || '',
        country: d.country || '',
        province: `${d.province || ''} ${d.region || ''}`,
        subtitle: `${d.subtitle || ''} ${d.heroSummary || ''}`,
        spots: spotText,
        landscapes: landText
      };
    });

    const ms = new MS({
      fields: ['shortName', 'name', 'country', 'province', 'subtitle', 'spots', 'landscapes'],
      storeFields: ['id'],
      tokenize: tokenizeGeoText,
      processTerm: (term) => term,
      searchOptions: {
        boost: { shortName: 4, name: 3.2, country: 2.5, province: 1.6, spots: 1.5, landscapes: 1.4, subtitle: 1.0 },
        prefix: true,
        fuzzy: 0.2,
        combineWith: 'OR'
      }
    });
    ms.addAll(docs);
    miniSearchCache = ms;
    miniSearchRefLen = destinations.length;
    return ms;
  }

  function getDestLandscapes(dest, enr) {
    if (enr && Array.isArray(enr.landscapeTypes) && enr.landscapeTypes.length) {
      return enr.landscapeTypes;
    }
    const text = [
      dest.name, dest.subtitle, dest.heroSummary,
      (dest.badges || []).join(' '),
      (dest.spotNames || []).join(' '),
      Array.isArray(dest.spots) ? dest.spots.map((s) => `${s.name} ${s.category || ''} ${s.scene || ''}`).join(' ') : ''
    ].join(' ');
    return classifyLandscapesFromText(text);
  }

  function getMonthScore(dest, monthNum) {
    if (!monthNum) return 0;
    if (Array.isArray(dest.months)) {
      const m = dest.months.find((x) => x.m === monthNum);
      if (m) return Number(m.score) || 0;
    }
    if (Array.isArray(dest.monthScores)) {
      return Number(dest.monthScores[monthNum - 1]) || 0;
    }
    return 0;
  }

  function searchAndExplain(rawQuery, destinations, opts) {
    const list = Array.isArray(destinations) ? destinations : [];
    const options = opts || {};
    const enrichmentById = options.enrichmentById || {};
    const intent = parseNaturalQuery(rawQuery);
    const ms = buildMiniSearch(list, enrichmentById);

    const msScores = new Map();
    if (ms && intent.raw) {
      const msHits = intent.hasIntent
        ? ms.search(intent.raw)
        : ms.search(intent.raw, { combineWith: 'AND', fuzzy: 0.12 });
      for (let i = 0; i < msHits.length; i++) {
        msScores.set(msHits[i].id, msHits[i].score);
      }
    }

    const qLower = intent.raw.toLowerCase();
    const seasonMonths = intent.season
      ? { spring: [3, 4, 5], summer: [6, 7, 8], autumn: [9, 10, 11], winter: [12, 1, 2] }[intent.season]
      : null;

    const scored = [];
    for (let i = 0; i < list.length; i++) {
      const dest = list[i];
      const enr = enrichmentById[dest.id] || null;
      const msScore = msScores.get(dest.id) || 0;

      if (!intent.hasIntent) {
        const directHay = (`${dest.name} ${dest.shortName} ${dest.country} ${dest.id}`).toLowerCase();
        if (msScore <= 0 && !directHay.includes(qLower)) {
          continue;
        }
      }

      if (intent.hasIntent && intent.continent && dest.continent !== intent.continent && msScore < 5) {
        continue;
      }

      if (intent.analogy && intent.cheaperPreference && String(dest.country || '').includes(intent.analogy.excludeCountry)) {
        continue;
      }

      const destLands = getDestLandscapes(dest, enr);
      // Hard negative constraint exclusion
      if (intent.excludeTags && intent.excludeTags.length) {
        let excluded = false;
        for (let ex = 0; ex < intent.excludeTags.length; ex++) {
          if (destLands.includes(intent.excludeTags[ex])) {
            excluded = true;
            break;
          }
        }
        if (excluded) continue;
      }

      // Hard budget cap exclusion
      const comfortRmb = (enr && enr.comfortBudgetRmb) || estimateComfortBudget(dest);
      if (intent.maxBudgetRmb && comfortRmb !== null && comfortRmb > intent.maxBudgetRmb * 1.15) {
        continue;
      }

      let total = Math.min(38, msScore * 2.4);
      const reasons = [];
      const caveats = [];

      const nameLower = `${dest.shortName || ''} ${dest.name || ''} ${dest.id || ''}`.toLowerCase();
      if (qLower && (dest.shortName || '').toLowerCase() === qLower || (dest.id || '').toLowerCase() === qLower) {
        total += 120;
      } else if (qLower && nameLower.includes(qLower)) {
        total += 45;
      }

      if (intent.continent && dest.continent === intent.continent) {
        total += 22;
        const cRule = CONTINENT_PATTERNS.find((c) => c.id === intent.continent);
        if (cRule) reasons.push(`位于${cRule.label}`);
      }

      if (intent.landscapeTags.length) {
        let hits = 0;
        const matchedLabels = [];
        for (let k = 0; k < intent.landscapeTags.length; k++) {
          const tid = intent.landscapeTags[k];
          if (destLands.includes(tid)) {
            hits++;
            const rule = LANDSCAPE_RULES.find((r) => r.id === tid);
            if (rule) matchedLabels.push(rule.label.split('/')[0]);
          }
        }
        if (hits > 0) {
          total += hits * 18 + (hits === intent.landscapeTags.length ? 12 : 0);
          reasons.push(`匹配景观：${matchedLabels.join(' / ')}`);
        } else if (intent.hasIntent) {
          total -= 12;
        }
      }

      // Month or Season phenology score
      const targetMonth = intent.month || (seasonMonths ? seasonMonths[1] : null);
      if (targetMonth) {
        let mScore = getMonthScore(dest, targetMonth);
        if (!intent.month && seasonMonths) {
          mScore = Math.max(...seasonMonths.map((mm) => getMonthScore(dest, mm)));
        }
        if (mScore >= 5) {
          total += 24;
          reasons.push(`${intent.month ? `${intent.month}月` : '当季'}物候巅峰 5★`);
        } else if (mScore === 4) {
          total += 15;
          reasons.push(`${intent.month ? `${intent.month}月` : '当季'}推荐 4★`);
        } else if (mScore > 0 && mScore <= 2) {
          total -= 14;
          caveats.push(`${intent.month ? `${intent.month}月` : '该季'}非最佳观赏窗口 (${mScore}★)`);
        }
      }

      // Dry / weather preference
      if (intent.preferDry) {
        const wTags = Array.isArray(dest.weatherTags) ? dest.weatherTags : [];
        const clim = enr && Array.isArray(enr.monthlyClimateSummary) && targetMonth
          ? enr.monthlyClimateSummary[targetMonth - 1]
          : null;
        if (clim && /少雨|干爽|晴|20mm|30mm|40mm/i.test(clim.rain || '')) {
          total += 12;
          reasons.push(`气候相对干爽 (${clim.rain})`);
        } else if (wTags.includes('sunny') || wTags.includes('allWeather')) {
          total += 8;
          reasons.push('晴空/全天候适配');
        } else if (wTags.includes('rain')) {
          total -= 10;
          caveats.push('该地以多雨/云雾著称');
        }
      }

      // Budget reference check & cheaper preference bonus
      if (intent.maxBudgetRmb) {
        if (comfortRmb !== null) {
          if (comfortRmb <= intent.maxBudgetRmb) {
            total += 18;
            reasons.push(`参考预算 ¥${comfortRmb.toLocaleString()} ≤ ¥${intent.maxBudgetRmb.toLocaleString()}`);
          } else {
            total += 4;
            caveats.push(`参考预算接近上限 (¥${comfortRmb.toLocaleString()})`);
          }
        } else {
          caveats.push('预算缺失（待核实）');
        }
      } else if (intent.cheaperPreference && comfortRmb !== null) {
        if (comfortRmb <= 10000) {
          total += 16;
          reasons.push(`高性价比参考预算 ¥${comfortRmb.toLocaleString()}`);
        } else if (comfortRmb > 18000) {
          total -= 12;
        }
      }

      // Days proximity
      if (intent.days && dest.suggestedDays) {
        const dayDiff = Math.abs(Number(dest.suggestedDays) - intent.days);
        if (dayDiff <= 2) {
          total += 8;
          reasons.push(`建议停留 ${dest.suggestedDays} 天`);
        }
      }

      if (dest.priority === 1) total += 4;

      if (intent.hasIntent && total < 16) continue;
      if (!intent.hasIntent && total <= 0) continue;

      if (intent.maxBudgetRmb && comfortRmb !== null) {
        caveats.push('预算为历史参考估算，非实时机酒报价');
      }

      // Match spot hint
      let matchedSpot = null;
      let matchedSpotIdx = -1;
      const spotNames = dest.spotNames || (Array.isArray(dest.spots) ? dest.spots.map((s) => s.name) : []);
      if (qLower && spotNames.length) {
        for (let s = 0; s < spotNames.length; s++) {
          if (String(spotNames[s] || '').toLowerCase().includes(qLower)) {
            matchedSpot = { name: spotNames[s] };
            matchedSpotIdx = s;
            break;
          }
        }
      }

      scored.push({
        dest,
        score: Math.round(total),
        matchedSpot,
        matchedSpotIdx,
        reasons: reasons.slice(0, 3),
        caveats: caveats.slice(0, 2)
      });
    }

    scored.sort((a, b) => b.score - a.score);
    return {
      intent,
      results: scored.slice(0, options.limit || 28)
    };
  }

  /**
   * Lightweight geographic knowledge graph relation finder:
   * links destinations by country/region, shared landscape archetypes, peak season & proximity.
   */
  function findRelatedDestinations(dest, allDestinations, limit) {
    if (!dest || !Array.isArray(allDestinations)) return [];
    const maxN = limit || 5;
    const srcLands = new Set(getDestLandscapes(dest, null));
    const srcPeak = new Set();
    if (Array.isArray(dest.months)) {
      dest.months.forEach((m) => { if (m && m.score >= 4) srcPeak.add(m.m); });
    } else if (Array.isArray(dest.monthScores)) {
      dest.monthScores.forEach((sc, idx) => { if (sc >= 4) srcPeak.add(idx + 1); });
    }

    const candidates = [];
    for (let i = 0; i < allDestinations.length; i++) {
      const other = allDestinations[i];
      if (!other || other.id === dest.id) continue;

      let score = 0;
      const tags = [];
      let distKm = null;

      if (Array.isArray(dest.coords) && Array.isArray(other.coords)) {
        distKm = Math.round(haversineKm(dest.coords, other.coords));
        if (distKm <= 350) {
          score += 24;
          tags.push(`邻近 ${distKm}km`);
        } else if (distKm <= 900) {
          score += 12;
          tags.push(`同区域 ${distKm}km`);
        }
      }

      if (dest.country && other.country === dest.country) {
        score += 14;
        if (!tags.length) tags.push(other.country);
      } else if (dest.region && other.region === dest.region) {
        score += 8;
      }

      const otherLands = getDestLandscapes(other, null);
      const sharedLands = otherLands.filter((l) => srcLands.has(l));
      if (sharedLands.length) {
        score += sharedLands.length * 9;
        const firstRule = LANDSCAPE_RULES.find((r) => r.id === sharedLands[0]);
        if (firstRule) tags.push(`同属${firstRule.label.split('/')[0]}`);
      }

      let sharedPeakCount = 0;
      if (Array.isArray(other.monthScores)) {
        other.monthScores.forEach((sc, idx) => { if (sc >= 4 && srcPeak.has(idx + 1)) sharedPeakCount++; });
      }
      if (sharedPeakCount >= 2) score += 6;

      if (score >= 16) {
        candidates.push({
          dest: other,
          score,
          distanceKm: distKm,
          relationLabel: tags.slice(0, 2).join(' · ') || '地理景观关联'
        });
      }
    }

    candidates.sort((a, b) => b.score - a.score);
    return candidates.slice(0, maxN);
  }

  return {
    LANDSCAPE_RULES,
    tokenizeGeoText,
    classifyLandscapesFromText,
    parseNaturalQuery,
    searchAndExplain,
    findRelatedDestinations
  };
});
