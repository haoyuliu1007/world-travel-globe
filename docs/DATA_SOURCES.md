# V4.5 科学数据源与上游弹性治理说明 (DATA SOURCES)

## 一、本地策展地理档案（只读基线）

- 覆盖七大洲 **137 个国家/地区 · 722 座目的地 · 5,414 个摄影机位**。
- `node scripts/audit-data.js` 持续输出非破坏性审计报告 [audit-report.json](../data/audit-report.json)。
- `node scripts/build-enrichment.js` 在不改动 55 个原始数据模块的前提下生成无损增强层 `data/enrichment/atlas-enrichment.json`。
- `.github/workflows/ci-quality.yml` 与 `.github/workflows/data-governance.yml` 自动化执行数据校验、静态构建、单元/属性测试与 Playwright 端到端回归测试。

---

## 二、11 路公开科学数据与遥感服务矩阵

| 服务 ID | 数据源 | 用途 | 接入与弹性保障 (`ApiClient` / Worker) | 数据边界与局限性声明 |
|---|---|---|---|---|
| `open-meteo` | **Open-Meteo (Weather / Air Quality / ERA5)** | 实时天气、7 日预报、AQI/PM2.5/UV/花粉及 5 年 ERA5 再分析均值 | `/api/weather` (30m cache, 12s timeout) 或直连；15m 客户端内存+IDB 缓存 | 再分析与网格模型代表区域估计值，不用于替代历史/未来任意日期时区换算 |
| `nasa-gibs` | **NASA EOSDIS GIBS & Black Marble** | 历史真彩/积雪/植被遥感时光机与全球夜间灯光图 | WMTS EPSG:3857 瓦片直连或 Worker `/api/tile/blackmarble` (7d cache) | 光学遥感受云层覆盖影响，仅供宏观参照 |
| `nasa-epic` | **NASA DSCOVR EPIC** | L1 拉格朗日点今日真实整盘地球实拍与自动轮播 | Worker `/api/epic` (6h cache, 12s timeout) + `/api/img` (7d immutable) 返回 1080px `mediumUrl` (`jpg/`) | 约每 1–2 小时拍摄一组地球向日面真实影像 |
| `noaa-swpc` | **NOAA SWPC OVATION & Kp** | 30 分钟实时极光椭圆带预测与地磁 Kp 指数 | Worker `/api/aurora` (15m cache, 12s timeout) 或直连 NOAA JSON | 仅反映地磁预测概率，实际观测受实时云量与光污染制约 |
| `mapterhorn` | **Mapterhorn 512px WebP DEM** | 3D 球面默认高精地形渲染（`tileSize: 512`, `maxzoom: 12`） | 直连或 `/api/tile/mapterhorn`，单源瓦片连续报错自动回退 `aws-terrarium` | 免费开放主 DEM 源，局部城市细节精度有限 |
| `aws-terrarium` | **AWS / Mapzen Terrarium DEM** | 3D 地形兜底源、矢量等高线与前端 360° 地形遮挡射线追踪 | MapLibre `raster-dem` / `maplibre-contour` / Canvas 解码 (`z12` + `z11`) | 约 30–76m 栅格分辨率，未计入建筑、树木及大气细节 |
| `openfreemap` | **OpenFreeMap Vector Tiles** | `zoom >= 13` 3D 城市建筑轮廓拉伸 (`fill-extrusion`) | `https://tiles.openfreemap.org/planet` (`eco` 模式自动禁用减载) | 建筑高度覆盖依赖 OSM 社区标注完整度 |
| `wikimedia` | **Wikimedia Commons & Wikipedia** | 目的地真实实景摄影画廊与多语百科主图 | Worker `/api/commons` & `/api/wikipedia` (24h cache) + `media-wikidata.js` 去美食滤镜 | 严格保留原作者、协议名称（CC BY/SA 等）与原图链接 |
| `wikidata` | **Wikidata Entity API** | 目的地坐标、海拔、建筑师与遗产地交叉核验 | Worker `/api/wikidata` (24h cache) + 诊断列表对比记录 | 仅在弹窗展示实体核验差值与 QID 链，绝不覆写原始地理库 |
| `panoramax` | **Panoramax STAC API** | 免密钥 360° 等距柱状开放街景与序列漫游 | Worker `/api/panoramax` (1h cache) + WebGL 原生全景浏览器 | 覆盖度取决于开放街景采集轨迹；可选配置 Mapillary Token 增强 |
| `osrm` | **OSRM / FOSSGIS Routing** | 多日智能行程真实驾驶/步行/骑行路网与几何距离 | Worker `/api/route` (FOSSGIS car/foot/bike + OSRM fallback) | 跨海段标注大圆直距，绝不伪造跨洋陆路轨迹 |

所有请求均受 `ApiClient` 统一调度：**指数退避 + 随机抖动**、**429/503 `Retry-After` 遵循**、**外部 `AbortSignal` 中断传播** 及 **11 路实时健康状态表**（可在「系统诊断」面板随时查看）。详细边界限制请参阅 [KNOWN_LIMITATIONS.md](KNOWN_LIMITATIONS.md)。
