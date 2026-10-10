import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { api } from './api';
import { useAuth } from './auth';

export type FeatureKey =
  | 'recording' | 'upload' | 'analysis' | 'clinicianDirectory'
  | 'consultations' | 'sessionSharing' | 'progressCharts' | 'practiceTips' | 'roadmap' | 'aiCoaching';

export interface PatientFeatures {
  features: Record<FeatureKey, boolean>;
  weeklyGoal: number;
  announcement: string;
}

const ALL_ON: PatientFeatures = {
  features: {
    recording: true, upload: true, analysis: true, clinicianDirectory: true,
    consultations: true, sessionSharing: true, progressCharts: true, practiceTips: true, roadmap: true, aiCoaching: true,
  },
  weeklyGoal: 5,
  announcement: '',
};

const Ctx = createContext<PatientFeatures>(ALL_ON);

/** Loads what the admin has switched on for the signed-in patient. The server enforces the same rules. */
export function FeaturesProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const [value, setValue] = useState<PatientFeatures>(ALL_ON);
  useEffect(() => {
    if (user?.role !== 'patient' || !user.registered) { setValue(ALL_ON); return; }
    let live = true;
    api.features.get().then((v) => live && setValue(v)).catch(() => undefined);
    return () => { live = false; };
  }, [user?.id, user?.role, user?.registered]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export const useFeatures = () => useContext(Ctx);
