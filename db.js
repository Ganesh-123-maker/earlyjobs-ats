// db.js — Postgres connection (pg Pool) + schema.
const { Pool } = require('pg');

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  console.error(
    'Missing DATABASE_URL environment variable.\n' +
      'Set it to your Postgres connection string (e.g. in a local .env file — see .env.example) and restart.'
  );
  process.exit(1);
}

const pool = new Pool({
  connectionString: DATABASE_URL,
  ssl: { rejectUnauthorized: true },
});

async function initSchema() {
  await pool.query(`
CREATE TABLE IF NOT EXISTS candidates (
  id INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  name TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE,
  phone TEXT,
  role TEXT NOT NULL,
  experience_years REAL,
  skills TEXT,
  resume_url TEXT,
  stage TEXT NOT NULL DEFAULT 'applied'
    CHECK (stage IN ('applied','screening','interview','offer','hired','rejected')),
  rating INTEGER
    CHECK (rating IS NULL OR (rating >= 1 AND rating <= 5)),
  source TEXT,
  created_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL
);

CREATE TABLE IF NOT EXISTS stage_history (
  id INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  candidate_id INTEGER NOT NULL REFERENCES candidates(id) ON DELETE CASCADE,
  from_stage TEXT,
  to_stage TEXT NOT NULL,
  changed_at TIMESTAMPTZ NOT NULL
);

CREATE TABLE IF NOT EXISTS notes (
  id INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  candidate_id INTEGER NOT NULL REFERENCES candidates(id) ON DELETE CASCADE,
  text TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL
);

CREATE TABLE IF NOT EXISTS activity_log (
  id INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  type TEXT NOT NULL
    CHECK (type IN ('created','stage_changed','note_added','deleted')),
  candidate_id INTEGER,
  summary TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_stage_history_cid ON stage_history(candidate_id);
CREATE INDEX IF NOT EXISTS idx_notes_cid ON notes(candidate_id);
CREATE INDEX IF NOT EXISTS idx_activity_created ON activity_log(created_at);
`);
}

async function query(text, params) {
  return pool.query(text, params);
}

module.exports = { query, pool, initSchema };
