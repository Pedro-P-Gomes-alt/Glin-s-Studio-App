import { useState, useEffect } from "react";
import { query, execute } from "../db";

// ── Helpers ────────────────────────────────────────────────────────────
function getLatest(snapshots) {
  return snapshots.length ? snapshots[snapshots.length - 1].value : null;
}

function getGrowth(snapshots, days) {
  if (snapshots.length < 2) return null;
  const latest   = snapshots[snapshots.length - 1];
  const cutoff   = new Date(latest.recorded_on + "T00:00:00");
  cutoff.setDate(cutoff.getDate() - days);
  const cutoffStr = cutoff.toISOString().split("T")[0];
  // Find exact date or closest earlier
  const past = [...snapshots].reverse().find(s => s.recorded_on <= cutoffStr);
  if (!past || past.recorded_on === latest.recorded_on) return null;
  return latest.value - past.value;
}

function fmt(n) {
  if (n === null || n === undefined) return "—";
  return n.toLocaleString("en-GB");
}

function fmtDate(iso) {
  if (!iso) return "";
  try {
    return new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
  } catch { return iso; }
}

function fmtShort(iso) {
  if (!iso) return "";
  try { return new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short" }); }
  catch { return iso; }
}

// ── SVG line chart ─────────────────────────────────────────────────────
function TrendChart({ snapshots, color }) {
  if (!snapshots || snapshots.length < 2) {
    return <div className="social-chart-empty">Not enough data yet — opens daily</div>;
  }

  const values = snapshots.map(s => s.value);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;
  const W = 400, H = 72, PAD = 6;

  const pts = snapshots.map((s, i) => ({
    x: PAD + (i / (snapshots.length - 1)) * (W - PAD * 2),
    y: PAD + (1 - (s.value - min) / range) * (H - PAD * 2),
    ...s,
  }));

  const polyline = pts.map(p => `${p.x},${p.y}`).join(" ");
  const area = [
    `${pts[0].x},${H}`,
    ...pts.map(p => `${p.x},${p.y}`),
    `${pts[pts.length - 1].x},${H}`,
  ].join(" ");

  const gradId = `sg-${color.replace(/[^a-z0-9]/gi, "")}`;

  return (
    <div className="social-chart-wrap">
      <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none"
        style={{ width: "100%", height: H, display: "block" }}>
        <defs>
          <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%"   stopColor={color} stopOpacity="0.25" />
            <stop offset="100%" stopColor={color} stopOpacity="0.02" />
          </linearGradient>
        </defs>
        <polygon points={area} fill={`url(#${gradId})`} />
        <polyline points={polyline} fill="none" stroke={color}
          strokeWidth="2.5" strokeLinejoin="round" strokeLinecap="round" />
        <circle cx={pts[pts.length - 1].x} cy={pts[pts.length - 1].y}
          r="4" fill={color} />
      </svg>
      <div className="social-chart-labels">
        <span>{fmtShort(snapshots[0].recorded_on)}</span>
        <span>{fmtShort(snapshots[snapshots.length - 1].recorded_on)}</span>
      </div>
    </div>
  );
}

// ── Growth badge ───────────────────────────────────────────────────────
function GrowthBadge({ value, suffix = "" }) {
  if (value === null || value === undefined) return <span className="social-growth-na">—</span>;
  const cls = value > 0 ? "positive" : value < 0 ? "negative" : "social-growth-zero";
  return (
    <span className={`social-growth-badge ${cls}`}>
      {value > 0 ? "+" : ""}{value.toLocaleString("en-GB")}{suffix}
    </span>
  );
}

// ── Metric card ────────────────────────────────────────────────────────
function MetricCard({ label, value, sub }) {
  return (
    <div className="social-metric-card">
      <div className="social-metric-label">{label}</div>
      <div className="social-metric-value">{value ?? "—"}</div>
      {sub && <div className="social-metric-sub">{sub}</div>}
    </div>
  );
}

// ── YouTube setup guide ────────────────────────────────────────────────
function YouTubeSetup() {
  return (
    <div className="social-setup-card">
      <h3 className="social-setup-title">Connect YouTube</h3>
      <ol className="social-setup-steps">
        <li>Go to <strong>console.cloud.google.com</strong> and sign in with your Google account.</li>
        <li>Create a new project (any name, e.g. "Glin Studio").</li>
        <li>Click <strong>APIs &amp; Services → Library</strong>. Search for <em>YouTube Data API v3</em> and enable it.</li>
        <li>Go to <strong>APIs &amp; Services → Credentials → Create Credentials → API key</strong>.</li>
        <li>Copy the key. Optionally restrict it to <em>YouTube Data API v3</em> only.</li>
        <li>Open <strong>Settings</strong> (gear icon, bottom of sidebar) → paste key under <em>YouTube API</em>.</li>
        <li>Set your channel handle (e.g. <code>@glindesign</code>). The app fetches daily automatically.</li>
      </ol>
      <p className="social-setup-note">Free tier: 10,000 units/day. This app uses ~102 units/day — well within limits.</p>
    </div>
  );
}

// ── Instagram setup guide ──────────────────────────────────────────────
function InstagramSetup() {
  return (
    <div className="social-setup-card">
      <h3 className="social-setup-title">Connect Instagram</h3>
      <ol className="social-setup-steps">
        <li>In the Instagram app: <strong>Settings → Account → Switch to Creator</strong> (free).</li>
        <li>In Instagram settings: <strong>Linked accounts → link a Facebook Page</strong> (create one in 30 sec if needed).</li>
        <li>Go to <strong>developers.facebook.com</strong> → <em>My Apps → Create App → Consumer</em>.</li>
        <li>Inside your app → <strong>Add Product: Instagram</strong>.</li>
        <li>Go to <strong>Tools → Graph API Explorer</strong>, select your app, then add permissions:
          <code>instagram_basic</code> and <code>instagram_manage_insights</code>.</li>
        <li>Click <strong>Generate Access Token</strong>, authorize with Facebook, and copy the token.</li>
        <li>In the Explorer, run: <code>GET /me?fields=id</code> — copy your Instagram User ID.</li>
        <li>Open <strong>Settings → Instagram Graph API</strong> and paste both values.</li>
      </ol>
      <p className="social-setup-note">
        Development mode works fine for personal use — no App Review needed since you are the owner.
        The app auto-refreshes your token on each daily fetch (stays valid indefinitely).
      </p>
    </div>
  );
}

// ── YouTube detail ─────────────────────────────────────────────────────
function YouTubeDetail({ snapshots, viewSnapshots, videos, error, configured }) {
  const subs  = getLatest(snapshots);
  const views = getLatest(viewSnapshots);

  if (!configured) return <YouTubeSetup />;

  return (
    <div className="social-detail">
      {error && <div className="social-error">⚠ {error}</div>}

      <div className="social-metric-row">
        <MetricCard label="Subscribers" value={subs !== null ? fmt(subs) : "—"} />
        <MetricCard label="Today"    value={<GrowthBadge value={getGrowth(snapshots, 1)} />}   sub="vs yesterday" />
        <MetricCard label="This week" value={<GrowthBadge value={getGrowth(snapshots, 7)} />}  sub="vs 7 days ago" />
        <MetricCard label="This month" value={<GrowthBadge value={getGrowth(snapshots, 30)} />} sub="vs 30 days ago" />
      </div>

      {views !== null && (
        <div className="social-views-row">
          <span className="social-views-label">Total views</span>
          <span className="social-views-val">{fmt(views)}</span>
        </div>
      )}

      <div className="dash-section-header" style={{ marginTop: 20, marginBottom: 8 }}>
        <h2 className="dash-section-title">Subscriber trend</h2>
        <span className="dash-section-hint">Last 30 days</span>
      </div>
      <TrendChart snapshots={snapshots} color="#E53935" />

      {videos.length > 0 && (
        <>
          <div className="dash-section-header" style={{ marginTop: 24, marginBottom: 8 }}>
            <h2 className="dash-section-title">Recent videos</h2>
          </div>
          <div className="social-video-list">
            {videos.map(v => (
              <div key={v.video_id} className="social-video-row">
                {v.thumbnail_url && (
                  <img src={v.thumbnail_url} alt="" className="social-video-thumb" />
                )}
                <div className="social-video-info">
                  <div className="social-video-title">{v.title}</div>
                  <div className="social-video-meta">
                    {fmtDate(v.published_at)}
                    <span>{fmt(v.view_count)} views</span>
                    <span>{fmt(v.like_count)} likes</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </>
      )}

      {snapshots.length === 0 && !error && (
        <p className="empty-state" style={{ marginTop: 20 }}>
          Data will appear after the first successful fetch. Open the app tomorrow to see your first trend point.
        </p>
      )}
    </div>
  );
}

// ── Instagram detail ───────────────────────────────────────────────────
function InstagramDetail({ snapshots, media, error, configured }) {
  const followers = getLatest(snapshots);

  if (!configured) return <InstagramSetup />;

  return (
    <div className="social-detail">
      {error && <div className="social-error">⚠ {error}</div>}

      <div className="social-metric-row">
        <MetricCard label="Followers" value={followers !== null ? fmt(followers) : "—"} />
        <MetricCard label="Today"     value={<GrowthBadge value={getGrowth(snapshots, 1)} />}  sub="vs yesterday" />
        <MetricCard label="This week" value={<GrowthBadge value={getGrowth(snapshots, 7)} />}  sub="vs 7 days ago" />
        <MetricCard label="This month" value={<GrowthBadge value={getGrowth(snapshots, 30)} />} sub="vs 30 days ago" />
      </div>

      <div className="dash-section-header" style={{ marginTop: 20, marginBottom: 8 }}>
        <h2 className="dash-section-title">Follower trend</h2>
        <span className="dash-section-hint">Last 30 days</span>
      </div>
      <TrendChart snapshots={snapshots} color="#C13584" />

      {media.length > 0 && (
        <>
          <div className="dash-section-header" style={{ marginTop: 24, marginBottom: 8 }}>
            <h2 className="dash-section-title">Recent posts</h2>
          </div>
          <div className="social-media-list">
            {media.map(m => (
              <div key={m.media_id} className="social-media-row">
                <div className="social-media-type">{m.media_type ?? "POST"}</div>
                <div className="social-media-info">
                  {m.caption && (
                    <div className="social-media-caption">
                      {m.caption.length > 100 ? m.caption.slice(0, 100) + "…" : m.caption}
                    </div>
                  )}
                  <div className="social-media-meta">
                    {fmtDate(m.timestamp)}
                    <span>{fmt(m.like_count)} likes</span>
                    <span>{fmt(m.comments_count)} comments</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </>
      )}

      {snapshots.length === 0 && !error && (
        <p className="empty-state" style={{ marginTop: 20 }}>
          Data will appear after the first successful fetch. Check that your access token and user ID are correct in Settings.
        </p>
      )}
    </div>
  );
}

// ── TikTok detail ──────────────────────────────────────────────────────
function TikTokDetail({ snapshots, onEntry }) {
  const [count, setCount] = useState("");
  const [date, setDate]   = useState(new Date().toISOString().split("T")[0]);
  const [saving, setSaving] = useState(false);
  const followers = getLatest(snapshots);

  async function handleSubmit(e) {
    e.preventDefault();
    setSaving(true);
    try {
      await execute(
        `INSERT OR REPLACE INTO social_snapshots (platform, metric, value, recorded_on) VALUES ('tiktok', 'followers', ?, ?)`,
        [Number(count), date]
      );
      setCount("");
      onEntry?.();
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="social-detail">
      <div className="social-metric-row">
        <MetricCard label="Followers" value={followers !== null ? fmt(followers) : "—"} />
        <MetricCard label="Today"     value={<GrowthBadge value={getGrowth(snapshots, 1)} />}  sub="vs yesterday" />
        <MetricCard label="This week" value={<GrowthBadge value={getGrowth(snapshots, 7)} />}  sub="vs 7 days ago" />
        <MetricCard label="This month" value={<GrowthBadge value={getGrowth(snapshots, 30)} />} sub="vs 30 days ago" />
      </div>

      <div className="dash-section-header" style={{ marginTop: 20, marginBottom: 8 }}>
        <h2 className="dash-section-title">Follower trend</h2>
        <span className="dash-section-hint">Last 30 days</span>
      </div>
      <TrendChart snapshots={snapshots} color="#FE2C55" />

      {/* Manual entry */}
      <div className="social-manual-entry">
        <h3 className="social-manual-title">Update follower count</h3>
        <p className="social-manual-hint">
          Check your TikTok app or <strong>analytics.tiktok.com</strong> and enter today's count.
          Takes 5 seconds and keeps your trend accurate.
        </p>
        <form className="social-manual-form" onSubmit={handleSubmit}>
          <div className="field" style={{ flex: 1 }}>
            <label>Follower count</label>
            <input type="number" min="0" value={count}
              onChange={e => setCount(e.target.value)}
              placeholder="e.g. 1234" required />
          </div>
          <div className="field">
            <label>Date</label>
            <input type="date" value={date} onChange={e => setDate(e.target.value)} required />
          </div>
          <div className="field" style={{ alignSelf: "flex-end" }}>
            <button type="submit" className="btn-primary" disabled={saving || !count}>
              {saving ? "Saving…" : "Save"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ── Main page ──────────────────────────────────────────────────────────
const PLATFORMS = [
  { id: "youtube",   label: "YouTube",   color: "#E53935", metric: "subscribers" },
  { id: "instagram", label: "Instagram", color: "#C13584", metric: "followers" },
  { id: "tiktok",    label: "TikTok",    color: "#FE2C55", metric: "followers" },
];

export default function Social({ socialConfig, socialErrors, onRefresh }) {
  const [selected, setSelected]     = useState("youtube");
  const [refreshing, setRefreshing] = useState(false);

  // All snapshots loaded at once
  const [ytSubs,  setYtSubs]   = useState([]);
  const [ytViews, setYtViews]  = useState([]);
  const [ytVids,  setYtVids]   = useState([]);
  const [igFolls, setIgFolls]  = useState([]);
  const [igMedia, setIgMedia]  = useState([]);
  const [ttFolls, setTtFolls]  = useState([]);

  useEffect(() => { loadData(); }, []);

  async function loadData() {
    const [ys, yv, yvideos, igf, igm, ttf] = await Promise.all([
      query(`SELECT recorded_on, value FROM social_snapshots
             WHERE platform='youtube' AND metric='subscribers'
               AND recorded_on >= date('now', '-30 days')
             ORDER BY recorded_on`),
      query(`SELECT recorded_on, value FROM social_snapshots
             WHERE platform='youtube' AND metric='views'
               AND recorded_on >= date('now', '-30 days')
             ORDER BY recorded_on`),
      query(`SELECT * FROM yt_videos ORDER BY published_at DESC LIMIT 10`),
      query(`SELECT recorded_on, value FROM social_snapshots
             WHERE platform='instagram' AND metric='followers'
               AND recorded_on >= date('now', '-30 days')
             ORDER BY recorded_on`),
      query(`SELECT * FROM ig_media ORDER BY timestamp DESC LIMIT 12`),
      query(`SELECT recorded_on, value FROM social_snapshots
             WHERE platform='tiktok' AND metric='followers'
               AND recorded_on >= date('now', '-30 days')
             ORDER BY recorded_on`),
    ]);
    setYtSubs(ys);
    setYtViews(yv);
    setYtVids(yvideos);
    setIgFolls(igf);
    setIgMedia(igm);
    setTtFolls(ttf);
  }

  async function handleRefresh() {
    setRefreshing(true);
    await onRefresh?.();
    await loadData();
    setRefreshing(false);
  }

  function platformData(id) {
    if (id === "youtube")   return ytSubs;
    if (id === "instagram") return igFolls;
    if (id === "tiktok")    return ttFolls;
    return [];
  }

  const ytConfigured = !!socialConfig?.yt_api_key;
  const igConfigured = !!(socialConfig?.ig_access_token && socialConfig?.ig_user_id);

  return (
    <div className="page">
      <div className="page-header">
        <h1>Social</h1>
        <button className="btn-ghost" onClick={handleRefresh} disabled={refreshing}>
          {refreshing ? "Refreshing…" : "Refresh now"}
        </button>
      </div>

      {/* Platform switcher */}
      <div className="social-platform-row">
        {PLATFORMS.map(p => {
          const snaps       = platformData(p.id);
          const latest      = getLatest(snaps);
          const dailyGrowth = getGrowth(snaps, 1);
          const configured  = p.id === "youtube" ? ytConfigured
                            : p.id === "instagram" ? igConfigured : true;
          return (
            <button
              key={p.id}
              className={`social-platform-card${selected === p.id ? " active" : ""}`}
              style={{ "--pc": p.color }}
              onClick={() => setSelected(p.id)}
            >
              <span className="social-platform-name" style={{ color: p.color }}>{p.label}</span>
              {latest !== null ? (
                <>
                  <span className="social-platform-count">{fmt(latest)}</span>
                  <span className="social-platform-label">{p.metric}</span>
                  {dailyGrowth !== null && (
                    <span className={`social-platform-delta ${dailyGrowth >= 0 ? "positive" : "negative"}`}>
                      {dailyGrowth >= 0 ? "+" : ""}{dailyGrowth} today
                    </span>
                  )}
                </>
              ) : (
                <span className="social-platform-status">
                  {configured ? "No data yet" : "Setup required"}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* Detail */}
      {selected === "youtube" && (
        <YouTubeDetail
          snapshots={ytSubs}
          viewSnapshots={ytViews}
          videos={ytVids}
          error={socialErrors?.youtube}
          configured={ytConfigured}
        />
      )}
      {selected === "instagram" && (
        <InstagramDetail
          snapshots={igFolls}
          media={igMedia}
          error={socialErrors?.instagram}
          configured={igConfigured}
        />
      )}
      {selected === "tiktok" && (
        <TikTokDetail
          snapshots={ttFolls}
          onEntry={loadData}
        />
      )}
    </div>
  );
}
