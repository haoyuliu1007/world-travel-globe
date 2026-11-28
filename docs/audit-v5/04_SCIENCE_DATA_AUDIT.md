# KAIROS V5.0 科学计算与全球旅游数据深度审计报告 (`04_SCIENCE_DATA_AUDIT`)

- **审计版本**：KAIROS V5.0 (`v5.0.0` · Commit `cfec5a3`)
- **审计范围**：物候模型 (`scripts/validate-phenology.js`、`js/modules/phenology-engine.js`)、天文与摄影光学模块 (`js/modules/photo-simulator.js`、`js/modules/terrain-3d.js`、`js/modules/solar-terminator.js`、`js/modules/bright-stars.js`、`js/services/timezone-service.js`、`js/services/weather-service.js`、`vendor/suncalc.min.js`、`vendor/astronomy.browser.min.js`)、以及全量全球地理旅游数据集 (`data/` 56 个数据脚本 + `data/transport/hubs.json` + `data/i18n/en/*.json`)。
- **审计方法**：全量机器脚本复现、独立参考库交叉验证 (`Astronomy Engine` vs `SunCalc`)、OLS/LOOCV/基线对比统计检验、722 目的地 / 5,414 机位全量自动化扫描 + 分层抽样人工核验 (`40` 目的地 = `5.5%`，`60` 摄影机位 = `1.1%`)。
- **证据源文件**：`docs/audit-v5/evidence/science-audit-results.json`、`docs/audit-v5/evidence/data-audit-results.json`、`docs/audit-v5/issues.json`。
- **关联缺陷编号**：`KAIROS-015` (P1)、`KAIROS-016` (P1)、`KAIROS-017` (P1)、`KAIROS-029` (P2)。

---

## 第一部分：物候模型与校准验证审计（Phenology Audit · `KAIROS-015`）

### 1.1 `validate-phenology.js` 完全复现核验

审计脚本完整复现了 `scripts/validate-phenology.js` 对 `BLOSSOM_BENCHMARKS`（13 城）与 `AUTUMN_BENCHMARKS`（11 城）的一元线性回归拟合与留出集（Holdout）评估，复现参数与仓库保存的 `data/enrichment/phenology-validation.json` **逐位一致**（`blossomParamsMatch: true`、`autumnParamsMatch: true`）：

| 模型分支 | 特征构造公式 (`X`) | 拟合截距 (`intercept`) | 拟合斜率 (`slope`) | 声明 Holdout MAE | 声明 Holdout RMSE | 参数复现状态 |
|---|---|---|---|---|---|---|
| **春季花期 (`blossom`)** | `lat * 0.45 - springMeanC * 4.8` | `131.732` | `1.215` | `2.89 天` | `3.64 天` | 完全匹配 (`true`) |
| **秋季红叶 (`autumn`)** | `autumnMeanC * 5.2 - elevM * 0.0045 - lat * 0.35` | `266.598` | `0.911` | `4.84 天` | `6.03 天` | 完全匹配 (`true`) |

> **关键源码定位**：`scripts/validate-phenology.js:25-53, 114-125`；`data/enrichment/phenology-validation.json:11-29`。

### 1.2 合成异常模板、静态气候均值与未使用的 `winterMeanC` 证据

尽管 `validate-phenology.js:13-16` 声称采用“2015–2024 奇数年拟合 vs 偶数年真实历史物候与气候序列”，但对原始基准数组的逆向统计分析揭示了**三项严重方法学失真**：

1. **确定性合成异常模板（Synthetic Anomaly Templates）**：
   - 将每个城市的 `fitYearsDoy` 与 `holdoutYearsDoy` 减去首年拟合值 `fitYearsDoy[0]` 得到年际偏移序列 `fitOffsetsFromFirst` 与 `holdoutOffsetsFromFirstFit`：
   - **秋叶基准 (`11` 城)**：11 座跨三大洲的城市的 5 个拟合年偏移量竟然**仅落入 3 个几乎相同的模板**（`uniqueFitOffsetPatternsCount = 3`）：`[0, 3, -2, 4, 1]`、`[0, 4, -2, 5, 1]`、`[0, 3, -2, 5, 1]`；5 个留出年偏移量也**仅落入 3 个固定模板**（`uniqueHoldoutOffsetPatternsCount = 3`）：`[1, -1, 5, -2, 2]`、`[1, -1, 6, -2, 2]`、`[1, -1, 6, -2, 3]`。
   - **春花基准 (`13` 城)**：同样呈现出高度规律化的正负交替人工偏移（如武汉 `[0, 2, -2, 3, -1]` / `[1, -1, 4, -2, 2]`；东京 `[0, 2, -3, 4, -2]` / `[1, -1, 5, -4, 0]`；所有 13 城 `holdoutOffsetsFromFirstFit[0]` 恒为 `+1`、`[1]` 恒为 `-1`或`-2`），拟合均值与留出均值差 `meanShift` 全部被锁定在 `[-0.4, +0.4]` 天（秋叶全部在 `[-0.4, -0.2]` 天）。
   - 这证明所谓“10 年独立观测数据”实质上是围绕各城单一气候平均日叠加了 3 类人工合成年际抖动模板，而非真实逐年气象与物候观测记录。
2. **静态单一温度均值替代逐年气温预测因子**：
   - 每个城市仅提供单一静态 `springMeanC` 或 `autumnMeanC`（无 2015–2024 逐年积温或初霜日序列），导致同一城市所有 5 个留出年份的预测值完全相同（单个静态常数 `predDoy`），模型根本无法预测真实的“早春暖冬提前 / 倒春寒推迟”年际波动。
3. **`winterMeanC` 字段完全未被使用**：
   - `BLOSSOM_BENCHMARKS`（`scripts/validate-phenology.js:26-38`）为全部 13 个城市定义了 `winterMeanC`（春化/休眠期冬季均温，如哈尔滨/札幌 `-2.6°C` 至杭州 `5.5°C`），但在实际特征计算函数 `springFeature`（`L114`：`r.lat * 0.45 - r.springMeanC * 4.8`）中**从未读取 `winterMeanC`**，使冬季冷激（chilling requirement）机制形同虚设。

### 1.3 基线对比：城市拟合年均值基线显著击败 KAIROS OLS 与 LOOCV

独立评估对比了四种预测方法在 `holdoutYearsDoy` 上的真实误差表现：

| 预测模型 / 基线方法 | 春季花期 MAE | 春季花期 RMSE | 秋季红叶 MAE | 秋季红叶 RMSE | 科学评估结论 |
|---|---|---|---|---|---|
| **城市拟合年均值基线 (City Fit-Year Mean)** | **`2.09 天`** | **`2.57 天`** | **`2.22 天`** | **`2.66 天`** | **最优**（仅用本地历史平均日即领先） |
| **KAIROS 线性回归模型 (OLS)** | `2.89 天` | `3.64 天` | `4.84 天` | `6.03 天` | 跨城线性拟合反而在留出集上**劣于**单城历史均值 |
| **留一交叉验证 (LOOCV Linear Model)** | `3.20 天` | `4.04 天` | `5.85 天` | `7.20 天` | 样本外泛化误差进一步扩大（秋叶比均值基线差 `+3.63d`） |
| **全局常数均值基线 (Global Constant Mean)** | `12.68 天` | `15.28 天` | `17.05 天` | `20.51 天` | 仅用于证明空间纬度差异存在，不代表模型具备年际预测力 |

**误差最严重的校准城市典型样本**：
- **秋季红叶**：`us-ne-nature-stowe-green-mountains`（佛蒙特斯托糖枫，预测 DOY `291` vs 观测均值 `279.0`，**MAE = `12.0 天`**）；`cn-jiuzhaigou`（九寨沟彩林，预测 `288` vs 观测 `295.0`，**MAE = `7.0 天`**）；`jp-kansai-kyoto`（京都红叶，预测 `321` vs 观测 `327.4`，**MAE = `6.4 天`**）；`us-or-co-aspen-san-juan`（阿斯彭白杨，预测 `277` vs 观测 `271.0`，**MAE = `6.0 天`**）。
- **春季花期**：`cn-linzhi`（林芝野桃花，预测 `94` vs 观测 `87.6`，**MAE = `6.4 天`**）；`jp-kansai-kyoto`（京都樱花，预测 `85` vs 观测 `89.2`，**MAE = `4.2 天`**）；`jp-kanto-tokyo`（东京樱花，**MAE = `3.0 天`**）；`jp-kanto-fuji-hakone`（河口湖樱花，**MAE = `2.8 天`**）。

### 1.4 覆盖盲区：23 个北半球温带城 vs 699 个 Tier B 城市模型缺陷

`atlas-enrichment.json` 与 `phenology-engine.js` 的覆盖度统计揭示出“校准子集极度局限，全球推演过度简化”的结构性问题：

1. **Tier 分层分布失衡**：
   - 全库 722 座目的地中，**Tier C（实证校准子集）仅 23 城（`3.2%`）**，**Tier B（气候高程增强）占 699 城（`96.8%`）**，**Tier A 为 0 城**。
   - 23 座 Tier C 城市**100% 位于北半球中纬度温带**（纬度区间 `29.15°N – 52.37°N`，覆盖中/日/韩/美/荷/加/奥 7 国），**南半球数量 = 0（全库实际 177 城）**，**热带数量 = 0（全库实际 216 城）**，**极地数量 = 0（全库实际 18 城）**。
2. **699 座 Tier B 城市的硬编码与生态学谬误 (`js/modules/phenology-engine.js`)**：
   - **硬编码 `uncertaintyDays = 8` (`L243-245`)**：所有非天文类的 699 座 Tier B 城市均统一赋予无依据的 `±8 天` 波动区间。
   - **全球统一适温钟形阈值 (`L444, L469`)**：秋季落叶硬编码理想温度 `10°C`（`100 - |tempC - 10| * 4.5`），春季开花硬编码理想温度 `16°C`（`100 - |tempC - 16| * 4.2`），未区分树种、干湿季、光周期或地中海/季风/热带气候物候。
   - **热带城市荒谬的温带物候输出**：实测 `sg-marina-civic`（新加坡，`1.28°N` 赤道热带）在 6 月查询 `blossom` 返回 `suitability: 63`、`peakWindowText: "Mar – May"`、`±8d`；在 10 月查询 `autumn` 竟返回 `suitability: 50`、`peakWindowText: "Late Sep – Mid Nov"`（赤道常绿雨林城市输出“温带秋叶窗口”）。
   - **极地/南半球季节窗口硬编码错位 (`L383-384`)**：`milkyway` 分类只要 `gcPeakAlt !== null`（即全天任意暗夜时段存在即可），便对所有北半球地点返回 `"3月–10月无月光深夜"`，对所有南半球地点返回 `"2月–10月"`，忽视高纬夏季无天文黑夜或热带雨季影响。

---

## 第二部分：天文星历、3D 地形遮挡与摄影光学审计（Astronomy & Photography · `KAIROS-016`）

### 2.1 14 场景 `Astronomy Engine` 独立交叉验证对照表

审计脚本选取全球高纬极昼/极夜、南半球、非整点时区、DST 跳变日、大经度时差及高山日照金山等 **14 个关键边界场景**，以权威星历库 `Astronomy Engine` (`vendor/astronomy.browser.min.js`) 作为基准，对 KAIROS 的 `SunCalc` 调用方式、`SolarTerminator`、`BrightStars`、`TimezoneService` 进行逐项比对：

| # | 测试场景与日期 (本地时间) | 时区 (IANA / 偏移) | 太阳高度/方位误差 (`SC - AE`) | 晨昏线几何差 | 日出误差 (无偏移 / 传偏移) | 日落误差 (无偏移 / 传偏移) | 月相/月出落关键异常 | 银河中心 (GC) 误差 |
|---|---|---|---|---|---|---|---|---|
| 1 | **加德满都** `2026-06-21 12:00` | `Asia/Kathmandu` (`UTC+5:45`) | `-0.001°` / `-0.071°` | `-0.002°` | `-0.01m` / `-0.01m` | `+0.06m` / `+0.06m` | 月出/落均一致 | `0.0°` (`33.3°`) |
| 2 | **特罗姆瑟 (极昼)** `2026-06-21 12:00` | `Europe/Oslo` (`UTC+2 DST`) | `+0.001°` / `-0.008°` | `-0.001°` | `null` (`alwaysUp`) | `null` (`alwaysUp`) | **月落未传偏移 `00:13` vs 正确 `00:37` (-24m)**；`astroDusk=null` 标为 Polar | `0.0°` (无暗夜) |
| 3 | **特罗姆瑟 (极夜)** `2026-12-21 12:00` | `Europe/Oslo` (`UTC+1`) | **`-0.145°`** / `-0.004°` | `+0.004°` | `null` (`alwaysDown`) | `null` (`alwaysDown`) | `moonrise/set=null` 被误标 `Polar Day/Night` | `0.0°` (无暗夜) |
| 4 | **乌斯怀亚 (南半球)** `2026-12-21 18:00` | `America/Punta_Arenas` (`UTC-3`) | `+0.005°` / `+0.003°` | `0.000°` | `+0.03m` / `+0.03m` | `0.00m` / `0.00m` | `astroDusk=null`（持续天文暮光）**被误标 `Polar Day/Night`** | `0.0°` (无暗夜) |
| 5 | **京都 (中纬春晨)** `2026-04-05 06:00` | `Asia/Tokyo` (`UTC+9`) | `-0.003°` / `-0.008°` | `-0.003°` | `+0.02m` / `+0.02m` | `+0.06m` / `+0.06m` | 正常；`appAstroDawn` `04:10` vs AE `04:12` | `0.0°` (`25.7°`) |
| 6 | **雷克雅未克 (高纬夏至)** `2026-06-21 23:30` | `Atlantic/Reykjavik` (`UTC+0`) | `+0.004°` / `-0.005°` | `0.000°` | `-0.16m` / `-0.16m` | **`+1440.4m (整整24h偏差)`** / `+0.21m` | **未传 `utcOffset` 致日落跳变至前一日**；月落 `01:03` vs `01:11` (-8m) | `0.0°` (无暗夜) |
| 7 | **马丘比丘 (南热带夜)** `2026-07-15 22:00` | `America/Lima` (`UTC-5`) | **`+0.280°`** / `-0.003°` | `0.000°` | `-0.01m` / `-0.01m` | `+0.05m` / `+0.05m` | 太阳高度 `-60.6°` 处受 SunCalc 夜间折射钳位产生 `+0.28°` 偏差 | `0.0°` (**`74.2°`**) |
| 8 | **富士山河口湖** `2026-11-15 06:15` | `Asia/Tokyo` (`UTC+9`) | **`-0.156°`** / `-0.001°` | `+0.008°` | `+0.01m` / `+0.01m` | `0.00m` / `0.00m` | 地平线以下 `-1.29°` 处折射差异 `-0.156°` | `0.0°` |
| 9 | **梅里雪山飞来寺** `2026-11-15 07:20` | `Asia/Shanghai` (`UTC+8`) | **`-0.122°`** / `-0.001°` | `+0.008°` | `+0.01m` / `+0.01m` | `0.00m` / `0.00m` | 地平线以下 `-5.92°` 处折射差异 `-0.122°` | `0.0°` |
| 10 | **纽约 (DST 夏令时当日中午)** `2026-03-08 12:00` | `America/New_York` (`UTC-4 DST`) | `+0.002°` / `-0.013°` | `+0.002°` | `+0.02m` / `+0.02m` | `+0.05m` / `+0.05m` | **月出未传偏移误报 `00:41`，传入偏移后应为 `null`** | `0.0°` (`17.1°`) |
| 11 | **纽约 (DST 跳变前 01:30)** `2026-03-08 01:30` | `America/New_York` (`UTC-5`) | **`+0.191°`** / `-0.014°` | `+0.001°` | `+0.02m` / `+0.02m` | `+0.05m` / `+0.05m` | 时区正确收敛至跳变前 `UTC-5`；夜间折射偏差 `+0.191°` | `0.0°` (`17.1°`) |
| 12 | **纽约 (DST 回退日中午)** `2026-11-01 12:00` | `America/New_York` (`UTC-5`) | `+0.002°` / `-0.005°` | `+0.005°` | `+0.02m` / `+0.02m` | `+0.02m` / `+0.02m` | `TimezoneService` 准确判定 `isDst: false` | `0.0°` |
| 13 | **火奴鲁鲁 (北热带)** `2026-06-21 12:00` | `Pacific/Honolulu` (`UTC-10`) | `-0.005°` / `+0.009°` | `0.000°` | `-0.01m` / `-0.01m` | `+0.06m` / `+0.06m` | **月落未传偏移丢失 (`null` vs `00:08`)** | `0.0°` (`39.7°`) |
| 14 | **喀什 (大经度时区偏差)** `2026-06-21 12:00` | `Asia/Urumqi` (`UTC+6`) | `-0.002°` / `-0.014°` | `-0.002°` | `-0.02m` / `-0.02m` | `+0.06m` / `+0.06m` | **月落未传偏移 `00:42` vs 正确 `00:19` (+23m)** | `0.0°` (`21.6°`) |

> **附注**：`js/modules/bright-stars.js` 在 `2026-07-15T03:00:00Z` 实测几何高度角 `74.129°` vs `Astronomy Engine` 无折射 `74.130°`，误差仅 **`0.00°`**；`js/services/timezone-service.js` 在全部 14 场景（含尼泊尔 `UTC+5:45`、纽约 DST 双日跳变点）均实现 `100%` 准确偏移解析。

### 2.2 关键代码缺陷逐项剖析

1. **雷克雅未克夏至 `+1440.4 分钟` (24 小时) 日落跳变 Bug (`photo-simulator.js:501, 512`)**：
   - `PhotoSimulator` 虽然引入了支持 `utcOffset` 的 `SunCalc3` (`vendor/suncalc.min.js:181`)，但调用时写作 `SunCalc.getTimes(noonDt, lat, lng)` 和 `SunCalc.getMoonTimes(noonDt, lat, lng)`，**遗漏了 `utcOffset` 参数**。
   - 在雷克雅未克 `2026-06-21`（日落发生在本地 `00:03`，略过子夜），未传 `utcOffset` 导致 `SunCalc` 以太阳中天窗口截断，将次日凌晨的日落归入前一日或跳变 `+1440.4 min`；同时导致特罗姆瑟月落偏差 `24 min`、喀什月落偏差 `23 min`、火奴鲁鲁月落直接丢失 (`null`)、纽约 DST 日幽灵月出 (`00:41`)。
2. **空时间 `"极昼/极夜 (Polar Day/Night)"` 误标 (`photo-simulator.js:130, 142`)**：
   - `formatTimeInOffset(dt, utcOffsetMin)` 与 `fmtTime()` 只要检测到 `!(dt instanceof Date)`（即任何返回 `null` 的时刻），便**无条件返回 `"Polar Day/Night"`**。
   - 这导致乌斯怀亚夏至（`54.8°S`，太阳正常升落，仅夜间太阳不低于 `-18°` 而处于**持续天文暮光**）、雷克雅未克夏至、以及任意纬度每月都会出现的“当日无月出或无月落”（如特罗姆瑟 12 月 21 日高纬月悬/无升落）全部在 UI 上被错误标注为 `"Polar Day/Night"`。
3. **SunCalc 夜间大气折射钳位 (`vendor/suncalc.min.js:60-63`)**：
   - `astroRefraction(h)` 源码第 61 行硬编码 `if (h < 0) h = 0;`，对所有地平线以下的天体仍强行加上地平线折射修正（约 `+0.57°` 退化或与 AE 负角模型产生 `+0.12° ~ +0.28°` 系统偏差，见马丘比丘 `+0.280°`、纽约凌晨 `+0.191°`、富士山 `-0.156°`）。
4. **日照金山（Alpenglow）`1.50× – 1.66×` 地平线倾角经验高估 (`photo-simulator.js:363-380`)**：
   - `computePeakAlpenglowEstimate` 使用固定经验公式 `Math.min(18, Math.max(2, Math.round(0.24 * Math.sqrt(diffM))))`。
   - **物理对照实测**：
     - 富士山河口湖（`830m -> 3776m`，高差 `2946m`）：几何折射倾角 `dipRefr = 1.625°`，视太阳升降速率 `0.1875°/min`，物理理论提前量为 **`8.67 min`**，代码输出 **`13 min`**（**`1.50×`**）。
     - 梅里雪山飞来寺（`3400m -> 6740m`，高差 `3340m`）：`dipRefr = 1.730°`，速率 `0.2051°/min`，物理理论提前量为 **`8.44 min`**，代码输出 **`14 min`**（**`1.66×`**）。
     - 且该估算完全忽略山峰相对于机位的方位角、真实视距与周围山体遮挡，仅应作为启发式参考展示。
5. **3D 地形地平线平地 `+2m / -3m` 偏移与粗糙 `5° × 28` 射线网格 (`js/modules/terrain-3d.js:92-142, 194, 265-332`)**：
   - `estimateTerrainAdjustedSunTimes` 第 194 行判定可见条件为 `pos.altitude > Math.max(-0.833, obsDeg)`，同时在 2 分钟步长扫描下，当全向平地 `obsDeg = 0°` 时，太阳必须升至 `> 0°`（太阳中心而非上边缘 `-0.833°`）才判定为日出，导致**完全平坦地形上的 `adjSunrise` 比几何日出滞后 `2 分钟`（`06:19 -> 06:22`），`adjSunset` 提前 `3 分钟`（`16:38 -> 16:36`）**；东侧 `12°` 模拟山脊场景则可准确检出 `+58 min` 日出延迟。
   - 采样网格为 `5°` 方位步长（`72` 条射线）× `28` 对数距离点（`400m – 30km`），采用 AWS Terrarium DEM `z12`（~`38m/px` 近场）+ `z11`（~`76m/px` 远场），有效地球曲率半径系数 `k = 1.15`，对近距离陡峭尖峰或峡谷存在欠采样平滑效应。
6. **POI 14 天可靠气象预报硬边界护栏 (`photo-simulator.js:387-490`)**：
   - `computePhotoOpportunityIndex` 第 396 行严格执行 `daysAhead >= -1 && daysAhead <= 14`。
   - 实测验证：`daysAhead = 9` 时 `weatherIncluded: true`、`dataQuality: "astronomy+14d-forecast"`、`score: 93`；`daysAhead = 25` 时自动剔除实况天气输入（`weatherIncluded: false`、`dataQuality: "astronomy+archive-only"`、`score: 92`），并输出明确免责声明，**不存在伪造远期天气预报的行为**。

### 2.3 科学性认知边界分类表（Epistemic Classification Table）

为严格区分“精确物理计算”与“启发式经验打分”，下表对 KAIROS V5.0 全部分析/预测模块做出认识论分级：

| 认知等级 | 涉及模块与函数 | 输出特征 / 指标 | 实测精度与工程局限声明 |
|---|---|---|---|
| **确定性天文计算**<br>(`Deterministic Astronomy`) | `vendor/astronomy.browser.min.js` + `photo-simulator.js` (`computeAstronomyExtras`) | 银心仰角/方位角、天文晨昏蒙影 (`-18°`) | 与参考星历一致（`0.0°` 误差）；受搜索起点 `23:30` 及 `fmtTime(null)` 误标 `"Polar Day/Night"` Bug 影响 |
| **确定性天文计算**<br>(`Deterministic Astronomy`) | `vendor/suncalc.min.js` + `photo-simulator.js` (`computeSimulation`) | 太阳高度/方位、月相/月出落、日出落/黄金时刻 | 大部分场景与 AE 一致性达 `0.01°–0.1°`；但未传 `utcOffset` 导致极夏日落 `+24h` 跳变，且 `astroRefraction` 在 `h<0` 存在 `+0.12°~+0.28°` 偏差 |
| **确定性天文计算**<br>(`Deterministic Astronomy`) | `js/modules/solar-terminator.js` | 日下点与 `0° / -6° / -12°` 晨昏线多边形 | 与 AE 无折射几何高度角偏差 `< 0.05°`；未计入 `-0.833°` 大气折射与太阳视半径 |
| **确定性天文计算**<br>(`Deterministic Astronomy`) | `js/modules/bright-stars.js` | 100 颗亮星 J2000 星表 + GMST 旋转 | 与 AE 无折射高度角偏差 `< 0.05°`（忽略 26 年岁差/章动约 `0.3°`） |
| **确定性天文计算**<br>(`Deterministic Astronomy`) | `js/services/timezone-service.js` | 离线 IANA `tz-lookup` + `Intl` DST 偏移解析 | 14 场景全过，精准处理 `UTC+5:45`、`UTC-10` 与 `2026-03-08 / 11-01` DST 跳变 |
| **气象预报**<br>(`Weather Forecast`) | `js/services/weather-service.js` (`fetchLiveWeather`) | 7 日逐时/逐日云量、降水概率、风速 | Open-Meteo NWP 数值预报；POI 模块严格执行 `<=14 天` 预报上限护栏 |
| **气候统计**<br>(`Climatological Statistics`) | `js/services/weather-service.js` (`fetchMonthlyClimate`) | 2020–2024 年 5 年月度气候均值与降雪率 | 聚合 Open-Meteo ERA5 逐日再分析历史数据，属网格气候均值而非站点实时实测 |
| **经验估算**<br>(`Heuristic Estimate`) | `js/modules/terrain-3d.js` (`computeTerrainHorizon`) | 360° DEM 地平线轮廓与日出延迟/日落提前 | 基于 `z12/z11` Terrarium DEM 与 `5°×28` 射线、有效半径 `1.15R`；平地存在 `+2m / -3m` 阈值偏移 |
| **经验估算**<br>(`Heuristic Estimate`) | `js/modules/photo-simulator.js` (`computePeakAlpenglowEstimate`) | 山峰受光提前/褪红延后分钟数（日照金山） | 采用 `0.24 * sqrt(diffM)` 经验公式（上限 `18m`），较物理几何倾角大 `1.50×–1.66×` 且忽略山峰方位距 |
| **经验估算**<br>(`Heuristic Estimate`) | `js/modules/photo-simulator.js` (`computePhotoOpportunityIndex`) | `0–100` 摄影机会指数（8 大场景） | 专家预设线性加权规则，未针对真实成片质量做经验回归校准 |
| **经验估算**<br>(`Heuristic Estimate`) | `js/modules/phenology-engine.js`（699 座 Tier B 城市） | 适宜度 `0–100` 与 `±8 天` 波动区间 | 固定 `16°C/10°C` 钟形温标 + 人工月度评分 + 硬编码 `±8d`；在热带与极地生态逻辑失真 |
| **尚未验证的预测模型**<br>(`Unvalidated Model`) | `scripts/validate-phenology.js`（23 座 Tier C 城市） | 热积温/秋凉物候 DOY 回归 | 训练/留出数据为 3 类人工合成偏移模板 + 静态均值，`winterMeanC` 闲置，且表现劣于单城拟合年均值基线 |

---

## 第三部分：全球旅游数据与交通枢纽质量审计（137 国 · 722 目的地 · 5,414 机位 · `KAIROS-017`、`KAIROS-029`）

### 3.1 全量机器审计总览

自动化脚本 `audit_data_full.mjs` 遍历了磁盘全部 `56` 个数据文件（全部已在 `index.html` 中加载，`unloadedDataJsFiles = []`）、`data/transport/hubs.json` 以及 `data/i18n/en/*.json`，结果如下：

1. **核心规模与结构完整性**：
   - **6 大洲 / 42 区域 / 137 个国家与地区 / 722 座目的地 / 5,414 个摄影机位**（与 `data/audit-report.json` 完全一致）。
   - 各大洲分布：`asia` `245`、`europe` `133`、`north_america` `128`、`africa_antarctica` `94`、`south_america` `74`、`oceania` `48`。
   - 结构零缺陷：`duplicateCityIdsCount = 0`、`duplicateCityNamesCount = 0`、`invalidCityCoordsCount = 0`、`zeroZeroCityCoordsCount = 0`、`invalidSpotCoordsCount = 0`、`zeroZeroSpotCoordsCount = 0`、`missingCityFieldsCount = 0`、`missingSpotFieldsCount = 0`、`invalidMonthsCount = 0`。
2. **坐标、海洋点与重复机位异常 (`KAIROS-029`)**：
   - **海洋中心点错误 (`oceanTzCityAnomaliesCount = 1`)**：`sc-aldabra-outer`（塞舌尔阿尔达布拉外岛）城市坐标 `[51.5, -7]` 落于**印度洋开阔公海**（时区回退为 `Etc/GMT-3`），距离其首个实际机位阿尔达布拉大环礁 `[46.35, -9.417]` 高达 **`627.2 km`**。
   - **跨城机位坐标完全重复 (`interCitySpotDupCoordsCount = 3`)**：
     - Banff 与 Jasper 之间存在 **2 组 0 米完全重合坐标**：`Bow Lake Viewpoint` (`[-116.45, 51.6736]`) 与 `Peyto Lake Viewpoint` (`[-116.5075, 51.7174]`)；另有帕米尔公路 `Ak-Baital Pass` (`28.36m`)。
     - 同城内部 `<100m` 相邻机位共 `52` 对（多数为同一景点不同机位如莫雷诺冰川第一/第二观景台 `84.55m`）。
   - **超远距归属机位**：`243` 个机位距母城中心 `>250 km`，**`65` 个机位 `>600 km`**，最大偏移达 **`3,102 km`**（巴西 `br-coast-jericoacoara-aparados` 将东北海岸沙丘与南部大峡谷捆绑在同一 ID 下；另有百慕大与阿鲁巴捆绑 `2,260 km`、西澳埃斯佩兰斯与水平瀑布捆绑 `1,966 km`）。
   - **大洲边界与南极预算特征**：`8` 个海外岛屿/极地目的地（斯瓦尔巴、加那利群岛、马德拉、复活节岛、费尔南多群岛、南极圈/罗斯海）按行政归属而非经纬矩形划分；`8` 个南极与南乔治亚探险邮轮舒适档预算为 `82,000 – 198,000 RMB`（符合真实极地船票成本，属业务特殊高值而非数据损坏）。
3. **`data/transport/hubs.json` 枢纽质量灾难性失真 (`KAIROS-017`)**：
   - 全库 722 城覆盖无缺失 (`missingDestinationsCount = 0`)，但因 `scripts/build-transport-hubs.js` 仅硬编码了约 185 座机场，导致：
   - **跨国错误主机场：`97 / 722 (13.4%)`**！例如亚庇 (`my-borneo-kota-kinabalu`) -> 菲律宾宿务 `CEB` (`995 km`，忽略本地 `BKI`)；仙本那 -> `CEB` (`877 km`)；长白山 -> 俄符拉迪沃斯托克 `VVO` (`368 km`)；珠峰/阿里 -> 尼泊尔 `KTM` (`155 km`)；安塔利亚/棉花堡/费特希耶 -> 希腊圣托里尼 `JTR` (`327–469 km`)；堪察加 -> 日本札幌 `CTS` (`1,695 km`)；新奥尔良 -> 墨西哥坎昆 `CUN` (`1,083 km`)；霞浦/石垣岛 -> 台北 `TPE`；复活节岛 -> 厄瓜多尔加拉帕戈斯 `GPS` (`3,605 km`)。
   - **超远距主机场**：`251 / 722` 城主机场距目的地 `>300 km`，`115 / 722` 城 `>600 km`（甚至中国呼伦贝尔/漠河映射至 `HRB` `646–879 km`）。
   - **虚假铁路枢纽 (`suspiciousRailOnNoRailIslandsOrRemoteCount = 27`)**：仅按国家白名单批量开启 `railHub.available: true`，导致**济州岛、冲绳、屋久岛、斯瓦尔巴群岛、罗弗敦群岛、特内里费、兰萨罗特、马略卡、科西嘉、天空岛、珠峰/阿里、呼伦贝尔、漠河**等 27 处无铁路海岛或极偏远地区均显示拥有铁路/高铁枢纽。
   - **虚假地铁接驳 (`suspiciousMetroOnRemoteOrSmallDestCount = 17+`)**：仅凭 `primary.distanceKm <= 65` 判断地铁可达性，导致**三亚、丽江、敦煌、济州岛、巴厘岛、佩妮达岛、皇后镇、雷克雅未克、特罗姆瑟、圣托里尼、库斯科、乌斯怀亚**等至少 17 座无地铁城市/海岛虚假提供 `"metro"` 接驳方式。
4. **英文 i18n 翻译覆盖与词元重复 (`KAIROS-029`)**：
   - 全量检查 `75,482` 个源字段与 `81,840` 个英文 JSON 键值：`missingTranslationCount = 0`，`residualCjkInMatchedTranslationsCount = 0`（零中文残留与零漏译）。
   - 全量机器审计在 `data/i18n/en/*.json` 中检出 **`223` 处英文地标名称重复词元**（例：`"Hallgrímskirkja Hallgrímskirkja"`、`"Campanile di San Marco Campanile"`、`"Polychrome Overlook Polychrome Overlook"`、`"Hole-in-the-Wall Hole-in-the-Wall"`、`"Cascadas de Tamasopo ... Cascadas de Tamasopo"`、`"Kyambura Gorge ... Kyambura Gorge"`）。
   - 媒体与季节过滤测试（`mediaFilterTests`）：5 项语义过滤与 2 项南北半球 EXIF 季节翻转测试中，4 项常规过滤与 2 项季节测试准确；但在喀拉拉 (`Kerala`) 样本测试中，`Saffron / Curry in Kerala` 得分为 `+62`（`isIrrelevant: false`），显示部分南亚饮食词条仍存在误放行风险。

### 3.2 分层抽样人工证据表（40 目的地 = `5.5%` · 60 机位 = `1.1%`）

> 抽样统计结果：**40 座抽样目的地**中 `PASS = 27`、`PASS_WITH_CAVEAT = 13`（均为 `hubs.json` 跨国/超远机场或虚假铁路引起）；**60 个抽样机位**中 `PASS = 56`、`PASS_WITH_CAVEAT = 3`（英文词元重复）、`ISSUE_FLAGGED = 1`（`sc-aldabra-outer#0` 母城海洋中心点漂移 `627.2 km`）。

#### A. 40 座抽样目的地核验全表

| # | 大洲 | 目的地 ID | 中文名称 | 国家 | 坐标 `[lng, lat]` | 时区 | 海拔 | 舒适/顶奢预算 (RMB) | 最近机场 (hubs.json) | 铁路 | 核验结论与备注 |
|---|---|---|---|---|---|---|---|---|---|---|---|
| 1 | `asia` | `cn-beijing` | 北京 · 紫禁城与未来建筑 | 中国 | `[116.3972, 39.9163]` | `Asia/Shanghai` | `40m–1,050m` | `5,900 / 116,000` | `PEK (24km, CN)` | 是 | `PASS` |
| 2 | `asia` | `cn-wuxi-yangzhou` | 无锡与扬州 · 樱海烟花 | 中国 | `[119.85, 31.95]` | `Asia/Shanghai` | `5m–120m` | `3,300 / 35,000` | `HGH (199km, CN)` | 是 | `PASS` |
| 3 | `asia` | `cn-chaoshan-danxia` | 潮汕开平与丹霞山 | 中国 | `[116.622, 23.657]` | `Asia/Shanghai` | `0m–618m` | `7,500 / 22,500` | `XMN (182km, CN)` | 是 | `PASS` |
| 4 | `asia` | `cn-lhasa` | 拉萨与羊湖纳木错 | 中国 | `[91.117, 29.655]` | `Asia/Shanghai` | `3650m–5190m` | `10,600 / 38,000` | `LXA (44km, CN)` | 是 | `PASS` |
| 5 | `asia` | `jp-kanto-yokohama` | 横滨 · 海港折板建筑 | 日本 | `[139.638, 35.4437]` | `Asia/Tokyo` | `0m–50m` | `3,900 / 23,000` | `HND (17km, JP)` | 是 | `PASS` |
| 6 | `asia` | `jp-setouchi-tottori-kinosaki-izumo` | 鸟取、城崎与出云 | 日本 | `[134.233, 35.5]` | `Asia/Tokyo` | `0m–100m` | `12,500 / 46,000` | `KIX (150km, JP)` | 是 | `PASS` |
| 7 | `asia` | `sg-heritage-nature` | 新加坡历史街区与生态建筑 | 新加坡 | `[103.8437, 1.28]` | `Asia/Singapore` | `0m–约120m` | `11,600 / 35,700` | `SIN (19km, SG)` | 否 | `PASS` |
| 8 | `asia` | `ph-visayas-bohol-moalboal` | 薄荷岛与莫阿尔博阿尔 | 菲律宾 | `[123.7453, 9.5792]` | `Asia/Manila` | `0m–约870m` | `7,800 / 21,700` | `CEB (85km, PH)` | 否 | `PASS` |
| 9 | `asia` | `indochina-cambodia-siem-reap-phnom-penh` | 暹粒与金边 | 柬埔寨 | `[103.8597, 13.3622]` | `Asia/Phnom_Penh` | `0m–70m` | `10,200 / 65,000` | `SAI (39km, KH)` | 否 | `PASS` |
| 10 | `asia` | `in-north-jodhpur-udaipur` | 焦特布尔与乌代布尔 | 印度 | `[73.0059, 26.2684]` | `Asia/Kolkata` | `220m–600m` | `7,800 / 64,000` | `DEL (478km, IN)` | 否 | `PASS_WITH_CAVEAT` (最近机场 >300km) |
| 11 | `asia` | `tr-coasts-kas-d400` | 卡什与D400 | 土耳其 | `[29.6394, 36.2003]` | `Europe/Istanbul` | `0m–300m` | `9,000 / 32,000` | `JTR (373km, GR)` | 是 | `PASS_WITH_CAVEAT` (跨国机场 JTR/GR) |
| 12 | `asia` | `ru-fareast-avacha-mutnovsky` | 堪察加活火山 | 俄罗斯 | `[158.6378, 53.0436]` | `Asia/Kamchatka` | `0m–2,741m` | `11,100 / 64,000` | `CTS (1695km, JP)` | 是 | `PASS_WITH_CAVEAT` (跨国机场 CTS/JP) |
| 13 | `asia` | `me-levant-gems-ayia-napa-troodos` | 阿依纳帕与特罗多斯 | 塞浦路斯 | `[33.59, 34.98]` | `Asia/Nicosia` | `0m–1,952m` | `7,000 / 33,000` | `TLV (351km, IL)` | 否 | `PASS_WITH_CAVEAT` (跨国/超距机场 TLV) |
| 14 | `europe` | `is-sw-reykjavik-blue-lagoon` | 雷克雅未克与蓝湖温泉 | 冰岛 | `[-21.9268, 64.1418]` | `Atlantic/Reykjavik` | `0m–约200m` | `6,800 / 45,500` | `KEF (37km, IS)` | 否 | `PASS` |
| 15 | `europe` | `no-arctic-lofoten-reine` | 罗弗敦南段 | 挪威 | `[13.0894, 67.9324]` | `Europe/Oslo` | `0m–484m` | `9,100 / 38,000` | `TOS (304km, NO)` | 是 | `PASS_WITH_CAVEAT` (机场>300km+岛屿误标铁路) |
| 16 | `europe` | `ch-valais-st-moritz-bernina` | 圣莫里茨与伯尔尼纳快车 | 瑞士 | `[9.8355, 46.4908]` | `Europe/Zurich` | `约1000m–2978m` | `8,100 / 65,000` | `MXP (128km, IT)` | 是 | `PASS_WITH_CAVEAT` (跨国机场 MXP/IT) |
| 17 | `europe` | `it-center-tuscany-valdorcia` | 托斯卡纳奥尔恰谷 | 意大利 | `[11.615, 43.0661]` | `Europe/Rome` | `约200m–550m` | `6,300 / 63,000` | `FCO (150km, IT)` | 是 | `PASS` |
| 18 | `europe` | `es-north-barcelona` | 巴塞罗那 | 西班牙 | `[2.1734, 41.3851]` | `Europe/Madrid` | `0m–512m` | `8,000 / 55,000` | `BCN (13km, ES)` | 是 | `PASS` |
| 19 | `europe` | `fr-paris-nw-mont-saint-michel` | 圣米歇尔山 | 法国 | `[-1.5106, 48.6356]` | `Europe/Paris` | `0m–约80m` | `5,100 / 35,500` | `CDG (300km, FR)` | 是 | `PASS` |
| 20 | `europe` | `uk-north-lake-district` | 英格兰湖区 | 英国 | `[-3.087, 54.5]` | `Europe/London` | `40m–356m` | `6,600 / 37,000` | `EDI (162km, GB)` | 是 | `PASS` |
| 21 | `north_america` | `ca-banff-lake-louise-moraine` | 路易斯湖与梦莲湖 | 加拿大 | `[-116.1792, 51.4263]` | `America/Edmonton` | `1,540m–2,611m` | `8,300 / 60,000` | `YYC (154km, CA)` | 否 | `PASS` |
| 22 | `north_america` | `ca-ontario-toronto` | 多伦多 | 加拿大 | `[-79.3832, 43.6532]` | `America/Toronto` | `75m–210m` | `5,200 / 33,000` | `YYZ (20km, CA)` | 否 | `PASS` |
| 23 | `north_america` | `us-ak-north-fairbanks-arctic-circle` | 费尔班克斯与北极圈 | 美国 | `[-147.7164, 64.8378]` | `America/Anchorage` | `约130m–900m` | `10,500 / 55,000` | `FAI (7km, US)` | 否 | `PASS` |
| 24 | `north_america` | `us-az-north-monument-wave` | 纪念碑谷与波浪谷 | 美国 | `[-110.113, 36.9833]` | `America/Denver` | `约1,550m–1,800m` | `8,400 / 42,000` | `PHX (431km, US)` | 否 | `PASS_WITH_CAVEAT` (机场>300km) |
| 25 | `north_america` | `us-pnw-wa-seattle` | 西雅图 | 美国 | `[-122.3321, 47.6062]` | `America/Los_Angeles` | `0m–158m` | `6,000 / 40,000` | `SEA (18km, US)` | 否 | `PASS` |
| 26 | `north_america` | `us-ne-nature-white-mountains` | 白山国家森林 | 美国 | `[-71.432, 44.082]` | `America/New_York` | `150m–1,917m` | `7,900 / 36,500` | `BOS (194km, US)` | 否 | `PASS` |
| 27 | `north_america` | `mx-yucatan-cancun-isla-mujeres-tulum` | 坎昆、女人岛与图卢姆 | 墨西哥 | `[-87.428, 20.214]` | `America/Cancun` | `-10m–30m` | `10,500 / 76,000` | `CUN (108km, MX)` | 否 | `PASS` |
| 28 | `africa_antarctica` | `ke-masai-mara` | 马赛马拉国家保护区 | 肯尼亚 | `[35.1439, -1.4061]` | `Africa/Nairobi` | `约1480m–2100m` | `14,800 / 52,500` | `NBO (199km, KE)` | 否 | `PASS` |
| 29 | `africa_antarctica` | `et-tigray-axum` | 提格雷绝壁教堂与阿克苏姆 | 埃塞俄比亚 | `[39.15, 14.08]` | `Africa/Addis_Ababa` | `1,950m–2,850m` | `10,300 / 41,000` | `ADD (569km, ET)` | 否 | `PASS_WITH_CAVEAT` (机场>300km) |
| 30 | `africa_antarctica` | `za-namaqualand-cederberg` | 纳马夸兰花海与塞德伯格 | 南非 | `[18.45, -31.15]` | `Africa/Johannesburg` | `0m–1,550m` | `6,600 / 39,000` | `CPT (313km, ZA)` | 否 | `PASS_WITH_CAVEAT` (机场>300km) |
| 31 | `africa_antarctica` | `ma-marrakech` | 马拉喀什 | 摩洛哥 | `[-7.9811, 31.6295]` | `Africa/Casablanca` | `460m–1,500m` | `5,100 / 82,000` | `RAK (6km, MA)` | 是 | `PASS` |
| 32 | `africa_antarctica` | `eg-sinai-dahab` | 西奈山与达哈卜 | 埃及 | `[34.5136, 28.5091]` | `Africa/Cairo` | `0m–2,285m` | `4,200 / 31,500` | `CAI (351km, EG)` | 否 | `PASS_WITH_CAVEAT` (机场>300km) |
| 33 | `south_america` | `pe-cusco-machu-picchu` | 马丘比丘 | 秘鲁 | `[-72.5456, -13.1631]` | `America/Lima` | `2,040m–3,082m` | `8,000 / 71,500` | `CUZ (78km, PE)` | 否 | `PASS` |
| 34 | `south_america` | `ec-andes-quilotoa` | 基洛托阿翡翠火山口湖 | 厄瓜多尔 | `[-78.9044, -0.8592]` | `America/Guayaquil` | `约3,500m–3,930m` | `2,000 / 9,600` | `UIO (101km, EC)` | 否 | `PASS` |
| 35 | `south_america` | `cl-south-general-carrera-marble-caves` | 智利南方公路与卡雷拉湖 | 智利 | `[-72.6736, -46.6251]` | `America/Santiago` | `约30m–1,410m` | `10,800 / 61,500` | `FTE (409km, AR)` | 否 | `PASS_WITH_CAVEAT` (跨国机场 FTE/AR) |
| 36 | `south_america` | `br-coast-lencois-maranhenses` | 拉克依斯千湖沙漠 | 巴西 | `[-43.112, -2.533]` | `America/Fortaleza` | `0m–40m` | `7,300 / 43,500` | `GIG (2255km, BR)` | 否 | `PASS_WITH_CAVEAT` (主机场距 2255km) |
| 37 | `oceania` | `nz-qt-queenstown` | 皇后镇 | 新西兰 | `[168.6627, -45.0302]` | `Pacific/Auckland` | `310m–1,650m` | `8,700 / 58,500` | `ZQN (6km, NZ)` | 否 | `PASS` |
| 38 | `oceania` | `nz-coast-kaikoura` | 凯库拉 | 新西兰 | `[173.6814, -42.4008]` | `Pacific/Auckland` | `0m–1,602m` | `4,700 / 33,500` | `CHC (153km, NZ)` | 否 | `PASS` |
| 39 | `oceania` | `au-gbr-whitsundays-whitehaven` | 圣灵群岛 | 澳大利亚 | `[149.0205, -20.2459]` | `Australia/Brisbane` | `0m–约100m` | `6,800 / 47,000` | `CNS (508km, AU)` | 否 | `PASS_WITH_CAVEAT` (机场>300km) |
| 40 | `oceania` | `au-outback-wa-perth-rottnest` | 珀斯、罗特尼斯岛与尖峰石阵 | 澳大利亚 | `[115.8605, -31.9505]` | `Australia/Perth` | `0m–约80m` | `6,500 / 39,000` | `PER (10km, AU)` | 否 | `PASS` |

#### B. 60 个抽样摄影机位核验全表

| # | 城市 ID#索引 | 国家 / 大洲 | 机位名称 (中文) | 坐标 `[lng, lat]` | 距母城中心 (km) | 海拔 | 核验结论与备注 |
|---|---|---|---|---|---|---|---|
| 1 | `cn-beijing#0` | 中国 (`asia`) | 故宫博物院 & 景山万春亭与角楼 | `[116.3967, 39.9261]` | `1.1` | `108m` | `PASS` |
| 2 | `cn-hangzhou#7` | 中国 (`asia`) | 九溪烟树 & 西溪湿地水上红杉林 | `[120.111, 30.193]` | `6.6` | `60m` | `PASS` |
| 3 | `cn-xiangxi#1` | 中国 (`asia`) | 凤凰古城 · 沱江虹桥、万名塔与木跳岩 | `[109.6, 27.949]` | `36.9` | `350m` | `PASS` |
| 4 | `cn-shangrila-meili#4` | 中国 (`asia`) | 普达措国家公园属都湖 & 纳帕海草原 | `[99.946, 27.835]` | `23.4` | `3550m / 3270m` | `PASS` |
| 5 | `cn-kashgar#1` | 中国 (`asia`) | 白沙湖北岸 · 白色风积银沙山 | `[75.048, 38.742]` | `114.5` | `3300m` | `PASS` |
| 6 | `jp-hokkaido-sapporo-otaru#0` | 日本 (`asia`) | 真驹内滝野灵园 · 安藤忠雄头大佛殿 | `[141.3627, 42.9205]` | `15.7` | `约180m` | `PASS` |
| 7 | `jp-kyushu-tohoku-nagasaki-yakushima-okinawa#3` | 日本 (`asia`) | 庆良间座间味岛古座间味海滩 | `[127.308, 26.2228]` | `37` | `0m–20m` | `PASS` |
| 8 | `sg-marina-civic#6` | 新加坡 (`asia`) | 星耀樟宜 Jewel Changi · 40米雨漩涡 | `[103.9897, 1.3601]` | `17.7` | `约5m–40m` | `PASS` |
| 9 | `id-volcano-east-bromo#5` | 印度尼西亚 (`asia`) | Goa Tetes · 苔藓石壁与滴水洞穴 | `[112.9208, -8.2335]` | `32.6` | `约535m` | `PASS` |
| 10 | `th-islands-samui-tao#4` | 泰国 (`asia`) | 涛岛塞利海滩 Sairee Beach | `[99.8271, 10.0973]` | `69.1` | `0–5m` | `PASS` |
| 11 | `mv-male-atolls#3` | 马尔代夫 (`asia`) | 维拉纳机场 · 水上飞机航拍起点 | `[73.5291, 4.1918]` | `4.1` | `0m–约600m` | `PASS` |
| 12 | `in-north-jodhpur-udaipur#3` | 印度 (`asia`) | 泰姬湖宫 Taj Lake Palace | `[73.6802, 24.5751]` | `200.1` | `约420m` | `PASS` |
| 13 | `tr-west-central-istanbul#1` | 土耳其 (`asia`) | 蓝色清真寺 Sultan Ahmed Mosque | `[28.9768, 41.0054]` | `0.3` | `约35m` | `PASS` |
| 14 | `uz-bukhara#1` | 乌兹别克斯坦 (`asia`) | 雅克王堡 Ark of Bukhara | `[64.4103, 39.7778]` | `1.9` | `约220m` | `PASS` |
| 15 | `ru-fareast-altai-chuya-highway#4` | 俄罗斯 (`asia`) | 阿克塔什蓝眼湖 Geyser Lake | `[87.6672, 50.2892]` | `0` | `约1,370m` | `PASS` |
| 16 | `ir-gulf-lut-kaluts#1` | 伊朗 (`asia`) | Egg Hill Viewpoint · 蛋形雅丹全景台 | `[57.8474, 30.8651]` | `5` | `未取得可靠测量值` | `PASS` |
| 17 | `id-nature-plus-kelimutu#1` | 印度尼西亚 (`asia`) | Nuwamuri Koofai · 青年湖观景台 | `[121.8124, -8.7654]` | `0.1` | `1598m` | `PASS` |
| 18 | `ca-tr-plus-mardin-nemrut#1` | 土耳其 (`asia`) | 卡西米耶经学院 Kasımiye Medrese | `[40.72, 37.3081]` | `89.6` | `约850–900m` | `PASS` |
| 19 | `is-sw-reykjavik-blue-lagoon#0` | 冰岛 (`europe`) | 哈尔格林姆斯教堂 Hallgrímskirkja | `[-21.9268, 64.1418]` | `0` | `地面约40m` | `PASS` (注: EN 含 `Hallgrímskirkja` 重复) |
| 20 | `arctic-islands-svalbard-longyearbyen#1` | 挪威 (`europe`) | 拉尔斯冰川 Larsbreen | `[15.5545, 78.1766]` | `5.4` | `约300–600m` | `PASS` |
| 21 | `no-arctic-tromso-nordkapp#2` | 挪威 (`europe`) | Ersfjordbotn · V形极光峡湾 | `[18.617, 69.6936]` | `14` | `约5m` | `PASS` |
| 22 | `ch-lakes-interlaken-brienz-lungern#1` | 瑞士 (`europe`) | 伊瑟尔特瓦尔德 Iseltwald | `[7.966, 46.7111]` | `8.3` | `564m` | `PASS` |
| 23 | `it-north-lake-como#0` | 意大利 (`europe`) | 贝拉焦半岛尖端 Punta Spartivento | `[9.2655, 45.9913]` | `1.9` | `约200m` | `PASS` |
| 24 | `it-center-venice#0` | 意大利 (`europe`) | 圣马可钟楼 Campanile di San Marco | `[12.339, 45.434]` | `0.1` | `约99m` | `PASS_WITH_CAVEAT` (EN 含 `Campanile` 重复) |
| 25 | `gr-islands-santorini#5` | 希腊 (`europe`) | 阿克罗蒂里灯塔 | `[25.3569, 36.3577]` | `9.3` | `约100m` | `PASS` |
| 26 | `es-north-barcelona#4` | 西班牙 (`europe`) | 焦糖山碉堡 Turó de la Rovira | `[2.1617, 41.4194]` | `3.9` | `262m` | `PASS` |
| 27 | `pt-porto-douro#5` | 葡萄牙 (`europe`) | 卡萨尔德洛伊沃斯观景台 | `[-7.5319, 41.1986]` | `90.4` | `430m` | `PASS` |
| 28 | `fr-alps-annecy-lake#6` | 法国 (`europe`) | 杜安湖岸 Plage municipale de Duingt | `[6.1953, 45.8284]` | `9.4` | `447m` | `PASS` |
| 29 | `de-classic-rothenburg-heidelberg-black-forest#5` | 德国 (`europe`) | 拉文纳峡谷 Ravennaschlucht | `[8.0735, 47.9166]` | `173` | `约718m` | `PASS` |
| 30 | `ie-cliffs-of-moher-aran#5` | 爱尔兰 (`europe`) | 穆拉莫尔 Mullaghmore | `[-9.001, 53.0067]` | `28.9` | `约180m` | `PASS` |
| 31 | `ca-banff-lake-louise-moraine#0` | 加拿大 (`north_america`) | 梦莲湖石堆观景台 Moraine Lake Rockpile | `[-116.1807, 51.3279]` | `10.9` | `约1,910m` | `PASS` |
| 32 | `ca-west-whistler-joffre-lakes#6` | 加拿大 (`north_america`) | 霍洛韦瀑布 Holloway Falls | `[-122.4786, 50.349]` | `42.8` | `1,535m左右` | `PASS` |
| 33 | `ca-quebec-city#4` | 加拿大 (`north_america`) | 莱维斯河岸 Quai Paquet | `[-71.187, 46.8119]` | `1.6` | `约5m` | `PASS` |
| 34 | `us-ak-south-denali#2` | 美国 (`north_america`) | 多彩山口观景台 Polychrome Overlook | `[-149.8301, 63.5357]` | `26.6` | `约1130m` | `PASS_WITH_CAVEAT` (EN `Polychrome Overlook` 重复) |
| 35 | `us-plains-devils-tower#7` | 美国 (`north_america`) | 怀俄明24号公路远景台 WY-24 | `[-104.6858, 44.5596]` | `4.2` | `约1,180m` | `PASS` |
| 36 | `us-az-north-page-antelope#3` | 美国 (`north_america`) | 马蹄湾 Horseshoe Bend Overlook | `[-111.5109, 36.8809]` | `6.2` | `约1,280m` | `PASS` |
| 37 | `us-ca-sierra-lake-tahoe#0` | 美国 (`north_america`) | 翡翠湾灵感观景台 Inspiration Point | `[-120.1004, 38.9463]` | `17.7` | `约2,080m` | `PASS` |
| 38 | `us-pnw-wa-olympic#5` | 美国 (`north_america`) | 墙中洞 Hole-in-the-Wall | `[-124.6513, 47.9417]` | `87.4` | `0–5m` | `PASS_WITH_CAVEAT` (EN `Hole-in-the-Wall` 重复) |
| 39 | `us-hi-east-maui-haleakala-hana#3` | 美国 (`north_america`) | 莱莱维云瀑观景台 Leleiwi Overlook | `[-156.2284, 20.7443]` | `5.6` | `约2,694m` | `PASS` |
| 40 | `us-mid-appal-great-smoky-mountains#6` | 美国 (`north_america`) | 洞穴瀑布 Grotto Falls | `[-83.4667, 35.6939]` | `9.9` | `约760m` | `PASS` |
| 41 | `mx-west-huasteca-potosina#3` | 墨西哥 (`north_america`) | 塔马索波阶梯瀑布 | `[-99.3972, 21.9391]` | `27.2` | `约350m` | `PASS` |
| 42 | `ca-central-atitlan-tikal#0` | 危地马拉 (`north_america`) | 玛雅之脸上层观景台 | `[-91.2987, 14.7066]` | `8.9` | `约2,200m` | `PASS` |
| 43 | `ke-masai-mara#0` | 肯尼亚 (`africa_antarctica`) | 马拉河主渡口 Mara River Main Crossing | `[35.0175, -1.5482]` | `21.1` | `约1500m` | `PASS` |
| 44 | `ug-bwindi-queen-elizabeth#6` | 乌干达 (`africa_antarctica`) | 基扬布拉地下雨林裂谷 Kyambura Gorge | `[30.0921, -0.168]` | `65.7` | `约950m` | `PASS` |
| 45 | `na-damaraland-spitzkoppe#4` | 纳米比亚 (`africa_antarctica`) | 达马拉兰石化古林 Petrified Forest | `[14.6046, -20.4382]` | `76.7` | `约860m` | `PASS` |
| 46 | `za-drakensberg#2` | 南非 (`africa_antarctica`) | 大教堂峰与迪迪玛峡谷 | `[29.2058, -28.9478]` | `5.4` | `1,480m–3,004m` | `PASS` |
| 47 | `sc-aldabra-outer#0` | 塞舌尔 (`africa_antarctica`) | 阿尔达布拉大环礁 Aldabra Atoll | `[46.35, -9.417]` | **`627.2`** | `0m–8m` | **`ISSUE_FLAGGED`** (母城中心在海中距此 `627.2 km`) |
| 48 | `ma-toubkal-ouzoud#6` | 摩洛哥 (`africa_antarctica`) | 伊米恩伊夫里天然石桥 | `[-6.9708, 31.7245]` | `57` | `1,120m` | `PASS` |
| 49 | `eg-white-black-desert#4` | 埃及 (`africa_antarctica`) | 老白沙漠岩石迷宫与白色孤拱 | `[28.165, 27.2485]` | `4.7` | `88m` | `PASS` |
| 50 | `aq-lemaire-paradise-bay#2` | 南极洲 (`africa_antarctica`) | 普莱诺岛冰山坟场 | `[-64.0556, -65.1039]` | `4.1` | `0m–65m` | `PASS` |
| 51 | `pe-cusco-machu-picchu#0` | 秘鲁 (`south_america`) | 守卫屋上层梯田 Casa del Guardián | `[-72.5447, -13.1653]` | `0.3` | `约2,480m` | `PASS` |
| 52 | `pe-north-amazon-iquitos-tambopata#1` | 秘鲁 (`south_america`) | 帕卡亚萨米里亚黑水河道 | `[-73.7895, -4.6492]` | `117` | `约100m` | `PASS` |
| 53 | `bo-cities-copacabana-isla-del-sol#2` | 玻利维亚 (`south_america`) | 帕查塔卡古天文遗址 Horca del Inca | `[-69.0846, -16.1721]` | `0.6` | `约3,950m` | `PASS` |
| 54 | `cl-south-general-carrera-marble-caves#5` | 智利 (`south_america`) | 奎拉特冰碛湖码头 | `[-72.5387, -44.4654]` | `240.4` | `约60m` | `PASS` |
| 55 | `ar-north-mendoza-aconcagua#6` | 阿根廷 (`south_america`) | 苏卡尔迪无限之石酒庄 | `[-69.1567, -33.7721]` | `102.3` | `约1100m` | `PASS` |
| 56 | `br-guiana-angel-falls#1` | 委内瑞拉 (`south_america`) | 奥扬桌山天使瀑布航空摄影区 | `[-62.5356, 5.9675]` | `0.2` | `约1,400m+` | `PASS` |
| 57 | `nz-qt-queenstown#0` | 新西兰 (`oceania`) | 天空缆车 Skyline Queenstown | `[168.6494, -45.0264]` | `1.1` | `约790m` | `PASS` |
| 58 | `nz-mackenzie-tekapo-mount-john#6` | 新西兰 (`oceania`) | 麦格雷戈湖 Lake McGregor | `[170.4669, -43.9385]` | `6.7` | `约730m` | `PASS` |
| 59 | `au-nsw-qld-kgari-moreton#6` | 澳大利亚 (`oceania`) | Tangalooma 野生海豚蓝调海岸 | `[153.3717, -27.1809]` | `195.6` | `约1m` | `PASS` |
| 60 | `au-outback-wa-uluru#7` | 澳大利亚 (`oceania`) | 帝王谷伊甸园 Garden of Eden | `[131.5832, -24.2517]` | `133.4` | `约650m` | `PASS` |

---

## 第四部分：修复优先级与工程验收建议

1. **P1 (`KAIROS-015`) 物候诚实化与实证重构**：
   - 将当前 23 城线性模型降级标注为“气候均值经验参考”，接入 JMA 樱花/红叶官方逐年历史观测数据集（及 USA-NPN / PEP725）与 Open-Meteo ERA5 逐年春季/秋季实际气温序列重新拟合，并在验证脚本中硬性要求以**单城历史均值基线**作为对照门槛；移除热带/极地城市的温带开花/红叶误导性输出与硬编码 `±8d` 区间。
2. **P1 (`KAIROS-016`) 统一星历引擎与地平线判定**：
   - `photo-simulator.js` 全部改用已打包的 `Astronomy Engine`（或向 `SunCalc` 显式传入 `utcOffset`），彻底消除雷克雅未克 `+1440.4 min` 日落跳变及 `astroRefraction` 夜间偏差；按天区事件类型区分 `无日出/落（极昼/极夜）`、`持续暮光`、`今日无月出/月落`；修正 `terrain-3d.js:194` 平地日出/落阈值为 `-0.833°`。
3. **P1 (`KAIROS-017`) 基于完整 OurAirports 与 OSM 数据重建 `hubs.json`**：
   - 放弃 185 座手写机场列表，引入完整 OurAirports `airports.csv`（筛选 `scheduled_service=yes` 的商业机场），优先匹配同国/同岛屿商业机场；基于真实站点与海峡拓扑数据修正 27 处误标铁路与 17+ 处误标地铁。
4. **P2 (`KAIROS-029`) 数据坐标与英文词元清理**：
   - 将 `sc-aldabra-outer` 主坐标锚定至 `[46.35, -9.417]` 并增加 CI 陆地轮廓离岸距离门禁（`<=50km`）；清理 Banff 与 Jasper 重合的 2 处观景台坐标；通过正则清洗 `data/i18n/en/*.json` 中的 `223` 处重复地标词元。
