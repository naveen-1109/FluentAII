import Database from 'better-sqlite3';
import fs from 'node:fs';
import path from 'node:path';

export type DB = Database.Database;

const SCHEMA = `
PRAGMA journal_mode = WAL;
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL UNIQUE COLLATE NOCASE,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('patient','clinician')),
  full_name TEXT NOT NULL,
  registered INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS patient_profiles (
  user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  age_group TEXT NOT NULL,
  primary_language TEXT NOT NULL,
  goals TEXT NOT NULL DEFAULT '',
  consent_voice_processing INTEGER NOT NULL,
  consent_terms INTEGER NOT NULL,
  consented_at TEXT NOT NULL,
  ai_roadmap_consent INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS clinician_profiles (
  user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  specialty TEXT NOT NULL,
  organisation TEXT NOT NULL DEFAULT '',
  license_number TEXT NOT NULL,
  license_region TEXT NOT NULL,
  years_experience INTEGER NOT NULL DEFAULT 0,
  languages TEXT NOT NULL DEFAULT '',
  bio TEXT NOT NULL DEFAULT '',
  accepts_new_patients INTEGER NOT NULL DEFAULT 1,
  verification_status TEXT NOT NULL DEFAULT 'pending'
    CHECK (verification_status IN ('pending','verified','rejected')),
  consent_terms INTEGER NOT NULL,
  consented_at TEXT NOT NULL,
  license_expiry TEXT,      -- YYYY-MM-DD; the clinician is only valid until this date
  verified_at TEXT,         -- set when an admin confirmed the licence with the issuing body
  verified_by TEXT,
  verification_ref TEXT,    -- registry number / reference the admin checked
  verification_note TEXT
);

CREATE TABLE IF NOT EXISTS sessions (
  id TEXT PRIMARY KEY,
  patient_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  activity TEXT NOT NULL DEFAULT 'free_speech',
  audio_path TEXT NOT NULL,
  audio_mime TEXT NOT NULL,
  audio_bytes INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'uploaded'
    CHECK (status IN ('uploaded','processing','completed','failed')),
  error TEXT,
  duration_sec REAL,
  language TEXT,
  transcript TEXT,
  indicators_json TEXT,
  segments_json TEXT,
  model_json TEXT,
  created_at TEXT NOT NULL,
  processed_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_sessions_patient ON sessions(patient_id, created_at DESC);

CREATE TABLE IF NOT EXISTS session_shares (
  session_id TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  clinician_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TEXT NOT NULL,
  PRIMARY KEY (session_id, clinician_id)
);

CREATE TABLE IF NOT EXISTS session_notes (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  clinician_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  body TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS appointments (
  id TEXT PRIMARY KEY,
  patient_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  clinician_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  requested_start TEXT NOT NULL,
  mode TEXT NOT NULL CHECK (mode IN ('video','phone','in_person','message')),
  reason TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'requested'
    CHECK (status IN ('requested','accepted','declined','cancelled','completed')),
  clinician_message TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_appt_patient ON appointments(patient_id);
CREATE INDEX IF NOT EXISTS idx_appt_clinician ON appointments(clinician_id);

-- Administrators are kept apart from patients and clinicians: separate table, separate cookie.
CREATE TABLE IF NOT EXISTS admins (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL UNIQUE COLLATE NOCASE,
  password_hash TEXT NOT NULL,
  full_name TEXT NOT NULL,
  created_at TEXT NOT NULL,
  last_login_at TEXT
);

-- Global settings edited in the admin panel (JSON values), e.g. feature.recording = true.
CREATE TABLE IF NOT EXISTS app_settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  updated_by TEXT
);

-- Per-patient overrides of those settings. A missing row means "use the global setting".
CREATE TABLE IF NOT EXISTS patient_settings (
  patient_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  key TEXT NOT NULL,
  value TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  updated_by TEXT,
  PRIMARY KEY (patient_id, key)
);

-- AI-written coaching for the fluency roadmap (only when the patient opted in).
CREATE TABLE IF NOT EXISTS roadmap_coaching (
  patient_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  input_hash TEXT NOT NULL,
  coaching_json TEXT NOT NULL,
  model TEXT NOT NULL,
  generated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS audit_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id TEXT,
  action TEXT NOT NULL,
  target TEXT,
  at TEXT NOT NULL
);
`;

export function openDb(file: string): DB {
  if (file !== ':memory:') fs.mkdirSync(path.dirname(file), { recursive: true });
  const db = new Database(file);
  db.exec(SCHEMA);
  migrate(db);
  return db;
}

export const nowIso = () => new Date().toISOString();

/** Adds columns introduced after a database was first created. */
function migrate(db: Database.Database) {
  const have = new Set((db.prepare(`PRAGMA table_info(clinician_profiles)`).all() as { name: string }[]).map((c) => c.name));
  for (const col of ['license_expiry', 'verified_at', 'verified_by', 'verification_ref', 'verification_note']) {
    if (!have.has(col)) db.exec(`ALTER TABLE clinician_profiles ADD COLUMN ${col} TEXT`);
  }
  const pat = new Set((db.prepare(`PRAGMA table_info(patient_profiles)`).all() as { name: string }[]).map((c) => c.name));
  if (!pat.has('ai_roadmap_consent')) db.exec(`ALTER TABLE patient_profiles ADD COLUMN ai_roadmap_consent INTEGER NOT NULL DEFAULT 0`);
}
