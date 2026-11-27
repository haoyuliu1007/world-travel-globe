# KAIROS. V5.0 — 开源项目复用与选型评估报告 (OPEN_SOURCE_INTEGRATION)

| 候选/复用项目或方案 | 官方来源与许可 | 选用决策 | 复用理由、兼容环境及包体积影响 |
|---|---|---|---|
| **OpenCV (`cv2`) + `@resvg/resvg-js`** | Apache-2.0 / MPL-2.0 | **采用（仅构建期）** | 一次性精准矢量化 KAIROS 圆相母版并离线渲染 PNG/ICO/OG 卡片，零前端运行体积增加 |
| **SunCalc v2.1.4 + Astronomy Engine v2.1.19 + `tz-lookup` v6.1.25** | BSD-2 / MIT / CC0 | **复用现有内核** | 已验证成熟无网络依赖星历与全球 IANA 时区反查；避免重复造轮或付费 API |
| **MiniSearch v7.1.1 + Fuse.js v7.5.0 + Supercluster v9.1.0** | MIT / Apache-2.0 / ISC | **扩展复用** | 在已有索引上增加交通便捷/题材/节奏解析与 10 维余弦相似引擎，零额外依赖 |
| **OurAirports (`airports.csv`)** | Public Domain | **构建期静态索引 (`hubs.json`)** | 为 722 城提取最近商业机场网关与距离，无需运行时请求商用 GDS，离线即用 |
| **Frankfurter FX API (`api.frankfurter.app`)** | MIT / ECB | **Worker `/api/fx` 12h 代理** | 免费零 Key 获取欧央行权威参考汇率，无可用网络时平滑回退静态基准表 |
| **Native BroadcastChannel + `crdt-merge.js`** | W3C / Project MIT | **扩展复用** | 实现跨标签页局部实时同步 + LWW 墓碑收敛，避免引入 Yjs 重型包或付费 Durable Objects |
| **Pure-JS `QRCodeService` (`js/services/qr-code.js`)** | 自研轻量 2.8KB | **内置本地 SVG** | 替代外部二维码图片服务或大体积三方库，保护分享 URL 隐私 |
| **RFC 5545 ICS / GPX 1.1 / KML 2.2 / GeoJSON Generators (`js/lazy/export-service.js`)** | 开放标准规范 | **按需懒加载自研** | 纯文本/XML 生成仅 ~7KB 未压缩按需模块，避免引入多套重型导出库 |
| **NOAA SWPC OVATION / NASA GIBS & EPIC / Panoramax / OSRM** | Public Domain / Etalab / ODbL | **增强接入** | 为极光、时光机、EPIC 历史日查询与 360° 街景补全元数据与合法降级说明 |
