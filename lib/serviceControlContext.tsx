import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from 'react';
import { io, Socket } from 'socket.io-client';
import { useAuth } from './authContext';
import { api } from './api';
import { SOCKET_EVENTS } from '../constants/socketEvents';

// ── Types ─────────────────────────────────────────────────────────────────

export type DisplayMode = 'live' | 'coming_soon' | 'unavailable' | 'maintenance';

export interface ServiceControl {
  serviceType: string;
  isEnabled: boolean;
  displayMode: DisplayMode;
  message?: string;
  eta?: string;
}

export interface EligibilityRule {
  serviceType: string;
  minimumRating?: number;
  requiresLicense?: boolean;
  requiresInsurance?: boolean;
  [key: string]: unknown;
}

export interface DriverSnapshot {
  rating?: number;
  licenseVerified?: boolean;
  insuranceVerified?: boolean;
}

export interface ServiceStatus {
  visible: boolean;
  available: boolean;
  displayMode: DisplayMode;
  message?: string;
  eta?: string;
  ineligibilityReason?: string;
}

// ── Fail-secure defaults ───────────────────────────────────────────────────
// These are used whenever the backend has NOT explicitly confirmed a service
// is open. No service can ever default to available — only explicit backend
// approval can make a service available.

/** Backend data is still loading — block all interaction. */
const LOADING_BLOCKED: ServiceStatus = {
  visible: true,
  available: false,
  displayMode: 'unavailable',
  message: 'Checking availability…',
};

/** Fetch failed — backend state unknown, treat as unavailable. */
const ERROR_BLOCKED: ServiceStatus = {
  visible: true,
  available: false,
  displayMode: 'unavailable',
  message: 'Service unavailable',
};

/** Service exists in the app but has no backend config — hide and block it. */
const CONFIG_BLOCKED: ServiceStatus = {
  visible: false,
  available: false,
  displayMode: 'unavailable',
};

// ── Socket URL (same derivation as useRideSocket) ─────────────────────────

const _rawApiUrl = process.env.EXPO_PUBLIC_API_URL ?? '';
const _apiBase = _rawApiUrl.startsWith('http') ? _rawApiUrl : `https://${_rawApiUrl}`;
const SOCKET_URL = _apiBase.replace(/\/api\/?$/, '');

// ── Context ───────────────────────────────────────────────────────────────

type ServiceControlContextValue = {
  services: ServiceControl[];
  eligibilityRules: EligibilityRule[];
  isLoading: boolean;
  error: string | null;
  getServiceStatus: (serviceType: string, driver?: DriverSnapshot | null) => ServiceStatus;
  /** Re-fetch /services/control from the API — call on screen entry for freshness. */
  refresh: () => Promise<void>;
};

const ServiceControlContext = createContext<ServiceControlContextValue>({
  services: [],
  eligibilityRules: [],
  isLoading: true,
  error: null,
  // Safe default: block everything until a real Provider is mounted.
  getServiceStatus: () => LOADING_BLOCKED,
  refresh: async () => {},
});

// ── Frontend → backend serviceType normalisation ──────────────────────────
// Frontend uses uppercase enum keys (CAR, MOTOR, SHUTTLE, DELIVERY).
// Backend returns lowercase strings ('car', 'shuttle', 'delivery', 'scooter').
// MOTOR is a special case — it maps to 'scooter' on the backend.

const FRONTEND_TO_BACKEND_MAP: Record<string, string> = {
  MOTOR: 'scooter',
};

function normalizeToBackendType(type: string): string {
  const upper = type.toUpperCase();
  return FRONTEND_TO_BACKEND_MAP[upper] ?? type.toLowerCase();
}

// ── Response-shape normaliser ─────────────────────────────────────────────

function extractServiceList(data: unknown): ServiceControl[] {
  if (Array.isArray(data)) return data as ServiceControl[];

  if (data && typeof data === 'object') {
    const obj = data as Record<string, unknown>;

    for (const key of ['services', 'data', 'serviceControls', 'controls', 'items', 'result']) {
      if (Array.isArray(obj[key])) return obj[key] as ServiceControl[];
    }

    if (typeof obj.serviceType === 'string') return [obj as unknown as ServiceControl];
  }

  return [];
}

// ── Provider ──────────────────────────────────────────────────────────────

export function ServiceControlProvider({ children }: { children: React.ReactNode }) {
  const { token, isLoading: authIsLoading } = useAuth();
  const [services, setServices] = useState<ServiceControl[]>([]);
  const [eligibilityRules, setEligibilityRules] = useState<EligibilityRule[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const socketRef = useRef<Socket | null>(null);

  // ── Initial fetch ─────────────────────────────────────────────────────
  // CRITICAL: do NOT fetch until auth has fully resolved.

  useEffect(() => {
    if (authIsLoading) return;

    if (!token) {
      setServices([]);
      setEligibilityRules([]);
      setIsLoading(false);
      setError(null);
      return;
    }

    console.log('[Auth] token detected');
    console.log('[ServiceControl] fetching services after login');
    setIsLoading(true);
    setError(null);

    console.log('[SERVICE_DEBUG] FETCH START');
    api.get<unknown>('/services/control')
      .then((data) => {
        const response = data;
        console.log('[SERVICE_DEBUG] RAW RESPONSE:', response);
        console.log('[SERVICE_DEBUG] SERVICE TYPES:', Array.isArray(response)
          ? (response as any[]).map((s: any) => s.serviceType)
          : (response as any)?.data?.map((s: any) => s.serviceType));
        const list = extractServiceList(data);
        const parsedServices = list;
        console.log('[SERVICE_DEBUG] PARSED SERVICES:', parsedServices);
        console.log('[SERVICE_DEBUG] FETCH SUCCESS');
        console.log(
          '[ServiceControl] services loaded successfully —',
          list.length, 'service(s):',
          list.map(s => `${s.serviceType}(enabled=${s.isEnabled},mode=${s.displayMode})`).join(', '),
        );
        setServices(list);
      })
      .catch((err) => {
        console.log('[SERVICE_DEBUG] FETCH FAILED', err);
        console.warn('[ServiceControl] fetch failed — entering error state:', err);
        setError('Could not load service configuration.');
        // Keep services = [] so getServiceStatus returns ERROR_BLOCKED for everything.
        setServices([]);
      })
      .finally(() => setIsLoading(false));
  }, [token, authIsLoading]);

  // ── Socket — real-time patches ────────────────────────────────────────
  // CRITICAL: only connects after auth is established.
  // Socket events patch existing services — they never reset to open.

  useEffect(() => {
    if (authIsLoading || !token || !SOCKET_URL) return;

    const socket = io(SOCKET_URL, {
      path: '/api/socket.io',
      auth: { token },
      transports: ['polling', 'websocket'],
      reconnectionAttempts: 10,
      reconnectionDelay: 1000,
    });
    socketRef.current = socket;
    console.log('[Socket] authenticated connection established');

    socket.on(SOCKET_EVENTS.SERVICE_CONTROL_CHANGED, (payload: unknown) => {
      // Socket patches only apply after the initial REST load has settled.
      // This prevents socket events from overriding the loading/error state.
      setServices((prev) => {
        // If we have no services yet (still loading or errored), ignore the patch.
        // The REST response is the source of truth on connect.
        if (prev.length === 0) return prev;

        if (Array.isArray(payload)) {
          return payload as ServiceControl[];
        }
        if (payload && typeof payload === 'object') {
          const entry = payload as ServiceControl;
          if (entry.serviceType) {
            const idx = prev.findIndex((s) => s.serviceType === entry.serviceType);
            if (idx === -1) return [...prev, entry];
            const next = [...prev];
            next[idx] = { ...next[idx], ...entry };
            return next;
          }
        }
        return prev;
      });
    });

    socket.on(SOCKET_EVENTS.SERVICE_SETTINGS_CHANGED, (payload: unknown) => {
      if (Array.isArray(payload)) {
        setEligibilityRules(payload as EligibilityRule[]);
      } else if (payload && typeof payload === 'object') {
        const p = payload as Record<string, unknown>;
        if (typeof p.serviceType === 'string') {
          const rule = p as EligibilityRule;
          setEligibilityRules((prev) => {
            const idx = prev.findIndex((r) => r.serviceType === rule.serviceType);
            if (idx === -1) return [...prev, rule];
            const next = [...prev];
            next[idx] = { ...next[idx], ...rule };
            return next;
          });
        } else {
          const entries = Object.entries(p)
            .filter(([, v]) => v && typeof v === 'object')
            .map(([type, v]) => ({ ...(v as object), serviceType: type } as EligibilityRule));
          if (entries.length) setEligibilityRules(entries);
        }
      }
    });

    return () => {
      socket.disconnect();
      socketRef.current = null;
    };
  }, [token, authIsLoading]);

  // ── Refresh — re-fetch on screen entry ───────────────────────────────

  const refresh = useCallback(async (): Promise<void> => {
    if (authIsLoading || !token) return;
    try {
      console.log('[SERVICE_DEBUG] FETCH START (refresh)');
      const data = await api.get<unknown>('/services/control');
      const response = data;
      console.log('[SERVICE_DEBUG] RAW RESPONSE (refresh):', response);
      console.log('[SERVICE_DEBUG] SERVICE TYPES (refresh):', Array.isArray(response)
        ? (response as any[]).map((s: any) => s.serviceType)
        : (response as any)?.data?.map((s: any) => s.serviceType));
      const list = extractServiceList(data);
      const parsedServices = list;
      console.log('[SERVICE_DEBUG] PARSED SERVICES (refresh):', parsedServices);
      console.log('[SERVICE_DEBUG] FETCH SUCCESS (refresh)');
      console.log('[ServiceControl] services loaded successfully —', list.length, 'service(s) (refresh)');
      setServices(list);
      setError(null);
    } catch (err) {
      console.log('[SERVICE_DEBUG] FETCH FAILED (refresh)', err);
      console.warn('[ServiceControl] refresh failed — entering error state:', err);
      setError('Could not load service configuration.');
      setServices([]);
    }
  }, [token, authIsLoading]);

  // ── Eligibility engine — FAIL-SECURE ─────────────────────────────────
  // This is the single source of truth for all service availability decisions.
  // It MUST close over isLoading and error so callers never need to check them
  // separately — the result is always deterministic and safe.

  const getServiceStatus = useCallback(
    (serviceType: string, driver?: DriverSnapshot | null): ServiceStatus => {

      // ── Layer 1: Loading lock ─────────────────────────────────────────
      // Backend state has not been confirmed yet. Block everything.
      if (isLoading) return LOADING_BLOCKED;

      // ── Layer 2: Error lock ───────────────────────────────────────────
      // Fetch failed — we do not know what is enabled. Block everything.
      if (error) return ERROR_BLOCKED;

      // ── Layer 3: Config check ─────────────────────────────────────────
      // No backend config for this service — hide and block it.
      // FAIL-SECURE: missing config is never treated as "open".
      // Normalise the caller's serviceType (e.g. 'SHUTTLE' → 'shuttle',
      // 'MOTOR' → 'scooter') before comparing against backend strings.
      const backendType = normalizeToBackendType(serviceType);
      const ctrl = services.find((s) => s.serviceType.toLowerCase() === backendType);
      console.log('[SERVICE_MATCH]', ctrl ?? `no match for "${backendType}" in`, services.map(s => s.serviceType));
      if (!ctrl) return CONFIG_BLOCKED;

      // ── Layer 4: Enabled check ────────────────────────────────────────
      if (!ctrl.isEnabled) {
        return { visible: false, available: false, displayMode: ctrl.displayMode };
      }

      const base = { visible: true, available: false, displayMode: ctrl.displayMode };

      // ── Layer 5: Display mode check ───────────────────────────────────
      if (ctrl.displayMode === 'coming_soon') {
        return { ...base, message: ctrl.message ?? 'Coming soon' };
      }
      if (ctrl.displayMode === 'unavailable') {
        return { ...base, message: ctrl.message ?? 'Currently unavailable' };
      }
      if (ctrl.displayMode === 'maintenance') {
        return { ...base, message: ctrl.message ?? 'Under maintenance', eta: ctrl.eta };
      }

      // ── Layer 6: Driver eligibility ───────────────────────────────────
      // Only reached when displayMode === 'live' AND isEnabled === true.
      const rule = eligibilityRules.find((r) => r.serviceType === serviceType);
      if (rule && driver) {
        if (
          rule.minimumRating !== undefined &&
          driver.rating !== undefined &&
          driver.rating < rule.minimumRating
        ) {
          return {
            ...base,
            ineligibilityReason: `Requires ${rule.minimumRating.toFixed(1)}★ rating (yours: ${driver.rating.toFixed(1)})`,
          };
        }
        if (rule.requiresLicense && driver.licenseVerified === false) {
          return { ...base, ineligibilityReason: 'Verified license required' };
        }
        if (rule.requiresInsurance && driver.insuranceVerified === false) {
          return { ...base, ineligibilityReason: 'Verified insurance required' };
        }
      }

      // ── Layer 7: Explicit backend approval ────────────────────────────
      // Only reachable if: not loading, not errored, config exists,
      // isEnabled=true, displayMode='live', and all eligibility checks pass.
      return { ...base, available: true };
    },
    [services, eligibilityRules, isLoading, error],
  );

  return (
    <ServiceControlContext.Provider
      value={{ services, eligibilityRules, isLoading, error, getServiceStatus, refresh }}
    >
      {children}
    </ServiceControlContext.Provider>
  );
}

export function useServiceControl() {
  return useContext(ServiceControlContext);
}
