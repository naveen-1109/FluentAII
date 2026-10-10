import { ArrowLeft, ArrowRight, ShieldCheck, Waves, Stethoscope } from 'lucide-react';
import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { Link, Outlet, useLocation } from 'react-router-dom';
import { Logo } from './ui';

const PULSE = 'M0 80h60l20-50 30 100 30-130 30 110 25-60h60l20-40 30 80 30-110 30 90 20-40h215';

/** The teal "about FluentAI" panel. `cta` adds a switch button (used by the sliding sign-in/sign-up frame). */
function InfoPanel({ cta }: { cta?: ReactNode }) {
  return (
    <>
      <svg className="pointer-events-none absolute -bottom-10 left-0 w-full" viewBox="0 0 600 160" fill="none" aria-hidden>
        <path d={PULSE} stroke="#fff" strokeOpacity=".12" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
        <path d={PULSE} pathLength={1000} className="ecg-trace" stroke="#fff" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
      <Link to="/" className="relative inline-flex items-center gap-2.5 text-white">
        <svg viewBox="0 0 32 32" className="h-8 w-8" aria-hidden><rect width="32" height="32" rx="8" fill="#fff" fillOpacity=".16" /><path d="M6 17h3l2-6 3 12 3-16 3 12 2-6h4" fill="none" stroke="#fff" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" /></svg>
        <span className="text-[19px] font-semibold tracking-tight">FluentAI</span>
      </Link>
      <div className="relative max-w-md">
        <h2 className="text-3xl font-semibold leading-tight">Practise at your own pace. Share progress with someone who can help.</h2>
        <ul className="mt-8 space-y-4 text-[15px] text-brand-50">
          <li className="flex gap-3"><Waves className="mt-0.5 h-5 w-5 shrink-0" aria-hidden />See speech rate, pauses and repetitions from every recording.</li>
          <li className="flex gap-3"><Stethoscope className="mt-0.5 h-5 w-5 shrink-0" aria-hidden />Book a consultation and share only the sessions you choose.</li>
          <li className="flex gap-3"><ShieldCheck className="mt-0.5 h-5 w-5 shrink-0" aria-hidden />Your recordings stay private and you can delete them at any time.</li>
        </ul>
        {cta}
      </div>
      <p className="relative z-10 text-xs text-brand-100 [text-shadow:0_0_8px_#0B5A62,0_0_14px_#0B5A62]">Practice insights only — not a diagnosis or treatment.</p>
    </>
  );
}

const PANEL = 'bg-gradient-to-br from-brand-800 via-brand-700 to-brand-600 p-12 text-white';

/** Set by AuthFrame so the pages inside it render only their form. */
const InFrame = createContext(false);

/**
 * Shared frame for /login and /signup. It stays mounted while you switch between them, so the
 * teal panel can slide across: left of the form on "Sign in", right of the form on "Create account".
 */
export function AuthFrame() {
  const { pathname } = useLocation();
  const signup = pathname.startsWith('/signup');
  // Start off-screen to the left, then slide into place on the first frame.
  const [entered, setEntered] = useState(false);
  useEffect(() => {
    const id = requestAnimationFrame(() => requestAnimationFrame(() => setEntered(true)));
    return () => cancelAnimationFrame(id);
  }, []);

  const panelLeft = !entered ? '-45%' : signup ? '55%' : '0%';
  const cta = signup ? (
    <div className="mt-10">
      <p className="text-sm text-brand-100">Already have an account?</p>
      <Link to="/login" className="mt-3 inline-flex items-center gap-2 rounded-full border border-white/40 px-6 py-2.5 text-sm font-semibold text-white transition hover:bg-white hover:text-brand-800">
        <ArrowLeft className="h-4 w-4" aria-hidden /> Sign in
      </Link>
    </div>
  ) : (
    <div className="mt-10">
      <p className="text-sm text-brand-100">New to FluentAI?</p>
      <Link to="/signup" className="mt-3 inline-flex items-center gap-2 rounded-full border border-white/40 px-6 py-2.5 text-sm font-semibold text-white transition hover:bg-white hover:text-brand-800">
        Create an account <ArrowRight className="h-4 w-4" aria-hidden />
      </Link>
    </div>
  );

  return (
    <InFrame.Provider value>
      <div className="relative min-h-screen overflow-hidden">
        {/* form side: sits opposite the panel */}
        <main
          className="auth-form-side flex min-h-screen flex-col justify-center px-5 py-10 sm:px-10"
          style={{ ['--form-left' as string]: signup ? '0%' : '45%' }}
        >
          <div key={pathname} className="auth-form-in mx-auto w-full max-w-md">
            <Link to="/" className="mb-8 inline-block lg:hidden"><Logo /></Link>
            <Outlet />
          </div>
        </main>

        {/* sliding panel (large screens only) */}
        <aside
          className={`auth-panel absolute inset-y-0 z-20 hidden w-[45%] overflow-hidden lg:flex lg:flex-col lg:justify-between ${PANEL}`}
          style={{ left: panelLeft }}
        >
          <InfoPanel cta={cta} />
        </aside>
      </div>
    </InFrame.Provider>
  );
}

export function AuthShell({ title, subtitle, children, footer }: { title: string; subtitle?: string; children: ReactNode; footer?: ReactNode }) {
  const inFrame = useContext(InFrame);
  const body = (
    <>
      <h1 className="text-[28px] font-semibold">{title}</h1>
      {subtitle && <p className="mt-2 text-[15px] text-ink-muted">{subtitle}</p>}
      <div className="mt-8">{children}</div>
      {footer && <div className="mt-6 text-sm text-ink-muted">{footer}</div>}
    </>
  );
  if (inFrame) return body;

  return (
    <div className="min-h-screen lg:grid lg:grid-cols-[minmax(0,5fr)_minmax(0,6fr)]">
      <aside className={`relative hidden overflow-hidden lg:flex lg:flex-col lg:justify-between ${PANEL}`}>
        <InfoPanel />
      </aside>
      <main className="flex flex-col justify-center px-5 py-10 sm:px-10">
        <div className="mx-auto w-full max-w-md">
          <Link to="/" className="mb-8 inline-block lg:hidden"><Logo /></Link>
          {body}
        </div>
      </main>
    </div>
  );
}
