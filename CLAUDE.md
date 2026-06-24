# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

---

# Developer guide

> The product brief below ("Glin's Studio App") is the *intent*. This section is how the code
> actually works today. Where they disagree, the code wins — see "Drift from the brief".

## Commands

Run from the repo root.

- `npm install` — install JS deps. (Rust deps build on first Tauri run.)
- `npm run tauri dev` — **the real way to run the app.** Boots Vite + the Tauri Rust shell with
  the SQLite plugin. `npm run dev` alone serves the frontend in a browser, where `@tauri-apps/*`
  calls (DB, fs) fail — only useful for pure-CSS work.
- `npm run build` — `vite build` → `dist/` (also runs automatically before a Tauri bundle).
- `npm run tauri build` — produce the Windows `.msi` installer locally.
- `node scripts/seed.cjs` — wipe all user data and load a year of demo data. Writes **directly to
  the live DB** at `%APPDATA%/com.glins.studio/glins_studio.db` via `better-sqlite3` (a dev-only,
  untracked dep — `npm i better-sqlite3` first). Close the app before running.

There are **no tests, linter, or formatter** configured. Don't invent commands for them.

### Release / auto-update
Pushing a tag `v*` triggers [.github/workflows/release.yml](.github/workflows/release.yml):
`tauri-action` builds the signed `.msi`, then a PowerShell step hand-builds `latest.json` (tauri-action
doesn't emit it reliably for MSI) and uploads it. The app checks that release's `latest.json` on
startup ([src/App.jsx](src/App.jsx) `check()`). **Bump `version` in both [package.json](package.json) and
[src-tauri/tauri.conf.json](src-tauri/tauri.conf.json) before tagging.** Signing keys live in the
`TAURI_SIGNING_*` GitHub secrets; `createUpdaterArtifacts: true` must stay on or no `latest.json` is built.
Also **refresh the `WHATS_NEW` list in [src/App.jsx](src/App.jsx)** each release — it drives the
"What's new" popup that fires once when the running version differs from the `glins_seen_version`
localStorage key.

## Architecture in practice

- **Frontend → DB is direct SQL.** There is no Rust business logic. The Rust side
  ([src-tauri/src/lib.rs](src-tauri/src/lib.rs)) only registers plugins and the migration list. React
  calls `query()` / `execute()` from [src/db.js](src/db.js), which wrap `tauri-plugin-sql` against
  the single SQLite connection `sqlite:glins_studio.db`. **Write SQL strings directly in the page
  components** — that is the established pattern; aggregations belong in the query, not in JS.
- **Schema lives only in migrations.** [src-tauri/migrations/](src-tauri/migrations/) `NNN_*.sql`,
  registered in order in `lib.rs`. To change the schema, add the next-numbered file and append a
  `Migration` entry — never edit an applied migration (users' DBs already ran it). SQLite can't drop
  columns, so column-reshaping migrations rebuild the table (see `006_personal_payments.sql`).
- **No central router/state.** [src/App.jsx](src/App.jsx) holds the active page in `useState` and
  switches on it; each [src/pages/](src/pages/) screen owns its own data loading and reload. Config
  that isn't business data (font settings, the Quotes Apps Script URL+token, social API keys) lives
  in **localStorage**, not SQLite.
- **Images:** [src/utils/images.js](src/utils/images.js) resizes client-side (canvas → JPEG, longest
  side 1600px) and writes to `<AppData>/images/`; the DB stores the **relative path** only. Display
  via `imageSrc()` → `convertFileSrc`. The `assetProtocol` scope `$APPDATA/**` in `tauri.conf.json`
  is what lets the webview load them.

## Conventions (enforced, match them)

- **Money is integer cents**, always. Convert at the edges with [src/utils/money.js](src/utils/money.js)
  (`eurosToCents`, `formatEuro`, `formatMargin`, `formatEuroPerHour`). Never put euros-as-float in the DB.
- **Dates are ISO `YYYY-MM-DD` text.** Use [src/utils/dates.js](src/utils/dates.js). Note `today()`/`addDays()`
  build the string from **local** components on purpose — `toISOString()` shifts the day in non-UTC
  timezones (this was a fixed bug; don't reintroduce it).
- **Derived values are computed on read, never stored:** profit = sale − materials; margin = profit/sale;
  €/h = profit/hours; project hours = `SUM(time_logs.hours)`; project material cost = `SUM(materials.amount_cents)`.
- **Subtypes are controlled vocabulary** from the `categories` table (cosplay/sports only) — never free-text.
- **Styling goes through design tokens** in `:root` of [src/App.css](src/App.css). Never hard-code a
  colour/radius/shadow/spacing a token covers. [DESIGN.md](DESIGN.md) is the source of truth for visuals.

## Drift from the brief (read before trusting the brief on these)

The brief predates several features. Current reality:

- **Board status is NOT "sale price → Done".** [src/pages/Board.jsx](src/pages/Board.jsx) derives columns
  from activity: **To Do** (no time logged) → **Doing** (logged in last 3 days) → **Pending** (3+ days idle)
  → **Shipped** (`shipped=1`). Glin clicks ✓ Delivered / ↩ Returned; the `shipped`/`delivered` flags drive
  it, not `status_override`. `delivered=1` projects drop off the board entirely.
- **Order history lives on Commissions, not the Board.** [src/pages/Sales.jsx](src/pages/Sales.jsx) has a
  **History** toggle (next to **+ New Order**, mirroring the Projects archive) listing finalized commissions
  (`shipped=1 OR delivered=1`); clicking a row opens its `InvoiceDialog`. Marking an order shipped is blocked
  while any balance is unpaid, and on success shows the same invoice (materials, hours, labour, paid).
- **Materials are line items**, not a single field. The `materials` table (project_id, description,
  amount_cents, bought_on) is the live source; the old `projects.material_cost_cents` and
  `subtasks.material_cost_cents` columns still exist but are **no longer read**.
- **Projects are commission *or* personal** (`projects.project_type`, `personal_category`); personal
  projects have a nullable `category_id` and use the `payments` table for incremental income.
- **Beyond the brief's 5 tables:** `subtasks`, `payments`, `materials`, `project_details`,
  `project_measurements`, `project_images`, `quotes`, `reminders`, plus social (`social_snapshots`,
  `yt_videos`, `ig_media`). Commission income can be tracked as `payments` rows, and projects carry
  `estimated_hours` (used for suggested-price readout and estimate-accuracy dashboard).
- **Social dashboard exists** ([src/pages/Social.jsx](src/pages/Social.jsx) + the fetch logic in
  [src/App.jsx](src/App.jsx)): YouTube Data API + Instagram Graph API pulled directly from the webview,
  snapshotted daily into SQLite. The IG token auto-refreshes its 60-day expiry on fetch.
- **Per-commission Workspace** ([src/components/Workspace.jsx](src/components/Workspace.jsx)): stores
  client measurements, notes, and reference images per project in `project_details`,
  `project_measurements`, and `project_images`. Opened read-only when clicking a commission row, or
  in edit mode via the "Details" button.
- **Personal project categories are hardcoded in JS**, not from the `categories` table. The four
  types (`video`, `short`, `competition`, `other`) live in [src/pages/Projects.jsx](src/pages/Projects.jsx).
  Only commission subtypes come from `categories`.
- **Backup routine is not built yet.** The brief describes it; no code implements it.

---

# Product brief — Glin's Studio App

Project brief for Claude Code. Read this first every session.

## What this is

A desktop application for **Glin**, a solo cosmaker and designer (cosplay costumes, props, wigs, and sports suits such as roller-skating dresses). She currently tracks sales, daily work, and upcoming projects by hand in a notebook. This app replaces that notebook with a polished, tailored tool.

Single user. English interface. Currency in **EUR (€)**.

## Architecture (locked)

- **Shell:** Tauri → ships a Windows `.exe`/installer. (Mac build possible later if needed.)
- **Frontend:** React + Vite (web tech, runs in Tauri's webview).
- **Data:** local **SQLite** file in the OS app-data directory, accessed from Tauri's Rust side (e.g. `tauri-plugin-sql` or `rusqlite`) and exposed to the frontend via Tauri commands.
- **Images:** stored in a local folder beside the DB; the DB stores relative paths, not blobs.
- **No cloud backend. No authentication.** She double-clicks the icon and she's in.

The one online touchpoint is the client-request intake (see Alerts). Everything else is fully local and works offline.

### Why these choices
Hosting must be free and she wanted zero setup, data on her own PC, and no login; phone access is not needed. That rules out a hosted web app and removes auth, sync, and any cloud database. Local SQLite has no rate limits or CPU budget, so dashboards can run freely.

## Backup (a first-class feature, not an afterthought)

All her business data lives on one PC, so backups are critical.

- A dedicated Google account is set up purely for backups. **Google Drive for Desktop** runs on her PC signed into that account, creating a synced folder. The app simply **writes backup files into that folder** — no Google API integration. The owner views the data by logging into that account from anywhere.
- On each scheduled backup (and on demand), write **two** files, timestamped:
  1. A consistent **SQLite snapshot** — use `VACUUM INTO` or the SQLite backup API; never copy the live DB file directly.
  2. An **`.xlsx` export** (sales, clients, time logs) for human viewing — Google Drive previews it in Sheets.
- Keep a rolling retention window (e.g. daily for ~7 days, weekly for a few months); prune older copies.
- Provide a one-click **"Export everything"** (DB + images, or a full Excel dump).

## Data model

Five tables. The core idea: **one `projects` record is simultaneously a calendar item, a scrum-board card, and a sale** — no data entered twice.

- **clients** — name, contact/handle, notes, first-seen date. Create inline from a sale.
- **projects** — client_id, category (cosplay | sports), subtype (FK to categories), title, planned_start, planned_end, image path, **material_cost_cents**, sale_price_cents, plus a manual board-status override (nullable). Hours come from `time_logs`, not stored here.
- **time_logs** — date, hours, description, optional project_id. The daily tracker. Hours sum up into the linked project.
- **events** — non-billable calendar items (vacation, contest, convention) with dates and an image. Vacations suppress the overdue-day check.
- **categories** — controlled vocabulary for category/subtype so dashboards don't fragment. Glin can add to it; she cannot free-type subtypes.

### Derived values — compute on read, never store
- profit = sale_price − material_cost
- margin = profit / sale_price
- effective €/hour = profit / total logged hours
- project hours = SUM of linked time_logs

### Board status (the board is a read-only projection of activity, not the calendar)
Columns are derived from time-log activity and the ship/deliver flags, in this order
(see [src/pages/Board.jsx](src/pages/Board.jsx) `getStatus`):
1. `delivered = 1` → drops off the board (history now lives on the Commissions page — see "Drift").
2. `shipped = 1` → **Shipped** — finalized, awaiting delivery confirmation.
3. No time logged yet → **To Do**.
4. Last time log ≥ 3 days ago → **Pending** (idle, at-risk).
5. Otherwise (logged within the last 3 days) → **Doing**.

She never drags a card. Logging time moves a project To Do → Doing; the **✓ Delivered** /
**↩ Returned** buttons toggle the `shipped`/`delivered` flags. (`status_override` exists in the
schema but is not currently used by the board.)

## Engineering guardrails (do not deviate)

- **Money is integer cents.** Never floats. This is the data she cares about most.
- **Dates: one format everywhere** — ISO-8601 text, UTC. No mixed conventions.
- **Aggregations in SQL** (`GROUP BY`, window functions), not by pulling rows into JS.
- **Resize/compress images client-side** before saving — phone photos are several MB.
- Subtypes come from the `categories` table only.

## Features by pillar

### Sales
A short form: pick or create a client, choose category + subtype, enter material cost and sale price. Hours pull from linked time logs. Show profit, margin, and €/hour live as she types.

### Timekeeping
- **Daily log:** date, hours, what she did, optional link to a project.
- **Calendar:** she adds projects and events, sets dates, attaches an image.
- **Scrum board:** read-only projection of the calendar using the status rules above. Auto-updates; she never edits it.

### Dashboards
Profit by category and subtype (what earns most); effective €/hour per category (where to raise/lower pricing); margin warnings on thin jobs; repeat-vs-new client split and client lifetime value; weekly workload.
- **Projections — keep humble.** A solo maker has few sales/month; use a trailing 3-month average framed as a rough indicator, never a precise forecast.
- **Tips as observations, not instructions** — e.g. "sports suits earn less per hour than cosplay," not "raise your prices."

### Alerts (in-app only for now)
- **Unfilled weekdays:** checked when the app opens (and while running). Flags past weekdays with no time log. Skips weekends and any day covered by a vacation event. Shown as a dashboard banner.
- **New client request:** Glin's existing Google Form stays as-is. Forms already write every response to a linked Google Sheet. The app pulls new rows from that Sheet via a small **secret-gated Apps Script endpoint** whenever it's open and online, and shows a badge with a count.
  - **Honest limitation:** no real-time push (her PC has no public address). The badge is only as fresh as the last time she opened the app online. Real-time delivery is deferred.

## Build order

1. **Foundation** — Tauri + React/Vite scaffold, SQLite schema + migrations, app shell (responsive, English).
2. **Sales + Clients** — the form and the live profit/margin/€-hour readout. Highest-value first.
3. **Timekeeping** — daily log, then calendar with images, then the auto-derived scrum board.
4. **Dashboards** — insights first, then humble projections and observation-style tips.
5. **Alerts + Backup** — overdue-day check, Form-Sheet pull + badge, and the Drive-folder backup routine.
6. **Later (v2)** — external notification channel; revisit anything Glin asks for once she's using it.

## Open items to confirm with Glin

- Her **real subtype list** (current assumption: cosplay → dress, prop, wig, full costume; sports → roller-skating dress). Get the actual list so categories and dashboards match how she thinks.
- Whether contests/conventions should appear on the board as their own lane or stay calendar-only.

## Deliberately deferred / accepted

- **Offline:** inherent to the local design — fine.
- **Code signing skipped:** an unsigned `.exe` triggers a one-time Windows SmartScreen "unknown publisher" prompt. Tell Glin "More info → Run anyway" is normal; a signing cert costs money yearly and isn't worth it for a personal app.
- **External notifications:** deferred to v2.
