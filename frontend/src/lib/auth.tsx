import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { api, ApiError } from './api';
import type { Role, User } from './types';

interface AuthState {
  user: User | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<User>;
  signup: (b: { fullName: string; email: string; password: string; role: Role }) => Promise<User>;
  logout: () => Promise<void>;
  refresh: () => Promise<User | null>;
}

const Ctx = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    try {
      const { user } = await api.auth.me();
      setUser(user);
      return user;
    } catch (e) {
      if (!(e instanceof ApiError) || e.status !== 401) console.warn(e);
      setUser(null);
      return null;
    }
  }, []);

  useEffect(() => {
    refresh().finally(() => setLoading(false));
  }, [refresh]);

  const value = useMemo<AuthState>(
    () => ({
      user,
      loading,
      refresh,
      login: async (email, password) => {
        const { user } = await api.auth.login({ email, password });
        setUser(user);
        return user;
      },
      signup: async (b) => {
        const { user } = await api.auth.signup({ ...b, acceptTerms: true });
        setUser(user);
        return user;
      },
      logout: async () => {
        await api.auth.logout().catch(() => undefined);
        setUser(null);
      },
    }),
    [user, loading, refresh],
  );
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useAuth(): AuthState {
  const v = useContext(Ctx);
  if (!v) throw new Error('useAuth must be used inside <AuthProvider>');
  return v;
}

/** Guards a route: signed in, and (optionally) registered and of a given role. */
export function RequireAuth({ children, role }: { children: ReactNode; role?: Role }) {
  const { user, loading } = useAuth();
  const loc = useLocation();
  if (loading) return <FullPageSpinner />;
  if (!user) return <Navigate to="/login" replace state={{ from: loc.pathname }} />;
  if (!user.registered) return <Navigate to="/register" replace />;
  if (role && user.role !== role) return <Navigate to="/app" replace />;
  return <>{children}</>;
}

export function FullPageSpinner() {
  return (
    <div className="grid min-h-screen place-items-center" role="status" aria-live="polite">
      <div className="h-8 w-8 animate-spin rounded-full border-2 border-brand-200 border-t-brand-700" />
      <span className="sr-only">Loading…</span>
    </div>
  );
}
