import { CalendarClock, Mic, Users } from 'lucide-react';
import { Link } from 'react-router-dom';
import { MetricTile, FlowRing, TrendChart, trendPoints } from '../components/insights';
import { Alert, Badge, Button, EmptyState, PageHeader, SectionTitle, Spinner } from '../components/ui';
import { api } from '../lib/api';
import { useAuth } from '../lib/auth';
import { ACTIVITY_LABEL, fmtDate, fmtDateTime, fmtDuration, fmtNum, MODE_LABEL } from '../lib/format';
import { useAsync } from '../lib/hooks';
import { StatusBadge } from './Sessions';

export default function Dashboard() {
  const { user } = useAuth();
  return user?.role === 'clinician' ? <ClinicianDashboard /> : <PatientDashboard />;
}

function PatientDashboard() {
  const { user } = useAuth();
  const s = useAsync(() => api.sessions.list());
  const a = useAsync(() => api.care.appointments());
  const first = user?.fullName.split(' ')[0] ?? '';

  if (s.loading || a.loading) return <Spinner />;
  const sessions = s.data?.sessions ?? [];
  const done = sessions.filter((x) => x.status === 'completed');
  const latest = done[0];
  const upcoming = (a.data?.appointments ?? [])
    .filter((x) => x.status === 'accepted' && new Date(x.requestedStart) > new Date())
    .sort((x, y) => x.requestedStart.localeCompare(y.requestedStart));
  const pending = (a.data?.appointments ?? []).filter((x) => x.status === 'requested').length;

  return (
    <>
      <PageHeader
        title={`Hello, ${first}`}
        subtitle="Here is how your practice is going."
        actions={<Link to="/app/record"><Button><Mic className="h-4 w-4" aria-hidden /> New recording</Button></Link>}
      />
      {(s.error || a.error) && <Alert tone="danger" className="mb-6">{s.error ?? a.error}</Alert>}

      {sessions.length === 0 ? (
        <EmptyState icon={<Mic className="h-6 w-6" aria-hidden />} title="Make your first recording"
          action={<Link to="/app/record"><Button>Start recording</Button></Link>}>
          Speak for a minute or two about anything. You will get your first insights as soon as it has been analysed.
        </EmptyState>
      ) : (
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
          <section className="card p-6 lg:col-span-2" aria-labelledby="latest">
            <SectionTitle aside={latest && <Link className="text-sm font-medium text-brand-700 hover:underline" to={`/app/sessions/${latest.id}`}>Open session</Link>}>
              <span id="latest">Latest analysed session</span>
            </SectionTitle>
            {latest ? (
              <div className="grid items-center gap-6 sm:grid-cols-[auto_1fr]">
                <FlowRing value={latest.flowIndex} />
                <div>
                  <p className="font-medium">{latest.title}</p>
                  <p className="mb-4 text-sm text-ink-muted">{ACTIVITY_LABEL[latest.activity]} · {fmtDate(latest.createdAt)} · {fmtDuration(latest.durationSec)}</p>
                  <div className="grid grid-cols-2 gap-3">
                    <MetricTile label="Pace" value={fmtNum(latest.speechRateWpm)} unit="words/min" />
                    <MetricTile label="Words" value={fmtNum(latest.wordCount)} />
                  </div>
                </div>
              </div>
            ) : (
              <p className="text-sm text-ink-muted">No session has been analysed yet. Open a recording and choose “Analyse”.</p>
            )}
          </section>

          <section className="card p-6" aria-labelledby="up">
            <SectionTitle aside={<Link className="text-sm font-medium text-brand-700 hover:underline" to="/app/appointments">All</Link>}>
              <span id="up">Consultations</span>
            </SectionTitle>
            {upcoming.length ? (
              <ul className="space-y-3">
                {upcoming.slice(0, 3).map((x) => (
                  <li key={x.id} className="rounded-lg bg-surface px-3.5 py-3 text-sm">
                    <p className="font-medium">{x.otherName}</p>
                    <p className="text-ink-muted">{fmtDateTime(x.requestedStart)} · {MODE_LABEL[x.mode]}</p>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-ink-muted">Nothing booked yet.{pending ? ` ${pending} request${pending > 1 ? 's' : ''} awaiting a reply.` : ''}</p>
            )}
            <Link to="/app/clinicians" className="mt-4 inline-block text-sm font-medium text-brand-700 hover:underline">Find a clinician →</Link>
          </section>

          <section className="card p-6 lg:col-span-2" aria-labelledby="trend">
            <SectionTitle><span id="trend">Flow index over time</span></SectionTitle>
            <TrendChart title="Flow index across analysed sessions" points={trendPoints(done.slice(0, 12), (x) => x.flowIndex)} />
            <p className="mt-2 text-xs text-ink-muted">Compare with your own earlier sessions. The index describes a single recording and is not a clinical score.</p>
          </section>

          <section className="card p-6" aria-labelledby="recent">
            <SectionTitle aside={<Link className="text-sm font-medium text-brand-700 hover:underline" to="/app/sessions">All</Link>}>
              <span id="recent">Recent sessions</span>
            </SectionTitle>
            <ul className="divide-y divide-line">
              {sessions.slice(0, 5).map((x) => (
                <li key={x.id}>
                  <Link to={`/app/sessions/${x.id}`} className="flex items-center justify-between gap-3 py-2.5 text-sm hover:text-brand-800">
                    <span className="min-w-0"><span className="block truncate font-medium">{x.title}</span><span className="text-xs text-ink-muted">{fmtDate(x.createdAt)}</span></span>
                    <StatusBadge s={x.status} />
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        </div>
      )}
    </>
  );
}

function ClinicianDashboard() {
  const { user } = useAuth();
  const a = useAsync(() => api.care.appointments());
  const verified = user?.verification === 'verified';
  const p = useAsync(() => (verified ? api.care.patients() : Promise.resolve({ patients: [] })), [verified]);

  if (a.loading || p.loading) return <Spinner />;
  const appts = a.data?.appointments ?? [];
  const pending = appts.filter((x) => x.status === 'requested');
  const upcoming = appts.filter((x) => x.status === 'accepted' && new Date(x.requestedStart) > new Date())
    .sort((x, y) => x.requestedStart.localeCompare(y.requestedStart));
  const patients = p.data?.patients ?? [];

  return (
    <>
      <PageHeader title={`Welcome, ${user?.fullName}`} subtitle="Consultation requests and the sessions your patients share." />
      {user?.verification === 'pending' && (
        <Alert tone="warn" title="Your account is awaiting verification" className="mb-6">
          We check licence details before clinicians appear to patients. You will be able to accept requests and view shared sessions once verification is complete.
        </Alert>
      )}
      {user?.verification === 'rejected' && (
        <Alert tone="danger" title="Verification was not successful" className="mb-6">Please contact support to review your registration details.</Alert>
      )}
      <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-3">
        <MetricTile label="Requests to review" value={pending.length} tone={pending.length ? 'warn' : undefined} />
        <MetricTile label="Upcoming consultations" value={upcoming.length} />
        <MetricTile label="Patients" value={patients.length} />
      </div>
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <section className="card p-6">
          <SectionTitle aside={<Link className="text-sm font-medium text-brand-700 hover:underline" to="/app/appointments">Manage</Link>}>Pending requests</SectionTitle>
          {pending.length ? (
            <ul className="divide-y divide-line">
              {pending.slice(0, 5).map((x) => (
                <li key={x.id} className="py-3 text-sm">
                  <p className="font-medium">{x.otherName}</p>
                  <p className="text-ink-muted">{fmtDateTime(x.requestedStart)} · {MODE_LABEL[x.mode]}</p>
                  {x.reason && <p className="mt-1 line-clamp-2 text-ink-soft">“{x.reason}”</p>}
                </li>
              ))}
            </ul>
          ) : <EmptyState icon={<CalendarClock className="h-5 w-5" aria-hidden />} title="No pending requests">New consultation requests will appear here.</EmptyState>}
        </section>
        <section className="card p-6">
          <SectionTitle aside={<Link className="text-sm font-medium text-brand-700 hover:underline" to="/app/patients">All patients</Link>}>Patients</SectionTitle>
          {patients.length ? (
            <ul className="divide-y divide-line">
              {patients.slice(0, 6).map((x) => (
                <li key={x.id}>
                  <Link to={`/app/patients/${x.id}`} className="flex items-center justify-between py-3 text-sm hover:text-brand-800">
                    <span className="font-medium">{x.name}</span>
                    <Badge tone={x.sharedSessions ? 'info' : 'muted'}>{x.sharedSessions} shared</Badge>
                  </Link>
                </li>
              ))}
            </ul>
          ) : <EmptyState icon={<Users className="h-5 w-5" aria-hidden />} title="No patients yet">Patients appear here after you accept a consultation request.</EmptyState>}
        </section>
      </div>
    </>
  );
}
