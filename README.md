# Mini ATS — Applicant Tracking System

A complete full-stack Mini Applicant Tracking System built as the take-home assignment for the **EarlyJobs.ai Full Stack Developer Intern** role (received 2026-10-17, 72-hour deadline).

Track candidates through a hiring pipeline — add profiles, search and filter, drag cards between stages on a kanban board, log interview notes, and watch dashboard metrics update in real time.

## Tech stack

| Layer | Choice |
|---|---|
| Backend | Node.js + Express (single service, no build step) |
| Database | SQLite via Node's built-in `node:sqlite` (Node ≥ 22 — zero native dependencies) |
| Frontend | Single-page app in `public/` — vanilla JS + Tailwind CSS via CDN (no build pipeline) |
| Serving | One Express server serves the REST API under `/api/*` and the static frontend at `/` |

## Features

- **Dashboard** — stat cards (total, in pipeline, hired this month, avg days applied→hired), hiring funnel bars, stage-to-stage conversion %, average days per stage, hires by role, recent activity feed, quick actions
- **Candidates** — live search (name/email/skills/role), stage filter chips with counts, role dropdown, 4 sort orders, pagination, add/edit modal with client + server validation, delete with confirmation, row → detail drawer
- **Pipeline** — kanban board with all 6 stages and HTML5 drag-and-drop stage moves (with toast feedback)
- **Candidate detail drawer** — full profile, stage-change control, notes (add inline), stage-history timeline
- **Data integrity** — required-field + email-format validation (400), duplicate-email detection (409), every stage change appends to `stage_history` and the `activity_log`; all rendered user input is HTML-escaped (XSS-safe)
- **Seeded demo data** — `npm run seed` loads 24 realistic candidates across all stages with 60 days of history

## Quickstart

```bash
npm install
npm run seed     # idempotent: clears and reseeds 24 demo candidates
npm start        # serves at http://localhost:3000
```

`npm run dev` runs with `node --watch` for development. The server reads `PORT` from the environment (Render-ready) and the DB path from `ATS_DB_PATH` (defaults to `./ats.db`).

## API reference

All responses are JSON. Errors return `{ "error": "message" }` with the status code.

| Method | Endpoint | Description |
|---|---|---|
| GET | `/api/candidates` | List with search `q` (name/email/skills/role), filters `stage`, `role`, `sort` (`newest`/`oldest`/`name`/`rating`), pagination `page`/`limit`. Returns `{ data, page, limit, total, totalPages }` |
| POST | `/api/candidates` | Create. Requires `name`, `email` (valid format), `role`. Optional: `phone`, `experience_years`, `skills`, `resume_url`, `rating` (1–5), `source`, `stage`. → `201` + candidate; `400` on bad input; `409` on duplicate email |
| GET | `/api/candidates/:id` | Full candidate including `notes` and `stage_history`. `404` if missing |
| PUT | `/api/candidates/:id` | Update fields (not stage). `400`/`404`/`409` as above |
| PATCH | `/api/candidates/:id/stage` | Body `{ "stage": "<one of 6 stages>" }`. Appends `stage_history` row + activity entry. `400` on invalid stage; `404` if missing |
| DELETE | `/api/candidates/:id` | Delete candidate (+ cascade notes/history), logs activity. `404` if missing |
| POST | `/api/candidates/:id/notes` | Body `{ "text": "…" }`. → `201` + note; logs activity |
| GET | `/api/metrics` | `{ total, byStage, inPipeline, hiredThisMonth, conversion: {applied_to_screening_pct, screening_to_interview_pct, interview_to_offer_pct, offer_to_hired_pct}, avgDaysInStage, avgDaysAppliedToHired, hiresByRole, topSources }` |
| GET | `/api/activity?limit=10` | Recent activity feed (created / stage_changed / note_added / deleted), newest first |
| GET | `/api/roles` | Distinct role names (for the role filter) |
| GET | `/api/health` | `{ ok: true }` |

### Data model

- `candidates` — id, name, email (unique), phone, role, experience_years, skills (csv), resume_url, stage (`applied`/`screening`/`interview`/`offer`/`hired`/`rejected`, default `applied`), rating (1–5), source, created_at, updated_at
- `stage_history` — id, candidate_id, from_stage, to_stage, changed_at (row created on insert too: NULL → applied)
- `notes` — id, candidate_id, text, created_at
- `activity_log` — id, type, candidate_id, summary, created_at

## Project structure

```
earlyjobs-ats/
├── server.js        # Express app: all /api/* routes + static frontend
├── db.js            # SQLite open + schema (node:sqlite, no native deps)
├── seed.js          # Idempotent seed: 24 candidates, history, notes, activity
├── public/
│   ├── index.html   # SPA markup (Tailwind CDN)
│   └── app.js       # SPA logic: dashboard, candidates, kanban, drawer
├── package.json     # scripts: start, seed, dev
├── render.yaml      # Render free-tier web service definition
└── README.md
```

## Deploy on Render (free tier)

1. Push this repo to GitHub.
2. Render dashboard → **New → Web Service** → connect the repo (or use `render.yaml` via Blueprint).
3. Settings: **Build command** `npm install`, **Start command** `npm start`, environment `NODE_VERSION=24`.
4. Deploy. Then open the Render **Shell** for the service and run `npm run seed` once to load the demo data.
5. Note: on the free tier the SQLite file lives on the instance's ephemeral disk — it resets on redeploy/restart. That's fine for the demo; for persistence attach a Render Disk mounted at e.g. `/data` and set `ATS_DB_PATH=/data/ats.db`.

## 60-second demo-video script

1. **(0:00–0:08)** Open the deployed URL. "This is Mini ATS — candidates, pipeline, and hiring metrics in one app."
2. **(0:08–0:20)** Dashboard: point at stat cards, funnel bars, conversion %, activity feed.
3. **(0:20–0:32)** Candidates tab: type a search, toggle a stage chip, open the Add modal, create a candidate → toast confirms.
4. **(0:32–0:45)** Pipeline tab: drag a card from Screening to Interview — stage badge and counts update.
5. **(0:45–0:55)** Click a card: detail drawer — change stage via dropdown, add a note, scroll the stage-history timeline.
6. **(0:55–1:00)** Back to dashboard: "Metrics and activity updated live. Built with Node, Express, SQLite, and vanilla JS + Tailwind — deployed on Render."
