# World Travel Globe V4.3 · 系统架构说明 (ARCHITECTURE)

## 一、设计原则

1. **零服务器成本、本地优先**：纯原生模块化 JS + 单脚本 `build-dist.js` 静态打包，同时运行于 Cloudflare Workers（边缘代理 + 可选 D1/R2 + 静态 SEO 落地页）与 GitHub Pages 静态镜像。
2. **原始地理数据集只读保护**：55 个区域模块与 `data/registry.js` 保持只读，V4 新增的物候、海拔解析、景观分类与质量标记全部通过离线流水线写入独立无损层 `data/enrichment/atlas-enrichment.json`。
3. **优雅降级与诚实标注**：所有计算严格区分 `Astronomy / SunCalc 星历`、`ERA5 再分析气候`、`Terrarium/Mapterhorn DEM 高程` 与 `实地档案经验/参考估算`，任何外部 API 离线均不阻塞核心地球仪与档案功能。
4. **无 Cookie Web Analytics**：在 Cloudflare Pages/Dashboard 开启 Cloudflare Web Analytics 自动注入即可零代码采集真实访问与 Core Web Vitals（不内置无效占位 Token）。

---

## 二、核心引擎分层

| 引擎 | 核心模块 | 职责边界 |
|---|---|---|
| **1. 地球仪与三维空间渲染引擎** | `js/app.js`, `js/modules/terrain-3d.js`, `js/modules/bright-stars.js` | MapLibre GL v5 3D 球体、AWS Terrarium DEM 地形与山体阴影、`maplibre-contour` 矢量等高线、OpenFreeMap 3D 建筑、NASA Black Marble 夜景、NOAA 实时极光带、J2000 真实星穹 |
| **2. 专业摄影与第一人称取景引擎** | `js/modules/photo-simulator.js`, `js/modules/viewfinder-3d.js` | SunCalc + Astronomy Engine 太阳/月亮/银河核心计算、镜头画幅与焦段视场几何、前端 DEM 360° 山体遮挡射线追踪（日照金山推演）、透明 HUD 3D 取景器 |
| **3. 360° 沉浸式实景引擎** | `js/modules/streetview.js`, `js/modules/media-gallery.js` | Panoramax 免密钥 360° 等距柱状 WebGL 全景浏览器、序列上下站漫游、Mapillary 可选增强、Wikimedia Commons 实景与 Wikidata 核验 |
| **4. Geo Intelligence 搜索与图谱引擎** | `js/modules/geo-intelligence.js`, `js/command-palette.js` | MiniSearch v7.1.1 中英文分词全文检索、结构化自然语言意图解析（月份/季节/预算/天数/大洲/16 类景观/干爽偏好）、可解释推荐理由与轻量知识图谱关联 |
| **5. 全球景观物候与地球时光机** | `js/modules/phenology-engine.js`, `js/modules/aesthetic-index.js`, `js/modules/earth-timemachine.js` | 分景观物候模型（花海/秋叶/冰雪/极光地磁纬/银河星历）、地球仪季节前沿热力图、7 维追美指数、NASA GIBS 多时相双日期对比 |
| **6. 智能旅行规划引擎** | `js/modules/trip-planner.js`, `js/services/routing-service.js` | 最近邻 + 2-opt 路径优化、光影时段早晚排序、OSRM/FOSSGIS/ORS 真实路网测距（跨海不伪造陆路）、CSV/JSON/PDF 导出与 URL 分享 |
| **7. 个人档案与 CRDT 协同引擎** | `js/services/storage-db.js`, `js/services/crdt-merge.js`, `js/modules/travel-archive.js` | Dexie IndexedDB 本地持久化、LWW-Element-Set CRDT 多设备无损冲突合并、可选 Cloudflare D1/R2 隔离同步 |
| **8. 边缘代理与数据治理流水线** | `worker/index.js`, `scripts/audit-data.js`, `scripts/build-enrichment.js`, `build-dist.js` | `/api/*` 代理与限流、自动化数据审计、无损增强层生成、单文件 bundle 打包 |
