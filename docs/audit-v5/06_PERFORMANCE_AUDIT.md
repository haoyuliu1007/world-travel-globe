# KAIROS V5.0 性能、包体积、WebGL 稳定性与云资源审计报告 (`06_PERFORMANCE_AUDIT`)

- **审计版本**：KAIROS V5.0 (`v5.0.0` · Commit `cfec5a3`)
- **测试对象**：生产环境 `https://world-travel-globe.globe-app.workers.dev/` 及本地构建产物 `dist/` (`2,382` 文件，共 `160,302,229 B` / `152.88 MB`)
- **测试工具链**：Headless Chrome + Chrome DevTools Protocol (CDP) `Performance` / `Network` / `HeapProfiler` / `Emulation` 6 档位隔离剖析、8 轮开合内存留存测试、`WEBGL_lose_context` 故障注入、INP 89 次事件采样与超时韧性测试。
- **证据源文件**：`docs/audit-v5/evidence/perf-audit-results.json`、`docs/audit-v5/evidence/inp-timeout-results.json`、`docs/audit-v5/evidence/arch-and-tests-results.json`、`docs/audit-v5/issues.json`。
- **关联缺陷编号**：`KAIROS-023` (P1)、`KAIROS-028` (P2)、`KAIROS-034` (P3)，以及未验证项 `UNVERIFIED-04`、`UNVERIFIED-05`。

> [!IMPORTANT]
> **硬件环境与 SwiftShader 软件光栅化声明 (`UNVERIFIED-04`)**：本次 CDP 自动化剖析运行于 Windows 11 无头 Chrome 环境，WebGL 由 **SwiftShader 软件光栅化器**承载，而非独立硬件 GPU（ANGLE D3D11 / Metal）。因此所有 WebGL 帧率（`19.4 FPS`）与帧耗时数据仅反映 CPU 软渲染与主线程开销基线，不能直接等同于终端用户硬件 GPU 的实际流畅度；长时（30+ 分钟）物理 GPU 显存与热节流稳定性仍待真机实测。

---

## 一、生产环境 6 档位 CDP 实测与热缓存、INP、超时韧性表现

### 1.1 生产站 6 档位冷启动实测对比

以下数据全部来自对线上生产站点 `https://world-travel-globe.globe-app.workers.dev/` 的隔离会话（Clean Profile）CDP 实测，所有 6 档位均由 Service Worker 接管 (`swControlled: true`)，且均保持 **`0` 个 `pageerror`**：

| 测试档位 (`label` / 视口) | 首字节 TTFB | DOM Interactive | DCL (`dclMs`) | Load (`loadMs`) | FCP / LCP | LCP 元素 | CLS | 长任务数 / 最大长任务 | TBT | 首屏请求 / 传输字节 / 解码字节 | JS Heap / DOM 节点 / 监听器 |
|---|---|---|---|---|---|---|---|---|---|---|---|
| **1. 桌面冷启直达 (`?instant=1` · `1920×1080`)** | `321 ms` | `3,414 ms` | `3,489 ms` | `7,084 ms` | `1,980 ms` / `1,980 ms` | `SPAN#loader-text` | `0.0219` | `43` / `185 ms` | `403 ms` | `141` 请求 (`52` 首屏) / `1,589 KB` (`1,958 KB` encoded) / `5,693 KB` | `12.87 MB` / `3,130` / `499` |
| **2. 桌面冷启序幕 (`/` · `1440×900`)** | `351 ms` | `3,700 ms` | `3,785 ms` | `7,091 ms` | `2,124 ms` / `2,196 ms` | `SPAN#` | `0.0384` | `28` / `236 ms` | `382 ms` | `59` 请求 (`58` 首屏) / `2,311 KB` (`2,681 KB` encoded) / `6,407 KB` | `14.20 MB` / `3,665` / `522` |
| **3. 笔记本 2× CPU 节流 (`1440×900`)** | `322 ms` | `4,394 ms` | `4,584 ms` | `7,826 ms` | `2,904 ms` / `2,904 ms` | `SPAN#loader-text` | `0.0387` | `39` / `197 ms` | `708 ms` | `53` 请求 / `1,589 KB` / `5,693 KB` | `16.98 MB` / `3,451` / `554` |
| **4. 低端设备 6× CPU 节流 (`390×844`)** | `333 ms` | `3,819 ms` | `4,877 ms` | `8,726 ms` | `2,280 ms` / `2,280 ms` | `SPAN#loader-text` | `0.0224` | `39` / **`1,065 ms`** | **`3,262 ms`** | `53` 请求 / `1,589 KB` / `5,693 KB` | `17.41 MB` / `3,451` / `542` |
| **5. 移动端 4G 网络 (`390×844`)** | `344 ms` | `9,288 ms` | `9,872 ms` | **`15,091 ms`** | `2,500 ms` / `2,500 ms` | `SPAN#loader-text` | `0.0224` | `41` / `589 ms` | **`1,440 ms`** | `53` 请求 / `1,589 KB` / `5,693 KB` | `13.86 MB` / `3,451` / `586` |
| **6. 慢速 3G 网络 (`390×844`)** | `400 ms` | `24,078 ms` | **`24,552 ms`** | **`35,653 ms`** | `3,024 ms` / `3,024 ms` | `SPAN#loader-text` | `0.0224` | `50` / `478 ms` | **`1,181 ms`** | `52` 请求 (`1` 失败) / `1,405 KB` / `4,206 KB` | `12.09 MB` / `3,451` / `686` |

> **关键发现 (`KAIROS-023`)**：
> - 所有 6 个档位首屏均**未触发懒加载脚本**（`lazyLoadedOnBoot: []`），CLS 稳定保持在 `0.0219 – 0.0387`（远低于 `0.1` 优秀阈值）。
> - 但冷启动同步阻塞 `<script>` 链解码体积高达 **`5,693 KB`**（含序幕时达 **`6,407 KB`**，传输 `1.59–2.31 MB`），导致：
>   1. **低端 6× CPU** 单次最长主线程阻塞高达 **`1,065 ms`**，总阻塞时间 **`TBT = 3,262 ms`**；
>   2. **Mobile 4G** `loadMs` 达 **`15.09 s`**（`DCL 9.87 s`）；
>   3. **Slow 3G** `DCL` 达 **`24.55 s`**、`loadMs` 达 **`35.65 s`**（且 1 个 JSON 请求超时失败）。
> - 对比文档 `docs/V5_PERFORMANCE_REPORT.md` 声称的 `domContentLoadedMs = 96 ms / loadMs = 137 ms`，该数值仅反映了本地静态服务器 `localhost` 零网络延迟与本地测试桩下的极限理想情况，不能代表公网冷启动体验。

### 1.2 二次访问热缓存（Warm Cache Reload）、INP 与 API 超时韧性

| 测试维度 | 实测核心指标 | 详细观测证据 | 结论 |
|---|---|---|---|
| **Warm Cache 二次刷新**<br>(`prod-cold-desktop-instant` 复测) | **`loadMs: 1,644 ms`** (`dclMs: 680 ms`)<br>**`transferBytes: 0 KB`** (`0 B`) | `FCP = 652 ms`、`LCP = 652 ms`、`TTFB = 287 ms`、`52 / 87` 资源命中缓存 (`wallReloadMs: 3,153 ms`, `swControlled: true`) | Service Worker 对核心壳资源热缓存提速显著（`7,084 ms -> 1,644 ms`，网络传输降为 `0 KB`） |
| **INP (Interaction to Next Paint)**<br>(`inp-timeout-results.json`) | **`p98Ms: 160 ms`** (`keydown`)<br>**`maxMs: 160 ms`** (`keyup`) | 累计采样 **`89`** 次真实交互事件；Top-5 延迟：`keyup 160ms`、`keydown 160ms`、`mouseover 152ms`、`mouseout 152ms`、`pointerenter 152ms` | 整体处于 Google Core Web Vitals `<= 200 ms` 合格线内，但已逼近阈值上限（键盘检索触发全量高亮/过滤耗时 `160 ms`） |
| **天气 API 超时降级韧性**<br>(`weatherTimeoutFallback`) | **`hasReadableFallback: true`**<br>**`0 pageErrors`** | 当拦截/超时 `/api/weather` 时，抽屉正常渲染完整地理信息、海拔、7 天建议与城市档案（观测文本 `2,718` 字符） | 降级逻辑健全（注：`perf-audit-results.json` 初始简探中 `drawerStillResponsive: false` 为脚本未等待抽屉挂载导致，已在专项脚本 `inp-timeout-results.json` 中复核确认可读降级正常） |

---

## 二、包体积演进对比（V4.5.0 vs V5.0.0）、拆包结构与压缩校验

### 2.1 V4.5.0 基线 vs V5.0.0 构建产物体积对照

> 注：按 `1024 B = 1 KB`（KiB）换算 `perf-audit-results.json` 实测字节数，并与 `V4_5_ACCEPTANCE_REPORT.md` / `arch-and-tests-results.json` 核对：

| 资产 / Bundle 路径 | V4.5.0 基线 (Gzip) | V5.0.0 Gzip (`arch` / `perf` 字节折算) | V5.0.0 Raw Size | 体积变化与审计评估 |
|---|---|---|---|---|
| `js/app.bundle.min.js` | **`202.1 KB`** | **`239.4 KB`** (`245,148 B`) | `920,560 B` (`899.0 KB`) | **`+18.5%` (`+37.3 KB`)**；主协调文件 `js/app.js` 达 `3,899 LOC` (`KAIROS-034`) |
| `css/app.bundle.min.css` | `34.0 KB` | **`35.7 KB`** (`36,521 B`) | `230,648 B` (`225.2 KB`) | `+5.0%` (`+1.7 KB`)；新增品牌 token 与移动端底部栏 |
| `vendor/libs.bundle.min.js` | `129.3 KB` | **`129.3 KB`** (`132,441 B`) | `359,616 B` (`351.2 KB`) | 零变化；但同时打包了两套搜索库 (`Fuse + MiniSearch`) 与两套天文库 (`SunCalc + Astronomy Engine`) |
| `data/atlas-index.min.js` | `451.2 KB` | **`451.2 KB`** (`462,079 B`) | `1,296,021 B` (`1,265.6 KB`) | 零膨胀；但同步阻塞解析 `1.27 MB` 文本索引仍为首屏最大阻塞源 |
| `vendor/maplibre-gl.js` | — | **`270.0 KB`** (`276,491 B`) | `1,058,059 B` (`1,033.3 KB`) | 核心 WebGL 地图引擎（未计入 `libs.bundle`） |
| `assets/prologue/intro.bundle.min.js` | — | **`21.0 KB`** | `79.1 KB` | 序幕包；附带 `bgm.js` 在顶层以 `preload="auto"` 预加载 `the-blue-horizon.mp3` (`KAIROS-034`) |

### 2.2 按需懒加载模块 (`js/lazy/*`) 与异步数据资产明细

首屏未下载（`lazyLoadedOnBoot: []`），仅在触发对应入口时按需拉取：

| 懒加载文件 / 异步数据分片 | Raw Size | Gzip Size | 用途说明 |
|---|---|---|---|
| `js/lazy/account-center.js` | `14,818 B` (`14.5 KB`) | `4,555 B` (`4.4 KB`) | 账号中心弹窗 |
| `js/lazy/collab-space.js` | `15,794 B` (`15.4 KB`) | `4,904 B` (`4.8 KB`) | 协作空间面板 |
| `js/lazy/expense-splitter.js` | `3,469 B` (`3.4 KB`) | `1,271 B` (`1.2 KB`) | AA 分账计算模块 |
| `js/lazy/dest-compare.js` | `10,981 B` (`10.7 KB`) | `3,474 B` (`3.4 KB`) | 目的地横向对比弹窗 |
| `js/lazy/export-service.js` | `15,243 B` (`14.9 KB`) | `5,399 B` (`5.3 KB`) | 多格式行程导出服务 |
| `js/lazy/share-center.js` | `12,752 B` (`12.5 KB`) | `4,637 B` (`4.5 KB`) | 分享中心与海报导出 |
| `js/lazy/help-center.js` | `8,483 B` (`8.3 KB`) | `3,307 B` (`3.2 KB`) | 帮助中心弹窗 |
| `vendor/echarts.min.js` | `715,020 B` (`698.3 KB`) | `240,439 B` (`234.8 KB`) | 气候图表渲染库（按需注入） |
| `data/enrichment/atlas-enrichment.json` | `1,487,033 B` (`1,452.2 KB`) | `173,352 B` (`169.3 KB`) | 722 城物候与景观富化表 |
| `data/transport/hubs.json` | `243,718 B` (`238.0 KB`) | `25,408 B` (`24.8 KB`) | 722 城交通枢纽索引 |
| `data/docs/manual-zh-CN.json` | `31,639 B` (`30.9 KB`) | `14,024 B` (`13.7 KB`) | 30 章中文使用手册 |

### 2.3 传输压缩校验、Service Worker 缓存漏洞与资产冗余 (`KAIROS-028`、`KAIROS-034`)

1. **传输压缩全量合格**：在全部 6 个 CDP 档位下，文本/JS/CSS/JSON/SVG 资源均已正确开启边缘压缩（例如桌面档 `compressedCount: 30`、`uncompressedCount: 0`），**`> 2 KB` 未压缩资源数为 `0`**。
2. **Service Worker 缓存分区与离线故障 (`KAIROS-028` · `sw.js:60, 121`)**：
   - `sw.js` 第 60 行在检查 `CACHE_NAME` 之前先匹配 `/vendor/` 并写入无版本后缀的 `DATA_CACHE = 'kairos-data-v5'`，导致带 `?v=${buildVer}` 的 `libs.bundle.min.js` 既绕过预缓存又无法在 `activate` 阶段被清理；
   - 第 121 行 `hit || (await netPromise)` 在离线且未命中缓存时向 `event.respondWith` 返回 `null` 而引发 SW `TypeError`；
   - `manifest.webmanifest`、`assets/skyboxes/*` 与 `atlas-enrichment.json` 未被纳入预缓存/运行时匹配规则。
3. **仓库资产冗余与库重复 (`KAIROS-034`)**：
   - `assets/brand/source/` 下存有 9 个与 `kairos-*.png` 字节完全一致的 `ChatGPT 图像 *.png` 重复文件（额外占用约 **`10 MB`** 仓库体积），另有未被引用的 `preview-primary.png`；
   - `vendor/` 同时首屏打包 `fuse.min.js (26.4 KB)` + `minisearch.min.js (19.3 KB)` 以及 `suncalc.min.js (17.4 KB)` + `astronomy.browser.min.js (116.7 KB)`；
   - `assets/prologue/bgm.js:4-7` 在用户未进入序幕时即构造 `preload="auto"` 的 MP3 音频实例，与 `ambient-radio.js` Track 00 重叠。

---

## 三、WebGL 稳定性、上下文丢失恢复与 DOM/内存留存审计 (`KAIROS-023`)

### 3.1 SwiftShader WebGL 帧率与抖动基线（含软件光栅化声明）

在连续交互拖拽地球仪的 `233` 帧采样周期中：
- **平均帧率 (`avgFps`)**：**`19.4 FPS`**（平均帧耗时 `avgFrameMs: 51.67 ms`）
- **帧耗时分位数**：`P50 = 50.0 ms`、`P95 = 66.7 ms`、`P99 = 66.8 ms`
- **掉帧统计**：`>33ms` 帧数 `207 / 233`，`>50ms` 卡顿帧数 `98 / 233`

> **SwiftShader 软件光栅化声明 (`UNVERIFIED-04`)**：由于测试节点无物理 GPU 透传，MapLibre GL 地球与地形着色器完全在 CPU 上的 SwiftShader 软件管线中光栅化，CPU 软渲染单帧 ~`50 ms`（约 `20 FPS`）属预期特征，**不可将 `19.4 FPS` 误判为物理显卡性能问题**；真实硬件 GPU（WebGL2 D3D11/Metal）下帧率与长时间热降频表现尚未实测验证。

### 3.2 `WEBGL_lose_context` 故障恢复测试

通过 CDP 向 MapLibre 画布注入 `WEBGL_lose_context` 扩展调用 `loseContext()` 并随后恢复：
- **上下文丢失计数 (`lostCount`)**：`1`（丢失后 `lostAfterLose: true`）
- **上下文恢复计数 (`restoredCount`)**：`1`（恢复后 `lostAfterRestore: false`）
- **运行时错误**：**`0` `pageErrors`、`0` `consoleErrors`**。地球仪表面与图层在上下文恢复后正常重绘，未出现黑屏死锁。

### 3.3 8 轮交互开合内存与 DOM 留存测试 (`KAIROS-023`)

在连续执行 8 轮抽屉标签切换、帮助中心与行程规划器开合操作并在前后强制执行垃圾回收 (`HeapProfiler.collectGarbage`) 后，指标对比如下：

| 监测指标 | 操作前 (`memoryBefore`) | 8 轮循环后 (`memoryAfter`) | 绝对增量 (`deltas`) | 增长百分比 | 风险判定 |
|---|---|---|---|---|---|
| **JS Heap Used** | `13.28 MB` | `13.95 MB` | **`+0.66 MB`** | `+5.0%` | 低风险（V8 堆回收良好） |
| **DOM 节点总数** | `3,086` | `4,454` | **`+1,368` 节点** | **`+44.3%`** | **中高风险（DOM 持续留存）** |
| **事件监听器数** | `314` | `458` | **`+144` 监听器** | **`+45.9%`** | **中高风险（监听器未释放）** |

**根因定位**：关闭右侧详情抽屉、Trip Planner 及 V5 懒加载弹窗时仅切换显示状态（`hidden` / `display: none`）或未清理旧子节点绑定，致使每次交互积累约 `+171` 个孤立/隐藏 DOM 节点与 `+18` 个事件监听器，长会话（如连续规划 20–30 个目的地）将引发明显样式重算与交互延迟上升。

---

## 四、Cloudflare Workers / D1 / R2 资源架构与成本评估

### 4.1 线上资源绑定现状核查

结合 `wrangler.jsonc`、`wrangler.example.jsonc`、`migrations/`（3 个迁移脚本共 **21 张表**）与线上 `/api/health` 实测响应：

| 资源组件 | 线上生产绑定状态 | 容量与结构评估 | 潜在风险与费用拐点 |
|---|---|---|---|
| **Workers Static Assets (`ASSETS`)** | **已启用** (`./dist`) | `2,382` 文件、`152.88 MB`（其中 723 张 OG PNG 约 `38.4 MB`） | 静态资源直接由 Cloudflare 边缘节点分发不计 Workers 请求费；但 `run_worker_first: ["/api/*", "/", "/index.html", "/p/*"]` 会使所有 HTML 页面与 SEO 落地页（722 个 `/p/*`）先经过 Worker 注入安全头，计入 **Workers 请求次数配额** |
| **Cloudflare Workers API (`worker/index.js`)** | **已启用** (`14` 路代理 + 认证/协作) | 单请求超时保护 `12,000 ms`；使用 `caches.default` 缓存（气象 `30m`、Panoramax `1h`、EPIC `6h`、FX `12h`、Commons/Wiki/POIs `24h`、瓦片/图片 `7d`） | 免费版单日 10 万次请求、单次 CPU 限制 `10 ms`；`checkRateLimit` 与登录失败计数存于单实例 `Map`（非分布式存储），跨 POP 节点无法全局限流；`/api/route` 串行回退外部 OSRM 在超时时仅消耗 wall-clock（计费以 CPU 计），但高频地理瓦片/图片穿透代理会快速消耗请求配额 |
| **Cloudflare D1 (`DB`)** | **已启用** (`world-travel-globe-db`) | `0001_init.sql` + `0002_backups.sql` + `0003_v5_accounts_collab.sql`（含 `users`、`sessions`、`trips`、`trip_members`、`trip_versions`、`trip_comments`、`trip_polls`、`trip_expenses` 等共 `21` 张表） | 免费版含 `500 万行读取/天`、`10 万行写入/天`、`5 GB` 存储；`/api/profile` 每次 `PUT` 执行读+备份+淘汰+写入最多 4 条 SQL，单份 JSON 上限 `5 MB`（大档案频繁同步易放大行读写）；另需留意 `KAIROS-003` 中前端 `CollabSpace` 尚未实际调用 D1 `/api/collab/*`，真实写压力尚未释放 |
| **Cloudflare R2 (`PHOTOS_BUCKET`)** | **线上未绑定 (`r2: false`)** | `wrangler.jsonc` 中未配置 `r2_buckets`；接口在未配置时返回 `501` | 若按 `wrangler.example.jsonc` 启用 R2，免费版含 `10 GB` 存储、`100 万次 Class A 写`、`1000 万次 Class B 读`；**严峻风险在于 `worker/index.js:407-418` 未校验登录态、文件魔数及字节大小上限 (`KAIROS-014`)**，一旦开启绑定极易被恶意脚本刷写大文件造成 R2 存储与 Class A 操作费用失控 |

### 4.2 不可验证声明（`UNVERIFIED-04`、`UNVERIFIED-05`）

- **`UNVERIFIED-04`（硬件 GPU 与长时稳定性）**：受限于无头 Chrome SwiftShader 环境，物理独显/核显（ANGLE D3D11/Metal）及真机移动端 GPU 连续漫游 30 分钟以上的实际帧率、显存回收与热降频行为**未在本轮实测中验证**。
- **`UNVERIFIED-05`（边缘高并发负载与上游限流）**：严格遵循“禁止对线上生产环境及第三方上游（OSRM、Open-Meteo、Wikimedia、Frankfurter）发起压测”的审计红线，Cloudflare Workers CPU 耗时分布、D1 在百人并发协作下的实际行读写消耗及上游 API 触发 `429` 限流阈值**尚未实测**，需在预发布（Staging）环境配合 `wrangler dev` 与本地压测工具补充验证。

---

## 五、性能优化优先级路线图

1. **解除首屏同步 JS 阻塞 (`KAIROS-023`)**：将 `data/atlas-index.min.js` (`1.27 MB` raw) 改为 `defer` 或异步 `fetch` + Web Worker (`atlas-worker.js`) 流式索引加载，拆离首屏非必需双份库（仅保留 `MiniSearch` 与 `Astronomy Engine`，移除 `Fuse` 与 `SunCalc`，可减少约 `44 KB` raw / ~`15 KB` gzip 供应商代码），目标将 6× CPU `TBT` 从 `3,262 ms` 降至 `< 1,000 ms`、Mobile 4G `DCL` 从 `9.87 s` 降至 `< 4.5 s`。
2. **修复 8 轮循环 `+44%` DOM / `+46%` 监听器留存 (`KAIROS-023`)**：在抽屉标签页切换、Help/Share/Compare/Account 弹窗关闭与 Trip Planner 视图退出时显式销毁临时子节点树或采用单次委托监听器，确保 10 轮开合循环后 DOM 与监听器净增长 `< 10%`。
3. **修复 `sw.js` 缓存分区与离线 `null` 异常 (`KAIROS-028`)**：优先匹配版本化 `CORE_ASSETS` 再回落 `DATA_CACHE`，并在离线未命中时返回 `new Response('Offline', { status: 503 })`。
4. **开启 R2 前置安全配额门禁 (`KAIROS-014`)**：在绑定 `PHOTOS_BUCKET` 前强制校验登录态、图片魔数与 `<=5 MB` 大小限制，并为 `/p/*` 等纯静态 SEO 路由评估取消 `run_worker_first` 以节省 Workers 请求配额。
