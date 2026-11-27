# KAIROS. V5.0 — 部署与运维手动步骤指南 (V5_DEPLOYMENT_GUIDE)

> ⚠️ **安全操作原则**：所有本地校验均已完成于分支 `v5-dev`。遵照项目约束，**未经明确指令绝不擅自向 GitHub 推送或执行生产 `wrangler deploy`**。确认发布前请按以下 checklist 操作。

## 一、部署前自动化核验 Checklist

```bash
cd globe-app
npm run audit      # 校验 722 城 / 5414 机位完整零异常
npm run build      # 生成 dist/ (2,382 文件，含 722 SEO + OG PNG)
npm test           # 应全部通过 66 / 66 单元及集成测试
npm run test:e2e   # 应通过 15 / 15 场景与 8 视口检查
```

## 二、Cloudflare D1 数据库 V5 增量迁移（首次上线必做）

V5 在完全保留历史表 (`user_profiles`, `photo_metadata`, `profile_backups`) 的前提下新增 14 张认证与协同表，执行前请务必先检查 Wrangler 当前绑定数据库名称 (`world-travel-globe-db`)：

```bash
cd globe-app
# 1. 本地预演迁移验证
npx wrangler d1 migrations apply world-travel-globe-db --local

# 2. 生产库正式迁移（仅在确认发布时执行）
npx wrangler d1 migrations apply world-travel-globe-db --remote
```

## 三、可选密钥与对象存储配置（未配置时自动以访客/本地模式降级）

| 变量 / Binding | 用途 | 未配置时降级行为 | 配置命令 |
|---|---|---|---|
| `GOOGLE_CLIENT_ID` & `GOOGLE_CLIENT_SECRET` | Google OAuth 2.0 第三方登录 | 登录框自动隐藏或标示 Google 登录未启用，支持邮箱密码与访客 | `npx wrangler secret put GOOGLE_CLIENT_ID` |
| `RESEND_API_KEY` | 注册邮箱验证码与找回密码外发邮件 | 不发外网验证邮件，接口诚实提示配置状态 | `npx wrangler secret put RESEND_API_KEY` |
| `PHOTOS_BUCKET` (R2 Bucket Binding) | 多设备同步高清个人档案照 Blob | 个人照片继续完整留存本地 IndexedDB，并可导出 JSON | 在 `wrangler.jsonc` 启用 `r2_buckets` |

## 四、生产发布命令（需用户确认后运行）

1. **发布 Cloudflare Workers + 静态资产**：
   ```bash
   cd globe-app
   npm run build && npx wrangler deploy
   ```
2. **合并与推送至 GitHub / GitHub Pages 镜像**：
   ```bash
   git checkout main
   git merge --no-ff v5-dev
   git push origin main --tags
   ```
3. **部署后冒烟验证**：
   - 访问 `https://world-travel-globe.globe-app.workers.dev/api/health` 确认 `"d1": true` 与 V5 `/api/fx`、`/api/epic?date=` 正常响应。
   - 检查移动端（物理真机 iOS Safari / Android Chrome）首次载入、账号登录弹窗、8 格式导出弹窗与 3D 取景器手势流畅度。
