-- World Travel Globe Cloudflare D1 Schema (Optional Cloud Sync)
CREATE TABLE IF NOT EXISTS user_profiles (
  user_key TEXT PRIMARY KEY,
  payload_json TEXT NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS photo_metadata (
  id TEXT PRIMARY KEY,
  user_key TEXT NOT NULL,
  dest_id TEXT,
  r2_key TEXT NOT NULL,
  caption TEXT,
  created_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_photo_user ON photo_metadata(user_key, dest_id);
