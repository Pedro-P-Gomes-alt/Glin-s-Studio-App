-- Rebuild projects table to make category_id nullable (needed for personal projects)
PRAGMA foreign_keys=OFF;

CREATE TABLE projects_new (
    id                  INTEGER PRIMARY KEY AUTOINCREMENT,
    client_id           INTEGER REFERENCES clients(id) ON DELETE SET NULL,
    category_id         INTEGER REFERENCES categories(id),
    title               TEXT NOT NULL,
    planned_start       TEXT,
    planned_end         TEXT,
    image_path          TEXT,
    material_cost_cents INTEGER NOT NULL DEFAULT 0,
    sale_price_cents    INTEGER,
    status_override     TEXT,
    created_at          TEXT NOT NULL DEFAULT (datetime('now')),
    shipped             INTEGER NOT NULL DEFAULT 0,
    delivered           INTEGER NOT NULL DEFAULT 0,
    shipped_at          TEXT,
    project_type        TEXT NOT NULL DEFAULT 'commission',
    personal_category   TEXT
);

INSERT INTO projects_new
    SELECT id, client_id, category_id, title, planned_start, planned_end,
           image_path, material_cost_cents, sale_price_cents, status_override,
           created_at, shipped, delivered, shipped_at,
           'commission', NULL
    FROM projects;

DROP TABLE projects;
ALTER TABLE projects_new RENAME TO projects;

PRAGMA foreign_keys=ON;

CREATE TABLE IF NOT EXISTS payments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  project_id INTEGER NOT NULL REFERENCES projects(id),
  amount_cents INTEGER NOT NULL,
  received_on TEXT NOT NULL,
  label TEXT NOT NULL DEFAULT 'payment',
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
