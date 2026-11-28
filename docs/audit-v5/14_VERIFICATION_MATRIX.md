# KAIROS V5.0 深度审计全相位验证矩阵（Verification Matrix）

> **审计对象**：KAIROS V5.0（Commit `cfec5a3`，Tag `v5.0.0`）  
> **在线基准**：Production Workers (`https://world-travel-globe.globe-app.workers.dev/`) 与 GitHub Pages (`https://haoyuliu1007.github.io/world-travel-globe/`)  
> **矩阵目的**：实现“每一条审计结论均有可复现脚本、结构化证据 JSON 或实拍截图支撑”，并诚实隔离受客观条件限制而未验证的边界范围。

---

## 一、全 11 审计阶段验证总览矩阵

| 审计阶段 | 审计范围与核心核查项 | 使用工具 / 执行脚本 | 证据文件 (`evidence/*.json`) | 实拍截图 (`screenshots/*.png`) | 通过 / 异常统计 | 关联问题 ID |
|---|---|---|---|---|---|---|
| **Phase 1：架构、部署与源码复杂度审计** | Git V4.5→V5.0 变更量、`pages` 分支漂移、CI 流水线、63 份 JS/Worker 文件复杂度、`js/app.js` 嵌套深度、162 处静默 `catch`、冗余静态资源哈希比对、`sw.js` 缓存路由、URL/分享参数接线静态扫描 | Node.js 静态 AST/正则分析脚本、`git log/diff`、文件 SHA-256 比对 | [arch-and-tests-results.json](file:///c:/Users/Liam/Desktop/%E6%97%85%E6%B8%B8%E8%AE%A1%E5%88%92/globe-app/docs/audit-v5/evidence/arch-and-tests-results.json) | — | 扫描 **63** 份源码（**30,036 LOC**）；检出 **162** 处静默 catch、`pages` 分支滞留 V4.5.0、9 份重复 PNG（~10MB）、`sw.js` 缓存顺序缺陷、URL 参数未应用 | `KAIROS-003`, `021`, `028`, `031`, `032`, `034` |
| **Phase 2：全球数据完整性与国际化审计** | 56 份地区 JS 数据加载一致性、722 城/5,414 机位坐标与结构完整性、时区/陆地边界、跨城坐标冲突、预算合理性、722 城交通枢纽（`hubs.json`）、`data/i18n/en/*.json` 缺漏/残留中文/重复词汇、媒体过滤规则（7 类测试） | 全量机器审计脚本（`tz-lookup`、Haversine 距离、字段校验、i18n 词法扫描） | [data-audit-results.json](file:///c:/Users/Liam/Desktop/%E6%97%85%E6%B8%B8%E8%AE%A1%E5%88%92/globe-app/docs/audit-v5/evidence/data-audit-results.json) | — | **722/722** 城与 **5,414/5,414** 机位结构一致、EN 缺译 **0**、残留中文 **0**；检出 **97/722** 外国主机场、**251/722** >300km、**27** 无铁路岛屿误标、`sc-aldabra-outer` 海中漂移 627.2km、**223** 条 EN 重复词 | `KAIROS-017`, `029` |
| **Phase 3：科学模型、物候与天文对照审计** | 物候校准集（13 樱花 + 11 秋叶）合成模板逆向检验、OLS vs LOOCV vs 城市均值基线对比、Tier A/B/C 722 城覆盖率；14 场景日出/日落/暮光/月相/银河对照 `Astronomy Engine`；Alpenglow 物理与 `terrain-3d.js` 地平线遮挡检验 | 独立统计回归与 LOOCV 脚本、`astronomy-engine` 对照实验脚本 | [science-audit-results.json](file:///c:/Users/Liam/Desktop/%E6%97%85%E6%B8%B8%E8%AE%A1%E5%88%92/globe-app/docs/audit-v5/evidence/science-audit-results.json) | `prod-06-drawer-phenology-weather.png`、`prod-07-drawer-photo-sim.png`、`prod-08-viewfinder-3d.png` | 物候城市均值基线（2.09d/2.22d）优于模型（2.89d/4.84d）；**14 场景**天文对照检出雷克雅未克夏至日落 `+1440.4m` 跳变、乌斯怀亚错误极夜标签、`terrain-3d.js` `+2m/-3m` 偏差 | `KAIROS-015`, `016` |
| **Phase 4：生产站与本地 Worker 全功能实测** | GitHub Pages & Production 30 项核心功能逐项核查（序幕、3D 地球、搜索、底图、地形、EPIC、Time Machine、抽屉、物候、气象、摄影、Alpenglow、星空、取景器、街景、对比、推荐、行程、交通、预算、协作、AA、账户、足迹、云同步、分享、导出、三语、帮助、PWA）；本地 Worker + D1 完整 Auth/Collab/Offline E2E | `playwright-core` + 本机 Chrome/Edge、本地 `wrangler`/`node:sqlite` 测试服务 | [functional-audit-results.json](file:///c:/Users/Liam/Desktop/%E6%97%85%E6%B8%B8%E8%AE%A1%E5%88%92/globe-app/docs/audit-v5/evidence/functional-audit-results.json) | `prod-01` ~ `prod-17`（17 张桌面核心功能实拍） | 30 项功能中：**22 项**完整实现且已验证、**6 项**部分实现、**2 项**存在缺陷；本地 Worker Auth & 离线验证通过，但登录态 Collab UI 发出 **0** 次 `/api/collab` 请求、`/api/health` 1.8s 竞态锁死静态模式、Esc 未关闭 V5 弹窗 | `KAIROS-003`, `021`, `022`, `026`, `027`, `030` |
| **Phase 5：核心业务算法与数学属性审计** | `TripPlanner` 10 项别名/状态隔离/多城路由/2-opt/冲突检测；`TransportService` 跨海与极地规则；`RoutingService` OSRM 降级与日界线；`CRDT.mergeUserProfiles` & `mergeTripDocuments` 600 次随机属性测试；`ExpenseSplitter` 9 类反例；`QRCodeService` ISO 18004 位级与 RS 校验子解码；`GeoIntelligence` 语义/正则/偏好打分 | 算法单元测试、600 次随机属性试验脚本、ISO 18004 RS 解码器 | [algorithm-audit-results.json](file:///c:/Users/Liam/Desktop/%E6%97%85%E6%B8%B8%E8%AE%A1%E5%88%92/globe-app/docs/audit-v5/evidence/algorithm-audit-results.json) | `prod-12-planner-transport.png`、`prod-13-collab-aa-modal.png`、`prod-14-share-center.png` | `mergeUserProfiles` **600/600** 通过；`mergeTripDocuments` 交换律失败 **440/600**、结合律失败 **115/600**；QR V8/V10 报 **47/72** 个 RS 错误且全版本副本 #2 损坏；AA 分位漂移与贪心非最优；5/10 别名失效；跨海 HSR/自驾误判 | `KAIROS-004`, `005`, `007`, `018`, `019`, `020`, `025` |
| **Phase 6：安全攻防 PoC 与权限边界审计** | 9 组攻击场景可复现 PoC：行程 ID 劫持（VULN-01）、公开行程 PII 泄露与跨行程投票（VULN-02）、`PUT` 并发覆盖（VULN-03）、Owner 误降级（VULN-04）、CSRF/CORS（VULN-05）、改密会话留存/暴力破限/OAuth 预占/删号孤儿/SVG 头像（VULN-06）、登出跨用户本地泄露（VULN-07）、CSV 公式注入与 HTML XSS（VULN-08）、Worker 代理 XSS/R2 穿越/CSP（VULN-09） | Node v26.13.0 + `node:sqlite DatabaseSync`（加载全部 0001..0003 迁移）、线上 `curl -I` 响应头核查 | [security-poc-results.json](file:///c:/Users/Liam/Desktop/%E6%97%85%E6%B8%B8%E8%AE%A1%E5%88%92/globe-app/docs/audit-v5/evidence/security-poc-results.json) | — | **9/9 项高危/严重安全 PoC 全部复现成功（`verified: true`）**，覆盖 2 项 P0（`001`, `002`）与 7 项 P1（`008`~`014`） | `KAIROS-001`, `002`, `008` ~ `014` |
| **Phase 7：UI 视觉、浅色模式与 11 视口响应式审计** | 11 种桌面/平板/手机/横屏视口（`360x800` ~ `2560x1440`）几何重叠、溢出、裁剪与 `<44px` 触控热区扫描；5 个核心 V5 弹窗（EPIC、Share、Help、Account、Compare）浅色模式对比度与 ARIA 扫描；全站 30 张实拍截图逐帧人工视觉审校 | `playwright-core` 几何/对比度探针、CSS 扫描（`safe-area` 39 处、`focus-visible` 7 处、`touch-action` 10 处） | [ui-mobile-audit-results.json](file:///c:/Users/Liam/Desktop/%E6%97%85%E6%B8%B8%E8%AE%A1%E5%88%92/globe-app/docs/audit-v5/evidence/ui-mobile-audit-results.json) | 全部 **30 张**实拍截图（`prod-01`~`19` + 11 张 `vp-*.png`） | 水平溢出均 **0px**；移动端每视口 **23–27** 个小热区；`390x844`/`430x932` 月份条裁剪、底栏遮挡抽屉与规划器；4 个浅色弹窗对比度 **~1.1:1**（黑底黑字）；`#account-modal` 错位留白；#B47D22 金色对比度不足 | `KAIROS-006`, `024`, `026`, `030`, `033` |
| **Phase 8：性能预算、WebGL 稳定性与超时容错** | 构建产物 2,382 文件字节/Gzip 拆解；6 档网络/CPU 孤立冷启动画像（桌面直入、序幕、2x 笔记本、6x 低端移动、Mobile 4G、Slow 3G）；8 轮抽屉/弹窗开关 GC 前后内存/DOM/监听器泄漏采样；`webglcontextlost` 恢复；89 次交互 INP 采样；天气 API 挂起超时降级验证 | Chrome DevTools Protocol (CDP) `Performance.getMetrics`、HeapProfiler GC、网络节流、WebGL 上下文丢失模拟 | [perf-audit-results.json](file:///c:/Users/Liam/Desktop/%E6%97%85%E6%B8%B8%E8%AE%A1%E5%88%92/globe-app/docs/audit-v5/evidence/perf-audit-results.json)、[inp-timeout-results.json](file:///c:/Users/Liam/Desktop/%E6%97%85%E6%B8%B8%E8%AE%A1%E5%88%92/globe-app/docs/audit-v5/evidence/inp-timeout-results.json) | — | 6x CPU `TBT 3,262ms`、4G `load 15,091ms`、Slow 3G `load 35,653ms`；8 轮 GC 后保留 `+1,368` DOM（`+44%`）与 `+144` 监听（`+46%`）；INP p98 **`160ms`**（89 次事件达标）；天气超时降级可读（2,718 字符，0 报错）；WebGL Context Lost 恢复成功 | `KAIROS-023` |
| **Phase 9：测试套件可信度与 CI 覆盖审计** | 实际运行 `npm test`（22 文件 66 用例）并逐一审校断言真实性；审计 `e2e/globe.spec.mjs`（541 行、14 个实际情景、Network Mock 模型）与核心业务盲区 | `node --test tests/*.test.js` 实跑、人工逐行审校 `tests/` 与 `e2e/` | [arch-and-tests-results.json](file:///c:/Users/Liam/Desktop/%E6%97%85%E6%B8%B8%E8%AE%A1%E5%88%92/globe-app/docs/audit-v5/evidence/arch-and-tests-results.json) | — | 单测名义 **66/66** 通过（560ms），但存在 MockD1 失真、E2E 场景 15 空壳打开即关、版本恢复断言缺失、以及 5 大核心模块 0 覆盖 | `KAIROS-032` |
| **Phase 10：证据收敛、去重与问题分级** | 跨阶段合并去重全部缺陷，区分“已实证确认（34 项）”与“环境受限未验证（5 项）”，生成结构化机器可读缺陷库 | 交叉比对全部 9 份 `evidence/*.json` 与 30 张截图 | [issues.json](file:///c:/Users/Liam/Desktop/%E6%97%85%E6%B8%B8%E8%AE%A1%E5%88%92/globe-app/docs/audit-v5/issues.json) | 全部 30 张 | 确认 **34 项**（P0: **7** / P1: **17** / P2: **8** / P3: **2**）；独立隔离 **5 项** `UNVERIFIED` | `KAIROS-001` ~ `034`、`UNVERIFIED-01` ~ `05` |
| **Phase 11：路线图与验证矩阵交付** | 形成可执行 Backlog、V5.1–V5.4 渐进式演进路线图与全相位验证矩阵 | 文档结构化生成与交叉索引校验 | `12_ISSUE_BACKLOG.md`、`13_OPTIMIZATION_ROADMAP.md`、`14_VERIFICATION_MATRIX.md` | — | **100%** 绑定 `issues.json`、9 份证据文件与 30 张实拍截图 | 全量闭环索引 |

---

## 二、证据文件与实拍截图清单一览

### 1. 结构化证据文件（`docs/audit-v5/evidence/`，共 9 份）

| 文件名 | 覆盖阶段 | 核心实测记录摘要 |
|---|---|---|
| [algorithm-audit-results.json](file:///c:/Users/Liam/Desktop/%E6%97%85%E6%B8%B8%E8%AE%A1%E5%88%92/globe-app/docs/audit-v5/evidence/algorithm-audit-results.json) | Phase 5 | `CRDT.mergeTripDocuments` 600 轮属性失败样本、QR V8/V10 RS 校验子错数、AA 9 项反例、TripPlanner/GeoIntelligence 失效用例 |
| [arch-and-tests-results.json](file:///c:/Users/Liam/Desktop/%E6%97%85%E6%B8%B8%E8%AE%A1%E5%88%92/globe-app/docs/audit-v5/evidence/arch-and-tests-results.json) | Phase 1 & 9 | 63 文件/30,036 LOC 指标、162 处静默 catch、`npm test` 66/66 明细、14 情景 E2E 网络 Mock 审计与盲区清单 |
| [data-audit-results.json](file:///c:/Users/Liam/Desktop/%E6%97%85%E6%B8%B8%E8%AE%A1%E5%88%92/globe-app/docs/audit-v5/evidence/data-audit-results.json) | Phase 2 | 722 城/5,414 机位全量校验、`hubs.json` 跨国机场（97）与岛屿高铁（27）异常样本、223 条英文重复词与媒体过滤测试 |
| [functional-audit-results.json](file:///c:/Users/Liam/Desktop/%E6%97%85%E6%B8%B8%E8%AE%A1%E5%88%92/globe-app/docs/audit-v5/evidence/functional-audit-results.json) | Phase 4 | 浏览器环境探测、GH Pages V5.0.0 验证、生产站 30 项功能分级（22 完整/6 部分/2 缺陷）、本地 Worker Auth/Collab/Offline E2E |
| [inp-timeout-results.json](file:///c:/Users/Liam/Desktop/%E6%97%85%E6%B8%B8%E8%AE%A1%E5%88%92/globe-app/docs/audit-v5/evidence/inp-timeout-results.json) | Phase 8 | 89 次真实交互 INP p98=`160ms`（max=`160ms`）采样与 Open-Meteo 天气挂起时的优雅降级输出快照 |
| [perf-audit-results.json](file:///c:/Users/Liam/Desktop/%E6%97%85%E6%B8%B8%E8%AE%A1%E5%88%92/globe-app/docs/audit-v5/evidence/perf-audit-results.json) | Phase 8 | 2,382 文件产物拆解、6 档 CDP 负载指标（DCL/Load/TBT）、8 轮开关 GC 后 DOM `+1,368`/监听 `+144` 泄漏数据、WebGL Context Loss 测试 |
| [science-audit-results.json](file:///c:/Users/Liam/Desktop/%E6%97%85%E6%B8%B8%E8%AE%A1%E5%88%92/globe-app/docs/audit-v5/evidence/science-audit-results.json) | Phase 3 | 物候合成模板逆向与基线对比（2.09d vs 2.89d；2.22d vs 4.84d）、14 场景天文精度对照、Alpenglow 与地形地平线偏差记录 |
| [security-poc-results.json](file:///c:/Users/Liam/Desktop/%E6%97%85%E6%B8%B8%E8%AE%A1%E5%88%92/globe-app/docs/audit-v5/evidence/security-poc-results.json) | Phase 6 | 基于真实 `node:sqlite DatabaseSync` 与 Worker 处理器实跑的 `VULN-01` ~ `VULN-09` 完整请求/响应/数据库行级 PoC |
| [ui-mobile-audit-results.json](file:///c:/Users/Liam/Desktop/%E6%97%85%E6%B8%B8%E8%AE%A1%E5%88%92/globe-app/docs/audit-v5/evidence/ui-mobile-audit-results.json) | Phase 7 | 11 个响应式视口几何扫描（小热区/裁剪/溢出）、5 个弹窗 A11y 与浅色对比度采样、30 张截图映射索引 |

### 2. 实拍验证截图分类索引（`docs/audit-v5/screenshots/`，共 30 张）

- **功能与主题实拍（`prod-01` ~ `prod-19`，19 张）**：
  - 核心首屏与导览：`prod-01-prologue.png`、`prod-02-globe-dark-zh.png`、`prod-03-globe-light-en.png`、`prod-04-command-palette.png`
  - 详情抽屉与科学模拟：`prod-05-drawer-overview.png`、`prod-06-drawer-phenology-weather.png`、`prod-07-drawer-photo-sim.png`、`prod-08-viewfinder-3d.png`
  - 地球时空模态：`prod-09-timemachine.png`、`prod-10-epic-modal.png`
  - 规划、交通与协作：`prod-11-trip-planner.png`、`prod-12-planner-transport.png`、`prod-13-collab-aa-modal.png`
  - 浅色弹窗与移动端抽屉实况：`prod-14-share-center.png`、`prod-15-help-center.png`、`prod-16-account-modal.png`、`prod-17-dest-compare.png`、`prod-18-mobile-drawer-390x844.png`、`prod-19-mobile-planner-390x844.png`
- **响应式全视口矩阵（`vp-*.png`，11 张）**：
  - 手机竖屏与横屏：`vp-360x800.png`、`vp-390x844.png`、`vp-430x932.png`、`vp-mobile-landscape-844x390.png`
  - 平板竖屏与横屏：`vp-768x1024.png`、`vp-820x1180.png`、`vp-tablet-landscape-1024x768.png`
  - 桌面全分辨率：`vp-1024x768.png`、`vp-1440x900.png`、`vp-1920x1080.png`、`vp-2560x1440.png`

---

## 三、未验证边界与排除范围声明（Unverified Scope）

> 为严守“只报告真实观测、不伪造真机/外设/高并发结论”的审计底线，以下 5 个边界在本轮审计中明确标记为 **未验证（`UNVERIFIED`）**，已规划至 [13_OPTIMIZATION_ROADMAP.md](file:///c:/Users/Liam/Desktop/%E6%97%85%E6%B8%B8%E8%AE%A1%E5%88%92/globe-app/docs/audit-v5/13_OPTIMIZATION_ROADMAP.md) 的 **V5.4** 补齐。

| 编号 | 未验证范围 | 客观原因与证据制约 | 推荐验证方式与归属里程碑 |
|---|---|---|---|
| `UNVERIFIED-01` | **物理 iOS Safari / Android Chrome / iPad 真机行为** | 本机为 Windows 11 桌面环境且无实体移动设备连接；模拟视口无法检测 Safari WebGL 显存驱逐、捏合缩放惯性、软键盘顶起视口、刘海屏安全区及真机热降频。 | 按 `08_MOBILE_AUDIT.md` 真机清单在 iPhone/iPad/Android 实机复核（**V5.4**） |
| `UNVERIFIED-02` | **Firefox (Gecko) 与 WebKit 浏览器引擎** | 本机无 `firefox.exe` 与 Playwright WebKit 二进制（见 `functional-audit-results.json`），无法实测 Gecko/WebKit 下的毛玻璃渲染、着色器兼容性与 IndexedDB 配额。 | CI 运行 `npx playwright install firefox webkit` 执行全套跨引擎 E2E（**V5.4**） |
| `UNVERIFIED-03` | **生产环境 Google OAuth、Resend 邮件与 Cloudflare R2 上传** | 生产 `/api/health` 显示 `oauthGoogle: false`、`emailDelivery: false`、`r2: false`（可选密钥/存储桶未绑定），且严格禁止污染线上生产 D1 数据。 | 搭建绑定完整 Secrets 与 R2 Bucket 的 Staging Worker 环境联调（**V5.4**） |
| `UNVERIFIED-04` | **硬件 GPU 真实帧率与 30 分钟长时热稳定性** | 无头 Chrome 强制运行于 SwiftShader 软件渲染（拖拽期 `19.4 FPS`），无法代表物理 GPU（D3D11/Metal）帧率上限及长时显存稳定性。 | 在物理 GPU 笔记本与中端 Android 手机执行 30 分钟地球/地形/建筑漫游采样（**V5.4**） |
| `UNVERIFIED-05` | **真实多用户并发下的 Workers CPU、D1 读行数与上游 API 限流** | 审计规范严禁对 Cloudflare 线上 Edge 或第三方公共 API（OSRM/Wikimedia/Open-Meteo/Frankfurter）实施并发压测。 | 本地 `wrangler dev` + `k6`/`Artillery` 压测并观测 Staging Cloudflare Analytics / D1 Insights（**V5.4**） |
