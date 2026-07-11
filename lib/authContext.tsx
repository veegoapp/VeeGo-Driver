import React, { createContext, useContext, useEffect, useState } from 'react';
import { getToken, saveToken, deleteToken, saveRefreshToken, deleteRefreshToken } from './auth';
import { endpoints } from './api';
import { stopLocationTracking } from './backgroundLocationTask';

type AuthContextType = {
  token: string | null;
  isLoading: boolean;
  login: (accessToken: string, refreshToken?: string) => Promise<void>;
  logout: () => Promise<void>;
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

  const login = async (accessToken: string, refreshToken?: string) => {
    await saveToken(accessToken);
    if (refreshToken) await saveRefreshToken(refreshToken);
    setToken(accessToken);
  };

  const logout = async () => {
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
  };

  return (
    <AuthContext.Provider value={{ token, isLoading, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider');
  return ctx;
}
