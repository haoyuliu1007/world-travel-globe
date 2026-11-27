# 更新日志 (CHANGELOG)

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
