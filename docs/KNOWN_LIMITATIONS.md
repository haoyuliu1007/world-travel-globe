# KAIROS. V5.1 — 已知局限性与科学边界声明 (KNOWN LIMITATIONS)

本着科学严谨与工程透明原则，KAIROS V5.1 如实声明以下技术边界与尚未具备真实数据源的限制：

1. **实时商业交通航班与票价缺失**：
   - 未接入付费 GDS（Amadeus/Sabre）或航司/铁路商业订票接口，**不生成任何虚构的航班号、高铁车次号、实时余票或动态票价**。A 层多式联运基于真实海陆连通拓扑、OurAirports 商用门户机场与南极探险邮轮规则校验可行性，大圆航线跨越国际日期变更线时严格按 ±180° 分段渲染。
2. **气象预报 14 天可靠物理上限**：
   - Open-Meteo 实时天气与云风参数仅在未来 **14 天内（实况精报 7–14 天）** 有效；超过 14 天的摄影模拟与机会指数会自动屏蔽实时气象加权 (`weatherIncluded: false`)，严格采用确定性天文星历（Astronomy Engine + SunCalc）与多年气候均值。
3. **三级物候校准覆盖边界 (`Tier A / B / C`)**：
   - `Tier C` 实证拟合与交叉验证目前覆盖 **23 座代表性温带赏樱与赏秋城市**（报告同时披露逐城均方基线 `baselineCityMeanMaeDays` 与留一城交叉验证 `leaveOneCityOutMaeDays` 误差，且明确区分“多年气候常态基线”与“逐年实时预报”）；其余目的地归入 `Tier B` 或 `Tier A` 经验参考模型，热带低海拔地区已自动屏蔽温带落叶/春花评分外推。
4. **3D 取景器与 DEM 遮挡精度**：
   - WebGL 垂直视场受限于 MapLibre GL `18°–65°`，长焦 (`>75mm`) 与超广角 (`14mm`) 采用数码裁切框近似；前端 360° 地形遮挡基于 ~30–76m 栅格 DEM，不包含前景建筑、树冠与实时大气弯折细节。
5. **协同通信与云存储能力边界**：
   - 默认后端通过 Cloudflare D1 REST + 浏览器 `BroadcastChannel` 实现多端协同收敛与版本恢复；在未部署高阶付费 **Cloudflare Durable Objects / WebSocket** 的情况下，不支持亚秒级实时光标广播。
   - 用户个人照片默认在本地浏览器经 Canvas 压缩剥离 EXIF GPS 并存 IndexedDB；跨设备照片实体云同步需管理员自行在 Wrangler 绑定可选 `PHOTOS_BUCKET` (R2)。
6. **社交分享与移动设备真机实测限制**：
   - 微信、朋友圈、QQ、小红书、抖音与 Instagram 无免审公开网页直接发帖接口，分享中心诚实采用「下载高清比例海报 + 一键复制文案 + 本地纯矢量二维码」方案。
   - iOS Safari PWA 安装需用户在 Safari 分享菜单手动选择「添加到主屏幕」。
   - 本次 E2E 自动化验证运行于本地无头 **Chrome (`playwright-core`)** 并以 8 组视口参数仿真手机与平板屏幕，**不可替代 iOS / Android 物理真机手势、高低温、真实运营商弱网及长期 GPU 内存压测**。
7. **邮件验证码与 Google OAuth 登录密钥**：
   - 后端 `worker/auth.js` 已完整实现邮箱验证与 Google OAuth 路由逻辑，但实际外发验证邮件与第三方登录需部署者自行在 Cloudflare Secrets 配置 `RESEND_API_KEY` 与 `GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET`（未配置时访客模式与可选本地/密码账号核心能力均可正常降级运作）。
