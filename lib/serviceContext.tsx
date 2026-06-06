import React, { createContext, useContext, useState, useEffect } from 'react';
import { useColorScheme } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';

export type ServiceType = 'CAR' | 'MOTOR' | 'DELIVERY' | 'SHUTTLE';

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
  const [serviceType, setServiceTypeState] = useState<ServiceType>('CAR');
  const [isDarkMode, setIsDarkModeState] = useState<boolean>(systemScheme === 'dark');
  const [loaded, setLoaded] = useState(false);

  // Load persisted theme AND service type on mount
  useEffect(() => {
    Promise.all([
      AsyncStorage.getItem('veego_theme'),
      AsyncStorage.getItem('veego_service_type'),
    ]).then(([storedTheme, storedService]) => {
      if (storedTheme !== null) setIsDarkModeState(storedTheme === 'dark');
      if (storedService !== null) setServiceTypeState(storedService as ServiceType);
      setLoaded(true);
    }).catch(() => setLoaded(true));
  }, []);

  const setServiceType = (t: ServiceType) => {
    setServiceTypeState(t);
    AsyncStorage.setItem('veego_service_type', t).catch(() => {});
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