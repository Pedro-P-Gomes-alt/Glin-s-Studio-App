// Bug / missing-feature reports.
//
// Same shape as the Quotes integration: a secret-gated Google Apps Script,
// with its URL + token kept in localStorage (config, not business data).
// POST pushes a report (and its screenshots) to the Sheet and emails it on;
// GET pulls the statuses back so Glin sees when something has been fixed.
//
// Reports are written to SQLite first and only then sent, so nothing is lost
// if she's offline — unsent rows are retried on the next launch.

import { readFile } from "@tauri-apps/plugin-fs";
import { BaseDirectory } from "@tauri-apps/plugin-fs";
import { query, execute } from "../db";

export const REPORTS_CONFIG_KEY = "glins_reports_config";

// Baked in at build time from VITE_REPORTS_URL / VITE_REPORTS_TOKEN (set as
// GitHub secrets on the release workflow), so a fresh install is already
// connected and Glin never has to configure anything. A value typed into
// Settings overrides these.
const BUILD_DEFAULTS = {
  scriptUrl: import.meta.env.VITE_REPORTS_URL ?? "",
  token:     import.meta.env.VITE_REPORTS_TOKEN ?? "",
};

export const DEFAULT_REPORTS_CONFIG = { ...BUILD_DEFAULTS };

export function hasBuiltInEndpoint() {
  return !!(BUILD_DEFAULTS.scriptUrl && BUILD_DEFAULTS.token);
}

export const REPORT_KINDS = {
  bug:     { label: "Something is broken", icon: "🐞" },
  feature: { label: "Something is missing", icon: "💡" },
  other:   { label: "Something else",       icon: "💬" },
};

export const REPORT_STATUS = {
  open:        { label: "Sent",        cls: "report-status--open" },
  in_progress: { label: "In progress", cls: "report-status--progress" },
  fixed:       { label: "Fixed",       cls: "report-status--fixed" },
  wont_fix:    { label: "Won't do",    cls: "report-status--wontfix" },
};

export function loadReportsConfig() {
  try {
    const raw = localStorage.getItem(REPORTS_CONFIG_KEY);
    const saved = raw ? JSON.parse(raw) : {};
    // Empty strings must not shadow the build default, hence `||` not `??`.
    return {
      scriptUrl: saved.scriptUrl || BUILD_DEFAULTS.scriptUrl,
      token:     saved.token     || BUILD_DEFAULTS.token,
    };
  } catch { return { ...BUILD_DEFAULTS }; }
}

export function saveReportsConfig(cfg) {
  localStorage.setItem(REPORTS_CONFIG_KEY, JSON.stringify(cfg));
}

export function newUid() {
  return `r${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`;
}

function toBase64(bytes) {
  let bin = "";
  const chunk = 0x8000; // avoid blowing the argument limit on big images
  for (let i = 0; i < bytes.length; i += chunk) {
    bin += String.fromCharCode.apply(null, bytes.subarray(i, i + chunk));
  }
  return btoa(bin);
}

// Apps Script web apps don't answer CORS preflight, so the body goes as
// text/plain — a "simple request" the webview sends without preflighting.
async function postJson(url, payload) {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "text/plain;charset=utf-8" },
    body: JSON.stringify(payload),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const data = await res.json();
  if (data.error) throw new Error(data.error);
  return data;
}

// Push every report that hasn't made it to the Sheet yet. Returns
// { configured, sent, failed, lastError } so the caller can tell "not wired up
// yet" apart from "tried and failed" — they need different wording.
// Safe to call repeatedly: the script upserts on uid.
let flushInFlight = null;

export async function flushUnsentReports(config) {
  if (!config?.scriptUrl || !config?.token) {
    return { configured: false, sent: 0, failed: 0, lastError: null };
  }
  // Serialize. The settings effect, the hourly poll and the manual retry can
  // all fire at once; two passes over the same rows raced and a failing one
  // could stamp send_error onto a report the other had just sent.
  if (flushInFlight) return flushInFlight;
  flushInFlight = doFlush(config).finally(() => { flushInFlight = null; });
  return flushInFlight;
}

async function doFlush(config) {
  const pending = await query(
    `SELECT id, uid, kind, title, description, app_version, page, created_at
       FROM bug_reports WHERE sent_at IS NULL ORDER BY id ASC`
  );
  let sent = 0, failed = 0, lastError = null;
  for (const r of pending) {
    try {
      const imgs = await query(
        `SELECT image_path FROM bug_report_images WHERE report_id = ? ORDER BY id`, [r.id]
      );
      const images = [];
      for (const img of imgs) {
        try {
          const bytes = await readFile(img.image_path, { baseDir: BaseDirectory.AppData });
          images.push({
            name: img.image_path.split("/").pop(),
            mime: "image/jpeg",
            data: toBase64(bytes),
          });
        } catch { /* a missing file shouldn't block the text of the report */ }
      }
      await postJson(config.scriptUrl, {
        token: config.token,
        uid: r.uid,
        kind: r.kind,
        title: r.title,
        description: r.description,
        appVersion: r.app_version,
        page: r.page,
        createdAt: r.created_at,
        images,
      });
      await execute(
        `UPDATE bug_reports SET sent_at = datetime('now'), send_error = NULL WHERE id = ?`,
        [r.id]
      );
      sent++;
    } catch (err) {
      lastError = String(err.message ?? err);
      failed++;
      // `AND sent_at IS NULL` so a stale failure can never mark a sent report
      // as broken.
      await execute(
        `UPDATE bug_reports SET send_error = ? WHERE id = ? AND sent_at IS NULL`,
        [lastError, r.id]);
    }
  }
  return { configured: true, sent, failed, lastError };
}

// Pull statuses back from the Sheet. Returns the reports whose status changed
// to something Glin hasn't seen yet, so the caller can notify her.
export async function syncReportStatuses(config) {
  if (!config?.scriptUrl || !config?.token) return [];
  const res = await fetch(`${config.scriptUrl}?token=${encodeURIComponent(config.token)}`);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const data = await res.json();
  if (!Array.isArray(data.reports)) return [];

  const local = await query(`SELECT id, uid, status, reply, fixed_version FROM bug_reports`);
  const byUid = new Map(local.map(r => [r.uid, r]));
  const changed = [];

  for (const remote of data.reports) {
    const mine = byUid.get(remote.uid);
    if (!mine) continue;
    const status = REPORT_STATUS[remote.status] ? remote.status : "open";
    const reply = remote.reply || null;
    const fixedVersion = remote.fixed_in || null;
    if (status === mine.status && reply === mine.reply && fixedVersion === mine.fixed_version) continue;
    // Only an actual status move is worth interrupting her for; a tweaked
    // reply on an already-seen report updates quietly.
    const notify = status !== mine.status;
    await execute(
      `UPDATE bug_reports
          SET status = ?, reply = ?, fixed_version = ?, status_seen = CASE WHEN ? THEN 0 ELSE status_seen END
        WHERE id = ?`,
      [status, reply, fixedVersion, notify ? 1 : 0, mine.id]
    );
    if (notify) changed.push({ ...mine, status, reply, fixed_version: fixedVersion });
  }
  return changed;
}

export async function countUnseenStatusChanges() {
  const rows = await query(`SELECT COUNT(*) AS n FROM bug_reports WHERE status_seen = 0`);
  return rows[0]?.n ?? 0;
}

export async function markStatusesSeen() {
  await execute(`UPDATE bug_reports SET status_seen = 1 WHERE status_seen = 0`);
}
