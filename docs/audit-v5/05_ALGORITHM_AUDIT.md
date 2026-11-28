# KAIROS V5.0 核心业务算法审计报告（Phase 5 — Core Business Algorithms Audit）

- **审计对象**：`world-travel-globe` (`KAIROS V5.0`，commit `cfec5a3` / tag `v5.0.0`)
- **审计日期**：2026-11-28
- **审计范围**：四大核心算法域——（1）行程规划与多式联运（`TripPlanner` / `TransportService` / `RoutingService`）、（2）CRDT 同步合并（`ProfileCRDT`）、（3）团队 AA 分账结算（`ExpenseSplitter`）、（4）本地二维码编码与地理智能检索（`QRCodeService` / `GeoIntelligence`）
- **证据文件**：[`algorithm-audit-results.json`](file:///c:/Users/Liam/Desktop/旅游计划/globe-app/docs/audit-v5/evidence/algorithm-audit-results.json) · [`issues.json`](file:///c:/Users/Liam/Desktop/旅游计划/globe-app/docs/audit-v5/issues.json) · 生产截图 [`prod-12-planner-transport.png`](file:///c:/Users/Liam/Desktop/旅游计划/globe-app/docs/audit-v5/screenshots/prod-12-planner-transport.png) · [`prod-14-share-center.png`](file:///c:/Users/Liam/Desktop/旅游计划/globe-app/docs/audit-v5/screenshots/prod-14-share-center.png)
- **算法发现汇总**：共确认 **3 个 P0**（`KAIROS-004`, `KAIROS-005`, `KAIROS-007`）与 **4 个 P1/P2**（`KAIROS-018`, `KAIROS-019`, `KAIROS-020`, `KAIROS-025`）。

---

## 一、核心算法域审计总览

| 算法域 | 核心源文件 | 实测关键指标 / 反例 | 严重度 | 关联编号 |
| --- | --- | --- | --- | --- |
| **1. 行程规划与多式联运** | `js/modules/trip-planner.js`<br>`js/services/transport-service.js`<br>`js/services/routing-service.js` | 上海/北京/台北/首尔→东京返回跨海 HSR/Rail 可行；首尔→东京可自驾；`CITY_ALIASES` 5/10 失效；`trip.mode !== 'flight'` 死条件；2-opt 后光照重排距离翻倍（`22.92 → 45.84 km`）；IDL 经度跳变 `357.8°` | **P0 / P1** | `KAIROS-005`, `KAIROS-020` |
| **2. CRDT 合并引擎** | `js/services/crdt-merge.js`<br>`js/services/storage-db.js` | `mergeUserProfiles` 600/600 全过；`mergeTripDocuments` 600 次随机测试中 **440 次 (73.3%) 违反交换律**、**115 次 (19.2%) 违反结合律**；字母序 ID 重排破坏顺序；跨天移动重复；墓碑复活 | **P0 / P1** | `KAIROS-004`, `KAIROS-009` |
| **3. AA 分账结算** | `js/lazy/expense-splitter.js`<br>`js/lazy/collab-space.js` | `100/3` 净额和 `+0.01` 不守恒；`0.03/3` 丢失 1 分钱转账返回 `[]`；5 人反例贪心 4 笔 vs 最优 3 笔推翻「最优结算」宣称；忽略多币种/退款/已结清/重复参与人 | **P1** | `KAIROS-018` |
| **4. 本地 QR 码与 GeoIntelligence** | `js/services/qr-code.js`<br>`js/lazy/share-center.js`<br>`js/modules/geo-intelligence.js` | **V8 报 47 个 RS 错、V10 报 72 个 RS 错**完全不可扫码；Format Info Copy #2 全版本损坏；静默截断 >271 字节链接；空查询返回 28 条；5 个意图字段死代码；`jungle`→6 月、`元阳梯田 2026年`→预算 2026 | **P0 / P1 / P2** | `KAIROS-007`, `KAIROS-019`, `KAIROS-025` |

---

## 二、域一：行程规划与多式联运算法（`KAIROS-005`, `KAIROS-020`）

### 2.1 状态隔离与草稿泄露（`js/modules/trip-planner.js:184-195`）
- **已生成行程对象**：连续生成 Tokyo 与 Beijing 行程时，`tripTokyoId` (`trip_mwzwqps4_91ul`) 与 `tripBeijingId` (`trip_mwzwqps5_xj7b`) 实现独立对象隔离（`isolatedTrips: true`）。
- **草稿重置泄露**：`resetDraftForNewTrip()` 仅重置 `mode`、`selectedDestId`、`extraDestIds`、`destQuery`、`origin`、`days`、`budgetRmb` 共 7 个字段，遗漏 **9 个草稿状态字段**（`intercityMode`、`transportMode`、`extraDestQuery`、`hotelName`、`originCoords`、`startDate`、`travelers`、`currency`、`dailyStartTime`、`month`、`transferMode`、`pace`、`interest`）。实测证据显示重置后仍残留 `intercityMode: "hsr"`、`transportMode: "transit"`、`extraDestQuery: "京都"`、`hotelName: "Park Hyatt Tokyo"`。

### 2.2 过时 `CITY_ALIASES` 与城市匹配盲区（`js/modules/trip-planner.js:57-73, 151-182`）
- `CITY_ALIASES` 硬编码 V3/V4 旧版 ID，经 722 城全量图谱核验，**10 条别名中有 5 条失效**：
  - `paris: ['fr-paris', '巴黎']` → 不存在（实际为 `fr-paris-nw-paris`；搜索 `Paris` 首条反而命中 `fr-paris-nw-etretat-loire` 象鼻山）。
  - `london: ['uk-london', '伦敦']` → 不存在（实际为 `uk-south-london`）。
  - `new york` / `nyc`: `['us-east-nyc', '纽约']` → 不存在（实际为 `us-ne-metro-new-york`）。
  - `zurich: ['ch-zurich-lucerne', '苏黎世']` → 不存在（`topMatches: []` 完全空结果）。
  - `reykjavik: ['is-reykjavik-golden-circle', '雷克雅未克']` → 不存在（实际为 `is-sw-reykjavik-blue-lagoon`）。
- 此外，`resolveDestinationMatches` 仅做子串包含匹配，无拼写容错（`Tokio` / `Beijng` / `Kyooto` / `Parris` 均返回 `0`），且热门枢纽 `Amman`、`Honolulu`、`Antarctica` 无法命中。

### 2.3 多城市拼接缺失城际换乘段（`js/modules/trip-planner.js:381-466`）
- 对 `[cn-beijing, jp-kanto-tokyo]` 调用 `generateTripPlan` 生成 4 日行程：
  - `compareIntercityModes` 仅对 `primaryDest`（`cn-beijing`）计算，未生成北京→东京的跨城段（`missingBetweenCityLeg: true`）。
  - 所有景点被顺序摊平进 4 天桶中，**Day 2 同时混入北京与东京机位**，单日产生 **`2,111 km` 跨海瞬移**、当日直线累计 **`4,260 km`**。

### 2.4 跨海直线铁路与自驾谬误（`KAIROS-005`，`js/services/transport-service.js:108-205`）
- `compareIntercityModes` 仅凭球面直线距离 `haversineKm <= 2400` 与目的地 `hub.railHub.available` 判定铁路可行性，对公路仅判定 `!(hub.ferryLikely && distanceKm > 250)`，完全无视海洋阻隔、岛屿属性与出发地铁路连通性：

| 实测起讫点 | 生产截图 / 算法测试观测值 | 地理事实与严重错误 |
| --- | --- | --- |
| **上海 → 东京** | 生产站实拍 [`prod-12-planner-transport.png`](file:///c:/Users/Liam/Desktop/旅游计划/globe-app/docs/audit-v5/screenshots/prod-12-planner-transport.png) 显示 `HSR ~2074 km ~8h34m`、`RAIL ~20h0m` 可行并附 `Official Rail` 按钮 | 横跨东海，不存在任何跨海高铁/普通铁路 |
| **北京 ↔ 东京** | `hsr: {feasible: true, 2469 km, 605 min}`, `rail: {feasible: true, 2552 km, 1422 min}` | 横跨黄海/东海/日本海 |
| **台北 → 东京** | `hsr: {feasible: true, 2477 km, 607 min}`, `rail: {feasible: true, 2561 km, 1427 min}` | 台湾海峡+琉球海沟，无铁路连接 |
| **首尔 → 东京** | `hsr: true`, `rail: true`, **`driving: {feasible: true, 1430 km, 1072 min}`** | `ferryLikely: false` 且 `<1600km`，甚至宣称可从韩国直接自驾到东京 |
| **檀香山 → 茂宜岛** | **`coach: {feasible: true, 211 km, 196 min}`**, **`driving: {feasible: true, 210 km, 157 min}`** | 距离 `<250km` 绕过 `ferryLikely` 检查，宣称可在夏威夷群岛跨海坐大巴/开车 |
| **乌斯怀亚 → 南极布朗断崖** | **`flight: {feasible: true, 1158 km, 224 min}`** | 无商用民航机场，极地航段应标注探险邮轮（Expedition Vessel）而非商用航班 |

### 2.5 冲突检测死分支、2-opt 与光照重排退化、OSRM 误标与日界线跳变（`KAIROS-020`）
1. **死条件漏报高强度步行冲突**（`trip-planner.js:308`）：代码写 `if (totalKm > 240 && trip.mode !== 'flight')`，但 `trip.mode` 仅代表市内交通（`driving/walking/cycling/transit/mixed`），`flight` 只存在于 `trip.intercityMode`；且 `240 km` 阈值对 `walking` 无意义，实测 **94 km 步行 + 10 小时停留**返回 `warnings: []`。
2. **2-opt 起始顺序敏感与光照重排路线恶化**（`trip-planner.js:225-287`）：
   - 同一组景点正序输入 `83.09 km` 优化为 **`22.92 km`**（`['a','c','e','b','d']`），倒序输入仅优化为 **`25.79 km`**（`['e','a','c','b','d']`）。
   - `reoptimizeUnlockedDays` 在 `twoOptOptimize(nearestNeighborSort(unlocked))` 之后再调用 `orderDayStopsByLight(...)`，按“日出→午后→日落”强行重排，实测直接把已优化的 **`22.92 km` 路线撕裂翻倍至 `45.84 km`**！
3. **`nearestNeighborSort` 空坐标崩溃**（`trip-planner.js:214`）：未对 `remaining[i].coords` 做数组校验，遇到缺失坐标的机位直接抛出 `TypeError: Cannot read properties of undefined (reading '1')`。
4. **OSRM 故障误标跨海**（`routing-service.js:154-162`）：哪怕是北京城内 **`3.39 km`** 的陆路短途，只要 OSRM 超时或限流失败，兜底对象一律返回 `crossSea: true`（`overlandLocalWhenOsrmFails`）。
5. **国际日期变更线（IDL）经度跳变**：`buildGreatCircleCoordinates` 在 **Tokyo → Honolulu** 大圆弧插值中输出 `[177.8057, 31.1766]` 直跳 `[-179.9984, 30.5228]`，**单步经度跳变 `357.8°`**，在 MapLibre 2D/3D 投影下产生横穿全球的撕裂飞线。
6. **无开放时间与时区意识**：`hasOpeningHoursLogic: false`、`tripPlannerUsesTimezoneService: false`，无法拦截周一闭馆或跨时区到达日首站排期。

### 2.6 修复建议
- 引入基于 Natural Earth 陆地多边形 / 陆块连通图（`landmassId` + `fixedRailLink` / `ferryOnly` 标签）的跨海物理约束，彻底禁止跨海 HSR/Rail/Coach/Driving 虚假可行性；对高纬度南极航线展示探险船方案。
- 全量同步 `CITY_ALIASES` 并在构建期/测试期强制断言每个别名命中 `TRAVEL_ATLAS`，同时接入已内置的 `Fuse.js`/`MiniSearch` 做模糊兜底；完整重置 `plannerDraft` 全部 16 个字段。
- 多城市规划显式插入城际转移日（`transferLeg`），禁止将不同国家/城市景点混排入同一天；将 `detectTripConflicts` 改为按 `trip.mode` 分档阈值（`walking > 12 km`、`cycling > 45 km`、`driving > 260 km`）。
- 用时间窗约束 TSP（Time-Windowed Routing，先按光照时段分桶、桶内做 2-opt 并以桶衔接点做最近端对齐）替代“先 2-opt 后全局按光照打散”；区分 `routingError` 与 `crossSea`；使用 `@turf/great-circle` 或按 `±180°` 切分 `MultiLineString` 修复 IDL 飞线。

---

## 三、域二：CRDT 合并算法审计（`KAIROS-004`, `KAIROS-009`）

### 3.1 `mergeUserProfiles` vs `mergeTripDocuments` 600 次随机属性测试

测试文件 [`js/services/crdt-merge.js`](file:///c:/Users/Liam/Desktop/旅游计划/globe-app/js/services/crdt-merge.js) 的两个核心入口在 600 次随机三副本属性测试中呈现截然相反的数学表现：

| 测试函数 | 随机试验次数 | 交换律失败 `merge(A,B) !== merge(B,A)` | 结合律失败 `merge(merge(A,B),C) !== merge(A,merge(B,C))` | 幂等律失败 | 结论 |
| --- | --- | --- | --- | --- | --- |
| `mergeUserProfiles` | 600 | **0 (0.0%)** | **0 (0.0%)** | 0 | 符合 Join-Semilattice |
| `mergeTripDocuments` | 600 | **440 (73.3%)** | **115 (19.2%)** | 0 | **严重非交换/非结合 (P0)** |

### 3.2 `mergeTripDocuments` 五大结构性缺陷与反例剖析

1. **违反交换律（440/600 失败，`crdt-merge.js:341-347`）**：
   `ingestDays` 首次遇到 `dy.day` 时直接 `dayMap.set(dy.day, { title: dy.title })`，后续副本的 `dy.title` 被丢弃。
   - **实测反例（Trial 0）**：副本 A 中 Day 1 标题为 `"Day 1-1"`，副本 B 中为 `"Day 1-0"`。`merge(A, B)` 产出 `"Day 1-1"`，而 `merge(B, A)` 产出 `"Day 1-0"`，**合并结果依赖调用顺序**。
2. **违反结合律（115/600 失败，`crdt-merge.js:352`）**：
   Tombstone 判定使用 `const stTs = Number(st.updatedAt || winner.updatedAt || 0)`。当 `st.updatedAt` 缺失时，是否借用 `winner.updatedAt` 取决于二元合并时的胜出文档。
   - **实测反例（Trial 8）**：三副本 A (`updatedAt:1000`, `s_2` 无 `updatedAt`, `tombstone(s_2)=1600`)、B (`updatedAt:1300`, `s_2.updatedAt:1700`)、C (`updatedAt:1900`, `s_2` 无 `updatedAt`)。`merge(merge(A,B), C)` 中 `A⊕B` 阶段先用 `tombstone(1600)` 删掉无时间戳的 A.`s_2`；而 `merge(A, merge(B,C))` 中 `B⊕C` 阶段借用了 C 的 `updatedAt=1900 > 1600` 使 `s_2` 逃过墓碑清理并在 Day 1 复活，最终 `ab_c` Day 1 仅 2 站而 `a_bc` Day 1 变成 3 站！
3. **按字符串 `id` 字典序强行排序破坏用户行程顺序（`crdt-merge.js:367`）**：
   `stops: [...d.stopMap.values()].sort((x, y) => String(x.id).localeCompare(String(y.id)))`
   - **实测反例**：用户输入顺序 `['s_z', 's_a']` 合并后被强制打乱为 `['s_a', 's_z']`，完全摧毁手工拖拽或 2-opt 优化顺序。
4. **跨天移动站点导致多天同时复制幽灵站（`crdt-merge.js:341-356`）**：
   `stopMap` 挂在每`day` 内部而非行程全局唯一索引。副本 B 将 `s_1` 从 Day 1 移至 Day 2、副本 A 编辑了 Day 1，合并后 `s_1` 同时出现在 `day1Stops: ['s_1']` 与 `day2Stops: ['s_1']`。
5. **墓碑复活与版本恢复回退（`crdt-merge.js:352` & `storage-db.js:479-492`）**：
   - 行程级 `TripPlanner` 生成的站点默认无 `st.updatedAt`（`trip-planner.js:417-426`），一旦同文档内另一处发生编辑将 `trip.updatedAt` 推升至 `300`，之前在 `tombstoneTs=200` 删除的 `s_1` 即刻复活。
   - `StorageDB.restoreLatestBackupSnapshot()` 传入 `{ preserveTimestamp: true }`，导致恢复的 `"Version 1 (Restored)"` 在后续同步中被旧时钟更高但用户想回退的 `"Version 2 (Unwanted Later Edit)"` 覆盖（`restoreLostToOlderClock: true`）。

### 3.3 修复建议
- 将 `mergeTripDocuments` 重构为全局唯一 `stopMap: stopId -> LWWRecord({ day, rank, updatedAt, actorId, ...fields })` + `dayTitleMap`（独立 LWW 比较 `dayUpdatedAt` + 确定性字典序平局裁决），彻底消除天间重复与顺序依赖；使用分数索引（Fractional Indexing）或 RGA 维持站点顺序而非按 `id` 排序。
- 禁止用父级 `winner.updatedAt` 替代缺失的 `st.updatedAt`；在站点创建/修改时强制写入 `updatedAt` 与单调 `clock`。
- 长期推荐直接引入已成熟的 **Yjs** (`Y.Doc` + `Y.Map` + `Y.Array`) 替代手写文档 CRDT，并配置 `fast-check` 1,000+ 次属性测试门禁。

---

## 四、域三：团队 AA 分账结算算法（`KAIROS-018`）

### 4.1 数值守恒、舍入丢债与业务规则缺失（`js/lazy/expense-splitter.js:11-82`）

| 测试场景 | 源码行为与实测结果（`algorithm-audit-results.json`） | 根因定位 |
| --- | --- | --- |
| **1. `100 / 3` 均分守恒破坏** | `Alice: +66.67, Bob: -33.33, Carol: -33.33`，`netBalanceSum: +0.01`，`transferSum: 66.66`，`conservationGap: 0.01` | 每笔消费用浮点 `amt / pool.length` 累加，最后对净额各自 `Math.round(rawBal * 100) / 100`，缺少分（cent）级余数分配。 |
| **2. `0.03 / 3` 丢失 1 分钱债务** | `Alice: +0.02, Bob: -0.01, Carol: -0.01`，但 **`transfers: []`**（0 笔转账！） | `L54-55` 与 `L68` 使用严格不等式 `bal < -0.01`、`bal > 0.01`、`pay > 0.01`，将正好 `±0.01` 的债务全部静默吞掉。 |
| **3. 浮点误差积累** | 虽在 `1.31` 样例中 `round2` 暂掩盖误差，但累加阶段全程使用 IEEE-754 二进制浮点而非整数分。 | 未采用整数最小货币单位（cents）。 |
| **4. 自定义分账总额不匹配** | `totalAmount: 100`，`customShares: {u1: 20, u2: 30}`（合计 50），输出 `netBalanceSum: 50`、`transfers: [Bob→Alice: 30]`，凭空蒸发 50 元。 | `L28-33` 未校验 `sum(customShares) === amt`。 |
| **5. 重复参与人重复扣款** | `participants: ['u1', 'u1', 'u2']` 分摊 90，`u1` 被扣两次（净额 `+30`），`u2` 净额 `-30`。 | `L35-42` 未对 `pool` 执行 `new Set(...)` 去重。 |
| **6. 多币种直接混加** | `100 CNY + 10000 JPY` 未换算汇率直接相加得 `totalAmount: 10100`。 | 忽略 `exp.currency` 与 `exp.amountRmb`/`amount_cny`。 |
| **7. 退款与已结清标志失效** | `-50` 退款被 `if (amt <= 0) return;` 静默跳过；`settled: true` 流水仍计入待结算。 | 未支持冲正/退款及过滤 `settled` 标记。 |

### 4.2 五人反例：推翻「最优结算 / Minimum-Transfer」宣称

`expense-splitter.js:11` 注释、`collab-space.js:161,176` UI 标题以及中英文用户手册（L304/L307）均宣称实现了**「最优转账结算方案 / Minimum-Transfer Settlement」**。但代码 `L58-75` 实际采用的是“最大债务人配对最大债权人”的贪心算法（已知非全局最优，Minimum Cash Flow 属于 NP-hard 的子集零和分解问题）。

- **精确 5 人反例净额**：`A: +60, B: -60, C: +50, D: +20, E: -70`（净额和为 `0`）。
- **KAIROS 贪心输出（4 笔转账）**：
  1. `E → A: 60`（剩余 `E: -10`）
  2. `E → C: 10`（剩余 `C: +40`）
  3. `B → C: 40`（剩余 `B: -20`）
  4. `B → D: 20`
- **数学最优解（3 笔转账，减少 25% 转账次数）**：
  1. `B → A: 60`（完美零和子集 `{A, B}` 直接消去）
  2. `E → C: 50`
  3. `E → D: 20`

### 4.3 修复建议
- 全部金额转入**整数分（cents）**运算，单笔分摊采用**最大余数法（Largest Remainder Method / Hamilton）**分配余数分，严格保证单笔分摊之和 `=== amountCents` 且全团 `sum(netCents) === 0`；消除 `0.01` 吞账阈值，改为 `!== 0`（即 `>= 1` 分）。
- 消费入账时优先按 `amountCny` / `TransportService` 汇率折算为统一结算币种；对 `participants` 去重、校验 `customShares` 总额误差、支持 `settled` 过滤与负数退款/冲正。
- 鉴于家庭/旅行 AA 团队通常 `N <= 12`，对精确零和配对（先消去完全相等的 `debts[i] === credits[j]`，再用 Bitmask DP / DFS 寻找最大零和子集划分）可在 `<1 ms` 内求得真正最小转账次数；若保留贪心算法，则必须将 UI 与文档改名为「简化结算方案（Simplified Settlement）」。

---

## 五、域四：本地 QR 码编码与 GeoIntelligence 算法

### 5.1 本地二维码生成器位级缺陷（`KAIROS-007`, `KAIROS-019`, `js/services/qr-code.js`）

通过自研独立 ISO/IEC 18004 + GF(256) Reed-Solomon 位级解码器对 [`js/services/qr-code.js`](file:///c:/Users/Liam/Desktop/旅游计划/globe-app/js/services/qr-code.js) 生成矩阵实测验证：

| 测试用例 | 字节数 / 版本 | 对齐图形缺失 | 版本信息块 | Format Info Copy #2 | RS 校验子失败数 | 解码结果 |
| --- | --- | --- | --- | --- | --- | --- |
| 短链接 | 40 B / V3 (29×29) | 无 | N/A | **`0x-3c` (损坏)** | 0 | 仅靠 Copy #1 勉强可读，但静区 `quiet=2` 不合规 |
| 中文 UTF-8 | 58 B / V4 (33×33) | 无 | N/A | **`0x-3c` (损坏)** | 0 | 同上 |
| V6 边界 | 122 B / V6 (41×41) | 无 | N/A | **`0x-3c` (损坏)** | 0 | 同上 |
| **V8 长链接** | **163 B / V8 (49×49)** | **缺 5 个** `[6,24],[24,6],[24,24],[24,42],[42,24]` | **缺失 (false)** | **`0x-3c` (损坏)** | **47** | **完全乱码不可读**：`"https://woq..."` |
| **V10 长链接** | **335 B / V10 (57×57)** | **缺 5 个** `[6,28],[28,6],[28,28],[28,50],[50,28]` | **缺失 (false)** | **`0x-3c` (损坏)** | **72** | **截断至 271B 且完全乱码**：`"https5..."` |
| **真实 `?trip=` 链接** | **2465 B / V10 (57×57)** | **缺 5 个** | **缺失 (false)** | **`0x-3c` (损坏)** | **72** | **静默截断丢弃 89% 数据且完全乱码** |

**具体根因**：
1. **`qr-code.js:158-165`**：`ver >= 2` 时仅在 `(size-7, size-7)` 画 1 个对齐图形（Alignment Pattern），V7+ 需要 6 个对齐图形，缺了 5 个导致位流 Z 字形填充跳过坐标错位。
2. **完全缺失 Version Information 块**：`ver >= 7` 应在右上角与左下角写入 6×3 的 18-bit Golay 编码版本信息，源码未实现也未在 `fixed[][]` 预留掩码位置，数据比特直接覆盖保留区导致 RS 解码崩溃（47/72 个校验子错误）。
3. **`qr-code.js:204` 全版本损坏 Format Info Copy #2**：写 `if (i < 8) mat[size - 1 - i][8] = bit; else mat[8][size - 15 + i] = bit;`，当 `i === 7` 时本应写到右上角 `(8, size - 8)`，却错误覆写了左下角保留暗模块 `(size - 8, 8)`（正确条件应为 `i < 7`）。
4. **静默截断与静区违规**：`L85` `bytes.slice(0, dataCap - 3)` 将 2,465 字节的真实行程分享链接静默截断为 271 字节（且超过 V10 后 `ver` 为 10 写入 16-bit 长度却仅截断至 `271` 字节）；`L216` `quiet = 2` 低于 ISO 18004 要求的最小 4 模块静区。
5. **调用契约错误（`js/lazy/share-center.js:100`）**：`ShareCenter` 调用 `QRCodeService.renderSvg(shareUrl, 136)` 传入裸数字而非 `{ size: 136 }`，`renderSvg` 回退默认值 `180px`，在 [`prod-14-share-center.png`](file:///c:/Users/Liam/Desktop/旅游计划/globe-app/docs/audit-v5/screenshots/prod-14-share-center.png) 中直接撑破 `164px` 白色容器。

### 5.2 GeoIntelligence 自然语言解析、排序与向量偏差（`KAIROS-025`, `js/modules/geo-intelligence.js`）

1. **空查询返回 28 条结果（`L383-387, 521`）**：`""` 与 `"   "` 时 `directHay.includes("")` 恒为 `true`，且 `dest.priority === 1` 的目的地加 4 分满足 `total > 0`，导致空输入即返回 28 个默认推荐。
2. **5 个已解析意图标志为死代码**：`parseNaturalQuery` 解析并向用户展示 Tag 芯片的 `preferWarm`、`preferCool`、`preferTransit`、`photoScene`、`pace` 在 `searchAndExplain`（`L355-559`）中**从未被读取**（测试 `"高铁方便 慢游 日照金山 温暖 避暑"` 虽全部分析出，排序仍只给 `cn-beijing / cn-mohe / cn-changbaishan` 各 90 分）。
3. **贪心否定正则吃掉后续肯定词（`L120`）**：`negRe = /(?:不要|避开|...)([^，,;；。]+)/gi` 无空格/连词截断，查询 `"不要海滩 雪山"` 把 `"雪山"` 吞入否定子句导致 `excludeTags: ['snow','coast','mountain']` 并返回 **0 条结果**。
4. **英文月份词干误匹配（`L141-145`）**：`\b${MONTH_NAMES_EN[i].slice(0, 3)}(?:[a-z]*)\b` 匹配任意前缀单词，实测 `"june or jungle adventure"` 中的 `"jungle"`（含 `jun`）被误判为 `month: 6`（实际因 `june` 先命中或单写 `jungle trek` 亦会触发 `6月`）；`"march to marine coast"` 中若单独含 `"marine"`（含 `mar`）即误触发 `month: 3`。
5. **地名中的汉字「元」触发年份误判为预算（`L158, 164`）**：查询 `"元阳梯田 2026年"` 时，`rmbMatch` 捕获数字 `2026`，随后的 `/元|.../.test(cleanedForPositive)` 命中 `"元阳"` 的 `"元"` 字，导致 **`maxBudgetRmb: 2026`**，把大量高预算目的地错误过滤，仅剩沈阳/天津/大同。
6. **硬性大洲约束可被 `msScore >= 5` 绕过（`L390`）**：`if (intent.hasIntent && intent.continent && dest.continent !== intent.continent && msScore < 5)` 导致查询 `"类似瑞士 平替"`（`continent: 'europe'`）时，南美的 `ar-west-nw-bariloche` 因简介含“小瑞士”使 `msScore >= 5` 而排在第一，破坏大洲硬过滤；且 `"欧洲或亚洲看雪山"` 的 `for...break` 仅取第一个命中的 `europe` 丢弃 `asia`。
7. **`transitScore` 欧洲/东亚偏置（`L663-664`）**：正则仅凭国名/大洲名判断公交分，令荒野极地的冰岛（`icelandTransitScore: 0.85`）交通分反超地铁网极度发达的新加坡（`singaporeTransitScore: 0.72`），开罗也因包含 `architecture` 标签获得 `0.72`。

### 5.3 修复建议
- **QR 码**：直接替换为久经验证的 MIT 库（如 `nayuki/QR-Code-generator` 或 `qrcode-generator`），支持 **Version 1–40**、合规 **4-module 静区**与完整 EC/Format/Version 块；修复 `ShareCenter` 传 `{ size: 136 }`；对超长 `?trip=` URL 采用 `lz-string` 压缩或后端短链，超限显式提示而非静默截断。
- **GeoIntelligence**：空字符串直接短路返回 `[]`；英文月份使用精确全拼+标准缩写白名单（如 `\b(?:jan|january|...)\b`）；否定正则遇空格/连词（`和/与/但/and/but`）停止；预算正则要求数字紧邻币种单位（`2026\s*(?:元|块|rmb|cny)`）并排除 `202\d\s*年`；严格执行 `intent.continent`（支持多洲数组 `continents[]`）；将 `preferWarm/Cool/Transit/photoScene/pace` 真正接入打分函数；用 `hubs.json` 的真实机场/高铁/地铁元数据替代大洲正则计算 `transitScore`。
