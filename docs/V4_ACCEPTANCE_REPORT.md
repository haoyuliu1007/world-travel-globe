# World Travel Globe V4.x 系列验收归档报告

> [!NOTE]
> 最新 **V4.5.0** 全量工程加固、IANA 时区、真球晨昏线、CRDT 随机性质检验、1200×630 PNG OG 卡片与 Playwright E2E 完整实测结果，请直接查阅 [**V4_5_ACCEPTANCE_REPORT.md**](V4_5_ACCEPTANCE_REPORT.md) 与 [**KNOWN_LIMITATIONS.md**](KNOWN_LIMITATIONS.md)。

- **历史归档版本**：`v4.4.0` (Full Global Trilingual & Scenery Precision)
- **前置版本**：`v4.0.0` (`6218599`), `v4.1.0` (`43a939b`), `v4.2.0` (`9298f4a`), `v4.3.0` (`5061cb1`)
- **更新日期**：2026-11-27

---

## 一、V4.4.0 国际化与媒体质量专项升级

1. **首屏序章三语切换与 8 幕全文本国际化 (`assets/prologue/prologue.js`, `assets/prologue/prologue.css`)**：
   - 首屏右上角新增 `简 / 繁 / EN` 切换胶囊，点击即时无刷新重绘全部 8 幕序章、Canvas 仪器刻度与坐标锁定标签，并通过 `<html lang>` 同步驱动 CosmicIntro 与地球仪主界面。
2. **内容层全量英文化 + 无障碍 `aria-label` 水合**：
   - 完整翻译光影模拟器 & 3D 取景器、科学物候 & 追美指数、实时气象与 5 年 ERA5 图表、Wikidata 核验卡、360° 街景弹窗、规划默认预算分类、足迹大洲轴及静态 HTML `data-i18n-aria` / `data-i18n-title`。
3. **目的地实景画廊去美食化优选 (`js/services/media-wikidata.js`)**：
   - 强化菜品关键词拦截并提高景点文字检索与 Wikipedia Lead Image 权重，避免地标英雄图误配周边美食照。

---

## 二、V4.3.0 新增五大高杠杆升级（沿用）

1. **太阳驱动「真·昼夜晨昏地球」(`js/modules/solar-terminator.js`)**：
   - 纯天文离线实时计算太阳直射点、0°/民用/航海三层晨昏线球面阴影及暖金色晨昏晕，联动 MapLibre `setLight` 与夜面 Black Marble 灯光，支持 24 小时 UTC 滑动推演。
2. **722 城静态 SEO 落地页与 OG 卡片 (`scripts/build-seo-pages.js`, `build-dist.js`)**：
   - 构建期零成本输出 `dist/p/<id>/index.html`（722 城完整指南、JSON-LD 结构化数据、深链 CTA 与 `<iframe>` 嵌入代码）、`dist/p/index.html`、`dist/og/<id>.svg`、`dist/og/cover.png`（1200×630 PNG 兜底封面）、`dist/sitemap.xml` 与 `dist/robots.txt`。
3. **Retina 旅行海报导出与原生系统分享 (`js/modules/poster-share.js`)**：
   - 支持目的地、全球足迹档案与智能行程一键生成 `1080×1620` Retina PNG 海报，结合 `map.once('render')` 无损抓帧与 `navigator.share({ files })` 系统级分享。
4. **可嵌入迷你地球小部件 (`?embed=<id>&chrome=off`)**：
   - 支持博客 / Notion 免工具栏纯享地球仪嵌入与底栏回链，详情页内置一键复制 `<iframe>` 代码。
5. **数据源免费增厚**：
   - 接入 **Mapterhorn 512px WebP DEM**（免 Key 全球 30m / 局部亚米级，AWS Terrarium 自动兜底）、**Open-Meteo 空气质量 / PM2.5 / UV / 花粉** 与 **NASA DSCOVR EPIC L1 今日真地球实拍**。

---

## 二、本地构建与自动化测试基线

- 原始数据校验 (`node scripts/audit-data.js`)：137 国/地区 · 722 城市 · 5,414 机位 · 0 重复 ID · 0 无效坐标。
- 生产构建 (`node build-dist.js`)：生成 `dist/` 全量静态包与 722 城 SEO 落地页 + OG 视觉卡。
- 全量测试 (`node --test tests/*.test.js`)：完整运行结果以实际命令输出为准（详见对话记录）。
