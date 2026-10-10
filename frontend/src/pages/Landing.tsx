import { ArrowRight, AudioLines, CalendarCheck, LineChart, Lock, Mic, ShieldCheck, Sparkles, Stethoscope, Trash2, Waves } from 'lucide-react';
import type { CSSProperties } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../lib/auth';
import { Logo } from '../components/ui';
import { Reveal, TiltCard } from '../components/Hero3D';
import { VoiceOrb } from '../components/VoiceOrb';

const steps = [
  { Icon: Mic, title: 'Record or upload', text: 'Speak for a minute or two in the browser, or upload a recording you already have.' },
  { Icon: Waves, title: 'We analyse it', text: 'Your speech is transcribed and measured for pace, pauses, repetitions and fillers.' },
  { Icon: LineChart, title: 'See your insights', text: 'Read clear results for each session and watch how they change over time.' },
];

const marquee = ['Pace', 'Pauses', 'Repetitions', 'Fillers', 'Flow index', 'Progress over time', 'Private by default', 'Share with your clinician'];

const transcript: { w: string; k?: 'rep' | 'fill' | 'pause' }[] = [
  { w: 'Today' }, { w: 'I' }, { w: 'want' }, { w: 'to' }, { w: 'to', k: 'rep' }, { w: 'talk' }, { w: 'about' }, { w: 'um', k: 'fill' },
  { w: 'my' }, { w: 'new' }, { w: 'job' }, { w: '0.8s', k: 'pause' }, { w: 'and' }, { w: 'the' }, { w: 'people' }, { w: 'I' }, { w: 'work' }, { w: 'with' },
];

export default function Landing() {
  const { user } = useAuth();
  const cta = user ? { to: '/app', label: 'Open your dashboard' } : { to: '/signup', label: 'Create an account' };
  return (
    <div className="landing-dark min-h-screen overflow-x-hidden bg-night text-white">
      {/* nav */}
      <header className="sticky top-0 z-30 border-b border-night-line bg-night/70 backdrop-blur-xl">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-5 py-4">
          <Link to="/" aria-label="FluentAI home"><Logo dark /></Link>
          <nav className="hidden items-center gap-1 text-[14px] text-white/60 md:flex" aria-label="Sections">
            <a href="#how" className="rounded-full px-3.5 py-2 hover:bg-white/5 hover:text-white">How it works</a>
            <a href="#features" className="rounded-full px-3.5 py-2 hover:bg-white/5 hover:text-white">Features</a>
            <a href="#privacy" className="rounded-full px-3.5 py-2 hover:bg-white/5 hover:text-white">Privacy</a>
          </nav>
          <nav className="flex items-center gap-2 text-[14px]" aria-label="Account">
            {!user && <Link to="/login" className="rounded-full px-4 py-2 font-medium text-white/80 hover:bg-white/5 hover:text-white">Sign in</Link>}
            <Link to={cta.to} className="btn-lime rounded-full px-4 py-2 font-semibold">{user ? 'Dashboard' : 'Get started'}</Link>
          </nav>
        </div>
      </header>

      {/* hero */}
      <section className="relative isolate">
        <div className="hero-bg" aria-hidden />
        <div className="mx-auto grid max-w-7xl grid-cols-1 items-center gap-6 px-5 pb-16 pt-14 lg:grid-cols-[1.05fr_1fr] lg:pb-24 lg:pt-20">
          <div className="relative z-10">
            <p className="fade-up inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-1.5 text-[13px] font-medium text-white/80 backdrop-blur" style={{ '--d': '0ms' } as CSSProperties}>
              <span className="relative flex h-2 w-2"><span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-lime opacity-60" /><span className="relative inline-flex h-2 w-2 rounded-full bg-lime" /></span>
              Built to support people who stutter
            </p>
            <h1 className="fade-up mt-6 text-[44px] font-semibold leading-[1.02] tracking-[-0.035em] sm:text-6xl lg:text-[76px]" style={{ '--d': '80ms' } as CSSProperties}>
              Understand your speech.{' '}
              <span className="text-gradient">Practise with confidence.</span>
            </h1>
            <p className="fade-up mt-6 max-w-xl text-lg leading-relaxed text-white/60" style={{ '--d': '160ms' } as CSSProperties}>
              Record yourself, get clear insights on pace, pauses and repetitions, and share your progress with a
              speech-language professional when you choose to.
            </p>
            <div className="fade-up mt-9 flex flex-wrap gap-3" style={{ '--d': '240ms' } as CSSProperties}>
              <Link to={cta.to} className="btn-lime group inline-flex items-center gap-2 rounded-full px-7 py-3.5 text-[15px] font-semibold">
                {cta.label} <ArrowRight className="h-4 w-4 transition group-hover:translate-x-0.5" aria-hidden />
              </Link>
              {!user && (
                <Link to="/login" className="rounded-full border border-white/15 bg-white/5 px-7 py-3.5 text-[15px] font-medium text-white backdrop-blur hover:bg-white/10">
                  I already have an account
                </Link>
              )}
            </div>
            <ul className="fade-up mt-9 flex flex-wrap gap-x-6 gap-y-2 text-sm text-white/50" style={{ '--d': '320ms' } as CSSProperties}>
              <li className="flex items-center gap-2"><Lock className="h-4 w-4 text-brand-300" aria-hidden /> Recordings are private</li>
              <li className="flex items-center gap-2"><Trash2 className="h-4 w-4 text-brand-300" aria-hidden /> Delete them any time</li>
              <li className="flex items-center gap-2"><ShieldCheck className="h-4 w-4 text-brand-300" aria-hidden /> Verified clinicians</li>
            </ul>
          </div>

          {/* 3D orb */}
          <div className="relative mx-auto aspect-square w-full max-w-[600px]" aria-hidden>
            <VoiceOrb className="absolute inset-0 h-full w-full" />
            <div className="glass-chip float-a left-[2%] top-[18%]"><span className="chip-dot bg-lime" />Pace <b>128</b> wpm</div>
            <div className="glass-chip float-b right-[0%] top-[34%]"><span className="chip-dot bg-brand-300" />Pauses <b>3</b></div>
            <div className="glass-chip float-c bottom-[16%] left-[10%]"><span className="chip-dot bg-[#F5B451]" />Repeats <b>2</b></div>
            <div className="glass-card float-b bottom-[6%] right-[4%] w-44">
              <p className="text-[11px] uppercase tracking-[0.14em] text-white/50">Flow index</p>
              <p className="mt-1 text-3xl font-semibold">74<span className="ml-1 text-sm font-normal text-white/40">/100</span></p>
              <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-white/10"><div className="bar-fill h-full rounded-full bg-gradient-to-r from-brand-400 to-lime" style={{ width: '74%' }} /></div>
            </div>
          </div>
        </div>

        {/* marquee */}
        <div className="relative border-y border-night-line bg-night-2/60 py-4" aria-hidden>
          <div className="marquee flex w-max gap-10 whitespace-nowrap text-[15px] font-medium text-white/45">
            {[...marquee, ...marquee].map((m, i) => (
              <span key={i} className="flex items-center gap-10">{m}<Sparkles className="h-3.5 w-3.5 text-lime/70" /></span>
            ))}
          </div>
        </div>
      </section>

      {/* how it works */}
      <section id="how" className="mx-auto max-w-7xl scroll-mt-20 px-5 py-24">
        <p className="eyebrow">How it works</p>
        <h2 className="mt-3 max-w-2xl text-4xl font-semibold tracking-[-0.03em] sm:text-5xl">Three steps from voice to insight.</h2>
        <ol className="mt-12 grid grid-cols-1 gap-5 md:grid-cols-3">
          {steps.map(({ Icon, title, text }, i) => (
            <Reveal as="li" key={title} delay={i * 120}>
              <TiltCard className="glow-card h-full p-7">
                <div className="flex items-center justify-between">
                  <span className="tilt-pop grid h-12 w-12 place-items-center rounded-2xl bg-gradient-to-br from-brand-500/30 to-lime/10 text-lime ring-1 ring-white/10"><Icon className="h-5 w-5" aria-hidden /></span>
                  <span className="text-5xl font-semibold tracking-tight text-white/[0.07]">0{i + 1}</span>
                </div>
                <h3 className="mt-8 text-xl font-semibold">{title}</h3>
                <p className="mt-2 text-[15px] leading-relaxed text-white/55">{text}</p>
              </TiltCard>
            </Reveal>
          ))}
        </ol>
      </section>

      {/* bento */}
      <section id="features" className="mx-auto max-w-7xl scroll-mt-20 px-5 pb-24">
        <p className="eyebrow">Features</p>
        <h2 className="mt-3 max-w-2xl text-4xl font-semibold tracking-[-0.03em] sm:text-5xl">Built around your practice.</h2>
        <div className="mt-12 grid grid-cols-1 gap-5 lg:grid-cols-3">
          <Reveal className="lg:col-span-2">
            <div className="glow-card h-full overflow-hidden p-7">
              <div className="flex items-center gap-3"><AudioLines className="h-5 w-5 text-lime" aria-hidden /><h3 className="text-xl font-semibold">Insights for every recording</h3></div>
              <p className="mt-2 max-w-lg text-[15px] text-white/55">Repeats, fillers and long pauses are marked right in your transcript, next to pace and your flow index.</p>
              <div className="mt-7 rounded-2xl border border-white/10 bg-black/30 p-5" aria-hidden>
                <div className="flex h-16 items-center gap-[3px]">
                  {Array.from({ length: 64 }, (_, i) => (
                    <span key={i} className="eq-bar flex-1 rounded-full" style={{ '--i': i, height: `${20 + ((i * 53) % 80)}%`, background: i > 22 && i < 27 ? '#F5B45180' : undefined } as CSSProperties} />
                  ))}
                </div>
                <p className="mt-5 flex flex-wrap gap-x-1.5 gap-y-2 text-[17px] leading-relaxed text-white/80">
                  {transcript.map((t, i) => (
                    <span key={i} className={t.k === 'rep' ? 'mark-rep' : t.k === 'fill' ? 'mark-fill' : t.k === 'pause' ? 'mark-pause' : ''}>{t.w}</span>
                  ))}
                </p>
                <div className="mt-4 flex flex-wrap gap-4 text-xs text-white/45">
                  <span className="flex items-center gap-1.5"><i className="h-2 w-2 rounded-full bg-[#F5B451]" />Repeat</span>
                  <span className="flex items-center gap-1.5"><i className="h-2 w-2 rounded-full bg-[#B79CFF]" />Filler</span>
                  <span className="flex items-center gap-1.5"><i className="h-2 w-2 rounded-full bg-brand-300" />Pause</span>
                </div>
              </div>
            </div>
          </Reveal>
          <Reveal delay={120}>
            <div className="glow-card flex h-full flex-col p-7">
              <LineChart className="h-5 w-5 text-lime" aria-hidden />
              <h3 className="mt-4 text-xl font-semibold">Watch your progress</h3>
              <p className="mt-2 text-[15px] text-white/55">Compare each session with your own earlier ones.</p>
              <svg viewBox="0 0 300 140" className="mt-auto w-full pt-6" aria-hidden>
                <defs>
                  <linearGradient id="lg-area" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stopColor="#D4FF3A" stopOpacity=".35" /><stop offset="1" stopColor="#D4FF3A" stopOpacity="0" /></linearGradient>
                  <linearGradient id="lg-line" x1="0" x2="1"><stop offset="0" stopColor="#43AAB2" /><stop offset="1" stopColor="#D4FF3A" /></linearGradient>
                </defs>
                <path d="M0,110 C40,100 60,118 95,92 C130,66 150,84 185,60 C220,36 250,48 300,22 L300,140 L0,140 Z" fill="url(#lg-area)" />
                <path className="draw-line" d="M0,110 C40,100 60,118 95,92 C130,66 150,84 185,60 C220,36 250,48 300,22" fill="none" stroke="url(#lg-line)" strokeWidth="3" strokeLinecap="round" />
                <circle cx="300" cy="22" r="5" fill="#D4FF3A" className="pulse-dot" />
              </svg>
            </div>
          </Reveal>
          <Reveal>
            <div className="glow-card h-full p-7">
              <Stethoscope className="h-5 w-5 text-lime" aria-hidden />
              <h3 className="mt-4 text-xl font-semibold">Connect with a professional</h3>
              <p className="mt-2 text-[15px] leading-relaxed text-white/55">
                Request a consultation with a verified healthcare professional. Once they accept, you decide which
                sessions to share with them, and they can leave notes on the results.
              </p>
            </div>
          </Reveal>
          <Reveal delay={120}>
            <div className="glow-card h-full p-7">
              <CalendarCheck className="h-5 w-5 text-lime" aria-hidden />
              <h3 className="mt-4 text-xl font-semibold">For clinicians</h3>
              <p className="mt-2 text-[15px] leading-relaxed text-white/55">
                See the practice sessions your patients choose to share, with transcripts, pauses and repetitions
                marked, so appointments can start from real examples.
              </p>
            </div>
          </Reveal>
          <Reveal delay={240}>
            <div id="privacy" className="glow-card h-full scroll-mt-20 p-7">
              <Lock className="h-5 w-5 text-lime" aria-hidden />
              <h3 className="mt-4 text-xl font-semibold">Privacy and what FluentAI is not</h3>
              <ul className="mt-3 space-y-2 text-[15px] leading-relaxed text-white/55">
                <li>Recordings are private to you unless you share a session.</li>
                <li>You can delete a recording or your whole account at any time.</li>
                <li>The scores describe a recording. They are not a diagnosis.</li>
                <li>FluentAI does not replace speech therapy or medical care.</li>
              </ul>
            </div>
          </Reveal>
        </div>
      </section>

      {/* final CTA */}
      <section className="relative mx-5 mb-20 overflow-hidden rounded-[28px] border border-white/10 lg:mx-auto lg:max-w-7xl">
        <div className="cta-bg" aria-hidden />
        <div className="relative px-6 py-16 text-center sm:py-20">
          <h2 className="mx-auto max-w-3xl text-4xl font-semibold tracking-[-0.03em] sm:text-6xl">Your voice, one session at a time.</h2>
          <p className="mx-auto mt-5 max-w-xl text-lg text-white/60">Make your first recording in under two minutes.</p>
          <Link to={cta.to} className="btn-lime mt-9 inline-flex items-center gap-2 rounded-full px-8 py-4 text-base font-semibold">
            {cta.label} <ArrowRight className="h-4 w-4" aria-hidden />
          </Link>
        </div>
      </section>

      <footer className="border-t border-night-line">
        <div className="mx-auto flex max-w-7xl flex-col gap-4 px-5 py-10 sm:flex-row sm:items-center sm:justify-between">
          <Logo dark />
          <p className="max-w-xl text-xs leading-relaxed text-white/40">
            FluentAI gives practice insights from your recordings. It does not diagnose or treat stuttering and is not a
            substitute for care from a qualified speech-language pathologist.
          </p>
        </div>
      </footer>
    </div>
  );
}
