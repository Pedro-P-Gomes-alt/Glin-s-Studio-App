import { useState, useEffect } from "react";
import { query, execute } from "../db";
import { eurosToCents, formatEuro } from "../utils/money";

const PERSONAL_CATS = [
  { key: "video",       label: "YouTube / Video" },
  { key: "short",       label: "Short-form" },
  { key: "competition", label: "Competition" },
  { key: "other",       label: "Other" },
];
const CAT_LABEL = Object.fromEntries(PERSONAL_CATS.map(c => [c.key, c.label]));

const fmtHours = h => (h % 1 === 0 ? h : h.toFixed(2));

// ── New Project panel ──────────────────────────────────────────────────
function NewProjectPanel({ onSave, onClose }) {
  const [form, setForm] = useState({ title: "", category: "video", start: "", end: "", spend: "" });
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
        [form.title.trim(), form.category, form.start || null, form.end || null, eurosToCents(form.spend)]
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
          <h2>New Project</h2>
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
            <label>Base spending (€)</label>
            <input type="number" min="0" step="0.01" value={form.spend}
              onChange={set("spend")} placeholder="0.00" />
            <p className="settings-hint">Costs not tied to a specific subtask. Subtasks add their own.</p>
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

// ── Subtask list ───────────────────────────────────────────────────────
function SubtaskList({ projectId, subtasks, onChange }) {
  const [title, setTitle] = useState("");
  const [cost, setCost] = useState("");

  async function addSubtask() {
    const t = title.trim();
    if (!t) return;
    const maxOrder = subtasks.reduce((m, s) => Math.max(m, s.sort_order), 0);
    await execute(
      `INSERT INTO subtasks (project_id, title, material_cost_cents, sort_order) VALUES (?, ?, ?, ?)`,
      [projectId, t, eurosToCents(cost), maxOrder + 1]
    );
    setTitle(""); setCost("");
    onChange();
  }

  async function toggleDone(s) {
    await execute(`UPDATE subtasks SET done = ? WHERE id = ?`, [s.done ? 0 : 1, s.id]);
    onChange();
  }

  async function deleteSubtask(s) {
    await execute(`DELETE FROM subtasks WHERE id = ?`, [s.id]);
    onChange();
  }

  return (
    <div className="subtask-block">
      {subtasks.length > 0 ? (
        <div className="subtask-list">
          {subtasks.map(s => (
            <div key={s.id} className={`subtask-row${s.done ? " is-done" : ""}`}>
              <button className="subtask-check" onClick={() => toggleDone(s)}
                title={s.done ? "Mark not done" : "Mark done"}>
                {s.done ? "☑" : "☐"}
              </button>
              <span className="subtask-title">{s.title}</span>
              <span className="subtask-stat">{s.hours > 0 ? `${fmtHours(s.hours)}h` : "—"}</span>
              <span className="subtask-stat">{s.material_cost_cents > 0 ? formatEuro(s.material_cost_cents) : "—"}</span>
              <button className="btn-icon" title="Delete subtask" onClick={() => deleteSubtask(s)}>✕</button>
            </div>
          ))}
        </div>
      ) : (
        <p className="subtask-empty">No subtasks — fine for videos and short-form. Add one to track time &amp; materials separately.</p>
      )}
      <div className="subtask-add">
        <input placeholder="New subtask…" value={title}
          onChange={e => setTitle(e.target.value)}
          onKeyDown={e => { if (e.key === "Enter") { e.preventDefault(); addSubtask(); } }} />
        <input className="subtask-cost" type="number" min="0" step="0.01" placeholder="€ material"
          value={cost} onChange={e => setCost(e.target.value)}
          onKeyDown={e => { if (e.key === "Enter") { e.preventDefault(); addSubtask(); } }} />
        <button className="btn-ghost sm" onClick={addSubtask}>+ Add</button>
      </div>
    </div>
  );
}

// ── Main ───────────────────────────────────────────────────────────────
export default function Projects() {
  const [projects, setProjects] = useState([]);
  const [subtasksByProject, setSubtasksByProject] = useState({});
  const [showNew, setShowNew] = useState(false);
  const [showArchive, setShowArchive] = useState(false);
  const [expanded, setExpanded] = useState({});

  useEffect(() => { loadAll(); }, []);

  async function loadAll() {
    const [projs, subs] = await Promise.all([
      query(`
        SELECT p.id, p.title, p.personal_category, p.planned_start, p.planned_end,
               p.material_cost_cents, p.shipped, p.delivered,
               COALESCE((SELECT SUM(hours) FROM time_logs WHERE project_id = p.id), 0) AS total_hours,
               COALESCE((SELECT SUM(material_cost_cents) FROM subtasks WHERE project_id = p.id), 0) AS subtask_material
        FROM projects p
        WHERE p.project_type = 'personal'
        ORDER BY p.created_at DESC
      `),
      query(`
        SELECT s.id, s.project_id, s.title, s.done, s.material_cost_cents, s.sort_order,
               COALESCE((SELECT SUM(hours) FROM time_logs WHERE subtask_id = s.id), 0) AS hours
        FROM subtasks s
        ORDER BY s.sort_order, s.id
      `),
    ]);
    const grouped = {};
    for (const s of subs) (grouped[s.project_id] ||= []).push(s);
    setProjects(projs);
    setSubtasksByProject(grouped);
  }

  async function archiveProject(p) {
    // Archive without deleting — keeps all data, hides from the active list.
    await execute(`UPDATE projects SET shipped = 1, delivered = 1 WHERE id = ?`, [p.id]);
    await loadAll();
  }

  async function reopenProject(p) {
    await execute(`UPDATE projects SET shipped = 0, delivered = 0 WHERE id = ?`, [p.id]);
    await loadAll();
  }

  async function deleteProject(p) {
    if (!window.confirm(`Delete "${p.title}", its subtasks and time logs? This cannot be undone.`)) return;
    await execute(`DELETE FROM time_logs WHERE project_id = ?`, [p.id]);
    await execute(`DELETE FROM projects WHERE id = ?`, [p.id]); // subtasks cascade
    await loadAll();
  }

  function toggleExpand(id) { setExpanded(e => ({ ...e, [id]: !e[id] })); }

  const activeProjects   = projects.filter(p => !p.shipped && !p.delivered);
  const archivedProjects = projects.filter(p => p.shipped || p.delivered);

  function renderCard(p, isArchived) {
    const subtasks = subtasksByProject[p.id] ?? [];
    const totalMaterial = p.material_cost_cents + p.subtask_material;
    const doneCount = subtasks.filter(s => s.done).length;
    const isOpen = expanded[p.id] ?? false;
    return (
      <div key={p.id} className={`project-card${isArchived ? " is-closed" : ""}`}>
        <div className="project-card-head" onClick={() => toggleExpand(p.id)}>
          <button className="project-expand">{isOpen ? "▾" : "▸"}</button>
          <div className="project-card-main">
            <div className="project-card-title">{p.title}</div>
            <div className="project-card-meta">
              <span className="badge badge--personal">{CAT_LABEL[p.personal_category] ?? p.personal_category ?? "personal"}</span>
              {isArchived && <span className="badge badge--done">Archived</span>}
              {subtasks.length > 0 && (
                <span className="muted">{doneCount}/{subtasks.length} subtasks</span>
              )}
            </div>
          </div>
          <div className="project-card-stats">
            <span className="project-stat">{p.total_hours > 0 ? `${fmtHours(p.total_hours)}h` : "—"}</span>
            <span className="project-stat">{totalMaterial > 0 ? formatEuro(totalMaterial) : "—"}</span>
          </div>
          <div className="project-card-actions" onClick={e => e.stopPropagation()}>
            {isArchived ? (
              <button className="btn-ghost sm" title="Reopen project" onClick={() => reopenProject(p)}>↩ Reopen</button>
            ) : (
              <button className="btn-ghost sm" title="Archive — hide it, keep the data" onClick={() => archiveProject(p)}>🗄 Archive</button>
            )}
            <button className="btn-icon" title="Delete project" onClick={() => deleteProject(p)}>✕</button>
          </div>
        </div>
        {isOpen && (
          <SubtaskList projectId={p.id} subtasks={subtasks} onChange={loadAll} />
        )}
      </div>
    );
  }

  return (
    <div className="page">
      <div className="page-header">
        <h1>{showArchive ? "Archived Projects" : "Projects"}</h1>
        <div className="header-actions">
          {showArchive ? (
            <button className="btn-ghost" onClick={() => setShowArchive(false)}>← Back to active</button>
          ) : (
            <>
              <button className="btn-ghost" onClick={() => setShowArchive(true)}>
                🗄 Archive{archivedProjects.length > 0 ? ` (${archivedProjects.length})` : ""}
              </button>
              <button className="btn-primary" onClick={() => setShowNew(true)}>+ New Project</button>
            </>
          )}
        </div>
      </div>

      {showArchive ? (
        archivedProjects.length === 0 ? (
          <p className="empty-state">No archived projects. Archive a project to tuck it away here — you can reopen it any time.</p>
        ) : (
          <div className="project-list">
            {archivedProjects.map(p => renderCard(p, true))}
          </div>
        )
      ) : (
        activeProjects.length === 0 ? (
          <p className="empty-state">
            No active projects. Click <strong>+ New Project</strong> to add your own work — videos, contests, anything not tied to a client.
            {archivedProjects.length > 0 && <> Past projects are in the <strong>Archive</strong>.</>}
          </p>
        ) : (
          <div className="project-list">
            {activeProjects.map(p => renderCard(p, false))}
          </div>
        )
      )}

      {showNew && (
        <NewProjectPanel
          onSave={async () => { setShowNew(false); await loadAll(); }}
          onClose={() => setShowNew(false)}
        />
      )}
    </div>
  );
}
