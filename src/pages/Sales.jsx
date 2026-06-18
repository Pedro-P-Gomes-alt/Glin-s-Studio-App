import { useState, useEffect } from "react";
import { query, execute } from "../db";
import { eurosToCents, formatEuro, formatEuroPerHour, formatMargin } from "../utils/money";

const PERSONAL_CATS = [
  { key: "video",       label: "YouTube / Video" },
  { key: "short",       label: "Short-form" },
  { key: "competition", label: "Competition" },
  { key: "other",       label: "Other" },
];

const PAYMENT_LABELS = {
  advance: "Advance / Signal",
  partial: "Partial payment",
  final:   "Final payment",
  other:   "Other",
};

function resetForm() {
  return {
    clientId: "", newClient: false, newClientName: "", newClientContact: "",
    title: "", category: "cosplay", subtype: "",
    plannedStart: "", plannedEnd: "", materialCost: "", salePrice: "",
  };
}

// ── Personal Project panel ─────────────────────────────────────────────
function PersonalProjectPanel({ onSave, onClose }) {
  const [form, setForm] = useState({
    title: "", category: "video", start: "", end: "", spend: "",
  });
  const [saving, setSaving] = useState(false);
  function set(k) { return e => setForm(f => ({ ...f, [k]: e.target.value })); }

  async function handleSubmit(e) {
    e.preventDefault();
    setSaving(true);
    try {
      await execute(
        `INSERT INTO projects
           (title, project_type, personal_category, planned_start, planned_end, material_cost_cents)
         VALUES (?, 'personal', ?, ?, ?, ?)`,
        [
          form.title.trim(),
          form.category,
          form.start || null,
          form.end  || null,
          eurosToCents(form.spend),
        ]
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
          <h2>New Personal Project</h2>
          <button className="btn-icon" onClick={onClose}>✕</button>
        </div>
        <form className="sale-form" onSubmit={handleSubmit}>
          <div className="field">
            <label>Title *</label>
            <input value={form.title} onChange={set("title")}
              placeholder="e.g. Studio tour video, Nationals prep…" required autoFocus />
          </div>
          <div className="field">
            <label>Type</label>
            <div className="tab-toggle" style={{ flexWrap: "wrap", gap: 6 }}>
              {PERSONAL_CATS.map(c => (
                <button key={c.key} type="button"
                  className={form.category === c.key ? "active" : ""}
                  onClick={() => setForm(f => ({ ...f, category: c.key }))}>
                  {c.label}
                </button>
              ))}
            </div>
          </div>
          <div className="field-pair">
            <div className="field">
              <label>Start</label>
              <input type="date" value={form.start} onChange={set("start")} />
            </div>
            <div className="field">
              <label>Target date</label>
              <input type="date" value={form.end} onChange={set("end")} />
            </div>
          </div>
          <div className="field">
            <label>Spending (€)</label>
            <input type="number" min="0" step="0.01" value={form.spend}
              onChange={set("spend")} placeholder="0.00" />
          </div>
          <div className="form-actions">
            <button type="button" className="btn-ghost" onClick={onClose}>Cancel</button>
            <button type="submit" className="btn-primary" disabled={saving}>
              {saving ? "Saving…" : "Create project"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ── Record Payment dialog (centered) ────────────────────────────────────
function PaymentDialog({ commission, onSave, onClose }) {
  const [amount, setAmount]   = useState("");
  const [date, setDate]       = useState(new Date().toISOString().split("T")[0]);
  const [label, setLabel]     = useState("advance");
  const [saving, setSaving]   = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setSaving(true);
    try {
      await execute(
        `INSERT INTO payments (project_id, amount_cents, received_on, label) VALUES (?, ?, ?, ?)`,
        [commission.id, eurosToCents(amount), date, label]
      );
      onSave();
    } finally {
      setSaving(false);
    }
  }

  const outstanding = commission.sale_price_cents - commission.total_received;

  return (
    <div className="dialog-overlay" onClick={onClose}>
      <div className="dialog" onClick={e => e.stopPropagation()}>
        <div className="dialog-header">
          <h3 className="dialog-title">Record Payment</h3>
          <button className="btn-icon" onClick={onClose}>✕</button>
        </div>
        <p className="dialog-sub">{commission.title}</p>
        {outstanding > 0 && (
          <p className="dialog-hint">
            Outstanding: <strong>{formatEuro(outstanding)}</strong>
            {commission.total_received > 0 && ` of ${formatEuro(commission.sale_price_cents)}`}
          </p>
        )}
        <form onSubmit={handleSubmit} style={{ marginTop: 16 }}>
          <div className="field">
            <label>Amount (€) *</label>
            <input type="number" min="0.01" step="0.01" value={amount}
              onChange={e => setAmount(e.target.value)} placeholder="0.00" required autoFocus />
          </div>
          <div className="field">
            <label>Date received *</label>
            <input type="date" value={date}
              onChange={e => setDate(e.target.value)} required />
          </div>
          <div className="field">
            <label>Type</label>
            <select value={label} onChange={e => setLabel(e.target.value)}>
              {Object.entries(PAYMENT_LABELS).map(([k, v]) => (
                <option key={k} value={k}>{v}</option>
              ))}
            </select>
          </div>
          <div className="form-actions" style={{ marginTop: 16 }}>
            <button type="button" className="btn-ghost" onClick={onClose}>Cancel</button>
            <button type="submit" className="btn-primary" disabled={saving}>
              {saving ? "Saving…" : "Record payment"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
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
  const [payments, setPayments] = useState([]);

  useEffect(() => {
    query(`SELECT * FROM payments WHERE project_id = ? ORDER BY received_on ASC`, [sale.id])
      .then(setPayments);
  }, [sale.id]);

  const materialCents = eurosToCents(materialCost);
  const saleCents     = eurosToCents(salePrice);
  const profitCents   = saleCents - materialCents;
  const showReadout   = saleCents > 0;
  const totalReceived = payments.reduce((s, p) => s + p.amount_cents, 0);

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

          {/* Payment history */}
          {payments.length > 0 && (
            <div className="finalize-payments">
              <div className="finalize-payments-label">Payments recorded</div>
              {payments.map(p => (
                <div key={p.id} className="finalize-payment-row">
                  <span>{PAYMENT_LABELS[p.label] || p.label}</span>
                  <span className="positive">{formatEuro(p.amount_cents)}</span>
                  <span className="muted">{p.received_on}</span>
                </div>
              ))}
              <div className="finalize-payment-total">
                Total received: {formatEuro(totalReceived)}
                {sale.sale_price_cents > 0 && totalReceived < sale.sale_price_cents && (
                  <span className="muted"> · outstanding: {formatEuro(sale.sale_price_cents - totalReceived)}</span>
                )}
              </div>
            </div>
          )}

          <div className="field-pair">
            <div className="field">
              <label>Material cost (€)</label>
              <input type="number" min="0" step="0.01"
                value={materialCost} onChange={e => setMaterialCost(e.target.value)}
                placeholder="0.00" />
            </div>
            <div className="field">
              <label>Sale price (€) *</label>
              <input type="number" min="0" step="0.01"
                value={salePrice} onChange={e => setSalePrice(e.target.value)}
                placeholder="0.00" required />
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

// ── Main Commissions page ──────────────────────────────────────────────
export default function Sales() {
  const [sales, setSales]           = useState([]);
  const [categories, setCategories] = useState([]);
  const [clients, setClients]       = useState([]);
  const [showNewForm, setShowNewForm]         = useState(false);
  const [showPersonalForm, setShowPersonalForm] = useState(false);
  const [finalizing, setFinalizing] = useState(null);
  const [payDialog, setPayDialog]   = useState(null);
  const [form, setForm]             = useState(resetForm());
  const [saving, setSaving]         = useState(false);

  useEffect(() => { loadAll(); }, []);

  async function loadAll() {
    const [s, cats, cls] = await Promise.all([
      query(`
        SELECT p.id, p.title, p.material_cost_cents, p.sale_price_cents,
               p.created_at, p.shipped,
               c.name AS client_name,
               cat.category, cat.subtype,
               COALESCE((SELECT SUM(hours) FROM time_logs WHERE project_id = p.id), 0) AS total_hours,
               COALESCE((SELECT SUM(amount_cents) FROM payments WHERE project_id = p.id), 0) AS total_received
        FROM projects p
        LEFT JOIN clients c ON p.client_id = c.id
        LEFT JOIN categories cat ON p.category_id = cat.id
        WHERE p.sale_price_cents IS NOT NULL
          AND p.shipped = 0
          AND p.delivered = 0
          AND p.project_type = 'commission'
        ORDER BY p.created_at DESC
      `),
      query(`SELECT * FROM categories ORDER BY category, sort_order, subtype`),
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
            material_cost_cents, sale_price_cents, shipped, project_type)
         VALUES (?, ?, ?, ?, ?, ?, ?, 0, 'commission')`,
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
        <div className="header-actions">
          <button className="btn-ghost" onClick={() => setShowPersonalForm(true)}>+ New Project</button>
          <button className="btn-primary" onClick={openForm}>+ New Order</button>
        </div>
      </div>

      {sales.length > 0 && (
        <div className="table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th>Title</th><th>Client</th><th>Type</th>
                <th>Material</th><th>Agreed</th><th>Payments</th><th>Hours</th><th></th>
              </tr>
            </thead>
            <tbody>
              {sales.map(s => {
                const outstanding = s.sale_price_cents - s.total_received;
                const fullyPaid   = outstanding <= 0;
                return (
                  <tr key={s.id}>
                    <td>{s.title}</td>
                    <td>{s.client_name ?? "—"}</td>
                    <td><span className="badge">{s.category}</span> {s.subtype}</td>
                    <td>{formatEuro(s.material_cost_cents)}</td>
                    <td>{formatEuro(s.sale_price_cents)}</td>
                    <td>
                      <div className="pay-cell">
                        {s.total_received > 0 ? (
                          <span className={fullyPaid ? "positive" : "pay-partial"}>
                            {formatEuro(s.total_received)}
                            {!fullyPaid && (
                              <span className="pay-outstanding"> −{formatEuro(outstanding)}</span>
                            )}
                          </span>
                        ) : (
                          <span className="muted">—</span>
                        )}
                        <button
                          className="pay-add-btn"
                          onClick={() => setPayDialog(s)}
                          title="Record payment">+</button>
                      </div>
                    </td>
                    <td>{s.total_hours > 0 ? `${s.total_hours}h` : "—"}</td>
                    <td>
                      <button className="btn-finalize" onClick={() => setFinalizing(s)}>
                        Finalize →
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {sales.length === 0 && (
        <p className="empty-state">No active orders. Click <strong>+ New Order</strong> to add one.</p>
      )}

      {/* Personal project panel */}
      {showPersonalForm && (
        <PersonalProjectPanel
          onSave={async () => { setShowPersonalForm(false); await loadAll(); }}
          onClose={() => setShowPersonalForm(false)}
        />
      )}

      {/* New commission panel */}
      {showNewForm && (
        <div className="overlay" onClick={() => setShowNewForm(false)}>
          <div className="panel" onClick={e => e.stopPropagation()}>
            <div className="panel-header">
              <h2>New Order</h2>
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
                  <label>Agreed price (€) *</label>
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
                  {saving ? "Saving…" : "Save order"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Finalize panel */}
      {finalizing && (
        <FinalizePanel
          sale={finalizing}
          onSave={async () => { setFinalizing(null); await loadAll(); }}
          onClose={() => setFinalizing(null)}
        />
      )}

      {/* Payment dialog */}
      {payDialog && (
        <PaymentDialog
          commission={payDialog}
          onSave={async () => { setPayDialog(null); await loadAll(); }}
          onClose={() => setPayDialog(null)}
        />
      )}
    </div>
  );
}
