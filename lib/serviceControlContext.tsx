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

// ── Defaults ──────────────────────────────────────────────────────────────

const OPEN: ServiceStatus = { visible: true, available: true, displayMode: 'live' };

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
  isLoading: false,
  error: null,
  getServiceStatus: () => OPEN,
  refresh: async () => {},
});

// ── Response-shape normaliser ─────────────────────────────────────────────
// Backends commonly wrap arrays under different keys. This tries all of them
// so we work regardless of which envelope the backend uses.

function extractServiceList(data: unknown): ServiceControl[] {
  if (Array.isArray(data)) return data as ServiceControl[];

  if (data && typeof data === 'object') {
    const obj = data as Record<string, unknown>;

    // Try every common envelope key
    for (const key of ['services', 'data', 'serviceControls', 'controls', 'items', 'result']) {
      if (Array.isArray(obj[key])) return obj[key] as ServiceControl[];
    }

    // Single object with serviceType field — wrap it
    if (typeof obj.serviceType === 'string') return [obj as unknown as ServiceControl];
  }

  return [];
}

// ── Provider ──────────────────────────────────────────────────────────────

export function ServiceControlProvider({ children }: { children: React.ReactNode }) {
  const { token } = useAuth();
  const [services, setServices] = useState<ServiceControl[]>([]);
  const [eligibilityRules, setEligibilityRules] = useState<EligibilityRule[]>([]);
  // Start as true — we always fetch on mount when a token is present,
  // so the UI must wait rather than defaulting all services to OPEN.
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const socketRef = useRef<Socket | null>(null);

  // ── Initial fetch ────────────────────────────────────────────────────

  useEffect(() => {
    if (!token) {
      setServices([]);
      setEligibilityRules([]);
      return;
    }
    setIsLoading(true);
    setError(null);

    api.get<unknown>('/services/control')
      .then((data) => {
        console.log('[ServiceControl] raw response:', JSON.stringify(data));
        const list = extractServiceList(data);
        console.log('[ServiceControl] parsed', list.length, 'services:', list.map(s => `${s.serviceType}(enabled=${s.isEnabled},mode=${s.displayMode})`).join(', '));
        setServices(list);
      })
      .catch((err) => {
        console.warn('[ServiceControl] fetch failed — defaulting to open:', err);
        setError('Could not load service configuration.');
      })
      .finally(() => setIsLoading(false));
  }, [token]);

  // ── Socket — real-time updates ────────────────────────────────────────

  useEffect(() => {
    if (!token || !SOCKET_URL) return;

    const socket = io(SOCKET_URL, {
      path: '/api/socket.io',
      auth: { token },
      transports: ['polling', 'websocket'],
      reconnectionAttempts: 10,
      reconnectionDelay: 1000,
    });
    socketRef.current = socket;

    // service:control:changed — may carry full array or single entry
    socket.on(SOCKET_EVENTS.SERVICE_CONTROL_CHANGED, (payload: unknown) => {
      if (Array.isArray(payload)) {
        setServices(payload as ServiceControl[]);
      } else if (payload && typeof payload === 'object') {
        const entry = payload as ServiceControl;
        if (entry.serviceType) {
          setServices((prev) => {
            const idx = prev.findIndex((s) => s.serviceType === entry.serviceType);
            if (idx === -1) return [...prev, entry];
            const next = [...prev];
            next[idx] = { ...next[idx], ...entry };
            return next;
          });
        }
      }
    });

    // service:settings:changed — carries eligibility rules; triggers re-check
    socket.on(SOCKET_EVENTS.SERVICE_SETTINGS_CHANGED, (payload: unknown) => {
      if (Array.isArray(payload)) {
        setEligibilityRules(payload as EligibilityRule[]);
      } else if (payload && typeof payload === 'object') {
        const p = payload as Record<string, unknown>;
        // Single rule object with serviceType field
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
          // Map of serviceType → rule object
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
  }, [token]);

  // ── Refresh — re-fetch from API for freshness on screen entry ────────

  const refresh = useCallback(async (): Promise<void> => {
    if (!token) return;
    try {
      const data = await api.get<unknown>('/services/control');
      console.log('[ServiceControl] refresh raw response:', JSON.stringify(data));
      const list = extractServiceList(data);
      console.log('[ServiceControl] refresh parsed', list.length, 'services');
      setServices(list);
    } catch (err) {
      console.warn('[ServiceControl] refresh failed — keeping existing state:', err);
    }
  }, [token]);

  // ── Eligibility engine ────────────────────────────────────────────────

  const getServiceStatus = useCallback(
    (serviceType: string, driver?: DriverSnapshot | null): ServiceStatus => {
      const ctrl = services.find((s) => s.serviceType === serviceType);

      // No backend config found → default open (graceful degradation)
      if (!ctrl) return OPEN;

      // isEnabled=false → hidden entirely
      if (!ctrl.isEnabled) {
        return { visible: false, available: false, displayMode: ctrl.displayMode };
      }

      const base = { visible: true, available: false, displayMode: ctrl.displayMode };

      // Non-live display modes → blocked with reason
      if (ctrl.displayMode === 'coming_soon') {
        return { ...base, message: ctrl.message ?? 'Coming soon' };
      }
      if (ctrl.displayMode === 'unavailable') {
        return { ...base, message: ctrl.message ?? 'Currently unavailable' };
      }
      if (ctrl.displayMode === 'maintenance') {
        return { ...base, message: ctrl.message ?? 'Under maintenance', eta: ctrl.eta };
      }

      // displayMode === 'live' → check driver eligibility in real-time
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

      return { ...base, available: true };
    },
    [services, eligibilityRules],
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
