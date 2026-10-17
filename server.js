// server.js — Mini ATS: Express REST API + static single-page frontend.
const express = require('express');
const path = require('path');
const db = require('./db');

const STAGES = ['applied', 'screening', 'interview', 'offer', 'hired', 'rejected'];
const PIPELINE = ['applied', 'screening', 'interview', 'offer', 'hired']; // funnel order
const SORTS = {
  newest: 'created_at DESC',
  oldest: 'created_at ASC',
  name: 'name COLLATE NOCASE ASC',
  rating: 'rating DESC NULLS LAST, created_at DESC',
};
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const app = express();
app.use(express.json({ limit: '256kb' }));

const nowISO = () => new Date().toISOString();

// ---------- helpers ----------
function getCandidate(id) {
  return db.prepare('SELECT * FROM candidates WHERE id = ?').get(id);
}

function validateCandidateInput(body, forUpdate = false) {
  const errors = [];
  const need = (key) => !forUpdate || body[key] !== undefined;

  if (need('name') && (!body.name || !String(body.name).trim()))
    errors.push('name is required');
  if (need('email')) {
    if (!body.email || !String(body.email).trim()) errors.push('email is required');
    else if (!EMAIL_RE.test(String(body.email).trim()))
      errors.push('email must be a valid email address');
  }
  if (need('role') && (!body.role || !String(body.role).trim()))
    errors.push('role is required');

  if (body.rating !== undefined && body.rating !== null && body.rating !== '') {
    const r = Number(body.rating);
    if (!Number.isInteger(r) || r < 1 || r > 5)
      errors.push('rating must be an integer from 1 to 5');
  }
  if (body.experience_years !== undefined && body.experience_years !== null && body.experience_years !== '') {
    const e = Number(body.experience_years);
    if (Number.isNaN(e) || e < 0 || e > 60)
      errors.push('experience_years must be a number between 0 and 60');
  }
  if (body.stage !== undefined && body.stage !== null && body.stage !== '') {
    if (!STAGES.includes(body.stage))
      errors.push('stage must be one of: ' + STAGES.join(', '));
  }
  return errors;
}

function pickUpdatable(body) {
  const c = {};
  for (const k of ['name', 'email', 'phone', 'role', 'skills', 'resume_url', 'source']) {
    if (body[k] !== undefined) c[k] = body[k] === null ? null : String(body[k]).trim() || null;
  }
  for (const k of ['experience_years', 'rating']) {
    if (body[k] !== undefined) c[k] = body[k] === null || body[k] === '' ? null : Number(body[k]);
  }
  return c;
}

function logActivity(type, candidateId, summary, at) {
  db.prepare(
    'INSERT INTO activity_log (type, candidate_id, summary, created_at) VALUES (?,?,?,?)'
  ).run(type, candidateId, summary, at || nowISO());
}

function addStageChange(candidateId, name, fromStage, toStage, at) {
  const ts = at || nowISO();
  db.prepare(
    'UPDATE candidates SET stage = ?, updated_at = ? WHERE id = ?'
  ).run(toStage, ts, candidateId);
  db.prepare(
    'INSERT INTO stage_history (candidate_id, from_stage, to_stage, changed_at) VALUES (?,?,?,?)'
  ).run(candidateId, fromStage, toStage, ts);
  logActivity('stage_changed', candidateId, `${name} moved from ${fromStage} to ${toStage}`, ts);
  return getCandidate(candidateId);
}

function isUniqueViolation(err) {
  return err && (err.code === 'SQLITE_CONSTRAINT_UNIQUE' || /UNIQUE constraint/i.test(String(err.message)));
}

// ---------- candidates ----------
app.get('/api/candidates', (req, res) => {
  const { q, stage, role, sort = 'newest' } = req.query;
  const where = [];
  const params = [];

  if (q && String(q).trim()) {
    const like = `%${String(q).trim()}%`;
    where.push('(name LIKE ? OR email LIKE ? OR skills LIKE ? OR role LIKE ?)');
    params.push(like, like, like, like);
  }
  if (stage && STAGES.includes(stage)) {
    where.push('stage = ?');
    params.push(stage);
  }
  if (role && String(role).trim()) {
    where.push('role = ?');
    params.push(String(role).trim());
  }

  const whereSql = where.length ? 'WHERE ' + where.join(' AND ') : '';
  const total = db.prepare(`SELECT COUNT(*) AS c FROM candidates ${whereSql}`).get(...params).c;

  const order = SORTS[sort] || SORTS.newest;
  const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 12, 1), 100);
  const page = Math.max(parseInt(req.query.page, 10) || 1, 1);
  const data = db
    .prepare(`SELECT * FROM candidates ${whereSql} ORDER BY ${order} LIMIT ? OFFSET ?`)
    .all(...params, limit, (page - 1) * limit);

  res.json({ data, page, limit, total, totalPages: Math.ceil(total / limit) || 1 });
});

app.post('/api/candidates', (req, res) => {
  const body = req.body || {};
  const errors = validateCandidateInput(body, false);
  if (errors.length) return res.status(400).json({ error: errors.join('; ') });

  const c = pickUpdatable(body);
  const stage = STAGES.includes(body.stage) ? body.stage : 'applied';
  const ts = nowISO();

  try {
    const r = db
      .prepare(`INSERT INTO candidates
        (name, email, phone, role, experience_years, skills, resume_url, stage, rating, source, created_at, updated_at)
        VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`)
      .run(c.name, c.email, c.phone ?? null, c.role, c.experience_years ?? null,
        c.skills ?? null, c.resume_url ?? null, stage, c.rating ?? null,
        c.source ?? null, ts, ts);
    const id = Number(r.lastInsertRowid);
    db.prepare(
      'INSERT INTO stage_history (candidate_id, from_stage, to_stage, changed_at) VALUES (?,?,?,?)'
    ).run(id, null, stage, ts);
    logActivity('created', id, `${c.name} applied for ${c.role}`, ts);
    res.status(201).json(getCandidate(id));
  } catch (err) {
    if (isUniqueViolation(err))
      return res.status(409).json({ error: 'A candidate with this email already exists' });
    throw err;
  }
});

app.get('/api/candidates/:id', (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (!Number.isInteger(id)) return res.status(404).json({ error: 'Candidate not found' });
  const candidate = getCandidate(id);
  if (!candidate) return res.status(404).json({ error: 'Candidate not found' });
  const notes = db
    .prepare('SELECT * FROM notes WHERE candidate_id = ? ORDER BY created_at ASC, id ASC')
    .all(id);
  const history = db
    .prepare('SELECT * FROM stage_history WHERE candidate_id = ? ORDER BY changed_at ASC, id ASC')
    .all(id);
  res.json({ ...candidate, notes, stage_history: history });
});

app.put('/api/candidates/:id', (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (!Number.isInteger(id)) return res.status(404).json({ error: 'Candidate not found' });
  const existing = getCandidate(id);
  if (!existing) return res.status(404).json({ error: 'Candidate not found' });

  const body = req.body || {};
  if ('stage' in body) delete body.stage; // stage changes go through PATCH /stage
  const errors = validateCandidateInput(body, true);
  if (errors.length) return res.status(400).json({ error: errors.join('; ') });

  const c = pickUpdatable(body);
  const keys = Object.keys(c);
  if (!keys.length) return res.status(400).json({ error: 'Nothing to update' });

  try {
    const sets = keys.map((k) => `${k} = ?`).join(', ');
    db.prepare(`UPDATE candidates SET ${sets}, updated_at = ? WHERE id = ?`)
      .run(...keys.map((k) => c[k]), nowISO(), id);
    res.json(getCandidate(id));
  } catch (err) {
    if (isUniqueViolation(err))
      return res.status(409).json({ error: 'A candidate with this email already exists' });
    throw err;
  }
});

app.patch('/api/candidates/:id/stage', (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (!Number.isInteger(id)) return res.status(404).json({ error: 'Candidate not found' });
  const candidate = getCandidate(id);
  if (!candidate) return res.status(404).json({ error: 'Candidate not found' });

  const stage = req.body && req.body.stage;
  if (!STAGES.includes(stage))
    return res.status(400).json({ error: 'stage must be one of: ' + STAGES.join(', ') });
  if (candidate.stage === stage) return res.json(candidate); // no-op

  const updated = addStageChange(id, candidate.name, candidate.stage, stage);
  res.json(updated);
});

app.delete('/api/candidates/:id', (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (!Number.isInteger(id)) return res.status(404).json({ error: 'Candidate not found' });
  const candidate = getCandidate(id);
  if (!candidate) return res.status(404).json({ error: 'Candidate not found' });

  db.prepare('DELETE FROM candidates WHERE id = ?').run(id);
  logActivity('deleted', id, `${candidate.name} (${candidate.role}) was removed`);
  res.json({ ok: true });
});

app.post('/api/candidates/:id/notes', (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (!Number.isInteger(id)) return res.status(404).json({ error: 'Candidate not found' });
  const candidate = getCandidate(id);
  if (!candidate) return res.status(404).json({ error: 'Candidate not found' });

  const text = req.body && typeof req.body.text === 'string' ? req.body.text.trim() : '';
  if (!text) return res.status(400).json({ error: 'text is required' });

  const ts = nowISO();
  const r = db
    .prepare('INSERT INTO notes (candidate_id, text, created_at) VALUES (?,?,?)')
    .run(id, text, ts);
  logActivity('note_added', id, `Note added for ${candidate.name}`, ts);
  res.status(201).json(db.prepare('SELECT * FROM notes WHERE id = ?').get(Number(r.lastInsertRowid)));
});

// ---------- metrics ----------
app.get('/api/metrics', (req, res) => {
  const total = db.prepare('SELECT COUNT(*) AS c FROM candidates').get().c;

  const byStage = Object.fromEntries(STAGES.map((s) => [s, 0]));
  db.prepare('SELECT stage, COUNT(*) AS c FROM candidates GROUP BY stage')
    .all()
    .forEach((r) => { byStage[r.stage] = r.c; });

  const inPipeline = total - byStage.hired - byStage.rejected;

  // Hired this calendar month (based on when they reached 'hired').
  const monthStart = new Date();
  monthStart.setDate(1); monthStart.setHours(0, 0, 0, 0);
  const hiredThisMonth = db
    .prepare(`SELECT COUNT(DISTINCT candidate_id) AS c FROM stage_history
              WHERE to_stage = 'hired' AND changed_at >= ?`)
    .get(monthStart.toISOString()).c;

  // Funnel: candidates that ever reached each stage.
  const reached = {};
  for (const s of PIPELINE) {
    reached[s] = db
      .prepare('SELECT COUNT(DISTINCT candidate_id) AS c FROM stage_history WHERE to_stage = ?')
      .get(s).c;
  }
  const pct = (a, b) => (b > 0 ? Math.round((a / b) * 1000) / 10 : 0);
  const conversion = {
    applied_to_screening_pct: pct(reached.screening, reached.applied),
    screening_to_interview_pct: pct(reached.interview, reached.screening),
    interview_to_offer_pct: pct(reached.offer, reached.interview),
    offer_to_hired_pct: pct(reached.hired, reached.offer),
  };

  // Avg days spent in each stage before moving on (terminal stages excluded),
  // plus avg days from first 'applied' to 'hired' per hired candidate.
  const hist = db
    .prepare(`SELECT candidate_id, to_stage, changed_at FROM stage_history
              ORDER BY candidate_id, changed_at ASC, id ASC`)
    .all();
  const byCand = new Map();
  for (const h of hist) {
    if (!byCand.has(h.candidate_id)) byCand.set(h.candidate_id, []);
    byCand.get(h.candidate_id).push(h);
  }
  const acc = Object.fromEntries(PIPELINE.map((s) => [s, { sum: 0, n: 0 }]));
  const appliedToHiredDays = [];
  for (const [, arr] of byCand) {
    for (let i = 0; i < arr.length - 1; i++) {
      const days = (new Date(arr[i + 1].changed_at) - new Date(arr[i].changed_at)) / 86400000;
      if (days < 0 || days >= 365) continue;
      if (acc[arr[i].to_stage]) { acc[arr[i].to_stage].sum += days; acc[arr[i].to_stage].n++; }
    }
    const first = arr[0];
    const hiredEntry = arr.find((e) => e.to_stage === 'hired');
    if (first && first.to_stage === 'applied' && hiredEntry) {
      const days = (new Date(hiredEntry.changed_at) - new Date(first.changed_at)) / 86400000;
      if (days >= 0 && days < 365) appliedToHiredDays.push(days);
    }
  }
  const avgDaysInStage = {};
  for (const s of PIPELINE)
    avgDaysInStage[s] = acc[s].n ? Math.round((acc[s].sum / acc[s].n) * 10) / 10 : 0;
  const avgDaysAppliedToHired = appliedToHiredDays.length
    ? Math.round((appliedToHiredDays.reduce((a, b) => a + b, 0) / appliedToHiredDays.length) * 10) / 10
    : 0;

  const hiresByRole = db
    .prepare(`SELECT role, COUNT(*) AS count FROM candidates WHERE stage = 'hired' GROUP BY role ORDER BY count DESC`)
    .all();
  const topSources = db
    .prepare(`SELECT source, COUNT(*) AS count FROM candidates
              WHERE source IS NOT NULL AND source != ''
              GROUP BY source ORDER BY count DESC LIMIT 5`)
    .all();

  res.json({
    total, byStage, inPipeline, hiredThisMonth,
    conversion, avgDaysInStage, avgDaysAppliedToHired,
    hiresByRole, topSources,
  });
});

// ---------- activity ----------
app.get('/api/activity', (req, res) => {
  const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 10, 1), 50);
  const rows = db
    .prepare(`SELECT a.*, c.name AS candidate_name
              FROM activity_log a LEFT JOIN candidates c ON c.id = a.candidate_id
              ORDER BY a.created_at DESC, a.id DESC LIMIT ?`)
    .all(limit);
  res.json(rows);
});

// ---------- roles ----------
app.get('/api/roles', (req, res) => {
  const rows = db.prepare('SELECT DISTINCT role FROM candidates ORDER BY role').all();
  res.json(rows.map((r) => r.role));
});

app.get('/api/health', (req, res) => res.json({ ok: true }));

// ---------- static frontend + fallthrough ----------
app.use(express.static(path.join(__dirname, 'public')));
app.use('/api', (req, res) => res.status(404).json({ error: 'Not found' }));
// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  if (err && err.type === 'entity.parse.failed')
    return res.status(400).json({ error: 'Invalid JSON body' });
  console.error(err);
  res.status(500).json({ error: 'Internal server error' });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Mini ATS running at http://localhost:${PORT}`);
});
