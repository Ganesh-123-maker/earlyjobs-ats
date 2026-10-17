// server.js — Mini ATS: Express REST API + static single-page frontend.
const express = require('express');
const path = require('path');
const { query, initSchema } = require('./db');
const { runSeed } = require('./seed');

const STAGES = ['applied', 'screening', 'interview', 'offer', 'hired', 'rejected'];
const PIPELINE = ['applied', 'screening', 'interview', 'offer', 'hired']; // funnel order
const SORTS = {
  newest: 'created_at DESC',
  oldest: 'created_at ASC',
  name: 'LOWER(name) ASC',
  rating: 'rating DESC NULLS LAST, created_at DESC',
};
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const app = express();
app.use(express.json({ limit: '256kb' }));

const nowISO = () => new Date().toISOString();

// Wrap async route handlers so rejected promises reach the error middleware
// and return the same JSON error shape as before.
const ah = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

// ---------- helpers ----------
async function getCandidate(id) {
  const { rows } = await query('SELECT * FROM candidates WHERE id = $1', [id]);
  return rows[0];
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

async function logActivity(type, candidateId, summary, at) {
  await query(
    'INSERT INTO activity_log (type, candidate_id, summary, created_at) VALUES ($1,$2,$3,$4)',
    [type, candidateId, summary, at || nowISO()]
  );
}

async function addStageChange(candidateId, name, fromStage, toStage, at) {
  const ts = at || nowISO();
  await query('UPDATE candidates SET stage = $1, updated_at = $2 WHERE id = $3', [
    toStage,
    ts,
    candidateId,
  ]);
  await query(
    'INSERT INTO stage_history (candidate_id, from_stage, to_stage, changed_at) VALUES ($1,$2,$3,$4)',
    [candidateId, fromStage, toStage, ts]
  );
  await logActivity('stage_changed', candidateId, `${name} moved from ${fromStage} to ${toStage}`, ts);
  return getCandidate(candidateId);
}

function isUniqueViolation(err) {
  return err && err.code === '23505';
}

// ---------- candidates ----------
app.get(
  '/api/candidates',
  ah(async (req, res) => {
    const { q, stage, role, sort = 'newest' } = req.query;
    const where = [];
    const params = [];
    const add = (v) => {
      params.push(v);
      return '$' + params.length;
    };

    if (q && String(q).trim()) {
      const like = `%${String(q).trim()}%`;
      where.push(
        `(name ILIKE ${add(like)} OR email ILIKE ${add(like)} OR skills ILIKE ${add(like)} OR role ILIKE ${add(like)})`
      );
    }
    if (stage && STAGES.includes(stage)) {
      where.push(`stage = ${add(stage)}`);
    }
    if (role && String(role).trim()) {
      where.push(`role = ${add(String(role).trim())}`);
    }

    const whereSql = where.length ? 'WHERE ' + where.join(' AND ') : '';
    const total = (await query(`SELECT COUNT(*)::int AS c FROM candidates ${whereSql}`, params))
      .rows[0].c;

    const order = SORTS[sort] || SORTS.newest;
    const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 12, 1), 100);
    const page = Math.max(parseInt(req.query.page, 10) || 1, 1);
    const data = (
      await query(
        `SELECT * FROM candidates ${whereSql} ORDER BY ${order} LIMIT ${add(limit)} OFFSET ${add(
          (page - 1) * limit
        )}`,
        params
      )
    ).rows;

    res.json({ data, page, limit, total, totalPages: Math.ceil(total / limit) || 1 });
  })
);

app.post(
  '/api/candidates',
  ah(async (req, res) => {
    const body = req.body || {};
    const errors = validateCandidateInput(body, false);
    if (errors.length) return res.status(400).json({ error: errors.join('; ') });

    const c = pickUpdatable(body);
    const stage = STAGES.includes(body.stage) ? body.stage : 'applied';
    const ts = nowISO();

    try {
      const { rows } = await query(
        `INSERT INTO candidates
        (name, email, phone, role, experience_years, skills, resume_url, stage, rating, source, created_at, updated_at)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) RETURNING id`,
        [
          c.name,
          c.email,
          c.phone ?? null,
          c.role,
          c.experience_years ?? null,
          c.skills ?? null,
          c.resume_url ?? null,
          stage,
          c.rating ?? null,
          c.source ?? null,
          ts,
          ts,
        ]
      );
      const id = rows[0].id;
      await query(
        'INSERT INTO stage_history (candidate_id, from_stage, to_stage, changed_at) VALUES ($1,$2,$3,$4)',
        [id, null, stage, ts]
      );
      await logActivity('created', id, `${c.name} applied for ${c.role}`, ts);
      res.status(201).json(await getCandidate(id));
    } catch (err) {
      if (isUniqueViolation(err))
        return res.status(409).json({ error: 'A candidate with this email already exists' });
      throw err;
    }
  })
);

app.get(
  '/api/candidates/:id',
  ah(async (req, res) => {
    const id = parseInt(req.params.id, 10);
    if (!Number.isInteger(id)) return res.status(404).json({ error: 'Candidate not found' });
    const candidate = await getCandidate(id);
    if (!candidate) return res.status(404).json({ error: 'Candidate not found' });
    const notes = (
      await query('SELECT * FROM notes WHERE candidate_id = $1 ORDER BY created_at ASC, id ASC', [id])
    ).rows;
    const history = (
      await query(
        'SELECT * FROM stage_history WHERE candidate_id = $1 ORDER BY changed_at ASC, id ASC',
        [id]
      )
    ).rows;
    res.json({ ...candidate, notes, stage_history: history });
  })
);

app.put(
  '/api/candidates/:id',
  ah(async (req, res) => {
    const id = parseInt(req.params.id, 10);
    if (!Number.isInteger(id)) return res.status(404).json({ error: 'Candidate not found' });
    const existing = await getCandidate(id);
    if (!existing) return res.status(404).json({ error: 'Candidate not found' });

    const body = req.body || {};
    if ('stage' in body) delete body.stage; // stage changes go through PATCH /stage
    const errors = validateCandidateInput(body, true);
    if (errors.length) return res.status(400).json({ error: errors.join('; ') });

    const c = pickUpdatable(body);
    const keys = Object.keys(c);
    if (!keys.length) return res.status(400).json({ error: 'Nothing to update' });

    try {
      const sets = keys.map((k, i) => `${k} = $${i + 1}`).join(', ');
      await query(`UPDATE candidates SET ${sets}, updated_at = $${keys.length + 1} WHERE id = $${keys.length + 2}`, [
        ...keys.map((k) => c[k]),
        nowISO(),
        id,
      ]);
      res.json(await getCandidate(id));
    } catch (err) {
      if (isUniqueViolation(err))
        return res.status(409).json({ error: 'A candidate with this email already exists' });
      throw err;
    }
  })
);

app.patch(
  '/api/candidates/:id/stage',
  ah(async (req, res) => {
    const id = parseInt(req.params.id, 10);
    if (!Number.isInteger(id)) return res.status(404).json({ error: 'Candidate not found' });
    const candidate = await getCandidate(id);
    if (!candidate) return res.status(404).json({ error: 'Candidate not found' });

    const stage = req.body && req.body.stage;
    if (!STAGES.includes(stage))
      return res.status(400).json({ error: 'stage must be one of: ' + STAGES.join(', ') });
    if (candidate.stage === stage) return res.json(candidate); // no-op

    const updated = await addStageChange(id, candidate.name, candidate.stage, stage);
    res.json(updated);
  })
);

app.delete(
  '/api/candidates/:id',
  ah(async (req, res) => {
    const id = parseInt(req.params.id, 10);
    if (!Number.isInteger(id)) return res.status(404).json({ error: 'Candidate not found' });
    const candidate = await getCandidate(id);
    if (!candidate) return res.status(404).json({ error: 'Candidate not found' });

    await query('DELETE FROM candidates WHERE id = $1', [id]);
    await logActivity('deleted', id, `${candidate.name} (${candidate.role}) was removed`);
    res.json({ ok: true });
  })
);

app.post(
  '/api/candidates/:id/notes',
  ah(async (req, res) => {
    const id = parseInt(req.params.id, 10);
    if (!Number.isInteger(id)) return res.status(404).json({ error: 'Candidate not found' });
    const candidate = await getCandidate(id);
    if (!candidate) return res.status(404).json({ error: 'Candidate not found' });

    const text = req.body && typeof req.body.text === 'string' ? req.body.text.trim() : '';
    if (!text) return res.status(400).json({ error: 'text is required' });

    const ts = nowISO();
    const { rows } = await query(
      'INSERT INTO notes (candidate_id, text, created_at) VALUES ($1,$2,$3) RETURNING id',
      [id, text, ts]
    );
    await logActivity('note_added', id, `Note added for ${candidate.name}`, ts);
    res
      .status(201)
      .json((await query('SELECT * FROM notes WHERE id = $1', [rows[0].id])).rows[0]);
  })
);

// ---------- metrics ----------
app.get(
  '/api/metrics',
  ah(async (req, res) => {
    const total = (await query('SELECT COUNT(*)::int AS c FROM candidates')).rows[0].c;

    const byStage = Object.fromEntries(STAGES.map((s) => [s, 0]));
    (
      await query('SELECT stage, COUNT(*)::int AS c FROM candidates GROUP BY stage')
    ).rows.forEach((r) => {
      byStage[r.stage] = r.c;
    });

    const inPipeline = total - byStage.hired - byStage.rejected;

    // Hired this calendar month (based on when they reached 'hired').
    const monthStart = new Date();
    monthStart.setDate(1);
    monthStart.setHours(0, 0, 0, 0);
    const hiredThisMonth = (
      await query(
        `SELECT COUNT(DISTINCT candidate_id)::int AS c FROM stage_history
              WHERE to_stage = 'hired' AND changed_at >= $1`,
        [monthStart.toISOString()]
      )
    ).rows[0].c;

    // Funnel: candidates that ever reached each stage.
    const reached = {};
    for (const s of PIPELINE) {
      reached[s] = (
        await query('SELECT COUNT(DISTINCT candidate_id)::int AS c FROM stage_history WHERE to_stage = $1', [
          s,
        ])
      ).rows[0].c;
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
    const hist = (
      await query(`SELECT candidate_id, to_stage, changed_at FROM stage_history
              ORDER BY candidate_id, changed_at ASC, id ASC`)
    ).rows;
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
        if (acc[arr[i].to_stage]) {
          acc[arr[i].to_stage].sum += days;
          acc[arr[i].to_stage].n++;
        }
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

    const hiresByRole = (
      await query(
        `SELECT role, COUNT(*)::int AS count FROM candidates WHERE stage = 'hired' GROUP BY role ORDER BY count DESC`
      )
    ).rows;
    const topSources = (
      await query(
        `SELECT source, COUNT(*)::int AS count FROM candidates
              WHERE source IS NOT NULL AND source != ''
              GROUP BY source ORDER BY count DESC LIMIT 5`
      )
    ).rows;

    res.json({
      total,
      byStage,
      inPipeline,
      hiredThisMonth,
      conversion,
      avgDaysInStage,
      avgDaysAppliedToHired,
      hiresByRole,
      topSources,
    });
  })
);

// ---------- activity ----------
app.get(
  '/api/activity',
  ah(async (req, res) => {
    const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 10, 1), 50);
    const rows = (
      await query(
        `SELECT a.*, c.name AS candidate_name
              FROM activity_log a LEFT JOIN candidates c ON c.id = a.candidate_id
              ORDER BY a.created_at DESC, a.id DESC LIMIT $1`,
        [limit]
      )
    ).rows;
    res.json(rows);
  })
);

// ---------- roles ----------
app.get(
  '/api/roles',
  ah(async (req, res) => {
    const rows = (await query('SELECT DISTINCT role FROM candidates ORDER BY role')).rows;
    res.json(rows.map((r) => r.role));
  })
);

app.get(
  '/api/health',
  ah(async (req, res) => {
    await query('SELECT 1');
    res.json({ ok: true, db: 'up' });
  })
);

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

async function start() {
  await initSchema();
  const { rows } = await query('SELECT COUNT(*)::int AS c FROM candidates');
  if (rows[0].c === 0) {
    await runSeed();
    console.log('Boot guard: candidates table was empty — seeded demo data.');
  } else {
    console.log('Boot guard: candidates table has data — skipping seed.');
  }
  app.listen(PORT, () => {
    console.log(`Mini ATS running at http://localhost:${PORT}`);
  });
}

start().catch((err) => {
  console.error('Failed to start:', err.message || err);
  process.exit(1);
});
