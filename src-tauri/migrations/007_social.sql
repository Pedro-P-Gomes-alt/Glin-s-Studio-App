CREATE TABLE IF NOT EXISTS social_snapshots (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  platform    TEXT NOT NULL,
  metric      TEXT NOT NULL,
  value       INTEGER NOT NULL,
  recorded_on TEXT NOT NULL DEFAULT (date('now')),
  created_at  TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(platform, metric, recorded_on)
);

CREATE TABLE IF NOT EXISTS yt_videos (
  video_id      TEXT PRIMARY KEY,
  title         TEXT NOT NULL,
  published_at  TEXT NOT NULL,
  thumbnail_url TEXT,
  view_count    INTEGER NOT NULL DEFAULT 0,
  like_count    INTEGER NOT NULL DEFAULT 0,
  comment_count INTEGER NOT NULL DEFAULT 0,
  updated_at    TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS ig_media (
  media_id       TEXT PRIMARY KEY,
  media_type     TEXT,
  caption        TEXT,
  timestamp      TEXT,
  like_count     INTEGER DEFAULT 0,
  comments_count INTEGER DEFAULT 0,
  updated_at     TEXT NOT NULL DEFAULT (datetime('now'))
);
