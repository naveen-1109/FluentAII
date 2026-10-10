import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Alert, Badge, Button, Input, PageHeader, SectionTitle } from '../components/ui';
import { api, ApiError } from '../lib/api';
import { useAuth } from '../lib/auth';

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
                <Badge tone={user.verification === 'verified' ? 'ok' : user.verification === 'rejected' ? 'danger' : 'warn'}>{user.verification ?? 'pending'}</Badge>
              </dd></div>
            )}
          </dl>
        </section>

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
