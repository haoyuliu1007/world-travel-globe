# KAIROS. V5.0 — 安全设计审查与验证报告 (V5_SECURITY_REPORT)

## 一、身份认证与会话安全 (`worker/auth.js`, `migrations/0003_v5_accounts_collab.sql`)

| 安全域 | 实现策略 | 验证情况 |
|---|---|---|
| 密码散列 | Web Crypto `PBKDF2-SHA256`（`100,000` 次迭代——遵守 Cloudflare Workers 平台运行时上限）+ 每用户独立随机盐值 + 常量时间比对 | `v5-batch2-auth-security.test.js` 实测通过 |
| 会话令牌与 Cookie | 32 字节 CSPRNG 随机 Token 仅存储 SHA-256 摘要入 D1 `sessions` 表；下发 `HttpOnly; SameSite=Lax; Secure; Path=/` Cookie | 单元测试验证 Cookie 属性与注销吊销生效 |
| CSRF 与点击劫持防护 | 所有变更接口校对 `Origin` / `Referer`；认证与账号页面及接口强制响应 `Content-Security-Policy: frame-ancestors 'none'` 与 `X-Frame-Options: DENY` | `worker/index.js` + `auth.js` 已验证 |
| 暴力破解限流 | 基于请求 IP 对认证接口执行滑动计数速率保护 | 单元测试验证多次失败触发保护响应 |
| 用户数据隔离与删除权利 | 全量私有/协同 API 严格校验 `session.userId` 与行级归属；支持导出完整 JSON 及级联删除用户账号全部关联 D1 记录 | 多用户隔离与级联删除测试全通 |

## 二、多人协同与权限校验 (`worker/collab.js`, `js/services/crdt-merge.js`)

- **RBAC 权限隔离**：严格区分 `owner` / `editor` / `viewer`；非成员与 `viewer` 尝试修改行程/发布写入返回 `403 Forbidden` (`v5-batch4-collab-and-split.test.js` 通过)。
- **邀请链路安全**：协同邀请含明确过期时间戳 (`expiresAt`) 与房主实时撤销 (`revoked=1`)；已撤销或过期邀请立即失效。
- **CRDT 敏感字段清洗**：`sanitizeProfileForSync` 严禁将 `cloudSyncPassphrase`、`mapillaryToken`、`orsApiKey` 等本地凭证同步入云端档案。

## 三、前端、隐私及第三方交互安全

- **隐私默认策略**：个人档案默认私密 (`publicProfile: false`)；上传照片默认经浏览器 `<canvas>` 重绘，**彻底剥离原始图像中的敏感 EXIF GPS 坐标与相机序列号**。
- **防 XSS 与转义**：全站动态插值、CSV (RFC 4180)、ICS (RFC 5545)、GPX/KML XML 均通过专属转义函数 (`esc` / `escXml` / `csvCell` / `icsEscape`) 输出，无裸 HTML 注入。
- **Zero-Telemetry 与零秘密外泄**：GitHub Issue 反馈跳转严格只预填语言/视口/模块 slug，绝不读取或携带 Cookie、Token、行程或本地照片；本地生成的纯矢量 `QRCodeService` 不向任何第三方二维码服务器泄漏链接参数。
