import { useState, useEffect, useRef } from "react";
import { check } from "@tauri-apps/plugin-updater";
import { relaunch } from "@tauri-apps/plugin-process";
import { getVersion } from "@tauri-apps/api/app";
import "./App.css";
import Dashboard from "./pages/Dashboard";
import Sales from "./pages/Sales";
import Projects from "./pages/Projects";
import Timekeeping from "./pages/Timekeeping";
import Calendar from "./pages/Calendar";
import Board from "./pages/Board";
import Clients from "./pages/Clients";
import Quotes from "./pages/Quotes";
import Todo from "./pages/Todo";
import { query, execute } from "./db";

// ── Font settings ──────────────────────────────────────────────────────
const FONT_SIZES    = { compact: "13px", default: "15px", comfortable: "17px" };
const FONT_FAMILIES = {
  system: "'Inter', system-ui, -apple-system, 'Segoe UI', sans-serif",
  segoe:  "'Segoe UI', system-ui, sans-serif",
  serif:  "'Fraunces', Georgia, 'Times New Roman', serif",
  mono:   "'Cascadia Code', Consolas, 'Courier New', monospace",
};
const FONT_FAMILY_LABELS = {
  system: "Inter (default)", segoe: "Segoe UI (Windows)", serif: "Fraunces (serif)", mono: "Monospace",
};

const DEFAULT_SETTINGS      = { fontSize: "default", fontFamily: "system" };
const DEFAULT_QUOTES_CONFIG = { scriptUrl: "", token: "" };

// ── What's new ──────────────────────────────────────────────────────────
// Shown once after the app updates to a new version. Refresh this list each
// release so Glin sees what changed. The popup fires whenever the running
// version differs from the last one she dismissed (stored in localStorage).
const WHATS_NEW = [
  { title: "Invoice on every shipped order",
    body: "Mark an order as shipped and a quick invoice pops up — materials, hours, what you billed for your time, and what was paid." },
  { title: "Orders must be paid before shipping",
    body: "If there's still an unpaid balance, the app reminds you to record the payment before it lets you ship." },
  { title: "Order history moved to Commissions",
    body: "Finished orders now live behind the “History” button next to “New Order”. Click any order to see its invoice again." },
  { title: "“Unpaid” instead of “Outstanding”",
    body: "Clearer wording for money still owed on an order." },
];

function ls(key, def) {
  try { const r = localStorage.getItem(key); return r ? { ...def, ...JSON.parse(r) } : def; }
  catch { return def; }
}

// ── Settings panel ─────────────────────────────────────────────────────
function SettingsPanel({ settings, quotesConfig,
                         onChangeSettings, onChangeQuotes, onClose }) {

  function setFont(k, v)  { const n = { ...settings, [k]: v };        onChangeSettings(n); localStorage.setItem("glins_settings", JSON.stringify(n)); }
  function setQuote(k, v) { const n = { ...quotesConfig, [k]: v };    onChangeQuotes(n);   localStorage.setItem("glins_quotes_config", JSON.stringify(n)); }

  const [cats, setCats] = useState([]);
  const [newSub, setNewSub] = useState({ cosplay: "", sports: "" });

  useEffect(() => {
    query("SELECT * FROM categories ORDER BY category, sort_order, id").then(setCats);
  }, []);

  async function moveCat(cat, dir) {
    const group = cats
      .filter(c => c.category === cat.category)
      .sort((a, b) => a.sort_order - b.sort_order || a.id - b.id);
    const idx = group.findIndex(c => c.id === cat.id);
    const neighbour = group[idx + dir];
    if (!neighbour) return;
    await execute("UPDATE categories SET sort_order = ? WHERE id = ?", [neighbour.sort_order, cat.id]);
    await execute("UPDATE categories SET sort_order = ? WHERE id = ?", [cat.sort_order, neighbour.id]);
    setCats(await query("SELECT * FROM categories ORDER BY category, sort_order, id"));
  }

  async function addSubtype(category) {
    const name = newSub[category].trim();
    if (!name) return;
    const maxOrder = cats.filter(c => c.category === category)
      .reduce((m, c) => Math.max(m, c.sort_order), 0);
    await execute(
      "INSERT OR IGNORE INTO categories (category, subtype, sort_order) VALUES (?, ?, ?)",
      [category, name, maxOrder + 1]
    );
    setNewSub(s => ({ ...s, [category]: "" }));
    setCats(await query("SELECT * FROM categories ORDER BY category, sort_order, id"));
  }

  async function deleteSubtype(cat) {
    const rows = await query("SELECT COUNT(*) AS n FROM projects WHERE category_id = ?", [cat.id]);
    if (rows[0].n > 0) {
      alert(`"${cat.subtype}" is used by ${rows[0].n} project(s) and cannot be deleted.`);
      return;
    }
    await execute("DELETE FROM categories WHERE id = ?", [cat.id]);
    setCats(prev => prev.filter(c => c.id !== cat.id));
  }

  return (
    <div className="overlay" onClick={onClose}>
      <div className="panel" style={{ maxWidth: 520 }} onClick={e => e.stopPropagation()}>
        <div className="panel-header">
          <h2>Settings</h2>
          <button className="btn-icon" onClick={onClose}>✕</button>
        </div>

        <div className="settings-body">
          {/* Font size */}
          <div className="settings-section">
            <div className="settings-section-title">Font size</div>
            <div className="settings-options">
              {Object.keys(FONT_SIZES).map(k => (
                <button key={k} className={`settings-option${settings.fontSize === k ? " active" : ""}`}
                  onClick={() => setFont("fontSize", k)}>
                  {k.charAt(0).toUpperCase() + k.slice(1)}
                </button>
              ))}
            </div>
            <p className="settings-hint">Scales all text in the app.</p>
          </div>

          {/* Font family */}
          <div className="settings-section">
            <div className="settings-section-title">Font style</div>
            <div className="settings-options col">
              {Object.keys(FONT_FAMILIES).map(k => (
                <button key={k}
                  className={`settings-option font-preview${settings.fontFamily === k ? " active" : ""}`}
                  style={{ fontFamily: FONT_FAMILIES[k] }}
                  onClick={() => setFont("fontFamily", k)}>
                  {FONT_FAMILY_LABELS[k]}
                  <span className="settings-option-sample">Aa Bb 1234</span>
                </button>
              ))}
            </div>
          </div>

          {/* Categories */}
          <div className="settings-section">
            <div className="settings-section-title">Categories &amp; Subtypes</div>
            <p className="settings-hint" style={{ marginBottom: 12 }}>
              Reorder or add subtypes shown in the dropdown when creating an order.
            </p>
            {["cosplay", "sports"].map(cat => {
              const group = cats
                .filter(c => c.category === cat)
                .sort((a, b) => a.sort_order - b.sort_order || a.id - b.id);
              return (
                <div key={cat} style={{ marginBottom: 16 }}>
                  <div style={{ fontWeight: 600, fontSize: "0.8em", textTransform: "uppercase",
                                letterSpacing: "0.06em", opacity: 0.5, marginBottom: 6 }}>
                    {cat}
                  </div>
                  {group.map((c, i) => (
                    <div key={c.id} style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 3 }}>
                      <span style={{ flex: 1 }}>{c.subtype}</span>
                      <button className="btn-icon" onClick={() => moveCat(c, -1)} disabled={i === 0} title="Move up">↑</button>
                      <button className="btn-icon" onClick={() => moveCat(c, 1)} disabled={i === group.length - 1} title="Move down">↓</button>
                      <button className="btn-icon" onClick={() => deleteSubtype(c)} title="Delete">✕</button>
                    </div>
                  ))}
                  <div style={{ display: "flex", gap: 6, marginTop: 8 }}>
                    <input
                      style={{ flex: 1 }}
                      value={newSub[cat]}
                      placeholder={`New ${cat} subtype…`}
                      onChange={e => setNewSub(s => ({ ...s, [cat]: e.target.value }))}
                      onKeyDown={e => { if (e.key === "Enter") { e.preventDefault(); addSubtype(cat); } }}
                    />
                    <button className="btn-ghost sm" onClick={() => addSubtype(cat)}>+ Add</button>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Quotes */}
          <div className="settings-section">
            <div className="settings-section-title">Quotes — Google Sheets</div>
            <p className="settings-hint" style={{ marginBottom: 8 }}>See Quotes tab for setup instructions.</p>
            <div className="field">
              <label>Apps Script URL</label>
              <input type="url" value={quotesConfig.scriptUrl}
                onChange={e => setQuote("scriptUrl", e.target.value)}
                placeholder="https://script.google.com/macros/s/…/exec" />
            </div>
            <div className="field" style={{ marginTop: 8 }}>
              <label>Secret token</label>
              <input type="password" value={quotesConfig.token}
                onChange={e => setQuote("token", e.target.value)}
                placeholder="Passphrase from your script" />
            </div>
          </div>

        </div>
      </div>
    </div>
  );
}

// ── New-quote popup (must be dismissed) ─────────────────────────────────
function QuoteAlert({ count, onView, onDismiss }) {
  return (
    <div className="dialog-overlay quote-alert-overlay">
      <div className="dialog quote-alert" onClick={e => e.stopPropagation()}>
        <div className="quote-alert-icon">📨</div>
        <h3 className="quote-alert-title">
          {count === 1 ? "New quote request!" : `${count} new quote requests!`}
        </h3>
        <p className="quote-alert-sub">
          {count === 1
            ? "Someone just filled in your commission form."
            : "New responses came in from your commission form."}
        </p>
        <div className="form-actions quote-alert-actions">
          <button className="btn-ghost" onClick={onDismiss}>Dismiss</button>
          <button className="btn-primary" onClick={onView}>View quotes</button>
        </div>
      </div>
    </div>
  );
}

// ── What's-new popup (shown once per new version) ───────────────────────
function WhatsNewDialog({ version, items, onClose }) {
  return (
    <div className="dialog-overlay" onClick={onClose}>
      <div className="dialog whats-new" onClick={e => e.stopPropagation()}>
        <div className="dialog-header">
          <h3 className="dialog-title">What's new{version ? ` · v${version}` : ""}</h3>
          <button className="btn-icon" onClick={onClose}>✕</button>
        </div>
        <p className="dialog-sub">Here's what changed in this update.</p>
        <ul className="whats-new-list">
          {items.map((it, i) => (
            <li key={i} className="whats-new-item">
              <div className="whats-new-item-title">{it.title}</div>
              <div className="whats-new-item-body">{it.body}</div>
            </li>
          ))}
        </ul>
        <div className="form-actions" style={{ marginTop: 4 }}>
          <button type="button" className="btn-primary" onClick={onClose}>Got it</button>
        </div>
      </div>
    </div>
  );
}

// ── App ────────────────────────────────────────────────────────────────
export default function App() {
  const [page, setPage]               = useState("dashboard");
  const [settings, setSettings]       = useState(() => ls("glins_settings", DEFAULT_SETTINGS));
  const [quotesConfig, setQuotesConfig] = useState(() => ls("glins_quotes_config", DEFAULT_QUOTES_CONFIG));
  const [showSettings, setShowSettings] = useState(false);
  const [unseenQuotes, setUnseenQuotes] = useState(0);
  const [toast, setToast]             = useState(null);
  const [whatsNew, setWhatsNew]       = useState(null); // version string when popup should show
  const quotePollRef = useRef(null);

  // Check for app updates once on startup
  useEffect(() => {
    check().then(update => {
      if (!update) return;
      if (window.confirm(`Version ${update.version} is available.\n\nInstall now? The app will restart automatically.`)) {
        update.downloadAndInstall().then(() => relaunch()).catch(console.error);
      }
    }).catch(() => {});
  }, []);

  // Show "What's new" once after an update bumps the running version
  useEffect(() => {
    getVersion().then(v => {
      if (localStorage.getItem("glins_seen_version") !== v) setWhatsNew(v);
    }).catch(() => {});
  }, []);

  function dismissWhatsNew() {
    if (whatsNew) localStorage.setItem("glins_seen_version", whatsNew);
    setWhatsNew(null);
  }

  // Apply font settings
  useEffect(() => {
    document.documentElement.style.fontSize   = FONT_SIZES[settings.fontSize]   ?? FONT_SIZES.default;
    document.documentElement.style.fontFamily = FONT_FAMILIES[settings.fontFamily] ?? FONT_FAMILIES.system;
  }, [settings]);

  // Quotes: load unseen on start
  useEffect(() => { refreshUnseenCount(); }, []);

  // Quotes: poll hourly
  useEffect(() => {
    if (quotePollRef.current) clearInterval(quotePollRef.current);
    if (!quotesConfig.scriptUrl || !quotesConfig.token) return;
    fetchAndStoreQuotes();
    quotePollRef.current = setInterval(fetchAndStoreQuotes, 60 * 60 * 1000);
    return () => clearInterval(quotePollRef.current);
  }, [quotesConfig.scriptUrl, quotesConfig.token]);

  // ── Quotes helpers ─────────────────────────────────────────────────
  async function refreshUnseenCount() {
    try {
      const rows = await query(`SELECT COUNT(*) AS cnt FROM quotes WHERE seen = 0`);
      setUnseenQuotes(rows[0]?.cnt ?? 0);
    } catch {}
  }

  async function fetchAndStoreQuotes() {
    if (!quotesConfig.scriptUrl || !quotesConfig.token) return;
    try {
      const url = `${quotesConfig.scriptUrl}?token=${encodeURIComponent(quotesConfig.token)}`;
      const res = await fetch(url);
      if (!res.ok) return;
      const data = await res.json();
      if (!Array.isArray(data.rows)) return;
      const before = await query(`SELECT COUNT(*) AS cnt FROM quotes`);
      for (const row of data.rows) {
        const sourceId    = String(row.Timestamp ?? row._row ?? Math.random());
        const submittedAt = row.Timestamp ? new Date(row.Timestamp).toISOString() : null;
        try { await execute(`INSERT OR IGNORE INTO quotes (source_id, submitted_at, data) VALUES (?, ?, ?)`,
          [sourceId, submittedAt, JSON.stringify(row)]); } catch {}
      }
      const after = await query(`SELECT COUNT(*) AS cnt FROM quotes`);
      const newCount = (after[0]?.cnt ?? 0) - (before[0]?.cnt ?? 0);
      if (newCount > 0) setToast(newCount);
      await refreshUnseenCount();
    } catch (err) { console.warn("Quotes fetch failed:", err); }
  }

  const NAV = [
    { id: "dashboard",   label: "Dashboard" },
    { id: "sales",       label: "Commissions" },
    { id: "projects",    label: "Projects" },
    { id: "timekeeping", label: "Timekeeping" },
    { id: "calendar",    label: "Calendar" },
    { id: "board",       label: "Board" },
    { id: "clients",     label: "Clients" },
    { id: "quotes",      label: "Quotes", badge: unseenQuotes > 0 ? unseenQuotes : null },
    { id: "todo",        label: "To-Do" },
  ];

  return (
    <div className="layout">
      <nav className="sidebar">
        <div className="sidebar-brand">
          <span className="sidebar-brand-name">glin</span>
          <span className="sidebar-brand-sub">studio</span>
        </div>
        <ul>
          {NAV.map(n => (
            <li key={n.id}>
              <button className={page === n.id ? "active" : ""} onClick={() => setPage(n.id)}>
                {n.label}
                {n.badge && <span className="nav-badge">{n.badge}</span>}
              </button>
            </li>
          ))}
        </ul>
        <button className="sidebar-settings-btn" onClick={() => setShowSettings(true)}>⚙ Settings</button>
      </nav>

      <main className="content">
        {page === "dashboard"   && <Dashboard />}
        {page === "sales"       && <Sales />}
        {page === "projects"    && <Projects />}
        {page === "timekeeping" && <Timekeeping />}
        {page === "calendar"    && <Calendar />}
        {page === "board"       && <Board />}
        {page === "clients"     && <Clients />}
        {page === "quotes"      && <Quotes config={quotesConfig} onUnseenChange={setUnseenQuotes} onRefresh={fetchAndStoreQuotes} />}
        {page === "todo"        && <Todo />}
      </main>

      {whatsNew && (
        <WhatsNewDialog version={whatsNew} items={WHATS_NEW} onClose={dismissWhatsNew} />
      )}

      {toast && (
        <QuoteAlert
          count={toast}
          onView={() => { setPage("quotes"); setToast(null); }}
          onDismiss={() => setToast(null)}
        />
      )}

      {showSettings && (
        <SettingsPanel
          settings={settings}
          quotesConfig={quotesConfig}
          onChangeSettings={setSettings}
          onChangeQuotes={setQuotesConfig}
          onClose={() => setShowSettings(false)}
        />
      )}
    </div>
  );
}
