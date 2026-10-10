import { FileAudio, Mic, Upload } from 'lucide-react';
import { useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Recorder, type Recording } from '../components/Recorder';
import { Alert, Button, Input, PageHeader, Select } from '../components/ui';
import { api, ApiError } from '../lib/api';
import { ACTIVITY_LABEL, fmtDuration } from '../lib/format';
import type { Activity } from '../lib/types';

const MAX_MB = 25;
const ACCEPT = 'audio/webm,audio/ogg,audio/wav,audio/x-wav,audio/mpeg,audio/mp4,audio/x-m4a,audio/aac,.webm,.ogg,.wav,.mp3,.m4a,.aac';

const PROMPTS: Record<Activity, string> = {
  free_speech: 'Talk about your day, a place you like, or a story from your week.',
  reading: 'Read a short paragraph from a book, article or news page out loud, at a comfortable pace.',
  breathing_exercise: 'Take a slow breath in, then speak a sentence on the out-breath. Repeat a few times.',
  conversation_practice: 'Imagine a phone call, such as ordering food or booking an appointment, and say both parts.',
};

export default function Record() {
  const nav = useNavigate();
  const [tab, setTab] = useState<'record' | 'upload'>('record');
  const [title, setTitle] = useState('');
  const [activity, setActivity] = useState<Activity>('free_speech');
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
      );
      if (analyse) await api.sessions.transcribe(session.id); // explicit user action
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
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1fr_340px]">
        <div className="space-y-5">
          <div role="tablist" aria-label="Input method" className="inline-flex gap-1 rounded-xl border border-line bg-white p-1">
            <Tab id="record"><Mic className="h-4 w-4" aria-hidden /> Record</Tab>
            <Tab id="upload"><Upload className="h-4 w-4" aria-hidden /> Upload</Tab>
          </div>

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
              <Button onClick={() => save(true)} loading={busy === 'analyse'} disabled={!blob || !!busy}>Save and analyse</Button>
              <Button variant="secondary" onClick={() => save(false)} loading={busy === 'save'} disabled={!blob || !!busy}>Save only</Button>
              {tab === 'record' && rec && <span className="text-sm text-ink-muted">Length: {fmtDuration(rec.seconds)}</span>}
            </div>
          </div>
        </div>

        <aside className="card h-fit p-6">
          <h2 className="text-base font-semibold">Suggestion</h2>
          <p className="mt-2 text-[15px] leading-relaxed text-ink-soft">{PROMPTS[activity]}</p>
          <h3 className="mt-6 text-sm font-semibold">For clearer results</h3>
          <ul className="mt-2 list-disc space-y-1.5 pl-5 text-sm text-ink-muted">
            <li>Find a quiet place and hold the device at arm’s length.</li>
            <li>Speak for at least 30 seconds.</li>
            <li>Speak naturally. Please do not try to hide how you usually speak.</li>
          </ul>
        </aside>
      </div>
    </>
  );
}
