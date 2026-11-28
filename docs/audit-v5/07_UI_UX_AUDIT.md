# KAIROS V5.0 UI/UX 深度审计报告 (`07_UI_UX_AUDIT.md`)

**审计对象**：KAIROS (`world-travel-globe` v5.0.0, commit `cfec5a3`)  
**线上核验环境**：`https://world-travel-globe.globe-app.workers.dev/`（`1440×900`、`1920×1080` 及移动多视口实拍截图）  
**参照标准**：Apple Human Interface Guidelines (HIG) · Google Earth Web · PhotoPills · Wanderlog  
**视觉基调**：深海海军蓝 (`Navy`) + 琥珀金 (`Gold`) + 象牙白 (`Ivory`)，兼具天文馆级深色探索模式与日间象牙白阅读模式

---

## 1. 执行摘要与总体评价

KAIROS V5.0 在视觉美学与空间叙事上展现出极强的原创野心：开篇序章（`prod-01-prologue.png`）以深邃星野、地球轮廓呼吸光环与渐变双色标题营造出接近 Apple 发布会级别的沉浸感；3D 地球仪（`prod-02-globe-dark-zh.png`、`prod-03-globe-light-en.png`）与右侧信息抽屉（`prod-05-drawer-overview.png`、`prod-07-drawer-photo-sim.png`）在深色与日间玻璃态之间切换流畅，已具备专业级产品骨架。

然而，在 **V5 冲刺阶段快速叠加懒加载弹窗、规划工作台、协同分账与多语扩展** 后，界面层出现了严重的**工程一致性断裂与可用性债务**：
- **1 项 P0 阻断级视觉缺陷（`KAIROS-006`）**：`css/upgrades.css:2455` 引用了未定义的 CSS 变量 `--bg-panel`，导致 4 个核心 V5 懒加载弹窗在日间（Light）模式下回退为深黑底色并叠加 `#18181B` 深色文字，对比度跌至 **`1.03:1`–`1.1:1`**，完全不可阅读（`prod-14`、`prod-15`、`prod-17`）。
- **多层系统性 P1/P2/P3 交互与排版问题**：包括 `#account-modal` 嵌套错位留白（`KAIROS-026`、`prod-16`）、误判静态环境（`KAIROS-022`、`prod-16`）、`#topbar` 穿透 `#planner-view`（`KAIROS-030`、`prod-11`/`prod-19`）、`Escape` 键与 `aria-labelledby` 缺失（`KAIROS-030`）、金底/金字 `#B47D22` 对比度全面不达标（`KAIROS-033`）、3D 取景器 HUD 竖线遮字与 `0m` 海拔（`prod-08`）、EPIC 黑框死等（`prod-10`、`KAIROS-027`）以及时光机英文模式残留简体中文（`KAIROS-027`）。

| 评价维度 | 对标标杆 | KAIROS V5.0 现状评分 | 核心差距摘要 |
|---|---|---|---|
| 品牌视觉与审美格调 | Apple / Google Earth | **4.3 / 5.0** | 深空星野、双主题玻璃态胶囊、序章排版极佳；但双圆环 Logo 与未定义变量破坏一致性 |
| 色彩对比度与可读性 | WCAG 2.1 AA / Apple HIG | **2.0 / 5.0** | 日间懒加载弹窗 `1.03:1` 黑底黑字不可读（P0）；`#B47D22` 金色组件 `2.41:1`–`3.56:1` |
| 信息架构与认知负荷 | Google Earth / Wanderlog | **3.0 / 5.0** | 地球主界面克制优雅，但抽屉内 6 标签与规划器 5 子模块并置导致首屏信息密度过载 |
| 专业摄影工具 HUD | PhotoPills | **3.5 / 5.0** | 光影罗盘与 3D 取景器构想优秀，但顶部 HUD 竖线压字、`海拔 0m`、缺实时地形高度联动 |
| 键盘导航与无障碍 (A11y) | WAI-ARIA Dialog APG | **2.2 / 5.0** | 所有 V5 懒加载弹窗按 `Escape` 无法关闭，缺少 `aria-labelledby` 与焦点陷阱 |

---

## 2. 对标业界标杆的维度评估

### 2.1 Apple / Google Earth 维度：空间感、克制感与视觉层级
- **做得好的地方**：
  - **序章与地球主画布**：`prod-01-prologue.png` 中星空、地平线微光与居中 CTA（`"开启序章之旅 ↓"`）节奏优雅；`prod-02-globe-dark-zh.png` 仅保留顶部三段式悬浮胶囊、右下角底图条与底部物候月份条，将 `80%+` 屏幕留给地球本体，符合 Google Earth 的「内容优先」原则。
  - **命令面板 (`⌘K`)**：`prod-04-command-palette.png` 的意图标签芯片（`秋季` / `秋色`）、匹配原因徽章与底部快捷键提示（`↑↓ 选择 · Enter 定位 · Esc 关闭`）接近 Raycast / Spotlight 水准。
- **失分之处**：
  - **模态层级隔离失效**：`prod-11-trip-planner.png` 与 `prod-19-mobile-planner-390x844.png` 中，打开全屏 `#planner-view` 后未隐藏底层 `#topbar`，导致半透明顶栏下清晰透出地球视图的胶囊按钮与搜索框重影（`KAIROS-030`）。
  - **品牌视觉重复**：`prod-02`/`prod-03` 左上角在 `kairos-horizontal.svg`（已自带圆环徽标）右侧又额外绘制了一个独立空心圆环按钮，造成“双圆环”视觉冗余（`KAIROS-033`）。

### 2.2 PhotoPills 维度：摄影专业度与现场可用性
- **做得好的地方**：`prod-07-drawer-photo-sim.png` 将时区与引擎标识（`Asia/Shanghai · UTC+8 · SunCalc`）、时间滑块、快捷时刻胶囊（`蓝调晨` / `日出` / `黄金晨` 等）、画幅/等效焦距、方位罗盘与光影定性结论集于一屏，逻辑闭环清晰。
- **失分之处**：
  - PhotoPills 的核心体验是「**数字零歧义与海拔真实性**」。而在 `prod-08-viewfinder-3d.png` 中，德钦飞来寺实际海拔 `3400m`，HUD 右下角却显示 **`海拔 0m · Asia/Shanghai · UTC+8`**；同时顶部 HUD 中央的金色竖线直接压在 `☀ 40°` 的度数符号上（`KAIROS-033`）。
  - 实景地图与模拟画幅之间缺少明显的「当前焦距框占满视场 vs 光学裁切」的清晰物理说明（虽有 `光学视场 53°` 胶囊，但对非专业用户缺乏引导）。

### 2.3 Wanderlog 维度：行程规划、表单密度与协作清晰度
- **做得好的地方**：`prod-11-trip-planner.png` 采用左栏参数配置 + 右栏日程/交通/预算/准备/协作的桌面双栏工作台，单日卡片内锁定锁头、时段、时长一目了然。
- **失分之处**：
  - **操作按钮重复**：`prod-11` 顶部左上角已有 `< 返回地球`，右侧英雄区按钮组又再次出现 `↗ 返回地球`，造成用户对二者差异的困惑。
  - **协同按钮断行与状态割裂**：`prod-13-collab-aa-modal.png` 中 `"发起投\n票"`、`"发\n送"`、`"添\n加"` 在窄圆胶囊内折成两行；右上角显示 `Local CRDT Sync`，而登录 Workers 环境下又会展示 `D1 Cloud RBAC` 徽标却不向服务器发请求（`KAIROS-003`），状态指示与实际行为不符。

---

## 3. 基于线上实拍截图的逐项问题诊断（Screenshot-Grounded Critique）

### 3.1 [P0] `--bg-panel` 未定义导致日间模式 4 大核心弹窗“黑底黑字”完全不可读（`KAIROS-006`）
- **截图证据**：
  - `screenshots/prod-14-share-center.png`（分享中心）
  - `screenshots/prod-15-help-center.png`（帮助中心 30 章手册）
  - `screenshots/prod-17-dest-compare.png`（目的地 2–4 城对比弹窗）
  - （同源波及：`#trip-export-modal` 多格式导出弹窗）
- **实拍观感与量化证据**：
  - 在 `prod-15-help-center.png` 中，左侧 30 章导航标题与右侧正文的章节标题、步骤说明几乎全部消失在深黑色背景中，仅剩金色的 `"第 1 章 · 快速上手"` 与白色 `"真实边界与限制"` 几行文字隐约可见；`prod-14-share-center.png` 中弹窗主标题、说明文字与底部 X/Reddit/WhatsApp 分享按钮均呈黑底暗字；`prod-17-dest-compare.png` 中对比表的各城数据行文字几乎全黑隐身，仅 `<select>` 下拉框保留了浏览器默认白底。
  - 根因定位在 `css/upgrades.css:2451-2460`：`.modal-card` 使用了 `background: var(--bg-panel, rgba(16, 22, 34, 0.96))`，而 `css/styles.css:1-86` 的 `:root` 与 `html[data-theme='light']` 均**未定义 `--bg-panel`**（正确令牌为 `--bg-solid`）。于是日间模式下文字切换为 `--text-primary: #18181B`（`rgb(24, 24, 27)`），背景却硬回退到深海蓝 `rgb(16, 22, 34)`。
  - `evidence/ui-mobile-audit-results.json` 实测对比度：**`1.03:1`**（远低于 WCAG AA `4.5:1` 与大字 `3.0:1` 要求）。
- **额外连带缺陷（`prod-14-share-center.png` / `KAIROS-019`）**：分享中心右侧 `.sc-qr-box` 白色卡片内渲染的二维码（约 `180px`）向右明显溢出白框边界，原因是 `js/lazy/share-center.js:100` 向 `QRCodeService.renderSvg` 传入了位置参数 `136` 而非 `{ size: 136 }`。

### 3.2 [P1/P2] 账号弹窗嵌套畸形留白 + 错误触发“纯静态浏览模式”（`KAIROS-026`、`KAIROS-022`）
- **截图证据**：`screenshots/prod-16-account-modal.png`
- **实拍观感与根因**：
  1. **视觉结构错位（`KAIROS-026`）**：`#account-modal` 外层套用了 `760px` 宽的磨砂玻璃容器 `.diag-modal`，内层却嵌套了 `max-width: 480px` 的白色卡片 `.epic-dialog`（`js/lazy/account-center.js:26, 58, 86`），导致弹窗右侧平白多出一块约 `280px` 宽的空白磨砂玻璃块，视觉重心严重左偏。
  2. **线上功能误判（`KAIROS-022`）**：该截图采自绑定了 D1 与 Auth 的 Cloudflare Workers 生产站，但弹窗内却显示 `"当前访问环境为纯静态浏览模式……请访问 Cloudflare Workers 生产站点并配置 D1"`。根因在于 `js/services/api-client.js:118-159` 的 `detectWorkerCapabilities()` 将 `/api/health` 探测超时设为极短的 `1800ms`，一旦冷启动或跨境 RTT 超过 `1.8s` 即永久缓存 `fallback` 静态模式且永不重试。

### 3.3 [P2/P3] 顶栏穿透规划视图（`KAIROS-030`）、搜索胶囊截断与双圆环（`KAIROS-033`）
- **截图证据**：
  - `screenshots/prod-11-trip-planner.png`、`screenshots/prod-19-mobile-planner-390x844.png`
  - `screenshots/prod-02-globe-dark-zh.png`、`screenshots/prod-03-globe-light-en.png`
- **具体表现**：
  - **图层穿透（`KAIROS-030`）**：`prod-11` 与 `prod-19` 顶部白色导航栏后方直接透出隐藏失败的 `#topbar` 轮廓，产生双层控件叠加噪点；规划页 Hero 按钮组在移动端（`prod-19`）纵向排成 5 颗大按钮占据近半屏高度，且与顶栏 `< 返回地球` 重复。
  - **搜索框文字截断（`KAIROS-033`）**：即使在 `1440×900`（`prod-02`/`prod-03`）乃至 `2560×1440` 超宽屏上，中央胶囊 `#open-palette-btn` 宽度被锁死在 `192px`，导致提示文案被强制截断为 `"搜索 722 城与 5,41…"` 与 `"Search 722 cities …"`，恰恰把最核心的卖点数字 `"5,414 机位"` 砍掉。
  - **双圆环品牌冗余（`KAIROS-033`）**：`prod-02`/`prod-03` 左上角 `KAIROS.` 左侧有圆环图形，右侧 `#brand-home-btn` 相邻位置又出现一个等大的独立圆环描边，破坏品牌识别纯粹性。

### 3.4 [P3] 全局 `#B47D22` 金色对比度失效（`KAIROS-033`）
- **量化证据（`evidence/ui-mobile-audit-results.json`）**：
  - **白字金底**（如激活态 `"全年"` 胶囊、`"智能生成逐日计划"`、`"在地球上预览路线"`、`"记一笔"`、`"复制链接"`）：`#FFFFFF` on `#B47D22` (`rgb(180,125,34)`)，实测对比度 **`3.56:1`**，未达到 WCAG AA 正常文本 `4.5:1` 标准。
  - **金字浅底**（如日间激活模式字样 `"地球"`）：`rgb(180,125,34)` on `rgb(219,211,199)`，实测对比度仅 **`2.41:1`**。
  - **次要警告/跳过按钮**：`#col-revoke-invite`（`"撤销并轮换链接"`，粉红字 `rgb(251,113,133)` on `rgb(242,242,243)`）对比度仅 **`2.41:1`**；引导页 `#tour-welcome-skip-btn`（`"暂不导览"`）对比度 **`3.71:1`**。
- **修复建议**：日间模式保留品牌金的暖调气质，将 `#B47D22` 深化为 **`#8C5E12`**（白字对比度约 `5.6:1`）或 **`#7A510E`**（用于浅底文字），即可在不丧失“海军蓝+琥珀金”品牌基因的前提下全量通过 AA 门禁。

### 3.5 [P3] 7 日预报文字换行错位、3D 取景器 HUD 重叠与协同按钮折行（`KAIROS-033`）
- **7 日天气预报错位（`screenshots/prod-06-drawer-phenology-weather.png`）**：7 天横向卡片中，第 5 天（`12-02`）天气描述 `"大部晴朗"` 折成 `"大部晴\n朗"` 两行，导致该列下方温度 `-4°/12°` 与降水概率 `💧0%` 整体下移约 `14px`，破坏横向数字基线对齐。应为 `.weather-cond` 添加 `white-space: nowrap; overflow: hidden; text-overflow: ellipsis;` 或使用 `display: grid; grid-template-rows: subgrid`。
- **3D 取景器 HUD 瑕疵（`screenshots/prod-08-viewfinder-3d.png`）**：
  - 顶部居中状态胶囊内，用于分隔银河核心与太阳高度的金色竖线错位压在 `☀ 40°` 的 `°` 上（疑似绝对定位 `left: 50%` 未考虑两侧文字不对称宽度，应改为 Flex 子项或 `border-left`）。
  - 右下角坐标栏显示 **`海拔 0m`**，未读取当前选中机位海拔（如德钦飞来寺 `3400m`）或 DEM 高程。
  - 底部焦距栏中 `400mm` 被挤到第二行孤立显示，应统一为单行横向排版或分组对齐。
- **协同空间按钮折行（`screenshots/prod-13-collab-aa-modal.png`）**：在成员添加、投票、评论三个输入行右侧，圆形提交按钮因固定宽度过窄（或缺少 `white-space: nowrap; flex-shrink: 0`），导致 `"添加"`、`"发起投票"`、`"发送"` 全部被迫折成两行字。

### 3.6 [P2] NASA EPIC 黑屏等待 & 地球时光机中英文混杂（`KAIROS-027`）
- **EPIC 黑框死等（`screenshots/prod-10-epic-modal.png`）**：弹窗顶部与底部元数据（拍摄时间 `2026-11-25 00:13:03 UTC`、星下点 `-18.9°, 164.9°`）已渲染，但核心主图区域是一整块纯黑矩形，既无加载指示器（Spinner / 骨架动画），在 NASA 上游拉图超时/失败时也无降级提示或重试按钮。
- **时光机未国际化与对比模式误导（`prod-09-timemachine.png` + `functional-audit-results.json`）**：切换全站为英文模式（`en`）时，Topbar、抽屉标签、30 章手册均已切换为英文，但 `#timemachine-dock` 仍整段输出硬编码简体中文（`"地球时光机 · NASA GIBS 遥感 启用图层……"`）；且其所谓 `"分屏对比"` 实际是通过 `raster-opacity` 透明度叠加实现，并非真正的空间左右卷帘分屏。

---

## 4. 认知负荷与新用户首访理解度评估

### 4.1 首次访问漏斗分析
1. **第一印象 (`prod-01-prologue.png`)**：叙事张力极强，但点击跳过/进入地球后，用户瞬间面对 **14 个以上顶栏/底栏交互入口**（清单、筛选、收藏、地球/图鉴/规划/档案、搜索 `⌘K`、电台、主题、语言、账号、帮助、底图切换、中国/全球快捷、13 个物候月份胶囊、5 颗右侧地球控件）。
2. **新用户理解成本高点**：
   - **符号隐喻不透明**：顶栏左侧“清单 / 漏斗 / 书签”与右下角“图层图标 / 中国 / 全球”缺少文字标签或直观分组提示；右侧 3D 控件最上方立方体按钮（倾斜/建筑物/重置）在未悬停时较难预判作用。
   - **抽屉内深层能力暴露不足**：一个目的地拥有 **6 个一级标签**（机位 / 光影 / 物候 / 气候 / 预算 / 动线），外加标题上方的全景按钮、对比按钮、行程按钮、3D 取景器入口。普通旅行者想规划一次 4 天行程，容易在“抽屉内动线标签”与“顶部规划模式”之间迷失（两者定位重叠，前者是静态推荐动线，后者是交互式排程）。
   - **引导跳过按钮可读性差**：`#tour-welcome-skip-btn` 对比度仅 `3.71:1`，且首次进入未明确区分「轻量浏览（3 步看懂地球）」与「专业摄影/规划模式」。

### 4.2 降低认知负荷的改进建议
1. **渐进式披露 (Progressive Disclosure)**：默认首屏折叠非高频的“电台/筛选/物候小圆点”辅助提示，或为初次打开的抽屉提供「旅行概览模式 vs 摄影实验室模式」轻切换。
2. **合并重叠概念**：将详情抽屉中的「动线」标签与顶部「规划」入口做清晰衔接（例如抽屉内按钮直接写 `"导入到智能行程规划器 →"`），消除两套“行程”心智模型。
3. **诚实状态标注**：未接通云端的协作空间明确标注 `"本地沙盒模式"`，避免 UI 徽章与实际持久化行为冲突（`KAIROS-003`）。

---

## 5. 键盘导航与无障碍（ARIA / A11y）审计

根据 `evidence/ui-mobile-audit-results.json`（`modalA11y`）与 `evidence/functional-audit-results.json` 的实测结果：

1. **V5 懒加载弹窗 `Escape` 键全面失效（`KAIROS-030`）**：
   - `js/app.js:3081` 的全局 `keydown` 仅监听了旧版抽屉与 `viewfinder-hud`（`vfClosedOnEsc: true`），而 **`#help-center-modal`（实测 `hcClosedOnEsc: false`）、`#share-center-modal`、`#dest-compare-modal`、`#account-modal`、`#trip-export-modal`、`#music-popover`** 按 `Escape` 均无法关闭，键盘用户陷入死胡同。
2. **ARIA 语义缺失（`modalA11y` 扫描实证）**：
   - 共有 `19` 个 `role="dialog"` 容器，其中 **`share-center-modal`**、**`help-center-modal`**、**`dest-compare-modal`** 的 `ariaLabel` 为 **`false`**（既无 `aria-label` 也无 `aria-labelledby` 关联标题）。
   - 弹窗开启时缺少 **Focus Trap（焦点循环）**，且关闭后未将焦点还原至触发按钮（如 `#help-btn` 或 `#account-btn`）。
3. **焦点可见性**：`cssScan` 检测到 `7` 条 `:focus-visible` 规则，基础键盘焦点轮廓已具备，但需补充覆盖懒加载弹窗内部表单与动态按钮。

---

## 6. 优先修复清单（按用户感知严重度排序）

| 优先级 | 关联问题 ID | 涉及文件/组件 | 具体修改建议 |
|---|---|---|---|
| **P0** | `KAIROS-006` | `css/upgrades.css:2455`、`css/styles.css` | 在 `:root` 与 `[data-theme='light']` 显式定义 `--bg-panel`，或将 `.modal-card` 改为 `var(--bg-solid)`，立刻修复 `prod-14`/`15`/`17` 与导出弹窗的 `1.03:1` 黑底黑字不可读问题 |
| **P1** | `KAIROS-019` | `js/lazy/share-center.js:100` | 修复 `QRCodeService.renderSvg` 传参为 `{ size: 136 }`，消除 `prod-14` 二维码溢出白框问题 |
| **P1** | `KAIROS-022` | `js/services/api-client.js:118-159` | 将 `/api/health` 超时放宽至 `5000ms` 且不永久缓存瞬时超时失败，修复 `prod-16` 在 Workers 站误报静态模式 |
| **P1** | `KAIROS-030` | `js/app.js:3081`、`css/upgrades.css` | 建立统一 Modal Manager（全量支持 `Escape` 关闭、焦点陷阱、`aria-labelledby`）；全屏覆盖态隐藏 `#topbar` 消除 `prod-11`/`19` 穿透重影 |
| **P2** | `KAIROS-026` | `js/lazy/account-center.js:26,58,86` | 统一使用 `.modal-backdrop` + `.modal-card`，移除 `.diag-modal` 内嵌 `.epic-dialog` 导致的 `280px` 右侧空白玻璃板（`prod-16`） |
| **P2** | `KAIROS-027` | `js/modules/earth-timemachine.js`、`epic-earth.js` | 为 `#timemachine-dock` 接入 `AppI18n` 三语词条，诚实标注透明度混合对比；为 `epic-stage-img` 增加 Loading Spinner 与失败重试视图（`prod-10`） |
| **P3** | `KAIROS-033` | `css/styles.css`、`index.html`、`viewfinder-3d.js`、`collab-space.js` | Light 主题金色调整为 `#8C5E12`（对比度 `>=4.5:1`）；移除左上角多余圆环；放宽搜索框显示 `"5,414 机位"`；修复 7 日天气折行、取景器竖线与真实海拔绑定、协同按钮 `white-space: nowrap` |
