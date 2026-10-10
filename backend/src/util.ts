import crypto from 'node:crypto';
import type { DB } from './db.js';
import { HttpError, type AuthUser } from './auth.js';

export const newId = () => crypto.randomUUID();

export interface SessionRow {
  id: string;
  patient_id: string;
  title: string;
  activity: string;
  audio_path: string;
  audio_mime: string;
  audio_bytes: number;
  status: 'uploaded' | 'processing' | 'completed' | 'failed';
  error: string | null;
  duration_sec: number | null;
  language: string | null;
  transcript: string | null;
  indicators_json: string | null;
  segments_json: string | null;
  model_json: string | null;
  created_at: string;
  processed_at: string | null;
}

export function getSessionRow(db: DB, id: string): SessionRow | undefined {
  return db.prepare('SELECT * FROM sessions WHERE id = ?').get(id) as SessionRow | undefined;
}

/**
 * A clinician counts as verified only when an admin approved them after checking the licence
 * (verified_at is set) AND the licence has not expired. Use with the clinician_profiles alias `c`.
 */
export const VALID_CLINICIAN_SQL = `(c.verification_status = 'verified' AND c.verified_at IS NOT NULL
  AND c.license_expiry IS NOT NULL AND c.license_expiry >= date('now'))`;

/** verified | expired | pending | rejected. A legacy approval without a licence check counts as pending. */
export const CLINICIAN_STATUS_SQL = `(CASE
  WHEN ${VALID_CLINICIAN_SQL} THEN 'verified'
  WHEN c.verification_status = 'verified' AND c.verified_at IS NOT NULL THEN 'expired'
  WHEN c.verification_status = 'rejected' THEN 'rejected'
  ELSE 'pending' END)`;

export const isVerifiedClinician = (db: DB, userId: string): boolean => {
  const r = db
    .prepare(
      `SELECT 1 FROM users u JOIN clinician_profiles c ON c.user_id = u.id
       WHERE u.id = ? AND u.role = 'clinician' AND u.registered = 1 AND ${VALID_CLINICIAN_SQL}`,
    )
    .get(userId);
  return !!r;
};

/** A clinician may work with a patient only after an appointment was accepted. */
export const hasCareRelationship = (db: DB, patientId: string, clinicianId: string): boolean =>
  !!db
    .prepare(
      `SELECT 1 FROM appointments
       WHERE patient_id = ? AND clinician_id = ? AND status IN ('accepted','completed') LIMIT 1`,
    )
    .get(patientId, clinicianId);

export type Access = 'owner' | 'clinician';

/** Owner, or a verified clinician the patient explicitly shared this session with. */
export function sessionAccess(db: DB, user: AuthUser, s: SessionRow): Access {
  if (user.role === 'patient' && s.patient_id === user.id) return 'owner';
  if (user.role === 'clinician' && isVerifiedClinician(db, user.id)) {
    const shared = db
      .prepare('SELECT 1 FROM session_shares WHERE session_id = ? AND clinician_id = ?')
      .get(s.id, user.id);
    if (shared && hasCareRelationship(db, s.patient_id, user.id)) return 'clinician';
  }
  throw new HttpError(404, 'Session not found.');
}

export const audit = (db: DB, userId: string | null, action: string, target?: string) =>
  db
    .prepare('INSERT INTO audit_log (user_id, action, target, at) VALUES (?,?,?,?)')
    .run(userId, action, target ?? null, new Date().toISOString());

const parse = <T>(s: string | null): T | null => (s ? (JSON.parse(s) as T) : null);

export function sessionSummary(s: SessionRow, sharedWith = 0) {
  const ind = parse<Record<string, any>>(s.indicators_json);
  return {
    id: s.id,
    title: s.title,
    activity: s.activity,
    status: s.status,
    error: s.error,
    createdAt: s.created_at,
    processedAt: s.processed_at,
    durationSec: s.duration_sec,
    language: s.language,
    wordCount: ind?.word_count ?? null,
    flowIndex: ind?.flow_index ?? null,
    speechRateWpm: ind?.speech_rate_wpm_active ?? ind?.speech_rate_wpm_total ?? null,
    sharedWith,
  };
}

export function sessionDetail(s: SessionRow) {
  return {
    ...sessionSummary(s),
    audioMime: s.audio_mime,
    transcript: s.transcript,
    indicators: parse(s.indicators_json),
    segments: parse(s.segments_json),
    model: parse(s.model_json),
  };
}
