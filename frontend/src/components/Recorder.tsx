import { Mic, Square, RotateCcw } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Alert, Button } from './ui';

const MAX_SECONDS = 300;

function pickMime(): string | undefined {
  const options = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4', 'audio/ogg;codecs=opus'];
  return options.find((m) => typeof MediaRecorder !== 'undefined' && MediaRecorder.isTypeSupported(m));
}

export interface Recording { blob: Blob; mime: string; ext: string; seconds: number; url: string }

export function Recorder({ onRecorded, onReset }: { onRecorded: (r: Recording) => void; onReset: () => void }) {
  const [state, setState] = useState<'idle' | 'recording' | 'done'>('idle');
  const [seconds, setSeconds] = useState(0);
  const [level, setLevel] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [url, setUrl] = useState<string | null>(null);
  const rec = useRef<MediaRecorder | null>(null);
  const chunks = useRef<Blob[]>([]);
  const stream = useRef<MediaStream | null>(null);
  const raf = useRef(0);
  const timer = useRef<number>(0);
  const ctx = useRef<AudioContext | null>(null);
  const startedAt = useRef(0);

  const cleanup = useCallback(() => {
    cancelAnimationFrame(raf.current);
    window.clearInterval(timer.current);
    stream.current?.getTracks().forEach((t) => t.stop());
    stream.current = null;
    void ctx.current?.close().catch(() => undefined);
    ctx.current = null;
  }, []);
  useEffect(() => () => { cleanup(); }, [cleanup]);
  useEffect(() => () => { if (url) URL.revokeObjectURL(url); }, [url]);

  const supported = typeof navigator !== 'undefined' && !!navigator.mediaDevices?.getUserMedia && typeof MediaRecorder !== 'undefined';

  const stop = useCallback(() => { if (rec.current?.state === 'recording') rec.current.stop(); }, []);

  async function start() {
    setError(null);
    try {
      const s = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: false, autoGainControl: true },
      });
      stream.current = s;
      const mime = pickMime();
      const mr = new MediaRecorder(s, mime ? { mimeType: mime } : undefined);
      rec.current = mr;
      chunks.current = [];
      mr.ondataavailable = (e) => { if (e.data.size) chunks.current.push(e.data); };
      mr.onstop = () => {
        const type = mr.mimeType || mime || 'audio/webm';
        const blob = new Blob(chunks.current, { type });
        const secs = (performance.now() - startedAt.current) / 1000;
        const u = URL.createObjectURL(blob);
        setUrl(u);
        setState('done');
        cleanup();
        const base = type.split(';')[0] ?? 'audio/webm';
        onRecorded({ blob, mime: base, ext: base.includes('mp4') ? 'm4a' : base.includes('ogg') ? 'ogg' : 'webm', seconds: secs, url: u });
      };

      // live input level
      const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      const ac = new AC();
      ctx.current = ac;
      const an = ac.createAnalyser();
      an.fftSize = 512;
      ac.createMediaStreamSource(s).connect(an);
      const buf = new Uint8Array(an.fftSize);
      const tick = () => {
        an.getByteTimeDomainData(buf);
        let peak = 0;
        for (const v of buf) peak = Math.max(peak, Math.abs(v - 128));
        setLevel(Math.min(1, peak / 90));
        raf.current = requestAnimationFrame(tick);
      };
      tick();

      startedAt.current = performance.now();
      setSeconds(0);
      timer.current = window.setInterval(() => {
        const t = Math.floor((performance.now() - startedAt.current) / 1000);
        setSeconds(t);
        if (t >= MAX_SECONDS) stop();
      }, 250);
      mr.start(1000);
      setState('recording');
    } catch (e) {
      cleanup();
      const name = (e as DOMException).name;
      setError(
        name === 'NotAllowedError' ? 'Microphone access was blocked. Allow it in your browser’s site settings and try again.'
        : name === 'NotFoundError' ? 'No microphone was found. Connect one and try again.'
        : 'Could not start recording. Please try again.',
      );
    }
  }

  function reset() {
    if (url) URL.revokeObjectURL(url);
    setUrl(null);
    setState('idle');
    setSeconds(0);
    onReset();
  }

  if (!supported) {
    return <Alert tone="warn" title="Recording isn’t supported in this browser">Use the upload option instead, or switch to a recent version of Chrome, Edge, Firefox or Safari.</Alert>;
  }

  const mm = String(Math.floor(seconds / 60)).padStart(2, '0');
  const ss = String(seconds % 60).padStart(2, '0');
  return (
    <div className="rounded-xl2 border border-line bg-white p-6">
      <div className="flex flex-col items-center gap-5 text-center">
        <div className="relative grid h-28 w-28 place-items-center">
          <span className="absolute inset-0 rounded-full bg-brand-100 transition-transform duration-100" style={{ transform: `scale(${state === 'recording' ? 1 + level * 0.35 : 1})`, opacity: state === 'recording' ? 0.9 : 0.5 }} />
          <span className="relative grid h-20 w-20 place-items-center rounded-full bg-brand-700 text-white shadow-pop">
            {state === 'recording' ? <Square className="h-7 w-7 fill-current" aria-hidden /> : <Mic className="h-8 w-8" aria-hidden />}
          </span>
        </div>
        <p className="font-mono text-3xl tabular-nums" aria-live="off">{mm}:{ss}</p>
        <p className="text-sm text-ink-muted" aria-live="polite">
          {state === 'idle' && 'Press record, then speak naturally. Up to 5 minutes.'}
          {state === 'recording' && 'Recording… press stop when you are done.'}
          {state === 'done' && 'Recording ready. Listen back below, or record again.'}
        </p>
        {state === 'idle' && <Button size="lg" onClick={start}><Mic className="h-4 w-4" aria-hidden /> Start recording</Button>}
        {state === 'recording' && <Button size="lg" variant="danger" onClick={stop}><Square className="h-4 w-4 fill-current" aria-hidden /> Stop</Button>}
        {state === 'done' && url && (
          <div className="w-full max-w-md space-y-3">
            <audio controls src={url} className="w-full" />
            <Button variant="secondary" onClick={reset}><RotateCcw className="h-4 w-4" aria-hidden /> Record again</Button>
          </div>
        )}
        {error && <Alert tone="danger" className="w-full text-left">{error}</Alert>}
      </div>
    </div>
  );
}
