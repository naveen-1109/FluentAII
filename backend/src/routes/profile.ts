import { Router } from 'express';
import { z } from 'zod';
import { HttpError } from '../auth.js';
import type { Deps } from '../app.js';
import { nowIso } from '../db.js';

const AGE_GROUPS = ['18-24', '25-34', '35-44', '45-54', '55-64', '65+'] as const;

const patientSchema = z.object({
  confirmAdult: z.literal(true, { error: 'This service is for adults (18+).' }),
  ageGroup: z.enum(AGE_GROUPS),
  primaryLanguage: z.string().trim().min(2).max(60),
  goals: z.string().trim().max(500).default(''),
  consentVoiceProcessing: z.literal(true, {
    error: 'Voice processing consent is required to analyse recordings.',
  }),
  consentTerms: z.literal(true, { error: 'You must accept the terms.' }),
});

const clinicianSchema = z.object({
  title: z.string().trim().min(2).max(60),
  specialty: z.string().trim().min(2).max(100),
  organisation: z.string().trim().max(120).default(''),
  licenseNumber: z.string().trim().min(3).max(60),
  licenseRegion: z.string().trim().min(2).max(80),
  yearsExperience: z.coerce.number().int().min(0).max(70).default(0),
  languages: z.string().trim().max(120).default(''),
  bio: z.string().trim().max(800).default(''),
  acceptsNewPatients: z.boolean().default(true),
  consentTerms: z.literal(true, { error: 'You must accept the terms.' }),
});

export function profileRouter({ db, config }: Deps) {
  const r = Router();

  r.get('/', (req, res) => {
    const u = req.user!;
    if (u.role === 'patient') {
      const p = db.prepare('SELECT * FROM patient_profiles WHERE user_id = ?').get(u.id) as any;
      return res.json({
        profile: p && {
          ageGroup: p.age_group,
          primaryLanguage: p.primary_language,
          goals: p.goals,
        },
      });
    }
    const c = db.prepare('SELECT * FROM clinician_profiles WHERE user_id = ?').get(u.id) as any;
    res.json({
      profile: c && {
        title: c.title,
        specialty: c.specialty,
        organisation: c.organisation,
        licenseNumber: c.license_number,
        licenseRegion: c.license_region,
        yearsExperience: c.years_experience,
        languages: c.languages,
        bio: c.bio,
        acceptsNewPatients: !!c.accepts_new_patients,
        verificationStatus: c.verification_status,
      },
    });
  });

  r.put('/', (req, res) => {
    const u = req.user!;
    const now = nowIso();
    if (u.role === 'patient') {
      const b = patientSchema.parse(req.body);
      db.prepare(
        `INSERT INTO patient_profiles
           (user_id, age_group, primary_language, goals, consent_voice_processing, consent_terms, consented_at)
         VALUES (?,?,?,?,1,1,?)
         ON CONFLICT(user_id) DO UPDATE SET
           age_group = excluded.age_group, primary_language = excluded.primary_language,
           goals = excluded.goals`,
      ).run(u.id, b.ageGroup, b.primaryLanguage, b.goals, now);
    } else if (u.role === 'clinician') {
      const b = clinicianSchema.parse(req.body);
      const status = config.autoVerifyClinicians ? 'verified' : 'pending';
      db.prepare(
        `INSERT INTO clinician_profiles
           (user_id, title, specialty, organisation, license_number, license_region,
            years_experience, languages, bio, accepts_new_patients, verification_status,
            consent_terms, consented_at)
         VALUES (?,?,?,?,?,?,?,?,?,?,?,1,?)
         ON CONFLICT(user_id) DO UPDATE SET
           title = excluded.title, specialty = excluded.specialty,
           organisation = excluded.organisation, years_experience = excluded.years_experience,
           languages = excluded.languages, bio = excluded.bio,
           accepts_new_patients = excluded.accepts_new_patients`,
      ).run(
        u.id, b.title, b.specialty, b.organisation, b.licenseNumber, b.licenseRegion,
        b.yearsExperience, b.languages, b.bio, b.acceptsNewPatients ? 1 : 0, status, now,
      );
    } else {
      throw new HttpError(400, 'Unknown role.');
    }
    db.prepare('UPDATE users SET registered = 1 WHERE id = ?').run(u.id);
    res.json({ ok: true });
  });

  return r;
}
