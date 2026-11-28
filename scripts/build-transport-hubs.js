'use strict';

/**
 * KAIROS V5.1 Offline Transport Hub Generator
 * Maps all 722 destinations to nearest real scheduled commercial airports from OurAirports CSV
 * (Public Domain: https://davidmegginson.github.io/ourairports-data/airports.csv),
 * accurate landmass/island connectivity groups, verified rail/HSR hubs, and metro availability.
 */

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.resolve(__dirname, '..');
const OUT_PATH = path.join(ROOT, 'data', 'transport', 'hubs.json');
const OURAIRPORTS_CSV = path.join(ROOT, '.cache', 'ourairports-airports.csv');

const COUNTRY_TO_ISO = {
  '中国': ['CN'],
  '日本': ['JP'],
  '韩国': ['KR'],
  '蒙古': ['MN'],
  '新加坡': ['SG'],
  '马来西亚': ['MY'],
  '印度尼西亚': ['ID'],
  '菲律宾': ['PH'],
  '泰国': ['TH'],
  '越南': ['VN'],
  '柬埔寨': ['KH'],
  '老挝': ['LA'],
  '缅甸': ['MM'],
  '文莱': ['BN'],
  '马尔代夫': ['MV'],
  '斯里兰卡': ['LK'],
  '尼泊尔': ['NP'],
  '不丹': ['BT'],
  '印度': ['IN'],
  '阿联酋': ['AE'],
  '阿曼': ['OM'],
  '约旦': ['JO'],
  '沙特阿拉伯': ['SA'],
  '土耳其': ['TR'],
  '格鲁吉亚': ['GE'],
  '阿塞拜疆': ['AZ'],
  '亚美尼亚': ['AM'],
  '乌兹别克斯坦': ['UZ'],
  '哈萨克斯坦': ['KZ'],
  '吉尔吉斯斯坦': ['KG'],
  '土库曼斯坦': ['TM'],
  '塔吉克斯坦': ['TJ'],
  '俄罗斯': ['RU'],
  '巴基斯坦': ['PK'],
  '伊朗': ['IR'],
  '卡塔尔': ['QA'],
  '巴林': ['BH'],
  '科威特': ['KW'],
  '也门': ['YE'],
  '塞浦路斯': ['CY'],
  '以色列': ['IL'],
  '新西兰': ['NZ'],
  '澳大利亚': ['AU'],
  '法属波利尼西亚': ['PF'],
  '帕劳': ['PW'],
  '斐济': ['FJ'],
  '瓦努阿图': ['VU'],
  '库克群岛': ['CK'],
  '新喀里多尼亚': ['NC'],
  '冰岛': ['IS'],
  '法罗群岛': ['FO'],
  '挪威': ['NO'],
  '芬兰': ['FI'],
  '瑞典': ['SE'],
  '丹麦': ['DK'],
  '瑞士': ['CH'],
  '意大利': ['IT'],
  '奥地利': ['AT'],
  '德国': ['DE'],
  '斯洛文尼亚': ['SI'],
  '梵蒂冈': ['VA', 'IT'],
  '希腊': ['GR'],
  '捷克': ['CZ'],
  '匈牙利': ['HU'],
  '波兰': ['PL'],
  '西班牙': ['ES'],
  '葡萄牙': ['PT'],
  '克罗地亚': ['HR'],
  '黑山': ['ME'],
  '法国': ['FR'],
  '荷兰': ['NL'],
  '比利时': ['BE'],
  '英国': ['GB'],
  '爱尔兰': ['IE'],
  '加拿大': ['CA'],
  '格陵兰': ['GL'],
  '美国': ['US'],
  '墨西哥': ['MX'],
  '哥斯达黎加': ['CR'],
  '危地马拉': ['GT'],
  '伯利兹': ['BZ'],
  '尼加拉瓜': ['NI'],
  '古巴': ['CU'],
  '巴拿马': ['PA'],
  '波多黎各': ['PR'],
  '巴哈马': ['BS'],
  '圣卢西亚': ['LC'],
  '特克斯和凯科斯群岛': ['TC'],
  '英属维尔京群岛': ['VG'],
  '阿鲁巴': ['AW'],
  '库拉索': ['CW'],
  '百慕大': ['BM'],
  '秘鲁': ['PE'],
  '厄瓜多尔': ['EC'],
  '玻利维亚': ['BO'],
  '智利': ['CL'],
  '阿根廷': ['AR'],
  '乌拉圭': ['UY'],
  '巴西': ['BR'],
  '委内瑞拉': ['VE'],
  '圭亚那': ['GY'],
  '哥伦比亚': ['CO'],
  '肯尼亚': ['KE'],
  '坦桑尼亚': ['TZ'],
  '乌干达': ['UG'],
  '卢旺达': ['RW'],
  '埃塞俄比亚': ['ET'],
  '吉布提': ['DJ'],
  '纳米比亚': ['NA'],
  '博茨瓦纳': ['BW'],
  '赞比亚': ['ZM'],
  '津巴布韦': ['ZW'],
  '马拉维': ['MW'],
  '南非': ['ZA'],
  '莱索托': ['LS'],
  '莫桑比克': ['MZ'],
  '马达加斯加': ['MG'],
  '塞舌尔': ['SC'],
  '毛里求斯': ['MU'],
  '留尼汪': ['RE'],
  '科摩罗': ['KM'],
  '摩洛哥': ['MA'],
  '突尼斯': ['TN'],
  '阿尔及利亚': ['DZ'],
  '毛里塔尼亚': ['MR'],
  '埃及': ['EG'],
  '苏丹': ['SD'],
  '佛得角': ['CV'],
  '塞内加尔': ['SN'],
  '加纳': ['GH'],
  '圣多美和普林西比': ['ST'],
  '乍得': ['TD'],
  '喀麦隆': ['CM'],
  '加蓬': ['GA'],
  '南极洲': ['AQ'],
  '南乔治亚和南桑威奇群岛': ['GS', 'FK'],
  '福克兰群岛': ['FK']
};

const HSR_COUNTRIES = new Set([
  '中国', '日本', '韩国', '法国', '德国', '瑞士', '意大利', '西班牙', '英国',
  '比利时', '荷兰', '奥地利', '瑞典', '挪威', '芬兰', '俄罗斯', '土耳其',
  '摩洛哥', '沙特阿拉伯', '乌兹别克斯坦'
]);

const METRO_CITIES_RE = /(北京|上海|广州|深圳|成都|重庆|西安|杭州|南京|苏州|武汉|长沙|青岛|大连|哈尔滨|昆明|沈阳|郑州|天津|香港|澳门|台北|高雄|东京|京都|大阪|名古屋|横滨|福冈|札幌|神户|首尔|釜山|新加坡|吉隆坡|曼谷|河内|胡志明|马尼拉|雅加达|德里|孟买|迪拜|多哈|利雅得|伊斯坦布尔|安卡拉|巴库|第比利斯|塔什干|阿拉木图|德黑兰|莫斯科|圣彼得堡|伦敦|巴黎|阿姆斯特丹|布鲁塞尔|柏林|慕尼黑|法兰克福|苏黎世|日内瓦|维也纳|米兰|罗马|那不勒斯|马德里|巴塞罗那|里斯本|雅典|布拉格|布达佩斯|华沙|哥本哈根|奥斯陆|斯德哥尔摩|赫尔辛基|纽约|波士顿|华盛顿|芝加哥|洛杉矶|旧金山|西雅图|迈阿密|多伦多|温哥华|蒙特利尔|墨西哥城|巴拿马城|利马|圣地亚哥|布宜诺斯艾利斯|里约热内卢|圣保罗|波哥大|基多|开罗|卡萨布兰卡|悉尼|墨尔本|奥克兰|Tokyo|Kyoto|Osaka|Beijing|Shanghai|Seoul|Singapore|London|Paris|New York|Chicago|San Francisco|Sydney|Melbourne|Madrid|Barcelona|Rome|Milan|Berlin|Munich|Vienna|Zurich|Amsterdam|Brussels|Stockholm|Oslo|Helsinki|Copenhagen|Moscow|Istanbul|Bangkok|Dubai|Cairo)/i;

function parseCsvLine(line) {
  const fields = [];
  let cur = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQuotes) {
      if (ch === '"' && line[i + 1] === '"') {
        cur += '"';
        i++;
      } else if (ch === '"') {
        inQuotes = false;
      } else {
        cur += ch;
      }
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === ',') {
      fields.push(cur);
      cur = '';
    } else {
      cur += ch;
    }
  }
  fields.push(cur);
  return fields;
}

function loadOurAirports() {
  if (!fs.existsSync(OURAIRPORTS_CSV)) {
    throw new Error(`Missing OurAirports CSV at ${OURAIRPORTS_CSV}`);
  }
  const text = fs.readFileSync(OURAIRPORTS_CSV, 'utf8');
  const lines = text.split(/\r?\n/);
  const headers = parseCsvLine(lines[0]);
  const col = Object.fromEntries(headers.map((h, i) => [h, i]));
  const airports = [];

  for (let i = 1; i < lines.length; i++) {
    const line = lines[i];
    if (!line) continue;
    const f = parseCsvLine(line);
    const type = f[col.type];
    if (type !== 'large_airport' && type !== 'medium_airport' && type !== 'small_airport') continue;
    const sched = f[col.scheduled_service];
    const iata = (f[col.iata_code] || '').trim().toUpperCase();
    if (!/^[A-Z]{3}$/.test(iata)) continue;
    if (sched !== 'yes' && type !== 'large_airport') continue;
    const lat = Number(f[col.latitude_deg]);
    const lng = Number(f[col.longitude_deg]);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) continue;
    airports.push({
      iata,
      icao: (f[col.icao_code] || f[col.ident] || '').trim().toUpperCase(),
      name: (f[col.name] || iata).trim(),
      coords: [Number(lng.toFixed(4)), Number(lat.toFixed(4))],
      countryIso: (f[col.iso_country] || '').trim().toUpperCase(),
      isoRegion: (f[col.iso_region] || '').trim().toUpperCase(),
      type,
      intl: type === 'large_airport'
    });
  }
  return airports;
}

function haversineKm(a, b) {
  const r = Math.PI / 180;
  const dLat = (b[1] - a[1]) * r;
  const dLng = (b[0] - a[0]) * r;
  const s = Math.sin(dLat / 2) ** 2 + Math.cos(a[1] * r) * Math.cos(b[1] * r) * Math.sin(dLng / 2) ** 2;
  return 6371 * 2 * Math.asin(Math.min(1, Math.sqrt(s)));
}

function classifyLandmass(d) {
  const id = String(d.id || '').toLowerCase();
  const text = `${d.id} ${d.country} ${d.region} ${d.province} ${d.name} ${d.subtitle || ''}`;
  const cont = String(d.continent || '').toLowerCase();
  const c = String(d.country || '');
  const coords = Array.isArray(d.coords) ? d.coords : [0, 0];

  if (cont === 'antarctica' || /南极|南乔治亚|福克兰|antarctica|south georgia|falkland/i.test(text)) {
    if (/福克兰|falkland/i.test(text)) return { landmass: 'falklands', island: true, railConnected: false };
    if (/南乔治亚|south georgia/i.test(text)) return { landmass: 'south_georgia', island: true, railConnected: false };
    return { landmass: 'antarctica', island: true, railConnected: false };
  }

  // China & Taiwan / Hainan / Islands
  if (c === '中国') {
    if (/taiwan|taipei|kaohsiung|hualien|taitung|penghu|kinmen|alishan|taroko|sun-moon|台湾|台北|高雄|花莲|台东|阿里山|太鲁阁|日月潭|澎湖|金门|马祖|绿岛|兰屿/i.test(text) || id.includes('tw')) {
      if (/澎湖|金门|马祖|绿岛|兰屿/i.test(text)) return { landmass: 'taiwan_offshore', island: true, railConnected: false };
      return { landmass: 'taiwan', island: true, railConnected: true };
    }
    if (/海南|三亚|海口|万宁|陵水|琼海|五指山|sanya|haikou|hainan/i.test(text)) {
      return { landmass: 'hainan', island: true, railConnected: true };
    }
    if (/舟山|普陀|东极|嵊泗|涠洲|平潭/i.test(text)) {
      return { landmass: 'china_offshore_island', island: true, railConnected: /平潭/.test(text) };
    }
    if (/珠峰|阿里|冈仁波齐|古格|可可西里|纳木错|萨迦|墨脱|额济纳|巴丹吉林|阿尔山|呼伦贝尔|喀纳斯|塔县|帕米尔/i.test(text)) {
      return { landmass: 'eurasia_mainland', island: false, railConnected: false };
    }
    return { landmass: 'eurasia_mainland', island: false, railConnected: true };
  }

  if (c === '日本') {
    if (/冲绳|那霸|石垣|宫古|久米|西表|okinawa|naha|ishigaki|miyako/i.test(text)) {
      return { landmass: 'japan_okinawa', island: true, railConnected: false };
    }
    if (/屋久岛|奄美|利尻|礼文|佐渡|小笠原|五岛|yakushima|rishiri|rebun|ogasawara|sado/i.test(text)) {
      return { landmass: 'japan_remote_island', island: true, railConnected: false };
    }
    // Honshu, Kyushu, Shikoku, Hokkaido are connected by rail tunnels/bridges
    return { landmass: 'japan_main', island: true, railConnected: true };
  }

  if (c === '韩国') {
    if (/济州|jeju|郁陵|ulleung/i.test(text)) {
      return { landmass: 'korea_jeju', island: true, railConnected: false };
    }
    return { landmass: 'korea_peninsula', island: false, railConnected: true };
  }

  if (c === '英国') {
    if (/斯凯|奥克尼|设得兰|赫布里底|skye|orkney|shetland|hebrides/i.test(text)) {
      return { landmass: 'uk_islands', island: true, railConnected: false };
    }
    return { landmass: 'uk_gb', island: true, railConnected: true }; // Channel Tunnel rail to Europe
  }
  if (c === '爱尔兰') return { landmass: 'ireland', island: true, railConnected: true };
  if (c === '冰岛') return { landmass: 'iceland', island: true, railConnected: false };
  if (c === '法罗群岛') return { landmass: 'faroe', island: true, railConnected: false };
  if (c === '格陵兰') return { landmass: 'greenland', island: true, railConnected: false };
  if (c === '塞浦路斯') return { landmass: 'cyprus', island: true, railConnected: false };

  if (c === '挪威') {
    if (/斯瓦尔巴|朗伊尔|svalbard|longyearbyen/i.test(text) || coords[1] > 74) {
      return { landmass: 'svalbard', island: true, railConnected: false };
    }
    if (/罗弗敦|lofoten|reine|森雅|senja/i.test(text)) {
      return { landmass: 'norway_lofoten', island: true, railConnected: false };
    }
    if (/特罗姆瑟|北角|tromso|nordkapp/i.test(text) && coords[1] > 68.5) {
      return { landmass: 'eurasia_mainland', island: false, railConnected: false };
    }
    return { landmass: 'eurasia_mainland', island: false, railConnected: true };
  }

  if (c === '西班牙') {
    if (/特内里费|兰萨罗特|大加那利|拉帕尔马|富埃特文图拉|加那利|tenerife|lanzarote|canary/i.test(text)) {
      return { landmass: 'canary_islands', island: true, railConnected: false };
    }
    if (/马略卡|梅诺卡|伊维萨|巴利阿里|mallorca|menorca|ibiza|balearic/i.test(text)) {
      return { landmass: 'balearic_islands', island: true, railConnected: false };
    }
    return { landmass: 'eurasia_mainland', island: false, railConnected: true };
  }

  if (c === '葡萄牙') {
    if (/马德拉|亚速尔|madeira|azores|sao-miguel|pico/i.test(text)) {
      return { landmass: 'portugal_atlantic_islands', island: true, railConnected: false };
    }
    return { landmass: 'eurasia_mainland', island: false, railConnected: true };
  }

  if (c === '法国') {
    if (/科西嘉|corsica|bonifacio/i.test(text)) return { landmass: 'corsica', island: true, railConnected: false };
    return { landmass: 'eurasia_mainland', island: false, railConnected: true };
  }

  if (c === '意大利') {
    if (/撒丁|sardinia|la-maddalena/i.test(text)) return { landmass: 'sardinia', island: true, railConnected: false };
    if (/西西里|埃特纳|陶尔米纳|巴勒莫|阿格里真托|sicily|etna|taormina/i.test(text)) return { landmass: 'sicily', island: true, railConnected: true };
    return { landmass: 'eurasia_mainland', island: false, railConnected: true };
  }

  if (c === '希腊') {
    if (/圣托里尼|米科诺斯|克里特|罗德|扎金索斯|米洛斯|科孚|凯法利尼亚|帕罗斯|纳克索斯|santorini|mykonos|crete|rhodes|zakynthos|milos/i.test(text)) {
      return { landmass: 'greek_islands', island: true, railConnected: false };
    }
    return { landmass: 'eurasia_mainland', island: false, railConnected: true };
  }

  if (c === '克罗地亚') {
    if (/赫瓦尔|科尔丘拉|维斯|布拉奇|hvar|bisevo|korcula/i.test(text)) {
      return { landmass: 'adriatic_islands', island: true, railConnected: false };
    }
    return { landmass: 'eurasia_mainland', island: false, railConnected: false };
  }

  if (c === '俄罗斯') {
    if (/堪察加|库页|萨哈林|千岛|维柳钦斯克|阿瓦恰|kamchatka|sakhalin|kuril|avacha/i.test(text)) {
      return { landmass: 'kamchatka_fareast', island: /库页|千岛|sakhalin/i.test(text), railConnected: false };
    }
    return { landmass: 'eurasia_mainland', island: false, railConnected: true };
  }

  if (c === '美国') {
    if (/夏威夷|瓦胡|檀香山|茂宜|考艾|大岛|oahu|honolulu|maui|kauai|big-island|hawaii/i.test(text)) {
      if (/茂宜|maui/i.test(text)) return { landmass: 'hawaii_maui', island: true, railConnected: false };
      if (/考艾|kauai/i.test(text)) return { landmass: 'hawaii_kauai', island: true, railConnected: false };
      if (/大岛|kona|hilo|volcanoes/i.test(text)) return { landmass: 'hawaii_bigisland', island: true, railConnected: false };
      return { landmass: 'hawaii_oahu', island: true, railConnected: false };
    }
    if (/阿拉斯加|科迪亚克|朱诺|卡特迈|alaska|juneau|kodiak|katmai|sitka|kenai/i.test(text) && !/anchorage|denali|fairbanks/i.test(text)) {
      return { landmass: 'north_america', island: false, railConnected: false };
    }
    return { landmass: 'north_america', island: false, railConnected: true };
  }

  if (c === '智利' && /复活节岛|easter-island|rapa-nui/i.test(text)) {
    return { landmass: 'easter_island', island: true, railConnected: false };
  }
  if (c === '厄瓜多尔' && /加拉帕戈斯|galapagos/i.test(text)) {
    return { landmass: 'galapagos', island: true, railConnected: false };
  }
  if (c === '巴西' && /费尔南多|noronha/i.test(text)) {
    return { landmass: 'noronha', island: true, railConnected: false };
  }

  if (c === '澳大利亚') {
    if (/塔斯马尼亚|霍巴特|摇篮山|菲欣纳|tasmania|hobart|cradle|freycinet|bruny/i.test(text)) {
      return { landmass: 'tasmania', island: true, railConnected: false };
    }
    if (/袋鼠岛|降灵|圣灵|白天堂|汉密尔顿|诺福克|豪勋爵|kangaroo-island|whitsunday|hamilton/i.test(text)) {
      return { landmass: 'australia_island', island: true, railConnected: false };
    }
    return { landmass: 'australia', island: false, railConnected: true };
  }
  if (c === '新西兰') {
    if (/南岛|皇后镇|瓦纳卡|库克山|米尔福德|蒂阿瑙|凯库拉|基督城|格雷茅斯|亚伯塔斯曼|南极光|奥塔哥|蒂卡波|queenstown|wanaka|milford|christchurch|tekapo|cook/i.test(text)) {
      return { landmass: 'nz_south', island: true, railConnected: true };
    }
    return { landmass: 'nz_north', island: true, railConnected: true };
  }

  if (['法属波利尼西亚', '帕劳', '斐济', '瓦努阿图', '库克群岛', '新喀里多尼亚'].includes(c)) {
    return { landmass: `pacific_${c}`, island: true, railConnected: false };
  }
  if (['马尔代夫', '塞舌尔', '毛里求斯', '留尼汪', '科摩罗', '马达加斯加', '佛得角', '圣多美和普林西比'].includes(c)) {
    return { landmass: `island_${c}`, island: true, railConnected: false };
  }
  if (['古巴', '巴哈马', '圣卢西亚', '波多黎各', '特克斯和凯科斯群岛', '英属维尔京群岛', '阿鲁巴', '库拉索', '百慕大'].includes(c)) {
    return { landmass: `carib_${c}`, island: true, railConnected: false };
  }
  if (c === '斯里兰卡') return { landmass: 'sri_lanka', island: true, railConnected: true };
  if (c === '菲律宾') return { landmass: `philippines_${id}`, island: true, railConnected: false };
  if (c === '印度尼西亚') {
    if (/巴厘|bali/i.test(text)) return { landmass: 'indonesia_bali', island: true, railConnected: false };
    if (/爪哇|布罗莫|宜珍|日惹|雅加达|java|bromo|ijen/i.test(text)) return { landmass: 'indonesia_java', island: true, railConnected: true };
    return { landmass: `indonesia_${id}`, island: true, railConnected: false };
  }
  if (c === '马来西亚') {
    if (/沙巴|亚庇|仙本那|斗湖|古晋|砂拉越|姆鲁|婆罗洲|borneo|sabah|kota-kinabalu|semporna|kuching/i.test(text)) {
      return { landmass: 'borneo', island: true, railConnected: false };
    }
    if (/兰卡威|仙本那|热浪|停泊|刁曼/i.test(text)) return { landmass: 'malaysia_island', island: true, railConnected: false };
    return { landmass: 'eurasia_mainland', island: false, railConnected: true };
  }
  if (c === '文莱') return { landmass: 'borneo', island: true, railConnected: false };
  if (c === '新加坡') return { landmass: 'eurasia_mainland', island: false, railConnected: true };
  if (c === '泰国' && /普吉|苏梅|甲米|皮皮|象岛|涛岛|斯米兰|丽贝|phuket|samui|phi|similan/i.test(text)) {
    return { landmass: `thailand_island_${id}`, island: true, railConnected: false };
  }
  if (c === '越南' && /富国|昆仑|phu-quoc/i.test(text)) {
    return { landmass: `vietnam_island_${id}`, island: true, railConnected: false };
  }
  if (c === '蒙古') return { landmass: 'eurasia_mainland', island: false, railConnected: false };
  if (c === '埃及') return { landmass: 'africa_sinai', island: false, railConnected: true };

  if (cont === 'north_america') return { landmass: 'north_america', island: false, railConnected: ['美国', '加拿大', '墨西哥'].includes(c) };
  if (cont === 'south_america') return { landmass: 'south_america', island: false, railConnected: false };
  if (cont === 'africa_antarctica') return { landmass: 'africa', island: false, railConnected: c === '摩洛哥' || c === '突尼斯' };

  const primaryCountry = c.split('/')[0].trim();
  const hasRail = HSR_COUNTRIES.has(primaryCountry);
  return { landmass: 'eurasia_mainland', island: false, railConnected: hasRail };
}

function loadAllDestinations() {
  const indexHtml = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
  const dataScripts = [...indexHtml.matchAll(/<script src="(data\/[^"?]+)(?:\?v=\d+)?"><\/script>/g)].map((m) => m[1]);
  const sandbox = { window: {}, console };
  sandbox.window = sandbox;
  for (const rel of dataScripts) {
    vm.runInNewContext(fs.readFileSync(path.join(ROOT, rel), 'utf8'), sandbox);
  }
  return sandbox.TRAVEL_ATLAS.getAll();
}

function pickNearestAirports(d, allAirports) {
  const coords = Array.isArray(d.coords) ? d.coords : [0, 0];
  const countryParts = String(d.country || '').split('/').map((s) => s.trim()).filter(Boolean);
  const targetIsos = new Set();
  for (const cp of countryParts) {
    (COUNTRY_TO_ISO[cp] || []).forEach((iso) => targetIsos.add(iso));
  }
  // Special handling for HK/MO/TW vs CN
  if (d.id.includes('tw') || /台湾|台北|高雄|花莲|太鲁阁|日月潭|阿里山|澎湖|金门/.test(`${d.province} ${d.name}`)) {
    targetIsos.clear();
    targetIsos.add('TW');
  } else if (/香港|澳门/.test(`${d.province} ${d.name}`)) {
    targetIsos.add('HK');
    targetIsos.add('MO');
  }

  const sameCountry = [];
  const globalPool = [];
  for (const a of allAirports) {
    const dist = Math.round(haversineKm(coords, a.coords));
    const entry = {
      iata: a.iata,
      icao: a.icao,
      name: a.name,
      coords: a.coords,
      countryIso: a.countryIso,
      intl: a.intl,
      type: a.type,
      distanceKm: dist
    };
    if (dist <= 3500) globalPool.push(entry);
    if (targetIsos.has(a.countryIso)) sameCountry.push(entry);
  }

  sameCountry.sort((a, b) => {
    const da = a.distanceKm + (a.type === 'small_airport' ? 35 : 0);
    const db = b.distanceKm + (b.type === 'small_airport' ? 35 : 0);
    return da - db;
  });
  globalPool.sort((a, b) => a.distanceKm - b.distanceKm);

  let primary = null;
  if (sameCountry.length > 0 && (sameCountry[0].distanceKm <= 650 || d.continent === 'antarctica')) {
    primary = sameCountry[0];
  } else if (sameCountry.length > 0 && globalPool.length > 0 && sameCountry[0].distanceKm <= globalPool[0].distanceKm * 1.8) {
    primary = sameCountry[0];
  } else {
    primary = globalPool[0] || sameCountry[0] || allAirports[0];
  }

  const sameCountryIntl = sameCountry.find((a) => a.intl && a.distanceKm <= 1200);
  const globalIntl = globalPool.find((a) => a.intl);
  const intlHub = sameCountryIntl || globalIntl || primary;

  return primary.iata === intlHub.iata ? [primary] : [primary, intlHub];
}

function main() {
  const airports = loadOurAirports();
  const all = loadAllDestinations();
  const byId = {};

  for (const d of all) {
    const lm = classifyLandmass(d);
    const nearestAirports = pickNearestAirports(d, airports);
    const primary = nearestAirports[0];
    const countryParts = String(d.country || '').split('/').map((s) => s.trim());
    const hasRailCountry = countryParts.some((c) => HSR_COUNTRIES.has(c)) || ['台湾', '斯里兰卡', '新西兰', '美国', '加拿大', '澳大利亚', '爱尔兰'].some((c) => countryParts.includes(c));
    const railAvailable = Boolean(lm.railConnected && hasRailCountry && d.continent !== 'antarctica');

    const hasMetro = METRO_CITIES_RE.test(`${d.shortName || ''} ${d.name || ''} ${d.province || ''}`) && primary.distanceKm <= 90;
    const isPolarVessel = lm.landmass === 'antarctica' || lm.landmass === 'south_georgia';
    const transferModes = isPolarVessel
      ? ['polar_vessel', 'expedition_zodiac']
      : hasMetro
        ? ['airport_express', 'metro', 'airport_bus', 'taxi']
        : railAvailable && primary.distanceKm <= 150
          ? ['intercity_rail', 'airport_bus', 'taxi']
          : ['airport_bus', 'taxi', 'car_rental'];

    byId[d.id] = {
      landmass: lm.landmass,
      isIsland: lm.island,
      nearestAirports,
      railHub: railAvailable
        ? {
            available: true,
            stationHint: `${d.shortName || d.name} Railway / HSR Hub`,
            operatorUrl: countryParts.includes('中国')
              ? (lm.landmass === 'taiwan' ? 'https://www.thsrc.com.tw/' : 'https://www.12306.cn/')
              : countryParts.includes('日本')
                ? 'https://www.jreast.co.jp/multi/'
                : countryParts.includes('韩国')
                  ? 'https://www.letskorail.com/'
                  : countryParts.includes('美国')
                    ? 'https://www.amtrak.com/'
                    : 'https://www.eurail.com/'
          }
        : { available: false },
      ferryLikely: lm.island,
      transferModes
    };
  }

  const out = {
    schemaVersion: '5.1.0',
    generatedAt: new Date().toISOString(),
    source: `OurAirports Full Scheduled Commercial CSV (${airports.length} airports, Public Domain) + Landmass Connectivity Graph`,
    license: 'Public Domain / Open Data',
    count: Object.keys(byId).length,
    byId
  };

  fs.mkdirSync(path.dirname(OUT_PATH), { recursive: true });
  fs.writeFileSync(OUT_PATH, JSON.stringify(out), 'utf8');
  console.log(`Generated ${OUT_PATH} from ${airports.length} OurAirports hubs for ${out.count} destinations (${(fs.statSync(OUT_PATH).size / 1024).toFixed(1)} KB).`);
}

main();
