import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
} from 'react';
import { z } from 'zod';
import { useAuth } from './authContext';
import { api } from './api';
import { useSocket } from './socketContext';
import { SOCKET_EVENTS } from '../constants/socketEvents';

const ServiceControlSchema = z.object({
  serviceType: z.string(),
  isEnabled: z.boolean(),
  displayMode: z.enum(['live', 'coming_soon', 'unavailable', 'maintenance']),
  message: z.string().optional(),
  eta: z.string().optional(),
}).passthrough();

const ServiceControlEventSchema = z.union([
  z.array(ServiceControlSchema),
  ServiceControlSchema,
]);

const EligibilityRuleSchema = z.object({
  serviceType: z.string(),
}).passthrough();

const ServiceSettingsEventSchema = z.union([
  z.array(EligibilityRuleSchema),
  z.object({ serviceType: z.string() }).passthrough(),
  z.record(z.unknown()),
]);

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

const LOADING_BLOCKED: ServiceStatus = {
  visible: true,
  available: false,
  displayMode: 'unavailable',
  message: 'Checking availability…',
};

const ERROR_BLOCKED: ServiceStatus = {
  visible: true,
  available: false,
  displayMode: 'unavailable',
  message: 'Service unavailable',
};

const CONFIG_BLOCKED: ServiceStatus = {
  visible: false,
  available: false,
  displayMode: 'unavailable',
};

// ── Context ───────────────────────────────────────────────────────────────

export interface CurrencyConfig {
  code: string;
  symbol: string;
  symbolAr: string;
}

const DEFAULT_CURRENCY: CurrencyConfig = { code: 'EGP', symbol: 'EGP', symbolAr: 'ج.م' };

type ServiceControlContextValue = {
  services: ServiceControl[];
  eligibilityRules: EligibilityRule[];
  currency: CurrencyConfig;
  isLoading: boolean;
  error: string | null;
  getServiceStatus: (serviceType: string, driver?: DriverSnapshot | null) => ServiceStatus;
  refresh: () => Promise<void>;
};

const ServiceControlContext = createContext<ServiceControlContextValue>({
  services: [],
  eligibilityRules: [],
  currency: DEFAULT_CURRENCY,
  isLoading: true,
  error: null,
  getServiceStatus: () => LOADING_BLOCKED,
  refresh: async () => {},
});

// ── Frontend → backend serviceType normalisation ──────────────────────────

const FRONTEND_TO_BACKEND_MAP: Record<string, string> = {
  SCOOTER: 'scooter',
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

function extractCurrency(data: unknown): CurrencyConfig {
  if (data && typeof data === 'object') {
    const obj = data as Record<string, unknown>;
    const c = obj['currency'] as Record<string, unknown> | undefined;
    if (c && typeof c.symbol === 'string') {
      return {
        code: typeof c.code === 'string' ? c.code : DEFAULT_CURRENCY.code,
        symbol: c.symbol,
        symbolAr: typeof c.symbolAr === 'string' ? c.symbolAr : c.symbol,
      };
    }
  }
  return DEFAULT_CURRENCY;
}

export function ServiceControlProvider({ children }: { children: React.ReactNode }) {
  const { token, isLoading: authIsLoading } = useAuth();
  const { socket } = useSocket();
  const [services, setServices] = useState<ServiceControl[]>([]);
  const [eligibilityRules, setEligibilityRules] = useState<EligibilityRule[]>([]);
  const [currency, setCurrency] = useState<CurrencyConfig>(DEFAULT_CURRENCY);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // ── Initial fetch ─────────────────────────────────────────────────────

  useEffect(() => {
    if (authIsLoading) return;

    if (!token) {
      setServices([]);
      setEligibilityRules([]);
      setIsLoading(false);
      setError(null);
      return;
    }

    setIsLoading(true);
    setError(null);

    api.get<unknown>('/services/control')
      .then((data) => {
        setServices(extractServiceList(data));
        setCurrency(extractCurrency(data));
      })
      .catch(() => {
        setError('Could not load service configuration.');
        setServices([]);
      })
      .finally(() => setIsLoading(false));
  }, [token, authIsLoading]);

  // ── Shared socket — real-time patches ────────────────────────────────
  // Subscribes to the single shared socket from SocketProvider.
  // No second connection is created here.

  useEffect(() => {
    if (!socket) return;

    const handleServiceChanged = (raw: unknown) => {
      const parsed = ServiceControlEventSchema.safeParse(raw);
      if (!parsed.success) {
        console.warn(`[Socket] Invalid ${SOCKET_EVENTS.SERVICE_CONTROL_CHANGED} payload`, parsed.error.issues);
        return;
      }
      const payload = parsed.data;
      setServices((prev) => {
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
    };

    const handleSettingsChanged = (raw: unknown) => {
      const parsed = ServiceSettingsEventSchema.safeParse(raw);
      if (!parsed.success) {
        console.warn(`[Socket] Invalid ${SOCKET_EVENTS.SERVICE_SETTINGS_CHANGED} payload`, parsed.error.issues);
        return;
      }
      const payload = parsed.data;
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
    };

    socket.on(SOCKET_EVENTS.SERVICE_CONTROL_CHANGED, handleServiceChanged);
    socket.on(SOCKET_EVENTS.SERVICE_SETTINGS_CHANGED, handleSettingsChanged);

    return () => {
      socket.off(SOCKET_EVENTS.SERVICE_CONTROL_CHANGED, handleServiceChanged);
      socket.off(SOCKET_EVENTS.SERVICE_SETTINGS_CHANGED, handleSettingsChanged);
    };
  }, [socket]);

  // ── Refresh ───────────────────────────────────────────────────────────

  const refresh = useCallback(async (): Promise<void> => {
    if (authIsLoading || !token) return;
    try {
      const data = await api.get<unknown>('/services/control');
      setServices(extractServiceList(data));
      setCurrency(extractCurrency(data));
      setError(null);
    } catch {
      setError('Could not load service configuration.');
      setServices([]);
    }
  }, [token, authIsLoading]);

  // ── Eligibility engine — FAIL-SECURE ─────────────────────────────────

  const getServiceStatus = useCallback(
    (serviceType: string, driver?: DriverSnapshot | null): ServiceStatus => {

      if (isLoading) return LOADING_BLOCKED;
      if (error) return ERROR_BLOCKED;

      const backendType = normalizeToBackendType(serviceType);
      const ctrl = services.find((s) => s.serviceType.toLowerCase() === backendType);
      if (!ctrl) return CONFIG_BLOCKED;

      if (!ctrl.isEnabled) {
        return { visible: false, available: false, displayMode: ctrl.displayMode };
      }

      const base = { visible: true, available: false, displayMode: ctrl.displayMode };

      if (ctrl.displayMode === 'coming_soon') {
        return { ...base, message: ctrl.message ?? 'Coming soon' };
      }
      if (ctrl.displayMode === 'unavailable') {
        return { ...base, message: ctrl.message ?? 'Currently unavailable' };
      }
      if (ctrl.displayMode === 'maintenance') {
        return { ...base, message: ctrl.message ?? 'Under maintenance', eta: ctrl.eta };
      }

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
    [services, eligibilityRules, isLoading, error],
  );

  return (
    <ServiceControlContext.Provider
      value={{ services, eligibilityRules, currency, isLoading, error, getServiceStatus, refresh }}
    >
      {children}
    </ServiceControlContext.Provider>
  );
}

export function useServiceControl() {
  return useContext(ServiceControlContext);
}
