const dateFmt = new Intl.DateTimeFormat(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
const dateTimeFmt = new Intl.DateTimeFormat(undefined, {
  weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit',
});

export const fmtDate = (iso: string) => dateFmt.format(new Date(iso));
export const fmtDateTime = (iso: string) => dateTimeFmt.format(new Date(iso));

export function fmtDuration(sec: number | null | undefined): string {
  if (sec == null) return '—';
  const s = Math.round(sec);
  const m = Math.floor(s / 60);
  return m > 0 ? `${m}m ${String(s % 60).padStart(2, '0')}s` : `${s}s`;
}

export const fmtNum = (n: number | null | undefined, digits = 0) =>
  n == null ? '—' : n.toFixed(digits);

export const ACTIVITY_LABEL: Record<string, string> = {
  free_speech: 'Free speech',
  reading: 'Reading aloud',
  breathing_exercise: 'Breathing exercise',
  conversation_practice: 'Conversation practice',
};

export const MODE_LABEL: Record<string, string> = {
  video: 'Video call',
  phone: 'Phone call',
  in_person: 'In person',
  message: 'Secure message',
};

/** Qualitative band for the flow index. Descriptive only, not clinical. */
export function flowBand(v: number | null): { label: string; tone: 'ok' | 'info' | 'warn' | 'muted' } {
  if (v == null) return { label: 'Not enough speech to score', tone: 'muted' };
  if (v >= 85) return { label: 'Smooth', tone: 'ok' };
  if (v >= 65) return { label: 'Mostly smooth', tone: 'info' };
  return { label: 'More effortful', tone: 'warn' };
}
