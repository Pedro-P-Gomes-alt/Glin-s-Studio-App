import { useState, useEffect, useRef } from "react";
import { query, execute } from "../db";
import { today, addDays, formatLong } from "../utils/dates";

const HOUR_OPTIONS = [0.25, 0.5, 0.75, 1, 1.5, 2, 2.5, 3, 3.5, 4, 4.5, 5, 5.5, 6, 6.5, 7, 7.5, 8];

export default function Timekeeping() {
  const [date, setDate] = useState(today());
  const [logs, setLogs] = useState([]);
  const [projects, setProjects] = useState([]);
  const [form, setForm] = useState({ hours: "1", description: "", projectId: "" });
  const [saving, setSaving] = useState(false);
  const descRef = useRef(null);

  useEffect(() => { loadProjects(); }, []);
  useEffect(() => { loadLogs(); }, [date]);

  async function loadLogs() {
    const rows = await query(
      `SELECT tl.id, tl.hours, tl.description, tl.project_id, p.title AS project_title
       FROM time_logs tl
       LEFT JOIN projects p ON tl.project_id = p.id
       WHERE tl.date = ?
       ORDER BY tl.id ASC`,
      [date]
    );
    setLogs(rows);
  }

  async function loadProjects() {
    const rows = await query(
      `SELECT id, title FROM projects ORDER BY title ASC`
    );
    setProjects(rows);
  }

  function prevDay() { setDate(d => addDays(d, -1)); }
  function nextDay() { setDate(d => addDays(d, 1)); }
  function goToday() { setDate(today()); }

  const isToday = date === today();
  const totalHours = logs.reduce((s, l) => s + l.hours, 0);

  async function handleAdd(e) {
    e.preventDefault();
    setSaving(true);
    try {
      await execute(
        `INSERT INTO time_logs (date, hours, description, project_id) VALUES (?, ?, ?, ?)`,
        [
          date,
          parseFloat(form.hours),
          form.description.trim() || null,
          form.projectId ? Number(form.projectId) : null,
        ]
      );
      setForm({ hours: "1", description: "", projectId: "" });
      descRef.current?.focus();
      await loadLogs();
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(id) {
    await execute(`DELETE FROM time_logs WHERE id = ?`, [id]);
    await loadLogs();
  }

  function set(key) {
    return (e) => setForm(prev => ({ ...prev, [key]: e.target.value }));
  }

  return (
    <div className="page">
      <div className="page-header">
        <h1>Timekeeping</h1>
      </div>

      {/* Date navigator */}
      <div className="date-nav">
        <button className="btn-icon-lg" onClick={prevDay}>‹</button>
        <div className="date-nav-center">
          <span className="date-label">{formatLong(date)}</span>
          {!isToday && (
            <button className="btn-ghost sm" onClick={goToday}>Today</button>
          )}
        </div>
        <button className="btn-icon-lg" onClick={nextDay} disabled={isToday}>›</button>
      </div>

      {/* Total hours strip */}
      {logs.length > 0 && (
        <div className="hours-strip">
          <span className="hours-total">{totalHours % 1 === 0 ? totalHours : totalHours.toFixed(2)}h logged</span>
          <span className="hours-entries">{logs.length} {logs.length === 1 ? "entry" : "entries"}</span>
        </div>
      )}

      {/* Log entries */}
      <div className="log-list">
        {logs.length === 0 ? (
          <p className="empty-state no-top">Nothing logged for this day yet.</p>
        ) : (
          logs.map(log => (
            <div key={log.id} className="log-entry">
              <div className="log-hours">{log.hours % 1 === 0 ? log.hours : log.hours.toFixed(2)}h</div>
              <div className="log-body">
                {log.description && <p className="log-desc">{log.description}</p>}
                {log.project_title && (
                  <span className="log-project">{log.project_title}</span>
                )}
              </div>
              <button
                className="btn-icon delete-btn"
                onClick={() => handleDelete(log.id)}
                title="Delete entry"
              >✕</button>
            </div>
          ))
        )}
      </div>

      {/* Quick-add form */}
      <form className="log-form" onSubmit={handleAdd}>
        <div className="log-form-row">
          <div className="field narrow">
            <label>Hours</label>
            <select value={form.hours} onChange={set("hours")}>
              {HOUR_OPTIONS.map(h => (
                <option key={h} value={h}>{h}</option>
              ))}
            </select>
          </div>

          <div className="field grow">
            <label>What did you work on?</label>
            <input
              ref={descRef}
              value={form.description}
              onChange={set("description")}
              placeholder="e.g. Cut and sewed bodice pieces for the Zero Two dress"
            />
          </div>
        </div>

        <div className="log-form-row">
          <div className="field grow">
            <label>Link to project (optional)</label>
            <select value={form.projectId} onChange={set("projectId")}>
              <option value="">No project</option>
              {projects.map(p => (
                <option key={p.id} value={p.id}>{p.title}</option>
              ))}
            </select>
          </div>

          <div className="field narrow align-end">
            <label>&nbsp;</label>
            <button type="submit" className="btn-primary" disabled={saving}>
              {saving ? "…" : "Log"}
            </button>
          </div>
        </div>
      </form>
    </div>
  );
}
