# KAIROS. V5.0 — 性能、包体积与按需拆包报告 (V5_PERFORMANCE_REPORT)

## 一、构建产物体积对比（V4.5.0 基线 vs V5.0.0）

| 资产 / Bundle | V4.5.0 基线 (Gzip) | V5.0.0 实测 (Gzip) | Raw Size (V5.0.0) | 变化说明 |
|---|---|---|---|---|
| `js/app.bundle.min.js` | `202.1 KB` | **`239.4 KB`** | `899.0 KB` (37 files) | `+18.5%`（控制于 `<+30%` 预算内，重模块全部移入 `js/lazy/`） |
| `css/app.bundle.min.css` | ~`34 KB` | **`35.7 KB`** | `225.2 KB` | 包含品牌 token、移动端 44px 底栏、浅色对比与 `.modal-backdrop` |
| `vendor/libs.bundle.min.js` | `129.3 KB` | **`129.3 KB`** | `351.2 KB` | 零新增重型第三方供应商依赖 |
| `data/atlas-index.min.js` | `451.2 KB` | **`451.2 KB`** | `1265.6 KB` | 722 城完整基线只读索引保持零膨胀 |
| **懒加载独立模块 (`js/lazy/*`)** | 不含 | **`7` 个独立 JS + `4` 个 JSON 静态分片** | 按需下载 | `account-center` / `collab-space` / `expense-splitter` / `dest-compare` / `export-service` / `share-center` / `help-center`；`hubs.json` 与 `manual-*.json` 首屏 `0 KB` 下载 |

## 二、E2E 首屏加载时序实测 (Local Static Server + Headless Chrome)

| 指标 | V4.5.0 基线 | V5.0.0 实测 | 状态 |
|---|---|---|---|
| `domContentLoadedMs` | `96 ms` | **`96 ms`** | 零退化 |
| `loadMs` | `147 ms` | **`137 ms`** | 优于基线 (`-10 ms`) |
| `resourceCount` (首屏加载请求数) | `47` | **`52`** | 仅增加品牌轻图标与按需预取清单 |

## 三、架构节能与渲染调优机制

- **按需路由懒加载 (`LazyLoader`)**：账号、协作、分账、对比、8 格式导出、分享中心、30 章手册及 ECharts 图表仅在用户点击具体入口时动态注入 `<script>` 与 JSON，不拖慢地球首屏渲染。
- **Service Worker 增量缓存 (`sw.js`, `kairos-data-v5`)**：本地静默缓存区域数据分片、多语字典、品牌矢量资产、枢纽文件与懒加载脚本；明确限制**不批量预爬第三方商用地图瓦片**。
- **自适应帧率看门狗 (`diagnostics.js`)**：支持 `high / balanced / eco / auto` 渲染档位与页面切入后台 (`visibilitychange`) 时自动暂停高能耗循环。
