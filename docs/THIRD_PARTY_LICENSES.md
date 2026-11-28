# 第三方开源项目与开放数据授权声明

| 组件 / 数据源 | 版本 | 许可证 / 数据授权 | 使用范围与归属标注方式 |
|---|---|---|---|
| **MapLibre GL JS** | v5 (`vendor/maplibre-gl.js`) | BSD-3-Clause | 3D 球体与 2D 地图 WebGL 渲染引擎 |
| **SunCalc** | v2.1.4 (`vendor/suncalc.min.js`) | BSD-2-Clause | 太阳方位角/高度角、日出日落、黄金蓝调时刻与月相计算 |
| **Astronomy Engine** | v2.1.19 (`vendor/astronomy.browser.min.js`) | MIT | 高精度天文星历、天文暮光 (-18°) 与银河核心位置推算 |
| **tz-lookup** | v6.1.25 (`vendor/tz-lookup.min.js`) | CC0-1.0 | 离线经纬度到全球 IANA 时区 ID 查询（配合 `Intl.DateTimeFormat` 精确计算夏令时与半/四分之一小时时区） |
| **@resvg/resvg-js** | 构建期开发依赖（MPL-2.0） | MPL-2.0 | 构建期离线生成 722 座目的地 `1200×630` PNG OG 社交预览卡片（不打包入运行时前端） |
| **MapLibre Contour** | v0.1.0 (`vendor/maplibre-contour.min.js`) | BSD-3-Clause | 基于 DEM 瓦片浏览器端实时生成矢量等高线 |
| **Fuse.js** | v7.5.0 (`vendor/fuse.min.js`) | Apache-2.0 | 全局中英文模糊检索与拼写容错 |
| **MiniSearch** | v7.1.1 (`vendor/minisearch.min.js`) | MIT | V4 Geo Intelligence 中英文分词与多字段全文索引 |
| **Supercluster** | v9.1.0 (`vendor/supercluster.min.js`) | ISC | 722 座目的地低缩放空间聚合 |
| **Dexie.js** | v4.4.7 (`vendor/dexie.min.js`) | Apache-2.0 | IndexedDB 本地离线缓存与私人档案持久化 |
| **Apache ECharts** | v6.1.0 (`vendor/echarts.min.js`) | Apache-2.0 | 懒加载气象统计、行程预算饼图与年度足迹图表 |
| **AWS / Mapzen Terrarium DEM** | Public Elevation Tiles | Public Domain / CC0 | 全球 3D 真实地形起伏、等高线与前端山体遮挡射线计算 |
| **OpenFreeMap** | Planet Vector Tiles | ODbL / CC0 | 3D 城市建筑轮廓与高度渲染（`fill-extrusion`） |
| **Panoramax** | STAC Search API | Etalab-2.0 / CC BY-SA / 开放许可 | 免密钥开放 360° 全景与街景序列浏览（保留作者与协议署名） |
| **NOAA SWPC OVATION & Kp** | Public JSON Feeds | Public Domain | 全球 30 分钟实时极光椭圆带预测与地磁 Kp 指数 |
| **NASA VIIRS Black Marble** | GIBS WMTS | Public Domain (NASA) | 全球夜间灯光分布辅助参考图层 |
| **Hipparcos / Yale Bright Star Catalog** | J2000 精选子集 | Public Domain | 3D 天球真实导航亮星、星座连线与银河核心定位 |
| **Open-Meteo** | REST API v1 | CC BY 4.0（非商用免费） | 实时天气、7 日预报与 ERA5 历史再分析气候；界面已明确标注来源 |
| **RainViewer** | Public Weather Maps API | 免费公开气象瓦片（非商用） | 全球实时降雨雷达与红外云图叠加 |
| **Wikimedia Commons & Wikipedia** | MediaWiki API | CC BY / CC BY-SA / Public Domain 等 | 逐张图片在画廊与灯箱内展示作者、具体协议名称与原图链接 |
| **Wikidata** | MediaWiki API | CC0 1.0 Public Domain | 地理坐标、海拔、建筑师与遗产交叉核验，界面附带 QID 链接 |
| **NASA EOSDIS GIBS** | WMTS v1.0.0 | Public Domain (NASA) | 地球时光机历史遥感卫星瓦片，界面展示图层名、分辨率与日期 |
| **OpenStreetMap / OSRM** | Public Route API v1 | ODbL / BSD-2-Clause | 默认驾车、步行、骑行真实路网几何与距离计算 |
| **OpenRouteService** | Directions API v2（可选） | OpenRouteService Terms | 免费额度 2,000 req/day，配置 Key 后作为增强路由选项 |
| **Mapillary** | Graph API v4 & MapillaryJS（可选） | CC BY-SA 4.0 / MIT | 配置免费 Client Token 后提供街景与 360° 全景联动 |
| **Esri / CartoDB 底图瓦片** | 原有内置底图 | 各底图服务条款 | 保持原有底图源与归属标注 |
| **OurAirports** | Airport/Runway Dataset (4,029 commercial airports) | Public Domain | 构建期筛选生成 `data/transport/hubs.json`（722 城最近门户机场 IATA、坐标与距市中心公里数） |
| **qrcode-generator** | `qrcode-generator@^2.0.4` (`vendor/qrcode-generator.min.js`) | MIT | 前端离线生成标准 Version 1–40 QR 码矩阵与纯本地 SVG 卡片 |
| **jsQR** | `jsqr@^1.4.0`（开发依赖） | Apache-2.0 | 自动化单测对前端生成 QR 码进行端到端图像解码还原验证 |
| **fast-check** | `fast-check@^4.11.0`（开发依赖） | MIT | CRDT 结合律/交换律/幂等性与 AA 分账守恒属性随机测试（500 轮） |
| **axe-core** | `axe-core@^4.14.1`（开发依赖） | MPL-2.0 | Playwright 浏览器实测明暗双主题对比度与 ARIA 无障碍自动化扫描 |
| **Frankfurter API (ECB)** | Latest Reference Rates (`api.frankfurter.app`) | MIT / ECB Public Reference | `/api/fx` 多币种行程预算实时参考汇率 |
| **Playwright Core** | `playwright-core@^1.65.1`（开发依赖） | Apache-2.0 | E2E 多视口仿真与多上下文协同自动化回归测试 |
| **OpenCV (`cv2` build-time)** | 构建期脚本依赖 | Apache-2.0 | 一次性从品牌原始 PNG 设计稿提取并优化母版矢量轮廓与 Bezier 曲线（不进入运行时产物） |
