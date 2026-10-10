import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Alert, Badge, Button, Input, PageHeader, SectionTitle, VerifiedBadge } from '../components/ui';
import { api, ApiError } from '../lib/api';
import { useAuth } from '../lib/auth';
import { useAsync } from '../lib/hooks';

export default function Settings() {
  const { user, logout } = useAuth();
  const nav = useNavigate();
  const [confirming, setConfirming] = useState(false);
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  if (!user) return null;

  async function del() {
    setBusy(true); setErr(null);
    try {
      await api.auth.deleteAccount(password);
      await logout();
      nav('/', { replace: true });
    } catch (e) {
      setErr(e instanceof ApiError ? e.message : 'Could not delete the account.');
      setBusy(false);
    }
  }

  return (
    <>
      <PageHeader title="Account" subtitle="Your details and privacy controls." />
      <div className="max-w-2xl space-y-6">
        <section className="card p-6">
          <SectionTitle>Details</SectionTitle>
          <dl className="grid grid-cols-1 gap-4 text-sm sm:grid-cols-2">
            <div><dt className="text-ink-muted">Name</dt><dd className="font-medium">{user.fullName}</dd></div>
            <div><dt className="text-ink-muted">Email</dt><dd className="font-medium">{user.email}</dd></div>
            <div><dt className="text-ink-muted">Account type</dt><dd className="font-medium capitalize">{user.role}</dd></div>
            {user.role === 'clinician' && (
              <div><dt className="text-ink-muted">Verification</dt><dd>
                {user.verification === 'verified'
                  ? <VerifiedBadge size="md" />
                  : <Badge tone={user.verification === 'rejected' || user.verification === 'expired' ? 'danger' : 'warn'}>{user.verification === 'expired' ? 'licence expired' : user.verification ?? 'pending'}</Badge>}
              </dd></div>
            )}
          </dl>
        </section>

        {user.role === 'clinician' && <LicenceCard />}

        <section className="card border-danger/30 p-6">
          <SectionTitle>Delete my account</SectionTitle>
          <p className="text-sm leading-relaxed text-ink-muted">
            This permanently removes your profile{user.role === 'patient' ? ', all recordings, transcripts, results and sharing settings' : ' and your consultation history'}. It cannot be undone.
          </p>
          {!confirming ? (
            <Button className="mt-4" variant="secondary" onClick={() => setConfirming(true)}>Delete my account…</Button>
          ) : (
            <div className="mt-4 max-w-sm space-y-4">
              <Input label="Confirm with your password" type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} />
              {err && <Alert tone="danger">{err}</Alert>}
              <div className="flex gap-3">
                <Button variant="danger" onClick={del} loading={busy} disabled={!password}>Permanently delete</Button>
                <Button variant="ghost" onClick={() => { setConfirming(false); setPassword(''); setErr(null); }}>Cancel</Button>
              </div>
            </div>
          )}
        </section>
      </div>
    </>
  );
}

const todayIso = () => new Date().toISOString().slice(0, 10);

/** Clinicians see their licence details and can enter a renewed licence (which needs a fresh admin check). */
function LicenceCard() {
  const { refresh } = useAuth();
  const prof = useAsync(() => api.profile.get());
  const p = prof.data?.profile as Record<string, any> | null | undefined;
  const [form, setForm] = useState({ licenseNumber: '', licenseRegion: '', licenseExpiry: '' });
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ tone: 'ok' | 'danger'; text: string } | null>(null);
  useEffect(() => {
    if (p) setForm({ licenseNumber: p.licenseNumber ?? '', licenseRegion: p.licenseRegion ?? '', licenseExpiry: p.licenseExpiry ?? '' });
  }, [p?.licenseNumber, p?.licenseRegion, p?.licenseExpiry]); // eslint-disable-line react-hooks/exhaustive-deps
  if (prof.loading || !p) return null;

  const changed = form.licenseNumber !== (p.licenseNumber ?? '') || form.licenseRegion !== (p.licenseRegion ?? '') || form.licenseExpiry !== (p.licenseExpiry ?? '');
  const expiryOk = !!form.licenseExpiry && form.licenseExpiry > todayIso();

  async function save() {
    setBusy(true); setMsg(null);
    try {
      await api.profile.save({
        title: p!.title, specialty: p!.specialty, organisation: p!.organisation, yearsExperience: p!.yearsExperience,
        languages: p!.languages, bio: p!.bio, acceptsNewPatients: p!.acceptsNewPatients, consentTerms: true, ...form,
      });
      await prof.reload(true);
      await refresh();
      setMsg({ tone: 'ok', text: 'Saved. FluentAI will check the new licence before your Verified badge returns.' });
    } catch (e) { setMsg({ tone: 'danger', text: e instanceof ApiError ? e.message : 'Could not save.' }); }
    finally { setBusy(false); }
  }

  return (
    <section className="card p-6">
      <SectionTitle aside={p.verificationStatus === 'verified' ? <VerifiedBadge since={p.verifiedAt} /> : undefined}>Licence</SectionTitle>
      <p className="mb-4 text-sm text-ink-muted">
        Patients only see clinicians whose licence FluentAI has checked and which has not expired. Changing these details sends your licence for a new check.
      </p>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Input label="Licence / registration number" value={form.licenseNumber} onChange={(e) => setForm({ ...form, licenseNumber: e.target.value })} />
        <Input label="Issuing body" value={form.licenseRegion} onChange={(e) => setForm({ ...form, licenseRegion: e.target.value })} />
        <Input label="Valid until" type="date" min={todayIso()} value={form.licenseExpiry} onChange={(e) => setForm({ ...form, licenseExpiry: e.target.value })}
          error={form.licenseExpiry && !expiryOk ? 'This date has passed. Enter the expiry of your current licence.' : undefined} />
      </div>
      {msg && <Alert tone={msg.tone} className="mt-4">{msg.text}</Alert>}
      {changed && <Button className="mt-4" onClick={save} loading={busy} disabled={!expiryOk || form.licenseNumber.trim().length < 3}>Save and send for checking</Button>}
    </section>
  );
}
