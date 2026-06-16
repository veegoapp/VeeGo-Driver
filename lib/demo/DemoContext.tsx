import React, { createContext, useContext, useState } from 'react';

export type DemoSpeed = 1 | 2 | 5;

type DemoContextType = {
  isDemoMode: boolean;
  enterDemoMode: () => void;
  exitDemoMode: () => void;
  demoSpeed: DemoSpeed;
  setDemoSpeed: (s: DemoSpeed) => void;
};

const DemoContext = createContext<DemoContextType>({
  isDemoMode: false,
  enterDemoMode: () => {},
  exitDemoMode: () => {},
  demoSpeed: 1,
  setDemoSpeed: () => {},
});

export function DemoModeProvider({ children }: { children: React.ReactNode }) {
  const [isDemoMode, setIsDemoMode] = useState(false);
  const [demoSpeed, setDemoSpeed] = useState<DemoSpeed>(1);
  return (
    <DemoContext.Provider value={{
      isDemoMode,
      enterDemoMode: () => setIsDemoMode(true),
      exitDemoMode:  () => setIsDemoMode(false),
      demoSpeed,
      setDemoSpeed,
    }}>
      {children}
    </DemoContext.Provider>
  );
}

export function useDemoMode() {
  return useContext(DemoContext);
}
