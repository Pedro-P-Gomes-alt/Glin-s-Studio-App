import { useState, useEffect } from "react";
import { getVersion } from "@tauri-apps/api/app";
import { query, execute } from "../db";
import { resizeImageFile } from "../utils/images";
import { mkdir, writeFile, BaseDirectory } from "@tauri-apps/plugin-fs";
import {
  REPORT_KINDS, REPORT_STATUS, newUid,
  flushUnsentReports, syncReportStatuses, markStatusesSeen,
} from "../utils/reports";

// Paste-able Apps Script for the owner. Deliberately separate from the Quotes
// script: that one is bound to the commission form's Sheet and is already
// deployed — this one gets its own Sheet and its own token.
const APPS_SCRIPT_TEMPLATE = [
  "// Glin's Studio — bug / feature report endpoint",
  "//",
  "// 1. Create a new Google Sheet (any name).",
  "// 2. Extensions > Apps Script, paste this, set SECRET_TOKEN below.",
  "// 3. Deploy > New deployment > Web app.",
  "//    Execute as: Me    |    Who has access: Anyone",
  "// 4. Copy the Web App URL + your token into Settings > Bug reports.",
  "//",
  "// You triage in the Sheet: edit the 'status' column to one of",
  "//   open / in progress / fixed / wont do",
  "// and optionally fill in 'reply' and 'fixed_in'. The app pulls those back",
  "// and shows them to Glin.",
  "",
  "const SECRET_TOKEN  = 'CHANGE_THIS_TO_SOMETHING_SECRET';",
  "const NOTIFY_EMAIL  = 'pedrom.gomes@outlook.pt';",
  "const IMAGE_FOLDER  = \"Glin's Studio reports\";",
  "",
  "const HEADERS = ['uid', 'received', 'type', 'title', 'description',",
  "                 'app version', 'page', 'status', 'reply', 'fixed_in', 'images'];",
  "",
  "function sheet_() {",
  "  const ss = SpreadsheetApp.getActiveSpreadsheet();",
  "  let sh = ss.getSheetByName('Reports');",
  "  if (!sh) {",
  "    sh = ss.insertSheet('Reports');",
  "    sh.appendRow(HEADERS);",
  "    sh.setFrozenRows(1);",
  "  }",
  "  return sh;",
  "}",
  "",
  "function folder_() {",
  "  const it = DriveApp.getFoldersByName(IMAGE_FOLDER);",
  "  return it.hasNext() ? it.next() : DriveApp.createFolder(IMAGE_FOLDER);",
  "}",
  "",
  "function json_(obj) {",
  "  return ContentService.createTextOutput(JSON.stringify(obj))",
  "    .setMimeType(ContentService.MimeType.JSON);",
  "}",
  "",
  "function normStatus_(v) {",
  "  const s = String(v || 'open').toLowerCase().trim().replace(/[^a-z]+/g, '_');",
  "  if (s.indexOf('progress') >= 0) return 'in_progress';",
  "  if (s.indexOf('fix') === 0 || s === 'fixed' || s === 'done') return 'fixed';",
  "  if (s.indexOf('wont') === 0 || s.indexOf('no') === 0) return 'wont_fix';",
  "  return 'open';",
  "}",
  "",
  "function findRow_(sh, uid) {",
  "  const last = sh.getLastRow();",
  "  if (last < 2) return 0;",
  "  const uids = sh.getRange(2, 1, last - 1, 1).getValues();",
  "  for (let i = 0; i < uids.length; i++) {",
  "    if (String(uids[i][0]) === String(uid)) return i + 2;",
  "  }",
  "  return 0;",
  "}",
  "",
  "function doPost(e) {",
  "  try {",
  "    const body = JSON.parse(e.postData.contents);",
  "    if (body.token !== SECRET_TOKEN) return json_({ error: 'Unauthorized' });",
  "",
  "    const blobs = (body.images || []).map(function (img, i) {",
  "      return Utilities.newBlob(",
  "        Utilities.base64Decode(img.data),",
  "        img.mime || 'image/jpeg',",
  "        img.name || ('shot' + (i + 1) + '.jpg'));",
  "    });",
  "",
  "    const folder = blobs.length ? folder_() : null;",
  "    const links = blobs.map(function (b) { return folder.createFile(b).getUrl(); });",
  "",
  "    const sh  = sheet_();",
  "    const row = findRow_(sh, body.uid);",
  "    // Columns A-G and K only: never clobber the status/reply you typed.",
  "    const head = [body.uid, new Date(), body.kind, body.title,",
  "                  body.description, body.appVersion, body.page];",
  "    if (row) {",
  "      sh.getRange(row, 1, 1, head.length).setValues([head]);",
  "      sh.getRange(row, 11).setValue(links.join('\\n'));",
  "    } else {",
  "      sh.appendRow(head.concat(['open', '', '', links.join('\\n')]));",
  "    }",
  "",
  "    MailApp.sendEmail({",
  "      to: NOTIFY_EMAIL,",
  "      subject: '[Glin] ' + body.kind + ': ' + body.title,",
  "      body: body.description +",
  "            '\\n\\n---' +",
  "            '\\nType: '    + body.kind +",
  "            '\\nVersion: ' + body.appVersion +",
  "            '\\nPage: '    + body.page +",
  "            '\\nuid: '     + body.uid,",
  "      attachments: blobs",
  "    });",
  "",
  "    return json_({ ok: true });",
  "  } catch (err) {",
  "    return json_({ error: err.toString() });",
  "  }",
  "}",
  "",
  "function doGet(e) {",
  "  if (!e || !e.parameter || e.parameter.token !== SECRET_TOKEN) {",
  "    return json_({ error: 'Unauthorized' });",
  "  }",
  "  try {",
  "    const sh = sheet_();",
  "    const last = sh.getLastRow();",
  "    if (last < 2) return json_({ reports: [] });",
  "    const rows = sh.getRange(2, 1, last - 1, HEADERS.length).getValues();",
  "    const reports = rows.filter(function (r) { return r[0]; }).map(function (r) {",
  "      return {",
  "        uid:      String(r[0]),",
  "        status:   normStatus_(r[7]),",
  "        reply:    r[8] ? String(r[8]) : '',",
  "        fixed_in: r[9] ? String(r[9]) : ''",
  "      };",
  "    });",
  "    return json_({ reports: reports });",
  "  } catch (err) {",
  "    return json_({ error: err.toString() });",
  "  }",
  "}",
].join("\n");

const IMAGES_DIR = "images";

function fmtWhen(iso) {
  if (!iso) return "—";
  try {
    return new Date(iso.includes("T") ? iso : iso.replace(" ", "T") + "Z")
      .toLocaleDateString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
  } catch { return iso; }
}

// ── The form ───────────────────────────────────────────────────────────
function ReportForm({ config, currentPage, onSent }) {
  const [kind, setKind] = useState("bug");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [files, setFiles] = useState([]);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState(null);

  function addFiles(e) {
    const picked = Array.from(e.target.files ?? []);
    setFiles(f => [...f, ...picked].slice(0, 5));
    e.target.value = "";
  }

  async function handleSubmit(e) {
    e.preventDefault();
    if (!title.trim() || busy) return;
    setBusy(true);
    setResult(null);
    try {
      const uid = newUid();
      let version = null;
      try { version = await getVersion(); } catch {}

      await execute(
        `INSERT INTO bug_reports (uid, kind, title, description, app_version, page)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [uid, kind, title.trim(), description.trim(), version, currentPage ?? null]
      );
      const [{ id }] = await query(`SELECT id FROM bug_reports WHERE uid = ?`, [uid]);

      // Same storage contract as project images: resized client-side, written
      // under <AppData>/images, DB keeps the relative path.
      if (files.length) {
        await mkdir(IMAGES_DIR, { baseDir: BaseDirectory.AppData, recursive: true });
        for (const file of files) {
          const bytes = await resizeImageFile(file);
          const name = `report${id}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}.jpg`;
          const relPath = `${IMAGES_DIR}/${name}`;
          await writeFile(relPath, bytes, { baseDir: BaseDirectory.AppData });
          await execute(`INSERT INTO bug_report_images (report_id, image_path) VALUES (?, ?)`,
            [id, relPath]);
        }
      }

      const res = await flushUnsentReports(config);
      setResult(
        res.sent > 0
          ? { ok: true, msg: "Sent — thanks! You'll see the status here once it's looked at." }
          : !res.configured
            ? { ok: false, msg: "Saved, but reporting isn't connected yet — it'll go out once it is." }
            : { ok: false, msg: `Saved, but sending failed (${res.lastError}). It'll retry on its own.` }
      );
      setTitle(""); setDescription(""); setFiles([]); setKind("bug");
      onSent();
    } catch (err) {
      setResult({ ok: false, msg: `Couldn't save the report: ${err.message ?? err}` });
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="sale-form report-form" onSubmit={handleSubmit}>
      <div className="field">
        <label>What kind of thing is it?</label>
        <div className="report-kind-row">
          {Object.entries(REPORT_KINDS).map(([k, meta]) => (
            <button key={k} type="button"
              className={`report-kind${kind === k ? " active" : ""}`}
              onClick={() => setKind(k)}>
              <span className="report-kind-icon">{meta.icon}</span>
              {meta.label}
            </button>
          ))}
        </div>
      </div>

      <div className="field">
        <label>One line summary *</label>
        <input value={title} onChange={e => setTitle(e.target.value)}
          placeholder="e.g. The calendar jumps when I add a long event" required />
      </div>

      <div className="field">
        <label>What happened?</label>
        <textarea rows={5} value={description} onChange={e => setDescription(e.target.value)}
          placeholder="What you were doing, what you expected, what happened instead. No detail is too small." />
      </div>

      <div className="field">
        <label>Screenshots <span className="settings-hint">(up to 5)</span></label>
        <input type="file" accept="image/*" multiple onChange={addFiles} />
        {files.length > 0 && (
          <div className="report-file-list">
            {files.map((f, i) => (
              <span key={i} className="report-file-chip">
                {f.name}
                <button type="button" onClick={() => setFiles(fs => fs.filter((_, j) => j !== i))}>✕</button>
              </span>
            ))}
          </div>
        )}
      </div>

      {result && (
        <p className={`report-result${result.ok ? " is-ok" : ""}`}>{result.msg}</p>
      )}

      <div className="form-actions">
        <button type="submit" className="btn-primary" disabled={busy || !title.trim()}>
          {busy ? "Sending…" : "Send report"}
        </button>
      </div>
    </form>
  );
}

// ── History list ───────────────────────────────────────────────────────
function ReportList({ reports, onRetry, retrying }) {
  if (!reports.length) {
    return <p className="empty-state">You haven't reported anything yet.</p>;
  }
  return (
    <div className="report-list">
      {reports.map(r => {
        const meta = REPORT_STATUS[r.status] ?? REPORT_STATUS.open;
        const queued = !r.sent_at;
        return (
          <div key={r.id} className="report-item">
            <div className="report-item-top">
              <span className="report-item-icon">{REPORT_KINDS[r.kind]?.icon ?? "💬"}</span>
              <span className="report-item-title">{r.title}</span>
              <span className={`report-status ${queued ? "report-status--queued" : meta.cls}`}>
                {queued ? "Not sent yet" : meta.label}
              </span>
            </div>
            <div className="report-item-meta">
              {fmtWhen(r.created_at)}
              {r.fixed_version && <> · fixed in v{r.fixed_version}</>}
              {r.image_count > 0 && <> · {r.image_count} screenshot{r.image_count > 1 ? "s" : ""}</>}
            </div>
            {r.description && <p className="report-item-desc">{r.description}</p>}
            {r.reply && (
              <div className="report-item-reply">
                <span className="report-item-reply-label">Reply</span>
                {r.reply}
              </div>
            )}
            {queued && (
              <div className="report-item-queued">
                {r.send_error && <span className="report-item-error">{r.send_error}</span>}
                <button className="btn-ghost sm" onClick={onRetry} disabled={retrying}>
                  {retrying ? "Trying…" : "Try again now"}
                </button>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

// ── Panel ──────────────────────────────────────────────────────────────
export default function ReportPanel({ config, currentPage, onClose, onChange }) {
  const [tab, setTab] = useState("new");
  const [reports, setReports] = useState([]);
  const [retrying, setRetrying] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => { load(); markStatusesSeen().then(onChange); }, []);

  async function load() {
    setReports(await query(
      `SELECT r.*, (SELECT COUNT(*) FROM bug_report_images i WHERE i.report_id = r.id) AS image_count
         FROM bug_reports r ORDER BY r.id DESC`
    ));
  }

  async function retry() {
    setRetrying(true);
    try {
      await flushUnsentReports(config);
      try { await syncReportStatuses(config); } catch {}
      await load();
    } finally { setRetrying(false); }
  }

  const configured = !!(config?.scriptUrl && config?.token);

  return (
    <div className="overlay" onClick={onClose}>
      <div className="panel" style={{ maxWidth: 560 }} onClick={e => e.stopPropagation()}>
        <div className="panel-header">
          <div>
            <h2>Report a problem</h2>
            <p className="panel-subtitle">Found a bug, or something you wish the app did?</p>
          </div>
          <button className="btn-icon" onClick={onClose}>✕</button>
        </div>

        <div className="report-tabs">
          <button className={`report-tab${tab === "new" ? " active" : ""}`}
            onClick={() => setTab("new")}>New report</button>
          <button className={`report-tab${tab === "sent" ? " active" : ""}`}
            onClick={() => { setTab("sent"); load(); }}>
            Sent {reports.length > 0 && <span className="report-tab-count">{reports.length}</span>}
          </button>
          {/* Only until the endpoint is wired up — then it stops cluttering her view. */}
          {!(config?.scriptUrl && config?.token) && (
            <button className={`report-tab${tab === "setup" ? " active" : ""}`}
              onClick={() => setTab("setup")}>Setup</button>
          )}
        </div>

        <div className="report-body">
          {!configured && tab !== "setup" && (
            <p className="report-warning">
              Reports aren't connected yet, so they'll be saved here and sent once
              the link is set up in Settings.
            </p>
          )}

          {tab === "new" && (
            <ReportForm config={config} currentPage={currentPage}
              onSent={() => { load(); onChange(); }} />
          )}

          {tab === "sent" && <ReportList reports={reports} onRetry={retry} retrying={retrying} />}

          {tab === "setup" && (
            <div className="report-setup">
              <p className="settings-hint">
                Create a Google Sheet, open <b>Extensions &rsaquo; Apps Script</b>, paste this in,
                set your token, then deploy it as a web app and put the URL + token
                into <b>Settings &rsaquo; Bug reports</b>. Triage by editing the <b>status</b>,
                <b> reply</b> and <b>fixed_in</b> columns in the Sheet — the app pulls them back.
              </p>
              <button className="btn-ghost sm" onClick={() => {
                navigator.clipboard.writeText(APPS_SCRIPT_TEMPLATE);
                setCopied(true); setTimeout(() => setCopied(false), 2000);
              }}>{copied ? "Copied!" : "Copy script"}</button>
              <pre className="report-script">{APPS_SCRIPT_TEMPLATE}</pre>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
