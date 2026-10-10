import type { NextFunction, Request, Response } from 'express';
import { HttpError } from './auth.js';
import type { DB } from './db.js';
import { nowIso } from './db.js';

/** Patient features an administrator can switch on or off, globally or per patient. */
export const FEATURES = [
  { key: 'recording', label: 'Record in the browser', description: 'Patients can record speech with their microphone on the New recording page.' },
  { key: 'upload', label: 'Upload audio files', description: 'Patients can upload a recording they already have (WAV, MP3, M4A, WebM, OGG).' },
  { key: 'analysis', label: 'Speech analysis', description: 'Patients can run transcription and get insights (pace, pauses, repetitions, flow index).' },
  { key: 'clinicianDirectory', label: 'Find a clinician', description: 'Patients can browse verified clinicians in the directory.' },
  { key: 'consultations', label: 'Request consultations', description: 'Patients can send new consultation requests. Existing consultations stay visible.' },
  { key: 'sessionSharing', label: 'Share sessions with clinicians', description: 'Patients can share recordings with clinicians who accepted them. Removing a share is always allowed.' },
  { key: 'progressCharts', label: 'Progress charts', description: 'Dashboard trend, activity and practice-mix charts.' },
  { key: 'practiceTips', label: 'Daily practice idea', description: 'The practice idea card on the dashboard.' },
  { key: 'roadmap', label: 'Fluency roadmap', description: 'A personal step-by-step practice plan built from the patient’s own results.' },
  { key: 'aiCoaching', label: 'AI coaching (Claude)', description: 'Lets patients who opt in get roadmap coaching written by Claude. Needs ANTHROPIC_API_KEY on the server. Only practice numbers are sent, never audio or transcripts.' },
] as const;

export type FeatureKey = (typeof FEATURES)[number]['key'];
export const FEATURE_KEYS = FEATURES.map((f) => f.key) as FeatureKey[];
export type FeatureMap = Record<FeatureKey, boolean>;

export const DEFAULT_WEEKLY_GOAL = 5;

export interface GlobalSettings { features: FeatureMap; weeklyGoal: number; announcement: string }
export interface PatientOverrides { features: Partial<FeatureMap>; weeklyGoal: number | null }

const readAll = (db: DB) =>
  new Map(
    (db.prepare('SELECT key, value FROM app_settings').all() as { key: string; value: string }[]).map((r) => [
      r.key,
      JSON.parse(r.value) as unknown,
    ]),
  );

export function getGlobalSettings(db: DB): GlobalSettings {
  const m = readAll(db);
  const features = Object.fromEntries(
    FEATURE_KEYS.map((k) => [k, m.has(`feature.${k}`) ? !!m.get(`feature.${k}`) : true]),
  ) as FeatureMap;
  const goal = m.get('weeklyGoal');
  return {
    features,
    weeklyGoal: typeof goal === 'number' ? goal : DEFAULT_WEEKLY_GOAL,
    announcement: typeof m.get('announcement') === 'string' ? (m.get('announcement') as string) : '',
  };
}

export function saveGlobalSettings(
  db: DB,
  s: { features?: Partial<Record<FeatureKey, boolean | undefined>>; weeklyGoal?: number | undefined; announcement?: string | undefined },
  adminId: string,
) {
  const up = db.prepare(
    `INSERT INTO app_settings (key, value, updated_at, updated_by) VALUES (?,?,?,?)
     ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at, updated_by = excluded.updated_by`,
  );
  const now = nowIso();
  db.transaction(() => {
    for (const [k, v] of Object.entries(s.features ?? {})) if (v !== undefined) up.run(`feature.${k}`, JSON.stringify(!!v), now, adminId);
    if (s.weeklyGoal !== undefined) up.run('weeklyGoal', JSON.stringify(s.weeklyGoal), now, adminId);
    if (s.announcement !== undefined) up.run('announcement', JSON.stringify(s.announcement), now, adminId);
  })();
}

export function getPatientOverrides(db: DB, patientId: string): PatientOverrides {
  const rows = db
    .prepare('SELECT key, value FROM patient_settings WHERE patient_id = ?')
    .all(patientId) as { key: string; value: string }[];
  const out: PatientOverrides = { features: {}, weeklyGoal: null };
  for (const r of rows) {
    const v = JSON.parse(r.value) as unknown;
    if (r.key.startsWith('feature.')) {
      const k = r.key.slice(8) as FeatureKey;
      if (FEATURE_KEYS.includes(k)) out.features[k] = !!v;
    } else if (r.key === 'weeklyGoal' && typeof v === 'number') out.weeklyGoal = v;
  }
  return out;
}

/** `null` removes an override so the patient follows the global setting again. */
export function savePatientOverrides(
  db: DB,
  patientId: string,
  o: { features?: Partial<Record<FeatureKey, boolean | null | undefined>>; weeklyGoal?: number | null | undefined },
  adminId: string,
) {
  const up = db.prepare(
    `INSERT INTO patient_settings (patient_id, key, value, updated_at, updated_by) VALUES (?,?,?,?,?)
     ON CONFLICT(patient_id, key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at, updated_by = excluded.updated_by`,
  );
  const del = db.prepare('DELETE FROM patient_settings WHERE patient_id = ? AND key = ?');
  const now = nowIso();
  db.transaction(() => {
    for (const [k, v] of Object.entries(o.features ?? {})) {
      if (v === undefined) continue;
      if (v === null) del.run(patientId, `feature.${k}`);
      else up.run(patientId, `feature.${k}`, JSON.stringify(v), now, adminId);
    }
    if (o.weeklyGoal === null) del.run(patientId, 'weeklyGoal');
    else if (o.weeklyGoal !== undefined) up.run(patientId, 'weeklyGoal', JSON.stringify(o.weeklyGoal), now, adminId);
  })();
}

/** What a patient actually gets: their override where set, otherwise the global setting. */
export function effectiveSettings(db: DB, patientId: string) {
  const g = getGlobalSettings(db);
  const o = getPatientOverrides(db, patientId);
  return {
    features: { ...g.features, ...o.features } as FeatureMap,
    weeklyGoal: o.weeklyGoal ?? g.weeklyGoal,
    announcement: g.announcement,
  };
}

export const FEATURE_OFF_MESSAGE = 'This feature is not available on your account right now.';

export function assertFeature(db: DB, patientId: string, key: FeatureKey) {
  if (!effectiveSettings(db, patientId).features[key]) throw new HttpError(403, FEATURE_OFF_MESSAGE);
}

/** Route guard: blocks the request when the feature is switched off for this patient. */
export const requireFeature = (db: DB, key: FeatureKey) => (req: Request, _res: Response, next: NextFunction) => {
  try {
    assertFeature(db, req.user!.id, key);
    next();
  } catch (e) {
    next(e);
  }
};
