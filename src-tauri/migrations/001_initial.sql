PRAGMA journal_mode=WAL;
PRAGMA foreign_keys=ON;

CREATE TABLE IF NOT EXISTS categories (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    category    TEXT NOT NULL CHECK (category IN ('cosplay', 'sports')),
    subtype     TEXT NOT NULL,
    UNIQUE (category, subtype)
);

CREATE TABLE IF NOT EXISTS clients (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    name            TEXT NOT NULL,
    contact_handle  TEXT,
    notes           TEXT,
    first_seen_date TEXT NOT NULL DEFAULT (date('now'))
);

CREATE TABLE IF NOT EXISTS projects (
    id                  INTEGER PRIMARY KEY AUTOINCREMENT,
    client_id           INTEGER REFERENCES clients(id) ON DELETE SET NULL,
    category_id         INTEGER NOT NULL REFERENCES categories(id),
    title               TEXT NOT NULL,
    planned_start       TEXT,
    planned_end         TEXT,
    image_path          TEXT,
    material_cost_cents INTEGER NOT NULL DEFAULT 0,
    sale_price_cents    INTEGER,
    status_override     TEXT CHECK (status_override IN ('todo', 'doing', 'done', NULL)),
    created_at          TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS time_logs (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    date        TEXT NOT NULL,
    hours       REAL NOT NULL CHECK (hours > 0),
    description TEXT,
    project_id  INTEGER REFERENCES projects(id) ON DELETE SET NULL,
    created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS events (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    title       TEXT NOT NULL,
    event_type  TEXT NOT NULL CHECK (event_type IN ('vacation', 'contest', 'convention', 'other')),
    start_date  TEXT NOT NULL,
    end_date    TEXT NOT NULL,
    image_path  TEXT,
    notes       TEXT
);

-- Seed default categories
INSERT OR IGNORE INTO categories (category, subtype) VALUES
    ('cosplay', 'dress'),
    ('cosplay', 'prop'),
    ('cosplay', 'wig'),
    ('cosplay', 'full costume'),
    ('sports',  'roller-skating dress');
