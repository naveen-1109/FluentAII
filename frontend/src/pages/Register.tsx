import { useState, type FormEvent } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { AuthShell } from '../components/AuthShell';
import { Alert, Button, Checkbox, Input, Select, Textarea } from '../components/ui';
import { ApiError, api } from '../lib/api';
import { FullPageSpinner, useAuth } from '../lib/auth';

const AGE_GROUPS = ['18-24', '25-34', '35-44', '45-54', '55-64', '65+'];

export default function Register() {
  const { user, loading, refresh, logout } = useAuth();
  const nav = useNavigate();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<{ message: string; field?: string | undefined } | null>(null);

  // patient
  const [adult, setAdult] = useState(false);
  const [age, setAge] = useState('');
  const [lang, setLang] = useState('English');
  const [goals, setGoals] = useState('');
  const [voice, setVoice] = useState(false);
  // clinician
  const [c, setC] = useState({
    title: 'Dr', specialty: 'Speech-language pathology', organisation: '', licenseNumber: '',
    licenseRegion: '', yearsExperience: '0', languages: 'English', bio: '', acceptsNewPatients: true,
  });
  const [terms, setTerms] = useState(false);

  if (loading) return <FullPageSpinner />;
  if (!user) return <Navigate to="/login" replace />;
  if (user.registered) return <Navigate to="/app" replace />;
  const patient = user.role === 'patient';

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await api.profile.save(
        patient
          ? { confirmAdult: adult, ageGroup: age, primaryLanguage: lang, goals, consentVoiceProcessing: voice, consentTerms: terms }
          : { ...c, yearsExperience: Number(c.yearsExperience) || 0, consentTerms: terms },
      );
      await refresh();
      nav('/app', { replace: true });
    } catch (err) {
      setError(err instanceof ApiError ? { message: err.message, field: err.field } : { message: 'Something went wrong. Please try again.' });
    } finally {
      setBusy(false);
    }
  }

  const ready = patient
    ? adult && !!age && lang.trim().length > 1 && voice && terms
    : terms && c.title && c.specialty && c.licenseNumber.length >= 3 && c.licenseRegion.length >= 2;

  return (
    <AuthShell
      title={patient ? 'Tell us a little about you' : 'Your professional details'}
      subtitle={patient
        ? 'Step 2 of 2. We only ask for what we need to personalise your practice.'
        : 'Step 2 of 2. We check licences before clinicians are shown to patients.'}
      footer={<>Not you? <button className="font-medium text-brand-700 hover:underline" onClick={() => logout()}>Sign out</button></>}
    >
      <form onSubmit={submit} className="space-y-5" noValidate>
        {error && <Alert tone="danger">{error.message}</Alert>}
        {patient ? (
          <>
            <Select label="Age group" value={age} onChange={(e) => setAge(e.target.value)} required>
              <option value="">Select…</option>
              {AGE_GROUPS.map((g) => <option key={g}>{g}</option>)}
            </Select>
            <Input label="Main language you speak" value={lang} onChange={(e) => setLang(e.target.value)} required />
            <Textarea label="What would you like to work on? (optional)" value={goals} maxLength={500}
              onChange={(e) => setGoals(e.target.value)} placeholder="For example: feeling more at ease on phone calls" />
            <Checkbox checked={adult} onChange={(e) => setAdult(e.target.checked)}>I am 18 or older. (This service is currently for adults only.)</Checkbox>
            <Checkbox checked={voice} onChange={(e) => setVoice(e.target.checked)}>
              I agree that FluentAI may store my recordings and process them to produce speech insights. I can delete any recording, or my whole account, at any time.
            </Checkbox>
          </>
        ) : (
          <>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-[110px_1fr]">
              <Input label="Title" value={c.title} onChange={(e) => setC({ ...c, title: e.target.value })} required />
              <Input label="Specialty" value={c.specialty} onChange={(e) => setC({ ...c, specialty: e.target.value })} required />
            </div>
            <Input label="Clinic or organisation" value={c.organisation} onChange={(e) => setC({ ...c, organisation: e.target.value })} />
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Input label="Licence / registration number" value={c.licenseNumber} onChange={(e) => setC({ ...c, licenseNumber: e.target.value })} required />
              <Input label="Registering body or region" value={c.licenseRegion} onChange={(e) => setC({ ...c, licenseRegion: e.target.value })} required />
            </div>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Input label="Years of experience" type="number" min={0} max={70} value={c.yearsExperience} onChange={(e) => setC({ ...c, yearsExperience: e.target.value })} />
              <Input label="Languages" value={c.languages} onChange={(e) => setC({ ...c, languages: e.target.value })} />
            </div>
            <Textarea label="Short bio (shown to patients)" value={c.bio} maxLength={800} onChange={(e) => setC({ ...c, bio: e.target.value })} />
            <Checkbox checked={c.acceptsNewPatients} onChange={(e) => setC({ ...c, acceptsNewPatients: e.target.checked })}>I am currently accepting new patients.</Checkbox>
          </>
        )}
        <Checkbox checked={terms} onChange={(e) => setTerms(e.target.checked)}>
          I confirm these details are accurate and I accept the terms of use.
        </Checkbox>
        <Button type="submit" size="lg" className="w-full" loading={busy} disabled={!ready}>Complete registration</Button>
      </form>
    </AuthShell>
  );
}
