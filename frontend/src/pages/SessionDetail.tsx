import { ArrowLeft, Info, Play, RefreshCw, Share2 } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ComponentBars, FlowRing, MetricTile, SpeechTimeline, TranscriptView } from '../components/insights';
import { Alert, Badge, Button, Checkbox, SectionTitle, Spinner, Textarea } from '../components/ui';
import { api, ApiError } from '../lib/api';
import { useAuth } from '../lib/auth';
import { ACTIVITY_LABEL, fmtDate, fmtDateTime, fmtDuration, fmtNum } from '../lib/format';
import { useAsync, usePolling } from '../lib/hooks';
import type { Indicators } from '../lib/types';
import { StatusBadge } from './Sessions';

export default function SessionDetail() {
  const { id = '' } = useParams();
  const { user } = useAuth();
  const { data, error, loading, reload } = useAsync(() => api.sessions.get(id), [id]);
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  const status = data?.session.status;
  usePolling(status === 'processing', () => void reload(true), 2000);

  if (loading) return <Spinner />;
  if (error || !data) {
    return (
      <>
        <Link to="/app" className="mb-4 inline-flex items-center gap-1.5 text-sm font-medium text-brand-700"><ArrowLeft className="h-4 w-4" aria-hidden /> Back</Link>
        <Alert tone="danger">{error ?? 'Session not found.'}</Alert>
      </>
    );
  }

  const { session: s, notes, access } = data;
  const owner = access === 'owner';
  const ind = s.indicators;

  async function analyse() {
    setBusy(true);
    setActionError(null);
    try {
      await api.sessions.transcribe(id);
      await reload(true);
    } catch (e) {
      setActionError(e instanceof ApiError ? e.message : 'Could not start the analysis.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <Link to={owner ? '/app/sessions' : '/app/patients'} className="mb-4 inline-flex items-center gap-1.5 text-sm font-medium text-brand-700 hover:underline">
        <ArrowLeft className="h-4 w-4" aria-hidden /> {owner ? 'My sessions' : 'Patients'}
      </Link>
      <div className="mb-6 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">{s.title}</h1>
          <p className="mt-1 text-sm text-ink-muted">
            {ACTIVITY_LABEL[s.activity]} · {fmtDateTime(s.createdAt)} · {fmtDuration(s.durationSec)}
            {s.language ? ` · ${s.language.toUpperCase()}` : ''}
          </p>
        </div>
        <StatusBadge s={s.status} />
      </div>

      <div className="card mb-6 p-5">
        <p className="mb-2 flex items-center gap-2 text-sm font-medium text-ink-soft"><Play className="h-4 w-4" aria-hidden /> Recording</p>
        <audio controls preload="metadata" src={api.sessions.audioUrl(s.id)} className="w-full" />
      </div>

      {actionError && <Alert tone="danger" className="mb-4">{actionError}</Alert>}

      {s.status === 'uploaded' && (
        <div className="card mb-6 flex flex-wrap items-center justify-between gap-4 p-6">
          <div>
            <h2 className="font-semibold">Ready to analyse</h2>
            <p className="mt-1 text-sm text-ink-muted">Analysis transcribes the recording and measures pace, pauses and repetitions. It usually takes about as long as the recording.</p>
          </div>
          {owner && <Button onClick={analyse} loading={busy}>Analyse this recording</Button>}
        </div>
      )}

      {s.status === 'processing' && (
        <div className="card mb-6 p-6" role="status" aria-live="polite">
          <Spinner label="Analysing your recording. This page updates automatically." />
        </div>
      )}

      {s.status === 'failed' && (
        <Alert tone="danger" title="This recording could not be analysed" className="mb-6">
          <p>{s.error ?? 'An unknown error occurred.'}</p>
          {owner && <Button className="mt-3" size="sm" variant="secondary" onClick={analyse} loading={busy}><RefreshCw className="h-3.5 w-3.5" aria-hidden /> Try again</Button>}
        </Alert>
      )}

      {s.status === 'completed' && ind && (
        <>
          {s.model?.name === 'demo' && (
            <Alert tone="info" title="Demo data" className="mb-6">This session was created by the demo seed script with made-up timings. It is not a real analysis.</Alert>
          )}
          {s.model?.stub && (
            <Alert tone="warn" title="Test mode" className="mb-6">The speech service is running in test mode, so no speech was recognised. These numbers are not real insights.</Alert>
          )}
          {ind.word_count === 0 && !s.model?.stub && (
            <Alert tone="warn" title="No speech was detected" className="mb-6">Try again in a quieter place, closer to the microphone, and speak for at least 30 seconds.</Alert>
          )}

          <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
            <section className="card p-6" aria-labelledby="flow">
              <SectionTitle><span id="flow">Flow index</span></SectionTitle>
              <div className="flex justify-center py-2"><FlowRing value={ind.flow_index} /></div>
              {Object.keys(ind.flow_components).length > 0 && <div className="mt-5"><ComponentBars comps={ind.flow_components} /></div>}
              <p className="mt-5 text-xs leading-relaxed text-ink-muted">A practice indicator for this recording. Higher means fewer repeats, fillers and long pauses. It is not a clinical measure.</p>
            </section>

            <section className="lg:col-span-2" aria-labelledby="metrics">
              <h2 id="metrics" className="sr-only">Measurements</h2>
              <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
                <MetricTile label="Pace (speaking)" value={fmtNum(ind.speech_rate_wpm_active)} unit="words/min" hint="Words per minute while speaking, pauses excluded." />
                <MetricTile label="Pace (overall)" value={fmtNum(ind.speech_rate_wpm_total)} unit="words/min" hint="Words divided by the whole recording length." />
                <MetricTile label="Words" value={ind.word_count} />
                <MetricTile label="Pauses" value={ind.pause_count} hint={ind.pause_count ? `Longest ${fmtNum(ind.longest_pause_sec, 1)}s · total ${fmtNum(ind.total_pause_sec, 1)}s` : `None of ${ind.pause_threshold_sec}s or more`} />
                <MetricTile label="Repetitions" value={ind.repetition_count} tone={ind.repetition_count ? 'warn' : undefined} hint={topItems(ind.repeated_items)} />
                <MetricTile label="Fillers" value={ind.filler_count} hint={topItems(ind.filler_items)} />
              </div>
              {s.segments && s.durationSec ? (
                <div className="card mt-6 p-5">
                  <SectionTitle>Speech and pauses</SectionTitle>
                  <SpeechTimeline segments={s.segments} duration={s.durationSec} threshold={ind.pause_threshold_sec} />
                </div>
              ) : null}
            </section>
          </div>

          {s.segments && s.transcript && (
            <section className="card mt-6 p-6" aria-labelledby="tr">
              <SectionTitle><span id="tr">Transcript</span></SectionTitle>
              <TranscriptView segments={s.segments} threshold={ind.pause_threshold_sec} />
              <Alert tone="info" className="mt-5">
                Speech recognition sometimes leaves out repeated words and fillers, so the repetition and filler counts may be lower than what was actually said.
              </Alert>
            </section>
          )}

          <Definitions ind={ind} model={s.model} />
        </>
      )}

      <section className="card mt-6 p-6" aria-labelledby="notes">
        <SectionTitle><span id="notes">Clinician notes</span></SectionTitle>
        {notes.length ? (
          <ul className="space-y-4">
            {notes.map((n) => (
              <li key={n.id} className="rounded-lg bg-surface px-4 py-3">
                <p className="text-sm font-semibold">{n.clinicianName} <span className="ml-2 text-xs font-normal text-ink-muted">{fmtDate(n.createdAt)}</span></p>
                <p className="mt-1 whitespace-pre-wrap text-[15px] text-ink-soft">{n.body}</p>
              </li>
            ))}
          </ul>
        ) : <p className="text-sm text-ink-muted">{owner ? 'No notes yet. Notes appear here when a clinician you have shared this session with replies.' : 'No notes yet.'}</p>}
        {!owner && user?.role === 'clinician' && <NoteComposer sessionId={s.id} onSaved={() => reload(true)} />}
      </section>

      {owner && <SharePanel sessionId={s.id} current={data.shares?.map((x) => x.clinicianId) ?? []} onSaved={() => reload(true)} />}
    </>
  );
}

const topItems = (items: { text: string; count: number }[]) =>
  items.length ? items.slice(0, 3).map((i) => `“${i.text}” ×${i.count}`).join(', ') : undefined;

function Definitions({ ind, model }: { ind: Indicators; model: { name: string; device: string; compute_type: string; processing_ms?: number } | null }) {
  return (
    <details className="card mt-6 p-6 [&_summary::-webkit-details-marker]:hidden">
      <summary className="flex cursor-pointer items-center gap-2 font-semibold"><Info className="h-4 w-4 text-brand-700" aria-hidden /> How these numbers are calculated</summary>
      <dl className="mt-4 space-y-3 text-sm leading-relaxed text-ink-soft">
        <div><dt className="font-medium text-ink">Pace</dt><dd>Words in the transcript divided by time. “Speaking” excludes pauses of {ind.pause_threshold_sec}s or more; “overall” uses the full recording.</dd></div>
        <div><dt className="font-medium text-ink">Pauses</dt><dd>Gaps of {ind.pause_threshold_sec}s or more between consecutive words. Silence before the first and after the last word is not counted.</dd></div>
        <div><dt className="font-medium text-ink">Repetitions</dt><dd>Immediate word repeats (“I I”), repeated two-word phrases (“I want I want”) and sound repeats written with hyphens (“b-b-ball”).</dd></div>
        <div><dt className="font-medium text-ink">Fillers</dt><dd>Words such as “um” and “uh” that appear in the transcript.</dd></div>
        <div><dt className="font-medium text-ink">Flow index</dt><dd>The average of three smoothness scores (repetitions, fillers, pauses). Each starts at 100 and falls to 0 as that share of the speech rises to 10%, 10% and 30% respectively. Shown only when there are at least 5 words.</dd></div>
      </dl>
      {model && <p className="mt-4 text-xs text-ink-muted">Recognition model: {model.name} ({model.device}, {model.compute_type}){model.processing_ms ? ` · processed in ${(model.processing_ms / 1000).toFixed(1)}s` : ''}</p>}
    </details>
  );
}

function NoteComposer({ sessionId, onSaved }: { sessionId: string; onSaved: () => void }) {
  const [body, setBody] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  async function save() {
    setBusy(true); setErr(null);
    try { await api.sessions.addNote(sessionId, body); setBody(''); onSaved(); }
    catch (e) { setErr(e instanceof ApiError ? e.message : 'Could not save the note.'); }
    finally { setBusy(false); }
  }
  return (
    <div className="mt-5 space-y-3 border-t border-line pt-5">
      <Textarea label="Add a note for the patient" value={body} maxLength={2000} onChange={(e) => setBody(e.target.value)} />
      {err && <Alert tone="danger">{err}</Alert>}
      <Button onClick={save} loading={busy} disabled={!body.trim()}>Save note</Button>
    </div>
  );
}

function SharePanel({ sessionId, current, onSaved }: { sessionId: string; current: string[]; onSaved: () => void }) {
  const appts = useAsync(() => api.care.appointments());
  const [sel, setSel] = useState<string[]>(current);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ tone: 'ok' | 'danger'; text: string } | null>(null);
  useEffect(() => setSel(current), [current.join(',')]); // eslint-disable-line react-hooks/exhaustive-deps

  const clinicians = new Map<string, string>();
  for (const a of appts.data?.appointments ?? []) {
    if (a.status === 'accepted' || a.status === 'completed') clinicians.set(a.clinicianId, a.otherName);
  }
  const dirty = sel.slice().sort().join() !== current.slice().sort().join();

  async function save() {
    setBusy(true); setMsg(null);
    try { await api.sessions.setShares(sessionId, sel); setMsg({ tone: 'ok', text: 'Sharing updated.' }); onSaved(); }
    catch (e) { setMsg({ tone: 'danger', text: e instanceof ApiError ? e.message : 'Could not update sharing.' }); }
    finally { setBusy(false); }
  }

  return (
    <section className="card mt-6 p-6" aria-labelledby="share">
      <SectionTitle aside={<Badge tone={current.length ? 'info' : 'muted'}>{current.length ? `Shared with ${current.length}` : 'Private'}</Badge>}>
        <span id="share" className="inline-flex items-center gap-2"><Share2 className="h-4 w-4" aria-hidden /> Share with a clinician</span>
      </SectionTitle>
      <p className="mb-4 text-sm text-ink-muted">This session is private unless you share it. You can stop sharing at any time. Clinicians can see the recording, transcript and results.</p>
      {appts.loading ? <Spinner /> : clinicians.size === 0 ? (
        <p className="text-sm text-ink-muted">You can share with a clinician after they accept a consultation request. <Link to="/app/clinicians" className="font-medium text-brand-700 hover:underline">Find a clinician</Link></p>
      ) : (
        <div className="space-y-3">
          {[...clinicians].map(([cid, name]) => (
            <Checkbox key={cid} checked={sel.includes(cid)} onChange={(e) => setSel(e.target.checked ? [...sel, cid] : sel.filter((x) => x !== cid))}>{name}</Checkbox>
          ))}
          <Button onClick={save} loading={busy} disabled={!dirty}>Save sharing</Button>
        </div>
      )}
      {msg && <Alert tone={msg.tone} className="mt-4">{msg.text}</Alert>}
    </section>
  );
}
