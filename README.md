<div align="center">

# KAIROS. — WORLD TRAVEL ATLAS (V5.1)

**以天文学的精度去旅行——去对地方，更要去对时间。**

*Travel with Astronomical Precision — go to the right place, at the right time.*

[![Version](https://img.shields.io/badge/Version-v5.1.0-E8A33D?style=flat-square&labelColor=16283F)](docs/CHANGELOG.md)
[![Countries](https://img.shields.io/badge/Countries%20%26%20Regions-137-38BDF8?style=flat-square&labelColor=16283F)](#data-scale)
[![Destinations](https://img.shields.io/badge/Destinations-722-34D399?style=flat-square&labelColor=16283F)](#data-scale)
[![Photo Spots](https://img.shields.io/badge/Photo%20Spots-5%2C414-A78BFA?style=flat-square&labelColor=16283F)](#data-scale)
[![Tests](https://img.shields.io/badge/Unit%20Tests-V5.1%20Verified-10B981?style=flat-square&labelColor=16283F)](docs/V5_1_RELEASE_NOTES.md)
[![E2E](https://img.shields.io/badge/Playwright%20%2B%20axe--core-Verified-10B981?style=flat-square&labelColor=16283F)](docs/V5_1_RELEASE_NOTES.md)

[🌐 生产环境 (Cloudflare Workers)](https://world-travel-globe.globe-app.workers.dev/) · [📄 GitHub Pages 镜像](https://haoyuliu1007.github.io/world-travel-globe/) · [📖 架构说明](docs/ARCHITECTURE.md) · [🎨 品牌规范](docs/BRAND_GUIDELINES.md) · [🚀 V5.1 发布说明](docs/V5_1_RELEASE_NOTES.md)

</div>

---

## V5.0 全球智能旅行决策闭环

KAIROS. V5.0 在 **World Travel Globe V4.5.0** 基础上完成品牌升级与全链路产品重构，打通完整旅行闭环：

**发现目的地 → 判断最佳出行时间 → 比较交通方案 → 模拟摄影 → 智能制定行程 → 邀请朋友共同规划 → 实际出行 → 记录和分享旅行**

### V5.0 核心升级一览

1. **KAIROS 矢量品牌系统与全站体验精修**：
   - 基于原版画稿无损矢量化的纯 SVG 圆相与字标资产库（`assets/brand/svg/*`、`icons/*`、722 城 V5 OG 卡片）。
   - 修复「输入北京误出东京」历史状态串台问题；支持显式新建草案与中英文模糊候选匹配。
   - 新增工作区吸顶返回栏、手机端底部 44px+ 导航胶囊与浅色高对比度规范。
2. **可选账号认证、访客隔离与 D1 云同步 (`worker/auth.js`, `migrations/0003_v5_accounts_collab.sql`)**：
   - 免注册即可使用全部基础地球仪、探索与本地规划功能。
   - 账号认证采用 Web Crypto `PBKDF2-SHA256`（100,000 次迭代）、`HttpOnly; SameSite=Lax; Secure` 会话 Cookie、CSRF 校验、一键导出全量个人 JSON 与级联注销删除；保留 V4 历史表与路由 100% 兼容。
3. **三层多式联运智能行程规划 2.0 (`transport-service.js`, `trip-planner.js`)**：
   - 覆盖 722 城 **OurAirports 门户机场与高铁/铁路枢纽 (`data/transport/hubs.json`)**，支持大圆航线、高铁/铁路、自驾、长途、渡轮对比及机场接驳/市内出行建议。
   - 多城串联、锁定保留站点、时间线/日历视图切换、冲突检测（衔接超时/夜间/开放提醒）、9 类多币种预算 2.0（接入 Frankfurter ECB 汇率 `/api/fx`）与行前装备/电压签证指南。
4. **多人实时协作、RBAC 权限与 AA 最少转账分账 (`worker/collab.js`, `js/lazy/collab-space.js`, `js/lazy/expense-splitter.js`)**：
   - 支持限时/可撤销邀请链接、Owner/Editor/Viewer RBAC 权限、讨论评论、民主投票、版本快照与 CRDT (`mergeTripDocuments`) 无冲突收敛。
   - 支持均摊与按权重 AA 分账，使用贪心最少转账算法出具极简结账清单并导出 CSV。
5. **三级物候体系、拍摄机会指数与 10 维地理推荐 (`phenology-engine.js`, `photo-simulator.js`, `geo-intelligence.js`, `js/lazy/dest-compare.js`)**：
   - 物候模型明确区分 `Tier A / B / C` 并披露样本外验证结果（23 城温带樱花/红叶子集：樱花 MAE `2.89d`，秋叶 MAE `4.84d`），将**极光/空间天气**清晰独立于植被物候。
   - 摄影模拟新增 **8 大场景拍摄机会指数 (0–100)**，强制执行 **>14 天天气预报隔离规则**（绝不伪造远期预报），并增加日照金山主峰提前见光估算及 3D 取景器九宫格/倾角/光学裁切标示。
   - 新增 10 维地理向量对比与 2–4 城并排对比弹窗 (`DestCompare`)。
6. **遥感图层检查器、时光机分屏、四季画廊与私密个人档案 2.0**：
   - 图层弹窗新增源站/分辨率/图例/透明度控制；NASA GIBS 分屏混合对比；`/api/epic?date=YYYY-MM-DD` 历史实拍查询。
   - 修复 `rice terrace / wild duck` 误过滤同时保留美食菜品严格拦截；新增基于真实 EXIF 拍摄日期的四季度筛选（无日期不伪造季节）。
   - 个人档案默认**完全私密**，新增游记打卡、年度报告及默认剥离 EXIF GPS 坐标的 Canvas 图像上传。
7. **全球分享中心、8 格式开放导出、30 章三语手册与 PWA 离线包**：
   - 支持 JSON / CSV / ICS (RFC 5545) / GPX 1.1 / KML 2.2 / GeoJSON / Print PDF / PNG 导出 (`js/lazy/export-service.js`)。
   - 分享中心 (`js/lazy/share-center.js`) 覆盖 12 类内容与 6 种画幅比例，内置纯本地生成 `QRCodeService` SVG 与诚实平台分享策略。
   - 完整 built-in 30 章简体中文 / 繁体中文 / 英文《用户手册与帮助中心》（按 `?` 一键唤起）。

---

## 数据规模 (`audit-data.js` 实测)

- **大洲与极区**：6
- **国家与地区**：137
- **精选目的地**：722
- **摄影机位**：5,414（含 430 条外部参考链接）
- **数据完整性**：0 重复 ID，0 无效坐标，0 缺失月份/预算/气象字段

---

## 本地开发、构建与测试

```bash
cd globe-app
npm install
npm run audit      # 校验地理基线数据完整性 (data/audit-report.json)
npm run build      # 压缩打包 CSS/JS/722 SEO 静态页与品牌资产至 dist/
npm test           # 运行全量 66 项单元与集成测试
npm run test:e2e   # 运行 Playwright 无头浏览器 15 场景 / 8 视口回归校验
npm run dev        # 启动本地静态预览服务器
```

详细文档索引：
- [V5_IMPLEMENTATION_TRACKER.md](docs/V5_IMPLEMENTATION_TRACKER.md)
- [V5_ACCEPTANCE_REPORT.md](docs/V5_ACCEPTANCE_REPORT.md)
- [V5_SECURITY_REPORT.md](docs/V5_SECURITY_REPORT.md)
- [V5_PERFORMANCE_REPORT.md](docs/V5_PERFORMANCE_REPORT.md)
- [V5_DEPLOYMENT_GUIDE.md](docs/V5_DEPLOYMENT_GUIDE.md)
- [KNOWN_LIMITATIONS.md](docs/KNOWN_LIMITATIONS.md)
- [THIRD_PARTY_LICENSES.md](docs/THIRD_PARTY_LICENSES.md)
