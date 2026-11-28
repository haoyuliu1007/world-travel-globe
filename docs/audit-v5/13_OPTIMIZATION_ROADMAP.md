# KAIROS V5.1–V5.4 渐进式优化演进路线图（Optimization Roadmap）

> **制定依据**：[12_ISSUE_BACKLOG.md](file:///c:/Users/Liam/Desktop/%E6%97%85%E6%B8%B8%E8%AE%A1%E5%88%92/globe-app/docs/audit-v5/12_ISSUE_BACKLOG.md) 与 [issues.json](file:///c:/Users/Liam/Desktop/%E6%97%85%E6%B8%B8%E8%AE%A1%E5%88%92/globe-app/docs/audit-v5/issues.json)（34 项已确认问题 + 5 项未验证疑点）。  
> **核心架构原则**：**坚持“不强制重写为 SPA”的渐进式演进策略**——保留当前零构建门槛静态分发与 Cloudflare Workers 边缘架构的敏捷优势，优先阻断 P0/P1 安全与数据可信危机，随后夯实科学底座、移动人体工学与性能预算，最终补齐实时协作、自动化门禁与模块内聚度。

---

## 总览：四阶段演进路线图

| 版本里程碑 | 定位与主题 | 优先级 | 覆盖问题编号（共 34 项 + 5 项待测） | 预计周期 |
|---|---|---|---|---|
| **V5.1** | 安全热修复与 P0 阻断级清零版 | **P0 紧急阻断** | `KAIROS-001` ~ `007`, `008` ~ `014`, `022`（15 项） | 1 周（热修复通道） |
| **V5.2** | 科学可信度、全球数据与核心算法加固版 | **P1 高优先** | `KAIROS-015` ~ `021`, `025`, `029`（9 项） | 2–3 周 |
| **V5.3** | 移动人体工学、深浅主题打磨与性能预算版 | **P1–P2 体验性能** | `KAIROS-023`, `024`, `026`, `027`, `028`, `030`, `031`, `033`（8 项） | 2 周 |
| **V5.4** | 实时协作演进、CI 门禁重构与真机全量验证版 | **P2–P3 长期质量** | `KAIROS-032`, `034` + `UNVERIFIED-01` ~ `05`（2 项 + 5 项） | 2–3 周 |

---

## V5.1：Security Hotfix & P0 Blocker Release（安全热修复与 P0 阻断清零）

### 1. 版本目标（Goal）
在 **7 天内** 彻底消除所有会导致跨账号接管、数据窃取/篡改、跨海交通荒谬推荐、浅色弹窗不可读、二维码不可扫以及协作云端断连的 **7 项 P0 阻断缺陷** 与 **8 项高危 P1 安全/能力探测缺陷**，恢复 V5.0.0 生产站的安全基线与核心可用性。

### 2. 优先级（Priority）
**最高（Release Blocker / Hotfix）**——未完成 V5.1 前不应继续对外推广协作与分享功能。

### 3. 前置依赖（Dependencies）
- 需准备独立本地 `node:sqlite` + `wrangler dev` 回归环境验证全部 14 项安全与功能 PoC。
- 在推送前确认生产站 `/api/health` 能力配置与 `worker/migrations/` 索引兼容。

### 4. 实施风险与缓解（Risks & Mitigation）
- **风险 1（CRDT 升级兼容性）**：替换 `mergeTripDocuments` 后，已存储在用户本地 `IndexedDB` 或 D1 中的旧格式行程可能缺少 `st.updatedAt` 与全局序列 rank。  
  - *缓解*：在 `crdt-merge.js` 读取入口增加一次性幂等迁移函数，为缺失 `updatedAt` 的旧站点按当前数组下标生成初始 `orderRank` 与时间戳。
- **风险 2（CSRF/CORS 收敛误伤本地开发或合法嵌入）**：严格校验 `Origin` 可能影响 `?embed=` 场景或本地 `127.0.0.1` 调试。  
  - *缓解*：仅对 Cookie 鉴权写接口强制同源/`Sec-Fetch-Site` 检查，保留显式 `?embed=` 白名单路由，并为同源测试编写 `node:sqlite` 自动化用例。
- **风险 3（用户登出清库引发本地数据误删误解）**：直接清空 IndexedDB 可能让未开启云同步的游客困惑。  
  - *缓解*：按 `userId` 分区存储（`guest` 独立命名空间），仅在“退出已登录账号”或“销号”时清理该账号会话凭据与隔离区，不销毁独立 `guest` 档案。

### 5. 具体任务清单（Concrete Tasks）
1. **Worker 协作接口鉴权、防劫持与并发锁修复**（`KAIROS-001`, `KAIROS-002`, `KAIROS-008`, `KAIROS-009`, `KAIROS-010`）
   - `worker/collab.js`：`POST /api/collab/trips` 检测到既有 `id` 且 `owner_id !== user.id` 时返回 `403`（或统一由服务端生成 `tripId`）；`getMemberRole()` 优先判断 `trips.owner_id === userId`；`join/:token` 冲突更新附加 `WHERE trip_members.role != 'owner'`。
   - 公开行程 `GET` 剥离 `u.email` 与 `expenses`；评论与投票强制成员权限及 `WHERE id = ? AND trip_id = ?`；`PUT` 强制 `baseVersion` 乐观锁返回 `409 Conflict`；恢复版本时追加版本记录与推进 `updatedAt`/`clock`。
   - 为 `/api/collab/*`、`/api/profile`、`/api/photos` 全部写操作接入 `verifyCsrf`，消除缺失 `Origin`+`Referer` 的放行漏洞，收敛 `/api/profile` 与 `OPTIONS` 通配 CORS。
2. **认证会话、OAuth、防暴力破解与本地跨账号隔离**（`KAIROS-011`, `KAIROS-012`）
   - `worker/auth.js`：重置密码时执行 `DELETE FROM sessions WHERE user_id=?`；限流改为 `(ip, email)` 维度持久化且仅清成功账号自身计数；Google OAuth 强制要求 `verified_email === true` 并清除未验证预注册密码；`DELETE /api/account` 批量级联清空全表；禁用 `data:image/svg+xml` 头像。
   - `storage-db.js` / `auth-service.js` / `account-center.js`：按 `userId` 隔离本地 IndexedDB/localStorage 键，登出与销号清理敏感 `cloudSyncPassphrase` 与当前账号缓存，切换账号时禁止静默迁移前账号档案。
3. **代理安全、导出注入防护与 Worker 能力探测修复**（`KAIROS-013`, `KAIROS-014`, `KAIROS-022`）
   - `worker/index.js`：`/api/img` 对 SVG 加 `CSP: sandbox` + `nosniff`（或禁用）；`/api/tile` 等代理强制校验上游 `Content-Type`；`/api/photos` 强制登录+Hex Key 清洗+魔数与 5MB 校验；默认首页收敛 `frame-ancestors 'self'` 并补全 CSP。
   - `export-service.js` / `trip-planner.js` / `expense-splitter.js`：对 3 处 CSV 导出执行公式前缀 `'` 中和；在 `toPrintableHtml()` 对 `s.startTime` 补充 `escXml()`。
   - `api-client.js`：将 `/api/health` 探测超时提高至 `5000ms`，超时失败时不写入永久负面静态缓存，允许后续打开账户弹窗自动重试。
4. **前端协作接线与多标签页收敛**（`KAIROS-003`）
   - `js/lazy/collab-space.js`：在已登录且 Worker D1 可用时全面接通 `/api/collab/trips/*` 读写与版本拉取；离线/游客状态明确展示 `'Local Sandbox'` 徽章；订阅 `BroadcastChannel('kairos_collab')` 实现同浏览器多标签页自动同步更新。
5. **CRDT 行程合并重写、跨海交通阻断、浅色弹窗对比度与二维码替换**（`KAIROS-004`, `KAIROS-005`, `KAIROS-006`, `KAIROS-007`）
   - `crdt-merge.js` / `trip-planner.js`：以全局站点 LWW-Element-Set + 分数索引序列（或 `Y.Doc`）替换 `mergeTripDocuments`，强制所有站点写入 `updatedAt + actorId`。
   - `transport-service.js`：为 `compareIntercityModes` 与 `roadFeasible` 增加同陆块/跨海海峡与孤岛判定，封堵跨洋 HSR/Rail/Driving 幻觉，南极路线切换为探险船方案。
   - `css/upgrades.css` / `css/styles.css`：将 `.modal-card` 的 `var(--bg-panel, ...)` 修正为 `var(--bg-solid)` 并在 `:root` 与 `[data-theme='light']` 显式声明 `--bg-panel`。
   - `js/services/qr-code.js`：使用 Nayuki QR Code Generator (MIT) 或 `qrcode-generator` (MIT) 替换缺陷自研实现，恢复 V1–V40 全版本合规扫码能力（同步为 V5.2 的 `KAIROS-019` 奠定核心库基础）。

### 6. 量化验收指标（Quantitative Acceptance Metrics）
- **安全 PoC 拦截率**：`evidence/security-poc-results.json` 全部 9 类 PoC（覆盖 `KAIROS-001, 002, 008–014`）回归通过率 **100%**（越权/CSRF/XSS/注入/孤儿残留全部返回 `403/400/409` 或被安全转义）。
- **CRDT 属性测试**：`mergeTripDocuments` 在 `>= 1,000` 次 `fast-check` 随机试验中交换律、结合律、幂等律失败次数 **= 0**（当前基线为 440/600 与 115/600 失败）。
- **跨海交通纠偏**：北京/上海/首尔/台北->东京、檀香山->茂宜岛跨海高铁与自驾可行性返回 `false` 率 **100%**。
- **浅色弹窗对比度**：4 个 V5 懒加载弹窗在浅色模式下文字对比度 **`>= 4.5:1`**（当前约 `1.1:1`）。
- **二维码解码率**：V1–V20 长度的 ASCII/UTF-8/`?trip=` URL 经独立 QR 解码器解码成功率 **100%**（RS 校验子错误 **= 0**）。
- **协作 E2E 闭环**：登录后创建协作空间/评论/投票向 `/api/collab/*` 发起真实请求，双标签页 `BroadcastChannel` 状态 **100%** 自动收敛。

---

## V5.2：Scientific Integrity, Global Data & Core Algorithm Hardening（科学可信度、全球数据与核心算法加固）

### 1. 版本目标（Goal）
解决“模型与数据看起来很美但底层失真”的问题：用真实观测气候与天文引擎取代合成物候与局部偏差算法；用完整 OurAirports 与陆地拓扑清洗 722 城交通与地理异常；补全智能检索、行程规划、AA 整数分算、分享深层链接与 Markdown 导出闭环。

### 2. 优先级（Priority）
**高（Core Product Credibility）**——紧随 V5.1 发布，确保“地理科学图鉴与行程平台”的学术与出行严谨性。

### 3. 前置依赖（Dependencies）
- V5.1 已合并上线（特别依赖 V5.1 的跨海模型架构与规范 QR 核心库）。
- 需提前离线拉取并缓存公开数据快照：OurAirports `airports.csv`、Natural Earth 10m 陆地多边形、JMA/USA-NPN/PEP725 物候基准及 Open-Meteo ERA5 对应年份气温。

### 4. 实施风险与缓解（Risks & Mitigation）
- **风险 1（外部数据体积膨胀）**：直接随包分发全量 OurAirports 或 Natural Earth 10m 多边形会拖慢首屏加载。  
  - *缓解*：在构建脚本 `scripts/build-transport-hubs.js` 与 `scripts/audit-data.js` 离线阶段完成匹配与裁剪，仅向 `dist/` 输出精简后的 `hubs.json` 结论表。
- **风险 2（物候误差指标重设引发前端文案调整）**：改用真实多年数据后，若回归模型误差仍接近城市历史均值，可能不再适合标榜高精度“AI 预测”。  
  - *缓解*：在界面与方法论说明中诚实区分“多年历史观测回归”与“气候统计学窗口估算”，保留置信区间与适用纬度边界提示。

### 5. 具体任务清单（Concrete Tasks）
1. **物候科学模型真实数据集重训与边界诚实化**（`KAIROS-015`）
   - 重建 `scripts/validate-phenology.js`，导入带可核查出处的真实多年樱花/红叶观测记录及逐年 ERA5 气候数据，加入南半球/低纬度测试用例。
   - 重新评估 `winterMeanC` 等特征与城市历史均值基线的 MAE/RMSE；对 Tier B/C 热带及极地窗口加上科学置信度与适用域护栏。
2. **天文引擎统一至 Astronomy Engine 与地形地平线修正**（`KAIROS-016`）
   - 将 `js/modules/photo-simulator.js` 的日月升落、晨昏线、大气折射与极区特殊日期计算统一迁移至仓内已集成的 `vendor/astronomy.browser.min.js`。
   - 修复 `formatTimeInOffset()` 对“今日无升落”、“连续暮光”与“极昼/极夜”的三态区分；修复 `terrain-3d.js` 平地 `-0.833°` 阈值，并补充 DEM 分辨率评估说明。
3. **全球交通枢纽重建与地理/英文数据清洗**（`KAIROS-017`, `KAIROS-029`）
   - 重写 `scripts/build-transport-hubs.js`，接入完整 OurAirports 定期商业机场数据集，优先匹配同国同陆块/同岛机场，严格依据实体轨道/地铁清单标注 `railHub` 与 `metro`。
   - 修正 `sc-aldabra-outer` 海中坐标与班夫/贾斯珀重叠机位坐标，批处理清洗 223 条英文重复地标文本，并在 `scripts/audit-data.js` 固化离线门禁规则。
4. **行程规划、多城路由、AA 结算与智能检索算法加固**（`KAIROS-018`, `KAIROS-020`, `KAIROS-025`）
   - `trip-planner.js` / `routing-service.js`：修复 5 个失效 `CITY_ALIASES` 并在单测校验全量别名；补齐 `resetDraftForNewTrip` 重置字段；多城行程生成城际过渡段；修复 `detectTripConflicts` 读取 `trip.intercityMode`、空坐标防护、OSRM 失败与跨海标志解耦及跨日界线大圆弧切分。
   - `expense-splitter.js`：切换至整数分（`cents`）+ 最大余数法实现严格分位守恒，接入多币种 `amountRmb` 汇率与 `settled` 过滤，对 `N<=12` 求解真实最少转账数（或更名）。
   - `geo-intelligence.js`：空串返回 `[]`，修复 `jungle`/`marine`/`元阳梯田 2026年`/`不要海滩 雪山` 正则误触，严格执行洲别硬约束，接入 5 个死意图特征参与排序。
5. **分享中心、QR 容量防护、深层链接还原与 Markdown 导出**（`KAIROS-019`, `KAIROS-021`）
   - 修正 `share-center.js` 调用 `QRCodeService.renderSvg(..., { size: 136 })`，加入 4 模块静区，对超长 `?trip=` 链接引入 `lz-string` 压缩或明确超限警告；为 `#sc-type-sel` 绑定 `change` 联动并打通 `PosterShare` `bullets` 渲染。
   - 在 `app.js` 地图加载后应用 URL 参数 `camBearing`、`dateStr`、`layers`；在 `export-service.js` 实现第 8 种导出格式 `toMarkdown(trip)` 及导出按钮。

### 6. 量化验收指标（Quantitative Acceptance Metrics）
- **物候基准透明度**：`scripts/validate-phenology.js` 100% 使用真实可溯源多年观测+逐年气温，完整输出与城市历史均值基线的对比报告。
- **天文精度**：14 场景对照 `Astronomy Engine` 误差 **`< 0.05°`**、时间误差 **`< 1 min`**，雷克雅未克/乌斯怀亚高纬场景跳变与误标 **= 0**。
- **枢纽与地理数据质量**：722 城中同国存在定期机场却错配至 `>200 km` 外外国机场数 **= 0**（当前 `97`）；无固定桥隧岛屿误标 `railHub` 数 **= 0**（当前 `27`）；海面城市图钉 **= 0**；英文重复地标词 **= 0**（当前 `223`）。
- **AA 与检索算法**：AA 结算分位守恒偏差 **= 0.00**；`5` 个检索意图标志 100% 影响排序，已知误匹配用例 100% 消除。
- **分享与导出**：12 种分享类型切换生效；深层链接 `100%` 还原机位/方位角/日期/图层；**8 种**导出格式（含 `.md`）均可实际触发下载/打印。

---

## V5.3：Mobile Ergonomics, Light/Dark Polish & Performance Budget（移动人体工学、深浅主题打磨与性能预算）

### 1. 版本目标（Goal）
在不改变技术栈的前提下，将移动端可用性、无障碍键盘体验、多语本地化一致性以及弱网/低端 CPU 首屏性能与长时内存稳定性提升至可交付标准。

### 2. 优先级（Priority）
**中高（UX & Performance Budget）**——直接解决移动端截断遮挡与低配设备冷启动卡顿。

### 3. 前置依赖（Dependencies）
- V5.2 已完成功能/数据改动（避免 CSS 与模块结构频繁冲突）。
- 已建立 CDP 性能基线脚本与 11 视口截图对比脚本。

### 4. 实施风险与缓解（Risks & Mitigation）
- **风险 1（Web Worker 化 `atlas-index` 引发同步初始化假定断裂）**：`app.js` 或部分同步模块可能在首屏即直接读取全局 `window.DESTINATIONS`。  
  - *缓解*：采用分阶段加载策略——首屏仅随初始视图注入轻量索引（ID/坐标/名称/洲别），将长文案描述、机位详情与富化文本拆入异步 JSON / `atlas-worker.js` 延迟水合，保留兼容读取接口。
- **风险 2（44×44px 触控热区扩大造成移动端局部紧凑区拥挤）**：如 `#phenology-bar` 12 个月份按钮同时扩大可能拉宽滚动条。  
  - *缓解*：利用透明扩展伪元素（`::after` 扩展点击热区）或水平可滚动容器配合 `scroll-snap-type`，在不破坏视觉密度的前提下确保可触及热区 `>= 44×44px`。

### 5. 具体任务清单（Concrete Tasks）
1. **移动端布局、安全区与 44px 触控规范整改**（`KAIROS-024`）
   - `css/styles.css` / `css/upgrades.css`：为 `#drawer-scroll`、`#planner-view` 与底部浮动控件追加 `calc(var(--mob-nav-h) + env(safe-area-inset-bottom) + 16px)` 底部留白，解决 `#mobile-bottom-nav` 遮挡及 `#globe-controls`/`#basemap-bar` 在 `360x800` 的重叠。
   - 为 `#phenology-bar` 开启平滑横向滚动消除月份裁剪；将移动端顶栏折叠收敛为紧凑单行（释放首屏垂直视区）；确保所有移动端交互控件触控区 `>= 44×44px`。
2. **冷启动拆包、Web Worker 索引与 DOM/监听器泄漏清理**（`KAIROS-023`, `KAIROS-028`, `KAIROS-031`）
   - `build-dist.js` / `index.html`：拆出按需依赖（延迟加载 `MiniSearch`/`Dexie`/`ECharts` 等非首屏库），分离序幕资源按需加载，将全量富化/详情文本拆出同步阻塞 JS 并交由异步 fetch / `atlas-worker.js` 解析。
   - `js/app.js` / 各懒加载面板：在关闭抽屉页签、规划器与弹窗时清理废弃子节点与事件监听；为天气、媒体、EPIC、路线请求统一接入 `AbortController` 取消过期并发请求，并将静默 `catch` 接入 `Diagnostics` 日志。
   - `sw.js`：修正 `CORE_ASSETS`/`CACHE_NAME` 优先于 `DATA_CACHE` 匹配，清理旧版 vendor 缓存；离线未命中返回 `503 Response` 而非 `null`；补全 `manifest.webmanifest` 与 `atlas-enrichment.json` 离线缓存。
3. **弹窗对齐、键盘无障碍、Time Machine/EPIC 完善与视觉打磨**（`KAIROS-026`, `KAIROS-027`, `KAIROS-030`, `KAIROS-033`）
   - `account-center.js` / `terrain-3d.js`：统一 `#account-modal` 为 `.modal-backdrop` + `.modal-card` 居中布局；图层开关在 `!map.isStyleLoaded()` 时挂起队列并在 `idle`/`styledata` 自动应用。
   - `app.js` / 全局弹窗管理器：统一 `Escape` 关闭全部 V5 弹窗与浮层，补全 `aria-labelledby`、焦点陷阱与关闭后焦点归还；进入 `#planner-view` 等全屏面板时隐藏 `#topbar` 杜绝透底。
   - `earth-timemachine.js` / `epic-earth.js`：Time Machine 全量接入 `AppI18n`、复用 `SolarTerminator` 并修正对比模式文案/交互；EPIC 舞台增加 Loading 与失败重试 UI。
   - `css/` / `viewfinder-3d.js` / `collab-space.js`：浅色模式主强调色加深至 `#8C5E12`（对比度 `>= 4.5:1`）；移除品牌冗余圆环；放宽桌面端搜索框；按钮增加 `white-space: nowrap`；修正 Viewfinder HUD 分隔符与真实海拔展示。

### 6. 量化验收指标（Quantitative Acceptance Metrics）
- **性能预算（CDP 实测）**：Mobile 4G `DCL < 4,500ms`（当前 `9,872ms`）、Low-End 6x CPU `TBT < 1,000ms`（当前 `3,262ms`）、首屏传输压缩体积 `< 900 KB`（当前 `1,912 KB`）。
- **DOM 泄漏控制**：连续 10 轮抽屉/规划器/弹窗开关并 GC 后，DOM 节点与监听器净增长 **`< 10%`**（当前为 `+44%` / `+46%`）。
- **移动端几何审计**：4 大移动视口（`360x800`, `390x844`, `430x932`, `844x390`）`clippedControls = 0`、`chromeOverlaps = 0`、触控目标 `<44px` 数量 **= 0**。
- **无障碍与视觉**：`Escape` 关闭 100% 弹窗；`axe-core` 深浅双主题 Serious/Critical 问题 **= 0**；浅色激活胶囊对比度 **`>= 4.5:1`**。

---

## V5.4：Real-Time Collab Evolution, Testing & Modularization（实时协作演进、CI 门禁重构与真机验证）

### 1. 版本目标（Goal）
补齐长期可信度基石：将虚假/薄弱测试全面升级为真实 `node:sqlite` + 属性测试 + `axe-core` 自动化门禁；渐进式拆分 `js/app.js` 超大单文件并清理 10MB 冗余静态资源；按需引入可选的 Durable Objects / WebSocket 实时协同同步，并完成全部 **5 项 `UNVERIFIED` 硬件与外部集成验证**。

### 2. 优先级（Priority）
**中（Sustainability, Architecture Hygiene & Full Verification）**——建立不退化的工程长效护城河。

### 3. 前置依赖（Dependencies）
- V5.1–V5.3 全部功能与性能基线已稳定合入 `main`。
- 需准备真机测试矩阵（iPhone/iPad/Android）、Staging Cloudflare 账号（绑定 OAuth/Resend/R2 Secrets）及 CI Playwright `firefox`/`webkit` 镜像。

### 4. 实施风险与缓解（Risks & Mitigation）
- **风险 1（`js/app.js` 拆分引起全局依赖时序变化）**：3,899 行巨石文件拆分为多文件时易出现脚本加载顺序与全局挂载时序问题。  
  - *缓解*：保持 ES Module 或明确挂载清单，每次仅拆出单一内聚域（如 `starfield.js`、`url-state.js`、`modal-manager.js`），每步后即跑全量构建与 Playwright 回归，不强求一次性重写为 SPA 框架。
- **风险 2（新增 CI 属性测试与跨浏览器矩阵拖慢流水线）**：`fast-check` + 3 引擎 Playwright 可能拉长 PR 检查耗时。  
  - *缓解*：PR 门禁运行快速单元测试（`node:sqlite` + 200 轮 `fast-check`）与 Chromium `axe-core`；每晚定时任务与发布前流水线运行 1,000+ 轮压力属性测试及 Firefox/WebKit 全矩阵。

### 5. 具体任务清单（Concrete Tasks）
1. **测试体系可信度重建与 CI 硬门禁**（`KAIROS-032`）
   - 将 `tests/v5-batch2`、`v5-batch4` 等 Worker 测试从正则 `MockD1` 全面迁移至真实 `node:sqlite`（`DatabaseSync`），覆盖外键、唯一约束、并发版本号与真实回滚。
   - 新增 `fast-check`（MIT）属性测试守卫 `CRDT.mergeTripDocuments` 与 `ExpenseSplitter.computeSettlements`。
   - 补全 `AccountCenter`、`CollabSpace`、`StorageDB`、`sw.js` 单元测试；重写 `e2e/globe.spec.mjs` 场景 15 实现双上下文真实编辑同步、真实下载文件断言与二维码位级解码校验，并接入 `axe-core` 深浅主题扫描；同步或正式归档清理停滞在 V4.5.0 的 `pages` 分支。
2. **渐进式模块化拆分与资源瘦身（非 SPA 重写）**（`KAIROS-034`）
   - 拆分 `js/app.js`（`3,899 LOC`）内的 `bindEvents()`（735 行）为领域模块（如键盘/弹窗管理、URL 路由状态、星空渲染、抽屉控制器）。
   - 清理 `assets/brand/source/` 内 9 个重复 `ChatGPT 图像 *.png`（~10MB）及死文件 `preview-primary.png`、无用符号 `window.AppSkybox`/`#layer-meta-inspector`；移除已被替代的 `suncalc.min.js` 与 `fuse.min.js`；设置 `bgm.js` `preload='none'`。
3. **可选实时协作增强与 5 项 `UNVERIFIED` 闭环验证**（`UNVERIFIED-01` ~ `UNVERIFIED-05`, 协作增强基于 `KAIROS-003`/`004`）
   - 在已打通 D1 REST + `BroadcastChannel` 的基础上，评估接入 Cloudflare Durable Objects + Yjs WebSocket Provider 实现毫秒级多人实时协同光标与编辑同步。
   - **执行真机与外设验收**：完成 iOS Safari / iPadOS / Android Chrome 真机清单（`UNVERIFIED-01`）；在 CI 跑通 Playwright Firefox & WebKit（`UNVERIFIED-02`）；在 Staging Cloudflare Worker 联调真实 Google OAuth / Resend / R2 上传（`UNVERIFIED-03`）；在硬件 GPU 笔记本与中端手机执行 30 分钟 WebGL 漫游压测（`UNVERIFIED-04`）；本地 `wrangler dev` + `k6` 模拟并发压测 D1 读行数与上游限流降级（`UNVERIFIED-05`）。

### 6. 量化验收指标（Quantitative Acceptance Metrics）
- **测试覆盖与真实性**：Worker 测试 **100%** 运行于真实 `node:sqlite`；`AccountCenter`/`CollabSpace`/`StorageDB`/`sw.js`/`CRDT` 测试覆盖从 `0` 提升至核心路径 **100%** 覆盖；0 个占位式空壳 E2E 测试。
- **架构与体积瘦身**：`js/app.js` 单文件行数从 `3,899 LOC` 降至 **`< 1,800 LOC`**；仓库静态冗余二进制削减 **`>= 10 MB`**；不再同时打包两套天文与模糊检索库。
- **跨平台与全链路清零**：`UNVERIFIED-01` ~ `UNVERIFIED-05` **5/5 全部转正为已验证**，且无未决 P0/P1 遗留。
