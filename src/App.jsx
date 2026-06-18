import { useState, useEffect, useRef } from "react";
import { check } from "@tauri-apps/plugin-updater";
import { relaunch } from "@tauri-apps/plugin-process";
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
const FONT_SIZES    = { compact: "13px", default: "15px", comfortable: "17px" };
const FONT_FAMILIES = {
  system: "system-ui, -apple-system, sans-serif",
  segoe:  "'Segoe UI', system-ui, sans-serif",
  serif:  "Georgia, 'Times New Roman', serif",
  mono:   "'Cascadia Code', Consolas, 'Courier New', monospace",
};
const FONT_FAMILY_LABELS = {
  system: "System default", segoe: "Segoe UI (Windows)", serif: "Serif", mono: "Monospace",
};

const DEFAULT_SETTINGS      = { fontSize: "default", fontFamily: "system" };
const DEFAULT_QUOTES_CONFIG = { scriptUrl: "", token: "" };
const DEFAULT_SOCIAL_CONFIG = {
  yt_api_key:     "",
  yt_handle:      "@glindesign",
  yt_channel_id:  "",   // auto-discovered and cached
  ig_access_token:"",
  ig_user_id:     "",
};

function ls(key, def) {
  try { const r = localStorage.getItem(key); return r ? { ...def, ...JSON.parse(r) } : def; }
  catch { return def; }
}

// ── Settings panel ─────────────────────────────────────────────────────
function SettingsPanel({ settings, quotesConfig, socialConfig,
                         onChangeSettings, onChangeQuotes, onChangeSocial, onClose }) {

  function setFont(k, v)  { const n = { ...settings, [k]: v };        onChangeSettings(n); localStorage.setItem("glins_settings", JSON.stringify(n)); }
  function setQuote(k, v) { const n = { ...quotesConfig, [k]: v };    onChangeQuotes(n);   localStorage.setItem("glins_quotes_config", JSON.stringify(n)); }
  function setSocial(k, v){ const n = { ...socialConfig, [k]: v };    onChangeSocial(n);   localStorage.setItem("glins_social_config", JSON.stringify(n)); }

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

  const tokenDaysLeft = (() => {
    if (!socialConfig.ig_token_refreshed_at) return null;
    const refreshed = new Date(socialConfig.ig_token_refreshed_at);
    const expiry    = new Date(refreshed.getTime() + 60 * 24 * 60 * 60 * 1000);
    return Math.ceil((expiry - Date.now()) / 86400000);
  })();

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

          {/* YouTube */}
          <div className="settings-section">
            <div className="settings-section-title">YouTube API</div>
            <p className="settings-hint" style={{ marginBottom: 8 }}>
              Free key from{" "}
              <strong>console.cloud.google.com</strong> → Enable YouTube Data API v3 → Create API key.
            </p>
            <div className="field">
              <label>API Key</label>
              <input type="password" value={socialConfig.yt_api_key}
                onChange={e => setSocial("yt_api_key", e.target.value)}
                placeholder="AIza…" />
            </div>
            <div className="field" style={{ marginTop: 8 }}>
              <label>Channel handle</label>
              <input value={socialConfig.yt_handle}
                onChange={e => setSocial("yt_handle", e.target.value)}
                placeholder="@glindesign" />
            </div>
          </div>

          {/* Instagram */}
          <div className="settings-section">
            <div className="settings-section-title">Instagram Graph API</div>
            <p className="settings-hint" style={{ marginBottom: 8 }}>
              See <strong>Social → Instagram → Setup</strong> for full instructions.
            </p>
            <div className="field">
              <label>Long-lived access token</label>
              <input type="password" value={socialConfig.ig_access_token}
                onChange={e => { setSocial("ig_access_token", e.target.value); }}
                placeholder="IGQ…" />
            </div>
            <div className="field" style={{ marginTop: 8 }}>
              <label>Instagram User ID</label>
              <input value={socialConfig.ig_user_id}
                onChange={e => setSocial("ig_user_id", e.target.value)}
                placeholder="Numeric ID from Graph API Explorer" />
            </div>
            {tokenDaysLeft !== null && tokenDaysLeft < 14 && (
              <p className="settings-hint" style={{ color: tokenDaysLeft < 7 ? "var(--negative)" : "#B45309", marginTop: 6 }}>
                ⚠ Instagram token expires in ~{tokenDaysLeft} day{tokenDaysLeft !== 1 ? "s" : ""}. Open the Social tab to auto-refresh it.
              </p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Toast notification ─────────────────────────────────────────────────
function Toast({ count, onDismiss }) {
  useEffect(() => { const t = setTimeout(onDismiss, 6000); return () => clearTimeout(t); }, []);
  return (
    <div className="toast" onClick={onDismiss}>
      {count === 1 ? "New quote request received!" : `${count} new quote requests received!`}
      <button className="toast-dismiss">✕</button>
    </div>
  );
}

// ── App ────────────────────────────────────────────────────────────────
export default function App() {
  const [page, setPage]               = useState("dashboard");
  const [settings, setSettings]       = useState(() => ls("glins_settings", DEFAULT_SETTINGS));
  const [quotesConfig, setQuotesConfig] = useState(() => ls("glins_quotes_config", DEFAULT_QUOTES_CONFIG));
  const [socialConfig, setSocialConfig] = useState(() => ls("glins_social_config", DEFAULT_SOCIAL_CONFIG));
  const [showSettings, setShowSettings] = useState(false);
  const [unseenQuotes, setUnseenQuotes] = useState(0);
  const [socialErrors, setSocialErrors] = useState({});
  const [toast, setToast]             = useState(null);
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

  // Social: fetch once per day whenever config is set
  useEffect(() => {
    const hasYT = !!socialConfig.yt_api_key;
    const hasIG = !!(socialConfig.ig_access_token && socialConfig.ig_user_id);
    if (hasYT || hasIG) fetchSocialIfNeeded();
  }, [socialConfig.yt_api_key, socialConfig.ig_access_token, socialConfig.ig_user_id]);

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

  // ── Social helpers ─────────────────────────────────────────────────
  async function fetchYouTube() {
    const key    = socialConfig.yt_api_key;
    const handle = socialConfig.yt_handle || "@glindesign";
    if (!key) return;

    let channelId = socialConfig.yt_channel_id;

    // Discover channel ID from handle (once, then cached)
    if (!channelId) {
      const r = await fetch(
        `https://www.googleapis.com/youtube/v3/channels?part=id&forHandle=${encodeURIComponent(handle)}&key=${key}`
      );
      const d = await r.json();
      if (d.error) throw new Error(d.error.message);
      if (!d.items?.length) throw new Error(`Channel not found for handle: ${handle}`);
      channelId = d.items[0].id;
      setSocialConfig(prev => {
        const next = { ...prev, yt_channel_id: channelId };
        localStorage.setItem("glins_social_config", JSON.stringify(next));
        return next;
      });
    }

    // Channel statistics
    const r2 = await fetch(
      `https://www.googleapis.com/youtube/v3/channels?part=statistics&id=${channelId}&key=${key}`
    );
    const d2 = await r2.json();
    if (d2.error) throw new Error(d2.error.message);
    const stats = d2.items?.[0]?.statistics;
    if (!stats) throw new Error("Could not read channel statistics");

    await execute(`INSERT OR IGNORE INTO social_snapshots (platform, metric, value) VALUES (?, ?, ?)`,
      ["youtube", "subscribers", Number(stats.subscriberCount ?? 0)]);
    await execute(`INSERT OR IGNORE INTO social_snapshots (platform, metric, value) VALUES (?, ?, ?)`,
      ["youtube", "views", Number(stats.viewCount ?? 0)]);
    await execute(`INSERT OR IGNORE INTO social_snapshots (platform, metric, value) VALUES (?, ?, ?)`,
      ["youtube", "videos", Number(stats.videoCount ?? 0)]);

    // Recent videos
    const r3 = await fetch(
      `https://www.googleapis.com/youtube/v3/search?channelId=${channelId}&type=video&order=date&maxResults=10&part=snippet&key=${key}`
    );
    const d3 = await r3.json();
    if (!d3.items?.length) return;

    const ids = d3.items.map(v => v.id?.videoId).filter(Boolean).join(",");
    if (!ids) return;

    const r4 = await fetch(
      `https://www.googleapis.com/youtube/v3/videos?part=statistics,snippet&id=${ids}&key=${key}`
    );
    const d4 = await r4.json();
    if (!d4.items) return;

    for (const vid of d4.items) {
      await execute(
        `INSERT OR REPLACE INTO yt_videos
           (video_id, title, published_at, thumbnail_url, view_count, like_count, comment_count, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, datetime('now'))`,
        [
          vid.id,
          vid.snippet.title,
          vid.snippet.publishedAt,
          vid.snippet.thumbnails?.medium?.url ?? null,
          Number(vid.statistics?.viewCount   ?? 0),
          Number(vid.statistics?.likeCount   ?? 0),
          Number(vid.statistics?.commentCount ?? 0),
        ]
      );
    }
  }

  async function fetchInstagram() {
    const token  = socialConfig.ig_access_token;
    const userId = socialConfig.ig_user_id;
    if (!token || !userId) return;

    // Auto-refresh token (resets 60-day expiry)
    try {
      await fetch(`https://graph.instagram.com/refresh_access_token?grant_type=ig_refresh_token&access_token=${token}`);
      setSocialConfig(prev => {
        const next = { ...prev, ig_token_refreshed_at: new Date().toISOString() };
        localStorage.setItem("glins_social_config", JSON.stringify(next));
        return next;
      });
    } catch {}

    const r = await fetch(
      `https://graph.instagram.com/v18.0/${userId}?fields=followers_count,media_count&access_token=${token}`
    );
    const d = await r.json();
    if (d.error) throw new Error(d.error.message);

    await execute(`INSERT OR IGNORE INTO social_snapshots (platform, metric, value) VALUES (?, ?, ?)`,
      ["instagram", "followers", Number(d.followers_count ?? 0)]);
    await execute(`INSERT OR IGNORE INTO social_snapshots (platform, metric, value) VALUES (?, ?, ?)`,
      ["instagram", "posts", Number(d.media_count ?? 0)]);

    // Recent media
    const r2 = await fetch(
      `https://graph.instagram.com/v18.0/${userId}/media?fields=id,media_type,caption,timestamp,like_count,comments_count&limit=12&access_token=${token}`
    );
    const d2 = await r2.json();
    if (!d2.data) return;

    for (const m of d2.data) {
      await execute(
        `INSERT OR REPLACE INTO ig_media
           (media_id, media_type, caption, timestamp, like_count, comments_count, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, datetime('now'))`,
        [m.id, m.media_type ?? null, m.caption ?? null, m.timestamp ?? null,
         Number(m.like_count ?? 0), Number(m.comments_count ?? 0)]
      );
    }
  }

  async function fetchSocialIfNeeded() {
    const todayStr = new Date().toISOString().split("T")[0];
    const errs = { ...socialErrors };

    if (socialConfig.yt_api_key) {
      try {
        const rows = await query(
          `SELECT id FROM social_snapshots WHERE platform='youtube' AND metric='subscribers' AND recorded_on=?`,
          [todayStr]
        );
        if (rows.length === 0) await fetchYouTube();
        errs.youtube = null;
      } catch (e) { errs.youtube = e.message; }
    }

    if (socialConfig.ig_access_token && socialConfig.ig_user_id) {
      try {
        const rows = await query(
          `SELECT id FROM social_snapshots WHERE platform='instagram' AND metric='followers' AND recorded_on=?`,
          [todayStr]
        );
        if (rows.length === 0) await fetchInstagram();
        errs.instagram = null;
      } catch (e) { errs.instagram = e.message; }
    }

    setSocialErrors(errs);
  }

  async function forceFetchSocial() {
    const errs = {};
    if (socialConfig.yt_api_key) {
      try { await fetchYouTube(); } catch (e) { errs.youtube = e.message; }
    }
    if (socialConfig.ig_access_token && socialConfig.ig_user_id) {
      try { await fetchInstagram(); } catch (e) { errs.instagram = e.message; }
    }
    setSocialErrors(errs);
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
        {page === "dashboard"   && <Dashboard socialConfig={socialConfig} socialErrors={socialErrors} onRefreshSocial={forceFetchSocial} />}
        {page === "sales"       && <Sales />}
        {page === "timekeeping" && <Timekeeping />}
        {page === "calendar"    && <Calendar />}
        {page === "board"       && <Board />}
        {page === "clients"     && <Clients />}
        {page === "quotes"      && <Quotes config={quotesConfig} onUnseenChange={setUnseenQuotes} onRefresh={fetchAndStoreQuotes} />}
      </main>

      {toast && <Toast count={toast} onDismiss={() => setToast(null)} />}

      {showSettings && (
        <SettingsPanel
          settings={settings}
          quotesConfig={quotesConfig}
          socialConfig={socialConfig}
          onChangeSettings={setSettings}
          onChangeQuotes={setQuotesConfig}
          onChangeSocial={setSocialConfig}
          onClose={() => setShowSettings(false)}
        />
      )}
    </div>
  );
}
