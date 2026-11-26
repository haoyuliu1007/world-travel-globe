# 第三方服务配置与验收报告（v3，进行中）

> 状态说明：本文档记录截至 2026-11-26 的实测结果。未完成项明确标注「未完成」，不以计划代替结果。

## 1. 已成功配置 / 已验证的服务

| 服务 | 状态 | 实测证据 |
|---|---|---|
| Wikimedia Commons | ✅ 真实可用 | 直连 geosearch 返回真实图片条目（200）；Worker `/api/commons` 代理 200 |
| Wikidata | ✅ 真实可用 | wbsearchentities 返回 Forbidden City = Q80290（200） |
| RainViewer | ✅ 真实可用 | public weather-maps.json 200，含雷达时间轴 |
| NASA GIBS | ✅ 真实可用 | MODIS Terra 真彩瓦片 200 返回 JPEG |
| OSRM 驾车 | ✅ 真实可用 | 武汉两点 route 返回 Ok，21.09 km |
| SunCalc | ✅ 本地可用 | vendor 库加载正常，自动化测试覆盖日出/黄金时刻计算 |
| Open-Meteo | ⚠️ 分环境 | 经 Worker `/api/weather` 代理 200 返回真实数据；审计机共享出口 IP 直连时触发其每日限额 429（该 IP 的限额，非站点故障） |
| Worker 基础端点 | ✅ | 生产 `/api/health` 200；本地新代码 10 项自动化测试全过 |

## 2. 本轮代码修复（分支 feat/third-party-services-v3，本地已提交，未推送/未部署）

1. Mapillary 街景：Worker `/api/streetview` 现在随数据下发**公开 Client Token**（`MAPILLARY_CLIENT_TOKEN`，兼容旧名 `MAPILLARY_TOKEN`），前端 MapillaryJS 360° Viewer 才能真正初始化（旧代码只返回图片，Viewer 必然起不来）；新增 bbox 合法性校验与上游错误处理（502 而非假成功）。本地模拟实测：200 + clientToken 正确下发、非法 bbox 返回 400。
2. 路线真实性：`router.project-osrm.org` 只托管驾车模型，旧代码把 walking/cycling 发到其 foot/bike 路径、会静默返回驾车路线（实测步行与驾车同为 21.09 km）。已改为步行/骑行走 FOSSGIS `routing.openstreetmap.de` 的 routed-foot/routed-bike；本地实测同一对坐标步行 1.56 km/21 min ≠ 驾车 1.46 km/6 min，结果真实区分。Worker 全局异常兜底，杜绝未捕获异常返回 Cloudflare 1101。
3. D1 同步：新增乐观并发冲突检测（`X-Base-Updated-At`，冲突返回 409、拒绝静默覆盖，前端提示先拉取合并）；覆盖前旧版本写入 `profile_backups`（migration 0002，每用户保留 3 份，`GET /api/profile?backup=latest` 取回）；新增 5 MB 上限与 JSON 合法性校验。用内存版 D1 替身实测：PUT/GET/409/备份取回（取回的确实是上一版本）/400/401 全部符合预期。
4. 健康检查：`pois` 改为真实反映 Overpass 免 key 降级可用，另加 `poisEnhanced` 表示 OpenTripMap key 是否配置。

## 3. 生产现状（2026-11-26 审计，Cloudflare 后台实测）

- 账号 Free 套餐；Worker `world-travel-globe` 为 2026-11-25 22:30 UTC 的 Wrangler 手动部署（5cc82deb），**无任何绑定、无变量/密钥**；D1 数据库 0 个。
- 生产 `/api/health`：streetview=false、d1=false、r2=false（R2 按要求保持不开通）。
- 生产 `/api/route`（旧部署）多次返回 Cloudflare 1101，与仓库代码本地表现不一致，指向线上部署版本落后；需以新代码重新 `wrangler deploy` 后复测。
- 部署方式注意：本项目 Cloudflare 侧为 Wrangler 手动部署，推 GitHub 只更新 GitHub Pages。

## 4. 尚需人工操作的事项（集中清单）

1. **Cloudflare 建库**：控制台自动化在用户 Chrome 扩展环境中无法填写 D1 创建表单（元素引用反复过期，已实测失败并停止）。两条路任选：(A) 用户在已打开的创建页手填 `world-travel-globe-db` 点 Create；(B) 用户在 Muse 云浏览器登录一次 Cloudflare，后续建库/建表/绑定由自动化完成（窗口已备好，停在登录页）。
2. **Mapillary 注册**：开发者后台为登录墙，注册仅 Email+Username+Password（无社交登录）。需用户注册账号（或指定注册邮箱/用户名并接管注册窗口），之后建应用、拿 Client Token、写入 Worker 变量由自动化完成。官方公开页未声明是否免费/需绑卡，进后台后确认，未确认前不承诺。
3. **GitHub 推送/部署授权**：本机 `gh` 未登录；分支推送与合并、以及在用户电脑上执行 `wrangler deploy`（线上为手动部署）需用户在其电脑完成登录/执行，或提供相应授权通道。

## 5. 免费额度与使用情况

| 服务 | 免费额度（官方） | 当前使用 |
|---|---|---|
| Cloudflare Workers | Free：100,000 请求/天 | 远低于限额；Worker 内另有 90 次/分钟/IP 限流 |
| Cloudflare D1 | Free：5 GB 存储、500 万行读/天、10 万行写/天、最多 10 个库 | 尚未建库（0/10） |
| Mapillary | Search 10,000 次/分钟/app；Entity 60,000 次/分钟/app；瓦片 50,000 次/天 | 未配置 token，使用量 0 |
| Open-Meteo | 非商业免费，官方按 IP 每日限额 | 经 Worker 缓存（30 分钟）降低调用 |
| OSRM / FOSSGIS | 公共演示服务，无 key；须遵守其可接受使用政策、不可高频批量 | 前端 7 天缓存 |
| R2 | **未开通**（避免绑卡与超额风险），本地 IndexedDB 照片存储与适配层保留 | 0 |

## 6. 潜在扣费与安全风险

- 扣费：全程不绑卡、不升级；唯一风险点是未来误开 R2 或 Workers Paid — 本轮未开通任何付费资源，D1/Workers 均在 Free 限额内运行，超限在 Free 套餐下表现为限流/报错而非自动扣费（无付款方式）。
- 安全：Mapillary Client Token 为公开令牌（前端 Viewer 必需），私密凭据不下发、不入库；同步口令仅以 SHA-256 派生键访问服务端，口令本身不上传明文；Worker 密钥只存 Cloudflare 变量/密钥，不进仓库。
- 已知限制：OSRM 公共服务无 SLA；Open-Meteo 按 IP 限额，共享出口环境可能 429，前端已有缓存与重试。

## 7. GitHub 提交记录（本地分支，待推送）

- 75ce30c fix(services): Mapillary client-token passthrough, profile-correct OSRM routing, D1 sync conflict+backup
- daf612b fix(worker): make profile backup endpoint reachable
- 1565da6 docs: document Mapillary public client token, D1 sync conflict/backup semantics, FOSSGIS routing, wrangler deploy note
- （本文档提交见分支最新记录）

## 8. 最新部署地址（未变更）

- Cloudflare：https://world-travel-globe.globe-app.workers.dev/
- GitHub Pages：https://haoyuliu1007.github.io/world-travel-globe/
