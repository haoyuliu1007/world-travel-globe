# V4.0 科学数据源与数据治理说明 (DATA SOURCES)

## 一、本地策展地理档案（只读基线）

- 覆盖七大洲 **137 个国家/地区 · 722 座目的地 · 5,414 个摄影机位**。
- `node scripts/audit-data.js` 持续输出非破坏性审计报告 [data/audit-report.json](../data/audit-report.json)。
- `node scripts/build-enrichment.js` 在不改动源文件的前提下生成无损增强层 `data/enrichment/atlas-enrichment.json`（含数字海拔解析、16 类景观标签、高峰月份、预算基准与质量状态）。
- `.github/workflows/data-governance.yml` 每周自动执行全量数据校验、增强层构建与单元测试。

## 二、公开科学数据与遥感服务

| 数据源 | 用途 | 接入方式 | 数据限制声明 |
|---|---|---|---|
| **Mapterhorn & AWS Terrarium DEM** | 3D 地形、矢量等高线、前端 360° 地形遮挡射线追踪 | MapLibre `raster-dem` (Mapterhorn 512px WebP 主源 / AWS PNG 兜底) & Offscreen Canvas 解码 | z12 近场（约 38m/px）+ z11 远场（约 76m/px）多分辨率采样，小尺度人工建筑/树木遮挡未计入 |
| **NASA DSCOVR EPIC** | 今日真实整盘地球 L1 实拍彩蛋图 | Cloudflare `/api/epic` 或 NASA EPIC API (Public Domain) | 约每 1–2 小时拍摄一组地球向日面真实影像 |
| **NOAA SWPC OVATION & Kp** | 30 分钟极光概率椭圆带与地磁 Kp 指数 | Cloudflare `/api/aurora` 或直连 NOAA JSON | 仅反映地磁极光分布预测，实际观赏需结合实时云量与光污染 |
| **NASA EOSDIS GIBS & Black Marble** | 历史真彩/NDSI 积雪/NDVI 植被/夜间灯光底图 | WMTS EPSG:3857 瓦片 | 光学影像受云层覆盖影响，不可仅凭色差直接推断生态变化 |
| **Open-Meteo (Weather / Air Quality / ERA5)** | 实时天气、7 日预报、AQI/PM2.5/UV/花粉及 5 年 ERA5 再分析历史均值 | Cloudflare `/api/weather` 或直连 Open-Meteo | 再分析与模式网格数据代表区域均值（非站点直测），高山微气候可能存在显著差异 |
| **OpenFreeMap / OpenStreetMap** | 3D 城市建筑高度轮廓 (`fill-extrusion`) & OSRM 路网 | Vector Tiles & OSRM/FOSSGIS API | 建筑轮廓与高度依赖 OSM 社区覆盖完整度 |
| **Panoramax / Mapillary / Wikimedia / Wikidata** | 免密钥 360° 开放街景、实景摄影与地理实体核验 | STAC Search / MediaWiki API | 严格保留原作者、出处与 CC / Etalab 开放许可署名 |
