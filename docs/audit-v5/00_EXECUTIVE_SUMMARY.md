# KAIROS V5.0 全项目深度审计与优化评估 — 总体结论 (Executive Summary)

- **审计对象**: KAIROS. World Travel Atlas `v5.0.0` (`commit cfec5a3`, branch `main`)
- **生产环境**: `https://world-travel-globe.globe-app.workers.dev/`（`runtime: cloudflare-worker`, `version: 5.0.0`, `d1: true`, `r2: false`, `oauthGoogle: false`, `emailDelivery: false`）
- **静态镜像**: `https://haoyuliu1007.github.io/world-travel-globe/`（GitHub Actions 从 `main` 自动构建并部署 V5.0.0；注：本地/GitCode `pages` 分支 `84f2814` 仍停留在 V4.5.0）
- **数据规模核验**: 6 大洲 · 42 分区 · **137 个国家和地区** · **722 座目的地** · **5,414 个摄影机位**（与源码和 `data/audit-report.json` 100% 吻合）
- **审计原则**: 零修改产品业务源码，零写操作触碰生产 D1；全部缺陷均有源码行号、本地 SQLite (`node:sqlite`) PoC、CDP 性能遥测、算法反例或生产站实拍截图支撑。

---

## 1. 项目真实成熟度判断

**总体成熟度定位：可公开浏览的“单机高级地理天文图鉴 + 轻量行程工具”（Beta/V5.0-RC 级别），尚未达到“多用户云协作 SaaS / 严谨科学预测平台”的生产成熟度。**

- **核心优势已落地且稳固**：以 MapLibre GL v5 3D 地球仪 + `Astronomy Engine` + `SunCalc` + `tz-lookup` + Open-Meteo ERA5/实时天气 + 722 城/5,414 机位人工 curated 地理与摄影文案为核心的**单机探索与天文光影模块**完成度高，具有极强的差异化产品价值。
- **V5.0 新增工程复杂度远超验证深度**：V5.0 一次性引入了账户体系、D1 RBAC 协作、CRDT 合并、AA 分账、多式联运 3 层对比、本地二维码、Tier A/B/C 物候校准、8 格式导出与浅色主题懒加载弹窗，但多条链路存在**前后端断连**（`CollabSpace` 0 次请求 `/api/collab/*`）、**安全权限漏洞**（行程劫持、Owner 降级）、**浅色主题对比度灾难**（`--bg-panel` 未定义导致黑底黑字）、**核心算法数学缺陷**（QR V8/V10 解码失败、CRDT 73.3% 交换律失败、跨海高铁可直达）以及**合成物候验证模板**等问题。

---

## 2. 各维度评分与评分依据

| 审计维度 | 评分 (/10) | 评级 | 核心评分依据（基于实测证据） |
|---|---|---|---|
| **架构与工程质量** | **6.0 / 10** | 中等偏良 | 无构建框架轻量化方向正确（`app.bundle` `239.4 KB` gzip），懒加载拆包思路清晰；但 `js/app.js` 达 3,899 LOC、`162` 处静默 `catch`、`CollabSpace` 与后台断连、深链参数丢弃、`sw.js` 缓存顺序错位与离线 `null` 异常（`KAIROS-003`, `021`, `028`, `031`, `034`）。 |
| **全功能实现完整度** | **6.5 / 10** | 中等 | 30 个大项中核心地球仪、搜索、光影、天气、3D 取景器、行程编辑、本地档案、帮助手册在生产站可用；但多人云协同实为本地沙盒、`Markdown` 导出缺失（7/8）、时光机与帮助弹窗存在未本地化/按键关闭失灵、浅色模态框不可读（`KAIROS-003`, `006`, `021`, `027`, `030`）。 |
| **安全性与隐私保护** | **3.5 / 10** | 高风险 | Web Crypto PBKDF2 100k、`HttpOnly` Cookie 与图片 Canvas 去 EXIF 是良好基础；但实测 SQLite PoC 复现 `POST /api/collab/trips` 任意行程劫持、`join/:token` Owner 降级、公开行程泄露成员 `email`/消费、无乐观锁、`collab.js` 缺 CSRF、密码重置不吊销旧会话、OAuth 预接管与 SVG 头像、跨用户本地数据迁移、CSV 公式注入与打印 HTML XSS（`KAIROS-001`, `002`, `008`~`014`）。 |
| **科学计算与数据真实性** | **5.5 / 10** | 分化明显 | 天文位置、IAMA 时区（含 `UTC+5:45` 与 DST）和 14 天预报边界保护表现优秀；但物候验证集实为 3 组合成扰动模板且精度逊于城市历史均值（`2.09d` vs `2.89d`）、雷克雅未克夏至日落跳变 `+24h`、`Polar Day/Night` 误标普通无月升日、`hubs.json` 存在 `97/722` 跨国机场与 `27` 处虚假海岛铁路（`KAIROS-015`~`017`, `029`）。 |
| **核心业务算法** | **4.0 / 10** | 存在硬伤 | `mergeUserProfiles` 600 次随机测试 0 失败；但 `mergeTripDocuments` 出现 **440/600** 交换律与 **115/600** 结合律失败；直线距离误判北京/上海/台北/首尔→东京高铁直达；AA 分账 5 人反例需 4 笔非“最少 3 笔”且丢 1 分钱债务；本地 QR V8/V10 存在 **47/72** 处 RS 纠错错误无法扫码（`KAIROS-004`, `005`, `007`, `018`~`020`, `025`）。 |
| **性能与运行稳定性** | **6.0 / 10** | 中等 | Gzip/Brotli 压缩完备（0 个 >2KB 未压缩文本资源）、热缓存 `1.64s`/`0 KB`、WebGL 上下文丢失可无报错恢复、桌面端 INP `p98=160ms`；但首屏同步脚本+数据解析在 6x CPU 下 TBT 达 `3,262ms`、Slow 3G `DCL 24.5s`/`load 35.6s`，8 轮开合后净增 `+1,368` DOM 节点（+44%）与 `+144` 事件监听器（+46%）（`KAIROS-022`, `023`）。 |
| **UI/UX 与视觉设计** | **5.0 / 10** | 冰火两重天 | 序章宇宙开场与深色地球仪极具质感；但浅色模式下 `--bg-panel` 未定义导致 4 个核心 V5 模态框全部“黑底黑字”无法阅读、`#account-modal` 右侧大片空白面板、顶部搜索框在 1440px 仍被截断、品牌双圆环冗余、规划页顶部 `#topbar` 透底重影、金字对比度不达 WCAG AA（`KAIROS-006`, `026`, `030`, `033`）。 |
| **移动端与平板适配** | **5.0 / 10** | 需专项治理 | 全 11 个仿真视口水平溢出均为 `0px`；但 `390×844` 抽屉与规划表单底部被 `#mobile-bottom-nav` 遮挡、`360×800` 控制条压盖底图栏、`844×390` 横屏及手机端 `#phenology-bar` 裁切月份、每屏 `23–27` 个控件小于 `44×44px`，且缺物理真机与 Firefox/WebKit 验证（`KAIROS-024`, `UNVERIFIED-01`）。 |
| **测试体系真实性** | **4.5 / 10** | 存在假安全感 | `66/66` 单测与 `15/15` E2E 全绿掩盖了多项 P0/P1 缺陷：E2E 场景 15 名为“多端协同收敛”实则仅打开并关闭空页面、`v5-batch4` 标题含“版本恢复”却零次调用恢复接口、Worker 测试依赖正则 MockD1 而非真实 SQLite、未校验导出文件与二维码解码、零对比度自动巡检（`KAIROS-032`）。 |
| **综合加权成熟度** | **5.1 / 10** | **V5.0-RC** | **具备清晰产品灵魂与强护城河，需经 V5.1 安全/P0 热修与 V5.2 算法/科学收口后方可正式对外大规模推广。** |

---

## 3. 已确认问题统计（来自 `issues.json` 单一权威来源）

> 严格遵守证据标准：以下数字**仅计入已通过源码、PoC、脚本或截图证实的缺陷**；环境受限未验证项（`UNVERIFIED-01`~`05`）单独隔离，不混入计数。

| 问题等级 | 数量 | 代表性问题编号 |
|---|---:|---|
| **P0（严重安全/数据丢失/核心不可用）** | **7** | `KAIROS-001` ~ `KAIROS-007` |
| **P1（重要功能错误/高危隐私/科学误导/严重性能UX）** | **17** | `KAIROS-008` ~ `KAIROS-024` |
| **P2（一般功能、搜索数据、SW、工程及测试缺口）** | **8** | `KAIROS-025` ~ `KAIROS-032` |
| **P3（视觉细节、文案排版与代码资源冗余）** | **2** | `KAIROS-033`, `KAIROS-034` |
| **已确认问题总计** | **34** | [完整清单 12_ISSUE_BACKLOG.md](./12_ISSUE_BACKLOG.md) / [issues.json](./issues.json) |
| **未验证/环境受限项（独立隔离）** | **5** | `UNVERIFIED-01` ~ `UNVERIFIED-05` |

---

## 4. 最严重的十个问题（Top 10）

1. **`KAIROS-001` [P0] `POST /api/collab/trips` 缺失所有权校验导致任意行程劫持**（`worker/collab.js:38-63`）：`ON CONFLICT(id) DO UPDATE` 允许任何登录用户用已知 `tripId` 覆盖他人私有行程并写入 `trip_members` 成为 `owner`，进而读取私密消费/评论及踢出原房主（SQLite PoC 已复现）。
2. **`KAIROS-002` [P0] `POST /api/collab/join/:token` 覆盖原房主角色导致自锁**（`worker/collab.js:66-83, 12-25`）：房主点击自己发出的 `viewer` 邀请链接后，`trip_members.role` 被覆盖为 `viewer`，因 `getMemberRole` 先查 `trip_members` 后查 `owner_id`，原房主立即失去编辑与发邀权限（SQLite PoC 已复现）。
3. **`KAIROS-003` [P0] `CollabSpace` 前端与 D1 协作 API 完全断连且 `BroadcastChannel` 无接收者**（`js/lazy/collab-space.js:35-40, 66-259`）：即便登录 Worker，界面宣称 `"D1 Cloud RBAC"` 却发出 `0` 次 `/api/collab/*` 请求，仅读写本地 `localStorage`；`kairos_collab` 频道全库零监听器。
4. **`KAIROS-004` [P0] `CRDT.mergeTripDocuments` 违反交换律（73.3%）与结合律（19.2%）**（`js/services/crdt-merge.js:329-377`）：600 次随机测试中 440 次交换律失败、115 次结合律失败；按 `id` 字母序重排站点破坏日程顺序、跨天移动导致站点双份复制、缺失 `st.updatedAt` 触发墓碑复活。
5. **`KAIROS-005` [P0] 多式联运直线距离误判跨海高铁/公路可直达**（`js/services/transport-service.js:112-194`）：线上截图 `prod-12-planner-transport.png` 实证上海/北京/首尔/台北→东京显示高铁 `~8h34m` 可直达并附带官方购票入口；首尔→东京与檀香山→茂宜岛误标自驾可达。
6. **`KAIROS-006` [P0] 浅色模式下 `--bg-panel` 未定义导致 4 个核心 V5 模态框“黑底黑字”完全不可读**（`css/upgrades.css:2455`）：`ShareCenter`、`HelpCenter`、`DestCompare`、`TripExport` 在浅色模式继承暗色海军蓝底 `#101622` 与深色字体 `#18181B`（`prod-14`, `prod-15`, `prod-17` 截图实证）。
7. **`KAIROS-007` [P0] 本地二维码生成器 Version 7–10 缺失对齐图形与版本信息，完全无法扫码**（`js/services/qr-code.js:158-192`）：V8（47 处 RS 错）与 V10（72 处 RS 错）ISO 解码彻底失败，且所有版本 Format Info Copy #2 均存在 off-by-one 损坏（`KAIROS-019`）。
8. **`KAIROS-011` [P1] 认证模块多处高危缺陷：密码重置不吊销旧会话、IP 限流可被自登录清零、OAuth 预接管与 SVG 头像**（`worker/auth.js:119-133, 345, 394-523, 567`）：9 组 SQLite PoC 全部复现，攻击者每猜 9 次密码登录一次自己账号即可无限绕过 10 次锁定。
9. **`KAIROS-008` / `KAIROS-010` / `KAIROS-012` [P1] 协作与隔离链条缺陷（公开行程泄露邮箱与账单、collab 缺 CSRF、跨用户本地数据串台迁移）**（`worker/collab.js`, `storage-db.js`, `account-center.js`）：未登录即可拉取公开行程成员 `email` 与消费明细；同一浏览器切换账号会将前用户私密密钥与行程迁入后一用户云端。
10. **`KAIROS-015` / `KAIROS-017` [P1] 物候验证使用合成模板且精度逊于历史均值 + `hubs.json` 97/722 跨国误配机场**（`scripts/validate-phenology.js`, `scripts/build-transport-hubs.js`）：23 城校准全由 3 套固定年际偏差模板构成，简单城市均值 MAE `2.09d/2.22d` 优于模型 `2.89d/4.84d`；亚庇指去菲律宾宿务（995km）、霞浦指去台北（187km）、27 座海岛误标有高铁/铁路。

---

## 5. 最具投入产出比的十项优化（Top 10 ROI）

1. **修复 `css/upgrades.css:2455` `--bg-panel` -> `var(--bg-solid)` 并统一模态框外框/关闭逻辑**（~20 LOC）：立即消除浅色模式 4 个核心弹窗不可读 P0（`KAIROS-006`）、`#account-modal` 右侧空白（`KAIROS-026`）与 `Esc` 失灵（`KAIROS-030`）。
2. **修补 `worker/collab.js` & `worker/auth.js` 5 处高危安全漏洞**（~150 LOC）：阻止行程劫持、Owner 自降级、公开泄露 `email`/账单、CSRF 缺失、密码重置未清会话、IP 限流清零绕过与未验邮箱 OAuth 合并（`KAIROS-001`, `002`, `008`~`011`）。
3. **以 Nayuki MIT QR 编码器（~150 LOC）替换手写损坏编码器，并修复 `ShareCenter(url, {size:136})`**（`KAIROS-007`, `019`）：一次解决所有版本规范合规、4-module 静默区与长分享码扫码失败问题。
4. **修复 `api-client.js` 1800ms 永久缓存静态降级陷阱 + `#timemachine-dock` i18n + `.md` 导出**（~80 LOC）：消除高延迟网络下 Workers 站误锁静态模式（`KAIROS-022`），补全三语一致与 8 格式导出承诺（`KAIROS-021`, `027`）。
5. **修复 `transport-service.js` 跨海陆地连通性判断 + 用完整 OurAirports CSV 重建 `hubs.json`**（~200 LOC）：根除上海/北京→东京坐高铁与 97 座跨国机场错配，守住地理真实性底线（`KAIROS-005`, `017`）。
6. **在 `export-service.js`、`trip-planner.js`、`expense-splitter.js` 补全 CSV 公式前缀转义与 `s.startTime` HTML 转义 + 分账整数分算法**（~120 LOC）：一键消除 CSV 注入、打印 XSS 与分币守恒误差（`KAIROS-013`, `018`）。
7. **将 `CollabSpace` 真正对接 `/api/collab/*` 并补全 `BroadcastChannel` 监听，或采用 `Yjs` 替换有缺陷的 `mergeTripDocuments`**（~250 LOC）：打通真多人协作与无冲突 CRDT 合并（`KAIROS-003`, `004`）。
8. **移动端 CSS 底部避让与 `#phenology-bar` 横向滚动修复**（~120 LOC CSS）：解决 `360px`/`390px`/`844x390` 底栏遮挡抽屉与规划表单、控件重叠及月份裁切，统一 `44×44px` 触控热区（`KAIROS-024`）。
9. **统一天文暮光/折射/跨日计算至已内置的 `Astronomy Engine`，诚实重标物候模型基线**（~150 LOC）：消除雷克雅未克夏至 `+24h` 日落跳变与 `Polar Day/Night` 误标，以真实 JMA/NPN 记录或明确气候统计标注替代合成模板（`KAIROS-015`, `016`）。
10. **首屏脚本异步化（`atlas-index` Worker/异步加载 + 弹窗 DOM 卸载）与 `node:sqlite` + `fast-check` + `axe-core` 测试门禁**：大幅降低 6x CPU `TBT`（3.26s）与 Slow 3G 加载时间（35.6s），防止 P0/P1 回归再次上线（`KAIROS-023`, `032`）。

---

## 6. 应当保留的优秀设计与架构

- **原生轻量边缘架构**：不盲从重型 React/Next SPA 框架，以 `build-dist.js` + `LazyLoader` 保持核心 JS `239.4 KB` gzip（V5 仅增 +18.5%），长期可维护性强，**无需整站重写**。
- **722 城/5,414 机位双语地理与摄影文案库**：机器全量扫描证实零缺失 ID/评分/经纬度、100% EN 翻译覆盖（75,482 字段），机位描写具真实可拍性与机位朝向/景别细节。
- **确定性天文与 IANA 时区体系**：`tz-lookup` + `Intl.DateTimeFormat` 精准处理 `Asia/Kathmandu (+5:45)` 与美国夏令时切换，`SolarTerminator` 与 `BrightStars` 几何精度 `<0.05°`。
- **Photo Opportunity Index 14 天气象诚实边界隔离**：超 14 天强制 `weatherIncluded: false`，不将气候均值伪装成实时预报；`MediaWikidata` 关键词过滤精准保留梯田/野鸭同时拒收菜品照片。
- **本地优先免注册体验 + 图片 Canvas 剥离 EXIF GPS**：访客无需账号即可完整使用地球仪、单机规划与 IndexedDB 档案，上传前浏览器端重绘去除了隐私坐标。
- **KAIROS 品牌视觉与序章体验**：纯矢量 SVG 品牌体系与星空序章（`prod-01-prologue.png`）建立了极高的第一印象与“以天文学精度去旅行”的产品辨识度。

---

## 7. 可直接复用的成熟开源资源（详评见 [`10_OPEN_SOURCE_RECOMMENDATIONS.md`](./10_OPEN_SOURCE_RECOMMENDATIONS.md)）

| 开源组件 / 数据源 | 许可证 | 商业友好 | 直接解决的当前缺陷 | 建议策略 |
|---|---|---|---|---|
| **Astronomy Engine** *(已内置)* | MIT | 是 | `SunCalc` 夜间折射偏差与夏至跨日跳变（`KAIROS-016`） | 深化使用，替代 `SunCalc` 核心计算 |
| **Nayuki QR Code Generator** | MIT | 是 | V7–V10 QR 无法扫码与 Format Info 损坏（`KAIROS-007`, `019`） | 直接替换 `qr-code.js` 手写编码器 |
| **OurAirports 完整 CSV** | Public Domain | 是 | `hubs.json` `97/722` 跨国机场误配（`KAIROS-017`） | 构建期脚本替换 185 机场硬编码表 |
| **Turf.js + Natural Earth 10m** | MIT / Public Domain | 是 | 跨海直达误判、国际日界线劈分、海洋坐标门禁（`KAIROS-005`, `020`, `029`） | 按需引入几何/测地线子模块 |
| **Yjs** | MIT | 是 | `CRDT.mergeTripDocuments` 交换律/排序破坏及多人同步（`KAIROS-003`, `004`） | 替代手写文档 CRDT 合并器 |
| **Hono + Zod** | MIT | 是 | `worker/` 路由安全、CSRF、请求体大小与 Schema 校验（`KAIROS-001`, `010`, `014`） | 重构 `worker/` API 层时直接引入 |
| **fast-check + axe-core + Vitest** | MIT / MPL-2.0 | 是 | CRDT 属性测试、深浅色对比度门禁、真实单测体系（`KAIROS-006`, `032`） | 直接接入 CI 回归门禁 |
| **OSRM / Valhalla** | BSD-2 / MIT | 是（自建） | 跨海/路网连通性真实校验（`KAIROS-005`） | 公共演示节点仅作轻量降级，商业化需自建 |

---

## 8. 建议立即执行的下一版本计划（V5.1 紧急安全与可用性热修）

完整 V5.1–V5.4 路线见 [`13_OPTIMIZATION_ROADMAP.md`](./13_OPTIMIZATION_ROADMAP.md)。**建议立即冻结新功能，优先发布 V5.1（预计 3–5 个工作日）**：
1. **安全与隔离热修**：修复 `worker/collab.js` 行程劫持（`KAIROS-001`）、Owner 角色覆盖（`KAIROS-002`）、公开邮箱/账单泄露与跨行程投票（`KAIROS-008`）、`PUT` 乐观锁（`KAIROS-009`）、`collab.js` CSRF（`KAIROS-010`）；修复 `worker/auth.js` 重置密码吊销全部 `sessions`、OAuth 校验 `verified_email`、独立 `(ip, email)` 限流与 `avatarUrl` 禁用 SVG（`KAIROS-011`）；修复切换用户本地数据串台（`KAIROS-012`）、CSV 公式注入与 HTML XSS（`KAIROS-013`）、`/api/img` SVG 沙箱与 `/api/photos` 鉴权（`KAIROS-014`）。
2. **P0 核心可用性热修**：修复 `css/upgrades.css:2455` `--bg-panel` 浅色模态框黑底黑字（`KAIROS-006`）；替换本地 QR 编码器（`KAIROS-007`, `019`）；修复 `transport-service.js` 跨海高铁/自驾误判（`KAIROS-005`）；修复 `api-client.js` 1800ms 永久降级缓存（`KAIROS-022`）；先将 `CollabSpace` 诚实接通 `/api/collab/*` 或在修复完成前明确关闭伪造的 `"D1 Cloud RBAC"` 状态标签（`KAIROS-003`）。
3. **V5.1 量化验收门槛**：`node:sqlite` 安全回归集 100% 通过；浅色/深色 `axe-core` 严重对比度缺陷 = 0；V1–V20 二维码独立解码 100% 成功；北京/上海/首尔/台北→东京陆运可行性全部为 `false`。

---

## 9. 尚未完成验证的项目及原因

以下 5 项因客观运行环境与只读审计约束无法完成，**已与已确认缺陷严格隔离**（详见 `issues.json` `unverifiedSuspicions` 与 [`14_VERIFICATION_MATRIX.md`](./14_VERIFICATION_MATRIX.md)）：
1. **`UNVERIFIED-01` 物理 iOS Safari / Android Chrome / iPad 真机行为**：本次环境仅有 Windows 11 桌面端，无真机硬件，无法实测物理双指惯性阻尼、Safari WebGL 内存驱逐、虚拟键盘顶起视口及刘海屏安全区。
2. **`UNVERIFIED-02` Firefox 与 WebKit 引擎兼容性**：本机未安装 Firefox 与 Playwright WebKit 二进制，毛玻璃、`overflow` 与 WebGL2 跨引擎差异尚未实测。
3. **`UNVERIFIED-03` 生产环境 Google OAuth、Resend 邮件与 Cloudflare R2 实体图库**：生产 `/api/health` 返回 `oauthGoogle: false`、`emailDelivery: false`、`r2: false`，且严禁修改生产环境密钥或向生产 D1 写入测试数据。
4. **`UNVERIFIED-04` 硬件 GPU 真实帧率与 30 分钟以上长时热稳定性**：无头 Chrome 使用 SwiftShader 软件渲染（`19.4 FPS`），无法代表物理 GPU 真实帧率与手机端长期温控表现。
5. **`UNVERIFIED-05` 真实高并发下的 Cloudflare Workers CPU / D1 行读取成本与上游限流**：本轮未对生产边缘节点及 OSRM/Open-Meteo/Wikimedia 发起并发压测。

---

## 交付物索引（`docs/audit-v5/`）

- [`00_EXECUTIVE_SUMMARY.md`](./00_EXECUTIVE_SUMMARY.md) · [`01_ARCHITECTURE_AUDIT.md`](./01_ARCHITECTURE_AUDIT.md) · [`02_FUNCTIONAL_AUDIT.md`](./02_FUNCTIONAL_AUDIT.md) · [`03_SECURITY_AUDIT.md`](./03_SECURITY_AUDIT.md) · [`04_SCIENCE_DATA_AUDIT.md`](./04_SCIENCE_DATA_AUDIT.md)
- [`05_ALGORITHM_AUDIT.md`](./05_ALGORITHM_AUDIT.md) · [`06_PERFORMANCE_AUDIT.md`](./06_PERFORMANCE_AUDIT.md) · [`07_UI_UX_AUDIT.md`](./07_UI_UX_AUDIT.md) · [`08_MOBILE_AUDIT.md`](./08_MOBILE_AUDIT.md) · [`09_TEST_COVERAGE_AUDIT.md`](./09_TEST_COVERAGE_AUDIT.md)
- [`10_OPEN_SOURCE_RECOMMENDATIONS.md`](./10_OPEN_SOURCE_RECOMMENDATIONS.md) · [`11_COMPETITIVE_ANALYSIS.md`](./11_COMPETITIVE_ANALYSIS.md) · [`12_ISSUE_BACKLOG.md`](./12_ISSUE_BACKLOG.md) · [`13_OPTIMIZATION_ROADMAP.md`](./13_OPTIMIZATION_ROADMAP.md) · [`14_VERIFICATION_MATRIX.md`](./14_VERIFICATION_MATRIX.md)
- [`issues.json`](./issues.json) · [`screenshots/`](./screenshots/)（30 张 PNG） · [`evidence/`](./evidence/)（9 份结构化 JSON 证据）
