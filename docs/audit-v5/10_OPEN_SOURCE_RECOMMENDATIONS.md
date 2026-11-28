# KAIROS V5.0 开源项目与基础设施集成建议报告 (`10_OPEN_SOURCE_RECOMMENDATIONS.md`)

**审计对象**：KAIROS (`world-travel-globe` v5.0.0, commit `cfec5a3`)  
**基线参考**：[THIRD_PARTY_LICENSES.md](file:///c:/Users/Liam/Desktop/%E6%97%85%E6%B8%B8%E8%AE%A1%E5%88%92/globe-app/docs/THIRD_PARTY_LICENSES.md)、`package.json`、`vendor/`、`issues.json`  
**评估原则**：零无谓重写（保留无构建依赖轻量 Vanilla 架构优势），优先用高成熟度 MIT / BSD / Apache-2.0 方案替换已实证存在缺陷的自研轮子（CRDT、跨海判断、QR 编码、手写后端校验、占位测试）。

---

## 1. 全量 23+1 项开源候选技术评估总表

> 已于 `vendor/`、`package.json` 或线上 Worker 集成的组件已明确标记为 **`已集成`**，其余为新评估引入候选。

| # | 开源项目 / 数据服务 | 当前状态 | 核实许可证 / 商用限制 | 解决的 KAIROS 问题 | 结论 |
|---|---|---|---|---|---|
| 1 | **MapLibre GL JS** | **已集成** (`vendor/maplibre-gl.js` v5) | **BSD-3-Clause**（完全可商用） | 3D 球体、地形、矢量/栅格渲染基座 | **已集成-需深化或修正**（补样式加载队列与抗子午线处理） |
| 2 | **CesiumJS** | 未集成 | **Apache-2.0**（但 Cesium ion 免费版非商用/限流量，商用需付费订阅） | 更精细的航天/3D Tiles 地形引擎 | **不采用**（包体大、与现有 MapLibre 栈重复且生态迁移成本高） |
| 3 | **Three.js** | 未集成 | **MIT**（完全可商用） | 定制 3D 天体/大气散射/立体视锥 | **不采用**（现有 MapLibre Custom Layer + Canvas 已满足取景器需求，避免多 WebGL 上下文冲突） |
| 4 | **NASA GIBS** | **已集成** (WMTS v1.0.0) | **Public Domain**（NASA 公共领域，需保留署名与日期） | 地球时光机历史遥感、积雪/植被/黑夜灯光 | **已集成-需深化或修正**（补全三语本地化与真卷帘对比，修 `KAIROS-027`） |
| 5 | **Open-Meteo** | **已集成** (Forecast/AQ/Archive) | **CC BY 4.0（仅限非商用免费！商用需付费 API Plan 或自建托管）** | 实况天气、AQI 与 ERA5 历史再分析气候 | **已集成-需深化或修正**（商用前须购买商业授权或自部署；物候校准须用真实逐年 ERA5 数据修 `KAIROS-015`） |
| 6 | **OpenStreetMap** | **已集成**（底图/路网/建筑间接数据源） | **ODbL 1.0**（衍生数据须相同方式共享；公共 `tile.openstreetmap.org` 严禁高并发商业直连） | 全球路网、岛屿/海陆边界、火车站/地铁站核验 | **已集成-需深化或修正**（构建期提取铁路/渡轮/岛屿属性修复 `KAIROS-017`；避免直连公共瓦片） |
| 7 | **OSRM** | **已集成** (`router.project-osrm.org`) | **BSD-2-Clause**（公共 Demo 服务无 SLA 且禁商业高频滥用） | 驾车/步行/骑行真实路网几何与耗时 | **已集成-需深化或修正**（区分网络错误与跨海 `KAIROS-020`；生产规模化需自建容器或切换商业/配额后端） |
| 8 | **Valhalla** | 未集成 | **MIT**（完全可商用，可自托管或使用 FossGIS/Stadia 等托管） | 多式联运、等时圈 (Isochrone)、高程感知骑行/徒步与更稳健的岛屿/渡轮可达性 | **局部借鉴**（作为 OSRM 之上游增强或自托管替代，尤其适合摄影徒步与高程坡度路线） |
| 9 | **OpenTripPlanner** | 未集成 | **LGPL-2.1+**（依赖完整 GTFS 公交时刻表喂入） | 城市级实时公共交通多程换乘规划 | **不采用**（全球 722 城 GTFS 维护与 JVM 内存开销远超 Cloudflare Workers 轻量边界） |
| 10 | **Turf.js** | 未集成 | **MIT**（可按单函数 tree-shake 打包 `<15KB`） | 大圆航线跨 180° 经线分割、陆地多边形交叉检测 | **直接集成**（直接解决 `KAIROS-005` 跨海误判、`KAIROS-020` 日界线飞线与 `KAIROS-029` 海洋点位门禁） |
| 11 | **Astronomy Engine** | **已集成** (`vendor/astronomy.browser.min.js` v2.1.19) | **MIT**（完全可商用） | 高精度日/月/银河升落、暮光 `-18°` 与折射计算 | **已集成-需深化或修正**（全量接管太阳/月亮计算并统一替代 SunCalc，根治 `KAIROS-016`） |
| 12 | **SunCalc** | **已集成** (`vendor/suncalc.min.js` v2.1.4) | **BSD-2-Clause**（完全可商用） | 历史遗留太阳/月亮基础方位与时刻计算 | **不采用（建议逐步淘汰）**（`KAIROS-016` 暴露其无时区偏移与 `h=0` 折射截断缺陷，应迁移至已打包的 Astronomy Engine 减重 `17.4KB`） |
| 13 | **OurAirports** | **部分集成**（`scripts/build-transport-hubs.js` 仅内嵌 185 座） | **Public Domain**（`airports.csv` 完全开放可商用） | 全球 722 城真实最近商业门户机场 IATA 映射 | **已集成-需深化或修正**（用完整 `airports.csv` 过滤 `scheduled_service=yes` 重建 `hubs.json`，根治 `KAIROS-017` 13.4% 外国机场错配） |
| 14 | **Yjs** | 未集成 | **MIT**（完全可商用，轻量无 WASM） | 多人协同、多标签 `BroadcastChannel` 与离线 CRDT 合并 | **直接集成**（替换手写非交换 `crdt-merge.js`，根治 `KAIROS-004` 与 `KAIROS-003`） |
| 15 | **Automerge** | 未集成 | **MIT**（核心基于 Rust/WASM） | JSON 文档级 CRDT 同步 | **不采用**（WASM 初始化成本高，不如纯 JS 的 Yjs 契合无打包/轻浏览器与 Workers 环境） |
| 16 | **Hono** | 未集成 | **MIT**（专为 Cloudflare Workers 优化，`~14KB`） | 替换手写 `if (p === ...)` 路由链与安全中间件 | **直接集成**（内置 CSRF/CORS/安全头中间件，辅助根治 `KAIROS-001`、`KAIROS-010`、`KAIROS-011`、`KAIROS-014`） |
| 17 | **Zod** | 未集成 | **MIT**（完全可商用） | Worker API 入参、行程 JSON、头像 URL 与密码重置校验 | **直接集成**（配合 Hono 消除注入、越权字段覆盖与畸形头像 `KAIROS-001`/`011`） |
| 18 | **Vitest** | 未集成 | **MIT**（开发依赖，不影响运行时） | 替代简陋自写 runner，支持覆盖率、快照与模块隔离 | **直接集成**（配合原生 `node:sqlite` 重建可信单测，解决 `KAIROS-032`） |
| 19 | **Playwright** | **已集成** (`playwright-core@^1.65.1`) | **Apache-2.0**（开发依赖） | 多浏览器（含 Firefox/WebKit）、多视口、下载与协同 E2E | **已集成-需深化或修正**（补齐 Firefox/WebKit 安装与真实多上下文同步/文件校验断言，修 `KAIROS-032`） |
| 20 | **Lighthouse** | 未集成 | **Apache-2.0**（开发/CI 工具） | CI 自动化阻断 LCP/TBT/包体膨胀回退 | **直接集成**（守住移动 4G 与低端 CPU 性能预算，对应 `KAIROS-023`） |
| 21 | **axe-core** | 未集成 | **MPL-2.0**（开发/CI 测试，不进入商业运行时分发无传染风险） | 自动化扫描浅/深双主题对比度与模态框 ARIA 缺陷 | **直接集成**（直接在 CI 拦截 `KAIROS-006`、`KAIROS-030`、`KAIROS-033` 类事故） |
| 22 | **OWASP ZAP** | 未集成 | **Apache-2.0**（安全测试工具） | Staging 环境自动化 DAST 渗透（代理 XSS、CSP、CSRF） | **局部借鉴**（作为 GitHub Actions Staging 基线安全扫描，不触及生产站点） |
| 23 | **fast-check** | 未集成 | **MIT**（开发依赖） | 随机属性测试（交换律、结合律、分账零和守恒） | **直接集成**（CI 跑 `1,000+` 次随机检验，永久防止 `KAIROS-004`、`KAIROS-018` 复发） |
| +1 | **Nayuki QR Code Generator** | 未集成 | **MIT**（纯 JS 单文件极简实现，`~10KB`） | 替换残缺自研 `qr-code.js`（缺 V2+ 对齐图与 V7+ 版本块） | **直接集成**（即刻解决 `KAIROS-007` 与 `KAIROS-019`，确保所有分享链接 100% 可扫码） |

---

## 2. 重点开源方案深度论证（按架构域分类）

### 2.1 空间渲染与遥感地图域（MapLibre GL JS / CesiumJS / Three.js / NASA GIBS）
- **MapLibre GL JS（已集成-需深化或修正，BSD-3-Clause）**：
  - 现状评估：已是 KAIROS 的核心渲染基座，3D 地球投影与 Terrarium DEM 地形结合度极高。缺陷在于 `terrain-3d.js` 在 `!map.isStyleLoaded()` 时直接丢弃图层切换（`KAIROS-026`），且 `buildStyle` 耦合于 3,899 行的 `js/app.js`。
  - 改进策略：保留 MapLibre 作为唯一 3D/地图引擎，在 `terrain-3d.js` 中补全基于 `styledata` / `idle` 的挂起状态队列；继续复用已打包的 `maplibre-contour`。
- **CesiumJS（不采用，Apache-2.0 + Cesium ion 商业限制）**：
  - 核心制约：CesiumJS 自身解压包体通常达数 MB，与 MapLibre 并存会造成双 WebGL 上下文显存翻倍（对 iOS Safari 致命）；且其默认全球影像/地形依赖 **Cesium ion**，而 Cesium ion 免费版明确禁止商用且有每月资产/流量配额。KAIROS 现有 MapLibre + AWS Terrarium DEM + OpenFreeMap 已能满足旅行与摄影取景需求。
- **Three.js（不采用，MIT）**：
  - 现有 3D 取景器、星野天球与日夜晨昏线均已在 MapLibre 与 2D Canvas 中完成，引入 Three.js 会增加额外 `600KB+` 脚本与渲染同步复杂度，收益远小于维护成本。
- **NASA GIBS（已集成-需深化或修正，Public Domain）**：
  - 无需更换数据源；仅需修复 `#timemachine-dock` 在英文模式硬编码简体中文以及将透明叠加误称为“分屏对比”的问题（`KAIROS-027`）。

### 2.2 地理几何、路网路由与基础数据域（OpenStreetMap / OSRM / Valhalla / OpenTripPlanner / Turf.js / OurAirports）
- **Turf.js（直接集成，MIT）**：
  - **解决痛点**：直接闭环 3 个高优地理缺陷——（1）`@turf/great-circle` 自动生成经日界线（`±180°`）分割的 MultiLineString，修复东京→火奴鲁鲁跳变 `357.8°`（`KAIROS-020`）；（2）`@turf/boolean-intersects` 结合 Natural Earth `10m` 陆地/海洋多边形，在构建期与运行时识别跨海路线，彻底阻断上海/北京→东京建议“高铁 8.5 小时”或“自驾跨海”（`KAIROS-005`）；（3）CI 门禁校验 `sc-aldabra-outer` 等城市标点是否掉入深海（`KAIROS-029`）。
  - **契合度**：按子模块 ESM/UMD 摇树打包仅约 `10–18KB`，零外部运行时依赖。
- **OurAirports（已集成-需深化或修正，Public Domain）**：
  - **解决痛点**：`scripts/build-transport-hubs.js` 仅内置 185 个硬编码机场，导致 `97/722 (13.4%)` 目的地匹配到外国机场（如亚庇→宿务、长白山→海参崴、`KAIROS-017`）。只需在构建期脚本下载官方完整 `airports.csv`（过滤 `type IN ('large_airport','medium_airport') AND scheduled_service = 'yes'`）并优先同国家代码 (`iso_country`) 匹配，即可零运行时开销根治。
- **OpenStreetMap（已集成-需深化或修正，ODbL 1.0）**：
  - **合规边界**：OpenStreetMap 数据本身遵循 ODbL（若对 OSM 原始几何库做公开再分发衍生库需回馈共享），但**公共 `tile.openstreetmap.org` 严禁用于商业产品或高并发应用直接拉瓦片**（KAIROS 当前以 Esri/CartoDB/OpenFreeMap 为主，需在生产配置中继续禁止回退到 OSM 公共瓦片服务器）。推荐在离线构建脚本中利用 OSM Overpass/PBF 提取 722 城真实火车站/地铁站/岛屿摆渡标签，消除冲绳/济州岛误报高铁与乡村误报地铁问题（`KAIROS-017`）。
- **OSRM（已集成-需深化或修正，BSD-2-Clause）**：
  - **局限与风险**：当前 Worker 代理公共 `router.project-osrm.org` Demo 接口（无 SLA、限流且不允许商业依赖）；且 `routing-service.js` 将任意 OSRM 请求失败错误标记为 `crossSea: true`（`KAIROS-020`）。短期需立即分离 `routingError` 与 `crossSea`；若正式商业化运营，需使用 Docker 自建区域性 OSRM 实例或切换配额稳定的商业/开源托管路由。
- **Valhalla（局部借鉴，MIT）**：
  - **适用场景**：比 OSRM 更适合支持“时间依赖避让/轮渡权重/摄影徒步爬升坡度 (`elevation`) 与多模态等时圈”。可作为中长期替换自建 OSRM 的首选路由引擎。
- **OpenTripPlanner (OTP)（不采用，LGPL-2.1+）**：
  - 需持续聚合全球数千家公交机构 GTFS 时刻表且依赖高内存 JVM 集群，与 KAIROS 当前轻量级静态+Cloudflare Workers 架构完全不匹配。

### 2.3 气象与天文算法域（Open-Meteo / Astronomy Engine / SunCalc）
- **Open-Meteo（已集成-需深化或修正，CC BY 4.0 非商用免费）**：
  - **商用警示（关键风险）**：Open-Meteo 免费公共端点**明确仅限非商业用途**；如果 KAIROS 计划收费、接广告或商业化上线，**必须购买 Open-Meteo 商业 API 套餐或基于其开源代码自托管天气服务**。
  - **科学修复（`KAIROS-015`）**：现有物候验证脚本使用静态气候均值搭配人工模板；应利用 Open-Meteo Historical Weather (ERA5) 拉取真实历史逐年气温序列，搭配 JMA / NPN / PEP725 真实物候观测年份重建验证集。
- **Astronomy Engine（已集成-需深化或修正，MIT）与 SunCalc（建议淘汰，BSD-2-Clause）**：
  - 两者当前被重复打入 `vendor/libs.bundle.min.js`（分别 `116.7KB` 与 `17.4KB`）。`KAIROS-016` 已证实 `SunCalc` 在高纬度（如雷克雅未克夏至日落跳变 `+1440.4 min`）及深暮光折射（`h=0` 截断导致 `+0.12°~+0.28°` 偏差）存在硬伤。
  - 建议：**全站统一收口到已集成的 `Astronomy Engine`**，移除 `suncalc.min.js`，既消除 `24h` 误差，又削减冗余体积。

### 2.4 状态协同、编码与后端工程域（Yjs / Automerge / Hono / Zod / Nayuki QR）
- **Yjs（直接集成，MIT）vs Automerge（不采用，MIT）**：
  - `KAIROS-004` 实测自研 `crdt-merge.js` 在 600 次随机试验中交换律失败率 `73.3%`、结合律失败率 `19.2%`，且跨天移动直接复制景点。
  - 采用 **Yjs**（`Y.Doc` + `Y.Array` 管理每日景点顺序 + `Y.Map` 管理行程字段 + `y-indexeddb` 本地持久化 + `BroadcastChannel` 跨标签实时广播）可在纯 JS 下提供数学可证明的强最终一致性，体积仅约 `20–30KB` gzipped，无需引入 Automerge 的 WASM 加载负担；同时可与 D1 的 `baseVersion` 乐观锁及二进制增量快照协同（解决 `KAIROS-003`、`KAIROS-004`、`KAIROS-009`）。
- **Hono + Zod（直接集成，MIT）**：
  - `worker/index.js`、`worker/auth.js`、`worker/collab.js` 当前为超过 1,400 行的手写 `if/else` 路由，暴露出未校验 `verifyCsrf`（`KAIROS-010`）、全局 `Access-Control-Allow-Origin: *`、SVG 头像注入（`KAIROS-011`）、抢占他人 `trip.id`（`KAIROS-001`）等问题。
  - **Hono**（`~14KB`，Cloudflare Workers 原生一等公民）+ **Zod**（`@hono/zod-validator`）可将路由、CSRF 中间件、CORS 白名单、安全头与严格 JSON Schema 验证收敛为声明式防线，大幅降低人工漏加校验的概率。
- **Nayuki QR Code Generator（直接集成，MIT）**：
  - 自研 `qr-code.js` 在 V7–V10 缺少对齐网格与版本信息块导致 V8/V10 产生 `47`/`72` 个 RS 校验错误，真实 `?trip=` 链接完全无法扫码（`KAIROS-007`、`KAIROS-019`）。直接引入 Nayuki 的 single-file MIT TypeScript/JS 核心（支持全量 V1–V40、规范 4-module 静区）是最稳妥的零风险替换。

### 2.5 质量门禁与自动化测试域（Vitest / Playwright / Lighthouse / axe-core / fast-check / OWASP ZAP）
- **Vitest + `node:sqlite` + fast-check（直接集成，MIT）**：
  - 彻底替代当前跳过约束的正则 `MockD1` 与伪测试（`KAIROS-032`）。使用 Node 22 内置 `node:sqlite` 跑真实 SQL 约束，用 `fast-check` 对行程合并与 AA 整数分（`cents`）分账执行 `1,000+` 次属性验证，根治 `KAIROS-004` 与 `KAIROS-018`。
- **Playwright + axe-core + Lighthouse（深化/直接集成，Apache-2.0 / MPL-2.0）**：
  - 在已有 `playwright-core` 基础上补齐 `firefox` 与 `webkit` 引擎（消解 `UNVERIFIED-02`）；在 E2E 中嵌入 `axe-core`，对 Dark/Light 双主题下全部 19 个对话框执行自动对比度 (`>=4.5:1`) 与 `aria-labelledby` 校验，永久阻断 `KAIROS-006` 和 `KAIROS-030`；在 CI 中用 Lighthouse 强制限制移动端包体与 TBT 回退（`KAIROS-023`）。
- **OWASP ZAP（局部借鉴，Apache-2.0）**：
  - 以 CI Baseline Scan 方式定期对 Staging Worker（非生产站）运行被动/主动探测，重点验证 `/api/img`、`/api/tile` 的 `Content-Type` 透传与 CSP 配置（`KAIROS-014`）。

---

## 3. 分阶段集成落地路线图

| 阶段 | 目标与解决的问题 | 引入/升级组件 | 预期工程量 |
|---|---|---|---|
| **第 1 阶段（止血安全与核心可用）** | 消除扫码失效、跨海高铁、接口 CSRF/抢占越权、弹窗对比度与测试盲区 | `Nayuki QR`、`Turf.js`、`OurAirports 全量 CSV`、`Hono + Zod`、`axe-core`、`fast-check` | 中（`~1–2 周`） |
| **第 2 阶段（协同收敛与科学统一）** | 修复 CRDT 乱序与多标签/云端同步断链；统一天文计算、替换伪测试 | `Yjs`、`Astronomy Engine`（淘汰 SunCalc）、`Vitest + node:sqlite`、`Playwright` 多引擎 | 中（`~2 周`） |
| **第 3 阶段（体验性能与合规加固）** | 压缩移动首屏包体；强化 Staging 安全与路由韧性；商用授权落位 | `Lighthouse CI`、`OWASP ZAP`、`Valhalla`（备选评估）、Open-Meteo 商用评估 | 中（`~1–2 周`） |
