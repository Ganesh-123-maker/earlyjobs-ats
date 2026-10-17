// db.js — SQLite setup (Node built-in node:sqlite, no native deps) + schema.
const path = require('path');
const { DatabaseSync } = require('node:sqlite');

const DB_PATH = process.env.ATS_DB_PATH || path.join(__dirname, 'ats.db');
const db = new DatabaseSync(DB_PATH);

db.exec('PRAGMA journal_mode = WAL;');

db.exec(`
CREATE TABLE IF NOT EXISTS candidates (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
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
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS stage_history (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  candidate_id INTEGER NOT NULL REFERENCES candidates(id) ON DELETE CASCADE,
  from_stage TEXT,
  to_stage TEXT NOT NULL,
  changed_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS notes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  candidate_id INTEGER NOT NULL REFERENCES candidates(id) ON DELETE CASCADE,
  text TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS activity_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  type TEXT NOT NULL
    CHECK (type IN ('created','stage_changed','note_added','deleted')),
  candidate_id INTEGER,
  summary TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_stage_history_cid ON stage_history(candidate_id);
CREATE INDEX IF NOT EXISTS idx_notes_cid ON notes(candidate_id);
CREATE INDEX IF NOT EXISTS idx_activity_created ON activity_log(created_at);
`);

module.exports = db;
