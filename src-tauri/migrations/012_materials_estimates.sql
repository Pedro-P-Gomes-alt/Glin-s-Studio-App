-- Materials become line items (like payments): added over time with a
-- description, an amount and a date. Shared by commissions and personal
-- projects. The old single material_cost_cents fields (on projects and
-- subtasks) are left in place but are no longer read by the app.

CREATE TABLE IF NOT EXISTS materials (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    project_id   INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    description  TEXT NOT NULL,
    amount_cents INTEGER NOT NULL DEFAULT 0,
    bought_on    TEXT NOT NULL DEFAULT (date('now')),
    created_at   TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Estimated effort (hours) for a commission. Drives the suggested-price
-- readout and the estimate-accuracy dashboard.
ALTER TABLE projects ADD COLUMN estimated_hours REAL;

-- Migrate the existing project-level material cost into a single line item.
INSERT INTO materials (project_id, description, amount_cents, bought_on)
SELECT id, 'Material cost', material_cost_cents, COALESCE(date(created_at), date('now'))
FROM projects
WHERE material_cost_cents > 0;

-- Migrate existing per-subtask material costs into line items, keeping the
-- subtask title as the description.
INSERT INTO materials (project_id, description, amount_cents, bought_on)
SELECT project_id, title, material_cost_cents, COALESCE(date(created_at), date('now'))
FROM subtasks
WHERE material_cost_cents > 0;
