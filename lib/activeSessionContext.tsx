/**
 * ActiveSessionContext — centralized driver session state.
 *
 * Responsibilities (foundation layer only):
 *   - Exposes the current DriverActiveSession (ride or shuttle_trip) to any
 *     descendant that calls useActiveSession().
 *   - Fetches GET /api/driver/session on demand via initializeActiveSession()
 *     and refreshActiveSession().
 *   - Listens for the session:snapshot socket event (emitted automatically on
 *     every connect/reconnect and on server-side session termination) and
 *     applies the received snapshot — overwriting any stale local state.
 *
 * This provider does NOT touch existing ride/shuttle recovery flows.
 * Screen-level migration happens in a later phase.
 */

import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
} from 'react';
import { endpoints } from '@/lib/api';
import { useSocket } from '@/lib/socketContext';
import { SOCKET_EVENTS } from '@/constants/socketEvents';
import type { DriverActiveSession } from '@/lib/activeSession/types';

// ─── Context type ─────────────────────────────────────────────────────────────

type ActiveSessionContextValue = {
  /** The driver's current active session, or null if none. */
  session: DriverActiveSession | null;
  /** True while a REST fetch is in flight. */
  loading: boolean;
  /** Last fetch error, if any. Previous session is retained on error. */
  error: Error | null;
  /**
   * True after the first fetch (or first socket snapshot) completes —
   * regardless of whether a session exists. Guards screens from acting on
   * a null session before the first load has resolved.
   */
  initialized: boolean;
  /** Call once after authentication to perform the initial session load. */
  initializeActiveSession: () => Promise<void>;
  /** Re-fetch the session without resetting the initialized flag. */
  refreshActiveSession: () => Promise<void>;
  /** Immediately clear session state (e.g. after local logout). */
  clearActiveSession: () => void;
};

// ─── Context + defaults ───────────────────────────────────────────────────────

const ActiveSessionContext = createContext<ActiveSessionContextValue>({
  session: null,
  loading: false,
  error: null,
  initialized: false,
  initializeActiveSession: async () => {},
  refreshActiveSession: async () => {},
  clearActiveSession: () => {},
});

// ─── Provider ─────────────────────────────────────────────────────────────────

export function ActiveSessionProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const { socket } = useSocket();

  const [session, setSession] = useState<DriverActiveSession | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const [initialized, setInitialized] = useState(false);

  // ── REST fetch ─────────────────────────────────────────────────────────────

  const fetchSession = useCallback(async (isInit: boolean) => {
    setLoading(true);
    try {
      const response = await endpoints.session.driverSession();
      // Unwrap envelope: { data: DriverActiveSession | null }
      const data =
        (response as { data?: DriverActiveSession | null } | null)?.data ??
        null;
      setSession(data);
      setError(null);
    } catch (err) {
      // On failure retain the previous session so the driver is not
      // incorrectly kicked out of an active ride/trip.
      setError(
        err instanceof Error ? err : new Error('Failed to fetch driver session'),
      );
      if (__DEV__) {
        console.warn('[ActiveSession] fetch failed:', err);
      }
    } finally {
      setLoading(false);
      if (isInit) setInitialized(true);
    }
  }, []);

  const initializeActiveSession = useCallback(
    () => fetchSession(true),
    [fetchSession],
  );

  const refreshActiveSession = useCallback(
    () => fetchSession(false),
    [fetchSession],
  );

  const clearActiveSession = useCallback(() => {
    setSession(null);
    setError(null);
  }, []);

  // ── Socket: session:snapshot ───────────────────────────────────────────────
  // The backend emits this event automatically on every connect/reconnect and
  // whenever a session is server-side terminated ({ data: null }).
  // No client-side emit is required to trigger it.

  useEffect(() => {
    if (!socket) return;

    const handleSnapshot = (payload: unknown) => {
      if (!payload || typeof payload !== 'object') {
        if (__DEV__) {
          console.warn('[ActiveSession] session:snapshot received unexpected payload:', payload);
        }
        return;
      }

      const { data } = payload as { data?: DriverActiveSession | null };

      if (data === undefined) {
        if (__DEV__) {
          console.warn('[ActiveSession] session:snapshot payload missing `data` field');
        }
        return;
      }

      if (data === null) {
        // Server signals the session has been terminated.
        setSession(null);
        setError(null);
      } else {
        // Server provides a complete authoritative snapshot — apply it,
        // overwriting any stale local state.
        setSession(data);
        setError(null);
      }

      // Mark initialized on the first snapshot regardless of whether
      // initializeActiveSession() has been explicitly called yet.
      setInitialized(true);
    };

    socket.on(SOCKET_EVENTS.SESSION_SNAPSHOT, handleSnapshot);
    return () => {
      socket.off(SOCKET_EVENTS.SESSION_SNAPSHOT, handleSnapshot);
    };
  }, [socket]);

  // ── Context value ──────────────────────────────────────────────────────────

  const value: ActiveSessionContextValue = {
    session,
    loading,
    error,
    initialized,
    initializeActiveSession,
    refreshActiveSession,
    clearActiveSession,
  };

  return (
    <ActiveSessionContext.Provider value={value}>
      {children}
    </ActiveSessionContext.Provider>
  );
}

// ─── Consumer hook ────────────────────────────────────────────────────────────

export function useActiveSession(): ActiveSessionContextValue {
  return useContext(ActiveSessionContext);
}
