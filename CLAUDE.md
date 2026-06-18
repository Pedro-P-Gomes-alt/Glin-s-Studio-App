# CLAUDE.md — Glin's Studio App

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

### Board status precedence (the board is a read-only view of the calendar)
1. Sale price recorded → **Done** (overrides everything).
2. Else today is within planned_start..planned_end → **Doing**.
3. Else planned_start is in the future → **To Do**.
4. Past planned_end with no sale → surface as **overdue / at-risk** (a feature, not a bug). A manual override flag can pin a status if ever needed.

She never drags a card; recording the sale is what marks it done.

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
