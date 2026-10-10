import { Stethoscope, UserRound } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { Link, Navigate, useNavigate } from 'react-router-dom';
import { AuthShell } from '../components/AuthShell';
import { Alert, Button, Checkbox, Input } from '../components/ui';
import { ApiError } from '../lib/api';
import { useAuth } from '../lib/auth';
import type { Role } from '../lib/types';

export default function Signup() {
  const { user, signup } = useAuth();
  const nav = useNavigate();
  const [role, setRole] = useState<Role>('patient');
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [terms, setTerms] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (user) return <Navigate to={user.registered ? '/app' : '/register'} replace />;

  const pwOk = password.length >= 8;
  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!pwOk || !terms) return;
    setBusy(true);
    setError(null);
    try {
      await signup({ fullName: fullName.trim(), email: email.trim(), password, role });
      nav('/register', { replace: true });
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Something went wrong. Please try again.');
    } finally {
      setBusy(false);
    }
  }

  const RoleCard = ({ value, title, text, Icon }: { value: Role; title: string; text: string; Icon: typeof UserRound }) => (
    <label className={`flex cursor-pointer gap-3 rounded-xl border p-4 transition ${role === value ? 'border-brand-600 bg-brand-50 ring-1 ring-brand-600' : 'border-line-strong bg-white hover:bg-surface-sunken'}`}>
      <input type="radio" name="role" value={value} checked={role === value} onChange={() => setRole(value)} className="sr-only" />
      <Icon className="mt-0.5 h-5 w-5 shrink-0 text-brand-700" aria-hidden />
      <span><span className="block text-[15px] font-semibold">{title}</span><span className="block text-[13px] text-ink-muted">{text}</span></span>
    </label>
  );

  return (
    <AuthShell
      title="Create your account"
      subtitle="Step 1 of 2. You will add a few details on the next page."
      footer={<>Already have an account? <Link className="font-medium text-brand-700 hover:underline" to="/login">Sign in</Link></>}
    >
      <form onSubmit={submit} className="space-y-5" noValidate>
        {error && <Alert tone="danger">{error}</Alert>}
        <fieldset>
          <legend className="label">I am joining as</legend>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <RoleCard value="patient" title="Someone who stutters" text="Practise and track progress" Icon={UserRound} />
            <RoleCard value="clinician" title="A healthcare professional" text="Support and review patients" Icon={Stethoscope} />
          </div>
        </fieldset>
        <Input label="Full name" autoComplete="name" required value={fullName} onChange={(e) => setFullName(e.target.value)} />
        <Input label="Email" type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
        <Input label="Password" type="password" autoComplete="new-password" required value={password}
          onChange={(e) => setPassword(e.target.value)} help="At least 8 characters." error={password && !pwOk ? 'Use at least 8 characters.' : undefined} />
        <Checkbox checked={terms} onChange={(e) => setTerms(e.target.checked)}>
          I agree to the terms of use and privacy notice, and I understand FluentAI provides practice insights and does not give medical advice.
        </Checkbox>
        <Button type="submit" size="lg" className="w-full" loading={busy} disabled={!fullName.trim() || !email || !pwOk || !terms}>Continue</Button>
      </form>
    </AuthShell>
  );
}
