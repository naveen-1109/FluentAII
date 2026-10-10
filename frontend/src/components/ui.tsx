import { AlertTriangle, CheckCircle2, Info, Loader2, XCircle } from 'lucide-react';
import type { ButtonHTMLAttributes, InputHTMLAttributes, ReactNode, SelectHTMLAttributes, TextareaHTMLAttributes } from 'react';
import { forwardRef, useId } from 'react';

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger';
const VARIANT: Record<Variant, string> = {
  primary: 'bg-brand-700 text-white hover:bg-brand-800 disabled:bg-brand-300',
  secondary: 'bg-white text-ink border border-line-strong hover:bg-surface-sunken disabled:text-ink-faint',
  ghost: 'text-brand-700 hover:bg-brand-50 disabled:text-ink-faint',
  danger: 'bg-danger text-white hover:bg-[#9c2f25] disabled:opacity-50',
};

export function Button({
  variant = 'primary', loading, className = '', children, disabled, size = 'md', ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; loading?: boolean; size?: 'sm' | 'md' | 'lg' }) {
  const pad = size === 'sm' ? 'px-3 py-1.5 text-sm' : size === 'lg' ? 'px-6 py-3 text-base' : 'px-4 py-2.5 text-[15px]';
  return (
    <button
      {...rest}
      disabled={disabled || loading}
      className={`inline-flex items-center justify-center gap-2 rounded-lg font-medium transition disabled:cursor-not-allowed ${pad} ${VARIANT[variant]} ${className}`}
    >
      {loading && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />}
      {children}
    </button>
  );
}

interface FieldProps { label: string; help?: string; error?: string | undefined }

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement> & FieldProps>(
  function Input({ label, help, error, className = '', ...rest }, ref) {
    const id = useId();
    return (
      <div>
        <label htmlFor={id} className="label">{label}</label>
        <input id={id} ref={ref} aria-invalid={!!error} aria-describedby={error || help ? `${id}-d` : undefined}
          className={`input ${error ? 'border-danger' : ''} ${className}`} {...rest} />
        {(error || help) && <p id={`${id}-d`} className={error ? 'mt-1.5 text-[13px] text-danger' : 'help'}>{error ?? help}</p>}
      </div>
    );
  },
);

export function Select({ label, help, error, children, ...rest }: SelectHTMLAttributes<HTMLSelectElement> & FieldProps) {
  const id = useId();
  return (
    <div>
      <label htmlFor={id} className="label">{label}</label>
      <select id={id} className="input" aria-invalid={!!error} {...rest}>{children}</select>
      {(error || help) && <p className={error ? 'mt-1.5 text-[13px] text-danger' : 'help'}>{error ?? help}</p>}
    </div>
  );
}

export function Textarea({ label, help, error, ...rest }: TextareaHTMLAttributes<HTMLTextAreaElement> & FieldProps) {
  const id = useId();
  return (
    <div>
      <label htmlFor={id} className="label">{label}</label>
      <textarea id={id} rows={3} className="input resize-y" aria-invalid={!!error} {...rest} />
      {(error || help) && <p className={error ? 'mt-1.5 text-[13px] text-danger' : 'help'}>{error ?? help}</p>}
    </div>
  );
}

export function Checkbox({ children, error, ...rest }: InputHTMLAttributes<HTMLInputElement> & { children: ReactNode; error?: string | undefined }) {
  const id = useId();
  return (
    <div>
      <div className="flex items-start gap-3">
        <input id={id} type="checkbox" className="mt-1 h-4 w-4 rounded border-line-strong accent-brand-700 focus:ring-brand-300" {...rest} />
        <label htmlFor={id} className="text-sm leading-relaxed text-ink-soft">{children}</label>
      </div>
      {error && <p className="mt-1 pl-7 text-[13px] text-danger">{error}</p>}
    </div>
  );
}

type Tone = 'ok' | 'info' | 'warn' | 'danger' | 'muted';
const TONE: Record<Tone, string> = {
  ok: 'bg-ok-soft text-ok', info: 'bg-info-soft text-info', warn: 'bg-warn-soft text-warn',
  danger: 'bg-danger-soft text-danger', muted: 'bg-surface-sunken text-ink-muted',
};
export const Badge = ({ tone = 'muted', children }: { tone?: Tone; children: ReactNode }) => (
  <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${TONE[tone]}`}>{children}</span>
);

const ALERT: Record<'info' | 'ok' | 'warn' | 'danger', { cls: string; Icon: typeof Info }> = {
  info: { cls: 'border-info/25 bg-info-soft text-[#1d4f84]', Icon: Info },
  ok: { cls: 'border-ok/25 bg-ok-soft text-[#1f6b52]', Icon: CheckCircle2 },
  warn: { cls: 'border-warn/30 bg-warn-soft text-[#7d4a0b]', Icon: AlertTriangle },
  danger: { cls: 'border-danger/30 bg-danger-soft text-[#8f2c22]', Icon: XCircle },
};
export function Alert({ tone = 'info', title, children, className = '' }: { tone?: keyof typeof ALERT; title?: string; children?: ReactNode; className?: string }) {
  const { cls, Icon } = ALERT[tone];
  return (
    <div role={tone === 'danger' ? 'alert' : 'status'} className={`flex gap-3 rounded-xl border px-4 py-3 text-sm ${cls} ${className}`}>
      <Icon className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
      <div>{title && <p className="font-semibold">{title}</p>}{children && <div className={title ? 'mt-0.5' : ''}>{children}</div>}</div>
    </div>
  );
}

export const Spinner = ({ label = 'Loading…' }: { label?: string }) => (
  <div className="flex items-center gap-3 py-10 text-sm text-ink-muted" role="status">
    <Loader2 className="h-5 w-5 animate-spin text-brand-600" aria-hidden /> {label}
  </div>
);

export function EmptyState({ icon, title, children, action }: { icon: ReactNode; title: string; children?: ReactNode; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center rounded-xl2 border border-dashed border-line-strong bg-white/60 px-6 py-12 text-center">
      <div className="mb-4 grid h-12 w-12 place-items-center rounded-full bg-brand-50 text-brand-700">{icon}</div>
      <h3 className="text-base font-semibold">{title}</h3>
      {children && <p className="mt-1.5 max-w-md text-sm text-ink-muted">{children}</p>}
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}

export function PageHeader({ title, subtitle, actions }: { title: string; subtitle?: ReactNode; actions?: ReactNode }) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
      <div>
        <h1 className="text-2xl font-semibold">{title}</h1>
        {subtitle && <p className="mt-1 text-[15px] text-ink-muted">{subtitle}</p>}
      </div>
      {actions}
    </div>
  );
}

export const SectionTitle = ({ children, aside }: { children: ReactNode; aside?: ReactNode }) => (
  <div className="mb-3 flex items-center justify-between">
    <h2 className="text-base font-semibold">{children}</h2>
    {aside}
  </div>
);

export function Logo({ className = '' }: { className?: string }) {
  return (
    <span className={`inline-flex items-center gap-2.5 font-semibold tracking-tight ${className}`}>
      <svg viewBox="0 0 32 32" className="h-8 w-8" aria-hidden>
        <rect width="32" height="32" rx="8" fill="#0F7880" />
        <path d="M6 17h3l2-6 3 12 3-16 3 12 2-6h4" fill="none" stroke="#fff" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
      <span className="text-[19px]">Fluent<span className="text-brand-700">AI</span></span>
    </span>
  );
}

export const Disclaimer = ({ className = '' }: { className?: string }) => (
  <p className={`text-xs leading-relaxed text-ink-muted ${className}`}>
    FluentAI gives practice insights from your recordings. It does not diagnose or treat stuttering and is not a
    substitute for care from a qualified speech-language pathologist.
  </p>
);
