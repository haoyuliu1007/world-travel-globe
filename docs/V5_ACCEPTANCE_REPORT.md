# KAIROS. V5.0 — 全面升级验收报告 (V5_ACCEPTANCE_REPORT)

- **验收版本**: `v5.0.0-rc1` (`package.json` = `5.0.0`)
- **开发分支**: `v5-dev` (基线回滚点 `v4.5.0-pre-v5-baseline` @ `f765bbd`)
- **验收时间**: 2026-11-28

## 一、全量自动化验证实测结果

| 检查项 | 执行命令 | 实测结果 | 备注 |
|---|---|---|---|
| 数据完整性审计 | `npm.cmd run audit` | **PASS** — 56 个数据模块、6 大区、137 国/地区、722 城市、5,414 机位（0 重复/无效坐标/缺失字段） | `data/audit-report.json` |
| 生产包静态构建 | `npm.cmd run build` | **PASS** — 生成 `dist/` 共 `2,382` 文件；722 SEO 页面 + 723 PNG OG 卡片 + `sitemap.xml` (724 URL) | `build-dist.js` |
| 科学物候验证 | `node scripts/validate-phenology.js` | **PASS** — 23 城校准子集 (Tier C): Blossom holdout MAE `2.89d` (RMSE `3.64d`); Autumn MAE `4.84d` (RMSE `6.03d`) | 其余 699 城诚实标为 `Tier B` |
| 单元与集成测试 | `npm.cmd test` | **66 / 66 PASS**（`618.7 ms`，0 失败，0 跳过） | 覆盖 V4.0–V4.5 + V5 Batch 1–7 全部测试 |
| Playwright 端到端 | `npm.cmd run test:e2e` | **15 / 15 场景 PASS**（`0` 项未捕获 `pageerror`） | Chrome 无头执行 + 8 视口仿真截图存档 |

## 二、8 组仿真视口实测记录 (Emulated Chromium — 非物理真机)

> ⚠️ 重要声明：以下尺寸数据来自本机桌面 `Chrome` (`playwright-core`) 视口仿真环境，**不是物理真机硬件测试**；截图已保存至 `e2e/screenshots/v5/`。

| 视口规格 | `scrollWidth / innerWidth` | `overflowPx` | 最低触控/导航高度 | 结果 |
|---|---|---|---|---|
| `360×800` (mobile) | `360 / 360` | `0` | `44 px` | PASS |
| `390×844` (mobile) | `390 / 390` | `0` | `44 px` | PASS |
| `430×932` (mobile) | `430 / 430` | `0` | `44 px` | PASS |
| `768×1024` (tablet) | `768 / 768` | `0` | `44 px` | PASS |
| `1024×768` (laptop) | `1024 / 1024` | `0` | `34 px` | PASS |
| `1440×900` (desktop) | `1440 / 1440` | `0` | `34 px` | PASS |
| `1920×1080` (desktop) | `1920 / 1920` | `0` | `34 px` | PASS |
| `2560×1440` (desktop) | `2560 / 2560` | `0` | `34 px` | PASS |

## 三、关键闭环功能验收项

1. **KAIROS 品牌系统**：10 个纯矢量 SVG（零 Base64 嵌图）、16px–512px PNG/ICO 图标与 722 张 V5 OG 卡片均验证无误；保留 `WorldTravelGlobeDB` / `wtg_*` / `?focus=` 兼容性。
2. **行程规划历史缺陷修复 & 2.0 升级**：输入“北京”精确锁定 `cn-beijing`，不串台东京；多式联运 3 层对比、锁点重排、预算 2.0 及 `.modal-backdrop` 高层级 `z-index: 220` 导出弹窗全部在 E2E 中点击通过。
3. **科学诚信保护验证**：摄影机会指数在选定 45 天后日期时强制屏蔽实时气象因子 (`weatherIncluded: false`)；极光明确独立为空间天气模块；Wikimedia 白名单保留梯田/野鸭同时继续拒收菜品照。
4. **帮助手册 & 分享中心**：`#help-btn` 加载全部 **30 章三语手册**并支持全文检索过滤；`ShareCenter` 正确通过 `QRCodeService.renderSvg` 渲染本地内联二维码并支持 6 种画幅与 12 类对象。
