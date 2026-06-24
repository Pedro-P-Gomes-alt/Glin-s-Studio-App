-- A simple scratch to-do list. Active tasks persist; completed tasks are
-- swept away when she leaves the tab or reopens the app (see src/pages/Todo.jsx).
CREATE TABLE IF NOT EXISTS todos (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    text       TEXT NOT NULL,
    done       INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
