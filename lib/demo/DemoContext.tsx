import React, { createContext, useContext, useState } from 'react';

type DemoContextType = {
  isDemoMode: boolean;
  enterDemoMode: () => void;
  exitDemoMode: () => void;
};

const DemoContext = createContext<DemoContextType>({
  isDemoMode: false,
  enterDemoMode: () => {},
  exitDemoMode: () => {},
});

export function DemoModeProvider({ children }: { children: React.ReactNode }) {
  const [isDemoMode, setIsDemoMode] = useState(false);

  return (
    <DemoContext.Provider
      value={{
        isDemoMode,
        enterDemoMode: () => setIsDemoMode(true),
        exitDemoMode: () => setIsDemoMode(false),
      }}
    >
      {children}
    </DemoContext.Provider>
  );
}

export function useDemoMode() {
  return useContext(DemoContext);
}
