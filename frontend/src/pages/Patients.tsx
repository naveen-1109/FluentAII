import { ArrowLeft, Users } from 'lucide-react';
import { RoadmapPlanEditor } from '../components/RoadmapPlanEditor';
import { Link, useParams } from 'react-router-dom';
import { TrendChart, trendPoints } from '../components/insights';
import { Alert, Badge, EmptyState, PageHeader, SectionTitle, Spinner } from '../components/ui';
import { api } from '../lib/api';
import { ACTIVITY_LABEL, fmtDate, fmtDuration, fmtNum } from '../lib/format';
import { useAsync } from '../lib/hooks';
import { StatusBadge } from './Sessions';

export function Patients() {
  const { data, error, loading } = useAsync(() => api.care.patients());
  return (
    <>
      <PageHeader title="My patients" subtitle="Patients whose consultation you accepted. You only see sessions they choose to share." />
      {error && <Alert tone="danger" className="mb-4">{error}</Alert>}
      {loading ? <Spinner /> : !data?.patients.length ? (
        <EmptyState icon={<Users className="h-6 w-6" aria-hidden />} title="No patients yet">Accept a consultation request to see the patient here.</EmptyState>
      ) : (
        <ul className="grid grid-cols-1 gap-4 md:grid-cols-2">
          {data.patients.map((p) => (
            <li key={p.id}>
              <Link to={`/app/patients/${p.id}`} className="card flex items-center justify-between p-5 transition hover:border-brand-300 hover:shadow-pop">
                <div>
                  <p className="font-semibold">{p.name}</p>
                  <p className="text-sm text-ink-muted">{p.lastSharedAt ? `Last shared ${fmtDate(p.lastSharedAt)}` : 'Nothing shared yet'}</p>
                </div>
                <Badge tone={p.sharedSessions ? 'info' : 'muted'}>{p.sharedSessions} shared</Badge>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}

export function PatientDetail() {
  const { id = '' } = useParams();
  const { data, error, loading } = useAsync(() => api.care.patientSessions(id), [id]);
  const sessions = data?.sessions ?? [];
  return (
    <>
      <Link to="/app/patients" className="mb-4 inline-flex items-center gap-1.5 text-sm font-medium text-brand-700 hover:underline"><ArrowLeft className="h-4 w-4" aria-hidden /> Patients</Link>
      <PageHeader title={data?.patient?.name ?? 'Patient'} subtitle="Sessions this patient has shared with you." />
      {error && <Alert tone="danger" className="mb-4">{error}</Alert>}
      {loading ? <Spinner /> : sessions.length === 0 ? (
        <EmptyState icon={<Users className="h-6 w-6" aria-hidden />} title="No shared sessions">The patient has not shared any sessions with you yet.</EmptyState>
      ) : (
        <div className="space-y-6">
          <section className="card p-6">
            <SectionTitle>Flow index over shared sessions</SectionTitle>
            <TrendChart title="Flow index across shared sessions" points={trendPoints(sessions, (s) => s.flowIndex)} />
          </section>
          <ul className="space-y-3">
            {sessions.map((s) => (
              <li key={s.id}>
                <Link to={`/app/sessions/${s.id}`} className="card flex flex-wrap items-center justify-between gap-3 p-5 transition hover:border-brand-300">
                  <div>
                    <p className="font-semibold">{s.title}</p>
                    <p className="text-sm text-ink-muted">{ACTIVITY_LABEL[s.activity]} · {fmtDate(s.createdAt)} · {fmtDuration(s.durationSec)}</p>
                  </div>
                  <div className="flex items-center gap-4 text-sm">
                    <span className="tabular-nums text-ink-soft">Flow {fmtNum(s.flowIndex)}</span>
                    <span className="tabular-nums text-ink-soft">{s.speechRateWpm == null ? '—' : `${fmtNum(s.speechRateWpm)} wpm`}</span>
                    <StatusBadge s={s.status} />
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        </div>
      )}
      {data?.patient && <RoadmapPlanEditor patientId={id} name={data.patient.name.split(' ')[0] ?? data.patient.name} />}
    </>
  );
}
