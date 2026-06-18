import { useState, useEffect } from "react";
import { query } from "../db";
import { formatEuro, formatEuroPerHour, formatMargin } from "../utils/money";

const SOCIAL_PLATFORMS = [
  { id: "youtube",   label: "YouTube",   color: "#E53935", metric: "subscribers" },
  { id: "instagram", label: "Instagram", color: "#C13584", metric: "followers" },
  { id: "tiktok",    label: "TikTok",    color: "#FE2C55", metric: "followers" },
];

function socialLatest(snaps) {
  return snaps.length ? snaps[snaps.length - 1].value : null;
}

function socialGrowth(snaps, days) {
  if (snaps.length < 2) return null;
  const latest  = snaps[snaps.length - 1];
  const cutoff  = new Date(latest.recorded_on + "T00:00:00");
  cutoff.setDate(cutoff.getDate() - days);
  const cutStr  = cutoff.toISOString().split("T")[0];
  const past    = [...snaps].reverse().find(s => s.recorded_on <= cutStr);
  if (!past || past.recorded_on === latest.recorded_on) return null;
  return latest.value - past.value;
}

function MiniChart({ snapshots, color }) {
  if (!snapshots || snapshots.length < 2) return <div style={{ height: 36 }} />;
  const values = snapshots.map(s => s.value);
  const min = Math.min(...values), max = Math.max(...values);
  const range = max - min || 1;
  const W = 200, H = 36, P = 2;
  const pts = snapshots.map((s, i) => [
    P + (i / (snapshots.length - 1)) * (W - P * 2),
    P + (1 - (s.value - min) / range) * (H - P * 2),
  ]);
  const pl   = pts.map(([x, y]) => `${x},${y}`).join(" ");
  const area = `${pts[0][0]},${H} ${pl} ${pts[pts.length - 1][0]},${H}`;
  const gid  = `mg${color.replace(/[^a-z0-9]/gi, "")}`;
  return (
    <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none"
      style={{ width: "100%", height: H, display: "block", marginTop: 8 }}>
      <defs>
        <linearGradient id={gid} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%"   stopColor={color} stopOpacity="0.2" />
          <stop offset="100%" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      <polygon points={area} fill={`url(#${gid})`} />
      <polyline points={pl} fill="none" stroke={color}
        strokeWidth="1.5" strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  );
}

const PERSONAL_CAT_META = [
  { key: "video",       label: "YouTube",     color: "#E53935" },
  { key: "short",       label: "Short-form",  color: "#8E24AA" },
  { key: "competition", label: "Competition", color: "#0288D1" },
  { key: "other",       label: "Other",       color: "#546E7A" },
];

function personalLabel(key) {
  return PERSONAL_CAT_META.find(m => m.key === key)?.label ?? key;
}

function personalColor(key) {
  return PERSONAL_CAT_META.find(m => m.key === key)?.color ?? "var(--muted)";
}

function pct(value, max) {
  return max > 0 ? Math.min(100, Math.round((value / max) * 100)) : 0;
}

function HBar({ value, max, color = "var(--pink-rich)" }) {
  return (
    <div className="dash-bar-track">
      <div className="dash-bar-fill" style={{ width: `${pct(value, max)}%`, background: color }} />
    </div>
  );
}

function StatCard({ label, value, note }) {
  return (
    <div className="stat-card">
      <div className="stat-label">{label}</div>
      <div className="stat-value">{value}</div>
      {note && <div className="stat-note">{note}</div>}
    </div>
  );
}

function DashSection({ title, hint, children }) {
  return (
    <section className="dash-section">
      <div className="dash-section-header">
        <h2 className="dash-section-title">{title}</h2>
        {hint && <span className="dash-section-hint">{hint}</span>}
      </div>
      {children}
    </section>
  );
}

function Empty({ msg }) {
  return <p className="dash-empty">{msg}</p>;
}

function fmtWeek(isoDate) {
  if (!isoDate) return "";
  return new Date(isoDate + "T00:00:00").toLocaleDateString("en-GB", {
    day: "numeric", month: "short",
  });
}

function fmtMonth(ym) {
  if (!ym) return "";
  const [y, m] = ym.split("-");
  const d = new Date(Number(y), Number(m) - 1, 1);
  return d.toLocaleDateString("en-GB", { month: "short", year: "2-digit" });
}

const MONTH_NAMES = [
  "January","February","March","April","May","June",
  "July","August","September","October","November","December",
];

function trendArrow(current, avg) {
  if (!avg || avg === 0) return null;
  const pctDiff = ((current - avg) / avg) * 100;
  if (pctDiff > 5)  return { icon: "↑", label: `+${pctDiff.toFixed(0)}%`, cls: "trend-up" };
  if (pctDiff < -5) return { icon: "↓", label: `${pctDiff.toFixed(0)}%`, cls: "trend-down" };
  return { icon: "→", label: "on track", cls: "trend-flat" };
}

export default function Dashboard({ socialConfig, socialErrors, onRefreshSocial }) {
  const [activeTab, setActiveTab]     = useState("overview");

  // Overview state
  const [monthCash, setMonthCash]     = useState(null);
  const [monthAvg, setMonthAvg]       = useState(null);
  const [monthHours, setMonthHours]   = useState(0);
  const [overview, setOverview]       = useState(null);
  const [byCategory, setByCategory]   = useState([]);
  const [bySubtype, setBySubtype]     = useState([]);
  const [topClients, setTopClients]   = useState([]);
  const [clientSplit, setClientSplit] = useState(null);
  const [weeklyHours, setWeeklyHours] = useState([]);
  const [pipeline, setPipeline]       = useState(null);

  // Personal state
  const [personalThisMonth, setPersonalThisMonth] = useState([]);
  const [personalTrend, setPersonalTrend]           = useState([]);

  // Social state
  const [ytSnaps, setYtSnaps] = useState([]);
  const [igSnaps, setIgSnaps] = useState([]);
  const [ttSnaps, setTtSnaps] = useState([]);

  useEffect(() => { loadAll(); }, []);

  async function loadAll() {
    const [mw, mavg, mh, ov, cats, subs, cls, split, wh, pip, pmth, ptrend, ytq, igq, ttq] =
      await Promise.all([
        // Cash received via payments this month (by received_on date)
        query(`
          SELECT COALESCE(SUM(amount_cents), 0) AS received,
                 COUNT(DISTINCT project_id) AS count
          FROM payments
          WHERE strftime('%Y-%m', received_on) = strftime('%Y-%m', 'now')
        `),
        // 3-month trailing average of monthly cash received
        query(`
          SELECT AVG(monthly) AS avg_received
          FROM (
            SELECT strftime('%Y-%m', received_on) AS m,
                   SUM(amount_cents) AS monthly
            FROM payments
            WHERE strftime('%Y-%m', received_on) < strftime('%Y-%m', 'now')
              AND received_on >= date('now', '-3 months', 'start of month')
            GROUP BY m
          ) sub
        `),
        // Hours logged this calendar month
        query(`
          SELECT COALESCE(SUM(hours), 0) AS hours
          FROM time_logs
          WHERE strftime('%Y-%m', date) = strftime('%Y-%m', 'now')
        `),
        // All-time stats from shipped commissions
        query(`
          SELECT COUNT(DISTINCT p.id) AS total,
                 COALESCE(SUM(p.sale_price_cents), 0) AS revenue,
                 COALESCE(SUM(p.sale_price_cents - p.material_cost_cents), 0) AS profit,
                 COALESCE(SUM(tl.hours), 0) AS hours
          FROM projects p
          LEFT JOIN time_logs tl ON tl.project_id = p.id
          WHERE p.shipped = 1 AND p.project_type = 'commission'
        `),
        query(`
          SELECT cat.category,
                 COUNT(DISTINCT p.id) AS count,
                 COALESCE(SUM(p.sale_price_cents), 0) AS revenue,
                 COALESCE(SUM(p.sale_price_cents - p.material_cost_cents), 0) AS profit,
                 COALESCE(SUM(tl.hours), 0) AS hours
          FROM projects p
          JOIN categories cat ON p.category_id = cat.id
          LEFT JOIN time_logs tl ON tl.project_id = p.id
          WHERE p.shipped = 1
          GROUP BY cat.category
          ORDER BY profit DESC
        `),
        query(`
          SELECT cat.category, cat.subtype,
                 COUNT(DISTINCT p.id) AS count,
                 COALESCE(SUM(p.sale_price_cents), 0) AS revenue,
                 COALESCE(SUM(p.sale_price_cents - p.material_cost_cents), 0) AS profit,
                 COALESCE(SUM(tl.hours), 0) AS hours
          FROM projects p
          JOIN categories cat ON p.category_id = cat.id
          LEFT JOIN time_logs tl ON tl.project_id = p.id
          WHERE p.shipped = 1
          GROUP BY cat.category, cat.subtype
          ORDER BY profit DESC
        `),
        query(`
          SELECT c.name,
                 COUNT(p.id) AS commissions,
                 COALESCE(SUM(p.sale_price_cents), 0) AS lifetime_value
          FROM clients c
          JOIN projects p ON p.client_id = c.id
          WHERE p.shipped = 1
          GROUP BY c.id
          ORDER BY lifetime_value DESC
          LIMIT 5
        `),
        query(`
          SELECT
            COUNT(DISTINCT CASE WHEN sub.cnt = 1 THEN sub.client_id END) AS new_clients,
            COUNT(DISTINCT CASE WHEN sub.cnt > 1 THEN sub.client_id END) AS repeat_clients
          FROM (
            SELECT client_id, COUNT(*) AS cnt
            FROM projects
            WHERE shipped = 1 AND client_id IS NOT NULL
            GROUP BY client_id
          ) sub
        `),
        query(`
          SELECT strftime('%Y-W%W', date) AS week,
                 MIN(date) AS week_start,
                 ROUND(SUM(hours), 2) AS hours
          FROM time_logs
          WHERE date >= date('now', '-70 days')
          GROUP BY week
          ORDER BY week
        `),
        query(`
          SELECT COUNT(*) AS count,
                 COALESCE(SUM(sale_price_cents), 0) AS value
          FROM projects
          WHERE shipped = 0 AND delivered = 0
            AND sale_price_cents IS NOT NULL
            AND project_type = 'commission'
        `),
        // Personal: this month by category
        query(`
          SELECT p.personal_category AS cat,
                 COUNT(DISTINCT p.id) AS count,
                 COALESCE((
                   SELECT SUM(hours) FROM time_logs WHERE project_id = p.id
                 ), 0) AS hours
          FROM projects p
          WHERE p.project_type = 'personal'
            AND strftime('%Y-%m', p.created_at) = strftime('%Y-%m', 'now')
          GROUP BY p.personal_category
        `),
        // Personal: last 6 months trend by category
        query(`
          SELECT strftime('%Y-%m', created_at) AS month,
                 personal_category AS cat,
                 COUNT(*) AS count
          FROM projects
          WHERE project_type = 'personal'
            AND created_at >= date('now', '-6 months', 'start of month')
          GROUP BY month, personal_category
          ORDER BY month
        `),
        // Social snapshots — last 30 days
        query(`SELECT recorded_on, value FROM social_snapshots
               WHERE platform='youtube' AND metric='subscribers'
                 AND recorded_on >= date('now', '-30 days')
               ORDER BY recorded_on`),
        query(`SELECT recorded_on, value FROM social_snapshots
               WHERE platform='instagram' AND metric='followers'
                 AND recorded_on >= date('now', '-30 days')
               ORDER BY recorded_on`),
        query(`SELECT recorded_on, value FROM social_snapshots
               WHERE platform='tiktok' AND metric='followers'
                 AND recorded_on >= date('now', '-30 days')
               ORDER BY recorded_on`),
      ]);

    setMonthCash(mw[0] ?? null);
    setMonthAvg(mavg[0] ?? null);
    setMonthHours(mh[0]?.hours ?? 0);
    setOverview(ov[0] ?? null);
    setByCategory(cats);
    setBySubtype(subs);
    setTopClients(cls);
    setClientSplit(split[0] ?? null);
    setWeeklyHours(wh);
    setPipeline(pip[0] ?? null);
    setPersonalThisMonth(pmth);
    setPersonalTrend(ptrend);
    setYtSnaps(ytq);
    setIgSnaps(igq);
    setTtSnaps(ttq);
  }

  const noShipped = !overview || overview.total === 0;

  const maxCatRevenue  = Math.max(...byCategory.map(c => c.revenue), 1);
  const maxSubProfit   = Math.max(...bySubtype.map(s => s.profit), 1);
  const maxClientVal   = Math.max(...topClients.map(c => c.lifetime_value), 1);
  const maxWeekHours   = Math.max(...weeklyHours.map(w => w.hours), 1);

  function observation() {
    if (byCategory.length < 2) return null;
    const withHours = byCategory.filter(c => c.hours > 0 && c.revenue > 0);
    if (withHours.length < 2) return null;
    const [a, b] = withHours;
    const aRate = a.profit / a.hours / 100;
    const bRate = b.profit / b.hours / 100;
    if (Math.abs(aRate - bRate) < 2) return null;
    const hi = aRate > bRate ? a : b;
    const lo = aRate > bRate ? b : a;
    const diff = Math.round((Math.max(aRate, bRate) / Math.min(aRate, bRate) - 1) * 100);
    return `${hi.category.charAt(0).toUpperCase() + hi.category.slice(1)} earns €${Math.max(aRate, bRate).toFixed(0)}/h vs €${Math.min(aRate, bRate).toFixed(0)}/h for ${lo.category} — about ${diff}% more per hour.`;
  }
  const obs = observation();

  const totalClients = clientSplit ? clientSplit.new_clients + clientSplit.repeat_clients : 0;
  const now = new Date();
  const monthLabel = `${MONTH_NAMES[now.getMonth()]} ${now.getFullYear()}`;
  const cashReceived = monthCash?.received ?? 0;
  const avgReceived  = monthAvg?.avg_received ?? 0;
  const trend = avgReceived > 0 ? trendArrow(cashReceived, avgReceived) : null;

  // Personal trend data processing
  const trendMonths = [...new Set(personalTrend.map(r => r.month))].sort();
  const trendByCat = {};
  for (const r of personalTrend) {
    if (!trendByCat[r.cat]) trendByCat[r.cat] = {};
    trendByCat[r.cat][r.month] = r.count;
  }
  const activeTrendCats = Object.keys(trendByCat).sort();

  return (
    <div className="page">
      <div className="page-header">
        <h1>Dashboard</h1>
        <div className="dash-tab-bar">
          <button
            className={`dash-tab${activeTab === "overview" ? " active" : ""}`}
            onClick={() => setActiveTab("overview")}>Overview</button>
          <button
            className={`dash-tab${activeTab === "personal" ? " active" : ""}`}
            onClick={() => setActiveTab("personal")}>Personal</button>
        </div>
      </div>

      {/* ──────────────── OVERVIEW TAB ──────────────── */}
      {activeTab === "overview" && <>
        {/* Monthly wage — cash received */}
        <div className="month-wage-card">
          <div className="month-wage-left">
            <div className="month-wage-label">{monthLabel}</div>
            <div className="month-wage-value">{formatEuro(cashReceived)}</div>
            <div className="month-wage-sub">
              {(monthCash?.count ?? 0) > 0
                ? `Payments from ${monthCash.count} commission${monthCash.count !== 1 ? "s" : ""}`
                : "No payments recorded this month"}
              {monthHours > 0 && ` · ${monthHours}h worked`}
            </div>
          </div>
          <div className="month-wage-right">
            {trend && (
              <div className={`month-wage-trend ${trend.cls}`}>
                <span className="trend-icon">{trend.icon}</span>
                <span className="trend-label">{trend.label}</span>
              </div>
            )}
            {avgReceived > 0 && (
              <div className="month-wage-avg">
                3-month avg: {formatEuro(Math.round(avgReceived))}
              </div>
            )}
            {!avgReceived && (
              <div className="month-wage-avg muted">Record payments to see trend</div>
            )}
          </div>
        </div>

        {/* Summary cards */}
        <div className="stat-grid">
          <StatCard
            label="Total revenue"
            value={overview ? formatEuro(overview.revenue) : "—"}
            note={overview?.total > 0
              ? `${overview.total} commission${overview.total !== 1 ? "s" : ""} shipped`
              : "No shipped commissions yet"}
          />
          <StatCard
            label="Total profit"
            value={overview ? formatEuro(overview.profit) : "—"}
            note={overview?.revenue > 0
              ? `${((overview.profit / overview.revenue) * 100).toFixed(1)}% overall margin`
              : undefined}
          />
          <StatCard
            label="Avg €/hour"
            value={overview?.hours > 0
              ? `€${(overview.profit / 100 / overview.hours).toFixed(2)}`
              : "—"}
            note={overview?.hours > 0
              ? `across ${overview.hours}h logged`
              : "Log time on commissions to see this"}
          />
          <StatCard
            label="Active pipeline"
            value={pipeline ? formatEuro(pipeline.value) : "—"}
            note={pipeline?.count > 0
              ? `${pipeline.count} commission${pipeline.count !== 1 ? "s" : ""} in progress`
              : "No open commissions"}
          />
        </div>

        {obs && (
          <div className="dash-observation">
            <strong>Observation:</strong> {obs}
          </div>
        )}

        {/* Category breakdown */}
        <DashSection title="By Category" hint="Shipped commissions only">
          {noShipped
            ? <Empty msg="Ship commissions to see category data." />
            : (
              <div className="dash-cat-list">
                {byCategory.map(cat => (
                  <div key={cat.category} className="dash-cat-row">
                    <div className="dash-cat-head">
                      <span className="badge">{cat.category}</span>
                      <span className="dash-cat-count">{cat.count} job{cat.count !== 1 ? "s" : ""}</span>
                      <span className="dash-cat-stats">
                        {formatEuro(cat.revenue)} revenue · {formatEuro(cat.profit)} profit
                        {cat.hours > 0 && ` · ${formatEuroPerHour(cat.profit, cat.hours)}/h`}
                      </span>
                    </div>
                    <div className="dash-cat-bars">
                      <div className="dash-cat-bar-row">
                        <span className="dash-bar-lbl">Revenue</span>
                        <HBar value={cat.revenue} max={maxCatRevenue} />
                        <span className="dash-bar-rval">{formatEuro(cat.revenue)}</span>
                      </div>
                      <div className="dash-cat-bar-row">
                        <span className="dash-bar-lbl">Profit</span>
                        <HBar value={cat.profit} max={maxCatRevenue} color="var(--positive)" />
                        <span className="dash-bar-rval">{formatEuro(cat.profit)}</span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )
          }
        </DashSection>

        {/* Subtype breakdown */}
        <DashSection title="By Work Type" hint="Ranked by profit — ⚠ flags margin below 20%">
          {noShipped
            ? <Empty msg="Ship commissions to see work type data." />
            : (
              <div className="table-wrap">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>Type</th><th>Jobs</th><th>Revenue</th>
                      <th>Profit</th><th>Margin</th><th>€/hour</th>
                      <th style={{ width: "120px" }}>Profit bar</th>
                    </tr>
                  </thead>
                  <tbody>
                    {bySubtype.map(s => {
                      const thinMargin = s.revenue > 0 && (s.profit / s.revenue) < 0.2;
                      return (
                        <tr key={`${s.category}-${s.subtype}`}>
                          <td>
                            <span className="badge">{s.category}</span>{" "}
                            {s.subtype}
                            {thinMargin && <span className="dash-warn" title="Thin margin (under 20%)"> ⚠</span>}
                          </td>
                          <td>{s.count}</td>
                          <td>{formatEuro(s.revenue)}</td>
                          <td className={s.profit >= 0 ? "positive" : "negative"}>{formatEuro(s.profit)}</td>
                          <td>{formatMargin(s.profit, s.revenue)}</td>
                          <td>{s.hours > 0 ? formatEuroPerHour(s.profit, s.hours) : "—"}</td>
                          <td><HBar value={s.profit} max={maxSubProfit} /></td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )
          }
        </DashSection>

        {/* Weekly hours */}
        <DashSection title="Weekly Hours" hint="Last 10 weeks">
          {weeklyHours.length === 0
            ? <Empty msg="No time logs yet." />
            : (
              <div className="dash-week-chart">
                {weeklyHours.map((w, i) => (
                  <div key={i} className="dash-week-col">
                    <span className="dash-week-val">{w.hours > 0 ? `${w.hours}h` : ""}</span>
                    <div className="dash-week-track">
                      <div
                        className="dash-week-fill"
                        style={{ height: `${pct(w.hours, maxWeekHours)}%` }}
                      />
                    </div>
                    <span className="dash-week-lbl">{fmtWeek(w.week_start)}</span>
                  </div>
                ))}
              </div>
            )
          }
        </DashSection>

        {/* Client insights */}
        <div className="dash-two-col">
          <DashSection title="Top Clients" hint="By revenue">
            {topClients.length === 0
              ? <Empty msg="No clients on shipped commissions yet." />
              : (
                <div className="dash-client-list">
                  {topClients.map((c, i) => (
                    <div key={i} className="dash-client-row">
                      <span className="dash-rank">#{i + 1}</span>
                      <div className="dash-client-info">
                        <span className="dash-client-name">{c.name}</span>
                        <span className="dash-client-meta">{c.commissions} commission{c.commissions !== 1 ? "s" : ""}</span>
                      </div>
                      <div className="dash-client-right">
                        <span className="dash-client-val">{formatEuro(c.lifetime_value)}</span>
                        <HBar value={c.lifetime_value} max={maxClientVal} />
                      </div>
                    </div>
                  ))}
                </div>
              )
            }
          </DashSection>

          <DashSection title="Client Mix" hint="Of shipped commissions">
            {totalClients === 0
              ? <Empty msg="No client data yet." />
              : (
                <div className="dash-split">
                  <div className="dash-split-item">
                    <span className="dash-split-num">{clientSplit.new_clients}</span>
                    <span className="dash-split-lbl">New clients</span>
                  </div>
                  <div className="dash-split-sep" />
                  <div className="dash-split-item">
                    <span className="dash-split-num">{clientSplit.repeat_clients}</span>
                    <span className="dash-split-lbl">Repeat clients</span>
                  </div>
                  {clientSplit.repeat_clients > 0 && (
                    <p className="dash-split-note">
                      {Math.round((clientSplit.repeat_clients / totalClients) * 100)}% of your clients have returned.
                    </p>
                  )}
                </div>
              )
            }
          </DashSection>
        </div>
      </>}

      {/* ──────────────── PERSONAL TAB ──────────────── */}
      {activeTab === "personal" && <>
        {/* This month summary */}
        <DashSection title="This Month" hint={monthLabel}>
          {personalThisMonth.length === 0 ? (
            <Empty msg="No personal projects created this month yet." />
          ) : (
            <div className="stat-grid">
              {PERSONAL_CAT_META.map(m => {
                const d = personalThisMonth.find(p => p.cat === m.key);
                if (!d) return null;
                return (
                  <div key={m.key} className="stat-card personal-stat-card"
                    style={{ borderTop: `3px solid ${m.color}` }}>
                    <div className="stat-label">{m.label}</div>
                    <div className="stat-value">{d.count}</div>
                    <div className="stat-note">
                      {d.hours > 0 ? `${d.hours}h logged` : "No time logged yet"}
                    </div>
                  </div>
                );
              }).filter(Boolean)}
            </div>
          )}
        </DashSection>

        {/* Content output trend */}
        <DashSection title="Content Output" hint="Projects created, by month">
          {activeTrendCats.length === 0 ? (
            <Empty msg="Create personal projects to see your output trend." />
          ) : (
            <div className="personal-trend-wrap">
              {/* Month labels row */}
              <div className="personal-trend-row personal-trend-header">
                <span className="personal-trend-cat-cell" />
                {trendMonths.map(m => (
                  <span key={m} className="personal-trend-month-cell">{fmtMonth(m)}</span>
                ))}
              </div>
              {/* Data rows */}
              {activeTrendCats.map(cat => {
                const counts = trendMonths.map(m => trendByCat[cat]?.[m] ?? 0);
                const maxCount = Math.max(...counts, 1);
                const color = personalColor(cat);
                return (
                  <div key={cat} className="personal-trend-row">
                    <span className="personal-trend-cat-cell" style={{ color }}>
                      {personalLabel(cat)}
                    </span>
                    {trendMonths.map((m, i) => (
                      <div key={m} className="personal-trend-month-cell">
                        <div className="personal-trend-bar-wrap">
                          <div
                            className="personal-trend-bar"
                            style={{
                              height: `${Math.max(4, (counts[i] / maxCount) * 48)}px`,
                              background: color,
                              opacity: counts[i] === 0 ? 0.12 : 1,
                            }}
                          />
                        </div>
                        <span className="personal-trend-num">
                          {counts[i] > 0 ? counts[i] : ""}
                        </span>
                      </div>
                    ))}
                  </div>
                );
              })}
            </div>
          )}
        </DashSection>

        {/* Hours by category */}
        {personalThisMonth.some(p => p.hours > 0) && (
          <DashSection title="Hours This Month" hint="Per project type">
            <div className="dash-cat-list">
              {personalThisMonth.filter(p => p.hours > 0).map(p => {
                const maxH = Math.max(...personalThisMonth.map(x => x.hours), 1);
                return (
                  <div key={p.cat} className="dash-cat-row">
                    <div className="dash-cat-head">
                      <span className="personal-badge" style={{ background: personalColor(p.cat) }}>
                        {personalLabel(p.cat)}
                      </span>
                      <span className="dash-cat-count">{p.count} project{p.count !== 1 ? "s" : ""}</span>
                      <span className="dash-cat-stats">{p.hours}h total</span>
                    </div>
                    <div className="dash-cat-bars">
                      <div className="dash-cat-bar-row">
                        <span className="dash-bar-lbl">Hours</span>
                        <HBar value={p.hours} max={maxH} color={personalColor(p.cat)} />
                        <span className="dash-bar-rval">{p.hours}h</span>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </DashSection>
        )}

        {/* Social Media */}
        <DashSection
          title="Social Media"
          hint={
            <button className="btn-ghost sm" style={{ fontSize: "0.75rem", padding: "2px 10px" }}
              onClick={onRefreshSocial}>
              Refresh
            </button>
          }
        >
          <div className="social-dash-row">
            {SOCIAL_PLATFORMS.map(p => {
              const snaps = p.id === "youtube" ? ytSnaps
                          : p.id === "instagram" ? igSnaps : ttSnaps;
              const latest    = socialLatest(snaps);
              const dailyG    = socialGrowth(snaps, 1);
              const weekG     = socialGrowth(snaps, 7);
              const configured = p.id === "youtube"   ? !!socialConfig?.yt_api_key
                               : p.id === "instagram" ? !!(socialConfig?.ig_access_token && socialConfig?.ig_user_id)
                               : true;
              return (
                <div key={p.id} className="social-dash-card">
                  <div className="social-dash-name" style={{ color: p.color }}>{p.label}</div>
                  {latest !== null ? (
                    <>
                      <div className="social-dash-count">{latest.toLocaleString("en-GB")}</div>
                      <div className="social-dash-metric">{p.metric}</div>
                      <div className="social-dash-growths">
                        {dailyG !== null
                          ? <span className={dailyG >= 0 ? "positive" : "negative"}>{dailyG >= 0 ? "+" : ""}{dailyG} today</span>
                          : <span className="muted">— today</span>
                        }
                        {weekG !== null && (
                          <span className="muted"> · {weekG >= 0 ? "+" : ""}{weekG} this week</span>
                        )}
                      </div>
                      <MiniChart snapshots={snaps} color={p.color} />
                    </>
                  ) : (
                    <div className="social-dash-empty">
                      {configured ? "No data yet" : "Not set up — see Settings"}
                    </div>
                  )}
                  {socialErrors?.[p.id] && (
                    <div className="social-dash-error">⚠ {socialErrors[p.id]}</div>
                  )}
                </div>
              );
            })}
          </div>
          {!socialConfig?.yt_api_key && !socialConfig?.ig_access_token && (
            <p style={{ fontSize: "0.78rem", color: "var(--muted)", marginTop: 10, fontStyle: "italic" }}>
              Connect YouTube and Instagram in Settings to see live data. TikTok can be updated manually.
            </p>
          )}
        </DashSection>
      </>}
    </div>
  );
}
