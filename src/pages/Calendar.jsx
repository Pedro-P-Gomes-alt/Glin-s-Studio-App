import { useState, useEffect } from "react";
import { query, execute } from "../db";
import { today, toIso } from "../utils/dates";
import { eurosToCents } from "../utils/money";

const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const MONTH_NAMES = [
  "January","February","March","April","May","June",
  "July","August","September","October","November","December",
];

// Build array of weeks; each week is 7 ISO strings or null for padding
function buildWeeks(year, month) {
  const first = new Date(year, month, 1);
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const startOffset = (first.getDay() + 6) % 7; // Mon = 0

  const days = [
    ...Array(startOffset).fill(null),
    ...Array.from({ length: daysInMonth }, (_, i) =>
      toIso(new Date(year, month, i + 1))
    ),
  ];

  while (days.length % 7 !== 0) days.push(null);

  const weeks = [];
  for (let i = 0; i < days.length; i += 7) weeks.push(days.slice(i, i + 7));
  return weeks;
}

// Assign items in a week to non-overlapping lanes
function buildLanes(weekDays, items) {
  const validDays = weekDays.filter(Boolean);
  if (!validDays.length) return [];
  const weekStart = validDays[0];
  const weekEnd = validDays[validDays.length - 1];

  const active = items
    .filter(item => item.start <= weekEnd && item.end >= weekStart)
    .sort((a, b) => a.start.localeCompare(b.start) || a.id - b.id);

  const firstCol = weekDays.findIndex(d => d !== null);
  const lastCol = weekDays.map((d, i) => (d ? i : -1)).filter(i => i >= 0).pop();

  function col(isoDate) {
    const i = weekDays.indexOf(isoDate);
    if (i >= 0) return i;
    return isoDate < weekStart ? firstCol : lastCol;
  }

  const lanes = [];
  for (const item of active) {
    const cStart = col(item.start);
    const cEnd = col(item.end);
    const pos = {
      item,
      cStart,
      cEnd,
      startsHere: item.start >= weekStart,
      endsHere: item.end <= weekEnd,
    };
    let placed = false;
    for (const lane of lanes) {
      if (lane[lane.length - 1].cEnd < cStart) {
        lane.push(pos);
        placed = true;
        break;
      }
    }
    if (!placed) lanes.push([pos]);
  }

  return lanes;
}

function WeekRow({ weekDays, lanes, todayStr, onDayClick }) {
  return (
    <div className="cal-week">
      {/* Day number row */}
      <div className="cal-days-row">
        {weekDays.map((d, i) => (
          <div
            key={i}
            className={[
              "cal-day-cell",
              d === todayStr ? "is-today" : "",
              !d ? "cal-day-empty" : "",
            ].join(" ")}
            onClick={() => d && onDayClick(d)}
          >
            {d && <span className="cal-day-num">{parseInt(d.slice(8))}</span>}
          </div>
        ))}
      </div>

      {/* Item bar lanes */}
      {lanes.map((lane, li) => (
        <div key={li} className="cal-lane">
          {lane.map(({ item, cStart, cEnd, startsHere, endsHere }) => (
            <div
              key={item.id}
              className={[
                "cal-bar",
                `cal-bar--${item.kind}`,
                !startsHere ? "no-left-r" : "",
                !endsHere ? "no-right-r" : "",
              ].join(" ")}
              style={{ gridColumn: `${cStart + 1} / ${cEnd + 2}` }}
              title={item.title}
            >
              {startsHere && <span className="cal-bar-title">{item.title}</span>}
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}

// ── New Project panel ──────────────────────────────────────────────────
function NewProjectPanel({ categories, clients, defaultDate, onSave, onClose }) {
  const [form, setForm] = useState({
    clientId: "", newClient: false, newClientName: "", newClientContact: "",
    title: "", category: "cosplay", subtype: "",
    start: defaultDate, end: defaultDate, materialCost: "",
  });

  const subtypes = categories.filter(c => c.category === form.category).map(c => c.subtype);

  useEffect(() => {
    const first = categories.find(c => c.category === form.category);
    setForm(f => ({ ...f, subtype: first?.subtype ?? "" }));
  }, [form.category, categories]);

  function set(k) { return e => setForm(f => ({ ...f, [k]: e.target.value })); }

  async function handleSubmit(e) {
    e.preventDefault();
    let clientId = form.clientId ? Number(form.clientId) : null;
    if (form.newClient && form.newClientName.trim()) {
      const r = await execute(
        `INSERT INTO clients (name, contact_handle) VALUES (?, ?)`,
        [form.newClientName.trim(), form.newClientContact.trim() || null]
      );
      clientId = r.lastInsertId;
    }
    const cat = categories.find(c => c.category === form.category && c.subtype === form.subtype);
    if (!cat) return;
    await execute(
      `INSERT INTO projects (client_id, category_id, title, planned_start, planned_end, material_cost_cents)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [clientId, cat.id, form.title.trim(), form.start || null, form.end || null, eurosToCents(form.materialCost)]
    );
    onSave();
  }

  return (
    <div className="overlay" onClick={onClose}>
      <div className="panel" onClick={e => e.stopPropagation()}>
        <div className="panel-header">
          <h2>New Project</h2>
          <button className="btn-icon" onClick={onClose}>✕</button>
        </div>
        <form className="sale-form" onSubmit={handleSubmit}>
          {/* Client */}
          <div className="field">
            <label>Client</label>
            {!form.newClient ? (
              <div className="inline-row">
                <select value={form.clientId} onChange={set("clientId")}>
                  <option value="">No client</option>
                  {clients.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
                <button type="button" className="btn-ghost sm"
                  onClick={() => setForm(f => ({ ...f, newClient: true }))}>+ New</button>
              </div>
            ) : (
              <div className="new-client-block">
                <input placeholder="Name *" value={form.newClientName} onChange={set("newClientName")} required autoFocus />
                <input placeholder="Contact / handle" value={form.newClientContact} onChange={set("newClientContact")} />
                <button type="button" className="btn-ghost sm"
                  onClick={() => setForm(f => ({ ...f, newClient: false }))}>← Pick existing</button>
              </div>
            )}
          </div>

          <div className="field">
            <label>Title *</label>
            <input value={form.title} onChange={set("title")} placeholder="e.g. Zero Two dress for AnimeConf" required />
          </div>

          <div className="field">
            <label>Category</label>
            <div className="tab-toggle">
              {["cosplay", "sports"].map(cat => (
                <button key={cat} type="button"
                  className={form.category === cat ? "active" : ""}
                  onClick={() => setForm(f => ({ ...f, category: cat }))}>
                  {cat.charAt(0).toUpperCase() + cat.slice(1)}
                </button>
              ))}
            </div>
          </div>

          <div className="field">
            <label>Subtype</label>
            <select value={form.subtype} onChange={set("subtype")}>
              {subtypes.map(s => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>

          <div className="field-pair">
            <div className="field">
              <label>Start date *</label>
              <input type="date" value={form.start} onChange={set("start")} required />
            </div>
            <div className="field">
              <label>End / delivery date</label>
              <input type="date" value={form.end} onChange={set("end")} />
            </div>
          </div>

          <div className="field">
            <label>Material cost estimate (€)</label>
            <input type="number" min="0" step="0.01" value={form.materialCost}
              onChange={set("materialCost")} placeholder="0.00" />
          </div>

          <div className="form-actions">
            <button type="button" className="btn-ghost" onClick={onClose}>Cancel</button>
            <button type="submit" className="btn-primary">Save project</button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ── New Event panel ────────────────────────────────────────────────────
function NewEventPanel({ defaultDate, onSave, onClose }) {
  const [form, setForm] = useState({
    title: "", type: "convention", start: defaultDate, end: defaultDate, notes: "",
  });
  function set(k) { return e => setForm(f => ({ ...f, [k]: e.target.value })); }

  async function handleSubmit(e) {
    e.preventDefault();
    await execute(
      `INSERT INTO events (title, event_type, start_date, end_date, notes) VALUES (?, ?, ?, ?, ?)`,
      [form.title.trim(), form.type, form.start, form.end, form.notes.trim() || null]
    );
    onSave();
  }

  return (
    <div className="overlay" onClick={onClose}>
      <div className="panel" onClick={e => e.stopPropagation()}>
        <div className="panel-header">
          <h2>New Event</h2>
          <button className="btn-icon" onClick={onClose}>✕</button>
        </div>
        <form className="sale-form" onSubmit={handleSubmit}>
          <div className="field">
            <label>Title *</label>
            <input value={form.title} onChange={set("title")} placeholder="e.g. EuroConf 2026" required autoFocus />
          </div>

          <div className="field">
            <label>Type</label>
            <select value={form.type} onChange={set("type")}>
              <option value="convention">Convention</option>
              <option value="contest">Contest</option>
              <option value="vacation">Vacation / time off</option>
              <option value="other">Other</option>
            </select>
          </div>

          <div className="field-pair">
            <div className="field">
              <label>Start date *</label>
              <input type="date" value={form.start} onChange={set("start")} required />
            </div>
            <div className="field">
              <label>End date *</label>
              <input type="date" value={form.end} onChange={set("end")} required />
            </div>
          </div>

          <div className="field">
            <label>Notes</label>
            <input value={form.notes} onChange={set("notes")} placeholder="Optional" />
          </div>

          <div className="form-actions">
            <button type="button" className="btn-ghost" onClick={onClose}>Cancel</button>
            <button type="submit" className="btn-primary">Save event</button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ── Main Calendar page ─────────────────────────────────────────────────
export default function Calendar() {
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth());
  const [projects, setProjects] = useState([]);
  const [events, setEvents] = useState([]);
  const [categories, setCategories] = useState([]);
  const [clients, setClients] = useState([]);
  const [panel, setPanel] = useState(null); // null | 'project' | 'event'
  const [selectedDate, setSelectedDate] = useState(today());
  const todayStr = today();

  useEffect(() => { loadAll(); }, []);

  async function loadAll() {
    const [ps, es, cats, cls] = await Promise.all([
      query(`SELECT p.id, p.title, p.planned_start, p.planned_end, p.sale_price_cents
             FROM projects p
             WHERE p.planned_start IS NOT NULL OR p.planned_end IS NOT NULL
             ORDER BY p.planned_start`),
      query(`SELECT id, title, event_type, start_date, end_date FROM events ORDER BY start_date`),
      query(`SELECT * FROM categories ORDER BY category, subtype`),
      query(`SELECT id, name FROM clients ORDER BY name`),
    ]);
    setProjects(ps.map(p => ({ ...p, kind: "project", start: p.planned_start, end: p.planned_end ?? p.planned_start })));
    setEvents(es.map(e => ({ ...e, kind: e.event_type === "vacation" ? "vacation" : "event", start: e.start_date, end: e.end_date })));
    setCategories(cats);
    setClients(cls);
  }

  function prevMonth() {
    if (month === 0) { setYear(y => y - 1); setMonth(11); }
    else setMonth(m => m - 1);
  }
  function nextMonth() {
    if (month === 11) { setYear(y => y + 1); setMonth(0); }
    else setMonth(m => m + 1);
  }

  const weeks = buildWeeks(year, month);
  const allItems = [...projects, ...events];

  function handleDayClick(d) {
    setSelectedDate(d);
  }

  async function handleSave() {
    setPanel(null);
    await loadAll();
  }

  return (
    <div className="page">
      <div className="page-header">
        <h1>Calendar</h1>
        <div className="header-actions">
          <button className="btn-ghost" onClick={() => { setSelectedDate(today()); setPanel("event"); }}>
            + Event
          </button>
          <button className="btn-primary" onClick={() => { setSelectedDate(today()); setPanel("project"); }}>
            + Project
          </button>
        </div>
      </div>

      {/* Month navigation */}
      <div className="cal-nav">
        <button className="btn-icon-lg" onClick={prevMonth}>‹</button>
        <span className="cal-month-label">{MONTH_NAMES[month]} {year}</span>
        <button className="btn-icon-lg" onClick={nextMonth}>›</button>
      </div>

      {/* Calendar grid */}
      <div className="cal-grid">
        {/* Weekday headers */}
        <div className="cal-header-row">
          {WEEKDAYS.map(d => (
            <div key={d} className="cal-header-cell">{d}</div>
          ))}
        </div>

        {/* Week rows */}
        {weeks.map((weekDays, wi) => {
          const lanes = buildLanes(weekDays, allItems);
          return (
            <WeekRow
              key={wi}
              weekDays={weekDays}
              lanes={lanes}
              todayStr={todayStr}
              onDayClick={d => { setSelectedDate(d); setPanel("project"); }}
            />
          );
        })}
      </div>

      {/* Legend */}
      <div className="cal-legend">
        <span className="cal-legend-item"><span className="cal-legend-dot project" />Project</span>
        <span className="cal-legend-item"><span className="cal-legend-dot event" />Event</span>
        <span className="cal-legend-item"><span className="cal-legend-dot vacation" />Vacation</span>
      </div>

      {panel === "project" && (
        <NewProjectPanel
          categories={categories}
          clients={clients}
          defaultDate={selectedDate}
          onSave={handleSave}
          onClose={() => setPanel(null)}
        />
      )}
      {panel === "event" && (
        <NewEventPanel
          defaultDate={selectedDate}
          onSave={handleSave}
          onClose={() => setPanel(null)}
        />
      )}
    </div>
  );
}
