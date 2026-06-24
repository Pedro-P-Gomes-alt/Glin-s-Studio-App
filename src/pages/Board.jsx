import { useState, useEffect } from "react";
import { query, execute } from "../db";
import { today } from "../utils/dates";
import { formatEuro, formatMargin } from "../utils/money";

function daysBetween(isoA, isoB) {
  const a = new Date(isoA + "T00:00:00");
  const b = new Date(isoB + "T00:00:00");
  return Math.floor((b - a) / 86400000);
}

function getStatus(p, todayStr) {
  if (p.delivered) return "history";
  if (p.shipped) return "shipped";
  if (p.ready) return "ready";
  if (!p.total_hours || p.total_hours === 0) return "todo";
  if (p.last_log_date && daysBetween(p.last_log_date, todayStr) >= 3) return "pending";
  return "doing";
}

const COLS = [
  { id: "todo",    label: "To Do",   hint: "No time logged yet" },
  { id: "doing",   label: "Doing",   hint: "Worked on in the last 3 days" },
  { id: "pending", label: "Pending", hint: "No work logged for 3+ days" },
  { id: "ready",   label: "Ready",   hint: "Finalized — press Shipped when sent" },
  { id: "shipped", label: "Shipped", hint: "Sent — confirm delivery below" },
];

function fmt(isoDate) {
  if (!isoDate) return null;
  return new Date(isoDate + "T00:00:00").toLocaleDateString("en-GB", {
    day: "numeric", month: "short",
  });
}

function ProjectCard({ project, onShip, onDeliver, onReturn, onDelete }) {
  const profit = project.sale_price_cents !== null
    ? project.sale_price_cents - project.material_cost_cents
    : null;
  const hasActions = onShip || onDeliver || onReturn;

  return (
    <div className="board-card">
      <div className="board-card-top-row">
        <div className="board-card-title">{project.title}</div>
        {onDelete && (
          <button className="board-card-x" onClick={() => onDelete(project.id)} title="Delete project">✕</button>
        )}
      </div>

      {project.client_name && (
        <div className="board-card-client">{project.client_name}</div>
      )}

      <div className="board-card-meta">
        {project.project_type === "personal" ? (
          <span className="badge badge--personal">{project.personal_category ?? "personal"}</span>
        ) : (
          <>
            <span className="badge">{project.category}</span>
            <span className="board-card-sub">{project.subtype}</span>
          </>
        )}
      </div>

      {(project.planned_start || project.planned_end) && (
        <div className="board-card-dates">
          {fmt(project.planned_start)}{project.planned_start && project.planned_end ? " → " : ""}{fmt(project.planned_end)}
        </div>
      )}

      <div className="board-card-footer">
        {project.total_hours > 0 && (
          <span className="board-card-stat">{project.total_hours}h</span>
        )}
        {project.last_log_date && !project.shipped && (
          <span className="board-card-stat muted">last: {fmt(project.last_log_date)}</span>
        )}
        {profit !== null && (
          <span className={`board-card-stat ${profit >= 0 ? "positive" : "negative"}`}>
            {formatEuro(profit)}
          </span>
        )}
        {profit !== null && project.sale_price_cents > 0 && (
          <span className="board-card-stat muted">
            {formatMargin(profit, project.sale_price_cents)}
          </span>
        )}
      </div>

      {hasActions && (
        <div className="board-card-actions">
          {onReturn && (
            <button
              className="board-card-btn board-card-btn--return"
              onClick={() => onReturn(project.id)}
              title="Client returned it — move back to Doing for adjustments"
            >
              ↩ Returned
            </button>
          )}
          {onShip && (
            <button
              className="board-card-btn board-card-btn--deliver"
              onClick={() => onShip(project.id)}
              title="It's been sent — move to Shipped"
            >
              📦 Shipped
            </button>
          )}
          {onDeliver && (
            <button
              className="board-card-btn board-card-btn--deliver"
              onClick={() => onDeliver(project.id)}
              title="Confirm delivery — move to History"
            >
              ✓ Delivered
            </button>
          )}
        </div>
      )}
    </div>
  );
}

export default function Board() {
  const [projects, setProjects] = useState([]);
  const todayStr = today();

  useEffect(() => { load(); }, []);

  async function load() {
    const rows = await query(`
      SELECT p.id, p.title, p.planned_start, p.planned_end,
             COALESCE((SELECT SUM(amount_cents) FROM materials WHERE project_id = p.id), 0) AS material_cost_cents,
             p.sale_price_cents, p.status_override,
             p.shipped, p.delivered, p.ready, p.project_type, p.personal_category,
             COALESCE((SELECT SUM(amount_cents) FROM payments WHERE project_id = p.id), 0) AS paid_cents,
             c.name AS client_name,
             cat.category, cat.subtype,
             COALESCE(SUM(tl.hours), 0) AS total_hours,
             MAX(tl.date) AS last_log_date
      FROM projects p
      LEFT JOIN clients c ON p.client_id = c.id
      LEFT JOIN categories cat ON p.category_id = cat.id
      LEFT JOIN time_logs tl ON tl.project_id = p.id
      GROUP BY p.id
      ORDER BY p.planned_start ASC NULLS LAST, p.created_at DESC
    `);
    setProjects(rows);
  }

  async function handleShip(id) {
    const p = projects.find(x => x.id === id);
    // Mirror the pay-before-ship guard from the Commissions page: don't let an
    // order ship while money is still owed.
    if (p && p.sale_price_cents !== null) {
      const balance = p.sale_price_cents - (p.paid_cents ?? 0);
      if (balance > 0) {
        window.alert(`There's still ${formatEuro(balance)} unpaid on this order. Record the remaining payment before marking it as shipped.`);
        return;
      }
    }
    await execute(`UPDATE projects SET shipped = 1, ready = 0, shipped_at = ? WHERE id = ?`, [today(), id]);
    await load();
  }

  async function handleDeliver(id) {
    await execute(`UPDATE projects SET delivered = 1 WHERE id = ?`, [id]);
    await load();
  }

  async function handleReturn(id) {
    await execute(`UPDATE projects SET shipped = 0, delivered = 0, ready = 0 WHERE id = ?`, [id]);
    await load();
  }

  async function handleDelete(id) {
    if (!window.confirm("Delete this project and all its time logs? This cannot be undone.")) return;
    await execute(`DELETE FROM time_logs WHERE project_id = ?`, [id]);
    await execute(`DELETE FROM projects WHERE id = ?`, [id]);
    await load();
  }

  const grouped = Object.fromEntries(COLS.map(c => [c.id, []]));
  for (const p of projects) {
    const status = getStatus(p, todayStr);
    if (grouped[status]) grouped[status].push(p); // "history" (delivered) lives on Commissions now
  }

  return (
    <div className="page">
      <div className="page-header">
        <h1>Board</h1>
        <span className="page-hint">Log time to move → Doing. Mark Ready when finalized, then Shipped once sent.</span>
      </div>

      <div className="board-cols">
        {COLS.map(col => (
          <div key={col.id} className={`board-col board-col--${col.id}`}>
            <div className="board-col-header">
              <span className="board-col-label">{col.label}</span>
              <span className="board-col-count">{grouped[col.id].length}</span>
            </div>
            <div className="board-col-cards">
              {grouped[col.id].length === 0 ? (
                <p className="board-empty">{col.hint}</p>
              ) : (
                grouped[col.id].map(p => (
                  <ProjectCard
                    key={p.id}
                    project={p}
                    onShip={col.id === "ready" ? handleShip : null}
                    onDeliver={col.id === "shipped" ? handleDeliver : null}
                    onReturn={col.id === "shipped" ? handleReturn : null}
                    onDelete={handleDelete}
                  />
                ))
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
