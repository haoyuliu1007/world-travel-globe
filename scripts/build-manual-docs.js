'use strict';

/**
 * Generates KAIROS V5.0 30-Chapter Trilingual User Manual JSON files:
 *   data/docs/manual-zh-CN.json
 *   data/docs/manual-zh-TW.json
 *   data/docs/manual-en.json
 */

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.resolve(__dirname, '..');
const OUT_DIR = path.join(ROOT, 'data', 'docs');

// Reuse AppI18n.toTraditional for faithful zh-CN -> zh-TW conversion
const i18nSrc = fs.readFileSync(path.join(ROOT, 'js', 'i18n.js'), 'utf8');
const sb = { window: {}, globalThis: {}, console, localStorage: { getItem: () => null, setItem: () => {} }, navigator: { language: 'zh-CN' } };
sb.window = sb;
vm.runInNewContext(i18nSrc, sb);
const toTraditional = (s) => (sb.AppI18n && typeof sb.AppI18n.toTraditional === 'function' ? sb.AppI18n.toTraditional(s) : s);

const CHAPTERS = [
  {
    id: 1, slug: 'quick-start', groupZh: '快速上手', groupEn: 'Getting Started',
    titleZh: '5 分钟上手 KAIROS 世界旅行图谱', titleEn: '5-Minute KAIROS Quick Start',
    purposeZh: '快速掌握地球仪浏览、目的地筛选、摄影模拟与行程创建闭环。', purposeEn: 'Learn the core loop: discover destinations, check phenology, simulate lighting, and plan trips.',
    entryZh: '打开首页进入 3D 地球仪，顶部导航栏与右侧抽屉提供主要功能入口。', entryEn: 'Launch the 3D globe from the home page; use the top island bar and right drawer.',
    stepsZh: ['滚动缩放地球或通过大洲胶囊快速飞跃区域', '使用顶部月份筛选最佳季节（4–5★高亮点）', '点击任意城市节点打开档案抽屉查看 5,414 个摄影机位', '点击「加入行程」一键开启智能规划'],
    stepsEn: ['Zoom/rotate the 3D globe or click continent pills to fly smoothly', 'Filter peak months (4-5 star suitability) from the top bar', 'Select any destination marker to inspect 5,414 curated photo spots', 'Click "Add to Trip" to launch the Multimodal Trip Planner'],
    exampleZh: '搜索“京都” → 选 4 月看 Tier C 樱花峰值 → 打开清水寺摄影模拟 → 一键加入 4 日行程。', exampleEn: 'Search "Kyoto" -> pick April Tier-C bloom -> preview Kiyomizu-dera SunCalc -> add to a 4-day trip.',
    issuesZh: '首屏 3D 地球加载依赖 WebGL2 与矢量/卫星瓦片，弱网可切换「自动线路」。', issuesEn: '3D globe requires WebGL2; switch tile routes in Layers if tiles load slowly.',
    limitsZh: '基础地球仪与检索无需登录；云端协同、照片云备份需登录或配置 Worker。', limitsEn: 'Core globe works offline/guest-only; multi-user cloud sync requires sign-in.'
  },
  {
    id: 2, slug: 'kairos-philosophy', groupZh: '快速上手', groupEn: 'Getting Started',
    titleZh: 'KAIROS 品牌与“以天文精度旅行”理念', titleEn: 'KAIROS Philosophy & Ephemeris Precision',
    purposeZh: '理解“去对地方，更要去对时间”的决策逻辑与科学诚信原则。', purposeEn: 'Understand "Right place, exact astronomical window" and scientific transparency.',
    entryZh: '开场序章、品牌标志与各模块来源标签（Astronomy / Forecast / Archive）。', entryEn: 'Available from Story Prologue and source badges across modules.',
    stepsZh: ['识别紫标 Astronomy（星历精确计算）', '识别绿标 Realtime（14天内实时预报）', '识别金标 Empirical（多年气候与实地统计）'],
    stepsEn: ['Astronomy badge = deterministic orbital ephemeris', 'Realtime badge = live telemetry/forecasts <=14 days', 'Empirical badge = curated atlas & historical climatology'],
    exampleZh: '即使输入 60 天后的摄影日期，系统仍精确计算太阳方位角，但绝不伪造当天云量预报。', exampleEn: '60 days ahead keeps exact solar azimuths while excluding live weather forecasts.',
    issuesZh: '部分用户误将历史气候均值当成未来单日天气，请留意各模块下方提示。', issuesEn: 'Historical climate normals represent multi-year averages, not single-day guarantees.',
    limitsZh: '无气象预报超出 14 天可靠极限的商业黑盒预测。', limitsEn: 'Zero fabricated long-range weather predictions beyond 14 days.'
  },
  {
    id: 3, slug: 'globe-controls', groupZh: '探索地球', groupEn: 'Explore Atlas',
    titleZh: '3D 地球仪交互与地图投影/底图切换', titleEn: '3D Globe Navigation & Base Skins',
    purposeZh: '熟练使用卫星、国家地理、地形与暗夜 4 种底图及双指/键鼠视角。', purposeEn: 'Master 3D camera controls and Satellite, NatGeo, Physical, and Dark base maps.',
    entryZh: '左上角或底部手机导航栏 → 「图层工具」弹出框。', entryEn: 'Layers button in the top bar or mobile bottom navigation.',
    stepsZh: ['打开图层菜单选择 4 种高对比度底图皮肤', '拖拽旋转视角，按住 Ctrl+拖拽可调整 3D 俯仰角', '双指或滚轮缩放查看 137 国 722 城分布', '点击右上指南针或品牌图标一键回正北'],
    stepsEn: ['Pick a base skin inside Layers popover', 'Right-drag or Ctrl+drag adjusts camera pitch and bearing', 'Zoom in to inspect 722 curated cities across 137 countries', 'Click compass or KAIROS home logo to reset'],
    exampleZh: '看极光/暗夜灯光时切换至「暗夜」底图，看峡湾山峰时切换至「地形」底图。', exampleEn: 'Use Dark skin for aurora/night lights and Physical skin for alpine ridges.',
    issuesZh: '低配显卡设备可在系统诊断中降低像素比以提升帧率。', issuesEn: 'Lower pixel ratio in Diagnostics if GPU frame rate drops.',
    limitsZh: '极高缩放倍数下开源影像分辨率受上游瓦片源限制。', limitsEn: 'Maximum satellite zoom detail depends on public tile providers.'
  },
  {
    id: 4, slug: 'natural-search', groupZh: '探索地球', groupEn: 'Explore Atlas',
    titleZh: '智能搜索、自然语言意图与相似对比', titleEn: 'Natural-Language Search & Destination Comparison',
    purposeZh: '用日常语言描述月份、预算、排除景观、交通偏好并做 2–4 城横向对比。', purposeEn: 'Query by month, budget, exclusions, transit pace, and compare 2-4 cities side by side.',
    entryZh: '点击顶部搜索框或快捷键 Ctrl/Cmd + K；点击详情抽屉「⚖ 对比」。', entryEn: 'Search pill / Cmd+K; "⚖ Compare" button in Destination Drawer.',
    stepsZh: ['输入复合条件，如“10月去日本高铁方便看红叶，不要海滩，预算8000”', '检查自动提取的约束标签（排除标签为硬过滤）', '点击「对比前 3 名」打开并排表格对比预算/季节/机场高铁'],
    stepsEn: ['Type natural criteria like "Oct Japan rail autumn foliage no beach under $1200"', 'Inspect parsed filter chips and negative exclusions', 'Open side-by-side matrix for budgets, seasonality, and gateways'],
    exampleZh: '查看“京都”后点击对比，自动匹配同旺季且预算更优的城市推荐。', exampleEn: 'Inspect Kyoto -> Compare to discover similar off-peak or lower-budget matches.',
    issuesZh: '多个负向排除词建议用逗号或空格分隔以避免误伤后续正面条件。', issuesEn: 'Separate exclusion clauses with spaces or commas for accurate parsing.',
    limitsZh: '相似向量基于 10 维可解释地理与预算特征，不代表主观人文体验评价。', limitsEn: 'Similarity uses a 10-dimension interpretable vector rather than subjective reviews.'
  },
  {
    id: 5, slug: 'destination-details', groupZh: '探索地球', groupEn: 'Explore Atlas',
    titleZh: '目的地档案抽屉与多端手势浏览', titleEn: 'Destination Drawer & Multi-Tab Inspector',
    purposeZh: '全面阅读城市物候带、摄影机位、12 个月评分、预算估算与深度文化百科。', purposeEn: 'Explore monthly ribbons, spots, budgets, climate normals, and Wikidata verification.',
    entryZh: '点击地球上的任意金色/青色城市节点。', entryEn: 'Click any destination marker on the globe or gallery card.',
    stepsZh: ['查看顶部 12 月热力条带，点击任意月份跳至对应物候评估', '切换「机位 / 摄影模拟 / 月份物候 / 预算 / 当地详情」五个页签', '桌面使用鼠标滚轮浏览，手机可拖拽底部抽屉抓手切换三段高度'],
    stepsEn: ['Tap any month in the 12-month phenology ribbon', 'Switch between Spots, Photo Sim, Months, Budget, and Local Details tabs', 'Mobile users can drag the sheet handle across peek, half, and full heights'],
    exampleZh: '展开“九寨沟”机位列表，直接一键打开 3D 取景器预览构图视角。', exampleEn: 'Expand spot cards to jump directly into 3D Viewfinder or Panoramax Street View.',
    issuesZh: '未找到想去的冷门景点可通过顶部坐标查询或协同备注补充。', issuesEn: 'Custom unindexed stops can still be added directly inside Trip Planner.',
    limitsZh: '预算金额为历史参考级估算，实时酒店机票价格请查阅预订官网。', limitsEn: 'Displayed budgets are reference tiers; confirm live prices on booking sites.'
  },
  {
    id: 6, slug: 'phenology-tiers', groupZh: '科学引擎', groupEn: 'Science Engines',
    titleZh: '物候预测三级体系与样本外验证', titleEn: 'Three-Tier Phenology & Holdout Validation',
    purposeZh: '区分 Tier A 档案启发、Tier B 气候增强与 Tier C 实证校准子集。', purposeEn: 'Understand Tier A Archive, Tier B Climate-Elevation, and Tier C Calibrated models.',
    entryZh: '目的地抽屉「月份与物候」页签 → KAIROS V5 物候卡片。', entryEn: 'Destination Drawer -> Months/Phenology tab.',
    stepsZh: ['查看右上角来源与等级标签（Tier A / Tier B / Tier C）', '查看峰值窗口与 ±波动天数区间（uncertaintyDays）', '点击「春季花海 / 金秋红叶 / 雪景冰川」等切换专类评估'],
    stepsEn: ['Check the Tier A/B/C badge and data provenance line', 'Review peak date estimates plus +/- uncertainty bounds', 'Switch landscape categories (blossom, autumn, snow, alpine flower, glacier)'],
    exampleZh: '东京、京都、武汉、华盛顿等 23 城拥有 Tier C 樱花/红叶交叉验证误差说明。', exampleEn: '23 temperate benchmark cities report Tier C holdout MAE in days.',
    issuesZh: '若当年出现异常暖冬或寒潮，请务必结合起飞前 14 天天气调整行程。', issuesEn: 'Unusual warm springs shift actual bloom dates beyond climatological means.',
    limitsZh: 'Tier C 校准参数仅限 23 个基准温带城市，绝不夸大推广至全部 722 城。', limitsEn: 'Tier C calibration applies strictly to the 23 benchmark cities.'
  },
  {
    id: 7, slug: 'aurora-space-weather', groupZh: '科学引擎', groupEn: 'Science Engines',
    titleZh: '极光与空间天气独立模块', titleEn: 'Aurora & Space Weather Telemetry',
    purposeZh: '从地磁纬度、天文暗夜时长与 NOAA Kp/OVATION 区分空间天气与植物物候。', purposeEn: 'Assess aurora probability via geomagnetic latitude, polar night, and NOAA SWPC.',
    entryZh: '图层面板「实时极光」或抽屉「极光/极夜窗口」页签。', entryEn: 'Layers -> Aurora Oval, or Phenology card -> Aurora tab.',
    stepsZh: ['开启全球图层中的 NOAA OVATION 极光卵', '查看目的地的 IGRF 地磁纬度与当月天文黑夜时长', '极光预报需同时满足暗夜 + Kp ≥ 3 + 无厚云遮挡'],
    stepsEn: ['Enable NOAA OVATION Aurora overlay from Layers', 'Inspect geomagnetic latitude and monthly astronomical darkness hours', 'Verify both Kp activity and cloud cover before heading out'],
    exampleZh: '特罗姆瑟（地磁北纬约 67°）在 11 月具备近满分极光卵位置与长暗夜。', exampleEn: 'Tromso (~67° mag lat) peaks geometrically from late Sep through Mar.',
    issuesZh: '北极夏至极昼期间即使磁纬极佳，因全天日光无法观测极光（系统自动给低分）。', issuesEn: 'Polar summer daylight prevents aurora observation regardless of Kp.',
    limitsZh: '3 天以内的地磁预报依赖太阳风观测，无法提前数月预测单晚极光爆发。', limitsEn: 'Solar storms cannot be forecast weeks or months ahead.'
  },
  {
    id: 8, slug: 'photo-simulator', groupZh: '摄影实验室', groupEn: 'Photo Lab',
    titleZh: '摄影实验室、星历时刻表与蓝调黄金窗', titleEn: 'Photo Simulator & Ephemeris Clock',
    purposeZh: '精确计算任意经纬度任意日期的太阳方位、高度角、月相与银河中心位置。', purposeEn: 'Compute solar azimuth, altitude curves, moonrise, and Milky Way core visibility.',
    entryZh: '目的地抽屉「摄影模拟」页签或机位卡片上的「光影模拟」。', entryEn: 'Drawer -> Photo Sim tab, or "Simulate" pill on any spot card.',
    stepsZh: ['选择具体机位与拍摄日期（自动切换当地 IANA 时区含夏令时）', '拖动时间轴或点击蓝调晨/日出/黄金昏快捷预设', '旋转机位朝向并观察罗盘指针（顺光/侧逆光/逆光徽章）', '查看银河核心高度角与月光照明干扰百分比'],
    stepsEn: ['Pick a spot and date (auto-applies local IANA timezone & DST)', 'Scrub time or tap Dawn/Sunrise/Golden Hour presets', 'Rotate camera azimuth slider to evaluate Front/Side/Back lighting', 'Check Galactic Core elevation and moonlight percentage'],
    exampleZh: '设置夏威夷 7 月深夜 23:00，精准预览银心横跨南部天区方位角。', exampleEn: 'Preview July Galactic Core altitude and moonset interference cleanly.',
    issuesZh: '注意时区显示徽章，日期跨越夏令时切换日时系统会自动修正偏移。', issuesEn: 'Always verify destination DST offset displayed at top of the simulator.',
    limitsZh: '极端极圈附近可能出现整日无日落或整日无天文黑夜。', limitsEn: 'Polar latitudes experience continuous day/night during solstices.'
  },
  {
    id: 9, slug: 'photo-opportunity-index', groupZh: '摄影实验室', groupEn: 'Photo Lab',
    titleZh: '8 大题材拍摄机会指数与日照金山判别', titleEn: '8-Scene Opportunity Index & Alpenglow Lead',
    purposeZh: '按题材加权评估成片机会，严格执行 14 天预报边界保护并区别机位与主峰见光。', purposeEn: 'Score 8 shooting archetypes with 14-day weather guard and peak alpenglow timing.',
    entryZh: '摄影实验室顶部「KAIROS 拍摄窗口机会指数」卡片。', entryEn: 'Photo Simulator -> Photo Opportunity Index card.',
    stepsZh: ['在 8 大主题中选择其一（日出日落 / 雪山金山 / 银河星空 / 樱花 / 建筑等）', '阅读绿色正向驱动与黄色风险扣分项', '查看备选拍摄窗口与推荐焦段（mm）', '点击「加入当前行程」「保存预设」或「分享/发起投票」'],
    stepsEn: ['Pick 1 of 8 presets (Sunrise, Mountain Alpenglow, Milky Way, Architecture, etc.)', 'Inspect positive & negative scoring drivers', 'Use Action Buttons: Add Window to Trip, Save Preset, or Share/Poll'],
    exampleZh: '当选定 30 天后拍摄雪山时，系统自动剔除天气云量权重并在底部声明仅做天文地形推演。', exampleEn: 'Dates >14 days ahead omit live weather and explain astronomy-only scoring.',
    issuesZh: '山谷机位太阳遮挡比高海拔主峰见光更晚（日出前约 2–18 分钟已有日照金山）。', issuesEn: 'Distant high peaks glow several minutes before sunlight reaches lower viewpoints.',
    limitsZh: 'DEM 地形分辨率为 ~30–90m，无法计入前景树木与人造建筑物遮挡。', limitsEn: '30-90m DEM grids exclude foreground trees and buildings.'
  },
  {
    id: 10, slug: 'viewfinder-3d', groupZh: '摄影实验室', groupEn: 'Photo Lab',
    titleZh: '3D 实景取景器与光学裁切指示', titleEn: '3D Viewfinder, Grid & Optical Crop',
    purposeZh: '以真机画幅（全画幅/APS-C/M43/中画幅）与焦段（14–600mm）在 3D 地形中取景。', purposeEn: 'Frame 3D terrain using real sensor formats, focal lengths, aspect ratios, and pitch HUD.',
    entryZh: '摄影实验室或机位卡片上的「3D 取景器」按钮。', entryEn: 'Click "3D Viewfinder" from Photo Simulator or spot cards.',
    stepsZh: ['选择画幅、构图比例（3:2 / 16:9 / 1:1）及横竖构图', '点击「九宫格」切换三分辅助线，观察顶部俯仰角与罗盘带', '长焦超过 WebGL 18° 物理视场下限时，界面自动启用数码裁切框徽章', '按 Esc 或点击「退出取景」恢复原地球视角'],
    stepsEn: ['Select sensor, aspect ratio, and landscape/portrait framing', 'Toggle Rule-of-Thirds grid and monitor pitch + compass HUD', 'Long telephotos display WebGL Digital Crop vs Optical FOV indicator', 'Press Esc or Exit to restore your previous globe camera'],
    exampleZh: '使用全画幅 200mm 竖构图对准富士山河口湖，模拟压缩感与太阳方位。', exampleEn: 'Test 200mm portrait framing vs 24mm wide landscape cleanly in 3D.',
    issuesZh: '若 3D 地形尚未激活，进入取景器时会自动开启 Terrarium 地形并在退出时还原。', issuesEn: 'Terrain exaggeration restores cleanly when closing Viewfinder 3D.',
    limitsZh: '超广角与超长焦受限于 WebGL 18°–65° 垂直视场引擎约束，部分为裁切近似。', limitsEn: 'Extreme focal lengths are approximated within WebGL 18°-65° vertical FOV.'
  },
  {
    id: 11, slug: 'time-machine', groupZh: '遥感与图层', groupEn: 'Satellite & Layers',
    titleZh: '地球时光机、分屏对比与 NASA EPIC 实拍', titleEn: 'Time Machine Split Swipe & NASA EPIC Date Picker',
    purposeZh: '调阅 NASA GIBS 历史遥感图层、使用日期分屏卷帘，以及按日期查看 DSCOVR EPIC 实拍。', purposeEn: 'Browse NASA GIBS archival layers, scrub split-date comparison, and inspect historical EPIC frames.',
    entryZh: '图层工具 → 「地球时光机」或「今日真地球」。', entryEn: 'Layers -> Earth Time Machine or NASA EPIC Earth.',
    stepsZh: ['在时光机面板挑选影像图层（真彩/积雪/叶绿素/夜间光）并选日期 A', '勾选「双日期对比」，选日期 B 后拖动分屏混合滑块观察植被或积雪演变', '在 NASA EPIC 弹窗左上角选择历史日期加载当年 L1 点地球实拍'],
    stepsEn: ['Pick a GIBS imagery product and Date A in Time Machine dock', 'Enable Dual-Date Compare, pick Date B, and drag split/mix slider', 'Pick custom dates in the EPIC modal with transparent nearest-date fallback'],
    exampleZh: '对比 4 月与 10 月同一地区积雪与植被变化；若选定无数据日，系统诚实回退最近可用日。', exampleEn: 'Compare spring snowmelt vs autumn coverage; unavailable EPIC dates fall back honestly.',
    issuesZh: 'NASA 极地冬季和重云区每日拼图存在黑色盲区条带，属真实卫星轨道观测物理现象。', issuesEn: 'Dark orbital gaps occur naturally over cloudy or polar-night zones.',
    limitsZh: 'GIBS 与 EPIC 免费遥感数据刷新延迟通常为数小时至 1 天。', limitsEn: 'NASA public imagery carries normal 6-24h orbital processing latency.'
  },
  {
    id: 12, slug: 'media-and-seasons', groupZh: '遥感与图层', groupEn: 'Satellite & Layers',
    titleZh: '四季风光图库、误过滤修复与全景街景 2.0', titleEn: 'Four-Season Commons Gallery & Street View 2.0',
    purposeZh: '精准展示梯田与自然野生动物风光（剔除菜品照），按真实 EXIF 日期筛选四季，联动 360° 街景。', purposeEn: 'Filter landscape Commons media by real EXIF season and hop through 360° Panoramax panoramas.',
    entryZh: '抽屉「机位」顶部风光带、摄影画廊视图与「街景」按钮。', entryEn: 'Drawer Media Strip, Photo Gallery view, and Street View buttons.',
    stepsZh: ['点击摄影条带上的「春/夏/秋/冬/未标日期」按真实 EXIF 月份筛选（南半球自动反转）', '点击任意图片开启全屏高清灯箱及摄影师与 CC 协议署名', '进入街景模式点击「罗盘同步」或「回到机位」控制全球视角联动'],
    stepsEn: ['Filter gallery strip by Spring/Summer/Autumn/Winter/Undated EXIF tags', 'Click photos to open lightbox with Wikimedia author & license credits', 'Use Compass Sync, Prev/Next hops, and Return to Spot in Street View'],
    exampleZh: '云南元阳“梯田 (Rice Terraces)”正常入库精选，而“蛋炒饭/烤鸭菜肴”仍被严格剔除。', exampleEn: 'Rice terraces & wild ducks pass relevance scoring while restaurant dishes are filtered out.',
    issuesZh: '部分 Commons 上传照片本身无拍摄日期 EXIF，归类至「未标日期」以免虚构季节。', issuesEn: 'Undated images stay in "Undated" rather than inventing false seasonal tags.',
    limitsZh: '若实地附近无 Panoramax/Mapillary 开放街景，将优雅降级展示实景照片或外链。', limitsEn: 'Falls back to geo-tagged Commons shots when no open street view covers remote peaks.'
  },
  {
    id: 13, slug: 'planner-v5-core', groupZh: '智能行程', groupEn: 'Trip Planner',
    titleZh: '行程规划 2.0 基础：城市精准解析与防错保护', titleEn: 'Trip Planner 2.0: Exact City Resolution & Draft Safety',
    purposeZh: '彻底杜绝目的地错配（如输入北京误出东京），支持显式草案确认与多天生成。', purposeEn: 'Eliminate silent fallback mismatches with explicit draft locks and fuzzy suggestion picking.',
    entryZh: '顶部胶囊或底部栏点击「行程规划」。', entryEn: 'Click Trip Planner from top capsule or mobile navigation.',
    stepsZh: ['点击「+ 新建行程」清空旧草稿，输入出发地与中/英文目的地（支持候选项点选）', '确认预览横条显示正确的出发地、目标城市与天数，再点击生成', '如输入未知地名，系统给出清晰报错提示，绝不静默替换成其他城市'],
    stepsEn: ['Click "+ New Trip" for a clean draft and type origin & destination', 'Pick an exact match from the suggestion dropdown and inspect preview summary', 'Unknown queries display an explicit error instead of falling back silently'],
    exampleZh: '输入“北京 / Beijing”精确锁定 cn-beijing 并排布故宫、景山与长城机位。', exampleEn: 'Typing "北京" resolves cn-beijing cleanly without ever reverting to a prior city.',
    issuesZh: '未点击候选框直接生成时系统会先尝试精确匹配，歧义时会请求人工点选。', issuesEn: 'Ambiguous city names ask you to pick from top candidates.',
    limitsZh: '内置自动排程优先围绕档案库 5,414 个机位及自添景点优化。', limitsEn: 'Auto-scheduling optimizes curated spots plus user-added custom pins.'
  },
  {
    id: 14, slug: 'multimodal-transport', groupZh: '智能行程', groupEn: 'Trip Planner',
    titleZh: '三层多式联运：飞机、高铁、自驾、大巴与接驳', titleEn: '3-Tier Multimodal Transport: Flight, HSR, Rail, Ferry & Drive',
    purposeZh: '对比跨城大交通（飞机/高铁/普铁/长途/渡轮/自驾）、机场接驳与市内交通方式。', purposeEn: 'Compare intercity flights/HSR/rail/ferry/drive, airport transfers, and city transit.',
    entryZh: '行程规划 → 左侧偏好或「交通与路线」页签。', entryEn: 'Trip Planner -> Intercity selector and Transport/Route tab.',
    stepsZh: ['选择出行的主力跨城交通方式或让系统对比', '查看 OurAirports 真实最近门户机场（如 PEK/NRT）与大圆航线飞行预估', '查看高铁/铁路运算符链接及机场→市区多种接驳时长参考', '同一城市内部查看步行/骑行/公交地铁对比，无实测直连票价绝不编造'],
    stepsEn: ['Select preferred intercity mode and open Transport tab', 'Inspect nearest OurAirports gateways, great-circle distance, and rail operators', 'Review airport-to-downtown options and official booking/reference links'],
    exampleZh: '规划北京 → 上海呈现高铁约 4.5–5.5h 与飞行约 2.2h 的诚实门到门时间对比。', exampleEn: 'Beijing to Shanghai compares HSR (~5h city-center) vs flight (incl. airport transfer).',
    issuesZh: '跨海无陆路桥隧行程会自动拒绝虚假驾车轨迹，改为大圆弧航线提示。', issuesEn: 'Trans-oceanic pairs reject OSRM land routes and display honest great-circle arcs.',
    limitsZh: '受无商业 GDS 限制，提供时间估算、大圆距离与官方购票跳转，无虚假实时航班号/余票。', limitsEn: 'Zero fabricated live flight numbers, train IDs, or ticket inventories.'
  },
  {
    id: 15, slug: 'itinerary-lock-timeline', groupZh: '智能行程', groupEn: 'Trip Planner',
    titleZh: '多城串线、锁点保护与时间线/日历/冲突检测', titleEn: 'Multi-City, Locked Stops, Calendar & Conflict Alerts',
    purposeZh: '灵活调整行程顺序、锁定必须保留的机位与时刻，并在时间线与冲突引擎中核查。', purposeEn: 'Lock must-keep reservations, toggle Timeline vs Calendar, and catch schedule conflicts.',
    entryZh: '行程规划 → 「行程时间线」页签。', entryEn: 'Trip Planner -> Itinerary Timeline tab.',
    stepsZh: ['点击任意站点上的「🔒 锁定」固定其日期和位置，防止后续自动重排打乱预订', '点击「重排未锁定」仅优化自由站点顺序以减少折返', '切换「时间线 / 日历矩阵」查看每天日程', '留意顶部红色/琥珀色冲突提示（连续移动超时、无夜间灯光/营业重叠风险）'],
    stepsEn: ['Toggle Lock on fixed stops (e.g., sunrise spot or hotel check-in)', 'Click Re-optimize Unlocked to reorder only flexible items cleanly', 'Switch between Timeline list and Day Calendar grid', 'Review automatic transfer and time-overlap conflict warnings'],
    exampleZh: '锁定 Day 2 05:30 金阁寺/伏见稻荷清晨机位，其余午后景点按距离一键顺路重排。', exampleEn: 'Lock dawn photo stop while optimizing midday cafe and temple stops.',
    issuesZh: '若整天仅剩一个站点或全部锁定，重排不会改变当前次序。', issuesEn: 'Re-optimization preserves relative order of all locked items.',
    limitsZh: '开放时间提醒基于典型景点作息，节假日特休仍请提前核对官网。', limitsEn: 'Verify special holiday closures on official venue websites.'
  },
  {
    id: 16, slug: 'budget-and-fx', groupZh: '智能行程', groupEn: 'Trip Planner',
    titleZh: '9 类多币种预算 2.0、实时汇率与行前清单', titleEn: '9-Category Multi-Currency Budget, FX & Prep Kit',
    purposeZh: '分 9 个消费维度追踪预估与实花账目，支持 Frankfurter 汇率换算及护照/插座行前准备。', purposeEn: 'Track est vs actual expenses across 9 categories, live FX rates, and country prep kits.',
    entryZh: '行程规划 → 「预算与汇率」及「行前准备」页签。', entryEn: 'Trip Planner -> Budget & FX and Prep Kit tabs.',
    stepsZh: ['在预算页签查看机票/铁路/住宿/餐饮/门票等 9 大分类柱图与占比', '选择目标结算币种，通过 /api/fx (Frankfurter/ECB) 获取参考汇率或离线兜底参考值', '在「行前准备」自动勾选目的地插头制式、紧急电话与官方签证使馆外链'],
    stepsEn: ['Review 9 expense categories (Est vs Actual) in Budget & FX tab', 'Switch currency and convert via Frankfurter FX (with offline fallback rate)', 'Check voltage/plug types, emergency numbers, and official embassy links in Prep Kit'],
    exampleZh: '东京行程切换至 JPY 显示换算总预算，并在 Prep Kit 查看 100V A型插头与急救电话。', exampleEn: 'Convert Tokyo trip budget to JPY and verify Japan plug Type A + 110/119 info.',
    issuesZh: '货币汇率缓存 12 小时，实际信用卡/银行卡结汇以银行账单为准。', issuesEn: 'ECB FX rates refresh daily and serve as planning guidance only.',
    limitsZh: '签证与入境政策随时动态调整，出行前请务必查验目的地外交部或 IATA 官方页。', limitsEn: 'Always confirm current visa rules via government or IATA links provided.'
  },
  {
    id: 17, slug: 'account-auth-security', groupZh: '账号与协同', groupEn: 'Accounts & Collab',
    titleZh: '可选账号中心、访客隔离与数据安全迁移', titleEn: 'Optional Account Auth, Guest Mode & Safe Migration',
    purposeZh: '不强迫注册即可完整探索；需要跨端同步或多人协同可安全登录并一键迁移本地档案。', purposeEn: 'Use KAIROS freely as a guest, or sign in for cross-device sync and safe archive import.',
    entryZh: '顶部右侧「👤 账号中心」图标。', entryEn: 'Account icon pill in top navigation capsule.',
    stepsZh: ['邮箱注册采用 Web Crypto PBKDF2-SHA256 哈希与 HttpOnly/SameSite Cookie 会话', '首次登录可勾选「安全迁移本地数据」：先自动生成备份，再合并至个人账号，互不串号', '支持随时在账号中心「导出全量个人 JSON」或「一键注销并级联清除服务端记录」'],
    stepsEn: ['Email auth uses PBKDF2-SHA256 hashing and HttpOnly SameSite cookies', 'First login lets you back up and migrate guest data safely with full user isolation', 'Export all personal records or delete your cloud account permanently anytime'],
    exampleZh: '离线使用几天记录的足迹，登录后一键合并进个人云端档案且原本地数据先保留快照。', exampleEn: 'Guest trips and footprints merge cleanly into your newly registered account.',
    issuesZh: '静态预览环境无 Cloudflare D1 时会提示「本地访客模式」，一切基础功能照常可用。', issuesEn: 'If D1 backend is unconfigured, guest local mode continues seamlessly.',
    limitsZh: 'Cloudflare Workers 环境 PBKDF2 迭代受限于平台安全规格（100,000 次）。', limitsEn: 'Email verification & Google OAuth require deploying optional Worker secrets.'
  },
  {
    id: 18, slug: 'collab-rbac-votes', groupZh: '账号与协同', groupEn: 'Accounts & Collab',
    titleZh: '多人协同规划、RBAC 权限与意见投票', titleEn: 'Multi-User Collaboration, RBAC & Team Polls',
    purposeZh: '邀请同伴查看或共同编辑同一行程，支持链接过期撤销、成员改权、景点留言与民主投票。', purposeEn: 'Share expiring invite codes, assign Owner/Editor/Viewer roles, comment, and vote.',
    entryZh: '行程规划 → 「多人协作与 AA 分账」页签。', entryEn: 'Trip Planner -> Collaboration & Split tab.',
    stepsZh: ['房主生成限时协同邀请码（可设定仅查看 Viewer 或可编辑 Editor，随时一键撤销）', '成员对行程内站点发表讨论留言或发起路线备选投票', '重要调整前可随时保存历史版本快照并支持回滚还原', '离线或多标签页同时修改由 CRDT (LWW + Tombstone) 引擎无冲突收敛'],
    stepsEn: ['Owner generates a time-limited invite code (Editor or Viewer) revocable anytime', 'Collaborators post comments, vote in polls, and inspect version snapshots', 'Concurrent edits converge deterministically via CRDT LWW + tombstones'],
    exampleZh: '3 人组队日本行，成员在本地双开页或云端同步投票“奈良 vs 宇治”，房主确认后一键定稿。', exampleEn: '3 teammates vote on day-trip options and merge stops deterministically.',
    issuesZh: '被房主设为 Viewer 或被移除/撤销邀请码的成员写入请求会被服务端 403 拦截。', issuesEn: 'Revoked members or Viewer roles cannot mutate shared trips on Worker API.',
    limitsZh: '无付费 Durable Objects 时通过 D1 REST 同步 + 本地 BroadcastChannel 实现轻量实时协同。', limitsEn: 'Uses D1 sync + BroadcastChannel rather than paid WebSocket Durable Objects.'
  },
  {
    id: 19, slug: 'expense-splitter', groupZh: '账号与协同', groupEn: 'Accounts & Collab',
    titleZh: '多人旅行记账与最少转账次数 AA 结算', titleEn: 'Group Expense Ledger & Minimum-Transfer Settlement',
    purposeZh: '记录同伴代付开销（均摊或按自定义权重），自动计算出最少笔数的清算转账方案。', purposeEn: 'Log group expenses (equal or custom weights) and compute minimum settlement transfers.',
    entryZh: '行程规划 → 「多人协作与 AA 分账」页签下方分账面板。', entryEn: 'Trip Planner -> Collaboration & Split -> Expense Splitter.',
    stepsZh: ['添加旅伴名单并勾选每笔支出的付款人与参与分摊成员', '支持「均摊 AA」与「自定义权重/金额」双模式', '系统利用贪心最小流结算算法生成最少次数的互相转账建议', '支持导出分账 CSV 对账单发送团队成员'],
    stepsEn: ['Add participants, pick the payer, and choose equal or weighted splits', 'Inspect net positive/negative balances for every member', 'Follow minimum-transfer settlement instructions and export CSV summary'],
    exampleZh: '4 人同行共记 12 笔车餐费，结算方案通常仅需 2–3 次转账即可全部清账。', exampleEn: '12 shared bills across 4 travelers settle cleanly in at most 3 transfers.',
    issuesZh: '涉及多币种垫付时建议先按消费日或平台实时汇率换算至统一结算币。', issuesEn: 'Convert multi-currency expenses into a base currency before final settlement.',
    limitsZh: 'KAIROS 仅作消费记录与对账算法工具，不接管或触碰任何真实资金支付。', limitsEn: 'Ledger/calculation tool only; zero financial payment or banking integration.'
  },
  {
    id: 20, slug: 'travel-archive-privacy', groupZh: '个人档案与报告', groupEn: 'Archive & Journal',
    titleZh: '隐私优先个人档案、游记打卡与 EXIF 剥离保护', titleEn: 'Private-by-Default Archive, Journals & EXIF Stripping',
    purposeZh: '安全沉淀个人去过/计划/想去清单、私密旅途游记与照片，默认完全私密不公开。', purposeEn: 'Track visited/planned/wishlist places, field journals, and EXIF-stripped photos privately.',
    entryZh: '顶部胶囊或底部栏点击「我的足迹档案」。', entryEn: 'Click My Archive from top island or mobile nav.',
    stepsZh: ['所有个人状态与游记默认仅存本地 IndexedDB（页面左上角展示「默认完全私密」徽章）', '如需公开展示可在档案头部显式切换 Opt-in 开关', '上传个人摄影预览照时，系统通过 Canvas 重绘默认自动剥离敏感 EXIF GPS 坐标', '在「旅行游记与机位打卡」记录真实心情标签、星级打分与文字心得'],
    stepsEn: ['Archives default to private local IndexedDB storage', 'Photos undergo Canvas re-encoding to strip sensitive EXIF GPS coordinates', 'Log rich travel journals with dates, moods, 1-5★ ratings, and notes'],
    exampleZh: '打开档案中心记录京都清晨感受，确认隐私徽章保持锁定后再一键备份 JSON。', exampleEn: 'Log journal notes locally with automatic GPS EXIF removal before cloud backup.',
    issuesZh: '清理浏览器缓存或无痕模式前请导出个人 JSON 备份或绑定云同步。', issuesEn: 'Export backup JSON before clearing browser site data in guest mode.',
    limitsZh: '图片云端对象存储需用户自行在 Cloudflare 绑定可选 R2 存储桶。', limitsEn: 'Cross-device photo blob sync requires binding an optional Cloudflare R2 bucket.'
  },
  {
    id: 21, slug: 'annual-report-footprint', groupZh: '个人档案与报告', groupEn: 'Archive & Journal',
    titleZh: '全球足迹点亮图层与年度旅行视觉报告', titleEn: 'Footprint Globe Overlay & Annual Travel Report',
    purposeZh: '在 3D 地球仪点亮探索版图，使用 ECharts 图表生成统计与年度长图海报。', purposeEn: 'Visualize explored countries on the 3D globe and generate ECharts annual stats.',
    entryZh: '我的足迹档案 → 「在地球点亮足迹」或「年度探索统计」。', entryEn: 'Archive -> Show on Globe or Annual Report Card button.',
    stepsZh: ['在目的地抽屉标注「已去 / 计划 / 心愿单」三态足迹', '在档案页按需加载 ECharts 可视化大洲覆盖与开支分布', '点击「生成年度长图」产出 6 种高分辨率海报或编码无服务端分享 URL'],
    stepsEn: ['Tag destinations as Visited, Planned, or Wishlist', 'Inspect lazy-loaded ECharts coverage & monthly stats', 'Generate high-DPI annual footprint posters or URL-encoded read-only links'],
    exampleZh: '完成 15 国探索后在地球点亮金色足迹光点并保存 9:16 手机分享长图。', exampleEn: 'Render golden globe markers and download a 9:16 annual summary poster.',
    issuesZh: '无账号情况下“足迹直达链接”将状态无损编码在 URL 参数中，超长清单可能触及 URL 长度提示。', issuesEn: 'Serverless URL footprint links encode statuses compactly in URL params.',
    limitsZh: '年度统计仅统计用户实际记录的足迹与账目，绝不虚构未填写的数据。', limitsEn: 'Stats reflect only recorded trips, check-ins, and expenses.'
  },
  {
    id: 22, slug: 'export-formats', groupZh: '分享与导出', groupEn: 'Share & Export',
    titleZh: '8 种标准开放格式导出（ICS / GPX / KML / GeoJSON 等）', titleEn: '8 Open Export Formats (ICS, GPX, KML, GeoJSON, CSV, PDF)',
    purposeZh: '确保用户完全拥有自己的行程数据，可无缝导入系统日历、手持 GPS、Google Earth 与办公软件。', purposeEn: 'Export itineraries into calendars, GPS devices, GIS tools, spreadsheets, and print PDFs.',
    entryZh: '行程规划 → 「导出与分享」面板或右侧导出按钮群。', entryEn: 'Trip Planner -> Export & Share buttons.',
    stepsZh: ['ICS (RFC 5545)：直接双击导入 Apple / Google / Outlook 日历日程', 'GPX 1.1 / KML 2.2 / GeoJSON：直接导入户外手表、两步路、奥维或 Google Earth', 'CSV (含 BOM 头 UTF-8) 与 JSON：供 Excel 透视与完整归档恢复', '打印级 HTML/PDF 与高清 PNG 海报：离线手持随身路书'],
    stepsEn: ['ICS imports directly into Apple, Google, or Outlook Calendar', 'GPX 1.1, KML 2.2 & GeoJSON open in outdoor GPS apps & GIS software', 'BOM UTF-8 CSV opens cleanly in Excel; Print view creates clean PDF roadbooks'],
    exampleZh: '行前将 5 日川西路线导出 .gpx 存入手持地图作为无信号备份参考。', exampleEn: 'Download .gpx and .ics before departure for zero-network trail and calendar backups.',
    issuesZh: '部分浏览器拦截弹窗时，PDF 导出会自动降级为下载可直接浏览器打印的 HTML 路书文件。', issuesEn: 'If popups are blocked, PDF falls back cleanly to printable HTML download.',
    limitsZh: '仅导出含有效经纬度坐标的站点进入 GPX/KML 轨迹点集。', limitsEn: 'Only stops with valid coordinates appear in spatial GPX/KML tracks.'
  },
  {
    id: 23, slug: 'global-share-center', groupZh: '分享与导出', groupEn: 'Share & Export',
    titleZh: '全球统一分享中心、6 种比例海报与局部二维码', titleEn: 'Global Share Center, 6 Aspect Posters & Local QR Codes',
    purposeZh: '支持 12 类内容对象、6 种适配各社交平台的视觉比例与纯本地安全二维码生成。', purposeEn: 'Share 12 object types with 6 social ratios, web intents, and 100% local QR SVG.',
    entryZh: '顶部胶囊/抽屉/行程页「分享」或摄影实验室「分享/发起投票」。', entryEn: 'Share buttons across drawer, photo lab, planner, and archive.',
    stepsZh: ['按平台选画幅（小红书/Instagram 3:4、朋友圈 4:5、抖音/Story 9:16、小红盒/Square 1:1、桌面横图 16:9 / 1200×630）', '纯本地矩阵生成二维码 SVG，零第三方外链隐私泄露', '系统支持 Web Share API 时一键呼出原生分享面板，微信/小红书等通过“长图+文案+二维码”优雅完成（绝不虚假宣称直发）'],
    stepsEn: ['Choose from 6 aspect ratios tailored to Instagram, Stories, XHS, X, and WeChat', 'QR codes render locally in-browser as pure SVG with zero external tracking', 'Uses Web Share API, X/WhatsApp/Telegram intents, or Download Poster + Copy Caption'],
    exampleZh: '将摄影黄金窗配置分享到微信群时，导出 3:4 海报长图并附带可扫码复现机位的深度链接。', exampleEn: 'Export a 3:4 photo-window poster with scannable local QR back to the exact camera azimuth.',
    issuesZh: '已登录用户的私密分享链接支持在账号/协同面板随时点击撤销失效。', issuesEn: 'Signed-in private share tokens can be revoked at any time.',
    limitsZh: '微信/小红书/抖音无公开免审 Web 发帖 SDK，坚持诚实告知采用海报+文案+二维码方案。', limitsEn: 'Platforms lacking open web-post APIs honestly use Poster + Caption + QR.'
  },
  {
    id: 24, slug: 'deep-links', groupZh: '分享与导出', groupEn: 'Share & Export',
    titleZh: '精确定位深度链接参数与 V4 历史兼容', titleEn: 'Deep-Link URLs & Legacy V4 Compatibility',
    purposeZh: '分享单条 URL 即可精确定位至目的地、机位、相机方位、日期、科学图层和界面语言。', purposeEn: 'Restore exact destination, spot, azimuth, date, active layers, and language via URL.',
    entryZh: '分享中心「复制直达深度链接」或浏览器地址栏自动同步。', entryEn: 'Copied from Share Center or browser address bar.',
    stepsZh: ['支持标准参数：?focus=<城市>&spot=<机位号>&cam=<方位角>&date=<YYYY-MM-DD>&layers=<图层>&lang=<en|zh-CN|zh-TW>', '100% 兼容 V4 历史链接：?focus=、?trip=、?footprint=、?embed='],
    stepsEn: ['Supports ?focus=, ?spot=, ?cam=, ?date=, ?layers=, and ?lang=', 'Preserves 100% compatibility with legacy ?trip=, ?footprint=, and ?embed= links'],
    exampleZh: '打开 ?focus=jp-kanto-tokyo&spot=0&cam=245&lang=en 直接飞跃东京 1 号机位并切为英文。', exampleEn: 'Open deep-link parameters to jump straight to a curated camera angle and locale.',
    issuesZh: '过长自定义行程 URL 分享建议使用登录后短码分享或导出 JSON。', issuesEn: 'Very large offline trips share best via signed-in invite links or JSON export.',
    limitsZh: '未配置服务器短链时无状态分享长度受浏览器地址栏长度限制（~8KB）。', limitsEn: 'Stateless URL payloads stay bounded to safe browser URL lengths.'
  },
  {
    id: 25, slug: 'pwa-offline-pack', groupZh: '离线与性能', groupEn: 'Offline & PWA',
    titleZh: 'PWA 桌面/手机安装与目的地离线旅行包', titleEn: 'PWA App Install & Offline Travel Pack',
    purposeZh: '将 KAIROS 安装为主屏幕应用，并在出发前按目的地一键缓存核心信息供无网查阅。', purposeEn: 'Install KAIROS as a standalone app and cache destination packs cleanly for offline flights.',
    entryZh: '顶部或菜单「安装应用 / 离线包」以及行程页离线缓存按钮。', entryEn: 'Install App trigger (when eligible) and Offline Travel Pack button.',
    stepsZh: ['在支持的桌面/移动浏览器中点击「安装 KAIROS」，获得无地址栏原生窗口体验', '点击「保存离线旅行包」将所选城市档、机位坐标、枢纽机场与当前行程存入 IndexedDB，带缓存时间戳', '断网状态下 SunCalc 日月星历、AA 分账与已缓存行程仍 100% 可用', '新版 Service Worker 发布时顶部会出现无打扰升级提示'],
    stepsEn: ['Install KAIROS when your browser supports beforeinstallprompt or Add to Home Screen', 'Save Offline Travel Pack into IndexedDB with an explicit "Cached at ..." timestamp', 'Ephemeris solar/lunar tools, AA splitter, and saved packs run 100% offline'],
    exampleZh: '登机前将“北海道 5 日游”离线包存入设备，飞行途中随时复查日出角与日程。', exampleEn: 'Save your Hokkaido trip pack before boarding to inspect sun azimuths mid-flight.',
    issuesZh: '出于礼貌遵守与零批量爬取原则，离线包不批量抓取第三方商用地图栅格瓦片。', issuesEn: 'Respects tile provider terms: never bulk-scrapes satellite map tiles.',
    limitsZh: 'Safari iOS 需点击系统分享菜单「添加到主屏幕」手动安装 PWA。', limitsEn: 'iOS Safari installs PWAs manually via Share -> Add to Home Screen.'
  },
  {
    id: 26, slug: 'seo-and-embed', groupZh: '生态与诊断', groupEn: 'Ecosystem & Diagnostics',
    titleZh: '722 城静态 SEO 落地页与轻量地球嵌入组件', titleEn: '722 SEO City Pages & Embeddable Globe Widget',
    purposeZh: '为博客、游记或摄影社区提供可直接预览的静态落地页与极简 <iframe> 嵌入代码。', purposeEn: 'Use 722 static city cards (with 1200×630 OG PNG) and iframe globe embeds.',
    entryZh: '/p/<city-id>.html 或海报弹窗底部嵌入代码按钮。', entryEn: 'Static paths /p/<city-id>.html or Embed snippet in Share Center.',
    stepsZh: ['在分享中心点击「嵌入代码」复制指定城市的 <iframe> 片段', '通过 ?embed=<id>&chrome=off&spin=1&daynight=1 精简外围菜单'],
    stepsEn: ['Copy customizable <iframe> embed code from Share Center', 'Use ?embed=<id>&chrome=off&spin=1 to embed minimalist rotating globes'],
    exampleZh: '<iframe src="https://world-travel-globe.globe-app.workers.dev/?embed=jp-kansai-kyoto&chrome=off"></iframe>', exampleEn: 'Embed Kyoto with day/night terminator right inside Markdown/Notion/blogs.',
    issuesZh: '敏感认证和个人账号管理页面强制配置 frame-ancestors none 防点击劫持。', issuesEn: 'Auth and account endpoints enforce frame-ancestors none against clickjacking.',
    limitsZh: '嵌入组件在第三方低沙箱权限网页中无法写入父页跨源 Cookie。', limitsEn: 'Sandboxed iframes default to read-only guest visualization.'
  },
  {
    id: 27, slug: 'trilingual-i18n', groupZh: '生态与诊断', groupEn: 'Ecosystem & Diagnostics',
    titleZh: '简体中文、繁体中文与英文无缝切换', titleEn: 'Seamless Simplified, Traditional Chinese & English UI',
    purposeZh: '全站界面、地名、物候术语、帮助手册全面适配简中、繁中与英文。', purposeEn: 'Switch dynamically across zh-CN, zh-TW, and en across every V5 module.',
    entryZh: '右上角语言切换胶囊（简 / 繁 / EN）或 URL ?lang= 参数。', entryEn: 'Language pill in the top bar or ?lang= URL parameter.',
    stepsZh: ['点击顶部语言按钮实时切换，同时保持当前浏览的城市与行程状态', '繁中采用词组级精准校对（如「攝影」「地圖」「資訊」等）'],
    stepsEn: ['Toggle locale without losing active map view or trip state', 'zh-TW maps domain-accurate terminology cleanly'],
    exampleZh: '向海外摄影搭子发送带 &lang=en 的协同或分享链接即可自动以英文界面呈现。', exampleEn: 'Add &lang=en to any link so international collaborators see native English UI.',
    issuesZh: '部分 Wikimedia Commons 上游摄影师原始说明文字保留作者提交语种。', issuesEn: 'User-submitted Wikimedia photo titles retain original uploader language.',
    limitsZh: '43 个语言与地区大数据包按需加载以保障首屏体积小巧。', limitsEn: 'Regional translation dictionaries load lazily per continent.'
  },
  {
    id: 28, slug: 'diagnostics-perf', groupZh: '生态与诊断', groupEn: 'Ecosystem & Diagnostics',
    titleZh: '系统诊断、API 健康监控与性能档位调整', titleEn: 'Diagnostics Console, 11-Service Health & Performance Tiers',
    purposeZh: '透明查看 11 项外部公共接口实时状态、WebGL 渲染帧率与一键释放内存缓存。', purposeEn: 'Monitor upstream service circuit breakers, WebGL FPS, and clear stale caches safely.',
    entryZh: '图层弹窗左下角「系统诊断」按钮。', entryEn: 'Layers popover -> Diagnostics button.',
    stepsZh: ['查看 Worker 代理状态及各开放接口（Open-Meteo、OSRM、Wikimedia 等）延迟', '低内存设备可手动选择 Low/Auto 性能档位关闭 3D 建筑高消耗层', '遇到局部旧缓存可用「刷新缓存」，不会误删用户行程或足迹'],
    stepsEn: ['Check worker proxy flags and API latency per upstream service', 'Throttle render quality tier on low-power devices', 'Clear API tile caches safely without wiping personal archives or trips'],
    exampleZh: '国内网络环境下对比瓦片线路健康后切换极速线路提升打开速度。', exampleEn: 'Verify tile CDN response health before choosing Auto/Mirror tile routing.',
    issuesZh: '若外部免费 API 出现限流（429），系统会自动退避并给出清晰降级标签。', issuesEn: 'Circuit breakers prevent retry storms during upstream rate limits.',
    limitsZh: '部分公共接口健康探活仅反映当前浏览器网络环境可达性。', limitsEn: 'Health probes measure reachability from your live browser network.'
  },
  {
    id: 29, slug: 'privacy-and-limits', groupZh: '透明性与支持', groupEn: 'Trust & Support',
    titleZh: '数据来源声明、开源致谢与已知科学边界', titleEn: 'Data Provenance, Open Licenses & Known Scientific Limits',
    purposeZh: '完整交代所有科学数据的来源许可、估算边界、模拟假设与禁止虚构承诺。', purposeEn: 'Understand exact upstream data sources, licenses, modeling assumptions, and boundaries.',
    entryZh: '手册本节、系统诊断及仓库 docs/DATA_SOURCES.md 与 KNOWN_LIMITATIONS.md。', entryEn: 'In-app Help Center + repository docs/DATA_SOURCES.md & KNOWN_LIMITATIONS.md.',
    stepsZh: ['气象与空气质量：Open-Meteo (CC BY 4.0) 14 天上限', '天文学星历：SunCalc & Astronomy Engine 本地数学计算', '街景与影像：NASA GIBS/EPIC（公有领域）、Panoramax、Wikimedia Commons', '地理与枢纽：Natural Earth、OurAirports（公有领域）、OpenStreetMap/OSRM'],
    stepsEn: ['Weather: Open-Meteo (CC BY 4.0, capped at 14 days)', 'Astronomy: SunCalc & Astronomy Engine offline ephemeris', 'Earth/Media: NASA GIBS & EPIC, Panoramax, Wikimedia Commons', 'Routing/Hubs: OurAirports & OpenStreetMap / OSRM'],
    exampleZh: '点击任意科学指标旁的蓝色来源标签即可追溯所用数据源。', exampleEn: 'Source badges across the UI always expose whether telemetry is live, orbital, or archive.',
    issuesZh: '严禁任何商用盗版抓取；未获授权服务绝不接入或模拟。', issuesEn: 'Zero unauthorized scraping or paid commercial data simulation.',
    limitsZh: '跨海无实时商业航班/火车班次报价接口，所有航线时间基于距离与门户枢纽诚实估算。', limitsEn: 'No live commercial flight/rail ticketing inventory; intercity leg times are estimates.'
  },
  {
    id: 30, slug: 'keyboard-and-feedback', groupZh: '透明性与支持', groupEn: 'Trust & Support',
    titleZh: '快捷键速查、常见问题 FAQ 与开源反馈通道', titleEn: 'Keyboard Shortcuts, Troubleshooting FAQ & Feedback',
    purposeZh: '快速检索全站键盘快捷键、离线/WebGL 异常排查及一键发起开源社区 Issue 反馈。', purposeEn: 'Look up keyboard shortcuts, debug common issues, and submit pre-filled GitHub feedback.',
    entryZh: '任意界面按键盘 ? 键或点击顶部「？」帮助图标。', entryEn: 'Press ? anywhere or click the "?" Help button in top/workspace bars.',
    stepsZh: ['快捷键速查：Ctrl/Cmd + K 打开智能搜索，? 打开本帮助手册，Esc 退出当前取景或弹窗', '遇到城市坐标偏差或页面异常，点击帮助面板「反馈 Issue」生成预填环境模板（自动隐藏敏感隐私数据）'],
    stepsEn: ['Shortcuts: Cmd/Ctrl+K Search, ? Help Manual, Esc Close modals/viewfinder', 'Click "Report Issue" in Help Center to open a sanitized GitHub Issue template'],
    exampleZh: '发现某个冷门景点摄影提示需要补充，填写简短标题点击跳转 GitHub 提交。', exampleEn: 'Report missing spot notes via the privacy-safe pre-filled GitHub Issue button.',
    issuesZh: '反馈链接仅作可选外跳预填表单，绝不会自动上传个人隐私、令牌或本地照片。', issuesEn: 'Feedback never transmits personal tokens, coordinates, or local photos.',
    limitsZh: '在浏览器无网络时反馈跳转需联网打开 GitHub。', limitsEn: 'Submitting a GitHub Issue requires internet connectivity.'
  }
];

function buildLocaleDocs(lang) {
  return {
    schemaVersion: '5.0.0',
    brand: 'KAIROS. — WORLD TRAVEL ATLAS',
    lang,
    chapterCount: CHAPTERS.length,
    chapters: CHAPTERS.map((c) => {
      if (lang === 'en') {
        return {
          id: c.id,
          slug: c.slug,
          group: c.groupEn,
          title: c.titleEn,
          purpose: c.purposeEn,
          entry: c.entryEn,
          steps: c.stepsEn,
          example: c.exampleEn,
          issues: c.issuesEn,
          limits: c.limitsEn
        };
      }
      const cvt = lang === 'zh-TW' ? toTraditional : (x) => x;
      return {
        id: c.id,
        slug: c.slug,
        group: cvt(c.groupZh),
        title: cvt(c.titleZh),
        purpose: cvt(c.purposeZh),
        entry: cvt(c.entryZh),
        steps: c.stepsZh.map(cvt),
        example: cvt(c.exampleZh),
        issues: cvt(c.issuesZh),
        limits: cvt(c.limitsZh)
      };
    })
  };
}

fs.mkdirSync(OUT_DIR, { recursive: true });
for (const lang of ['zh-CN', 'zh-TW', 'en']) {
  const doc = buildLocaleDocs(lang);
  const out = path.join(OUT_DIR, `manual-${lang}.json`);
  fs.writeFileSync(out, JSON.stringify(doc, null, 2), 'utf8');
  console.log(`Generated ${out} (${doc.chapterCount} chapters)`);
}
