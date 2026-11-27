<div align="center">

# 🌍 World Travel Globe · 全球旅行地理图鉴 (v3.8)

**覆盖七大洲 · 137 个国家/地区 · 722 座精选目的地 · 5,414 个精准摄影机位的 3D 交互卫星地球仪平台**

[![Version](https://img.shields.io/badge/Version-v3.8.0-e0c38e?style=flat-square&labelColor=0b101b)](docs/CHANGELOG.md)
[![Countries](https://img.shields.io/badge/Countries%20%26%20Regions-137-4f8cff?style=flat-square&labelColor=0b101b)](#核心功能矩阵)
[![Destinations](https://img.shields.io/badge/Destinations-722-5b5ff9?style=flat-square&labelColor=0b101b)](#核心功能矩阵)
[![Photo Spots](https://img.shields.io/badge/Photo%20Spots-5%2C414-8b5cf6?style=flat-square&labelColor=0b101b)](#核心功能矩阵)
[![MapLibre](https://img.shields.io/badge/MapLibre%20GL-v5-2768f5?style=flat-square&labelColor=0b101b)](https://maplibre.org/)
[![License: MIT](https://img.shields.io/badge/License-MIT-10b981?style=flat-square&labelColor=0b101b)](docs/THIRD_PARTY_LICENSES.md)

[🌐 在线体验 (Cloudflare 边缘加速)](https://world-travel-globe.globe-app.workers.dev) · [📄 GitHub Pages 镜像](https://haoyuliu1007.github.io/world-travel-globe/) · [📜 v3.8 更新日志](docs/CHANGELOG.md)

</div>

---

## ✨ v3.8 里程碑亮点 (What's New in v3.8)

- **中轴灵动岛 + 四象限平衡空间布局 (Spatial Island UI)**
  - 桌面端重构为三段式顶部灵动岛：左岛（默认收起的 722 城清单胶囊 + 筛选 + 收藏）、中轴岛（地球/图鉴/规划/档案 + `⌘K` 搜索）、右岛（独立高亮的「🎵 电台」+ 外观 + 三语），让 3D 地球稳居绝对视觉中心。
  - 12 个月物候时间轴移至底部正中对齐主轴，右侧中部增设纤细竖向微操轨道（3D/2D、自转、全屏、缩放），右下角仅保留图层与「中国 / 全球」视角切换，彻底告别传统地图 UI 的左重右挤。
- **全球氛围电台 (`AmbientRadio`) · 16 首地理意境原声**
  - 内置 16 首涵盖 **星际 / 东方 / 海岸 / 旷野 / 夜航** 5 大意境分类的地理氛围配乐，支持懒加载零带宽启动、顺序/单曲/随机循环、音量记忆与平滑交接宇宙开场配乐。
- **高清 1:1 视差深空背景 + Retina 3D 联动繁星**
  - 新增超清 `2048×1152` 无色带 **星河 (`milkyway`)** 与 **极光 (`aurora`)** 双档深空背景（支持 `600ms` 交叉淡化切换与 1:1 有界 GPU 视差），叠加随地球经纬/旋转/俯仰实时联动的透明高分屏 3D 球面繁星层（静止零空转功耗）。
- **电影级「交叉淡化」单舞台探索序章 (`StoryPrologue`)**
  - 淘汰纵向滚动吸附的拉扯感，升级为固定全屏单舞台交叉溶解切镜；配合滚轮防连跳冷却锁、触控滑动、键盘直达与右侧 8 点章节轨道，统一 8 幕定制艺术底图（含 Nebra 星盘、Space & Place 与洪堡《Kosmos》）的动效节奏。
- **2K 宇宙飞入 + 6 步聚光灯新手导览 + 6 小时窗口 (`IntroSession`)**
  - 统一原声《The Blue Horizon》无缝贯穿 **交叉淡化序章 → 2K 宇宙飞入 → 6 步聚光灯新手导览**（第 3 步专项引导右上角「全球氛围电台」与外观设定），同一浏览器每 6 小时自动刷新 3 次完整入场体验窗口。

---

## 🎬 沉浸式开场体验链路

```text
  打开首页（符合 6 小时 × 3 次窗口）
        │
        ▼
  ┌────────────────────────────────────────────────────────┐
  │ 8 幕交叉淡化探索序章（后台静默预加载 3D 地球与 2K 影片） │──▶ 右上角低调「跳过」/ Esc ──▶ 直达 3D 地球仪
  └────────────────────────────────────────────────────────┘
        │ 点击第 8 幕「进入 3D 地球仪」（解锁全屏与配乐）
        ▼
  ┌────────────────────────────────────────────────────────┐
  │ 2K QHD 宇宙飞入动画（同步播放 The Blue Horizon 配乐）  │
  └────────────────────────────────────────────────────────┘
        │ 尾帧叠化进入已完全加载的真实 3D 卫星地球仪
        ▼
  ┌────────────────────────────────────────────────────────┐
  │ 6 步聚光灯新手导览（含氛围电台引导，结束后配乐渐隐）   │
  └────────────────────────────────────────────────────────┘
```

---

## 🧩 核心功能矩阵

| 模块 | 核心能力说明 | 技术 / 数据支撑 |
|---|---|---|
| **3D 卫星地球仪与物候轴** | 支持卫星影像 / 国家地理 / 地形 / 暗夜 4 套球面皮肤与 3D/2D 切换；12 个月物候时间轴筛选最佳花期、雪季、秋叶与极光窗口；自动探测国内/全球极速底图线路。 | MapLibre GL JS v5 · Supercluster v9.1.0 |
| **追美指数与实景核验** | 7 维可调权重追美评分模型与 722 城榜单；按需加载 Wikimedia Commons 实景图库、CC 协议标注与 Wikidata 坐标/海拔/遗产交叉核验。 | Wikimedia Commons · Wikidata API |
| **专业摄影光影模拟器** | 推演任意日期与经纬度的日出日落、黄金/蓝调时刻、月相与太阳方位仰角轨迹；分析机位顺/侧/逆光，并在 3D 地球仪实时投射太阳射线与视角扇形。 | SunCalc v2.1.4 · 自研 3D 光影叠加 |
| **全球动态气象与时光机** | 实时天气、7 日预报与 5 年 ERA5 历史月度气候统计图表；叠加 RainViewer 实时雷达云图及 NASA GIBS 卫星真彩/积雪/NDVI 植被/云顶温度双日期对比滑块。 | Open-Meteo · RainViewer · NASA GIBS · ECharts v6.1.0 |
| **街景与智能行程规划** | 支持 Mapillary 360° 街景联动与无 Token 实景降级；输入出发地/天数/预算自动规划多日行程，真实路网测距（跨海不伪造陆路）、账单拆分、CSV/PDF 导出与 `?trip=` 分享。 | Mapillary · OSRM / FOSSGIS / OpenRouteService |
| **全球氛围电台与深空背景** | 内置 16 首 5 大地理意境原声（支持懒加载、循环/随机与音量记忆），搭配超清星河/极光 1:1 视差深空背景及 3D 球面联动繁星层。 | Web Audio / HTML5 Audio · Retina 3D Starfield |
| **本地优先私人档案** | 无需登录即可记录已去过/计划/想去清单、自定义列表、本地压缩摄影作品库与消费台账，支持 `?footprint=` 分享与可选 Cloudflare D1/R2 口令隔离云同步。 | Dexie.js v4.4.7 (IndexedDB) · Cloudflare D1/R2 |

---

## 🛠️ 技术栈与工程架构

- **零构建依赖前端体系**：原生 JS 模块化架构，仅通过单脚本 `build-dist.js` 即可完成 CSS/JS 合并、42 个大区懒加载分片（`data/regions/`）、43 个多语种分片（`data/i18n/`）及轻量全局索引打包。
- **高性能检索与离线外壳**：`Web Worker` + `Fuse.js v7.5.0` 中英文容错模糊检索（支持 `Ctrl/Cmd + K` 或 `/` 全局命令面板）；`manifest.webmanifest` + Network-First 策略 `sw.js` 实现离线外壳与瞬时热更新。
- **开场与多媒体子系统**：独立打包的 `intro.bundle.min.js`（`IntroSession` + `CosmicBGM` + `StoryPrologue` + `CosmicIntro`），确保首屏零闪烁启动且不阻塞地图核心脚本。

---

## 💻 本地开发、审计、测试与构建

仅需安装 **Node.js (>= 18)**，在 `globe-app/` 目录下执行：

```bash
# 1. 非破坏性地理数据质量审计（生成 data/audit-report.json）
node scripts/audit-data.js

# 2. 构建生产静态产物到 dist/（42 个地区懒加载分片 + 轻量索引 + 全部合并包）
node build-dist.js

# 3. 运行自动化测试套件（含地理完整性、天文计算、会话窗口、行程规划与 Worker 校验）
node --test tests/*.test.js

# 4. 本地预览生产产物 dist/（默认监听 http://127.0.0.1:4173/）
node scripts/dev-server.js
```

---

## 🚀 双平台部署架构

| 部署环境 | 构建方式 | 静态资源 | 扩展能力 |
|---|---|---|---|
| **Cloudflare Workers**（主力线上） | 本地执行 `node build-dist.js` 后通过 `npx wrangler deploy` 发布 | `./dist` 全量静态资源 + 边缘缓存 | `/api/*` 边缘代理、IP 限流（90 req/min）、服务端密钥隔离；可选绑定 D1/R2 开启跨设备云同步与相册 |
| **GitHub Pages**（静态镜像） | `.github/workflows/deploy-pages.yml` 自动运行 `node build-dist.js` | `dist/` 全量静态托管 | 自动切入 `static-direct` 模式，浏览器直连公开 CORS 接口并通过 IndexedDB 持久化档案 |

---

## 📚 延伸文档与归属

- [版本更新日志 (CHANGELOG)](docs/CHANGELOG.md)
- [API 接入、密钥配置与双平台部署指南](docs/API_AND_DEPLOY.md)
- [地理数据结构与字段规范 (DATA_SCHEMA)](docs/DATA_SCHEMA.md)
- [宇宙开场片源与配乐说明 (Film & Audio Credits)](assets/cosmic-intro/credits.html)
- [开源组件与开放数据许可声明](docs/THIRD_PARTY_LICENSES.md)
