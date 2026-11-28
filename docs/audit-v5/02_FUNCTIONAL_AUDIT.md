# KAIROS V5.0 全功能模块逐项核查报告 (`02_FUNCTIONAL_AUDIT.md`)

> **审计范围**：Phase 2 全部 30 个功能域（`01_prologue_brand` 至 `30_pwa_sw_prod`），覆盖 **入口检查 → 用户操作 → 数据验证 → 异常输入 → 错误恢复 → 状态持久化** 6 个完整生命周期阶段。  
> **状态分类标准（严格六级）**：`完整实现且已验证` / `已实现但存在缺陷` / `部分实现` / `仅有界面或占位实现` / `依赖外部配置` / `无法验证`。  
> **关联证据**：[functional-audit-results.json](file:///c:/Users/Liam/Desktop/旅游计划/globe-app/docs/audit-v5/evidence/functional-audit-results.json)、[issues.json](file:///c:/Users/Liam/Desktop/旅游计划/globe-app/docs/audit-v5/issues.json) 及 `screenshots/prod-*.png`。

---

## 1. 多运行环境实测对比总览

在本次全功能核查中，严格区分三套运行环境以防止将本地桩数据误判为线上能力：

| 运行环境 | 访问地址 / 载体 | 实测能力与核心观察 |
| :--- | :--- | :--- |
| **Production（生产边缘站）** | `https://world-travel-globe.globe-app.workers.dev/` | 运行 Cloudflare Worker V5.0.0，`d1: true, auth: true, collab: true, fx: true, streetview: true, panoramax: true, epic: true, airQuality: true`；但 **`r2: false, oauthGoogle: false, emailDelivery: false, poisEnhanced: false`**。实测出现 `/api/health` 1800ms 超时锁死静态模式的竞争缺陷（**`KAIROS-022`**，见 `prod-16-account-modal.png`）；出于只读安全原则未对生产 D1 写入。 |
| **GitHub Pages（纯静态托管）** | `https://haoyuliu1007.github.io/world-travel-globe/` | **已确认部署 V5.0.0**（由 `main` 分支经 `deploy-pages.yml` 自动构建，`wtg-shell-mwzcd7lq`，`722` 城、`5,414` 机位、`0` 控制台报错、`0` HTTP 错误），无 `/api/*` 后端，运行 `static-direct` 模式。注：`pages` 分支仍停留在 V4.5.0（`KAIROS-032`）。 |
| **Local Worker + SQLite** | `http://127.0.0.1:59010` + 隔离 SQLite PoC | 完整验证了注册/登录/登出与真实 SQLite 持久化（`dbUserCount: 1, dbSessionCount: 1`）、离线 SW 恢复（断网加载 `722` 城），以及 **`CollabSpace` 在已登录 D1 状态下仅展示 `"D1 Cloud RBAC"` 徽标却发出 `0` 次 `/api/collab/*` 请求**的断联真相（**`KAIROS-003`**）。 |

---

## 2. 30 个功能域全量状态总表

> **说明**：主状态遵循 Phase 2 运行时实测结论（[functional-audit-results.json](file:///c:/Users/Liam/Desktop/旅游计划/globe-app/docs/audit-v5/evidence/functional-audit-results.json)）；当功能在浅层 UI 可用但存在明确算法/安全/交互缺陷或部分子能力未接通时，已在“关联缺陷 / 注释”列中给出精确 `KAIROS-0xx` 与子项分级（含`仅有界面或占位实现`、`依赖外部配置`、`无法验证`子项标注）。

| # | 功能域 ID & 名称 | Phase 2 实测状态 | 实证截图 | 核心问题 / 关联缺陷 ID |
| :---: | :--- | :--- | :--- | :--- |
| 01 | `01_prologue_brand` 开场序章与 KAIROS 品牌体系 | **完整实现且已验证** | [prod-01-prologue.png](file:///c:/Users/Liam/Desktop/旅游计划/globe-app/docs/audit-v5/screenshots/prod-01-prologue.png) | 顶部品牌徽标旁存在冗余双圆环（`KAIROS-033`）；`bgm.js` 提前预加载音频（`KAIROS-034`） |
| 02 | `02_3d_globe` 3D 地球仪交互与视角控制 | **完整实现且已验证** | [prod-02-globe-dark-zh.png](file:///c:/Users/Liam/Desktop/旅游计划/globe-app/docs/audit-v5/screenshots/prod-02-globe-dark-zh.png) | 俯仰角/缩放/自转/拖拽均正常；纯软件 SwiftShader 环境仅 19.4 FPS（物理 GPU 见 `UNVERIFIED-04`） |
| 03 | `03_search_spots` 722城/5414机位检索与命令面板 | **完整实现且已验证** | [prod-04-command-palette.png](file:///c:/Users/Liam/Desktop/旅游计划/globe-app/docs/audit-v5/screenshots/prod-04-command-palette.png) | 拼写容错如 `Beiijng` 返回 0 条；空查询返回 28 条、多处自然语言正则误伤（`KAIROS-025`）；桌面搜索框文案截断（`KAIROS-033`） |
| 04 | `04_basemap_layers` 多底图切换（国家地理/地形/暗夜/卫星） | **完整实现且已验证** | [prod-03-globe-light-en.png](file:///c:/Users/Liam/Desktop/旅游计划/globe-app/docs/audit-v5/screenshots/prod-03-globe-light-en.png) | 4 套底图可正常加载与切换 |
| 05 | `05_terrain_buildings` 3D 地形起伏与 3D 建筑体块 | **部分实现** | — | 3D 地形激活正常（`hasTerrain: true`）；**3D 建筑切换后 `btnActive: false, hasBuildingsLayer: false`**（`KAIROS-026` 样式加载期保护缺失） |
| 06 | `06_gibs_epic` 科学图层（夜光/极光/晨昏线）与 NASA EPIC | **部分实现** | [prod-10-epic-modal.png](file:///c:/Users/Liam/Desktop/旅游计划/globe-app/docs/audit-v5/screenshots/prod-10-epic-modal.png) | 晨昏线与 EPIC 弹窗可用；**夜光与极光在生产实测中未能挂入图层（`matchingLayers: []`）**；EPIC 缺加载兜底态（`KAIROS-027`）及日期并发竞态（`KAIROS-031`） |
| 07 | `07_earth_timemachine` 地球时光机 (NASA GIBS) | **完整实现且已验证** | [prod-09-timemachine.png](file:///c:/Users/Liam/Desktop/旅游计划/globe-app/docs/audit-v5/screenshots/prod-09-timemachine.png) | 存在明显缺陷：“分屏对比卷帘”实为透明度混合而非空间卷帘，且在 EN 模式下全界面硬编码简体中文（`KAIROS-027`） |
| 08 | `08_detail_drawer_tabs` 详情抽屉 6 标签页导航 | **完整实现且已验证** | [prod-05-drawer-overview.png](file:///c:/Users/Liam/Desktop/旅游计划/globe-app/docs/audit-v5/screenshots/prod-05-drawer-overview.png) | 移动端底部导航栏遮挡抽屉底部文本（`KAIROS-024`，`prod-18-mobile-drawer-390x844.png`） |
| 09 | `09_phenology` V5 物候窗口与 Tier A/B/C 分级 | **完整实现且已验证** | [prod-06-drawer-phenology-weather.png](file:///c:/Users/Liam/Desktop/旅游计划/globe-app/docs/audit-v5/screenshots/prod-06-drawer-phenology-weather.png) | 算法标定存在合成模板循环论证，LOOCV 误差逊于城市历史均值（`KAIROS-015`） |
| 10 | `10_weather_aqi_echarts` 实况天气、空气质量与 ECharts 图表 | **完整实现且已验证** | [prod-06-drawer-phenology-weather.png](file:///c:/Users/Liam/Desktop/旅游计划/globe-app/docs/audit-v5/screenshots/prod-06-drawer-phenology-weather.png) | Open-Meteo + AQ + 5年均值 + 2个 ECharts 渲染正常；7日预报“大部晴朗”折行导致温度错位（`KAIROS-033`） |
| 11 | `11_photo_simulator` 摄影光影模拟器与 POI 评分 | **完整实现且已验证** | [prod-07-drawer-photo-sim.png](file:///c:/Users/Liam/Desktop/旅游计划/globe-app/docs/audit-v5/screenshots/prod-07-drawer-photo-sim.png) | 高纬度夏季（如雷克雅未克 6/21）日落存在 `+1440.4 min` 跨日跳变（`KAIROS-016`） |
| 12 | `12_alpenglow` 日照金山 / 霞光预测 | **完整实现且已验证** | [prod-07-drawer-photo-sim.png](file:///c:/Users/Liam/Desktop/旅游计划/globe-app/docs/audit-v5/screenshots/prod-07-drawer-photo-sim.png) | 梅里雪山实测正常输出并附带物理条件免责声明 |
| 13 | `13_astronomy_milkyway_moon_aurora` 银河/月相/极光天文计算 | **完整实现且已验证** | [prod-07-drawer-photo-sim.png](file:///c:/Users/Liam/Desktop/旅游计划/globe-app/docs/audit-v5/screenshots/prod-07-drawer-photo-sim.png) | SunCalc 负高度折射偏差及将无月出/连续暮光误标为 `"Polar Day/Night"`（`KAIROS-016`） |
| 14 | `14_viewfinder_3d` 3D 光学裁切取景器 | **完整实现且已验证** | [prod-08-viewfinder-3d.png](file:///c:/Users/Liam/Desktop/旅游计划/globe-app/docs/audit-v5/screenshots/prod-08-viewfinder-3d.png) | 400mm/画幅/Esc 关闭正常；顶栏金色分割线压盖 `40°` 且海拔误显 `0m`（`KAIROS-033`） |
| 15 | `15_streetview_gallery` 实景图库与 360° 街景探索 | **完整实现且已验证** | — | 香格里拉仅 1/3 Wikimedia 缩略图加载成功；街景弹窗内 `hasIframeOrImg: false`，仅提供外链（`KAIROS-031`） |
| 16 | `16_dest_compare` 同类型目的地横向对比 | **部分实现** | [prod-17-dest-compare.png](file:///c:/Users/Liam/Desktop/旅游计划/globe-app/docs/audit-v5/screenshots/prod-17-dest-compare.png) | 抽屉内点击对比按钮未可靠展开（`dcCheck.open: false`）；Light 模式下文字对比度严重失效（`KAIROS-006`） |
| 17 | `17_smart_recommendation` 智能推荐与季节筛选 | **完整实现且已验证** | — | 秋季/秋色实测返回 28 城及推荐理由；`GeoIntelligence` 5 个意图标记位未参与评分（`KAIROS-025`） |
| 18 | `18_trip_planner` Trip Planner 2.0 行程生成与拖拽编排 | **完整实现且已验证** | [prod-11-trip-planner.png](file:///c:/Users/Liam/Desktop/旅游计划/globe-app/docs/audit-v5/screenshots/prod-11-trip-planner.png) | 北京/东京隔离已修复，但 5/10 英文城市别名失效、9 字段重置泄漏、多城跨区直连、94km 步行未告警（`KAIROS-020`）；顶部 `#topbar` 透底穿帮（`KAIROS-030`）；移动端表单被遮挡（`KAIROS-024`，`prod-19`） |
| 19 | `19_transport_mode` 3 层多式联运与枢纽推荐 | **完整实现且已验证** | [prod-12-planner-transport.png](file:///c:/Users/Liam/Desktop/旅游计划/globe-app/docs/audit-v5/screenshots/prod-12-planner-transport.png) | **严重地理逻辑缺陷**：上海/北京→东京标记高铁/普铁/自驾跨海可行（`KAIROS-005`）；97/722 城主机场位于外国、27 座海岛误标有高铁（`KAIROS-017`） |
| 20 | `20_budget_fx` 预算分项与 ECB 实时汇率换算 | **完整实现且已验证** | — | CNY→JPY 实时汇率与免责声明正常；多币种在 AA 分账内未对齐汇率（`KAIROS-018`） |
| 21 | `21_collab_ui` 多人协同空间、邀请与 RBAC 权限 | **部分实现** | [prod-13-collab-aa-modal.png](file:///c:/Users/Liam/Desktop/旅游计划/globe-app/docs/audit-v5/screenshots/prod-13-collab-aa-modal.png) | **前端云同步与跨标签 BroadcastChannel 实为占位假接通**（`KAIROS-003`）；后端 `worker/collab.js` 存在越权劫持行程（`KAIROS-001`）、房主自降权限（`KAIROS-002`）、公开行程泄邮箱/跨行程投票（`KAIROS-008`）、并发覆盖（`KAIROS-009`）及缺 CSRF（`KAIROS-010`） |
| 22 | `22_aa_expense_splitter` AA 均摊与最小转账结算 | **部分实现** | [prod-13-collab-aa-modal.png](file:///c:/Users/Liam/Desktop/旅游计划/globe-app/docs/audit-v5/screenshots/prod-13-collab-aa-modal.png) | 等额分摊可用，**自定义分摊 UI 缺失（仅有引擎无界面）**；存在 1 分钱舍入守恒破坏、0.01 元债务丢失及贪心非最优解（`KAIROS-018`） |
| 23 | `23_account_ui` 账号登录、注册、OAuth 与个人中心 | **完整实现且已验证** | [prod-16-account-modal.png](file:///c:/Users/Liam/Desktop/旅游计划/globe-app/docs/audit-v5/screenshots/prod-16-account-modal.png) | 本地 Worker D1 注册/登录/登出已验证；**线上触发 1800ms 误判静态模式（`KAIROS-022`）**、480px 弹窗右侧留白错位（`KAIROS-026`）、重置密码未踢旧会话/限流绕过/SVG 头像（`KAIROS-011`）；Google OAuth 与 Resend 邮件**依赖外部配置** |
| 24 | `24_travel_archive` 私人旅行档案、游记与隐私配置 | **完整实现且已验证** | — | 本地持久化与刷新恢复通过；跨用户同浏览器未隔离（`KAIROS-012`）；照片上传依赖未绑定的 R2（`依赖外部配置`） |
| 25 | `25_storage_cloud_sync` IndexedDB / CRDT 与云端备份同步 | **完整实现且已验证** | — | `mergeTripDocuments` 在 73.3% 随机试验中破坏交换律（`KAIROS-004`）；备份恢复与云同步时间戳冲突（`KAIROS-009`）；`/api/photos` 缺鉴权与路径穿越检查（`KAIROS-014`） |
| 26 | `26_share_center` 全球统一分享中心与本地 QR 码 | **完整实现且已验证** | [prod-14-share-center.png](file:///c:/Users/Liam/Desktop/旅游计划/globe-app/docs/audit-v5/screenshots/prod-14-share-center.png) | **4 项重磅缺陷**：V7–V10 长链接二维码因缺定位/版本块完全不可扫（`KAIROS-007`、`KAIROS-019`）；136px 传参类型错误；**`cam`/`date`/`layers` 深链恢复与 `#sc-type-sel` 切换属占位未接线**（`KAIROS-021`）；Light 模式下弹窗文字不可读（`KAIROS-006`） |
| 27 | `27_export_center` 多格式行程导出中心 | **部分实现** | — | 实测下载 6 种文件 + 打印 HTML 共 **7 种**可用，**缺失 Markdown (`.md`)**（`KAIROS-021`）；CSV 存在公式注入、HTML 打印存在 `startTime` XSS（`KAIROS-013`） |
| 28 | `28_trilingual_i18n` 简繁英三语实时切换 | **已实现但存在缺陷** | [prod-03-globe-light-en.png](file:///c:/Users/Liam/Desktop/旅游计划/globe-app/docs/audit-v5/screenshots/prod-03-globe-light-en.png) | `#timemachine-dock` 在英文模式下整块输出简体中文（`KAIROS-027`）；223 处英文地标名称重复叠加（`KAIROS-029`） |
| 29 | `29_help_center` 30 章三语用户手册与帮助中心 | **已实现但存在缺陷** | [prod-15-help-center.png](file:///c:/Users/Liam/Desktop/旅游计划/globe-app/docs/audit-v5/screenshots/prod-15-help-center.png) | 30 章检索过滤正常；**按 `Escape` 无法关闭**（`KAIROS-030`）；Light 模式下文字对比度失效（`KAIROS-006`） |
| 30 | `30_pwa_sw_prod` PWA 清单与 Service Worker 离线支持 | **完整实现且已验证** | — | `manifest.webmanifest`、SW `activated` 及断网加载 722 城已本地实测；存在 `/vendor/` 缓存分区错乱与离线 `null` 返回异常（`KAIROS-028`） |

> **不可验证环境总项（`无法验证`）**：物理 iOS Safari / Android Chrome / iPad 实机手势与刘海屏（`UNVERIFIED-01`）、Firefox / WebKit 引擎（`UNVERIFIED-02`）、生产 Google OAuth / Resend / R2 真实凭据链路（`UNVERIFIED-03`）、硬件 GPU 长时帧率与热节流（`UNVERIFIED-04`）、多用户高并发 D1/边缘压测（`UNVERIFIED-05`）。

---

## 3. 30 个功能域六阶段全生命周期详细拆解

### 3.1 入口与三维地球底座 (`01` ~ `07`)

1. **`01_prologue_brand` — 完整实现且已验证**（[prod-01-prologue.png](file:///c:/Users/Liam/Desktop/旅游计划/globe-app/docs/audit-v5/screenshots/prod-01-prologue.png)）
   - 入口检查：首屏挂载 `#story-prologue`（16,972 字符），隐藏旧视频底图（`cosmicHidden: true`），`?instant=1` 可直达主界面。
   - 用户操作：支持语言切换、跳过、重播开场及品牌 Home 按钮。
   - 数据验证：4 处品牌词标与 10 份矢量 SVG 资产完整加载。
   - 异常输入：缺少音频权限时自动捕获播放拒绝。
   - 错误恢复：`IntroSession` 限制 6 小时最多自动播放 3 次，避免反复打扰；但 `bgm.js` 在顶层即预加载音频（`KAIROS-034`），且主界面左上角渲染了冗余双圆环（`KAIROS-033`）。
   - 状态持久化：`localStorage` 记录播放计数与引导完成状态。

2. **`02_3d_globe` — 完整实现且已验证**（[prod-02-globe-dark-zh.png](file:///c:/Users/Liam/Desktop/旅游计划/globe-app/docs/audit-v5/screenshots/prod-02-globe-dark-zh.png)）
   - 入口检查：MapLibre 初始化 `type: "globe"` 投影（默认中心 `72°E, 22°N`，zoom `1.65`，pitch `14°`），叠加 `#globe-label-canvas`（`z-index: 1`）。
   - 用户操作：拖拽旋转（移至 `52.38°E, 10.85°N`）、缩放（`1.999`）、倾角切至 `45°`、地球自转均实测响应。
   - 数据验证：722 城点位经由 `atlas-worker.js` + Supercluster 聚类渲染。
   - 异常输入 / 错误恢复：WebGL 上下文丢失有监听，无 GPU 硬件加速时在 SwiftShader 下可运行但仅 ~19.4 FPS（`UNVERIFIED-04`）。
   - 状态持久化：当前视口不跨刷新持久，性能档位写入本地配置。

3. **`03_search_spots` — 完整实现且已验证**（[prod-04-command-palette.png](file:///c:/Users/Liam/Desktop/旅游计划/globe-app/docs/audit-v5/screenshots/prod-04-command-palette.png)）
   - 入口检查：顶部搜索框与 `Ctrl+K` 命令面板就绪，在 `?embed=` 模式下正确锁死快捷键。
   - 用户操作：输入 `"北京"`（1 条）、`"Tokyo"`（4 条）、`"Paris"`（10 条），点击即打开详情抽屉并飞抵机位（`"北京 · 7 个精准机位"`）。
   - 数据验证：722 城与 5,414 机位中英文索引可检索。
   - 异常输入：拼写错误 `"Beiijng"` 返回 `0` 条，模糊容错不足；底层 `GeoIntelligence.searchAndExplain` 对空串 `""` 误返回 28 条结果，`"不要海滩 雪山"` 吞掉后词返回 0 条，`"元阳梯田 2026年"` 误解析 `maxBudgetRmb: 2026`（**`KAIROS-025`**）。
   - 错误恢复：无匹配时展示空态提示；顶部搜索框在大屏仍截断为 `"搜索 722 城与 5,41…"`（**`KAIROS-033`**）。
   - 状态持久化：历史搜索不持久化。

4. **`04_basemap_layers` — 完整实现且已验证**（[prod-03-globe-light-en.png](file:///c:/Users/Liam/Desktop/旅游计划/globe-app/docs/audit-v5/screenshots/prod-03-globe-light-en.png)）
   - 入口检查：底图控制条 `#basemap-bar` 提供 `natgeo`、`physical`、`dark`、`satellite` 四套底图。
   - 用户操作 / 数据验证：生产站逐一点击切换，4 套样式均 `active: true, styleName: "loaded"`。
   - 异常输入 / 错误恢复：移动端 `360×800` 下与 `#globe-controls` 发生几何重叠（**`KAIROS-024`**）。
   - 状态持久化：主题与底图偏好写入本地。

5. **`05_terrain_buildings` — 部分实现**
   - 入口检查：图层控制面板提供 3D 地形与 3D 建筑切换按钮。
   - 用户操作：3D 地形点击后 `btnActive: true, exagVisible: true, hasTerrain: true`；**点击 3D 建筑后 `btnActive: false, hasBuildingsLayer: false`**。
   - 数据验证：Mapterhorn 512px WebP DEM + AWS Terrarium 备用源就绪；OpenFreeMap 矢量建筑受样式加载状态影响未挂载。
   - 异常输入 / 错误恢复：`terrain-3d.js` 在 `!map.isStyleLoaded()` 时直接 `return` 丢弃用户操作，缺少样式加载后重放队列（**`KAIROS-026`**）。
   - 状态持久化：开关仅在当前会话生效。

6. **`06_gibs_epic` — 部分实现**（[prod-10-epic-modal.png](file:///c:/Users/Liam/Desktop/旅游计划/globe-app/docs/audit-v5/screenshots/prod-10-epic-modal.png)）
   - 入口检查：图层栏包含夜光、极光、晨昏线及 NASA EPIC 入口。
   - 用户操作：晨昏线正常挂载 3 个 MapLibre 图层（`layer-v4-daynight-fill`, `layer-v4-terminator-glow`, `layer-v4-terminator-core`）；NASA EPIC 弹窗正常展示日地拉格朗日 L1 点实拍（`1 / 8` 帧切换）。但**生产实测中夜光与极光点击后 `nightLightsActive: false, auroraActive: false, matchingLayers: []`**。
   - 数据验证 / 异常输入：EPIC 拉取带历史回退（`fallbackToLatest: true`）；但快速切换日期存在无 `AbortController` 竞态（**`KAIROS-031`**），且 NASA 图片慢加载时弹窗呈现黑屏无骨架/报错重试（**`KAIROS-027`**）。
   - 错误恢复 / 状态持久化：图层不跨刷新保留。

7. **`07_earth_timemachine` — 完整实现且已验证**（注：存在 **`KAIROS-027`** 交互与本地化缺陷）（[prod-09-timemachine.png](file:///c:/Users/Liam/Desktop/旅游计划/globe-app/docs/audit-v5/screenshots/prod-09-timemachine.png)）
   - 入口检查：开启 `#timemachine-dock`，内置 VIIRS、MODIS Terra、NDSI 积雪、NDVI 植被、云顶温度 5 套 GIBS 图层。
   - 用户操作：可开关图层、跳日期（`0/-30/-90/-180/-365/-1825`）、启用双日期对比。
   - 数据验证：NASA GIBS WMTS 瓦片日期与透明度正常下发至 `layer-gibs-a` / `layer-gibs-b`。
   - 异常输入 / 缺陷：**界面标榜 `"分屏对比卷帘"`，实际代码仅做全局透明度混叠（`1-mix` vs `mix`）；且整个 Dock 在英文模式下依然显示简体中文（`KAIROS-027`）**；晨昏线开关还调用了过时的近似多边形函数。
   - 错误恢复 / 状态持久化：双击开关缺少重入锁（**`KAIROS-031`**）；状态仅会话内保持。

---

### 3.2 地理情报、天文摄影与检索推荐 (`08` ~ `17`)

8. **`08_detail_drawer_tabs` — 完整实现且已验证**（[prod-05-drawer-overview.png](file:///c:/Users/Liam/Desktop/旅游计划/globe-app/docs/audit-v5/screenshots/prod-05-drawer-overview.png)）
   - 入口检查 / 用户操作：点击城市加载“机位/光影/物候/气候/预算/动线” 6 个标签页（香格里拉实测全部渲染完整）。
   - 数据验证 / 异常输入：预算与动线由前端数据集生成；移动端 `390×844` 下抽屉滚动到底部时被固定 `#mobile-bottom-nav` 遮挡文字（**`KAIROS-024`**，`prod-18-mobile-drawer-390x844.png`）。
   - 错误恢复 / 状态持久化：8 次抽屉开关后残留 `+1,368` DOM 节点与 `+144` 监听器（**`KAIROS-023`**）。

9. **`09_phenology` — 完整实现且已验证**（[prod-06-drawer-phenology-weather.png](file:///c:/Users/Liam/Desktop/旅游计划/globe-app/docs/audit-v5/screenshots/prod-06-drawer-phenology-weather.png)）
   - 入口检查 / 用户操作：展示 12 个月评分、`Tier A/B/C` 徽章及推荐窗口。
   - 数据验证 / 异常输入：统计审计揭示 `validate-phenology.js` 使用基于静态气候均值的 3 套合成扰动模板验证（**`KAIROS-015`**），回归模型 LOOCV 误差（`3.20d`/`5.85d`）反而不如城市历史均值基线（`2.09d`/`2.22d`），南半球与热带缺乏样本且 Tier B 统一硬编码 `±8d`。
   - 错误恢复 / 状态持久化：移动端 `#phenology-bar` 窄屏裁剪末尾月份（**`KAIROS-024`**）；月度过滤条不持久化。

10. **`10_weather_aqi_echarts` — 完整实现且已验证**（[prod-06-drawer-phenology-weather.png](file:///c:/Users/Liam/Desktop/旅游计划/globe-app/docs/audit-v5/screenshots/prod-06-drawer-phenology-weather.png)）
    - 入口检查 / 用户操作：拉取 Open-Meteo 实时天气、7 日预报、US AQI（PM2.5/UV/花粉）、2020–2024 5 年气候统计并渲染 2 个 ECharts 图表。
    - 数据验证 / 异常输入：API 异常时回退历史档案文案；7 日预报中 `"大部晴朗"` 折行导致上下温度列不对齐（**`KAIROS-033`**）；快速切城缺 `AbortController`（**`KAIROS-031`**）。
    - 错误恢复 / 状态持久化：内存缓存短时结果。

11. **`11_photo_simulator` — 完整实现且已验证**（[prod-07-drawer-photo-sim.png](file:///c:/Users/Liam/Desktop/旅游计划/globe-app/docs/audit-v5/screenshots/prod-07-drawer-photo-sim.png)）
    - 入口检查 / 用户操作：选择机位、日期、时刻、画幅（FF/APS-C/M43/MF）、焦段与方位角，实时计算 POI 评分（如 `64/100`）及蓝调/黄金时刻。
    - 数据验证 / 异常输入：14 场景天文对表证实 `SunCalc.getTimes` 缺失 `utcOffset` 参数导致雷克雅未克 6/21 日落跳变 `+1440.4 分钟`（**`KAIROS-016`**）；14 天外预报正确触发天气排除保护。
    - 错误恢复 / 状态持久化：参数切换实时重绘；不跨刷新持久化。

12. **`12_alpenglow` — 完整实现且已验证**（[prod-07-drawer-photo-sim.png](file:///c:/Users/Liam/Desktop/旅游计划/globe-app/docs/audit-v5/screenshots/prod-07-drawer-photo-sim.png)）
    - 入口检查 / 用户操作 / 数据验证：针对高海拔雪峰（如香格里拉卡瓦格博）计算日出前/日落后金山窗口与地形遮挡提示，并显示科学免责说明。
    - 异常输入 / 错误恢复 / 状态持久化：平坦地形地平线阈值 `Math.max(-0.833, obsDeg)` 对 `-0.833°` 有 `+2m/-3m` 系统偏差（**`KAIROS-016`**）。

13. **`13_astronomy_milkyway_moon_aurora` — 完整实现且已验证**（[prod-07-drawer-photo-sim.png](file:///c:/Users/Liam/Desktop/旅游计划/globe-app/docs/audit-v5/screenshots/prod-07-drawer-photo-sim.png)）
    - 入口检查 / 用户操作 / 数据验证：融合 `Astronomy Engine` 银河核心（Sgr A*）升落与 NOAA OVATION 极光指数。
    - 异常输入 / 错误恢复：`formatTimeInOffset(null)` 将乌斯怀亚夏至持续暮光及全球无月出日一律标成 `"Polar Day/Night"`，且 `SunCalc` 对地平线下高度误加正折射偏置（**`KAIROS-016`**）。

14. **`14_viewfinder_3d` — 完整实现且已验证**（[prod-08-viewfinder-3d.png](file:///c:/Users/Liam/Desktop/旅游计划/globe-app/docs/audit-v5/screenshots/prod-08-viewfinder-3d.png)）
    - 入口检查 / 用户操作：从光影模拟器打开 3D 取景器，实测 400mm 长焦光学裁切提示（`真实视角 19% (WebGL 下限 18°)`）及 `Escape` 关闭。
    - 数据验证 / 异常输入 / 状态持久化：顶部 HUD 竖线分割线压盖 `"40°"` 且海拔硬编码显示 `0m`（**`KAIROS-033`**）。

15. **`15_streetview_gallery` — 完整实现且已验证**
    - 入口检查 / 用户操作：详情首屏“真实实景画廊”支持按全部/春/夏/秋/冬筛选与全屏灯箱；机位卡“街景”触发 360° 探索弹窗。
    - 数据验证 / 异常输入：生产站实测香格里拉 3 张缩略图仅 1 张 `complete: true`；东京芝公园街景弹窗仅呈现检索提示与 4 个外链按钮（`hasIframeOrImg: false`），缺少内嵌全景预览时的状态引导（`KAIROS-031`）。
    - 错误恢复 / 状态持久化：单图失败有静默捕获。

16. **`16_dest_compare` — 部分实现**（[prod-17-dest-compare.png](file:///c:/Users/Liam/Desktop/旅游计划/globe-app/docs/audit-v5/screenshots/prod-17-dest-compare.png)）
    - 入口检查 / 用户操作：通过详情抽屉 `"⚖ 同类型对比 (2-4城)"` 点击时弹窗未能打开（`open: false, optionCount: 0`）；直接经推荐/API 打开对比弹窗可见。
    - 数据验证 / 异常输入：**Light 主题下因 `--bg-panel` 缺失导致对比表格全黑字配深底无法阅读（`KAIROS-006`）**。
    - 错误恢复 / 状态持久化：纯即时计算，不持久化。

17. **`17_smart_recommendation` — 完整实现且已验证**
    - 入口检查 / 用户操作：选择“秋季 + 秋色”标签返回 28 城与 56 条推荐理由（如`"匹配景观：秋色"`、`"当季物候巅峰 5★"`）。
    - 数据验证 / 异常输入：底层 10 维向量相似度受 `atlas-enrichment.json` 标签同质化与 `GeoIntelligence` 5 个死意图字段影响（**`KAIROS-025`**）。
    - 错误恢复 / 状态持久化：瞬时过滤，不持久化。

---

### 3.3 行程规划、交通与多人协同 (`18` ~ `22`)

18. **`18_trip_planner` — 完整实现且已验证**（[prod-11-trip-planner.png](file:///c:/Users/Liam/Desktop/旅游计划/globe-app/docs/audit-v5/screenshots/prod-11-trip-planner.png)、[prod-19-mobile-planner-390x844.png](file:///c:/Users/Liam/Desktop/旅游计划/globe-app/docs/audit-v5/screenshots/prod-19-mobile-planner-390x844.png)）
    - 入口检查 / 用户操作：切至规划模式，可新建/切换北京与东京行程（无串城污染）、加减站点、锁定站点与排序。
    - 数据验证 / 异常输入：**存在 8 项算法与状态漏洞（`KAIROS-020`）**：`paris`/`london`/`new york`/`zurich`/`reykjavik` 5 个英文别名指向缺失或错误 ID；`resetDraftForNewTrip` 漏重置 9 个字段；多城连游漏掉城际转场腿；`detectTripConflicts` 误查死字段 `trip.mode` 导致 94km 步行日无告警；无坐标点触发 `TypeError`。UI 上 `#topbar` 在半透明顶栏下透底穿帮（**`KAIROS-030`**），移动端表单被底部导航遮挡（**`KAIROS-024`**）。
    - 错误恢复 / 状态持久化：行程存入 IndexedDB `trips` 表。

19. **`19_transport_mode` — 完整实现且已验证**（[prod-12-planner-transport.png](file:///c:/Users/Liam/Desktop/旅游计划/globe-app/docs/audit-v5/screenshots/prod-12-planner-transport.png)）
    - 入口检查 / 用户操作：切换 `"3层交通与枢纽"`，展示 A 层城际、B 层枢纽、C 层市内方案。
    - 数据验证 / 异常输入：**存在严重地理常识谬误（`KAIROS-005` & `KAIROS-017`）**：实拍 `prod-12` 显示**上海→东京（2,074 km）高铁 `~8h34m` 与普铁 `~20h0m` 被判为可行**；韩国→日本标注可自驾；夏威夷跳岛标可巴士；南极标可飞商业航班；且 `hubs.json` 中 97/722 城主机场在境外、27 个无桥海岛误标有高铁。
    - 错误恢复 / 状态持久化：选择持久化至当前 `trip` 对象。

20. **`20_budget_fx` — 完整实现且已验证**
    - 入口检查 / 用户操作：请求 `/api/fx?from=CNY`，切换结算币种为 `JPY` 后正常换算并显示 `¥`/ECB 来源声明（`2026-11-27`）。
    - 数据验证 / 异常输入：离线时回退内置参考汇率；但未透传至 AA 账单多币种结算（**`KAIROS-018`**）。
    - 错误恢复 / 状态持久化：预算分项随行程保存。

21. **`21_collab_ui` — 部分实现（前端云同步与跨标签机制属`仅有界面或占位实现`）**（[prod-13-collab-aa-modal.png](file:///c:/Users/Liam/Desktop/旅游计划/globe-app/docs/audit-v5/screenshots/prod-13-collab-aa-modal.png)）
    - 入口检查 / 用户操作：打开协同空间可生成本地邀请链接、二维码、评论、投票与权限选择器。
    - 数据验证 / 异常输入：**本地 Worker 已登录 D1 实测显示，界面打出 `"D1 Cloud RBAC"` 绿标，但整个交互周期发出 `0` 次 `/api/collab/*` 网络请求；`BroadcastChannel('kairos_collab')` 无任何接收方（`KAIROS-003`）**。同时后端 `worker/collab.js` 存在 5 个严重漏洞：**任意用户重传相同 `trip.id` 劫持私密行程（`KAIROS-001`）、房主点自己只读邀请链接被降权锁死（`KAIROS-002`）、公开行程泄用户邮箱与跨行程投票（`KAIROS-008`）、并发 `PUT` 缺版本锁覆盖写（`KAIROS-009`）、全线缺少 CSRF 校验（`KAIROS-010`）**。
    - 错误恢复 / 状态持久化：前端仅存入单机 `localStorage`（`wtg_collab_spaces_v1`）。

22. **`22_aa_expense_splitter` — 部分实现**（[prod-13-collab-aa-modal.png](file:///c:/Users/Liam/Desktop/旅游计划/globe-app/docs/audit-v5/screenshots/prod-13-collab-aa-modal.png)）
    - 入口检查 / 用户操作：添加 ¥1,200 支出后正确得出每人均摊及转账方案；**自定义比例分摊与币种选择未在 CollabSpace UI 暴露（`hasCustomSplitUi: false`）**；圆形按钮出现 `"添加"`/`"发送"` 折行（**`KAIROS-033`**）。
    - 数据验证 / 异常输入：`100/3` 产生 `0.01` 元不守恒漂移；`0.03/3` 返回空转账丢账；5 人结算返回 4 笔而非最优 3 笔；忽略 `currency` 与 `settled`（**`KAIROS-018`**）。
    - 错误恢复 / 状态持久化：存入 `localStorage`。

---

### 3.4 账号、存储同步、分享导出、多语与离线 (`23` ~ `30`)

23. **`23_account_ui` — 完整实现且已验证（OAuth/邮件为`依赖外部配置`）**（[prod-16-account-modal.png](file:///c:/Users/Liam/Desktop/旅游计划/globe-app/docs/audit-v5/screenshots/prod-16-account-modal.png)）
    - 入口检查 / 用户操作：本地 Worker SQLite E2E 完整走通注册、登录、会话维持、登出与二次登录。
    - 数据验证 / 异常输入：**存在 3 项重磅缺陷与安全漏洞**：(1) 生产站因 `/api/health` 1.8s 超时永久锁死静态模式提示（**`KAIROS-022`**）；(2) 弹窗外框 760px 套 480px 内框造成右侧空白玻璃框（**`KAIROS-026`**）；(3) 密码重置不吊销旧 Session、登录成功清零同 IP 他人失败计数绕过爆破限流、Google OAuth 不校验 `verified_email`、注销账号在 `FK=OFF` 下残留孤儿数据、`avatarUrl` 放行 `image/svg+xml`（**`KAIROS-011`**）。Google OAuth 与 Resend 邮件在线上因未配置 Secret 不可测（`依赖外部配置`）。
    - 错误恢复 / 状态持久化：服务端 D1 `sessions` 表 + `HttpOnly` Cookie。

24. **`24_travel_archive` — 完整实现且已验证（R2 照片上传为`依赖外部配置`）**
    - 入口检查 / 用户操作：标记城市状态（如北京 `"visited"`）、保存游记、切换隐私开关（默认私密），刷新页面后完整恢复。
    - 数据验证 / 异常输入：退出账号再登录新账号时不会清空或隔离旧用户的本地档案与密码短语（**`KAIROS-012`**）。R2 图床在线上 `r2: false`；且 `/api/photos` 缺少鉴权与 `X-Sync-Key` 路径穿越校验（**`KAIROS-014`**）。
    - 错误恢复 / 状态持久化：IndexedDB `WorldTravelGlobeDB`（Dexie）。

25. **`25_storage_cloud_sync` — 完整实现且已验证**
    - 入口检查 / 用户操作：支持本地备份快照恢复与 AES-GCM 端到端加密云端同步。
    - 数据验证 / 异常输入：**存在 2 项数据破坏漏洞**：(1) `CRDT.mergeTripDocuments` 在 600 次测试中 **73.3% 违背交换律、19.2% 违背结合律**，按字符串 ID 重排景点、跨天移动被克隆、缺 `updatedAt` 导致已删景点复活（**`KAIROS-004`**）；(2) 备份恢复 `preserveTimestamp: true` 导致云端覆盖本地恢复结果，且 `DELETE /api/profile` 遗留 `profile_backups`（**`KAIROS-009`、`KAIROS-014`**）。
    - 错误恢复 / 状态持久化：IndexedDB + Worker D1 `profiles` 表。

26. **`26_share_center` — 完整实现且已验证（深度参数恢复与类型切换为`仅有界面或占位实现`）**（[prod-14-share-center.png](file:///c:/Users/Liam/Desktop/旅游计划/globe-app/docs/audit-v5/screenshots/prod-14-share-center.png)）
    - 入口检查 / 用户操作：可打开弹窗，呈现 12 类选项、6 种比例、Web Intents 与本地二维码；**但切换 `#sc-type-sel` 无任何反应**。
    - 数据验证 / 异常输入：**可用性严重受损**：(1) 任何包含 `?trip=` 或超过 134 字节的长链接触发 QR V7–V10，因缺 5 个对齐格与 6×3 版本信息块且 Format Copy #2 越界，**生成的二维码 100% 不可被手机扫码识别**（**`KAIROS-007`、`KAIROS-019`**）；(2) `renderSvg(shareUrl, 136)` 误传数字导致按 180px 渲染撑破容器；(3) 深度链接 `cam`/`date`/`layers` 在 `app.js` 中被完全忽略（**`KAIROS-021`**）；(4) Light 主题下因 `--bg-panel` 缺失文字无法辨认（**`KAIROS-006`**）。
    - 错误恢复 / 状态持久化：纯客户端临时生成。

27. **`27_export_center` — 部分实现**
    - 入口检查 / 用户操作：点击更多导出打开弹窗，成功触发 JSON (`103 KB`)、CSV (`1,039 B`)、ICS (`3,110 B`)、GPX (`2,670 B`)、KML (`2,459 B`)、GeoJSON (`4,412 B`) 真实文件下载及打印 HTML (`589 chars`)。
    - 数据验证 / 异常输入：**文档宣称 8 种格式，实际缺少 Markdown (`.md`)（`KAIROS-021`）**；CSV 导出未转义 `=`/`+`/`-`/`@` 触发 Excel 公式注入，`toPrintableHtml` 未转义 `s.startTime` 存在同源 XSS（**`KAIROS-013`**）；Light 主题弹窗文字不可读（**`KAIROS-006`**）。
    - 错误恢复 / 状态持久化：即时导出下载。

28. **`28_trilingual_i18n` — 已实现但存在缺陷**（[prod-03-globe-light-en.png](file:///c:/Users/Liam/Desktop/旅游计划/globe-app/docs/audit-v5/screenshots/prod-03-globe-light-en.png)）
    - 入口检查 / 用户操作：在 `zh-CN` / `zh-TW` / `en` 间切换，顶栏、详情抽屉 6 标签及 30 章手册均可即时切换。
    - 数据验证 / 异常输入：**`#timemachine-dock` 在英文模式下依然显示纯简体中文（`tmHasUntranslatedSimplifiedInEn: true`，`KAIROS-027`）**；英文数据集中有 223 处地标名重复两次如 `"Hallgrímskirkja Hallgrímskirkja"`（**`KAIROS-029`**）。
    - 错误恢复 / 状态持久化：语言偏好保存于 `localStorage`。

29. **`29_help_center` — 已实现但存在缺陷**（[prod-15-help-center.png](file:///c:/Users/Liam/Desktop/旅游计划/globe-app/docs/audit-v5/screenshots/prod-15-help-center.png)）
    - 入口检查 / 用户操作：点击 `?` 打开 30 章手册，关键词过滤（如 `"GPX"` → 1 章）准确生效。
    - 数据验证 / 异常输入：**按下 `Escape` 无法关闭弹窗（`hcClosedOnEsc: false`，`KAIROS-030`）**；Light 主题下文字对比度极差（**`KAIROS-006`**）。
    - 错误恢复 / 状态持久化：仅读取静态 `data/docs/manual-*.json`。

30. **`30_pwa_sw_prod` — 完整实现且已验证**
    - 入口检查 / 用户操作：线上 `manifest.webmanifest` 合法，Service Worker `activated` 并建立 `wtg-shell-mwzc5qsk` 与 `kairos-data-v5` 缓存；本地断网后仍可加载完整页面与 `722` 城图谱。
    - 数据验证 / 异常输入：`sw.js:60` 将 `/vendor/` 拦入无版本 `DATA_CACHE` 造成旧版残留且与 `CORE_ASSETS` 冲突；`sw.js:121` 离线未命中回传 `null` 触发 SW `TypeError`；`atlas-enrichment.json` 与天空盒未纳入离线缓存（**`KAIROS-028`**）。
    - 错误恢复 / 状态持久化：依赖 CacheStorage 与 SW 生命周期。
