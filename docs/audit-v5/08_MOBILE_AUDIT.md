# KAIROS V5.0 移动端与响应式布局审计报告 (`08_MOBILE_AUDIT.md`)

**审计对象**：KAIROS (`world-travel-globe` v5.0.0, commit `cfec5a3`)  
**测试方法**：Playwright Core + Headless Chrome 11 组视口几何/样式/触控自动化扫描与线上实拍截图分析  
**关联问题**：`KAIROS-024`（P1 移动端与响应式布局缺陷）、`KAIROS-023`（P1 移动端首屏加载耗时）、`UNVERIFIED-01`、`UNVERIFIED-02`

> **可信度与测试边界声明（严格区分仿真与真机）**  
> 本次审计中的全部页面度量与截图均采集自 **Windows 11 桌面环境下的 Emulated Chromium Viewports（仿真视口）**。由于环境未连接任何物理手机/平板硬件，且未安装 Firefox / WebKit 浏览器内核，真机触控物理惯性、iOS Safari WebGL 显存回收、原生软键盘推挤与真机刘海屏适配目前仍属于 **`UNVERIFIED-01` / `UNVERIFIED-02`** 未实测范围，必须按第 5 节真机验收清单完成上线前补测。

---

## 1. 全量 11 视口实测遥测总表

数据来源：`evidence/ui-mobile-audit-results.json` 及 `screenshots/vp-*.png`、`prod-18-mobile-drawer-390x844.png`、`prod-19-mobile-planner-390x844.png`。

| 视口规格 | 场景分类 | 截图文件 | 水平溢出 (`px`) | 可见交互控件 | `<44px` 小目标数 | 裁切控件数 (`clipped`) | 自动扫描重叠 (`chromeOverlaps`) | 低对比度计数 |
|---|---|---|---|---|---|---|---|---|
| **`360×800`** | 主流安卓竖屏 | `vp-360x800.png` | `0` | `29` | **`23`** | `0`（注：视口内月份条右端视觉截断 `7月`） | `0`（注：`#globe-controls` 与 `#basemap-bar` 视觉贴边紧邻） | `2` |
| **`390×844`** | iPhone 14/15 竖屏 | `vp-390x844.png`, `prod-18`, `prod-19` | `0` | `30` | **`24`** | **`1`** (`pheno-btn` `left:362, right:404`) | `0`（注：抽屉/规划打开时底栏遮挡内容） | `2` |
| **`430×932`** | iPhone Pro Max 竖屏 | `vp-430x932.png` | `0` | `33` | **`27`** | **`1`** (`pheno-btn` `left:405, right:447`) | `0` | `3` |
| **`768×1024`** | iPad Mini/Air 竖屏 | `vp-768x1024.png` | `0` | `34` | **`28`** | `0` | `0` | `2` |
| **`820×1180`** | iPad Air 10.9" 竖屏 | `vp-820x1180.png` | `0` | `35` | `35` | `0` | `0` | `1` |
| **`1024×768`** | 平板标准桌面断点 | `vp-1024x768.png` | `0` | `35` | `35` | `0`（注：`11月` 被容器边缘裁切） | `0` | `1` |
| **`1440×900`** | MacBook 桌面屏 | `prod-02`~`prod-17`, `vp-1440x900.png` | `0` | `35` | `35` | `0` | `0` | `1` |
| **`1920×1080`** | 标准 FHD 桌面屏 | `vp-1920x1080.png` | `0` | `35` | `35` | `0` | `0` | `1` |
| **`2560×1440`** | QHD 2K 大屏 | `vp-2560x1440.png` | `0` | `39` | `39` | `0` | `0` | `2` |
| **`844×390`** | 手机横屏 (Landscape) | `vp-mobile-landscape-844x390.png` | `0` | `35` | `35` | `0`（注：物候条裁切至 `10.`） | `0` | `1` |
| **`1024×768`** | 平板横屏 (Landscape) | `vp-tablet-landscape-1024x768.png` | `0` | `35` | `35` | `0`（注：物候条裁切至 `11.`） | `0` | `1` |

*注：`evidence/ui-mobile-audit-results.json` 中的 `touchActionMap` 在全量 11 个视口均为 `"none"`，`touchActionDrawer` 均为 `"auto"`。`cssScan` 统计显示 CSS 中已包含 `39` 处 `safe-area-inset-*` 声明、`7` 条 `:focus-visible` 规则与 `10` 条 `touch-action` 规则。*

---

## 2. 移动端核心布局与交互缺陷深度剖析（`KAIROS-024`）

### 2.1 `#phenology-bar` 物候月份条横向溢出裁切
- **现象与截图实证**：
  - 在 `390×844`（`vp-390x844.png`）与 `430×932`（`vp-430x932.png`）下，DOM 几何扫描均捕获到 `clippedControlsCount: 1`——按钮 `.pheno-btn` 的右边界分别为 `404px`（溢出 `390px` 视口）和 `447px`（溢出 `430px` 视口），`8月`–`12月` 被硬截断隐藏。
  - 在 `360×800`（`vp-360x800.png`）中，`7月` 文字被胶囊右侧圆角直接腰斩；在手机横屏 `844×390`（`vp-mobile-landscape-844x390.png`）中切在 `10.` 处；甚至在平板横屏 `1024×768`（`vp-tablet-landscape-1024x768.png`）中也切在 `11.` 处，导致 `12月` 与汇总数 `722 城` 不可见。
- **根因**：`#phenology-bar` 内部设置了固定最小宽度月份胶囊，但在小屏及中等宽度横屏下未将容器切换为带横向惯性滚动（`overflow-x: auto; -webkit-overflow-scrolling: touch; scrollbar-width: none`）且带渐变边缘提示的滑动条，导致右侧月份被外框硬裁。

### 2.2 `#mobile-bottom-nav` 遮挡底部抽屉、规划表单与地球控件
- **抽屉内容遮挡（`prod-18-mobile-drawer-390x844.png`）**：在 `390×844` 打开目的地详情抽屉时，底部的固定导航栏 `#mobile-bottom-nav` 直接压在 `#drawer-scroll` 的底部段落上（实拍中 `"SANAA与赫尔佐格和德梅隆的建筑实验……"` 被半透明导航栏遮挡得模糊不清），底部留白不足使最末段无法滚出底栏之上。
- **规划工作台遮挡与顶栏穿透（`prod-19-mobile-planner-390x844.png`）**：
  - 打开 `#planner-view` 后，底栏 `#mobile-bottom-nav` 依然悬浮在最上层，直接盖住表单底部的 `"出发日期 / 同行人数 / 天数 / 总预算"` 字段与生成按钮；
  - 顶部同时叠加了 **2 行半透明穿透的地球 `#topbar` 胶囊** + **规划器顶栏** + **竖排 5 颗英雄区按钮**，留给核心表单的可视高度极其局促。
- **地球控件与底图栏贴边拥挤（`vp-360x800.png`）**：在 `360×800` 下，右下角 `#globe-controls` 垂直胶囊的底部距离 `#basemap-bar` 仅剩数像素间隙，一旦微调字号或高缩放字体极易发生直接遮挡。

### 2.3 移动端触控热区不达标（23–27 个控件 `< 44×44px`）
- 依据 Apple HIG 与 WCAG 2.5.5（增强目标尺寸），触屏设备交互控件应满足 **`>= 44×44px`**：
  - `360×800` 存在 **`23` 个**、`**390×844**` 存在 **`24` 个**、`**430×932**` 存在 **`27` 个**、`**768×1024**` 存在 **`28` 个**不达标元素。
  - 典型违规元素实测尺寸（来自 `ui-mobile-audit-results.json`）：
    - `#brand-home-btn`：`34 × 26px`（高度严重不足）
    - `.pheno-btn`（全年 / 1月–12月）：`42 × 40px`（宽高双不达标）
    - 顶栏胶囊内图标按钮（`#sidebar-toggle-btn`、`#filter-popover-btn`、`#favorites-toggle-btn`、`#music-popover-btn`、`#appearance-btn`、`#account-btn`、`#help-btn`）：`40 × 44px`（宽度差 `4px`）
    - `#lang-btn`：`41 × 44px`
- 注：`820×1180` 及 `1024×768` 以上视口进入桌面双胶囊样式（按钮高 `34px`），在桌面鼠标端属于合理紧凑排版；但在平板触控场景（如 `820×1180` iPad Air 与 `1024×768` iPad 横屏），建议通过 `@media (pointer: coarse)` 独立放大点击热区至 `44px`，避免误触。

### 2.4 移动首屏三行堆叠与性能负载（关联 `KAIROS-023`）
- **视觉空间侵占**：在 `360×800`、`390×844`、`430×932`、`768×1024` 竖屏下，顶部导航栏自动折成 **3 层**（工具行 1 + 工具行 2 + 全宽搜索胶囊），加上底部 3 层（底图条 + 物候条 + 底部导航栏），上下 Chrome 合计占去约 **`340px–360px`** 垂直高度（占 `800px` 屏幕近 **45%**），大幅压缩了 3D 地球可视窗。
- **弱网与低端 CPU 实测瓶颈（`evidence/perf-audit-results.json`）**：
  - `prod-mobile-4g-390x844`：`DCL 9,872ms`、`loadMs 15,091ms`、`TBT 1,440ms`；
  - `prod-lowend-6x-cpu-390x844`：`TBT 3,262ms`、最长长任务 `1,065ms`；
  - `prod-slow-3g-390x844`：`DCL 24,552ms`、`loadMs 35,653ms`。
  主要源于同步阻塞脚本链总原始体积达 `3.6 MB`（`maplibre-gl.js` + `libs.bundle` + `atlas-index` + `app.bundle`）。

---

## 3. Touch-Action、Safe Area 与横竖屏切换分析

1. **`touch-action` 隔离状态良好**：全视口实测 `#map` 为 `touch-action: none`（确保单指拖拽/双指缩放地球时不触发浏览器整页橡皮筋回弹），`#detail-drawer` 为 `touch-action: auto`（允许抽屉内原生纵向滚动）。
2. **`safe-area-inset-*` 覆盖较全但边界未闭环**：CSS 中虽已有 `39` 处 `env(safe-area-inset-*)` 声明，但 `#drawer-scroll` 与 `#planner-view` 未将 `--mob-nav-h + env(safe-area-inset-bottom)` 计入底部 `padding-bottom`，导致 Home Indicator 区域上方仍然发生文字与按钮被 `#mobile-bottom-nav` 压盖。
3. **横屏断点陷阱 (`844×390` vs `1024×768`)**：
   - 在 `vp-mobile-landscape-844x390.png`（`width > 768px`）下，布局立即退回桌面顶栏与悬浮底栏，因高度仅 `390px`，底部物候条与地球垂直距离极近，打开任何抽屉/弹窗都会几乎占满全屏。建议针对 `(max-height: 500px) and (orientation: landscape)` 增加精简横屏规则（如折叠物候条为下拉按钮、抽屉改为左侧半宽浮层）。

---

## 4. 响应式修复工程建议

1. **底部安全垫统一注入**：为 `#drawer-scroll`、`#planner-view`、`#gallery-view`、`#archive-view` 增加 `padding-bottom: calc(var(--mob-nav-h, 64px) + env(safe-area-inset-bottom, 0px) + 20px)`；在移动端打开全屏模式视图时隐藏 `#topbar`（同步解决 `prod-19` 透字），并视业务决定规划器内部保留顶部原生流式滚动而收起 `#mobile-bottom-nav`（或底部保留足够留白）。
2. **`#phenology-bar` 改为可滑动轨道**：在小屏与 `<=1100px` 视口下设置 `max-width: calc(100vw - 24px); overflow-x: auto; scroll-snap-type: x proximity;`，并在两侧加微弱渐隐遮罩提示可横向滑动。
3. **移动端顶栏压缩**：将 `360px`–`768px` 顶栏由 3 行合并为 **2 行**（第一行：Logo + 搜索胶囊 + 抽屉/帮助按钮；其余筛选、收藏、电台、主题、语言收纳进“更多/快捷工具”二级菜单或底栏入口），立即释放 `~60px` 地球垂直视野。
4. **粗指针触控尺寸兜底**：使用 `@media (max-width: 820px), (pointer: coarse)` 统一约束 `#brand-home-btn`、`capsule-icon-btn`、`pheno-btn` 的最小尺寸 `min-width: 44px; min-height: 44px`。

---

## 5. 真机物理设备验收清单（`UNVERIFIED-01` / `UNVERIFIED-02` 补测用）

> 以下条目无法通过桌面 Chromium 仿真替代，必须在发布终版前使用真实硬件逐项打勾验收。

| 设备与浏览器矩阵 | 验证项 | 具体验收操作与通过标准 |
|---|---|---|
| **iPhone (iOS Safari, 带灵动岛/刘海)** | 1. 双指捏合缩放与惯性冲突 | 在 3D 地球上快速双指捏合与单指惯性甩动，确认不触发 Safari 页面整体放大或历史前进/后退边缘手势；抽屉与地图手势边界无卡死 |
| **iPhone (iOS Safari)** | 2. WebGL 显存驱逐与恢复 | 连续开启 3D 地形 (`Terrain`) + 3D 建筑 + NASA GIBS 时光机 + 3D 取景器切换 10 个城市并切出后台 3 分钟再返回，确认不发生 `webglcontextlost` 白屏/黑屏或标签页崩溃重载 |
| **iPhone (iOS Safari) & Android Chrome** | 3. 虚拟键盘弹出与视口重排 | 在 Trip Planner（目的地搜索、AA 记账、评论输入）及 Command Palette 聚焦输入框时，确认 `100dvh`/`visualViewport` 未将提交按钮推到屏幕外，键盘收起后底栏位置不漂移 |
| **iPhone (iOS Safari)** | 4. 物理刘海/灵动岛与底部横条 | 竖屏与横屏左右旋转时，确认顶栏左右胶囊不被灵动岛/前置摄像头遮挡，底部 `#mobile-bottom-nav` 图标与 Home Indicator 保留清晰安全间距 |
| **Android Chrome (中端机 4–6GB RAM)** | 5. 热节流与冷启动响应 | 在真实 4G 网络下冷启动首页，确认首屏可在可接受时间交互，连续拖动 10 分钟不出现明显掉帧卡顿或触控延迟 |
| **iPadOS Safari (竖屏 & 90° 横屏 + 分屏 Slide Over)** | 6. 断点切换与悬停降级 | 从竖屏 (`768×1024`/`820×1180`) 旋转至横屏 (`1024×768`) 及 `1/2` 分屏模式，确认布局不卡死在中间态，无依赖 `:hover` 才能点击的功能入口，且粗指针热区 `>=44×44px` |
| **通用真机** | 7. 后台切回与离线 PWA 唤醒 | 添加到主屏幕（Standalone PWA 模式）后断网打开，验证 Service Worker 冷启动离线可用且无 `404`/`TypeError` 死循环 |
