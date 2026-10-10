import { CalendarClock, ClipboardList, HeartPulse, LayoutDashboard, LogOut, Mic, Settings, Stethoscope, Users } from 'lucide-react';
import { useState } from 'react';
import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { useAuth } from '../lib/auth';
import { Badge, Disclaimer, Logo } from './ui';

const link = ({ isActive }: { isActive: boolean }) =>
  `flex items-center gap-3 rounded-lg px-3 py-2.5 text-[15px] font-medium transition ${
    isActive ? 'bg-brand-50 text-brand-800' : 'text-ink-soft hover:bg-surface-sunken'
  }`;

export function AppLayout() {
  const { user, logout } = useAuth();
  const nav = useNavigate();
  const [open, setOpen] = useState(false);
  if (!user) return null;
  const patient = user.role === 'patient';
  const items = patient
    ? [
        { to: '/app', label: 'Overview', Icon: LayoutDashboard, end: true },
        { to: '/app/record', label: 'New recording', Icon: Mic },
        { to: '/app/sessions', label: 'My sessions', Icon: ClipboardList },
        { to: '/app/clinicians', label: 'Find a clinician', Icon: Stethoscope },
        { to: '/app/appointments', label: 'Consultations', Icon: CalendarClock },
      ]
    : [
        { to: '/app', label: 'Overview', Icon: LayoutDashboard, end: true },
        { to: '/app/patients', label: 'My patients', Icon: Users },
        { to: '/app/appointments', label: 'Consultation requests', Icon: CalendarClock },
      ];

  return (
    <div className="min-h-screen lg:grid lg:grid-cols-[264px_1fr]">
      <aside className={`${open ? 'block' : 'hidden'} border-r border-line bg-white lg:sticky lg:top-0 lg:block lg:h-screen`}>
        <div className="flex h-full flex-col p-4">
          <div className="hidden px-2 pb-6 pt-2 lg:block"><Logo /></div>
          <nav className="flex-1 space-y-1" aria-label="Main">
            {items.map(({ to, label, Icon, ...r }) => (
              <NavLink key={to} to={to} end={'end' in r} className={link} onClick={() => setOpen(false)}>
                <Icon className="h-[18px] w-[18px]" aria-hidden /> {label}
              </NavLink>
            ))}
            <NavLink to="/app/settings" className={link} onClick={() => setOpen(false)}>
              <Settings className="h-[18px] w-[18px]" aria-hidden /> Account
            </NavLink>
          </nav>
          <div className="mt-4 space-y-3 border-t border-line pt-4">
            <div className="px-1">
              <p className="truncate text-sm font-semibold">{user.fullName}</p>
              <p className="truncate text-xs text-ink-muted">{user.email}</p>
              <div className="mt-2">
                <Badge tone={patient ? 'info' : 'ok'}>{patient ? 'Patient' : 'Clinician'}</Badge>
              </div>
            </div>
            <button
              onClick={async () => { await logout(); nav('/'); }}
              className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-[15px] font-medium text-ink-soft hover:bg-surface-sunken"
            >
              <LogOut className="h-[18px] w-[18px]" aria-hidden /> Sign out
            </button>
          </div>
        </div>
      </aside>

      <div className="flex min-h-screen flex-col">
        <header className="flex items-center justify-between border-b border-line bg-white px-4 py-3 lg:hidden">
          <Logo />
          <button onClick={() => setOpen((v) => !v)} className="rounded-lg border border-line-strong px-3 py-1.5 text-sm font-medium" aria-expanded={open} aria-controls="main">
            {open ? 'Close' : 'Menu'}
          </button>
        </header>
        <main id="main" className="mx-auto w-full max-w-6xl flex-1 px-4 py-8 sm:px-8">
          <Outlet />
        </main>
        <footer className="border-t border-line bg-white px-4 py-4 sm:px-8">
          <div className="mx-auto flex max-w-6xl items-start gap-3">
            <HeartPulse className="mt-0.5 h-4 w-4 shrink-0 text-brand-600" aria-hidden />
            <Disclaimer />
          </div>
        </footer>
      </div>
    </div>
  );
}
