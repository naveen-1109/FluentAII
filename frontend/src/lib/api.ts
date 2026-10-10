import type {
  Appointment, AppointmentMode, AppointmentStatus, Clinician, ClinicianPatient,
  SessionResponse, SessionSummary, User, Activity,
} from './types';

export class ApiError extends Error {
  constructor(public status: number, message: string, public field?: string) {
    super(message);
  }
}

type Json = Record<string, unknown> | unknown[];

async function request<T>(method: string, path: string, body?: Json | FormData): Promise<T> {
  const isForm = body instanceof FormData;
  let res: Response;
  try {
    res = await fetch(`/api/v1${path}`, {
      method,
      credentials: 'include',
      headers: {
        'X-Requested-With': 'fluentai',
        ...(body && !isForm ? { 'Content-Type': 'application/json' } : {}),
      },
      body: body ? (isForm ? body : JSON.stringify(body)) : undefined,
    });
  } catch {
    throw new ApiError(0, 'Cannot reach the server. Check your connection and try again.');
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new ApiError(res.status, (data as { error?: string }).error ?? 'Request failed.', (data as { field?: string }).field);
  }
  return data as T;
}

const get = <T,>(p: string) => request<T>('GET', p);
const post = <T,>(p: string, b?: Json | FormData) => request<T>('POST', p, b ?? {});
const put = <T,>(p: string, b: Json) => request<T>('PUT', p, b);
const patch = <T,>(p: string, b: Json) => request<T>('PATCH', p, b);
const del = <T,>(p: string, b?: Json) => request<T>('DELETE', p, b);

export const api = {
  auth: {
    me: () => get<{ user: User }>('/auth/me'),
    signup: (b: { fullName: string; email: string; password: string; role: string; acceptTerms: boolean }) =>
      post<{ user: User }>('/auth/signup', b),
    login: (b: { email: string; password: string }) => post<{ user: User }>('/auth/login', b),
    logout: () => post<{ ok: true }>('/auth/logout'),
    deleteAccount: (password: string) => del<{ ok: true }>('/auth/me', { password }),
  },
  profile: {
    get: () => get<{ profile: Record<string, unknown> | null }>('/profile'),
    save: (b: Record<string, unknown>) => put<{ ok: true }>('/profile', b),
  },
  sessions: {
    list: () => get<{ sessions: SessionSummary[] }>('/sessions'),
    get: (id: string) => get<SessionResponse>(`/sessions/${id}`),
    upload: (file: Blob, title: string, activity: Activity, filename: string) => {
      const f = new FormData();
      f.append('title', title);
      f.append('activity', activity);
      f.append('file', file, filename);
      return post<{ session: SessionSummary }>('/sessions', f);
    },
    transcribe: (id: string) => post<{ session: SessionSummary }>(`/sessions/${id}/transcribe`),
    remove: (id: string) => del<{ ok: true }>(`/sessions/${id}`),
    setShares: (id: string, clinicianIds: string[]) => put<{ ok: true }>(`/sessions/${id}/shares`, { clinicianIds }),
    addNote: (id: string, body: string) => post<{ ok: true }>(`/sessions/${id}/notes`, { body }),
    audioUrl: (id: string) => `/api/v1/sessions/${id}/audio`,
  },
  care: {
    clinicians: (q?: string) => get<{ clinicians: Clinician[] }>(`/clinicians${q ? `?q=${encodeURIComponent(q)}` : ''}`),
    book: (b: { clinicianId: string; requestedStart: string; mode: AppointmentMode; reason: string }) =>
      post<{ id: string }>('/appointments', b),
    appointments: () => get<{ appointments: Appointment[] }>('/appointments'),
    updateAppointment: (id: string, b: { status: Exclude<AppointmentStatus, 'requested'>; clinicianMessage?: string }) =>
      patch<{ ok: true }>(`/appointments/${id}`, b),
    patients: () => get<{ patients: ClinicianPatient[] }>('/clinician/patients'),
    patientSessions: (id: string) =>
      get<{ patient: { name: string } | undefined; sessions: SessionSummary[] }>(`/clinician/patients/${id}/sessions`),
  },
};
