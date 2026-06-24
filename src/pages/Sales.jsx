import { useState, useEffect } from "react";
import { query, execute } from "../db";
import { eurosToCents, formatEuro, formatEuroPerHour, formatMargin } from "../utils/money";
import Workspace from "../components/Workspace";

const PAYMENT_LABELS = {
  advance: "Advance / Signal",
  partial: "Partial payment",
  final:   "Final payment",
  other:   "Other",
};

const CATEGORY_LABEL = { cosplay: "Cosplay", sports: "Sports" };
const today = () => new Date().toISOString().split("T")[0];
const fmtHours = h => (h % 1 === 0 ? h : h.toFixed(2));

// ── Invoice dialog (centered) — simple summary after shipping / from history ──
function InvoiceDialog({ project, onClose }) {
  const [data, setData] = useState(null);

  useEffect(() => {
    Promise.all([
      query(`SELECT COALESCE(SUM(amount_cents), 0) AS c FROM materials WHERE project_id = ?`, [project.id]),
      query(`SELECT COALESCE(SUM(amount_cents), 0) AS c FROM payments  WHERE project_id = ?`, [project.id]),
      query(`SELECT COALESCE(SUM(hours), 0)        AS h FROM time_logs WHERE project_id = ?`, [project.id]),
    ]).then(([m, p, t]) =>
      setData({ materialCents: m[0].c, paidCents: p[0].c, hours: t[0].h })
    );
  }, [project.id]);

  const saleCents     = project.sale_price_cents ?? 0;
  const materialCents = data?.materialCents ?? 0;
  const labourCents   = saleCents - materialCents; // what she billed for her hours
  const hours         = data?.hours ?? 0;
  const paidCents     = data?.paidCents ?? 0;

  return (
    <div className="dialog-overlay" onClick={onClose}>
      <div className="dialog" onClick={e => e.stopPropagation()}>
        <div className="dialog-header">
          <h3 className="dialog-title">Invoice</h3>
          <button className="btn-icon" onClick={onClose}>✕</button>
        </div>
        <p className="dialog-sub">
          {project.title}{project.client_name ? ` · ${project.client_name}` : ""}
        </p>

        {!data ? (
          <p className="dialog-sub" style={{ marginTop: 12 }}>Loading…</p>
        ) : (
          <div className="invoice">
            <div className="invoice-row">
              <span>Materials</span>
              <span>{formatEuro(materialCents)}</span>
            </div>
            <div className="invoice-row">
              <span>Labour <span className="muted">({fmtHours(hours)}h)</span></span>
              <span>{formatEuro(labourCents)}</span>
            </div>
            <div className="invoice-row invoice-total">
              <span>Total billed</span>
              <span>{formatEuro(saleCents)}</span>
            </div>
            <div className="invoice-row">
              <span>Paid</span>
              <span className="positive">{formatEuro(paidCents)}</span>
            </div>
          </div>
        )}

        <div className="form-actions" style={{ marginTop: 16 }}>
          <button type="button" className="btn-primary" onClick={onClose}>Done</button>
        </div>
      </div>
    </div>
  );
}

// ── Record Payment dialog (centered) ────────────────────────────────────
function PaymentDialog({ commission, onSave, onClose }) {
  const [amount, setAmount]   = useState("");
  const [date, setDate]       = useState(today());
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
            Unpaid: <strong>{formatEuro(outstanding)}</strong>
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

// ── Add Material dialog (centered) — works exactly like payments ────────
function MaterialDialog({ commission, onSave, onClose }) {
  const [description, setDescription] = useState("");
  const [amount, setAmount] = useState("");
  const [date, setDate]     = useState(today());
  const [saving, setSaving] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setSaving(true);
    try {
      await execute(
        `INSERT INTO materials (project_id, description, amount_cents, bought_on) VALUES (?, ?, ?, ?)`,
        [commission.id, description.trim() || "Material", eurosToCents(amount), date]
      );
      onSave();
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="dialog-overlay" onClick={onClose}>
      <div className="dialog" onClick={e => e.stopPropagation()}>
        <div className="dialog-header">
          <h3 className="dialog-title">Add Material</h3>
          <button className="btn-icon" onClick={onClose}>✕</button>
        </div>
        <p className="dialog-sub">{commission.title}</p>
        <form onSubmit={handleSubmit} style={{ marginTop: 16 }}>
          <div className="field">
            <label>What did you buy? *</label>
            <input value={description} onChange={e => setDescription(e.target.value)}
              placeholder="e.g. 3m red satin" required autoFocus />
          </div>
          <div className="field">
            <label>Amount (€) *</label>
            <input type="number" min="0.01" step="0.01" value={amount}
              onChange={e => setAmount(e.target.value)} placeholder="0.00" required />
          </div>
          <div className="field">
            <label>Date bought *</label>
            <input type="date" value={date}
              onChange={e => setDate(e.target.value)} required />
          </div>
          <div className="form-actions" style={{ marginTop: 16 }}>
            <button type="button" className="btn-ghost" onClick={onClose}>Cancel</button>
            <button type="submit" className="btn-primary" disabled={saving}>
              {saving ? "Saving…" : "Add material"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ── Update Order panel ─────────────────────────────────────────────────
function FinalizePanel({ sale, categories, onSave, onReady, onClose }) {
  const [title, setTitle] = useState(sale.title);
  const [showUnpaid, setShowUnpaid] = useState(false);
  const [category, setCategory] = useState(sale.category || "cosplay");
  const [subtype, setSubtype] = useState(sale.subtype || "");
  const [plannedStart, setPlannedStart] = useState(sale.planned_start || "");
  const [plannedEnd, setPlannedEnd]     = useState(sale.planned_end || "");
  const [estimatedHours, setEstimatedHours] = useState(
    sale.estimated_hours != null ? String(sale.estimated_hours) : ""
  );
  const [salePrice, setSalePrice] = useState(
    sale.sale_price_cents ? (sale.sale_price_cents / 100).toFixed(2) : ""
  );
  const [saving, setSaving] = useState(false);
  const [payments, setPayments]   = useState([]);
  const [materials, setMaterials] = useState([]);

  useEffect(() => {
    query(`SELECT * FROM payments WHERE project_id = ? ORDER BY received_on ASC`, [sale.id])
      .then(setPayments);
    query(`SELECT * FROM materials WHERE project_id = ? ORDER BY bought_on ASC`, [sale.id])
      .then(setMaterials);
  }, [sale.id]);

  const subtypesForCategory = categories.filter(c => c.category === category).map(c => c.subtype);

  function pickCategory(cat) {
    setCategory(cat);
    const first = categories.find(c => c.category === cat);
    setSubtype(prev =>
      categories.some(c => c.category === cat && c.subtype === prev) ? prev : (first?.subtype ?? "")
    );
  }

  const materialCents = materials.reduce((s, m) => s + m.amount_cents, 0);
  const saleCents     = eurosToCents(salePrice);
  const profitCents   = saleCents - materialCents;
  const showReadout   = saleCents > 0;
  const totalReceived = payments.reduce((s, p) => s + p.amount_cents, 0);

  function resolveCategoryId() {
    const cat = categories.find(c => c.category === category && c.subtype === subtype);
    return cat ? cat.id : sale.category_id;
  }

  async function persist(extra = "") {
    await execute(
      `UPDATE projects SET title = ?, category_id = ?, planned_start = ?, planned_end = ?,
         estimated_hours = ?, sale_price_cents = ?${extra} WHERE id = ?`,
      [title.trim(), resolveCategoryId(), plannedStart || null, plannedEnd || null,
       estimatedHours ? Number(estimatedHours) : null, saleCents, sale.id]
    );
  }

  async function handleReady(e) {
    e.preventDefault();
    // Can't finalize while money is still owed — make her settle the balance first.
    if (saleCents - totalReceived > 0) { setShowUnpaid(true); return; }
    setSaving(true);
    try {
      // Finalize the order and park it in the board's Ready lane (not sent yet).
      await persist(`, ready = 1`);
      onReady({
        id: sale.id,
        title: title.trim(),
        client_name: sale.client_name,
        sale_price_cents: saleCents,
      });
    } finally { setSaving(false); }
  }

  async function handleSaveOnly(e) {
    e.preventDefault();
    setSaving(true);
    try { await persist(); onSave(); }
    finally { setSaving(false); }
  }

  return (
    <>
    <div className="overlay" onClick={onClose}>
      <div className="panel" onClick={e => e.stopPropagation()}>
        <div className="panel-header">
          <div>
            <h2>Update Order</h2>
            <p className="panel-subtitle">{sale.title}</p>
          </div>
          <button className="btn-icon" onClick={onClose}>✕</button>
        </div>

        <form className="sale-form" onSubmit={handleReady}>
          {(sale.total_hours > 0 || sale.client_name) && (
            <div className="finalize-stats">
              {sale.total_hours > 0 && (
                <div className="fstat">
                  <span className="fstat-label">Hours logged</span>
                  <span className="fstat-value">{sale.total_hours}</span>
                </div>
              )}
              {sale.client_name && (
                <div className="fstat">
                  <span className="fstat-label">Client</span>
                  <span className="fstat-value">{sale.client_name}</span>
                </div>
              )}
            </div>
          )}

          <div className="field">
            <label>Title *</label>
            <input value={title} onChange={e => setTitle(e.target.value)} required />
          </div>

          <div className="field">
            <label>Category</label>
            <div className="tab-toggle">
              {["cosplay", "sports"].map(cat => (
                <button key={cat} type="button"
                  className={category === cat ? "active" : ""}
                  onClick={() => pickCategory(cat)}>
                  {CATEGORY_LABEL[cat]}
                </button>
              ))}
            </div>
          </div>

          <div className="field">
            <label>Subtype</label>
            <select value={subtype} onChange={e => setSubtype(e.target.value)}>
              {subtypesForCategory.map(s => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>

          <div className="field-pair">
            <div className="field">
              <label>Start date</label>
              <input type="date" value={plannedStart} onChange={e => setPlannedStart(e.target.value)} />
            </div>
            <div className="field">
              <label>Deadline</label>
              <input type="date" value={plannedEnd} onChange={e => setPlannedEnd(e.target.value)} />
            </div>
          </div>

          {/* Materials recorded (add new ones with the + in the table) */}
          {materials.length > 0 && (
            <div className="finalize-payments">
              <div className="finalize-payments-label">Materials recorded</div>
              {materials.map(m => (
                <div key={m.id} className="finalize-payment-row">
                  <span style={{ flex: 1 }}>{m.description}</span>
                  <span>{formatEuro(m.amount_cents)}</span>
                  <span className="muted">{m.bought_on}</span>
                </div>
              ))}
              <div className="finalize-payment-total">
                Total materials: {formatEuro(materialCents)}
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
                  <span className="muted"> · unpaid: {formatEuro(sale.sale_price_cents - totalReceived)}</span>
                )}
              </div>
            </div>
          )}

          <div className="field-pair">
            <div className="field">
              <label>Estimated time (hours)</label>
              <input type="number" min="0" step="0.5"
                value={estimatedHours} onChange={e => setEstimatedHours(e.target.value)}
                placeholder="e.g. 20" />
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
              {saving ? "Saving…" : "✓ Mark as Ready"}
            </button>
          </div>
        </form>
      </div>
    </div>

    {showUnpaid && (
      <div className="dialog-overlay" onClick={() => setShowUnpaid(false)}>
        <div className="dialog" onClick={e => e.stopPropagation()}>
          <div className="dialog-header">
            <h3 className="dialog-title">Still unpaid</h3>
            <button className="btn-icon" onClick={() => setShowUnpaid(false)}>✕</button>
          </div>
          <p className="dialog-sub">{title}</p>
          <p className="dialog-hint">
            There's still <strong>{formatEuro(saleCents - totalReceived)}</strong> unpaid on
            this order. Record the remaining payment before marking it as ready.
          </p>
          <div className="form-actions" style={{ marginTop: 16 }}>
            <button type="button" className="btn-primary" onClick={() => setShowUnpaid(false)}>
              Got it
            </button>
          </div>
        </div>
      </div>
    )}
    </>
  );
}

// ── Main Commissions page ──────────────────────────────────────────────
export default function Sales() {
  const [sales, setSales]           = useState([]);
  const [history, setHistory]       = useState([]);
  const [categories, setCategories] = useState([]);
  const [clients, setClients]       = useState([]);
  const [categoryRates, setCategoryRates] = useState({}); // cents/hour by category
  const [showNewForm, setShowNewForm]         = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [finalizing, setFinalizing] = useState(null);
  const [payDialog, setPayDialog]   = useState(null);
  const [matDialog, setMatDialog]   = useState(null);
  const [invoice, setInvoice]       = useState(null);
  const [workspace, setWorkspace]   = useState(null);
  const [form, setForm]             = useState(resetForm());
  const [saving, setSaving]         = useState(false);

  useEffect(() => { loadAll(); }, []);

  async function loadAll() {
    const [s, hist, cats, cls, rates] = await Promise.all([
      query(`
        SELECT p.id, p.title, p.estimated_hours, p.sale_price_cents,
               p.created_at, p.shipped, p.category_id,
               p.planned_start, p.planned_end,
               c.name AS client_name,
               cat.category, cat.subtype,
               COALESCE((SELECT SUM(hours) FROM time_logs WHERE project_id = p.id), 0) AS total_hours,
               COALESCE((SELECT SUM(amount_cents) FROM materials WHERE project_id = p.id), 0) AS total_material,
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
      // Finalized commissions (shipped or delivered) — the order history ledger.
      query(`
        SELECT p.id, p.title, p.sale_price_cents, p.shipped_at,
               c.name AS client_name,
               cat.category, cat.subtype,
               COALESCE((SELECT SUM(hours) FROM time_logs WHERE project_id = p.id), 0) AS total_hours,
               COALESCE((SELECT SUM(amount_cents) FROM materials WHERE project_id = p.id), 0) AS total_material
        FROM projects p
        LEFT JOIN clients c ON p.client_id = c.id
        LEFT JOIN categories cat ON p.category_id = cat.id
        WHERE p.project_type = 'commission'
          AND (p.shipped = 1 OR p.delivered = 1)
        ORDER BY p.shipped_at DESC NULLS LAST, p.created_at DESC
      `),
      query(`SELECT * FROM categories ORDER BY category, sort_order, subtype`),
      query(`SELECT id, name FROM clients ORDER BY name`),
      // Average €/hour earned per category, from shipped commissions.
      query(`
        SELECT cat.category,
               COALESCE(SUM(p.sale_price_cents), 0) AS revenue,
               COALESCE(SUM((SELECT COALESCE(SUM(hours), 0) FROM time_logs WHERE project_id = p.id)), 0) AS hours
        FROM projects p
        JOIN categories cat ON p.category_id = cat.id
        WHERE p.shipped = 1 AND p.project_type = 'commission'
        GROUP BY cat.category
      `),
    ]);
    setSales(s);
    setHistory(hist);
    setCategories(cats);
    setClients(cls);
    const rateMap = {};
    for (const r of rates) rateMap[r.category] = r.hours > 0 ? r.revenue / r.hours : 0;
    setCategoryRates(rateMap);
  }

  function set(key) { return (e) => setForm(prev => ({ ...prev, [key]: e.target.value })); }

  function setCategory(cat) {
    const first = categories.find(c => c.category === cat);
    setForm(prev => ({ ...prev, category: cat, subtype: first?.subtype ?? "" }));
  }

  const subtypesForCategory = categories
    .filter(c => c.category === form.category)
    .map(c => c.subtype);

  const saleCents     = eurosToCents(form.salePrice);
  const estExpensesCents   = eurosToCents(form.estimatedExpenses);
  const profitCents   = saleCents - estExpensesCents; // estimated profit; real materials are added later as line items
  const estHours      = parseFloat(form.estimatedHours) || 0;
  const rateCents     = categoryRates[form.category] || 0; // cents per hour
  const laborEstimateCents = estHours > 0 && rateCents > 0 ? Math.round(estHours * rateCents) : 0;
  // Suggested price = labour (hours × your historical €/h for the category) + expected expenses
  const estimateCents = laborEstimateCents > 0 || estExpensesCents > 0
    ? laborEstimateCents + estExpensesCents
    : null;
  const showReadout   = saleCents > 0 || estHours > 0 || estExpensesCents > 0;

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
            estimated_hours, sale_price_cents, shipped, project_type)
         VALUES (?, ?, ?, ?, ?, ?, ?, 0, 'commission')`,
        [
          resolvedClientId, cat.id, form.title.trim(),
          form.plannedStart || null, form.plannedEnd || null,
          estHours > 0 ? estHours : null, saleCents,
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
        <h1>{showHistory ? "Order History" : "Commissions"}</h1>
        <div className="header-actions">
          {showHistory ? (
            <button className="btn-ghost" onClick={() => setShowHistory(false)}>← Back to active</button>
          ) : (
            <>
              <button className="btn-ghost" onClick={() => setShowHistory(true)}>
                🗄 History{history.length > 0 ? ` (${history.length})` : ""}
              </button>
              <button className="btn-primary" onClick={openForm}>+ New Order</button>
            </>
          )}
        </div>
      </div>

      {showHistory && (
        history.length === 0 ? (
          <p className="empty-state">No finished orders yet. Mark an order as shipped and it lands here.</p>
        ) : (
          <div className="table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Title</th><th>Client</th><th>Type</th>
                  <th>Sale price</th><th>Profit</th><th>Margin</th><th>€/hour</th><th>Shipped</th>
                </tr>
              </thead>
              <tbody>
                {history.map(h => {
                  const profit = h.sale_price_cents - h.total_material;
                  return (
                    <tr key={h.id} className="row-clickable"
                      onClick={() => setInvoice(h)} title="View invoice">
                      <td>{h.title}</td>
                      <td>{h.client_name ?? "—"}</td>
                      <td><span className="badge">{h.category}</span> {h.subtype}</td>
                      <td>{formatEuro(h.sale_price_cents)}</td>
                      <td className={profit >= 0 ? "positive" : "negative"}>{formatEuro(profit)}</td>
                      <td>{formatMargin(profit, h.sale_price_cents)}</td>
                      <td>{formatEuroPerHour(profit, h.total_hours)}</td>
                      <td className="muted">{h.shipped_at ?? "—"}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )
      )}

      {!showHistory && sales.length > 0 && (
        <div className="table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th>Title</th><th>Client</th><th>Type</th>
                <th>Materials</th><th>Agreed</th><th>Payments</th><th>Hours</th><th></th>
              </tr>
            </thead>
            <tbody>
              {sales.map(s => {
                const outstanding = s.sale_price_cents - s.total_received;
                const fullyPaid   = outstanding <= 0;
                return (
                  <tr key={s.id} className="row-clickable"
                    onClick={() => setWorkspace({ project: s, readOnly: true })}
                    title="View details">
                    <td>{s.title}</td>
                    <td>{s.client_name ?? "—"}</td>
                    <td><span className="badge">{s.category}</span> {s.subtype}</td>
                    <td>
                      <div className="pay-cell">
                        {s.total_material > 0
                          ? <span>{formatEuro(s.total_material)}</span>
                          : <span className="muted">—</span>}
                        <button
                          className="pay-add-btn"
                          onClick={e => { e.stopPropagation(); setMatDialog(s); }}
                          title="Add material">+</button>
                      </div>
                    </td>
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
                          onClick={e => { e.stopPropagation(); setPayDialog(s); }}
                          title="Record payment">+</button>
                      </div>
                    </td>
                    <td>{s.total_hours > 0 ? `${s.total_hours}h` : "—"}</td>
                    <td>
                      <div className="row-actions">
                        <button className="btn-ghost sm"
                          onClick={e => { e.stopPropagation(); setWorkspace({ project: s, readOnly: false }); }}
                          title="Edit measurements, notes, pictures">
                          Details
                        </button>
                        <button className="btn-finalize"
                          onClick={e => { e.stopPropagation(); setFinalizing(s); }}>
                          Update
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {!showHistory && sales.length === 0 && (
        <p className="empty-state">No active orders. Click <strong>+ New Order</strong> to add one.</p>
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
                      {CATEGORY_LABEL[cat]}
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

              <div className="field-trio">
                <div className="field">
                  <label>Estimated time (hours)</label>
                  <input type="number" min="0" step="0.5" value={form.estimatedHours}
                    onChange={set("estimatedHours")} placeholder="e.g. 20" />
                </div>
                <div className="field">
                  <label>Estimated expenses (€)</label>
                  <input type="number" min="0" step="0.01" value={form.estimatedExpenses}
                    onChange={set("estimatedExpenses")} placeholder="0.00" />
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
                    <span className="readout-label">Estimate</span>
                    <span className="readout-value">
                      {estimateCents != null ? formatEuro(estimateCents) : "—"}
                    </span>
                  </div>
                </div>
              )}
              {estHours > 0 && rateCents === 0 && (
                <p className="settings-hint">
                  No shipped {CATEGORY_LABEL[form.category].toLowerCase()} jobs with logged hours yet — can’t estimate a price until you have some history.
                </p>
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

      {/* Update panel */}
      {finalizing && (
        <FinalizePanel
          sale={finalizing}
          categories={categories}
          onSave={async () => { setFinalizing(null); await loadAll(); }}
          onReady={async (proj) => { setFinalizing(null); setInvoice(proj); await loadAll(); }}
          onClose={() => setFinalizing(null)}
        />
      )}

      {/* Invoice dialog — after shipping and from history */}
      {invoice && (
        <InvoiceDialog project={invoice} onClose={() => setInvoice(null)} />
      )}

      {/* Payment dialog */}
      {payDialog && (
        <PaymentDialog
          commission={payDialog}
          onSave={async () => { setPayDialog(null); await loadAll(); }}
          onClose={() => setPayDialog(null)}
        />
      )}

      {/* Material dialog */}
      {matDialog && (
        <MaterialDialog
          commission={matDialog}
          onSave={async () => { setMatDialog(null); await loadAll(); }}
          onClose={() => setMatDialog(null)}
        />
      )}

      {/* Details / workspace panel */}
      {workspace && (
        <Workspace
          project={workspace.project}
          readOnly={workspace.readOnly}
          onClose={() => setWorkspace(null)}
        />
      )}
    </div>
  );
}

function resetForm() {
  return {
    clientId: "", newClient: false, newClientName: "", newClientContact: "",
    title: "", category: "cosplay", subtype: "",
    plannedStart: "", plannedEnd: "", estimatedHours: "", estimatedExpenses: "", salePrice: "",
  };
}
