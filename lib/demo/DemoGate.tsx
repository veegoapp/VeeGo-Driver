import React from 'react';
import { ShuttleProvider } from '@/lib/shuttleContext';
import { useDemoMode } from './DemoContext';
import { DemoShuttleProvider } from './DemoShuttleProvider';

// Transparent pass-through when isDemoMode is false — renders the real
// ShuttleProvider with zero overhead. When demo mode is active, swaps in
// DemoShuttleProvider which provides an identical context shape backed by
// local reducer state instead of the backend.
export function DemoGate({ children }: { children: React.ReactNode }) {
  const { isDemoMode } = useDemoMode();

  if (isDemoMode) {
    return <DemoShuttleProvider>{children}</DemoShuttleProvider>;
  }
  return <ShuttleProvider>{children}</ShuttleProvider>;
}
