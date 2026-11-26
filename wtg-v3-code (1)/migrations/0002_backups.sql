-- World Travel Globe D1 migration 0002: previous-version backups for cloud sync.
-- On every successful PUT /api/profile the worker stores the replaced payload here
-- and keeps only the newest 3 per user, so an accidental overwrite can be rolled back
-- via GET /api/profile?backup=latest with the same X-Sync-Key.
CREATE TABLE IF NOT EXISTS profile_backups (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_key TEXT NOT NULL,
  payload_json TEXT NOT NULL,
  updated_at INTEGER NOT NULL,
  backed_up_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_backup_user ON profile_backups(user_key, backed_up_at DESC);
