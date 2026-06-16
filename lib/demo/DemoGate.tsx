import React from 'react';
import { useDemoMode } from './DemoContext';
import { DemoShuttleProvider } from './DemoShuttleProvider';

export function DemoGate({ children }: { children: React.ReactNode }) {
  const { isDemoMode } = useDemoMode();
  if (isDemoMode) return <DemoShuttleProvider>{children}</DemoShuttleProvider>;
  return <>{children}</>;
}
