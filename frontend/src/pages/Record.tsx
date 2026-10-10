import { FileAudio, Mic, Route, Upload } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { Recorder, type Recording } from '../components/Recorder';
import { Alert, Button, Input, PageHeader, Select } from '../components/ui';
import { api, ApiError } from '../lib/api';
import { useFeatures } from '../lib/features';
import { ACTIVITY_LABEL, fmtDuration } from '../lib/format';
import type { Activity } from '../lib/types';

const MAX_MB = 25;

/** Shown when the user starts a session from their roadmap. Same wording as the server's technique list. */
const TECHNIQUES: Record<string, { name: string; how: string }> = {
  breath: { name: 'Relaxed breathing', how: 'Breathe in low and slow through your nose, then start speaking gently as you breathe out.' },
  easyOnset: { name: 'Easy onsets', how: 'Start the first sound of a phrase softly, with a little air flowing first, instead of a hard start.' },
  lightContact: { name: 'Light contacts', how: 'Touch your lips and tongue together lightly on sounds like p, b, t, d, k and g, as if they were feathers.' },
  pullOut: { name: 'Smooth pull-outs', how: 'If you feel stuck on a sound, slow it down and stretch it gently into the rest of the word instead of pushing.' },
  pauseNotFill: { name: 'Pause instead of filling', how: 'When you need a moment, close your mouth and pause silently. A short pause sounds calm; "um" is not needed.' },
  phrasing: { name: 'Planned phrasing', how: 'Speak in short phrases of 4 to 6 words with a relaxed breath and a brief pause between them.' },
  stretch: { name: 'Gentle stretching', how: 'Stretch the first vowel of a phrase slightly and keep your voice moving through the words.' },
  rate: { name: 'Steady pace', how: 'Slow down a little and give each word its full length. Aim for an easy, even rhythm.' },
  carry: { name: 'Real-life practice', how: 'Use your techniques in a situation you meet this week: a phone call, ordering food or introducing yourself.' },
};
const ACCEPT = 'audio/webm,audio/ogg,audio/wav,audio/x-wav,audio/mpeg,audio/mp4,audio/x-m4a,audio/aac,.webm,.ogg,.wav,.mp3,.m4a,.aac';

const PROMPTS: Record<Activity, string> = {
  free_speech: 'Talk about your day, a place you like, or a story from your week.',
  reading: 'Read a short paragraph from a book, article or news page out loud, at a comfortable pace.',
  breathing_exercise: 'Take a slow breath in, then speak a sentence on the out-breath. Repeat a few times.',
  conversation_practice: 'Imagine a phone call, such as ordering food or booking an appointment, and say both parts.',
};

export default function Record() {
  const nav = useNavigate();
  const { features: f } = useFeatures();
  const [picked, setTab] = useState<'record' | 'upload'>('record');
  const tab = !f.recording ? 'upload' : !f.upload ? 'record' : picked;
  const [title, setTitle] = useState('');
  const [params] = useSearchParams();
  const techKey = params.get('technique') ?? '';
  const [fromRoadmap, setFromRoadmap] = useState(TECHNIQUES[techKey]);
  // Use the wording the admin set for this technique, if it was edited.
  useEffect(() => {
    if (!TECHNIQUES[techKey] || !f.roadmap) return;
    api.roadmap.get().then(({ roadmap }) => {
      const t = roadmap.phases.flatMap((p) => p.exercises).find((e) => e.technique.key === techKey)?.technique;
      if (t) setFromRoadmap({ name: t.name, how: t.how });
    }).catch(() => undefined);
  }, [techKey, f.roadmap]);
  const [activity, setActivity] = useState<Activity>(
    (Object.keys(ACTIVITY_LABEL) as Activity[]).includes(params.get('activity') as Activity) ? (params.get('activity') as Activity) : 'free_speech',
  );
  const [rec, setRec] = useState<Recording | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState<null | 'save' | 'analyse'>(null);
  const [error, setError] = useState<string | null>(null);
  const input = useRef<HTMLInputElement>(null);

  const blob = tab === 'record' ? rec?.blob : file;
  const name = tab === 'record' && rec ? `recording.${rec.ext}` : file?.name ?? 'upload';

  async function save(analyse: boolean) {
    if (!blob) return;
    setBusy(analyse ? 'analyse' : 'save');
    setError(null);
    try {
      const { session } = await api.sessions.upload(
        blob, title.trim() || `${ACTIVITY_LABEL[activity]} · ${new Date().toLocaleDateString()}`, activity, name,
        tab === 'record' ? 'recording' : 'upload',
      );
      if (analyse && f.analysis) await api.sessions.transcribe(session.id); // explicit user action
      nav(`/app/sessions/${session.id}`);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Could not save the recording. Please try again.');
      setBusy(null);
    }
  }

  function pick(f: File | undefined) {
    setError(null);
    if (!f) return;
    if (f.size > MAX_MB * 1024 * 1024) return setError(`That file is larger than ${MAX_MB} MB.`);
    setFile(f);
  }

  const Tab = ({ id, children }: { id: 'record' | 'upload'; children: React.ReactNode }) => (
    <button role="tab" aria-selected={tab === id} onClick={() => setTab(id)}
      className={`inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium transition ${tab === id ? 'bg-brand-700 text-white' : 'text-ink-soft hover:bg-surface-sunken'}`}>
      {children}
    </button>
  );

  return (
    <>
      <PageHeader title="New recording" subtitle="Record in your browser or upload a file. Nothing is analysed until you choose to." />
      {!f.recording && !f.upload ? (
        <Alert tone="info" title="New recordings are not available right now">Recording and uploading have been turned off for your account. Your existing sessions are still available under My sessions.</Alert>
      ) : (
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1fr_340px]">
        <div className="space-y-5">
          {f.recording && f.upload && (
            <div role="tablist" aria-label="Input method" className="inline-flex gap-1 rounded-xl border border-line bg-white p-1">
              <Tab id="record"><Mic className="h-4 w-4" aria-hidden /> Record</Tab>
              <Tab id="upload"><Upload className="h-4 w-4" aria-hidden /> Upload</Tab>
            </div>
          )}

          {tab === 'record' ? (
            <Recorder onRecorded={setRec} onReset={() => setRec(null)} />
          ) : (
            <div className="card p-6">
              <button type="button" onClick={() => input.current?.click()}
                onDragOver={(e) => e.preventDefault()}
                onDrop={(e) => { e.preventDefault(); pick(e.dataTransfer.files[0]); }}
                className="flex w-full flex-col items-center gap-3 rounded-xl border-2 border-dashed border-line-strong px-6 py-12 text-center transition hover:border-brand-400 hover:bg-brand-50/40">
                <FileAudio className="h-8 w-8 text-brand-700" aria-hidden />
                <span className="text-[15px] font-medium">{file ? file.name : 'Choose an audio file or drop it here'}</span>
                <span className="text-sm text-ink-muted">{file ? `${(file.size / 1048576).toFixed(1)} MB` : `WAV, MP3, M4A, OGG or WebM · up to ${MAX_MB} MB`}</span>
              </button>
              <input ref={input} type="file" accept={ACCEPT} className="sr-only" onChange={(e) => pick(e.target.files?.[0])} aria-label="Audio file" />
            </div>
          )}

          {error && <Alert tone="danger">{error}</Alert>}

          <div className="card space-y-4 p-6">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Input label="Title (optional)" value={title} maxLength={120} onChange={(e) => setTitle(e.target.value)} placeholder="Morning practice" />
              <Select label="Activity" value={activity} onChange={(e) => setActivity(e.target.value as Activity)}>
                {Object.entries(ACTIVITY_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </Select>
            </div>
            <div className="flex flex-wrap items-center gap-3">
              {f.analysis && <Button onClick={() => save(true)} loading={busy === 'analyse'} disabled={!blob || !!busy}>Save and analyse</Button>}
              <Button variant={f.analysis ? 'secondary' : 'primary'} onClick={() => save(false)} loading={busy === 'save'} disabled={!blob || !!busy}>Save only</Button>
              {tab === 'record' && rec && <span className="text-sm text-ink-muted">Length: {fmtDuration(rec.seconds)}</span>}
            </div>
          </div>
        </div>

        <aside className="h-fit space-y-4">
          {fromRoadmap && (
            <div className="card border-brand-200 bg-brand-50/60 p-6">
              <p className="flex items-center gap-2 text-[13px] font-semibold uppercase tracking-[0.12em] text-brand-700"><Route className="h-4 w-4" aria-hidden /> From your roadmap</p>
              <h2 className="mt-2 text-base font-semibold">Technique: {fromRoadmap.name}</h2>
              <p className="mt-1.5 text-[15px] leading-relaxed text-ink-soft">{fromRoadmap.how}</p>
              <Link to="/app/roadmap" className="mt-3 inline-block text-sm font-medium text-brand-700 hover:underline">Back to my roadmap</Link>
            </div>
          )}
          <div className="card p-6">
          <h2 className="text-base font-semibold">Suggestion</h2>
          <p className="mt-2 text-[15px] leading-relaxed text-ink-soft">{PROMPTS[activity]}</p>
          <h3 className="mt-6 text-sm font-semibold">For clearer results</h3>
          <ul className="mt-2 list-disc space-y-1.5 pl-5 text-sm text-ink-muted">
            <li>Find a quiet place and hold the device at arm’s length.</li>
            <li>Speak for at least 30 seconds.</li>
            <li>Speak naturally. Please do not try to hide how you usually speak.</li>
          </ul>
          </div>
        </aside>
      </div>
      )}
    </>
  );
}
