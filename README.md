# Mini ATS — Applicant Tracking System

A complete full-stack Mini Applicant Tracking System built as the take-home assignment for the **EarlyJobs.ai Full Stack Developer Intern** role (received 2026-10-17, 72-hour deadline).

Track candidates through a hiring pipeline — add profiles, search and filter, drag cards between stages on a kanban board, log interview notes, and watch dashboard metrics update in real time.

## Tech stack

| Layer | Choice |
|---|---|
| Backend | Node.js + Express (single service, no build step) |
| Database | Postgres (Neon free tier) via the `pg` driver — schema created at startup |
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
cp .env.example .env   # then set DATABASE_URL to your Postgres (Neon) connection string
npm run seed           # idempotent: clears and reseeds 24 demo candidates
npm run dev            # serves at http://localhost:3000 (loads .env via --env-file)
```

`npm start` runs without `--env-file` for production (Render provides env vars from the dashboard). The server reads `PORT` and `DATABASE_URL` from the environment. On first boot it creates the schema if needed, and a boot guard seeds the 24 demo candidates automatically when the candidates table is empty.

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
├── db.js            # pg Pool + Postgres schema (SSL for Neon)
├── seed.js          # Idempotent seed: 24 candidates, history, notes, activity
├── public/
│   ├── index.html   # SPA markup (Tailwind CDN)
│   └── app.js       # SPA logic: dashboard, candidates, kanban, drawer
├── package.json     # scripts: start, seed, dev
├── render.yaml      # Render free-tier web service definition
└── README.md
```

## Deploy on Render (free tier)

1. Create a free Postgres database at [Neon](https://neon.tech) and copy its connection string.
2. Push this repo to GitHub.
3. Render dashboard → **New → Web Service** → connect the repo (or use `render.yaml` via Blueprint).
4. Settings: **Build command** `npm install`, **Start command** `npm start`, environment `NODE_VERSION=24`.
5. In the service's **Environment** tab, add `DATABASE_URL` with the Neon connection string (render.yaml declares it with `sync: false`, so Render prompts for the value).
6. Deploy. On first boot the app creates the schema and the boot guard seeds the 24 demo candidates automatically — no manual steps needed. Data lives in Neon, so it survives redeploys and restarts.
