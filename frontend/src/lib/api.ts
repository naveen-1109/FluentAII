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
    /** Returns `user` for patients/clinicians, or `admin` when admin credentials were used. */
    login: (b: { email: string; password: string }) => post<{ user?: User; admin?: AdminUser }>('/auth/login', b),
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
    upload: (file: Blob, title: string, activity: Activity, filename: string, source: 'recording' | 'upload' = 'upload') => {
      const f = new FormData();
      f.append('title', title);
      f.append('activity', activity);
      f.append('source', source);
      f.append('file', file, filename);
      return post<{ session: SessionSummary }>('/sessions', f);
    },
    transcribe: (id: string) => post<{ session: SessionSummary }>(`/sessions/${id}/transcribe`),
    remove: (id: string) => del<{ ok: true }>(`/sessions/${id}`),
    setShares: (id: string, clinicianIds: string[]) => put<{ ok: true }>(`/sessions/${id}/shares`, { clinicianIds }),
    addNote: (id: string, body: string) => post<{ ok: true }>(`/sessions/${id}/notes`, { body }),
    audioUrl: (id: string) => `/api/v1/sessions/${id}/audio`,
  },
  roadmap: {
    get: () => get<RoadmapResponse>('/roadmap'),
    coach: () => post<{ coaching: Coaching }>('/roadmap/coach'),
    setConsent: (consent: boolean) => put<{ consent: boolean }>('/roadmap/consent', { consent }),
  },
  features: {
    get: () => get<import('./features').PatientFeatures>('/features'),
  },
  care: {
    clinicians: (q?: string) => get<{ clinicians: Clinician[] }>(`/clinicians${q ? `?q=${encodeURIComponent(q)}` : ''}`),
    book: (b: { clinicianId: string; requestedStart: string; mode: AppointmentMode; reason: string }) =>
      post<{ id: string }>('/appointments', b),
    appointments: () => get<{ appointments: Appointment[] }>('/appointments'),
    updateAppointment: (id: string, b: { status: Exclude<AppointmentStatus, 'requested'>; clinicianMessage?: string }) =>
      patch<{ ok: true }>(`/appointments/${id}`, b),
    patients: () => get<{ patients: ClinicianPatient[] }>('/clinician/patients'),
    patientRoadmap: (id: string) => get<ClinicianRoadmapView>(`/clinician/patients/${id}/roadmap`),
    savePatientRoadmap: (id: string, b: PatientRoadmapPlan) => put<ClinicianRoadmapView>(`/clinician/patients/${id}/roadmap`, { ...b }),
    patientSessions: (id: string) =>
      get<{ patient: { name: string } | undefined; sessions: SessionSummary[] }>(`/clinician/patients/${id}/sessions`),
  },
  admin: {
    logout: () => post<{ ok: true }>('/admin/logout'),
    me: () => get<{ admin: AdminUser }>('/admin/me'),
    overview: () => get<AdminOverview>('/admin/overview'),
    features: () => get<AdminFeatureSettings>('/admin/features'),
    saveFeatures: (b: { features?: Record<string, boolean>; weeklyGoal?: number; announcement?: string }) =>
      put<AdminFeatureSettings>('/admin/features', b),
    patients: (q?: string) => get<{ patients: AdminPatientRow[] }>(`/admin/patients${q ? `?q=${encodeURIComponent(q)}` : ''}`),
    patient: (id: string) => get<AdminPatientDetail>(`/admin/patients/${id}`),
    savePatientFeatures: (id: string, b: { features?: Record<string, boolean | null>; weeklyGoal?: number | null }) =>
      put<Pick<AdminPatientDetail, 'features' | 'weeklyGoal'>>(`/admin/patients/${id}/features`, b),
    clinicians: (status?: string) => get<{ clinicians: AdminClinicianRow[] }>(`/admin/clinicians${status ? `?status=${status}` : ''}`),
    /** Approving needs `licenseExpiry` (future), `verificationRef` and `confirmChecked: true`. */
    setClinicianStatus: (
      id: string,
      b:
        | { status: 'verified'; licenseExpiry: string; verificationRef: string; confirmChecked: boolean; note?: string }
        | { status: 'pending' | 'rejected'; note?: string },
    ) => patch<{ ok: true }>(`/admin/clinicians/${id}`, b),
    audit: () => get<{ entries: AdminAuditEntry[] }>('/admin/audit'),
  },
};

export interface AdminUser { id: string; email: string; fullName: string }
export interface AdminOverview {
  patients: number; newPatientsThisWeek: number;
  clinicians: { verified: number; pending: number; expired: number; rejected: number };
  sessions: number; sessionsAnalysed: number; sessionsThisWeek: number;
  appointments: Record<string, number>; featuresOff: number; patientsWithOverrides: number;
  recentUsers: { id: string; fullName: string; email: string; role: string; registered: boolean; createdAt: string }[];
}
export interface FeatureInfo { key: string; label: string; description: string }
export interface AdminFeatureSettings { features: (FeatureInfo & { enabled: boolean })[]; weeklyGoal: number; announcement: string }
export interface AdminPatientRow {
  id: string; fullName: string; email: string; registered: boolean; createdAt: string;
  sessions: number; lastSessionAt: string | null; overrides: number;
}
export interface AdminPatientDetail {
  patient: { id: string; fullName: string; email: string; registered: boolean; createdAt: string };
  profile: { ageGroup: string; primaryLanguage: string; goals: string; consentedAt: string } | null;
  stats: { sessions: number; analysed: number; minutes: number; lastSessionAt: string | null; appointments: number };
  features: (FeatureInfo & { global: boolean; override: boolean | null; effective: boolean })[];
  weeklyGoal: { global: number; override: number | null; effective: number };
}
export interface AdminClinicianRow {
  id: string; fullName: string; email: string; createdAt: string; title: string; specialty: string; organisation: string;
  licenseNumber: string; licenseRegion: string; licenseExpiry: string | null; yearsExperience: number;
  status: 'pending' | 'verified' | 'expired' | 'rejected';
  verifiedAt: string | null; verifiedBy: string | null; verificationRef: string | null; verificationNote: string | null;
}
export interface AdminAuditEntry { id: number; action: string; target: string | null; at: string; actor: string | null; actorRole: string | null }

// ---------- fluency roadmap ----------
export type FocusKey = 'repetitions' | 'fillers' | 'pauses' | 'pace' | 'carryover';
export interface RoadmapSnapshot { flow: number | null; repsPer100: number | null; fillersPer100: number | null; longPausesPerMin: number | null; longestPause: number | null; wpm: number | null }
export interface RoadmapTechnique { key: string; name: string; how: string }
export interface RoadmapExercise { activity: Activity; technique: RoadmapTechnique; minutes: number; prompt: string }
export interface RoadmapTarget { label: string; current: number; goal: number; unit: string; done: boolean; lowerIsBetter?: boolean }
export interface RoadmapPhase {
  id: 'foundations' | 'focus' | 'carryover' | 'maintain'; title: string; summary: string;
  status: 'done' | 'current' | 'upcoming'; targets: RoadmapTarget[]; exercises: RoadmapExercise[]; tip: string;
}
export interface Roadmap {
  ready: boolean; analysed: number; weeklyGoal: number; sessionsThisWeek: number;
  baseline: RoadmapSnapshot | null; current: RoadmapSnapshot | null;
  focus: { primary: FocusKey; secondary: FocusKey | null; why: string };
  phases: RoadmapPhase[]; currentPhase: RoadmapPhase['id']; progressPct: number;
  thisWeek: { day: number; exercise: RoadmapExercise }[]; goals: string;
  autoFocus: FocusKey; autoStage: number;
  plan: { focusPinned: boolean; stagePinned: boolean; note: string; setBy: PlanAuthor | null };
}
export interface Coaching {
  source: 'ai' | 'builtin'; model?: string; generatedAt?: string; upToDate: boolean;
  summary: string; weekFocus: string; encouragement: string;
  phaseTips: Record<RoadmapPhase['id'], string>;
}
export interface RoadmapResponse {
  roadmap: Roadmap; coaching: Coaching;
  ai: { configured: boolean; enabled: boolean; consent: boolean; model: string };
}

// ---------- roadmap plan (set by the patient's clinician) ----------
export interface PatientRoadmapPlan { focus: FocusKey | null; stage: 1 | 2 | 3 | 4 | null; minutes: number | null; note: string }
export interface PlanAuthor { kind: 'clinician' | 'admin'; name: string; at: string }
export interface ClinicianRoadmapView {
  plan: PatientRoadmapPlan; setBy: PlanAuthor | null; suggestions: string[];
  focusOptions: { value: FocusKey; label: string }[]; stageOptions: { value: number; label: string }[]; minuteOptions: number[];
}
