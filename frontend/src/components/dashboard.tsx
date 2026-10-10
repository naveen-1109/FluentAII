import { ArrowRight, Lightbulb } from 'lucide-react';
import { Link } from 'react-router-dom';
import type { CSSProperties, ReactNode } from 'react';
import type { SessionSummary } from '../lib/types';
import { ACTIVITY_LABEL } from '../lib/format';

const DAY = 86_400_000;
const dayKey = (d: Date) => `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;

export interface PracticeStats {
  analysed: number;
  minutes: number;
  avgFlow: number | null;
  bestFlow: number | null;
  avgPace: number | null;
  flowDelta: number | null; // last 3 analysed vs the 3 before
  streak: number; // consecutive days with a recording, ending today or yesterday
  thisWeek: number; // recordings in the last 7 days
  days: { date: Date; minutes: number; count: number }[]; // last 14 days, oldest first
  mix: { activity: string; count: number; avgFlow: number | null }[];
  flowSeries: number[]; // oldest → newest
  paceSeries: number[];
  minuteSeries: number[];
}

export function practiceStats(sessions: SessionSummary[], now = new Date()): PracticeStats {
  const done = sessions.filter((s) => s.status === 'completed').sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  const flows = done.map((s) => s.flowIndex).filter((v): v is number => v != null);
  const paces = done.map((s) => s.speechRateWpm).filter((v): v is number => v != null);
  const avg = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);
  const last3 = avg(flows.slice(-3));
  const prev3 = avg(flows.slice(-6, -3));

  const byDay = new Map<string, { minutes: number; count: number }>();
  for (const s of sessions) {
    const k = dayKey(new Date(s.createdAt));
    const v = byDay.get(k) ?? { minutes: 0, count: 0 };
    v.minutes += (s.durationSec ?? 0) / 60; v.count += 1;
    byDay.set(k, v);
  }
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const days = Array.from({ length: 14 }, (_, i) => {
    const date = new Date(today.getTime() - (13 - i) * DAY);
    return { date, ...(byDay.get(dayKey(date)) ?? { minutes: 0, count: 0 }) };
  });

  let streak = 0;
  let cursor = byDay.has(dayKey(today)) ? today : new Date(today.getTime() - DAY);
  while (byDay.has(dayKey(cursor))) { streak++; cursor = new Date(cursor.getTime() - DAY); }

  const mixMap = new Map<string, number>();
  const mixFlow = new Map<string, number[]>();
  sessions.forEach((s) => {
    mixMap.set(s.activity, (mixMap.get(s.activity) ?? 0) + 1);
    if (s.status === 'completed' && s.flowIndex != null) mixFlow.set(s.activity, [...(mixFlow.get(s.activity) ?? []), s.flowIndex]);
  });

  return {
    analysed: done.length,
    minutes: sessions.reduce((a, s) => a + (s.durationSec ?? 0), 0) / 60,
    avgFlow: avg(flows),
    bestFlow: flows.length ? Math.max(...flows) : null,
    avgPace: avg(paces),
    flowDelta: last3 != null && prev3 != null ? last3 - prev3 : null,
    streak,
    thisWeek: sessions.filter((s) => now.getTime() - new Date(s.createdAt).getTime() < 7 * DAY).length,
    days,
    mix: [...mixMap].map(([activity, count]) => ({ activity, count, avgFlow: avg(mixFlow.get(activity) ?? []) })).sort((a, b) => b.count - a.count),
    flowSeries: flows,
    paceSeries: paces,
    minuteSeries: done.map((s) => (s.durationSec ?? 0) / 60),
  };
}

export function Sparkline({ values, color = '#0F7880', className = '' }: { values: number[]; color?: string; className?: string }) {
  if (values.length < 2) return <div className={className} />;
  const W = 120, H = 36;
  const min = Math.min(...values), max = Math.max(...values);
  const x = (i: number) => (W * i) / (values.length - 1);
  const y = (v: number) => H - 3 - ((v - min) / (max - min || 1)) * (H - 6);
  const d = values.map((v, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(' ');
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className={className} preserveAspectRatio="none" aria-hidden>
      <path d={d} fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
    </svg>
  );
}

export function StatCard({ icon, label, value, unit, foot, spark, color, delay = 0 }: {
  icon: ReactNode; label: string; value: ReactNode; unit?: string; foot?: ReactNode; spark?: number[]; color: string; delay?: number;
}) {
  return (
    <div className="stat-card rise card relative overflow-hidden p-5" style={{ '--d': `${delay}ms` } as CSSProperties}>
      <div className="flex items-center gap-2.5">
        <span className="grid h-9 w-9 place-items-center rounded-xl" style={{ background: `${color}14`, color }}>{icon}</span>
        <p className="text-[13px] font-medium text-ink-muted">{label}</p>
      </div>
      <p className="mt-4 text-[30px] font-semibold leading-none tracking-tight">
        {value}{unit && <span className="ml-1 text-sm font-normal text-ink-muted">{unit}</span>}
      </p>
      <div className="mt-2 min-h-[18px] text-xs text-ink-muted">{foot}</div>
      {spark && <Sparkline values={spark} color={color} className="absolute right-4 top-5 h-9 w-20 opacity-90" />}
    </div>
  );
}

/** Minutes practised per day over the last 14 days. */
export function ActivityChart({ days }: { days: PracticeStats['days'] }) {
  const max = Math.max(1, ...days.map((d) => d.minutes));
  const total = days.reduce((a, d) => a + d.count, 0);
  const mins = days.reduce((a, d) => a + d.minutes, 0);
  const active = days.filter((d) => d.count).length;
  return (
    <figure aria-label={`${total} recordings in the last 14 days`}>
      <div className="mb-5 grid grid-cols-3 gap-2 text-center">
        {[[total, 'recordings'], [mins < 10 ? mins.toFixed(1) : Math.round(mins), 'minutes'], [active, 'active days']].map(([v, l]) => (
          <div key={l as string} className="rounded-xl bg-surface py-2.5"><p className="text-xl font-semibold leading-none">{v}</p><p className="mt-1 text-[11px] text-ink-muted">{l}</p></div>
        ))}
      </div>
      <div className="flex h-28 items-end gap-1.5">
        {days.map((d, i) => {
          const h = d.minutes ? Math.max(14, (d.minutes / max) * 100) : d.count ? 14 : 4;
          const isToday = i === days.length - 1;
          return (
            <div key={i} className="group relative flex h-full flex-1 flex-col justify-end">
              <div
                className={`col-grow w-full rounded-md ${d.count ? (isToday ? 'bg-lime-deep' : 'bg-brand-500') : 'bg-surface-sunken'}`}
                style={{ height: `${h}%`, '--d': `${i * 35}ms` } as CSSProperties}
                title={`${d.date.toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' })}: ${d.count} recording${d.count === 1 ? '' : 's'}, ${d.minutes.toFixed(1)} min`}
              />
            </div>
          );
        })}
      </div>
      <div className="mt-2 flex gap-1.5 text-[10px] text-ink-faint">
        {days.map((d, i) => (
          <span key={i} className="flex-1 text-center">{i % 2 === 1 || i === days.length - 1 ? d.date.toLocaleDateString(undefined, { weekday: 'narrow' }) : ''}</span>
        ))}
      </div>
    </figure>
  );
}

const MIX_COLORS = ['#0F7880', '#43AAB2', '#A9D400', '#A8650F'];
export function ActivityMix({ mix }: { mix: PracticeStats['mix'] }) {
  const total = mix.reduce((a, m) => a + m.count, 0) || 1;
  return (
    <div>
      <div className="flex h-2.5 overflow-hidden rounded-full bg-surface-sunken">
        {mix.map((m, i) => <div key={m.activity} style={{ width: `${(m.count / total) * 100}%`, background: MIX_COLORS[i % 4] }} />)}
      </div>
      <ul className="mt-4 space-y-2.5 text-sm">
        {mix.map((m, i) => (
          <li key={m.activity} className="flex items-center justify-between">
            <span className="flex items-center gap-2"><i className="h-2.5 w-2.5 rounded-full" style={{ background: MIX_COLORS[i % 4] }} />{ACTIVITY_LABEL[m.activity] ?? m.activity}</span>
            <span className="flex items-center gap-3 tabular-nums">
              {m.avgFlow != null && <span className="text-xs text-ink-muted">flow {Math.round(m.avgFlow)}</span>}
              <span className="min-w-[1.5rem] rounded-md bg-surface px-1.5 py-0.5 text-center text-xs font-semibold text-ink-soft">{m.count}</span>
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** Ring showing progress towards a weekly goal (on dark backgrounds). */
export function GoalRing({ value, goal }: { value: number; goal: number }) {
  const r = 30, c = 2 * Math.PI * r, pct = Math.min(1, value / goal);
  return (
    <svg viewBox="0 0 80 80" className="h-20 w-20" role="img" aria-label={`${value} of ${goal} sessions this week`}>
      <circle cx="40" cy="40" r={r} fill="none" stroke="rgba(255,255,255,.12)" strokeWidth="8" />
      <circle cx="40" cy="40" r={r} fill="none" stroke="#D4FF3A" strokeWidth="8" strokeLinecap="round" strokeDasharray={`${c * pct} ${c}`} transform="rotate(-90 40 40)" style={{ transition: 'stroke-dasharray .8s ease' }} />
      <text x="40" y="36" textAnchor="middle" dominantBaseline="central" fontSize="17" fontWeight="600" fill="#fff">{value}</text>
      <text x="40" y="55" textAnchor="middle" fontSize="8.5" fill="rgba(255,255,255,.55)">of {goal}</text>
    </svg>
  );
}

const TIPS = [
  { title: 'Try easy onsets', text: 'Start the first word of a phrase with a gentle, slightly breathy voice instead of a hard start.' },
  { title: 'Pause on purpose', text: 'Planned pauses between phrases give you time to breathe and can make speech feel calmer.' },
  { title: 'Read aloud for two minutes', text: 'Reading a familiar text is a low-pressure way to practise a steady pace.' },
  { title: 'Practise a real situation', text: 'Rehearse something you need to say this week, like ordering food or introducing yourself.' },
  { title: 'Notice, do not judge', text: 'Listen back to one recording and note one thing that went well before anything else.' },
  { title: 'Slow the first second', text: 'Stretching the first sound of a sentence slightly can make the rest flow more easily.' },
  { title: 'Breathe low', text: 'Before you speak, take a relaxed breath into your belly rather than your chest.' },
];

export function TipCard({ now = new Date() }: { now?: Date }) {
  const tip = TIPS[Math.floor(now.getTime() / DAY) % TIPS.length]!;
  return (
    <section className="card relative flex flex-col overflow-hidden p-6">
      <div className="relative flex flex-1 flex-col">
        <div className="flex items-center gap-2 text-[13px] font-semibold uppercase tracking-[0.12em] text-brand-700">
          <Lightbulb className="h-4 w-4" aria-hidden /> Practice idea
        </div>
        <h2 className="mt-3 text-lg font-semibold">{tip.title}</h2>
        <p className="mt-1.5 text-sm leading-relaxed text-ink-muted">{tip.text}</p>
        <p className="mt-3 text-xs text-ink-faint">General practice idea, not a treatment plan. Your speech-language pathologist can tailor techniques to you.</p>
        <div className="mt-auto pt-5">
          <Link to="/app/record" className="flex items-center justify-center gap-2 rounded-xl bg-ink px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-ink-soft">
            Try it in a recording <ArrowRight className="h-4 w-4" aria-hidden />
          </Link>
        </div>
      </div>
    </section>
  );
}
