import { Building2, CalendarPlus, Languages, MapPin, Search, Stethoscope } from 'lucide-react';
import { useEffect, useState, type FormEvent } from 'react';
import { Alert, Badge, Button, EmptyState, Input, PageHeader, Select, Spinner, Textarea } from '../components/ui';
import { api, ApiError } from '../lib/api';
import { MODE_LABEL } from '../lib/format';
import { useAsync } from '../lib/hooks';
import type { AppointmentMode, Clinician } from '../lib/types';

export default function Clinicians() {
  const [q, setQ] = useState('');
  const [debounced, setDebounced] = useState('');
  useEffect(() => { const t = setTimeout(() => setDebounced(q.trim()), 250); return () => clearTimeout(t); }, [q]);
  const { data, error, loading } = useAsync(() => api.care.clinicians(debounced || undefined), [debounced]);
  const [open, setOpen] = useState<string | null>(null);
  const [booked, setBooked] = useState<string | null>(null);

  return (
    <>
      <PageHeader title="Find a clinician" subtitle="Request a consultation with a verified healthcare professional." />
      <div className="relative mb-6 max-w-md">
        <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-faint" aria-hidden />
        <input className="input pl-10" type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search by name, specialty, language or place" aria-label="Search clinicians" />
      </div>
      {booked && <Alert tone="ok" title="Request sent" className="mb-6">{booked} will review your request. You can follow its status under Consultations.</Alert>}
      {error && <Alert tone="danger" className="mb-6">{error}</Alert>}
      {loading ? <Spinner /> : !data?.clinicians.length ? (
        <EmptyState icon={<Stethoscope className="h-6 w-6" aria-hidden />} title={debounced ? 'No clinicians match your search' : 'No clinicians are available yet'}>
          {debounced ? 'Try a different word, or clear the search.' : 'Verified clinicians will be listed here as they join.'}
        </EmptyState>
      ) : (
        <ul className="grid grid-cols-1 gap-5 md:grid-cols-2">
          {data.clinicians.map((c) => (
            <li key={c.id} className="card p-6">
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-center gap-3">
                  <span className="grid h-12 w-12 shrink-0 place-items-center rounded-full bg-brand-50 text-lg font-semibold text-brand-800" aria-hidden>
                    {c.fullName.split(' ').map((p) => p[0]).slice(0, 2).join('').toUpperCase()}
                  </span>
                  <div>
                    <h2 className="font-semibold">{c.title} {c.fullName}</h2>
                    <p className="text-sm text-ink-muted">{c.specialty}</p>
                  </div>
                </div>
                <Badge tone={c.acceptsNewPatients ? 'ok' : 'muted'}>{c.acceptsNewPatients ? 'Accepting patients' : 'Not accepting'}</Badge>
              </div>
              <dl className="mt-4 space-y-1.5 text-sm text-ink-soft">
                {c.organisation && <div className="flex items-center gap-2"><Building2 className="h-4 w-4 text-ink-faint" aria-hidden /><dt className="sr-only">Organisation</dt><dd>{c.organisation}</dd></div>}
                <div className="flex items-center gap-2"><MapPin className="h-4 w-4 text-ink-faint" aria-hidden /><dt className="sr-only">Registered with</dt><dd>Registered: {c.licenseRegion} · {c.yearsExperience} yrs experience</dd></div>
                {c.languages && <div className="flex items-center gap-2"><Languages className="h-4 w-4 text-ink-faint" aria-hidden /><dt className="sr-only">Languages</dt><dd>{c.languages}</dd></div>}
              </dl>
              {c.bio && <p className="mt-3 line-clamp-3 text-sm leading-relaxed text-ink-muted">{c.bio}</p>}
              <div className="mt-5">
                {open === c.id ? (
                  <BookingForm clinician={c} onCancel={() => setOpen(null)} onDone={() => { setOpen(null); setBooked(`${c.title} ${c.fullName}`); window.scrollTo({ top: 0, behavior: 'smooth' }); }} />
                ) : (
                  <Button variant="secondary" onClick={() => setOpen(c.id)} disabled={!c.acceptsNewPatients}><CalendarPlus className="h-4 w-4" aria-hidden /> Request a consultation</Button>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}

function BookingForm({ clinician, onCancel, onDone }: { clinician: Clinician; onCancel: () => void; onDone: () => void }) {
  const [when, setWhen] = useState('');
  const [mode, setMode] = useState<AppointmentMode>('video');
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const min = new Date(Date.now() + 3600_000 - new Date().getTimezoneOffset() * 60_000).toISOString().slice(0, 16);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true); setErr(null);
    try {
      await api.care.book({ clinicianId: clinician.id, requestedStart: new Date(when).toISOString(), mode, reason });
      onDone();
    } catch (ex) {
      setErr(ex instanceof ApiError ? ex.message : 'Could not send the request.');
    } finally { setBusy(false); }
  }

  return (
    <form onSubmit={submit} className="space-y-4 rounded-xl border border-line bg-surface p-4">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Input label="Preferred date and time" type="datetime-local" min={min} required value={when} onChange={(e) => setWhen(e.target.value)} />
        <Select label="Format" value={mode} onChange={(e) => setMode(e.target.value as AppointmentMode)}>
          {Object.entries(MODE_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </Select>
      </div>
      <Textarea label="What would you like help with?" value={reason} maxLength={600} onChange={(e) => setReason(e.target.value)} help="Optional. Shared only with this clinician." />
      {err && <Alert tone="danger">{err}</Alert>}
      <div className="flex gap-3">
        <Button type="submit" loading={busy} disabled={!when}>Send request</Button>
        <Button type="button" variant="ghost" onClick={onCancel}>Cancel</Button>
      </div>
    </form>
  );
}
