CREATE TABLE IF NOT EXISTS quotes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  source_id TEXT UNIQUE NOT NULL,
  submitted_at TEXT,
  data TEXT NOT NULL,
  seen INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK(status IN ('pending','reviewing','accepted','rejected')),
  notes TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
