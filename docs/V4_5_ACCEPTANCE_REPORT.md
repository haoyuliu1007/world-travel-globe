# World Travel Globe V4.5.0 工程验收报告 (Acceptance Report)

- **版本号**：`v4.5.0`
- **发布目标**：工程可靠性加固、科学计算修正、全盘实拍 EPIC 升级与公开发布就绪
- **报告日期**：2026-11-27
- **边界声明**：本文所有数值均来自本地实际构建、单元测试与无头 Chromium 端到端测试运行实测；真机物理移动端长期表现未做真机采集，已单列区分。

---

## 一、核心工程修复与功能验收项

1. **NASA DSCOVR EPIC 今日真地球重构 (`worker/index.js`, `js/modules/epic-earth.js`, `css/upgrades.css`)**：
   - 修正 `thumbs/` 缩略图过小缺陷，默认返回并展示 NASA `jpg/` (`1080×1080` `mediumUrl`) 实拍影像（保留 `thumbs/` 降级回退与 `2048px PNG` 原图入口），新增 Play/Pause 自动轮播与快捷键控制。
   - Playwright 实测：`.epic-stage` 渲染高度由不足 160px 提升至 **494 px**，按钮、文案、元数据全三语覆盖。
2. **CRDT 多设备同步数学完备性 (`js/services/crdt-merge.js`, `js/services/storage-db.js`, `tests/v4-5-crdt-properties.test.js`)**：
   - 将逻辑时钟合并从有结合律缺陷的 `+ (local === remote ? 0 : 1)` 修正为严格单调 Join-Semilattice `Math.max(localClock, remoteClock)`，仅在本地写入/删除事件中递增时钟。
   - 实现 `travelStatus` 对称字段级时间戳规范化（保留显式 `0` 戳记）与字段级墓碑剥离，彻底解决先删后建与三端乱序同步冲突。
   - 随机化属性测试：**240 轮三端随机状态交换律、结合律、幂等性、吸收律验证 100% 通过**；6 种三端乱序同步全排列结果完全收敛一致；敏感口令/Token 彻底隔离。
3. **全球 IANA 时区体系与真球面晨昏线 (`js/services/timezone-service.js`, `js/modules/solar-terminator.js`, `js/modules/terrain-3d.js`, `tests/v4-5-scientific-accuracy.test.js`)**：
   - 集成离线 `tz-lookup` + 原生 `Intl.DateTimeFormat` 两轮定点收敛算法，精准计算目标选定日期的真实 UTC 偏移与夏令时。
   - 验证覆盖 8 座典型城市冬夏双季：**武汉 (`Asia/Shanghai +480/+480`)、加德满都 (`Asia/Kathmandu +345/+345`)、阿德莱德 (`Australia/Adelaide +630/+570`)、纽约 (`America/New_York -300/-240`)、伦敦 (`Europe/London 0/+60`)、雷克雅未克 (`Atlantic/Reykjavik 0/0`)、特卡波 (`Pacific/Auckland +780/+720`)、特罗姆瑟 (`Europe/Oslo +60/+120`)**；无归属坐标显式标示 `Est. UTC±X` 回退。
   - `SolarTerminator` 采用反太阳点真球冠 + Sutherland-Hodgman 跨日界线裁剪，消除分点跳变；经 `SunCalc` 独立验证春分、夏至、秋分、冬至全球晨昏点误差 **< 1.0°**。
   - `Terrain3DModule` 支持 Mapterhorn 单瓦片连续出错自动回退 AWS Terrarium；光影模拟器增加视场与 DEM 分辨率边界说明。
4. **自适应渲染引擎、WebGL 生命周期与移动端触控强化 (`js/modules/diagnostics.js`, `js/app.js`, `css/upgrades.css`)**：
   - 实现 `high / balanced / eco / auto` 四档动态配置 `window.__wtgPerfConfig` 与仅在前台可见运行的低帧率自动降档看门狗。
   - 补齐 `init()` 防重入、`visibilitychange` 后台暂停星空/自转/晨昏线计时器、`orientationchange` 防抖重排，以及 `webglcontextlost` / WebGL 失败自动切换至 **2D 图鉴 + 目录** 兜底浏览。
   - 加固 `?embed=<id>&chrome=off` 纯净嵌入模式并注入 `Content-Security-Policy: frame-ancestors *`；移动端核心交互按钮高度统一提升至 **`>= 40px`**。
5. **722 城专属 `1200×630` PNG OG 卡片与上游弹性治理 (`scripts/build-seo-pages.js`, `js/services/api-client.js`, `worker/index.js`)**：
   - 使用 `@resvg/resvg-js` + Node 并发工作线程与 `.cache/og/` SHA-256 增量缓存为 722 座目的地生成独立 `1200×630` PNG OG 卡片，缓存复建耗时仅 **1.68 秒**（全量 PNG 产物经扁平底图优化压缩至 **38.4 MB**）。
   - `ApiClient` 升级指数退避抖动、`Retry-After`、外部 `AbortSignal` 取消及 11 路数据源健康表；Worker 所有代理强制 `12s` 请求超时。

---

## 二、实测构建、测试与端到端数据汇总

| 指标项 | V4.5.0 实测数据（本地真实运行采集） |
|---|---|
| 原始数据集 (`npm.cmd run audit`) | **137 国/地区 · 722 目的地 · 5,414 机位** · `0` 重复 ID · `0` 无效坐标 · `0` 缺失必填字段 |
| 生产包体积 (`npm.cmd run build`) | `css/app.bundle.min.css` `216.6 KB (34.0 KB gzip)` · `vendor/libs.bundle.min.js` `351.2 KB (129.3 KB gzip)` · `js/app.bundle.min.js` `767.5 KB (202.1 KB gzip)` · `atlas-index.min.js` `1265.6 KB (451.2 KB gzip)` |
| 静态 SEO 与 PNG OG 产物 | 722 个 `/p/<id>/index.html` · **723 张 `1200×630` PNG**（总计 `38.4 MB`，`dist/` 共 `2,348` 文件） · 增量缓存复建耗时 **`1.68 s`** |
| 自动化测试 (`npm.cmd test`) | **46 / 46 全部通过**（含 240 轮随机 CRDT 性质检验、8 城 IANA 时区 & SunCalc 晨昏验证、ApiClient/Worker 安全头 & OG PNG 验证） |
| Playwright Chromium 端到端 (`npm.cmd run test:e2e`) | **10 / 10 场景全过 · `0` 未捕获 `pageerror`** · 本地预加载首屏 `domContentLoaded 90ms` / `load 143ms` / `48` 请求 |
| 模拟多视口布局校验（Chromium Emulated） | `360×800` (`overflow=0, minTouch=40px`) · `390×844` (`overflow=0, minTouch=40px`) · `768×1024` (`overflow=0, minTouch=40px`) · `1440×900` (`overflow=0`) |

> [!NOTE]
> 以上多视口检验为桌面无头 Chrome (`C:\Program Files\Google\Chrome\Application\chrome.exe`) 在本地静态服务下进行的**视口仿真测试**（外部气象/瓦片接口采用确定性测试桩以保障 CI 稳定），不代表真机 iOS Safari / Android Chrome 在蜂窝网络下的物理表现，详见 [KNOWN_LIMITATIONS.md](KNOWN_LIMITATIONS.md)。
