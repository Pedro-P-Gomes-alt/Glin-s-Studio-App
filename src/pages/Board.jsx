import { useState, useEffect } from "react";
import { query, execute } from "../db";
import { today } from "../utils/dates";
import { formatEuro, formatEuroPerHour, formatMargin } from "../utils/money";

function daysBetween(isoA, isoB) {
  const a = new Date(isoA + "T00:00:00");
  const b = new Date(isoB + "T00:00:00");
  return Math.floor((b - a) / 86400000);
}

function getStatus(p, todayStr) {
  if (p.delivered) return "history";
  if (p.shipped) return "shipped";
  if (!p.total_hours || p.total_hours === 0) return "todo";
  if (p.last_log_date && daysBetween(p.last_log_date, todayStr) >= 3) return "pending";
  return "doing";
}

const COLS = [
  { id: "todo",    label: "To Do",   hint: "No time logged yet" },
  { id: "doing",   label: "Doing",   hint: "Worked on in the last 3 days" },
  { id: "pending", label: "Pending", hint: "No work logged for 3+ days" },
  { id: "shipped", label: "Shipped", hint: "Finalized — confirm delivery below" },
];

function fmt(isoDate) {
  if (!isoDate) return null;
  return new Date(isoDate + "T00:00:00").toLocaleDateString("en-GB", {
    day: "numeric", month: "short",
  });
}

function ProjectCard({ project, onDeliver, onReturn, onDelete }) {
  const profit = project.sale_price_cents !== null
    ? project.sale_price_cents - project.material_cost_cents
    : null;

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

      {(onDeliver || onReturn) && (
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
             p.material_cost_cents, p.sale_price_cents, p.status_override,
             p.shipped, p.delivered, p.project_type, p.personal_category,
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

  async function handleDeliver(id) {
    await execute(`UPDATE projects SET delivered = 1 WHERE id = ?`, [id]);
    await load();
  }

  async function handleReturn(id) {
    await execute(`UPDATE projects SET shipped = 0, delivered = 0 WHERE id = ?`, [id]);
    await load();
  }

  async function handleDelete(id) {
    if (!window.confirm("Delete this project and all its time logs? This cannot be undone.")) return;
    await execute(`DELETE FROM time_logs WHERE project_id = ?`, [id]);
    await execute(`DELETE FROM projects WHERE id = ?`, [id]);
    await load();
  }

  const grouped = Object.fromEntries(COLS.map(c => [c.id, []]));
  const history = [];
  for (const p of projects) {
    const status = getStatus(p, todayStr);
    if (status === "history") history.push(p);
    else if (grouped[status]) grouped[status].push(p);
  }

  return (
    <div className="page">
      <div className="page-header">
        <h1>Board</h1>
        <span className="page-hint">Log time to move → Doing. Finalize sale to → Shipped.</span>
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

      {/* History section */}
      {history.length > 0 && (
        <section className="board-history">
          <h2 className="board-history-title">History</h2>
          <div className="table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Title</th><th>Client</th><th>Type</th>
                  <th>Sale price</th><th>Profit</th><th>Margin</th><th>€/hour</th>
                </tr>
              </thead>
              <tbody>
                {history.map(p => {
                  const profit = p.sale_price_cents !== null
                    ? p.sale_price_cents - p.material_cost_cents
                    : null;
                  return (
                    <tr key={p.id}>
                      <td>{p.title}</td>
                      <td>{p.client_name ?? "—"}</td>
                      <td>
                        {p.project_type === "personal"
                          ? <span className="badge badge--personal">{p.personal_category ?? "personal"}</span>
                          : <><span className="badge">{p.category}</span> {p.subtype}</>}
                      </td>
                      <td>{formatEuro(p.sale_price_cents)}</td>
                      <td className={profit >= 0 ? "positive" : "negative"}>{formatEuro(profit)}</td>
                      <td>{formatMargin(profit, p.sale_price_cents)}</td>
                      <td>{formatEuroPerHour(profit, p.total_hours)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </div>
  );
}
