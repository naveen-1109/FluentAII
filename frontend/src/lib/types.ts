export type Role = 'patient' | 'clinician';

export interface User {
  id: string;
  email: string;
  role: Role;
  fullName: string;
  registered: boolean;
  verification: 'pending' | 'verified' | 'rejected' | null;
}

export type SessionStatus = 'uploaded' | 'processing' | 'completed' | 'failed';
export type Activity = 'free_speech' | 'reading' | 'breathing_exercise' | 'conversation_practice';

export interface SessionSummary {
  id: string;
  title: string;
  activity: Activity;
  status: SessionStatus;
  error: string | null;
  createdAt: string;
  processedAt: string | null;
  durationSec: number | null;
  language: string | null;
  wordCount: number | null;
  flowIndex: number | null;
  speechRateWpm: number | null;
  sharedWith: number;
}

export interface Word {
  word: string;
  start: number;
  end: number;
  probability?: number | null;
}
export interface Segment {
  start: number;
  end: number;
  text: string;
  words: Word[];
}
export interface Counted {
  text: string;
  count: number;
}
export interface Indicators {
  word_count: number;
  speech_rate_wpm_total: number | null;
  speech_rate_wpm_active: number | null;
  active_speech_sec: number;
  pause_count: number;
  total_pause_sec: number;
  longest_pause_sec: number;
  mean_pause_sec: number | null;
  repetition_count: number;
  repeated_items: Counted[];
  filler_count: number;
  filler_items: Counted[];
  flow_index: number | null;
  flow_components: Record<string, number>;
  pause_threshold_sec: number;
}

export interface SessionDetail extends SessionSummary {
  audioMime: string;
  transcript: string | null;
  indicators: Indicators | null;
  segments: Segment[] | null;
  model: { name: string; device: string; compute_type: string; stub: boolean; processing_ms?: number } | null;
}

export interface Note {
  id: string;
  body: string;
  createdAt: string;
  clinicianName: string;
}

export interface SessionResponse {
  session: SessionDetail;
  notes: Note[];
  shares?: { clinicianId: string; name: string }[];
  access: 'owner' | 'clinician';
}

export interface Clinician {
  id: string;
  fullName: string;
  title: string;
  specialty: string;
  organisation: string;
  licenseRegion: string;
  yearsExperience: number;
  languages: string;
  bio: string;
  acceptsNewPatients: boolean;
}

export type AppointmentStatus = 'requested' | 'accepted' | 'declined' | 'cancelled' | 'completed';
export type AppointmentMode = 'video' | 'phone' | 'in_person' | 'message';

export interface Appointment {
  id: string;
  patientId: string;
  clinicianId: string;
  otherName: string;
  otherDetail: string;
  requestedStart: string;
  mode: AppointmentMode;
  reason: string;
  status: AppointmentStatus;
  clinicianMessage: string;
  createdAt: string;
}

export interface ClinicianPatient {
  id: string;
  name: string;
  sharedSessions: number;
  lastSharedAt: string | null;
}
