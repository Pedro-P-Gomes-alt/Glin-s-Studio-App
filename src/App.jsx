import { useState, useEffect } from "react";
import "./App.css";
import Dashboard from "./pages/Dashboard";
import Sales from "./pages/Sales";
import Timekeeping from "./pages/Timekeeping";
import Calendar from "./pages/Calendar";
import Board from "./pages/Board";

const NAV = [
  { id: "dashboard",   label: "Dashboard" },
  { id: "sales",       label: "Commissions" },
  { id: "timekeeping", label: "Timekeeping" },
  { id: "calendar",    label: "Calendar" },
  { id: "board",       label: "Board" },
];

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

function loadSettings() {
  try {
    const raw = localStorage.getItem("glins_settings");
    return raw ? { ...DEFAULT_SETTINGS, ...JSON.parse(raw) } : DEFAULT_SETTINGS;
  } catch {
    return DEFAULT_SETTINGS;
  }
}

// ── Settings panel ─────────────────────────────────────────────────────
function SettingsPanel({ settings, onChange, onClose }) {
  function set(key, val) {
    const next = { ...settings, [key]: val };
    onChange(next);
    localStorage.setItem("glins_settings", JSON.stringify(next));
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
                <button
                  key={key}
                  className={`settings-option${settings.fontSize === key ? " active" : ""}`}
                  onClick={() => set("fontSize", key)}
                >
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
                <button
                  key={key}
                  className={`settings-option font-preview${settings.fontFamily === key ? " active" : ""}`}
                  style={{ fontFamily: FONT_FAMILIES[key] }}
                  onClick={() => set("fontFamily", key)}
                >
                  {FONT_FAMILY_LABELS[key]}
                  <span className="settings-option-sample">Aa Bb 1234</span>
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── App ────────────────────────────────────────────────────────────────
export default function App() {
  const [page, setPage] = useState("dashboard");
  const [settings, setSettings] = useState(loadSettings);
  const [showSettings, setShowSettings] = useState(false);

  useEffect(() => {
    document.documentElement.style.fontSize  = FONT_SIZES[settings.fontSize]  ?? FONT_SIZES.default;
    document.documentElement.style.fontFamily = FONT_FAMILIES[settings.fontFamily] ?? FONT_FAMILIES.system;
  }, [settings]);

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
      </main>

      {showSettings && (
        <SettingsPanel
          settings={settings}
          onChange={setSettings}
          onClose={() => setShowSettings(false)}
        />
      )}
    </div>
  );
}
