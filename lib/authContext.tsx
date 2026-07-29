import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { getToken, saveToken, deleteToken, saveRefreshToken, deleteRefreshToken } from './auth';
import { endpoints } from './api';
import { stopLocationTracking } from './backgroundLocationTask';

type AuthContextType = {
  token: string | null;
  isLoading: boolean;
  login: (accessToken: string, refreshToken?: string) => Promise<void>;
  logout: () => Promise<void>;
  clearLocalSession: () => Promise<void>;
};

const AuthContext = createContext<AuthContextType | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [token, setToken] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    getToken().then((t) => {
      setToken(t);
      setIsLoading(false);
    });
  }, []);

  const login = useCallback(async (accessToken: string, refreshToken?: string) => {
    await saveToken(accessToken);
    if (refreshToken) await saveRefreshToken(refreshToken);
    setToken(accessToken);
  }, []);

  const logout = useCallback(async () => {
    // Stop background GPS task before clearing credentials so no stale
    // location updates are sent after the session ends.
    await stopLocationTracking();
    try {
      await endpoints.auth.logout();
    } catch {
      // Server logout failed (network/offline) — local logout must still complete.
    }
    await deleteToken();
    await deleteRefreshToken();
    setToken(null);
  }, []);

  const clearLocalSession = useCallback(async () => {
    // Force-disconnect must not make a backend request. Stop local tracking
    // and clear credentials so the socket cannot be recreated.
    await stopLocationTracking();
    await deleteToken();
    await deleteRefreshToken();
    setToken(null);
  }, []);

  // Memoized: an inline object literal here would re-render every useAuth()
  // consumer on every AuthProvider render, regardless of whether token/
  // isLoading actually changed.
  const value = useMemo(
    () => ({ token, isLoading, login, logout, clearLocalSession }),
    [token, isLoading, login, logout, clearLocalSession],
  );

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider');
  return ctx;
}
