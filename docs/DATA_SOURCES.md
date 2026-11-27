# KAIROS. V5.0 — 科学数据源与上游治理说明 (DATA SOURCES)

## 一、本地策展数据与验证资产

1. **核心地理与机位库 (`data/registry.js` + 55 区域脚本)**：`node scripts/audit-data.js` 校验确认 **6 大区域 · 137 国/地区 · 722 目的地 · 5,414 摄影机位**（零重复 ID / 零无效经纬）。
2. **科学物候增强与溯源层 (`data/enrichment/atlas-enrichment.json`, Schema 5.0.0)**：
   - 722 座目的地均附带 `provenance`（`source`, `sampleCoords`, `spatialResolution`, `timeCoverage`, `generatedAt`, `qualityGrade`, `missingFields`, `license`）与 `phenologyModelTier`。
   - **23 城 Tier C 实证校准子集 (`data/enrichment/phenology-validation.json`)**：基于 JMA / KMA / US NPS / CMA / KNMI / GeoSphere Austria 2015–2024 历史物候基准序列执行奇数年拟合、偶数年样本外交叉验证，实测 **樱花满开 MAE = `2.89` 天 (RMSE `3.64` 天)**，**红叶峰值 MAE = `4.84` 天 (RMSE `6.03` 天)**。其余 699 城实事求是标示为 `Tier B`。
3. **全球多式联运枢纽索引 (`data/transport/hubs.json`)**：基于公有领域 **OurAirports** 数据集关联距离 722 座城市最近的商业机场门户（含 IATA 代码与大圆距离）及区域高速铁路可达性元信息。

---

## 二、外部公共开放服务矩阵

| 服务 | 数据源与许可 | 代理 / 缓存机制 | V5 诚实披露与降级策略 |
|---|---|---|---|
| **Weather & AQ & ERA5** | Open-Meteo (CC BY 4.0) | `/api/weather` + IDB 缓存 | 严格执行 **<= 14 天预报边界**，超期自动隐藏实时云风分值，绝不伪造远期天气 |
| **Earth Imagery & Lights** | NASA EOSDIS GIBS / VIIRS Black Marble (Public Domain) | WMTS + `/api/tile/blackmarble` | 明示卫星云量及极地极夜条带空缺，分屏对比支持 A/B 日期混合 |
| **Full-Disk Live Earth** | NASA DSCOVR EPIC L1 (Public Domain) | `/api/epic?date=YYYY-MM-DD` (6h Cache) | 所选日期无数据时清晰回退最新实拍并如实标注 `actualDate` |
| **Aurora Space Weather** | NOAA SWPC OVATION & Kp (Public Domain) | `/api/aurora` (15m Cache) | 与植物物候彻底分离为“空间天气模型”，结合 IGRF 磁纬与太阳负角评估 |
| **Exchange Rates (FX)** | Frankfurter / European Central Bank (MIT / Open) | `/api/fx` (12h Cache) | 实时获取不到汇率时平滑降级离线基准参考汇率并提示用户以银行实收为准 |
| **3D Elevation (DEM)** | Mapterhorn WebP + AWS/Mapzen Terrarium (Public Domain) | 栅格瓦片 + 本地射线 | 明确声明约 30–76m 网格分辨率，区分观测机位遮挡日出与高海拔主峰日照金山先期见光 |
| **Open Street View** | Panoramax STAC API + Mapillary (可选 Token) + Wikimedia | `/api/panoramax` & `/api/commons` | 保持四级降级链路，不强求付费街景 Key |
| **Commons Media** | Wikimedia Commons & Wikipedia (CC BY/SA 等) | `/api/commons` + 本地滤镜 | 白名单放行 `rice terrace / wild duck` 自然风光并保留菜品照过滤；无 EXIF 拍摄日期归类 `Undated` |
| **Routing & Airports** | OSRM / FOSSGIS (ODbL) & OurAirports (Public Domain) | `/api/route` | 跨海拒绝构造虚假公路几何；无商业航班/铁路实时票务 API 时清晰标注仅作距离时长估算 |
| **Trilingual User Manual** | 自研内置结构化文档 (`data/docs/manual-*.json`) | 按需静态加载 | 完整覆盖 30 章 `zh-CN / zh-TW / en` |
