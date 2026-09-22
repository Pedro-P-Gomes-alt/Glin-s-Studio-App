import { useState, useEffect } from "react";
import { query, execute } from "../db";
import { today, addDays, formatLong } from "../utils/dates";

const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const MONTH_NAMES = [
  "January","February","March","April","May","June",
  "July","August","September","October","November","December",
];

// Month view is a fixed-size grid: anything that doesn't fit is collapsed into
// a "+N more" chip that opens the day panel. The grid never grows or reflows.
const MAX_MONTH_LANES = 2;   // spanning event bars shown per week row
const MAX_MONTH_CHIPS = 3;   // in-cell chips (deadlines + reminders) per day

function mondayOf(iso) {
  const d = new Date(iso + "T00:00:00");
  return addDays(iso, -((d.getDay() + 6) % 7));
}

function buildMonthWeeks(year, month) {
  const first = new Date(year, month, 1);
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const startOffset = (first.getDay() + 6) % 7;
  // Build ISO strings from local components — `new Date(...).toISOString()` is UTC
  // and shifts the day back by one in positive-offset (e.g. summer/DST) timezones.
  const mm = String(month + 1).padStart(2, "0");
  const inMonth = Array.from({ length: daysInMonth }, (_, i) =>
    `${year}-${mm}-${String(i + 1).padStart(2, "0")}`);
  // Pad with the neighbouring months' days rather than blanks: every week row
  // is then a full 7 columns, so spanning bars never have to clamp to a hole.
  const days = [
    ...Array.from({ length: startOffset }, (_, i) => addDays(inMonth[0], i - startOffset)),
    ...inMonth,
  ];
  while (days.length % 7 !== 0) days.push(addDays(days[days.length - 1], 1));
  const weeks = [];
  for (let i = 0; i < days.length; i += 7) weeks.push(days.slice(i, i + 7));
  return weeks;
}

function buildWeekDays(anchorIso) {
  const start = mondayOf(anchorIso);
  return Array.from({ length: 7 }, (_, i) => addDays(start, i));
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

function DayCell({ date, isToday, isOtherMonth, isVacation, hoursLogged, deadlines, reminders,
                  expanded, onClick, onToggleReminder, onDeleteReminder }) {
  if (!date) return <div className="cal-day-cell cal-day-empty" />;

  const chips = [
    ...deadlines.map(d => ({ kind: "deadline", key: `d${d.id}`, item: d })),
    ...reminders.map(r => ({ kind: "reminder", key: `r${r.id}`, item: r })),
  ];
  // In the month grid only a fixed number of chips fit; the rest collapse.
  const overflow = expanded ? 0 : Math.max(0, chips.length - MAX_MONTH_CHIPS);
  const shown = overflow > 0 ? chips.slice(0, MAX_MONTH_CHIPS - 1) : chips;

  return (
    <div
      className={[
        "cal-day-cell",
        isToday ? "is-today" : "",
        isVacation ? "is-vacation" : "",
        isOtherMonth ? "is-other-month" : "",
      ].join(" ")}
      onClick={() => onClick(date)}
    >
      <div className="cal-day-top">
        <span className="cal-day-num">{parseInt(date.slice(8))}</span>
        <span className="cal-day-top-right">
          {!isVacation && hoursLogged > 0 && (
            <span className="cal-hours-dot">
              {hoursLogged % 1 === 0 ? hoursLogged : hoursLogged.toFixed(1)}h
            </span>
          )}
          {isVacation && <span className="cal-off-badge">off</span>}
        </span>
      </div>
      <div className="cal-day-body">
        {shown.map(c => c.kind === "deadline" ? (
          <div key={c.key} className="cal-chip cal-chip--deadline" title={c.item.title}>
            <span className="cal-chip-text">⚑ {c.item.title}</span>
          </div>
        ) : (
          <div key={c.key}
            className={`cal-chip cal-chip--reminder${c.item.done ? " is-done" : ""}`}
            title={c.item.title}>
            <button className="cal-chip-btn"
              onClick={e => { e.stopPropagation(); onToggleReminder(c.item); }}
              title={c.item.done ? "Mark not done" : "Mark done"}>
              {c.item.done ? "☑" : "☐"}
            </button>
            <span className="cal-chip-text">{c.item.title}</span>
            <button className="cal-chip-btn cal-chip-del"
              onClick={e => { e.stopPropagation(); onDeleteReminder(c.item.id); }}
              title="Delete">✕</button>
          </div>
        ))}
        {overflow > 0 && (
          <div className="cal-chip cal-chip--more">+{overflow} more</div>
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
      <span className="cal-bar-title">{startsHere ? item.title : " "}</span>
      <button
        className="cal-bar-delete"
        onClick={e => { e.stopPropagation(); onDelete(item.id); }}
        title="Delete"
      >✕</button>
    </div>
  );
}

function WeekRow({ weekDays, monthIndex, vacationEvents, nonVacationEvents, logsByDate,
                  deadlinesByDate, remindersByDate, todayStr, expanded,
                  onDayClick, onDeleteEvent, onToggleReminder, onDeleteReminder }) {
  // Vacations first, then everything else — one lane stack, so a week row's
  // height only depends on the lane count, never on the text inside a bar.
  const allLanes = [
    ...buildLanes(weekDays, vacationEvents).map(l => ({ lane: l, kind: "vacation" })),
    ...buildLanes(weekDays, nonVacationEvents).map(l => ({ lane: l, kind: "event" })),
  ];
  const laneCap = expanded ? allLanes.length : MAX_MONTH_LANES;
  const visibleLanes = allLanes.slice(0, laneCap);
  const hiddenLanes = allLanes.length - visibleLanes.length;

  return (
    <div className={`cal-week${expanded ? " is-expanded" : ""}`}>
      <div className="cal-lanes">
        {visibleLanes.map(({ lane, kind }, li) => (
          <div key={li} className="cal-lane">
            {lane.map(({ item, cStart, cEnd, startsHere, endsHere }) => (
              <EventBar key={item.id} item={item} cStart={cStart} cEnd={cEnd}
                startsHere={startsHere} endsHere={endsHere}
                kind={kind} onDelete={onDeleteEvent} />
            ))}
          </div>
        ))}
        {hiddenLanes > 0 && (
          <div className="cal-lane-more">+{hiddenLanes} more event{hiddenLanes > 1 ? "s" : ""}</div>
        )}
      </div>
      <div className="cal-days-row">
        {weekDays.map((date, i) => {
          const isVacation = date ? vacationEvents.some(v => v.start <= date && v.end >= date) : false;
          return (
            <DayCell
              key={i}
              date={date}
              isToday={date === todayStr}
              isOtherMonth={!!date && monthIndex != null &&
                            parseInt(date.slice(5, 7), 10) - 1 !== monthIndex}
              isVacation={isVacation}
              hoursLogged={date ? (logsByDate[date] ?? 0) : 0}
              deadlines={date ? (deadlinesByDate[date] ?? []) : []}
              reminders={date ? (remindersByDate[date] ?? []) : []}
              expanded={expanded}
              onClick={onDayClick}
              onToggleReminder={onToggleReminder}
              onDeleteReminder={onDeleteReminder}
            />
          );
        })}
      </div>
    </div>
  );
}

// ── Day view panel ─────────────────────────────────────────────────────
function DayPanel({ date, logs, events, deadlines, reminders,
                   onToggleReminder, onDeleteReminder, onClose }) {
  const total = logs.reduce((s, l) => s + l.hours, 0);
  const empty = !logs.length && !events.length && !deadlines.length && !reminders.length;
  return (
    <div className="overlay" onClick={onClose}>
      <div className="panel" onClick={e => e.stopPropagation()}>
        <div className="panel-header">
          <div>
            <h2>{formatLong(date)}</h2>
            {total > 0 && (
              <p className="panel-subtitle">
                {total % 1 === 0 ? total : total.toFixed(2)}h logged
              </p>
            )}
          </div>
          <button className="btn-icon" onClick={onClose}>✕</button>
        </div>
        <div className="day-panel-body">
          {empty && <p className="empty-state">Nothing on this day.</p>}

          {events.length > 0 && (
            <div className="day-panel-section">
              <div className="day-panel-section-title">Events</div>
              {events.map(e => (
                <div key={e.id} className="day-panel-row">
                  <span className={`cal-legend-dot ${e.event_type === "vacation" ? "vacation" : "event"}`} />
                  <span className="day-panel-row-text">{e.title}</span>
                  <span className="day-panel-row-meta">{e.event_type}</span>
                </div>
              ))}
            </div>
          )}

          {deadlines.length > 0 && (
            <div className="day-panel-section">
              <div className="day-panel-section-title">Deadlines</div>
              {deadlines.map(d => (
                <div key={d.id} className="day-panel-row">
                  <span className="cal-legend-dot deadline" />
                  <span className="day-panel-row-text">{d.title}</span>
                </div>
              ))}
            </div>
          )}

          {reminders.length > 0 && (
            <div className="day-panel-section">
              <div className="day-panel-section-title">Reminders</div>
              {reminders.map(r => (
                <div key={r.id} className="day-panel-row">
                  <button className="btn-icon" onClick={() => onToggleReminder(r)}
                    title={r.done ? "Mark not done" : "Mark done"}>
                    {r.done ? "☑" : "☐"}
                  </button>
                  <span className={`day-panel-row-text${r.done ? " is-done" : ""}`}>{r.title}</span>
                  <button className="btn-icon" onClick={() => onDeleteReminder(r.id)} title="Delete">✕</button>
                </div>
              ))}
            </div>
          )}

          {logs.length > 0 && (
            <div className="day-panel-section">
              <div className="day-panel-section-title">Time logged</div>
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

// ── New Reminder panel ─────────────────────────────────────────────────
function NewReminderPanel({ defaultDate, onSave, onClose }) {
  const [title, setTitle] = useState("");
  const [date, setDate] = useState(defaultDate);
  async function handleSubmit(e) {
    e.preventDefault();
    if (!title.trim()) return;
    await execute(`INSERT INTO reminders (title, remind_on) VALUES (?, ?)`, [title.trim(), date]);
    onSave();
  }
  return (
    <div className="overlay" onClick={onClose}>
      <div className="panel" onClick={e => e.stopPropagation()}>
        <div className="panel-header">
          <h2>New Reminder</h2>
          <button className="btn-icon" onClick={onClose}>✕</button>
        </div>
        <form className="sale-form" onSubmit={handleSubmit}>
          <div className="field">
            <label>Reminder *</label>
            <input value={title} onChange={e => setTitle(e.target.value)}
              placeholder="e.g. Upload the EuroConf vlog" required autoFocus />
          </div>
          <div className="field">
            <label>Date *</label>
            <input type="date" value={date} onChange={e => setDate(e.target.value)} required />
          </div>
          <div className="form-actions">
            <button type="button" className="btn-ghost" onClick={onClose}>Cancel</button>
            <button type="submit" className="btn-primary">Save reminder</button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ── Main ───────────────────────────────────────────────────────────────
export default function Calendar() {
  const todayStr = today();
  const [view, setView] = useState("month");       // "month" | "week"
  const [anchor, setAnchor] = useState(todayStr);  // any day inside the shown range
  const [allEvents, setAllEvents] = useState([]);
  const [vacationEvents, setVacationEvents] = useState([]);
  const [nonVacationEvents, setNonVacationEvents] = useState([]);
  const [logsByDate, setLogsByDate] = useState({});
  const [deadlinesByDate, setDeadlinesByDate] = useState({});
  const [remindersByDate, setRemindersByDate] = useState({});
  const [showEventForm, setShowEventForm] = useState(false);
  const [showReminderForm, setShowReminderForm] = useState(false);
  const [eventDate, setEventDate] = useState(todayStr);
  const [dayDate, setDayDate] = useState(null);
  const [dayLogs, setDayLogs] = useState([]);

  const year = parseInt(anchor.slice(0, 4), 10);
  const month = parseInt(anchor.slice(5, 7), 10) - 1;

  useEffect(() => { loadAll(); }, []);

  async function loadAll() {
    const [events, logs, projects, reminders] = await Promise.all([
      query(`SELECT id, title, event_type, start_date AS start, end_date AS end FROM events ORDER BY start_date`),
      query(`SELECT date, SUM(hours) AS total FROM time_logs GROUP BY date`),
      query(`SELECT id, title, planned_end FROM projects WHERE planned_end IS NOT NULL`),
      query(`SELECT id, title, remind_on, done FROM reminders ORDER BY id`),
    ]);
    setAllEvents(events);
    setVacationEvents(events.filter(e => e.event_type === "vacation"));
    setNonVacationEvents(events.filter(e => e.event_type !== "vacation"));
    const lbd = {};
    for (const l of logs) lbd[l.date] = l.total;
    setLogsByDate(lbd);
    const dbd = {};
    for (const p of projects) (dbd[p.planned_end] ||= []).push(p);
    setDeadlinesByDate(dbd);
    const rbd = {};
    for (const r of reminders) (rbd[r.remind_on] ||= []).push(r);
    setRemindersByDate(rbd);
  }

  async function toggleReminder(r) {
    await execute(`UPDATE reminders SET done = ? WHERE id = ?`, [r.done ? 0 : 1, r.id]);
    await loadAll();
  }

  async function deleteReminder(id) {
    await execute(`DELETE FROM reminders WHERE id = ?`, [id]);
    await loadAll();
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

  function step(dir) {
    if (view === "week") { setAnchor(a => addDays(a, dir * 7)); return; }
    const d = new Date(year, month + dir, 1);
    setAnchor(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-01`);
  }

  const weeks = view === "month"
    ? buildMonthWeeks(year, month)
    : [buildWeekDays(anchor)];

  const label = view === "month"
    ? `${MONTH_NAMES[month]} ${year}`
    : (() => {
        const days = buildWeekDays(anchor);
        const a = new Date(days[0] + "T00:00:00");
        const b = new Date(days[6] + "T00:00:00");
        const opts = { day: "numeric", month: "short" };
        return `${a.toLocaleDateString("en-GB", opts)} – ${b.toLocaleDateString("en-GB", opts)} ${b.getFullYear()}`;
      })();

  return (
    <div className="page">
      <div className="page-header">
        <h1>Calendar</h1>
        <div className="header-actions">
          <button className="btn-ghost" onClick={() => { setEventDate(todayStr); setShowReminderForm(true); }}>
            + Reminder
          </button>
          <button className="btn-ghost" onClick={() => { setEventDate(todayStr); setShowEventForm(true); }}>
            + Event
          </button>
        </div>
      </div>

      <div className="cal-nav">
        <button className="btn-icon-lg" onClick={() => step(-1)}>‹</button>
        <span className="cal-month-label">{label}</span>
        <button className="btn-icon-lg" onClick={() => step(1)}>›</button>
        <button className="btn-ghost sm" onClick={() => setAnchor(todayStr)}>Today</button>
        <div className="cal-view-toggle">
          {["month", "week"].map(v => (
            <button key={v}
              className={`cal-view-btn${view === v ? " active" : ""}`}
              onClick={() => setView(v)}>
              {v === "month" ? "Month" : "Week"}
            </button>
          ))}
        </div>
      </div>

      <div className="cal-grid">
        <div className="cal-header-row">
          {WEEKDAYS.map(d => <div key={d} className="cal-header-cell">{d}</div>)}
        </div>
        {weeks.map((weekDays, wi) => (
          <WeekRow
            key={wi}
            weekDays={weekDays}
            monthIndex={view === "month" ? month : null}
            vacationEvents={vacationEvents}
            nonVacationEvents={nonVacationEvents}
            logsByDate={logsByDate}
            deadlinesByDate={deadlinesByDate}
            remindersByDate={remindersByDate}
            todayStr={todayStr}
            expanded={view === "week"}
            onDayClick={handleDayClick}
            onDeleteEvent={deleteEvent}
            onToggleReminder={toggleReminder}
            onDeleteReminder={deleteReminder}
          />
        ))}
      </div>

      <div className="cal-legend">
        <span className="cal-legend-item"><span className="cal-legend-dot event" />Event / Convention</span>
        <span className="cal-legend-item"><span className="cal-legend-dot timelog" />Time logged</span>
        <span className="cal-legend-item"><span className="cal-legend-dot deadline" />Project deadline</span>
        <span className="cal-legend-item"><span className="cal-legend-dot reminder" />Reminder</span>
        <span className="cal-legend-item"><span className="cal-legend-dot vacation" />Time off</span>
      </div>

      {dayDate && (
        <DayPanel
          date={dayDate}
          logs={dayLogs}
          events={allEvents.filter(e => e.start <= dayDate && e.end >= dayDate)}
          deadlines={deadlinesByDate[dayDate] ?? []}
          reminders={remindersByDate[dayDate] ?? []}
          onToggleReminder={toggleReminder}
          onDeleteReminder={deleteReminder}
          onClose={() => setDayDate(null)}
        />
      )}

      {showEventForm && (
        <NewEventPanel
          defaultDate={eventDate}
          onSave={async () => { setShowEventForm(false); await loadAll(); }}
          onClose={() => setShowEventForm(false)}
        />
      )}

      {showReminderForm && (
        <NewReminderPanel
          defaultDate={eventDate}
          onSave={async () => { setShowReminderForm(false); await loadAll(); }}
          onClose={() => setShowReminderForm(false)}
        />
      )}
    </div>
  );
}
