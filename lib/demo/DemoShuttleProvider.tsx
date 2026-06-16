import React, { useReducer, useEffect, useRef, useState, useMemo, useCallback } from 'react';
import { ShuttleContext } from '@/lib/shuttleContext';
import type { BoardingPassenger, ShuttleStop } from '@/lib/shuttleContext';
import { haversineMeters } from '@/hooks/useDriverLocation';
import {
  DEMO_LINE, DEMO_BOOKING, DEMO_ROUTE,
  DEMO_STOPS_TEMPLATE, DEMO_PASSENGERS_TEMPLATE, DEMO_STATION_COORDS,
} from './mockData';
import { demoReducer, DEMO_INITIAL_STATE } from './demoEngine';
import { useDemoMode } from './DemoContext';

// ── Smooth path interpolation ────────────────────────────────────────────────
function interpolatePath(
  from: { latitude: number; longitude: number },
  to: { latitude: number; longitude: number },
  steps: number,
): Array<{ latitude: number; longitude: number }> {
  return Array.from({ length: steps }, (_, i) => {
    const t = (i + 1) / steps;
    return {
      latitude:  from.latitude  + (to.latitude  - from.latitude)  * t,
      longitude: from.longitude + (to.longitude - from.longitude) * t,
    };
  });
}

// ── Provider ─────────────────────────────────────────────────────────────────
export function DemoShuttleProvider({ children }: { children: React.ReactNode }) {
  const { demoSpeed } = useDemoMode();
  const [state, dispatch] = useReducer(demoReducer, DEMO_INITIAL_STATE);

  // stationCoords / stops / passengers are stable references (no network fetch)
  const stationCoords = DEMO_STATION_COORDS;

  // ── Simulated GPS ──────────────────────────────────────────────────────────
  const simPosRef   = useRef<{ latitude: number; longitude: number } | null>(null);
  const pathQueueRef = useRef<Array<{ latitude: number; longitude: number }>>([]);
  const intervalRef  = useRef<ReturnType<typeof setInterval> | null>(null);

  const [demoDriverPosition, setDemoDriverPosition] = useState<{
    latitude: number; longitude: number; heading: number | null; speed: number | null;
  } | null>(null);

  useEffect(() => {
    if (intervalRef.current) { clearInterval(intervalRef.current); intervalRef.current = null; }

    const target = stationCoords[state.currentStopIndex];
    if (!target) { simPosRef.current = null; setDemoDriverPosition(null); return; }

    // Start from previous station; for first stop, start 600 m behind on the route axis
    const prev = stationCoords[state.currentStopIndex - 1];
    let startPoint: { latitude: number; longitude: number };
    if (prev) {
      startPoint = { latitude: prev.latitude, longitude: prev.longitude };
    } else {
      const next = stationCoords[1];
      if (next) {
        const dLat = target.latitude - next.latitude;
        const dLng = target.longitude - next.longitude;
        const mag = Math.sqrt(dLat * dLat + dLng * dLng) || 1e-9;
        const ratio = 0.006 / mag;
        startPoint = { latitude: target.latitude + dLat * ratio, longitude: target.longitude + dLng * ratio };
      } else {
        startPoint = { latitude: target.latitude + 0.006, longitude: target.longitude };
      }
    }

    const totalDist = haversineMeters(startPoint.latitude, startPoint.longitude, target.latitude, target.longitude);
    const stepCount = Math.max(15, Math.min(60, Math.round(totalDist / 25)));
    // Drive all the way to the station marker
    pathQueueRef.current = interpolatePath(startPoint, target, stepCount);

    simPosRef.current = startPoint;
    setDemoDriverPosition({ ...startPoint, heading: null, speed: 8.33 * demoSpeed });

    const tickMs = Math.round(1500 / demoSpeed);
    intervalRef.current = setInterval(() => {
      const q = pathQueueRef.current;
      if (!q.length) { clearInterval(intervalRef.current!); intervalRef.current = null; return; }
      const nxt = q.shift()!;
      const cur = simPosRef.current;
      const movedM = cur ? haversineMeters(cur.latitude, cur.longitude, nxt.latitude, nxt.longitude) : 0;
      const speed = movedM / (tickMs / 1000);
      simPosRef.current = nxt;
      setDemoDriverPosition({ ...nxt, heading: null, speed });
    }, tickMs);

    return () => { if (intervalRef.current) { clearInterval(intervalRef.current); intervalRef.current = null; } };
  }, [state.currentStopIndex, demoSpeed]); // stationCoords is a module-level constant — stable

  // ── Passengers ────────────────────────────────────────────────────────────
  const checkedInMap = state.checkedInByStop[state.currentStopIndex] ?? {};
  const passengers: BoardingPassenger[] = useMemo(
    () => (DEMO_PASSENGERS_TEMPLATE[state.currentStopIndex] ?? []).map(p => ({
      ...p, checkedIn: checkedInMap[p.id] ?? false,
    })),
    [state.currentStopIndex, checkedInMap],
  );

  // ── Stops ─────────────────────────────────────────────────────────────────
  const stops: ShuttleStop[] = useMemo(
    () => DEMO_STOPS_TEMPLATE.map((t, i) => ({
      ...t,
      boarded:  i === state.currentStopIndex ? passengers.filter(p => p.checkedIn).length : 0,
      expected: i === state.currentStopIndex ? passengers.length : 0,
      status:   i < state.currentStopIndex ? 'completed' : i === state.currentStopIndex ? 'arrived' : 'pending',
    })),
    [state.currentStopIndex, passengers],
  );

  const nextStop = useCallback(() => dispatch({ type: 'NEXT_STOP' }), []);
  const togglePassenger = useCallback((id: string) =>
    dispatch({ type: 'TOGGLE_PASSENGER', id, stopIndex: state.currentStopIndex }),
    [state.currentStopIndex],
  );

  return (
    <ShuttleContext.Provider value={{
      routes: [DEMO_ROUTE],
      myBookings: [DEMO_BOOKING],
      renewalBooking: null,
      activeLine: DEMO_LINE,
      allLines: [DEMO_LINE],
      stops,
      currentStopIndex: state.currentStopIndex,
      passengers,
      loading: false,
      listLoading: false,
      error: null,
      refetch: () => {},
      nextStop,
      togglePassenger,
      tripCancelledBanner: null,
      dismissTripCancelledBanner: () => {},
      startedTripId: DEMO_LINE.tripId ?? null,
      setStartedTripId: () => {},
      stationCoords,
      resetTrip: () => dispatch({ type: 'RESET' }),
      slotReleasedAlert: null,
      dismissSlotReleasedAlert: () => {},
      demoDriverPosition,
    } as any}>
      {children}
    </ShuttleContext.Provider>
  );
}
