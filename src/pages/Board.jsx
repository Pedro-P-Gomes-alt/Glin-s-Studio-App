import { useState, useEffect } from "react";
import { query } from "../db";
import { today } from "../utils/dates";
import { formatEuro, formatEuroPerHour, formatMargin } from "../utils/money";

function getStatus(p, todayStr) {
  if (p.sale_price_cents !== null) return "done";
  if (p.status_override) return p.status_override;
  const s = p.planned_start, e = p.planned_end;
  if (e && e < todayStr) return "overdue";
  if (s && s <= todayStr && (!e || e >= todayStr)) return "doing";
  return "todo";
}

const COLS = [
  { id: "todo",    label: "To Do",   hint: "Scheduled, not started" },
  { id: "doing",   label: "Doing",   hint: "In progress right now" },
  { id: "overdue", label: "Overdue", hint: "Past deadline, no sale recorded" },
  { id: "done",    label: "Done",    hint: "Sale recorded" },
];

function fmt(isoDate) {
  if (!isoDate) return null;
  return new Date(isoDate + "T00:00:00").toLocaleDateString("en-GB", {
    day: "numeric", month: "short",
  });
}

function ProjectCard({ project }) {
  const profit = project.sale_price_cents !== null
    ? project.sale_price_cents - project.material_cost_cents
    : null;

  return (
    <div className="board-card">
      <div className="board-card-title">{project.title}</div>

      {project.client_name && (
        <div className="board-card-client">{project.client_name}</div>
      )}

      <div className="board-card-meta">
        <span className="badge">{project.category}</span>
        <span className="board-card-sub">{project.subtype}</span>
      </div>

      {(project.planned_start || project.planned_end) && (
        <div className="board-card-dates">
          {fmt(project.planned_start)} {project.planned_start && project.planned_end ? "→" : ""} {fmt(project.planned_end)}
        </div>
      )}

      <div className="board-card-footer">
        {project.total_hours > 0 && (
          <span className="board-card-stat">{project.total_hours}h</span>
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
             c.name AS client_name,
             cat.category, cat.subtype,
             COALESCE(SUM(tl.hours), 0) AS total_hours
      FROM projects p
      LEFT JOIN clients c ON p.client_id = c.id
      LEFT JOIN categories cat ON p.category_id = cat.id
      LEFT JOIN time_logs tl ON tl.project_id = p.id
      GROUP BY p.id
      ORDER BY p.planned_start ASC NULLS LAST
    `);
    setProjects(rows);
  }

  const grouped = Object.fromEntries(COLS.map(c => [c.id, []]));
  for (const p of projects) {
    const status = getStatus(p, todayStr);
    if (grouped[status]) grouped[status].push(p);
  }

  return (
    <div className="page">
      <div className="page-header">
        <h1>Board</h1>
        <span className="page-hint">Read-only — recording a sale marks a project Done</span>
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
                grouped[col.id].map(p => <ProjectCard key={p.id} project={p} />)
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
