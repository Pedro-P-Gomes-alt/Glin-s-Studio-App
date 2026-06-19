import { useState, useEffect } from "react";
import { query, execute } from "../db";
import { formatEuro } from "../utils/money";

function statusLabel(p) {
  if (p.delivered) return { text: "Delivered", cls: "status-delivered" };
  if (p.shipped)   return { text: "Shipped",   cls: "status-shipped" };
  return { text: "Active", cls: "status-active" };
}

// ── Client detail panel ────────────────────────────────────────────────
function ClientPanel({ client, onClose, onUpdate }) {
  const [commissions, setCommissions] = useState([]);
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState({
    name:           client.name ?? "",
    pronouns:       client.pronouns ?? "",
    contact_handle: client.contact_handle ?? "",
    notes:          client.notes ?? "",
  });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setForm({
      name:           client.name ?? "",
      pronouns:       client.pronouns ?? "",
      contact_handle: client.contact_handle ?? "",
      notes:          client.notes ?? "",
    });
    setEditing(false);
    loadCommissions();
  }, [client.id]);

  async function loadCommissions() {
    const rows = await query(
      `SELECT p.id, p.title, p.sale_price_cents,
              COALESCE((SELECT SUM(amount_cents) FROM materials WHERE project_id = p.id), 0) AS material_cost_cents,
              p.planned_start, p.planned_end, p.shipped, p.delivered,
              cat.category, cat.subtype
       FROM projects p
       LEFT JOIN categories cat ON p.category_id = cat.id
       WHERE p.client_id = ?
       ORDER BY p.created_at DESC`,
      [client.id]
    );
    setCommissions(rows);
  }

  function set(k) { return e => setForm(f => ({ ...f, [k]: e.target.value })); }

  async function handleSave() {
    setSaving(true);
    try {
      await execute(
        `UPDATE clients SET name = ?, pronouns = ?, contact_handle = ?, notes = ? WHERE id = ?`,
        [
          form.name.trim(),
          form.pronouns.trim() || null,
          form.contact_handle.trim() || null,
          form.notes.trim() || null,
          client.id,
        ]
      );
      setEditing(false);
      onUpdate();
    } finally {
      setSaving(false);
    }
  }

  const totalShipped = commissions
    .filter(c => c.shipped)
    .reduce((s, c) => s + (c.sale_price_cents ?? 0), 0);

  return (
    <div className="overlay" onClick={onClose}>
      <div className="panel" onClick={e => e.stopPropagation()}>
        <div className="panel-header">
          <div>
            <h2>{client.name}</h2>
            {client.pronouns && !editing && (
              <p className="panel-subtitle">{client.pronouns}</p>
            )}
          </div>
          <div className="panel-header-actions">
            {editing ? (
              <>
                <button className="btn-ghost sm" onClick={() => setEditing(false)}>Cancel</button>
                <button className="btn-primary" onClick={handleSave} disabled={saving}>
                  {saving ? "Saving…" : "Save"}
                </button>
              </>
            ) : (
              <button className="btn-ghost sm" onClick={() => setEditing(true)}>Edit</button>
            )}
            <button className="btn-icon" onClick={onClose}>✕</button>
          </div>
        </div>

        {editing ? (
          <div className="sale-form">
            <div className="field">
              <label>Name *</label>
              <input value={form.name} onChange={set("name")} required />
            </div>
            <div className="field">
              <label>Pronouns</label>
              <input value={form.pronouns} onChange={set("pronouns")} placeholder="e.g. she/her" />
            </div>
            <div className="field">
              <label>Contact / handle</label>
              <input value={form.contact_handle} onChange={set("contact_handle")} placeholder="e.g. @username on Instagram" />
            </div>
            <div className="field">
              <label>Notes</label>
              <textarea
                value={form.notes}
                onChange={set("notes")}
                placeholder="Any notes about this client…"
                rows={4}
                style={{ resize: "vertical", fontFamily: "inherit", fontSize: "0.9rem", padding: "9px 11px", border: "1px solid var(--border)", borderRadius: "7px", outline: "none", width: "100%" }}
              />
            </div>
          </div>
        ) : (
          <div className="client-detail-body">
            <div className="client-info-grid">
              {client.contact_handle && (
                <div className="client-info-row">
                  <span className="client-info-label">Contact</span>
                  <span className="client-info-val">{client.contact_handle}</span>
                </div>
              )}
              {client.first_seen_date && (
                <div className="client-info-row">
                  <span className="client-info-label">First seen</span>
                  <span className="client-info-val">
                    {new Date(client.first_seen_date + "T00:00:00").toLocaleDateString("en-GB", {
                      day: "numeric", month: "long", year: "numeric",
                    })}
                  </span>
                </div>
              )}
              {commissions.length > 0 && (
                <div className="client-info-row">
                  <span className="client-info-label">Lifetime value</span>
                  <span className="client-info-val positive">{formatEuro(totalShipped)}</span>
                </div>
              )}
              {client.notes && (
                <div className="client-info-row col">
                  <span className="client-info-label">Notes</span>
                  <span className="client-info-val notes">{client.notes}</span>
                </div>
              )}
            </div>

            {commissions.length > 0 && (
              <div className="client-commissions">
                <div className="client-commissions-title">Commissions</div>
                {commissions.map(c => {
                  const s = statusLabel(c);
                  const profit = c.sale_price_cents !== null
                    ? c.sale_price_cents - c.material_cost_cents
                    : null;
                  return (
                    <div key={c.id} className="client-commission-row">
                      <div className="client-commission-main">
                        <span className="client-commission-title">{c.title}</span>
                        <span className={`client-status-badge ${s.cls}`}>{s.text}</span>
                      </div>
                      <div className="client-commission-meta">
                        <span className="badge">{c.category}</span>
                        <span style={{ color: "var(--muted)", fontSize: "0.78rem" }}>{c.subtype}</span>
                        {c.planned_end && (
                          <span style={{ color: "var(--muted)", fontSize: "0.78rem" }}>
                            · due {new Date(c.planned_end + "T00:00:00").toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}
                          </span>
                        )}
                      </div>
                      {profit !== null && (
                        <div style={{ fontSize: "0.8rem", color: "var(--muted)" }}>
                          {formatEuro(c.sale_price_cents)} ·{" "}
                          <span className={profit >= 0 ? "positive" : "negative"}>
                            {formatEuro(profit)} profit
                          </span>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}

            {commissions.length === 0 && (
              <p className="dash-empty">No commissions linked to this client yet.</p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// ── Add client form ────────────────────────────────────────────────────
function AddClientPanel({ onSave, onClose }) {
  const [form, setForm] = useState({ name: "", pronouns: "", contact_handle: "", notes: "" });
  const [saving, setSaving] = useState(false);
  function set(k) { return e => setForm(f => ({ ...f, [k]: e.target.value })); }

  async function handleSubmit(e) {
    e.preventDefault();
    setSaving(true);
    try {
      await execute(
        `INSERT INTO clients (name, pronouns, contact_handle, notes, first_seen_date)
         VALUES (?, ?, ?, ?, date('now'))`,
        [form.name.trim(), form.pronouns.trim() || null, form.contact_handle.trim() || null, form.notes.trim() || null]
      );
      onSave();
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="overlay" onClick={onClose}>
      <div className="panel" onClick={e => e.stopPropagation()}>
        <div className="panel-header">
          <h2>New Client</h2>
          <button className="btn-icon" onClick={onClose}>✕</button>
        </div>
        <form className="sale-form" onSubmit={handleSubmit}>
          <div className="field">
            <label>Name *</label>
            <input value={form.name} onChange={set("name")} autoFocus required />
          </div>
          <div className="field">
            <label>Pronouns</label>
            <input value={form.pronouns} onChange={set("pronouns")} placeholder="e.g. she/her" />
          </div>
          <div className="field">
            <label>Contact / handle</label>
            <input value={form.contact_handle} onChange={set("contact_handle")} placeholder="e.g. @username on Instagram" />
          </div>
          <div className="field">
            <label>Notes</label>
            <textarea
              value={form.notes}
              onChange={set("notes")}
              placeholder="Any notes…"
              rows={3}
              style={{ resize: "vertical", fontFamily: "inherit", fontSize: "0.9rem", padding: "9px 11px", border: "1px solid var(--border)", borderRadius: "7px", outline: "none", width: "100%" }}
            />
          </div>
          <div className="form-actions">
            <button type="button" className="btn-ghost" onClick={onClose}>Cancel</button>
            <button type="submit" className="btn-primary" disabled={saving}>
              {saving ? "Saving…" : "Save client"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ── Main page ──────────────────────────────────────────────────────────
export default function Clients() {
  const [clients, setClients] = useState([]);
  const [selected, setSelected] = useState(null);
  const [showAdd, setShowAdd] = useState(false);
  const [search, setSearch] = useState("");

  useEffect(() => { loadClients(); }, []);

  async function loadClients() {
    const rows = await query(`
      SELECT c.id, c.name, c.pronouns, c.contact_handle, c.notes, c.first_seen_date,
             COUNT(p.id) AS commission_count,
             COALESCE(SUM(CASE WHEN p.shipped = 1 THEN p.sale_price_cents ELSE 0 END), 0) AS total_value
      FROM clients c
      LEFT JOIN projects p ON p.client_id = c.id
      GROUP BY c.id
      ORDER BY c.name ASC
    `);
    setClients(rows);
  }

  async function handleUpdate() {
    await loadClients();
    // Refresh selected client data
    if (selected) {
      const rows = await query(
        `SELECT c.id, c.name, c.pronouns, c.contact_handle, c.notes, c.first_seen_date
         FROM clients c WHERE c.id = ?`,
        [selected.id]
      );
      if (rows[0]) setSelected(rows[0]);
    }
  }

  const filtered = clients.filter(c =>
    !search || c.name.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="page">
      <div className="page-header">
        <h1>Clients</h1>
        <button className="btn-primary" onClick={() => setShowAdd(true)}>+ New Client</button>
      </div>

      <div className="client-search-bar">
        <input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Search by name…"
          className="client-search-input"
        />
      </div>

      {filtered.length === 0 && (
        <p className="empty-state">{search ? "No clients match that search." : "No clients yet. Add one or create a commission."}</p>
      )}

      <div className="client-list">
        {filtered.map(c => (
          <div
            key={c.id}
            className={`client-card${selected?.id === c.id ? " selected" : ""}`}
            onClick={() => setSelected(c)}
          >
            <div className="client-card-main">
              <span className="client-card-name">{c.name}</span>
              {c.pronouns && <span className="client-card-pronouns">{c.pronouns}</span>}
            </div>
            <div className="client-card-meta">
              {c.contact_handle && (
                <span className="client-card-contact">{c.contact_handle}</span>
              )}
              <span className="client-card-stats">
                {c.commission_count} commission{c.commission_count !== 1 ? "s" : ""}
                {c.total_value > 0 && ` · ${formatEuro(c.total_value)}`}
              </span>
            </div>
          </div>
        ))}
      </div>

      {selected && (
        <ClientPanel
          client={selected}
          onClose={() => setSelected(null)}
          onUpdate={handleUpdate}
        />
      )}

      {showAdd && (
        <AddClientPanel
          onSave={async () => { setShowAdd(false); await loadClients(); }}
          onClose={() => setShowAdd(false)}
        />
      )}
    </div>
  );
}
