import { Activity, LayoutDashboard, LogOut, ShieldCheck, SlidersHorizontal, Stethoscope, Users } from 'lucide-react';
import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { Navigate, NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { api, ApiError, type AdminUser } from '../lib/api';
import { FullPageSpinner } from '../lib/auth';

// ---------- session ----------

interface AdminState { admin: AdminUser | null; setAdmin: (a: AdminUser | null) => void }
const Ctx = createContext<AdminState>({ admin: null, setAdmin: () => undefined });
export const useAdmin = () => useContext(Ctx);

/** Checks the admin cookie with the server; sends signed-out visitors to /admin/login. */
export function AdminGuard() {
  const [admin, setAdmin] = useState<AdminUser | null>(null);
  const [loading, setLoading] = useState(true);
  const loc = useLocation();
  useEffect(() => {
    api.admin.me()
      .then(({ admin }) => setAdmin(admin))
      .catch((e) => { if (!(e instanceof ApiError) || e.status !== 401) console.warn(e); })
      .finally(() => setLoading(false));
  }, []);
  if (loading) return <FullPageSpinner />;
  if (!admin) return <Navigate to="/login" replace state={{ from: loc.pathname }} />;
  return (
    <Ctx.Provider value={{ admin, setAdmin }}>
      <AdminLayout />
    </Ctx.Provider>
  );
}

// ---------- layout ----------

const NAV = [
  { to: '/admin', label: 'Overview', Icon: LayoutDashboard, end: true },
  { to: '/admin/features', label: 'Patient features', Icon: SlidersHorizontal },
  { to: '/admin/patients', label: 'Patients', Icon: Users },
  { to: '/admin/clinicians', label: 'Clinicians', Icon: Stethoscope },
  { to: '/admin/activity', label: 'Activity log', Icon: Activity },
];

export function AdminMark({ className = '' }: { className?: string }) {
  return (
    <span className={`inline-flex items-center gap-2.5 font-semibold tracking-tight ${className}`}>
      <span className="grid h-8 w-8 place-items-center rounded-lg bg-lime text-night"><ShieldCheck className="h-[18px] w-[18px]" aria-hidden /></span>
      <span className="text-[17px]">FluentAI <span className="font-normal text-white/50">Admin</span></span>
    </span>
  );
}

function AdminLayout() {
  const { admin } = useAdmin();
  const nav = useNavigate();
  const [open, setOpen] = useState(false);
  const link = ({ isActive }: { isActive: boolean }) =>
    `flex items-center gap-3 rounded-lg px-3 py-2.5 text-[15px] font-medium transition ${
      isActive ? 'bg-white/10 text-white shadow-[inset_3px_0_0_#D4FF3A]' : 'text-white/60 hover:bg-white/5 hover:text-white'
    }`;
  async function signOut() {
    await api.admin.logout().catch(() => undefined);
    nav('/login', { replace: true });
  }
  return (
    <div className="min-h-screen bg-surface lg:grid lg:grid-cols-[256px_1fr]">
      <aside className={`${open ? 'block' : 'hidden'} bg-night-2 text-white lg:sticky lg:top-0 lg:block lg:h-screen`}>
        <div className="flex h-full flex-col p-4">
          <div className="hidden px-2 pb-7 pt-2 lg:block"><AdminMark /></div>
          <nav className="flex-1 space-y-1" aria-label="Admin">
            {NAV.map(({ to, label, Icon, end }) => (
              <NavLink key={to} to={to} end={end} className={link} onClick={() => setOpen(false)}>
                <Icon className="h-[18px] w-[18px]" aria-hidden /> {label}
              </NavLink>
            ))}
          </nav>
          <div className="mt-4 space-y-3 border-t border-white/10 pt-4">
            <div className="px-1">
              <p className="truncate text-sm font-semibold">{admin?.fullName}</p>
              <p className="truncate text-xs text-white/50">{admin?.email}</p>
            </div>
            <button onClick={signOut} className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-[15px] font-medium text-white/70 hover:bg-white/5 hover:text-white">
              <LogOut className="h-[18px] w-[18px]" aria-hidden /> Sign out
            </button>
          </div>
        </div>
      </aside>
      <div className="flex min-h-screen flex-col">
        <header className="flex items-center justify-between bg-night-2 px-4 py-3 text-white lg:hidden">
          <AdminMark />
          <button onClick={() => setOpen((v) => !v)} className="rounded-lg border border-white/20 px-3 py-1.5 text-sm font-medium" aria-expanded={open}>
            {open ? 'Close' : 'Menu'}
          </button>
        </header>
        <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-8 sm:px-8">
          <Outlet />
        </main>
      </div>
    </div>
  );
}

// ---------- controls ----------

/** On/off switch. */
export function Toggle({ checked, onChange, label, disabled }: { checked: boolean; onChange: (v: boolean) => void; label: string; disabled?: boolean }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={`relative inline-flex h-7 w-12 shrink-0 items-center rounded-full transition-colors disabled:opacity-50 ${checked ? 'bg-brand-700' : 'bg-line-strong'}`}
    >
      <span className={`inline-block h-5 w-5 rounded-full bg-white shadow transition-transform ${checked ? 'translate-x-6' : 'translate-x-1'}`} />
    </button>
  );
}

export type Tri = null | true | false;
/** Three-way choice for a per-patient override: follow the global setting, force on, or force off. */
export function TriState({ value, onChange, globalOn, label, customOnly }: { value: Tri; onChange: (v: Tri) => void; globalOn: boolean; label: string; customOnly?: boolean }) {
  const opts: { v: Tri; text: string }[] = customOnly
    ? [{ v: null, text: 'Default' }, { v: true, text: 'Custom' }]
    : [
        { v: null, text: `Default (${globalOn ? 'on' : 'off'})` },
        { v: true, text: 'On' },
        { v: false, text: 'Off' },
      ];
  return (
    <div role="radiogroup" aria-label={label} className="inline-flex shrink-0 rounded-lg border border-line-strong bg-white p-0.5 text-sm">
      {opts.map((o) => {
        const active = value === o.v;
        const tone = o.v === null ? 'bg-ink text-white' : customOnly ? 'bg-brand-700 text-white' : o.v ? 'bg-ok text-white' : 'bg-danger text-white';
        return (
          <button key={String(o.v)} type="button" role="radio" aria-checked={active} onClick={() => onChange(o.v)}
            className={`rounded-md px-3 py-1.5 font-medium transition ${active ? tone : 'text-ink-muted hover:bg-surface-sunken'}`}>
            {o.text}
          </button>
        );
      })}
    </div>
  );
}

export function AdminHeader({ title, subtitle, actions }: { title: string; subtitle?: ReactNode; actions?: ReactNode }) {
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
