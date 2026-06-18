import { useState, useEffect } from "react";
import { query, execute } from "../db";
import { eurosToCents, formatEuro, formatEuroPerHour, formatMargin } from "../utils/money";

function resetForm() {
  return {
    clientId: "", newClient: false, newClientName: "", newClientContact: "",
    title: "", category: "cosplay", subtype: "",
    plannedStart: "", plannedEnd: "", materialCost: "", salePrice: "",
  };
}

// ── Finalize Sale panel ────────────────────────────────────────────────
function FinalizePanel({ sale, onSave, onClose }) {
  const [materialCost, setMaterialCost] = useState(
    sale.material_cost_cents ? (sale.material_cost_cents / 100).toFixed(2) : ""
  );
  const [salePrice, setSalePrice] = useState(
    sale.sale_price_cents ? (sale.sale_price_cents / 100).toFixed(2) : ""
  );
  const [saving, setSaving] = useState(false);

  const materialCents = eurosToCents(materialCost);
  const saleCents     = eurosToCents(salePrice);
  const profitCents   = saleCents - materialCents;
  const showReadout   = saleCents > 0;

  async function handleShip(e) {
    e.preventDefault();
    setSaving(true);
    try {
      await execute(
        `UPDATE projects SET material_cost_cents = ?, sale_price_cents = ?, shipped = 1, shipped_at = date('now') WHERE id = ?`,
        [materialCents, saleCents, sale.id]
      );
      onSave();
    } finally {
      setSaving(false);
    }
  }

  async function handleSaveOnly(e) {
    e.preventDefault();
    setSaving(true);
    try {
      await execute(
        `UPDATE projects SET material_cost_cents = ?, sale_price_cents = ? WHERE id = ?`,
        [materialCents, saleCents, sale.id]
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
          <div>
            <h2>Finalize Sale</h2>
            <p className="panel-subtitle">{sale.title}</p>
          </div>
          <button className="btn-icon" onClick={onClose}>✕</button>
        </div>

        <form className="sale-form" onSubmit={handleShip}>
          {/* Stats summary */}
          {sale.total_hours > 0 && (
            <div className="finalize-stats">
              <div className="fstat">
                <span className="fstat-label">Hours logged</span>
                <span className="fstat-value">{sale.total_hours}</span>
              </div>
              {sale.client_name && (
                <div className="fstat">
                  <span className="fstat-label">Client</span>
                  <span className="fstat-value">{sale.client_name}</span>
                </div>
              )}
              <div className="fstat">
                <span className="fstat-label">Type</span>
                <span className="fstat-value">{sale.category} / {sale.subtype}</span>
              </div>
            </div>
          )}

          <div className="field-pair">
            <div className="field">
              <label>Material cost (€)</label>
              <input
                type="number" min="0" step="0.01"
                value={materialCost}
                onChange={e => setMaterialCost(e.target.value)}
                placeholder="0.00"
              />
            </div>
            <div className="field">
              <label>Sale price (€) *</label>
              <input
                type="number" min="0" step="0.01"
                value={salePrice}
                onChange={e => setSalePrice(e.target.value)}
                placeholder="0.00"
                required
              />
            </div>
          </div>

          {showReadout && (
            <div className="live-readout">
              <div className="readout-item">
                <span className="readout-label">Profit</span>
                <span className={`readout-value ${profitCents >= 0 ? "positive" : "negative"}`}>
                  {formatEuro(profitCents)}
                </span>
              </div>
              <div className="readout-item">
                <span className="readout-label">Margin</span>
                <span className="readout-value">{formatMargin(profitCents, saleCents)}</span>
              </div>
              <div className="readout-item">
                <span className="readout-label">€/hour</span>
                <span className="readout-value">{formatEuroPerHour(profitCents, sale.total_hours)}</span>
              </div>
            </div>
          )}

          <div className="form-actions">
            <button type="button" className="btn-ghost" onClick={handleSaveOnly} disabled={saving}>
              Save changes
            </button>
            <button type="submit" className="btn-ship" disabled={saving}>
              {saving ? "Shipping…" : "✓ Mark as Shipped"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ── Main Sales page ────────────────────────────────────────────────────
export default function Sales() {
  const [sales, setSales] = useState([]);
  const [categories, setCategories] = useState([]);
  const [clients, setClients] = useState([]);
  const [showNewForm, setShowNewForm] = useState(false);
  const [finalizing, setFinalizing] = useState(null);
  const [form, setForm] = useState(resetForm());
  const [saving, setSaving] = useState(false);

  useEffect(() => { loadAll(); }, []);

  async function loadAll() {
    const [s, cats, cls] = await Promise.all([
      query(`
        SELECT p.id, p.title, p.material_cost_cents, p.sale_price_cents,
               p.created_at, p.shipped,
               c.name AS client_name,
               cat.category, cat.subtype,
               COALESCE(SUM(tl.hours), 0) AS total_hours
        FROM projects p
        LEFT JOIN clients c ON p.client_id = c.id
        LEFT JOIN categories cat ON p.category_id = cat.id
        LEFT JOIN time_logs tl ON tl.project_id = p.id
        WHERE p.sale_price_cents IS NOT NULL AND p.shipped = 0 AND p.delivered = 0
        GROUP BY p.id
        ORDER BY p.created_at DESC
      `),
      query(`SELECT * FROM categories ORDER BY category, subtype`),
      query(`SELECT id, name FROM clients ORDER BY name`),
    ]);
    setSales(s);
    setCategories(cats);
    setClients(cls);
  }

  function set(key) { return (e) => setForm(prev => ({ ...prev, [key]: e.target.value })); }

  function setCategory(cat) {
    const first = categories.find(c => c.category === cat);
    setForm(prev => ({ ...prev, category: cat, subtype: first?.subtype ?? "" }));
  }

  const subtypesForCategory = categories
    .filter(c => c.category === form.category)
    .map(c => c.subtype);

  const materialCents = eurosToCents(form.materialCost);
  const saleCents     = eurosToCents(form.salePrice);
  const profitCents   = saleCents - materialCents;
  const showReadout   = saleCents > 0;

  function openForm() {
    const f = resetForm();
    const firstCosplay = categories.find(c => c.category === "cosplay");
    f.subtype = firstCosplay?.subtype ?? "";
    setForm(f);
    setShowNewForm(true);
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setSaving(true);
    try {
      let resolvedClientId = form.clientId ? Number(form.clientId) : null;
      if (form.newClient && form.newClientName.trim()) {
        const result = await execute(
          `INSERT INTO clients (name, contact_handle) VALUES (?, ?)`,
          [form.newClientName.trim(), form.newClientContact.trim() || null]
        );
        resolvedClientId = result.lastInsertId;
      }
      const cat = categories.find(c => c.category === form.category && c.subtype === form.subtype);
      if (!cat) return;
      await execute(
        `INSERT INTO projects
           (client_id, category_id, title, planned_start, planned_end,
            material_cost_cents, sale_price_cents, shipped)
         VALUES (?, ?, ?, ?, ?, ?, ?, 0)`,
        [
          resolvedClientId, cat.id, form.title.trim(),
          form.plannedStart || null, form.plannedEnd || null,
          materialCents, saleCents,
        ]
      );
      setShowNewForm(false);
      await loadAll();
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="page">
      <div className="page-header">
        <h1>Commissions</h1>
        <button className="btn-primary" onClick={openForm}>+ New Order</button>
      </div>

      {sales.length > 0 && (
        <div className="table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th>Title</th><th>Client</th><th>Type</th>
                <th>Material</th><th>Sale price</th><th>Hours</th><th></th>
              </tr>
            </thead>
            <tbody>
              {sales.map(s => (
                <tr key={s.id}>
                  <td>{s.title}</td>
                  <td>{s.client_name ?? "—"}</td>
                  <td><span className="badge">{s.category}</span> {s.subtype}</td>
                  <td>{formatEuro(s.material_cost_cents)}</td>
                  <td>{formatEuro(s.sale_price_cents)}</td>
                  <td>{s.total_hours > 0 ? `${s.total_hours}h` : "—"}</td>
                  <td>
                    <button className="btn-finalize" onClick={() => setFinalizing(s)}>
                      Finalize →
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {sales.length === 0 && (
        <p className="empty-state">No active orders. Click <strong>+ New Order</strong> to add one.</p>
      )}

      {/* ── New Sale panel ── */}
      {showNewForm && (
        <div className="overlay" onClick={() => setShowNewForm(false)}>
          <div className="panel" onClick={e => e.stopPropagation()}>
            <div className="panel-header">
              <h2>New Sale</h2>
              <button className="btn-icon" onClick={() => setShowNewForm(false)}>✕</button>
            </div>
            <form className="sale-form" onSubmit={handleSubmit}>
              <div className="field">
                <label>Client</label>
                {!form.newClient ? (
                  <div className="inline-row">
                    <select value={form.clientId} onChange={set("clientId")}>
                      <option value="">No client</option>
                      {clients.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                    </select>
                    <button type="button" className="btn-ghost"
                      onClick={() => setForm(p => ({ ...p, newClient: true }))}>+ New client</button>
                  </div>
                ) : (
                  <div className="new-client-block">
                    <input placeholder="Name *" value={form.newClientName}
                      onChange={set("newClientName")} required autoFocus />
                    <input placeholder="Contact / handle" value={form.newClientContact}
                      onChange={set("newClientContact")} />
                    <button type="button" className="btn-ghost sm"
                      onClick={() => setForm(p => ({ ...p, newClient: false, newClientName: "", newClientContact: "" }))}>← Pick existing</button>
                  </div>
                )}
              </div>

              <div className="field">
                <label>Title *</label>
                <input value={form.title} onChange={set("title")}
                  placeholder="e.g. Zero Two dress for AnimeConf 2026" required />
              </div>

              <div className="field">
                <label>Category</label>
                <div className="tab-toggle">
                  {["cosplay", "sports"].map(cat => (
                    <button key={cat} type="button"
                      className={form.category === cat ? "active" : ""}
                      onClick={() => setCategory(cat)}>
                      {cat === "cosplay" ? "Cosplay" : "Sports"}
                    </button>
                  ))}
                </div>
              </div>

              <div className="field">
                <label>Subtype</label>
                <select value={form.subtype} onChange={set("subtype")}>
                  {subtypesForCategory.map(s => <option key={s} value={s}>{s}</option>)}
                </select>
              </div>

              <div className="field-pair">
                <div className="field">
                  <label>Start date</label>
                  <input type="date" value={form.plannedStart} onChange={set("plannedStart")} />
                </div>
                <div className="field">
                  <label>Deadline</label>
                  <input type="date" value={form.plannedEnd} onChange={set("plannedEnd")} />
                </div>
              </div>

              <div className="field-pair">
                <div className="field">
                  <label>Material cost (€)</label>
                  <input type="number" min="0" step="0.01" value={form.materialCost}
                    onChange={set("materialCost")} placeholder="0.00" />
                </div>
                <div className="field">
                  <label>Sale price (€) *</label>
                  <input type="number" min="0" step="0.01" value={form.salePrice}
                    onChange={set("salePrice")} placeholder="0.00" required />
                </div>
              </div>

              {showReadout && (
                <div className="live-readout">
                  <div className="readout-item">
                    <span className="readout-label">Profit</span>
                    <span className={`readout-value ${profitCents >= 0 ? "positive" : "negative"}`}>
                      {formatEuro(profitCents)}
                    </span>
                  </div>
                  <div className="readout-item">
                    <span className="readout-label">Margin</span>
                    <span className="readout-value">{formatMargin(profitCents, saleCents)}</span>
                  </div>
                  <div className="readout-item">
                    <span className="readout-label">€/hour</span>
                    <span className="readout-value">—</span>
                  </div>
                </div>
              )}

              <div className="form-actions">
                <button type="button" className="btn-ghost" onClick={() => setShowNewForm(false)}>Cancel</button>
                <button type="submit" className="btn-primary" disabled={saving}>
                  {saving ? "Saving…" : "Save sale"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── Finalize Sale panel ── */}
      {finalizing && (
        <FinalizePanel
          sale={finalizing}
          onSave={async () => { setFinalizing(null); await loadAll(); }}
          onClose={() => setFinalizing(null)}
        />
      )}
    </div>
  );
}
