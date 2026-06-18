import { useState, useEffect, useRef } from "react";
import "./App.css";
import Dashboard from "./pages/Dashboard";
import Sales from "./pages/Sales";
import Timekeeping from "./pages/Timekeeping";
import Calendar from "./pages/Calendar";
import Board from "./pages/Board";
import Clients from "./pages/Clients";
import Quotes from "./pages/Quotes";
import { query, execute } from "./db";

// ── Font settings ──────────────────────────────────────────────────────
const FONT_SIZES = {
  compact:     "13px",
  default:     "15px",
  comfortable: "17px",
};
const FONT_FAMILIES = {
  system:  "system-ui, -apple-system, sans-serif",
  segoe:   "'Segoe UI', system-ui, sans-serif",
  serif:   "Georgia, 'Times New Roman', serif",
  mono:    "'Cascadia Code', Consolas, 'Courier New', monospace",
};
const FONT_FAMILY_LABELS = {
  system:  "System default",
  segoe:   "Segoe UI (Windows)",
  serif:   "Serif",
  mono:    "Monospace",
};

const DEFAULT_SETTINGS = { fontSize: "default", fontFamily: "system" };
const DEFAULT_QUOTES_CONFIG = { scriptUrl: "", token: "" };

function loadSettings() {
  try {
    const raw = localStorage.getItem("glins_settings");
    return raw ? { ...DEFAULT_SETTINGS, ...JSON.parse(raw) } : DEFAULT_SETTINGS;
  } catch { return DEFAULT_SETTINGS; }
}
function loadQuotesConfig() {
  try {
    const raw = localStorage.getItem("glins_quotes_config");
    return raw ? { ...DEFAULT_QUOTES_CONFIG, ...JSON.parse(raw) } : DEFAULT_QUOTES_CONFIG;
  } catch { return DEFAULT_QUOTES_CONFIG; }
}

// ── Settings panel ─────────────────────────────────────────────────────
function SettingsPanel({ settings, quotesConfig, onChangeSettings, onChangeQuotes, onClose }) {
  function setFont(key, val) {
    const next = { ...settings, [key]: val };
    onChangeSettings(next);
    localStorage.setItem("glins_settings", JSON.stringify(next));
  }
  function setQuote(key, val) {
    const next = { ...quotesConfig, [key]: val };
    onChangeQuotes(next);
    localStorage.setItem("glins_quotes_config", JSON.stringify(next));
  }

  return (
    <div className="overlay" onClick={onClose}>
      <div className="panel" onClick={e => e.stopPropagation()}>
        <div className="panel-header">
          <h2>Settings</h2>
          <button className="btn-icon" onClick={onClose}>✕</button>
        </div>

        <div className="settings-body">
          {/* Font size */}
          <div className="settings-section">
            <div className="settings-section-title">Font size</div>
            <div className="settings-options">
              {Object.keys(FONT_SIZES).map(key => (
                <button key={key}
                  className={`settings-option${settings.fontSize === key ? " active" : ""}`}
                  onClick={() => setFont("fontSize", key)}>
                  {key.charAt(0).toUpperCase() + key.slice(1)}
                </button>
              ))}
            </div>
            <p className="settings-hint">Scales all text in the app.</p>
          </div>

          {/* Font family */}
          <div className="settings-section">
            <div className="settings-section-title">Font style</div>
            <div className="settings-options col">
              {Object.keys(FONT_FAMILIES).map(key => (
                <button key={key}
                  className={`settings-option font-preview${settings.fontFamily === key ? " active" : ""}`}
                  style={{ fontFamily: FONT_FAMILIES[key] }}
                  onClick={() => setFont("fontFamily", key)}>
                  {FONT_FAMILY_LABELS[key]}
                  <span className="settings-option-sample">Aa Bb 1234</span>
                </button>
              ))}
            </div>
          </div>

          {/* Quotes connection */}
          <div className="settings-section">
            <div className="settings-section-title">Quotes — Google Sheets connection</div>
            <p className="settings-hint" style={{ marginBottom: 8 }}>
              Go to <strong>Quotes</strong> tab for setup instructions.
            </p>
            <div className="field">
              <label>Apps Script URL</label>
              <input
                type="url"
                value={quotesConfig.scriptUrl}
                onChange={e => setQuote("scriptUrl", e.target.value)}
                placeholder="https://script.google.com/macros/s/…/exec"
              />
            </div>
            <div className="field" style={{ marginTop: 8 }}>
              <label>Secret token</label>
              <input
                type="password"
                value={quotesConfig.token}
                onChange={e => setQuote("token", e.target.value)}
                placeholder="The passphrase you set in the script"
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Toast notification ─────────────────────────────────────────────────
function Toast({ count, onDismiss }) {
  useEffect(() => {
    const t = setTimeout(onDismiss, 6000);
    return () => clearTimeout(t);
  }, []);
  return (
    <div className="toast" onClick={onDismiss}>
      {count === 1
        ? "New quote request received!"
        : `${count} new quote requests received!`}
      <button className="toast-dismiss">✕</button>
    </div>
  );
}

// ── App ────────────────────────────────────────────────────────────────
export default function App() {
  const [page, setPage]               = useState("dashboard");
  const [settings, setSettings]       = useState(loadSettings);
  const [quotesConfig, setQuotesConfig] = useState(loadQuotesConfig);
  const [showSettings, setShowSettings] = useState(false);
  const [unseenQuotes, setUnseenQuotes] = useState(0);
  const [toast, setToast]             = useState(null);
  const pollRef = useRef(null);

  // Apply font settings
  useEffect(() => {
    document.documentElement.style.fontSize   = FONT_SIZES[settings.fontSize]   ?? FONT_SIZES.default;
    document.documentElement.style.fontFamily = FONT_FAMILIES[settings.fontFamily] ?? FONT_FAMILIES.system;
  }, [settings]);

  // Load unseen count on start
  useEffect(() => {
    refreshUnseenCount();
  }, []);

  // Poll when config changes or on mount
  useEffect(() => {
    if (pollRef.current) clearInterval(pollRef.current);
    if (!quotesConfig.scriptUrl || !quotesConfig.token) return;

    fetchAndStore(); // immediate
    pollRef.current = setInterval(fetchAndStore, 60 * 60 * 1000); // hourly
    return () => clearInterval(pollRef.current);
  }, [quotesConfig.scriptUrl, quotesConfig.token]);

  async function refreshUnseenCount() {
    try {
      const rows = await query(`SELECT COUNT(*) AS cnt FROM quotes WHERE seen = 0`);
      setUnseenQuotes(rows[0]?.cnt ?? 0);
    } catch {}
  }

  async function fetchAndStore() {
    if (!quotesConfig.scriptUrl || !quotesConfig.token) return;
    try {
      const url = `${quotesConfig.scriptUrl}?token=${encodeURIComponent(quotesConfig.token)}`;
      const res = await fetch(url);
      if (!res.ok) return;
      const data = await res.json();
      if (!Array.isArray(data.rows)) return;

      const before = await query(`SELECT COUNT(*) AS cnt FROM quotes`);
      const beforeCount = before[0]?.cnt ?? 0;

      for (const row of data.rows) {
        const sourceId    = String(row.Timestamp ?? row._row ?? Math.random());
        const submittedAt = row.Timestamp ? new Date(row.Timestamp).toISOString() : null;
        try {
          await execute(
            `INSERT OR IGNORE INTO quotes (source_id, submitted_at, data) VALUES (?, ?, ?)`,
            [sourceId, submittedAt, JSON.stringify(row)]
          );
        } catch {}
      }

      const after = await query(`SELECT COUNT(*) AS cnt FROM quotes`);
      const newCount = (after[0]?.cnt ?? 0) - beforeCount;
      if (newCount > 0) setToast(newCount);

      await refreshUnseenCount();
    } catch (err) {
      console.warn("Quotes fetch failed:", err);
    }
  }

  const NAV = [
    { id: "dashboard",   label: "Dashboard" },
    { id: "sales",       label: "Commissions" },
    { id: "timekeeping", label: "Timekeeping" },
    { id: "calendar",    label: "Calendar" },
    { id: "board",       label: "Board" },
    { id: "clients",     label: "Clients" },
    { id: "quotes",      label: "Quotes", badge: unseenQuotes > 0 ? unseenQuotes : null },
  ];

  return (
    <div className="layout">
      <nav className="sidebar">
        <div className="sidebar-brand">
          <span className="sidebar-brand-name">glin</span>
          <span className="sidebar-brand-sub">studio</span>
        </div>
        <ul>
          {NAV.map((n) => (
            <li key={n.id}>
              <button
                className={page === n.id ? "active" : ""}
                onClick={() => setPage(n.id)}
              >
                {n.label}
                {n.badge && <span className="nav-badge">{n.badge}</span>}
              </button>
            </li>
          ))}
        </ul>

        <button className="sidebar-settings-btn" onClick={() => setShowSettings(true)}>
          ⚙ Settings
        </button>
      </nav>

      <main className="content">
        {page === "dashboard"   && <Dashboard />}
        {page === "sales"       && <Sales />}
        {page === "timekeeping" && <Timekeeping />}
        {page === "calendar"    && <Calendar />}
        {page === "board"       && <Board />}
        {page === "clients"     && <Clients />}
        {page === "quotes"      && (
          <Quotes
            config={quotesConfig}
            onUnseenChange={setUnseenQuotes}
            onRefresh={fetchAndStore}
          />
        )}
      </main>

      {toast && (
        <Toast count={toast} onDismiss={() => setToast(null)} />
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
