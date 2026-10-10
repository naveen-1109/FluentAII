import { Router } from 'express';
import { z } from 'zod';
import { HttpError, requireRegistered, requireRole } from '../auth.js';
import type { Deps } from '../app.js';
import { builtinCoaching, coachingSchema, coachInputHash, type CoachInput } from '../coach.js';
import { nowIso } from '../db.js';
import { effectiveSettings, requireFeature } from '../features.js';
import { buildRoadmap } from '../roadmap.js';
import { audit } from '../util.js';

const REGEN_COOLDOWN_MS = 2 * 60 * 1000;

export function roadmapRouter({ db, coach }: Deps) {
  const r = Router();
  r.use(requireRole('patient'), requireRegistered, requireFeature(db, 'roadmap'));

  const context = (userId: string, fullName: string) => {
    const settings = effectiveSettings(db, userId);
    const roadmap = buildRoadmap(db, userId, settings.weeklyGoal);
    const prof = db
      .prepare('SELECT age_group, primary_language, ai_roadmap_consent FROM patient_profiles WHERE user_id = ?')
      .get(userId) as { age_group: string; primary_language: string; ai_roadmap_consent: number | null } | undefined;
    const firstName = fullName.split(' ')[0] ?? '';
    const input: CoachInput = {
      firstName,
      ageGroup: prof?.age_group ?? null,
      language: prof?.primary_language ?? null,
      goals: roadmap.goals,
      teamNote: roadmap.plan.note,
      analysedSessions: roadmap.analysed,
      sessionsThisWeek: roadmap.sessionsThisWeek,
      weeklyGoal: roadmap.weeklyGoal,
      baseline: roadmap.baseline,
      current: roadmap.current,
      focus: roadmap.focus,
      currentPhase: roadmap.currentPhase,
      phases: roadmap.phases.map((p) => ({
        id: p.id, title: p.title, status: p.status,
        targets: p.targets.map((t) => ({ label: t.label, current: t.current, goal: t.goal, done: t.done })),
        techniques: [...new Set(p.exercises.map((e) => e.technique.name))],
      })),
    };
    const ai = {
      configured: coach.available,
      enabled: coach.available && settings.features.aiCoaching,
      consent: !!prof?.ai_roadmap_consent,
      model: coach.model,
    };
    return { roadmap, input, ai, firstName };
  };

  const cached = (userId: string) =>
    db.prepare('SELECT input_hash, coaching_json, model, generated_at FROM roadmap_coaching WHERE patient_id = ?').get(userId) as
      | { input_hash: string; coaching_json: string; model: string; generated_at: string }
      | undefined;

  r.get('/', (req, res) => {
    const { roadmap, input, ai, firstName } = context(req.user!.id, req.user!.fullName);
    const c = ai.enabled && ai.consent ? cached(req.user!.id) : undefined;
    const fresh = !!c && c.input_hash === coachInputHash(input);
    res.json({
      roadmap,
      coaching: c
        ? { source: 'ai', model: c.model, generatedAt: c.generated_at, upToDate: fresh, ...coachingSchema.parse(JSON.parse(c.coaching_json)) }
        : { source: 'builtin', upToDate: true, ...builtinCoaching(roadmap, firstName) },
      ai,
    });
  });

  // Asks Claude to write the coaching notes. Only aggregate numbers and the plan are sent.
  r.post('/coach', async (req, res) => {
    const { roadmap, input, ai } = context(req.user!.id, req.user!.fullName);
    if (!ai.configured) throw new HttpError(503, 'AI coaching is not set up on this server.');
    if (!ai.enabled) throw new HttpError(403, 'AI coaching is turned off for your account.');
    if (!ai.consent) throw new HttpError(403, 'Turn on AI coaching first.');
    if (!roadmap.ready) throw new HttpError(409, 'Analyse at least one recording first.');
    const hash = coachInputHash(input);
    const prev = cached(req.user!.id);
    if (prev && prev.input_hash === hash) {
      return res.json({ coaching: { source: 'ai', model: prev.model, generatedAt: prev.generated_at, upToDate: true, ...JSON.parse(prev.coaching_json) } });
    }
    if (prev && Date.now() - new Date(prev.generated_at).getTime() < REGEN_COOLDOWN_MS)
      throw new HttpError(429, 'Your coaching was just updated. Try again in a couple of minutes.');
    let coaching;
    try {
      coaching = await coach.coach(input);
    } catch (e) {
      console.warn('AI coaching failed:', e instanceof Error ? e.message : e);
      throw new HttpError(502, 'The AI coach is not available right now. Your plan still works without it.');
    }
    const at = nowIso();
    db.prepare(
      `INSERT INTO roadmap_coaching (patient_id, input_hash, coaching_json, model, generated_at) VALUES (?,?,?,?,?)
       ON CONFLICT(patient_id) DO UPDATE SET input_hash = excluded.input_hash, coaching_json = excluded.coaching_json,
         model = excluded.model, generated_at = excluded.generated_at`,
    ).run(req.user!.id, hash, JSON.stringify(coaching), coach.model, at);
    audit(db, req.user!.id, 'ai_coaching_generated', coach.model);
    res.json({ coaching: { source: 'ai', model: coach.model, generatedAt: at, upToDate: true, ...coaching } });
  });

  // The patient chooses whether their practice numbers may be sent to the AI coach.
  r.put('/consent', (req, res) => {
    const { consent } = z.object({ consent: z.boolean() }).strict().parse(req.body);
    db.prepare('UPDATE patient_profiles SET ai_roadmap_consent = ? WHERE user_id = ?').run(consent ? 1 : 0, req.user!.id);
    if (!consent) db.prepare('DELETE FROM roadmap_coaching WHERE patient_id = ?').run(req.user!.id);
    audit(db, req.user!.id, consent ? 'ai_coaching_on' : 'ai_coaching_off');
    res.json({ consent });
  });

  return r;
}
