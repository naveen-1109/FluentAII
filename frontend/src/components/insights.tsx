import type { ReactNode } from 'react';
import type { Indicators, Segment, SessionSummary, Word } from '../lib/types';
import { flowBand } from '../lib/format';

const TONE_STROKE = { ok: '#2E8B6B', info: '#2B6CB0', warn: '#A8650F', muted: '#C3D2DC' } as const;

/** Circular gauge for the flow index (0–100). */
export function FlowRing({ value, size = 148 }: { value: number | null; size?: number }) {
  const band = flowBand(value);
  const r = 54;
  const c = 2 * Math.PI * r;
  const pct = value == null ? 0 : Math.max(0, Math.min(100, value)) / 100;
  return (
    <figure className="flex flex-col items-center" aria-label={value == null ? 'Flow index not available' : `Flow index ${value} out of 100, ${band.label}`}>
      <svg width={size} height={size} viewBox="0 0 140 140" role="img" aria-hidden>
        <circle cx="70" cy="70" r={r} fill="none" stroke="#EBF1F5" strokeWidth="12" />
        <circle
          cx="70" cy="70" r={r} fill="none" stroke={TONE_STROKE[band.tone]} strokeWidth="12" strokeLinecap="round"
          strokeDasharray={`${c * pct} ${c}`} transform="rotate(-90 70 70)"
          style={{ transition: 'stroke-dasharray 600ms ease' }}
        />
        <text x="70" y="70" textAnchor="middle" fontSize="30" fontWeight="600" fill="#0F2A3D" dominantBaseline="central">
          {value == null ? '—' : Math.round(value)}
        </text>
        <text x="70" y="96" textAnchor="middle" fontSize="10" fill="#5B7083">out of 100</text>
      </svg>
      <figcaption className="mt-1 text-sm font-medium text-ink-soft">{band.label}</figcaption>
    </figure>
  );
}

export function MetricTile({ label, value, unit, hint, tone }: { label: string; value: ReactNode; unit?: string; hint?: string; tone?: 'warn' | 'ok' }) {
  return (
    <div className="rounded-xl border border-line bg-white p-4">
      <p className="text-[13px] font-medium text-ink-muted">{label}</p>
      <p className={`mt-1 text-[26px] font-semibold leading-none ${tone === 'warn' ? 'text-warn' : tone === 'ok' ? 'text-ok' : ''}`}>
        {value}
        {unit && <span className="ml-1 text-sm font-normal text-ink-muted">{unit}</span>}
      </p>
      {hint && <p className="mt-2 text-xs leading-snug text-ink-muted">{hint}</p>}
    </div>
  );
}

/** Line chart over sessions (oldest → newest). */
export function TrendChart({
  points, unit = '', min = 0, max = 100, title,
}: { points: { label: string; value: number }[]; unit?: string; min?: number; max?: number; title: string }) {
  const W = 560, H = 190, P = { l: 36, r: 14, t: 14, b: 28 };
  if (points.length < 2) {
    return <p className="rounded-lg bg-surface-sunken px-4 py-6 text-center text-sm text-ink-muted">Record at least two analysed sessions to see a trend.</p>;
  }
  const iw = W - P.l - P.r, ih = H - P.t - P.b;
  const x = (i: number) => P.l + (iw * i) / (points.length - 1);
  const y = (v: number) => P.t + ih - (ih * (Math.max(min, Math.min(max, v)) - min)) / (max - min || 1);
  const d = points.map((p, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(p.value).toFixed(1)}`).join(' ');
  const ticks = [min, (min + max) / 2, max];
  return (
    <figure>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label={title}>
        {ticks.map((t) => (
          <g key={t}>
            <line x1={P.l} x2={W - P.r} y1={y(t)} y2={y(t)} stroke="#E4ECF1" />
            <text x={P.l - 8} y={y(t)} textAnchor="end" dominantBaseline="central" fontSize="10" fill="#8499AA">{Math.round(t)}</text>
          </g>
        ))}
        <path d={d} fill="none" stroke="#0F7880" strokeWidth="2.5" strokeLinejoin="round" strokeLinecap="round" />
        {points.map((p, i) => (
          <g key={i}>
            <circle cx={x(i)} cy={y(p.value)} r="4" fill="#fff" stroke="#0F7880" strokeWidth="2">
              <title>{`${p.label}: ${p.value}${unit}`}</title>
            </circle>
            {(i === 0 || i === points.length - 1 || points.length <= 6) && (
              <text x={x(i)} y={H - 8} textAnchor={i === 0 ? 'start' : i === points.length - 1 ? 'end' : 'middle'} fontSize="10" fill="#8499AA">{p.label}</text>
            )}
          </g>
        ))}
      </svg>
    </figure>
  );
}

export function trendPoints(sessions: SessionSummary[], pick: (s: SessionSummary) => number | null) {
  return sessions
    .filter((s) => s.status === 'completed' && pick(s) != null)
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt))
    .map((s) => ({
      label: new Date(s.createdAt).toLocaleDateString(undefined, { day: 'numeric', month: 'short' }),
      value: Math.round((pick(s) as number) * 10) / 10,
    }));
}

/** Speech vs. pauses across the recording, drawn from word timestamps. */
export function SpeechTimeline({ segments, duration, threshold }: { segments: Segment[]; duration: number; threshold: number }) {
  const words: Word[] = segments.flatMap((s) => s.words);
  if (!words.length || duration <= 0) return null;
  const pct = (t: number) => `${Math.max(0, Math.min(100, (t / duration) * 100))}%`;
  const spans: { start: number; end: number }[] = [];
  const pauses: { start: number; end: number }[] = [];
  let cur = { start: words[0]!.start, end: words[0]!.end };
  for (const w of words.slice(1)) {
    if (w.start - cur.end >= threshold) {
      spans.push(cur);
      pauses.push({ start: cur.end, end: w.start });
      cur = { start: w.start, end: w.end };
    } else cur.end = w.end;
  }
  spans.push(cur);
  return (
    <div>
      <div className="relative h-9 overflow-hidden rounded-lg bg-surface-sunken" role="img"
        aria-label={`Timeline: ${spans.length} stretches of speech separated by ${pauses.length} pauses of ${threshold} seconds or more`}>
        {spans.map((s, i) => (
          <div key={`s${i}`} className="absolute top-1.5 bottom-1.5 rounded bg-brand-500/80" style={{ left: pct(s.start), width: `max(2px, calc(${pct(s.end)} - ${pct(s.start)}))` }} />
        ))}
        {pauses.map((p, i) => (
          <div key={`p${i}`} className="absolute top-0 bottom-0 bg-warn/25" title={`Pause ${(p.end - p.start).toFixed(1)}s`}
            style={{ left: pct(p.start), width: `calc(${pct(p.end)} - ${pct(p.start)})` }} />
        ))}
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-x-5 gap-y-1 text-xs text-ink-muted">
        <span className="inline-flex items-center gap-1.5"><i className="h-2.5 w-2.5 rounded-sm bg-brand-500/80" /> Speech</span>
        <span className="inline-flex items-center gap-1.5"><i className="h-2.5 w-2.5 rounded-sm bg-warn/40" /> Pause ≥ {threshold}s</span>
        <span className="ml-auto">0s – {Math.round(duration)}s</span>
      </div>
    </div>
  );
}

const FILLERS = new Set(['um', 'umm', 'uh', 'uhh', 'uhm', 'er', 'erm', 'ah', 'hmm', 'mm', 'mmm', 'eh']);
const norm = (t: string) => t.toLowerCase().replace(/[^\w\-']+/g, '').replace(/^[-']+|[-']+$/g, '');

/** Transcript with repeated words, sound repeats, fillers and long pauses marked. */
export function TranscriptView({ segments, threshold }: { segments: Segment[]; threshold: number }) {
  const words = segments.flatMap((s) => s.words);
  if (!words.length) return null;
  const nodes: ReactNode[] = [];
  words.forEach((w, i) => {
    const t = norm(w.word);
    const prev = i ? norm(words[i - 1]!.word) : '';
    const gap = i ? w.start - words[i - 1]!.end : 0;
    const parts = t.split('-').filter(Boolean);
    const soundRepeat = parts.length >= 2 && parts[0]!.length <= 3 && parts[parts.length - 1]!.startsWith(parts[0]!) && parts[0] === parts[1];
    if (gap >= threshold) {
      nodes.push(
        <span key={`g${i}`} className="mx-1 inline-block rounded bg-warn-soft px-1.5 text-[11px] font-medium text-warn align-middle" title={`Pause of ${gap.toFixed(1)} seconds`}>
          {gap.toFixed(1)}s
        </span>,
      );
    }
    let cls = '';
    let tip: string | undefined;
    if (FILLERS.has(t)) { cls = 'bg-info-soft text-info'; tip = 'Filler'; }
    else if (t && t === prev) { cls = 'bg-warn-soft text-warn underline decoration-warn/50'; tip = 'Repeated word'; }
    else if (soundRepeat) { cls = 'bg-warn-soft text-warn underline decoration-warn/50'; tip = 'Sound repetition'; }
    nodes.push(
      <span key={`w${i}`} title={tip} className={cls ? `rounded px-0.5 ${cls}` : undefined}>{w.word}</span>,
      ' ',
    );
  });
  return (
    <div>
      <p className="text-[17px] leading-9 text-ink">{nodes}</p>
      <div className="mt-3 flex flex-wrap gap-x-5 gap-y-1 text-xs text-ink-muted">
        <span><i className="mr-1.5 inline-block h-2.5 w-2.5 rounded-sm bg-warn-soft ring-1 ring-warn/40" />Repeat</span>
        <span><i className="mr-1.5 inline-block h-2.5 w-2.5 rounded-sm bg-info-soft ring-1 ring-info/40" />Filler</span>
        <span><i className="mr-1.5 inline-block h-2.5 w-2.5 rounded-sm bg-warn-soft ring-1 ring-warn/40" />Pause (seconds)</span>
      </div>
    </div>
  );
}

export function ComponentBars({ comps }: { comps: Indicators['flow_components'] }) {
  const rows: [string, string][] = [['repetition', 'Repetitions'], ['filler', 'Fillers'], ['pause', 'Pauses']];
  return (
    <ul className="space-y-3">
      {rows.map(([k, label]) => {
        const v = comps[k];
        if (v == null) return null;
        return (
          <li key={k}>
            <div className="mb-1 flex justify-between text-[13px]"><span className="text-ink-soft">{label}</span><span className="tabular-nums text-ink-muted">{Math.round(v * 100)}</span></div>
            <div className="h-2 overflow-hidden rounded-full bg-surface-sunken" role="meter" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(v * 100)} aria-label={`${label} smoothness`}>
              <div className="h-full rounded-full bg-brand-500" style={{ width: `${v * 100}%` }} />
            </div>
          </li>
        );
      })}
    </ul>
  );
}
