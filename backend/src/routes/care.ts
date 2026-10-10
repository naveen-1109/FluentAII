import { Router, type Request } from 'express';
import { z } from 'zod';
import { HttpError, requireRegistered, requireRole } from '../auth.js';
import type { Deps } from '../app.js';
import { nowIso } from '../db.js';
import { requireFeature } from '../features.js';
import { FOCUS_LABEL, getPatientRoadmapPlan, getPlanAuthor, getRoadmapConfig, savePatientRoadmapPlan, type FocusKey } from '../roadmap.js';
import { audit, hasCareRelationship, isVerifiedClinician, newId, sessionSummary, VALID_CLINICIAN_SQL } from '../util.js';

const MODES = ['video', 'phone', 'in_person', 'message'] as const;

export function careRouter({ db }: Deps) {
  const r = Router();

  // ---------- directory (patients only) ----------
  r.get('/clinicians', requireRole('patient'), requireRegistered, requireFeature(db, 'clinicianDirectory'), (req, res) => {
    const q = z.object({ q: z.string().trim().max(80).optional() }).parse(req.query).q;
    const rows = db
      .prepare(
        `SELECT u.id, u.full_name AS fullName, c.title, c.specialty, c.organisation,
                c.license_region AS licenseRegion, c.years_experience AS yearsExperience,
                c.languages, c.bio, c.accepts_new_patients AS acceptsNewPatients,
                c.verified_at AS verifiedAt
         FROM users u JOIN clinician_profiles c ON c.user_id = u.id
         WHERE u.registered = 1 AND ${VALID_CLINICIAN_SQL}
         ORDER BY u.full_name`,
      )
      .all() as any[];
    const needle = q?.toLowerCase();
    const list = needle
      ? rows.filter((c) =>
          [c.fullName, c.specialty, c.organisation, c.languages, c.licenseRegion]
            .join(' ')
            .toLowerCase()
            .includes(needle),
        )
      : rows;
    res.json({ clinicians: list.map((c) => ({ ...c, acceptsNewPatients: !!c.acceptsNewPatients, verified: true })) });
  });

  // ---------- appointments ----------
  r.post('/appointments', requireRole('patient'), requireRegistered, requireFeature(db, 'consultations'), (req, res) => {
    const b = z
      .object({
        clinicianId: z.string(),
        requestedStart: z.iso.datetime({ offset: true }),
        mode: z.enum(MODES),
        reason: z.string().trim().max(600).default(''),
      })
      .parse(req.body);
    if (!isVerifiedClinician(db, b.clinicianId)) throw new HttpError(404, 'Clinician not found.');
    const accepting = db
      .prepare('SELECT accepts_new_patients AS a FROM clinician_profiles WHERE user_id = ?')
      .get(b.clinicianId) as { a: number };
    const already = hasCareRelationship(db, req.user!.id, b.clinicianId);
    if (!accepting.a && !already)
      throw new HttpError(409, 'This clinician is not accepting new patients right now.');
    if (new Date(b.requestedStart).getTime() < Date.now() + 5 * 60 * 1000)
      throw new HttpError(400, 'Choose a time in the future.');
    const open = db
      .prepare(
        `SELECT COUNT(*) AS n FROM appointments
         WHERE patient_id = ? AND clinician_id = ? AND status = 'requested'`,
      )
      .get(req.user!.id, b.clinicianId) as { n: number };
    if (open.n >= 3) throw new HttpError(409, 'You already have pending requests with this clinician.');
    const id = newId();
    const now = nowIso();
    db.prepare(
      `INSERT INTO appointments (id, patient_id, clinician_id, requested_start, mode, reason, created_at, updated_at)
       VALUES (?,?,?,?,?,?,?,?)`,
    ).run(id, req.user!.id, b.clinicianId, b.requestedStart, b.mode, b.reason, now, now);
    res.status(201).json({ id });
  });

  r.get('/appointments', requireRegistered, (req, res) => {
    const u = req.user!;
    const rows = db
      .prepare(
        u.role === 'patient'
          ? `SELECT a.*, cu.full_name AS other_name, c.specialty AS other_detail,
                    ${VALID_CLINICIAN_SQL} AS other_verified
             FROM appointments a JOIN users cu ON cu.id = a.clinician_id
             LEFT JOIN clinician_profiles c ON c.user_id = a.clinician_id
             WHERE a.patient_id = ? ORDER BY a.requested_start DESC`
          : `SELECT a.*, pu.full_name AS other_name, '' AS other_detail, 0 AS other_verified
             FROM appointments a JOIN users pu ON pu.id = a.patient_id
             WHERE a.clinician_id = ? ORDER BY a.requested_start DESC`,
      )
      .all(u.id) as any[];
    res.json({
      appointments: rows.map((a) => ({
        id: a.id,
        patientId: a.patient_id,
        clinicianId: a.clinician_id,
        otherName: a.other_name,
        otherDetail: a.other_detail,
        otherVerified: !!a.other_verified,
        requestedStart: a.requested_start,
        mode: a.mode,
        reason: a.reason,
        status: a.status,
        clinicianMessage: a.clinician_message,
        createdAt: a.created_at,
      })),
    });
  });

  r.patch('/appointments/:id', requireRegistered, (req, res) => {
    const u = req.user!;
    const a = db.prepare('SELECT * FROM appointments WHERE id = ?').get(String(req.params.id)) as any;
    if (!a || (u.role === 'patient' ? a.patient_id !== u.id : a.clinician_id !== u.id))
      throw new HttpError(404, 'Appointment not found.');
    const b = z
      .object({
        status: z.enum(['accepted', 'declined', 'cancelled', 'completed']),
        clinicianMessage: z.string().trim().max(600).optional(),
      })
      .parse(req.body);

    const allowed: Record<string, string[]> =
      u.role === 'patient'
        ? { requested: ['cancelled'], accepted: ['cancelled'] }
        : { requested: ['accepted', 'declined'], accepted: ['completed', 'cancelled'] };
    if (!allowed[a.status]?.includes(b.status))
      throw new HttpError(409, `Cannot change an appointment from ${a.status} to ${b.status}.`);
    if (u.role === 'clinician' && !isVerifiedClinician(db, u.id))
      throw new HttpError(403, 'Your clinician account is awaiting verification.');

    db.prepare(
      `UPDATE appointments SET status = ?, clinician_message = COALESCE(?, clinician_message), updated_at = ? WHERE id = ?`,
    ).run(b.status, u.role === 'clinician' ? b.clinicianMessage ?? null : null, nowIso(), a.id);

    // Cancelling an accepted care relationship removes access to shared sessions
    // unless another accepted/completed appointment remains.
    if (b.status === 'cancelled' || b.status === 'declined') {
      if (!hasCareRelationship(db, a.patient_id, a.clinician_id)) {
        db.prepare(
          `DELETE FROM session_shares WHERE clinician_id = ? AND session_id IN
             (SELECT id FROM sessions WHERE patient_id = ?)`,
        ).run(a.clinician_id, a.patient_id);
      }
    }
    audit(db, u.id, `appointment_${b.status}`, a.id);
    res.json({ ok: true });
  });

  // ---------- clinician workspace ----------
  r.get('/clinician/patients', requireRole('clinician'), requireRegistered, (req, res) => {
    if (!isVerifiedClinician(db, req.user!.id))
      throw new HttpError(403, 'Your clinician account is awaiting verification.');
    const rows = db
      .prepare(
        `SELECT p.id AS id, p.full_name AS name,
           (SELECT COUNT(*) FROM session_shares sh JOIN sessions s ON s.id = sh.session_id
              WHERE sh.clinician_id = ? AND s.patient_id = p.id) AS sharedSessions,
           (SELECT MAX(s.created_at) FROM session_shares sh JOIN sessions s ON s.id = sh.session_id
              WHERE sh.clinician_id = ? AND s.patient_id = p.id) AS lastSharedAt
         FROM users p
         WHERE p.id IN (SELECT patient_id FROM appointments
                        WHERE clinician_id = ? AND status IN ('accepted','completed'))
         ORDER BY p.full_name`,
      )
      .all(req.user!.id, req.user!.id, req.user!.id);
    res.json({ patients: rows });
  });

  r.get('/clinician/patients/:patientId/sessions', requireRole('clinician'), requireRegistered, (req, res) => {
    const cid = req.user!.id;
    const pid = String(req.params.patientId);
    if (!isVerifiedClinician(db, cid) || !hasCareRelationship(db, pid, cid))
      throw new HttpError(404, 'Patient not found.');
    const patient = db.prepare('SELECT full_name AS name FROM users WHERE id = ?').get(pid) as
      | { name: string }
      | undefined;
    const rows = db
      .prepare(
        `SELECT s.* FROM sessions s JOIN session_shares sh ON sh.session_id = s.id
         WHERE s.patient_id = ? AND sh.clinician_id = ? ORDER BY s.created_at DESC`,
      )
      .all(pid, cid) as any[];
    audit(db, cid, 'clinician_list_patient_sessions', pid);
    res.json({ patient, sessions: rows.map((s) => sessionSummary(s)) });
  });

  // ---------- roadmap plan for a patient in this clinician's care ----------
  // The clinician sets focus, stage, session length and a note. They do not see figures derived
  // from sessions the patient has not shared, so "Automatic" is not resolved for them.
  const careOr404 = (req: Request) => {
    const cid = req.user!.id;
    const pid = String(req.params.patientId);
    if (!isVerifiedClinician(db, cid) || !hasCareRelationship(db, pid, cid)) throw new HttpError(404, 'Patient not found.');
    return { cid, pid };
  };
  const planView = (pid: string) => {
    const cfg = getRoadmapConfig(db);
    return {
      plan: getPatientRoadmapPlan(db, pid),
      setBy: getPlanAuthor(db, pid),
      focusOptions: (Object.keys(FOCUS_LABEL) as FocusKey[]).map((k) => ({ value: k, label: FOCUS_LABEL[k] })),
      stageOptions: ['Foundations', 'Focus', 'Carry it into conversation', 'Everyday confidence'].map((t, i) => ({ value: i + 1, label: t })),
      minuteOptions: [2, 3, 5, 10],
      suggestions: cfg.suggestions,
    };
  };

  r.get('/clinician/patients/:patientId/roadmap', requireRole('clinician'), requireRegistered, (req, res) => {
    const { pid } = careOr404(req);
    res.json(planView(pid));
  });

  r.put('/clinician/patients/:patientId/roadmap', requireRole('clinician'), requireRegistered, (req, res) => {
    const { cid, pid } = careOr404(req);
    const b = z
      .object({
        focus: z.enum(Object.keys(FOCUS_LABEL) as [FocusKey, ...FocusKey[]]).nullable(),
        stage: z.union([z.literal(1), z.literal(2), z.literal(3), z.literal(4)]).nullable(),
        minutes: z.union([z.literal(2), z.literal(3), z.literal(5), z.literal(10)]).nullable(),
        note: z.string().trim().max(500),
      })
      .strict()
      .parse(req.body);
    savePatientRoadmapPlan(db, pid, b, cid);
    audit(db, cid, 'clinician_update_roadmap',
      `${pid}: focus=${b.focus ?? 'auto'}, stage=${b.stage ?? 'auto'}, minutes=${b.minutes ?? 'auto'}${b.note ? ', note' : ''}`);
    res.json(planView(pid));
  });

  return r;
}
