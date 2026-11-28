# KAIROS V5.0 测试可信度与真实覆盖率审计报告 (`09_TEST_COVERAGE_AUDIT.md`)

> **审计对象**：`22` 个单元测试/集成测试文件（共 `66` 个测试用例，执行耗时 `560ms`）与 [e2e/globe.spec.mjs](file:///c:/Users/Liam/Desktop/旅游计划/globe-app/e2e/globe.spec.mjs)（`541` LOC，宣称 `15` 个端到端场景，覆盖 `8` 种视口）。  
> **核心结论**：当前测试套件虽然报告 **`66/66` 与 `15/15` 全绿**，但存在严重的**“虚假绿灯”（False Confidence）**现象（**`KAIROS-032`**）。大量测试依赖正则静态匹配、自定义假 `MockD1`、空壳多标签闭环以及只计数不执行的 DOM 断言，致使 7 个 P0 与 17 个 P1 级严重缺陷全数漏网并带病发布至 `v5.0.0`。  
> **关联证据**：[arch-and-tests-results.json](file:///c:/Users/Liam/Desktop/旅游计划/globe-app/docs/audit-v5/evidence/arch-and-tests-results.json)、[issues.json](file:///c:/Users/Liam/Desktop/旅游计划/globe-app/docs/audit-v5/issues.json)

---

## 1. 为什么 `66/66` 与 `15/15` 全绿仍漏掉 34 个确认缺陷？

对全仓测试代码逐行解剖后，发现测试可信度失真主要由以下 **6 类测试反模式**造成：

1. **“名不副实”的占位 E2E 场景（Scenario 15）**：[e2e/globe.spec.mjs:511-526](file:///c:/Users/Liam/Desktop/旅游计划/globe-app/e2e/globe.spec.mjs#L511-L526) 宣称测试 `"Multi-Context Collab BroadcastChannel Convergence"`，实际上打开第二个上下文 `ctxB` 访问 `/?instant=1` 后，**未执行任何协同编辑或频道消息发送即直接关闭 `ctxB`**，随后只在 `pageA` 检查 `#topbar` 按钮的 `aria-label`。因此 `CollabSpace` 根本没有 `BroadcastChannel` 接收器且从不请求 `/api/collab/*` 的 P0 缺陷（**`KAIROS-003`**）完全未被触发。
2. **脱离真实约束的正则 `MockD1`**：`v5-batch2-auth-security.test.js` 与 `v5-batch4-collab-and-split.test.js` 自建正则匹配的内存 `MockD1`，不执行 SQLite 外键（`PRAGMA foreign_keys`）、唯一索引与约束冲突逻辑，掩盖了 `POST /api/collab/trips` 劫持他人行程（**`KAIROS-001`**）、房主加入自己邀请链接降级（**`KAIROS-002`**）、注销账号遗留孤儿数据（**`KAIROS-011`**）与并发 `PUT` 覆盖写（**`KAIROS-009`**）。
3. **测试标题虚标未测接口**：`v5-batch4-collab-and-split.test.js` 标题明确写着 `"& version restore"`，但全文件**从未调用** `/versions` 或 `/versions/:v/restore`；未测评论、投票、AA 支出接口、成员降权与过期邀请。`v5-batch2-auth-security.test.js` 漏测 `/api/auth/logout`、密码重置会话失效、10 次失败锁定与资料更新。
4. **只验节点存在/数量，不验实际功能输出**：
   - E2E Scenario 12-13 只断言 `.exp-fmt-btn` 数量等于 `7`（本身已少于文档宣称的 8 种），**从不点击导出按钮或校验文件内容**（漏掉 CSV 公式注入与 HTML XSS **`KAIROS-013`**、缺失 `.md` **`KAIROS-021`**）；
   - E2E Scenario 14 与 `v5-batch4` 只检查 ShareCenter 生成的文本 `startsWith('<svg')` 或存在 `<svg>`，**从不解码验证 QR 码可读性**（漏掉 V7–V10 因缺定位格/版本块导致 100% 不可扫的 **`KAIROS-007`、`KAIROS-019`**），也未测试切换 `#sc-type-sel`（**`KAIROS-021`**）。
5. **只验旧算法、漏测 V5 新算法**：`v4-5-crdt-properties.test.js` 用 240 次随机属性试验严谨测试了 V4 的 `mergeUserProfiles`，但对 V5 新增的 `mergeTripDocuments` 只写了一个最简单的墓碑单测，导致后者在 600 次随机试验中 **73.3% 违背交换律、19.2% 违背结合律**（**`KAIROS-004`**）。
6. **只测合成桩与单一主题，漏测真实数据与 Light 模式**：`v4-1-polish.test.js`（2/3 为源码正则字符串搜索）与 `v5-batch6`（正则检查死 HTML ID `#layer-meta-inspector`）不跑真实 DOM 渲染；E2E 未覆盖 Light 模式弹窗渲染，致使 4 个核心懒加载弹窗文字完全不可读的 P0 缺陷（**`KAIROS-006`**）逃逸上线。

---

## 2. 22 个单测 / 集成测试文件逐一深度重评

| 测试文件 | 用例/断言 | 测试性质分类 | 实际验证内容 | 致命盲区与误导风险 |
| :--- | :---: | :--- | :--- | :--- |
| `tests/ambient-radio.test.js` | 2 / 19 | `mock-only` + 文件检查 | 检查 16 首 MP3 存在且 >100KB；用 `MockAudio` 测状态切换与 `CosmicBGM` 互斥 | 未测真实 `HTMLAudioElement` 播放、拖拽进度条、分类筛选及报错 UI |
| `tests/astronomy-index.test.js` | 3 / 12 | `algorithm-unit` + 真库 | 用真实 `SunCalc` 测东京夏至正午；测光位角分类；用合成气候测 `AestheticIndex` | 仅单点东京，未测高纬夏至 24h 跨日跳变（`KAIROS-016`） |
| `tests/build-and-worker.test.js` | 2 / 26 | `build-artifact` + `mock-env` | 检验 `dist/` 产物与基础 Worker `/api/health`、坏参 `400`、无绑定 `501` | 未测 `sw.js` `/vendor/` 缓存路由错位与离线 `null`（`KAIROS-028`） |
| `tests/data-integrity.test.js` | 2 / 18 | `data-validation` | VM 加载 56 个数据脚本，校验 722 城 / 5,414 机位 / 137 国与经纬度边界 | 未检测海洋坐标点（`sc-aldabra-outer` 偏海 627km）与 Banff/Jasper 重合坐标（`KAIROS-029`） |
| `tests/intro-session.test.js` | 1 / 10 | `mock-only` | VM 中用 `MockAudio` 测 `IntroSession` 6 小时 3 次限额 | 未测音频渐变定时器、自动播放拦截回退或开场 DOM 过渡 |
| `tests/planner-archive.test.js` | 3 / 15 | `algorithm-unit` | 测东京→巴黎跨海拦截、3 机位模拟规划、CSV/URL 往返、3 条档案统计 | 未测 OSRM 超时报错被误标为 `crossSea: true`（`KAIROS-020`）、真实 IndexedDB 或 EXIF 剥离 |
| `tests/v4-1-polish.test.js` | 3 / 20 | **`static-string-regex`** (2/3) | **正则匹配 CSS/JS 源码字符**（`top>=68px`, `removeEventListener`, `RAF`）；3 条合成照片评分 | 2/3 测试不运行真实浏览器/WebGL，仅靠字符串存在性充当稳定性保障 |
| `tests/v4-2-reliability.test.js` | 6 / 35 | `algorithm-unit` + `regex` | CRDT 墓碑、6 城太阳中午（宽容窗 10.5h–14h）、镜头 FOV、3 城模拟检索、静态 YAML 检查 | 太阳中午容忍 `3.5` 小时窗口过宽；检索仅用 3 城桩未测 722 城真实规则冲突（`KAIROS-025`） |
| `tests/v4-3-living-earth.test.js` | 4 / 38 | `algorithm` + `artifact` + `regex` | `SolarTerminator` 分至点纬度、`dist/p/` SEO、Mapterhorn URL、字符串查 `embed-mode` | 未测 `PosterShare` Canvas 渲染与 Mapterhorn → Terrarium 自动降级 |
| `tests/v4-4-i18n-complete.test.js` | 4 / 28 | `mock-dom` + `regex` | 测开场与科学引擎英文输出无 CJK 字符；3 条东南亚菜肴过滤 | **漏测 `earth-timemachine.js`（全简体硬编码 `KAIROS-027`）**、全部 `js/lazy/*` 与 722 城英文重词（`KAIROS-029`） |
| `tests/v4-5-api-and-og.test.js` | 3 / 19 | `mock-fetch` + `regex` | 模拟 `429 Retry-After:0` 重试；校验 `frame-ancestors *`；读 3 张 OG PNG 尺寸 | 漏测 `detectWorkerCapabilities` 1800ms 永久锁死（`KAIROS-022`）；仅抽查 3/722 张 OG 图 |
| `tests/v4-5-crdt-properties.test.js` | 2 / 10 | `property-based` | 240 次随机属性试验验证 `mergeUserProfiles` 交换律/结合律/幂等律 | **仅测 `mergeUserProfiles`，完全未测 V5 核心 `mergeTripDocuments`（73.3% 失败 `KAIROS-004`）** |
| `tests/v4-5-scientific-accuracy.test.js` | 2 / 22 | `cross-validation` | 8 城 IANA 时区夏令时/+5:45 验证；181 点晨昏线对照 `SunCalc` (<1°) | **高质量科学测试**；但未覆盖 `PhotoSimulator` 与真实 Terrarium DEM 射线遮挡 |
| `tests/v4-phase1.test.js` | 5 / 33 | `algorithm-unit` + `mock-env` | `Astronomy Engine` 银河、rectilinear FOV、Terrarium 解码、北极星矢量、Worker 400 | 未测非极星在跨恒星时下的赤道投影精度 |
| `tests/v4-phase2-3.test.js` | 4 / 33 | `algorithm-unit` + `data` | 2 城桩测 NL 解析、`atlas-enrichment` 722 条、2-opt 缩短路径、基本 `ProfileCRDT` | 输入规模极小，未发现跨天拖拽与 `orderDayStopsByLight` 放大路程问题（`KAIROS-020`） |
| `tests/v5-batch1-brand-and-planner-fix.test.js` | 2 / 16 | `filesystem` + `algorithm` | 检验 10 张品牌 SVG/PNG/ICO；测北京/东京生成不互串及未知地名返回 `[]` | 仅测纯函数，未测 DOM 切换标签时的表单草稿残留（`KAIROS-020` 漏重置 9 字段） |
| `tests/v5-batch2-auth-security.test.js` | 2 / 15 | **`mock-db-worker`** + `regex` | 正则查 SQL `CREATE TABLE`；用简陋 `MockD1` 测注册/CSRF/跨账号迁移 | **漏测限流绕过、登出、重置密码不清 Session、OAuth 邮箱未验、SVG 头像与真实 FK 级联（`KAIROS-011`）** |
| `tests/v5-batch3-multimodal-planner.test.js` | 3 / 16 | `data` + `algorithm` | 校验 `hubs.json === 722`；测飞机几何与 `budget_over` 冲突 | **只测航空未测跨海高铁/轮渡/自驾常识校验（`KAIROS-005`、`KAIROS-017`）**，漏测时间/距离冲突死分支 |
| `tests/v5-batch4-collab-and-split.test.js` | 2 / 11 | **`mock-db-worker`** + `algorithm` | `MockD1` 测建团/只读拦截/撤销邀请；3 人分账；QR `startsWith('<svg')`；简单墓碑合并 | **标题宣称 `& version restore` 却零调用**；漏测 `KAIROS-001/002/003/004/007/008/009/010/018/019` |
| `tests/v5-batch5-science-and-search.test.js` | 4 / 33 | `data` + `algorithm` | 校验 `phenology-validation.json` 阈值、8 场景预设、>14d 守卫、10 维向量 | 未对照历史均值基线导致被合成数据蒙蔽（`KAIROS-015`）；未测 `DestCompare` UI（`KAIROS-006`） |
| `tests/v5-batch6-media-and-archive.test.js` | 4 / 20 | `algorithm` + `mock-fetch` + `regex` | 4 条标题打分；南北半球季节反转；`/api/epic` 回退；**正则查死 ID `#layer-meta-inspector`** | 未测 Canvas EXIF 剥离、时移卷帘 UI、或图库真实网络竞态 |
| `tests/v5-batch7-share-manual-export.test.js` | 3 / 27 | `algorithm` + `data` | 测 7 个导出字符串生成器；查 12 类型/6 比例定义；验 30 章三语手册 JSON | **误把 7 种算成 8 种**；未测 CSV 注入/HTML XSS（`KAIROS-013`）；未测 `ShareCenter.render()` UI 接线错误（`KAIROS-021`） |

---

## 3. Playwright E2E 15 场景深度重评 (`e2e/globe.spec.mjs`)

E2E 套件运行于本地 Mock Server + 全外部 API 桩（Open-Meteo、Wikimedia、Wikidata、Panoramax 全返回空/桩，瓦片返回 `1×1 TINY_PNG`，`/api/health` 桩定为 `d1:false, r2:false`）：

| 场景编号 | 宣称验证目标 | 真实测试深度 | 关键盲区与失真点 |
| :---: | :--- | :--- | :--- |
| **1** | 开场动画与英文切换 | 真实 UI 交互 | 点击 `#sp-lang-switch` 与 `#sp-skip` 验证真实 DOM 变更（有效） |
| **2** | 主地球首屏加载耗时 | 指标采集 | 仅记录 `DCL` / `loadMs` / `resourceCount`，无严格性能阈值失败门禁 |
| **3** | 加德满都 `+5:45` 时区徽章 | 真实 UI 交互 | 实测 `#sim-tz-badge` 包含 `Asia/Kathmandu` 与 `+5:45`（有效） |
| **4** | 三语实时切换 | **`page.evaluate` API 直调** | 直接调用 `window.switchAppLanguage`，**并未点击 UI 语言切换按钮**，且只查 `document.title` |
| **5** | 3D 取景器 400mm 光学裁切与 Esc | 真实 UI 交互 | 验证长焦裁切标签与 `Escape` 关闭（有效） |
| **6** | NASA EPIC 弹窗 | Mock API + DOM 高度 | 仅验证图片阶段高度 `>=300px` 与按钮存在 |
| **7** | 系统诊断性能档切换 | 真实 UI 交互 | 验证 `eco`/`auto` 与 `html[data-perf-tier]` 属性 |
| **8** | Embed 模式安全与快捷键锁定 | 真实 UI 交互 | 验证 `#topbar` 隐藏与 `Ctrl+K` 阻塞（有效） |
| **9** | 静态 SEO 页与 1200×630 OG 图 | 真实产物核验 | 加载 `/p/jp-kanto-tokyo/` 校验真实渲染尺寸（有效） |
| **10** | 8 视口响应式与触控高度 | 仿真视口几何检查 | 仅查 `overflowPx <= 2` 与部分触控高度，**未检测按钮与底部导航重叠或文本裁剪**（漏掉 `KAIROS-024`） |
| **11** | 标签画布层叠与抽屉吸顶/展开 | 真实 UI 交互 | 校验 `#globe-label-canvas` `z-index: 1` 与移动端上滑展开 |
| **12–13** | 北京/东京规划隔离、交通Tab、导出弹窗 | 交互 + **按钮计数** | 仅点击 `#tp-exp-more` 断言 `.exp-fmt-btn` 数量为 7，**未点击任意导出格式或保存离线包** |
| **14** | 机位 >14 天守卫、ShareCenter QR、30 章手册 | 交互 + **节点存在性** | 仅检查 ShareCenter 内有 `<svg>`，**不校验 QR 可解码性、不切 `#sc-type-sel`、不测 `Escape` 关手册（`KAIROS-030`）** |
| **15** | **多上下文协同 BroadcastChannel 收敛与无障碍** | **空壳冒烟（严重误导）** | **打开 `ctxB` 后立刻 `ctxB.close()`，未进行任何消息通信、协同操作或状态收敛验证（`KAIROS-032`）** |

---

## 4. 真实功能覆盖率矩阵 (Functional Coverage Matrix)

| 模块 / 领域 | 真实行为单测 | 负向/安全测试 | 边界/属性测试 | 真实端到端 E2E | 综合评价与主要缺口 (`KAIROS-0xx`) |
| :--- | :---: | :---: | :---: | :---: | :--- |
| **Worker Auth & Account** (`worker/auth.js`) | 假 MockD1 | 极弱 (缺重置/限流/OAuth) | ❌ 无 | ❌ 无 (stub `d1:false`) | **严重不足**：`KAIROS-011`, `012`, `022`, `026` 均靠实测 PoC 才曝光 |
| **Worker Collab & RBAC** (`worker/collab.js`) | 假 MockD1 | 局部 (缺越权建团/降权/CSRF) | ❌ 无 | ❌ 无 (Scenario 15 空壳) | **严重不足**：`KAIROS-001`, `002`, `008`, `009`, `010` 全部漏网 |
| **CollabSpace & AA Splitter** (`collab-space.js`, `expense-splitter.js`) | 仅引擎 1 例 | ❌ 无 | ❌ 无 (缺精度/最优解) | ❌ 无 (只验存在) | **极低**：UI 与 `/api/collab/*` 零对接（`003`）；分账误差未测（`018`） |
| **CRDT Merge & StorageDB** (`crdt-merge.js`, `storage-db.js`) | 仅 V4 Profile | ❌ 无 (缺回滚时间戳) | 仅 Profile (缺 Trip) | ❌ 无 (缺真实 IDB/隔离) | **严重失衡**：V5 `mergeTripDocuments` 73.3% 失败未测（`004`, `009`, `012`） |
| **TripPlanner & Transport** (`trip-planner.js`, `transport-service.js`) | 局部纯函数 | ❌ 无 (缺无坐标/跨海拦截) | ❌ 无 (缺多城/94km步行) | 浅层 (只生成北京/东京) | **中等偏低**：跨海高铁（`005`）、外籍机场（`017`）、别名失效（`020`）全漏 |
| **QRCode & ShareCenter** (`qr-code.js`, `share-center.js`) | 仅测 `<svg` 前缀 | ❌ 无 (缺截断报警) | ❌ 无 (缺 V7–V40/CJK) | 仅查 `<svg>` 存在 | **几乎无效**：V7+ 二维码全废（`007`, `019`）、深链/切换失效（`021`） |
| **ExportService** (`export-service.js`) | 7 种格式字符串 | ❌ 无 (缺 CSV 注入/XSS) | ❌ 无 (缺空字段/特殊字符) | 仅数 `.exp-fmt-btn === 7` | **危险漏洞**：公式注入与 HTML XSS（`013`）、缺失 `.md`（`021`）未拦 |
| **Science: Phenology & PhotoSim** (`phenology-engine.js`, `photo-simulator.js`) | 合成模板验证 | ❌ 无 | 极光/时间/折射局部 | 仅查时区徽章与 `>14d` | **统计偏差**：合成数据自证（`015`）；高纬 24h 跳变与极夜误标（`016`） |
| **GeoIntelligence Search** (`geo-intelligence.js`) | 2–3 城小桩 | ❌ 无 | ❌ 无 (空串/否定词/年份) | 浅层搜索 | **薄弱**：空串回 28 城及正则误判全数漏测（`025`） |
| **Service Worker & PWA** (`sw.js`) | ❌ 无 | ❌ 无 (缺离线未命中) | ❌ 无 (缺版本升级淘汰) | ❌ 无 (未测离线缓存) | **零覆盖**：`sw.js` 缓存分层冲突与 `null` 报错未测（`028`） |
| **Light Theme / A11y / 移动端几何** (`styles.css`, `upgrades.css`) | 正则检查 (无效) | ❌ 无 | ❌ 无 | 仅查 `overflowPx` | **零覆盖**：Light 弹窗对比度崩坏（`006`）、Esc 无效（`030`）、遮挡（`024`）全漏 |
| **Data & i18n Corpus** (`data/*`, `data/i18n/*`) | 722 结构/范围 | ❌ 无 (缺离岸/重词/简繁混杂) | ❌ 无 | 浅层标题查验 | **覆盖片面**：97 错配机场（`017`）、海岛坐标与 223 重词（`029`）、Dock 未翻译（`027`） |

---

## 5. 测试套件重构建议（对应 `KAIROS-032` 验收标准）

1. **废弃正则 `MockD1`，接入 Node 原生 SQLite (`node:sqlite` / `better-sqlite3`)**：在测试中运行真实 `migrations/0001~0003.sql`（强制开启 `PRAGMA foreign_keys = ON`），把 `KAIROS-001/002/008/009/011` 的 PoC 脚本直接固化为 CI 回归用例。
2. **引入属性测试（`fast-check`）覆盖算法核心**：对 `CRDT.mergeTripDocuments`（1,000+ 次随机操作序列验交换/结合/幂等/不重排/不复活）及 `ExpenseSplitter`（整数分守恒 `sum === 0` 与最小转账数）实施严格属性测试。
3. **建立物理与协议级自证测试**：引入 `jsqr`（MIT）在单测与 E2E 中**真正解码**生成的 QR SVG（覆盖 V1–V20 ASCII/CJK/长 `?trip=` URL）；用 `Astronomy Engine` 跨南/北极圈 14 场景校验 `PhotoSimulator`；用真实 `Natural Earth` 陆地多边形在 `scripts/audit-data.js` 拦截跨海高铁与离岸机场。
4. **重写虚假 E2E 用例并补齐 `axe-core` 无障碍与导出校验**：
   - 重写 Scenario 15：真实在 `ctxA` 与 `ctxB` 间通过 `BroadcastChannel` 与 `/api/collab/*` 完成创建、邀请、评论、AA 记账及双向收敛断言；
   - 新增实际点击下载并解析 JSON/CSV（校验公式转义）/ICS/GPX/KML/GeoJSON/Markdown 及 Light/Dark 双主题下 `axe-core` 零 `color-contrast` 严重告警的自动化门禁；
   - 在 CI 中补充 Playwright `firefox` 与 `webkit` 矩阵，消除 `UNVERIFIED-02` 盲区。
