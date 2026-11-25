# 更新日志 (CHANGELOG)

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
