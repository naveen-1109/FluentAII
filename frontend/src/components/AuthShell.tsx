import { ShieldCheck, Waves, Stethoscope } from 'lucide-react';
import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { Logo } from './ui';

export function AuthShell({ title, subtitle, children, footer }: { title: string; subtitle?: string; children: ReactNode; footer?: ReactNode }) {
  return (
    <div className="min-h-screen lg:grid lg:grid-cols-[minmax(0,5fr)_minmax(0,6fr)]">
      <aside className="relative hidden overflow-hidden bg-gradient-to-br from-brand-800 via-brand-700 to-brand-600 p-12 text-white lg:flex lg:flex-col lg:justify-between">
        <svg className="pointer-events-none absolute -bottom-10 left-0 w-full opacity-[0.12]" viewBox="0 0 600 160" fill="none" aria-hidden>
          <path d="M0 80h60l20-50 30 100 30-130 30 110 25-60h60l20-40 30 80 30-110 30 90 20-40h215" stroke="#fff" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
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
        </div>
        <p className="relative text-xs text-brand-100">Practice insights only — not a diagnosis or treatment.</p>
      </aside>
      <main className="flex flex-col justify-center px-5 py-10 sm:px-10">
        <div className="mx-auto w-full max-w-md">
          <Link to="/" className="mb-8 inline-block lg:hidden"><Logo /></Link>
          <h1 className="text-[28px] font-semibold">{title}</h1>
          {subtitle && <p className="mt-2 text-[15px] text-ink-muted">{subtitle}</p>}
          <div className="mt-8">{children}</div>
          {footer && <div className="mt-6 text-sm text-ink-muted">{footer}</div>}
        </div>
      </main>
    </div>
  );
}
