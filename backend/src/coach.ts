import crypto from 'node:crypto';
import { z } from 'zod';
import type { Roadmap } from './roadmap.js';

/** Personal coaching text written by Claude from the roadmap numbers. Never sees audio or transcripts. */
export const coachingSchema = z.object({
  summary: z.string().min(1).max(700),
  weekFocus: z.string().min(1).max(400),
  phaseTips: z.object({
    foundations: z.string().max(400),
    focus: z.string().max(400),
    carryover: z.string().max(400),
    maintain: z.string().max(400),
  }),
  encouragement: z.string().max(300),
});
export type Coaching = z.infer<typeof coachingSchema>;

export interface CoachClient {
  available: boolean;
  model: string;
  coach(input: CoachInput): Promise<Coaching>;
}

/** Only aggregate numbers, the plan and the patient's own goal text are sent. */
export interface CoachInput {
  firstName: string;
  ageGroup: string | null;
  language: string | null;
  goals: string;
  /** Optional note from the FluentAI team (admin). Coaching should agree with it. */
  teamNote: string;
  analysedSessions: number;
  sessionsThisWeek: number;
  weeklyGoal: number;
  baseline: Roadmap['baseline'];
  current: Roadmap['current'];
  focus: Roadmap['focus'];
  currentPhase: Roadmap['currentPhase'];
  phases: { id: string; title: string; status: string; targets: { label: string; current: number; goal: number; done: boolean }[]; techniques: string[] }[];
}

export const coachInputHash = (i: CoachInput) => crypto.createHash('sha256').update(JSON.stringify(i)).digest('hex');

const SYSTEM = `You are the practice coach inside FluentAI, a speech-practice app for adults who stutter.
You write short, warm, specific coaching notes from the user's practice numbers and their practice plan.

Rules:
- You are not a clinician. Do not diagnose, do not promise a cure, do not mention medication, and do not call stuttering a problem to hide or eliminate.
- Use plain, respectful, person-first language. Talk to the user as "you". No emojis.
- Base every statement on the numbers given. Mention one or two concrete numbers (for example "your repetitions went from 4.1 to 2.8 per 100 words"). Never invent numbers.
- If teamNote is not empty, make your coaching consistent with it and never contradict it.
- Only recommend the techniques listed in the plan. Explain how to use them in everyday terms.
- If the numbers got worse, say so kindly and suggest a small next step; normal variation is expected.
- When useful, suggest sharing progress with a speech-language pathologist.
- Keep each field within its length: summary up to 3 sentences, weekFocus 1-2 sentences, each phase tip 1-2 sentences, encouragement 1 sentence.

Respond with ONLY a JSON object, no other text, in exactly this shape:
{"summary": string, "weekFocus": string, "phaseTips": {"foundations": string, "focus": string, "carryover": string, "maintain": string}, "encouragement": string}`;

export class AnthropicCoach implements CoachClient {
  constructor(
    private apiKey: string | undefined,
    public model: string,
    private fetchImpl: typeof fetch = fetch,
    private baseUrl = 'https://api.anthropic.com',
  ) {}

  get available() {
    return !!this.apiKey;
  }

  async coach(input: CoachInput): Promise<Coaching> {
    if (!this.apiKey) throw new Error('AI coaching is not configured.');
    const res = await this.fetchImpl(`${this.baseUrl}/v1/messages`, {
      method: 'POST',
      headers: { 'x-api-key': this.apiKey, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
      body: JSON.stringify({
        model: this.model,
        max_tokens: 900,
        system: SYSTEM,
        messages: [{ role: 'user', content: `Write my coaching notes from this data:\n${JSON.stringify(input)}` }],
      }),
      signal: AbortSignal.timeout(45_000),
    });
    if (!res.ok) throw new Error(`Claude API returned ${res.status}`);
    const data = (await res.json()) as { content?: { type: string; text?: string }[] };
    const text = (data.content ?? []).filter((c) => c.type === 'text').map((c) => c.text ?? '').join('').trim();
    const json = text.slice(text.indexOf('{'), text.lastIndexOf('}') + 1);
    return coachingSchema.parse(JSON.parse(json));
  }
}

/** Built-in wording, used when AI coaching is off, not configured, or fails. */
export function builtinCoaching(r: Roadmap, firstName: string): Coaching {
  const cur = r.phases.find((p) => p.id === r.currentPhase)!;
  const t = cur.exercises[0]!.technique.name.toLowerCase();
  let summary: string;
  if (!r.ready) summary = `Welcome, ${firstName}. Analyse your first recording and FluentAI will build a plan around your own speech.`;
  else if (r.analysed < 2 || !r.baseline || !r.current) summary = `Your first results are in. Your main focus is ${r.focus.primary === 'carryover' ? 'everyday speaking' : r.focus.primary}. ${r.focus.why}`;
  else {
    const d = r.current.flow != null && r.baseline.flow != null ? Math.round(r.current.flow - r.baseline.flow) : null;
    summary = `${r.focus.why} ${d == null ? '' : d > 0 ? `Your flow index is up ${d} points since you started.` : d < 0 ? `Your flow index is ${-d} points lower than when you started, which is normal from week to week.` : 'Your flow index is steady.'}`.trim();
  }
  return {
    summary,
    weekFocus: `This week, practise ${t} in ${r.weeklyGoal} short sessions. You have done ${r.sessionsThisWeek} in the last 7 days.`,
    phaseTips: Object.fromEntries(r.phases.map((p) => [p.id, p.tip])) as Coaching['phaseTips'],
    encouragement: 'Every session gives you more information about your speech. Keep going at your own pace.',
  };
}
