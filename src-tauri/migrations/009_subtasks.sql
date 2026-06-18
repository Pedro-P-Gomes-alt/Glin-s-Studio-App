CREATE TABLE IF NOT EXISTS subtasks (
    id                  INTEGER PRIMARY KEY AUTOINCREMENT,
    project_id          INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    title               TEXT NOT NULL,
    done                INTEGER NOT NULL DEFAULT 0,
    material_cost_cents INTEGER NOT NULL DEFAULT 0,
    sort_order          INTEGER NOT NULL DEFAULT 0,
    created_at          TEXT NOT NULL DEFAULT (datetime('now'))
);

ALTER TABLE time_logs ADD COLUMN subtask_id INTEGER REFERENCES subtasks(id) ON DELETE SET NULL;
