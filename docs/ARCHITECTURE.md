# World Travel Globe V4.5 · 系统架构说明 (ARCHITECTURE)

## 一、设计原则

1. **零服务器成本、本地优先**：纯原生模块化 JS + `build-dist.js` 单命令行静态构建，同时部署于 Cloudflare Workers（边缘代理 + 可选 D1/R2 + 静态 SEO 落地页 + 722 张 PNG OG 卡片）与 GitHub Pages 静态镜像。
2. **原始地理数据集只读保护**：55 个区域数据模块与 `data/registry.js` 严格保持只读，增强数据与质量审计结果全部写入独立无损层 `data/enrichment/atlas-enrichment.json` 与 `data/audit-report.json`。
3. **科学可信与边界透明**：所有天文、时区、气象、地形计算严格区分 `tz-lookup + Intl` IANA 时区、`SunCalc / Astronomy Engine` 星历、`ERA5` 再分析、`Terrarium/Mapterhorn` 栅格 DEM 与经验参考值；局限性完整披露于 [KNOWN_LIMITATIONS.md](KNOWN_LIMITATIONS.md)。
4. **工程级自适应与优雅降级**：渲染引擎根据硬件能力与前后台切换实时调整 DPR、标签密度与星穹负载；WebGL 上下文丢失或初始化失败时平滑进入 2D 图鉴浏览模式。

---

## 二、核心引擎分层

| 引擎 | 核心模块 | 职责边界 |
|---|---|---|
| **1. 地球仪与自适应三维渲染引擎** | `js/app.js`, `js/modules/terrain-3d.js`, `js/modules/bright-stars.js`, `js/modules/diagnostics.js`, `js/modules/solar-terminator.js` | MapLibre GL v5 3D 球体、`high/balanced/eco` 自适应渲染与低帧率看门狗、`visibilitychange` 后台降耗、WebGL context loss/fallback 2D 兜底、Mapterhorn 主源 + AWS Terrarium 自动回退、`SolarTerminator` 反太阳真球冠与 Sutherland-Hodgman 跨日界线晨昏阴影 |
| **2. 全球时区与专业摄影取景引擎** | `js/services/timezone-service.js`, `js/modules/photo-simulator.js`, `js/modules/viewfinder-3d.js` | `tz-lookup`（CC0）+ `Intl.DateTimeFormat` 按所选日期解析全球 IANA 时区/夏令时/半小时/45 分钟偏移（海洋回退 `Est. UTC±X`）、SunCalc + Astronomy Engine 星历、14–600mm 视场与 WebGL `18°–65°` 光学裁切模拟、360° DEM 地形遮挡射线追踪 |
| **3. 360° 沉浸式实景与 EPIC 实拍引擎** | `js/modules/streetview.js`, `js/modules/media-gallery.js`, `js/modules/epic-earth.js` | Panoramax 免密钥 360° WebGL 全景漫游、Wikimedia Commons 去美食地标优选与 Wikidata 交叉核验、NASA DSCOVR EPIC 1080px 全盘实拍与自动轮播 |
| **4. Geo Intelligence 搜索与物候引擎** | `js/modules/geo-intelligence.js`, `js/command-palette.js`, `js/modules/phenology-engine.js`, `js/modules/aesthetic-index.js`, `js/modules/earth-timemachine.js` | MiniSearch v7.1.1 中英文分词检索与自然语言约束解析、分景观物候预测模型、7 维追美指数、NASA GIBS 多时相双日期对比 |
| **5. 智能行程规划与多端 CRDT 档案** | `js/modules/trip-planner.js`, `js/services/routing-service.js`, `js/services/storage-db.js`, `js/services/crdt-merge.js`, `js/modules/travel-archive.js` | 2-opt 路径优化、OSRM/FOSSGIS 真实路网距离、Dexie IndexedDB 离线存储、严格满足交换律/结合律/幂等性的 LWW + 字段级墓碑 CRDT 同步、敏感凭据隔离 |
| **6. 边缘代理、API 弹性层与静态 SEO 管线** | `worker/index.js`, `js/services/api-client.js`, `scripts/build-seo-pages.js`, `build-dist.js` | `ApiClient` 指数退避 + `Retry-After` + `AbortSignal` + 11 路健康表；Worker 12s 超时与 `frame-ancestors *` CSP 嵌入头；`@resvg/resvg-js` + SHA-256 增量缓存（`.cache/og/`）并行生成 722 张 `1200×630` PNG OG 卡片与静态页面 |
