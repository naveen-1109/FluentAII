import { Router } from 'express';
import { z } from 'zod';
import { HttpError } from '../auth.js';
import { ADMIN_COOKIE, authenticateAdmin } from '../adminAuth.js';
import type { Deps } from '../app.js';
import {
  FEATURES,
  FEATURE_KEYS,
  effectiveSettings,
  getGlobalSettings,
  getPatientOverrides,
  saveGlobalSettings,
  savePatientOverrides,
  type FeatureKey,
} from '../features.js';
import { audit, CLINICIAN_STATUS_SQL } from '../util.js';
import { nowIso } from '../db.js';

const featureShape = <T extends z.ZodTypeAny>(t: T) =>
  z.object(Object.fromEntries(FEATURE_KEYS.map((k) => [k, t.optional()])) as Record<FeatureKey, z.ZodOptional<T>>).strict();

export function adminRouter({ db, config }: Deps) {
  const r = Router();
  // Sign-in happens on the shared /auth/login endpoint.
  r.post('/logout', (_req, res) => {
    res.clearCookie(ADMIN_COOKIE, { path: '/' });
    res.json({ ok: true });
  });

  r.use(authenticateAdmin(db, config.jwtSecret));

  r.get('/me', (req, res) => res.json({ admin: req.admin }));

  // ---------- overview ----------
  r.get('/overview', (_req, res) => {
    const n = (sql: string, ...p: unknown[]) => (db.prepare(sql).get(...p) as { n: number }).n;
    const weekAgo = new Date(Date.now() - 7 * 86_400_000).toISOString();
    const clin = Object.fromEntries(
      (db.prepare(`SELECT ${CLINICIAN_STATUS_SQL} AS s, COUNT(*) AS n FROM clinician_profiles c GROUP BY s`).all() as { s: string; n: number }[]).map((x) => [x.s, x.n]),
    );
    const appts = Object.fromEntries(
      (db.prepare(`SELECT status AS s, COUNT(*) AS n FROM appointments GROUP BY s`).all() as { s: string; n: number }[]).map((x) => [x.s, x.n]),
    );
    const recent = db
      .prepare(`SELECT id, full_name AS fullName, email, role, registered, created_at AS createdAt FROM users ORDER BY created_at DESC LIMIT 6`)
      .all() as any[];
    const g = getGlobalSettings(db);
    res.json({
      patients: n(`SELECT COUNT(*) AS n FROM users WHERE role = 'patient'`),
      newPatientsThisWeek: n(`SELECT COUNT(*) AS n FROM users WHERE role = 'patient' AND created_at >= ?`, weekAgo),
      clinicians: { verified: clin.verified ?? 0, pending: clin.pending ?? 0, expired: clin.expired ?? 0, rejected: clin.rejected ?? 0 },
      sessions: n(`SELECT COUNT(*) AS n FROM sessions`),
      sessionsAnalysed: n(`SELECT COUNT(*) AS n FROM sessions WHERE status = 'completed'`),
      sessionsThisWeek: n(`SELECT COUNT(*) AS n FROM sessions WHERE created_at >= ?`, weekAgo),
      appointments: appts,
      featuresOff: FEATURE_KEYS.filter((k) => !g.features[k]).length,
      patientsWithOverrides: n(`SELECT COUNT(DISTINCT patient_id) AS n FROM patient_settings WHERE key NOT LIKE 'roadmap.%'`),
      recentUsers: recent.map((u) => ({ ...u, registered: !!u.registered })),
    });
  });

  // ---------- global patient features ----------
  r.get('/features', (_req, res) => {
    const g = getGlobalSettings(db);
    res.json({ features: FEATURES.map((f) => ({ ...f, enabled: g.features[f.key] })), weeklyGoal: g.weeklyGoal, announcement: g.announcement });
  });

  r.put('/features', (req, res) => {
    const b = z
      .object({
        features: featureShape(z.boolean()).optional(),
        weeklyGoal: z.number().int().min(1).max(21).optional(),
        announcement: z.string().trim().max(280).optional(),
      })
      .strict()
      .parse(req.body);
    const before = getGlobalSettings(db);
    saveGlobalSettings(db, b, req.admin!.id);
    const changed = [
      ...FEATURE_KEYS.filter((k) => b.features?.[k] !== undefined && b.features[k] !== before.features[k]).map((k) => `${k}=${b.features![k] ? 'on' : 'off'}`),
      ...(b.weeklyGoal !== undefined && b.weeklyGoal !== before.weeklyGoal ? [`weeklyGoal=${b.weeklyGoal}`] : []),
      ...(b.announcement !== undefined && b.announcement !== before.announcement ? ['announcement'] : []),
    ];
    if (changed.length) audit(db, req.admin!.id, 'admin_update_features', changed.join(', '));
    const g = getGlobalSettings(db);
    res.json({ features: FEATURES.map((f) => ({ ...f, enabled: g.features[f.key] })), weeklyGoal: g.weeklyGoal, announcement: g.announcement });
  });

  // ---------- patients ----------
  r.get('/patients', (req, res) => {
    const q = z.object({ q: z.string().trim().max(100).optional() }).parse(req.query).q?.toLowerCase();
    const rows = db
      .prepare(
        `SELECT u.id, u.full_name AS fullName, u.email, u.registered, u.created_at AS createdAt,
                (SELECT COUNT(*) FROM sessions s WHERE s.patient_id = u.id) AS sessions,
                (SELECT MAX(created_at) FROM sessions s WHERE s.patient_id = u.id) AS lastSessionAt,
                (SELECT COUNT(*) FROM patient_settings ps WHERE ps.patient_id = u.id AND ps.key NOT LIKE 'roadmap.%') AS overrides
         FROM users u WHERE u.role = 'patient' ORDER BY u.created_at DESC`,
      )
      .all() as any[];
    const list = q ? rows.filter((p) => `${p.fullName} ${p.email}`.toLowerCase().includes(q)) : rows;
    res.json({ patients: list.map((p) => ({ ...p, registered: !!p.registered })) });
  });

  const patientOr404 = (id: string) => {
    const u = db
      .prepare(`SELECT id, full_name AS fullName, email, registered, created_at AS createdAt FROM users WHERE id = ? AND role = 'patient'`)
      .get(id) as any;
    if (!u) throw new HttpError(404, 'Patient not found.');
    return { ...u, registered: !!u.registered };
  };

  const patientFeatures = (id: string) => {
    const g = getGlobalSettings(db);
    const o = getPatientOverrides(db, id);
    const e = effectiveSettings(db, id);
    return {
      features: FEATURES.map((f) => ({
        ...f,
        global: g.features[f.key],
        override: o.features[f.key] ?? null,
        effective: e.features[f.key],
      })),
      weeklyGoal: { global: g.weeklyGoal, override: o.weeklyGoal, effective: e.weeklyGoal },
    };
  };

  r.get('/patients/:id', (req, res) => {
    const p = patientOr404(String(req.params.id));
    const profile = db
      .prepare(`SELECT age_group AS ageGroup, primary_language AS primaryLanguage, goals, consented_at AS consentedAt FROM patient_profiles WHERE user_id = ?`)
      .get(p.id);
    const stats = db
      .prepare(
        `SELECT COUNT(*) AS sessions, SUM(status = 'completed') AS analysed, COALESCE(SUM(duration_sec), 0) AS seconds, MAX(created_at) AS lastSessionAt
         FROM sessions WHERE patient_id = ?`,
      )
      .get(p.id) as any;
    const appointments = (db.prepare(`SELECT COUNT(*) AS n FROM appointments WHERE patient_id = ?`).get(p.id) as { n: number }).n;
    audit(db, req.admin!.id, 'admin_view_patient', p.id);
    res.json({
      patient: p,
      profile: profile ?? null,
      stats: { sessions: stats.sessions, analysed: stats.analysed ?? 0, minutes: Math.round((stats.seconds / 60) * 10) / 10, lastSessionAt: stats.lastSessionAt, appointments },
      ...patientFeatures(p.id),
    });
  });

  r.put('/patients/:id/features', (req, res) => {
    const p = patientOr404(String(req.params.id));
    const b = z
      .object({
        features: featureShape(z.boolean().nullable()).optional(),
        weeklyGoal: z.number().int().min(1).max(21).nullable().optional(),
      })
      .strict()
      .parse(req.body);
    savePatientOverrides(db, p.id, b, req.admin!.id);
    const parts = [
      ...Object.entries(b.features ?? {}).map(([k, v]) => `${k}=${v === null ? 'default' : v ? 'on' : 'off'}`),
      ...(b.weeklyGoal !== undefined ? [`weeklyGoal=${b.weeklyGoal ?? 'default'}`] : []),
    ];
    if (parts.length) audit(db, req.admin!.id, 'admin_update_patient_features', `${p.id}: ${parts.join(', ')}`);
    res.json(patientFeatures(p.id));
  });

  // ---------- clinician verification ----------
  const today = () => new Date().toISOString().slice(0, 10);

  r.get('/clinicians', (req, res) => {
    const status = z.object({ status: z.enum(['pending', 'verified', 'expired', 'rejected']).optional() }).parse(req.query).status;
    const rows = (
      db
        .prepare(
          `SELECT u.id, u.full_name AS fullName, u.email, u.created_at AS createdAt, c.title, c.specialty, c.organisation,
                  c.license_number AS licenseNumber, c.license_region AS licenseRegion, c.license_expiry AS licenseExpiry,
                  c.years_experience AS yearsExperience, ${CLINICIAN_STATUS_SQL} AS status,
                  c.verified_at AS verifiedAt, c.verification_ref AS verificationRef, c.verification_note AS verificationNote,
                  COALESCE(ad.full_name, c.verified_by) AS verifiedBy
           FROM users u JOIN clinician_profiles c ON c.user_id = u.id
           LEFT JOIN admins ad ON ad.id = c.verified_by
           ORDER BY u.created_at DESC`,
        )
        .all() as any[]
    ).filter((c) => !status || c.status === status);
    const order: Record<string, number> = { pending: 0, expired: 1, verified: 2, rejected: 3 };
    rows.sort((x, y) => order[x.status]! - order[y.status]!);
    res.json({ clinicians: rows });
  });

  r.patch('/clinicians/:id', (req, res) => {
    const id = String(req.params.id);
    const exists = db.prepare('SELECT 1 FROM clinician_profiles WHERE user_id = ?').get(id);
    if (!exists) throw new HttpError(404, 'Clinician not found.');
    const b = z
      .discriminatedUnion('status', [
        // Approval needs proof that the licence was checked and is still valid.
        z.object({
          status: z.literal('verified'),
          licenseExpiry: z.iso
            .date('Enter the licence expiry date you confirmed.')
            .refine((d) => d > today(), 'This licence has expired. Only clinicians with a valid licence can be approved.'),
          verificationRef: z.string().trim().min(3, 'Enter the registry number or reference you checked.').max(200),
          confirmChecked: z.literal(true, { error: 'Confirm that you checked the licence with the issuing body.' }),
          note: z.string().trim().max(500).default(''),
        }),
        z.object({ status: z.literal('rejected'), note: z.string().trim().max(500).default('') }),
        z.object({ status: z.literal('pending'), note: z.string().trim().max(500).default('') }),
      ])
      .parse(req.body);

    if (b.status === 'verified') {
      db.prepare(
        `UPDATE clinician_profiles SET verification_status = 'verified', license_expiry = ?, verified_at = ?,
           verified_by = ?, verification_ref = ?, verification_note = ? WHERE user_id = ?`,
      ).run(b.licenseExpiry, nowIso(), req.admin!.id, b.verificationRef, b.note, id);
      audit(db, req.admin!.id, 'admin_clinician_verified', `${id}: licence valid until ${b.licenseExpiry}, ref ${b.verificationRef}`);
    } else {
      db.prepare(
        `UPDATE clinician_profiles SET verification_status = ?, verified_at = NULL, verified_by = NULL,
           verification_ref = NULL, verification_note = ? WHERE user_id = ?`,
      ).run(b.status, b.note, id);
      audit(db, req.admin!.id, `admin_clinician_${b.status}`, b.note ? `${id}: ${b.note}` : id);
    }
    res.json({ ok: true, status: b.status });
  });

  // ---------- activity log ----------
  r.get('/audit', (_req, res) => {
    const rows = db
      .prepare(
        `SELECT l.id, l.action, l.target, l.at, COALESCE(a.full_name, u.full_name) AS actor,
                CASE WHEN a.id IS NOT NULL THEN 'admin' ELSE u.role END AS actorRole
         FROM audit_log l LEFT JOIN admins a ON a.id = l.user_id LEFT JOIN users u ON u.id = l.user_id
         ORDER BY l.id DESC LIMIT 150`,
      )
      .all();
    res.json({ entries: rows });
  });

  return r;
}
