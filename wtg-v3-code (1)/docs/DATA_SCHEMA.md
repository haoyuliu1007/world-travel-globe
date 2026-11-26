# 数据结构与存储 Schema 说明

## 一、原始地理数据集（只读保留，未做任何破坏性覆盖）

- **位置**：`data/registry.js` + 55 个大洲/国家分片模块（构建为 `dist/data/atlas-index.min.js` 与 `dist/data/regions/r0..r41.{json,js}`）。
- **核心实体 (`Destination`)**：
  - `id`, `continent`, `country`, `region`, `province`, `name`, `shortName`, `priority`
  - `themeTags`: `['nature' | 'architecture']`
  - `weatherTags`: `['allWeather' | 'sunny' | 'rain' | 'snow' | 'special']`
  - `coords`: `[lng, lat]` (WGS-84), `zoom`, `elevation`, `suggestedDays`, `badges`, `heroSummary`
  - `spots[]` (共 5,414 个): `{ name, category, coords: [lng, lat], elevation, access, bestTime, scene, tips }`
  - `months[]` (12 个月): `{ m, score (1..5), temp, rain, highlight }`
  - `weather`: `{ sunny, rainy, snowy, special }`
  - `budget`: `{ luxury, comfort }`
  - `itinerary[]`: `[{ day, title, plan }]`

---

## 二、非破坏性审计清单 (`data/audit-report.json`)

由 `node scripts/audit-data.js` 生成，包含：
- `summary`: 模块数、大洲分布、国家数 (`137`)、城市数 (`722`)、机位数 (`5414`)、重复 ID 数 (`0`)、无效坐标数 (`0`)、>250 km 跨区机位数 (`243`) 等。
- `reviewQueue.distanceOutliers`: 列出距所属城市中心超过 250 km 的机位（含距离 km、父城市与机位坐标、核验提示），供人工审核而不修改源数据。

---

## 三、浏览器 IndexedDB Schema (`WorldTravelGlobeDB` · Dexie v1)

| 表名 | 主键与索引 | 用途与数据来源 |
|---|---|---|
| `apiCache` | `key, expiresAt, updatedAt` | 缓存 Wikimedia（7 天）、Open-Meteo 实况（30 分钟）、ERA5 历史（30 天）、OSRM 路线（7 天） |
| `wikidataCache` | `entityKey, qid, confidence, updatedAt` | Wikidata 核验结果、`coordDeltaKm` 与可信度 (`high`/`medium`/`review`/`empirical`) |
| `travelStatus` | `destId, status, updatedAt` | 私人旅行状态 (`visited`/`planned`/`wishlist`)、访问日期与笔记（自动迁移旧版 `wtg_favorites_v1`） |
| `customLists` | `id, updatedAt` | 自定义旅行收藏清单 |
| `userPhotos` | `id, destId, takenAt` | 个人上传摄影作品（1400px 压缩 JPEG DataURL + 320px 缩略图） |
| `expenses` | `id, tripId, destId, date, category` | 实际旅行消费台账 |
| `trips` | `id, updatedAt` | 智能行程规划器多日方案、站点坐标、路网缓存与预算条目 |
| `settings` | `key` | 追美权重预设、同步口令、可选本地 Token、迁移标记 |

---

## 四、Cloudflare D1 Schema (`migrations/0001_init.sql`)

- `user_profiles(user_key TEXT PRIMARY KEY, payload_json TEXT NOT NULL, updated_at INTEGER NOT NULL)`：以客户端对私人同步口令计算的 SHA-256 哈希为隔离键。
- `photo_metadata(id TEXT PRIMARY KEY, user_key TEXT NOT NULL, dest_id TEXT, r2_key TEXT NOT NULL, caption TEXT, created_at INTEGER NOT NULL)`：可选 R2 相册索引表。
