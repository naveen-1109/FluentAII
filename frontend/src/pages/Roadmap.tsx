import { ArrowDown, ArrowRight, ArrowUp, Check, Lock, MessageSquareText, Mic, RefreshCw, Sparkles, Target } from 'lucide-react';
import { useEffect, useState, type CSSProperties } from 'react';
import { Link } from 'react-router-dom';
import { Alert, Button, PageHeader, SectionTitle, Spinner } from '../components/ui';
import { api, ApiError, type Coaching, type RoadmapExercise, type RoadmapPhase, type RoadmapResponse, type RoadmapSnapshot, type RoadmapTarget } from '../lib/api';
import { ACTIVITY_LABEL } from '../lib/format';
import { useFeatures } from '../lib/features';
import { useAsync } from '../lib/hooks';

const recordLink = (e: RoadmapExercise) => `/app/record?activity=${e.activity}&technique=${e.technique.key}`;

export default function Roadmap() {
  const { features: f } = useFeatures();
  const { data, error, loading, setData } = useAsync(() => api.roadmap.get());
  const [coachBusy, setCoachBusy] = useState(false);
  const [coachErr, setCoachErr] = useState<string | null>(null);

  // When the patient opted in and the AI text is missing or out of date, ask Claude for fresh coaching.
  const wantsAi = !!data && data.ai.enabled && data.ai.consent && data.roadmap.ready && (data.coaching.source !== 'ai' || !data.coaching.upToDate);
  useEffect(() => { if (wantsAi && !coachBusy && !coachErr) void refreshCoaching(); }, [wantsAi]); // eslint-disable-line react-hooks/exhaustive-deps

  async function refreshCoaching() {
    setCoachBusy(true); setCoachErr(null);
    try {
      const { coaching } = await api.roadmap.coach();
      setData((d) => (d ? { ...d, coaching } : d));
    } catch (e) { setCoachErr(e instanceof ApiError ? e.message : 'The AI coach is not available right now.'); }
    finally { setCoachBusy(false); }
  }

  async function setConsent(consent: boolean) {
    setCoachErr(null);
    try {
      await api.roadmap.setConsent(consent);
      const fresh = await api.roadmap.get();
      setData(fresh);
    } catch (e) { setCoachErr(e instanceof ApiError ? e.message : 'Could not change the setting.'); }
  }

  if (!f.roadmap) return <><PageHeader title="My roadmap" /><Alert tone="info">The fluency roadmap is not available on your account right now.</Alert></>;
  if (loading) return <Spinner />;
  if (error || !data) return <Alert tone="danger">{error ?? 'Could not load your roadmap.'}</Alert>;
  const { roadmap: r, coaching: c, ai } = data;
  const current = r.phases.find((p) => p.id === r.currentPhase)!;

  return (
    <>
      <PageHeader title="My fluency roadmap" subtitle="A step-by-step practice plan built from your own recordings. It updates every time a session is analysed." />

      <Hero r={r} c={c} current={current} coachBusy={coachBusy} onRefresh={ai.enabled && ai.consent ? refreshCoaching : undefined} />

      {coachErr && <Alert tone="warn" className="mb-6">{coachErr}</Alert>}

      {r.plan.note && (
        <section className="card mb-6 flex gap-4 border-brand-200 bg-brand-50/60 p-5" aria-label="Note about your roadmap">
          <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-brand-700 text-white"><MessageSquareText className="h-5 w-5" aria-hidden /></span>
          <div className="min-w-0">
            <p className="text-[13px] font-semibold uppercase tracking-[0.12em] text-brand-700">
              {r.plan.setBy?.kind === 'clinician' ? `Note from ${r.plan.setBy.name}, your clinician` : 'Note from your FluentAI team'}
            </p>
            <p className="mt-1 text-[15px] leading-relaxed text-ink-soft">{r.plan.note}</p>
          </div>
        </section>
      )}

      {ai.enabled && <AiCard consent={ai.consent} model={ai.model} onChange={setConsent} />}

      {!r.ready ? (
        <Alert tone="info" title="Your plan starts with your first analysed recording" className="mb-6">
          Record or upload a minute or two of speech and choose “Analyse”. FluentAI then measures your repetitions, fillers, pauses and pace, and picks the stage that fits you.
          <div className="mt-3"><Link to="/app/record?activity=reading"><Button size="sm"><Mic className="h-4 w-4" aria-hidden /> Make your first recording</Button></Link></div>
        </Alert>
      ) : (
        <div className="mb-6 grid grid-cols-1 gap-6 lg:grid-cols-3">
          <ThisWeek r={r} c={c} />
          <Compare base={r.baseline} now={r.current} analysed={r.analysed} />
        </div>
      )}

      <section aria-labelledby="stages">
        <h2 id="stages" className="mb-4 text-lg font-semibold">Your stages</h2>
        <ol className="relative space-y-5 before:absolute before:bottom-6 before:left-[19px] before:top-6 before:w-0.5 before:bg-line">
          {r.phases.map((p, i) => <Stage key={p.id} p={p} n={i + 1} tip={c.phaseTips[p.id] || p.tip} />)}
        </ol>
      </section>

      <p className="mt-8 text-xs leading-relaxed text-ink-muted">
        These are general practice ideas based on your recordings, not a diagnosis or a treatment plan. Speech recognition can miss some repeats and fillers, so treat the numbers as a guide.
        A speech-language pathologist can tailor techniques to you; you can share your sessions with one from the Consultations page.
      </p>
    </>
  );
}

function Hero({ r, c, current, coachBusy, onRefresh }: { r: RoadmapResponse['roadmap']; c: Coaching; current: RoadmapPhase; coachBusy: boolean; onRefresh?: () => void }) {
  const R = 34, C = 2 * Math.PI * R;
  return (
    <section className="dash-hero rise mb-6 p-6 sm:p-8">
      <div className="relative z-10 flex flex-wrap items-start gap-6">
        <svg viewBox="0 0 84 84" className="h-24 w-24 shrink-0" role="img" aria-label={`${r.progressPct}% of the roadmap complete`}>
          <circle cx="42" cy="42" r={R} fill="none" stroke="rgba(255,255,255,.14)" strokeWidth="8" />
          <circle cx="42" cy="42" r={R} fill="none" stroke="#D4FF3A" strokeWidth="8" strokeLinecap="round" strokeDasharray={`${(C * r.progressPct) / 100} ${C}`} transform="rotate(-90 42 42)" style={{ transition: 'stroke-dasharray .8s ease' }} />
          <text x="42" y="40" textAnchor="middle" dominantBaseline="central" fontSize="18" fontWeight="600" fill="#fff">{r.progressPct}%</text>
          <text x="42" y="57" textAnchor="middle" fontSize="8" fill="rgba(255,255,255,.6)">complete</text>
        </svg>
        <div className="min-w-0 flex-1">
          <p className="text-[13px] font-medium uppercase tracking-[0.14em] text-lime">
            Stage {r.phases.indexOf(current) + 1} of {r.phases.length} · {current.title}{r.plan.stagePinned || r.plan.focusPinned ? (r.plan.setBy?.kind === 'clinician' ? ' · set by your clinician' : ' · set by your FluentAI team') : ''}
          </p>
          <p className="mt-2 max-w-2xl text-[17px] leading-relaxed text-white/90">{c.summary}</p>
          <div className="mt-4 flex flex-wrap items-center gap-3 text-xs">
            {c.source === 'ai' ? (
              <span className="inline-flex items-center gap-1.5 rounded-full bg-white/10 px-3 py-1 text-white/80"><Sparkles className="h-3.5 w-3.5 text-lime" aria-hidden /> Coaching written by Claude from your numbers</span>
            ) : (
              <span className="inline-flex items-center gap-1.5 rounded-full bg-white/10 px-3 py-1 text-white/70"><Target className="h-3.5 w-3.5" aria-hidden /> Built from your results</span>
            )}
            {coachBusy && <span className="inline-flex items-center gap-1.5 text-white/70"><RefreshCw className="h-3.5 w-3.5 animate-spin" aria-hidden /> Claude is writing your coaching…</span>}
            {onRefresh && !coachBusy && c.source === 'ai' && !c.upToDate && (
              <button onClick={onRefresh} className="inline-flex items-center gap-1 font-medium text-lime hover:underline"><RefreshCw className="h-3.5 w-3.5" aria-hidden /> Update</button>
            )}
          </div>
        </div>
        {r.ready && (
          <Link to={recordLink(current.exercises[0]!)} className="btn-lime inline-flex shrink-0 items-center gap-2 rounded-full px-5 py-2.5 text-[15px] font-semibold">
            <Mic className="h-4 w-4" aria-hidden /> Next session
          </Link>
        )}
      </div>
    </section>
  );
}

function AiCard({ consent, model, onChange }: { consent: boolean; model: string; onChange: (v: boolean) => void }) {
  return (
    <section className="card mb-6 flex flex-wrap items-center justify-between gap-4 p-5">
      <div className="min-w-0 flex-1">
        <p className="flex items-center gap-2 font-semibold"><Sparkles className="h-4 w-4 text-brand-700" aria-hidden /> Personal coaching from Claude</p>
        <p className="mt-1 text-sm text-ink-muted">
          When this is on, your practice numbers, plan and goals are sent to Anthropic’s Claude ({model}) to write your coaching.
          Your recordings and transcripts are never sent. You can turn it off at any time, which also deletes the AI text.
        </p>
      </div>
      <button type="button" role="switch" aria-checked={consent} aria-label="Personal coaching from Claude" onClick={() => onChange(!consent)}
        className={`relative inline-flex h-7 w-12 shrink-0 items-center rounded-full transition-colors ${consent ? 'bg-brand-700' : 'bg-line-strong'}`}>
        <span className={`inline-block h-5 w-5 rounded-full bg-white shadow transition-transform ${consent ? 'translate-x-6' : 'translate-x-1'}`} />
      </button>
    </section>
  );
}

function ThisWeek({ r, c }: { r: RoadmapResponse['roadmap']; c: Coaching }) {
  const done = Math.min(r.sessionsThisWeek, r.thisWeek.length);
  return (
    <section className="card p-6 lg:col-span-2">
      <SectionTitle aside={<span className="text-sm text-ink-muted">{done} of {r.thisWeek.length} done in the last 7 days</span>}>This week</SectionTitle>
      <p className="mb-4 text-sm text-ink-soft">{c.weekFocus}</p>
      <ul className="space-y-2.5">
        {r.thisWeek.map(({ day, exercise: e }, i) => {
          const isDone = i < done;
          return (
            <li key={day} className={`flex items-center gap-4 rounded-xl border p-3.5 ${isDone ? 'border-ok/30 bg-ok-soft/50' : 'border-line'}`}>
              <span className={`grid h-9 w-9 shrink-0 place-items-center rounded-full text-sm font-semibold ${isDone ? 'bg-ok text-white' : 'bg-surface-sunken text-ink-soft'}`}>
                {isDone ? <Check className="h-4 w-4" aria-label="Done" /> : day}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block font-medium">{e.technique.name} · {ACTIVITY_LABEL[e.activity]}</span>
                <span className="block text-sm text-ink-muted">{e.minutes} min · {e.technique.how}</span>
              </span>
              {!isDone && (
                <Link to={recordLink(e)} className="hidden shrink-0 items-center gap-1 text-sm font-semibold text-brand-700 hover:underline sm:inline-flex">
                  Start <ArrowRight className="h-4 w-4" aria-hidden />
                </Link>
              )}
            </li>
          );
        })}
      </ul>
      <p className="mt-4 text-sm text-ink-muted">{c.encouragement}</p>
    </section>
  );
}

const ROWS: { key: keyof RoadmapSnapshot; label: string; unit: string; lowerIsBetter: boolean }[] = [
  { key: 'flow', label: 'Flow index', unit: '/100', lowerIsBetter: false },
  { key: 'repsPer100', label: 'Repetitions / 100 words', unit: '', lowerIsBetter: true },
  { key: 'fillersPer100', label: 'Fillers / 100 words', unit: '', lowerIsBetter: true },
  { key: 'longPausesPerMin', label: 'Long pauses / min', unit: '', lowerIsBetter: true },
  { key: 'wpm', label: 'Pace', unit: 'wpm', lowerIsBetter: false },
];

function Compare({ base, now, analysed }: { base: RoadmapSnapshot | null; now: RoadmapSnapshot | null; analysed: number }) {
  return (
    <section className="card p-6">
      <SectionTitle>Start vs now</SectionTitle>
      <p className="mb-3 text-xs text-ink-muted">{analysed >= 4 ? 'Your first 3 analysed sessions compared with your latest 3.' : 'Your first sessions compared with your latest one.'}</p>
      <table className="w-full text-sm">
        <thead className="text-xs text-ink-muted"><tr><th className="py-1 text-left font-medium" /><th className="py-1 text-right font-medium">Start</th><th className="py-1 text-right font-medium">Now</th></tr></thead>
        <tbody className="divide-y divide-line">
          {ROWS.map(({ key, label, unit, lowerIsBetter }) => {
            const a = base?.[key] ?? null, b = now?.[key] ?? null;
            const better = a != null && b != null && b !== a && (lowerIsBetter ? b < a : b > a) && key !== 'wpm';
            const worse = a != null && b != null && b !== a && !better && key !== 'wpm';
            return (
              <tr key={key}>
                <td className="py-2 text-ink-soft">{label}</td>
                <td className="py-2 text-right tabular-nums text-ink-muted">{a ?? '—'}</td>
                <td className="py-2 text-right font-semibold tabular-nums">
                  <span className="inline-flex items-center gap-1">
                    {better && (lowerIsBetter ? <ArrowDown className="h-3.5 w-3.5 text-ok" aria-label="better" /> : <ArrowUp className="h-3.5 w-3.5 text-ok" aria-label="better" />)}
                    {worse && <span className="h-1.5 w-1.5 rounded-full bg-warn" aria-label="changed" />}
                    {b ?? '—'}<span className="text-xs font-normal text-ink-muted">{b != null ? unit : ''}</span>
                  </span>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </section>
  );
}

function TargetBar({ t }: { t: RoadmapTarget }) {
  const pct = t.done ? 100 : t.goal <= 0 ? 0 : t.lowerIsBetter
    ? Math.max(5, Math.min(95, (t.goal / Math.max(t.current, 0.01)) * 100))
    : Math.max(0, Math.min(95, (t.current / t.goal) * 100));
  return (
    <div>
      <div className="flex items-baseline justify-between gap-3 text-sm">
        <span className="text-ink-soft">{t.label}</span>
        <span className="shrink-0 tabular-nums text-ink-muted">
          <span className="font-semibold text-ink">{t.current}</span> {t.lowerIsBetter ? 'now · aim ≤' : '/'} {t.goal}{t.unit && t.unit !== '/100' ? ` ${t.unit}` : ''}
        </span>
      </div>
      <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-surface-sunken">
        <div className={`h-full rounded-full ${t.done ? 'bg-ok' : 'bg-brand-500'}`} style={{ width: `${pct}%`, transition: 'width .6s ease' }} />
      </div>
    </div>
  );
}

function Stage({ p, n, tip }: { p: RoadmapPhase; n: number; tip: string }) {
  const icon = p.status === 'done'
    ? <span className="grid h-10 w-10 place-items-center rounded-full bg-ok text-white"><Check className="h-5 w-5" aria-hidden /></span>
    : p.status === 'current'
      ? <span className="relative grid h-10 w-10 place-items-center rounded-full bg-brand-700 font-semibold text-white"><span className="absolute inset-0 animate-ping rounded-full bg-brand-500/40" aria-hidden />{n}</span>
      : <span className="grid h-10 w-10 place-items-center rounded-full border-2 border-line-strong bg-white text-ink-faint"><Lock className="h-4 w-4" aria-hidden /></span>;
  const techniques = [...new Map(p.exercises.map((e) => [e.technique.key, e.technique])).values()];
  return (
    <li className="relative flex gap-4" style={{ '--d': `${n * 60}ms` } as CSSProperties}>
      <div className="relative z-10 shrink-0">{icon}</div>
      <div className={`card rise min-w-0 flex-1 p-5 ${p.status === 'current' ? 'ring-2 ring-brand-500/40' : ''} ${p.status === 'upcoming' ? 'opacity-75' : ''}`}>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="text-[17px] font-semibold">Stage {n}: {p.title}</h3>
          <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${p.status === 'done' ? 'bg-ok-soft text-ok' : p.status === 'current' ? 'bg-brand-50 text-brand-800' : 'bg-surface-sunken text-ink-muted'}`}>
            {p.status === 'done' ? 'Completed' : p.status === 'current' ? 'You are here' : 'Coming up'}
          </span>
        </div>
        <p className="mt-1 text-sm text-ink-muted">{p.summary}</p>
        <div className="mt-4 grid grid-cols-1 gap-5 md:grid-cols-2">
          <div className="space-y-3">
            <p className="text-xs font-semibold uppercase tracking-[0.1em] text-ink-muted">Targets</p>
            {p.targets.map((t) => <TargetBar key={t.label} t={t} />)}
          </div>
          <div className="space-y-2.5">
            <p className="text-xs font-semibold uppercase tracking-[0.1em] text-ink-muted">Techniques</p>
            {techniques.map((t) => (
              <div key={t.key} className="rounded-lg bg-surface p-3 text-sm"><p className="font-medium">{t.name}</p><p className="mt-0.5 text-ink-muted">{t.how}</p></div>
            ))}
          </div>
        </div>
        <p className="mt-4 flex gap-2 rounded-lg border border-line px-3 py-2 text-sm text-ink-soft"><Sparkles className="mt-0.5 h-4 w-4 shrink-0 text-brand-700" aria-hidden />{tip}</p>
      </div>
    </li>
  );
}
