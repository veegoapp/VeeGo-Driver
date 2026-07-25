import React, { createContext, useContext, useState, useEffect } from 'react';
import { useColorScheme } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useAuth } from './authContext';
import { getUserIdFromToken } from './auth';
import { onServiceTypeFromBackend } from './serviceTypeBridge';

export type ServiceType = 'CAR' | 'SCOOTER' | 'DELIVERY' | 'SHUTTLE';

// Per-user map key — value is JSON: { [userId]: ServiceType }
const SERVICE_MAP_KEY = 'veego_service_map';
// Device-level fallback — written on every save so navigateAfterAuth can
// always find a service type even when the JWT has no parseable id claim.
const DEVICE_SERVICE_KEY = 'veego_device_service';

type ServiceContextValue = {
  serviceType: ServiceType;
  setServiceType: (t: ServiceType) => void;
  isDarkMode: boolean;
  setIsDarkMode: (v: boolean) => void;
};

const ServiceContext = createContext<ServiceContextValue>({
  serviceType: 'CAR',
  setServiceType: () => {},
  isDarkMode: false,
  setIsDarkMode: () => {},
});

export function ServiceProvider({ children }: { children: React.ReactNode }) {
  const systemScheme = useColorScheme();
  const { token } = useAuth();
  const userId = getUserIdFromToken(token);

  const [serviceType, setServiceTypeState] = useState<ServiceType>('SHUTTLE');
  const [isDarkMode, setIsDarkModeState] = useState<boolean>(false);
  const [loaded, setLoaded] = useState(false);

  // Re-load whenever the logged-in user changes (login / logout / account switch).
  // On logout userId becomes null → service type resets to initial state.
  // On a new login userId changes → the new user's stored choice is loaded.
  useEffect(() => {
    setLoaded(false);
    setServiceTypeState('SHUTTLE');

    Promise.all([
      AsyncStorage.getItem('veego_theme'),
      userId ? AsyncStorage.getItem(SERVICE_MAP_KEY) : Promise.resolve(null),
      AsyncStorage.getItem(DEVICE_SERVICE_KEY),
    ]).then(([storedTheme, mapJson, deviceService]) => {
      if (storedTheme === 'dark') AsyncStorage.setItem('veego_theme', 'light').catch(() => {});

      // One-time migration: 'MOTOR' was renamed to 'SCOOTER' in the app.
      const migrate = (v: string | null | undefined): ServiceType | null => {
        if (!v) return null;
        return (v === 'MOTOR' ? 'SCOOTER' : v) as ServiceType;
      };

      // Priority 1: per-user map entry (most reliable — set by backend on login)
      let resolvedService: ServiceType | null = null;
      if (userId && mapJson) {
        const map = JSON.parse(mapJson) as Record<string, string>;
        const raw = map[userId] ?? null;
        resolvedService = migrate(raw);
        if (raw === 'MOTOR') {
          map[userId] = 'SCOOTER';
          AsyncStorage.setItem(SERVICE_MAP_KEY, JSON.stringify(map)).catch(() => {});
        }
      }

      // Priority 2: device-level fallback only when userId is unknown (e.g. JWT
      // has no parseable id claim). Never use another user's stored type as a
      // guess — the backend bridge event (onServiceTypeFromBackend) will fire
      // shortly after login with the authoritative value.
      if (!resolvedService && !userId) {
        resolvedService = migrate(deviceService);
        if (deviceService === 'MOTOR') {
          AsyncStorage.setItem(DEVICE_SERVICE_KEY, 'SCOOTER').catch(() => {});
        }
      }

      if (resolvedService) {
        setServiceTypeState(resolvedService);
      }
      // If no stored preference exists for this user, leave as-is — the bridge
      // event from navigateToHome will update the state once the backend responds.

      setLoaded(true);
    }).catch(() => setLoaded(true));
  }, [userId]);

  // Subscribe to the backend bridge so navigateToHome can push the authoritative
  // service type directly into this context without a storage race condition.
  useEffect(() => {
    const unsub = onServiceTypeFromBackend((backendType) => {
      setServiceTypeState(backendType);
      // Also persist to per-user map for next cold start
      AsyncStorage.setItem(DEVICE_SERVICE_KEY, backendType).catch(() => {});
      if (userId) {
        AsyncStorage.getItem(SERVICE_MAP_KEY)
          .then(json => {
            const map: Record<string, ServiceType> = json ? JSON.parse(json) : {};
            map[userId] = backendType;
            return AsyncStorage.setItem(SERVICE_MAP_KEY, JSON.stringify(map));
          })
          .catch(() => {});
      }
    });
    return unsub;
  }, [userId]);

  // Write service type to BOTH storage locations:
  //  - Per-user map (when userId is available) — multi-account safe.
  //  - Device-level fallback — always written so navigateAfterAuth never
  //    misses the value even when the JWT has no parseable id claim.
  const setServiceType = (t: ServiceType) => {
    setServiceTypeState(t);

    // Always write device fallback
    AsyncStorage.setItem(DEVICE_SERVICE_KEY, t).catch(() => {});

    // Also write per-user map when userId is available
    if (!userId) return;
    AsyncStorage.getItem(SERVICE_MAP_KEY)
      .then((mapJson) => {
        const map: Record<string, ServiceType> = mapJson ? JSON.parse(mapJson) : {};
        map[userId] = t;
        return AsyncStorage.setItem(SERVICE_MAP_KEY, JSON.stringify(map));
      })
      .catch(() => {});
  };

  const setIsDarkMode = (v: boolean) => {
    setIsDarkModeState(v);
    AsyncStorage.setItem('veego_theme', v ? 'dark' : 'light').catch(() => {});
  };

  if (!loaded) return null;

  return (
    <ServiceContext.Provider value={{ serviceType, setServiceType, isDarkMode, setIsDarkMode }}>
      {children}
    </ServiceContext.Provider>
  );
}

export function useService() {
  return useContext(ServiceContext);
}
