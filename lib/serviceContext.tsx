import React, { createContext, useContext, useState, useEffect } from 'react';
import { useColorScheme } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useAuth } from './authContext';
import { getUserIdFromToken } from './auth';

export type ServiceType = 'CAR' | 'MOTOR' | 'DELIVERY' | 'SHUTTLE';

// Storage key for the per-user service type map: { [userId]: ServiceType }
// The legacy flat key "veego_service_type" is intentionally NOT read — it is
// device-scoped and cannot be trusted to belong to the current account.
const SERVICE_MAP_KEY = 'veego_service_map';

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

  const [serviceType, setServiceTypeState] = useState<ServiceType>('CAR');
  const [isDarkMode, setIsDarkModeState] = useState<boolean>(systemScheme === 'dark');
  const [loaded, setLoaded] = useState(false);

  // Re-load whenever the logged-in user changes (login / logout / account switch).
  // On logout userId becomes null → service type resets to default.
  // On a new login userId changes → the new user's stored choice is loaded.
  useEffect(() => {
    setLoaded(false);
    setServiceTypeState('CAR');

    Promise.all([
      AsyncStorage.getItem('veego_theme'),
      userId ? AsyncStorage.getItem(SERVICE_MAP_KEY) : Promise.resolve(null),
    ]).then(([storedTheme, mapJson]) => {
      if (storedTheme !== null) setIsDarkModeState(storedTheme === 'dark');

      if (userId && mapJson) {
        const map = JSON.parse(mapJson) as Record<string, ServiceType>;
        if (map[userId]) {
          setServiceTypeState(map[userId]);
        }
      }

      setLoaded(true);
    }).catch(() => setLoaded(true));
  }, [userId]);

  // Write service type under the current user's identity only.
  const setServiceType = (t: ServiceType) => {
    setServiceTypeState(t);
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
