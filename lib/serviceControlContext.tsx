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
};

const ServiceControlContext = createContext<ServiceControlContextValue>({
  services: [],
  eligibilityRules: [],
  isLoading: false,
  error: null,
  getServiceStatus: () => OPEN,
});

// ── Provider ──────────────────────────────────────────────────────────────

export function ServiceControlProvider({ children }: { children: React.ReactNode }) {
  const { token } = useAuth();
  const [services, setServices] = useState<ServiceControl[]>([]);
  const [eligibilityRules, setEligibilityRules] = useState<EligibilityRule[]>([]);
  const [isLoading, setIsLoading] = useState(false);
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
        const list: ServiceControl[] = Array.isArray(data)
          ? (data as ServiceControl[])
          : ((data as Record<string, unknown>)?.services as ServiceControl[] | undefined) ?? [];
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
      value={{ services, eligibilityRules, isLoading, error, getServiceStatus }}
    >
      {children}
    </ServiceControlContext.Provider>
  );
}

export function useServiceControl() {
  return useContext(ServiceControlContext);
}
