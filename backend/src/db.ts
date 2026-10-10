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
  consented_at TEXT NOT NULL
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
  consented_at TEXT NOT NULL
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
  return db;
}

export const nowIso = () => new Date().toISOString();
