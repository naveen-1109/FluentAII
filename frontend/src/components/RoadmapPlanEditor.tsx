import { Route } from 'lucide-react';
import { useEffect, useState } from 'react';
import { api, ApiError, type ClinicianRoadmapView, type PatientRoadmapPlan } from '../lib/api';
import { fmtDateTime } from '../lib/format';
import { useAsync } from '../lib/hooks';
import { Alert, Button, Select, Spinner, Textarea } from './ui';

const AUTO: PatientRoadmapPlan = { focus: null, stage: null, minutes: null, note: '' };

/** Clinician controls for one patient's fluency roadmap, from predefined options. */
export function RoadmapPlanEditor({ patientId, name }: { patientId: string; name: string }) {
  const { data, error, loading, setData } = useAsync(() => api.care.patientRoadmap(patientId), [patientId]);
  const [plan, setPlan] = useState<PatientRoadmapPlan>(AUTO);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ tone: 'ok' | 'danger'; text: string } | null>(null);
  useEffect(() => { if (data) setPlan(data.plan); }, [data]);

  if (loading) return <section className="card mt-6 p-6"><Spinner /></section>;
  if (error || !data) return <Alert tone="danger" className="mt-6">{error ?? 'Could not load the roadmap.'}</Alert>;
  const dirty = JSON.stringify(plan) !== JSON.stringify(data.plan);

  async function save(next: PatientRoadmapPlan) {
    setBusy(true); setMsg(null);
    try {
      const r: ClinicianRoadmapView = await api.care.savePatientRoadmap(patientId, { ...next, note: next.note.trim() });
      setData(r);
      setMsg({ tone: 'ok', text: `Saved. ${name} sees the change the next time their roadmap loads.` });
    } catch (e) { setMsg({ tone: 'danger', text: e instanceof ApiError ? e.message : 'Could not save.' }); }
    finally { setBusy(false); }
  }

  return (
    <section className="card mt-6 p-6" aria-labelledby="rm-plan">
      <div className="mb-1 flex flex-wrap items-center justify-between gap-3">
        <h2 id="rm-plan" className="flex items-center gap-2 font-semibold"><Route className="h-4 w-4 text-brand-700" aria-hidden /> {name}’s fluency roadmap</h2>
        {data.setBy && <span className="text-sm text-ink-muted">Last changed by {data.setBy.name} · {fmtDateTime(data.setBy.at)}</span>}
      </div>
      <p className="mb-5 text-sm text-ink-muted">
        “Automatic” follows {name}’s own results. Choose an option to set it yourself; {name} sees your note at the top of their roadmap.
      </p>
      {msg && <Alert tone={msg.tone} className="mb-4">{msg.text}</Alert>}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        <Select label="Focus area" value={plan.focus ?? ''} onChange={(e) => setPlan({ ...plan, focus: (e.target.value || null) as PatientRoadmapPlan['focus'] })}>
          <option value="">Automatic (from their results)</option>
          {data.focusOptions.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
        </Select>
        <Select label="Stage" value={plan.stage ?? ''} onChange={(e) => setPlan({ ...plan, stage: (e.target.value ? Number(e.target.value) : null) as PatientRoadmapPlan['stage'] })}>
          <option value="">Automatic (unlocks as targets are met)</option>
          {data.stageOptions.map((o) => <option key={o.value} value={o.value}>Stage {o.value}: {o.label}</option>)}
        </Select>
        <Select label="Session length" value={plan.minutes ?? ''} onChange={(e) => setPlan({ ...plan, minutes: e.target.value ? Number(e.target.value) : null })}>
          <option value="">Automatic (2–3 min per exercise)</option>
          {data.minuteOptions.map((m) => <option key={m} value={m}>{m} minutes per exercise</option>)}
        </Select>
      </div>
      <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-[minmax(0,1fr)_minmax(0,2fr)]">
        <Select label="Suggestion" value="" onChange={(e) => e.target.value && setPlan({ ...plan, note: e.target.value })}
          help="Pick a ready-made note, then edit it if you like.">
          <option value="">Choose a suggestion…</option>
          {data.suggestions.map((t) => <option key={t} value={t}>{t.length > 70 ? `${t.slice(0, 70)}…` : t}</option>)}
        </Select>
        <Textarea label={`Note for ${name}`} value={plan.note} maxLength={500}
          onChange={(e) => setPlan({ ...plan, note: e.target.value })} help={`${plan.note.length}/500 · leave empty for no note`} />
      </div>
      <div className="mt-5 flex flex-wrap gap-2">
        <Button onClick={() => save(plan)} loading={busy} disabled={!dirty}>Save roadmap</Button>
        <Button variant="secondary" onClick={() => { setPlan(AUTO); void save(AUTO); }}
          disabled={busy || JSON.stringify(data.plan) === JSON.stringify(AUTO)}>Reset to automatic</Button>
      </div>
    </section>
  );
}
