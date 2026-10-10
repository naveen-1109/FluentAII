import { CalendarCheck, LineChart, Lock, Mic, ShieldCheck, Stethoscope, Waves } from 'lucide-react';
import { Link } from 'react-router-dom';
import { useAuth } from '../lib/auth';
import { Disclaimer, Logo } from '../components/ui';

const steps = [
  { Icon: Mic, title: 'Record or upload', text: 'Speak for a minute or two in the browser, or upload a recording you already have.' },
  { Icon: Waves, title: 'We analyse it', text: 'Your speech is transcribed and measured for pace, pauses, repetitions and fillers.' },
  { Icon: LineChart, title: 'See your insights', text: 'Read clear results for each session and watch how they change over time.' },
];

export default function Landing() {
  const { user } = useAuth();
  const cta = user ? { to: '/app', label: 'Open your dashboard' } : { to: '/signup', label: 'Create an account' };
  return (
    <div className="bg-white">
      <header className="mx-auto flex max-w-6xl items-center justify-between px-5 py-5">
        <Logo />
        <nav className="flex items-center gap-2 text-[15px]" aria-label="Account">
          {!user && <Link to="/login" className="rounded-lg px-4 py-2 font-medium text-ink-soft hover:bg-surface-sunken">Sign in</Link>}
          <Link to={cta.to} className="rounded-lg bg-brand-700 px-4 py-2 font-medium text-white hover:bg-brand-800">{user ? 'Dashboard' : 'Get started'}</Link>
        </nav>
      </header>

      <section className="relative overflow-hidden">
        <div className="absolute inset-0 -z-10 bg-gradient-to-b from-brand-50 to-white" />
        <div className="mx-auto grid grid-cols-1 max-w-6xl gap-12 px-5 pb-20 pt-12 lg:grid-cols-[1.1fr_0.9fr] lg:items-center lg:pt-20">
          <div>
            <p className="inline-flex items-center gap-2 rounded-full border border-brand-200 bg-white px-3 py-1 text-[13px] font-medium text-brand-800">
              <ShieldCheck className="h-3.5 w-3.5" aria-hidden /> Built to support people who stutter
            </p>
            <h1 className="mt-5 text-4xl font-semibold leading-[1.1] sm:text-5xl">Understand your speech. Practise with confidence.</h1>
            <p className="mt-5 max-w-xl text-lg leading-relaxed text-ink-muted">
              Record yourself, get clear insights on pace, pauses and repetitions, and share your progress with a
              speech-language professional when you choose to.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Link to={cta.to} className="rounded-lg bg-brand-700 px-6 py-3 font-medium text-white shadow-card hover:bg-brand-800">{cta.label}</Link>
              {!user && <Link to="/login" className="rounded-lg border border-line-strong bg-white px-6 py-3 font-medium hover:bg-surface-sunken">I already have an account</Link>}
            </div>
            <p className="mt-5 max-w-lg text-sm text-ink-muted">Your recordings are private and you can delete them at any time.</p>
          </div>

          <div className="card p-6" aria-hidden>
            <div className="flex items-center justify-between">
              <p className="text-sm font-semibold">Example insight card</p>
              <span className="rounded-full bg-surface-sunken px-2.5 py-0.5 text-xs text-ink-muted">Illustration</span>
            </div>
            <div className="mt-5 flex items-center gap-6">
              <svg viewBox="0 0 140 140" className="h-28 w-28 shrink-0">
                <circle cx="70" cy="70" r="54" fill="none" stroke="#EBF1F5" strokeWidth="12" />
                <circle cx="70" cy="70" r="54" fill="none" stroke="#2E8B6B" strokeWidth="12" strokeLinecap="round" strokeDasharray="250 340" transform="rotate(-90 70 70)" />
                <text x="70" y="74" textAnchor="middle" fontSize="28" fontWeight="600" fill="#0F2A3D">74</text>
              </svg>
              <dl className="grid flex-1 grid-cols-2 gap-3 text-sm">
                {[['Pace', 'words / min'], ['Pauses', 'count'], ['Repeats', 'count'], ['Fillers', 'count']].map(([k, u]) => (
                  <div key={k} className="rounded-lg bg-surface px-3 py-2"><dt className="text-ink-muted">{k}</dt><dd className="text-xs text-ink-faint">{u}</dd></div>
                ))}
              </dl>
            </div>
            <div className="mt-5 h-8 rounded-lg bg-surface-sunken">
              <div className="flex h-full items-center gap-1 px-2">
                {[18, 30, 12, 8, 26, 22, 9, 28, 14, 20].map((w, i) => <i key={i} className={`h-4 rounded ${i % 4 === 3 ? 'bg-warn/30' : 'bg-brand-500/70'}`} style={{ width: `${w}%` }} />)}
              </div>
            </div>
            <p className="mt-3 text-xs text-ink-muted">Sample layout only. Your results come from your own recordings.</p>
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-5 py-16">
        <h2 className="text-2xl font-semibold">How it works</h2>
        <ol className="mt-8 grid grid-cols-1 gap-5 md:grid-cols-3">
          {steps.map(({ Icon, title, text }, i) => (
            <li key={title} className="card p-6">
              <div className="flex items-center gap-3">
                <span className="grid h-10 w-10 place-items-center rounded-lg bg-brand-50 text-brand-700"><Icon className="h-5 w-5" aria-hidden /></span>
                <span className="text-sm font-medium text-ink-muted">Step {i + 1}</span>
              </div>
              <h3 className="mt-4 text-lg font-semibold">{title}</h3>
              <p className="mt-1.5 text-[15px] leading-relaxed text-ink-muted">{text}</p>
            </li>
          ))}
        </ol>
      </section>

      <section className="bg-surface">
        <div className="mx-auto grid grid-cols-1 max-w-6xl gap-6 px-5 py-16 md:grid-cols-2">
          <div className="card p-7">
            <Stethoscope className="h-6 w-6 text-brand-700" aria-hidden />
            <h3 className="mt-4 text-xl font-semibold">Connect with a professional</h3>
            <p className="mt-2 leading-relaxed text-ink-muted">
              Request a consultation with a verified healthcare professional. Once they accept, you decide which
              sessions to share with them, and they can leave notes on the results.
            </p>
          </div>
          <div className="card p-7">
            <CalendarCheck className="h-6 w-6 text-brand-700" aria-hidden />
            <h3 className="mt-4 text-xl font-semibold">For clinicians</h3>
            <p className="mt-2 leading-relaxed text-ink-muted">
              See the practice sessions your patients choose to share, with transcripts, pauses and repetitions
              marked, so appointments can start from real examples.
            </p>
          </div>
          <div className="card p-7 md:col-span-2">
            <Lock className="h-6 w-6 text-brand-700" aria-hidden />
            <h3 className="mt-4 text-xl font-semibold">Privacy and what FluentAI is not</h3>
            <ul className="mt-3 grid gap-x-8 gap-y-2 text-[15px] leading-relaxed text-ink-muted md:grid-cols-2">
              <li>Recordings are private to you unless you share a session.</li>
              <li>You can delete a recording or your whole account at any time.</li>
              <li>The scores describe a recording. They are not a diagnosis.</li>
              <li>FluentAI does not replace speech therapy or medical care.</li>
            </ul>
          </div>
        </div>
      </section>

      <footer className="border-t border-line">
        <div className="mx-auto flex max-w-6xl flex-col gap-3 px-5 py-8 sm:flex-row sm:items-center sm:justify-between">
          <Logo />
          <Disclaimer className="max-w-xl" />
        </div>
      </footer>
    </div>
  );
}
