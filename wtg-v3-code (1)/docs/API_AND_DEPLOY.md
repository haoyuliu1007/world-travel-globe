# API 接入、配置与双环境部署指南

## 一、零配置默认可用服务（无需信用卡与 API Key）

以下服务在 **GitHub Pages** 和 **Cloudflare Workers** 均默认开箱即用：

| 服务 | 用途 | 请求模式 | 缓存策略 |
|---|---|---|---|
| **Open-Meteo Forecast & Archive** | 实时天气、7 日预报、5 年 ERA5 历史气候 | 浏览器直连 CORS 或 `/api/weather` | 实况 30 分钟 / 历史气候 30 天 (IndexedDB) |
| **RainViewer Public API** | 全球实时降雨雷达与红外云图瓦片 | 公共 JSON + XYZ 瓦片 | 10 分钟 |
| **Wikimedia Commons & Wikipedia API** | 景点真实图片与作者/版权元数据 | `origin=*` CORS 或 `/api/commons` | 7 天 (IndexedDB) |
| **Wikidata API** | 地名、坐标、海拔、建筑师、遗产交叉核验 | `origin=*` CORS 或 `/api/wikidata` | 30 天 (IndexedDB) |
| **NASA EOSDIS GIBS WMTS** | 卫星真彩、历史影像、NDSI 积雪、NDVI 植被、云温 | 公开 WMTS 瓦片 (EPSG:3857) | 浏览器与 CDN 缓存 |
| **OSRM Public Router + FOSSGIS** | 真实路网计算：驾车走 `router.project-osrm.org`（该公共服务只托管驾车模型）；步行/骑行走 FOSSGIS `routing.openstreetmap.de` 的 routed-foot / routed-bike（旧实现把 foot/bike 路径发给驾车服务、会静默返回驾车路线，已修复） | 浏览器直连或 `/api/route` | 7 天 (IndexedDB) |
| **SunCalc / Fuse.js / Supercluster / Dexie / ECharts** | 天文、检索、聚合、本地数据库与图表 | 纯浏览器本地运行（已打包至 `vendor/`） | 本地静态资源 |

---

## 二、可选增强配置（均提供免费层级，按需开启）

1. **Mapillary 街景 Token（免费申请）**：
   - 获取方式：在 [Mapillary Developer Dashboard](https://www.mapillary.com/dashboard/developers) 注册免费应用获取 `Client Token`（无需绑定信用卡）。
   - 前端本地配置：打开地球仪右下角 **系统诊断 (`activity` 图标)** → 填入 `Mapillary Client Token`（仅存本地 IndexedDB）。
   - Cloudflare 服务端配置：把**公开 Client Token** 设为 Worker 变量 `MAPILLARY_CLIENT_TOKEN`（旧名 `MAPILLARY_TOKEN` 仍兼容）。Client Token 按 Mapillary 官方设计就是给浏览器端 MapillaryJS 用的公开令牌，Worker 的 `/api/streetview` 会把它随街景数据下发给前端以便渲染 360° Viewer；**应用的私密 Secret 绝不要填到这个变量、也不要提交进仓库**。
   - 未配置时的降级：自动切换为机位附近 Wikimedia Commons 实景照片，并提供 Mapillary/KartaView/Google Street View 坐标直达链接。

2. **OpenRouteService API Key（免费档 2,000 req/day）**：
   - 获取方式：在 [OpenRouteService](https://openrouteservice.org/dev/#/signup) 免费注册获取 Key。
   - 未配置时默认使用公开 OSRM 路网引擎；配置后优先使用 ORS，并在 Cloudflare Worker 侧通过 `npx.cmd wrangler secret put ORS_API_KEY` 保护密钥。

3. **Cloudflare D1（跨设备档案同步）与 R2（个人照片云端存储）**：
   - `wrangler.jsonc` 默认仅启用静态资源 + `/api/*` 代理，不会自动创建计费资源。
   - 如需开启个人档案云同步，请手动执行：
     ```bash
     npx.cmd wrangler d1 create world-travel-globe-db
     npx.cmd wrangler r2 bucket create world-travel-globe-photos
     ```
   - 将返回的 `database_id` 填入 `wrangler.jsonc`（可参考 `wrangler.example.jsonc`），执行全部建表迁移并部署：
     ```bash
     npx.cmd wrangler d1 execute world-travel-globe-db --remote --file=migrations/0001_init.sql
     npx.cmd wrangler d1 execute world-travel-globe-db --remote --file=migrations/0002_backups.sql
     node build-dist.js
     npx.cmd wrangler deploy
     ```
   - 同步语义（v3 修订）：整包档案（收藏/足迹/行程/消费/照片元数据/设置）存 `user_profiles` 一行，身份隔离靠口令 SHA-256 派生的 `X-Sync-Key`（口令不落服务端明文）。推送时前端带上次同步的服务端 `updatedAt`（请求头 `X-Base-Updated-At`），服务端版本已变化时返回 **409 冲突**、拒绝静默覆盖，须先拉取合并再推送；每次成功覆盖前，旧版本会写入 `profile_backups`（每用户保留最近 3 份），可用 `GET /api/profile?backup=latest`（带同一 `X-Sync-Key`）取回最近一份备份。单包上限 5 MB，非 JSON 返回 400。
   - 注意：本项目线上 Worker 为 **Wrangler 手动部署**（非 Git 集成自动部署），推送 GitHub 只会更新 GitHub Pages，Cloudflare 侧必须另行 `wrangler deploy`。

---

## 三、GitHub Pages vs Cloudflare Workers 差异说明

- **GitHub Pages**：纯静态环境，`/api/health` 返回 404 时前端自动进入 `static-direct` 模式，直接请求各公开 CORS 接口并使用 IndexedDB 持久化全部档案与行程；仅云端 D1/R2 同步提示“当前为静态模式，可使用 JSON 导入/导出或 URL 分享”。
- **Cloudflare Workers**：`worker/index.js` 通过 `run_worker_first: ["/api/*"]` 拦截 `/api/*`，提供边缘缓存、IP 滑动窗口限流（90 req/min）及服务端密钥隔离。
