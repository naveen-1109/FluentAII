import { ClipboardList, Mic, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Alert, Badge, Button, EmptyState, PageHeader, Spinner } from '../components/ui';
import { api, ApiError } from '../lib/api';
import { ACTIVITY_LABEL, fmtDate, fmtDuration, fmtNum } from '../lib/format';
import { useAsync } from '../lib/hooks';
import type { SessionStatus } from '../lib/types';

export function StatusBadge({ s }: { s: SessionStatus }) {
  const map = {
    uploaded: ['Ready to analyse', 'info'], processing: ['Analysing…', 'warn'],
    completed: ['Analysed', 'ok'], failed: ['Failed', 'danger'],
  } as const;
  const [label, tone] = map[s];
  return <Badge tone={tone}>{label}</Badge>;
}

export default function Sessions() {
  const { data, error, loading, reload } = useAsync(() => api.sessions.list());
  const [err, setErr] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<string | null>(null);

  async function remove(id: string) {
    try {
      await api.sessions.remove(id);
      setConfirm(null);
      await reload(true);
    } catch (e) {
      setErr(e instanceof ApiError ? e.message : 'Could not delete the session.');
    }
  }

  const sessions = data?.sessions ?? [];
  return (
    <>
      <PageHeader title="My sessions" subtitle="Every recording you have saved."
        actions={<Link to="/app/record"><Button><Mic className="h-4 w-4" aria-hidden /> New recording</Button></Link>} />
      {(error || err) && <Alert tone="danger" className="mb-4">{error ?? err}</Alert>}
      {loading ? <Spinner /> : sessions.length === 0 ? (
        <EmptyState icon={<ClipboardList className="h-6 w-6" aria-hidden />} title="No sessions yet"
          action={<Link to="/app/record"><Button>Make a recording</Button></Link>}>Your recordings and their insights will be listed here.</EmptyState>
      ) : (
        <div className="card overflow-hidden">
          <div className="relative overflow-x-auto">
            <table className="w-full min-w-[640px] text-left text-sm">
              <caption className="sr-only">Your saved sessions</caption>
              <thead className="bg-surface text-xs uppercase tracking-wide text-ink-muted">
                <tr>
                  <th scope="col" className="px-5 py-3 font-medium">Session</th>
                  <th scope="col" className="px-3 py-3 font-medium">Date</th>
                  <th scope="col" className="px-3 py-3 font-medium">Length</th>
                  <th scope="col" className="px-3 py-3 font-medium">Flow</th>
                  <th scope="col" className="px-3 py-3 font-medium">Pace</th>
                  <th scope="col" className="px-3 py-3 font-medium">Status</th>
                  <th scope="col" className="px-3 py-3"><span className="sr-only">Actions</span></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {sessions.map((x) => (
                  <tr key={x.id} className="hover:bg-surface/60">
                    <td className="px-5 py-3.5">
                      <Link to={`/app/sessions/${x.id}`} className="font-medium text-ink hover:text-brand-700">{x.title}</Link>
                      <p className="text-xs text-ink-muted">{ACTIVITY_LABEL[x.activity]}{x.sharedWith ? ` · shared with ${x.sharedWith}` : ''}</p>
                    </td>
                    <td className="px-3 py-3.5 text-ink-soft">{fmtDate(x.createdAt)}</td>
                    <td className="px-3 py-3.5 tabular-nums text-ink-soft">{fmtDuration(x.durationSec)}</td>
                    <td className="px-3 py-3.5 tabular-nums">{fmtNum(x.flowIndex)}</td>
                    <td className="px-3 py-3.5 tabular-nums">{x.speechRateWpm == null ? '—' : `${fmtNum(x.speechRateWpm)} wpm`}</td>
                    <td className="px-3 py-3.5"><StatusBadge s={x.status} /></td>
                    <td className="px-3 py-3.5 text-right">
                      {confirm === x.id ? (
                        <span className="inline-flex gap-2">
                          <Button size="sm" variant="danger" onClick={() => remove(x.id)}>Delete</Button>
                          <Button size="sm" variant="secondary" onClick={() => setConfirm(null)}>Keep</Button>
                        </span>
                      ) : (
                        <button className="rounded-md p-2 text-ink-faint hover:bg-danger-soft hover:text-danger disabled:opacity-40"
                          disabled={x.status === 'processing'} onClick={() => setConfirm(x.id)} aria-label={`Delete ${x.title}`}>
                          <Trash2 className="h-4 w-4" aria-hidden />
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </>
  );
}
