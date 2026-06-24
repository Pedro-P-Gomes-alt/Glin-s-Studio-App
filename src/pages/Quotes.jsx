import { useState, useEffect } from "react";
import { query, execute } from "../db";

const APPS_SCRIPT_TEMPLATE = `// 1. Open the Google Sheet linked to your form
// 2. Click Extensions > Apps Script
// 3. Paste this code, set your token, save, then Deploy > New deployment
//    (Execute as: Me, Who has access: Anyone)
// 4. Copy the Web App URL into Settings > Quotes

const SECRET_TOKEN = 'CHANGE_THIS_TO_SOMETHING_SECRET';

function doGet(e) {
  if (!e || !e.parameter || e.parameter.token !== SECRET_TOKEN) {
    return ContentService
      .createTextOutput(JSON.stringify({ error: 'Unauthorized' }))
      .setMimeType(ContentService.MimeType.JSON);
  }
  try {
    const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheets()[0];
    const data  = sheet.getDataRange().getValues();
    if (data.length < 2) {
      return ContentService.createTextOutput(JSON.stringify({ rows: [] }))
        .setMimeType(ContentService.MimeType.JSON);
    }
    const headers = data[0].map(String);
    const rows = data.slice(1).map((row, i) => {
      const obj = { _row: i + 2 };
      headers.forEach((h, j) => {
        const v = row[j];
        obj[h] = v instanceof Date ? v.toISOString() : v;
      });
      return obj;
    });
    return ContentService.createTextOutput(JSON.stringify({ rows }))
      .setMimeType(ContentService.MimeType.JSON);
  } catch (err) {
    return ContentService
      .createTextOutput(JSON.stringify({ error: err.toString() }))
      .setMimeType(ContentService.MimeType.JSON);
  }
}`;

const STATUS_META = {
  pending:   { label: "Pending",   cls: "quote-status--pending" },
  reviewing: { label: "Reviewing", cls: "quote-status--reviewing" },
  accepted:  { label: "Accepted",  cls: "quote-status--accepted" },
  rejected:  { label: "Rejected",  cls: "quote-status--rejected" },
};

function fmtDate(iso) {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleDateString("en-GB", {
      day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit",
    });
  } catch { return iso; }
}

// ── Quote detail panel ─────────────────────────────────────────────────
function QuotePanel({ quote, onClose, onUpdate }) {
  const [status, setStatus] = useState(quote.status);
  const [notes, setNotes]   = useState(quote.notes ?? "");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    // Auto-mark as seen
    if (!quote.seen) {
      execute(`UPDATE quotes SET seen = 1 WHERE id = ?`, [quote.id]).then(onUpdate);
    }
  }, [quote.id]);

  async function handleSave() {
    setSaving(true);
    try {
      await execute(
        `UPDATE quotes SET status = ?, notes = ? WHERE id = ?`,
        [status, notes.trim() || null, quote.id]
      );
      onUpdate();
    } finally {
      setSaving(false);
    }
  }

  let data = {};
  try { data = JSON.parse(quote.data); } catch {}

  // Remove internal _row key for display
  const fields = Object.entries(data).filter(([k]) => k !== "_row");

  return (
    <div className="overlay" onClick={onClose}>
      <div className="panel" onClick={e => e.stopPropagation()}>
        <div className="panel-header">
          <div>
            <h2>Quote Request</h2>
            <p className="panel-subtitle">{fmtDate(quote.submitted_at)}</p>
          </div>
          <button className="btn-icon" onClick={onClose}>✕</button>
        </div>

        <div className="quote-detail-body">
          {/* Form fields */}
          <div className="quote-fields">
            {fields.map(([key, val]) => (
              <div key={key} className="quote-field-row">
                <span className="quote-field-key">{key}</span>
                <span className="quote-field-val">{String(val) || "—"}</span>
              </div>
            ))}
          </div>

          {/* Status */}
          <div className="field" style={{ marginTop: 20 }}>
            <label>Status</label>
            <select
              value={status}
              onChange={e => setStatus(e.target.value)}
              style={{ maxWidth: 200 }}
            >
              {Object.entries(STATUS_META).map(([k, v]) => (
                <option key={k} value={k}>{v.label}</option>
              ))}
            </select>
          </div>

          {/* Notes */}
          <div className="field">
            <label>Your notes</label>
            <textarea
              value={notes}
              onChange={e => setNotes(e.target.value)}
              placeholder="Budget discussion, reference links, timeline notes…"
              rows={4}
              style={{ resize: "vertical", fontFamily: "inherit", fontSize: "0.9rem", padding: "9px 11px", border: "1px solid var(--border)", borderRadius: "7px", outline: "none", width: "100%" }}
            />
          </div>

          <div className="form-actions" style={{ marginTop: 8 }}>
            <button className="btn-primary" onClick={handleSave} disabled={saving}>
              {saving ? "Saving…" : "Save"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Setup card ─────────────────────────────────────────────────────────
function SetupCard() {
  const [copied, setCopied] = useState(false);

  function copyScript() {
    navigator.clipboard.writeText(APPS_SCRIPT_TEMPLATE).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }

  return (
    <div className="quote-setup-card">
      <h3 className="quote-setup-title">Set up the Google Sheets connection</h3>
      <ol className="quote-setup-steps">
        <li>Open the <strong>Google Sheet</strong> linked to your commission form.</li>
        <li>Click <strong>Extensions &rarr; Apps Script</strong>.</li>
        <li>Paste the script below, change <code>CHANGE_THIS_TO_SOMETHING_SECRET</code> to any passphrase, then save.</li>
        <li>Click <strong>Deploy &rarr; New deployment</strong> — choose <em>Web App</em>, set <em>Execute as: Me</em> and <em>Access: Anyone</em>. Copy the URL.</li>
        <li>Open <strong>Settings</strong> (bottom of the sidebar) and paste the URL and your passphrase into the <em>Quotes</em> section.</li>
      </ol>
      <div className="quote-script-header">
        <span className="quote-script-label">Apps Script</span>
        <button className="btn-ghost sm" onClick={copyScript}>
          {copied ? "Copied!" : "Copy script"}
        </button>
      </div>
      <pre className="quote-script-pre">{APPS_SCRIPT_TEMPLATE}</pre>
    </div>
  );
}

// ── Main page ──────────────────────────────────────────────────────────
export default function Quotes({ onUnseenChange, config, onRefresh }) {
  const [quotes, setQuotes]       = useState([]);
  const [selected, setSelected]   = useState(null);
  const [lastRefresh, setLastRefresh] = useState(null);
  const [refreshing, setRefreshing]   = useState(false);
  const [error, setError]         = useState(null);

  const isConfigured = !!(config?.scriptUrl && config?.token);

  useEffect(() => { loadLocal(); }, []);

  async function loadLocal() {
    const rows = await query(
      `SELECT * FROM quotes ORDER BY submitted_at DESC, created_at DESC`
    );
    setQuotes(rows);
    const unseen = rows.filter(r => !r.seen).length;
    onUnseenChange?.(unseen);
  }

  async function handleRefresh() {
    if (!isConfigured || refreshing) return;
    setRefreshing(true);
    setError(null);
    try {
      await onRefresh?.();
      await loadLocal();
      setLastRefresh(new Date());
    } catch (e) {
      setError("Could not reach the Apps Script endpoint. Check the URL and token in Settings.");
    } finally {
      setRefreshing(false);
    }
  }

  async function handlePanelUpdate() {
    await loadLocal();
    // Refresh selected
    if (selected) {
      const rows = await query(`SELECT * FROM quotes WHERE id = ?`, [selected.id]);
      if (rows[0]) setSelected(rows[0]);
    }
  }

  return (
    <div className="page">
      <div className="page-header">
        <h1>Quotes</h1>
        {isConfigured && (
          <div className="header-actions">
            {lastRefresh && (
              <span className="page-hint">
                Last refreshed {lastRefresh.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })}
              </span>
            )}
            <button className="btn-ghost" onClick={handleRefresh} disabled={refreshing}>
              {refreshing ? "Refreshing…" : "Refresh"}
            </button>
          </div>
        )}
      </div>

      {error && <div className="quote-error">{error}</div>}

      {!isConfigured && <SetupCard />}

      {isConfigured && quotes.length === 0 && (
        <p className="empty-state">No quote requests yet. They will appear here when your form is filled.</p>
      )}

      {quotes.length > 0 && (
        <div className="quote-list">
          {quotes.map(q => {
            let data = {};
            try { data = JSON.parse(q.data); } catch {}
            const emailKey = Object.keys(data).find(k => /e-?mail/i.test(k));
            const name = (emailKey && data[emailKey])
              || data["Name"] || data["name"] || data["Full name"] || data["Your name"]
              || "Anonymous";
            const sm = STATUS_META[q.status] ?? STATUS_META.pending;
            return (
              <div
                key={q.id}
                className={`quote-card${!q.seen ? " unseen" : ""}${selected?.id === q.id ? " selected" : ""}`}
                onClick={() => setSelected(q)}
              >
                {!q.seen && <span className="quote-unseen-dot" />}
                <div className="quote-card-main">
                  <span className="quote-card-name">{name}</span>
                  <span className={`quote-status-badge ${sm.cls}`}>{sm.label}</span>
                </div>
                <div className="quote-card-meta">
                  <span>{fmtDate(q.submitted_at)}</span>
                  {q.notes && <span className="quote-card-has-notes">has notes</span>}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {selected && (
        <QuotePanel
          quote={selected}
          onClose={() => setSelected(null)}
          onUpdate={handlePanelUpdate}
        />
      )}
    </div>
  );
}
