# 🌍 World Travel Globe · 全球旅行地理图鉴与探索平台 (v3.0)

覆盖全球 **七大洲 · 137 个国家/地区 · 722 座精选目的地 · 5,414 个精细摄影机位** 的一体化 3D 交互卫星地球仪平台，融合真实实景画廊、Wikidata 地理核验、Open-Meteo 全球气象、SunCalc 专业摄影光影模拟、NASA GIBS 地球时光机、真实路网智能行程规划与本地优先私人旅行档案。

## 核心功能矩阵

### P0 · 真实地理、动态气象、摄影模拟与追美指数
- **真实实景影像与 Wikidata 核验**：按需检索 Wikimedia Commons 地标影像（含全屏灯箱、作者与 CC 协议标注）；交叉比对 Wikidata（QID、官方海拔、建筑师、遗产属性、坐标偏差），生成非破坏性审核清单而不覆盖原始数据。
- **全球动态气象系统**：接入 Open-Meteo 实时天气、7 日预报与 5 年 ERA5 历史月度气候统计，懒加载 Apache ECharts 渲染温湿降水与晴/雨/雪概率图表；支持 RainViewer 全球实时雷达与红外云图叠加。
- **专业摄影机位模拟器**：基于 SunCalc 计算任意日期与时刻的日出日落、黄金时刻、蓝调时刻、太阳方位/高度角轨迹及月相月出月落；支持机位拍摄朝向顺/侧/逆光分析及 3D 地球仪实时太阳射线与相机视角扇形联动。
- **全球追美指数引擎**：7 维可调权重评分模型（气温舒适度、降水适配、晴天概率、黄金光影时长、季节峰度、物候积雪、可选错峰成本估算），支持 722 城排行榜并明确标注实测、天文与经验数据来源。

### P1 · 沉浸式街景、地球时光机与智能行程规划
- **沉浸式街景**：支持 Mapillary 街景与 360° 全景联动（需配置免费 Token）；未配置或无覆盖时自动无缝降级为 Wikimedia 实景照片与 Mapillary/KartaView/Google Street View 坐标直达。
- **地球时光机**：接入 NASA EOSDIS GIBS 公开 WMTS 遥感图层（VIIRS 真彩、MODIS 历史真彩、NDSI 积雪、NDVI 植被绿度、云顶温度），支持日期时间轴、双日期对比滑块、透明度调节与昼夜晨昏线。
- **智能旅行规划系统**：支持输入出发地、目的地、天数、预算、月份与交通方式（自驾/步行/骑行）自动生成逐日行程，支持拖拽与触控重排、OSRM/OpenRouteService 真实路网距离计算（跨海不伪造陆路）、账单编辑与 ECharts 饼图、JSON/CSV/PDF 导出及 `?trip=` 链接分享恢复。

### P2 · 私人旅行档案与高级地球仪体验
- **私人旅行档案（本地优先 · 无需登录）**：基于 Dexie.js (IndexedDB) 持久化保存已去过/计划中/想去状态、自定义清单、压缩个人摄影作品库、实际消费记录、全球探索完成度、年度足迹图表、`?footprint=` 足迹地图分享与全量 JSON 导入/导出/清空；可选连接 Cloudflare D1/R2 实现口令隔离云同步。
- **高性能地球仪交互**：Web Worker + Fuse.js 中英文容错模糊搜索、Supercluster 低缩放空间聚合、全屏探索模式 (`F`)、性能自动分级与系统诊断/数据审计弹窗、PWA (`manifest.webmanifest` + `sw.js`) 离线外壳。

---

## 宇宙开场

桌面首次访问首页时播放 24 秒静音开场。按 Esc 或点击跳过可以直接操作地图，在外观菜单可重播。带参数的分享链接、重复访问及减少动态效果模式直接打开产品。影片和播放器位于 `assets/cosmic-intro/`。更换影片时同步替换 WebM 和 MP4，并核对播放器的交接时刻和 MapLibre 初始机位。影像归属见 [片源说明](assets/cosmic-intro/credits.html)。

## 本地开发、审计、测试与构建

无需复杂安装，核心构建与测试仅依赖 Node.js (>= 18)：

```bash
# 1. 非破坏性数据质量审计（输出 data/audit-report.json）
npm run audit
# 或: node scripts/audit-data.js

# 2. 构建生产静态产物到 dist/（42 个地区懒加载分片 + 轻量索引 + 全部运行模块）
npm run build
# 或: node build-dist.js

# 3. 运行自动化测试套件 (node:test)
npm test
# 或: node --test tests/*.test.js

# 4. 本地预览 dist/ (http://127.0.0.1:4173/)
npm run dev
# 或: node scripts/dev-server.js
```

---

## 双平台部署架构

| 部署环境 | 构建方式 | 静态资源 | 扩展能力 |
|---|---|---|---|
| **GitHub Pages** | `.github/workflows/deploy-pages.yml` 自动运行 `node build-dist.js` | `dist/` 全量静态托管 | 自动降级为浏览器直连公开 CORS API + IndexedDB 本地档案 |
| **Cloudflare Workers** | `wrangler.jsonc` (`main: worker/index.js`, `assets.directory: ./dist`) | `./dist` 静态资源 + 边缘缓存 | 启用 `/api/*` 代理与限流；绑定 D1/R2 及环境变量后启用云同步、相册与服务端密钥管理 |

详细配置步骤见 [API 与部署指南](docs/API_AND_DEPLOY.md)、[数据结构说明](docs/DATA_SCHEMA.md)、[更新日志](docs/CHANGELOG.md) 与 [第三方许可声明](docs/THIRD_PARTY_LICENSES.md)。
