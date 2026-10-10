import { CalendarClock, Check, X } from 'lucide-react';
import { useState } from 'react';
import { Alert, Badge, Button, EmptyState, PageHeader, Spinner, Textarea } from '../components/ui';
import { api, ApiError } from '../lib/api';
import { useAuth } from '../lib/auth';
import { fmtDateTime, MODE_LABEL } from '../lib/format';
import { useAsync } from '../lib/hooks';
import type { Appointment, AppointmentStatus } from '../lib/types';

const TONE: Record<AppointmentStatus, 'info' | 'ok' | 'danger' | 'muted'> = {
  requested: 'info', accepted: 'ok', declined: 'danger', cancelled: 'muted', completed: 'muted',
};
const LABEL: Record<AppointmentStatus, string> = {
  requested: 'Awaiting reply', accepted: 'Confirmed', declined: 'Declined', cancelled: 'Cancelled', completed: 'Completed',
};

export default function Appointments() {
  const { user } = useAuth();
  const clinician = user?.role === 'clinician';
  const { data, error, loading, reload } = useAsync(() => api.care.appointments());
  const [err, setErr] = useState<string | null>(null);
  const [msgFor, setMsgFor] = useState<string | null>(null);
  const [message, setMessage] = useState('');

  async function update(a: Appointment, status: Exclude<AppointmentStatus, 'requested'>, clinicianMessage?: string) {
    setErr(null);
    try {
      await api.care.updateAppointment(a.id, { status, ...(clinicianMessage ? { clinicianMessage } : {}) });
      setMsgFor(null); setMessage('');
      await reload(true);
    } catch (e) { setErr(e instanceof ApiError ? e.message : 'Could not update the appointment.'); }
  }

  const all = data?.appointments ?? [];
  const groups: [string, Appointment[]][] = [
    [clinician ? 'Needs your reply' : 'Awaiting reply', all.filter((a) => a.status === 'requested')],
    ['Confirmed', all.filter((a) => a.status === 'accepted')],
    ['Past and closed', all.filter((a) => ['declined', 'cancelled', 'completed'].includes(a.status))],
  ];

  return (
    <>
      <PageHeader title={clinician ? 'Consultation requests' : 'Consultations'}
        subtitle={clinician ? 'Accept or decline requests from patients.' : 'Your requests and confirmed consultations.'} />
      {(error || err) && <Alert tone="danger" className="mb-4">{error ?? err}</Alert>}
      {clinician && user?.verification !== 'verified' && (
        <Alert tone="warn" title="Verification pending" className="mb-4">You can reply to requests once your account is verified.</Alert>
      )}
      {loading ? <Spinner /> : all.length === 0 ? (
        <EmptyState icon={<CalendarClock className="h-6 w-6" aria-hidden />} title="No consultations yet">
          {clinician ? 'Requests from patients will appear here.' : 'Find a clinician to request your first consultation.'}
        </EmptyState>
      ) : (
        <div className="space-y-8">
          {groups.filter(([, l]) => l.length).map(([title, list]) => (
            <section key={title} aria-label={title}>
              <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-ink-muted">{title}</h2>
              <ul className="space-y-3">
                {list.map((a) => (
                  <li key={a.id} className="card p-5">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <p className="font-semibold">{a.otherName}{a.otherDetail ? <span className="font-normal text-ink-muted"> · {a.otherDetail}</span> : null}</p>
                        <p className="mt-0.5 text-sm text-ink-muted">{fmtDateTime(a.requestedStart)} · {MODE_LABEL[a.mode]}</p>
                      </div>
                      <Badge tone={TONE[a.status]}>{LABEL[a.status]}</Badge>
                    </div>
                    {a.reason && <p className="mt-3 text-[15px] text-ink-soft">“{a.reason}”</p>}
                    {a.clinicianMessage && <p className="mt-3 rounded-lg bg-surface px-3.5 py-2.5 text-sm text-ink-soft"><span className="font-medium">Reply:</span> {a.clinicianMessage}</p>}

                    {clinician && a.status === 'requested' && (
                      <div className="mt-4 space-y-3">
                        {msgFor === a.id && <Textarea label="Message to the patient (optional)" value={message} maxLength={600} onChange={(e) => setMessage(e.target.value)} />}
                        <div className="flex flex-wrap gap-2">
                          <Button size="sm" onClick={() => (msgFor === a.id ? update(a, 'accepted', message.trim() || undefined) : update(a, 'accepted'))} disabled={user?.verification !== 'verified'}><Check className="h-4 w-4" aria-hidden /> Accept</Button>
                          <Button size="sm" variant="secondary" onClick={() => (msgFor === a.id ? update(a, 'declined', message.trim() || undefined) : update(a, 'declined'))} disabled={user?.verification !== 'verified'}><X className="h-4 w-4" aria-hidden /> Decline</Button>
                          {msgFor !== a.id && <Button size="sm" variant="ghost" onClick={() => setMsgFor(a.id)}>Add a message</Button>}
                        </div>
                      </div>
                    )}
                    {clinician && a.status === 'accepted' && <div className="mt-4"><Button size="sm" variant="secondary" onClick={() => update(a, 'completed')}>Mark as completed</Button></div>}
                    {!clinician && (a.status === 'requested' || a.status === 'accepted') && (
                      <div className="mt-4"><Button size="sm" variant="secondary" onClick={() => update(a, 'cancelled')}>Cancel</Button></div>
                    )}
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      )}
    </>
  );
}
