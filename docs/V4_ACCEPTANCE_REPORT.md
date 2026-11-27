# World Travel Globe V4.2.0 验收与审计闭环报告

- **当前版本**：`v4.2.0` (Reliability, Scientific Precision & Global UX Polish)
- **前置版本**：`v4.0.0` (`6218599`), `v4.1.0` (`43a939b`)
- **更新日期**：2026-11-27

---

## 一、核心指标与构建产物校验

| 检查项 | 实测结果 |
|---|---|
| 原始地理数据完整性 (`node scripts/audit-data.js`) | 56 数据模块 · 6 大洲域 · 137 国/地区 · 722 城市 · 5,414 机位 · 0 重复 ID · 0 无效坐标 |
| 无损增强层构建 (`node scripts/build-enrichment.js`) | `data/enrichment/atlas-enrichment.json` 完整覆盖 722/722 城市 |
| 生产打包 (`node build-dist.js`) | 输出 178 个静态资源文件至 `dist/`，单页资源引用保持 4–8 约束内 |
| 自动化测试套件 (`node --test tests/*.test.js`) | 见终端 `node --test tests/*.test.js` 实测输出（含 V4.0 / V4.1 / V4.2 全套回归与边界测试） |

---

## 二、V4.2.0 已验证关闭的外部评测与审计问题

1. **CRDT 删除墓碑与安全隔离 (`js/services/crdt-merge.js`, `storage-db.js`, `travel-archive.js`)**：新增 `tombstones`、`logicalClock`、`travelStatus` 字段级合并、本地同步前自动快照备份与敏感键（`cloudSyncPassphrase` 等）严格剥离。
2. **3D 取景器光学裁切与比例 (`viewfinder-3d.js`, `photo-simulator.js`)**：突破 WebGL 18° FOV 限制，长焦段按光学正切比动态缩窄 HUD 取景框，支持 14–600mm、横竖构图与 3:2/4:3/16:9/1:1。
3. **目的地当地时间与多分辨率 DEM (`photo-simulator.js`, `terrain-3d.js`)**：全球日出日落/银河窗口按目的地 `UTC±X` 计算，经特罗姆瑟、雷克雅未克、武汉、新加坡、特卡波湖与南极站点跨经度太阳中天验证；DEM 支持 `z12 近场 + z11 远场`。
4. **地球标签碰撞、平滑缩放与可点击悬停卡 (`app.js`)**：Supercluster 聚合圈边界接入避让盒，英文地名自动回退；`±0.35` 级连击阻尼缩放；悬停卡片 180ms 移入缓冲且点击打开详情抽屉。
5. **全界面三语覆盖与 CI/文档修复**：补齐机位按钮、状态栏、画廊、Planner、Archive 及 `document.title` 翻译；修复 `.github/workflows/data-governance.yml` 工作目录错误并移除文档中的本地绝对路径。
6. **数据标注诚信与搜索去噪**：ERA5 明确标注为“再分析网格气候”；跨大洲图片过滤拦截无关州旗/Logo；支持“不要X/预算硬上限/平替类比”。

---

## 三、透明说明与后续 V4.x 可选演进路线

- 本次严格遵循“轻量、零密钥、零浏览器端大模型权重下载”原则，未引入浏览器端 `Transformers.js` 或需独立后端服务的 Valhalla/OTP/GDAL/PMTiles 全量切片管线。
- 云端浏览器端 390px 真机交互截图与自动化 Playwright E2E 视觉回归、以及基于 GitHub Actions 的多年份 NASA/MODIS 卫星气候栅格离线汇编，作为后续 V4.3+ 专项演进轨道保留。
