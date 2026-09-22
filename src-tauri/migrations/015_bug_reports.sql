-- Bug / missing-feature reports Glin files from inside the app.
-- Rows are created locally first and pushed to the Apps Script endpoint; a row
-- with sent_at IS NULL is still queued (she was offline, or the send failed)
-- and is retried on the next launch. `uid` is the key the Sheet stores, and is
-- what the status sync matches on when pulling replies back.
CREATE TABLE IF NOT EXISTS bug_reports (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    uid           TEXT NOT NULL UNIQUE,
    kind          TEXT NOT NULL DEFAULT 'bug',      -- bug | feature | other
    title         TEXT NOT NULL,
    description   TEXT NOT NULL,
    app_version   TEXT,
    page          TEXT,
    created_at    TEXT NOT NULL DEFAULT (datetime('now')),
    sent_at       TEXT,
    send_error    TEXT,
    status        TEXT NOT NULL DEFAULT 'open',     -- open | in_progress | fixed | wont_fix
    reply         TEXT,
    fixed_version TEXT,
    status_seen   INTEGER NOT NULL DEFAULT 1
);

CREATE INDEX IF NOT EXISTS idx_bug_reports_unsent ON bug_reports (sent_at);

-- Screenshots, stored the same way as project images: resized on the client,
-- written to <AppData>/images, DB keeps the relative path only.
CREATE TABLE IF NOT EXISTS bug_report_images (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    report_id  INTEGER NOT NULL REFERENCES bug_reports(id) ON DELETE CASCADE,
    image_path TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_bug_report_images_report ON bug_report_images (report_id);
