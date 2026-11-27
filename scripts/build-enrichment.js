'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const rootDir = path.resolve(__dirname, '..');
const outDir = path.join(rootDir, 'data', 'enrichment');
const outPath = path.join(outDir, 'atlas-enrichment.json');

const LANDSCAPE_RULES = [
  { id: 'autumn', re: /秋|红叶|枫|落叶松|白桦|银杏|胡杨|彩林/i },
  { id: 'blossom', re: /樱|花海|薰衣草|油菜花|郁金香|杜鹃|杏花|桃花/i },
  { id: 'snow', re: /雪|雾凇|蓝冰|粉雪|冬季/i },
  { id: 'glacier', re: /冰川|冰原|冰湖|冰洞|峡湾/i },
  { id: 'aurora', re: /极光|极夜/i },
  { id: 'milkyway', re: /银河|星空|星轨|暗夜|观星/i },
  { id: 'lake', re: /湖|海子|镜湖|盐湖/i },
  { id: 'coast', re: /海|海岸|海岛|礁|沙滩|灯塔|海湾/i },
  { id: 'desert', re: /沙漠|沙丘|戈壁|雅丹|丹霞|荒漠/i },
  { id: 'forest', re: /森林|林海|雨林|原始林|竹海|红杉/i },
  { id: 'cloudsea', re: /云海|晨雾|佛光|平流雾|日照金山/i },
  { id: 'mountain', re: /山|峰|垭口|草甸|高山/i },
  { id: 'architecture', re: /城|古镇|古城|宫|寺|教堂|塔|桥|街区|博物馆/i },
  { id: 'volcano', re: /火山|间歇泉|地热|温泉/i },
  { id: 'grassland', re: /草原|牧场|高地/i },
  { id: 'canyon', re: /峡谷|瀑布|深谷/i }
];

function parseElevationMeters(elevStr) {
  if (!elevStr) return null;
  const cleaned = String(elevStr).replace(/,/g, '');
  const nums = cleaned.match(/-?\d+(?:\.\d+)?/g);
  if (!nums || !nums.length) return null;
  const vals = nums.map(Number).filter((n) => Number.isFinite(n) && n >= -500 && n <= 9000);
  if (!vals.length) return null;
  return Math.round(vals.reduce((a, b) => a + b, 0) / vals.length);
}

function sumBudgetTier(tierObj) {
  if (!tierObj || !Array.isArray(tierObj.items)) return null;
  const sum = tierObj.items.reduce((acc, it) => acc + (Number(it && it.cost) || 0), 0);
  return sum > 0 ? Math.round(sum) : null;
}

function parseTempMean(tempStr) {
  if (!tempStr) return null;
  const nums = String(tempStr).match(/-?\d+(?:\.\d+)?/g);
  if (!nums || !nums.length) return null;
  const vals = nums.map(Number).filter(Number.isFinite);
  if (!vals.length) return null;
  return Number((vals.reduce((a, b) => a + b, 0) / vals.length).toFixed(1));
}

function main() {
  const indexHtml = fs.readFileSync(path.join(rootDir, 'index.html'), 'utf8');
  const scriptMatches = [...indexHtml.matchAll(/<script src="(data\/[^"?]+)(?:\?v=\d+)?"><\/script>/g)];
  const dataScripts = scriptMatches.map((m) => m[1]);

  const sandbox = { window: {}, console };
  sandbox.window = sandbox;
  for (const rel of dataScripts) {
    const src = fs.readFileSync(path.join(rootDir, rel), 'utf8');
    vm.runInNewContext(src, sandbox);
  }

  const all = sandbox.TRAVEL_ATLAS.getAll();
  const auditPath = path.join(rootDir, 'data', 'audit-report.json');
  const audit = fs.existsSync(auditPath) ? JSON.parse(fs.readFileSync(auditPath, 'utf8')) : null;

  const outlierCountByCity = new Map();
  if (audit && audit.reviewQueue && Array.isArray(audit.reviewQueue.distanceOutliers)) {
    for (const item of audit.reviewQueue.distanceOutliers) {
      outlierCountByCity.set(item.cityId, (outlierCountByCity.get(item.cityId) || 0) + 1);
    }
  }

  const byId = {};
  for (const dest of all) {
    const spots = Array.isArray(dest.spots) ? dest.spots : [];
    const textBlob = [
      dest.name,
      dest.subtitle,
      dest.heroSummary,
      (dest.badges || []).join(' '),
      (dest.months || []).map((m) => m.highlight || '').join(' '),
      spots.map((s) => `${s.name} ${s.category || ''} ${s.scene || ''}`).join(' ')
    ].join(' ');

    const landscapeTypes = LANDSCAPE_RULES
      .filter((r) => r.re.test(textBlob))
      .map((r) => r.id);

    const peakMonths = (dest.months || [])
      .filter((m) => m && Number(m.score) >= 4)
      .map((m) => m.m);

    const monthlyClimateSummary = (dest.months || []).map((m) => ({
      m: m.m,
      score: Number(m.score) || 0,
      tempMeanC: parseTempMean(m.temp),
      rain: m.rain || '',
      source: 'empirical-archive'
    }));

    const outlierSpotsCount = outlierCountByCity.get(dest.id) || 0;
    byId[dest.id] = {
      id: dest.id,
      elevationM: parseElevationMeters(dest.elevation),
      landscapeTypes,
      peakMonths,
      comfortBudgetRmb: sumBudgetTier(dest.budget && dest.budget.comfort),
      luxuryBudgetRmb: sumBudgetTier(dest.budget && dest.budget.luxury),
      budgetSource: 'archive-estimate',
      monthlyClimateSummary,
      quality: {
        spotCount: spots.length,
        outlierSpotsCount,
        verificationStatus: outlierSpotsCount > 0 ? 'needs-review' : 'verified-internal',
        confidence: outlierSpotsCount > 0 ? 'medium' : 'high',
        source: 'World Travel Globe Curated Atlas (Non-Destructive Layer)'
      }
    };
  }

  const now = new Date();
  const datasetVersion = `${now.getUTCFullYear()}.${String(now.getUTCMonth() + 1).padStart(2, '0')}.${String(now.getUTCDate()).padStart(2, '0')}`;

  const output = {
    schemaVersion: '4.0.0',
    datasetVersion,
    generatedAt: now.toISOString(),
    nonDestructive: true,
    totalCities: all.length,
    byId
  };

  fs.mkdirSync(outDir, { recursive: true });
  fs.writeFileSync(outPath, JSON.stringify(output), 'utf8');
  console.log(`Built non-destructive enrichment layer: ${outPath} (${all.length} cities, ${(Buffer.byteLength(JSON.stringify(output)) / 1024).toFixed(1)} KB)`);
}

main();
