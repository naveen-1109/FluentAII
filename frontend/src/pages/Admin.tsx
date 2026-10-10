import { ArrowLeft, Check, CheckCircle2, Clock, Megaphone, Search, ShieldCheck, Stethoscope, Target, Users, X } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { AdminHeader, Toggle, TriState, type Tri } from '../components/admin';
import { Alert, Badge, Button, Checkbox, EmptyState, Input, SectionTitle, Spinner, VerifiedBadge } from '../components/ui';
import { api, ApiError, type AdminClinicianRow, type AdminFeatureSettings, type AdminPatientDetail } from '../lib/api';
import { fmtDate, fmtDateTime } from '../lib/format';
import { useAsync } from '../lib/hooks';

const errText = (e: unknown, fallback: string) => (e instanceof ApiError ? e.message : fallback);

// ===================== overview =====================

export function AdminOverview() {
  const { data, error, loading } = useAsync(() => api.admin.overview());
  if (loading) return <Spinner />;
  if (error || !data) return <Alert tone="danger">{error ?? 'Could not load the overview.'}</Alert>;
  const tiles = [
    { label: 'Patients', value: data.patients, foot: `${data.newPatientsThisWeek} new this week`, Icon: Users, color: '#0F7880' },
    { label: 'Clinicians to check', value: data.clinicians.pending + data.clinicians.expired, foot: `${data.clinicians.verified} verified · ${data.clinicians.expired} expired`, Icon: Stethoscope, color: '#A8650F', to: '/admin/clinicians' },
    { label: 'Sessions', value: data.sessions, foot: `${data.sessionsAnalysed} analysed · ${data.sessionsThisWeek} this week`, Icon: Clock, color: '#2B6CB0' },
    { label: 'Features switched off', value: data.featuresOff, foot: `${data.patientsWithOverrides} patients with custom settings`, Icon: ShieldCheck, color: '#7FA600', to: '/admin/features' },
  ];
  return (
    <>
      <AdminHeader title="Overview" subtitle="Accounts, activity and settings across FluentAI." />
      <div className="mb-6 grid grid-cols-2 gap-4 lg:grid-cols-4">
        {tiles.map(({ label, value, foot, Icon, color, to }) => {
          const body = (
            <div className="stat-card card h-full p-5">
              <div className="flex items-center gap-2.5">
                <span className="grid h-9 w-9 place-items-center rounded-xl" style={{ background: `${color}14`, color }}><Icon className="h-[18px] w-[18px]" aria-hidden /></span>
                <p className="text-[13px] font-medium text-ink-muted">{label}</p>
              </div>
              <p className="mt-4 text-[30px] font-semibold leading-none">{value}</p>
              <p className="mt-2 text-xs text-ink-muted">{foot}</p>
            </div>
          );
          return to ? <Link key={label} to={to}>{body}</Link> : <div key={label}>{body}</div>;
        })}
      </div>
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <section className="card p-6 lg:col-span-2">
          <SectionTitle aside={<Link to="/admin/patients" className="text-sm font-medium text-brand-700 hover:underline">All patients</Link>}>Newest accounts</SectionTitle>
          <ul className="divide-y divide-line">
            {data.recentUsers.map((u) => (
              <li key={u.id} className="flex items-center justify-between gap-3 py-3 text-sm">
                <span className="min-w-0"><span className="block truncate font-medium">{u.fullName}</span><span className="text-xs text-ink-muted">{u.email} · {fmtDate(u.createdAt)}</span></span>
                <span className="flex shrink-0 items-center gap-2">
                  {!u.registered && <Badge tone="muted">Unfinished sign-up</Badge>}
                  <Badge tone={u.role === 'patient' ? 'info' : 'ok'}>{u.role === 'patient' ? 'Patient' : 'Clinician'}</Badge>
                  {u.role === 'patient' && <Link to={`/admin/patients/${u.id}`} className="font-medium text-brand-700 hover:underline">Manage</Link>}
                </span>
              </li>
            ))}
          </ul>
        </section>
        <section className="card p-6">
          <SectionTitle>Consultations</SectionTitle>
          <ul className="space-y-2.5 text-sm">
            {['requested', 'accepted', 'completed', 'declined', 'cancelled'].map((k) => (
              <li key={k} className="flex items-center justify-between"><span className="capitalize text-ink-soft">{k}</span><span className="font-semibold tabular-nums">{data.appointments[k] ?? 0}</span></li>
            ))}
          </ul>
        </section>
      </div>
    </>
  );
}

// ===================== global features =====================

export function AdminFeatures() {
  const { data, error, loading } = useAsync(() => api.admin.features());
  const [draft, setDraft] = useState<AdminFeatureSettings | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ tone: 'ok' | 'danger'; text: string } | null>(null);
  useEffect(() => { if (data) setDraft(data); }, [data]);
  if (loading || (!draft && !error)) return <Spinner />;
  if (error || !draft || !data) return <Alert tone="danger">{error ?? 'Could not load settings.'}</Alert>;

  const dirty = JSON.stringify(draft) !== JSON.stringify(data);
  const setFeature = (key: string, enabled: boolean) => setDraft({ ...draft, features: draft.features.map((f) => (f.key === key ? { ...f, enabled } : f)) });

  async function save() {
    setBusy(true); setMsg(null);
    try {
      const saved = await api.admin.saveFeatures({
        features: Object.fromEntries(draft!.features.map((f) => [f.key, f.enabled])),
        weeklyGoal: draft!.weeklyGoal,
        announcement: draft!.announcement,
      });
      setDraft(saved);
      Object.assign(data!, saved);
      setMsg({ tone: 'ok', text: 'Saved. Patients see the change the next time a page loads.' });
    } catch (e) { setMsg({ tone: 'danger', text: errText(e, 'Could not save.') }); }
    finally { setBusy(false); }
  }

  return (
    <>
      <AdminHeader
        title="Patient features"
        subtitle="Default settings for every patient. You can change them for one patient on the Patients page."
        actions={<Button onClick={save} loading={busy} disabled={!dirty}>Save changes</Button>}
      />
      {msg && <Alert tone={msg.tone} className="mb-6">{msg.text}</Alert>}
      <section className="card divide-y divide-line">
        {draft.features.map((f) => (
          <div key={f.key} className="flex items-center justify-between gap-6 p-5">
            <div className="min-w-0">
              <p className="font-semibold">{f.label}</p>
              <p className="mt-0.5 text-sm text-ink-muted">{f.description}</p>
            </div>
            <div className="flex items-center gap-3">
              <span className={`hidden text-sm font-medium sm:block ${f.enabled ? 'text-ok' : 'text-ink-muted'}`}>{f.enabled ? 'On' : 'Off'}</span>
              <Toggle checked={f.enabled} onChange={(v) => setFeature(f.key, v)} label={f.label} />
            </div>
          </div>
        ))}
      </section>
      <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-2">
        <section className="card p-6">
          <SectionTitle><span className="inline-flex items-center gap-2"><Target className="h-4 w-4 text-brand-700" aria-hidden /> Weekly goal</span></SectionTitle>
          <p className="mb-4 text-sm text-ink-muted">Sessions per week shown in each patient's weekly goal ring.</p>
          <div className="flex items-center gap-3">
            <Button variant="secondary" size="sm" onClick={() => setDraft({ ...draft, weeklyGoal: Math.max(1, draft.weeklyGoal - 1) })} aria-label="Lower goal">−</Button>
            <span className="w-12 text-center text-2xl font-semibold tabular-nums">{draft.weeklyGoal}</span>
            <Button variant="secondary" size="sm" onClick={() => setDraft({ ...draft, weeklyGoal: Math.min(21, draft.weeklyGoal + 1) })} aria-label="Raise goal">+</Button>
            <span className="text-sm text-ink-muted">sessions / week</span>
          </div>
        </section>
        <section className="card p-6">
          <SectionTitle><span className="inline-flex items-center gap-2"><Megaphone className="h-4 w-4 text-brand-700" aria-hidden /> Announcement</span></SectionTitle>
          <p className="mb-3 text-sm text-ink-muted">Shown at the top of every patient's dashboard. Leave empty to hide it.</p>
          <textarea className="input resize-y" rows={3} maxLength={280} value={draft.announcement} aria-label="Announcement"
            onChange={(e) => setDraft({ ...draft, announcement: e.target.value })} placeholder="For example: FluentAI will be offline for maintenance on Sunday 8–9 am." />
          <p className="mt-1.5 text-right text-xs text-ink-faint">{draft.announcement.length}/280</p>
        </section>
      </div>
    </>
  );
}

// ===================== patients =====================

export function AdminPatients() {
  const [q, setQ] = useState('');
  const [debounced, setDebounced] = useState('');
  useEffect(() => { const t = setTimeout(() => setDebounced(q.trim()), 250); return () => clearTimeout(t); }, [q]);
  const { data, error, loading } = useAsync(() => api.admin.patients(debounced || undefined), [debounced]);
  return (
    <>
      <AdminHeader title="Patients" subtitle="Open a patient to change which features they can use." />
      <div className="relative mb-5 max-w-md">
        <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-faint" aria-hidden />
        <input className="input pl-10" type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search by name or email" aria-label="Search patients" />
      </div>
      {error && <Alert tone="danger" className="mb-4">{error}</Alert>}
      {loading ? <Spinner /> : !data?.patients.length ? (
        <EmptyState icon={<Users className="h-6 w-6" aria-hidden />} title="No patients found">{debounced ? 'Try a different search.' : 'Patients appear here after they sign up.'}</EmptyState>
      ) : (
        <div className="card overflow-x-auto">
          <table className="w-full min-w-[640px] text-left text-sm">
            <thead className="border-b border-line text-[13px] text-ink-muted">
              <tr><th className="px-5 py-3 font-medium">Patient</th><th className="px-5 py-3 font-medium">Joined</th><th className="px-5 py-3 font-medium">Sessions</th><th className="px-5 py-3 font-medium">Settings</th><th className="px-5 py-3" /></tr>
            </thead>
            <tbody className="divide-y divide-line">
              {data.patients.map((p) => (
                <tr key={p.id} className="hover:bg-surface">
                  <td className="px-5 py-3"><p className="font-medium">{p.fullName}</p><p className="text-xs text-ink-muted">{p.email}</p></td>
                  <td className="px-5 py-3 text-ink-soft">{fmtDate(p.createdAt)}{!p.registered && <span className="ml-2"><Badge tone="muted">Unfinished</Badge></span>}</td>
                  <td className="px-5 py-3 tabular-nums">{p.sessions}{p.lastSessionAt && <span className="block text-xs text-ink-muted">last {fmtDate(p.lastSessionAt)}</span>}</td>
                  <td className="px-5 py-3">{p.overrides ? <Badge tone="warn">{p.overrides} custom</Badge> : <Badge tone="muted">Default</Badge>}</td>
                  <td className="px-5 py-3 text-right"><Link to={`/admin/patients/${p.id}`} className="font-medium text-brand-700 hover:underline">Manage</Link></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}

export function AdminPatientDetail() {
  const { id = '' } = useParams();
  const { data, error, loading } = useAsync(() => api.admin.patient(id), [id]);
  const [over, setOver] = useState<Record<string, Tri>>({});
  const [goal, setGoal] = useState<number | null>(null);
  const [base, setBase] = useState<AdminPatientDetail | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ tone: 'ok' | 'danger'; text: string } | null>(null);

  useEffect(() => {
    if (!data) return;
    setBase(data);
    setOver(Object.fromEntries(data.features.map((f) => [f.key, f.override])));
    setGoal(data.weeklyGoal.override);
  }, [data]);

  if (loading || (!base && !error)) return <Spinner />;
  if (error || !base) return <><BackLink /><Alert tone="danger">{error ?? 'Patient not found.'}</Alert></>;

  const dirty = base.features.some((f) => f.override !== over[f.key]) || base.weeklyGoal.override !== goal;
  const { patient: p, profile, stats } = base;

  async function save() {
    setBusy(true); setMsg(null);
    try {
      const r = await api.admin.savePatientFeatures(id, { features: over as Record<string, boolean | null>, weeklyGoal: goal });
      setBase({ ...base!, ...r });
      setMsg({ tone: 'ok', text: `Saved. ${p.fullName.split(' ')[0]} sees the change the next time a page loads.` });
    } catch (e) { setMsg({ tone: 'danger', text: errText(e, 'Could not save.') }); }
    finally { setBusy(false); }
  }
  function resetAll() {
    setOver(Object.fromEntries(base!.features.map((f) => [f.key, null])));
    setGoal(null);
  }

  return (
    <>
      <BackLink />
      <AdminHeader
        title={p.fullName}
        subtitle={<>{p.email} · joined {fmtDate(p.createdAt)}</>}
        actions={<div className="flex gap-2"><Button variant="secondary" onClick={resetAll}>Use all defaults</Button><Button onClick={save} loading={busy} disabled={!dirty}>Save changes</Button></div>}
      />
      {msg && <Alert tone={msg.tone} className="mb-6">{msg.text}</Alert>}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <section className="card divide-y divide-line lg:col-span-2">
          <div className="p-5">
            <h2 className="font-semibold">Features for this patient</h2>
            <p className="mt-0.5 text-sm text-ink-muted">“Default” follows the setting on the Patient features page. On or Off applies to this patient only.</p>
          </div>
          {base.features.map((f) => {
            const v = over[f.key] ?? null;
            const effective = v === null ? f.global : v;
            return (
              <div key={f.key} className="flex flex-wrap items-center justify-between gap-4 p-5">
                <div className="min-w-0 flex-1">
                  <p className="flex items-center gap-2 font-semibold">
                    {f.label}
                    {effective ? <CheckCircle2 className="h-4 w-4 text-ok" aria-label="Currently on" /> : <X className="h-4 w-4 text-danger" aria-label="Currently off" />}
                  </p>
                  <p className="mt-0.5 text-sm text-ink-muted">{f.description}</p>
                </div>
                <TriState value={v} onChange={(nv) => setOver({ ...over, [f.key]: nv })} globalOn={f.global} label={f.label} />
              </div>
            );
          })}
          <div className="flex flex-wrap items-center justify-between gap-4 p-5">
            <div><p className="font-semibold">Weekly goal</p><p className="mt-0.5 text-sm text-ink-muted">Default is {base.weeklyGoal.global} sessions a week.</p></div>
            <div className="flex items-center gap-3">
              <TriState value={goal === null ? null : true} onChange={(nv) => setGoal(nv === null ? null : goal ?? base.weeklyGoal.global)} globalOn label="Weekly goal" customOnly />
              {goal !== null && (
                <input type="number" min={1} max={21} value={goal} aria-label="Weekly goal for this patient"
                  onChange={(e) => setGoal(Math.max(1, Math.min(21, Number(e.target.value) || 1)))} className="input w-20 py-1.5 text-center" />
              )}
            </div>
          </div>
        </section>
        <div className="space-y-6">
          <section className="card p-6">
            <SectionTitle>Activity</SectionTitle>
            <dl className="grid grid-cols-2 gap-3 text-sm">
              {[['Sessions', stats.sessions], ['Analysed', stats.analysed], ['Minutes', stats.minutes], ['Consultations', stats.appointments]].map(([k, v]) => (
                <div key={k as string} className="rounded-xl bg-surface p-3"><dt className="text-xs text-ink-muted">{k}</dt><dd className="mt-0.5 text-xl font-semibold">{v}</dd></div>
              ))}
            </dl>
            <p className="mt-3 text-xs text-ink-muted">{stats.lastSessionAt ? `Last session ${fmtDateTime(stats.lastSessionAt)}` : 'No sessions yet.'}</p>
          </section>
          <section className="card p-6">
            <SectionTitle>Registration</SectionTitle>
            {profile ? (
              <dl className="space-y-2 text-sm">
                <div className="flex justify-between gap-3"><dt className="text-ink-muted">Age group</dt><dd>{profile.ageGroup}</dd></div>
                <div className="flex justify-between gap-3"><dt className="text-ink-muted">Language</dt><dd>{profile.primaryLanguage}</dd></div>
                <div className="flex justify-between gap-3"><dt className="text-ink-muted">Consented</dt><dd>{fmtDate(profile.consentedAt)}</dd></div>
                {profile.goals && <div><dt className="text-ink-muted">Goals</dt><dd className="mt-1 text-ink-soft">{profile.goals}</dd></div>}
              </dl>
            ) : <p className="text-sm text-ink-muted">This patient has not finished registration.</p>}
            <p className="mt-4 text-xs text-ink-faint">Recordings and transcripts stay private to the patient and are not shown here.</p>
          </section>
        </div>
      </div>
    </>
  );
}

const BackLink = () => (
  <Link to="/admin/patients" className="mb-4 inline-flex items-center gap-1.5 text-sm font-medium text-brand-700 hover:underline"><ArrowLeft className="h-4 w-4" aria-hidden /> Patients</Link>
);

// ===================== clinicians =====================

const STATUS_TONE = { pending: 'warn', verified: 'ok', expired: 'danger', rejected: 'danger' } as const;
const STATUS_TEXT = { pending: 'Pending check', verified: 'Verified', expired: 'Licence expired', rejected: 'Rejected' } as const;
const todayIso = () => new Date().toISOString().slice(0, 10);

export function AdminClinicians() {
  const [filter, setFilter] = useState<'' | 'pending' | 'verified' | 'expired' | 'rejected'>('');
  const { data, error, loading, reload } = useAsync(() => api.admin.clinicians(filter || undefined), [filter]);
  const [openId, setOpenId] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);

  async function setStatus(id: string, status: 'rejected' | 'pending') {
    const note = status === 'rejected' ? window.prompt('Reason for rejecting (shown in the activity log):', 'Licence could not be confirmed with the issuing body') ?? undefined : undefined;
    if (status === 'rejected' && note === undefined) return;
    setBusy(id + status); setMsg(null);
    try { await api.admin.setClinicianStatus(id, { status, note }); await reload(true); }
    catch (e) { setMsg(errText(e, 'Could not update.')); }
    finally { setBusy(null); }
  }

  return (
    <>
      <AdminHeader title="Clinicians" subtitle="Approve a clinician only after confirming their licence with the issuing body. Approvals end automatically when the licence expires." />
      <div className="mb-5 inline-flex flex-wrap gap-1 rounded-xl border border-line bg-white p-1 text-sm">
        {(['', 'pending', 'verified', 'expired', 'rejected'] as const).map((k) => (
          <button key={k} onClick={() => setFilter(k)} className={`rounded-lg px-3.5 py-1.5 font-medium ${filter === k ? 'bg-brand-700 text-white' : 'text-ink-soft hover:bg-surface-sunken'}`}>{k ? STATUS_TEXT[k] : 'All'}</button>
        ))}
      </div>
      {(error || msg) && <Alert tone="danger" className="mb-4">{error ?? msg}</Alert>}
      {loading ? <Spinner /> : !data?.clinicians.length ? (
        <EmptyState icon={<Stethoscope className="h-6 w-6" aria-hidden />} title="No clinicians here">Clinicians appear here after they register.</EmptyState>
      ) : (
        <ul className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          {data.clinicians.map((c) => {
            const expired = !!c.licenseExpiry && c.licenseExpiry <= todayIso();
            return (
              <li key={c.id} className="card p-5">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="flex flex-wrap items-center gap-2 font-semibold">{c.title} {c.fullName}{c.status === 'verified' && <VerifiedBadge since={c.verifiedAt} />}</p>
                    <p className="text-sm text-ink-muted">{c.specialty}{c.organisation ? ` · ${c.organisation}` : ''}</p>
                  </div>
                  {c.status !== 'verified' && <Badge tone={STATUS_TONE[c.status]}>{STATUS_TEXT[c.status]}</Badge>}
                </div>
                <dl className="mt-4 grid grid-cols-2 gap-3 text-sm">
                  <div className="rounded-lg bg-surface p-3"><dt className="text-xs text-ink-muted">Licence number</dt><dd className="font-mono">{c.licenseNumber}</dd></div>
                  <div className="rounded-lg bg-surface p-3"><dt className="text-xs text-ink-muted">Issuing body</dt><dd>{c.licenseRegion}</dd></div>
                  <div className={`rounded-lg p-3 ${expired ? 'bg-danger-soft' : !c.licenseExpiry ? 'bg-warn-soft' : 'bg-surface'}`}>
                    <dt className="text-xs text-ink-muted">Valid until</dt>
                    <dd className={expired ? 'font-semibold text-danger' : ''}>{c.licenseExpiry ? fmtDate(c.licenseExpiry) : 'Not given'}{expired ? ' (expired)' : ''}</dd>
                  </div>
                  <div className="rounded-lg bg-surface p-3"><dt className="text-xs text-ink-muted">Email</dt><dd className="truncate">{c.email}</dd></div>
                </dl>
                {c.verifiedAt && (c.status === 'verified' || c.status === 'expired') && (
                  <p className="mt-3 rounded-lg border border-line px-3 py-2 text-xs text-ink-muted">
                    Checked by {c.verifiedBy ?? 'an admin'} on {fmtDate(c.verifiedAt)} · reference <span className="font-mono text-ink-soft">{c.verificationRef}</span>
                    {c.verificationNote ? <> · {c.verificationNote}</> : null}
                  </p>
                )}
                {openId === c.id ? (
                  <ApproveForm clinician={c} onCancel={() => setOpenId(null)} onDone={async () => { setOpenId(null); await reload(true); }} />
                ) : (
                  <div className="mt-4 flex flex-wrap gap-2">
                    {c.status !== 'verified' && <Button size="sm" onClick={() => setOpenId(c.id)}><ShieldCheck className="h-4 w-4" aria-hidden /> {c.status === 'expired' ? 'Re-check licence' : 'Check licence and approve'}</Button>}
                    {c.status !== 'rejected' && <Button size="sm" variant="secondary" onClick={() => setStatus(c.id, 'rejected')} loading={busy === c.id + 'rejected'}><X className="h-4 w-4" aria-hidden /> Reject</Button>}
                    {c.status === 'verified' || c.status === 'rejected' ? <Button size="sm" variant="ghost" onClick={() => setStatus(c.id, 'pending')} loading={busy === c.id + 'pending'}>Move back to pending</Button> : null}
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </>
  );
}

function ApproveForm({ clinician: c, onCancel, onDone }: { clinician: AdminClinicianRow; onCancel: () => void; onDone: () => void }) {
  const [expiry, setExpiry] = useState(c.licenseExpiry && c.licenseExpiry > todayIso() ? c.licenseExpiry : '');
  const [ref, setRef] = useState(c.licenseNumber);
  const [note, setNote] = useState('');
  const [checked, setChecked] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const expiryOk = !!expiry && expiry > todayIso();
  const ready = expiryOk && ref.trim().length >= 3 && checked;

  async function approve() {
    setBusy(true); setErr(null);
    try {
      await api.admin.setClinicianStatus(c.id, { status: 'verified', licenseExpiry: expiry, verificationRef: ref.trim(), confirmChecked: checked, note: note.trim() });
      onDone();
    } catch (e) { setErr(errText(e, 'Could not approve.')); setBusy(false); }
  }

  return (
    <div className="mt-4 space-y-4 rounded-xl border border-brand-200 bg-brand-50/50 p-4">
      <p className="text-sm font-semibold">Confirm the licence before approving</p>
      <ol className="list-decimal space-y-1 pl-5 text-xs text-ink-muted">
        <li>Look up <span className="font-mono">{c.licenseNumber}</span> with {c.licenseRegion || 'the issuing body'} (for India, the Rehabilitation Council of India register).</li>
        <li>Check the name matches {c.fullName} and the licence is active.</li>
        <li>Enter the expiry date shown by the register.</li>
      </ol>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Input label="Licence valid until" type="date" min={todayIso()} value={expiry} onChange={(e) => setExpiry(e.target.value)}
          error={expiry && !expiryOk ? 'This licence has expired, so it cannot be approved.' : undefined} />
        <Input label="Register reference you checked" value={ref} onChange={(e) => setRef(e.target.value)} help="e.g. the CRR number or a link to the entry" />
      </div>
      <Input label="Note (optional)" value={note} maxLength={500} onChange={(e) => setNote(e.target.value)} placeholder="e.g. Confirmed on the RCI online register" />
      <Checkbox checked={checked} onChange={(e) => setChecked(e.target.checked)}>
        I checked this licence with the issuing body, the name matches, and it is valid until the date above.
      </Checkbox>
      {err && <Alert tone="danger">{err}</Alert>}
      <div className="flex gap-2">
        <Button size="sm" onClick={approve} loading={busy} disabled={!ready}><Check className="h-4 w-4" aria-hidden /> Approve as verified</Button>
        <Button size="sm" variant="ghost" onClick={onCancel}>Cancel</Button>
      </div>
    </div>
  );
}

// ===================== activity log =====================

const ACTION_LABEL: Record<string, string> = {
  admin_login: 'Admin signed in',
  admin_login_failed: 'Failed admin sign-in',
  admin_update_features: 'Changed patient features',
  admin_update_patient_features: 'Changed one patient’s features',
  admin_view_patient: 'Viewed a patient',
  admin_clinician_verified: 'Approved a clinician (licence checked)',
  admin_clinician_rejected: 'Rejected a clinician',
  admin_clinician_pending: 'Moved a clinician to pending',
  clinician_view_session: 'Clinician viewed a shared session',
  clinician_play_audio: 'Clinician played shared audio',
  clinician_add_note: 'Clinician added a note',
  update_shares: 'Patient changed sharing',
};

export function AdminActivity() {
  const { data, error, loading } = useAsync(() => api.admin.audit());
  return (
    <>
      <AdminHeader title="Activity log" subtitle="The latest 150 recorded actions, newest first." />
      {error && <Alert tone="danger">{error}</Alert>}
      {loading ? <Spinner /> : (
        <div className="card overflow-x-auto">
          <table className="w-full min-w-[640px] text-left text-sm">
            <thead className="border-b border-line text-[13px] text-ink-muted">
              <tr><th className="px-5 py-3 font-medium">When</th><th className="px-5 py-3 font-medium">Who</th><th className="px-5 py-3 font-medium">What</th><th className="px-5 py-3 font-medium">Details</th></tr>
            </thead>
            <tbody className="divide-y divide-line">
              {data?.entries.map((e) => (
                <tr key={e.id}>
                  <td className="whitespace-nowrap px-5 py-3 text-ink-soft">{fmtDateTime(e.at)}</td>
                  <td className="px-5 py-3">{e.actor ?? <span className="text-ink-faint">Unknown</span>}{e.actorRole && <span className="ml-2"><Badge tone={e.actorRole === 'admin' ? 'warn' : 'muted'}>{e.actorRole}</Badge></span>}</td>
                  <td className={`px-5 py-3 ${e.action === 'admin_login_failed' ? 'font-medium text-danger' : ''}`}>{ACTION_LABEL[e.action] ?? e.action}</td>
                  <td className="max-w-[320px] truncate px-5 py-3 text-xs text-ink-muted" title={e.target ?? ''}>{e.target}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
