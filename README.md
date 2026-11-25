# 🌍 全球梦想旅游计划 · 3D 交互卫星地球仪

覆盖全球 **七大洲 · 137 国/地区 · 722 座目的地 · 5,414 个精准摄影机位** 的全端响应式 3D 卫星地球仪（支持 iOS / Android / 微信内置浏览器 / iPad / macOS / Windows）。

## 核心特性

- **7 大洲全覆盖**：亚洲、欧洲、大洋洲、北美洲、南美洲、非洲 / 南极全量上线（共 42 个主题地理分区）。
- **全气象与全季节指南**：支持追美月份筛选、自然奇观/城市建筑主题切换、晴/雨/雪/极限气象过滤及 12 个月实时打分日历。
- **双档人民币预算与动线**：提供顶奢/舒适深度两档透明账单、逐日落地行程以及 5,414 个具体经纬度机位与实景避坑攻略。
- **单链接直达分享**：通过 `?focus=<目的地ID>` 参数可直接飞往任意指定城市（界面右下「🔗 分享」一键复制）。

## 构建生产单包 (`dist/`)

零第三方依赖，仅需 Node.js（>= 18）：

```bash
node build-dist.js
```

构建产物将输出到 `dist/` 目录，并将 56 个数据模块合并压缩为单一 `dist/data/atlas-bundle.min.js`（gzip 后约 3.24 MB），同时自动生成 `.nojekyll` 与 `_headers` 缓存规则。

## 自动公网部署

- **Cloudflare Pages（推荐）**：连接本仓库，分支选 `main`，Build command 填 `node build-dist.js`，Build output directory 填 `dist`。
- **GitHub Pages**：在仓库 `Settings → Pages` 将 Source 设为 `GitHub Actions`，`.github/workflows/deploy-pages.yml` 会自动构建并发布。
