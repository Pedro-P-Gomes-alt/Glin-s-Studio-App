import { useState, useEffect } from "react";
import { query, execute } from "../db";
import { today, toIso } from "../utils/dates";

const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const MONTH_NAMES = [
  "January","February","March","April","May","June",
  "July","August","September","October","November","December",
];

function buildWeeks(year, month) {
  const first = new Date(year, month, 1);
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const startOffset = (first.getDay() + 6) % 7;
  const days = [
    ...Array(startOffset).fill(null),
    ...Array.from({ length: daysInMonth }, (_, i) => toIso(new Date(year, month, i + 1))),
  ];
  while (days.length % 7 !== 0) days.push(null);
  const weeks = [];
  for (let i = 0; i < days.length; i += 7) weeks.push(days.slice(i, i + 7));
  return weeks;
}

function buildLanes(weekDays, items) {
  const validDays = weekDays.filter(Boolean);
  if (!validDays.length) return [];
  const weekStart = validDays[0];
  const weekEnd = validDays[validDays.length - 1];
  const active = items
    .filter(item => item.start <= weekEnd && item.end >= weekStart)
    .sort((a, b) => a.start.localeCompare(b.start));
  const firstCol = weekDays.findIndex(d => d !== null);
  const lastCol = weekDays.map((d, i) => (d ? i : -1)).filter(i => i >= 0).pop();
  function col(d) {
    const i = weekDays.indexOf(d);
    if (i >= 0) return i;
    return d < weekStart ? firstCol : lastCol;
  }
  const lanes = [];
  for (const item of active) {
    const cStart = col(item.start);
    const cEnd = col(item.end);
    const pos = { item, cStart, cEnd, startsHere: item.start >= weekStart, endsHere: item.end <= weekEnd };
    let placed = false;
    for (const lane of lanes) {
      if (lane[lane.length - 1].cEnd < cStart) { lane.push(pos); placed = true; break; }
    }
    if (!placed) lanes.push([pos]);
  }
  return lanes;
}

function DayCell({ date, isToday, isVacation, hoursLogged, deadlines, onClick }) {
  if (!date) return <div className="cal-day-cell cal-day-empty" />;
  return (
    <div
      className={[
        "cal-day-cell",
        isToday ? "is-today" : "",
        isVacation ? "is-vacation" : "",
      ].join(" ")}
      onClick={() => onClick(date)}
    >
      <div className="cal-day-top">
        <span className="cal-day-num">{parseInt(date.slice(8))}</span>
        {isVacation && <span className="cal-off-badge">off</span>}
      </div>
      <div className="cal-day-body">
        {deadlines.map(d => (
          <div key={d.id} className="cal-deadline-pill" title={d.title}>
            ⚑ {d.title}
          </div>
        ))}
        {!isVacation && hoursLogged > 0 && (
          <div className="cal-hours-dot">
            {hoursLogged % 1 === 0 ? hoursLogged : hoursLogged.toFixed(1)}h
          </div>
        )}
      </div>
    </div>
  );
}

function EventBar({ item, cStart, cEnd, startsHere, endsHere, kind, onDelete }) {
  return (
    <div
      className={[
        "cal-bar", `cal-bar--${kind}`,
        !startsHere ? "no-left-r" : "",
        !endsHere ? "no-right-r" : "",
      ].join(" ")}
      style={{ gridColumn: `${cStart + 1} / ${cEnd + 2}` }}
      title={item.title}
    >
      {startsHere && <span className="cal-bar-title">{item.title}</span>}
      <button
        className="cal-bar-delete"
        onClick={e => { e.stopPropagation(); onDelete(item.id); }}
        title="Delete"
      >✕</button>
    </div>
  );
}

function WeekRow({ weekDays, vacationEvents, nonVacationEvents, logsByDate, deadlinesByDate, todayStr, onDayClick, onDeleteEvent }) {
  const vacLanes = buildLanes(weekDays, vacationEvents);
  const evtLanes = buildLanes(weekDays, nonVacationEvents);
  return (
    <div className="cal-week">
      {vacLanes.map((lane, li) => (
        <div key={`vac-${li}`} className="cal-lane">
          {lane.map(({ item, cStart, cEnd, startsHere, endsHere }) => (
            <EventBar key={item.id} item={item} cStart={cStart} cEnd={cEnd}
              startsHere={startsHere} endsHere={endsHere}
              kind="vacation" onDelete={onDeleteEvent} />
          ))}
        </div>
      ))}
      <div className="cal-days-row">
        {weekDays.map((date, i) => {
          const isVacation = date ? vacationEvents.some(v => v.start <= date && v.end >= date) : false;
          return (
            <DayCell
              key={i}
              date={date}
              isToday={date === todayStr}
              isVacation={isVacation}
              hoursLogged={date ? (logsByDate[date] ?? 0) : 0}
              deadlines={date ? (deadlinesByDate[date] ?? []) : []}
              onClick={onDayClick}
            />
          );
        })}
      </div>
      {evtLanes.map((lane, li) => (
        <div key={`evt-${li}`} className="cal-lane">
          {lane.map(({ item, cStart, cEnd, startsHere, endsHere }) => (
            <EventBar key={item.id} item={item} cStart={cStart} cEnd={cEnd}
              startsHere={startsHere} endsHere={endsHere}
              kind="event" onDelete={onDeleteEvent} />
          ))}
        </div>
      ))}
    </div>
  );
}

// ── Day view panel ─────────────────────────────────────────────────────
function DayPanel({ date, logs, onClose }) {
  const total = logs.reduce((s, l) => s + l.hours, 0);
  const label = new Date(date + "T00:00:00").toLocaleDateString("en-GB", {
    weekday: "long", day: "numeric", month: "long", year: "numeric",
  });
  return (
    <div className="overlay" onClick={onClose}>
      <div className="panel" onClick={e => e.stopPropagation()}>
        <div className="panel-header">
          <div>
            <h2>{label}</h2>
            {total > 0 && (
              <p className="panel-subtitle">
                {total % 1 === 0 ? total : total.toFixed(2)}h logged
              </p>
            )}
          </div>
          <button className="btn-icon" onClick={onClose}>✕</button>
        </div>
        <div className="day-panel-body">
          {logs.length === 0 ? (
            <p className="empty-state">Nothing logged for this day.</p>
          ) : (
            <div className="log-list">
              {logs.map(log => (
                <div key={log.id} className="log-entry">
                  <div className="log-hours">
                    {log.hours % 1 === 0 ? log.hours : log.hours.toFixed(2)}h
                  </div>
                  <div className="log-body">
                    {log.description && <p className="log-desc">{log.description}</p>}
                    {log.project_title && (
                      <span className="log-project">{log.project_title}</span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ── New Event panel ────────────────────────────────────────────────────
function NewEventPanel({ defaultDate, onSave, onClose }) {
  const [form, setForm] = useState({ title: "", type: "convention", start: defaultDate, end: defaultDate, notes: "" });
  function set(k) { return e => setForm(f => ({ ...f, [k]: e.target.value })); }
  async function handleSubmit(e) {
    e.preventDefault();
    await execute(`INSERT INTO events (title, event_type, start_date, end_date, notes) VALUES (?, ?, ?, ?, ?)`,
      [form.title.trim(), form.type, form.start, form.end, form.notes.trim() || null]);
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
            <div className="field"><label>Start date *</label><input type="date" value={form.start} onChange={set("start")} required /></div>
            <div className="field"><label>End date *</label><input type="date" value={form.end} onChange={set("end")} required /></div>
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

// ── Main ───────────────────────────────────────────────────────────────
export default function Calendar() {
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth());
  const [vacationEvents, setVacationEvents] = useState([]);
  const [nonVacationEvents, setNonVacationEvents] = useState([]);
  const [logsByDate, setLogsByDate] = useState({});
  const [deadlinesByDate, setDeadlinesByDate] = useState({});
  const [showEventForm, setShowEventForm] = useState(false);
  const [eventDate, setEventDate] = useState(today());
  const [dayDate, setDayDate] = useState(null);
  const [dayLogs, setDayLogs] = useState([]);
  const todayStr = today();

  useEffect(() => { loadAll(); }, []);

  async function loadAll() {
    const [events, logs, projects] = await Promise.all([
      query(`SELECT id, title, event_type, start_date AS start, end_date AS end FROM events ORDER BY start_date`),
      query(`SELECT date, SUM(hours) AS total FROM time_logs GROUP BY date`),
      query(`SELECT id, title, planned_end FROM projects WHERE planned_end IS NOT NULL`),
    ]);
    setVacationEvents(events.filter(e => e.event_type === "vacation"));
    setNonVacationEvents(events.filter(e => e.event_type !== "vacation"));
    const lbd = {};
    for (const l of logs) lbd[l.date] = l.total;
    setLogsByDate(lbd);
    const dbd = {};
    for (const p of projects) {
      if (!dbd[p.planned_end]) dbd[p.planned_end] = [];
      dbd[p.planned_end].push(p);
    }
    setDeadlinesByDate(dbd);
  }

  async function handleDayClick(date) {
    const logs = await query(
      `SELECT tl.id, tl.hours, tl.description, p.title AS project_title
       FROM time_logs tl
       LEFT JOIN projects p ON tl.project_id = p.id
       WHERE tl.date = ?
       ORDER BY tl.id ASC`,
      [date]
    );
    setDayLogs(logs);
    setDayDate(date);
  }

  async function deleteEvent(id) {
    await execute(`DELETE FROM events WHERE id = ?`, [id]);
    await loadAll();
  }

  function prevMonth() { month === 0 ? (setYear(y => y - 1), setMonth(11)) : setMonth(m => m - 1); }
  function nextMonth() { month === 11 ? (setYear(y => y + 1), setMonth(0)) : setMonth(m => m + 1); }

  const weeks = buildWeeks(year, month);

  return (
    <div className="page">
      <div className="page-header">
        <h1>Calendar</h1>
        <button className="btn-ghost" onClick={() => { setEventDate(todayStr); setShowEventForm(true); }}>
          + Event
        </button>
      </div>

      <div className="cal-nav">
        <button className="btn-icon-lg" onClick={prevMonth}>‹</button>
        <span className="cal-month-label">{MONTH_NAMES[month]} {year}</span>
        <button className="btn-icon-lg" onClick={nextMonth}>›</button>
      </div>

      <div className="cal-grid">
        <div className="cal-header-row">
          {WEEKDAYS.map(d => <div key={d} className="cal-header-cell">{d}</div>)}
        </div>
        {weeks.map((weekDays, wi) => (
          <WeekRow
            key={wi}
            weekDays={weekDays}
            vacationEvents={vacationEvents}
            nonVacationEvents={nonVacationEvents}
            logsByDate={logsByDate}
            deadlinesByDate={deadlinesByDate}
            todayStr={todayStr}
            onDayClick={handleDayClick}
            onDeleteEvent={deleteEvent}
          />
        ))}
      </div>

      <div className="cal-legend">
        <span className="cal-legend-item"><span className="cal-legend-dot event" />Event / Convention</span>
        <span className="cal-legend-item"><span className="cal-legend-dot timelog" />Time logged</span>
        <span className="cal-legend-item"><span className="cal-legend-dot deadline" />Project deadline</span>
        <span className="cal-legend-item"><span className="cal-legend-dot vacation" />Time off</span>
      </div>

      {dayDate && (
        <DayPanel date={dayDate} logs={dayLogs} onClose={() => setDayDate(null)} />
      )}

      {showEventForm && (
        <NewEventPanel
          defaultDate={eventDate}
          onSave={async () => { setShowEventForm(false); await loadAll(); }}
          onClose={() => setShowEventForm(false)}
        />
      )}
    </div>
  );
}
