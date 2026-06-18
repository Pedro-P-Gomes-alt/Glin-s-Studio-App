import { useState, useEffect } from "react";
import { query } from "../db";
import { formatEuro, formatEuroPerHour, formatMargin } from "../utils/money";

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

export default function Dashboard() {
  const [monthWage, setMonthWage]     = useState(null);
  const [monthAvg, setMonthAvg]       = useState(null);
  const [monthHours, setMonthHours]   = useState(0);
  const [overview, setOverview]       = useState(null);
  const [byCategory, setByCategory]   = useState([]);
  const [bySubtype, setBySubtype]     = useState([]);
  const [topClients, setTopClients]   = useState([]);
  const [clientSplit, setClientSplit] = useState(null);
  const [weeklyHours, setWeeklyHours] = useState([]);
  const [pipeline, setPipeline]       = useState(null);

  useEffect(() => { loadAll(); }, []);

  async function loadAll() {
    const [mw, mavg, mh, ov, cats, subs, cls, split, wh, pip] = await Promise.all([
      // This month's shipped profit
      query(`
        SELECT COALESCE(SUM(p.sale_price_cents - p.material_cost_cents), 0) AS profit,
               COALESCE(SUM(p.sale_price_cents), 0) AS revenue,
               COUNT(DISTINCT p.id) AS count
        FROM projects p
        WHERE p.shipped = 1
          AND strftime('%Y-%m', COALESCE(p.shipped_at, p.created_at)) = strftime('%Y-%m', 'now')
      `),
      // Previous 3-month average
      query(`
        SELECT AVG(mp) AS avg_profit, AVG(mr) AS avg_revenue, COUNT(*) AS months
        FROM (
          SELECT strftime('%Y-%m', COALESCE(shipped_at, created_at)) AS m,
                 SUM(sale_price_cents - material_cost_cents) AS mp,
                 SUM(sale_price_cents) AS mr
          FROM projects
          WHERE shipped = 1
            AND strftime('%Y-%m', COALESCE(shipped_at, created_at)) < strftime('%Y-%m', 'now')
            AND COALESCE(shipped_at, created_at) >= date('now', '-3 months', 'start of month')
          GROUP BY m
        ) sub
      `),
      // Hours logged this calendar month
      query(`
        SELECT COALESCE(SUM(hours), 0) AS hours
        FROM time_logs
        WHERE strftime('%Y-%m', date) = strftime('%Y-%m', 'now')
      `),
      query(`
        SELECT COUNT(DISTINCT p.id) AS total,
               COALESCE(SUM(p.sale_price_cents), 0) AS revenue,
               COALESCE(SUM(p.sale_price_cents - p.material_cost_cents), 0) AS profit,
               COALESCE(SUM(tl.hours), 0) AS hours
        FROM projects p
        LEFT JOIN time_logs tl ON tl.project_id = p.id
        WHERE p.shipped = 1
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
        WHERE shipped = 0 AND delivered = 0 AND sale_price_cents IS NOT NULL
      `),
    ]);

    setMonthWage(mw[0] ?? null);
    setMonthAvg(mavg[0] ?? null);
    setMonthHours(mh[0]?.hours ?? 0);
    setOverview(ov[0] ?? null);
    setByCategory(cats);
    setBySubtype(subs);
    setTopClients(cls);
    setClientSplit(split[0] ?? null);
    setWeeklyHours(wh);
    setPipeline(pip[0] ?? null);
  }

  const noShipped = !overview || overview.total === 0;

  const maxCatRevenue  = Math.max(...byCategory.map(c => c.revenue), 1);
  const maxSubProfit   = Math.max(...bySubtype.map(s => s.profit), 1);
  const maxClientVal   = Math.max(...topClients.map(c => c.lifetime_value), 1);
  const maxWeekHours   = Math.max(...weeklyHours.map(w => w.hours), 1);

  // One observation when we have enough data
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
  const trend = monthWage && monthAvg?.avg_profit
    ? trendArrow(monthWage.profit, monthAvg.avg_profit)
    : null;

  return (
    <div className="page">
      <div className="page-header">
        <h1>Dashboard</h1>
      </div>

      {/* ── Monthly wage ── */}
      <div className="month-wage-card">
        <div className="month-wage-left">
          <div className="month-wage-label">{monthLabel}</div>
          <div className="month-wage-value">
            {formatEuro(monthWage?.profit ?? 0)}
          </div>
          <div className="month-wage-sub">
            {monthWage?.count > 0
              ? `${monthWage.count} commission${monthWage.count !== 1 ? "s" : ""} shipped`
              : "No commissions shipped yet this month"}
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
          {monthAvg?.avg_profit > 0 && (
            <div className="month-wage-avg">
              3-month avg: {formatEuro(Math.round(monthAvg.avg_profit))}
            </div>
          )}
          {!monthAvg?.avg_profit && (
            <div className="month-wage-avg muted">Ship commissions to see trend</div>
          )}
        </div>
      </div>

      {/* ── Summary cards ── */}
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

      {/* ── Category breakdown ── */}
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

      {/* ── Subtype breakdown ── */}
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

      {/* ── Weekly hours chart ── */}
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

      {/* ── Client insights ── */}
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
    </div>
  );
}
