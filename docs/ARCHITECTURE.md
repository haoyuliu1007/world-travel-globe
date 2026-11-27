# KAIROS. V5.0 — 系统架构说明 (ARCHITECTURE)

## 一、核心架构原则

1. **轻量边缘架构 + 按需代码拆分**：
   - 主运行时仍采用纯原生 UMD 模块打包 (`build-dist.js`) 运行于 Cloudflare Workers 与静态边缘托管，**不引入重型 SPA 构建框架**。
   - V5 新增重量级 UI 与导出模块全部拆分至 `js/lazy/`（`account-center.js`、`collab-space.js`、`expense-splitter.js`、`dest-compare.js`、`export-service.js`、`share-center.js`、`help-center.js`）及按需 JSON 资产（`data/transport/hubs.json`、`data/docs/manual-*.json`），使核心首屏 `js/app.bundle.min.js` 仅从 V4.5.0 基线 `202.1 KB` gzip 温和增长至 **`239.4 KB` gzip**。
2. **基线数据只读与历史兼容性**：
   - `data/registry.js` 与 55 个区域数据模块（722 城 / 5,414 机位 / 137 国）只读保护。
   - IndexedDB `WorldTravelGlobeDB`、历史键 `wtg_*`、V4 D1 表（`user_profiles` / `photo_metadata` / `profile_backups`）、传统 `/api/*` 与深链 `?focus=` / `?trip=` / `?footprint=` / `?embed=` 保持 100% 向后兼容。
3. **免注册可用、本地优先 & 可选云同步**：
   - 基础地球仪、搜索、科学模拟与单机行程离线可用；登录后通过 Cloudflare D1 (`migrations/0003_v5_accounts_collab.sql`) 启用跨端同步与多人协作。

---

## 二、系统模块分层

| 层级 | 核心文件 | 职责边界 |
|---|---|---|
| **1. 三维地球渲染与空间 UI 层** | `js/app.js`, `js/detail-panel.js`, `js/command-palette.js`, `css/upgrades.css`, `assets/brand/**` | MapLibre GL v5 3D 球体、KAIROS 矢量品牌与明暗高对比配色、移动底部导航 (`<=768px`)、吸顶工作区返回栏、History API 状态恢复、图层元信息检查器 |
| **2. 账号安全与多端协作后台层** | `worker/index.js`, `worker/auth.js`, `worker/collab.js`, `migrations/0003_v5_accounts_collab.sql`, `js/services/auth-service.js`, `js/lazy/account-center.js`, `js/lazy/collab-space.js`, `js/services/crdt-merge.js` | Web Crypto `PBKDF2-SHA256` 认证、`HttpOnly` Cookie 会话、CSRF 防护、RBAC (`owner/editor/viewer`)、限时/可撤销邀请、投票留言快照、CRDT 墓碑合并、`/api/fx` & `/api/epic?date=` |
| **3. 多式联运规划与 AA 分账层** | `js/modules/trip-planner.js`, `js/services/transport-service.js`, `js/services/routing-service.js`, `data/transport/hubs.json`, `js/lazy/expense-splitter.js` | OurAirports 722 城门户枢纽 + 铁路走廊评估、大圆航线诚实推演、OSRM/FOSSGIS 路网、锁点重排、时间线/日历/冲突检测、9 类多币种预算 2.0、最少转账 AA 清算 |
| **4. 科学物候、光影取景与搜索层** | `js/modules/phenology-engine.js`, `scripts/validate-phenology.js`, `js/modules/photo-simulator.js`, `js/modules/viewfinder-3d.js`, `js/modules/geo-intelligence.js`, `js/lazy/dest-compare.js` | Tier A/B/C 物候（23 城样本外校验）、独立空间天气极光卡、8 场景拍摄机会指数 + >14 天天气边界隔离、日照金山对比、3D 取景器九宫格/倾角/裁切框、10 维相似推荐与对比 |
| **5. 遥感实景、私密档案与分享手册层** | `js/modules/earth-timemachine.js`, `js/modules/epic-earth.js`, `js/services/media-wikidata.js`, `js/modules/media-gallery.js`, `js/modules/streetview.js`, `js/modules/travel-archive.js`, `js/lazy/export-service.js`, `js/lazy/share-center.js`, `js/lazy/help-center.js`, `sw.js` | GIBS 分屏混合对比、EPIC 历史日期、Commons 四季 EXIF 筛选、Panoramax 罗盘同步、默认私密档案与 EXIF GPS 剥离、8 格式导出、12 类 6 比例海报与本地 QR、30 章三语手册与 PWA 离线包 |
