# 更新日志 (CHANGELOG)

## [4.3.0] - 2026-11-27 · Living Earth, 722 SEO Pages, Poster Share & Embed Widget

### 新增与深化升级 (Added & Upgraded)
- **太阳驱动「真·昼夜晨昏地球」 (`js/modules/solar-terminator.js`)**：
  - 纯天文离线实时计算太阳直射点、晨昏线（0° / -6° / -12° 三带球面阴影）及柔光金橙晨昏晕，并联动 MapLibre `setLight` 太阳方向照明与自动开启夜面 NASA Black Marble 灯光；附带 24 小时 UTC 时间轴拖拽推演悬浮条。
- **722 城构建期静态 SEO 落地页 + 专属 OG 卡片 + Sitemap (`scripts/build-seo-pages.js`, `build-dist.js`)**：
  - 每次构建在 `dist/p/<id>/index.html` 生成 722 个独立可收录 HTML 页面（含 `canonical`、OG 元信息、`TouristDestination` JSON-LD、12 月物候图、全量机位与“在 3D 地球仪探索”深链），以及 `dist/p/index.html` 目录页、`dist/og/<id>.svg` 信息卡、`dist/og/cover.png`（1200×630 PNG 兜底封面）、`dist/sitemap.xml` 与 `dist/robots.txt`。
- **Retina 旅行海报一键导出 + Web Share API (`js/modules/poster-share.js`)**：
  - 支持目的地详情、个人足迹档案与智能行程三大场景导出 `1080×1620` Retina PNG 海报（通过 `map.once('render')` 无损截取当前 3D 地球视口并合成排版），移动端优先调起系统 `navigator.share({ files })` 分享面板。
- **可嵌入迷你地球小部件 (`?embed=<id>&chrome=off`)**：
  - 新增纯净嵌入模式，自动隐藏顶部灵动岛与外围面板，仅保留底部玻璃态标题条与回链；在详情抽屉右上角提供一键复制 `<iframe>` 嵌入代码。
- **Mapterhorn 512px WebP 地形 + Open-Meteo AQI/UV/花粉 + NASA DSCOVR EPIC**：
  - `Terrain3DModule` 新增免密钥 Mapterhorn WebP 主 DEM 源（AWS Terrarium 作为兜底）；`WeatherService` 接入 Open-Meteo `air-quality-api` 展示 US AQI、PM2.5、UV 指数与花粉提示；`worker/index.js` 与 `EpicEarthModule` 接入 NASA L1 拉格朗日点今日真地球实拍彩蛋。

## [4.2.0] - 2026-11-27 · CRDT Reliability, Optical Viewfinder, Destination Timezones & Global UX

### 修复与深化升级 (Fixed & Upgraded)
- **CRDT 删除墓碑、逻辑时钟、字段级合并与密钥隔离 (`js/services/crdt-merge.js`, `js/services/storage-db.js`, `js/modules/travel-archive.js`, `worker/index.js`)**：
  - 引入跨设备 `tombstones` 删除墓碑与 Lamport 逻辑时钟，结合 `mode === 'crdt'` 本地写入，彻底杜绝多设备离线删除后数据复活。
  - 新增 `travelStatus` 字段级合并（`status` / `notes` / `rating` / `visitedAt` 独立时间戳）、规范化 JSON 顺序无关决胜、云同步前自动本地快照备份与一键恢复，并严格剥离 `cloudSyncPassphrase`、`mapillaryToken`、`orsApiKey` 等敏感本地配置。
- **地球标签与聚合圈碰撞避让、平滑缩放与可点击悬停卡 (`js/app.js`)**：
  - 将可见 Supercluster 聚合圈边界框注入文字碰撞占位集合，扩大聚合半径至 `54`、边缘自动左右翻转并预留视口安全边距，英文模式下纯 CJK 城市名自动规范化回退为英文标题格式。
  - 右侧 `+` / `-` 缩放按钮升级为 `±0.35` 级连击目标累加阻尼过渡；地图悬停浮窗增加 `180ms` 移入缓冲与点击直达目的地详情抽屉。
- **全界面三语国际化覆盖 (`js/i18n.js`, `detail-panel.js`, `media-gallery.js`, `travel-archive.js`, `trip-planner.js`, `command-palette.js`)**：
  - 统一抽离状态按钮、机位操作胶囊、实景画廊标题、规划页与档案页工作区至 `AppI18n`，并实现 `document.title` 随语言切换实时更新。
- **专业 3D 取景器光学裁切与画幅纵横比 (`js/modules/viewfinder-3d.js`, `photo-simulator.js`, `css/upgrades.css`)**：
  - 新增 `14–600mm` 连续焦段滑块、横/竖构图切换、以及 `原生 / 3:2 / 4:3 / 16:9 / 1:1` 构图比例；当长焦垂直 FOV 低于 MapLibre WebGL 18° 下限时，基于正切几何比精确收缩取景框并标示裁切百分比。
- **目的地当地时间基准与多分辨率 DEM 地平线 (`photo-simulator.js`, `terrain-3d.js`)**：
  - 修复天文星历/日出日落及银河窗口使用浏览器本地时区的偏差，统一基于目的地经度/Open-Meteo `utc_offset_seconds` 计算并展示 `UTC±X 当地时间`。
  - 升级地形射线追踪为 `z12 近场 + z11 远场` 多分辨率采样与机位高度偏置（1.6m），明确区分“观测点遮挡日出”与“远处主峰日照金山”。
- **自然语言搜索相关性、硬约束、ERA5 诚信标注与 CI 修复**：
  - 命令面板默认榜单改为六大洲均衡精选；`GeoIntelligence` 新增负向排除（`不要海滩`）、类比平替（`像瑞士但更便宜`）与预算硬约束过滤；精确地名搜索收敛噪点。
  - 将 `ERA5 实测气候` 更正为 `ERA5 再分析气候`；强化跨大洲旗帜/地名错配图像过滤并升级缓存前缀；修复 `.github/workflows/data-governance.yml` 仓库路径与 `docs/DATA_SOURCES.md` 相对路径。

## [4.1.0] - 2026-11-27 · UI Polish, Scenery Filtering & 60fps Perf

### 修复与体验优化 (Fixed & Optimized)
- **彻底解决详情抽屉与顶部灵动岛重叠问题 (`css/styles.css`, `css/upgrades.css`)**：
  - 桌面端 `.detail-drawer` 下移至 `top: 72px`，与顶部 `44px` 灵动岛留出 `12px` 呼吸间距，右上角「电台 / 外观 / 语言」不再遮挡抽屉关闭/分享/收藏按钮。
  - 移动端 `.detail-drawer` 提升层级（`z-index: 38`）并隐藏冲突中的右侧轨道，全屏展开时可随时无阻点击关闭按钮。
  - 为 `.layers-popover` 增加 `max-height: calc(100dvh - 132px)` 与内部滚动，为 `.aurora-status-pill` 增加抽屉避让与取景器/全屏自动隐退。
- **Wikimedia 实景画廊去噪与风景地标优选 (`js/services/media-wikidata.js`)**：
  - 新增 `scoreTravelPhoto` 与 `rankAndFilterTravelPhotos`：自动过滤或重降权美食/菜品/Logo/定位图/肖像等非风景图，扩大候选池并优先展示横向高分地标建筑与自然风光，同时升级缓存键（`photos:v3p` / `photos:v3`）立即刷新客户端旧缓存。
- **全链路 60fps 渲染与内存泄漏修复**：
  - **360° 全景 WebGL (`streetview.js`)**：修复 `window.mousemove` 全局监听未解绑导致的内存泄漏，关闭时主动触发 `WEBGL_lose_context` 释放显存。
  - **3D 取景器 (`viewfinder-3d.js`)**：对太阳轨迹计算按机位+日期+时刻缓存，并使用 `requestAnimationFrame` 合并拖拽帧更新指南针标尺与光影判定。
  - **光影模拟器 (`photo-simulator.js`)**：拖动时间/方位滑块改为局部原地 DOM 刷新，彻底消除滑块失焦与卡片闪烁；Open-Meteo 预报增加 15 分钟内存缓存。
  - **真实星穹 (`app.js`) & 全局搜索 (`command-palette.js`)**：星穹 J2000 坐标按 60 秒缓存减少每帧对象分配；全局搜索增加中文 IME 组合输入保护与 `65ms` 防抖。
- **自动化测试扩展**：新增 `tests/v4-1-polish.test.js`（总测试数增至 25 项）。

## [4.0.0] - 2026-11-27 · Geo Intelligence

### 新增 (Added)
- **3D 真实地形、矢量等高线、3D 建筑、暗夜灯光与实时极光 (`Terrain3DModule` + `BrightStars`)**：
  - 图层面板新增「3D 地形与天文奇观」分组：接入 AWS Terrarium DEM 真实地形（含 `1.0× / 1.35× / 1.8×` 起伏倍率与山体阴影）、懒加载 `maplibre-contour` 矢量等高线、OpenFreeMap 3D 建筑轮廓 (`fill-extrusion`)、NASA VIIRS Black Marble 夜间灯光、NOAA SWPC OVATION 30 分钟实时极光预测带及全球季节物候热力图。
  - 新增 Hipparcos/Yale J2000 真实亮星表与格林尼治恒星时（GMST）投影，使背景亮星、经典星座连线与银河核心对齐地球真实方位。
- **专业摄影引擎与第一人称 3D 取景器 (`PhotoSimulator` + `Viewfinder3D`)**：
  - 集成 `Astronomy Engine v2.1.19`，精确计算银河核心 (Sgr A*) 方位/仰角、天文黑夜 (`-18°`) 起止及当晚最佳银心窗口。
  - 新增传感器画幅（全画幅 / APS-C / M4/3 / 中画幅）与焦段（`14mm–200mm`）真实几何视场计算。
  - 实现前端 Terrarium DEM 360° 地形遮挡射线追踪，输出山体地平线剖面与遮挡修正后的真实日出/日落时刻。
  - 新增全屏透明 HUD 3D 机位取景器，联动地图相机 FOV 与实时方位标尺。
- **Panoramax 免密钥 360° 全景探索 (`StreetViewModule`)**：
  - 优先检索 Panoramax 开放街景，内置原生 WebGL 等距柱状 360° 全景浏览器与上下站漫游，保留 `Panoramax → Mapillary → Wikimedia → 外部地图` 优雅降级链路。
- **Geo Intelligence 自然语言搜索与全球科学物候引擎 (`GeoIntelligence` + `PhenologyEngine`)**：
  - 集成 `MiniSearch v7.1.1` 中英文分词全文检索与结构化自然语言意图解析，输出可解释推荐理由、不确定性提示与轻量地理知识图谱关联。
  - 新增 `scripts/build-enrichment.js` 与 `.github/workflows/data-governance.yml`，在不破坏 55 个原始数据模块的前提下生成 722 城无损增强层 `data/enrichment/atlas-enrichment.json`。
  - 新增分景观物候评估模型（春花 / 秋叶 / 冰雪 / 极光地磁纬 / 银河星历）与地球仪季节前沿热力图。
- **行程 2-opt 优化 & CRDT 多设备无损同步 (`TripPlanner` + `ProfileCRDT`)**：
  - 智能行程生成器新增 2-opt 路径优化、早晚光影时段排序与预算估算标记；私人档案云同步新增 LWW-Element-Set CRDT 冲突自动合并闭环。
- **Cloudflare Worker 边缘代理扩展与 V4 全套自动化测试**：
  - `worker/index.js` 新增 `/api/aurora`、`/api/panoramax` 与 `/api/tile/{terrarium,blackmarble}` 代理；新增 `tests/v4-phase1.test.js` 与 `tests/v4-phase2-3.test.js`（总测试数达 22 项）。

## [3.8.0] - 2026-11-27

### 新增 (Added)
- **全球氛围电台 (`AmbientRadio`) 与 16 首地理意境原声**：
  - 新增 `js/modules/ambient-radio.js` 与 `assets/bgm/` 15 首氛围配乐（连同主题原声《The Blue Horizon》共 16 首），涵盖 **星际 / 东方 / 海岸 / 旷野 / 夜航** 5 大地理意境分类。
  - 支持音频懒加载（初始化零额外带宽开销）、顺序 / 单曲 / 随机循环模式、音量调节与 `localStorage` 偏好持久化；点击播放时自动平滑停止 `CosmicBGM`，并与宇宙开场转场无缝衔接。
  - 新增 `tests/ambient-radio.test.js` 自动化测试（覆盖 16 首曲目完整性、懒加载、循环模式切换与 BGM 互斥校验，总测试数增至 13 项）。
- **高清 1:1 视差深空背景双预设 + Retina 3D 联动繁星层**：
  - 淘汰旧版高噪点银河贴图，新增超清 `2048×1152` 无色带 **星河 (`milkyway`，默认)** 与 **极光 (`aurora`)** 双档深空背景（`assets/skyboxes/`），在外观面板提供实图缩略预览与 `600ms` 双层交叉淡化切换。
  - 采用 1:1 原生锐度有界 GPU 视差漂移与透明高分屏 3D 球面星场画布（750–950 颗真实光谱色温星点，随地球经纬度/旋转/俯仰同步联动、放大至近景自动隐退、静止零空转功耗），并柔化 MapLibre 大气层晕染。
- **6 步聚光灯新手导览升级 (`OnboardingTour`)**：
  - 欢迎卡片新增第 4 项亮点「全球氛围电台 · 16 首地理意境配乐」。
  - 导览步骤从 5 步升级为 6 步，全面对齐全新四象限灵动岛布局；第 3 步专门聚光灯高亮右上岛引导氛围电台与外观切换，同步更新简体中文 / 繁体中文 / 英文三语翻译。

### 优化与重构 (Changed & Fixed)
- **桌面端「中轴灵动岛 + 四象限平衡」空间布局重构 (Spatial Island Architecture)**：
  - 顶栏重排为三段悬浮灵动岛：左岛（默认收起的 722 城清单触发胶囊 + 筛选 + 收藏）、中轴岛（地球/图鉴/规划/档案切换 + `⌘K` 全局搜索）、右岛（独立高亮的「🎵 电台」入口 + 外观 + 三语）。
  - 12 个月物候时间轴移至底部正中与中轴对齐，左下角改用轻量化统计标注；右侧中部新增纤细竖向微操轨道（`#orbit-rail`：3D/2D、地球自转、全屏与缩放），右下角精简为图层与「中国 / 全球」视角切换。
  - 全部弹出面板（`#music-popover`、`#appearance-popover`、`#lang-popover`、`#filter-popover`、`#layers-popover`）按象限重新锚定并支持详情抽屉避让与移动端两段式响应式排布；`player.css` 同步纳入新控件的入场渐显。
- **探索序章重构为电影级「交叉淡化」单舞台 (`StoryPrologue`)**：
  - 移除易引起滚轮拉扯与回弹的 `scroll-snap-type: y mandatory` 纵向拼接，改为固定全屏单舞台交叉溶解切镜（旧幕前景先轻盈淡出，新幕背景 `640ms` 平滑叠化）。
  - 新增滚轮累计阈值防连跳冷却锁、移动端触控滑动与 `Home / End / Space / 方向键` 键盘导航，点击右侧章节圆点直接直达不扫屏。
  - 补充 `scene-2-nebra.jpg`、`scene-5-place.jpg`、`scene-6-humboldt.jpg` 三张定制艺术底图，并统一 8 幕文字浮现与背景微缩放节奏。

## [3.5.0] - 2026-11-27

### 新增 (Added)
- **8 幕整屏吸附式「探索序章」(Story Prologue)**：
  - 基于 `100dvh` + `scroll-snap-type: y mandatory` 重构序章网页，严格实现“一页只讲一件事”，并配备右侧 8 点章节进度轨道与顶部渐变进度条。
  - 采用纯 GPU 合成层动画（`opacity + translate3d` + `cubic-bezier(0.22, 1, 0.36, 1)`）、语义短语 `.sp-phrase` 断行与静态渐变焦点句，彻底消除旧版滚动阻尼与字距/模糊抖动。
  - 第 6 幕集成洪堡《宇宙》与 `137 / 722 / 5,414` 实时数字计数条；第 7 幕内置「物候刻度 / 日照星盘 / 环球航迹」三标签天文仪器交互演示台；第 8 幕为唯一主入口终章。
- **2K QHD 宇宙开场影片与后台预加载 (`CosmicIntro`)**：
  - 集成 Real-ESRGAN AI 超分 2K QHD 宇宙飞入影片，并支持在用户阅读序章时后台静默缓冲预加载（`preload()`）。
- **全链路统一配乐与 6 小时滚动会话机制 (`CosmicBGM` & `IntroSession`)**：
  - 统一配乐《The Blue Horizon》无缝贯穿「探索序章 → 宇宙飞入影片 → 新手导览」，直到导览完成或关闭后才平滑渐隐停止。
  - 新增 `IntroSession`（`wtg_intro_window_v1`）：同一浏览器每 6 小时自动刷新一次重置窗口，窗口内前 3 次进入自动走完整体验，第 4 次起直达地球仪。
- **Apple 级液态玻璃 UI、三语国际化与 5 步新手导览**：
  - 新增白天/黑夜液态玻璃（Liquid Glass）视觉体系与自定义主题色盘；补齐简体中文、繁体中文、英文全量界面与地理数据翻译。
  - 新增 5 步聚光灯新手导览（`OnboardingTour`），导览界面同步支持配乐静音控制（`#tour-bgm-btn`）。
- **全设备支持与手势全屏**：
  - 开放 PC / 平板 / 手机全设备开场与影片体验；在用户点击「开启序章之旅」或「进入 3D 地球仪」时调用 Fullscreen API 进入系统全屏，不支持环境静默降级为 `100dvh` 满视口。
- **自动化测试扩展**：
  - 新增 `tests/intro-session.test.js`，验证 6 小时 3 次窗口计数、第 4 次跳过、满 6 小时自动重置与深链跳过（自动化测试总数增至 11 项）。

### 优化与修复 (Changed & Fixed)
- **开场体验顺序重构**：调整为「序章网页优先（后台静默预加载 3D 地球仪与视频）→ 点击进入播放宇宙动画 → 尾帧叠化进入已就绪 3D 地球仪 → 导览 → 配乐停止」，解决地球仪首次旋转黑屏与首次音频自动播放拦截问题。
- **导览衔接与配乐生命周期修复**：修复导览已读状态与开场计数不同步导致导览丢失、配乐提前中止的时序与持久化缺陷，改为在导览关闭时统一记录已读并停止音乐。
- **全屏画布自适应**：在 `js/app.js` 监听 `fullscreenchange` / `webkitfullscreenchange` 自动触发 `map.resize()` 与标签重排，避免全屏切换后地球仪画布裁切或黑边。
- **加载与缓存优化**：增加首屏 `prologue-boot` 零闪烁引导脚本、Network-First Service Worker（`sw.js`）策略及国内/全球底图线路自动探测。

## [3.0.0] - 2026-11-26

### 新增 (Added)
- **项目审计与底层基建**：
  - 新增 `scripts/audit-data.js` 与 `data/audit-report.json`，对 722 城 5,414 机位执行非破坏性坐标与完整性审计。
  - 引入并本地化 `SunCalc v2.1.4`、`Fuse.js v7.5.0`、`Supercluster v9.1.0`、`Dexie.js v4.4.7` 与按需懒加载的 `Apache ECharts v6.1.0`。
  - 新增 `StorageDB`（IndexedDB 持久化与旧收藏自动迁移）、`ApiClient`（限流/重试/去重/TTL 缓存/Worker 自动探测）、`LazyLoader`、`atlas-worker.js` 与 PWA (`manifest.webmanifest`, `sw.js`)。
- **P0 真实媒体与 Wikidata 核验**：
  - 新增 `MediaWikidataService` 与 `MediaGallery`：支持城市及展开机位的 Wikimedia Commons 实景照片按需加载、全屏灯箱、作者与 CC 版权展示，以及 Wikidata 元数据交叉核验与坐标差异审核记录。
- **P0 全球动态气象系统**：
  - 新增 `WeatherService` 与 `WeatherPanel`：接入 Open-Meteo 实况、7 日预报与 2020–2024 5 年 ERA5 月度气候统计图表，支持 RainViewer 全球实时雷达与红外云图图层。
- **P0 专业摄影机位模拟器**：
  - 新增 `PhotoSimulator`：支持任意日期/时间、机位朝向角度、SunCalc 日出日落/黄金/蓝调/月相罗盘 SVG、24 小时高度角曲线与 3D 地球仪实时太阳射线及视场角扇形叠加。
- **P0 全球追美指数引擎**：
  - 新增 `AestheticIndex`：7 维可定制权重评分与预设（综合追美/风光摄影/舒适度假/冰雪极光），提供目的地拆解与 722 城全局排行榜。
- **P1 沉浸式街景与地球时光机**：
  - 新增 `StreetViewModule`：支持 Mapillary 街景查询与无覆盖/未配置时的 Wikimedia 实景降级与外链跳转。
  - 新增 `EarthTimeMachine`：接入 NASA GIBS 公开 WMTS 遥感图层（真彩/历史/积雪/NDVI 植被/云顶温度），支持时间轴、双日期混合对比与晨昏昼夜线。
- **P1 智能旅行规划系统**：
  - 新增 `RoutingService` 与 `TripPlanner`：支持多日逐日行程生成、拖拽排序、OSRM/OpenRouteService 真实路网计算（跨海不伪造陆路）、账单编辑、3D 地球仪路线预览、JSON/CSV/PDF 导出与 `?trip=` URL 分享。
- **P2 私人旅行档案、高级交互与 Cloudflare Workers 后端**：
  - 新增 `TravelArchive`：本地优先足迹管理、自定义清单、压缩图片上传、真实消费台账、年度图表、足迹地球图层与 `?footprint=` 分享。
  - 升级 `CommandPalette`（Fuse.js 模糊检索）、`app.js`（Supercluster 空间聚合、全屏探索 `F` 键）与 `DiagnosticsModule`（性能分级、FPS/内存/缓存监控、API Key 设置、审核队列）。
  - 新增 `worker/index.js`、`migrations/0001_init.sql` 与 `wrangler.example.jsonc`。

### 修复 (Fixed)
- 修复 `StorageDB.init()` 初始化迁移时的重入等待问题，确保全链路 IndexedDB 与外部 API 调用顺畅完成。
- 修复桌面端与移动端顶部搜索胶囊、机位浮窗、月份轴与底部控制栏在抽屉展开时的重叠及裁剪问题。
