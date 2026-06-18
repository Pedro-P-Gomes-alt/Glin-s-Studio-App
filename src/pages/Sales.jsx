import { useState, useEffect } from "react";
import { query, execute } from "../db";
import { eurosToCents, formatEuro, formatEuroPerHour, formatMargin } from "../utils/money";

function resetForm() {
  return {
    clientId: "",
    newClient: false,
    newClientName: "",
    newClientContact: "",
    title: "",
    category: "cosplay",
    subtype: "",
    plannedStart: "",
    plannedEnd: "",
    materialCost: "",
    salePrice: "",
  };
}

export default function Sales() {
  const [sales, setSales] = useState([]);
  const [categories, setCategories] = useState([]);
  const [clients, setClients] = useState([]);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(resetForm());
  const [saving, setSaving] = useState(false);

  useEffect(() => { loadAll(); }, []);

  async function loadAll() {
    const [s, cats, cls] = await Promise.all([
      query(`
        SELECT p.id, p.title, p.material_cost_cents, p.sale_price_cents, p.created_at,
               c.name AS client_name,
               cat.category, cat.subtype,
               COALESCE(SUM(tl.hours), 0) AS total_hours
        FROM projects p
        LEFT JOIN clients c ON p.client_id = c.id
        LEFT JOIN categories cat ON p.category_id = cat.id
        LEFT JOIN time_logs tl ON tl.project_id = p.id
        WHERE p.sale_price_cents IS NOT NULL
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

  function openForm() {
    const f = resetForm();
    const firstCosplay = categories.find(c => c.category === "cosplay");
    f.subtype = firstCosplay?.subtype ?? "";
    setForm(f);
    setShowForm(true);
  }

  function set(key) {
    return (e) => setForm(prev => ({ ...prev, [key]: e.target.value }));
  }

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

      const cat = categories.find(
        c => c.category === form.category && c.subtype === form.subtype
      );
      if (!cat) return;

      await execute(
        `INSERT INTO projects
           (client_id, category_id, title, planned_start, planned_end,
            material_cost_cents, sale_price_cents)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [
          resolvedClientId,
          cat.id,
          form.title.trim(),
          form.plannedStart || null,
          form.plannedEnd   || null,
          materialCents,
          saleCents,
        ]
      );

      setShowForm(false);
      await loadAll();
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="page">
      <div className="page-header">
        <h1>Sales</h1>
        <button className="btn-primary" onClick={openForm}>+ New Sale</button>
      </div>

      {sales.length === 0 ? (
        <p className="empty-state">No sales recorded yet. Click <strong>+ New Sale</strong> to add your first.</p>
      ) : (
        <div className="table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th>Title</th>
                <th>Client</th>
                <th>Type</th>
                <th>Material</th>
                <th>Sale price</th>
                <th>Profit</th>
                <th>Margin</th>
                <th>€/hour</th>
              </tr>
            </thead>
            <tbody>
              {sales.map(s => {
                const profit = s.sale_price_cents - s.material_cost_cents;
                return (
                  <tr key={s.id}>
                    <td>{s.title}</td>
                    <td>{s.client_name ?? "—"}</td>
                    <td><span className="badge">{s.category}</span> {s.subtype}</td>
                    <td>{formatEuro(s.material_cost_cents)}</td>
                    <td>{formatEuro(s.sale_price_cents)}</td>
                    <td className={profit >= 0 ? "positive" : "negative"}>{formatEuro(profit)}</td>
                    <td>{formatMargin(profit, s.sale_price_cents)}</td>
                    <td>{formatEuroPerHour(profit, s.total_hours)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {showForm && (
        <div className="overlay" onClick={() => setShowForm(false)}>
          <div className="panel" onClick={e => e.stopPropagation()}>
            <div className="panel-header">
              <h2>New Sale</h2>
              <button className="btn-icon" onClick={() => setShowForm(false)}>✕</button>
            </div>

            <form className="sale-form" onSubmit={handleSubmit}>

              {/* Client */}
              <div className="field">
                <label>Client</label>
                {!form.newClient ? (
                  <div className="inline-row">
                    <select value={form.clientId} onChange={set("clientId")}>
                      <option value="">No client</option>
                      {clients.map(c => (
                        <option key={c.id} value={c.id}>{c.name}</option>
                      ))}
                    </select>
                    <button
                      type="button"
                      className="btn-ghost"
                      onClick={() => setForm(p => ({ ...p, newClient: true }))}
                    >+ New client</button>
                  </div>
                ) : (
                  <div className="new-client-block">
                    <input
                      placeholder="Name *"
                      value={form.newClientName}
                      onChange={set("newClientName")}
                      required
                      autoFocus
                    />
                    <input
                      placeholder="Contact / handle"
                      value={form.newClientContact}
                      onChange={set("newClientContact")}
                    />
                    <button
                      type="button"
                      className="btn-ghost sm"
                      onClick={() => setForm(p => ({ ...p, newClient: false, newClientName: "", newClientContact: "" }))}
                    >← Pick existing</button>
                  </div>
                )}
              </div>

              {/* Title */}
              <div className="field">
                <label>Title *</label>
                <input
                  value={form.title}
                  onChange={set("title")}
                  placeholder="e.g. Zero Two dress for AnimeConf 2026"
                  required
                />
              </div>

              {/* Category toggle */}
              <div className="field">
                <label>Category</label>
                <div className="tab-toggle">
                  <button
                    type="button"
                    className={form.category === "cosplay" ? "active" : ""}
                    onClick={() => setCategory("cosplay")}
                  >Cosplay</button>
                  <button
                    type="button"
                    className={form.category === "sports" ? "active" : ""}
                    onClick={() => setCategory("sports")}
                  >Sports</button>
                </div>
              </div>

              {/* Subtype */}
              <div className="field">
                <label>Subtype</label>
                <select value={form.subtype} onChange={set("subtype")}>
                  {subtypesForCategory.map(s => (
                    <option key={s} value={s}>{s}</option>
                  ))}
                </select>
              </div>

              {/* Dates */}
              <div className="field-pair">
                <div className="field">
                  <label>Start date</label>
                  <input type="date" value={form.plannedStart} onChange={set("plannedStart")} />
                </div>
                <div className="field">
                  <label>End / delivery date</label>
                  <input type="date" value={form.plannedEnd} onChange={set("plannedEnd")} />
                </div>
              </div>

              {/* Money */}
              <div className="field-pair">
                <div className="field">
                  <label>Material cost (€)</label>
                  <input
                    type="number" min="0" step="0.01"
                    value={form.materialCost}
                    onChange={set("materialCost")}
                    placeholder="0.00"
                  />
                </div>
                <div className="field">
                  <label>Sale price (€) *</label>
                  <input
                    type="number" min="0" step="0.01"
                    value={form.salePrice}
                    onChange={set("salePrice")}
                    placeholder="0.00"
                    required
                  />
                </div>
              </div>

              {/* Live readout */}
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
                    <span className="readout-value">
                      {formatMargin(profitCents, saleCents)}
                    </span>
                  </div>
                  <div className="readout-item">
                    <span className="readout-label">€/hour</span>
                    <span className="readout-value">—</span>
                  </div>
                </div>
              )}

              <div className="form-actions">
                <button type="button" className="btn-ghost" onClick={() => setShowForm(false)}>
                  Cancel
                </button>
                <button type="submit" className="btn-primary" disabled={saving}>
                  {saving ? "Saving…" : "Save sale"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
