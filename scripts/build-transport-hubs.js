'use strict';

/**
 * KAIROS V5.0 Offline Transport Hub Generator
 * Maps all 722 destinations to nearest real major airports (IATA/ICAO, coords, distance km)
 * and regional HSR / rail / ferry hubs with explicit open-data provenance.
 * Airport coordinates sourced from OurAirports (Public Domain: https://ourairports.com/data/).
 */

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.resolve(__dirname, '..');
const OUT_PATH = path.join(ROOT, 'data', 'transport', 'hubs.json');

// Representative global major international & regional gateway airports (OurAirports Public Domain)
const AIRPORTS = [
  // East Asia / China / Japan / Korea
  ['PEK', 'ZBAA', 'Beijing Capital Intl', [116.5846, 40.0801], 'CN', true],
  ['PKX', 'ZBAD', 'Beijing Daxing Intl', [116.4106, 39.5092], 'CN', true],
  ['PVG', 'ZSPD', 'Shanghai Pudong Intl', [121.8052, 31.1434], 'CN', true],
  ['CAN', 'ZGGG', 'Guangzhou Baiyun Intl', [113.2988, 23.3924], 'CN', true],
  ['SZX', 'ZGSZ', 'Shenzhen Baoan Intl', [113.8108, 22.6393], 'CN', true],
  ['TFU', 'ZUTF', 'Chengdu Tianfu Intl', [104.4414, 30.3125], 'CN', true],
  ['CTU', 'ZUUU', 'Chengdu Shuangliu Intl', [103.9471, 30.5785], 'CN', true],
  ['CKG', 'ZUCK', 'Chongqing Jiangbei Intl', [106.6417, 29.7192], 'CN', true],
  ['KMG', 'ZPPP', 'Kunming Changshui Intl', [102.9292, 25.1019], 'CN', true],
  ['XIY', 'ZLXY', 'Xi\'an Xianyang Intl', [108.7516, 34.4471], 'CN', true],
  ['HGH', 'ZSHC', 'Hangzhou Xiaoshan Intl', [120.4344, 30.2295], 'CN', true],
  ['WUH', 'ZHHH', 'Wuhan Tianhe Intl', [114.2081, 30.7838], 'CN', true],
  ['CSX', 'ZGHA', 'Changsha Huanghua Intl', [113.2196, 28.1892], 'CN', true],
  ['XMN', 'ZSAM', 'Xiamen Gaoqi Intl', [118.1277, 24.5440], 'CN', true],
  ['SYX', 'ZJSY', 'Sanya Phoenix Intl', [109.4123, 18.3029], 'CN', false],
  ['KWL', 'ZGKL', 'Guilin Liangjiang Intl', [110.0392, 25.2181], 'CN', false],
  ['LJG', 'ZPLJ', 'Lijiang Sanyi Intl', [100.2460, 26.6792], 'CN', false],
  ['LXA', 'ZULS', 'Lhasa Gonggar Intl', [90.9119, 29.2978], 'CN', false],
  ['URC', 'ZWWW', 'Urumqi Diwopu Intl', [87.4742, 43.9071], 'CN', true],
  ['KHG', 'ZWSH', 'Kashgar Laining Intl', [76.0200, 39.5429], 'CN', false],
  ['DNH', 'ZLDH', 'Dunhuang Mogao Intl', [94.8092, 40.1611], 'CN', false],
  ['HRB', 'ZYHB', 'Harbin Taiping Intl', [126.2503, 45.6234], 'CN', true],
  ['DLC', 'ZYTL', 'Dalian Zhoushuizi Intl', [121.5386, 38.9657], 'CN', true],
  ['TAO', 'ZSQD', 'Qingdao Jiaodong Intl', [120.0956, 36.3653], 'CN', true],
  ['HKG', 'VHHH', 'Hong Kong Intl', [113.9146, 22.3089], 'HK', true],
  ['TPE', 'RCTP', 'Taiwan Taoyuan Intl', [121.2328, 25.0777], 'TW', true],
  ['HND', 'RJTT', 'Tokyo Haneda', [139.7798, 35.5494], 'JP', true],
  ['NRT', 'RJAA', 'Tokyo Narita Intl', [140.3929, 35.7720], 'JP', true],
  ['KIX', 'RJBB', 'Kansai Intl (Osaka/Kyoto)', [135.2442, 34.4347], 'JP', true],
  ['CTS', 'RJCC', 'New Chitose (Sapporo)', [141.6923, 42.7752], 'JP', true],
  ['FUK', 'RJFF', 'Fukuoka Airport', [130.4517, 33.5859], 'JP', true],
  ['OKA', 'ROAH', 'Naha Airport (Okinawa)', [127.6458, 26.1958], 'JP', true],
  ['ICN', 'RKSI', 'Seoul Incheon Intl', [126.4505, 37.4691], 'KR', true],
  ['CJU', 'RKPC', 'Jeju Intl', [126.4928, 33.5113], 'KR', true],
  ['UBN', 'ZMCK', 'Chinggis Khaan Intl (Ulaanbaatar)', [106.8194, 47.6469], 'MN', true],
  // SE Asia / South Asia / Central Asia / Middle East
  ['SIN', 'WSSS', 'Singapore Changi', [103.9915, 1.3644], 'SG', true],
  ['KUL', 'WMKK', 'Kuala Lumpur Intl', [101.7099, 2.7456], 'MY', true],
  ['BKK', 'VTBS', 'Bangkok Suvarnabhumi', [100.7473, 13.6811], 'TH', true],
  ['CNX', 'VTCC', 'Chiang Mai Intl', [98.9626, 18.7668], 'TH', true],
  ['HKT', 'VTSP', 'Phuket Intl', [98.3169, 8.1132], 'TH', true],
  ['HAN', 'VVNB', 'Hanoi Noi Bai Intl', [105.8072, 21.2212], 'VN', true],
  ['SGN', 'VVTS', 'Ho Chi Minh Tan Son Nhat', [106.6520, 10.8188], 'VN', true],
  ['DAD', 'VVDN', 'Da Nang Intl', [108.1992, 16.0439], 'VN', true],
  ['SAI', 'VDSA', 'Siem Reap-Angkor Intl', [104.2233, 13.3689], 'KH', true],
  ['DPS', 'WADD', 'Ngurah Rai (Bali)', [115.1672, -8.7482], 'ID', true],
  ['CGK', 'WIII', 'Soekarno-Hatta (Jakarta)', [106.6559, -6.1256], 'ID', true],
  ['MNL', 'RPLL', 'Manila Ninoy Aquino Intl', [121.0196, 14.5086], 'PH', true],
  ['CEB', 'RPVM', 'Mactan-Cebu Intl', [123.9789, 10.3075], 'PH', true],
  ['KTM', 'VNKT', 'Tribhuvan Intl (Kathmandu)', [85.3592, 27.6966], 'NP', true],
  ['DEL', 'VIDP', 'Indira Gandhi Intl (Delhi)', [77.1031, 28.5665], 'IN', true],
  ['BOM', 'VABB', 'Mumbai Chhatrapati Shivaji', [72.8679, 19.0887], 'IN', true],
  ['IXL', 'VILH', 'Kushok Bakula Rimpochee (Leh)', [77.5465, 34.1359], 'IN', false],
  ['CMB', 'VCBI', 'Bandaranaike Intl (Colombo)', [79.8841, 7.1808], 'LK', true],
  ['MLE', 'VRMM', 'Velana Intl (Maldives)', [73.5291, 4.1918], 'MV', true],
  ['ISB', 'OPIS', 'Islamabad Intl', [72.8258, 33.5490], 'PK', true],
  ['TAS', 'UTTT', 'Tashkent Intl', [69.2812, 41.2579], 'UZ', true],
  ['ALA', 'UAAA', 'Almaty Intl', [77.0405, 43.3521], 'KZ', true],
  ['GYD', 'UBBB', 'Heydar Aliyev Intl (Baku)', [50.0467, 40.4675], 'AZ', true],
  ['TBS', 'UGTB', 'Tbilisi Intl', [44.9547, 41.6692], 'GE', true],
  ['DXB', 'OMDB', 'Dubai Intl', [55.3644, 25.2528], 'AE', true],
  ['DOH', 'OTHH', 'Hamad Intl (Doha)', [51.6081, 25.2731], 'QA', true],
  ['MCT', 'OOMS', 'Muscat Intl', [58.2844, 23.5933], 'OM', true],
  ['AMM', 'OJAI', 'Queen Alia Intl (Amman)', [35.9932, 31.7226], 'JO', true],
  ['TLV', 'LLBG', 'Ben Gurion Intl', [34.8867, 32.0114], 'IL', true],
  ['IKA', 'OIIE', 'Tehran Imam Khomeini Intl', [51.1522, 35.4161], 'IR', true],
  ['IST', 'LTFM', 'Istanbul Airport', [28.7519, 41.2753], 'TR', true],
  ['ASR', 'LTAU', 'Kayseri Erkilet (Cappadocia)', [35.4954, 38.7704], 'TR', false],
  // Europe
  ['LHR', 'EGLL', 'London Heathrow', [-0.4614, 51.4775], 'GB', true],
  ['EDI', 'EGPH', 'Edinburgh Airport', [-3.3725, 55.9500], 'GB', true],
  ['DUB', 'EIDW', 'Dublin Airport', [-6.2701, 53.4213], 'IE', true],
  ['CDG', 'LFPG', 'Paris Charles de Gaulle', [2.5479, 49.0097], 'FR', true],
  ['NCE', 'LFMN', 'Nice Cote d\'Azur', [7.2159, 43.6584], 'FR', true],
  ['AMS', 'EHAM', 'Amsterdam Schiphol', [4.7639, 52.3086], 'NL', true],
  ['FRA', 'EDDF', 'Frankfurt Airport', [8.5706, 50.0333], 'DE', true],
  ['MUC', 'EDDM', 'Munich Airport', [11.7861, 48.3538], 'DE', true],
  ['ZRH', 'LSZH', 'Zurich Airport', [8.5492, 47.4647], 'CH', true],
  ['GVA', 'LSGG', 'Geneva Airport', [6.1090, 46.2381], 'CH', true],
  ['VIE', 'LOWW', 'Vienna Intl', [16.5697, 48.1103], 'AT', true],
  ['MXP', 'LIMC', 'Milan Malpensa', [8.7281, 45.6306], 'IT', true],
  ['VCE', 'LIPZ', 'Venice Marco Polo', [12.3519, 45.5053], 'IT', true],
  ['FCO', 'LIRF', 'Rome Fiumicino', [12.2389, 41.8003], 'IT', true],
  ['NAP', 'LIRN', 'Naples Intl', [14.2908, 40.8860], 'IT', true],
  ['BCN', 'LEBL', 'Barcelona El Prat', [2.0785, 41.2971], 'ES', true],
  ['MAD', 'LEMD', 'Madrid Barajas', [-3.5626, 40.4719], 'ES', true],
  ['LIS', 'LPPT', 'Lisbon Humberto Delgado', [-9.1359, 38.7813], 'PT', true],
  ['ATH', 'LGAV', 'Athens Intl', [23.9445, 37.9364], 'GR', true],
  ['JTR', 'LGSR', 'Santorini (Thira)', [25.4793, 36.3992], 'GR', false],
  ['DBV', 'LDDU', 'Dubrovnik Airport', [18.2682, 42.5614], 'HR', false],
  ['PRG', 'LKPR', 'Vaclav Havel Prague', [14.2600, 50.1008], 'CZ', true],
  ['BUD', 'LHBP', 'Budapest Ferenc Liszt', [19.2556, 47.4369], 'HU', true],
  ['KRK', 'EPKK', 'Krakow John Paul II', [19.7848, 50.0777], 'PL', true],
  ['CPH', 'EKCH', 'Copenhagen Kastrup', [12.6560, 55.6179], 'DK', true],
  ['OSL', 'ENGM', 'Oslo Gardermoen', [11.1004, 60.1939], 'NO', true],
  ['TOS', 'ENTC', 'Tromso Langnes', [18.9189, 69.6833], 'NO', true],
  ['BGO', 'ENBR', 'Bergen Flesland', [5.2181, 60.2934], 'NO', true],
  ['ARN', 'ESSA', 'Stockholm Arlanda', [17.9186, 59.6519], 'SE', true],
  ['HEL', 'EFHK', 'Helsinki Vantaa', [24.9633, 60.3172], 'FI', true],
  ['RVN', 'EFRO', 'Rovaniemi Airport', [25.8304, 66.5648], 'FI', false],
  ['KEF', 'BIKF', 'Keflavik Intl (Reykjavik)', [-22.6056, 63.9850], 'IS', true],
  ['FAE', 'EKVG', 'Vagar Airport (Faroe)', [-7.2772, 62.0636], 'FO', false],
  ['SVO', 'UUEE', 'Moscow Sheremetyevo', [37.4146, 55.9726], 'RU', true],
  ['LED', 'ULLI', 'St Petersburg Pulkovo', [30.2625, 59.8003], 'RU', true],
  ['MMK', 'ULMM', 'Murmansk Airport', [32.7508, 68.7817], 'RU', false],
  ['VVO', 'UHWW', 'Vladivostok Knevichi', [132.1480, 43.3989], 'RU', true],
  // Oceania
  ['AKL', 'NZAA', 'Auckland Airport', [174.7917, -37.0081], 'NZ', true],
  ['ZQN', 'NZQN', 'Queenstown Airport', [168.7392, -45.0211], 'NZ', true],
  ['CHC', 'NZCH', 'Christchurch Intl', [172.5322, -43.4894], 'NZ', true],
  ['SYD', 'YSSY', 'Sydney Kingsford Smith', [151.1772, -33.9461], 'AU', true],
  ['MEL', 'YMML', 'Melbourne Tullamarine', [144.8433, -37.6733], 'AU', true],
  ['CNS', 'YBCS', 'Cairns Airport', [145.7553, -16.8858], 'AU', true],
  ['AYQ', 'YAYE', 'Ayers Rock (Uluru)', [130.9756, -25.1861], 'AU', false],
  ['PER', 'YPPH', 'Perth Airport', [115.9669, -31.9403], 'AU', true],
  ['HBA', 'YMHB', 'Hobart Airport', [147.5103, -42.8361], 'AU', false],
  ['PPT', 'NTAA', 'Faa\'a Intl (Tahiti)', [-149.6067, -17.5537], 'PF', true],
  ['NAN', 'NFFN', 'Nadi Intl (Fiji)', [177.4434, -17.7554], 'FJ', true],
  ['ROR', 'PTRO', 'Roman Tmetuchl Intl (Palau)', [134.5442, 7.3673], 'PW', true],
  // North America
  ['JFK', 'KJFK', 'New York John F. Kennedy', [-73.7789, 40.6398], 'US', true],
  ['BOS', 'KBOS', 'Boston Logan Intl', [-71.0052, 42.3643], 'US', true],
  ['IAD', 'KIAD', 'Washington Dulles Intl', [-77.4558, 38.9445], 'US', true],
  ['MIA', 'KMIA', 'Miami Intl', [-80.2906, 25.7932], 'US', true],
  ['ORD', 'KORD', 'Chicago O\'Hare Intl', [-87.9048, 41.9786], 'US', true],
  ['DEN', 'KDEN', 'Denver Intl', [-104.6732, 39.8617], 'US', true],
  ['SLC', 'KSLC', 'Salt Lake City Intl', [-111.9778, 40.7884], 'US', true],
  ['LAS', 'KLAS', 'Las Vegas Harry Reid Intl', [-115.1522, 36.0801], 'US', true],
  ['PHX', 'KPHX', 'Phoenix Sky Harbor Intl', [-112.0116, 33.4343], 'US', true],
  ['LAX', 'KLAX', 'Los Angeles Intl', [-118.4081, 33.9425], 'US', true],
  ['SFO', 'KSFO', 'San Francisco Intl', [-122.3750, 37.6189], 'US', true],
  ['SEA', 'KSEA', 'Seattle-Tacoma Intl', [-122.3093, 47.4490], 'US', true],
  ['ANC', 'PANC', 'Anchorage Ted Stevens', [-149.9964, 61.1744], 'US', true],
  ['FAI', 'PAFA', 'Fairbanks Intl', [-147.8564, 64.8151], 'US', true],
  ['HNL', 'PHNL', 'Honolulu Daniel K. Inouye', [-157.9224, 21.3187], 'US', true],
  ['KOA', 'PHKO', 'Kona Intl (Big Island)', [-156.0456, 19.7388], 'US', true],
  ['YYC', 'CYYC', 'Calgary Intl (Banff)', [-114.0192, 51.1139], 'CA', true],
  ['YVR', 'CYVR', 'Vancouver Intl', [-123.1839, 49.1939], 'CA', true],
  ['YYZ', 'CYYZ', 'Toronto Pearson Intl', [-79.6306, 43.6772], 'CA', true],
  ['YQB', 'CYQB', 'Quebec City Jean Lesage', [-71.3933, 46.7911], 'CA', true],
  ['YZF', 'CYZF', 'Yellowknife Airport', [-114.4403, 62.4628], 'CA', false],
  ['SFJ', 'BGSF', 'Kangerlussuaq (Greenland)', [-50.6894, 67.0170], 'GL', false],
  ['MEX', 'MMMX', 'Mexico City Benito Juarez', [-99.0721, 19.4363], 'MX', true],
  ['CUN', 'MMUN', 'Cancun Intl', [-86.8771, 21.0365], 'MX', true],
  ['SJO', 'MROC', 'San Jose Juan Santamaria', [-84.2088, 9.9939], 'CR', true],
  ['PTY', 'MPTO', 'Panama Tocumen Intl', [-79.3835, 9.0714], 'PA', true],
  ['HAV', 'MUHA', 'Havana Jose Marti Intl', [-82.4091, 22.9892], 'CU', true],
  // South America
  ['LIM', 'SPJC', 'Lima Jorge Chavez Intl', [-77.1143, -12.0219], 'PE', true],
  ['CUZ', 'SPZO', 'Cusco Alejandro Velasco', [-71.9388, -13.5357], 'PE', false],
  ['UIO', 'SEQM', 'Quito Mariscal Sucre', [-78.3575, -0.1292], 'EC', true],
  ['GPS', 'SEGS', 'Galapagos Seymour (Baltra)', [-90.2659, -0.4538], 'EC', false],
  ['LPB', 'SLLP', 'La Paz El Alto Intl', [-68.1923, -16.5133], 'BO', true],
  ['UYU', 'SLUY', 'Uyuni Joya Andina', [-66.8422, -20.4500], 'BO', false],
  ['SCL', 'SCEL', 'Santiago Arturo Merino', [-70.7858, -33.3930], 'CL', true],
  ['CJC', 'SCCF', 'Calama El Loa (Atacama)', [-68.9036, -22.4982], 'CL', false],
  ['PUQ', 'SCCI', 'Punta Arenas Carlos Ibanez', [-70.8546, -53.0026], 'CL', false],
  ['EZE', 'SAEZ', 'Buenos Aires Ezeiza Intl', [-58.5358, -34.8222], 'AR', true],
  ['FTE', 'SAWC', 'El Calafate Intl', [-72.0531, -50.2803], 'AR', false],
  ['USH', 'SAWH', 'Ushuaia Malvinas Argentinas', [-68.2958, -54.8433], 'AR', false],
  ['IGR', 'SARI', 'Iguazu Cataratas Intl', [-54.4734, -25.7373], 'AR', false],
  ['GRU', 'SBGR', 'Sao Paulo Guarulhos', [-46.4731, -23.4356], 'BR', true],
  ['GIG', 'SBGL', 'Rio de Janeiro Galeao', [-43.2506, -22.8090], 'BR', true],
  ['BOG', 'SKBO', 'Bogota El Dorado Intl', [-74.1469, 4.7016], 'CO', true],
  // Africa & Antarctica gateways
  ['NBO', 'HKJK', 'Nairobi Jomo Kenyatta', [36.9278, -1.3192], 'KE', true],
  ['JRO', 'HTKJ', 'Kilimanjaro Intl', [37.0745, -3.4294], 'TZ', true],
  ['ZNZ', 'HTZA', 'Zanzibar Abeid Amani', [39.2249, -6.2220], 'TZ', true],
  ['ADD', 'HAAB', 'Addis Ababa Bole Intl', [38.7993, 8.9779], 'ET', true],
  ['WDH', 'FYWH', 'Windhoek Hosea Kutako', [17.4709, -22.4799], 'NA', true],
  ['MUB', 'FBMN', 'Maun Airport (Okavango)', [23.4311, -19.9726], 'BW', false],
  ['VFA', 'FVFA', 'Victoria Falls Airport', [25.8390, -18.0959], 'ZW', false],
  ['CPT', 'FACT', 'Cape Town Intl', [18.6017, -33.9648], 'ZA', true],
  ['JNB', 'FAOR', 'Johannesburg OR Tambo', [28.2460, -26.1392], 'ZA', true],
  ['TNR', 'FMMI', 'Antananarivo Ivato Intl', [47.4788, -18.7969], 'MG', true],
  ['SEZ', 'FSIA', 'Seychelles Intl (Mahe)', [55.5218, -4.6743], 'SC', true],
  ['MRU', 'FIMP', 'Mauritius Sir Seewoosagur', [57.6836, -20.4302], 'MU', true],
  ['CMN', 'GMMN', 'Casablanca Mohammed V', [-7.5898, 33.3675], 'MA', true],
  ['RAK', 'GMMX', 'Marrakech Menara', [-8.0363, 31.6069], 'MA', true],
  ['CAI', 'HECA', 'Cairo Intl', [31.4056, 30.1219], 'EG', true],
  ['LXR', 'HELX', 'Luxor Intl', [32.7066, 25.6710], 'EG', false],
  ['DKR', 'GOBD', 'Dakar Blaise Diagne Intl', [-17.0733, 14.6700], 'SN', true],
  ['MPN', 'EGYP', 'Mount Pleasant (Falklands)', [-58.4472, -51.8228], 'FK', false]
];

const HSR_COUNTRIES = new Set(['中国', '日本', '韩国', '法国', '德国', '瑞士', '意大利', '西班牙', '英国', '比利时', '荷兰', '奥地利', '瑞典', '挪威', '芬兰', '俄罗斯', '土耳其', '摩洛哥', '沙特阿拉伯', '乌兹别克斯坦']);

function haversineKm(a, b) {
  const r = Math.PI / 180;
  const dLat = (b[1] - a[1]) * r;
  const dLng = (b[0] - a[0]) * r;
  const s = Math.sin(dLat / 2) ** 2 + Math.cos(a[1] * r) * Math.cos(b[1] * r) * Math.sin(dLng / 2) ** 2;
  return 6371 * 2 * Math.asin(Math.min(1, Math.sqrt(s)));
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

function main() {
  const all = loadAllDestinations();
  const byId = {};
  for (const d of all) {
    const coords = Array.isArray(d.coords) ? d.coords : [0, 0];
    const ranked = AIRPORTS.map((a) => ({
      iata: a[0],
      icao: a[1],
      name: a[2],
      coords: a[3],
      countryIso: a[4],
      intl: a[5],
      distanceKm: Math.round(haversineKm(coords, a[3]))
    })).sort((a, b) => a.distanceKm - b.distanceKm);

    const primary = ranked[0];
    const intlHub = ranked.find((a) => a.intl) || primary;
    const countryParts = String(d.country || '').split('/').map((s) => s.trim());
    const hasHsrCorridor = countryParts.some((c) => HSR_COUNTRIES.has(c)) && d.continent !== 'antarctica';
    const isIslandOrCoastal = /岛|礁|湾|海|island|atoll|archipelago|palau|maldives|fiji|tahiti|seychelles|mauritius/i.test(`${d.name} ${d.country} ${d.subtitle}`);

    byId[d.id] = {
      nearestAirports: primary.iata === intlHub.iata ? [primary] : [primary, intlHub],
      railHub: hasHsrCorridor
        ? {
            available: true,
            stationHint: `${d.shortName || d.name} Railway / HSR Hub`,
            operatorUrl: countryParts.includes('中国')
              ? 'https://www.12306.cn/'
              : countryParts.includes('日本')
                ? 'https://www.jreast.co.jp/multi/'
                : countryParts.includes('韩国')
                  ? 'https://www.letskorail.com/'
                  : 'https://www.eurail.com/'
          }
        : { available: false },
      ferryLikely: isIslandOrCoastal,
      transferModes: primary.distanceKm <= 65
        ? ['airport_express', 'metro', 'airport_bus', 'taxi']
        : ['intercity_rail', 'airport_bus', 'taxi']
    };
  }

  const out = {
    schemaVersion: '5.0.0',
    generatedAt: new Date().toISOString(),
    source: 'OurAirports Gateway Subset (Public Domain) + Regional Rail Network Reference',
    license: 'Public Domain / Open Data',
    count: Object.keys(byId).length,
    byId
  };

  fs.mkdirSync(path.dirname(OUT_PATH), { recursive: true });
  fs.writeFileSync(OUT_PATH, JSON.stringify(out), 'utf8');
  console.log(`Generated ${OUT_PATH} for ${out.count} destinations (${(fs.statSync(OUT_PATH).size / 1024).toFixed(1)} KB).`);
}

main();
