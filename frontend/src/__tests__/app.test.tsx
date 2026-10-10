import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { TranscriptView, trendPoints } from '../components/insights';
import { AuthProvider, RequireAuth } from '../lib/auth';
import { flowBand, fmtDuration } from '../lib/format';
import Login from '../pages/Login';
import type { SessionSummary } from '../lib/types';

type Handler = (url: string, init?: RequestInit) => { status?: number; body: unknown };
function mockFetch(handler: Handler) {
  const fn = vi.fn(async (url: string, init?: RequestInit) => {
    const { status = 200, body } = handler(String(url), init);
    return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
  });
  vi.stubGlobal('fetch', fn);
  return fn;
}
afterEach(() => vi.unstubAllGlobals());

const user = { id: 'u1', email: 'a@b.com', role: 'patient', fullName: 'Asha K', registered: true, verification: null };

describe('helpers', () => {
  it('bands the flow index without clinical wording', () => {
    expect(flowBand(90).label).toBe('Smooth');
    expect(flowBand(70).label).toBe('Mostly smooth');
    expect(flowBand(40).label).toBe('More effortful');
    expect(flowBand(null).label).toMatch(/Not enough/);
  });
  it('formats durations', () => {
    expect(fmtDuration(null)).toBe('—');
    expect(fmtDuration(42)).toBe('42s');
    expect(fmtDuration(125)).toBe('2m 05s');
  });
  it('builds trend points oldest-first from analysed sessions only', () => {
    const mk = (id: string, d: string, status: SessionSummary['status'], flow: number | null) =>
      ({ id, createdAt: d, status, flowIndex: flow }) as SessionSummary;
    const pts = trendPoints(
      [mk('b', '2026-02-02T00:00:00Z', 'completed', 80), mk('a', '2026-01-01T00:00:00Z', 'completed', 60),
       mk('c', '2026-03-03T00:00:00Z', 'failed', null), mk('d', '2026-04-04T00:00:00Z', 'uploaded', null)],
      (s) => s.flowIndex,
    );
    expect(pts.map((p) => p.value)).toEqual([60, 80]);
  });
});

describe('TranscriptView', () => {
  it('marks repeats, sound repeats, fillers and long pauses', () => {
    const w = (word: string, start: number, end: number) => ({ word, start, end });
    const segs = [{ start: 0, end: 4, text: '', words: [w('so', 0, 0.3), w('um', 0.4, 0.6), w('I', 0.7, 0.9), w('I', 1.0, 1.2), w('b-b-ball', 1.3, 1.8), w('goes', 3.0, 3.3)] }];
    render(<TranscriptView segments={segs} threshold={0.5} />);
    expect(screen.getAllByTitle('Repeated word')).toHaveLength(1);
    expect(screen.getByTitle('Sound repetition')).toHaveTextContent('b-b-ball');
    expect(screen.getByTitle('Filler')).toHaveTextContent('um');
    expect(screen.getByTitle(/Pause of 1\.2 seconds/)).toBeInTheDocument();
  });
});

describe('auth flows', () => {
  beforeEach(() => vi.stubGlobal('scrollTo', vi.fn()));

  it('redirects signed-out visitors from /app to the login page', async () => {
    mockFetch(() => ({ status: 401, body: { error: 'Not signed in.' } }));
    render(
      <MemoryRouter initialEntries={['/app']}>
        <AuthProvider>
          <Routes>
            <Route path="/login" element={<p>login page</p>} />
            <Route path="/app" element={<RequireAuth><p>secret</p></RequireAuth>} />
          </Routes>
        </AuthProvider>
      </MemoryRouter>,
    );
    expect(await screen.findByText('login page')).toBeInTheDocument();
    expect(screen.queryByText('secret')).not.toBeInTheDocument();
  });

  it('sends users who have not finished registration to /register', async () => {
    mockFetch(() => ({ body: { user: { ...user, registered: false } } }));
    render(
      <MemoryRouter initialEntries={['/app']}>
        <AuthProvider>
          <Routes>
            <Route path="/register" element={<p>registration page</p>} />
            <Route path="/app" element={<RequireAuth><p>secret</p></RequireAuth>} />
          </Routes>
        </AuthProvider>
      </MemoryRouter>,
    );
    expect(await screen.findByText('registration page')).toBeInTheDocument();
  });

  it('blocks a patient from clinician-only routes', async () => {
    mockFetch(() => ({ body: { user } }));
    render(
      <MemoryRouter initialEntries={['/app/patients']}>
        <AuthProvider>
          <Routes>
            <Route path="/app" element={<p>home</p>} />
            <Route path="/app/patients" element={<RequireAuth role="clinician"><p>patients list</p></RequireAuth>} />
          </Routes>
        </AuthProvider>
      </MemoryRouter>,
    );
    expect(await screen.findByText('home')).toBeInTheDocument();
  });

  it('shows the server message on a failed login and sends the CSRF header', async () => {
    const fetchMock = mockFetch((url) =>
      url.endsWith('/auth/me') ? { status: 401, body: { error: 'Not signed in.' } }
        : { status: 401, body: { error: 'Email or password is incorrect.' } });
    render(
      <MemoryRouter initialEntries={['/login']}>
        <AuthProvider><Routes><Route path="/login" element={<Login />} /></Routes></AuthProvider>
      </MemoryRouter>,
    );
    const u = userEvent.setup();
    await u.type(await screen.findByLabelText('Email'), 'asha@example.com');
    await u.type(screen.getByLabelText('Password'), 'wrong-password');
    await u.click(screen.getByRole('button', { name: 'Sign in' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Email or password is incorrect.');
    const loginCall = fetchMock.mock.calls.find(([url]) => String(url).endsWith('/auth/login'))!;
    expect((loginCall[1]!.headers as Record<string, string>)['X-Requested-With']).toBe('fluentai');
    expect(loginCall[1]!.credentials).toBe('include');
  });

  it('reports a friendly message when the server is unreachable', async () => {
    vi.stubGlobal('fetch', vi.fn(async (url: string) => {
      if (String(url).endsWith('/auth/me')) return new Response('{}', { status: 401 });
      throw new TypeError('network');
    }));
    render(
      <MemoryRouter initialEntries={['/login']}>
        <AuthProvider><Routes><Route path="/login" element={<Login />} /></Routes></AuthProvider>
      </MemoryRouter>,
    );
    const u = userEvent.setup();
    await u.type(await screen.findByLabelText('Email'), 'a@b.com');
    await u.type(screen.getByLabelText('Password'), 'whatever1');
    await u.click(screen.getByRole('button', { name: 'Sign in' }));
    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent(/Cannot reach the server/));
  });
});
