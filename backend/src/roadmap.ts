import type { DB } from './db.js';

/**
 * Builds a personal fluency-practice roadmap from a patient's analysed sessions.
 * Everything here is deterministic and explainable: the numbers come from the same indicators
 * shown on each session page. The optional AI coach (coach.ts) only rewrites the wording.
 */

export type FocusKey = 'repetitions' | 'fillers' | 'pauses' | 'pace' | 'carryover';
export type Activity = 'free_speech' | 'reading' | 'breathing_exercise' | 'conversation_practice';

export interface Snapshot {
  flow: number | null;
  repsPer100: number | null;
  fillersPer100: number | null;
  longPausesPerMin: number | null;
  longestPause: number | null;
  wpm: number | null;
}

export interface Technique { key: string; name: string; how: string }
export interface Exercise { activity: Activity; technique: Technique; minutes: number; prompt: string }
export interface Target { label: string; current: number; goal: number; unit: string; done: boolean; lowerIsBetter?: boolean }
export interface Phase {
  id: 'foundations' | 'focus' | 'carryover' | 'maintain';
  title: string;
  summary: string;
  status: 'done' | 'current' | 'upcoming';
  targets: Target[];
  exercises: Exercise[];
  tip: string;
}
export interface Roadmap {
  ready: boolean; // at least one analysed session
  analysed: number;
  weeklyGoal: number;
  sessionsThisWeek: number;
  baseline: Snapshot | null;
  current: Snapshot | null;
  focus: { primary: FocusKey; secondary: FocusKey | null; why: string };
  /** What the results alone would choose (shown to the admin next to "Automatic"). */
  autoFocus: FocusKey;
  autoStage: number;
  phases: Phase[];
  currentPhase: Phase['id'];
  progressPct: number;
  thisWeek: { day: number; exercise: Exercise }[];
  goals: string;
  /** Set by the admin for this patient. */
  plan: { focusPinned: boolean; stagePinned: boolean; note: string; setBy: PlanAuthor | null };
}

// ---------- techniques (general, widely taught fluency-practice strategies; not a treatment plan) ----------

export const DEFAULT_TECHNIQUES: Record<string, Technique> = {
  breath: { key: 'breath', name: 'Relaxed breathing', how: 'Breathe in low and slow through your nose, then start speaking gently as you breathe out.' },
  easyOnset: { key: 'easyOnset', name: 'Easy onsets', how: 'Start the first sound of a phrase softly, with a little air flowing first, instead of a hard start.' },
  lightContact: { key: 'lightContact', name: 'Light contacts', how: 'Touch your lips and tongue together lightly on sounds like p, b, t, d, k and g, as if they were feathers.' },
  pullOut: { key: 'pullOut', name: 'Smooth pull-outs', how: 'If you feel stuck on a sound, slow it down and stretch it gently into the rest of the word instead of pushing.' },
  pauseNotFill: { key: 'pauseNotFill', name: 'Pause instead of filling', how: 'When you need a moment, close your mouth and pause silently. A short pause sounds calm; "um" is not needed.' },
  phrasing: { key: 'phrasing', name: 'Planned phrasing', how: 'Speak in short phrases of 4 to 6 words with a relaxed breath and a brief pause between them.' },
  stretch: { key: 'stretch', name: 'Gentle stretching', how: 'Stretch the first vowel of a phrase slightly and keep your voice moving through the words.' },
  rate: { key: 'rate', name: 'Steady pace', how: 'Slow down a little and give each word its full length. Aim for an easy, even rhythm.' },
  carry: { key: 'carry', name: 'Real-life practice', how: 'Use your techniques in a situation you meet this week: a phone call, ordering food or introducing yourself.' },
};

const PROMPTS: Record<Activity, string> = {
  breathing_exercise: 'Breathe in slowly, then say one short sentence on the out-breath. Repeat with five sentences.',
  reading: 'Read a short paragraph from a book or news page out loud.',
  free_speech: 'Talk for two minutes about your day or a place you like.',
  conversation_practice: 'Act out a phone call, such as booking a table or asking a shop a question, and say both sides.',
};


const focusTable = (T: Record<string, Technique>): Record<FocusKey, { label: string; techniques: Technique[]; why: string }> => ({
  repetitions: { label: 'Repetitions', techniques: [T.easyOnset!, T.lightContact!, T.pullOut!], why: 'Repeated sounds and words are the part of your speech with the most room to change.' },
  fillers: { label: 'Fillers', techniques: [T.pauseNotFill!, T.phrasing!], why: 'Fillers like "um" and "uh" show up most often in your recordings.' },
  pauses: { label: 'Long pauses', techniques: [T.stretch!, T.breath!, T.phrasing!], why: 'Long pauses or stops inside your speech are the main thing pulling your flow index down.' },
  pace: { label: 'Pace', techniques: [T.rate!, T.phrasing!], why: 'You speak quite fast; a steadier pace often makes speech feel easier to control.' },
  carryover: { label: 'Everyday speaking', techniques: [T.carry!, T.easyOnset!], why: 'Your recordings already look smooth, so the next step is using your skills in everyday situations.' },
});

export const FOCUS_LABEL: Record<FocusKey, string> = {
  repetitions: 'Repetitions', fillers: 'Fillers', pauses: 'Long pauses', pace: 'Pace', carryover: 'Everyday speaking',
};

// ---------- admin-editable configuration ----------

/** Stage targets, technique wording and the suggestions clinicians pick from. */
export interface RoadmapConfig {
  targets: {
    foundationSessions: number; // analysed sessions to finish stage 1
    focusImprovementPct: number; // % better than the start on the focus metric
    focusSessions: number; // analysed sessions in total before stage 2 can finish
    conversationSessions: number; // conversation-practice sessions for stage 3
    maintainWeeks: number; // weeks meeting the weekly goal for stage 4
    flowGain: number; // flow-index points above the start for stage 4
  };
  techniques: Record<string, Technique>;
  suggestions: string[];
}

export const DEFAULT_SUGGESTIONS = [
  'Great progress this week. Keep your sessions short and regular, two minutes a day is enough.',
  'Try your easy onsets on the first word of every sentence when you read aloud.',
  'Before your next phone call, practise the first sentence you will say three times out loud.',
  'It is fine to pause. A calm, silent pause sounds confident to listeners.',
  'Focus on how speaking feels, not only on the numbers. Some days will be harder and that is normal.',
  'Record one session in a real situation this week, for example ordering at a cafe.',
  'Share your latest session with your speech-language pathologist before your next appointment.',
  'Slow your pace slightly at the start of each phrase, then let it flow.',
];

export const DEFAULT_CONFIG: RoadmapConfig = {
  targets: { foundationSessions: 3, focusImprovementPct: 25, focusSessions: 6, conversationSessions: 3, maintainWeeks: 2, flowGain: 10 },
  techniques: DEFAULT_TECHNIQUES,
  suggestions: DEFAULT_SUGGESTIONS,
};

/** The built-in roadmap settings. (`db` is kept so callers do not change if settings become editable again.) */
export function getRoadmapConfig(_db: DB): RoadmapConfig {
  return {
    targets: { ...DEFAULT_CONFIG.targets },
    techniques: Object.fromEntries(Object.entries(DEFAULT_TECHNIQUES).map(([k, t]) => [k, { ...t }])),
    suggestions: [...DEFAULT_SUGGESTIONS],
  };
}

/** Per-patient choices made by the admin. `null`/missing means automatic. */
export interface PatientRoadmapPlan {
  focus: FocusKey | null;
  stage: 1 | 2 | 3 | 4 | null;
  minutes: number | null;
  note: string;
}

/** Who last changed a patient's plan: their clinician (or, for older plans, an admin). */
export interface PlanAuthor { kind: 'clinician' | 'admin'; name: string; at: string }

export function getPlanAuthor(db: DB, patientId: string): PlanAuthor | null {
  const row = db
    .prepare(
      `SELECT ps.updated_by AS by, ps.updated_at AS at,
              TRIM(COALESCE(cp.title, '') || ' ' || u.full_name) AS clinician, a.full_name AS admin
       FROM patient_settings ps
       LEFT JOIN users u ON u.id = ps.updated_by AND u.role = 'clinician'
       LEFT JOIN clinician_profiles cp ON cp.user_id = u.id
       LEFT JOIN admins a ON a.id = ps.updated_by
       WHERE ps.patient_id = ? AND ps.key LIKE 'roadmap.%'
       ORDER BY ps.updated_at DESC LIMIT 1`,
    )
    .get(patientId) as { by: string; at: string; clinician: string | null; admin: string | null } | undefined;
  if (!row) return null;
  if (row.clinician) return { kind: 'clinician', name: row.clinician, at: row.at };
  return { kind: 'admin', name: 'Your FluentAI team', at: row.at };
}

/** Saves a patient's plan. `null` / empty values go back to automatic. */
export function savePatientRoadmapPlan(db: DB, patientId: string, plan: PatientRoadmapPlan, byId: string) {
  const up = db.prepare(
    `INSERT INTO patient_settings (patient_id, key, value, updated_at, updated_by) VALUES (?,?,?,?,?)
     ON CONFLICT(patient_id, key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at, updated_by = excluded.updated_by`,
  );
  const del = db.prepare('DELETE FROM patient_settings WHERE patient_id = ? AND key = ?');
  const now = new Date().toISOString();
  db.transaction(() => {
    for (const [k, v] of Object.entries(plan)) {
      if (v === null || v === '') del.run(patientId, `roadmap.${k}`);
      else up.run(patientId, `roadmap.${k}`, JSON.stringify(v), now, byId);
    }
  })();
}

export function getPatientRoadmapPlan(db: DB, patientId: string): PatientRoadmapPlan {
  const rows = db
    .prepare(`SELECT key, value FROM patient_settings WHERE patient_id = ? AND key LIKE 'roadmap.%'`)
    .all(patientId) as { key: string; value: string }[];
  const m = new Map(rows.map((r) => [r.key, JSON.parse(r.value) as unknown]));
  return {
    focus: (m.get('roadmap.focus') as FocusKey) ?? null,
    stage: (m.get('roadmap.stage') as PatientRoadmapPlan['stage']) ?? null,
    minutes: (m.get('roadmap.minutes') as number) ?? null,
    note: (m.get('roadmap.note') as string) ?? '',
  };
}

// ---------- metrics ----------

interface Row { created_at: string; activity: Activity; indicators_json: string | null; duration_sec: number | null }

const mean = (xs: (number | null)[]) => {
  const v = xs.filter((x): x is number => typeof x === 'number' && Number.isFinite(x));
  return v.length ? v.reduce((a, b) => a + b, 0) / v.length : null;
};
const r1 = (x: number | null) => (x == null ? null : Math.round(x * 10) / 10);

function snapshotOf(ind: any): Snapshot & { comp: Record<string, number> | null } {
  const words = Math.max(1, ind?.word_count ?? 0);
  const activeMin = Math.max(1 / 60, (ind?.active_speech_sec ?? 0) / 60);
  return {
    flow: ind?.flow_index ?? null,
    repsPer100: ind ? (100 * (ind.repetition_count ?? 0)) / words : null,
    fillersPer100: ind ? (100 * (ind.filler_count ?? 0)) / words : null,
    longPausesPerMin: ind ? (ind.pause_count ?? 0) / activeMin : null,
    longestPause: ind?.longest_pause_sec ?? null,
    wpm: ind?.speech_rate_wpm_active ?? ind?.speech_rate_wpm_total ?? null,
    comp: ind?.flow_components ?? null,
  };
}

function avgSnap(list: ReturnType<typeof snapshotOf>[]): Snapshot {
  return {
    flow: r1(mean(list.map((s) => s.flow))),
    repsPer100: r1(mean(list.map((s) => s.repsPer100))),
    fillersPer100: r1(mean(list.map((s) => s.fillersPer100))),
    longPausesPerMin: r1(mean(list.map((s) => s.longPausesPerMin))),
    longestPause: r1(mean(list.map((s) => s.longestPause))),
    wpm: r1(mean(list.map((s) => s.wpm))),
  };
}

function chooseFocus(recent: ReturnType<typeof snapshotOf>[], wpm: number | null): { primary: FocusKey; secondary: FocusKey | null } {
  const comp = (k: string) => mean(recent.map((s) => (s.comp ? s.comp[k] ?? null : null)));
  const scores: [FocusKey, number][] = [
    ['repetitions', 1 - (comp('repetition') ?? 1)],
    ['fillers', 1 - (comp('filler') ?? 1)],
    ['pauses', 1 - (comp('pause') ?? 1)],
    ['pace', wpm != null && wpm > 170 ? Math.min(1, (wpm - 170) / 60) : 0],
  ];
  const ranked = scores.filter(([, v]) => v > 0.1).sort((a, b) => b[1] - a[1]);
  return { primary: ranked[0]?.[0] ?? 'carryover', secondary: ranked[1]?.[0] ?? null };
}

/** Metric used to measure progress on a focus area. */
function focusMetric(f: FocusKey, s: Snapshot | null): { label: string; value: number | null; unit: string; lowerIsBetter: boolean } {
  switch (f) {
    case 'repetitions': return { label: 'Repetitions per 100 words', value: s?.repsPer100 ?? null, unit: '', lowerIsBetter: true };
    case 'fillers': return { label: 'Fillers per 100 words', value: s?.fillersPer100 ?? null, unit: '', lowerIsBetter: true };
    case 'pauses': return { label: 'Long pauses per minute', value: s?.longPausesPerMin ?? null, unit: '', lowerIsBetter: true };
    case 'pace': return { label: 'Speaking pace', value: s?.wpm ?? null, unit: 'wpm', lowerIsBetter: true };
    default: return { label: 'Flow index', value: s?.flow ?? null, unit: '/100', lowerIsBetter: false };
  }
}

// ---------- build ----------

export function buildRoadmap(db: DB, patientId: string, weeklyGoal: number, now = new Date()): Roadmap {
  const cfg = getRoadmapConfig(db);
  const plan = getPatientRoadmapPlan(db, patientId);
  const author = getPlanAuthor(db, patientId);
  const T = cfg.techniques;
  const FOCUS = focusTable(T);
  const tg = cfg.targets;
  const ex = (activity: Activity, technique: Technique, minutes: number): Exercise => ({
    activity, technique, minutes: plan.minutes ?? minutes, prompt: PROMPTS[activity],
  });
  const rows = db
    .prepare(
      `SELECT created_at, activity, indicators_json, duration_sec FROM sessions
       WHERE patient_id = ? ORDER BY created_at ASC`,
    )
    .all(patientId) as Row[];
  const done = rows.filter((r) => r.indicators_json);
  const snaps = done.map((r) => ({ ...snapshotOf(JSON.parse(r.indicators_json!)), activity: r.activity }));
  const goals = ((db.prepare('SELECT goals FROM patient_profiles WHERE user_id = ?').get(patientId) as { goals?: string } | undefined)?.goals ?? '').trim();

  const n = snaps.length;
  const baseList = snaps.slice(0, Math.min(3, n));
  const recentList = n >= 4 ? snaps.slice(-3) : snaps.slice(-1);
  const baseline = n ? avgSnap(baseList) : null;
  const current = n ? avgSnap(recentList) : null;
  const auto = n ? chooseFocus(snaps.slice(-3), current?.wpm ?? null) : { primary: 'repetitions' as FocusKey, secondary: null };
  const primary: FocusKey = plan.focus ?? auto.primary;
  const secondary: FocusKey | null = plan.focus ? (auto.primary !== plan.focus ? auto.primary : auto.secondary) : auto.secondary;
  const F = FOCUS[primary];
  const why = plan.focus
    ? `${author?.kind === 'clinician' ? `${author.name}, your clinician,` : 'Your FluentAI team'} chose ${FOCUS_LABEL[primary].toLowerCase()} as your focus for now.`
    : F.why;

  const weekAgo = now.getTime() - 7 * 86_400_000;
  const sessionsThisWeek = rows.filter((r) => new Date(r.created_at).getTime() >= weekAgo).length;
  const breathingDone = snaps.filter((s) => s.activity === 'breathing_exercise').length;
  const convo = snaps.filter((s) => s.activity === 'conversation_practice');

  // Phase 1: foundations
  const p1Targets: Target[] = [
    { label: 'Analysed sessions', current: Math.min(n, tg.foundationSessions), goal: tg.foundationSessions, unit: '', done: n >= tg.foundationSessions },
    { label: 'Breathing exercise sessions', current: Math.min(breathingDone, 1), goal: 1, unit: '', done: breathingDone >= 1 },
  ];
  const p1Done = p1Targets.every((t) => t.done);

  // Phase 2: targeted technique for the main focus, measured against the baseline
  const m0 = focusMetric(primary, baseline);
  const m1 = focusMetric(primary, current);
  let goalVal: number | null = null;
  if (m0.value != null) {
    goalVal = primary === 'carryover' ? Math.min(100, m0.value + 5) : r1(m0.value * (1 - (primary === 'pace' ? Math.min(tg.focusImprovementPct, 15) : tg.focusImprovementPct) / 100));
    if (primary === 'pace') goalVal = Math.max(150, goalVal ?? 150);
  }
  const p2MetricDone = m1.value != null && goalVal != null && (m0.lowerIsBetter ? m1.value <= goalVal : m1.value >= goalVal);
  const p2Targets: Target[] = [
    { label: m0.label, current: m1.value ?? 0, goal: goalVal ?? 0, unit: m0.unit, done: n >= tg.focusSessions && p2MetricDone, lowerIsBetter: m0.lowerIsBetter },
    { label: 'Analysed sessions in total', current: Math.min(n, tg.focusSessions), goal: tg.focusSessions, unit: '', done: n >= tg.focusSessions },
  ];
  const p2Done = p1Done && p2Targets.every((t) => t.done);

  // Phase 3: carry-over to conversation
  const convoFlow = r1(mean(convo.slice(-3).map((s) => s.flow)));
  const flowGoal = baseline?.flow != null ? Math.min(100, Math.round(baseline.flow)) : 70;
  const p3Targets: Target[] = [
    { label: 'Conversation practice sessions', current: Math.min(convo.length, tg.conversationSessions), goal: tg.conversationSessions, unit: '', done: convo.length >= tg.conversationSessions },
    { label: 'Flow index in conversation practice', current: convoFlow ?? 0, goal: flowGoal, unit: '/100', done: convoFlow != null && convoFlow >= flowGoal },
  ];
  const p3Done = p2Done && p3Targets.every((t) => t.done);

  // Phase 4: keep it going
  const weekly = Array.from({ length: tg.maintainWeeks }, (_, w) => rows.filter((r) => {
    const t = new Date(r.created_at).getTime();
    return t < now.getTime() - w * 7 * 86_400_000 && t >= now.getTime() - (w + 1) * 7 * 86_400_000;
  }).length);
  let streakWeeks = 0;
  for (const c of weekly) { if (c >= weeklyGoal) streakWeeks++; else break; }
  const p4Targets: Target[] = [
    { label: 'Weeks meeting your weekly goal', current: streakWeeks, goal: tg.maintainWeeks, unit: '', done: streakWeeks >= tg.maintainWeeks },
    { label: 'Flow index (latest sessions)', current: current?.flow ?? 0, goal: Math.min(100, Math.round((baseline?.flow ?? 60) + tg.flowGain)), unit: '/100',
      done: current?.flow != null && baseline?.flow != null && current.flow >= Math.min(100, baseline.flow + tg.flowGain) },
  ];

  const statusFor = (doneFlag: boolean, prevDone: boolean): Phase['status'] => (doneFlag ? 'done' : prevDone ? 'current' : 'upcoming');
  const [t1, t2, t3] = [F.techniques[0]!, F.techniques[1] ?? F.techniques[0]!, F.techniques[2] ?? F.techniques[0]!];
  const sec = secondary ? FOCUS[secondary].techniques[0]! : T.phrasing!;

  const phases: Phase[] = [
    {
      id: 'foundations', title: 'Foundations', status: statusFor(p1Done, true),
      summary: 'Get a clear starting point and build a calm, relaxed way to begin speaking.',
      targets: p1Targets,
      exercises: [ex('breathing_exercise', T.breath!, 2), ex('reading', T.easyOnset!, 2), ex('free_speech', T.breath!, 2)],
      tip: 'Short, regular sessions help more than one long one. Two minutes a day is a good start.',
    },
    {
      id: 'focus', title: `Focus: ${F.label.toLowerCase()}`, status: statusFor(p2Done, p1Done),
      summary: `${why} Practise ${t1.name.toLowerCase()} until it feels natural.`,
      targets: p2Targets,
      exercises: [ex('reading', t1, 3), ex('free_speech', t2, 3), ex('reading', t3, 2)],
      tip: `Practise ${t1.name.toLowerCase()} on easy reading first, then try it in free speech.`,
    },
    {
      id: 'carryover', title: 'Carry it into conversation', status: statusFor(p3Done, p2Done),
      summary: 'Use the same techniques when talking to someone, where it matters most.',
      targets: p3Targets,
      exercises: [ex('conversation_practice', t1, 3), ex('conversation_practice', sec, 3), ex('free_speech', T.carry!, 2)],
      tip: 'Rehearse a real situation you have coming up this week, then try it for real.',
    },
    {
      id: 'maintain', title: 'Everyday confidence', status: statusFor(false, p3Done),
      summary: 'Keep a steady practice rhythm and keep using your techniques in daily life.',
      targets: p4Targets,
      exercises: [ex('conversation_practice', T.carry!, 3), ex('free_speech', t1, 2), ex('breathing_exercise', T.breath!, 2)],
      tip: 'Notice what went well after each real conversation, not only what was hard.',
    },
  ];

  const autoStage = Math.max(1, phases.findIndex((p) => p.status === 'current') + 1 || phases.length);
  if (plan.stage) {
    // The admin placed this patient on a stage: earlier stages count as done, later ones as upcoming.
    phases.forEach((p, i) => { p.status = i < plan.stage! - 1 ? 'done' : i === plan.stage! - 1 ? 'current' : 'upcoming'; });
  }
  const currentPhase = phases.find((p) => p.status === 'current') ?? phases[phases.length - 1]!;
  const allTargets = phases.flatMap((p) => p.targets);
  const progressPct = plan.stage
    ? Math.round((100 * (plan.stage - 1)) / phases.length + (100 / phases.length) * (currentPhase.targets.filter((t) => t.done).length / currentPhase.targets.length))
    : Math.round((100 * allTargets.filter((t) => t.done).length) / allTargets.length);
  const thisWeek = Array.from({ length: Math.max(1, Math.min(7, weeklyGoal)) }, (_, i) => ({
    day: i + 1,
    exercise: currentPhase.exercises[i % currentPhase.exercises.length]!,
  }));

  return {
    ready: n > 0,
    analysed: n,
    weeklyGoal,
    sessionsThisWeek,
    baseline,
    current,
    focus: { primary, secondary, why },
    autoFocus: auto.primary,
    autoStage: autoStage,
    phases,
    currentPhase: currentPhase.id,
    progressPct,
    thisWeek,
    goals,
    plan: { focusPinned: !!plan.focus, stagePinned: !!plan.stage, note: plan.note, setBy: author },
  };
}
