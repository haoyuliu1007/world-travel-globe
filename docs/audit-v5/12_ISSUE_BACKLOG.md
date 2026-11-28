# KAIROS V5.0 深度审计全量问题清单（Issue Backlog）

> **审计基线**：Commit `cfec5a3`（Tag `v5.0.0`） | **审计时间**：`2026-11-28T13:40:00+08:00` | **数据源**：[issues.json](file:///c:/Users/Liam/Desktop/%E6%97%85%E6%B8%B8%E8%AE%A1%E5%88%92/globe-app/docs/audit-v5/issues.json)  
> **原则声明**：本清单严格基于源码核查、本地 `node:sqlite` PoC、算法反例集、科学对照实验、CDP 性能采样与生产站实拍截图生成，**1:1 映射 `issues.json` 中的 34 项已确认问题与 5 项未验证疑点**，不虚构任何未复现缺陷。

---

## 一、全量问题统计总览

| 指标维度 | 数量 | 占比 | 对应编号范围 | 处置建议 |
|---|---:|---:|---|---|
| **已确认问题总数 (`totalConfirmed`)** | **34** | **100.0%** | `KAIROS-001` ~ `KAIROS-034` | 纳入 V5.1–V5.4 演进路线图 |
| **P0（阻塞级 / 严重安全与核心失真）** | **7** | **20.6%** | `KAIROS-001` ~ `KAIROS-007` | **V5.1 立即热修复阻断发布** |
| **P1（高危安全 / 核心功能与科学失真）** | **17** | **50.0%** | `KAIROS-008` ~ `KAIROS-024` | V5.1 安全补丁 + V5.2/V5.3 专项修复 |
| **P2（中危功能缺陷 / 数据与测试失信）** | **8** | **23.5%** | `KAIROS-025` ~ `KAIROS-032` | V5.2–V5.4 纳入质量门禁整改 |
| **P3（低危体验打磨 / 架构冗余清理）** | **2** | **5.9%** | `KAIROS-033` ~ `KAIROS-034` | V5.3–V5.4 渐进式打磨重构 |
| **未验证疑点 (`unverifiedCount`)** | **5** | **独立统计** | `UNVERIFIED-01` ~ `UNVERIFIED-05` | 不计入 P0–P3；V5.4 补齐真机/Staging 验证 |

### 按模块分布

| 所属领域 | 问题数量 | 包含编号 |
|---|---:|---|
| **安全、认证、权限与数据隔离** | 9 | `KAIROS-001`, `002`, `008`, `009`, `010`, `011`, `012`, `013`, `014` |
| **前端协作与能力探测接线** | 2 | `KAIROS-003`, `022` |
| **核心业务算法（CRDT/交通/AA/QR/行程/检索）** | 6 | `KAIROS-004`, `005`, `007`, `018`, `019`, `020`, `025`（计 7 项含 025） |
| **科学模型与天文计算** | 2 | `KAIROS-015`, `016` |
| **全球数据与英文国际化** | 2 | `KAIROS-017`, `029` |
| **UI / 浅色模式 / 移动端 / 无障碍与视觉** | 5 | `KAIROS-006`, `024`, `026`, `027`, `030`, `033`（计 6 项含 033） |
| **性能、PWA 缓存、异步竞争与分享导出** | 4 | `KAIROS-021`, `023`, `028`, `031` |
| **测试体系与架构卫生** | 2 | `KAIROS-032`, `034` |

---

## 二、P0 阻塞级问题详情（7 项）

### KAIROS-001
- **唯一编号**：`KAIROS-001`
- **问题等级**：`P0`
- **所属模块**：`Security / Collaboration API`
- **文件路径及行号**：`worker/collab.js:38-63, 12-25, 261-274`
- **实际证据**：本地 SQLite PoC（`docs/audit-v5/evidence/security-poc-results.json`）：攻击者 Bob 发送 `POST /api/collab/trips` 并携带 `trip.id = 'trip_alice_secret'`，收到 `201 {role:'owner'}`；随后读取 Alice 的私有评论与支出（`200`），恢复版本 1（`200`）窃取 Alice 原始行程 JSON，并将 Alice 从 `trip_members` 中删除（`200`）。
- **复现步骤**：
  1. 用户 A 通过 `POST /api/collab/trips` 创建私有行程 `trip_alice_secret`。
  2. 用户 B 发送 `POST /api/collab/trips`，请求体为 `{ trip: { id: 'trip_alice_secret', name: 'Hijacked' } }`。
  3. 用户 B 调用 `GET /api/collab/trips/trip_alice_secret` 与 `POST .../versions/1/restore`。
- **根本原因**：`INSERT INTO trips ... ON CONFLICT(id) DO UPDATE` 未校验 `trips.owner_id === user.id` 即覆盖既有行程记录，随后 `INSERT OR IGNORE INTO trip_members` 直接授予请求者 `'owner'` 角色。
- **影响范围**：任何已登录用户均可劫持任意已知或可猜测 `tripId` 的行程，窃取私密行程、评论与账单，并反向移除原行程所有者。
- **推荐修复方案**：当 `trips.id` 已存在且 `owner_id !== user.id` 时，`POST /api/collab/trips` 直接返回 `403 Forbidden`（或 `POST` 仅允许服务端生成新 `tripId`，更新操作统一走 `PUT`）。
- **可复用开源资源**：Hono + Zod 请求校验
- **预估改动范围**：小（`worker/collab.js` 内 `<30 LOC`）
- **修复风险**：Low
- **验收标准**：使用他人 `trip.id` 重复调用 `POST /api/collab/trips` 返回 `403 Forbidden`；攻击者不会进入 `trip_members` 且无法读取/修改该行程。
- **证据可信度及验证状态**：高可信度 · 已通过真实 SQLite + Worker PoC 复现确认

### KAIROS-002
- **唯一编号**：`KAIROS-002`
- **问题等级**：`P0`
- **所属模块**：`Security / Collaboration RBAC`
- **文件路径及行号**：`worker/collab.js:66-83, 12-25`
- **实际证据**：本地 SQLite PoC（`docs/audit-v5/evidence/security-poc-results.json`）：Owner Alice 通过 `POST /api/collab/join/:token` 加入自己生成的 `viewer` 邀请码后，`trip_members.role` 从 `'owner'` 被覆写为 `'viewer'`，随后调用 `POST .../invites` 与 `PUT` 均返回 `403`。
- **复现步骤**：
  1. 行程所有者创建一个 `viewer` 邀请链接。
  2. 所有者打开或接受自己的邀请链接（`POST /api/collab/join/:token`）。
  3. 所有者尝试调用 `PUT /api/collab/trips/:id` 或 `POST .../invites`。
- **根本原因**：`ON CONFLICT(trip_id, user_id) DO UPDATE SET role=excluded.role` 会将 `'owner'` 降级覆盖为 `'viewer'`/`'editor'`，且 `getMemberRole()` 先查 `trip_members` 再看 `trips.owner_id`。
- **影响范围**：行程所有者可能因误点自己的只读邀请链接（或遭受 CSRF）而被永久降级为 `viewer`，丧失自身行程的编辑、邀请与管理权。
- **推荐修复方案**：在 `getMemberRole()` 中优先判定 `trip.owner_id === userId` 为 `'owner'`；在 `POST /api/collab/join/:token` 的 `ON CONFLICT` 中增加 `WHERE trip_members.role != 'owner'`（若已是 owner 则跳过角色覆盖）。
- **可复用开源资源**：N/A
- **预估改动范围**：小（`worker/collab.js` 内 `<15 LOC`）
- **修复风险**：Low
- **验收标准**：所有者加入任何权限的邀请链接后仍保留 `'owner'` 角色及 `PUT`/邀请权限；`editor` 无法降级 `owner`。
- **证据可信度及验证状态**：高可信度 · 已通过真实 SQLite + Worker PoC 复现确认

### KAIROS-003
- **唯一编号**：`KAIROS-003`
- **问题等级**：`P0`
- **所属模块**：`Collaboration Frontend Wiring`
- **文件路径及行号**：`js/lazy/collab-space.js:35-40, 66-259`
- **实际证据**：静态扫描与本地 Worker E2E（`evidence/arch-and-tests-results.json`、`evidence/functional-audit-results.json`）：在已登录支持 D1 的 Worker 环境下，`CollabSpace` 页面显示 `'D1 Cloud RBAC'`（`L85-88`），但对 `/api/collab/*` 发起的 HTTP 请求数为 `0`；且全仓对 `BroadcastChannel('kairos_collab')` 的 `.onmessage` / `addEventListener` 订阅数为 `0`。
- **复现步骤**：
  1. 在启用 D1 的 Worker 环境通过 Account Center 登录。
  2. 打开 Trip Planner -> CollabSpace，创建邀请链接、发表评论、发起投票并记账。
  3. 检查浏览器 Network 面板以及第二个已打开的同源标签页。
- **根本原因**：`CollabSpace` 仅将协作数据写入 `localStorage`（`wtg_collab_spaces_v1`），且只调用 `bc.postMessage(...)` 广播却从未注册 `BroadcastChannel` 接收监听，也未接入 `fetch('/api/collab/...')`。
- **影响范围**：尽管文档与 UI 徽章宣称支持 D1 云端 RBAC 协作与多端实时收敛，但多用户云端协作、服务端权限校验、跨设备同步、共享投票/账单乃至同浏览器多标签页自动收敛均在前端完全断线。
- **推荐修复方案**：已登录且后端支持 D1 时将 `CollabSpace` 的创建/邀请/评论/投票/支出动作全部对接 `/api/collab/trips/*`；离线或游客态诚实展示 `'Local Sandbox'` 徽章；增加 `BroadcastChannel` 监听与 CRDT/Yjs 增量合并以实现多标签页自动收敛。
- **可复用开源资源**：Yjs (MIT) + y-indexeddb / BroadcastChannel
- **预估改动范围**：中大型（`js/lazy/collab-space.js` + `trip-planner.js` 约 `~250 LOC`）
- **修复风险**：Medium
- **验收标准**：已登录用户在协作空间的操作持久化至 D1 并在另一浏览器上下文重新加载可见；同浏览器双标签页通过 `BroadcastChannel` 自动收敛状态。
- **证据可信度及验证状态**：高可信度 · 已通过源码核查及本地 Worker E2E 抓包确认

### KAIROS-004
- **唯一编号**：`KAIROS-004`
- **问题等级**：`P0`
- **所属模块**：`Algorithms / CRDT Trip Merge`
- **文件路径及行号**：`js/services/crdt-merge.js:329-377; js/modules/trip-planner.js:417-426`
- **实际证据**：600 次随机属性测试（`evidence/algorithm-audit-results.json`）：`mergeTripDocuments` 在 `440/600` 次试验中破坏交换律（`73.3%` 失败），在 `115/600` 次试验中破坏结合律（`19.2%` 失败）；会将站点按 `id` 字母序重排（`['s_z','s_a'] -> ['s_a','s_z']`）、将跨天移动的站点复制到多天、并复活已删除站点。
- **复现步骤**：
  1. 构造 `day.title` 或 `deletedStopIds` 不同的两个副本 `a, b`，对比 `CRDT.mergeTripDocuments(a, b)` 与 `CRDT.mergeTripDocuments(b, a)`。
  2. 在副本 B 将站点 `s_1` 从 Day 1 移至 Day 2，同时在副本 A 编辑 Day 1。
  3. 副本 A 于 `t=200` 删除 `s_1`，而副本 B 存在 `trip.updatedAt=300` 且 `s_1` 缺失 `st.updatedAt`。
- **根本原因**：`dayMap` 依赖先入为主的 `day.title`（与合并顺序强相关）；站点归属按天存放而非全局 `stopId -> {day, orderRank, updatedAt}` LWW 映射；站点排序直接按字符串 `id` 排序；且 `st.updatedAt || winner.updatedAt` 回退逻辑遇上 `TripPlanner` 未写入 `st.updatedAt` 时导致墓碑失效。
- **影响范围**：多端或离线合并时出现静默行程损坏：游览顺序错乱为 ID 字典序、跨天移动景点变成重复出现、已删景点死灰复燃、不同合并顺序产生不同行程结果。
- **推荐修复方案**：使用真正满足交换律/结合律的 RGA 或分数索引序列 + 全局站点 LWW-Element-Set（强制每个站点与天字段携带 `updatedAt + actorId` 决胜键），或直接引入 `Yjs`（`Y.Doc`/`Y.Array`/`Y.Map`）。
- **可复用开源资源**：Yjs (MIT) 或 Automerge (MIT) + `fast-check` (MIT) 用于 CI 属性测试
- **预估改动范围**：中等（`crdt-merge.js` + `trip-planner.js` 约 `~150-220 LOC`）
- **修复风险**：Medium
- **验收标准**：`1,000+` 次 `fast-check` 随机试验 100% 通过交换律、结合律与幂等律；站点顺序、跨天移动与删除墓碑在任意拓扑合并下完全一致。
- **证据可信度及验证状态**：高可信度 · 已通过 600 次随机属性测试与反例脚本确认

### KAIROS-005
- **唯一编号**：`KAIROS-005`
- **问题等级**：`P0`
- **所属模块**：`Algorithms / Multimodal Transport`
- **文件路径及行号**：`js/services/transport-service.js:112-194, 219-235`
- **实际证据**：生产站实拍截图（`screenshots/prod-12-planner-transport.png`）及算法验证（`evidence/algorithm-audit-results.json`）：上海->东京（`~2074 km ~8h34m`）及北京/台北/首尔->东京返回 `hsr.feasible=true, rail.feasible=true`；首尔->东京返回 `driving.feasible=true`；檀香山->茂宜岛返回 `coach/driving feasible=true`；乌斯怀亚->南极 Brown Bluff 返回 `flight.feasible=true`。
- **复现步骤**：
  1. 在生产站打开 Trip Planner（如 `prod-12-planner-transport.png` 上海->东京或生成北京->东京）。
  2. 切换至“3层交通与枢纽”标签页。
  3. 观察到 `HSR ~8h34m` 与 `RAIL ~20h0m` 被标记为可行并附带官网购票链接。
- **根本原因**：`compareIntercityModes` 仅判断直线距离 `haversineKm <= 2400` 与目的地 `hub.railHub.available`，未检查海洋/海峡阻隔、陆块/铁路网连通性以及出发地铁路可达性；`roadFeasible` 仅判断 `!(hub.ferryLikely && distanceKm > 250)`，放行 `<250 km` 或未标 `ferryLikely` 的跨海自驾。
- **影响范围**：向旅行者输出跨海高铁、跨洋自驾、南极常规商业直飞等荒谬方案，直接损害平台地理专业可信度。
- **推荐修复方案**：在 `hubs.json` 中建立连通陆块/岛屿/海峡图（或基于 Natural Earth 陆地多边形 + Turf.js 做跨海段检测），并在标定自驾/大巴可行前验证 OSRM/Valhalla 路网连通性。
- **可复用开源资源**：Turf.js (MIT) + Natural Earth 陆地多边形 + OSRM / Valhalla (MIT)
- **预估改动范围**：中等（`transport-service.js` + `scripts/build-transport-hubs.js` 约 `~120 LOC`）
- **修复风险**：Low-Medium
- **验收标准**：北京/上海/首尔/台北->东京、檀香山->茂宜岛及无固定桥隧的跨海岛屿对将 HSR/Rail/Driving/Coach 判定为不可达；南极行程显示探险船而非商业民航。
- **证据可信度及验证状态**：高可信度 · 已通过生产站截图与全量算法脚本双重证实

### KAIROS-006
- **唯一编号**：`KAIROS-006`
- **问题等级**：`P0`
- **所属模块**：`UI/UX / Light Theme Lazy Modals`
- **文件路径及行号**：`css/upgrades.css:2451-2460` vs `css/styles.css:1-86`
- **实际证据**：生产站实拍截图（`screenshots/prod-14-share-center.png`、`prod-15-help-center.png`、`prod-17-dest-compare.png`）：`.modal-card` 使用 `background: var(--bg-panel, rgba(16, 22, 34, 0.96))`，而 `--bg-panel` 在 `styles.css` 中从未定义，导致浅色模式下深色 `#18181B` 文本直接渲染在深海蓝 `rgba(16,22,34,0.96)` 背景上（对比度约 `1.1:1`）。
- **复现步骤**：
  1. 在生产站切换为 Daylight（浅色）主题。
  2. 点击帮助中心（`?`）、分享中心、目的地对比或更多导出弹窗。
  3. 观察弹窗标题、正文与表格文字完全黑底黑字不可辨认。
- **根本原因**：`css/upgrades.css:2455` 引用了不存在的 CSS 变量 `--bg-panel`，当 `html[data-theme='light']` 将 `--text-primary` 切换为 `#18181B` 时背景仍回退至深色默认色值。
- **影响范围**：V5 四大核心弹窗（帮助中心、分享中心、目的地对比、行程导出）在浅色主题下完全无法阅读。
- **推荐修复方案**：将 `css/upgrades.css:2455` 的 `var(--bg-panel, ...)` 替换为 `var(--bg-solid)`（或在 `:root` 与 `html[data-theme='light']` 显式定义 `--bg-panel`），并在 CI 中增加深浅双主题弹窗对比度门禁。
- **可复用开源资源**：`axe-core` (MPL-2.0) 自动对比度检测
- **预估改动范围**：极小（`css/upgrades.css` + `css/styles.css` `2-5 LOC`）
- **修复风险**：Low
- **验收标准**：所有 `.modal-card` 弹窗在深色与浅色主题下文本对比度均 `>= 4.5:1`，并通过 `axe-core` 与截图复核。
- **证据可信度及验证状态**：高可信度 · 已通过生产站实拍截图与 CSS 变量源码核验确认

### KAIROS-007
- **唯一编号**：`KAIROS-007`
- **问题等级**：`P0`
- **所属模块**：`Algorithms / Local QR Code Generator`
- **文件路径及行号**：`js/services/qr-code.js:158-165, 173-192`
- **实际证据**：ISO/IEC 18004 位级解码与 Reed-Solomon 校验验证（`evidence/algorithm-audit-results.json`）：V8（`160` 字节 URL）产生 `47` 个 RS 校验子错误，V10（`320` 字节 URL 及真实行程分享链接）产生 `72` 个 RS 校验子错误，解码输出完全乱码且不可识别。
- **复现步骤**：
  1. 在 Share Center 生成超过 `134` 字节的链接（如 `?trip=...` 或长参数链接，对应 QR Version 7–10）。
  2. 检视生成的定位/校正/版本信息模块并运行标准 ISO/IEC 18004 RS 解码器。
  3. 发现缺失多点校正图形与 6×3 版本信息块。
- **根本原因**：对于 `ver >= 2`，`qr-code.js:158-165` 仅在 `(size-7, size-7)` 绘制 1 个校正图形而非完整 ISO 校正网格（V7–V10 缺失 5 个），且完全遗漏 `ver >= 7` 的版本信息块（Version Information），破坏了蛇形数据掩码映射。
- **影响范围**：所有用于行程分享（`?trip=...`）及较长深层链接的二维码均无法被任何手机扫码器识别。
- **推荐修复方案**：使用成熟的 MIT 开源库（如 Nayuki QR Code Generator 或 `qrcode-generator`）替换自研编码器，或补全 ISO/IEC 18004 校正图形坐标表、Golay 版本信息及格式信息副本 2。
- **可复用开源资源**：Nayuki QR Code Generator (MIT) 或 `qrcode-generator` (MIT)
- **预估改动范围**：小（`js/services/qr-code.js` 替换约 `~100-150 LOC`）
- **修复风险**：Low
- **验收标准**：V1–V20 范围的 ASCII、中文 UTF-8 与真实行程分享链接生成的 SVG 经独立解码器（`jsqr` / `zbar`）100% 精确还原。
- **证据可信度及验证状态**：高可信度 · 已通过 ISO/IEC 18004 位级解码与 RS 校验子测试确认

---

## 三、P1 高危问题详情（17 项）

### KAIROS-008
- **唯一编号**：`KAIROS-008`
- **问题等级**：`P1`
- **所属模块**：`Security / Public Trip Privacy & Cross-Trip Voting`
- **文件路径及行号**：`worker/collab.js:23, 94-121, 192-230`
- **实际证据**：本地 SQLite PoC（`evidence/security-poc-results.json`）：未登录请求 `GET /api/collab/trips/trip_pub_1` 泄露了 `alice.pii@example.com`、全部账单、评论、投票及明细；非成员 Carol 可成功发表评论（`201`）、投票（`200`），甚至借公开行程路径对私有行程 `trip_priv_target` 的投票进行跨行程投票（`200`）。
- **复现步骤**：
  1. 将某个行程设为 `access_mode='public'`。
  2. 不带 Cookie 调用 `GET /api/collab/trips/:id`。
  3. 以另一个已登录非成员身份调用 `POST /api/collab/trips/:pubId/polls/:privPollId/vote`。
- **根本原因**：`GET` 查询直接 `SELECT u.email` 并向公开访客返回完整 `expenses`/`votes`；`POST .../comments` 与 `POST .../polls/:pollId/vote` 仅检查 `if (!user)`，缺失成员权限校验及 `poll.trip_id === tripId` 归属校验。
- **影响范围**：公开行程暴露用户邮箱与私人消费明细，且任何登录用户可刷评论或篡改私有行程投票结果。
- **推荐修复方案**：对非成员的 `access_mode === 'public'` 响应剥离 `u.email` 与 `expenses`（以及敏感投票人 ID）；评论与投票强制校验 `trip_members` 成员身份并在 SQL 中限定 `WHERE id = ? AND trip_id = ?`。
- **可复用开源资源**：N/A
- **预估改动范围**：小（`worker/collab.js` 内 `~30 LOC`）
- **修复风险**：Low
- **验收标准**：公开行程 `GET` 对非成员不返回 `email` 与 `expenses`；非成员无法评论（除非显式策略允许）且绝对无法跨行程投票。
- **证据可信度及验证状态**：高可信度 · 已通过本地 SQLite PoC 复现确认

### KAIROS-009
- **唯一编号**：`KAIROS-009`
- **问题等级**：`P1`
- **所属模块**：`Security / D1 Concurrency & Version Restore`
- **文件路径及行号**：`worker/collab.js:124-140, 261-274; js/services/storage-db.js:479-484`
- **实际证据**：本地 SQLite PoC（`evidence/security-poc-results.json`、`evidence/algorithm-audit-results.json`）：携带过期 `baseVersion: 1` 对 `version: 2` 发起 `PUT` 返回 `200 {version: 3}` 直接覆盖 Alice 的更新；`StorageDB.restoreLatestBackupSnapshot` 使用 `preserveTimestamp: true` 恢复后，在后续 CRDT 同步中 `"Version 1 (Restored)"` 被 `"Version 2"` 覆盖丢失。
- **复现步骤**：
  1. Alice 更新行程（`version: 2`）。
  2. Bob 使用旧版本 `version: 1` 发起 `PUT` -> 成功升至 `version: 3`，静默覆盖 Alice。
  3. 恢复备份快照后执行 `CRDT.mergeUserProfiles`。
- **根本原因**：`PUT` 执行 `UPDATE trips ... WHERE id = ?` 忽略 `version` 乐观锁；`versions/:ver/restore` 未插入新的 `trip_versions` 记录也未推进 `data_json.updatedAt/clock`。
- **影响范围**：多人并发编辑产生静默丢更（Lost Update），且版本回滚或本地备份恢复在下次同步后失效。
- **推荐修复方案**：`PUT` 强制校验 `baseVersion` 并执行 `WHERE id = ? AND version = ?`，当影响行数为 `0` 时返回 `409 Conflict`；版本恢复时插入新版本快照并推进 `updatedAt`/`clock`。
- **可复用开源资源**：N/A
- **预估改动范围**：小（`worker/collab.js` + `storage-db.js` 约 `~35 LOC`）
- **修复风险**：Low
- **验收标准**：过期 `PUT` 返回 `409 Conflict` 并附最新服务端状态；已恢复的历史版本在 CRDT 同步后不会回退。
- **证据可信度及验证状态**：高可信度 · 已通过本地 SQLite PoC 与 CRDT 测试确认

### KAIROS-010
- **唯一编号**：`KAIROS-010`
- **问题等级**：`P1`
- **所属模块**：`Security / CSRF & CORS`
- **文件路径及行号**：`worker/collab.js:27-36; worker/auth.js:94-117; worker/index.js:9-18, 67-68`
- **实际证据**：本地 PoC（`evidence/security-poc-results.json`）：携带 `Origin: https://evil.attacker` 发起 `POST /api/collab/trips` 返回 `201`；不带 `Origin` 和 `Referer` 发起 `POST /api/auth/logout` 返回 `200`；`OPTIONS` 与 `/api/profile` 均返回 `Access-Control-Allow-Origin: *`。
- **复现步骤**：
  1. 携带会话 Cookie 与 `Origin: https://evil.attacker` 请求 `POST /api/collab/trips`。
  2. 携带会话 Cookie 且省略 `Origin`/`Referer` 请求 `POST /api/auth/logout`。
- **根本原因**：`handleCollabRequest` 完全未调用 `verifyCsrf(request)`；`verifyCsrf` 在 `Origin` 与 `Referer` 均缺失时默认放行返回 `true`；`worker/index.js` 在 `OPTIONS` 和 `jsonResponse` 全局下发通配 `Access-Control-Allow-Origin: *`。
- **影响范围**：全部协作写接口（新建/覆盖行程、邀请/踢人、评论/账单、版本回滚）暴露于 CSRF 攻击，敏感同步接口 CORS 策略过宽。
- **推荐修复方案**：在 `/api/collab/*`、`/api/profile`、`/api/photos` 全部写操作强制执行 `verifyCsrf`；对基于 Cookie 鉴权的写请求要求同源 `Origin` 或 `Sec-Fetch-Site: same-origin`；收敛账户/协作/资料接口的 CORS 头。
- **可复用开源资源**：Hono CSRF middleware (MIT)
- **预估改动范围**：小（`worker/` 内 `~30 LOC`）
- **修复风险**：Low
- **验收标准**：跨源或缺失源头的 Cookie 鉴权 `POST/PUT/PATCH/DELETE` 请求访问 `/api/auth/*` 与 `/api/collab/*` 均返回 `403`。
- **证据可信度及验证状态**：高可信度 · 已通过本地 Worker PoC 复现确认

### KAIROS-011
- **唯一编号**：`KAIROS-011`
- **问题等级**：`P1`
- **所属模块**：`Security / Auth Session, OAuth & Account Lifecycle`
- **文件路径及行号**：`worker/auth.js:119-133, 345, 394-523, 567, 658-664`
- **实际证据**：本地 SQLite PoC（`evidence/security-poc-results.json`）：(1) 调用 `POST /api/auth/reset-password` 后旧会话 Cookie 依然返回 `200 authenticated:true`；(2) 连续 15 次 `request-reset` 未触发任何 `429`；(3) 从同一 IP 登录攻击者自己的账号可清除受害者的失败计数，完成 27 次暴力猜测零阻断；(4) Google OAuth 接受 `verified_email:false` 且保留此前预注册密码；(5) `DELETE /api/account` 在 `PRAGMA foreign_keys=OFF` 下遗留孤儿 `trips`/`comments`/`expenses`；(6) `avatarUrl` 接受 `data:image/svg+xml`。
- **复现步骤**：
  1. Alice 登录后重置密码，重放旧 `kairos_session` Cookie -> 仍返回 `200`。
  2. 对受害者失败 9 次后登录攻击者自己的账号，循环重复 -> 27 次猜测零 `429`。
  3. 预注册未验证邮箱后触发 OAuth 登录 -> 旧密码仍可登录。
- **根本原因**：重置密码缺少 `DELETE FROM sessions WHERE user_id=?`；`clearAuthFailures(ip)` 按 IP 全局清零且限流状态存在单 Isolate 内存 `Map`；OAuth 未校验 `verified_email` 且未清除未验证密码；D1 未逐连接启用外键及完整级联删除；`avatarUrl` 放行 `data:image/svg+xml`。
- **影响范围**：被盗会话在改密后持续有效、暴力破解限流可被单机绕过、OAuth 存在账户预占风险、删号留存 PII 残余、SVG 头像存在潜在存储型 XSS 风险。
- **推荐修复方案**：改密时清除该用户全部 `sessions`；采用 `(ip, email)` 维度并通过 Cloudflare Rate Limiting / Turnstile / Durable Objects 持久化计数且仅清除成功账号自身计数；OAuth 强制校验 `verified_email===true` 并清理未验证旧密码；`DELETE /api/account` 显式批量清空所有关联表；禁止 `image/svg+xml` 头像。
- **可复用开源资源**：Cloudflare Turnstile / Workers Rate Limiting API + Zod
- **预估改动范围**：中等（`worker/auth.js` 内 `~120 LOC`）
- **修复风险**：Medium
- **验收标准**：改密吊销所有旧会话；同邮箱连续 10 次失败锁定不受其他账号登录影响；OAuth 拒绝未验证邮箱；删号后全表 0 残留；SVG 头像返回 `400`。
- **证据可信度及验证状态**：高可信度 · 已通过本地 SQLite + Worker PoC 全部复现确认

### KAIROS-012
- **唯一编号**：`KAIROS-012`
- **问题等级**：`P1`
- **所属模块**：`Security / Cross-User Local Data Isolation`
- **文件路径及行号**：`js/lazy/account-center.js:245-249; js/services/auth-service.js:63-73; js/services/storage-db.js:522-539; worker/auth.js:598-634`
- **实际证据**：本地 PoC（`evidence/security-poc-results.json`）：用户 A 登出后（`wipeAccountLocal: false`），用户 B 在同一浏览器登录，可直接读取用户 A 留在 `settings` 中的 `cloudSyncPassphrase`，且 `migrateLocalArchive()` 将用户 A 的本地 `travelStatus` 与 `trips` 迁移进用户 B 的云端账号。
- **复现步骤**：
  1. 以用户 A 在本地保存旅行档案与 `cloudSyncPassphrase`，然后登出。
  2. 在同一浏览器登录用户 B 并触发本地档案迁移。
- **根本原因**：IndexedDB（`WorldTravelGlobeDB`）与 `localStorage` 键（`wtg_collab_spaces_v1`、`wtg_favorites_v1`）未按 `userId` 命名空间隔离；`logout()` 传参 `wipeAccountLocal: false`；`deleteAccount()` 未清理本地数据；`wipeAllUserData(true)` 跳过了 `settings` 与 `localStorage`。
- **影响范围**：共享设备或家庭共用浏览器场景下发生跨用户隐私泄露（同步口令与行程）及数据污染。
- **推荐修复方案**：按 `userId`（及独立 `guest` 工作区）隔离 IndexedDB/localStorage 数据；登出与销号时清理会话级本地凭据；当 `wtg_active_user_id` 变更时提示确认而非静默迁移上一账号遗留档案。
- **可复用开源资源**：Dexie.js（Apache-2.0，仓内已集成）
- **预估改动范围**：中等（`storage-db.js`、`auth-service.js`、`account-center.js` 约 `~100 LOC`）
- **修复风险**：Medium
- **验收标准**：用户 B 登录后无法读取用户 A 的 `cloudSyncPassphrase`、行程或足迹，`migrateLocalArchive()` 仅迁移访客或当前账号数据。
- **证据可信度及验证状态**：高可信度 · 已通过本地 PoC 复现确认

### KAIROS-013
- **唯一编号**：`KAIROS-013`
- **问题等级**：`P1`
- **所属模块**：`Security / Export Injection & XSS`
- **文件路径及行号**：`js/lazy/export-service.js:19-23, 199-208, 233-245; js/modules/trip-planner.js:532-545; js/lazy/expense-splitter.js:84-89`
- **实际证据**：可执行 PoC（`evidence/security-poc-results.json`）：载荷 `=CMD|' /C calc'!A0` 在 `ExportService.toCSV`、`TripPlanner.tripToCsv`、`ExpenseSplitter.settlementsToCsv` 三个导出器中均未中和前缀；`s.startTime: '<img src=x onerror=alert(1)>'` 在 `ExportService.toPrintableHtml()`（`window.open().document.write`）中原样渲染执行。
- **复现步骤**：
  1. 创建标题含 `=1+1` 或站点时间含 `<img src=x onerror=alert(1)>` 的行程/账单。
  2. 分别导出 CSV 与可打印 HTML（`pdf`）。
- **根本原因**：CSV 单元格转义函数仅处理逗号/引号/换行，未中和公式前缀（`=`、`+`、`-`、`@`、`\t`、`\r`）；`toPrintableHtml` 遗漏对 `s.startTime` 调用 `escXml()`。
- **影响范围**：导出 CSV 在 Excel/LibreOffice 打开时触发公式/DDE 注入；可打印 HTML 弹窗及导出 `.html` 文件存在同源 DOM XSS。
- **推荐修复方案**：在 3 个 CSV 导出器中对匹配 `/^[\s\t\r]*[=+\-@]/` 的单元格前置单引号 `'` 再加引号；在 `toPrintableHtml()` 中对 `s.startTime` 补充 `escXml()` 转义。
- **可复用开源资源**：N/A
- **预估改动范围**：极小（3 个文件共 `~15 LOC`）
- **修复风险**：Low
- **验收标准**：公式前缀单元格导出均以 `'` 开头转义；HTML 导出对包含 `startTime` 在内的全部字段转义 `<`、`>`、`"`、`&`。
- **证据可信度及验证状态**：高可信度 · 已通过本地执行 PoC 确认

### KAIROS-014
- **唯一编号**：`KAIROS-014`
- **问题等级**：`P1`
- **所属模块**：`Security / Worker Proxy, R2 Upload, Sync & CSP`
- **文件路径及行号**：`worker/index.js:52-58, 131-198, 236-243, 346-418, 585-604`
- **实际证据**：本地 Worker PoC 与线上响应头探测（`evidence/security-poc-results.json`）：`/api/img` 原样透传 `image/svg+xml` 且无 `CSP: sandbox` 或 `nosniff`；`/api/tile` 原样透传 `text/html`；`/api/photos` 接受未登录请求及 `syncKey: '../../etc/passwd'` 写入 `photos/../../etc/passwd/...` 且无魔数/大小/EXIF 校验；`DELETE /api/profile` 遗留 `profile_backups`；`/` 仅设置 `CSP: frame-ancestors *`。
- **复现步骤**：
  1. 请求 `/api/img?url=https://upload.wikimedia.org/test.svg` -> 在 Worker 同源渲染内联 SVG。
  2. 未登录带 `X-Sync-Key: ../../etc/passwd` 发送 `POST /api/photos`。
  3. 执行 `curl -I https://world-travel-globe.globe-app.workers.dev/` 检查 CSP。
- **根本原因**：`/api/img`、`/api/tile`、`/api/commons`、`/api/wikidata`、`/api/wikipedia` 未校验上游 `Content-Type`；`/api/photos` 缺失鉴权、Key 正则清洗及文件魔数校验；`/api/profile` 存在 `X-Base-Updated-At: 0` 锁绕过且删号漏删 `profile_backups`；首页 CSP 允许任意站点嵌入且缺少 `script-src`/`object-src`。
- **影响范围**：同源上游 SVG/HTML 反射/存储型 XSS、R2 启用后存在未授权滥用与路径穿越风险、以及账号/协作页面点击劫持风险。
- **推荐修复方案**：`/api/img` 对 SVG 强制添加 `CSP: sandbox` + `nosniff`（或直接禁用 SVG）；代理路由严格校检预期光栅图像/JSON MIME；`/api/photos` 强制登录鉴权 + 六角字符 Key 清洗 + 魔数/5MB 限制；首页非 `?embed=` 时收敛 `frame-ancestors 'self'` 并补全 CSP 指令。
- **可复用开源资源**：N/A
- **预估改动范围**：中等（`worker/index.js` 内 `~80 LOC`）
- **修复风险**：Medium
- **验收标准**：代理 SVG 携带 `sandbox` 与 `nosniff`；`/api/tile` 拒绝非图片响应；`/api/photos` 拒绝未鉴权/非法 Key/非图片上传；默认首页拒绝跨源 iframe 嵌入。
- **证据可信度及验证状态**：高可信度 · 已通过线上响应头与本地 Worker PoC 确认

### KAIROS-015
- **唯一编号**：`KAIROS-015`
- **问题等级**：`P1`
- **所属模块**：`Science / Phenology Calibration & Validation`
- **文件路径及行号**：`scripts/validate-phenology.js:25-53, 114-121; js/modules/phenology-engine.js:243-245, 384, 442-477`
- **实际证据**：独立统计复现审计（`evidence/science-audit-results.json`）：全部 11 个秋叶城市与 13 个樱花城市的 `fitYearsDoy`/`holdoutYearsDoy` 均由 3 套固定偏移模板配对单一静态温度常年均值合成；各城市拟合年均值基线 MAE 为 `2.09d`（樱花）/ `2.22d`（秋叶），优于 KAIROS 回归模型（`2.89d` / `4.84d`）及 LOOCV（`3.20d` / `5.85d`）。
- **复现步骤**：
  1. 检查 `scripts/validate-phenology.js` 中的 `BLOSSOM_BENCHMARKS` 与 `AUTUMN_BENCHMARKS`。
  2. 运行科学对照脚本对比 OLS、LOOCV 与城市历史均值基线 MAE/RMSE。
- **根本原因**：验证数据系围绕静态气候均值合成的扰动模板；`winterMeanC` 特征未投入使用；特征权重（`0.45`、`-4.8`、`5.2`、`-0.0045`、`-0.35`）系预先拍定；未涵盖任何南半球或热带城市；Tier B 对全球统配硬编码 `±8d` 与 `16°C`/`10°C` 峰值。
- **影响范围**：将合成模板误差包装为实测多年留出法精度（`2.89d`/`4.84d`），误导用户；热带与高纬度目的地物候窗口失真。
- **推荐修复方案**：引入带明确文献来源的真实多年物候观测集（如 JMA 樱花档案 / USA-NPN / PEP725）与逐年 ERA5 历史气温，对比“城市历史均值基线”，在未超越基线前诚实降级标注为气候统计学估算，并按纬度/气候带隔离热带与极地模型。
- **可复用开源资源**：Open-Meteo ERA5 Historical API (CC BY 4.0) + JMA / USA-NPN / PEP725 公开物候数据集
- **预估改动范围**：中大型（`~200 LOC` + 基准数据集重建）
- **修复风险**：Low
- **验收标准**：验证脚本使用可溯源真实多年观测及逐年气候预测因子，诚实报告模型相对城市历史均值基线的误差表现。
- **证据可信度及验证状态**：高可信度 · 已通过统计脚本与源码完全复现确认

### KAIROS-016
- **唯一编号**：`KAIROS-016`
- **问题等级**：`P1`
- **所属模块**：`Science / Astronomy & Terrain Horizon`
- **文件路径及行号**：`js/modules/photo-simulator.js:130, 501, 512; js/modules/terrain-3d.js:182, 194; vendor/suncalc.min.js:61`
- **实际证据**：14 场景 `astronomy-engine` 对照实验（`evidence/science-audit-results.json`）：雷克雅未克 `2026-06-21` 日落因 `SunCalc.getTimes` 缺失 `utcOffset` 跳变 `+1440.4 min`（整整 `24 小时`误差）；乌斯怀亚 `2026-12-21` `astroDusk=null` 与普通无月升日均被渲染为 `'Polar Day/Night'`；SunCalc 的 `astroRefraction` 在 `h=0` 处截断导致夜间 `+0.12°` 至 `+0.28°` 偏差；`terrain-3d.js` 使平地 `0°` 日出/日落系统性偏移 `+2m/-3m`。
- **复现步骤**：
  1. 在不传 `utcOffset` 的情况下对雷克雅未克 `2026-06-21` 调用 `SunCalc.getTimes`。
  2. 对乌斯怀亚 12 月 21 日 `astroDusk` 或特罗姆瑟 12 月 21 日 `moonTimes.rise` 调用 `formatTimeInOffset(null)`。
- **根本原因**：`PhotoSimulator` 未传入 `SunCalc` 所需的 `utcOffset`；`formatTimeInOffset()` 武断将一切非 Date 结果标为 `'Polar Day/Night'`；`SunCalc` 对 `h<0` 应用正向地平折射；`terrain-3d.js` 在粗糙的 `5° × 28` 步 `z11/z12` DEM 网格上使用 `pos.altitude > Math.max(-0.833, obsDeg)`。
- **影响范围**：亚极地夏季出现整天（24h）日落跳变、非极昼日期错误提示“极昼/极夜”、以及地形遮挡分析在平坦地面产生 `+2m/-3m` 偏差。
- **推荐修复方案**：全面统一至仓内已集成的 `vendor/astronomy.browser.min.js`（或补齐 `utcOffset`）；明确区分 `'今日无升落'`、`'连续暮光'` 与 `'极昼/极夜'`；当 `obsDeg <= -0.833°` 时修正 `terrain-3d.js` 阈值为 `-0.833°`。
- **可复用开源资源**：Astronomy Engine（MIT，已预置于 `vendor/astronomy.browser.min.js`）
- **预估改动范围**：中等（`photo-simulator.js` + `terrain-3d.js` 约 `~80-120 LOC`）
- **修复风险**：Low
- **验收标准**：14 场景对照 `Astronomy Engine` 误差 `<0.05°` 且时间误差 `<1 min`；雷克雅未克夏至日落定位正确日历日；乌斯怀亚连续天文暮光提示准确。
- **证据可信度及验证状态**：高可信度 · 已通过 14 场景天文对照实验确认

### KAIROS-017
- **唯一编号**：`KAIROS-017`
- **问题等级**：`P1`
- **所属模块**：`Global Data / Transport Hubs Dataset`
- **文件路径及行号**：`scripts/build-transport-hubs.js; data/transport/hubs.json`
- **实际证据**：722 城全量机器校验（`evidence/data-audit-results.json`）：`97/722 (13.4%)` 城市主机场落在邻国/跨国位置（如亚庇->`CEB` 995km 而非 `BKI`、长白山->`VVO` 368km、霞浦->`TPE` 187km、安塔利亚->`JTR` 469km、堪察加->`CTS` 1695km）；`251/722` 机场距离 `>300km`；`27` 个无铁路岛屿/高原目的地（济州岛、冲绳、斯瓦尔巴、罗弗敦、特内里费、马略卡、珠峰阿里）误标 `railHub.available: true`；`17+` 乡村/岛屿小镇误标具备 `metro` 地铁接驳。
- **复现步骤**：
  1. 对 `data/transport/hubs.json` 全量运行机场国家码对比、距离检查及岛屿铁路规则审计。
- **根本原因**：`scripts/build-transport-hubs.js` 仅内嵌了 185 座机场的硬编码精简列表而非完整 OurAirports `airports.csv`，且按国家级别（`HSR_COUNTRIES`）一刀切设置 `railHub.available`，并仅凭 `primary.distanceKm <= 65` 推断存在地铁。
- **影响范围**：Trip Planner 2.0 为大量全球目的地展示错误的跨国机场、不存在的岛屿高铁以及虚构的乡村地铁接驳。
- **推荐修复方案**：基于完整 OurAirports `airports.csv`（约 4,000+ `scheduled_service='yes'` 定期航班机场）重建 `hubs.json`，优先匹配同国同陆块/同岛机场，并基于真实站点/地铁清单标注 `railHub` 与 `metro`。
- **可复用开源资源**：OurAirports Open CSV（`airports.csv`, Public Domain）+ OpenStreetMap 铁路/岛屿标签
- **预估改动范围**：中等（重建 `scripts/build-transport-hubs.js` 与 `hubs.json`）
- **修复风险**：Low
- **验收标准**：当目的地所在国存在定期商业机场时，0 个商业目的地映射至 `>200 km` 外的外国机场；0 个无固定桥隧的岛屿标注 `railHub.available: true`。
- **证据可信度及验证状态**：高可信度 · 已通过 722 城全量机器审计确认

### KAIROS-018
- **唯一编号**：`KAIROS-018`
- **问题等级**：`P1`
- **所属模块**：`Algorithms / AA Expense Splitter`
- **文件路径及行号**：`js/lazy/expense-splitter.js:11, 20-75; js/lazy/collab-space.js:161, 176`
- **实际证据**：反例测试集（`evidence/algorithm-audit-results.json`）：(1) `100/3` 产生净额总和 `+0.01` 且转账总计仅 `66.66`；(2) `0.03/3` 返回 `[]`（0 笔转账，丢弃 1 分钱债务）；(3) 5 人反例 `A:+60, B:-60, C:+50, D:+20, E:-70` 贪心法输出 4 笔转账，而最优解仅需 3 笔（`B->A:60, E->C:50, E->D:20`）；(4) 自定义分摊总额不符、重复参与人、多币种汇率、`<=0` 退款及 `settled` 标记均处理错误；(5) UI 与文档宣称 `'最优结算'` / `'Minimum-Transfer'`。
- **复现步骤**：
  1. 分别以 `100/3`、`0.03/3`、`[A:130,C:120,D:90,B:10]` 或 `JPY`+`CNY` 混合账单调用 `ExpenseSplitter.computeSettlements`。
- **根本原因**：逐笔使用浮点 `round2` 且无分位余数分配；忽略 `<= 0.01` 余额；未读取 `currency`/`amountRmb`/`settled`；未校验参与人去重与自定义分摊和；采用简单贪心匹配却标注为全局最少转账最优解。
- **影响范围**：账务出现 1 分钱漂移与微额债务丢失、跨币种分摊算错人民币总额、以及名不副实的最优性宣传。
- **推荐修复方案**：严格采用整数最小货币单位（`cents` 分）与确定性最大余数法分配确保 `sum(net) === 0`；接入 `amountRmb`/汇率归一化；校验自定义比例与去重；对 `N<=12` 用 DP/子集和求解真·最少转账次数（或诚实改名为 `'简化结算方案'`）。
- **可复用开源资源**：Dinero.js (MIT) 整数分位模式 / 整数分子集和 DP 求解器
- **预估改动范围**：中小（`expense-splitter.js` + `collab-space.js` 约 `~100 LOC`）
- **修复风险**：Low
- **验收标准**：任意输入满足严格分位守恒（`sum(net) === 0`），支持多币种汇率与自定义分摊校验，5 人反例输出 3 笔最优转账。
- **证据可信度及验证状态**：高可信度 · 已通过数学反例与算法脚本确认

### KAIROS-019
- **唯一编号**：`KAIROS-019`
- **问题等级**：`P1`
- **所属模块**：`Algorithms / QR Format Info & Truncation`
- **文件路径及行号**：`js/services/qr-code.js:85, 204-205, 216; js/lazy/share-center.js:100`
- **实际证据**：位级二维码审计（`evidence/algorithm-audit-results.json`）：`qr-code.js:204` 误写为 `if (i < 8)` 而非 `if (i < 7)`，导致 V1–V10 全部版本的格式信息副本 #2 损坏；`bytes.slice(0, dataCap - 3)`（`L85`）对超过 271 字节的链接（如 2,465 字节 `?trip=` 链接）静默截断；`quiet = 2` 违反 ISO 4 模块静区规范；`share-center.js:100` 传入裸数字 `136` 而非 `{ size: 136 }`。
- **复现步骤**：
  1. 检查 `QRCodeService.renderSvg` 生成的任意版本格式信息副本 #2 坐标 `(8, size-8)` 与 `(size-8, 8)`。
  2. 向 `renderSvg` 传入 2,465 字节的行程分享 URL。
- **根本原因**：条件边界 `i < 8` 越位覆盖了暗模块 `(size-8, 8)` 并错置第 7 位至 `(8, size-8)`；编码器仅支持 V1–V10 且静默截断超长字节；`ShareCenter` 传参格式错误导致默认使用 `180px` 尺寸。
- **影响范围**：削弱所有二维码纠错冗余度、静默截断毁坏长 `?trip=` 分享二维码、并导致 Share Center 二维码在界面中渲染过大（`prod-14-share-center.png`）。
- **推荐修复方案**：集成支持 V1–V40 与 4 模块静区的标准 MIT 二维码库；修正 `ShareCenter` 传参为 `{ size: 136 }`；对超长 `?trip=` 链接先压缩（`lz-string`）或走服务端短链，若仍超限则明确报错提示而非静默截断。
- **可复用开源资源**：Nayuki QR Code Generator (MIT) + `lz-string` (MIT) / 服务端短链
- **预估改动范围**：小（`~100 LOC`）
- **修复风险**：Low
- **验收标准**：格式信息副本 #1 与 #2 在全版本符合 ISO 18004；具备 4 模块静区；超长输入支持至 V40 或给出明确超限提示；Share Center 二维码正确渲染为 136px。
- **证据可信度及验证状态**：高可信度 · 已通过 ISO 解码与生产截图确认

### KAIROS-020
- **唯一编号**：`KAIROS-020`
- **问题等级**：`P1`
- **所属模块**：`Algorithms / Trip Planner & Routing`
- **文件路径及行号**：`js/modules/trip-planner.js:57-73, 151-195, 205-290, 308, 381-466; js/services/transport-service.js:60-87; js/services/routing-service.js:154-162`
- **实际证据**：算法全量测试（`evidence/algorithm-audit-results.json`）：`5/10` 个 `CITY_ALIASES` 指向错误/缺失 ID（`paris`、`london`、`new york`、`zurich`、`reykjavik`）；`resetDraftForNewTrip` 漏重置 9 个草稿字段；多城 `generateTripPlan` 丢弃城际段并将相距 `2,111 km` 的站点混编进同一天；`detectTripConflicts` 读取已废弃的 `trip.mode !== 'flight'`；`twoOpt` 后执行 `orderDayStopsByLight` 使里程翻倍（`22.92->45.84 km`）；`nearestNeighborSort` 遇缺失坐标抛出 `TypeError`；OSRM 故障统一返回 `crossSea: true`；东京->檀香山大圆弧跨经度跳变 `357.8°`。
- **复现步骤**：
  1. 在 `TripPlanner.resolveDestinationMatches` 中查询 `'Paris'` 或 `'Zurich'`。
  2. 生成 4 天 `[北京, 东京]` 多城行程或单日 94km 步行行程。
  3. 当 OSRM 不可用时对北京市内两景点调用 `RoutingService.routeSegment`。
- **根本原因**：`CITY_ALIASES` 硬编码残留 V3/V4 旧 ID；草稿重置清单不全；`generateTripPlan` 仅按单城模型排程；冲突检测字段名 `trip.mode` 与 `trip.intercityMode` 失配；大圆弧未做 `±180°` 日界线切分；OSRM 异常兜底不区分路网错误与跨海状态。
- **影响范围**：主流国际城市别名失效、新建行程串用旧草稿配置、多城行程缺少交通衔接、94km 步行零冲突告警、市内路线报错却提示“跨海”。
- **推荐修复方案**：用单测校验 `CITY_ALIASES` 全量存在于 `DESTINATIONS` 并辅以 Fuse/MiniSearch 模糊兜底；完整重置草稿字段；多城行程自动插入城际过渡日/段；冲突检测改读 `trip.intercityMode`；用 Turf 切分跨越日界线的 GeoJSON；区分 `routeUnavailable` 与 `crossSea` 并防护空坐标。
- **可复用开源资源**：Turf.js (`@turf/great-circle`, MIT) + Fuse.js（仓内已集成）
- **预估改动范围**：中等（`trip-planner.js`、`transport-service.js`、`routing-service.js` 约 `~180 LOC`）
- **修复风险**：Medium
- **验收标准**：全部城市别名精确命中有效 ID；多城行程包含城际交通段；94km 步行触发冲突告警；OSRM 超时返回 `routingError` 而非 `crossSea: true`。
- **证据可信度及验证状态**：高可信度 · 已通过算法自动化测试与源码核查确认

### KAIROS-021
- **唯一编号**：`KAIROS-021`
- **问题等级**：`P1`
- **所属模块**：`Share Center, Deep Links & Export Formats`
- **文件路径及行号**：`js/app.js:2396-2416; js/lazy/share-center.js:51-65, 116, 200; js/lazy/export-service.js:250-350`
- **实际证据**：静态接线核查与本地 E2E（`evidence/arch-and-tests-results.json`、`evidence/functional-audit-results.json`）：`readInitialUrlState()` 解析了 `initialParams.camBearing`、`dateStr` 与 `layers` 却从未在启动后应用；`#sc-type-sel`（12 种分享类型）未绑定 `change` 监听；`PosterShare` 忽略 `ShareCenter` 传入的 `bullets`；`ExportService` 仅实现 7 种导出格式（缺少文档宣称的 Markdown `.md` 第 8 种格式）。
- **复现步骤**：
  1. 访问 `?focus=jp-kansai-kyoto&spot=0&cam=120&date=2026-04-05&layers=terrain` -> 相机方位角、日期与图层未生效。
  2. 打开分享中心切换 `#sc-type-sel` -> 链接与预览未同步刷新。
  3. 查看 `ExportService` 导出格式列表 -> 仅 7 种（缺 `.md`）。
- **根本原因**：`ShareCenter`、`app.js` URL 启动状态恢复与 `PosterShare` 参数接口未对齐；`ExportService` 实现少于 V5 发布说明承诺的 8 种格式。
- **影响范围**：摄影机位深层链接丢失方位角、日期与图层状态；分享中心 12 种卡片模式切换不生效；缺少 Markdown 行程导出。
- **推荐修复方案**：地图就绪后应用 `camBearing`、`dateStr` 与 `layers`；为 `#sc-type-sel` 绑定 `change` 刷新事件；在 `PosterShare` 中将 `bullets` 映射至 `lines`；在 `ExportService` 补齐 `toMarkdown(trip)` 及导出弹窗 `.md` 按钮。
- **可复用开源资源**：N/A
- **预估改动范围**：中小（`~90 LOC`）
- **修复风险**：Low
- **验收标准**：深层链接完整还原焦点、机位、方位角、日期与图层；切换 `#sc-type-sel` 实时重算 URL、QR 与海报文案；包括 `.md` 在内的 8 种文件/打印导出均可真实下载生成。
- **证据可信度及验证状态**：高可信度 · 已通过源码核查与本地 E2E 下载验证确认

### KAIROS-022
- **唯一编号**：`KAIROS-022`
- **问题等级**：`P1`
- **所属模块**：`Worker Capability Detection Race`
- **文件路径及行号**：`js/services/api-client.js:118-159`
- **实际证据**：生产站实拍截图（`screenshots/prod-16-account-modal.png`）与源码分析：`prod-16` 在生产站 `https://world-travel-globe.globe-app.workers.dev/` 弹出 `'当前访问环境为纯静态浏览模式'`，而同站点 `/api/health` 实际返回 `d1:true, auth:true`。
- **复现步骤**：
  1. 当首次请求 `/api/health` 耗时超过 `1800ms`（Worker 冷启动或高 RTT 网络）时访问生产站。
  2. 点击账户按钮 -> 整个会话期间被永久锁死在纯静态降级模式。
- **根本原因**：`detectWorkerCapabilities()` 对 `/api/health` 设置了 `1800ms` 超时中止，并在超时后将 `workerCapabilities = fallback` 永久缓存（`L153`），无任何重试或 TTL 机制。
- **影响范围**：高延迟网络用户访问 Cloudflare Workers 生产站时被静默锁死为游客静态模式，无法登录或云端同步。
- **推荐修复方案**：将 `/api/health` 探测超时放宽至 `5000ms`，且在网络超时/瞬时失败时不写入永久负面缓存（保持 `workerCapabilities = null`，以便打开账户中心或协作空间时自动重新探测）。
- **可复用开源资源**：N/A
- **预估改动范围**：极小（`js/services/api-client.js` 内 `~10 LOC`）
- **修复风险**：Low
- **验收标准**：首次 `/api/health` 超过 `1.8s` 或瞬时失败后，打开账户中心会自动重试并在 Workers 同源下正确识别 `available: true`。
- **证据可信度及验证状态**：高可信度 · 已通过生产站截图异常与 `api-client.js` 源码分析确认

### KAIROS-023
- **唯一编号**：`KAIROS-023`
- **问题等级**：`P1`
- **所属模块**：`Performance / Boot Payload & DOM Retention`
- **文件路径及行号**：`index.html; build-dist.js; js/app.js`
- **实际证据**：独立 CDP 性能采样（`evidence/perf-audit-results.json`）：冷启桌面端首屏传输 `1,912 KB`（解压 `5,693 KB`，`loadMs 7,084ms`，`TBT 403ms`）；带序幕增至 `2,619 KB`（`+707 KB`）；低端 6x CPU 下 `TBT = 3,262ms`；Mobile 4G `loadMs = 15,091ms`；Slow 3G `DCL = 24,552ms`、`loadMs = 35,653ms`；连续开关抽屉/弹窗 8 次并强制 GC 后仍残留 `+1,368` 个 DOM 节点（`+44%`）与 `+144` 个事件监听器（`+46%`）。
- **复现步骤**：
  1. 通过 CDP 在 Slow 3G / 6x CPU 降速下冷加载生产站。
  2. 在详情抽屉、帮助中心与行程规划器间循环开关 8 次，执行 GC 后对比 `Performance.getMetrics()`。
- **根本原因**：首页同步阻塞 `<script>` 链条（`maplibre-gl.js` 1.05MB + `libs.bundle` 359KB + `atlas-index` 1.29MB + `app.bundle` 920KB = 约 3.6MB 原始 JS 同步解析）过重，且关闭抽屉/规划器/弹窗后保留已渲染 DOM 与事件监听未释放。
- **影响范围**：移动弱网与低配设备冷启动极度缓慢，长时间交互存在单调增长的 DOM 与监听器泄漏。
- **推荐修复方案**：拆出并延迟加载非首屏三方库（如 `fuse`/`minisearch`/`dexie` 按需加载）；将 `atlas-index` 全量文本移出阻塞解析（改为异步 fetch JSON 或 `atlas-worker.js` + `defer`）；仅在序幕激活时加载序幕资源；关闭弹窗/规划器/抽屉页签时主动销毁旧 DOM 与监听。
- **可复用开源资源**：Lighthouse (Apache-2.0) CI 性能预算 + `atlas-worker.js`
- **预估改动范围**：中大型（`build-dist.js`、`index.html`、`app.js` 约 `~150-250 LOC`）
- **修复风险**：Medium
- **验收标准**：Mobile 4G `DCL < 4.5s`，Low-End 6x CPU `TBT < 1,000ms`，连续 10 轮抽屉/弹窗开关并在 GC 后净 DOM 节点与监听器增长 `<10%`。
- **证据可信度及验证状态**：高可信度 · 已通过线上 CDP 6 档位实测与 HeapProfiler GC 采样确认

### KAIROS-024
- **唯一编号**：`KAIROS-024`
- **问题等级**：`P1`
- **所属模块**：`Mobile & Responsive Layout`
- **文件路径及行号**：`css/styles.css; css/upgrades.css; index.html`
- **实际证据**：多视口实拍截图与几何扫描（`screenshots/prod-18-mobile-drawer-390x844.png`、`prod-19-mobile-planner-390x844.png`、`vp-360x800.png`、`vp-mobile-landscape-844x390.png`、`evidence/ui-mobile-audit-results.json`）：`#mobile-bottom-nav` 遮挡抽屉底部文本、`#planner-view` 表单与 `#globe-controls`；`360x800` 下 `#globe-controls` 与 `#basemap-bar` 重叠；`#phenology-bar` 在 `390x844`、`430x932` 与横屏 `844x390` 裁剪月份按钮；移动端每视口有 `23–27` 个可交互元素小于 `44px`（如 `brand-home-btn 34x26`、`pheno-btn 42x40`、图标按钮 `40x44`）。
- **复现步骤**：
  1. 在 `360x800`、`390x844` 或 `844x390` 视口打开生产站。
  2. 打开详情抽屉或行程规划器并滚动到底部。
- **根本原因**：固定定位 `#mobile-bottom-nav` 未给 `#drawer-scroll` 与 `#planner-view` 留足底部安全区内边距；`#phenology-bar` 横向溢出直接裁剪子按钮；移动端顶栏堆叠成 3 行高（`~180px`）；触控目标尺寸低于 Apple HIG / WCAG `44×44px` 要求。
- **影响范围**：移动端内容被底部导航遮挡、物候月份不可完整触及、地图控件互叠、首屏可用视区被严重挤压。
- **推荐修复方案**：为抽屉/规划器/悬浮条统一追加 `calc(var(--mob-nav-h) + env(safe-area-inset-bottom) + 16px)` 底部留白；为 `#phenology-bar` 开启顺滑横向滚动（`overflow-x: auto`）；将移动端顶栏收敛为单行紧凑条；强制移动端触控控件 `min-width: 44px; min-height: 44px`。
- **可复用开源资源**：N/A
- **预估改动范围**：中等（`css/styles.css` + `css/upgrades.css` 约 `~120 LOC`）
- **修复风险**：Low
- **验收标准**：在 `360x800`、`390x844`、`430x932` 与 `844x390` 下 0 个被裁剪控件、0 处导航遮挡重叠、且 100% 移动端交互控件 `>= 44×44px`。
- **证据可信度及验证状态**：高可信度 · 已通过多视口截图与几何重叠扫描确认

---

## 四、P2 中危问题详情（8 项）

### KAIROS-025
- **唯一编号**：`KAIROS-025`
- **问题等级**：`P2`
- **所属模块**：`Search / GeoIntelligence Scoring & Regex`
- **文件路径及行号**：`js/modules/geo-intelligence.js:120-216, 383-390, 521-524, 651-677; data/enrichment/atlas-enrichment.json`
- **实际证据**：算法测试（`evidence/algorithm-audit-results.json`）：`searchAndExplain('')` 与 `'   '` 返回 `28` 条结果；5 个已解析意图标志（`preferWarm`、`preferCool`、`preferTransit`、`photoScene`、`pace`）在排序打分中从未被读取；`'不要海滩 雪山'` 返回 `0` 条结果（`negRe` 贪婪吞并了 `雪山`）；`'jungle'` 误触发 `month:6`；`'marine'` 误触发 `month:3`；`'元阳梯田 2026年'` 解析出 `maxBudgetRmb: 2026`；`'类似瑞士 平替'` 在 `msScore>=5` 时无视 `continent:'europe'`；开罗富化数据含 7/8 标签导致 `transitScore=0.72`。
- **复现步骤**：
  1. 依次检索 `''`、`'不要海滩 雪山'`、`'jungle trek'`、`'元阳梯田 2026年'` 或 `'类似瑞士 平替'`。
- **根本原因**：`directHay.includes('')` 配合 `priority===1` 绕过了 `total<=0` 过滤；否定词正则 `negRe` 贪婪跨词；英文月份正则使用词干前缀匹配；预算正则误匹配地名 `'元阳'` 中的 `'元'`；`msScore >= 5` 越权覆盖洲别硬约束。
- **影响范围**：组合检索无故归零、英文词误触季节筛选、地名误判预算上限、同类型跨洲泄露以及无效推荐标签。
- **推荐修复方案**：空字符串短路返回 `[]`；英文月份仅匹配完整月份名或标准缩写；按空白/连词切分否定从句；预算正则要求数字+货币上下文；严格执行 `intent.continent` 除非显式放宽；将 5 个死意图标志接入评分函数。
- **可复用开源资源**：MiniSearch (MIT，已集成) + Fuse.js（已集成）
- **预估改动范围**：中小（`geo-intelligence.js` 内 `~90 LOC`）
- **修复风险**：Low
- **验收标准**：空检索返回 0 条；5 个意图标志均影响排序；`'jungle'`/`'元阳梯田 2026年'`/`'不要海滩 雪山'` 不产生误匹配约束。
- **证据可信度及验证状态**：高可信度 · 已通过算法测试脚本复现确认

### KAIROS-026
- **唯一编号**：`KAIROS-026`
- **问题等级**：`P2`
- **所属模块**：`UI & Map State Guards`
- **文件路径及行号**：`js/lazy/account-center.js:26, 58, 86; js/modules/terrain-3d.js`
- **实际证据**：截图 `screenshots/prod-16-account-modal.png` 及交互回归测试（`evidence/functional-audit-results.json`）：`#account-modal` 在 `760px` 宽的 `.diag-modal` 内渲染 `480px` 的 `.epic-dialog`，右侧留出 `280px` 空白玻璃框；当 `!map.isStyleLoaded()` 时，`terrain-3d.js` 对 `toggleBuildings`/`toggleNightLights`/`toggleAurora` 直接静默丢弃。
- **复现步骤**：
  1. 打开 Account Center 弹窗（见 `prod-16-account-modal.png`）。
  2. 在底图/地形加载过渡期间快速点击 3D 建筑、夜光或极光开关。
- **根本原因**：混用 `.diag-modal` 外框宽度与内层 `.epic-dialog` `max-width:480px`；`terrain-3d.js` 遇到样式未就绪时直接早退返回，未挂起待生效状态至 MapLibre `idle`/`styledata`。
- **影响范围**：账户中心弹窗视觉错位留白；底图切换过程中图层开关偶发点击无响应。
- **推荐修复方案**：`#account-modal` 统一采用 `.modal-backdrop` + `.modal-card` 结构；在 `terrain-3d.js` 中对未就绪开关挂起队列并在 `map.once('styledata' | 'idle')` 自动重放，同时给出加载反馈。
- **可复用开源资源**：N/A
- **预估改动范围**：小（`~40 LOC`）
- **修复风险**：Low
- **验收标准**：账户弹窗居中无右侧空白框；3D 建筑/夜光/极光开关在底图切换期间点击也能在样式加载后稳定生效。
- **证据可信度及验证状态**：高可信度 · 已通过生产截图与交互回归验证确认

### KAIROS-027
- **唯一编号**：`KAIROS-027`
- **问题等级**：`P2`
- **所属模块**：`Time Machine & EPIC Modal UX`
- **文件路径及行号**：`js/modules/earth-timemachine.js:114-158, 237-300; js/modules/epic-earth.js`
- **实际证据**：线上英文与繁体测试（`evidence/functional-audit-results.json`）及 `screenshots/prod-10-epic-modal.png`：英文模式下 `#timemachine-dock` 仍渲染硬编码简体中文；其“分屏对比”实际只是修改 `raster-opacity` 透明度混合（`L157-158`）而非空间分屏；重复实现了 `buildNightTerminatorPolygon`；当 NASA 图像加载缓慢或受阻时 EPIC 弹窗显示全黑空白且无加载/失败提示。
- **复现步骤**：
  1. 将界面切换为 `en` 后打开 Earth Time Machine。
  2. 在 `epic.gsfc.nasa.gov` 较慢或不可达时打开 NASA DSCOVR EPIC 弹窗。
- **根本原因**：`earth-timemachine.js` 未使用 `AppI18n` 而直接写死中文模板，用透明度叠加替代分屏裁剪；`epic-earth.js` 缺少 `<img>` loading 指示与 `onerror` 重试回退 UI。
- **影响范围**：破坏 Time Machine 三语国际化一致性、混淆透明度叠加与分屏对比、且弱网下 EPIC 弹窗呈现黑洞体验。
- **推荐修复方案**：通过 `AppI18n` 本地化 `#timemachine-dock`；晨昏线多边形统一委托 `SolarTerminator`；更名或升级为真分屏滑块；为 `epic-stage-img` 增加加载态与清晰的重试/降级提示。
- **可复用开源资源**：N/A
- **预估改动范围**：中小（`~80 LOC`）
- **修复风险**：Low
- **验收标准**：Time Machine 在 `zh-CN`/`zh-TW`/`en` 下完整翻译；NASA EPIC 图像慢或失败时展示 Spinner 与友好报错/重试按钮。
- **证据可信度及验证状态**：高可信度 · 已通过生产站多语测试与截图确认

### KAIROS-028
- **唯一编号**：`KAIROS-028`
- **问题等级**：`P2`
- **所属模块**：`PWA & Service Worker Caching`
- **文件路径及行号**：`sw.js:60, 121; build-dist.js:285-286`
- **实际证据**：SW 静态审计（`evidence/arch-and-tests-results.json`）：`sw.js:60` 在检查 `CACHE_NAME` 前先把 `/vendor/` 路由进无版本号的 `DATA_CACHE`，导致旧版 `libs.bundle.min.js?v=*` 永远不会被清理；`sw.js:121` 在离线且未命中缓存时向 `event.respondWith` 返回 `null`；`manifest.webmanifest`、`assets/skyboxes/*` 与 `atlas-enrichment.json` 未纳入预缓存或运行期匹配策略。
- **复现步骤**：
  1. 查阅 `sw.js:55-125` 与 `build-dist.js:275-295`。
  2. 断网状态下请求未缓存的 API/JSON 路径。
- **根本原因**：缓存命中分支顺序将 `/vendor/` 提前拦截进 `DATA_CACHE`；`staleWhileRevalidate` 返回 `hit || (await netPromise)` 且失败分支返回 `null`。
- **影响范围**：版本升级后旧依赖包长期滞留；离线请求未缓存路径触发 SW `TypeError`；天空盒与富化 JSON 在离线时失效。
- **推荐修复方案**：优先匹配 `CORE_ASSETS`/`CACHE_NAME`；离线兜底返回 `new Response('Offline', { status: 503 })` 而非 `null`；将 `manifest.webmanifest` 与 `atlas-enrichment.json` 纳入 `DATA_CACHE`/预缓存清单。
- **可复用开源资源**：Workbox (MIT) 缓存策略规范
- **预估改动范围**：小（`sw.js` + `build-dist.js` 约 `~30 LOC`）
- **修复风险**：Low
- **验收标准**：SW `activate` 清理旧版 `libs.bundle.min.js`；离线未缓存请求干净返回 `503` 无控制台报错；离线富化与清单可正常读取。
- **证据可信度及验证状态**：高可信度 · 已通过源码核查确认

### KAIROS-029
- **唯一编号**：`KAIROS-029`
- **问题等级**：`P2`
- **所属模块**：`Global Data & EN i18n Quality`
- **文件路径及行号**：`data/africa_antarctica/indian_ocean_madagascar.js; data/north_america/canada_rockies_west.js; data/i18n/en/*.json`
- **实际证据**：全量机器校验（`evidence/data-audit-results.json`）：`sc-aldabra-outer` 城市图钉 `[51.5, -7]` 位于印度洋开阔海域，距离阿尔达布拉环礁（`[46.35, -9.417]`）达 `627.2 km`；班夫与贾斯珀存在 2 个完全重复机位坐标（`Bow Lake`、`Peyto Lake`）；65 个机位距离父城市图钉超过 `600 km`（最大 `3,102 km`，位于 `br-coast-jericoacoara-aparados`）；`data/i18n/en/*.json` 中存在 `223` 条英文地标名称词组重复（如 `'Hallgrímskirkja Hallgrímskirkja'`）。
- **复现步骤**：
  1. 对全量 56 个数据文件与 `data/i18n/en/*.json` 运行数据审计脚本。
- **根本原因**：大跨度区域打包（塞舌尔外岛、巴西海岸带、加勒比）拉偏中心点；跨城市共享湖泊坐标未去重；双语自动拼接导致英文专有名词重复。
- **影响范围**：海中图钉位置失真、地图上相邻公园图钉重叠、以及英文界面出现明显重复词。
- **推荐修复方案**：将 `sc-aldabra-outer` 校准回 `[46.35, -9.417]`（或拆分外岛节点）；去重班夫/贾斯珀重叠机位；清洗 223 条英文重复词汇并在 `scripts/audit-data.js` 增加海面坐标/重复词 CI 校验。
- **可复用开源资源**：Natural Earth 10m Land Polygons（Public Domain）用于 CI 陆地校验
- **预估改动范围**：小（数据清洗 + `scripts/audit-data.js` 校验规则）
- **修复风险**：Low
- **验收标准**：0 个城市图钉偏离陆地超过 `50 km`；0 个完全重复机位坐标；0 条英文地标非预期重复词。
- **证据可信度及验证状态**：高可信度 · 已通过 722 城/5,414 机位全量自动化审计确认

### KAIROS-030
- **唯一编号**：`KAIROS-030`
- **问题等级**：`P2`
- **所属模块**：`Accessibility, Modal Dismissal & Layer Bleed`
- **文件路径及行号**：`js/app.js:3081; css/upgrades.css; index.html; screenshots/prod-11, prod-19`
- **实际证据**：E2E 与截图审计（`evidence/functional-audit-results.json`、`evidence/ui-mobile-audit-results.json`、`screenshots/prod-11-trip-planner.png`、`prod-19-mobile-planner-390x844.png`）：按 `Escape` 无法关闭 `#help-center-modal`（`hcClosedOnEsc: false`），也无法关闭 `#share-center-modal`/`#dest-compare-modal`/`#account-modal`/`#trip-export-modal`/`#music-popover`；懒加载弹窗缺少 `aria-label`/`aria-labelledby` 与焦点陷阱；`#topbar` 穿透半透明的 `#planner-view` 吸顶条透出杂乱文字。
- **复现步骤**：
  1. 打开帮助中心（`?`）后按 `Escape` -> 弹窗未关闭。
  2. 打开行程规划器（`prod-11`）观察 `< 返回地球` 吸顶栏背后的透底文字。
- **根本原因**：`js/app.js:3081` 全局 `Escape` 监听仅覆盖旧版抽屉/弹窗，遗漏 V5 懒加载弹窗；`#planner-view` 背景半透明却未隐藏 `#topbar`。
- **影响范围**：键盘用户陷入 V5 弹窗死循环、读屏软件缺少弹窗标题、行程规划器顶部存在视觉透字干扰。
- **推荐修复方案**：引入统一弹窗管理器处理 `Escape` 关闭、`aria-labelledby`、焦点陷阱与焦点归还；当 `#planner-view`、`#gallery-view`、`#archive-view` 全屏视图打开时隐藏 `#topbar`。
- **可复用开源资源**：`axe-core` (MPL-2.0)
- **预估改动范围**：小（`~60 LOC`）
- **修复风险**：Low
- **验收标准**：按 `Escape` 可关闭所有已打开弹窗/浮层；`axe-core` 对话框 ARIA 严重错误为 0；`#planner-view` 顶部无 `#topbar` 透底。
- **证据可信度及验证状态**：高可信度 · 已通过 E2E 按键实测与截图确认

### KAIROS-031
- **唯一编号**：`KAIROS-031`
- **问题等级**：`P2`
- **所属模块**：`Async Race Conditions & Error Swallowing`
- **文件路径及行号**：`js/modules/epic-earth.js:225-230; js/modules/earth-timemachine.js:370-377; js/services/weather-service.js; js/services/media-wikidata.js`
- **实际证据**：静态审计（`evidence/arch-and-tests-results.json`）：虽然 `ApiClient.fetchJson` 已支持 `AbortSignal`，但全仓仅有 `0` 个 UI 或业务调用方传入 `AbortController` 取消过期请求；全仓存在 `162` 处空/静默 `catch` 块（`app.js: 18`、`worker/auth.js: 11`、`ambient-radio.js: 10`、`trip-planner.js: 9`）。
- **复现步骤**：
  1. 在目的地间快速连续点击切换，或在 EPIC / Time Machine 中快速拖动日期。
  2. 先发后至的慢响应可覆盖当前展示的最新目的地/日期数据。
- **根本原因**：切换目的地/日期时未管理每面板独立的 `AbortController` 生命周期，且广泛使用 `catch (_) {}` 吞没运行时异常。
- **影响范围**：快速操作时界面偶现“张冠李戴”旧数据错乱，且线上异常极难排查。
- **推荐修复方案**：为天气、媒体、EPIC、路线规划等异步面板维护活动 `AbortController`，新请求发起时中止旧请求；在 `Diagnostics` 中记录非 `AbortError` 的异常。
- **可复用开源资源**：N/A
- **预估改动范围**：中等（服务与模块层约 `~80 LOC`）
- **修复风险**：Low
- **验收标准**：在京都与加德满都之间快速切换时，京都未完成的天气/媒体请求立即被 `abort()`，绝不会在加德满都面板中串入京都数据。
- **证据可信度及验证状态**：高可信度 · 已通过静态代码审计确认

### KAIROS-032
- **唯一编号**：`KAIROS-032`
- **问题等级**：`P2`
- **所属模块**：`Test Suite Credibility & Stale Branch`
- **文件路径及行号**：`e2e/globe.spec.mjs:511-526; tests/v5-batch4-collab-and-split.test.js; tests/v5-batch2-auth-security.test.js; branch pages`
- **实际证据**：测试审计（`evidence/arch-and-tests-results.json`）：E2E 场景 15 命名为 `'Multi-Context Collab BroadcastChannel Convergence'`，实际打开 `pageB` 后未做任何编辑或同步校验即关闭；`v5-batch4` 测试标题宣称覆盖 `'& version restore'` 却从未调用 `/versions/restore`；`AccountCenter`、`CollabSpace`、`StorageDB`、`sw.js` 与 `mergeTripDocuments` 存在 0 测试覆盖；`pages` 分支（`84f2814`）停留在 V4.5.0，而 GitHub Actions `deploy-pages.yml` 直接从 `main` 部署 V5.0.0。
- **复现步骤**：
  1. 核对 `e2e/globe.spec.mjs:511-526` 与 `tests/v5-batch4-collab-and-split.test.js`。
  2. 执行 `git log -n 1 pages`。
- **根本原因**：占位式 E2E 断言、基于正则的简化 `MockD1` 绕过了 SQLite 约束检查、以及遗留 `pages` 分支未同步退役。
- **影响范围**：测试套件输出 `66/66` 与 `15/15` 全绿的虚假安全感，掩盖了 CRDT、协作接线、QR V8/V10、改密会话未清、浅色模式黑字等 P0/P1 缺陷流入 V5.0.0。
- **推荐修复方案**：将 Worker 测试迁移至真实 `node:sqlite`（`DatabaseSync`）；引入 `fast-check` 验证 CRDT 与 AA 算法属性；重写 E2E 场景 15 实测双上下文同步、真实文件下载及 `axe-core` 深浅主题对比度；同步或归档退役旧 `pages` 分支。
- **可复用开源资源**：Vitest (MIT) + `fast-check` (MIT) + `axe-core` (MPL-2.0) + `node:sqlite`
- **预估改动范围**：中大型（`tests/` 与 `e2e/` 约 `~400 LOC`）
- **修复风险**：Low
- **验收标准**：测试命名与断言严格一致；Worker 测试运行于 `node:sqlite`；CI 门禁强制执行深浅双主题 `axe-core` 与真实下载/QR 解码验证。
- **证据可信度及验证状态**：高可信度 · 已通过逐文件测试审计与 Git 检查确认

---

## 五、P3 低危打磨问题详情（2 项）

### KAIROS-033
- **唯一编号**：`KAIROS-033`
- **问题等级**：`P3`
- **所属模块**：`UI Visual Polish, Contrast & Typography`
- **文件路径及行号**：`index.html; css/styles.css; css/upgrades.css; screenshots/prod-02, prod-03, prod-06, prod-08, prod-13`
- **实际证据**：实拍截图核查（`prod-02`、`prod-03`、`prod-06`、`prod-08`、`prod-13`、`evidence/ui-mobile-audit-results.json`）：(1) 左上角品牌标识并排渲染了多余的双圆环；(2) 搜索胶囊在 1440px/2560px 桌面端仍截断为 `'搜索 722 城与 5,41…'`；(3) 浅色模式主题色 `#B47D22` 对比度不达 WCAG AA 4.5:1（白字金底 `3.56:1`、浅胶囊金字 `2.41:1`）；(4) 7 日预报 `'大部晴朗'` 折行导致温度列不齐（`prod-06`）；(5) Viewfinder 顶部 HUD 金色竖线压住 `'40°'` 且固定显示 `海拔 0m`（`prod-08`）；(6) CollabSpace 圆角按钮将 `'添加'`/`'发送'`/`'发起投票'` 竖向折行（`prod-13`）。
- **复现步骤**：
  1. 逐一检查 `prod-02`、`prod-03`、`prod-06`、`prod-08`、`prod-13` 实拍截图。
- **根本原因**：搜索栏与按钮 `max-width` 过窄；预报与协作按钮缺少 `white-space: nowrap`；浅色模式 `#B47D22` 亮度未校准；`kairos-horizontal.svg` 旁残留旧圆形图标。
- **影响范围**：削弱产品宣称的 Apple/Google Earth 级视觉精致度，且浅色模式激活胶囊未达 WCAG AA 正常文本对比度。
- **推荐修复方案**：将浅色模式强调文本/填充校准至 `#8C5E12`（对比度 `>= 4.5:1`）；移除品牌旁重复圆环；放宽桌面端搜索胶囊宽度；为协作/预报按钮增加 `white-space: nowrap`；修正 Viewfinder HUD 分隔符间距及真实海拔绑定。
- **可复用开源资源**：N/A
- **预估改动范围**：小（CSS + `viewfinder-3d.js` + `collab-space.js` 约 `~60 LOC`）
- **修复风险**：Low
- **验收标准**：激活胶囊在深浅主题均达到 WCAG AA `>= 4.5:1`；消除 2 字按钮竖折行；`>=1280px` 桌面端搜索提示文案完整不截断。
- **证据可信度及验证状态**：高可信度 · 已通过多张生产站实拍截图逐项确认

### KAIROS-034
- **唯一编号**：`KAIROS-034`
- **问题等级**：`P3`
- **所属模块**：`Architecture Hygiene & Asset Redundancy`
- **文件路径及行号**：`js/app.js; assets/brand/source/; assets/prologue/bgm.js; vendor/`
- **实际证据**：静态架构审计（`evidence/arch-and-tests-results.json`）：`js/app.js` 高达 `3,899 LOC`（其中 `bindEvents` 占 `735` 行、最大嵌套深度 `8`）；`assets/brand/source/` 存放 9 个字节级完全重复的 `ChatGPT 图像 *.png`（约 `10 MB`）；`prologue/bgm.js` 提前预加载 `the-blue-horizon.mp3` 与 `ambient-radio.js` 第 0 轨重叠；`fuse.min.js` + `minisearch.min.js` 及 `suncalc.min.js` + `astronomy.browser.min.js` 同时打包进主线程；存在死符号（`window.AppSkybox`、`#layer-meta-inspector`、`preview-primary.png`）。
- **复现步骤**：
  1. 运行架构复杂度扫描并比对 `assets/brand/source/*.png` 文件 SHA-256 哈希。
- **根本原因**：V3–V5 多轮快速迭代持续向 `js/app.js` 与 `assets/` 叠加代码，未及时清理被替代的旧工具库与中间源文件。
- **影响范围**：仓库体积冗余约 `10 MB`、前端产物并存重复能力的三方库、以及 `js/app.js` 长期可维护性下降。
- **推荐修复方案**：清理重复 `ChatGPT 图像 *.png`、`preview-primary.png` 与死 DOM/全局变量；统一技术栈至 `Astronomy Engine` 与 `MiniSearch`；在不强制重写作 SPA 的前提下渐进拆分 `js/app.js` 的 `bindEvents()` 与星空渲染；将 `bgm.js` 改为 `preload='none'` 按需加载。
- **可复用开源资源**：N/A
- **预估改动范围**：中等（约 `~200 LOC` 模块拆分 + 静态资源瘦身）
- **修复风险**：Low
- **验收标准**：仓库二进制资源减少约 `10 MB`；`js/app.js` 核心事件与视图逻辑职责拆清；不再重复预加载同等能力的音频/算法库。
- **证据可信度及验证状态**：高可信度 · 已通过静态复杂度与文件哈希比对确认

---

## 六、未验证疑点专项说明（5 项 · 独立于 P0–P3 计数）

> **边界声明**：以下 5 项受限于本机审计环境（Windows 11 桌面、无实体移动设备、无 Firefox/WebKit 二进制、生产环境未绑定可选外部 Secrets/R2、禁止对线上生产库进行破坏性压测），**未计入已确认 34 项问题统计**，将在 V5.4 专项测试环境补齐闭环。

| 编号 | 未验证领域 | 受限客观原因 | 后续验证计划 |
|---|---|---|---|
| `UNVERIFIED-01` | **物理 iOS Safari / Android Chrome / iPad 真机行为** | 本次审计环境为 Windows 11 桌面端（仅 Chrome 与 Edge），无物理 iOS/Android/iPad 设备接入；Playwright 模拟视口无法复现双指捏合惯性、Safari WebGL 内存回收驱逐、虚拟键盘顶起视口重排、硬件刘海屏安全区及真实蜂窝网络温控降频。 | 依据 `08_MOBILE_AUDIT.md` 在 iPhone（iOS Safari）、iPadOS（横/竖屏）及 Android Chrome 真机执行完整真机验收清单。 |
| `UNVERIFIED-02` | **Firefox (Gecko) 与 WebKit 浏览器引擎兼容性** | 本环境未安装 `firefox.exe` 与 Playwright WebKit 运行时（`evidence/functional-audit-results.json`），跨引擎 CSS `backdrop-filter`、WebGL2 着色器编译及 IndexedDB 配额机制未实测。 | 在 CI 中安装 `npx playwright install firefox webkit` 并执行全量跨引擎 E2E 回归。 |
| `UNVERIFIED-03` | **生产环境 Google OAuth、Resend 邮件与 Cloudflare R2 照片上传** | 生产 `/api/health` 返回 `oauthGoogle: false`、`emailDelivery: false`、`r2: false`（可选环境变量与 R2 Bucket 未绑定），且严禁向线上生产 D1 写入测试数据。 | 搭建绑定 `GOOGLE_CLIENT_ID/SECRET`、`RESEND_API_KEY` 与 `PHOTOS_BUCKET` 的 Staging Cloudflare Worker 环境完成全链路联调。 |
| `UNVERIFIED-04` | **硬件 GPU 真实帧率与 30 分钟以上长时热稳定性** | 无头 Chrome 使用 SwiftShader 软渲染 WebGL（拖拽期仅 `19.4 FPS`），无法剥离真实硬件 GPU（`ANGLE D3D11/Metal`）下的帧率上限与长时多小时 WebGL 显存压力。 | 在配备独立/核显硬件 GPU 的笔记本与中端 Android 真机上执行 30 分钟连续地球/地形/3D 建筑漫游压测。 |
| `UNVERIFIED-05` | **真实多用户并发下 Cloudflare Workers CPU 时长、D1 行读取量与上游限流** | 本次审计禁止对线上 Cloudflare Edge 及第三方公共接口（OSRM、Wikimedia、Open-Meteo、Frankfurter）发起压力测试。 | 本地运行 `wrangler dev` 结合 `k6` / `Artillery` 压测脚本，并观察 Staging 环境 Cloudflare Analytics 与 D1 Insights 指标。 |
